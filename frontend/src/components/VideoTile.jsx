import { useEffect, useRef, useState } from "react";
import { MicOff, Pin, PinOff, Hand, MoreVertical, UserX } from "lucide-react";

export default function VideoTile({
  stream, name, audio, video, isLocal, testId, peerId,
  isHost, isPinned, isActiveSpeaker, handRaised, canHostControl, onMute, onRemove, onPin,
}) {
  const ref = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);

  const initial = (name || "?").charAt(0).toUpperCase();

  return (
    <div
      data-testid={testId}
      className={`relative rounded-xl overflow-hidden bg-[#12151E] border aspect-video group transition-shadow ${
        isPinned
          ? "border-[#E07A5F]/80 ring-2 ring-[#E07A5F]/40"
          : isActiveSpeaker
          ? "border-[#10B981]/70 ring-2 ring-[#10B981]/50"
          : "border-[#262A38]"
      }`}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full object-cover ${isLocal ? "-scale-x-100" : ""} ${
          video ? "" : "hidden"
        }`}
      />
      {!video && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0d0f16]">
          <div className="w-20 h-20 rounded-full bg-[#262A38] flex items-center justify-center text-2xl font-heading font-bold text-[#E07A5F]">
            {initial}
          </div>
        </div>
      )}

      {handRaised && (
        <div
          data-testid={`hand-indicator-${peerId || "local"}`}
          className="absolute top-2.5 left-2.5 w-8 h-8 rounded-lg bg-[#D4A373] flex items-center justify-center animate-fade-up"
        >
          <Hand className="w-4 h-4 text-[#090A0F]" />
        </div>
      )}

      {isPinned && !canHostControl && (
        <div className="absolute top-2.5 right-2.5 w-8 h-8 rounded-lg bg-black/55 backdrop-blur-sm flex items-center justify-center">
          <Pin className="w-4 h-4 text-[#E07A5F]" />
        </div>
      )}

      {canHostControl && !isLocal && (
        <div className="absolute top-2.5 right-2.5">
          <button
            data-testid={`tile-menu-${peerId}`}
            onClick={() => setMenuOpen((o) => !o)}
            className="w-8 h-8 rounded-lg bg-black/55 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 mt-1 w-40 rounded-lg bg-[#12151E] border border-[#262A38] shadow-2xl py-1 z-20"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button
                data-testid={`mute-${peerId}`}
                onClick={() => { onMute && onMute(peerId); setMenuOpen(false); }}
                className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-[#1a1e29] flex items-center gap-2"
              >
                <MicOff className="w-4 h-4" /> Mute
              </button>
              <button
                data-testid={`pin-${peerId}`}
                onClick={() => { onPin && onPin(isPinned ? null : peerId); setMenuOpen(false); }}
                className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-[#1a1e29] flex items-center gap-2"
              >
                {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                {isPinned ? "Unpin" : "Pin for all"}
              </button>
              <button
                data-testid={`remove-${peerId}`}
                onClick={() => { onRemove && onRemove(peerId); setMenuOpen(false); }}
                className="w-full px-3 py-2 text-left text-sm text-[#EF4444] hover:bg-[#1a1e29] flex items-center gap-2"
              >
                <UserX className="w-4 h-4" /> Remove
              </button>
            </div>
          )}
        </div>
      )}

      <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/55 backdrop-blur-sm">
        {!audio && <MicOff className="w-3.5 h-3.5 text-[#EF4444]" />}
        <span className="text-xs font-mono text-white">
          {name}
          {isLocal && " (you)"}
          {isHost && <span className="text-[#D4A373]"> · host</span>}
        </span>
      </div>
    </div>
  );
}
