import { prisma } from "../config/db.js";
import { deviceLimitReached, httpError, serializeDevice } from "../utils/billing.js";

export async function listDevices(organizationId) {
  return prisma.device.findMany({
    where: { organizationId },
    orderBy: [{ isActive: "desc" }, { lastSeenAt: "desc" }],
  });
}

export async function registerOrTouchDevice({
  organizationId,
  fingerprint,
  label,
  userAgent,
  maxDevices,
  enforceLimit,
}) {
  const id = String(fingerprint || "").trim();
  if (!id) {
    throw httpError(400, "Device fingerprint is required");
  }

  const existing = await prisma.device.findUnique({
    where: { organizationId_fingerprint: { organizationId, fingerprint: id } },
  });

  if (existing?.isActive) {
    const device = await prisma.device.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: new Date(),
        ...(label ? { label } : {}),
        ...(userAgent ? { userAgent } : {}),
      },
    });
    return { device, created: false };
  }

  if (enforceLimit) {
    const activeCount = await prisma.device.count({
      where: { organizationId, isActive: true },
    });
    if (deviceLimitReached(activeCount, maxDevices, false)) {
      throw httpError(
        403,
        `This monthly plan allows ${maxDevices} exam-room computers. This one is extra. Sign in from an allowed computer, open Plans, and deactivate a device first.`,
        { code: "DEVICE_LIMIT" }
      );
    }
  }

  if (existing) {
    const device = await prisma.device.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: new Date(),
        isActive: true,
        ...(label ? { label } : {}),
        ...(userAgent ? { userAgent } : {}),
      },
    });
    return { device, created: false };
  }

  try {
    const device = await prisma.device.create({
      data: {
        organizationId,
        fingerprint: id,
        label: label || "Hospital device",
        userAgent: userAgent || null,
      },
    });
    return { device, created: true };
  } catch (err) {
    if (err?.code !== "P2002") throw err;
    const device = await prisma.device.update({
      where: { organizationId_fingerprint: { organizationId, fingerprint: id } },
      data: {
        lastSeenAt: new Date(),
        ...(label ? { label } : {}),
        ...(userAgent ? { userAgent } : {}),
        isActive: true,
      },
    });
    return { device, created: false };
  }
}

export async function deactivateDevice(organizationId, deviceId) {
  const device = await prisma.device.findFirst({
    where: { id: deviceId, organizationId },
  });
  if (!device) throw httpError(404, "Device not found");
  return prisma.device.update({
    where: { id: device.id },
    data: { isActive: false },
  });
}

export function presentDevices(devices, maxDevices) {
  const active = devices.filter((d) => d.isActive);
  return {
    devices: devices.map(serializeDevice),
    activeCount: active.length,
    maxDevices: maxDevices ?? null,
    remaining: maxDevices == null ? null : Math.max(0, maxDevices - active.length),
  };
}
