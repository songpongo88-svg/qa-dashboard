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

        const progressLogic = `  const qaEvaluationProgressSnapshotRef = useRef({\n    completedCount: selectedAgentCaseCount,\n    statusText: agentQuotaStatus?.text || "",\n  });\n  qaEvaluationProgressSnapshotRef.current = {\n    completedCount: selectedAgentCaseCount,\n    statusText: agentQuotaStatus?.text || "",\n  };\n\n  useEffect(() => {\n    const targetUsername = String(selectedAgentOption?.username || "").trim();\n    const evaluatorUsername = String(currentUser?.username || "").trim();\n    if (!targetUsername || !evaluatorUsername) return;\n\n    const startedAt = new Date().toISOString();\n    const publishProgress = () => {\n      const snapshot = qaEvaluationProgressSnapshotRef.current;\n      void setQaEvaluationProgress({\n        username: targetUsername,\n        displayName: String(selectedAgentOption?.agentName || selectedAgentOption?.displayName || agentName || targetUsername).trim(),\n        role: String(selectedAgentOption?.role || "Agent").trim(),\n        evaluatorUsername,\n        evaluatorName: String(currentUser?.displayName || currentUser?.agentName || evaluatorUsername).trim(),\n        completedCount: snapshot.completedCount,\n        targetCount: 10,\n        statusText: snapshot.statusText,\n        startedAt,\n      }).catch((error) => console.warn("QA evaluation progress publish failed", error));\n    };\n\n    publishProgress();\n    const heartbeat = window.setInterval(publishProgress, 30_000);\n    return () => {\n      window.clearInterval(heartbeat);\n      void clearQaEvaluationProgress(targetUsername, evaluatorUsername).catch((error) =>\n        console.warn("QA evaluation progress cleanup failed", error)\n      );\n    };\n  }, [\n    agentName,\n    currentUser?.agentName,\n    currentUser?.displayName,\n    currentUser?.username,\n    selectedAgentOption?.agentName,\n    selectedAgentOption?.displayName,\n    selectedAgentOption?.role,\n    selectedAgentOption?.username,\n  ]);\n\n  useEffect(() => {\n    const targetUsername = String(selectedAgentOption?.username || "").trim();\n    const evaluatorUsername = String(currentUser?.username || "").trim();\n    if (!targetUsername || !evaluatorUsername) return;\n    void setQaEvaluationProgress({\n      username: targetUsername,\n      displayName: String(selectedAgentOption?.agentName || selectedAgentOption?.displayName || agentName || targetUsername).trim(),\n      role: String(selectedAgentOption?.role || "Agent").trim(),\n      evaluatorUsername,\n      evaluatorName: String(currentUser?.displayName || currentUser?.agentName || evaluatorUsername).trim(),\n      completedCount: selectedAgentCaseCount,\n      targetCount: 10,\n      statusText: agentQuotaStatus?.text || "",\n    }).catch((error) => console.warn("QA evaluation progress update failed", error));\n  }, [\n    agentName,\n    agentQuotaStatus?.text,\n    currentUser?.agentName,\n    currentUser?.displayName,\n    currentUser?.username,\n    selectedAgentCaseCount,\n    selectedAgentOption?.agentName,\n    selectedAgentOption?.displayName,\n    selectedAgentOption?.role,\n    selectedAgentOption?.username,\n  ]);\n\n`;

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
