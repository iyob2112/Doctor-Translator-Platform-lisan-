import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon.jsx";
import { initials } from "./Layout.jsx";

function secondsLeft(expiresAt) {
  if (!expiresAt) return null;
  return Math.max(0, Math.round((new Date(expiresAt) - Date.now()) / 1000));
}

export default function TranslatorRequestModal({ request, onAccept, onDecline, accepting }) {
  const [left, setLeft] = useState(() => secondsLeft(request?.expiresAt));
  const totalRef = useRef(secondsLeft(request?.expiresAt) || 60);

  useEffect(() => {
    if (!request?.expiresAt) return undefined;
    const start = secondsLeft(request.expiresAt);
    totalRef.current = Math.max(start || 1, totalRef.current);
    setLeft(start);
    const timer = setInterval(() => setLeft(secondsLeft(request.expiresAt)), 1000);
    return () => clearInterval(timer);
  }, [request?.expiresAt]);

  const progress = useMemo(() => {
    if (left == null || !totalRef.current) return 1;
    return Math.max(0, Math.min(1, left / totalRef.current));
  }, [left]);

  if (!request) return null;

  const voiceOnly = String(request.call_mode || request.callMode || "").toLowerCase() === "voice";
  const isStat = request.priority === "stat";
  const doctorName = request.doctor_name || request.doctorName || request.organization || "Hospital";
  const language = request.language?.name || "Interpretation";
  const ring = 54;
  const circ = 2 * Math.PI * ring;

  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/70 backdrop-blur-2xl" />
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-brand-400/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-plum-500/30 blur-3xl" />

      <div
        className={`relative w-full max-w-[420px] animate-pop-in overflow-hidden rounded-[2rem] border bg-ink/40 shadow-lift backdrop-blur-xl ${
          isStat ? "border-rose-400/40" : "border-white/15"
        }`}
      >
        <div className="pointer-events-none absolute -left-16 top-8 h-44 w-44 rounded-full bg-brand-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 bottom-0 h-48 w-48 rounded-full bg-plum-500/25 blur-3xl" />

        <div className="relative px-7 pb-8 pt-8 text-center text-white">
          <p
            className={`text-[11px] font-semibold uppercase tracking-[0.28em] ${
              isStat ? "text-rose-300" : "text-brand-300"
            }`}
          >
            {isStat
              ? "STAT · emergency"
              : request.transfer
                ? "Live transfer"
                : voiceOnly
                  ? "Incoming voice call"
                  : "Incoming video call"}
          </p>

          <div className="relative mx-auto mt-7 grid h-36 w-36 place-items-center">
            <span className="voice-ring voice-ring-a" />
            <span className="voice-ring voice-ring-b" />
            {left != null ? (
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 120 120" aria-hidden>
                <circle cx="60" cy="60" r={ring} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
                <circle
                  cx="60"
                  cy="60"
                  r={ring}
                  fill="none"
                  stroke={isStat ? "#fb7185" : "#5eead4"}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={circ * (1 - progress)}
                />
              </svg>
            ) : null}
            <span className="relative grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-brand-400 via-brand-500 to-plum-500 text-3xl font-semibold shadow-lg shadow-brand-600/30">
              {initials(doctorName) || <Icon name="stetho" className="h-9 w-9" />}
            </span>
            <span className="absolute -bottom-1 right-3 grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-ink text-white shadow-lift">
              <Icon name={voiceOnly ? "voice" : "video"} className="h-4 w-4" />
            </span>
          </div>

          <h2 className="mt-7 font-display text-3xl">{doctorName}</h2>
          <p className="mt-1 text-sm text-white/55">
            {language}
            {request.department ? ` · ${request.department}` : ""}
          </p>
          {request.organization ? (
            <p className="mt-1 text-xs text-white/35">{request.organization}</p>
          ) : null}

          {left != null ? (
            <p className="mt-4 text-sm font-medium tabular-nums text-white/70">
              Rings for {left}s
            </p>
          ) : null}

          {request.transfer && request.reason ? (
            <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              {request.reason}
            </p>
          ) : null}

          <div className="mt-8 flex items-center justify-center gap-10">
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={onDecline}
                disabled={accepting}
                className="grid h-16 w-16 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
                aria-label="Decline"
              >
                <Icon name="x" className="h-6 w-6" />
              </button>
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                Decline
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={onAccept}
                disabled={accepting}
                className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-lg shadow-brand-600/40 transition hover:from-brand-300 hover:to-brand-500"
                aria-label={voiceOnly ? "Accept and allow microphone" : "Accept and allow camera"}
              >
                <Icon name={accepting ? "clock" : "check"} className="h-6 w-6" />
              </button>
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-200">
                {accepting ? (voiceOnly ? "Mic…" : "Camera…") : "Accept"}
              </span>
            </div>
          </div>

          <p className="mt-6 text-[11px] leading-5 text-white/35">
            {voiceOnly
              ? "Accept will ask for your microphone."
              : "Accept will ask for your camera and microphone."}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
