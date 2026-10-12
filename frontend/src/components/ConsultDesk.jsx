import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client.js";
import { primeCallMedia, explainMediaError } from "../lib/callMedia.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../hooks/useSocket.js";
import { Card, CardTitle, EmptyState, Stat } from "./Layout.jsx";
import SessionCard from "./SessionCard.jsx";
import Icon from "./Icon.jsx";

function pagingStatus(payload, waiting = false) {
  const suffix = waiting ? " Waiting…" : "";
  if (payload?.sequential || (payload?.queueLength || 0) >= 2) {
    const name = payload.offeredName ? ` (${payload.offeredName})` : "";
    return `Calling interpreter ${payload.offeredIndex} of ${payload.queueLength}${name}. If they do not answer, the next one is offered.${suffix}`;
  }
  const attempt = payload?.attempt || 1;
  const maxAttempts = payload?.maxAttempts || 3;
  return `Attempt ${attempt} of ${maxAttempts} · waiting for the interpreter.${suffix}`;
}

export default function ConsultDesk({ departments = [] }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [languages, setLanguages] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [session, setSession] = useState(null);
  const [languageId, setLanguageId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [callMode, setCallMode] = useState("video");
  const [status, setStatus] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [billing, setBilling] = useState(null);

  useSocket({
    "session:translator_joined": (payload) => {
      setStatus(`${payload.name} joined. Opening the call…`);
      setWaiting(false);
      navigate(`/call/${payload.session_id}`);
    },
    "translator:request_expired": (payload) => {
      setWaiting(false);
      setStatus(
        payload?.unmatched
          ? "No interpreter accepted. Hospital and platform admins were alerted."
          : "No translator accepted in time. Try again."
      );
    },
    "translator:request_retrying": (payload) => {
      setWaiting(true);
      setStatus(pagingStatus(payload));
    },
    "session:unmatched": () => {
      setWaiting(false);
      setStatus("No interpreter accepted. Hospital and platform admins were alerted.");
    },
  });

  async function load() {
    const [langRes, sessRes, billRes] = await Promise.all([
      api.get("/languages"),
      api.get("/sessions"),
      api.get("/billing/me").catch(() => ({ data: null })),
    ]);
    setLanguages(langRes.data.languages);
    setSessions(sessRes.data.sessions);
    setBilling(billRes.data);
  }

  useEffect(() => {
    load().catch(() => setStatus("Could not load clinic data"));
  }, []);

  const stats = useMemo(() => {
    const completed = sessions.filter((s) => s.status === "completed");
    const rated = completed.filter((s) => s.providerRating);
    const avg = rated.length
      ? (rated.reduce((sum, s) => sum + s.providerRating, 0) / rated.length).toFixed(1)
      : "—";
    const minutes = Math.round(
      completed.reduce((sum, s) => sum + (s.durationSeconds || 0), 0) / 60
    );
    return { total: sessions.length, completed: completed.length, avg, minutes };
  }, [sessions]);

  async function startConsult() {
    setStatus("");
    try {
      const { data } = await api.post("/sessions", { callMode });
      setSession(data.session);
      setDepartmentId("");
      setStatus("Consult opened. Choose the unit, then request a translator.");
    } catch (err) {
      setStatus(
        err.response?.data?.error ||
          "Could not start the consult. Check your monthly plan, device limit, or remaining minutes."
      );
    }
  }

  async function requestTranslator() {
    if (!session) return;
    if (!departmentId) {
      setStatus("Choose a unit before requesting an interpreter.");
      return;
    }
    if (!languageId) {
      setStatus("Choose a language before requesting an interpreter.");
      return;
    }
    setWaiting(true);
    setStatus("Allow microphone or camera, then paging will start…");
    const mediaPromise = primeCallMedia(callMode === "voice").catch((err) =>
      explainMediaError(err, callMode === "voice")
    );
    try {
      const { data } = await api.post(`/sessions/${session.id}/request-translator`, {
        language_id: languageId,
        departmentId,
      });
      setSession(data.session);
      const mediaError = await mediaPromise;
      setStatus(typeof mediaError === "string" ? mediaError : pagingStatus(data, true));
    } catch (err) {
      setWaiting(false);
      setStatus(err.response?.data?.error || explainMediaError(err) || "Request failed");
    }
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon="activity" label="Consults" value={stats.total} />
        <Stat icon="check" label="Completed" value={stats.completed} tone="plum" />
        <Stat icon="clock" label="Minutes" value={stats.minutes} tone="slate" />
        <Stat icon="star" label="Avg rating" value={stats.avg} tone="amber" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <Card>
          <CardTitle
            icon="stetho"
            title="Live consult"
            hint="Start the consult, then choose the unit and language before paging an interpreter."
          />
          {billing?.unpaidInvoice || billing?.activeMode === "blocked" ? (
            <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              Unpaid on-demand bill for {billing.unpaidInvoice?.periodKey}. Pay it under Plans before starting a consult.
              {billing.subscription?.plan?.name
                ? ` (Monthly plan ${billing.subscription.plan.name} is on hold until this is paid.)`
                : ""}
            </p>
          ) : billing?.activeMode === "subscription" ? (
            <p className="mt-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
              Using the monthly plan{billing.subscription?.plan?.name ? `: ${billing.subscription.plan.name}` : ""}.
              On-demand is paused. Minutes are not deducted{billing.minutesPaused ? ` (${billing.remainingMinutes} minutes saved for later)` : ""}.
            </p>
          ) : billing?.activeMode === "minutes" ? (
            <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Using the minute package. {billing.remainingMinutes} minutes left. On-demand is paused. This live consult will deduct time.
            </p>
          ) : billing?.activeMode === "ondemand" ? (
            <p className="mt-4 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
              Using on-demand (default). This consult is billed on the monthly usage invoice
              {billing.ondemand?.rateEtb != null
                ? ` at ${Number(billing.ondemand.rateEtb).toLocaleString("en-ET")} ETB/${billing.ondemand.rateUnit === "minute" ? "minute" : "hour"}`
                : billing.ondemand?.hourlyRateEtb != null
                  ? ` at ${Number(billing.ondemand.hourlyRateEtb).toLocaleString("en-ET")} ETB/hour`
                  : ""}
              .
            </p>
          ) : (
            <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              Live consults are unavailable. Open Plans to use on-demand, or buy a monthly plan or minutes.
            </p>
          )}

          <div className="mt-6">
            <p className="label">Call mode</p>
            <div className="mt-2 inline-flex rounded-full border border-slate-200 bg-white/70 p-1">
              {[
                { value: "video", label: "Video", icon: "video" },
                { value: "voice", label: "Voice only", icon: "voice" },
              ].map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => setCallMode(mode.value)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                    callMode === mode.value
                      ? "bg-ink text-white shadow-sm"
                      : "text-slate-500 hover:text-ink"
                  }`}
                >
                  <Icon name={mode.icon} className="h-4 w-4" />
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={startConsult}
            className="btn-dark mt-6 w-full py-3 sm:w-auto sm:px-7"
          >
            <Icon name="plus" className="h-4 w-4" />
            Start consultation
          </button>

          {session ? (
            <div className="mt-6 animate-fade-up rounded-3xl border border-brand-100 bg-brand-50/60 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="label">Session {session.id.slice(0, 8)}</p>
                <span className="chip bg-white text-brand-700 shadow-sm">
                  <Icon name={session.callMode === "voice" ? "voice" : "video"} className="h-3.5 w-3.5" />
                  {session.callMode}
                </span>
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <p className="label">Unit</p>
                  {departments.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {departments.map((d) => {
                        const on = departmentId === d.id;
                        return (
                          <button
                            type="button"
                            key={d.id}
                            onClick={() => setDepartmentId(d.id)}
                            className={on ? "chip-on" : "chip-off"}
                          >
                            {on ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
                            {d.name}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">Add a unit first in Units.</p>
                  )}
                </div>
                <div>
                  <p className="label">Language needed</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {languages.map((l) => {
                      const on = languageId === l.id;
                      return (
                        <button
                          type="button"
                          key={l.id}
                          onClick={() => setLanguageId(l.id)}
                          className={on ? "chip-on" : "chip-off"}
                        >
                          {on ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
                          {l.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <button
                  disabled={waiting || !departmentId || !languageId}
                  onClick={requestTranslator}
                  className="btn-brand mt-4 h-[46px] w-full px-6 sm:w-auto"
                >
                  {waiting ? (
                    <>
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
                      </span>
                      Paging…
                    </>
                  ) : (
                    <>
                      <Icon name="bolt" className="h-4 w-4" />
                      Request translator
                    </>
                  )}
                </button>
            </div>
          ) : null}

          {status ? (
            <p className="mt-5 flex items-start gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <Icon name="spark" className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              {status}
            </p>
          ) : null}
        </Card>

        <Card>
          <CardTitle icon="clock" title="Hospital session history" hint="Most recent first" />
          <div className="scroll-area mt-5 max-h-[460px] space-y-3 overflow-y-auto pr-1">
            {sessions.length ? (
              sessions.map((s) => <SessionCard key={s.id} session={s} />)
            ) : (
              <EmptyState
                icon="activity"
                title="No consults yet"
                hint="Start a consultation to see it recorded here."
              />
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
