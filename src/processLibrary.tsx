// process-library-native-v69
import React, { useEffect, useMemo, useRef, useState } from "react";
import { getApps, initializeApp } from "firebase/app";
import { collection, doc, getDocs, getFirestore, onSnapshot, writeBatch } from "firebase/firestore";
import { getDownloadURL, getStorage, ref as storageRef, uploadBytes } from "firebase/storage";

type ProcessVersion = {
  id: string;
  name: string;
  versionLabel: string;
  fileName: string;
  fileUrl: string;
  fileType: "pdf" | "pptx" | "ppt" | "other";
  slideCount: number;
  slideTitles: string[];
  slideSteps: string[][];
  slideOfficeIds: string[];
  uploadedAt: string;
  uploadedBy: string;
  status: "current" | "archived";
};

export type ProcessReferenceMeta = {
  versionId: string;
  processName: string;
  versionLabel: string;
  slideNumber: number;
  slideTitle: string;
  step: string;
  fileUrl: string;
  fileType: string;
  slideOfficeId?: string;
};

const PROCESS_COLLECTION = "qa_process_versions";
const CURRENT_PROCESS_TITLES = ["Customer Service Team","Shop","Customer Support","Customer scenario","1. สอบถามข้อมูลโปรไฟล์","2. สอบถามข้อมูลคำสั่งซื้อ","3. ติดตามสถานะคำสั่งซื้อ","4. ลูกค้าปักหมุดผิด","5. แจ้งร้านค้าปิด/ติดต่อไม่ได้","6.1 ได้รับอาหารล่าช้า - ไรเดอร์รับอาหารแล้ว","6.2 ได้รับอาหารล่าช้า - ไรเดอร์ยังไม่รับอาหาร","7. อาหารไม่ถูกต้อง (ผิดเมนู)","8. ได้รับอาหารไม่ครบ","9. ยกเลิกออเดอร์ หาไรเดอร์ไม่ได้","10. อาหารเสียหาย/หกเลอะเทอะ","11. อาหารไม่ตรงปก/ปริมาณน้อย","12. ไม่ได้รับอาหาร(จัดส่งสำเร็จ)","13. พบสั่งแปลกปลอมในอาหาร","14. สถานะออเดอร์ค้าง/ไม่อัปเดต","15.1 ติดตามเงินคืน – SCB Easy ( Paywise )","15.1 ติดตามเงินคืน – K Plus","14.1 ติดตามเงินคืน – บัตรเครดิต/เดบิต","15.3 ติดตามเงินคืน – QR Promptpay","15.4 ติดตามเงินคืน – Wallet ( TrueMoney / ShopeePay )","16. แจ้ง โค้ดส่วนลดใช้งานไม่ได้","17. ขอลบบัญชีและ Re-active โปรไฟล์","18. ปัญหาการใช้งานแอปพลิเคชัน","19. ลูกค้าได้รับเงินเกิน(ขอโอนเงินคืน)","20. ร้องเรียนพฤติกรรมไรเดอร์","11. ร้องเรียนร้านค้า","Appendix","Order Status","Slide 33","ขั้นตอนการยกลิกออเดอร์( Admin Cancel )/ Partial Refund","1 ) ยกเลิกออเดอร์( Admin Cancel ) ช่องทาง SCB Easy ( Paywise ) /Business Account","2 ) ยกเลิกออเดอร์( Admin Cancel ) ช่องทางบัตรเครดิต/เดบิต , วอลเล็ท , QR Promptpay","3 ) ยกเลิกออเดอร์( Admin Cancel ) โดยที่ร้านค้าต้องได้รับเงินค่าอาหาร","4 ) ยกเลิกออเดอร์( Admin Cancel ) กรณีไม่มีค่าอาหาร (ลูกค้าใช้โค้ดส่วนลด)","5 ) คืนเงินลูกค้าบางส่วน( Partial Refund ) โดยทำการหักเงินร้านค้า","6 ) คืนเงินลูกค้าบางส่วน( Partial Refund ) โดยทำการหักเงินไรเดอร์","Merchant Support ( Shop )","Merchant scenario ( Shop )","การยืนยันตัวตนร้านค้า ( Merchant Verify )","1. สอบถามข้อมูลเกี่ยวกับร้านค้า","2. สอบถามการสมัครร้านค้าใหม่","3. สอบถามการสมัคร/ยกเลิกส่วนลดค่าอาหาร ( DS )","4. ยกเลิกส่วนลดดีดีพลัส ( DDP )","5. ติดตามการสมัครร้านค้าใหม่","6. ร้านเข้าระบบไม่ได้/ลืมรหัสผ่าน","7. ไรเดอร์ไม่มารับอาหาร (ทำอาหารแล้ว)","8. ร้านค้า ทำอาหารไม่ครบ","9. ร้านขอยกเลิกออเดอร์(ร้านปิด)","10. ขอรายงานการขายและใบกำกับภาษี","11. ขอเอกสารใบลดหนี้","12. ร้านค้าไม่ได้รับเงิน","13. ร้านค้าได้รับเงินไม่ครบ","14. เปลี่ยนแปลงอีเมลเข้าระบบ","15. เปลี่ยนแปลงเบอร์โทรศัพท์","16. เปลี่ยนแปลงบัญชีรับเงินร้านค้า","17. เปลี่ยนแปลง ชื่อบริษัท/ชื่อเจ้าของกิจการ","เอกสารประกอบการเปลี่ยนแปลงข้อมูลร้านค้า","18. ขอปรับส่วนลดดีดีพลัส ( GP )","19. สถานะร้านค้าในแอปไม่ถูกต้อง","20. ปัญหาการใช้แอปพลิเคชั่น","21. ปิดร้านค้าถาวร / ชั่วคราว","22. ขอ Re-active บัญชีร้านค้า","XX. ติดตามการอนุมัติร้านค้า","22. ร้องเรียนพฤติกรรมไรเดอร์","23. ร้องเรียนพนักงาน","Appendix","ตัวอย่างอีเมลแจ้งผลการสมัครร้านค้า","ขั้นตอนการรีเซ็ตรหัสผ่านร้านค้าผ่านแอปพลิเคชัน","ขั้นตอนการสมัครร้านค้า ประเภทบุคคลธรรมดา","ขั้นตอนการสมัครร้านค้า ประเภทบุคคลธรรมดา","ขั้นตอนการสมัครร้านค้า ประเภทนิติบุคคล","ขั้นตอนการสมัครร้านค้า ประเภทนิติบุคคล","Slide 77","Robinhood Rider","Rider scenario","การยืนยันตัวตัวไรเดอร์ ( Rider Verify )","1. สอบถามข้อมูลโปรไฟล์","2. สอบถามจำนวนงานที่สำเร็จ","3. สอบถามการสมัครไรเดอร์ใหม่","คุณสมบัติและเอกสารประกอบการสมัครไรเดอร์ใหม่","4. สอบถามการซื้ออุปกรณ์ทำงาน","ขั้นตอนการสั่งซื้ออุปกรณ์ผ่าน Robinhood Rider Shop","5. สอบถามการยกเลิกบัญชี (ลบโปรไฟล์)","6. เปลี่ยนแปลงหมายเลขโทรศัพท์","7. เปลี่ยนแปลงเลขบัญชีรับเงิน","8. เปลี่ยนแปลงรถมอเตอร์ไซค์","9. เปลี่ยนแปลงชื่อ - นามสกุล","10. ขอเอกสารการทำงาน","11. ขอเปิดระบบ - บัญชีถูกระงับบัญชี(ยื่นอุทธรณ์)","เงื่อนไขการพิจารณาปลดระงับสัญญาณไรเดอร์","12. ส่งเอกสารสมัครไรเดอร์เพิ่ม","13. แจ้งร้านค้าปิด/ติดต่อไม่ได้","14. ระบบยิงงานไกลเกิน 8 กม.","15. แจ้งปัญหาติดต่อลูกค้าไม่ได้","16. ไรเดอร์รถเสีย","17. ไรเดอร์เกิดอุบัติเหตุ","18. อาหารเยอะเกินใส่กระเป๋าไม่หมด","19. ลูกค้าปักหมุดผิด","20. ร้านค้าปักหมุดผิด","20. ร้านค้าปักหมุดผิด","21. กดจบงานไม่ได้","22. ระยะทางไม่ตรงกับหน้าแอป","23. ไรเดอร์ติดต่อร้านค้าไม่ได้","24. ไรเดอร์ติดต่อลูกค้าไม่ได้","25. ติดตามเงินค่ารอบไม่ครบ","26. ติดตามการสมัครไรเดอร์ใหม่","27. ติดตามเงินค่ารอบไม่ครบ","28. ติดตามเงินชดเชย/โบนัส","29. ติดตามสถานะการจัดซื้ออุปกรณ์","30. แจ้งปัญหาแอปพลิเคชัน","Appendix","วิธีการถ่ายรูปคู่กับบัตรประชาชนของคุณ","ตัวอย่างเอกสารการทำงานของไรเดอร์","Slide 118"];

