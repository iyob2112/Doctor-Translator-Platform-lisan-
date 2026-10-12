import bcrypt from "bcryptjs";
import { prisma } from "../config/db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { userPublicSelect, serializeUser } from "../utils/tokens.js";
import { ADMIN_PERMISSIONS, can, canAny, canEditAccount, canManageAccount, isFullAdmin, normalizePermissions } from "../utils/permissions.js";
import { groupWithdrawalsByMonth, serializeWithdrawal, getTranslatorPaySummary } from "../utils/earnings.js";

export const listPermissions = asyncHandler(async (_req, res) => {
  res.json({ permissions: ADMIN_PERMISSIONS });
});

const VISIBLE_TO_SUBADMIN = ["hospital_admin", "translator", "doctor"];
const ROLES = ["doctor", "translator", "admin", "hospital_admin", "subadmin"];

async function assertLanguageIds(languageIds) {
  const ids = [...new Set((languageIds || []).map(String))];
  if (!ids.length) {
    const err = new Error("Assign at least one language to the translator");
    err.status = 400;
    throw err;
  }
  const found = await prisma.language.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (found.length !== ids.length) {
    const err = new Error("One or more language IDs are invalid");
    err.status = 400;
    throw err;
  }
  return ids;
}

export const listUsers = asyncHandler(async (req, res) => {
  const { role, organization_id, active } = req.query;
  if (role && !ROLES.includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }
  let roleFilter;
  if (isFullAdmin(req.user)) {
    roleFilter = role || undefined;
  } else if (role) {
    if (!VISIBLE_TO_SUBADMIN.includes(role)) {
      return res.json({ users: [] });
    }
    roleFilter = role;
  } else {
    roleFilter = { in: VISIBLE_TO_SUBADMIN };
  }
  const users = await prisma.user.findMany({
    where: {
      ...(roleFilter ? { role: roleFilter } : {}),
      ...(organization_id ? { organizationId: organization_id } : {}),
      ...(active !== undefined && active !== ""
        ? { isActive: active === "true" }
        : {}),
    },
    select: userPublicSelect,
    orderBy: { createdAt: "desc" },
  });
  res.json({ users: users.map(serializeUser) });
});

