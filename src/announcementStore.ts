import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

const ANNOUNCEMENT_COLLECTION = "qa_announcements";
const RECEIPT_COLLECTION = "qa_announcement_receipts";

export type AnnouncementPriority = "Normal" | "Important" | "Urgent";
export type AnnouncementPopupMode = "Once" | "Until Acknowledged" | "Mailbox Only";
export type AnnouncementDisplayMode = "Banner" | "Popup" | "Full Screen" | "Media Spotlight" | "Media Only" | "Mailbox Only";
export type AnnouncementActionRequired = "Read Only" | "Acknowledge";
export type AnnouncementMediaType = "image" | "video" | "pdf" | "file" | "link";

export type AnnouncementMedia = {
  id: string;
  type: AnnouncementMediaType;
  url: string;
  label: string;
};

export type StoredAnnouncement = {
  id: string;
  title: string;
  body: string;
  category: string;
  priority: AnnouncementPriority;
  popupMode: AnnouncementPopupMode;
  displayMode: AnnouncementDisplayMode;
  actionRequired: AnnouncementActionRequired;
  startsAt: string;
  endsAt: string;
  targetAll: boolean;
  targetRoles: string[];
  targetTeams: string[];
  targetUsernames: string[];
  media: AnnouncementMedia[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
};

export type AnnouncementReceipt = {
  id: string;
  announcementId: string;
  username: string;
  displayName: string;
  readAt: string;
  acknowledgedAt: string;
  lastShownAt: string;
};

function safeArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function safeMedia(value: unknown): AnnouncementMedia[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any, index) => ({
      id: String(item?.id || `media-${index + 1}`),
      type:
        item?.type === "video" ||
        item?.type === "pdf" ||
        item?.type === "file" ||
        item?.type === "link"
          ? item.type
          : "image",
      url: String(item?.url || "").trim(),
      label: String(item?.label || "").trim(),
    }))
    .filter((item) => item.url);
}

function normalizeAnnouncement(
  value: any,
  fallbackId = ""
): StoredAnnouncement {
  return {
    id: String(value?.id || fallbackId || ""),
    title: String(value?.title || ""),
    body: String(value?.body || ""),
    category: String(value?.category || "General"),
    priority:
      value?.priority === "Urgent" || value?.priority === "Important"
        ? value.priority
        : "Normal",
    popupMode:
      value?.popupMode === "Until Acknowledged" ||
      value?.popupMode === "Mailbox Only"
        ? value.popupMode
        : "Once",
    displayMode:
      value?.displayMode === "Banner" ||
      value?.displayMode === "Full Screen" ||
      value?.displayMode === "Media Spotlight" ||
      value?.displayMode === "Media Only" ||
      value?.displayMode === "Mailbox Only"
        ? value.displayMode
        : "Popup",
    actionRequired:
      value?.actionRequired === "Acknowledge" ? "Acknowledge" : "Read Only",
    startsAt: String(value?.startsAt || ""),
    endsAt: String(value?.endsAt || ""),
    targetAll: Boolean(value?.targetAll),
    targetRoles: safeArray(value?.targetRoles),
    targetTeams: safeArray(value?.targetTeams),
    targetUsernames: safeArray(value?.targetUsernames).map((item) =>
      item.toLowerCase()
    ),
    media: safeMedia(value?.media),
    createdBy: String(value?.createdBy || ""),
    createdByName: String(value?.createdByName || ""),
    createdAt: String(value?.createdAt || ""),
    updatedAt: String(value?.updatedAt || ""),
    archived: Boolean(value?.archived),
  };
}

function normalizeReceipt(value: any, fallbackId = ""): AnnouncementReceipt {
  return {
    id: String(value?.id || fallbackId || ""),
    announcementId: String(value?.announcementId || ""),
    username: String(value?.username || "").toLowerCase(),
    displayName: String(value?.displayName || ""),
    readAt: String(value?.readAt || ""),
    acknowledgedAt: String(value?.acknowledgedAt || ""),
    lastShownAt: String(value?.lastShownAt || ""),
  };
}

export async function fetchStoredAnnouncements() {
  const snapshot = await getDocs(collection(firebaseDb, ANNOUNCEMENT_COLLECTION));
  return snapshot.docs
    .map((item) => normalizeAnnouncement(item.data(), item.id))
    .filter((item) => item.id)
    .sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime()
    );
}

export async function upsertStoredAnnouncement(
  announcement: StoredAnnouncement
) {
  const now = new Date().toISOString();
  const row: StoredAnnouncement = {
    ...announcement,
    id: announcement.id || `announcement-${Date.now()}`,
    createdAt: announcement.createdAt || now,
    updatedAt: now,
  };

  await setDoc(
    doc(firebaseDb, ANNOUNCEMENT_COLLECTION, row.id),
    { ...row, updatedAtServer: serverTimestamp() },
    { merge: true }
  );

  return row;
}

export async function deleteStoredAnnouncement(id: string) {
  await deleteDoc(doc(firebaseDb, ANNOUNCEMENT_COLLECTION, id));
}

export async function fetchAnnouncementReceipts() {
  const snapshot = await getDocs(collection(firebaseDb, RECEIPT_COLLECTION));
  return snapshot.docs
    .map((item) => normalizeReceipt(item.data(), item.id))
    .filter((item) => item.id);
}

export async function upsertAnnouncementReceipt(
  receipt: AnnouncementReceipt
) {
  const id =
    receipt.id ||
    `${receipt.announcementId}__${receipt.username.toLowerCase()}`.replace(
      /[^a-z0-9_-]/gi,
      "_"
    );
  const row = { ...receipt, id };
  await setDoc(
    doc(firebaseDb, RECEIPT_COLLECTION, id),
    { ...row, updatedAtServer: serverTimestamp() },
    { merge: true }
  );
  return row;
}