const BUILTIN_VERSION: ProcessVersion = {
  id: "new-process-2026-seed-20260910",
  name: "New Process 2026",
  versionLabel: "2026.09.10",
  fileName: "New Process 2026 (5).pptx",
  fileUrl: "",
  fileType: "pptx",
  slideCount: CURRENT_PROCESS_TITLES.length,
  slideTitles: CURRENT_PROCESS_TITLES,
  slideSteps: [],
  slideOfficeIds: [],
  uploadedAt: "2026-09-10T00:00:00.000Z",
  uploadedBy: "System seed",
  status: "current",
};

const env = (import.meta as any).env || {};

function firebaseServices() {
  try {
    const existing = getApps()[0];
    const app = existing || initializeApp({
      apiKey: String(env.VITE_FIREBASE_API_KEY || ""),
      authDomain: String(env.VITE_FIREBASE_AUTH_DOMAIN || ""),
      projectId: String(env.VITE_FIREBASE_PROJECT_ID || ""),
      storageBucket: String(env.VITE_FIREBASE_STORAGE_BUCKET || ""),
      messagingSenderId: String(env.VITE_FIREBASE_MESSAGING_SENDER_ID || ""),
      appId: String(env.VITE_FIREBASE_APP_ID || ""),
    });
    return { db: getFirestore(app), storage: getStorage(app) };
  } catch {
    return null;
  }
}

function fileType(name: string): ProcessVersion["fileType"] {
  const value = name.toLowerCase();
  if (value.endsWith(".pdf")) return "pdf";
  if (value.endsWith(".pptx")) return "pptx";
  if (value.endsWith(".ppt")) return "ppt";
  return "other";
}

function makeVersionId(name: string) {
  const base = name.toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "process";
  return `${base}-${Date.now()}`;
}

export function serializeProcessReference(meta: ProcessReferenceMeta) {
  const clean = (value: unknown) => String(value ?? "").replace(/\r?\n/g, " ").trim();
  return [
    `Process: ${clean(meta.processName)}`,
    `Version: ${clean(meta.versionLabel)}`,
    `Version ID: ${clean(meta.versionId)}`,
    `Slide: ${meta.slideNumber || 0}`,
    `Title: ${clean(meta.slideTitle)}`,
    `Step: ${clean(meta.step || "ทั้งสไลด์")}`,
    `File URL: ${clean(meta.fileUrl)}`,
    `File Type: ${clean(meta.fileType)}`,
    `Slide Office ID: ${clean(meta.slideOfficeId)}`,
  ].join("\n");
}

export function parseProcessReference(value: unknown): ProcessReferenceMeta | null {
  const text = String(value || "").trim();
  if (!text || !/^Process:/m.test(text) || !/^Slide:/m.test(text)) return null;
  const get = (key: string) => text.match(new RegExp(`^${key}:\\s*(.*)$`, "mi"))?.[1]?.trim() || "";
  return {
    versionId: get("Version ID"), processName: get("Process"), versionLabel: get("Version"),
    slideNumber: Number(get("Slide") || 0), slideTitle: get("Title"), step: get("Step") || "ทั้งสไลด์",
    fileUrl: get("File URL"), fileType: get("File Type"), slideOfficeId: get("Slide Office ID"),
  };
}

function fromVersion(version: ProcessVersion, slideNumber: number, step: string): ProcessReferenceMeta {
  return {
    versionId: version.id, processName: version.name, versionLabel: version.versionLabel, slideNumber,
    slideTitle: version.slideTitles[Math.max(0, slideNumber - 1)] || `Slide ${slideNumber}`,
    step: step || "ทั้งสไลด์", fileUrl: version.fileUrl, fileType: version.fileType,
    slideOfficeId: version.slideOfficeIds[Math.max(0, slideNumber - 1)] || "",
  };
}

