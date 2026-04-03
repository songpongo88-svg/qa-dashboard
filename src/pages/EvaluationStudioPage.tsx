import { useMemo, useState } from "react";
import { APR_2026_TOPICS } from "../lib/evaluation/rubricDefinitions";
import { calculateApril2026Incentive } from "../lib/evaluation/gradeIncentiveEngine";
import {
  getDeductionBand,
  getSuggestedScoreFromLevel,
} from "../lib/evaluation/deductionRules";
import { getReasonTemplate } from "../lib/evaluation/reasonTemplates";
import type {
  CaseMaster,
  EvaluationTopicResult,
  ToneCheck,
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
  customerIntent: "",
  agentActionSummary: "",
  resolutionStatus: "",
  potentialRisk: "",
  finalScore: 0,
  finalGrade: "D",
  incentiveTotal: 0,
  incentiveCash: 0,
  incentiveRbhCode: 0,
  criticalErrorFlag: false,
  criticalErrorType: "",
  criticalErrorNote: "",
  overallQaSummary: "",
  coachingSummary: "",
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
    reasonFormalTh: getReasonTemplate(topic.topicCode, "None"),
    evidenceQuote: "",
    improvementGuidance: "",
    boundaryRuleApplied: topic.boundaryRule,
    reviewerComment: "",
    languageQualityCheck: topic.topicCode === "4.2" ? "Good" : undefined,
    chatToneCheck: topic.topicCode === "4.3" ? "Good" : undefined,
    voiceToneCheck: topic.topicCode === "4.3" ? "N/A" : undefined,
  }));
}

