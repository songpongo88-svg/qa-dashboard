import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import PageHero from "./PageHero";
import { registerTHSarabunNew } from "./THSarabunNew-jsPDF";
import { type UsageLogEvent } from "./usageLog";
import { fetchAppealEvents } from "./appealStore";
import { buildAppealRequests } from "./AppealRequestsMockup";
import { fetchStoredEvaluations, type StoredEvaluation } from "./evaluationStore";
import { getIncentiveByGrade, scoreToGrade } from "./lib/scoreIncentivePolicy";
import {
  clearStoredSignatureConfirm,
  fetchStoredSignatureDocuments,
  saveStoredSignatureConfirm,
  saveStoredSignatureDocument,
} from "./signatureStore";

type CurrentUser = {
  username: string;
  displayName: string;
  role: string;
  agentName: string;
  email?: string;
};

type UserAccountSnapshot = {
  username: string;
  displayName: string;
  role: string;
  agentName: string;
  email?: string;
  teamLead?: string;
  teamName?: string;
  status?: string;
};

type SignRole = "QA" | "Supervisor" | "Senior" | "Agent";
type SignStatus = "Signed" | "Pending";
type SignatureStepStatus = "Signed" | "Pending" | "Waiting" | "Locked" | "Expired";
type WorkspaceStatus = "pending" | "signed" | "in-progress" | "expired";
type WorkspaceQuickFilter = "all" | WorkspaceStatus;

type SignatureEntry = {
  role: SignRole;
  signerName: string;
  signedBy: string;
  signedAt: string;
  status: SignStatus;
  note?: string;
  signatureDataUrl?: string;
  resetBy?: string;
  resetAt?: string;
};

type SignatureCaseDetail = {
  caseId: string;
  auditDate: string;
  inquiry: string;
  finalScore: number;
  grade: string;
  comment: string;
  topics?: Array<{
    code: string;
    title: string;
    max: number;
    score: number;
  }>;
};

type SignatureDocument = {
  id: string;
  monthKey: string;
  monthLabel: string;
  agentName: string;
  seniorName: string;
  supervisorName: string;
  qaName: string;
  teamName: string;
  caseCount: number;
  averageScore: number;
  grade: string;
  eligibleByScore: boolean;
  documentHash: string;
  cases: SignatureCaseDetail[];
};

type SignatureWindow = {
  openAt: Date;
  dueAt: Date;
  appealCloseAt: Date;
};

type PendingAppealCase = {
  caseId: string;
  agent: string;
  status: string;
  submittedAt: string;
};

type SignatureApprovedAppeal = {
  caseId: string;
  finalScore: number;
  previousScore: number;
  reviewedAt: string;
  topics?: SignatureCaseDetail["topics"];
};

const RAW_DATA_FILES = [
  "/QA_RawData_January-February2026.xlsx",
  "/QA_RawData_March-May2026.xlsx",
];

const SIGNATURE_STORAGE_KEY = "qa-monthly-signature-center-v4";
const SIGNATURE_CONFIRM_KEY = "qa-monthly-signature-confirmed-v1";
const SIGNATURE_LIBRARY_KEY = "qa-monthly-signature-library-v1";
const SIGNATURE_FLOW: SignRole[] = ["QA", "Supervisor", "Senior", "Agent"];
const HISTORICAL_PAID_LAST_MONTH = "2026-04";
const CASE_TARGET = 10;
const FORCE_EXPORT_ALL_EVALUATED_MONTHS = new Set(["2026-05"]);
const SIGNATURE_DEADLINE_RESET_NOTE = "Deadline reset by QA";
const SIGNATURE_RESET_WINDOW_DAYS = 3;
const SIGNATURE_RESET_WINDOW_MS = SIGNATURE_RESET_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const DEFAULT_SUPERVISOR_SIGNER = "Phrommarin Thaithorn";
const SIGNATURE_ROWS_PER_PAGE_OPTIONS = [10, 20, 50];
const SIGNATURE_NEW_POLICY_START_MONTH_KEY = "2026-04";
const SIGNATURE_JUNE_POLICY_START_MONTH_KEY = "2026-06";
const SIGNATURE_TOPIC_MISSING = "__signature_topic_missing__";

type SignatureTopicMasterItem = { code: string; label: string; max: number };

const SIGNATURE_JAN_FEB_2026_TOPIC_MASTER = [
  { code: "1", label: "เปิ�”-ปิ�”การสน�—นา", max: 10 },
  { code: "2", label: "วิเคราะห์/แก้ไข", max: 30 },
  { code: "3", label: "ปฏิบั�•เธดเธ•ามขั้น�•อน", max: 20 },
  { code: "4", label: "ความสุ� าพ", max: 10 },
  { code: "5", label: "ภาษา", max: 20 },
  { code: "6", label: "ระยะเวลา", max: 10 },
] as const;

const SIGNATURE_LEGACY_TOPIC_MASTER = [
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

const SIGNATURE_APRIL_2026_TOPIC_MASTER = [
  { code: "1.1", label: "เธกเธฒเธ•รฐานการ�—ัก�—ายและปิ�”การสน�—นา", max: 10 },
  { code: "1.2", label: "การปฏิบั�•เธดเธ•เธฒเธก PDPA / Policy / ข้อกำหน�”", max: 10 },
  { code: "1.3", label: "การปฏิบั�•เธดเธ•ามกระบวนการและ SLA", max: 10 },
  { code: "2.1", label: "ความ�–ูก�•้องของคำ�•อบ", max: 10 },
  { code: "2.2", label: "ความครบ�–้วนของคำ�•อบ", max: 10 },
  { code: "2.3", label: "ความชั�”เจนของขั้น�•อนและแหล่งอ้างอิง", max: 5 },
  { code: "3.1", label: "การวิเคราะห์และแก้ไขปัญหาไ�”้�•รงจุ�”", max: 15 },
  { code: "3.2", label: "Ownership และการแจ้ง Next Step", max: 10 },
  { code: "4.1", label: "โครงสร้างข้อความและความอ่านง่าย", max: 5 },
  { code: "4.2", label: "ความกระชับและความ�–ูก�•้องของ� เธฒเธฉเธฒ", max: 5 },
  { code: "4.3", label: "น้ำเสียงและความเหมาะสม�•เธฒเธกเธชเธ–านการ�“์", max: 10 },
] as const;

const SIGNATURE_JUNE_2026_TOPIC_MASTER = [
  { code: "1", label: "Process & Policy Compliance", max: 30 },
  { code: "2", label: "Answer Quality & Problem Analysis", max: 20 },
  { code: "3", label: "Case Handling & Follow-up", max: 25 },
  { code: "4", label: "Communication Skills", max: 25 },
] as const;

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function compactPerson(value: unknown) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9ก-๙]/g, "");
}

