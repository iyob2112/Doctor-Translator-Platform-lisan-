import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { explainMediaError, primeCallMedia, releaseCallMedia, takeCallMedia } from "../lib/callMedia.js";

const DEFAULT_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const calls = new Map();
const queuedSignals = [];
const remoteEls = new Map();

function callKey(sessionId, peerId) {
  return peerId ? `${sessionId}:${peerId}` : sessionId;
}

function remoteAudioEl(peerId) {
  const id = peerId ? `roomline-remote-audio-${peerId}` : "roomline-remote-audio";
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("audio");
    el.id = id;
    el.autoplay = true;
    el.setAttribute("playsinline", "true");
    document.body.appendChild(el);
  }
  return el;
}

function trackKey(stream) {
  if (!stream?.getTracks) return "";
  return stream
    .getTracks()
    .map((track) => track.id)
    .sort()
    .join(",");
}

function playElement(el, stream, muted) {
  if (!el || !stream) return;
  const copy = new MediaStream(stream.getTracks());
  if (trackKey(el.srcObject) !== trackKey(copy)) {
    el.srcObject = copy;
  }
  el.autoplay = true;
  el.playsInline = true;
  el.setAttribute("playsinline", "true");
  el.setAttribute("webkit-playsinline", "true");
  el.muted = Boolean(muted);
  const run = el.play();
  if (run && typeof run.catch === "function") {
    run.catch(() => {
      el.muted = true;
      el.play()?.catch?.(() => {});
      if (!muted) {
        window.setTimeout(() => {
          el.muted = false;
          el.play()?.catch?.(() => {});
        }, 50);
      }
    });
  }
}

export function attachRemoteStream(videoEl, stream, peerId) {
  playRemote(videoEl, stream, peerId);
}

function playRemote(videoEl, stream, peerId) {
  if (!stream) return;
  const videoTracks = stream.getVideoTracks();
  const audioTracks = stream.getAudioTracks();
  if (videoEl) {
    playElement(videoEl, new MediaStream(videoTracks.length ? videoTracks : stream.getTracks()), true);
  }
  if (audioTracks.length) {
    playElement(remoteAudioEl(peerId), new MediaStream(audioTracks), false);
  }
}

function playLocal(videoEl, stream) {
  if (!videoEl || !stream) return;
  const videoTracks = stream.getVideoTracks();
  playElement(videoEl, new MediaStream(videoTracks.length ? videoTracks : stream.getTracks()), true);
}

function getCall(sessionId, peerId, iceServers) {
  const key = callKey(sessionId, peerId);
  const existing = calls.get(key);
  if (existing?.pc && existing.pc.signalingState !== "closed") return existing;
  const pc = new RTCPeerConnection({
    iceServers: iceServers?.length ? iceServers : DEFAULT_ICE_SERVERS,
    iceCandidatePoolSize: 4,
  });
  const call = {
    pc,
    peerId,
    remote: new MediaStream(),
    pendingIce: [],
    makingOffer: false,
    onSignal: null,
    onRemote: null,
    onState: null,
  };
  pc.ontrack = (event) => {
    const incoming = event.streams?.[0];
    if (incoming) {
      call.remote = incoming;
    } else if (event.track && !call.remote.getTracks().includes(event.track)) {
      call.remote.addTrack(event.track);
    }
    call.onRemote?.(call.remote);
    if (event.track) {
      event.track.onunmute = () => call.onRemote?.(call.remote);
      event.track.onended = () => call.onRemote?.(call.remote);
    }
  };
  pc.onicecandidate = (event) => {
    if (!event.candidate) return;
    call.onSignal?.({
      type: "ice",
      candidate: event.candidate.toJSON ? event.candidate.toJSON() : {
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
      },
    });
  };
  pc.oniceconnectionstatechange = () => call.onState?.(pc.iceConnectionState);
  pc.onconnectionstatechange = () => call.onState?.(pc.connectionState);
  calls.set(key, call);
  return call;
}

function addLocalTracks(pc, stream) {
  if (!pc || !stream) return;
  stream.getTracks().forEach((track) => {
    const sender = pc.getSenders().find((item) => item.track?.kind === track.kind);
    if (sender) {
      if (sender.track !== track) sender.replaceTrack(track);
      return;
    }
    pc.addTrack(track, stream);
  });
}

function streamHasLiveTracks(stream) {
  return Boolean(stream?.getTracks?.().some((track) => track.readyState === "live"));
}

