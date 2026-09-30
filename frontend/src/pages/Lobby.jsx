import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Video, VideoOff, Mic, MicOff, ArrowRight, Copy, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Lobby() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [name, setName] = useState("");
  const [audio, setAudio] = useState(true);
  const [video, setVideo] = useState(true);
  const [meeting, setMeeting] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (user && user.name) setName(user.name);
  }, [user]);

  useEffect(() => {
    api
      .get(`/meetings/${code}`)
      .then((res) => setMeeting(res.data))
      .catch(() => setMeeting({ missing: true }));
  }, [code]);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = video));
  }, [video]);
  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = audio));
  }, [audio]);

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/j/${code}`);
    setCopied(true);
    toast.success("Meeting link copied");
    setTimeout(() => setCopied(false), 1500);
  };

  const join = () => {
    if (!name.trim()) return toast.error("Enter your display name");
    streamRef.current?.getTracks().forEach((t) => t.stop());
    navigate(`/room/${code}`, { state: { name: name.trim(), audio, video } });
  };

  if (meeting?.missing) {
    return (
      <div className="min-h-screen bg-[#090A0F] flex flex-col items-center justify-center text-center px-6">
        <h1 className="font-heading text-2xl text-white mb-2">Room not found</h1>
        <p className="text-slate-400 mb-6 font-mono text-sm">{code}</p>
        <Button onClick={() => navigate("/")} className="bg-[#E07A5F] hover:bg-[#D06348] text-[#090A0F]">
          Back home
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090A0F] flex items-center justify-center px-6 py-10 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 -left-40 w-[30rem] h-[30rem] rounded-full bg-[#E07A5F]/10 blur-[120px]" />
      <div className="relative z-10 w-full max-w-4xl grid lg:grid-cols-[1.4fr_1fr] gap-8 items-center">
        {/* Preview */}
        <div className="animate-fade-up">
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-[#12151E] border border-[#262A38]">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              data-testid="lobby-preview-video"
              className={`w-full h-full object-cover -scale-x-100 ${video ? "" : "hidden"}`}
            />
            {!video && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-24 h-24 rounded-full bg-[#262A38] flex items-center justify-center text-3xl font-heading font-bold text-[#E07A5F]">
                  {(name || "You").charAt(0).toUpperCase()}
                </div>
              </div>
            )}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3">
              <button
                data-testid="lobby-toggle-mic"
                onClick={() => setAudio((a) => !a)}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                  audio ? "bg-[#12151E]/90 text-white hover:bg-[#262A38]" : "bg-[#EF4444] text-white"
                }`}
              >
                {audio ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>
              <button
                data-testid="lobby-toggle-cam"
                onClick={() => setVideo((v) => !v)}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                  video ? "bg-[#12151E]/90 text-white hover:bg-[#262A38]" : "bg-[#EF4444] text-white"
                }`}
              >
                {video ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Join panel */}
        <div className="animate-fade-up" style={{ animationDelay: "0.1s" }}>
          <p className="text-xs font-mono uppercase tracking-widest text-[#D4A373] mb-2">Ready to join</p>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold text-white leading-tight">
            {meeting?.title || "Meeting"}
          </h1>
          <button
            data-testid="lobby-copy-link"
            onClick={copyLink}
            className="mt-3 inline-flex items-center gap-2 text-sm font-mono text-slate-400 hover:text-white transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-[#10B981]" /> : <Copy className="w-4 h-4" />}
            {code}
          </button>

          <div className="mt-6 space-y-3">
            <Input
              data-testid="lobby-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && join()}
              placeholder="Your display name"
              className="h-12 bg-[#12151E] border-[#262A38] text-white focus-visible:ring-[#E07A5F]"
            />
            <Button
              data-testid="lobby-join-btn"
              onClick={join}
              className="w-full h-12 bg-[#E07A5F] hover:bg-[#D06348] text-[#090A0F] font-semibold rounded-xl"
            >
              Join meeting <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
            {meeting?.active_participants > 0 && (
              <p className="text-center text-xs font-mono text-slate-500">
                {meeting.active_participants} already in the call
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
