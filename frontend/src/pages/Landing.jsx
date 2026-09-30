import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Video, ArrowRight, Radio, ShieldCheck, MessagesSquare, MonitorUp, LogOut, Plus, Grid3x3, LayoutGrid,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Landing() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);

  const createMeeting = async () => {
    if (!user) {
      toast.info("Sign in to host a meeting");
      navigate("/login");
      return;
    }
    setCreating(true);
    try {
      const { data } = await api.post("/meetings", { title: "Instant Meeting" });
      navigate(`/j/${data.code}`);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setCreating(false);
    }
  };

  const joinMeeting = () => {
    const code = joinCode.trim().toLowerCase();
    if (!code) return toast.error("Enter a room code");
    navigate(`/j/${code}`);
  };

  return (
    <div className="min-h-screen bg-[#090A0F] text-slate-200 relative overflow-hidden">
      {/* ambient glow */}
      <div className="pointer-events-none absolute -top-40 -right-40 w-[36rem] h-[36rem] rounded-full bg-[#E07A5F]/10 blur-[120px]" />
      <div className="pointer-events-none absolute top-1/2 -left-40 w-[30rem] h-[30rem] rounded-full bg-[#D4A373]/5 blur-[120px]" />

      {/* Nav */}
      <header className="relative z-10 sticky top-0 backdrop-blur-xl bg-[#090A0F]/70 border-b border-[#262A38]/60">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#E07A5F] flex items-center justify-center shadow-lg shadow-[#E07A5F]/20">
              <Video className="w-5 h-5 text-[#090A0F]" strokeWidth={2.5} />
            </div>
            <span className="font-heading font-bold text-lg tracking-tight">Engraved Word</span>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="hidden sm:block text-sm text-slate-400 font-mono">{user.name}</span>
                <Button
                  data-testid="nav-dashboard-btn"
                  variant="ghost"
                  onClick={() => navigate("/dashboard")}
                  className="text-slate-300 hover:text-white hover:bg-[#12151E]"
                >
                  <LayoutGrid className="w-4 h-4 mr-1.5" /> My meetings
                </Button>
                <Button
                  data-testid="logout-btn"
                  variant="ghost"
                  onClick={logout}
                  className="text-slate-400 hover:text-white hover:bg-[#12151E]"
                >
                  <LogOut className="w-4 h-4 mr-1.5" /> Sign out
                </Button>
              </>
            ) : (
              <Button
                data-testid="nav-signin-btn"
                onClick={() => navigate("/login")}
                variant="ghost"
                className="text-slate-300 hover:text-white hover:bg-[#12151E]"
              >
                Host Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 pt-16 pb-24">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="animate-fade-up">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#262A38] bg-[#12151E] text-xs font-mono uppercase tracking-widest text-[#D4A373] mb-6">
              <Radio className="w-3 h-3" /> Peer-to-peer · Encrypted
            </div>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
              High-fidelity
              <br />
              <span className="text-[#E07A5F]">video meetings</span>
              <br />
              worth showing up for.
            </h1>
            <p className="mt-6 text-slate-400 text-base sm:text-lg leading-relaxed max-w-md">
              Spin up a room in one click. Real camera, mic and screen share over WebRTC — with
              live chat baked in. No downloads.
            </p>

            <div className="mt-10 space-y-4 max-w-md">
              <Button
                data-testid="create-meeting-btn"
                onClick={createMeeting}
                disabled={creating}
                className="w-full h-14 text-base bg-[#E07A5F] hover:bg-[#D06348] text-[#090A0F] font-semibold rounded-xl transition-colors shadow-lg shadow-[#E07A5F]/20"
              >
                <Plus className="w-5 h-5 mr-2" strokeWidth={2.5} />
                {creating ? "Creating room…" : "New instant meeting"}
              </Button>

              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-[#262A38]" />
                <span className="text-xs font-mono text-slate-600 uppercase">or join</span>
                <div className="h-px flex-1 bg-[#262A38]" />
              </div>

              <div className="flex gap-2">
                <Input
                  data-testid="join-room-input"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && joinMeeting()}
                  placeholder="Enter room code (abc-def-ghi)"
                  className="h-14 bg-[#12151E] border-[#262A38] text-white placeholder:text-slate-600 font-mono focus-visible:ring-[#E07A5F]"
                />
                <Button
                  data-testid="join-room-btn"
                  onClick={joinMeeting}
                  variant="outline"
                  className="h-14 px-5 border-[#262A38] bg-transparent hover:bg-[#12151E] text-white"
                >
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Mock preview */}
          <div className="animate-fade-up relative" style={{ animationDelay: "0.15s" }}>
            <div className="rounded-2xl border border-[#262A38] bg-[#12151E] p-3 shadow-2xl">
              <div className="grid grid-cols-2 gap-3">
                {[
                  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?crop=entropy&cs=srgb&fm=jpg&w=400&q=70",
                  "https://images.unsplash.com/photo-1587397845856-e6cf49176c70?crop=entropy&cs=srgb&fm=jpg&w=400&q=70",
                  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?crop=entropy&cs=srgb&fm=jpg&w=400&q=70",
                  "https://images.unsplash.com/photo-1506863530036-1efeddceb993?crop=entropy&cs=srgb&fm=jpg&w=400&q=70",
                ].map((src, i) => (
                  <div
                    key={i}
                    className={`relative aspect-video rounded-lg overflow-hidden bg-[#090A0F] ${
                      i === 0 ? "ring-2 ring-[#E07A5F]/80" : ""
                    }`}
                  >
                    <img src={src} alt="participant" className="w-full h-full object-cover" />
                    <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-[10px] font-mono text-white">
                      {["You", "Maya", "Dev", "Sam"][i]}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-center gap-2 py-2">
                <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse-ring" />
                <span className="text-xs font-mono text-slate-400">4 connected · 00:12:47</span>
              </div>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="mt-28 grid sm:grid-cols-2 lg:grid-cols-4 border border-[#262A38] rounded-2xl overflow-hidden bg-[#12151E]/40">
          {[
            { icon: MonitorUp, t: "Screen share", d: "One-tap presenting with instant track swap." },
            { icon: MessagesSquare, t: "Live chat", d: "Real-time messages alongside the call." },
            { icon: Grid3x3, t: "Adaptive grid", d: "Tiles reflow from 1 to many participants." },
            { icon: ShieldCheck, t: "Room tokens", d: "Unique codes gate every meeting room." },
          ].map((f, i) => (
            <div
              key={i}
              className="p-8 border-[#262A38] [&:not(:last-child)]:border-b sm:[&:nth-child(odd)]:border-r lg:[&:not(:last-child)]:border-r sm:[&:nth-child(1)]:border-b sm:[&:nth-child(2)]:border-b"
            >
              <f.icon className="w-6 h-6 text-[#E07A5F] mb-4" />
              <h3 className="font-heading font-semibold text-white mb-1.5">{f.t}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{f.d}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
