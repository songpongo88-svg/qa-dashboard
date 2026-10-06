import type { StoredEvaluationCallLog } from "./evaluationStore";

export type EditableCallLog = StoredEvaluationCallLog & {
  uploadStatus?: "idle" | "uploading" | "uploaded" | "failed";
  uploadError?: string;
  uploadProgress?: number;
  localPreviewUrl?: string;
  recordingFile?: File;
  playbackRepairing?: boolean;
  playbackError?: string;
};

export type DraftCallLog = StoredEvaluationCallLog & {
  pendingRecording?: { name: string; type: string; lastModified: number; dataUrl: string };
};

export function hasSavedRecording(url: unknown): boolean {
  return typeof url === "string" && Boolean(url.trim()) && !/^(blob|data):/i.test(url.trim());
}

export function storedCallLog(call: StoredEvaluationCallLog): StoredEvaluationCallLog {
  return {
    id: call.id, phoneNumber: call.phoneNumber, direction: call.direction,
    ...(call.contactType ? { contactType: call.contactType } : {}), callDate: call.callDate,
    callTime: call.callTime, duration: call.duration, note: call.note || "",
    recordingUrl: hasSavedRecording(call.recordingUrl) ? call.recordingUrl : "",
    recordingName: call.recordingName || "", recordingType: call.recordingType || "",
  };
}

export async function callLogsForDraft(calls: EditableCallLog[]): Promise<DraftCallLog[]> {
  return Promise.all(calls.map(async (call) => {
    const saved: DraftCallLog = storedCallLog(call);
    if (!call.recordingFile) return saved;
    const file = call.recordingFile;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error(`เก็บไฟล์เสียง ${file.name} ลง Draft ไม่สำเร็จ`));
      reader.readAsDataURL(file);
    });
    saved.recordingUrl = "";
    saved.pendingRecording = { name: file.name, type: file.type, lastModified: file.lastModified, dataUrl };
    return saved;
  }));
}

export function restoreDraftCallLogs(calls: DraftCallLog[]): EditableCallLog[] {
  return calls.map((call) => {
    const saved = storedCallLog(call);
    if (!call.pendingRecording) return {
      ...saved, uploadStatus: hasSavedRecording(saved.recordingUrl) ? "uploaded" : saved.recordingName ? "failed" : "idle",
      uploadError: saved.recordingName && !hasSavedRecording(saved.recordingUrl) ? "ไฟล์เสียงนี้ยังไม่ได้บันทึก กรุณาแนบไฟล์อีกครั้ง" : "",
    };
    const pending = call.pendingRecording;
    if (!/^data:[^,]*;base64,/.test(pending.dataUrl)) throw new Error("ไฟล์เสียงใน Draft ไม่สมบูรณ์");
    const bytes = Uint8Array.from(atob(pending.dataUrl.slice(pending.dataUrl.indexOf(",") + 1)), (char) => char.charCodeAt(0));
    const recordingFile = new File([bytes], pending.name, { type: pending.type, lastModified: pending.lastModified });
    return {
      ...saved, recordingUrl: "", recordingFile, localPreviewUrl: URL.createObjectURL(recordingFile),
      uploadStatus: "failed", uploadProgress: 0,
      uploadError: "เก็บไฟล์เสียงไว้ใน Draft แล้ว กดลองอัปโหลดอีกครั้ง หรือ Submit เพื่อบันทึกเสียงไปกับเคส",
    };
  });
}

export async function callLogsForSubmit(
  calls: EditableCallLog[],
  upload: (call: EditableCallLog) => Promise<string>,
): Promise<StoredEvaluationCallLog[]> {
  // Wait for every attachment, including the second call, before creating a
  // submitted record. A local player is not proof that storage succeeded.
  const results = await Promise.allSettled(calls.map(async (call) => {
    const saved = storedCallLog(call);
    if (call.recordingFile) saved.recordingUrl = await upload(call);
    if ((call.recordingFile || call.recordingName || call.localPreviewUrl) && !hasSavedRecording(saved.recordingUrl)) {
      throw new Error("ยังไม่มีไฟล์เสียงที่บันทึกบนระบบ กรุณาแนบไฟล์อีกครั้ง");
    }
    return saved;
  }));
  const errors = results.flatMap((result, index) => result.status === "rejected"
    ? [`Call #${index + 1} (${calls[index].recordingName || "ไฟล์เสียง"}): ${result.reason instanceof Error ? result.reason.message : "อัปโหลดไม่สำเร็จ"}`]
    : []);
  if (errors.length) throw new Error(`ยังไม่ได้บันทึกเคส เพราะไฟล์เสียงยังไม่ครบ\n${errors.join("\n")}\nบันทึก Draft เพื่อเก็บข้อมูลและไฟล์เสียงไว้ก่อนได้`);
  return results.map((result) => (result as PromiseFulfilledResult<StoredEvaluationCallLog>).value);
}
