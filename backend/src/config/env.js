import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

export const env = {
  port: Number(process.env.PORT || 4000),
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "dev-access-secret",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret",
  jwtAccessExpiry: process.env.JWT_ACCESS_EXPIRY || "15m",
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || "7d",
  videoProvider: (process.env.VIDEO_PROVIDER || "webrtc").toLowerCase(),
  dailyApiKey: process.env.DAILY_API_KEY || "",
  turnUrls: process.env.TURN_URLS || "",
  turnUsername: process.env.TURN_USERNAME || "",
  turnCredential: process.env.TURN_CREDENTIAL || "",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  smtpFrom: process.env.SMTP_FROM || "Lisan <noreply@localhost>",
  agoraAppId: process.env.AGORA_APP_ID || "",
  agoraAppCertificate: process.env.AGORA_APP_CERTIFICATE || "",
  chapaSecretKey: String(process.env.CHAPA_SECRET_KEY || "").trim(),
  chapaPublicKey: String(process.env.CHAPA_PUBLIC_KEY || "").trim(),
  chapaBaseUrl: process.env.CHAPA_BASE_URL || "https://api.chapa.co",
  get chapaMock() {
    const flag = String(process.env.CHAPA_MOCK || "").toLowerCase();
    const hasKey = Boolean(String(process.env.CHAPA_SECRET_KEY || "").trim());
    if (flag === "force") return true;
    if (hasKey) return false;
    return true;
  },
};
