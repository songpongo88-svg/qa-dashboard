import {
  addDoc,
  collection,
  doc,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";
import type { ChatAttachment, ChatMessage, OnlineUser, WebRtcSignal } from "./TeamChatMockup";

const MESSAGE_COLLECTION = "qa_chat_messages_v2";
const PRESENCE_COLLECTION = "qa_chat_presence_v2";
const SIGNAL_COLLECTION = "qa_chat_signals_v2";
const MESSAGE_LIMIT = 300;
const SIGNAL_LIMIT = 200;
const ONLINE_TTL_MS = 6 * 60 * 1000;

type ChatActor = {
  username: string;
  displayName: string;
  role: string;
  agentName: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function presenceDocId(username: string) {
  return clean(username).toLowerCase().replace(/\//g, "__").replace(/\s+/g, "_") || "unknown";
}

function toChatMessage(id: string, row: Record<string, any>): ChatMessage {
  const attachment = row.attachment && typeof row.attachment === "object"
    ? {
        name: clean(row.attachment.name),
        type: clean(row.attachment.type),
        size: Number(row.attachment.size || 0),
        dataUrl: String(row.attachment.dataUrl || ""),
      }
    : undefined;

  return {
    id,
    createdAt: clean(row.createdAt || row.created_at) || new Date().toISOString(),
    username: clean(row.username),
    displayName: clean(row.displayName || row.display_name || row.username),
    role: clean(row.role),
    message: String(row.message || ""),
    room: row.room === "private" ? "private" : "team",
    toUsername: clean(row.toUsername || row.to_username),
    toDisplayName: clean(row.toDisplayName || row.to_display_name),
    attachment,
    kind: row.kind === "call" ? "call" : "message",
    callId: clean(row.callId || row.call_id),
    callStatus: row.callStatus || row.call_status || undefined,
    callRespondedBy: clean(row.callRespondedBy || row.call_responded_by),
    edited: row.edited === true,
    deleted: row.deleted === true,
  };
}

function toSignal(id: string, row: Record<string, any>): WebRtcSignal {
  return {
    id,
    callId: clean(row.callId),
    fromUsername: clean(row.fromUsername),
    toUsername: clean(row.toUsername),
    type: row.type as WebRtcSignal["type"],
    payload: row.payload && typeof row.payload === "object" ? row.payload : {},
    createdAt: clean(row.createdAt) || new Date().toISOString(),
  };
}

export function subscribeChatMessagesV2(
  onChange: (messages: ChatMessage[]) => void,
  onError?: (error: unknown) => void
) {
  const messagesQuery = query(
    collection(firebaseDb, MESSAGE_COLLECTION),
    orderBy("createdAt", "desc"),
    firestoreLimit(MESSAGE_LIMIT)
  );

  return onSnapshot(
    messagesQuery,
    (snapshot) => {
      const rows = snapshot.docs
        .map((item) => toChatMessage(item.id, item.data() as Record<string, any>))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      onChange(rows);
    },
    (error) => {
      console.warn("Chat message listener failed", error);
      onError?.(error);
    }
  );
}

export async function createStoredChatMessageV2(
  user: ChatActor,
  message: string,
  toUser?: OnlineUser,
  attachment?: ChatAttachment
) {
  const createdAt = new Date().toISOString();
  const row = {
    createdAt,
    createdAtServer: serverTimestamp(),
    username: clean(user.username),
    displayName: clean(user.displayName || user.username),
    role: clean(user.role),
    message: String(message || ""),
    room: toUser ? "private" : "team",
    toUsername: clean(toUser?.username),
    toDisplayName: clean(toUser?.displayName),
    attachment: attachment || null,
    kind: "message",
    edited: false,
    deleted: false,
  };
  const ref = await addDoc(collection(firebaseDb, MESSAGE_COLLECTION), row);
  return toChatMessage(ref.id, row);
}

export async function updateStoredChatMessageV2(message: ChatMessage, nextMessage: string) {
  await updateDoc(doc(firebaseDb, MESSAGE_COLLECTION, message.id), {
    message: String(nextMessage || ""),
    edited: true,
    editedAt: new Date().toISOString(),
    updatedAtServer: serverTimestamp(),
  });
}

export async function deleteStoredChatMessageV2(message: ChatMessage) {
  await updateDoc(doc(firebaseDb, MESSAGE_COLLECTION, message.id), {
    message: "This message was deleted.",
    attachment: null,
    deleted: true,
    deletedAt: new Date().toISOString(),
    updatedAtServer: serverTimestamp(),
  });
}

export async function touchChatPresenceV2(user: ChatActor) {
  const lastSeenAt = new Date().toISOString();
  await setDoc(
    doc(firebaseDb, PRESENCE_COLLECTION, presenceDocId(user.username)),
    {
      username: clean(user.username),
      displayName: clean(user.displayName || user.username),
      role: clean(user.role),
      agentName: clean(user.agentName || user.displayName || user.username),
      lastSeenAt,
      lastSeenAtServer: serverTimestamp(),
      online: true,
    },
    { merge: true }
  );
}

export async function markChatPresenceOfflineV2(user: ChatActor) {
  await setDoc(
    doc(firebaseDb, PRESENCE_COLLECTION, presenceDocId(user.username)),
    {
      username: clean(user.username),
      displayName: clean(user.displayName || user.username),
      role: clean(user.role),
      agentName: clean(user.agentName || user.displayName || user.username),
      lastSeenAt: new Date().toISOString(),
      lastSeenAtServer: serverTimestamp(),
      online: false,
    },
    { merge: true }
  );
}

export function subscribeChatPresenceV2(
  onChange: (users: OnlineUser[]) => void,
  onError?: (error: unknown) => void
) {
  let cachedRows: Array<Record<string, any>> = [];

  const emit = () => {
    const cutoff = Date.now() - ONLINE_TTL_MS;
    const users = cachedRows
      .filter((row) => row.online !== false)
      .filter((row) => {
        const seenAt = new Date(clean(row.lastSeenAt)).getTime();
        return Number.isFinite(seenAt) && seenAt >= cutoff;
      })
      .map((row): OnlineUser => ({
        username: clean(row.username),
        displayName: clean(row.displayName || row.username),
        role: clean(row.role),
        agentName: clean(row.agentName || row.displayName || row.username),
        lastSeenAt: clean(row.lastSeenAt),
      }))
      .filter((row) => row.username)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "th"));
    onChange(users);
  };

  const unsubscribe = onSnapshot(
    collection(firebaseDb, PRESENCE_COLLECTION),
    (snapshot) => {
      cachedRows = snapshot.docs.map((item) => item.data() as Record<string, any>);
      emit();
    },
    (error) => {
      console.warn("Chat presence listener failed", error);
      onError?.(error);
    }
  );

  const timer = window.setInterval(emit, 30_000);
  return () => {
    window.clearInterval(timer);
    unsubscribe();
  };
}

export async function createStoredChatCallV2(user: ChatActor, toUser?: OnlineUser) {
  const createdAt = new Date().toISOString();
  const callId = `call-${clean(user.username)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const isPrivate = Boolean(toUser);
  const row = {
    createdAt,
    createdAtServer: serverTimestamp(),
    username: clean(user.username),
    displayName: clean(user.displayName || user.username),
    role: clean(user.role),
    message: isPrivate
      ? `${clean(user.displayName || user.username)} started a private call invite for ${clean(toUser?.displayName || toUser?.username)}.`
      : `${clean(user.displayName || user.username)} started a group call invite.`,
    room: isPrivate ? "private" : "team",
    toUsername: clean(toUser?.username),
    toDisplayName: clean(toUser?.displayName),
    attachment: null,
    kind: "call",
    callId,
    callStatus: "pending",
    callRespondedBy: "",
    edited: false,
    deleted: false,
  };
  const ref = await addDoc(collection(firebaseDb, MESSAGE_COLLECTION), row);
  return toChatMessage(ref.id, row);
}

export async function respondStoredChatCallV2(
  message: ChatMessage,
  response: "accepted" | "declined",
  user: ChatActor
) {
  await updateDoc(doc(firebaseDb, MESSAGE_COLLECTION, message.id), {
    callStatus: response,
    callRespondedBy: clean(user.displayName || user.username),
    callRespondedAt: new Date().toISOString(),
    updatedAtServer: serverTimestamp(),
  });
}

export async function endStoredChatCallV2(message: ChatMessage, user: ChatActor) {
  await updateDoc(doc(firebaseDb, MESSAGE_COLLECTION, message.id), {
    callStatus: "ended",
    callRespondedBy: clean(user.displayName || user.username),
    callEndedAt: new Date().toISOString(),
    updatedAtServer: serverTimestamp(),
  });
}

export function subscribeChatSignalsV2(
  onChange: (signals: WebRtcSignal[]) => void,
  onError?: (error: unknown) => void
) {
  const signalsQuery = query(
    collection(firebaseDb, SIGNAL_COLLECTION),
    orderBy("createdAt", "desc"),
    firestoreLimit(SIGNAL_LIMIT)
  );
  return onSnapshot(
    signalsQuery,
    (snapshot) => {
      onChange(
        snapshot.docs
          .map((item) => toSignal(item.id, item.data() as Record<string, any>))
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      );
    },
    (error) => {
      console.warn("Chat signal listener failed", error);
      onError?.(error);
    }
  );
}

export async function sendStoredWebRtcSignalV2(
  user: ChatActor,
  signal: Omit<WebRtcSignal, "id" | "createdAt" | "fromUsername">
) {
  await addDoc(collection(firebaseDb, SIGNAL_COLLECTION), {
    callId: clean(signal.callId),
    fromUsername: clean(user.username),
    toUsername: clean(signal.toUsername),
    type: signal.type,
    payload: signal.payload || {},
    createdAt: new Date().toISOString(),
    createdAtServer: serverTimestamp(),
  });
}
