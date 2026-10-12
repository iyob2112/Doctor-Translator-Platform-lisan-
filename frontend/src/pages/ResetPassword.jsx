import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/client.js";
import Icon from "../components/Icon.jsx";
import { BrandMark } from "../components/Layout.jsx";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => params.get("token") || "", [params]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.post("/auth/reset-password", { token, password });
      navigate("/login");
    } catch (err) {
      setError(err.response?.data?.error || "Could not reset password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-screen max-w-xl place-items-center px-4 py-10">
      <form onSubmit={submit} className="card w-full animate-fade-up p-8">
        <BrandMark />
        <h1 className="mt-8 font-display text-3xl">Choose a new password</h1>
        <p className="mt-2 text-sm text-slate-500">
          This link works once. After you save, sign in with the new password.
        </p>
        {!token ? (
          <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">
            Missing reset token. Request a new link from the sign-in page.
          </p>
        ) : null}
        <label className="mt-6 block">
          <span className="label">New password</span>
          <input
            required
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field mt-2"
            autoComplete="new-password"
          />
        </label>
        <label className="mt-4 block">
          <span className="label">Confirm password</span>
          <input
            required
            type="password"
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="field mt-2"
            autoComplete="new-password"
          />
        </label>
        {error ? (
          <p className="mt-4 flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">
            <Icon name="x" className="h-4 w-4" />
            {error}
          </p>
        ) : null}
        <button disabled={busy || !token} className="btn-brand mt-6 w-full py-3">
          {busy ? "Saving…" : "Save password"}
        </button>
        <p className="mt-5 text-center text-sm text-slate-500">
          <Link to="/login" className="font-semibold text-brand-700 hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
