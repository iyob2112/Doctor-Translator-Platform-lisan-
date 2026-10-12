import { useEffect, useState } from "react";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import Layout, {
  Avatar,
  Card,
  CardTitle,
  EmptyState,
  Stat,
  StatusPill,
  formatDuration,
} from "../components/Layout.jsx";
import { roleLabel } from "../roles.js";
import Icon from "../components/Icon.jsx";

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

export default function Profile() {
  const { user, setUser, updateProfile } = useAuth();
  const [fullName, setFullName] = useState(user.fullName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [earnings, setEarnings] = useState(null);
  const [payoutMethod, setPayoutMethod] = useState(
    user.translatorProfile?.payoutMethod || "telebirr"
  );
  const [payoutAccountName, setPayoutAccountName] = useState(
    user.translatorProfile?.payoutAccountName || user.fullName || ""
  );
  const [payoutAccountNumber, setPayoutAccountNumber] = useState(
    user.translatorProfile?.payoutAccountNumber || ""
  );
  const [payoutBusy, setPayoutBusy] = useState(false);

  useEffect(() => {
    if (user.role !== "translator") return undefined;
    let cancelled = false;
    api
      .get("/translators/me/earnings")
      .then((earnRes) => {
        if (cancelled) return;
        setEarnings(earnRes.data);
        const saved = earnRes.data?.withdrawals?.[0];
        if (!user.translatorProfile?.payoutAccountNumber && saved) {
          setPayoutMethod(saved.method || "telebirr");
          setPayoutAccountName(saved.accountName || user.fullName || "");
          setPayoutAccountNumber(saved.accountNumber || "");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load translator profile");
      });
    return () => {
      cancelled = true;
    };
  }, [user.role]);

  async function saveProfile(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await updateProfile({
        fullName,
        ...(password ? { password, currentPassword } : {}),
      });
      setPassword("");
      setCurrentPassword("");
      setMessage("Profile saved");
    } catch (err) {
      setError(err.response?.data?.error || "Could not save profile");
    } finally {
      setBusy(false);
    }
  }

  async function savePayoutAccount(e) {
    e.preventDefault();
    setPayoutBusy(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.patch("/translators/me/payout-account", {
        method: payoutMethod,
        accountName: payoutAccountName,
        accountNumber: payoutAccountNumber,
      });
      if (data.user) setUser(data.user);
      if (data.earnings) setEarnings(data.earnings);
      setMessage("Payout account updated");
    } catch (err) {
      setError(err.response?.data?.error || "Could not update payout account");
    } finally {
      setPayoutBusy(false);
    }
  }

  const stats = earnings?.stats;
  const currentPeriod = earnings?.currentPeriod;
  const reviewing = earnings?.reviewingWithdrawal;
  const duePayout = earnings?.duePayout;
  const hasPayoutAccount = Boolean(
    user.translatorProfile?.payoutAccountNumber || earnings?.withdrawals?.length
  );

  return (
    <Layout
      eyebrow="Your account"
      title="Profile"
      description="Update your details. Translators earn 100 Birr per hour and are paid each month on the day they started."
    >
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <div className="flex items-center gap-4">
            <Avatar name={user.fullName} className="h-16 w-16 text-lg" />
            <div>
              <h2 className="font-display text-2xl">{user.fullName}</h2>
              <p className="text-sm capitalize text-slate-500">
                {roleLabel(user.role)} · {user.email}
              </p>
              {user.role === "translator" ? (
                <div className="mt-2 space-y-2">
                  <StatusPill status={user.translatorProfile?.approvalStatus || "pending"} />
                  {user.translatorProfile?.flagged ? <StatusPill status="flagged" /> : null}
                  {user.translatorProfile?.approvalStatus === "rejected" &&
                  user.translatorProfile?.rejectionReason ? (
                    <p className="text-sm text-rose-600">{user.translatorProfile.rejectionReason}</p>
                  ) : null}
                </div>
              ) : null}
              <p className="mt-1 text-xs text-slate-400">
                {user.organization?.name || "No organization"}
                {user.department ? ` · ${user.department.name}` : ""}
              </p>
            </div>
          </div>

          <form className="mt-8 space-y-4" onSubmit={saveProfile}>
            <label className="block">
              <span className="label">Full name</span>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="field mt-2"
                required
              />
            </label>
            <label className="block">
              <span className="label">Email</span>
              <input value={user.email} disabled className="field mt-2 opacity-70" />
            </label>
            <label className="block">
              <span className="label">Current password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="field mt-2"
                placeholder="Needed only to change password"
              />
            </label>
            <label className="block">
              <span className="label">New password</span>
              <input
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field mt-2"
                placeholder="Leave blank to keep current"
              />
            </label>

            {error ? (
              <p className="flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">
                <Icon name="x" className="h-4 w-4" />
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="flex items-center gap-2 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
                <Icon name="check" className="h-4 w-4" />
                {message}
              </p>
            ) : null}

            <button disabled={busy} className="btn-dark w-full py-3">
              {busy ? "Saving…" : "Save profile"}
            </button>
          </form>
        </Card>

        <div className="space-y-6">
          {user.role === "translator" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat
                  icon="clock"
                  label="Hours worked"
                  value={stats ? formatHours(stats.hoursWorked) : "—"}
                />
                <Stat
                  icon="coin"
                  label="Pay · 100 Birr/hr"
                  value={stats ? formatBirr(stats.earningsEtb) : "—"}
                  tone="amber"
                />
                <Stat
                  icon="check"
                  label="Completed calls"
                  value={stats?.completedSessions ?? "—"}
                  tone="plum"
                />
              </div>

              <Card>
                <CardTitle
                  icon="coin"
                  title="Interpreter pay"
                  hint="1 hour = 100 Birr. Paid next month on the day you started."
                />
                <div className="mt-5 rounded-3xl border border-brand-100 bg-brand-50/60 p-5">
                  <p className="text-sm text-slate-600">
                    This month so far · {currentPeriod?.windowLabel || "current cycle"}
                  </p>
                  <p className="mt-2 font-display text-3xl">
                    {formatBirr(reviewing ? reviewing.amountEtb : currentPeriod?.earningsEtb || 0)}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {reviewing
                      ? "Under review · the platform admin will send this after approval"
                      : duePayout
                        ? `Enter your payment method for ${duePayout.period.label}`
                        : `Paid on the ${currentPeriod?.dayLabel || "same day next month"} · ${formatHours(currentPeriod?.hoursWorked || 0)} hours × 100 Birr`}
                  </p>
                </div>
                {reviewing ? (
                  <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4">
                    <p className="text-sm font-semibold text-amber-800">Under review your money</p>
                    <p className="mt-1 text-sm text-amber-700">
                      {formatBirr(reviewing.amountEtb)} for {reviewing.period?.label || "this month"} is waiting
                      for the platform admin. When they mark it paid, this goes to 0 and the next month starts.
                    </p>
                  </div>
                ) : null}

                {hasPayoutAccount ? (
                  <form className="mt-5 space-y-3" onSubmit={savePayoutAccount}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Payout account
                    </p>
                    <p className="text-sm text-slate-600">
                      Edit the account you entered after the payout popup. Admin will use this to send the Birr.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="label">Send via</span>
                        <select
                          value={payoutMethod}
                          onChange={(e) => setPayoutMethod(e.target.value)}
                          className="field mt-2"
                        >
                          <option value="telebirr">Telebirr</option>
                          <option value="cbe">CBE Birr</option>
                          <option value="bank">Bank transfer</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="label">Account name</span>
                        <input
                          value={payoutAccountName}
                          onChange={(e) => setPayoutAccountName(e.target.value)}
                          className="field mt-2"
                          required
                        />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="label">Phone or account number</span>
                        <input
                          value={payoutAccountNumber}
                          onChange={(e) => setPayoutAccountNumber(e.target.value)}
                          className="field mt-2"
                          required
                        />
                      </label>
                    </div>
                    <button disabled={payoutBusy} className="btn-dark w-full py-3">
                      {payoutBusy ? "Saving…" : "Save payout account"}
                    </button>
                  </form>
                ) : null}

                {earnings?.withdrawals?.length ? (
                  <div className="mt-5 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Your requests
                    </p>
                    {earnings.withdrawals.map((w) => (
                      <div
                        key={w.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 text-sm"
                      >
                        <div>
                          <p className="font-medium">{formatBirr(w.amountEtb)}</p>
                          <p className="text-xs capitalize text-slate-400">
                            {w.method} · {new Date(w.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <StatusPill
                          status={w.status}
                          label={
                            w.status === "pending"
                              ? "under review"
                              : w.status === "approved"
                                ? "approved"
                                : w.status
                          }
                        />
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="scroll-area mt-5 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {earnings?.sessions?.length ? (
                    earnings.sessions.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {s.language?.name || "Language"} · {s.attendingName || s.organization?.name || s.doctor?.fullName}
                          </p>
                          <p className="text-xs text-slate-400">
                            {new Date(s.createdAt).toLocaleString()} · {s.department?.name}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">
                            {formatBirr(((s.durationSeconds || 0) / 3600) * 100)}
                          </p>
                          <p className="text-xs text-slate-400">
                            {formatDuration(s.durationSeconds)}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyState
                      icon="clock"
                      title="No paid hours yet"
                      hint="Completed interpretation calls will show hours and Birr here."
                    />
                  )}
                </div>
              </Card>

              <Card>
                <CardTitle
                  icon="language"
                  title="Spoken languages"
                  hint="Assigned by the platform admin. You cannot change them here."
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  {(user.translatorProfile?.languages || []).length ? (
                    user.translatorProfile.languages.map((l) => (
                      <span key={l.id} className="chip-on">
                        <Icon name="check" className="h-3.5 w-3.5" />
                        {l.name}
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">No languages assigned yet.</p>
                  )}
                </div>
              </Card>
            </>
          ) : (
            <Card>
              <CardTitle
                icon="user"
                title="Clinic details"
                hint="Your organization and department are set by registration or an admin."
              />
              <dl className="mt-5 grid gap-3 text-sm">
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                  <dt className="text-slate-500">Role</dt>
                  <dd className="capitalize font-medium">{user.role}</dd>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                  <dt className="text-slate-500">Organization</dt>
                  <dd className="font-medium">{user.organization?.name || "—"}</dd>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                  <dt className="text-slate-500">Department</dt>
                  <dd className="font-medium">{user.department?.name || "—"}</dd>
                </div>
              </dl>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}