function refreshLocalTracks(sessionId, stream) {
  if (!sessionId || !stream) return;
  for (const [key, call] of calls.entries()) {
    if (key === sessionId || key.startsWith(`${sessionId}:`)) {
      addLocalTracks(call.pc, stream);
    }
  }
}

function isClinicRole(role) {
  return role === "hospital_admin" || role === "doctor";
}

function toSdp(value) {
  if (!value) return null;
  if (value.sdp && value.type && typeof value.sdp === "string") return { type: value.type, sdp: value.sdp };
  if (value.sdp?.sdp) return { type: value.sdp.type || value.type, sdp: value.sdp.sdp };
  return value;
}

function drainIce(call) {
  const queued = call.pendingIce.splice(0);
  queued.forEach((candidate) => {
    call.pc.addIceCandidate(candidate).catch(() => {});
  });
}

function destroyPeer(sessionId, peerId) {
  const key = callKey(sessionId, peerId);
  const call = calls.get(key);
  if (call) {
    call.pc.close();
    calls.delete(key);
  }
  remoteEls.delete(peerId);
  const audio = document.getElementById(`roomline-remote-audio-${peerId}`);
  if (audio) {
    audio.srcObject = null;
    audio.remove();
  }
}

export function destroyCall(sessionId) {
  for (const [key, call] of [...calls.entries()]) {
    if (!sessionId || key === sessionId || key.startsWith(`${sessionId}:`)) {
      call.pc.close();
      calls.delete(key);
    }
  }
  remoteEls.clear();
  document.querySelectorAll("[id^='roomline-remote-audio']").forEach((el) => {
    el.srcObject = null;
    el.remove();
  });
}

function primaryPeerId(session, user) {
  if (!session || !user) return null;
  if (user.role === "hospital_admin" || user.role === "doctor") return session.translatorId || null;
  if (user.role === "translator") return session.doctorId || null;
  return null;
}

function isWatcher(user) {
  return user?.role === "admin" || user?.role === "subadmin";
}

function isHiddenPeer(peer) {
  return Boolean(peer?.hidden || peer?.role === "admin" || peer?.role === "subadmin");
}

