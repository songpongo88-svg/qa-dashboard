import { useEffect, useRef, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import * as XLSX from "xlsx";
import PageHero from "./PageHero";
import { deleteStoredEvaluation, fetchStoredEvaluations, type StoredEvaluationTopic } from "./evaluationStore";
import {
  RUBRIC_GROUP_LABELS,
  formatRubricDate,
  getRubricForDate,
  type RubricTopic,
} from "./lib/rubricVersions";

type TopicState = {
  score: number;
  reason: string;
};

type EvidenceFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  previewUrl: string;
  storedUrl: string;
};

type AutoGrowTextareaProps = {
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  className: string;
  minRows?: number;
};

type EvaluationDraft = {
  draftId?: string;
  title?: string;
  agentName: string;
  auditDate: string;
  waitingTime: string;
  serviceTime: string;
  caseId: string;
  caseUrl: string;
  inquiry: string;
  caseDescription: string;
  evidenceUrl: string;
  criticalError: boolean;
  evaluationStartedAt: string;
  evaluationSubmittedAt: string;
  evaluationStatus: "Not Started" | "Draft" | "Submitted";
  topicState: Record<string, TopicState>;
  savedAt: string;
  savedAtMs?: number;
};

export type EvaluationAgentOption = {
  username: string;
  displayName: string;
  agentName: string;
  role: string;
  email?: string;
};

export type EvaluationSubmitPayload = {
  recordId?: string;
  evaluationKey?: string;
  caseId: string;
  agentName: string;
  targetUsername: string;
  targetDisplayName: string;
  targetEmail?: string;
  targetRole: string;
  auditDate: string;
  auditTimestamp: string;
  waitingTime: string;
  serviceTime: string;
  caseUrl: string;
  inquiry: string;
  caseDescription: string;
  evidenceUrls: string[];
  finalScore: number;
  grade: string;
  criticalError: boolean;
  qaScheme: string;
  rubricName: string;
  rubricPeriod: string;
  completedTopics: number;
  totalTopics: number;
  strengths: string[];
  improvements: string[];
  topics: StoredEvaluationTopic[];
  rawDataPreview: Record<string, string | number>;
  evaluationStartedAt: string;
  submittedAt: string;
};

type EvaluationRecord = EvaluationSubmitPayload & {
  recordId: string;
  pdfButtonLabel: string;
  rawDataPreview: Record<string, string | number>;
};

type EvaluationWorkspaceView = "form" | "drafts" | "history" | "report";

type SubmitPreviewState = {
  record: EvaluationRecord;
  draftId: string;
};

const FALLBACK_AGENT_NAMES = [
  "Anucha Makundin",
  "Chatkonnaphat Bhusomya",
  "Jariyawadee Taboodda",
  "Jureeporn Piddum",
  "Krivut Vongkampan",
  "Natcha Chai-in",
  "Nattapol Suprom",
  "Phrommarin Thaithorn",
  "Sunijtra Siritip",
  "Supakrit Promkhamnoi",
  "Suphitcha Keawliam",
  "Wachiraporn chailittichai",
  "Wassana Phothong",
];

const inputClass =
  "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-950 shadow-inner outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100";
const labelClass = "text-[11px] font-black uppercase tracking-[0.16em] text-slate-500";
const DRAFT_STORAGE_KEY = "qa-dashboard:create-evaluation:drafts";
const LEGACY_DRAFT_STORAGE_KEY = "qa-dashboard:create-evaluation:draft";
const HISTORY_STORAGE_KEY = "qa-dashboard:create-evaluation:history";
const RAW_DATA_FILE_NAMES = [
  "QA_RawData1.xlsx",
  "QA_RawData11052026.xlsx",
  "QA_RawData12052026.xlsx",
  "QA_RawData13052026.xlsx",
  "QA_RawData20052026.xlsx",
];

type RawReportRecord = {
  recordId: string;
  caseId: string;
  agentName: string;
  auditDate: string;
  auditDateMs: number;
  finalScore: string | number;
  grade: string;
  sourceName: string;
  rowData: RawDataExportRow;
};

type RawDataExportValue = string | number | Date;
type RawDataExportRow = Record<string, RawDataExportValue>;

function normalizeHeaderText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function excelDateToJSDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const utcDays = Math.floor(value - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    const fractionalDay = value - Math.floor(value) + 0.0000001;
    const totalSeconds = Math.floor(86400 * fractionalDay);
    dateInfo.setSeconds(totalSeconds);
    return dateInfo;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const match = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    if (match) {
      const day = Number(match[1]);
      const month = Number(match[2]) - 1;
      const rawYear = Number(match[3]);
      const year = rawYear < 100 ? 2000 + rawYear : rawYear;
      const date = new Date(year, month, day);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }
  return null;
}

function formatDateInputFromAny(value: unknown) {
  const date = excelDateToJSDate(value);
  if (!date) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateForRowData(value: unknown) {
  const inputDate = formatDateInputFromAny(value);
  return inputDate ? formatThaiDate(inputDate) : String(value ?? "");
}

function buildRawHeaderHelpers(headerRow: unknown[]) {
  const normalizedHeaders = headerRow.map((header) => normalizeHeaderText(header));
  const colIndexes = (name: string) => {
    const target = normalizeHeaderText(name);
    return normalizedHeaders
      .map((header, index) => (header === target ? index : -1))
      .filter((index) => index >= 0);
  };
  const getValue = (row: unknown[], name: string, occurrence = 0) => {
    const index = colIndexes(name)[occurrence];
    return index >= 0 ? row[index] : null;
  };
  const getLastValue = (row: unknown[], name: string) => {
    const indexes = colIndexes(name);
    if (!indexes.length) return null;
    return row[indexes[indexes.length - 1]];
  };
  return { getValue, getLastValue };
}

function normalizeRowValue(value: unknown): RawDataExportValue {
  if (value instanceof Date) return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "string") return value;
  return String(value);
}

function parseDateTimeValue(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) return excelDateToJSDate(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const slashMatch = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:,\s*|\s+)?(\d{1,2})?:?(\d{2})?:?(\d{2})?/);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]) - 1;
    const rawYear = Number(slashMatch[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const hour = Number(slashMatch[4] || 0);
    const minute = Number(slashMatch[5] || 0);
    const second = Number(slashMatch[6] || 0);
    const date = new Date(year, month, day, hour, minute, second);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseTimeValue(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(1899, 11, 30, value.getHours(), value.getMinutes(), value.getSeconds());
  }
  if (typeof value === "number" && Number.isFinite(value)) return excelDateToJSDate(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  return new Date(1899, 11, 30, Number(match[1]), Number(match[2]), Number(match[3] || 0));
}

function normalizeExportHeader(header: string) {
  return header.trim().replace(/\s+/g, " ").toLowerCase();
}

function coerceExportCellValue(header: string, value: RawDataExportValue): RawDataExportValue {
  const normalized = normalizeExportHeader(header);
  if (normalized === "waiting time" || normalized === "service time") {
    return parseTimeValue(value) || value;
  }
  if (
    normalized === "timestamp" ||
    normalized === "evaluation started at" ||
    normalized === "evaluation submitted at"
  ) {
    return parseDateTimeValue(value) || value;
  }
  if (
    normalized === "audit date" ||
    normalized === "month start" ||
    normalized === "week start" ||
    normalized === "week end"
  ) {
    return excelDateToJSDate(value) || value;
  }
  return value;
}

function getExportCellFormat(header: string) {
  const normalized = normalizeExportHeader(header);
  if (normalized === "waiting time" || normalized === "service time") return "hh:mm:ss";
  if (
    normalized === "timestamp" ||
    normalized === "evaluation started at" ||
    normalized === "evaluation submitted at"
  ) {
    return "dd/mm/yyyy hh:mm:ss";
  }
  if (
    normalized === "audit date" ||
    normalized === "month start" ||
    normalized === "week start" ||
    normalized === "week end"
  ) {
    return "dd/mm/yyyy";
  }
  return "";
}

function buildRawDataWorksheet(rows: RawDataExportRow[]) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const normalizedRows = rows.map((row) =>
    headers.reduce<RawDataExportRow>((acc, header) => {
      acc[header] = coerceExportCellValue(header, row[header] ?? "");
      return acc;
    }, {})
  );
  const worksheet = XLSX.utils.json_to_sheet(normalizedRows, {
    header: headers,
    cellDates: true,
  });
  headers.forEach((header, columnIndex) => {
    const format = getExportCellFormat(header);
    if (!format) return;
    for (let rowIndex = 2; rowIndex <= rows.length + 1; rowIndex += 1) {
      const address = XLSX.utils.encode_cell({ c: columnIndex, r: rowIndex - 1 });
      const cell = worksheet[address];
      if (cell) cell.z = format;
    }
  });
  worksheet["!cols"] = headers.map((header) => ({
    wch: Math.min(Math.max(header.length + 4, 14), 36),
  }));
  return worksheet;
}

async function loadRawDataReportRecords(): Promise<RawReportRecord[]> {
  const responses = await Promise.all(
    RAW_DATA_FILE_NAMES.map(async (fileName) => ({
      fileName,
      response: await fetch(`/${fileName}`, { cache: "no-store" }),
    }))
  );
  const availableResponses = responses.filter((item) => item.response.ok);
  const records: RawReportRecord[] = [];

  for (const { fileName, response } of availableResponses) {
    const buffer = await response.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheet = workbook.Sheets["Raw_Data"] || workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      raw: true,
    });
    const headerIndex = rows.findIndex((row) => {
      const normalized = (row || []).map((value) => normalizeHeaderText(value));
      return normalized.includes("agent name") && normalized.includes("case id");
    });
    if (headerIndex < 0) continue;

    const headerRow = rows[headerIndex] || [];
    const helper = buildRawHeaderHelpers(headerRow);
    rows.slice(headerIndex + 1).forEach((row, rowIndex) => {
      const caseId = String(helper.getValue(row, "Case ID") ?? "").trim();
      if (!caseId) return;
      const auditRaw = helper.getValue(row, "Audit Date");
      const auditDate = formatDateInputFromAny(auditRaw);
      const auditDateMs = auditDate ? new Date(`${auditDate}T00:00:00`).getTime() : Number.NaN;
      const agentName = String(helper.getValue(row, "Agent Name") ?? "").trim();
      const rowData: RawDataExportRow = {};

      headerRow.forEach((header, index) => {
        const key = String(header || `Column ${index + 1}`).trim() || `Column ${index + 1}`;
        rowData[key] = normalizeRowValue(row[index]);
      });
      rowData["RawData File"] = String(rowData["RawData File"] || rowData["Raw Data File"] || fileName);
      if (auditDate) rowData["Audit Date"] = new Date(`${auditDate}T00:00:00`);

      records.push({
        recordId: `raw-${fileName}-${rowIndex}-${caseId}`,
        caseId,
        agentName,
        auditDate,
        auditDateMs,
        finalScore: normalizeRowValue(helper.getLastValue(row, "Final Score")),
        grade: String(helper.getValue(row, "Grade") ?? ""),
        sourceName: fileName,
        rowData,
      });
    });
  }

  return records;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

