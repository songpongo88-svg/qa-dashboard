import fs from "node:fs";

const file = "src/DashboardMockup.tsx";
const marker = "// case-detail-original-comment-metadata-v1";
let source = fs.readFileSync(file, "utf8");

if (!source.includes(marker)) {
  function replaceOnce(before, after, label) {
    if (!source.includes(before)) throw new Error(`Missing ${label}`);
    source = source.replace(before, after);
  }

  replaceOnce(
`  appealReviewedBy,
  appealReviewedAt,
}: {`,
`  appealReviewedBy,
  appealReviewedAt,
  originalQaName,
  originalAuditDate,
}: {`,
"CaseDetailTopicTable destructured props"
  );

  replaceOnce(
`  appealReviewedBy?: string;
  appealReviewedAt?: string;
}) {`,
`  appealReviewedBy?: string;
  appealReviewedAt?: string;
  originalQaName?: string;
  originalAuditDate?: string;
}) {
  ${marker}`,
"CaseDetailTopicTable prop types"
  );

  const appealOriginalBefore = `                  <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="text-[13px] font-semibold text-slate-600">Original Comment</div>
                    <div className="mt-4 whitespace-pre-line leading-7 text-slate-800">
                      <RichTextContent value={row.originalTopic.comment} fallback="ยังไม่มี Evaluation Comment" />
                    </div>
                  </div>`;

  const appealOriginalAfter = `                  <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="text-[13px] font-semibold text-slate-600">Original Comment</div>
                    <div className="mt-3 space-y-1 text-[13px] font-semibold text-slate-700">
                      <div><span className="font-extrabold">QA:</span> {originalQaName || "-"}</div>
                      <div><span className="font-extrabold">Audit Date:</span> {originalAuditDate || "-"}</div>
                    </div>
                    <div className="mt-3 whitespace-pre-line leading-7 text-slate-800">
                      <RichTextContent value={row.originalTopic.comment} fallback="ยังไม่มี Evaluation Comment" />
                    </div>
                  </div>`;
  replaceOnce(appealOriginalBefore, appealOriginalAfter, "Appeal Original Comment block");

  const normalOriginalBefore = `                <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-[13px] font-semibold text-slate-600">Original Comment</div>
                  <div className="mt-4 whitespace-pre-line leading-7 text-slate-800">
                    <RichTextContent value={row.shownTopic.comment} fallback="ยังไม่มี Evaluation Comment" />
                  </div>
                </div>`;

  const normalOriginalAfter = `                <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-[13px] font-semibold text-slate-600">Original Comment</div>
                  <div className="mt-3 space-y-1 text-[13px] font-semibold text-slate-700">
                    <div><span className="font-extrabold">QA:</span> {originalQaName || "-"}</div>
                    <div><span className="font-extrabold">Audit Date:</span> {originalAuditDate || "-"}</div>
                  </div>
                  <div className="mt-3 whitespace-pre-line leading-7 text-slate-800">
                    <RichTextContent value={row.shownTopic.comment} fallback="ยังไม่มี Evaluation Comment" />
                  </div>
                </div>`;
  replaceOnce(normalOriginalBefore, normalOriginalAfter, "Normal Original Comment block");

  replaceOnce(
`                appealReviewedBy={caseItem.appealReviewedBy}
                appealReviewedAt={caseItem.appealReviewedAt}
              />`,
`                appealReviewedBy={caseItem.appealReviewedBy}
                appealReviewedAt={caseItem.appealReviewedAt}
                originalQaName={caseItem.evaluatorName}
                originalAuditDate={caseItem.auditTimestamp}
              />`,
"CaseDetailTopicTable metadata props"
  );

  fs.writeFileSync(file, source, "utf8");
  console.log("Applied Case Detail Original Comment QA and Audit Date metadata v1");
} else {
  console.log("Case Detail Original Comment metadata v1 already applied");
}

const qaAccessFile = "build/qaAccessCaseLinkPatchV2.js";
let qaAccess = fs.readFileSync(qaAccessFile, "utf8");
const qaAccessMarker = "// original-comment-metadata-compat-v1";

