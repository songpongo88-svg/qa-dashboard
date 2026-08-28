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
  switch (state) {
    case "empty": return { tone: "violet", status: "ยังไม่มีผลประเมิน", label: "เป้าหมายคะแนนเฉลี่ยทั้ง 10 เคส", value: "85.00", unit: "คะแนน / เคส", text: "ต้องสะสมอย่างน้อย 850 คะแนนจาก 10 เคส ระบบจะคำนวณเป้าคะแนนที่เหลือเมื่อมีผลประเมิน" };
    case "ahead": return { tone: "emerald", status: "ขณะนี้ถึงเกณฑ์ · ยังไม่ครบโควต้า", label: `รักษาคะแนนอีก ${remaining} เคส ให้ได้เฉลี่ยอย่างน้อย`, value: required, unit: "คะแนน / เคส", text: "คะแนนตอนนี้ถึงเกณฑ์ 85% แล้ว แต่ยังต้องรักษาค่าเฉลี่ยของเคสที่เหลือ ผล KPI เดือนนี้ยังไม่สรุปจนกว่าจะครบ 10 เคส" };
    case "secured": return { tone: "emerald", status: "คะแนนสะสมถึงเป้าแล้ว · รอครบโควต้า", label: "เหลือประเมินให้ครบโควต้าอีก", value: String(remaining), unit: "เคส", text: "คะแนนสะสมถึงขั้นต่ำ 850 คะแนนแล้ว รอครบ 10 เคสเพื่อสรุปผล หากคะแนนเดิมเปลี่ยน ระบบจะคำนวณใหม่" };
    case "unreachable": return { tone: "rose", status: "เคสที่เหลือไม่เพียงพอให้ถึงเป้า", label: `แม้อีก ${remaining} เคสได้เต็ม 100 ค่าเฉลี่ยสูงสุดคือ`, value: (maxFinalAverage || 0).toFixed(2), unit: "%", text: `ต้องได้เฉลี่ย ${required} คะแนน/เคส ซึ่งเกินคะแนนเต็ม 100 จึงไม่ถึงเป้าภายในโควต้า 10 เคส ให้ยึดผลประเมินจริงโดยไม่เพิ่มเคสเพื่อให้ถึงเป้า` };
    case "passed": return { tone: "emerald", status: "ผ่าน KPI เดือนนี้", label: `ประเมินแล้ว ${count} เคส · คะแนนเฉลี่ย`, value: averageText, unit: "%", text: "คะแนนเฉลี่ยถึงเกณฑ์ 85% และประเมินครบโควต้าประจำเดือนแล้ว" };
    case "not-passed": return { tone: "rose", status: "ไม่ผ่าน KPI เดือนนี้", label: `ประเมินแล้ว ${count} เคส · คะแนนเฉลี่ย`, value: averageText, unit: "%", text: "คะแนนเฉลี่ยยังต่ำกว่า 85% หลังประเมินครบโควต้าประจำเดือน" };
    default: return { tone: "amber", status: "กำลังประเมิน · ยังไม่สรุป KPI", label: `อีก ${remaining} เคส ต้องได้เฉลี่ยอย่างน้อย`, value: required, unit: "คะแนน / เคส", text: "เพื่อให้คะแนนเฉลี่ยเมื่อครบ 10 เคสถึง 85% นี่คือเป้าคะแนนของเคสที่เหลือ ไม่ใช่ผล KPI สรุปประจำเดือน" };
  }
}
