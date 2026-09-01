import { jsPDF } from "jspdf";
import { registerTHSarabunNew } from "./THSarabunNew-jsPDF";
import {
  fetchStoredSignatureDocuments,
  type StoredSignatureDocument,
  type StoredSignatureEntry,
} from "./signatureStore";
import { canonicalAgentIdentityKey } from "./lib/agentIdentity";
import { getIncentiveByGrade, scoreToGrade } from "./lib/scoreIncentivePolicy";

const SIGN_ROLES = ["QA", "Supervisor", "Senior", "Agent"] as const;
type SignRole = (typeof SIGN_ROLES)[number];

function normalizeAgent(value: unknown) {
  return canonicalAgentIdentityKey(value) || String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function signatureAgentName(doc: StoredSignatureDocument) {
  const raw = String(doc.docId || "");
  const index = raw.indexOf("::");
  return index >= 0 ? raw.slice(index + 2) : raw;
}

function signatureMonthKey(doc: StoredSignatureDocument) {
  const raw = String(doc.docId || "");
  const index = raw.indexOf("::");
  return index >= 0 ? raw.slice(0, index) : "";
}

function isCompletedEntry(entry?: StoredSignatureEntry) {
  if (!entry) return false;
  if (entry.status === "Waived") return true;
  return entry.status === "Signed" && Boolean(String(entry.signedAt || "").trim());
}

export function isFinalSignedDocument(doc?: StoredSignatureDocument | null) {
  if (!doc) return false;
  const byRole = new Map(doc.entries.map((entry) => [entry.role, entry]));
  return SIGN_ROLES.every((role) => isCompletedEntry(byRole.get(role)));
}

export async function loadFinalSignedDocumentIndex(monthKey: string) {
  const rows = await fetchStoredSignatureDocuments();
  const monthRows = rows.filter((row) => signatureMonthKey(row) === monthKey);
  const index = new Map<string, StoredSignatureDocument>();
  monthRows.forEach((row) => index.set(normalizeAgent(signatureAgentName(row)), row));
  return { index, allMonthRows: monthRows };
}

function fmtDate(value: unknown) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function caseDate(item: any) {
  return String(item?.caseDate || item?.auditDate || item?.evaluationAuditDate || "-");
}

function activeTopics(item: any) {
  const base = Array.isArray(item?.topics) ? item.topics : [];
  const revised = Array.isArray(item?.revisedTopics) ? item.revisedTopics : [];
  if (!revised.length) return base;
  const revisedMap = new Map(revised.map((topic: any) => [String(topic?.code || ""), topic]));
  return base.map((topic: any) => revisedMap.get(String(topic?.code || "")) || topic);
}

function documentRef(monthKey: string, agentName: string, allMonthRows: StoredSignatureDocument[]) {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return `${monthKey}-${agentName}`;
  const [, year, month] = match;
  const ordered = [...allMonthRows].sort((a, b) =>
    signatureAgentName(a).localeCompare(signatureAgentName(b), "th")
  );
  const key = normalizeAgent(agentName);
  const index = ordered.findIndex((row) => normalizeAgent(signatureAgentName(row)) === key);
  return `${month}${year}${String(Math.max(0, index) + 1).padStart(5, "0")}`;
}

async function normalizeSignatureDataUrl(dataUrl: string) {
  if (!dataUrl || typeof window === "undefined") return dataUrl;
  return new Promise<string>((resolve) => {
    const image = new Image();
    const timeout = window.setTimeout(() => resolve(dataUrl), 1800);
    image.onload = () => {
      window.clearTimeout(timeout);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const ctx = canvas.getContext("2d");
        if (!ctx || !canvas.width || !canvas.height) return resolve(dataUrl);
        ctx.drawImage(image, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(dataUrl);
      }
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      resolve(dataUrl);
    };
    image.src = dataUrl;
  });
}

export async function appendFinalSignedReportForAgent({
  doc,
  cases,
  monthKey,
  agentName,
  storedDocument,
  allMonthRows,
  appendPage,
}: {
  doc: jsPDF;
  cases: any[];
  monthKey: string;
  agentName: string;
  storedDocument: StoredSignatureDocument;
  allMonthRows: StoredSignatureDocument[];
  appendPage: boolean;
}) {
  if (!isFinalSignedDocument(storedDocument)) return false;
  if (appendPage) doc.addPage();
  registerTHSarabunNew(doc as any);

  const PURPLE: [number, number, number] = [112, 48, 160];
  const DARK_PURPLE: [number, number, number] = [91, 44, 131];
  const LIGHT_PURPLE: [number, number, number] = [204, 193, 218];
  const PALE: [number, number, number] = [248, 242, 251];
  const BORDER: [number, number, number] = [184, 184, 184];
  const BLACK: [number, number, number] = [18, 24, 38];
  const MUTED: [number, number, number] = [92, 102, 120];
  const GOOD: [number, number, number] = [5, 150, 105];
  const WARN: [number, number, number] = [180, 83, 9];
  const left = 10;
  const tableW = 186;
  const pageH = doc.internal.pageSize.getHeight();
  const bottom = pageH - 11;
  let y = 10;

  const setFont = (size: number, bold = false, color: [number, number, number] = BLACK) => {
    try { doc.setFont("THSarabunNew", bold ? "bold" : "normal"); } catch { doc.setFont("helvetica", bold ? "bold" : "normal"); }
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  const cell = (
    x: number,
    yy: number,
    w: number,
    h: number,
    text: unknown,
    fill: [number, number, number],
    options: { bold?: boolean; size?: number; color?: [number, number, number]; align?: "left" | "center" | "right"; maxLines?: number } = {}
  ) => {
    doc.setLineWidth(0.15);
    doc.setDrawColor(...BORDER);
    doc.setFillColor(...fill);
    doc.rect(x, yy, w, h, "FD");
    const size = options.size ?? 8;
    const align = options.align ?? "left";
    setFont(size, options.bold ?? false, options.color ?? BLACK);
    const lines = doc.splitTextToSize(String(text ?? "-"), Math.max(4, w - 4)).slice(0, options.maxLines ?? 2);
    const gap = size * 0.42 + 1.25;
    const startY = yy + h / 2 - ((lines.length - 1) * gap) / 2 + size * 0.22;
    const tx = align === "center" ? x + w / 2 : align === "right" ? x + w - 2 : x + 2;
    lines.forEach((line: string, index: number) => doc.text(line, tx, startY + index * gap, { align }));
  };

  const section = (title: string) => {
    if (y + 11 > bottom) { doc.addPage(); y = 10; }
    cell(left, y, tableW, 7.2, title, PURPLE, { bold: true, size: 10, color: [255,255,255] });
    y += 8;
  };

  const sortedCases = [...cases].sort((a, b) => {
    const da = new Date(a?.caseDate || a?.auditDate || a?.auditTimestamp || "").getTime() || 0;
    const db = new Date(b?.caseDate || b?.auditDate || b?.auditTimestamp || "").getTime() || 0;
    return da - db || String(a?.caseId || "").localeCompare(String(b?.caseId || ""));
  });
  const averageScore = sortedCases.length
    ? sortedCases.reduce((sum, item) => sum + Number(item?.finalScore || 0), 0) / sortedCases.length
    : 0;
  const grade = scoreToGrade(averageScore, monthKey) as any;
  const incentive = sortedCases.length >= 10 ? getIncentiveByGrade(grade, monthKey) : { cash: 0, promo: 0, label: "0 THB / No Incentive" } as any;
  const monthLabel = String(sortedCases[0]?.monthLabel || monthKey);
  const teamName = String(sortedCases[0]?.teamName || "-");
  const ref = documentRef(monthKey, agentName, allMonthRows);

  cell(left, y, tableW, 9.2, "Monthly QA Dashboard", PURPLE, { bold: true, size: 15.6, color: [255,255,255] });
  y += 9.2;
  cell(left, y, tableW, 7, "Final Signed PDF • Monthly dashboard and acknowledgement", PURPLE, { bold: true, size: 9, color: [255,255,255] });
  y += 8.2;

  section("Current View");
  const widths = [25, 48, 22, 34, 28, 29];
  let x = left;
  const pairs = [
    ["Agent", `${agentName}\n(${teamName})`],
    ["Month", monthLabel],
    ["Reviewed Cases", String(sortedCases.length)],
  ];
  pairs.forEach(([label, value], index) => {
    const labelW = widths[index * 2];
    const valueW = widths[index * 2 + 1];
    cell(x, y, labelW, 12, label, DARK_PURPLE, { bold: true, size: 8, align: "center", color: [255,255,255] });
    x += labelW;
    cell(x, y, valueW, 12, value, LIGHT_PURPLE, { bold: true, size: 8.4, align: "center", maxLines: 2 });
    x += valueW;
  });
  y += 14;

  const metricW = tableW / 4;
  ["Cases Reviewed", "Need More to 10", "Average Score", "Monthly Grade"].forEach((label, index) =>
    cell(left + index * metricW, y, metricW, 7.4, label, PURPLE, { bold: true, size: 8.5, align: "center", color: [255,255,255] })
  );
  y += 7.4;
  const metricValues = [
    `${sortedCases.length}/10`,
    String(Math.max(10 - sortedCases.length, 0)),
    averageScore.toFixed(2),
    String(grade),
  ];
  metricValues.forEach((value, index) =>
    cell(left + index * metricW, y, metricW, 10.8, value, LIGHT_PURPLE, { bold: true, size: 13, align: "center", color: index === 2 ? (averageScore >= 85 ? GOOD : WARN) : BLACK })
  );
  y += 13;

  section("Incentive Summary");
  const incentiveText = Number((incentive as any).promo || 0) > 0
    ? `${(incentive as any).label || "Incentive"}\nCash ${Number((incentive as any).cash || 0).toLocaleString("th-TH")} / Promo ${Number((incentive as any).promo || 0).toLocaleString("th-TH")}`
    : `${(incentive as any).label || `${Number((incentive as any).cash || 0).toLocaleString("th-TH")} THB`}`;
  cell(left, y, tableW, 11, incentiveText, LIGHT_PURPLE, { bold: true, size: 8.8, align: "center", maxLines: 2 });
  y += 13;

  section("Monthly Case List");
  const caseWidths = [10, 23, 24, 94, 16, 9, 10];
  const headers = ["Seq", "Case Date", "Case ID", "Inquiry", "Score", "Grade", "Critical"];
  x = left;
  headers.forEach((header, index) => { cell(x, y, caseWidths[index], 7.2, header, PURPLE, { bold: true, size: 7.5, align: "center", color: [255,255,255] }); x += caseWidths[index]; });
  y += 7.2;
  for (let index = 0; index < Math.max(10, Math.min(sortedCases.length, 10)); index += 1) {
    const item = sortedCases[index];
    const fill: [number, number, number] = index % 2 === 0 ? [255,255,255] : [250,247,253];
    const values = [index + 1, item ? caseDate(item) : "-", item?.caseId || "-", item?.inquiryTh || item?.inquiryEn || "-", item ? Number(item.finalScore || 0).toFixed(2) : "-", item?.grade || scoreToGrade(Number(item?.finalScore || 0), monthKey), "NO"];
    x = left;
    values.forEach((value, valueIndex) => { cell(x, y, caseWidths[valueIndex], 8.2, value, fill, { bold: true, size: valueIndex === 3 ? 6.8 : 7.2, align: valueIndex === 3 ? "left" : "center", maxLines: valueIndex === 3 ? 2 : 1 }); x += caseWidths[valueIndex]; });
    y += 8.2;
  }

  const topicMap = new Map<string, { label: string; score: number; max: number; count: number }>();
  sortedCases.forEach((item) => {
    activeTopics(item).forEach((topic: any) => {
      const code = String(topic?.code || "").trim();
      const max = Number(topic?.max || 0);
      if (!code || max <= 0) return;
      const current = topicMap.get(code) || { label: String(topic?.label || code), score: 0, max: 0, count: 0 };
      current.score += Number(topic?.score || 0);
      current.max += max;
      current.count += 1;
      topicMap.set(code, current);
    });
  });

  y += 3;
  section("Monthly Topic Performance");
  const topicRows = [...topicMap.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  const topicWidths = [18, 88, 28, 22, 30];
  x = left;
  ["Topic", "Description", "Avg Score", "Max", "Avg %"].forEach((header, index) => { cell(x, y, topicWidths[index], 7.2, header, PURPLE, { bold: true, size: 7.7, align: "center", color: [255,255,255] }); x += topicWidths[index]; });
  y += 7.2;
  topicRows.forEach(([code, topic], index) => {
    if (y + 8 > bottom - 72) { doc.addPage(); y = 10; section("Monthly Topic Performance (continued)"); }
    const avgScore = topic.count ? topic.score / topic.count : 0;
    const avgMax = topic.count ? topic.max / topic.count : 0;
    const pct = avgMax ? (avgScore / avgMax) * 100 : 0;
    const fill: [number, number, number] = index % 2 === 0 ? [255,255,255] : [250,247,253];
    const values = [code, topic.label, avgScore.toFixed(2), avgMax.toFixed(2), `${pct.toFixed(2)}%`];
    x = left;
    values.forEach((value, valueIndex) => { cell(x, y, topicWidths[valueIndex], 8, value, fill, { bold: true, size: 7.4, align: valueIndex === 1 ? "left" : "center", maxLines: 1 }); x += topicWidths[valueIndex]; });
    y += 8;
  });

  y += 3;
  section("Acknowledgement / Signature");
  cell(left, y, tableW, 5.4, "รับทราบผลการประเมินประจำเดือน โดยลงนามตามตำแหน่งด้านล่าง", [255,255,255], { size: 7.2, color: MUTED });
  y += 6.2;
  if (y + 70 > bottom) { doc.addPage(); y = 12; }

  const byRole = new Map(storedDocument.entries.map((entry) => [entry.role, entry]));
  const normalizedSignatures = new Map<SignRole, string>();
  for (const role of SIGN_ROLES) {
    const entry = byRole.get(role);
    normalizedSignatures.set(role, entry?.signatureDataUrl ? await normalizeSignatureDataUrl(entry.signatureDataUrl) : "");
  }

  const panelW = tableW / 2 - 3;
  const drawPanel = (px: number, py: number, role: SignRole, title: string) => {
    const entry = byRole.get(role);
    cell(px, py, panelW, 5.2, title, PURPLE, { bold: true, size: 7, align: "center", color: [255,255,255] });
    cell(px, py + 5.2, panelW, 14.2, "", PALE, {});
    const centerX = px + panelW / 2;
    const signature = normalizedSignatures.get(role) || "";
    if (signature) {
      try {
        const props = doc.getImageProperties(signature);
        const ratio = props.width && props.height ? props.width / props.height : 4;
        let imageW = Math.min(panelW - 38, 46);
        let imageH = imageW / ratio;
        if (imageH > 9.2) { imageH = 9.2; imageW = imageH * ratio; }
        doc.addImage(signature, "PNG", centerX - imageW / 2, py + 7.1, imageW, imageH);
      } catch {}
    } else if (entry?.status === "Waived") {
      setFont(6.2, true, MUTED);
      doc.text("Waived", centerX, py + 13, { align: "center" });
    }
    const signer = entry?.signerName || entry?.signedBy || "-";
    cell(px, py + 19.4, panelW, 4.4, signer, [255,255,255], { bold: true, size: 6.4, align: "center", maxLines: 1 });
    cell(px, py + 23.8, panelW, 4.0, title, [255,255,255], { size: 5.8, align: "center", maxLines: 1 });
    cell(px, py + 27.8, panelW, 4.6, entry?.status === "Waived" ? `Waived • ${entry?.waiverReason || "Resigned"}` : fmtDate(entry?.signedAt), [255,255,255], { size: 5.8, align: "center", maxLines: 1 });
  };

  drawPanel(left, y, "Agent", "Agent ผู้ถูกประเมิน");
  drawPanel(left + panelW + 6, y, "Senior", "Senior หัวหน้าทีมผู้ถูกประเมิน");
  y += 35;
  drawPanel(left, y, "Supervisor", "Supervisor หัวหน้าแผนก");
  drawPanel(left + panelW + 6, y, "QA", "QA ผู้ตรวจสอบ");

  setFont(6.4, false, MUTED);
  doc.text(`Document Ref. ${ref} | FINAL Signed | Signed: 4/4`, left + tableW, pageH - 5.4, { align: "right" });
  return true;
}