function previewUrl(meta: ProcessReferenceMeta) {
  if (!meta.fileUrl) return "";
  if (meta.fileType === "pdf" || meta.fileUrl.toLowerCase().includes(".pdf")) return `${meta.fileUrl.split("#")[0]}#page=${Math.max(1, meta.slideNumber)}&view=FitH`;
  if (meta.fileType === "pptx" || meta.fileType === "ppt") return "";
  return meta.fileUrl;
}

const PROCESS_REFERENCE_SEPARATOR_V68 = "\n---PROCESS-REFERENCE---\n";
const BUILTIN_PROCESS_STEPS_V68: string[][] = [[],[],[],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4","ข้อ 5","ข้อ 15","ข้อ 16","ข้อ 17","ข้อ 18","ข้อ 20","ข้อ 21","ข้อ 22"],[],["ข้อ 1","ข้อ 2","Think to Know"],["ข้อ 1","ข้อ 2","Think to Know"],["ข้อ 1","ข้อ 2","ข้อ 3","Think to Know"],["ข้อ 1","ข้อ 2","ข้อ 3","Think to Know","เงื่อนไข / หมายเหตุ"],["ข้อ 1","ข้อ 2","ข้อ 4","ข้อ 5","เงื่อนไข / หมายเหตุ"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4","ข้อ 5","ข้อ 6"],["ข้อ 1","ข้อ 2","ข้อ 3"],["ข้อ 1","ข้อ 2","ข้อ 3","Think to Know"],["ข้อ 1","ข้อ 2"],["ข้อ 1","ข้อ 2","ข้อ 3","Think to Know","เงื่อนไข / หมายเหตุ"],["ข้อ 1","ข้อ 2","ข้อ 3","Think to Know"],["ข้อ 1","ข้อ 2","ข้อ 3"],["ข้อ 1","ข้อ 2","ข้อ 3"],["ข้อ 1","ข้อ 2","ข้อ 14"],["ข้อ 1","ข้อ 2","Think to Know"],["ข้อ 1","ข้อ 2","Think to Know"],["ข้อ 1","ข้อ 2","Think to Know"],["ข้อ 1","ข้อ 2","Think to Know"],["ข้อ 1","ข้อ 2","Think to Know"],["ข้อ 1","ข้อ 2","ข้อ 3","เงื่อนไข / หมายเหตุ","Think to Know"],["ข้อ 1","ข้อ 2","Think to Know"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4","ข้อ 5","ข้อ 18","Think to Know"],[],["ข้อ 1","ข้อ 2","เงื่อนไข / หมายเหตุ","Think to Know"],["ข้อ 1","ข้อ 2","Think to Know"],[],["เงื่อนไข / หมายเหตุ"],[],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4","ข้อ 5","ข้อ 6"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4","ข้อ 5","ข้อ 6"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4","ข้อ 5"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4","ข้อ 5"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4","ข้อ 5"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4","ข้อ 5","ข้อ 6"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4","ข้อ 5","ข้อ 6"],[],["ข้อ 5","ข้อ 6","ข้อ 7","ข้อ 8","ข้อ 9","ข้อ 10","ข้อ 11","ข้อ 12","ข้อ 13","ข้อ 14","ข้อ 15","ข้อ 16","ข้อ 17","ข้อ 18","ข้อ 19","ข้อ 21","ข้อ 22","ข้อ 23"],[],["ข้อ 1","ข้อ 2","ข้อ 3"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4"],["ข้อ 1","ข้อ 2"],["ข้อ 1","ข้อ 2","ข้อ 3"],["ข้อ 1","ข้อ 2","ข้อ 3"],["ข้อ 1","ข้อ 2"],["ข้อ 1","ข้อ 2","ข้อ 3"],["ข้อ 1","ข้อ 2","ข้อ 3"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4","ข้อ 14"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4"],["ข้อ 1","ข้อ 2","ข้อ 3","Think to Know"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4","ข้อ 5","เงื่อนไข / หมายเหตุ","Think to Know"],["เงื่อนไข / หมายเหตุ"],["ข้อ 1","ข้อ 2","ข้อ 3","Think to Know"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4","ข้อ 5"],["ข้อ 1","ข้อ 2","ข้อ 3","Think to Know"],["ข้อ 1","ข้อ 2","ข้อ 3","Think to Know"],["ข้อ 1","ข้อ 2","ข้อ 3"],["ข้อ 1","ข้อ 2","เงื่อนไข / หมายเหตุ"],[],[],[],[],[],[],[],[],[],[],["ข้อ 5","ข้อ 6","ข้อ 7","ข้อ 8","ข้อ 9","ข้อ 10","ข้อ 11","ข้อ 12","ข้อ 13","ข้อ 14","ข้อ 15","ข้อ 16","ข้อ 17","ข้อ 18","ข้อ 19","ข้อ 20","ข้อ 21","ข้อ 22","ข้อ 23","ข้อ 24","ข้อ 25","ข้อ 27","ข้อ 28","ข้อ 29","ข้อ 30"],[],["Think to Know"],["Think to Know"],["เงื่อนไข / หมายเหตุ"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4","ข้อ 5","ข้อ 6","เงื่อนไข / หมายเหตุ"],["ข้อ 1","ข้อ 2"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4","ข้อ 5","เงื่อนไข / หมายเหตุ"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4","เงื่อนไข / หมายเหตุ"],["ข้อ 6"],["ข้อ 1","ข้อ 2","ข้อ 7"],["ข้อ 1","ข้อ 2"],["ข้อ 1","ข้อ 2","ข้อ 9"],["ข้อ 1","ข้อ 2","ข้อ 3","Think to Know"],["ข้อ 11","เงื่อนไข / หมายเหตุ"],["เงื่อนไข / หมายเหตุ"],["ข้อ 1","ข้อ 2","ข้อ 12","เงื่อนไข / หมายเหตุ","Think to Know"],["ข้อ 1","ข้อ 2","Think to Know","เงื่อนไข / หมายเหตุ"],["ข้อ 1","ข้อ 2","ข้อ 14","Think to Know","เงื่อนไข / หมายเหตุ"],["ข้อ 1","ข้อ 2"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4","ข้อ 16","Think to Know"],["ข้อ 1","ข้อ 2","ข้อ 3","ข้อ 4"],["เงื่อนไข / หมายเหตุ"],["ข้อ 1","ข้อ 2","เงื่อนไข / หมายเหตุ","Think to Know"],["ข้อ 20"],["ข้อ 1","ข้อ 2","ข้อ 20"],[],["ข้อ 22","เงื่อนไข / หมายเหตุ"],["ข้อ 23","เงื่อนไข / หมายเหตุ"],["ข้อ 24","เงื่อนไข / หมายเหตุ"],["เงื่อนไข / หมายเหตุ"],["ข้อ 1","ข้อ 2","เงื่อนไข / หมายเหตุ"],[],["เงื่อนไข / หมายเหตุ"],["เงื่อนไข / หมายเหตุ"],[],[],[],[],[]];

function parseProcessReferenceListV68(value: unknown): ProcessReferenceMeta[] {
  const text = String(value || "").trim();
  if (!text) return [];
  const chunks = text.split(PROCESS_REFERENCE_SEPARATOR_V68).map((item) => item.trim()).filter(Boolean);
  const parsed = chunks.map((item) => parseProcessReference(item)).filter((item): item is ProcessReferenceMeta => Boolean(item));
  if (parsed.length) return parsed;
  const single = parseProcessReference(text);
  return single ? [single] : [];
}

function serializeProcessReferenceListV68(items: ProcessReferenceMeta[]) {
  return items.map((item) => serializeProcessReference(item)).join(PROCESS_REFERENCE_SEPARATOR_V68);
}

function normalizeStepV69(value: unknown) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || text === "ทั้งสไลด์") return text;
  if (/think\s*to\s*know/i.test(text)) return "Think to Know";
  if (/^(?:note|หมายเหตุ|เงื่อนไข)(?:\b|\s|\/|:)/i.test(text)) return "Note";
  if (/^(?:flow|ขั้นตอน)(?:\b|\s|\/|:)/i.test(text)) return "Flow";
  const numbered = text.match(/^(?:ข้อ\s*)?(\d{1,2}(?:\.\d+)?)\s*[.)]?/i);
  if (numbered) return "ข้อ " + numbered[1];
  return text;
}

