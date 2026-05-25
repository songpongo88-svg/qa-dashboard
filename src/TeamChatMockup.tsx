import React, { useEffect, useMemo, useState } from "react";
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
  kind?: "message" | "call";
  callId?: string;
  callStatus?: "pending" | "accepted" | "declined" | "ended" | "missed";
  callRespondedBy?: string;
  edited?: boolean;
  deleted?: boolean;
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
const CALL_TIMEOUT_SECONDS = 45;
const EMOJI_OPTIONS = ["😀", "👍", "🙏", "🎉", "✅", "❗", "❤️", "🙌", "😊", "🔥"];

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

function formatChatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function getCallAgeSeconds(message: ChatMessage, now: number) {
  const startedAt = new Date(message.createdAt).getTime();
  if (Number.isNaN(startedAt)) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

function getCallStatusLabel(status?: ChatMessage["callStatus"]) {
  if (status === "accepted") return "Answered";
  if (status === "declined") return "Declined";
  if (status === "ended") return "Ended";
  if (status === "missed") return "Missed Call";
  return "Ringing";
}

function getCallStatusStyle(status?: ChatMessage["callStatus"]) {
  if (status === "accepted") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "declined") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "ended") return "border-slate-200 bg-slate-100 text-slate-600";
  if (status === "missed") return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-amber-200 bg-amber-100 text-amber-800";
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
  unreadCounts,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onStartCall,
  onCallResponse,
  onEndCall,
  onMarkRoomRead,
  onRefresh,
}: {
  currentUser: ChatUser;
  messages: ChatMessage[];
  onlineUsers: OnlineUser[];
  unreadCounts: Record<string, number>;
  onSendMessage: (message: string, toUser?: OnlineUser, attachment?: ChatAttachment) => Promise<void>;
  onEditMessage: (message: ChatMessage, nextMessage: string) => Promise<void>;
  onDeleteMessage: (message: ChatMessage) => Promise<void>;
  onStartCall: (toUser?: OnlineUser) => Promise<void>;
  onCallResponse: (message: ChatMessage, response: "accepted" | "declined") => Promise<void>;
  onEndCall: (message: ChatMessage) => Promise<void>;
  onMarkRoomRead: (roomKey: string) => void;
  onRefresh: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [selectedUsername, setSelectedUsername] = useState("team");
  const [attachment, setAttachment] = useState<ChatAttachment | undefined>();
  const [editingMessageId, setEditingMessageId] = useState("");
  const [editingDraft, setEditingDraft] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeCall, setActiveCall] = useState<ChatMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const privateUsers = onlineUsers.filter(
    (user) => user.username.toLowerCase() !== currentUser.username.toLowerCase()
  );
  const selectedUser = privateUsers.find((user) => user.username === selectedUsername);
  const selectedRoom = selectedUser ? "private" : "team";
  const selectedRoomKey = selectedUser ? `private:${selectedUser.username.toLowerCase()}` : "team";

  const visibleMessages = useMemo(() => {
    const myUsername = currentUser.username.toLowerCase();
    if (selectedRoom === "team") return messages.filter((message) => message.room === "team");

    const otherUsername = selectedUser?.username.toLowerCase() || "";
    return messages.filter((message) => {
      if (message.room !== "private") return false;
      const fromMeToOther = message.username.toLowerCase() === myUsername && String(message.toUsername || "").toLowerCase() === otherUsername;
      const fromOtherToMe = message.username.toLowerCase() === otherUsername && String(message.toUsername || "").toLowerCase() === myUsername;
      return fromMeToOther || fromOtherToMe;
    });
  }, [currentUser.username, messages, selectedRoom, selectedUser?.username]);

  const conversationStartedAt = visibleMessages[0]?.createdAt || "";
  const incomingCalls = useMemo(() => {
    const myUsername = currentUser.username.toLowerCase();
    return messages.filter((message) => {
      if (message.kind !== "call" || message.callStatus !== "pending") return false;
      if (getCallAgeSeconds(message, now) >= CALL_TIMEOUT_SECONDS) return false;
      if (message.username.toLowerCase() === myUsername) return false;
      if (message.room === "team") return true;
      return String(message.toUsername || "").toLowerCase() === myUsername;
    });
  }, [currentUser.username, messages, now]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    onMarkRoomRead(selectedRoomKey);
  }, [onMarkRoomRead, selectedRoomKey, visibleMessages.length]);

  const setAttachmentFromFile = async (file: File, pasted = false) => {
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      setError("Attachment is too large. Please use a file up to 1.5 MB.");
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setAttachment({
        name: file.name || (pasted ? `pasted-image-${Date.now()}.png` : `attachment-${Date.now()}`),
        type: file.type || "application/octet-stream",
        size: file.size,
        dataUrl,
      });
      setError("");
    } catch {
      setError("Attachment could not be loaded. Please try another file.");
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await setAttachmentFromFile(file);
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(event.clipboardData.files || []).find((item) => item.type.startsWith("image/"));
    if (!file) return;
    event.preventDefault();
    await setAttachmentFromFile(file, true);
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

  const handleEditSave = async (message: ChatMessage) => {
    const nextMessage = editingDraft.trim();
    if (!nextMessage) return;
    setSending(true);
    setError("");
    try {
      await onEditMessage(message, nextMessage);
      setEditingMessageId("");
      setEditingDraft("");
    } catch {
      setError("Message could not be edited. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const appendEmoji = (emoji: string) => {
    setDraft((value) => `${value}${emoji}`);
    setShowEmojiPicker(false);
  };

  const acceptCall = async (message: ChatMessage) => {
    setSending(true);
    setError("");
    try {
      await onCallResponse(message, "accepted");
      setActiveCall(message);
    } catch {
      setError("Call could not be accepted. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const declineCall = async (message: ChatMessage) => {
    setSending(true);
    setError("");
    try {
      await onCallResponse(message, "declined");
    } catch {
      setError("Call could not be declined. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const endCall = async () => {
    if (!activeCall) return;
    setSending(true);
    setError("");
    try {
      await onEndCall(activeCall);
      setActiveCall(null);
    } catch {
      setError("Call could not be ended. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const roomTitle = selectedUser ? `Private Chat with ${selectedUser.displayName || selectedUser.username}` : "QA Dashboard Team Room";
  const roomSubtitle = selectedUser ? "Only you and this selected user will see this private thread in the dashboard UI." : "Messages here are visible to everyone in Team Chat.";

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f6f2ff] via-white to-[#edf7ff] px-5 py-6 lg:px-8">
      {incomingCalls.length ? (
        <div className="fixed right-6 top-6 z-50 w-[360px] max-w-[calc(100vw-3rem)] rounded-[28px] border border-violet-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.25)]">
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-700">Incoming Call</div>
          <div className="mt-2 text-xl font-black text-slate-950">
            {incomingCalls[0].displayName || incomingCalls[0].username}
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-500">
            {incomingCalls[0].room === "team" ? "Group call in Team Room" : "Private call"}
          </div>
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-black text-amber-800">
            Auto missed in {Math.max(0, CALL_TIMEOUT_SECONDS - getCallAgeSeconds(incomingCalls[0], now))}s
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => void acceptCall(incomingCalls[0])}
              disabled={sending}
              className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => void declineCall(incomingCalls[0])}
              disabled={sending}
              className="flex-1 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-700 disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        </div>
      ) : null}

      {activeCall ? (
        <div className="fixed inset-x-0 bottom-6 z-50 mx-auto w-[520px] max-w-[calc(100vw-3rem)] rounded-[28px] border border-emerald-200 bg-slate-950 p-5 text-white shadow-[0_24px_70px_rgba(15,23,42,0.35)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300">Call Active</div>
              <div className="mt-1 text-lg font-black">
                {activeCall.room === "team" ? "Team group call" : `Private call with ${activeCall.displayName || activeCall.username}`}
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-300">Audio/video bridge placeholder is active in QA Dashboard.</div>
            </div>
            <button
              type="button"
              onClick={() => void endCall()}
              disabled={sending}
              className="rounded-2xl bg-rose-600 px-5 py-3 text-sm font-black text-white transition hover:bg-rose-700 disabled:opacity-50"
            >
              End Call
            </button>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-[1500px] overflow-hidden rounded-[30px] border border-violet-200 bg-white shadow-[0_18px_50px_rgba(88,28,135,0.10)]">
        <PageHero
          eyebrow="Team Chat"
          title="Online Team Chat"
          subtitle="Chat with everyone, open private rooms, paste screenshots, send emoji, and create call invites."
          workspaceTitle="Live Room"
          workspaceSubtitle="Unread badge, edit/delete, date grouping, sound alerts, and call invites"
        />

        <div className="grid gap-5 p-5 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="rounded-[28px] border border-violet-100 bg-violet-50/60 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-700">Online Now</div>
                <div className="mt-2 text-4xl font-black text-slate-950">{onlineUsers.length}</div>
              </div>
              <button type="button" onClick={onRefresh} className="rounded-2xl border border-violet-200 bg-white px-4 py-2 text-sm font-black text-violet-700 transition hover:bg-violet-100">
                Refresh
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => setSelectedUsername("team")}
                className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${selectedRoom === "team" ? "border-violet-300 bg-white ring-4 ring-violet-100" : "border-white bg-white hover:border-violet-200"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-700">Team Room</div>
                  {unreadCounts.team ? <span className="rounded-full bg-violet-700 px-2 py-0.5 text-xs font-black text-white">{unreadCounts.team}</span> : null}
                </div>
                <div className="mt-1 text-sm font-black text-slate-950">Everyone online</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">Shared chat room</div>
              </button>

              {privateUsers.map((user) => {
                const roomKey = `private:${user.username.toLowerCase()}`;
                return (
                  <button
                    key={user.username}
                    type="button"
                    onClick={() => setSelectedUsername(user.username)}
                    className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${selectedUsername === user.username ? "border-sky-300 bg-white ring-4 ring-sky-100" : "border-white bg-white hover:border-sky-200"}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-slate-950">{user.displayName || user.username}</div>
                        <div className="truncate text-xs font-semibold text-slate-500">{user.role}</div>
                      </div>
                      {unreadCounts[roomKey] ? <span className="ml-auto rounded-full bg-sky-600 px-2 py-0.5 text-xs font-black text-white">{unreadCounts[roomKey]}</span> : null}
                    </div>
                    <div className="mt-3 text-xs font-black text-sky-700">Open private chat</div>
                  </button>
                );
              })}

              {!privateUsers.length ? (
                <div className="rounded-2xl border border-dashed border-violet-200 bg-white/70 p-5 text-center text-sm font-semibold text-slate-500">
                  No other online users detected yet.
                </div>
              ) : null}
            </div>
          </aside>

          <section className="flex min-h-[720px] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-950 px-5 py-4 text-white">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-200">{selectedRoom === "private" ? "Private Room" : "Team Room"}</div>
              <div className="mt-1 text-lg font-black">{roomTitle}</div>
              <div className="mt-1 text-xs font-semibold text-slate-300">{roomSubtitle}</div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void onStartCall(selectedUser)}
                  className="rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-black text-white transition hover:bg-white/20"
                >
                  {selectedUser ? "Call User" : "Start Group Call"}
                </button>
                {conversationStartedAt ? <span className="text-xs font-semibold text-slate-300">Conversation started {formatChatTime(conversationStartedAt)}</span> : null}
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/80 p-5">
              {visibleMessages.map((message, index) => {
                const isMine = message.username.toLowerCase() === currentUser.username.toLowerCase();
                const previous = visibleMessages[index - 1];
                const showDateLabel = !previous || formatChatDateLabel(previous.createdAt) !== formatChatDateLabel(message.createdAt);

                return (
                  <React.Fragment key={message.id}>
                    {showDateLabel ? (
                      <div className="flex items-center justify-center">
                        <span className="rounded-full border border-slate-200 bg-white px-4 py-1 text-xs font-black text-slate-500 shadow-sm">
                          {formatChatDateLabel(message.createdAt)}
                        </span>
                      </div>
                    ) : null}
                    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[78%] rounded-[24px] border px-5 py-4 shadow-sm ${
                          message.kind === "call"
                            ? "border-amber-200 bg-amber-50 text-amber-800"
                            : isMine
                              ? "border-violet-200 bg-gradient-to-r from-violet-700 to-fuchsia-600 text-white"
                              : "border-slate-200 bg-white text-slate-900"
                        }`}
                      >
                        <div className={`text-xs font-black ${isMine && message.kind !== "call" ? "text-violet-100" : "text-violet-700"}`}>
                          {message.displayName || message.username} · {message.role}
                        </div>
                        {editingMessageId === message.id ? (
                          <div className="mt-3 space-y-2">
                            <textarea value={editingDraft} onChange={(event) => setEditingDraft(event.target.value)} className="min-h-[80px] w-full rounded-2xl border border-violet-200 px-3 py-2 text-sm font-semibold text-slate-900 outline-none" />
                            <div className="flex gap-2">
                              <button type="button" onClick={() => void handleEditSave(message)} className="rounded-xl bg-violet-700 px-3 py-1 text-xs font-black text-white">Save</button>
                              <button type="button" onClick={() => setEditingMessageId("")} className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-600">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {message.message ? <div className={`mt-2 whitespace-pre-wrap text-sm leading-6 ${message.deleted ? "italic opacity-70" : ""}`}>{message.message}</div> : null}
                            {message.kind === "call" ? (
                              <div className={`mt-3 rounded-2xl border px-4 py-3 text-sm font-black ${getCallStatusStyle(message.callStatus)}`}>
                                {getCallStatusLabel(message.callStatus)}
                                {message.callRespondedBy ? ` by ${message.callRespondedBy}` : ""}
                                {message.callStatus === "pending" ? ` · no answer after ${CALL_TIMEOUT_SECONDS}s` : ""}
                              </div>
                            ) : null}
                            {message.attachment ? (
                              <div className={`mt-3 rounded-2xl border p-3 ${isMine ? "border-white/20 bg-white/10" : "border-slate-200 bg-slate-50"}`}>
                                {message.attachment.type.startsWith("image/") ? <img src={message.attachment.dataUrl} alt={message.attachment.name} className="max-h-72 rounded-xl object-contain" /> : null}
                                <a href={message.attachment.dataUrl} download={message.attachment.name} className={`mt-2 block text-sm font-black underline ${isMine ? "text-white" : "text-violet-700"}`}>{message.attachment.name}</a>
                                <div className={`mt-1 text-[11px] font-semibold ${isMine ? "text-violet-100" : "text-slate-500"}`}>{formatFileSize(message.attachment.size)}</div>
                              </div>
                            ) : null}
                            {isMine && !message.deleted && message.kind !== "call" ? (
                              <div className={`mt-3 flex gap-2 text-[11px] font-black ${isMine ? "text-violet-100" : "text-slate-500"}`}>
                                <button type="button" onClick={() => { setEditingMessageId(message.id); setEditingDraft(message.message); }} className="underline">Edit</button>
                                <button type="button" onClick={() => void onDeleteMessage(message)} className="underline">Delete</button>
                              </div>
                            ) : null}
                            {!isMine && message.kind === "call" && message.callStatus === "pending" && getCallAgeSeconds(message, now) < CALL_TIMEOUT_SECONDS ? (
                              <div className="mt-3 flex gap-2">
                                <button type="button" onClick={() => void acceptCall(message)} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white">Accept</button>
                                <button type="button" onClick={() => void declineCall(message)} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white">Decline</button>
                              </div>
                            ) : null}
                          </>
                        )}
                        <div className={`mt-2 text-[11px] font-semibold ${isMine && message.kind !== "call" ? "text-violet-100" : "text-slate-400"}`}>
                          {formatChatTime(message.createdAt)}
                          {message.edited ? " · edited" : ""}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}

              {!visibleMessages.length ? (
                <div className="flex h-full min-h-[360px] items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white px-5 text-center text-sm font-semibold text-slate-500">
                  {selectedRoom === "private" ? "No private messages in this conversation yet." : "No team messages yet. Start the first conversation with the team."}
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
                  <button type="button" onClick={() => setAttachment(undefined)} className="rounded-xl border border-sky-200 bg-white px-3 py-1 text-xs font-black text-sky-700">Remove</button>
                </div>
              ) : null}

              <div className="flex flex-col gap-3 md:flex-row">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onPaste={handlePaste}
                  placeholder={selectedRoom === "private" ? "Type a private message or paste an image..." : "Type a message to everyone online or paste an image..."}
                  className="min-h-[76px] flex-1 resize-none rounded-3xl border border-violet-100 bg-white px-5 py-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                />
                <div className="flex gap-3 md:flex-col">
                  <div className="relative">
                    <button type="button" onClick={() => setShowEmojiPicker((value) => !value)} className="w-full rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-black text-amber-700 transition hover:bg-amber-100">Emoji</button>
                    {showEmojiPicker ? (
                      <div className="absolute bottom-full right-0 z-20 mb-2 grid w-48 grid-cols-5 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                        {EMOJI_OPTIONS.map((emoji) => <button key={emoji} type="button" onClick={() => appendEmoji(emoji)} className="rounded-xl p-2 text-lg hover:bg-violet-50">{emoji}</button>)}
                      </div>
                    ) : null}
                  </div>
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-3xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm font-black text-sky-700 transition hover:bg-sky-100">
                    Attach
                    <input type="file" className="hidden" onChange={handleFileChange} />
                  </label>
                  <button type="submit" disabled={sending || (!draft.trim() && !attachment)} className="rounded-3xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-8 py-4 text-sm font-black text-white shadow-sm transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50">
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
