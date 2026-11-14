// Read transfer-slip facts only. OCR results are not proof that a bank settled payment.
const clean=v=>String(v||"").normalize("NFC").replace(/\u0e4d\u0e32/g,"\u0e33")
  .replace(/[๐-๙]/g,c=>String(c.charCodeAt(0)-3664)).replace(/[\u200b-\u200d\ufeff]/g,"").replace(/\r/g,"");
const pad=n=>String(n).padStart(2,"0");
const year=y=>{y=Number(y);return y>=2400?y-543:y>=40&&y<100?y+1957:y<40?y+2000:y;};
function bangkok(y,m,d,h,min){
  const Y=year(y),M=Number(m),D=Number(d),H=Number(h),N=Number(min);
  if(Y<2000||Y>2100||M<1||M>12||D<1||D>31||H<0||H>23||N<0||N>59)return "";
  const check=new Date(Date.UTC(Y,M-1,D,H,N));
  if(check.getUTCFullYear()!==Y||check.getUTCMonth()+1!==M||check.getUTCDate()!==D)return "";
  return Y+"-"+pad(M)+"-"+pad(D)+"T"+pad(H)+":"+pad(N)+":00+07:00";
}
const months=["ม.ค.|มกราคม|JAN","ก.พ.|กุมภาพันธ์|FEB","มี.ค.|มีนาคม|MAR","เม.ย.|เมษายน|APR","พ.ค.|พฤษภาคม|MAY","มิ.ย.|มิถุนายน|JUN","ก.ค.|กรกฎาคม|JUL","ส.ค.|สิงหาคม|AUG","ก.ย.|กันยายน|SEP","ต.ค.|ตุลาคม|OCT","พ.ย.|พฤศจิกายน|NOV","ธ.ค.|ธันวาคม|DEC"]
  .flatMap((m,i)=>m.split("|").map(label=>({label:label.toUpperCase(),month:i+1})));
