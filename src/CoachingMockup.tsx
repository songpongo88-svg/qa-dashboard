import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Grade = "A" | "B" | "C" | "D" | "F";
type ReviewStatus = "Original" | "Revised";

type Topic = {
  code: string;
  label: string;
  score: number;
  max: number;
  pct: number;
  comment?: string;
};

type CaseItem = {
  key: string;
  agent: string;
  auditDate: string;
  auditDateObj: Date | null;
  monthKey: string;
  monthLabel: string;
  weekLabel: string;
  caseId: string;
  inquiryTh: string;
  inquiryEn: string;
  finalScore: number;
  previousScore?: number;
  grade: Grade;
  reviewStatus: ReviewStatus;
  topics: Topic[];
  revisedTopics?: Topic[] | null;
  displayRevisedTopicCodes?: string[];
};

type AppealMergeItem = {
  caseId: string;
  finalScore?: number;
  previousScore?: number;
  reviewStatus?: ReviewStatus;
  revisedTopics: Topic[];
  displayRevisedTopicCodes: string[];
};

type CoachingTopicSummary = {
  code: string;
  label: string;
  avgScore: number;
  pct: number;
  max: number;
  failCount: number;
  impactedCases: CaseItem[];
  priority: "High" | "Medium" | "Low";
};

const TOPIC_MASTER = [
  { code: "1.1", label: "Greeting & Closing Standard", max: 10 },
  { code: "1.2", label: "Accuracy of Information", max: 5 },
  { code: "1.3", label: "PDPA & Policy", max: 5 },
  { code: "2.1", label: "Case Accuracy", max: 5 },
  { code: "2.2", label: "Completeness", max: 5 },
  { code: "2.3", label: "Clear Actionable Guidance", max: 5 },
  { code: "2.4", label: "Official Sources", max: 5 },
  { code: "3.1", label: "Root Cause & Resolution", max: 10 },
  { code: "3.2", label: "Case Ownership", max: 5 },
  { code: "3.3", label: "Clear Next Step Guidance", max: 5 },
  { code: "4.1", label: "Message Structure", max: 5 },
  { code: "4.2", label: "Language Quality", max: 5 },
  { code: "4.3", label: "Tone & Empathy", max: 5 },
  { code: "4.4", label: "Adaptation to Context", max: 5 },
  { code: "5.1", label: "Work Process Compliance", max: 10 },
  { code: "5.2", label: "SLA Compliance", max: 5 },
  { code: "5.3", label: "Case Logging / Status Accuracy", max: 5 },
] as const;

const AGENT_MASTER = [
  "Anucha Makundin",
  "Arisa Aiemrit",
  "Chatkonnaphat Bhusomya",
  "Jariyawadee Taboodda",
  "Jureeporn Piddum",
  "Krivut Vongkampan",
  "Natcha Chai-in",
  "Nattapol Suprom",
  "Sunijtra Siritip",
  "Supakrit Promkhamnoi",
  "Suphitcha Keawliam",
  "Wachiraporn Chailittichai",
  "Wassana Phothong",
].sort((a, b) => a.localeCompare(b));

const NEW_POLICY_START_MONTH_KEY = "2026-04";
const SONGKRAN_THEME_END = new Date(2026, 3, 25, 23, 59, 59);

const RESIGNED_AGENT_HIDE_AFTER: Record<string, string> = {
  "Arisa Aiemrit": "2026-04",
};

