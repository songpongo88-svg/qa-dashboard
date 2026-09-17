// Applied last, including jsPDF exports injected by other feature patches.
export default function officialPdfStandardsPatch() {
  return { name:'official-pdf-standards', enforce:'post', transform(source,id) {
    if (!/\/src\/.*\.[jt]sx?(?:\?|$)/.test(id) || /\/(?:officialPdf|THSarabunNew-jsPDF|pdfLogo)\./.test(id)) return null;
    let code = source.replace(/(from\s*["'])jspdf(["'])/g,'$1/src/officialPdf.ts$2');
    const helpers = new Set();
    code = code.replace(/await\s+ensureSarabunPdfFont\(\)/g,()=>{ helpers.add('ensureOfficialPdfFonts');return 'await ensureOfficialPdfFonts()'; });
    code = code.replace(/await\s+(html2canvas\w*)\s*\(/g,(_,fn)=>{ helpers.add('renderOfficialPdfCanvas');return `await renderOfficialPdfCanvas(${fn}, `; });
    if (/SummaryMockup/.test(id)) {
      code = code.replace(/(["'])Sarabun\1/g,'$1THSarabunNew$1');
      code = code.replace(/(context\.font\s*=\s*["'][^"']*)Arial/g,'$1THSarabunNew');
    }
    if (helpers.size) code = `import { ${[...helpers].join(', ')} } from '/src/officialPdf.ts';\n`+code;
    return code === source ? null : { code, map:null };
  } };
}
