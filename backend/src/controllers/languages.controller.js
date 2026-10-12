import { prisma } from "../config/db.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const listLanguages = asyncHandler(async (req, res) => {
  const languages = await prisma.language.findMany({ orderBy: { name: "asc" } });
  res.json({ languages });
});

export const createLanguage = asyncHandler(async (req, res) => {
  const { code, name } = req.body || {};
  if (!code || !name) {
    return res.status(400).json({ error: "code and name are required" });
  }
  const language = await prisma.language.create({
    data: { code: String(code).toLowerCase().trim(), name },
  });
  res.status(201).json({ language });
});
