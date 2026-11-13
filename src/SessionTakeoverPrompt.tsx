import React from "react";
import { TAKEOVER_STATE } from "./sessionTakeoverPolicy.mjs";

export type TakeoverPromptProps = {
  deviceLabel: string;
  browserLabel: string;
  status: string;
  deadlineSeconds?: number;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
};

export default function SessionTakeoverPrompt({
  deviceLabel,
  browserLabel,
  status,
  deadlineSeconds = 30,
  onConfirm,
  onCancel,
  busy = false,
}: TakeoverPromptProps) {
  const saving = status === TAKEOVER_STATE.flushing;
  const blocked = status === TAKEOVER_STATE.unsynced;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="qa-takeover-heading"
      className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
      <h2 id="qa-takeover-heading" className="text-lg font-semibold text-slate-900">
        บัญชีนี้กำลังใช้งานอยู่บนอุปกรณ์อื่น
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        พบ Session ที่กำลังใช้งานบน {deviceLabel || "อุปกรณ์อื่น"} ({browserLabel || "Browser อื่น"})
      </p>
      {saving ? (
        <p role="status" className="mt-4 rounded-lg bg-slate-100 p-3 text-sm">
          กำลังรอให้เครื่องเดิมบันทึกแบบร่าง (สูงสุด {deadlineSeconds} วินาที)
        </p>
      ) : blocked ? (
        <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          เครื่องเดิมยังไม่ยืนยันการบันทึกแบบร่าง จึงยังไม่อนุญาตให้ย้าย Session
          เพื่อป้องกันข้อมูลสูญหาย กรุณากลับไปบันทึกงานที่เครื่องเดิมก่อน
        </p>
      ) : (
        <p className="mt-4 text-sm text-slate-600">
          หากยืนยัน ระบบจะขอให้เครื่องเดิมบันทึกแบบร่างก่อน แล้วจึงสลับการใช้งานมายังเครื่องนี้
        </p>
      )}
      <div className="mt-5 grid gap-2">
        <button type="button" disabled={busy || saving || blocked} onClick={onConfirm}
          className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-50">
          ยืนยันเข้าสู่ระบบบนเครื่องนี้
        </button>
        <button type="button" disabled={busy} onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-2 text-slate-800 disabled:opacity-50">
          ยกเลิก — ใช้งานเครื่องเดิมต่อ
        </button>
      </div>
    </div>
  );
}
