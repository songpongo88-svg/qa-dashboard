export const EVIDENCE_WATERMARK_VERSION = "qa-v2";
export const EVIDENCE_WATERMARK = { color: "#92263c", opacity: 0.16, angle: -34, tileWidth: 420, tileHeight: 112, fontSize: 14 } as const;

export function evidenceWatermarkLines(caseId: string): [string, string] {
  return ["ใช้สำหรับเป็นหลักฐานประเมินเคส QA", `Case ID: ${String(caseId || "").trim().toUpperCase()}`];
}

export function paintEvidenceWatermark(context: CanvasRenderingContext2D, width: number, height: number, caseId: string) {
  const [purpose, caseLabel] = evidenceWatermarkLines(caseId);
  context.save();
  context.globalAlpha = EVIDENCE_WATERMARK.opacity;
  context.fillStyle = EVIDENCE_WATERMARK.color;
  context.font = `700 ${EVIDENCE_WATERMARK.fontSize}px Kanit, 'Noto Sans Thai', sans-serif`;
  context.translate(width / 2, height / 2);
  context.rotate(EVIDENCE_WATERMARK.angle * Math.PI / 180);
  const extent = Math.hypot(width, height) + 600;
  for (let x = -extent; x <= extent; x += EVIDENCE_WATERMARK.tileWidth) {
    for (let y = -extent; y <= extent; y += EVIDENCE_WATERMARK.tileHeight) {
      context.fillText(purpose, x + 10, y + 35);
      context.fillText(caseLabel, x + 10, y + 59);
    }
  }
  context.restore();
}

export function isStampedEvidenceUrl(value: string, caseId: string) {
  try {
    const url = new URL(value, "https://qa.local");
    return url.searchParams.get("watermark") === EVIDENCE_WATERMARK_VERSION &&
      url.searchParams.get("caseId") === String(caseId || "").trim().toUpperCase();
  } catch { return false; }
}

// The PDF fallback uses the same tile geometry, clipped to the evidence image.
export function paintPdfEvidenceWatermark(doc: any, x: number, y: number, width: number, height: number, caseId: string, sourceWidth: number) {
  const scale = width / Math.max(1, sourceWidth);
  const sourceHeight = height / scale;
  const angle = EVIDENCE_WATERMARK.angle * Math.PI / 180;
  const extent = Math.hypot(sourceWidth, sourceHeight) + 600;
  const lines = evidenceWatermarkLines(caseId);
  doc.saveGraphicsState();
  doc.rect(x, y, width, height); doc.clip(); doc.discardPath();
  doc.setGState(new doc.GState({ opacity: EVIDENCE_WATERMARK.opacity }));
  doc.setTextColor(EVIDENCE_WATERMARK.color);
  doc.setFont("THSarabunNew", "bold");
  doc.setFontSize(EVIDENCE_WATERMARK.fontSize * scale * 72 / 25.4);
  for (let tileX = -extent; tileX <= extent; tileX += EVIDENCE_WATERMARK.tileWidth) {
    for (let tileY = -extent; tileY <= extent; tileY += EVIDENCE_WATERMARK.tileHeight) {
      lines.forEach((text, index) => {
        const px = tileX + 10, py = tileY + (index ? 59 : 35);
        const textX = x + width / 2 + (px * Math.cos(angle) - py * Math.sin(angle)) * scale;
        const textY = y + height / 2 + (px * Math.sin(angle) + py * Math.cos(angle)) * scale;
        // Avoid emitting tiles that cannot intersect the clipped image.
        if (textY < y - width || textY > y + height + width || textX > x + width || textX < x - width * 2) return;
        doc.text(text, textX, textY, { angle: -EVIDENCE_WATERMARK.angle });
      });
    }
  }
  doc.restoreGraphicsState();
}
