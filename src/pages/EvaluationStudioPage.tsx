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

type UploadItem = {
  id: string;
  name: string;
  type: string;
  size: number;
  previewUrl?: string;
  extractedText?: string;
};

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

function getTopicResult(
  topicResults: EvaluationTopicResult[],
  topicCode: string
): EvaluationTopicResult | undefined {
  return topicResults.find((topic) => topic.topicCode === topicCode);
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function containsAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function pickFirstEvidence(
  originalText: string,
  keywords: string[],
  fallback: string
) {
  const lines = originalText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const matched = lines.find((line) =>
    keywords.some((keyword) => line.toLowerCase().includes(keyword))
  );

  return matched || fallback;
}

function buildImprovementGuidance(
  topicCode: string,
  deductionLevel: EvaluationTopicResult["deductionLevel"]
) {
  if (deductionLevel === "None") {
    return "รักษามาตรฐานการปฏิบัติงานในหัวข้อนี้อย่างต่อเนื่อง";
  }

  const map: Record<string, string> = {
    "1.1": "เพิ่มความครบถ้วนของ greeting, การแนะนำตัว และ closing ตามมาตรฐานองค์กร",
    "1.2": "ตรวจสอบการยืนยันตัวตนและขอบเขตการให้ข้อมูลให้รัดกุมก่อนดำเนินการ",
    "1.3": "ทบทวน flow การทำงานและ SLA เพื่อให้การดำเนินการครบทุกขั้นตอน",
    "2.1": "ตรวจสอบความถูกต้องของข้อมูลกับบริบทเคสก่อนตอบกลับทุกครั้ง",
    "2.2": "ตอบให้ครอบคลุมทุกประเด็นสำคัญและคำถามย่อยของผู้ติดต่อ",
    "2.3": "อธิบายขั้นตอนเป็นลำดับและระบุสิ่งที่ผู้รับบริการต้องทำต่อให้ชัดเจน",
    "3.1": "วิเคราะห์สาเหตุให้ตรงจุดและเลือกแนวทางแก้ไขที่สอดคล้องกับปัญหาหลัก",
    "3.2": "เพิ่มความชัดเจนของ next step, ผู้รับผิดชอบ, timeline และการติดตามผล",
    "4.1": "จัดลำดับข้อความให้สั้น อ่านง่าย และแยกประเด็นสำคัญให้ชัดเจน",
    "4.2": "ปรับถ้อยคำให้สุภาพ ชัดเจน ไม่วกวน และเหมาะกับบริบทงานบริการ",
    "4.3": "รักษาโทนการสื่อสารให้นุ่มนวล เหมาะสม และไม่ทำให้ผู้รับบริการรู้สึกไม่ดี",
  };

  return map[topicCode] || "ปรับปรุงการสื่อสารและการดำเนินการให้สอดคล้องกับมาตรฐาน";
}

function runHeuristicAutoEvaluation(
  sourceText: string,
  currentTopics: EvaluationTopicResult[],
  hasOutboundCall: boolean
): EvaluationTopicResult[] {
  const normalized = normalizeText(sourceText);

  if (!normalized) {
    return currentTopics.map((topic) => {
      const level: EvaluationTopicResult["deductionLevel"] = "Moderate";
      const band = getDeductionBand(topic.topicCode, level);
      return {
        ...topic,
        deductionLevel: level,
        suggestedScoreMin: band?.min,
        suggestedScoreMax: band?.max,
        reviewerFinalScore:
          getSuggestedScoreFromLevel(topic.topicCode, level) ?? topic.reviewerFinalScore,
        reasonFormalTh: getReasonTemplate(topic.topicCode, level),
        evidenceQuote: "ยังไม่มีข้อมูลข้อความเพียงพอสำหรับการวิเคราะห์อัตโนมัติ",
        improvementGuidance: buildImprovementGuidance(topic.topicCode, level),
      };
    });
  }

  return currentTopics.map((topic) => {
    let level: EvaluationTopicResult["deductionLevel"] = "Minor";
    let evidence = "ระบบประเมินจากข้อความที่ได้รับโดยรวม";
    let languageQualityCheck = topic.languageQualityCheck;
    let chatToneCheck = topic.chatToneCheck;
    let voiceToneCheck = topic.voiceToneCheck;

    switch (topic.topicCode) {
      case "1.1": {
        const hasGreeting = containsAny(normalized, ["สวัสดี", "เรียน", "hello", "hi"]);
        const hasClosing = containsAny(normalized, ["ขอบคุณ", "thank you", "หากต้องการความช่วยเหลือเพิ่มเติม"]);
        if (hasGreeting && hasClosing) level = "None";
        else if (hasGreeting || hasClosing) level = "Minor";
        else level = "Moderate";
        evidence = pickFirstEvidence(
          sourceText,
          ["สวัสดี", "ขอบคุณ", "thank"],
          "ไม่พบ greeting/closing ที่เด่นชัดจากข้อความ"
        );
        break;
      }
      case "1.2": {
        const hasVerify = containsAny(normalized, [
          "ยืนยันตัวตน",
          "รบกวนขอ",
          "เพื่อความปลอดภัย",
          "ตรวจสอบข้อมูล",
        ]);
        const riskyDisclosure = containsAny(normalized, [
          "เลขบัตร",
          "ข้อมูลบุคคลอื่น",
          "เปิดเผยข้อมูล",
        ]);
        if (riskyDisclosure) level = "Severe";
        else if (hasVerify) level = "None";
        else level = "Moderate";
        evidence = pickFirstEvidence(
          sourceText,
          ["ยืนยันตัวตน", "รบกวนขอ", "เพื่อความปลอดภัย"],
          "ไม่พบข้อความยืนยันตัวตนที่ชัดเจน"
        );
        break;
      }
      case "1.3": {
        const hasProcessWords = containsAny(normalized, [
          "ตรวจสอบ",
          "ประสาน",
          "อัปเดต",
          "สถานะ",
          "ติดตาม",
        ]);
        const hasTimeline = containsAny(normalized, ["ภายใน", "นาที", "ชั่วโมง", "วัน"]);
        if (hasProcessWords && hasTimeline) level = "None";
        else if (hasProcessWords) level = "Minor";
        else level = "Moderate";
        evidence = pickFirstEvidence(
          sourceText,
          ["ตรวจสอบ", "ประสาน", "ติดตาม", "สถานะ"],
          "ไม่พบข้อความที่สะท้อน process หรือ SLA ชัดเจน"
        );
        break;
      }
      case "2.1": {
        const uncertainWords = containsAny(normalized, ["น่าจะ", "ประมาณ", "อาจจะ", "เดา"]);
        const specificAction = containsAny(normalized, [
          "ตรวจสอบแล้ว",
          "จากข้อมูล",
          "พบว่า",
          "สถานะ",
        ]);
        if (uncertainWords) level = "Moderate";
        else if (specificAction) level = "None";
        else level = "Minor";
        evidence = pickFirstEvidence(
          sourceText,
          ["ตรวจสอบแล้ว", "พบว่า", "น่าจะ", "ประมาณ"],
          "ประเมินจากลักษณะการให้ข้อมูลโดยรวม"
        );
        break;
      }
      case "2.2": {
        const hasMultiPartAnswer = containsAny(normalized, [
          "1.",
          "2.",
          "ขั้นตอน",
          "รวมถึง",
          "เพิ่มเติม",
        ]);
        const veryShort = normalized.length < 80;
        if (hasMultiPartAnswer) level = "None";
        else if (veryShort) level = "Moderate";
        else level = "Minor";
        evidence = pickFirstEvidence(
          sourceText,
          ["ขั้นตอน", "เพิ่มเติม", "รวมถึง"],
          "ประเมินจากความครบถ้วนของข้อความโดยรวม"
        );
        break;
      }
      case "2.3": {
        const hasStepWords = containsAny(normalized, [
          "ขั้นตอน",
          "ลำดับ",
          "จากนั้น",
          "กรุณา",
          "ดำเนินการ",
        ]);
        if (hasStepWords) level = "None";
        else level = "Moderate";
        evidence = pickFirstEvidence(
          sourceText,
          ["ขั้นตอน", "กรุณา", "ดำเนินการ", "จากนั้น"],
          "ไม่พบการอธิบายขั้นตอนที่ชัดเจน"
        );
        break;
      }
      case "3.1": {
        const hasRootCause = containsAny(normalized, [
          "สาเหตุ",
          "เนื่องจาก",
          "เกิดจาก",
          "ตรวจสอบพบว่า",
        ]);
        const hasResolution = containsAny(normalized, [
          "แก้ไข",
          "ดำเนินการ",
          "ประสาน",
          "แนวทาง",
        ]);
        if (hasRootCause && hasResolution) level = "None";
        else if (hasResolution) level = "Minor";
        else level = "Moderate";
        evidence = pickFirstEvidence(
          sourceText,
          ["สาเหตุ", "เนื่องจาก", "เกิดจาก", "ตรวจสอบพบว่า"],
          "ไม่พบการวิเคราะห์สาเหตุที่เด่นชัด"
        );
        break;
      }
      case "3.2": {
        const hasNextStep = containsAny(normalized, [
          "จะแจ้ง",
          "จะประสาน",
          "ภายใน",
          "อัปเดต",
          "ติดตาม",
        ]);
        const hasOwnerOrTimeline = containsAny(normalized, [
          "ทีมที่เกี่ยวข้อง",
          "ภายใน",
          "นาที",
          "ชั่วโมง",
          "วัน",
        ]);
        if (hasNextStep && hasOwnerOrTimeline) level = "None";
        else if (hasNextStep) level = "Minor";
        else level = "Moderate";
        evidence = pickFirstEvidence(
          sourceText,
          ["จะประสาน", "จะแจ้ง", "อัปเดต", "ติดตาม"],
          "ไม่พบ next step ที่ชัดเจน"
        );
        break;
      }
      case "4.1": {
        const hasBreaks = sourceText.includes("\n");
        const longDense = sourceText.length > 400 && !hasBreaks;
        if (longDense) level = "Moderate";
        else if (hasBreaks) level = "None";
        else level = "Minor";
        evidence = hasBreaks
          ? "ข้อความมีการแบ่งบรรทัดและจัดลำดับอ่านได้"
          : "ข้อความเป็นย่อหน้าเดียวหรือมีการจัดโครงสร้างจำกัด";
        break;
      }
      case "4.2": {
        const poorLanguage = containsAny(normalized, ["!!!", "???", "นะคะะ", "ค้าบบบ"]);
        const politeWords = containsAny(normalized, ["รบกวน", "ขอบคุณ", "กรุณา", "ค่ะ", "ครับ"]);
        if (poorLanguage) {
          level = "Moderate";
          languageQualityCheck = "Fair";
        } else if (politeWords) {
          level = "None";
          languageQualityCheck = "Good";
        } else {
          level = "Minor";
          languageQualityCheck = "Fair";
        }
        evidence = pickFirstEvidence(
          sourceText,
          ["รบกวน", "ขอบคุณ", "กรุณา"],
          "ประเมินจากการใช้ถ้อยคำในข้อความโดยรวม"
        );
        break;
      }
      case "4.3": {
        const harshWords = containsAny(normalized, ["ไม่ได้", "ต้อง", "แจ้งแล้ว", "อ่านก่อน"]);
        const softWords = containsAny(normalized, ["รบกวน", "ขออภัย", "ขอบคุณ", "ยินดี"]);
        if (harshWords && !softWords) {
          level = "Moderate";
          chatToneCheck = "Fair";
        } else if (softWords) {
          level = "None";
          chatToneCheck = "Good";
        } else {
          level = "Minor";
          chatToneCheck = "Fair";
        }

        if (hasOutboundCall) {
          voiceToneCheck = "N/A";
        }

        evidence = pickFirstEvidence(
          sourceText,
          ["ขออภัย", "รบกวน", "ยินดี", "ไม่ได้", "ต้อง"],
          "ประเมินจาก tone ของข้อความโดยรวม"
        );
        break;
      }
      default:
        level = "Minor";
    }

    const band = getDeductionBand(topic.topicCode, level);

    return {
      ...topic,
      deductionLevel: level,
      suggestedScoreMin: band?.min,
      suggestedScoreMax: band?.max,
      reviewerFinalScore:
        getSuggestedScoreFromLevel(topic.topicCode, level) ?? topic.reviewerFinalScore,
      reasonFormalTh: getReasonTemplate(topic.topicCode, level),
      evidenceQuote: evidence,
      improvementGuidance: buildImprovementGuidance(topic.topicCode, level),
      languageQualityCheck,
      chatToneCheck,
      voiceToneCheck,
    };
  });
}

async function readFileAsText(file: File): Promise<string> {
  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsText(file);
  });
}

