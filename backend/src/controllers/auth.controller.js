import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma } from "../config/db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { env } from "../config/env.js";
import { sendPasswordResetEmail } from "../services/mail.service.js";
import {
  signAccessToken,
  issueRefreshToken,
  refreshTokenId,
  verifyAccessToken,
  userPublicSelect,
  serializeUser,
} from "../utils/tokens.js";
import { clientUrlFromRequest } from "../utils/origins.js";
import { getActiveSubscription } from "../services/subscriptions.service.js";
import { assertMonthlyDeviceSlot } from "../services/access.service.js";

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const user = await prisma.user.findUnique({
    where: { email: String(email).toLowerCase().trim() },
    select: { ...userPublicSelect, passwordHash: true },
  });

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  if (user.role === "doctor") {
    return res.status(403).json({
      error: "This hospital uses one shared login. Sign in with the hospital account.",
    });
  }

  if (!user.isActive) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  if (user.role === "hospital_admin" && user.organizationId) {
    const subscription = await getActiveSubscription(user.organizationId);
    if (subscription) {
      await assertMonthlyDeviceSlot({
        organizationId: user.organizationId,
        fingerprint: req.body?.fingerprint || req.headers["x-device-fingerprint"],
        label: "Exam-room computer",
        userAgent: req.headers["user-agent"],
        maxDevices: subscription.plan?.maxDevices,
      });
    }
  }

  const { passwordHash, ...safe } = user;
  const accessToken = signAccessToken(user);
  const refreshToken = await issueRefreshToken(user.id);

  res.json({
    accessToken,
    refreshToken,
    user: serializeUser(safe),
  });
});

export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    return res.status(400).json({ error: "Refresh token required" });
  }

  const tokenId = refreshTokenId(refreshToken);
  const stored = tokenId
    ? await prisma.refreshToken.findUnique({
        where: { token: tokenId },
        include: { user: { select: userPublicSelect } },
      })
    : null;

  if (!stored || stored.expiresAt < new Date() || !stored.user.isActive) {
    return res.status(401).json({ error: "Invalid refresh token" });
  }

  const claimed = await prisma.refreshToken.deleteMany({ where: { id: stored.id } });
  if (claimed.count === 0) {
    return res.status(401).json({ error: "Invalid refresh token" });
  }
  const accessToken = signAccessToken(stored.user);
  const nextRefresh = await issueRefreshToken(stored.user.id);

  res.json({
    accessToken,
    refreshToken: nextRefresh,
    user: serializeUser(stored.user),
  });
});

export const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body || {};
  const tokenId = refreshTokenId(refreshToken);
  let userId = null;
  if (tokenId) {
    const stored = await prisma.refreshToken.findUnique({ where: { token: tokenId } });
    if (stored) userId = stored.userId;
    await prisma.refreshToken.deleteMany({ where: { token: tokenId } });
  }
  if (!userId) {
    try {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      if (token) userId = verifyAccessToken(token).sub;
    } catch {
      /* ignore */
    }
  }
  if (userId) {
    await prisma.translatorProfile.updateMany({
      where: { userId },
      data: { isOnline: false, wantsOnline: false },
    });
    const io = req.app.get("io");
    if (io) {
      io.emit("translator:availability_changed", {
        translatorId: userId,
        is_online: false,
      });
    }
  }
  res.json({ ok: true });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});

export const updateMe = asyncHandler(async (req, res) => {
  const { fullName, password, currentPassword } = req.body || {};
  const data = {};

  if (fullName) data.fullName = String(fullName).trim();

  if (password) {
    if (String(password).length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    const existing = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { passwordHash: true },
    });
    if (!currentPassword || !(await bcrypt.compare(currentPassword, existing.passwordHash))) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }
    if (await bcrypt.compare(password, existing.passwordHash)) {
      return res.status(400).json({ error: "New password must be different from the temporary password" });
    }
    data.passwordHash = await bcrypt.hash(password, 10);
    data.mustChangePassword = false;
  }

  if (!Object.keys(data).length) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  await prisma.user.update({
    where: { id: req.user.id },
    data,
  });

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: userPublicSelect,
  });
  res.json({ user: serializeUser(user) });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const email = String(req.body?.email || "").toLowerCase().trim();
  const generic = {
    ok: true,
    message: "If that email is on file, we sent a reset link.",
  };
  if (!email) return res.status(400).json({ error: "Email is required" });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    return res.json(generic);
  }

  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const raw = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });

  const resetUrl = `${clientUrlFromRequest(req, env.clientUrl)}/reset-password?token=${raw}`;
  await sendPasswordResetEmail({ to: user.email, name: user.fullName, resetUrl });

  res.json(generic);
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) {
    return res.status(400).json({ error: "token and password are required" });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const tokenHash = crypto.createHash("sha256").update(String(token)).digest("hex");
  const stored = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!stored || stored.usedAt || stored.expiresAt < new Date() || !stored.user.isActive) {
    return res.status(400).json({ error: "This reset link is invalid or has expired" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: stored.userId },
      data: { passwordHash, mustChangePassword: false },
    }),
    prisma.passwordResetToken.update({
      where: { id: stored.id },
      data: { usedAt: new Date() },
    }),
    prisma.refreshToken.deleteMany({ where: { userId: stored.userId } }),
  ]);

  res.json({ ok: true });
});
