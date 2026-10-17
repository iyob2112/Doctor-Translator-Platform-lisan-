import { API_BASE } from "../api/config.js";
import { explainMediaError } from "./callMedia.js";

function trackLive(track) {
  return Boolean(track && track.readyState === "live" && !track.muted);
}

/**
 * Network probe: latency + rough download speed via API health.
 * Returns { ok, label, latencyMs, mbps, detail }
 */
export async function checkNetwork() {
  const samples = [];
  let bytes = 0;
  let downloadMs = 0;

  for (let i = 0; i < 3; i += 1) {
    const t0 = performance.now();
    const res = await fetch(`${API_BASE}/health`, { cache: "no-store", credentials: "omit" });
    if (!res.ok) throw new Error("Could not reach the server");
    const text = await res.text();
    const t1 = performance.now();
    samples.push(t1 - t0);
    bytes += new TextEncoder().encode(text).length;
    downloadMs += t1 - t0;
  }

  const latencyMs = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
  // Rough Mbps from tiny payloads is noisy; use latency as primary signal.
  const mbps =
    downloadMs > 0 ? Math.round(((bytes * 8) / (downloadMs / 1000) / 1_000_000) * 1000) / 1000 : 0;

  let label = "Good";
  let ok = true;
  let detail = `${latencyMs} ms to server`;
  if (latencyMs > 800) {
    label = "Poor";
    ok = false;
    detail = `${latencyMs} ms — too slow for a stable call`;
  } else if (latencyMs > 350) {
    label = "Fair";
    ok = true;
    detail = `${latencyMs} ms — usable, but may lag`;
  } else {
    detail = `${latencyMs} ms — ready for a call`;
  }

  return { ok, label, latencyMs, mbps, detail };
}

/**
 * Camera + mic (or mic only for voice).
 * Video mode requires a live camera track — no audio-only fallback.
 */
export async function checkDevices(voiceOnly) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error("This browser cannot access camera or microphone."), {
      name: "NotSupportedError",
    });
  }

  let stream;
  if (voiceOnly) {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } else {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: "user" },
      });
    } catch (err) {
      if (err?.name !== "NotAllowedError" && err?.name !== "PermissionDeniedError") {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        } catch (err2) {
          throw err2;
        }
      } else {
        throw err;
      }
    }
  }

  const audio = stream.getAudioTracks()[0];
  const video = stream.getVideoTracks()[0];

  if (!trackLive(audio)) {
    stream.getTracks().forEach((t) => t.stop());
    throw Object.assign(new Error("Microphone is not working."), { name: "NotReadableError" });
  }

  if (!voiceOnly && !trackLive(video)) {
    stream.getTracks().forEach((t) => t.stop());
    throw Object.assign(new Error("Camera is not working. Video calls need a camera."), {
      name: "NotFoundError",
    });
  }

  return {
    stream,
    micOk: true,
    cameraOk: voiceOnly ? null : true,
    detail: voiceOnly ? "Microphone is ready" : "Camera and microphone are ready",
  };
}

export function deviceErrorMessage(err, voiceOnly) {
  return explainMediaError(err, voiceOnly);
}

/** Peak mic level 0–1 over ~600ms for a simple meter. */
export async function sampleMicLevel(stream, ms = 600) {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  let peak = 0;
  const started = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
      peak = Math.max(peak, avg);
      if (performance.now() - started >= ms) resolve();
      else requestAnimationFrame(tick);
    };
    tick();
  });
  try {
    await audioCtx.close();
  } catch {
    /* ignore */
  }
  return peak;
}
