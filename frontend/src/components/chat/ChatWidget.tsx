import { MessageCircle, Send, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { cn, formatTime } from "../../lib/utils";
import type { Message } from "../../types";
import { isWhatsAppConfigured } from "../../lib/chatConfig";

export function ChatWidget({
  open,
  onOpen,
  onClose,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try {
      const msgs = await api.messages();
      setMessages(msgs);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void load().finally(() => setLoading(false));
    void api.markRead().catch(() => undefined);
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [open, load]);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    if (body.length > 2000) {
      setError("Message is too long (max 2000 characters).");
      return;
    }
    setSending(true);
    setError(null);
    const optimistic: Message = {
      id: Date.now(),
      body,
      sender: "user",
      created_at: new Date().toISOString(),
      status: "sent",
      read_at: null,
    };
    setMessages((m) => [...m, optimistic]);
    setDraft("");
    try {
      const saved = await api.sendMessage(body);
      setMessages((m) => m.map((x) => (x.id === optimistic.id ? saved : x)));
    } catch (err) {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setError(err instanceof ApiError ? err.message : "Failed to send message.");
      setDraft(body);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Floating launcher */}
      <button
        onClick={onOpen}
        className={cn(
          "fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_10px_30px_-6px_rgba(37,211,102,0.6)] transition-transform hover:scale-105 active:scale-95",
          open && "pointer-events-none opacity-0"
        )}
        aria-label="Speak to Admin"
        data-chat-launcher
      >
        <MessageCircle className="h-6 w-6" />
        <span className="absolute right-0 top-0 h-3.5 w-3.5 animate-pulse-dot rounded-full bg-bearish ring-2 ring-navy-950" />
      </button>

      {/* Panel */}
      <div
        className={cn(
          "fixed bottom-0 right-0 z-50 flex w-full flex-col overflow-hidden border border-line bg-navy-900 shadow-2xl transition-all duration-200 sm:bottom-5 sm:right-5 sm:w-[380px] sm:rounded-2xl",
          "h-[100dvh] sm:h-[560px] sm:max-h-[calc(100dvh-2.5rem)]",
          open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
        )}
        role="dialog"
        aria-label="Speak to Admin"
      >
        <div className="flex items-center gap-3 bg-[#075E54] px-4 py-3.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">Speak to Admin</p>
            <p className="flex items-center gap-1.5 text-[11px] text-emerald-100">
              <span className="h-1.5 w-1.5 rounded-full bg-bullish" />
              Usually replies within a few hours
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/80 hover:bg-white/10"
            aria-label="Close chat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className="flex-1 space-y-3 overflow-y-auto bg-navy-950/60 px-4 py-4"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
          ref={listRef}
        >
          {loading && messages.length === 0 ? (
            <p className="pt-8 text-center text-xs text-slate-500">Loading conversation…</p>
          ) : messages.length === 0 ? (
            <div className="mx-auto mt-10 max-w-[16rem] rounded-2xl border border-line bg-navy-850/80 px-4 py-5 text-center">
              <p className="text-sm font-medium text-slate-200">Start a conversation</p>
              <p className="mt-1 text-xs text-slate-500">
                Send a message to the administrator. This is an internal portal message — it is
                not sent through WhatsApp.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={cn("flex", m.sender === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                    m.sender === "user"
                      ? "rounded-br-md bg-[#056162] text-white"
                      : "rounded-bl-md bg-navy-750 text-slate-100"
                  )}
                >
                  {m.sender === "admin" && (
                    <p className="mb-0.5 text-[10px] font-semibold text-bullish">Administrator</p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p
                    className={cn(
                      "mt-1 flex items-center justify-end gap-1 text-[10px]",
                      m.sender === "user" ? "text-emerald-100/70" : "text-slate-400"
                    )}
                  >
                    {formatTime(m.created_at)}
                    {m.sender === "user" && (
                      <span className="capitalize">· {m.status}</span>
                    )}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {error && (
          <p className="border-t border-bearish/25 bg-bearish/10 px-4 py-2 text-xs text-bearish">
            {error}
          </p>
        )}

        <div className="flex items-end gap-2 border-t border-line bg-navy-850 px-3 py-3">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Type a message…"
            className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-line bg-navy-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-bullish/60 focus:outline-none"
          />
          <button
            onClick={() => void send()}
            disabled={sending || !draft.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#25D366] text-white transition-colors hover:bg-green-400 disabled:opacity-40"
            aria-label="Send message"
          >
            {sending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>

        <p className="bg-navy-850 px-4 pb-2.5 text-center text-[10px] text-slate-500">
          {isWhatsAppConfigured
            ? "WhatsApp integration configured."
            : "Internal messaging portal — WhatsApp is not connected."}
        </p>
      </div>
    </>
  );
}
