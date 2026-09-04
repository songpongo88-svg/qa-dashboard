import fs from "node:fs";

const filePath = "src/CoachingMockup.tsx";
const marker = "// coaching-case-evidence-v28";
const requiredMarker = "// coaching-dashboard-source-parity-v27";
let source = fs.readFileSync(filePath, "utf8");

if (source.includes(marker)) {
  console.log("coaching case evidence v28 already applied");
  process.exit(0);
}
if (!source.includes(requiredMarker)) {
  throw new Error("Coaching v27 marker not found; run patch-coaching-dashboard-parity-v27 first");
}

const buildDraftStart = source.indexOf("function buildDraft(");
const buildDraftEnd = source.indexOf("function recordDisplayStatus(", buildDraftStart);
if (buildDraftStart < 0 || buildDraftEnd < 0) {
  throw new Error("Coaching v28 buildDraft block not found");
}

const replacement = String.raw`${marker}
type CoachingCaseEvidenceV28 = {
  caseId: string;
  topicScoreText: string;
  comments: string[];
  caseDescription: string;
  inquiry: string;
};

function cleanCoachingEvidenceTextV28(value: unknown, maxLength = 260) {
  let text = "";
  try {
    text = richTextToPlainText(value as any);
  } catch {
    text = String(value ?? "");
  }
  text = String(text || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxLength ? text.slice(0, maxLength - 1).trimEnd() + "…" : text;
}

function getCaseContextV28(evaluation: StoredEvaluation) {
  const preview = evaluation.rawDataPreview || {};
  const inquiry = cleanCoachingEvidenceTextV28(
    (evaluation as any).inquiry ||
      preview["Customer Inquiry"] ||
      preview["Inquiry TH"] ||
      preview["Inquiry"] ||
      preview["Intent"] ||
      "",
    180
  );
  const caseDescription = cleanCoachingEvidenceTextV28(
    (evaluation as any).caseDescription ||
      preview["Case Description"] ||
      preview["Case Detail"] ||
      preview["Description"] ||
      "",
    260
  );
  return { inquiry, caseDescription };
}

function buildCaseEvidenceV28(
  rows: StoredEvaluation[],
  key: TopicKey
): CoachingCaseEvidenceV28[] {
  return rows
    .map((evaluation) => {
      const matchingTopics = (evaluation.topics || []).filter((topic) => {
        if (topicKeyFromTopic(topic) !== key) return false;
        return Number(topic.score || 0) < Number(topic.max || 0);
      });
      if (!matchingTopics.length) return null;

      const comments = [...new Set(
        matchingTopics
          .map((topic) => cleanCoachingEvidenceTextV28(topic.comment, 260))
          .filter(Boolean)
      )];
      const topicScoreText = matchingTopics
        .map((topic) => {
          const label = cleanCoachingEvidenceTextV28(topic.title || topic.code, 80);
          const score = Number(topic.score || 0);
          const max = Number(topic.max || 0);
          return label + " " + score.toFixed(2) + "/" + max.toFixed(2);
        })
        .join(", ");
      const context = getCaseContextV28(evaluation);

      return {
        caseId: String(evaluation.caseId || evaluation.id || "").trim() || "Unknown Case",
        topicScoreText,
        comments,
        caseDescription: context.caseDescription,
        inquiry: context.inquiry,
      };
    })
    .filter(Boolean) as CoachingCaseEvidenceV28[];
}

function formatEvidenceLineV28(item: CoachingCaseEvidenceV28) {
  const evidence = item.comments[0] || item.caseDescription || item.inquiry;
  const sourceLabel = item.comments[0]
    ? "QA Comment"
    : item.caseDescription
      ? "Case Detail"
      : item.inquiry
        ? "Inquiry"
        : "Evidence";
  const detail = evidence
    ? sourceLabel + ": " + evidence
    : "ไม่พบ Comment/Case Detail เพิ่มเติม แต่มีการหักคะแนนในหัวข้อนี้";
  return "- Case " + item.caseId + " | " + item.topicScoreText + "\n  " + detail;
}

function buildDraft(
  agent: string,
  monthKey: string,
  rows: StoredEvaluation[],
  topics: TopicSummary[],
  priorities: CoachingPriority[],
  coachedBy: string
): CoachingDraft {
  const average =
    rows.reduce((sum, item) => sum + Number(item.finalScore || 0), 0) /
    Math.max(rows.length, 1);
  const grade = buildGrade(average, monthKey);
  const monthLabel = getMonthLabel(monthKey);
  const criticalCount = rows.filter((item) => item.criticalError).length;
  const deductedCaseIds = [...new Set(
    rows
      .filter((item) =>
        (item.topics || []).some(
          (topic) => Number(topic.score || 0) < Number(topic.max || 0)
        )
      )
      .map((item) => String(item.caseId || item.id || "").trim())
      .filter(Boolean)
  )];

  const strongest = [...topics]
    .filter((topic) => topic.percentage > 0)
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 3);

  const strengths = strongest.length
    ? strongest
        .map((topic, index) => {
          const cleanLabel = topic.label.replace(/\s*\([^)]*\)\s*/g, "");
          const keptCases = Math.max(topic.totalCases - topic.deductedCases, 0);
          return (
            String(index + 1) + ". " + cleanLabel +
            " คะแนน " + topic.percentage.toFixed(2) + "%" +
            " | ไม่ถูกหัก " + keptCases + "/" + topic.totalCases + " เคส" +
            (topic.deductedCases
              ? " | ถูกหัก " + topic.deductedCases + " เคส"
              : " | ไม่พบการหักคะแนนในหัวข้อนี้")
          );
        })
        .join("\n")
    : "ยังไม่มีข้อมูลเพียงพอสำหรับสรุปจุดแข็งของเดือนนี้";

  const mainIssues = priorities.length
    ? priorities
        .map((priority, index) => {
          const evidence = buildCaseEvidenceV28(rows, priority.key);
          const caseIds = evidence.map((item) => item.caseId);
          const evidenceLines = evidence.slice(0, 5).map(formatEvidenceLineV28).join("\n");
          const moreCount = Math.max(evidence.length - 5, 0);
          return (
            String(index + 1) + ". " + priority.title.replace(/\s*\([^)]*\)\s*/g, "") + "\n" +
            "พบการหักคะแนน " + priority.count + " จาก " + priority.totalCases + " เคส" +
            (caseIds.length ? " | Case ID: " + caseIds.join(", ") : "") + "\n" +
            (evidenceLines || "ไม่พบรายละเอียดประกอบเพิ่มเติม") +
            (moreCount ? "\n- และอีก " + moreCount + " เคส (ดูได้ใน Case Evidence)" : "")
          );
        })
        .join("\n\n")
    : "เดือนนี้ไม่พบประเด็นที่ต้องเร่งปรับปรุงจากผลประเมินจริง";

  const repeatedPriorities = priorities.filter((priority) => priority.count >= 2);
  const repeatedIssues = repeatedPriorities.length
    ? repeatedPriorities
        .map((priority, index) => {
          const evidence = buildCaseEvidenceV28(rows, priority.key);
          const actualComments = [...new Set(
            evidence.flatMap((item) => item.comments).filter(Boolean)
          )].slice(0, 4);
          const caseIds = evidence.map((item) => item.caseId);
          return (
            String(index + 1) + ". " + priority.title.replace(/\s*\([^)]*\)\s*/g, "") +
            " พบซ้ำ " + priority.count + " เคส" +
            (caseIds.length ? " | Case ID: " + caseIds.join(", ") : "") +
            (actualComments.length
              ? "\nประเด็นที่ QA ระบุจริง:\n" + actualComments.map((item) => "- " + item).join("\n")
              : "\nไม่มี QA Comment ซ้ำที่ระบุข้อความไว้ ระบบยืนยันการเกิดซ้ำจากคะแนนที่ถูกหักในหัวข้อนี้")
          );
        })
        .join("\n\n")
    : "ไม่พบข้อผิดพลาดประเภทเดียวกันตั้งแต่ 2 เคสขึ้นไปในเดือนนี้";

  const recommendation = priorities.length
    ? priorities
        .map((priority, index) => {
          const evidence = buildCaseEvidenceV28(rows, priority.key);
          const reviewCases = evidence.slice(0, 3).map((item) => item.caseId).join(", ");
          const actualComments = [...new Set(
            evidence.flatMap((item) => item.comments).filter(Boolean)
          )].slice(0, 2);
          return (
            String(index + 1) + ". " + priority.title.replace(/\s*\([^)]*\)\s*/g, "") + "\n" +
            (reviewCases ? "ทบทวน Case จริง: " + reviewCases + "\n" : "") +
            (actualComments.length
              ? "อ้างอิง QA Comment: " + actualComments.join(" | ") + "\n"
              : "") +
            "แนวทางแก้: " + priority.steps.join(" → ") + "\n" +
            "เป้าหมาย: " + priority.target
          );
        })
        .join("\n\n")
    : "ให้ชื่นชมสิ่งที่ทำได้ดีและย้ำให้รักษามาตรฐานเดิมในทุกเคส";

  const topPriority = priorities[0];
  const topEvidence = topPriority ? buildCaseEvidenceV28(rows, topPriority.key) : [];
  const topCaseIds = topEvidence.slice(0, 3).map((item) => item.caseId).join(", ");
  const actionPlan = topPriority
    ? [
        "1. เปิด Case จริงที่ถูกหักในประเด็นหลัก: " + (topCaseIds || topPriority.caseIds.slice(0, 3).join(", ")),
        "2. เทียบ QA Comment ของแต่ละเคสกับสิ่งที่ Agent ทำจริง และสรุปสิ่งที่ต้องเปลี่ยนให้ชัด 1 ข้อต่อเคส",
        "3. ใช้ Checklist ก่อนตอบ/ก่อนปิดเคสตามหัวข้อ " + topPriority.title.replace(/\s*\([^)]*\)\s*/g, ""),
        "4. สุ่มติดตามเคสใหม่อย่างน้อย 3 เคสในเดือนถัดไป โดยเช็กว่าข้อผิดพลาดเดิมเกิดซ้ำหรือไม่",
        "5. เป้าหมาย: " + topPriority.target,
      ].join("\n")
    : [
        "1. รักษามาตรฐานในหัวข้อที่ทำได้ดี",
        "2. ใช้เคสคะแนนสูงเป็นตัวอย่าง",
        "3. สุ่มติดตามเคสใหม่อย่างน้อย 3 เคสในเดือนถัดไป",
      ].join("\n");

  const prioritySummary = priorities.length
    ? " ประเด็นหลักคือ " + priorities[0].title.replace(/\s*\([^)]*\)\s*/g, "") +
      " พบ " + priorities[0].count + " เคส"
    : " ไม่พบหัวข้อที่มีการหักคะแนน";

  return {
    overview:
      agent + " มีผลประเมินเดือน " + monthLabel + " จำนวน " + rows.length +
      " เคส คะแนนเฉลี่ย " + average.toFixed(2) + " ระดับ " + grade +
      " | เคสที่มีการหักคะแนน " + deductedCaseIds.length + "/" + rows.length +
      (criticalCount ? " | Critical Error " + criticalCount + " เคส" : "") +
      ". Generate Coaching วิเคราะห์จากคะแนน, Topic ที่ถูกหัก, QA Comment, Case Description/Inquiry และ Case ID ของเคสจริง" +
      prioritySummary,
    strengths,
    mainIssues,
    repeatedIssues,
    recommendation,
    actionPlan,
    coachingDate: formatDateInput(),
    coachedBy,
    followUpDate: "",
    result: "Pending Review",
    agentResponse: "",
    agreedActionPlan: actionPlan,
    additionalNote: "",
  };
}

`;

source = source.slice(0, buildDraftStart) + replacement + source.slice(buildDraftEnd);
fs.writeFileSync(filePath, source, "utf8");
console.log("Generate Coaching actual Case ID / QA Comment / Case Detail evidence analysis v28 applied");