export const createUser = asyncHandler(async (req, res) => {
  const {
    email,
    password,
    fullName,
    role,
    organizationId: organizationIdRaw,
    organizationName,
    departmentId,
    languageIds,
  } = req.body || {};

  if (!email || !password || !fullName || !role) {
    return res.status(400).json({ error: "email, password, fullName, and role are required" });
  }
  if (!["admin", "hospital_admin", "translator", "subadmin"].includes(role)) {
    return res.status(400).json({ error: "Platform admin can create hospital accounts, translators, subadmins, or platform admins" });
  }
  if ((role === "admin" || role === "subadmin") && !isFullAdmin(req.user)) {
    return res.status(403).json({ error: "Only the platform admin can create admins or subadmins" });
  }
  if (role === "translator" && !can(req.user, "translators.create")) {
    return res.status(403).json({ error: "You do not have permission to add translators" });
  }
  if (role === "hospital_admin" && !can(req.user, "hospitals.manage")) {
    return res.status(403).json({ error: "You do not have permission to manage hospitals" });
  }

  if (String(password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (role === "hospital_admin") {
    const name = String(organizationName || "").trim();
    if (!organizationIdRaw && !name) {
      return res.status(400).json({ error: "Hospital name is required" });
    }
  }
  let translatorLanguageIds = [];
  if (role === "translator") {
    translatorLanguageIds = await assertLanguageIds(languageIds);
  }
  const permissions = role === "subadmin" ? normalizePermissions(req.body?.permissions) : [];
  if (role === "subadmin" && !permissions.length) {
    return res.status(400).json({ error: "Give the subadmin at least one permission" });
  }

  const existing = await prisma.user.findUnique({
    where: { email: String(email).toLowerCase().trim() },
  });
  if (existing) {
    return res.status(409).json({ error: "Email already in use" });
  }

  const user = await prisma.$transaction(async (tx) => {
    let organizationId = organizationIdRaw || null;
    if (role === "hospital_admin" && !organizationId) {
      const name = String(organizationName || "").trim();
      const existingOrg = await tx.organization.findFirst({
        where: { name: { equals: name, mode: "insensitive" } },
      });
      const organization =
        existingOrg ||
        (await tx.organization.create({
          data: { name },
        }));
      organizationId = organization.id;
    }
    const created = await tx.user.create({
      data: {
        email: String(email).toLowerCase().trim(),
        passwordHash: await bcrypt.hash(password, 10),
        mustChangePassword: true,
        fullName,
        role,
        ...(role === "subadmin" ? { permissions } : {}),
        organizationId: organizationId || null,
        departmentId: departmentId || null,
        ...(role === "translator"
          ? {
              translatorProfile: {
                create: { isOnline: false, approvalStatus: "approved", reviewedAt: new Date() },
              },
            }
          : {}),
      },
      select: userPublicSelect,
    });

    if (role === "translator") {
      const profile = await tx.translatorProfile.findUnique({
        where: { userId: created.id },
      });
      await tx.translatorLanguage.createMany({
        data: translatorLanguageIds.map((languageId) => ({
          translatorId: profile.id,
          languageId,
        })),
        skipDuplicates: true,
      });
    }
    return created;
  });

  const full = await prisma.user.findUnique({
    where: { id: user.id },
    select: userPublicSelect,
  });
  res.status(201).json({ user: serializeUser(full) });
});

export const setTranslatorApproval = asyncHandler(async (req, res) => {
  if (!can(req.user, "translators.manage")) {
    return res.status(403).json({ error: "You do not have permission to manage translators" });
  }
  const { status, reason } = req.body || {};
  if (!["approved", "rejected", "pending"].includes(status)) {
    return res.status(400).json({ error: "status must be approved, rejected, or pending" });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: { translatorProfile: true },
  });
  if (!user || user.role !== "translator" || !user.translatorProfile) {
    return res.status(404).json({ error: "Translator not found" });
  }

  const profile = user.translatorProfile;

  let rejectionReason = null;
  if (status === "rejected") {
    rejectionReason = String(reason || "").trim();
    if (rejectionReason.length < 8) {
      return res.status(400).json({
        error: "A rejection reason is required so the translator knows why they were turned down",
      });
    }
  }

  await prisma.translatorProfile.update({
    where: { userId: user.id },
    data: {
      approvalStatus: status,
      reviewedAt: status === "pending" ? null : new Date(),
      isOnline: status === "approved" ? profile.isOnline : false,
      wantsOnline: status === "approved" ? profile.wantsOnline : false,
      rejectionReason,
    },
  });

  const full = await prisma.user.findUnique({
    where: { id: user.id },
    select: userPublicSelect,
  });
  res.json({ user: serializeUser(full) });
});

export const setTranslatorFlag = asyncHandler(async (req, res) => {
  if (!can(req.user, "translators.manage")) {
    return res.status(403).json({ error: "You do not have permission to manage translators" });
  }
  const { flagged, reason } = req.body || {};
  if (typeof flagged !== "boolean") {
    return res.status(400).json({ error: "flagged boolean is required" });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: { translatorProfile: true },
  });
  if (!user || user.role !== "translator" || !user.translatorProfile) {
    return res.status(404).json({ error: "Translator not found" });
  }

  await prisma.translatorProfile.update({
    where: { userId: user.id },
    data: flagged
      ? {
          flagged: true,
          flaggedAt: new Date(),
          flaggedReason: String(reason || "").trim() || "Flagged by platform admin",
          isOnline: false,
          wantsOnline: false,
        }
      : {
          flagged: false,
          flaggedAt: null,
          flaggedReason: null,
        },
  });

  const io = req.app.get("io");
  if (flagged && io) {
    io.emit("translator:availability_changed", {
      translatorId: user.id,
      is_online: false,
    });
  }

  const full = await prisma.user.findUnique({
    where: { id: user.id },
    select: userPublicSelect,
  });
  res.json({ user: serializeUser(full) });
});