function uniqueStepsV68(values: unknown[]) {
  return Array.from(new Set(values.map(normalizeStepV69).filter(Boolean)));
}

function builtInVersionV68(): ProcessVersion {
  return {
    ...BUILTIN_VERSION,
    slideSteps: BUILTIN_PROCESS_STEPS_V68.map((steps) => uniqueStepsV68(steps)),
    slideOfficeIds: Array.from({ length: BUILTIN_VERSION.slideCount }, () => ""),
  };
}

function currentProcessVersionV69(rows: any[]): ProcessVersion | null {
  const currentRows = rows.filter((row) => row?.status === "current");
  currentRows.sort((a, b) => new Date(b?.uploadedAt || 0).getTime() - new Date(a?.uploadedAt || 0).getTime());
  const row = currentRows[0];
  if (!row) return null;

  const storedCount = Number(row.slideCount || 1);
  const count = Math.max(1, Math.min(500, Number.isFinite(storedCount) ? Math.floor(storedCount) : 1));
  const titles = Array.isArray(row.slideTitles) ? row.slideTitles.map(String) : [];
  const steps = Array.isArray(row.slideSteps)
    ? row.slideSteps.map((entry: unknown) => Array.isArray(entry) ? uniqueStepsV68(entry) : [])
    : [];
  const officeIds = Array.isArray(row.slideOfficeIds) ? row.slideOfficeIds.map(String) : [];
  const storedType = String(row.fileType || "").toLowerCase();
  const resolvedType = ["pdf", "pptx", "ppt", "other"].includes(storedType)
    ? storedType as ProcessVersion["fileType"]
    : fileType(String(row.fileName || row.fileUrl || ""));

  return {
    id: String(row.id || ""),
    name: String(row.name || row.fileName || "Process"),
    versionLabel: String(row.versionLabel || "-"),
    fileName: String(row.fileName || ""),
    fileUrl: String(row.fileUrl || ""),
    fileType: resolvedType,
    slideCount: count,
    slideTitles: Array.from({ length: count }, (_, index) => titles[index] || "Slide " + (index + 1)),
    slideSteps: Array.from({ length: count }, (_, index) => steps[index] || []),
    slideOfficeIds: Array.from({ length: count }, (_, index) => officeIds[index] || ""),
    uploadedAt: String(row.uploadedAt || ""),
    uploadedBy: String(row.uploadedBy || ""),
    status: "current",
  };
}

function stepsForSlideV68(version: ProcessVersion, slideNumber: number) {
  const fromVersion = Array.isArray(version.slideSteps) && Array.isArray(version.slideSteps[Math.max(0, slideNumber - 1)])
    ? version.slideSteps[Math.max(0, slideNumber - 1)]
    : [];
  const values = uniqueStepsV68(fromVersion).filter((item) => item !== "ทั้งสไลด์");
  return values.length ? values : ["ทั้งสไลด์"];
}

function stepLabelsFromTextV69(text: string) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  const labels: string[] = [];
  const add = (label: string) => {
    const normalizedLabel = normalizeStepV69(label);
    if (normalizedLabel && normalizedLabel !== "ทั้งสไลด์" && !labels.includes(normalizedLabel)) labels.push(normalizedLabel);
  };

  for (const match of normalized.matchAll(/(?:^|[\s•])ข้อ\s*(\d{1,2}(?:\.\d+)?)(?=\s|[.):\-–—]|$)/gi)) add("ข้อ " + match[1]);
  for (const match of normalized.matchAll(/(?:^|[\s•])(\d{1,2}(?:\.\d+)?)\s*[.)](?=\s|$)/g)) add("ข้อ " + match[1]);
  if (/think\s*to\s*know/i.test(normalized)) add("Think to Know");
  if (/(?:^|[\s•])(note|หมายเหตุ|เงื่อนไข)(?=\s|:|\/|$)/i.test(normalized)) add("Note");
  if (/(?:^|[\s•])(flow|ขั้นตอน)(?=\s|:|\/|$)/i.test(normalized)) add("Flow");
  return labels;
}

function zipU16V68(view: DataView, offset: number) { return view.getUint16(offset, true); }
function zipU32V68(view: DataView, offset: number) { return view.getUint32(offset, true); }

type ProcessUploadIndex = {
  titles: string[];
  steps: string[][];
  officeIds: string[];
};

type PptxZipEntry = {
  method: number;
  compressedSize: number;
  localOffset: number;
};

