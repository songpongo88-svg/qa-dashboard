export function processSelectedPdfPagesPatch() {
  return {
    name: "process-selected-pdf-pages",
    enforce: "pre",
    transform(code, id) {
      const normalized = id.replace(/\\/g, "/");
      if (!normalized.endsWith("/src/processLibrary.tsx")) return null;

      const original = code;
      let next = code;
      const marker = "// process-pdf-selected-page-v97";

      if (!next.includes(marker)) {
        const reactImport = 'import React, { useEffect, useMemo, useRef, useState } from "react";\n';
        const workerImport = 'import processPdfWorkerUrlV97 from "pdfjs-dist/build/pdf.worker.min.mjs?url";\n';
        if (!next.includes(workerImport)) {
          if (!next.includes(reactImport)) throw new Error("Selected PDF page patch: React import anchor missing");
          next = next.replace(reactImport, reactImport + workerImport);
        }

        const componentAnchor = 'function ProcessSlideFileV70({ meta }: { meta: ProcessReferenceMeta }) {\n';
        if (!next.includes(componentAnchor)) throw new Error("Selected PDF page patch: ProcessSlideFileV70 anchor missing");

        const component = String.raw\`
\${marker}
function ProcessPdfSelectedPageV97({ meta }: { meta: ProcessReferenceMeta }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [hostWidth, setHostWidth] = useState(1100);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => setHostWidth(Math.max(320, Math.floor(host.clientWidth || 1100)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let task: any = null;
    let documentRef: any = null;
    setPdfDoc(null);
    setError("");
    setLoading(true);

    void loadPptxBufferV69(meta.fileUrl, controller.signal)
      .then(async (buffer) => {
        if (controller.signal.aborted) return;
        const engine = await import("pdfjs-dist");
        if (controller.signal.aborted) return;
        engine.GlobalWorkerOptions.workerSrc = processPdfWorkerUrlV97;
        const safeCopy = buffer.slice(0);
        task = engine.getDocument({ data: new Uint8Array(safeCopy), useSystemFonts: true });
        documentRef = await task.promise;
        if (controller.signal.aborted) {
          await documentRef.destroy();
          return;
        }
        if (meta.slideNumber < 1 || meta.slideNumber > documentRef.numPages) {
          await documentRef.destroy();
          documentRef = null;
          throw new Error("ไม่พบ Slide " + meta.slideNumber + " ในไฟล์ PDF นี้");
        }
        setPdfDoc(documentRef);
        setLoading(false);
      })
      .catch((cause) => {
        if (controller.signal.aborted || cause?.name === "AbortError") return;
        console.error("Open selected Process PDF page failed", cause);
        setError(cause instanceof Error ? cause.message : "เปิด Slide PDF ไม่สำเร็จ");
        setLoading(false);
      });

    return () => {
      controller.abort();
      setPdfDoc(null);
      if (task?.destroy) void task.destroy();
      else if (documentRef?.destroy) void documentRef.destroy();
    };
  }, [meta.fileUrl, meta.slideNumber]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let alive = true;
    let renderTask: any = null;
    setRendering(true);
    setError("");

    void (async () => {
      const page = await pdfDoc.getPage(meta.slideNumber);
      if (!alive) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(300, hostWidth - 28);
      const scale = Math.max(0.25, Math.min(3, availableWidth / baseViewport.width));
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current!;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(viewport.width * ratio);
      canvas.height = Math.ceil(viewport.height * ratio);
      canvas.style.width = Math.ceil(viewport.width) + "px";
      canvas.style.height = Math.ceil(viewport.height) + "px";
      const context = canvas.getContext("2d");
      if (!context) throw new Error("ไม่สามารถเปิด Canvas สำหรับ PDF ได้");
      renderTask = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      await renderTask.promise;
    })()
      .catch((cause) => {
        if (!alive || cause?.name === "RenderingCancelledException") return;
        console.error("Render selected Process PDF page failed", cause);
        setError("แสดง Slide " + meta.slideNumber + " ไม่สำเร็จ");
      })
      .finally(() => {
        if (alive) setRendering(false);
      });

    return () => {
      alive = false;
      renderTask?.cancel?.();
    };
  }, [pdfDoc, meta.slideNumber, hostWidth]);

  return (
    <div
      ref={hostRef}
      data-process-selected-pdf-page={meta.slideNumber}
      className="relative h-[78vh] w-full overflow-auto rounded-xl border border-slate-200 bg-slate-200/70"
    >
      {loading ? (
        <div className="flex h-full items-center justify-center text-sm font-bold text-slate-600">กำลังเปิด Slide {meta.slideNumber}...</div>
      ) : null}
      {error ? (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm font-black text-rose-700">{error}</div>
      ) : null}
      {!error && pdfDoc ? (
        <div className="flex min-h-full w-full items-start justify-center p-3">
          <div className="relative overflow-hidden bg-white shadow-lg">
            <canvas ref={canvasRef} aria-label={"Process Slide " + meta.slideNumber} role="img" className="block" />
            {rendering ? <div className="absolute inset-0 flex items-center justify-center bg-white/55 text-xs font-black text-slate-600">กำลังแสดง Slide...</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
\`;

        next = next.replace(componentAnchor, component + "\n" + componentAnchor);

        const firestorePdfBranch = '    if (resolvedMeta.fileUrl.startsWith("firestore://") && resolvedMeta.fileType === "pdf") return <FirestorePdfPreviewV71 meta={resolvedMeta} />;\n';
        const iframeBranch = '    if (src) return <iframe key={src} src={src} title={"Process Slide " + meta.slideNumber} allowFullScreen className="h-[78vh] w-full rounded-xl border border-slate-200 bg-white" />;\n';
        const selectedPdfBranch = '    if (resolvedMeta.fileType === "pdf" || /\\\\.pdf(?:$|[?#])/i.test(resolvedMeta.fileUrl)) return <ProcessPdfSelectedPageV97 meta={resolvedMeta} />;\n';

        if (!next.includes(firestorePdfBranch)) throw new Error("Selected PDF page patch: Firestore PDF branch missing");
        if (!next.includes(iframeBranch)) throw new Error("Selected PDF page patch: iframe branch missing");
        next = next.replace(firestorePdfBranch, selectedPdfBranch);
      }

      if (!next.includes(marker)) throw new Error("Selected PDF page patch failed: marker missing");
      if (!next.includes("data-process-selected-pdf-page={meta.slideNumber}")) throw new Error("Selected PDF page patch failed: single-page canvas missing");
      if (!next.includes("return <ProcessPdfSelectedPageV97 meta={resolvedMeta} />")) throw new Error("Selected PDF page patch failed: PDF routing missing");
      if (next === original) return null;
      return { code: next, map: null };
    },
  };
}