if (!qaAccess.includes(qaAccessMarker)) {
  function replaceQa(before, after, label) {
    if (!qaAccess.includes(before)) throw new Error(`Missing QA Access ${label}`);
    qaAccess = qaAccess.replace(before, after);
  }

  replaceQa(
`          '  appealReviewedTopics,\\n  appealSubmittedBy,\\n  appealSubmittedAt,\\n  appealReviewedBy,\\n  appealReviewedAt,\\n}: {\\n  topics: Topic[];',
          '  appealReviewedTopics,\\n  appealSubmittedBy,\\n  appealSubmittedAt,\\n  appealReviewedBy,\\n  appealReviewedAt,\\n  caseId,\\n  targetUsername,\\n}: {\\n  topics: Topic[];',`,
`          '  appealReviewedTopics,\\n  appealSubmittedBy,\\n  appealSubmittedAt,\\n  appealReviewedBy,\\n  appealReviewedAt,\\n  originalQaName,\\n  originalAuditDate,\\n}: {\\n  topics: Topic[];',
          '  appealReviewedTopics,\\n  appealSubmittedBy,\\n  appealSubmittedAt,\\n  appealReviewedBy,\\n  appealReviewedAt,\\n  originalQaName,\\n  originalAuditDate,\\n  caseId,\\n  targetUsername,\\n}: {\\n  topics: Topic[];',`,
"dashboard props anchor"
  );

  replaceQa(
`          '  appealStatus?: "Approved" | "Rejected";\\n  appealReviewedTopics?: AppealReviewedTopic[] | null;\\n  appealSubmittedBy?: string;\\n  appealSubmittedAt?: string;\\n  appealReviewedBy?: string;\\n  appealReviewedAt?: string;\\n}) {',
          '  appealStatus?: "Approved" | "Rejected";\\n  appealReviewedTopics?: AppealReviewedTopic[] | null;\\n  appealSubmittedBy?: string;\\n  appealSubmittedAt?: string;\\n  appealReviewedBy?: string;\\n  appealReviewedAt?: string;\\n  caseId?: string;\\n  targetUsername?: string;\\n}) {',`,
`          '  appealStatus?: "Approved" | "Rejected";\\n  appealReviewedTopics?: AppealReviewedTopic[] | null;\\n  appealSubmittedBy?: string;\\n  appealSubmittedAt?: string;\\n  appealReviewedBy?: string;\\n  appealReviewedAt?: string;\\n  originalQaName?: string;\\n  originalAuditDate?: string;\\n}) {',
          '  appealStatus?: "Approved" | "Rejected";\\n  appealReviewedTopics?: AppealReviewedTopic[] | null;\\n  appealSubmittedBy?: string;\\n  appealSubmittedAt?: string;\\n  appealReviewedBy?: string;\\n  appealReviewedAt?: string;\\n  originalQaName?: string;\\n  originalAuditDate?: string;\\n  caseId?: string;\\n  targetUsername?: string;\\n}) {',`,
"dashboard prop types anchor"
  );

  replaceQa(
`          '                appealStatus={caseItem.appealStatus}\\n                appealReviewedTopics={caseItem.appealReviewedTopics}\\n                appealSubmittedBy={caseItem.appealSubmittedBy}\\n                appealSubmittedAt={caseItem.appealSubmittedAt}\\n                appealReviewedBy={caseItem.appealReviewedBy}\\n                appealReviewedAt={caseItem.appealReviewedAt}\\n              />',
          '                appealStatus={caseItem.appealStatus}\\n                appealReviewedTopics={caseItem.appealReviewedTopics}\\n                appealSubmittedBy={caseItem.appealSubmittedBy}\\n                appealSubmittedAt={caseItem.appealSubmittedAt}\\n                appealReviewedBy={caseItem.appealReviewedBy}\\n                appealReviewedAt={caseItem.appealReviewedAt}\\n                caseId={caseItem.caseId}\\n                targetUsername={caseItem.targetUsername}\\n              />',`,
`          '                appealStatus={caseItem.appealStatus}\\n                appealReviewedTopics={caseItem.appealReviewedTopics}\\n                appealSubmittedBy={caseItem.appealSubmittedBy}\\n                appealSubmittedAt={caseItem.appealSubmittedAt}\\n                appealReviewedBy={caseItem.appealReviewedBy}\\n                appealReviewedAt={caseItem.appealReviewedAt}\\n                originalQaName={caseItem.evaluatorName}\\n                originalAuditDate={caseItem.auditTimestamp}\\n              />',
          '                appealStatus={caseItem.appealStatus}\\n                appealReviewedTopics={caseItem.appealReviewedTopics}\\n                appealSubmittedBy={caseItem.appealSubmittedBy}\\n                appealSubmittedAt={caseItem.appealSubmittedAt}\\n                appealReviewedBy={caseItem.appealReviewedBy}\\n                appealReviewedAt={caseItem.appealReviewedAt}\\n                originalQaName={caseItem.evaluatorName}\\n                originalAuditDate={caseItem.auditTimestamp}\\n                caseId={caseItem.caseId}\\n                targetUsername={caseItem.targetUsername}\\n              />',`,
"dashboard case values anchor"
  );

  qaAccess = qaAccess.replace(
    'function mustReplace(context, code, search, replacement, label) {',
    `${qaAccessMarker}\nfunction mustReplace(context, code, search, replacement, label) {`
  );
  fs.writeFileSync(qaAccessFile, qaAccess, "utf8");
  console.log("Updated QA Access case-link v2 anchors for Original Comment metadata props");
} else {
  console.log("QA Access Original Comment metadata compatibility already applied");
}
