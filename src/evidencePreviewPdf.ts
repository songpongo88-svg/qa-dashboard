import { jsPDF } from "./officialPdf";
import { PDF_LOGO } from "./pdfLogo";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

type EvidencePdfResult = {
  blob: Blob;
  fileName: string;
  title: string;
};

type RenderedEvidencePage = {
  dataUrl: string;
  width: number;
  height: number;
  mode: "page" | "image";
};

function safeCaseId(value: string) {
  return (value || "case").trim().replace(/[^A-Za-z0-9._-]+/g, "_") || "case";
}

export function extractEvidenceDriveId(raw: unknown) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  return (
    value.match(/[?&]id=([^&#]+)/i)?.[1] ||
    value.match(/\/file\/d\/([^/]+)/i)?.[1] ||
    value.match(/[?&]export=(?:view|download)&id=([^&#]+)/i)?.[1] ||
    ""
  );
}

function fileNameFor(caseId: string) {
  return `${safeCaseId(caseId)}_Evidence_Attachment.pdf`;
}

async function fetchEvidenceBlob(rawUrl: string) {
  const value = String(rawUrl || "").trim();
  if (!value) throw new Error("Evidence URL is empty.");

  if (value.startsWith("data:") || value.startsWith("blob:")) {
    const response = await fetch(value);
    if (!response.ok) throw new Error("Cannot read attached evidence.");
    return response.blob();
  }

  const driveId = extractEvidenceDriveId(value);
  const target = driveId
    ? `/api/google-drive-download?id=${encodeURIComponent(driveId)}`
    : value;
  const response = await fetch(target);
  if (!response.ok) throw new Error(`Cannot load evidence file (${response.status}).`);
  return response.blob();
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Cannot render evidence image."));
    image.src = dataUrl;
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Cannot read evidence file."));
    reader.readAsDataURL(blob);
  });
}

async function imageBlobToPage(blob: Blob): Promise<RenderedEvidencePage> {
  const dataUrl = await blobToDataUrl(blob);
  const image = await loadImage(dataUrl);
  return {
    dataUrl,
    width: image.naturalWidth || image.width || 1,
    height: image.naturalHeight || image.height || 1,
    mode: "image",
  };
}

async function pdfBlobToPages(blob: Blob): Promise<RenderedEvidencePage[]> {
  const engine = await import("pdfjs-dist");
  engine.GlobalWorkerOptions.workerSrc = workerUrl;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const loadingTask = engine.getDocument({ data: bytes, useSystemFonts: false });
  const pdf = await loadingTask.promise;
  const pages: RenderedEvidencePage[] = [];

  try {
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      const page = await pdf.getPage(pageNo);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2, Math.max(1.25, 1600 / Math.max(base.width, 1)));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Cannot prepare PDF page.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      pages.push({
        dataUrl: canvas.toDataURL("image/jpeg", 0.9),
        width: canvas.width,
        height: canvas.height,
        mode: "page",
      });
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  return pages;
}

async function blobToRenderedPages(blob: Blob, sourceUrl: string) {
  const type = String(blob.type || "").toLowerCase();
  const looksPdf =
    type.includes("pdf") ||
    sourceUrl.toLowerCase().includes(".pdf") ||
    sourceUrl.toLowerCase().includes("drive.google.com/file/");
  if (looksPdf) {
    try {
      return await pdfBlobToPages(blob);
    } catch {
      if (type.startsWith("image/")) return [await imageBlobToPage(blob)];
      throw new Error("Cannot render evidence PDF.");
    }
  }
  return [await imageBlobToPage(blob)];
}

function drawEvidencePage(
  doc: InstanceType<typeof jsPDF>,
  page: RenderedEvidencePage,
  caseId: string,
  finalScore: number,
  pageNo: number,
  totalPages: number
) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  if (page.mode === "page") {
    doc.addImage(page.dataUrl, "JPEG", 0, 0, pageW, pageH, undefined, "FAST");
  } else {
    const top = 18;
    const bottom = 14;
    const side = 8;
    const maxW = pageW - side * 2;
    const maxH = pageH - top - bottom;
    const ratio = page.width / Math.max(page.height, 1);
    const boxRatio = maxW / maxH;
    const width = ratio > boxRatio ? maxW : maxH * ratio;
    const height = ratio > boxRatio ? maxW / ratio : maxH;
    doc.addImage(page.dataUrl, "JPEG", (pageW - width) / 2, top + (maxH - height) / 2, width, height, undefined, "FAST");
  }

  const passed = Number(finalScore) >= 85;
  const watermarkColor: [number, number, number] = passed
    ? [173, 220, 190]
    : [244, 188, 188];

  doc.setFont("THSarabunNew", "bold");
  doc.setFontSize(52);
  doc.setTextColor(...watermarkColor);
  doc.text(safeCaseId(caseId), pageW / 2, pageH / 2, {
    align: "center",
    angle: 35,
  });

  doc.addImage(PDF_LOGO, "PNG", 5.5, 4.2, 5.2, 5.2, "qa-evidence-logo", "FAST");
  doc.setFont("THSarabunNew", "normal");
  doc.setFontSize(9);
  doc.setTextColor(77, 60, 100);
  doc.text("Robinhood Quality Assurance", 12, 7.8);

  doc.setDrawColor(226, 220, 236);
  doc.setLineWidth(0.2);
  doc.line(5.5, pageH - 10.5, pageW - 5.5, pageH - 10.5);
  doc.setFont("THSarabunNew", "normal");
  doc.setFontSize(5.8);
  doc.setTextColor(125, 125, 125);
  doc.text(`Page ${pageNo} of ${totalPages}`, pageW - 7.5, pageH - 4.2, { align: "right" });
}

export async function buildEvidencePreviewPdf(
  urls: string[],
  caseId: string,
  finalScore: number
): Promise<EvidencePdfResult> {
  const sources = urls.map((item) => String(item || "").trim()).filter(Boolean);
  if (!sources.length) throw new Error("No evidence file found.");

  const renderedPages: RenderedEvidencePage[] = [];
  for (const source of sources) {
    const blob = await fetchEvidenceBlob(source);
    renderedPages.push(...(await blobToRenderedPages(blob, source)));
  }
  if (!renderedPages.length) throw new Error("No evidence page found.");

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  (doc as any).__qaCustomOfficialHeader = true;
  doc.setProperties({
    title: `Evidence Attachment - ${safeCaseId(caseId)}`,
    subject: "Robinhood Quality Assurance Evidence Attachment",
    author: "Robinhood Quality Assurance",
    keywords: `QA Evidence, ${safeCaseId(caseId)}`,
  });

  renderedPages.forEach((page, index) => {
    if (index > 0) doc.addPage("a4", "portrait");
    drawEvidencePage(doc, page, caseId, finalScore, index + 1, renderedPages.length);
  });

  return {
    blob: doc.output("blob"),
    fileName: fileNameFor(caseId),
    title: `${safeCaseId(caseId)} Evidence Attachment`,
  };
}

export async function downloadEvidenceUrl(rawUrl: string, fileName: string) {
  const blob = await fetchEvidenceBlob(rawUrl);
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName || "Evidence_Attachment.pdf";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  }
}
