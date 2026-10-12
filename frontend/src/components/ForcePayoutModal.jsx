import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import Icon from "./Icon.jsx";

function formatBirr(amount) {
  return `${Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} Birr`;
}

export default function ForcePayoutModal() {
  const { user, setUser } = useAuth();
  const location = useLocation();
  const [due, setDue] = useState(null);
  const [method, setMethod] = useState(user?.translatorProfile?.payoutMethod || "telebirr");
  const [accountName, setAccountName] = useState(
    user?.translatorProfile?.payoutAccountName || user?.fullName || ""
  );
  const [accountNumber, setAccountNumber] = useState(
    user?.translatorProfile?.payoutAccountNumber || ""
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const blocked =
    !user ||
    user.role !== "translator" ||
    user.mustChangePassword ||
    location.pathname.startsWith("/call") ||
    done;

  useEffect(() => {
    if (blocked) return undefined;
    let cancelled = false;
    api
      .get("/translators/me/earnings")
      .then(({ data }) => {
        if (!cancelled) setDue(data.duePayout || null);
      })
      .catch(() => {
        if (!cancelled) setDue(null);
      });
    return () => {
      cancelled = true;
    };
  }, [blocked, user?.id]);

  if (blocked || !due) return null;

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { data } = await api.post("/translators/me/withdrawals", {
        periodKey: due.period.key,
        method,
        accountName,
        accountNumber,
      });
      if (data.user) setUser(data.user);
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || "Could not send payout details");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-ink/70 p-4 backdrop-blur-sm">
      <form className="w-full max-w-md animate-pop-in rounded-4xl bg-white p-7 shadow-lift" onSubmit={submit}>
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-amber-700">
          <Icon name="coin" className="h-5 w-5" />
        </span>
        <h2 className="mt-4 font-display text-2xl">Enter payment method</h2>
        <p className="mt-2 text-sm text-slate-500">
          The {due.period.label} month has closed ({due.period.windowLabel}). Enter how you want to
          receive {formatBirr(due.amountEtb)}. After you send this, your money is under review.
        </p>
        <p className="mt-4 font-display text-3xl">{formatBirr(due.amountEtb)}</p>
        <label className="mt-5 block">
          <span className="label">Send via</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="field mt-2">
            <option value="telebirr">Telebirr</option>
            <option value="cbe">CBE Birr</option>
            <option value="bank">Bank transfer</option>
          </select>
        </label>
        <label className="mt-4 block">
          <span className="label">Account name</span>
          <input
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            className="field mt-2"
            required
          />
        </label>
        <label className="mt-4 block">
          <span className="label">Phone or account number</span>
          <input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            className="field mt-2"
            placeholder="09… or bank account"
            required
          />
        </label>
        {error ? (
          <p className="mt-4 flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">
            <Icon name="x" className="h-4 w-4" />
            {error}
          </p>
        ) : null}
        <button disabled={busy} className="btn-dark mt-6 w-full py-3">
          {busy ? "Sending…" : "Send for review"}
        </button>
      </form>
    </div>
  );
}
