import { jsPDF as BasePdf } from 'jspdf';
import { registerTHSarabunNew } from './THSarabunNew-jsPDF';
import { PDF_LOGO } from './pdfLogo';
export type jsPDF = BasePdf;
export const OFFICIAL_FONT = 'THSarabunNew';
let sources: { data: string; weight: string; style: string }[] | undefined;
function fontSources() {
  if (!sources) {
    const pdf = new BasePdf(); registerTHSarabunNew(pdf);
    sources = [['THSarabunNew.ttf','400','normal'],['THSarabunNew-Bold.ttf','700','normal'],['THSarabunNew-Italic.ttf','400','italic'],['THSarabunNew-BoldItalic.ttf','700','italic']].map(([name,weight,style])=>({ data: pdf.getFileFromVFS(name), weight, style }));
  }
  return sources;
}
export function officialPdfPrintStyles() { return fontSources().map(font=>`@font-face{font-family:'${OFFICIAL_FONT}';src:url(data:font/ttf;base64,${font.data}) format('truetype');font-weight:${font.weight};font-style:${font.style};font-display:block;}`).join('\n'); }
let fontReady: Promise<void> | undefined;
export function ensureOfficialPdfFonts() {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return Promise.resolve();
  if (!fontReady) fontReady = Promise.all(fontSources().map(async font=> { const face = new FontFace(OFFICIAL_FONT,`url(data:font/ttf;base64,${font.data})`,{ weight: font.weight, style: font.style }); await face.load(); document.fonts.add(face); })).then(()=>{}).catch(error=>{ fontReady=undefined; throw error; });
  return fontReady;
}
export async function renderOfficialPdfCanvas(renderer: any, element: HTMLElement, options: any = {}) {
  await ensureOfficialPdfFonts();
  return renderer(element,{ ...options, onclone: async (clone: Document, ...args: any[]) => {
    if (options.onclone) await options.onclone(clone,...args);
    const style = clone.createElement('style'); style.textContent=officialPdfPrintStyles()+`\n*{font-family:'${OFFICIAL_FONT}',sans-serif!important;}`; clone.head.append(style);
    await clone.fonts.load(`16px '${OFFICIAL_FONT}'`); await clone.fonts.ready;
  } });
}
export function prepareOfficialPdf(pdf: BasePdf) {
  const branded = pdf as BasePdf & { __qaOfficial?: boolean; __qaCustomOfficialHeader?: boolean };
  if (branded.__qaOfficial) return pdf; branded.__qaOfficial = true;
  registerTHSarabunNew(pdf);
  const setFont = pdf.setFont.bind(pdf);
  pdf.setFont = ((_family: string, style?: string, weight?: any) => setFont(OFFICIAL_FONT, ['normal','bold','italic','bolditalic'].includes(style || '') ? style : 'normal', weight)) as typeof pdf.setFont;
  pdf.setFont(OFFICIAL_FONT,'normal');
  const stamped = new Set<number>();
  const stamp = () => {
    if (branded.__qaCustomOfficialHeader) return;
    const current = pdf.getCurrentPageInfo().pageNumber, font = pdf.getFont(), size = pdf.getFontSize(), color = pdf.getTextColor();
    for (let page=1; page<=pdf.getNumberOfPages(); page++) {
      if (stamped.has(page)) continue;
      pdf.setPage(page); const height = pdf.internal.pageSize.getHeight();
      pdf.addImage(PDF_LOGO,'PNG',3,height-6.5,5,5,'robinhood-official-logo','FAST');
      pdf.setFont(OFFICIAL_FONT,'normal'); pdf.setFontSize(9); pdf.setTextColor(77,60,100); pdf.text('Robinhood Quality Assurance',10,height-2.8);
      stamped.add(page);
    }
    pdf.setPage(current); pdf.setFont(OFFICIAL_FONT,font.fontStyle); pdf.setFontSize(size); pdf.setTextColor(color);
  };
  const output = pdf.output.bind(pdf), save = pdf.save.bind(pdf);
  pdf.output = ((...args: any[]) => { stamp(); return (output as any)(...args); }) as typeof pdf.output;
  pdf.save = ((...args: any[]) => { stamp(); return (save as any)(...args); }) as typeof pdf.save;
  return pdf;
}
// jsPDF returns its own API object from the constructor, so a wrapper is required.
export const jsPDF = Object.assign(function (...args: ConstructorParameters<typeof BasePdf>) { return prepareOfficialPdf(new BasePdf(...args)); }, BasePdf) as unknown as typeof BasePdf;
