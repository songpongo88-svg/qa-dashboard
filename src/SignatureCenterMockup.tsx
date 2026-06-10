import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import PageHero from "./PageHero";
import { scoreToGrade } from "./lib/scoreIncentivePolicy";

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

type SignatureEntry = {
  role: SignRole;
  signerName: string;
  signedBy: string;
  signedAt: string;
  status: SignStatus;
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
};

const RAW_DATA_FILE = "/QA_RawData_March-May2026.xlsx";
const SIGNATURE_STORAGE_KEY = "qa-monthly-signature-center-v2";
const SIGNATURE_FLOW: SignRole[] = ["QA", "Supervisor", "Senior", "Agent"];

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

function safeName(value: unknown, fallback = "-") {
  const text = normalizeText(value);
  return text || fallback;
}

function findAccountForAgent(accounts: UserAccountSnapshot[], agentName: string) {
  return accounts.find((account) =>
    [account.agentName, account.displayName, account.username].some((identity) => isSamePerson(identity, agentName))
  );
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

function createDocumentHash(doc: Omit<SignatureDocument, "documentHash">) {
  return btoa(
    unescape(
      encodeURIComponent(
        [
          doc.monthKey,
          doc.agentName,
          doc.seniorName,
          doc.supervisorName,
          doc.caseCount,
          doc.averageScore.toFixed(2),
          doc.grade,
        ].join("|")
      )
    )
  ).slice(0, 18);
}

function buildDocuments(rows: unknown[][], accounts: UserAccountSnapshot[]) {
  const headerIndex = rows.findIndex((row) => {
    const keys = row.map((item) => normalizeKey(item));
    return keys.includes("agent name") && (keys.includes("case id") || keys.includes("final score"));
  });

  if (headerIndex < 0) return [];

  const helper = buildHeaderMap(rows[headerIndex] || []);
  const dataRows = rows.slice(headerIndex + 1);
  const grouped = new Map<string, {
    monthKey: string;
    agentName: string;
    seniorName: string;
    supervisorName: string;
    qaName: string;
    teamName: string;
    scores: number[];
    cases: Set<string>;
  }>();

  dataRows.forEach((row) => {
    const agentName = safeName(helper.get(row, ["Agent Name", "Agent", "Employee Name", "User"], ""));
    if (!agentName || agentName === "-") return;

    const account = findAccountForAgent(accounts, agentName);
    const caseId = safeName(helper.get(row, ["Case ID", "CaseId", "Case"], ""));
    const auditDate = parseExcelDate(helper.get(row, ["Audit Date", "Case Date", "Timestamp", "Date"], ""));
    const monthStart = parseExcelDate(helper.get(row, ["Month Start", "Month"], ""));
    const monthKey = getMonthKey(monthStart || auditDate);
    if (monthKey === "unknown") return;

    const finalScoreValue = helper.get(row, ["Final Score", "Total Score", "QA Score", "Score"], "");
    const finalScore = Number(finalScoreValue);
    const score = Number.isFinite(finalScore) ? finalScore : 0;

    const seniorName = safeName(
      account?.teamLead ||
        helper.get(row, ["Senior", "Team Lead", "Team Leader", "Leader", "หัวหน้าทีม"], ""),
      "Senior / Team Lead"
    );
    const supervisorName = safeName(helper.get(row, ["Supervisor", "Sup", "หัวหน้าแผนก"], ""), "Supervisor");
    const qaName = safeName(helper.get(row, ["QA", "QA Name", "Auditor", "Evaluator", "Audit By"], ""), "Quality Assurance");
    const teamName = safeName(account?.teamName || helper.get(row, ["Team", "Team Name", "ทีม"], ""), "-");

    const key = `${monthKey}::${agentName}`;
    const current = grouped.get(key) || {
      monthKey,
      agentName,
      seniorName,
      supervisorName,
      qaName,
      teamName,
      scores: [],
      cases: new Set<string>(),
    };

    current.seniorName = current.seniorName === "Senior / Team Lead" ? seniorName : current.seniorName;
    current.supervisorName = current.supervisorName === "Supervisor" ? supervisorName : current.supervisorName;
    current.qaName = current.qaName === "Quality Assurance" ? qaName : current.qaName;
    current.teamName = current.teamName === "-" ? teamName : current.teamName;
    if (caseId && caseId !== "-") current.cases.add(caseId);
    if (score > 0) current.scores.push(score);
    grouped.set(key, current);
  });

  return Array.from(grouped.values())
    .map((item): SignatureDocument => {
      const averageScore = item.scores.length
        ? item.scores.reduce((sum, score) => sum + score, 0) / item.scores.length
        : 0;
      const base = {
        id: `${item.monthKey}::${item.agentName}`,
        monthKey: item.monthKey,
        monthLabel: getMonthLabel(item.monthKey),
        agentName: item.agentName,
        seniorName: item.seniorName,
        supervisorName: item.supervisorName,
        qaName: item.qaName,
        teamName: item.teamName,
        caseCount: item.cases.size || item.scores.length,
        averageScore,
        grade: scoreToGrade(averageScore, item.monthKey),
        eligibleByScore: averageScore >= 80,
      };
      return { ...base, documentHash: createDocumentHash(base) };
    })
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey) || a.agentName.localeCompare(b.agentName));
}

