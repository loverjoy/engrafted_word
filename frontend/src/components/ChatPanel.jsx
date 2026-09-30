import { useEffect, useRef, useState } from "react";
import { X, Send, MicOff, Hand } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function SidePanel({
  open,
  tab,
  setTab,
  onClose,
  messages,
  participants,
  selfName,
  onSend,
}) {
  const [text, setText] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, tab]);

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText("");
  };

  const fmt = (ts) => {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <div
      data-testid="side-panel"
      className={`fixed lg:relative top-0 right-0 h-full w-full sm:w-[360px] lg:w-[340px] bg-[#0d0f16] border-l border-[#262A38] z-40 flex flex-col transition-transform duration-300 ${
        open ? "translate-x-0" : "translate-x-full lg:hidden"
      }`}
    >
      <div className="flex items-center justify-between px-4 h-14 border-b border-[#262A38]">
        <div className="flex gap-1">
          <button
            data-testid="panel-tab-chat"
            onClick={() => setTab("chat")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === "chat" ? "bg-[#1a1e29] text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            Chat
          </button>
          <button
            data-testid="panel-tab-people"
            onClick={() => setTab("people")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === "people" ? "bg-[#1a1e29] text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            People ({participants.length})
          </button>
        </div>
        <button
          data-testid="panel-close-btn"
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#1a1e29]"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {tab === "chat" ? (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <p className="text-center text-sm text-slate-600 font-mono mt-8">No messages yet</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.self ? "items-end" : "items-start"}`}>
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-xs font-medium text-[#D4A373]">{m.self ? "You" : m.name}</span>
                  <span className="text-[10px] font-mono text-slate-600">{fmt(m.ts)}</span>
                </div>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm break-words ${
                    m.self
                      ? "bg-[#E07A5F] text-[#090A0F] rounded-br-sm"
                      : "bg-[#1a1e29] text-slate-200 rounded-bl-sm"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={submit} className="p-3 border-t border-[#262A38] flex gap-2">
            <Input
              data-testid="chat-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Send a message"
              className="bg-[#12151E] border-[#262A38] text-white focus-visible:ring-[#E07A5F]"
            />
            <button
              data-testid="send-chat-btn"
              type="submit"
              className="w-10 h-10 shrink-0 rounded-lg bg-[#E07A5F] hover:bg-[#D06348] text-[#090A0F] flex items-center justify-center transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-1" data-testid="people-list">
          {participants.map((p, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#12151E]">
              <div className="w-9 h-9 rounded-full bg-[#262A38] flex items-center justify-center text-sm font-heading font-bold text-[#E07A5F]">
                {(p.name || "?").charAt(0).toUpperCase()}
              </div>
              <span className="flex-1 text-sm text-slate-200 truncate">
                {p.name}
                {p.self && " (you)"}
                {p.isHost && (
                  <span className="ml-1.5 text-[10px] font-mono uppercase tracking-wider text-[#D4A373]">host</span>
                )}
              </span>
              {p.handRaised && <Hand className="w-4 h-4 text-[#D4A373]" />}
              {!p.audio && <MicOff className="w-4 h-4 text-[#EF4444]" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
