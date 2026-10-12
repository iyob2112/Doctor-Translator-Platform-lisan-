import { prisma } from "../config/db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { sessionInclude } from "../utils/tokens.js";

function requireHospital(req, res) {
  if (!req.user.organizationId) {
    res.status(400).json({ error: "Hospital account is not assigned to a hospital" });
    return null;
  }
  return req.user.organizationId;
}

export const getHospital = asyncHandler(async (req, res) => {
  const organizationId = requireHospital(req, res);
  if (!organizationId) return;

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { departments: { orderBy: { name: "asc" } } },
  });
  res.json({ organization });
});

export const createHospitalDepartment = asyncHandler(async (req, res) => {
  const organizationId = requireHospital(req, res);
  if (!organizationId) return;
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });

  const department = await prisma.department.create({
    data: { name, organizationId },
    include: { organization: { select: { id: true, name: true } } },
  });
  res.status(201).json({ department });
});

export const listHospitalSessions = asyncHandler(async (req, res) => {
  const organizationId = requireHospital(req, res);
  if (!organizationId) return;

  const sessions = await prisma.session.findMany({
    where: { organizationId },
    include: sessionInclude(),
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({ sessions });
});
