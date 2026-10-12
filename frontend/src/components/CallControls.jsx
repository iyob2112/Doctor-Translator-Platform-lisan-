import Icon from "./Icon.jsx";

function ControlButton({ icon, label, onClick, active, large, badge }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`relative grid place-items-center rounded-full transition focus:outline-none focus-visible:ring-4 focus-visible:ring-white/20 active:scale-95 ${
        large ? "h-16 w-16" : "icon-btn"
      } ${
        active
          ? "border-transparent bg-white text-ink"
          : large
            ? "bg-white/10 text-white hover:bg-white/20"
            : ""
      }`}
    >
      <Icon name={icon} className={large ? "h-6 w-6" : "h-5 w-5"} />
      {badge ? (
        <span className="absolute right-1.5 top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-ink">
          {typeof badge === "number" && badge > 1 ? (badge > 9 ? "9+" : badge) : ""}
        </span>
      ) : null}
    </button>
  );
}

export default function CallControls({
  muted,
  cameraOff,
  voiceOnly,
  isDoctor,
  canTransfer,
  onMute,
  onCamera,
  onEnd,
  onTransfer,
  onToggleNotes,
  notesOpen,
  canTakeNotes,
  onChat,
  chatOpen,
  unreadCount = 0,
  phone = false,
  endLabel = "End",
  watchOnly = false,
}) {
  if (phone) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-5">
        {watchOnly ? null : (
        <div className="flex flex-col items-center gap-2">
          <ControlButton
            large
            icon={muted ? "micOff" : "mic"}
            label={muted ? "Unmute" : "Mute"}
            onClick={onMute}
            active={muted}
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
            {muted ? "Muted" : "Mic"}
          </span>
        </div>
        )}
        {!watchOnly && !voiceOnly ? (
          <div className="flex flex-col items-center gap-2">
            <ControlButton
              large
              icon={cameraOff ? "camOff" : "video"}
              label={cameraOff ? "Turn camera on" : "Turn camera off"}
              onClick={onCamera}
              active={cameraOff}
            />
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
              Camera
            </span>
          </div>
        ) : null}
        {onChat ? (
          <div className="flex flex-col items-center gap-2">
            <ControlButton
              large
              icon="chat"
              label={unreadCount ? `Messages, ${unreadCount} new` : "Messages"}
              onClick={onChat}
              active={chatOpen}
              badge={!chatOpen && unreadCount ? unreadCount : 0}
            />
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
              Chat
            </span>
          </div>
        ) : null}
        {canTakeNotes ? (
          <div className="flex flex-col items-center gap-2">
            <ControlButton
              large
              icon="notes"
              label={notesOpen ? "Hide notes" : "Interpreter notes"}
              onClick={onToggleNotes}
              active={notesOpen}
            />
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
              Notes
            </span>
          </div>
        ) : null}
        {!watchOnly && (canTransfer ?? isDoctor) ? (
          <div className="flex flex-col items-center gap-2">
            <ControlButton large icon="transfer" label="Transfer call" onClick={onTransfer} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
              Transfer
            </span>
          </div>
        ) : null}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onEnd}
            aria-label={endLabel === "Leave" ? "Leave call" : "End call"}
            className="grid h-16 w-16 place-items-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/40 transition hover:bg-rose-400"
          >
            <Icon name="hangup" className="h-6 w-6" />
          </button>
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-200">
            {endLabel}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
      {watchOnly ? null : (
      <ControlButton
        icon={muted ? "micOff" : "mic"}
        label={muted ? "Unmute" : "Mute"}
        onClick={onMute}
        active={muted}
      />
      )}
      {!watchOnly && !voiceOnly ? (
        <ControlButton
          icon={cameraOff ? "camOff" : "video"}
          label={cameraOff ? "Turn camera on" : "Turn camera off"}
          onClick={onCamera}
          active={cameraOff}
        />
      ) : null}
      {canTakeNotes ? (
        <ControlButton
          icon="notes"
          label={notesOpen ? "Hide notes" : "Interpreter notes"}
          onClick={onToggleNotes}
          active={notesOpen}
        />
      ) : null}
      {!watchOnly && (canTransfer ?? isDoctor) ? (
        <ControlButton icon="transfer" label="Transfer call" onClick={onTransfer} />
      ) : null}

      <button onClick={onEnd} className="btn-danger ml-1 h-12 px-6">
        <Icon name="hangup" className="h-5 w-5" />
        {endLabel === "Leave" ? "Leave call" : "End call"}
      </button>
    </div>
  );
}
