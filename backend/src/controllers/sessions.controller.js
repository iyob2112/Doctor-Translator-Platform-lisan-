import { prisma } from "../config/db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { sessionInclude } from "../utils/tokens.js";
import { startTranslatorPage, registerDirectOffer, clearPagesForSession } from "../services/paging.service.js";
import { expireOpenRequests } from "../services/matching.service.js";
import { issueCallToken } from "../services/call-token.service.js";
import { canJoinLiveSession, canViewSession, isHiddenWatcher } from "../utils/sessionAccess.js";
import { can, isPlatformStaff } from "../utils/permissions.js";
import { assertHospitalCanStartConsult } from "../services/access.service.js";
import { debitMinutes, remainingMinutes } from "../services/minutes.service.js";
import { getActiveSubscription } from "../services/subscriptions.service.js";
import { usageMinutesFromSession } from "../utils/billing.js";
import { recordSessionUsage } from "../services/invoices.service.js";

export const createSession = asyncHandler(async (req, res) => {
  const { callMode, deviceUsed, fingerprint } = req.body || {};
  const clinic = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!clinic.organizationId) {
    return res.status(400).json({ error: "Hospital account must belong to a hospital" });
  }
  const access = await assertHospitalCanStartConsult({
    organizationId: clinic.organizationId,
    fingerprint: fingerprint || req.headers["x-device-fingerprint"],
    userAgent: req.headers["user-agent"],
  });

  const session = await prisma.session.create({
    data: {
      doctorId: clinic.id,
      organizationId: clinic.organizationId,
      callMode: callMode === "voice" ? "voice" : "video",
      deviceUsed: deviceUsed || req.headers["user-agent"] || "web",
      billingMode: access.via || null,
      status: "pending",
    },
    include: sessionInclude(),
  });

  res.status(201).json({ session });
});

export const requestTranslator = asyncHandler(async (req, res) => {
  const { language_id, languageId, priority, department_id, departmentId } = req.body || {};
  const langId = language_id || languageId;
  if (!langId) return res.status(400).json({ error: "language_id is required" });

  const session = await prisma.session.findUnique({
    where: { id: req.params.id },
    include: sessionInclude(),
  });
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.doctorId !== req.user.id) {
    return res.status(403).json({ error: "Only this hospital desk can request a translator" });
  }
  if (["completed", "cancelled"].includes(session.status)) {
    return res.status(400).json({ error: "Session is already closed" });
  }
  if (session.status === "active" && session.translatorId) {
    return res.status(400).json({ error: "A translator is already on this session" });
  }

  const language = await prisma.language.findUnique({ where: { id: langId } });
  if (!language) return res.status(404).json({ error: "Language not found" });

  const clinic = await prisma.user.findUnique({ where: { id: req.user.id } });
  const deptId = departmentId || department_id || session.departmentId;
  if (!deptId) {
    return res.status(400).json({ error: "Choose a unit before requesting an interpreter" });
  }
  const dept = await prisma.department.findUnique({ where: { id: deptId } });
  if (!dept || dept.organizationId !== clinic.organizationId) {
    return res.status(400).json({ error: "Unit does not belong to your hospital" });
  }
  await assertHospitalCanStartConsult({
    organizationId: clinic.organizationId,
    fingerprint: req.body?.fingerprint || req.headers["x-device-fingerprint"],
    userAgent: req.headers["user-agent"],
  });

  const nextPriority = priority === "stat" ? "stat" : "routine";
  await prisma.session.update({
    where: { id: session.id },
    data: {
      languageId: langId,
      departmentId: deptId,
      priority: nextPriority,
      pageAttempt: 0,
      unmatchedAt: null,
      unmatchedReason: null,
      unmatchedAckAt: null,
      unmatchedAckById: null,
    },
  });

  const io = req.app.get("io");
  const result = await startTranslatorPage(io, session.id, langId);
  if (result.unmatched && result.notified === 0) {
    return res.status(404).json({
      error:
        nextPriority === "stat"
          ? "No online interpreters. Hospital and platform admins were alerted."
          : "No online translators available for this language. Hospital and platform admins were alerted.",
      session: result.session,
      unmatched: true,
    });
  }

  res.json({
    session: result.session,
    request: result.request,
    notified: result.notified,
    queueLength: result.queueLength,
    offeredIndex: result.offeredIndex,
    sequential: result.sequential,
    attempt: result.attempt,
    maxAttempts: result.maxAttempts,
    expiresAt: result.expiresAt,
    priority: nextPriority,
  });
});

