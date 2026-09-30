import { useCallback, useEffect, useRef, useState } from "react";
import { WS_BASE } from "@/lib/api";
import { MeetingRecorder } from "@/lib/recorder";

const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function useWebRTC({ code, name, initialAudio, initialVideo, onEvent }) {
  const [participants, setParticipants] = useState({}); // peerId -> {name, stream, audio, video}
  const [messages, setMessages] = useState([]);
  const [localStream, setLocalStream] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(initialAudio);
  const [videoEnabled, setVideoEnabled] = useState(initialVideo);
  const [screenSharing, setScreenSharing] = useState(false);
  const [status, setStatus] = useState("connecting"); // connecting | connected | error
  const [isHost, setIsHost] = useState(false);
  const [pinnedPeerId, setPinnedPeerId] = useState(null);
  const [hands, setHands] = useState({}); // peerId -> bool
  const [reactions, setReactions] = useState([]); // {id, peerId, emoji}
  const [knocks, setKnocks] = useState([]); // {peerId, name}
  const [gateState, setGateState] = useState("connecting"); // connecting | waiting | joined | denied | removed
  const [handRaised, setHandRaised] = useState(false);
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [lobbyMessages, setLobbyMessages] = useState([]);

  const wsRef = useRef(null);
  const pcsRef = useRef({}); // peerId -> RTCPeerConnection
  const localStreamRef = useRef(null);
  const camTrackRef = useRef(null);
  const myIdRef = useRef(null);
  const namesRef = useRef({}); // peerId -> name
  const participantsRef = useRef({});
  const recorderRef = useRef(null);

  const send = (obj) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  const upsertParticipant = (peerId, patch) => {
    setParticipants((prev) => ({
      ...prev,
      [peerId]: { name: namesRef.current[peerId] || "Guest", audio: true, video: true, stream: null, isHost: false, ...prev[peerId], ...patch },
    }));
  };

  const createPeerConnection = useCallback((peerId) => {
    if (pcsRef.current[peerId]) return pcsRef.current[peerId];
    const pc = new RTCPeerConnection(ICE_CONFIG);

    const stream = localStreamRef.current;
    if (stream) stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    pc.onicecandidate = (e) => {
      if (e.candidate) send({ type: "ice", to: peerId, candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      upsertParticipant(peerId, { stream: e.streams[0] });
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(pc.connectionState)) {
        // keep tile; connection may recover via ICE
      }
    };
    pcsRef.current[peerId] = pc;
    return pc;
  }, []);

  const makeOffer = useCallback(async (peerId) => {
    const pc = createPeerConnection(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({ type: "offer", to: peerId, sdp: offer });
  }, [createPeerConnection]);

  // Init media + websocket
  useEffect(() => {
    let cancelled = false;

    async function init() {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch (e) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        } catch (e2) {
          stream = new MediaStream();
        }
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      // apply initial toggles
      stream.getAudioTracks().forEach((t) => (t.enabled = initialAudio));
      stream.getVideoTracks().forEach((t) => (t.enabled = initialVideo));
      camTrackRef.current = stream.getVideoTracks()[0] || null;
      localStreamRef.current = stream;
      setLocalStream(stream);

      const ws = new WebSocket(`${WS_BASE}/${code}`);
      wsRef.current = ws;

      ws.onopen = () => {
        send({ type: "join", name, audio: initialAudio, video: initialVideo, token: localStorage.getItem("ew_token") || "" });
      };
      ws.onclose = () => setStatus((s) => (s === "connected" ? "connected" : "error"));
      ws.onerror = () => setStatus("error");

      ws.onmessage = async (evt) => {
        const msg = JSON.parse(evt.data);
        switch (msg.type) {
          case "welcome": {
            myIdRef.current = msg.peerId;
            setStatus("connected");
            setGateState("joined");
            setIsHost(!!msg.isHost);
            if (msg.pin !== undefined) setPinnedPeerId(msg.pin);
            for (const p of msg.participants) {
              namesRef.current[p.peerId] = p.name;
              upsertParticipant(p.peerId, { name: p.name, audio: p.audio, video: p.video, isHost: p.isHost });
              if (p.handRaised) setHands((h) => ({ ...h, [p.peerId]: true }));
              await makeOffer(p.peerId);
            }
            break;
          }
          case "waiting": {
            setGateState("waiting");
            break;
          }
          case "denied": {
            setGateState("denied");
            break;
          }
          case "removed": {
            setGateState("removed");
            break;
          }
          case "knock": {
            setKnocks((k) => (k.find((x) => x.peerId === msg.peerId) ? k : [...k, { peerId: msg.peerId, name: msg.name }]));
            onEvent && onEvent("knock", msg.name);
            break;
          }
          case "force-mute": {
            setAudioEnabled(false);
            localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = false));
            const v = localStreamRef.current?.getVideoTracks()?.[0]?.enabled ?? false;
            send({ type: "media-state", audio: false, video: v });
            onEvent && onEvent("force-mute");
            break;
          }
          case "pin": {
            setPinnedPeerId(msg.peerId);
            break;
          }
          case "raise-hand": {
            setHands((h) => ({ ...h, [msg.from]: msg.raised }));
            break;
          }
          case "reaction": {
            const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
            setReactions((r) => [...r, { id, peerId: msg.from, emoji: msg.emoji }]);
            setTimeout(() => setReactions((r) => r.filter((x) => x.id !== id)), 4000);
            break;
          }
          case "lobby-chat": {
            if (msg.scope === "from-guest")
              setLobbyMessages((m) => [...m, { peerId: msg.from, name: msg.name, text: msg.text, ts: msg.ts, fromHost: false }]);
            else if (msg.scope === "from-host")
              setLobbyMessages((m) => [...m, { peerId: "host", name: msg.name, text: msg.text, ts: msg.ts, fromHost: true }]);
            break;
          }
          case "peer-joined": {
            namesRef.current[msg.peerId] = msg.name;
            upsertParticipant(msg.peerId, { name: msg.name, audio: msg.audio, video: msg.video, isHost: msg.isHost });
            setKnocks((k) => k.filter((x) => x.peerId !== msg.peerId));
            onEvent && onEvent("join", msg.name);
            break;
          }
          case "offer": {
            const pc = createPeerConnection(msg.from);
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            send({ type: "answer", to: msg.from, sdp: answer });
            break;
          }
          case "answer": {
            const pc = pcsRef.current[msg.from];
            if (pc) await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            break;
          }
          case "ice": {
            const pc = pcsRef.current[msg.from];
            if (pc && msg.candidate) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
              } catch (e) {
                /* ignore */
              }
            }
            break;
          }
          case "media-state": {
            upsertParticipant(msg.from, { audio: msg.audio, video: msg.video });
            break;
          }
          case "chat": {
            setMessages((prev) => [
              ...prev,
              { from: msg.from, name: msg.name, text: msg.text, ts: msg.ts, self: msg.from === myIdRef.current },
            ]);
            break;
          }
          case "peer-left": {
            const pc = pcsRef.current[msg.from];
            if (pc) pc.close();
            delete pcsRef.current[msg.from];
            const leftName = namesRef.current[msg.from];
            onEvent && onEvent("leave", leftName);
            setParticipants((prev) => {
              const next = { ...prev };
              delete next[msg.from];
              return next;
            });
            setHands((h) => {
              const n = { ...h };
              delete n[msg.from];
              return n;
            });
            setKnocks((k) => k.filter((x) => x.peerId !== msg.from));
            setPinnedPeerId((p) => (p === msg.from ? null : p));
            break;
          }
          default:
            break;
        }
      };
    }

    init();

    return () => {
      cancelled = true;
      send({ type: "leave" });
      Object.values(pcsRef.current).forEach((pc) => pc.close());
      pcsRef.current = {};
      if (wsRef.current) wsRef.current.close();
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  // Active speaker detection via WebAudio level analysis
  useEffect(() => {
    let ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      return;
    }
    const analysers = {}; // id -> {analyser, data, streamId}
    const ensure = (id, stream) => {
      if (!stream || !stream.getAudioTracks || !stream.getAudioTracks().length) return;
      if (analysers[id] && analysers[id].streamId === stream.id) return;
      try {
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        src.connect(an);
        analysers[id] = { analyser: an, data: new Uint8Array(an.fftSize), streamId: stream.id };
      } catch (e) {
        /* ignore */
      }
    };
    const interval = setInterval(() => {
      const localId = myIdRef.current || "local";
      ensure(localId, localStreamRef.current);
      for (const [pid, p] of Object.entries(participantsRef.current)) ensure(pid, p.stream);
      let bestId = null;
      let bestLevel = 0;
      const localMuted = !(localStreamRef.current?.getAudioTracks?.()[0]?.enabled);
      for (const [id, a] of Object.entries(analysers)) {
        if (id === localId && localMuted) continue;
        a.analyser.getByteTimeDomainData(a.data);
        let sum = 0;
        for (let i = 0; i < a.data.length; i++) sum += Math.abs(a.data[i] - 128);
        const level = sum / a.data.length;
        if (level > bestLevel) {
          bestLevel = level;
          bestId = id;
        }
      }
      setActiveSpeakerId(bestLevel > 8 ? bestId : null);
    }, 300);
    return () => {
      clearInterval(interval);
      try {
        ctx.close();
      } catch (e) {
        /* ignore */
      }
    };
  }, []);

  // Stop recording on unmount
  useEffect(
    () => () => {
      if (recorderRef.current) {
        recorderRef.current.stop().catch(() => {});
        recorderRef.current = null;
      }
    },
    []
  );

  const toggleAudio = () => {    const next = !audioEnabled;
    setAudioEnabled(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next));
    send({ type: "media-state", audio: next, video: videoEnabled });
  };

  const toggleVideo = () => {
    const next = !videoEnabled;
    setVideoEnabled(next);
    localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
    send({ type: "media-state", audio: audioEnabled, video: next });
  };

  const replaceVideoTrackOnPeers = (track) => {
    Object.values(pcsRef.current).forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (sender) sender.replaceTrack(track);
    });
  };

  const startScreenShare = async () => {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = display.getVideoTracks()[0];
      replaceVideoTrackOnPeers(screenTrack);
      const newStream = new MediaStream([
        screenTrack,
        ...(localStreamRef.current?.getAudioTracks() || []),
      ]);
      localStreamRef.current = newStream;
      setLocalStream(newStream);
      setScreenSharing(true);
      setVideoEnabled(true);
      send({ type: "media-state", audio: audioEnabled, video: true });
      screenTrack.onended = () => stopScreenShare();
    } catch (e) {
      /* user cancelled */
    }
  };

  const stopScreenShare = () => {
    const camTrack = camTrackRef.current;
    if (camTrack) {
      camTrack.enabled = videoEnabled;
      replaceVideoTrackOnPeers(camTrack);
      const newStream = new MediaStream([
        camTrack,
        ...(localStreamRef.current?.getAudioTracks() || []),
      ]);
      localStreamRef.current = newStream;
      setLocalStream(newStream);
    }
    setScreenSharing(false);
  };

  const toggleScreenShare = () => (screenSharing ? stopScreenShare() : startScreenShare());

  const sendChat = (text) => {
    if (text.trim()) send({ type: "chat", text: text.trim() });
  };

  const raiseHand = () => {
    const next = !handRaised;
    setHandRaised(next);
    send({ type: "raise-hand", raised: next });
  };
  const sendReaction = (emoji) => send({ type: "reaction", emoji });
  const admit = (pid) => {
    send({ type: "admit", peerId: pid });
    setKnocks((k) => k.filter((x) => x.peerId !== pid));
  };
  const deny = (pid) => {
    send({ type: "deny", peerId: pid });
    setKnocks((k) => k.filter((x) => x.peerId !== pid));
  };
  const hostMute = (pid) => send({ type: "host-mute", to: pid });
  const hostRemove = (pid) => send({ type: "host-remove", to: pid });
  const pinParticipant = (pid) => send({ type: "pin", peerId: pid });

  const getSources = () => {
    const list = [];
    if (localStreamRef.current)
      list.push({ stream: localStreamRef.current, name, video: !!localStreamRef.current.getVideoTracks?.()[0]?.enabled });
    for (const [, p] of Object.entries(participantsRef.current)) {
      if (p.stream) list.push({ stream: p.stream, name: p.name, video: p.video });
    }
    return list;
  };
  const startRecording = async () => {
    recorderRef.current = new MeetingRecorder(getSources);
    await recorderRef.current.start();
    setIsRecording(true);
  };
  const stopRecording = async () => {
    if (recorderRef.current) {
      await recorderRef.current.stop(`engraved-word-${code}-${Date.now()}.webm`);
      recorderRef.current = null;
    }
    setIsRecording(false);
  };
  const sendLobbyChat = (text, toPeerId) => {
    const t = (text || "").trim();
    if (!t) return;
    send({ type: "lobby-chat", text: t, ...(toPeerId ? { to: toPeerId } : {}) });
    const ts = new Date().toISOString();
    if (toPeerId)
      setLobbyMessages((m) => [...m, { peerId: toPeerId, name: "You", text: t, ts, fromHost: true }]);
    else setLobbyMessages((m) => [...m, { peerId: "host", name: "You", text: t, ts, fromHost: false }]);
  };

  return {
    participants,
    messages,
    localStream,
    audioEnabled,
    videoEnabled,
    screenSharing,
    status,
    isHost,
    pinnedPeerId,
    hands,
    reactions,
    knocks,
    gateState,
    handRaised,
    activeSpeakerId,
    isRecording,
    lobbyMessages,
    myId: myIdRef.current,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    sendChat,
    raiseHand,
    sendReaction,
    admit,
    deny,
    hostMute,
    hostRemove,
    pinParticipant,
    startRecording,
    stopRecording,
    sendLobbyChat,
  };
}
