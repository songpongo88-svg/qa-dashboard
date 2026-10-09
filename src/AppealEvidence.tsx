import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { appealEvidenceDisplayName } from "./appealEvidenceNaming";

export type EvidenceWatermarkType = "qa" | "appeal";
export type AppealEvidenceImage = { id: string; name: string; size: number; width: number; height: number; url: string; watermarked?: boolean; watermarkType?: EvidenceWatermarkType };
export const APPEAL_IMAGE_LIMIT = 5;
export const APPEAL_IMAGE_BYTES = 1024 * 1024;

export function evidenceWatermarkLines(caseId: string, type: EvidenceWatermarkType): [string, string] {
  return [
    type === "appeal" ? "ใช้สำหรับเป็นหลักฐานส่งพิจารณายื่นอุทธรณ์" : "ใช้สำหรับเป็นหลักฐานประเมินเคส QA",
    `Case ID: ${String(caseId || "").trim().toUpperCase()}`,
  ];
}

// Paint the established diagonal 16%-opacity watermark into the uploaded JPEG itself.
// The same saved file is then used for thumbnails, previews, PDFs, and downloads.
export async function resizeAppealImage(
  file: File,
  caseId: string,
  watermarkType: EvidenceWatermarkType = "appeal"
): Promise<{ blob: Blob; width: number; height: number }> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("รองรับรูป JPG, PNG และ WEBP");
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("ต้นฉบับต้องไม่เกิน 20 MB/รูป");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode().catch(() => { throw new Error("อ่านรูปไม่สำเร็จ กรุณาเลือกรูปใหม่"); });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("รูปภาพไม่ถูกต้อง");
    await document.fonts?.load('700 14px Kanit').catch(() => undefined);
    const [purpose, caseLabel] = evidenceWatermarkLines(caseId, watermarkType);
    let scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    for (let pass = 0; pass < 5; pass++) {
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("เบราว์เซอร์ไม่รองรับการย่อรูป");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);

      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = "#92263c";
      ctx.font = "700 14px Kanit, 'Noto Sans Thai', sans-serif";
      // Match the original 420 × 112 CSS-pixel SVG tile, rotated -34 degrees.
      ctx.translate(width / 2, height / 2);
      ctx.rotate(-34 * Math.PI / 180);
      const extent = Math.hypot(width, height) + 600;
      for (let x = -extent; x <= extent; x += 420) {
        for (let y = -extent; y <= extent; y += 112) {
          ctx.fillText(purpose, x + 10, y + 35);
          ctx.fillText(caseLabel, x + 10, y + 59);
        }
      }
      ctx.restore();
      for (const quality of [0.9, 0.8, 0.7, 0.6]) {
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
          b => b ? resolve(b) : reject(new Error("ย่อรูปไม่สำเร็จ")), "image/jpeg", quality));
        if (blob.size <= APPEAL_IMAGE_BYTES) return { blob, width, height };
      }
      scale *= 0.8;
    }
    throw new Error("ไม่สามารถย่อรูปให้ต่ำกว่า 1 MB ได้ กรุณาเลือกรูปใหม่");
  } finally { URL.revokeObjectURL(objectUrl); }
}

export async function uploadAppealImage(file: File, caseId: string, topicCode: string): Promise<AppealEvidenceImage> {
  const { blob, width, height } = await resizeAppealImage(file, caseId, "appeal");
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("อ่านรูปไม่สำเร็จ"));
    reader.readAsDataURL(blob);
  });
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  let response: Response;
  try { response = await fetch("/api/google-drive-upload", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadKind: "appeal-image", fileName: name, contentType: "image/jpeg", caseId: "appeal-" + caseId + "-" + topicCode, dataBase64 }),
    signal: AbortSignal.timeout(60000),
  }); } catch (error) {
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
      throw new Error("อัปโหลดรูปใช้เวลานานเกินไป กดลองอัปโหลดอีกครั้ง");
    }
    throw new Error("เชื่อมต่ออัปโหลดรูปไม่ได้ ตรวจการเชื่อมต่อแล้วกดลองอัปโหลดอีกครั้ง");
  }
  const data = await response.json().catch(() => ({}));
  const id = String(data.id || "").trim();
  if (!response.ok) throw new Error(data.error || `อัปโหลดรูปไม่สำเร็จ (HTTP ${response.status}) กดลองอัปโหลดอีกครั้ง`);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("ไม่ได้รับรหัสรูปที่อัปโหลด กดลองอัปโหลดอีกครั้ง");
  return { id, name, size: blob.size, width, height, url: "/api/google-drive-download?inline=1&id=" + encodeURIComponent(id), watermarked: true, watermarkType: "appeal" };
}