export const getTranslator = asyncHandler(async (req, res) => {
  if (!canAny(req.user, ["translators.create", "translators.manage"])) {
    return res.status(403).json({ error: "You do not have permission to view translators" });
  }
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: userPublicSelect,
  });
  if (!user || user.role !== "translator") {
    return res.status(404).json({ error: "Translator not found" });
  }
  const earnings = await getTranslatorPaySummary(user.id);
  res.json({ user: serializeUser(user), earnings });
});

export const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { fullName, email, organizationId, departmentId, password, languageIds, permissions } =
    req.body || {};

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "User not found" });
  if (!canEditAccount(req.user, existing)) {
    return res.status(403).json({ error: "You do not have permission to update this account" });
  }

  const data = {};
  if (fullName) data.fullName = fullName;
  if (email) {
    const nextEmail = String(email).toLowerCase().trim();
    const clash = await prisma.user.findFirst({
      where: { email: nextEmail, NOT: { id } },
      select: { id: true },
    });
    if (clash) return res.status(409).json({ error: "Email already in use" });
    data.email = nextEmail;
  }
  if (organizationId !== undefined) data.organizationId = organizationId || null;
  if (departmentId !== undefined) data.departmentId = departmentId || null;
  if (password) {
    if (String(password).length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    data.passwordHash = await bcrypt.hash(password, 10);
    data.mustChangePassword = true;
  }
  if (permissions !== undefined) {
    if (!isFullAdmin(req.user) || existing.role !== "subadmin") {
      return res.status(403).json({ error: "Only the platform admin can change subadmin permissions" });
    }
    const next = normalizePermissions(permissions);
    if (!next.length) {
      return res.status(400).json({ error: "Give the subadmin at least one permission" });
    }
    data.permissions = next;
  }

  const nextLanguages =
    existing.role === "translator" && Array.isArray(languageIds)
      ? await assertLanguageIds(languageIds)
      : null;

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length) {
      await tx.user.update({
        where: { id },
        data,
      });
    }
    if (nextLanguages) {
      const profile = await tx.translatorProfile.findUnique({
        where: { userId: existing.id },
      });
      if (profile) {
        await tx.translatorLanguage.deleteMany({
          where: { translatorId: profile.id },
        });
        await tx.translatorLanguage.createMany({
          data: nextLanguages.map((languageId) => ({
            translatorId: profile.id,
            languageId,
          })),
        });
      }
    }
  });

  const full = await prisma.user.findUnique({
    where: { id },
    select: userPublicSelect,
  });
  res.json({ user: serializeUser(full) });
});

export const deactivateUser = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: "You cannot deactivate your own account" });
  }
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "User not found" });
  if (!canManageAccount(req.user, existing)) {
    return res.status(403).json({ error: "You do not have permission to deactivate this account" });
  }
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { isActive: false },
    select: userPublicSelect,
  });
  if (user.role === "translator") {
    await prisma.translatorProfile.updateMany({
      where: { userId: user.id },
      data: { isOnline: false, wantsOnline: false },
    });
    const io = req.app.get("io");
    if (io) {
      io.emit("translator:availability_changed", {
        translatorId: user.id,
        is_online: false,
      });
    }
  }
  res.json({ user: serializeUser(user) });
});

