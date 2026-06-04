const env = (import.meta as any).env || {};
const SUPABASE_URL = String(env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = String(env.VITE_SUPABASE_ANON_KEY || "");

const USER_PROFILE_TABLE = String(env.VITE_USER_PROFILE_TABLE || "qa_user_profiles");
const ROLE_DEFINITION_TABLE = String(env.VITE_ROLE_DEFINITION_TABLE || "qa_role_definitions");
const ROLE_PERMISSION_TABLE = String(env.VITE_ROLE_PERMISSION_TABLE || "qa_role_permissions");
const MAINTENANCE_TABLE = String(env.VITE_MAINTENANCE_TABLE || "qa_system_settings");
const SUPABASE_REQUEST_TIMEOUT_MS = 2500;

const USER_PROFILE_CACHE_KEY = "qa-dashboard:user-profiles-cache";
const ROLE_DEFINITION_CACHE_KEY = "qa-dashboard:role-definitions-cache";
const ROLE_PERMISSION_CACHE_KEY = "qa-dashboard:role-permissions-cache";
const MAINTENANCE_CACHE_KEY = "qa-dashboard:maintenance-cache";

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

function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function endpoint(table: string, query = "") {
  return `${SUPABASE_URL}/rest/v1/${table}${query}`;
}

function headers(prefer?: string) {
  const nextHeaders: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
  if (prefer) nextHeaders.Prefer = prefer;
  return nextHeaders;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), SUPABASE_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function normalizeRoleName(value: unknown) {
  const roleName = String(value || "").trim();
  return roleName.toLowerCase() === "agent" ? "Admin Live Chat" : roleName;
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
    // Cache is only a safety net for reload/deploy timing.
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
    // Cache is only a safety net for reload/deploy timing.
  }
}

async function requestJson<T>(table: string, query = ""): Promise<T> {
  if (!isConfigured()) throw new Error("Supabase is not configured.");
  const response = await fetchWithTimeout(endpoint(table, query), {
    method: "GET",
    headers: headers(),
  });
  if (!response.ok) throw new Error(`Supabase read failed: ${table} ${response.status}`);
  return (await response.json()) as T;
}

async function upsertRows(table: string, rows: unknown[], conflictColumn: string) {
  if (!isConfigured()) throw new Error("Supabase is not configured.");
  const response = await fetchWithTimeout(endpoint(table, `?on_conflict=${encodeURIComponent(conflictColumn)}`), {
    method: "POST",
    headers: headers("resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify(rows),
  });
  if (!response.ok) throw new Error(`Supabase upsert failed: ${table} ${response.status}`);
}

async function deleteRows(table: string, column: string, value: string) {
  if (!isConfigured()) throw new Error("Supabase is not configured.");
  const response = await fetchWithTimeout(endpoint(table, `?${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}`), {
    method: "DELETE",
    headers: headers("return=minimal"),
  });
  if (!response.ok) throw new Error(`Supabase delete failed: ${table} ${response.status}`);
}

function toUserProfile(row: any): StoredUserProfile {
  return {
    username: String(row.username || ""),
    displayName: String(row.display_name || row.username || ""),
    agentName: String(row.agent_name || row.display_name || row.username || ""),
    email: String(row.email || ""),
    role: normalizeRoleName(row.role || "Admin Live Chat"),
    teamLead: String(row.team_lead || ""),
    teamName: String(row.team_name || ""),
    status: row.status === "Suspended" ? "Suspended" : "Active",
    suspendReason: String(row.suspend_reason || ""),
  };
}

function fromUserProfile(profile: StoredUserProfile) {
  return {
    username: profile.username,
    display_name: profile.displayName,
    agent_name: profile.agentName,
    email: profile.email,
    role: normalizeRoleName(profile.role),
    team_lead: profile.teamLead,
    team_name: profile.teamName,
    status: profile.status,
    suspend_reason: profile.suspendReason,
    updated_at: new Date().toISOString(),
  };
}

function toRoleDefinition(row: any): StoredRoleDefinition {
  return {
    name: normalizeRoleName(row.name),
    description: String(row.description || ""),
    active: row.active === false ? false : true,
    locked: row.locked === true,
    updatedBy: String(row.updated_by || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

function fromRoleDefinition(role: StoredRoleDefinition) {
  return {
    name: normalizeRoleName(role.name),
    description: role.description,
    active: role.active,
    locked: role.locked,
    updated_by: role.updatedBy,
    updated_at: role.updatedAt || new Date().toISOString(),
  };
}

function toRolePermission(row: any): StoredRolePermission {
  return {
    roleName: normalizeRoleName(row.role_name),
    permissions: (row.permissions || {}) as Record<string, boolean>,
    updatedBy: String(row.updated_by || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

function fromRolePermission(row: StoredRolePermission) {
  return {
    role_name: normalizeRoleName(row.roleName),
    permissions: row.permissions || {},
    updated_by: row.updatedBy,
    updated_at: row.updatedAt || new Date().toISOString(),
  };
}

function toMaintenance(row: any): StoredMaintenanceState {
  return {
    enabled: row.enabled === true,
    message: String(row.message || ""),
    updatedBy: String(row.updated_by || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

export async function fetchStoredUserProfiles() {
  try {
    const rows = await requestJson<any[]>(USER_PROFILE_TABLE, "?select=*&order=username.asc");
    const profiles = rows.map(toUserProfile).filter((row) => row.username);
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
  await upsertRows(USER_PROFILE_TABLE, profiles.map(fromUserProfile), "username");
}

export async function fetchStoredRoleDefinitions() {
  try {
    const rows = await requestJson<any[]>(ROLE_DEFINITION_TABLE, "?select=*&order=name.asc");
    const roles = rows.map(toRoleDefinition).filter((row) => row.name);
    writeCache(ROLE_DEFINITION_CACHE_KEY, roles);
    return roles;
  } catch (error) {
    const cached = readCache<StoredRoleDefinition>(ROLE_DEFINITION_CACHE_KEY);
    if (cached.length) return cached;
    throw error;
  }
}

export async function upsertStoredRoleDefinition(role: StoredRoleDefinition) {
  await upsertRows(ROLE_DEFINITION_TABLE, [fromRoleDefinition(role)], "name");
}

export async function deleteStoredRoleDefinition(name: string) {
  await deleteRows(ROLE_DEFINITION_TABLE, "name", name);
}

export async function fetchStoredRolePermissions() {
  try {
    const rows = await requestJson<any[]>(ROLE_PERMISSION_TABLE, "?select=*&order=role_name.asc");
    const permissions = rows.map(toRolePermission).filter((row) => row.roleName);
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
  await upsertRows(ROLE_PERMISSION_TABLE, rows.map(fromRolePermission), "role_name");
}

export async function fetchStoredMaintenanceState() {
  try {
    const rows = await requestJson<any[]>(MAINTENANCE_TABLE, "?select=*&id=eq.global&limit=1");
    const state = rows[0] ? toMaintenance(rows[0]) : null;
    writeSingleCache(MAINTENANCE_CACHE_KEY, state);
    return state;
  } catch {
    // A stale local "maintenance on" cache can lock users out while Supabase is over quota.
    // When the central store is unavailable, keep the app open instead.
    return null;
  }
}

export async function upsertStoredMaintenanceState(state: StoredMaintenanceState) {
  await upsertRows(
    MAINTENANCE_TABLE,
    [{
      id: "global",
      enabled: state.enabled,
      message: state.message,
      updated_by: state.updatedBy,
      updated_at: state.updatedAt || new Date().toISOString(),
    }],
    "id"
  );
}
