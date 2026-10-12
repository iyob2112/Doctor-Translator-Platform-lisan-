import nodemailer from "nodemailer";
import { env } from "../config/env.js";

function transporter() {
  if (!env.smtpHost) return null;
  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
  });
}

export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const transport = transporter();
  const subject = "Reset your Lisan password";
  const text = `Hi ${name || "there"},

We received a request to reset your Lisan password.
Open this link within 30 minutes:

${resetUrl}

If you did not ask for this, you can ignore the email.`;

  if (!transport) {
    if (process.env.NODE_ENV === "production") {
      console.log(`[password-reset] SMTP not configured. Reset email for ${to} was not sent.`);
    } else {
      console.log(`[password-reset] SMTP not configured. Link for ${to}: ${resetUrl}`);
    }
    return { sent: false, logged: true };
  }

  await transport.sendMail({
    from: env.smtpFrom,
    to,
    subject,
    text,
  });
  return { sent: true, logged: false };
}

export function smtpConfigured() {
  return Boolean(env.smtpHost);
}
