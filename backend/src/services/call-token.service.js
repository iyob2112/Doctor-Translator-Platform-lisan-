import { env } from "../config/env.js";

function iceServers() {
  const servers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  const urls = env.turnUrls
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (urls.length) {
    servers.push({
      urls,
      username: env.turnUsername || undefined,
      credential: env.turnCredential || undefined,
    });
  }
  return servers;
}

async function dailyRequest(path, { method = "GET", body } = {}) {
  const res = await fetch(`https://api.daily.co/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.dailyApiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data, text };
}

export async function issueCallToken(session, user) {
  if (env.videoProvider === "daily" && !env.dailyApiKey) {
    return {
      provider: "webrtc",
      roomName: `session:${session.id}`,
      token: session.id,
      iceServers: iceServers(),
      fallbackReason: "Daily is selected but DAILY_API_KEY is not set, so this call uses browser WebRTC.",
    };
  }

  if (env.videoProvider === "daily" && env.dailyApiKey) {
    const roomName = `session-${session.id.replace(/-/g, "").slice(0, 24)}`;
    let created = await dailyRequest("/rooms", {
      method: "POST",
      body: {
        name: roomName,
        privacy: "private",
        properties: {
          exp: Math.floor(Date.now() / 1000) + 60 * 60,
          enable_chat: false,
          start_video_off: session.callMode === "voice",
          enable_network_ui: true,
        },
      },
    });

    if (!created.ok && created.status !== 400) {
      throw Object.assign(new Error(`Daily room error: ${created.text}`), { status: 502 });
    }

    if (!created.ok) {
      created = await dailyRequest(`/rooms/${roomName}`);
      if (!created.ok) {
        throw Object.assign(new Error(`Daily room error: ${created.text}`), { status: 502 });
      }
    }

    const watchOnly = user.role === "admin" || user.role === "subadmin";
    const tokenRes = await dailyRequest("/meeting-tokens", {
      method: "POST",
      body: {
        properties: {
          room_name: roomName,
          user_name: watchOnly ? " " : user.fullName,
          user_id: user.id,
          exp: Math.floor(Date.now() / 1000) + 60 * 60,
          is_owner: user.role === "hospital_admin" || user.role === "doctor",
          start_video_off: watchOnly || session.callMode === "voice",
          start_audio_off: watchOnly,
        },
      },
    });

    if (!tokenRes.ok) {
      throw Object.assign(new Error(`Daily token error: ${tokenRes.text}`), { status: 502 });
    }

    return {
      provider: "daily",
      roomName,
      roomUrl: created.data?.url,
      token: tokenRes.data.token,
      iceServers: iceServers(),
    };
  }

  return {
    provider: "webrtc",
    roomName: `session:${session.id}`,
    token: session.id,
    iceServers: iceServers(),
  };
}
