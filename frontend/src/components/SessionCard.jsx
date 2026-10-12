import Icon from "./Icon.jsx";
import { Avatar, StatusPill, Stars, formatDuration } from "./Layout.jsx";

export default function SessionCard({ session }) {
  const partner = session.translator?.fullName;

  return (
    <article className="group rounded-3xl border border-slate-200/80 bg-white/70 p-4 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={partner || session.doctor?.fullName} className="h-10 w-10 text-xs" />
          <div className="leading-tight">
            <p className="font-semibold">
              {session.language?.name || "Language pending"}
            </p>
            <p className="text-sm text-slate-500">
              {partner ? `with ${partner}` : "No interpreter matched"}
            </p>
          </div>
        </div>
        <StatusPill status={session.status} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="building" className="h-4 w-4 text-slate-400" />
          {session.department?.name}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Icon name="clock" className="h-4 w-4 text-slate-400" />
          {formatDuration(session.durationSeconds)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Icon name={session.callMode === "voice" ? "voice" : "video"} className="h-4 w-4 text-slate-400" />
          {session.callMode}
        </span>
        {session.providerRating ? (
          <span className="inline-flex items-center gap-1.5">
            <Stars value={session.providerRating} />
            <span>
              {["", "Poor", "Fair", "Good", "Great", "Excellent"][session.providerRating]}
            </span>
          </span>
        ) : null}
      </div>
      {session.providerRatingComment ? (
        <p className="mt-2 text-xs text-slate-500">{session.providerRatingComment}</p>
      ) : null}

      <p className="mt-3 text-[11px] uppercase tracking-[0.14em] text-slate-400">
        {new Date(session.createdAt).toLocaleString()}
      </p>
    </article>
  );
}
