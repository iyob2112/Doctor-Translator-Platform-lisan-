import { Prisma } from "@prisma/client";

export function errorHandler(err, req, res, next) {
  console.error(err);
  if (err.name === "MulterError") {
    const message =
      err.code === "LIMIT_FILE_SIZE" ? "File too large (max 8 MB)" : err.message;
    return res.status(400).json({ error: message });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Already exists" });
    }
    if (err.code === "P2003") {
      return res.status(400).json({ error: "Related record not found" });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Record not found" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({ error: "Invalid request" });
  }
  const status = err.status || 500;
  res.status(status).json({
    error:
      err.status && err.message
        ? err.message
        : status >= 500
          ? "Internal server error"
          : err.message || "Request failed",
    ...(err.code && status < 500 ? { code: err.code } : {}),
  });
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