function escapeCsvValue(value: string | number | boolean | null | undefined) {
  const text = String(value ?? "");
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function isCommunicationTopic(topicCode: string) {
  return topicCode === "4.2" || topicCode === "4.3";
}

function isVoiceRelevant(topicCode: string, hasOutboundCall: boolean) {
  return topicCode === "4.3" && hasOutboundCall;
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
      ? `สรุปอัตโนมัติเบื้องต้นจากข้อความเคส: ${trimmed.slice(0, 220)}${
          trimmed.length > 220 ? "..." : ""
        }`
      : "ยังไม่มีข้อมูล transcript สำหรับสรุปเคส";

    setCaseMaster((prev) => ({
      ...prev,
      caseSummary: fallbackSummary,
      customerIntent: prev.customerIntent || "ระบุภายหลังจากการอ่านเคส",
      agentActionSummary: prev.agentActionSummary || "ระบุภายหลังจากการประเมิน",
      resolutionStatus: prev.resolutionStatus || "Pending",
      potentialRisk:
        prev.potentialRisk ||
        "โปรดตรวจสอบว่ามีข้อมูลยืนยันตัวตน, SLA และ next step ครบถ้วนหรือไม่",
    }));
  }

  function handleCaseMasterChange(patch: Partial<CaseMaster>) {
    setCaseMaster((prev) => ({ ...prev, ...patch }));
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

          const currentReason = topic.reasonFormalTh?.trim() || "";
          const autoReason = getReasonTemplate(
            nextTopic.topicCode,
            patch.deductionLevel
          );

          const shouldReplaceReason =
            currentReason === "" ||
            currentReason === getReasonTemplate(topic.topicCode, topic.deductionLevel);

          return {
            ...nextTopic,
            suggestedScoreMin: band?.min,
            suggestedScoreMax: band?.max,
            reviewerFinalScore:
              suggestedScore !== null ? suggestedScore : nextTopic.reviewerFinalScore,
            reasonFormalTh: shouldReplaceReason ? autoReason : nextTopic.reasonFormalTh,
          };
        }

        return nextTopic;
      })
    );
  }

  function buildExportPayload() {
    return {
      caseMaster: {
        ...caseMaster,
        finalScore: gradeIncentive.finalScore,
        finalGrade: gradeIncentive.finalGrade,
        incentiveTotal: gradeIncentive.incentiveTotal,
        incentiveCash: gradeIncentive.incentiveCash,
        incentiveRbhCode: gradeIncentive.incentiveRbhCode,
      },
      topicResults,
      transcriptText,
      exportedAt: new Date().toISOString(),
    };
  }

  function handleExportJson() {
    const payload = buildExportPayload();

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${caseMaster.caseId || "qa-evaluation"}-evaluation.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleExportCsv() {
    const topicScoreMap = Object.fromEntries(
      topicResults.map((topic) => [topic.topicCode, topic.reviewerFinalScore])
    );

    const row = {
      auditDate: caseMaster.auditDate,
      month: caseMaster.monthLabel,
      week: caseMaster.weekLabel || "",
      caseId: caseMaster.caseId,
      agentName: caseMaster.agentName,
      rubricVersion: caseMaster.rubricVersion,
      reviewStatus: caseMaster.reviewStatus,
      hasOutboundCall: caseMaster.hasOutboundCall,
      voiceFileUploaded: caseMaster.voiceFileUploaded,
      caseSummary: caseMaster.caseSummary,
      customerIntent: caseMaster.customerIntent || "",
      agentActionSummary: caseMaster.agentActionSummary || "",
      resolutionStatus: caseMaster.resolutionStatus || "",
      potentialRisk: caseMaster.potentialRisk || "",
      finalScore: gradeIncentive.finalScore,
      finalGrade: gradeIncentive.finalGrade,
      incentiveTotal: gradeIncentive.incentiveTotal,
      incentiveCash: gradeIncentive.incentiveCash,
      incentiveRbhCode: gradeIncentive.incentiveRbhCode,
      criticalErrorFlag: caseMaster.criticalErrorFlag,
      criticalErrorType: caseMaster.criticalErrorType || "",
      criticalErrorNote: caseMaster.criticalErrorNote || "",
      overallQaSummary: caseMaster.overallQaSummary || "",
      coachingSummary: caseMaster.coachingSummary || "",
      score_1_1: topicScoreMap["1.1"] ?? "",
      score_1_2: topicScoreMap["1.2"] ?? "",
      score_1_3: topicScoreMap["1.3"] ?? "",
      score_2_1: topicScoreMap["2.1"] ?? "",
      score_2_2: topicScoreMap["2.2"] ?? "",
      score_2_3: topicScoreMap["2.3"] ?? "",
      score_3_1: topicScoreMap["3.1"] ?? "",
      score_3_2: topicScoreMap["3.2"] ?? "",
      score_4_1: topicScoreMap["4.1"] ?? "",
      score_4_2: topicScoreMap["4.2"] ?? "",
      score_4_3: topicScoreMap["4.3"] ?? "",
    };

    const headers = Object.keys(row);
    const values = Object.values(row).map((value) => escapeCsvValue(value));
    const csv = [headers.join(","), values.join(",")].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${caseMaster.caseId || "qa-evaluation"}-dashboard-row.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function renderToneSelect(
    value: ToneCheck | undefined,
    onChange: (value: ToneCheck) => void
  ) {
    return (
      <select
        className="rounded-xl border px-3 py-2 text-sm"
        value={value ?? "N/A"}
        onChange={(e) => onChange(e.target.value as ToneCheck)}
      >
        <option value="Good">Good</option>
        <option value="Fair">Fair</option>
        <option value="Poor">Poor</option>
        <option value="N/A">N/A</option>
      </select>
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
                handleCaseMasterChange({ caseId: e.target.value })
              }
            />

            <input
              className="w-full rounded-xl border px-3 py-2"
              placeholder="Agent Name"
              value={caseMaster.agentName}
              onChange={(e) =>
                handleCaseMasterChange({ agentName: e.target.value })
              }
            />

            <input
              className="w-full rounded-xl border px-3 py-2"
              type="date"
              value={caseMaster.auditDate}
              onChange={(e) =>
                handleCaseMasterChange({ auditDate: e.target.value })
              }
            />

            <input
              className="w-full rounded-xl border px-3 py-2"
              placeholder="Week Label เช่น Week 1"
              value={caseMaster.weekLabel || ""}
              onChange={(e) =>
                handleCaseMasterChange({ weekLabel: e.target.value })
              }
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={caseMaster.hasOutboundCall}
                  onChange={(e) =>
                    handleCaseMasterChange({ hasOutboundCall: e.target.checked })
                  }
                />
                Has Outbound Call
              </label>

              <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={caseMaster.voiceFileUploaded}
                  onChange={(e) =>
                    handleCaseMasterChange({ voiceFileUploaded: e.target.checked })
                  }
                />
                Voice File Uploaded
              </label>
            </div>

            <textarea
              className="min-h-[220px] w-full rounded-xl border px-3 py-2"
              placeholder="Paste chat transcript here"
              value={transcriptText}
              onChange={(e) => setTranscriptText(e.target.value)}
            />

            <button
              className="rounded-xl bg-violet-600 px-4 py-2 text-white hover:bg-violet-700"
              onClick={handleGenerateSummary}
            >
              Generate Case Summary
            </button>
          </div>

          <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Case Summary</h2>

            <textarea
              className="min-h-[120px] w-full rounded-xl border px-3 py-2 text-sm"
              value={caseMaster.caseSummary}
              onChange={(e) =>
                handleCaseMasterChange({ caseSummary: e.target.value })
              }
              placeholder="Case Summary"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <textarea
                className="min-h-[100px] rounded-xl border px-3 py-2 text-sm"
                value={caseMaster.customerIntent || ""}
                onChange={(e) =>
                  handleCaseMasterChange({ customerIntent: e.target.value })
                }
                placeholder="Customer Intent"
              />
              <textarea
                className="min-h-[100px] rounded-xl border px-3 py-2 text-sm"
                value={caseMaster.agentActionSummary || ""}
                onChange={(e) =>
                  handleCaseMasterChange({ agentActionSummary: e.target.value })
                }
                placeholder="Agent Action Summary"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={caseMaster.resolutionStatus || ""}
                onChange={(e) =>
                  handleCaseMasterChange({ resolutionStatus: e.target.value })
                }
                placeholder="Resolution Status"
              />
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={caseMaster.potentialRisk || ""}
                onChange={(e) =>
                  handleCaseMasterChange({ potentialRisk: e.target.value })
                }
                placeholder="Potential Risk"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Topic Evaluation</h2>

          <div className="mt-4 space-y-4">
            {topicResults.map((topic, index) => (
              <div key={topic.topicCode} className="space-y-4 rounded-2xl border p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="font-medium text-slate-900">
                      {topic.topicCode} {topic.topicLabel}
                    </div>
                    <div className="text-xs text-slate-500">Max {topic.maxScore}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Suggested Range: {topic.suggestedScoreMin ?? "-"} -{" "}
                      {topic.suggestedScoreMax ?? "-"}
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      className="rounded-xl border px-3 py-2 text-sm"
                      value={topic.deductionLevel}
                      onChange={(e) =>
                        handleTopicChange(index, {
                          deductionLevel:
                            e.target.value as EvaluationTopicResult["deductionLevel"],
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

                {isCommunicationTopic(topic.topicCode) ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    {topic.topicCode === "4.2" ? (
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-slate-500">
                          Language Quality Check
                        </div>
                        {renderToneSelect(
                          topic.languageQualityCheck,
                          (value) =>
                            handleTopicChange(index, {
                              languageQualityCheck: value,
                            })
                        )}
                      </div>
                    ) : null}

                    {topic.topicCode === "4.3" ? (
                      <>
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-slate-500">
                            Chat Tone Check
                          </div>
                          {renderToneSelect(topic.chatToneCheck, (value) =>
                            handleTopicChange(index, {
                              chatToneCheck: value,
                            })
                          )}
                        </div>

                        {isVoiceRelevant(topic.topicCode, caseMaster.hasOutboundCall) ? (
                          <div className="space-y-1">
                            <div className="text-xs font-semibold text-slate-500">
                              Voice Tone Check
                            </div>
                            {renderToneSelect(topic.voiceToneCheck, (value) =>
                              handleTopicChange(index, {
                                voiceToneCheck: value,
                              })
                            )}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}

                <textarea
                  className="min-h-[90px] w-full rounded-xl border px-3 py-2"
                  placeholder="Reason Formal TH"
                  value={topic.reasonFormalTh}
                  onChange={(e) =>
                    handleTopicChange(index, { reasonFormalTh: e.target.value })
                  }
                />

                <div className="grid gap-3 lg:grid-cols-2">
                  <textarea
                    className="min-h-[90px] w-full rounded-xl border px-3 py-2"
                    placeholder="Evidence Quote"
                    value={topic.evidenceQuote || ""}
                    onChange={(e) =>
                      handleTopicChange(index, { evidenceQuote: e.target.value })
                    }
                  />

                  <textarea
                    className="min-h-[90px] w-full rounded-xl border px-3 py-2"
                    placeholder="Improvement Guidance"
                    value={topic.improvementGuidance || ""}
                    onChange={(e) =>
                      handleTopicChange(index, {
                        improvementGuidance: e.target.value,
                      })
                    }
                  />
                </div>

                <textarea
                  className="min-h-[80px] w-full rounded-xl border px-3 py-2"
                  placeholder="Reviewer Comment"
                  value={topic.reviewerComment || ""}
                  onChange={(e) =>
                    handleTopicChange(index, { reviewerComment: e.target.value })
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

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <textarea
              className="min-h-[110px] rounded-xl border px-3 py-2 text-sm"
              placeholder="Overall QA Summary"
              value={caseMaster.overallQaSummary || ""}
              onChange={(e) =>
                handleCaseMasterChange({ overallQaSummary: e.target.value })
              }
            />
            <textarea
              className="min-h-[110px] rounded-xl border px-3 py-2 text-sm"
              placeholder="Coaching Summary"
              value={caseMaster.coachingSummary || ""}
              onChange={(e) =>
                handleCaseMasterChange({ coachingSummary: e.target.value })
              }
            />
          </div>

          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={caseMaster.criticalErrorFlag}
                onChange={(e) =>
                  handleCaseMasterChange({ criticalErrorFlag: e.target.checked })
                }
              />
              Critical Error
            </label>

            {caseMaster.criticalErrorFlag ? (
              <div className="grid gap-3 lg:grid-cols-2">
                <input
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  placeholder="Critical Error Type"
                  value={caseMaster.criticalErrorType || ""}
                  onChange={(e) =>
                    handleCaseMasterChange({ criticalErrorType: e.target.value })
                  }
                />
                <input
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  placeholder="Critical Error Note"
                  value={caseMaster.criticalErrorNote || ""}
                  onChange={(e) =>
                    handleCaseMasterChange({ criticalErrorNote: e.target.value })
                  }
                />
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleExportJson}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Export JSON
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}