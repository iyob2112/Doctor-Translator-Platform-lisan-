import { prisma } from "../config/db.js";
import { sessionInclude } from "../utils/tokens.js";
import { expireOpenRequests, findMatchingTranslators } from "./matching.service.js";
import { clinicLabel } from "../utils/sessionAccess.js";

const ROUTINE = { ttlMs: 60_000, maxAttempts: 3, offerMs: 20_000 };
const STAT = { ttlMs: 30_000, maxAttempts: 5, offerMs: 12_000 };

const pages = new Map();

export function pagingConfig(priority) {
  return priority === "stat" ? STAT : ROUTINE;
}

function notifyOne(io, userId, payload) {
  io.to(`user:${userId}`).emit("translator:request_new", payload);
}

export function clearTranslatorPage(requestId) {
  const page = pages.get(requestId);
  if (page?.timeout) clearTimeout(page.timeout);
  pages.delete(requestId);
}

export function offeredUserId(requestId) {
  return pages.get(requestId)?.offeredTo || null;
}

export function pageReason(requestId) {
  return pages.get(requestId)?.reason || null;
}

export function clearPagesForSession(io, sessionId, reason = "superseded") {
  for (const [id, page] of pages) {
    if (page.sessionId !== sessionId) continue;
    if (page.offeredTo) {
      io.to(`user:${page.offeredTo}`).emit("translator:request_cancelled", {
        session_id: sessionId,
        requestId: id,
        reason,
      });
    }
    clearTranslatorPage(id);
  }
}

async function isTranslatorAvailable(userId, languageId) {
  const profile = await prisma.translatorProfile.findFirst({
    where: {
      userId,
      isOnline: true,
      flagged: false,
      approvalStatus: "approved",
      user: { isActive: true, role: "translator" },
      languages: { some: { languageId } },
    },
    select: { userId: true },
  });
  return Boolean(profile);
}

export function emitUnmatched(io, session, language, extra = {}) {
  const payload = {
    session_id: session.id,
    language: language
      ? { id: language.id, code: language.code, name: language.name }
      : session.language,
    doctor_name: clinicLabel(session),
    department: session.department?.name,
    organization: session.organization?.name,
    organizationId: session.organizationId,
    priority: session.priority,
    attempts: session.pageAttempt,
    reason: session.unmatchedReason,
    ...extra,
  };
  io.to(`user:${session.doctorId}`).emit("session:unmatched", payload);
  if (session.organizationId) {
    io.to(`org:${session.organizationId}`).emit("session:unmatched", payload);
  }
  io.to("role:admin").emit("session:unmatched", payload);
}

export async function markUnmatched(io, sessionId, reason) {
  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: {
      unmatchedAt: new Date(),
      unmatchedReason: reason,
      unmatchedAckAt: null,
      unmatchedAckById: null,
      status: "pending",
    },
    include: sessionInclude(),
  });
  emitUnmatched(io, updated, updated.language, { reason });
  io.to(`user:${updated.doctorId}`).emit("translator:request_expired", {
    session_id: updated.id,
    unmatched: true,
    attempts: updated.pageAttempt,
    reason,
  });
  return updated;
}

function doctorOfferStatus(page, expiresAt, attempt, maxAttempts, name) {
  return {
    session_id: page.sessionId,
    requestId: page.requestId,
    attempt,
    maxAttempts,
    notified: 1,
    queueLength: page.queue.length,
    offeredIndex: page.index + 1,
    offeredName: name || null,
    sequential: page.queue.length >= 2,
    expiresAt,
    priority: page.priority,
  };
}

