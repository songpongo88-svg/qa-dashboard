export function qaEvaluationProgressPatch() {
  let evaluationPatched = false;
  let appPatched = false;

  return {
    name: "qa-evaluation-progress",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];

      if (cleanId.endsWith("/src/CreateEvaluationMockup.tsx")) {
        let next = code;

        const importAnchor = 'import PageHero from "./PageHero";';
        if (!next.includes(importAnchor)) {
          this.error("QA evaluation progress patch could not find CreateEvaluation PageHero import.");
        }
        if (!next.includes('from "./qaEvaluationProgressStore"')) {
          next = next.replace(
            importAnchor,
            `${importAnchor}\nimport { clearQaEvaluationProgress, setQaEvaluationProgress } from "./qaEvaluationProgressStore";`
          );
        }

        const quotaEffectAnchor = `  useEffect(() => {\n    let cancelled = false;\n    setAgentQuotaLoading(true);`;
        if (!next.includes(quotaEffectAnchor)) {
          this.error("QA evaluation progress patch could not find Agent quota loading effect.");
        }

        const progressLogic = `  const qaEvaluationProgressContextRef = useRef("");
  if (!qaEvaluationProgressContextRef.current) {
    const key = "qa-evaluation-tab:" + String(currentUser?.username || "");
    try { qaEvaluationProgressContextRef.current = sessionStorage.getItem(key) || crypto.randomUUID(); sessionStorage.setItem(key, qaEvaluationProgressContextRef.current); }
    catch { qaEvaluationProgressContextRef.current = crypto.randomUUID(); }
  }
  const qaEvaluationProgressContext = qaEvaluationProgressContextRef.current + "|" + selectedAgentOption?.username + "|" + selectedMonthKey + "|" + activeSubmittedRecordId;
  const qaEvaluationProgressEnabled = Boolean(selectedAgentOption?.username) && monthlyResult.editable && workspaceView === "form" && evaluationStatus !== "Submitted";
  const qaEvaluationLeaseRef = useRef("");
  const qaEvaluationProgressSnapshotRef = useRef({ completedCount: selectedAgentCaseCount, mode: "evaluation" as "edit" | "evaluation", statusText: "", isTestCase: false, enabled: false });
  qaEvaluationProgressSnapshotRef.current = { completedCount: selectedAgentCaseCount, mode: activeSubmittedRecordId ? "edit" : "evaluation", statusText: agentQuotaStatus?.text || "", isTestCase, enabled: qaEvaluationProgressEnabled };
  useEffect(() => {
    const targetUsername = String(selectedAgentOption?.username || "").trim();
    const evaluatorUsername = String(currentUser?.username || "").trim();
    if (!targetUsername || !evaluatorUsername || !qaEvaluationProgressEnabled) return;
    const leaseToken = crypto.randomUUID();
    qaEvaluationLeaseRef.current = leaseToken;
    const startedAt = new Date().toISOString();
    const publishProgress = () => {
      const snapshot = qaEvaluationProgressSnapshotRef.current;
      if (!snapshot.enabled) return;
      void setQaEvaluationProgress({ username: targetUsername,
        displayName: String(selectedAgentOption?.agentName || selectedAgentOption?.displayName || agentName || targetUsername).trim(),
        role: String(selectedAgentOption?.role || "Agent").trim(), evaluatorUsername,
        evaluatorName: String(currentUser?.displayName || currentUser?.agentName || evaluatorUsername).trim(),
        completedCount: snapshot.completedCount, mode: snapshot.mode, targetCount: 10, statusText: snapshot.statusText,
        monthKey: selectedMonthKey, evaluationId: activeSubmittedRecordId, caseId: activeSubmittedRecordId ? caseId : "", contextId: qaEvaluationProgressContext, leaseToken: qaEvaluationLeaseRef.current, isTestCase: snapshot.isTestCase, startedAt,
      }).catch((error) => console.warn("QA evaluation progress publish failed", error));
    };
    publishProgress();
    const heartbeat = window.setInterval(publishProgress, 30_000);
    return () => {
      window.clearInterval(heartbeat);
      void clearQaEvaluationProgress(targetUsername, evaluatorUsername, qaEvaluationProgressContext, leaseToken).catch((error) => console.warn("QA evaluation progress cleanup failed", error));
    };
  }, [agentName, currentUser?.agentName, currentUser?.displayName, currentUser?.username,
    selectedAgentOption?.agentName, selectedAgentOption?.displayName, selectedAgentOption?.role, selectedAgentOption?.username,
    qaEvaluationProgressContext, qaEvaluationProgressEnabled]);
  useEffect(() => {
    const targetUsername = String(selectedAgentOption?.username || "").trim();
    const evaluatorUsername = String(currentUser?.username || "").trim();
    if (!targetUsername || !evaluatorUsername || !qaEvaluationProgressEnabled) return;
    void setQaEvaluationProgress({ username: targetUsername,
      displayName: String(selectedAgentOption?.agentName || selectedAgentOption?.displayName || agentName || targetUsername).trim(),
      role: String(selectedAgentOption?.role || "Agent").trim(), evaluatorUsername,
      evaluatorName: String(currentUser?.displayName || currentUser?.agentName || evaluatorUsername).trim(),
      completedCount: selectedAgentCaseCount, mode: activeSubmittedRecordId ? "edit" : "evaluation", targetCount: 10,
      statusText: agentQuotaStatus?.text || "", monthKey: selectedMonthKey, evaluationId: activeSubmittedRecordId,
      caseId: activeSubmittedRecordId ? caseId : "", contextId: qaEvaluationProgressContext, isTestCase,
    }).catch((error) => console.warn("QA evaluation progress update failed", error));
  }, [agentName, agentQuotaStatus?.text, currentUser?.agentName, currentUser?.displayName, currentUser?.username,
    selectedAgentCaseCount, selectedAgentOption?.agentName, selectedAgentOption?.displayName, selectedAgentOption?.role,
    selectedAgentOption?.username, qaEvaluationProgressContext, qaEvaluationProgressEnabled, isTestCase]);

`;

        next = next.replace(quotaEffectAnchor, `${progressLogic}${quotaEffectAnchor}`);

        if (next === code) {
          this.error("QA evaluation progress CreateEvaluation patch made no change.");
        }
        evaluationPatched = true;
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/App.tsx")) {
        let next = code;

        const importAnchor = 'import CreateEvaluationMockup, { EvaluationSubmitPayload } from "./CreateEvaluationMockup";';
        if (!next.includes(importAnchor)) {
          this.error("QA evaluation progress patch could not find App CreateEvaluation import.");
        }
        if (!next.includes('from "./qaEvaluationProgressStore"')) {
          next = next.replace(
            importAnchor,
            `${importAnchor}\nimport QaEvaluationProgressNotice from "./QaEvaluationProgressNotice";\nimport { clearQaEvaluationProgressByEvaluator } from "./qaEvaluationProgressStore";`
          );
        }

        const stateAnchor = '  const currentUsernameKey = currentUser?.username?.trim().toLowerCase() || "";';
        if (!next.includes(stateAnchor)) {
          this.error("QA evaluation progress patch could not find App current user state anchor.");
        }
        next = next.replace(
          stateAnchor,
          `  useEffect(() => {\n    const evaluatorUsername = String(currentUser?.username || "").trim();\n    if (!evaluatorUsername || activeTab === "create-evaluation") return;\n    void clearQaEvaluationProgressByEvaluator(evaluatorUsername).catch((error) =>\n      console.warn("QA evaluation progress evaluator cleanup failed", error)\n    );\n  }, [activeTab, currentUser?.username]);\n\n${stateAnchor}`
        );

        const noticeAnchor = '      <QaTypingGate currentUser={currentUser} enabled={activeTab === "dashboard"} />';
        if (!next.includes(noticeAnchor)) {
          this.error("QA evaluation progress patch could not find QA typing gate render anchor.");
        }
        next = next.replace(
          noticeAnchor,
          `${noticeAnchor}\n      <QaEvaluationProgressNotice currentUser={currentUser} />`
        );

        if (next === code) {
          this.error("QA evaluation progress App patch made no change.");
        }
        appPatched = true;
        return { code: next, map: null };
      }

      return null;
    },

    buildEnd(error) {
      if (error) return;
      if (!evaluationPatched) this.error("QA evaluation progress was not applied to CreateEvaluationMockup.tsx.");
      if (!appPatched) this.error("QA evaluation progress was not applied to App.tsx.");
    },
  };
}