export const transferSession = asyncHandler(async (req, res) => {
  const { to_translator_id, reason } = req.body || {};
  const session = await prisma.session.findUnique({
    where: { id: req.params.id },
    include: sessionInclude(),
  });
  if (!session) return res.status(404).json({ error: "Session not found" });
  const isClinicDesk = session.doctorId === req.user.id;
  const isAssignedTranslator =
    req.user.role === "translator" && session.translatorId === req.user.id;
  if (!isClinicDesk && !isAssignedTranslator) {
    return res.status(403).json({ error: "Only this hospital desk or the assigned interpreter can transfer" });
  }
  if (session.status !== "active" || !session.translatorId || !session.languageId) {
    return res.status(400).json({ error: "No active translator to transfer from" });
  }

  const io = req.app.get("io");
  const previousTranslatorId = session.translatorId;
  const handoffReason = String(reason || "").trim() || null;
  await prisma.session.update({
    where: { id: session.id },
    data: { handoffReason },
  });

  if (to_translator_id) {
    const target = await prisma.user.findUnique({
      where: { id: to_translator_id },
      include: { translatorProfile: true },
    });
    if (
      !target ||
      target.role !== "translator" ||
      !target.translatorProfile?.isOnline ||
      target.translatorProfile.approvalStatus !== "approved" ||
      target.translatorProfile.flagged
    ) {
      return res.status(400).json({ error: "Target translator is not available" });
    }
    const speaks = await prisma.translatorLanguage.findFirst({
      where: {
        translatorId: target.translatorProfile.id,
        languageId: session.languageId,
      },
      select: { id: true },
    });
    if (!speaks) {
      return res.status(400).json({ error: "Target translator does not speak this language" });
    }
    clearPagesForSession(io, session.id);
    await expireOpenRequests(session.id);
    const request = await prisma.translatorRequest.create({
      data: {
        sessionId: session.id,
        languageId: session.languageId,
        status: "open",
      },
    });
    await registerDirectOffer(io, {
      request,
      session,
      userId: to_translator_id,
      reason: reason || null,
    });
    io.to(`session:${session.id}`).emit("session:transfer_pending", {
      session_id: session.id,
      reason: reason || null,
    });
    return res.json({ ok: true, requestId: request.id, fromTranslatorId: previousTranslatorId });
  }

  const result = await startTranslatorPage(io, session.id, session.languageId, {
    excludeUserIds: [previousTranslatorId],
    transfer: true,
    reason: reason || null,
  });
  if (!result.request) {
    return res.status(404).json({ error: "No other online translators for this language" });
  }

  io.to(`session:${session.id}`).emit("session:transfer_pending", {
    session_id: session.id,
    reason: reason || null,
  });

  res.json({
    ok: true,
    requestId: result.request.id,
    fromTranslatorId: previousTranslatorId,
    sequential: result.sequential,
    queueLength: result.queueLength,
  });
});

export const addNotes = asyncHandler(async (req, res) => {
  const { notes, attendingName, roomLabel, visitReason } = req.body || {};
  const session = await prisma.session.findUnique({ where: { id: req.params.id } });
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.translatorId !== req.user.id) {
    return res.status(403).json({ error: "Only the assigned translator can add notes" });
  }
  const data = {};
  if (notes !== undefined) data.interpreterNotes = notes || "";
  if (attendingName !== undefined) {
    data.attendingName = String(attendingName || "").trim().slice(0, 80) || null;
  }
  if (roomLabel !== undefined) {
    data.roomLabel = String(roomLabel || "").trim().slice(0, 80) || null;
  }
  if (visitReason !== undefined) {
    data.visitReason = String(visitReason || "").trim().slice(0, 160) || null;
  }
  const updated = await prisma.session.update({
    where: { id: session.id },
    data,
    include: sessionInclude(),
  });
  res.json({ session: updated });
});

export const rateSession = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body || {};
  const value = Number(rating);
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    return res.status(400).json({ error: "rating must be an integer 1–5" });
  }
  const session = await prisma.session.findUnique({ where: { id: req.params.id } });
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.doctorId !== req.user.id) {
    return res.status(403).json({ error: "Only this hospital desk can rate" });
  }
  const updated = await prisma.session.update({
    where: { id: session.id },
    data: {
      providerRating: value,
      providerRatingComment: comment || null,
    },
    include: sessionInclude(),
  });

  if (session.translatorId && value <= 2) {
    const badCount = await prisma.session.count({
      where: {
        translatorId: session.translatorId,
        providerRating: { lte: 2 },
      },
    });
    if (badCount >= 3) {
      await prisma.translatorProfile.updateMany({
        where: { userId: session.translatorId },
        data: {
          flagged: true,
          flaggedAt: new Date(),
          flaggedReason: `${badCount} session ratings of 2 or below`,
          isOnline: false,
          wantsOnline: false,
        },
      });
      const io = req.app.get("io");
      if (io) {
        io.emit("translator:availability_changed", {
          translatorId: session.translatorId,
          is_online: false,
        });
      }
    }
  }

  res.json({ session: updated });
});