function buildInitialTopicState(topics: RubricTopic[]) {
  return topics.reduce<Record<string, TopicState>>((acc, topic) => {
    acc[topic.code] = { score: 0, reason: "" };
    return acc;
  }, {});
}

function gradeFromScore(score: number, criticalError: boolean) {
  if (criticalError) return "G";
  if (score >= 90) return "A";
  if (score >= 85) return "B";
  if (score >= 80) return "C";
  if (score >= 70) return "D";
  return "F";
}

function todayInputValue() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function currentYearStartInputValue() {
  return `${new Date().getFullYear()}-01-01`;
}

function formatThaiDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB");
}

function scoreOptions(max: number) {
  return Array.from({ length: max + 1 }, (_, index) => index);
}

function formatTimestamp(date: Date) {
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function AutoGrowTextarea({ value, onChange, placeholder, className, minRows = 3 }: AutoGrowTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      rows={minRows}
      placeholder={placeholder}
      className={className}
      style={{ overflow: "hidden" }}
    />
  );
}

function SectionCard({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
      <div className="border-b border-slate-200 bg-gradient-to-r from-emerald-800 via-emerald-700 to-sky-700 px-5 py-4 text-white">
        <div className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-100">{label}</div>
        {title ? <div className="mt-1 text-lg font-black">{title}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function CreateEvaluationMockup({
  agentOptions,
  onSubmitEvaluation,
}: {
  agentOptions?: EvaluationAgentOption[];
  onSubmitEvaluation?: (payload: EvaluationSubmitPayload) => void | Promise<void>;
}) {
  const [agentName, setAgentName] = useState("");
  const [auditDate, setAuditDate] = useState(todayInputValue());
  const [waitingTime, setWaitingTime] = useState("");
  const [serviceTime, setServiceTime] = useState("");
  const [caseId, setCaseId] = useState("");
  const [caseUrl, setCaseUrl] = useState("");
  const [inquiry, setInquiry] = useState("");
  const [caseDescription, setCaseDescription] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFile[]>([]);
  const [criticalError, setCriticalError] = useState(false);
  const [evaluationStartedAt, setEvaluationStartedAt] = useState("");
  const [evaluationSubmittedAt, setEvaluationSubmittedAt] = useState("");
  const [evaluationStatus, setEvaluationStatus] = useState<"Not Started" | "Draft" | "Submitted">("Not Started");
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [draftInbox, setDraftInbox] = useState<EvaluationDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState("");
  const [activeSubmittedRecordId, setActiveSubmittedRecordId] = useState("");
  const [workspaceView, setWorkspaceView] = useState<EvaluationWorkspaceView>("form");
  const [evaluationHistory, setEvaluationHistory] = useState<EvaluationRecord[]>([]);
  const [submittedRecords, setSubmittedRecords] = useState<EvaluationRecord[]>([]);
  const [submittedRecordsLoading, setSubmittedRecordsLoading] = useState(false);
  const [submitPreview, setSubmitPreview] = useState<SubmitPreviewState | null>(null);
  const [rawReportRecords, setRawReportRecords] = useState<RawReportRecord[]>([]);
  const [reportDateFrom, setReportDateFrom] = useState(currentYearStartInputValue());
  const [reportDateTo, setReportDateTo] = useState(todayInputValue());
  const [reportSearch, setReportSearch] = useState("");
  const [reportMessage, setReportMessage] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    "Service Standard": true,
    "Answer Quality": true,
    Resolution: true,
    Communication: true,
  });

  const activeRubric = useMemo(() => getRubricForDate(auditDate), [auditDate]);
  const topics = activeRubric.topics;
  const rubricPeriod = `${formatRubricDate(activeRubric.startDate)} - ${formatRubricDate(activeRubric.endDate)}`;
  const [topicState, setTopicState] = useState<Record<string, TopicState>>(() => buildInitialTopicState(topics));
  const availableAgentOptions = useMemo(() => {
    const options = (agentOptions || [])
      .filter((agent) => agent.agentName || agent.displayName)
      .sort((a, b) => (a.agentName || a.displayName).localeCompare(b.agentName || b.displayName));
    if (options.length) return options;
    return FALLBACK_AGENT_NAMES.map((name) => ({
      username: name.split(" ")[0] || name,
      displayName: name,
      agentName: name,
      role: "QA Target",
    }));
  }, [agentOptions]);
  const selectedAgentOption = useMemo(
    () => availableAgentOptions.find((agent) => agent.agentName === agentName || agent.displayName === agentName),
    [agentName, availableAgentOptions]
  );

  useEffect(() => {
    setTopicState((current) => {
      const next = buildInitialTopicState(topics);
      topics.forEach((topic) => {
        next[topic.code] = current[topic.code] || next[topic.code];
      });
      return next;
    });
  }, [activeRubric.code, topics]);

  useEffect(() => {
    const rawDrafts = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    const rawLegacyDraft = window.localStorage.getItem(LEGACY_DRAFT_STORAGE_KEY);
    if (!rawDrafts && !rawLegacyDraft) return;

    try {
      const parsedDrafts = rawDrafts ? JSON.parse(rawDrafts) : [];
      const drafts = Array.isArray(parsedDrafts) ? parsedDrafts as EvaluationDraft[] : [];
      if (!drafts.length && rawLegacyDraft) {
        const legacyDraft = normalizeDraft(JSON.parse(rawLegacyDraft) as EvaluationDraft);
        window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify([legacyDraft]));
        window.localStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
        setDraftInbox([legacyDraft]);
        loadDraftIntoForm(legacyDraft);
        return;
      }

      const normalizedDrafts = sortDrafts(drafts.map(normalizeDraft));
      setDraftInbox(normalizedDrafts);
      if (normalizedDrafts[0]) loadDraftIntoForm(normalizedDrafts[0]);
    } catch {
      setDraftMessage("Draft could not be loaded. Please save a new draft.");
    }
  }, []);

  useEffect(() => {
    const rawHistory = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!rawHistory) return;
    try {
      const parsed = JSON.parse(rawHistory);
      if (Array.isArray(parsed)) {
        setEvaluationHistory(parsed as EvaluationRecord[]);
      }
    } catch {
      setDraftMessage("History could not be loaded.");
    }
  }, []);

  useEffect(() => {
    if (workspaceView === "report") {
      void loadSubmittedRecords();
    }
  }, [workspaceView]);

  const finalScore = useMemo(
    () => topics.reduce((sum, topic) => sum + Number(topicState[topic.code]?.score || 0), 0),
    [topicState, topics]
  );
  const completedTopics = useMemo(
    () => topics.filter((topic) => topicState[topic.code]?.reason.trim()).length,
    [topicState, topics]
  );
  const completionPct = topics.length ? Math.round((completedTopics / topics.length) * 100) : 0;
  const grade = gradeFromScore(finalScore, criticalError);

  const evidencePreviewValue = useMemo(() => {
    const manualUrl = evidenceUrl.trim();
    const attached = evidenceFiles.map((file) => file.storedUrl || file.previewUrl || `attachment://${caseId || "draft-case"}/${file.name}`);
    return [manualUrl, ...attached].filter(Boolean).join("\n");
  }, [caseId, evidenceFiles, evidenceUrl]);

  const previewColumns = useMemo(() => {
    const base: Record<string, string | number> = {
      "Agent Name": agentName || "-",
      "Audit Date": formatThaiDate(auditDate),
      "Waiting Time": waitingTime || "-",
      "Service Time": serviceTime || "-",
      "Case ID": caseId || "-",
      "Case URL": caseUrl || "-",
      "Customer Inquiry": inquiry || "-",
      "Case Description": caseDescription || "-",
      "Case Image URL": evidencePreviewValue || "-",
      "QA Scheme": activeRubric.code,
      "Rubric Version": activeRubric.name,
      "Rubric Active Period": rubricPeriod,
      "Evaluator Name": "Songpon Phothong",
      "Evaluation Started At": evaluationStartedAt || "-",
      "Evaluation Submitted At": evaluationSubmittedAt || "-",
      "Draft Saved At": draftSavedAt || "-",
      "Evaluation Status": evaluationStatus,
      "Final Score": criticalError ? 0 : finalScore,
      "Critical Error": criticalError ? "YES" : "NO",
      "Month Label": auditDate ? new Date(`${auditDate}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "-",
      "Review Status": "Draft",
    };

    topics.forEach((topic) => {
      base[`${topic.code} Score`] = topicState[topic.code]?.score ?? 0;
      base[`${topic.code} Comment`] = topicState[topic.code]?.reason || "-";
    });

    return base;
  }, [activeRubric.code, activeRubric.name, agentName, auditDate, caseDescription, caseId, caseUrl, criticalError, draftSavedAt, evaluationStartedAt, evaluationStatus, evaluationSubmittedAt, evidencePreviewValue, finalScore, inquiry, rubricPeriod, serviceTime, topicState, topics, waitingTime]);

  function makeDraftId(draftCaseId: string, draftAuditDate: string) {
    const caseKey = draftCaseId.trim().toUpperCase() || "UNTITLED-CASE";
    const dateKey = draftAuditDate || todayInputValue();
    return `${caseKey}::${dateKey}`;
  }

  function sortDrafts(drafts: EvaluationDraft[]) {
    return [...drafts].sort((a, b) => Number(b.savedAtMs || 0) - Number(a.savedAtMs || 0));
  }

  function normalizeDraft(draft: EvaluationDraft): EvaluationDraft {
    const draftId = draft.draftId || makeDraftId(draft.caseId || "", draft.auditDate || "");
    return {
      ...draft,
      draftId,
      title: draft.title || `${draft.caseId || "Untitled Case"} · ${draft.agentName || "No agent selected"}`,
      savedAtMs: draft.savedAtMs || Date.now(),
      evaluationStatus: draft.evaluationStatus || "Draft",
      topicState: draft.topicState || {},
    };
  }

  function persistDrafts(nextDrafts: EvaluationDraft[]) {
    const sortedDrafts = sortDrafts(nextDrafts.map(normalizeDraft));
    setDraftInbox(sortedDrafts);
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(sortedDrafts));
  }

  function persistHistory(nextHistory: EvaluationRecord[]) {
    setEvaluationHistory(nextHistory);
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(nextHistory));
  }

  function buildCurrentDraft(savedAt: string, savedAtMs: number): EvaluationDraft {
    const startedAt = evaluationStartedAt || savedAt;
    const draftId = makeDraftId(caseId, auditDate);
    return {
      draftId,
      title: `${caseId || "Untitled Case"} · ${agentName || "No agent selected"}`,
      agentName,
      auditDate,
      waitingTime,
      serviceTime,
      caseId,
      caseUrl,
      inquiry,
      caseDescription,
      evidenceUrl,
      criticalError,
      evaluationStartedAt: startedAt,
      evaluationSubmittedAt,
      evaluationStatus: "Draft",
      topicState,
      savedAt,
      savedAtMs,
    };
  }

  function loadDraftIntoForm(draft: EvaluationDraft) {
    const normalizedDraft = normalizeDraft(draft);
    setAgentName(normalizedDraft.agentName || "");
    setAuditDate(normalizedDraft.auditDate || todayInputValue());
    setWaitingTime(normalizedDraft.waitingTime || "");
    setServiceTime(normalizedDraft.serviceTime || "");
    setCaseId(normalizedDraft.caseId || "");
    setCaseUrl(normalizedDraft.caseUrl || "");
    setInquiry(normalizedDraft.inquiry || "");
    setCaseDescription(normalizedDraft.caseDescription || "");
    setEvidenceUrl(normalizedDraft.evidenceUrl || "");
    setCriticalError(Boolean(normalizedDraft.criticalError));
    setEvaluationStartedAt(normalizedDraft.evaluationStartedAt || "");
    setEvaluationSubmittedAt(normalizedDraft.evaluationSubmittedAt || "");
    setEvaluationStatus(normalizedDraft.evaluationStatus || "Draft");
    setTopicState((current) => ({ ...current, ...(normalizedDraft.topicState || {}) }));
    setDraftSavedAt(normalizedDraft.savedAt || "");
    setActiveDraftId(normalizedDraft.draftId || "");
    setActiveSubmittedRecordId("");
    setDraftMessage(normalizedDraft.savedAt ? `Loaded draft saved at ${normalizedDraft.savedAt}` : "Loaded saved draft");
  }

  function deleteDraft(draftId: string) {
    const nextDrafts = draftInbox.filter((draft) => (draft.draftId || makeDraftId(draft.caseId, draft.auditDate)) !== draftId);
    persistDrafts(nextDrafts);
    if (activeDraftId === draftId) {
      setActiveDraftId("");
      setDraftSavedAt("");
    }
    setDraftMessage("Draft deleted. The current form stays open until you start another draft.");
  }

  function startEvaluation() {
    const timestamp = formatTimestamp(new Date());
    setEvaluationStartedAt(timestamp);
    setEvaluationSubmittedAt("");
    setEvaluationStatus("Draft");
    setActiveSubmittedRecordId("");
    setWorkspaceView("form");
  }

  function resetEvaluationForm() {
    setAgentName("");
    setAuditDate(todayInputValue());
    setWaitingTime("");
    setServiceTime("");
    setCaseId("");
    setCaseUrl("");
    setInquiry("");
    setCaseDescription("");
    setEvidenceUrl("");
    setEvidenceFiles((current) => {
      current.forEach((file) => URL.revokeObjectURL(file.previewUrl));
      return [];
    });
    setCriticalError(false);
    setEvaluationStartedAt("");
    setEvaluationSubmittedAt("");
    setEvaluationStatus("Not Started");
    setDraftSavedAt("");
    setActiveDraftId("");
    setActiveSubmittedRecordId("");
    setTopicState(buildInitialTopicState(topics));
  }

  async function submitEvaluation() {
    const normalizedSubmitCaseId = normalizeCaseId(caseId);
    if (!normalizedSubmitCaseId) {
      setDraftMessage("Please enter Case ID before submitting the evaluation.");
      return;
    }
    try {
      const [stored, rawRecords] = await Promise.all([
        fetchStoredEvaluations(),
        loadRawDataReportRecords(),
      ]);
      const duplicateSubmitted = stored.find(
        (record) =>
          normalizeCaseId(record.caseId) === normalizedSubmitCaseId &&
          String(record.id || "") !== String(activeSubmittedRecordId || "")
      );
      const duplicateRaw = rawRecords.find((record) => normalizeCaseId(record.caseId) === normalizedSubmitCaseId);
      if (duplicateSubmitted || duplicateRaw) {
        const source = duplicateSubmitted ? "QA Evaluation Form" : duplicateRaw?.sourceName || "RawData";
        setDraftMessage(`Case ID ${normalizedSubmitCaseId} already exists in ${source}. Open the existing submitted case from Report if you need to edit it.`);
        window.alert(`Case ID ${normalizedSubmitCaseId} already exists in ${source}.\n\nระบบไม่ให้ Submit เลขเคสซ้ำ ถ้าต้องแก้เคสที่เคยประเมินแล้ว ให้ไปที่ Report แล้วกด Edit เคสนั้นครับ`);
        return;
      }
    } catch (error) {
      setDraftMessage(error instanceof Error ? error.message : "Could not validate duplicate Case ID before submit.");
      return;
    }

    const now = new Date();
    const submittedAt = formatTimestamp(now);
    const draftId = activeDraftId || makeDraftId(caseId, auditDate);
    const topicSummaries = topics.map((topic) => ({
      topic,
      score: Number(topicState[topic.code]?.score || 0),
      reason: topicState[topic.code]?.reason || "",
      pct: topic.max ? (Number(topicState[topic.code]?.score || 0) / topic.max) * 100 : 0,
    }));
    const submittedTopicRows: StoredEvaluationTopic[] = topicSummaries.map((item) => ({
      code: item.topic.code,
      title: item.topic.title,
      max: item.topic.max,
      score: item.score,
      comment: item.reason,
    }));
    const strengths = topicSummaries
      .filter((item) => item.pct >= 90)
      .slice(0, 3)
      .map((item) => `${item.topic.code} ${item.topic.title}: ${item.score}/${item.topic.max}`);
    const improvements = topicSummaries
      .filter((item) => item.pct < 80)
      .slice(0, 3)
      .map((item) => `${item.topic.code} ${item.topic.title}: ${item.score}/${item.topic.max}`);
    const historyRecord: EvaluationRecord = {
      recordId: activeSubmittedRecordId || `${caseId || "UNTITLED"}-${now.getTime()}`,
      evaluationKey: activeSubmittedRecordId || undefined,
      pdfButtonLabel: `${caseId || "Untitled"} Original PDF`,
      caseId: caseId || "Untitled Case",
      agentName,
      targetUsername: selectedAgentOption?.username || "",
      targetDisplayName: selectedAgentOption?.displayName || agentName,
      targetEmail: selectedAgentOption?.email || "",
      targetRole: selectedAgentOption?.role || "",
      auditDate,
      auditTimestamp: submittedAt,
      waitingTime,
      serviceTime,
      caseUrl,
      inquiry,
      caseDescription,
      evidenceUrls: evidencePreviewValue.split(/\n+/).map((item) => item.trim()).filter(Boolean),
      finalScore: criticalError ? 0 : finalScore,
      grade,
      criticalError,
      qaScheme: activeRubric.code,
      rubricName: activeRubric.name,
      rubricPeriod,
      completedTopics,
      totalTopics: topics.length,
      strengths,
      improvements,
      topics: submittedTopicRows,
      rawDataPreview: previewColumns,
      evaluationStartedAt: evaluationStartedAt || submittedAt,
      submittedAt,
    };
    setSubmitPreview({ record: historyRecord, draftId });
    setDraftMessage("Review the Case Detail preview, then confirm submit to save the evaluation.");
  }

  async function confirmSubmitEvaluation() {
    if (!submitPreview) return;
    const { record, draftId } = submitPreview;
    setEvaluationStartedAt(record.evaluationStartedAt || record.submittedAt);
    setEvaluationSubmittedAt(record.submittedAt);
    setEvaluationStatus("Submitted");
    persistDrafts(draftInbox.filter((draft) => (draft.draftId || makeDraftId(draft.caseId, draft.auditDate)) !== draftId));
    setActiveDraftId("");
    setDraftSavedAt("");
    await onSubmitEvaluation?.(record);
    persistHistory([record, ...evaluationHistory.filter((item) => item.recordId !== record.recordId)]);
    setActiveSubmittedRecordId("");
    setSubmitPreview(null);
    resetEvaluationForm();
    setWorkspaceView("form");
    setDraftMessage(`Evaluation submitted at ${record.submittedAt}. Result task was sent to ${record.targetDisplayName || record.agentName || "the selected agent"}.`);
  }

  function saveDraft() {
    const now = new Date();
    const savedAt = formatTimestamp(now);
    const savedAtMs = now.getTime();
    const draft = buildCurrentDraft(savedAt, savedAtMs);
    const nextDrafts = [draft, ...draftInbox.filter((item) => (item.draftId || makeDraftId(item.caseId, item.auditDate)) !== draft.draftId)];
    persistDrafts(nextDrafts);
    setActiveDraftId(draft.draftId || "");
    setEvaluationStartedAt(draft.evaluationStartedAt);
    setEvaluationStatus("Draft");
    setDraftSavedAt(savedAt);
    setDraftMessage(`Draft saved for ${draft.caseId || "Untitled Case"} at ${savedAt}`);
    setWorkspaceView("drafts");
  }

  function updateTopic(code: string, patch: Partial<TopicState>) {
    setTopicState((current) => ({
      ...current,
      [code]: {
        ...current[code],
        ...patch,
      },
    }));
  }

  async function handleEvidenceFiles(files: FileList | null) {
    if (!files?.length) return;
    const acceptedFiles = Array.from(files).filter((file) => file.type.startsWith("image/") || file.type === "application/pdf");
    const nextFiles = await Promise.all(
      acceptedFiles.map(async (file) => {
        const previewUrl = URL.createObjectURL(file);
        const dataUrl = file.type.startsWith("image/") && file.size <= 4 * 1024 * 1024 ? await fileToDataUrl(file) : "";
        return {
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        type: file.type,
        size: file.size,
          previewUrl,
          storedUrl: dataUrl || previewUrl,
        };
      })
    );

    setEvidenceFiles((current) => [...current, ...nextFiles]);
  }

  function buildRowDataRows(records: EvaluationRecord[]): RawDataExportRow[] {
    const allTopicCodes = Array.from(
      new Set(records.flatMap((record) => record.topics.map((topic) => topic.code)))
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    return records.map((record) => {
      const row: RawDataExportRow = {
        Timestamp: parseDateTimeValue(record.submittedAt) || record.submittedAt,
        "Agent Name": record.agentName,
        "Audit Date": record.auditDate ? new Date(`${record.auditDate}T00:00:00`) : "",
        "Waiting Time": parseTimeValue(record.waitingTime) || record.waitingTime || "",
        "Service Time": parseTimeValue(record.serviceTime) || record.serviceTime || "",
        "Case ID": record.caseId,
        "Case URL": record.caseUrl || "",
        "Customer Inquiry": record.inquiry || "",
        "Case Description": record.caseDescription || "",
        "Case Image URL": record.evidenceUrls.join("\n"),
        "QA Scheme": record.qaScheme,
        "Rubric Version": record.rubricName,
        "Rubric Active Period": record.rubricPeriod,
        "Evaluator Name": "Songpon Phothong",
        "Evaluation Started At": parseDateTimeValue(record.evaluationStartedAt) || record.evaluationStartedAt,
        "Evaluation Submitted At": parseDateTimeValue(record.submittedAt) || record.submittedAt,
        "Evaluation Status": "Submitted",
        "Final Score": record.finalScore,
        "Grade": record.grade,
        "Critical Error": record.criticalError ? "YES" : "NO",
        "RawData File": "QA Evaluation Form",
      };

      allTopicCodes.forEach((code) => {
        const topic = record.topics.find((item) => item.code === code);
        row[`${code} Score`] = topic?.score ?? "";
        row[`${code} Comment`] = topic?.comment ?? "";
      });

      return row;
    });
  }

  function filterRecordsByReportDate(records: EvaluationRecord[]) {
    const fromMs = reportDateFrom ? new Date(`${reportDateFrom}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const toMs = reportDateTo ? new Date(`${reportDateTo}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;
    return records.filter((record) => {
      const dateMs = record.auditDate ? new Date(`${record.auditDate}T00:00:00`).getTime() : Number.NaN;
      if (Number.isNaN(dateMs)) return false;
      return dateMs >= fromMs && dateMs <= toMs;
    });
  }

  function filterRawRecordsByReportDate(records: RawReportRecord[]) {
    const fromMs = reportDateFrom ? new Date(`${reportDateFrom}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const toMs = reportDateTo ? new Date(`${reportDateTo}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;
    return records.filter((record) => {
      if (Number.isNaN(record.auditDateMs)) return false;
      return record.auditDateMs >= fromMs && record.auditDateMs <= toMs;
    });
  }

  function normalizeCaseId(value: unknown) {
    return String(value ?? "").trim().toUpperCase();
  }

  function matchesReportSearch(record: Pick<EvaluationRecord, "caseId" | "agentName" | "targetDisplayName" | "auditDate" | "grade">) {
    const keyword = reportSearch.trim().toLowerCase();
    if (!keyword) return true;
    return [
      record.caseId,
      record.agentName,
      record.targetDisplayName,
      record.auditDate ? formatThaiDate(record.auditDate) : "",
      record.grade,
    ].some((value) => String(value || "").toLowerCase().includes(keyword));
  }

  function matchesRawReportSearch(record: RawReportRecord) {
    const keyword = reportSearch.trim().toLowerCase();
    if (!keyword) return true;
    return [
      record.caseId,
      record.agentName,
      record.auditDate ? formatThaiDate(record.auditDate) : "",
      record.grade,
      record.sourceName,
    ].some((value) => String(value || "").toLowerCase().includes(keyword));
  }

  function storedRecordToEvaluationRecord(item: Awaited<ReturnType<typeof fetchStoredEvaluations>>[number]): EvaluationRecord {
    return {
      ...item,
      recordId: item.id,
      evaluationKey: item.evaluationKey,
      pdfButtonLabel: `${item.caseId || "Untitled"} Original PDF`,
      rawDataPreview: item.rawDataPreview || {},
      targetEmail: item.targetEmail,
    };
  }

  async function loadSubmittedRecords() {
    setSubmittedRecordsLoading(true);
    try {
      const [stored, rawRecords] = await Promise.all([
        fetchStoredEvaluations(),
        loadRawDataReportRecords(),
      ]);
      setSubmittedRecords(stored.map(storedRecordToEvaluationRecord));
      setRawReportRecords(rawRecords);
      setReportMessage(`Loaded ${stored.length} submitted evaluation record(s) and ${rawRecords.length} RawData row(s).`);
    } catch (error) {
      setReportMessage(error instanceof Error ? error.message : "Submitted evaluations could not be loaded.");
    } finally {
      setSubmittedRecordsLoading(false);
    }
  }

  function openSubmittedRecord(record: EvaluationRecord) {
    setActiveSubmittedRecordId(record.recordId);
    setAgentName(record.agentName || record.targetDisplayName || "");
    setAuditDate(record.auditDate || todayInputValue());
    setWaitingTime(record.waitingTime || "");
    setServiceTime(record.serviceTime || "");
    setCaseId(record.caseId || "");
    setCaseUrl(record.caseUrl || "");
    setInquiry(record.inquiry || "");
    setCaseDescription(record.caseDescription || "");
    setEvidenceUrl((record.evidenceUrls || []).join("\n"));
    setEvidenceFiles([]);
    setCriticalError(Boolean(record.criticalError));
    setEvaluationStartedAt(record.evaluationStartedAt || record.auditTimestamp || "");
    setEvaluationSubmittedAt(record.submittedAt || "");
    setEvaluationStatus("Draft");
    setDraftSavedAt("");
    const nextTopicState = buildInitialTopicState(getRubricForDate(record.auditDate || auditDate).topics);
    (record.topics || []).forEach((topic) => {
      nextTopicState[topic.code] = {
        score: Number(topic.score || 0),
        reason: topic.comment || "",
      };
    });
    setTopicState(nextTopicState);
    setWorkspaceView("form");
    setDraftMessage(`Loaded submitted case ${record.caseId} for editing. Submit Evaluation again to update the saved record.`);
  }

  async function deleteSubmittedRecord(record: EvaluationRecord) {
    const ok = window.confirm(`Delete submitted evaluation ${record.caseId}? This removes it from Dashboard/Summary after refresh.`);
    if (!ok) return;
    try {
      await deleteStoredEvaluation(record.recordId);
      setSubmittedRecords((current) => current.filter((item) => item.recordId !== record.recordId));
      setEvaluationHistory((current) => current.filter((item) => item.recordId !== record.recordId));
      setReportMessage(`Deleted submitted evaluation ${record.caseId}. Refresh Dashboard/Summary to remove it from the score.`);
      if (activeSubmittedRecordId === record.recordId) setActiveSubmittedRecordId("");
    } catch (error) {
      setReportMessage(error instanceof Error ? error.message : "Submitted evaluation could not be deleted.");
    }
  }

  async function exportEvaluationRowData() {
    setReportMessage("Loading RawData and submitted evaluations...");
    const [stored, rawRecords] = await Promise.all([
      fetchStoredEvaluations(),
      loadRawDataReportRecords(),
    ]);
    const storedRecords: EvaluationRecord[] = stored.map(storedRecordToEvaluationRecord);
    const submittedSource = storedRecords.length ? storedRecords : evaluationHistory;
    const filteredSubmitted = filterRecordsByReportDate(submittedSource);
    const filteredRaw = filterRawRecordsByReportDate(rawRecords);
    const exportRows = [
      ...filteredRaw.map((record) => record.rowData),
      ...buildRowDataRows(filteredSubmitted),
    ];
    if (!exportRows.length) {
      setReportMessage("No RawData or submitted evaluations found in this date range.");
      return;
    }

    const workbook = XLSX.utils.book_new();
    const worksheet = buildRawDataWorksheet(exportRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Raw_Data");
    XLSX.writeFile(workbook, `QA_Evaluation_RowData_${reportDateFrom || "start"}_${reportDateTo || "end"}.xlsx`);
    setReportMessage(`Exported ${filteredRaw.length} RawData row(s) and ${filteredSubmitted.length} submitted evaluation row(s).`);
  }

  function removeEvidenceFile(id: string) {
    setEvidenceFiles((current) => {
      const target = current.find((file) => file.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((file) => file.id !== id);
    });
  }

  const visibleSubmittedReportRecords = filterRecordsByReportDate(submittedRecords).filter(matchesReportSearch);
  const visibleRawReportRecords = filterRawRecordsByReportDate(rawReportRecords).filter(matchesRawReportSearch);

  return (
    <div className="min-h-screen bg-[#eef5f1] text-slate-950" style={{ fontFamily: "Aptos, 'Noto Sans Thai', 'Segoe UI', sans-serif" }}>
      <PageHero
        eyebrow="QA Evaluation"
        title="Create QA Evaluation"
        subtitle="Corporate QA evaluation form with live scoring, rubric version control, evidence preview, and RawData output preview."
        workspaceTitle="QA Rubric Active Period"
        workspaceSubtitle={`${activeRubric.code} · ${rubricPeriod}`}
      />

      <div className="mx-auto max-w-[1760px] space-y-6 px-4 py-6 sm:px-5 lg:px-6 2xl:px-8">
        <div className="grid gap-4 rounded-[26px] border border-emerald-200 bg-white p-4 shadow-[0_18px_48px_rgba(15,23,42,0.08)] lg:grid-cols-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">Workbook</div>
            <div className="mt-1 text-lg font-black text-slate-950">QA Evaluation Form</div>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-700">Rubric Code</div>
            <div className="mt-1 text-lg font-black text-slate-950">{activeRubric.code}</div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">Completion</div>
            <div className="mt-1 text-lg font-black text-slate-950">{completionPct}%</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Draft Score</div>
            <div className="mt-1 text-lg font-black text-slate-950">{criticalError ? 0 : finalScore}/{activeRubric.totalScore}</div>
          </div>
        </div>

        <div className="rounded-[24px] border border-emerald-200 bg-white p-4 shadow-[0_16px_42px_rgba(15,23,42,0.07)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Evaluator</div>
                <div className="mt-1 text-sm font-black text-slate-950">Songpon Phothong</div>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Status</div>
                <div className="mt-1 text-sm font-black text-emerald-950">{evaluationStatus}</div>
              </div>
              <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-700">Evaluation Started At</div>
                <div className="mt-1 text-sm font-black text-slate-950">{evaluationStartedAt || "Not started"}</div>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Evaluation Submitted At</div>
                <div className="mt-1 text-sm font-black text-slate-950">{evaluationSubmittedAt || "Not submitted"}</div>
              </div>
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-700">Draft Saved At</div>
                <div className="mt-1 text-sm font-black text-slate-950">{draftSavedAt || "Not saved"}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={startEvaluation} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-[0_12px_24px_rgba(15,23,42,0.22)] transition hover:bg-slate-800">
                Start Evaluation
              </button>
              <button type="button" onClick={() => setWorkspaceView("drafts")} className="relative rounded-xl border border-indigo-300 bg-indigo-50 px-5 py-3 text-sm font-black text-indigo-800 transition hover:bg-indigo-100">
                Task Draft
                <span className="ml-2 inline-flex min-w-[24px] items-center justify-center rounded-full bg-indigo-700 px-2 py-0.5 text-xs text-white">{draftInbox.length}</span>
              </button>
              <button type="button" onClick={() => setWorkspaceView("history")} className="rounded-xl border border-sky-300 bg-sky-50 px-5 py-3 text-sm font-black text-sky-800 transition hover:bg-sky-100">
                Task History
              </button>
              <button type="button" onClick={() => setWorkspaceView("report")} className="rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-900 transition hover:bg-emerald-100">
                Report
              </button>
              <button type="button" onClick={submitEvaluation} className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white shadow-[0_12px_24px_rgba(4,120,87,0.22)] transition hover:bg-emerald-800">
                Submit Evaluation
              </button>
            </div>
          </div>
          {draftMessage ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
              {draftMessage}
            </div>
          ) : null}
        </div>
        {workspaceView === "drafts" ? (
          <div className="overflow-hidden rounded-[26px] border border-sky-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between border-b border-sky-100 bg-gradient-to-r from-slate-950 via-sky-900 to-emerald-800 px-5 py-5 text-white">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-100">Task Draft</div>
                <div className="mt-1 text-xl font-black">Saved Draft Cases</div>
              </div>
              <button type="button" onClick={() => setWorkspaceView("form")} className="rounded-xl border border-white/35 bg-white/10 px-4 py-2 text-sm font-black text-white transition hover:bg-white/20">
                Back to Form
              </button>
            </div>
            <div className="p-5">
              {draftInbox.length ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {draftInbox.map((draft) => {
                    const draftId = draft.draftId || makeDraftId(draft.caseId, draft.auditDate);
                    const draftScore = topics.reduce((sum, topic) => sum + Number(draft.topicState?.[topic.code]?.score || 0), 0);
                    return (
                      <div key={draftId} className="rounded-[18px] border border-slate-200 bg-slate-50 p-4 shadow-sm transition hover:border-sky-300 hover:bg-white">
                        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Case Draft</div>
                        <div className="mt-1 text-lg font-black text-slate-950">{draft.caseId || "Untitled Case"}</div>
                        <div className="mt-1 text-xs font-semibold text-slate-500">{draft.agentName || "No agent selected"}</div>
                        <div className="mt-3 text-xs font-semibold text-slate-600">Saved at: <span className="font-black text-slate-900">{draft.savedAt || "-"}</span></div>
                        <div className="mt-1 text-xs font-semibold text-slate-600">Score: <span className="font-black text-slate-900">{draft.criticalError ? 0 : draftScore}/{activeRubric.totalScore}</span></div>
                        <div className="mt-4 flex gap-2">
                          <button type="button" onClick={() => { loadDraftIntoForm(draft); setWorkspaceView("form"); }} className="flex-1 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-black text-white transition hover:bg-sky-800">
                            Open Draft
                          </button>
                          <button type="button" onClick={() => deleteDraft(draftId)} className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-black text-rose-700 transition hover:bg-rose-50">
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[20px] border border-dashed border-sky-200 bg-sky-50 px-5 py-8 text-center">
                  <div className="text-base font-black text-slate-950">No draft case right now.</div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">Save Draft from the form and your case will appear here.</div>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {workspaceView === "history" ? (
          <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-950 px-5 py-5 text-white">
              <div className="text-xl font-black">Task History</div>
              <button type="button" onClick={() => setWorkspaceView("form")} className="rounded-xl border border-white/35 bg-white/10 px-4 py-2 text-sm font-black text-white transition hover:bg-white/20">Back to Form</button>
            </div>
            <div className="p-5">
              {evaluationHistory.length ? (
                <div className="space-y-3">
                  {evaluationHistory.slice(0, 20).map((item) => (
                    <div key={item.recordId} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-sm font-black text-slate-950">{item.caseId} - {item.targetDisplayName || item.agentName || "-"}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-600">Submitted at {item.submittedAt} | Score {item.finalScore}/{activeRubric.totalScore} | Grade {item.grade}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm font-semibold text-slate-500">No submitted evaluation history yet.</div>
              )}
            </div>
          </div>
        ) : null}

        {workspaceView === "report" ? (
          <div className="overflow-hidden rounded-[26px] border border-emerald-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between border-b border-emerald-200 bg-gradient-to-r from-emerald-800 to-sky-700 px-5 py-5 text-white">
              <div className="text-xl font-black">Report Workspace</div>
              <button type="button" onClick={() => setWorkspaceView("form")} className="rounded-xl border border-white/35 bg-white/10 px-4 py-2 text-sm font-black text-white transition hover:bg-white/20">Back to Form</button>
            </div>
            <div className="p-5">
              <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.4fr_auto]">
                <label className="block">
                  <span className={labelClass}>Date From</span>
                  <input type="date" value={reportDateFrom} onChange={(event) => setReportDateFrom(event.target.value)} className={inputClass} />
                </label>
                <label className="block">
                  <span className={labelClass}>Date To</span>
                  <input type="date" value={reportDateTo} onChange={(event) => setReportDateTo(event.target.value)} className={inputClass} />
                </label>
                <label className="block">
                  <span className={labelClass}>Search Case / Agent</span>
                  <input
                    value={reportSearch}
                    onChange={(event) => setReportSearch(event.target.value)}
                    placeholder="Search Case ID, Agent, Grade, Source..."
                    className={inputClass}
                  />
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={exportEvaluationRowData}
                    className="w-full rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white shadow-[0_12px_24px_rgba(4,120,87,0.22)] transition hover:bg-emerald-800"
                  >
                    Export RowData
                  </button>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
                Export จะรวม RawData เดิมจาก GitHub และเคสใหม่จาก QA Evaluation Form ตามช่วง Audit Date ที่เลือก ส่วนเคสจากฟอร์มสามารถค้นหาแล้วกด Edit เพื่อแก้ไขต่อได้
              </div>
              {reportMessage ? (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                  {reportMessage}
                </div>
              ) : null}
              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-950 px-4 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100">Submitted Evaluations</div>
                    <div className="mt-1 text-base font-black">Search / Edit saved cases</div>
                  </div>
                  <button type="button" onClick={loadSubmittedRecords} className="rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-black text-white transition hover:bg-white/20">
                    Refresh List
                  </button>
                </div>
                <div className="p-4">
                  {submittedRecordsLoading ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-bold text-slate-500">Loading submitted evaluations...</div>
                  ) : visibleSubmittedReportRecords.length || visibleRawReportRecords.length ? (
                    <div className="space-y-5">
                      {visibleSubmittedReportRecords.length ? (
                        <div className="space-y-3">
                          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">QA Evaluation Form · Editable</div>
                          {visibleSubmittedReportRecords.slice(0, 60).map((record) => (
                            <div key={record.recordId} className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 lg:grid-cols-[1.2fr_1fr_110px_160px] lg:items-center">
                              <div>
                                <div className="text-sm font-black text-slate-950">{record.caseId}</div>
                                <div className="mt-1 text-xs font-semibold text-slate-500">{record.agentName || record.targetDisplayName || "-"} | Audit {formatThaiDate(record.auditDate)}</div>
                              </div>
                              <div className="text-xs font-semibold text-slate-600">
                                Submitted: <span className="font-black text-slate-900">{record.submittedAt || "-"}</span>
                              </div>
                              <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-center text-sm font-black text-emerald-800">
                                {record.finalScore}/100 {record.grade}
                              </div>
                              <div className="flex gap-2">
                                <button type="button" onClick={() => openSubmittedRecord(record)} className="flex-1 rounded-xl bg-sky-700 px-3 py-2 text-xs font-black text-white transition hover:bg-sky-800">
                                  Edit
                                </button>
                                <button type="button" onClick={() => deleteSubmittedRecord(record)} className="flex-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-100">
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {visibleRawReportRecords.length ? (
                        <div className="space-y-3">
                          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">GitHub RawData · Export only</div>
                          {visibleRawReportRecords.slice(0, 80).map((record) => (
                            <div key={record.recordId} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 lg:grid-cols-[1.2fr_1fr_110px_160px] lg:items-center">
                              <div>
                                <div className="text-sm font-black text-slate-950">{record.caseId}</div>
                                <div className="mt-1 text-xs font-semibold text-slate-500">{record.agentName || "-"} | Audit {formatThaiDate(record.auditDate)}</div>
                              </div>
                              <div className="text-xs font-semibold text-slate-600">
                                Source: <span className="font-black text-slate-900">{record.sourceName}</span>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-sm font-black text-slate-700">
                                {record.finalScore || "-"} {record.grade}
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xs font-black text-slate-500">
                                Export only
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {(visibleSubmittedReportRecords.length + visibleRawReportRecords.length) > 140 ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                          Showing first 140 matching records. Use search or date range to narrow results.
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-bold text-slate-500">
                      No RawData or submitted evaluations match this date/search.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {workspaceView === "form" ? (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <SectionCard label="Section A" title="Case Information">
              <div className="space-y-4">
                <label className="block">
                  <span className={labelClass}>Agent Full Name</span>
                  <select value={agentName} onChange={(event) => setAgentName(event.target.value)} className={inputClass}>
                    <option value="">Select agent</option>
                    {availableAgentOptions.map((agent) => (
                      <option key={`${agent.username}-${agent.agentName}`} value={agent.agentName || agent.displayName}>
                        {agent.agentName || agent.displayName}{agent.role ? ` · ${agent.role}` : ""}
                      </option>
                    ))}
                  </select>
                  <span className="mt-2 block text-xs font-semibold text-slate-500">
                    แสดงเฉพาะ user ที่ Role ถูกเปิดสิทธิ์ QA Evaluation Target
                  </span>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className={labelClass}>Case ID</span>
                    <input value={caseId} onChange={(event) => setCaseId(event.target.value)} placeholder="AAxxxxxx" className={inputClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Audit Date</span>
                    <input type="date" value={auditDate} onChange={(event) => setAuditDate(event.target.value)} className={inputClass} />
                  </label>
                </div>

                <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-sky-50 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Rubric Selected</div>
                  <div className="mt-1 text-sm font-black text-slate-950">{activeRubric.name}</div>
                  <div className="text-xs font-semibold text-slate-600">{activeRubric.code} · {rubricPeriod}</div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className={labelClass}>Waiting Time</span>
                    <input value={waitingTime} onChange={(event) => setWaitingTime(event.target.value)} placeholder="HH:mm" className={inputClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Service Time</span>
                    <input value={serviceTime} onChange={(event) => setServiceTime(event.target.value)} placeholder="HH:mm" className={inputClass} />
                  </label>
                </div>

                <label className="block">
                  <span className={labelClass}>Case URL</span>
                  <input value={caseUrl} onChange={(event) => setCaseUrl(event.target.value)} placeholder="https://app.oho.chat/..." className={inputClass} />
                </label>

                <label className="block">
                  <span className={labelClass}>Customer Inquiry</span>
                  <AutoGrowTextarea value={inquiry} onChange={(event) => setInquiry(event.target.value)} minRows={3} placeholder="สรุปคำถามหรือประเด็นที่ลูกค้าติดต่อเข้ามา..." className={`${inputClass} leading-6`} />
                </label>

                <label className="block">
                  <span className={labelClass}>Case Description</span>
                  <AutoGrowTextarea value={caseDescription} onChange={(event) => setCaseDescription(event.target.value)} minRows={5} placeholder="สรุปรายละเอียดเคสและสิ่งที่ Agent ดำเนินการ..." className={`${inputClass} leading-6`} />
                </label>
              </div>
            </SectionCard>

            <SectionCard label="Section B" title="Evidence Attachment">
              <div className="space-y-4">
                <label className="block">
                  <span className={labelClass}>Google Drive Evidence Links / PDF / Image</span>
                  <AutoGrowTextarea
                    value={evidenceUrl}
                    onChange={(event) => setEvidenceUrl(event.target.value)}
                    minRows={4}
                    placeholder="Paste Google Drive share links here. Use one link per line for multiple PDFs/images."
                    className={`${inputClass} leading-6`}
                  />
                  <span className="mt-2 block text-xs font-semibold leading-5 text-slate-500">
                    Upload PDF/images to Google Drive, set sharing permission, then paste the links here. Local image attachments are saved as preview data only; automatic Google Drive upload will be a separate integration.
                  </span>
                </label>
                <div className="rounded-2xl border border-dashed border-sky-300 bg-sky-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-black text-white shadow-[0_12px_24px_rgba(2,132,199,0.22)] transition hover:bg-sky-800">
                      Attach Files
                      <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(event) => { handleEvidenceFiles(event.target.files); event.currentTarget.value = ""; }} />
                    </label>
                    <span className="text-xs font-semibold text-slate-600">JPG, PNG, WEBP, PDF · multiple files</span>
                  </div>

                  {evidenceFiles.length ? (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {evidenceFiles.map((file) => {
                        const isImage = file.type.startsWith("image/");
                        return (
                          <div key={file.id} className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm">
                            {isImage ? <img src={file.previewUrl} alt={file.name} className="h-24 w-full object-cover" /> : <div className="flex h-24 items-center justify-center bg-slate-100 text-sm font-black text-slate-600">PDF</div>}
                            <div className="space-y-2 p-3">
                              <div className="truncate text-xs font-black text-slate-900" title={file.name}>{file.name}</div>
                              <div className="text-[11px] font-semibold text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                              <button type="button" onClick={() => removeEvidenceFile(file.id)} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 transition hover:bg-rose-100">Remove</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-sky-100 bg-white px-4 py-3 text-xs font-semibold text-slate-600">
                      ยังไม่มีไฟล์แนบ รอบนี้เป็น Preview ในเครื่องก่อน ต่อ Supabase Storage แล้ว URL จะถูกสร้างอัตโนมัติ
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="space-y-5">
            <SectionCard label="Section C" title="Evaluation Rubric">
              <div className="mb-5 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-sky-50 px-5 py-4">
                <div className="text-xl font-black text-slate-950">QA Scoring Workbook</div>
                <div className="mt-1 text-sm leading-6 text-slate-600">
                  กรอกคะแนนจาก dropdown และระบุเหตุผลการประเมินเป็นรายหัวข้อ รูปแบบนี้จัดเรียงเหมือน worksheet เพื่อให้อ่านง่ายและตรวจทานง่าย
                </div>
              </div>

              <div className="space-y-5">
                {RUBRIC_GROUP_LABELS.map((group, groupIndex) => {
                  const groupTopics = topics.filter((topic) => topic.group === group.key);
                  const open = expandedGroups[group.key];
                  const groupScore = groupTopics.reduce((sum, topic) => sum + Number(topicState[topic.code]?.score || 0), 0);
                  const groupMax = groupTopics.reduce((sum, topic) => sum + topic.max, 0);

                  return (
                    <div key={group.key} className="overflow-hidden rounded-[20px] border border-emerald-200 bg-white shadow-sm">
                      <button type="button" onClick={() => setExpandedGroups((current) => ({ ...current, [group.key]: !open }))} className="flex w-full flex-col gap-3 bg-gradient-to-r from-emerald-800 to-sky-800 px-5 py-4 text-left text-white sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-sm font-black text-emerald-800">{groupIndex + 1}</div>
                          <div>
                            <div className="text-base font-black">{group.title}</div>
                            <div className="mt-1 text-xs font-semibold text-emerald-100">{group.note}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="rounded-xl border border-white/25 bg-white/15 px-3 py-1.5 text-sm font-black">{groupScore}/{groupMax}</span>
                          <span className="text-lg font-black">{open ? "-" : "+"}</span>
                        </div>
                      </button>

                      {open ? (
                        <div className="bg-[#f8fbf8] p-4">
                          <div className="hidden rounded-t-xl border border-emerald-300 bg-[#217346] px-4 py-3 text-[11px] font-black uppercase tracking-[0.15em] text-white lg:grid lg:grid-cols-[74px_minmax(260px,1fr)_130px_80px]">
                            <div>Topic</div>
                            <div>Description</div>
                            <div>Score</div>
                            <div>Max</div>
                          </div>
                          <div className="overflow-hidden rounded-xl border border-emerald-200 bg-white lg:rounded-t-none lg:border-t-0">
                            {groupTopics.map((topic, index) => {
                              const selectedScore = topicState[topic.code]?.score ?? 0;
                              return (
                                <div key={topic.code} className={`border-b border-emerald-100 px-4 py-4 last:border-b-0 ${index % 2 === 0 ? "bg-white" : "bg-emerald-50/35"}`}>
                                  <div className="grid gap-3 lg:grid-cols-[74px_minmax(260px,1fr)_130px_80px] lg:items-start">
                                    <div>
                                      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 lg:hidden">Topic</div>
                                      <div className="mt-1 inline-flex rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-black text-emerald-800 lg:mt-0">{topic.code}</div>
                                    </div>
                                    <div>
                                      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 lg:hidden">Description</div>
                                      <div className="mt-1 text-sm font-bold leading-6 text-slate-950 lg:mt-0">{topic.title}</div>
                                    </div>
                                    <label className="block">
                                      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 lg:hidden">Score</span>
                                      <select
                                        value={selectedScore}
                                        onChange={(event) => updateTopic(topic.code, { score: Number(event.target.value) })}
                                        className="mt-1 w-full rounded-lg border border-emerald-300 bg-white px-3 py-2.5 text-sm font-black text-slate-950 shadow-inner outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100 lg:mt-0"
                                      >
                                        {scoreOptions(topic.max).map((score) => (
                                          <option key={score} value={score}>{score}</option>
                                        ))}
                                      </select>
                                      <div className="mt-1 text-[11px] font-bold text-emerald-700">Score {selectedScore}/{topic.max}</div>
                                    </label>
                                    <div>
                                      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 lg:hidden">Max</div>
                                      <div className="mt-1 inline-flex rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-700 lg:mt-0">{topic.max}</div>
                                    </div>
                                  </div>
                                  <label className="mt-3 block rounded-xl border border-emerald-100 bg-white/80 p-3">
                                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">Assessment Reason</span>
                                    <AutoGrowTextarea value={topicState[topic.code]?.reason || ""} onChange={(event) => updateTopic(topic.code, { reason: event.target.value })} minRows={3} placeholder="ระบุเหตุผลการประเมินหัวข้อนี้..." className="mt-2 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm leading-6 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" />
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </div>

          <div className="space-y-6 xl:sticky xl:top-4 xl:self-start">
            <div className="overflow-hidden rounded-[24px] border border-emerald-200 bg-white shadow-[0_20px_48px_rgba(15,118,110,0.14)]">
              <div className="bg-gradient-to-br from-emerald-800 via-emerald-700 to-sky-700 px-6 py-6 text-white">
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-100">Live Score</div>
                <div className="mt-5 flex items-end gap-2">
                  <div className="text-6xl font-black leading-none">{criticalError ? 0 : finalScore}</div>
                  <div className="pb-2 text-2xl font-black text-white/80">/{activeRubric.totalScore}</div>
                </div>
                <div className="mt-4 flex items-center justify-between rounded-xl border border-white/20 bg-white/10 px-4 py-3">
                  <span className="text-sm font-bold text-white/85">Current Grade</span>
                  <span className="text-3xl font-black">{grade}</span>
                </div>
              </div>

              <div className="space-y-4 p-5">
                <div>
                  <div className="flex items-center justify-between text-sm font-black text-slate-700">
                    <span>Completion</span>
                    <span>{completionPct}%</span>
                  </div>
                  <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-600" style={{ width: `${completionPct}%` }} />
                  </div>
                  <div className="mt-2 text-xs font-semibold text-slate-500">{completedTopics}/{topics.length} topic reason(s) completed</div>
                </div>

                <label className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <span className="text-sm font-black text-amber-900">Critical Error</span>
                  <input type="checkbox" checked={criticalError} onChange={(event) => setCriticalError(event.target.checked)} className="h-5 w-5 accent-rose-600" />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Status</div>
                    <div className="mt-1 text-sm font-black text-slate-950">{evaluationStatus}</div>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">QA Scheme</div>
                    <div className="mt-1 text-sm font-black text-emerald-900">{activeRubric.code}</div>
                  </div>
                </div>

                <button type="button" onClick={saveDraft} className="w-full rounded-xl border border-emerald-300 bg-white px-5 py-3.5 text-sm font-black text-emerald-800 transition hover:bg-emerald-50">Save Draft</button>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Preview RawData Row</div>
              <div className="mt-4 max-h-[360px] overflow-auto rounded-xl border border-slate-200">
                {Object.entries(previewColumns).slice(0, 22).map(([key, value], index) => (
                  <div key={key} className={`grid grid-cols-[130px_1fr] border-b border-slate-200 last:border-b-0 ${index % 2 === 0 ? "bg-white" : "bg-slate-50"}`}>
                    <div className="bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{key}</div>
                    <div className="break-words px-3 py-2 text-xs font-bold text-slate-800">{String(value)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        ) : null}
      </div>
      {submitPreview ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 px-4 py-8 backdrop-blur-sm">
          <div className="mx-auto max-w-[1180px] overflow-hidden rounded-[28px] border border-white/30 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.35)]">
            <div className="flex flex-col gap-4 bg-gradient-to-r from-slate-950 via-emerald-900 to-sky-800 px-6 py-5 text-white lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-100">Submit Preview</div>
                <div className="mt-1 text-2xl font-black">Case Detail Template</div>
                <div className="mt-1 text-sm font-semibold text-white/75">Review this document before saving the evaluation.</div>
              </div>
              <div className="rounded-2xl border border-white/25 bg-white/10 px-5 py-3 text-right">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100">PDF Button</div>
                <div className="mt-1 text-lg font-black">{submitPreview.record.pdfButtonLabel}</div>
              </div>
            </div>

            <div className="bg-[#f5f8f3] p-5">
              <div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="border-b border-slate-200 pb-4">
                  <div className="text-3xl font-black text-slate-950">Case Detail</div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">Generated from QA Evaluation Form after final confirmation.</div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Agent</div>
                    <div className="mt-1 text-lg font-black text-slate-950">{submitPreview.record.agentName || "-"}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Month / Audit Date</div>
                    <div className="mt-1 text-lg font-black text-slate-950">{formatThaiDate(submitPreview.record.auditDate) || "-"}</div>
                  </div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Case ID</div>
                    <div className="mt-1 text-lg font-black text-emerald-950">{submitPreview.record.caseId}</div>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_160px_120px]">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Critical Error</div>
                    <div className="mt-1 text-base font-black text-slate-950">{submitPreview.record.criticalError ? "YES" : "NO"}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Customer Inquiry</div>
                    <div className="mt-1 line-clamp-3 text-sm font-semibold leading-6 text-slate-800">{submitPreview.record.inquiry || "-"}</div>
                  </div>
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-center">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-700">Final Score</div>
                    <div className="mt-1 text-3xl font-black text-sky-950">{submitPreview.record.finalScore}</div>
                  </div>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Grade</div>
                    <div className="mt-1 text-3xl font-black text-amber-950">{submitPreview.record.grade}</div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Case Description</div>
                  <div className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-slate-800">{submitPreview.record.caseDescription || "-"}</div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Case URL</div>
                    <div className="mt-2 break-all text-sm font-semibold text-sky-800">{submitPreview.record.caseUrl || "-"}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Evidence URL / PDF / Image</div>
                    <div className="mt-2 space-y-1">
                      {submitPreview.record.evidenceUrls.length ? submitPreview.record.evidenceUrls.slice(0, 4).map((url, index) => (
                        <div key={`${url}-${index}`} className="break-all text-sm font-semibold text-sky-800">{url}</div>
                      )) : <div className="text-sm font-semibold text-slate-500">-</div>}
                    </div>
                  </div>
                </div>

                <div className="mt-5 overflow-hidden rounded-2xl border border-emerald-300 bg-white">
                  <div className="grid grid-cols-[80px_minmax(240px,1fr)_90px_80px_90px_120px] bg-[#217346] px-4 py-3 text-[11px] font-black uppercase tracking-[0.13em] text-white">
                    <div>Topic</div>
                    <div>Description</div>
                    <div>Score</div>
                    <div>Max</div>
                    <div>Score %</div>
                    <div>Status</div>
                  </div>
                  <div className="max-h-[420px] overflow-auto">
                    {submitPreview.record.topics.map((topic, index) => {
                      const pct = topic.max ? Math.round((topic.score / topic.max) * 100) : 0;
                      const status = pct >= 90 ? "Excellent" : pct >= 80 ? "Good" : pct >= 70 ? "Watch" : "Focus";
                      return (
                        <div key={topic.code} className={`${index % 2 === 0 ? "bg-white" : "bg-emerald-50/35"} border-b border-emerald-100`}>
                          <div className="grid grid-cols-[80px_minmax(240px,1fr)_90px_80px_90px_120px] px-4 py-3 text-sm">
                            <div className="font-black text-emerald-800">{topic.code}</div>
                            <div className="font-bold text-slate-950">{topic.title}</div>
                            <div className="font-black text-slate-950">{topic.score}</div>
                            <div className="font-bold text-slate-700">{topic.max}</div>
                            <div className="font-bold text-slate-700">{pct}%</div>
                            <div className="font-black text-emerald-800">{status}</div>
                          </div>
                          {topic.comment ? (
                            <div className="border-t border-emerald-100 px-4 py-3">
                              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Evaluation Comment</div>
                              <div className="mt-1 whitespace-pre-line text-sm font-semibold leading-6 text-slate-700">{topic.comment}</div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-6 py-5 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setSubmitPreview(null); setDraftMessage("Submit canceled. You can continue editing before final submit."); }} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50">
                Back to Edit
              </button>
              <button type="button" onClick={confirmSubmitEvaluation} className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white shadow-[0_12px_24px_rgba(4,120,87,0.22)] transition hover:bg-emerald-800">
                OK, Confirm Submit
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
