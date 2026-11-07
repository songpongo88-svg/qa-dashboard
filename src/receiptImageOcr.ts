// Image reading runs only after an explicit upload. No polling or wallet writes.
export async function prepareReceiptUpload(file: File) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw Error("กรุณาเลือกรูป JPG, PNG หรือ WebP");
  if (file.size > 12 * 1024 * 1024) throw Error("รูปภาพใหญ่เกินไป (สูงสุด 12 MB)");
  const image = new Image(), url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve(); image.onerror = () => reject(Error("ไม่สามารถเปิดรูปใบเสร็จได้")); image.src = url;
    });
    const canvasAt = (edge: number, pixels: number) => {
      const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight), Math.sqrt(pixels / (image.naturalWidth * image.naturalHeight)));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d"); if (!context) throw Error("ไม่สามารถเตรียมรูปใบเสร็จได้");
      context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas;
    };
    const evidence = canvasAt(1800, 2500000);
    let imageData = evidence.toDataURL("image/jpeg", .78);
    for (const quality of [.64, .5, .38]) { if (imageData.length <= 440000) break; imageData = evidence.toDataURL("image/jpeg", quality); }
    if (imageData.length > 440000) throw Error("รูปยังใหญ่เกินไป กรุณาครอบเฉพาะใบเสร็จและแนบอีกครั้ง");
    return { imageData, ocrImage: canvasAt(3600, 5000000) };
  } finally { URL.revokeObjectURL(url); }
}

export async function readReceiptInBrowser(image: HTMLCanvasElement, signal: AbortSignal, progress: (value: string) => void) {
  let worker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> | undefined;
  let stopped = false, rejectAbort: (reason: Error) => void = () => {};
  const cancellation = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const abort = () => { stopped = true; rejectAbort(Error("ยกเลิกการอ่านใบเสร็จ")); };
  const timeout = window.setTimeout(() => { stopped = true; rejectAbort(Error("อ่านรูปใช้เวลานานเกินไป ลองถ่ายภาพให้ชัดขึ้น หรือกรอกช่องที่ยังอ่านไม่ได้")); }, 60000);
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (signal.aborted) throw Error("ยกเลิกการอ่านใบเสร็จ");
    const recognition = (async () => {
      const library = await import("tesseract.js");
      // The browser build can expose this CommonJS package under its default export.
      const createWorker = library.createWorker || (library as unknown as { default?: typeof library }).default?.createWorker;
      if (typeof createWorker !== "function") throw Error("โหลดตัวอ่านภาพไม่สำเร็จ กรุณาลองอ่านอีกครั้ง");
      if (stopped) throw Error("ยกเลิกการอ่านใบเสร็จ");
      worker = await createWorker(["tha", "eng"], 1, { logger: event => {
        if (stopped) return;
        progress(event.status === "recognizing text" ? "กำลังอ่านข้อความจากภาพ " + Math.round(event.progress * 100) + "%" : "กำลังเตรียมตัวอ่านภาษาไทยและอังกฤษ...");
      } });
      if (stopped) { await worker.terminate(); throw Error("ยกเลิกการอ่านใบเสร็จ"); }
      const result = await worker.recognize(image);
      return String(result.data.text || "").slice(0, 12000);
    })();
    return await Promise.race([recognition, cancellation]);
  } finally {
    stopped = true; window.clearTimeout(timeout); signal.removeEventListener("abort", abort);
    if (worker) await worker.terminate().catch(() => {});
  }
}
