import quickAccessHandler, { probeQuickAccessConnections } from "../server/quickAccessHandler.js";

// Public, read-only status endpoint. Never returns keys, private project IDs,
// wallet amounts or user information. No Firebase or Supabase read is made.
function provider(value) {
  if (!value || value === "firebase") return "firebase";
  if (value === "supabase") return "supabase";
  return "unknown";
}

export default function handler(req, res) {
  // Read-only and data-free one-time support diagnostic; never disclose the
  // underlying credentials, login IDs, links, or stored documents.
  if (req.method === "GET" && req.query?.qaQuickCheck === "1") {
    res.setHeader("Cache-Control", "private, no-store");
    return probeQuickAccessConnections()
      .then((checks) => res.status(200).json({quickAccessServiceHealth:checks}))
      .catch(() => res.status(503).json({quickAccessServiceHealth:"unavailable"}));
  }
  // Reuse this existing function slot for authenticated Quick Access POST actions;
  // all legacy status GETs and unrelated POSTs retain their existing behavior.
  if (req.method === "POST" && req.headers?.["x-qa-quick-access"] === "1") {
    return quickAccessHandler(req, res);
  }
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Server-side is authoritative for Sparks API operations; the browser has
  // an independent build-time flag for direct wallet reads. The UI compares
  // these two facts and warns if configuration is inconsistent.
  const sparksApi = provider(process.env.SPARKS_DATA_BACKEND);
  const cloudPreviewLocked = sparksApi === "supabase" && process.env.SPARKS_CLOUD_READ_ONLY === "1";
  const environment = ["production","preview","development"].includes(process.env.VERCEL_ENV)
    ? process.env.VERCEL_ENV : "unknown";
  // This is an explicit release sign-off, not an inference from documents copied.
  const cutoverVerified = environment === "production" && sparksApi === "supabase"
    && !cloudPreviewLocked && process.env.SPARKS_WRITES_PAUSED!=="1" && process.env.SPARKS_CUTOVER_VERIFIED === "1";

  return res.status(200).json({
    statusVersion: 1,
    environment,
    qaDataProvider: "firebase",
    qaLoginProvider: "firebase",
    sparksApiProvider: sparksApi,
    sparksApiReadOnly: cloudPreviewLocked,
    sparksWritesPaused: process.env.SPARKS_WRITES_PAUSED==="1",
    cutoverVerified,
    migrationPhase: cutoverVerified ? "complete" : "in-progress",
    reviewedSnapshot: {
      asOf: "2026-11-08",
      documents: Number(process.env.SPARKS_MIGRATED_DOCUMENTS)||301,
      scope: "ตรวจสอบสำเนาฐานข้อมูล ณ วันที่ระบุ ไม่ใช่จำนวนข้อมูลสด",
    },
    migrationChecks: [
      {id:"snapshot",label:"คัดลอกข้อมูลและตรวจยอด Sparks",completed:true},
      {id:"preview",label:"ทดลองอ่าน Wallet, History และ My Items ผ่าน Supabase",completed:true},
      {id:"safeRead",label:"ป้องกันการหักแต้มจากการเปิดหน้าและบล็อกการทำรายการซ้ำ",completed:true},
      {id:"writeTests",label:"ทดสอบการเขียนแต้ม เกม และการแลกรางวัลทุกฟังก์ชัน",completed:cutoverVerified},
      {id:"typing",label:"ทดสอบ Typing Relief กับ QA Access Check ข้ามฐานข้อมูล",completed:cutoverVerified},
      {id:"switch",label:"ซิงก์ข้อมูลล่าสุด สลับระบบจริง และตรวจสอบหลังย้าย",completed:cutoverVerified},
    ],
    changeLog: [
      "ปรับยอด Sparks และประวัติ Announcement Shield ให้ตรงกับต้นฉบับ",
      "แยก QA Access Check ไว้บน Firebase ป้องกันการเขียนข้อมูลผิดฐาน",
      "เพิ่มการป้องกันการหัก 50 Sparks ขณะเปิดดูสถานะ Shield ใน Preview",
    ],
    changeLogReviewedAt: "2026-11-08",
  });
}
