import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import { clinicLabel } from "../roles.js";
import { useAuth } from "../context/AuthContext.jsx";
import { can } from "../permissions.js";

function formatBirr(amount) {
  return `${Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} Birr`;
}

function formatHours(hours) {
  return Number(hours || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function AdminTranslatorProfile() {
  const { user } = useAuth();
  const canEdit = can(user, "translators.manage") || can(user, "translators.create");
  const canManage = can(user, "translators.manage");
  const { id } = useParams();
  const navigate = useNavigate();
  const [person, setPerson] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [languages, setLanguages] = useState([]);
  const [languageIds, setLanguageIds] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [profileRes, langRes] = await Promise.all([
      api.get(`/admin/translators/${id}`),
      api.get("/languages"),
    ]);
    setPerson(profileRes.data.user);
    setEarnings(profileRes.data.earnings);
    setLanguages(langRes.data.languages || []);
    setLanguageIds(
      (profileRes.data.user.translatorProfile?.languages || []).map((l) => l.id)
    );
  }

  useEffect(() => {
    load().catch(() => setError("Could not load translator profile"));
  }, [id]);

  async function saveLanguages() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!languageIds.length) {
        setError("Assign at least one language");
        setBusy(false);
        return;
      }
      const { data } = await api.patch(`/admin/users/${id}`, { languageIds });
      setPerson(data.user);
      setMessage("Languages updated");
    } catch (err) {
      setError(err.response?.data?.error || "Could not update languages");
    } finally {
      setBusy(false);
    }
  }

  async function setActive(next) {
    setError("");
    setMessage("");
    try {
      await api.patch(`/admin/users/${id}/${next ? "activate" : "deactivate"}`);
      await load();
      setMessage(
        next
          ? "Account activated. They can sign in and work."
          : "Account deactivated. They cannot sign in until you activate them again."
      );
    } catch (err) {
      setError(err.response?.data?.error || "Could not update account");
    }
  }

  if (!person && !error) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex items-center gap-3 text-slate-500">
          <span className="h-3 w-3 animate-ping rounded-full bg-brand-400" />
          Loading interpreter…
        </div>
      </div>
    );
  }

  if (!person) {
    return (
      <Layout title="Interpreter not found">
        <p className="text-sm text-rose-600">{error}</p>
        <Link to="/admin?tab=translators" className="btn-ghost mt-4 inline-flex">
          Back to translators
        </Link>
      </Layout>
    );
  }

  const profile = person.translatorProfile || {};
  const stats = earnings?.stats;
  const rated = (earnings?.sessions || []).filter((s) => s.providerRating);
  const avgRating = rated.length
    ? rated.reduce((sum, s) => sum + s.providerRating, 0) / rated.length
    : null;

  return (
    <Layout
      eyebrow="Platform admin"
      title={person.fullName}
      description={`${person.email} · languages, hours worked, and account status.`}
      actions={
        <>
          {canManage && person.isActive ? (
            <button
              type="button"
              onClick={() => setActive(false)}
              className="btn-ghost text-rose-700"
            >
              Deactivate
            </button>
          ) : null}
          {canManage && !person.isActive ? (
            <button type="button" onClick={() => setActive(true)} className="btn-brand">
              Activate
            </button>
          ) : null}
          <button type="button" onClick={() => navigate("/admin?tab=translators")} className="btn-ghost">
            <Icon name="chevron" className="h-4 w-4 rotate-90" />
            Back
          </button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={person.fullName} className="h-14 w-14 text-sm" />
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            status={person.isActive ? "approved" : "offline"}
            label={person.isActive ? "active" : "inactive"}
          />
          <StatusPill
            status={profile.isOnline && person.isActive ? "online" : "offline"}
            label={profile.isOnline && person.isActive ? "online now" : "offline"}
          />
          {profile.flagged ? <StatusPill status="flagged" /> : null}
        </div>
      </div>

      {error ? (
        <p className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-2.5 text-sm text-rose-600">
          <Icon name="x" className="h-4 w-4" />
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-brand-50 px-4 py-2.5 text-sm text-brand-700">
          <Icon name="check" className="h-4 w-4" />
          {message}
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon="clock" label="Hours worked" value={stats ? formatHours(stats.hoursWorked) : "—"} />
        <Stat
          icon="coin"
          label="Pay earned"
          value={stats ? formatBirr(stats.earningsEtb) : "—"}
          tone="amber"
        />
        <Stat
          icon="check"
          label="Completed calls"
          value={stats?.completedSessions ?? "—"}
          tone="plum"
        />
        <Stat
          icon="star"
          label="Average rating"
          value={avgRating ? avgRating.toFixed(1) : "—"}
          tone="slate"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardTitle
            icon="language"
            title="Languages"
            hint={canEdit ? "Only platform staff with this permission can change these." : "Languages are assigned by the platform admin."}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {languages.map((l) => {
              const on = languageIds.includes(l.id);
              return (
                <button
                  type="button"
                  key={l.id}
                  disabled={!canEdit}
                  onClick={() =>
                    setLanguageIds((ids) =>
                      on ? ids.filter((item) => item !== l.id) : [...ids, l.id]
                    )
                  }
                  className={on ? "chip-on" : "chip-off"}
                >
                  {on ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
                  {l.name}
                </button>
              );
            })}
          </div>
          {canEdit ? (
          <button disabled={busy} onClick={saveLanguages} className="btn-dark mt-5 px-5 py-2.5">
            {busy ? "Saving…" : "Save languages"}
          </button>
          ) : null}
        </Card>

        <Card>
          <CardTitle
            icon="activity"
            title="Work history"
            hint="Completed interpretation calls, hours, and Birr."
          />
          <div className="scroll-area mt-5 max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {earnings?.sessions?.length ? (
              earnings.sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {s.language?.name || "Language"} · {clinicLabel(s)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(s.createdAt).toLocaleString()}
                      {s.department?.name ? ` · ${s.department.name}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">
                      {formatBirr(((s.durationSeconds || 0) / 3600) * 100)}
                    </p>
                    <p className="text-xs text-slate-400">{formatDuration(s.durationSeconds)}</p>
                    {s.providerRating ? (
                      <div className="mt-1 flex justify-end">
                        <Stars value={s.providerRating} className="h-3.5 w-3.5" />
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                icon="clock"
                title="No completed calls yet"
                hint="Hours and pay appear here after this interpreter finishes consults."
              />
            )}
          </div>
        </Card>
      </div>
    </Layout>
  );
}
