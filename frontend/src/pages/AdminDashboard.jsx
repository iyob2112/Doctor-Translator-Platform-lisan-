import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/client.js";
import Layout, {
  Avatar,
  Card,
  CardTitle,
  EmptyState,
  Stat,
  StatusPill,
  Stars,
  formatDuration,
} from "../components/Layout.jsx";
import Icon from "../components/Icon.jsx";
import JoinLiveButton from "../components/JoinLiveButton.jsx";
import { useSocket } from "../hooks/useSocket.js";
import { useAuth } from "../context/AuthContext.jsx";
import { clinicLabel } from "../roles.js";
import { ADMIN_PERMISSIONS, can, canAny, isFullAdmin } from "../permissions.js";

const emptyUser = {
  fullName: "",
  email: "",
  password: "",
  role: "hospital_admin",
  organizationName: "",
  departmentId: "",
  languageIds: [],
};

const emptyTranslator = {
  fullName: "",
  email: "",
  password: "",
  languageIds: [],
};

const emptyStaff = {
  fullName: "",
  email: "",
  password: "",
  permissions: ["sessions.view"],
};

const allTabs = [
  { id: "sessions", label: "Sessions", icon: "activity", permission: "sessions.view" },
  { id: "users", label: "Hospital admins", icon: "users", permission: "hospitals.manage" },
  { id: "translators", label: "Translators", icon: "language", any: ["translators.create", "translators.manage"] },
  { id: "payouts", label: "Payouts", icon: "coin", permission: "payouts.review" },
  { id: "languages", label: "Languages", icon: "globe", permission: "languages.manage" },
  { id: "staff", label: "Subadmins", icon: "shield", adminOnly: true },
];

function tabAllowed(tab, user) {
  if (!tab) return false;
  if (tab.adminOnly) return isFullAdmin(user);
  if (tab.any) return canAny(user, tab.any);
  return can(user, tab.permission);
}

const methodLabel = {
  telebirr: "Telebirr",
  cbe: "CBE Birr",
  bank: "Bank",
};

