import { logUsageEvent } from "./usageLog";

const env = (import.meta as any).env || {};
const SUPABASE_URL = String(env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = String(env.VITE_SUPABASE_ANON_KEY || "");
const USER_PROFILE_TABLE = String(env.VITE_USER_PROFILE_TABLE || "qa_user_profiles");
const DELETED_USERS_KEY = "qa-dashboard:deleted-users";
const PATCH_MARKER = "data-delete-user-patch";

type CurrentUser = {
  username?: string;
  displayName?: string;
  role?: string;
  agentName?: string;
  email?: string;
  loginAt?: string;
} | null;

function normalizeUsername(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function readDeletedUsers() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DELETED_USERS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeUsername).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveDeletedUser(username: string) {
  const deleted = new Set(readDeletedUsers());
  const normalized = normalizeUsername(username);
  if (!normalized) return;
  deleted.add(normalized);
  localStorage.setItem(DELETED_USERS_KEY, JSON.stringify(Array.from(deleted)));
}

function readCurrentUser(): CurrentUser {
  try {
    const possibleKeys = [
      "qa_current_user",
      "qa-dashboard:current-user",
      "qa-dashboard-current-user",
      "currentUser",
    ];
    for (const key of possibleKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

async function deleteStoredProfile(username: string) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !username) return;
  const endpoint = `${SUPABASE_URL}/rest/v1/${USER_PROFILE_TABLE}?username=eq.${encodeURIComponent(username)}`;
  const response = await fetch(endpoint, {
    method: "DELETE",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
  });
  if (!response.ok) throw new Error(`Delete user failed: ${response.status}`);
}

function getText(element: Element | null) {
  return (element?.textContent || "").replace(/\s+/g, " ").trim();
}

function isDirectoryPage() {
  return window.location.href.includes("tab=user-roles") && document.body.textContent?.includes("Corporate User Directory");
}

function findRow(seed: Element) {
  let current: Element | null = seed;
  for (let depth = 0; current && depth < 10; depth += 1) {
    const inputs = current.querySelectorAll("input, select");
    const text = getText(current);
    if (inputs.length >= 5 && /Active|Suspended|Generate/i.test(text)) return current;
    current = current.parentElement;
  }
  return seed.parentElement;
}

function getUsernameFromRow(row: Element) {
  const inputs = Array.from(row.querySelectorAll<HTMLInputElement>("input"));
  const usernameInput = inputs.find((input) => {
    const value = input.value.trim();
    return Boolean(value) && !value.includes("@") && value.length <= 50;
  });
  return usernameInput?.value.trim() || "";
}

function hideDeletedRows() {
  const deleted = new Set(readDeletedUsers());
  if (!deleted.size) return;

  document.querySelectorAll("button").forEach((button) => {
    if (!/^generate$/i.test(getText(button))) return;
    const row = findRow(button);
    if (!row) return;

    const username = getUsernameFromRow(row);
    if (deleted.has(normalizeUsername(username))) {
      (row as HTMLElement).style.display = "none";
    }
  });
}

function addDeleteButtons() {
  if (!isDirectoryPage()) return;

  const isEditMode = Array.from(document.querySelectorAll("button")).some((button) =>
    /Save Changes/i.test(getText(button))
  );
  if (!isEditMode) return;

  document.querySelectorAll("button").forEach((generateButton) => {
    if (!/^generate$/i.test(getText(generateButton))) return;

    const row = findRow(generateButton);
    if (!row || row.querySelector(`[${PATCH_MARKER}="true"]`)) return;

    const username = getUsernameFromRow(row);
    if (!username) return;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.setAttribute(PATCH_MARKER, "true");
    deleteButton.className =
      "ml-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 shadow-sm transition hover:bg-rose-100";

    deleteButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const nextUsername = getUsernameFromRow(row) || username;
      const normalized = normalizeUsername(nextUsername);

      if (!normalized) return;

      if (normalized === "songpon") {
        alert("Songpon is protected and cannot be deleted.");
        return;
      }

      const confirmed = window.confirm(`Delete user ${nextUsername}?`);
      if (!confirmed) return;

      deleteButton.textContent = "Deleting...";
      deleteButton.setAttribute("disabled", "true");

      try {
        await deleteStoredProfile(nextUsername).catch(() => undefined);
        saveDeletedUser(nextUsername);

        const currentUser = readCurrentUser();
        await logUsageEvent(currentUser, "user_profile_deleted", {
          tab: "user-roles",
          target_agent: nextUsername,
          details: {
            username: nextUsername,
            deletedBy: currentUser?.displayName || currentUser?.username || "",
            deletedAt: new Date().toISOString(),
          },
        }).catch(() => false);

        (row as HTMLElement).style.display = "none";
        alert(`Deleted ${nextUsername}.`);
      } catch (error) {
        console.warn("Delete user failed", error);
        deleteButton.textContent = "Delete";
        deleteButton.removeAttribute("disabled");
        alert("Delete failed. Please try again.");
      }
    });

    generateButton.insertAdjacentElement("afterend", deleteButton);
  });

  hideDeletedRows();
}

if (typeof window !== "undefined") {
  const run = () => window.requestAnimationFrame(addDeleteButtons);
  run();
  window.setInterval(run, 1500);
  window.addEventListener("popstate", run);
  document.addEventListener("click", () => window.setTimeout(run, 150));
}
