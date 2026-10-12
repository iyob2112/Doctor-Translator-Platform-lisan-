import { getActiveSubscription } from "./subscriptions.service.js";
import { remainingMinutes } from "./minutes.service.js";
import { listDevices, registerOrTouchDevice } from "./devices.service.js";
import { httpError } from "../utils/billing.js";
import {
  assertCanUseOndemand,
  getPlatformBillingConfig,
  hasUnpaidInvoice,
  presentPlatformConfig,
} from "./invoices.service.js";

export async function hospitalBillingSnapshot(organizationId, fingerprint) {
  const subscription = await getActiveSubscription(organizationId);
  const minutes = await remainingMinutes(organizationId);
  const devices = await listDevices(organizationId);
  const maxDevices = subscription?.plan?.maxDevices ?? null;
  const activeDevices = devices.filter((d) => d.isActive);
  const thisDevice = fingerprint
    ? devices.find((d) => d.fingerprint === fingerprint)
    : null;
  const unpaid = await hasUnpaidInvoice(organizationId);
  const config = await getPlatformBillingConfig();
  const ondemandEnabled = Boolean(config.enabled);
  let activeMode = "none";
  if (unpaid) activeMode = "blocked";
  else if (subscription) activeMode = "subscription";
  else if (minutes > 0) activeMode = "minutes";
  else if (ondemandEnabled) activeMode = "ondemand";
  const hasLiveAccess = !unpaid && (Boolean(subscription) || minutes > 0 || ondemandEnabled);
  return {
    subscription,
    remainingMinutes: minutes,
    devices,
    maxDevices: subscription ? maxDevices : null,
    activeDeviceCount: activeDevices.length,
    thisDevice,
    hasLiveAccess,
    activeMode,
    unpaidInvoice: unpaid
      ? { id: unpaid.id, periodKey: unpaid.periodKey, totalEtb: Number(unpaid.totalEtb) }
      : null,
    ondemand: presentPlatformConfig(config),
  };
}

export async function assertHospitalCanStartConsult({
  organizationId,
  fingerprint,
  label,
  userAgent,
}) {
  const unpaid = await hasUnpaidInvoice(organizationId);
  if (unpaid) {
    throw httpError(
      402,
      `This hospital has an unpaid on-demand bill for ${unpaid.periodKey}. Pay it before starting more consults.`,
      { code: "UNPAID_INVOICE", invoiceId: unpaid.id, periodKey: unpaid.periodKey }
    );
  }

  const snapshot = await hospitalBillingSnapshot(organizationId, fingerprint);
  if (snapshot.subscription) {
    await assertMonthlyDeviceSlot({
      organizationId,
      fingerprint,
      label,
      userAgent,
      maxDevices: snapshot.maxDevices,
    });
    return { ...snapshot, via: "subscription", deductMinutes: false };
  }
  if (snapshot.remainingMinutes > 0) {
    if (fingerprint) {
      await registerOrTouchDevice({
        organizationId,
        fingerprint,
        label,
        userAgent,
        enforceLimit: false,
      }).catch(() => null);
    }
    return { ...snapshot, via: "minutes", deductMinutes: true };
  }

  await assertCanUseOndemand(organizationId);
  if (fingerprint) {
    await registerOrTouchDevice({
      organizationId,
      fingerprint,
      label,
      userAgent,
      enforceLimit: false,
    }).catch(() => null);
  }
  return { ...snapshot, via: "ondemand", deductMinutes: false, activeMode: "ondemand" };
}

export async function assertMonthlyDeviceSlot({
  organizationId,
  fingerprint,
  label,
  userAgent,
  maxDevices,
}) {
  const id = String(fingerprint || "").trim();
  if (!id || id === "unknown-device") {
    throw httpError(
      400,
      "This computer could not be identified. Open the hospital desk in the exam-room browser.",
      { code: "DEVICE_REQUIRED" }
    );
  }
  return registerOrTouchDevice({
    organizationId,
    fingerprint: id,
    label,
    userAgent,
    maxDevices,
    enforceLimit: true,
  });
}
