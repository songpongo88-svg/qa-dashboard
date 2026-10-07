import { canonicalAgentIdentityKey } from "./lib/agentIdentity";

export type AppealScoreState = {
  pendingAppealCaseCount?: number;
  appealScoreUnverified?: boolean;
};

type AppealRequestState = {
  agent: string;
  caseId: string;
  status: string;
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

// Keep numeric evaluation data intact. Propagate the agent's active appeals to
// every case, so changing Week, Month or the case search cannot reveal a score
// while another appeal belonging to that agent is still awaiting a decision.
export function withAppealScoreState<T extends { agent: string; caseId: string; isTestCase?: boolean } & AppealScoreState>(
  cases: readonly T[], requests: readonly AppealRequestState[] | null
): Array<T & AppealScoreState> {
  if (requests === null) return cases.map(item => ({ ...item, appealScoreUnverified: !item.isTestCase }));
  const testCases = new Set(cases.filter(item => item.isTestCase)
    .flatMap(item => caseIds(item.caseId).map(id => `${canonicalAgentIdentityKey(item.agent)}|${id}`)));
  const latest = new Map<string, { request: AppealRequestState; time: number }>();
  for (const request of requests) {
    const agent = canonicalAgentIdentityKey(request.agent);
    if (!agent) continue;
    const time = Date.parse(request.submittedAt || request.reviewedAt || "") || 0;
    for (const id of caseIds(request.caseId)) {
      const key = `${agent}|${id}`;
      const previous = latest.get(key);
      if (!previous || time >= previous.time) latest.set(key, { request, time });
    }
  }
  const pendingByAgent = new Map<string, number>();
  for (const [key, { request }] of latest) {
    if (request.status !== "Pending" || testCases.has(key)) continue;
    const agent = canonicalAgentIdentityKey(request.agent);
    pendingByAgent.set(agent, (pendingByAgent.get(agent) || 0) + 1);
  }
  return cases.map(item => ({ ...item,
    pendingAppealCaseCount: item.isTestCase ? 0 : pendingByAgent.get(canonicalAgentIdentityKey(item.agent)) || 0,
    appealScoreUnverified: false,
  }));
}

export function getAppealScoreHold(cases: readonly ({ agent: string; isTestCase?: boolean } & AppealScoreState)[]): AppealScoreHold | null {
  const counts = new Map<string, number>();
  let unverified = false;
  for (const item of cases) {
    if (item.isTestCase) continue;
    unverified ||= Boolean(item.appealScoreUnverified);
    const agent = canonicalAgentIdentityKey(item.agent);
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