async function offerAtIndex(io, requestId) {
  const page = pages.get(requestId);
  if (!page) return;

  const request = await prisma.translatorRequest.findUnique({
    where: { id: requestId },
    include: {
      session: { include: sessionInclude() },
      language: true,
    },
  });
  if (!request || request.status !== "open") {
    clearTranslatorPage(requestId);
    return;
  }

  const session = request.session;
  if (!session || ["completed", "cancelled"].includes(session.status)) {
    clearTranslatorPage(requestId);
    return;
  }
  if (!page.transfer && session.translatorId) {
    clearTranslatorPage(requestId);
    return;
  }

  while (page.index < page.queue.length) {
    const userId = page.queue[page.index];
    if (page.declined?.has(userId)) {
      page.index += 1;
      continue;
    }
    const available = await isTranslatorAvailable(userId, request.languageId);
    if (available) break;
    page.index += 1;
  }

  if (page.index >= page.queue.length) {
    await finishRound(io, request);
    return;
  }

  const userId = page.queue[page.index];
  page.offeredTo = userId;
  const expiresAt = new Date(Date.now() + page.offerMs).toISOString();
  const offered = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true },
  });

  const payload = {
    requestId: request.id,
    session_id: session.id,
    language: {
      id: request.language.id,
      code: request.language.code,
      name: request.language.name,
    },
    doctor_name: clinicLabel(session),
    department: session.department?.name,
    organization: session.organization.name,
    call_mode: session.callMode,
    priority: session.priority,
    attempt: session.pageAttempt,
    maxAttempts: page.maxAttempts,
    expiresAt,
    sequential: page.queue.length >= 2,
    offeredIndex: page.index + 1,
    queueLength: page.queue.length,
    transfer: page.transfer || false,
    reason: page.reason || null,
  };

  if (page.transfer) {
    io.to(`user:${userId}`).emit("session:transfer_requested", payload);
  } else {
    notifyOne(io, userId, payload);
  }

  io.to(`user:${session.doctorId}`).emit("translator:request_retrying", {
    ...doctorOfferStatus(page, expiresAt, session.pageAttempt, page.maxAttempts, offered?.fullName),
    transfer: page.transfer || false,
  });

  if (page.timeout) clearTimeout(page.timeout);
  page.timeout = setTimeout(() => {
    handleOfferTimeout(io, requestId, userId).catch((err) => console.error("offer timeout error", err));
  }, page.offerMs);
}

async function finishRound(io, request) {
  const page = pages.get(request.id);
  clearTranslatorPage(request.id);

  if (request.status === "open") {
    await prisma.translatorRequest.updateMany({
      where: { id: request.id, status: "open" },
      data: { status: "expired" },
    });
  }

  const session = await prisma.session.findUnique({
    where: { id: request.sessionId },
    include: sessionInclude(),
  });
  if (!session) return;

  if (page?.transfer) {
    io.to(`user:${session.doctorId}`).emit("translator:request_expired", {
      session_id: session.id,
      unmatched: false,
      reason: "transfer_timeout",
    });
    return;
  }

  if (session.translatorId || ["completed", "cancelled", "active"].includes(session.status)) {
    return;
  }

  const cfg = pagingConfig(session.priority);
  if (session.pageAttempt < cfg.maxAttempts) {
    await startTranslatorPage(io, session.id, request.languageId, {
      excludeUserIds: [...(page?.declined || [])],
    });
    return;
  }

  await markUnmatched(io, session.id, "timeout");
}

async function handleOfferTimeout(io, requestId, expectedUserId) {
  const page = pages.get(requestId);
  if (!page || page.offeredTo !== expectedUserId) return;

  const request = await prisma.translatorRequest.findUnique({
    where: { id: requestId },
  });
  if (!request || request.status !== "open") {
    clearTranslatorPage(requestId);
    return;
  }

  io.to(`user:${expectedUserId}`).emit("translator:request_cancelled", {
    session_id: page.sessionId,
    requestId,
    reason: "expired",
  });

  page.index += 1;
  page.offeredTo = null;
  await offerAtIndex(io, requestId);
}

