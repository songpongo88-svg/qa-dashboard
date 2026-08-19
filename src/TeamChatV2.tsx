import React, { useEffect, useMemo, useRef, useState } from "react";
import PageHero from "./PageHero";
import { fetchStoredProfilePhoto } from "./profilePhotoStore";
import type { ChatAttachment, ChatMessage, OnlineUser, WebRtcSignal } from "./TeamChatMockup";

type ChatUser = {
  username: string;
  displayName: string;
  role: string;
  agentName: string;
};

type DirectoryUser = {
  username: string;
  displayName: string;
  role: string;
  agentName?: string;
  teamName?: string;
  teamLead?: string;
  status?: string;
};

type ContactRow = DirectoryUser & {
  online: boolean;
  lastSeenAt: string;
  lastMessageAt: string;
  lastMessageText: string;
  unread: number;
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

function formatShortTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit" });
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

function initials(value: string) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("");
}

export default function TeamChatV2({
  currentUser,
  messages,
  onlineUsers,
  directoryUsers = [],
  unreadCounts,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onStartCall,
  onCallResponse,
  onEndCall,
  webRtcSignals,
  onSendWebRtcSignal,
  onMarkRoomRead,
  onRefresh,
}: {
  currentUser: ChatUser;
  messages: ChatMessage[];
  onlineUsers: OnlineUser[];
  directoryUsers?: DirectoryUser[];
  unreadCounts: Record<string, number>;
  onSendMessage: (message: string, toUser?: OnlineUser, attachment?: ChatAttachment) => Promise<void>;
  onEditMessage: (message: ChatMessage, nextMessage: string) => Promise<void>;
  onDeleteMessage: (message: ChatMessage) => Promise<void>;
  onStartCall: (toUser?: OnlineUser) => Promise<string | undefined>;
  onCallResponse: (message: ChatMessage, response: "accepted" | "declined") => Promise<void>;
  onEndCall: (message: ChatMessage) => Promise<void>;
  webRtcSignals: WebRtcSignal[];
  onSendWebRtcSignal: (signal: Omit<WebRtcSignal, "id" | "createdAt" | "fromUsername">) => Promise<void>;
  onMarkRoomRead: (roomKey: string) => void;
  onRefresh: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [selectedUsername, setSelectedUsername] = useState("team");
  const [search, setSearch] = useState("");
  const [contactView, setContactView] = useState<"recent" | "people" | "teams">("recent");
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [attachment, setAttachment] = useState<ChatAttachment | undefined>();
  const [editingMessageId, setEditingMessageId] = useState("");
  const [editingDraft, setEditingDraft] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedProfilePhoto, setSelectedProfilePhoto] = useState("");
  const [activeCall, setActiveCall] = useState<ChatMessage | null>(null);
  const [voiceCall, setVoiceCall] = useState<{
    callId: string;
    peerUsername: string;
    peerDisplayName: string;
    status: "dialing" | "connecting" | "connected";
    muted: boolean;
    error?: string;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const processedSignalIdsRef = useRef<Set<string>>(new Set());
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const myUsername = currentUser.username.trim().toLowerCase();
  const onlineMap = useMemo(() => {
    const map = new Map<string, OnlineUser>();
    onlineUsers.forEach((user) => map.set(user.username.trim().toLowerCase(), user));
    return map;
  }, [onlineUsers]);

  const contacts = useMemo(() => {
    const base = new Map<string, DirectoryUser>();
    directoryUsers.forEach((user) => {
      const key = String(user.username || "").trim().toLowerCase();
      if (!key || key === myUsername) return;
      if (String(user.status || "Active").toLowerCase().includes("suspend")) return;
      base.set(key, user);
    });
    onlineUsers.forEach((user) => {
      const key = user.username.trim().toLowerCase();
      if (!key || key === myUsername) return;
      if (!base.has(key)) base.set(key, user);
    });
    messages.forEach((message) => {
      if (message.room !== "private") return;
      const sender = message.username.trim().toLowerCase();
      const target = String(message.toUsername || "").trim().toLowerCase();
      const peer = sender === myUsername ? target : sender;
      if (!peer || peer === myUsername || base.has(peer)) return;
      base.set(peer, {
        username: sender === peer ? message.username : String(message.toUsername || peer),
        displayName: sender === peer ? message.displayName : String(message.toDisplayName || message.toUsername || peer),
        role: sender === peer ? message.role : "",
      });
    });

    return Array.from(base.entries()).map(([key, user]): ContactRow => {
      const online = onlineMap.get(key);
      const privateMessages = messages.filter((message) => {
        if (message.room !== "private") return false;
        const sender = message.username.trim().toLowerCase();
        const target = String(message.toUsername || "").trim().toLowerCase();
        return (sender === myUsername && target === key) || (sender === key && target === myUsername);
      });
      const lastMessage = [...privateMessages].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      const roomKey = `private:${key}`;
      const fallbackText = lastMessage?.attachment ? `Attachment: ${lastMessage.attachment.name}` : lastMessage?.kind === "call" ? getCallStatusLabel(lastMessage.callStatus) : "";
      return {
        ...user,
        username: user.username,
        displayName: user.displayName || user.agentName || user.username,
        online: Boolean(online),
        lastSeenAt: online?.lastSeenAt || "",
        lastMessageAt: lastMessage?.createdAt || "",
        lastMessageText: String(lastMessage?.message || fallbackText || "").replace(/\s+/g, " ").trim(),
        unread: Number(unreadCounts[roomKey] || 0),
      };
    }).sort((a, b) => {
      const aTime = new Date(a.lastMessageAt || 0).getTime();
      const bTime = new Date(b.lastMessageAt || 0).getTime();
      if (aTime !== bTime) return bTime - aTime;
      if (a.online !== b.online) return a.online ? -1 : 1;
      return a.displayName.localeCompare(b.displayName, "th");
    });
  }, [directoryUsers, messages, myUsername, onlineMap, onlineUsers, unreadCounts]);

  const selectedUser = contacts.find((user) => user.username.trim().toLowerCase() === selectedUsername.trim().toLowerCase());
  const selectedRoom = selectedUser ? "private" : "team";
  const selectedRoomKey = selectedUser ? `private:${selectedUser.username.toLowerCase()}` : "team";

  const visibleMessages = useMemo(() => {
    if (selectedRoom === "team") return messages.filter((message) => message.room === "team");
    const otherUsername = selectedUser?.username.toLowerCase() || "";
    return messages.filter((message) => {
      if (message.room !== "private") return false;
      const fromMeToOther = message.username.toLowerCase() === myUsername && String(message.toUsername || "").toLowerCase() === otherUsername;
      const fromOtherToMe = message.username.toLowerCase() === otherUsername && String(message.toUsername || "").toLowerCase() === myUsername;
      return fromMeToOther || fromOtherToMe;
    });
  }, [messages, myUsername, selectedRoom, selectedUser?.username]);

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    let rows = contacts;
    if (contactView === "recent") rows = rows.filter((user) => user.lastMessageAt || user.unread > 0 || user.online);
    if (query) {
      rows = rows.filter((user) => [user.displayName, user.username, user.role, user.teamName, user.teamLead]
        .some((value) => String(value || "").toLowerCase().includes(query)));
    }
    return rows;
  }, [contactView, contacts, search]);

  const teamGroups = useMemo(() => {
    const map = new Map<string, ContactRow[]>();
    filteredContacts.forEach((user) => {
      const team = String(user.teamName || "No Team").trim() || "No Team";
      const list = map.get(team) || [];
      list.push(user);
      map.set(team, list);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "th"));
  }, [filteredContacts]);

  const sharedAttachments = useMemo(() => visibleMessages.filter((message) => message.attachment).slice().reverse(), [visibleMessages]);
  const sharedImages = sharedAttachments.filter((message) => message.attachment?.type.startsWith("image/"));

  useEffect(() => {
    onMarkRoomRead(selectedRoomKey);
  }, [onMarkRoomRead, selectedRoomKey, visibleMessages.length]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [selectedRoomKey, visibleMessages.length]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedUser) {
      setSelectedProfilePhoto("");
      return;
    }
    void fetchStoredProfilePhoto(selectedUser.username).then((photo) => {
      if (!cancelled) setSelectedProfilePhoto(photo?.photoDataUrl || "");
    });
    return () => { cancelled = true; };
  }, [selectedUser?.username]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const incomingCalls = useMemo(() => messages.filter((message) => {
    if (message.kind !== "call" || message.callStatus !== "pending") return false;
    if (getCallAgeSeconds(message, now) >= CALL_TIMEOUT_SECONDS) return false;
    if (message.username.toLowerCase() === myUsername) return false;
    if (message.room === "team") return true;
    return String(message.toUsername || "").toLowerCase() === myUsername;
  }), [messages, myUsername, now]);

  const cleanupVoiceCall = () => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    processedSignalIdsRef.current.clear();
    setVoiceCall(null);
  };

  useEffect(() => cleanupVoiceCall, []);

  const getLocalAudioStream = async () => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone is not supported by this browser.");
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    return stream;
  };

  const createPeerConnection = (callId: string, peerUsername: string) => {
    peerConnectionRef.current?.close();
    const connection = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });
    connection.onicecandidate = (event) => {
      if (!event.candidate) return;
      void onSendWebRtcSignal({ callId, toUsername: peerUsername, type: "candidate", payload: event.candidate.toJSON() });
    };
    connection.ontrack = (event) => {
      const [stream] = event.streams;
      if (remoteAudioRef.current && stream) {
        remoteAudioRef.current.srcObject = stream;
        void remoteAudioRef.current.play().catch(() => undefined);
      }
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "connected") {
        setVoiceCall((call) => call ? { ...call, status: "connected", error: "" } : call);
      }
      if (connection.connectionState === "failed" || connection.connectionState === "disconnected") {
        setVoiceCall((call) => call ? { ...call, error: "Voice connection dropped. Please end and call again." } : call);
      }
    };
    peerConnectionRef.current = connection;
    return connection;
  };

  const preparePeer = async (callId: string, peerUsername: string) => {
    const stream = await getLocalAudioStream();
    const connection = createPeerConnection(callId, peerUsername);
    stream.getTracks().forEach((track) => connection.addTrack(track, stream));
    return connection;
  };

  useEffect(() => {
    if (!voiceCall) return;
    const connection = peerConnectionRef.current;
    if (!connection) return;
    const relevantSignals = webRtcSignals.filter((signal) => {
      if (signal.callId !== voiceCall.callId) return false;
      if (signal.fromUsername.toLowerCase() === myUsername) return false;
      if (signal.toUsername && signal.toUsername.toLowerCase() !== myUsername) return false;
      return !processedSignalIdsRef.current.has(signal.id);
    });

    relevantSignals.forEach((signal) => {
      processedSignalIdsRef.current.add(signal.id);
      void (async () => {
        try {
          if (signal.type === "offer") {
            await connection.setRemoteDescription(new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit));
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            await onSendWebRtcSignal({
              callId: signal.callId,
              toUsername: signal.fromUsername,
              type: "answer",
              payload: { type: answer.type || "answer", sdp: answer.sdp || "" },
            });
            setVoiceCall((call) => call ? { ...call, status: "connecting", error: "" } : call);
          } else if (signal.type === "answer") {
            await connection.setRemoteDescription(new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit));
            setVoiceCall((call) => call ? { ...call, status: "connecting", error: "" } : call);
          } else if (signal.type === "candidate") {
            await connection.addIceCandidate(new RTCIceCandidate(signal.payload as RTCIceCandidateInit));
          } else if (signal.type === "hangup") {
            cleanupVoiceCall();
            setActiveCall(null);
          }
        } catch {
          setVoiceCall((call) => call ? { ...call, error: "Voice setup failed. Please end and try again." } : call);
        }
      })();
    });
  }, [myUsername, onSendWebRtcSignal, voiceCall, webRtcSignals]);

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

  const handleSubmit = async () => {
    const message = draft.trim();
    if ((!message && !attachment) || sending) return;
    setSending(true);
    setError("");
    try {
      const recipient = selectedUser
        ? ({
            username: selectedUser.username,
            displayName: selectedUser.displayName,
            role: selectedUser.role,
            agentName: selectedUser.agentName || selectedUser.displayName,
            lastSeenAt: selectedUser.lastSeenAt || "",
          } as OnlineUser)
        : undefined;
      await onSendMessage(message, recipient, attachment);
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

  const acceptCall = async (message: ChatMessage) => {
    setSending(true);
    setError("");
    try {
      await onCallResponse(message, "accepted");
      setActiveCall(message);
      if (message.room === "private") {
        const peerUsername = message.username;
        await preparePeer(message.callId || message.id, peerUsername);
        setVoiceCall({
          callId: message.callId || message.id,
          peerUsername,
          peerDisplayName: message.displayName || peerUsername,
          status: "connecting",
          muted: false,
        });
      }
    } catch {
      setError("Call could not be accepted. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const declineCall = async (message: ChatMessage) => {
    setSending(true);
    try {
      await onCallResponse(message, "declined");
    } finally {
      setSending(false);
    }
  };

  const startVoiceCall = async () => {
    if (!selectedUser) {
      await onStartCall(undefined);
      setError("Group Call Invite sent. Real microphone voice is available for private 1:1 calls.");
      return;
    }
    if (voiceCall) {
      setError("A voice call is already active. End it before starting another call.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const recipient = {
        username: selectedUser.username,
        displayName: selectedUser.displayName,
        role: selectedUser.role,
        agentName: selectedUser.agentName || selectedUser.displayName,
        lastSeenAt: selectedUser.lastSeenAt || "",
      } as OnlineUser;
      const callId = await onStartCall(recipient);
      if (!callId) return;
      setActiveCall({
        id: callId,
        createdAt: new Date().toISOString(),
        username: currentUser.username,
        displayName: currentUser.displayName,
        role: currentUser.role,
        message: "",
        room: "private",
        toUsername: selectedUser.username,
        toDisplayName: selectedUser.displayName,
        kind: "call",
        callId,
        callStatus: "pending",
      });
      const connection = await preparePeer(callId, selectedUser.username);
      setVoiceCall({ callId, peerUsername: selectedUser.username, peerDisplayName: selectedUser.displayName, status: "dialing", muted: false });
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await onSendWebRtcSignal({
        callId,
        toUsername: selectedUser.username,
        type: "offer",
        payload: { type: offer.type || "offer", sdp: offer.sdp || "" },
      });
    } catch {
      cleanupVoiceCall();
      setError("Microphone call could not start. Please allow microphone permission and try again.");
    } finally {
      setSending(false);
    }
  };

  const endCall = async () => {
    if (!activeCall) return;
    setSending(true);
    try {
      if (voiceCall) {
        await onSendWebRtcSignal({ callId: voiceCall.callId, toUsername: voiceCall.peerUsername, type: "hangup", payload: {} });
      }
      await onEndCall(activeCall);
      cleanupVoiceCall();
      setActiveCall(null);
    } finally {
      setSending(false);
    }
  };

  const toggleMute = () => {
    setVoiceCall((call) => {
      if (!call) return call;
      const nextMuted = !call.muted;
      localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
      return { ...call, muted: nextMuted };
    });
  };

  const renderContact = (user: ContactRow) => {
    const active = selectedUser?.username.toLowerCase() === user.username.toLowerCase();
    return (
      <button
        key={user.username}
        type="button"
        onClick={() => setSelectedUsername(user.username)}
        className={`w-full rounded-2xl border px-3 py-3 text-left transition ${active ? "border-violet-300 bg-violet-50 shadow-sm" : "border-transparent hover:border-slate-200 hover:bg-white"}`}
      >
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-fuchsia-100 text-sm font-black text-violet-700">
            {initials(user.displayName)}
            <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${user.online ? "bg-emerald-500" : "bg-slate-300"}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="truncate text-sm font-bold text-slate-950">{user.displayName}</div>
              {user.lastMessageAt ? <span className="ml-auto shrink-0 text-[10px] font-semibold text-slate-400">{formatShortTime(user.lastMessageAt)}</span> : null}
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <div className="min-w-0 flex-1 truncate text-xs font-medium text-slate-500">
                {user.lastMessageText || `${user.role}${user.teamName ? ` · ${user.teamName}` : ""}`}
              </div>
              {user.unread ? <span className="shrink-0 rounded-full bg-violet-700 px-2 py-0.5 text-[10px] font-black text-white">{user.unread}</span> : null}
            </div>
          </div>
        </div>
      </button>
    );
  };

  const roomTitle = selectedUser ? selectedUser.displayName : "QA Dashboard Team Room";
  const roomSubtitle = selectedUser
    ? `${selectedUser.online ? "Online" : "Offline"} · @${selectedUser.username}${selectedUser.teamName ? ` · ${selectedUser.teamName}` : ""}`
    : `${onlineUsers.length} online · Messages visible to everyone in Team Chat`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f5f2fb] via-white to-[#eef6ff] px-4 py-5 lg:px-6" style={{ fontFamily: "'Kanit', sans-serif" }}>
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {incomingCalls.length ? (
        <div className="fixed right-6 top-6 z-[120] w-[360px] max-w-[calc(100vw-3rem)] rounded-[26px] border border-violet-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.25)]">
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-700">Incoming Call</div>
          <div className="mt-2 text-xl font-black text-slate-950">{incomingCalls[0].displayName || incomingCalls[0].username}</div>
          <div className="mt-1 text-sm font-semibold text-slate-500">{incomingCalls[0].room === "team" ? "Group Call Invite" : "Private voice call"}</div>
          <div className="mt-3 text-xs font-bold text-amber-700">Auto missed in {Math.max(0, CALL_TIMEOUT_SECONDS - getCallAgeSeconds(incomingCalls[0], now))}s</div>
          <div className="mt-4 flex gap-3">
            <button type="button" disabled={sending} onClick={() => void acceptCall(incomingCalls[0])} className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Accept</button>
            <button type="button" disabled={sending} onClick={() => void declineCall(incomingCalls[0])} className="flex-1 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Decline</button>
          </div>
        </div>
      ) : null}

      {activeCall ? (
        <div className="fixed inset-x-0 bottom-6 z-[120] mx-auto w-[560px] max-w-[calc(100vw-3rem)] rounded-[26px] bg-slate-950 p-4 text-white shadow-[0_24px_70px_rgba(15,23,42,0.35)]">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/20 text-lg">☎</div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Call Active</div>
              <div className="truncate text-sm font-bold">{voiceCall ? `${voiceCall.peerDisplayName} · ${voiceCall.status}` : "Team Group Call Invite"}</div>
              {voiceCall?.error ? <div className="mt-1 text-xs font-semibold text-amber-300">{voiceCall.error}</div> : null}
            </div>
            {voiceCall ? <button type="button" onClick={toggleMute} className="rounded-xl border border-white/20 px-3 py-2 text-xs font-bold">{voiceCall.muted ? "Unmute" : "Mute"}</button> : null}
            <button type="button" onClick={() => void endCall()} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold">End</button>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-[1640px] overflow-hidden rounded-[30px] border border-violet-200 bg-white shadow-[0_18px_55px_rgba(88,28,135,0.10)]">
        <PageHero
          eyebrow="Workspace"
          title="Chat"
          subtitle="สนทนากับทีมและผู้ใช้งานทุกคนจาก User Directory พร้อมสถานะ Online / Offline"
          workspaceTitle="Communication Hub · Chat V2"
          workspaceSubtitle="Recent conversations, team grouping, private chat, shared files and 1:1 voice call"
        />

        <div className={`grid min-h-[760px] ${detailsOpen ? "xl:grid-cols-[330px_minmax(0,1fr)_300px]" : "xl:grid-cols-[330px_minmax(0,1fr)]"}`}>
          <aside className="border-r border-slate-200 bg-slate-50/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-700">Conversations</div>
                <div className="mt-1 text-lg font-black text-slate-950">Messages</div>
              </div>
              <button type="button" onClick={onRefresh} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">Refresh</button>
            </div>

            <div className="relative mt-4">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people, username, team..." className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pl-10 text-sm font-medium outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100" />
              <span className="pointer-events-none absolute left-3.5 top-3.5 text-slate-400">⌕</span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-slate-200/70 p-1">
              {(["recent", "people", "teams"] as const).map((view) => (
                <button key={view} type="button" onClick={() => setContactView(view)} className={`rounded-xl px-2 py-2 text-xs font-bold capitalize transition ${contactView === view ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>{view}</button>
              ))}
            </div>

            <div className="mt-4 space-y-1">
              <button type="button" onClick={() => setSelectedUsername("team")} className={`w-full rounded-2xl border px-3 py-3 text-left transition ${selectedRoom === "team" ? "border-violet-300 bg-violet-50" : "border-transparent hover:bg-white"}`}>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-700 to-fuchsia-600 text-sm font-black text-white">ALL</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><div className="truncate text-sm font-bold text-slate-950">All Team</div>{unreadCounts.team ? <span className="ml-auto rounded-full bg-violet-700 px-2 py-0.5 text-[10px] font-black text-white">{unreadCounts.team}</span> : null}</div>
                    <div className="truncate text-xs font-medium text-slate-500">{onlineUsers.length} online · Shared room</div>
                  </div>
                </div>
              </button>

              <div className="max-h-[560px] overflow-y-auto pr-1">
                {contactView === "teams" ? (
                  <div className="space-y-4 pt-2">
                    {teamGroups.map(([teamName, users]) => (
                      <div key={teamName}>
                        <div className="px-2 pb-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{teamName} · {users.length}</div>
                        <div className="space-y-1">{users.map(renderContact)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1 pt-2">{filteredContacts.map(renderContact)}</div>
                )}
                {!filteredContacts.length ? <div className="px-3 py-10 text-center text-sm font-medium text-slate-400">No conversations found.</div> : null}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs font-semibold text-slate-500">
              <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />Online {contacts.filter((user) => user.online).length}</span>
              <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-slate-300" />Offline {contacts.filter((user) => !user.online).length}</span>
            </div>
          </aside>

          <section className="flex min-w-0 flex-col bg-white">
            <header className="flex min-h-[86px] items-center gap-4 border-b border-slate-200 px-5 py-4">
              <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl ${selectedUser ? "bg-violet-100 text-violet-700" : "bg-slate-950 text-white"}`}>
                {selectedUser && selectedProfilePhoto ? <img src={selectedProfilePhoto} alt={selectedUser.displayName} className="h-full w-full object-cover" /> : <span className="text-sm font-black">{selectedUser ? initials(selectedUser.displayName) : "ALL"}</span>}
                {selectedUser ? <span className={`absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-white ${selectedUser.online ? "bg-emerald-500" : "bg-slate-300"}`} /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-black text-slate-950">{roomTitle}</div>
                <div className="mt-0.5 truncate text-xs font-medium text-slate-500">{roomSubtitle}</div>
              </div>
              <button type="button" onClick={() => void startVoiceCall()} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50">{selectedUser ? "Voice Call" : "Group Call Invite"}</button>
              <button type="button" onClick={() => setDetailsOpen((value) => !value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700">{detailsOpen ? "Hide Details" : "Details"}</button>
            </header>

            <div className="flex-1 overflow-y-auto bg-[#f8f9fc] px-5 py-6">
              <div className="mx-auto max-w-[980px] space-y-3">
                {visibleMessages.map((message, index) => {
                  const isMine = message.username.toLowerCase() === myUsername;
                  const previous = visibleMessages[index - 1];
                  const showDateLabel = !previous || formatChatDateLabel(previous.createdAt) !== formatChatDateLabel(message.createdAt);
                  return (
                    <React.Fragment key={message.id}>
                      {showDateLabel ? <div className="flex items-center justify-center py-2"><span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-bold text-slate-500 shadow-sm">{formatChatDateLabel(message.createdAt)}</span></div> : null}
                      <div className={`group flex ${isMine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[72%] ${isMine ? "items-end" : "items-start"} flex flex-col`}>
                          {!isMine ? <div className="mb-1 px-1 text-[10px] font-bold text-slate-500">{message.displayName || message.username} · {message.role}</div> : null}
                          <div className={`rounded-[22px] border px-4 py-3 shadow-sm ${message.kind === "call" ? "border-amber-200 bg-amber-50 text-amber-800" : isMine ? "border-violet-600 bg-violet-700 text-white" : "border-slate-200 bg-white text-slate-900"}`}>
                            {editingMessageId === message.id ? (
                              <div className="min-w-[280px] space-y-2">
                                <textarea value={editingDraft} onChange={(event) => setEditingDraft(event.target.value)} className="min-h-[76px] w-full rounded-xl border border-violet-200 px-3 py-2 text-sm text-slate-900 outline-none" />
                                <div className="flex gap-2"><button type="button" onClick={() => void handleEditSave(message)} className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-bold text-white">Save</button><button type="button" onClick={() => setEditingMessageId("")} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600">Cancel</button></div>
                              </div>
                            ) : (
                              <>
                                {message.message ? <div className={`whitespace-pre-wrap text-sm leading-6 ${message.deleted ? "italic opacity-70" : ""}`}>{message.message}</div> : null}
                                {message.kind === "call" ? <div className={`mt-2 rounded-xl border px-3 py-2 text-xs font-bold ${getCallStatusStyle(message.callStatus)}`}>{getCallStatusLabel(message.callStatus)}{message.callRespondedBy ? ` by ${message.callRespondedBy}` : ""}</div> : null}
                                {message.attachment ? (
                                  <div className={`mt-2 rounded-xl border p-2 ${isMine ? "border-white/20 bg-white/10" : "border-slate-200 bg-slate-50"}`}>
                                    {message.attachment.type.startsWith("image/") ? <img src={message.attachment.dataUrl} alt={message.attachment.name} className="max-h-72 rounded-lg object-contain" /> : null}
                                    <a href={message.attachment.dataUrl} download={message.attachment.name} className={`mt-2 block text-xs font-bold underline ${isMine ? "text-white" : "text-violet-700"}`}>{message.attachment.name}</a>
                                    <div className={`mt-1 text-[10px] ${isMine ? "text-violet-100" : "text-slate-400"}`}>{formatFileSize(message.attachment.size)}</div>
                                  </div>
                                ) : null}
                              </>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-2 px-1 text-[10px] font-medium text-slate-400">
                            <span>{formatChatTime(message.createdAt)}{message.edited ? " · edited" : ""}</span>
                            {message.kind !== "call" && !message.deleted ? <button type="button" onClick={() => void navigator.clipboard?.writeText(message.message || "")} className="hidden font-bold text-slate-500 group-hover:inline">Copy</button> : null}
                            {isMine && message.kind !== "call" && !message.deleted ? <><button type="button" onClick={() => { setEditingMessageId(message.id); setEditingDraft(message.message); }} className="hidden font-bold text-violet-600 group-hover:inline">Edit</button><button type="button" onClick={() => void onDeleteMessage(message)} className="hidden font-bold text-rose-600 group-hover:inline">Delete</button></> : null}
                          </div>
                          {!isMine && message.kind === "call" && message.callStatus === "pending" && getCallAgeSeconds(message, now) < CALL_TIMEOUT_SECONDS ? <div className="mt-2 flex gap-2"><button type="button" onClick={() => void acceptCall(message)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Accept</button><button type="button" onClick={() => void declineCall(message)} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white">Decline</button></div> : null}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
                {!visibleMessages.length ? <div className="flex min-h-[420px] items-center justify-center text-center"><div><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-violet-100 text-2xl">✦</div><div className="mt-4 text-base font-black text-slate-800">Start a conversation</div><div className="mt-1 text-sm font-medium text-slate-500">{selectedUser ? `Send a private message to ${selectedUser.displayName}.` : "Send a message to everyone in Team Chat."}</div></div></div> : null}
                <div ref={messageEndRef} />
              </div>
            </div>

            <div className="border-t border-slate-200 bg-white px-4 py-4">
              {attachment ? <div className="mb-3 flex items-center gap-3 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3"><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-slate-900">{attachment.name}</div><div className="text-[10px] font-medium text-slate-500">{formatFileSize(attachment.size)}</div></div><button type="button" onClick={() => setAttachment(undefined)} className="text-xs font-bold text-sky-700">Remove</button></div> : null}
              <div className="mx-auto flex max-w-[980px] items-end gap-2 rounded-[24px] border border-slate-200 bg-slate-50 p-2 focus-within:border-violet-300 focus-within:ring-4 focus-within:ring-violet-100">
                <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-2xl text-lg font-bold text-slate-500 transition hover:bg-white hover:text-violet-700">＋<input type="file" className="hidden" onChange={handleFileChange} /></label>
                <div className="relative"><button type="button" onClick={() => setShowEmojiPicker((value) => !value)} className="flex h-10 w-10 items-center justify-center rounded-2xl text-lg transition hover:bg-white">😊</button>{showEmojiPicker ? <div className="absolute bottom-full left-0 z-30 mb-2 grid w-48 grid-cols-5 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">{EMOJI_OPTIONS.map((emoji) => <button key={emoji} type="button" onClick={() => { setDraft((value) => `${value}${emoji}`); setShowEmojiPicker(false); }} className="rounded-lg p-2 text-lg hover:bg-violet-50">{emoji}</button>)}</div> : null}</div>
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onPaste={handlePaste} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void handleSubmit(); } }} placeholder={selectedUser ? `Message ${selectedUser.displayName}...` : "Message everyone..."} rows={1} className="max-h-36 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2.5 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400" />
                <button type="button" disabled={sending || (!draft.trim() && !attachment)} onClick={() => void handleSubmit()} className="flex h-10 min-w-10 items-center justify-center rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40">{sending ? "..." : "Send"}</button>
              </div>
              <div className="mx-auto mt-2 flex max-w-[980px] items-center justify-between px-2 text-[10px] font-medium text-slate-400"><span>Enter to send · Shift+Enter for new line · Paste image supported</span>{error ? <span className="font-bold text-rose-600">{error}</span> : null}</div>
            </div>
          </section>

          {detailsOpen ? (
            <aside className="hidden border-l border-slate-200 bg-white p-5 xl:block">
              {selectedUser ? (
                <>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Chat Details</div>
                  <div className="mt-6 text-center">
                    <div className="relative mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-[26px] bg-gradient-to-br from-violet-100 to-fuchsia-100 text-xl font-black text-violet-700">
                      {selectedProfilePhoto ? <img src={selectedProfilePhoto} alt={selectedUser.displayName} className="h-full w-full object-cover" /> : initials(selectedUser.displayName)}
                      <span className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white ${selectedUser.online ? "bg-emerald-500" : "bg-slate-300"}`} />
                    </div>
                    <div className="mt-3 text-base font-black text-slate-950">{selectedUser.displayName}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-500">@{selectedUser.username}</div>
                    <div className={`mt-2 inline-flex rounded-full px-3 py-1 text-[10px] font-bold ${selectedUser.online ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{selectedUser.online ? "Online" : "Offline"}</div>
                  </div>
                  <div className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs">
                    <div><div className="font-bold text-slate-400">Role</div><div className="mt-1 font-semibold text-slate-800">{selectedUser.role || "-"}</div></div>
                    <div><div className="font-bold text-slate-400">Team</div><div className="mt-1 font-semibold text-slate-800">{selectedUser.teamName || "-"}</div></div>
                    <div><div className="font-bold text-slate-400">Team Lead</div><div className="mt-1 font-semibold text-slate-800">{selectedUser.teamLead || "-"}</div></div>
                  </div>
                  <div className="mt-6"><div className="flex items-center justify-between"><div className="text-xs font-black text-slate-800">Shared Files</div><span className="text-[10px] font-bold text-slate-400">{sharedAttachments.length}</span></div><div className="mt-2 space-y-2">{sharedAttachments.slice(0, 5).map((message) => <a key={message.id} href={message.attachment?.dataUrl} download={message.attachment?.name} className="block truncate rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700">{message.attachment?.name}</a>)}{!sharedAttachments.length ? <div className="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center text-xs font-medium text-slate-400">No shared files</div> : null}</div></div>
                  <div className="mt-6"><div className="flex items-center justify-between"><div className="text-xs font-black text-slate-800">Shared Images</div><span className="text-[10px] font-bold text-slate-400">{sharedImages.length}</span></div>{sharedImages.length ? <div className="mt-2 grid grid-cols-3 gap-2">{sharedImages.slice(0, 6).map((message) => <img key={message.id} src={message.attachment?.dataUrl} alt={message.attachment?.name || "Shared image"} className="aspect-square w-full rounded-xl border border-slate-200 object-cover" />)}</div> : null}</div>
                </>
              ) : (
                <>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Team Room</div>
                  <div className="mt-6 rounded-[24px] bg-gradient-to-br from-slate-950 via-violet-950 to-fuchsia-800 p-5 text-white"><div className="text-sm font-black">All Team</div><div className="mt-2 text-4xl font-black">{onlineUsers.length}</div><div className="mt-1 text-xs font-semibold text-violet-100">Users online now</div></div>
                  <div className="mt-5 text-xs font-semibold leading-6 text-slate-500">ห้องกลางสำหรับผู้ใช้งานที่มีสิทธิ์ Chat ทุกคน ข้อความในห้องนี้มองเห็นร่วมกัน</div>
                </>
              )}
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
