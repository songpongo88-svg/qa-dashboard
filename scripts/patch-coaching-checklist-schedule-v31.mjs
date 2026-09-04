import fs from "node:fs";

const filePath = "src/CoachingMockup.tsx";
const marker = "// coaching-checklist-schedule-v31";
const requiredMarker = "// coaching-main-issues-summary-v30";
let source = fs.readFileSync(filePath, "utf8");

if (source.includes(marker)) {
  console.log("coaching checklist and schedule v31 already applied");
  process.exit(0);
}
if (!source.includes(requiredMarker)) {
  throw new Error("Coaching v30 marker not found; run previous Coaching patches first");
}

function replaceOnce(label, search, replacement) {
  if (!source.includes(search)) throw new Error(`Coaching v31 anchor not found: ${label}`);
  source = source.replace(search, replacement);
}

replaceOnce(
  "checklist type import",
  `  type CoachingTopicSnapshot,\n  type StoredCoachingRecord,`,
  `  type CoachingTopicSnapshot,\n  type CoachingChecklistItem,\n  type StoredCoachingRecord,`
);
replaceOnce(
  "schedule store import",
  `} from "./coachingStore";`,
  `} from "./coachingStore";\nimport {\n  fetchStoredCoachingSchedules,\n  upsertStoredCoachingSchedule,\n  markCoachingSchedulesAsCoached,\n  type StoredCoachingSchedule,\n} from "./coachingScheduleStore";\n${marker}`
);

const helperAnchor = "function recordDisplayStatus(record: StoredCoachingRecord)";
const helperIndex = source.indexOf(helperAnchor);
if (helperIndex < 0) throw new Error("Coaching v31 helper insertion anchor not found");
const helperCode = String.raw`function buildCoachingChecklistV31(rows: StoredEvaluation[]): CoachingChecklistItem[] {
  type Group = { title: string; caseIds: Set<string>; examples: string[]; order: number };
  const groups = new Map<string, Group>();

  const classify = (topic: StoredEvaluationTopic) => {
    const text = normalizeText(
      String(topic.title || "") + " " + richTextToPlainText(topic.comment || "")
    );
    if (/สะกด|พิมพ์ผิด|คำผิด|typo|spelling|เขียนผิด|ภาษา/.test(text)) {
      return { title: "สะกดคำ / การใช้ภาษา", order: 10 };
    }
    if (/opening|closing|ทักทาย|เปิดการสนทนา|ปิดการสนทนา|แนะนำชื่อ|ชื่อแอดมิน/.test(text)) {
      return { title: "Opening / Closing ไม่เป็นมาตรฐาน", order: 20 };
    }
    if (/verify|identify|ยืนยันตัวตน|ขอข้อมูล|pdpa/.test(text)) {
      return { title: "การ Identify / Verify ข้อมูล", order: 30 };
    }
    if (/sla|ระยะเวลา|ตอบช้า|ปิดช้า|รับแชท/.test(text)) {
      return { title: "SLA / ระยะเวลาการให้บริการ", order: 40 };
    }
    if (/process|policy|ขั้นตอน|case note|tag|refund|cancel|ดำเนินการผิด|ดำเนินการไม่ถูก/.test(text)) {
      return { title: "ทำงานไม่ตรง Process / ขั้นตอน", order: 50 };
    }
    if (/accuracy|ข้อมูลผิด|ไม่ถูกต้อง|คลาดเคลื่อน|ตอบผิด|แจ้งผิด|ตรวจสอบ/.test(text)) {
      return { title: "ตรวจสอบข้อมูล / คำตอบไม่ถูกต้อง", order: 60 };
    }
    if (/ไม่ครบ|ตกหล่น|ขาดข้อมูล|completeness/.test(text)) {
      return { title: "ให้ข้อมูลหรือดำเนินการไม่ครบ", order: 70 };
    }
    if (/follow|ownership|next step|ติดตาม|ส่งต่อ|ปิดเคส|ดูแลเคส|ค้างเคส/.test(text)) {
      return { title: "Case Handling / Follow-up", order: 80 };
    }
    if (/tone|empathy|communication|น้ำเสียง|สุภาพ|สื่อสาร|กระชับ|ไม่ชัด/.test(text)) {
      return { title: "การสื่อสาร / น้ำเสียง", order: 90 };
    }

    const key = topicKeyFromTopic(topic);
    if (key === "process") return { title: "ทำงานไม่ตรง Process / ขั้นตอน", order: 50 };
    if (key === "accuracy") return { title: "ตรวจสอบข้อมูล / คำตอบไม่ถูกต้อง", order: 60 };
    if (key === "handling") return { title: "Case Handling / Follow-up", order: 80 };
    return { title: "การสื่อสาร / น้ำเสียง", order: 90 };
  };

  rows.forEach((evaluation) => {
    (evaluation.topics || []).forEach((topic) => {
      if (Number(topic.score || 0) >= Number(topic.max || 0)) return;
      const classified = classify(topic);
      const existing = groups.get(classified.title) || {
        title: classified.title,
        caseIds: new Set<string>(),
        examples: [],
        order: classified.order,
      };
      const caseId = String(evaluation.caseId || evaluation.id || "").trim();
      if (caseId) existing.caseIds.add(caseId);
      const example = richTextToPlainText(topic.comment || "").replace(/\s+/g, " ").trim();
      if (example && !existing.examples.includes(example)) existing.examples.push(example.slice(0, 220));
      groups.set(classified.title, existing);
    });
  });

  return [...groups.values()]
    .sort((a, b) => {
      if (b.caseIds.size !== a.caseIds.size) return b.caseIds.size - a.caseIds.size;
      return a.order - b.order;
    })
    .slice(0, 10)
    .map((group, index) => ({
      id: "auto-" + String(index + 1) + "-" + compactText(group.title).slice(0, 48),
      title: group.title,
      caseIds: [...group.caseIds],
      feedback: "",
      completed: false,
      examples: group.examples.slice(0, 2),
      manual: false,
    }));
}

`;
source = source.slice(0, helperIndex) + helperCode + source.slice(helperIndex);

