import { prisma } from "../config/db.js";

export async function findMatchingTranslators(languageId, excludeUserIds = []) {
  const profiles = await prisma.translatorProfile.findMany({
    where: {
      isOnline: true,
      flagged: false,
      approvalStatus: "approved",
      user: {
        isActive: true,
        role: "translator",
        ...(excludeUserIds.length
          ? { id: { notIn: excludeUserIds } }
          : {}),
      },
      languages: { some: { languageId } },
    },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          department: { select: { name: true } },
        },
      },
      languages: { include: { language: true } },
    },
  });
  return profiles.slice().sort((a, b) => {
    const at = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
    const bt = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
    if (bt !== at) return bt - at;
    return String(a.user?.fullName || "").localeCompare(String(b.user?.fullName || ""));
  });
}

export async function expireOpenRequests(sessionId) {
  await prisma.translatorRequest.updateMany({
    where: { sessionId, status: "open" },
    data: { status: "expired" },
  });
}
