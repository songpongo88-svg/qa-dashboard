import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, serverTimestamp } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

const USER_PROFILE_CACHE_KEY = "qa-dashboard:user-profiles-cache";
const ROLE_DEFINITION_CACHE_KEY = "qa-dashboard:role-definitions-cache";
const ROLE_PERMISSION_CACHE_KEY = "qa-dashboard:role-permissions-cache";
const MAINTENANCE_CACHE_KEY = "qa-dashboard:maintenance-cache";

const USER_PROFILE_COLLECTION = "qa_user_profiles";
const ROLE_DEFINITION_COLLECTION = "qa_role_definitions";
const ROLE_PERMISSION_COLLECTION = "qa_role_permissions";
const SYSTEM_SETTINGS_COLLECTION = "qa_system_settings";

export type StoredHistoryChange = {
  field: string;
  before: string;
  after: string;
};

export type StoredHistoryItem = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  updatedBy?: string;
  category?: string;
  changes?: StoredHistoryChange[];
};

export type StoredUserProfile = {
  username: string;
  displayName: string;
  agentName: string;
  email: string;
  role: string;
  teamLead: string;
  teamName: string;
  status: "Active" | "Suspended";
  suspendReason: string;
  suspendEffectiveDate?: string;
  suspendEndDate?: string;
  suspendAutoReactivate?: boolean;
  password?: string;
  passwordKind?: string;
  passwordIssuedAt?: string;
  passwordExpiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
  history?: StoredHistoryItem[];
};

export type StoredRoleDefinition = {
  name: string;
  description: string;
  active: boolean;
  locked: boolean;
  updatedBy: string;
  updatedAt: string;
};

export type StoredRolePermission = {
  roleName: string;
  permissions: Record<string, boolean>;
  updatedBy: string;
  updatedAt: string;
};

export type StoredMaintenanceState = {
  enabled: boolean;
  message: string;
  updatedBy: string;
  updatedAt: string;
};

function normalizeRoleName(value: unknown) {
  const roleName = String(value || "").trim();
  const normalized = roleName.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  if (normalized === "agent" || normalized === "admin live chat") return "Admin Live Chat";
  if (normalized === "virtual rider") return "Virtual Rider";
  if (normalized === "senior") return "Senior";
  if (normalized === "supervisor") return "Supervisor";
  if (normalized === "quality assurance" || normalized === "qa") return "Quality Assurance";
  return roleName;
}

function safeDocId(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\//g, "__")
    .replace(/\s+/g, " ")
    || "unknown";
}

function readCache<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function writeCache<T>(key: string, rows: T[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    // Local cache is only a fallback.
  }
}

function readSingleCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeSingleCache<T>(key: string, row: T | null) {
  if (typeof window === "undefined" || !row) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(row));
  } catch {
    // Local cache is only a fallback.
  }
}

function bangkokToday() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(new Date());
}

function toUserProfile(row: any): StoredUserProfile {
  const suspendEffectiveDate = String(
    row.suspendEffectiveDate ||
      row.suspend_effective_date ||
      row.suspendDate ||
      row.suspend_date ||
      ""
  );
  const suspendEndDate = String(
    row.suspendEndDate ||
      row.suspend_end_date ||
      ""
  );
  const suspendAutoReactivate =
    row.suspendAutoReactivate === true ||
    row.suspend_auto_reactivate === true;

  let status: "Active" | "Suspended" =
    row.status === "Suspended" ? "Suspended" : "Active";

  const today = bangkokToday();

  if (
    status === "Active" &&
    suspendEffectiveDate &&
    suspendEffectiveDate <= today
  ) {
    status = "Suspended";
  }

  if (
    status === "Suspended" &&
    suspendAutoReactivate &&
    suspendEndDate &&
    suspendEndDate <= today
  ) {
    status = "Active";
  }

  return {
    username: String(row.username || ""),
    displayName: String(
      row.displayName ||
        row.display_name ||
        row.username ||
        ""
    ),
    agentName: String(
      row.agentName ||
        row.agent_name ||
        row.displayName ||
        row.display_name ||
        row.username ||
        ""
    ),
    email: String(row.email || ""),
    role: normalizeRoleName(
      row.role || "Admin Live Chat"
    ),
    teamLead: String(
      row.teamLead || row.team_lead || ""
    ),
    teamName: String(
      row.teamName || row.team_name || ""
    ),
    status,
    suspendReason: String(
      row.suspendReason ||
        row.suspend_reason ||
        ""
    ),
    suspendEffectiveDate,
    suspendEndDate,
    suspendAutoReactivate,
    password: String(row.password || ""),
    passwordKind: String(
      row.passwordKind ||
        row.password_kind ||
        ""
    ),
    passwordIssuedAt: String(
      row.passwordIssuedAt ||
        row.password_issued_at ||
        ""
    ),
    passwordExpiresAt: String(
      row.passwordExpiresAt ||
        row.password_expires_at ||
        ""
    ),
    createdAt: String(
      row.createdAt ||
        row.created_at ||
        row.userCreatedAt ||
        ""
    ),
    updatedAt: String(
      row.updatedAt ||
        row.updated_at ||
        ""
    ),
    history: (
      Array.isArray(row.history)
        ? row.history
        : Array.isArray(row.profileHistory)
          ? row.profileHistory
          : []
    ) as StoredHistoryItem[],
  };
}