function isSongkranThemeActive() {
  const now = new Date();
  return now <= SONGKRAN_THEME_END && now.getFullYear() === 2026 && now.getMonth() === 3;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function compactText(value: unknown) {
  return normalizeText(value).replace(/[^a-z0-9]/g, "");
}

function toTitleCaseName(value: string) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((part) => {
      if (!part) return part;
      if (part.includes("-")) {
        return part
          .split("-")
          .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p))
          .join("-");
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

function isSameAgent(a: string, b: string) {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  const ca = compactText(a);
  const cb = compactText(b);

  return (
    na === nb ||
    ca === cb ||
    na.includes(nb) ||
    nb.includes(na) ||
    ca.includes(cb) ||
    cb.includes(ca)
  );
}

function shouldHideAgentByMonth(agentName: string, selectedMonthKey: string) {
  if (!selectedMonthKey || selectedMonthKey === "all") return false;

  const matchedEntry = Object.entries(RESIGNED_AGENT_HIDE_AFTER).find(([name]) =>
    isSameAgent(name, agentName)
  );

  if (!matchedEntry) return false;

  const [, hideFromMonth] = matchedEntry;
  return selectedMonthKey >= hideFromMonth;
}

function isNewPolicyMonth(monthKey: string) {
  return monthKey !== "unknown" && monthKey >= NEW_POLICY_START_MONTH_KEY;
}

function scoreToGrade(score: number, monthKey: string): Grade {
  if (isNewPolicyMonth(monthKey)) {
    if (score >= 90) return "A";
    if (score >= 85) return "B";
    if (score >= 80) return "C";
    return "D";
  }

  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function excelDateToJSDate(value: any): Date | null {
  if (!value && value !== 0) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d);
  }

  const text = String(value ?? "").trim();
  if (!text) return null;

  const ddmmyyyyMatch = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (ddmmyyyyMatch) {
    const [, d, m, y, hh = "0", mm = "0", ss = "0"] = ddmmyyyyMatch;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
  }

  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime())) return asDate;
  return null;
}

function formatAuditDate(value: any): string {
  const dt = excelDateToJSDate(value);
  if (!dt) return String(value ?? "");
  const day = `${dt.getDate()}`.padStart(2, "0");
  const month = `${dt.getMonth() + 1}`.padStart(2, "0");
  const year = dt.getFullYear();
  return `${day}/${month}/${year}`;
}