replaceOnce(
  "states",
  `  const [isSaving, setIsSaving] = useState(false);`,
  `  const [isSaving, setIsSaving] = useState(false);\n  const [checklistItems, setChecklistItems] = useState<CoachingChecklistItem[]>([]);\n  const [generalFeedback, setGeneralFeedback] = useState("");\n  const [manualChecklistTitle, setManualChecklistTitle] = useState("");\n  const [schedules, setSchedules] = useState<StoredCoachingSchedule[]>([]);\n  const [scheduleAgent, setScheduleAgent] = useState("");\n  const [scheduleDate, setScheduleDate] = useState("");\n  const [scheduleTime, setScheduleTime] = useState("");\n  const [scheduleNote, setScheduleNote] = useState("");\n  const [isScheduleSaving, setIsScheduleSaving] = useState(false);`
);

const allowedAnchor = "  const allowedAgents = useMemo(";
const allowedIndex = source.indexOf(allowedAnchor);
if (allowedIndex < 0) throw new Error("Coaching v31 schedule load anchor not found");
const scheduleLoad = String.raw`  useEffect(() => {
    let active = true;
    const loadSchedules = async () => {
      const rows = await fetchStoredCoachingSchedules().catch(() => []);
      if (active) setSchedules(rows);
    };
    void loadSchedules();
    if (typeof window !== "undefined") {
      window.addEventListener("qa-coaching-refresh", loadSchedules);
    }
    return () => {
      active = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("qa-coaching-refresh", loadSchedules);
      }
    };
  }, []);

`;
source = source.slice(0, allowedIndex) + scheduleLoad + source.slice(allowedIndex);

replaceOnce(
  "matching record checklist load",
  `    setActiveRecord(matchingRecord);\n    if (matchingRecord) {`,
  `    setActiveRecord(matchingRecord);\n    if (matchingRecord) {\n      setChecklistItems(matchingRecord.checklistItems || []);\n      setGeneralFeedback(matchingRecord.generalFeedback || "");`
);
replaceOnce(
  "matching record checklist clear",
  `    } else {\n      setDraft(null);`,
  `    } else {\n      setChecklistItems([]);\n      setGeneralFeedback("");\n      setDraft(null);`
);

replaceOnce(
  "generate checklist",
  `    setDraft(\n      buildDraft(`,
  `    setChecklistItems(buildCoachingChecklistV31(monthlyRows));\n    setGeneralFeedback("");\n    setDraft(\n      buildDraft(`
);
replaceOnce(
  "generate message",
  `      "สร้าง Coaching Draft จาก Case Detail เรียบร้อยแล้ว"`,
  `      "สร้าง Coaching Checklist จากเคสจริงเรียบร้อยแล้ว"`
);

