import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { getAccessToken, refreshAccessToken } from "../api/client.js";
import { SOCKET_URL } from "../api/config.js";

const EVENTS = [
  "translator:request_new",
  "translator:request_cancelled",
  "translator:request_expired",
  "translator:availability_changed",
  "translator:request_retrying",
  "session:unmatched",
  "session:translator_joined",
  "session:transfer_requested",
  "session:transfer_pending",
  "session:transferred_away",
  "session:join_ready",
  "session:ended",
  "session:peers",
  "session:peer_joined",
  "session:peer_left",
  "call:signal",
  "call:message",
];

let sharedSocket = null;
let sharedToken = null;
const handlerSets = new Set();
const recentSignals = [];

function fanout(event, payload) {
  if (event === "call:signal") {
    recentSignals.push({ payload, at: Date.now() });
    while (recentSignals.length > 80) recentSignals.shift();
  }
  handlerSets.forEach((ref) => {
    try {
      ref.current[event]?.(payload);
    } catch {
      /* ignore */
    }
  });
}

function replaySignals(ref) {
  const cutoff = Date.now() - 30000;
  recentSignals
    .filter((item) => item.at >= cutoff)
    .forEach((item) => {
      try {
        ref.current["call:signal"]?.(item.payload);
      } catch {
        /* ignore */
      }
    });
}

function ensureSocket(token) {
  if (!token) return null;
  if (sharedSocket) {
    sharedToken = token;
    return sharedSocket;
  }
  sharedToken = token;
  sharedSocket = io(SOCKET_URL, {
    auth: (cb) => cb({ token: getAccessToken() }),
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 300,
  });
  sharedSocket.on("connect_error", async (err) => {
    if (!String(err?.message || "").includes("Unauthorized")) return;
    try {
      await refreshAccessToken();
      sharedToken = getAccessToken();
    } catch {
      /* API interceptor / auth context handles logout */
    }
  });
  EVENTS.forEach((event) => {
    sharedSocket.on(event, (payload) => fanout(event, payload));
  });
  return sharedSocket;
}

export function disconnectSocket() {
  if (!sharedSocket) return;
  sharedSocket.removeAllListeners();
  sharedSocket.disconnect();
  sharedSocket = null;
  sharedToken = null;
  handlerSets.clear();
  recentSignals.length = 0;
}

export function useSocket(handlers = {}, enabled = true) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const socketRef = useRef(sharedSocket);

  useEffect(() => {
    if (!enabled) return undefined;
    const token = getAccessToken();
    if (!token) return undefined;
    handlerSets.add(handlersRef);
    socketRef.current = ensureSocket(token);
    replaySignals(handlersRef);
    return () => {
      handlerSets.delete(handlersRef);
    };
  }, [enabled]);

  if (sharedSocket) socketRef.current = sharedSocket;
  return socketRef;
}