function getMonthKey(date: Date | null) {
  if (!date) return "unknown";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function getMonthLabel(date: Date | null) {
  if (!date) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function buildHeaderHelpers(headerRow: any[]) {
  const normalizedHeaders = headerRow.map((h) => normalizeText(h));

  const colIndexes = (name: string) => {
    const target = normalizeText(name);
    return normalizedHeaders
      .map((h, idx) => (h === target ? idx : -1))
      .filter((idx) => idx >= 0);
  };

  const getValue = (row: any[], name: string, occurrence = 0) => {
    const indexes = colIndexes(name);
    const idx = indexes[occurrence];
    return idx >= 0 ? row[idx] : null;
  };

  const getLastValue = (row: any[], name: string) => {
    const indexes = colIndexes(name);
    if (!indexes.length) return null;
    return row[indexes[indexes.length - 1]];
  };

  return { getValue, getLastValue };
}

function mergeTopicSet(topics: Topic[], revisedTopics?: Topic[] | null) {
  if (!revisedTopics?.length) return topics;
  const revisedMap = new Map(revisedTopics.map((topic) => [topic.code, topic]));
  return topics.map((topic) => revisedMap.get(topic.code) || topic);
}

function calcMergedFinalScore(baseTopics: Topic[], revisedTopics: Topic[]) {
  const revisedMap = new Map(revisedTopics.map((t) => [t.code, t]));
  const total = baseTopics.reduce((sum, base) => {
    const active = revisedMap.get(base.code) || base;
    return sum + active.score;
  }, 0);
  return Number(total.toFixed(2));
}

function getPriority(pct: number, failCount: number): "High" | "Medium" | "Low" {
  if (pct < 70 || failCount >= 3) return "High";
  if (pct < 85 || failCount >= 2) return "Medium";
  return "Low";
}

function getPriorityTone(priority: "High" | "Medium" | "Low") {
  switch (priority) {
    case "High":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "Medium":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
}

function getGradeTone(grade: Grade) {
  switch (grade) {
    case "A":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "B":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "C":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "D":
      return "border-orange-200 bg-orange-50 text-orange-700";
    default:
      return "border-rose-200 bg-rose-50 text-rose-700";
  }
}

function getCoachingGuide(topicCode: string) {
  const map: Record<
    string,
    {
      issue: string;
      guidance: string[];
      example: string;
      target: string;
    }
  > = {
    "1.1": {
      issue: "การเปิดและปิดบทสนทนายังไม่ครบมาตรฐาน หรือไม่ได้แนะนำตัวชัดเจน",
      guidance: [
        "เริ่มต้นด้วยคำทักทายและแจ้งชื่อแอดมินทุกครั้ง",
        "ก่อนจบเคสควรมีประโยคเสนอความช่วยเหลือเพิ่มเติม",
        "ปิดบทสนทนาด้วยถ้อยคำมาตรฐานขององค์กร",
      ],
      example:
        "สวัสดีค่ะ แอดมิน [ชื่อ] ยินดีให้บริการค่ะ ... หากต้องการให้แอดมินช่วยเพิ่มเติม สามารถแจ้งได้เลยนะคะ ขอบคุณที่ใช้บริการโรบินฮู้ดค่ะ",
      target: "ทำให้ทุกเคสมี greeting และ closing ครบถ้วนตามมาตรฐาน",
    },
    "1.2": {
      issue: "ให้ข้อมูลไม่แม่นยำ หรือยังตอบแบบคาดการณ์โดยไม่อ้างอิงข้อมูลจริง",
      guidance: [
        "ตรวจสอบข้อมูลจากระบบหรือแหล่งอ้างอิงทางการก่อนตอบ",
        "หลีกเลี่ยงการรับปากหรือยืนยันสิ่งที่ยังไม่ตรวจสอบ",
        "ถ้ายังไม่พบข้อมูล ให้แจ้งลูกค้าว่าขอตรวจสอบเพิ่มเติม",
      ],
      example:
        "เบื้องต้นแอดมินขอตรวจสอบข้อมูลจากระบบเพิ่มเติมก่อนนะคะ เพื่อให้ข้อมูลถูกต้องที่สุดค่ะ",
      target: "ลดการตอบผิดหรือการให้ข้อมูลที่ยังไม่ยืนยัน",
    },
    "1.3": {
      issue: "ขั้นตอนยืนยันตัวตนหรือ PDPA ยังไม่ครบก่อนเปิดเผยข้อมูล",
      guidance: [
        "ขอข้อมูลยืนยันตัวตนก่อนทุกครั้งในเคสที่เกี่ยวกับข้อมูลส่วนบุคคล",
        "หลีกเลี่ยงการเปิดเผยข้อมูลของบุคคลที่สาม",
        "ตอบเฉพาะข้อมูลที่สอดคล้องกับสิทธิ์การเข้าถึง",
      ],
      example:
        "เพื่อความปลอดภัยของข้อมูล แอดมินขอรบกวนข้อมูลยืนยันตัวตนเพิ่มเติมก่อนนะคะ",
      target: "ให้ทุกเคสที่มีข้อมูลส่วนบุคคลผ่านมาตรฐาน PDPA",
    },
    "2.1": {
      issue: "คำตอบไม่ตรงกับบริบทเคส หรือยังไม่เชื่อมโยงกับข้อมูลเคสจริง",
      guidance: [
        "อ่านบริบทเคสให้ครบก่อนตอบ",
        "ตรวจสอบ Order ID / Shop ID / Rider ID ให้ตรงกับเคส",
        "สรุปปัญหาของลูกค้าก่อนให้คำตอบเพื่อยืนยันความเข้าใจ",
      ],
      example:
        "จากเคสนี้พบว่าออเดอร์หมายเลข ... มีสถานะ ... ดังนั้นแนวทางที่ถูกต้องคือ ...",
      target: "ให้คำตอบตรงประเด็นและตรงบริบททุกเคส",
    },
    "2.2": {
      issue: "ตอบไม่ครบทุกคำถาม หรือขาดข้อมูลสำคัญที่ลูกค้าต้องใช้",
      guidance: [
        "ไล่ตรวจทุกประเด็นที่ลูกค้าถามว่าตอบครบหรือไม่",
        "ถ้ามีหลายคำถาม ให้ตอบแยกเป็นข้อ",
        "สรุปสิ่งที่ลูกค้าต้องทำต่อให้ครบ",
      ],
      example:
        "เบื้องต้นมี 2 ประเด็นที่แอดมินขอชี้แจงดังนี้ 1) ... 2) ...",
      target: "ลดเคสที่ตอบไม่ครบและทำให้ลูกค้าไม่ต้องถามซ้ำ",
    },
    "2.3": {
      issue: "คำแนะนำยังไม่เป็นลำดับขั้น หรือไม่ actionable พอ",
      guidance: [
        "เขียนคำแนะนำเป็น Step 1 / 2 / 3",
        "ระบุให้ชัดว่าใครต้องทำอะไร",
        "ระบุผลที่คาดว่าจะเกิดขึ้นหลังทำแต่ละขั้นตอน",
      ],
      example:
        "แนะนำให้ดำเนินการดังนี้ 1) ตรวจสอบ... 2) กดเมนู... 3) แจ้งกลับพร้อมภาพหน้าจอค่ะ",
      target: "ทำให้คำตอบนำไปปฏิบัติได้ทันที",
    },
    "2.4": {
      issue: "อ้างอิงข้อมูลไม่ชัดเจน หรือใช้ข้อมูลที่ไม่ใช่แหล่งทางการ",
      guidance: [
        "ใช้ข้อมูลจากระบบหรือ KB ล่าสุดเท่านั้น",
        "หลีกเลี่ยงการอ้างอิงจากความจำหรือข้อมูลเก่า",
        "ถ้าข้อมูลเปลี่ยนแปลงบ่อยให้ตรวจสอบซ้ำก่อนตอบ",
      ],
      example:
        "จากข้อมูลในระบบล่าสุดและประกาศที่ใช้งานอยู่ในปัจจุบัน แนวทางคือ ...",
      target: "ให้ทุกคำตอบอ้างอิงแหล่งทางการได้",
    },
    "3.1": {
      issue: "ยังวิเคราะห์สาเหตุไม่ลึกพอ และแนวทางแก้ไม่ตรง root cause",
      guidance: [
        "เริ่มจากระบุสาเหตุที่แท้จริงของปัญหา",
        "แยกอาการของปัญหาออกจากสาเหตุ",
        "เสนอแนวทางแก้ที่สอดคล้องกับสาเหตุจริง",
      ],
      example:
        "สาเหตุหลักของปัญหานี้คือ ... ดังนั้นแนวทางที่เหมาะสมคือ ...",
      target: "ทำให้การตอบทุกเคสมี root cause และ resolution ชัดเจน",
    },
    "3.2": {
      issue: "ยังไม่แสดง ownership ชัด หรือส่งต่อโดยไม่มีสรุปที่เพียงพอ",
      guidance: [
        "ถ้าต้อง escalate ให้สรุปข้อมูลเคสก่อนส่งต่อทุกครั้ง",
        "แจ้งลูกค้าให้ชัดว่าใครจะรับเคสต่อ",
        "หลีกเลี่ยงการโยนเคสโดยไม่มี action ที่ชัดเจน",
      ],
      example:
        "เบื้องต้นแอดมินได้ประสานทีมที่เกี่ยวข้องต่อให้แล้ว พร้อมแนบรายละเอียดเคสครบถ้วนค่ะ",
      target: "ให้ทุกเคสมี owner และ next owner ชัดเจน",
    },
    "3.3": {
      issue: "ยังไม่บอก next step ชัดเจน หรือไม่ระบุ timeline / owner",
      guidance: [
        "ระบุขั้นตอนถัดไปให้ชัดเจน",
        "บอกว่าใครเป็นผู้ดำเนินการ",
        "ระบุกรอบเวลาที่ลูกค้าควรได้รับการอัปเดต",
      ],
      example:
        "ขั้นตอนถัดไป ทีมที่เกี่ยวข้องจะตรวจสอบเพิ่มเติมและอัปเดตผลภายใน ... ค่ะ",
      target: "ทำให้ลูกค้ารู้ว่าต้องรออะไรและเมื่อไร",
    },
    "4.1": {
      issue: "โครงสร้างข้อความยังไม่เป็นระเบียบ อ่านยาก หรือข้อมูลติดกันเกินไป",
      guidance: [
        "แบ่งข้อความเป็นย่อหน้าสั้น ๆ",
        "แยกข้อมูลสำคัญออกเป็น bullet หรือเลขข้อ",
        "เรียงลำดับจากปัญหา → คำตอบ → next step",
      ],
      example:
        "แอดมินขอชี้แจงดังนี้\n1) ...\n2) ...\n3) ...",
      target: "เพิ่มความชัดเจนและลดความสับสนในการอ่าน",
    },
    "4.2": {
      issue: "ภาษาไม่กระชับ ชัดเจน หรือมีคำที่คลุมเครือ",
      guidance: [
        "ใช้ประโยคสั้นและตรงประเด็น",
        "หลีกเลี่ยงคำที่ตีความได้หลายแบบ",
        "ตรวจทานคำสะกดและความเรียบร้อยก่อนส่ง",
      ],
      example:
        "แอดมินขอแจ้งรายละเอียดโดยสรุปดังนี้ค่ะ ...",
      target: "ให้ภาษาดูมืออาชีพ อ่านง่าย และกระชับ",
    },
    "4.3": {
      issue: "โทนการตอบยังไม่สอดคล้องกับสถานการณ์ โดยเฉพาะเคส complaint",
      guidance: [
        "เริ่มต้นด้วย empathy ในเคสที่ลูกค้าได้รับผลกระทบ",
        "หลีกเลี่ยงโทนแข็ง ห้วน หรือเหมือนปัดความรับผิดชอบ",
        "ใช้ถ้อยคำสุภาพและเหมาะกับบริบท",
      ],
      example: "แอดมินต้องขออภัยในความไม่สะดวกที่เกิดขึ้นด้วยนะคะ",
      target: "ทำให้โทนการตอบเหมาะสมกับอารมณ์และบริบทของลูกค้า",
    },
    "4.4": {
      issue: "ยังใช้ template แบบตรงเกินไป ไม่ปรับให้เหมาะกับสถานการณ์",
      guidance: [
        "ปรับรูปแบบข้อความตามระดับความเร่งด่วนของเคส",
        "ใช้ template เป็นฐาน แต่เติมบริบทเฉพาะเคสเข้าไป",
        "แยกโครงสร้างข้อความตามประเภทปัญหา",
      ],
      example:
        "สำหรับกรณีนี้ แอดมินขออธิบายเฉพาะขั้นตอนที่เกี่ยวข้องกับเคสของคุณดังนี้ค่ะ ...",
      target: "ให้ข้อความดูเป็นธรรมชาติและตรงกับสถานการณ์จริง",
    },
    "5.1": {
      issue: "การทำงานตาม process ยังไม่ครบ หรือใช้ flow ไม่ถูกต้อง",
      guidance: [
        "ตรวจสอบ process ที่เกี่ยวข้องก่อนดำเนินการทุกครั้ง",
        "ใช้ category / flow / tag ให้ถูกต้อง",
        "ทบทวน SOP และ workflow ของทีมสม่ำเสมอ",
      ],
      example:
        "ดำเนินการตาม flow ที่กำหนดโดยเปิดเคสในหมวด ... และระบุรายละเอียดครบถ้วน",
      target: "ลดข้อผิดพลาดจากการทำงานไม่ตาม process",
    },
    "5.2": {
      issue: "SLA response ยังไม่สม่ำเสมอ หรือใช้เวลาตอบกลับนานเกินไป",
      guidance: [
        "ตอบรับลูกค้าภายใน SLA ก่อน แม้กำลังตรวจสอบ",
        "ถ้าต้องใช้เวลา ให้แจ้งลูกค้าล่วงหน้า",
        "ติดตามสถานะเคสระหว่างรอเพื่อไม่ให้เงียบเกิน SLA",
      ],
      example:
        "แอดมินกำลังตรวจสอบรายละเอียดเพิ่มเติมให้นะคะ ขออนุญาตใช้เวลาเล็กน้อยค่ะ",
      target: "รักษา SLA และลดช่วงเวลาที่ลูกค้ารอโดยไม่มีอัปเดต",
    },
    "5.3": {
      issue: "การบันทึกเคสหรืออัปเดตสถานะยังไม่ครบถ้วน",
      guidance: [
        "บันทึก remark และ status ให้ครบทุกครั้ง",
        "ใช้ชื่อเคสและ tag ให้ตรงมาตรฐาน",
        "ตรวจสอบก่อนปิดเคสว่ามีข้อมูลตกหล่นหรือไม่",
      ],
      example:
        "ก่อนปิดเคสควรตรวจสอบว่า status, category, และ remark ถูกต้องครบถ้วนแล้ว",
      target: "ให้ข้อมูลหลังบ้านครบและติดตามเคสย้อนหลังได้ง่าย",
    },
  };

  return (
    map[topicCode] || {
      issue: "พบโอกาสในการพัฒนาในหัวข้อนี้",
      guidance: [
        "ทบทวนบริบทเคสก่อนตอบ",
        "เพิ่มความชัดเจนของคำอธิบาย",
        "ระบุ next step ให้ชัดเจนขึ้น",
      ],
      example:
        "แอดมินขอแนะนำแนวทางที่ชัดเจนและสามารถดำเนินการต่อได้ทันทีดังนี้ค่ะ ...",
      target: "ยกระดับคุณภาพคำตอบให้สอดคล้องกับมาตรฐาน QA",
    }
  );
}

function buildOneOnOneSummary(args: {
  agentName: string;
  caseCount: number;
  averageScore: number;
  strongestTopic?: CoachingTopicSummary;
  weakestTopic?: CoachingTopicSummary;
  focusTopics: CoachingTopicSummary[];
  monthLabel: string;
  weekLabel: string;
  monthKey: string;
}) {
  const {
    agentName,
    caseCount,
    averageScore,
    strongestTopic,
    weakestTopic,
    focusTopics,
    monthLabel,
    weekLabel,
    monthKey,
  } = args;

  const grade = scoreToGrade(averageScore, monthKey);
  const focus1 = focusTopics[0];
  const focus2 = focusTopics[1];
  const focus3 = focusTopics[2];

  const scopeText = weekLabel === "All Weeks" ? `${monthLabel}` : `${monthLabel} / ${weekLabel}`;

  const overallComment =
    caseCount === 0
      ? `ในช่วง ${scopeText} ยังไม่พบเคสประเมินของ ${agentName} จึงยังไม่สามารถสรุปแนวทาง coaching ได้`
      : `${agentName} มีผลประเมินในช่วง ${scopeText} จำนวน ${caseCount} เคส ค่าเฉลี่ยอยู่ที่ ${averageScore.toFixed(
          2
        )} คะแนน อยู่ในระดับ ${grade} โดยภาพรวมยังควรรักษามาตรฐานในหัวข้อที่ทำได้ดี และเร่งพัฒนาในหัวข้อที่มีผลกระทบต่อคุณภาพคำตอบและความชัดเจนของการให้บริการ`;

  const strengthComment =
    strongestTopic
      ? `จุดแข็งที่เห็นได้ชัดคือหัวข้อ ${strongestTopic.code} ${strongestTopic.label} โดยมีผลการประเมินเฉลี่ย ${strongestTopic.pct.toFixed(
          2
        )}% สะท้อนว่ามีความสามารถในการดำเนินการตามมาตรฐานในหัวข้อนี้ได้ค่อนข้างดี ควรรักษาคุณภาพส่วนนี้ให้สม่ำเสมอในทุกเคส`
      : `ยังไม่สามารถระบุจุดแข็งได้จากข้อมูลปัจจุบัน`;

  const improvementComment =
    weakestTopic
      ? `หัวข้อที่ควรเร่งพัฒนาเป็นลำดับแรกคือ ${weakestTopic.code} ${weakestTopic.label} โดยมีผลการประเมินเฉลี่ย ${weakestTopic.pct.toFixed(
          2
        )}% ซึ่งสะท้อนว่ายังมีโอกาสพัฒนาในหัวข้อนี้อย่างชัดเจน โดยควรโฟกัสที่การตอบให้ครบถ้วน ชัดเจน และสอดคล้องกับบริบทเคสมากขึ้น`
      : `ยังไม่สามารถระบุหัวข้อที่ควรพัฒนาได้จากข้อมูลปัจจุบัน`;

  const focusList = [focus1, focus2, focus3]
    .filter(Boolean)
    .map((topic) => `${topic!.code} ${topic!.label}`)
    .join(" / ");

  const coachingDirection = focusList
    ? `สำหรับการ coaching รอบนี้ แนะนำให้เน้นติดตามหัวข้อ ${focusList} โดยใช้การ review จากเคสจริงร่วมกับการอธิบาย expected behavior ที่ควรเกิดขึ้นในแต่ละหัวข้อ เพื่อให้น้องสามารถเชื่อมโยงจากข้อผิดพลาดเดิมไปสู่แนวทางการตอบที่ถูกต้องได้ชัดเจนขึ้น`
    : `สำหรับการ coaching รอบนี้ ควรใช้เคสจริงประกอบการทบทวนเพื่อหาแนวทางพัฒนาที่เหมาะสม`;

  const nextStep = focus1
    ? `เป้าหมายในรอบถัดไปคือยกระดับหัวข้อ ${focus1.code} ${focus1.label} ให้มีคุณภาพดีขึ้นอย่างต่อเนื่อง พร้อมติดตามผลผ่านการสุ่มเคสและ feedback รายจุด เพื่อให้เห็นพัฒนาการเชิงพฤติกรรมอย่างชัดเจน`
    : `เป้าหมายในรอบถัดไปคือเพิ่มความสม่ำเสมอของคุณภาพการตอบในทุกเคส`;

  return {
    overallComment,
    strengthComment,
    improvementComment,
    coachingDirection,
    nextStep,
  };
}

function SongkranBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-0 top-10 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="absolute right-6 top-8 h-32 w-32 rounded-full bg-fuchsia-300/18 blur-3xl" />
      <div className="absolute left-1/4 bottom-0 h-36 w-36 rounded-full bg-sky-300/16 blur-3xl" />
      <div className="absolute right-1/3 bottom-2 h-24 w-24 rounded-full bg-violet-300/16 blur-2xl" />
      <div className="absolute left-[15%] top-[15%] h-3 w-3 rounded-full bg-white/80" />
      <div className="absolute right-[14%] top-[12%] h-4 w-4 rounded-full bg-cyan-200/70" />
    </div>
  );
}

function SongkranFlowerCorner({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div className={`pointer-events-none absolute ${className}`}>
      <div className="relative h-12 w-12">
        <span className="absolute left-4 top-0 h-4 w-4 rounded-full bg-pink-300/70" />
        <span className="absolute left-0 top-4 h-4 w-4 rounded-full bg-fuchsia-300/70" />
        <span className="absolute left-4 top-8 h-4 w-4 rounded-full bg-cyan-300/70" />
        <span className="absolute left-8 top-4 h-4 w-4 rounded-full bg-sky-300/70" />
        <span className="absolute left-4 top-4 h-4 w-4 rounded-full bg-white/85 shadow-sm" />
      </div>
    </div>
  );
}

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[30px] border border-violet-200/80 bg-white/95 shadow-[0_10px_35px_rgba(76,29,149,0.10)] backdrop-blur-sm ${className}`}
    >
      {isSongkranThemeActive() ? (
        <SongkranFlowerCorner className="-right-2 -top-2 scale-75 opacity-70" />
      ) : null}
      {children}
    </div>
  );
}

function PanelHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const songkranTheme = isSongkranThemeActive();

  return (
    <div
      className={`border-b px-5 py-4 ${
        songkranTheme
          ? "border-cyan-100 bg-gradient-to-r from-cyan-50 via-white to-fuchsia-50"
          : "border-violet-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50"
      }`}
    >
      <div className="text-[17px] font-bold tracking-tight text-slate-900">{title}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

function PanelBody({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`p-5 lg:p-6 ${className}`}>{children}</div>;
}

function MetricCard({
  title,
  value,
  sub,
  accent = "from-white via-violet-50/40 to-fuchsia-50/60 border-violet-200/70",
  valueClassName = "text-slate-900",
}: {
  title: string;
  value: string;
  sub: string;
  accent?: string;
  valueClassName?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[28px] border bg-gradient-to-br ${accent} shadow-[0_10px_30px_rgba(91,33,182,0.08)]`}
    >
      <div className="h-1.5 bg-gradient-to-r from-violet-950 via-violet-700 to-fuchsia-500" />
      {isSongkranThemeActive() ? (
        <span className="pointer-events-none absolute right-3 top-3 h-3 w-3 rounded-full bg-cyan-300/70" />
      ) : null}
      <div className="p-5 lg:p-6">
        <div className="text-[13px] font-semibold tracking-wide text-slate-500">{title}</div>
        <div
          className={`mt-3 text-4xl font-extrabold tracking-tight lg:text-[42px] ${valueClassName}`}
        >
          {value}
        </div>
        <div className="mt-3 text-xs leading-5 text-slate-500">{sub}</div>
      </div>
    </div>
  );
}

