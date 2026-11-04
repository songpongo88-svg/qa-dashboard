import React, { useEffect, useMemo, useRef, useState } from "react";
import { ProcessSlidePickerPortal } from "./ProcessSlidePickerPortal";

export type ManagedProcessFile = {
  id: string;
  name: string;
  versionLabel: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  slideCount: number;
  uploadedAt: string;
  uploadedBy: string;
  status: "current" | "archived";
  hiddenFromPicker: boolean;
};

type Props = {
  files: ManagedProcessFile[];
  busyId: string;
  message: string;
  referencedIds: string[];
  protectedFileId: string;
  canHideSystemProcess: boolean;
  onClose: () => void;
  onPreview: (file: ManagedProcessFile) => void;
  onChangeVisibility: (file: ManagedProcessFile, hidden: boolean) => void;
};

function uploadedDate(value: string) {
  if (!value || Number.isNaN(Date.parse(value))) return "-";
  return new Date(value).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function ProcessFileManager({
  files, busyId, message, referencedIds, protectedFileId, canHideSystemProcess, onClose, onPreview, onChangeVisibility,
}: Props) {
  const [search, setSearch] = useState("");
  const [includeRemoved, setIncludeRemoved] = useState(true);
  const [pendingChange, setPendingChange] = useState<{ file: ManagedProcessFile; hidden: boolean } | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (pendingChange) cancelRef.current?.focus(); }, [pendingChange]);
  const availableCount = files.filter(item => !item.hiddenFromPicker).length;
  const hiddenCount = files.length - availableCount;
  const results = useMemo(() => files.filter((item) => {
    if (!includeRemoved && item.hiddenFromPicker) return false;
    const q = search.trim().toLowerCase();
    return !q || [item.name, item.fileName, item.versionLabel, item.uploadedBy]
      .some(value => String(value || "").toLowerCase().includes(q));
  }), [files, search, includeRemoved]);
  const referenced = new Set(referencedIds);

  return (
    <ProcessSlidePickerPortal onClose={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Process File Management"
        className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/70 p-3 sm:p-6"
        onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
        <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-sky-200 bg-white shadow-2xl">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sky-100 bg-gradient-to-r from-sky-50 to-violet-50 px-5 py-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-700">Process Library</div>
              <h2 className="mt-1 text-xl font-black text-slate-950">Process File Management</h2>
              <p className="mt-1 text-xs font-semibold text-slate-600">
                ดูไฟล์ / นำออกจากรายการเลือก / Restore โดยไม่ลบไฟล์ต้นฉบับหรือข้อมูลอ้างอิงของเคสเก่า
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="ปิด Process File Management"
              className="h-10 w-10 rounded-xl border border-slate-200 bg-white text-xl font-black text-slate-700 hover:bg-slate-50">×</button>
          </div>
          <div className="space-y-3 border-b border-slate-100 px-5 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <input aria-label="ค้นหา Process File" value={search} onChange={event => setSearch(event.target.value)}
                placeholder="ค้นหาชื่อไฟล์ / Version / ผู้อัปโหลด..."
                className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold outline-none focus:border-sky-400" />
              <label className="flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-700">
                <input type="checkbox" checked={includeRemoved} onChange={event => setIncludeRemoved(event.target.checked)}
                  className="h-4 w-4 accent-sky-700" />
                แสดงไฟล์ที่นำออกแล้ว
              </label>
            </div>
            <div className="text-[11px] font-bold text-slate-500">
              {availableCount} ไฟล์ในคลัง · {hiddenCount} ไฟล์ที่นำออก
            </div>
            {message ? <div role="status" className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800">{message}</div> : null}
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/70 px-5 py-4">
            {results.map((item) => (
              <div key={item.id} data-process-managed-version={item.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="break-words text-sm font-black text-slate-950">{item.name}</div>
                    <div className="break-all text-xs font-semibold text-slate-600">{item.fileName || "System Process"}</div>
                    <div className="text-[11px] text-slate-500">
                      Version {item.versionLabel} · {item.slideCount} Slides · {item.fileType.toUpperCase()}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      อัปโหลด: {uploadedDate(item.uploadedAt)} · {item.uploadedBy || "-"}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className={"rounded-full px-2.5 py-1 text-[10px] font-black " +
                        (item.hiddenFromPicker ? "bg-rose-50 text-rose-700" :
                         item.status === "current" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                        {item.hiddenFromPicker ? "Removed from choices" : item.status === "current" ? "Current" : "Archived"}
                      </span>
                      {referenced.has(item.id) ? (
                        <span className="text-[10px] font-bold text-violet-700">อ้างอิงในฟอร์มปัจจุบัน</span>
                      ) : null}
                      {item.id === protectedFileId ? (
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">System Process · เก็บไฟล์ต้นฉบับไว้</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" onClick={() => onPreview(item)}
                      disabled={!item.fileUrl || busyId !== ""}
                      className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-[#155B83] hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-40">
                      View File
                    </button>
                    {item.id !== protectedFileId || item.hiddenFromPicker || canHideSystemProcess ? (
                      <button type="button" disabled={Boolean(busyId)}
                        onClick={() => setPendingChange({ file: item, hidden: !item.hiddenFromPicker })}
                        title={item.hiddenFromPicker ? "นำไฟล์กลับเข้ารายการเลือก" : "ซ่อนไฟล์จากรายการเลือกโดยไม่ลบต้นฉบับ"}
                        className={"rounded-xl border px-3 py-2 text-xs font-black disabled:cursor-wait disabled:opacity-50 " +
                          (item.hiddenFromPicker
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                            : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100")}>
                        {busyId === item.id ? "กำลังบันทึก..." : item.hiddenFromPicker ? "Restore" : "Remove"}
                      </button>
                    ) : (
                      <span className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] font-semibold text-amber-800"
                        title="ต้องมี Process ที่เลือกได้อย่างน้อยหนึ่งไฟล์">ต้องมีไฟล์สำรองก่อนซ่อน</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {!results.length ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-semibold text-slate-500">
                ไม่พบ Process File ตามเงื่อนไขที่เลือก
              </div>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3">
            <div className="text-[11px] font-semibold text-slate-500">ข้อมูลเคสเดิมยังเก็บ Process Version และ Slide ที่ใช้เทียบไว้</div>
            <button type="button" onClick={onClose}
              className="rounded-xl bg-[#155B83] px-4 py-2 text-xs font-black text-white hover:bg-[#104A6B]">ปิด</button>
          </div>
        </div>
      </div>
      {pendingChange ? (
        <div className="fixed inset-0 z-[280] flex items-center justify-center bg-slate-950/70 p-4"
          role="alertdialog" aria-modal="true" aria-labelledby="process-confirm-title"
          aria-describedby="process-confirm-description"
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") { event.preventDefault(); setPendingChange(null); }
          }}>
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start gap-3">
              <div className={"flex h-11 w-11 shrink-0 items-center justify-center rounded-xl " +
                (pendingChange.hidden ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700")}>
                <span aria-hidden="true" className="text-xl">{pendingChange.hidden ? "−" : "+"}</span>
              </div>
              <div className="min-w-0">
                <h3 id="process-confirm-title" className="text-lg font-black text-slate-950">
                  {pendingChange.hidden ? "ยืนยันการซ่อนไฟล์ Process" : "ยืนยันการคืนไฟล์ Process"}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {pendingChange.hidden
                    ? "ต้องการนำไฟล์นี้ออกจากรายการเลือก Process ใช่หรือไม่?"
                    : "ต้องการนำไฟล์นี้กลับเข้ารายการเลือก Process ใช่หรือไม่?"}
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="break-words text-sm font-black text-slate-950">{pendingChange.file.name}</div>
              <div className="mt-1 break-all text-xs text-slate-600">{pendingChange.file.fileName || "System Process"}</div>
              <div className="mt-1 text-xs text-slate-600">Version {pendingChange.file.versionLabel} · {pendingChange.file.slideCount} Slides</div>
            </div>
            <p id="process-confirm-description" className="mt-4 text-xs font-semibold leading-6 text-slate-700">
              ไฟล์ต้นฉบับและการอ้างอิงของเคสเก่าจะไม่ถูกลบ สามารถกด Restore เพื่อนำไฟล์กลับมาได้ทุกเมื่อ
              {pendingChange.file.id === protectedFileId
                ? " · ไฟล์ System Process จะยังเก็บไว้เป็นข้อมูลสำรองสำหรับเคสเก่า"
                : ""}
            </p>
            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button ref={cancelRef} type="button" onClick={() => setPendingChange(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50">
                ยกเลิก
              </button>
              <button type="button" disabled={Boolean(busyId)}
                onClick={() => {
                  if (busyId) return;
                  const { file, hidden } = pendingChange;
                  setPendingChange(null);
                  onChangeVisibility(file, hidden);
                }}
                className={"rounded-xl px-4 py-2.5 text-sm font-black text-white shadow-sm disabled:opacity-50 " +
                  (pendingChange.hidden ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-700 hover:bg-emerald-800")}>
                {pendingChange.hidden ? "ยืนยันซ่อนไฟล์" : "ยืนยัน Restore"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ProcessSlidePickerPortal>
  );
}

export default ProcessFileManager;
