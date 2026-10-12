const KEY = "roomline.deviceId";
let memoryId = null;

function newFingerprint() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getDeviceFingerprint() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = newFingerprint();
      localStorage.setItem(KEY, id);
    }
    memoryId = id;
    return id;
  } catch {
    if (!memoryId) memoryId = newFingerprint();
    return memoryId;
  }
}

export function deviceLabel() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/tablet|ipad/i.test(ua)) return "Tablet";
  if (/mobi|iphone|android/i.test(ua)) return "Phone";
  return "Exam-room computer";
}