// Legacy images were uploaded before baked-in watermarks existed. Only those images
// receive a preview overlay. Newly uploaded images must not be watermarked twice.
export function EvidenceWatermarkOverlay({ caseId, type = "appeal" }: { caseId?: string; type?: EvidenceWatermarkType }) {
  const patternId = useId().replace(/:/g, "");
  const [purposeText, caseLabel] = evidenceWatermarkLines(String(caseId || ""), type);

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute inset-0 h-full w-full select-none"
      style={{ opacity: 0.16 }}
    >
      <defs>
        <pattern id={patternId} patternUnits="userSpaceOnUse" width="420" height="112" patternTransform="rotate(-34)">
          <text x="10" y="35" fill="#92263c" fontSize="14" fontWeight="700" fontFamily="Kanit, Noto Sans Thai, sans-serif">
            {purposeText}
          </text>
          <text x="10" y="59" fill="#92263c" fontSize="14" fontWeight="700" fontFamily="Kanit, Noto Sans Thai, sans-serif">
            {caseLabel}
          </text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}

export function AppealEvidenceGallery({ images = [], onRemove, caseId, startIndex = 0 }: {
  images?: AppealEvidenceImage[];
  onRemove?: (id: string) => void;
  caseId?: string;
  startIndex?: number;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (index === null) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIndex(null);
      if (e.key === "Tab") { e.preventDefault(); closeRef.current?.focus(); }
    };
    document.addEventListener("keydown", handle);
    return () => { document.removeEventListener("keydown", handle); previous?.focus(); };
  }, [index]);
  useEffect(() => { setFailed(false); }, [index, images]);
  const image = index === null ? undefined : images[index];
  const displayName = (item: AppealEvidenceImage, position: number) =>
    (caseId ? appealEvidenceDisplayName(caseId, startIndex + position + 1) : "") || item.name;
  if (!images.length) return null;
  return <div className="mt-3">
    <div className="flex flex-wrap gap-3">{images.map((item, i) => <div key={item.id} className="relative w-40 rounded-xl border border-violet-100 bg-white p-2">
      <button type="button" onClick={() => setIndex(i)} className="block w-full text-left" aria-label={"ดูรูป " + displayName(item, i)}>
        <div className="relative overflow-hidden rounded-lg"><img src={item.url} alt={displayName(item, i)} loading="lazy" className="h-24 w-full rounded-lg bg-slate-100 object-contain" />{!item.watermarked ? <EvidenceWatermarkOverlay caseId={caseId} type="appeal" /> : null}</div>
        <span className="mt-2 block truncate text-xs font-semibold" title={displayName(item, i)}>{displayName(item, i)}</span>
        <span className="block text-[11px] text-slate-500">{Math.ceil(item.size / 1024)} KB · ดูภาพใหญ่</span>
      </button>
      {onRemove && <button type="button" onClick={() => { setIndex(null); onRemove(item.id); }} aria-label={"ลบรูป " + displayName(item, i)} className="absolute right-1 top-1 rounded-full border bg-white px-2 text-slate-600">×</button>}
    </div>)}</div>
    {image && createPortal(<div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/75 p-4" onClick={() => setIndex(null)}>
      <div role="dialog" aria-modal="true" aria-label="ดูรูปภาพหลักฐาน" className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-white p-4" onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3"><span className="truncate font-bold">{displayName(image, index ?? 0)}</span><button ref={closeRef} type="button" onClick={() => setIndex(null)} className="rounded-xl border px-4 py-2">ปิด</button></div>
        {failed ? <div role="alert" className="p-8 text-center">โหลดรูปไม่สำเร็จ <a href={image.url} target="_blank" rel="noopener noreferrer" className="text-violet-700 underline">เปิดรูปอีกครั้ง</a></div> : (
          <div className="min-h-0 overflow-auto">
            <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-lg">
              <img
                src={image.url}
                alt={displayName(image, index ?? 0)}
                onError={() => setFailed(true)}
                className="block max-h-[70vh] max-w-full object-contain"
              />
              {!image.watermarked ? <EvidenceWatermarkOverlay caseId={caseId} type="appeal" /> : null}
            </div>
          </div>
        )}
        <div className="mt-3 flex items-center justify-center gap-4"><button type="button" disabled={index === 0} onClick={() => setIndex(i => Math.max(0, (i || 0) - 1))}>← ก่อนหน้า</button><span>{(index || 0) + 1} / {images.length}</span><button type="button" disabled={index === images.length - 1} onClick={() => setIndex(i => Math.min(images.length - 1, (i || 0) + 1))}>ถัดไป →</button></div>
      </div>
    </div>, document.body)}
  </div>;
}

