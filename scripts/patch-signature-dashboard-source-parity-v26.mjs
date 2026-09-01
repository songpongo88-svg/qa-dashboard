import fs from "node:fs";

const signaturePath = "src/SignatureCenterMockup.tsx";
const marker = "// signature-dashboard-source-parity-v26";
const requiredMarker = "final-signed-direct-source-v13";

let source = fs.readFileSync(signaturePath, "utf8");
if (source.includes(marker)) {
  console.log("signature dashboard source parity v26 already applied");
  process.exit(0);
}
if (!source.includes(requiredMarker)) {
  throw new Error("Signature Center v13 marker not found; run patch:final-signed-direct-source first");
}

const helperAnchor = "function applySignatureAppealTopics(";
if (!source.includes(helperAnchor)) {
  throw new Error("Signature Center appeal helper anchor not found");
}

const helper = `${marker}\nfunction normalizeSignatureAppealCaseKey(value) {\n  return normalizeText(value).replace(/\\s+/g, \"\").toUpperCase();\n}\n\nfunction mergeSignatureAppealSources(\n  rawMap: Map<string, SignatureApprovedAppeal>,\n  firebaseMap: Map<string, SignatureApprovedAppeal>\n) {\n  // Match Dashboard precedence exactly: Appeal ROWDATA remains authoritative for\n  // a Case ID already present there; reviewed Firebase results fill only cases\n  // that are not yet represented in Appeal ROWDATA.\n  const merged = new Map(rawMap);\n  const rawCaseIds = new Set(\n    [...rawMap.keys()]\n      .map((key) => normalizeSignatureAppealCaseKey(String(key).split(\"::\")[0]))\n      .filter(Boolean)\n  );\n\n  firebaseMap.forEach((appeal, key) => {\n    const caseId = normalizeSignatureAppealCaseKey(String(key).split(\"::\")[0]);\n    if (!caseId || rawCaseIds.has(caseId)) return;\n    merged.set(key, appeal);\n  });\n\n  return merged;\n}\n\n`;
source = source.replace(helperAnchor, helper + helperAnchor);

const fallbackCondition = "if (!approvedAppealMap.size) {";
const conditionCount = source.split(fallbackCondition).length - 1;
if (conditionCount < 2) {
  throw new Error(`Expected both Signature Center appeal fallback blocks, found ${conditionCount}`);
}
source = source.replaceAll(
  fallbackCondition,
  "{ // v26: always read reviewed Firebase appeals, then merge with Appeal ROWDATA precedence"
);

const assignment = "approvedAppealMap = buildSignatureApprovedAppealMap(approvedAppealLogs as UsageLogEvent[]);";
const assignmentCount = source.split(assignment).length - 1;
if (assignmentCount < 2) {
  throw new Error(`Expected both Signature Center approved appeal assignments, found ${assignmentCount}`);
}
source = source.replaceAll(
  assignment,
  "approvedAppealMap = mergeSignatureAppealSources(rawAppealMap, buildSignatureApprovedAppealMap(approvedAppealLogs as UsageLogEvent[]));"
);

const stateAnchor = "  const [documents, setDocuments] = useState<SignatureDocument[]>([]);";
if (!source.includes(stateAnchor)) {
  throw new Error("Signature Center documents state anchor not found");
}
source = source.replace(
  stateAnchor,
  `${stateAnchor}\n  const [signatureDataRefreshKey, setSignatureDataRefreshKey] = useState(0);`
);

const appealRefreshEffect = `    void loadAppeals();\n    return () => {\n      alive = false;\n    };\n  }, []);`;
if (!source.includes(appealRefreshEffect)) {
  throw new Error("Signature Center appeal load effect anchor not found");
}
source = source.replace(
  appealRefreshEffect,
  `    void loadAppeals();\n    return () => {\n      alive = false;\n    };\n  }, [signatureDataRefreshKey]);`
);

const documentsEffectEnd = `    void load();\n    return () => {\n      alive = false;\n    };\n  }, [accounts]);`;
if (!source.includes(documentsEffectEnd)) {
  throw new Error("Signature Center document load dependency anchor not found");
}
source = source.replace(
  documentsEffectEnd,
  `    void load();\n    return () => {\n      alive = false;\n    };\n  }, [accounts, signatureDataRefreshKey]);`
);

const listenerAnchor = `  useEffect(() => {\n    if (typeof window !== \"undefined\") {\n      window.sessionStorage.setItem(\"signature-document-actions-mode\", actionSidebarMode);\n    }\n  }, [actionSidebarMode]);`;
if (!source.includes(listenerAnchor)) {
  throw new Error("Signature Center action sidebar effect anchor not found");
}
source = source.replace(
  listenerAnchor,
  `${listenerAnchor}\n\n  useEffect(() => {\n    if (typeof window === \"undefined\") return;\n    const refresh = () => setSignatureDataRefreshKey(Date.now());\n    window.addEventListener(\"qa-dashboard-data-refresh\", refresh);\n    return () => window.removeEventListener(\"qa-dashboard-data-refresh\", refresh);\n  }, []);`
);

fs.writeFileSync(signaturePath, source, "utf8");
console.log("signature dashboard source parity + live appeal refresh v26 applied");
