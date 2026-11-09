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
type StyleName = "mastheadRight" | "mastheadDetail" | "mastheadMeta" | "mastheadAccent" | "mastheadLine" | "title" | "subtitle" | "hero" | "section" | "cardLabel" | "cardValue" | "cardDetail" | "heading" | "stripe" | "stripeCenter" | "score" | "success" | "danger" | "footer" | "topicBar" | "plain" | "topicOneLine" | "numeric2" | "percent2" | "tagPercent2";
function createStyles(source: string) {
  const doc = parse(source);
  const root = doc.documentElement;
  const fonts = child(root, "fonts")!, fills = child(root, "fills")!, xfs = child(root, "cellXfs")!;
  function font(color: string, bold = false, size = 11, face = "Kanit") {
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
    light: font("FFFFFF",true,12), display: font("FFFFFF",true,18,"Kanit"),
    gold: font(gold,false,10,"Kanit"), value: font(purple,true,22),
    label: font("675472",true,9,"Kanit"), plain: font("342B3B",false,10,"Kanit"),
    bold: font(deep,true,10), score: font(purple,true,11),
    green: font("187756",true,10), red: font("BC3D52",true,10),
    footer: font("584368",false,9), bar: font("8755AF",true,12),
    headerDetail: font("E7DBF2",false,11), headerMeta: font("F2E8F7",false,9),
    headerAccent: font("FFCF85",true,10), headerId: font("FFCF85",true,12),
    topicName: font(deep,true,11), metaLabel: font("5E4270",true,9,"Kanit"),
  };
  const fillsId = { deep: fill(deep), purple: fill(purple), pale: fill(pale), light: fill(light),
    white: fill("FFFFFF"), violet: fill("EADBF0"), gold: fill("F6E6CC") };
  const styles: Record<StyleName,number> = {} as Record<StyleName,number>;
  function style(name:StyleName, fontId:number, fillId:number, center=false, wrap=false, right=false) {
    const id=xfs.children.length;
    const numberFormatId=name==="percent2"||name==="tagPercent2"?167:name==="numeric2"?166:0;
    const xf = add(doc,xfs,"xf",{
      numFmtId:String(numberFormatId),fontId:String(fontId),fillId:String(fillId),borderId:"0",xfId:"0",
      applyFont:"1",applyFill:"1",applyAlignment:"1",applyNumberFormat:numberFormatId?"1":"0"
    });
    add(doc,xf,"alignment",{horizontal:right?"right":center?"center":"left",vertical:"center",wrapText:wrap?"1":"0"});
    styles[name]=id;
  }
  style("title",fontsId.display,fillsId.deep);
  style("mastheadRight",fontsId.headerId,fillsId.deep,false,false,true);
  style("mastheadDetail",fontsId.headerDetail,fillsId.deep);
  style("mastheadMeta",fontsId.headerMeta,fillsId.deep,false,false,true);
  style("mastheadAccent",fontsId.headerAccent,fillsId.deep);
  style("mastheadLine",fontsId.headerAccent,fillsId.purple);
  style("topicName",fontsId.topicName,fillsId.white,false,true);
  style("tagName",fontsId.plain,fillsId.light,false,true);
  style("metaLabel",fontsId.metaLabel,fillsId.pale);
  style("topStrip",fontsId.light,fillsId.purple,true);
  style("subtitle",fontsId.gold,fillsId.deep,true);
  style("hero",fontsId.light,fillsId.deep,true);
  style("section",fontsId.light,fillsId.deep,false);
  style("cardLabel",fontsId.label,fillsId.white,true);
  style("cardValue",fontsId.value,fillsId.white,true);
  style("cardDetail",fontsId.footer,fillsId.white,true);
  style("heading",fontsId.bold,fillsId.violet,true,true);
  style("plain",fontsId.plain,fillsId.white,false,true);
  style("topicOneLine",fontsId.topicName,fillsId.white,false,false);
  style("numeric2",fontsId.score,fillsId.white,true);
  style("percent2",fontsId.score,fillsId.white,true);
  style("tagPercent2",fontsId.plain,fillsId.light,true);
  style("stripe",fontsId.plain,fillsId.light,false,true);
  style("stripeCenter",fontsId.plain,fillsId.light,true,true);
  style("score",fontsId.score,fillsId.light,true);
  style("success",fontsId.green,fillsId.pale,true);
  style("danger",fontsId.red,fillsId.pale,true);
  style("footer",fontsId.footer,fillsId.pale,true,true);
  style("topicBar",fontsId.bar,fillsId.white,true);
  let formats=child(root,"numFmts");
  if(!formats){formats=doc.createElementNS(NS,"numFmts");root.insertBefore(formats,root.firstChild);}
  for(const [id,fmt] of [[166,"0.00"],[167,'0.00"%"']] as const) {
    if(!Array.from(formats.children).some(n=>n.getAttribute("numFmtId")===String(id)))
      add(doc,formats,"numFmt",{numFmtId:String(id),formatCode:fmt});
  }
  formats.setAttribute("count",String(formats.children.length));
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
    // The layout follows the approved QA Corporate Design prototype:
    // dark masthead, four centered KPI cards, two analytics panels, agent scorecard and attribution.
    for(let r=2;r<=5;r++)for(let col=2;col<=16;col++)set(r,col,"hero");
    // Readable hierarchy: actual Dashboard logo on left; report title center;
    // report ID, operator and generated timestamp aligned on the right.
    set(2,5,"title");
    set(2,13,"mastheadRight");
    set(4,5,"mastheadDetail");
    set(4,13,"mastheadMeta");
    set(5,5,"mastheadAccent");
    set(5,13,"mastheadMeta");
    for(let col=2;col<=16;col++)set(6,col,"mastheadLine");
    for(let r=8;r<=12;r++)for(let col=2;col<=16;col++)if(![5,9,13].includes(col)){
      set(r,col,r===8?"cardLabel":r===9||r===10?"cardValue":"cardDetail");
    }
    for(const [left,right] of [[2,9],[11,16]]) {
      for(let col=left;col<=right;col++)set(15,col,"section");
    }
    for(let col=2;col<=9;col++)set(17,col,"heading");
    for(let col=11;col<=16;col++)set(17,col,"heading");
    for(let r=18;r<=26;r++) {
      for(let col=2;col<=9;col++)set(r,col,r%2===0?"stripe":"stripeCenter");
      for(let col=11;col<=16;col++)set(r,col,r%2===0?"stripe":"stripeCenter");
    }
    for(const row of [19,21,23,25]){
      set(row,2,"topicOneLine");
      for(const col of [6,7,8,9])set(row,col,col===8?"percent2":"numeric2");
    }
    for(let r=18;r<=25;r++){
      set(r,11,"tagName");set(r,15,"stripeCenter");set(r,16,"tagPercent2");
    }
    for(let col=2;col<=16;col++){set(45,col,"section");set(47,col,"heading");}
    for(let r=48;r<=59;r++){
      for(let col=2;col<=16;col++)set(r,col,r%2===0?"stripe":"stripeCenter");
      set(r,2,"plain");set(r,8,"numeric2");
    }
    for(let r=62;r<=64;r++){
      for(let col=2;col<=16;col++)set(r,col,"footer");
      set(r,2,"metaLabel");
    }
    for(let col=2;col<=16;col++)set(66,col,"footer");
    set(9,2,"numeric2");
  } else {
    const rowElements=Array.from(data.children).filter(r=>r.localName==="row");
    const maxRow=Math.max(...rowElements.map(r=>Number(r.getAttribute("r"))),1);
    const first=rows.get(1);
    const count=first?first.children.length:0;
    for(let c=1;c<=count;c++)set(1,c,"section");
    for(let r=2;r<=maxRow;r++) for(let c=1;c<=count;c++)set(r,c,r%2===0?"stripe":"plain");
  }
  return xml(doc);
}
const LOGO_IMAGE_PATH = "/robinhood-logo.png";


