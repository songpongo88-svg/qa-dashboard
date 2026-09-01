function replaceOrThrow(context, code, search, replacement, label) {
  if (!code.includes(search)) {
    context.error(`QA Access case-link patch could not find ${label}.`);
  }
  return code.replace(search, replacement);
}

export function qaAccessCaseLinkPatch() {
  const patched = new Set();

  return {
    name: "qa-access-case-link",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      let next = code;

      if (cleanId.endsWith("/src/QaTypingChallengeAdmin.tsx")) {
        next = replaceOrThrow(
          this,
          next,
          `  const [word, setWord] = useState("อนุญาต");\n  const [repeatCount, setRepeatCount] = useState(100);`,
          `  const [word, setWord] = useState("");\n  const [repeatCount, setRepeatCount] = useState(100);\n  const [caseIdInput, setCaseIdInput] = useState("");\n  const [caseIds, setCaseIds] = useState<string[]>([]);`,
          "blank default word state"
        );

        next = replaceOrThrow(
          this,
          next,
          `    setWord("อนุญาต");\n    setRepeatCount(100);`,
          `    setWord("");\n    setRepeatCount(100);\n    setCaseIdInput("");\n    setCaseIds([]);`,
          "agent-change reset"
        );

        next = replaceOrThrow(
          this,
          next,
          `  const cleanWord = useMemo(() => word.trim(), [word]);`,
          `  const normalizeCaseId = (value: unknown) =>\n    String(value || "").replace(/\\s+/g, "").trim().toUpperCase();\n\n  const addCaseIds = () => {\n    const matches = String(caseIdInput || "")\n      .split(/[,;|\\n\\s]+/g)\n      .map(normalizeCaseId)\n      .filter(Boolean);\n    if (!matches.length) return;\n    setCaseIds((current) => Array.from(new Set([...current, ...matches])).slice(0, 20));\n    setCaseIdInput("");\n  };\n\n  const cleanWord = useMemo(() => word.trim(), [word]);`,
          "case ID helper"
        );

        next = replaceOrThrow(
          this,
          next,
          `    if (!cleanWord) {\n      setError("กรุณากำหนดคำหรือประโยคที่ต้องการให้พิมพ์");\n      return;\n    }`,
          `    if (!cleanWord) {\n      setError("กรุณากำหนดคำหรือประโยคที่ต้องการให้พิมพ์");\n      return;\n    }\n    if (!caseIds.length) {\n      setError("กรุณาผูก Case ID อย่างน้อย 1 เคส เพื่อใช้ตรวจสอบข้อ 4 ย้อนหลัง");\n      return;\n    }`,
          "case ID validation"
        );

        next = replaceOrThrow(
          this,
          next,
          `        assignedBy: String(currentUser?.username || currentUser?.displayName || "QA").trim(),\n      });`,
          `        assignedBy: String(currentUser?.username || currentUser?.displayName || "QA").trim(),\n        caseIds,\n        topicCode: "4",\n      });`,
          "challenge case payload"
        );

        next = replaceOrThrow(
          this,
          next,
          `      setWord("");\n    } catch (assignError) {`,
          `      setWord("");\n      setCaseIdInput("");\n      setCaseIds([]);\n    } catch (assignError) {`,
          "post-assign reset"
        );

        next = replaceOrThrow(
          this,
          next,
          `          <input\n            type="number"\n            min={1}\n            max={500}\n            value={repeatCount}\n            onChange={(event) => setRepeatCount(Number(event.target.value))}`,
          `          <input\n            type="text"\n            inputMode="numeric"\n            pattern="[0-9]*"\n            value={repeatCount || ""}\n            onChange={(event) => {\n              const digits = event.target.value.replace(/\\D/g, "").slice(0, 3);\n              setRepeatCount(digits ? Math.min(500, Number(digits)) : 0);\n            }}`,
          "plain numeric count input"
        );

        next = replaceOrThrow(
          this,
          next,
          `      <div className="mt-3 grid gap-2 sm:grid-cols-3">`,
          `      <div className="mt-3 rounded-2xl border border-violet-200 bg-white/90 p-3">\n        <div className="flex flex-wrap items-end gap-2">\n          <label className="min-w-[220px] flex-1">\n            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">ผูก Case ID · ข้อ 4</span>\n            <input\n              type="text"\n              value={caseIdInput}\n              onChange={(event) => setCaseIdInput(event.target.value)}\n              onKeyDown={(event) => {\n                if (event.key === "Enter") {\n                  event.preventDefault();\n                  addCaseIds();\n                }\n              }}\n              placeholder="พิมพ์ Case ID แล้วกด Enter · ใส่ได้มากกว่า 1 เคส"\n              className="mt-1.5 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"\n            />\n          </label>\n          <button type="button" onClick={addCaseIds} disabled={!caseIdInput.trim()} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-black text-violet-700 transition hover:bg-violet-100 disabled:opacity-40">+ ผูกเคส</button>\n        </div>\n        <div className="mt-2 flex min-h-[30px] flex-wrap gap-2">\n          {caseIds.length ? caseIds.map((caseId) => (\n            <span key={caseId} className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[10px] font-black text-violet-700">\n              {caseId}\n              <button type="button" aria-label={\`Remove ${caseId}\`} onClick={() => setCaseIds((current) => current.filter((item) => item !== caseId))} className="text-violet-400 hover:text-rose-600">×</button>\n            </span>\n          )) : <span className="text-[10px] font-semibold text-slate-400">ยังไม่ได้ผูก Case ID · ต้องผูกอย่างน้อย 1 เคสก่อนส่ง</span>}\n        </div>\n      </div>\n\n      <div className="mt-3 grid gap-2 sm:grid-cols-3">`,
          "case link setup UI"
        );

        next = replaceOrThrow(
          this,
          next,
          `          disabled={busy || !cleanWord}`,
          `          disabled={busy || !cleanWord || !caseIds.length}`,
          "assign button case requirement"
        );

        next = replaceOrThrow(
          this,
          next,
          `                      {item.repeatCount} {itemUnitLabel} · ผิดได้ {item.allowedMistakes} {itemUnitLabel} · เวลา {formatDuration(item.timeLimitSeconds)}`,
          `                      {item.repeatCount} {itemUnitLabel} · ผิดได้ {item.allowedMistakes} {itemUnitLabel} · เวลา {formatDuration(item.timeLimitSeconds)} · ข้อ {item.topicCode || "4"} · Case {(item.caseIds || []).join(", ") || "-"}`,
          "queue linked case display"
        );

        patched.add("admin");
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/qaTypingChallengeStore.ts")) {
        next = replaceOrThrow(
          this,
          next,
          `  assignedAt: string;\n  assignedBy: string;\n};`,
          `  assignedAt: string;\n  assignedBy: string;\n  caseIds?: string[];\n  topicCode?: string;\n};`,
          "challenge case fields"
        );

        next = replaceOrThrow(
          this,
          next,
          `function detectChallengeMode(value: unknown): QaTypingChallengeMode {`,
          `function normalizeCaseIds(value: unknown) {\n  const source = Array.isArray(value) ? value : String(value || "").split(/[,;|\\n\\s]+/g);\n  return Array.from(new Set(source.map((item) => String(item || "").replace(/\\s+/g, "").trim().toUpperCase()).filter(Boolean))).slice(0, 20);\n}\n\nfunction detectChallengeMode(value: unknown): QaTypingChallengeMode {`,
          "store case normalizer"
        );

        next = replaceOrThrow(
          this,
          next,
          `    assignedAt,\n    assignedBy: String(row?.assignedBy || "").trim(),\n  };`,
          `    assignedAt,\n    assignedBy: String(row?.assignedBy || "").trim(),\n    caseIds: normalizeCaseIds(row?.caseIds || row?.caseId),\n    topicCode: String(row?.topicCode || "4").trim() || "4",\n  };`,
          "normalize challenge case fields"
        );

        next = replaceOrThrow(
          this,
          next,
          `    assignedAt: challenge.assignedAt,\n    assignedBy: challenge.assignedBy,\n  };`,
          `    assignedAt: challenge.assignedAt,\n    assignedBy: challenge.assignedBy,\n    caseIds: normalizeCaseIds(challenge.caseIds),\n    topicCode: String(challenge.topicCode || "4").trim() || "4",\n  };`,
          "serialize challenge case fields"
        );

        next = replaceOrThrow(
          this,
          next,
          `  const assignedAt = challenge.assignedAt || new Date().toISOString();\n  if (!username) throw new Error("Missing target username");`,
          `  const assignedAt = challenge.assignedAt || new Date().toISOString();\n  const caseIds = normalizeCaseIds(challenge.caseIds);\n  const topicCode = String(challenge.topicCode || "4").trim() || "4";\n  if (!username) throw new Error("Missing target username");`,
          "assign challenge case values"
        );

        next = replaceOrThrow(
          this,
          next,
          `      assignedAt,\n      assignedBy: String(challenge.assignedBy || "").trim(),\n    };`,
          `      assignedAt,\n      assignedBy: String(challenge.assignedBy || "").trim(),\n      caseIds,\n      topicCode,\n    };`,
          "new challenge case fields"
        );

        patched.add("store");
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/qaTypingChallengeHistoryStore.ts")) {
        next = replaceOrThrow(
          this,
          next,
          `export type QaTypingChallengeHistoryResult = "Pass" | "Fail" | "Timeout";`,
          `export type QaTypingChallengeHistoryResult = "Pass" | "Fail" | "Timeout";\n\nexport type QaTypingMistakeDetail = {\n  index: number;\n  expected: string;\n  typed: string;\n};`,
          "mistake detail type"
        );

        next = replaceOrThrow(
          this,
          next,
          `  assignedAt: string;\n  assignedBy: string;\n};`,
          `  assignedAt: string;\n  assignedBy: string;\n  caseIds?: string[];\n  topicCode?: string;\n  mistakeDetails?: QaTypingMistakeDetail[];\n};`,
          "history trace fields"
        );

        next = replaceOrThrow(
          this,
          next,
          `function normalizeHistoryRecord(id: string, row: any): QaTypingChallengeHistoryRecord {`,
          `function normalizeCaseIds(value: unknown) {\n  const source = Array.isArray(value) ? value : String(value || "").split(/[,;|\\n\\s]+/g);\n  return Array.from(new Set(source.map((item) => String(item || "").replace(/\\s+/g, "").trim().toUpperCase()).filter(Boolean))).slice(0, 20);\n}\n\nfunction normalizeMistakeDetails(value: unknown): QaTypingMistakeDetail[] {\n  if (!Array.isArray(value)) return [];\n  return value.slice(0, 500).map((item: any, index: number) => ({\n    index: normalizeNumber(item?.index, index),\n    expected: String(item?.expected || "").trim(),\n    typed: String(item?.typed || "").trim(),\n  }));\n}\n\nfunction normalizeHistoryRecord(id: string, row: any): QaTypingChallengeHistoryRecord {`,
          "history trace normalizers"
        );

        next = replaceOrThrow(
          this,
          next,
          `    assignedAt: String(row?.assignedAt || ""),\n    assignedBy: String(row?.assignedBy || "").trim(),\n  };`,
          `    assignedAt: String(row?.assignedAt || ""),\n    assignedBy: String(row?.assignedBy || "").trim(),\n    caseIds: normalizeCaseIds(row?.caseIds || row?.caseId),\n    topicCode: String(row?.topicCode || "4").trim() || "4",\n    mistakeDetails: normalizeMistakeDetails(row?.mistakeDetails),\n  };`,
          "normalized history trace fields"
        );

        next = replaceOrThrow(
          this,
          next,
          `    assignedAt: record.assignedAt || "",\n    assignedBy: String(record.assignedBy || "").trim(),\n    createdAtServer: serverTimestamp(),`,
          `    assignedAt: record.assignedAt || "",\n    assignedBy: String(record.assignedBy || "").trim(),\n    caseIds: normalizeCaseIds(record.caseIds),\n    topicCode: String(record.topicCode || "4").trim() || "4",\n    mistakeDetails: normalizeMistakeDetails(record.mistakeDetails),\n    createdAtServer: serverTimestamp(),`,
          "saved history trace fields"
        );

        patched.add("history-store");
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/QaTypingGate.tsx")) {
        next = replaceOrThrow(
          this,
          next,
          `    const mistakeCount = Math.max(0, typedCount - correctCount);\n\n    await saveQaTypingChallengeHistory({`,
          `    const mistakeCount = Math.max(0, typedCount - correctCount);\n    const mistakeDetails = units\n      .map((typed, index) => typed === challenge.word ? null : ({ index, expected: challenge.word, typed }))\n      .filter(Boolean) as Array<{ index: number; expected: string; typed: string }>;\n\n    await saveQaTypingChallengeHistory({`,
          "gate mistake capture"
        );

        next = replaceOrThrow(
          this,
          next,
          `      assignedAt: challenge.assignedAt || "",\n      assignedBy: challenge.assignedBy || "",\n    });`,
          `      assignedAt: challenge.assignedAt || "",\n      assignedBy: challenge.assignedBy || "",\n      caseIds: challenge.caseIds || [],\n      topicCode: challenge.topicCode || "4",\n      mistakeDetails,\n    });`,
          "gate history trace payload"
        );

        next = replaceOrThrow(
          this,
          next,
          `              <div className="text-center">เวลาที่กำหนด: <span className="font-black text-slate-950">{formatCountdown(challenge.timeLimitSeconds || 60)}</span></div>\n            </div>`,
          `              <div className="text-center">เวลาที่กำหนด: <span className="font-black text-slate-950">{formatCountdown(challenge.timeLimitSeconds || 60)}</span></div>\n            </div>\n            {(challenge.caseIds || []).length ? (\n              <div className="mt-2 text-center text-[11px] font-bold text-violet-700">ข้อ {challenge.topicCode || "4"} · Case {(challenge.caseIds || []).join(", ")}</div>\n            ) : null}`,
          "gate linked case label"
        );

        patched.add("gate");
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/QaTypingChallengeWorkspace.tsx")) {
        next = next.replace(
          /History:<\/span> เก็บเฉพาะผลสรุป เช่น จำนวนที่พิมพ์ ถูก ผิด เวลา และผล Pass\/Fail\/Timeout โดยไม่เก็บข้อความที่ Agent พิมพ์จริง/g,
          `History:</span> เก็บผลสรุป Case ID ข้อ 4 และเฉพาะคำที่พิมพ์ผิด เพื่อใช้ตรวจสอบย้อนหลัง`
        );
        next = next.replace(
          /แสดงเฉพาะข้อมูลสรุปของการทำแต่ละครั้ง ไม่มีการจัดเก็บข้อความที่พิมพ์จริง/g,
          `แสดงผลสรุป Case ID ข้อ 4 และเฉพาะคำที่พิมพ์ผิดของแต่ละครั้ง`
        );

        next = replaceOrThrow(
          this,
          next,
          `                <table className="min-w-[1180px] w-full border-collapse text-left text-xs">`,
          `                <table className="min-w-[1450px] w-full border-collapse text-left text-xs">`,
          "history wider table"
        );
        next = replaceOrThrow(
          this,
          next,
          `{["Date / Time", "Agent", "Word", "Target", "Typed", "Correct", "Wrong", "Allowed", "Time Limit", "Time Used", "Result"].map((header) => (`,
          `{["Date / Time", "Agent", "Case ID", "ข้อ", "Word", "Target", "Typed", "Correct", "Wrong", "ผิดคำไหน", "Allowed", "Time Limit", "Time Used", "Result"].map((header) => (`,
          "history headers"
        );
        next = next.replace(/colSpan=\{11\}/g, `colSpan={14}`);
        next = replaceOrThrow(
          this,
          next,
          `                          <td className="px-3 py-3"><div className="font-black text-slate-900">{record.displayName || record.username}</div><div className="text-[10px] font-semibold text-slate-400">@{record.username}</div></td>\n                          <td className="px-3 py-3 text-sm font-black text-violet-700">{record.word}</td>`,
          `                          <td className="px-3 py-3"><div className="font-black text-slate-900">{record.displayName || record.username}</div><div className="text-[10px] font-semibold text-slate-400">@{record.username}</div></td>\n                          <td className="px-3 py-3 text-xs font-black text-violet-700">{(record.caseIds || []).join(", ") || "-"}</td>\n                          <td className="px-3 py-3 text-center font-black text-violet-700">{record.topicCode || "4"}</td>\n                          <td className="px-3 py-3 text-sm font-black text-violet-700">{record.word}</td>`,
          "history case columns"
        );
        next = replaceOrThrow(
          this,
          next,
          `                          <td className="px-3 py-3 text-center font-black text-rose-600">{record.mistakeCount}</td>\n                          <td className="px-3 py-3 text-center font-black text-slate-700">{record.allowedMistakes}</td>`,
          `                          <td className="px-3 py-3 text-center font-black text-rose-600">{record.mistakeCount}</td>\n                          <td className="max-w-[280px] px-3 py-3 text-[10px] font-bold text-rose-600">{(record.mistakeDetails || []).length ? (record.mistakeDetails || []).map((item) => \`#${item.index + 1} ${item.expected} → ${item.typed || "(ว่าง)"}\`).join(" · ") : "-"}</td>\n                          <td className="px-3 py-3 text-center font-black text-slate-700">{record.allowedMistakes}</td>`,
          "history wrong word column"
        );

        patched.add("workspace");
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/DashboardMockup.tsx")) {
        next = replaceOrThrow(
          this,
          next,
          `import MonthlyKpiNotice from "./MonthlyKpiNotice";`,
          `import MonthlyKpiNotice from "./MonthlyKpiNotice";\nimport QaAccessCaseHistoryPopup from "./QaAccessCaseHistoryPopup";`,
          "dashboard popup import"
        );

        next = replaceOrThrow(
          this,
          next,
          `  appealReviewedTopics,\n}: {\n  topics: Topic[];`,
          `  appealReviewedTopics,\n  caseId,\n  targetUsername,\n}: {\n  topics: Topic[];`,
          "topic table popup props"
        );
        next = replaceOrThrow(
          this,
          next,
          `  appealStatus?: "Approved" | "Rejected";\n  appealReviewedTopics?: AppealReviewedTopic[] | null;\n}) {`,
          `  appealStatus?: "Approved" | "Rejected";\n  appealReviewedTopics?: AppealReviewedTopic[] | null;\n  caseId?: string;\n  targetUsername?: string;\n}) {`,
          "topic table popup prop types"
        );

        next = replaceOrThrow(
          this,
          next,
          `                <div className="text-[20px] font-bold tracking-tight text-slate-900">\n                  {row.shownTopic.code} {row.shownTopic.label}\n                </div>`,
          `                <div className="text-[20px] font-bold tracking-tight text-slate-900">\n                  {row.shownTopic.code} {row.shownTopic.label}\n                </div>\n                {String(row.shownTopic.code) === "4" ? (\n                  <QaAccessCaseHistoryPopup caseId={caseId} username={targetUsername} />\n                ) : null}`,
          "topic 4 popup button"
        );

        next = replaceOrThrow(
          this,
          next,
          `                appealStatus={caseItem.appealStatus}\n                appealReviewedTopics={caseItem.appealReviewedTopics}\n              />`,
          `                appealStatus={caseItem.appealStatus}\n                appealReviewedTopics={caseItem.appealReviewedTopics}\n                caseId={caseItem.caseId}\n                targetUsername={caseItem.targetUsername}\n              />`,
          "case table popup values"
        );

        patched.add("dashboard");
        return { code: next, map: null };
      }

      return null;
    },

    buildEnd(error) {
      if (error) return;
      const required = ["admin", "store", "history-store", "gate", "workspace", "dashboard"];
      const missing = required.filter((item) => !patched.has(item));
      if (missing.length) this.error(`QA Access case-link patch was not applied to: ${missing.join(", ")}`);
    },
  };
}