async function inflateZipEntryV68(data: Uint8Array, method: number) {
  if (method === 0) return data;
  const DecompressionStreamCtor = (globalThis as any).DecompressionStream;
  if (method !== 8 || !DecompressionStreamCtor) throw new Error("Unsupported ZIP compression");
  const stream = new Blob([data as any]).stream().pipeThrough(new DecompressionStreamCtor("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function decodeXmlTextV68(value: string) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value.replace(/\s+/g, " ").trim();
}

function xmlAttributeV69(tag: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return decodeXmlTextV68(tag.match(new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] || "");
}

function normalizeZipTargetV69(baseDirectory: string, target: string) {
  const segments = (target.startsWith("/") ? target.slice(1) : baseDirectory + "/" + target)
    .replace(/\\/g, "/")
    .split("/");
  const normalized: string[] = [];
  segments.forEach((segment) => {
    if (!segment || segment === ".") return;
    if (segment === "..") normalized.pop();
    else normalized.push(segment);
  });
  return normalized.join("/");
}

function pptxTextChunksV69(xml: string) {
  return [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
    .map((item) => decodeXmlTextV68(item[1] || ""))
    .filter(Boolean);
}

function pptxTitleV69(xml: string, chunks: string[], fallback: string) {
  const shapes = [...xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)].map((item) => item[0]);
  const titleShape = shapes.find((shape) => /<p:ph\b[^>]*\btype\s*=\s*["'](?:title|ctrTitle)["']/i.test(shape));
  const titleFromShape = titleShape ? pptxTextChunksV69(titleShape).join(" ").trim() : "";
  if (titleFromShape) return titleFromShape;
  return chunks.find((text) => text.length <= 180 && !/copyright/i.test(text) && !/^\d+$/.test(text)) || chunks[0] || fallback;
}

async function extractPptxReferenceIndexV68(file: File): Promise<ProcessUploadIndex> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 70000); offset -= 1) {
    if (zipU32V68(view, offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("Invalid PPTX ZIP");
  const totalEntries = zipU16V68(view, eocd + 10);
  let cursor = zipU32V68(view, eocd + 16);
  const decoder = new TextDecoder("utf-8");
  const entries = new Map<string, PptxZipEntry>();

  for (let index = 0; index < totalEntries && cursor + 46 <= bytes.length; index += 1) {
    if (zipU32V68(view, cursor) !== 0x02014b50) throw new Error("Invalid PPTX central directory");
    const method = zipU16V68(view, cursor + 10);
    const compressedSize = zipU32V68(view, cursor + 20);
    const fileNameLength = zipU16V68(view, cursor + 28);
    const extraLength = zipU16V68(view, cursor + 30);
    const commentLength = zipU16V68(view, cursor + 32);
    const localOffset = zipU32V68(view, cursor + 42);
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + fileNameLength)).replace(/\\/g, "/");
    entries.set(name, { method, compressedSize, localOffset });
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  const readEntry = async (name: string) => {
    const entry = entries.get(name);
    if (!entry || entry.localOffset + 30 > bytes.length || zipU32V68(view, entry.localOffset) !== 0x04034b50) return "";
    const localNameLength = zipU16V68(view, entry.localOffset + 26);
    const localExtraLength = zipU16V68(view, entry.localOffset + 28);
    const dataStart = entry.localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + entry.compressedSize > bytes.length) throw new Error("Invalid PPTX slide data");
    const compressed = bytes.slice(dataStart, dataStart + entry.compressedSize);
    const raw = await inflateZipEntryV68(compressed, entry.method);
    return decoder.decode(raw);
  };

  const presentationXml = await readEntry("ppt/presentation.xml");
  const relationshipXml = await readEntry("ppt/_rels/presentation.xml.rels");
  const relationshipTargets = new Map<string, string>();
  for (const match of relationshipXml.matchAll(/<Relationship\b[^>]*\/?\s*>/gi)) {
    const tag = match[0];
    const id = xmlAttributeV69(tag, "Id");
    const target = xmlAttributeV69(tag, "Target");
    if (id && target) relationshipTargets.set(id, normalizeZipTargetV69("ppt", target));
  }

  const orderedSlides: { path: string; officeId: string }[] = [];
  for (const match of presentationXml.matchAll(/<p:sldId\b[^>]*\/?\s*>/gi)) {
    const tag = match[0];
    const relationshipId = xmlAttributeV69(tag, "r:id");
    const path = relationshipTargets.get(relationshipId) || "";
    if (path && entries.has(path)) orderedSlides.push({ path, officeId: xmlAttributeV69(tag, "id") });
  }

  if (!orderedSlides.length) {
    [...entries.keys()]
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => Number(a.match(/slide(\d+)\.xml$/i)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml$/i)?.[1] || 0))
      .forEach((path) => orderedSlides.push({ path, officeId: "" }));
  }
  if (!orderedSlides.length) throw new Error("No slides found in PPTX");
  if (orderedSlides.length > 500) throw new Error("Process files support up to 500 slides");

  const found: { title: string; steps: string[]; officeId: string }[] = [];
  for (let index = 0; index < orderedSlides.length; index += 1) {
    const slide = orderedSlides[index];
    const xml = await readEntry(slide.path);
    const chunks = pptxTextChunksV69(xml);
    const title = pptxTitleV69(xml, chunks, "Slide " + (index + 1));
    const bodyChunks = chunks.filter((text) => text !== title);
    const steps = uniqueStepsV68(bodyChunks.flatMap(stepLabelsFromTextV69));
    if (/^think\s*to\s*know$/i.test(title)) steps.push("Think to Know");
    if (/^(?:note|หมายเหตุ|เงื่อนไข)(?:\b|\s|:|\/|$)/i.test(title)) steps.push("Note");
    if (/^(?:flow|ขั้นตอน)(?:\b|\s|:|\/|$)/i.test(title)) steps.push("Flow");
    found.push({ title, steps: uniqueStepsV68(steps), officeId: slide.officeId });
  }

  return {
    titles: found.map((item, index) => item.title || "Slide " + (index + 1)),
    steps: found.map((item) => item.steps),
    officeIds: found.map((item) => item.officeId),
  };
}

async function analyzeProcessUploadV68(file: File): Promise<ProcessUploadIndex> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pptx")) return extractPptxReferenceIndexV68(file);
  if (!lower.endsWith(".pdf")) throw new Error("Unsupported Process file");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = new TextDecoder("latin1").decode(bytes);
  if (!text.startsWith("%PDF-")) throw new Error("Invalid PDF");
  const directPages = (text.match(/\/Type\s*\/Page\b/g) || []).length;
  const pageTreeCounts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((match) => Number(match[1] || 0));
  const detectedCount = directPages || Math.max(0, ...pageTreeCounts);
  if (!detectedCount) throw new Error("No PDF pages found");
  const count = Math.min(500, detectedCount);
  return {
    titles: Array.from({ length: count }, (_, index) => "Slide " + (index + 1)),
    steps: Array.from({ length: count }, () => []),
    officeIds: Array.from({ length: count }, () => ""),
  };
}