function LogoHeaderBox() {
  return (
    <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] border border-white/20 bg-white/12 shadow-[0_12px_34px_rgba(0,0,0,0.18)] backdrop-blur-md lg:h-28 lg:w-28">
      {isSongkranThemeActive() ? (
        <SongkranFlowerCorner className="-right-2 -top-2 scale-75 opacity-80" />
      ) : null}
      <img
        src="/robinhood-logo.png"
        alt="Robinhood Logo"
        className="relative z-10 h-16 w-16 object-contain lg:h-20 lg:w-20"
      />
    </div>
  );
}

function buildCoachingSummary(cases: CaseItem[]): CoachingTopicSummary[] {
  return TOPIC_MASTER.map((master) => {
    const caseTopicPairs = cases.map((item) => {
      const mergedTopics =
        item.reviewStatus === "Revised" && item.revisedTopics?.length
          ? mergeTopicSet(item.topics, item.revisedTopics)
          : item.topics;

      const topic = mergedTopics.find((t) => t.code === master.code);
      return { item, topic };
    });

    const valid = caseTopicPairs.filter((pair) => pair.topic) as {
      item: CaseItem;
      topic: Topic;
    }[];

    if (!valid.length) {
      return {
        code: master.code,
        label: master.label,
        avgScore: 0,
        pct: 0,
        max: master.max,
        failCount: 0,
        impactedCases: [],
        priority: "Low",
      };
    }

    const avg = valid.reduce((sum, row) => sum + row.topic.score, 0) / valid.length;
    const pct = (avg / master.max) * 100;

    const impactedCases = valid
      .filter((row) => row.topic.pct < 80)
      .map((row) => row.item);

    const failCount = impactedCases.length;
    const priority = getPriority(pct, failCount);

    return {
      code: master.code,
      label: master.label,
      avgScore: Number(avg.toFixed(2)),
      pct: Number(pct.toFixed(2)),
      max: master.max,
      failCount,
      impactedCases,
      priority,
    };
  });
}

