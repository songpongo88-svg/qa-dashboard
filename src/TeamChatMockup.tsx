import React, { useState } from "react";
import PageHero from "./PageHero";

export type ChatMessage = {
  id: string;
  createdAt: string;
  username: string;
  displayName: string;
  role: string;
  message: string;
};

export type OnlineUser = {
  username: string;
  displayName: string;
  role: string;
  agentName: string;
  lastSeenAt: string;
};

type ChatUser = {
  username: string;
  displayName: string;
  role: string;
  agentName: string;
};

function formatChatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TeamChatMockup({
  currentUser,
  messages,
  onlineUsers,
  onSendMessage,
  onRefresh,
}: {
  currentUser: ChatUser;
  messages: ChatMessage[];
  onlineUsers: OnlineUser[];
  onSendMessage: (message: string) => Promise<void>;
  onRefresh: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;

    setSending(true);
    setError("");
    try {
      await onSendMessage(message);
      setDraft("");
    } catch {
      setError("Message could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f6f2ff] via-white to-[#edf7ff] px-5 py-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] overflow-hidden rounded-[30px] border border-violet-200 bg-white shadow-[0_18px_50px_rgba(88,28,135,0.10)]">
        <PageHero
          eyebrow="Team Chat"
          title="Online Team Chat"
          subtitle="A shared workspace chat for people currently using the QA Dashboard."
          workspaceTitle="Live Room"
          workspaceSubtitle="See who is online and send quick messages to the team"
        />

        <div className="grid gap-5 p-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-[28px] border border-violet-100 bg-violet-50/60 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-700">Online Now</div>
                <div className="mt-2 text-4xl font-black text-slate-950">{onlineUsers.length}</div>
              </div>
              <button
                type="button"
                onClick={onRefresh}
                className="rounded-2xl border border-violet-200 bg-white px-4 py-2 text-sm font-black text-violet-700 transition hover:bg-violet-100"
              >
                Refresh
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {onlineUsers.map((user) => (
                <div key={user.username} className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-950">{user.displayName || user.username}</div>
                      <div className="truncate text-xs font-semibold text-slate-500">{user.role}</div>
                    </div>
                  </div>
                </div>
              ))}

              {!onlineUsers.length ? (
                <div className="rounded-2xl border border-dashed border-violet-200 bg-white/70 p-5 text-center text-sm font-semibold text-slate-500">
                  No online users detected yet.
                </div>
              ) : null}
            </div>
          </aside>

          <section className="flex min-h-[620px] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-950 px-5 py-4 text-white">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-200">Team Room</div>
              <div className="mt-1 text-lg font-black">QA Dashboard Chat</div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/80 p-5">
              {messages.map((message) => {
                const isMine = message.username.toLowerCase() === currentUser.username.toLowerCase();
                return (
                  <div key={message.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[78%] rounded-[24px] border px-5 py-4 shadow-sm ${
                        isMine
                          ? "border-violet-200 bg-gradient-to-r from-violet-700 to-fuchsia-600 text-white"
                          : "border-slate-200 bg-white text-slate-900"
                      }`}
                    >
                      <div className={`text-xs font-black ${isMine ? "text-violet-100" : "text-violet-700"}`}>
                        {message.displayName || message.username} · {message.role}
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.message}</div>
                      <div className={`mt-2 text-[11px] font-semibold ${isMine ? "text-violet-100" : "text-slate-400"}`}>
                        {formatChatTime(message.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}

              {!messages.length ? (
                <div className="flex h-full min-h-[360px] items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white text-center text-sm font-semibold text-slate-500">
                  No messages yet. Start the first conversation with the team.
                </div>
              ) : null}
            </div>

            <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 md:flex-row">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Type a message to everyone online..."
                  className="min-h-[76px] flex-1 resize-none rounded-3xl border border-violet-100 bg-white px-5 py-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="rounded-3xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-8 py-4 text-sm font-black text-white shadow-sm transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>
              {error ? <div className="mt-3 text-sm font-bold text-rose-600">{error}</div> : null}
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
