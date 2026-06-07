import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

const PROFILE_PHOTO_COLLECTION = "qa_user_profile_photos";
const PROFILE_PHOTO_CACHE_PREFIX = "qa-dashboard:profile-photo:";

export type StoredProfilePhoto = {
  username: string;
  photoDataUrl: string;
  updatedAt: string;
  updatedBy: string;
};

function safeDocId(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\//g, "__")
    .replace(/\s+/g, " ")
    || "unknown";
}

function cacheKey(username: string) {
  return `${PROFILE_PHOTO_CACHE_PREFIX}${safeDocId(username).toLowerCase()}`;
}

function readCache(username: string): StoredProfilePhoto | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(username));
    return raw ? JSON.parse(raw) as StoredProfilePhoto : null;
  } catch {
    return null;
  }
}

function writeCache(profile: StoredProfilePhoto) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(cacheKey(profile.username), JSON.stringify(profile));
  } catch {
    // Cache is fallback only.
  }
}

function toProfilePhoto(username: string, row: any): StoredProfilePhoto {
  return {
    username: String(row.username || username || ""),
    photoDataUrl: String(row.photoDataUrl || row.photo_data_url || ""),
    updatedAt: String(row.updatedAt || row.updated_at || ""),
    updatedBy: String(row.updatedBy || row.updated_by || ""),
  };
}

export async function fetchStoredProfilePhoto(username: string) {
  const normalizedUsername = String(username || "").trim();
  if (!normalizedUsername) return null;

  try {
    const snap = await getDoc(doc(firebaseDb, PROFILE_PHOTO_COLLECTION, safeDocId(normalizedUsername)));
    if (!snap.exists()) return readCache(normalizedUsername);

    const profilePhoto = toProfilePhoto(normalizedUsername, snap.data());
    if (profilePhoto.photoDataUrl) writeCache(profilePhoto);
    return profilePhoto;
  } catch {
    return readCache(normalizedUsername);
  }
}

export async function upsertStoredProfilePhoto(profile: StoredProfilePhoto) {
  const normalizedUsername = String(profile.username || "").trim();
  if (!normalizedUsername) return;

  const row = {
    username: normalizedUsername,
    photoDataUrl: profile.photoDataUrl || "",
    updatedAt: profile.updatedAt || new Date().toISOString(),
    updatedBy: profile.updatedBy || "",
    updatedAtServer: serverTimestamp(),
  };

  await setDoc(doc(firebaseDb, PROFILE_PHOTO_COLLECTION, safeDocId(normalizedUsername)), row, { merge: true });
  writeCache({ ...profile, username: normalizedUsername, updatedAt: row.updatedAt });
}


export async function clearStoredProfilePhoto(username: string, updatedBy = "") {
  const normalizedUsername = String(username || "").trim();
  if (!normalizedUsername) return;

  const row = {
    username: normalizedUsername,
    photoDataUrl: "",
    updatedAt: new Date().toISOString(),
    updatedBy,
    updatedAtServer: serverTimestamp(),
  };

  await setDoc(doc(firebaseDb, PROFILE_PHOTO_COLLECTION, safeDocId(normalizedUsername)), row, { merge: true });

  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(cacheKey(normalizedUsername));
    } catch {
      // Cache is fallback only.
    }
  }
}
