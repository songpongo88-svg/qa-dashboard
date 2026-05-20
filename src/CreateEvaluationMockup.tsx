import { useEffect, useRef, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import PageHero from "./PageHero";
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
  caseId: string;
  agentName: string;
  targetUsername: string;
  targetDisplayName: string;
  targetEmail?: string;
  targetRole: string;
  auditDate: string;
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
  submittedAt: string;
};

type EvaluationRecord = EvaluationSubmitPayload & {
  recordId: string;
  pdfButtonLabel: string;
  rawDataPreview: Record<string, string | number>;
};

type EvaluationWorkspaceView = "form" | "drafts" | "history" | "report";

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
  const [workspaceView, setWorkspaceView] = useState<EvaluationWorkspaceView>("form");
  const [evaluationHistory, setEvaluationHistory] = useState<EvaluationRecord[]>([]);
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
    const attached = evidenceFiles.map((file) => `supabase://qa-evidence/${caseId || "draft-case"}/${file.name}`);
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
    setTopicState(buildInitialTopicState(topics));
  }

  async function submitEvaluation() {
    const confirmed = window.confirm(
      `Submit this evaluation?\n\nCase: ${caseId || "Untitled Case"}\nAgent: ${agentName || "-"}\nScore: ${criticalError ? 0 : finalScore}/${activeRubric.totalScore}\nGrade: ${grade}`
    );
    if (!confirmed) {
      setDraftMessage("Submit canceled. You can continue editing before final submit.");
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
    const strengths = topicSummaries
      .filter((item) => item.pct >= 90)
      .slice(0, 3)
      .map((item) => `${item.topic.code} ${item.topic.title}: ${item.score}/${item.topic.max}`);
    const improvements = topicSummaries
      .filter((item) => item.pct < 80)
      .slice(0, 3)
      .map((item) => `${item.topic.code} ${item.topic.title}: ${item.score}/${item.topic.max}`);
    if (!evaluationStartedAt) {
      setEvaluationStartedAt(submittedAt);
    }
    setEvaluationSubmittedAt(submittedAt);
    setEvaluationStatus("Submitted");
    persistDrafts(draftInbox.filter((draft) => (draft.draftId || makeDraftId(draft.caseId, draft.auditDate)) !== draftId));
    setActiveDraftId("");
    setDraftSavedAt("");
    await onSubmitEvaluation?.({
      caseId: caseId || "Untitled Case",
      agentName,
      targetUsername: selectedAgentOption?.username || "",
      targetDisplayName: selectedAgentOption?.displayName || agentName,
      targetEmail: selectedAgentOption?.email || "",
      targetRole: selectedAgentOption?.role || "",
      auditDate,
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
      submittedAt,
    });
    const historyRecord: EvaluationRecord = {
      recordId: `${caseId || "UNTITLED"}-${now.getTime()}`,
      pdfButtonLabel: `${caseId || "Untitled"} Original PDF`,
      rawDataPreview: previewColumns,
      caseId: caseId || "Untitled Case",
      agentName,
      targetUsername: selectedAgentOption?.username || "",
      targetDisplayName: selectedAgentOption?.displayName || agentName,
      targetEmail: selectedAgentOption?.email || "",
      targetRole: selectedAgentOption?.role || "",
      auditDate,
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
      submittedAt,
    };
    persistHistory([historyRecord, ...evaluationHistory]);
    resetEvaluationForm();
    setWorkspaceView("form");
    setDraftMessage(`Evaluation submitted at ${submittedAt}. Result task was sent to ${selectedAgentOption?.displayName || agentName || "the selected agent"}.`);
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

  function handleEvidenceFiles(files: FileList | null) {
    if (!files?.length) return;
    const nextFiles = Array.from(files)
      .filter((file) => file.type.startsWith("image/") || file.type === "application/pdf")
      .map((file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        type: file.type,
        size: file.size,
        previewUrl: URL.createObjectURL(file),
      }));

    setEvidenceFiles((current) => [...current, ...nextFiles]);
  }

  function removeEvidenceFile(id: string) {
    setEvidenceFiles((current) => {
      const target = current.find((file) => file.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((file) => file.id !== id);
    });
  }

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
            <div className="p-5 text-sm font-semibold text-slate-600">Report export panel will be connected in the next step of Flow 1-8.</div>
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
                  <span className={labelClass}>Evidence URL / PDF / Image</span>
                  <input value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="วางลิงก์ Google Drive, PDF หรือรูปภาพ" className={inputClass} />
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
    </div>
  );
}
