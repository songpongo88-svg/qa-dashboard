import currentDashboardData from "./data/current-dashboard.json";
import React, { useEffect, useMemo, useState } from "react";

type Grade = "A" | "B" | "C" | "D" | "F";
type ReviewStatus = "Original" | "Revised";
type UserRole = "QA" | "Supervisor" | "Senior" | "Agent";

type Topic = {
  code: string;
  label: string;
  score: number;
  max: number;
  pct: number;
  comment?: string;
};

type CaseItem = {
  key: string;
  agent: string;
  auditDate: string;
  weekLabel: string;
  caseId: string;
  inquiryTh: string;
  inquiryEn: string;
  finalScore: number;
  previousScore?: number;
  grade: Grade;
  reviewStatus: ReviewStatus;
  topics: Topic[];
  revisedTopics?: Topic[];
};

type UserAccount = {
  username: string;
  password: string;
  displayName: string;
  role: UserRole;
  agentName?: string;
};

type TopicSummary = {
  code: string;
  label: string;
  avgScore: string;
  max: number;
  pct: string;
};

type Summary = {
  averageDisplay: string;
  gradeCounts: Record<Grade, number>;
  topicPerformance: TopicSummary[];
};

const CASE_TARGET = 10;
const TODAY = new Date("2026-03-27T00:00:00+07:00");
const W2 = "Week 2";
const W3 = "Week 3";

const TOPIC_MASTER = [
  { code: "1.1", label: "Greeting & Closing Standard", max: 10 },
  { code: "1.2", label: "Accuracy of Information", max: 5 },
  { code: "1.3", label: "PDPA & Policy", max: 5 },
  { code: "2.1", label: "Case Accuracy", max: 5 },
  { code: "2.2", label: "Completeness", max: 5 },
  { code: "2.3", label: "Clarity of Steps", max: 5 },
  { code: "2.4", label: "Official Sources", max: 5 },
  { code: "3.1", label: "Root Cause & Fix", max: 10 },
  { code: "3.2", label: "Ownership", max: 5 },
  { code: "3.3", label: "Next Step", max: 5 },
  { code: "4.1", label: "Message Structure", max: 5 },
  { code: "4.2", label: "Language", max: 5 },
  { code: "4.3", label: "Tone", max: 5 },
  { code: "4.4", label: "Adaptation", max: 5 },
  { code: "5.1", label: "Process", max: 10 },
  { code: "5.2", label: "SLA", max: 5 },
  { code: "5.3", label: "Case Logging", max: 5 },
] as const;

const AGENTS = [
  "Anucha Makundin",
  "Arisa aiemrit",
  "Chatkonnaphat Bhusomya",
  "Jariyawadee Taboodda",
  "Jureeporn Piddum",
  "Krivut Vongkampan",
  "Natcha Chai-in",
  "Nattapol Suprom",
  "Sunijtra Siritan",
  "Suphitcha Keawliam",
  "Wassana Phothong",
].sort((a, b) => a.localeCompare(b));