type CoachingMockupProps = {
  currentUser: any;
  externalSelectedAgent?: string;
  externalSelectedMonth?: string;
  externalSelectedWeek?: string;
  onSelectedAgentChange?: (agent: string) => void;
  onSelectedMonthChange?: (month: string) => void;
  onSelectedWeekChange?: (week: string) => void;
};

export default function CoachingMockup({
  currentUser,
  externalSelectedAgent,
  externalSelectedMonth,
  externalSelectedWeek,
  onSelectedAgentChange,
  onSelectedMonthChange,
  onSelectedWeekChange,
}: CoachingMockupProps) {
  const [allCases, setAllCases] = useState<CaseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string>(externalSelectedAgent || "");
  const [selectedMonth, setSelectedMonth] = useState<string>(externalSelectedMonth || "all");
  const [selectedWeek, setSelectedWeek] = useState<string>(externalSelectedWeek || "all");

  const songkranTheme = useMemo(() => isSongkranThemeActive(), []);

  useEffect(() => {
    if (
      currentUser?.role !== "Agent" &&
      typeof externalSelectedAgent === "string" &&
      externalSelectedAgent !== selectedAgent
    ) {
      setSelectedAgent(externalSelectedAgent);
    }
  }, [externalSelectedAgent, currentUser, selectedAgent]);

  useEffect(() => {
    if (typeof externalSelectedMonth === "string" && externalSelectedMonth !== selectedMonth) {
      setSelectedMonth(externalSelectedMonth);
    }
  }, [externalSelectedMonth, selectedMonth]);

  useEffect(() => {
    if (typeof externalSelectedWeek === "string" && externalSelectedWeek !== selectedWeek) {
      setSelectedWeek(externalSelectedWeek);
    }
  }, [externalSelectedWeek, selectedWeek]);

  useEffect(() => {
    const loadWorkbook = async () => {
      try {
        setIsLoading(true);
        setLoadError("");

        const [rawResponse, appealResponse] = await Promise.all([
          fetch("/QA_RawData1.xlsx"),
          fetch("/Appleal ROWDATA.xlsx"),
        ]);

        if (!rawResponse.ok) {
          throw new Error("ไม่พบไฟล์ QA_RawData1.xlsx ในโฟลเดอร์ public");
        }
        if (!appealResponse.ok) {
          throw new Error("ไม่พบไฟล์ Appleal ROWDATA.xlsx ในโฟลเดอร์ public");
        }

        const rawBuffer = await rawResponse.arrayBuffer();
        const rawWorkbook =