import React from "react";
import { appealWorkflowLabel, appealWorkflowStatus, appealWorkflowTone, type AppealWorkflowRequest } from "./appealWorkflow";

export default function AppealWorkflowNotice({ request, canReview, isOwner, busy, onCaseDetail, onDecision, onReview }: {
  request: AppealWorkflowRequest & { additionalAccessRequest?: (AppealWorkflowRequest["additionalAccessRequest"] & { reason?: string; topics?: string[]; decisionReason?: string }) };
  canReview: boolean; isOwner: boolean; busy: boolean;
  onCaseDetail: () => void; onDecision: (approved: boolean) => void; onReview: () => void;
}) {
  const status = appealWorkflowStatus(request);
  const guidance: Record<string, string> = {
    Pending: canReview ? "ตรวจเหตุผลและหลักฐานที่ยื่น แล้วบันทึกผลพิจารณารายหัวข้อ" : "ยื่นอุทธรณ์แล้ว รอ QA ตรวจสอบเหตุผลและหลักฐาน",
    "Request Additional Appeal": canReview ? "ตรวจหัวข้อและเหตุผลที่ขอยื่นเพิ่ม แล้วเลือกอนุญาตหรือไม่อนุญาต" : "ส่งคำขอยื่นเพิ่มแล้ว รอ QA อนุมัติสิทธิ์",
    "Awaiting Additional Submission": isOwner ? "กด ยื่นอุทธรณ์เพิ่มเติม เพื่อกรอกเหตุผลและแนบหลักฐานภายใน 3 วันหลัง QA อนุมัติ" : "รอเจ้าของเคสยื่นเหตุผลและหลักฐานภายใน 3 วันหลังอนุมัติ เมื่อยื่นแล้วเคสจะเข้าคิว QA พิจารณา",
    "Pending (Additional)": canReview ? "เจ้าของเคสยื่นเพิ่มแล้ว ตรวจเหตุผลและหลักฐานรอบนี้ แล้วบันทึกผลพิจารณา" : "ยื่นเหตุผลและหลักฐานเพิ่มเติมแล้ว รอ QA พิจารณารอบนี้",
    "Approved (Access)": canReview ? "คำอนุมัติเดิมยังไม่มีรอบยื่นเพิ่ม กดเปิดสิทธิ์ที่ค้าง ระบบใช้เวลาอนุมัติเดิมในการนับ 3 วัน" : "QA อนุมัติแล้ว แต่สิทธิ์ยื่นยังเปิดไม่ครบ QA ต้องเปิดสิทธิ์ที่ค้างก่อน",
    "Additional Request Rejected": "QA ไม่อนุญาตคำขอยื่นเพิ่ม ดูเหตุผลด้านล่างได้",
    "Cancelled (Additional)": "รอบเพิ่มเติมถูกยกเลิกแล้ว สามารถดูผลรอบก่อนและประวัติได้",
    "Expired (Additional)": "ครบ 3 วันหลังเปิดสิทธิ์โดยยังไม่ได้ยื่นเพิ่ม รอบนี้สิ้นสุดแล้ว",
    Reset: "คำขอถูกรีเซ็ตแล้ว เปิด Case Detail เพื่อตรวจสิทธิ์ยื่นอุทธรณ์อีกครั้ง",
  };
  const deadline = request.additionalRound?.expiresAt;
  return <section aria-label="ขั้นตอนอุทธรณ์ปัจจุบัน" className={`my-4 rounded-2xl border p-4 ${appealWorkflowTone(status)}`}>
    <div className="text-sm font-extrabold">{appealWorkflowLabel(status)}</div>
    <p className="mt-2 text-sm leading-6">{guidance[status] || "พิจารณาเรียบร้อยแล้ว ดูผลรายหัวข้อและประวัติของเคสได้"}</p>
    {deadline && !request.additionalRound?.submitted ? <p className="mt-2 text-sm font-bold">หมดเขตยื่นเพิ่ม: {new Date(deadline).toLocaleString("en-GB", { timeZone: "Asia/Bangkok", hour12: false }).replace(",", "")}</p> : null}
    {request.additionalAccessRequest?.reason && ["Request Additional Appeal", "Additional Request Rejected", "Approved (Access)"].includes(status) ? <div className="mt-2 whitespace-pre-wrap text-sm leading-6">หัวข้อที่ขอ: {request.additionalAccessRequest.topics?.join(", ") || "-"}<br />{request.additionalAccessRequest.reason}</div> : null}
    {status === "Additional Request Rejected" && request.additionalAccessRequest?.decisionReason ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6">เหตุผลจาก QA: {request.additionalAccessRequest.decisionReason}</p> : null}
    <div className="mt-3 flex flex-wrap gap-2">
      {canReview && status === "Request Additional Appeal" ? <>
        <button type="button" disabled={busy} onClick={() => onDecision(true)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">อนุญาตให้ยื่นเพิ่ม (3 วัน)</button>
        <button type="button" disabled={busy} onClick={() => onDecision(false)} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">ไม่อนุญาตให้ยื่นเพิ่ม</button>
      </> : null}
      {canReview && status === "Approved (Access)" ? <button type="button" disabled={busy} onClick={() => onDecision(true)} className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">เปิดสิทธิ์ที่อนุมัติค้าง</button> : null}
      {canReview && ["Pending", "Pending (Additional)"].includes(status) ? <button type="button" disabled={busy} onClick={onReview} className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">พิจารณาอุทธรณ์</button> : null}
      {isOwner && status === "Awaiting Additional Submission" ? <button type="button" disabled={busy} onClick={onCaseDetail} className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">ยื่นอุทธรณ์เพิ่มเติม</button> : null}
    </div>
  </section>;
}
