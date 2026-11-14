// Best-effort Thai/English OCR extraction, not proof of settlement.
const clean=v=>String(v||"").normalize("NFKC").replace(/[๐-๙]/g,c=>String(c.charCodeAt(0)-3664)).replace(/\r/g,"");
const pad=n=>String(n).padStart(2,"0");
function iso(y,m,d,h,min) {
  y=Number(y);if(y>=2400)y-=543;if(y<100)y+=y>=40?1957:2000;
  m=Number(m);d=Number(d);h=Number(h);min=Number(min);
  const date=new Date(Date.UTC(y,m-1,d,h,min));
  if(y<2000||y>2100||date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d||h>23||min>59)return "";
  return y+"-"+pad(m)+"-"+pad(d)+"T"+pad(h)+":"+pad(min)+":00+07:00";
}
const monthNames=["ม.ค.|มกราคม|JAN","ก.พ.|กุมภาพันธ์|FEB","มี.ค.|มีนาคม|MAR","เม.ย.|เมษายน|APR","พ.ค.|พฤษภาคม|MAY","มิ.ย.|มิถุนายน|JUN","ก.ค.|กรกฎาคม|JUL","ส.ค.|สิงหาคม|AUG","ก.ย.|กันยายน|SEP","ต.ค.|ตุลาคม|OCT","พ.ย.|พฤศจิกายน|NOV","ธ.ค.|ธันวาคม|DEC"];
function readTime(text) {
  const found=[];
  const time=/(\d{1,2}):(\d{2})(?::\d{2})?/;
  for(const m of text.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g)) {
    const near=text.slice(m.index+m[0].length,m.index+m[0].length+75);
    const t=near.match(time);if(t){const v=iso(m[3],m[2],m[1],t[1],t[2]);if(v)found.push(v);}
  }
  for(const m of text.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    const near=text.slice(m.index+m[0].length,m.index+m[0].length+75);
    const t=near.match(time);if(t){const v=iso(m[1],m[2],m[3],t[1],t[2]);if(v)found.push(v);}
  }
  const names=monthNames.flatMap((s,i)=>s.split("|").map(k=>({label:k,month:i+1})));
  for(const m of text.matchAll(/(\d{1,2})\s*([ก-๙a-zA-Z.]{2,14})\s*(\d{2,4})\s*(\d{1,2}):(\d{2})/gi)){
    const mon=names.find(x=>x.label.toUpperCase()===m[2].toUpperCase())?.month;
    if(mon){const v=iso(m[3],mon,m[1],m[4],m[5]);if(v)found.push(v);}
  }
  const uniq=[...new Set(found)];return uniq.length===1?uniq[0]:"";
}
function readRef(lines) {
  const found=[];
  for(let i=0;i<lines.length;i++){
    const m=lines[i].match(/(?:เลขที่(?:รายการ|ธุรกรรม|อ้างอิง)|หมายเลข(?:รายการ|ธุรกรรม|อ้างอิง)|รหัสอ้างอิง|เลขอ้างอิง|(?:TRANSACTION|TRANSFER)\s*(?:ID|NO\.?|REF)|(?:REFERENCE|REF)\s*(?:NO\.?|ID|#))/i);
    if(!m)continue;
    const tail=lines[i].slice(m.index+m[0].length).replace(/^[\s:：#=\-]+/,"")||lines[i+1]||"";
    const ref=tail.match(/^([A-Z0-9][A-Z0-9/_-]{5,69})(?:\s|$)/i)?.[1];
    if(ref)found.push(ref.toUpperCase().replace(/[^A-Z0-9]/g,""));
  }
  const u=[...new Set(found)];return u.length===1?u[0]:"";
}
function readAmount(lines) {
  const found=[];
  const label=/(?:จำนวนเงิน(?:ที่โอน)?|ยอด(?:เงิน)?โอน|ยอดเงินที่โอน|TRANSFER(?:RED)?\s*AMOUNT|AMOUNT\s*(?:TRANSFERRED|SENT)|ยอดทำรายการ)/i;
  for(let i=0;i<lines.length;i++){
    const m=lines[i].match(label);if(!m)continue;
    const tail=lines[i].slice(m.index+m[0].length)||lines[i+1]||"";
    const value=tail.match(/(?:฿|THB\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d{1,7}(?:\.\d{2})?)/i)?.[1];
    if(value){const n=Number(value.replace(/,/g,""));if(n>0&&n<=100000)found.push(n);}
  }
  const u=[...new Set(found)];return u.length===1?u[0]:null;
}
function readReceiver(lines) {
  let label="";
  for(let i=0;i<lines.length;i++)if(/(?:ผู้รับ(?:เงิน|โอน)?|บัญชีผู้รับ|โอนให้|ถึงบัญชี|RECIPIENT|BENEFICIARY|TO ACCOUNT)/i.test(lines[i])){
    label=lines.slice(i,i+3).join(" ").slice(0,170);break;
  }
  const values=[...new Set([...label.matchAll(/(?:[xX*•\- ]{2,})\s*(\d{4})(?!\d)/g)].map(m=>m[1]))];
  return {recipientLabel:label,recipientLast4:values.length===1?values[0]:""};
}
export function parseTransferSlipText(raw) {
  const text=clean(raw).slice(0,12000),lines=text.split("\n").map(s=>s.trim()).filter(Boolean);
  const payoutAt=readTime(text),transactionRef=readRef(lines),amountTHB=readAmount(lines),recipient=readReceiver(lines);
  const missing=[!payoutAt&&"วันและเวลา",!transactionRef&&"เลขอ้างอิง",amountTHB===null&&"ยอดเงิน",!recipient.recipientLast4&&"เลขท้ายผู้รับ"].filter(Boolean);
  return {payoutAt,transactionRef,amountTHB,...recipient,missing};
}
