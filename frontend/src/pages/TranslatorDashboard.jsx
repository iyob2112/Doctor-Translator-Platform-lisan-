import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client.js";
import { primeCallMedia, explainMediaError } from "../lib/callMedia.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../hooks/useSocket.js";
import Layout, { Card, CardTitle, EmptyState, Stat } from "../components/Layout.jsx";
import SessionCard from "../components/SessionCard.jsx";
import TranslatorRequestModal from "../components/TranslatorRequestModal.jsx";
import Icon from "../components/Icon.jsx";

export default function TranslatorDashboard() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [incoming, setIncoming] = useState(null);
  const [status, setStatus] = useState("");
  const [accepting, setAccepting] = useState(false);
  const online = Boolean(user.translatorProfile?.isOnline);
  const approval = user.translatorProfile?.approvalStatus || "pending";
  const approved = approval === "approved";
  const flagged = Boolean(user.translatorProfile?.flagged);
  const spoken = user.translatorProfile?.languages || [];
  const canGoOnline = approved && !flagged;

  const socketRef = useSocket({
    "translator:request_new": (payload) => setIncoming(payload),
    "session:transfer_requested": (payload) => setIncoming(payload),
    "translator:request_cancelled": (payload) => {
      setIncoming((current) => {
        if (!current) return null;
        const sameRequest = payload?.requestId && current.requestId === payload.requestId;
        const sameSession =
          payload?.session_id &&
          current.session_id === payload.session_id &&
          (!payload?.requestId || !current.requestId);
        return sameRequest || sameSession ? null : current;
      });
    },
    "session:join_ready": (payload) => navigate(`/call/${payload.session_id}`),
    "translator:availability_changed": (payload) => {
      if (payload?.translatorId !== user.id) return;
      setUser((current) =>
        current?.translatorProfile
          ? {
              ...current,
              translatorProfile: {
                ...current.translatorProfile,
                isOnline: Boolean(payload.is_online),
              },
            }
          : current
      );
    },
  });

  async function load() {
    const { data } = await api.get("/sessions");
    setSessions(data.sessions);
  }

  useEffect(() => {
    load().catch(() => setStatus("Could not load translator desk"));
  }, []);

  const stats = useMemo(() => {
    const completed = sessions.filter((s) => s.status === "completed");
    const minutes = Math.round(
      completed.reduce((sum, s) => sum + (s.durationSeconds || 0), 0) / 60
    );
    const rated = completed.filter((s) => s.providerRating);
    const avg = rated.length
      ? (rated.reduce((sum, s) => sum + s.providerRating, 0) / rated.length).toFixed(1)
      : "—";
    return { handled: completed.length, minutes, avg };
  }, [sessions]);

  async function toggleOnline() {
    if (!canGoOnline) return;
    try {
      const { data } = await api.patch("/translators/me/availability", {
        is_online: !online,
      });
      setUser(data.user);
    } catch (err) {
      setStatus(err.response?.data?.error || "Could not update availability");
    }
  }

  async function accept() {
    if (!incoming) return;
    const voiceOnly = String(incoming.call_mode || incoming.callMode || "").toLowerCase() === "voice";
    const payload = {
      session_id: incoming.session_id,
      requestId: incoming.requestId,
    };
    setAccepting(true);
    setStatus("");
    const mediaPromise = primeCallMedia(voiceOnly).catch((err) => {
      setStatus(explainMediaError(err, voiceOnly));
    });
    socketRef.current?.emit("translator:request_accepted", payload);
    setIncoming(null);
    await mediaPromise;
    setAccepting(false);
  }

  function decline() {
    socketRef.current?.emit("translator:request_declined", {
      session_id: incoming.session_id,
      requestId: incoming.requestId,
    });
    setIncoming(null);
  }

  return (
    <>
      <div
        className={`min-h-screen transition duration-300 ${
          incoming ? "pointer-events-none blur-md brightness-[0.45] saturate-50" : ""
        }`}
      >
        <Layout
          eyebrow={user.organization?.name || "Interpreter pool"}
          title="Interpreter desk"
          description={
            flagged
              ? "Your account is flagged for review after low ratings. You cannot take calls until a platform admin clears the flag."
              : approved
                ? "Go online and every matching request for your languages will ring here."
                : "This interpreter account is not active yet. Ask the platform admin."
          }
          actions={
            <button
              onClick={toggleOnline}
              disabled={!canGoOnline}
              className={online ? "btn-danger" : "btn-brand"}
            >
              <Icon name={online ? "x" : "bolt"} className="h-4 w-4" />
              {online ? "Go offline" : "Go online"}
            </button>
          }
        >
          {flagged ? (
            <div className="mb-6 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-rose-800">
              <p className="font-semibold">Flagged for review</p>
              <p className="mt-1 text-sm">
                {user.translatorProfile?.flaggedReason ||
                  "This account received several low ratings. A platform admin will review it."}
              </p>
            </div>
          ) : null}

          {!approved ? (
            <div className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900">
              <p className="font-semibold">Waiting for the platform admin</p>
              <p className="mt-1 text-sm">
                Interpreters are added by the platform admin. You cannot go online until they
                activate this account.
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <Stat icon="check" label="Calls handled" value={stats.handled} />
            <Stat icon="clock" label="Minutes" value={stats.minutes} tone="slate" />
            <Stat icon="star" label="Avg rating" value={stats.avg} tone="amber" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardTitle
                icon="language"
                title="Availability"
                hint="Closing this tab takes you offline automatically."
              />

              <div
                className={`mt-6 flex items-center justify-between gap-4 rounded-3xl border p-5 transition ${
                  online
                    ? "border-brand-200 bg-brand-50/70"
                    : "border-slate-200 bg-slate-50/70"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    {online ? (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400" />
                    ) : null}
                    <span
                      className={`relative inline-flex h-3 w-3 rounded-full ${
                        online ? "bg-brand-500" : "bg-slate-400"
                      }`}
                    />
                  </span>
                  <div className="leading-tight">
                    <p className="font-semibold">{online ? "Online" : "Offline"}</p>
                    <p className="text-sm text-slate-500">
                      {online ? "Accepting live requests" : "You will not be paged"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={toggleOnline}
                  disabled={!canGoOnline}
                  role="switch"
                  aria-checked={online}
                  aria-label="Toggle availability"
                  className={`relative h-11 w-[3.75rem] shrink-0 rounded-full transition ${
                    online ? "bg-brand-500" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`absolute top-1.5 h-8 w-8 rounded-full bg-white shadow transition-all ${
                      online ? "left-7" : "left-1.5"
                    }`}
                  />
                </button>
              </div>

              <p className="label mt-7">Languages assigned by admin</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {spoken.length ? (
                  spoken.map((l) => (
                    <span key={l.id} className="chip-on">
                      <Icon name="check" className="h-3.5 w-3.5" />
                      {l.name}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No languages assigned yet.</p>
                )}
              </div>
              {status ? <p className="mt-4 text-sm text-brand-700">{status}</p> : null}
            </Card>

            <Card>
              <CardTitle icon="clock" title="Recent calls" hint="Sessions you interpreted" />
              <div className="scroll-area mt-5 max-h-[460px] space-y-3 overflow-y-auto pr-1">
                {sessions.length ? (
                  sessions.map((s) => <SessionCard key={s.id} session={s} />)
                ) : (
                  <EmptyState
                    icon="language"
                    title="No interpreted sessions yet"
                    hint="Go online to start receiving requests."
                  />
                )}
              </div>
            </Card>
          </div>
        </Layout>
      </div>

      <TranslatorRequestModal
        request={incoming}
        accepting={accepting}
        onAccept={accept}
        onDecline={decline}
      />
    </>
  );
}
