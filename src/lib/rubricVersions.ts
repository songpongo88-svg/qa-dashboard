export type RubricTopicGroup = "Service Standard" | "Answer Quality" | "Resolution" | "Communication";

export type RubricTopic = {
  code: string;
  title: string;
  max: number;
  group: RubricTopicGroup;
  focusItems?: string[];
  reviewGuide?: string;
  examples?: string;
};

export type RubricVersionDefinition = {
  code: string;
  name: string;
  status: "Active" | "Ended";
  startDate: string;
  endDate?: string;
  totalScore: number;
  topics: RubricTopic[];
};

export const RUBRIC_GROUP_LABELS: Array<{ key: RubricTopicGroup; title: string; note: string }> = [
  { key: "Service Standard", title: "1. Process & Policy", note: "Process, PDPA, SLA, Tag, Case Note" },
  { key: "Answer Quality", title: "2. Answer Quality", note: "Accuracy, verification, complete answer" },
  { key: "Resolution", title: "3. Case Handling", note: "Ownership, next step, follow-up" },
  { key: "Communication", title: "4. Communication Skills", note: "Structure, wording, tone, situation awareness" },
];

export const RUBRIC_VERSIONS: RubricVersionDefinition[] = [
  {
    code: "QA-2026-01-02",
    name: "January–February 2026 - Rubric",
    status: "Ended",
    startDate: "2026-01-01",
    endDate: "2026-02-28",
    totalScore: 100,
    topics: [
      { code: "1", title: "เปิด-ปิดการสนทนา", max: 10, group: "Service Standard" },
      { code: "2", title: "วิเคราะห์/แก้ไข", max: 30, group: "Answer Quality" },
      { code: "3", title: "ปฏิบัติตามขั้นตอน", max: 20, group: "Resolution" },
      { code: "4", title: "ความสุภาพ", max: 10, group: "Communication" },
      { code: "5", title: "ภาษา", max: 20, group: "Communication" },
      { code: "6", title: "ระยะเวลา", max: 10, group: "Service Standard" },
    ],
  },
  {
    code: "QA-2026-06",
    name: "June 2026 - Admin Live Chat Criteria",
    status: "Active",
    startDate: "2026-06-01",
    totalScore: 100,
    topics: [
      {
        code: "1",
        title: "ขั้นตอนการทำงานและนโยบาย (Process & Policy Compliance)",
        max: 30,
        group: "Service Standard",
        focusItems: [
          "เปิดและปิดแชทตามมาตรฐาน (Standard Opening & Closing)",
          "ยืนยันข้อมูล / PDPA / Policy (Verification, PDPA & Policy Compliance)",
          "Process / SLA / การส่งต่อ / การปิดเคส (Process, SLA, Escalation & Case Closure)",
          "Case Note / Tag / การบันทึกเคส (Case Notes, Tagging & Documentation)",
        ],
        reviewGuide:
          "ตรวจว่าแอดมินเริ่มและจบแชทถูกมาตรฐาน ขอและใช้ข้อมูลตาม PDPA ทำตาม Process/SLA ส่งต่อถูกทีม และบันทึก Case Note/Tag ครบพอให้ทีมถัดไปตามงานต่อได้",
        examples:
          "ไม่ทักทายหรือปิดแชทไม่ครบ, ขอข้อมูลเกินจำเป็น, ไม่ยืนยันข้อมูลในเคสที่ต้องตรวจสอบ, รับแชทเกิน SLA, ส่งต่อผิดทีม, ใส่ Tag หรือ Case Note ไม่ครบ",
      },
      {
        code: "2",
        title: "คุณภาพคำตอบและการวิเคราะห์ปัญหา (Answer Quality & Problem Analysis)",
        max: 20,
        group: "Answer Quality",
        focusItems: [
          "ตอบถูกต้องและครบประเด็น (Answer Accuracy & Completeness)",
          "ตรวจสอบข้อมูลก่อนสรุปคำตอบ (Information Verification Before Response)",
        ],
        reviewGuide:
          "ตรวจว่าคำตอบถูกต้องตามประเภทผู้ติดต่อ ตอบครบทุกคำถาม ตรวจระบบ/ประวัติเคส/หลักฐานก่อนสรุป และไม่ตอบจากการคาดเดา",
        examples:
          "แจ้งเงื่อนไข สถานะ หรือยอดเงินผิด, ตอบไม่ครบ, ข้ามคำถามหลัก, ไม่ขอข้อมูลจำเป็นก่อนตอบ, วิเคราะห์ผิดประเด็น",
      },
      {
        code: "3",
        title: "การดูแลเคสและติดตามผล (Case Handling & Follow-up)",
        max: 25,
        group: "Resolution",
        focusItems: [
          "ดูแลเคสตั้งแต่รับเรื่องจนมีข้อสรุป (End-to-End Case Handling)",
          "แจ้งขั้นตอนถัดไปให้ชัด (Clear Next Step Communication)",
          "ติดตามและแจ้งผลตรวจสอบ (Follow-up & Result Update)",
        ],
        reviewGuide:
          "ตรวจว่าแอดมินรับเรื่องแล้วดูแลต่อเนื่อง ไม่ปล่อยให้ผู้ติดต่อไม่รู้สถานะ แจ้งขั้นตอนถัดไป ระยะเวลารอ ข้อมูลที่ต้องส่งเพิ่ม และสรุปผลหลังตรวจสอบ/ประสานงาน",
        examples:
          "รับเรื่องแล้วไม่ดำเนินการต่อ, แจ้งให้รอแต่ไม่บอกระยะเวลา, ไม่บอกช่องทางติดตาม, ตรวจสอบหรือโทรออกแล้วไม่สรุปผล",
      },
      {
        code: "4",
        title: "ทักษะการสื่อสาร (Communication Skills)",
        max: 25,
        group: "Communication",
        focusItems: [
          "อ่านง่ายและเรียงลำดับชัด (Clear Structure & Logical Flow)",
          "กระชับและตรงประเด็น (Concise & Relevant Communication)",
          "สะกดถูกและใช้คำเหมาะสม (Correct Spelling & Appropriate Wording)",
          "การสื่อสารอย่างสุภาพและเข้าใจสถานการณ์ (Polite & Situation-Aware Communication)",
        ],
        reviewGuide:
          "ตรวจว่าข้อความเรียงลำดับชัด อ่านง่าย กระชับ สะกดถูก ใช้คำเหมาะกับผู้ติดต่อ และมีน้ำเสียงสุภาพ/เข้าใจสถานการณ์ โดยเฉพาะเคสที่มีผลกระทบหรือร้องเรียน",
        examples:
          "ข้อความยาวติดกันหรือลำดับสลับ, ใช้คำฟุ่มเฟือย, สะกดผิดหลายจุด, เรียกผู้ติดต่อผิดประเภท, ตอบแข็งหรือไม่รับทราบข้อมูลที่ผู้ติดต่อส่งมา",
      },
    ],
  },
  {
    code: "QA-2026-04",
    name: "April 2026 - Rubric",
    status: "Ended",
    startDate: "2026-04-03",
    endDate: "2026-05-31",
    totalScore: 100,
    topics: [
      { code: "1.1", title: "มาตรฐานการทักทายและปิดการสนทนา", max: 10, group: "Service Standard" },
      { code: "1.2", title: "การปฏิบัติตาม PDPA / Policy / ข้อกำหนด", max: 10, group: "Service Standard" },
      { code: "1.3", title: "การปฏิบัติตามกระบวนการและ SLA", max: 10, group: "Service Standard" },
      { code: "2.1", title: "ความถูกต้องของคำตอบ", max: 10, group: "Answer Quality" },
      { code: "2.2", title: "ความครบถ้วนของคำตอบ", max: 10, group: "Answer Quality" },
      { code: "2.3", title: "ความชัดเจนของขั้นตอนและแหล่งอ้างอิง", max: 5, group: "Answer Quality" },
      { code: "3.1", title: "การวิเคราะห์และแก้ไขปัญหาได้ตรงจุด", max: 15, group: "Resolution" },
      { code: "3.2", title: "Ownership และการแจ้ง Next Step", max: 10, group: "Resolution" },
      { code: "4.1", title: "โครงสร้างข้อความและความอ่านง่าย", max: 5, group: "Communication" },
      { code: "4.2", title: "ความกระชับและความถูกต้องของภาษา", max: 5, group: "Communication" },
      { code: "4.3", title: "น้ำเสียงและความเหมาะสมตามสถานการณ์", max: 10, group: "Communication" },
    ],
  },
];

export function formatRubricDate(value?: string) {
  if (!value) return "Present";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function getRubricForDate(value?: string) {
  const target = value ? new Date(`${value}T00:00:00`).getTime() : Date.now();
  if (Number.isNaN(target)) return RUBRIC_VERSIONS.find((rubric) => rubric.status === "Active") || RUBRIC_VERSIONS[0];

  return (
    RUBRIC_VERSIONS.find((rubric) => {
      const start = new Date(`${rubric.startDate}T00:00:00`).getTime();
      const end = rubric.endDate ? new Date(`${rubric.endDate}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;
      return target >= start && target <= end;
    }) ||
    RUBRIC_VERSIONS.find((rubric) => rubric.status === "Active") ||
    RUBRIC_VERSIONS[0]
  );
}
