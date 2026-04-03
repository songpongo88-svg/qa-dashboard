import { useMemo, useState } from "react";
import { APR_2026_TOPICS } from "../lib/evaluation/rubricDefinitions";
import { calculateApril2026Incentive } from "../lib/evaluation/gradeIncentiveEngine";
import type {
  CaseMaster,
  EvaluationTopicResult,
} from "../lib/evaluation/evaluationTypes";

const DEFAULT_CASE: CaseMaster = {
  caseId: "",
  auditDate: "",
  monthLabel: "April 2026",
  weekLabel: "",
  agentName: "",
  sourceType: "text",
  hasOutboundCall: false,
  voiceFileUploaded: false,
  rubricVersion: "APR_2026",
  reviewStatus: "Draft",
  caseSummary: "",
  finalScore: 0,
  finalGrade: "D",
  incentiveTotal: 0,
  incentiveCash: 0,
  incentiveRbhCode: 0,
  criticalErrorFlag: false,
};

function buildDefaultTopicResults(): EvaluationTopicResult[] {
  return APR_2026_TOPICS.map((topic) => ({
    topicCode: topic.topicCode,
    topicLabel: topic.topicLabel,
    topicGroup: topic.topicGroup,
    maxScore: topic.maxScore,
    deductionLevel: "None",
    suggestedScoreMin: topic.maxScore,
    suggestedScoreMax: topic.maxScore,
    reviewerFinalScore: topic.maxScore,
    reasonFormalTh: "",
    evidenceQuote: "",
    improvementGuidance: "",
    boundaryRuleApplied: topic.boundaryRule,
    reviewerComment: "",
    languageQualityCheck: topic.topicCode === "4.2" ? "Good" : undefined,
    chatToneCheck: topic.topicCode === "4.3" ? "Good" : undefined,
    voiceToneCheck: topic.topicCode === "4.3" ? "N/A" : undefined,
  }));
}

