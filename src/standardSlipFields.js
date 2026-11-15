// Shared seven-field normalisation for bank/wallet slips.
// This is NOT bank transaction verification. Keep OCR values alongside Admin edits.
export const STANDARD_SLIP_FIELDS=[
  {key:"senderBank",label:"ธนาคารผู้โอน"},
  {key:"senderName",label:"ชื่อบัญชีผู้โอน"},
  {key:"recipientBank",label:"ธนาคารปลายทาง"},
  {key:"recipientName",label:"ชื่อบัญชีผู้รับ"},
  {key:"payoutAt",label:"วันที่และเวลา"},
  {key:"amountTHB",label:"จำนวนเงินที่โอน"},
  {key:"transactionRef",label:"เลขที่ทำรายการ"}
];

export function formatSlipTime(value){
  if(!value)return "";
  const date=new Date(String(value));
  if(!Number.isFinite(date.getTime()))return "";
  const parts=new Intl.DateTimeFormat("en-GB",{
    timeZone:"Asia/Bangkok",day:"2-digit",month:"2-digit",year:"numeric",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  }).formatToParts(date);
  const get=key=>parts.find(x=>x.type===key)?.value||"";
  return get("day")+"/"+get("month")+"/"+String(Number(get("year"))+543)+" "+get("hour")+":"+get("minute");
}
export function formatSlipAmount(value){
  if(value===null||value===undefined||value==="")return "";
  const n=Number(value);
  if(!Number.isFinite(n)||n<0)return "";
  return n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
}
export function standardSlipFromOcr(raw={}){
  return {
    senderBank:String(raw.senderBank||raw.bank||"").trim(),
    senderName:String(raw.senderName||"").trim(),
    recipientBank:String(raw.recipientBank||"").trim(),
    recipientName:String(raw.recipientName||"").trim(),
    payoutAt:formatSlipTime(raw.payoutAt),
    amountTHB:formatSlipAmount(raw.amountTHB),
    transactionRef:String(raw.transactionRef||"").trim()
  };
}
export function normalizeSlipAmount(value){
  const raw=String(value??"").trim();
  if(!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(raw))return null;
  const amount=Number(raw.replace(/,/g,""));
  return Number.isFinite(amount)&&amount>0&&amount<=100000000?amount:null;
}
export function parseSlipTime(value){
  const text=String(value??"").trim();
  const m=/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(text);
  if(!m)return "";
  const y=Number(m[3]);const yr=y>=2400?y-543:y;
  const mo=Number(m[2]),d=Number(m[1]),h=Number(m[4]),mi=Number(m[5]);
  if(yr<2000||yr>2100||mo<1||mo>12||d<1||d>31||h>23||mi>59)return "";
  const test=new Date(Date.UTC(yr,mo-1,d,h,mi));
  if(test.getUTCFullYear()!==yr||test.getUTCMonth()+1!==mo||test.getUTCDate()!==d)return "";
  return String(yr).padStart(4,"0")+"-"+m[2]+"-"+m[1]+"T"+m[4]+":"+m[5]+":00+07:00";
}
export function normalizeStandardSlip(values={}){
  const result={};
  for(const {key} of STANDARD_SLIP_FIELDS)result[key]=String(values[key]??"").trim();
  return result;
}
export function validateStandardSlip(values={}){
  const v=normalizeStandardSlip(values);
  const missing=STANDARD_SLIP_FIELDS.filter(f=>!v[f.key]).map(f=>f.key);
  const invalid=[];
  if(v.payoutAt&&!parseSlipTime(v.payoutAt))invalid.push("payoutAt");
  if(v.amountTHB&&normalizeSlipAmount(v.amountTHB)===null)invalid.push("amountTHB");
  if(v.transactionRef&&!/^[a-zA-Z0-9/_-]{6,70}$/.test(v.transactionRef))invalid.push("transactionRef");
  for(const key of ["senderBank","recipientBank","senderName","recipientName"]){
    if(v[key].length>160)invalid.push(key);
  }
  return {missing,invalid,complete:missing.length===0&&invalid.length===0};
}
export function diffStandardSlip(ocr={},verified={}){
  const a=normalizeStandardSlip(ocr),b=normalizeStandardSlip(verified);
  const changes={};
  for(const {key} of STANDARD_SLIP_FIELDS)if(a[key]!==b[key]){
    changes[key]={ocr:a[key],verified:b[key]};
  }
  return changes;
}