function getRoleSigner(doc: SignatureDocument, role: SignRole) {
  if (role === "QA") return doc.qaName;
  if (role === "Supervisor") return doc.supervisorName;
  if (role === "Senior") return doc.seniorName;
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
  if (role === "Senior") return "Senior / หัวหน้าทีม";
  return "Agent ผู้ถูกประเมิน";
}

function roleBadgeText(role: SignRole) {
  if (role === "QA") return "1";
  if (role === "Supervisor") return "2";
  if (role === "Senior") return "3";
  return "4";
}

function canSignIdentity(currentUser: CurrentUser, doc: SignatureDocument, role: SignRole) {
  const signerName = getRoleSigner(doc, role);
  if (role === "QA") return currentUser.role === "Quality Assurance" || isSamePerson(currentUser.displayName, signerName);
  if (role === "Supervisor") {
    return currentUser.role === "Supervisor" || isSamePerson(currentUser.displayName, signerName) || isSamePerson(currentUser.agentName, signerName);
  }
  if (role === "Senior") {
    return currentUser.role === "Senior" || isSamePerson(currentUser.displayName, signerName) || isSamePerson(currentUser.agentName, signerName);
  }
  return isSamePerson(currentUser.agentName, doc.agentName) || isSamePerson(currentUser.displayName, doc.agentName);
}

function canViewDocument(currentUser: CurrentUser, doc: SignatureDocument, entries: SignatureEntry[]) {
  if (currentUser.role === "Quality Assurance") return true;

  const qaSigned = Boolean(getSignedEntry(entries, "QA"));
  const supervisorSigned = Boolean(getSignedEntry(entries, "Supervisor"));
  const seniorSigned = Boolean(getSignedEntry(entries, "Senior"));

  if (currentUser.role === "Supervisor") {
    return qaSigned && (doc.supervisorName === "Supervisor" || canSignIdentity(currentUser, doc, "Supervisor"));
  }

  if (currentUser.role === "Senior") {
    return supervisorSigned && (doc.seniorName === "Senior / Team Lead" || canSignIdentity(currentUser, doc, "Senior"));
  }

  return seniorSigned && canSignIdentity(currentUser, doc, "Agent");
}

function statusForRole(entries: SignatureEntry[], role: SignRole) {
  if (getSignedEntry(entries, role)) return "Signed";
  const currentStep = getCurrentStep(entries);
  if (currentStep === role) return "Pending";
  return "Waiting";
}

