import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Video, Send } from "lucide-react";
import { useWebRTC } from "@/hooks/useWebRTC";
import VideoTile from "@/components/VideoTile";
import ControlBar from "@/components/ControlBar";
import SidePanel from "@/components/ChatPanel";

export default function Meeting() {
  const { code } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const joinState = location.state;
  const [elapsed, setElapsed] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState("chat");

  // If arriving without lobby state, send to lobby to pick name/devices
  useEffect(() => {
    if (!joinState) navigate(`/j/${code}`, { replace: true });
  }, [joinState, code, navigate]);

  const name = joinState?.name || "Guest";

  const {
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
    myId,
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
    activeSpeakerId,
    isRecording,
    startRecording,
    stopRecording,
    lobbyMessages,
    sendLobbyChat,
  } = useWebRTC({
    code,
    name,
    initialAudio: joinState?.audio ?? true,
    initialVideo: joinState?.video ?? true,
    onEvent: (type, who) => {
      if (type === "join") toast.info(`${who || "Someone"} joined`);
      if (type === "leave") toast.info(`${who || "Someone"} left`);
      if (type === "knock") toast.info(`${who || "Someone"} wants to join`);
      if (type === "force-mute") toast.info("You were muted by the host");
    },
  });

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const remoteList = Object.entries(participants);
  const totalCount = remoteList.length + 1;

  const gridCols = useMemo(() => {
    if (totalCount <= 1) return "grid-cols-1";
    if (totalCount === 2) return "grid-cols-1 sm:grid-cols-2";
    if (totalCount <= 4) return "grid-cols-1 sm:grid-cols-2";
    if (totalCount <= 9) return "grid-cols-2 lg:grid-cols-3";
    return "grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
  }, [totalCount]);

  const peopleForPanel = [
    { name: `${name}`, audio: audioEnabled, video: videoEnabled, self: true, isHost, handRaised },
    ...remoteList.map(([pid, p]) => ({
      peerId: pid, name: p.name, audio: p.audio, video: p.video, isHost: p.isHost, handRaised: !!hands[pid],
    })),
  ];

  const tileFor = (pid, p, local) => ({
    key: local ? "local" : pid,
    id: local ? myId : pid,
    node: (
      <VideoTile
        key={local ? "local" : pid}
        testId={local ? "local-video-tile" : `remote-video-tile-${pid}`}
        peerId={local ? myId : pid}
        stream={local ? localStream : p.stream}
        name={local ? name : p.name}
        audio={local ? audioEnabled : p.audio}
        video={local ? videoEnabled : p.video}
        isLocal={local}
        isHost={local ? isHost : p.isHost}
        isPinned={(local ? myId : pid) === pinnedPeerId}
        isActiveSpeaker={(local ? myId : pid) === activeSpeakerId}
        handRaised={local ? handRaised : !!hands[pid]}
        canHostControl={isHost}
        onMute={hostMute}
        onRemove={hostRemove}
        onPin={pinParticipant}
      />
    ),
  });

  const allTiles = [
    tileFor(null, null, true),
    ...remoteList.map(([pid, p]) => tileFor(pid, p, false)),
  ];
  const spotlightId = pinnedPeerId || (totalCount >= 3 ? activeSpeakerId : null);
  const pinnedNode = spotlightId ? allTiles.find((t) => t.id === spotlightId) : null;
  const pinnedTile = pinnedNode ? pinnedNode.node : null;
  const filmstrip = pinnedNode ? allTiles.filter((t) => t.id !== spotlightId) : [];

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/j/${code}`);
    toast.success("Meeting link copied");
  };

  const toggleRecord = async () => {
    try {
      if (isRecording) {
        await stopRecording();
        toast.success("Recording saved — downloading .webm");
      } else {
        await startRecording();
        toast.success("Recording started");
      }
    } catch (e) {
      toast.error("Recording failed to start");
    }
  };

  const leave = () => {
    navigate("/");
  };

  const fmtTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const openPanel = (tab) => {
    setPanelTab(tab);
    setPanelOpen(true);
  };

  if (gateState === "waiting") {
    return (
      <GateScreen
        title="Waiting for the host"
        subtitle="You'll join the moment the host lets you in."
        code={code}
        spinner
        onCancel={() => navigate("/")}
        lobbyMessages={lobbyMessages}
        onSendLobby={(t) => sendLobbyChat(t)}
      />
    );
  }
  if (gateState === "denied") {
    return (
      <GateScreen
        title="Not admitted"
        subtitle="The host declined your request to join this meeting."
        onCancel={() => navigate("/")}
        cancelLabel="Back home"
      />
    );
  }
  if (gateState === "removed") {
    return (
      <GateScreen
        title="You left the meeting"
        subtitle="You were removed from this meeting by the host."
        onCancel={() => navigate("/")}
        cancelLabel="Back home"
      />
    );
  }

  return (
    <div className="relative h-screen bg-[#090A0F] flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="shrink-0 h-14 px-4 sm:px-6 flex items-center justify-between border-b border-[#262A38]/60">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-[#E07A5F] flex items-center justify-center">
            <Video className="w-4 h-4 text-[#090A0F]" strokeWidth={2.5} />
          </div>
          <span className="hidden sm:block font-heading font-semibold text-white text-sm">
            Engraved Word
          </span>
          <span className="text-slate-600">·</span>
          <span className="font-mono text-xs text-slate-400">{code}</span>
        </div>
        <div className="flex items-center gap-3">
          {isRecording && (
            <span className="flex items-center gap-1.5 text-xs font-mono text-[#EF4444]" data-testid="recording-indicator">
              <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse" /> REC
            </span>
          )}
          <span
            className={`flex items-center gap-1.5 text-xs font-mono ${
              status === "connected" ? "text-[#10B981]" : "text-[#D4A373]"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                status === "connected" ? "bg-[#10B981] animate-pulse-ring" : "bg-[#D4A373]"
              }`}
            />
            {status === "connected" ? "Live" : status === "error" ? "Reconnecting" : "Connecting"}
          </span>
          <span className="font-mono text-xs text-slate-400">{fmtTime(elapsed)}</span>
        </div>
      </header>

      {isHost && knocks.length > 0 && (
        <div className="absolute top-16 right-4 z-40 w-80 space-y-2 max-h-[80vh] overflow-y-auto" data-testid="knock-panel">
          {knocks.map((k) => (
            <KnockCard
              key={k.peerId}
              knock={k}
              messages={lobbyMessages.filter((m) => m.peerId === k.peerId)}
              onAdmit={() => admit(k.peerId)}
              onDeny={() => deny(k.peerId)}
              onSend={(t) => sendLobbyChat(t, k.peerId)}
            />
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        <main className="relative flex-1 overflow-y-auto p-3 sm:p-5">
          {/* Floating reactions */}
          <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
            {reactions.map((r) => (
              <div
                key={r.id}
                className="absolute bottom-8 text-4xl animate-fade-up"
                style={{ left: `${15 + (parseInt(r.id.slice(0, 4), 36) % 70)}%` }}
              >
                {r.emoji}
              </div>
            ))}
          </div>

          {pinnedTile ? (
            <div className="h-full flex flex-col gap-3">
              <div className="flex-1 min-h-0 [&>div]:h-full [&>div]:aspect-auto">{pinnedTile}</div>
              {filmstrip.length > 0 && (
                <div className="shrink-0 flex gap-3 overflow-x-auto pb-1">
                  {filmstrip.map((t) => (
                    <div key={t.key} className="w-44 sm:w-52 shrink-0">
                      {t.node}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className={`grid ${gridCols} gap-3 sm:gap-4 h-full auto-rows-fr`}>
              {allTiles.map((t) => t.node)}
            </div>
          )}

          {totalCount === 1 && !pinnedTile && (
            <div className="mt-6 text-center">
              <p className="text-slate-500 text-sm font-mono">
                You're the only one here — share the code to invite others.
              </p>
            </div>
          )}
        </main>

        <SidePanel
          open={panelOpen}
          tab={panelTab}
          setTab={setPanelTab}
          onClose={() => setPanelOpen(false)}
          messages={messages}
          participants={peopleForPanel}
          selfName={name}
          onSend={sendChat}
        />
      </div>

      {/* Controls */}
      <footer className="shrink-0 p-3 sm:p-4 flex justify-center">
        <ControlBar
          audioEnabled={audioEnabled}
          videoEnabled={videoEnabled}
          screenSharing={screenSharing}
          handRaised={handRaised}
          participantCount={totalCount}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onToggleScreen={toggleScreenShare}
          onToggleChat={() => openPanel("chat")}
          onToggleParticipants={() => openPanel("people")}
          onCopyLink={copyLink}
          onLeave={leave}
          onRaiseHand={raiseHand}
          onReact={sendReaction}
          canRecord={isHost}
          isRecording={isRecording}
          onToggleRecord={toggleRecord}
        />
      </footer>
    </div>
  );
}

function GateScreen({ title, subtitle, code, spinner, onCancel, cancelLabel = "Cancel", lobbyMessages, onSendLobby }) {
  const [text, setText] = useState("");
  const submit = (e) => {
    e.preventDefault();
    if (text.trim()) {
      onSendLobby(text);
      setText("");
    }
  };
  return (
    <div className="min-h-screen bg-[#090A0F] flex flex-col items-center justify-center text-center px-6">
      {spinner && (
        <div className="w-10 h-10 rounded-full border-2 border-[#262A38] border-t-[#E07A5F] animate-spin mb-6" />
      )}
      <h1 className="font-heading text-2xl sm:text-3xl font-semibold text-white mb-2">{title}</h1>
      <p className="text-slate-400 mb-2 max-w-sm">{subtitle}</p>
      {code && <p className="font-mono text-xs text-slate-600 mb-4">{code}</p>}
      {onSendLobby && (
        <div className="mt-4 w-full max-w-sm rounded-2xl border border-[#262A38] bg-[#12151E] p-4 text-left" data-testid="lobby-chat">
          <p className="text-xs font-mono uppercase tracking-widest text-[#D4A373] mb-3">Message the host</p>
          <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
            {(lobbyMessages || []).length === 0 && (
              <p className="text-xs text-slate-600 font-mono">Say hi while you wait…</p>
            )}
            {(lobbyMessages || []).map((m, i) => (
              <div key={i} className={`flex flex-col ${m.fromHost ? "items-start" : "items-end"}`}>
                <span className="text-[10px] font-mono text-slate-500 mb-0.5">
                  {m.fromHost ? m.name || "Host" : "You"}
                </span>
                <div
                  className={`px-3 py-1.5 rounded-2xl text-sm ${
                    m.fromHost
                      ? "bg-[#1a1e29] text-slate-200 rounded-bl-sm"
                      : "bg-[#E07A5F] text-[#090A0F] rounded-br-sm"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={submit} className="flex gap-2">
            <input
              data-testid="lobby-chat-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a message"
              className="flex-1 h-10 px-3 rounded-lg bg-[#090A0F] border border-[#262A38] text-white text-sm outline-none focus:border-[#E07A5F]"
            />
            <button
              data-testid="lobby-chat-send"
              type="submit"
              className="w-10 h-10 shrink-0 rounded-lg bg-[#E07A5F] hover:bg-[#D06348] text-[#090A0F] flex items-center justify-center"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
      <button
        data-testid="gate-cancel-btn"
        onClick={onCancel}
        className="mt-6 h-11 px-6 rounded-xl bg-[#1a1e29] hover:bg-[#262A38] border border-[#262A38] text-white text-sm transition-colors"
      >
        {cancelLabel}
      </button>
    </div>
  );
}

