"""Generate labelled, schematic button guides from the deployed manual (not screenshots)."""
from pathlib import Path
import base64, json, re, tempfile
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parents[1]
source=(root/'src/THSarabunNew-jsPDF.ts').read_text()
fonts={name:base64.b64decode(data) for name,data in re.findall(r'addFileToVFS\("([^"]+)", "([A-Za-z0-9+/=]+)"\)',source)}
with tempfile.TemporaryDirectory() as folder:
 for name,data in fonts.items(): Path(folder,name).write_bytes(data)
 def font(size,bold=False):return ImageFont.truetype(str(Path(folder,'THSarabunNew-Bold.ttf' if bold else 'THSarabunNew.ttf')),size,layout_engine=ImageFont.Layout.RAQM)
 for chapter in json.loads((root/'src/knowledge/manual.json').read_text())['chapters']:
  image=Image.new('RGB',(1440,452),'#f8fafc');d=ImageDraw.Draw(image)
  d.rounded_rectangle((2,2,1437,449),20,fill='white',outline='#d8cdec',width=3)
  logo=Image.open(root/'public/robinhood-logo.png').convert('RGBA');logo.thumbnail((58,58));image.paste(logo,(28,25),logo)
  d.text((102,22),chapter['buttonGuide']['menu'],font=font(40,True),fill='#402065')
  d.text((104,69),'ภาพแนะนำปุ่มและลำดับงาน',font=font(28),fill='#67748a')
  for i,label in enumerate(chapter['buttonGuide']['buttons']):
   x=28+i*469
   d.rounded_rectangle((x,125,x+439,355),16,fill='#f8faff',outline='#dde5f1',width=2)
   d.rounded_rectangle((x+18,142,x+67,190),12,fill='#eee7ff')
   d.text((x+30,144),str(i+1),font=font(34,True),fill='#7034bb')
   size=36
   while d.textlength(label,font=font(size,True))>390 and size>22:size-=1
   d.rounded_rectangle((x+18,219,x+420,283),12,fill='#6430a3')
   tw=d.textlength(label,font=font(size,True));d.text((x+219-tw/2,228),label,font=font(size,True),fill='white')
   d.text((x+22,303),['เริ่มจากเมนู / ตัวเลือกนี้','ตรวจข้อมูลก่อนดำเนินการ','ตรวจผลหลังทำรายการ'][i],font=font(28),fill='#536078')
  d.text((30,389),chapter['buttonGuide']['note'],font=font(28),fill='#69778e')
  output=root/'public/guide'/f"{chapter['id']}-buttons.png";output.parent.mkdir(exist_ok=True);image.save(output,optimize=True)
print('Rendered 38 guide figures')