export function AppealEvidencePicker({ caseId, topicCode, images, totalCount, disabled, onAdd, onRemove, onBusyChange, startIndex = 0 }: {
  caseId: string; topicCode: string; images: AppealEvidenceImage[]; totalCount: number; disabled: boolean; startIndex?: number;
  onAdd: (image: AppealEvidenceImage) => void; onRemove: (id: string) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [failedFiles, setFailedFiles] = useState<File[]>([]);
  const lock = useRef(false);
  const choose = async (files: File[]) => {
    if (!files.length || lock.current || disabled) return;
    if (files.length + totalCount > APPEAL_IMAGE_LIMIT) { setError("แนบได้สูงสุด 5 รูปรวมทุก Topic ต่อคำขอ"); return; }
    lock.current = true; setBusy(true); onBusyChange(true); setError("");
    const pending: File[] = [];
    const failures: string[] = [];
    try {
      for (const file of files) {
        try { onAdd(await uploadAppealImage(file, caseId, topicCode)); }
        catch (e) { pending.push(file); failures.push(`${file.name}: ${e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ"}`); }
      }
      setFailedFiles(pending);
      setError(failures.join("\n"));
    }
    finally { lock.current = false; setBusy(false); onBusyChange(false); }
  };
  return <div className="mt-4 border-t border-violet-100 pt-4">
    <div className="flex justify-between text-sm font-bold"><span>รูปภาพหลักฐาน (ไม่บังคับ)</span><span>{totalCount} / 5 รูป</span></div>
    <label className={"mt-2 inline-flex rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-bold text-violet-700 " + (busy || disabled ? "opacity-50" : "cursor-pointer")}>
      {busy ? "กำลังย่อและอัปโหลด..." : "เลือกรูปภาพ"}
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || disabled || totalCount >= APPEAL_IMAGE_LIMIT} className="sr-only" onChange={e => { const files = Array.from(e.currentTarget.files || []); e.currentTarget.value = ""; void choose(files); }} />
    </label>
    <div className="mt-2 text-xs leading-5 text-slate-500">JPG, PNG, WEBP · สูงสุด 5 รูปรวมทุก Topic · ต้นฉบับไม่เกิน 20 MB/รูป<br />ระบบย่ออัตโนมัติ ไม่เกิน 1,600 px และ 1 MB/รูป · กดรูปเพื่อดูภาพใหญ่</div>
    {error && <div role="alert" className="mt-2 whitespace-pre-line text-sm text-rose-600">{error}</div>}
    {failedFiles.length > 0 && <button type="button" disabled={busy || disabled}
      onClick={() => void choose(failedFiles)} className="mt-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-700 disabled:opacity-50">
      ลองอัปโหลดอีกครั้ง ({failedFiles.length} รูป)
    </button>}
    <AppealEvidenceGallery images={images} caseId={caseId} startIndex={startIndex} onRemove={busy || disabled ? undefined : onRemove} />
  </div>;
}
