export function homeFor(user) {
  if (!user) return "/login";
  if (user.role === "admin" || user.role === "subadmin") return "/admin";
  if (user.role === "hospital_admin" || user.role === "doctor") return "/hospital";
  if (user.role === "translator") return "/translator";
  return "/login";
}

export function roleLabel(role) {
  if (role === "hospital_admin") return "Hospital";
  if (role === "admin") return "Platform admin";
  if (role === "subadmin") return "Subadmin";
  if (role === "doctor") return "Hospital";
  if (!role) return "";
  return role.replaceAll("_", " ");
}

export function isClinicSide(user) {
  return user?.role === "hospital_admin" || user?.role === "doctor";
}

export function isWatchOnly(user) {
  return user?.role === "admin" || user?.role === "subadmin";
}

export function clinicLabel(session) {
  if (!session) return "Hospital";
  return session.attendingName || session.organization?.name || session.doctor?.fullName || "Hospital";
}
