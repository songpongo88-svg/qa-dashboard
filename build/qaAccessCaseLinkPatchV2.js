function mustReplace(context, code, search, replacement, label) {
  if (!code.includes(search)) context.error(`QA Access case-link v2 missing ${label}`);
  return code.replace(search, replacement);
}

export function qaAccessCaseLinkPatchV2() {
  const seen = new Set();
  return {
    name: "qa-access-case-link-v2",
    enforce: "pre",
    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      let next = code;

      if (cleanId.endsWith("/src/QaTypingChallengeAdmin.tsx")) {
        next = mustReplace(this, next,
          '  const [word, setWord] = useState("อนุญาต");\n  const [repeatCount, setRepeatCount] = useState(100);',
          '  const [word, setWord] = useState("");\n  const [repeatCount, setRepeatCount] = useState(100);\n  const [caseIdInput, setCaseIdInput] = useState("");\n  const [caseIds, setCaseIds] = useState<string[]>([]);',
          "admin default state"
        );
        next = mustReplace(this, next,
          '    setWord("อนุญาต");\n    setRepeatCount(100);',
          '    setWord("");\n    setRepeatCount(100);\n    setCaseIdInput("");\n    setCaseIds([]);',
          "admin reset"
        );
        next = mustReplace(this, next,
          '  const cleanWord = useMemo(() => word.trim(), [word]);',
          `  const normalizeCaseId = (value: unknown) =>
    String(value || "").replace(/\\s+/g, "").trim().toUpperCase();

  const addCaseIds = () => {
    const matches = String(caseIdInput || "")
      .split(/[,;|\\n\\s]+/g)
      .map(normalizeCaseId)
      .filter(Boolean);
    if (!matches.length) return;
    setCaseIds((current) => Array.from(new Set([...current, ...matches])).slice(0, 20));
    setCaseIdInput("");
  };

  const cleanWord = useMemo(() => word.trim(), [word]);`,
          "admin case helpers"
        );
        next = mustReplace(this, next,
          `    if (!cleanWord) {
      setError("กรุณากำหนดคำหรือประโยคที่ต้องการให้พิมพ์");
      return;
    }`,
          `    if (!cleanWord) {
      setError("กรุณากำหนดคำหรือประโยคที่ต้องการให้พิมพ์");
      return;
    }
    if (!caseIds.length) {
      setError("กรุณาผูก Case ID อย่างน้อย 1 เคส เพื่อใช้ตรวจสอบข้อ 4 ย้อนหลัง");
      return;
    }`,
          "admin validation"
        );
        next = mustReplace(this, next,
          '        assignedBy: String(currentUser?.username || currentUser?.displayName || "QA").trim(),\n      });',
          '        assignedBy: String(currentUser?.username || currentUser?.displayName || "QA").trim(),\n        caseIds,\n        topicCode: "4",\n      });',
          "admin payload"
        );
        next = mustReplace(this, next,
          '      setWord("");\n    } catch (assignError) {',
          '      setWord("");\n      setCaseIdInput("");\n      setCaseIds([]);\n    } catch (assignError) {',
          "admin post assign reset"
        );
        next = mustReplace(this, next,
          `          <input
            type="number"
            min={1}
            max={500}
            value={repeatCount}
            onChange={(event) => setRepeatCount(Number(event.target.value))}`,
          `          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={repeatCount || ""}
            onChange={(event) => {
              const digits = event.target.value.replace(/\\D/g, "").slice(0, 3);
              setRepeatCount(digits ? Math.min(500, Number(digits)) : 0);
            }}`,
          "admin count input"
        );
        next = mustReplace(this, next,
          '      <div className="mt-3 grid gap-2 sm:grid-cols-3">',
          `      <div className="mt-3 rounded-2xl border border-violet-200 bg-white/90 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[220px] flex-1">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">ผูก Case ID · ข้อ 4</span>
            <input
              type="text"
              value={caseIdInput}
              onChange={(event) => setCaseIdInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addCaseIds();
                }
              }}
              placeholder="พิมพ์ Case ID แล้วกด Enter · ใส่ได้มากกว่า 1 เคส"
              className="mt-1.5 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
            />
          </label>
          <button type="button" onClick={addCaseIds} disabled={!caseIdInput.trim()} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-black text-violet-700 transition hover:bg-violet-100 disabled:opacity-40">+ ผูกเคส</button>
        </div>
        <div className="mt-2 flex min-h-[30px] flex-wrap gap-2">
          {caseIds.length ? caseIds.map((caseId) => (
            <span key={caseId} className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[10px] font-black text-violet-700">
              {caseId}
              <button type="button" aria-label={"Remove " + caseId} onClick={() => setCaseIds((current) => current.filter((item) => item !== caseId))} className="text-violet-400 hover:text-rose-600">×</button>
            </span>
          )) : <span className="text-[10px] font-semibold text-slate-400">ยังไม่ได้ผูก Case ID · ต้องผูกอย่างน้อย 1 เคสก่อนส่ง</span>}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">`,
          "admin case UI"
        );
        next = mustReplace(this, next,
          '          disabled={busy || !cleanWord}',
          '          disabled={busy || !cleanWord || !caseIds.length}',
          "admin button requirement"
        );
        next = mustReplace(this, next,
          '                      {item.repeatCount} {itemUnitLabel} · ผิดได้ {item.allowedMistakes} {itemUnitLabel} · เวลา {formatDuration(item.timeLimitSeconds)}',
          '                      {item.repeatCount} {itemUnitLabel} · ผิดได้ {item.allowedMistakes} {itemUnitLabel} · เวลา {formatDuration(item.timeLimitSeconds)} · ข้อ {item.topicCode || "4"} · Case {(item.caseIds || []).join(", ") || "-"}',
          "admin queue trace"
        );
        seen.add("admin");
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/qaTypingChallengeStore.ts")) {
        next = mustReplace(this, next,
          '  assignedAt: string;\n  assignedBy: string;\n};',
          '  assignedAt: string;\n  assignedBy: string;\n  caseIds?: string[];\n  topicCode?: string;\n};',
          "store type fields"
        );
        next = mustReplace(this, next,
          'function detectChallengeMode(value: unknown): QaTypingChallengeMode {',
          `function normalizeCaseIds(value: unknown) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[,;|\\n\\s]+/g);
  return Array.from(new Set(source.map((item) => String(item || "").replace(/\\s+/g, "").trim().toUpperCase()).filter(Boolean))).slice(0, 20);
}

function detectChallengeMode(value: unknown): QaTypingChallengeMode {`,
          "store normalizer"
        );
        next = mustReplace(this, next,
          '    assignedAt,\n    assignedBy: String(row?.assignedBy || "").trim(),\n  };',
          '    assignedAt,\n    assignedBy: String(row?.assignedBy || "").trim(),\n    caseIds: normalizeCaseIds(row?.caseIds || row?.caseId),\n    topicCode: String(row?.topicCode || "4").trim() || "4",\n  };',
          "store normalize fields"
        );
        next = mustReplace(this, next,
          '    assignedAt: challenge.assignedAt,\n    assignedBy: challenge.assignedBy,\n  };',
          '    assignedAt: challenge.assignedAt,\n    assignedBy: challenge.assignedBy,\n    caseIds: normalizeCaseIds(challenge.caseIds),\n    topicCode: String(challenge.topicCode || "4").trim() || "4",\n  };',
          "store serialize fields"
        );
        next = mustReplace(this, next,
          '  const assignedAt = challenge.assignedAt || new Date().toISOString();\n  if (!username) throw new Error("Missing target username");',
          '  const assignedAt = challenge.assignedAt || new Date().toISOString();\n  const caseIds = normalizeCaseIds(challenge.caseIds);\n  const topicCode = String(challenge.topicCode || "4").trim() || "4";\n  if (!username) throw new Error("Missing target username");',
          "store assign values"
        );
        next = mustReplace(this, next,
          '      assignedAt,\n      assignedBy: String(challenge.assignedBy || "").trim(),\n    };',
          '      assignedAt,\n      assignedBy: String(challenge.assignedBy || "").trim(),\n      caseIds,\n      topicCode,\n    };',
          "store next fields"
        );
        seen.add("store");
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/qaTypingChallengeHistoryStore.ts")) {
        next = mustReplace(this, next,
          'export type QaTypingChallengeHistoryResult = "Pass" | "Fail" | "Timeout";',
          `export type QaTypingChallengeHistoryResult = "Pass" | "Fail" | "Timeout";

export type QaTypingMistakeDetail = {
  index: number;
  expected: string;
  typed: string;
};`,
          "history mistake type"
        );
        next = mustReplace(this, next,
          '  assignedAt: string;\n  assignedBy: string;\n};',
          '  assignedAt: string;\n  assignedBy: string;\n  caseIds?: string[];\n  topicCode?: string;\n  mistakeDetails?: QaTypingMistakeDetail[];\n};',
          "history trace fields"
        );
        next = mustReplace(this, next,
          'function normalizeHistoryRecord(id: string, row: any): QaTypingChallengeHistoryRecord {',
          `function normalizeCaseIds(value: unknown) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[,;|\\n\\s]+/g);
  return Array.from(new Set(source.map((item) => String(item || "").replace(/\\s+/g, "").trim().toUpperCase()).filter(Boolean))).slice(0, 20);
}

function normalizeMistakeDetails(value: unknown): QaTypingMistakeDetail[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 500).map((item: any, index: number) => ({
    index: normalizeNumber(item?.index, index),
    expected: String(item?.expected || "").trim(),
    typed: String(item?.typed || "").trim(),
  }));
}

function normalizeHistoryRecord(id: string, row: any): QaTypingChallengeHistoryRecord {`,
          "history normalizers"
        );
        next = mustReplace(this, next,
          '    assignedAt: String(row?.assignedAt || ""),\n    assignedBy: String(row?.assignedBy || "").trim(),\n  };',
          '    assignedAt: String(row?.assignedAt || ""),\n    assignedBy: String(row?.assignedBy || "").trim(),\n    caseIds: normalizeCaseIds(row?.caseIds || row?.caseId),\n    topicCode: String(row?.topicCode || "4").trim() || "4",\n    mistakeDetails: normalizeMistakeDetails(row?.mistakeDetails),\n  };',
          "history normalize trace"
        );
        next = mustReplace(this, next,
          '    assignedAt: record.assignedAt || "",\n    assignedBy: String(record.assignedBy || "").trim(),\n    createdAtServer: serverTimestamp(),',
          '    assignedAt: record.assignedAt || "",\n    assignedBy: String(record.assignedBy || "").trim(),\n    caseIds: normalizeCaseIds(record.caseIds),\n    topicCode: String(record.topicCode || "4").trim() || "4",\n    mistakeDetails: normalizeMistakeDetails(record.mistakeDetails),\n    createdAtServer: serverTimestamp(),',
          "history save trace"
        );
        seen.add("history");
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/QaTypingGate.tsx")) {
        next = mustReplace(this, next,
          '    const mistakeCount = Math.max(0, typedCount - correctCount);\n\n    await saveQaTypingChallengeHistory({',
          `    const mistakeCount = Math.max(0, typedCount - correctCount);
    const mistakeDetails = units
      .map((typed, index) => typed === challenge.word ? null : ({ index, expected: challenge.word, typed }))
      .filter(Boolean) as Array<{ index: number; expected: string; typed: string }>;

    await saveQaTypingChallengeHistory({`,
          "gate mistake capture"
        );
        next = mustReplace(this, next,
          '      assignedAt: challenge.assignedAt || "",\n      assignedBy: challenge.assignedBy || "",\n    });',
          '      assignedAt: challenge.assignedAt || "",\n      assignedBy: challenge.assignedBy || "",\n      caseIds: challenge.caseIds || [],\n      topicCode: challenge.topicCode || "4",\n      mistakeDetails,\n    });',
          "gate history payload"
        );
        next = mustReplace(this, next,
          '              <div className="text-center">เวลาที่กำหนด: <span className="font-black text-slate-950">{formatCountdown(challenge.timeLimitSeconds || 60)}</span></div>\n            </div>',
          `              <div className="text-center">เวลาที่กำหนด: <span className="font-black text-slate-950">{formatCountdown(challenge.timeLimitSeconds || 60)}</span></div>
            </div>
            {(challenge.caseIds || []).length ? (
              <div className="mt-2 text-center text-[11px] font-bold text-violet-700">ข้อ {challenge.topicCode || "4"} · Case {(challenge.caseIds || []).join(", ")}</div>
            ) : null}`,
          "gate case label"
        );
        seen.add("gate");
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/QaTypingChallengeWorkspace.tsx")) {
        next = next.replace(/History:<\/span> เก็บเฉพาะผลสรุป เช่น จำนวนที่พิมพ์ ถูก ผิด เวลา และผล Pass\/Fail\/Timeout โดยไม่เก็บข้อความที่ Agent พิมพ์จริง/g,
          'History:</span> เก็บผลสรุป Case ID ข้อ 4 และเฉพาะคำที่พิมพ์ผิด เพื่อใช้ตรวจสอบย้อนหลัง');
        next = next.replace(/แสดงเฉพาะข้อมูลสรุปของการทำแต่ละครั้ง ไม่มีการจัดเก็บข้อความที่พิมพ์จริง/g,
          'แสดงผลสรุป Case ID ข้อ 4 และเฉพาะคำที่พิมพ์ผิดของแต่ละครั้ง');
        next = mustReplace(this, next,
          '<table className="min-w-[1180px] w-full border-collapse text-left text-xs">',
          '<table className="min-w-[1450px] w-full border-collapse text-left text-xs">',
          "workspace table width"
        );
        next = mustReplace(this, next,
          '{["Date / Time", "Agent", "Word", "Target", "Typed", "Correct", "Wrong", "Allowed", "Time Limit", "Time Used", "Result"].map((header) => (',
          '{["Date / Time", "Agent", "Case ID", "ข้อ", "Word", "Target", "Typed", "Correct", "Wrong", "ผิดคำไหน", "Allowed", "Time Limit", "Time Used", "Result"].map((header) => (',
          "workspace table headers"
        );
        next = next.replace(/colSpan=\{11\}/g, 'colSpan={14}');
        next = mustReplace(this, next,
          '                          <td className="px-3 py-3"><div className="font-black text-slate-900">{record.displayName || record.username}</div><div className="text-[10px] font-semibold text-slate-400">@{record.username}</div></td>\n                          <td className="px-3 py-3 text-sm font-black text-violet-700">{record.word}</td>',
          '                          <td className="px-3 py-3"><div className="font-black text-slate-900">{record.displayName || record.username}</div><div className="text-[10px] font-semibold text-slate-400">@{record.username}</div></td>\n                          <td className="px-3 py-3 text-xs font-black text-violet-700">{(record.caseIds || []).join(", ") || "-"}</td>\n                          <td className="px-3 py-3 text-center font-black text-violet-700">{record.topicCode || "4"}</td>\n                          <td className="px-3 py-3 text-sm font-black text-violet-700">{record.word}</td>',
          "workspace case columns"
        );
        next = mustReplace(this, next,
          '                          <td className="px-3 py-3 text-center font-black text-rose-600">{record.mistakeCount}</td>\n                          <td className="px-3 py-3 text-center font-black text-slate-700">{record.allowedMistakes}</td>',
          `                          <td className="px-3 py-3 text-center font-black text-rose-600">{record.mistakeCount}</td>
                          <td className="max-w-[280px] px-3 py-3 text-[10px] font-bold text-rose-600">{(record.mistakeDetails || []).length ? (record.mistakeDetails || []).map((item) => "#" + String(item.index + 1) + " " + item.expected + " → " + (item.typed || "(ว่าง)")).join(" · ") : "-"}</td>
                          <td className="px-3 py-3 text-center font-black text-slate-700">{record.allowedMistakes}</td>`,
          "workspace mistake detail"
        );
        seen.add("workspace");
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/DashboardMockup.tsx")) {
        next = mustReplace(this, next,
          'import MonthlyKpiNotice from "./MonthlyKpiNotice";',
          'import MonthlyKpiNotice from "./MonthlyKpiNotice";\nimport QaAccessCaseHistoryPopup from "./QaAccessCaseHistoryPopup";',
          "dashboard import"
        );
        next = mustReplace(this, next,
          '  appealReviewedTopics,\n}: {\n  topics: Topic[];',
          '  appealReviewedTopics,\n  caseId,\n  targetUsername,\n}: {\n  topics: Topic[];',
          "dashboard props"
        );
        next = mustReplace(this, next,
          '  appealStatus?: "Approved" | "Rejected";\n  appealReviewedTopics?: AppealReviewedTopic[] | null;\n}) {',
          '  appealStatus?: "Approved" | "Rejected";\n  appealReviewedTopics?: AppealReviewedTopic[] | null;\n  caseId?: string;\n  targetUsername?: string;\n}) {',
          "dashboard prop types"
        );
        next = mustReplace(this, next,
          `                <div className="text-[20px] font-bold tracking-tight text-slate-900">
                  {row.shownTopic.code} {row.shownTopic.label}
                </div>`,
          `                <div className="text-[20px] font-bold tracking-tight text-slate-900">
                  {row.shownTopic.code} {row.shownTopic.label}
                </div>
                {String(row.shownTopic.code) === "4" ? (
                  <QaAccessCaseHistoryPopup caseId={caseId} username={targetUsername} />
                ) : null}`,
          "dashboard topic button"
        );
        next = mustReplace(this, next,
          '                appealStatus={caseItem.appealStatus}\n                appealReviewedTopics={caseItem.appealReviewedTopics}\n              />',
          '                appealStatus={caseItem.appealStatus}\n                appealReviewedTopics={caseItem.appealReviewedTopics}\n                caseId={caseItem.caseId}\n                targetUsername={caseItem.targetUsername}\n              />',
          "dashboard case values"
        );
        seen.add("dashboard");
        return { code: next, map: null };
      }

      return null;
    },
    buildEnd(error) {
      if (error) return;
      const required = ["admin", "store", "history", "gate", "workspace", "dashboard"];
      const missing = required.filter((name) => !seen.has(name));
      if (missing.length) this.error("QA Access case-link v2 not applied: " + missing.join(", "));
    },
  };
}
