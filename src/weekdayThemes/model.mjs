// Appearance metadata only. Calendar, saved preferences and eligibility stay in their original modules.
import { WEEKDAY_IDS } from '../weekdayCollection.mjs';

const rows = [
  ['monday','จันทร์','Monday','Golden Morning','แสงเช้า · ดอกเดซี่ · ผิวแชมเปญ','#94620b','#4a361b','#fffaf0','#fffdf7','#fff1cb','#d7bd87','radial-gradient(ellipse at 100% 110%,#efca6730,transparent 55%),linear-gradient(145deg,#fffef6,#fff9e9)'],
  ['tuesday','อังคาร','Tuesday','Blush Studio','ทิวลิป · เซรามิกชมพู · โรสโกลด์','#ae3868','#54293d','#fff4f8','#fffbfd','#f9e3ed','#dfb8ca','radial-gradient(ellipse at 95% 120%,#edb6cb30,transparent 52%),linear-gradient(115deg,#fffdfd,#fdf0f6)'],
  ['wednesday','พุธ','Wednesday','Botanical Focus','ใบไม้ · ไม้เบิร์ช · กระจกเขียว','#326c51','#213c30','#f1f7f1','#f9fcf7','#e3eee1','#b5c9b4','linear-gradient(140deg,#ffffffb0,transparent 68%),radial-gradient(ellipse at 95% 120%,#9cb99425,transparent 60%)'],
  ['thursday','พฤหัสบดี','Thursday','Amber City','วิวเมือง · แสงอำพัน · ทองแดง','#a65b18','#4e321e','#fff6ec','#fffaf5','#f9e5cf','#dfbd94','linear-gradient(145deg,#fffdf7,#fff1df),repeating-linear-gradient(100deg,transparent 0 30px,#d4a27210 31px 32px)'],
  ['friday','ศุกร์','Friday','Blue Escape','ริมทะเล · กระจกฟ้า · โลหะเงิน','#226d96','#243f52','#eff8fc','#f9fdff','#dfeff6','#adcbdc','radial-gradient(ellipse at 100% 115%,#9bd9ee28,transparent 55%),linear-gradient(150deg,#ffffffbb,transparent 65%)'],
  ['saturday','เสาร์','Saturday','Lavender Lounge','ลาเวนเดอร์ · เซรามิกม่วง · มุมพักผ่อน','#7753a0','#3e3153','#f6f2fb','#fcfaff','#ebe3f5','#cab9dc','radial-gradient(ellipse at 100% 120%,#b7a1d62b,transparent 55%),linear-gradient(145deg,#fffaff,#f5effa)'],
  ['sunday','อาทิตย์','Sunday','Ruby Sunset','อาทิตย์ตก · หนังสือ · ผิวทับทิม','#a53c4a','#502b31','#fff2f1','#fffafa','#f6e1df','#dfb9bc','linear-gradient(155deg,#fffdfb,#fcebe9),radial-gradient(ellipse at 100% 110%,#cf7b7b20,transparent 55%)'],
];
const messages = [
  ['เริ่มต้นสัปดาห์อย่างมั่นใจ ให้ทุกการแชทเป็นประสบการณ์ที่ดีของลูกค้า','เริ่มต้นวันใหม่ด้วยพลังบวก'],
  ['พลังดี ๆ ในทุกการแชท สร้างประสบการณ์ที่ดีให้กับลูกค้า','ทุกการแชท คือโอกาสในการสร้างความประทับใจ'],
  ['คิดบวก ทำวันนี้ให้ดีที่สุด เพื่อรอยยิ้มของลูกค้า','ความสำเร็จ เริ่มต้นจากการลงมือทำ'],
  ['มุ่งมั่นในวันนี้ สร้างผลลัพธ์ที่ดีกว่าเดิม','ความพยายามในวันนี้ คือผลลัพธ์ที่ดีในวันพรุ่งนี้'],
  ['ทำงานให้เต็มที่ แล้วพบวันหยุดที่สดใส','ทำวันนี้ให้ดี แล้ววันหยุดจะมีความสุขกว่าเดิม'],
  ['เติมพลังให้ตัวเอง แล้วกลับมาลุยกันต่อ','พักให้เต็มที่ เพื่อวันใหม่ที่ดีกว่า'],
  ['พักผ่อนวันนี้ เพื่อพรุ่งนี้ที่สดใสกว่าเดิม','จบสัปดาห์ด้วยรอยยิ้ม เพื่อเริ่มสัปดาห์ใหม่อย่างมั่นใจ'],
];
export const WEEKDAY_THEMES = rows.map(([slug,day,english,label,material,accent,ink,pale,card,inset,line,art], index) => Object.freeze({
  id: WEEKDAY_IDS[index], slug, day, english, label, material, accent, ink, pale, card, inset, line, art,
  image:`/weekday-themes/${slug}.webp`, atlas:`/weekday-themes/icons/${slug}.webp`,
  message:messages[index][0], quote:messages[index][1],
}));
export const weekdayThemeFor = id => WEEKDAY_THEMES.find(theme => theme.id === id) || null;