function fromUserProfile(profile: StoredUserProfile) {
  const row: any = {
    username: profile.username,
    displayName: profile.displayName,
    agentName: profile.agentName,
    email: profile.email,
    role: normalizeRoleName(profile.role),
    teamLead: profile.teamLead,
    teamName: profile.teamName,
    status: profile.status,
    suspendReason: profile.suspendReason,
    suspendEffectiveDate:
      profile.suspendEffectiveDate || "",
    updatedAt:
      profile.updatedAt ||
      new Date().toISOString(),
    updatedAtServer: serverTimestamp(),
  };

  if (profile.suspendEndDate !== undefined) {
    row.suspendEndDate =
      profile.suspendEndDate || "";
  }

  if (
    profile.suspendAutoReactivate !== undefined
  ) {
    row.suspendAutoReactivate =
      profile.suspendAutoReactivate === true;
  }

  if (profile.createdAt) {
    row.createdAt = profile.createdAt;
    row.userCreatedAt =
      profile.createdAt;
  }

  if (profile.history?.length) {
    row.history = profile.history;
    row.profileHistory =
      profile.history;
  }

  if (profile.password) {
    row.password = profile.password;
    row.passwordKind =
      profile.passwordKind || "temporary";
    row.passwordIssuedAt =
      profile.passwordIssuedAt ||
      new Date().toISOString();
    row.passwordExpiresAt =
      profile.passwordExpiresAt || "";
  }

  return row;
}
function toRoleDefinition(row: any): StoredRoleDefinition {
  return {
    name: normalizeRoleName(row.name),
    description: String(row.description || ""),
    active: row.active === false ? false : true,
    locked: row.locked === true,
    updatedBy: String(row.updatedBy || row.updated_by || ""),
    updatedAt: String(row.updatedAt || row.updated_at || ""),
  };
}

function fromRoleDefinition(role: StoredRoleDefinition) {
  return {
    name: normalizeRoleName(role.name),
    description: role.description,
    active: role.active,
    locked: role.locked,
    updatedBy: role.updatedBy,
    updatedAt: role.updatedAt || new Date().toISOString(),
    updatedAtServer: serverTimestamp(),
  };
}

function toRolePermission(row: any): StoredRolePermission {
  return {
    roleName: normalizeRoleName(row.roleName || row.role_name),
    permissions: (row.permissions || {}) as Record<string, boolean>,
    updatedBy: String(row.updatedBy || row.updated_by || ""),
    updatedAt: String(row.updatedAt || row.updated_at || ""),
  };
}

function fromRolePermission(row: StoredRolePermission) {
  return {
    roleName: normalizeRoleName(row.roleName),
    permissions: row.permissions || {},
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt || new Date().toISOString(),
    updatedAtServer: serverTimestamp(),
  };
}

function toMaintenance(row: any): StoredMaintenanceState {
  return {
    enabled: row.enabled === true,
    message: String(row.message || ""),
    updatedBy: String(row.updatedBy || row.updated_by || ""),
    updatedAt: String(row.updatedAt || row.updated_at || ""),
  };
}

export async function fetchStoredUserProfiles() {
  try {
    const snapshot = await getDocs(query(collection(firebaseDb, USER_PROFILE_COLLECTION), orderBy("username", "asc")));
    const profiles = snapshot.docs.map((item) => toUserProfile(item.data())).filter((row) => row.username);
    writeCache(USER_PROFILE_CACHE_KEY, profiles);
    return profiles;
  } catch (error) {
    const cached = readCache<StoredUserProfile>(USER_PROFILE_CACHE_KEY);
    if (cached.length) return cached;
    throw error;
  }
}

