import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { roleLabel } from "../roles.js";
import { can } from "../permissions.js";
import { BRAND_LOGO_DARK, BRAND_NAME, BRAND_TAGLINE } from "../brand.js";
import Icon from "./Icon.jsx";

export function initials(name = "") {
  return name
    .replace(/^(Dr\.?|Mr\.?|Ms\.?)\s+/i, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

export function Avatar({ name, className = "h-10 w-10 text-sm" }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-ink to-slate-700 font-semibold text-white ${className}`}
    >
      {initials(name) || "?"}
    </span>
  );
}

export function BrandMark({ tone = "light", showWordmark = true }) {
  const darkUi = tone === "dark";
  const text = darkUi ? "text-white" : "text-ink";
  const sub = darkUi ? "text-white/50" : "text-slate-400";
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-black/10">
        <img
          src={BRAND_LOGO_DARK}
          alt={BRAND_NAME}
          className="h-full w-full object-contain"
        />
      </span>
      {showWordmark ? (
        <span className="leading-tight">
          <span className={`block font-display text-lg font-semibold tracking-tight ${text}`}>{BRAND_NAME}</span>
          <span className={`block text-[11px] uppercase tracking-[0.22em] ${sub}`}>
            {BRAND_TAGLINE}
          </span>
        </span>
      ) : null}
    </div>
  );
}

export default function Layout({ eyebrow, title, description, actions, children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const plansHref =
    user?.role === "hospital_admin" ? "/hospital/plans" : can(user, "billing.manage") ? "/admin/billing" : null;
  const onPlans = Boolean(plansHref && location.pathname.startsWith(plansHref));

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-30 border-b border-white/60 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-8">
          <Link to="/" className="shrink-0">
            <BrandMark />
          </Link>
          <div className="flex items-center gap-2 md:gap-3">
            {plansHref ? (
              <Link to={plansHref} className="btn-dark">
                <Icon name="coin" className="h-4 w-4" />
                Plans
              </Link>
            ) : null}
            {actions && !onPlans ? actions : null}
            <Link
              to="/profile"
              className="hidden items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/80 py-1.5 pl-2 pr-4 transition hover:border-brand-300 sm:flex"
            >
              <Avatar name={user.fullName} className="h-9 w-9 text-xs" />
              <span className="leading-tight">
                <span className="block text-sm font-semibold">{user.fullName}</span>
                <span className="block text-xs capitalize text-slate-500">{roleLabel(user.role)}</span>
              </span>
            </Link>
            <Link to="/profile" className="btn-ghost sm:hidden" title="Profile">
              <Icon name="user" className="h-4 w-4" />
            </Link>
            <button onClick={logout} className="btn-ghost" title="Sign out">
              <Icon name="logout" className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </div>

      <header className="mx-auto max-w-7xl px-4 pt-8 md:px-8">
        {eyebrow ? <p className="label">{eyebrow}</p> : null}
        <h1 className="mt-2 font-display text-3xl md:text-4xl">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
        ) : null}
      </header>

      <main className="mx-auto max-w-7xl animate-fade-up px-4 pb-16 pt-6 md:px-8">{children}</main>
    </div>
  );
}

export function Card({ children, className = "" }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function CardTitle({ icon, title, hint, right }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon ? (
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-50 text-brand-600">
            <Icon name={icon} className="h-5 w-5" />
          </span>
        ) : null}
        <div>
          <h2 className="font-display text-xl">{title}</h2>
          {hint ? <p className="mt-0.5 text-sm text-slate-500">{hint}</p> : null}
        </div>
      </div>
      {right}
    </div>
  );
}

export function Stat({ icon, label, value, tone = "brand" }) {
  const tones = {
    brand: "bg-brand-50 text-brand-600",
    plum: "bg-plum-50 text-plum-600",
    amber: "bg-amber-50 text-amber-600",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-white/70 bg-white/70 p-4 shadow-soft backdrop-blur">
      <span className={`grid h-11 w-11 place-items-center rounded-2xl ${tones[tone]}`}>
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <div className="leading-tight">
        <p className="font-display text-2xl">{value}</p>
        <p className="text-xs uppercase tracking-[0.14em] text-slate-400">{label}</p>
      </div>
    </div>
  );
}

export function StatusPill({ status, label }) {
  const map = {
    approved: "bg-brand-50 text-brand-700 ring-brand-200",
    rejected: "bg-rose-50 text-rose-600 ring-rose-200",
    pending: "bg-amber-50 text-amber-700 ring-amber-200",
    active: "bg-brand-50 text-brand-700 ring-brand-200",
    completed: "bg-slate-100 text-slate-600 ring-slate-200",
    cancelled: "bg-rose-50 text-rose-600 ring-rose-200",
    open: "bg-amber-50 text-amber-700 ring-amber-200",
    flagged: "bg-rose-50 text-rose-700 ring-rose-200",
    stat: "bg-rose-50 text-rose-700 ring-rose-200",
    paid: "bg-brand-50 text-brand-700 ring-brand-200",
    online: "bg-brand-50 text-brand-700 ring-brand-200",
    offline: "bg-slate-100 text-slate-500 ring-slate-200",
    expired: "bg-slate-100 text-slate-600 ring-slate-200",
    confirmed: "bg-brand-50 text-brand-700 ring-brand-200",
    failed: "bg-rose-50 text-rose-600 ring-rose-200",
    pending_payment: "bg-amber-50 text-amber-700 ring-amber-200",
  };
  const dot = {
    approved: "bg-brand-500",
    rejected: "bg-rose-500",
    pending: "bg-amber-500",
    active: "bg-brand-500",
    completed: "bg-slate-400",
    cancelled: "bg-rose-500",
    open: "bg-amber-500",
    flagged: "bg-rose-500",
    stat: "bg-rose-500",
    paid: "bg-brand-500",
    online: "bg-brand-500",
    offline: "bg-slate-400",
    expired: "bg-slate-400",
    confirmed: "bg-brand-500",
    failed: "bg-rose-500",
    pending_payment: "bg-amber-500",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${
        map[status] || "bg-slate-100 text-slate-600 ring-slate-200"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot[status] || "bg-slate-400"}`} />
      {label || status}
    </span>
  );
}

export function Stars({ value = 0, className = "h-4 w-4" }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon
          key={n}
          name="star"
          className={`${className} ${n <= value ? "text-amber-400" : "text-slate-200"}`}
          strokeWidth={1.5}
          style={n <= value ? { fill: "currentColor" } : undefined}
        />
      ))}
    </span>
  );
}

export function EmptyState({ icon = "spark", title, hint }) {
  return (
    <div className="grid place-items-center rounded-3xl border border-dashed border-slate-200 bg-white/40 px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <p className="mt-3 font-medium text-slate-600">{title}</p>
      {hint ? <p className="mt-1 max-w-xs text-sm text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function formatDuration(seconds) {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
