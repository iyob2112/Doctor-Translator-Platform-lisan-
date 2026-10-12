import http from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { Server } from "socket.io";
import { env } from "./config/env.js";
import { prisma } from "./config/db.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { attachSockets } from "./sockets/index.js";
import { isAllowedOrigin } from "./utils/origins.js";
import { ensureSingleActiveSubscription } from "./services/subscriptions.service.js";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import translatorRoutes from "./routes/translators.js";
import sessionRoutes from "./routes/sessions.js";
import languageRoutes from "./routes/languages.js";
import catalogRoutes from "./routes/catalog.js";
import hospitalRoutes from "./routes/hospital.js";
import billingRoutes from "./routes/billing.js";

const app = express();
const server = http.createServer(app);

const corsOptions = {
  origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
  credentials: true,
};

const io = new Server(server, {
  cors: corsOptions,
});

app.set("io", io);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/v1/health", (_req, res) => {
  res.json({ ok: true, service: "lisan-api" });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/translators", translatorRoutes);
app.use("/api/v1/sessions", sessionRoutes);
app.use("/api/v1/languages", languageRoutes);
app.use("/api/v1/catalog", catalogRoutes);
app.use("/api/v1/hospital", hospitalRoutes);
app.use("/api/v1/billing", billingRoutes);

app.use(errorHandler);
attachSockets(io);

process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection", reason);
});
process.on("uncaughtException", (err) => {
  console.error("uncaughtException", err);
  process.exit(1);
});

server.listen(env.port, "0.0.0.0", async () => {
  try {
    const result = await prisma.translatorProfile.updateMany({
      where: { isOnline: true },
      data: { isOnline: false },
    });
    if (result.count) {
      console.log(`Reset ${result.count} stale translator online flag(s)`);
    }
  } catch (err) {
    console.error("Could not reset translator presence", err);
  }
  try {
    const orgIds = await prisma.subscription.findMany({
      where: { status: "active" },
      select: { organizationId: true },
      distinct: ["organizationId"],
    });
    for (const row of orgIds) {
      await ensureSingleActiveSubscription(row.organizationId);
    }
    if (orgIds.length) {
      console.log(`Checked active plans for ${orgIds.length} hospital(s)`);
    }
  } catch (err) {
    console.error("Could not enforce one active plan per hospital", err);
  }
  if (
    !process.env.JWT_ACCESS_SECRET ||
    !process.env.JWT_REFRESH_SECRET ||
    /change-me|replace-with-a-long-random|dev-access-secret|dev-refresh-secret/i.test(
      `${env.jwtAccessSecret} ${env.jwtRefreshSecret}`
    )
  ) {
    console.warn("JWT secrets are still example values. Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET before production.");
  }
  if (env.videoProvider === "daily" && !env.dailyApiKey) {
    console.warn("VIDEO_PROVIDER=daily but DAILY_API_KEY is empty; live calls will use WebRTC.");
  }
  if (env.videoProvider === "agora" || env.agoraAppId) {
    console.warn("Agora is not implemented. Set VIDEO_PROVIDER=webrtc or VIDEO_PROVIDER=daily.");
  }
  console.log(`API listening on http://0.0.0.0:${env.port}`);
});

async function shutdown() {
  await prisma.$disconnect().catch(() => {});
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
