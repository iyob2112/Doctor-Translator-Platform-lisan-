import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client.js";
import Icon from "../components/Icon.jsx";
import { BrandMark } from "../components/Layout.jsx";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      setMessage(data.message || "If that email is on file, we sent a reset link.");
    } catch (err) {
      setError(err.response?.data?.error || "Could not send reset link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-screen max-w-xl place-items-center px-4 py-10">
      <form onSubmit={submit} className="card w-full animate-fade-up p-8">
        <BrandMark />
        <h1 className="mt-8 font-display text-3xl">Forgot password</h1>
        <p className="mt-2 text-sm text-slate-500">
          Enter the email on your Lisan account. We will send a reset link that expires in 30
          minutes.
        </p>
        <label className="mt-6 block">
          <span className="label">Email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field mt-2"
            autoComplete="username"
          />
        </label>
        {error ? (
          <p className="mt-4 flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">
            <Icon name="x" className="h-4 w-4" />
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-4 flex items-center gap-2 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
            <Icon name="check" className="h-4 w-4" />
            {message}
          </p>
        ) : null}
        <button disabled={busy} className="btn-brand mt-6 w-full py-3">
          {busy ? "Sending…" : "Send reset link"}
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