export async function upsertStoredUserProfiles(profiles: StoredUserProfile[]) {
  if (!profiles.length) return;
  await Promise.all(
    profiles.map((profile) =>
      setDoc(doc(firebaseDb, USER_PROFILE_COLLECTION, safeDocId(profile.username)), fromUserProfile(profile), { merge: true })
    )
  );
  writeCache(USER_PROFILE_CACHE_KEY, profiles);
}

export async function deleteStoredUserProfile(username: string) {
  if (!username) return;
  await deleteDoc(doc(firebaseDb, USER_PROFILE_COLLECTION, safeDocId(username)));
  const cached = readCache<StoredUserProfile>(USER_PROFILE_CACHE_KEY).filter(
    (profile) => profile.username.toLowerCase() !== String(username).toLowerCase()
  );
  writeCache(USER_PROFILE_CACHE_KEY, cached);
}

export async function fetchStoredRoleDefinitions() {
  try {
    const snapshot = await getDocs(query(collection(firebaseDb, ROLE_DEFINITION_COLLECTION), orderBy("name", "asc")));
    const roles = snapshot.docs.map((item) => toRoleDefinition(item.data())).filter((row) => row.name);
    writeCache(ROLE_DEFINITION_CACHE_KEY, roles);
    return roles;
  } catch (error) {
    const cached = readCache<StoredRoleDefinition>(ROLE_DEFINITION_CACHE_KEY);
    if (cached.length) return cached;
    throw error;
  }
}

export async function upsertStoredRoleDefinition(role: StoredRoleDefinition) {
  await setDoc(doc(firebaseDb, ROLE_DEFINITION_COLLECTION, safeDocId(role.name)), fromRoleDefinition(role), { merge: true });
  const cached = readCache<StoredRoleDefinition>(ROLE_DEFINITION_CACHE_KEY).filter(
    (item) => item.name.toLowerCase() !== role.name.toLowerCase()
  );
  writeCache(ROLE_DEFINITION_CACHE_KEY, [...cached, role]);
}

export async function deleteStoredRoleDefinition(name: string) {
  await deleteDoc(doc(firebaseDb, ROLE_DEFINITION_COLLECTION, safeDocId(name)));
  const cached = readCache<StoredRoleDefinition>(ROLE_DEFINITION_CACHE_KEY).filter(
    (item) => item.name.toLowerCase() !== String(name).toLowerCase()
  );
  writeCache(ROLE_DEFINITION_CACHE_KEY, cached);
}

export async function fetchStoredRolePermissions() {
  try {
    const snapshot = await getDocs(query(collection(firebaseDb, ROLE_PERMISSION_COLLECTION), orderBy("roleName", "asc")));
    const permissions = snapshot.docs.map((item) => toRolePermission(item.data())).filter((row) => row.roleName);
    writeCache(ROLE_PERMISSION_CACHE_KEY, permissions);
    return permissions;
  } catch (error) {
    const cached = readCache<StoredRolePermission>(ROLE_PERMISSION_CACHE_KEY);
    if (cached.length) return cached;
    throw error;
  }
}

export async function upsertStoredRolePermissions(rows: StoredRolePermission[]) {
  if (!rows.length) return;
  await Promise.all(
    rows.map((row) =>
      setDoc(doc(firebaseDb, ROLE_PERMISSION_COLLECTION, safeDocId(row.roleName)), fromRolePermission(row), { merge: true })
    )
  );
  writeCache(ROLE_PERMISSION_CACHE_KEY, rows);
}

export async function fetchStoredMaintenanceState() {
  try {
    const snapshot = await getDoc(doc(firebaseDb, SYSTEM_SETTINGS_COLLECTION, "global"));
    const state = snapshot.exists() ? toMaintenance(snapshot.data()) : null;
    writeSingleCache(MAINTENANCE_CACHE_KEY, state);
    return state;
  } catch {
    const cached = readSingleCache<StoredMaintenanceState>(MAINTENANCE_CACHE_KEY);
    if (cached) return cached;
    return null;
  }
}

export async function upsertStoredMaintenanceState(state: StoredMaintenanceState) {
  const nextState = {
    enabled: state.enabled,
    message: state.message,
    updatedBy: state.updatedBy,
    updatedAt: state.updatedAt || new Date().toISOString(),
    updatedAtServer: serverTimestamp(),
  };
  await setDoc(doc(firebaseDb, SYSTEM_SETTINGS_COLLECTION, "global"), nextState, { merge: true });
  writeSingleCache(MAINTENANCE_CACHE_KEY, state);
}




