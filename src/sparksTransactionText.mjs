// Display-only normalization; never change ledger amounts or audit records.
export const REFUND_REASONS=[
"คืนคะแนนเนื่องจากข้อผิดพลาดของระบบ","คืนคะแนนเนื่องจากการหักคะแนนซ้ำ","คืนคะแนนเนื่องจากการหักคะแนนไม่ถูกต้อง","คืนคะแนนเนื่องจากไม่สามารถเข้าร่วมกิจกรรมได้","คืนคะแนนเนื่องจากการยกเลิกรายการ","คืนคะแนนเนื่องจากไม่สามารถใช้สิทธิ์ได้","คืนคะแนนเนื่องจากการปรับปรุงเงื่อนไขกิจกรรม","คืนคะแนนตามผลการตรวจสอบของผู้ดูแลระบบ"
];
export function transactionText(entry){
 let title=String(entry.title||""),detail=String(entry.detail||"");
 if(entry.voided)return {title,detail};
 if(entry.source==="reward-refund")return {title:"Sparks Refund",detail:entry.reason||detail};
 if(title==="Weekly Matching Entry"){
  const theme=detail.match(/ค่าเข้าเล่น\s+(\S+)/)?.[1];
  if(theme==="fruit"){title="Fruit Match Entry";detail="ค่าธรรมเนียมการเข้าร่วมเกมจับคู่ผลไม้";}
  else if(theme){title="Matching Game Entry";detail="ค่าธรรมเนียมการเข้าร่วมเกมจับคู่ ("+theme+")";}
 }
 if(title==="15-Puzzle Entry")detail="ค่าธรรมเนียมการเข้าร่วมเกม 15-Puzzle";
 if(/Match Reward$/.test(title))detail=detail.replace(/จับคู่ครบ (\d+) คู่\s*·\s*([\d.]+) วินาที/,"จับคู่สำเร็จ $1 คู่ ใช้เวลา $2 วินาที");
 if(title==="15-Puzzle Reward")detail=detail.replace(/ผ่านเกม ([\d.]+) วินาที\s*·\s*รางวัล (\d+) \+ โบนัสเร็ว (\d+)(?:\s*·\s*โบนัสอันดับจ่ายเมื่อปิดรอบวันจันทร์)?/,"เล่นเกมสำเร็จในเวลา $1 วินาที · รางวัลพื้นฐาน $2 Sparks · โบนัสความเร็ว $3 Sparks");
 if(title==="15-Puzzle Weekly Top 5")detail=detail.replace(/^อันดับ (\d+) ประจำสัปดาห์ (.*?)(?: \(ปิด .*\))?$/,"รางวัลอันดับที่ $1 ประจำสัปดาห์ $2");
 if(/^Daily Check-in(?: Phase \d+)? Reward$/.test(title)){
  const phase=title.match(/Phase (\d+)/)?.[1]||detail.match(/Phase (\d+)/)?.[1];
  title="Daily Check-in Reward";
  detail=detail.replace(/^Phase \d+\s*·\s*/,"").replace(/เช็กอินวันที่/,"เช็กอินประจำวันที่").replace(/\b20\d{2}\b/g,y=>String(Number(y)+543));
  if(phase&&!detail.includes("รอบที่"))detail+=" (รอบที่ "+phase+")";
 }
 return {title,detail};
}
