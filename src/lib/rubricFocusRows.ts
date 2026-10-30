import octoberRubric from "./october2026Rubric.json";

export type FocusTableRow = {
  categoryCode: string;
  category: string;
  max: number;
  assessment: string;
  displayCategoryCode: string;
  displayCategory: string;
  displayMax: number | string;
  displayAssessment: string;
  focusNo: string;
  focusItem: string;
  reviewGuide: string;
  examples: string;
  evidence?: string;
  processReference?: string;
};

export const AUGUST_FOCUS_TABLE_ROWS: FocusTableRow[] = [
  {
    categoryCode: "1", category: "ขั้นตอนการทำงานและนโยบาย (Process & Policy Compliance)", max: 30, assessment: "การทำงานตาม Process",
    displayCategoryCode: "1", displayCategory: "ขั้นตอนการทำงานและนโยบาย (Process & Policy Compliance)", displayMax: 30, displayAssessment: "การทำงานตาม Process", focusNo: "1",
    focusItem: "เปิดและปิดแชทตามมาตรฐาน (Standard Opening & Closing)",
    reviewGuide: "ดูว่าแอดมินเริ่มแชทและจบแชทถูกต้องหรือไม่ เช่น ทักทาย แนะนำตัว แจ้งว่าพร้อมช่วยเหลือ และปิดแชทเมื่อให้ข้อมูลครบแล้ว แอดมินควรเรียกชื่อตัวเองตามมาตรฐานอย่างน้อย 2 ครั้งในเคสนั้น ตรงไหนก็ได้ และไม่รีบปิดเคสก่อนผู้ติดต่อได้รับคำตอบครบ",
    examples: "ไม่ทักทายหรือไม่แนะนำตัว, ไม่มีข้อความปิดแชท, ระบุชื่อแอดมินไม่ครบ 2 ครั้งในเคส, ปิดเคสเร็วเกินไป หรือปิดแชททั้งที่ผู้ติดต่อยังต้องการความช่วยเหลือ", evidence: "ข้อความและเวลาในแชท", processReference: "ทุก Process",
  },
  {
    categoryCode: "1", category: "ขั้นตอนการทำงานและนโยบาย (Process & Policy Compliance)", max: 30, assessment: "การทำงานตาม Process",
    displayCategoryCode: "", displayCategory: "", displayMax: "", displayAssessment: "", focusNo: "2",
    focusItem: "ยืนยันข้อมูล / PDPA / Policy (Verification, PDPA & Policy Compliance)",
    reviewGuide: "ดูว่าแอดมินขอข้อมูล ใช้ข้อมูล และแจ้งข้อมูลตาม PDPA และนโยบายบริษัทหรือไม่ ควรขอเฉพาะข้อมูลที่จำเป็น ยืนยันตัวตนหรือยืนยันข้อมูลตามประเภทเคส และไม่เปิดเผยข้อมูลของผู้อื่นเกินความจำเป็น",
    examples: "ขอข้อมูลเกินจำเป็น, เปิดเผยข้อมูลของผู้อื่น, ไม่ยืนยันข้อมูลในเคสที่ต้องตรวจสอบ, แจ้งข้อมูลขัดกับนโยบาย หรือใช้ข้อมูลส่วนบุคคลไม่เหมาะกับเคส", evidence: "แชทและข้อมูลเจ้าของบัญชี", processReference: "Slide 41–42 และ 78–80",
  },
  {
    categoryCode: "1", category: "ขั้นตอนการทำงานและนโยบาย (Process & Policy Compliance)", max: 30, assessment: "การทำงานตาม Process",
    displayCategoryCode: "", displayCategory: "", displayMax: "", displayAssessment: "", focusNo: "3",
    focusItem: "เงื่อนไขก่อนดำเนินการ (Status & Eligibility Check)",
    reviewGuide: "ตรวจประเภทผู้ติดต่อ สถานะออเดอร์หรือบัญชี ช่องทางชำระเงิน และเงื่อนไขของ Process ก่อนดำเนินการ Cancel, Refund, Partial Refund, ระงับ หรือ Re-active",
    examples: "ใช้ Process ผิดประเภท, ทำรายการผิดสถานะ, เลือกช่องทางผิด หรือดำเนินการทั้งที่ข้อมูลและเงื่อนไขยังไม่ครบ", evidence: "Admin Panel, OPS และ Salesforce", processReference: "Process ของเคสนั้น",
  },
  {
    categoryCode: "1", category: "ขั้นตอนการทำงานและนโยบาย (Process & Policy Compliance)", max: 30, assessment: "การทำงานตาม Process",
    displayCategoryCode: "", displayCategory: "", displayMax: "", displayAssessment: "", focusNo: "4",
    focusItem: "การทำรายการและตรวจสอบยอด (System Transaction & Financial Accuracy)",
    reviewGuide: "ตรวจประเภทการทำรายการ ยอดเงิน ผู้จ่าย ผู้รับ Full Refund หรือ Partial Refund เหตุผล และรายละเอียดทั้งหมดก่อนกด Confirm",
    examples: "คืนเงินผิดยอด, เลือกผู้จ่ายหรือผู้รับผิด, ไม่ปิด Full Refund เมื่อต้องคืนบางส่วน, ทำรายการซ้ำ หรือบันทึกเหตุผลไม่ถูกต้อง", evidence: "Transaction Log", processReference: "Slide 32–38",
  },
  {
    categoryCode: "1", category: "ขั้นตอนการทำงานและนโยบาย (Process & Policy Compliance)", max: 30, assessment: "การทำงานตาม Process",
    displayCategoryCode: "", displayCategory: "", displayMax: "", displayAssessment: "", focusNo: "5",
    focusItem: "Process / SLA / การส่งต่อ / การปิดเคส (Process, SLA, Escalation & Case Closure)",
    reviewGuide: "ดูว่าแอดมินทำตาม Process และเวลาที่กำหนดหรือไม่ ได้แก่ รับแชทไม่เกิน 5 นาที ตอบกลับระหว่างสนทนาไม่เกิน 2 นาที และปิดแชทภายใน 4 นาทีหลังข้อความสุดท้าย รวมถึงโทรออกหรือประสานงานตาม Process ส่งต่อถูกทีม และปิดเคสเมื่อให้ข้อมูลหรือแจ้งขั้นตอนถัดไปครบแล้ว",
    examples: "ไม่ทำตาม Process, รับแชทเกิน 5 นาที, ตอบกลับเกิน 2 นาที, ปิดแชทเกิน 4 นาทีหลังข้อความสุดท้าย, ไม่โทรออกตามเงื่อนไข, ส่งต่อผิดทีม, ส่งต่อข้อมูลไม่ครบ หรือปิดเคสทั้งที่ยังไม่มีแนวทางต่อ", evidence: "เวลาแชทและเวลาเปิดเคส", processReference: "Process ของเคสนั้น",
  },
  {
    categoryCode: "1", category: "ขั้นตอนการทำงานและนโยบาย (Process & Policy Compliance)", max: 30, assessment: "การทำงานตาม Process",
    displayCategoryCode: "", displayCategory: "", displayMax: "", displayAssessment: "", focusNo: "6",
    focusItem: "การโทรและการประสานงาน (Contact & Coordination)",
    reviewGuide: "ตรวจว่าแอดมินโทรหรือติดต่อผู้เกี่ยวข้องตามจำนวนครั้งและกรอบเวลาที่ Process กำหนด พร้อมบันทึกผลและใช้ขั้นตอนถัดไปอย่างถูกต้อง",
    examples: "ไม่โทรตามเงื่อนไข, จำนวนครั้งไม่ครบ, ติดต่อเกินเวลาที่กำหนด, ไม่บันทึกผลการติดต่อ หรือไม่ดำเนินการต่อหลังติดต่อไม่ได้", evidence: "Call Log และ Case History", processReference: "Process ที่กำหนดให้โทรหรือส่งต่อ",
  },
  {
    categoryCode: "1", category: "ขั้นตอนการทำงานและนโยบาย (Process & Policy Compliance)", max: 30, assessment: "การทำงานตาม Process",
    displayCategoryCode: "", displayCategory: "", displayMax: "", displayAssessment: "", focusNo: "7",
    focusItem: "Case Note / Tag / การบันทึกเคส (Case Notes, Tagging & Documentation)",
    reviewGuide: "ดูว่าแอดมินบันทึกเคสใน Support Center ครบและถูกต้องหรือไม่ ต้องเลือก Tag ให้ตรงเรื่อง ใส่ข้อมูลสำคัญที่จำเป็น เช่น เลขออเดอร์ Shop ID MID RR เบอร์โทรศัพท์ หรือข้อมูลอ้างอิง และสรุปสิ่งที่ตรวจสอบหรือดำเนินการแล้วให้ทีมถัดไปเข้าใจได้",
    examples: "ไม่บันทึกเคส, ไม่ใส่ Tag, ใส่ Tag ไม่ตรงเรื่อง, Case Note ไม่ครบหรือคลุมเครือ, ไม่ใส่ข้อมูลสำคัญ หรือทีมถัดไปอ่านแล้วตามงานต่อได้ยาก", evidence: "Support Center, Salesforce และ Oho", processReference: "Process ที่กำหนดให้บันทึกเคส",
  },
  {
    categoryCode: "2", category: "ความถูกต้องของคำตอบและการตรวจสอบข้อมูล (Answer Accuracy & Verification)", max: 20, assessment: "ความถูกต้องของคำตอบ",
    displayCategoryCode: "2", displayCategory: "ความถูกต้องของคำตอบและการตรวจสอบข้อมูล (Answer Accuracy & Verification)", displayMax: 20, displayAssessment: "ความถูกต้องของคำตอบ", focusNo: "1",
    focusItem: "ตอบถูกต้องและครบประเด็น (Answer Accuracy & Completeness)",
    reviewGuide: "ดูว่าคำตอบถูกต้อง ตรงกับประเภทผู้ติดต่อ เช่น ลูกค้า ไรเดอร์ หรือร้านค้า และตอบครบทุกคำถามที่ผู้ติดต่อถาม ทั้งคำถามหลัก คำถามต่อเนื่อง และข้อมูลที่จำเป็นต่อการตัดสินใจ ไม่ทำให้ต้องถามซ้ำในเรื่องเดิม",
    examples: "แจ้งเงื่อนไขผิด, แจ้งสถานะหรือยอดเงินผิด, ใช้ข้อมูลเก่าหรือไม่ตรงปัจจุบัน, ตอบไม่ตรงประเภทผู้ติดต่อ, ตอบไม่ครบ, ข้ามคำถามหลัก หรือทำให้ผู้ติดต่อเข้าใจผิด", evidence: "แชทเทียบกับข้อมูลระบบ", processReference: "ทุก Process",
  },
  {
    categoryCode: "2", category: "ความถูกต้องของคำตอบและการตรวจสอบข้อมูล (Answer Accuracy & Verification)", max: 20, assessment: "ความถูกต้องของคำตอบ",
    displayCategoryCode: "", displayCategory: "", displayMax: "", displayAssessment: "", focusNo: "2",
    focusItem: "ตรวจสอบข้อมูลก่อนสรุปคำตอบ (Information Verification Before Response)",
    reviewGuide: "ดูว่าแอดมินขอข้อมูลที่จำเป็นและตรวจสอบก่อนตอบหรือไม่ เช่น ตรวจระบบ ประวัติเคส รายละเอียดออเดอร์ หลักฐานจากผู้ติดต่อ หรือข้อมูลประกอบอื่น ๆ และวิเคราะห์สาเหตุให้ตรงปัญหา ไม่ด่วนสรุปจากข้อมูลที่ยังไม่เพียงพอ",
    examples: "ยังไม่ขอเลขออเดอร์ เบอร์โทรศัพท์ หรือโค้ดที่จำเป็นแต่สรุปคำตอบทันที, ตรวจสอบข้อมูลไม่ครบ, วิเคราะห์ผิดประเด็น, มองข้ามหลักฐานที่ผู้ติดต่อส่งมา หรือตอบจากการคาดเดา", evidence: "ข้อมูลระบบและหลักฐาน", processReference: "Process ของเคสนั้น",
  },
  {
    categoryCode: "2", category: "ความถูกต้องของคำตอบและการตรวจสอบข้อมูล (Answer Accuracy & Verification)", max: 20, assessment: "ความถูกต้องของคำตอบ",
    displayCategoryCode: "", displayCategory: "", displayMax: "", displayAssessment: "", focusNo: "3",
    focusItem: "ความถูกต้องของสถานะ ยอดเงิน และระยะเวลา (Status, Amount & SLA Accuracy)",
    reviewGuide: "ตรวจว่าสถานะออเดอร์ ยอดเงิน ส่วนลด ค่าจัดส่ง ผู้รับผิดชอบยอด ช่องทางคืนเงิน และระยะเวลาดำเนินการตรงกับข้อมูลในระบบและ Process",
    examples: "แจ้งสถานะผิด, แจ้งยอดผิด, ระบุผู้รับผิดชอบยอดผิด, แจ้งช่องทางหรือระยะเวลาคืนเงินผิด", evidence: "Transaction และ Refund Status", processReference: "Slide 17–24 และ 31–38",
  },
  {
    categoryCode: "2", category: "ความถูกต้องของคำตอบและการตรวจสอบข้อมูล (Answer Accuracy & Verification)", max: 20, assessment: "ความถูกต้องของคำตอบ",
    displayCategoryCode: "", displayCategory: "", displayMax: "", displayAssessment: "", focusNo: "4",
    focusItem: "สรุปตามข้อมูลที่ตรวจสอบได้ (Evidence-based Conclusion)",
    reviewGuide: "แยกให้ชัดเจนว่าสิ่งใดตรวจพบแล้ว สิ่งใดดำเนินการแล้ว และสิ่งใดยังอยู่ระหว่างตรวจสอบ โดยไม่คาดเดาหรือยืนยันเกินข้อมูลที่มี",
    examples: "สรุปสาเหตุโดยไม่มีหลักฐาน, แจ้งว่าดำเนินการแล้วทั้งที่ยังไม่ได้ทำ หรือยืนยันผลทั้งที่ยังอยู่ระหว่างตรวจสอบ", evidence: "แชทและ Audit Trail", processReference: "ทุก Process",
  },
  {
    categoryCode: "3", category: "การดูแลเคสและติดตามผล (Case Handling & Follow-up)", max: 25, assessment: "การดูแลเคส",
    displayCategoryCode: "3", displayCategory: "การดูแลเคสและติดตามผล (Case Handling & Follow-up)", displayMax: 25, displayAssessment: "การดูแลเคส", focusNo: "1",
    focusItem: "ดูแลเคสตั้งแต่รับเรื่องจนมีข้อสรุป (End-to-End Case Handling)",
    reviewGuide: "ดูว่าแอดมินรับเรื่องแล้วดูแลต่อเนื่องหรือไม่ ไม่ตอบแล้วปล่อย ไม่โยนภาระให้ผู้ติดต่อโดยไม่จำเป็น และทำให้ผู้ติดต่อมั่นใจว่าเรื่องได้รับการดูแลจนมีข้อสรุปหรือมีแนวทางดำเนินการต่อ",
    examples: "รับเรื่องแล้วไม่ดำเนินการต่อ, ให้ผู้ติดต่อจัดการเองทั้งที่แอดมินควรช่วยตรวจสอบ, ไม่สรุปว่าเคสอยู่ขั้นตอนไหน หรือทำให้ผู้ติดต่อไม่รู้ว่าเรื่องได้รับการดูแลแล้วหรือยัง", evidence: "Timeline และ Case History", processReference: "ทุก Process",
  },
  {
    categoryCode: "3", category: "การดูแลเคสและติดตามผล (Case Handling & Follow-up)", max: 25, assessment: "การดูแลเคส",
    displayCategoryCode: "", displayCategory: "", displayMax: "", displayAssessment: "", focusNo: "2",
    focusItem: "แจ้งขั้นตอนถัดไปให้ชัด (Clear Next Step Communication)",
    reviewGuide: "ดูว่าแอดมินแจ้งขั้นตอนถัดไปชัดเจนหรือไม่ เช่น ต้องรออะไร รอนานเท่าไร ต้องส่งข้อมูลอะไรเพิ่ม หรือทีมใดจะดำเนินการต่อ เพื่อให้ผู้ติดต่อทราบว่าหลังจากนี้ต้องทำอะไร",
    examples: "ไม่มีขั้นตอนถัดไป, แจ้งให้รอแต่ไม่บอกระยะเวลา, ไม่บอกว่าต้องส่งข้อมูลอะไรเพิ่ม, ไม่แจ้งช่องทางติดตามผล หรือแจ้งกว้างเกินไปจนดำเนินการต่อไม่ได้", evidence: "ข้อความในแชท", processReference: "Process ที่มีขั้นตอนต่อ",
  },
  {
    categoryCode: "3", category: "การดูแลเคสและติดตามผล (Case Handling & Follow-up)", max: 25, assessment: "การดูแลเคส",
    displayCategoryCode: "", displayCategory: "", displayMax: "", displayAssessment: "", focusNo: "3",
    focusItem: "ติดตามและแจ้งผลตรวจสอบ (Follow-up & Result Update)",
    reviewGuide: "ดูว่าเมื่อแอดมินตรวจระบบ โทรออก ประสานงาน หรือส่งต่อแล้ว มีการสรุปผลกลับมาในแชทหรือไม่ ควรแจ้งว่าพบอะไร ดำเนินการอะไรไปแล้ว และสถานะล่าสุดเป็นอย่างไร",
    examples: "ตรวจสอบแล้วแต่ไม่แจ้งผล, โทรออกหรือประสานงานแล้วไม่สรุป, มีการติดต่อกลับแต่ไม่บอกข้อสรุป หรือแจ้งผลไม่ครบจนผู้ติดต่อต้องถามซ้ำ", evidence: "Case History และข้อความติดตาม", processReference: "Refund, IT, Operation และ CS Tier2",
  },
  {
    categoryCode: "3", category: "การดูแลเคสและติดตามผล (Case Handling & Follow-up)", max: 25, assessment: "การดูแลเคส",
    displayCategoryCode: "", displayCategory: "", displayMax: "", displayAssessment: "", focusNo: "4",
    focusItem: "กรณีข้อมูลไม่ครบ ติดต่อไม่ได้ หรือ Pending Review (Exception Handling)",
    reviewGuide: "ขอข้อมูลเพิ่มเติมหรือใช้ขั้นตอนสำรองตามที่ Process ระบุ หาก Process ยังเป็น Pending Review ให้ประเมินเฉพาะข้อกำหนดที่ประกาศใช้แล้ว",
    examples: "ไม่ขอข้อมูลที่จำเป็น, ไม่ใช้ขั้นตอนสำรองที่กำหนด, สร้าง Process หรือ SLA เพิ่มเอง หรือหักคะแนนจากขั้นตอนที่ยัง Pending Review", evidence: "แชทและ Process ปัจจุบัน", processReference: "Process ที่มีเงื่อนไขเพิ่มเติม",
  },
  {
    categoryCode: "4", category: "ทักษะการสื่อสาร (Communication Skills)", max: 25, assessment: "ทักษะการสื่อสาร",
    displayCategoryCode: "4", displayCategory: "ทักษะการสื่อสาร (Communication Skills)", displayMax: 25, displayAssessment: "ทักษะการสื่อสาร", focusNo: "1",
    focusItem: "อ่านง่ายและเรียงลำดับชัด (Clear Structure & Logical Flow)",
    reviewGuide: "ดูว่าข้อความอ่านเข้าใจง่ายหรือไม่ ควรเรียงจากรับเรื่อง → ตรวจสอบหรือแจ้งผล → แจ้งขั้นตอนถัดไป แยกแต่ละประเด็นให้ชัด ไม่เขียนรวมกันจนผู้ติดต่อสับสน",
    examples: "ข้อความยาวติดกัน, ลำดับสลับ, หลายประเด็นปนกัน, อ่านแล้วไม่รู้ว่าต้องทำอะไรก่อน หรือจุดสำคัญไม่ชัด", evidence: "ข้อความในแชท", processReference: "ทุก Process",
  },
  {
    categoryCode: "4", category: "ทักษะการสื่อสาร (Communication Skills)", max: 25, assessment: "ทักษะการสื่อสาร",
    displayCategoryCode: "", displayCategory: "", displayMax: "", displayAssessment: "", focusNo: "2",
    focusItem: "กระชับและตรงประเด็น (Concise & Relevant Communication)",
    reviewGuide: "ดูว่าคำตอบสั้นพอดี ตรงคำถาม และเข้าใจได้ทันทีหรือไม่ ควรให้ข้อมูลที่จำเป็นครบ โดยไม่วกวน ไม่ใส่ข้อมูลที่ไม่เกี่ยวข้อง และไม่ใช้คำซ้ำจนเยิ่นเย้อ",
    examples: "ตอบยาวเกินจำเป็น, ใช้คำฟุ่มเฟือย, ตอบไม่ตรงคำถาม, ใส่ข้อมูลที่ไม่เกี่ยวกับปัญหา หรือใช้ประโยคซ้ำจนข้อความเยิ่นเย้อ", evidence: "ข้อความในแชท", processReference: "ทุก Process",
  },
  {
    categoryCode: "4", category: "ทักษะการสื่อสาร (Communication Skills)", max: 25, assessment: "ทักษะการสื่อสาร",
    displayCategoryCode: "", displayCategory: "", displayMax: "", displayAssessment: "", focusNo: "3",
    focusItem: "สะกดถูกและใช้คำเหมาะสม (Correct Spelling & Appropriate Wording)",
    reviewGuide: "ดูคำสะกด การเว้นวรรค ไวยากรณ์ และการเลือกใช้คำให้เหมาะกับงานบริการ ข้อความต้องอ่านลื่น ไม่ทำให้ความหมายเปลี่ยน และเรียกผู้ติดต่อให้ถูกประเภท เช่น คุณลูกค้า พี่ไรเดอร์ หรือร้านค้า",
    examples: "สะกดผิด, ใช้คะ/ค่ะผิด, เว้นวรรคผิดจนอ่านยาก, ใช้คำผิดความหมาย, เรียกผู้ติดต่อผิดประเภท หรือใช้ภาษาที่ทำให้เข้าใจผิด", evidence: "ข้อความในแชท", processReference: "ทุก Process",
  },
  {
    categoryCode: "4", category: "ทักษะการสื่อสาร (Communication Skills)", max: 25, assessment: "ทักษะการสื่อสาร",
    displayCategoryCode: "", displayCategory: "", displayMax: "", displayAssessment: "", focusNo: "4",
    focusItem: "การสื่อสารอย่างสุภาพและเข้าใจสถานการณ์ (Polite & Situation-Aware Communication)",
    reviewGuide: "ดูว่าภาษาและน้ำเสียงเหมาะกับสถานการณ์หรือไม่ โดยเฉพาะเคสที่ผู้ติดต่อกังวล ร้องเรียน หรือได้รับผลกระทบ ควรแสดงความเข้าใจ ให้ความมั่นใจ และเมื่อผู้ติดต่อส่งข้อมูลหรือหลักฐานมา ควรตอบรับและแจ้งว่าจะนำข้อมูลไปตรวจสอบอย่างไร",
    examples: "ตอบแข็งหรือห้วน, ไม่แสดงความเข้าใจในเคสที่มีผลกระทบ, ใช้คำไม่เหมาะกับสถานการณ์, ผู้ติดต่อส่งข้อมูลแล้วไม่ตอบรับ หรือไม่แจ้งว่าจะนำข้อมูลไปทำอะไรต่อ", evidence: "ข้อความในแชท", processReference: "ทุก Process",
  },
];

export const OCTOBER_FOCUS_TABLE_ROWS: FocusTableRow[] = AUGUST_FOCUS_TABLE_ROWS.map((row) => ({
  ...row,
  focusNo: `${row.categoryCode}.${row.focusNo}`,
  ...(row.categoryCode === "1" && row.focusNo === "5" ? {
    reviewGuide: octoberRubric.reviewGuide,
    examples: octoberRubric.examples,
  } : {}),
}));
