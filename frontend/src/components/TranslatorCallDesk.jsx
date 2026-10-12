import Icon from "./Icon.jsx";

function Meta({ icon, label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-3">
      <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        <Icon name={icon} className="h-3.5 w-3.5 text-brand-600" />
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold leading-snug text-ink">{value || "—"}</p>
    </div>
  );
}

export default function TranslatorCallDesk({
  session,
  elapsed,
  doctorName,
  onDoctorName,
  roomLabel,
  onRoomLabel,
  visitReason,
  onVisitReason,
  notes,
  onNotes,
  onSave,
  saved,
  saving,
  onHandoff,
  handingOff,
  error,
}) {
  return (
    <aside className="flex min-h-[50vh] w-full min-w-0 flex-1 flex-col bg-[#f5f7fb] text-ink lg:min-h-screen lg:w-1/2">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-6">
        <div className="mb-5">
          <p className="label">Live session</p>
          <h2 className="mt-1 font-display text-2xl">Interpreter desk</h2>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Meta icon="building" label="Hospital" value={session.organization?.name} />
          <Meta icon="language" label="Language" value={session.language?.name} />
          <Meta icon="activity" label="Unit" value={session.department?.name} />
          <Meta
            icon={session.callMode === "voice" ? "voice" : "video"}
            label="Call"
            value={session.callMode === "voice" ? "Voice" : "Video"}
          />
          <Meta icon="clock" label="Time" value={elapsed || "00:00"} />
        </div>

        <div className="card mt-5 flex flex-1 flex-col">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Doctor name</span>
              <input
                value={doctorName}
                onChange={(e) => onDoctorName(e.target.value)}
                placeholder="Who is in the room"
                className="field mt-2"
              />
            </label>
            <label className="block">
              <span className="label">Room</span>
              <input
                value={roomLabel}
                onChange={(e) => onRoomLabel(e.target.value)}
                placeholder="Room or bed"
                className="field mt-2"
              />
            </label>
          </div>

          <label className="mt-4 block">
            <span className="label">Reason for visit</span>
            <input
              value={visitReason}
              onChange={(e) => onVisitReason(e.target.value)}
              placeholder="Why the patient is here"
              className="field mt-2"
            />
          </label>

          <label className="mt-4 block flex-1">
            <span className="label">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => onNotes(e.target.value)}
              rows={6}
              placeholder="Terms, meaning, follow-up…"
              className="field mt-2 min-h-[140px]"
            />
          </label>

          {error ? (
            <p className="mt-3 text-sm text-rose-600">{error}</p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" disabled={saving} onClick={onSave} className="btn-brand px-6">
              <Icon name="check" className="h-4 w-4" />
              {saving ? "Saving…" : "Save"}
            </button>
            {saved ? <span className="text-sm font-medium text-brand-700">Saved</span> : null}
            <button
              type="button"
              disabled={handingOff}
              onClick={onHandoff}
              className="btn-ghost ml-auto"
            >
              <Icon name="transfer" className="h-4 w-4" />
              {handingOff ? "Handing off…" : "Hand off"}
            </button>
          </div>
          {handingOff ? (
            <p className="mt-3 text-sm text-slate-500">
              Another interpreter is being paged. Stay until they join.
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
