// Read-only cross-user Sparks ledger query. Authorization happens in /api/sparks-admin.
// The bridge secret never reaches the browser; no Firebase reads or writes occur here.
export async function requestSparksTimeline(input) {
  if (process.env.SPARKS_DATA_BACKEND !== "supabase") {
    throw Object.assign(new Error("Timeline รวมทุกคนต้องใช้ข้อมูล Sparks บน Supabase"), { status: 503 });
  }
  const runtimeUrl = String(process.env.SPARKS_SUPABASE_BRIDGE_URL || "");
  const token = String(process.env.SPARKS_SUPABASE_BRIDGE_TOKEN || "");
  if (!/^https:\/\/[^\s]+\/functions\/v1\/qa-sparks-runtime(?:-preview|-test)?$/.test(runtimeUrl) || token.length < 40) {
    throw Object.assign(new Error("QA Sparks Supabase backend is not configured"), { status: 503 });
  }
  const url = runtimeUrl.replace(/qa-sparks-runtime(?:-preview|-test)?$/, "qa-sparks-timeline");
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-qa-sparks-server-secret": token },
      body: JSON.stringify({ action: "timeline", ...input }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw Object.assign(new Error("ไม่สามารถเชื่อมต่อ Timeline บน Supabase ได้"), { status: 503 });
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.ok !== true || !Array.isArray(result.rows) || !Number.isSafeInteger(result.total)) {
    const status = response.status === 400 ? 400 : 503;
    throw Object.assign(new Error(status === 400 ? "ตัวกรอง Timeline ไม่ถูกต้อง" : "ไม่สามารถอ่าน Timeline จาก Supabase ได้"), { status });
  }
  return result;
}
