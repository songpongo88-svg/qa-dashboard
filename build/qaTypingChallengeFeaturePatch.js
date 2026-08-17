export function qaTypingChallengeFeaturePatch() {
  let appPatched = false;

  return {
    name: "qa-typing-challenge-feature",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/App.tsx")) return null;

      let next = code;

      const importAnchor = 'import CreateEvaluationMockup, { EvaluationSubmitPayload } from "./CreateEvaluationMockup";';
      if (!next.includes(importAnchor)) {
        this.error("QA Access Check patch could not find App CreateEvaluation import.");
      }
      next = next.replace(
        importAnchor,
        `${importAnchor}\nimport QaTypingGate from "./QaTypingGate";\nimport QaTypingChallengeWorkspace from "./QaTypingChallengeWorkspace";`
      );

      const appTabAnchor = '  | "create-evaluation"\n  | "pre-test"';
      if (!next.includes(appTabAnchor)) {
        this.error("QA Access Check patch could not find AppTab anchor.");
      }
      next = next.replace(
        appTabAnchor,
        '  | "create-evaluation"\n  | "qa-access-check"\n  | "pre-test"'
      );

      const validTabsAnchor = '  "create-evaluation",\n  "pre-test",';
      if (!next.includes(validTabsAnchor)) {
        this.error("QA Access Check patch could not find VALID_APP_TABS anchor.");
      }
      next = next.replace(
        validTabsAnchor,
        '  "create-evaluation",\n  "qa-access-check",\n  "pre-test",'
      );

      const labelAnchor = '  "create-evaluation": "Evaluate",\n  "pre-test":';
      if (!next.includes(labelAnchor)) {
        this.error("QA Access Check patch could not find workspace label anchor.");
      }
      next = next.replace(
        labelAnchor,
        '  "create-evaluation": "Evaluate",\n  "qa-access-check": "QA Access Check",\n  "pre-test":'
      );

      const sidebarAnchor = '        { key: "create-evaluation", label: "Evaluate", description: "สร้าง Draft ตรวจ Rubric แนบหลักฐาน และบันทึกผลประเมิน", icon: "add", allowed: createEvaluationAllowed, active: activeWorkspaceTab === "create-evaluation", onClick: () => activateWorkspaceTab("create-evaluation") },';
      if (!next.includes(sidebarAnchor)) {
        this.error("QA Access Check patch could not find Evaluate sidebar item.");
      }
      next = next.replace(
        sidebarAnchor,
        `${sidebarAnchor}\n        { key: "qa-access-check", label: "QA Access Check", description: "กำหนดคำที่ Agent ต้องพิมพ์ให้ผ่านก่อนเข้าดูผล QA", icon: "target", allowed: createEvaluationAllowed, active: activeWorkspaceTab === "qa-access-check", onClick: () => activateWorkspaceTab("qa-access-check") },`
      );

      const renderAnchor = `            onSubmitEvaluation={handleEvaluationSubmitted}\n          />\n        ) : activeTab === "pre-test" && preTestAllowed ? (`;
      if (!next.includes(renderAnchor)) {
        this.error("QA Access Check patch could not find Evaluate render anchor.");
      }
      next = next.replace(
        renderAnchor,
        `            onSubmitEvaluation={handleEvaluationSubmitted}\n          />\n        ) : activeTab === "qa-access-check" && createEvaluationAllowed ? (\n          <QaTypingChallengeWorkspace\n            agentOptions={qaEvaluationAgentOptions}\n            currentUser={currentUser}\n          />\n        ) : activeTab === "pre-test" && preTestAllowed ? (`
      );

      const gateRenderAnchor = `        </WorkspaceKeepAlive>\n      </div>\n\n    </>`;
      if (!next.includes(gateRenderAnchor)) {
        this.error("QA Access Check patch could not find App gate render anchor.");
      }
      next = next.replace(
        gateRenderAnchor,
        `        </WorkspaceKeepAlive>\n      </div>\n\n      <QaTypingGate currentUser={currentUser} enabled={activeTab === "dashboard"} />\n\n    </>`
      );

      if (next === code) {
        this.error("QA Access Check App patch made no change.");
      }

      appPatched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (!error && !appPatched) {
        this.error("QA Access Check patch was not applied to App.tsx.");
      }
    },
  };
}
