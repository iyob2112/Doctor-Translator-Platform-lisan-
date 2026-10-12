import { env } from "../config/env.js";
import { etb } from "../utils/money.js";

const mockStore = new Map();

export function chapaEnabled() {
  return Boolean(env.chapaSecretKey) && !env.chapaMock;
}

export async function initializeChapaCheckout({
  amountEtb,
  email,
  firstName,
  lastName,
  txRef,
  returnUrl,
  callbackUrl,
  title,
  description,
}) {
  const payload = {
    amount: String(etb(amountEtb)),
    currency: "ETB",
    email,
    first_name: firstName || "Hospital",
    last_name: lastName || "Desk",
    tx_ref: txRef,
    callback_url: callbackUrl,
    return_url: returnUrl,
    customization: {
      title: chapaText(title || "Lisan", 16),
      description: chapaText(description || "Hospital billing", 50),
    },
  };

  if (env.chapaMock) {
    mockStore.set(txRef, { status: "pending", reference: `mock-${txRef}` });
    return {
      checkoutUrl: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}mock=1&tx_ref=${encodeURIComponent(txRef)}`,
      raw: { mock: true, status: "success", data: { checkout_url: returnUrl } },
    };
  }
  if (!chapaEnabled()) {
    const err = new Error("Chapa payments are not configured");
    err.status = 503;
    throw err;
  }

  const res = await fetch(`${env.chapaBaseUrl}/v1/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.chapaSecretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok || raw.status !== "success" || !raw.data?.checkout_url) {
    const message = flattenChapaMessage(raw) || "Could not start Chapa checkout";
    const err = new Error(message);
    err.status = 502;
    throw err;
  }
  return { checkoutUrl: raw.data.checkout_url, raw };
}

export async function verifyChapaTransaction(txRef) {
  if (!txRef) {
    return { ok: false, status: "failed", message: "Missing transaction reference" };
  }

  if (env.chapaMock || !chapaEnabled()) {
    const mock = mockStore.get(txRef) || { status: "pending" };
    if (mock.status === "success") {
      return {
        ok: true,
        status: "success",
        txRef,
        reference: mock.reference || `mock-${txRef}`,
        raw: mock,
      };
    }
    return {
      ok: false,
      status: mock.status || "pending",
      txRef,
      message: mock.message || "Payment is still pending",
      raw: mock,
    };
  }

  const res = await fetch(`${env.chapaBaseUrl}/v1/transaction/verify/${encodeURIComponent(txRef)}`, {
    headers: { Authorization: `Bearer ${env.chapaSecretKey}` },
  });
  const raw = await res.json().catch(() => ({}));
  const data = raw.data || {};
  const status = String(data.status || raw.status || "").toLowerCase();
  if (status === "success") {
    return {
      ok: true,
      status: "success",
      txRef: data.tx_ref || txRef,
      reference: data.reference || data.trx_ref || null,
      raw,
    };
  }
  if (status === "pending" || status === "created") {
    return { ok: false, status: "pending", txRef, message: "Payment is still pending", raw };
  }
  return {
    ok: false,
    status: status === "cancelled" ? "cancelled" : "failed",
    txRef,
    message: raw.message || data.message || "Payment was not successful",
    raw,
  };
}

export function setMockChapaResult(txRef, status, message) {
  mockStore.set(txRef, {
    status,
    reference: `mock-${txRef}`,
    message,
  });
  return mockStore.get(txRef);
}

export function getMockChapaResult(txRef) {
  return mockStore.get(txRef) || null;
}

function chapaText(value, max) {
  const cleaned = String(value || "")
    .replace(/[—–]/g, "-")
    .replace(/[^A-Za-z0-9._\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "Lisan").slice(0, max);
}

function flattenChapaMessage(raw) {
  const message = raw?.message;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message)) return message.filter(Boolean).join(", ");
  if (message && typeof message === "object") {
    return Object.values(message)
      .flat()
      .filter(Boolean)
      .join(", ");
  }
  return "";
}
