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

const TOPIC_THAI_LABELS: Record<string, string> = {
  "1.1": "การทักทายและปิดบทสนทนา",
  "1.2": "ความถูกต้องของข้อมูล",
  "1.3": "การรักษาข้อมูลส่วนบุคคลและนโยบาย",
  "2.1": "ความตรงประเด็นของคำตอบ",
  "2.2": "การตอบให้ครบทุกประเด็น",
  "2.3": "การให้ขั้นตอนที่ทำตามได้จริง",
  "2.4": "การอ้างอิงข้อมูลจากแหล่งทางการ",
  "3.1": "การวิเคราะห์สาเหตุและแนวทางแก้ไข",
  "3.2": "การรับผิดชอบและดูแลเคสต่อเนื่อง",
  "3.3": "การบอกขั้นตอนถัดไปให้ชัดเจน",
  "4.1": "การเรียงลำดับข้อความ",
  "4.2": "ภาษาชัดเจน เข้าใจง่าย",
  "4.3": "น้ำเสียงและความเข้าใจลูกค้า",
  "4.4": "การปรับคำตอบให้เข้ากับบริบท",
  "5.1": "การทำตามขั้นตอนงาน",
  "5.2": "การตอบกลับตามเวลา",
  "5.3": "การบันทึกเคสและสถานะให้ถูกต้อง",
};

function getTopicDisplayLabel(topic: Pick<Topic, "code" | "label"> | Pick<CoachingTopicSummary, "code" | "label">) {
  return TOPIC_THAI_LABELS[topic.code] || topic.label;
}

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
const SONGKRAN_THEME_END = new Date(2026, 4, 25, 23, 59, 59);

const RESIGNED_AGENT_HIDE_AFTER: Record<string, string> = {
  "Arisa Aiemrit": "2026-04",
};

function isSongkranThemeActive() {
  return false;
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

function summarizeCaseInquiry(value: string) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "ไม่พบรายละเอียดคำถามของลูกค้า";
  return text.length > 150 ? `${text.slice(0, 150)}...` : text;
}

function buildTopicEvidenceNote(topic: Topic) {
  const guide = getCoachingGuide(topic.code);
  const scoreText = `${Number(topic.score || 0).toFixed(2)} / ${topic.max}`;
  const comment = String(topic.comment || "").replace(/\s+/g, " ").trim();
  const shortComment = comment
    ? comment.length > 180
      ? `${comment.slice(0, 180)}...`
      : comment
    : "";

  return {
    code: topic.code,
    label: getTopicDisplayLabel(topic),
    scoreText,
    pct: Number(topic.pct || 0),
    issueLine: shortComment || guide.issue,
    improveLine: guide.guidance[0] || guide.target,
    talkTrack: guide.example,
  };
}

function buildTopicPraiseNote(topic: Topic) {
  const label = getTopicDisplayLabel(topic);
  const scoreText = `${Number(topic.score || 0).toFixed(2)} / ${topic.max}`;
  return {
    code: topic.code,
    label,
    scoreText,
    pct: Number(topic.pct || 0),
    praiseLine: `เคสนี้ทำได้ดีในเรื่อง${label} คะแนนอยู่ในระดับดีมาก`,
    keepLine: "ควรชื่นชมวิธีตอบแบบนี้ และย้ำให้รักษามาตรฐานเดียวกันในเคสถัดไป",
    talkTrack: `ชม Agent ว่าเคสนี้ทำได้ดีตรง${label} แล้วให้ใช้เป็นตัวอย่างเวลาตอบเคสลักษณะใกล้เคียงกัน`,
  };
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

function roundExcelLikeMinute(date: Date) {
  const rounded = new Date(date.getTime());
  const seconds = rounded.getSeconds();
  const milliseconds = rounded.getMilliseconds();

  if (seconds >= 30 || milliseconds >= 500) {
    rounded.setMinutes(rounded.getMinutes() + 1);
  }

  rounded.setSeconds(0, 0);
  return rounded;
}

function excelDateToJSDate(value: any): Date | null {
  if (!value && value !== 0) return null;
  if (value instanceof Date) return roundExcelLikeMinute(value);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return roundExcelLikeMinute(new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0));
  }

  const text = String(value ?? "").trim();
  if (!text) return null;

  const ddmmyyyyMatch = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (ddmmyyyyMatch) {
    const [, d, m, y, hh = "0", mm = "0", ss = "0"] = ddmmyyyyMatch;
    return roundExcelLikeMinute(new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
  }

  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime())) return roundExcelLikeMinute(asDate);
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

function parseMonthLabelDate(value: any): Date | null {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const parsedDate = excelDateToJSDate(value);
  if (parsedDate) return new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1);

  const match = text.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;

  const monthIndex = new Date(`${match[1]} 1, ${match[2]}`).getMonth();
  if (Number.isNaN(monthIndex)) return null;
  return new Date(Number(match[2]), monthIndex, 1);
}

function getReportingMonthDate(monthStartRaw: any, monthLabelRaw: any, fallbackDate: Date | null) {
  return parseMonthLabelDate(monthLabelRaw) || excelDateToJSDate(monthStartRaw) || fallbackDate;
}