replaceOnce(
  "record checklist fields",
  `      topicSnapshot: topicSummaries,\n      agentResponse: draft.agentResponse,`,
  `      topicSnapshot: topicSummaries,\n      checklistItems,\n      generalFeedback,\n      agentResponse: draft.agentResponse,`
);

replaceOnce(
  "coaching refresh after save",
  `      setSaveMessage(\n        saved.status === "Draft"`,
  `      if (typeof window !== "undefined") {\n        window.dispatchEvent(new CustomEvent("qa-coaching-refresh"));\n      }\n      setSaveMessage(\n        saved.status === "Draft"`
);

const oldMark = `  const markAsCoached = async () => {\n    const saved = await saveRecord("Coached");\n    if (saved) setShowCoachedModal(false);\n  };`;
const newMark = `  const markAsCoached = async () => {\n    const saved = await saveRecord("Coached");\n    if (!saved) return;\n    const nextSchedules = await markCoachingSchedulesAsCoached(selectedAgent, selectedMonth).catch(() => schedules);\n    setSchedules(nextSchedules);\n    if (typeof window !== "undefined") {\n      window.dispatchEvent(new CustomEvent("qa-coaching-refresh"));\n    }\n    setShowCoachedModal(false);\n    setSaveMessage("บันทึก Coaching เรียบร้อยแล้ว และอัปเดตสถานะเป็น Coached");\n  };`;
replaceOnce("mark coached schedule sync", oldMark, newMark);

const dataSourceAnchor = `  if (isLoading) {`;
const dataSourceIndex = source.indexOf(dataSourceAnchor);
if (dataSourceIndex < 0) throw new Error("Coaching v31 schedule handlers anchor not found");
const scheduleLogic = String.raw`  const scheduleRowsV31 = useMemo(() => {
    return schedules
      .filter((item) => item.monthKey === selectedMonth)
      .filter((item) => {
        if (!allowedAgents.length) return true;
        return allowedAgents.some((name) => isSameAgent(name, item.agent));
      })
      .sort((a, b) => (String(a.date) + String(a.time)).localeCompare(String(b.date) + String(b.time)));
  }, [schedules, selectedMonth, allowedAgents]);

  useEffect(() => {
    if (selectedAgent && agentOptions.some((name) => isSameAgent(name, selectedAgent))) {
      setScheduleAgent(selectedAgent);
      return;
    }
    if (scheduleAgent && !agentOptions.some((name) => isSameAgent(name, scheduleAgent))) {
      setScheduleAgent("");
    }
  }, [selectedAgent, agentOptions, scheduleAgent]);

  const addCoachingScheduleV31 = async () => {
    if (!scheduleAgent || !selectedMonth || !scheduleDate || !scheduleTime) {
      setSaveMessage("กรุณาเลือก Agent, วันที่ และเวลาให้ครบก่อนเพิ่มนัดหมาย");
      return;
    }
    const now = new Date().toISOString();
    const record: StoredCoachingSchedule = {
      id: "schedule-" + compactText(scheduleAgent) + "-" + selectedMonth + "-" + scheduleDate.replace(/[^0-9]/g, "") + "-" + scheduleTime.replace(/[^0-9]/g, "") + "-" + Date.now(),
      agent: scheduleAgent,
      monthKey: selectedMonth,
      monthLabel: getMonthLabel(selectedMonth),
      date: scheduleDate,
      time: scheduleTime,
      note: scheduleNote,
      status: "Scheduled",
      createdBy: currentUser?.displayName || currentUser?.agentName || currentUser?.username || "",
      createdAt: now,
      updatedAt: now,
    };
    setIsScheduleSaving(true);
    try {
      const saved = await upsertStoredCoachingSchedule(record);
      setSchedules((previous) => [saved, ...previous.filter((item) => item.id !== saved.id)]);
      setScheduleDate("");
      setScheduleTime("");
      setScheduleNote("");
      setSaveMessage("เพิ่มนัดหมาย Coaching เรียบร้อยแล้ว");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("qa-coaching-refresh"));
      }
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "ไม่สามารถบันทึกนัดหมาย Coaching ได้");
    } finally {
      setIsScheduleSaving(false);
    }
  };

  const openScheduleV31 = (item: StoredCoachingSchedule) => {
    setSelectedMonth(item.monthKey);
    onSelectedMonthChange?.(item.monthKey);
    setSelectedAgent(item.agent);
    onSelectedAgentChange?.(item.agent);
    setScheduleAgent(item.agent);
    setWorkspaceTab("feedback");
  };

`;
source = source.slice(0, dataSourceIndex) + scheduleLogic + source.slice(dataSourceIndex);

