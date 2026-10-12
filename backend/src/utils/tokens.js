import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { prisma } from "../config/db.js";

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    env.jwtAccessSecret,
    { expiresIn: env.jwtAccessExpiry }
  );
}

export function durationToMs(value, fallbackMs) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d+)\s*([smhd])$/i);
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const map = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * map[unit];
}

export async function issueRefreshToken(userId) {
  const jti = crypto.randomBytes(48).toString("hex");
  const expiresAt = new Date(
    Date.now() + durationToMs(env.jwtRefreshExpiry, 7 * 24 * 60 * 60 * 1000)
  );
  await prisma.refreshToken.create({
    data: { userId, token: jti, expiresAt },
  });
  return jwt.sign({ sub: userId, jti, typ: "refresh" }, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiry,
  });
}

export function refreshTokenId(raw) {
  if (!raw) return null;
  const value = String(raw);
  if (value.split(".").length === 3) {
    try {
      const payload = jwt.verify(value, env.jwtRefreshSecret);
      if (payload?.typ && payload.typ !== "refresh") return null;
      return payload.jti || null;
    } catch {
      return null;
    }
  }
  if (/^[0-9a-f]{96}$/i.test(value)) return value;
  return null;
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret);
}

export const userPublicSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  permissions: true,
  organizationId: true,
  departmentId: true,
  organization: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  translatorProfile: {
    select: {
      id: true,
      isOnline: true,
      lastSeenAt: true,
      approvalStatus: true,
      reviewedAt: true,
      rejectionReason: true,
      flagged: true,
      flaggedAt: true,
      flaggedReason: true,
      payoutMethod: true,
      payoutAccountName: true,
      payoutAccountNumber: true,
      languages: {
        select: { language: { select: { id: true, code: true, name: true } } },
      },
    },
  },
};

export function serializeUser(user) {
  if (!user) return null;
  const languages =
    user.translatorProfile?.languages?.map((l) => l.language) || [];
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: Boolean(user.mustChangePassword),
    permissions: user.role === "subadmin" ? user.permissions || [] : undefined,
    organizationId: user.organizationId,
    departmentId: user.departmentId,
    organization: user.organization,
    department: user.department,
    translatorProfile: user.translatorProfile
      ? {
          id: user.translatorProfile.id,
          isOnline: user.translatorProfile.isOnline,
          lastSeenAt: user.translatorProfile.lastSeenAt,
          approvalStatus: user.translatorProfile.approvalStatus,
          reviewedAt: user.translatorProfile.reviewedAt,
          rejectionReason: user.translatorProfile.rejectionReason || null,
          flagged: Boolean(user.translatorProfile.flagged),
          flaggedAt: user.translatorProfile.flaggedAt,
          flaggedReason: user.translatorProfile.flaggedReason || null,
          payoutMethod: user.translatorProfile.payoutMethod || null,
          payoutAccountName: user.translatorProfile.payoutAccountName || null,
          payoutAccountNumber: user.translatorProfile.payoutAccountNumber || null,
          languages,
        }
      : null,
  };
}

export function sessionInclude() {
  return {
    doctor: { select: { id: true, fullName: true, email: true } },
    translator: { select: { id: true, fullName: true, email: true } },
    organization: { select: { id: true, name: true } },
    department: { select: { id: true, name: true } },
    language: { select: { id: true, code: true, name: true } },
    transfers: {
      orderBy: { transferredAt: "desc" },
      include: {
        fromTranslator: { select: { id: true, fullName: true } },
        toTranslator: { select: { id: true, fullName: true } },
      },
    },
  };
}
