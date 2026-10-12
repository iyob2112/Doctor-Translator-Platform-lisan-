import { can, isPlatformStaff } from "./permissions.js";

export function canViewSession(session, user) {
  if (!session || !user) return false;
  if (session.doctorId === user.id || session.translatorId === user.id) return true;
  if (session.transfers?.some((row) => row.fromTranslatorId === user.id || row.toTranslatorId === user.id)) {
    return true;
  }
  if (can(user, "sessions.view")) return true;
  if (user.role === "hospital_admin" && user.organizationId && user.organizationId === session.organizationId) {
    return true;
  }
  return false;
}

export function canJoinLiveSession(session, user) {
  if (!session || !user || session.status !== "active") return false;
  if (session.doctorId === user.id || session.translatorId === user.id) return true;
  if (can(user, "sessions.view")) return true;
  if (user.role === "hospital_admin" && user.organizationId && user.organizationId === session.organizationId) {
    return true;
  }
  return false;
}

export function isClinicOperator(user) {
  return user?.role === "hospital_admin" || user?.role === "doctor";
}

export function isClinicOwner(session, user) {
  return Boolean(session && user && session.doctorId === user.id);
}

export function isSessionAdmin(user) {
  return can(user, "sessions.view") || user?.role === "hospital_admin";
}

export function isHiddenWatcher(user) {
  return isPlatformStaff(user) && can(user, "sessions.view");
}

export function clinicLabel(session) {
  if (!session) return "Hospital";
  return (
    session.attendingName ||
    session.organization?.name ||
    session.doctor?.fullName ||
    "Hospital"
  );
}
