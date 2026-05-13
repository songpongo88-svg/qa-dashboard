import React, { useMemo, useState } from "react";
import PageHero from "./PageHero";

export type ChatAttachment = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};

export type ChatMessage = {
  id: string;
  createdAt: string;
  username: string;
  displayName: string;
  role: string;
  message: string;
  room: "team" | "private";
  toUsername?: string;
  toDisplayName?: string;
  attachment?: ChatAttachment;
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

const MAX_ATTACHMENT_SIZE_BYTES = 1.5 * 1024 * 1024;

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

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
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
  onSendMessage: (message: string, toUser?: OnlineUser, attachment?: ChatAttachment) => Promise<void>;
  onRefresh: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [selectedUsername, setSelectedUsername] = useState("team");
  const [attachment, setAttachment] = useState<ChatAttachment | undefined>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const privateUsers = onlineUsers.filter(
    (user) => user.username.toLowerCase() !== currentUser.username.toLowerCase()
  );
  const selectedUser = privateUsers.find((user) => user.username === selectedUsername);
  const selectedRoom = selectedUser ? "private" : "team";

  const visibleMessages = useMemo(() => {
    const myUsername = currentUser.username.toLowerCase();
    if (selectedRoom === "team") {
      return messages.filter((message) => message.room === "team");
    }

    const otherUsername = selectedUser?.username.toLowerCase() || "";
    return messages.filter((message) => {
      if (message.room !== "private") return false;
      const fromMeToOther = message.username.toLowerCase() === myUsername && String(message.toUsername || "").toLowerCase() === otherUsername;
      const fromOtherToMe = message.username.toLowerCase() === otherUsername && String(message.toUsername || "").toLowerCase() === myUsername;
      return fromMeToOther || fromOtherToMe;
    });
  }, [currentUser.username, messages, selectedRoom, selectedUser?.username]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      setError("Attachment is too large. Please use a file up to 1.5 MB.");
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setAttachment({
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        dataUrl,
      });
      setError("");
    } catch {
      setError("Attachment could not be loaded. Please try another file.");
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if ((!message && !attachment) || sending) return;

    setSending(true);
    setError("");
    try {
      await onSendMessage(message, selectedUser, attachment);
      setDraft("");
      setAttachment(undefined);
    } catch {
      setError("Message could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const roomTitle = selectedUser ? `Private Chat with ${selectedUser.displayName || selectedUser.username}` : "QA Dashboard Team Room";
  const roomSubtitle = selectedUser ? "Only you and this selected user will see this private thread in the dashboard UI." : "Messages here are visible to everyone in Team Chat.";

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f6f2ff] via-white to-[#edf7ff] px-5 py-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] overflow-hidden rounded-[30px] border border-violet-200 bg-white shadow-[0_18px_50px_rgba(88,28,135,0.10)]">
        <PageHero
          eyebrow="Team Chat"
          title="Online Team Chat"
          subtitle="Chat with everyone in the team room or open a private conversation with an online user."
          workspaceTitle="Live Room"
          workspaceSubtitle="Supports private chat plus image and file attachments"
        />

        <div className="grid gap-5 p-5 lg:grid-cols-[340px_minmax(0,1fr)]">
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
              <button
                type="button"
                onClick={() => setSelectedUsername("team")}
                className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${
                  selectedRoom === "team"
                    ? "border-violet-300 bg-white ring-4 ring-violet-100"
                    : "border-white bg-white hover:border-violet-200"
                }`}
              >
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-700">Team Room</div>
                <div className="mt-1 text-sm font-black text-slate-950">Everyone online</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">Shared chat room</div>
              </button>

              {privateUsers.map((user) => (
                <button
                  key={user.username}
                  type="button"
                  onClick={() => setSelectedUsername(user.username)}
                  className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${
                    selectedUsername === user.username
                      ? "border-sky-300 bg-white ring-4 ring-sky-100"
                      : "border-white bg-white hover:border-sky-200"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-950">{user.displayName || user.username}</div>
                      <div className="truncate text-xs font-semibold text-slate-500">{user.role}</div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs font-black text-sky-700">Open private chat</div>
                </button>
              ))}

              {!privateUsers.length ? (
                <div className="rounded-2xl border border-dashed border-violet-200 bg-white/70 p-5 text-center text-sm font-semibold text-slate-500">
                  No other online users detected yet.
                </div>
              ) : null}
            </div>
          </aside>

          <section className="flex min-h-[680px] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-950 px-5 py-4 text-white">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-200">
                {selectedRoom === "private" ? "Private Room" : "Team Room"}
              </div>
              <div className="mt-1 text-lg font-black">{roomTitle}</div>
              <div className="mt-1 text-xs font-semibold text-slate-300">{roomSubtitle}</div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/80 p-5">
              {visibleMessages.map((message) => {
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
                      {message.message ? <div className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.message}</div> : null}
                      {message.attachment ? (
                        <div className={`mt-3 rounded-2xl border p-3 ${isMine ? "border-white/20 bg-white/10" : "border-slate-200 bg-slate-50"}`}>
                          {message.attachment.type.startsWith("image/") ? (
                            <img
                              src={message.attachment.dataUrl}
                              alt={message.attachment.name}
                              className="max-h-72 rounded-xl object-contain"
                            />
                          ) : null}
                          <a
                            href={message.attachment.dataUrl}
                            download={message.attachment.name}
                            className={`mt-2 block text-sm font-black underline ${isMine ? "text-white" : "text-violet-700"}`}
                          >
                            {message.attachment.name}
                          </a>
                          <div className={`mt-1 text-[11px] font-semibold ${isMine ? "text-violet-100" : "text-slate-500"}`}>
                            {formatFileSize(message.attachment.size)}
                          </div>
                        </div>
                      ) : null}
                      <div className={`mt-2 text-[11px] font-semibold ${isMine ? "text-violet-100" : "text-slate-400"}`}>
                        {formatChatTime(message.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}

              {!visibleMessages.length ? (
                <div className="flex h-full min-h-[360px] items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white px-5 text-center text-sm font-semibold text-slate-500">
                  {selectedRoom === "private"
                    ? "No private messages in this conversation yet."
                    : "No team messages yet. Start the first conversation with the team."}
                </div>
              ) : null}
            </div>

            <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-4">
              {attachment ? (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-slate-950">{attachment.name}</div>
                    <div className="text-xs font-semibold text-slate-500">{formatFileSize(attachment.size)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAttachment(undefined)}
                    className="rounded-xl border border-sky-200 bg-white px-3 py-1 text-xs font-black text-sky-700"
                  >
                    Remove
                  </button>
                </div>
              ) : null}

              <div className="flex flex-col gap-3 md:flex-row">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={selectedRoom === "private" ? "Type a private message..." : "Type a message to everyone online..."}
                  className="min-h-[76px] flex-1 resize-none rounded-3xl border border-violet-100 bg-white px-5 py-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                />
                <div className="flex gap-3 md:flex-col">
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-3xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm font-black text-sky-700 transition hover:bg-sky-100">
                    Attach
                    <input type="file" className="hidden" onChange={handleFileChange} />
                  </label>
                  <button
                    type="submit"
                    disabled={sending || (!draft.trim() && !attachment)}
                    className="rounded-3xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-8 py-4 text-sm font-black text-white shadow-sm transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sending ? "Sending..." : "Send"}
                  </button>
                </div>
              </div>
              {error ? <div className="mt-3 text-sm font-bold text-rose-600">{error}</div> : null}
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
