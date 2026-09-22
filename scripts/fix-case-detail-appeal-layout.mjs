import fs from 'node:fs';

const file = 'src/DashboardMockup.tsx';
let s = fs.readFileSync(file, 'utf8');

function replaceOnce(search, replacement, label) {
  if (s.includes(replacement)) return;
  if (!s.includes(search)) throw new Error(`Missing anchor: ${label}`);
  s = s.replace(search, replacement);
}

replaceOnce(
`  appealStatus,
  appealReviewedTopics,
}: {`,
`  appealStatus,
  appealReviewedTopics,
  appealSubmittedBy,
  appealSubmittedAt,
  appealReviewedBy,
  appealReviewedAt,
}: {`,
'component props destructuring'
);

replaceOnce(
`  appealStatus?: "Approved" | "Rejected";
  appealReviewedTopics?: AppealReviewedTopic[] | null;
}) {`,
`  appealStatus?: "Approved" | "Rejected";
  appealReviewedTopics?: AppealReviewedTopic[] | null;
  appealSubmittedBy?: string;
  appealSubmittedAt?: string;
  appealReviewedBy?: string;
  appealReviewedAt?: string;
}) {`,
'component prop types'
);

replaceOnce(
`      const rejectedReviewTopic =
        appealStatus === "Rejected"
          ? appealReviewedTopics?.find((item) => item.code === originalTopic.code)
          : undefined;`,
`      const appealReviewTopic =
        appealStatus === "Approved" || appealStatus === "Rejected"
          ? appealReviewedTopics?.find((item) => item.code === originalTopic.code)
          : undefined;
      const rejectedReviewTopic = appealStatus === "Rejected" ? appealReviewTopic : undefined;`,
'appeal topic lookup'
);

replaceOnce(
`        revisedTopic,
        rejectedReviewTopic,
        shownTopic,`,
`        revisedTopic,
        appealReviewTopic,
        rejectedReviewTopic,
        shownTopic,`,
'row appeal topic value'
);

replaceOnce(
`      revisedTopic?: Topic;
      rejectedReviewTopic?: AppealReviewedTopic;
      shownTopic: Topic;`,
`      revisedTopic?: Topic;
      appealReviewTopic?: AppealReviewedTopic;
      rejectedReviewTopic?: AppealReviewedTopic;
      shownTopic: Topic;`,
'row appeal topic type'
);

const detailPattern = /\n            <div className="mt-4 space-y-4">\n              \{row\.rejectedReviewTopic \? \([\s\S]*?\n            <\/div>\n          <\/div>\n        \)\) : \(/;
if (!detailPattern.test(s)) throw new Error('Case Detail appeal detail block not found');

const replacement = `
            <div className="mt-4 space-y-4">
              {row.appealReviewTopic ? (
                <>
                  <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="text-[13px] font-semibold text-slate-600">Original Comment</div>
                    <div className="mt-4 whitespace-pre-line leading-7 text-slate-800">
                      <RichTextContent value={row.originalTopic.comment} fallback="ยังไม่มี Evaluation Comment" />
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-amber-200 bg-amber-50/80 px-4 py-4">
                    <div className="space-y-1 text-[13px] font-semibold text-amber-950">
                      <div><span className="font-extrabold">Admin:</span> {appealSubmittedBy || "-"}</div>
                      <div><span className="font-extrabold">Appeal Submit:</span> {formatBangkokDateTime(appealSubmittedAt || null)}</div>
                    </div>
                    <div className="mt-4 text-[13px] font-semibold text-amber-700">Appeal Reason</div>
                    <div className="mt-2 whitespace-pre-line leading-7 text-amber-950">
                      <RichTextContent value={row.appealReviewTopic.appealReason} fallback="ไม่พบ Appeal Reason" />
                    </div>
                  </div>

                  <div className={\`rounded-[20px] border px-4 py-4 \${appealStatus === "Rejected" ? "border-rose-200 bg-rose-50/80" : "border-violet-200 bg-violet-50"}\`}>
                    <div className={\`space-y-1 text-[13px] font-semibold \${appealStatus === "Rejected" ? "text-rose-800" : "text-violet-800"}\`}>
                      <div><span className="font-extrabold">QA:</span> {appealReviewedBy || "-"}</div>
                      <div><span className="font-extrabold">Appeal Result:</span> {formatBangkokDateTime(appealReviewedAt || null)}</div>
                    </div>
                    <div className={\`mt-4 text-[13px] font-semibold \${appealStatus === "Rejected" ? "text-rose-700" : "text-violet-700"}\`}>
                      {appealStatus === "Rejected" ? "Reject Reason" : "Revised Comment"}
                    </div>
                    <div className={\`mt-2 whitespace-pre-line leading-7 \${appealStatus === "Rejected" ? "text-rose-800" : "text-violet-700"}\`}>
                      <RichTextContent
                        value={appealStatus === "Rejected"
                          ? row.appealReviewTopic.comment
                          : row.revisedTopic?.comment || row.appealReviewTopic.comment}
                        fallback={appealStatus === "Rejected" ? "ไม่พบ Reject Reason" : "ยังไม่มี Revised Comment"}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-[13px] font-semibold text-slate-600">Original Comment</div>
                  <div className="mt-4 whitespace-pre-line leading-7 text-slate-800">
                    <RichTextContent value={row.shownTopic.comment} fallback="ยังไม่มี Evaluation Comment" />
                  </div>
                </div>
              )}
            </div>
          </div>
        )) : (`;
s = s.replace(detailPattern, replacement);

replaceOnce(
`                appealStatus={caseItem.appealStatus}
                appealReviewedTopics={caseItem.appealReviewedTopics}
              />`,
`                appealStatus={caseItem.appealStatus}
                appealReviewedTopics={caseItem.appealReviewedTopics}
                appealSubmittedBy={caseItem.appealSubmittedBy}
                appealSubmittedAt={caseItem.appealSubmittedAt}
                appealReviewedBy={caseItem.appealReviewedBy}
                appealReviewedAt={caseItem.appealReviewedAt}
              />`,
'Case Detail component call metadata'
);

fs.writeFileSync(file, s, 'utf8');
console.log('Applied Case Detail appeal layout fix');
