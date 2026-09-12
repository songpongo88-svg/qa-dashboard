import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const signatureCenterPath = path.resolve(__dirname, "../src/SignatureCenterMockup.tsx");
const marker = "signature-late-payment-carryover-v90";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor`);
  return source.replace(before, after);
}

let source = fs.readFileSync(signatureCenterPath, "utf8");
if (!source.includes(marker)) {
  source = replaceOnce(
    source,
    '} from "./signatureStore";',
    `} from "./signatureStore";\nimport {\n  fetchPaymentCarryOverStates,\n  markPaymentCarryOverExported,\n  type PaymentCarryOverState,\n} from "./paymentCarryOverStore";`,
    "payment carry-over import"
  );

  source = replaceOnce(
    source,
    `  documentHash: string;\n  cases: SignatureCaseDetail[];`,
    `  documentHash: string;\n  paymentCycle?: string;\n  carryOverFrom?: string;\n  signatureCompletedAt?: string;\n  paymentStatus?: "Ready" | "Carry Over" | "Paid/Exported";\n  cases: SignatureCaseDetail[];`,
    "signature document payment metadata"
  );

  source = replaceOnce(
    source,
    `  return signedComplete && hasLateCompletion && !hasPending;\n}\n\nfunction getSignatureValidationRoleText(`,
    `  return signedComplete && hasLateCompletion && !hasPending;\n}\n\nfunction addPaymentMonthKey(monthKey: string, months = 1) {\n  const match = String(monthKey || "").match(/^(\\d{4})-(\\d{2})$/);\n  if (!match) return "";\n  const date = new Date(Number(match[1]), Number(match[2]) - 1 + months, 1);\n  return \`${'${date.getFullYear()}'}-${'${String(date.getMonth() + 1).padStart(2, "0")}'}\`;\n}\n\nfunction getSignatureCompletedAt(entries: SignatureEntry[]) {\n  return SIGNATURE_FLOW\n    .map((role) => {\n      const completed = getCompletedEntry(entries, role);\n      return completed?.signedAt || completed?.waivedAt || "";\n    })\n    .filter(Boolean)\n    .sort()\n    .at(-1) || "";\n}\n\nfunction getCarryOverPaymentCycle(doc: SignatureDocument, entries: SignatureEntry[]) {\n  const completedAt = getSignatureCompletedAt(entries);\n  const completedTime = new Date(completedAt || "").getTime();\n  if (!completedAt || Number.isNaN(completedTime)) return "";\n  if (completedTime <= getSignatureWindow(doc.monthKey).dueAt.getTime()) return "";\n\n  let paymentCycle = addPaymentMonthKey(doc.monthKey, 1);\n  for (let guard = 0; paymentCycle && guard < 24; guard += 1) {\n    if (completedTime <= getSignatureWindow(paymentCycle).dueAt.getTime()) return paymentCycle;\n    paymentCycle = addPaymentMonthKey(paymentCycle, 1);\n  }\n  return paymentCycle;\n}\n\n// ${marker}\nfunction getSignatureValidationRoleText(`,
    "late carry-over helpers"
  );

  source = replaceOnce(
    source,
    `  const [signatures, setSignatures] = useState<Record<string, SignatureEntry[]>>(() => readSignatureStore());\n  const [signatureLibrary, setSignatureLibrary]`,
    `  const [signatures, setSignatures] = useState<Record<string, SignatureEntry[]>>(() => readSignatureStore());\n  const [paymentCarryOverStates, setPaymentCarryOverStates] = useState<Record<string, PaymentCarryOverState>>({});\n  const [signatureLibrary, setSignatureLibrary]`,
    "payment carry-over state"
  );

  source = replaceOnce(
    source,
    `  useEffect(() => {\n    let alive = true;\n    const loadRemoteSignatures = async () => {`,
    `  useEffect(() => {\n    let alive = true;\n    fetchPaymentCarryOverStates()\n      .then((states) => {\n        if (alive) setPaymentCarryOverStates(states);\n      })\n      .catch((error) => {\n        console.warn("Load payment carry-over states failed", error);\n      });\n    return () => {\n      alive = false;\n    };\n  }, []);\n\n  useEffect(() => {\n    let alive = true;\n    const loadRemoteSignatures = async () => {`,
    "payment carry-over state loader"
  );

  const oldPaymentSelection = `  const selectedMonthPaymentDocs = useMemo(() => {\n    if (selectedMonth === "all") return [];\n    return documents\n      .filter((doc) => doc.monthKey === selectedMonth)\n      .filter((doc) => isPaymentReadyDocument(doc, effectiveEntriesForDoc(doc, signatures), pendingAppealCaseMap));\n  }, [documents, pendingAppealCaseMap, selectedMonth, signatures]);\n\n  const selectedMonthExportDocs = useMemo(() => {\n    if (selectedMonth === "all") return [];\n    return selectedMonthPaymentDocs;\n  }, [selectedMonth, selectedMonthPaymentDocs]);\n\n  const selectedMonthPaymentExportDocs = useMemo(() => {\n    if (selectedMonth === "all") return [];\n    return selectedMonthExportDocs;\n  }, [selectedMonth, selectedMonthExportDocs]);`;

  const newPaymentSelection = `  const selectedMonthPaymentDocs = useMemo(() => {\n    if (selectedMonth === "all") return [];\n    return documents\n      .filter((doc) => doc.monthKey === selectedMonth)\n      .filter((doc) => isPaymentReadyDocument(doc, effectiveEntriesForDoc(doc, signatures), pendingAppealCaseMap));\n  }, [documents, pendingAppealCaseMap, selectedMonth, signatures]);\n\n  const selectedMonthCarryOverDocs = useMemo(() => {\n    if (selectedMonth === "all") return [];\n    return documents.filter((doc) => {\n      const entries = effectiveEntriesForDoc(doc, signatures);\n      if (!isLateSignedDocument(doc, entries, pendingAppealCaseMap)) return false;\n      const paymentCycle = getCarryOverPaymentCycle(doc, entries);\n      if (!paymentCycle || paymentCycle !== selectedMonth) return false;\n      const storedState = paymentCarryOverStates[doc.id];\n      return !storedState?.paymentCycle || storedState.paymentCycle === selectedMonth;\n    });\n  }, [documents, paymentCarryOverStates, pendingAppealCaseMap, selectedMonth, signatures]);\n\n  const selectedMonthExportDocs = useMemo(() => {\n    if (selectedMonth === "all") return [];\n    return selectedMonthPaymentDocs;\n  }, [selectedMonth, selectedMonthPaymentDocs]);\n\n  const selectedMonthPaymentExportDocs = useMemo(() => {\n    if (selectedMonth === "all") return [];\n    const combined = new Map<string, SignatureDocument>();\n    selectedMonthExportDocs.forEach((doc) => {\n      const entries = effectiveEntriesForDoc(doc, signatures);\n      combined.set(doc.id, {\n        ...doc,\n        paymentCycle: selectedMonth,\n        carryOverFrom: "",\n        signatureCompletedAt: getSignatureCompletedAt(entries),\n        paymentStatus: "Ready",\n      });\n    });\n    selectedMonthCarryOverDocs.forEach((doc) => {\n      const entries = effectiveEntriesForDoc(doc, signatures);\n      const storedState = paymentCarryOverStates[doc.id];\n      combined.set(doc.id, {\n        ...doc,\n        paymentCycle: selectedMonth,\n        carryOverFrom: doc.monthKey,\n        signatureCompletedAt: getSignatureCompletedAt(entries),\n        paymentStatus: storedState?.status === "Exported" ? "Paid/Exported" : "Carry Over",\n      });\n    });\n    return [...combined.values()];\n  }, [paymentCarryOverStates, selectedMonth, selectedMonthCarryOverDocs, selectedMonthExportDocs, signatures]);`;

  source = replaceOnce(source, oldPaymentSelection, newPaymentSelection, "payment export selection");

  source = replaceOnce(
    source,
    `  const readyForIncentive = Boolean(selectedDocument?.eligibleByScore && isComplete);\n  const previewConfirmed = Boolean(`,
    `  const readyForIncentive = Boolean(selectedDocument?.eligibleByScore && isComplete);\n  const selectedCarryOverCycle = selectedDocument && isLateSignedDocument(selectedDocument, selectedEntries, pendingAppealCaseMap)\n    ? getCarryOverPaymentCycle(selectedDocument, selectedEntries)\n    : "";\n  const selectedCarryOverState = selectedDocument ? paymentCarryOverStates[selectedDocument.id] : undefined;\n  const previewConfirmed = Boolean(`,
    "selected carry-over status"
  );

  source = replaceOnce(
    source,
    `            {hasPendingAppeal ? (`,
    `            {selectedCarryOverCycle ? (\n              <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-[0_18px_40px_rgba(217,119,6,0.08)]">\n                <div className="text-base font-black">Late Signature · ${'${selectedCarryOverState?.status === "Exported" ? "Paid/Exported" : "Carry Over to Next Payment"}'}</div>\n                <div className="mt-1 text-sm font-semibold leading-6">\n                  Performance Month: {selectedDocument?.monthLabel || selectedDocument?.monthKey} · Payment Cycle: {getMonthLabel(selectedCarryOverCycle)}\n                </div>\n                <div className="mt-1 text-xs font-semibold text-amber-700">\n                  Signature Completed: {getSignatureCompletedAt(selectedEntries) ? formatDateTime(getSignatureCompletedAt(selectedEntries)) : "-"}\n                </div>\n              </div>\n            ) : null}\n\n            {hasPendingAppeal ? (`,
    "late carry-over banner"
  );

  source = replaceOnce(
    source,
    `  XLSX.utils.book_append_sheet(workbook, sheet, "Monthly_Team_Summary");\n  XLSX.writeFile(workbook, makePaymentFileName(monthKey));`,
    `  XLSX.utils.book_append_sheet(workbook, sheet, "Monthly_Team_Summary");\n\n  const paymentCycleRows = sortedDocs.map((doc) => {\n    const entries = effectiveEntriesForDoc(doc, signatures);\n    const incentive = getDocumentIncentive(doc);\n    return {\n      Agent: doc.agentName,\n      "Performance Month": doc.monthKey,\n      "Payment Cycle": doc.paymentCycle || monthKey,\n      "Carry Over From": doc.carryOverFrom || "",\n      "Signature Completed At": doc.signatureCompletedAt || getSignatureCompletedAt(entries) || "",\n      "Payment Status": doc.paymentStatus || (doc.carryOverFrom ? "Carry Over" : "Ready"),\n      Grade: doc.grade,\n      "Average Score": doc.averageScore,\n      "Cash Incentive (THB)": incentive.cash,\n      "RBH Promo (THB)": incentive.promo,\n      "Document Ref.": getMonthlyDocumentRef(doc, allMonthDocs.length ? allMonthDocs : sortedDocs),\n    };\n  });\n  const paymentCycleSheet = XLSX.utils.json_to_sheet(paymentCycleRows);\n  XLSX.utils.book_append_sheet(workbook, paymentCycleSheet, "Payment_Cycle_Detail");\n  XLSX.writeFile(workbook, makePaymentFileName(monthKey));`,
    "payment cycle detail worksheet"
  );

  source = replaceOnce(
    source,
    `    const statusText = getSignatureValidationStatus(doc, entries);\n    const incentive = getDocumentIncentive(doc);`,
    `    const statusText = doc.carryOverFrom\n      ? \`${'${doc.paymentStatus || "Carry Over"}'} / From ${'${doc.carryOverFrom}'} / Pay ${'${doc.paymentCycle || monthKey}'}\`\n      : getSignatureValidationStatus(doc, entries);\n    const incentive = getDocumentIncentive(doc);`,
    "payment PDF carry-over status"
  );

  source = replaceOnce(
    source,
    `  const generatePaymentExcel = () => {`,
    `  const markCurrentCarryOversExported = async () => {\n    if (selectedMonth === "all") return;\n    const carryOvers = selectedMonthPaymentExportDocs.filter((doc) => Boolean(doc.carryOverFrom));\n    if (!carryOvers.length) return;\n    const exportedBy = currentUser.username || currentUser.displayName || currentUser.agentName || "";\n    const savedStates = await Promise.all(\n      carryOvers.map((doc) =>\n        markPaymentCarryOverExported({\n          docId: doc.id,\n          performanceMonth: doc.monthKey,\n          paymentCycle: selectedMonth,\n          signatureCompletedAt: doc.signatureCompletedAt || getSignatureCompletedAt(effectiveEntriesForDoc(doc, signatures)),\n          exportedBy,\n        })\n      )\n    );\n    setPaymentCarryOverStates((previous) => {\n      const next = { ...previous };\n      savedStates.forEach((state) => {\n        next[state.docId] = state;\n      });\n      return next;\n    });\n  };\n\n  const generatePaymentExcel = async () => {`,
    "payment carry-over export marker"
  );

  source = replaceOnce(
    source,
    `      generatePaymentExcelFile(selectedMonth, selectedMonthPaymentExportDocs, signatures, selectedMonthAllDocs);\n      setPaymentMessage(`,
    `      generatePaymentExcelFile(selectedMonth, selectedMonthPaymentExportDocs, signatures, selectedMonthAllDocs);\n      await markCurrentCarryOversExported();\n      setPaymentMessage(`,
    "excel export carry-over persistence"
  );

  source = replaceOnce(
    source,
    `  const generatePaymentPdf = () => {`,
    `  const generatePaymentPdf = async () => {`,
    "async payment PDF export"
  );

  source = replaceOnce(
    source,
    `      const fileName = generatePaymentPdfFile(selectedMonth, selectedMonthPaymentExportDocs, signatures, selectedMonthAllDocs);\n      setPaymentMessage(`,
    `      const fileName = generatePaymentPdfFile(selectedMonth, selectedMonthPaymentExportDocs, signatures, selectedMonthAllDocs);\n      await markCurrentCarryOversExported();\n      setPaymentMessage(`,
    "pdf export carry-over persistence"
  );

  fs.writeFileSync(signatureCenterPath, source, "utf8");
}

console.log("Patched Signature Center: late signatures carry over to the next eligible payment cycle with export metadata and persisted export state.");
