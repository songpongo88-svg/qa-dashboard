import fs from "node:fs";

const filePath = "src/CoachingMockup.tsx";
const marker = "// coaching-main-issues-summary-v30";
const requiredMarker = "// coaching-case-evidence-v28";
let source = fs.readFileSync(filePath, "utf8");

if (source.includes(marker)) {
  console.log("coaching main issues summary v30 already applied");
  process.exit(0);
}
if (!source.includes(requiredMarker)) {
  throw new Error("Coaching v28 marker not found; run patch-coaching-case-evidence-v28 first");
}

const start = source.indexOf("  const mainIssues = priorities.length");
const end = source.indexOf("  const repeatedPriorities =", start);
if (start < 0 || end < 0) {
  throw new Error("Coaching v30 mainIssues block not found");
}

const replacement = String.raw`  ${marker}
  const mainIssueGroups = (() => {
    type IssueGroup = {
      label: string;
      caseIds: Set<string>;
      examples: string[];
      order: number;
    };

    const groups = new Map<string, IssueGroup>();

    const fallbackLabel = (key: TopicKey) => {
      if (key === "process") return "ดำเนินการผิดขั้นตอน / Process";
      if (key === "accuracy") return "คำตอบหรือการตรวจสอบข้อมูลไม่ถูกต้อง";
      if (key === "handling") return "การดูแลเคสและติดตามผลไม่ครบ";
      return "การสื่อสารยังไม่เหมาะสม";
    };

    const classify = (text: string, key: TopicKey) => {
      const value = normalizeText(text);
      if (/สะกด|พิมพ์ผิด|คำผิด|typo|spelling|เขียนผิด/.test(value)) {
        return "สะกดคำ / พิมพ์ข้อความผิด";
      }
      if (/opening|closing|ทักทาย|เปิดการสนทนา|ปิดการสนทนา|เปิดแชท|ปิดแชท|แนะนำชื่อ|ชื่อแอดมิน/.test(value)) {
        return "Opening / Closing ไม่เป็นมาตรฐาน";
      }
      if (/identify|verify|pdpa|ยืนยันตัวตน|ขอข้อมูล|ลำดับ|process|policy|ขั้นตอน|ดำเนินการผิด|ดำเนินการไม่ถูก|ตรวจสอบก่อน|case note|tag|refund|cancel|sla/.test(value)) {
        return "ดำเนินการผิดขั้นตอน / Process";
      }
      if (/ข้อมูลผิด|ไม่ถูกต้อง|คลาดเคลื่อน|ตอบผิด|แจ้งผิด|accuracy|ตรวจสอบผิด/.test(value)) {
        return "คำตอบหรือการตรวจสอบข้อมูลไม่ถูกต้อง";
      }
      if (/ไม่ครบ|ตกหล่น|ขาดข้อมูล|ข้อมูลไม่ครบ|completeness/.test(value)) {
        return "ให้ข้อมูลหรือดำเนินการไม่ครบ";
      }
      if (/follow|ownership|next step|ติดตาม|ส่งต่อ|ปิดเคส|ดูแลเคส|ค้างเคส/.test(value)) {
        return "การดูแลเคสและติดตามผลไม่ครบ";
      }
      if (/น้ำเสียง|สุภาพ|สื่อสาร|กระชับ|ข้อความยาว|ไม่ชัด|tone|empathy|communication/.test(value)) {
        return "การสื่อสารยังไม่เหมาะสม";
      }
      return fallbackLabel(key);
    };

    priorities.forEach((priority, priorityIndex) => {
      const evidence = buildCaseEvidenceV28(rows, priority.key);

      if (!evidence.length) {
        const label = fallbackLabel(priority.key);
        const existing = groups.get(label) || {
          label,
          caseIds: new Set<string>(),
          examples: [],
          order: priorityIndex,
        };
        priority.caseIds.forEach((caseId) => existing.caseIds.add(caseId));
        groups.set(label, existing);
        return;
      }

      evidence.forEach((item) => {
        const rawEvidence =
          item.comments[0] || item.caseDescription || item.inquiry || "";
        const label = classify(rawEvidence, priority.key);
        const existing = groups.get(label) || {
          label,
          caseIds: new Set<string>(),
          examples: [],
          order: priorityIndex,
        };

        if (item.caseId) existing.caseIds.add(item.caseId);
        const example = cleanCoachingEvidenceTextV28(rawEvidence, 180);
        if (example && !existing.examples.includes(example)) {
          existing.examples.push(example);
        }
        existing.order = Math.min(existing.order, priorityIndex);
        groups.set(label, existing);
      });
    });

    return [...groups.values()]
      .sort((a, b) => {
        if (b.caseIds.size !== a.caseIds.size) return b.caseIds.size - a.caseIds.size;
        return a.order - b.order;
      })
      .slice(0, 6);
  })();

  const mainIssues = mainIssueGroups.length
    ? mainIssueGroups
        .map((group, index) => {
          const caseIds = [...group.caseIds];
          const visibleCases = caseIds.slice(0, 5);
          const moreCases = Math.max(caseIds.length - visibleCases.length, 0);
          const caseText = visibleCases.length
            ? " | Case ID: " + visibleCases.join(", ") +
              (moreCases ? " +อีก " + moreCases + " เคส" : "")
            : "";
          const exampleText = group.examples[0]
            ? "\n   ตัวอย่างที่พบ: " + group.examples[0]
            : "";
          return (
            String(index + 1) + ". " + group.label +
            " — พบ " + group.caseIds.size + " เคส" +
            caseText + exampleText
          );
        })
        .join("\n\n") +
      "\n\nรายละเอียดรายเคสดูได้ที่ Case Evidence"
    : "เดือนนี้ไม่พบประเด็นที่ต้องเร่งปรับปรุงจากผลประเมินจริง";

`;

source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(filePath, source, "utf8");
console.log("Coaching Main Issues summarized into clear issue categories v30 applied");
