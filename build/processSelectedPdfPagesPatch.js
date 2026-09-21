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

        const component = "// process-pdf-selected-page-v97\nfunction ProcessPdfSelectedPageV97({ meta }: { meta: ProcessReferenceMeta }) {\n  const hostRef = useRef<HTMLDivElement>(null);\n  const canvasRef = useRef<HTMLCanvasElement>(null);\n  const [pdfDoc, setPdfDoc] = useState<any>(null);\n  const [hostWidth, setHostWidth] = useState(1100);\n  const [loading, setLoading] = useState(true);\n  const [rendering, setRendering] = useState(false);\n  const [error, setError] = useState(\"\");\n\n  useEffect(() => {\n    const host = hostRef.current;\n    if (!host) return;\n    const update = () => setHostWidth(Math.max(320, Math.floor(host.clientWidth || 1100)));\n    update();\n    const observer = new ResizeObserver(update);\n    observer.observe(host);\n    return () => observer.disconnect();\n  }, []);\n\n  useEffect(() => {\n    const controller = new AbortController();\n    let task: any = null;\n    let documentRef: any = null;\n    setPdfDoc(null);\n    setError(\"\");\n    setLoading(true);\n\n    void loadPptxBufferV69(meta.fileUrl, controller.signal)\n      .then(async (buffer) => {\n        if (controller.signal.aborted) return;\n        const engine = await import(\"pdfjs-dist\");\n        if (controller.signal.aborted) return;\n        engine.GlobalWorkerOptions.workerSrc = processPdfWorkerUrlV97;\n        const safeCopy = buffer.slice(0);\n        task = engine.getDocument({ data: new Uint8Array(safeCopy), useSystemFonts: true });\n        documentRef = await task.promise;\n        if (controller.signal.aborted) {\n          await documentRef.destroy();\n          return;\n        }\n        if (meta.slideNumber < 1 || meta.slideNumber > documentRef.numPages) {\n          await documentRef.destroy();\n          documentRef = null;\n          throw new Error(\"ไม่พบ Slide \" + meta.slideNumber + \" ในไฟล์ PDF นี้\");\n        }\n        setPdfDoc(documentRef);\n        setLoading(false);\n      })\n      .catch((cause) => {\n        if (controller.signal.aborted || cause?.name === \"AbortError\") return;\n        console.error(\"Open selected Process PDF page failed\", cause);\n        setError(cause instanceof Error ? cause.message : \"เปิด Slide PDF ไม่สำเร็จ\");\n        setLoading(false);\n      });\n\n    return () => {\n      controller.abort();\n      setPdfDoc(null);\n      if (task?.destroy) void task.destroy();\n      else if (documentRef?.destroy) void documentRef.destroy();\n    };\n  }, [meta.fileUrl, meta.slideNumber]);\n\n  useEffect(() => {\n    if (!pdfDoc || !canvasRef.current) return;\n    let alive = true;\n    let renderTask: any = null;\n    setRendering(true);\n    setError(\"\");\n\n    void (async () => {\n      const page = await pdfDoc.getPage(meta.slideNumber);\n      if (!alive) return;\n      const baseViewport = page.getViewport({ scale: 1 });\n      const availableWidth = Math.max(300, hostWidth - 28);\n      const scale = Math.max(0.25, Math.min(3, availableWidth / baseViewport.width));\n      const viewport = page.getViewport({ scale });\n      const canvas = canvasRef.current!;\n      const ratio = Math.min(window.devicePixelRatio || 1, 2);\n      canvas.width = Math.ceil(viewport.width * ratio);\n      canvas.height = Math.ceil(viewport.height * ratio);\n      canvas.style.width = Math.ceil(viewport.width) + \"px\";\n      canvas.style.height = Math.ceil(viewport.height) + \"px\";\n      const context = canvas.getContext(\"2d\");\n      if (!context) throw new Error(\"ไม่สามารถเปิด Canvas สำหรับ PDF ได้\");\n      renderTask = page.render({\n        canvas,\n        canvasContext: context,\n        viewport,\n        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],\n      });\n      await renderTask.promise;\n    })()\n      .catch((cause) => {\n        if (!alive || cause?.name === \"RenderingCancelledException\") return;\n        console.error(\"Render selected Process PDF page failed\", cause);\n        setError(\"แสดง Slide \" + meta.slideNumber + \" ไม่สำเร็จ\");\n      })\n      .finally(() => {\n        if (alive) setRendering(false);\n      });\n\n    return () => {\n      alive = false;\n      renderTask?.cancel?.();\n    };\n  }, [pdfDoc, meta.slideNumber, hostWidth]);\n\n  return (\n    <div\n      ref={hostRef}\n      data-process-selected-pdf-page={meta.slideNumber}\n      className=\"relative h-[78vh] w-full overflow-auto rounded-xl border border-slate-200 bg-slate-200/70\"\n    >\n      {loading ? (\n        <div className=\"flex h-full items-center justify-center text-sm font-bold text-slate-600\">กำลังเปิด Slide {meta.slideNumber}...</div>\n      ) : null}\n      {error ? (\n        <div className=\"flex h-full items-center justify-center p-6 text-center text-sm font-black text-rose-700\">{error}</div>\n      ) : null}\n      {!error && pdfDoc ? (\n        <div className=\"flex min-h-full w-full items-start justify-center p-3\">\n          <div className=\"relative overflow-hidden bg-white shadow-lg\">\n            <canvas ref={canvasRef} aria-label={\"Process Slide \" + meta.slideNumber} role=\"img\" className=\"block\" />\n            {rendering ? <div className=\"absolute inset-0 flex items-center justify-center bg-white/55 text-xs font-black text-slate-600\">กำลังแสดง Slide...</div> : null}\n          </div>\n        </div>\n      ) : null}\n    </div>\n  );\n}";
        next = next.replace(componentAnchor, component + "\n" + componentAnchor);

        const firestorePdfBranch = '    if (resolvedMeta.fileUrl.startsWith("firestore://") && resolvedMeta.fileType === "pdf") return <FirestorePdfPreviewV71 meta={resolvedMeta} />;\n';
        const iframeBranch = '    if (src) return <iframe key={src} src={src} title={"Process Slide " + meta.slideNumber} allowFullScreen className="h-[78vh] w-full rounded-xl border border-slate-200 bg-white" />;\n';
        const selectedPdfBranch = '    if (resolvedMeta.fileType === "pdf" || /\\.pdf(?:$|[?#])/i.test(resolvedMeta.fileUrl)) return <ProcessPdfSelectedPageV97 meta={resolvedMeta} />;\n';

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
