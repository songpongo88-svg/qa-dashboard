import { jsPDF } from "jspdf";
import { generateOfficialCaseDetailPdf } from "./caseDetailOfficialPdf";

type BulkCaseDetailPdfInput = {
  cases: any[];
  currentUser?: any;
  monthKey: string;
  onProgress?: (done: number, total: number) => void;
};

function normalizeCaseId(value: unknown) {
  return String(value || "").replace(/\s+/g, "").trim().toUpperCase();
}

function safeFilePart(value: unknown, fallback = "month") {
  const text = String(value || "").trim() || fallback;
  return text
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[. ]+$/g, "") || fallback;
}

function caseDateValue(item: any) {
  if (item?.auditDateObj instanceof Date && !Number.isNaN(item.auditDateObj.getTime())) {
    return item.auditDateObj.getTime();
  }
  for (const value of [item?.caseDate, item?.auditDate, item?.auditTimestamp, item?.evaluationAuditDate]) {
    const timestamp = new Date(value || "").getTime();
    if (!Number.isNaN(timestamp)) return timestamp;
  }
  return 0;
}

function hasAppeal(item: any) {
  return Boolean(
    item?.hasAppealHistory ||
      item?.appealStatus ||
      item?.reviewStatus === "Revised" ||
      item?.revisedTopics?.length ||
      item?.appealReviewedTopics?.length
  );
}

function appealRank(item: any) {
  if (!hasAppeal(item)) return 0;
  if (item?.reviewStatus === "Revised" || item?.appealStatus === "Approved") return 2;
  return 1;
}

function dedupeLatestCases(cases: any[]) {
  const latest = new Map<string, any>();

  cases.forEach((item) => {
    const key = normalizeCaseId(item?.caseId);
    if (!key) return;
    const current = latest.get(key);
    if (!current) {
      latest.set(key, item);
      return;
    }

    const nextRank = appealRank(item);
    const currentRank = appealRank(current);
    if (nextRank > currentRank) {
      latest.set(key, item);
      return;
    }
    if (nextRank === currentRank && caseDateValue(item) >= caseDateValue(current)) {
      latest.set(key, item);
    }
  });

  return [...latest.values()].sort((left, right) => {
    const dateDiff = caseDateValue(left) - caseDateValue(right);
    if (dateDiff) return dateDiff;
    return normalizeCaseId(left?.caseId).localeCompare(normalizeCaseId(right?.caseId));
  });
}

function prepareLatestAppealCase(caseItem: any) {
  if (!hasAppeal(caseItem)) return caseItem;

  const reviewedMap = new Map(
    (Array.isArray(caseItem?.appealReviewedTopics) ? caseItem.appealReviewedTopics : [])
      .map((topic: any) => [String(topic?.code || ""), topic])
      .filter(([code]) => Boolean(code))
  );

  const baseRevisedTopics = Array.isArray(caseItem?.revisedTopics) && caseItem.revisedTopics.length
    ? caseItem.revisedTopics
    : Array.isArray(caseItem?.appealReviewedTopics)
      ? caseItem.appealReviewedTopics
      : [];

  const revisedTopics = baseRevisedTopics.map((topic: any) => {
    const reviewed = reviewedMap.get(String(topic?.code || "")) as any;
    return {
      ...topic,
      comment: topic?.comment || reviewed?.comment || "",
      appealReason: topic?.appealReason || reviewed?.appealReason || "",
    };
  });

  const revisedCodes = new Set<string>(
    Array.isArray(caseItem?.displayRevisedTopicCodes)
      ? caseItem.displayRevisedTopicCodes.map(String)
      : []
  );
  reviewedMap.forEach((_topic, code) => revisedCodes.add(code));
  if (!revisedCodes.size) {
    revisedTopics.forEach((topic: any) => {
      const code = String(topic?.code || "");
      if (code) revisedCodes.add(code);
    });
  }

  return {
    ...caseItem,
    reviewStatus: "Revised",
    revisedTopics,
    displayRevisedTopicCodes: [...revisedCodes],
  };
}

export async function generateBulkCaseDetailPdf({
  cases,
  currentUser,
  monthKey,
  onProgress,
}: BulkCaseDetailPdfInput) {
  const orderedCases = dedupeLatestCases(cases);
  if (!orderedCases.length) throw new Error("ไม่พบเคสสำหรับเดือนที่เลือก");

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  for (let index = 0; index < orderedCases.length; index += 1) {
    const sourceCase = orderedCases[index];
    const useAppeal = hasAppeal(sourceCase);
    const caseItem = useAppeal ? prepareLatestAppealCase(sourceCase) : sourceCase;

    await generateOfficialCaseDetailPdf({
      caseItem,
      currentUser,
      pdfVariant: useAppeal ? "appeal" : "original",
      pdfDoc: doc,
      appendPage: index > 0,
      suppressOutput: true,
    });

    onProgress?.(index + 1, orderedCases.length);
    if ((index + 1) % 8 === 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }

  const monthLabel = orderedCases.find((item) => String(item?.monthLabel || "").trim())?.monthLabel || monthKey;
  return {
    blob: doc.output("blob"),
    fileName: `QA_Case_Detail_${safeFilePart(monthLabel, safeFilePart(monthKey))}_All_Cases.pdf`,
    caseCount: orderedCases.length,
  };
}
