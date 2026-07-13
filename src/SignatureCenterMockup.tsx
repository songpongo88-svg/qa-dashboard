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

  const thaiMonthMatch = text.match(/(ม\.ค\.|มกราคม|ก\.พ\.|กุมภาพันธ์|มี\.ค\.|มีนาคม|เม\.ย\.|เมษายน|พ\.ค\.|พฤษภาคม|มิ\.ย\.|มิถุนายน|ก\.ค\.|กรกฎาคม|ส\.ค\.|สิงหาคม|ก\.ย\.|กันยายน|ต\.ค\.|ตุลาคม|พ\.ย\.|พฤศจิกายน|ธ\.ค\.|ธันวาคม)\s*(\d{2,4})/);
  if (thaiMonthMatch) {
    const map: Record<string, number> = {
      "ม.ค.": 0, "มกราคม": 0,
      "ก.พ.": 1, "กุมภาพันธ์": 1,
      "มี.ค.": 2, "มีนาคม": 2,
      "เม.ย.": 3, "เมษายน": 3,
      "พ.ค.": 4, "พฤษภาคม": 4,
      "มิ.ย.": 5, "มิถุนายน": 5,
      "ก.ค.": 6, "กรกฎาคม": 6,
      "ส.ค.": 7, "สิงหาคม": 7,
      "ก.ย.": 8, "กันยายน": 8,
      "ต.ค.": 9, "ตุลาคม": 9,
      "พ.ย.": 10, "พฤศจิกายน": 10,
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
  // เปิดให้ลงนามได้หลังปิดรอบ Appeal เป็นต้นไป
  // ถ้าเซ็นหลัง Due Date จะถือเป็น Late Signature และไม่เข้ารอบจ่ายเดือนปัจจุบัน
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
      const scoreDelta = request.topics
        .filter(isSignatureAppealTopicChanged)
        .reduce((sum, topic) => {
          const originalScore = Number(topic.score || 0);
          const revisedScore =
            topic.revisedScore !== null &&
            topic.revisedScore !== "" &&
            !Number.isNaN(Number(topic.revisedScore))
              ? Number(topic.revisedScore)
              : originalScore;
          if (!Number.isFinite(originalScore) || !Number.isFinite(revisedScore)) return sum;
          return sum + revisedScore - originalScore;
        }, 0);
      map.set(caseId, {
        caseId,
        previousScore,
        finalScore: Number((previousScore + scoreDelta).toFixed(2)),
        reviewedAt: request.reviewedAt || request.submittedAt || "",
      });
    });
  return map;
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
    const appealScore = (approvedAppealMap.get(`${caseId}::${monthKey}`) || approvedAppealMap.get(caseId))?.finalScore;
    const finalScore = Number.isFinite(Number(appealScore)) ? Number(appealScore) : rawFinalScore;
    const score = Number.isFinite(finalScore) ? finalScore : 0;

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
        cases: item.cases,
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
    const appealScore = approvedAppealMap.get(caseId)?.finalScore;
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
        cases: item.cases,
      };
      return { ...base, documentHash: createDocumentHash(base) };
    })
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey) || a.agentName.localeCompare(b.agentName, "th"));
}

