import { useEffect, useState } from "react";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import Layout, {
  Card,
  CardTitle,
  EmptyState,
  StatusPill,
  Stars,
  formatDuration,
} from "../components/Layout.jsx";
import Icon from "../components/Icon.jsx";
import JoinLiveButton from "../components/JoinLiveButton.jsx";
import ConsultDesk from "../components/ConsultDesk.jsx";
import { clinicLabel } from "../roles.js";

export default function HospitalDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState("consult");
  const [hospital, setHospital] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [deptName, setDeptName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [hRes, sRes] = await Promise.all([
      api.get("/hospital"),
      api.get("/hospital/sessions"),
    ]);
    setHospital(hRes.data.organization);
    setSessions(sRes.data.sessions);
  }

  useEffect(() => {
    load().catch(() => setError("Could not load hospital desk"));
    const timer = setInterval(() => {
      if (tab === "sessions") load().catch(() => {});
    }, 8000);
    return () => clearInterval(timer);
  }, [tab]);

  async function addDepartment(e) {
    e.preventDefault();
    await api.post("/hospital/departments", { name: deptName });
    setDeptName("");
    setMessage("Unit added");
    load();
  }

  const departments = hospital?.departments || [];

  return (
    <Layout
      eyebrow={hospital?.name || user.organization?.name || "Hospital"}
      title="Hospital desk"
      description="One login for this hospital. Open a consult from the exam room, page an interpreter, and join the call. Interpreters are approved by the platform."
    >
      {message ? (
        <p className="mb-4 inline-flex items-center gap-2 rounded-2xl bg-brand-50 px-4 py-2.5 text-sm text-brand-700">
          <Icon name="check" className="h-4 w-4" />
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mb-4 inline-flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-2.5 text-sm text-rose-600">
          <Icon name="x" className="h-4 w-4" />
          {error}
        </p>
      ) : null}

      <nav className="inline-flex flex-wrap gap-1 rounded-full border border-white/70 bg-white/70 p-1 shadow-soft backdrop-blur">
        {[
          { id: "consult", label: "Exam room", icon: "stetho" },
          { id: "clinic", label: "Units", icon: "building" },
          { id: "sessions", label: "Sessions", icon: "activity" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === t.id ? "bg-ink text-white shadow-sm" : "text-slate-500 hover:text-ink"
            }`}
          >
            <Icon name={t.icon} className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        <div className={tab === "consult" ? "" : "hidden"}>
          <ConsultDesk departments={departments} />
        </div>

        {tab === "clinic" ? (
          <Card>
            <CardTitle
              icon="building"
              title="Units"
              hint="Add the hospital units staff must choose before paging an interpreter."
            />
            <form className="mt-5 flex flex-col gap-2 sm:flex-row" onSubmit={addDepartment}>
              <input
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
                placeholder="Unit name"
                className="field"
                required
              />
              <button className="btn-dark w-full shrink-0 px-5 sm:w-auto">
                <Icon name="plus" className="h-4 w-4" />
                <span className="sm:hidden">Add unit</span>
              </button>
            </form>
            <ul className="mt-4 space-y-2">
              {departments.map((d) => (
                <li
                  key={d.id}
                  className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 text-sm font-medium"
                >
                  {d.name}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {tab === "sessions" ? (
          <Card>
              <CardTitle icon="activity" title="Hospital sessions" />
              {!sessions.length ? (
                <div className="mt-5">
                  <EmptyState
                    icon="activity"
                    title="No sessions yet"
                    hint="They appear after this hospital starts consults."
                  />
                </div>
              ) : (
                <>
                  <div className="mt-5 space-y-3 md:hidden">
                    {sessions.map((s) => (
                      <article
                        key={s.id}
                        className="rounded-3xl border border-slate-200/80 bg-white/80 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs text-slate-400">
                              {new Date(s.createdAt).toLocaleString()}
                            </p>
                            <p className="mt-1 font-semibold">
                              {clinicLabel(s)}
                              {s.department?.name ? (
                                <span className="block text-xs font-normal text-slate-500">
                                  {s.department.name}
                                </span>
                              ) : null}
                            </p>
                          </div>
                          <StatusPill status={s.status} />
                        </div>
                        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <dt className="text-[10px] uppercase tracking-wide text-slate-400">Interpreter</dt>
                            <dd className="mt-0.5 font-medium">{s.translator?.fullName || "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-[10px] uppercase tracking-wide text-slate-400">Language</dt>
                            <dd className="mt-0.5 font-medium">{s.language?.name || "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-[10px] uppercase tracking-wide text-slate-400">Duration</dt>
                            <dd className="mt-0.5 font-medium">{formatDuration(s.durationSeconds)}</dd>
                          </div>
                          <div>
                            <dt className="text-[10px] uppercase tracking-wide text-slate-400">Rating</dt>
                            <dd className="mt-0.5">
                              {s.providerRating ? (
                                <Stars value={s.providerRating} className="h-3.5 w-3.5" />
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </dd>
                          </div>
                        </dl>
                        {s.providerRatingComment ? (
                          <p className="mt-2 text-sm text-slate-600">{s.providerRatingComment}</p>
                        ) : null}
                        <div className="mt-3">
                          <JoinLiveButton sessionId={s.id} status={s.status} />
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="scroll-area mt-5 hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[720px] border-separate border-spacing-y-2 text-left text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                          <th className="px-4 pb-1 font-semibold">When</th>
                          <th className="px-4 pb-1 font-semibold">Room</th>
                          <th className="px-4 pb-1 font-semibold">Interpreter</th>
                          <th className="px-4 pb-1 font-semibold">Language</th>
                          <th className="px-4 pb-1 font-semibold">Duration</th>
                          <th className="px-4 pb-1 font-semibold">Rating</th>
                          <th className="px-4 pb-1 font-semibold">Problems</th>
                          <th className="px-4 pb-1 font-semibold">Status</th>
                          <th className="px-4 pb-1 font-semibold">Live</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessions.map((s) => (
                          <tr
                            key={s.id}
                            className="bg-white/70 [&>td]:border-y [&>td]:border-slate-200/70 [&>td]:px-4 [&>td]:py-3 [&>td:first-child]:rounded-l-2xl [&>td:first-child]:border-l [&>td:last-child]:rounded-r-2xl [&>td:last-child]:border-r"
                          >
                            <td className="whitespace-nowrap text-slate-500">
                              {new Date(s.createdAt).toLocaleString()}
                            </td>
                            <td className="font-medium">
                              {clinicLabel(s)}
                              {s.department?.name ? (
                                <span className="block text-xs font-normal text-slate-500">
                                  {s.department.name}
                                </span>
                              ) : null}
                            </td>
                            <td>{s.translator?.fullName || "—"}</td>
                            <td>{s.language?.name || "—"}</td>
                            <td>{formatDuration(s.durationSeconds)}</td>
                            <td>
                              {s.providerRating ? (
                                <div>
                                  <Stars value={s.providerRating} className="h-3.5 w-3.5" />
                                  <span className="mt-1 block text-xs text-slate-500">
                                    {["", "Poor", "Fair", "Good", "Great", "Excellent"][s.providerRating]}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="max-w-[180px] text-slate-600">
                              {s.providerRatingComment || "—"}
                            </td>
                            <td>
                              <StatusPill status={s.status} />
                            </td>
                            <td>
                              <JoinLiveButton sessionId={s.id} status={s.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>
        ) : null}
      </div>
    </Layout>
  );
}
