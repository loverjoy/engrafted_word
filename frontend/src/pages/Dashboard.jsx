import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Video, Plus, Calendar, Clock, Users, Copy, Trash2, ArrowLeft, DoorOpen, Shield,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [waitingRoom, setWaitingRoom] = useState(true);
  const [invitees, setInvitees] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/meetings");
      setMeetings(data);
    } catch (e) {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    setCreating(true);
    try {
      const { data } = await api.post("/meetings", {
        title: title.trim() || "Untitled Meeting",
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        waiting_room: waitingRoom,
        invitees: invitees.split(",").map((s) => s.trim()).filter(Boolean),
      });
      toast.success("Meeting created");
      setTitle("");
      setScheduledAt("");
      setInvitees("");
      await load();
      if (!scheduledAt) navigate(`/j/${data.code}`);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setCreating(false);
    }
  };

  const remove = async (code) => {
    try {
      await api.delete(`/meetings/${code}`);
      setMeetings((m) => m.filter((x) => x.code !== code));
      toast.success("Meeting deleted");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const copyLink = (code) => {
    navigator.clipboard.writeText(`${window.location.origin}/j/${code}`);
    toast.success("Meeting link copied");
  };

  const now = Date.now();
  const upcoming = meetings
    .filter((m) => m.scheduled_at && new Date(m.scheduled_at).getTime() > now)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const past = meetings.filter((m) => !upcoming.includes(m));

  const fmt = (iso) => {
    try {
      return new Date(iso).toLocaleString([], {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div className="min-h-screen bg-[#090A0F] text-slate-200 relative">
      <div className="pointer-events-none absolute -top-40 -right-40 w-[36rem] h-[36rem] rounded-full bg-[#E07A5F]/10 blur-[120px]" />

      <header className="relative z-10 sticky top-0 backdrop-blur-xl bg-[#090A0F]/70 border-b border-[#262A38]/60">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <button
            data-testid="dashboard-back-btn"
            onClick={() => navigate("/")}
            className="flex items-center gap-2.5 text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <div className="w-8 h-8 rounded-lg bg-[#E07A5F] flex items-center justify-center">
              <Video className="w-4 h-4 text-[#090A0F]" strokeWidth={2.5} />
            </div>
            <span className="font-heading font-bold tracking-tight">Engraved Word</span>
          </button>
          <span className="text-sm text-slate-400 font-mono">{user?.name}</span>
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-6 py-10">
        <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-white">My meetings</h1>
        <p className="text-slate-400 mt-2">Create instant or scheduled rooms and manage them here.</p>

        {/* Create card */}
        <div className="mt-8 rounded-2xl border border-[#262A38] bg-[#12151E] p-6 animate-fade-up">
          <div className="grid sm:grid-cols-[1fr_auto] gap-4 items-end">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-400 text-xs font-mono uppercase tracking-widest">Title</Label>
                <Input
                  data-testid="new-meeting-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Weekly standup"
                  className="mt-2 h-11 bg-[#090A0F] border-[#262A38] text-white focus-visible:ring-[#E07A5F]"
                />
              </div>
              <div>
                <Label className="text-slate-400 text-xs font-mono uppercase tracking-widest">
                  Schedule (optional)
                </Label>
                <Input
                  data-testid="new-meeting-schedule"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="mt-2 h-11 bg-[#090A0F] border-[#262A38] text-white focus-visible:ring-[#E07A5F]"
                />
              </div>
            </div>
            <Button
              data-testid="dashboard-create-btn"
              onClick={create}
              disabled={creating}
              className="h-11 px-6 bg-[#E07A5F] hover:bg-[#D06348] text-[#090A0F] font-semibold rounded-xl"
            >
              <Plus className="w-4 h-4 mr-1.5" strokeWidth={2.5} /> Create
            </Button>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Switch
              data-testid="new-meeting-waiting-room"
              checked={waitingRoom}
              onCheckedChange={setWaitingRoom}
            />
            <span className="text-sm text-slate-400 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-[#D4A373]" /> Waiting room — approve guests before they join
            </span>
          </div>

          <div className="mt-4">
            <Label className="text-slate-400 text-xs font-mono uppercase tracking-widest">
              Invite by email (comma separated)
            </Label>
            <Input
              data-testid="new-meeting-invitees"
              value={invitees}
              onChange={(e) => setInvitees(e.target.value)}
              placeholder="ada@team.com, sam@team.com"
              className="mt-2 h-11 bg-[#090A0F] border-[#262A38] text-white focus-visible:ring-[#E07A5F]"
            />
            <p className="mt-1.5 text-xs text-slate-600">
              For scheduled meetings, invitees &amp; you get an email 30 and 10 minutes before it starts.
            </p>
          </div>
        </div>

        {loading ? (
          <p className="mt-10 text-center text-slate-500 font-mono text-sm">Loading…</p>
        ) : (
          <>
            {upcoming.length > 0 && (
              <Section title="Upcoming" icon={Calendar}>
                {upcoming.map((m) => (
                  <MeetingRow key={m.code} m={m} fmt={fmt} onJoin={() => navigate(`/j/${m.code}`)} onCopy={() => copyLink(m.code)} onDelete={() => remove(m.code)} scheduled />
                ))}
              </Section>
            )}
            <Section title="Recent & instant" icon={Clock}>
              {past.length === 0 ? (
                <p className="text-slate-600 font-mono text-sm px-1 py-4">No meetings yet.</p>
              ) : (
                past.map((m) => (
                  <MeetingRow key={m.code} m={m} fmt={fmt} onJoin={() => navigate(`/j/${m.code}`)} onCopy={() => copyLink(m.code)} onDelete={() => remove(m.code)} />
                ))
              )}
            </Section>
          </>
        )}
      </main>
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="mt-10">
      <h2 className="font-heading text-lg font-semibold text-white flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-[#E07A5F]" /> {title}
      </h2>
      <div className="rounded-2xl border border-[#262A38] bg-[#12151E]/50 divide-y divide-[#262A38]">
        {children}
      </div>
    </div>
  );
}

function MeetingRow({ m, fmt, onJoin, onCopy, onDelete, scheduled }) {
  return (
    <div className="flex items-center gap-4 px-5 py-4" data-testid={`meeting-row-${m.code}`}>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white truncate">{m.title}</p>
        <div className="flex items-center gap-3 mt-1 text-xs font-mono text-slate-500 flex-wrap">
          <span>{m.code}</span>
          {scheduled && <span className="text-[#D4A373]">{fmt(m.scheduled_at)}</span>}
          {m.active_participants > 0 && (
            <span className="flex items-center gap-1 text-[#10B981]">
              <Users className="w-3 h-3" /> {m.active_participants} live
            </span>
          )}
          {m.waiting_room && <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> waiting room</span>}
        </div>
      </div>
      <Button data-testid={`join-${m.code}`} onClick={onJoin} className="h-9 px-4 bg-[#E07A5F] hover:bg-[#D06348] text-[#090A0F] text-sm font-semibold rounded-lg">
        <DoorOpen className="w-4 h-4 mr-1" /> Join
      </Button>
      <button data-testid={`copy-${m.code}`} onClick={onCopy} className="w-9 h-9 rounded-lg bg-[#1a1e29] hover:bg-[#262A38] flex items-center justify-center text-slate-300">
        <Copy className="w-4 h-4" />
      </button>
      <button data-testid={`delete-${m.code}`} onClick={onDelete} className="w-9 h-9 rounded-lg bg-[#1a1e29] hover:bg-[#EF4444]/20 hover:text-[#EF4444] flex items-center justify-center text-slate-400">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
