import { prisma } from "../config/db.js";
import { verifyAccessToken, userPublicSelect, serializeUser } from "../utils/tokens.js";
import { can, isFullAdmin } from "../utils/permissions.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: "Authorization required" });
    }
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: userPublicSelect,
    });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Account is inactive or missing" });
    }
    req.user = serializeUser(user);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function roleGuard(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

export function permissionGuard(...permissions) {
  return (req, res, next) => {
    if (isFullAdmin(req.user)) return next();
    if (permissions.some((permission) => can(req.user, permission))) return next();
    return res.status(403).json({ error: "You do not have permission for this" });
  };
}