function SignaturePill({ status }: { status: "Signed" | "Pending" | "Waiting" }) {
  const tone =
    status === "Signed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "Pending"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-slate-50 text-slate-500";

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${tone}`}>
      {status}
    </span>
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
  const [signatures, setSignatures] = useState<Record<string, SignatureEntry[]>>(() => readSignatureStore());
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadMessage, setLoadMessage] = useState("");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        setLoading(true);
        setLoadMessage("");
        const response = await fetch(RAW_DATA_FILE, { cache: "no-store" });
        if (!response.ok) throw new Error(`ไม่พบไฟล์ ${RAW_DATA_FILE}`);
        const buffer = await response.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
        const sheet = workbook.Sheets["Raw_Data"] || workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
        const nextDocs = buildDocuments(rows, accounts);
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

  const monthOptions = useMemo(() => {
    return Array.from(new Set(documents.map((item) => item.monthKey))).sort().reverse();
  }, [documents]);

  const visibleDocuments = useMemo(() => {
    return documents.filter((doc) => canViewDocument(currentUser, doc, signatures[doc.id] || []));
  }, [currentUser, documents, signatures]);

  const filteredDocuments = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return visibleDocuments.filter((doc) => {
      const entries = signatures[doc.id] || [];
      const signedCount = SIGNATURE_FLOW.filter((role) => Boolean(getSignedEntry(entries, role))).length;
      const isComplete = signedCount === SIGNATURE_FLOW.length;
      const currentStep = getCurrentStep(entries);
      const statusMatch =
        statusFilter === "all" ||
        (statusFilter === "my-turn" && currentStep && canSignIdentity(currentUser, doc, currentStep)) ||
        (statusFilter === "ready" && isComplete && doc.eligibleByScore) ||
        (statusFilter === "pending" && !isComplete) ||
        (statusFilter === "not-eligible" && !doc.eligibleByScore);
      const monthMatch = selectedMonth === "all" || doc.monthKey === selectedMonth;
      const keywordMatch =
        !keyword ||
        doc.agentName.toLowerCase().includes(keyword) ||
        doc.seniorName.toLowerCase().includes(keyword) ||
        doc.supervisorName.toLowerCase().includes(keyword);
      return statusMatch && monthMatch && keywordMatch;
    });
  }, [currentUser, search, selectedMonth, signatures, statusFilter, visibleDocuments]);

  const selectedDocument = filteredDocuments.find((item) => item.id === selectedDocumentId) || filteredDocuments[0] || visibleDocuments[0] || null;
  const selectedEntries = selectedDocument ? signatures[selectedDocument.id] || [] : [];
  const currentStep = getCurrentStep(selectedEntries);
  const signedCount = SIGNATURE_FLOW.filter((role) => Boolean(getSignedEntry(selectedEntries, role))).length;
  const isComplete = Boolean(selectedDocument && signedCount === SIGNATURE_FLOW.length);
  const readyForIncentive = Boolean(selectedDocument?.eligibleByScore && isComplete);

  const summary = useMemo(() => {
    let complete = 0;
    let pending = 0;
    let ready = 0;
    let myTurn = 0;

    visibleDocuments.forEach((doc) => {
      const entries = signatures[doc.id] || [];
      const count = SIGNATURE_FLOW.filter((role) => Boolean(getSignedEntry(entries, role))).length;
      const nextStep = getCurrentStep(entries);
      if (count === SIGNATURE_FLOW.length) complete += 1;
      else pending += 1;
      if (count === SIGNATURE_FLOW.length && doc.eligibleByScore) ready += 1;
      if (nextStep && canSignIdentity(currentUser, doc, nextStep)) myTurn += 1;
    });

    return { total: visibleDocuments.length, complete, pending, ready, myTurn };
  }, [currentUser, signatures, visibleDocuments]);

  const signRole = (role: SignRole) => {
    if (!selectedDocument) return;
    if (role !== currentStep) return;
    if (!canSignIdentity(currentUser, selectedDocument, role)) return;

    const signerName = getRoleSigner(selectedDocument, role);
    const signedAt = new Date().toISOString();
    const nextEntry: SignatureEntry = {
      role,
      signerName,
      status: "Signed",
      signedBy: currentUser.displayName || currentUser.username,
      signedAt,
    };

    setSignatures((previous) => {
      const current = previous[selectedDocument.id] || [];
      return {
        ...previous,
        [selectedDocument.id]: [
          ...current.filter((entry) => entry.role !== role),
          nextEntry,
        ],
      };
    });
  };

  const resetDocument = () => {
    if (!selectedDocument) return;
    setSignatures((previous) => {
      const next = { ...previous };
      delete next[selectedDocument.id];
      return next;
    });
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
        subtitle="ระบบเซ็นรับทราบผลประเมินตามลำดับ QA > Supervisor > Team Lead > Agent ก่อนปล่อย Incentive"
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
          {SIGNATURE_FLOW.map((role, index) => (
            <React.Fragment key={role}>
              <span className="rounded-full bg-violet-100 px-3 py-1 text-violet-700">
                {roleBadgeText(role)}. {roleThaiLabel(role)}
              </span>
              {index < SIGNATURE_FLOW.length - 1 ? <span className="text-slate-300">→</span> : null}
            </React.Fragment>
          ))}
        </div>
        <div className="mt-3 text-sm leading-6 text-slate-500">
          เอกสารจะเปิดให้เซ็นตามลำดับเท่านั้น: QA เซ็นก่อน → Supervisor → Team Lead ของ Agent → Agent ผู้ถูกประเมิน
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-[30px] border border-violet-100 bg-white p-5 shadow-[0_20px_54px_rgba(88,28,135,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">Document Queue</div>
          <div className="mt-1 text-xl font-black text-slate-950">รายการที่เกี่ยวข้องกับฉัน</div>

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
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-violet-400"
            >
              <option value="all">ทุกสถานะ</option>
              <option value="my-turn">ถึงคิวฉัน</option>
              <option value="pending">รอเซ็น</option>
              <option value="ready">พร้อมจ่าย Incentive</option>
              <option value="not-eligible">คะแนนไม่ผ่าน Incentive</option>
            </select>
          </div>

          <div className="mt-5 max-h-[620px] space-y-3 overflow-y-auto pr-1">
            {filteredDocuments.map((doc) => {
              const entries = signatures[doc.id] || [];
              const count = SIGNATURE_FLOW.filter((role) => Boolean(getSignedEntry(entries, role))).length;
              const nextStep = getCurrentStep(entries);
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
                    <div>
                      <div className="text-sm font-black text-slate-950">{doc.agentName}</div>
                      <div className="mt-1 text-xs font-bold text-slate-500">{doc.monthLabel}</div>
                    </div>
                    <SignaturePill status={count === SIGNATURE_FLOW.length ? "Signed" : "Pending"} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{count}/4 signed</span>
                    <span className="rounded-full bg-violet-100 px-2.5 py-1 text-violet-700">Next: {nextStep ? roleThaiLabel(nextStep) : "Complete"}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">Score {doc.averageScore.toFixed(2)}</span>
                  </div>
                </button>
              );
            })}

            {!filteredDocuments.length ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
                ยังไม่มีรายการที่ถึงคิว หรือเกี่ยวข้องกับ Role นี้
              </div>
            ) : null}
          </div>
        </div>

        {selectedDocument ? (
          <div className="space-y-5">
            <div className="rounded-[30px] border border-violet-100 bg-white p-6 shadow-[0_20px_54px_rgba(88,28,135,0.08)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-500">Monthly Document</div>
                  <div className="mt-1 text-2xl font-black text-slate-950">{selectedDocument.agentName}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">
                    {selectedDocument.monthLabel} • Team: {selectedDocument.teamName} • {selectedDocument.caseCount} case(s) • Hash {selectedDocument.documentHash}
                  </div>
                </div>
                <div
                  className={`rounded-[22px] border px-5 py-3 text-center ${
                    readyForIncentive
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : isComplete
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                  }`}
                >
                  <div className="text-xs font-black uppercase tracking-[0.14em]">Incentive Status</div>
                  <div className="mt-1 text-lg font-black">
                    {readyForIncentive
                      ? "Ready to Pay"
                      : isComplete
                        ? "Signed / Not Eligible"
                        : "Hold / Pending Signature"}
                  </div>
                </div>
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
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Current Step</div>
                  <div className="mt-1 text-base font-black text-slate-950">{currentStep ? roleThaiLabel(currentStep) : "Complete"}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Signature Progress</div>
                  <div className="mt-1 text-2xl font-black text-slate-950">{signedCount}/4</div>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-violet-100 bg-white p-6 shadow-[0_20px_54px_rgba(88,28,135,0.08)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-500">Required Signatures</div>
                  <div className="mt-1 text-xl font-black text-slate-950">เซ็นตามลำดับก่อนจ่าย Incentive</div>
                </div>
                {currentUser.role === "Quality Assurance" ? (
                  <button
                    type="button"
                    onClick={resetDocument}
                    className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-100"
                  >
                    Reset เอกสารนี้
                  </button>
                ) : null}
              </div>

              <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200">
                <div className="grid grid-cols-[90px_220px_minmax(0,1fr)_150px_210px] bg-violet-700 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white">
                  <div>Step</div>
                  <div>Role</div>
                  <div>Signer</div>
                  <div>Status</div>
                  <div>Action</div>
                </div>

                {SIGNATURE_FLOW.map((role) => {
                  const signed = getSignedEntry(selectedEntries, role);
                  const status = statusForRole(selectedEntries, role) as "Signed" | "Pending" | "Waiting";
                  const signerName = getRoleSigner(selectedDocument, role);
                  const isCurrent = currentStep === role;
                  const allowSign = isCurrent && canSignIdentity(currentUser, selectedDocument, role);
                  const previous = getPreviousStep(role);
                  return (
                    <div key={role} className="grid grid-cols-[90px_220px_minmax(0,1fr)_150px_210px] items-center gap-3 border-t border-slate-200 px-4 py-4 text-sm">
                      <div>
                        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${
                          signed ? "bg-emerald-100 text-emerald-700" : isCurrent ? "bg-violet-700 text-white" : "bg-slate-100 text-slate-500"
                        }`}>
                          {roleBadgeText(role)}
                        </span>
                      </div>
                      <div className="font-black text-slate-950">{roleThaiLabel(role)}</div>
                      <div>
                        <div className="font-bold text-slate-900">{signerName}</div>
                        {signed ? (
                          <div className="mt-1 text-xs font-semibold text-slate-400">
                            Signed by {signed.signedBy} • {new Date(signed.signedAt).toLocaleString("th-TH")}
                          </div>
                        ) : status === "Waiting" && previous ? (
                          <div className="mt-1 text-xs font-semibold text-slate-400">รอ {roleThaiLabel(previous)} เซ็นก่อน</div>
                        ) : null}
                      </div>
                      <div><SignaturePill status={status} /></div>
                      <div>
                        <button
                          type="button"
                          onClick={() => signRole(role)}
                          disabled={Boolean(signed) || !allowSign}
                          className="w-full rounded-2xl bg-violet-700 px-4 py-2 text-xs font-black text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          {signed
                            ? "เซ็นแล้ว"
                            : allowSign
                              ? "รับทราบและลงนาม"
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
                ทุกคนที่เกี่ยวข้องจะเห็นสถานะว่าใครเซ็นแล้ว / ใครยังไม่เซ็น แต่ปุ่มเซ็นจะเปิดเฉพาะคนที่ถึงคิวเท่านั้น
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