const pick=values=>{const uniq=[...new Set(values.filter(Boolean))];return uniq.length===1?uniq[0]:"";};
function references(lines){
  const short=[],long=[],other=[];
  const label=/(หมายเลขอ้างอิง|เลขที่อ้างอิง|(?:เลขที่|หมายเลข)(?:รายการ|ธุรกรรม)|รหัสอ้างอิง|(?:TRANSACTION|TRANSFER)\s*(?:ID|NO\.?|REF)|(?:REFERENCE|REF)\s*(?:NO\.?|ID|#))/i;
  const candidate=s=>String(s||"").trim().match(/^(?:[:#：\s-]*)(([A-Z0-9][A-Z0-9/_-]{5,69}))(?!\w)/i)?.[1]?.replace(/[^A-Z0-9]/gi,"").toUpperCase()||"";
  for(let i=0;i<lines.length;i++){
    const match=label.exec(lines[i]);if(!match)continue;
    let ref=candidate(lines[i].slice(match.index+match[0].length));
    if(!ref)for(let j=1;j<=2;j++){ref=candidate(lines[i+j]);if(ref)break;}
    if(!ref)continue;
    if(/หมายเลขอ้างอิง/i.test(match[0]))short.push(ref);
    else if(/เลขที่อ้างอิง/i.test(match[0]))long.push(ref);
    else other.push(ref);
  }
  for(const line of lines){const r=line.match(/(?:^|\s)(20\d{18,28})(?!\d)/)?.[1];if(r)long.push(r);}
  const shortReference=pick(short),longReference=pick(long);
  return {shortReference,longReference,transactionRef:longReference||pick(other)||shortReference};
}
const amountPattern=/((?:\d{1,3}(?:,\d{3})+|\d{1,8})(?:\.\d{1,2})?)/;
function labelledAmount(lines,label){
  const values=[];
  for(let i=0;i<lines.length;i++){
    const m=label.exec(lines[i]);if(!m)continue;
    const tail=lines[i].slice(m.index+m[0].length);
    const n=[tail,lines[i+1],lines[i+2]].map(v=>String(v||"").match(amountPattern)?.[1]).find(Boolean);
    if(n){const value=Number(n.replace(/,/g,""));if(Number.isFinite(value)&&value>=0)values.push(value);}
  }
  const u=[...new Set(values)];return u.length===1?u[0]:null;
}
function parties(lines){
  const senderLabel=lines.findIndex(s=>/^(?:จาก|from)$/i.test(s));
  const recipientLabelIndex=lines.findIndex(s=>/^(?:ไปที่|ถึง|to)$/i.test(s));
  const feeIndex=lines.findIndex(s=>/ค่าธรรมเนียม|fee/i.test(s));
  const masked=/\b\d{2,4}[- ]\d[- ](?:[xX*•%]{2,6})\d{2,4}\b/;
  const found=lines.flatMap((l,i)=>{const m=l.match(masked);return m?[{i,value:m[0]}]:[];});
  const recipientAccount=found.find(x=>recipientLabelIndex>=0&&x.i>recipientLabelIndex)?.value||found.at(-1)?.value||"";
  const senderAccount=found.find(x=>senderLabel>=0&&x.i>senderLabel&&(recipientLabelIndex<0||x.i<recipientLabelIndex))?.value||(found.length>1?found[0].value:"");
  const banks=/ธนาคาร(?:กรุงเทพ|ไทยพาณิชย์|กสิกรไทย|กรุงไทย|ทหารไทยธนชาต|กรุงศรีอยุธยา|ออมสิน)|Bangkok Bank|SCB|Kasikorn|KBank|Krungthai/i;
  const bank=lines.slice(0,8).some(x=>/Bangkok Bank/i.test(x))?"ธนาคารกรุงเทพ":lines.slice(0,5).find(x=>banks.test(x))?.match(banks)?.[0]||"";
  const bankBelow=pos=>pos>=0?lines.slice(pos+1,Math.min(lines.length,pos+4)).find(x=>banks.test(x))?.match(banks)?.[0]||"":"";
  const to=found.find(x=>x.value===recipientAccount)?.i??-1;
  const from=found.find(x=>x.value===senderAccount)?.i??-1;
  const senderBank=bankBelow(from),recipientBank=bankBelow(to);
  const name=(marker,acc)=>marker>=0&&acc>marker?
    lines.slice(marker+1,acc).filter(x=>!banks.test(x)&&!/^[@©]$/.test(x)).join(" ").trim().slice(0,120):"";
  const senderName=name(senderLabel,from),recipientName=name(recipientLabelIndex,to);
  const suffix=recipientAccount.match(/(\d{2,4})$/)?.[1]||"";
  const generic=!recipientAccount?pick(lines.flatMap(x=>[...x.matchAll(/(?:[xX*•]{2,})\s*(\d{4})(?!\d)/g)].map(m=>m[1]))):"";
  const recipientVisibleSuffix=suffix||generic;
  return {bank,senderName,senderBank,senderAccountMasked:senderAccount,
    recipientName,recipientBank,recipientAccountMasked:recipientAccount,
    recipientIdentifierType:recipientAccount?"bank-account":generic?"masked-unknown":"unknown",
    recipientVisibleSuffix,recipientLast4:recipientVisibleSuffix.length===4?recipientVisibleSuffix:"",
    recipientLabel:recipientName||recipientAccount||generic};
}
function dateTime(text,longReference){
  const dates=[],unclear=[];
  for(const m of text.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)){
    const t=text.slice(m.index+m[0].length,m.index+m[0].length+55).match(/^\s*(?:[,，|–-]\s*)?(\d{1,2}):(\d{2})/);
    if(t)dates.push(bangkok(m[1],m[2],m[3],t[1],t[2]));
  }
  for(const m of text.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g)){
    const t=text.slice(m.index+m[0].length,m.index+m[0].length+55).match(/^\s*(?:[,，|–-]\s*)?(\d{1,2}):(\d{2})/);
    if(t)dates.push(bangkok(m[3],m[2],m[1],t[1],t[2]));
  }
  for(const m of text.matchAll(/(\d{1,2})\s*([ก-๙a-zA-Z.]{2,15})\s*(\d{2,4})\s*[,，]?\s*(\d{1,2}):(\d{2})/gi)){
    const month=months.find(x=>x.label===m[2].toUpperCase())?.month;
    if(month)dates.push(bangkok(m[3],month,m[1],m[4],m[5]));
    else unclear.push({day:+m[1],year:year(m[3]),hour:+m[4],minute:+m[5]});
  }
  const visible=pick(dates);
  if(visible)return {payoutAt:visible,dateSource:"visible-date"};
  if(/^20\d{12}/.test(longReference)){
    const fromRef=bangkok(longReference.slice(0,4),longReference.slice(4,6),longReference.slice(6,8),
      longReference.slice(8,10),longReference.slice(10,12));
    const consistent=unclear.some(x=>x.year===+longReference.slice(0,4)&&x.day===+longReference.slice(6,8)
      &&x.hour===+longReference.slice(8,10)&&x.minute===+longReference.slice(10,12));
    if(fromRef&&consistent)return {payoutAt:fromRef,dateSource:"visible-time-matched-bank-reference"};
  }
  return {payoutAt:"",dateSource:""};
}
export function parseTransferSlipText(raw){
  const text=clean(raw).slice(0,16000),lines=text.split("\n").map(s=>s.trim()).filter(Boolean);
  const ref=references(lines),date=dateTime(text,ref.longReference),party=parties(lines);
  const amountTHB=labelledAmount(lines,/(?:จำนวนเงิน(?:ที่โอน)?|ยอด(?:เงิน)?โอน|ยอดเงินที่โอน|TRANSFER(?:RED)?\s*AMOUNT|AMOUNT\s*(?:TRANSFERRED|SENT)|ยอดทำรายการ)/i);
  const feeTHB=labelledAmount(lines,/(?:ค่าธรรมเนียม|FEE)/i);
  const isSuccessful=/รายการส(?:ำ|ํา)เร็จ|(?:transfer\s+)?successful|success|completed/i.test(text);
  const missing=[!date.payoutAt&&"วันและเวลา",!ref.transactionRef&&"เลขอ้างอิง",
    amountTHB===null&&"ยอดเงิน",!party.recipientVisibleSuffix&&!party.recipientName&&"ผู้รับเงิน"].filter(Boolean);
  const reviewFlags=[date.dateSource==="visible-time-matched-bank-reference"&&"OCR อ่านชื่อเดือนไม่ชัด แต่วันเวลาและเลขอ้างอิงสอดคล้องกัน",
    party.recipientIdentifierType==="bank-account"&&"เลขบัญชีผู้รับถูกปิดบังบางส่วน ต้องตรวจผู้รับด้วยตนเอง"].filter(Boolean);
  return {...ref,...date,...party,amountTHB,feeTHB,isSuccessful,missing,reviewFlags};
}