export const deleteUser = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: "You cannot delete your own account" });
  }
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "User not found" });
  if (!canManageAccount(req.user, existing)) {
    return res.status(403).json({ error: "You do not have permission to delete this account" });
  }

  const [asDoctor, asTranslator, payments, bookings, acceptedRequests, createdSubs] = await Promise.all([
    prisma.session.count({ where: { doctorId: existing.id } }),
    prisma.session.count({
      where: {
        OR: [
          { translatorId: existing.id },
          { transfers: { some: { OR: [{ fromTranslatorId: existing.id }, { toTranslatorId: existing.id }] } } },
        ],
      },
    }),
    prisma.payment.count({ where: { userId: existing.id } }),
    prisma.booking.count({
      where: { OR: [{ translatorId: existing.id }, { bookedById: existing.id }] },
    }),
    prisma.translatorRequest.count({ where: { acceptedBy: existing.id } }),
    prisma.subscription.count({ where: { createdById: existing.id } }),
  ]);
  if (asDoctor || asTranslator || payments || bookings || acceptedRequests || createdSubs) {
    return res.status(409).json({
      error: "This account has sessions, bookings, or billing records. Deactivate it instead of deleting.",
    });
  }

  await prisma.user.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

export const activateUser = asyncHandler(async (req, res) => {
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "User not found" });
  if (!canManageAccount(req.user, existing)) {
    return res.status(403).json({ error: "You do not have permission to activate this account" });
  }
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { isActive: true },
    select: userPublicSelect,
  });
  res.json({ user: serializeUser(user) });
});

export const resetUserPassword = asyncHandler(async (req, res) => {
  const { password } = req.body || {};
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "User not found" });
  if (!canManageAccount(req.user, existing)) {
    return res.status(403).json({ error: "You do not have permission to reset this password" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, mustChangePassword: true },
    }),
    prisma.refreshToken.deleteMany({ where: { userId: existing.id } }),
  ]);
  res.json({ ok: true });
});

export const listOrganizations = asyncHandler(async (req, res) => {
  const organizations = await prisma.organization.findMany({
    include: { departments: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
  res.json({ organizations });
});

export const createOrganization = asyncHandler(async (req, res) => {
  const { name, address } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const organization = await prisma.organization.create({
    data: { name, address: address || null },
    include: { departments: true },
  });
  res.status(201).json({ organization });
});

export const listDepartments = asyncHandler(async (req, res) => {
  const { organization_id } = req.query;
  const departments = await prisma.department.findMany({
    where: organization_id ? { organizationId: organization_id } : {},
    include: { organization: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
  res.json({ departments });
});

export const listWithdrawals = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const withdrawals = await prisma.withdrawalRequest.findMany({
    where: status ? { status } : {},
    include: {
      translator: { select: { id: true, fullName: true, email: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  const grouped = groupWithdrawalsByMonth(withdrawals);
  res.json(grouped);
});

export const reviewWithdrawal = asyncHandler(async (req, res) => {
  const { status, reviewNote } = req.body || {};
  if (!["approved", "paid", "rejected"].includes(status)) {
    return res.status(400).json({ error: "status must be approved, paid, or rejected" });
  }

  const existing = await prisma.withdrawalRequest.findUnique({
    where: { id: req.params.id },
  });
  if (!existing) return res.status(404).json({ error: "Withdraw request not found" });
  if (existing.status === "paid") {
    return res.status(400).json({ error: "This payout is already marked paid" });
  }
  if (existing.status === "rejected") {
    return res.status(400).json({ error: "This request was already rejected" });
  }

  const withdrawal = await prisma.withdrawalRequest.update({
    where: { id: existing.id },
    data: {
      status,
      reviewNote: reviewNote ? String(reviewNote).trim().slice(0, 280) : existing.reviewNote,
      reviewedAt: new Date(),
    },
    include: {
      translator: { select: { id: true, fullName: true, email: true } },
    },
  });

  res.json({ withdrawal: serializeWithdrawal(withdrawal) });
});

export const createDepartment = asyncHandler(async (req, res) => {
  const { name, organizationId } = req.body || {};
  if (!name || !organizationId) {
    return res.status(400).json({ error: "name and organizationId are required" });
  }
  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) return res.status(400).json({ error: "Hospital not found" });
  const department = await prisma.department.create({
    data: { name, organizationId },
    include: { organization: { select: { id: true, name: true } } },
  });
  res.status(201).json({ department });
});