// Replace the old generated-feedback workspace with a simple editable checklist.
const feedbackStart = source.indexOf('            {workspaceTab === "feedback" ? (');
const evidenceStart = source.indexOf('            {workspaceTab === "evidence" ? (', feedbackStart);
if (feedbackStart < 0 || evidenceStart < 0) throw new Error("Coaching v31 feedback workspace block not found");
const feedbackBlock = String.raw`            {workspaceTab === "feedback" ? (
              <div className="space-y-6">
                <section className="rounded-[30px] border border-violet-100 bg-white p-6 shadow-[0_18px_50px_rgba(76,29,149,0.08)]">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-600">Coaching Checklist</div>
                      <div className="mt-1 text-2xl font-black text-slate-950">หัวข้อที่ต้อง Feedback</div>
                      <div className="mt-2 text-sm text-slate-500">ระบบดึงหัวข้อจากเคสที่ถูกหักจริง คุณเป็นคนพิมพ์ Feedback และติ๊กเมื่อคุยหัวข้อนั้นแล้ว</div>
                    </div>
                    <div className="rounded-2xl bg-violet-50 px-4 py-3 text-sm font-black text-violet-700">
                      Feedback แล้ว {checklistItems.filter((item) => item.completed).length}/{checklistItems.length}
                    </div>
                  </div>

                  {!checklistItems.length ? (
                    <div className="mt-6 rounded-[24px] border border-dashed border-violet-200 bg-violet-50/50 p-8 text-center">
                      <div className="text-lg font-black text-slate-900">กด Generate Coaching เพื่อสร้าง Checklist</div>
                      <div className="mt-2 text-sm text-slate-500">ระบบจะสร้างเฉพาะหัวข้อที่พบจากการหักคะแนนของเคสจริง</div>
                    </div>
                  ) : (
                    <div className="mt-6 space-y-4">
                      {checklistItems.map((item, index) => (
                        <div key={item.id} className={"rounded-[24px] border p-5 " + (item.completed ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white")}>
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={item.completed}
                              onChange={(event) => setChecklistItems((previous) => previous.map((row) => row.id === item.id ? { ...row, completed: event.target.checked } : row))}
                              className="mt-1 h-5 w-5 rounded border-slate-300 text-emerald-600"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-base font-black text-slate-950">{index + 1}. {item.title}</div>
                                {item.manual ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500">Manual</span> : null}
                                {item.completed ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-700">Feedback แล้ว</span> : null}
                              </div>
                              {item.caseIds.length ? (
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                  <span className="font-bold">พบ {item.caseIds.length} เคส</span>
                                  {item.caseIds.slice(0, 6).map((caseId) => (
                                    <button
                                      key={caseId}
                                      type="button"
                                      onClick={() => setSelectedCase(monthlyRows.find((row) => row.caseId === caseId) || null)}
                                      className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 font-black text-violet-700"
                                    >
                                      {caseId}
                                    </button>
                                  ))}
                                  {item.caseIds.length > 6 ? <span>+{item.caseIds.length - 6} เคส</span> : null}
                                </div>
                              ) : null}
                              <textarea
                                value={item.feedback}
                                onChange={(event) => setChecklistItems((previous) => previous.map((row) => row.id === item.id ? { ...row, feedback: event.target.value } : row))}
                                placeholder="Feedback / Note ที่คุณคุยกับ Agent..."
                                className="mt-3 min-h-[88px] w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <input
                      value={manualChecklistTitle}
                      onChange={(event) => setManualChecklistTitle(event.target.value)}
                      placeholder="เพิ่มหัวข้อ Feedback เอง..."
                      className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                    />
                    <button
                      type="button"
                      disabled={!manualChecklistTitle.trim()}
                      onClick={() => {
                        const title = manualChecklistTitle.trim();
                        if (!title) return;
                        setChecklistItems((previous) => [...previous, { id: "manual-" + Date.now(), title, caseIds: [], feedback: "", completed: false, examples: [], manual: true }]);
                        setManualChecklistTitle("");
                      }}
                      className="rounded-2xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-black text-violet-700 disabled:opacity-40"
                    >
                      + เพิ่มหัวข้อ Feedback
                    </button>
                  </div>

                  <label className="mt-6 block">
                    <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">General Feedback / Summary</span>
                    <textarea
                      value={generalFeedback}
                      onChange={(event) => setGeneralFeedback(event.target.value)}
                      placeholder="สรุป Feedback เพิ่มเติมที่คุณต้องการบันทึก..."
                      className="min-h-[120px] w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-800 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                    />
                  </label>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <button type="button" onClick={() => void saveRecord("Draft")} disabled={!draft || isSaving} className="rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-700 disabled:opacity-40">Save Draft</button>
                    <button type="button" onClick={() => void markAsCoached()} disabled={!draft || isSaving} className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-sm disabled:opacity-40">✓ Mark as Coached</button>
                  </div>
                </section>
              </div>
            ) : null}

`;
source = source.slice(0, feedbackStart) + feedbackBlock + source.slice(evidenceStart);

