import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { setPrimedMedia } from "../lib/callMedia.js";
import {
  checkDevices,
  checkNetwork,
  deviceErrorMessage,
  sampleMicLevel,
} from "../lib/preCallCheck.js";

function StatusRow({ label, state, detail }) {
  const tone =
    state === "ok"
      ? "text-emerald-700 bg-emerald-50 border-emerald-100"
      : state === "fail"
        ? "text-rose-700 bg-rose-50 border-rose-100"
        : state === "checking"
          ? "text-amber-800 bg-amber-50 border-amber-100"
          : "text-slate-600 bg-slate-50 border-slate-100";
  const icon =
    state === "ok" ? "check" : state === "fail" ? "x" : state === "checking" ? "clock" : "activity";
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${tone}`}>
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/70">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-0.5 text-xs opacity-80">{detail || "—"}</p>
      </div>
    </div>
  );
}

/**
 * Pre-call device + network gate.
 * Video: camera required (blocks Join if missing).
 * Voice: mic + network only.
 */
export default function PreCallCheckModal({ open, voiceOnly, onReady, onCancel }) {
  const videoRef = useRef(null);
  const previewStreamRef = useRef(null);
  const [running, setRunning] = useState(false);
  const [net, setNet] = useState({ state: "idle", detail: "Not checked yet" });
  const [mic, setMic] = useState({ state: "idle", detail: "Not checked yet", level: 0 });
  const [camera, setCamera] = useState({
    state: voiceOnly ? "skip" : "idle",
    detail: voiceOnly ? "Not needed for voice" : "Not checked yet",
  });
  const [error, setError] = useState("");

  function stopPreview() {
    previewStreamRef.current?.getTracks?.().forEach((t) => t.stop());
    previewStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function runChecks() {
    setRunning(true);
    setError("");
    setNet({ state: "checking", detail: "Testing connection…" });
    setMic({ state: "checking", detail: "Requesting microphone…", level: 0 });
    setCamera(
      voiceOnly
        ? { state: "skip", detail: "Not needed for voice" }
        : { state: "checking", detail: "Requesting camera…" }
    );
    stopPreview();

    try {
      const network = await checkNetwork();
      setNet({
        state: network.ok ? "ok" : "fail",
        detail: network.detail,
        label: network.label,
      });
      if (!network.ok) {
        setError("Internet is too slow for a stable call. Move closer to Wi‑Fi or try again.");
      }
    } catch (err) {
      setNet({ state: "fail", detail: err.message || "Network check failed" });
      setError(err.message || "Could not check internet");
      setRunning(false);
      return;
    }

    try {
      const devices = await checkDevices(voiceOnly);
      previewStreamRef.current = devices.stream;
      if (videoRef.current && !voiceOnly) {
        videoRef.current.srcObject = devices.stream;
        await videoRef.current.play().catch(() => {});
      }
      const level = await sampleMicLevel(devices.stream);
      setMic({
        state: "ok",
        detail: level > 0.02 ? "Microphone is working — speak to test" : "Microphone on (speak to see the meter)",
        level,
      });
      if (!voiceOnly) {
        setCamera({ state: "ok", detail: "Camera preview looks good" });
      }
    } catch (err) {
      const msg = deviceErrorMessage(err, voiceOnly);
      setMic({
        state: voiceOnly || err?.name === "NotAllowedError" ? "fail" : "fail",
        detail: msg,
        level: 0,
      });
      if (!voiceOnly) {
        const camFail =
          err?.name === "NotFoundError" ||
          /camera/i.test(err?.message || "") ||
          err?.name === "NotReadableError";
        setCamera({
          state: "fail",
          detail: camFail ? msg : "Camera check failed",
        });
      }
      setError(msg);
      setRunning(false);
      return;
    }

    setRunning(false);
  }

  useEffect(() => {
    if (!open) {
      stopPreview();
      return undefined;
    }
    runChecks();
    return () => stopPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, voiceOnly]);

  if (!open) return null;

  const cameraBlocks = !voiceOnly && camera.state === "fail";
  const micBlocks = mic.state === "fail";
  const netBlocks = net.state === "fail";
  const allOk =
    !running &&
    net.state === "ok" &&
    mic.state === "ok" &&
    (voiceOnly || camera.state === "ok");
  const canJoin = allOk && !cameraBlocks;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-ink/75 p-0 backdrop-blur-sm sm:place-items-center sm:p-4">
      <div className="max-h-[92dvh] w-full max-w-lg animate-pop-in overflow-y-auto rounded-t-4xl bg-white p-5 text-ink shadow-lift sm:rounded-4xl sm:p-7">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-700">
          <Icon name={voiceOnly ? "mic" : "video"} className="h-5 w-5" />
        </span>
        <h2 className="mt-4 font-display text-2xl">Before you join</h2>
        <p className="mt-2 text-sm text-slate-500">
          {voiceOnly
            ? "We check your internet and microphone before the voice call starts."
            : "We check your internet, camera, and microphone. Video calls need a working camera."}
        </p>

        {!voiceOnly ? (
          <div className="mt-5 overflow-hidden rounded-3xl bg-ink">
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              className="aspect-video w-full object-cover"
            />
          </div>
        ) : null}

        <div className="mt-5 space-y-2">
          <StatusRow
            label={`Internet${net.label ? ` · ${net.label}` : ""}`}
            state={net.state}
            detail={net.detail}
          />
          <StatusRow label="Microphone" state={mic.state} detail={mic.detail} />
          {mic.state === "ok" ? (
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-brand-500 transition-all"
                style={{ width: `${Math.min(100, Math.round((mic.level || 0) * 200))}%` }}
              />
            </div>
          ) : null}
          {!voiceOnly ? (
            <StatusRow label="Camera" state={camera.state} detail={camera.detail} />
          ) : null}
        </div>

        {error ? (
          <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
        ) : null}
        {cameraBlocks ? (
          <p className="mt-3 text-sm font-medium text-rose-700">
            Camera is required for video calls. Fix the camera, then try again.
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-dark flex-1 py-3 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canJoin}
            onClick={() => {
              const stream = previewStreamRef.current;
              if (stream) setPrimedMedia(stream);
              previewStreamRef.current = null;
              if (videoRef.current) videoRef.current.srcObject = null;
              onReady?.();
            }}
          >
            {canJoin ? "Join call" : running ? "Checking…" : "Join blocked"}
          </button>
          <button type="button" className="btn-ghost flex-1 py-3" onClick={() => runChecks()} disabled={running}>
            Test again
          </button>
          <button
            type="button"
            className="btn-ghost w-full py-3 sm:w-auto"
            onClick={() => {
              stopPreview();
              onCancel?.();
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