export function useCall({ socketRef, session, user, enabled, iceServers }) {
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const sessionRef = useRef(session);
  const userRef = useRef(user);
  const iceRef = useRef(iceServers);
  const enabledRef = useRef(Boolean(enabled));
  const signalChain = useRef(Promise.resolve());
  const offerToRef = useRef(new Set());
  const goneRef = useRef(new Set());
  const peerMetaRef = useRef(new Map());
  const dropPeerRef = useRef(() => {});
  sessionRef.current = session;
  userRef.current = user;
  enabledRef.current = Boolean(enabled);

  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  const [mediaStarted, setMediaStarted] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [remotes, setRemotes] = useState([]);

  const iceConfig = useMemo(
    () => (iceServers?.length ? iceServers : DEFAULT_ICE_SERVERS),
    [iceServers]
  );
  iceRef.current = iceConfig;

  const rememberPeer = useCallback((peer) => {
    if (!peer?.id || peer.id === userRef.current?.id) return;
    if (isHiddenPeer(peer)) {
      peerMetaRef.current.set(peer.id, { hidden: true, name: "", role: "" });
      return;
    }
    peerMetaRef.current.set(peer.id, {
      hidden: false,
      name: peer.fullName || peer.name || "",
      role: peer.role || "",
    });
    setRemotes((prev) =>
      prev.map((item) =>
        item.peerId === peer.id
          ? {
              ...item,
              name: peer.fullName || peer.name || item.name,
              role: peer.role || item.role,
            }
          : item
      )
    );
  }, []);

  const dropPeer = useCallback((peerId, options = {}) => {
    if (!peerId || peerId === userRef.current?.id) return;
    const current = sessionRef.current;
    const keepId = primaryPeerId(current, userRef.current);
    if (!options.force && peerId === keepId) return;
    goneRef.current.add(peerId);
    offerToRef.current.delete(peerId);
    if (current?.id) destroyPeer(current.id, peerId);
    setRemotes((prev) => prev.filter((item) => item.peerId !== peerId));
    const keepCall = current?.id && keepId ? calls.get(callKey(current.id, keepId)) : null;
    if (keepCall?.remote.getTracks().length) {
      playRemote(remoteEls.get(keepId), keepCall.remote, keepId);
      setRemoteReady(true);
    }
  }, []);
  dropPeerRef.current = dropPeer;

  const upsertRemote = useCallback((peerId, stream) => {
    if (!peerId || goneRef.current.has(peerId)) return;
    const meta = peerMetaRef.current.get(peerId) || {};
    if (meta.hidden) return;
    const ready = Boolean(
      stream?.getTracks?.().some((track) => track.readyState === "live")
    );
    setRemotes((prev) => {
      const next = prev.filter((item) => item.peerId !== peerId);
      next.push({
        peerId,
        stream,
        name: meta.name || "",
        role: meta.role || "",
        ready,
      });
      return next;
    });
    if (ready) {
      setRemoteReady(true);
      setMediaError("");
    }
  }, []);

  const emitSignal = useCallback((payload, peerId) => {
    const current = sessionRef.current;
    if (!socketRef.current || !current?.id) return;
    socketRef.current.emit("call:signal", {
      session_id: current.id,
      to: peerId || payload.to,
      payload,
    });
  }, [socketRef]);

  const bindCall = useCallback(
    (call, peerId) => {
      call.onSignal = (payload) => emitSignal(payload, peerId);
      call.onRemote = (stream) => {
        const meta = peerMetaRef.current.get(peerId) || {};
        if (meta.hidden) return;
        playRemote(remoteEls.get(peerId), stream, peerId);
        upsertRemote(peerId, stream);
      };
      call.onState = (state) => {
        if (state === "connected" || state === "completed") {
          goneRef.current.delete(peerId);
          setMediaError("");
          return;
        }
        const keepId = primaryPeerId(sessionRef.current, userRef.current);
        if (peerId && peerId !== keepId && (state === "disconnected" || state === "failed" || state === "closed")) {
          window.setTimeout(() => {
            const still = sessionRef.current?.id ? calls.get(callKey(sessionRef.current.id, peerId)) : null;
            const ice = still?.pc.iceConnectionState;
            const conn = still?.pc.connectionState;
            if (!still || ice === "disconnected" || ice === "failed" || ice === "closed" || conn === "failed" || conn === "closed" || conn === "disconnected") {
              dropPeerRef.current(peerId);
            }
          }, state === "disconnected" ? 400 : 0);
          return;
        }
        if (state === "failed") {
          setMediaError("Video could not connect. Use the same Wi‑Fi, then end and start the call again.");
        }
      };
      if (call.remote.getTracks().length) {
        const meta = peerMetaRef.current.get(peerId) || {};
        if (!meta.hidden) {
          playRemote(remoteEls.get(peerId), call.remote, peerId);
          upsertRemote(peerId, call.remote);
        }
      }
    },
    [emitSignal, upsertRemote]
  );

  const bindLocalVideo = useCallback((el) => {
    localVideoRef.current = el;
    if (el && localStreamRef.current) playLocal(el, localStreamRef.current);
  }, []);

  const bindRemoteVideo = useCallback((peerId) => {
    return (el) => {
      if (el) remoteEls.set(peerId, el);
      else remoteEls.delete(peerId);
      const current = sessionRef.current;
      const call = current?.id ? calls.get(callKey(current.id, peerId)) : null;
      if (el && call?.remote.getTracks().length) playRemote(el, call.remote, peerId);
    };
  }, []);

  const startLocalMedia = useCallback(async (forceAudio = false) => {
    if (isWatcher(userRef.current)) {
      setMuted(true);
      setCameraOff(true);
      setMediaStarted(true);
      setMediaError("");
      return null;
    }
    const voiceOnly = forceAudio || sessionRef.current?.callMode === "voice";
    if (!forceAudio && streamHasLiveTracks(localStreamRef.current)) {
      playLocal(localVideoRef.current, localStreamRef.current);
      refreshLocalTracks(sessionRef.current?.id, localStreamRef.current);
      setMediaStarted(true);
      return localStreamRef.current;
    }
    try {
      if (forceAudio) releaseCallMedia();
      // Drop a dead/stale ref so primeCallMedia can adopt the pre-check stream.
      if (localStreamRef.current && !streamHasLiveTracks(localStreamRef.current)) {
        localStreamRef.current = null;
      }
      const stream = await primeCallMedia(voiceOnly);
      localStreamRef.current = stream;
      playLocal(localVideoRef.current, stream);
      refreshLocalTracks(sessionRef.current?.id, stream);
      if (!stream.getVideoTracks().length) setCameraOff(true);
      setMediaError("");
      setMediaStarted(true);
      return stream;
    } catch (err) {
      setMediaError(explainMediaError(err, voiceOnly));
      throw err;
    }
  }, []);

  const createOffer = useCallback(async (peerId) => {
    const current = sessionRef.current;
    const target = peerId || primaryPeerId(current, userRef.current);
    if (!current?.id || !target || target === userRef.current?.id || !localStreamRef.current) return;
    if (goneRef.current.has(target)) return;
    const call = getCall(current.id, target, iceRef.current);
    bindCall(call, target);
    const ice = call.pc.iceConnectionState;
    if (ice === "connected" || ice === "completed") return;
    if (call.pc.connectionState === "connected") return;
    addLocalTracks(call.pc, localStreamRef.current);
    if (call.pc.signalingState === "have-local-offer" && call.pc.localDescription) {
      emitSignal({
        type: "offer",
        sdp: { type: call.pc.localDescription.type, sdp: call.pc.localDescription.sdp },
      }, target);
      return;
    }
    if (call.pc.remoteDescription) return;
    if (call.pc.signalingState !== "stable" || call.makingOffer) return;
    call.makingOffer = true;
    try {
      const offer = await call.pc.createOffer();
      await call.pc.setLocalDescription(offer);
      emitSignal({
        type: "offer",
        sdp: { type: call.pc.localDescription.type, sdp: call.pc.localDescription.sdp },
      }, target);
    } catch {
      call.makingOffer = false;
    }
  }, [bindCall, emitSignal]);

  const acceptOffer = useCallback(
    async (payload, peerId) => {
      const current = sessionRef.current;
      const desc = toSdp(payload.sdp || payload);
    if (!current?.id || !peerId || !desc?.sdp) return;
    if (!localStreamRef.current && !isWatcher(userRef.current)) return;
    const call = getCall(current.id, peerId, iceRef.current);
    bindCall(call, peerId);
    if (localStreamRef.current) addLocalTracks(call.pc, localStreamRef.current);
      if (call.pc.remoteDescription?.sdp === desc.sdp && call.pc.localDescription) {
        emitSignal({
          type: "answer",
          sdp: { type: call.pc.localDescription.type, sdp: call.pc.localDescription.sdp },
        }, peerId);
        return;
      }
      if (call.pc.signalingState === "have-local-offer") {
        await call.pc.setLocalDescription({ type: "rollback" }).catch(() => {});
      }
      if (call.pc.signalingState !== "stable" && call.pc.signalingState !== "have-remote-offer") return;
      await call.pc.setRemoteDescription(new RTCSessionDescription(desc));
      drainIce(call);
      const answer = await call.pc.createAnswer();
      await call.pc.setLocalDescription(answer);
      emitSignal({
        type: "answer",
        sdp: { type: call.pc.localDescription.type, sdp: call.pc.localDescription.sdp },
      }, peerId);
    },
    [bindCall, emitSignal]
  );

  const signalReady = useCallback(() => {
    const current = sessionRef.current;
    const target = primaryPeerId(current, userRef.current);
    if (userRef.current?.role !== "translator" || !streamHasLiveTracks(localStreamRef.current) || !target) return;
    const call = current?.id ? calls.get(callKey(current.id, target)) : null;
    const ice = call?.pc.iceConnectionState;
    if (ice === "connected" || ice === "completed") return;
    if (call?.pc.connectionState === "connected") return;
    emitSignal({ type: "ready" }, target);
  }, [emitSignal]);

  const unlockMedia = useCallback(async (forceAudio = false) => {
    await startLocalMedia(forceAudio);
    socketRef.current?.emit("session:join", { session_id: sessionRef.current?.id });
    if (userRef.current?.role === "translator") signalReady();
    else {
      const target = primaryPeerId(sessionRef.current, userRef.current);
      if (target) await createOffer(target);
      for (const peerId of offerToRef.current) {
        await createOffer(peerId);
      }
    }
  }, [createOffer, signalReady, socketRef, startLocalMedia]);

  const processSignal = useCallback(
    async (packet) => {
      const payload = packet?.payload || packet;
      if (!payload?.type) return;
      const current = sessionRef.current;
      if (!current?.id) {
        queuedSignals.push(packet);
        return;
      }
      if (packet?.session_id && packet.session_id !== current.id) return;

      // Do not start media or negotiate while the pre-call check is still open.
      // Early negotiation + Join stopping those tracks was killing video when
      // the hospital joined first and the translator joined after the check.
      if (!enabledRef.current && !isWatcher(userRef.current)) {
        if (payload.type === "bye") {
          const peerId =
            packet.from || payload.from || primaryPeerId(current, userRef.current);
          if (peerId && peerId !== userRef.current?.id) {
            dropPeerRef.current(peerId, { force: true });
          }
          return;
        }
        queuedSignals.push(packet);
        return;
      }

      const peerId =
        packet.from ||
        payload.from ||
        primaryPeerId(current, userRef.current);
      if (!peerId || peerId === userRef.current?.id) return;
      try {
        if (payload.type === "bye") {
          dropPeerRef.current(peerId, { force: true });
          return;
        }
        if (payload.type === "ready" && isClinicRole(userRef.current?.role)) {
          if (!streamHasLiveTracks(localStreamRef.current)) {
            await startLocalMedia().catch(() => {});
          }
          await createOffer(peerId);
          return;
        }
        if (payload.type === "offer") {
          if (!streamHasLiveTracks(localStreamRef.current) && !isWatcher(userRef.current)) {
            await startLocalMedia().catch(() => {});
          }
          if (!streamHasLiveTracks(localStreamRef.current) && !isWatcher(userRef.current)) {
            queuedSignals.push(packet);
            return;
          }
          await acceptOffer(payload, peerId);
          return;
        }
        if (payload.type === "answer") {
          const call = calls.get(callKey(current.id, peerId));
          const desc = toSdp(payload.sdp || payload);
          if (!call || !desc?.sdp) return;
          if (call.pc.signalingState === "have-local-offer") {
            await call.pc.setRemoteDescription(new RTCSessionDescription(desc));
            call.makingOffer = false;
            drainIce(call);
          }
          return;
        }
        if (payload.type === "ice") {
          const call = getCall(current.id, peerId, iceRef.current);
          bindCall(call, peerId);
          const raw = payload.candidate;
          const candidate = raw?.candidate && typeof raw.candidate === "object" ? raw.candidate : raw;
          if (!candidate?.candidate) return;
          if (!call.pc.remoteDescription) {
            call.pendingIce.push(candidate);
            return;
          }
          await call.pc.addIceCandidate(candidate).catch(() => {});
        }
      } catch {
        const call = current?.id ? calls.get(callKey(current.id, peerId)) : null;
        if (call) call.makingOffer = false;
      }
    },
    [acceptOffer, bindCall, createOffer, startLocalMedia]
  );

  const handleSignal = useCallback((packet) => {
    signalChain.current = signalChain.current.then(() => processSignal(packet)).catch(() => {});
  }, [processSignal]);

  const onPeers = useCallback((packet) => {
    if (packet?.session_id && packet.session_id !== sessionRef.current?.id) return;
    if (!enabledRef.current) return;
    (packet?.peers || []).forEach((peer) => {
      if (!peer?.id || peer.id === userRef.current?.id) return;
      rememberPeer(peer);
      if (isHiddenPeer(peer)) {
        if (isClinicRole(userRef.current?.role) && streamHasLiveTracks(localStreamRef.current)) {
          offerToRef.current.add(peer.id);
          createOffer(peer.id).catch(() => {});
        }
        return;
      }
      if (isWatcher(userRef.current)) return;
      // Clinic always offers; translator only announces ready (avoids glare).
      if (userRef.current?.role === "translator") {
        if (streamHasLiveTracks(localStreamRef.current)) signalReady();
        return;
      }
      if (isClinicRole(userRef.current?.role)) {
        offerToRef.current.add(peer.id);
        if (streamHasLiveTracks(localStreamRef.current)) createOffer(peer.id).catch(() => {});
      }
    });
  }, [createOffer, rememberPeer, signalReady]);

  const onPeerJoined = useCallback((packet) => {
    const peer = packet?.peer;
    if (!peer?.id || peer.id === userRef.current?.id) return;
    if (packet?.session_id && packet.session_id !== sessionRef.current?.id) return;
    rememberPeer(peer);
    goneRef.current.delete(peer.id);
    if (!enabledRef.current) return;
    if (isHiddenPeer(peer)) {
      if (isClinicRole(userRef.current?.role) && streamHasLiveTracks(localStreamRef.current)) {
        offerToRef.current.add(peer.id);
        createOffer(peer.id).catch(() => {});
      }
      return;
    }
    if (isWatcher(userRef.current)) return;
    if (userRef.current?.role === "translator") {
      if (streamHasLiveTracks(localStreamRef.current)) signalReady();
      return;
    }
    if (isClinicRole(userRef.current?.role)) {
      offerToRef.current.add(peer.id);
      if (streamHasLiveTracks(localStreamRef.current)) createOffer(peer.id).catch(() => {});
    }
  }, [createOffer, rememberPeer, signalReady]);

  const onPeerLeft = useCallback((packet) => {
    const peerId = packet?.user_id || packet?.peerId;
    if (!peerId) return;
    if (packet?.session_id && packet.session_id !== sessionRef.current?.id) return;
    dropPeer(peerId, { force: true });
  }, [dropPeer]);

  useEffect(() => {
    // Drop stale signals from a previous session so they cannot revive dead tracks.
    if (!session?.id) {
      queuedSignals.length = 0;
      return undefined;
    }
    if (!enabled) return undefined;
    if (!mediaStarted && !isWatcher(userRef.current)) return undefined;
    if (!queuedSignals.length) return undefined;
    const pending = queuedSignals.splice(0);
    pending.forEach((packet) => handleSignal(packet));
    return undefined;
  }, [enabled, handleSignal, mediaStarted, session?.id]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (isWatcher(userRef.current)) {
      startLocalMedia().catch(() => {});
      return undefined;
    }
    if (streamHasLiveTracks(localStreamRef.current)) {
      playLocal(localVideoRef.current, localStreamRef.current);
      refreshLocalTracks(sessionRef.current?.id, localStreamRef.current);
      setMediaStarted(true);
      return undefined;
    }
    // Prefer the pre-check stream; otherwise open a fresh capture.
    if (!takeCallMedia() && !localStreamRef.current) {
      /* still call startLocalMedia — it will request devices */
    }
    startLocalMedia().catch(() => {});
    return undefined;
  }, [enabled, startLocalMedia]);

  useEffect(() => {
    if (!enabled || !session?.id || !socketRef.current) return undefined;
    socketRef.current.emit("session:join", { session_id: session.id });
    if (!mediaStarted) return undefined;
    playLocal(localVideoRef.current, localStreamRef.current);
    if (userRef.current?.role === "translator") signalReady();
    else {
      const target = primaryPeerId(sessionRef.current, userRef.current);
      if (target) createOffer(target).catch(() => {});
      for (const peerId of offerToRef.current) {
        createOffer(peerId).catch(() => {});
      }
    }
    const retry = setInterval(() => {
      if (isWatcher(userRef.current)) return;
      if (!streamHasLiveTracks(localStreamRef.current) && !isWatcher(userRef.current)) return;
      if (userRef.current?.role === "translator") signalReady();
      else {
        const target = primaryPeerId(sessionRef.current, userRef.current);
        if (target) createOffer(target).catch(() => {});
        for (const peerId of offerToRef.current) {
          createOffer(peerId).catch(() => {});
        }
      }
    }, 2500);
    return () => clearInterval(retry);
  }, [createOffer, enabled, mediaStarted, session, signalReady, socketRef]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setMuted(next);
  }, [muted]);

  const toggleCamera = useCallback(() => {
    const next = !cameraOff;
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = !next;
    });
    setCameraOff(next);
  }, [cameraOff]);

  const resetConnection = useCallback(async () => {
    if (sessionRef.current?.id) destroyCall(sessionRef.current.id);
    setRemoteReady(false);
    setRemotes([]);
    signalReady();
    for (const peerId of offerToRef.current) {
      createOffer(peerId).catch(() => {});
    }
  }, [createOffer, signalReady]);

  const endCall = useCallback(() => {
    if (sessionRef.current?.id) destroyCall(sessionRef.current.id);
    setRemotes([]);
  }, []);

  return {
    localVideoRef: bindLocalVideo,
    bindRemoteVideo,
    remotes,
    muted,
    cameraOff,
    remoteReady,
    mediaStarted,
    mediaError,
    unlockMedia,
    toggleMute,
    toggleCamera,
    handleSignal,
    onPeers,
    onPeerJoined,
    onPeerLeft,
    resetConnection,
    endCall,
  };
}