export default function EvaluationStudioPage() {
  const [caseMaster, setCaseMaster] = useState<CaseMaster>(DEFAULT_CASE);
  const [transcriptText, setTranscriptText] = useState("");
  const [topicResults, setTopicResults] = useState<EvaluationTopicResult[]>(
    buildDefaultTopicResults()
  );

  const totalScore = useMemo(() => {
    return topicResults.reduce((sum, topic) => sum + topic.reviewerFinalScore, 0);
  }, [topicResults]);

  const gradeIncentive = useMemo(() => {
    return calculateApril2026Incentive(totalScore);
  }, [totalScore]);

  function handleGenerateSummary() {
    const trimmed = transcriptText.trim();
    const fallbackSummary = trimmed
      ? `สรุปอัตโนมัติเบื้องต้นจากข้อความเคส: ${trimmed.slice(0, 180)}${
          trimmed.length > 180 ? "..." : ""
        }`
      : "ยังไม่มีข้อมูล transcript สำหรับสรุปเคส";

    setCaseMaster((prev) => ({
      ...prev,
      caseSummary: fallbackSummary,
      customerIntent: prev.customerIntent || "ระบุภายหลังจากการอ่านเคส",
      agentActionSummary: prev.agentActionSummary || "ระบุภายหลังจากการประเมิน",
      resolutionStatus: prev.resolutionStatus || "Pending",
    }));
  }

  function handleTopicChange(
  index: number,
  patch: Partial<EvaluationTopicResult>
) {
  setTopicResults((prev) =>
    prev.map((topic, i) => {
      if (i !== index) return topic;

      const nextTopic = { ...topic, ...patch };

      if (patch.deductionLevel) {
        const band = getDeductionBand(nextTopic.topicCode, patch.deductionLevel);
        const suggestedScore = getSuggestedScoreFromLevel(
          nextTopic.topicCode,
          patch.deductionLevel
        );

        return {
          ...nextTopic,
          suggestedScoreMin: band?.min,
          suggestedScoreMax: band?.max,
          reviewerFinalScore:
            suggestedScore !== null ? suggestedScore : nextTopic.reviewerFinalScore,
        };
      }

      return nextTopic;
    })
  );
}

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">
            QA Evaluation Studio
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Prototype สำหรับประเมิน QA เดือนเมษายน 2569 ตาม rubric ใหม่
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Case Intake</h2>

            <input
              className="w-full rounded-xl border px-3 py-2"
              placeholder="Case ID"
              value={caseMaster.caseId}
              onChange={(e) =>
                setCaseMaster((prev) => ({ ...prev, caseId: e.target.value }))
              }
            />

            <input
              className="w-full rounded-xl border px-3 py-2"
              placeholder="Agent Name"
              value={caseMaster.agentName}
              onChange={(e) =>
                setCaseMaster((prev) => ({ ...prev, agentName: e.target.value }))
              }
            />

            <input
              className="w-full rounded-xl border px-3 py-2"
              type="date"
              value={caseMaster.auditDate}
              onChange={(e) =>
                setCaseMaster((prev) => ({ ...prev, auditDate: e.target.value }))
              }
            />

            <textarea
              className="min-h-[220px] w-full rounded-xl border px-3 py-2"
              placeholder="Paste chat transcript here"
              value={transcriptText}
              onChange={(e) => setTranscriptText(e.target.value)}
            />

            <button
              className="rounded-xl bg-violet-600 px-4 py-2 text-white"
              onClick={handleGenerateSummary}
            >
              Generate Case Summary
            </button>
          </div>

          <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Case Summary</h2>

            <div className="rounded-xl border p-4 text-sm text-slate-700">
              {caseMaster.caseSummary || "ยังไม่มีสรุปเคส"}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border p-4">
                <div className="text-xs text-slate-500">Customer Intent</div>
                <div className="mt-1 text-sm text-slate-800">
                  {caseMaster.customerIntent || "-"}
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <div className="text-xs text-slate-500">Resolution Status</div>
                <div className="mt-1 text-sm text-slate-800">
                  {caseMaster.resolutionStatus || "-"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Topic Evaluation</h2>

          <div className="mt-4 space-y-4">
            {topicResults.map((topic, index) => (
              <div key={topic.topicCode} className="space-y-3 rounded-2xl border p-4">
  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
    <div>
      <div className="font-medium text-slate-900">
        {topic.topicCode} {topic.topicLabel}
      </div>
      <div className="text-xs text-slate-500">
        Max {topic.maxScore}
      </div>
      <div className="mt-1 text-xs text-slate-500">
        Suggested Range: {topic.suggestedScoreMin ?? "-"} - {topic.suggestedScoreMax ?? "-"}
      </div>
    </div>

    <div className="grid gap-2 sm:grid-cols-2">
      <select
        className="rounded-xl border px-3 py-2 text-sm"
        value={topic.deductionLevel}
        onChange={(e) =>
          handleTopicChange(index, {
            deductionLevel: e.target.value as EvaluationTopicResult["deductionLevel"],
          })
        }
      >
        <option value="None">None</option>
        <option value="Minor">Minor</option>
        <option value="Moderate">Moderate</option>
        <option value="Severe">Severe</option>
      </select>

      <input
        className="w-full rounded-xl border px-3 py-2 text-right"
        type="number"
        min={0}
        max={topic.maxScore}
        step={1}
        value={topic.reviewerFinalScore}
        onChange={(e) =>
          handleTopicChange(index, {
            reviewerFinalScore: Number(e.target.value || 0),
          })
        }
      />
    </div>
  </div>

                  <input
                    className="w-24 rounded-xl border px-3 py-2 text-right"
                    type="number"
                    min={0}
                    max={topic.maxScore}
                    step={1}
                    value={topic.reviewerFinalScore}
                    onChange={(e) =>
                      handleTopicChange(index, {
                        reviewerFinalScore: Number(e.target.value || 0),
                      })
                    }
                  />
                </div>

                <textarea
                  className="min-h-[90px] w-full rounded-xl border px-3 py-2"
                  placeholder="Reason Formal TH"
                  value={topic.reasonFormalTh}
                  onChange={(e) =>
                    handleTopicChange(index, { reasonFormalTh: e.target.value })
                  }
                />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Final Summary</h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <div className="rounded-xl border p-4">
              <div className="text-xs text-slate-500">Final Score</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {gradeIncentive.finalScore}
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-xs text-slate-500">Grade</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {gradeIncentive.finalGrade}
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-xs text-slate-500">Incentive Total</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {gradeIncentive.incentiveTotal}
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-xs text-slate-500">Scheme</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {gradeIncentive.incentiveScheme}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
