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
  watermarkYRatio?: number;
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

function findQuietWatermarkYRatio(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || canvas.width < 10 || canvas.height < 10) return 0.5;

  const candidates = [0.34, 0.46, 0.58, 0.7];
  const xStart = Math.floor(canvas.width * 0.14);
  const xEnd = Math.ceil(canvas.width * 0.86);
  const bandHeight = Math.max(16, Math.floor(canvas.height * 0.13));
  const step = Math.max(4, Math.floor(Math.max(canvas.width, canvas.height) / 240));

  let bestRatio = 0.5;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const ratio of candidates) {
    const centerY = Math.floor(canvas.height * ratio);
    const yStart = Math.max(0, centerY - Math.floor(bandHeight / 2));
    const yEnd = Math.min(canvas.height, centerY + Math.floor(bandHeight / 2));
    let darkPixels = 0;
    let samples = 0;
    let darkness = 0;
    const sampleWidth = Math.max(1, xEnd - xStart);
    const sampleHeight = Math.max(1, yEnd - yStart);
    const pixels = context.getImageData(xStart, yStart, sampleWidth, sampleHeight).data;

    for (let localY = 0; localY < sampleHeight; localY += step) {
      for (let localX = 0; localX < sampleWidth; localX += step) {
        const offset = (localY * sampleWidth + localX) * 4;
        const luminance =
          0.2126 * pixels[offset] +
          0.7152 * pixels[offset + 1] +
          0.0722 * pixels[offset + 2];
        if (luminance < 232) darkPixels += 1;
        darkness += 255 - luminance;
        samples += 1;
      }
    }

    if (!samples) continue;
    const darkRatio = darkPixels / samples;
    const averageDarkness = darkness / samples;
    const score = darkRatio * 1000 + averageDarkness;
    if (score < bestScore) {
      bestScore = score;
      bestRatio = ratio;
    }
  }

  return bestRatio;
}

function imageToAnalysisCanvas(image: HTMLImageElement) {
  const maxWidth = 1100;
  const scale = Math.min(1, maxWidth / Math.max(image.naturalWidth || image.width || 1, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width || 1) * scale));
  canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height || 1) * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function imageBlobToPage(blob: Blob): Promise<RenderedEvidencePage> {
  const dataUrl = await blobToDataUrl(blob);
  const image = await loadImage(dataUrl);
  const analysisCanvas = imageToAnalysisCanvas(image);
  return {
    dataUrl,
    width: image.naturalWidth || image.width || 1,
    height: image.naturalHeight || image.height || 1,
    mode: "image",
    watermarkYRatio: analysisCanvas ? findQuietWatermarkYRatio(analysisCanvas) : 0.5,
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
        watermarkYRatio: findQuietWatermarkYRatio(canvas),
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
  const watermarkRatio = Math.min(0.72, Math.max(0.3, page.watermarkYRatio ?? 0.5));
  let watermarkY = pageH * watermarkRatio;

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
    const imageY = top + (maxH - height) / 2;
    doc.addImage(page.dataUrl, "JPEG", (pageW - width) / 2, imageY, width, height, undefined, "FAST");
    watermarkY = imageY + height * watermarkRatio;
  }

  const passed = Number(finalScore) >= 85;
  // Approx. 6% visual strength on white: visible as a watermark without obscuring evidence text.
  const watermarkColor: [number, number, number] = passed
    ? [241, 250, 244]
    : [253, 242, 242];

  doc.setFont("THSarabunNew", "bold");
  doc.setFontSize(52);
  doc.setTextColor(...watermarkColor);
  doc.text(safeCaseId(caseId), pageW / 2, watermarkY, {
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
