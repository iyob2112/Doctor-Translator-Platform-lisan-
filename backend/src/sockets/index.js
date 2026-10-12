import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../config/db.js";
import { sessionInclude } from "../utils/tokens.js";
import { findMatchingTranslators } from "../services/matching.service.js";
import { canJoinLiveSession, isHiddenWatcher } from "../utils/sessionAccess.js";
import { can } from "../utils/permissions.js";
import {
  declineTranslatorOffer,
  clearTranslatorPage,
  offeredUserId,
  pageReason,
} from "../services/paging.service.js";

const pendingOffline = new Map();
const liveBySession = new Map();

function publicPeer(user) {
  return { id: user.id, fullName: user.fullName, role: user.role };
}

function hiddenPeer(user) {
  return { id: user.id, hidden: true };
}

function addLive(sessionId, user, socketId) {
  if (!liveBySession.has(sessionId)) liveBySession.set(sessionId, new Map());
  const room = liveBySession.get(sessionId);
  const hidden = isHiddenWatcher(user);
  const existing = room.get(user.id) || {
    ...(hidden ? hiddenPeer(user) : publicPeer(user)),
    hidden,
    sockets: new Set(),
  };
  existing.fullName = hidden ? "" : user.fullName;
  existing.role = hidden ? "" : user.role;
  existing.hidden = hidden;
  existing.sockets.add(socketId);
  room.set(user.id, existing);
}

function removeLive(sessionId, userId, socketId) {
  const room = liveBySession.get(sessionId);
  if (!room) return false;
  const existing = room.get(userId);
  if (!existing) return false;
  existing.sockets.delete(socketId);
  if (existing.sockets.size) return false;
  room.delete(userId);
  if (!room.size) liveBySession.delete(sessionId);
  return true;
}

function peersOf(sessionId, exceptId) {
  const room = liveBySession.get(sessionId);
  if (!room) return [];
  return [...room.values()]
    .filter((peer) => peer.id !== exceptId)
    .map((peer) => (peer.hidden ? hiddenPeer(peer) : publicPeer(peer)));
}

function visiblePeersOf(sessionId, exceptId) {
  const room = liveBySession.get(sessionId);
  if (!room) return [];
  return [...room.values()]
    .filter((peer) => peer.id !== exceptId && !peer.hidden)
    .map((peer) => publicPeer(peer));
}

function payloadOf(data) {
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

function asId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function setTranslatorPresence(io, userId, { isOnline, wantsOnline }) {
  await prisma.translatorProfile.updateMany({
    where: { userId },
    data: {
      isOnline,
      ...(wantsOnline !== undefined ? { wantsOnline } : {}),
      lastSeenAt: new Date(),
    },
  });
  io.emit("translator:availability_changed", {
    translatorId: userId,
    is_online: isOnline,
  });
}

async function restoreTranslatorPresence(io, user) {
  if (user.role !== "translator") return;
  const profile = await prisma.translatorProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile || profile.approvalStatus !== "approved" || profile.flagged) {
    io.to(`user:${user.id}`).emit("translator:availability_changed", {
      translatorId: user.id,
      is_online: false,
    });
    return;
  }
  if (!profile.wantsOnline) {
    io.to(`user:${user.id}`).emit("translator:availability_changed", {
      translatorId: user.id,
      is_online: false,
    });
    return;
  }
  await setTranslatorPresence(io, user.id, { isOnline: true });
}

function safeOn(socket, event, handler) {
  socket.on(event, async (data, ack) => {
    try {
      await handler(payloadOf(data), ack);
    } catch (err) {
      console.error(`socket ${event}`, err);
    }
  });
}

