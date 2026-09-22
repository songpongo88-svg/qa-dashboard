import fs from "node:fs";

const path = "src/DashboardMockup.tsx";
let text = fs.readFileSync(path, "utf8");

// Repair the v1 patch if it attached reviewedTopics to the Firebase merge object.
const firebaseAccidentalPattern = /reviewStatus: "Revised",\n\s*revisedTopics,\n\s*reviewedTopics,\n\s*displayRevisedTopicCodes,\n\s*submittedAt: formatCaseDetailDateTime\(request\.submittedAt\),/;
if (firebaseAccidentalPattern.test(text)) {
  text = text.replace(
    firebaseAccidentalPattern,
    `reviewStatus: "Revised",\n      revisedTopics,\n      displayRevisedTopicCodes,\n      submittedAt: formatCaseDetailDateTime(request.submittedAt),`
  );
}

// Attach the independently collected Appeal Reason topics to legacy Excel rows only.
const excelMergePattern = /reviewStatus: displayRevisedTopicCodes\.length \? "Revised" : "Original",\n\s*revisedTopics,\n\s*displayRevisedTopicCodes,\n\s*submittedAt:/;
if (excelMergePattern.test(text)) {
  text = text.replace(
    excelMergePattern,
    `reviewStatus: displayRevisedTopicCodes.length ? "Revised" : "Original",\n            revisedTopics,\n            reviewedTopics,\n            displayRevisedTopicCodes,\n            submittedAt:`
  );
} else if (!/reviewStatus: displayRevisedTopicCodes\.length \? "Revised" : "Original",\n\s*revisedTopics,\n\s*reviewedTopics,\n\s*displayRevisedTopicCodes,\n\s*submittedAt:/.test(text)) {
  throw new Error("Legacy Excel Appeal reviewedTopics merge anchor not found");
}

// Do not drop a legacy appeal row when it has Appeal Reason but no revised score/comment.
const dropPattern = /if \(!revisedTopics\.length && finalScore === undefined\) return;/;
if (dropPattern.test(text)) {
  text = text.replace(
    dropPattern,
    `// legacy-appeal-reason-fallback-v2\n          if (!revisedTopics.length && !reviewedTopics.length && finalScore === undefined) return;`
  );
} else if (!text.includes("legacy-appeal-reason-fallback-v2")) {
  throw new Error("Legacy Appeal reason-only row retention anchor not found");
}

if (!text.includes("reviewedTopics?: Topic[];")) {
  throw new Error("AppealMergeItem reviewedTopics field missing");
}
if (!text.includes("mergedAppeal?.reviewedTopics?.length")) {
  throw new Error("Case Detail reviewedTopics fallback missing");
}
if (!/reviewStatus: displayRevisedTopicCodes\.length \? "Revised" : "Original",\n\s*revisedTopics,\n\s*reviewedTopics,\n\s*displayRevisedTopicCodes,\n\s*submittedAt:/.test(text)) {
  throw new Error("Legacy Excel reviewedTopics were not attached to appealMap");
}
if (/reviewStatus: "Revised",\n\s*revisedTopics,\n\s*reviewedTopics,\n\s*displayRevisedTopicCodes,\n\s*submittedAt: formatCaseDetailDateTime\(request\.submittedAt\),/.test(text)) {
  throw new Error("Firebase Appeal merge still contains an undefined reviewedTopics reference");
}

fs.writeFileSync(path, text);
console.log("Finalized legacy Appleal Appeal Reason fallback and repaired Firebase merge isolation.");
