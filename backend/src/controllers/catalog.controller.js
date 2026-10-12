import { prisma } from "../config/db.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const publicCatalog = asyncHandler(async (_req, res) => {
  const [organizations, languages] = await Promise.all([
    prisma.organization.findMany({
      include: { departments: { orderBy: { name: "asc" } } },
      orderBy: { name: "asc" },
    }),
    prisma.language.findMany({ orderBy: { name: "asc" } }),
  ]);
  res.json({ organizations, languages });
});