function notifyPeerLeft(io, sessionId, userId, session, extra = {}) {
  const payload = { session_id: sessionId, user_id: userId, hidden: Boolean(extra.hidden) };
  io.to(`session:${sessionId}`).emit("session:peer_left", payload);
  const room = liveBySession.get(sessionId);
  if (room) {
    for (const peer of room.values()) {
      if (peer.id !== userId) io.to(`user:${peer.id}`).emit("session:peer_left", payload);
    }
  }
  if (session?.doctorId) io.to(`user:${session.doctorId}`).emit("session:peer_left", payload);
  if (session?.translatorId) io.to(`user:${session.translatorId}`).emit("session:peer_left", payload);
}

async function kickLiveUser(io, sessionId, userId) {
  if (!sessionId || !userId) return;
  const room = liveBySession.get(sessionId);
  if (room) {
    room.delete(userId);
    if (!room.size) liveBySession.delete(sessionId);
  }
  try {
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    for (const sock of sockets) {
      sock.leave(`session:${sessionId}`);
      sock.data.liveSessions?.delete(sessionId);
    }
  } catch {
    /* room may already be empty */
  }
}

export function attachSockets(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Unauthorized"));
      const payload = jwt.verify(token, env.jwtAccessSecret);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          role: true,
          email: true,
          fullName: true,
          organizationId: true,
          isActive: true,
          permissions: true,
        },
      });
      if (!user || !user.isActive) return next(new Error("Unauthorized"));
      socket.user = {
        id: user.id,
        role: user.role,
        email: user.email,
        fullName: user.fullName,
        organizationId: user.organizationId,
        permissions: user.permissions || [],
      };
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", async (socket) => {
    socket.join(`user:${socket.user.id}`);
    if (can(socket.user, "sessions.view") && (socket.user.role === "admin" || socket.user.role === "subadmin")) {
      socket.join("role:admin");
    }
    if (socket.user.organizationId) socket.join(`org:${socket.user.organizationId}`);
    const queuedOffline = pendingOffline.get(socket.user.id);
    if (queuedOffline) {
      clearTimeout(queuedOffline);
      pendingOffline.delete(socket.user.id);
    }
    restoreTranslatorPresence(io, socket.user).catch((err) => {
      console.error("restore translator presence", err);
    });

    safeOn(socket, "translator:availability_changed", async ({ is_online }) => {
      if (socket.user.role !== "translator" || typeof is_online !== "boolean") return;
      const profile = await prisma.translatorProfile.findUnique({
        where: { userId: socket.user.id },
      });
      if (!profile || profile.approvalStatus !== "approved" || profile.flagged) return;
      await setTranslatorPresence(io, socket.user.id, {
        isOnline: is_online,
        wantsOnline: is_online,
      });
    });

    safeOn(socket, "translator:request_accepted", async ({ session_id, requestId }) => {
      if (socket.user.role !== "translator") return;
      await acceptRequest(io, socket, session_id, requestId, false);
    });

    safeOn(socket, "translator:request_declined", async ({ session_id, requestId }) => {
      if (socket.user.role !== "translator") return;
      await declineTranslatorOffer(io, asId(requestId), socket.user.id, asId(session_id));
    });

    socket.data.liveSessions = socket.data.liveSessions || new Set();

    safeOn(socket, "session:join", async ({ session_id }) => {
      const sessionId = asId(session_id);
      if (!sessionId) return;
      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!session || !canJoinLiveSession(session, socket.user)) return;
      const already = socket.data.liveSessions.has(sessionId);
      const hidden = isHiddenWatcher(socket.user);
      socket.join(`session:${sessionId}`);
      socket.data.liveSessions.add(sessionId);
      addLive(sessionId, socket.user, socket.id);
      socket.emit("session:peers", {
        session_id: sessionId,
        watchOnly: hidden,
        peers: hidden
          ? visiblePeersOf(sessionId, socket.user.id)
          : peersOf(sessionId, socket.user.id),
      });
      if (!already) {
        if (hidden) {
          for (const peer of visiblePeersOf(sessionId, socket.user.id)) {
            io.to(`user:${peer.id}`).emit("session:peer_joined", {
              session_id: sessionId,
              peer: hiddenPeer(socket.user),
            });
          }
        } else {
          socket.to(`session:${sessionId}`).emit("session:peer_joined", {
            session_id: sessionId,
            peer: publicPeer(socket.user),
          });
        }
      }
    });

    safeOn(socket, "session:leave", async ({ session_id }) => {
      const sessionId = asId(session_id);
      if (!sessionId) return;
      const hidden = isHiddenWatcher(socket.user);
      socket.leave(`session:${sessionId}`);
      socket.data.liveSessions.delete(sessionId);
      const left = removeLive(sessionId, socket.user.id, socket.id);
      if (!left) return;
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        select: { doctorId: true, translatorId: true },
      });
      notifyPeerLeft(io, sessionId, socket.user.id, session, { hidden });
    });

    safeOn(socket, "call:message", async ({ session_id, body }) => {
      try {
        const sessionId = asId(session_id);
        const text = String(body || "").trim();
        if (!sessionId || !text || text.length > 2000) return;
        const session = await prisma.session.findUnique({ where: { id: sessionId } });
        if (!session || session.status !== "active") return;
        if (!canJoinLiveSession(session, socket.user)) return;
        if (isHiddenWatcher(socket.user)) return;

        const message = await prisma.sessionMessage.create({
          data: {
            sessionId: session.id,
            senderId: socket.user.id,
            body: text,
          },
          include: { sender: { select: { id: true, fullName: true, role: true } } },
        });
        const payload = {
          id: message.id,
          sessionId: message.sessionId,
          senderId: message.senderId,
          body: message.body,
          createdAt: message.createdAt,
          sender: message.sender,
        };
        io.to(`session:${session.id}`).emit("call:message", payload);
        io.to(`user:${session.doctorId}`).emit("call:message", payload);
        if (session.translatorId) {
          io.to(`user:${session.translatorId}`).emit("call:message", payload);
        }
      } catch {
        socket.emit("call:message_error", { error: "Could not send message" });
      }
    });

    safeOn(socket, "call:signal", async ({ session_id, payload, to }) => {
      const sessionId = asId(session_id);
      if (!sessionId || !payload) return;
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        select: { doctorId: true, translatorId: true, organizationId: true, status: true },
      });
      if (!session || !canJoinLiveSession(session, socket.user)) return;
      const target = to || payload.to;
      const packet = {
        session_id: sessionId,
        from: socket.user.id,
        payload,
      };
      if (target && target !== socket.user.id) {
        io.to(`user:${target}`).emit("call:signal", packet);
        return;
      }
      const peerId =
        socket.user.id === session.doctorId
          ? session.translatorId
          : socket.user.id === session.translatorId
            ? session.doctorId
            : null;
      if (peerId) io.to(`user:${peerId}`).emit("call:signal", packet);
    });

    socket.on("disconnect", () => {
      const sessionIds = [...(socket.data.liveSessions || [])];
      socket.data.liveSessions = new Set();
      (async () => {
        try {
          for (const sessionId of sessionIds) {
            if (!removeLive(sessionId, socket.user.id, socket.id)) continue;
            const session = await prisma.session.findUnique({
              where: { id: sessionId },
              select: { doctorId: true, translatorId: true },
            });
            notifyPeerLeft(io, sessionId, socket.user.id, session, {
              hidden: isHiddenWatcher(socket.user),
            });
          }
        } catch (err) {
          console.error("socket disconnect cleanup", err);
        }
      })();
      if (socket.user.role !== "translator") return;
      const existing = pendingOffline.get(socket.user.id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(async () => {
        pendingOffline.delete(socket.user.id);
        try {
          const remaining = await io.in(`user:${socket.user.id}`).fetchSockets();
          if (remaining.length) return;
          await setTranslatorPresence(io, socket.user.id, { isOnline: false });
        } catch (err) {
          console.error("translator offline timer", err);
        }
      }, 15000);
      pendingOffline.set(socket.user.id, timer);
    });
  });
}

