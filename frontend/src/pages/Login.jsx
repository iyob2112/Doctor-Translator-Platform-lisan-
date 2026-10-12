import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { homeFor } from "../roles.js";
import Icon from "../components/Icon.jsx";
import { BrandMark } from "../components/Layout.jsx";

const demos = [
  { role: "Hospital", icon: "building", email: "hospital@demo.com", password: "Hospital123!" },
  { role: "Translator", icon: "language", email: "translator@demo.com", password: "Translator123!" },
  { role: "Platform admin", icon: "shield", email: "admin@demo.com", password: "Admin123!" },
];

const highlights = [
  { icon: "bolt", title: "Paged in seconds", copy: "Every online interpreter for that language rings at once." },
  { icon: "video", title: "Video or voice", copy: "Falls back to audio when bandwidth is tight." },
  { icon: "transfer", title: "Hand off live", copy: "Move a call to another interpreter without dropping it." },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("hospital@demo.com");
  const [password, setPassword] = useState("Hospital123!");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const user = await login(email, password);
      navigate(homeFor(user));
    } catch (err) {
      setError(err.response?.data?.error || "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-screen max-w-7xl items-center gap-8 px-4 py-8 md:px-8 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative overflow-hidden rounded-4xl bg-ink p-8 text-white shadow-lift md:p-12">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-plum-500/30 blur-3xl" />

        <div className="relative">
          <BrandMark tone="dark" />

          <h1 className="mt-10 font-display text-4xl leading-[1.1] md:text-5xl">
            A live interpreter in the exam room —
            <span className="bg-gradient-to-r from-brand-300 to-plum-300 bg-clip-text text-transparent">
              {" "}not another patient portal.
            </span>
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-white/70">
            The patient stays in the exam room. When language gets in the way, the hospital pages a
            translator who joins by video or voice and relays the consult in real time.
          </p>

          <ul className="mt-9 space-y-4">
            {highlights.map((h) => (
              <li key={h.title} className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-brand-200">
                  <Icon name={h.icon} className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{h.title}</span>
                  <span className="block text-sm text-white/60">{h.copy}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-10 animate-float rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur-xl sm:max-w-sm">
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/50">Incoming request</p>
            <div className="mt-3 flex items-center justify-between gap-4">
              <div>
                <p className="font-display text-lg">Spanish · Emergency</p>
                <p className="text-sm text-white/60">City General Hospital is waiting</p>
              </div>
              <span className="relative grid h-11 w-11 place-items-center rounded-full bg-brand-500 text-white">
                <span className="absolute inset-0 animate-pulse-ring rounded-full bg-brand-400/60" />
                <Icon name="voice" className="relative h-5 w-5" />
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-md">
        <form onSubmit={submit} className="card animate-fade-up p-8">
          <h2 className="font-display text-2xl">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Staff access only — no patient accounts.</p>

          <label className="mt-7 block">
            <span className="label">Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field mt-2"
              autoComplete="username"
            />
          </label>

          <label className="mt-4 block">
            <span className="label">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field mt-2"
              autoComplete="current-password"
            />
          </label>

          <p className="mt-3 text-right text-sm">
            <Link to="/forgot-password" className="font-semibold text-brand-700 hover:underline">
              Forgot password?
            </Link>
          </p>

          {error ? (
            <p className="mt-4 flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">
              <Icon name="x" className="h-4 w-4" />
              {error}
            </p>
          ) : null}

          <button disabled={busy} className="btn-brand mt-6 w-full py-3">
            {busy ? "Signing in…" : "Enter the clinic desk"}
            {!busy ? <Icon name="bolt" className="h-4 w-4" /> : null}
          </button>

          <p className="mt-5 text-center text-sm text-slate-500">
            Interpreters are added by the platform admin.
            <span className="block mt-1 text-xs">
              The hospital uses one shared login. A monthly plan only works on the computers included in that plan.
            </span>
          </p>

          <div className="mt-7">
            <p className="label">Demo accounts</p>
            <div className="mt-3 space-y-2">
              {demos.map((d) => (
                <button
                  type="button"
                  key={d.email}
                  onClick={() => {
                    setEmail(d.email);
                    setPassword(d.password);
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white/60 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    <Icon name={d.icon} className="h-4 w-4" />
                  </span>
                  <span className="leading-tight">
                    <span className="block text-sm font-semibold">{d.role}</span>
                    <span className="block text-xs text-slate-500">{d.email}</span>
                  </span>
                  <Icon name="chevron" className="ml-auto h-4 w-4 -rotate-90 text-slate-300" />
                </button>
              ))}
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
