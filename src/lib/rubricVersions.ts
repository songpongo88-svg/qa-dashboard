export type RubricTopicGroup = "Service Standard" | "Answer Quality" | "Resolution" | "Communication";

export type RubricTopic = {
  code: string;
  title: string;
  max: number;
  group: RubricTopicGroup;
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
  { key: "Service Standard", title: "1. Service Standard", note: "Greeting, Policy, Process, SLA" },
  { key: "Answer Quality", title: "2. Answer Quality", note: "Accuracy, completeness, clear next step" },
  { key: "Resolution", title: "3. Resolution & Ownership", note: "Root cause, ownership, next action" },
  { key: "Communication", title: "4. Communication Quality", note: "Structure, language, tone" },
];

export const RUBRIC_VERSIONS: RubricVersionDefinition[] = [
  {
    code: "QA-2026-04",
    name: "April 2026 - Current Rubric",
    status: "Active",
    startDate: "2026-04-03",
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
