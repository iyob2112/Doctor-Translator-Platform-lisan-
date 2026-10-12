import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";

function formatTime(value) {
  try {
    return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function CallChat({ messages, currentUserId, onSend, disabled, readOnly = false }) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function submit(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || disabled || readOnly) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="flex min-h-[280px] flex-1 flex-col rounded-4xl border border-white/10 bg-[#12182b] p-4 shadow-lift">
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-300">
          <Icon name="chat" className="h-3.5 w-3.5 text-brand-300" />
          Call messages
        </p>
        <span className="text-[11px] text-slate-400">Staff only</span>
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {messages.length ? (
          messages.map((msg) => {
            const mine = msg.senderId === currentUserId;
            return (
              <div key={msg.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${
                    mine ? "bg-brand-500 text-white" : "bg-white text-ink"
                  }`}
                >
                  <p className={`text-[10px] uppercase tracking-wider ${mine ? "text-white/80" : "text-slate-500"}`}>
                    {mine ? "You" : msg.sender?.fullName || "Staff"} · {formatTime(msg.createdAt)}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words">{msg.body}</p>
                </div>
              </div>
            );
          })
        ) : (
          <p className="py-8 text-center text-sm text-slate-400">
            Send a message to the other person on this call.
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {readOnly ? (
        <p className="mt-3 text-center text-[11px] text-slate-400">Watching only — you cannot send messages.</p>
      ) : (
      <form className="mt-3 flex gap-2" onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={2000}
          disabled={disabled}
          placeholder={disabled ? "Chat starts when the call is live" : "Write a message…"}
          className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-ink placeholder:text-slate-400 outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/20 disabled:opacity-50"
        />
        <button
          disabled={disabled || !draft.trim()}
          className="btn bg-brand-500 px-4 text-white hover:bg-brand-400 disabled:opacity-40"
        >
          Send
        </button>
      </form>
      )}
    </div>
  );
}