const pptxBufferCacheV69 = new Map<string, ArrayBuffer>();

async function loadPptxBufferV69(url: string, signal: AbortSignal) {
  const cached = pptxBufferCacheV69.get(url);
  if (cached) return cached;
  if (pptxBufferCacheV69.size >= 2) pptxBufferCacheV69.delete(pptxBufferCacheV69.keys().next().value || "");
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("เปิดไฟล์ Process ไม่สำเร็จ (HTTP " + response.status + ")");
  const buffer = await response.arrayBuffer();
  pptxBufferCacheV69.set(url, buffer);
  return buffer;
}

function PptxSlidePreviewV69({ meta }: { meta: ProcessReferenceMeta }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !meta.fileUrl) return;
    const controller = new AbortController();
    let disposed = false;
    let viewer: { destroy: () => void; renderSlide: (index?: number) => Promise<void>; slideCount: number } | null = null;
    container.replaceChildren();
    setState("loading");
    setErrorMessage("");

    void (async () => {
      try {
        const [buffer, renderer] = await Promise.all([
          loadPptxBufferV69(meta.fileUrl, controller.signal),
          import("@aiden0z/pptx-renderer/browser"),
        ]);
        if (disposed) return;
        viewer = await renderer.PptxViewer.open(buffer.slice(0), container, {
          fitMode: "contain",
          renderMode: "slide",
          zipLimits: renderer.RECOMMENDED_ZIP_LIMITS,
          lazyMedia: true,
          lazySlides: true,
          pdfjs: false,
          signal: controller.signal,
        });
        const slideIndex = Math.max(0, meta.slideNumber - 1);
        if (slideIndex >= viewer.slideCount) throw new Error("ไม่พบ Slide " + meta.slideNumber + " ในไฟล์ Version นี้");
        await viewer.renderSlide(slideIndex);
        if (!disposed) setState("ready");
      } catch (error) {
        if (disposed || controller.signal.aborted) return;
        console.error("Render Process PPTX slide failed", error);
        setErrorMessage(error instanceof Error ? error.message : "เปิดสไลด์ไม่สำเร็จ");
        setState("error");
      }
    })();

    return () => {
      disposed = true;
      controller.abort();
      viewer?.destroy();
      container.replaceChildren();
    };
  }, [meta.fileUrl, meta.slideNumber]);

  return (
    <div className="relative flex h-[78vh] min-h-[360px] w-full items-center justify-center overflow-auto rounded-xl border border-slate-200 bg-slate-900 p-2 sm:p-4">
      {state === "loading" ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/95 text-sm font-black text-white">กำลังเปิด Slide {meta.slideNumber}...</div> : null}
      {state === "error" ? (
        <div className="max-w-lg rounded-2xl border border-rose-300 bg-rose-50 p-6 text-center">
          <div className="text-base font-black text-rose-900">เปิด Slide {meta.slideNumber} ไม่สำเร็จ</div>
          <div className="mt-2 text-xs font-semibold leading-5 text-rose-700">{errorMessage}</div>
        </div>
      ) : null}
      <div ref={containerRef} className={`w-full transition-opacity ${state === "ready" ? "opacity-100" : "pointer-events-none opacity-0"}`} />
    </div>
  );
}