function mergeSignatureDocuments(existing: SignatureDocument, incoming: SignatureDocument): SignatureDocument {
  const caseMap = new Map<string, SignatureCaseDetail>();
  existing.cases.forEach((item) => caseMap.set(item.caseId, item));
  incoming.cases.forEach((item) => caseMap.set(item.caseId, item));
  const cases = Array.from(caseMap.values());
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
  if (role === "QA") return "QA ผู้ตรวจสอบ";
  if (role === "Supervisor") return "Supervisor";
  if (role === "Senior") return "Senior / Team Lead";
  return "Agent ผู้ถูกประเมิน";
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

function getDocumentTypeLabel(doc: SignatureDocument) {
  return doc.eligibleByScore ? "เอกสารจ่าย Incentive รายเดือน" : "เอกสารรับทราบผล QA รายเดือน";
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
  if (status === "expired") return "เกินกำหนด";
  if (status === "in-progress") return "ค้างดำเนินการ";
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

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });

  try {
    registerTHSarabunNew(pdf);
    pdf.setFont("THSarabunNew", "normal");
  } catch {}

  const qPageW = 297;
  const qPageH = 210;
  const qSidebarW = 34;
  const qContentLeft = qSidebarW + 8;
  const qContentRight = qPageW - 8;
  const qAccent: [number, number, number] = [109, 40, 217];
  const qDark: [number, number, number] = [20, 8, 49];

  const qSetFont = (size: number, bold = false, color: [number, number, number] = [31, 41, 55]) => {
    try {
      pdf.setFont("THSarabunNew", bold ? "bold" : "normal");
    } catch {}
    pdf.setFontSize(size);
    pdf.setTextColor(color[0], color[1], color[2]);
  };

  const qText = (
    value: string,
    x: number,
    yy: number,
    size = 10,
    bold = false,
    color: [number, number, number] = [31, 41, 55],
    options?: { align?: "left" | "center" | "right" }
  ) => {
    qSetFont(size, bold, color);
    pdf.text(String(value ?? ""), x, yy, options);
  };

  const qWrap = (
    value: string,
    x: number,
    yy: number,
    width: number,
    size = 8.5,
    bold = false,
    color: [number, number, number] = [31, 41, 55],
    lineHeight = 3.5,
    maxLines = 2
  ) => {
    qSetFont(size, bold, color);
    const lines = pdf.splitTextToSize(String(value ?? ""), width).slice(0, maxLines);
    lines.forEach((line: string, index: number) => pdf.text(line, x, yy + index * lineHeight));
  };

  const qRoundedBox = (
    x: number,
    yy: number,
    width: number,
    height: number,
    fill: [number, number, number] = [255, 255, 255],
    stroke: [number, number, number] = [226, 232, 240]
  ) => {
    pdf.setDrawColor(stroke[0], stroke[1], stroke[2]);
    pdf.setFillColor(fill[0], fill[1], fill[2]);
    pdf.roundedRect(x, yy, width, height, 3, 3, "FD");
  };

  const qChrome = (pageNo: number) => {
    pdf.setFillColor(qDark[0], qDark[1], qDark[2]);
    pdf.rect(0, 0, qSidebarW, qPageH, "F");
    pdf.setFillColor(qAccent[0], qAccent[1], qAccent[2]);
    pdf.roundedRect(5, 10, 24, 10, 2, 2, "F");
    qText("Robinhood QA", 7, 16.8, 9, true, [255, 255, 255]);

    ["Dashboard", "Signature", "Documents", "Reports"].forEach((item, index) => {
      const navY = 36 + index * 13;
      if (item === "Signature") {
        pdf.setFillColor(qAccent[0], qAccent[1], qAccent[2]);
        pdf.roundedRect(4, navY - 5.5, 26, 8, 2, 2, "F");
      }
      qText(item, 7, navY, 7.6, item === "Signature", [255, 255, 255]);
    });

    qText("Signature Workspace", qContentLeft, 15, 20, true, [15, 23, 42]);
    qText("Monthly incentive document tracking and payment export", qContentLeft, 22, 10, false, [100, 116, 139]);
    pdf.setDrawColor(226, 232, 240);
    pdf.line(qContentLeft, 28, qContentRight, 28);
    qText(`Page ${pageNo}`, qContentRight, qPageH - 6, 8, false, [148, 163, 184], { align: "right" });
  };

  const qCard = (
    x: number,
    yy: number,
    width: number,
    label: string,
    value: string,
    tone: [number, number, number]
  ) => {
    qRoundedBox(x, yy, width, 23);
    qText(label, x + 4, yy + 6, 8.2, true, [100, 116, 139]);
    qText(value, x + 4, yy + 16, 16, true, tone);
  };

  const qStatusBadge = (status: string, x: number, yy: number) => {
    const isSigned = /signed|complete|ready|พร้อมจ่าย/i.test(status);
    const isLate = /late|expired|เลยกำหนด/i.test(status);
    const isPending = /pending|รอ/i.test(status);
    const bg: [number, number, number] = isSigned ? [220, 252, 231] : isLate ? [255, 228, 230] : isPending ? [254, 243, 199] : [219, 234, 254];
    const fg: [number, number, number] = isSigned ? [22, 101, 52] : isLate ? [190, 18, 60] : isPending ? [180, 83, 9] : [29, 78, 216];
    pdf.setFillColor(bg[0], bg[1], bg[2]);
    pdf.roundedRect(x, yy - 4.5, 21, 7, 3, 3, "F");
    qText(status.slice(0, 15), x + 10.5, yy, 7.2, true, fg, { align: "center" });
  };

  const qTableHeader = (x: number, yy: number, widths: number[]) => {
    const headers = ["Document Ref.", "Agent", "Team", "Cases", "Avg", "Amount", "Status"];
    pdf.setFillColor(qAccent[0], qAccent[1], qAccent[2]);
    pdf.roundedRect(x, yy, widths.reduce((sum, width) => sum + width, 0), 9, 2, 2, "F");
    let cx = x;
    headers.forEach((header, index) => {
      qText(header, cx + 2, yy + 6, 8, true, [255, 255, 255]);
      cx += widths[index];
    });
  };

  const qMonthLabel = getMonthLabel(monthKey);
  const qReadyCount = sortedDocs.length;
  const qPendingCount = Math.max(allMonthDocs.length - qReadyCount, 0);
  const qDetailDoc = sortedDocs[0];
  let qPageNo = 1;
  qChrome(qPageNo);

  qRoundedBox(qContentLeft, 34, qContentRight - qContentLeft - 57, 24);
  qText("Month", qContentLeft + 5, 42, 8, true, [100, 116, 139]);
  qText(qMonthLabel, qContentLeft + 5, 51, 13, true, qAccent);
  qText("Export Rule", qContentLeft + 54, 42, 8, true, [100, 116, 139]);
  qWrap(
    exportsAllEvaluated ? "May 2026 exports all evaluated agents." : "Pay signed-complete agents by day 15 only.",
    qContentLeft + 54,
    49,
    74,
    8.5,
    true
  );
  qText("Cutoff", qContentLeft + 138, 42, 8, true, [100, 116, 139]);
  qWrap(paymentCutoff, qContentLeft + 138, 49, 56, 8.5, true);

  qCard(qContentLeft, 65, 42, "Agents", String(qReadyCount), qAccent);
  qCard(qContentLeft + 47, 65, 42, "Cases", String(totalCases), [37, 99, 235]);
  qCard(qContentLeft + 94, 65, 42, "Average", avgScore.toFixed(2), [22, 163, 74]);
  qCard(qContentLeft + 141, 65, 48, "Cash THB", formatBahtAmount(totalCashAmount), [217, 119, 6]);
  qCard(qContentLeft + 194, 65, 42, "Pending", String(qPendingCount), [225, 29, 72]);

  const qTableX = qContentLeft;
  const qTableY = 97;
  const qTableWidths = [34, 43, 34, 15, 16, 22, 24];
  const qTableW = qTableWidths.reduce((sum, width) => sum + width, 0);
  qTableHeader(qTableX, qTableY, qTableWidths);
  let qRowY = qTableY + 9;
  sortedDocs.slice(0, 10).forEach((doc, index) => {
    const entries = effectiveEntriesForDoc(doc, signatures);
    const statusText = getAgentSignedStatusText(doc, entries, exportsAllEvaluated);
    const incentive = getDocumentIncentive(doc);
    pdf.setDrawColor(226, 232, 240);
    pdf.setFillColor(index % 2 === 0 ? 250 : 255, index % 2 === 0 ? 245 : 255, index % 2 === 0 ? 255 : 255);
    pdf.rect(qTableX, qRowY, qTableW, 11, "FD");
    let cx = qTableX;
    [
      doc.documentHash || getDocumentPrimaryCaseId(doc),
      doc.agentName,
      doc.teamLeadName || doc.supervisorName || "-",
      String(doc.caseCount),
      doc.averageScore.toFixed(2),
      formatBahtAmount(incentive.cash + incentive.promo),
    ].forEach((cell, cellIndex) => {
      qWrap(cell, cx + 2, qRowY + 5, qTableWidths[cellIndex] - 4, cellIndex < 3 ? 7.2 : 8, cellIndex < 2, [31, 41, 55], 3.2, 2);
      cx += qTableWidths[cellIndex];
    });
    qStatusBadge(statusText, cx + 2, qRowY + 6.2);
    qRowY += 11;
  });
  if (!sortedDocs.length) {
    pdf.setDrawColor(226, 232, 240);
    pdf.setFillColor(248, 250, 252);
    pdf.rect(qTableX, qRowY, qTableW, 16, "FD");
    qText("No payment-ready documents for this filter.", qTableX + 4, qRowY + 9, 10, true, [100, 116, 139]);
  }
  if (sortedDocs.length > 10) {
    qText(`Showing 1-10 of ${sortedDocs.length} agents. Full list continues on next pages.`, qTableX, 198, 8.2, true, [100, 116, 139]);
  }

  const qPanelX = 236;
  qRoundedBox(qPanelX, 34, 51, 152);
  qText("Case Detail", qPanelX + 5, 43, 12, true, [31, 41, 55]);
  if (qDetailDoc) {
    const entries = effectiveEntriesForDoc(qDetailDoc, signatures);
    const statusText = getAgentSignedStatusText(qDetailDoc, entries, exportsAllEvaluated);
    const incentive = getDocumentIncentive(qDetailDoc);
    qText(qDetailDoc.documentHash || getDocumentPrimaryCaseId(qDetailDoc), qPanelX + 5, 55, 10, true, qAccent);
    qStatusBadge(statusText, qPanelX + 27, 55);
    const details: Array<[string, string]> = [
      ["Month", qMonthLabel],
      ["Agent", qDetailDoc.agentName],
      ["Team", qDetailDoc.teamLeadName || qDetailDoc.supervisorName || "-"],
      ["Document Type", "Monthly Incentive"],
      ["Due Date", paymentCutoff],
      ["Cash / Promo", `${formatBahtAmount(incentive.cash)} / ${formatBahtAmount(incentive.promo)}`],
    ];
    let detailY = 67;
    details.forEach(([label, value]) => {
      qText(label, qPanelX + 5, detailY, 7.4, true, [100, 116, 139]);
      qWrap(value, qPanelX + 22, detailY, 23, 7.8, true, [31, 41, 55], 3.3, 2);
      detailY += 11;
    });
    qText("Signature Timeline", qPanelX + 5, detailY + 4, 9.2, true, [31, 41, 55]);
    detailY += 13;
    SIGNATURE_FLOW.forEach((role, index) => {
      const signed = getSignedEntry(entries, role);
      pdf.setFillColor(signed ? 220 : 241, signed ? 252 : 245, signed ? 231 : 249);
      pdf.circle(qPanelX + 7, detailY - 1, 2.4, "F");
      qText(String(index + 1), qPanelX + 7, detailY, 6.2, true, signed ? [22, 101, 52] : qAccent, { align: "center" });
      qText(roleThaiLabel(role), qPanelX + 12, detailY, 7.4, true, [31, 41, 55]);
      qText(signed ? "Signed" : "Pending", qPanelX + 12, detailY + 4.2, 6.8, false, signed ? [22, 101, 52] : [180, 83, 9]);
      detailY += 10;
    });
  } else {
    qWrap("No document selected.", qPanelX + 5, 56, 40, 9, true, [100, 116, 139]);
  }

  if (sortedDocs.length > 10) {
    const qFullWidths = [40, 58, 45, 18, 20, 28, 30];
    sortedDocs.slice(10).forEach((doc, index) => {
      if (index % 13 === 0) {
        pdf.addPage("a4", "landscape");
        qPageNo += 1;
        qChrome(qPageNo);
        qText(index === 0 ? "Full Agent List" : "Full Agent List (continued)", qContentLeft, 39, 15, true, [15, 23, 42]);
        qTableHeader(qContentLeft, 48, qFullWidths);
        qRowY = 57;
      }
      const entries = effectiveEntriesForDoc(doc, signatures);
      const statusText = getAgentSignedStatusText(doc, entries, exportsAllEvaluated);
      const incentive = getDocumentIncentive(doc);
      pdf.setDrawColor(226, 232, 240);
      pdf.setFillColor(index % 2 === 0 ? 248 : 255, index % 2 === 0 ? 250 : 255, index % 2 === 0 ? 252 : 255);
      pdf.rect(qContentLeft, qRowY, qFullWidths.reduce((sum, width) => sum + width, 0), 10, "FD");
      let cx = qContentLeft;
      [
        doc.documentHash || getDocumentPrimaryCaseId(doc),
        doc.agentName,
        doc.teamLeadName || doc.supervisorName || "-",
        String(doc.caseCount),
        doc.averageScore.toFixed(2),
        formatBahtAmount(incentive.cash + incentive.promo),
      ].forEach((cell, cellIndex) => {
        qWrap(cell, cx + 2, qRowY + 5.5, qFullWidths[cellIndex] - 4, 7.6, cellIndex < 2, [31, 41, 55], 3.2, 1);
        cx += qFullWidths[cellIndex];
      });
      qStatusBadge(statusText, cx + 2, qRowY + 6);
      qRowY += 10;
    });
  }

  const quickFileName = makePaymentPdfFileName(monthKey);
  savePdfFile(pdf, quickFileName);
  return quickFileName;

  const pageW = 297;
  const left = 12;
  const right = 285;
  let y = 12;

  const setFont = (size: number, bold = false, color: [number, number, number] = [31, 41, 55]) => {
    try {
      pdf.setFont("THSarabunNew", bold ? "bold" : "normal");
    } catch {}
    pdf.setFontSize(size);
    pdf.setTextColor(color[0], color[1], color[2]);
  };

  const drawText = (value: string, x: number, yy: number, size = 11, bold = false, color: [number, number, number] = [31, 41, 55]) => {
    setFont(size, bold, color);
    pdf.text(value, x, yy);
  };

  const drawColText = (
    value: string,
    x: number,
    yy: number,
    width: number,
    size = 9,
    bold = false,
    color: [number, number, number] = [31, 41, 55],
    align: "left" | "center" | "right" = "left"
  ) => {
    setFont(size, bold, color);
    const safeValue = String(value ?? "");
    if (align === "center") {
      pdf.text(safeValue, x + width / 2, yy, { align: "center" });
      return;
    }
    if (align === "right") {
      pdf.text(safeValue, x + width - 2, yy, { align: "right" });
      return;
    }
    pdf.text(safeValue, x + 2, yy);
  };

  const section = (title: string) => {
    pdf.setFillColor(109, 40, 217);
    pdf.roundedRect(left, y, right - left, 8, 2, 2, "F");
    drawText(title, left + 4, y + 5.6, 12, true, [255, 255, 255]);
    y += 12;
  };

  const smallCell = (label: string, value: string | number, x: number, yy: number, w = 62) => {
    pdf.setDrawColor(226, 232, 240);
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(x, yy, w, 12, 2, 2, "FD");
    drawText(label, x + 3, yy + 4.5, 8.5, true, [100, 116, 139]);
    drawText(String(value), x + 3, yy + 9.5, 11, true, [31, 41, 55]);
  };

  pdf.setFillColor(95, 39, 159);
  pdf.rect(0, 0, pageW, 24, "F");
  drawText("Monthly Team Summary", left, 10, 18, true, [255, 255, 255]);
  drawText("Incentive QA Monthly Payment Export", left, 17, 11, false, [255, 255, 255]);

  y = 32;
  section("Current View");
  const overallGrade = getOverallPdfGradeLabel(avgScore);
  const currentInfoRows: Array<Array<[string, string | number]>> = [
    [
      ["Month", getMonthLabel(monthKey)],
      ["Year", year],
      ["Team Cases", totalCases],
      ["Avg Score", avgScore.toFixed(2)],
      ["Overall Grade", overallGrade],
    ],
    [
      ["Payment Status", sortedDocs.length > 0 ? "Ready to Export" : "Hold"],
      ["Total Cash (THB)", formatBahtAmount(totalCashAmount)],
      ["Payment Cutoff", paymentCutoff],
      ["Export Rule", exportRuleText],
    ],
  ];

  currentInfoRows.forEach((row) => {
    const usableWidth = right - left;
    const colWidth = usableWidth / row.length;
    row.forEach(([label, value], index) => {
      const cellX = left + index * colWidth;
      drawText(label, cellX + 1, y, 8.6, true, [100, 116, 139]);
      drawText(String(value), cellX + 1, y + 5.2, 10.5, true, [15, 23, 42]);
    });
    y += 10;
  });
  y += 4;

  section("Agent Monthly Ranking");
  const headers = totalPromoAmount > 0
    ? [
        ["Seq", 9],
        ["Name", 49],
        ["Cases", 16],
        ["Avg Score", 19],
        ["Grade", 14],
        ["Incentive Amt", 26],
        ["RBH Promo", 22],
        ["Incentive Detail", 25],
        ["Critical", 13],
        ["Status", 80],
      ]
    : [
        ["Seq", 9],
        ["Name", 50],
        ["Cases", 16],
        ["Avg Score", 19],
        ["Grade", 14],
        ["Incentive Amt", 28],
        ["Incentive Detail", 26],
        ["Critical", 13],
        ["Status", 98],
      ];

  const colX: number[] = [];
  let x = left;
  headers.forEach(([, width]) => {
    colX.push(x);
    x += Number(width);
  });

  const drawHeader = () => {
    pdf.setFillColor(237, 233, 254);
    pdf.setDrawColor(221, 214, 254);
    pdf.rect(left, y, right - left, 9, "FD");
    headers.forEach(([label, width], index) => {
      const labelText = String(label);
      const align = labelText === "Name" || labelText === "Incentive Detail" || labelText === "Status" ? "left" : "center";
      drawColText(labelText, colX[index], y + 6, Number(width), 9.5, true, [88, 28, 135], align);
    });
    y += 9;
  };

  drawHeader();

  sortedDocs.forEach((doc, index) => {
    if (y > 185) {
      pdf.addPage("a4", "landscape");
      y = 14;
      section("Agent Monthly Ranking (continued)");
      drawHeader();
    }

    const entries = effectiveEntriesForDoc(doc, signatures);
    const statusText = getAgentSignedStatusText(doc, entries, exportsAllEvaluated);
    const lastSignedAt =
      SIGNATURE_FLOW.map((role) => getSignedEntry(entries, role)?.signedAt || "")
        .filter(Boolean)
        .sort()
        .pop() || "";

    pdf.setDrawColor(226, 232, 240);
    pdf.setFillColor(index % 2 === 0 ? 255 : 248, index % 2 === 0 ? 255 : 250, index % 2 === 0 ? 255 : 252);
    pdf.rect(left, y, right - left, 8, "FD");
    const incentive = getDocumentIncentive(doc);
    const row = totalPromoAmount > 0
      ? [
          String(index + 1),
          doc.agentName,
          String(doc.caseCount),
          doc.averageScore.toFixed(2),
          doc.grade,
          formatBahtAmount(incentive.cash),
          formatBahtAmount(incentive.promo),
          incentive.label,
          "No",
          statusText,
        ]
      : [
          String(index + 1),
          doc.agentName,
          String(doc.caseCount),
          doc.averageScore.toFixed(2),
          doc.grade,
          formatBahtAmount(incentive.cash),
          incentive.label,
          "No",
          statusText,
        ];
    row.forEach((value, colIndex) => {
      const maxWidth = Number(headers[colIndex][1]) - 3;
      const lines = pdf.splitTextToSize(String(value), maxWidth);
      const label = String(headers[colIndex][0]);
      const align = label === "Name" || label === "Incentive Detail" || label === "Status" ? "left" : "center";
      drawColText(Array.isArray(lines) ? lines[0] : String(lines), colX[colIndex], y + 5.5, Number(headers[colIndex][1]), 9, colIndex === 1 || label === "Incentive Amt", [31, 41, 55], align);
    });
    y += 8;
  });

  if (!sortedDocs.length) {
    pdf.setDrawColor(226, 232, 240);
    pdf.setFillColor(248, 250, 252);
    pdf.rect(left, y, right - left, 12, "FD");
    drawText("ยังไม่มี Agent ที่เข้าเงื่อนไขจ่ายในรอบนี้", left + 4, y + 7.5, 11, true, [180, 83, 9]);
    y += 14;
  }

  y += 6;
  if (y > 165) {
    pdf.addPage("a4", "landscape");
    y = 14;
  }

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
    pdf.setDrawColor(226, 232, 240);
    pdf.setFillColor(index % 2 === 0 ? 255 : 248, index % 2 === 0 ? 255 : 250, index % 2 === 0 ? 255 : 252);
    pdf.rect(left, y, right - left, 8, "FD");
    drawText(row[0], left + 3, y + 5.5, 9.5, true, [71, 85, 105]);
    drawText(row[1], left + 75, y + 5.5, 9.5, false, [31, 41, 55]);
    y += 8;
  });

  y += 6;
  if (y > 145) {
    pdf.addPage("a4", "landscape");
    y = 14;
  }
  section("Signature Validation");
  const sigHeaders = [
    ["Seq", 9],
    ["Name", 42],
    ["QA", 34],
    ["Supervisor", 34],
    ["Senior / Lead", 34],
    ["Agent Sign", 34],
    ["Document Ref.", 42],
    ["Status", 44],
  ];

  const sigX: number[] = [];
  x = left;
  sigHeaders.forEach(([, width]) => {
    sigX.push(x);
    x += Number(width);
  });

  const drawSigHeader = () => {
    pdf.setFillColor(237, 233, 254);
    pdf.setDrawColor(221, 214, 254);
    pdf.rect(left, y, right - left, 9, "FD");
    sigHeaders.forEach(([label, width], index) => {
      const labelText = String(label);
      const align = labelText === "Seq" ? "center" : "left";
      drawColText(labelText, sigX[index], y + 6, Number(width), 9, true, [88, 28, 135], align);
    });
    y += 9;
  };

  drawSigHeader();

  sortedDocs.forEach((doc, index) => {
    if (y > 185) {
      pdf.addPage("a4", "landscape");
      y = 14;
      drawSigHeader();
    }

    const entries = effectiveEntriesForDoc(doc, signatures);
    pdf.setDrawColor(226, 232, 240);
    pdf.setFillColor(index % 2 === 0 ? 255 : 248, index % 2 === 0 ? 255 : 250, index % 2 === 0 ? 255 : 252);
    pdf.rect(left, y, right - left, 8, "FD");

    const row = [
      String(index + 1),
      doc.agentName,
      getSignatureValidationRoleText(doc, entries, "QA"),
      getSignatureValidationRoleText(doc, entries, "Supervisor"),
      getSignatureValidationRoleText(doc, entries, "Senior"),
      getSignatureValidationRoleText(doc, entries, "Agent"),
      doc.documentHash,
      getSignatureValidationStatus(doc, entries, exportsAllEvaluated),
    ];
    row.forEach((value, colIndex) => {
      const maxWidth = Number(sigHeaders[colIndex][1]) - 3;
      const lines = pdf.splitTextToSize(String(value), maxWidth);
      const label = String(sigHeaders[colIndex][0]);
      const align = label === "Seq" ? "center" : "left";
      drawColText(Array.isArray(lines) ? lines[0] : String(lines), sigX[colIndex], y + 5.5, Number(sigHeaders[colIndex][1]), label === "Status" ? 7.1 : 7.6, colIndex === 1, [31, 41, 55], align);
    });
    y += 8;
  });

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
      window.alert("กรุณาวาดลายเซ็นก่อนกดยืนยันเซ็นใหม่");
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
            ปิด
          </button>
        </div>

        {savedSignatureDataUrl ? (
          <div className="mt-4 rounded-[22px] border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-sm font-black text-emerald-800">มีลายเซ็นเดิมของคุณในระบบ</div>
            <div className="mt-1 text-xs font-bold text-emerald-700">
              หากต้องการใช้ลายเซ็นนี้ ให้กดปุ่มยืนยันด้านล่าง ระบบจะบันทึกการลงนามทันที
            </div>
            <div className="mt-2 rounded-2xl border border-emerald-100 bg-white p-3">
              <img src={savedSignatureDataUrl} alt="Saved signature" className="h-16 max-w-full object-contain" />
            </div>
            <button
              type="button"
              onClick={onUseSavedSignature}
              className="mt-3 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-700"
            >
              ยืนยันใช้ลายเซ็นเดิม
            </button>
          </div>
        ) : null}

        <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">หรือวาดลายเซ็นใหม่</div>
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
          บันทึกลายเซ็นนี้ไว้ใช้ครั้งต่อไป
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
          const normalizedDoc = { ...doc, id: canonicalId, agentName: canonicalName };
          const existing = canonicalDocMap.get(canonicalId);
          if (!existing) {
            canonicalDocMap.set(canonicalId, normalizedDoc);
            return;
          }
          canonicalDocMap.set(canonicalId, mergeSignatureDocuments(existing, normalizedDoc));
        });

        const nextDocs = Array.from(canonicalDocMap.values()).sort(
          (a, b) => b.monthKey.localeCompare(a.monthKey) || a.agentName.localeCompare(b.agentName, "th")
        );
        if (!alive) return;
        setDocuments(nextDocs);
        setSelectedDocumentId((current) => current || nextDocs[0]?.id || "");
      } catch (error) {
        if (!alive) return;
        setLoadMessage(error instanceof Error ? error.message : "โหลดข้อมูล Signature ไม่สำเร็จ");
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
  }, [confirmedDocs, currentUser, pendingAppealCaseMap, search, selectedMonth, signatures, statusFilter, visibleDocuments]);

  const historyFilteredDocuments = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return documents.filter((doc) => {
      if (!canMonitorDocument(currentUser, doc)) return false;

      const monthMatch = selectedMonth === "all" || doc.monthKey === selectedMonth;
      const keywordMatch =
        !keyword ||
        doc.agentName.toLowerCase().includes(keyword) ||
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
      const dateDiff = getDocumentAuditSortTime(b) - getDocumentAuditSortTime(a);
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
  const monitorTitle = isQaUser ? "QA Monitor" : "ประวัติของฉัน";
  const monitorDescription = isQaUser
    ? "แสดงเอกสารที่ QA คนนี้รับผิดชอบ พร้อมสถานะว่าใครเซ็นแล้วและใครยังเหลือ"
    : "แสดงเฉพาะเอกสารที่เกี่ยวข้องกับสิทธิ์ของคุณเท่านั้น";

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

  const selectedDocument =
    workspaceDocuments.find((item) => item.id === selectedDocumentId) ||
    workspaceDocuments[0] ||
    activeDocuments[0] ||
    filteredDocuments[0] ||
    historyFilteredDocuments[0] ||
    null;
  const selectedEntries = selectedDocument ? effectiveEntriesForDoc(selectedDocument, signatures) : [];
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
      ? "มีเคสยื่น Appeal ที่รอ Approved อยู่ จึงยังยืนยันรับทราบไม่ได้"
      : !isAfterAppealPeriod(selectedDocument.monthKey)
        ? "เปิดให้ยืนยันรับทราบหลังวันที่ 10 ของเดือนถัดไป"
        : !canSignIdentity(currentUser, selectedDocument, "Agent")
          ? "เฉพาะ Agent ผู้ถูกประเมินเท่านั้นที่กดยืนยันรับทราบได้"
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
      window.alert("บันทึกการยืนยันรับทราบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    }
  };

  const saveDrawnSignature = async (role: SignRole, signatureDataUrl: string, saveToSavedLibrary = false) => {
    if (!selectedDocument) return false;
    if (!canSignIdentity(currentUser, selectedDocument, role)) {
      window.alert("เซ็นแทนกันไม่ได้ กรุณาให้เจ้าของลายเซ็นตาม Role เป็นผู้ลงนามเอง");
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
      window.alert("บันทึกลายเซ็นไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
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
      window.alert("Agent ต้องกดยืนยันรับทราบข้อมูลก่อน จึงจะสามารถลงนามในเอกสารของตัวเองได้");
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
      window.alert("บันทึกลายเซ็นไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
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
      window.alert("กรุณากดยืนยันรับทราบข้อมูลก่อน แล้วจึงกดเซ็นในช่อง Agent ผู้ถูกประเมิน");
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
      window.alert("รีเซ็ตลายเซ็นไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
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
      setShareMessage("คัดลอก Share Link แล้ว");
    } catch {
      window.prompt("คัดลอก Share Link นี้", link);
      setShareMessage("แสดง Share Link สำหรับคัดลอกแล้ว");
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
          "แจ้งเตือนลงนามเอกสาร QA Incentive",
          "",
          `เดือน: ${selectedDocument.monthLabel}`,
          `Agent: ${selectedDocument.agentName}`,
          "",
          `สถานะล่าสุด: ${latestStatus}`,
          "ผู้ที่ยังต้องลงนาม:",
          ...pendingRoles.map((role) => `- ${roleThaiLabel(role)}: ${getRoleSigner(selectedDocument, role)}`),
          "",
          "กดลิงก์นี้เพื่อเปิดเอกสาร:",
          createSignatureShareLink(selectedDocument, null),
          "",
          "รบกวนเข้าระบบ Signature Center เพื่อลงนามค่ะ/ครับ",
        ].join("\n")
      : [
          "แจ้งเตือนลงนามเอกสาร QA Incentive",
          "",
          `เดือน: ${selectedDocument.monthLabel}`,
          `Agent: ${selectedDocument.agentName}`,
          "",
          "สถานะล่าสุด: เอกสารลงนามครบแล้ว",
          "",
          "กดลิงก์นี้เพื่อเปิดเอกสาร:",
          createSignatureShareLink(selectedDocument, null),
        ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setShareMessage("คัดลอกข้อความแจ้งเตือนแล้ว");
    } catch {
      window.prompt("คัดลอกข้อความนี้เพื่อแจ้งเตือน", text);
      setShareMessage("แสดงข้อความแจ้งเตือนสำหรับคัดลอกแล้ว");
    }

    window.setTimeout(() => setShareMessage(""), 3000);
  };

  const shareSignatureStatus = async () => {
    if (!selectedDocument) return;
    const entries = effectiveEntriesForDoc(selectedDocument, signatures);
    const lines = SIGNATURE_FLOW.map((role) => {
      const signed = getSignedEntry(entries, role);
      return `${signed ? "✅" : "❌"} ${roleThaiLabel(role)}: ${signed ? signed.signerName : "ยังไม่ลงนาม"}`;
    });
    const pendingLines = SIGNATURE_FLOW
      .filter((role) => !getSignedEntry(entries, role))
      .map((role) => `- ${roleThaiLabel(role)}: ${getRoleSigner(selectedDocument, role)}`);

    const text = [
      `เอกสาร Signature เดือน ${selectedDocument.monthLabel}`,
      `Agent: ${selectedDocument.agentName}`,
      "",
      "สถานะการลงนาม:",
      ...lines,
      "",
      pendingLines.length ? "ผู้ที่ยังไม่ลงนาม:" : "สถานะ: ลงนามครบแล้ว",
      ...(pendingLines.length ? pendingLines : []),
      "",
      pendingLines.length
        ? "รบกวนผู้ที่ยังไม่ลงนาม เข้าระบบเพื่อเซ็นเอกสารให้เรียบร้อยค่ะ/ครับ"
        : "เอกสารนี้ลงนามครบแล้วค่ะ/ครับ",
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setShareMessage("คัดลอกข้อความแชร์แล้ว");
    } catch {
      window.prompt("คัดลอกข้อความนี้เพื่อแชร์", text);
      setShareMessage("แสดงข้อความสำหรับคัดลอกแล้ว");
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

  const generatePdf = () => {
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

    const pageW = 297;
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
    const left = 12;
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
      line("หมายเหตุ: เดือน Jan-Apr เป็นรอบประวัติของเอกสาร ระบบแสดงสถานะ Completed อัตโนมัติ", 10);
    }
    if (hasPendingAppeal) {
      line(`หมายเหตุ: มี ${selectedPendingAppeals.length} เคสที่ยื่น Appeal และรอ Approved จึงยังไม่สามารถยืนยันรับทราบหรือเซ็นได้`, 10);
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
    line("รับทราบผลการประเมินประจำเดือน โดยลงนามตามตำแหน่งด้านล่าง", 11);

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
      text(`วันที่ ${safePdfDate(role)}`, x + 4, yy + 45, 10);
      text(`Status: ${safePdfStatus(role)}`, x + 4, yy + 51, 10, true, safePdfStatus(role) === "Signed" ? [5, 150, 105] : [180, 83, 9]);
    };

    const boxW = 86;
    const boxH = 54;
    drawSignatureBox(left, y, boxW, boxH, "Agent", "Agent ผู้ถูกประเมิน");
    drawSignatureBox(left + 98, y, boxW, boxH, "Senior", "Senior หัวหน้าทีมผู้ถูกประเมิน");
    y += boxH + 8;
    drawSignatureBox(left, y, boxW, boxH, "Supervisor", "Supervisor หัวหน้าแผนก");
    drawSignatureBox(left + 98, y, boxW, boxH, "QA", "QA ผู้ตรวจสอบ");

    y += boxH + 8;
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(left, y, right - left, 13, 3, 3, "F");
    text("PDF จะแสดงชื่อเฉพาะผู้ที่ Signed แล้วเท่านั้น หากยังไม่ Signed จะแสดงเป็น -", left + 4, y + 8, 10, false, [71, 85, 105]);

    const fileName = `QA Score Monthly ${selectedDocument.monthLabel}_${selectedDocument.agentName.replace(/[^a-zA-Z0-9ก-๙]+/g, "_")}.pdf`;
    downloadBlob(pdf.output("blob"), fileName);
    setPdfMessage(`Generated ${fileName}`);
    window.setTimeout(() => setPdfMessage(""), 3500);
  };

  const generatePaymentExcel = () => {
    if (selectedMonth === "all") {
      window.alert("กรุณาเลือกเดือนก่อน Generate Excel");
      return;
    }
    if (!selectedMonthPaymentExportDocs.length) {
      window.alert("ยังไม่มี Agent ที่เข้าเงื่อนไข Export ในเดือนนี้");
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
      window.alert("กรุณาเลือกเดือนก่อน Generate Payment PDF");
      return;
    }
    if (!selectedMonthPaymentExportDocs.length) {
      window.alert("ยังไม่มี Agent ที่เข้าเงื่อนไข Export ในเดือนนี้");
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
          <div className="text-5xl">🖊️</div>
          <div className="mt-3 text-lg font-black text-violet-800">กำลังโหลด Signature Center</div>
          <div className="mt-1 text-sm text-slate-500">ระบบกำลังเตรียมเอกสารที่ต้องรับทราบ</div>
        </div>
      </div>
    );
  }

  if (loadMessage) {
    return (
      <div className="rounded-[30px] border border-rose-200 bg-rose-50 p-6 text-rose-700">
        <div className="text-lg font-black">โหลดข้อมูล Signature ไม่สำเร็จ</div>
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
                ติดตามรายการเอกสารที่ต้องลงนาม แยกตามเคสและเดือน เพื่อให้ง่ายต่อการตรวจสอบและติดตามสถานะ
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
        subtitle="Preview คะแนนรายเดือนและ Case Detail 10 เคส ก่อนเข้าสู่ขั้นตอนเซ็นรับทราบ"
      />
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {[
          { label: "เอกสารที่เห็นได้", value: summary.total, tone: "text-slate-900" },
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
          <span className="text-slate-300">→</span>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-violet-700">2. Confirm</span>
          <span className="text-slate-300">→</span>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-violet-700">3. QA</span>
          <span className="text-slate-300">→</span>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-violet-700">4. Supervisor</span>
          <span className="text-slate-300">→</span>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-violet-700">5. Team Lead</span>
          <span className="text-slate-300">→</span>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-violet-700">6. Agent</span>
        </div>
        <div className="mt-3 text-sm leading-6 text-slate-500">
          วันที่ 1-10 ยังอยู่ช่วง Appeal จึงยังยืนยันรับทราบและเซ็นไม่ได้ / หลังวันที่ 10 ผู้ถูกประเมินเท่านั้นที่กดยืนยันได้ / จ่ายรอบปัจจุบันเฉพาะคนที่เซ็นครบภายในวันที่ 15 / เซ็นหลังจากนั้นไปรอบจ่ายถัดไป
        </div>
      </div>

      <div className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-[0_16px_40px_rgba(88,28,135,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">Monthly Incentive Payment Export</div>
            <div className="mt-1 text-xl font-black text-slate-950">เอกสารส่งจ่าย Incentive รายเดือน (PDF ตาม Template)</div>
            <div className="mt-1 text-sm leading-6 text-slate-500">
              หลังวันที่ 15 ระบบจะออกไฟล์เฉพาะ Agent ที่เซ็นครบทุก Role ภายในกำหนดเท่านั้น คนที่มาเซ็นหลังวันที่ 15 จะเข้ารอบจ่ายถัดไป
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
                ? "กรุณาเลือกเดือนก่อน"
                : selectedMonthExportAllEvaluated
                  ? `May export พิเศษ: รวม Agent ที่ถูกประเมินทั้งหมด ${selectedMonthExportDocs.length} คน / รวมบาท ${formatBahtAmount(selectedMonthPaymentExportDocs.reduce((sum, doc) => sum + getDocumentIncentive(doc).cash, 0))} บาท`
                  : `รายการทั้งหมด ${selectedMonthTotalDocs} คน / เซ็นล่าช้า ${selectedMonthLateSignedDocs.length} คน / รวมบาทในรอบนี้ ${formatBahtAmount(selectedMonthPaymentExportDocs.reduce((sum, doc) => sum + getDocumentIncentive(doc).cash, 0))} บาท`}
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
            เงื่อนไขยังไม่ครบ: ต้องเลือกเดือน และต้องมีอย่างน้อย 1 Agent ที่เข้าเงื่อนไข Export
          </div>
        ) : selectedMonthExportAllEvaluated ? (
          <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold leading-6 text-sky-800">
            May 2026 เปิด Export พิเศษ: Generate ได้ทันทีจาก Agent ทุกคนที่มีผลประเมิน โดยไม่ต้องรอเซ็นครบ
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
                เฉพาะเอกสารที่ Role ของคุณยังต้องลงนาม
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-[30px] border border-violet-100 bg-white p-5 shadow-[0_20px_54px_rgba(88,28,135,0.08)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">Signature Workspace</div>
            <div className="mt-1 text-2xl font-black text-slate-950">รายการเอกสารลงนาม แยกตามเดือน</div>
            <div className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              ติดตามรายการเอกสารที่ต้องลงนาม แยกตามเคสและเดือน เพื่อให้ง่ายต่อการตรวจสอบสถานะ คลิกที่แถวเพื่อเปิดรายละเอียดด้านล่าง
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
              {isQaUser ? "QA Monitor" : "ประวัติ"} ({historyFilteredDocuments.length})
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_150px_180px_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหา Document Ref. / Case ID / Agent / เดือน / ทีม"
            className="rounded-2xl border border-violet-100 bg-violet-50/40 px-4 py-3 text-sm font-semibold outline-none transition focus:border-violet-400 focus:bg-white"
          />
          <select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-violet-400"
          >
            <option value="all">ทุกเดือน</option>
            {monthOptions.map((month) => (
              <option key={month} value={month}>{getMonthLabel(month)}</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(event) => setSelectedYear(event.target.value)}
            className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-violet-400"
          >
            <option value="all">ทุกปี</option>
            {yearOptions.map((year) => (
              <option key={year} value={year}>{Number(year) + 543}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-violet-400"
          >
            <option value="all">ทุกสถานะ</option>
            <option value="preview">รอ Confirm Preview</option>
            <option value="my-turn">รอฉันลงนาม</option>
            <option value="pending">รอเซ็น</option>
            <option value="ready">พร้อมจ่าย Incentive</option>
            <option value="appeal-pending">มี Appeal รอ Approved</option>
            <option value="expired">เกินกำหนด</option>
          </select>
          <button
            type="button"
            onClick={clearWorkspaceFilters}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            ล้างตัวกรอง
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {([
            ["all", "ทั้งหมด"],
            ["pending", "รอเซ็น"],
            ["signed", "เซ็นแล้ว"],
            ["in-progress", "ค้างดำเนินการ"],
            ["expired", "เกินกำหนด"],
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
            { label: "รายการทั้งหมด", value: workspaceSummary.total, tone: "text-slate-950" },
            { label: "รอเซ็น", value: workspaceSummary.pending, tone: "text-amber-700" },
            { label: "เซ็นแล้ว", value: workspaceSummary.signed, tone: "text-emerald-700" },
            { label: "เกินกำหนด", value: workspaceSummary.expired, tone: "text-rose-700" },
            { label: "ค้างดำเนินการ", value: workspaceSummary.inProgress, tone: "text-sky-700" },
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
              <div>เดือน</div>
              <div>Document Ref.</div>
              <div>ผู้ถูกประเมิน</div>
              <div>ทีม</div>
              <div>ประเภทเอกสาร</div>
              <div>สถานะ</div>
              <div>Audit Date</div>
              <div>กำหนดเซ็น</div>
              <div>ดำเนินการ</div>
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
                        <div className="truncate font-black text-violet-800" title={getDocumentPrimaryCaseId(doc)}>{getDocumentPrimaryCaseId(doc)}</div>
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
                          <span className="rounded-2xl border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-700">เปิดรายละเอียด</span>
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
            <div className="text-base font-black text-slate-700">ไม่พบรายการเอกสารตามตัวกรองที่เลือก</div>
            <div className="mt-1 text-sm font-semibold text-slate-500">ลองล้างตัวกรองหรือเลือกเดือนอื่น</div>
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 text-sm font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div>
            แสดง {workspaceDocuments.length ? (safeCurrentPage - 1) * rowsPerPage + 1 : 0}-{Math.min(safeCurrentPage * rowsPerPage, workspaceDocuments.length)} จาก {workspaceDocuments.length} รายการ
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
              ถัดไป
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
                <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">รายละเอียดเอกสารที่เลือก</div>
                <div className="mt-1 text-lg font-black text-slate-950">
                  {getDocumentPrimaryCaseId(selectedDocument)} • {selectedDocument.agentName}
                </div>
                <div className="mt-1 text-xs font-semibold text-slate-500">
                  {selectedDocument.monthLabel} / {getDocumentTypeLabel(selectedDocument)} / ผู้ลงนามปัจจุบัน: {getPendingRoles(selectedEntries)[0] ? roleThaiLabel(getPendingRoles(selectedEntries)[0]) : "ครบแล้ว"}
                </div>
              </div>
              <span className="rounded-2xl bg-violet-700 px-4 py-2 text-xs font-black text-white">
                {workspaceDetailOpen ? "ย่อรายละเอียด" : "เปิดรายละเอียด"}
              </span>
            </button>

            {workspaceDetailOpen ? (
              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    ["Document Ref.", getDocumentPrimaryCaseId(selectedDocument)],
                    ["เดือนเอกสาร", selectedDocument.monthLabel],
                    ["ผู้ถูกประเมิน", selectedDocument.agentName],
                    ["ทีม", selectedDocument.teamName || "-"],
                    ["ประเภทเอกสาร", getDocumentTypeLabel(selectedDocument)],
                    ["สถานะ", getWorkspaceStatusLabel(getWorkspaceStatus(selectedDocument, selectedEntries))],
                    ["Audit Date ล่าสุด", formatDateOnly(getSignatureCreatedDate(selectedDocument))],
                    ["กำหนดเซ็น", formatDateOnly(getSignatureDueDate(selectedDocument.monthKey))],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white bg-white/80 px-4 py-3 shadow-sm">
                      <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">{label}</div>
                      <div className="mt-1 break-words text-sm font-black text-slate-900">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-[22px] border border-white bg-white/90 p-4 shadow-sm">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">ลำดับการลงนาม</div>
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
                              {signedEntry ? `เซ็นแล้วโดย ${signedEntry.signedBy}` : isCurrent ? "รอดำเนินการขั้นนี้" : "ยังไม่ถึงขั้นตอน / ยังไม่เซ็น"}
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
                      ไปที่พื้นที่ลงนาม / ตรวจเอกสาร
                    </button>
                    <button
                      type="button"
                      onClick={() => setWorkspaceDetailOpen(false)}
                      className="rounded-2xl border border-violet-200 bg-white px-4 py-3 text-xs font-black text-violet-700"
                    >
                      ปิดแถบรายละเอียด
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
            {documentView === "history" ? monitorTitle : "คิวที่ต้องเซ็นของฉัน"}
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
              {isQaUser ? "QA Monitor" : "ประวัติ"} ({historyFilteredDocuments.length})
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
              <option value="all">ทุกเดือน</option>
              {monthOptions.map((month) => (
                <option key={month} value={month}>{getMonthLabel(month)}</option>
              ))}
            </select>
            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold leading-5 text-rose-700">
              {documentView === "history"
                ? monitorDescription
                : "แสดงเฉพาะเอกสารที่ Role ของคุณยังต้องลงนามเท่านั้น"}
            </div>
            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold leading-5 text-rose-700">
              {isQaUser
                ? "QA Monitor ใช้เช็กสถานะรวมของเอกสาร QA ที่คุณรับผิดชอบ โดยไม่รวมเอกสารของ QA คนอื่น"
                : "แสดงเฉพาะเอกสารที่ Role ของคุณยังต้องลงนามเท่านั้น"}
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-violet-400"
            >
              <option value="all">ทุกสถานะ</option>
              <option value="preview">รอ Confirm Preview</option>
              <option value="my-turn">รอฉันลงนาม</option>
              <option value="pending">รอเซ็น</option>
              <option value="ready">พร้อมจ่าย Incentive</option>
              <option value="appeal-pending">มี Appeal รอ Approved</option>
              <option value="expired">เกินวันที่ 15 / ไม่ครบ</option>
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
                  ? "ยังไม่มีประวัติเอกสารตามเงื่อนไขที่เลือก"
                  : "ยังไม่มีคิวเซ็นของคุณตามเงื่อนไขที่เลือก"}
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
                  ? `เช็กแล้ว: คุณเซ็นเอกสารนี้แล้วใน Role ${mySignedRoles.map(roleThaiLabel).join(", ")}`
                  : "เช็กแล้ว: ยังไม่พบลายเซ็นของคุณในเอกสารนี้"}
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
                <div className="text-base font-black">มีเคส Appeal รอ Approved</div>
                <div className="mt-1 text-sm font-semibold leading-6">
                  เอกสารยังโชว์ได้และ Generate PDF ได้ แต่ยังยืนยันรับทราบไม่ได้ และยังเซ็นไม่ได้จนกว่า Appeal จะถูก Approved หรือ Rejected ครบทุกเคส
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
                      ยืนยันรับทราบข้อมูล
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
                    <div className="mt-1 text-xl font-black text-slate-950">เปิดให้ทุก Role ลงนามได้อิสระหลังปิด Appeal</div>
                    {!previewConfirmed ? (
                      <div className="mt-1 text-xs font-bold text-amber-600">
                        Agent ต้องกดยืนยันรับทราบก่อนลงนามของตัวเอง แต่ Role อื่นลงนามได้โดยไม่ต้องรอ Agent
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={shareSignatureStatus}
                      className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-black text-violet-700 transition hover:bg-violet-100"
                    >
                      แชร์สถานะผู้ยังไม่เซ็น
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
                          : "ไม่เหลือ Role ที่ต้องเซ็นต่อ"}
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
                        คัดลอกข้อความแจ้งเตือน
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
                            <div className="mt-1 text-xs font-semibold text-amber-600">Agent ต้องกดยืนยันรับทราบก่อนลงนาม</div>
                          ) : status === "Locked" ? (
                            <div className="mt-1 text-xs font-semibold text-slate-400">เปิดเซ็นหลังวันที่ 10 ของเดือนถัดไป</div>
                          ) : activeResetAfterDeadline ? (
                            <div className="mt-1 text-xs font-semibold text-violet-600">
                              รีเซ็ตแล้ว เซ็นได้ถึง {resetExpiresAt ? formatDateTime(resetExpiresAt.toISOString()) : `${SIGNATURE_RESET_WINDOW_DAYS} วัน`}
                            </div>
                          ) : resetWindowExpired ? (
                            <div className="mt-1 text-xs font-semibold text-rose-600">
                              รอบรีเซ็ตหมดอายุแล้ว กด Reset ใหม่ได้
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
                                    ? "ตรวจสอบลายเซ็นเดิม"
                                    : "เพิ่มลายเซ็นจริง"
                                  : "เฉพาะเจ้าของลายเซ็น"
                              : allowSign
                                ? isAgentBlockedByConfirm
                                  ? "กดยืนยันก่อนเซ็น"
                                  : savedSignatureDataUrl
                                  ? "ตรวจสอบลายเซ็นเดิม"
                                  : timeline === "Signature Deadline Passed"
                                    ? "วาดและลงนามล่าช้า"
                                    : "วาดและลงนาม"
                                : status === "Locked"
                                  ? "ยังไม่เปิดให้เซ็น"
                                  : status === "Expired"
                                    ? "เกินกำหนด"
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
                  PDF ออกได้ทุกสถานะ แต่ลายเซ็นจริงต้องให้เจ้าของ Role เซ็นเองเท่านั้น เมื่อบันทึกลายเซ็นจริงแล้วจะกลับมาแก้เองไม่ได้
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
              window.alert("เซ็นแทนกันไม่ได้ กรุณาให้เจ้าของลายเซ็นตาม Role เป็นผู้ลงนามเอง");
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
              window.alert("เซ็นแทนกันไม่ได้ กรุณาให้เจ้าของลายเซ็นตาม Role เป็นผู้ลงนามเอง");
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

