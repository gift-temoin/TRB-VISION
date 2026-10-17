import { MessageSquare, Send, UserCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { cn, formatDateTime, formatTime, timeAgo } from "../../lib/utils";
import type { Conversation, Message } from "../../types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState, ErrorState } from "../ui/States";
import { LoadingState } from "../ui/Spinner";

export function AdminMessages() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const convos = await api.adminConversations();
      setConversations(convos);
      setActiveId((cur) => cur ?? convos[0]?.user_id ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load conversations.");
    }
  }, []);

  useEffect(() => {
    void loadConversations().finally(() => setLoading(false));
    const t = setInterval(() => void loadConversations(), 15000);
    return () => clearInterval(t);
  }, [loadConversations]);

  const loadThread = useCallback(async (userId: number) => {
    setThreadLoading(true);
    try {
      const msgs = await api.adminMessages(userId);
      setMessages(msgs);
      await api.adminMarkRead(userId).catch(() => undefined);
      setConversations((list) =>
        list.map((c) => (c.user_id === userId ? { ...c, unread_for_admin: 0 } : c))
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load messages.");
    } finally {
      setThreadLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeId) void loadThread(activeId);
  }, [activeId, loadThread]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !activeId || sending) return;
    setSending(true);
    try {
      const saved = await api.adminReply(activeId, body);
      setMessages((m) => [...m, saved]);
      setDraft("");
      void loadConversations();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send reply.");
    } finally {
      setSending(false);
    }
  };

  const approve = async (userId: number) => {
    try {
      await api.adminApproveUser(userId);
      setConversations((list) =>
        list.map((c) =>
          c.user_id === userId ? { ...c, is_verified: true, is_active: true } : c
        )
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to approve user.");
    }
  };

  if (loading) return <LoadingState label="Loading inbox…" />;
  if (error && conversations.length === 0)
    return <ErrorState description={error} onRetry={() => void loadConversations()} />;

  const active = conversations.find((c) => c.user_id === activeId);
  const totalUnread = conversations.reduce((n, c) => n + c.unread_for_admin, 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="flex max-h-[640px] flex-col p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-bullish" />
            <span className="text-sm font-semibold text-white">Inbox</span>
          </div>
          {totalUnread > 0 && <Badge tone="bear">{totalUnread} unread</Badge>}
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">No conversations yet.</p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.user_id}
                onClick={() => setActiveId(c.user_id)}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-line/60 px-4 py-3 text-left transition-colors hover:bg-white/5",
                  activeId === c.user_id && "bg-bullish/8"
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-xs font-semibold text-slate-300">
                  {(c.user_name ?? "U").slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-white">
                      {c.user_name ?? `User #${c.user_id}`}
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-500">
                      {timeAgo(c.last_at)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-slate-400">
                      {c.last_message ?? "No messages"}
                    </span>
                    {c.unread_for_admin > 0 && (
                      <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-bearish px-1 text-[10px] font-bold text-white">
                        {c.unread_for_admin}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </Card>

      <Card className="flex max-h-[640px] flex-col p-0">
        {!active ? (
          <EmptyState
            title="Select a conversation"
            description="Choose a user from the inbox to read and reply to their messages."
            icon={<MessageSquare className="h-5 w-5" />}
            className="m-4 border-0"
          />
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white">{active.user_name}</p>
                  {active.is_verified ? (
                    <Badge tone="info">Verified</Badge>
                  ) : (
                    <Badge tone="neutral">Pending approval</Badge>
                  )}
                  {!active.is_active && <Badge tone="danger">Disabled</Badge>}
                </div>
                <p className="text-[11px] text-slate-500">
                  Last activity {formatDateTime(active.last_at)}
                </p>
              </div>
              {!active.is_verified && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void approve(active.user_id)}
                  icon={<UserCheck className="h-3.5 w-3.5" />}
                >
                  Approve
                </Button>
              )}
            </div>

            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-navy-950/40 px-5 py-4">
              {threadLoading ? (
                <p className="pt-6 text-center text-xs text-slate-500">Loading messages…</p>
              ) : messages.length === 0 ? (
                <p className="pt-6 text-center text-xs text-slate-500">
                  No messages in this conversation yet.
                </p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn("flex", m.sender === "admin" ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                        m.sender === "admin"
                          ? "rounded-br-md bg-bullish/15 text-emerald-50"
                          : "rounded-bl-md bg-navy-750 text-slate-100"
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className="mt-1 text-right text-[10px] text-slate-500">
                        {formatTime(m.created_at)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-end gap-2 border-t border-line px-4 py-3">
              <textarea
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
                placeholder="Reply to user…"
                className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-line bg-navy-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-bullish/60 focus:outline-none"
              />
              <button
                onClick={() => void send()}
                disabled={sending || !draft.trim()}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-bullish text-navy-950 transition-colors hover:bg-green-400 disabled:opacity-40"
                aria-label="Send reply"
              >
                {sending ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-navy-950 border-t-transparent" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
