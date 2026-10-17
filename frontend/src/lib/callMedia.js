let cachedStream = null;

export function explainMediaError(err, voiceOnly = false) {
  const name = err?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Microphone or camera access was blocked. Tap Allow in the browser popup.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return voiceOnly ? "No microphone was found." : "No camera was found.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "The camera or microphone is busy. Close the other app using it, then try again.";
  }
  if (name === "SecurityError") {
    return "Open the https:// address and trust the Lisan certificate.";
  }
  return err?.message || "Could not start the camera.";
}

export async function requestMediaStream(voiceOnly) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      window.isSecureContext
        ? "This browser cannot access the camera or microphone."
        : "Open the https:// address, not http://."
    );
  }
  if (voiceOnly) {
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  }
  const attempts = [
    { audio: true, video: { facingMode: "user" } },
    { audio: true, video: true },
    { audio: true, video: false },
  ];
  let lastError;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") throw err;
    }
  }
  throw lastError || new Error("Could not start the camera");
}

function streamIsLive(stream) {
  return Boolean(stream?.getTracks?.().some((track) => track.readyState === "live"));
}

export async function primeCallMedia(voiceOnly = false) {
  if (streamIsLive(cachedStream)) {
    if (voiceOnly) {
      cachedStream.getVideoTracks().forEach((track) => {
        track.stop();
        cachedStream.removeTrack(track);
      });
      if (cachedStream.getAudioTracks().some((track) => track.readyState === "live")) {
        return cachedStream;
      }
    } else {
      return cachedStream;
    }
  }
  cachedStream = await requestMediaStream(Boolean(voiceOnly));
  return cachedStream;
}

export function takeCallMedia() {
  return streamIsLive(cachedStream) ? cachedStream : null;
}

/** Store a live stream from pre-call checks so join can reuse it. */
export function setPrimedMedia(stream) {
  if (!streamIsLive(stream)) return;
  if (cachedStream && cachedStream !== stream) {
    const keep = new Set(stream.getTracks());
    cachedStream.getTracks?.().forEach((track) => {
      // Never stop a track that is still part of the stream we are keeping.
      if (!keep.has(track)) track.stop();
    });
  }
  cachedStream = stream;
}

export function releaseCallMedia() {
  cachedStream?.getTracks?.().forEach((track) => track.stop());
  cachedStream = null;
}