const roleTone = {
  doctor: "bg-brand-50 text-brand-700",
  translator: "bg-plum-50 text-plum-700",
  admin: "bg-amber-50 text-amber-700",
  hospital_admin: "bg-slate-100 text-slate-700",
  subadmin: "bg-amber-50 text-amber-800",
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs = allTabs.filter((item) => tabAllowed(item, user));
  const [tab, setTab] = useState(() => {
    const requested = allTabs.find((item) => item.id === searchParams.get("tab"));
    if (tabAllowed(requested, user)) return requested.id;
    return tabs[0]?.id || "";
  });
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [filters, setFilters] = useState({
    doctor_id: "",
    translator_id: "",
    organization_id: "",
    department_id: "",
    language_id: "",
    status: "",
    date_from: "",
    date_to: "",
  });
  const [form, setForm] = useState(emptyUser);
  const [translatorForm, setTranslatorForm] = useState(emptyTranslator);
  const [staffForm, setStaffForm] = useState(emptyStaff);
  const [lang, setLang] = useState({ code: "", name: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [rejectFor, setRejectFor] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [resetFor, setResetFor] = useState(null);
  const [resetPassword, setResetPassword] = useState("");
  const [payoutMonths, setPayoutMonths] = useState([]);
  const [openSessionId, setOpenSessionId] = useState("");

  useEffect(() => {
    const next = searchParams.get("tab");
    const match = allTabs.find((item) => item.id === next);
    if (tabAllowed(match, user)) setTab(match.id);
    else if (tabs[0]) setTab(tabs[0].id);
  }, [searchParams, user]);

  useSocket({
    "translator:availability_changed": (payload) => {
      const id = payload?.translatorId || payload?.translator_id;
      if (!id) return;
      setUsers((prev) =>
        prev.map((user) =>
          user.id === id
            ? {
                ...user,
                translatorProfile: {
                  ...(user.translatorProfile || {}),
                  isOnline: Boolean(payload.is_online),
                },
              }
            : user
        )
      );
    },
  });

  async function loadBase() {
    const [userRes, langRes] = await Promise.all([
      api.get("/admin/users"),
      api.get("/languages"),
    ]);
    setUsers(userRes.data.users);
    setLanguages(langRes.data.languages);
  }

  async function loadSessions() {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    const { data } = await api.get(`/sessions?${params.toString()}`);
    setSessions(data.sessions);
  }

  useEffect(() => {
    loadBase().catch(() => setMessage("Could not load admin data"));
  }, []);

  async function loadWithdrawals() {
    const { data } = await api.get("/admin/withdrawals");
    setPayoutMonths(data.months || []);
  }

  useEffect(() => {
    if (!can(user, "sessions.view")) return undefined;
    loadSessions().catch(() => {});
    const timer = setInterval(() => loadSessions().catch(() => {}), 8000);
    return () => clearInterval(timer);
  }, [filters, user]);

  useEffect(() => {
    if (tab === "payouts") loadWithdrawals().catch(() => setError("Could not load payouts"));
  }, [tab]);

  const hospitalDesks = users.filter((u) => u.role === "hospital_admin");
  const translators = users
    .filter((u) => u.role === "translator")
    .slice()
    .sort((a, b) => {
      const aa = a.isActive ? 0 : 1;
      const ba = b.isActive ? 0 : 1;
      if (aa !== ba) return aa - ba;
      const ao = a.translatorProfile?.isOnline ? 0 : 1;
      const bo = b.translatorProfile?.isOnline ? 0 : 1;
      if (ao !== bo) return ao - bo;
      const af = a.translatorProfile?.flagged ? 0 : 1;
      const bf = b.translatorProfile?.flagged ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.fullName.localeCompare(b.fullName);
    });
  const deskAccounts = users.filter((u) => u.role === "hospital_admin" || (isFullAdmin(user) && u.role === "admin"));
  const staffAccounts = users.filter((u) => u.role === "subadmin");
  const onlineCount = translators.filter((t) => t.translatorProfile?.isOnline).length;
  const flaggedCount = translators.filter((t) => t.translatorProfile?.flagged).length;

  const filtersActive = useMemo(
    () => Object.values(filters).some(Boolean),
    [filters]
  );

  async function createUser(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/admin/users", form);
      setForm(emptyUser);
      setMessage("Account created");
      loadBase();
    } catch (err) {
      setError(err.response?.data?.error || "Could not create account");
    }
  }

  async function createStaff(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/admin/users", { ...staffForm, role: "subadmin" });
      setStaffForm(emptyStaff);
      setMessage("Subadmin created. Give them this email and password to sign in.");
      loadBase();
    } catch (err) {
      setError(err.response?.data?.error || "Could not create subadmin");
    }
  }

  async function saveStaffPermissions(id, permissions) {
    setError("");
    try {
      await api.patch(`/admin/users/${id}`, { permissions });
      setMessage("Permissions updated");
      loadBase();
    } catch (err) {
      setError(err.response?.data?.error || "Could not update permissions");
    }
  }

  async function createTranslator(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/admin/users", { ...translatorForm, role: "translator" });
      setTranslatorForm(emptyTranslator);
      setMessage("Translator created. Give them this email and password to sign in.");
      loadBase();
    } catch (err) {
      setError(err.response?.data?.error || "Could not create translator");
    }
  }

  async function deactivate(id) {
    setError("");
    try {
      await api.patch(`/admin/users/${id}/deactivate`);
      setMessage("Account deactivated. They cannot sign in until you activate them again.");
      loadBase();
    } catch (err) {
      setError(err.response?.data?.error || "Could not deactivate account");
    }
  }

  async function removeUser(id) {
    if (!window.confirm("Delete this account? This cannot be undone. Accounts with sessions must be deactivated instead.")) {
      return;
    }
    setError("");
    try {
      await api.delete(`/admin/users/${id}`);
      setMessage("Account deleted.");
      loadBase();
    } catch (err) {
      setError(err.response?.data?.error || "Could not delete account");
    }
  }

  async function activate(id) {
    setError("");
    try {
      await api.patch(`/admin/users/${id}/activate`);
      setMessage("Account activated. They can sign in and work.");
      loadBase();
    } catch (err) {
      setError(err.response?.data?.error || "Could not activate account");
    }
  }

  async function setApproval(id, status, reason) {
    setError("");
    try {
      await api.patch(`/admin/translators/${id}/approval`, { status, reason });
      setRejectFor(null);
      setRejectReason("");
      setMessage(status === "approved" ? "Translator activated" : "Translator updated");
      loadBase();
    } catch (err) {
      setError(err.response?.data?.error || "Could not update approval");
    }
  }

  async function setFlag(id, flagged) {
    setError("");
    try {
      await api.patch(`/admin/translators/${id}/flag`, { flagged });
      setMessage(flagged ? "Translator flagged" : "Flag cleared");
      loadBase();
    } catch (err) {
      setError(err.response?.data?.error || "Could not update flag");
    }
  }

  async function reviewPayout(id, status) {
    setError("");
    try {
      await api.patch(`/admin/withdrawals/${id}`, { status });
      setMessage(
        status === "paid"
          ? "Marked paid"
          : status === "approved"
            ? "Payout approved"
            : "Withdraw request rejected"
      );
      loadWithdrawals();
    } catch (err) {
      setError(err.response?.data?.error || "Could not update payout");
    }
  }

  async function submitAdminReset(e) {
    e.preventDefault();
    setError("");
    try {
      await api.patch(`/admin/users/${resetFor}/reset-password`, { password: resetPassword });
      setResetFor(null);
      setResetPassword("");
      setMessage("Password reset. They can sign in with the new password immediately.");
    } catch (err) {
      setError(err.response?.data?.error || "Could not reset password");
    }
  }

  return (
    <Layout
      eyebrow="Operations"
      title={isFullAdmin(user) ? "Admin console" : "Subadmin console"}
      description={
        isFullAdmin(user)
          ? "Create hospital logins, translators, and subadmins. Assign each person only the functions they should use."
          : "You can use only the functions the platform admin assigned to you."
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat icon="users" label="Accounts" value={users.length} />
        <Stat icon="building" label="Hospitals" value={hospitalDesks.length} tone="plum" />
        <Stat icon="language" label={`Interpreters · ${onlineCount} online`} value={translators.length} tone="slate" />
        <Stat icon="flag" label="Flagged" value={flaggedCount} tone="amber" />
        <Stat icon="activity" label="Sessions" value={sessions.length} tone="amber" />
      </div>

      <nav className="mt-6 inline-flex flex-wrap gap-1 rounded-full border border-white/70 bg-white/70 p-1 shadow-soft backdrop-blur">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setSearchParams(t.id === "sessions" ? {} : { tab: t.id }, { replace: true });
            }}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === t.id ? "bg-ink text-white shadow-sm" : "text-slate-500 hover:text-ink"
            }`}
          >
            <Icon name={t.icon} className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </nav>

      {message ? (
        <p className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-brand-50 px-4 py-2.5 text-sm text-brand-700">
          <Icon name="check" className="h-4 w-4" />
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-2.5 text-sm text-rose-600">
          <Icon name="x" className="h-4 w-4" />
          {error}
        </p>
      ) : null}

      <div className="mt-6">
        {tab === "sessions" ? (
          <Card>
            <CardTitle
              icon="filter"
              title="Session log"
              hint="Open a row to see everything the hospital and interpreter saved."
              right={
                filtersActive ? (
                  <button
                    onClick={() =>
                      setFilters({
                        doctor_id: "",
                        translator_id: "",
                        organization_id: "",
                        department_id: "",
                        language_id: "",
                        status: "",
                        date_from: "",
                        date_to: "",
                      })
                    }
                    className="btn-ghost px-4 py-2"
                  >
                    <Icon name="x" className="h-4 w-4" />
                    Clear
                  </button>
                ) : null
              }
            />

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <select
                value={filters.doctor_id}
                onChange={(e) => setFilters((f) => ({ ...f, doctor_id: e.target.value }))}
                className="select"
              >
                <option value="">All hospitals</option>
                {hospitalDesks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fullName}
                  </option>
                ))}
              </select>
              <select
                value={filters.translator_id}
                onChange={(e) => setFilters((f) => ({ ...f, translator_id: e.target.value }))}
                className="select"
              >
                <option value="">All translators</option>
                {translators.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fullName}
                  </option>
                ))}
              </select>
              <select
                value={filters.language_id}
                onChange={(e) => setFilters((f) => ({ ...f, language_id: e.target.value }))}
                className="select"
              >
                <option value="">All languages</option>
                {languages.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <select
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                className="select"
              >
                <option value="">All statuses</option>
                {["pending", "active", "completed", "cancelled"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <input
                type="date"
                value={filters.date_from}
                onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))}
                className="field"
              />
              <input
                type="date"
                value={filters.date_to}
                onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))}
                className="field"
              />
            </div>

            {!sessions.length ? (
              <div className="mt-6">
                <EmptyState
                  icon="filter"
                  title="No matching sessions"
                  hint="Try widening the filters or clearing them."
                />
              </div>
            ) : (
              <>
                <div className="mt-6 space-y-3 lg:hidden">
                  {sessions.map((s) => {
                    const open = openSessionId === s.id;
                    return (
                      <article
                        key={s.id}
                        className="rounded-3xl border border-slate-200/80 bg-white/80 p-4"
                      >
                        <button
                          type="button"
                          className="flex w-full items-start justify-between gap-3 text-left"
                          onClick={() => setOpenSessionId(open ? "" : s.id)}
                        >
                          <div className="min-w-0">
                            <p className="text-xs text-slate-400">
                              {new Date(s.createdAt).toLocaleString()}
                            </p>
                            <p className="mt-1 font-semibold">
                              {s.organization?.name || clinicLabel(s)}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              {s.translator?.fullName || "No interpreter"} · {s.language?.name || "—"}
                            </p>
                          </div>
                          <StatusPill status={s.status} />
                        </button>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-slate-500">
                            {formatDuration(s.durationSeconds)}
                            {s.department?.name ? ` · ${s.department.name}` : ""}
                          </span>
                          {s.providerRating ? (
                            <Stars value={s.providerRating} className="h-3.5 w-3.5" />
                          ) : null}
                          <div className="ml-auto">
                            <JoinLiveButton sessionId={s.id} status={s.status} />
                          </div>
                        </div>
                        {open ? (
                          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <p>
                                <span className="label">Doctor</span>
                                <span className="mt-1 block font-semibold">{s.attendingName || "—"}</span>
                              </p>
                              <p>
                                <span className="label">Room</span>
                                <span className="mt-1 block font-semibold">{s.roomLabel || "—"}</span>
                              </p>
                              <p>
                                <span className="label">Reason for visit</span>
                                <span className="mt-1 block font-semibold">{s.visitReason || "—"}</span>
                              </p>
                              <p>
                                <span className="label">Problems</span>
                                <span className="mt-1 block font-semibold">
                                  {s.providerRatingComment || "—"}
                                </span>
                              </p>
                            </div>
                            <p className="mt-3">
                              <span className="label">Interpreter notes</span>
                              <span className="mt-1 block whitespace-pre-wrap font-medium text-slate-700">
                                {s.interpreterNotes || "—"}
                              </span>
                            </p>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
                <div className="scroll-area mt-6 hidden overflow-x-auto lg:block">
                  <table className="w-full min-w-[860px] border-separate border-spacing-y-2 text-left text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                        <th className="px-4 pb-1 font-semibold">When</th>
                        <th className="px-4 pb-1 font-semibold">Hospital</th>
                        <th className="px-4 pb-1 font-semibold">Interpreter</th>
                        <th className="px-4 pb-1 font-semibold">Language</th>
                        <th className="px-4 pb-1 font-semibold">Department</th>
                        <th className="px-4 pb-1 font-semibold">Duration</th>
                        <th className="px-4 pb-1 font-semibold">Rating</th>
                        <th className="px-4 pb-1 font-semibold">Status</th>
                        <th className="px-4 pb-1 font-semibold">Live</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((s) => {
                        const open = openSessionId === s.id;
                        return (
                          <Fragment key={s.id}>
                            <tr
                              onClick={() => setOpenSessionId(open ? "" : s.id)}
                              className="cursor-pointer bg-white/70 transition hover:bg-white [&>td]:border-y [&>td]:border-slate-200/70 [&>td]:px-4 [&>td]:py-3 [&>td:first-child]:rounded-l-2xl [&>td:first-child]:border-l [&>td:last-child]:rounded-r-2xl [&>td:last-child]:border-r"
                            >
                              <td className="whitespace-nowrap text-slate-500">
                                {new Date(s.createdAt).toLocaleString()}
                              </td>
                              <td className="font-medium">{s.organization?.name || clinicLabel(s)}</td>
                              <td>{s.translator?.fullName || <span className="text-slate-400">—</span>}</td>
                              <td>{s.language?.name || <span className="text-slate-400">—</span>}</td>
                              <td className="text-slate-500">{s.department?.name || "—"}</td>
                              <td className="whitespace-nowrap text-slate-500">
                                {formatDuration(s.durationSeconds)}
                              </td>
                              <td>
                                {s.providerRating ? (
                                  <Stars value={s.providerRating} className="h-3.5 w-3.5" />
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td>
                                <StatusPill status={s.status} />
                              </td>
                              <td onClick={(e) => e.stopPropagation()}>
                                <JoinLiveButton sessionId={s.id} status={s.status} />
                              </td>
                            </tr>
                            {open ? (
                              <tr>
                                <td colSpan={9} className="px-4 pb-4">
                                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm">
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                      <p>
                                        <span className="label">Doctor</span>
                                        <span className="mt-1 block font-semibold">
                                          {s.attendingName || "—"}
                                        </span>
                                      </p>
                                      <p>
                                        <span className="label">Room</span>
                                        <span className="mt-1 block font-semibold">{s.roomLabel || "—"}</span>
                                      </p>
                                      <p>
                                        <span className="label">Reason for visit</span>
                                        <span className="mt-1 block font-semibold">
                                          {s.visitReason || "—"}
                                        </span>
                                      </p>
                                      <p>
                                        <span className="label">Hospital rating</span>
                                        <span className="mt-1 block font-semibold">
                                          {s.providerRating ? `${s.providerRating} / 5` : "—"}
                                        </span>
                                      </p>
                                      <p>
                                        <span className="label">Problems</span>
                                        <span className="mt-1 block font-semibold">
                                          {s.providerRatingComment || "—"}
                                        </span>
                                      </p>
                                      <p>
                                        <span className="label">Hand off</span>
                                        <span className="mt-1 block font-semibold">
                                          {s.handoffReason ||
                                            s.transfers?.[0]?.reason ||
                                            "—"}
                                        </span>
                                      </p>
                                    </div>
                                    <p className="mt-4">
                                      <span className="label">Interpreter notes</span>
                                      <span className="mt-1 block whitespace-pre-wrap font-medium text-slate-700">
                                        {s.interpreterNotes || "—"}
                                      </span>
                                    </p>
                                    {s.transfers?.length ? (
                                      <ul className="mt-4 space-y-1 text-slate-600">
                                        {s.transfers.map((t) => (
                                          <li key={t.id}>
                                            {t.fromTranslator?.fullName || "Interpreter"} →{" "}
                                            {t.toTranslator?.fullName || "Interpreter"}
                                            {t.reason ? ` · ${t.reason}` : ""}
                                          </li>
                                        ))}
                                      </ul>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        ) : null}

        {tab === "users" ? (
          <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <Card>
              <CardTitle icon="plus" title="Create account" hint="One hospital login per hospital. They manage their own departments." />
              <form className="mt-6 space-y-3" onSubmit={createUser}>
                <input
                  required
                  placeholder="Full name"
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  className="field"
                />
                <input
                  required
                  type="email"
                  placeholder="Email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="field"
                />
                <input
                  required
                  placeholder="Temporary password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="field"
                />
                {isFullAdmin(user) ? (
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="select"
                  >
                    <option value="hospital_admin">Hospital</option>
                    <option value="admin">Platform admin</option>
                  </select>
                ) : null}
                {form.role === "hospital_admin" ? (
                  <input
                    required
                    placeholder="Hospital name"
                    value={form.organizationName}
                    onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
                    className="field"
                  />
                ) : null}

                <button className="btn-dark w-full py-3">
                  <Icon name="plus" className="h-4 w-4" />
                  Create account
                </button>
              </form>
            </Card>

            <Card>
              <CardTitle icon="users" title="Hospital logins" hint={`${deskAccounts.length} accounts`} />
              <div className="scroll-area mt-5 max-h-[560px] space-y-2 overflow-y-auto pr-1">
                {deskAccounts.map((u) => (
                  <div
                    key={u.id}
                    className="rounded-3xl border border-slate-200/80 bg-white/70 p-3 transition hover:border-brand-200"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={u.fullName} className="h-10 w-10 text-xs" />
                      <div className="min-w-0 flex-1 leading-tight">
                        <p className="truncate font-semibold">{u.fullName}</p>
                        <p className="truncate text-xs text-slate-500">{u.email}</p>
                        {u.organization?.name ? (
                          <p className="mt-1 truncate text-xs text-slate-400">{u.organization.name}</p>
                        ) : null}
                      </div>
                      <span className={`chip ${roleTone[u.role]}`}>{u.role}</span>
                      {u.isActive ? (
                        <>
                          <button
                            onClick={() => {
                              setResetFor(resetFor === u.id ? null : u.id);
                              setResetPassword("");
                            }}
                            className="grid h-11 w-11 place-items-center rounded-full text-slate-400 transition hover:bg-amber-50 hover:text-amber-700"
                            title="Reset password"
                          >
                            <Icon name="key" className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deactivate(u.id)}
                            className="grid h-11 w-11 place-items-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                            title="Deactivate account"
                          >
                            <Icon name="x" className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => removeUser(u.id)}
                            className="grid h-11 w-11 place-items-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-700"
                            title="Delete account"
                          >
                            <Icon name="trash" className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="chip bg-slate-100 text-slate-500">off</span>
                          <button
                            onClick={() => activate(u.id)}
                            className="grid h-11 w-11 place-items-center rounded-full text-slate-400 transition hover:bg-brand-50 hover:text-brand-700"
                            title="Activate account"
                          >
                            <Icon name="check" className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                    {resetFor === u.id ? (
                      <form className="mt-3 flex gap-2" onSubmit={submitAdminReset}>
                        <input
                          required
                          minLength={8}
                          type="password"
                          placeholder="New temporary password"
                          value={resetPassword}
                          onChange={(e) => setResetPassword(e.target.value)}
                          className="field"
                        />
                        <button className="btn-dark shrink-0 px-4">Reset</button>
                      </form>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ) : null}

        {tab === "translators" ? (
          <div className={`grid gap-6 ${can(user, "translators.create") ? "lg:grid-cols-[0.85fr_1.15fr]" : ""}`}>
            {can(user, "translators.create") ? (
            <Card>
              <CardTitle
                icon="plus"
                title="Add a translator"
                hint="Give them this email and password. The account starts active so they can work right away."
              />
              <form className="mt-6 space-y-3" onSubmit={createTranslator}>
                <input
                  required
                  placeholder="Full name"
                  value={translatorForm.fullName}
                  onChange={(e) =>
                    setTranslatorForm((f) => ({ ...f, fullName: e.target.value }))
                  }
                  className="field"
                />
                <input
                  required
                  type="email"
                  placeholder="Login email"
                  value={translatorForm.email}
                  onChange={(e) =>
                    setTranslatorForm((f) => ({ ...f, email: e.target.value }))
                  }
                  className="field"
                />
                <input
                  required
                  minLength={8}
                  placeholder="Temporary password"
                  value={translatorForm.password}
                  onChange={(e) =>
                    setTranslatorForm((f) => ({ ...f, password: e.target.value }))
                  }
                  className="field"
                />
                <div>
                  <p className="label">Languages they will interpret</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {languages.map((l) => {
                      const on = translatorForm.languageIds.includes(l.id);
                      return (
                        <button
                          type="button"
                          key={l.id}
                          onClick={() =>
                            setTranslatorForm((f) => ({
                              ...f,
                              languageIds: on
                                ? f.languageIds.filter((id) => id !== l.id)
                                : [...f.languageIds, l.id],
                            }))
                          }
                          className={on ? "chip-on" : "chip-off"}
                        >
                          {on ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
                          {l.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button className="btn-dark w-full py-3">
                  <Icon name="plus" className="h-4 w-4" />
                  Create translator
                </button>
              </form>
            </Card>
            ) : null}

            <Card>
              <CardTitle
                icon="language"
                title="Interpreters"
                hint="Open a profile to see hours and pay, change languages, or activate and deactivate."
              />
              <div className="scroll-area mt-5 max-h-[620px] space-y-2 overflow-y-auto pr-1">
                {translators.length ? (
                  translators.map((u) => {
                    const profile = u.translatorProfile || {};
                    return (
                      <div
                        key={u.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/admin/translators/${u.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate(`/admin/translators/${u.id}`);
                          }
                        }}
                        className={`cursor-pointer rounded-3xl border bg-white/70 p-3 ${
                          profile.flagged
                            ? "border-rose-200"
                            : u.isActive
                              ? "border-slate-200/80"
                              : "border-slate-200/80 opacity-70"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <Avatar name={u.fullName} className="h-10 w-10 text-xs" />
                          <div className="min-w-0 flex-1 leading-tight">
                            <p className="truncate font-semibold">{u.fullName}</p>
                            <p className="truncate text-xs text-slate-500">{u.email}</p>
                            <p className="mt-1 truncate text-xs text-slate-400">
                              {(profile.languages || []).map((l) => l.name).join(" · ") ||
                                "No languages listed"}
                            </p>
                            {profile.flaggedReason ? (
                              <p className="mt-1 text-xs text-rose-600">{profile.flaggedReason}</p>
                            ) : null}
                          </div>
                          <StatusPill
                            status={u.isActive ? "approved" : "offline"}
                            label={u.isActive ? "active" : "inactive"}
                          />
                          <StatusPill
                            status={profile.isOnline && u.isActive ? "online" : "offline"}
                            label={profile.isOnline && u.isActive ? "online" : "offline"}
                          />
                          {profile.flagged ? <StatusPill status="flagged" /> : null}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/admin/translators/${u.id}`);
                            }}
                            className="btn-dark px-3 py-2 text-xs"
                          >
                            View profile
                          </button>
                          {can(user, "translators.manage") ? (
                            u.isActive ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deactivate(u.id);
                              }}
                              className="btn-ghost px-3 py-2 text-xs text-rose-700"
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                activate(u.id);
                              }}
                              className="btn-brand px-3 py-2 text-xs"
                            >
                              Activate
                            </button>
                          )
                          ) : null}
                          {can(user, "translators.manage") ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeUser(u.id);
                              }}
                              className="btn-ghost px-3 py-2 text-xs text-slate-600"
                            >
                              Delete
                            </button>
                          ) : null}
                          {profile.flagged && can(user, "translators.manage") ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setFlag(u.id, false);
                              }}
                              className="btn-ghost px-4 py-2"
                            >
                              Clear flag
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <EmptyState
                    icon="language"
                    title="No interpreters yet"
                    hint="Create an interpreter on the left and assign their languages."
                  />
                )}
              </div>
            </Card>
          </div>
        ) : null}

        {tab === "languages" ? (
          <Card>
            <CardTitle icon="globe" title="Languages" hint="Used for interpreter matching." />
            <form
              className="mt-5 flex flex-wrap gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                await api.post("/languages", lang);
                setLang({ code: "", name: "" });
                loadBase();
              }}
            >
              <input
                value={lang.code}
                onChange={(e) => setLang({ ...lang, code: e.target.value })}
                placeholder="Code (es)"
                className="field sm:w-32"
              />
              <input
                value={lang.name}
                onChange={(e) => setLang({ ...lang, name: e.target.value })}
                placeholder="Name (Spanish)"
                className="field sm:w-56"
              />
              <button className="btn-dark px-5">
                <Icon name="plus" className="h-4 w-4" />
                Add
              </button>
            </form>
            <div className="mt-6 flex flex-wrap gap-2">
              {languages.map((l) => (
                <span
                  key={l.id}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2 text-sm"
                >
                  <Icon name="globe" className="h-4 w-4 text-slate-400" />
                  <span className="font-medium">{l.name}</span>
                  <span className="text-xs uppercase tracking-wider text-slate-400">{l.code}</span>
                </span>
              ))}
            </div>
          </Card>
        ) : null}

        {tab === "payouts" ? (
          <div className="space-y-6">
            <Card>
              <CardTitle
                icon="coin"
                title="Monthly payouts"
                hint="Each interpreter is paid on the day they started, one month later. The current month is first. Approve, then mark paid after you send the Birr."
              />
            </Card>
            {payoutMonths.length ? (
              payoutMonths.map((month, index) => (
                <Card key={month.key}>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                        {index === 0 ? "Current month first" : "Earlier month"}
                      </p>
                      <h3 className="mt-1 font-display text-2xl">{month.label}</h3>
                      <p className="text-sm text-slate-500">{month.windowLabel}</p>
                    </div>
                    <p className="text-sm text-slate-500">
                      {month.withdrawals.length
                        ? `${month.withdrawals.length} request${month.withdrawals.length === 1 ? "" : "s"}`
                        : "No requests yet"}
                    </p>
                  </div>
                  <div className="mt-5 space-y-3">
                    {month.withdrawals.length ? (
                      month.withdrawals.map((w) => (
                        <div
                          key={w.id}
                          className="rounded-3xl border border-slate-200/80 bg-white/70 px-5 py-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-display text-xl">
                                {Number(w.amountEtb).toLocaleString()} Birr
                              </p>
                              <p className="text-sm text-slate-600">
                                {w.translator?.fullName} · {w.translator?.email}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                Paid on the {w.period?.dayLabel || "start day"}
                                {w.period?.windowLabel ? ` · ${w.period.windowLabel}` : ""}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                {methodLabel[w.method] || w.method} · {w.accountName} · {w.accountNumber}
                              </p>
                            </div>
                            <StatusPill
                              status={w.status}
                              label={w.status === "pending" ? "under review" : w.status}
                            />
                          </div>
                          {w.status === "pending" || w.status === "approved" ? (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {w.status === "pending" ? (
                                <>
                                  <button
                                    type="button"
                                    className="btn-dark px-4 py-2 text-sm"
                                    onClick={() => reviewPayout(w.id, "approved")}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-ghost px-4 py-2 text-sm"
                                    onClick={() => reviewPayout(w.id, "rejected")}
                                  >
                                    Reject
                                  </button>
                                </>
                              ) : null}
                              <button
                                type="button"
                                className="btn-ghost px-4 py-2 text-sm"
                                onClick={() => reviewPayout(w.id, "paid")}
                              >
                                Mark paid
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <EmptyState
                        icon="coin"
                        title="No payout requests this month"
                        hint="When an interpreter enters their payment method on their start day, it shows here as under review."
                      />
                    )}
                  </div>
                </Card>
              ))
            ) : (
              <Card>
                <EmptyState
                  icon="coin"
                  title="No payout months yet"
                  hint="Monthly interpreter payouts will appear here, newest month first."
                />
              </Card>
            )}
          </div>
        ) : null}

        {tab === "staff" && isFullAdmin(user) ? (
          <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <Card>
              <CardTitle
                icon="plus"
                title="Add a subadmin"
                hint="Choose which functions they may use. They cannot create admins or change these permissions later."
              />
              <form className="mt-6 space-y-3" onSubmit={createStaff}>
                <input
                  required
                  placeholder="Full name"
                  value={staffForm.fullName}
                  onChange={(e) => setStaffForm((f) => ({ ...f, fullName: e.target.value }))}
                  className="field"
                />
                <input
                  required
                  type="email"
                  placeholder="Login email"
                  value={staffForm.email}
                  onChange={(e) => setStaffForm((f) => ({ ...f, email: e.target.value }))}
                  className="field"
                />
                <input
                  required
                  minLength={8}
                  placeholder="Temporary password"
                  value={staffForm.password}
                  onChange={(e) => setStaffForm((f) => ({ ...f, password: e.target.value }))}
                  className="field"
                />
                <div>
                  <p className="label">Functions they can use</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ADMIN_PERMISSIONS.map((item) => {
                      const on = staffForm.permissions.includes(item.id);
                      return (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() =>
                            setStaffForm((f) => ({
                              ...f,
                              permissions: on
                                ? f.permissions.filter((id) => id !== item.id)
                                : [...f.permissions, item.id],
                            }))
                          }
                          className={on ? "chip-on" : "chip-off"}
                        >
                          {on ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button className="btn-dark w-full py-3">
                  <Icon name="plus" className="h-4 w-4" />
                  Create subadmin
                </button>
              </form>
            </Card>

            <Card>
              <CardTitle
                icon="shield"
                title="Subadmins"
                hint="Turn functions on or off at any time, or deactivate the account."
              />
              <div className="scroll-area mt-5 max-h-[620px] space-y-2 overflow-y-auto pr-1">
                {staffAccounts.length ? (
                  staffAccounts.map((u) => {
                    const granted = u.permissions || [];
                    return (
                      <div
                        key={u.id}
                        className={`rounded-3xl border bg-white/70 p-3 ${
                          u.isActive ? "border-slate-200/80" : "border-slate-200/80 opacity-70"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <Avatar name={u.fullName} className="h-10 w-10 text-xs" />
                          <div className="min-w-0 flex-1 leading-tight">
                            <p className="truncate font-semibold">{u.fullName}</p>
                            <p className="truncate text-xs text-slate-500">{u.email}</p>
                          </div>
                          <StatusPill
                            status={u.isActive ? "approved" : "offline"}
                            label={u.isActive ? "active" : "inactive"}
                          />
                          {u.isActive ? (
                            <button
                              type="button"
                              onClick={() => deactivate(u.id)}
                              className="btn-ghost px-3 py-2 text-xs text-rose-700"
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => activate(u.id)}
                              className="btn-brand px-3 py-2 text-xs"
                            >
                              Activate
                            </button>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {ADMIN_PERMISSIONS.map((item) => {
                            const on = granted.includes(item.id);
                            return (
                              <button
                                type="button"
                                key={item.id}
                                disabled={!u.isActive}
                                onClick={() => {
                                  const next = on
                                    ? granted.filter((id) => id !== item.id)
                                    : [...granted, item.id];
                                  if (!next.length) {
                                    setError("Give the subadmin at least one permission");
                                    return;
                                  }
                                  saveStaffPermissions(u.id, next);
                                }}
                                className={on ? "chip-on" : "chip-off"}
                              >
                                {on ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
                                {item.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <EmptyState
                    icon="shield"
                    title="No subadmins yet"
                    hint="Create a subadmin on the left and assign the functions they may use."
                  />
                )}
              </div>
            </Card>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
