export function assessmentReasonRawTextPatch() {
  return {
    name: "assessment-reason-raw-text",
    enforce: "pre",
    transform(code, id) {
      const normalized = id.replace(/\\/g, "/");
      let next = code;
      const original = code;

      if (normalized.endsWith("/src/CreateEvaluationMockup.tsx")) {
        const topicStateAnchor = `type TopicState = {\n  score: number | null;\n  reason: string;\n};`;
        const assessmentDisplayHelper = `${topicStateAnchor}\n\nfunction AssessmentReasonTextDisplay({\n  value,\n  fallback = \"-\",\n  className = \"\",\n}: {\n  value: unknown;\n  fallback?: string;\n  className?: string;\n}) {\n  const rawText = String(value ?? \"\");\n  if (!rawText) return <div className={className}>{fallback}</div>;\n\n  // Keep legacy rich-text records readable, but render all new Assessment Reason\n  // values as untouched raw text so every newline/blank line is preserved.\n  const looksLikeLegacyRichText = /<\\/?(?:div|p|br|strong|b|em|i|u|span|ul|ol|li)\\b/i.test(rawText);\n  if (looksLikeLegacyRichText) {\n    return <RichTextContent value={rawText} fallback={fallback} className={className} />;\n  }\n\n  return (\n    <div className={\`whitespace-pre-wrap break-words \${className}\`}>\n      {rawText}\n    </div>\n  );\n}`;
        if (next.includes(topicStateAnchor) && !next.includes("function AssessmentReasonTextDisplay")) {
          next = next.replace(topicStateAnchor, assessmentDisplayHelper);
        }

        next = next.replace(
          /<RichTextEditor\s+value=\{topicState\[topic\.code\]\?\.reason \|\| \"\"\}\s+onChange=\{\(reason\) => updateTopic\(topic\.code, \{ reason \}\)\}\s+editorLabel=\{`Assessment Reason · \$\{topic\.code\}`\}\s+minHeight=\{108\}\s+placeholder=\"ระบุเหตุผลการประเมินหัวข้อนี้\.\.\.\"\s*\/>/m,
          `<textarea\n                                      value={topicState[topic.code]?.reason || \"\"}\n                                      onChange={(event) => updateTopic(topic.code, { reason: event.target.value })}\n                                      rows={5}\n                                      spellCheck={false}\n                                      placeholder=\"ระบุเหตุผลการประเมินหัวข้อนี้...\"\n                                      className=\"mt-2 min-h-[108px] w-full resize-y rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm font-semibold leading-6 text-slate-800 outline-none transition whitespace-pre-wrap break-words focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100\"\n                                    />`
        );

        next = next.replace(
          'base[`${topic.code} Comment`] = richTextToPlainText(topicState[topic.code]?.reason) || "-";',
          'base[`${topic.code} Comment`] = topicState[topic.code]?.reason || "-";'
        );

        next = next.replace(
          'row[`${code} Comment`] = richTextToPlainText(topic?.comment ?? "");',
          'row[`${code} Comment`] = String(topic?.comment ?? "");'
        );

        next = next.replace(
          '<RichTextContent value={topic.comment} className="mt-1 whitespace-pre-line text-sm font-semibold leading-6 text-slate-700" />',
          '<AssessmentReasonTextDisplay value={topic.comment} className="mt-1 text-sm font-semibold leading-6 text-slate-700" />'
        );
      }

      if (normalized.endsWith("/src/DashboardMockup.tsx")) {
        const topicTypeAnchor = `type Topic = {\n  code: string;\n  label: string;\n  score: number;\n  max: number;\n  pct: number;\n  comment?: string;\n};`;
        const dashboardAssessmentDisplayHelper = `${topicTypeAnchor}\n\nfunction AssessmentReasonTextDisplay({\n  value,\n  fallback = \"-\",\n  className = \"\",\n}: {\n  value: unknown;\n  fallback?: string;\n  className?: string;\n}) {\n  const rawText = String(value ?? \"\");\n  if (!rawText) return <div className={className}>{fallback}</div>;\n\n  const looksLikeLegacyRichText = /<\\/?(?:div|p|br|strong|b|em|i|u|span|ul|ol|li)\\b/i.test(rawText);\n  if (looksLikeLegacyRichText) {\n    return <RichTextContent value={rawText} fallback={fallback} className={className} />;\n  }\n\n  return (\n    <div className={\`whitespace-pre-wrap break-words \${className}\`}>\n      {rawText}\n    </div>\n  );\n}`;
        if (next.includes(topicTypeAnchor) && !next.includes("function AssessmentReasonTextDisplay")) {
          next = next.replace(topicTypeAnchor, dashboardAssessmentDisplayHelper);
        }

        next = next
          .replaceAll(
            '<RichTextContent value={row.originalTopic.comment} fallback="ยังไม่มี Evaluation Comment" />',
            '<AssessmentReasonTextDisplay value={row.originalTopic.comment} fallback="ยังไม่มี Evaluation Comment" />'
          )
          .replaceAll(
            '<RichTextContent value={row.shownTopic.comment} fallback="ยังไม่มี Evaluation Comment" />',
            '<AssessmentReasonTextDisplay value={row.shownTopic.comment} fallback="ยังไม่มี Evaluation Comment" />'
          )
          .replaceAll(
            '<RichTextContent value={topic.comment} fallback="ไม่มีความคิดเห็นเพิ่มเติม" />',
            '<AssessmentReasonTextDisplay value={topic.comment} fallback="ไม่มีความคิดเห็นเพิ่มเติม" />'
          );

        // The wrapper previously used whitespace-pre-line, which collapses repeated blank lines.
        // pre-wrap is required for Assessment Reason raw text.
        next = next.replaceAll(
          'className="mt-4 whitespace-pre-line leading-7 text-slate-800"',
          'className="mt-4 whitespace-pre-wrap break-words leading-7 text-slate-800"'
        );
        next = next.replaceAll(
          'className="mt-2 whitespace-pre-line text-sm font-normal leading-6 text-slate-700"',
          'className="mt-2 whitespace-pre-wrap break-words text-sm font-normal leading-6 text-slate-700"'
        );
      }

      return next === original ? null : { code: next, map: null };
    },
  };
}
