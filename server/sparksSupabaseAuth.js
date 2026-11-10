import { AsyncLocalStorage } from "node:async_hooks";

const context = new AsyncLocalStorage();
const ACCESS_COOKIE = "__Host-qa_sparks_access";
const REFRESH_COOKIE = "__Host-qa_sparks_refresh";
const URL = (process.env.SPARKS_SUPABASE_AUTH_URL || "https://vyhleszztvchevncgkhd.supabase.co").replace(/\/$/, "");
const KEY = () => String(process.env.SPARKS_SUPABASE_PUBLISHABLE_KEY || "");
const failure = (message, status = 403, code = "SPARKS_AUTH_REQUIRED") =>
  Object.assign(new Error(message), { status, code });
const normalized = (value) => String(value || "").trim().toLowerCase();

function parseCookies(req) {
  const result = new Map();
  for (const part of String(req?.headers?.cookie || "").split(";")) {
    const at = part.indexOf("=");
    if (at < 0) continue;
    const key = part.slice(0, at).trim();
    try { result.set(key, decodeURIComponent(part.slice(at + 1).trim())); } catch { /* fail closed */ }
  }
  return result;
}
function setCookies(res, tokens) {
  const maxAge = Math.max(1, Math.min(3600, Number(tokens.expires_in) || 3600));
  const opts = "Path=/; Secure; HttpOnly; SameSite=Strict";
  res.setHeader("Set-Cookie", [
    ACCESS_COOKIE + "=" + encodeURIComponent(tokens.access_token) + "; Max-Age=" + maxAge + "; " + opts,
    REFRESH_COOKIE + "=" + encodeURIComponent(tokens.refresh_token) + "; Max-Age=2592000; " + opts,
  ]);
}
export function clearSparksAuthCookies(res) {
  const opts = "Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0";
  res.setHeader("Set-Cookie", [ACCESS_COOKIE + "=; " + opts, REFRESH_COOKIE + "=; " + opts]);
}
async function supabase(path, { jwt = "", method = "GET", body = null } = {}) {
  const key = KEY();
  if (!key || !URL.startsWith("https://")) throw failure("Sparks email login is not configured", 503, "SPARKS_AUTH_NOT_CONFIGURED");
  const response = await fetch(URL + path, {
    method,
    headers: {
      apikey: key, ...(jwt ? { Authorization: "Bearer " + jwt } : {}),
      ...(body === null ? {} : { "content-type": "application/json" }),
    },
    ...(body === null ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // Authentication failures and expired tokens must not reveal keys or raw Supabase errors.
    throw failure("ไม่สามารถยืนยันสิทธิ์ QA Sparks ได้ กรุณาเข้าสู่ระบบอีกครั้ง", response.status === 401 ? 401 : 403,
      response.status === 401 ? "SPARKS_AUTH_EXPIRED" : "SPARKS_AUTH_INVALID");
  }
  return data;
}
export async function verifySparksAccessToken(accessToken) {
  if (typeof accessToken !== "string" || accessToken.length < 20 || accessToken.length > 8192) {
    throw failure("Please sign in to QA Sparks with your verified email", 401);
  }
  const user = await supabase("/auth/v1/user", { jwt: accessToken });
  if (!user?.id || !user?.email || !user?.email_confirmed_at) {
    throw failure("โปรดยืนยันอีเมลก่อนเข้าใช้ QA Sparks", 403, "SPARKS_EMAIL_NOT_VERIFIED");
  }
  const rows = await supabase("/rest/v1/rpc/sparks_verified_identity_v1", {
    jwt: accessToken, method: "POST", body: {},
  });
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]?.username) {
    throw failure("บัญชีพนักงานยังไม่ได้รับการยืนยันจากข้อมูลล่าสุด หรือไม่ได้เป็นบัญชี Active", 403,
      "SPARKS_PROFILE_RECONCILIATION_REQUIRED");
  }
  return {
    username: normalized(rows[0].username),
    displayName: String(rows[0].display_name || rows[0].username),
    role: String(rows[0].role || ""),
    status: "Active",
  };
}
export async function exchangeSparksAuthTokens(res, data) {
  const accessToken = data?.access_token;
  const refreshToken = data?.refresh_token;
  if (typeof refreshToken !== "string" || refreshToken.length < 10 || refreshToken.length > 8192)
    throw failure("Missing secure refresh token", 401);
  const actor = await verifySparksAccessToken(accessToken);
  setCookies(res, { access_token: accessToken, refresh_token: refreshToken, expires_in: data.expires_in });
  return actor;
}
export function withSparksRequest(req, res, callback) {
  return context.run({ req, res, actor: null, accessToken: "" }, callback);
}
// Enables a gradual Sparks-only cutover without changing QA Dashboard login.
// A cookie is merely an opt-in signal: getSparksRequestActor verifies every token
// with Supabase Auth and current Active profile before allowing reads or writes.
// An invalid, expired, or forged cookie NEVER falls back to Firebase permissions.
export function hasSparksEmailAuthCookie() {
  const req = context.getStore()?.req;
  if (!req) return false;
  const cookies = parseCookies(req);
  return Boolean(cookies.get(ACCESS_COOKIE) || cookies.get(REFRESH_COOKIE));
}

