import { env } from "../config/env.js";

function configuredOrigins() {
  const fromEnv = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (env.clientUrl) {
    try {
      fromEnv.push(new URL(env.clientUrl).origin);
    } catch {
      /* ignore bad CLIENT_URL */
    }
  }
  return [...new Set(fromEnv)];
}

export function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname;
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return true;
    }
    return configuredOrigins().includes(url.origin);
  } catch {
    return false;
  }
}

export function clientUrlFromRequest(req, fallback) {
  const raw = req.get("origin") || req.get("referer");
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    if (!isAllowedOrigin(url.origin)) return fallback;
    return url.origin;
  } catch {
    return fallback;
  }
}