export const endSession = asyncHandler(async (req, res) => {
  const session = await prisma.session.findUnique({ where: { id: req.params.id } });
  if (!session) return res.status(404).json({ error: "Session not found" });
  const canEnd =
    [session.doctorId, session.translatorId].includes(req.user.id) ||
    can(req.user, "sessions.view") ||
    (req.user.role === "hospital_admin" && req.user.organizationId === session.organizationId);
  if (!canEnd) {
    return res.status(403).json({ error: "Not allowed to end this session" });
  }
  if (["completed", "cancelled"].includes(session.status)) {
    const existing = await prisma.session.findUnique({
      where: { id: session.id },
      include: sessionInclude(),
    });
    return res.json({ session: existing });
  }

  const endedAt = new Date();
  const startedAt = session.startedAt || session.createdAt;
  const durationSeconds = Math.max(0, Math.round((endedAt - startedAt) / 1000));

  await expireOpenRequests(session.id);
  const updated = await prisma.session.update({
    where: { id: session.id },
    data: {
      status: session.translatorId ? "completed" : "cancelled",
      endedAt,
      durationSeconds,
    },
    include: sessionInclude(),
  });

  const io = req.app.get("io");
  io.to(`session:${session.id}`).emit("session:ended", { session_id: session.id });
  io.to(`user:${session.doctorId}`).emit("session:ended", { session_id: session.id });
  if (session.translatorId) {
    io.to(`user:${session.translatorId}`).emit("session:ended", { session_id: session.id });
  }

  if (updated.status === "completed" && updated.translatorId) {
    const mode = updated.billingMode;
    if (mode === "ondemand") {
      try {
        await recordSessionUsage({
          organizationId: updated.organizationId,
          sessionId: updated.id,
          durationSeconds,
        });
      } catch (err) {
        console.error("Failed to record on-demand usage for session", updated.id, err);
      }
    } else if (mode === "minutes") {
      const available = await remainingMinutes(updated.organizationId);
      const used = Math.min(usageMinutesFromSession(durationSeconds), available);
      if (used > 0) {
        await debitMinutes({
          organizationId: updated.organizationId,
          minutes: used,
          sessionId: updated.id,
          note: "Live interpretation session",
        });
      }
    } else if (mode !== "subscription") {
      const activeSub = await getActiveSubscription(updated.organizationId);
      if (!activeSub) {
        const available = await remainingMinutes(updated.organizationId);
        if (available > 0) {
          const used = Math.min(usageMinutesFromSession(durationSeconds), available);
          if (used > 0) {
            await debitMinutes({
              organizationId: updated.organizationId,
              minutes: used,
              sessionId: updated.id,
              note: "Live interpretation session",
            });
          }
        } else {
          try {
            await recordSessionUsage({
              organizationId: updated.organizationId,
              sessionId: updated.id,
              durationSeconds,
            });
          } catch (err) {
            console.error("Failed to record on-demand usage for session", updated.id, err);
          }
        }
      }
    }
  }

  res.json({ session: updated });
});

