import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import Icon from "./Icon.jsx";

export default function ForcePasswordModal() {
  const { user, updateProfile } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user?.mustChangePassword) return null;

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("New passwords do not match");
      return;
    }
    if (password === currentPassword) {
      setError("Choose a new password, not the temporary one");
      return;
    }
    setBusy(true);
    try {
      await updateProfile({ currentPassword, password });
    } catch (err) {
      setError(err.response?.data?.error || "Could not save the new password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/70 p-4 backdrop-blur-sm">
      <form className="w-full max-w-md animate-pop-in rounded-4xl bg-white p-7 shadow-lift" onSubmit={submit}>
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-amber-700">
          <Icon name="key" className="h-5 w-5" />
        </span>
        <h2 className="mt-4 font-display text-2xl">Set a new password</h2>
        <p className="mt-2 text-sm text-slate-500">
          You signed in with a temporary password. Choose your own password before using the desk.
        </p>
        <label className="mt-5 block">
          <span className="label">Temporary password</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="field mt-2"
            autoComplete="current-password"
            required
          />
        </label>
        <label className="mt-4 block">
          <span className="label">New password</span>
          <input
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field mt-2"
            autoComplete="new-password"
            required
          />
        </label>
        <label className="mt-4 block">
          <span className="label">Confirm new password</span>
          <input
            type="password"
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="field mt-2"
            autoComplete="new-password"
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
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
    </div>
  );
}
