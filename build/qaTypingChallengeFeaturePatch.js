export function qaTypingChallengeFeaturePatch() {
  let evaluatePatched = false;
  let appPatched = false;

  return {
    name: "qa-typing-challenge-feature",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];

      if (cleanId.endsWith("/src/CreateEvaluationMockup.tsx")) {
        let next = code;
        const importAnchor = 'import PageHero from "./PageHero";';
        if (!next.includes(importAnchor)) {
          this.error("QA typing challenge patch could not find Evaluate PageHero import.");
        }
        if (!next.includes('from "./QaTypingChallengeAdmin"')) {
          next = next.replace(
            importAnchor,
            `${importAnchor}\nimport QaTypingChallengeAdmin from "./QaTypingChallengeAdmin";`
          );
        }

        const agentLabelMarker = '<span className={labelClass}>Agent Full Name</span>';
        const agentLabelStart = next.indexOf(agentLabelMarker);
        if (agentLabelStart < 0) {
          this.error("QA typing challenge patch could not find Agent Full Name label.");
        }

        const nextLabelMarker = '\n\n                <label';
        const nextLabelIndex = next.indexOf(nextLabelMarker, agentLabelStart + agentLabelMarker.length);
        if (nextLabelIndex < 0) {
          this.error("QA typing challenge patch could not find the next Evaluate field after Agent selector.");
        }

        const adminUi = `\n\n                <QaTypingChallengeAdmin\n                  agent={selectedAgentOption}\n                  currentUser={currentUser}\n                />`;
        next = next.slice(0, nextLabelIndex) + adminUi + next.slice(nextLabelIndex);

        if (next === code) {
          this.error("QA typing challenge Evaluate patch made no change.");
        }
        evaluatePatched = true;
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/App.tsx")) {
        let next = code;
        const importAnchor = 'import CreateEvaluationMockup, { EvaluationSubmitPayload } from "./CreateEvaluationMockup";';
        if (!next.includes(importAnchor)) {
          this.error("QA typing challenge patch could not find App CreateEvaluation import.");
        }
        if (!next.includes('from "./QaTypingGate"')) {
          next = next.replace(
            importAnchor,
            `${importAnchor}\nimport QaTypingGate from "./QaTypingGate";`
          );
        }

        const renderAnchor = `        </WorkspaceKeepAlive>\n      </div>\n\n    </>`;
        if (!next.includes(renderAnchor)) {
          this.error("QA typing challenge patch could not find App workspace render anchor.");
        }
        next = next.replace(
          renderAnchor,
          `        </WorkspaceKeepAlive>\n      </div>\n\n      <QaTypingGate currentUser={currentUser} enabled={activeTab === "dashboard"} />\n\n    </>`
        );

        if (next === code) {
          this.error("QA typing challenge App patch made no change.");
        }
        appPatched = true;
        return { code: next, map: null };
      }

      return null;
    },

    buildEnd(error) {
      if (error) return;
      if (!evaluatePatched) {
        this.error("QA typing challenge patch was not applied to CreateEvaluationMockup.tsx.");
      }
      if (!appPatched) {
        this.error("QA typing challenge patch was not applied to App.tsx.");
      }
    },
  };
}