function getReportingMonthLabel(monthLabelRaw: any, monthDate: Date | null) {
  const label = String(monthLabelRaw ?? "").trim();
  return label || getMonthLabel(monthDate);
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

function getAppealVersionRank(value: any) {
  const matches = String(value ?? "").match(/\d+/g);
  return matches?.length ? Number(matches[matches.length - 1]) : -1;
}

function getAppealTimestampRank(helper: ReturnType<typeof buildHeaderHelpers>, row: any[]) {
  const raw =
    helper.getValue(row, "Appeal Result Date & Time") ??
    helper.getValue(row, "Appeal Result Date") ??
    helper.getValue(row, "Timestamp") ??
    helper.getValue(row, "Created Date & Time") ??
    helper.getValue(row, "Created Date");
  return excelDateToJSDate(raw)?.getTime() ?? -1;
}

function getLatestAppealRows(appealDataRows: any[][], helper: ReturnType<typeof buildHeaderHelpers>) {
  const latest = new Map<
    string,
    { row: any[]; index: number; versionRank: number; timestampRank: number }
  >();

  appealDataRows.forEach((row, index) => {
    const caseId = String(helper.getValue(row, "Case ID") ?? "").trim();
    if (!caseId) return;

    const candidate = {
      row,
      index,
      versionRank: Math.max(
        getAppealVersionRank(helper.getValue(row, "Appeal Version")),
        getAppealVersionRank(helper.getValue(row, "Version"))
      ),
      timestampRank: getAppealTimestampRank(helper, row),
    };

    const current = latest.get(caseId);
    if (
      !current ||
      candidate.versionRank > current.versionRank ||
      (candidate.versionRank === current.versionRank &&
        candidate.timestampRank > current.timestampRank) ||
      (candidate.versionRank === current.versionRank &&
        candidate.timestampRank === current.timestampRank &&
        candidate.index > current.index)
    ) {
      latest.set(caseId, candidate);
    }
  });

  return [...latest.values()].sort((a, b) => a.index - b.index).map((item) => item.row);
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

function dedupeAgentNames(names: string[]) {
  const agentMap = new Map<string, string>();
  names.forEach((name) => {
    const displayName = toTitleCaseName(name);
    const key = compactText(displayName);
    if (!displayName || agentMap.has(key)) return;
    agentMap.set(key, displayName);
  });
  return [...agentMap.values()].sort((a, b) => a.localeCompare(b));
}

function topicAdviceLabel(topic: CoachingTopicSummary) {
  if (topic.pct < 70 || topic.failCount >= 3) return "ควรปรับปรุง";
  if (topic.pct < 85 || topic.failCount >= 2) return "ควรพัฒนาเพิ่ม";
  return "ทำได้ดี ควรรักษาไว้";
}

function topicAdviceTone(topic: CoachingTopicSummary) {
  if (topic.pct < 70 || topic.failCount >= 3) return "border-rose-200 bg-rose-50 text-rose-700";
  if (topic.pct < 85 || topic.failCount >= 2) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
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

const SIMPLE_COACHING_GUIDES: Record<
  string,
  {
    issue: string;
    guidance: string[];
    example: string;
    target: string;
  }
> = {
  "1.1": {
    issue: "บางเคสยังเปิดหรือปิดบทสนทนาไม่ครบตามมาตรฐาน ทำให้ลูกค้ารู้สึกว่าการดูแลยังไม่จบสมบูรณ์",
    guidance: [
      "เริ่มด้วยคำทักทายและชื่อแอดมินให้ชัดเจน",
      "ก่อนปิดเคส ให้ถามหรือเปิดโอกาสว่าลูกค้ายังต้องการให้ช่วยเรื่องอื่นไหม",
      "ปิดท้ายด้วยข้อความสุภาพและเป็นมาตรฐานเดียวกันทุกเคส",
    ],
    example:
      "เคสนี้อยากให้ระวังช่วงปิดบทสนทนาเพิ่มนิดหนึ่งนะ ก่อนจบเคสให้เช็กกับลูกค้าอีกครั้งว่า ยังมีเรื่องไหนให้ช่วยเพิ่มเติมไหม แล้วค่อยปิดด้วยข้อความขอบคุณ จะทำให้เคสดูครบและสุภาพมากขึ้น",
    target: "ให้ทุกเคสมีคำทักทายและคำปิดที่ครบ อ่านแล้วรู้ว่าลูกค้าได้รับการดูแลจนจบ",
  },
  "1.2": {
    issue: "ข้อมูลที่ตอบยังมีโอกาสคลาดเคลื่อน หรือยังไม่ได้ยืนยันจากข้อมูลจริงก่อนตอบ",
    guidance: [
      "เช็กข้อมูลจากระบบหรือแหล่งอ้างอิงก่อนตอบทุกครั้ง",
      "ถ้ายังไม่มั่นใจ ให้บอกลูกค้าว่าขอตรวจสอบเพิ่มเติมก่อน",
      "เลี่ยงการตอบแบบคาดเดา โดยเฉพาะเรื่องสถานะ เงิน ออเดอร์ หรือเงื่อนไขบริการ",
    ],
    example:
      "เคสนี้จุดสำคัญคืออย่ารีบสรุปก่อนตรวจสอบนะ ถ้ายังไม่เห็นข้อมูลชัด ให้ตอบลูกค้าว่าแอดมินขอตรวจสอบรายละเอียดก่อน เพื่อให้ข้อมูลถูกต้องที่สุด วิธีนี้จะลดความเสี่ยงเรื่องตอบผิดได้",
    target: "ให้ข้อมูลถูกต้องและตรวจสอบได้ก่อนส่งคำตอบให้ลูกค้า",
  },
  "1.3": {
    issue: "ยังต้องระวังเรื่องการยืนยันตัวตนและการเปิดเผยข้อมูลส่วนบุคคลให้มากขึ้น",
    guidance: [
      "เคสที่เกี่ยวกับข้อมูลส่วนตัว ต้องขอยืนยันตัวตนก่อนให้รายละเอียด",
      "ตอบเฉพาะข้อมูลที่ลูกค้ามีสิทธิ์รับทราบ",
      "ไม่เปิดเผยข้อมูลของบุคคลอื่นหรือข้อมูลภายในที่ไม่จำเป็น",
    ],
    example:
      "เวลาเจอเคสที่มีข้อมูลส่วนตัว ให้หยุดเช็กก่อนว่าเรายืนยันตัวตนครบหรือยัง ถ้ายังไม่ครบ ให้ขอข้อมูลยืนยันก่อน แล้วค่อยตอบเฉพาะส่วนที่จำเป็น",
    target: "ให้ทุกเคสที่เกี่ยวกับข้อมูลส่วนตัวปลอดภัยตาม PDPA และนโยบายบริษัท",
  },
  "2.1": {
    issue: "คำตอบยังไม่ตรงกับปัญหาจริงของเคส หรือยังไม่ได้เชื่อมกับข้อมูลในแชทให้ชัด",
    guidance: [
      "อ่านคำถามและบริบทของลูกค้าให้ครบก่อนตอบ",
      "สรุปก่อนว่าลูกค้าต้องการให้ช่วยเรื่องอะไร",
      "ตอบให้ตรงกับข้อมูลของเคสนั้น ไม่ใช้คำตอบทั่วไปเกินไป",
    ],
    example:
      "เคสนี้อยากให้เริ่มจากจับประเด็นลูกค้าก่อนว่าเขาติดปัญหาอะไรจริง ๆ แล้วค่อยตอบตามข้อมูลในเคส ไม่ควรตอบเป็นขั้นตอนทั่วไปทันที เพราะอาจไม่ตรงกับปัญหาที่ลูกค้าเจอ",
    target: "ให้คำตอบตรงประเด็นและสอดคล้องกับบริบทของเคสจริง",
  },
  "2.2": {
    issue: "คำตอบยังไม่ครบทุกประเด็น ทำให้ลูกค้าอาจต้องถามซ้ำหรือยังไม่รู้ว่าต้องทำอะไรต่อ",
    guidance: [
      "แยกประเด็นที่ลูกค้าถามออกมาเป็นข้อ ๆ",
      "ตอบให้ครบทุกคำถาม ไม่ตอบเฉพาะประเด็นแรก",
      "ปิดท้ายด้วยสรุปสั้น ๆ ว่าลูกค้าต้องทำอะไรต่อ",
    ],
    example:
      "เคสนี้ลูกค้าถามมากกว่าหนึ่งเรื่อง แนะนำให้น้องแยกตอบเป็นข้อ 1, 2, 3 จะช่วยให้ลูกค้าเข้าใจง่าย และลดโอกาสที่ลูกค้าต้องถามซ้ำ",
    target: "ให้คำตอบครบทุกประเด็นที่ลูกค้าถามในครั้งเดียว",
  },
  "2.3": {
    issue: "คำแนะนำยังไม่ชัดพอว่าลูกค้าหรือ Agent ต้องทำอะไรต่อเป็นลำดับ",
    guidance: [
      "เขียนคำแนะนำเป็นขั้นตอนสั้น ๆ",
      "ระบุให้ชัดว่าใครต้องทำอะไร",
      "บอกผลลัพธ์ที่ลูกค้าควรรอหรือคาดหวังหลังทำตามขั้นตอน",
    ],
    example:
      "เวลาจะให้ลูกค้าทำตามขั้นตอน ลองเรียงเป็น 1, 2, 3 และใช้คำสั้น ๆ จะช่วยให้ลูกค้าทำตามได้ง่ายกว่าเขียนเป็นย่อหน้ายาว",
    target: "ให้ลูกค้าหรือ Agent อ่านแล้วทำตามได้ทันที",
  },
  "2.4": {
    issue: "ยังต้องทำให้แหล่งข้อมูลที่ใช้อ้างอิงชัดขึ้น เพื่อให้คำตอบน่าเชื่อถือ",
    guidance: [
      "ใช้ข้อมูลจากระบบหรือ KB ล่าสุดก่อนตอบ",
      "ถ้าข้อมูลมีเงื่อนไข ให้บอกเงื่อนไขนั้นให้ครบ",
      "เลี่ยงการตอบจากความจำถ้าเป็นเรื่องที่เปลี่ยนแปลงได้",
    ],
    example:
      "เคสนี้ให้คุยกับน้องว่า ถ้าเป็นข้อมูลที่มีเงื่อนไขหรือเปลี่ยนได้ ต้องเช็กจากแหล่งทางการก่อน แล้วค่อยตอบลูกค้า จะช่วยให้คำตอบแม่นและมั่นใจขึ้น",
    target: "ให้ทุกคำตอบอ้างอิงจากข้อมูลที่ถูกต้องและเป็นปัจจุบัน",
  },
  "3.1": {
    issue: "ยังวิเคราะห์สาเหตุของปัญหาไม่ลึกพอ ทำให้แนวทางแก้ไม่ตรงจุด",
    guidance: [
      "แยกอาการของปัญหาออกจากสาเหตุจริง",
      "ดูข้อมูลในเคสก่อนสรุปว่าเกิดจากอะไร",
      "ให้แนวทางแก้ที่สัมพันธ์กับสาเหตุ ไม่ใช่ตอบแบบกว้าง ๆ",
    ],
    example:
      "เคสนี้อยากให้ชวนน้องดูว่า ปัญหาที่ลูกค้าเล่าคืออาการ แต่เราต้องหาให้เจอว่าสาเหตุคืออะไร แล้วค่อยเลือกคำตอบหรือวิธีแก้ให้ตรงจุด",
    target: "ให้คำตอบแก้ปัญหาได้ตรงสาเหตุ ไม่ใช่แค่ตอบตามอาการ",
  },
  "3.2": {
    issue: "การดูแลเคสยังไม่ต่อเนื่องพอ หรือยังไม่ได้แสดงความรับผิดชอบต่อเคสให้ชัด",
    guidance: [
      "บอกลูกค้าว่าแอดมินจะดำเนินการอะไรให้ต่อ",
      "ถ้าต้องส่งต่อหรือรอตรวจสอบ ให้แจ้งเหตุผลและสิ่งที่จะเกิดขึ้น",
      "อย่าปล่อยให้ลูกค้าไม่รู้ว่าเคสไปถึงขั้นตอนไหนแล้ว",
    ],
    example:
      "เวลาต้องรอตรวจสอบหรือส่งต่อ ให้บอกลูกค้าให้ชัดว่าแอดมินรับเรื่องไว้แล้ว กำลังดำเนินการอะไร และลูกค้าควรรอผลแบบไหน จะช่วยให้ลูกค้ารู้สึกว่าเคสยังถูกดูแลอยู่",
    target: "ให้ลูกค้าเห็นว่า Agent รับผิดชอบเคสตั้งแต่ต้นจนจบ",
  },
  "3.3": {
    issue: "ยังบอกขั้นตอนถัดไปไม่ชัด ทำให้ลูกค้าไม่รู้ว่าต้องรอ ต้องทำ หรือจะได้รับผลเมื่อไร",
    guidance: [
      "บอกขั้นตอนถัดไปให้ชัดก่อนจบคำตอบ",
      "ถ้ามีระยะเวลารอ ให้แจ้งช่วงเวลาที่เหมาะสม",
      "ถ้าลูกค้าต้องเตรียมข้อมูลเพิ่ม ให้ระบุรายการให้ครบ",
    ],
    example:
      "ก่อนจบเคส ให้เพิ่มประโยคสั้น ๆ ว่า ต่อจากนี้ลูกค้าต้องทำอะไร หรือแอดมินจะดำเนินการอะไรต่อ ลูกค้าจะได้ไม่ค้างและไม่ต้องถามซ้ำ",
    target: "ให้ลูกค้ารู้ขั้นตอนถัดไปชัดเจนทุกครั้ง",
  },
  "4.1": {
    issue: "ข้อความยังเรียงลำดับไม่ชัด ทำให้อ่านแล้วจับประเด็นยาก",
    guidance: [
      "เริ่มจากสรุปปัญหาของลูกค้า",
      "ตามด้วยคำตอบหรือผลตรวจสอบ",
      "ปิดด้วยขั้นตอนถัดไปหรือสิ่งที่ลูกค้าต้องทำ",
    ],
    example:
      "ลองให้น้องจัดคำตอบเป็นสามช่วง: รับทราบปัญหา, แจ้งผลหรือคำตอบ, บอกทางต่อ โครงสร้างนี้จะช่วยให้ข้อความอ่านง่ายขึ้นมาก",
    target: "ให้ข้อความอ่านง่าย เป็นลำดับ และไม่ทำให้ลูกค้าสับสน",
  },
  "4.2": {
    issue: "ภาษายังยาวหรือไม่กระชับพอ อาจทำให้ลูกค้าเข้าใจยาก",
    guidance: [
      "ใช้ประโยคสั้นและตรงความหมาย",
      "เลี่ยงคำซ้ำหรือคำที่ทำให้กำกวม",
      "อ่านทวนก่อนส่งว่าลูกค้าเข้าใจได้ในครั้งเดียวหรือไม่",
    ],
    example:
      "จุดนี้ให้คุยกับน้องเรื่องการทำประโยคให้สั้นลง ถ้าประโยคยาวเกินไป ลูกค้าอาจจับใจความยาก ลองแบ่งเป็นสองประโยคหรือแยกเป็นข้อ",
    target: "ให้ภาษาชัด กระชับ และเข้าใจง่าย",
  },
  "4.3": {
    issue: "น้ำเสียงยังสามารถทำให้นุ่มและเห็นใจลูกค้ามากขึ้นได้",
    guidance: [
      "เริ่มด้วยการรับทราบหรือเข้าใจความกังวลของลูกค้า",
      "ใช้คำสุภาพและลดคำที่ฟังแข็ง",
      "ถ้าเป็นปัญหาที่ลูกค้าเดือดร้อน ให้เพิ่มประโยคแสดงความเข้าใจ",
    ],
    example:
      "เคสที่ลูกค้ากังวลหรือไม่พอใจ ให้เริ่มด้วยประโยคที่แสดงว่าเราเข้าใจเขาก่อน แล้วค่อยอธิบายวิธีดำเนินการ จะทำให้บทสนทนานุ่มขึ้น",
    target: "ให้ลูกค้ารู้สึกว่าได้รับการรับฟังและดูแลอย่างสุภาพ",
  },
  "4.4": {
    issue: "รูปแบบคำตอบยังไม่เข้ากับสถานการณ์ของเคสมากพอ",
    guidance: [
      "ดูว่าลูกค้าเป็น Rider, Merchant หรือ Customer แล้วปรับคำให้เหมาะ",
      "ปรับระดับรายละเอียดตามความซับซ้อนของปัญหา",
      "ถ้าเคสเร่งด่วนหรือมีผลกระทบสูง ให้ตอบให้ชัดและตรงกว่าเคสทั่วไป",
    ],
    example:
      "อยากให้น้องดูบริบทก่อนตอบว่าเคสนี้เป็นใคร เจอปัญหาแบบไหน แล้วปรับคำตอบให้เหมาะกับสถานการณ์ ไม่ใช้คำตอบเดียวกันทุกเคส",
    target: "ให้คำตอบเหมาะกับบริบทและประเภทลูกค้าในแต่ละเคส",
  },
  "5.1": {
    issue: "ขั้นตอนการทำงานยังอาจข้ามบางจุด เช่น ตรวจสอบไม่ครบ หรือยังไม่ดำเนินการตาม flow ให้ชัด",
    guidance: [
      "เช็ก flow งานก่อนตอบหรือปิดเคส",
      "ถ้าต้องตรวจสอบหลายจุด ให้ทำตามลำดับและบันทึกให้ครบ",
      "ก่อนปิดเคส ให้ทวนว่า action สำคัญทำครบแล้วหรือยัง",
    ],
    example:
      "เคสนี้ควรคุยเรื่องการตาม flow ให้ครบก่อนปิดเคส เช่น ตรวจสอบข้อมูล, แจ้งผล, บันทึก action และปิดสถานะให้ถูกต้อง เพื่อให้เคสไม่ตกหล่น",
    target: "ให้การทำงานครบขั้นตอนและตรวจสอบย้อนหลังได้",
  },
  "5.2": {
    issue: "ยังมีโอกาสตอบช้าหรือปล่อยช่วงรอโดยไม่มีการอัปเดตลูกค้า",
    guidance: [
      "รับเรื่องและตอบกลับให้อยู่ใน SLA",
      "ถ้าต้องใช้เวลาตรวจสอบ ให้แจ้งลูกค้าก่อน",
      "ระหว่างรอ อย่าปล่อยให้บทสนทนาเงียบเกินไป",
    ],
    example:
      "ถ้าต้องใช้เวลาตรวจสอบ ให้ให้น้องส่งข้อความอัปเดตสั้น ๆ ก่อน เช่น แอดมินกำลังตรวจสอบให้นะคะ ขอเวลาเล็กน้อย วิธีนี้ช่วยลดความรู้สึกรอของลูกค้าได้",
    target: "ให้ลูกค้าได้รับการตอบกลับและอัปเดตภายในเวลาที่เหมาะสม",
  },
  "5.3": {
    issue: "การบันทึกเคสหรือสถานะยังไม่ครบ ทำให้ติดตามย้อนหลังได้ยาก",
    guidance: [
      "บันทึกผลการตรวจสอบและ action ที่ทำให้ครบ",
      "เลือก tag, status หรือ remark ให้ตรงกับเคส",
      "ก่อนปิดเคสให้ตรวจว่าข้อมูลหลังบ้านถูกต้องแล้ว",
    ],
    example:
      "เคสนี้ให้เน้นเรื่องการบันทึกหลังบ้าน ถ้า action ทำแล้วแต่ไม่ได้ note หรือ status ไม่ตรง เวลาเช็กย้อนหลังจะยาก ควรทวนทุกครั้งก่อนปิดเคส",
    target: "ให้ข้อมูลหลังบ้านครบ ถูกต้อง และติดตามย้อนหลังได้ง่าย",
  },
};

function getCoachingGuide(topicCode: string) {
  const simpleGuide = SIMPLE_COACHING_GUIDES[topicCode];
  if (simpleGuide) return simpleGuide;

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
      example:
        "แอดมินต้องขออภัยในความไม่สะดวกที่เกิดขึ้นด้วยนะคะ",
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
      example: "แอดมินขอแนะนำแนวทางที่ชัดเจนและสามารถดำเนินการต่อได้ทันทีดังนี้ค่ะ ...",
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

  const scopeText =
    weekLabel === "ทุกสัปดาห์"
      ? `${monthLabel}`
      : `${monthLabel} / ${weekLabel}`;

  const focusList = [focus1, focus2, focus3]
    .filter(Boolean)
    .map((topic) => `${topic!.code} ${topic!.label}`)
    .join(", ");

  if (caseCount === 0) {
    return {
      overallComment: `ช่วง ${scopeText} ยังไม่พบเคสของ ${agentName} จึงยังสรุปประเด็นสำหรับคุย coaching ไม่ได้`,
      strengthComment: "ยังไม่มีข้อมูลเพียงพอสำหรับสรุปจุดแข็ง",
      improvementComment: "ยังไม่มีข้อมูลเพียงพอสำหรับสรุปจุดที่ควรปรับ",
      coachingDirection: "เมื่อมีเคสใหม่เข้ามา ควรเริ่มจากดูคะแนนรายหัวข้อและเลือกเคสตัวอย่างที่เห็นพฤติกรรมชัดที่สุดมาคุย",
      nextStep: "รอข้อมูลเคสประเมินรอบถัดไป แล้วค่อยสรุปหัวข้อ coaching อีกครั้ง",
    };
  }

  return {
    overallComment: `${agentName} มีเคสในช่วง ${scopeText} ทั้งหมด ${caseCount} เคส คะแนนเฉลี่ย ${averageScore.toFixed(
      2
    )} อยู่ระดับ ${grade} ภาพรวมให้เริ่มคุยจากหัวข้อที่คะแนนต่ำก่อน แล้วใช้เคสจริงประกอบเพื่อให้น้องเห็นว่าควรปรับตรงไหน`,
    strengthComment: strongestTopic
      ? `จุดที่ทำได้ดีคือ ${strongestTopic.code} ${strongestTopic.label} เฉลี่ย ${strongestTopic.pct.toFixed(
          2
        )}% ควรชมและย้ำให้น้องรักษามาตรฐานนี้ไว้ในทุกเคส`
      : "ยังไม่พบจุดแข็งที่สรุปได้ชัดจากข้อมูลชุดนี้",
    improvementComment: weakestTopic
      ? `จุดที่ควรคุยก่อนคือ ${weakestTopic.code} ${weakestTopic.label} เฉลี่ย ${weakestTopic.pct.toFixed(
          2
        )}% แนะนำให้หยิบเคสที่เสียคะแนนในหัวข้อนี้มาดูร่วมกัน แล้วชี้ให้เห็นว่าคำตอบเดิมยังขาดอะไร`
      : "ยังไม่พบหัวข้อที่ต้องเร่งปรับเป็นพิเศษจากข้อมูลชุดนี้",
    coachingDirection: focusList
      ? `แนวทางคุยกับ Agent รอบนี้ ให้โฟกัส ${focusList} โดยเริ่มจากอ่านเคสจริง สรุปจุดที่ทำได้ดี แล้วค่อยคุยจุดที่ต้องปรับเป็นข้อ ๆ เพื่อให้น้องนำไปใช้กับเคสถัดไปได้ทันที`
      : "แนวทางคุยกับ Agent รอบนี้ ให้ใช้เคสจริงเป็นตัวอย่าง และสรุปพฤติกรรมที่ควรรักษากับสิ่งที่ต้องปรับให้ชัดเจน",
    nextStep: focus1
      ? `เป้าหมายรอบถัดไปคือให้ ${focus1.code} ${focus1.label} ดีขึ้น โดยติดตามจากเคสใหม่และดูว่าคำตอบชัดขึ้น ครบขึ้น หรือทำตามขั้นตอนได้ดีขึ้นหรือไม่`
      : "เป้าหมายรอบถัดไปคือรักษาคุณภาพการตอบให้สม่ำเสมอ และติดตามผลจากเคสใหม่",
  };

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

  const legacyFocusList = [focus1, focus2, focus3]
    .filter(Boolean)
    .map((topic) => `${topic!.code} ${topic!.label}`)
    .join(" / ");

  const coachingDirection = legacyFocusList
    ? `สำหรับการ coaching รอบนี้ แนะนำให้เน้นติดตามหัวข้อ ${legacyFocusList} โดยใช้การ review จากเคสจริงร่วมกับการอธิบาย expected behavior ที่ควรเกิดขึ้นในแต่ละหัวข้อ เพื่อให้น้องสามารถเชื่อมโยงจากข้อผิดพลาดเดิมไปสู่แนวทางการตอบที่ถูกต้องได้ชัดเจนขึ้น`
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
      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-r from-cyan-200/15 via-fuchsia-200/10 to-sky-200/15" />
      <div className="absolute left-[-40px] top-10 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="absolute right-0 top-12 h-36 w-36 rounded-full bg-fuchsia-300/20 blur-3xl" />
      <div className="absolute left-1/3 bottom-0 h-40 w-40 rounded-full bg-sky-300/15 blur-3xl" />
      <div className="absolute right-1/4 bottom-4 h-28 w-28 rounded-full bg-violet-300/15 blur-3xl" />
      <div className="absolute left-[10%] top-[20%] h-3 w-3 rounded-full bg-white/80" />
      <div className="absolute left-[18%] top-[12%] h-4 w-4 rounded-full bg-cyan-300/60" />
      <div className="absolute right-[12%] top-[18%] h-3 w-3 rounded-full bg-pink-300/50" />
      <div className="absolute left-5 bottom-4 hidden rounded-[24px] border border-white/20 bg-white/10 px-3 py-2 text-2xl backdrop-blur md:flex">🔫💦</div>
      <div className="absolute right-5 top-4 hidden rounded-[24px] border border-white/20 bg-white/10 px-3 py-2 text-2xl backdrop-blur md:flex">🪣🌸</div>
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
  const songkranTheme = isSongkranThemeActive();

  return (
    <div
      className={`relative overflow-hidden rounded-[30px] border shadow-[0_10px_35px_rgba(76,29,149,0.10)] backdrop-blur-sm ${
        songkranTheme
          ? "border-cyan-200/80 bg-white/95"
          : "border-violet-200/80 bg-white/95"
      } ${className}`}
    >
      {songkranTheme ? <SongkranFlowerCorner className="-right-2 -top-2 scale-75 opacity-70" /> : null}
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
  valueClassName = "text-4xl text-slate-900 lg:text-[42px]",
}: {
  title: string;
  value: string;
  sub: string;
  accent?: string;
  valueClassName?: string;
}) {
  const songkranTheme = isSongkranThemeActive();

  return (
    <div
      className={`relative overflow-hidden rounded-[28px] border bg-gradient-to-br ${accent} shadow-[0_10px_30px_rgba(91,33,182,0.08)]`}
    >
      <div
        className={`h-1.5 ${
          songkranTheme
            ? "bg-gradient-to-r from-sky-600 via-cyan-500 to-fuchsia-500"
            : "bg-gradient-to-r from-violet-950 via-violet-700 to-fuchsia-500"
        }`}
      />
      {songkranTheme ? (
        <span className="pointer-events-none absolute right-3 top-3 h-3 w-3 rounded-full bg-cyan-300/70" />
      ) : null}
      <div className="p-5 lg:p-6">
        <div className="text-[13px] font-semibold tracking-wide text-slate-500">{title}</div>
        <div className={`mt-3 min-w-0 break-words font-extrabold tracking-tight ${valueClassName}`}>
          {value}
        </div>
        <div className="mt-3 text-xs leading-5 text-slate-500">{sub}</div>
      </div>
    </div>
  );
}

function LogoHeaderBox() {
  const songkranTheme = isSongkranThemeActive();

  return (
    <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] border border-white/20 bg-white/12 shadow-[0_12px_34px_rgba(0,0,0,0.18)] backdrop-blur-md lg:h-28 lg:w-28">
      {songkranTheme ? <SongkranFlowerCorner className="-right-2 -top-2 scale-75 opacity-80" /> : null}
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
        label: getTopicDisplayLabel(master),
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
      label: getTopicDisplayLabel(master),
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
        const rawWorkbook = XLSX.read(rawBuffer, { type: "array", cellDates: true });
        const rawSheet =
          rawWorkbook.Sheets["Raw_Data"] || rawWorkbook.Sheets[rawWorkbook.SheetNames[0]];

        const rawRows = XLSX.utils.sheet_to_json<any[]>(rawSheet, {
          header: 1,
          defval: null,
          raw: true,
        });

        const rawHeaderIndex = (() => {
          for (let i = 0; i < rawRows.length; i++) {
            const row = (rawRows[i] || []) as any[];
            const normalized = row.map((v) => normalizeText(v));
            if (normalized.includes("agent name") && normalized.includes("case id")) return i;
          }
          return -1;
        })();

        if (rawHeaderIndex === -1) {
          throw new Error("ไม่พบแถว Header ในไฟล์ QA_RawData1.xlsx");
        }

        const rawHeaderRow = (rawRows[rawHeaderIndex] || []) as any[];
        const rawDataRows = rawRows.slice(rawHeaderIndex + 1);
        const rawHelper = buildHeaderHelpers(rawHeaderRow);

        const appealBuffer = await appealResponse.arrayBuffer();
        const appealWorkbook = XLSX.read(appealBuffer, { type: "array", cellDates: true });
        const appealSheet =
          appealWorkbook.Sheets["Appeal_Data"] || appealWorkbook.Sheets[appealWorkbook.SheetNames[0]];

        const appealRows = XLSX.utils.sheet_to_json<any[]>(appealSheet, {
          header: 1,
          defval: null,
          raw: true,
        });

        const appealHeaderIndex = (() => {
          for (let i = 0; i < appealRows.length; i++) {
            const row = (appealRows[i] || []) as any[];
            const normalized = row.map((v) => normalizeText(v));
            if (normalized.includes("case id")) return i;
          }
          return -1;
        })();

        if (appealHeaderIndex === -1) {
          throw new Error("ไม่พบแถว Header ในไฟล์ Appleal ROWDATA.xlsx");
        }

        const appealHeaderRow = (appealRows[appealHeaderIndex] || []) as any[];
        const appealDataRows = appealRows.slice(appealHeaderIndex + 1);
        const appealHelper = buildHeaderHelpers(appealHeaderRow);

        const appealMap = new Map<string, AppealMergeItem>();

        getLatestAppealRows(appealDataRows, appealHelper).forEach((row) => {
          const caseId = String(appealHelper.getValue(row, "Case ID") ?? "").trim();
          if (!caseId) return;

          const revisedTopics: Topic[] = [];
          const displayRevisedTopicCodes: string[] = [];

          TOPIC_MASTER.forEach((topic) => {
            const originalScoreRaw = appealHelper.getValue(row, `${topic.code} Score`);
            const revisedScoreRaw = appealHelper.getValue(row, `${topic.code} Revised Score`);
            const originalCommentRaw = appealHelper.getValue(row, `${topic.code} Comment`);
            const revisedCommentRaw = appealHelper.getValue(row, `${topic.code} Revised Comment`);

            const hasRevisedScore =
              revisedScoreRaw !== null &&
              revisedScoreRaw !== "" &&
              !Number.isNaN(Number(revisedScoreRaw));

            const hasRevisedComment =
              revisedCommentRaw !== null && String(revisedCommentRaw).trim() !== "";

            if (!hasRevisedScore && !hasRevisedComment) return;

            const score = hasRevisedScore ? Number(revisedScoreRaw) : Number(originalScoreRaw ?? 0);
            const comment = hasRevisedComment
              ? String(revisedCommentRaw).trim()
              : String(originalCommentRaw ?? "").trim();

            revisedTopics.push({
              code: topic.code,
              label: getTopicDisplayLabel(topic),
              score,
              max: topic.max,
              pct: topic.max > 0 ? Math.round((score / topic.max) * 100) : 0,
              comment,
            });

            if (
              Number(originalScoreRaw ?? 0) !== Number(revisedScoreRaw ?? originalScoreRaw ?? 0) ||
              String(originalCommentRaw ?? "").trim() !== String(revisedCommentRaw ?? "").trim()
            ) {
              displayRevisedTopicCodes.push(topic.code);
            }
          });

          const explicitFinalScore = appealHelper.getLastValue(row, "Final Score");
          const explicitOriginalFinalScore = appealHelper.getValue(row, "Final Score", 0);

          const finalScore =
            explicitFinalScore !== null &&
            explicitFinalScore !== "" &&
            !Number.isNaN(Number(explicitFinalScore))
              ? Number(explicitFinalScore)
              : undefined;

          const previousScore =
            explicitOriginalFinalScore !== null &&
            explicitOriginalFinalScore !== "" &&
            !Number.isNaN(Number(explicitOriginalFinalScore))
              ? Number(explicitOriginalFinalScore)
              : undefined;

          if (!revisedTopics.length && finalScore === undefined) return;

          appealMap.set(caseId, {
            caseId,
            finalScore,
            previousScore,
            reviewStatus: displayRevisedTopicCodes.length ? "Revised" : "Original",
            revisedTopics,
            displayRevisedTopicCodes,
          });
        });

        const mapped: CaseItem[] = rawDataRows
          .filter(
            (row) => row && rawHelper.getValue(row, "Agent Name") && rawHelper.getValue(row, "Case ID")
          )
          .map((row, index) => {
            const topics: Topic[] = TOPIC_MASTER.map((topic) => {
              const scoreVal = Number(rawHelper.getValue(row, `${topic.code} Score`) || 0);
              const score = Number.isFinite(scoreVal) ? scoreVal : 0;
              const commentVal = rawHelper.getValue(row, `${topic.code} Comment`);

              return {
                code: topic.code,
                label: getTopicDisplayLabel(topic),
                score,
                max: topic.max,
                pct: topic.max > 0 ? Math.round((score / topic.max) * 100) : 0,
                comment: commentVal ? String(commentVal).trim() : "",
              };
            });

            const caseId = String(rawHelper.getValue(row, "Case ID")).trim();
            const mergedAppeal = appealMap.get(caseId);

            const baseFinalScore =
              Number(rawHelper.getValue(row, "Final Score")) ||
              topics.reduce((sum, topic) => sum + topic.score, 0);

            const finalScoreVal =
              mergedAppeal?.finalScore ??
              (mergedAppeal?.revisedTopics?.length
                ? calcMergedFinalScore(topics, mergedAppeal.revisedTopics)
                : baseFinalScore);

            const previousScoreVal = mergedAppeal?.previousScore ?? baseFinalScore;

            const inquiry =
              rawHelper.getValue(row, "Customer Inquiry") ??
              rawHelper.getValue(row, "Inquiry TH") ??
              rawHelper.getValue(row, "Inquiry");

            const weekLabel =
              rawHelper.getValue(row, "Week Label") ??
              rawHelper.getValue(row, "Week") ??
              "-";

            const auditDateRaw = rawHelper.getValue(row, "Audit Date");
            const auditDateObj = excelDateToJSDate(auditDateRaw);
            const monthDate = getReportingMonthDate(
              rawHelper.getValue(row, "Month Start"),
              rawHelper.getValue(row, "Month Label"),
              auditDateObj
            );
            const monthKey = getMonthKey(monthDate);

            const reviewStatus: ReviewStatus =
              mergedAppeal?.displayRevisedTopicCodes?.length ? "Revised" : "Original";

            return {
              key: `row-${index + 1}-${caseId}`,
              agent: toTitleCaseName(String(rawHelper.getValue(row, "Agent Name")).trim()),
              auditDate: formatAuditDate(auditDateRaw),
              auditDateObj,
              monthKey,
              monthLabel: getReportingMonthLabel(rawHelper.getValue(row, "Month Label"), monthDate),
              weekLabel: String(weekLabel || "-").trim(),
              caseId,
              inquiryTh: inquiry ? String(inquiry).trim() : "-",
              inquiryEn: inquiry ? String(inquiry).trim() : "-",
              finalScore: finalScoreVal,
              previousScore: previousScoreVal,
              grade: scoreToGrade(finalScoreVal, monthKey),
              reviewStatus,
              topics,
              revisedTopics: mergedAppeal?.revisedTopics?.length ? mergedAppeal.revisedTopics : null,
              displayRevisedTopicCodes: mergedAppeal?.displayRevisedTopicCodes || [],
            };
          });

        setAllCases(mapped.filter((item) => item.agent && item.caseId));
      } catch (error: any) {
        setLoadError(error?.message || "โหลดไฟล์ Excel ไม่สำเร็จ");
      } finally {
        setIsLoading(false);
      }
    };

    loadWorkbook();
  }, []);

  const latestMonthKey = useMemo(() => {
    return (
      [...new Set(allCases.map((item) => item.monthKey).filter((item) => item !== "unknown"))]
        .sort((a, b) => b.localeCompare(a))[0] || "all"
    );
  }, [allCases]);

  const visibleAgentList = useMemo(() => {
    const agentsFromCases = allCases.map((item) => String(item.agent || "").trim()).filter(Boolean);

    const effectiveMonthForVisibility =
      selectedMonth !== "all" ? selectedMonth : latestMonthKey;

    const mergedAgents = dedupeAgentNames([...AGENT_MASTER, ...agentsFromCases])
      .filter((name) => !shouldHideAgentByMonth(name, effectiveMonthForVisibility))
      .sort((a, b) => a.localeCompare(b));

    if (currentUser?.role === "Agent" && currentUser.agentName) {
      return mergedAgents.filter((agent) => isSameAgent(agent, currentUser.agentName));
    }

    return mergedAgents;
  }, [allCases, currentUser, selectedMonth, latestMonthKey]);

  useEffect(() => {
    if (currentUser?.role === "Agent" && currentUser.agentName) {
      const normalizedAgent = toTitleCaseName(currentUser.agentName);
      setSelectedAgent(normalizedAgent);
      onSelectedAgentChange?.(normalizedAgent);
      return;
    }

    if (!selectedAgent && visibleAgentList.length) {
      const firstAgent = visibleAgentList[0];
      setSelectedAgent(firstAgent);
      onSelectedAgentChange?.(firstAgent);
    }
  }, [currentUser, visibleAgentList, selectedAgent, onSelectedAgentChange]);

  useEffect(() => {
    if (
      currentUser?.role !== "Agent" &&
      selectedAgent &&
      !visibleAgentList.some((agent) => isSameAgent(agent, selectedAgent))
    ) {
      const fallback = visibleAgentList[0] || "";
      setSelectedAgent(fallback);
      onSelectedAgentChange?.(fallback);
      setSelectedMonth("all");
      onSelectedMonthChange?.("all");
      setSelectedWeek("all");
      onSelectedWeekChange?.("all");
    }
  }, [
    selectedAgent,
    visibleAgentList,
    currentUser,
    onSelectedAgentChange,
    onSelectedMonthChange,
    onSelectedWeekChange,
  ]);

  const effectiveAgent =
    currentUser?.role === "Agent" && currentUser.agentName
      ? toTitleCaseName(currentUser.agentName)
      : selectedAgent;

  const baseAgentCases = useMemo(() => {
    if (!effectiveAgent) return [];
    return allCases.filter((item) => isSameAgent(item.agent, effectiveAgent));
  }, [allCases, effectiveAgent]);

  const monthOptions = useMemo(() => {
    const unique = Array.from(
      new Map(
        baseAgentCases
          .filter((item) => item.monthKey !== "unknown")
          .map((item) => [item.monthKey, item.monthLabel])
      ).entries()
    )
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => b.value.localeCompare(a.value));

    return unique;
  }, [baseAgentCases]);

  useEffect(() => {
    if (!monthOptions.length) {
      setSelectedMonth("all");
      return;
    }

    if (selectedMonth === "all") return;

    if (!monthOptions.some((item) => item.value === selectedMonth)) {
      const fallbackMonth = monthOptions[0].value;
      setSelectedMonth(fallbackMonth);
      onSelectedMonthChange?.(fallbackMonth);
    }
  }, [monthOptions, selectedMonth, onSelectedMonthChange]);

  const monthFilteredCases = useMemo(() => {
    if (selectedMonth === "all") return baseAgentCases;
    return baseAgentCases.filter((item) => item.monthKey === selectedMonth);
  }, [baseAgentCases, selectedMonth]);

  const weekOptions = useMemo(() => {
    return [...new Set(monthFilteredCases.map((item) => item.weekLabel).filter(Boolean))].sort();
  }, [monthFilteredCases]);

  useEffect(() => {
    if (!weekOptions.length) {
      setSelectedWeek("all");
      return;
    }

    if (selectedWeek === "all") return;

    if (!weekOptions.includes(selectedWeek)) {
      setSelectedWeek("all");
      onSelectedWeekChange?.("all");
    }
  }, [weekOptions, selectedWeek, onSelectedWeekChange]);

  const agentCases = useMemo(() => {
    if (selectedWeek === "all") return monthFilteredCases;
    return monthFilteredCases.filter((item) => item.weekLabel === selectedWeek);
  }, [monthFilteredCases, selectedWeek]);

  const currentAverage =
    agentCases.reduce((sum, item) => sum + item.finalScore, 0) / Math.max(agentCases.length, 1);

  const currentPolicyMonthKey =
    selectedMonth !== "all"
      ? selectedMonth
      : [...new Set(agentCases.map((item) => item.monthKey).filter((item) => item !== "unknown"))]
          .sort((a, b) => a.localeCompare(b))
          .slice(-1)[0] || "unknown";

  const coachingTopics = useMemo(() => {
    return buildCoachingSummary(agentCases).sort((a, b) => {
      const pA = a.priority === "High" ? 3 : a.priority === "Medium" ? 2 : 1;
      const pB = b.priority === "High" ? 3 : b.priority === "Medium" ? 2 : 1;
      if (pB !== pA) return pB - pA;
      if (a.pct !== b.pct) return a.pct - b.pct;
      return a.code.localeCompare(b.code);
    });
  }, [agentCases]);

  const strongestTopic = useMemo(() => {
    return [...buildCoachingSummary(agentCases)].sort((a, b) => b.pct - a.pct)[0];
  }, [agentCases]);

  const weakestTopic = useMemo(() => {
    return [...buildCoachingSummary(agentCases)].sort((a, b) => a.pct - b.pct)[0];
  }, [agentCases]);

  const focusTopics = coachingTopics.slice(0, 5);

  const caseEvidenceRows = useMemo(() => {
    const focusCodes = new Set(focusTopics.map((item) => item.code));
    return agentCases
      .map((item) => {
        const mergedTopics =
          item.reviewStatus === "Revised" && item.revisedTopics?.length
            ? mergeTopicSet(item.topics, item.revisedTopics)
            : item.topics;

        const evidenceTopics = mergedTopics
          .filter((topic) => focusCodes.has(topic.code) && topic.pct < 80)
          .map(buildTopicEvidenceNote);

        return {
          ...item,
          evidenceTopics,
        };
      })
      .filter((item) => item.evidenceTopics.length > 0)
      .sort((a, b) => a.finalScore - b.finalScore);
  }, [agentCases, focusTopics]);

  const praiseCaseRows = useMemo(() => {
    const strongestCodes = new Set(
      [strongestTopic?.code, ...focusTopics.filter((topic) => topic.pct >= 90).map((topic) => topic.code)].filter(
        Boolean
      ) as string[]
    );

    return agentCases
      .map((item) => {
        const mergedTopics =
          item.reviewStatus === "Revised" && item.revisedTopics?.length
            ? mergeTopicSet(item.topics, item.revisedTopics)
            : item.topics;

        const praiseTopics = mergedTopics
          .filter((topic) => topic.pct >= 90 && (strongestCodes.size === 0 || strongestCodes.has(topic.code)))
          .map(buildTopicPraiseNote);

        return {
          ...item,
          praiseTopics,
        };
      })
      .filter((item) => item.praiseTopics.length > 0)
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, 4);
  }, [agentCases, focusTopics, strongestTopic]);

  const currentMonthLabel =
    selectedMonth === "all"
      ? "ทุกเดือน"
      : monthOptions.find((item) => item.value === selectedMonth)?.label || selectedMonth;

  const currentWeekLabel = selectedWeek === "all" ? "ทุกสัปดาห์" : selectedWeek;
  const currentScopeLabel = `${currentMonthLabel} • ${currentWeekLabel}`;

  const oneOnOneSummary = useMemo(() => {
    return buildOneOnOneSummary({
      agentName: effectiveAgent || "-",
      caseCount: agentCases.length,
      averageScore: currentAverage,
      strongestTopic,
      weakestTopic,
      focusTopics,
      monthLabel: currentMonthLabel,
      weekLabel: currentWeekLabel,
      monthKey: currentPolicyMonthKey,
    });
  }, [
    effectiveAgent,
    agentCases.length,
    currentAverage,
    strongestTopic,
    weakestTopic,
    focusTopics,
    currentMonthLabel,
    currentWeekLabel,
    currentPolicyMonthKey,
  ]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-3xl border border-violet-200 bg-white px-6 py-5 text-slate-700 shadow-sm">
          กำลังโหลด Coaching Dashboard...
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f6f2ff] via-[#fcfbff] to-[#f3e8ff] p-6">
        <div className="max-w-xl rounded-3xl border border-rose-200 bg-white px-6 py-5 text-rose-700 shadow-sm">
          <div className="text-lg font-semibold">โหลดไฟล์ไม่สำเร็จ</div>
          <div className="mt-2 text-sm">{loadError}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative min-h-screen ${
        songkranTheme
          ? "bg-gradient-to-br from-cyan-50 via-sky-50 to-fuchsia-50"
          : "bg-gradient-to-br from-[#f6f2ff] via-[#fcfbff] to-[#f3e8ff]"
      }`}
    >
      {songkranTheme ? <SongkranBackdrop /> : null}

      <div
        className={`relative text-white shadow-[0_16px_40px_rgba(76,29,149,0.22)] ${
          songkranTheme
            ? "bg-gradient-to-r from-sky-700 via-cyan-600 to-fuchsia-700"
            : "bg-gradient-to-r from-violet-950 via-violet-900 to-fuchsia-700"
        }`}
      >
        {songkranTheme ? <SongkranBackdrop /> : null}

        <div className="mx-auto max-w-[1720px] px-6 py-8 lg:px-8 lg:py-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-4xl">
              <div className="text-xs font-semibold uppercase tracking-[0.35em] text-violet-200">
                QA COACHING
              </div>
              <div className="mt-2 text-3xl font-bold tracking-tight lg:text-4xl">
                พื้นที่สรุป Coaching ราย Agent
              </div>
              <div className="mt-3 max-w-3xl text-sm leading-6 text-violet-100/95">
                สรุปจากคะแนนและเคสจริง ว่าแต่ละคนควรได้รับคำชมเรื่องไหน และควรปรับปรุงส่วนไหนให้ชัดเจน
              </div>
              {songkranTheme ? (
                <div className="mt-4 inline-flex rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-semibold text-white/95 backdrop-blur-sm">
                  Songkran Theme Active
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-4 rounded-[28px] border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
              <LogoHeaderBox />
              <div className="hidden sm:block">
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-200">
                  Robinhood QA
                </div>
                <div className="mt-1 text-lg font-semibold text-white">
                  แผนคุยและติดตามผล
                </div>
                <div className="mt-1 text-sm text-violet-100/90">
                  จุดดี / จุดที่ควรปรับ / เคสตัวอย่าง
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1720px] px-6 py-6 lg:px-8 lg:py-8">
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-6">
            <Panel className="sticky top-4">
              <PanelHeader
                title="ตัวกรอง Coaching"
                subtitle="เลือก Agent เดือน และสัปดาห์ที่ต้องการดู"
              />
              <PanelBody className="space-y-5">
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
                    รายชื่อ Agent
                  </div>
                  {currentUser?.role === "Agent" ? (
                    <div className="break-words rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-4 py-3 text-sm font-semibold leading-6 text-violet-800">
                      {effectiveAgent || "-"}
                    </div>
                  ) : (
                    <select
                      value={selectedAgent}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSelectedAgent(value);
                        onSelectedAgentChange?.(value);
                        setSelectedMonth("all");
                        onSelectedMonthChange?.("all");
                        setSelectedWeek("all");
                        onSelectedWeekChange?.("all");
                      }}
                      className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                    >
                      {visibleAgentList.map((agent) => (
                        <option key={agent} value={agent}>
                          {agent}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
                    เดือน
                  </div>
                  <select
                    value={selectedMonth}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedMonth(value);
                      onSelectedMonthChange?.(value);
                      setSelectedWeek("all");
                      onSelectedWeekChange?.("all");
                    }}
                    className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  >
                    <option value="all">ทุกเดือน</option>
                    {monthOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
                    สัปดาห์
                  </div>
                  <select
                    value={selectedWeek}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedWeek(value);
                      onSelectedWeekChange?.(value);
                    }}
                    className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  >
                    <option value="all">ทุกสัปดาห์</option>
                    {weekOptions.map((week) => (
                      <option key={week} value={week}>
                        {week}
                      </option>
                    ))}
                  </select>
                </div>

                <div
                  className={`rounded-2xl px-4 py-4 ${
                    songkranTheme
                      ? "border border-cyan-100 bg-cyan-50"
                      : "border border-violet-100 bg-violet-50"
                  }`}
                >
                  <div
                    className={`text-[11px] font-semibold uppercase tracking-wide ${
                      songkranTheme ? "text-cyan-700" : "text-violet-700"
                    }`}
                  >
                    ขอบเขตข้อมูลที่กำลังดู
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-800">{currentScopeLabel}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-700">
                    ใช้สำหรับดูภาพรวม จุดที่ควรชม จุดที่ควรปรับ และเคสตัวอย่างที่นำไปคุยต่อได้ทันที
                  </div>
                </div>
              </PanelBody>
            </Panel>
          </div>

          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <MetricCard
                title="Agent ที่เลือก"
                value={effectiveAgent || "-"}
                sub="คนที่กำลังดูข้อมูล"
                accent={
                  songkranTheme
                    ? "from-white via-cyan-50/50 to-fuchsia-50/60 border-cyan-200/80"
                    : "from-white via-violet-50/50 to-fuchsia-50/60 border-violet-200/80"
                }
                valueClassName={`${songkranTheme ? "text-cyan-700" : "text-violet-900"} break-words text-[16px] leading-6 lg:text-[18px]`}
              />
              <MetricCard
                title="จำนวนเคสที่ใช้ดู"
                value={String(agentCases.length)}
                sub={currentScopeLabel}
                accent="from-sky-50 via-white to-sky-100/70 border-sky-200"
                valueClassName="text-sky-700"
              />
              <MetricCard
                title="คะแนนเฉลี่ย"
                value={currentAverage.toFixed(2)}
                sub="คะแนนคุณภาพเฉลี่ย"
                accent={
                  songkranTheme
                    ? "from-white via-cyan-50/50 to-fuchsia-50/60 border-cyan-200/80"
                    : "from-white via-violet-50/50 to-fuchsia-50/60 border-violet-200/80"
                }
                valueClassName={songkranTheme ? "text-cyan-700" : "text-violet-900"}
              />
              <MetricCard
                title="เกรดปัจจุบัน"
                value={scoreToGrade(currentAverage, currentPolicyMonthKey)}
                sub={isNewPolicyMonth(currentPolicyMonthKey) ? "เกณฑ์ใหม่" : "เกณฑ์เดิม"}
                accent="from-white via-amber-50/50 to-amber-100/70 border-amber-200"
                valueClassName="text-amber-700"
              />
              <MetricCard
                title="หัวข้อที่ควรคุย"
                value={weakestTopic?.code || "-"}
                sub={weakestTopic?.label || "ยังไม่มีหัวข้อที่ต้องคุย"}
                accent="from-rose-50 via-white to-rose-100/70 border-rose-200"
                valueClassName="text-rose-700"
              />
              <MetricCard
                title="เดือนของเกณฑ์"
                value={currentPolicyMonthKey === "unknown" ? "-" : currentPolicyMonthKey}
                sub={isNewPolicyMonth(currentPolicyMonthKey) ? "ใช้เกณฑ์ใหม่" : "ใช้เกณฑ์เดิม"}
                accent="from-emerald-50 via-white to-emerald-100/70 border-emerald-200"
                valueClassName="text-emerald-700"
              />
            </div>

            <Panel>
              <PanelHeader
                title="สรุปสำหรับคุยกับ Agent"
                subtitle="สรุปจากคะแนนและเคสจริง เพื่อใช้คุยแบบเข้าใจง่าย"
              />
              <PanelBody className="space-y-4">
                <div
                  className={`rounded-2xl px-4 py-4 ${
                    songkranTheme
                      ? "border border-cyan-200 bg-cyan-50"
                      : "border border-violet-200 bg-violet-50"
                  }`}
                >
                  <div
                    className={`text-xs font-bold uppercase tracking-wide ${
                      songkranTheme ? "text-cyan-700" : "text-violet-700"
                    }`}
                  >
                    ภาพรวม
                  </div>
                  <div className="mt-2 text-sm leading-7 text-slate-700">
                    {oneOnOneSummary.overallComment}
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                      จุดที่ควรรักษาไว้
                    </div>
                    <div className="mt-2 text-sm leading-7 text-slate-700">
                      {oneOnOneSummary.strengthComment}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-rose-700">
                      จุดที่ควรคุยก่อน
                    </div>
                    <div className="mt-2 text-sm leading-7 text-slate-700">
                      {oneOnOneSummary.improvementComment}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-amber-700">
                    แนวทางคุยกับ Agent
                  </div>
                  <div className="mt-2 text-sm leading-7 text-slate-700">
                    {oneOnOneSummary.coachingDirection}
                  </div>
                </div>

                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-sky-700">
                    เป้าหมายรอบถัดไป
                  </div>
                  <div className="mt-2 text-sm leading-7 text-slate-700">
                    {oneOnOneSummary.nextStep}
                  </div>
                </div>
              </PanelBody>
            </Panel>

            <div className="grid gap-6 xl:grid-cols-2">
            <Panel>
              <PanelHeader
                title="ภาพรวม Coaching"
                subtitle="ดูเร็วว่าส่วนไหนควรชื่นชม และส่วนไหนควรปรับปรุง"
              />
              <PanelBody className="space-y-4">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                    ส่วนที่ทำได้ดี ควรชื่นชม
                  </div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">
                      {strongestTopic ? `${strongestTopic.code} ${strongestTopic.label}` : "-"}
                    </div>
                    <div className="mt-1 text-xs text-emerald-700">
                      เฉลี่ย {strongestTopic ? strongestTopic.pct.toFixed(2) : "0.00"}%
                    </div>
                  </div>

                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-rose-700">
                    ส่วนที่ควรปรับปรุง
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">
                      {weakestTopic ? `${weakestTopic.code} ${weakestTopic.label}` : "-"}
                    </div>
                    <div className="mt-1 text-xs text-rose-700">
                      เฉลี่ย {weakestTopic ? weakestTopic.pct.toFixed(2) : "0.00"}%
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      สรุปคำแนะนำ
                    </div>
                    <div className="mt-2 text-sm leading-7 text-slate-700">
                      {effectiveAgent
                        ? `ควรเริ่มจากชื่นชมส่วนที่ทำได้ดีคือ ${strongestTopic?.code || "-"} ${
                            strongestTopic?.label || ""
                          } เพื่อให้น้องรู้ว่าควรรักษามาตรฐานตรงไหนไว้ จากนั้นค่อยคุยเรื่องที่ควรปรับปรุงคือ ${
                            weakestTopic?.code || "-"
                          } ${weakestTopic?.label || ""} โดยใช้เคสจริงเป็นตัวอย่างให้เห็นว่าคำตอบเดิมขาดอะไร และครั้งถัดไปควรตอบให้ครบ ชัด หรือตรงประเด็นขึ้นอย่างไร`
                        : "-"}
                    </div>
                  </div>
                </PanelBody>
              </Panel>

              <Panel>
              <PanelHeader
                title="หัวข้อสรุปจากคะแนน"
                subtitle="บอกให้ชัดว่าส่วนไหนควรปรับปรุง และส่วนไหนทำได้ดี"
                />
                <PanelBody className="space-y-3">
                  {focusTopics.length ? (
                    focusTopics.map((topic) => (
                      <div
                        key={topic.code}
                        className="relative rounded-2xl border border-violet-100 bg-white px-4 py-4 shadow-sm"
                      >
                        {songkranTheme ? (
                          <span className="pointer-events-none absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-cyan-300/70" />
                        ) : null}
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-bold text-slate-900">
                              {topic.code} {topic.label}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              เฉลี่ย {topic.avgScore.toFixed(2)} / {topic.max} ({topic.pct.toFixed(2)}%)
                            </div>
                          </div>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${topicAdviceTone(
                              topic
                            )}`}
                          >
                            {topicAdviceLabel(topic)}
                          </span>
                        </div>

                        <div className="mt-3 text-xs text-slate-600">
                          พบใน {topic.failCount} เคสที่ยังควรหยิบมาคุย
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-slate-500">ยังไม่มีข้อมูลสำหรับ coaching</div>
                  )}
                </PanelBody>
              </Panel>
            </div>

            <Panel>
              <PanelHeader
                title="รายละเอียดที่ใช้คุย"
                subtitle="แปลงคะแนนแต่ละหัวข้อเป็นภาษาง่าย ๆ สำหรับสื่อสารกับ Agent"
              />
              <PanelBody className="space-y-5">
                {focusTopics.length ? (
                  focusTopics.map((topic) => {
                    const guide = getCoachingGuide(topic.code);

                    return (
                      <div
                        key={topic.code}
                        className={`relative rounded-[24px] border p-5 shadow-sm ${
                          songkranTheme
                            ? "border-cyan-200/80 bg-gradient-to-br from-white via-cyan-50/30 to-fuchsia-50/40"
                            : "border-violet-200/80 bg-gradient-to-br from-white via-violet-50/30 to-fuchsia-50/40"
                        }`}
                      >
                        {songkranTheme ? (
                          <SongkranFlowerCorner className="-right-2 -top-2 scale-75 opacity-70" />
                        ) : null}

                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="text-lg font-bold tracking-tight text-slate-900">
                              {topic.code} {topic.label}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              เฉลี่ย {topic.avgScore.toFixed(2)} / {topic.max} · {topic.pct.toFixed(2)}%
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${topicAdviceTone(
                                topic
                              )}`}
                            >
                              {topicAdviceLabel(topic)}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                              กระทบ {topic.failCount} เคส
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
                            <div className="text-xs font-bold uppercase tracking-wide text-rose-700">
                              ปัญหาที่พบจากคะแนน
                            </div>
                            <div className="mt-2 text-sm leading-7 text-slate-700">{guide.issue}</div>
                          </div>

                          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                            <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                              เป้าหมายที่อยากให้ปรับ
                            </div>
                            <div className="mt-2 text-sm leading-7 text-slate-700">{guide.target}</div>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-4 xl:grid-cols-2">
                          <div
                            className={`rounded-2xl px-4 py-4 ${
                              songkranTheme
                                ? "border border-cyan-200 bg-cyan-50"
                                : "border border-violet-200 bg-violet-50"
                            }`}
                          >
                            <div
                              className={`text-xs font-bold uppercase tracking-wide ${
                                songkranTheme ? "text-cyan-700" : "text-violet-700"
                              }`}
                            >
                              วิธีคุย / วิธีแนะนำ
                            </div>
                            <div className="mt-3 space-y-2">
                              {guide.guidance.map((item, index) => (
                                <div
                                  key={index}
                                  className="rounded-xl border border-violet-100 bg-white px-3 py-3 text-sm leading-6 text-slate-700"
                                >
                                  {index + 1}. {item}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                              ตัวอย่างประโยคที่ใช้พูด
                            </div>
                            <div className="mt-3 whitespace-pre-line rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-700">
                              {guide.example}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-sm text-slate-500">ยังไม่มีหัวข้อที่ต้องคุยเพิ่มเติม</div>
                )}
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader
                title="ตัวอย่างเคสที่ควรหยิบมาคุย"
                subtitle="สรุปให้เห็นภาพว่าเคสพูดเรื่องอะไร พลาดตรงไหน และควรปรับอย่างไร"
              />
              <PanelBody className="space-y-4">
                {praiseCaseRows.length ? (
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1 border-b border-emerald-100 pb-3">
                      <div className="text-sm font-extrabold text-emerald-800">เคสที่ทำได้ดี ควรชื่นชม</div>
                      <div className="text-xs leading-5 text-slate-500">
                        ใช้เป็นตัวอย่างให้ Agent เห็นว่าส่วนไหนควรรักษามาตรฐานไว้
                      </div>
                    </div>

                    <div className="space-y-4">
                      {praiseCaseRows.map((item, caseIndex) => (
                        <article
                          key={`praise-${item.key}`}
                          className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
                        >
                          <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50/70 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-extrabold text-white">
                                {caseIndex + 1}
                              </div>
                              <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-bold text-emerald-700">
                                  {item.caseId}
                                </span>
                                <span className="text-xs font-semibold text-slate-500">
                                  วันที่ตรวจ {item.auditDate}
                                </span>
                              </div>
                              <div className="mt-2 text-sm leading-6 text-slate-700">
                                <span className="font-bold text-slate-900">เคสนี้พูดเรื่อง:</span>{" "}
                                {summarizeCaseInquiry(item.inquiryTh || item.inquiryEn)}
                              </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm lg:justify-end">
                              <span className="font-bold text-slate-500">คะแนน</span>
                              <span className="font-extrabold text-emerald-700">
                                คะแนน {item.finalScore.toFixed(2)}
                              </span>
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${getGradeTone(
                                  item.grade
                                )}`}
                              >
                                เกรด {item.grade}
                              </span>
                            </div>
                          </div>

                          <div className="divide-y divide-slate-200 px-5">
                            {item.praiseTopics.slice(0, 2).map((topic, topicIndex) => (
                              <div key={`praise-${item.key}-${topic.code}`} className="py-4">
                                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-extrabold text-slate-700">
                                      {topic.code}
                                    </span>
                                    <h4 className="text-base font-extrabold text-slate-950">{topic.label}</h4>
                                  </div>
                                  <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                                    {topic.scoreText} ({topic.pct.toFixed(0)}%)
                                  </span>
                                </div>

                                {[
                                  ["เรื่องที่ทำได้ดี", topic.praiseLine, "text-emerald-700"],
                                  ["ควรรักษาไว้", topic.keepLine, "text-slate-600"],
                                  ["วิธีพูดกับ Agent", topic.talkTrack, "text-violet-700"],
                                ].map(([label, value, tone], rowIndex) => (
                                  <div
                                    key={`${topicIndex}-${label}`}
                                    className="grid gap-2 py-3 text-sm lg:grid-cols-[190px_minmax(0,1fr)]"
                                  >
                                    <div className={`font-extrabold uppercase tracking-[0.12em] ${tone}`}>
                                      {rowIndex + 1}. {label}
                                    </div>
                                    <div className="leading-7 text-slate-800">{value}</div>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}

                {caseEvidenceRows.length ? (
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1 border-b border-rose-100 pb-3">
                      <div className="text-sm font-extrabold text-rose-800">เคสที่ต้องปรับปรุง</div>
                      <div className="text-xs leading-5 text-slate-500">
                        ใช้คุยให้เห็นชัดว่าเคสพูดเรื่องอะไร พลาดตรงไหน และควรปรับคำตอบอย่างไร
                      </div>
                    </div>

                    {caseEvidenceRows.slice(0, 8).map((item, caseIndex) => (
                      <article
                        key={item.key}
                        className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
                      >
                      <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50/70 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-extrabold text-white">
                            {caseIndex + 1}
                          </div>
                          <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
                              {item.caseId}
                            </span>
                            <span className="text-xs font-semibold text-slate-500">
                              วันที่ตรวจ {item.auditDate}
                            </span>
                          </div>
                          <div className="mt-2 text-sm leading-6 text-slate-700">
                            <span className="font-bold text-slate-900">เคสนี้พูดเรื่อง:</span>{" "}
                            {summarizeCaseInquiry(item.inquiryTh || item.inquiryEn)}
                          </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm lg:justify-end">
                          <span className="font-bold text-slate-500">คะแนน</span>
                          <span className="font-extrabold text-slate-900">
                            คะแนน {item.finalScore.toFixed(2)}
                          </span>
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${getGradeTone(
                              item.grade
                            )}`}
                          >
                            เกรด {item.grade}
                          </span>
                        </div>
                      </div>

                      <div className="divide-y divide-slate-200 px-5">
                        {item.evidenceTopics.slice(0, 3).map((topic, topicIndex) => (
                          <div key={`${item.key}-${topic.code}`} className="py-4">
                            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-extrabold text-slate-700">
                                  {topic.code}
                                </span>
                                <h4 className="text-base font-extrabold text-slate-950">{topic.label}</h4>
                              </div>
                              <span className="w-fit rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-bold text-rose-700">
                                {topic.scoreText} ({topic.pct.toFixed(0)}%)
                              </span>
                            </div>

                            {[
                              ["เรื่องที่พบในเคส", topic.issueLine, "text-rose-700"],
                              ["ควรปรับปรุงแบบไหน", topic.improveLine, "text-slate-600"],
                              ["วิธีพูดกับ Agent", topic.talkTrack, "text-violet-700"],
                            ].map(([label, value, tone], rowIndex) => (
                              <div
                                key={`${topicIndex}-${label}`}
                                className="grid gap-2 py-3 text-sm lg:grid-cols-[190px_minmax(0,1fr)]"
                              >
                                <div className={`font-extrabold uppercase tracking-[0.12em] ${tone}`}>
                                  {rowIndex + 1}. {label}
                                </div>
                                <div className="leading-7 text-slate-800">{value}</div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </article>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
                    ยังไม่พบเคสตัวอย่างสำหรับหัวข้อนี้
                  </div>
                )}
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader
                title="แผนติดตามหลังคุย"
                subtitle="สรุปว่าหลังคุยแล้วควรให้ Agent ฝึกหรือรักษามาตรฐานเรื่องอะไร"
              />
              <PanelBody className="p-0">
                <div className="overflow-x-auto">
                  <table className="min-w-[1100px] w-full text-sm">
                    <thead>
                      <tr className="bg-violet-950 text-[11px] text-white">
                        <th className="px-4 py-3 text-left">หัวข้อ</th>
                        <th className="px-4 py-3 text-left">สิ่งที่อยากให้ทำได้</th>
                        <th className="px-4 py-3 text-left">วิธีฝึก</th>
                        <th className="px-4 py-3 text-left">ผู้ติดตาม</th>
                        <th className="px-4 py-3 text-left">เป้าหมาย</th>
                        <th className="px-4 py-3 text-left">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {focusTopics.length ? (
                        focusTopics.map((topic) => {
                          const guide = getCoachingGuide(topic.code);

                          return (
                            <tr key={topic.code} className="bg-white">
                              <td className="border-t border-slate-200 px-4 py-3 font-semibold text-slate-900">
                                {topic.code} {topic.label}
                              </td>
                              <td className="border-t border-slate-200 px-4 py-3 text-slate-700">
                                {guide.target}
                              </td>
                              <td className="border-t border-slate-200 px-4 py-3 text-slate-700">
                                ดูเคสตัวอย่างร่วมกัน / ฝึกเรียงคำตอบใหม่ / ติดตามผลจากเคสถัดไป
                              </td>
                              <td className="border-t border-slate-200 px-4 py-3 text-slate-700">
                                QA / Supervisor / Agent
                              </td>
                              <td className="border-t border-slate-200 px-4 py-3 text-slate-700">
                                ภายในรอบ coaching ถัดไป
                              </td>
                              <td className="border-t border-slate-200 px-4 py-3 text-slate-700">
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                                  กำลังติดตาม
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td
                            colSpan={6}
                            className="border-t border-slate-200 px-4 py-6 text-center text-sm text-slate-500"
                          >
                            ยังไม่มีแผนติดตาม
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </PanelBody>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
