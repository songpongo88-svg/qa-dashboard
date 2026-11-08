// Public, read-only status endpoint. Never returns keys, private project IDs,
// wallet amounts or user information. No Firebase or Supabase read is made.
function provider(value) {
  if (!value || value === "firebase") return "firebase";
  if (value === "supabase") return "supabase";
  return "unknown";
}

export default function handler(req, res) {
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
  const cutoverVerified = sparksApi === "supabase"
    && !cloudPreviewLocked && process.env.SPARKS_CUTOVER_VERIFIED === "1";

  return res.status(200).json({
    statusVersion: 1,
    environment,
    qaDataProvider: "firebase",
    qaLoginProvider: "firebase",
    sparksApiProvider: sparksApi,
    sparksApiReadOnly: cloudPreviewLocked,
    cutoverVerified,
    migrationPhase: cutoverVerified ? "complete" : "in-progress",
    reviewedSnapshot: {
      asOf: "2026-11-08",
      documents: 301,
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
