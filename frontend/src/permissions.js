export const ADMIN_PERMISSIONS = [
  { id: "sessions.view", label: "View sessions" },
  { id: "translators.create", label: "Add translators" },
  { id: "translators.manage", label: "Manage translators" },
  { id: "hospitals.manage", label: "Manage hospitals" },
  { id: "payouts.review", label: "Review payouts" },
  { id: "languages.manage", label: "Manage languages" },
  { id: "billing.manage", label: "Manage plans and billing" },
];

export function isFullAdmin(user) {
  return user?.role === "admin";
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
