import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api, { getAccessToken } from "../api/client.js";
import { API_BASE } from "../api/config.js";
import { releaseCallMedia } from "../lib/callMedia.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../hooks/useSocket.js";
import { attachRemoteStream, useCall } from "../hooks/useCall.js";
import CallControls from "../components/CallControls.jsx";
import RatingModal from "../components/RatingModal.jsx";
import TransferModal from "../components/TransferModal.jsx";
import DailyRoom from "../components/DailyRoom.jsx";
import CallChat from "../components/CallChat.jsx";
import TranslatorCallDesk from "../components/TranslatorCallDesk.jsx";
import Icon from "../components/Icon.jsx";
import { BrandMark, initials } from "../components/Layout.jsx";
import { homeFor, roleLabel, isClinicSide, isWatchOnly, clinicLabel } from "../roles.js";

function useElapsed(startedAt) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!startedAt) return undefined;
    const tick = () =>
      setSeconds(Math.max(0, Math.round((Date.now() - new Date(startedAt)) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function hasLiveVideo(stream) {
  return Boolean(stream?.getVideoTracks?.().some((track) => track.readyState === "live"));
}

function RemoteMedia({ stream, peerId, className, onClick }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) attachRemoteStream(ref.current, stream, peerId);
  }, [peerId, stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      onClick={onClick}
      className={className}
    />
  );
}

function ZoomTile({ remote, self, localRef, label, role }) {
  const rawName = self ? "You" : label || remote?.name || "Participant";
  const kind = role || remote?.role;
  const name =
    !self && kind === "admin"
      ? `${rawName} · ${roleLabel(kind)}`
      : rawName;
  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden rounded-2xl bg-[#2d2d2d]">
      {self ? (
        <video
          ref={localRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full scale-x-[-1] object-cover"
        />
      ) : hasLiveVideo(remote?.stream) ? (
        <RemoteMedia
          peerId={remote.peerId}
          stream={remote.stream}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="grid h-full w-full place-items-center">
          <span className="grid h-24 w-24 place-items-center rounded-full bg-[#0e71eb] text-3xl font-semibold sm:h-28 sm:w-28 sm:text-4xl">
            {initials(name) || <Icon name="user" className="h-10 w-10" />}
          </span>
        </div>
      )}
      <span className="absolute bottom-3 left-3 max-w-[80%] truncate rounded bg-black/55 px-2.5 py-1 text-xs font-medium text-white">
        {name}
      </span>
    </div>
  );
}

function ZoomGallery({ tiles, localRef }) {
  const others = tiles.filter((tile) => !tile.self);
  const you = tiles.find((tile) => tile.self);
  const count = others.length;
  return (
    <div className="relative h-full min-h-0 w-full bg-[#1a1a1a] p-2">
      <div
        className={`grid h-full min-h-0 w-full gap-2 ${
          count <= 1 ? "grid-cols-1" : "grid-cols-2"
        } ${count >= 3 ? "grid-rows-2" : "grid-rows-1"}`}
      >
        {others.map((tile, index) => (
          <div
            key={tile.remote?.peerId || `tile-${index}`}
            className={count === 3 && index === 2 ? "col-span-2 mx-auto min-h-0 w-full max-w-[50%]" : "min-h-0"}
          >
            <ZoomTile remote={tile.remote} label={tile.label} role={tile.role} />
          </div>
        ))}
      </div>
      {you ? (
        <div className="absolute bottom-4 right-4 z-20 h-28 w-40 overflow-hidden rounded-xl border border-white/20 bg-[#2d2d2d] shadow-lg sm:h-32 sm:w-48">
          <ZoomTile self localRef={localRef} label="You" role={you.role} />
        </div>
      ) : null}
    </div>
  );
}

function VoiceBars({ live, muted }) {
  return (
    <div className={`voice-bars ${live ? (muted ? "is-muted" : "is-live") : ""}`} aria-hidden>
      {Array.from({ length: 12 }, (_, i) => (
        <span key={i} />
      ))}
    </div>
  );
}

function VoiceCallStage({
  counterpart,
  peerRole,
  language,
  elapsed,
  connected,
  mediaStarted,
  muted,
  mediaError,
  onUnlock,
  watching = false,
  children,
}) {
  return (
    <>
      {children}
      {!mediaStarted ? (
        <MediaUnlockCard voiceOnly onUnlock={onUnlock} error={mediaError} />
      ) : (
        <button
          type="button"
          onClick={() => onUnlock()}
          className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center"
        >
          <p className="text-[11px] uppercase tracking-[0.28em] text-brand-300">Voice interpretation</p>
          <div className="relative mt-8 grid h-40 w-40 place-items-center">
            <span className={`voice-ring voice-ring-a ${connected ? "" : "opacity-40"}`} />
            <span className={`voice-ring voice-ring-b ${connected ? "" : "opacity-30"}`} />
            <span className="relative grid h-32 w-32 place-items-center rounded-full bg-gradient-to-br from-brand-400 via-brand-500 to-plum-500 text-4xl font-semibold text-white shadow-lg shadow-brand-600/30">
              {initials(counterpart) || <Icon name="voice" className="h-12 w-12" />}
            </span>
          </div>
          <h2 className="mt-8 font-display text-4xl">{counterpart || "Connecting…"}</h2>
          <p className="mt-2 text-sm text-white/50">
            {peerRole}
            {language ? ` · ${language}` : ""}
          </p>
          <p className="mt-5 font-display text-4xl tabular-nums tracking-wide text-white/85">{elapsed}</p>
          <div className="mt-7">
            <VoiceBars live={connected} muted={muted} />
          </div>
          <p className="mt-5 text-sm text-white/60">
            {watching
              ? connected
                ? "Watching privately"
                : "Connecting to the live session…"
              : !connected
                ? "Calling… tap here if you cannot hear"
                : muted
                  ? "Your microphone is muted"
                  : "On the line"}
          </p>
        </button>
      )}
    </>
  );
}

function MediaUnlockCard({ voiceOnly, onUnlock, error }) {
  async function handleUnlock(forceAudio = false) {
    try {
      await onUnlock(forceAudio);
    } catch {
      /* shown in error */
    }
  }

  return (
    <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-ink/40 to-ink/90 p-5">
      <div className="max-w-sm text-center">
        <span className="relative mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/10">
          <Icon name={voiceOnly ? "mic" : "video"} className="relative h-7 w-7 text-white/80" />
        </span>
        <h2 className="mt-4 font-display text-2xl">
          {voiceOnly ? "Turn on your microphone" : "Turn on your camera"}
        </h2>
        <p className="mt-2 text-sm text-white/60">
          {voiceOnly
            ? "Tap the button, then Allow microphone when the browser asks."
            : "Tap the button, then Allow camera and microphone when the browser asks. You should see yourself on this screen."}
        </p>
        <button onClick={() => handleUnlock(false)} className="btn mt-5 bg-brand-500 px-6 text-white hover:bg-brand-400">
          {voiceOnly ? "Allow microphone" : "Allow camera and microphone"}
        </button>
        {error ? <p className="mt-4 text-sm text-rose-200">{error}</p> : null}
        {!voiceOnly ? (
          <button
            type="button"
            onClick={() => handleUnlock(true)}
            className="mt-3 text-sm font-semibold text-white/70 underline underline-offset-2 hover:text-white"
          >
            Join with microphone only
          </button>
        ) : null}
        <a
          href="/lisan-ca.crt"
          className="mt-4 inline-block text-xs text-brand-300 underline underline-offset-2"
        >
          If iPhone still blocks it, download the certificate
        </a>
        <p className="mt-2 text-[11px] leading-5 text-white/40">
          iPhone: Settings → Profile Downloaded → Install, then General → About → Certificate Trust
          Settings → enable Lisan Local CA, then reload this page.
        </p>
      </div>
    </div>
  );
}

export default function CallScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [session, setSession] = useState(null);
  const [notes, setNotes] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [roomLabel, setRoomLabel] = useState("");
  const [visitReason, setVisitReason] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [deskSaving, setDeskSaving] = useState(false);
  const [deskError, setDeskError] = useState("");
  const [handingOff, setHandingOff] = useState(false);
  const [error, setError] = useState("");
  const [callNotice, setCallNotice] = useState("");
  const [rateOpen, setRateOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [callConfig, setCallConfig] = useState(null);
  const [dailyMuted, setDailyMuted] = useState(false);
  const [dailyCamOff, setDailyCamOff] = useState(false);
  const [dailyReady, setDailyReady] = useState(false);
  const [dailyArmed, setDailyArmed] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const chatOpenRef = useRef(false);
  const messageIdsRef = useRef(new Set());
  chatOpenRef.current = chatOpen;
  const endedRef = useRef(false);
  const deskRef = useRef({ notes: "", doctorName: "", roomLabel: "", visitReason: "" });
  const persistDeskRef = useRef(null);
  deskRef.current = { notes, doctorName, roomLabel, visitReason };
  const signalRef = useRef(null);
  const resetRef = useRef(null);
  const finishRef = useRef(null);
  const leaveRef = useRef(null);
  const peerHandlersRef = useRef({});
  const dailyRef = useRef(null);
  const watchOnly = isWatchOnly(user);
  const isClinic = isClinicSide(user);

  const socketRef = useSocket({
    "call:signal": (payload) => signalRef.current?.(payload),
    "session:peers": (payload) => peerHandlersRef.current.onPeers?.(payload),
    "session:peer_joined": (payload) => peerHandlersRef.current.onPeerJoined?.(payload),
    "session:peer_left": (payload) => peerHandlersRef.current.onPeerLeft?.(payload),
    "session:ended": () => leaveRef.current?.(),
    "session:transfer_pending": (payload) => {
      if (payload?.session_id && payload.session_id !== id) return;
      setHandingOff(true);
    },
    "session:transferred_away": (payload) => {
      if (payload?.session_id && payload.session_id !== id) return;
      leaveRef.current?.();
    },
    "session:translator_joined": async (payload) => {
      if (payload?.session_id && payload.session_id !== id) return;
      if (isClinic && payload.transfer) {
        const oldId = payload.previous_translator_id;
        if (oldId && oldId !== payload.translator_id) {
          peerHandlersRef.current.onPeerLeft?.({
            session_id: id,
            user_id: oldId,
          });
        }
        const { data } = await api.get(`/sessions/${id}`);
        setSession(data.session);
      }
    },
    "call:message": (payload) => {
      if (!payload?.id || (payload.sessionId && payload.sessionId !== id)) return;
      if (messageIdsRef.current.has(payload.id)) return;
      messageIdsRef.current.add(payload.id);
      setMessages((prev) => {
        const withoutTemp = prev.filter(
          (m) =>
            !(
              String(m.id).startsWith("tmp-") &&
              m.senderId === payload.senderId &&
              m.body === payload.body
            )
        );
        if (withoutTemp.some((m) => m.id === payload.id)) return withoutTemp;
        return [...withoutTemp, payload];
      });
      if (payload.senderId !== user.id && !chatOpenRef.current) {
        setUnreadCount((n) => n + 1);
      }
    },
  });

  const {
    localVideoRef,
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
  } = useCall({
    socketRef,
    session,
    user,
    enabled: Boolean(session && session.status === "active" && callConfig?.provider !== "daily"),
    iceServers: callConfig?.iceServers,
  });

  signalRef.current = handleSignal;
  resetRef.current = resetConnection;
  peerHandlersRef.current = { onPeers, onPeerJoined, onPeerLeft };

  useEffect(() => {
    if (!watchOnly || !session || session.status !== "active") return undefined;
    if (callConfig?.provider === "daily" && callConfig.roomUrl) {
      setDailyArmed(true);
      return undefined;
    }
    unlockMedia().catch(() => {});
    return undefined;
  }, [watchOnly, session?.id, session?.status, callConfig, unlockMedia]);

  useEffect(() => {
    api
      .get(`/sessions/${id}`)
      .then(({ data }) => {
        setSession(data.session);
        setNotes(data.session.interpreterNotes || "");
        setDoctorName(data.session.attendingName || "");
        setRoomLabel(data.session.roomLabel || "");
        setVisitReason(data.session.visitReason || "");
      })
      .catch(() => setError("Session not found"));
    api
      .get(`/sessions/${id}/messages`)
      .then(({ data }) => {
        const list = data.messages || [];
        list.forEach((m) => {
          if (m?.id) messageIdsRef.current.add(m.id);
        });
        setMessages(list);
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!session || session.status !== "active") return undefined;
    const join = () => socketRef.current?.emit("session:join", { session_id: session.id });
    join();
    const timer = setInterval(() => {
      if (socketRef.current?.connected) {
        join();
        clearInterval(timer);
      }
    }, 300);
    return () => clearInterval(timer);
  }, [session?.id, session?.status]);

  useEffect(() => {
    if (session?.status !== "active") return undefined;
    let cancelled = false;
    api
      .post(`/sessions/${id}/call-token`)
      .then(({ data }) => {
        if (cancelled) return;
        setCallConfig(data);
        if (data?.fallbackReason) setCallNotice(data.fallbackReason);
      })
      .catch((err) => {
        if (cancelled) return;
        const status = err.response?.status;
        const message = err.response?.data?.error || "Could not start video for this call";
        if (status === 403 || status === 404) {
          setCallConfig(null);
          setError(message);
          return;
        }
        setCallConfig({
          provider: "webrtc",
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        setCallNotice(message);
      });
    return () => {
      cancelled = true;
    };
  }, [id, session?.status]);

  async function persistDesk({ keepalive = false } = {}) {
    if (watchOnly || user.role !== "translator") return;
    const payload = {
      notes: deskRef.current.notes,
      attendingName: deskRef.current.doctorName,
      roomLabel: deskRef.current.roomLabel,
      visitReason: deskRef.current.visitReason,
    };
    if (keepalive) {
      const token = getAccessToken();
      try {
        await fetch(`${API_BASE}/sessions/${id}/notes`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
          keepalive: true,
        });
      } catch {
        /* tab is closing */
      }
      return;
    }
    const { data } = await api.patch(`/sessions/${id}/notes`, payload);
    if (data.session) setSession(data.session);
    return data;
  }
  persistDeskRef.current = persistDesk;

  useEffect(() => {
    if (user.role !== "translator") return undefined;
    const flush = () => {
      persistDeskRef.current?.({ keepalive: true });
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [id, user.role]);

  async function leaveRoom() {
    if (endedRef.current) return;
    endedRef.current = true;
    try {
      await persistDesk();
    } catch {
      /* still leave */
    }
    try {
      dailyRef.current?.leave?.();
    } catch {
      /* already left */
    }
    const targets = new Set(remotes.map((remote) => remote.peerId));
    if (session?.doctorId && session.doctorId !== user.id) targets.add(session.doctorId);
    if (session?.translatorId && session.translatorId !== user.id) targets.add(session.translatorId);
    targets.forEach((peerId) => {
      socketRef.current?.emit("call:signal", {
        session_id: id,
        to: peerId,
        payload: { type: "bye" },
      });
    });
    socketRef.current?.emit("session:leave", { session_id: id });
    endCall?.();
    releaseCallMedia();
    navigate(homeFor(user));
  }
  leaveRef.current = leaveRoom;

  useEffect(() => {
    if (!session || user.role !== "translator") return;
    if (session.status !== "active") return;
    if (session.translatorId && session.translatorId !== user.id) {
      leaveRef.current?.();
    }
  }, [session, user.id, user.role]);

  async function finish(promptRating) {
    if (watchOnly) {
      leaveRoom();
      return;
    }
    if (endedRef.current) return;
    endedRef.current = true;
    try {
      await persistDesk();
    } catch {
      /* still end the call */
    }
    endCall?.();
    releaseCallMedia();
    try {
      await api.post(`/sessions/${id}/end`);
    } catch {
      /* already ended */
    }
    if (isClinic && promptRating) {
      setRateOpen(true);
      return;
    }
    navigate(homeFor(user));
  }
  finishRef.current = finish;

  async function saveNotes() {
    setDeskError("");
    setDeskSaving(true);
    try {
      await persistDesk();
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch (err) {
      setDeskError(err.response?.data?.error || "Could not save");
    } finally {
      setDeskSaving(false);
    }
  }

  async function transfer() {
    setDeskError("");
    try {
      await persistDesk();
      await api.post(`/sessions/${id}/transfer`, { reason });
      setTransferOpen(false);
      setReason("");
      setHandingOff(true);
    } catch (err) {
      setDeskError(err.response?.data?.error || "Could not hand off this call");
      setHandingOff(false);
    }
  }

  async function sendMessage(body) {
    if (watchOnly) return;
    const text = String(body || "").trim();
    if (!text || !session) return;
    const tempId = `tmp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        sessionId: session.id,
        senderId: user.id,
        body: text,
        createdAt: new Date().toISOString(),
        sender: { id: user.id, fullName: user.fullName, role: user.role },
      },
    ]);
    if (socketRef.current?.connected) {
      socketRef.current.emit("call:message", { session_id: session.id, body: text });
      return;
    }
    try {
      const { data } = await api.post(`/sessions/${id}/messages`, { body: text });
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        if (!data?.message?.id || withoutTemp.some((m) => m.id === data.message.id)) {
          return withoutTemp;
        }
        return [...withoutTemp, data.message];
      });
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    }
  }

  const elapsed = useElapsed(session?.startedAt);

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-ink text-white">
        <div className="text-center">
          <p className="font-display text-2xl">{error}</p>
          <button onClick={() => navigate("/")} className="btn-ghost mt-4">
            Back to desk
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="grid min-h-screen place-items-center bg-ink text-white">
        <div className="flex items-center gap-3 text-white/70">
          <span className="h-3 w-3 animate-ping rounded-full bg-brand-400" />
          Joining call…
        </div>
      </div>
    );
  }

  const visibleRemotes = remotes.filter((remote) => remote.role !== "admin" && !remote.hidden);
  const counterpart = isClinic
    ? session.translator?.fullName
    : user.role === "translator"
      ? clinicLabel(session)
      : [clinicLabel(session), session.translator?.fullName].filter(Boolean).join(" · ");
  const callTitle = counterpart;
  const primaryPeerId = isClinic
    ? session.translatorId
    : user.role === "translator"
      ? session.doctorId
      : session.doctorId;
  const primaryRemote =
    visibleRemotes.find((r) => r.peerId === primaryPeerId) ||
    visibleRemotes.find((r) => hasLiveVideo(r.stream));
  const guestRemotes = visibleRemotes.filter((r) => r.peerId !== (primaryRemote?.peerId || primaryPeerId));
  const peerRole = isClinic
    ? "Interpreter"
    : user.role === "translator"
      ? "Hospital"
      : "Live session";
  const voiceOnly = session.callMode === "voice";
  const isDaily = callConfig?.provider === "daily" && Boolean(callConfig.roomUrl);
  const connected = isDaily ? dailyReady : remoteReady;
  const isTranslator = user.role === "translator";

  function withTranslatorDesk(stage) {
    if (!isTranslator) return stage;
    return (
      <div className="flex min-h-screen flex-col bg-white lg:flex-row">
        <TranslatorCallDesk
          session={session}
          elapsed={elapsed}
          doctorName={doctorName}
          onDoctorName={setDoctorName}
          roomLabel={roomLabel}
          onRoomLabel={setRoomLabel}
          visitReason={visitReason}
          onVisitReason={setVisitReason}
          notes={notes}
          onNotes={setNotes}
          onSave={saveNotes}
          saved={notesSaved}
          saving={deskSaving}
          onHandoff={() => setTransferOpen(true)}
          handingOff={handingOff}
          error={deskError}
        />
        <div className="relative min-h-[50vh] min-w-0 w-full flex-1 overflow-hidden bg-black lg:h-auto lg:min-h-screen lg:w-1/2 lg:border-l lg:border-slate-200">
          {stage}
        </div>
      </div>
    );
  }

  function handleMute() {
    if (isDaily && dailyRef.current) {
      const next = !dailyMuted;
      dailyRef.current.setLocalAudio(!next);
      setDailyMuted(next);
      return;
    }
    toggleMute();
  }

  function handleCamera() {
    if (isDaily && dailyRef.current) {
      const next = !dailyCamOff;
      dailyRef.current.setLocalVideo(!next);
      setDailyCamOff(next);
      return;
    }
    toggleCamera();
  }

  const controls = (
    <CallControls
      phone
      muted={isDaily ? dailyMuted : muted}
      cameraOff={isDaily ? dailyCamOff : cameraOff}
      voiceOnly={voiceOnly}
      isDoctor={isClinic}
      canTransfer={isClinic}
      onMute={handleMute}
      onCamera={handleCamera}
      onEnd={() => finish(true)}
      onTransfer={() => setTransferOpen(true)}
      onToggleNotes={() => {
        setNotesOpen((v) => !v);
        setChatOpen(false);
      }}
      notesOpen={notesOpen}
      canTakeNotes={false}
      onChat={() => {
        setChatOpen((v) => {
          const next = !v;
          if (next) setUnreadCount(0);
          return next;
        });
        setNotesOpen(false);
      }}
      chatOpen={chatOpen}
      unreadCount={unreadCount}
      endLabel={watchOnly ? "Leave" : "End"}
      watchOnly={watchOnly}
    />
  );

  const sidePanel =
    chatOpen || notesOpen ? (
      <div className="absolute inset-x-0 bottom-0 z-30 p-4 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[360px] sm:p-5">
        <div className="flex h-full max-h-[70vh] flex-col sm:max-h-none">
          {chatOpen ? (
            <CallChat
              messages={messages}
              currentUserId={user.id}
              disabled={session.status !== "active"}
              readOnly={watchOnly}
              onSend={sendMessage}
            />
          ) : (
            <div className="flex min-h-[280px] flex-1 flex-col rounded-4xl border border-white/10 bg-[#12182b] p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                  <Icon name="notes" className="h-4 w-4 text-brand-300" />
                  Interpreter notes
                </p>
                <span className="text-xs text-slate-400">No patient identifiers</span>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={8}
                placeholder="Terminology, clarifications, follow-up needed…"
                className="mt-3 min-h-0 w-full flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-ink placeholder:text-slate-400 outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/20"
              />
              <div className="mt-3 flex items-center gap-3">
                <button onClick={saveNotes} className="btn bg-white px-5 text-ink hover:bg-white/90">
                  Save notes
                </button>
                {notesSaved ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-brand-300">
                    <Icon name="check" className="h-4 w-4" />
                    Saved
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    ) : null;

  const noticeBanner = callNotice ? (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-40 flex justify-center px-4">
      <p className="pointer-events-auto max-w-lg rounded-2xl bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-ink shadow">
        {callNotice}
      </p>
    </div>
  ) : null;

  if (voiceOnly) {
    return withTranslatorDesk(
      <div className={`voice-stage relative flex flex-col overflow-hidden text-white ${isTranslator ? "h-full min-h-[48vh]" : "min-h-screen"}`}>
        {noticeBanner}
        <header className="relative z-20 flex items-center justify-between px-5 pt-5 md:px-8">
          <BrandMark tone="dark" />
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
            </span>
            {watchOnly ? `Watching · ${elapsed}` : `Voice · ${elapsed}`}
          </span>
        </header>

        {guestRemotes.length && (isDaily ? dailyArmed || watchOnly : mediaStarted) ? (
          <div className="relative z-10 min-h-0 flex-1 px-3 pb-2 pt-3">
            <ZoomGallery
              tiles={[
                { remote: primaryRemote || { peerId: primaryPeerId, name: counterpart }, label: counterpart },
                ...guestRemotes.map((remote) => ({ remote })),
                ...(watchOnly ? [] : [{ self: true, label: "You", role: user.role }]),
              ]}
              localRef={localVideoRef}
            />
          </div>
        ) : (
        <VoiceCallStage
          counterpart={callTitle}
          peerRole={watchOnly ? "Watching privately" : peerRole}
          language={session.language?.name}
          elapsed={elapsed}
          connected={connected}
          mediaStarted={isDaily ? dailyArmed || watchOnly : mediaStarted}
          muted={isDaily ? dailyMuted : muted}
          mediaError={mediaError}
          watching={watchOnly}
          onUnlock={
            isDaily
              ? () => {
                  releaseCallMedia();
                  setDailyArmed(true);
                }
              : unlockMedia
          }
        >
          {isDaily && dailyArmed ? (
            <div className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0">
              <DailyRoom
                roomUrl={callConfig.roomUrl}
                token={callConfig.token}
                voiceOnly
                watchOnly={watchOnly}
                callRef={dailyRef}
                onJoined={() => setDailyReady(true)}
              />
            </div>
          ) : (
            <>
              {remotes.map((remote) => (
                <RemoteMedia
                  key={remote.peerId}
                  peerId={remote.peerId}
                  stream={remote.stream}
                  className="pointer-events-none absolute h-0 w-0 opacity-0"
                />
              ))}
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="pointer-events-none absolute h-0 w-0 opacity-0"
              />
            </>
          )}
        </VoiceCallStage>
        )}

        {mediaError && mediaStarted ? (
          <p className="relative z-20 mx-auto mb-3 max-w-lg rounded-2xl bg-rose-500/15 px-4 py-3 text-center text-sm text-rose-200">
            {mediaError}
          </p>
        ) : null}

        <div className="relative z-20 px-4 pb-8 pt-2">{controls}</div>
        {sidePanel}

        <TransferModal
          open={transferOpen}
          title={isTranslator ? "Hand off this call" : "Transfer this call"}
          language={session.language?.name}
          reason={reason}
          onReason={setReason}
          onSubmit={transfer}
          onCancel={() => setTransferOpen(false)}
        />

        <RatingModal
          open={rateOpen}
          onSkip={() => navigate(homeFor(user))}
          onSubmit={async ({ rating, comment }) => {
            await api.post(`/sessions/${id}/rating`, { rating, comment });
            navigate(homeFor(user));
          }}
        />
      </div>
    );
  }

  return withTranslatorDesk(
    <div className={`relative overflow-hidden bg-black text-white ${isTranslator ? "h-full min-h-[48vh]" : "min-h-screen"}`}>
      {noticeBanner}
      <div className="absolute inset-0">
        {isDaily ? (
          dailyArmed || watchOnly ? (
            <DailyRoom
              roomUrl={callConfig.roomUrl}
              token={callConfig.token}
              voiceOnly={false}
              watchOnly={watchOnly}
              callRef={dailyRef}
              onJoined={() => setDailyReady(true)}
            />
          ) : (
            <MediaUnlockCard
              onUnlock={() => {
                releaseCallMedia();
                setDailyArmed(true);
              }}
              error={mediaError}
            />
          )
        ) : (
          <>
            {guestRemotes.length ? (
              <div className="absolute inset-0">
                <ZoomGallery
                  tiles={[
                    {
                      remote: primaryRemote || { peerId: primaryPeerId, name: counterpart, stream: primaryRemote?.stream },
                      label: counterpart,
                    },
                    ...guestRemotes.map((remote) => ({ remote })),
                    ...(watchOnly ? [] : [{ self: true, label: "You", role: user.role }]),
                  ]}
                  localRef={localVideoRef}
                />
              </div>
            ) : (
              <>
                <RemoteMedia
                  peerId={primaryPeerId}
                  stream={primaryRemote?.stream}
                  onClick={() => unlockMedia()}
                  className="absolute inset-0 h-full w-full cursor-pointer object-cover"
                />
                {watchOnly ? null : (
                <div className="absolute bottom-28 right-4 z-20 h-28 w-40 overflow-hidden rounded-xl border border-white/20 bg-black shadow-lift sm:bottom-32 sm:h-32 sm:w-48">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full scale-x-[-1] object-cover"
                  />
                  <span className="absolute bottom-1 left-1.5 text-[10px] uppercase tracking-widest text-white/80">
                    You
                  </span>
                </div>
                )}
              </>
            )}
            {!watchOnly && !mediaStarted ? (
              <MediaUnlockCard onUnlock={unlockMedia} error={mediaError} />
            ) : !remoteReady ? (
              <button
                type="button"
                onClick={() => unlockMedia()}
                className="absolute inset-0 grid place-items-center bg-gradient-to-b from-ink/20 to-ink/70"
              >
                <p className="text-sm text-white/70">
                  Waiting for {callTitle || "the other person"}… tap here
                </p>
              </button>
            ) : null}
          </>
        )}
      </div>

      <header className="relative z-20 px-3 pt-3 md:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-full border border-white/10 bg-black/70 px-4 py-2.5 shadow-lg backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark tone="dark" />
            <span className="hidden h-6 w-px bg-white/15 sm:block" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {callTitle || "Connecting interpreter…"}
              </p>
              <p className="truncate text-[11px] text-white/50">
                {session.language?.name || "Consult"} · {session.department?.name} ·{" "}
                {session.organization?.name}
              </p>
            </div>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white ${watchOnly ? "bg-slate-600" : "bg-rose-500"}`}>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </span>
            {watchOnly ? `Watching ${elapsed}` : `Live ${elapsed}`}
          </span>
        </div>
      </header>

      {mediaError && mediaStarted ? (
        <p className="relative z-20 mx-5 mt-4 rounded-2xl bg-rose-500/20 px-4 py-3 text-sm text-rose-100">
          {mediaError}
        </p>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 to-transparent px-4 pb-8 pt-16">
        {controls}
      </div>
      {sidePanel}

      <TransferModal
        open={transferOpen}
        title={isTranslator ? "Hand off this call" : "Transfer this call"}
        language={session.language?.name}
        reason={reason}
        onReason={setReason}
        onSubmit={transfer}
        onCancel={() => setTransferOpen(false)}
      />

      <RatingModal
        open={rateOpen}
        onSkip={() => navigate(homeFor(user))}
        onSubmit={async ({ rating, comment }) => {
          await api.post(`/sessions/${id}/rating`, { rating, comment });
          navigate(homeFor(user));
        }}
      />
    </div>
  );
}
