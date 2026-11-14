// Extract facts from Thai bank / wallet transfer slips. OCR alone NEVER proves settlement.
const clean=v=>String(v||"").normalize("NFC").replace(/\u0e4d\u0e32/g,"\u0e33")
  .replace(/[๐-๙]/g,c=>String(c.charCodeAt(0)-3664))
  .replace(/[\u200b-\u200d\ufeff]/g,"").replace(/\r/g,"");
const pad=n=>String(n).padStart(2,"0");
const year=y=>{y=Number(y);return y>=2400?y-543:y>=40&&y<100?y+1957:y<40?y+2000:y;};
function bangkok(y,m,d,h,min,seconds=0){
  const Y=year(y),M=Number(m),D=Number(d),H=Number(h),N=Number(min),S=Number(seconds);
  if(Y<2000||Y>2100||M<1||M>12||D<1||D>31||H<0||H>23||N<0||N>59||S<0||S>59)return "";
  const check=new Date(Date.UTC(Y,M-1,D,H,N,S));
  if(check.getUTCFullYear()!==Y||check.getUTCMonth()+1!==M||check.getUTCDate()!==D)return "";
  return Y+"-"+pad(M)+"-"+pad(D)+"T"+pad(H)+":"+pad(N)+":"+pad(S)+"+07:00";
}
const monthNames=["ม.ค.|มกราคม|JAN|JANUARY","ก.พ.|กุมภาพันธ์|FEB|FEBRUARY","มี.ค.|มีนาคม|MAR|MARCH","เม.ย.|เมษายน|APR|APRIL","พ.ค.|พฤษภาคม|MAY","มิ.ย.|มิถุนายน|JUN|JUNE","ก.ค.|กรกฎาคม|JUL|JULY","ส.ค.|สิงหาคม|AUG|AUGUST","ก.ย.|กันยายน|SEP|SEPTEMBER","ต.ค.|ตุลาคม|OCT|OCTOBER","พ.ย.|พฤศจิกายน|NOV|NOVEMBER","ธ.ค.|ธันวาคม|DEC|DECEMBER"]
  .flatMap((m,i)=>m.split("|").map(label=>({label:label.toUpperCase().replace(/[.\s]/g,""),month:i+1})));
