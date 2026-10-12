import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/client.js";
import Layout, { Card, CardTitle, EmptyState, Stat, StatusPill } from "../components/Layout.jsx";
import Icon from "../components/Icon.jsx";
import { deviceLabel, getDeviceFingerprint } from "../lib/device.js";

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

export default function HospitalPlans() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [catalog, setCatalog] = useState(null);
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [path, setPath] = useState("ondemand");

  async function load() {
    const [cRes, mRes] = await Promise.all([
      api.get("/billing/catalog"),
      api.get("/billing/me"),
    ]);
    setCatalog(cRes.data);
    setMe(mRes.data);
    const mode = mRes.data?.activeMode;
    if (mode === "subscription") setPath("monthly");
    else if (mode === "minutes") setPath("minutes");
    else setPath("ondemand");
    return mRes.data;
  }

  useEffect(() => {
    load()
      .then(async (data) => {
        if (!data?.subscription) return;
        try {
          await api.post("/billing/devices", { fingerprint: getDeviceFingerprint(), label: deviceLabel() });
          await load();
        } catch (err) {
          setError(err.response?.data?.error || "This computer is over the monthly device limit.");
        }
      })
      .catch(() => setError("Could not load plans"));
  }, []);

  useEffect(() => {
    const txRef = searchParams.get("tx_ref");
    if (!txRef || !me) return;
    const mock = searchParams.get("mock") === "1";
    async function settle() {
      setBusy("verify");
      try {
        if (mock && catalog?.mockPayments === true) {
          const { data } = await api.post("/billing/chapa/mock", { txRef, result: "success" });
          setMessage(
            data.payment?.status === "paid"
              ? "Payment confirmed."
              : data.payment?.failureReason || "Payment was not completed"
          );
        } else {
          const { data } = await api.post(`/billing/payments/${txRef}/verify`);
          if (data.pending) setMessage("Payment is still pending. Refresh in a moment.");
          else if (data.payment?.status === "paid") {
            setMessage("Payment verified.");
          } else {
            setError(data.payment?.failureReason || "Payment was not successful");
          }
        }
        await load();
        setSearchParams({}, { replace: true });
      } catch (err) {
        setError(err.response?.data?.error || "Could not verify payment");
      } finally {
        setBusy("");
      }
    }
    settle();
  }, [searchParams, me, catalog?.mockPayments]);

  async function pay(apiPath, body, key) {
    setError("");
    setMessage("");
    setBusy(key);
    try {
      const { data } = await api.post(apiPath, body);
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      setError("Checkout URL was not returned");
    } catch (err) {
      setError(err.response?.data?.error || "Could not start payment");
    } finally {
      setBusy("");
    }
  }

  async function toggleRenew(autoRenew) {
    setBusy("renew");
    try {
      await api.patch("/billing/subscriptions/auto-renew", { autoRenew });
      setMessage(autoRenew ? "Auto-renewal enabled" : "Auto-renewal turned off. You can still renew manually.");
      await load();
    } catch (err) {
      setError(err.response?.data?.error || "Could not update auto-renewal");
    } finally {
      setBusy("");
    }
  }

  async function deactivate(id) {
    await api.delete(`/billing/devices/${id}`);
    await load();
  }

  const sub = me?.subscription;
  const remainingDevices = me?.remaining;
  const mode = me?.activeMode || "none";
  const ondemand = me?.ondemand || catalog?.ondemand;
  const rate = ondemand?.rateEtb ?? ondemand?.hourlyRateEtb;
  const rateUnit = ondemand?.rateUnit === "minute" ? "minute" : "hour";
  const rateLabel = rate != null ? `${formatEtb(rate)} / ${rateUnit}` : "—";
  const usingLabel =
    mode === "subscription"
      ? sub?.plan?.name || "Monthly plan"
      : mode === "minutes"
        ? "Minute package"
        : mode === "ondemand"
          ? "On-demand (monthly bill)"
          : "None";

  return (
    <Layout
      eyebrow="Hospital billing"
      title="Plans & pricing"
      description="New hospitals start on on-demand by default. Buy a monthly plan or minutes to switch live consults to that option; when it ends, you return to on-demand."
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
      {me?.unpaidInvoice ? (
        <p className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Unpaid bill for {me.unpaidInvoice.periodKey} ({formatEtb(me.unpaidInvoice.totalEtb)}). Pay it under On-demand to unlock consults.
        </p>
      ) : null}

      <div className={`grid gap-4 sm:grid-cols-2 ${path === "monthly" ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <Stat icon="shield" label="Using now" value={usingLabel} />
        {path === "monthly" ? (
          <Stat icon="users" label="Devices left" value={mode === "subscription" ? remainingDevices ?? "—" : "—"} tone="plum" />
        ) : null}
        <Stat icon="clock" label="Minutes left" value={me?.remainingMinutes ?? 0} tone="slate" />
        {path === "monthly" ? (
          <Stat icon="clock" label="Monthly expiry" value={sub?.expiresAt ? formatWhen(sub.expiresAt) : "—"} tone="amber" />
        ) : path === "minutes" ? (
          <Stat icon="users" label="Device limit" value="None" tone="amber" />
        ) : (
          <Stat icon="coin" label="On-demand rate" value={rateLabel} tone="amber" />
        )}
      </div>

      {mode === "subscription" ? (
        <p className="mt-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
          Live consults use the monthly plan — on-demand is paused until this plan ends. Minutes are not spent
          {me?.minutesPaused ? ` (${me.remainingMinutes} minutes saved for later)` : ""}.
        </p>
      ) : mode === "minutes" ? (
        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Live consults use the minute package — on-demand is paused while minutes remain. Time is deducted when a session ends.
        </p>
      ) : mode === "ondemand" ? (
        <p className="mt-4 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
          Default: on-demand at {rateLabel}. Usage goes on this month&apos;s bill. Buy monthly or minutes anytime to switch.
        </p>
      ) : (
        <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Consults are blocked. Pay any unpaid on-demand bill, or buy a monthly plan or minutes.
        </p>
      )}

      <nav className="mt-6 inline-flex flex-wrap gap-1 rounded-full border border-white/70 bg-white/70 p-1 shadow-soft backdrop-blur">
        {[
          { id: "ondemand", label: "On-demand", icon: "stetho" },
          { id: "monthly", label: "Monthly", icon: "coin" },
          { id: "minutes", label: "Minutes", icon: "clock" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPath(item.id)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              path === item.id ? "bg-ink text-white shadow-sm" : "text-slate-500 hover:text-ink"
            }`}
          >
            <Icon name={item.icon} className="h-4 w-4" />
            {item.label}
            {item.id === "monthly" && mode === "subscription" ? <StatusPill status="active" label="In use" /> : null}
            {item.id === "minutes" && mode === "minutes" ? <StatusPill status="active" label="In use" /> : null}
            {item.id === "ondemand" && mode === "ondemand" ? <StatusPill status="active" label="In use" /> : null}
          </button>
        ))}
      </nav>

      {path === "monthly" ? (
        <Card className="mt-6">
          <CardTitle
            icon="coin"
            title="Monthly subscription"
            hint="Buying a monthly plan switches live consults off on-demand. The hospital login then works only on that many exam-room computers."
            right={mode === "subscription" ? <StatusPill status="active" label="In use" /> : null}
          />
          {sub ? (
            <div className="mt-4 rounded-3xl border border-brand-100 bg-brand-50/60 p-4 text-sm text-brand-900">
              <p className="font-semibold">{sub.plan?.name}</p>
              <p className="mt-1">
                {me?.activeCount || 0} of {sub.plan?.maxDevices} computers in use · started{" "}
                {formatWhen(sub.startsAt)} · expires {formatWhen(sub.expiresAt)} · auto-renew{" "}
                {sub.autoRenew ? "on" : "off"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-dark" disabled={busy === "renew"} onClick={() => toggleRenew(!sub.autoRenew)}>
                  {sub.autoRenew ? "Turn off auto-renew" : "Enable auto-renew"}
                </button>
                <button
                  className="btn-ghost"
                  disabled={Boolean(busy)}
                  onClick={() => pay("/billing/subscriptions", { planId: sub.plan?.id, renew: true }, `renew-${sub.plan?.id}`)}
                >
                  Renew now
                </button>
              </div>
            </div>
          ) : null}
          <div className="mt-5 space-y-3">
            {(catalog?.plans || []).map((plan) => (
              <div key={plan.id} className="flex items-center justify-between gap-3 rounded-3xl border border-slate-200/80 bg-white/70 p-4">
                <div>
                  <p className="font-semibold">{plan.name}</p>
                  <p className="text-sm text-slate-500">
                    {formatEtb(plan.priceEtb)} / month · {plan.maxDevices} devices
                  </p>
                </div>
                <button
                  className="btn-dark"
                  disabled={Boolean(busy)}
                  onClick={() => pay("/billing/subscriptions", { planId: plan.id }, `plan-${plan.id}`)}
                >
                  {sub?.plan?.id === plan.id ? "Renew" : "Subscribe"}
                </button>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {path === "minutes" ? (
        <Card className="mt-6">
          <CardTitle
            icon="clock"
            title="Minute package"
            hint="Buying minutes switches live consults off on-demand (unless a monthly plan is active). No device limit."
            right={mode === "minutes" ? <StatusPill status="active" label="In use" /> : null}
          />
          {mode === "subscription" ? (
            <p className="mt-4 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
              A monthly plan is in use now, so new live consults will not spend these minutes.
            </p>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              {me?.remainingMinutes || 0} minutes on the balance.
            </p>
          )}
          <div className="mt-5 space-y-3">
            {(catalog?.packages || []).map((pkg) => (
              <div key={pkg.id} className="flex items-center justify-between gap-3 rounded-3xl border border-slate-200/80 bg-white/70 p-4">
                <div>
                  <p className="font-semibold">{pkg.name}</p>
                  <p className="text-sm text-slate-500">{formatEtb(pkg.priceEtb)}</p>
                </div>
                <button
                  className="btn-dark"
                  disabled={Boolean(busy)}
                  onClick={() => pay("/billing/minutes", { packageId: pkg.id }, `pkg-${pkg.id}`)}
                >
                  Buy package
                </button>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {path === "ondemand" ? (
        <Card className="mt-6">
          <CardTitle
            icon="stetho"
            title="On-demand usage"
            hint="Default for new hospitals. No booking — use anytime; billed monthly. Buying a monthly plan or minutes switches live consults away from on-demand."
            right={mode === "ondemand" ? <StatusPill status="active" label="In use" /> : null}
          />
          {mode === "subscription" || mode === "minutes" ? (
            <p className="mt-4 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
              On-demand is paused while your {mode === "subscription" ? "monthly plan" : "minute package"} is in use. New live sessions will not add to this bill until that ends.
            </p>
          ) : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200/80 px-4 py-3 text-sm">
              <p className="text-slate-500">Rate</p>
              <p className="mt-1 font-semibold">{rateLabel}</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 px-4 py-3 text-sm">
              <p className="text-slate-500">This month</p>
              <p className="mt-1 font-semibold">
                {me?.currentInvoice?.totalMinutes ?? 0} min · {formatEtb(me?.currentInvoice?.totalEtb)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 px-4 py-3 text-sm">
              <p className="text-slate-500">Status</p>
              <p className="mt-1">
                {mode === "subscription" || mode === "minutes" ? (
                  <StatusPill status="pending" label="Paused" />
                ) : me?.currentInvoice ? (
                  <StatusPill status={me.currentInvoice.status} />
                ) : (
                  <StatusPill status="pending" label="No bill yet" />
                )}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <p className="text-sm font-semibold text-slate-700">Monthly bills</p>
            {(me?.invoices || []).filter((inv) => Number(inv.totalMinutes) > 0 || inv.status !== "open").length ? (
              me.invoices
                .filter((inv) => Number(inv.totalMinutes) > 0 || inv.status !== "open")
                .map((inv) => (
                <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200/80 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{inv.periodKey}</p>
                    <p className="text-slate-500">
                      {inv.totalMinutes} min · {formatEtb(inv.totalEtb)} · {formatEtb(inv.rateEtb ?? inv.hourlyRateEtb)}/{inv.rateUnit || "hour"}
                    </p>
                  </div>
                  <span className="flex items-center gap-2">
                    <StatusPill status={inv.status} />
                    {inv.status === "issued" ? (
                      <button
                        className="btn-dark"
                        disabled={Boolean(busy)}
                        onClick={() => pay("/billing/invoices/pay", { invoiceId: inv.id }, `inv-${inv.id}`)}
                      >
                        Pay {formatEtb(inv.totalEtb)}
                      </button>
                    ) : null}
                  </span>
                </div>
              ))
            ) : (
              <EmptyState
                title={mode === "subscription" || mode === "minutes" ? "On-demand paused" : "No usage yet"}
                hint={
                  mode === "subscription" || mode === "minutes"
                    ? "Live consults use your monthly plan or minutes, so nothing is added to an on-demand bill."
                    : "Completed on-demand sessions appear on the monthly bill."
                }
              />
            )}
          </div>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {path === "monthly" ? (
          <Card>
            <CardTitle
              icon="users"
              title="Devices"
              hint={
                me?.maxDevices
                  ? `This monthly plan works on ${me.maxDevices} computers only.`
                  : "Device limits apply only when you are on a monthly plan."
              }
            />
            <ul className="mt-4 space-y-2">
              {(me?.devices || []).map((d) => {
                const mine = d.fingerprint === getDeviceFingerprint();
                return (
                  <li key={d.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 px-4 py-3 text-sm">
                    <span>
                      <span className="font-medium">{d.label}</span>
                      <span className="ml-2 text-slate-400">{d.isActive ? "Active" : "Off"}</span>
                      {mine ? <span className="ml-2 font-semibold text-brand-700">This computer</span> : null}
                    </span>
                    {d.isActive ? (
                      <button className="btn-ghost" onClick={() => deactivate(d.id)}>Deactivate</button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null}
        {path === "ondemand" && me?.currentInvoice?.lines?.length ? (
          <Card>
            <CardTitle icon="activity" title="This month's sessions" />
            <div className="mt-4 space-y-2">
              {me.currentInvoice.lines.map((line) => (
                <div key={line.id} className="rounded-2xl border border-slate-200/80 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{line.minutes} min</p>
                    <p>{formatEtb(line.amountEtb)}</p>
                  </div>
                  <p className="mt-1 text-slate-500">{formatWhen(line.createdAt)}</p>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>

      <Card className="mt-6">
        <CardTitle icon="coin" title="Payment history" />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="py-2">When</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(me?.payments || []).map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="py-2">{formatWhen(p.createdAt)}</td>
                  <td>{p.kind.replace(/_/g, " ")}</td>
                  <td>{formatEtb(p.amountEtb)}</td>
                  <td><StatusPill status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Layout>
  );
}
