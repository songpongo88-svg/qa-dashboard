import { useEffect, useMemo, useState, type ReactNode } from "react";
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

const AGENT_NAMES = [
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

function SectionCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-[0_18px_44px_rgba(88,28,135,0.08)]">
      <div className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-700">{label}</div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export default function CreateEvaluationMockup() {
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
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    "Service Standard": true,
    "Answer Quality": true,
    Resolution: false,
    Communication: false,
  });

  const activeRubric = useMemo(() => getRubricForDate(auditDate), [auditDate]);
  const topics = activeRubric.topics;
  const rubricPeriod = `${formatRubricDate(activeRubric.startDate)} - ${formatRubricDate(activeRubric.endDate)}`;
  const [topicState, setTopicState] = useState<Record<string, TopicState>>(() => buildInitialTopicState(topics));

  useEffect(() => {
    setTopicState((current) => {
      const next = buildInitialTopicState(topics);
      topics.forEach((topic) => {
        next[topic.code] = current[topic.code] || next[topic.code];
      });
      return next;
    });
  }, [activeRubric.code, topics]);

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
  }, [activeRubric.code, activeRubric.name, agentName, auditDate, caseDescription, caseId, caseUrl, criticalError, evidencePreviewValue, finalScore, inquiry, rubricPeriod, serviceTime, topicState, topics, waitingTime]);

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
    <div>
      <PageHero
        eyebrow="QA Evaluation"
        title="Create QA Evaluation"
        subtitle="Phase 1: กรอกผลประเมินในเว็บ คำนวณคะแนนสด และ Preview RawData Row ก่อนเชื่อมระบบบันทึกจริง"
        workspaceTitle="QA Rubric Active Period"
        workspaceSubtitle={`${activeRubric.code} · ${rubricPeriod}`}
      />

      <div className="mx-auto max-w-[1720px] space-y-6 px-4 py-6 sm:px-5 lg:px-6 2xl:px-8">
        <div className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <SectionCard label="Case Information">
              <div className="space-y-4">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Agent Full Name</span>
                  <select value={agentName} onChange={(event) => setAgentName(event.target.value)} className="mt-2 w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 shadow-sm outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100">
                    <option value="">Select agent</option>
                    {AGENT_NAMES.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Case ID</span>
                    <input value={caseId} onChange={(event) => setCaseId(event.target.value)} placeholder="AAxxxxxx" className="mt-2 w-full rounded-2xl border border-violet-200 px-4 py-3 text-sm font-bold outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Audit Date</span>
                    <input type="date" value={auditDate} onChange={(event) => setAuditDate(event.target.value)} className="mt-2 w-full rounded-2xl border border-violet-200 px-4 py-3 text-sm font-bold outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
                  </label>
                </div>

                <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">Rubric Selected</div>
                  <div className="mt-1 text-sm font-black text-slate-950">{activeRubric.code}</div>
                  <div className="text-xs font-semibold text-slate-600">{activeRubric.name} · {rubricPeriod}</div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Waiting Time</span>
                    <input value={waitingTime} onChange={(event) => setWaitingTime(event.target.value)} placeholder="HH:mm" className="mt-2 w-full rounded-2xl border border-violet-200 px-4 py-3 text-sm font-bold outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Service Time</span>
                    <input value={serviceTime} onChange={(event) => setServiceTime(event.target.value)} placeholder="HH:mm" className="mt-2 w-full rounded-2xl border border-violet-200 px-4 py-3 text-sm font-bold outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
                  </label>
                </div>

                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Case URL</span>
                  <input value={caseUrl} onChange={(event) => setCaseUrl(event.target.value)} placeholder="https://app.oho.chat/..." className="mt-2 w-full rounded-2xl border border-violet-200 px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
                </label>

                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Customer Inquiry</span>
                  <textarea value={inquiry} onChange={(event) => setInquiry(event.target.value)} rows={3} placeholder="สรุปคำถามหรือประเด็นที่ลูกค้าติดต่อเข้ามา..." className="mt-2 w-full rounded-2xl border border-violet-200 px-4 py-3 text-sm leading-6 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
                </label>

                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Case Description</span>
                  <textarea value={caseDescription} onChange={(event) => setCaseDescription(event.target.value)} rows={5} placeholder="สรุปรายละเอียดเคสและสิ่งที่ Agent ดำเนินการ..." className="mt-2 w-full rounded-2xl border border-violet-200 px-4 py-3 text-sm leading-6 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
                </label>

                <div className="rounded-[24px] border border-dashed border-sky-300 bg-sky-50/60 p-4">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">Evidence URL / PDF / Image</span>
                  <input value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="วางลิงก์ Google Drive, PDF หรือรูปภาพ" className="mt-3 w-full rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100" />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center rounded-2xl bg-sky-600 px-4 py-2.5 text-sm font-black text-white shadow-[0_12px_24px_rgba(2,132,199,0.22)] transition hover:bg-sky-700">
                      Attach Files
                      <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(event) => { handleEvidenceFiles(event.target.files); event.currentTarget.value = ""; }} />
                    </label>
                    <span className="text-xs font-semibold text-slate-500">JPG, PNG, WEBP, PDF · multiple files</span>
                  </div>

                  {evidenceFiles.length ? (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {evidenceFiles.map((file) => {
                        const isImage = file.type.startsWith("image/");
                        return (
                          <div key={file.id} className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm">
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
                    <div className="mt-4 rounded-2xl border border-sky-100 bg-white/70 px-4 py-3 text-xs font-semibold text-slate-500">
                      ยังไม่มีไฟล์แนบ รอบนี้เป็น Preview ในเครื่องก่อน ต่อ Supabase Storage แล้ว URL จะถูกสร้างอัตโนมัติ
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="space-y-5">
            <SectionCard label="Evaluation Rubric">
              <div className="mb-5 rounded-[24px] border border-violet-100 bg-gradient-to-r from-violet-50 via-white to-sky-50 px-5 py-4">
                <div className="text-xl font-black text-slate-950">แบบประเมิน QA</div>
                <div className="mt-1 text-sm leading-6 text-slate-600">
                  ระบบเลือกชุดคำถามจาก Audit Date อัตโนมัติ ถ้าเดือนถัดไปมี Rubric ใหม่ หน้านี้จะเปลี่ยนชุดคำถามตามช่วงวันที่ใช้งาน
                </div>
              </div>

              <div className="space-y-4">
                {RUBRIC_GROUP_LABELS.map((group) => {
                  const groupTopics = topics.filter((topic) => topic.group === group.key);
                  const open = expandedGroups[group.key];
                  const groupScore = groupTopics.reduce((sum, topic) => sum + Number(topicState[topic.code]?.score || 0), 0);
                  const groupMax = groupTopics.reduce((sum, topic) => sum + topic.max, 0);

                  return (
                    <div key={group.key} className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
                      <button type="button" onClick={() => setExpandedGroups((current) => ({ ...current, [group.key]: !open }))} className="flex w-full flex-col gap-3 bg-slate-950 px-5 py-4 text-left text-white sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-lg font-black">{group.title}</div>
                          <div className="mt-1 text-xs font-semibold text-slate-300">{group.note}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm font-black">{groupScore}/{groupMax}</span>
                          <span className="text-lg font-black">{open ? "-" : "+"}</span>
                        </div>
                      </button>

                      {open ? (
                        <div className="p-4">
                          <div className="hidden rounded-t-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-600 lg:grid lg:grid-cols-[90px_minmax(220px,1.1fr)_120px_90px_minmax(300px,1.4fr)]">
                            <div>Topic</div>
                            <div>Description</div>
                            <div>Score</div>
                            <div>Max</div>
                            <div>Assessment Reason</div>
                          </div>
                          <div className="overflow-hidden rounded-2xl border border-slate-200 lg:rounded-t-none lg:border-t-0">
                          {groupTopics.map((topic) => (
                            <div key={topic.code} className="grid gap-3 border-b border-slate-200 bg-white px-4 py-4 last:border-b-0 hover:bg-violet-50/40 lg:grid-cols-[90px_minmax(220px,1.1fr)_120px_90px_minmax(300px,1.4fr)] lg:items-start">
                              <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 lg:hidden">Topic</div>
                                <div className="mt-1 inline-flex rounded-xl bg-violet-100 px-3 py-1 text-sm font-black text-violet-700 lg:mt-0">{topic.code}</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 lg:hidden">Description</div>
                                <div className="mt-1 text-sm font-black leading-6 text-slate-950 lg:mt-0">{topic.title}</div>
                              </div>
                              <label className="block">
                                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 lg:hidden">Score</span>
                                <select
                                  value={topicState[topic.code]?.score ?? 0}
                                  onChange={(event) => updateTopic(topic.code, { score: Number(event.target.value) })}
                                  className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-black text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100 lg:mt-0"
                                >
                                  {scoreOptions(topic.max).map((score) => (
                                    <option key={score} value={score}>{score}</option>
                                  ))}
                                </select>
                              </label>
                              <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 lg:hidden">Max</div>
                                <div className="mt-1 inline-flex rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-700 lg:mt-0">{topic.max}</div>
                              </div>
                              <label className="block">
                                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 lg:hidden">Assessment Reason</span>
                                <textarea value={topicState[topic.code]?.reason || ""} onChange={(event) => updateTopic(topic.code, { reason: event.target.value })} rows={2} placeholder="เหตุผลการประเมินหัวข้อนี้..." className="mt-1 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100 lg:mt-0" />
                              </label>
                            </div>
                          ))}
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
            <div className="overflow-hidden rounded-[30px] border border-violet-200 bg-white shadow-[0_20px_48px_rgba(88,28,135,0.14)]">
              <div className="bg-gradient-to-br from-violet-700 via-purple-700 to-teal-500 px-6 py-6 text-white">
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-100">Live Score</div>
                <div className="mt-5 flex items-end gap-2">
                  <div className="text-6xl font-black leading-none">{criticalError ? 0 : finalScore}</div>
                  <div className="pb-2 text-2xl font-black text-white/80">/{activeRubric.totalScore}</div>
                </div>
                <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/20 bg-white/10 px-4 py-3">
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
                    <div className="h-full rounded-full bg-violet-600" style={{ width: `${completionPct}%` }} />
                  </div>
                  <div className="mt-2 text-xs font-semibold text-slate-500">{completedTopics}/{topics.length} topic reason(s) completed</div>
                </div>

                <label className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <span className="text-sm font-black text-amber-900">Critical Error</span>
                  <input type="checkbox" checked={criticalError} onChange={(event) => setCriticalError(event.target.checked)} className="h-5 w-5 accent-rose-600" />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Status</div>
                    <div className="mt-1 text-sm font-black text-slate-950">Draft</div>
                  </div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">QA Scheme</div>
                    <div className="mt-1 text-sm font-black text-emerald-900">{activeRubric.code}</div>
                  </div>
                </div>

                <button type="button" className="w-full rounded-2xl bg-violet-700 px-5 py-3.5 text-sm font-black text-white shadow-[0_14px_28px_rgba(109,40,217,0.24)] transition hover:bg-violet-800">Submit Evaluation</button>
                <button type="button" className="w-full rounded-2xl border border-violet-200 bg-white px-5 py-3.5 text-sm font-black text-violet-700 transition hover:bg-violet-50">Save Draft</button>
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Preview RawData Row</div>
              <div className="mt-4 max-h-[360px] space-y-2 overflow-auto pr-1">
                {Object.entries(previewColumns).slice(0, 22).map(([key, value]) => (
                  <div key={key} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{key}</div>
                    <div className="mt-1 break-words text-xs font-bold text-slate-800">{String(value)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
