import JSZip from "jszip";
import * as XLSX from "xlsx";

/**
 * Styles the actual downloaded workbook, not just the HTML report preview.
 * SheetJS Community writes data accurately but strips most cell styling.
 * This post-processor adds corporate formatting and an embedded image from the
 * exact same /robinhood-logo.png used by the QA Dashboard PageHero.
 */
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
const purple = "76308B", deep = "190134", pale = "F5EDF7", light = "FBF8FD", gold = "FFCF85";
const parse = (text: string) => new DOMParser().parseFromString(text, "application/xml");
const xml = (document: XMLDocument) => new XMLSerializer().serializeToString(document);
const child = (parent: Element, tag: string) => Array.from(parent.children).find(el => el.localName === tag) || null;
const add = (doc: XMLDocument, parent: Element, name: string, attrs: Record<string,string> = {}) => {
  const element = doc.createElementNS(NS, name);
  Object.entries(attrs).forEach(([key,value]) => element.setAttribute(key, value));
  parent.appendChild(element);
  return element;
};
type StyleName = "title" | "subtitle" | "hero" | "section" | "cardLabel" | "cardValue" | "cardDetail" | "heading" | "stripe" | "stripeCenter" | "score" | "success" | "danger" | "footer" | "topicBar";
function createStyles(source: string) {
  const doc = parse(source);
  const root = doc.documentElement;
  const fonts = child(root, "fonts")!, fills = child(root, "fills")!, xfs = child(root, "cellXfs")!;
  function font(color: string, bold = false, size = 11, face = "Sarabun") {
    const number = fonts.children.length;
    const f = add(doc, fonts, "font");
    add(doc, f, "sz", { val: String(size) });
    add(doc, f, "name", { val: face });
    if (bold) add(doc, f, "b");
    const fc = add(doc, f, "color", { rgb: "FF" + color });
    void fc;
    return number;
  }
  function fill(color: string) {
    const number = fills.children.length;
    const f = add(doc, fills, "fill");
    const pattern = add(doc, f, "patternFill", { patternType: "solid" });
    add(doc, pattern, "fgColor", { rgb:"FF" + color });
    add(doc, pattern, "bgColor", { indexed:"64" });
    return number;
  }
  const fontsId = {
    light: font("FFFFFF",true,12), display: font("FFFFFF",true,20),
    gold: font(gold,false,10), value: font(purple,true,22),
    label: font("675472",true,9), plain: font("342B3B",false,10),
    bold: font(deep,true,10), score: font(purple,true,11),
    green: font("187756",true,10), red: font("BC3D52",true,10),
    footer: font("584368",false,9), bar: font("8755AF",true,12),
  };
  const fillsId = { deep: fill(deep), purple: fill(purple), pale: fill(pale), light: fill(light),
    white: fill("FFFFFF"), violet: fill("EADBF0"), gold: fill("F6E6CC") };
  const styles: Record<StyleName,number> = {} as Record<StyleName,number>;
  function style(name:StyleName, fontId:number, fillId:number, center=false, wrap=false) {
    const id=xfs.children.length;
    const xf = add(doc,xfs,"xf",{
      numFmtId:"0",fontId:String(fontId),fillId:String(fillId),borderId:"0",xfId:"0",
      applyFont:"1",applyFill:"1",applyAlignment:"1"
    });
    add(doc,xf,"alignment",{horizontal:center?"center":"left",vertical:"center",wrapText:wrap?"1":"0"});
    styles[name]=id;
  }
  style("title",fontsId.display,fillsId.deep);
  style("subtitle",fontsId.gold,fillsId.deep);
  style("hero",fontsId.light,fillsId.deep);
  style("section",fontsId.light,fillsId.purple);
  style("cardLabel",fontsId.label,fillsId.white,true);
  style("cardValue",fontsId.value,fillsId.white,true);
  style("cardDetail",fontsId.footer,fillsId.white,true);
  style("heading",fontsId.bold,fillsId.violet,true,true);
  style("stripe",fontsId.plain,fillsId.light,false,true);
  style("stripeCenter",fontsId.plain,fillsId.light,true,true);
  style("score",fontsId.score,fillsId.white,true);
  style("success",fontsId.green,fillsId.pale,true);
  style("danger",fontsId.red,fillsId.pale,true);
  style("footer",fontsId.footer,fillsId.pale,true,true);
  style("topicBar",fontsId.bar,fillsId.white,true);
  fonts.setAttribute("count",String(fonts.children.length));
  fills.setAttribute("count",String(fills.children.length));
  xfs.setAttribute("count",String(xfs.children.length));
  return { styles,content:xml(doc) };
}
const colNumber = (c: string) => [...c].reduce((n,v)=>n*26+v.charCodeAt(0)-64,0);
function styleSheet(source:string, dashboard:boolean, st:Record<StyleName,number>) {
  const doc=parse(source);
  const root=doc.documentElement;
  const data=child(root,"sheetData")!;
  const rows=new Map<number,Element>();
  for(const r of Array.from(data.children)) if(r.localName==="row") rows.set(Number(r.getAttribute("r")),r);
  function set(rowNumber:number,column:number,style:StyleName) {
    let row=rows.get(rowNumber);
    if(!row) {
      row=doc.createElementNS(NS,"row");
      row.setAttribute("r",String(rowNumber));
      const next=Array.from(data.children).find(r=>r.localName==="row" && Number(r.getAttribute("r"))>rowNumber);
      data.insertBefore(row,next||null);rows.set(rowNumber,row);
    }
    const col=XLSX.utils.encode_col(column-1);
    const address=col+rowNumber;
    let cell=Array.from(row.children).find(c=>c.localName==="c"&&c.getAttribute("r")===address);
    if(!cell){
      cell=doc.createElementNS(NS,"c");cell.setAttribute("r",address);
      const next=Array.from(row.children).find(c=>c.localName==="c" && colNumber((c.getAttribute("r")||"").replace(/\d/g,""))>column);
      row.insertBefore(cell,next||null);
    }
    cell.setAttribute("s",String(st[style]));
  }
  if(dashboard) {
    for(let r=2;r<=5;r++)for(let c=2;c<=16;c++)set(r,c,r===2||r===3?"title":"hero");
    for(let r of [15,32])for(let c=2;c<=16;c++)set(r,c,"section");
    for(let c=2;c<=16;c++)set(62,c,"footer");
    for(const [a,b] of [[2,4],[6,8],[10,12],[14,16]]) {
      for(let r=8;r<=12;r++)for(let c=a;c<=b;c++)set(r,c,r===9?"cardLabel":r===10||r===11?"cardValue":"cardDetail");
    }
    for(let c=2;c<=16;c++)for(let r of [17,34])set(r,c,"heading");
    for(let r=18;r<=26;r++) for(let c=2;c<=16;c++) set(r,c,r%2===0?"stripe":"stripeCenter");
    for(let r=35;r<=46;r++)for(let c=2;c<=16;c++)set(r,c,r%2===0?"stripe":"stripeCenter");
    for(let r of [19,21,23,25]){set(r,9,"topicBar");set(r,6,"score");}
    for(let r=35;r<=46;r++) set(r,9,"score");
    for(let c=2;c<=16;c++)for(let r of [51,52,53,54])set(r,c,"footer");
  } else {
    const rowElements=Array.from(data.children).filter(r=>r.localName==="row");
    const maxRow=Math.max(...rowElements.map(r=>Number(r.getAttribute("r"))),1);
    const first=rows.get(1);
    const count=first?first.children.length:0;
    for(let c=1;c<=count;c++)set(1,c,"section");
    for(let r=2;r<=maxRow;r++) if(r%2===0) for(let c=1;c<=count;c++)set(r,c,"stripe");
  }
  return xml(doc);
}
const LOGO_IMAGE_PATH = "/robinhood-logo.png";
async function embedLogo(zip:JSZip,index:number) {
  try {
    const response=await fetch(LOGO_IMAGE_PATH,{cache:"force-cache"});
    if(!response.ok) return;
    const image=await response.arrayBuffer();
    const drawingPath="xl/drawings/qaReportLogo.xml";
    const drawingRel="xl/drawings/_rels/qaReportLogo.xml.rels";
    const mediaPath="xl/media/qaReportLogo.png";
    const sheetPath="xl/worksheets/sheet"+index+".xml";
    const relPath="xl/worksheets/_rels/sheet"+index+".xml.rels";
    zip.file(mediaPath,image);
    zip.file(drawingPath,`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${REL}">
<xdr:oneCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
<xdr:ext cx="1190000" cy="710000"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="QA Dashboard Logo"/><xdr:cNvPicPr/></xdr:nvPicPr>
<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1190000" cy="710000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>
<xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`);
    zip.file(drawingRel,`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/image" Target="../media/qaReportLogo.png"/></Relationships>`);
    const relSource=await zip.file(relPath)?.async("string");
    const relDoc=relSource?parse(relSource):parse(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${PKG}"/>`);
    const rRoot=relDoc.documentElement;
    const used=new Set(Array.from(rRoot.children).map(x=>x.getAttribute("Id")));
    let i=1;while(used.has("rId"+i))i++;
    const id="rId"+i;
    const link=relDoc.createElementNS(PKG,"Relationship");
    link.setAttribute("Id",id);link.setAttribute("Type",REL+"/drawing");
    link.setAttribute("Target","../drawings/qaReportLogo.xml");
    rRoot.appendChild(link);zip.file(relPath,xml(relDoc));
    const sheetDoc=parse(await zip.file(sheetPath)!.async("string"));
    const drawing=sheetDoc.createElementNS(NS,"drawing");
    drawing.setAttributeNS(REL,"r:id",id);
    sheetDoc.documentElement.appendChild(drawing);zip.file(sheetPath,xml(sheetDoc));
    const ct=parse(await zip.file("[Content_Types].xml")!.async("string"));
    const root=ct.documentElement;
    const namespaces="http://schemas.openxmlformats.org/package/2006/content-types";
    if(!Array.from(root.children).some(e=>e.getAttribute("Extension")==="png")){
      const png=ct.createElementNS(namespaces,"Default");
      png.setAttribute("Extension","png");png.setAttribute("ContentType","image/png");root.appendChild(png);
    }
    const override=ct.createElementNS(namespaces,"Override");
    override.setAttribute("PartName","/"+drawingPath);
    override.setAttribute("ContentType","application/vnd.openxmlformats-officedocument.drawing+xml");
    root.appendChild(override);zip.file("[Content_Types].xml",xml(ct));
  } catch(error) {
    // A temporary failure to fetch the static logo must never change or corrupt QA scores.
    console.warn("Could not embed dashboard logo into Excel report",error);
  }
}
export async function exportCorporateReport(book:XLSX.WorkBook):Promise<Blob> {
  const binary=XLSX.write(book,{bookType:"xlsx",type:"array"});
  const zip=await JSZip.loadAsync(binary);
  const stylesPath="xl/styles.xml";
  const styleXml=await zip.file(stylesPath)!.async("string");
  const {styles,content}=createStyles(styleXml);
  zip.file(stylesPath,content);
  for(let i=0;i<book.SheetNames.length;i++) {
    const path="xl/worksheets/sheet"+(i+1)+".xml";
    const original=await zip.file(path)?.async("string");
    if(!original)continue;
    zip.file(path,styleSheet(original,book.SheetNames[i]==="Dashboard",styles));
  }
  const dashboardIndex=book.SheetNames.indexOf("Dashboard");
  if(dashboardIndex>=0) await embedLogo(zip,dashboardIndex+1);
  return zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6},mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
