import axios from "axios";
import { getDeviceFingerprint } from "../lib/device.js";

const api = axios.create({
  baseURL: "/api/v1",
});

let accessToken = localStorage.getItem("accessToken");
let refreshToken = localStorage.getItem("refreshToken");

export function setTokens({ accessToken: access, refreshToken: refresh }) {
  accessToken = access || null;
  refreshToken = refresh || null;
  if (access) localStorage.setItem("accessToken", access);
  else localStorage.removeItem("accessToken");
  if (refresh) localStorage.setItem("refreshToken", refresh);
  else localStorage.removeItem("refreshToken");
}

export function getAccessToken() {
  return accessToken;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === "accessToken") accessToken = event.newValue;
    if (event.key === "refreshToken") refreshToken = event.newValue;
  });
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  const fingerprint = getDeviceFingerprint();
  if (fingerprint) {
    config.headers["X-Device-Fingerprint"] = fingerprint;
  }
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  return config;
});

let refreshing = null;

export async function refreshAccessToken() {
  if (!refreshToken) throw new Error("No refresh token");
  if (!refreshing) {
    refreshing = axios
      .post("/api/v1/auth/refresh", { refreshToken })
      .then((res) => {
        setTokens(res.data);
        return res.data.accessToken;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original._retry || original.url?.includes("/auth/")) {
      throw error;
    }
    if (!refreshToken) throw error;
    original._retry = true;
    const next = await refreshAccessToken();
    original.headers.Authorization = `Bearer ${next}`;
    return api(original);
  }
);

export default api;

export async function openProtectedFile(url) {
  const { data, headers } = await api.get(url, { responseType: "blob" });
  const type = headers["content-type"] || data.type || "application/octet-stream";
  if (type.includes("application/json")) {
    const text = await data.text();
    let message = "Could not open file";
    try {
      message = JSON.parse(text).error || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const href = URL.createObjectURL(blob);
  window.open(href, "_blank", "noopener,noreferrer");
}
