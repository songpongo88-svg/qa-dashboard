import postgres from "npm:postgres@3.4.7";

const EXPECTED_TOKEN_HASH = "3e6eb4cb263eb395295476543aa1dbf183995bd91782e8ed0533482846c3b26d";
const dbUrl = Deno.env.get("SUPABASE_DB_URL");
const sql = dbUrl ? postgres(dbUrl, { max: 2, prepare: false, ssl: "require", connect_timeout: 10, idle_timeout: 8 }) : null;
const send = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
});
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
  .map((byte) => byte.toString(16).padStart(2, "0")).join("");
const constantEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
};
function normalizedUrl(input: unknown) {
  if (typeof input !== "string" || input.length > 2048) throw new Error("INVALID_URL");
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error("INVALID_URL"); }
  if (url.protocol !== "https:" || !url.hostname.includes(".") || url.username || url.password || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/i.test(url.hostname))
    throw new Error("INVALID_URL");
  return url.toString();
}
const icons = new Set(["auto", "chat", "dashboard", "bike", "users", "presentation", "sheet", "link", "file", "chart", "book", "globe"]);
const categories = new Set(["work", "document", "report", "other"]);
const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function normalizeLink(value: Record<string, unknown>) {
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const category = value.category || "other";
  const icon = value.icon || "auto";
  if (!title || title.length > 64 || !categories.has(String(category)) || !icons.has(String(icon))) throw new Error("INVALID_LINK");
  return { title, url: normalizedUrl(value.url), category: String(category), icon: String(icon) };
}
async function list() {
  return await sql`select id, title, url, category, icon, sort_order as "sortOrder"
    from qa_internal.quick_access_links order by sort_order asc, created_at asc, id asc limit 500`;
}
Deno.serve(async (request: Request) => {
  try {
    if (request.method !== "POST") return send({ error: "METHOD_NOT_ALLOWED" }, 405);
    const secret = request.headers.get("x-qa-sparks-server-secret") || "";
    if (secret.length < 40 || secret.length > 150 || !constantEqual(await hash(secret), EXPECTED_TOKEN_HASH))
      return send({ error: "UNAUTHORIZED" }, 401);
    if (!sql) return send({ error: "DATABASE_NOT_CONFIGURED" }, 503);
    const text = await request.text();
    if (text.length > 14000) return send({ error: "PAYLOAD_TOO_LARGE" }, 413);
    let body: Record<string, any>;
    try { body = JSON.parse(text); } catch { return send({ error: "INVALID_JSON" }, 400); }
    const action = String(body?.action || "");
    if (action === "list") return send({ links: await list() });
    // The Vercel API verifies the QA session and reads the Admin role from
    // Firestore before sending a signed, secret-protected service request.
    // Do not hardcode a login username here: authorized QA accounts may have
    // different login IDs while sharing the same verified administrator profile.
    const actorUsername = String(body?.actorUsername || "").trim().toLowerCase();
    if (body?.isAdmin !== true || !/^[\p{L}\p{N}._@+-]{1,100}$/u.test(actorUsername))
      return send({ error: "ADMIN_REQUIRED" }, 403);

    if (action === "create") {
      const link = normalizeLink(body.link || {});
      const current = await sql`select count(*)::int as count from qa_internal.quick_access_links`;
      if (current[0].count >= 500) return send({ error: "LIMIT_REACHED" }, 409);
      await sql`insert into qa_internal.quick_access_links (title,url,category,icon,sort_order,updated_by)
        values (${link.title},${link.url},${link.category},${link.icon},
        (select coalesce(max(sort_order),-1)+1 from qa_internal.quick_access_links), ${actorUsername})`;
    } else if (action === "update") {
      if (!uuid(body.id)) return send({ error: "INVALID_ID" }, 400);
      const link = normalizeLink(body.link || {});
      const result = await sql`update qa_internal.quick_access_links
        set title=${link.title},url=${link.url},category=${link.category},icon=${link.icon},
            updated_at=now(),updated_by=${actorUsername} where id=${body.id} returning id`;
      if (!result.length) return send({ error: "NOT_FOUND" }, 404);
    } else if (action === "delete") {
      if (!uuid(body.id)) return send({ error: "INVALID_ID" }, 400);
      await sql`delete from qa_internal.quick_access_links where id=${body.id}`;
    } else if (action === "reorder") {
      const ids: unknown[] = body.ids;
      if (!Array.isArray(ids) || ids.length > 500 || new Set(ids).size !== ids.length || ids.some((id) => !uuid(id)))
        return send({ error: "INVALID_ORDER" }, 400);
      const existing = await sql`select id from qa_internal.quick_access_links`;
      if (existing.length !== ids.length || existing.some((row: any) => !ids.includes(row.id)))
        return send({ error: "ORDER_MISMATCH" }, 409);
      await sql.begin(async (transaction: any) => {
        for (let index = 0; index < ids.length; index++) {
          await transaction`update qa_internal.quick_access_links
            set sort_order=${index},updated_at=now(),updated_by=${actorUsername} where id=${ids[index]}`;
        }
      });
    } else {
      return send({ error: "UNKNOWN_ACTION" }, 400);
    }
    return send({ ok: true, links: await list() });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (["INVALID_LINK","INVALID_URL"].includes(code)) return send({ error: code }, 400);
    console.error("Quick Access Edge database error", error instanceof Error ? error.name : "unknown");
    return send({ error: "QUICK_ACCESS_UNAVAILABLE" }, 503);
  }
});