export const getSession = asyncHandler(async (req, res) => {
  const session = await prisma.session.findUnique({
    where: { id: req.params.id },
    include: sessionInclude(),
  });
  if (!session) return res.status(404).json({ error: "Session not found" });

  if (!canViewSession(session, req.user)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  res.json({ session });
});

export const listSessions = asyncHandler(async (req, res) => {
  const {
    doctor_id,
    translator_id,
    organization_id,
    department_id,
    language_id,
    date_from,
    date_to,
    status,
  } = req.query;

  const STATUSES = ["pending", "active", "completed", "cancelled"];
  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  const parseDay = (value, label) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      const err = new Error(`${label} is not a valid date`);
      err.status = 400;
      throw err;
    }
    return parsed;
  };

  const where = {};
  if (req.user.role === "doctor") where.doctorId = req.user.id;
  else if (req.user.role === "translator") {
    where.OR = [
      { translatorId: req.user.id },
      { transfers: { some: { fromTranslatorId: req.user.id } } },
      { transfers: { some: { toTranslatorId: req.user.id } } },
    ];
  } else if (req.user.role === "hospital_admin") {
    where.organizationId = req.user.organizationId;
    if (doctor_id) where.doctorId = doctor_id;
    if (department_id) where.departmentId = department_id;
  } else if (isPlatformStaff(req.user)) {
    if (!can(req.user, "sessions.view")) {
      return res.status(403).json({ error: "You do not have permission to view sessions" });
    }
    if (doctor_id) where.doctorId = doctor_id;
    if (translator_id) where.translatorId = translator_id;
    if (organization_id) where.organizationId = organization_id;
    if (department_id) where.departmentId = department_id;
  } else {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (language_id) where.languageId = language_id;
  if (status) where.status = status;
  if (date_from || date_to) {
    where.createdAt = {};
    if (date_from) where.createdAt.gte = parseDay(date_from, "date_from");
    if (date_to) {
      const end = parseDay(date_to, "date_to");
      where.createdAt.lte = Number.isNaN(new Date(`${date_to}T23:59:59.999Z`).getTime())
        ? end
        : new Date(`${date_to}T23:59:59.999Z`);
    }
  }

  const sessions = await prisma.session.findMany({
    where,
    include: sessionInclude(),
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({ sessions });
});

export const getCallToken = asyncHandler(async (req, res) => {
  const session = await prisma.session.findUnique({
    where: { id: req.params.id },
    include: sessionInclude(),
  });
  if (!session) return res.status(404).json({ error: "Session not found" });

  if (!canJoinLiveSession(session, req.user)) {
    return res.status(403).json({ error: "Not allowed to join this live session" });
  }

  const token = await issueCallToken(session, req.user);
  res.json(token);
});

export const listUnmatched = asyncHandler(async (req, res) => {
  if (!(can(req.user, "sessions.view") || req.user.role === "hospital_admin")) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const where = {
    unmatchedAt: { not: null },
    unmatchedAckAt: null,
    translatorId: null,
  };
  if (req.user.role === "hospital_admin") {
    where.organizationId = req.user.organizationId;
  }
  const sessions = await prisma.session.findMany({
    where,
    include: sessionInclude(),
    orderBy: { unmatchedAt: "desc" },
    take: 100,
  });
  res.json({ sessions });
});

export const acknowledgeUnmatched = asyncHandler(async (req, res) => {
  if (!(can(req.user, "sessions.view") || req.user.role === "hospital_admin")) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const session = await prisma.session.findUnique({ where: { id: req.params.id } });
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (req.user.role === "hospital_admin" && session.organizationId !== req.user.organizationId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const updated = await prisma.session.update({
    where: { id: session.id },
    data: {
      unmatchedAckAt: new Date(),
      unmatchedAckById: req.user.id,
    },
    include: sessionInclude(),
  });
  res.json({ session: updated });
});

function serializeMessage(message) {
  return {
    id: message.id,
    sessionId: message.sessionId,
    senderId: message.senderId,
    body: message.body,
    createdAt: message.createdAt,
    sender: message.sender
      ? {
          id: message.sender.id,
          fullName: message.sender.fullName,
          role: message.sender.role,
        }
      : null,
  };
}

function canAccessSessionChat(session, user) {
  return canViewSession(session, user);
}

export const listMessages = asyncHandler(async (req, res) => {
  const session = await prisma.session.findUnique({ where: { id: req.params.id } });
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (!canAccessSessionChat(session, req.user)) {
    return res.status(403).json({ error: "Not a participant in this session" });
  }

  const messages = await prisma.sessionMessage.findMany({
    where: { sessionId: session.id },
    include: { sender: { select: { id: true, fullName: true, role: true } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  res.json({ messages: messages.map(serializeMessage) });
});

export const createMessage = asyncHandler(async (req, res) => {
  const body = String(req.body?.body || "").trim();
  if (!body) return res.status(400).json({ error: "Message cannot be empty" });
  if (body.length > 2000) {
    return res.status(400).json({ error: "Message is too long" });
  }

  const session = await prisma.session.findUnique({ where: { id: req.params.id } });
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (!canJoinLiveSession(session, req.user)) {
    return res.status(403).json({ error: "Not a participant in this session" });
  }
  if (isHiddenWatcher(req.user)) {
    return res.status(403).json({ error: "Watch-only admins cannot send messages" });
  }
  if (session.status !== "active") {
    return res.status(400).json({ error: "Chat is only available during a live call" });
  }

  const message = await prisma.sessionMessage.create({
    data: {
      sessionId: session.id,
      senderId: req.user.id,
      body,
    },
    include: { sender: { select: { id: true, fullName: true, role: true } } },
  });
  const payload = serializeMessage(message);
  const io = req.app.get("io");
  if (io) {
    io.to(`session:${session.id}`).emit("call:message", payload);
    io.to(`user:${session.doctorId}`).emit("call:message", payload);
    if (session.translatorId) {
      io.to(`user:${session.translatorId}`).emit("call:message", payload);
    }
  }
  res.status(201).json({ message: payload });
});