export async function declineTranslatorOffer(io, requestId, userId, sessionId) {
  let page = requestId ? pages.get(requestId) : null;
  let id = requestId;
  if (!page && sessionId) {
    for (const [rid, entry] of pages) {
      if (entry.sessionId === sessionId && entry.offeredTo === userId) {
        page = entry;
        id = rid;
        break;
      }
    }
  }

  io.to(`user:${userId}`).emit("translator:request_cancelled", {
    session_id: page?.sessionId || sessionId,
    requestId: id,
    reason: "declined",
  });
  if (!page || page.offeredTo !== userId) return;

  if (page.timeout) clearTimeout(page.timeout);
  page.declined = page.declined || new Set();
  page.declined.add(userId);
  page.index += 1;
  page.offeredTo = null;
  await offerAtIndex(io, id);
}

export async function registerDirectOffer(io, { request, session, userId, reason }) {
  const cfg = pagingConfig(session.priority);
  pages.set(request.id, {
    requestId: request.id,
    sessionId: session.id,
    languageId: request.languageId,
    queue: [userId],
    index: 0,
    offeredTo: null,
    timeout: null,
    offerMs: cfg.ttlMs,
    maxAttempts: 1,
    priority: session.priority,
    transfer: true,
    reason: reason || null,
    declined: new Set(),
  });
  await offerAtIndex(io, request.id);
}

export async function startTranslatorPage(io, sessionId, languageId, options = {}) {
  const { excludeUserIds = [], transfer = false, reason = null } = options;
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: sessionInclude(),
  });
  if (!session) return { session: null, notified: 0, request: null };
  if (["completed", "cancelled"].includes(session.status)) {
    return { session, notified: 0, request: null };
  }
  if (!transfer && session.status === "active" && session.translatorId) {
    return { session, notified: 0, request: null };
  }

  const language =
    session.language?.id === languageId
      ? session.language
      : await prisma.language.findUnique({ where: { id: languageId } });
  if (!language) {
    return { session, notified: 0, request: null, error: "Language not found" };
  }

  clearPagesForSession(io, session.id);
  await expireOpenRequests(session.id);

  const attempt = transfer ? session.pageAttempt : session.pageAttempt + 1;
  const cfg = pagingConfig(session.priority);
  const translators = await findMatchingTranslators(languageId, excludeUserIds);

  if (!transfer) {
    await prisma.session.update({
      where: { id: session.id },
      data: {
        languageId,
        status: "pending",
        pageAttempt: attempt,
        unmatchedAt: null,
        unmatchedReason: null,
      },
    });
  }

  if (!translators.length) {
    if (transfer) {
      return { session, notified: 0, request: null, unmatched: true };
    }
    const unmatchedReason = excludeUserIds.length ? "declined" : "no_online";
    const unmatched = await markUnmatched(io, session.id, unmatchedReason);
    return { session: unmatched, notified: 0, request: null, unmatched: true };
  }

  const request = await prisma.translatorRequest.create({
    data: {
      sessionId: session.id,
      languageId,
      status: "open",
    },
  });

  const queue = translators.map((profile) => profile.user.id);
  const sequential = queue.length >= 2;
  const offerMs = sequential ? cfg.offerMs : cfg.ttlMs;

  pages.set(request.id, {
    requestId: request.id,
    sessionId: session.id,
    languageId,
    queue,
    index: 0,
    offeredTo: null,
    timeout: null,
    offerMs,
    maxAttempts: cfg.maxAttempts,
    priority: session.priority,
    transfer,
    reason,
    declined: new Set(excludeUserIds),
  });

  await offerAtIndex(io, request.id);

  const fresh = await prisma.session.findUnique({
    where: { id: session.id },
    include: sessionInclude(),
  });
  const page = pages.get(request.id);
  return {
    session: fresh,
    request,
    notified: 1,
    queueLength: queue.length,
    offeredIndex: (page?.index || 0) + 1,
    sequential,
    expiresAt: new Date(Date.now() + offerMs).toISOString(),
    attempt,
    maxAttempts: cfg.maxAttempts,
  };
}
