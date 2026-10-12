import { prisma } from "../config/db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { userPublicSelect, serializeUser } from "../utils/tokens.js";
import { getTranslatorPaySummary, serializeWithdrawal } from "../utils/earnings.js";

const PAYOUT_METHODS = new Set(["telebirr", "cbe", "bank"]);

export const getMe = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: userPublicSelect,
  });
  res.json({ user: serializeUser(user) });
});

export const updateLanguages = asyncHandler(async (req, res) => {
  return res.status(403).json({
    error: "Languages are assigned by the platform admin",
  });
});

export { BIRR_PER_HOUR } from "../utils/earnings.js";

export const getEarnings = asyncHandler(async (req, res) => {
  res.json(await getTranslatorPaySummary(req.user.id));
});

export const requestWithdrawal = asyncHandler(async (req, res) => {
  const { periodKey, method, accountName, accountNumber, note } = req.body || {};
  const payoutMethod = String(method || "").trim().toLowerCase();
  const name = String(accountName || "").trim();
  const account = String(accountNumber || "").trim();

  if (!PAYOUT_METHODS.has(payoutMethod)) {
    return res.status(400).json({ error: "Choose Telebirr, CBE Birr, or bank transfer" });
  }
  if (!name || name.length < 2) {
    return res.status(400).json({ error: "Account name is required" });
  }
  if (!account || account.length < 6) {
    return res.status(400).json({ error: "Phone or account number is required" });
  }

  const summary = await getTranslatorPaySummary(req.user.id);
  if (summary.reviewingWithdrawal) {
    return res.status(409).json({
      error: "Your payout is under review. Wait for the platform admin.",
    });
  }
  const due = summary.duePayout;
  if (!due) {
    return res.status(400).json({
      error: "Payout opens on your start day, after that month closes.",
    });
  }
  if (periodKey && periodKey !== due.period.key) {
    return res.status(400).json({ error: "This payout month is not ready yet" });
  }

  const amount = due.amountEtb;
  if (amount <= 0) {
    return res.status(400).json({ error: "No Birr is due for this month" });
  }

  await prisma.translatorProfile.updateMany({
    where: { userId: req.user.id },
    data: {
      payoutMethod,
      payoutAccountName: name,
      payoutAccountNumber: account,
    },
  });

  const withdrawal = await prisma.withdrawalRequest.create({
    data: {
      translatorId: req.user.id,
      amountEtb: amount.toFixed(2),
      method: payoutMethod,
      accountName: name,
      accountNumber: account,
      note: note ? String(note).trim().slice(0, 280) : null,
      periodKey: due.period.key,
      periodStart: new Date(due.period.start),
      periodEnd: new Date(due.period.end),
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: userPublicSelect,
  });
  res.status(201).json({
    user: serializeUser(user),
    withdrawal: serializeWithdrawal(withdrawal),
    earnings: await getTranslatorPaySummary(req.user.id),
  });
});

export const updatePayoutAccount = asyncHandler(async (req, res) => {
  const { method, accountName, accountNumber } = req.body || {};
  const payoutMethod = String(method || "").trim().toLowerCase();
  const name = String(accountName || "").trim();
  const account = String(accountNumber || "").trim();

  if (!PAYOUT_METHODS.has(payoutMethod)) {
    return res.status(400).json({ error: "Choose Telebirr, CBE Birr, or bank transfer" });
  }
  if (!name || name.length < 2) {
    return res.status(400).json({ error: "Account name is required" });
  }
  if (!account || account.length < 6) {
    return res.status(400).json({ error: "Phone or account number is required" });
  }

  const profile = await prisma.translatorProfile.findUnique({
    where: { userId: req.user.id },
  });
  if (!profile) return res.status(404).json({ error: "Translator profile not found" });
  if (!profile.payoutMethod && !profile.payoutAccountNumber) {
    const existing = await prisma.withdrawalRequest.findFirst({
      where: { translatorId: req.user.id },
      select: { id: true },
    });
    if (!existing) {
      return res.status(400).json({ error: "Enter your payment method when the payout popup opens" });
    }
  }

  await prisma.translatorProfile.update({
    where: { userId: req.user.id },
    data: {
      payoutMethod,
      payoutAccountName: name,
      payoutAccountNumber: account,
    },
  });

  await prisma.withdrawalRequest.updateMany({
    where: {
      translatorId: req.user.id,
      status: { in: ["pending", "approved"] },
    },
    data: {
      method: payoutMethod,
      accountName: name,
      accountNumber: account,
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: userPublicSelect,
  });
  res.json({
    user: serializeUser(user),
    earnings: await getTranslatorPaySummary(req.user.id),
  });
});

export const updateAvailability = asyncHandler(async (req, res) => {
  const { is_online } = req.body || {};
  if (typeof is_online !== "boolean") {
    return res.status(400).json({ error: "is_online boolean is required" });
  }

  const existing = await prisma.translatorProfile.findUnique({
    where: { userId: req.user.id },
  });
  if (!existing) {
    return res.status(404).json({ error: "Translator profile not found" });
  }
  if (existing.approvalStatus !== "approved") {
    return res.status(403).json({
      error:
        existing.approvalStatus === "rejected"
          ? "Your interpreter account was not approved"
          : "Wait for platform admin approval before going online",
    });
  }
  if (existing.flagged) {
    return res.status(403).json({
      error:
        "Your account is flagged for review after low ratings. A platform admin must clear the flag before you can go online.",
    });
  }

  const profile = await prisma.translatorProfile.update({
    where: { userId: req.user.id },
    data: {
      isOnline: is_online,
      wantsOnline: is_online,
      lastSeenAt: new Date(),
    },
  });

  const io = req.app.get("io");
  if (io) {
    io.emit("translator:availability_changed", {
      translatorId: req.user.id,
      is_online: profile.isOnline,
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: userPublicSelect,
  });
  res.json({ user: serializeUser(user) });
});