async function acceptRequest(io, socket, sessionIdRaw, requestIdRaw, isTransferHint) {
  const sessionId = asId(sessionIdRaw);
  const requestId = asId(requestIdRaw);
  if (!sessionId) return;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: sessionInclude(),
  });
  if (!session) return;

  const open = await prisma.translatorRequest.findMany({
    where: requestId ? { id: requestId, status: "open" } : { sessionId, status: "open" },
  });
  const request = open.find((row) => offeredUserId(row.id) === socket.user.id) || null;
  if (!request) {
    socket.emit("translator:request_cancelled", {
      session_id: sessionId,
      requestId,
      reason: "already_taken",
    });
    return;
  }

  const profile = await prisma.translatorProfile.findUnique({
    where: { userId: socket.user.id },
    include: { languages: true, user: { select: { fullName: true, id: true } } },
  });
  if (!profile) return;
  if (profile.approvalStatus !== "approved") return;
  const speaks = profile.languages.some((l) => l.languageId === request.languageId);
  if (!speaks) return;

  const currentOffer = offeredUserId(request.id);
  if (currentOffer !== socket.user.id) {
    socket.emit("translator:request_cancelled", {
      session_id: sessionId,
      requestId: request.id,
      reason: "already_taken",
    });
    return;
  }

  const previousTranslatorId = session.translatorId;
  const transferring = Boolean(previousTranslatorId && previousTranslatorId !== socket.user.id);

  const claimed = await prisma.translatorRequest.updateMany({
    where: { id: request.id, status: "open" },
    data: {
      status: "accepted",
      acceptedBy: socket.user.id,
      acceptedAt: new Date(),
    },
  });
  if (claimed.count === 0) {
    socket.emit("translator:request_cancelled", {
      session_id: sessionId,
      requestId: request.id,
      reason: "already_taken",
    });
    return;
  }

  clearTranslatorPage(request.id);

  await prisma.session.update({
    where: { id: session.id },
    data: {
      translatorId: socket.user.id,
      status: "active",
      startedAt: session.startedAt || new Date(),
    },
  });

  if (transferring) {
    await prisma.sessionTransfer.create({
      data: {
        sessionId: session.id,
        fromTranslatorId: previousTranslatorId,
        toTranslatorId: socket.user.id,
        reason:
          pageReason(request.id) ||
          session.handoffReason ||
          (isTransferHint ? "transfer" : "accepted transfer"),
      },
    });
  }

  const others = await findMatchingTranslators(request.languageId);
  for (const other of others) {
    if (other.user.id === socket.user.id) continue;
    io.to(`user:${other.user.id}`).emit("translator:request_cancelled", {
      session_id: session.id,
      requestId: request.id,
      reason: "accepted",
    });
  }

  if (transferring && previousTranslatorId) {
    io.to(`user:${previousTranslatorId}`).emit("session:transferred_away", {
      session_id: session.id,
      to_translator: { id: socket.user.id, name: profile.user.fullName },
    });
    io.to(`session:${session.id}`).emit("call:signal", {
      session_id: session.id,
      from: previousTranslatorId,
      payload: { type: "bye" },
    });
    await kickLiveUser(io, session.id, previousTranslatorId);
    notifyPeerLeft(io, session.id, previousTranslatorId, {
      doctorId: session.doctorId,
      translatorId: socket.user.id,
    });
  }

  io.to(`user:${session.doctorId}`).emit("session:translator_joined", {
    session_id: session.id,
    translator_id: socket.user.id,
    previous_translator_id: transferring ? previousTranslatorId : null,
    name: profile.user.fullName,
    transfer: transferring,
  });

  io.to(`user:${socket.user.id}`).emit("session:join_ready", {
    session_id: session.id,
  });
}