function KnockCard({ knock, messages, onAdmit, onDeny, onSend }) {
  const [text, setText] = useState("");
  const submit = (e) => {
    e.preventDefault();
    if (text.trim()) {
      onSend(text);
      setText("");
    }
  };
  return (
    <div className="rounded-xl border border-[#262A38] bg-[#12151E] p-3 shadow-2xl animate-fade-up">
      <p className="text-sm text-white mb-2">
        <span className="font-semibold">{knock.name}</span> wants to join
      </p>
      <div className="flex gap-2 mb-2">
        <button
          data-testid={`admit-${knock.peerId}`}
          onClick={onAdmit}
          className="flex-1 h-9 rounded-lg bg-[#10B981] hover:bg-[#0ea371] text-[#090A0F] text-sm font-semibold transition-colors"
        >
          Admit
        </button>
        <button
          data-testid={`deny-${knock.peerId}`}
          onClick={onDeny}
          className="flex-1 h-9 rounded-lg bg-[#1a1e29] hover:bg-[#262A38] text-slate-300 text-sm transition-colors"
        >
          Deny
        </button>
      </div>
      {messages.length > 0 && (
        <div className="space-y-1.5 max-h-32 overflow-y-auto mb-2">
          {messages.map((m, i) => (
            <div key={i} className={`flex flex-col ${m.fromHost ? "items-end" : "items-start"}`}>
              <div
                className={`px-2.5 py-1 rounded-xl text-xs ${
                  m.fromHost ? "bg-[#E07A5F] text-[#090A0F]" : "bg-[#1a1e29] text-slate-200"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="flex gap-1.5">
        <input
          data-testid={`lobby-reply-input-${knock.peerId}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Reply…"
          className="flex-1 h-8 px-2.5 rounded-lg bg-[#090A0F] border border-[#262A38] text-white text-xs outline-none focus:border-[#E07A5F]"
        />
        <button
          data-testid={`lobby-reply-send-${knock.peerId}`}
          type="submit"
          className="w-8 h-8 shrink-0 rounded-lg bg-[#1a1e29] hover:bg-[#262A38] text-slate-200 flex items-center justify-center"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
