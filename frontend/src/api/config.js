/** Backend origin, e.g. https://doctor-translator-platform-lisan.onrender.com */
const rawApi =
  String(import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "") || "";

/** Full REST prefix: .../api/v1 */
export const API_BASE = rawApi
  ? rawApi.endsWith("/api/v1")
    ? rawApi
    : `${rawApi}/api/v1`
  : "/api/v1";

/** Socket.IO connects to the API host (no /api/v1 path). */
export const SOCKET_URL =
  String(import.meta.env.VITE_SOCKET_URL || "").trim().replace(/\/+$/, "") ||
  (rawApi
    ? rawApi.replace(/\/api\/v1$/i, "")
    : typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:4000");