const uniq=v=>[...new Set(v.filter(x=>x!==null&&x!==undefined&&x!==""))];
const pick=v=>{const u=uniq(v);return u.length===1?u[0]:"";};
const banks=[
  {name:"ธนาคารกรุงเทพ",re:/(?:ธนาคารกรุงเทพ|ธ\.?\s*กรุงเทพ|Bangkok Bank|BBL)/i},
  {name:"ธนาคารกสิกรไทย",re:/(?:ธนาคารกสิกรไทย|ธ\.?\s*กสิกรไทย|Kasikorn(?:bank)?|KBank|K PLUS|K\+)/i},
  {name:"ธนาคารไทยพาณิชย์",re:/(?:ธนาคารไทยพาณิชย์|ธ\.?\s*ไทยพาณิชย์|SCB(?: EASY)?|Siam Commercial Bank)/i},
  {name:"ธนาคารกรุงไทย",re:/(?:ธนาคารกรุงไทย|ธ\.?\s*กรุงไทย|Krungthai|KTB|NEXT Banking)/i},
  {name:"ธนาคารกรุงศรีอยุธยา",re:/(?:ธนาคารกรุงศรีอยุธยา|ธ\.?\s*กรุงศรี|Krungsri|Bank of Ayudhya|KMA)/i},
  {name:"ธนาคารทหารไทยธนชาต",re:/(?:ธนาคารทหารไทยธนชาต|ธ\.?\s*ทีทีบี|ttb(?: touch)?|TMBThanachart)/i},
  {name:"ธนาคารออมสิน",re:/(?:ธนาคารออมสิน|GSB|MyMo)/i},
  {name:"ธนาคารเกียรตินาคินภัทร",re:/(?:เกียรตินาคินภัทร|KKP(?: Start Saving)?|Kiatnakin)/i},
  {name:"ธนาคารแลนด์ แอนด์ เฮ้าส์",re:/(?:LH BANK|แลนด์.*เฮ้าส์)/i},
  {name:"ธนาคารยูโอบี",re:/(?:UOB|ธนาคารยูโอบี)/i},
  {name:"ธนาคารซีไอเอ็มบี ไทย",re:/(?:CIMB|ธนาคารซีไอเอ็มบี)/i},
  {name:"TrueMoney Wallet",re:/(?:truemoney|ทรูมันนี่)/i},
];
const detectBank=s=>banks.find(b=>b.re.test(s||""))?.name||"";
const noBank=s=>!detectBank(s);
const isName=s=>/^(?:นาย|นาง|นางสาว|คุณ|Mr\.?|Mrs\.?|Miss|Ms\.?)\s*\S+/i.test(s||"");
const amountPattern=/((?:\d{1,3}(?:,\d{3})+|\d{1,8})(?:\.\d{1,2})?)/;
function amountIn(s){
  const match=String(s||"").match(amountPattern);
  if(!match)return null;
  const value=Number(match[1].replace(/,/g,""));
  return Number.isFinite(value)&&value>=0&&value<=100000000?value:null;
}
const amountLabel=/(?:จำนวนเงิน(?:ที่โอน)?|จํานวนเงิน|จำนวน\s*:|ยอด(?:เงิน)?โอน|ยอดเงินที่โอน|ยอดทำรายการ|transfer(?:red)?\s*amount|amount(?:\s*sent)?)/i;
const feeLabel=/(?:ค่าธรรมเนียม|ค่าบริการ|(?:^|\s)fee(?:s)?(?:\s|:|$))/i;
function labelledAmounts(lines,label,excludeFee=false){
  const found=[];
  for(let i=0;i<lines.length;i++){
    if(excludeFee&&feeLabel.test(lines[i]))continue;
    const m=label.exec(lines[i]);if(!m)continue;
    const tail=lines[i].slice(m.index+m[0].length).replace(/^[\s:：]+/,"");
    const candidates=[tail];
    for(let k=1;k<=2;k++){
      const follow=lines[i+k]||"";
      if(amountLabel.test(follow)||feeLabel.test(follow)||/^(?:จาก|ไปที่|เลขที่|หมายเลข|วันที่|เลขอ้างอิง)/.test(follow))break;
      candidates.push(follow);
    }
    for(const v of candidates){const n=amountIn(v);if(n!==null){found.push(n);break;}}
  }
  return uniq(found);
}
function amounts(lines){
  const labelled=labelledAmounts(lines,amountLabel,true);
  // Wallet receipts sometimes show a large "B154.00" when OCR mistakes "฿154.00" for B.
  // This is a currency glyph only at the start of an isolated amount, never a bank/reference ID.
  const wallet=lines.slice(0,8).some(s=>/(?:truemoney|ทรูมันนี่)/i.test(s));
  const headline=wallet?uniq(lines.slice(0,10).flatMap(s=>{
    const m=s.match(/^[฿B]\s*((?:\d{1,3}(?:,\d{3})+|\d{1,8})(?:\.\d{2})?)\s*$/i);
    return m?[Number(m[1].replace(/,/g,""))]:[];
  })):[];
  const currency=lines.filter(s=>!feeLabel.test(s)&&!/(?:บัญชี|เลขที่|อ้างอิง)/.test(s))
    .flatMap(s=>[...s.matchAll(/(?:฿|THB\s*)(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d{1,8}(?:\.\d{2})?)(?:\s*(?:THB|บาท|฿))?/gi)]
      .map(m=>Number(m[1].replace(/,/g,""))).filter(Number.isFinite));
  const suffix=lines.filter(s=>!feeLabel.test(s)&&!/(?:บัญชี|เลขที่|อ้างอิง)/.test(s))
    .map(s=>s.match(/(?:^|\s|:)(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{1,8}\.\d{2})\s*(?:บาท|THB)(?:\s|$)/i)?.[1])
    .filter(Boolean).map(v=>Number(v.replace(/,/g,"")));
  const sourceCandidates=uniq(labelled.length?labelled:(currency.length?currency:suffix));
  let candidates=sourceCandidates;
  let amountCorrectedFromCurrencyGlyph=false;
  // Require independent visual/OCR evidence: a large "B154.00" headline AND a
  // labelled 8154.00 (the same amount prefixed by a misread ฿ symbol).
  // Without the corroborating headline, preserve uncertainty; never silently trim 8.
  if(wallet&&headline.length===1&&sourceCandidates.length){
    const primary=headline[0];
    const confused=Number("8"+String(primary));
    if(sourceCandidates.every(v=>v===primary||v===confused)){
      amountCorrectedFromCurrencyGlyph=sourceCandidates.includes(confused);
      candidates=[primary];
    }else{
      // Two independent readings disagree: retain all values and refuse a single amount.
      candidates=uniq([...sourceCandidates,primary]);
    }
  }
  if(wallet&&headline.length===1&&!sourceCandidates.length)candidates=headline;
  const amountTHB=candidates.length===1?candidates[0]:null;
  const fees=labelledAmounts(lines,feeLabel);
  // On some TrueMoney slips "฿0.00" becomes "80.00". Unlike the transfer amount,
  // it has no independent corroborating value, so do not fabricate a zero fee.
  const feeGlyphUncertain=wallet&&fees.length===1&&/^8(?:0|00)\.\d{2}$/.test(fees[0].toFixed(2));
  const feeTHB=fees.length===1&&!feeGlyphUncertain?fees[0]:null;
  return {
    amountTHB,feeTHB,amountCandidates:amountCorrectedFromCurrencyGlyph?sourceCandidates:candidates,
    amountCorrectedFromCurrencyGlyph,feeGlyphUncertain,
    feeCandidates:fees
  };
}
function references(lines){
  const short=[],long=[],other=[];
  const refLabel=/(หมายเลขอ้างอิง|เลขที่อ้างอิง|เลข(?:ที่|รายการ)?(?:อ้างอิง|รายการ|ธุรกรรม)|รหัสอ้างอิง|เลขที่รายการ|เลขที่ทำรายการ|(?:TRANSACTION|TRANSFER)\s*(?:ID|NO\.?|REF(?:ERENCE)?)|(?:REFERENCE|REF)\s*(?:NO\.?|NUMBER|ID|#))/i;
  const candidate=s=>{
    const str=String(s||"").trim().replace(/^[\s:：#=\-]+/,"");
    const m=str.match(/^([A-Z0-9][A-Z0-9/_-]{5,69})(?![A-Z0-9])/i);
    if(!m)return "";
    const value=m[1].toUpperCase().replace(/[^A-Z0-9]/g,"");
    return (value.match(/\d/g)||[]).length>=4?value:"";
  };
  for(let i=0;i<lines.length;i++){
    const m=refLabel.exec(lines[i]);if(!m)continue;
    let ref=candidate(lines[i].slice(m.index+m[0].length));
    if(!ref)for(let step=1;step<=3;step++){
      const next=lines[i+step];if(!next||refLabel.test(next)||feeLabel.test(next)||amountLabel.test(next))break;
      ref=candidate(next);if(ref)break;
    }
    if(!ref)continue;
    if(/หมายเลขอ้างอิง/i.test(m[0]))short.push(ref);
    else if(/เลขที่อ้างอิง/i.test(m[0]))long.push(ref);
    else other.push(ref);
  }
  for(const line of lines){
    const m=line.match(/(?:^|\s)(20\d{18,28})(?!\d)/);if(m)long.push(m[1]);
  }
  const longReference=pick(long),shortReference=pick(short);
  const transactionRef=longReference||pick(other)||shortReference;
  return {longReference,shortReference,transactionRef};
}
function dateTime(text,longRef){
  const known=[],unknown=[];
  const time=/(?:[,，|–-]\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?/;
  for(const m of text.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)){
    const t=text.slice(m.index+m[0].length,m.index+m[0].length+45).match(/^\s*(?:[,，|–-]\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if(t)known.push(bangkok(m[1],m[2],m[3],t[1],t[2],t[3]||0));
  }
  for(const m of text.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g)){
    const t=text.slice(m.index+m[0].length,m.index+m[0].length+45).match(/^\s*(?:[,，|–-]\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if(t)known.push(bangkok(m[3],m[2],m[1],t[1],t[2],t[3]||0));
  }
  for(const m of text.matchAll(/(\d{1,2})\s*([ก-๙a-zA-Z.]{2,16})\s*(\d{2,4})\s*(?:[,，]\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?/gi)){
    const month=monthNames.find(x=>x.label===m[2].toUpperCase().replace(/[.\s]/g,""))?.month;
    if(month)known.push(bangkok(m[3],month,m[1],m[4],m[5],m[6]||0));
    else unknown.push({day:Number(m[1]),year:year(m[3]),hour:Number(m[4]),min:Number(m[5]),seconds:Number(m[6]||0)});
  }
  const v=pick(known);
  if(v)return {payoutAt:v,dateSource:"visible-date"};
  // Bank-dependent fallback: only when visible day/year/hour/minute agree with a long reference.
  if(/^20\d{12}/.test(longRef)){
    const fromRef=bangkok(longRef.slice(0,4),longRef.slice(4,6),longRef.slice(6,8),
      longRef.slice(8,10),longRef.slice(10,12));
    if(fromRef&&unknown.some(x=>x.year===Number(longRef.slice(0,4))&&
      x.day===Number(longRef.slice(6,8))&&x.hour===Number(longRef.slice(8,10))&&x.min===Number(longRef.slice(10,12))))
      return {payoutAt:fromRef,dateSource:"visible-time-matched-bank-reference"};
  }
  return {payoutAt:"",dateSource:""};
}
function accountsAndParties(lines){
  const accounts=[];
  const maskRe=/[xX*•%0-9][xX*•%0-9 -]{5,28}[xX*•%0-9]/g;
  for(let i=0;i<lines.length;i++){
    for(const m of lines[i].matchAll(maskRe)){
      const value=m[0].replace(/\s+/g,"").replace(/^-|-$/g,"");
      if(!/[xX*•%]{2}/.test(value)||(value.match(/\d/g)||[]).length<2)continue;
      accounts.push({index:i,value});
    }
  }
  const fromIndex=lines.findIndex(x=>/^(?:จาก|from)(?:\s*:)?$/i.test(x));
  const toIndex=lines.findIndex(x=>/^(?:ไปที่|ถึง|to)(?:\s*:)?$/i.test(x));
  let sender=accounts.find(x=>fromIndex>=0&&x.index>fromIndex&&(toIndex<0||x.index<toIndex));
  if(!sender&&accounts.length>=2)sender=accounts[0];
  let recipient=accounts.find(x=>toIndex>=0&&x.index>toIndex);
  if(!recipient&&accounts.length>=2)recipient=accounts.at(-1);
  if(!recipient&&accounts.length===1)recipient=accounts[0];
  if(sender&&recipient&&sender.index===recipient.index)sender=null;
  const nearestBank=index=>{
    if(index<0)return "";
    const surrounding=[];
    for(let i=Math.max(0,index-4);i<=Math.min(lines.length-1,index+2);i++){
      const name=detectBank(lines[i]);if(name&&name!=="TrueMoney Wallet")
        surrounding.push({name,distance:Math.abs(index-i),following:i>index});
    }
    surrounding.sort((a,b)=>a.distance-b.distance||Number(a.following)-Number(b.following));
    return surrounding[0]?.name||"";
  };
  const nearestName=index=>{
    if(index<0)return "";
    for(let i=index-1;i>=Math.max(0,index-5);i--)if(isName(lines[i]))return lines[i].slice(0,120);
    return "";
  };
  const senderBank=nearestBank(sender?.index??-1);
  const recipientBank=nearestBank(recipient?.index??-1);
  const senderName=nearestName(sender?.index??-1);
  const recipientName=nearestName(recipient?.index??-1);
  const recipientAccountMasked=recipient?.value||"";
  const trailing=recipientAccountMasked.match(/(\d{2,4})$/)?.[1]||"";
  // A masked number ending in X is not an account "last 4"; do not infer hidden digits.
  const fallback=!recipientAccountMasked?pick(lines.flatMap(x=>[...x.matchAll(/(?:[xX*•]{2,})\s*(\d{4})(?!\d)/g)].map(m=>m[1]))):"";
  const recipientVisibleSuffix=trailing||fallback;
  const accountType=recipientAccountMasked?"bank-account":fallback?"masked-unknown":"unknown";
  const issuerText=lines.slice(0,9).join("\n");
  let bank=detectBank(issuerText);
  // Branding "Bangkok Bank", "K PLUS", "TrueMoney" outranks incidental sender/receiver mentions.
  for(const brand of ["TrueMoney Wallet","ธนาคารกรุงเทพ","ธนาคารกสิกรไทย","ธนาคารไทยพาณิชย์"]){
    const item=banks.find(x=>x.name===brand);
    if(item?.re.test(lines.slice(0,3).join(" "))) {bank=brand;break;}
  }
  if(!bank)bank=senderBank;
  return {
    bank,senderName,senderBank,senderAccountMasked:sender?.value||"",
    recipientName,recipientBank,recipientAccountMasked,
    recipientVisibleSuffix,recipientLast4:recipientVisibleSuffix.length===4?recipientVisibleSuffix:"",
    recipientIdentifierType:accountType,recipientLabel:recipientName||recipientAccountMasked||fallback
  };
}
export function parseTransferSlipText(raw){
  const text=clean(raw).slice(0,16000),lines=text.split("\n").map(s=>s.trim()).filter(Boolean);
  const refs=references(lines),dt=dateTime(text,refs.longReference),party=accountsAndParties(lines),money=amounts(lines);
  const isSuccessful=!/ไม่สำเร็จ|ล้มเหลว|failed|unsuccessful/i.test(text)&&
    /(?:โอนเงิน|รายการ)\s*สำเร็จ|(?:transfer\s+)?successful|success|completed/i.test(text);
  const missing=[!dt.payoutAt&&"วันและเวลา",!refs.transactionRef&&"เลขอ้างอิง",
    money.amountTHB===null&&"ยอดเงิน",!party.recipientAccountMasked&&!party.recipientName&&"ผู้รับเงิน"].filter(Boolean);
  const reviewFlags=[dt.dateSource==="visible-time-matched-bank-reference"&&"วันเวลาอ้างอิงเลขรายการเพราะ OCR อ่านชื่อเดือนไม่ชัด",
    party.recipientIdentifierType==="bank-account"&&"เลขบัญชีถูกปิดบังบางส่วน ต้องตรวจยืนยันผู้รับด้วยตนเอง",
    money.amountCandidates.length>1&&!money.amountCorrectedFromCurrencyGlyph&&"OCR พบยอดเงินหลายค่าที่ขัดกัน ต้องตรวจยอดจากภาพต้นฉบับ",
    money.amountCorrectedFromCurrencyGlyph&&"สัญลักษณ์ ฿ ในสลิป Wallet อาจถูก OCR อ่านเป็น 8; ระบบเทียบกับยอดที่พิมพ์ซ้ำบนภาพแล้ว กรุณาตรวจทานยอด",
    money.feeGlyphUncertain&&"ค่าธรรมเนียมของ Wallet อาจถูก OCR อ่านเป็น 80.00 แทน ฿0.00 จึงไม่ระบุยอดค่าธรรมเนียมจนกว่าจะตรวจภาพจริง"].filter(Boolean);
  return {...refs,...dt,...party,...money,isSuccessful,missing,reviewFlags};
}