export default function EvaluationStudioPage() {
  const [caseMaster, setCaseMaster] = useState<CaseMaster>(DEFAULT_CASE);
  const [transcriptText, setTranscriptText] = useState("");
  const [topicResults, setTopicResults] = useState<EvaluationTopicResult[]>(
    buildDefaultTopicResults()
  );
  const [validationMessage, setValidationMessage] = useState("");
  const [warningMessage, setWarningMessage] = useState("");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [autoEvalNote, setAutoEvalNote] = useState("");

  const combinedAnalysisText = useMemo(() => {
    const fileText = uploads
      .map((item) => item.extractedText || "")
      .filter(Boolean)
      .join("\n");
    return [transcriptText, fileText].filter(Boolean).join("\n");
  }, [transcriptText, uploads]);

  const totalScore = useMemo(() => {
    return topicResults.reduce((sum, topic) => sum + topic.reviewerFinalScore, 0);
  }, [topicResults]);

  const gradeIncentive = useMemo(() => {
    return calculateApril2026Incentive(totalScore);
  }, [totalScore]);

  async function handleFilesSelected(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const nextItems: UploadItem[] = [];

    for (const file of files) {
      const isImage = file.type.startsWith("image/");
      const isTextLike =
        file.type.startsWith("text/") ||
        file.name.match(/\.(txt|csv|json|md|log)$/i);

      let extractedText = "";
      let previewUrl: string | undefined;

      if (isTextLike) {
        extractedText = await readFileAsText(file);
      }

      if (isImage) {
        previewUrl = URL.createObjectURL(file);
      }

      nextItems.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        name: file.name,
        type: file.type || "unknown",
        size: file.size,
        extractedText,
        previewUrl,
      });
    }

    setUploads((prev) => [...prev, ...nextItems]);
    setAutoEvalNote(
      "ไฟล์ข้อความจะถูกนำมารวมในการวิเคราะห์อัตโนมัติ ส่วนรูปภาพ/ไฟล์อื่นจะถูกแนบไว้เป็นหลักฐานประกอบ"
    );

    if (files.some((file) => file.type.startsWith("image/"))) {
      handleCaseMasterChange({ sourceType: "mixed" });
    }

    e.target.value = "";
  }

  function removeUpload(id: string) {
    setUploads((prev) => {
      const item = prev.find((upload) => upload.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((upload) => upload.id !== id);
    });
  }

  function handleGenerateSummary() {
    const trimmed = combinedAnalysisText.trim();

    const fallbackSummary = trimmed
      ? `สรุปอัตโนมัติเบื้องต้นจากข้อมูลเคส: ${trimmed.slice(0, 220)}${
          trimmed.length > 220 ? "..." : ""
        }`
      : "ยังไม่มีข้อมูลเพียงพอสำหรับสรุปเคส";

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

  function handleRunAutoEvaluation() {
    const evaluated = runHeuristicAutoEvaluation(
      combinedAnalysisText,
      topicResults,
      caseMaster.hasOutboundCall
    );
    setTopicResults(evaluated);

    const lowestTopics = [...evaluated]
      .sort((a, b) => a.reviewerFinalScore - b.reviewerFinalScore)
      .slice(0, 3)
      .map((item) => `${item.topicCode} ${item.topicLabel}`);

    setCaseMaster((prev) => ({
      ...prev,
      overallQaSummary:
        prev.overallQaSummary ||
        `ระบบประเมินอัตโนมัติเบื้องต้นเรียบร้อยแล้ว โดยควรตรวจทานหัวข้อที่มีคะแนนต่ำเป็นพิเศษ ได้แก่ ${lowestTopics.join(
          ", "
        )}`,
      coachingSummary:
        prev.coachingSummary ||
        `แนะนำให้โฟกัสการโค้ชชิ่งในหัวข้อ ${lowestTopics.join(
          ", "
        )} ก่อนเป็นลำดับแรก`,
    }));

    setAutoEvalNote(
      "Auto Evaluation รอบนี้เป็นการประเมินเบื้องต้นจากข้อความและไฟล์ข้อความที่แนบไว้ คุณยังสามารถปรับคะแนนและเหตุผลภายหลังได้"
    );
  }

  function handleCaseMasterChange(patch: Partial<CaseMaster>) {
    setCaseMaster((prev) => ({ ...prev, ...patch }));
    setValidationMessage("");
    setWarningMessage("");
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

    setValidationMessage("");
    setWarningMessage("");
  }

  function validateBeforeExport(): boolean {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!caseMaster.caseId.trim()) {
      errors.push("กรุณาระบุ Case ID");
    }

    if (!caseMaster.agentName.trim()) {
      errors.push("กรุณาระบุ Agent Name");
    }

    if (!caseMaster.auditDate.trim()) {
      errors.push("กรุณาระบุ Audit Date");
    }

    if (
      caseMaster.criticalErrorFlag &&
      !caseMaster.criticalErrorType?.trim() &&
      !caseMaster.criticalErrorNote?.trim()
    ) {
      errors.push("หากติ๊ก Critical Error กรุณาระบุ Type หรือ Note อย่างน้อย 1 ช่อง");
    }

    if (caseMaster.hasOutboundCall && !caseMaster.voiceFileUploaded) {
      warnings.push(
        "เคสนี้ระบุว่ามี Outbound Call แต่ยังไม่ได้ติ๊ก Voice File Uploaded"
      );
    }

    setValidationMessage(errors.join(" | "));
    setWarningMessage(warnings.join(" | "));

    return errors.length === 0;
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
      uploads: uploads.map((item) => ({
        name: item.name,
        type: item.type,
        size: item.size,
        hasExtractedText: Boolean(item.extractedText),
      })),
      exportedAt: new Date().toISOString(),
    };
  }

  function handleExportJson() {
    if (!validateBeforeExport()) return;

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
    if (!validateBeforeExport()) return;

    const t11 = getTopicResult(topicResults, "1.1");
    const t12 = getTopicResult(topicResults, "1.2");
    const t13 = getTopicResult(topicResults, "1.3");
    const t21 = getTopicResult(topicResults, "2.1");
    const t22 = getTopicResult(topicResults, "2.2");
    const t23 = getTopicResult(topicResults, "2.3");
    const t31 = getTopicResult(topicResults, "3.1");
    const t32 = getTopicResult(topicResults, "3.2");
    const t41 = getTopicResult(topicResults, "4.1");
    const t42 = getTopicResult(topicResults, "4.2");
    const t43 = getTopicResult(topicResults, "4.3");

    const row = {
      "Audit Date": caseMaster.auditDate,
      Month: caseMaster.monthLabel,
      Week: caseMaster.weekLabel || "",
      "Agent Name": caseMaster.agentName,
      "Case ID": caseMaster.caseId,
      "Rubric Version": caseMaster.rubricVersion,
      "Review Status": caseMaster.reviewStatus,
      "Case Summary": caseMaster.caseSummary,
      "Customer Intent": caseMaster.customerIntent || "",
      "Agent Action Summary": caseMaster.agentActionSummary || "",
      "Resolution Status": caseMaster.resolutionStatus || "",
      "Potential Risk": caseMaster.potentialRisk || "",
      "Has Outbound Call": caseMaster.hasOutboundCall,
      "Voice File Uploaded": caseMaster.voiceFileUploaded,
      "Final Score": gradeIncentive.finalScore,
      Grade: gradeIncentive.finalGrade,
      "Incentive Total": gradeIncentive.incentiveTotal,
      "Incentive Cash": gradeIncentive.incentiveCash,
      "Incentive RBH Code": gradeIncentive.incentiveRbhCode,
      "Critical Error Flag": caseMaster.criticalErrorFlag,
      "Critical Error Type": caseMaster.criticalErrorType || "",
      "Critical Error Note": caseMaster.criticalErrorNote || "",
      "1.1 Score": t11?.reviewerFinalScore ?? "",
      "1.2 Score": t12?.reviewerFinalScore ?? "",
      "1.3 Score": t13?.reviewerFinalScore ?? "",
      "2.1 Score": t21?.reviewerFinalScore ?? "",
      "2.2 Score": t22?.reviewerFinalScore ?? "",
      "2.3 Score": t23?.reviewerFinalScore ?? "",
      "3.1 Score": t31?.reviewerFinalScore ?? "",
      "3.2 Score": t32?.reviewerFinalScore ?? "",
      "4.1 Score": t41?.reviewerFinalScore ?? "",
      "4.2 Score": t42?.reviewerFinalScore ?? "",
      "4.3 Score": t43?.reviewerFinalScore ?? "",
      "Language Quality Check": t42?.languageQualityCheck ?? "",
      "Chat Tone Check": t43?.chatToneCheck ?? "",
      "Voice Tone Check": t43?.voiceToneCheck ?? "",
      "Overall QA Summary": caseMaster.overallQaSummary || "",
      "Coaching Summary": caseMaster.coachingSummary || "",
      "Upload Count": uploads.length,
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
            Auto Evaluation + Reviewer Edit สำหรับประเมิน QA เดือนเมษายน 2569
          </p>
        </div>

        {(validationMessage || warningMessage || autoEvalNote) && (
          <div className="space-y-3">
            {validationMessage ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {validationMessage}
              </div>
            ) : null}

            {warningMessage ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
                {warningMessage}
              </div>
            ) : null}

            {autoEvalNote ? (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-700">
                {autoEvalNote}
              </div>
            ) : null}
          </div>
        )}

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

            <div className="space-y-3 rounded-2xl border border-dashed p-4">
              <div className="text-sm font-semibold text-slate-800">
                Upload Images / Files
              </div>
              <input
                type="file"
                multiple
                onChange={handleFilesSelected}
                className="w-full rounded-xl border px-3 py-2 text-sm"
                accept=".txt,.csv,.json,.md,.log,image/*,.pdf"
              />
              <div className="text-xs text-slate-500">
                ไฟล์ข้อความจะถูกนำมารวมในการวิเคราะห์อัตโนมัติ ส่วนรูปภาพ/PDF จะถูกแนบไว้เป็นหลักฐานประกอบในหน้า
              </div>

              {uploads.length > 0 ? (
                <div className="space-y-3">
                  {uploads.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border p-3 text-sm text-slate-700"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-slate-500">
                            {item.type || "unknown"} · {Math.round(item.size / 1024)} KB
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeUpload(item.id)}
                          className="rounded-lg bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700"
                        >
                          Remove
                        </button>
                      </div>

                      {item.previewUrl ? (
                        <img
                          src={item.previewUrl}
                          alt={item.name}
                          className="mt-3 max-h-56 rounded-xl border object-contain"
                        />
                      ) : null}

                      {item.extractedText ? (
                        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                          {item.extractedText.slice(0, 400)}
                          {item.extractedText.length > 400 ? "..." : ""}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-xl bg-violet-600 px-4 py-2 text-white hover:bg-violet-700"
                onClick={handleGenerateSummary}
              >
                Generate Case Summary
              </button>

              <button
                className="rounded-xl bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
                onClick={handleRunAutoEvaluation}
              >
                Run Auto Evaluation
              </button>
            </div>
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