const USER_ACCOUNTS: UserAccount[] = [
  { username: "qa", password: "qa1234", displayName: "QA Admin", role: "QA" },
  { username: "supervisor", password: "super1234", displayName: "Supervisor", role: "Supervisor" },
  { username: "senior", password: "senior1234", displayName: "Senior", role: "Senior" },
  ...AGENTS.map((agent) => ({
    username: agent.toLowerCase().replace(/[^a-z]/g, ""),
    password: "agent1234",
    displayName: agent,
    role: "Agent" as UserRole,
    agentName: agent,
  })),
];
const handleUploadJson = (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target?.result?.toString() || "");
      reader.readAsText(file);
      setUploadedData(parsed);
      alert("อัปโหลดข้อมูลสำเร็จ");
    } catch (error) {
      alert("ไฟล์ JSON ไม่ถูกต้อง");
    }
  };

  reader.readAsText(file);
};
function scoreToGrade(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function gradeTone(grade: Grade) {
  switch (grade) {
    case "A":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "B":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "C":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "D":
      return "border-orange-200 bg-orange-50 text-orange-700";
    default:
      return "border-rose-200 bg-rose-50 text-rose-700";
  }
}

function reviewTone(reviewStatus: ReviewStatus) {
  return reviewStatus === "Revised"
    ? "border-violet-200 bg-violet-50 text-violet-700"
    : "border-slate-200 bg-slate-50 text-slate-700";
}

function buildTopics(scores: number[], comments?: Record<string, string>): Topic[] {
  return TOPIC_MASTER.map((item, index) => {
    const score = scores[index] ?? 0;
    return {
      code: item.code,
      label: item.label,
      score,
      max: item.max,
      pct: Math.round((score / item.max) * 100),
      comment: comments?.[item.code],
    };
  });
}

function c(
  agent: string,
  auditDate: string,
  weekLabel: string,
  caseId: string,
  inquiryTh: string,
  inquiryEn: string,
  originalScores: number[],
  options?: {
    reviewStatus?: ReviewStatus;
    revisedScores?: number[];
    comments?: Record<string, string>;
  }
): CaseItem {
  const reviewStatus = options?.reviewStatus ?? "Original";
  const previousScore = originalScores.reduce((sum, item) => sum + item, 0);
  const finalScore = options?.revisedScores?.length ? options.revisedScores.reduce((sum, item) => sum + item, 0) : previousScore;
  return {
    key: `${agent}-${caseId}`,
    agent,
    auditDate,
    weekLabel,
    caseId,
    inquiryTh,
    inquiryEn,
    finalScore,
    previousScore: reviewStatus === "Revised" ? previousScore : undefined,
    grade: scoreToGrade(finalScore),
    reviewStatus,
    topics: buildTopics(originalScores, options?.comments),
    revisedTopics: options?.revisedScores ? buildTopics(options.revisedScores, options?.comments) : undefined,
  };
}

const COMMENT_MAP: Record<string, Record<string, string>> = {
  AA205937: {
    "1.1": "ทักทายสุภาพ แต่ปิดการสนทนาโดยยังไม่ได้แก้ปัญหาเรื่องเงินคืน และไม่ได้เชิญให้ลูกค้าสอบถามเพิ่มเติม",
    "5.3": "ปิดเคสทั้งที่ปัญหาเรื่องเงินคืนยังไม่เสร็จสิ้น",
  },
  AA206542: {
    "2.1": "Agent ไม่ได้อ้างอิงข้อมูลของเคสจริง ไม่มีการยืนยัน RR / Order / สถานะงาน และไม่ได้ตรวจสอบจากระบบ จึงเป็นคำตอบแบบทั่วไป",
    "3.1": "ไม่ได้วิเคราะห์ปัญหาของเคส ไม่มีการตรวจสอบสถานะ ไม่มีการเสนอแนวทางแก้ไขจริง เป็นเพียงการอธิบายสิ่งที่อาจจะเกิดขึ้น",
  },
  AA207069: {
    "1.1": "ทักทายตามมาตรฐาน แนะนำชื่อแอดมินชัดเจน มีการใช้ชื่อแอดมินซ้ำในช่วง Closing เสนอความช่วยเหลือเพิ่มเติมก่อนปิด แจ้งช่องทางติดต่อ มีข้อความขอบคุณ Closing ครบตามเกณฑ์",
    "5.2": "First Response เร็วมาก ไม่มีช่วงเงียบ",
  },
  AA207750: {
    "3.1": "มีการประสานร้านค้าเพื่อยกเลิก ซึ่งแก้ปัญหาได้ตรงจุด",
    "5.1": "ดำเนินการตาม Flow คือประสานร้านและยกเลิก แต่ขาดขั้นตอนการยืนยันลูกค้าหรือการสื่อสารเพิ่มเติมที่ควรมีในเคสยกเลิก",
  },
  AA209704: {
    "3.2": "จากการประเมิน Agent ตรวจสอบออเดอร์ ตอบคำถามครบ และแจ้งทางต่อหากยังไม่ได้รับเงินคืน ถือว่าดูแลเคสจนลูกค้าเข้าใจและตอบรับว่าไม่มีคำถามเพิ่ม",
    "5.2": "จากการประเมิน เวลารอรับบริการ 1:47 นาทีอยู่ในเกณฑ์และหลังรับแชทมีการตอบกลับครั้งแรกภายในไม่เกิน 3 นาที จึงผ่านมาตรฐาน SLA ตามเกณฑ์ล่าสุด",
  },
  AA208553: {
    "1.2": "ข้อมูลที่แจ้งว่าระบบรองรับรายงานแบบรายวันเป็นหลัก ตรงคำถาม แต่ยังไม่ได้ปิดประเด็นว่าหากต้องการภาพรวมรายเดือนต้องสรุปต่อเอง",
    "3.1": "เข้าใจคำถามและตอบได้ตรงระดับหนึ่ง แต่ยังไม่ได้ช่วยต่อยอดหรือเสนอทางเลือกที่ใกล้เคียงกับความต้องการของร้านค้ามากขึ้น",
  },
  AA209311: {
    "2.3": "ควรสรุปเป็นขั้นตอนชัดขึ้นว่าไรเดอร์ต้องส่งอะไร ส่งผ่านช่องทางใด และเอกสารใดใช้แทนไม่ได้",
    "3.1": "ตอบคำถามเรื่องเอกสารได้ดี แต่ยังตอบไม่ครบในส่วนคำถามย่อยและยังไม่อธิบายให้ชัดว่าทำไมเอกสารถูกตีกลับ",
  },
  AA206570: {
    "1.1": "มีการทักทายและปิดการสนทนาสุภาพ แต่ไม่มีการเสนอความช่วยเหลือเพิ่มเติมก่อนปิดและไม่ได้เรียกชื่อตัวเองซ้ำระหว่างช่วยเหลือ",
    "1.2": "ข้อมูลที่แจ้งสอดคล้องกับสถานะในระบบ ไม่มีข้อมูลผิดหรือเกินจริง",
    "1.3": "ไม่มีการเปิดเผยข้อมูลส่วนบุคคล และไม่มีการละเมิดนโยบาย",
    "2.1": "ตรวจสอบจากระบบจริงและตอบตรงเคส แต่ไม่มีการยืนยันข้อมูลสำคัญเพิ่มเติม เช่น Shop ID หรือรายละเอียดเคสก่อนดำเนินการ",
    "2.2": "ตอบประเด็นหลักเรื่องสถานะออเดอร์แต่ไม่ได้อธิบายรายละเอียดหรือทางเลือกอื่นเพิ่มเติม",
    "2.3": "ไม่มีการอธิบายขั้นตอนการดำเนินการหรือสิ่งที่จะเกิดขึ้นต่อไป เพียงแจ้งผลสถานะเท่านั้น",
    "2.4": "เป็นข้อมูลจากระบบภายใน ไม่จำเป็นต้องแจ้ง KB ให้ลูกค้าทราบ",
    "3.1": "แจ้งสถานะได้แต่ไม่ได้วิเคราะห์สาเหตุหรือเสนอแนวทางแก้ไขเพิ่มเติม",
    "3.2": "ไม่ได้แสดง Ownership ต่อเนื่อง เช่น การติดตามหรือช่วยดำเนินการเพิ่มเติม เพียงแจ้งผลแล้วปิด",
    "3.3": "ไม่มีการแจ้งขั้นตอนถัดไป ระยะเวลา หรือช่องทางติดตามผล",
    "4.1": "อ่านง่าย แต่ไม่มีการจัดเป็นลำดับหรือแยกประเด็น",
    "4.2": "ใช้ภาษาถูกต้อง สุภาพ กระชับ",
    "4.3": "สุภาพ แต่ไม่มี Empathy หรือความใส่ใจสถานการณ์",
    "4.4": "แม้ข้อความจะสุภาพและถูกต้อง แต่เป็นการตอบแบบแจ้งผลตามระบบเท่านั้น ยังไม่สะท้อนการเข้าใจสถานการณ์ของร้านที่ติดต่อคนขับไม่ได้",
    "5.1": "มีการตรวจสอบและตอบ แต่ไม่ได้ดำเนินการตาม Flow เต็มรูปแบบ เช่น ไม่รับเรื่องตรวจสอบหรือดำเนินการต่อ",
    "5.2": "ตอบต่อเนื่อง ไม่มีช่วงเงียบผิดปกติ",
    "5.3": "มีการปิดเคสและบันทึกในระบบถูกต้อง",
  },
  AA207015: {
    "1.1": "มีการทักทาย แนะนำชื่อแอดมินชัดเจน ใช้ถ้อยคำสุภาพ และ Closing ถูกต้อง แต่ไม่มีการเสนอความช่วยเหลือเพิ่มเติมก่อนปิด",
    "1.2": "ข้อมูลเกี่ยวกับเงินประกันและเงื่อนไขการคืนเงินตรงตามนโยบายบริษัท และใช้สื่อทางการประกอบ ไม่มีข้อมูลผิดหรือคาดเดา",
    "1.3": "ไม่มีการเปิดเผยข้อมูลส่วนบุคคล และไม่มีการละเมิดนโยบาย",
    "2.1": "คำตอบสอดคล้องกับคำถามเรื่องเงินประกัน แต่เป็นข้อมูลเชิงทั่วไป ไม่ได้ตรวจสอบสถานะบัญชีของไรเดอร์รายนี้ก่อนให้คำตอบ",
    "2.2": "ให้ข้อมูลเงื่อนไขการคืนเงินครบผ่านสื่อแนบ แต่ไม่ได้ตอบโดยตรงเป็นข้อความชัดเจนว่าคืนได้เมื่อใด ทำให้ลูกค้าต้องตีความจากภาพ",
    "2.3": "มีการระบุขั้นตอนและระยะเวลาผ่านภาพและลิงก์แบบฟอร์ม แต่ไม่ได้เรียบเรียงขั้นตอนเป็นลำดับในข้อความ",
    "2.4": "ใช้สื่อและช่องทางทางการขององค์กรเป็นแหล่งข้อมูล",
    "3.1": "ให้ข้อมูลและแนวทางทั่วไป แต่ไม่มีการวิเคราะห์สถานะหรือสาเหตุของปัญหาเฉพาะราย และไม่มีการเสนอทางเลือกเพิ่มเติม",
    "3.2": "ให้ข้อมูลครบและแนวทางดำเนินการ แต่ไม่ได้เสนอช่วยดำเนินการต่อหรือยืนยันว่าลูกค้าเข้าใจ",
    "3.3": "มีการระบุขั้นตอนถัดไป (ส่งลิงก์แบบฟอร์ม) แต่ไม่ได้แจ้ง Timeline การดำเนินการหรือช่องทางติดตามผลเพิ่มเติม",
    "4.1": "ข้อความเรียงลำดับดี อ่านง่าย แยกข้อมูลชัดเจน",
    "4.2": "ใช้ภาษาถูกต้อง สุภาพ ชัดเจน ไม่กำกวม",
    "4.3": "น้ำเสียงเป็นมิตร สุภาพ เหมาะสมกับงานบริการ",
    "4.4": "ปรับโทนเหมาะสม แต่ลักษณะคำตอบยังเป็นรูปแบบมาตรฐาน ไม่ได้ personalize ตามเคส",
    "5.1": "ดำเนินการตามการให้ข้อมูลเงินประกัน ใช้สื่อและแบบฟอร์มถูกต้อง แต่ไม่มีหลักฐานการตรวจสอบสถานะบัญชีเฉพาะรายก่อนตอบ",
    "5.2": "ตอบกลับภายในเวลาที่กำหนด ไม่มีช่วงเงียบผิดปกติ",
    "5.3": "มีการระบุข้อมูลสำคัญของเคสและปิดสถานะถูกต้อง",
  },
  AA207538: {
    "1.1": "ไม่มี Greeting ตาม Script มาตรฐาน ไม่มีการแนะนำชื่อแอดมิน ไม่มีการเสนอความช่วยเหลือเพิ่มเติม Closing มีเพียงขอบคุณที่ใช้บริการ ซึ่งไม่ครบองค์ประกอบ ไม่มีการเรียกชื่อแอดมินซ้ำ ถือว่าขาดมาตรฐานการเปิด–ปิดบทสนทนา",
    "1.2": "ข้อมูลเรื่องกิจกรรมหมดเขตอาจถูกต้อง แต่ไม่มีการอธิบายเงื่อนไข วันที่ หรือรายละเอียด และไม่มีหลักฐานยืนยันจากระบบโดยตรง",
    "1.3": "ไม่เปิดเผยข้อมูลส่วนบุคคล ไม่ต้องยืนยันตัวตนเพิ่มเติมในเคสนี้",
    "2.1": "ไม่ได้ตรวจสอบข้อมูลเพิ่มเติมจากระบบ ตอบแบบทั่วไปว่าหมดเขตแล้ว ไม่มีการยืนยันรายละเอียดกิจกรรมที่ลูกค้าพูดถึง",
    "2.2": "ลูกค้าถามว่าเงินจะเข้าเมื่อไร เป็นค่ารอบไหน เกี่ยวกับงานส่งอาหารหรือไม่ แต่แอดมินตอบเพียงว่ากิจกรรมหมดเขตแล้ว ไม่ตอบครบทุกประเด็น",
    "2.3": "ไม่มีการอธิบายขั้นตอนหรือเงื่อนไข ลูกค้าไม่ทราบว่าต้องทำอะไรต่อ ไม่มี Timeline หรือเงื่อนไขการจ่ายเงิน",
    "2.4": "ไม่มีการอ้างอิงประกาศ วันที่ หรือเงื่อนไข แม้มีภาพประกาศ แต่ไม่ได้อธิบาย",
    "3.1": "ไม่ได้วิเคราะห์สาเหตุที่ไรเดอร์ยังไม่ได้รับเงิน ไม่ตรวจสอบสิทธิเข้าร่วม ไม่เสนอทางออก เป็นการตอบปลายเหตุ",
    "3.2": "ปิดเคสทันทีหลังตอบ ไม่ติดตามว่าลูกค้าเข้าใจหรือไม่ ไม่มี Follow-up",
    "3.3": "ไม่แจ้งว่าต้องทำอะไรต่อ ไม่แจ้งช่องทางตรวจสอบ ไม่แจ้งระยะเวลา",
    "4.1": "ข้อความสั้น อ่านง่าย แต่ไม่เป็นโครงสร้างการให้บริการ",
    "4.2": "ภาษาสุภาพ แต่สั้นเกินไป ขาดรายละเอียดสำคัญ",
    "4.3": "น้ำเสียงสุภาพ แต่ไม่แสดง Empathy ต่อความกังวลเรื่องเงิน",
    "4.4": "ไม่ปรับโทนให้เหมาะกับเคสการเงิน ใช้ข้อความทั่วไป",
    "5.1": "ไม่สอบถามข้อมูลเพิ่มเติม ไม่ตรวจสอบสิทธิกิจกรรม ปิดเคสเร็วเกินไป",
    "5.2": "ตอบรวดเร็ว ไม่มีช่วงเงียบ",
    "5.3": "เคสถูกเปิด-ปิดในระบบ แต่รายละเอียดที่บันทึกอาจไม่ครบ",
  },
  AA208454: {
    "1.1": "มีการทักทายและแนะนำชื่อชัดเจน เช่น สวัสดีค่ะ แอดมินบัวลอยยินดีให้บริการ และมีการปิดบทสนทนาแล้ว แต่ยังขาดการเช็กก่อนปิดเคสว่าลูกค้ายังต้องการความช่วยเหลือเพิ่มไหม",
    "1.2": "แนวทางที่ตอบถือว่าไม่ผิดเพราะเรื่องเสียงแจ้งเตือนเกี่ยวกับการตั้งค่าแจ้งเตือนและระดับเสียงได้ แต่คำตอบยังกว้างไป ยังไม่ได้เช็กให้ชัดว่าปัญหาเกิดจากแอป ตัวเครื่อง หรือการตั้งค่าอื่นของลูกค้า",
    "1.3": "ไม่พบการขอข้อมูลส่วนตัวเกินจำเป็น และไม่มีการเปิดเผยข้อมูลลูกค้าในแชท ถือว่าทำได้ถูกต้องตามมาตรฐาน",
    "2.1": "ตอบตรงประเด็นเรื่องไม่ได้ยินเสียงออเดอร์เข้า แต่ยังเป็นคำตอบแบบทั่วไป เพราะไม่ได้ถามเพิ่มว่าใช้มือถือรุ่นอะไร ระบบอะไร หรือมีปัญหาเฉพาะบางช่วงหรือไม่",
    "2.2": "มีการแนะนำเบื้องต้นแล้ว แต่ยังไม่ครบ เช่น ยังไม่ได้แนะนำให้เช็กสิทธิ์แจ้งเตือนของแอป โหมดเงียบ โหมดห้ามรบกวน หรือทดลองเข้าแอปใหม่ หากยังไม่หายควรมีทางไปต่อ",
    "2.3": "อ่านแล้วพอเข้าใจ แต่ยังไม่เป็นขั้นตอนชัดเจน ถ้าเรียงเป็นข้อจะเข้าใจง่ายกว่า เช่น 1) เช็กการแจ้งเตือน 2) เช็กเสียงเรียกเข้า 3) ลองปิด-เปิดแอปใหม่",
    "2.4": "จากข้อความที่เห็น ยังไม่สะท้อนว่ามีการตรวจสอบจากระบบหรือคู่มือการทำงานก่อนตอบ เลยดูเป็นการแนะนำตามความเข้าใจทั่วไปมากกว่า",
    "3.1": "มีการช่วยแก้ปัญหาเบื้องต้น แต่ยังไม่ได้วิเคราะห์ลึกว่าปัญหาเกิดจากอะไรจริง เช่น ควรถามเพิ่มว่าไม่ได้ยินทุกออเดอร์หรือบางออเดอร์ เพิ่งเป็นวันนี้หรือเป็นมานานแล้ว เพื่อหาสาเหตุให้ตรงจุด",
    "3.2": "มีการรับเคส ตอบลูกค้า และปิดเคสตามขั้นตอน ถือว่ารับผิดชอบเคสดีในระดับหนึ่ง แต่ถ้าจะให้ดีกว่านี้ควรเช็กผลก่อนปิด เช่น ถามลูกค้าว่าลองทำแล้วดีขึ้นไหม",
    "3.3": "จุดนี้ยังขาดเพราะยังไม่มีการบอกลูกค้าว่าถ้าลองแล้วไม่หายต้องทำต่ออย่างไร เช่น หากยังไม่ได้ยินเสียงแจ้งเตือน รบกวนแจ้งกลับเพื่อตรวจสอบเพิ่มเติมนะคะ",
    "4.1": "ข้อความสุภาพและอ่านได้ แต่ถ้าแบ่งเป็นสั้น ๆ หรือเป็นข้อจะดูชัดกว่า และลูกค้าทำตามได้ง่ายกว่า",
    "4.2": "ใช้ภาษาสุภาพ เข้าใจได้ไม่แข็งเกินไป แต่ยังปรับให้กระชับและเป็นธรรมชาติกว่านี้ได้",
    "4.3": "น้ำเสียงดีสุภาพ เหมาะกับงานบริการ ไม่พบคำพูดที่ทำให้ลูกค้ารู้สึกถูกปัดหรือไม่ใส่ใจ",
    "4.4": "คำตอบเหมาะกับการช่วยเบื้องต้น แต่ยังเป็นคำตอบกลาง ๆ ไม่ได้ปรับตามรายละเอียดของเคสมากนัก ถ้ามีการถามนำก่อน จะดูใส่ใจและตรงปัญหามากขึ้น",
    "5.1": "จากภาพรวมมีการรับแชท ตอบแชท และปิดเคสครบตาม Flow พื้นฐาน แต่ในเชิงคุณภาพยังควรเพิ่มการยืนยันผลก่อนปิดเคส",
    "5.2": "ตอบกลับได้รวดเร็ว อยู่ในระดับที่ดี ไม่ปล่อยลูกค้ารอนาน",
    "5.3": "มีการอัปเดตสถานะในระบบ",
  },
  AA208955: {
    "1.1": "มีการทักทายและแนะนำชื่อแอดมินชัดเจน และมีการปิดการสนทนาเรียบร้อย แต่ยังไม่เต็ม เพราะก่อนปิดเคสยังไม่ได้เช็กย้ำว่าลูกค้ายังต้องการความช่วยเหลือเพิ่มเติมหรือไม่",
    "1.2": "ข้อมูลที่แจ้งเรื่องหน้าจอแสดงระยะทาง 2 กม. แต่ระยะวิ่งจริง 3 กม. และจะชดเชยส่วนต่าง 1 กม. เป็นเงิน 7 บาท ถือว่าตอบตรงและมีรายละเอียดค่อนข้างชัด แต่ยังไม่เต็ม เพราะยังไม่ได้อธิบายเงื่อนไขเพิ่มเติม เช่น หากเกินกำหนดยังไม่ได้รับต้องทำอย่างไร",
    "1.3": "ไม่พบการเปิดเผยข้อมูลส่วนบุคคลเกินจำเป็น และการตอบอยู่ในขอบเขตข้อมูลของออเดอร์และการชดเชย",
    "2.1": "ลูกค้าถามว่าทำไมได้ 38 เองครับ Agent ตรวจสอบออเดอร์และตอบตรงคำถามทันที โดยอธิบายส่วนต่างของระยะทางและยอดชดเชยได้ตรงกับประเด็นที่ลูกค้าถาม",
    "2.2": "คำตอบค่อนข้างครบ เพราะแจ้งทั้งสาเหตุ จำนวนระยะทางที่ต่างกัน จำนวนเงินชดเชย และระยะเวลารับเงิน แต่ยังไม่เต็ม เพราะยังไม่ได้บอกทางต่อหากลูกค้ายังไม่ได้รับเงินตามกำหนด",
    "2.3": "อธิบายเข้าใจง่ายและเป็นลำดับ",
    "2.4": "มีการตอบจากผลตรวจสอบออเดอร์จริงและอ้างอิงเลขออเดอร์ชัดเจน จึงมีน้ำหนักมากกว่าการตอบทั่วไป แต่ยังไม่เต็ม เพราะไม่ได้ระบุชัดว่าเป็นผลจากการตรวจสอบระบบหรือเงื่อนไขภายในโดยตรง",
    "3.1": "Agent วิเคราะห์ได้ค่อนข้างตรงจุดว่าปัญหาเกิดจากส่วนต่างระยะทาง และให้คำตอบเรื่องการชดเชยได้ชัด แต่ยังไม่เต็ม เพราะเป็นการอธิบายผลมากกว่าการพาลูกค้าไปต่อ หากเพิ่มทางเลือกกรณียังไม่ได้รับเงินตามเวลาจะสมบูรณ์ขึ้น",
    "3.2": "มีการตรวจสอบ ตอบคำถามตรงประเด็น และช่วยคลายข้อสงสัยลูกค้าได้ดี แต่ยังไม่เต็ม เพราะยังไม่ได้เปิดทางต่อให้ชัดในกรณีลูกค้ายังไม่พบยอดเงินภายในเวลาที่แจ้ง",
    "3.3": "มีการแจ้งระยะเวลารับเงินชัดเจนว่า 2 วันทำการ ถือว่ามี Next step ระดับหนึ่ง แต่ยังไม่เต็ม เพราะยังไม่ได้บอกว่าหากเกินกำหนดแล้วไม่มียอดเข้าลูกค้าควรทำอย่างไรต่อ",
    "4.1": "ข้อความเรียงลำดับดี อ่านเข้าใจง่าย และสรุปสาระสำคัญได้ค่อนข้างครบ แต่ยังไม่เต็ม เพราะถ้าแบ่งเป็นช่วงสั้น ๆ จะอ่านง่ายกว่าเดิม โดยเฉพาะส่วนตัวเลขระยะทางและยอดชดเชย",
    "4.2": "ใช้ภาษาสุภาพและเข้าใจง่าย ไม่มีคำไม่เหมาะสม แต่ยังไม่เต็ม เพราะบางช่วงยังทำให้กระชับและลื่นขึ้นได้อีก เช่น ลดคำซ้ำและแยกประโยคให้สั้นลง",
    "4.3": "น้ำเสียงสุภาพ เหมาะกับงานบริการ และมีการขออภัยในความไม่สะดวกอย่างเหมาะสม",
    "4.4": "Agent ปรับคำตอบได้เหมาะกับสถานการณ์ของไรเดอร์ ตอบตรงปัญหาเรื่องเงินชดเชยระยะทาง และใช้ข้อมูลเฉพาะเคส ไม่ได้ตอบกว้างเกินไป",
    "5.1": "มีการรับแชท ตรวจสอบ ตอบลูกค้า และปิดเคสครบตาม Flow พื้นฐาน พร้อมมีบันทึกภายในเกี่ยวกับการชดเชย แต่ยังไม่เต็ม เพราะควรบอกทางต่อกรณีเงินไม่เข้าตามเวลาที่แจ้งให้ครบตั้งแต่รอบแรก",
    "5.2": "ตามเกณฑ์ล่าสุดรับแชทต้องไม่เกิน 3–5 นาทีและหลังรับแชทต้องตอบกลับภายใน 3 นาที เคสนี้เวลารอรับบริการ 1:15 นาที ยังอยู่ในเกณฑ์ แต่จากลำดับเวลา รับแชท 17:20 และตอบกลับสาระสำคัญ 17:24 เกิน 3 นาที จึงไม่ผ่าน SLA ในส่วนการตอบหลังรับแชท",
    "5.3": "มีการอัปเดตและปิดเคสเรียบร้อย พร้อมบันทึกภายในเรื่องขอรับเงินชดเชย แต่ถ้าบันทึกสรุปให้ชัดว่าชดเชยส่วนต่าง 1 กม. 7 บาท จะสมบูรณ์ขึ้น",
  },
  AA209621: {
    "1.1": "จากการประเมิน มีการทักทายและปิดการสนทนาเรียบร้อย สุภาพ แต่ยังไม่เต็ม เพราะยังไม่ได้สรุปผลท้ายเคสให้ชัดว่าตอนนี้กำลังประสานเรียกไรเดอร์ทดแทน และไม่ได้เช็กย้ำว่าลูกค้ายังมีข้อสงสัยเพิ่มไหม",
    "1.2": "จากการประเมิน Agent แจ้งถูกทิศทางว่าอยู่ระหว่างประสานเรียกไรเดอร์ทดแทนให้และให้ลูกค้ารอการแจ้งกลับ ถือว่าเหมาะกับสถานการณ์ แต่ยังไม่เต็ม เพราะยังไม่ได้อธิบายให้ชัดว่าคำขอเปลี่ยนคนขับจะขึ้นกับการหาไรเดอร์ใหม่ได้หรือไม่",
    "1.3": "จากการประเมิน ไม่พบการเปิดเผยข้อมูลส่วนบุคคลเกินจำเป็น และการตอบอยู่ในขอบเขตการช่วยเหลือลูกค้า",
    "2.1": "จากการประเมิน ลูกค้าต้องการให้ติดต่อร้านและเปลี่ยนคนขับ Agent ตอบไปในแนวทางประสานเรียกไรเดอร์ทดแทน ซึ่งตรงประเด็นบางส่วน แต่ยังไม่เต็ม เพราะยังไม่ได้ตอบชัดในส่วนติดต่่อร้านว่าได้ทำหรือไม่ หรือจะดำเนินการอย่างไร",
    "2.2": "จากการประเมิน ลูกค้าต้องการให้ติดต่อร้านและเปลี่ยนคนขับ Agent ตอบไปในแนวทางประสานเรียกไรเดอร์ทดแทน ซึ่งตรงประเด็นบางส่วน แต่ยังไม่เต็ม เพราะยังไม่ได้ตอบชัดในส่วนติดต่่อร้านว่าได้ทำหรือไม่ หรือจะดำเนินการอย่างไร",
    "2.3": "จากการประเมิน คำตอบยังไม่ครบทั้งหมด เพราะลูกค้าพูดถึง 2 เรื่อง คืออยากให้ติดต่อร้านและอยากเปลี่ยนคนขับ แต่คำตอบไปเน้นแค่เรียกไรเดอร์ทดแทน ยังไม่ได้เคลียร์เรื่องการประสานร้านให้ชัด",
    "2.4": "จากการประเมิน มีการตอบตามการดำเนินการของเคส แต่ยังไม่เห็นการอ้างอิงผลตรวจสอบจากระบบหรือสถานะออเดอร์ให้ชัด จึงยังไม่เต็ม",
    "3.1": "จากการประเมิน Agent พอจับได้ว่าลูกค้าต้องการแก้ปัญหาเรื่องคนขับ แต่ยังวิเคราะห์ไม่ครบ เพราะลูกค้าพูดชัดทั้งเรื่องให้ติดต่อร้านและเปลี่ยนคนขับ ซึ่งคำตอบยังไม่ครอบคลุมทั้งหมด",
    "3.2": "จากการประเมิน Agent รับเรื่องและดำเนินการต่อให้ แต่ยังไม่เต็ม เพราะยังไม่ได้บอกว่าจะอัปเดตผลให้ลูกค้าเมื่อมีความคืบหน้า",
    "3.3": "จากการประเมิน มีเพียงการแจ้งว่าอยู่ระหว่างประสานเรียกไรเดอร์ทดแทน แต่ยังไม่เต็ม เพราะยังไม่ได้ระบุเวลาคร่าว ๆ หรือสิ่งที่ลูกค้าควรรอ/สังเกตต่อ",
    "4.1": "จากการประเมิน ข้อความสั้น อ่านง่าย และไม่วกวน แต่ยังไม่เต็ม เพราะยังขาดประโยคสรุปผลและขั้นตอนต่อเนื่องให้ครบในข้อความเดียว",
    "4.2": "จากการประเมิน ใช้ภาษาสุภาพ เข้าใจง่าย เหมาะกับงานบริการ",
    "4.3": "จากการประเมิน น้ำเสียงสุภาพ เหมาะสม และไม่แข็งกระด้าง",
    "4.4": "จากการประเมิน Agent ตอบสั้นและตรงกับสถานการณ์เร่งด่วนระดับหนึ่ง แต่ยังไม่เต็ม เพราะควรเพิ่มความมั่นใจให้ลูกค้ามากขึ้นด้วยการสรุปสิ่งที่กำลังดำเนินการ",
    "5.1": "จากการประเมิน มีการรับแชท ขอหมายเลขคำสั่งซื้อและตอบแนวทางแก้ไขเบื้องต้น ถือว่าทำตาม Flow พื้นฐาน แต่ยังไม่เต็ม เพราะยังไม่เห็นการเก็บรายละเอียดหรือสรุปผลตรวจสอบให้ครบก่อนปิดเคส",
    "5.2": "จากการประเมิน เวลารอรับบริการอยู่ในเกณฑ์ แต่หลังรับแชทมีช่วงห่างของการตอบเกินมาตรฐาน 3 นาทีและไม่เห็นข้อความคั่นระหว่างตรวจสอบ จึงไม่ผ่านเต็ม",
    "5.3": "จากการประเมิน มีการปิดเคส แต่จากบทสนทนายังไม่เห็นผลลัพธ์สุดท้ายชัดว่าจัดหาไรเดอร์ทดแทนได้หรือไม่ จึงยังไม่เต็ม",
  },
};

const CASES: CaseItem[] = [
  c("Suphitcha Keawliam", "13/03/2026", W2, "AA205937", "ลูกค้าร้องเรียนอาหารไม่ครบและการคืนเงิน", "Customer complains about missing items and refund process", [8, 3, 5, 3, 2, 2, 3, 5, 3, 2, 4, 4, 4, 3, 8, 5, 3], { comments: COMMENT_MAP.AA205937 }),
  c("Suphitcha Keawliam", "14/03/2026", W2, "AA206542", "ไรเดอร์แจ้งร้านปิดและขอยกเลิกออเดอร์", "Rider reports store closed and requests order cancellation", [10, 5, 5, 1, 2, 3, 4, 2, 1, 3, 5, 5, 5, 3, 2, 5, 5], { comments: COMMENT_MAP.AA206542 }),
  c("Suphitcha Keawliam", "16/03/2026", W3, "AA207069", "ลูกค้าสอบถามการคืนเงินหลังยกเลิกออเดอร์", "Customer inquires about refund after order cancellation", [10, 5, 5, 5, 4, 5, 5, 8, 5, 5, 5, 5, 5, 5, 10, 5, 5], { comments: COMMENT_MAP.AA207069 }),
  c("Suphitcha Keawliam", "17/03/2026", W3, "AA207750", "ไรเดอร์แจ้งหมุดร้านไม่ถูกต้องและขอยกเลิกงาน", "Rider reports incorrect store location pin and requests cancellation", [8, 5, 5, 4, 4, 3, 5, 10, 4, 3, 4, 5, 5, 4, 8, 5, 5], { comments: COMMENT_MAP.AA207750 }),
  c("Suphitcha Keawliam", "21/03/2026", W3, "AA209704", "ลูกค้าสอบถามคะแนนไม่คืนหลังออเดอร์ถูกยกเลิก", "Customer inquires about missing points refund after cancellation", [9, 5, 5, 5, 5, 4, 4, 8, 5, 5, 5, 5, 5, 5, 9, 5, 4], { comments: COMMENT_MAP.AA209704 }),
  c("Jariyawadee Taboodda", "18/03/2026", W3, "AA208553", "ร้านค้าสอบถามรายงานย้อนหลัง", "Merchant asks about historical report access", [8, 4, 5, 4, 4, 4, 4, 7, 4, 4, 4, 4, 5, 5, 8, 4, 5], { reviewStatus: "Revised", revisedScores: [8, 4, 5, 4, 4, 4, 4, 7, 4, 4, 4, 4, 5, 5, 8, 4, 5], comments: COMMENT_MAP.AA208553 }),
  c("Jariyawadee Taboodda", "20/03/2026", W3, "AA209311", "ไรเดอร์สอบถามเอกสารเปลี่ยนนามสกุล", "Rider asks about surname change documents", [8, 4, 5, 4, 4, 4, 4, 7, 4, 4, 4, 4, 5, 4, 8, 4, 4], { reviewStatus: "Revised", revisedScores: [8, 4, 5, 4, 4, 4, 4, 7, 4, 4, 4, 4, 5, 4, 8, 4, 4], comments: COMMENT_MAP.AA209311 }),
  c("Sunijtra Siritan", "14/03/2026", W2, "AA206570", "ร้านค้าติดต่อไรเดอร์ไม่ได้", "Merchant unable to contact rider", [8, 5, 5, 4, 4, 2, 5, 4, 2, 1, 4, 5, 4, 3, 4, 5, 5], { comments: COMMENT_MAP.AA206570 }),
  c("Sunijtra Siritan", "15/03/2026", W2, "AA207015", "ไรเดอร์สอบถามการหักเงินประกันต่อออเดอร์", "Rider inquires about deposit deduction per order", [9, 5, 5, 4, 4, 4, 5, 5, 4, 4, 5, 5, 5, 4, 8, 5, 5], { comments: COMMENT_MAP.AA207015 }),
  c("Sunijtra Siritan", "16/03/2026", W3, "AA207538", "ไรเดอร์สอบถามเงื่อนไขภารกิจ/การนับจำนวนงาน", "Rider inquires about mission criteria and job counting", [3, 4, 5, 3, 3, 1, 2, 2, 2, 1, 3, 4, 4, 3, 4, 5, 4], { comments: COMMENT_MAP.AA207538 }),
  c("Sunijtra Siritan", "18/03/2026", W3, "AA208454", "ร้านค้าสอบถามปัญหาแจ้งเตือนออเดอร์ไม่มีเสียง", "Merchant inquires about no sound notification for incoming orders", [8, 3, 5, 3, 3, 3, 2, 5, 4, 2, 4, 4, 5, 3, 8, 5, 5], { comments: COMMENT_MAP.AA208454 }),
  c("Sunijtra Siritan", "19/03/2026", W3, "AA208955", "ไรเดอร์สอบถามค่ารอบต่ำกว่าปกติ", "Rider inquires about unusually low fare", [8, 4, 5, 5, 4, 5, 4, 8, 4, 3, 4, 4, 5, 5, 8, 2, 4], { comments: COMMENT_MAP.AA208955 }),
  c("Sunijtra Siritan", "21/03/2026", W3, "AA209621", "ลูกค้าขอให้ติดต่อร้านและเปลี่ยนไรเดอร์", "Customer requests merchant contact and rider reassignment", [8, 4, 5, 4, 3, 3, 3, 5, 4, 3, 4, 5, 5, 4, 6, 1, 3], { comments: COMMENT_MAP.AA209621 }),
];

function formatInputDate(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseAuditDate(value: string) {
  const [day, month, year] = value.split("/").map(Number);
  return new Date(year, month - 1, day);
}

function isWithinDateRange(auditDate: string, from?: string, to?: string) {
  const date = parseAuditDate(auditDate);
  if (from) {
    const fromDate = new Date(from);
    if (date < fromDate) return false;
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    if (date > toDate) return false;
  }
  return true;
}

function formatCurrencyTHB(value: number) {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(value);
}

function getIncentiveValue(caseCount: number, avg: number) {
  if (caseCount < CASE_TARGET) return 0;
  if (avg >= 90) return 1000;
  if (avg >= 80) return 700;
  if (avg >= 70) return 300;
  return 0;
}

function getIncentiveRemark(caseCount: number, avg: number) {
  if (caseCount < CASE_TARGET) return "ยังประเมินไม่ครบ 10 เคส";
  if (avg >= 90) return "Excellent";
  if (avg >= 80) return "Good";
  if (avg >= 70) return "Fair";
  return "Improvement Required";
}

function buildAgentSummary(cases: CaseItem[]): Summary {
  const average = cases.reduce((sum, item) => sum + item.finalScore, 0) / Math.max(cases.length, 1);
  const gradeCounts: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const item of cases) gradeCounts[item.grade] += 1;

  const topicPerformance = TOPIC_MASTER.map((master) => {
    const topics = cases
      .flatMap((item) => (item.reviewStatus === "Revised" && item.revisedTopics?.length ? item.revisedTopics : item.topics))
      .filter((topic) => topic.code === master.code);

    if (!topics.length) {
      return { code: master.code, label: master.label, avgScore: "-", max: master.max, pct: "-" };
    }

    const avg = topics.reduce((sum, topic) => sum + topic.score, 0) / topics.length;
    return {
      code: master.code,
      label: master.label,
      avgScore: avg.toFixed(2),
      max: master.max,
      pct: ((avg / master.max) * 100).toFixed(2),
    };
  });

  return { averageDisplay: average.toFixed(2), gradeCounts, topicPerformance };
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-violet-200 bg-white/95 shadow-sm ${className}`}>{children}</div>;
}

function PanelHeader({ title }: { title: string }) {
  return <div className="border-b border-slate-200 px-5 py-4 text-lg font-semibold text-slate-900">{title}</div>;
}

function PanelBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}

function SmallButton({ children, onClick, dark = false }: { children: React.ReactNode; onClick: () => void; dark?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={dark ? "rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20" : "rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-slate-800 hover:bg-violet-50"}
    >
      {children}
    </button>
  );
}

function MetricCard({ title, value, sub, className = "" }: { title: string; value: string; sub: string; className?: string }) {
  return (
    <Panel className={className}>
      <PanelBody>
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-3 text-3xl font-bold">{value}</div>
        <div className="mt-2 text-xs opacity-80">{sub}</div>
      </PanelBody>
    </Panel>
  );
}

function WeeklySnapshotCard({ label, caseCount, averageDisplay, isActive, onClick }: { label: string; caseCount: number; averageDisplay: string; isActive: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`w-full rounded-2xl border px-4 py-4 text-left ${isActive ? "border-violet-300 bg-violet-100/80" : "border-violet-100 bg-violet-50/70 hover:bg-violet-100/70"}`}>
      <div className="font-semibold text-slate-900">{label}</div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-white/70 p-3">
          <div className="text-slate-500">Average Score</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{averageDisplay}</div>
        </div>
        <div className="rounded-2xl bg-white/70 p-3">
          <div className="text-slate-500">Cases</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{caseCount}</div>
        </div>
      </div>
    </button>
  );
}

function CaseNavigatorCard({ item, isSelected, onSelect }: { item: CaseItem; isSelected: boolean; onSelect: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`h-full cursor-pointer rounded-2xl border p-3 text-left transition ${isSelected ? "border-violet-300 bg-violet-100/80 shadow-sm" : "border-violet-100 bg-white/70 hover:bg-violet-50/80"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{item.caseId}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">{item.auditDate}</div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${gradeTone(item.grade)}`}>{item.grade}</span>
      </div>
      <div className="mt-2 min-h-[2.5rem] text-[12px] font-medium text-slate-800">{item.inquiryTh}</div>
      <div className="mt-2 text-[10px] text-slate-500">{item.reviewStatus}</div>
    </div>
  );
}

function ReviewStatusBadge({ item }: { item: CaseItem }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${reviewTone(item.reviewStatus)}`}>{item.reviewStatus}</span>
      {item.reviewStatus === "Revised" && typeof item.previousScore === "number" ? <span className="text-xs font-medium text-violet-700">{Math.round(item.previousScore)} → {Math.round(item.finalScore)}</span> : null}
    </div>
  );
}

function TopicPerformanceTable({ items }: { items: TopicSummary[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-violet-100 bg-violet-50/70">
      <table className="min-w-[860px] w-full text-sm">
        <thead>
          <tr className="bg-violet-700 text-white text-[11px]">
            <th className="px-3 py-3">Topic</th>
            <th className="px-3 py-3 text-left">Description</th>
            <th className="px-3 py-3">Avg Score</th>
            <th className="px-3 py-3">Max</th>
            <th className="px-3 py-3">Avg %</th>
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => (
            <tr key={entry.code}>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{entry.code}</td>
              <td className="border-t border-slate-200 px-3 py-3">{entry.label}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{entry.avgScore}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{entry.max}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{entry.pct === "-" ? "-" : `${entry.pct}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CaseDetailTopicTable({ topics, revisedTopics, reviewStatus }: { topics: Topic[]; revisedTopics?: Topic[]; reviewStatus?: ReviewStatus }) {
  const activeTopics = reviewStatus === "Revised" && revisedTopics?.length ? revisedTopics : topics;
  const columns = [activeTopics.filter((_, i) => i % 2 === 0), activeTopics.filter((_, i) => i % 2 === 1)];

  const getTone = (pct: number): [string, string] => {
    if (pct >= 80) return ["ดี", "bg-emerald-50 text-emerald-700 border-emerald-200"];
    if (pct >= 60) return ["กลาง", "bg-amber-50 text-amber-700 border-amber-200"];
    return ["ควรปรับปรุง", "bg-rose-50 text-rose-700 border-rose-200"];
  };

  return (
    <div className="space-y-3">
      {reviewStatus === "Revised" && revisedTopics?.length ? <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">กำลังแสดง Score และ Percent จากไฟล์ Revised โดย Remark ใช้ของเดิม</div> : null}
      <div className="grid gap-3 xl:grid-cols-2">
        {columns.map((group, idx) => (
          <div key={idx} className="space-y-3">
            {group.map((topic) => {
              const [label, wrap] = getTone(topic.pct);
              return (
                <div key={`${topic.code}-${topic.label}`} className="rounded-xl border border-fuchsia-100 bg-white/90 p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-700">{topic.code}</div>
                      <div className="mt-1 text-xs font-semibold leading-5 text-slate-900">{topic.label}</div>
                    </div>
                    <div className="shrink-0 rounded-lg bg-fuchsia-50 px-2.5 py-1.5 text-right">
                      <div className="text-[9px] uppercase tracking-wide text-slate-500">{reviewStatus === "Revised" && revisedTopics?.length ? "Revised Score" : "Score"}</div>
                      <div className="text-sm font-bold text-slate-900">{topic.score}/{topic.max}</div>
                    </div>
                  </div>
                  <div className={`mt-2 rounded-lg border px-2.5 py-2 text-[11px] ${wrap}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">Percent</div>
                        <div className="mt-1 text-sm font-semibold">{topic.pct}%</div>
                      </div>
                      <span className="rounded-full border border-current px-2 py-0.5 text-[10px] font-semibold">{label}</span>
                    </div>
                  </div>
                  <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Evaluation Comment</div>
                    <div className="mt-1 text-[11px] leading-5 text-slate-700">{topic.comment || "ยังไม่มี Evaluation Comment จากไฟล์ที่อัปโหลด"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function GradeMix({ gradeCounts }: { gradeCounts: Record<Grade, number> }) {
  return (
    <div className="space-y-3">
      {(Object.keys(gradeCounts) as Grade[]).map((grade) => (
        <div key={grade} className="flex items-center justify-between rounded-2xl border border-violet-100 bg-white/70 px-4 py-3">
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${gradeTone(grade)}`}>{grade}</span>
          <span className="text-sm font-semibold text-slate-900">{gradeCounts[grade]} Case(s)</span>
        </div>
      ))}
    </div>
  );
}

function DataHealthChecks() {
  const tests = [
    { name: "Agent count", pass: AGENTS.length === 11 },
    { name: "Loaded case count", pass: CASES.length === 13 },
    { name: "Suphitcha loaded", pass: CASES.some((x) => x.agent === "Suphitcha Keawliam") },
    { name: "Sunijtra loaded", pass: CASES.some((x) => x.agent === "Sunijtra Siritan") },
    { name: "Jari revised loaded", pass: CASES.some((x) => x.caseId === "AA208553" && x.reviewStatus === "Revised") },
  ];

  return (
    <div className="space-y-2">
      {tests.map((test) => (
        <div key={test.name} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${test.pass ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          <span>{test.name}</span>
          <span className="font-semibold">{test.pass ? "PASS" : "FAIL"}</span>
        </div>
      ))}
    </div>
  );
}

function LoginScreen({ username, password, error, onUsernameChange, onPasswordChange, onLogin }: {
  username: string;
  password: string;
  error: string;
  onUsernameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onLogin: () => void;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-slate-50 to-fuchsia-50 p-6">
      <div className="mx-auto flex min-h-[80vh] max-w-md items-center justify-center">
        <div className="w-full rounded-3xl border border-violet-200 bg-white/95 p-6 shadow-lg">
          <div className="mb-6 text-center">
            <div className="text-sm font-medium text-violet-600">QA Dashboard Access</div>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">Sign in</h1>
            <p className="mt-2 text-sm text-slate-500">Agent เห็นเฉพาะของตัวเอง / QA, Supervisor, Senior เห็นได้ทุกคน</p>
          </div>
          <div className="space-y-4">
            <input value={username} onChange={(e) => onUsernameChange(e.target.value)} placeholder="Username" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400" />
            <input value={password} onChange={(e) => onPasswordChange(e.target.value)} type="password" placeholder="Password" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400" />
            {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
            <button type="button" onClick={onLogin} className="w-full rounded-2xl bg-violet-700 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-800">Log in</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardMockup() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string>("Suphitcha Keawliam");
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  const [selectedCaseKey, setSelectedCaseKey] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>(formatInputDate(new Date(2026, 2, 1)));
  const [dateTo, setDateTo] = useState<string>(formatInputDate(TODAY));
  const [uploadedData, setUploadedData] = useState<any | null>(null);
  const defaultDashboardData = uploadedData || currentDashboardData;
  const handleUploadJson = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result?.toString() || "");
        setUploadedData(parsed);
        setSelectedWeek("all");
        setSelectedCaseKey("");
        alert("อัปโหลดข้อมูลสำเร็จ");
      } catch (error) {
        alert("ไฟล์ JSON ไม่ถูกต้อง");
      }
    };

    reader.readAsText(file);
  };

  const handleLogin = () => {
    const user = USER_ACCOUNTS.find(
      (item) => item.username === username.trim().toLowerCase() && item.password === password
    );

    if (!user) {
      setLoginError("Username หรือ Password ไม่ถูกต้อง");
      return;
    }

    setCurrentUser(user);
    setLoginError("");
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setUsername("");
    setPassword("");
    setLoginError("");
    setSelectedWeek("all");
    setSelectedCaseKey("");
    setDateFrom(formatInputDate(new Date(2026, 2, 1)));
    setDateTo(formatInputDate(TODAY));
  };

  const visibleAgentList = useMemo(() => {
    if (currentUser?.role === "Agent" && currentUser.agentName) {
      return [currentUser.agentName];
    }
    return [...AGENTS].sort((a, b) => a.localeCompare(b));
  }, [currentUser]);

  useEffect(() => {
    if (!visibleAgentList.includes(selectedAgent)) {
      setSelectedAgent(visibleAgentList[0] || "");
    }
  }, [visibleAgentList, selectedAgent]);

  const sourceCases: CaseItem[] = useMemo(() => {
    if (uploadedData?.cases && Array.isArray(uploadedData.cases)) {
      return uploadedData.cases;
    }
    return CASES;
  }, [uploadedData]);

  const effectiveSelectedAgent =
    currentUser?.role === "Agent" && currentUser.agentName
      ? currentUser.agentName
      : uploadedData?.agent || selectedAgent;

  const agentCases = useMemo(() => {
    return sourceCases.filter((item) => item.agent === effectiveSelectedAgent);
  }, [sourceCases, effectiveSelectedAgent]);

  const dateFilteredCases = useMemo(() => {
    return agentCases.filter((item) => isWithinDateRange(item.auditDate, dateFrom, dateTo));
  }, [agentCases, dateFrom, dateTo]);

  const weekLabels = useMemo(() => {
    if (uploadedData?.weeklySummaries && Array.isArray(uploadedData.weeklySummaries)) {
      return uploadedData.weeklySummaries.map((item: any) => item.weekLabel);
    }
    return [...new Set(dateFilteredCases.map((item) => item.weekLabel))];
  }, [uploadedData, dateFilteredCases]);

  const visibleCases = useMemo(() => {
    if (selectedWeek === "all") return dateFilteredCases;
    return dateFilteredCases.filter((item) => item.weekLabel === selectedWeek);
  }, [dateFilteredCases, selectedWeek]);

  const dashboardCases = visibleCases;

  const activeSelectedCase =
    dashboardCases.find((item) => item.key === selectedCaseKey) ||
    dashboardCases[0] ||
    null;

  useEffect(() => {
    if (!dashboardCases.length) {
      if (selectedCaseKey !== "") setSelectedCaseKey("");
      return;
    }

    const stillExists = dashboardCases.some((item) => item.key === selectedCaseKey);
    if (!stillExists) {
      setSelectedCaseKey(dashboardCases[0].key);
    }
  }, [dashboardCases, selectedCaseKey]);

  const summary = useMemo(() => {
    return buildAgentSummary(dateFilteredCases);
  }, [dateFilteredCases]);

  const metricAverageDisplay =
    uploadedData?.monthlySummary?.averageScore != null
      ? Number(uploadedData.monthlySummary.averageScore).toFixed(2)
      : summary.averageDisplay;

  const metricCaseCount =
    uploadedData?.monthlySummary?.casesReviewed != null
      ? Number(uploadedData.monthlySummary.casesReviewed)
      : dateFilteredCases.length;

  const incentiveDisplay = formatCurrencyTHB(
    getIncentiveValue(metricCaseCount, Number(metricAverageDisplay))
  );

  const incentiveRemark = getIncentiveRemark(
    metricCaseCount,
    Number(metricAverageDisplay)
  );

  if (!currentUser) {
    return (
      <LoginScreen
        username={username}
        password={password}
        error={loginError}
        onUsernameChange={setUsername}
        onPasswordChange={setPassword}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-slate-50 to-fuchsia-50">
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-6 rounded-3xl bg-gradient-to-r from-violet-700 via-fuchsia-600 to-violet-500 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-sm font-medium text-violet-100">
                QA Appeal / Dashboard Mockup
              </div>
              <h1 className="mt-2 text-3xl font-bold">
                {currentUser.role === "Agent"
                  ? currentUser.agentName
                  : "QA Performance Dashboard"}
              </h1>
              <div className="mt-2 text-sm text-violet-100">
                Logged in as {currentUser.displayName} ({currentUser.role})
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <SmallButton onClick={() => window.print()}>
                Print / Save PDF
              </SmallButton>
              <SmallButton onClick={handleLogout} dark>
                Log out
              </SmallButton>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-6">
            <Panel>
              <PanelHeader title="Quick Controls" />
              <PanelBody className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Upload Data File
                  </label>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleUploadJson}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Selected Agent
                  </label>
                  <select
                    value={effectiveSelectedAgent}
                    onChange={(e) => setSelectedAgent(e.target.value)}
                    disabled={currentUser.role === "Agent" || !!uploadedData?.agent}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400 disabled:bg-slate-100"
                  >
                    {visibleAgentList.map((agent) => (
                      <option key={agent} value={agent}>
                        {agent}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Date From
                  </label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Date To
                  </label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Week Filter
                  </label>
                  <select
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400"
                  >
                    <option value="all">All Weeks</option>
                    {weekLabels.map((week) => (
                      <option key={week} value={week}>
                        {week}
                      </option>
                    ))}
                  </select>
                </div>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Weekly Snapshot" />
              <PanelBody className="space-y-3">
                <WeeklySnapshotCard
                  label="All Weeks"
                  caseCount={dateFilteredCases.length}
                  averageDisplay={summary.averageDisplay}
                  isActive={selectedWeek === "all"}
                  onClick={() => setSelectedWeek("all")}
                />

                {uploadedData?.weeklySummaries && Array.isArray(uploadedData.weeklySummaries)
                  ? uploadedData.weeklySummaries.map((week: any) => (
                      <WeeklySnapshotCard
                        key={week.weekLabel}
                        label={week.weekLabel}
                        caseCount={Number(week.casesReviewed || 0)}
                        averageDisplay={Number(week.averageScore || 0).toFixed(2)}
                        isActive={selectedWeek === week.weekLabel}
                        onClick={() => setSelectedWeek(week.weekLabel)}
                      />
                    ))
                  : weekLabels.map((week) => {
                      const weekCases = dateFilteredCases.filter(
                        (item) => item.weekLabel === week
                      );
                      const weekSummary = buildAgentSummary(weekCases);

                      return (
                        <WeeklySnapshotCard
                          key={week}
                          label={week}
                          caseCount={weekCases.length}
                          averageDisplay={weekSummary.averageDisplay}
                          isActive={selectedWeek === week}
                          onClick={() => setSelectedWeek(week)}
                        />
                      );
                    })}
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Data Health Checks" />
              <PanelBody>
                <DataHealthChecks />
              </PanelBody>
            </Panel>
          </div>

          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Average Score"
                value={metricAverageDisplay}
                sub={`${metricCaseCount} / ${CASE_TARGET} cases`}
              />
              <MetricCard
                title="Incentive"
                value={incentiveDisplay}
                sub={incentiveRemark}
              />
              <MetricCard
                title="Selected Cases"
                value={`${dashboardCases.length}`}
                sub={selectedWeek === "all" ? "All visible weeks" : selectedWeek}
              />
              <MetricCard
                title="Grade"
                value={scoreToGrade(Number(metricAverageDisplay))}
                sub="Based on current average"
              />
            </div>

            <Panel>
              <PanelHeader title="Case Navigator" />
              <PanelBody>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {dashboardCases.map((item) => (
                    <CaseNavigatorCard
                      key={item.key}
                      item={item}
                      isSelected={activeSelectedCase?.key === item.key}
                      onSelect={() => setSelectedCaseKey(item.key)}
                    />
                  ))}
                </div>
              </PanelBody>
            </Panel>

            {activeSelectedCase ? (
              <Panel>
                <PanelHeader title="Case Detail" />
                <PanelBody className="space-y-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-sm text-slate-500">Case ID</div>
                      <div className="text-xl font-bold text-slate-900">
                        {activeSelectedCase.caseId}
                      </div>
                      <div className="mt-2 text-sm text-slate-700">
                        {activeSelectedCase.inquiryTh}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {activeSelectedCase.inquiryEn}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${gradeTone(
                          activeSelectedCase.grade
                        )}`}
                      >
                        Grade {activeSelectedCase.grade}
                      </span>
                      <ReviewStatusBadge item={activeSelectedCase} />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
                      <div className="text-xs text-slate-500">Audit Date</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {activeSelectedCase.auditDate}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
                      <div className="text-xs text-slate-500">Week</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {activeSelectedCase.weekLabel}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
                      <div className="text-xs text-slate-500">Final Score</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {activeSelectedCase.finalScore}
                      </div>
                    </div>
                  </div>

                  <CaseDetailTopicTable
                    topics={activeSelectedCase.topics}
                    revisedTopics={activeSelectedCase.revisedTopics}
                    reviewStatus={activeSelectedCase.reviewStatus}
                  />
                </PanelBody>
              </Panel>
            ) : (
              <Panel>
                <PanelHeader title="Case Detail" />
                <PanelBody>
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                    ไม่พบเคสในช่วงวันที่เลือก
                  </div>
                </PanelBody>
              </Panel>
            )}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <Panel>
                <PanelHeader title="Topic Performance" />
                <PanelBody>
                  <TopicPerformanceTable items={summary.topicPerformance} />
                </PanelBody>
              </Panel>

              <Panel>
                <PanelHeader title="Grade Mix" />
                <PanelBody>
                  <GradeMix gradeCounts={summary.gradeCounts} />
                </PanelBody>
              </Panel>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
