export const ADMIN_PERMISSIONS = [
  { id: "sessions.view", label: "View sessions" },
  { id: "translators.create", label: "Add translators" },
  { id: "translators.manage", label: "Manage translators" },
  { id: "hospitals.manage", label: "Manage hospitals" },
  { id: "payouts.review", label: "Review payouts" },
  { id: "languages.manage", label: "Manage languages" },
  { id: "billing.manage", label: "Manage plans and billing" },
];

export const ADMIN_PERMISSION_IDS = ADMIN_PERMISSIONS.map((item) => item.id);

export function isFullAdmin(user) {
  return user?.role === "admin";
}

export function isPlatformStaff(user) {
  return user?.role === "admin" || user?.role === "subadmin";
}

export function can(user, permission) {
  if (!user || !permission) return false;
  if (isFullAdmin(user)) return true;
  if (user.role !== "subadmin") return false;
  return (user.permissions || []).includes(permission);
}

export function canAny(user, permissions) {
  return (permissions || []).some((permission) => can(user, permission));
}

export function normalizePermissions(list) {
  const allowed = new Set(ADMIN_PERMISSION_IDS);
  return [...new Set((Array.isArray(list) ? list : []).filter((id) => allowed.has(id)))];
}

export function canEditAccount(actor, target) {
  if (!actor || !target) return false;
  if (target.role === "admin" || target.role === "subadmin") return isFullAdmin(actor);
  if (target.role === "translator") {
    return can(actor, "translators.manage") || can(actor, "translators.create");
  }
  if (target.role === "hospital_admin" || target.role === "doctor") return can(actor, "hospitals.manage");
  return false;
}

export function canManageAccount(actor, target) {
  if (!actor || !target) return false;
  if (target.role === "admin" || target.role === "subadmin") return isFullAdmin(actor);
  if (target.role === "translator") return can(actor, "translators.manage");
  if (target.role === "hospital_admin" || target.role === "doctor") return can(actor, "hospitals.manage");
  return false;
}
