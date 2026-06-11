import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import PageHero from "./PageHero";
import { registerTHSarabunNew } from "./THSarabunNew-jsPDF";
import { type UsageLogEvent } from "./usageLog";
import { fetchAppealEvents } from "./appealStore";
import { buildAppealRequests } from "./AppealRequestsMockup";
import { getIncentiveByGrade, scoreToGrade } from "./lib/scoreIncentivePolicy";

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

type SignatureEntry = {
  role: SignRole;
  signerName: string;
  signedBy: string;
  signedAt: string;
  status: SignStatus;
  note?: string;
  signatureDataUrl?: string;
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
  if (isHistoricalPaidPeriod(monthKey)) return true;
  const window = getSignatureWindow(monthKey);
  return now > window.dueAt;
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
  return resolveFallbackSignerName(value, "Phommarin Thaithom");
}

function resolveSeniorNameForAgent(account: UserAccountSnapshot | undefined, value: unknown) {
  const leadName = normalizeText(account?.teamLead || value);
  if (!isGenericRoleName(leadName)) return leadName;
  if (!account || isSuspendedAccount(account)) return "Phommarin Thaithom";
  return "Phommarin Thaithom";
}

function readSignatureStore(): Record<string, SignatureEntry[]> {
  try {
    return JSON.parse(window.localStorage.getItem(SIGNATURE_STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeSignatureStore(value: Record<string, SignatureEntry[]>) {
  window.localStorage.setItem(SIGNATURE_STORAGE_KEY, JSON.stringify(value));
}

function readConfirmedStore(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(SIGNATURE_CONFIRM_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeConfirmedStore(value: Record<string, string>) {
  window.localStorage.setItem(SIGNATURE_CONFIRM_KEY, JSON.stringify(value));
}

function readSignatureLibraryStore(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(SIGNATURE_LIBRARY_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeSignatureLibraryStore(value: Record<string, string>) {
  window.localStorage.setItem(SIGNATURE_LIBRARY_KEY, JSON.stringify(value));
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

function buildDocuments(rows: unknown[][], accounts: UserAccountSnapshot[]) {
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
    const finalScore = Number(helper.get(row, ["Final Score", "Total Score", "QA Score", "Score"], ""));
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

    if (Number.isFinite(finalScore)) current.scores.push(score);
    if (caseId && caseId !== "-" && !current.caseIds.has(caseId)) {
      current.caseIds.add(caseId);
      current.cases.push({
        caseId,
        auditDate: auditDate ? auditDate.toLocaleDateString("th-TH") : "-",
        inquiry,
        finalScore: score,
        grade: scoreToGrade(score, monthKey),
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
        cases: item.cases.slice(0, 10),
      };
      return { ...base, documentHash: createDocumentHash(base) };
    })
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey) || a.agentName.localeCompare(b.agentName));
}

function getQaSignerNameByMonth(monthKey: string, fallback = "Quality Assurance") {
  if (monthKey >= "2026-03") return "Songpon Phothong";
  if (monthKey === "2026-01" || monthKey === "2026-02") return "Phommarin Thaithom";
  return fallback || "Quality Assurance";
}

function getRoleSigner(doc: SignatureDocument, role: SignRole) {
  if (role === "QA") return getQaSignerNameByMonth(doc.monthKey, doc.qaName);
  if (role === "Supervisor") return resolveSupervisorName(doc.supervisorName);
  if (role === "Senior") return resolveFallbackSignerName(doc.seniorName, "Phommarin Thaithom");
  return doc.agentName;
}

function getSignedEntry(entries: SignatureEntry[], role: SignRole) {
  return entries.find((entry) => entry.role === role && entry.status === "Signed");
}

function getCurrentStep(entries: SignatureEntry[]) {
  return SIGNATURE_FLOW.find((role) => !getSignedEntry(entries, role)) || null;
}

function getPreviousStep(role: SignRole) {
  const index = SIGNATURE_FLOW.indexOf(role);
  return index > 0 ? SIGNATURE_FLOW[index - 1] : null;
}

function roleThaiLabel(role: SignRole) {
  if (role === "QA") return "QA ผู้ตรวจสอบ";
  if (role === "Supervisor") return "Supervisor";
  if (role === "Senior") return "Senior / Team Lead";
  return "Agent ผู้ถูกประเมิน";
}

function canSignIdentity(currentUser: CurrentUser, doc: SignatureDocument, role: SignRole) {
  const signerName = getRoleSigner(doc, role);
  if (role === "QA") return currentUser.role === "Quality Assurance" || isSamePerson(currentUser.displayName, signerName);
  if (role === "Supervisor") return currentUser.role === "Supervisor" || isSamePerson(currentUser.displayName, signerName) || isSamePerson(currentUser.agentName, signerName);
  if (role === "Senior") return currentUser.role === "Senior" || isSamePerson(currentUser.displayName, signerName) || isSamePerson(currentUser.agentName, signerName);
  return isSamePerson(currentUser.agentName, doc.agentName) || isSamePerson(currentUser.displayName, doc.agentName);
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
  const currentStep = getCurrentStep(entries);

  // Queue-only visibility:
  // Each role sees only the documents that are currently sent to that role for signing.
  // Completed docs and docs waiting for other roles are hidden from the Document Queue.
  // Payment Export still uses all documents from the raw data and is not affected by this queue filter.
  if (!currentStep) return false;
  if (!isAfterAppealPeriod(doc.monthKey)) return false;

  return canSignIdentity(currentUser, doc, currentStep);
}

function statusForRole(entries: SignatureEntry[], role: SignRole, monthKey: string): SignatureStepStatus {
  if (getSignedEntry(entries, role)) return "Signed";
  if (isHistoricalPaidPeriod(monthKey)) return "Signed";
  const timeline = getTimelineStatus(monthKey);
  const currentStep = getCurrentStep(entries);
  if (timeline === "Appeal Period Open" || timeline === "Waiting Signature Window") return "Locked";
  if (timeline === "Signature Deadline Passed") return currentStep === role ? "Expired" : "Waiting";
  if (currentStep === role) return "Pending";
  return "Waiting";
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
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
  const dashboardMonthlyTrend: Record<string, { totalCases: number; avgScore: number }> = {
    "2026-01": { totalCases: 100, avgScore: 77.10 },
    "2026-02": { totalCases: 100, avgScore: 77.35 },
    "2026-03": { totalCases: 120, avgScore: 83.48 },
    "2026-04": { totalCases: 120, avgScore: 86.16 },
  };

  const lockedSummary = dashboardMonthlyTrend[monthKey];
  if (lockedSummary) return lockedSummary;

  const sourceDocs = allMonthDocs.length ? allMonthDocs : fallbackDocs;
  const caseScores = sourceDocs.flatMap((doc) =>
    doc.cases
      .map((item) => Number(item.finalScore))
      .filter((score) => Number.isFinite(score))
  );

  const totalCases = caseScores.length
    ? caseScores.length
    : sourceDocs.reduce((sum, doc) => sum + Math.max(Number(doc.caseCount) || 0, 0), 0);

  let avgScore = 0;
  if (caseScores.length) {
    avgScore = caseScores.reduce((sum, score) => sum + score, 0) / caseScores.length;
  } else {
    const weightedScore = sourceDocs.reduce(
      (sum, doc) => sum + (Number(doc.averageScore) || 0) * Math.max(Number(doc.caseCount) || 0, 0),
      0
    );
    const weightedCases = sourceDocs.reduce((sum, doc) => sum + Math.max(Number(doc.caseCount) || 0, 0), 0);
    avgScore = weightedCases > 0 ? weightedScore / weightedCases : 0;
  }

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
  const totalCases = dashboardSummary.totalCases;
  const avgScore = dashboardSummary.avgScore;
  const criticalCases = 0;
  const totalCashAmount = sortedDocs.reduce((sum, doc) => sum + getDocumentIncentive(doc).cash, 0);
  const totalPromoAmount = sortedDocs.reduce((sum, doc) => sum + getDocumentIncentive(doc).promo, 0);
  const year = /^\d{4}-\d{2}$/.test(monthKey) ? monthKey.slice(0, 4) : "";

  const aoa: unknown[][] = [
    ["Monthly Team Summary"],
    ["Selected month overview for incentive payment. Only agents with completed signatures and Ready to Pay status are included."],
    [],
    ["Current View"],
    [],
    ["Month", getMonthLabel(monthKey), null, "Year", year, null, "Team Cases", totalCases],
    [],
    ["Avg Score", Number(avgScore.toFixed(2)), null, "Critical Cases", criticalCases, null, "Payment Status", sortedDocs.length > 0 ? "Ready to Export" : "Hold"],
    [null, null, null, null, null, null, "Export Rule", "Pay only agents signed complete by day 15"],
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
    const qaSigner = getSignedEntry(entries, "QA") ? getRoleSigner(doc, "QA") : "-";
    const supervisorSigner = getSignedEntry(entries, "Supervisor") ? getRoleSigner(doc, "Supervisor") : "-";
    const seniorSigner = getSignedEntry(entries, "Senior") ? getRoleSigner(doc, "Senior") : "-";
    const agentSigner = getSignedEntry(entries, "Agent")?.signerName || "-";
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
          `Signed Complete / ${lastSignedAt ? formatDateTime(lastSignedAt) : "-"}`,
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
          `Signed Complete / ${lastSignedAt ? formatDateTime(lastSignedAt) : "-"}`,
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
    ["Document Rule", "Include only agents signed complete by day 15 and no pending Appeal remains. Late signatures move to next payment cycle."],
    [],
    ["Signature Validation"],
    ["Seq", "Agent", "QA", "Supervisor", "Senior / Team Lead", "Agent Signature", "Document Ref.", "Status"],
  );

  sortedDocs.forEach((doc, index) => {
    const entries = effectiveEntriesForDoc(doc, signatures);
    aoa.push([
      index + 1,
      doc.agentName,
      getSignedEntry(entries, "QA") ? getRoleSigner(doc, "QA") : "-",
      getSignedEntry(entries, "Supervisor") ? getRoleSigner(doc, "Supervisor") : "-",
      getSignedEntry(entries, "Senior") ? getRoleSigner(doc, "Senior") : "-",
      getSignedEntry(entries, "Agent")?.signerName || "-",
      doc.documentHash.slice(0, 10),
      "Completed",
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
  smallCell("Month", getMonthLabel(monthKey), left, y, 66);
  smallCell("Year", year, left + 70, y, 40);
  smallCell("Team Cases", totalCases, left + 114, y, 44);
  smallCell("Avg Score", avgScore.toFixed(2), left + 162, y, 42);
  smallCell("Payment Status", sortedDocs.length > 0 ? "Ready to Export" : "Hold", left + 208, y, 64);
  y += 17;
  smallCell("Total Cash (THB)", formatBahtAmount(totalCashAmount), left, y, 54);
  if (totalPromoAmount > 0) {
    smallCell("RBH Promo (THB)", formatBahtAmount(totalPromoAmount), left + 58, y, 56);
    smallCell("Payment Cutoff", paymentCutoff, left + 118, y, 68);
    smallCell("Export Rule", "Pay only signed complete by day 15", left + 190, y, 82);
  } else {
    smallCell("Payment Cutoff", paymentCutoff, left + 58, y, 72);
    smallCell("Export Rule", "Pay only signed complete by day 15", left + 134, y, 138);
  }
  y += 20;

  section("Agent Monthly Ranking");
  const headers = totalPromoAmount > 0
    ? [
        ["Seq", 10],
        ["Name", 54],
        ["Cases", 18],
        ["Avg Score", 24],
        ["Grade", 16],
        ["Incentive Amt", 30],
        ["RBH Promo", 26],
        ["Incentive Detail", 46],
        ["Critical", 18],
        ["Status", 31],
      ]
    : [
        ["Seq", 10],
        ["Name", 58],
        ["Cases", 22],
        ["Avg Score", 26],
        ["Grade", 18],
        ["Incentive Amt", 36],
        ["Incentive Detail", 58],
        ["Critical", 22],
        ["Status", 23],
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
          `Signed / ${lastSignedAt ? formatDateTime(lastSignedAt) : "-"}`,
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
          `Signed / ${lastSignedAt ? formatDateTime(lastSignedAt) : "-"}`,
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
    ["Document Rule", "Include only agents signed complete by day 15 and no pending Appeal remains. Late signatures move to next payment cycle."],
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
    ["Seq", 10],
    ["Name", 46],
    ["QA", 34],
    ["Supervisor", 35],
    ["Senior / Lead", 45],
    ["Agent Sign", 40],
    ["Document Ref.", 28],
    ["Status", 32],
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
      const align = labelText === "Name" || labelText === "Document Ref." || labelText === "Status" ? "left" : "center";
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
      getSignedEntry(entries, "QA") ? getRoleSigner(doc, "QA") : "-",
      getSignedEntry(entries, "Supervisor") ? getRoleSigner(doc, "Supervisor") : "-",
      getSignedEntry(entries, "Senior") ? getRoleSigner(doc, "Senior") : "-",
      getSignedEntry(entries, "Agent")?.signerName || "-",
      doc.documentHash,
      "Completed",
    ];
    row.forEach((value, colIndex) => {
      const maxWidth = Number(sigHeaders[colIndex][1]) - 3;
      const lines = pdf.splitTextToSize(String(value), maxWidth);
      const label = String(sigHeaders[colIndex][0]);
      const align = label === "Name" || label === "Document Ref." || label === "Status" ? "left" : "center";
      drawColText(Array.isArray(lines) ? lines[0] : String(lines), sigX[colIndex], y + 5.5, Number(sigHeaders[colIndex][1]), 7.6, colIndex === 1, [31, 41, 55], align);
    });
    y += 8;
  });

  const fileName = makePaymentPdfFileName(monthKey);
  downloadBlob(pdf.output("blob"), fileName);
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
  onUseSavedSignature?: () => void;
  onSave: (dataUrl: string, saveToLibrary: boolean) => void;
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
      window.alert("กรุณาวาดลายเซ็นก่อนกด Save Signature");
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
            <div className="mt-2 rounded-2xl border border-emerald-100 bg-white p-3">
              <img src={savedSignatureDataUrl} alt="Saved signature" className="h-16 max-w-full object-contain" />
            </div>
            <button
              type="button"
              onClick={onUseSavedSignature}
              className="mt-3 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-700"
            >
              ใช้ลายเซ็นเดิม
            </button>
          </div>
        ) : null}

        <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50 p-3">
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
            Save Signature
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
  const [statusFilter, setStatusFilter] = useState("all");
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
        for (const fileName of RAW_DATA_FILES) {
          const response = await fetch(fileName, { cache: "no-store" });
          if (!response.ok) continue;
          const buffer = await response.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
          const sheet = workbook.Sheets["Raw_Data"] || workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
          loadedDocs.push(...buildDocuments(rows, accounts));
        }
        if (!loadedDocs.length) throw new Error("ไม่พบข้อมูลจากไฟล์ QA Raw Data");
        const docMap = new Map<string, SignatureDocument>();
        loadedDocs.forEach((doc) => docMap.set(doc.id, doc));

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
          const keep = existing.caseCount >= normalizedDoc.caseCount ? existing : normalizedDoc;
          const other = existing.caseCount >= normalizedDoc.caseCount ? normalizedDoc : existing;
          canonicalDocMap.set(canonicalId, {
            ...keep,
            cases: keep.cases.length ? keep.cases : other.cases,
            averageScore: keep.caseCount > 0 ? keep.averageScore : other.averageScore,
            grade: keep.caseCount > 0 ? keep.grade : other.grade,
            eligibleByScore: keep.caseCount > 0 ? keep.eligibleByScore : other.eligibleByScore,
            caseCount: Math.max(keep.caseCount, other.caseCount),
          });
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
    writeSignatureStore(signatures);
  }, [signatures]);

  useEffect(() => {
    writeConfirmedStore(confirmedDocs);
  }, [confirmedDocs]);

  useEffect(() => {
    writeSignatureLibraryStore(signatureLibrary);
  }, [signatureLibrary]);

  const monthOptions = useMemo(() => Array.from(new Set(documents.map((item) => item.monthKey))).sort().reverse(), [documents]);

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
      const currentStep = getCurrentStep(entries);
      const isComplete = signedCount === SIGNATURE_FLOW.length;
      const timeline = getTimelineStatus(doc.monthKey);
      const statusMatch =
        statusFilter === "all" ||
        (statusFilter === "my-turn" && currentStep && canSignIdentity(currentUser, doc, currentStep) && isSigningAllowedByDate(doc.monthKey)) ||
        (statusFilter === "preview" && !confirmedDocs[doc.id] && !isHistoricalPaidPeriod(doc.monthKey)) ||
        (statusFilter === "ready" && isComplete && doc.eligibleByScore) ||
        (statusFilter === "pending" && !isComplete) ||
        (statusFilter === "expired" && timeline === "Signature Deadline Passed" && !isComplete) ||
        (statusFilter === "appeal-pending" && doc.cases.some((item) => pendingAppealCaseMap.has(item.caseId)));
      const monthMatch = selectedMonth === "all" || doc.monthKey === selectedMonth;
      const keywordMatch =
        !keyword ||
        doc.agentName.toLowerCase().includes(keyword) ||
        doc.seniorName.toLowerCase().includes(keyword) ||
        doc.supervisorName.toLowerCase().includes(keyword);
      return statusMatch && monthMatch && keywordMatch;
    });
  }, [confirmedDocs, currentUser, pendingAppealCaseMap, search, selectedMonth, signatures, statusFilter, visibleDocuments]);

  const historyFilteredDocuments = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return documents.filter((doc) => {
      const entries = effectiveEntriesForDoc(doc, signatures);
      const related =
        currentUser.role === "Quality Assurance" ||
        SIGNATURE_FLOW.some((role) => canSignIdentity(currentUser, doc, role));
      if (!related) return false;

      const monthMatch = selectedMonth === "all" || doc.monthKey === selectedMonth;
      const keywordMatch =
        !keyword ||
        doc.agentName.toLowerCase().includes(keyword) ||
        doc.seniorName.toLowerCase().includes(keyword) ||
        doc.supervisorName.toLowerCase().includes(keyword);

      return monthMatch && keywordMatch;
    });
  }, [currentUser, documents, search, selectedMonth, signatures]);

  const activeDocuments = documentView === "history" ? historyFilteredDocuments : filteredDocuments;

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

  const selectedMonthLateSignedDocs = useMemo(() => {
    if (selectedMonth === "all") return [];
    return documents
      .filter((doc) => doc.monthKey === selectedMonth)
      .filter((doc) => isLateSignedDocument(doc, effectiveEntriesForDoc(doc, signatures), pendingAppealCaseMap));
  }, [documents, pendingAppealCaseMap, selectedMonth, signatures]);

  const rolePendingCounts = useMemo(() => {
    const counts: Record<SignRole, number> = { QA: 0, Supervisor: 0, Senior: 0, Agent: 0 };
    const sourceDocs = documents.filter((doc) => selectedMonth === "all" || doc.monthKey === selectedMonth);

    sourceDocs.forEach((doc) => {
      if (!isAfterAppealPeriod(doc.monthKey)) return;
      if (doc.cases.some((item) => pendingAppealCaseMap.has(item.caseId))) return;
      const entries = effectiveEntriesForDoc(doc, signatures);
      const step = getCurrentStep(entries);
      if (step) counts[step] += 1;
    });

    return counts;
  }, [documents, pendingAppealCaseMap, selectedMonth, signatures]);

  const selectedMonthTotalDocs = selectedMonthAllDocs.length;

  const canGeneratePaymentExcel =
    currentUser.role === "Quality Assurance" &&
    selectedMonth !== "all" &&
    isPaymentExportWindowOpen(selectedMonth) &&
    selectedMonthPaymentDocs.length > 0;

  const selectedDocument = activeDocuments.find((item) => item.id === selectedDocumentId) || activeDocuments[0] || filteredDocuments[0] || historyFilteredDocuments[0] || null;
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
  const currentStep = getCurrentStep(selectedEntries);
  const nextSignerRole = currentStep;
  const nextSignerName = selectedDocument && nextSignerRole ? getRoleSigner(selectedDocument, nextSignerRole) : "";
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
      const step = getCurrentStep(entries);
      if (count === SIGNATURE_FLOW.length) complete += 1;
      else pending += 1;
      if (count === SIGNATURE_FLOW.length && doc.eligibleByScore) ready += 1;
      if (step && canSignIdentity(currentUser, doc, step) && isSigningAllowedByDate(doc.monthKey)) myTurn += 1;
    });
    return { total: visibleDocuments.length, complete, pending, ready, myTurn };
  }, [currentUser, signatures, visibleDocuments]);

  const confirmPreview = () => {
    if (!selectedDocument || !confirmAvailable || hasPendingAppeal) return;
    setConfirmedDocs((previous) => ({
      ...previous,
      [selectedDocument.id]: new Date().toISOString(),
    }));
  };

  const saveDrawnSignature = (role: SignRole, signatureDataUrl: string, saveToSavedLibrary = false) => {
    if (!selectedDocument) return;
    if (!canSignIdentity(currentUser, selectedDocument, role)) {
      window.alert("เซ็นแทนกันไม่ได้ กรุณาให้เจ้าของลายเซ็นตาม Role เป็นผู้ลงนามเอง");
      return;
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

    if (saveToSavedLibrary) {
      setSignatureLibrary((previous) => ({
        ...previous,
        [getSavedSignatureKey(role)]: signatureDataUrl,
      }));
    }

    setSignatures((previous) => {
      const current = previous[selectedDocument.id] || [];
      return {
        ...previous,
        [selectedDocument.id]: [...current.filter((entry) => entry.role !== role), nextEntry],
      };
    });
  };

  const signRole = (role: SignRole, signatureDataUrl?: string, saveToSavedLibrary = false) => {
    if (!selectedDocument) return;
    if (hasPendingAppeal) return;
    if (!isAfterAppealPeriod(selectedDocument.monthKey)) return;
    if (role !== currentStep) return;
    if (!isSigningAllowedByDate(selectedDocument.monthKey)) return;
    if (!canSignIdentity(currentUser, selectedDocument, role)) return;

    const signerName = getRoleSigner(selectedDocument, role);
    const nextEntry: SignatureEntry = {
      role,
      signerName,
      status: "Signed",
      signedBy: currentUser.displayName || currentUser.username,
      signedAt: new Date().toISOString(),
      signatureDataUrl,
    };

    if (signatureDataUrl && saveToSavedLibrary) {
      setSignatureLibrary((previous) => ({
        ...previous,
        [getSavedSignatureKey(role)]: signatureDataUrl,
      }));
    }

    setSignatures((previous) => {
      const current = previous[selectedDocument.id] || [];
      return {
        ...previous,
        [selectedDocument.id]: [...current.filter((entry) => entry.role !== role), nextEntry],
      };
    });
  };

  const copySelectedDocumentShareLink = async () => {
    if (!selectedDocument) return;
    const link = createSignatureShareLink(selectedDocument, nextSignerRole);
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
    const nextRole = getCurrentStep(entries);
    const lastRole = [...SIGNATURE_FLOW].reverse().find((role) => Boolean(getSignedEntry(entries, role)));
    const latestStatus = nextRole
      ? lastRole
        ? `${roleThaiLabel(lastRole)} ลงนามแล้ว`
        : previewConfirmed
          ? "Agent ยืนยันรับทราบข้อมูลแล้ว"
          : "รอ Agent ยืนยันรับทราบข้อมูล"
      : "เอกสารลงนามครบแล้ว";

    const text = nextRole
      ? [
          "แจ้งเตือนลงนามเอกสาร QA Incentive",
          "",
          `เดือน: ${selectedDocument.monthLabel}`,
          `Agent: ${selectedDocument.agentName}`,
          "",
          `สถานะล่าสุด: ${latestStatus}`,
          `ขั้นตอนถัดไป: รอ ${roleThaiLabel(nextRole)} ลงนาม`,
          `ผู้ที่ต้องดำเนินการ: ${getRoleSigner(selectedDocument, nextRole)}`,
          "",
          "กดลิงก์นี้เพื่อเปิดเอกสาร:",
          createSignatureShareLink(selectedDocument, nextRole),
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
    text("Monthly QA Dashboard", left, 10, 17, true, [255, 255, 255]);
    text("Monthly dashboard for selected Agent and Month", left, 17, 11, false, [255, 255, 255]);

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
      ["Incentive", individualIncentive.label || "No Incentive", "Cash (THB)", formatBahtAmount(individualIncentive.cash || 0)],
      ["RBH Promo (THB)", formatBahtAmount(individualIncentive.promo || 0), "Remark", individualIncentive.remark || "-"],
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

    const fileName = `Signature_${selectedDocument.monthKey}_${selectedDocument.agentName.replace(/[^a-zA-Z0-9ก-๙]+/g, "_")}.pdf`;
    downloadBlob(pdf.output("blob"), fileName);
    setPdfMessage(`Generated ${fileName}`);
    window.setTimeout(() => setPdfMessage(""), 3500);
  };

  const generatePaymentExcel = () => {
    if (!canGeneratePaymentExcel || selectedMonth === "all") return;
    generatePaymentExcelFile(selectedMonth, selectedMonthPaymentDocs, signatures, selectedMonthAllDocs);
    setPaymentMessage(`Generated ${makePaymentFileName(selectedMonth)}`);
    window.setTimeout(() => setPaymentMessage(""), 3500);
  };

  const generatePaymentPdf = () => {
    if (!canGeneratePaymentExcel || selectedMonth === "all") return;
    const fileName = generatePaymentPdfFile(selectedMonth, selectedMonthPaymentDocs, signatures, selectedMonthAllDocs);
    setPaymentMessage(`Generated ${fileName}`);
    window.setTimeout(() => setPaymentMessage(""), 3500);
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
    <div className="space-y-6">
      <PageHero
        eyebrow="Monthly Acknowledgement"
        title="Signature Center"
        subtitle="Preview คะแนนรายเดือนและ Case Detail 10 เคส ก่อนเข้าสู่ขั้นตอนเซ็นรับทราบ"
      />

      <div className="grid gap-4 md:grid-cols-5">
        {[
          { label: "เอกสารที่เห็นได้", value: summary.total, tone: "text-slate-900" },
          { label: "ถึงคิวฉัน", value: summary.myTurn, tone: "text-violet-700" },
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
            <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Signed Complete Agents</div>
            <div className="mt-1 text-2xl font-black text-violet-700">
              {selectedMonth === "all" ? "-" : `${selectedMonthPaymentDocs.length} คน`}
            </div>
            <div className="mt-1 text-xs font-semibold text-slate-500">
              {selectedMonth === "all"
                ? "กรุณาเลือกเดือนก่อน"
                : `รายการทั้งหมด ${selectedMonthTotalDocs} คน / เซ็นล่าช้า ${selectedMonthLateSignedDocs.length} คน / รวมบาทในรอบนี้ ${formatBahtAmount(selectedMonthPaymentDocs.reduce((sum, doc) => sum + getDocumentIncentive(doc).cash, 0))} บาท`}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={generatePaymentPdf}
              disabled={!canGeneratePaymentExcel}
              className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Generate Payment PDF
            </button>
            <button
              type="button"
              onClick={generatePaymentExcel}
              disabled={!canGeneratePaymentExcel}
              className="rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              Generate Excel
            </button>
          </div>
        </div>
        {paymentMessage ? (
          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">{paymentMessage}</div>
        ) : null}
        {!canGeneratePaymentExcel ? (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-800">
            เงื่อนไขยังไม่ครบ: ต้องเป็น QA, ต้องเลือกเดือน, ต้องพ้นวันที่ 15 แล้ว และต้องมีอย่างน้อย 1 Agent ที่เซ็นครบทุก Role ภายในกำหนด/ไม่มี Appeal Pending
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
                เฉพาะเอกสารที่ส่งมาถึงคิว Role นี้แล้ว
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-[30px] border border-violet-100 bg-white p-5 shadow-[0_20px_54px_rgba(88,28,135,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">
            {documentView === "history" ? "Signature History" : "Document Queue"}
          </div>
          <div className="mt-1 text-xl font-black text-slate-950">
            {documentView === "history" ? "ประวัติ / Reset" : "คิวที่ต้องเซ็นของฉัน"}
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
              ประวัติ ({historyFilteredDocuments.length})
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
                ? "ประวัติจะแสดงเอกสารที่เกี่ยวข้อง เพื่อกลับไปตรวจสอบหรือ Reset ได้"
                : "แสดงเฉพาะเอกสารที่ส่งมาถึงคิวเซ็นของ Role คุณแล้วเท่านั้น"}
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-violet-400"
            >
              <option value="all">ทุกสถานะ</option>
              <option value="preview">รอ Confirm Preview</option>
              <option value="my-turn">ถึงคิวฉัน</option>
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
              const docCurrentStep = getCurrentStep(entries);
              const isMyPendingTurn =
                Boolean(docCurrentStep) &&
                canSignIdentity(currentUser, doc, docCurrentStep as SignRole) &&
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
                      {docCurrentStep ? (
                        <div className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-black ${
                          isMyPendingTurn ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"
                        }`}>
                          รอ {roleThaiLabel(docCurrentStep)} เซ็น
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
                    <div className="mt-1 text-xl font-black text-slate-950">เซ็นตามลำดับ QA &gt; Supervisor &gt; Team Lead &gt; Agent</div>
                    {!previewConfirmed ? (
                      <div className="mt-1 text-xs font-bold text-amber-600">
                        Agent ยังไม่ได้กดยืนยันรับทราบ แต่ QA สามารถเริ่ม Workflow ได้หลังปิดรอบ Appeal
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
                  nextSignerRole
                    ? "border-violet-200 bg-violet-50"
                    : "border-emerald-200 bg-emerald-50"
                }`}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className={`text-xs font-black uppercase tracking-[0.18em] ${
                        nextSignerRole ? "text-violet-600" : "text-emerald-700"
                      }`}>
                        Next Signer Alert
                      </div>
                      <div className="mt-1 text-lg font-black text-slate-950">
                        {nextSignerRole
                          ? `ขั้นตอนถัดไป: รอ ${roleThaiLabel(nextSignerRole)} ลงนาม`
                          : "เอกสารลงนามครบแล้ว"}
                      </div>
                      <div className="mt-1 text-sm font-bold text-slate-600">
                        {nextSignerRole
                          ? `ผู้ที่ต้องดำเนินการ: ${nextSignerName}`
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
                    const status = statusForRole(selectedEntries, role, selectedDocument.monthKey);
                    const signerName = getRoleSigner(selectedDocument, role);
                    const allowSign =
                      currentStep === role &&
                      canSignIdentity(currentUser, selectedDocument, role) &&
                      isSigningAllowedByDate(selectedDocument.monthKey);
                    const canAddFirstDrawnSignature =
                      Boolean(signed) &&
                      !signed?.signatureDataUrl &&
                      canSignIdentity(currentUser, selectedDocument, role);
                    const canOpenSignaturePad = (!signed && allowSign) || canAddFirstDrawnSignature;
                    const savedSignatureDataUrl = signatureLibrary[getSavedSignatureKey(role)];
                    const previous = getPreviousStep(role);
                    return (
                      <div key={role} className="grid grid-cols-[90px_220px_minmax(0,1fr)_150px_210px] items-center gap-3 border-t border-slate-200 px-4 py-4 text-sm">
                        <div>
                          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${
                            signed ? "bg-emerald-100 text-emerald-700" : currentStep === role ? "bg-violet-700 text-white" : "bg-slate-100 text-slate-500"
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
                          ) : status === "Waiting" && previous ? (
                            <div className="mt-1 text-xs font-semibold text-slate-400">รอ {roleThaiLabel(previous)} เซ็นก่อน</div>
                          ) : status === "Locked" ? (
                            <div className="mt-1 text-xs font-semibold text-slate-400">เปิดเซ็นหลังวันที่ 10 ของเดือนถัดไป</div>
                          ) : null}
                        </div>
                        <div><SignaturePill status={status} /></div>
                        <div>
                          <button
                            type="button"
                            onClick={() => setSigningRole(role)}
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
                                    ? "ใช้ลายเซ็นเดิม"
                                    : "เพิ่มลายเซ็นจริง"
                                  : "เฉพาะเจ้าของลายเซ็น"
                              : allowSign
                                ? savedSignatureDataUrl
                                  ? "ใช้ลายเซ็นเดิม"
                                  : timeline === "Signature Deadline Passed"
                                    ? "วาดและลงนามล่าช้า"
                                    : "วาดและลงนาม"
                                : status === "Locked"
                                  ? "ยังไม่เปิดให้เซ็น"
                                  : status === "Expired"
                                    ? "เกินกำหนด"
                                    : status === "Waiting"
                                      ? "ยังไม่ถึงคิว"
                                      : "รอผู้เกี่ยวข้อง"}
                          </button>
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

      {signingRole && selectedDocument ? (
        <SignaturePadModal
          roleLabel={roleThaiLabel(signingRole)}
          signerName={getRoleSigner(selectedDocument, signingRole)}
          savedSignatureDataUrl={signatureLibrary[getSavedSignatureKey(signingRole)]}
          onCancel={() => setSigningRole(null)}
          onUseSavedSignature={() => {
            const savedSignatureDataUrl = signatureLibrary[getSavedSignatureKey(signingRole)];
            if (!savedSignatureDataUrl) return;
            if (!canSignIdentity(currentUser, selectedDocument, signingRole)) {
              window.alert("เซ็นแทนกันไม่ได้ กรุณาให้เจ้าของลายเซ็นตาม Role เป็นผู้ลงนามเอง");
              setSigningRole(null);
              return;
            }
            const existingSigned = getSignedEntry(effectiveEntriesForDoc(selectedDocument, signatures), signingRole);
            if (existingSigned) {
              saveDrawnSignature(signingRole, savedSignatureDataUrl, false);
            } else {
              signRole(signingRole, savedSignatureDataUrl, false);
            }
            setSigningRole(null);
          }}
          onSave={(dataUrl, saveToSavedLibrary) => {
            if (!canSignIdentity(currentUser, selectedDocument, signingRole)) {
              window.alert("เซ็นแทนกันไม่ได้ กรุณาให้เจ้าของลายเซ็นตาม Role เป็นผู้ลงนามเอง");
              setSigningRole(null);
              return;
            }
            const existingSigned = getSignedEntry(effectiveEntriesForDoc(selectedDocument, signatures), signingRole);
            if (existingSigned) {
              saveDrawnSignature(signingRole, dataUrl, saveToSavedLibrary);
            } else {
              signRole(signingRole, dataUrl, saveToSavedLibrary);
            }
            setSigningRole(null);
          }}
        />
      ) : null}
    </div>
  );
}