export async function getSparksRequestActor() {
  const ctx = context.getStore();
  if (!ctx) throw failure("Missing request context", 500);
  if (ctx.actor) return ctx.actor;
  if (ctx.pending) return ctx.pending;
  ctx.pending = (async () => {
    const cookies = parseCookies(ctx.req);
    let token = cookies.get(ACCESS_COOKIE) || "";
    let actor;
    try {
      actor = await verifySparksAccessToken(token);
    } catch (error) {
      if (error.code !== "SPARKS_AUTH_EXPIRED" && error.code !== "SPARKS_AUTH_REQUIRED") throw error;
      const refreshToken = cookies.get(REFRESH_COOKIE);
      if (!refreshToken || refreshToken.length > 8192) throw error;
      const session = await supabase("/auth/v1/token?grant_type=refresh_token", {
        method: "POST", body: { refresh_token: refreshToken },
      });
      if (!session?.access_token || !session?.refresh_token) throw failure("Session refresh failed", 401);
      token = session.access_token;
      actor = await verifySparksAccessToken(token);
      setCookies(ctx.res, session);
    }
    ctx.actor = actor;
    ctx.accessToken = token;
    return actor;
  })();
  try { return await ctx.pending; } finally { ctx.pending = null; }
}
export async function sparksActiveDirectory() {
  const actor = await getSparksRequestActor();
  if (actor.role !== "Quality Assurance" || actor.username !== "songpon") {
    throw failure("Sparks Admin requires a verified Quality Assurance account", 403);
  }
  const token = context.getStore()?.accessToken;
  const rows = await supabase("/rest/v1/rpc/sparks_admin_directory_v1", {
    jwt: token, method: "POST", body: {},
  });
  if (!Array.isArray(rows)) throw failure("Member list is unavailable", 503);
  return rows.map(row => ({
    username: String(row.username || ""),
    displayName: String(row.display_name || row.username || ""),
    role: String(row.role || ""),
    status: "Active",
  }));
}
export async function sparksActiveProfile(username) {
  const actor = await getSparksRequestActor();
  const normalizedTarget = normalized(username);
  if (actor.username === normalizedTarget) return {
    username: actor.username, displayName: actor.displayName, role: actor.role, status: actor.status,
  };
  const users = await sparksActiveDirectory();
  const target = users.find(row => normalized(row.username) === normalizedTarget);
  if (!target) throw failure("บัญชีนี้ไม่มีสิทธิ์ใช้ Sparks หรือข้อมูลยังไม่อัปเดต", 403);
  return target;
}
