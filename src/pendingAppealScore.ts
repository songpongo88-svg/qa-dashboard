import { canonicalAgentIdentityKey } from "./lib/agentIdentity";
import { isAppealAwaitingReview } from "./appealWorkflow";

export type AppealScoreState = {
  pendingAppealCaseCount?: number;
  appealScoreUnverified?: boolean;
  appealScoreMonthKey?: string;
};

type AppealRequestState = {
  agent: string;
  caseId: string;
  status: string;
  editingDraft?: boolean;
  additionalRound?: { submitted: boolean } | null;
  auditDate?: string;
  submittedAt?: string;
  reviewedAt?: string;
};

export type AppealScoreHold = { label: string; message: string; pendingCount: number };

function caseIds(value: string) {
  const text = String(value || "");
  const matches = text.match(/[A-Za-z]{1,6}\d{3,}/g) || [];
  return [...new Set((matches.length ? matches : text.split(/[,;|\n]+/))
    .map(id => id.replace(/\s+/g, "").toUpperCase()).filter(Boolean))];
}

type DatedCase = { agent: string; caseId: string; isTestCase?: boolean;
  monthKey?: string; auditDateObj?: Date | null; auditDate?: string; caseDate?: string };

function auditMonth(value?: string | Date | null): string {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" :
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})(?:$|[-T\s])/);
  const display = text.match(/^\d{1,2}[/.\-](\d{1,2})[/.\-](\d{4})(?:$|\s)/);
  const year = Number(iso?.[1] || display?.[2]);
  const month = Number(iso?.[2] || display?.[1]);
  if (!year || month < 1 || month > 12) return "";
  return `${year >= 2400 ? year - 543 : year}-${String(month).padStart(2, "0")}`;
}

function caseMonth(item: DatedCase) {
  return auditMonth(item.monthKey) || auditMonth(item.auditDateObj) ||
    auditMonth(item.auditDate) || auditMonth(item.caseDate);
}

// Keep numeric data intact and propagate holds across every week/search result
// in the affected audit month only. Submission/review dates never select a month.
export function withAppealScoreState<T extends DatedCase & AppealScoreState>(
  cases: readonly T[], requests: readonly AppealRequestState[] | null
): Array<T & AppealScoreState> {
  if (requests === null) return cases.map(item => ({ ...item, appealScoreUnverified: !item.isTestCase }));
  const sourceMonths = new Map<string, Set<string>>();
  for (const item of cases) for (const id of caseIds(item.caseId)) {
    const key = `${canonicalAgentIdentityKey(item.agent)}|${id}`;
    const months = sourceMonths.get(key) || new Set<string>();
    if (caseMonth(item)) months.add(caseMonth(item));
    sourceMonths.set(key, months);
  }
  const latest = new Map<string, { request: AppealRequestState; time: number; month: string }>();
  const requestMonths = new Map<string, Set<string>>();
  for (const request of requests) {
    const agent = canonicalAgentIdentityKey(request.agent);
    if (!agent) continue;
    const time = Date.parse(request.submittedAt || request.reviewedAt || "") || 0;
    for (const id of caseIds(request.caseId)) {
      const key = `${agent}|${id}`;
      const source = sourceMonths.get(key);
      const month = auditMonth(request.auditDate) || (source?.size === 1 ? [...source][0] : "unknown");
      const months = requestMonths.get(key) || new Set<string>();
      months.add(month); requestMonths.set(key, months);
      const scopedKey = `${key}|${month}`;
      const previous = latest.get(scopedKey);
      if (!previous || time >= previous.time) latest.set(scopedKey, { request, time, month });
    }
  }
  const monthForCase = (item: T) => {
    if (caseMonth(item)) return caseMonth(item);
    const months = new Set(caseIds(item.caseId).flatMap(id =>
      [...(requestMonths.get(`${canonicalAgentIdentityKey(item.agent)}|${id}`) || [])]));
    return months.size === 1 ? [...months][0] : "unknown";
  };
  const testCases = new Set(cases.filter(item => item.isTestCase).flatMap(item =>
    caseIds(item.caseId).map(id => `${canonicalAgentIdentityKey(item.agent)}|${id}|${monthForCase(item)}`)));
  const pendingByAgentMonth = new Map<string, number>();
  for (const [key, { request, month }] of latest) {
    if (!isAppealAwaitingReview(request) || testCases.has(key)) continue;
    const agent = canonicalAgentIdentityKey(request.agent);
    const scope = `${agent}|${month}`;
    pendingByAgentMonth.set(scope, (pendingByAgentMonth.get(scope) || 0) + 1);
  }
  return cases.map(item => ({ ...item,
    appealScoreMonthKey: monthForCase(item),
    pendingAppealCaseCount: item.isTestCase ? 0 :
      pendingByAgentMonth.get(`${canonicalAgentIdentityKey(item.agent)}|${monthForCase(item)}`) || 0,
    appealScoreUnverified: false,
  }));
}

export function getAppealScoreHold(cases: readonly ({ agent: string; isTestCase?: boolean } & AppealScoreState)[]): AppealScoreHold | null {
  const counts = new Map<string, number>();
  let unverified = false;
  for (const item of cases) {
    if (item.isTestCase) continue;
    unverified ||= Boolean(item.appealScoreUnverified);
    const agent = `${canonicalAgentIdentityKey(item.agent)}|${item.appealScoreMonthKey || "unknown"}`;
    counts.set(agent, Math.max(counts.get(agent) || 0, item.pendingAppealCaseCount || 0));
  }
  const pendingCount = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (unverified) return {
    label: "ตรวจสอบผลอุทธรณ์ไม่สำเร็จ",
    message: "ยังแสดงคะแนนสรุปไม่ได้ กรุณากดอัปเดตข้อมูลเพื่อตรวจสอบสถานะอุทธรณ์อีกครั้ง",
    pendingCount,
  };
  return pendingCount ? {
    label: "รอผลอุทธรณ์",
    message: `ยังมี Appeal รอพิจารณา ${pendingCount} เคส คะแนนจะแสดงเมื่อพิจารณา Approved หรือ Reject ครบทุกข้อของทุกเคส`,
    pendingCount,
  } : null;
}