function ProcessSlideModalV68({ meta, onClose }: { meta: ProcessReferenceMeta | null; onClose: () => void }) {
  useEffect(() => {
    if (!meta) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [meta, onClose]);

  if (!meta) return null;
  const isPptx = meta.fileType === "pptx" || meta.fileType === "ppt" || /\.pptx?(?:$|[?#])/i.test(meta.fileUrl);
  const src = previewUrl(meta);
  return (
    <div role="dialog" aria-modal="true" aria-label={`Slide ${meta.slideNumber} ${meta.slideTitle}`} className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-950/75 p-3 sm:p-6" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <div className="flex max-h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-[22px] border border-violet-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-violet-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">Process Slide</div>
            <div className="truncate text-base font-black text-slate-950">Slide {meta.slideNumber} - {meta.slideTitle}</div>
            <div className="mt-0.5 text-xs font-semibold text-slate-500">{meta.processName} · v{meta.versionLabel} · {meta.step || "ทั้งสไลด์"}</div>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl font-black text-slate-600 hover:bg-slate-50" aria-label="ปิด">×</button>
        </div>
        <div className="min-h-0 flex-1 bg-slate-100 p-2 sm:p-3">
          {isPptx && meta.fileUrl ? (
            <PptxSlidePreviewV69 meta={meta} />
          ) : src ? (
            <iframe key={src} src={src} title={"Process Slide " + meta.slideNumber} allowFullScreen className="h-[78vh] w-full rounded-xl border border-slate-200 bg-white" />
          ) : (
            <div className="flex h-[70vh] flex-col items-center justify-center rounded-xl border border-dashed border-amber-300 bg-amber-50 p-6 text-center">
              <div className="text-4xl" aria-hidden="true">📄</div>
              <div className="mt-3 text-base font-black text-amber-900">ไม่พบไฟล์จริงของ Process Version นี้</div>
              <div className="mt-1 text-sm font-semibold text-amber-800">จึงยังไม่สามารถเปิด Slide {meta.slideNumber} ได้</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProcessReferenceSelector({ value, onChange, currentUser }: { value: string; onChange: (value: string) => void; currentUser?: any }) {
  const parsedRefs = useMemo(() => parseProcessReferenceListV68(value), [value]);
  const [current, setCurrent] = useState<ProcessVersion>(() => builtInVersionV68());
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadAnalyzing, setUploadAnalyzing] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadIndex, setUploadIndex] = useState<ProcessUploadIndex | null>(null);
  const [message, setMessage] = useState("");
  const [previewMeta, setPreviewMeta] = useState<ProcessReferenceMeta | null>(null);

  useEffect(() => {
    const services = firebaseServices();
    if (!services) {
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(
      collection(services.db, PROCESS_COLLECTION),
      (result) => {
        const rows = result.docs.map((entry) => ({ id: entry.id, ...(entry.data() as any) }));
        setCurrent(currentProcessVersionV69(rows) || builtInVersionV68());
        setLoading(false);
      },
      (error) => {
        console.error("Load current Process version failed", error);
        setCurrent(builtInVersionV68());
        setLoading(false);
      }
    );
  }, []);

  const firstSaved = parsedRefs[0] || null;
  const historical = Boolean(firstSaved && firstSaved.versionId && firstSaved.versionId !== current.id);
  const active: ProcessVersion = historical
    ? ({
        id: firstSaved!.versionId,
        name: firstSaved!.processName,
        versionLabel: firstSaved!.versionLabel,
        fileName: "",
        fileUrl: firstSaved!.fileUrl,
        fileType: (["pdf", "pptx", "ppt", "other"].includes(firstSaved!.fileType)
          ? firstSaved!.fileType
          : fileType(firstSaved!.fileUrl)) as ProcessVersion["fileType"],
        slideCount: Math.max(...parsedRefs.map((item) => item.slideNumber || 1), 1),
        slideTitles: Array.from({ length: Math.max(...parsedRefs.map((item) => item.slideNumber || 1), 1) }, (_, index) => parsedRefs.find((item) => item.slideNumber === index + 1)?.slideTitle || "Slide " + (index + 1)),
        slideSteps: Array.from({ length: Math.max(...parsedRefs.map((item) => item.slideNumber || 1), 1) }, (_, index) => {
          const saved = parsedRefs.find((item) => item.slideNumber === index + 1)?.step;
          return saved ? [saved] : [];
        }),
        slideOfficeIds: Array.from({ length: Math.max(...parsedRefs.map((item) => item.slideNumber || 1), 1) }, (_, index) => parsedRefs.find((item) => item.slideNumber === index + 1)?.slideOfficeId || ""),
        uploadedAt: "",
        uploadedBy: "",
        status: "archived",
      } satisfies ProcessVersion)
    : current;

  const writeRefs = (refs: ProcessReferenceMeta[]) => onChange(serializeProcessReferenceListV68(refs));

  const addSlide = (slideNumber: number) => {
    if (!slideNumber || parsedRefs.some((item) => item.slideNumber === slideNumber)) return;
    const options = stepsForSlideV68(active, slideNumber);
    const defaultStep = options[0] || "ทั้งสไลด์";
    writeRefs([...parsedRefs, fromVersion(active, slideNumber, defaultStep)].sort((a, b) => a.slideNumber - b.slideNumber));
  };

  const updateStep = (slideNumber: number, nextStep: string) => {
    writeRefs(parsedRefs.map((item) => item.slideNumber === slideNumber ? { ...item, step: nextStep } : item));
  };

  const removeSlide = (slideNumber: number) => {
    writeRefs(parsedRefs.filter((item) => item.slideNumber !== slideNumber));
  };

  const handleChooseFile = async (file: File | null) => {
    setUploadFile(file);
    setUploadIndex(null);
    if (!file) { setMessage(""); return; }
    setUploadAnalyzing(true);
    setMessage("กำลังอ่านข้อมูล Process จากไฟล์...");
    try {
      const indexed = await analyzeProcessUploadV68(file);
      if (!indexed.titles.length) throw new Error("No slides found");
      setUploadIndex(indexed);
      setMessage("อ่านไฟล์สำเร็จ · พบ " + indexed.titles.length + " Slides");
    } catch (error) {
      console.error("Analyze Process upload failed", error);
      setMessage("อ่านจำนวน Slide อัตโนมัติไม่สำเร็จ กรุณาเลือกไฟล์ PDF หรือ PPTX ใหม่");
    } finally {
      setUploadAnalyzing(false);
    }
  };

  const upload = async () => {
    if (!uploadFile || !uploadIndex?.titles.length || uploadBusy || uploadAnalyzing) return;
    const services = firebaseServices();
    if (!services) { setMessage("Firebase ยังไม่พร้อม จึงยังอัปโหลด Process ไม่ได้"); return; }
    setUploadBusy(true);
    setMessage("กำลังอัปโหลด Process version ใหม่...");
    try {
      const id = makeVersionId(uploadFile.name);
      const uploadedAt = new Date().toISOString();
      const versionLabel = uploadedAt.slice(0, 16).replace(/-/g, ".").replace("T", "-").replace(":", ".");
      const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const target = storageRef(services.storage, "qa-process/" + id + "/" + safeName);
      await uploadBytes(target, uploadFile, { contentType: uploadFile.type || undefined });
      const fileUrl = await getDownloadURL(target);
      const existing = await getDocs(collection(services.db, PROCESS_COLLECTION));
      const processName = uploadFile.name.replace(/\.[^.]+$/, "").replace(/\s*\(\d+\)\s*$/, "").trim() || "Process";
      const batch = writeBatch(services.db);
      existing.docs.forEach((entry) => {
        if ((entry.data() as any).status === "current") batch.set(entry.ref, { status: "archived" }, { merge: true });
      });
      batch.set(doc(services.db, PROCESS_COLLECTION, id), {
        name: processName,
        versionLabel,
        fileName: uploadFile.name,
        fileUrl,
        fileType: fileType(uploadFile.name),
        slideCount: uploadIndex.titles.length,
        slideTitles: uploadIndex.titles,
        slideSteps: uploadIndex.steps,
        slideOfficeIds: uploadIndex.officeIds,
        uploadedAt,
        uploadedBy: String(currentUser?.username || currentUser?.displayName || "QA"),
        status: "current",
      });
      await batch.commit();
      setMessage("อัปโหลดสำเร็จ · " + uploadIndex.titles.length + " Slides · เริ่มนับ Slide 1 ใหม่แล้ว");
      setUploadOpen(false);
      setUploadFile(null);
      setUploadIndex(null);
      onChange("");
    } catch (error) {
      console.error("Process upload failed", error);
      setMessage("อัปโหลด Process ไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setUploadBusy(false);
    }
  };

  const usedSlides = new Set(parsedRefs.map((item) => item.slideNumber));
  const autoName = uploadFile ? uploadFile.name.replace(/\.[^.]+$/, "").replace(/\s*\(\d+\)\s*$/, "").trim() : "-";

  return (
    <div className="mt-2 overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50 shadow-inner">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-100 px-4 py-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">Process Library</div>
          <div className="mt-1 text-sm font-black text-slate-950">{loading ? "กำลังโหลด..." : active.name + " · v" + active.versionLabel}</div>
          <div className="mt-0.5 text-xs font-semibold text-slate-500">{historical ? "Historical version · ล็อกตามเคสเดิม" : "Current version · " + active.slideCount + " slides"}</div>
        </div>
        {!historical ? (
          <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setUploadOpen((open) => !open); }} className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-700 shadow-sm transition hover:bg-violet-50">
            Upload New Process
          </button>
        ) : null}
      </div>

      {uploadOpen && !historical ? (
        <div className="border-b border-violet-100 bg-white px-4 py-4">
          <div className={`grid gap-3 ${uploadFile ? "md:grid-cols-3" : ""}`}>
            {uploadFile ? (
              <>
                <label className="min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Version Name</span>
                  <input readOnly aria-readonly="true" value={autoName || "-"} title={autoName} className="mt-1.5 h-11 w-full min-w-0 truncate rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm font-bold text-slate-800 outline-none" />
                </label>
                <label className="min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Slides</span>
                  <input readOnly aria-readonly="true" value={uploadAnalyzing ? "กำลังอ่าน..." : String(uploadIndex?.titles.length || "-")} className="mt-1.5 h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm font-bold text-slate-800 outline-none" />
                </label>
              </>
            ) : null}
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Process File</div>
              <label className="mt-1.5 flex h-11 min-w-0 cursor-pointer items-center gap-2 overflow-hidden rounded-xl border border-slate-300 bg-slate-50 px-2.5 transition hover:border-violet-300 hover:bg-violet-50">
                <span className="max-w-[112px] shrink-0 truncate rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-black text-white">Choose File</span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-600" title={uploadFile?.name || ""}>{uploadFile?.name || "PDF หรือ PPTX"}</span>
                <input type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="hidden" onChange={(event) => { void handleChooseFile(event.target.files?.[0] || null); event.currentTarget.value = ""; }} />
              </label>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[11px] font-semibold leading-5 text-slate-500">Version Name และ Slides จะแสดงหลังเลือกไฟล์และแก้ไขเองไม่ได้</div>
            <button type="button" onClick={upload} disabled={!uploadFile || !uploadIndex?.titles.length || uploadBusy || uploadAnalyzing} className="h-11 shrink-0 rounded-xl bg-violet-700 px-5 text-xs font-black text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300">
              {uploadAnalyzing ? "กำลังอ่านไฟล์..." : uploadBusy ? "กำลังอัปโหลด..." : "Set Current"}
            </button>
          </div>
        </div>
      ) : null}

      {message ? <div className="border-b border-violet-100 bg-violet-50 px-4 py-2 text-xs font-bold text-violet-800">{message}</div> : null}

      {!historical ? (
        <div className="border-b border-violet-100 p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">เพิ่ม Slide ที่ใช้เทียบ</div>
          <select value="" disabled={loading} onChange={(event) => addSlide(Number(event.target.value || 0))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold disabled:cursor-wait disabled:bg-slate-100">
            <option value="">{loading ? "กำลังโหลด Current Version..." : "เลือก Slide เพิ่มได้หลายรายการ..."}</option>
            {active.slideTitles.map((title, index) => (
              <option key={index + 1} value={index + 1} disabled={usedSlides.has(index + 1)}>Slide {index + 1} — {title}</option>
            ))}
          </select>
          <div className="mt-1.5 text-[11px] font-semibold text-slate-500">เลือกทีละ Slide ได้หลาย Slide ระบบจะสร้าง “ข้อที่ใช้เทียบ” จากข้อมูลของ Slide นั้นอัตโนมัติ</div>
        </div>
      ) : null}

      <div className="space-y-2 p-4">
        {parsedRefs.length ? parsedRefs.map((meta) => {
          const stepOptions = stepsForSlideV68(active, meta.slideNumber);
          const options = stepOptions.includes(meta.step) ? stepOptions : [...stepOptions, meta.step].filter(Boolean);
          return (
            <div key={meta.versionId + "-" + meta.slideNumber} className="rounded-xl border border-violet-100 bg-white px-3 py-3 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-xs font-black text-violet-800">Slide {meta.slideNumber}</div>
                  <div className="mt-0.5 truncate text-sm font-black text-slate-950" title={meta.slideTitle}>{meta.slideTitle}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => setPreviewMeta(meta)} className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700 hover:bg-violet-100">ดูสไลด์</button>
                  {!historical ? <button type="button" onClick={() => removeSlide(meta.slideNumber)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-sm font-black text-rose-700 hover:bg-rose-100" aria-label="ลบ Slide">×</button> : null}
                </div>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
                <div className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">ข้อที่ใช้เทียบ</div>
                <select value={meta.step || "ทั้งสไลด์"} disabled={historical} onChange={(event) => updateStep(meta.slideNumber, event.target.value)} className="h-10 min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold disabled:bg-slate-100">
                  {options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
            </div>
          );
        }) : (
          <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/60 px-4 py-5 text-center text-xs font-semibold text-slate-500">ยังไม่ได้เลือก Slide ที่ใช้เทียบ</div>
        )}
      </div>

      <ProcessSlideModalV68 meta={previewMeta} onClose={() => setPreviewMeta(null)} />
    </div>
  );
}

export function ProcessReferenceDisplay({ value, className = "" }: { value: string; className?: string }) {
  const refs = useMemo(() => parseProcessReferenceListV68(value), [value]);
  const [previewMeta, setPreviewMeta] = useState<ProcessReferenceMeta | null>(null);
  if (!refs.length) return <div className={"whitespace-pre-line text-[14px] leading-6 text-slate-800 " + className}>{String(value || "-")}</div>;
  const first = refs[0];
  return (
    <div className={className}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Process</div>
          <div className="mt-0.5 truncate text-sm font-black text-slate-950" title={first.processName}>{first.processName}</div>
        </div>
        <div className="shrink-0 text-xs font-bold text-violet-700">Version {first.versionLabel || "-"}</div>
      </div>
      <div className="mt-3 space-y-2">
        {refs.map((meta) => (
          <div key={meta.versionId + "-" + meta.slideNumber} className="flex flex-col gap-2 rounded-xl border border-violet-100 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-black text-violet-800">Slide {meta.slideNumber}</div>
              <div className="mt-0.5 truncate text-sm font-extrabold text-slate-900" title={meta.slideTitle}>{meta.slideTitle}</div>
              <div className="mt-1 text-xs font-bold text-slate-500">{meta.step || "ทั้งสไลด์"}</div>
            </div>
            <button type="button" onClick={() => setPreviewMeta(meta)} className="shrink-0 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700 shadow-sm transition hover:bg-violet-100">ดูสไลด์</button>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[11px] font-semibold text-slate-500">ใช้ไฟล์จาก Version ที่บันทึกพร้อมผลประเมินเคสนี้</div>
      <ProcessSlideModalV68 meta={previewMeta} onClose={() => setPreviewMeta(null)} />
    </div>
  );
}