type ChartPoint = { label: string; amount: number };
const escapeXml = (value:string) => value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
function makeNativeChart(title:string,items:ChartPoint[],categoryFormula:string,valueFormula:string,axis:number) {
  const labels=items.map((item,i)=>`<c:pt idx="${i}"><c:v>${escapeXml(item.label)}</c:v></c:pt>`).join("");
  const values=items.map((item,i)=>`<c:pt idx="${i}"><c:v>${item.amount}</c:v></c:pt>`).join("");
  const ax1=axis,ax2=axis+1;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<c:lang val="th-TH"/><c:roundedCorners val="0"/>
<c:chart><c:plotArea><c:layout/>
<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>
<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${escapeXml(title)}</c:v></c:tx>
<c:spPr><a:solidFill><a:srgbClr val="76308B"/></a:solidFill></c:spPr>
<c:cat><c:strRef><c:f>${escapeXml(categoryFormula)}</c:f><c:strCache><c:ptCount val="${items.length}"/>${labels}</c:strCache></c:strRef></c:cat>
<c:val><c:numRef><c:f>${escapeXml(valueFormula)}</c:f><c:numCache><c:formatCode>0.00</c:formatCode><c:ptCount val="${items.length}"/>${values}</c:numCache></c:numRef></c:val></c:ser>
<c:axId val="${ax1}"/><c:axId val="${ax2}"/></c:barChart>
<c:catAx><c:axId val="${ax1}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${ax2}"/></c:catAx>
<c:valAx><c:axId val="${ax2}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="0.0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${ax1}"/><c:crossBetween val="between"/></c:valAx></c:plotArea>
<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/></c:chart>
<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr lang="th-TH" sz="1000"><a:latin typeface="Kanit"/></a:defRPr></a:pPr><a:endParaRPr lang="th-TH"/></a:p></c:txPr>
</c:chartSpace>`;
}
const nativeChartAnchor=(id:number,fromCol:number,toCol:number)=>`
<xdr:twoCellAnchor><xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>25</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
<xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>39</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="QA Report Chart ${id}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>
<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId${id}"/>
</a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;

async function embedLogo(zip:JSZip,index:number,book:XLSX.WorkBook) {
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
    const topicSheet=book.Sheets["Topic Performance"] || book.Sheets["QA Topic Performance"];
    const tagSheet=book.Sheets["Tag Analysis"] || book.Sheets["QA Tag Analysis"];
    const topicData=(topicSheet?XLSX.utils.sheet_to_json<Record<string,unknown>>(topicSheet):[]).slice(0,6)
      .map(row=>({label:String(row.Topic || ""),amount:Number(row["Average %"] || 0)})).filter(x=>Number.isFinite(x.amount));
    const tagData=(tagSheet?XLSX.utils.sheet_to_json<Record<string,unknown>>(tagSheet):[]).slice(0,7)
      .map(row=>({label:String(row.Tag || ""),amount:Number(row["Cases Affected"] || 0)})).filter(x=>Number.isFinite(x.amount));

    const topicRef=book.Sheets["Topic Performance"] ? "Topic Performance" : "QA Topic Performance";
    const tagRef=book.Sheets["Tag Analysis"] ? "Tag Analysis" : "QA Tag Analysis";
    const chartParts=[
      {id:2,name:"qaReportTopic.xml",from:1,to:8,title:"Topic Performance (%)",items:topicData,
        labelFormula:`'${topicRef}'!$A$2:$A$${topicData.length+1}`,valueFormula:`'${topicRef}'!$D$2:$D$${topicData.length+1}`,axis:48650112},
      {id:3,name:"qaReportTag.xml",from:9,to:16,title:"Most Frequent Tags",items:tagData,
        labelFormula:`'${tagRef}'!$A$2:$A$${tagData.length+1}`,valueFormula:`'${tagRef}'!$B$2:$B$${tagData.length+1}`,axis:48650212},
    ];
    const extra=chartParts.map(part=>nativeChartAnchor(part.id,part.from,part.to)).join("");
    const currentDrawing=await zip.file(drawingPath)!.async("string");
    zip.file(drawingPath,currentDrawing.replace("</xdr:wsDr>",extra+"</xdr:wsDr>"));
    for(const part of chartParts){
      zip.file("xl/drawings/charts/"+part.name,makeNativeChart(part.title,part.items,part.labelFormula,part.valueFormula,part.axis));
    }
    zip.file(drawingRel,`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/image" Target="../media/qaReportLogo.png"/>${chartParts.map(part=>`<Relationship Id="rId${part.id}" Type="${REL}/chart" Target="charts/${part.name}"/>`).join("")}</Relationships>`);
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
    root.appendChild(override);
    for(const name of ["qaReportTopic.xml","qaReportTag.xml"]) {
      const part=ct.createElementNS(namespaces,"Override");
      part.setAttribute("PartName","/xl/drawings/charts/"+name);
      part.setAttribute("ContentType","application/vnd.openxmlformats-officedocument.drawingml.chart+xml");
      root.appendChild(part);
    }
    zip.file("[Content_Types].xml",xml(ct));
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
    zip.file(path,styleSheet(original,book.SheetNames[i]==="Dashboard" || book.SheetNames[i]==="QA Dashboard",styles));
  }
  const dashboardIndex=book.SheetNames.findIndex(name=>name==="Dashboard" || name==="QA Dashboard");
  if(dashboardIndex>=0) await embedLogo(zip,dashboardIndex+1,book);
  return zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6},mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
