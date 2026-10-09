import * as XLSX from "xlsx";
import { fetchStoredEvaluationsForCases } from "./evaluationStore";
import { isSameCanonicalAgent } from "./lib/agentIdentity";
import { fetchCachedStaticResponse } from "./staticFileCache";

type CaseIdentity = { caseId: string; agent: string };
type CaseLinkedEvent = {
  event_type: string;
  case_id?: string;
  target_agent?: string;
  details?: Record<string, unknown>;
  source_case_unavailable?: boolean;
};
const CASE_EVENTS = new Set(["appeal_request_submitted", "appeal_request_reviewed", "appeal_request_reset", "appeal_additional_round_opened", "appeal_additional_evidence_submitted"]);
let staticCaseIndex: Promise<CaseIdentity[]> | undefined;

function normalizedCaseId(value: unknown) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}
function splitCaseIds(value: unknown) {
  const text = String(value || "");
  return [...new Set((text.match(/[A-Za-z]{1,6}\d{3,}/g) || text.split(/[,;|\n]+/))
    .map(normalizedCaseId).filter(Boolean))];
}
function loadStaticCaseIndex() {
  if (!staticCaseIndex) staticCaseIndex = Promise.all([
    "QA_RawData_January-February2026.xlsx", "QA_RawData_March-May2026.xlsx",
  ].map(async file => {
    const response = await fetchCachedStaticResponse(`/${file}`);
    const workbook = XLSX.read(await response.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets.Raw_Data || workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    const headerIndex = rows.findIndex(row => row.some(cell => String(cell).trim().toLowerCase() === "case id") &&
      row.some(cell => String(cell).trim().toLowerCase() === "agent name"));
    if (headerIndex < 0) throw new Error(`ตรวจสอบเคสต้นทางใน ${file} ไม่สำเร็จ`);
    const headers = rows[headerIndex].map(cell => String(cell).trim().toLowerCase());
    const caseColumn = headers.indexOf("case id");
    const agentColumn = headers.indexOf("agent name");
    return rows.slice(headerIndex + 1).flatMap(row => splitCaseIds(row[caseColumn])
      .map(caseId => ({ caseId, agent: String(row[agentColumn] || "").trim() })));
  })).then(parts => parts.flat()).catch(error => { staticCaseIndex = undefined; throw error; });
  return staticCaseIndex;
}

// Enrich only the fetched view. Original submissions, evidence and review
// history remain in qa_appeal_events; no automatic Reject/Reset is written.
export async function checkAppealSourceCases<T extends CaseLinkedEvent>(events: readonly T[]): Promise<T[]> {
  const linked = events.filter(event => CASE_EVENTS.has(event.event_type));
  if (!linked.length) return [...events];
  const staticCases = await loadStaticCaseIndex().catch(error => {
    console.warn("Static appeal source case index unavailable; checking stored cases instead", error);
    return [] as CaseIdentity[];
  });
  const matches = (event: CaseLinkedEvent, item: CaseIdentity, id: string) =>
    normalizedCaseId(item.caseId) === id &&
    (!(event.target_agent || event.details?.agent) || isSameCanonicalAgent(item.agent, event.target_agent || event.details?.agent));
  const neededIds = [...new Set(linked.flatMap(event => {
    const sourceId = event.case_id || event.details?.caseId;
    const missing = splitCaseIds(sourceId).filter(id => !staticCases.some(item => matches(event, item, id)));
    // A single evaluation can contain several Call Log IDs in its case_id.
    // Query its original combined value as well as the individual IDs.
    return missing.length ? [...missing, String(sourceId || "").trim().toUpperCase()] : [];
  }))];
  let stored: Awaited<ReturnType<typeof fetchStoredEvaluationsForCases>>;
  try {
    stored = neededIds.length ? await fetchStoredEvaluationsForCases(neededIds) : [];
  } catch (error) {
    // An unavailable case lookup must not erase appeal history from the review list.
    console.warn("Source case lookup unavailable; preserving appeal audit history", error);
    throw error;
  }
  const sourceCases = [...staticCases, ...stored.flatMap(item => splitCaseIds(item.caseId)
    .map(caseId => ({ caseId, agent: item.agentName })))];
  return events.map(event => {
    if (!CASE_EVENTS.has(event.event_type)) return event;
    const ids = splitCaseIds(event.case_id || event.details?.caseId);
    return { ...event, source_case_unavailable: Boolean(ids.length) &&
      ids.every(id => !sourceCases.some(item => matches(event, item, id))) };
  });
}

export function findUnavailableAppealForRoute<T extends CaseLinkedEvent>(events: readonly T[], selectedId: string, search: string) {
  const params = new URLSearchParams(search);
  const workspace = params.get("workspace") || "";
  let requestId = params.get("requestId") || selectedId;
  if (workspace.startsWith("appeal-review:")) {
    try { requestId = decodeURIComponent(workspace.slice("appeal-review:".length).split("|")[0]); } catch { /* use selected ID */ }
  }
  if (!requestId) return undefined;
  return events.find(event => event.source_case_unavailable && String(event.details?.requestId || "") === requestId);
}
