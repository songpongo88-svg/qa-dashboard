import type { RubricTopic, RubricVersionDefinition } from "../rubricVersions";

export type DeductionTag = {
  subtopic: string;
  points: number;
};

export type DraftDeductionTag = {
  subtopic: string;
  points: number | null;
};

export function deductionOptions(topic: RubricTopic): string[] {
  return topic.focusItems?.length ? topic.focusItems : [topic.title];
}

export function deductionTotal(items: DraftDeductionTag[] = []): number {
  return items.reduce((total, item) => total + (Number.isFinite(item.points) ? Number(item.points) : 0), 0);
}

export function deductionError(topic: RubricTopic, score: number | null, items: DraftDeductionTag[] = []): string {
  if (score === null) return "";
  const expected = topic.max - score;
  if (!items.length) return expected > 0 ? `กรุณาระบุจุดที่หักให้ครบ ${expected} คะแนน` : "";

  const allowed = new Set(deductionOptions(topic));
  const selected = new Set<string>();
  for (const item of items) {
    if (!allowed.has(item.subtopic)) return "กรุณาเลือกหัวข้อย่อยของจุดที่หัก";
    if (selected.has(item.subtopic)) return "หัวข้อย่อยนี้ถูกเลือกซ้ำ กรุณารวมคะแนนไว้ในรายการเดียว";
    selected.add(item.subtopic);
    if (item.points === null || !Number.isInteger(item.points) || item.points <= 0 || item.points > topic.max) {
      return "คะแนนที่หักต้องเป็นจำนวนเต็มมากกว่า 0";
    }
  }
  const actual = deductionTotal(items);
  return actual === expected ? "" : `คะแนนที่หักรวม ${actual} คะแนน แต่คะแนนหัวข้อนี้ถูกหัก ${expected} คะแนน`;
}

export function subtopicDeductionStatuses(topic: RubricTopic, score: number | null, items: DraftDeductionTag[] = []) {
  const complete = score !== null && Number.isFinite(score) && score >= 0 && score <= topic.max
    && !deductionError(topic, score, items);
  return deductionOptions(topic).map((subtopic) => {
    const deducted = items.find((item) => item.subtopic === subtopic && Number.isFinite(item.points) && Number(item.points) > 0);
    return {
      subtopic,
      points: deducted ? Number(deducted.points) : 0,
      status: deducted ? "deducted" as const : complete ? "not_deducted" as const : "unknown" as const,
    };
  });
}

type AnalyzedCase = {
  caseId: string;
  agentName: string;
  auditDate: string;
  qaScheme: string;
  evaluationType?: string;
  topics: Array<{ code: string; title: string; score?: number; max?: number; deductions?: DeductionTag[] }>;
};

export function buildDeductionAnalysis(records: AnalyzedCase[], rubrics: RubricVersionDefinition[]) {
  const cases = records.filter((record) => record.evaluationType !== "no_case_month" && record.caseId);
  const statusRows = cases.flatMap((record, caseIndex) => record.topics.flatMap((topic) => {
    const rubricTopic = rubrics.find((rubric) => rubric.code === record.qaScheme)?.topics.find((item) => item.code === topic.code);
    if (!rubricTopic) return [];
    return subtopicDeductionStatuses(rubricTopic, topic.score ?? null, topic.deductions).map((item) => ({
      caseIndex,
      "Case Date": record.auditDate,
      "Case ID": record.caseId,
      "Agent Name": record.agentName,
      "QA Scheme": record.qaScheme,
      "Topic Code": topic.code,
      "Topic": topic.title,
      "Deduction Subtopic": item.subtopic,
      "Deduction Status": item.status === "deducted" ? "Deducted" : item.status === "not_deducted" ? "Not Deducted" : "Unknown",
      "Deducted Points": item.points,
    }));
  }));
  const statusDetailRows = statusRows.map(({ caseIndex: _caseIndex, ...row }) => ({ ...row }));
  const details = cases.flatMap((record, caseIndex) => record.topics.flatMap((topic) =>
    (topic.deductions || []).filter((item) => item.subtopic && item.points > 0).map((item) => ({
      caseIndex,
      "Case Date": record.auditDate,
      "Case ID": record.caseId,
      "Agent Name": record.agentName,
      "QA Scheme": record.qaScheme,
      "Topic Code": topic.code,
      "Topic": topic.title,
      "Deduction Subtopic": item.subtopic,
      "Deducted Points": item.points,
    }))
  ));
  const taggedPoints = details.reduce((sum, row) => sum + row["Deducted Points"], 0);
  const detailRows = details.map(({ caseIndex: _caseIndex, ...row }) => ({ ...row }));

  const groups = new Map<string, { scheme: string; code: string; title: string; subtopic: string; points: number; cases: Set<number> }>();
  for (const row of details) {
    const key = JSON.stringify([row["QA Scheme"], row["Topic Code"], row["Deduction Subtopic"]]);
    const group = groups.get(key) || {
      scheme: row["QA Scheme"], code: row["Topic Code"], title: row["Topic"],
      subtopic: row["Deduction Subtopic"], points: 0, cases: new Set<number>(),
    };
    group.points += row["Deducted Points"];
    group.cases.add(row.caseIndex);
    groups.set(key, group);
  }
  const summaryRows = [...groups.values()].map((group) => {
    const evaluatedCases = cases.filter((record) => record.qaScheme === group.scheme && record.topics.some((topic) => topic.code === group.code)).length;
    const eligibleCases = statusRows.filter((row) => row["QA Scheme"] === group.scheme && row["Topic Code"] === group.code
      && row["Deduction Subtopic"] === group.subtopic && row["Deduction Status"] !== "Unknown").length;
    return {
      "QA Scheme": group.scheme,
      "Topic Code": group.code,
      "Topic": group.title,
      "Deduction Subtopic": group.subtopic,
      "Deducted Points": group.points,
      "Share of Tagged Deducted Points (%)": taggedPoints ? Math.round(group.points / taggedPoints * 10000) / 100 : 0,
      "Affected Cases": group.cases.size,
      "Evaluated Cases": evaluatedCases,
      "Known Status Cases": eligibleCases,
      "Not Deducted Cases": eligibleCases - group.cases.size,
      "Cases With This Deduction (%)": eligibleCases ? Math.round(group.cases.size / eligibleCases * 10000) / 100 : 0,
    };
  }).sort((left, right) => right["Deducted Points"] - left["Deducted Points"]);
  return { detailRows, statusRows: statusDetailRows, summaryRows };
}