function isSamePerson(a: unknown, b: unknown) {
  const left = compactPerson(a);
  const right = compactPerson(b);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function currentUserMatchesName(currentUser: CurrentUser, name: unknown) {
  return (
    isSamePerson(currentUser.displayName, name) ||
    isSamePerson(currentUser.agentName, name) ||
    isSamePerson(currentUser.username, name) ||
    isSamePerson(currentUser.email, name)
  );
}

function currentUserHasRole(currentUser: CurrentUser, role: SignRole) {
  if (role === "QA") return currentUser.role === "Quality Assurance" || currentUser.role === "Admin";
  if (role === "Supervisor") return currentUser.role === "Supervisor";
  if (role === "Senior") return currentUser.role === "Senior";
  return true;
}

function parseExcelDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0);
  }

  const text = normalizeText(value);
  if (!text) return null;

  const thaiDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (thaiDate) {
    const day = Number(thaiDate[1]);
    const month = Number(thaiDate[2]) - 1;
    let year = Number(thaiDate[3]);
    if (year < 100) year += 2500;
    if (year > 2400) year -= 543;
    const hour = Number(thaiDate[4] || 0);
    const minute = Number(thaiDate[5] || 0);
    return new Date(year, month, day, hour, minute, 0);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getSignatureCaseAuditSortTime(item: SignatureCaseDetail) {
  const date = parseExcelDate(item.auditDate);
  return date ? date.getTime() : Number.MAX_SAFE_INTEGER;
}

function sortSignatureCasesByAuditDate(cases: SignatureCaseDetail[]) {
  return cases
    .map((item, index) => ({ item, index, time: getSignatureCaseAuditSortTime(item) }))
    .sort((a, b) => {
      const timeDiff = a.time - b.time;
      if (timeDiff) return timeDiff;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

function sortSignatureDocumentCases(doc: SignatureDocument): SignatureDocument {
  return { ...doc, cases: sortSignatureCasesByAuditDate(doc.cases) };
}

function parseMonthValueToDate(value: unknown): Date | null {
  const directDate = parseExcelDate(value);
  if (directDate) return new Date(directDate.getFullYear(), directDate.getMonth(), 1);

  const text = normalizeText(value);
  if (!text) return null;

  const monthNameMatch = text.match(/(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})/i);
  if (monthNameMatch) {
    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const monthIndex = monthNames.findIndex((name) => monthNameMatch[1].toLowerCase().startsWith(name));
    return new Date(Number(monthNameMatch[2]), Math.max(monthIndex, 0), 1);
  }

  const yearMonthMatch = text.match(/^(20\d{2})[-/](\d{1,2})$/);
  if (yearMonthMatch) return new Date(Number(yearMonthMatch[1]), Number(yearMonthMatch[2]) - 1, 1);

  const thaiMonthMatch = text.match(/(เธก\.ค\.|มกราคม|ก\.พ\.|กุม� าพันธ์|เธกเธต\.ค\.|มีนาคม|เม\.เธข\.|เมษายน|พ\.ค\.|พฤษ� าคม|เธกเธด\.เธข\.|เธกเธดเธ–ุนายน|ก\.ค\.|กรกฎาคม|เธช\.ค\.|สิงหาคม|ก\.เธข\.|กันยายน|เธ•\.ค\.|เธ•ุลาคม|พ\.เธข\.|พฤศจิกายน|ธ\.ค\.|ธันวาคม)\s*(\d{2,4})/);
  if (thaiMonthMatch) {
    const map: Record<string, number> = {
      "เธก.ค.": 0, "มกราคม": 0,
      "ก.พ.": 1, "กุม� าพันธ์": 1,
      "เธกเธต.ค.": 2, "มีนาคม": 2,
      "เม.เธข.": 3, "เมษายน": 3,
      "พ.ค.": 4, "พฤษ� าคม": 4,
      "เธกเธด.เธข.": 5, "เธกเธดเธ–ุนายน": 5,
      "ก.ค.": 6, "กรกฎาคม": 6,
      "เธช.ค.": 7, "สิงหาคม": 7,
      "ก.เธข.": 8, "กันยายน": 8,
      "เธ•.ค.": 9, "เธ•ุลาคม": 9,
      "พ.เธข.": 10, "พฤศจิกายน": 10,
      "ธ.ค.": 11, "ธันวาคม": 11,
    };
    let year = Number(thaiMonthMatch[2]);
    if (year < 100) year += 2500;
    if (year > 2400) year -= 543;
    return new Date(year, map[thaiMonthMatch[1]] ?? 0, 1);
  }

  return null;
}

function getMonthKey(date: Date | null) {
  if (!date) return "unknown";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(monthKey: string) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return monthKey || "-";
  const date = new Date(`${monthKey}-01T00:00:00`);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
}

function buildHeaderMap(headerRow: unknown[]) {
  const map = new Map<string, number[]>();
  headerRow.forEach((header, index) => {
    const key = normalizeKey(header);
    if (!key) return;
    const current = map.get(key) || [];
    current.push(index);
    map.set(key, current);
  });

  const get = (row: unknown[], candidates: string[], fallback = "") => {
    for (const name of candidates) {
      const indexes = map.get(normalizeKey(name));
      if (!indexes?.length) continue;
      for (const index of indexes) {
        const value = row[index];
        if (value !== null && value !== undefined && normalizeText(value) !== "") return value;
      }
    }
    return fallback;
  };

  return { get };
}

function getSignatureTopicMasterByMonth(monthKey: string): readonly SignatureTopicMasterItem[] {
  if (monthKey !== "unknown" && monthKey >= SIGNATURE_JUNE_POLICY_START_MONTH_KEY) {
    return SIGNATURE_JUNE_2026_TOPIC_MASTER;
  }

  if (monthKey === "2026-01" || monthKey === "2026-02") {
    return SIGNATURE_JAN_FEB_2026_TOPIC_MASTER;
  }

  return monthKey !== "unknown" && monthKey >= SIGNATURE_NEW_POLICY_START_MONTH_KEY
    ? SIGNATURE_APRIL_2026_TOPIC_MASTER
    : SIGNATURE_LEGACY_TOPIC_MASTER;
}

function extractSignatureTopicsFromRow(
  row: unknown[],
  helper: ReturnType<typeof buildHeaderMap>,
  monthKey: string
): SignatureCaseDetail["topics"] {
  const topicsWithPresence = getSignatureTopicMasterByMonth(monthKey).map((master) => {
    const rawScore = helper.get(
      row,
      [`${master.code} Revised Score`, `${master.code} Score`, `${master.code} Final Score`, master.code],
      SIGNATURE_TOPIC_MISSING
    );
    const hasScore = rawScore !== SIGNATURE_TOPIC_MISSING;
    const score = hasScore && !Number.isNaN(Number(rawScore)) ? Number(rawScore) : 0;
    return {
      hasScore,
      topic: {
        code: master.code,
        title: master.label,
        max: master.max,
        score,
      },
    };
  });

  if (!topicsWithPresence.some((item) => item.hasScore)) return [];
  return topicsWithPresence.map((item) => item.topic);
}

function getMonthKeyFromRow(row: unknown[], helper: ReturnType<typeof buildHeaderMap>) {
  const explicitMonthKey = normalizeText(
    helper.get(row, ["Month Key", "MonthKey", "Month_Key", "Reporting Month Key", "Selected Month Key"], "")
  );
  const monthKeyMatch = explicitMonthKey.match(/(20\d{2})[-/](\d{1,2})/);
  if (monthKeyMatch) return `${monthKeyMatch[1]}-${String(Number(monthKeyMatch[2])).padStart(2, "0")}`;
  const compactMonthKeyMatch = explicitMonthKey.match(/(20\d{2})(\d{2})\d{2}/);
  if (compactMonthKeyMatch) return `${compactMonthKeyMatch[1]}-${compactMonthKeyMatch[2]}`;

  const monthDate =
    parseMonthValueToDate(helper.get(row, ["Month Label", "Month", "Reporting Month", "Selected Month", "Report Month"], "")) ||
    parseMonthValueToDate(helper.get(row, ["Month Start", "Month Start Date", "MonthStart"], "")) ||
    parseMonthValueToDate(helper.get(row, ["Audit Date", "Case Date", "Timestamp", "Date"], ""));

  return getMonthKey(monthDate);
}

function isDashboardReportingMonth(monthKey: string) {
  return /^2026-(0[1-9]|1[0-2])$/.test(monthKey);
}

function isHistoricalPaidPeriod(monthKey: string) {
  return isDashboardReportingMonth(monthKey) && monthKey <= HISTORICAL_PAID_LAST_MONTH;
}

function getSignatureWindow(monthKey: string): SignatureWindow {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  return {
    appealCloseAt: new Date(year, monthIndex + 1, 10, 23, 59, 59),
    openAt: new Date(year, monthIndex + 1, 11, 0, 0, 0),
    dueAt: new Date(year, monthIndex + 1, 15, 23, 59, 59),
  };
}

function getTimelineStatus(monthKey: string, now = new Date()) {
  if (isHistoricalPaidPeriod(monthKey)) return "Historical Paid";
  const window = getSignatureWindow(monthKey);
  if (now <= window.appealCloseAt) return "Appeal Period Open";
  if (now >= window.openAt && now <= window.dueAt) return "Signature Open";
  if (now > window.dueAt) return "Signature Deadline Passed";
  return "Waiting Signature Window";
}

function isSigningAllowedByDate(monthKey: string, now = new Date()) {
  if (isHistoricalPaidPeriod(monthKey)) return false;
  const window = getSignatureWindow(monthKey);
  // เปิ�”ให้ลงนามไ�”้หลังปิ�”รอบ Appeal เป็น�•้นไป
  // เธ–้าเซ็นหลัง Due Date จะ�–ือเป็น Late Signature และไม่เข้ารอบจ่ายเ�”ือนปัจจุบัน
  return now >= window.openAt;
}

function isPaymentExportWindowOpen(monthKey: string, now = new Date()) {
  if (FORCE_EXPORT_ALL_EVALUATED_MONTHS.has(monthKey)) return true;
  if (isHistoricalPaidPeriod(monthKey)) return true;
  const window = getSignatureWindow(monthKey);
  return now > window.dueAt;
}

function shouldExportAllEvaluatedAgents(monthKey: string) {
  return FORCE_EXPORT_ALL_EVALUATED_MONTHS.has(monthKey);
}

function isSignedWithinCurrentPaymentCycle(signedAt: string, monthKey: string) {
  const signedTime = new Date(signedAt || "").getTime();
  const dueTime = getSignatureWindow(monthKey).dueAt.getTime();
  return !Number.isNaN(signedTime) && signedTime <= dueTime;
}

function isAfterAppealPeriod(monthKey: string, now = new Date()) {
  if (isHistoricalPaidPeriod(monthKey)) return true;
  const window = getSignatureWindow(monthKey);
  return now > window.appealCloseAt;
}

function safeName(value: unknown, fallback = "-") {
  const text = normalizeText(value);
  return text || fallback;
}

function canonicalAgentName(value: unknown) {
  const name = safeName(value, "");
  if (isSamePerson(name, "Arisa Aiemrit")) return "Arisa Aiemrit";
  if (isSamePerson(name, "Anucha Makundin")) return "Anucha Makundin";
  return name;
}

function findAccountForAgent(accounts: UserAccountSnapshot[], agentName: string) {
  return accounts.find((account) =>
    [account.agentName, account.displayName, account.username].some((identity) => isSamePerson(identity, agentName))
  );
}

function isSuspendedAccount(account?: UserAccountSnapshot | null) {
  const status = normalizeText(account?.status).toLowerCase();
  return status.includes("suspended");
}

function isGenericRoleName(value: unknown) {
  const text = normalizeText(value).toLowerCase();
  return !text ||
    text === "-" ||
    text === "supervisor" ||
    text === "senior" ||
    text === "senior / team lead" ||
    text === "senior / lead" ||
    text === "team lead" ||
    text === "quality assurance";
}

function resolveFallbackSignerName(value: unknown, fallback = "Phommarin Thaithom") {
  return isGenericRoleName(value) ? fallback : safeName(value, fallback);
}

function resolveSupervisorName(value: unknown) {
  const compact = compactPerson(value);
  const knownAliases = new Set([
    compactPerson("Phommarin Thaithom"),
    compactPerson("Phommarin Thaithorn"),
    compactPerson("Phrommarin Thaithom"),
    compactPerson(DEFAULT_SUPERVISOR_SIGNER),
  ]);
  if (isGenericRoleName(value) || knownAliases.has(compact)) return DEFAULT_SUPERVISOR_SIGNER;
  return resolveFallbackSignerName(value, DEFAULT_SUPERVISOR_SIGNER);
}

function resolveSeniorNameForAgent(account: UserAccountSnapshot | undefined, value: unknown) {
  const leadName = normalizeText(account?.teamLead || value);
  if (!isGenericRoleName(leadName)) return leadName;
  if (!account || isSuspendedAccount(account)) return DEFAULT_SUPERVISOR_SIGNER;
  return DEFAULT_SUPERVISOR_SIGNER;
}

function readSignatureStore(): Record<string, SignatureEntry[]> {
  try {
    return JSON.parse(window.localStorage.getItem(SIGNATURE_STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function compactSignatureStore(value: Record<string, SignatureEntry[]>) {
  return Object.fromEntries(
    Object.entries(value).map(([docId, entries]) => [
      docId,
      entries.map(({ signatureDataUrl, ...entry }) => entry),
    ])
  ) as Record<string, SignatureEntry[]>;
}

function writeSignatureStore(value: Record<string, SignatureEntry[]>) {
  try {
    window.localStorage.setItem(SIGNATURE_STORAGE_KEY, JSON.stringify(value));
    return;
  } catch (error) {
    console.warn("Signature local cache exceeded quota; retrying with compact signature metadata.", error);
  }

  try {
    window.localStorage.removeItem(SIGNATURE_STORAGE_KEY);
    window.localStorage.setItem(SIGNATURE_STORAGE_KEY, JSON.stringify(compactSignatureStore(value)));
    return;
  } catch (error) {
    console.warn("Signature compact local cache failed; continuing without local signature cache.", error);
  }

  try {
    window.localStorage.removeItem(SIGNATURE_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures so Signature Center can continue rendering.
  }
}

function readConfirmedStore(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(SIGNATURE_CONFIRM_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeConfirmedStore(value: Record<string, string>) {
  try {
    window.localStorage.setItem(SIGNATURE_CONFIRM_KEY, JSON.stringify(value));
  } catch (error) {
    console.warn("Signature confirmed local cache failed; continuing with remote storage only.", error);
  }
}

function readSignatureLibraryStore(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(SIGNATURE_LIBRARY_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeSignatureLibraryStore(value: Record<string, string>) {
  try {
    window.localStorage.setItem(SIGNATURE_LIBRARY_KEY, JSON.stringify(value));
  } catch (error) {
    console.warn("Saved signature local cache exceeded quota; clearing saved local signature library.", error);
    try {
      window.localStorage.removeItem(SIGNATURE_LIBRARY_KEY);
    } catch {
      // Ignore storage cleanup failures.
    }
  }
}

function createDocumentHash(doc: Omit<SignatureDocument, "documentHash">) {
  return btoa(
    unescape(
      encodeURIComponent(
        [doc.monthKey, doc.agentName, doc.caseCount, doc.averageScore.toFixed(2), doc.grade].join("|")
      )
    )
  ).slice(0, 18);
}

function getEvaluationAgentNameFromAccount(account: UserAccountSnapshot) {
  return canonicalAgentName(account.agentName || account.displayName || account.username);
}

function isEvaluationAccount(account: UserAccountSnapshot) {
  const name = getEvaluationAgentNameFromAccount(account);
  if (!name) return false;
  const role = normalizeText(account.role).toLowerCase();
  if (role.includes("quality assurance") || role === "qa") return false;
  if (role.includes("supervisor")) return false;
  if (role.includes("senior") || role.includes("team lead")) return false;
  return true;
}

function createZeroCaseDocument(monthKey: string, account: UserAccountSnapshot): SignatureDocument {
  const agentName = getEvaluationAgentNameFromAccount(account);
  const base = {
    id: `${monthKey}::${agentName}`,
    monthKey,
    monthLabel: getMonthLabel(monthKey),
    agentName,
    seniorName: resolveSeniorNameForAgent(account, account.teamLead || ""),
    supervisorName: resolveSupervisorName(""),
    qaName: getQaSignerNameByMonth(monthKey),
    teamName: safeName(account.teamName, "-"),
    caseCount: 0,
    averageScore: 0,
    grade: scoreToGrade(0, monthKey),
    eligibleByScore: false,
    cases: [],
  };
  return { ...base, documentHash: createDocumentHash(base) };
}

function isSignatureAppealTopicChanged(topic: {
  score?: number;
  revisedScore?: number | string;
  revisedComment?: string;
}) {
  const revisedScore =
    topic.revisedScore !== null &&
    topic.revisedScore !== "" &&
    !Number.isNaN(Number(topic.revisedScore))
      ? Number(topic.revisedScore)
      : undefined;
  const originalScore = Number(topic.score ?? 0);
  return (
    (revisedScore !== undefined && Math.abs(revisedScore - originalScore) > 0.0001) ||
    String(topic.revisedComment || "").trim() !== ""
  );
}

function buildSignatureApprovedAppealMap(logs: UsageLogEvent[]) {
  const map = new Map<string, SignatureApprovedAppeal>();
  buildAppealRequests(logs)
    .filter((item) => item.status === "Approved")
    .sort(
      (a, b) =>
        new Date(a.reviewedAt || a.submittedAt || "").getTime() -
        new Date(b.reviewedAt || b.submittedAt || "").getTime()
    )
    .forEach((request) => {
      const caseId = normalizeText(request.caseId);
      if (!caseId) return;
      const previousScore = Number(request.finalScore || 0);
      let scoreDelta = 0;
      const revisedTopics = request.topics
        .filter(isSignatureAppealTopicChanged)
        .map((topic) => {
          const originalScore = Number(topic.score || 0);
          const revisedScore =
            topic.revisedScore !== null &&
            topic.revisedScore !== "" &&
            !Number.isNaN(Number(topic.revisedScore))
              ? Number(topic.revisedScore)
              : originalScore;
          const max = Number(topic.max || 0);
          if (!Number.isFinite(originalScore) || !Number.isFinite(revisedScore) || !Number.isFinite(max) || max <= 0) return null;
          scoreDelta += revisedScore - originalScore;
          return {
            code: normalizeText(topic.code),
            title: normalizeText((topic as any).title || topic.label),
            max,
            score: revisedScore,
          };
        })
        .filter(Boolean) as SignatureCaseDetail["topics"];
      const approvedAppeal = {
        caseId,
        previousScore,
        finalScore: Number((previousScore + scoreDelta).toFixed(2)),
        reviewedAt: request.reviewedAt || request.submittedAt || "",
        topics: revisedTopics,
      };
      map.set(caseId, approvedAppeal);
      const monthKey = getMonthKey(parseExcelDate(request.auditDate) || new Date(request.submittedAt || request.reviewedAt || ""));
      if (/^20\d{2}-\d{2}$/.test(monthKey)) {
        map.set(`${caseId}::${monthKey}`, approvedAppeal);
      }
    });
  return map;
}

function applySignatureAppealTopics(
  topics: SignatureCaseDetail["topics"],
  appeal?: SignatureApprovedAppeal
): SignatureCaseDetail["topics"] {
  const revisedTopics = appeal?.topics || [];
  if (!revisedTopics.length) return topics || [];

  const revisedByCode = new Map(revisedTopics.map((topic) => [normalizeText(topic.code), topic]));
  if (!topics?.length) return revisedTopics;

  return topics.map((topic) => {
    const revised = revisedByCode.get(normalizeText(topic.code));
    return revised
      ? {
          ...topic,
          title: revised.title || topic.title,
          max: Number(revised.max || topic.max || 0),
          score: Number(revised.score || 0),
        }
      : topic;
  });
}

function getLastSignatureHeaderValue(
  headerRow: unknown[],
  row: unknown[],
  headerName: string,
  fallback: unknown = ""
) {
  const target = normalizeKey(headerName);
  for (let index = headerRow.length - 1; index >= 0; index -= 1) {
    if (normalizeKey(headerRow[index]) !== target) continue;
    const value = row[index];
    if (value !== null && value !== undefined && normalizeText(value) !== "") return value;
  }
  return fallback;
}

function buildSignatureRawAppealMap(rows: unknown[][]) {
  const headerIndex = rows.findIndex((row) => row.map((item) => normalizeKey(item)).includes("case id"));
  const map = new Map<string, SignatureApprovedAppeal>();
  if (headerIndex < 0) return map;

  const headerRow = rows[headerIndex] || [];
  const helper = buildHeaderMap(headerRow);

  rows.slice(headerIndex + 1).forEach((row) => {
    const caseId = safeName(helper.get(row, ["Case ID", "CaseId", "Case"], ""), "");
    if (!caseId) return;

    const monthKey = getMonthKeyFromRow(row, helper);
    const rawFinalScore = Number(getLastSignatureHeaderValue(headerRow, row, "Final Score", ""));
    if (!Number.isFinite(rawFinalScore)) return;

    const rawPreviousScore = Number(helper.get(row, ["Previous Score", "Original Score"], rawFinalScore));
    const item: SignatureApprovedAppeal = {
      caseId,
      previousScore: Number.isFinite(rawPreviousScore) ? rawPreviousScore : rawFinalScore,
      finalScore: Number(rawFinalScore.toFixed(2)),
      reviewedAt: normalizeText(helper.get(row, ["Reviewed At", "Review Date", "Audit Date", "Timestamp"], "")),
    };

    map.set(caseId, item);
    if (/^20\d{2}-\d{2}$/.test(monthKey)) {
      map.set(`${caseId}::${monthKey}`, item);
    }
  });

  return map;
}

async function fetchSignatureRawAppealMap() {
  const appealFiles = [
    "/Appleal ROWDATA.xlsx",
    "/Appeal ROWDATA.xlsx",
    "/Appeal_ROWDATA.xlsx",
  ];

  for (const fileName of appealFiles) {
    try {
      const response = await fetch(fileName, { cache: "no-store" });
      if (!response.ok) continue;
      const buffer = await response.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = workbook.Sheets["Appeal_Data"] || workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
      const map = buildSignatureRawAppealMap(rows);
      if (map.size) return map;
    } catch (error) {
      console.warn(`Signature raw appeal file skipped: ${fileName}`, error);
    }
  }

  return new Map<string, SignatureApprovedAppeal>();
}


function buildDocuments(
  rows: unknown[][],
  accounts: UserAccountSnapshot[],
  approvedAppealMap: Map<string, SignatureApprovedAppeal> = new Map()
) {
  const headerIndex = rows.findIndex((row) => {
    const keys = row.map((item) => normalizeKey(item));
    return keys.includes("agent name") && (keys.includes("case id") || keys.includes("final score"));
  });
  if (headerIndex < 0) return [];

  const helper = buildHeaderMap(rows[headerIndex] || []);
  const grouped = new Map<string, {
    monthKey: string;
    agentName: string;
    seniorName: string;
    supervisorName: string;
    qaName: string;
    teamName: string;
    scores: number[];
    cases: SignatureCaseDetail[];
    caseIds: Set<string>;
  }>();

  rows.slice(headerIndex + 1).forEach((row) => {
    const agentName = canonicalAgentName(helper.get(row, ["Agent Name", "Agent", "Employee Name", "User"], ""));
    if (!agentName || agentName === "-") return;

    const monthKey = getMonthKeyFromRow(row, helper);
    if (!isDashboardReportingMonth(monthKey)) return;

    const account = findAccountForAgent(accounts, agentName);
    const caseId = safeName(helper.get(row, ["Case ID", "CaseId", "Case"], ""));
    const auditDate = parseExcelDate(helper.get(row, ["Audit Date", "Case Date", "Timestamp", "Date"], ""));
    const rawFinalScore = Number(helper.get(row, ["Final Score", "Total Score", "QA Score", "Score"], ""));
    const approvedAppeal = approvedAppealMap.get(`${caseId}::${monthKey}`) || approvedAppealMap.get(caseId);
    const appealScore = approvedAppeal?.finalScore;
    const finalScore = Number.isFinite(Number(appealScore)) ? Number(appealScore) : rawFinalScore;
    const score = Number.isFinite(finalScore) ? finalScore : 0;
    const topics = applySignatureAppealTopics(extractSignatureTopicsFromRow(row, helper, monthKey), approvedAppeal);

    const seniorName = resolveSeniorNameForAgent(account, helper.get(row, ["Senior", "Team Lead", "Team Leader", "Leader"], ""));
    const supervisorName = resolveSupervisorName(helper.get(row, ["Supervisor", "Sup"], ""));
    const qaName = safeName(helper.get(row, ["QA", "QA Name", "Auditor", "Evaluator", "Audit By"], ""), "Quality Assurance");
    const teamName = safeName(account?.teamName || helper.get(row, ["Team", "Team Name"], ""), "-");
    const inquiry = safeName(helper.get(row, ["Customer Inquiry", "Intent", "Inquiry", "หัวข้อ"], ""), "-");
    const comment = safeName(helper.get(row, ["Final Comment", "Comment", "QA Comment", "Case Description"], ""), "-");

    const key = `${monthKey}::${agentName}`;
    const current = grouped.get(key) || {
      monthKey,
      agentName,
      seniorName,
      supervisorName,
      qaName,
      teamName,
      scores: [],
      cases: [],
      caseIds: new Set<string>(),
    };

    current.seniorName = isGenericRoleName(current.seniorName) ? seniorName : current.seniorName;
    current.supervisorName = isGenericRoleName(current.supervisorName) ? supervisorName : current.supervisorName;
    current.qaName = current.qaName === "Quality Assurance" ? qaName : current.qaName;
    current.teamName = current.teamName === "-" ? teamName : current.teamName;

    if (caseId && caseId !== "-" && !current.caseIds.has(caseId)) {
      current.caseIds.add(caseId);
      if (Number.isFinite(finalScore)) current.scores.push(score);
      current.cases.push({
        caseId,
        auditDate: auditDate ? auditDate.toLocaleDateString("th-TH") : "-",
        inquiry,
        finalScore: score,
        grade: scoreToGrade(score, monthKey),
        comment,
        topics,
      });
    } else if ((!caseId || caseId === "-") && Number.isFinite(finalScore)) {
      current.scores.push(score);
    }

    grouped.set(key, current);
  });

  return Array.from(grouped.values())
    .map((item): SignatureDocument => {
      const averageScore = item.scores.length
        ? item.scores.reduce((sum, score) => sum + score, 0) / item.scores.length
        : 0;
      const caseCount = item.caseIds.size || item.scores.length;
      const base = {
        id: `${item.monthKey}::${item.agentName}`,
        monthKey: item.monthKey,
        monthLabel: getMonthLabel(item.monthKey),
        agentName: item.agentName,
        seniorName: item.seniorName,
        supervisorName: item.supervisorName,
        qaName: item.qaName,
        teamName: item.teamName,
        caseCount,
        averageScore,
        grade: scoreToGrade(averageScore, item.monthKey),
        eligibleByScore: caseCount >= CASE_TARGET && averageScore >= 80,
        cases: sortSignatureCasesByAuditDate(item.cases),
      };
      return { ...base, documentHash: createDocumentHash(base) };
    })
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey) || a.agentName.localeCompare(b.agentName));
}

function buildDocumentsFromStoredEvaluations(
  records: StoredEvaluation[],
  accounts: UserAccountSnapshot[],
  approvedAppealMap: Map<string, SignatureApprovedAppeal> = new Map()
) {
  const grouped = new Map<string, {
    monthKey: string;
    agentName: string;
    seniorName: string;
    supervisorName: string;
    qaName: string;
    teamName: string;
    scores: number[];
    cases: SignatureCaseDetail[];
    caseIds: Set<string>;
  }>();

  records.forEach((record) => {
    const rawPreview = record.rawDataPreview || {};
    const agentName = canonicalAgentName(record.agentName || record.targetDisplayName || rawPreview["Agent Name"]);
    if (!agentName || agentName === "-") return;

    const auditDate = parseExcelDate(
      record.auditDate ||
        rawPreview["Audit Date"] ||
        rawPreview["Case Date"] ||
        record.auditTimestamp ||
        record.submittedAt
    );
    const monthKey = getMonthKey(auditDate);
    if (!isDashboardReportingMonth(monthKey)) return;

    const caseId = safeName(record.caseId || rawPreview["Case ID"], "");
    const rawFinalScore = Number(record.finalScore || rawPreview["Final Score"] || 0);
    const approvedAppeal = approvedAppealMap.get(`${caseId}::${monthKey}`) || approvedAppealMap.get(caseId);
    const appealScore = approvedAppeal?.finalScore;
    const finalScore = Number.isFinite(Number(appealScore)) ? Number(appealScore) : rawFinalScore;
    if (!Number.isFinite(finalScore)) return;

    const account = findAccountForAgent(accounts, agentName);
    const seniorName = resolveSeniorNameForAgent(account, rawPreview["Senior"] || rawPreview["Team Lead"] || rawPreview["Team Leader"]);
    const supervisorName = resolveSupervisorName(rawPreview["Supervisor"] || rawPreview["Sup"]);
    const qaName = safeName(
      record.evaluatorName || rawPreview["QA"] || rawPreview["QA Name"] || rawPreview["Auditor"] || rawPreview["Evaluator"],
      getQaSignerNameByMonth(monthKey)
    );
    const teamName = safeName(account?.teamName || rawPreview["Team"] || rawPreview["Team Name"], "-");
    const inquiry = safeName(record.inquiry || rawPreview["Customer Inquiry"] || rawPreview["Inquiry"] || rawPreview["หัวข้อ"], "-");
    const comment = safeName(record.caseDescription || rawPreview["Final Comment"] || rawPreview["Comment"] || rawPreview["QA Comment"], "-");

    const key = `${monthKey}::${agentName}`;
    const current = grouped.get(key) || {
      monthKey,
      agentName,
      seniorName,
      supervisorName,
      qaName,
      teamName,
      scores: [],
      cases: [],
      caseIds: new Set<string>(),
    };

    current.seniorName = isGenericRoleName(current.seniorName) ? seniorName : current.seniorName;
    current.supervisorName = isGenericRoleName(current.supervisorName) ? supervisorName : current.supervisorName;
    current.qaName = current.qaName === "Quality Assurance" ? qaName : current.qaName;
    current.teamName = current.teamName === "-" ? teamName : current.teamName;

    if (caseId && !current.caseIds.has(caseId)) {
      current.caseIds.add(caseId);
      current.scores.push(finalScore);
      current.cases.push({
        caseId,
        auditDate: auditDate ? auditDate.toLocaleDateString("th-TH") : "-",
        inquiry,
        finalScore,
        grade: scoreToGrade(finalScore, monthKey),
        comment,
        topics: applySignatureAppealTopics(record.topics || [], approvedAppeal),
      });
    }

    grouped.set(key, current);
  });

  return Array.from(grouped.values())
    .map((item): SignatureDocument => {
      const averageScore = item.scores.length
        ? item.scores.reduce((sum, score) => sum + score, 0) / item.scores.length
        : 0;
      const caseCount = item.caseIds.size || item.scores.length;
      const base = {
        id: `${item.monthKey}::${item.agentName}`,
        monthKey: item.monthKey,
        monthLabel: getMonthLabel(item.monthKey),
        agentName: item.agentName,
        seniorName: item.seniorName,
        supervisorName: item.supervisorName,
        qaName: item.qaName,
        teamName: item.teamName,
        caseCount,
        averageScore,
        grade: scoreToGrade(averageScore, item.monthKey),
        eligibleByScore: caseCount >= CASE_TARGET && averageScore >= 80,
        cases: sortSignatureCasesByAuditDate(item.cases),
      };
      return { ...base, documentHash: createDocumentHash(base) };
    })
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey) || a.agentName.localeCompare(b.agentName, "th"));
}

function mergeSignatureDocuments(existing: SignatureDocument, incoming: SignatureDocument): SignatureDocument {
  const caseMap = new Map<string, SignatureCaseDetail>();
  existing.cases.forEach((item) => caseMap.set(item.caseId, item));
  incoming.cases.forEach((item) => {
    const previous = caseMap.get(item.caseId);
    if (previous?.topics?.length && (!item.topics?.length || previous.topics.length > item.topics.length)) {
      caseMap.set(item.caseId, { ...item, topics: previous.topics });
      return;
    }
    caseMap.set(item.caseId, item);
  });
  const cases = sortSignatureCasesByAuditDate(Array.from(caseMap.values()));
  const caseCount = cases.length || Math.max(existing.caseCount, incoming.caseCount);
  const averageScore = cases.length
    ? cases.reduce((sum, item) => sum + Number(item.finalScore || 0), 0) / cases.length
    : (() => {
        const existingCases = Math.max(Number(existing.caseCount) || 0, 0);
        const incomingCases = Math.max(Number(incoming.caseCount) || 0, 0);
        const totalCases = existingCases + incomingCases;
        if (!totalCases) return 0;
        return ((Number(existing.averageScore) || 0) * existingCases + (Number(incoming.averageScore) || 0) * incomingCases) / totalCases;
      })();
  const monthKey = incoming.monthKey || existing.monthKey;
  const base = {
    ...existing,
    ...incoming,
    id: incoming.id || existing.id,
    monthKey,
    monthLabel: getMonthLabel(monthKey),
    caseCount,
    averageScore,
    grade: scoreToGrade(averageScore, monthKey),
    eligibleByScore: caseCount >= CASE_TARGET && averageScore >= 80,
    cases,
  };
  return { ...base, documentHash: createDocumentHash(base) };
}

function getQaSignerNameByMonth(monthKey: string, fallback = "Quality Assurance") {
  if (monthKey >= "2026-03") return "Songpon Phothong";
  if (monthKey === "2026-01" || monthKey === "2026-02") return "Phommarin Thaithom";
  return fallback || "Quality Assurance";
}

function getRoleSigner(doc: SignatureDocument, role: SignRole) {
  if (role === "QA") return getQaSignerNameByMonth(doc.monthKey, doc.qaName);
  if (role === "Supervisor") return resolveSupervisorName(doc.supervisorName);
  if (role === "Senior") return resolveFallbackSignerName(doc.seniorName, DEFAULT_SUPERVISOR_SIGNER);
  return doc.agentName;
}

function getSignedEntry(entries: SignatureEntry[], role: SignRole) {
  return entries.find((entry) => entry.role === role && entry.status === "Signed");
}

function getDeadlineResetEntry(entries: SignatureEntry[], role: SignRole) {
  return entries.find((entry) => entry.role === role && entry.status === "Pending" && entry.note === SIGNATURE_DEADLINE_RESET_NOTE);
}

function getDeadlineResetExpiresAt(entry?: SignatureEntry) {
  const resetTime = new Date(entry?.resetAt || "").getTime();
  if (Number.isNaN(resetTime)) return null;
  return new Date(resetTime + SIGNATURE_RESET_WINDOW_MS);
}

function isDeadlineResetActive(entry?: SignatureEntry, now = new Date()) {
  const expiresAt = getDeadlineResetExpiresAt(entry);
  return Boolean(expiresAt && now.getTime() <= expiresAt.getTime());
}

function getActiveDeadlineResetEntry(entries: SignatureEntry[], role: SignRole, now = new Date()) {
  const entry = getDeadlineResetEntry(entries, role);
  return isDeadlineResetActive(entry, now) ? entry : undefined;
}

function getPendingRoles(entries: SignatureEntry[]) {
  return SIGNATURE_FLOW.filter((role) => !getSignedEntry(entries, role));
}

function roleThaiLabel(role: SignRole) {
  if (role === "QA") return "QA ผู้�•รวจสอบ";
  if (role === "Supervisor") return "Supervisor";
  if (role === "Senior") return "Senior / Team Lead";
  return "Agent ผู้�–ูกประเมิน";
}

function canSignIdentity(currentUser: CurrentUser, doc: SignatureDocument, role: SignRole) {
  const signerName = getRoleSigner(doc, role);
  if (role === "Agent") {
    return currentUserMatchesName(currentUser, doc.agentName);
  }

  if (!currentUserHasRole(currentUser, role)) return false;
  if (role === "QA" && compactPerson(signerName) === compactPerson("Quality Assurance")) return true;
  return currentUserMatchesName(currentUser, signerName);
}

function autoHistoricalEntries(doc: SignatureDocument): SignatureEntry[] {
  if (!isHistoricalPaidPeriod(doc.monthKey)) return [];
  const window = getSignatureWindow(doc.monthKey);
  const paidAt = window.dueAt.toISOString();
  return SIGNATURE_FLOW.map((role) => ({
    role,
    signerName: getRoleSigner(doc, role),
    status: "Signed",
    signedBy: "System Historical Paid",
    signedAt: paidAt,
    note: "Historical paid period Jan-Apr 2026",
  }));
}

function effectiveEntriesForDoc(doc: SignatureDocument, signatures: Record<string, SignatureEntry[]>) {
  if (isHistoricalPaidPeriod(doc.monthKey)) {
    const storedEntries = signatures[doc.id] || [];
    return autoHistoricalEntries(doc).map((entry) => {
      const stored = storedEntries.find((item) => item.role === entry.role);
      return stored?.signatureDataUrl
        ? {
            ...entry,
            signatureDataUrl: stored.signatureDataUrl,
            signedBy: stored.signedBy || entry.signedBy,
            signedAt: stored.signedAt || entry.signedAt,
            signerName: stored.signerName || entry.signerName,
          }
        : entry;
    });
  }
  return signatures[doc.id] || [];
}

function canViewDocument(currentUser: CurrentUser, doc: SignatureDocument, entries: SignatureEntry[]) {
  const pendingRoles = getPendingRoles(entries);
  if (!pendingRoles.length) return false;
  if (!isAfterAppealPeriod(doc.monthKey)) return false;

  return pendingRoles.some((role) => canSignIdentity(currentUser, doc, role));
}

function canMonitorDocument(currentUser: CurrentUser, doc: SignatureDocument) {
  if (currentUser.role === "Quality Assurance" || currentUser.role === "Admin") return true;
  if (currentUser.role === "Supervisor") return canSignIdentity(currentUser, doc, "Supervisor");
  if (currentUser.role === "Senior") return canSignIdentity(currentUser, doc, "Senior");
  return canSignIdentity(currentUser, doc, "Agent");
}

function statusForRole(entries: SignatureEntry[], role: SignRole, monthKey: string, now = new Date()): SignatureStepStatus {
  if (getSignedEntry(entries, role)) return "Signed";
  if (isHistoricalPaidPeriod(monthKey)) return "Signed";
  const timeline = getTimelineStatus(monthKey, now);
  if (timeline === "Appeal Period Open" || timeline === "Waiting Signature Window") return "Locked";
  if (timeline === "Signature Deadline Passed" && getActiveDeadlineResetEntry(entries, role, now)) return "Pending";
  if (timeline === "Signature Deadline Passed") return "Expired";
  return "Pending";
}

function canSignRoleByDate(monthKey: string, entries: SignatureEntry[], role: SignRole, now = new Date()) {
  if (!isSigningAllowedByDate(monthKey, now)) return false;
  if (getTimelineStatus(monthKey, now) === "Signature Deadline Passed") {
    return Boolean(getActiveDeadlineResetEntry(entries, role, now));
  }
  return true;
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

function formatDateOnly(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" });
}

function getSignatureDueDate(monthKey: string) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return null;
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month, 15, 23, 59, 59);
}

function getSignatureCreatedDate(doc: SignatureDocument) {
  const caseDates = doc.cases
    .map((item) => parseExcelDate(item.auditDate))
    .filter((date): date is Date => Boolean(date));
  if (caseDates.length) return new Date(Math.max(...caseDates.map((date) => date.getTime())));
  if (/^\d{4}-\d{2}$/.test(doc.monthKey)) return new Date(`${doc.monthKey}-01T00:00:00`);
  return null;
}

function getDocumentPrimaryCaseId(doc: SignatureDocument) {
  return doc.documentHash || doc.cases[0]?.caseId || doc.id;
}

function getDocumentAuditSortTime(doc: SignatureDocument) {
  const caseTimes = doc.cases
    .map((item) => parseExcelDate(item.auditDate)?.getTime() || 0)
    .filter((time) => time > 0);
  if (caseTimes.length) return Math.max(...caseTimes);
  return getSignatureCreatedDate(doc)?.getTime() || 0;
}

function getMonthlyDocumentRef(doc: SignatureDocument, allDocuments: SignatureDocument[]) {
  const monthMatch = doc.monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!monthMatch) return doc.documentHash || doc.id;

  const [, year, month] = monthMatch;
  const sameMonthDocuments = allDocuments
    .filter((item) => item.monthKey === doc.monthKey)
    .slice()
    .sort((a, b) => {
      const auditDiff = getDocumentAuditSortTime(a) - getDocumentAuditSortTime(b);
      if (auditDiff !== 0) return auditDiff;
      const nameDiff = a.agentName.localeCompare(b.agentName, "th");
      if (nameDiff !== 0) return nameDiff;
      return a.id.localeCompare(b.id);
    });

  const index = sameMonthDocuments.findIndex((item) => item.id === doc.id);
  const sequence = String(Math.max(0, index) + 1).padStart(5, "0");
  return `${month}${year}${sequence}`;
}

async function normalizeSignatureDataUrl(dataUrl: string) {
  if (!dataUrl || typeof window === "undefined") return dataUrl;

  return new Promise<string>((resolve) => {
    let resolved = false;
    let timeoutId = 0;
    const finish = (value: string) => {
      if (resolved) return;
      resolved = true;
      window.clearTimeout(timeoutId);
      resolve(value);
    };
    timeoutId = window.setTimeout(() => finish(dataUrl), 2500);
    const image = new Image();
    image.onload = () => {
      try {
        const sourceCanvas = document.createElement("canvas");
        sourceCanvas.width = image.naturalWidth || image.width;
        sourceCanvas.height = image.naturalHeight || image.height;
        const sourceContext = sourceCanvas.getContext("2d");
        if (!sourceContext || !sourceCanvas.width || !sourceCanvas.height) {
          finish(dataUrl);
          return;
        }

        sourceContext.drawImage(image, 0, 0);
        const imageData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
        let minX = sourceCanvas.width;
        let minY = sourceCanvas.height;
        let maxX = 0;
        let maxY = 0;
        let hasInk = false;

        for (let y = 0; y < sourceCanvas.height; y += 1) {
          for (let x = 0; x < sourceCanvas.width; x += 1) {
            const index = (y * sourceCanvas.width + x) * 4;
            const alpha = imageData.data[index + 3];
            const red = imageData.data[index];
            const green = imageData.data[index + 1];
            const blue = imageData.data[index + 2];
            const isInk = alpha > 24 && (red < 244 || green < 244 || blue < 244);
            if (!isInk) continue;
            hasInk = true;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }

        if (!hasInk) {
          finish(dataUrl);
          return;
        }

        const padding = 18;
        const cropX = Math.max(0, minX - padding);
        const cropY = Math.max(0, minY - padding);
        const cropW = Math.min(sourceCanvas.width - cropX, maxX - minX + 1 + padding * 2);
        const cropH = Math.min(sourceCanvas.height - cropY, maxY - minY + 1 + padding * 2);
        const outputCanvas = document.createElement("canvas");
        outputCanvas.width = cropW;
        outputCanvas.height = cropH;
        const outputContext = outputCanvas.getContext("2d");
        if (!outputContext) {
          finish(dataUrl);
          return;
        }

        outputContext.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        finish(outputCanvas.toDataURL("image/png"));
      } catch (error) {
        console.warn("Signature image normalization failed", error);
        finish(dataUrl);
      }
    };
    image.onerror = () => finish(dataUrl);
    image.src = dataUrl;
  });
}

function getDocumentTypeLabel(doc: SignatureDocument) {
  return doc.eligibleByScore ? "เอกสารจ่าย Incentive รายเ�”ือน" : "เอกสารรับ�—ราบผล QA รายเ�”ือน";
}

function getWorkspaceStatus(doc: SignatureDocument, entries: SignatureEntry[]) {
  const signedComplete = SIGNATURE_FLOW.every((role) => Boolean(getSignedEntry(entries, role)));
  if (signedComplete) return "signed" as const;
  if (getTimelineStatus(doc.monthKey) === "Signature Deadline Passed") return "expired" as const;
  if (getPendingRoles(entries).length) return "pending" as const;
  return "in-progress" as const;
}

function getWorkspaceStatusLabel(status: WorkspaceStatus) {
  if (status === "signed") return "เซ็นแล้ว";
  if (status === "expired") return "เกินกำหน�”";
  if (status === "in-progress") return "ค้าง�”ำเนินการ";
  return "รอเซ็น";
}

function getWorkspaceStatusClass(status: WorkspaceStatus) {
  if (status === "signed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "expired") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "in-progress") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function WorkspaceStatusBadge({ status }: { status: WorkspaceStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getWorkspaceStatusClass(status)}`}>
      {getWorkspaceStatusLabel(status)}
    </span>
  );
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function savePdfFile(pdf: jsPDF, fileName: string) {
  try {
    pdf.save(fileName);
    return;
  } catch (error) {
    console.warn("jsPDF save failed, falling back to blob download", error);
  }
  downloadBlob(pdf.output("blob"), fileName);
}

function isPaymentReadyDocument(
  doc: SignatureDocument,
  entries: SignatureEntry[],
  pendingAppealCaseMap: Map<string, PendingAppealCase>
) {
  const signedComplete = SIGNATURE_FLOW.every((role) => Boolean(getSignedEntry(entries, role)));
  const hasPending = !isHistoricalPaidPeriod(doc.monthKey) && doc.cases.some((item) => pendingAppealCaseMap.has(item.caseId));
  const signedWithinCycle = SIGNATURE_FLOW.every((role) => {
    const signed = getSignedEntry(entries, role);
    return Boolean(signed) && isSignedWithinCurrentPaymentCycle(signed?.signedAt || "", doc.monthKey);
  });
  return signedComplete && signedWithinCycle && !hasPending;
}

function isLateSignedDocument(
  doc: SignatureDocument,
  entries: SignatureEntry[],
  pendingAppealCaseMap: Map<string, PendingAppealCase>
) {
  const signedComplete = SIGNATURE_FLOW.every((role) => Boolean(getSignedEntry(entries, role)));
  const hasPending = !isHistoricalPaidPeriod(doc.monthKey) && doc.cases.some((item) => pendingAppealCaseMap.has(item.caseId));
  const hasLateSignature = SIGNATURE_FLOW.some((role) => {
    const signed = getSignedEntry(entries, role);
    return Boolean(signed) && !isSignedWithinCurrentPaymentCycle(signed?.signedAt || "", doc.monthKey);
  });
  return signedComplete && hasLateSignature && !hasPending;
}

function getSignatureValidationRoleText(
  doc: SignatureDocument,
  entries: SignatureEntry[],
  role: SignRole,
  now = new Date()
) {
  const signed = getSignedEntry(entries, role);
  if (signed) return signed.signerName || getRoleSigner(doc, role);

  const resetEntry = getActiveDeadlineResetEntry(entries, role, now);
  if (resetEntry) return resetEntry.signerName || getRoleSigner(doc, role);

  const status = statusForRole(entries, role, doc.monthKey, now);
  if (status === "Pending") return getRoleSigner(doc, role);

  return "-";
}

function getSignatureValidationStatus(
  doc: SignatureDocument,
  entries: SignatureEntry[],
  exportsAllEvaluated: boolean,
  now = new Date()
) {
  const pendingRoles = SIGNATURE_FLOW.filter((role) => {
    if (getSignedEntry(entries, role)) return false;
    return statusForRole(entries, role, doc.monthKey, now) === "Pending";
  });

  if (pendingRoles.length) {
    return `Pending ${pendingRoles.map(roleThaiLabel).join(", ")}`;
  }

  return exportsAllEvaluated ? "Exported" : "Completed";
}


function getOverallPdfGradeLabel(avgScore: number) {
  if (!Number.isFinite(avgScore)) return "-";
  if (avgScore >= 90) return "A";
  if (avgScore >= 85) return "B";
  if (avgScore >= 80) return "C";
  if (avgScore >= 75) return "D";
  return "F";
}

function getAgentSignedStatusText(
  doc: SignatureDocument,
  entries: SignatureEntry[],
  exportsAllEvaluated: boolean
) {
  const agentEntry = getSignedEntry(entries, "Agent");
  if (agentEntry?.signedAt) {
    return "Agent Signed / " + formatDateTime(agentEntry.signedAt);
  }

  return exportsAllEvaluated ? "Exported" : "Completed";
}


function makePaymentFileName(monthKey: string) {
  const label = getMonthLabel(monthKey).replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_ก-๙]+/g, "");
  return `Incentive_QA_Monthly_${label || monthKey}.xlsx`;
}

function getDocumentIncentive(doc: SignatureDocument) {
  if ((Number(doc.caseCount) || 0) < CASE_TARGET) {
    return {
      total: 0,
      cash: 0,
      promo: 0,
      label: "0 THB / No Incentive",
      remark: "ยังประเมินไม่ครบ 10 เคส",
    };
  }
  return getIncentiveByGrade(doc.grade as any, doc.monthKey);
}

function formatBahtAmount(value: number) {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function getDashboardMonthSummaryForExport(
  monthKey: string,
  allMonthDocs: SignatureDocument[],
  fallbackDocs: SignatureDocument[]
) {
  const sourceDocs = allMonthDocs.length ? allMonthDocs : fallbackDocs;
  const totalCases = sourceDocs.reduce((sum, doc) => sum + Math.max(Number(doc.caseCount) || 0, 0), 0);
  const weightedScore = sourceDocs.reduce(
    (sum, doc) => sum + (Number(doc.averageScore) || 0) * Math.max(Number(doc.caseCount) || 0, 0),
    0
  );
  const avgScore = totalCases > 0 ? weightedScore / totalCases : 0;

  return {
    totalCases,
    avgScore: Number(avgScore.toFixed(2)),
  };
}

function generatePaymentExcelFile(
  monthKey: string,
  readyDocs: SignatureDocument[],
  signatures: Record<string, SignatureEntry[]>,
  allMonthDocs: SignatureDocument[] = readyDocs
) {
  const sortedDocs = [...readyDocs].sort((a, b) => a.agentName.localeCompare(b.agentName, "th"));
  const dashboardSummary = getDashboardMonthSummaryForExport(monthKey, allMonthDocs, sortedDocs);
  const exportsAllEvaluated = shouldExportAllEvaluatedAgents(monthKey);
  const exportRuleText = exportsAllEvaluated
    ? "May 2026 one-time export: include all evaluated agents without waiting for completed signatures."
    : "Pay only agents signed complete by day 15";
  const statusText = exportsAllEvaluated ? "Evaluated / Signature not required for this export" : "Signed Complete";
  const totalCases = dashboardSummary.totalCases;
  const avgScore = dashboardSummary.avgScore;
  const criticalCases = 0;
  const totalCashAmount = sortedDocs.reduce((sum, doc) => sum + getDocumentIncentive(doc).cash, 0);
  const totalPromoAmount = sortedDocs.reduce((sum, doc) => sum + getDocumentIncentive(doc).promo, 0);
  const year = /^\d{4}-\d{2}$/.test(monthKey) ? monthKey.slice(0, 4) : "";

  const aoa: unknown[][] = [
    ["Monthly Team Summary"],
    [exportsAllEvaluated
      ? "Selected month overview for incentive payment. May 2026 includes every evaluated agent for this urgent export."
      : "Selected month overview for incentive payment. Only agents with completed signatures and Ready to Pay status are included."],
    [],
    ["Current View"],
    [],
    ["Month", getMonthLabel(monthKey), null, "Year", year, null, "Team Cases", totalCases],
    [],
    ["Avg Score", Number(avgScore.toFixed(2)), null, "Critical Cases", criticalCases, null, "Payment Status", sortedDocs.length > 0 ? "Ready to Export" : "Hold"],
    [null, null, null, null, null, null, "Export Rule", exportRuleText],
    [],
    ["Agent Monthly Ranking"],
    [],
    ...(totalPromoAmount > 0
      ? [["Seq", "Name", "Cases", "Avg Score", "Grade", "Incentive Amount (THB)", "RBH Promo (THB)", "Incentive Detail", "QA Signer", "Supervisor Signer", "Senior / Team Lead Signer", "Agent Signer", "Sign Complete At", "Critical", "Status"]]
      : [["Seq", "Name", "Cases", "Avg Score", "Grade", "Incentive Amount (THB)", "Incentive Detail", "QA Signer", "Supervisor Signer", "Senior / Team Lead Signer", "Agent Signer", "Sign Complete At", "Critical", "Status"]]),
  ];

  sortedDocs.forEach((doc, index) => {
    const entries = effectiveEntriesForDoc(doc, signatures);
    const incentive = getDocumentIncentive(doc);
    const qaSigner = getSignatureValidationRoleText(doc, entries, "QA");
    const supervisorSigner = getSignatureValidationRoleText(doc, entries, "Supervisor");
    const seniorSigner = getSignatureValidationRoleText(doc, entries, "Senior");
    const agentSigner = getSignatureValidationRoleText(doc, entries, "Agent");
    const lastSignedAt =
      SIGNATURE_FLOW.map((role) => getSignedEntry(entries, role)?.signedAt || "")
        .filter(Boolean)
        .sort()
        .pop() || "";
    const rankingRow = totalPromoAmount > 0
      ? [
          index + 1,
          doc.agentName,
          doc.caseCount,
          Number(doc.averageScore.toFixed(2)),
          doc.grade,
          incentive.cash,
          incentive.promo,
          incentive.label,
          qaSigner,
          supervisorSigner,
          seniorSigner,
          agentSigner,
          lastSignedAt ? formatDateTime(lastSignedAt) : "-",
          "No",
          statusText,
        ]
      : [
          index + 1,
          doc.agentName,
          doc.caseCount,
          Number(doc.averageScore.toFixed(2)),
          doc.grade,
          incentive.cash,
          incentive.label,
          qaSigner,
          supervisorSigner,
          seniorSigner,
          agentSigner,
          lastSignedAt ? formatDateTime(lastSignedAt) : "-",
          "No",
          statusText,
        ];
    aoa.push(rankingRow);
  });

  const summaryStartRow = aoa.length + 3;
  aoa.push(
    [],
    ["Payment Export Summary"],
    ["Total Paid Agents In This Cycle", sortedDocs.length],
    ["Total Cash Amount (THB)", totalCashAmount],
    ...(totalPromoAmount > 0 ? [["Total RBH Promo (THB)", totalPromoAmount]] : []),
    ["Payment Cutoff", formatDateTime(getSignatureWindow(monthKey).dueAt.toISOString())],
    ["Generated At", new Date().toLocaleString("th-TH")],
    ["Document Rule", exportsAllEvaluated
      ? "May 2026 one-time export includes every evaluated agent; signatures can continue afterward."
      : "Include only agents signed complete by day 15 and no pending Appeal remains. Late signatures move to next payment cycle."],
    [],
    ["Signature Validation"],
    ["Seq", "Agent", "QA", "Supervisor", "Senior / Team Lead", "Agent Signature", "Document Ref.", "Status"],
  );

  sortedDocs.forEach((doc, index) => {
    const entries = effectiveEntriesForDoc(doc, signatures);
    aoa.push([
      index + 1,
      doc.agentName,
      getSignatureValidationRoleText(doc, entries, "QA"),
      getSignatureValidationRoleText(doc, entries, "Supervisor"),
      getSignatureValidationRoleText(doc, entries, "Senior"),
      getSignatureValidationRoleText(doc, entries, "Agent"),
      doc.documentHash.slice(0, 10),
      getSignatureValidationStatus(doc, entries, exportsAllEvaluated),
    ]);
  });

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = [
    { wch: 8 },
    { wch: 30 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 22 },
    { wch: 18 },
    { wch: 34 },
    { wch: 24 },
    { wch: 24 },
    { wch: 28 },
    { wch: 24 },
    { wch: 22 },
    { wch: 16 },
    { wch: 38 },
  ];
  sheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 14 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 14 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 14 } },
    { s: { r: 10, c: 0 }, e: { r: 10, c: 14 } },
    { s: { r: summaryStartRow - 1, c: 0 }, e: { r: summaryStartRow - 1, c: 14 } },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, "Monthly_Team_Summary");
  XLSX.writeFile(workbook, makePaymentFileName(monthKey));
}

function makePaymentPdfFileName(monthKey: string) {
  const label = getMonthLabel(monthKey).replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_ก-๙]+/g, "");
  return `Incentive_QA_Monthly_${label || monthKey}.pdf`;
}

function generatePaymentPdfFile(
  monthKey: string,
  readyDocs: SignatureDocument[],
  signatures: Record<string, SignatureEntry[]>,
  allMonthDocs: SignatureDocument[] = readyDocs
) {
  const sortedDocs = [...readyDocs].sort((a, b) => a.agentName.localeCompare(b.agentName, "th"));
  const dashboardSummary = getDashboardMonthSummaryForExport(monthKey, allMonthDocs, sortedDocs);
  const exportsAllEvaluated = shouldExportAllEvaluatedAgents(monthKey);
  const exportRuleText = exportsAllEvaluated
    ? "May 2026: Export all evaluated agents"
    : "Pay only signed complete by day 15";
  const totalCases = dashboardSummary.totalCases;
  const avgScore = dashboardSummary.avgScore;
  const totalCashAmount = sortedDocs.reduce((sum, doc) => sum + getDocumentIncentive(doc).cash, 0);
  const totalPromoAmount = sortedDocs.reduce((sum, doc) => sum + getDocumentIncentive(doc).promo, 0);
  const year = /^\d{4}-\d{2}$/.test(monthKey) ? monthKey.slice(0, 4) : "";
  const paymentCutoff = formatDateTime(getSignatureWindow(monthKey).dueAt.toISOString());

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  try {
    registerTHSarabunNew(pdf);
    pdf.setFont("THSarabunNew", "normal");
  } catch {}

  const pageW = 210;
  const pageH = 297;
  const left = 10;
  const right = 200;
  const bottom = 282;
  let y = 12;
  let pageNo = 1;

  const setFont = (size: number, bold = false, color: [number, number, number] = [31, 41, 55]) => {
    try {
      pdf.setFont("THSarabunNew", bold ? "bold" : "normal");
    } catch {}
    pdf.setFontSize(size);
    pdf.setTextColor(color[0], color[1], color[2]);
  };

  const drawText = (
    value: string | number,
    x: number,
    yy: number,
    size = 10,
    bold = false,
    color: [number, number, number] = [31, 41, 55],
    options?: { align?: "left" | "center" | "right" }
  ) => {
    setFont(size, bold, color);
    pdf.text(String(value ?? ""), x, yy, options);
  };

  const drawWrap = (
    value: string | number,
    x: number,
    yy: number,
    width: number,
    size = 8.2,
    bold = false,
    color: [number, number, number] = [31, 41, 55],
    lineHeight = 3.2,
    maxLines = 2
  ) => {
    setFont(size, bold, color);
    const lines = pdf.splitTextToSize(String(value ?? ""), width).slice(0, maxLines);
    lines.forEach((line: string, index: number) => pdf.text(line, x, yy + index * lineHeight));
  };

  const footer = () => {
    drawText(`Page ${pageNo}`, right, pageH - 7, 7.5, false, [148, 163, 184], { align: "right" });
  };

  const addPage = (title?: string) => {
    footer();
    pdf.addPage("a4", "portrait");
    pageNo += 1;
    y = 12;
    if (title) section(title);
  };

  const ensureSpace = (height: number, continuedTitle?: string) => {
    if (y + height > bottom) {
      addPage(continuedTitle);
    }
  };

  const section = (title: string) => {
    ensureSpace(14);
    pdf.setFillColor(109, 40, 217);
    pdf.roundedRect(left, y, right - left, 8, 2, 2, "F");
    drawText(title, left + 4, y + 5.7, 11.5, true, [255, 255, 255]);
    y += 12;
  };

  const cell = (label: string, value: string | number, x: number, yy: number, width: number, height = 15) => {
    pdf.setDrawColor(226, 232, 240);
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(x, yy, width, height, 2, 2, "FD");
    drawText(label, x + 3, yy + 5, 7.5, true, [100, 116, 139]);
    drawWrap(value, x + 3, yy + 11, width - 6, 9.5, true, [15, 23, 42], 3.2, 1);
  };

  const drawTableHeader = (headers: Array<[string, number]>) => {
    pdf.setFillColor(237, 233, 254);
    pdf.setDrawColor(221, 214, 254);
    pdf.rect(left, y, right - left, 8, "FD");
    let cx = left;
    headers.forEach(([label, width]) => {
      const align = label === "Seq" || label === "Cases" || label === "Avg" || label === "Grade" || label === "Critical" ? "center" : "left";
      drawColText(label, cx, y + 5.6, width, 7.6, true, [88, 28, 135], align);
      cx += width;
    });
    y += 8;
  };

  const drawColText = (
    value: string | number,
    x: number,
    yy: number,
    width: number,
    size = 7.6,
    bold = false,
    color: [number, number, number] = [31, 41, 55],
    align: "left" | "center" | "right" = "left"
  ) => {
    setFont(size, bold, color);
    const safeValue = String(value ?? "");
    const lines = pdf.splitTextToSize(safeValue, width - 2);
    const firstLine = Array.isArray(lines) ? String(lines[0] ?? "") : safeValue;
    if (align === "center") {
      pdf.text(firstLine, x + width / 2, yy, { align: "center" });
    } else if (align === "right") {
      pdf.text(firstLine, x + width - 1, yy, { align: "right" });
    } else {
      pdf.text(firstLine, x + 1, yy);
    }
  };

  pdf.setFillColor(95, 39, 159);
  pdf.rect(0, 0, pageW, 22, "F");
  drawText("Monthly Team Summary", left, 9, 16, true, [255, 255, 255]);
  drawText("Incentive QA Monthly Payment Export", left, 16, 9.5, false, [255, 255, 255]);
  drawText(getMonthLabel(monthKey), right, 16, 9.5, true, [255, 255, 255], { align: "right" });

  y = 28;
  section("Current View");
  const overallGrade = getOverallPdfGradeLabel(avgScore);
  const colW = (right - left - 8) / 3;
  cell("Month", getMonthLabel(monthKey), left, y, colW);
  cell("Year", year || "-", left + colW + 4, y, colW);
  cell("Team Cases", totalCases, left + (colW + 4) * 2, y, colW);
  y += 18;
  cell("Avg Score", avgScore.toFixed(2), left, y, colW);
  cell("Overall Grade", overallGrade, left + colW + 4, y, colW);
  cell("Payment Status", sortedDocs.length > 0 ? "Ready to Export" : "Hold", left + (colW + 4) * 2, y, colW);
  y += 18;
  cell("Total Cash (THB)", formatBahtAmount(totalCashAmount), left, y, colW);
  cell("Total Promo (THB)", formatBahtAmount(totalPromoAmount), left + colW + 4, y, colW);
  cell("Payment Cutoff", paymentCutoff, left + (colW + 4) * 2, y, colW);
  y += 20;
  pdf.setDrawColor(226, 232, 240);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(left, y, right - left, 17, 2, 2, "FD");
  drawText("Export Rule", left + 3, y + 5, 7.5, true, [100, 116, 139]);
  drawWrap(exportRuleText, left + 3, y + 11, right - left - 6, 8.5, false, [31, 41, 55], 3.2, 2);
  y += 24;

  section("Agent Monthly Ranking");
  const rankingHeaders: Array<[string, number]> = [
    ["Seq", 10],
    ["Agent", 47],
    ["Cases", 16],
    ["Avg", 18],
    ["Grade", 13],
    ["Incentive", 26],
    ["Critical", 16],
    ["Status", 44],
  ];

  drawTableHeader(rankingHeaders);
  if (!sortedDocs.length) {
    pdf.setDrawColor(226, 232, 240);
    pdf.setFillColor(248, 250, 252);
    pdf.rect(left, y, right - left, 12, "FD");
    drawText("No payment-ready agents for this cycle.", left + 4, y + 7.5, 9.5, true, [180, 83, 9]);
    y += 14;
  }

  sortedDocs.forEach((doc, index) => {
    ensureSpace(9, "Agent Monthly Ranking (continued)");
    if (y === 24) drawTableHeader(rankingHeaders);

    const entries = effectiveEntriesForDoc(doc, signatures);
    const statusText = getAgentSignedStatusText(doc, entries, exportsAllEvaluated);
    const incentive = getDocumentIncentive(doc);
    const incentiveText = totalPromoAmount > 0
      ? `${formatBahtAmount(incentive.cash)} + ${formatBahtAmount(incentive.promo)}`
      : formatBahtAmount(incentive.cash);
    const row = [
      String(index + 1),
      doc.agentName,
      String(doc.caseCount),
      doc.averageScore.toFixed(2),
      doc.grade,
      incentiveText,
      "0",
      statusText,
    ];

    pdf.setDrawColor(226, 232, 240);
    const shade = index % 2 === 0 ? 255 : 248;
    pdf.setFillColor(shade, shade === 255 ? 255 : 250, shade === 255 ? 255 : 252);
    pdf.rect(left, y, right - left, 8, "FD");

    let cx = left;
    row.forEach((value, colIndex) => {
      const [label, width] = rankingHeaders[colIndex];
      const align = label === "Seq" || label === "Cases" || label === "Avg" || label === "Grade" || label === "Critical" ? "center" : "left";
      drawColText(value, cx, y + 5.4, width, label === "Status" ? 6.8 : 7.3, colIndex === 1 || label === "Incentive", [31, 41, 55], align);
      cx += width;
    });
    y += 8;
  });

  y += 6;
  section("Topic Performance % - Team Monthly");
  const topicMap = new Map<string, { code: string; title: string; max: number; total: number; count: number }>();
  allMonthDocs.forEach((doc) => {
    doc.cases.forEach((item) => {
      item.topics?.forEach((topic) => {
        if (!topic.code || topic.code === SIGNATURE_TOPIC_MISSING) return;
        const current = topicMap.get(topic.code) || {
          code: topic.code,
          title: topic.title || topic.code,
          max: Number(topic.max) || 0,
          total: 0,
          count: 0,
        };
        current.title = current.title || topic.title || topic.code;
        current.max = Math.max(current.max, Number(topic.max) || 0);
        current.total += Number(topic.score) || 0;
        current.count += 1;
        topicMap.set(topic.code, current);
      });
    });
  });

  const topicRows = Array.from(topicMap.values()).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const topicHeaders: Array<[string, number]> = [
    ["Topic", 18],
    ["Description", 86],
    ["Avg Score", 24],
    ["Max", 18],
    ["Avg %", 22],
    ["Status", 22],
  ];
  drawTableHeader(topicHeaders);

  if (!topicRows.length) {
    const fallbackTopics = SIGNATURE_JUNE_2026_TOPIC_MASTER;
    fallbackTopics.forEach((topic, index) => {
      ensureSpace(8, "Topic Performance % - Team Monthly (continued)");
      const shade = index % 2 === 0 ? 255 : 248;
      pdf.setDrawColor(226, 232, 240);
      pdf.setFillColor(shade, shade === 255 ? 255 : 250, shade === 255 ? 255 : 252);
      pdf.rect(left, y, right - left, 8, "FD");
      const row = [topic.code, topic.label, "-", String(topic.max), "-", "-"];
      let cx = left;
      row.forEach((value, colIndex) => {
        const [label, width] = topicHeaders[colIndex];
        const align = label === "Description" ? "left" : "center";
        drawColText(value, cx, y + 5.4, width, 7.2, colIndex === 0, [31, 41, 55], align);
        cx += width;
      });
      y += 8;
    });
  } else {
    topicRows.forEach((topic, index) => {
      ensureSpace(8, "Topic Performance % - Team Monthly (continued)");
      const avgTopicScore = topic.count ? topic.total / topic.count : 0;
      const avgPct = topic.max > 0 ? (avgTopicScore / topic.max) * 100 : 0;
      const status = topic.max > 0 ? (avgPct >= 85 ? "Good" : avgPct >= 75 ? "Watch" : "Improve") : "-";
      const shade = index % 2 === 0 ? 255 : 248;
      pdf.setDrawColor(226, 232, 240);
      pdf.setFillColor(shade, shade === 255 ? 255 : 250, shade === 255 ? 255 : 252);
      pdf.rect(left, y, right - left, 8, "FD");
      const row = [
        topic.code,
        topic.title,
        avgTopicScore.toFixed(2),
        String(topic.max || "-"),
        topic.max > 0 ? `${avgPct.toFixed(1)}%` : "-",
        status,
      ];
      let cx = left;
      row.forEach((value, colIndex) => {
        const [label, width] = topicHeaders[colIndex];
        const align = label === "Description" ? "left" : "center";
        drawColText(value, cx, y + 5.4, width, label === "Description" ? 6.8 : 7.1, colIndex === 0, [31, 41, 55], align);
        cx += width;
      });
      y += 8;
    });
  }

  y += 6;
  section("Payment Export Summary");
  const summaryRows = [
    ["Total Paid Agents In This Cycle", String(sortedDocs.length)],
    ["Total Cash Amount (THB)", formatBahtAmount(totalCashAmount)],
    ...(totalPromoAmount > 0 ? [["Total RBH Promo (THB)", formatBahtAmount(totalPromoAmount)]] : []),
    ["Payment Cutoff", paymentCutoff],
    ["Generated At", new Date().toLocaleString("th-TH")],
    ["Document Rule", exportsAllEvaluated
      ? "May 2026 urgent export includes every evaluated agent; signatures can continue afterward."
      : "Include only agents signed complete by day 15 and no pending Appeal remains. Late signatures move to next payment cycle."],
  ];

  summaryRows.forEach((row, index) => {
    ensureSpace(10, "Payment Export Summary (continued)");
    pdf.setDrawColor(226, 232, 240);
    pdf.setFillColor(index % 2 === 0 ? 255 : 248, index % 2 === 0 ? 255 : 250, index % 2 === 0 ? 255 : 252);
    pdf.rect(left, y, right - left, 9, "FD");
    drawText(row[0], left + 3, y + 6, 8, true, [71, 85, 105]);
    drawWrap(row[1], left + 70, y + 6, right - left - 74, 8, false, [31, 41, 55], 3.2, 1);
    y += 9;
  });

  footer();
  const fileName = makePaymentPdfFileName(monthKey);
  savePdfFile(pdf, fileName);
  return fileName;
}

function SignaturePill({ status }: { status: SignatureStepStatus }) {
  const tone =
    status === "Signed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "Pending"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : status === "Expired"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : status === "Locked"
            ? "border-slate-200 bg-slate-100 text-slate-500"
            : "border-slate-200 bg-slate-50 text-slate-500";
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${tone}`}>{status}</span>;
}

function SignaturePadModal({
  roleLabel,
  signerName,
  savedSignatureDataUrl,
  onCancel,
  onUseSavedSignature,
  onSave,
}: {
  roleLabel: string;
  signerName: string;
  savedSignatureDataUrl?: string;
  onCancel: () => void;
  onUseSavedSignature?: () => void | Promise<void>;
  onSave: (dataUrl: string, saveToLibrary: boolean) => void | Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);
  const [saveToLibrary, setSaveToLibrary] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#111827";
  }, []);

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.setPointerCapture(event.pointerId);
    const point = getPoint(event);
    drawingRef.current = true;
    hasDrawnRef.current = true;
    context.beginPath();
    context.moveTo(point.x, point.y);
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const point = getPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const stopDrawing = () => {
    drawingRef.current = false;
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawnRef.current = false;
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!hasDrawnRef.current) {
      window.alert("กรุ�“เธฒเธงเธฒเธ”ลายเซ็นก่อนก�”ยืนยันเซ็นใหม่");
      return;
    }
    onSave(canvas.toDataURL("image/png"), saveToLibrary);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-[30px] border border-violet-100 bg-white p-5 shadow-[0_30px_80px_rgba(15,23,42,0.35)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-500">Draw Signature</div>
            <div className="mt-1 text-xl font-black text-slate-950">{roleLabel}</div>
            <div className="mt-1 text-sm font-semibold text-slate-500">{signerName}</div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600 transition hover:bg-slate-50"
          >
            ปิ�”
          </button>
        </div>

        {savedSignatureDataUrl ? (
          <div className="mt-4 rounded-[22px] border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-sm font-black text-emerald-800">มีลายเซ็นเ�”ิมของคุ�“ในระบบ</div>
            <div className="mt-1 text-xs font-bold text-emerald-700">
              หาก�•้องการใช้ลายเซ็นนี้ ให้ก�”ปุ่มยืนยัน�”้านล่าง ระบบจะบัน�—ึกการลงนาม�—ัน�—เธต
            </div>
            <div className="mt-2 rounded-2xl border border-emerald-100 bg-white p-3">
              <img src={savedSignatureDataUrl} alt="Saved signature" className="h-16 max-w-full object-contain" />
            </div>
            <button
              type="button"
              onClick={onUseSavedSignature}
              className="mt-3 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-700"
            >
              ยืนยันใช้ลายเซ็นเ�”เธดเธก
            </button>
          </div>
        ) : null}

        <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">เธซเธฃเธทเธญเธงเธฒเธ”ลายเซ็นใหม่</div>
          <canvas
            ref={canvasRef}
            width={900}
            height={260}
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            onPointerLeave={stopDrawing}
            className="h-[220px] w-full touch-none rounded-[18px] border border-slate-200 bg-white"
          />
        </div>

        <label className="mt-4 flex items-center gap-2 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-800">
          <input
            type="checkbox"
            checked={saveToLibrary}
            onChange={(event) => setSaveToLibrary(event.target.checked)}
            className="h-4 w-4 accent-violet-700"
          />
          บัน�—ึกลายเซ็นนี้ไว้ใช้ครั้ง�•่อไป
        </label>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={clearSignature}
            className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-black text-rose-700 transition hover:bg-rose-100"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={saveSignature}
            className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white transition hover:bg-violet-800"
          >
            ยืนยันเซ็นใหม่
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SignatureCenterMockup({
  currentUser,
  accounts = [],
}: {
  currentUser: CurrentUser;
  accounts?: UserAccountSnapshot[];
}) {
  const [documents, setDocuments] = useState<SignatureDocument[]>([]);
  const [appealLogs, setAppealLogs] = useState<UsageLogEvent[]>([]);
  const [signatures, setSignatures] = useState<Record<string, SignatureEntry[]>>(() => readSignatureStore());
  const [signatureLibrary, setSignatureLibrary] = useState<Record<string, string>>(() => readSignatureLibraryStore());
  const [confirmedDocs, setConfirmedDocs] = useState<Record<string, string>>(() => readConfirmedStore());
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [selectedYear, setSelectedYear] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [quickFilter, setQuickFilter] = useState<WorkspaceQuickFilter>("all");
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [workspaceDetailOpen, setWorkspaceDetailOpen] = useState(false);
  const workspaceDetailRef = useRef<HTMLDivElement | null>(null);
  const [documentView, setDocumentView] = useState<"queue" | "history">("queue");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadMessage, setLoadMessage] = useState("");
  const [pdfMessage, setPdfMessage] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [signingRole, setSigningRole] = useState<SignRole | null>(null);
  const shareLinkAppliedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const loadAppeals = async () => {
      try {
        const logs = await fetchAppealEvents();
        if (alive) setAppealLogs(logs);
      } catch (error) {
        console.warn("Signature Center appeal logs failed", error);
        if (alive) setAppealLogs([]);
      }
    };
    void loadAppeals();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        setLoading(true);
        setLoadMessage("");
        const loadedDocs: SignatureDocument[] = [];
        const rawAppealMap = await fetchSignatureRawAppealMap().catch((error) => {
          console.warn("Signature Center raw appeal merge skipped", error);
          return new Map<string, SignatureApprovedAppeal>();
        });
        let approvedAppealMap = rawAppealMap;

        // Fallback only: if no uploaded Appeal ROWDATA exists, use web approval logs.
        if (!approvedAppealMap.size) {
          const approvedAppealLogs = await fetchAppealEvents(
            [
              "appeal_request_submitted",
              "appeal_request_reviewed",
              "appeal_request_reset",
            ],
            { limit: 2000, forceRefresh: true }
          ).catch((error) => {
            console.warn("Signature Center approved appeal merge skipped", error);
            return [] as UsageLogEvent[];
          });
          approvedAppealMap = buildSignatureApprovedAppealMap(approvedAppealLogs as UsageLogEvent[]);
        }
        for (const fileName of RAW_DATA_FILES) {
          const response = await fetch(fileName, { cache: "no-store" });
          if (!response.ok) continue;
          const buffer = await response.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
          const sheet = workbook.Sheets["Raw_Data"] || workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
          loadedDocs.push(...buildDocuments(rows, accounts, approvedAppealMap));
        }
        const storedEvaluations = await fetchStoredEvaluations(1000).catch((error) => {
          console.warn("Signature Center stored evaluations skipped", error);
          return [] as StoredEvaluation[];
        });
        const rawMonthKeys = new Set(loadedDocs.map((doc) => doc.monthKey).filter(Boolean));
        loadedDocs.push(
          ...buildDocumentsFromStoredEvaluations(storedEvaluations, accounts, approvedAppealMap).filter(
            (doc) => !rawMonthKeys.has(doc.monthKey)
          )
        );
        if (!loadedDocs.length) throw new Error("ไม่พบข้อมูลจากไฟล์ QA Raw Data");
        const docMap = new Map<string, SignatureDocument>();
        loadedDocs.forEach((doc) => {
          const existing = docMap.get(doc.id);
          docMap.set(doc.id, existing ? mergeSignatureDocuments(existing, doc) : doc);
        });

        // Do not add every All Team user into monthly payment export.
        // Payment PDF / Excel must follow the names already shown in the monthly Dashboard.
        // Special Dashboard exception: March 2026 includes Anucha Makundin even with 0 evaluated cases.
        const marchAnuchaKey = "2026-03::Anucha Makundin";
        if (!docMap.has(marchAnuchaKey)) {
          const anuchaAccount = accounts.find((account) =>
            isSamePerson(account.agentName, "Anucha Makundin") ||
            isSamePerson(account.displayName, "Anucha Makundin") ||
            isSamePerson(account.username, "Anucha Makundin")
          );
          docMap.set(marchAnuchaKey, createZeroCaseDocument("2026-03", anuchaAccount || {
            username: "anucha",
            displayName: "Anucha Makundin",
            agentName: "Anucha Makundin",
            role: "Admin Live Chat",
            teamName: "-",
            teamLead: "",
            status: "Historical",
          }));
        }

        const canonicalDocMap = new Map<string, SignatureDocument>();
        Array.from(docMap.values()).forEach((doc) => {
          const canonicalName = canonicalAgentName(doc.agentName);
          const canonicalId = `${doc.monthKey}::${canonicalName}`;
          const normalizedDoc = sortSignatureDocumentCases({ ...doc, id: canonicalId, agentName: canonicalName });
          const existing = canonicalDocMap.get(canonicalId);
          if (!existing) {
            canonicalDocMap.set(canonicalId, normalizedDoc);
            return;
          }
          canonicalDocMap.set(canonicalId, mergeSignatureDocuments(existing, normalizedDoc));
        });

        const nextDocs = Array.from(canonicalDocMap.values()).map(sortSignatureDocumentCases).sort(
          (a, b) => b.monthKey.localeCompare(a.monthKey) || a.agentName.localeCompare(b.agentName, "th")
        );
        if (!alive) return;
        setDocuments(nextDocs);
        setSelectedDocumentId((current) => current || nextDocs[0]?.id || "");
      } catch (error) {
        if (!alive) return;
        setLoadMessage(error instanceof Error ? error.message : "โหล�”ข้อมูล Signature ไม่สำเร็จ");
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [accounts]);

  useEffect(() => {
    let alive = true;
    const loadRemoteSignatures = async () => {
      try {
        const storedDocs = await fetchStoredSignatureDocuments();
        if (!alive || !storedDocs.length) return;

        setSignatures((previous) => {
          const next = { ...previous };
          storedDocs.forEach((doc) => {
            if (doc.entries.length) {
              next[doc.docId] = doc.entries as SignatureEntry[];
            } else {
              delete next[doc.docId];
            }
          });
          return next;
        });

        setConfirmedDocs((previous) => {
          const next = { ...previous };
          storedDocs.forEach((doc) => {
            if (doc.confirmedAt) {
              next[doc.docId] = doc.confirmedAt;
            } else {
              delete next[doc.docId];
            }
          });
          return next;
        });
      } catch (error) {
        console.warn("Load remote signatures failed", error);
      }
    };
    void loadRemoteSignatures();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    writeSignatureStore(signatures);
  }, [signatures]);

  useEffect(() => {
    writeConfirmedStore(confirmedDocs);
  }, [confirmedDocs]);

  useEffect(() => {
    writeSignatureLibraryStore(signatureLibrary);
  }, [signatureLibrary]);

  const monthOptions = useMemo(() => Array.from(new Set(documents.map((item) => item.monthKey))).sort().reverse(), [documents]);
  const yearOptions = useMemo(
    () => Array.from(new Set(monthOptions.map((month) => month.slice(0, 4)).filter(Boolean))).sort().reverse(),
    [monthOptions]
  );

  useEffect(() => {
    if (shareLinkAppliedRef.current || !documents.length) return;
    const params = new URLSearchParams(window.location.search);
    const monthParam = params.get("month");
    const docParam = params.get("doc");
    if (monthParam) setSelectedMonth(monthParam);
    if (docParam && documents.some((doc) => doc.id === docParam)) {
      setSelectedDocumentId(docParam);
      setStatusFilter("all");
    }
    if (monthParam || docParam) shareLinkAppliedRef.current = true;
  }, [documents]);

  const pendingAppealCaseMap = useMemo(() => {
    const map = new Map<string, PendingAppealCase>();
    buildAppealRequests(appealLogs)
      .filter((request) => request.status === "Pending")
      .forEach((request) => {
        const caseId = normalizeText(request.caseId);
        if (!caseId) return;
        map.set(caseId, {
          caseId,
          agent: request.agent,
          status: request.status,
          submittedAt: request.submittedAt,
        });
      });
    return map;
  }, [appealLogs]);

  const visibleDocuments = useMemo(() => {
    return documents.filter((doc) => canViewDocument(currentUser, doc, effectiveEntriesForDoc(doc, signatures)));
  }, [currentUser, documents, signatures]);

  const filteredDocuments = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return visibleDocuments.filter((doc) => {
      const entries = effectiveEntriesForDoc(doc, signatures);
      const signedCount = SIGNATURE_FLOW.filter((role) => Boolean(getSignedEntry(entries, role))).length;
      const pendingRoles = getPendingRoles(entries);
      const isComplete = signedCount === SIGNATURE_FLOW.length;
      const timeline = getTimelineStatus(doc.monthKey);
      const statusMatch =
        statusFilter === "all" ||
        (statusFilter === "my-turn" && pendingRoles.some((role) => canSignIdentity(currentUser, doc, role) && canSignRoleByDate(doc.monthKey, entries, role))) ||
        (statusFilter === "preview" && !confirmedDocs[doc.id] && !isHistoricalPaidPeriod(doc.monthKey)) ||
        (statusFilter === "ready" && isComplete && doc.eligibleByScore) ||
        (statusFilter === "pending" && !isComplete) ||
        (statusFilter === "expired" && timeline === "Signature Deadline Passed" && !isComplete) ||
        (statusFilter === "appeal-pending" && doc.cases.some((item) => pendingAppealCaseMap.has(item.caseId)));
      const monthMatch = selectedMonth === "all" || doc.monthKey === selectedMonth;
      const keywordMatch =
        !keyword ||
        doc.agentName.toLowerCase().includes(keyword) ||
        getMonthlyDocumentRef(doc, documents).toLowerCase().includes(keyword) ||
        doc.documentHash.toLowerCase().includes(keyword) ||
        doc.monthKey.toLowerCase().includes(keyword) ||
        doc.monthLabel.toLowerCase().includes(keyword) ||
        doc.teamName.toLowerCase().includes(keyword) ||
        doc.seniorName.toLowerCase().includes(keyword) ||
        doc.supervisorName.toLowerCase().includes(keyword) ||
        doc.cases.some((item) =>
          item.caseId.toLowerCase().includes(keyword) ||
          item.inquiry.toLowerCase().includes(keyword) ||
          item.comment.toLowerCase().includes(keyword)
        );
      return statusMatch && monthMatch && keywordMatch;
    }).sort((a, b) => a.agentName.localeCompare(b.agentName, "th"));
  }, [confirmedDocs, currentUser, documents, pendingAppealCaseMap, search, selectedMonth, signatures, statusFilter, visibleDocuments]);

  const historyFilteredDocuments = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return documents.filter((doc) => {
      if (!canMonitorDocument(currentUser, doc)) return false;

      const monthMatch = selectedMonth === "all" || doc.monthKey === selectedMonth;
      const keywordMatch =
        !keyword ||
        doc.agentName.toLowerCase().includes(keyword) ||
        getMonthlyDocumentRef(doc, documents).toLowerCase().includes(keyword) ||
        doc.documentHash.toLowerCase().includes(keyword) ||
        doc.monthKey.toLowerCase().includes(keyword) ||
        doc.monthLabel.toLowerCase().includes(keyword) ||
        doc.teamName.toLowerCase().includes(keyword) ||
        doc.seniorName.toLowerCase().includes(keyword) ||
        doc.supervisorName.toLowerCase().includes(keyword) ||
        doc.cases.some((item) =>
          item.caseId.toLowerCase().includes(keyword) ||
          item.inquiry.toLowerCase().includes(keyword) ||
          item.comment.toLowerCase().includes(keyword)
        );

      return monthMatch && keywordMatch;
    }).sort((a, b) => a.agentName.localeCompare(b.agentName, "th"));
  }, [currentUser, documents, search, selectedMonth]);

  const activeDocuments = documentView === "history" ? historyFilteredDocuments : filteredDocuments;
  const workspaceDocuments = useMemo(() => {
    return activeDocuments.filter((doc) => {
      const entries = effectiveEntriesForDoc(doc, signatures);
      const docStatus = getWorkspaceStatus(doc, entries);
      const yearMatch = selectedYear === "all" || doc.monthKey.startsWith(`${selectedYear}-`);
      const quickMatch = quickFilter === "all" || docStatus === quickFilter;
      return yearMatch && quickMatch;
    }).sort((a, b) => {
      const dateDiff = getDocumentAuditSortTime(a) - getDocumentAuditSortTime(b);
      if (dateDiff) return dateDiff;
      return a.agentName.localeCompare(b.agentName, "th");
    });
  }, [activeDocuments, quickFilter, selectedYear, signatures]);

  const workspaceSummary = useMemo(() => {
    const counts = {
      total: workspaceDocuments.length,
      pending: 0,
      signed: 0,
      expired: 0,
      inProgress: 0,
    };
    workspaceDocuments.forEach((doc) => {
      const status = getWorkspaceStatus(doc, effectiveEntriesForDoc(doc, signatures));
      if (status === "pending") counts.pending += 1;
      if (status === "signed") counts.signed += 1;
      if (status === "expired") counts.expired += 1;
      if (status === "in-progress") counts.inProgress += 1;
    });
    return counts;
  }, [signatures, workspaceDocuments]);

  useEffect(() => {
    setCurrentPage(1);
  }, [documentView, quickFilter, search, selectedMonth, selectedYear, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(workspaceDocuments.length / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedWorkspaceDocuments = useMemo(() => {
    const start = (safeCurrentPage - 1) * rowsPerPage;
    return workspaceDocuments.slice(start, start + rowsPerPage);
  }, [rowsPerPage, safeCurrentPage, workspaceDocuments]);

  const groupedWorkspaceDocuments = useMemo(() => {
    const groups = new Map<string, SignatureDocument[]>();
    pagedWorkspaceDocuments.forEach((doc) => {
      const group = groups.get(doc.monthKey) || [];
      group.push(doc);
      groups.set(doc.monthKey, group);
    });
    return Array.from(groups.entries()).map(([monthKey, items]) => ({
      monthKey,
      monthLabel: getMonthLabel(monthKey),
      items,
    }));
  }, [pagedWorkspaceDocuments]);

  const clearWorkspaceFilters = () => {
    setSearch("");
    setSelectedMonth("all");
    setSelectedYear("all");
    setStatusFilter("all");
    setQuickFilter("all");
    setCurrentPage(1);
  };

  const openWorkspaceDetail = (docId: string) => {
    setSelectedDocumentId(docId);
    setWorkspaceDetailOpen(true);
    window.setTimeout(() => {
      workspaceDetailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  const isQaUser = currentUser.role === "Quality Assurance";
  const monitorTitle = isQaUser ? "QA Monitor" : "ประวั�•ิของฉัน";
  const monitorDescription = isQaUser
    ? "แส�”งเอกสาร�—ี่ QA คนนี้รับผิ�”ชอบ พร้อมส�–านะว่าใครเซ็นแล้วและใครยังเหลือ"
    : "แส�”งเฉพาะเอกสาร�—ี่เกี่ยวข้องกับสิ�—ธิ์ของคุ�“เ�—่านั้น";

  const selectedMonthAllDocs = useMemo(() => {
    if (selectedMonth === "all") return [];
    return documents.filter((doc) => doc.monthKey === selectedMonth);
  }, [documents, selectedMonth]);

  const selectedMonthPaymentDocs = useMemo(() => {
    if (selectedMonth === "all") return [];
    return documents
      .filter((doc) => doc.monthKey === selectedMonth)
      .filter((doc) => isPaymentReadyDocument(doc, effectiveEntriesForDoc(doc, signatures), pendingAppealCaseMap));
  }, [documents, pendingAppealCaseMap, selectedMonth, signatures]);

  const selectedMonthExportDocs = useMemo(() => {
    if (selectedMonth === "all") return [];
    if (shouldExportAllEvaluatedAgents(selectedMonth)) {
      return selectedMonthAllDocs
        .filter((doc) => doc.caseCount > 0)
        .sort((a, b) => a.agentName.localeCompare(b.agentName, "th"));
    }
    return selectedMonthPaymentDocs;
  }, [selectedMonth, selectedMonthAllDocs, selectedMonthPaymentDocs]);

  const selectedMonthPaymentExportDocs = useMemo(() => {
    if (selectedMonth === "all") return [];
    const fallbackDocs = selectedMonthAllDocs
      .filter((doc) => doc.caseCount > 0)
      .sort((a, b) => a.agentName.localeCompare(b.agentName, "th"));
    return selectedMonthExportDocs.length ? selectedMonthExportDocs : fallbackDocs;
  }, [selectedMonth, selectedMonthAllDocs, selectedMonthExportDocs]);

  const selectedMonthLateSignedDocs = useMemo(() => {
    if (selectedMonth === "all") return [];
    return documents
      .filter((doc) => doc.monthKey === selectedMonth)
      .filter((doc) => isLateSignedDocument(doc, effectiveEntriesForDoc(doc, signatures), pendingAppealCaseMap));
  }, [documents, pendingAppealCaseMap, selectedMonth, signatures]);

  const rolePendingCounts = useMemo(() => {
    const counts: Record<SignRole, number> = { QA: 0, Supervisor: 0, Senior: 0, Agent: 0 };
    const sourceDocs = documents
      .filter((doc) => selectedMonth === "all" || doc.monthKey === selectedMonth)
      .filter((doc) => canMonitorDocument(currentUser, doc));

    sourceDocs.forEach((doc) => {
      if (!isAfterAppealPeriod(doc.monthKey)) return;
      if (doc.cases.some((item) => pendingAppealCaseMap.has(item.caseId))) return;
      const entries = effectiveEntriesForDoc(doc, signatures);
      getPendingRoles(entries).forEach((role) => {
        if (currentUser.role !== "Quality Assurance" && !canSignIdentity(currentUser, doc, role)) return;
        counts[role] += 1;
      });
    });

    return counts;
  }, [currentUser, documents, pendingAppealCaseMap, selectedMonth, signatures]);

  const selectedMonthTotalDocs = selectedMonthAllDocs.length;
  const selectedMonthExportAllEvaluated = selectedMonth !== "all" && shouldExportAllEvaluatedAgents(selectedMonth);

  const canGeneratePaymentExcel = selectedMonth !== "all";

  const selectedDocumentSource =
    workspaceDocuments.find((item) => item.id === selectedDocumentId) ||
    workspaceDocuments[0] ||
    activeDocuments[0] ||
    filteredDocuments[0] ||
    historyFilteredDocuments[0] ||
    null;
  const selectedDocument = selectedDocumentSource ? sortSignatureDocumentCases(selectedDocumentSource) : null;
  const selectedEntries = selectedDocument ? effectiveEntriesForDoc(selectedDocument, signatures) : [];
  const selectedDocumentRef = selectedDocument ? getMonthlyDocumentRef(selectedDocument, documents) : "";
  const mySignedRoles = selectedDocument
    ? SIGNATURE_FLOW.filter((role) => {
        const signed = getSignedEntry(selectedEntries, role);
        return Boolean(signed) && canSignIdentity(currentUser, selectedDocument, role);
      })
    : [];
  const selectedPendingAppeals = selectedDocument
    ? selectedDocument.cases.filter((item) => pendingAppealCaseMap.has(item.caseId))
    : [];
  const hasPendingAppeal = selectedPendingAppeals.length > 0;
  const pendingRoles = getPendingRoles(selectedEntries);
  const lastSignedRole = [...SIGNATURE_FLOW].reverse().find((role) => Boolean(getSignedEntry(selectedEntries, role)));
  const signedCount = SIGNATURE_FLOW.filter((role) => Boolean(getSignedEntry(selectedEntries, role))).length;
  const isComplete = Boolean(selectedDocument && signedCount === SIGNATURE_FLOW.length);
  const readyForIncentive = Boolean(selectedDocument?.eligibleByScore && isComplete);
  const previewConfirmed = Boolean(selectedDocument && (confirmedDocs[selectedDocument.id] || isHistoricalPaidPeriod(selectedDocument.monthKey)));
  const workflowReadyToSign = Boolean(
    selectedDocument &&
    !hasPendingAppeal &&
    (previewConfirmed || isAfterAppealPeriod(selectedDocument.monthKey))
  );
  const confirmAvailable = Boolean(
    selectedDocument &&
    !previewConfirmed &&
    !hasPendingAppeal &&
    isAfterAppealPeriod(selectedDocument.monthKey) &&
    canSignIdentity(currentUser, selectedDocument, "Agent")
  );
  const confirmBlockedReason = selectedDocument && !previewConfirmed
    ? hasPendingAppeal
      ? "มีเคสยื่น Appeal เธ—ี่รอ Approved อยู่ จึงยังยืนยันรับ�—ราบไม่ไ�”้"
      : !isAfterAppealPeriod(selectedDocument.monthKey)
        ? "เปิ�”ให้ยืนยันรับ�—ราบหลังวัน�—ี่ 10 ของเ�”ือน�–เธฑเธ”ไป"
        : !canSignIdentity(currentUser, selectedDocument, "Agent")
          ? "เฉพาะ Agent ผู้�–ูกประเมินเ�—่านั้น�—ี่ก�”ยืนยันรับ�—ราบไ�”้"
          : ""
    : "";
  const timeline = selectedDocument ? getTimelineStatus(selectedDocument.monthKey) : "-";

  const getSavedSignatureKey = (role: SignRole) => {
    const identity = currentUser.username || currentUser.email || currentUser.agentName || currentUser.displayName;
    return `${compactPerson(identity)}::${role}`;
  };

  const createSignatureShareLink = (doc: SignatureDocument, role?: SignRole | null) => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "signature-center");
    url.searchParams.set("month", doc.monthKey);
    url.searchParams.set("doc", doc.id);
    if (role) url.searchParams.set("role", role);
    else url.searchParams.delete("role");
    return url.toString();
  };

  const summary = useMemo(() => {
    let complete = 0;
    let pending = 0;
    let ready = 0;
    let myTurn = 0;
    visibleDocuments.forEach((doc) => {
      const entries = effectiveEntriesForDoc(doc, signatures);
      const count = SIGNATURE_FLOW.filter((role) => Boolean(getSignedEntry(entries, role))).length;
      const pendingRoles = getPendingRoles(entries);
      if (count === SIGNATURE_FLOW.length) complete += 1;
      else pending += 1;
      if (count === SIGNATURE_FLOW.length && doc.eligibleByScore) ready += 1;
      if (pendingRoles.some((role) => canSignIdentity(currentUser, doc, role) && canSignRoleByDate(doc.monthKey, entries, role))) myTurn += 1;
    });
    return { total: visibleDocuments.length, complete, pending, ready, myTurn };
  }, [currentUser, signatures, visibleDocuments]);

  const persistDocumentSignatures = async (docId: string, entries: SignatureEntry[], confirmedAt = "") => {
    await saveStoredSignatureDocument(docId, entries, confirmedAt);
  };

  const confirmPreview = async () => {
    if (!selectedDocument || !confirmAvailable || hasPendingAppeal) return;
    const confirmedAt = new Date().toISOString();
    try {
      await saveStoredSignatureConfirm(selectedDocument.id, confirmedAt);
      setConfirmedDocs((previous) => ({
        ...previous,
        [selectedDocument.id]: confirmedAt,
      }));
    } catch (error) {
      console.warn("Save remote signature confirm failed", error);
      window.alert("บัน�—ึกการยืนยันรับ�—ราบไม่สำเร็จ กรุ�“าลองใหม่อีกครั้ง");
    }
  };

  const saveDrawnSignature = async (role: SignRole, signatureDataUrl: string, saveToSavedLibrary = false) => {
    if (!selectedDocument) return false;
    if (!canSignIdentity(currentUser, selectedDocument, role)) {
      window.alert("เซ็นแ�—นกันไม่ไ�”้ กรุ�“าให้เจ้าของลายเซ็น�•เธฒเธก Role เป็นผู้ลงนามเอง");
      return false;
    }
    const entries = effectiveEntriesForDoc(selectedDocument, signatures);
    const existingSigned = getSignedEntry(entries, role);
    const nextEntry: SignatureEntry = {
      role,
      signerName: existingSigned?.signerName || getRoleSigner(selectedDocument, role),
      status: "Signed",
      signedBy: existingSigned?.signedBy || currentUser.displayName || currentUser.username,
      signedAt: existingSigned?.signedAt || new Date().toISOString(),
      note: existingSigned?.note,
      signatureDataUrl,
    };

    const nextEntries = [...entries.filter((entry) => entry.role !== role), nextEntry];
    try {
      await persistDocumentSignatures(selectedDocument.id, nextEntries, confirmedDocs[selectedDocument.id] || "");
    } catch (error) {
      console.warn("Save remote signature failed", error);
      window.alert("บัน�—ึกลายเซ็นไม่สำเร็จ กรุ�“าลองใหม่อีกครั้ง");
      return false;
    }

    if (saveToSavedLibrary) {
      setSignatureLibrary((previous) => ({
        ...previous,
        [getSavedSignatureKey(role)]: signatureDataUrl,
      }));
    }

    setSignatures((previous) => {
      return {
        ...previous,
        [selectedDocument.id]: nextEntries,
      };
    });
    return true;
  };

  const signRole = async (role: SignRole, signatureDataUrl?: string, saveToSavedLibrary = false) => {
    if (!selectedDocument) return false;
    if (hasPendingAppeal) return false;
    if (!isAfterAppealPeriod(selectedDocument.monthKey)) return false;
    if (!canSignIdentity(currentUser, selectedDocument, role)) return false;
    const entries = effectiveEntriesForDoc(selectedDocument, signatures);
    if (!canSignRoleByDate(selectedDocument.monthKey, entries, role)) return false;
    if (getSignedEntry(entries, role)) return false;
    if (role === "Agent" && !previewConfirmed) {
      window.alert("Agent เธ•้องก�”ยืนยันรับ�—ราบข้อมูลก่อน จึงจะสามาร�–ลงนามในเอกสารของ�•ัวเองไ�”้");
      return false;
    }

    const signerName = getRoleSigner(selectedDocument, role);
    const nextEntry: SignatureEntry = {
      role,
      signerName,
      status: "Signed",
      signedBy: currentUser.displayName || currentUser.username,
      signedAt: new Date().toISOString(),
      signatureDataUrl,
    };

    const nextEntries = [...entries.filter((entry) => entry.role !== role), nextEntry];
    try {
      await persistDocumentSignatures(selectedDocument.id, nextEntries, confirmedDocs[selectedDocument.id] || "");
    } catch (error) {
      console.warn("Save remote signature failed", error);
      window.alert("บัน�—ึกลายเซ็นไม่สำเร็จ กรุ�“าลองใหม่อีกครั้ง");
      return false;
    }

    if (signatureDataUrl && saveToSavedLibrary) {
      setSignatureLibrary((previous) => ({
        ...previous,
        [getSavedSignatureKey(role)]: signatureDataUrl,
      }));
    }

    setSignatures((previous) => {
      return {
        ...previous,
        [selectedDocument.id]: nextEntries,
      };
    });
    return true;
  };

  const openSignaturePad = (role: SignRole) => {
    if (!selectedDocument) return;
    if (role === "Agent" && !previewConfirmed && !getSignedEntry(selectedEntries, "Agent")) {
      window.alert("กรุ�“าก�”ยืนยันรับ�—ราบข้อมูลก่อน แล้วจึงก�”เซ็นในช่อง Agent ผู้�–ูกประเมิน");
      return;
    }
    setSigningRole(role);
  };

  const resetSignatureRole = async (role: SignRole) => {
    if (!selectedDocument || isHistoricalPaidPeriod(selectedDocument.monthKey)) return;
    if (getTimelineStatus(selectedDocument.monthKey) !== "Signature Deadline Passed") return;
    if (currentUser.role !== "Quality Assurance") return;
    const resetAt = new Date().toISOString();
    const resetEntry: SignatureEntry = {
      role,
      signerName: getRoleSigner(selectedDocument, role),
      signedBy: "",
      signedAt: "",
      status: "Pending",
      note: SIGNATURE_DEADLINE_RESET_NOTE,
      resetBy: currentUser.displayName || currentUser.username,
      resetAt,
    };
    const nextEntriesForRemote = [...selectedEntries.filter((entry) => entry.role !== role), resetEntry];

    try {
      if (role === "Agent") {
        await clearStoredSignatureConfirm(selectedDocument.id, nextEntriesForRemote);
      } else {
        await persistDocumentSignatures(selectedDocument.id, nextEntriesForRemote, confirmedDocs[selectedDocument.id] || "");
      }
    } catch (error) {
      console.warn("Reset role signature failed", error);
      window.alert("รีเซ็�•ลายเซ็นไม่สำเร็จ กรุ�“าลองใหม่อีกครั้ง");
      return;
    }

    setSignatures((previous) => {
      return {
        ...previous,
        [selectedDocument.id]: nextEntriesForRemote,
      };
    });
    if (role === "Agent") {
      setConfirmedDocs((previous) => {
        const next = { ...previous };
        delete next[selectedDocument.id];
        return next;
      });
    }
  };

  const copySelectedDocumentShareLink = async () => {
    if (!selectedDocument) return;
    const link = createSignatureShareLink(selectedDocument, null);
    try {
      await navigator.clipboard.writeText(link);
      setShareMessage("คั�”ลอก Share Link แล้ว");
    } catch {
      window.prompt("คั�”ลอก Share Link นี้", link);
      setShareMessage("แส�”ง Share Link สำหรับคั�”ลอกแล้ว");
    }
    window.setTimeout(() => setShareMessage(""), 3000);
  };

  const copyNextSignerAlert = async () => {
    if (!selectedDocument) return;
    const entries = effectiveEntriesForDoc(selectedDocument, signatures);
    const pendingRoles = getPendingRoles(entries);
    const latestStatus = pendingRoles.length
      ? `${SIGNATURE_FLOW.length - pendingRoles.length}/4 role ลงนามแล้ว`
      : "เอกสารลงนามครบแล้ว";

    const text = pendingRoles.length
      ? [
          "แจ้งเ�•ือนลงนามเอกสาร QA Incentive",
          "",
          `เ�”ือน: ${selectedDocument.monthLabel}`,
          `Agent: ${selectedDocument.agentName}`,
          "",
          `เธชเธ–านะล่าสุ�”: ${latestStatus}`,
          "ผู้�—ี่ยัง�•้องลงนาม:",
          ...pendingRoles.map((role) => `- ${roleThaiLabel(role)}: ${getRoleSigner(selectedDocument, role)}`),
          "",
          "ก�”ลิงก์นี้เพื่อเปิ�”เอกสาร:",
          createSignatureShareLink(selectedDocument, null),
          "",
          "รบกวนเข้าระบบ Signature Center เพื่อลงนามค่ะ/ครับ",
        ].join("\n")
      : [
          "แจ้งเ�•ือนลงนามเอกสาร QA Incentive",
          "",
          `เ�”ือน: ${selectedDocument.monthLabel}`,
          `Agent: ${selectedDocument.agentName}`,
          "",
          "เธชเธ–านะล่าสุ�”: เอกสารลงนามครบแล้ว",
          "",
          "ก�”ลิงก์นี้เพื่อเปิ�”เอกสาร:",
          createSignatureShareLink(selectedDocument, null),
        ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setShareMessage("คั�”ลอกข้อความแจ้งเ�•ือนแล้ว");
    } catch {
      window.prompt("คั�”ลอกข้อความนี้เพื่อแจ้งเ�•ือน", text);
      setShareMessage("แส�”งข้อความแจ้งเ�•ือนสำหรับคั�”ลอกแล้ว");
    }

    window.setTimeout(() => setShareMessage(""), 3000);
  };

  const shareSignatureStatus = async () => {
    if (!selectedDocument) return;
    const entries = effectiveEntriesForDoc(selectedDocument, signatures);
    const lines = SIGNATURE_FLOW.map((role) => {
      const signed = getSignedEntry(entries, role);
      return `${signed ? "�…" : "❌"} ${roleThaiLabel(role)}: ${signed ? signed.signerName : "ยังไม่ลงนาม"}`;
    });
    const pendingLines = SIGNATURE_FLOW
      .filter((role) => !getSignedEntry(entries, role))
      .map((role) => `- ${roleThaiLabel(role)}: ${getRoleSigner(selectedDocument, role)}`);

    const text = [
      `เอกสาร Signature เ�”ือน ${selectedDocument.monthLabel}`,
      `Agent: ${selectedDocument.agentName}`,
      "",
      "เธชเธ–านะการลงนาม:",
      ...lines,
      "",
      pendingLines.length ? "ผู้�—ี่ยังไม่ลงนาม:" : "เธชเธ–านะ: ลงนามครบแล้ว",
      ...(pendingLines.length ? pendingLines : []),
      "",
      pendingLines.length
        ? "รบกวนผู้�—ี่ยังไม่ลงนาม เข้าระบบเพื่อเซ็นเอกสารให้เรียบร้อยค่ะ/ครับ"
        : "เอกสารนี้ลงนามครบแล้วค่ะ/ครับ",
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setShareMessage("คั�”ลอกข้อความแชร์แล้ว");
    } catch {
      window.prompt("คั�”ลอกข้อความนี้เพื่อแชร์", text);
      setShareMessage("แส�”งข้อความสำหรับคั�”ลอกแล้ว");
    }

    window.setTimeout(() => setShareMessage(""), 3000);
  };

  const resetDocument = () => {
    if (!selectedDocument || isHistoricalPaidPeriod(selectedDocument.monthKey)) return;
    setSignatures((previous) => {
      const next = { ...previous };
      delete next[selectedDocument.id];
      return next;
    });
    setConfirmedDocs((previous) => {
      const next = { ...previous };
      delete next[selectedDocument.id];
      return next;
    });
    void clearStoredSignatureConfirm(selectedDocument.id, []).catch((error) => {
      console.warn("Reset remote signature document failed", error);
    });
  };

  const generatePdf = async () => {
    if (!selectedDocument) return;
    const entries = effectiveEntriesForDoc(selectedDocument, signatures);
    const individualIncentive = getDocumentIncentive(selectedDocument);
    const needMoreToTarget = Math.max(CASE_TARGET - selectedDocument.caseCount, 0);
    const pdf = new jsPDF({ unit: "mm", format: "a4" });

    try {
      registerTHSarabunNew(pdf);
      pdf.setFont("THSarabunNew", "normal");
    } catch {}

    {
      const pageW = 210;
      const pageH = 297;
      const left = 10;
      const tableW = 186;
      const bottom = 289;
      const purple: [number, number, number] = [112, 48, 160];
      const purpleDark: [number, number, number] = [91, 44, 131];
      const lightPurple: [number, number, number] = [204, 193, 218];
      const palePurple: [number, number, number] = [248, 242, 251];
      const border: [number, number, number] = [184, 184, 184];
      const black: [number, number, number] = [18, 24, 38];
      const muted: [number, number, number] = [71, 85, 105];
      const good: [number, number, number] = [5, 150, 105];
      const warn: [number, number, number] = [180, 83, 9];
      const templateWidths = [15.36, 35.36, 12.27, 34.73, 19.91, 24.09, 30.36, 8, 25.36, 25.91];
      const widthScale = tableW / templateWidths.reduce((sum, value) => sum + value, 0);
      const colX = templateWidths.reduce<number[]>((acc, width) => {
        acc.push(acc[acc.length - 1] + width * widthScale);
        return acc;
      }, [left]);
      let y = 10;

      const setTemplateFont = (
        size: number,
        bold = false,
        color: [number, number, number] = black
      ) => {
        try {
          pdf.setFont("THSarabunNew", bold ? "bold" : "normal");
        } catch {}
        pdf.setFontSize(size);
        pdf.setTextColor(color[0], color[1], color[2]);
      };

      const columnX = (startCol: number) => colX[Math.max(0, Math.min(startCol, colX.length - 1))];
      const columnW = (startCol: number, endColExclusive: number) =>
        colX[Math.max(0, Math.min(endColExclusive, colX.length - 1))] - columnX(startCol);

      const fitLines = (value: unknown, width: number, fontSize: number, maxLines: number) => {
        setTemplateFont(fontSize);
        const rawLines = pdf.splitTextToSize(String(value ?? "-"), Math.max(4, width - 3));
        if (rawLines.length <= maxLines) return rawLines;
        const lines = rawLines.slice(0, maxLines);
        const last = String(lines[lines.length - 1] || "");
        lines[lines.length - 1] = last.length > 2 ? `${last.slice(0, Math.max(1, last.length - 2))}...` : "...";
        return lines;
      };

      const drawCell = (
        x: number,
        cellY: number,
        w: number,
        h: number,
        value: unknown,
        fill: [number, number, number],
        options: {
          bold?: boolean;
          color?: [number, number, number];
          size?: number;
          align?: "left" | "center" | "right";
          valign?: "top" | "middle";
          maxLines?: number;
          lineHeight?: number;
        } = {}
      ) => {
        const size = options.size ?? 8;
        const align = options.align ?? "left";
        const color = options.color ?? black;
        const maxLines = options.maxLines ?? 2;
        const lineHeight = options.lineHeight ?? size * 0.42 + 1.35;
        pdf.setLineWidth(0.15);
        pdf.setDrawColor(border[0], border[1], border[2]);
        pdf.setFillColor(fill[0], fill[1], fill[2]);
        pdf.rect(x, cellY, w, h, "FD");
        const lines = fitLines(value, w, size, maxLines);
        setTemplateFont(size, options.bold ?? false, color);
        const textX = align === "center" ? x + w / 2 : align === "right" ? x + w - 2 : x + 2;
        const textY =
          options.valign === "top"
            ? cellY + 4.2
            : cellY + h / 2 - ((lines.length - 1) * lineHeight) / 2 + size * 0.22;
        lines.forEach((lineText: string, index: number) => {
          pdf.text(lineText, textX, textY + index * lineHeight, { align });
        });
      };

      const drawCellCols = (
        startCol: number,
        endColExclusive: number,
        cellY: number,
        h: number,
        value: unknown,
        fill: [number, number, number],
        options: Parameters<typeof drawCell>[6] = {}
      ) => drawCell(columnX(startCol), cellY, columnW(startCol, endColExclusive), h, value, fill, options);

      const drawCellsByWidth = (
        startX: number,
        cellY: number,
        h: number,
        cells: Array<{
          value: unknown;
          width: number;
          fill: [number, number, number];
          options?: Parameters<typeof drawCell>[6];
        }>
      ) => {
        let cursorX = startX;
        cells.forEach((cell) => {
          drawCell(cursorX, cellY, cell.width, h, cell.value, cell.fill, cell.options);
          cursorX += cell.width;
        });
      };

      const drawHeader = (title: string, subtitle: string) => {
        drawCell(left, y, tableW, 9.2, title, purple, {
          bold: true,
          color: [255, 255, 255],
          size: 15.6,
          align: "left",
          maxLines: 1,
        });
        y += 9.2;
        drawCell(left, y, tableW, 7.0, subtitle, purple, {
          bold: true,
          color: [255, 255, 255],
          size: 9.0,
          align: "left",
          maxLines: 1,
        });
        y += 8.2;
      };

      const drawSection = (title: string) => {
        if (y + 10 > bottom) {
          pdf.addPage();
          y = 10;
        }
        drawCell(left, y, tableW, 7.2, title, purple, {
          bold: true,
          color: [255, 255, 255],
          size: 10.0,
          align: "left",
          maxLines: 1,
        });
        y += 8.0;
      };

      const drawLabelValue = (
        labelStart: number,
        labelEnd: number,
        valueStart: number,
        valueEnd: number,
        label: string,
        value: unknown,
        rowY: number,
        h: number,
        valueOptions: Parameters<typeof drawCell>[6] = {}
      ) => {
        drawCellCols(labelStart, labelEnd, rowY, h, label, purple, {
          bold: true,
          color: [255, 255, 255],
          size: 8.4,
          align: "center",
          maxLines: 2,
        });
        drawCellCols(valueStart, valueEnd, rowY, h, value, lightPurple, {
          bold: true,
          size: 8.8,
          align: "center",
          maxLines: 2,
          ...valueOptions,
        });
      };

      const topicMap = new Map<
        string,
        {
          code: string;
          title: string;
          scoreSum: number;
          maxSum: number;
          count: number;
          maxValues: Set<number>;
        }
      >();

      selectedDocument.cases.forEach((item) => {
        (item.topics || []).forEach((topic) => {
          const code = normalizeText(topic.code);
          const title = normalizeText(topic.title);
          const score = Number(topic.score || 0);
          const max = Number(topic.max || 0);
          if (!code || !title || !Number.isFinite(score) || !Number.isFinite(max) || max <= 0) return;

          const key = code || normalizeKey(title);
          const current = topicMap.get(key) || {
            code,
            title,
            scoreSum: 0,
            maxSum: 0,
            count: 0,
            maxValues: new Set<number>(),
          };
          current.title = current.title || title;
          current.scoreSum += score;
          current.maxSum += max;
          current.count += 1;
          current.maxValues.add(max);
          topicMap.set(key, current);
        });
      });

      const topicStats = Array.from(topicMap.values())
        .map((item) => {
          const avgScore = item.count ? item.scoreSum / item.count : null;
          const avgMax = item.count ? item.maxSum / item.count : 0;
          const max = item.maxValues.size === 1 ? Array.from(item.maxValues)[0] : avgMax;
          const avgPercent = avgScore !== null && avgMax > 0 ? (avgScore / avgMax) * 100 : null;
          return {
            code: item.code,
            title: item.title,
            avgScore,
            max,
            avgPercent,
          };
        })
        .sort((a, b) =>
          a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" }) ||
          a.title.localeCompare(b.title, "th")
        );
      const topicRowsWithScore = topicStats.filter((item) => item.avgPercent !== null);
      const bestTopic = topicRowsWithScore.length
        ? [...topicRowsWithScore].sort((a, b) => Number(b.avgPercent) - Number(a.avgPercent))[0]
        : null;
      const lowestTopic = topicRowsWithScore.length
        ? [...topicRowsWithScore].sort((a, b) => Number(a.avgPercent) - Number(b.avgPercent))[0]
        : null;

      const signedRoles = SIGNATURE_FLOW.filter((role) => Boolean(getSignedEntry(entries, role))).length;
      const criticalCases = 0;
      const documentStatus = isComplete ? "Completed Signature" : "Incomplete Signature";
      const pdfDocumentRef = getMonthlyDocumentRef(selectedDocument, documents);
      const incentiveText =
        Number(individualIncentive.promo || 0) > 0
          ? `${individualIncentive.label || "No Incentive"}\nCash ${formatBahtAmount(individualIncentive.cash || 0)} / Promo ${formatBahtAmount(individualIncentive.promo || 0)}`
          : `${individualIncentive.label || `${formatBahtAmount(individualIncentive.cash || 0)} THB`}`;

      drawHeader(
        "Monthly QA Dashboard",
        "Monthly dashboard for the selected Agent and selected Month. Values are generated from the current QA system."
      );

      drawSection("Current View");
      drawLabelValue(0, 1, 1, 3, "Agent", selectedDocument.agentName, y, 10.0, { maxLines: 2 });
      drawLabelValue(3, 4, 4, 6, "Month", selectedDocument.monthLabel, y, 10.0);
      drawLabelValue(6, 7, 7, 8, "Reviewed Cases", selectedDocument.caseCount, y, 10.0);
      drawLabelValue(8, 9, 9, 10, "Critical Cases", criticalCases, y, 10.0);
      y += 11.0;

      drawCellCols(0, 3, y, 7.4, "Cases Reviewed", purple, {
        bold: true,
        color: [255, 255, 255],
        size: 8.7,
        align: "center",
      });
      drawCellCols(3, 6, y, 7.4, "Need More to 10", purple, {
        bold: true,
        color: [255, 255, 255],
        size: 8.7,
        align: "center",
      });
      drawCellCols(6, 9, y, 7.4, "Average Score", purple, {
        bold: true,
        color: [255, 255, 255],
        size: 8.7,
        align: "center",
      });
      drawCellCols(9, 10, y, 7.4, "Monthly Grade", purple, {
        bold: true,
        color: [255, 255, 255],
        size: 8.7,
        align: "center",
        maxLines: 2,
      });
      y += 7.4;
      drawCellCols(0, 3, y, 10.8, `${selectedDocument.caseCount}/${CASE_TARGET}`, lightPurple, {
        bold: true,
        size: 13.0,
        align: "center",
        maxLines: 1,
      });
      drawCellCols(3, 6, y, 10.8, needMoreToTarget, lightPurple, {
        bold: true,
        size: 13.0,
        align: "center",
        maxLines: 1,
      });
      drawCellCols(6, 9, y, 10.8, selectedDocument.averageScore.toFixed(2), lightPurple, {
        bold: true,
        size: 13.0,
        align: "center",
        color: selectedDocument.averageScore >= 80 ? good : warn,
        maxLines: 1,
      });
      drawCellCols(9, 10, y, 10.8, selectedDocument.grade, lightPurple, {
        bold: true,
        size: 13.0,
        align: "center",
        maxLines: 1,
      });
      y += 13.0;

      drawSection("Incentive Summary");
      drawCellCols(0, 3, y, 7.4, "Incentive", purple, {
        bold: true,
        color: [255, 255, 255],
        size: 8.7,
        align: "center",
      });
      drawCellCols(3, 6, y, 7.4, "Best Topic", purple, {
        bold: true,
        color: [255, 255, 255],
        size: 8.7,
        align: "center",
      });
      drawCellCols(6, 10, y, 7.4, "Lowest Topic", purple, {
        bold: true,
        color: [255, 255, 255],
        size: 8.7,
        align: "center",
      });
      y += 7.4;
      drawCellCols(0, 3, y, 12.0, incentiveText, lightPurple, {
        bold: true,
        size: 8.8,
        align: "center",
        maxLines: 2,
      });
      drawCellCols(3, 6, y, 12.0, bestTopic ? `${bestTopic.title}\n${Number(bestTopic.avgPercent).toFixed(2)}%` : "-", lightPurple, {
        bold: true,
        size: 8.3,
        align: "center",
        maxLines: 2,
      });
      drawCellCols(6, 10, y, 12.0, lowestTopic ? `${lowestTopic.title}\n${Number(lowestTopic.avgPercent).toFixed(2)}%` : "-", lightPurple, {
        bold: true,
        size: 8.3,
        align: "center",
        maxLines: 2,
      });
      y += 14.0;

      drawSection("Monthly Case List");
      const caseColWidths = [10, 23, 24, 96, 16, 8, 9];
      drawCellsByWidth(
        left,
        y,
        7.4,
        ["Seq", "Case Date", "Case ID", "Inquiry", "Score", "Grade", "Critical"].map((label, index) => ({
          value: label,
          width: caseColWidths[index],
          fill: purple,
          options: {
            bold: true,
            color: [255, 255, 255],
            size: 7.8,
            align: "center",
            maxLines: 1,
          },
        }))
      );
      y += 7.4;
      for (let index = 0; index < CASE_TARGET; index += 1) {
        const item = selectedDocument.cases[index];
        const rowH = 8.4;
        const fill: [number, number, number] = index % 2 === 0 ? [255, 255, 255] : [250, 247, 253];
        drawCellsByWidth(left, y, rowH, [
          { value: index + 1, width: caseColWidths[0], fill, options: { size: 7.5, align: "center", bold: true, maxLines: 1 } },
          { value: item?.auditDate || "-", width: caseColWidths[1], fill, options: { size: 7.1, align: "center", bold: true, maxLines: 1 } },
          { value: item?.caseId || "-", width: caseColWidths[2], fill, options: { size: 7.1, align: "center", bold: true, maxLines: 1 } },
          { value: item?.inquiry || "-", width: caseColWidths[3], fill, options: { size: 7.0, align: "left", bold: true, maxLines: 2, lineHeight: 3.55 } },
          { value: item ? item.finalScore.toFixed(2) : "-", width: caseColWidths[4], fill, options: { size: 7.5, align: "center", bold: true, maxLines: 1 } },
          { value: item?.grade || "-", width: caseColWidths[5], fill, options: { size: 7.5, align: "center", bold: true, maxLines: 1 } },
          { value: "NO", width: caseColWidths[6], fill, options: { size: 7.0, align: "center", bold: true, maxLines: 1 } },
        ]);
        y += rowH;
      }

      y += 3;
      drawSection("Monthly Topic Performance");
      const drawTopicHeader = () => {
        [
          [0, 1, "Topic"],
          [1, 4, "Description"],
          [4, 6, "Avg Score"],
          [6, 7, "Max"],
          [7, 10, "Avg %"],
        ].forEach(([start, end, label]) => {
          drawCellCols(Number(start), Number(end), y, 7.4, String(label), purple, {
            bold: true,
            color: [255, 255, 255],
            size: 8.0,
            align: "center",
            maxLines: 1,
          });
        });
        y += 7.4;
      };
      const formatMetric = (value: number | null) => (value === null || !Number.isFinite(value) ? "-" : value.toFixed(2));
      const formatTopicMax = (value: number) =>
        Number.isFinite(value) ? (Number.isInteger(value) ? String(value) : value.toFixed(2)) : "-";

      drawTopicHeader();
      if (!topicStats.length) {
        drawCell(left, y, tableW, 8.8, "No topic score data for this document", [250, 247, 253], {
          size: 8.2,
          align: "center",
          bold: true,
          color: muted,
          maxLines: 1,
        });
        y += 8.8;
      } else {
        topicStats.forEach((item, index) => {
          const topicRowH = 8.0;
          if (y + topicRowH > bottom - 4) {
            pdf.addPage();
            y = 10;
            drawSection("Monthly Topic Performance (continued)");
            drawTopicHeader();
          }
          const fill: [number, number, number] = index % 2 === 0 ? [255, 255, 255] : [250, 247, 253];
          drawCellCols(0, 1, y, topicRowH, item.code, fill, { size: 7.8, align: "center", bold: true, maxLines: 1 });
          drawCellCols(1, 4, y, topicRowH, item.title, fill, { size: 7.4, align: "left", bold: true, maxLines: 1 });
          drawCellCols(4, 6, y, topicRowH, formatMetric(item.avgScore), fill, { size: 7.8, align: "center", bold: true, maxLines: 1 });
          drawCellCols(6, 7, y, topicRowH, formatTopicMax(item.max), fill, { size: 7.8, align: "center", bold: true, maxLines: 1 });
          drawCellCols(7, 10, y, topicRowH, item.avgPercent === null ? "-" : `${item.avgPercent.toFixed(2)}%`, fill, {
            size: 7.8,
            align: "center",
            bold: true,
            maxLines: 1,
          });
          y += topicRowH;
        });
      }

      y += 3;
      drawSection("Acknowledgement / Signature");
      drawCell(left, y, tableW, 5.4, "รับ�—ราบผลการประเมินประจำเ�”ือน โ�”ยลงนาม�•เธฒเธกเธ•ำแหน่ง�”้านล่าง", [255, 255, 255], {
        size: 7.2,
        align: "left",
        color: muted,
        maxLines: 1,
      });
      y += 6.2;

      const signerName = (role: SignRole) => {
        const signed = getSignedEntry(entries, role);
        return getRoleSigner(selectedDocument, role) || signed?.signerName || signed?.signedBy || "-";
      };
      const signerDate = (role: SignRole) => {
        const signed = getSignedEntry(entries, role);
        return signed ? formatDateTime(signed.signedAt) : "";
      };
      const signatureData = (role: SignRole) => getSignedEntry(entries, role)?.signatureDataUrl || "";
      const normalizedSignatures = new Map<SignRole, string>();
      for (const role of SIGNATURE_FLOW) {
        const signature = signatureData(role);
        normalizedSignatures.set(role, signature ? await normalizeSignatureDataUrl(signature) : "");
      }
      const signatureBlockHeight = 74;
      if (y + signatureBlockHeight > bottom - 5) {
        pdf.addPage();
        y = 12;
      }

      const drawDottedLine = (x1: number, lineY: number, x2: number) => {
        pdf.setDrawColor(108, 96, 128);
        pdf.setLineWidth(0.12);
        const dashedPdf = pdf as jsPDF & {
          setLineDashPattern?: (dashArray: number[], dashPhase: number) => jsPDF;
        };
        dashedPdf.setLineDashPattern?.([0.55, 0.65], 0);
        pdf.line(x1, lineY, x2, lineY);
        dashedPdf.setLineDashPattern?.([], 0);
      };

      const drawSignedLine = (label: string, centerX: number, lineY: number, value = "") => {
        const labelX = centerX - 20;
        const lineStart = centerX - 18;
        const lineEnd = centerX + 25;
        setTemplateFont(6.0, false, muted);
        pdf.text(label, labelX, lineY - 0.25, { align: "right" });
        drawDottedLine(lineStart, lineY, lineEnd);
        if (value) {
          setTemplateFont(5.9, true, black);
          pdf.text(value, (lineStart + lineEnd) / 2, lineY - 0.35, { align: "center" });
        }
      };

      const drawSignaturePanel = (
        x: number,
        panelY: number,
        w: number,
        role: SignRole,
        roleTitle: string
      ) => {
        drawCell(x, panelY, w, 5.2, roleTitle, purple, {
          bold: true,
          color: [255, 255, 255],
          size: 7.0,
          align: "center",
          maxLines: 1,
        });
        const signatureAreaY = panelY + 5.2;
        const signatureAreaH = 14.2;
        const signLineY = signatureAreaY + 9.9;
        const centerX = x + w / 2;
        drawCell(x, signatureAreaY, w, signatureAreaH, "", palePurple, { size: 6, align: "center" });
        drawSignedLine("ลงชื่อ", centerX, signLineY);
        const signature = normalizedSignatures.get(role) || "";
        if (signature) {
          try {
            const imageProps = pdf.getImageProperties(signature);
            const ratio = imageProps.width && imageProps.height ? imageProps.width / imageProps.height : 4;
            const maxImageW = Math.min(w - 38, 46);
            const maxImageH = 9.6;
            let imageW = maxImageW;
            let imageH = imageW / ratio;
            if (imageH > maxImageH) {
              imageH = maxImageH;
              imageW = imageH * ratio;
            }
            pdf.addImage(signature, "PNG", centerX - imageW / 2, signLineY - imageH + 0.9, imageW, imageH);
          } catch {
            setTemplateFont(6.0, false, muted);
            pdf.text("Signature image unavailable", centerX, signLineY - 1.5, { align: "center" });
          }
        }
        drawCell(x, panelY + 19.4, w, 4.2, signerName(role), [255, 255, 255], {
          bold: true,
          size: 6.4,
          align: "center",
          maxLines: 1,
        });
        drawCell(x, panelY + 23.6, w, 3.8, roleTitle, [255, 255, 255], {
          size: 5.8,
          align: "center",
          maxLines: 1,
        });
        drawCell(x, panelY + 27.4, w, 4.6, "", [255, 255, 255], { size: 5.8, align: "center" });
        drawSignedLine("วัน�—ี่", centerX, panelY + 30.3, signerDate(role));
      };

      const halfW = tableW / 2 - 3;
      drawSignaturePanel(left, y, halfW, "Agent", "Agent ผู้�–ูกประเมิน");
      drawSignaturePanel(left + halfW + 6, y, halfW, "Senior", "Senior หัวหน้า�—ีมผู้�–ูกประเมิน");
      y += 35.5;
      drawSignaturePanel(left, y, halfW, "Supervisor", "Supervisor หัวหน้าแผนก");
      drawSignaturePanel(left + halfW + 6, y, halfW, "QA", "QA ผู้�•รวจสอบ");

      setTemplateFont(7.0, false, muted);
      pdf.text(
        `Document Ref. ${pdfDocumentRef} | Generated: ${formatDateTime(new Date().toISOString())} | ${documentStatus} | Signed: ${signedRoles}/${SIGNATURE_FLOW.length}`,
        left + tableW,
        pageH - 5.4,
        { align: "right" }
      );

      const safeAgentFileName =
        selectedDocument.agentName.replace(/[^a-zA-Z0-9ก-๙]+/g, "_").replace(/^_+|_+$/g, "") || "Agent";
      const fileName = `QA Score Monthly ${selectedDocument.monthLabel}_${safeAgentFileName}_${pdfDocumentRef}.pdf`;
      downloadBlob(pdf.output("blob"), fileName);
      setPdfMessage(`Generated ${fileName}`);
      window.setTimeout(() => setPdfMessage(""), 3500);
      return;
    }

    {
    const officialPageW = 210;
    const officialPageH = 297;
    const officialLeft = 12;
    const officialRight = 198;
    const officialTableW = officialRight - officialLeft;
    const officialBottom = 282;
    const officialPurple: [number, number, number] = [95, 39, 159];
    const officialPurpleDark: [number, number, number] = [88, 28, 135];
    const officialLightPurple: [number, number, number] = [206, 193, 216];
    const officialSoftPurple: [number, number, number] = [245, 240, 250];
    const officialBorder: [number, number, number] = [190, 184, 198];
    const officialBlack: [number, number, number] = [18, 24, 38];
    const officialMuted: [number, number, number] = [83, 96, 124];
    let officialY = 12;

    const setOfficialFont = (
      size: number,
      bold = false,
      color: [number, number, number] = officialBlack
    ) => {
      try {
        pdf.setFont("THSarabunNew", bold ? "bold" : "normal");
      } catch {}
      pdf.setFontSize(size);
      pdf.setTextColor(color[0], color[1], color[2]);
    };

    const drawOfficialText = (
      value: string,
      x: number,
      yy: number,
      size = 9,
      bold = false,
      color: [number, number, number] = officialBlack,
      options?: { align?: "left" | "center" | "right" }
    ) => {
      setOfficialFont(size, bold, color);
      pdf.text(String(value ?? ""), x, yy, options);
    };

    const splitOfficialText = (value: unknown, width: number, size = 8) => {
      setOfficialFont(size);
      return pdf.splitTextToSize(String(value || "-"), Math.max(4, width));
    };

    const drawOfficialCell = (
      x: number,
      yy: number,
      w: number,
      h: number,
      value: unknown,
      fill: [number, number, number],
      options: {
        bold?: boolean;
        color?: [number, number, number];
        size?: number;
        align?: "left" | "center" | "right";
        valign?: "top" | "middle";
        maxLines?: number;
      } = {}
    ) => {
      const size = options.size ?? 7.5;
      const align = options.align ?? "left";
      const color = options.color ?? officialBlack;
      const maxLines = options.maxLines ?? 2;
      pdf.setDrawColor(officialBorder[0], officialBorder[1], officialBorder[2]);
      pdf.setFillColor(fill[0], fill[1], fill[2]);
      pdf.rect(x, yy, w, h, "FD");
      setOfficialFont(size, options.bold ?? false, color);
      const lines = splitOfficialText(value, w - 4, size).slice(0, maxLines);
      const lineGap = size * 0.34 + 1.15;
      const textY =
        options.valign === "top"
          ? yy + 4
          : yy + h / 2 - ((lines.length - 1) * lineGap) / 2 + size * 0.22;
      const textX = align === "center" ? x + w / 2 : align === "right" ? x + w - 2 : x + 2;
      lines.forEach((lineText: string, index: number) => {
        pdf.text(lineText, textX, textY + index * lineGap, { align });
      });
    };

    const drawOfficialSection = (title: string, subtitle?: string) => {
      if (officialY + 12 > officialBottom) {
        pdf.addPage();
        officialY = 12;
      }
      pdf.setFillColor(officialPurple[0], officialPurple[1], officialPurple[2]);
      pdf.rect(officialLeft, officialY, officialTableW, 7, "F");
      drawOfficialText(title, officialLeft + 3, officialY + 5, 9, true, [255, 255, 255]);
      officialY += 7;
      if (subtitle) {
        pdf.setFillColor(officialSoftPurple[0], officialSoftPurple[1], officialSoftPurple[2]);
        pdf.rect(officialLeft, officialY, officialTableW, 7, "F");
        drawOfficialText(subtitle, officialLeft + 3, officialY + 5, 7.2, false, officialMuted);
        officialY += 9;
      } else {
        officialY += 3;
      }
    };

    const ensureOfficialSpace = (height: number) => {
      if (officialY + height > officialBottom) {
        pdf.addPage();
        officialY = 12;
      }
    };

    const drawOfficialInfoRow = (cells: Array<{ label: string; value: unknown; w?: number; maxLines?: number }>, height = 13) => {
      ensureOfficialSpace(height);
      let x = officialLeft;
      const labelW = 24;
      const valueWidths = cells.map((cell) => cell.w ?? (officialTableW - labelW * cells.length) / cells.length);
      cells.forEach((cell, index) => {
        drawOfficialCell(x, officialY, labelW, height, cell.label, officialPurpleDark, {
          color: [255, 255, 255],
          bold: true,
          size: 7.2,
          align: "center",
          maxLines: 2,
        });
        x += labelW;
        drawOfficialCell(x, officialY, valueWidths[index], height, cell.value, officialLightPurple, {
          bold: true,
          size: 7.5,
          align: "center",
          maxLines: cell.maxLines ?? 2,
        });
        x += valueWidths[index];
      });
      officialY += height;
    };

    const roleLabelForPdf = (role: SignRole) => {
      if (role === "QA") return "QA Reviewer";
      if (role === "Supervisor") return "Supervisor";
      if (role === "Senior") return "Senior / Team Lead";
      return "Agent";
    };

    const signedRoles = SIGNATURE_FLOW.filter((role) => Boolean(getSignedEntry(entries, role))).length;
    const safePdfName = (role: SignRole) => {
      const signed = getSignedEntry(entries, role);
      return signed ? getRoleSigner(selectedDocument, role) || signed.signerName || signed.signedBy || "-" : "-";
    };
    const safePdfDate = (role: SignRole) => {
      const signed = getSignedEntry(entries, role);
      return signed ? formatDateTime(signed.signedAt) : "-";
    };
    const safePdfSignature = (role: SignRole) => getSignedEntry(entries, role)?.signatureDataUrl || "";

    pdf.setFillColor(officialPurple[0], officialPurple[1], officialPurple[2]);
    pdf.rect(0, 0, officialPageW, 22, "F");
    drawOfficialText("QA Score Monthly Report", officialLeft, 9, 16, true, [255, 255, 255]);
    drawOfficialText("Monthly QA acknowledgement and incentive document", officialLeft, 16, 9, false, [255, 255, 255]);
    drawOfficialText(`Generated: ${formatDateTime(new Date().toISOString())}`, officialRight, 16, 7.5, false, [255, 255, 255], { align: "right" });

    officialY = 31;
    drawOfficialSection("Current View", "Summary for selected Agent and Month");
    drawOfficialInfoRow([
      { label: "Agent", value: selectedDocument.agentName, w: 52, maxLines: 2 },
      { label: "Month", value: selectedDocument.monthLabel, w: 28 },
      { label: "Document Ref.", value: selectedDocument.documentHash || selectedDocument.id, w: 58, maxLines: 2 },
    ], 15);
    drawOfficialInfoRow([
      { label: "Reviewed Cases", value: selectedDocument.caseCount, w: 28 },
      { label: "Average Score", value: selectedDocument.averageScore.toFixed(2), w: 31 },
      { label: "Grade", value: selectedDocument.grade, w: 20 },
      { label: "Signed", value: `${signedRoles}/${SIGNATURE_FLOW.length}`, w: 11 },
    ], 12);
    drawOfficialInfoRow([
      { label: "Team", value: selectedDocument.teamName || "-", w: 48, maxLines: 2 },
      { label: "Supervisor", value: selectedDocument.supervisorName || "-", w: 34, maxLines: 2 },
      { label: "Team Lead", value: selectedDocument.seniorName || "-", w: 32, maxLines: 2 },
    ], 14);
    drawOfficialInfoRow([
      { label: "Status", value: isComplete ? "Completed Signature" : "Incomplete Signature", w: 52, maxLines: 2 },
      { label: "Need More", value: needMoreToTarget, w: 28 },
      { label: "Payment", value: readyForIncentive ? "Ready to Pay" : "Hold / Not Ready", w: 34, maxLines: 2 },
    ], 13);

    officialY += 5;
    drawOfficialSection("Incentive Summary");
    drawOfficialInfoRow([
      { label: "Incentive", value: individualIncentive.label || "No Incentive", w: 66, maxLines: 2 },
      { label: "Cash (THB)", value: formatBahtAmount(individualIncentive.cash || 0), w: 26 },
      { label: "RBH Promo", value: formatBahtAmount(individualIncentive.promo || 0), w: 22 },
    ], 13);
    drawOfficialInfoRow([
      { label: "Remark", value: individualIncentive.remark || "-", w: 66, maxLines: 2 },
      { label: "Condition", value: readyForIncentive ? "Signature completed" : "Waiting signature completion", w: 48, maxLines: 2 },
    ], 13);

    officialY += 5;
    drawOfficialSection("Monthly Case List", "Cases included in this monthly acknowledgement");
    const caseColWidths = [11, 25, 29, 74, 25, 22];
    const caseHeaders = ["Seq", "Audit Date", "Case ID", "Customer Inquiry", "Final Score", "Grade"];
    let caseX = officialLeft;
    caseHeaders.forEach((header, index) => {
      drawOfficialCell(caseX, officialY, caseColWidths[index], 8, header, officialPurpleDark, {
        color: [255, 255, 255],
        bold: true,
        size: 7,
        align: "center",
        maxLines: 1,
      });
      caseX += caseColWidths[index];
    });
    officialY += 8;

    selectedDocument.cases.slice(0, 10).forEach((item, index) => {
      const rowH = 9;
      ensureOfficialSpace(rowH + 3);
      const fill: [number, number, number] = index % 2 === 0 ? [255, 255, 255] : [250, 247, 253];
      caseX = officialLeft;
      const rowValues = [
        String(index + 1),
        item.auditDate || "-",
        item.caseId || "-",
        item.inquiry || "-",
        item.finalScore.toFixed(2),
        item.grade || "-",
      ];
      rowValues.forEach((cell, cellIndex) => {
        drawOfficialCell(caseX, officialY, caseColWidths[cellIndex], rowH, cell, fill, {
          bold: cellIndex === 0 || cellIndex === 2 || cellIndex === 4 || cellIndex === 5,
          size: cellIndex === 3 ? 6.7 : 7,
          align: cellIndex === 3 ? "left" : "center",
          maxLines: cellIndex === 3 ? 2 : 1,
        });
        caseX += caseColWidths[cellIndex];
      });
      officialY += rowH;
    });

    pdf.addPage();
    officialY = 12;
    drawOfficialSection("Acknowledgement / Signature", "Only signed roles are shown with signature image and signed date");
    drawOfficialText(
      "This document confirms acknowledgement of the monthly QA score, case list, incentive condition, and signature status.",
      officialLeft,
      officialY + 1,
      8.5,
      false,
      officialMuted
    );
    officialY += 10;

    const drawSignatureBox = (x: number, yy: number, w: number, h: number, role: SignRole) => {
      const signed = getSignedEntry(entries, role);
      pdf.setDrawColor(officialBorder[0], officialBorder[1], officialBorder[2]);
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(x, yy, w, h, 2, 2, "FD");
      pdf.setFillColor(officialPurpleDark[0], officialPurpleDark[1], officialPurpleDark[2]);
      pdf.rect(x, yy, w, 8, "F");
      drawOfficialText(roleLabelForPdf(role), x + 3, yy + 5.7, 8.2, true, [255, 255, 255]);
      const signatureImage = safePdfSignature(role);
      if (signatureImage) {
        try {
          pdf.addImage(signatureImage, "PNG", x + 7, yy + 13, w - 14, 17);
        } catch {
          drawOfficialText("Signature image unavailable", x + w / 2, yy + 23, 8, false, officialMuted, { align: "center" });
        }
      } else {
        pdf.setDrawColor(150, 145, 160);
        pdf.line(x + 8, yy + 27, x + w - 8, yy + 27);
        drawOfficialText("Unsigned", x + w / 2, yy + 24, 8, false, officialMuted, { align: "center" });
      }
      drawOfficialText(safePdfName(role), x + 4, yy + 36, 9, true);
      drawOfficialText(`Date: ${safePdfDate(role)}`, x + 4, yy + 43, 7.8, false, officialMuted);
      drawOfficialText(`Status: ${signed ? "Signed" : "Pending"}`, x + 4, yy + 50, 8, true, signed ? [5, 150, 105] : [180, 83, 9]);
    };

    const sigBoxW = 86;
    const sigBoxH = 56;
    drawSignatureBox(officialLeft, officialY, sigBoxW, sigBoxH, "QA");
    drawSignatureBox(officialLeft + 100, officialY, sigBoxW, sigBoxH, "Supervisor");
    officialY += sigBoxH + 9;
    drawSignatureBox(officialLeft, officialY, sigBoxW, sigBoxH, "Senior");
    drawSignatureBox(officialLeft + 100, officialY, sigBoxW, sigBoxH, "Agent");
    officialY += sigBoxH + 10;

    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(officialLeft, officialY, officialTableW, 14, 2, 2, "F");
    drawOfficialText(
      `Document Ref: ${selectedDocument.documentHash || selectedDocument.id} | Cases: ${selectedDocument.caseCount} | Average: ${selectedDocument.averageScore.toFixed(2)} | Grade: ${selectedDocument.grade}`,
      officialLeft + 4,
      officialY + 8.5,
      8.2,
      false,
      officialMuted
    );

    pdf.setPage(1);
    drawOfficialText("Page 1/2", officialRight, officialPageH - 7, 7.5, false, officialMuted, { align: "right" });
    pdf.setPage(2);
    drawOfficialText("Page 2/2", officialRight, officialPageH - 7, 7.5, false, officialMuted, { align: "right" });

    const safeAgentFileName =
      selectedDocument.agentName.replace(/[^a-zA-Z0-9ก-๙]+/g, "_").replace(/^_+|_+$/g, "") || "Agent";
    const fileName = `QA Score Monthly ${selectedDocument.monthLabel}_${safeAgentFileName}.pdf`;
    downloadBlob(pdf.output("blob"), fileName);
    setPdfMessage(`Generated ${fileName}`);
    window.setTimeout(() => setPdfMessage(""), 3500);
    return;
    }

    if (false) {
    const docW = 210;
    const docH = 297;
    const qaDoc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    try {
      registerTHSarabunNew(qaDoc);
      qaDoc.setFont("THSarabunNew", "normal");
    } catch {}

    const pageW = 210;
    const pageH = 210;
    const sidebarW = 36;
    const leftX = sidebarW + 8;
    const rightX = 288;
    const accent: [number, number, number] = [109, 40, 217];
    const dark: [number, number, number] = [20, 8, 49];
    const muted: [number, number, number] = [100, 116, 139];

    const setPdfText = (
      size: number,
      bold = false,
      color: [number, number, number] = [31, 41, 55]
    ) => {
      try {
        qaDoc.setFont("THSarabunNew", bold ? "bold" : "normal");
      } catch {}
      qaDoc.setFontSize(size);
      qaDoc.setTextColor(color[0], color[1], color[2]);
    };

    const drawPdfText = (
      value: string,
      x: number,
      yy: number,
      size = 10,
      bold = false,
      color: [number, number, number] = [31, 41, 55],
      options?: { align?: "left" | "center" | "right" }
    ) => {
      setPdfText(size, bold, color);
      qaDoc.text(String(value ?? ""), x, yy, options);
    };

    const drawWrappedText = (
      value: string,
      x: number,
      yy: number,
      width: number,
      size = 8,
      bold = false,
      color: [number, number, number] = [31, 41, 55],
      maxLines = 2
    ) => {
      setPdfText(size, bold, color);
      const lines = qaDoc.splitTextToSize(String(value ?? ""), width).slice(0, maxLines);
      lines.forEach((lineText: string, index: number) => qaDoc.text(lineText, x, yy + index * 3.4));
    };

    const drawBox = (
      x: number,
      yy: number,
      w: number,
      h: number,
      fill: [number, number, number] = [255, 255, 255],
      stroke: [number, number, number] = [226, 232, 240]
    ) => {
      qaDoc.setDrawColor(stroke[0], stroke[1], stroke[2]);
      qaDoc.setFillColor(fill[0], fill[1], fill[2]);
      qaDoc.roundedRect(x, yy, w, h, 3, 3, "FD");
    };

    const drawStatusBadge = (label: string, x: number, yy: number) => {
      const isReady = /complete|ready|signed/i.test(label);
      const bg: [number, number, number] = isReady ? [220, 252, 231] : [254, 243, 199];
      const fg: [number, number, number] = isReady ? [22, 101, 52] : [180, 83, 9];
      qaDoc.setFillColor(bg[0], bg[1], bg[2]);
      qaDoc.roundedRect(x, yy - 5, 26, 8, 3, 3, "F");
      drawPdfText(label, x + 13, yy + 0.2, 7.5, true, fg, { align: "center" });
    };

    const drawTopChrome = (pageNo: number) => {
      qaDoc.setFillColor(dark[0], dark[1], dark[2]);
      qaDoc.rect(0, 0, sidebarW, pageH, "F");
      qaDoc.setFillColor(accent[0], accent[1], accent[2]);
      qaDoc.roundedRect(6, 10, 24, 11, 2, 2, "F");
      drawPdfText("Robinhood QA", 8, 17.2, 9, true, [255, 255, 255]);
      ["Dashboard", "Signature", "Documents", "Reports"].forEach((item, index) => {
        const navY = 40 + index * 14;
        if (item === "Signature") {
          qaDoc.setFillColor(accent[0], accent[1], accent[2]);
          qaDoc.roundedRect(5, navY - 6, 26, 9, 2, 2, "F");
        }
        drawPdfText(item, 8, navY, 7.8, item === "Signature", [255, 255, 255]);
      });
      drawPdfText("Signature Workspace", leftX, 15, 20, true, [15, 23, 42]);
      drawPdfText("Monthly QA score acknowledgement", leftX, 22, 10, false, muted);
      drawPdfText(`Page ${pageNo}`, rightX, pageH - 6, 8, false, [148, 163, 184], { align: "right" });
    };

    const drawSummaryCard = (
      x: number,
      yy: number,
      w: number,
      label: string,
      value: string,
      tone: [number, number, number]
    ) => {
      drawBox(x, yy, w, 23);
      drawPdfText(label, x + 4, yy + 6, 8.2, true, muted);
      drawPdfText(value, x + 4, yy + 16, 16, true, tone);
    };

    const signedRoles = SIGNATURE_FLOW.filter((role) => Boolean(getSignedEntry(entries, role))).length;
    const documentStatus = isComplete ? "Signed" : "Pending";

    drawTopChrome(1);
    drawBox(leftX, 32, 158, 24);
    drawPdfText("Document Ref.", leftX + 5, 40, 8, true, muted);
    drawPdfText(selectedDocument.documentHash || selectedDocument.id, leftX + 5, 50, 12, true, accent);
    drawPdfText("Agent", leftX + 55, 40, 8, true, muted);
    drawWrappedText(selectedDocument.agentName, leftX + 55, 49, 45, 9, true);
    drawPdfText("Month", leftX + 108, 40, 8, true, muted);
    drawPdfText(selectedDocument.monthLabel, leftX + 108, 50, 10, true);

    drawSummaryCard(leftX, 64, 42, "Cases", String(selectedDocument.caseCount), accent);
    drawSummaryCard(leftX + 48, 64, 42, "Average", selectedDocument.averageScore.toFixed(2), [22, 163, 74]);
    drawSummaryCard(leftX + 96, 64, 42, "Grade", selectedDocument.grade, [37, 99, 235]);
    drawSummaryCard(leftX + 144, 64, 48, "Cash THB", formatBahtAmount(individualIncentive.cash || 0), [217, 119, 6]);
    drawSummaryCard(leftX + 198, 64, 42, "Signed", `${signedRoles}/4`, isComplete ? [22, 163, 74] : [217, 119, 6]);

    const tableX = leftX;
    const tableY = 98;
    const tableWidths = [12, 28, 33, 72, 22, 18];
    const tableHeaders = ["No.", "Date", "Case ID", "Customer Inquiry", "Score", "Grade"];
    qaDoc.setFillColor(accent[0], accent[1], accent[2]);
    qaDoc.roundedRect(tableX, tableY, tableWidths.reduce((sum, width) => sum + width, 0), 9, 2, 2, "F");
    let cellX = tableX;
    tableHeaders.forEach((header, index) => {
      drawPdfText(header, cellX + 2, tableY + 6, 8, true, [255, 255, 255]);
      cellX += tableWidths[index];
    });
    let rowY = tableY + 9;
    selectedDocument.cases.slice(0, 10).forEach((item, index) => {
      qaDoc.setDrawColor(226, 232, 240);
      qaDoc.setFillColor(index % 2 === 0 ? 250 : 255, index % 2 === 0 ? 245 : 255, index % 2 === 0 ? 255 : 255);
      qaDoc.rect(tableX, rowY, tableWidths.reduce((sum, width) => sum + width, 0), 11, "FD");
      cellX = tableX;
      [
        String(index + 1),
        item.auditDate || "-",
        item.caseId || "-",
        item.inquiry || "-",
        item.finalScore.toFixed(2),
        item.grade || "-",
      ].forEach((cell, cellIndex) => {
        drawWrappedText(cell, cellX + 2, rowY + 5.4, tableWidths[cellIndex] - 4, cellIndex === 3 ? 7.4 : 7.8, cellIndex === 0 || cellIndex === 2, [31, 41, 55], 2);
        cellX += tableWidths[cellIndex];
      });
      rowY += 11;
    });

    const panelX = 238;
    drawBox(panelX, 32, 51, 150);
    drawPdfText("Case Detail", panelX + 5, 42, 12, true);
    drawStatusBadge(documentStatus, panelX + 21, 42);
    const panelRows: Array<[string, string]> = [
      ["Agent", selectedDocument.agentName],
      ["Team", selectedDocument.teamLeadName || selectedDocument.supervisorName || "-"],
      ["Reviewed", `${selectedDocument.caseCount}/${CASE_TARGET}`],
      ["Need More", String(needMoreToTarget)],
      ["Incentive", individualIncentive.label || "-"],
      ["Status", readyForIncentive ? "Ready to Pay" : "Hold"],
    ];
    let panelY = 56;
    panelRows.forEach(([label, value]) => {
      drawPdfText(label, panelX + 5, panelY, 7.5, true, muted);
      drawWrappedText(value, panelX + 22, panelY, 23, 7.8, true, [31, 41, 55], 2);
      panelY += 11;
    });
    drawPdfText("Signature Timeline", panelX + 5, panelY + 4, 9.5, true);
    panelY += 13;
    SIGNATURE_FLOW.forEach((role, index) => {
      const signed = getSignedEntry(entries, role);
      qaDoc.setFillColor(signed ? 220 : 241, signed ? 252 : 245, signed ? 231 : 249);
      qaDoc.circle(panelX + 7, panelY - 1, 2.5, "F");
      drawPdfText(String(index + 1), panelX + 7, panelY, 6.2, true, signed ? [22, 101, 52] : accent, { align: "center" });
      drawPdfText(roleThaiLabel(role), panelX + 12, panelY, 7.4, true);
      drawPdfText(signed ? "Signed" : "Pending", panelX + 12, panelY + 4.2, 6.8, false, signed ? [22, 101, 52] : [180, 83, 9]);
      panelY += 10;
    });

    const qaFileName = `QA Score Monthly ${selectedDocument.monthLabel}_2026_${selectedDocument.agentName.replace(/[^a-zA-Z0-9ก-๙]+/g, "_")}.pdf`;
    downloadBlob(qaDoc.output("blob"), qaFileName);
    setPdfMessage(`Generated ${qaFileName}`);
    window.setTimeout(() => setPdfMessage(""), 3500);
    return;
    }

    const pageWidth = 210;
    const left = 10;
    const right = 198;
    let y = 12;

    const setFont = (size: number, bold = false, color: [number, number, number] = [31, 41, 55]) => {
      try {
        pdf.setFont("THSarabunNew", bold ? "bold" : "normal");
      } catch {}
      pdf.setFontSize(size);
      pdf.setTextColor(color[0], color[1], color[2]);
    };

    const text = (value: string, x: number, yy: number, size = 12, bold = false, color: [number, number, number] = [31, 41, 55]) => {
      setFont(size, bold, color);
      pdf.text(value, x, yy);
    };

    const line = (value: string, size = 12, bold = false) => {
      text(value, left, y, size, bold);
      y += size * 0.42 + 2.5;
    };

    const drawSectionTitle = (title: string) => {
      pdf.setFillColor(109, 40, 217);
      pdf.roundedRect(left, y, right - left, 8, 2, 2, "F");
      text(title, left + 4, y + 5.7, 12, true, [255, 255, 255]);
      y += 12;
    };

    const safePdfName = (role: SignRole) => {
      const signed = getSignedEntry(entries, role);
      return signed ? getRoleSigner(selectedDocument, role) || signed.signerName || signed.signedBy || "-" : "-";
    };

    const safePdfDate = (role: SignRole) => {
      const signed = getSignedEntry(entries, role);
      return signed ? formatDateTime(signed.signedAt) : "-";
    };

    const safePdfStatus = (role: SignRole) => {
      const signed = getSignedEntry(entries, role);
      return signed ? "Signed" : statusForRole(entries, role, selectedDocument.monthKey);
    };

    const safePdfSignature = (role: SignRole) => {
      const signed = getSignedEntry(entries, role);
      return signed?.signatureDataUrl || "";
    };

    pdf.setFillColor(95, 39, 159);
    pdf.rect(0, 0, pageWidth, 24, "F");
    text("QA Score Monthly Report", left, 10, 17, true, [255, 255, 255]);
    text("Official monthly QA acknowledgement form", left, 17, 11, false, [255, 255, 255]);

    y = 33;
    drawSectionTitle("Current View");

    const infoRows = [
      ["Agent", selectedDocument.agentName, "Month", selectedDocument.monthLabel],
      ["Reviewed Cases", `${selectedDocument.caseCount}`, "Critical Cases", "-"],
      ["Cases Reviewed", `${selectedDocument.caseCount}/${CASE_TARGET}`, "Need More to 10", `${needMoreToTarget}`],
      ["Average Score", selectedDocument.averageScore.toFixed(2), "Monthly Grade", selectedDocument.grade],
      ["Document Status", isComplete ? "Completed" : "Incomplete Signature", "Document Ref.", selectedDocument.documentHash],
    ];

    infoRows.forEach((row) => {
      const yy = y;
      pdf.setFillColor(248, 250, 252);
      pdf.rect(left, yy - 5, right - left, 8, "F");
      text(row[0], left + 3, yy, 10, true, [100, 116, 139]);
      text(row[1], left + 34, yy, 11, true, [31, 41, 55]);
      text(row[2], left + 98, yy, 10, true, [100, 116, 139]);
      text(row[3], left + 132, yy, 11, true, [31, 41, 55]);
      y += 9;
    });

    y += 2;
    drawSectionTitle("Incentive Summary");
    const incentiveRows = [
      ["Estimated Incentive", individualIncentive.label || "No Incentive", "Payment Status", readyForIncentive ? "Ready to Pay" : "Hold / Not Ready"],
      ["Cash (THB)", formatBahtAmount(individualIncentive.cash || 0), "RBH Promo (THB)", formatBahtAmount(individualIncentive.promo || 0)],
      ["Remark", individualIncentive.remark || "-", "Condition", readyForIncentive ? "Signature completed" : "Waiting signature completion"],
    ];
    incentiveRows.forEach((row) => {
      const yy = y;
      pdf.setFillColor(248, 250, 252);
      pdf.rect(left, yy - 5, right - left, 8, "F");
      text(row[0], left + 3, yy, 10, true, [100, 116, 139]);
      text(row[1], left + 34, yy, 11, true, [31, 41, 55]);
      text(row[2], left + 98, yy, 10, true, [100, 116, 139]);
      text(row[3], left + 132, yy, 11, true, [31, 41, 55]);
      y += 9;
    });

    if (isHistoricalPaidPeriod(selectedDocument.monthKey)) {
      line("หมายเห�•เธธ: เ�”ือน Jan-Apr เป็นรอบประวั�•ิของเอกสาร ระบบแส�”งส�–านะ Completed เธญเธฑเธ•โนมั�•เธด", 10);
    }
    if (hasPendingAppeal) {
      line(`หมายเห�•เธธ: เธกเธต ${selectedPendingAppeals.length} เคส�—ี่ยื่น Appeal และรอ Approved จึงยังไม่สามาร�–ยืนยันรับ�—ราบหรือเซ็นไ�”้`, 10);
    }

    y += 3;
    drawSectionTitle("Monthly Case List");

    const headerY = y;
    pdf.setFillColor(237, 233, 254);
    pdf.rect(left, headerY - 5, right - left, 8, "F");
    text("Seq", left + 2, headerY, 10, true, [88, 28, 135]);
    text("Case Date", left + 15, headerY, 10, true, [88, 28, 135]);
    text("Case ID", left + 43, headerY, 10, true, [88, 28, 135]);
    text("Inquiry", left + 72, headerY, 10, true, [88, 28, 135]);
    text("Final Score", left + 142, headerY, 10, true, [88, 28, 135]);
    text("Grade", left + 172, headerY, 10, true, [88, 28, 135]);
    y += 8;

    const caseRows = selectedDocument.cases.slice(0, 10);
    for (let i = 0; i < 10; i += 1) {
      const item = caseRows[i];
      const rowY = y;
      pdf.setDrawColor(226, 232, 240);
      pdf.setFillColor(i % 2 === 0 ? 255 : 248, i % 2 === 0 ? 255 : 250, i % 2 === 0 ? 255 : 252);
      pdf.rect(left, rowY - 5, right - left, 10, "FD");

      text(String(i + 1), left + 3, rowY, 9, true);
      text(item?.auditDate || "-", left + 15, rowY, 9);
      text(item?.caseId || "-", left + 43, rowY, 9, true);
      const inquiryLines = pdf.splitTextToSize(item?.inquiry || "-", 66);
      text(Array.isArray(inquiryLines) ? inquiryLines[0] : String(inquiryLines), left + 72, rowY, 9);
      text(item ? item.finalScore.toFixed(2) : "-", left + 144, rowY, 9, true);
      text(item?.grade || "-", left + 174, rowY, 9, true);
      y += 10;
    }

    pdf.addPage();
    y = 18;
    drawSectionTitle("Acknowledgement / Signature");
    line("รับ�—ราบผลการประเมินประจำเ�”ือน โ�”ยลงนาม�•เธฒเธกเธ•ำแหน่ง�”้านล่าง", 11);

    const drawSignatureBox = (x: number, yy: number, w: number, h: number, role: SignRole, label: string) => {
      pdf.setDrawColor(203, 213, 225);
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(x, yy, w, h, 3, 3, "FD");

      text(label, x + 4, yy + 7, 11, true, [88, 28, 135]);
      const signatureImage = safePdfSignature(role);
      if (signatureImage) {
        try {
          pdf.addImage(signatureImage, "PNG", x + 4, yy + 10, 50, 15);
        } catch {
          text("ลงชื่อ ........................................................", x + 4, yy + 17, 11);
        }
      } else {
        text("ลงชื่อ ........................................................", x + 4, yy + 17, 11);
      }
      text(safePdfName(role), x + 4, yy + 29, 12, true, [31, 41, 55]);
      text(label, x + 4, yy + 37, 10, false, [100, 116, 139]);
      text(`วัน�—ี่ ${safePdfDate(role)}`, x + 4, yy + 45, 10);
      text(`Status: ${safePdfStatus(role)}`, x + 4, yy + 51, 10, true, safePdfStatus(role) === "Signed" ? [5, 150, 105] : [180, 83, 9]);
    };

    const boxW = 86;
    const boxH = 54;
    drawSignatureBox(left, y, boxW, boxH, "Agent", "Agent ผู้�–ูกประเมิน");
    drawSignatureBox(left + 98, y, boxW, boxH, "Senior", "Senior หัวหน้า�—ีมผู้�–ูกประเมิน");
    y += boxH + 8;
    drawSignatureBox(left, y, boxW, boxH, "Supervisor", "Supervisor หัวหน้าแผนก");
    drawSignatureBox(left + 98, y, boxW, boxH, "QA", "QA ผู้�•รวจสอบ");

    y += boxH + 8;
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(left, y, right - left, 13, 3, 3, "F");
    text("PDF จะแส�”งชื่อเฉพาะผู้�—ี่ Signed แล้วเ�—่านั้น หากยังไม่ Signed จะแส�”งเป็น -", left + 4, y + 8, 10, false, [71, 85, 105]);

    const fileName = `QA Score Monthly ${selectedDocument.monthLabel}_${selectedDocument.agentName.replace(/[^a-zA-Z0-9ก-๙]+/g, "_")}.pdf`;
    downloadBlob(pdf.output("blob"), fileName);
    setPdfMessage(`Generated ${fileName}`);
    window.setTimeout(() => setPdfMessage(""), 3500);
  };

  const generatePaymentExcel = () => {
    if (selectedMonth === "all") {
      window.alert("กรุ�“าเลือกเ�”ือนก่อน Generate Excel");
      return;
    }
    if (!selectedMonthPaymentExportDocs.length) {
      window.alert("ยังไม่มี Agent เธ—ี่เข้าเงื่อนไข Export ในเ�”ือนนี้");
      return;
    }
    try {
      generatePaymentExcelFile(selectedMonth, selectedMonthPaymentExportDocs, signatures, selectedMonthAllDocs);
      setPaymentMessage(`Generated ${makePaymentFileName(selectedMonth)}`);
      window.setTimeout(() => setPaymentMessage(""), 3500);
    } catch (error) {
      console.error("Generate payment Excel failed", error);
      setPaymentMessage(error instanceof Error ? `Generate Excel failed: ${error.message}` : "Generate Excel failed");
    }
  };

  const generatePaymentPdf = () => {
    if (selectedMonth === "all") {
      window.alert("กรุ�“าเลือกเ�”ือนก่อน Generate Payment PDF");
      return;
    }
    if (!selectedMonthPaymentExportDocs.length) {
      window.alert("ยังไม่มี Agent เธ—ี่เข้าเงื่อนไข Export ในเ�”ือนนี้");
      return;
    }
    try {
      const fileName = generatePaymentPdfFile(selectedMonth, selectedMonthPaymentExportDocs, signatures, selectedMonthAllDocs);
      setPaymentMessage(`Generated ${fileName}`);
      window.setTimeout(() => setPaymentMessage(""), 3500);
    } catch (error) {
      console.error("Generate payment PDF failed", error);
      setPaymentMessage(error instanceof Error ? `Generate PDF failed: ${error.message}` : "Generate PDF failed");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <div className="rounded-[28px] border border-violet-200 bg-white px-8 py-7 text-center shadow-[0_24px_70px_rgba(109,40,217,0.12)]">
          <div className="text-5xl">�–�️</div>
          <div className="mt-3 text-lg font-black text-violet-800">กำลังโหล�” Signature Center</div>
          <div className="mt-1 text-sm text-slate-500">ระบบกำลังเ�•รียมเอกสาร�—ี่�•้องรับ�—ราบ</div>
        </div>
      </div>
    );
  }

  if (loadMessage) {
    return (
      <div className="rounded-[30px] border border-rose-200 bg-rose-50 p-6 text-rose-700">
        <div className="text-lg font-black">โหล�”ข้อมูล Signature ไม่สำเร็จ</div>
        <div className="mt-2 text-sm">{loadMessage}</div>
      </div>
    );
  }

  return (
    <div className="-m-4 min-h-screen bg-[#f7f8fb] text-slate-950 sm:-m-6">
      <div className="grid min-h-screen grid-cols-1 xl:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="hidden bg-gradient-to-b from-[#1c0b3d] via-[#271052] to-[#120827] px-5 py-7 text-white xl:block">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-xl font-black">QA</div>
            <div>
              <div className="text-lg font-black">Robinhood QA</div>
              <div className="text-xs font-semibold text-violet-200">Operations Workspace</div>
            </div>
          </div>
          <div className="mt-8 space-y-2 text-sm font-bold text-violet-100">
            {["Dashboard", "Case Management", "Signature Workspace", "Reports & Analytics", "Documents", "Users & Teams", "Audit Logs"].map((label) => (
              <div
                key={label}
                className={`rounded-2xl px-4 py-3 ${label === "Signature Workspace" ? "bg-violet-600 text-white shadow-[0_18px_40px_rgba(124,58,237,0.35)]" : "hover:bg-white/10"}`}
              >
                {label}
              </div>
            ))}
          </div>
          <div className="mt-10 rounded-3xl border border-white/15 bg-white/10 p-4">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">Access</div>
            <div className="mt-2 text-sm font-black">{currentUser.displayName || currentUser.username}</div>
            <div className="text-xs font-semibold text-violet-200">{currentUser.role}</div>
          </div>
        </aside>
        <main className="min-w-0 space-y-5 p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-4xl font-black tracking-tight text-slate-950">Signature Workspace</div>
              <div className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-500">
                เธ•เธดเธ”เธ•ามรายการเอกสาร�—ี่�•้องลงนาม แยก�•ามเคสและเ�”ือน เพื่อให้ง่าย�•่อการ�•รวจสอบและ�•เธดเธ”เธ•เธฒเธกเธชเธ–านะ
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-sm font-black text-violet-700">
                {(currentUser.displayName || currentUser.username || "U").slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-black text-slate-950">{currentUser.displayName || currentUser.username}</div>
                <div className="text-xs font-semibold text-slate-500">{currentUser.role}</div>
              </div>
            </div>
          </div>
      <div className="hidden">
      <PageHero
        eyebrow="Monthly Acknowledgement"
        title="Signature Workspace"
        subtitle="Preview คะแนนรายเ�”ือนและ Case Detail 10 เคส ก่อนเข้าสู่ขั้น�•อนเซ็นรับ�—ราบ"
      />
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {[
          { label: "เอกสาร�—ี่เห็นไ�”้", value: summary.total, tone: "text-slate-900" },
          { label: "รอฉันลงนาม", value: summary.myTurn, tone: "text-violet-700" },
          { label: "เซ็นครบแล้ว", value: summary.complete, tone: "text-emerald-700" },
          { label: "รอเซ็น", value: summary.pending, tone: "text-amber-700" },
          { label: "พร้อมจ่าย Incentive", value: summary.ready, tone: "text-violet-700" },
        ].map((item) => (
          <div key={item.label} className="rounded-[26px] border border-violet-100 bg-white p-5 shadow-[0_16px_40px_rgba(88,28,135,0.06)]">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
            <div className={`mt-2 text-3xl font-black ${item.tone}`}>{item.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-[0_16px_40px_rgba(88,28,135,0.06)]">
        <div className="flex flex-wrap items-center gap-2 text-sm font-black text-slate-700">
          <span className="rounded-full bg-violet-100 px-3 py-1 text-violet-700">1. Preview Score + 10 Cases</span>
          <span className="text-slate-300">�’</span>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-violet-700">2. Confirm</span>
          <span className="text-slate-300">�’</span>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-violet-700">3. QA</span>
          <span className="text-slate-300">�’</span>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-violet-700">4. Supervisor</span>
          <span className="text-slate-300">�’</span>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-violet-700">5. Team Lead</span>
          <span className="text-slate-300">�’</span>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-violet-700">6. Agent</span>
        </div>
        <div className="mt-3 text-sm leading-6 text-slate-500">
          วัน�—ี่ 1-10 ยังอยู่ช่วง Appeal จึงยังยืนยันรับ�—ราบและเซ็นไม่ไ�”้ / หลังวัน�—ี่ 10 ผู้�–ูกประเมินเ�—่านั้น�—ี่ก�”ยืนยันไ�”้ / จ่ายรอบปัจจุบันเฉพาะคน�—ี่เซ็นครบ� ายในวัน�—ี่ 15 / เซ็นหลังจากนั้นไปรอบจ่าย�–เธฑเธ”ไป
        </div>
      </div>

      <div className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-[0_16px_40px_rgba(88,28,135,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">Monthly Incentive Payment Export</div>
            <div className="mt-1 text-xl font-black text-slate-950">เอกสารส่งจ่าย Incentive รายเ�”ือน (PDF เธ•เธฒเธก Template)</div>
            <div className="mt-1 text-sm leading-6 text-slate-500">
              หลังวัน�—ี่ 15 ระบบจะออกไฟล์เฉพาะ Agent เธ—ี่เซ็นครบ�—ุก Role เธ ายในกำหน�”เ�—่านั้น คน�—ี่มาเซ็นหลังวัน�—ี่ 15 จะเข้ารอบจ่าย�–เธฑเธ”ไป
            </div>
          </div>
          <div className="min-w-[280px] rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
              {selectedMonthExportAllEvaluated ? "Evaluated Agents" : "Signed Complete Agents"}
            </div>
            <div className="mt-1 text-2xl font-black text-violet-700">
              {selectedMonth === "all" ? "-" : `${selectedMonthPaymentExportDocs.length} คน`}
            </div>
            <div className="mt-1 text-xs font-semibold text-slate-500">
              {selectedMonth === "all"
                ? "กรุ�“าเลือกเ�”ือนก่อน"
                : selectedMonthExportAllEvaluated
                  ? `May export พิเศษ: เธฃเธงเธก Agent เธ—ี่�–ูกประเมิน�—ั้งหม�” ${selectedMonthExportDocs.length} คน / รวมบา�— ${formatBahtAmount(selectedMonthPaymentExportDocs.reduce((sum, doc) => sum + getDocumentIncentive(doc).cash, 0))} บา�—`
                  : `รายการ�—ั้งหม�” ${selectedMonthTotalDocs} คน / เซ็นล่าช้า ${selectedMonthLateSignedDocs.length} คน / รวมบา�—ในรอบนี้ ${formatBahtAmount(selectedMonthPaymentExportDocs.reduce((sum, doc) => sum + getDocumentIncentive(doc).cash, 0))} บา�—`}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={generatePaymentPdf}
              disabled={selectedMonth === "all"}
              className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Generate Payment PDF
            </button>
            <button
              type="button"
              onClick={generatePaymentExcel}
              disabled={selectedMonth === "all"}
              className="rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              Generate Excel
            </button>
          </div>
        </div>
        {paymentMessage ? (
          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">{paymentMessage}</div>
        ) : null}
        {selectedMonth === "all" ? (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-800">
            เงื่อนไขยังไม่ครบ: เธ•้องเลือกเ�”ือน และ�•้องมีอย่างน้อย 1 Agent เธ—ี่เข้าเงื่อนไข Export
          </div>
        ) : selectedMonthExportAllEvaluated ? (
          <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold leading-6 text-sky-800">
            May 2026 เปิ�” Export พิเศษ: Generate ไ�”้�—ัน�—ีจาก Agent เธ—ุกคน�—ี่มีผลประเมิน โ�”ยไม่�•้องรอเซ็นครบ
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {SIGNATURE_FLOW.map((role) => {
          const pendingCount = rolePendingCounts[role] || 0;
          return (
            <div
              key={role}
              className="relative rounded-[24px] border border-violet-100 bg-white p-4 shadow-[0_14px_34px_rgba(88,28,135,0.06)]"
            >
              {pendingCount > 0 ? (
                <span className="absolute right-4 top-4 flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-600 px-2 text-xs font-black text-white">
                  {pendingCount}
                </span>
              ) : null}
              <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Pending Queue</div>
              <div className="mt-1 pr-12 text-base font-black text-slate-950">{roleThaiLabel(role)}</div>
              <div className={`mt-2 text-2xl font-black ${pendingCount > 0 ? "text-rose-600" : "text-slate-300"}`}>
                {pendingCount}
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-500">
                เฉพาะเอกสาร�—ี่ Role ของคุ�“ยัง�•้องลงนาม
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-[30px] border border-violet-100 bg-white p-5 shadow-[0_20px_54px_rgba(88,28,135,0.08)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">Signature Workspace</div>
            <div className="mt-1 text-2xl font-black text-slate-950">รายการเอกสารลงนาม แยก�•ามเ�”ือน</div>
            <div className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              เธ•เธดเธ”เธ•ามรายการเอกสาร�—ี่�•้องลงนาม แยก�•ามเคสและเ�”ือน เพื่อให้ง่าย�•่อการ�•รวจสอบส�–านะ คลิก�—ี่แ�–วเพื่อเปิ�”รายละเอีย�”เธ”้านล่าง
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:min-w-[320px]">
            <button
              type="button"
              onClick={() => setDocumentView("queue")}
              className={`rounded-2xl px-4 py-3 text-xs font-black transition ${
                documentView === "queue" ? "bg-violet-700 text-white" : "border border-violet-100 bg-white text-violet-700 hover:bg-violet-50"
              }`}
            >
              คิวของฉัน ({filteredDocuments.length})
            </button>
            <button
              type="button"
              onClick={() => setDocumentView("history")}
              className={`rounded-2xl px-4 py-3 text-xs font-black transition ${
                documentView === "history" ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {isQaUser ? "QA Monitor" : "ประวั�•เธด"} ({historyFilteredDocuments.length})
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_150px_180px_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหา Document Ref. / Case ID / Agent / เ�”ือน / เธ—เธตเธก"
            className="rounded-2xl border border-violet-100 bg-violet-50/40 px-4 py-3 text-sm font-semibold outline-none transition focus:border-violet-400 focus:bg-white"
          />
          <select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-violet-400"
          >
            <option value="all">เธ—ุกเ�”ือน</option>
            {monthOptions.map((month) => (
              <option key={month} value={month}>{getMonthLabel(month)}</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(event) => setSelectedYear(event.target.value)}
            className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-violet-400"
          >
            <option value="all">เธ—ุกปี</option>
            {yearOptions.map((year) => (
              <option key={year} value={year}>{Number(year) + 543}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-violet-400"
          >
            <option value="all">เธ—ุกส�–านะ</option>
            <option value="preview">รอ Confirm Preview</option>
            <option value="my-turn">รอฉันลงนาม</option>
            <option value="pending">รอเซ็น</option>
            <option value="ready">พร้อมจ่าย Incentive</option>
            <option value="appeal-pending">มี Appeal รอ Approved</option>
            <option value="expired">เกินกำหน�”</option>
          </select>
          <button
            type="button"
            onClick={clearWorkspaceFilters}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            ล้าง�•ัวกรอง
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {([
            ["all", "เธ—ั้งหม�”"],
            ["pending", "รอเซ็น"],
            ["signed", "เซ็นแล้ว"],
            ["in-progress", "ค้าง�”ำเนินการ"],
            ["expired", "เกินกำหน�”"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setQuickFilter(value)}
              className={`rounded-full px-4 py-2 text-xs font-black transition ${
                quickFilter === value ? "bg-violet-700 text-white shadow-[0_10px_24px_rgba(109,40,217,0.22)]" : "border border-violet-100 bg-white text-violet-700 hover:bg-violet-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-5">
          {[
            { label: "รายการ�—ั้งหม�”", value: workspaceSummary.total, tone: "text-slate-950" },
            { label: "รอเซ็น", value: workspaceSummary.pending, tone: "text-amber-700" },
            { label: "เซ็นแล้ว", value: workspaceSummary.signed, tone: "text-emerald-700" },
            { label: "เกินกำหน�”", value: workspaceSummary.expired, tone: "text-rose-700" },
            { label: "ค้าง�”ำเนินการ", value: workspaceSummary.inProgress, tone: "text-sky-700" },
          ].map((item) => (
            <div key={item.label} className="rounded-[22px] border border-violet-100 bg-violet-50/30 px-4 py-3">
              <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">{item.label}</div>
              <div className={`mt-1 text-2xl font-black ${item.tone}`}>{item.value}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 overflow-x-auto rounded-[24px] border border-slate-200">
          <div className="min-w-[1280px]">
            <div className="grid grid-cols-[110px_190px_minmax(170px,1fr)_130px_150px_140px_120px_120px_120px] bg-violet-700 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-white">
              <div>เ�”ือน</div>
              <div>Document Ref.</div>
              <div>ผู้�–ูกประเมิน</div>
              <div>ทีม</div>
              <div>ประเ� เธ—เอกสาร</div>
              <div>เธชเธ–านะ</div>
              <div>Audit Date</div>
              <div>กำหน�”เซ็น</div>
              <div>เธ”ำเนินการ</div>
            </div>
            {groupedWorkspaceDocuments.map((group) => {
              const expanded = expandedMonths[group.monthKey] !== false;
              return (
                <div key={group.monthKey}>
                  <button
                    type="button"
                    onClick={() => setExpandedMonths((previous) => ({ ...previous, [group.monthKey]: !expanded }))}
                    className="flex w-full items-center justify-between border-t border-violet-100 bg-violet-50 px-4 py-3 text-left"
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className="rounded-full bg-violet-700 px-3 py-1 text-xs font-black text-white">{group.monthLabel}</span>
                      <span className="text-sm font-black text-slate-700">{group.items.length} รายการ</span>
                    </span>
                    <span className="text-xs font-black text-violet-700">{expanded ? "ย่อ" : "ขยาย"}</span>
                  </button>
                  {expanded ? group.items.map((doc) => {
                    const entries = effectiveEntriesForDoc(doc, signatures);
                    const status = getWorkspaceStatus(doc, entries);
                    const dueDate = getSignatureDueDate(doc.monthKey);
                    const selected = selectedDocument?.id === doc.id;
                    const documentRef = getMonthlyDocumentRef(doc, documents);
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => openWorkspaceDetail(doc.id)}
                        className={`grid w-full grid-cols-[110px_190px_minmax(170px,1fr)_130px_150px_140px_120px_120px_120px] items-center border-t px-4 py-3 text-left text-sm transition ${
                          selected ? "border-violet-200 bg-violet-50" : "border-slate-100 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div><span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-black text-violet-700">{doc.monthLabel}</span></div>
                        <div className="truncate font-black text-violet-800" title={documentRef}>{documentRef}</div>
                        <div className="min-w-0">
                          <div className="truncate font-black text-slate-950">{doc.agentName}</div>
                          <div className="text-xs font-semibold text-slate-400">{doc.caseCount} cases / {doc.averageScore.toFixed(2)}</div>
                        </div>
                        <div className="truncate font-bold text-slate-600">{doc.teamName || "-"}</div>
                        <div className="font-bold text-slate-600">{getDocumentTypeLabel(doc)}</div>
                        <div><WorkspaceStatusBadge status={status} /></div>
                        <div className="font-black text-slate-600">{formatDateOnly(getSignatureCreatedDate(doc))}</div>
                        <div className={`font-black ${status === "expired" ? "text-rose-700" : "text-slate-600"}`}>{formatDateOnly(dueDate)}</div>
                        <div>
                          <span className="rounded-2xl border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-700">เปิ�”รายละเอีย�”</span>
                        </div>
                      </button>
                    );
                  }) : null}
                </div>
              );
            })}
          </div>
        </div>

        {!workspaceDocuments.length ? (
          <div className="mt-5 rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
            <div className="text-base font-black text-slate-700">ไม่พบรายการเอกสาร�•เธฒเธกเธ•ัวกรอง�—ี่เลือก</div>
            <div className="mt-1 text-sm font-semibold text-slate-500">ลองล้าง�•ัวกรองหรือเลือกเ�”ือนอื่น</div>
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 text-sm font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div>
            แส�”ง {workspaceDocuments.length ? (safeCurrentPage - 1) * rowsPerPage + 1 : 0}-{Math.min(safeCurrentPage * rowsPerPage, workspaceDocuments.length)} จาก {workspaceDocuments.length} รายการ
          </div>
          <div className="flex items-center gap-2">
            <select
              value={rowsPerPage}
              onChange={(event) => setRowsPerPage(Number(event.target.value))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"
            >
              {SIGNATURE_ROWS_PER_PAGE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option} / หน้า</option>
              ))}
            </select>
            <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safeCurrentPage <= 1} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40">
              ก่อนหน้า
            </button>
            <span className="text-xs font-black text-slate-500">{safeCurrentPage}/{totalPages}</span>
            <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safeCurrentPage >= totalPages} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40">
              เธ–เธฑเธ”ไป
            </button>
          </div>
        </div>

        {selectedDocument ? (
          <div ref={workspaceDetailRef} className="mt-5 rounded-[26px] border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-4">
            <button
              type="button"
              onClick={() => setWorkspaceDetailOpen((open) => !open)}
              className="flex w-full flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">รายละเอีย�”เอกสาร�—ี่เลือก</div>
                <div className="mt-1 text-lg font-black text-slate-950">
                  {selectedDocumentRef} • {selectedDocument.agentName}
                </div>
                <div className="mt-1 text-xs font-semibold text-slate-500">
                  {selectedDocument.monthLabel} / {getDocumentTypeLabel(selectedDocument)} / ผู้ลงนามปัจจุบัน: {getPendingRoles(selectedEntries)[0] ? roleThaiLabel(getPendingRoles(selectedEntries)[0]) : "ครบแล้ว"}
                </div>
              </div>
              <span className="rounded-2xl bg-violet-700 px-4 py-2 text-xs font-black text-white">
                {workspaceDetailOpen ? "ย่อรายละเอีย�”" : "เปิ�”รายละเอีย�”"}
              </span>
            </button>

            {workspaceDetailOpen ? (
              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    ["Document Ref.", selectedDocumentRef],
                    ["เ�”ือนเอกสาร", selectedDocument.monthLabel],
                    ["ผู้�–ูกประเมิน", selectedDocument.agentName],
                    ["ทีม", selectedDocument.teamName || "-"],
                    ["ประเ� เธ—เอกสาร", getDocumentTypeLabel(selectedDocument)],
                    ["เธชเธ–านะ", getWorkspaceStatusLabel(getWorkspaceStatus(selectedDocument, selectedEntries))],
                    ["Audit Date ล่าสุ�”", formatDateOnly(getSignatureCreatedDate(selectedDocument))],
                    ["กำหน�”เซ็น", formatDateOnly(getSignatureDueDate(selectedDocument.monthKey))],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white bg-white/80 px-4 py-3 shadow-sm">
                      <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">{label}</div>
                      <div className="mt-1 break-words text-sm font-black text-slate-900">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-[22px] border border-white bg-white/90 p-4 shadow-sm">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">เธฅเธณเธ”ับการลงนาม</div>
                  <div className="mt-3 space-y-3">
                    {SIGNATURE_FLOW.map((role, index) => {
                      const signedEntry = getSignedEntry(selectedEntries, role);
                      const isCurrent = !signedEntry && getPendingRoles(selectedEntries)[0] === role;
                      return (
                        <div key={role} className="flex items-start gap-3">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                            signedEntry ? "bg-emerald-100 text-emerald-700" : isCurrent ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                          }`}>
                            {index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-black text-slate-900">{roleThaiLabel(role)}</div>
                            <div className="text-xs font-semibold text-slate-500">
                              {signedEntry ? `เซ็นแล้วโ�”เธข ${signedEntry.signedBy}` : isCurrent ? "เธฃเธญเธ”ำเนินการขั้นนี้" : "ยังไม่�–ึงขั้น�•อน / ยังไม่เซ็น"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 grid gap-2">
                    <button
                      type="button"
                      onClick={() => document.getElementById("signature-workflow-detail")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      className="rounded-2xl bg-slate-950 px-4 py-3 text-xs font-black text-white"
                    >
                      ไป�—ี่พื้น�—ี่ลงนาม / เธ•รวจเอกสาร
                    </button>
                    <button
                      type="button"
                      onClick={() => setWorkspaceDetailOpen(false)}
                      className="rounded-2xl border border-violet-200 bg-white px-4 py-3 text-xs font-black text-violet-700"
                    >
                      ปิ�”แ�–บรายละเอีย�”
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div id="signature-workflow-detail" className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-[30px] border border-violet-100 bg-white p-5 shadow-[0_20px_54px_rgba(88,28,135,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">
            {documentView === "history" ? (isQaUser ? "QA Signature Monitor" : "Signature History") : "Document Queue"}
          </div>
          <div className="mt-1 text-xl font-black text-slate-950">
            {documentView === "history" ? monitorTitle : "คิว�—ี่�•้องเซ็นของฉัน"}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDocumentView("queue")}
              className={`rounded-2xl px-4 py-3 text-xs font-black transition ${
                documentView === "queue"
                  ? "bg-violet-700 text-white"
                  : "border border-violet-100 bg-white text-violet-700 hover:bg-violet-50"
              }`}
            >
              คิวของฉัน ({filteredDocuments.length})
            </button>
            <button
              type="button"
              onClick={() => setDocumentView("history")}
              className={`rounded-2xl px-4 py-3 text-xs font-black transition ${
                documentView === "history"
                  ? "bg-slate-950 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {isQaUser ? "QA Monitor" : "ประวั�•เธด"} ({historyFilteredDocuments.length})
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหา Agent / Senior / Supervisor"
              className="rounded-2xl border border-violet-100 bg-violet-50/40 px-4 py-3 text-sm font-semibold outline-none transition focus:border-violet-400 focus:bg-white"
            />
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-violet-400"
            >
              <option value="all">เธ—ุกเ�”ือน</option>
              {monthOptions.map((month) => (
                <option key={month} value={month}>{getMonthLabel(month)}</option>
              ))}
            </select>
            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold leading-5 text-rose-700">
              {documentView === "history"
                ? monitorDescription
                : "แส�”งเฉพาะเอกสาร�—ี่ Role ของคุ�“ยัง�•้องลงนามเ�—่านั้น"}
            </div>
            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold leading-5 text-rose-700">
              {isQaUser
                ? "QA Monitor ใช้เช็กส�–านะรวมของเอกสาร QA เธ—ี่คุ�“รับผิ�”ชอบ โ�”ยไม่รวมเอกสารของ QA คนอื่น"
                : "แส�”งเฉพาะเอกสาร�—ี่ Role ของคุ�“ยัง�•้องลงนามเ�—่านั้น"}
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-violet-400"
            >
              <option value="all">เธ—ุกส�–านะ</option>
              <option value="preview">รอ Confirm Preview</option>
              <option value="my-turn">รอฉันลงนาม</option>
              <option value="pending">รอเซ็น</option>
              <option value="ready">พร้อมจ่าย Incentive</option>
              <option value="appeal-pending">มี Appeal รอ Approved</option>
              <option value="expired">เกินวัน�—ี่ 15 / ไม่ครบ</option>
            </select>
          </div>

          <div className="mt-5 max-h-[620px] space-y-3 overflow-y-auto pr-1">
            {activeDocuments.map((doc) => {
              const entries = effectiveEntriesForDoc(doc, signatures);
              const count = SIGNATURE_FLOW.filter((role) => Boolean(getSignedEntry(entries, role))).length;
              const docPendingRoles = getPendingRoles(entries);
              const docSignedRoles = SIGNATURE_FLOW.filter((role) => Boolean(getSignedEntry(entries, role)));
              const isMyPendingTurn =
                docPendingRoles.some((role) => canSignIdentity(currentUser, doc, role)) &&
                isSigningAllowedByDate(doc.monthKey) &&
                !doc.cases.some((item) => pendingAppealCaseMap.has(item.caseId));
              const selected = selectedDocument?.id === doc.id;
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => setSelectedDocumentId(doc.id)}
                  className={`w-full rounded-[24px] border p-4 text-left transition ${
                    selected
                      ? "border-violet-400 bg-violet-50 shadow-[0_16px_34px_rgba(109,40,217,0.14)]"
                      : "border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {isMyPendingTurn ? <span className="h-2.5 w-2.5 rounded-full bg-rose-600" /> : null}
                        <div className="truncate text-sm font-black text-slate-950">{doc.agentName}</div>
                      </div>
                      <div className="mt-1 text-xs font-bold text-slate-500">{doc.monthLabel}</div>
                      {docPendingRoles.length ? (
                        <div className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-black ${
                          isMyPendingTurn ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"
                        }`}>
                          รอเซ็น {docPendingRoles.length} role
                        </div>
                      ) : null}
                    </div>
                    <SignaturePill status={count === SIGNATURE_FLOW.length ? "Signed" : "Pending"} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{count}/4 signed</span>
                    <span className="rounded-full bg-violet-100 px-2.5 py-1 text-violet-700">Score {doc.averageScore.toFixed(2)}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{getTimelineStatus(doc.monthKey)}</span>
                  </div>
                  {documentView === "history" ? (
                    <div className="mt-3 space-y-1 text-xs font-bold leading-5">
                      <div className="text-emerald-700">
                        เซ็นแล้ว: {docSignedRoles.length ? docSignedRoles.map(roleThaiLabel).join(", ") : "-"}
                      </div>
                      <div className="text-rose-700">
                        ยังเหลือ: {docPendingRoles.length ? docPendingRoles.map((role) => `${roleThaiLabel(role)} (${getRoleSigner(doc, role)})`).join(", ") : "ครบแล้ว"}
                      </div>
                    </div>
                  ) : null}
                </button>
              );
            })}

            {!activeDocuments.length ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
                {documentView === "history"
                  ? "ยังไม่มีประวั�•ิเอกสาร�•ามเงื่อนไข�—ี่เลือก"
                  : "ยังไม่มีคิวเซ็นของคุ�“เธ•ามเงื่อนไข�—ี่เลือก"}
              </div>
            ) : null}
          </div>
        </div>

        {selectedDocument ? (
          <div className="space-y-5">
            <div className="rounded-[30px] border border-violet-100 bg-white p-6 shadow-[0_20px_54px_rgba(88,28,135,0.08)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-500">Preview Before Signature</div>
                  <div className="mt-1 text-2xl font-black text-slate-950">{selectedDocument.agentName}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">
                    {selectedDocument.monthLabel} • Team: {selectedDocument.teamName} • Team Lead: {selectedDocument.seniorName}
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {documentView === "history" && currentUser.role === "Quality Assurance" && selectedDocument && !isHistoricalPaidPeriod(selectedDocument.monthKey) ? (
                    <button
                      type="button"
                      onClick={resetDocument}
                      className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-black text-rose-700 transition hover:bg-rose-100"
                    >
                      Reset เอกสารนี้
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={generatePdf}
                    className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-violet-800"
                  >
                    Generate Final PDF
                  </button>
                </div>
              </div>

              {pdfMessage ? <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">{pdfMessage}</div> : null}

              <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold ${
                mySignedRoles.length
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}>
                {mySignedRoles.length
                  ? `เช็กแล้ว: คุ�“เซ็นเอกสารนี้แล้วใน Role ${mySignedRoles.map(roleThaiLabel).join(", ")}`
                  : "เช็กแล้ว: ยังไม่พบลายเซ็นของคุ�“ในเอกสารนี้"}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Average Score</div>
                  <div className="mt-1 text-2xl font-black text-violet-700">{selectedDocument.averageScore.toFixed(2)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Grade</div>
                  <div className="mt-1 text-2xl font-black text-slate-950">{selectedDocument.grade}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Timeline</div>
                  <div className="mt-1 text-base font-black text-slate-950">{timeline}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Incentive</div>
                  <div className={`mt-1 text-base font-black ${readyForIncentive ? "text-emerald-700" : "text-amber-700"}`}>
                    {readyForIncentive ? "Ready to Pay" : "Hold / Not Ready"}
                  </div>
                </div>
              </div>
            </div>

            {hasPendingAppeal ? (
              <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-5 text-rose-800 shadow-[0_18px_40px_rgba(225,29,72,0.08)]">
                <div className="text-base font-black">มีเคส Appeal เธฃเธญ Approved</div>
                <div className="mt-1 text-sm font-semibold leading-6">
                  เอกสารยังโชว์ไ�”้และ Generate PDF ไ�”้ แ�•่ยังยืนยันรับ�—ราบไม่ไ�”้ และยังเซ็นไม่ไ�”้จนกว่า Appeal จะ�–ูก Approved เธซเธฃเธทเธญ Rejected ครบ�—ุกเคส
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedPendingAppeals.map((item) => (
                    <span key={item.caseId} className="rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-black text-rose-700">
                      {item.caseId}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-[30px] border border-violet-100 bg-white p-6 shadow-[0_20px_54px_rgba(88,28,135,0.08)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-500">Case Detail Preview</div>
                  <div className="mt-1 text-xl font-black text-slate-950">Preview 10 เคสก่อนเซ็น</div>
                </div>
                {!previewConfirmed ? (
                  <div className="flex flex-col items-end gap-2">
                    <button
                      type="button"
                      onClick={confirmPreview}
                      disabled={!confirmAvailable}
                      className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      ยืนยันรับ�—ราบข้อมูล
                    </button>
                    {confirmBlockedReason ? (
                      <div className="max-w-[260px] text-right text-xs font-bold leading-5 text-amber-600">{confirmBlockedReason}</div>
                    ) : null}
                  </div>
                ) : (
                  <span className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-700">Preview Confirmed</span>
                )}
              </div>

              <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200">
                <div className="grid grid-cols-[58px_120px_90px_90px_minmax(0,1fr)] bg-violet-700 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white">
                  <div>#</div>
                  <div>Case ID</div>
                  <div>Date</div>
                  <div>Score</div>
                  <div>Intent / Comment</div>
                </div>
                {selectedDocument.cases.slice(0, 10).map((item, index) => (
                  <div key={`${item.caseId}-${index}`} className="grid grid-cols-[58px_120px_90px_90px_minmax(0,1fr)] gap-3 border-t border-slate-200 px-4 py-3 text-sm">
                    <div className="font-black text-slate-400">{index + 1}</div>
                    <div className="font-black text-slate-950">{item.caseId}</div>
                    <div className="font-semibold text-slate-500">{item.auditDate}</div>
                    <div className="font-black text-violet-700">{item.finalScore.toFixed(2)}</div>
                    <div>
                      <div className="font-bold text-slate-900">{item.inquiry}</div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.comment}</div>
                      {pendingAppealCaseMap.has(item.caseId) ? (
                        <div className="mt-2 inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-black text-rose-700">
                          Appeal Pending / รอ Approved
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {workflowReadyToSign ? (
              <div className="rounded-[30px] border border-violet-100 bg-white p-6 shadow-[0_20px_54px_rgba(88,28,135,0.08)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-500">Signature Workflow</div>
                    <div className="mt-1 text-xl font-black text-slate-950">เปิ�”ให้�—ุก Role ลงนามไ�”้อิสระหลังปิ�” Appeal</div>
                    {!previewConfirmed ? (
                      <div className="mt-1 text-xs font-bold text-amber-600">
                        Agent เธ•้องก�”ยืนยันรับ�—ราบก่อนลงนามของ�•ัวเอง แ�•่ Role อื่นลงนามไ�”้โ�”ยไม่�•้องรอ Agent
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={shareSignatureStatus}
                      className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-black text-violet-700 transition hover:bg-violet-100"
                    >
                      แชร์ส�–านะผู้ยังไม่เซ็น
                    </button>
                    {currentUser.role === "Quality Assurance" && !isHistoricalPaidPeriod(selectedDocument.monthKey) ? (
                      <button
                        type="button"
                        onClick={resetDocument}
                        className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-100"
                      >
                        Reset เอกสารนี้
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className={`mt-4 rounded-[24px] border px-5 py-4 shadow-[0_14px_34px_rgba(88,28,135,0.08)] ${
                  pendingRoles.length
                    ? "border-violet-200 bg-violet-50"
                    : "border-emerald-200 bg-emerald-50"
                }`}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className={`text-xs font-black uppercase tracking-[0.18em] ${
                        pendingRoles.length ? "text-violet-600" : "text-emerald-700"
                      }`}>
                        Pending Signers Alert
                      </div>
                      <div className="mt-1 text-lg font-black text-slate-950">
                        {pendingRoles.length
                          ? `ยังรอลงนาม ${pendingRoles.length} role`
                          : "เอกสารลงนามครบแล้ว"}
                      </div>
                      <div className="mt-1 text-sm font-bold text-slate-600">
                        {pendingRoles.length
                          ? pendingRoles.map((role) => `${roleThaiLabel(role)}: ${getRoleSigner(selectedDocument, role)}`).join(" / ")
                          : "ไม่เหลือ Role เธ—ี่�•้องเซ็น�•่อ"}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={copySelectedDocumentShareLink}
                        className="rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-700 transition hover:bg-violet-50"
                      >
                        Copy Share Link
                      </button>
                      <button
                        type="button"
                        onClick={copyNextSignerAlert}
                        className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800"
                      >
                        คั�”ลอกข้อความแจ้งเ�•ือน
                      </button>
                    </div>
                  </div>
                </div>

                {shareMessage ? (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">
                    {shareMessage}
                  </div>
                ) : null}

                <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200">
                  <div className="grid grid-cols-[90px_220px_minmax(0,1fr)_150px_210px] bg-violet-700 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white">
                    <div>Step</div>
                    <div>Role</div>
                    <div>Signer</div>
                    <div>Status</div>
                    <div>Action</div>
                  </div>

                  {SIGNATURE_FLOW.map((role, index) => {
                    const signed = getSignedEntry(selectedEntries, role);
                    const resetAfterDeadline = getDeadlineResetEntry(selectedEntries, role);
                    const activeResetAfterDeadline = getActiveDeadlineResetEntry(selectedEntries, role);
                    const resetExpiresAt = getDeadlineResetExpiresAt(resetAfterDeadline);
                    const resetWindowExpired = Boolean(resetAfterDeadline && !activeResetAfterDeadline);
                    const status = statusForRole(selectedEntries, role, selectedDocument.monthKey);
                    const signerName = getRoleSigner(selectedDocument, role);
                    const isAgentBlockedByConfirm = role === "Agent" && !previewConfirmed && !signed;
                    const allowSign =
                      canSignIdentity(currentUser, selectedDocument, role) &&
                      canSignRoleByDate(selectedDocument.monthKey, selectedEntries, role);
                    const canAddFirstDrawnSignature =
                      Boolean(signed) &&
                      !signed?.signatureDataUrl &&
                      canSignIdentity(currentUser, selectedDocument, role);
                    const canResetRoleAfterDeadline =
                      currentUser.role === "Quality Assurance" &&
                      !isHistoricalPaidPeriod(selectedDocument.monthKey) &&
                      getTimelineStatus(selectedDocument.monthKey) === "Signature Deadline Passed" &&
                      !signed &&
                      !activeResetAfterDeadline;
                    const canOpenSignaturePad = (!signed && allowSign) || canAddFirstDrawnSignature;
                    const savedSignatureDataUrl = signatureLibrary[getSavedSignatureKey(role)];
                    return (
                      <div key={role} className="grid grid-cols-[90px_220px_minmax(0,1fr)_150px_210px] items-center gap-3 border-t border-slate-200 px-4 py-4 text-sm">
                        <div>
                          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${
                            signed ? "bg-emerald-100 text-emerald-700" : allowSign ? "bg-violet-700 text-white" : "bg-slate-100 text-slate-500"
                          }`}>
                            {index + 1}
                          </span>
                        </div>
                        <div className="font-black text-slate-950">{roleThaiLabel(role)}</div>
                        <div>
                          <div className="font-bold text-slate-900">{signed ? signed.signerName : signerName}</div>
                          {signed ? (
                            <div className="mt-1 text-xs font-semibold text-slate-400">
                              Signed by {signed.signedBy} • {formatDateTime(signed.signedAt)}
                            </div>
                          ) : isAgentBlockedByConfirm ? (
                            <div className="mt-1 text-xs font-semibold text-amber-600">Agent เธ•้องก�”ยืนยันรับ�—ราบก่อนลงนาม</div>
                          ) : status === "Locked" ? (
                            <div className="mt-1 text-xs font-semibold text-slate-400">เปิ�”เซ็นหลังวัน�—ี่ 10 ของเ�”ือน�–เธฑเธ”ไป</div>
                          ) : activeResetAfterDeadline ? (
                            <div className="mt-1 text-xs font-semibold text-violet-600">
                              รีเซ็�•แล้ว เซ็นไ�”้�–ึง {resetExpiresAt ? formatDateTime(resetExpiresAt.toISOString()) : `${SIGNATURE_RESET_WINDOW_DAYS} วัน`}
                            </div>
                          ) : resetWindowExpired ? (
                            <div className="mt-1 text-xs font-semibold text-rose-600">
                              รอบรีเซ็�•เธซเธกเธ”อายุแล้ว ก�” Reset ใหม่ไ�”้
                            </div>
                          ) : null}
                        </div>
                        <div><SignaturePill status={status} /></div>
                        <div>
                          <button
                            type="button"
                            onClick={() => openSignaturePad(role)}
                            disabled={!canOpenSignaturePad}
                            className={`w-full rounded-2xl px-4 py-2 text-xs font-black transition ${
                              canOpenSignaturePad
                                ? "bg-violet-700 text-white hover:bg-violet-800"
                                : "cursor-not-allowed bg-slate-200 text-slate-500"
                            }`}
                          >
                            {signed
                              ? signed.signatureDataUrl
                                ? "เอกสารลงนามแล้ว"
                                : canAddFirstDrawnSignature
                                  ? savedSignatureDataUrl
                                    ? "เธ•รวจสอบลายเซ็นเ�”เธดเธก"
                                    : "เพิ่มลายเซ็นจริง"
                                  : "เฉพาะเจ้าของลายเซ็น"
                              : allowSign
                                ? isAgentBlockedByConfirm
                                  ? "ก�”ยืนยันก่อนเซ็น"
                                  : savedSignatureDataUrl
                                  ? "เธ•รวจสอบลายเซ็นเ�”เธดเธก"
                                  : timeline === "Signature Deadline Passed"
                                    ? "เธงเธฒเธ”และลงนามล่าช้า"
                                    : "เธงเธฒเธ”และลงนาม"
                                : status === "Locked"
                                  ? "ยังไม่เปิ�”ให้เซ็น"
                                  : status === "Expired"
                                    ? "เกินกำหน�”"
                                    : "รอผู้เกี่ยวข้อง"}
                          </button>
                          {canResetRoleAfterDeadline ? (
                            <button
                              type="button"
                              onClick={() => void resetSignatureRole(role)}
                              className="mt-2 w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-100"
                            >
                              Reset คนนี้
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                  PDF ออกไ�”้�—ุกส�–านะ แ�•่ลายเซ็นจริง�•้องให้เจ้าของ Role เซ็นเองเ�—่านั้น เมื่อบัน�—ึกลายเซ็นจริงแล้วจะกลับมาแก้เองไม่ไ�”้
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

        </main>
      </div>

      {signingRole && selectedDocument ? (
        <SignaturePadModal
          roleLabel={roleThaiLabel(signingRole)}
          signerName={getRoleSigner(selectedDocument, signingRole)}
          savedSignatureDataUrl={signatureLibrary[getSavedSignatureKey(signingRole)]}
          onCancel={() => setSigningRole(null)}
          onUseSavedSignature={async () => {
            const savedSignatureDataUrl = signatureLibrary[getSavedSignatureKey(signingRole)];
            if (!savedSignatureDataUrl) return;
            if (!canSignIdentity(currentUser, selectedDocument, signingRole)) {
              window.alert("เซ็นแ�—นกันไม่ไ�”้ กรุ�“าให้เจ้าของลายเซ็น�•เธฒเธก Role เป็นผู้ลงนามเอง");
              setSigningRole(null);
              return;
            }
            const existingSigned = getSignedEntry(effectiveEntriesForDoc(selectedDocument, signatures), signingRole);
            let saved = false;
            if (existingSigned) {
              saved = await saveDrawnSignature(signingRole, savedSignatureDataUrl, false);
            } else {
              saved = await signRole(signingRole, savedSignatureDataUrl, false);
            }
            if (saved) setSigningRole(null);
          }}
          onSave={async (dataUrl, saveToSavedLibrary) => {
            if (!canSignIdentity(currentUser, selectedDocument, signingRole)) {
              window.alert("เซ็นแ�—นกันไม่ไ�”้ กรุ�“าให้เจ้าของลายเซ็น�•เธฒเธก Role เป็นผู้ลงนามเอง");
              setSigningRole(null);
              return;
            }
            const existingSigned = getSignedEntry(effectiveEntriesForDoc(selectedDocument, signatures), signingRole);
            let saved = false;
            if (existingSigned) {
              saved = await saveDrawnSignature(signingRole, dataUrl, saveToSavedLibrary);
            } else {
              saved = await signRole(signingRole, dataUrl, saveToSavedLibrary);
            }
            if (saved) setSigningRole(null);
          }}
        />
      ) : null}
    </div>
  );
}


