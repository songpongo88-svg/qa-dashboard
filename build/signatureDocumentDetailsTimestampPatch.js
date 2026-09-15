export function signatureDocumentDetailsTimestampPatch() {
  return {
    name: "signature-document-details-timestamp",
    enforce: "post",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/SignatureCenterMockup.tsx")) return null;

      const start = code.indexOf('>Document Details</div>');
      const end = code.indexOf('{(() => {', start);
      if (start < 0 || end <= start) return null;

      let block = code.slice(start, end);
      const before = block;

      block = block.replace(
        'className="mt-0.5 truncate text-xs font-normal text-slate-500"',
        'className="mt-0.5 text-xs font-normal leading-5 text-slate-500"'
      );

      block = block.replace(
        '? `Signed by ${signerName}`',
        '? `Signed by ${signerName} • ${formatDateTime(signedEntry.signedAt)}`'
      );

      block = block.replace(
        '? `Resigned ${waivedEntry.resignationDate || ""} • confirmed by ${signerName}`',
        '? `Resigned ${waivedEntry.resignationDate || ""} • confirmed by ${signerName} • ${formatDateTime(waivedEntry.waivedAt || "")}`'
      );

      if (block === before) return null;
      const next = code.slice(0, start) + block + code.slice(end);
      return { code: next, map: null };
    },
  };
}
