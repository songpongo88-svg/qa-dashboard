import { canonicalAgentIdentityKey } from "./agentIdentity";
import { isTestCaseEvaluation } from "./evaluationScope";

export const MONTHLY_KPI_CASE_TARGET = 10;
export const MONTHLY_KPI_SCORE_TARGET = 85;

export type MonthlyKpiCase = {
  agent: string;
  monthKey: string;
  caseId: string;
  finalScore: number;
  isTestCase?: boolean;
};

// Input is the Dashboard's authoritative, appeal-merged case list, already
// constrained by its existing authorization. Never fetch or merge appeals here.
export function selectMonthlyKpiCases<T extends MonthlyKpiCase>(
  cases: readonly T[], agent: string, monthKey: string
): T[] {
  const agentKey = canonicalAgentIdentityKey(agent);
  if (!agentKey || agent === "all" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) return [];
  const unique = new Map<string, T>();
  for (const item of cases) {
    if (isTestCaseEvaluation(item) || item.monthKey !== monthKey ||
      canonicalAgentIdentityKey(item.agent) !== agentKey ||
      !Number.isFinite(item.finalScore) || item.finalScore < 0 || item.finalScore > 100) continue;
    const caseKey = String(item.caseId || "").trim().toLowerCase();
    if (caseKey) unique.set(caseKey, item);
  }
  return [...unique.values()];
}

export function calculateMonthlyKpi(scores: readonly number[]) {
  const validScores = scores.filter((score) => Number.isFinite(score) && score >= 0 && score <= 100);
  const count = validScores.length;
  const total = validScores.reduce((sum, score) => sum + score, 0);
  const remaining = Math.max(0, MONTHLY_KPI_CASE_TARGET - count);
  const average = count ? total / count : null;
  const targetTotal = MONTHLY_KPI_CASE_TARGET * MONTHLY_KPI_SCORE_TARGET;
  const requiredAverage = remaining ? Math.max(0, (targetTotal - total) / remaining) : null;
  // Readiness and pass/fail use unrounded scores, never display-rounded values.
  const status = count < MONTHLY_KPI_CASE_TARGET ? "pending"
    : total >= count * MONTHLY_KPI_SCORE_TARGET ? "passed" : "not-passed";
  const state = !count ? "empty" : status !== "pending" ? status
    : requiredAverage! > 100 ? "unreachable" : total >= targetTotal ? "secured"
    : total >= count * MONTHLY_KPI_SCORE_TARGET ? "ahead" : "behind";
  return { count, total, remaining, average, targetTotal, requiredAverage, status, state,
    maxFinalAverage: remaining ? (total + remaining * 100) / MONTHLY_KPI_CASE_TARGET : average };
}

export type MonthlyKpiResult = ReturnType<typeof calculateMonthlyKpi>;

export function formatRequiredKpiScore(value: number) {
  // Round upwards: displaying 91.66 when 91.666... is required would understate the target.
  return (Math.ceil(value * 100) / 100).toFixed(2);
}

export function monthlyKpiSnapshot(cases: readonly MonthlyKpiCase[]) {
  // Stable across sorting; changes if any case/score changes, even at the same count/total.
  return JSON.stringify(cases.map((item) => [item.caseId.trim().toLowerCase(), item.finalScore])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

export function monthlyKpiNoticeKey(viewer: string, agent: string, monthKey: string) {
  return `qa-monthly-kpi-v1:${JSON.stringify([viewer.trim(), canonicalAgentIdentityKey(agent), monthKey])}`;
}

export function getMonthlyKpiMessage(result: MonthlyKpiResult) {
  const { count, remaining, average, requiredAverage, maxFinalAverage, state } = result;
  const required = formatRequiredKpiScore(requiredAverage || 0);
  const averageText = average === null ? "—" : average.toFixed(2);
  const remainingLabel = remaining === 1
    ? "อีก 1 เคส ต้องได้อย่างน้อย"
    : `อีก ${remaining} เคส ต้องได้เฉลี่ยอย่างน้อย`;
  const remainingText = "เพื่อให้ค่าเฉลี่ยรวมถึง KPI 85 เมื่อครบ 10 เคส";
  switch (state) {
    case "empty": return { tone: "violet", status: "ยังไม่มีคะแนนเดือนนี้", label: "เป้าหมายเมื่อครบ 10 เคส", value: "85.00", unit: "คะแนนเฉลี่ย", text: "เริ่มประเมินแล้ว ระบบจะแจ้งคะแนนที่ต้องได้ในเคสที่เหลือ" };
    case "ahead": return { tone: "emerald", status: "คะแนนถึงเกณฑ์ · รอครบ 10 เคส", label: remainingLabel, value: required, unit: "คะแนน / เคส", text: remainingText };
    case "secured": return { tone: "emerald", status: "คะแนนถึงเกณฑ์ · รอครบ 10 เคส", label: "เหลืออีก", value: String(remaining), unit: "เคส", text: "คะแนนสะสมถึงเป้าแล้ว ประเมินให้ครบ 10 เคสเพื่อสรุป KPI" };
    case "unreachable": return { tone: "rose", status: "คะแนนยังไม่ถึงเกณฑ์", label: `แม้ ${remaining} เคสที่เหลือได้ 100 คะแนน ค่าเฉลี่ยสูงสุด`, value: (maxFinalAverage || 0).toFixed(2), unit: "%", text: "ค่าเฉลี่ยสูงสุดยังต่ำกว่า KPI 85" };
    case "passed": return { tone: "emerald", status: "ผ่าน KPI", label: "คะแนนเฉลี่ย", value: averageText, unit: "/ 100", text: `ประเมินครบ ${count} เคส และคะแนนเฉลี่ยถึง KPI 85` };
    case "not-passed": return { tone: "rose", status: "ไม่ผ่าน KPI", label: "คะแนนเฉลี่ย", value: averageText, unit: "/ 100", text: `ประเมินครบ ${count} เคส แต่คะแนนเฉลี่ยต่ำกว่า KPI 85` };
    default: return { tone: "amber", status: "ยังไม่ถึงเกณฑ์ · รอครบ 10 เคส", label: remainingLabel, value: required, unit: "คะแนน / เคส", text: remainingText };
  }
}
