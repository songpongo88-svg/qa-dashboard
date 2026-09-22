import fs from "node:fs";

const file = "src/DashboardMockup.tsx";
const marker = "// case-detail-original-comment-metadata-v1";
let source = fs.readFileSync(file, "utf8");

if (source.includes(marker)) {
  console.log("Case Detail Original Comment metadata v1 already applied");
  process.exit(0);
}

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
