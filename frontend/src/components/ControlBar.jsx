import { useState } from "react";
import { Mic, MicOff, Video, VideoOff, MonitorUp, MessageSquare, Users, Copy, PhoneOff, Hand, Smile, Disc } from "lucide-react";

const EMOJIS = ["👍", "👏", "❤️", "😂", "🎉", "😮", "🙌", "🔥"];

function CtrlButton({ active, danger, highlight, onClick, children, testId, label, badge }) {
  const base =
    "relative w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors";
  let cls;
  if (danger) cls = "bg-[#EF4444] hover:bg-[#dc2626] text-white";
  else if (active === false) cls = "bg-[#EF4444] hover:bg-[#dc2626] text-white";
  else if (highlight) cls = "bg-[#E07A5F] hover:bg-[#D06348] text-[#090A0F]";
  else cls = "bg-[#1a1e29] hover:bg-[#262A38] text-white border border-[#262A38]";
  return (
    <button data-testid={testId} onClick={onClick} title={label} className={`${base} ${cls}`}>
      {children}
      {badge > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E07A5F] text-[#090A0F] text-[10px] font-mono font-bold flex items-center justify-center">
          {badge}
        </span>
      )}
    </button>
  );
}

export default function ControlBar({
  audioEnabled,
  videoEnabled,
  screenSharing,
  handRaised,
  participantCount,
  onToggleAudio,
  onToggleVideo,
  onToggleScreen,
  onToggleChat,
  onToggleParticipants,
  onCopyLink,
  onLeave,
  onRaiseHand,
  onReact,
  canRecord,
  isRecording,
  onToggleRecord,
}) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  return (
    <div className="relative flex items-center justify-center gap-2 sm:gap-3 px-4 py-3 rounded-2xl backdrop-blur-xl bg-[#0d0f16]/85 border border-[#262A38]/70 shadow-2xl">
      {emojiOpen && (
        <div
          className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 flex gap-1 px-2 py-2 rounded-2xl bg-[#12151E] border border-[#262A38] shadow-2xl"
          data-testid="emoji-picker"
        >
          {EMOJIS.map((e) => (
            <button
              key={e}
              data-testid={`react-${e}`}
              onClick={() => { onReact(e); setEmojiOpen(false); }}
              className="w-10 h-10 rounded-lg hover:bg-[#1a1e29] text-2xl transition-colors"
            >
              {e}
            </button>
          ))}
        </div>
      )}
      <CtrlButton active={audioEnabled} onClick={onToggleAudio} testId="toggle-mic-btn" label="Mic">
        {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      </CtrlButton>
      <CtrlButton active={videoEnabled} onClick={onToggleVideo} testId="toggle-cam-btn" label="Camera">
        {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
      </CtrlButton>
      <CtrlButton onClick={onToggleScreen} testId="toggle-screen-btn" label="Share screen">
        <MonitorUp className={`w-5 h-5 ${screenSharing ? "text-[#E07A5F]" : ""}`} />
      </CtrlButton>
      {canRecord && (
        <CtrlButton onClick={onToggleRecord} testId="record-btn" label={isRecording ? "Stop recording" : "Record"}>
          <Disc className={`w-5 h-5 ${isRecording ? "text-[#EF4444] animate-pulse" : ""}`} />
        </CtrlButton>
      )}
      <CtrlButton highlight={handRaised} onClick={onRaiseHand} testId="raise-hand-btn" label="Raise hand">
        <Hand className="w-5 h-5" />
      </CtrlButton>
      <CtrlButton onClick={() => setEmojiOpen((o) => !o)} testId="reactions-btn" label="Reactions">
        <Smile className="w-5 h-5" />
      </CtrlButton>

      <div className="w-px h-8 bg-[#262A38] mx-1 hidden sm:block" />

      <CtrlButton onClick={onToggleParticipants} testId="toggle-participants-btn" label="Participants" badge={participantCount}>
        <Users className="w-5 h-5" />
      </CtrlButton>
      <CtrlButton onClick={onToggleChat} testId="toggle-chat-btn" label="Chat">
        <MessageSquare className="w-5 h-5" />
      </CtrlButton>
      <CtrlButton onClick={onCopyLink} testId="copy-link-btn" label="Copy link">
        <Copy className="w-5 h-5" />
      </CtrlButton>

      <div className="w-px h-8 bg-[#262A38] mx-1 hidden sm:block" />

      <CtrlButton danger onClick={onLeave} testId="leave-call-btn" label="Leave">
        <PhoneOff className="w-5 h-5" />
      </CtrlButton>
    </div>
  );
}