// Add a simple appointment table below the filter/actions area.
const scheduleInsertAnchor = `        </section>\n\n        {!selectedAgent ? (`;
if (!source.includes(scheduleInsertAnchor)) throw new Error("Coaching v31 schedule UI insertion anchor not found");
const scheduleUi = String.raw`        </section>

        <section className="rounded-[30px] border border-violet-100 bg-white p-5 shadow-[0_18px_50px_rgba(76,29,149,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-600">Coaching Schedule</div>
              <div className="mt-1 text-xl font-black text-slate-950">ตารางนัดหมาย Coaching · {getMonthLabel(selectedMonth)}</div>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">{scheduleRowsV31.length} นัดหมาย</div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <select value={scheduleAgent} onChange={(event) => setScheduleAgent(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none">
              <option value="">เลือก Agent</option>
              {agentOptions.map((agent) => <option key={agent} value={agent}>{agent}</option>)}
            </select>
            <input type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none" />
            <input type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none" />
            <input value={scheduleNote} onChange={(event) => setScheduleNote(event.target.value)} placeholder="Note (ถ้ามี)" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none" />
            <button type="button" onClick={() => void addCoachingScheduleV31()} disabled={isScheduleSaving || !scheduleAgent || !scheduleDate || !scheduleTime} className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white disabled:opacity-40">+ Schedule Coaching</button>
          </div>

          <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Time</th><th className="px-4 py-3">Agent</th><th className="px-4 py-3">Month</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Note</th><th className="px-4 py-3">Action</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {scheduleRowsV31.length ? scheduleRowsV31.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-bold text-slate-800">{formatDisplayDate(item.date)}</td>
                    <td className="px-4 py-3">{item.time || "-"}</td>
                    <td className="px-4 py-3 font-bold">{item.agent}</td>
                    <td className="px-4 py-3">{item.monthLabel || getMonthLabel(item.monthKey)}</td>
                    <td className="px-4 py-3"><span className={"rounded-full px-3 py-1 text-xs font-black " + (item.status === "Coached" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{item.status}</span></td>
                    <td className="max-w-[260px] truncate px-4 py-3 text-slate-500">{item.note || "-"}</td>
                    <td className="px-4 py-3"><button type="button" onClick={() => openScheduleV31(item)} className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700">Open</button></td>
                  </tr>
                )) : (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">ยังไม่มีนัดหมาย Coaching ในเดือนนี้</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {!selectedAgent ? (`;
source = source.replace(scheduleInsertAnchor, scheduleUi);

// Make the top Mark as Coached button direct and simple; keep the old modal code unused for compatibility.
const topMarkStart = source.indexOf(`            <button\n              type="button"\n              onClick={() =>\n                setShowCoachedModal(true)`);
if (topMarkStart >= 0) {
  const topMarkEnd = source.indexOf(`            </button>`, topMarkStart);
  if (topMarkEnd >= 0) {
    const replacementButton = `            <button\n              type="button"\n              onClick={() => void markAsCoached()}\n              disabled={!draft || isSaving}\n              className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40"\n            >\n              ✓ Mark as Coached\n            </button>`;
    source = source.slice(0, topMarkStart) + replacementButton + source.slice(topMarkEnd + `            </button>`.length);
  }
}

fs.writeFileSync(filePath, source, "utf8");
console.log("Coaching checklist, manual feedback, schedule table, and coached status sync v31 applied");
