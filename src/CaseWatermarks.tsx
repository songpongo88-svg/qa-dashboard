import { isTestCaseEvaluation } from "./lib/evaluationScope";

type WatermarkCase = {
  isTestCase?: boolean;
  hasAppealHistory?: boolean;
  appealStatus?: string;
  appealRequestId?: string;
  appealAdditionalActive?: { expiresAt: string; submitted: boolean } | null;
  reviewStatus?: string;
};

export function getCaseWatermarkLabels(item: WatermarkCase): string[] {
  const labels: string[] = [];
  if (isTestCaseEvaluation(item)) labels.push("TEST");
  if (item.appealAdditionalActive) labels.push("ADDITIONAL APPEAL");
  else if (item.hasAppealHistory || item.appealRequestId || item.reviewStatus === "Revised" ||
    /^(Pending|Approved|Rejected|Reset)$/i.test(item.appealStatus || "")) labels.push("APPEAL");
  return labels;
}

export default function CaseWatermarks({ item }: { item: WatermarkCase }) {
  const labels = getCaseWatermarkLabels(item);
  if (!labels.length) return null;
  return (
    <div className="qa-case-watermarks" data-count={labels.length} role="img"
      aria-label={labels.map((label) => label === "TEST" ? "เคสทดสอบ ไม่นับในผลประเมินจริง" : label === "ADDITIONAL APPEAL" ? "อยู่ระหว่างอุทธรณ์เพิ่มเติม" : "เคสนี้เคยยื่นอุทธรณ์").join(" · ")}>
      {labels.map((label) => (
        <span key={label} aria-hidden="true" className={`qa-case-watermark qa-case-watermark--${label.toLowerCase().replace(/\s+/g, "-")}`}>{label}</span>
      ))}
    </div>
  );
}
