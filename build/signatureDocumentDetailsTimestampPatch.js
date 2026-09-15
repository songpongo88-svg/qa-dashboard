export function signatureDocumentDetailsTimestampPatch() {
  return {
    name: "signature-document-details-countdown",
    enforce: "post",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/SignatureCenterMockup.tsx")) return null;

      let next = code;
      const original = next;

      // Keep a live clock for the Document Details countdown.
      next = next.replace(
        '  const [workspaceDetailOpen, setWorkspaceDetailOpen] = useState(true);',
        '  const [workspaceDetailOpen, setWorkspaceDetailOpen] = useState(true);\n  const [signatureCountdownNow, setSignatureCountdownNow] = useState(() => Date.now());'
      );

      next = next.replace(
        '  const shareLinkAppliedRef = useRef(false);',
        `  const shareLinkAppliedRef = useRef(false);\n\n  useEffect(() => {\n    const timer = window.setInterval(() => setSignatureCountdownNow(Date.now()), 1000);\n    return () => window.clearInterval(timer);\n  }, []);`
      );

      // Add Time Remaining as the first row in Document Details, before Month.
      const detailsTableAnchor = '                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">\n                  {[';
      const detailsTableReplacement = `                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">\n                  <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-3 border-b border-slate-100 px-3.5 py-2.5 text-sm">\n                    <div className="font-normal text-slate-500">Time Remaining</div>\n                    <div className="break-words font-bold tabular-nums text-rose-600">\n                      {(() => {\n                        const pendingRoles = getPendingRoles(selectedEntries);\n                        if (!pendingRoles.length) return "Completed";\n\n                        const activeResetDeadlines = pendingRoles\n                          .map((role) => getActiveDeadlineResetEntry(selectedEntries, role, new Date(signatureCountdownNow)))\n                          .map((entry) => getDeadlineResetExpiresAt(entry)?.getTime() || 0)\n                          .filter((time) => time > signatureCountdownNow);\n\n                        const regularDueAt = getSignatureDueDate(selectedDocument.monthKey)?.getTime() || 0;\n                        const deadlineAt = activeResetDeadlines.length\n                          ? Math.max(...activeResetDeadlines)\n                          : regularDueAt;\n\n                        if (!deadlineAt || deadlineAt <= signatureCountdownNow) return "Overdue";\n\n                        const remaining = deadlineAt - signatureCountdownNow;\n                        const days = Math.floor(remaining / 86400000);\n                        const hours = Math.floor((remaining % 86400000) / 3600000);\n                        const minutes = Math.floor((remaining % 3600000) / 60000);\n                        const seconds = Math.floor((remaining % 60000) / 1000);\n                        const pad = (value: number) => String(value).padStart(2, "0");\n                        return \`${'${pad(days)}'}d ${'${pad(hours)}'}h ${'${pad(minutes)}'}m ${'${pad(seconds)}'}s\`;\n                      })()}\n                    </div>\n                  </div>\n                  {[`;
      next = next.replace(detailsTableAnchor, detailsTableReplacement);

      // Restore Signature Timeline to signer name only; no signed timestamp appended.
      next = next.replace(
        /\? `Signed by \$\{signerName\} • \$\{formatDateTime\(signedEntry\.signedAt\)\}`/g,
        '? `Signed by ${signerName}`'
      );
      next = next.replace(
        /\? `Resigned \$\{waivedEntry\.resignationDate \|\| ""\} • confirmed by \$\{signerName\} • \$\{formatDateTime\(waivedEntry\.waivedAt \|\| ""\)\}`/g,
        '? `Resigned ${waivedEntry.resignationDate || ""} • confirmed by ${signerName}`'
      );

      // Remove Team / case count / average-score subtext under the assessed agent in the document list.
      next = next.replace(
        /\n\s*<div className="mt-0\.5 truncate text-xs font-normal text-slate-500">\s*\n\s*\{doc\.teamName \|\| "-"\} • \{doc\.caseCount\} เคส • \{doc\.averageScore\.toFixed\(2\)\}\s*\n\s*<\/div>/g,
        ""
      );

      return next === original ? null : { code: next, map: null };
    },
  };
}
