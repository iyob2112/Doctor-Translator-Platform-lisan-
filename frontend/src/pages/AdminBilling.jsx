import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import api from "../api/client.js";
import Layout, { Card, CardTitle, EmptyState, Stat, StatusPill } from "../components/Layout.jsx";
import Icon from "../components/Icon.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { can } from "../permissions.js";

const tabs = [
  { id: "overview", label: "Hospitals", icon: "building" },
  { id: "plans", label: "Plans", icon: "coin" },
  { id: "packages", label: "Minutes", icon: "clock" },
  { id: "ondemand", label: "On-demand", icon: "stetho" },
  { id: "payments", label: "Payments", icon: "activity" },
];

function formatEtb(value) {
  return `${Number(value || 0).toLocaleString("en-ET")} ETB`;
}

function formatWhen(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "Africa/Addis_Ababa",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const emptyPlan = { name: "", priceEtb: "", maxDevices: "", description: "" };
const emptyPkg = { name: "", minutes: "", priceEtb: "" };

export default function AdminBilling() {
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");
  const [catalog, setCatalog] = useState({ plans: [], packages: [], ondemand: null });
  const [overview, setOverview] = useState([]);
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [planForm, setPlanForm] = useState(emptyPlan);
  const [pkgForm, setPkgForm] = useState(emptyPkg);
  const [rateForm, setRateForm] = useState({ rateEtb: "", rateUnit: "hour", enabled: true });
  const [adjust, setAdjust] = useState({ organizationId: "", minutes: "", note: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [c, o, p, inv, s] = await Promise.all([
      api.get("/admin/billing/catalog"),
      api.get("/admin/billing/overview"),
      api.get("/admin/billing/payments"),
      api.get("/admin/billing/invoices"),
      api.get("/admin/billing/subscriptions"),
    ]);
    setCatalog(c.data);
    setOverview(o.data.hospitals || []);
    setPayments(p.data.payments || []);
    setInvoices(inv.data.invoices || []);
    setSubscriptions(s.data.subscriptions || []);
    setRateForm({
      rateEtb: c.data.ondemand?.rateEtb ?? c.data.ondemand?.hourlyRateEtb ?? "",
      rateUnit: c.data.ondemand?.rateUnit === "minute" ? "minute" : "hour",
      enabled: c.data.ondemand?.enabled !== false,
    });
  }

  useEffect(() => {
    if (!can(user, "billing.manage")) return;
    load().catch(() => setError("Could not load billing"));
  }, [user]);

  if (!can(user, "billing.manage")) {
    return <Navigate to="/admin" replace />;
  }

  async function save(fn) {
    setError("");
    try {
      await fn();
      setMessage("Saved");
      await load();
    } catch (err) {
      setError(err.response?.data?.error || "Could not save");
    }
  }

  return (
    <Layout
      eyebrow="Operations"
      title="Billing"
      description="Manage monthly plans, minute packages, on-demand hourly rate, hospital balances, and Chapa payments. Prices live in the database."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon="building" label="Hospitals" value={overview.length} />
        <Stat icon="coin" label="Plans" value={catalog.plans.length} tone="plum" />
        <Stat icon="clock" label="Packages" value={catalog.packages.length} tone="slate" />
        <Stat icon="activity" label="Payments" value={payments.length} tone="amber" />
      </div>

      <nav className="mt-6 inline-flex flex-wrap gap-1 rounded-full border border-white/70 bg-white/70 p-1 shadow-soft backdrop-blur">
        {tabs.map((t) => (
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

      <div className="mt-6 space-y-6">
        {tab === "overview" ? (
          <>
            <Card>
              <CardTitle icon="building" title="Hospital subscriptions and minutes" />
              <div className="mt-4 space-y-3">
                {overview.length ? (
                  overview.map((h) => (
                    <div key={h.id} className="rounded-3xl border border-slate-200/80 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">{h.name}</p>
                        {h.activeMode === "subscription" || h.subscription ? (
                          <StatusPill status={h.subscription?.status || "active"} label={h.subscription?.plan?.name || "Monthly"} />
                        ) : h.activeMode === "minutes" ? (
                          <StatusPill status="active" label="Minutes" />
                        ) : h.activeMode === "ondemand" ? (
                          <StatusPill status="active" label="On-demand" />
                        ) : h.activeMode === "blocked" ? (
                          <StatusPill status="failed" label="Unpaid bill" />
                        ) : (
                          <StatusPill status="pending" label="No access" />
                        )}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {h.remainingMinutes} minutes · {h.activeDevices} devices
                        {h.subscription?.expiresAt ? ` · expires ${formatWhen(h.subscription.expiresAt)}` : ""}
                        {h.unpaidInvoice ? ` · unpaid ${h.unpaidInvoice.periodKey} (${formatEtb(h.unpaidInvoice.totalEtb)})` : ""}
                      </p>
                    </div>
                  ))
                ) : (
                  <EmptyState title="No hospitals yet" />
                )}
              </div>
            </Card>
            <Card>
              <CardTitle icon="clock" title="Adjust minutes" hint="Use a negative number to deduct." />
              <form
                className="mt-4 grid gap-3 md:grid-cols-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  save(async () => {
                    await api.patch(`/admin/billing/balances/${adjust.organizationId}`, {
                      minutes: Number(adjust.minutes),
                      note: adjust.note,
                    });
                    setAdjust({ organizationId: "", minutes: "", note: "" });
                  });
                }}
              >
                <select className="field" value={adjust.organizationId} onChange={(e) => setAdjust({ ...adjust, organizationId: e.target.value })} required>
                  <option value="">Hospital</option>
                  {overview.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
                <input className="field" type="number" placeholder="Minutes" value={adjust.minutes} onChange={(e) => setAdjust({ ...adjust, minutes: e.target.value })} required />
                <input className="field" placeholder="Note" value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} />
                <button className="btn-dark">Apply</button>
              </form>
            </Card>
            <Card>
              <CardTitle icon="shield" title="Subscriptions" />
              <div className="mt-4 space-y-2">
                {subscriptions.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 px-4 py-3 text-sm">
                    <span>{s.organization?.name} · {s.plan?.name}</span>
                    <span className="flex items-center gap-2">
                      <StatusPill status={s.status} />
                      {s.status === "active" ? (
                        <button className="btn-ghost" onClick={() => save(() => api.patch(`/admin/billing/subscriptions/${s.id}`, { status: "cancelled", autoRenew: false }))}>
                          Cancel
                        </button>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </>
        ) : null}

        {tab === "plans" ? (
          <>
            <Card>
              <CardTitle icon="coin" title="Monthly plans" hint="Device limits and prices are stored here, not in the frontend." />
              <form
                className="mt-4 grid gap-3 md:grid-cols-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  save(async () => {
                    await api.post("/admin/billing/plans", planForm);
                    setPlanForm(emptyPlan);
                  });
                }}
              >
                <input className="field" placeholder="Name" value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} required />
                <input className="field" type="number" placeholder="ETB / month" value={planForm.priceEtb} onChange={(e) => setPlanForm({ ...planForm, priceEtb: e.target.value })} required />
                <input className="field" type="number" placeholder="Devices" value={planForm.maxDevices} onChange={(e) => setPlanForm({ ...planForm, maxDevices: e.target.value })} required />
                <input className="field md:col-span-1" placeholder="Description" value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} />
                <button className="btn-dark">Add plan</button>
              </form>
              <div className="mt-5 space-y-3">
                {catalog.plans.map((plan) => {
                  const onPlan = overview.filter(
                    (h) => h.activeMode === "subscription" && h.subscription?.plan?.id === plan.id
                  );
                  return (
                    <div key={plan.id} className="rounded-3xl border border-slate-200/80 p-4">
                      <form
                        className="grid gap-2 md:grid-cols-5"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const data = Object.fromEntries(new FormData(e.currentTarget));
                          save(() => api.patch(`/admin/billing/plans/${plan.id}`, {
                            ...plan,
                            name: data.name,
                            priceEtb: Number(data.priceEtb),
                            maxDevices: Number(data.maxDevices),
                            isActive: data.active === "on",
                          }));
                        }}
                      >
                        <input name="name" className="field" defaultValue={plan.name} />
                        <input name="priceEtb" className="field" type="number" defaultValue={plan.priceEtb} />
                        <input name="maxDevices" className="field" type="number" defaultValue={plan.maxDevices} />
                        <label className="flex items-center gap-2 text-sm">
                          <input name="active" type="checkbox" defaultChecked={plan.isActive} /> Active
                        </label>
                        <button className="btn-ghost">Save</button>
                      </form>
                      <div className="mt-3 border-t border-slate-100 pt-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Hospitals on this plan ({onPlan.length})
                        </p>
                        {onPlan.length ? (
                          <ul className="mt-2 space-y-1 text-sm text-slate-600">
                            {onPlan.map((h) => (
                              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2">
                                <span>{h.name}</span>
                                <span className="text-slate-400">
                                  {h.activeDevices}/{h.subscription?.plan?.maxDevices ?? "—"} devices
                                  {h.subscription?.expiresAt ? ` · expires ${formatWhen(h.subscription.expiresAt)}` : ""}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-sm text-slate-400">No hospital is using this plan.</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
            <Card>
              <CardTitle icon="building" title="All hospitals on monthly" hint="Any hospital with an active subscription." />
              <div className="mt-4 space-y-2">
                {overview.filter((h) => h.activeMode === "subscription").length ? (
                  overview
                    .filter((h) => h.activeMode === "subscription")
                    .map((h) => (
                      <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 px-4 py-3 text-sm">
                        <span>{h.name} · {h.subscription?.plan?.name}</span>
                        <StatusPill status="active" label="Monthly" />
                      </div>
                    ))
                ) : (
                  <EmptyState title="No hospital on a monthly plan" />
                )}
              </div>
            </Card>
          </>
        ) : null}

        {tab === "packages" ? (
          <>
            <Card>
              <CardTitle icon="clock" title="Minute packages" />
              <form
                className="mt-4 grid gap-3 md:grid-cols-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  save(async () => {
                    await api.post("/admin/billing/packages", pkgForm);
                    setPkgForm(emptyPkg);
                  });
                }}
              >
                <input className="field" placeholder="Name" value={pkgForm.name} onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })} required />
                <input className="field" type="number" placeholder="Minutes" value={pkgForm.minutes} onChange={(e) => setPkgForm({ ...pkgForm, minutes: e.target.value })} required />
                <input className="field" type="number" placeholder="ETB" value={pkgForm.priceEtb} onChange={(e) => setPkgForm({ ...pkgForm, priceEtb: e.target.value })} required />
                <button className="btn-dark">Add package</button>
              </form>
              <div className="mt-5 space-y-3">
                {catalog.packages.map((pkg) => (
                  <form
                    key={pkg.id}
                    className="grid gap-2 rounded-3xl border border-slate-200/80 p-4 md:grid-cols-5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = Object.fromEntries(new FormData(e.currentTarget));
                      save(() => api.patch(`/admin/billing/packages/${pkg.id}`, {
                        ...pkg,
                        name: data.name,
                        minutes: Number(data.minutes),
                        priceEtb: Number(data.priceEtb),
                        isActive: data.active === "on",
                      }));
                    }}
                  >
                    <input name="name" className="field" defaultValue={pkg.name} />
                    <input name="minutes" className="field" type="number" defaultValue={pkg.minutes} />
                    <input name="priceEtb" className="field" type="number" defaultValue={pkg.priceEtb} />
                    <label className="flex items-center gap-2 text-sm">
                      <input name="active" type="checkbox" defaultChecked={pkg.isActive} /> Active
                    </label>
                    <button className="btn-ghost">Save</button>
                  </form>
                ))}
              </div>
            </Card>
            <Card>
              <CardTitle
                icon="building"
                title="Hospitals using minutes"
                hint="Hospitals with remaining minutes and no active monthly plan (monthly pauses minute spend)."
              />
              <div className="mt-4 space-y-2">
                {overview.filter((h) => h.activeMode === "minutes").length ? (
                  overview
                    .filter((h) => h.activeMode === "minutes")
                    .map((h) => (
                      <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 px-4 py-3 text-sm">
                        <span>{h.name}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-slate-500">{h.remainingMinutes} min left</span>
                          <StatusPill status="active" label="Minutes" />
                        </span>
                      </div>
                    ))
                ) : (
                  <EmptyState title="No hospital is using minutes right now" />
                )}
              </div>
            </Card>
            {overview.filter((h) => h.remainingMinutes > 0 && h.activeMode === "subscription").length ? (
              <Card>
                <CardTitle
                  icon="clock"
                  title="Minutes paused under monthly"
                  hint="These hospitals still have a minute balance, but live consults use the monthly plan first."
                />
                <div className="mt-4 space-y-2">
                  {overview
                    .filter((h) => h.remainingMinutes > 0 && h.activeMode === "subscription")
                    .map((h) => (
                      <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 px-4 py-3 text-sm">
                        <span>{h.name} · {h.subscription?.plan?.name}</span>
                        <span className="text-slate-500">{h.remainingMinutes} min saved</span>
                      </div>
                    ))}
                </div>
              </Card>
            ) : null}
          </>
        ) : null}

        {tab === "ondemand" ? (
          <>
            <Card>
              <CardTitle
                icon="stetho"
                title="On-demand rate"
                hint="Choose ETB per hour or per minute. Hospitals on on-demand are billed monthly at this rate. Unpaid bills block consults."
              />
              <form
                className="mt-4 grid gap-3 md:grid-cols-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  save(async () => {
                    const body = { enabled: rateForm.enabled };
                    if (rateForm.rateEtb !== "" && rateForm.rateEtb != null) {
                      body.rateEtb = Number(rateForm.rateEtb);
                    }
                    if (rateForm.rateUnit) body.rateUnit = rateForm.rateUnit;
                    await api.patch("/admin/billing/ondemand", body);
                  });
                }}
              >
                <input
                  className="field"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={rateForm.rateUnit === "minute" ? "ETB / minute" : "ETB / hour"}
                  value={rateForm.rateEtb}
                  onChange={(e) => setRateForm({ ...rateForm, rateEtb: e.target.value })}
                  required
                />
                <select
                  className="field"
                  value={rateForm.rateUnit}
                  onChange={(e) => setRateForm({ ...rateForm, rateUnit: e.target.value })}
                >
                  <option value="hour">Per hour</option>
                  <option value="minute">Per minute</option>
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={rateForm.enabled}
                    onChange={(e) => setRateForm({ ...rateForm, enabled: e.target.checked })}
                  />
                  On-demand enabled
                </label>
                <button className="btn-dark">Save rate</button>
              </form>
              {catalog.ondemand ? (
                <p className="mt-3 text-sm text-slate-500">
                  Current: {formatEtb(catalog.ondemand.rateEtb)} / {catalog.ondemand.rateUnit}
                  {catalog.ondemand.rateUnit === "minute"
                    ? ` (≈ ${formatEtb(catalog.ondemand.hourlyRateEtb)} / hour)`
                    : ` (≈ ${formatEtb(catalog.ondemand.minuteRateEtb)} / minute)`}
                  {" · "}
                  {catalog.ondemand.enabled ? "enabled" : "disabled"}
                </p>
              ) : null}
            </Card>
            <Card>
              <CardTitle
                icon="stetho"
                title="Hospitals on on-demand"
                hint="Hospitals with no monthly plan and no prepaid minutes. They use live consults and get billed after sessions."
              />
              <div className="mt-4 space-y-2">
                {overview.filter((h) => h.activeMode === "ondemand" || h.activeMode === "blocked").length ? (
                  overview
                    .filter((h) => h.activeMode === "ondemand" || h.activeMode === "blocked")
                    .map((h) => (
                      <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 px-4 py-3 text-sm">
                        <span>{h.name}</span>
                        {h.activeMode === "blocked" ? (
                          <StatusPill status="failed" label={`Unpaid ${h.unpaidInvoice?.periodKey || ""}`} />
                        ) : (
                          <StatusPill status="active" label="On-demand" />
                        )}
                      </div>
                    ))
                ) : (
                  <EmptyState title="No hospital is on on-demand right now" />
                )}
              </div>
            </Card>
            <Card>
              <CardTitle
                icon="activity"
                title="Usage invoices"
                hint="Bills with recorded session usage. Open = accruing. Issued = due (blocks hospital). Paid = unlocked."
              />
              <div className="mt-4 space-y-2">
                {invoices.filter((inv) => Number(inv.totalMinutes) > 0 || inv.status !== "open").length ? (
                  invoices
                    .filter((inv) => Number(inv.totalMinutes) > 0 || inv.status !== "open")
                    .map((inv) => (
                    <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 px-4 py-3 text-sm">
                      <span>
                        {inv.organization?.name || "Hospital"} · {inv.periodKey} · {inv.totalMinutes} min · {formatEtb(inv.totalEtb)}
                      </span>
                      <StatusPill status={inv.status} />
                    </div>
                  ))
                ) : (
                  <EmptyState title="No usage invoices yet" hint="A bill appears after an on-demand session is completed and timed." />
                )}
              </div>
            </Card>
          </>
        ) : null}

        {tab === "payments" ? (
          <Card>
            <CardTitle icon="coin" title="Chapa payments" />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="py-2">When</th>
                    <th>Hospital</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="py-2">{formatWhen(p.createdAt)}</td>
                      <td>{p.organization?.name || "—"}</td>
                      <td>{p.kind.replace("_", " ")}</td>
                      <td>{formatEtb(p.amountEtb)}</td>
                      <td><StatusPill status={p.status} /></td>
                      <td className="font-mono text-xs">{p.txRef}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}
      </div>
    </Layout>
  );
}
