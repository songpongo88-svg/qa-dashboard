import React, { useEffect, useMemo, useState } from 'react';

type AppealItem = {
  topic: string;
  before: string;
  after: string;
  result: string;
  agentAppeal?: string;
  reason: string;
  guidance?: string;
};

type AppealCase = {
  agentName: string;
  caseId: string;
  caseNo: string;
  auditDate: string;
  appealSubmitDate: string;
  appealResultDate: string;
  originalScore: string;
  revisedScore: string;
  originalGrade: string;
  revisedGrade: string;
  finalDecision: string;
  selectedCaseKey: string;
  summary: string;
  submissionChannel: string;
  submissionEmail: string;
  appealClosedNotice: string;
  items: AppealItem[];
};

type DemoUser = {
  label: string;
  password: string;
  role: 'agent' | 'senior' | 'supervisor' | 'qa_management';
  agentName?: string;
};

const AGENT_LIST = [
  'Anucha Makundin',
  'Arisa aiemrit',
  'Chatkonnaphat Bhusomya',
  'Jariyawadee Taboodda',
  'Jureeporn Piddum',
  'Krivut Vongkampang',
  'Natcha Chai-in',
  'Nattapol Suprom',
  'Sunijtra Siritip',
  'Supakrit Promkhamnoi',
  'Suphitcha Keawliam',
  'Wachiraporn chailittichai',
  'Wassana Phothong',
] as const;

const DEMO_USERS: DemoUser[] = [
  { label: 'Phrommarin Thaithorn', password: 'Phrommarin2026', role: 'supervisor' },
  { label: 'Krivut Vongkampang', password: 'Krivut2026', role: 'senior' },
  { label: 'Songpon Phothong', password: 'Songpon2026', role: 'qa_management' },
  { label: 'Anucha Makundin', password: 'Anucha2026', role: 'agent', agentName: 'Anucha Makundin' },
  { label: 'Arisa aiemrit', password: 'Arisa2026', role: 'agent', agentName: 'Arisa aiemrit' },
  { label: 'Chatkonnaphat Bhusomya', password: 'Chatkonnaphat2026', role: 'agent', agentName: 'Chatkonnaphat Bhusomya' },
  { label: 'Jariyawadee Taboodda', password: 'Jariyawadee2026', role: 'agent', agentName: 'Jariyawadee Taboodda' },
  { label: 'Jureeporn Piddum', password: 'Jureeporn2026', role: 'agent', agentName: 'Jureeporn Piddum' },
  { label: 'Natcha Chai-in', password: 'Natcha2026', role: 'agent', agentName: 'Natcha Chai-in' },
  { label: 'Nattapol Suprom', password: 'Nattapol2026', role: 'agent', agentName: 'Nattapol Suprom' },
  { label: 'Sunijtra Siritip', password: 'Sunijtra2026', role: 'agent', agentName: 'Sunijtra Siritip' },
  { label: 'Supakrit Promkhamnoi', password: 'Supakrit2026', role: 'agent', agentName: 'Supakrit Promkhamnoi' },
  { label: 'Suphitcha Keawliam', password: 'Suphitcha2026', role: 'agent', agentName: 'Suphitcha Keawliam' },
  { label: 'Wachiraporn chailittichai', password: 'Wachiraporn2026', role: 'agent', agentName: 'Wachiraporn chailittichai' },
  { label: 'Wassana Phothong', password: 'Wassana2026', role: 'agent', agentName: 'Wassana Phothong' },
].sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));

const DEFAULT_NOTICE = 'ปิดยื่นอุทธรณ์แล้ว · ไม่สามารถยื่นอุทธรณ์เพิ่มเติมได้';
const DEFAULT_NOTIFICATION_TITLE = 'Email response sent';
const DEFAULT_NOTIFICATION_EMAIL = 'Songpon@robinhood.co.th';

const FILE_CREATED_AT_BY_CASE: Record<string, string> = {
  AA206880: '26/03/2026 20:26',
  AA205349: '24/03/2026 09:33',
  AA205600: '24/03/2026 09:33',
  AA206422: '23/03/2026 14:56',
  AA206427: '26/03/2026 20:26',
  AA207397: '24/03/2026 10:35',
  AA207998: '26/03/2026 23:18',
  AA208553: '24/03/2026 13:45',
  AA209311: '24/03/2026 13:45',
  AA210992: '26/03/2026 02:26',
};

const APPEAL_CASES: AppealCase[] = [
  {
    agentName: 'Natcha Chai-in',
    caseId: 'AA206880',
    caseNo: 'Case 01',
    auditDate: '15/03/2026',
    appealSubmitDate: '26/03/2026 20:26',
    appealResultDate: '26/03/2026 20:26',
    originalScore: '78.00',
    revisedScore: '78.00',
    originalGrade: 'C',
    revisedGrade: 'C',
    finalDecision: 'คงคะแนนเดิม',
    selectedCaseKey: '01|Natcha Chai-in|20260301',
    summary: 'คำอุทธรณ์ของ Agent รับฟังได้ในส่วนที่ว่าไม่สามารถเปิดเผยรายละเอียดเชิงลึก ช่องทางอุทธรณ์ หรือแนวทางเพิ่มเติมบางอย่างได้ตามนโยบายของบริษัท อย่างไรก็ตาม ผลประเมินเดิมไม่ได้หักเพราะ Agent ไม่ยอมเปิดเผยข้อมูลต้องห้าม แต่หักเพราะข้อความที่สื่อสารยังสามารถทำให้ชัดเจนและครบถ้วนกว่านี้ได้ภายในกรอบที่นโยบายอนุญาต ดังนั้นจึงยังไม่พบเหตุเพียงพอสำหรับการปรับเพิ่มคะแนนครับ',
    submissionChannel: 'Email',
    submissionEmail: 'Natcha@robinhood.co.th',
    appealClosedNotice: DEFAULT_NOTICE,
    items: [
      { topic: '2.2 Answer Completeness', before: '4/5', after: '4/5', result: 'คงเดิม 4/5', agentAppeal: 'ไม่สามารถแจ้งข้อมูลรายละเอียดเพิ่มเติมได้ตามนโยบาย', reason: 'แม้จะไม่สามารถแจ้งรายละเอียดเชิงลึกได้ แต่ยังควรอธิบายกรอบกว้าง ๆ ให้ผู้ติดต่อเข้าใจได้มากขึ้นว่าผลการตรวจสอบเป็นไปตามนโยบายบริษัทและไม่สามารถดำเนินการเปิดระบบให้ได้', guidance: 'จากการตรวจสอบ บัญชีของพี่ไรเดอร์ยังไม่สามารถเปิดใช้งานได้ครับ เนื่องจากผลตรวจสอบไม่เป็นไปตามเงื่อนไขของนโยบายบริษัทครับ' },
      { topic: '2.3 Process Explanation Clarity', before: '2/5', after: '2/5', result: 'คงเดิม 2/5', agentAppeal: 'ไม่สามารถให้ข้อมูลการอุทธรณ์หรือคำแนะนำเพิ่มเติมได้ตามนโยบาย', reason: 'ในระดับงานบริการยังสามารถอธิบายให้ชัดขึ้นได้ว่าเป็นผลการตรวจสอบตามนโยบายของบริษัท และไม่สามารถดำเนินการต่อได้', guidance: 'ผลการตรวจสอบเป็นไปตามนโยบายของบริษัท จึงไม่สามารถดำเนินการต่อได้ครับ' },
      { topic: '3.1 Root Cause Analysis & Resolution', before: '6/10', after: '6/10', result: 'คงเดิม 6/10', agentAppeal: 'ไม่สามารถแจ้งรายละเอียดหรือแนวทางเพิ่มเติมได้ตามนโยบาย', reason: 'ผลประเมินเดิมให้เครดิตแล้วว่า Agent วิเคราะห์ได้ว่าประเด็นเกิดจากการไม่เป็นไปตามนโยบายบริษัท แต่คำตอบยังเป็นการแจ้งผลลัพธ์มากกว่าการสื่อสารเชิงวิเคราะห์', guidance: 'ผลพิจารณาของบัญชีไม่เป็นไปตามเงื่อนไขของบริษัท จึงยังไม่สามารถดำเนินการเปิดระบบให้ได้ครับ' },
      { topic: '3.2 Case Ownership', before: '4/5', after: '4/5', result: 'คงเดิม 4/5', agentAppeal: 'ไม่สามารถแจ้งข้อมูลการอุทธรณ์ได้', reason: 'ยังไม่ได้ดูแลต่อยอดในมุมความต้องการของไรเดอร์หรือปิดบทสนทนาเชิงบริการให้ชัดเจนพอ', guidance: 'หากมีข้อมูลที่บริษัทสามารถแจ้งเพิ่มเติมได้ แอดมินจะแจ้งให้ทราบตามขั้นตอนครับ' },
      { topic: '3.3 Clear Next Step Guidance', before: '2/5', after: '2/5', result: 'คงเดิม 2/5', agentAppeal: 'ไม่สามารถให้แนวทางเพิ่มเติมได้ตามนโยบาย', reason: 'แม้จะไม่สามารถเปิดทางเชิงอุทธรณ์ได้ แต่ยังสามารถแจ้งให้ชัดว่าผลการพิจารณาสิ้นสุดตามนโยบายบริษัทหรือไม่มีขั้นตอนเพิ่มเติมแล้ว', guidance: 'ในส่วนนี้ไม่มีขั้นตอนเพิ่มเติมที่แอดมินสามารถดำเนินการต่อได้แล้วครับ' },
    ],
  },
  {
    agentName: 'Natcha Chai-in',
    caseId: 'AA206427',
    caseNo: 'Case 02',
    auditDate: '14/03/2026',
    appealSubmitDate: '26/03/2026 20:26',
    appealResultDate: '26/03/2026 20:26',
    originalScore: '78.00',
    revisedScore: '83.00',
    originalGrade: 'C',
    revisedGrade: 'B',
    finalDecision: 'ปรับคะแนนบางหัวข้อ',
    selectedCaseKey: '02|Natcha Chai-in|20260301',
    summary: 'จากการทบทวนอีกครั้ง คำอุทธรณ์ช่วยให้เห็นบริบทของเคสชัดขึ้นว่า Agent มีการให้ข้อมูลเพิ่มเติมแก่ไรเดอร์ มีการติดต่อไรเดอร์ และมีการแจ้งแนวทางให้ติดต่อกลับหากยังพบปัญหา จึงเห็นควรปรับคะแนนบางหัวข้อ ได้แก่ 3.2, 3.3 และ 5.1 ขณะที่หัวข้อ 3.1 ยังคงคะแนนเดิม',
    submissionChannel: 'Email',
    submissionEmail: 'Natcha@robinhood.co.th',
    appealClosedNotice: DEFAULT_NOTICE,
    items: [
      { topic: '3.1 Root Cause Analysis & Resolution', before: '4/10', after: '4/10', result: 'คงเดิม 4/10', agentAppeal: 'มีการให้ข้อมูลไรเดอร์เพิ่มเติมและติดตามต่อเนื่อง', reason: 'ยังไม่พบการวิเคราะห์สาเหตุของความล่าช้าหรือปัญหาที่เกิดขึ้นอย่างชัดเจน รวมถึงแนวทางแก้ไขเชิงรุกที่ควรดำเนินการทันที', guidance: 'หากยังหาร้านไม่พบ แนะนำให้ติดต่อร้านทันที ตรวจสอบจุดสังเกตเพิ่มเติม และหากยังมีปัญหาอยู่สามารถแจ้งแอดมินกลับเข้ามาได้อีกครั้งครับ' },
      { topic: '3.2 Case Ownership', before: '2/5', after: '3/5', result: 'ปรับคะแนน 3/5', agentAppeal: 'มีการติดตามและให้ข้อมูลเพิ่มเติมแก่ไรเดอร์จริง', reason: 'สะท้อนความเป็นเจ้าของเคสในระดับหนึ่ง แต่ยังไม่พบว่ามีการประสานงานเพิ่มเติมกับร้านค้าหรือลูกค้าในประเด็นที่อาจเป็นสาเหตุของความล่าช้า', guidance: 'หากยังพบปัญหาเกี่ยวกับร้านค้าหรือการจัดส่ง แอดมินจะช่วยประสานงานเพิ่มเติมให้ตามความเหมาะสมครับ' },
      { topic: '3.3 Clear Next Step Guidance', before: '3/5', after: '4/5', result: 'ปรับคะแนน 4/5', agentAppeal: 'แจ้งไว้แล้วว่าหากยังพบปัญหาสามารถแจ้งแอดมินเพิ่มเติมได้', reason: 'มีการแจ้งแนวทางถัดไปให้ไรเดอร์ค่อนข้างชัดเจนและสามารถนำไปปฏิบัติได้จริง', guidance: 'หากดำเนินการตามขั้นตอนแล้วแต่ยังพบปัญหาอยู่ สามารถแจ้งแอดมินเพิ่มเติมได้เลยนะครับ' },
      { topic: '5.1 Work Process Compliance', before: '4/10', after: '7/10', result: 'ปรับคะแนน 7/10', agentAppeal: 'มีการให้ข้อมูลเพิ่มเติม ติดตามไรเดอร์ และแจ้งแนวทางแก้ไขก่อนจบการสนทนา', reason: 'สะท้อนการปฏิบัติตามกระบวนการในระดับหนึ่ง แต่ยังไม่พบการดำเนินการครบทุกขั้นตอนของ flow อย่างชัดเจน', guidance: 'หากพบปัญหาต่อเนื่องหรือมีผลกระทบกับออเดอร์เพิ่มเติม ควรตรวจสอบเชิงระบบและดำเนินการตาม flow ต่อให้ครบถ้วนครับ' },
    ],
  },
  {
    agentName: 'Chatkonnaphat Bhusomya',
    caseId: 'AA205349',
    caseNo: 'Case 01',
    auditDate: '11/03/2026',
    appealSubmitDate: '23/03/2026 22:09',
    appealResultDate: '24/03/2026 09:33',
    originalScore: '81.00',
    revisedScore: '81.00',
    originalGrade: 'B',
    revisedGrade: 'B',
    finalDecision: 'คงคะแนนเดิม',
    selectedCaseKey: '01|Chatkonnaphat Bhusomya|20260301',
    summary: 'หัวข้อ 1.2 ไม่ได้ปรับคะแนน เพราะแม้ข้อเท็จจริงเรื่องร้านค้าเตรียมอาหารจะถูกต้อง แต่การสื่อสารของ Agent ยังไม่ชัดเจนตามลำดับที่ควรเป็น และมีลักษณะคล้ายเปิดทางให้ไรเดอร์ระบุเหตุผลเพื่อยกเลิกก่อน ส่วนหัวข้อ 4.3 ไม่ได้ปรับคะแนน เพราะยังไม่พบถ้อยคำที่แสดงความเข้าใจหรือ Empathy ต่อสถานการณ์ของไรเดอร์อย่างเหมาะสม',
    submissionChannel: 'Email',
    submissionEmail: 'Nattapol.s@robinhood.co.th',
    appealClosedNotice: DEFAULT_NOTICE,
    items: [
      { topic: '1.2 ความถูกต้องของข้อมูล', before: '3/5', after: '3/5', result: 'ไม่ปรับคะแนน คงเดิม 3/5', agentAppeal: 'ตรวจสอบแล้วพบว่าร้านค้าได้จัดเตรียมอาหารแล้ว', reason: 'แม้ข้อเท็จจริงบางส่วนถูกต้อง แต่การสื่อสารยังไม่ครบถ้วนและไม่เป็นไปตามลำดับที่เหมาะสม', guidance: 'แอดมินจะประสานงานจัดหาไรเดอร์ทดแทนเพื่อเข้ารับและจัดส่งอาหารต่อค่ะ' },
      { topic: '4.3 ความเหมาะสมของน้ำเสียง', before: '3/5', after: '3/5', result: 'ไม่ปรับคะแนน คงเดิม 3/5', agentAppeal: 'สอบถามว่าจำเป็นต้องกล่าวขอโทษหรือไม่', reason: 'หัวข้อนี้พิจารณาความเหมาะสมของน้ำเสียงโดยรวมและการแสดงความเข้าใจต่อสถานการณ์ของผู้ติดต่อ ซึ่งยังไม่ชัดเจนเพียงพอ', guidance: 'แอดมินเข้าใจสถานการณ์นะคะ เบื้องต้นจะช่วยประสานงานให้ต่อค่ะ' },
    ],
  },
  {
    agentName: 'Chatkonnaphat Bhusomya',
    caseId: 'AA205600',
    caseNo: 'Case 02',
    auditDate: '12/03/2026',
    appealSubmitDate: '23/03/2026 22:09',
    appealResultDate: '24/03/2026 09:33',
    originalScore: '89.00',
    revisedScore: '89.00',
    originalGrade: 'B',
    revisedGrade: 'B',
    finalDecision: 'คงคะแนนเดิม',
    selectedCaseKey: '02|Chatkonnaphat Bhusomya|20260301',
    summary: 'เคสนี้เป็นเคสต่อเนื่องจริง แต่เมื่อพิจารณาตามมาตรฐาน QA แล้ว ยังไม่พบเหตุเพียงพอให้ปรับเพิ่มคะแนนในหัวข้อที่อุทธรณ์ เนื่องจากข้อความที่สื่อสารกับไรเดอร์ยังขาดองค์ประกอบสำคัญหลายจุด',
    submissionChannel: 'Email',
    submissionEmail: 'Chatkonnaphat@robinhood.co.th',
    appealClosedNotice: DEFAULT_NOTICE,
    items: [
      { topic: '2.2 ความครบถ้วนของคำตอบ', before: '4/5', after: '4/5', result: 'คงคะแนนเดิม 4/5', reason: 'แม้เป็นเคสต่อเนื่อง แต่ข้อความรอบปัจจุบันยังควรสรุปสาระสำคัญให้ครบถ้วนเพียงพอ' },
      { topic: '2.3 ความชัดเจนในการอธิบายขั้นตอน', before: '4/5', after: '4/5', result: 'คงคะแนนเดิม 4/5', reason: 'ข้อความที่แจ้งกับไรเดอร์ยังไม่ได้อธิบายขั้นตอนให้ชัดเพียงพอ' },
      { topic: '2.4 การอ้างอิงข้อมูลที่ถูกต้อง', before: '4/5', after: '4/5', result: 'คงคะแนนเดิม 4/5', reason: 'ยังอ้างอิงข้อมูลได้ไม่ครบถ้วนพอสำหรับการให้คะแนนเต็ม' },
      { topic: '3.2 ความรับผิดชอบต่อเคส', before: '4/5', after: '4/5', result: 'คงคะแนนเดิม 4/5', reason: 'ในมุมผู้ติดต่อยังควรได้รับการอัปเดตสถานะที่ชัดเจนกว่านี้' },
      { topic: '3.3 การแจ้งแนวทางดำเนินการชัดเจน', before: '4/5', after: '4/5', result: 'คงคะแนนเดิม 4/5', reason: 'ยังไม่ได้แจ้งแนวทางติดตามผลให้ชัดเพียงพอ' },
      { topic: '4.3 ความเหมาะสมของน้ำเสียง', before: '4/5', after: '4/5', result: 'คงคะแนนเดิม 4/5', reason: 'ใช้น้ำเสียงสุภาพแล้ว แต่ยังไม่มีถ้อยคำเชิงรับทราบหรือแสดงความเข้าใจที่ชัดเจน' },
      { topic: '5.3 ความถูกต้องในการบันทึกและอัปเดตสถานะเคส', before: '3/5', after: '3/5', result: 'คงคะแนนเดิม 3/5', reason: 'หากปิดเคสทั้งที่ผลยังไม่สิ้นสุด จะไม่สอดคล้องกับข้อเท็จจริงของงาน ณ เวลานั้น' },
    ],
  },
  {
    agentName: 'Nattapol Suprom',
    caseId: 'AA206422',
    caseNo: 'Case 03',
    auditDate: '14/03/2026',
    appealSubmitDate: '23/03/2026 14:36',
    appealResultDate: '23/03/2026 14:56',
    originalScore: '71.00',
    revisedScore: '84.00',
    originalGrade: 'C',
    revisedGrade: 'B',
    finalDecision: 'ปรับคะแนน',
    selectedCaseKey: '03|Nattapol Suprom|20260301',
    summary: 'พิจารณาแล้วรับอุทธรณ์บางส่วน โดยปรับคะแนนหัวข้อ 2.4, 3.3 และ 5.1 ส่วนหัวข้อ 3.1 ยังคงเดิม เนื่องจากแม้เป็นเคสต่อเนื่อง แต่ยังควรมีการสรุปสถานะปัจจุบันให้ลูกค้าเข้าใจชัดเจนในช่วงที่รับเคสต่อ',
    submissionChannel: 'Email',
    submissionEmail: 'Nattapol.s@robinhood.co.th',
    appealClosedNotice: DEFAULT_NOTICE,
    items: [
      { topic: '2.4 การใช้แหล่งอ้างอิงที่ถูกต้อง', before: '4/5', after: '5/5', result: 'ได้เต็ม 5/5', reason: 'ข้อมูลอ้างอิงจากระบบของธนาคาร KBank และสอดคล้องกับ template ที่ใช้งานจริง' },
      { topic: '3.1 การวิเคราะห์และแก้ไขปัญหา', before: '4/10', after: '7/10', result: 'คงเดิม 7/10', reason: 'แม้เป็นเคสต่อเนื่อง แต่ยังควรสรุปสถานะปัจจุบันให้ลูกค้าเข้าใจชัดเจน' },
      { topic: '3.3 การแจ้งแนวทางดำเนินการต่อ', before: '1/5', after: '5/5', result: 'ได้เต็ม 5/5', reason: 'มีการแจ้ง next step และกรอบเวลาชัดเจนแล้วในเคสก่อนหน้า' },
      { topic: '5.1 การปฏิบัติตามขั้นตอนการทำงาน', before: '5/10', after: '10/10', result: 'ได้เต็ม 10/10', reason: 'การดำเนินการสอดคล้องกับ flow ของเคสต่อเนื่อง' },
    ],
  },
  {
    agentName: 'Nattapol Suprom',
    caseId: 'AA207397',
    caseNo: 'Case 04',
    auditDate: '16/03/2026',
    appealSubmitDate: '23/03/2026 16:56',
    appealResultDate: '24/03/2026 10:35',
    originalScore: '68.00',
    revisedScore: '80.00',
    originalGrade: 'D',
    revisedGrade: 'B',
    finalDecision: 'ปรับคะแนนบางหัวข้อ',
    selectedCaseKey: '04|Nattapol Suprom|20260301',
    summary: 'ตามที่ Agent ได้ยื่นอุทธรณ์ผลการประเมิน QA ของเคส AA207397 ทางผู้ประเมินได้ทบทวนบทสนทนาและเหตุผลประกอบแล้ว เห็นควรปรับคะแนนบางหัวข้อ โดยหัวข้อ 1.2 และ 2.2 ปรับเป็น 3/5, หัวข้อ 3.1 ปรับเป็น 4/10 และหัวข้อ 3.3 ปรับเป็น 3/5 ส่วนหัวข้ออื่นคงคะแนนเดิม',
    submissionChannel: 'Email',
    submissionEmail: 'Nattapol.s@robinhood.co.th',
    appealClosedNotice: DEFAULT_NOTICE,
    items: [
      { topic: '1.2 Information Accuracy', before: '2/5', after: '3/5', result: 'ปรับคะแนน 3/5', reason: 'ให้ข้อมูลหลักถูกต้องในระดับหนึ่ง แต่ยังไม่เหมาะสำหรับคะแนนเต็ม' },
      { topic: '2.1 Case Accuracy', before: '3/5', after: '3/5', result: 'คงเดิม 3/5', reason: 'ความแม่นยำของคำตอบมีเพียงบางส่วน' },
      { topic: '2.2 Answer Completeness', before: '2/5', after: '3/5', result: 'ปรับคะแนน 3/5', reason: 'มีการตอบสาระสำคัญบางส่วน จึงไม่ควรถูกหักต่ำมาก' },
      { topic: '2.3 Process Explanation Clarity', before: '3/5', after: '3/5', result: 'คงเดิม 3/5', reason: 'ยังไม่ได้อธิบายเป็นลำดับขั้นตอนที่ชัดเจนเพียงพอ' },
      { topic: '2.4 Correct Reference Usage', before: '4/5', after: '4/5', result: 'คงเดิม 4/5', reason: 'ยังไม่ได้อ้างอิงข้อมูลอย่างชัดเจนเพียงพอ' },
      { topic: '3.1 Root Cause Analysis & Resolution', before: '2/10', after: '4/10', result: 'ปรับคะแนน 4/10', reason: 'จับประเด็นความกังวลได้บางส่วน แต่ยังไม่ได้อธิบายสาเหตุและ timeline ให้ชัดพอ' },
      { topic: '3.3 Clear Next Step Guidance', before: '1/5', after: '3/5', result: 'ปรับคะแนน 3/5', reason: 'มีการแจ้ง next step จริง แต่ยังไม่ชัดครบถ้วน' },
      { topic: '4.4 Format Adaptation by Situation', before: '3/5', after: '3/5', result: 'คงเดิม 3/5', reason: 'รูปแบบการอธิบายยังเป็นลักษณะทั่วไป' },
      { topic: '5.1 Work Process Compliance', before: '8/10', after: '8/10', result: 'คงเดิม 8/10', reason: 'ยังไม่มีเหตุเพียงพอสำหรับการปรับคะแนนเพิ่ม' },
    ],
  },
  {
    agentName: 'Nattapol Suprom',
    caseId: 'AA207998',
    caseNo: 'Case 06',
    auditDate: '17/03/2026',
    appealSubmitDate: '24/03/2026 10:10',
    appealResultDate: '',
    originalScore: '87.00',
    revisedScore: '90.00',
    originalGrade: 'B',
    revisedGrade: 'A',
    finalDecision: 'ปรับคะแนนบางหัวข้อ',
    selectedCaseKey: '06|Nattapol Suprom|20260301',
    summary: 'หัวข้อ 3.1 เห็นควรปรับจาก 3/10 เป็น 5/10 เนื่องจาก Agent มีการตรวจสอบข้อมูลก่อนตอบจริง ส่วนหัวข้อ 4.2 เห็นควรปรับจาก 4/5 เป็น 5/5 เพราะคอมเมนต์เดิมเป็นเชิงบวกครบองค์ประกอบ',
    submissionChannel: 'Email',
    submissionEmail: 'Nattapol.s@robinhood.co.th',
    appealClosedNotice: DEFAULT_NOTICE,
    items: [
      { topic: '3.1 Root Cause Analysis & Resolution', before: '3/10', after: '5/10', result: 'ปรับคะแนน 5/10', reason: 'Agent มีการตรวจสอบข้อเท็จจริงก่อนตอบจริง แต่ยังไม่ถึงระดับการวิเคราะห์และแก้ปัญหาได้ครบถ้วน' },
      { topic: '4.2 Language Accuracy & Conciseness', before: '4/5', after: '5/5', result: 'ปรับคะแนน 5/5', reason: 'คอมเมนต์เดิมเป็นเชิงบวกครบองค์ประกอบ จึงควรปรับคะแนนให้สอดคล้องกัน' },
    ],
  },
  {
    agentName: 'Jariyawadee Taboodda',
    caseId: 'AA208553',
    caseNo: 'Case 04',
    auditDate: '18/03/2026',
    appealSubmitDate: '23/03/2026 23:29',
    appealResultDate: '24/03/2026 13:45',
    originalScore: '79.00',
    revisedScore: '79.00',
    originalGrade: 'C',
    revisedGrade: 'C',
    finalDecision: 'คงคะแนนเดิม',
    selectedCaseKey: '04|Jariyawadee Taboodda|20260301',
    summary: 'Agent ให้ข้อมูลถูกต้องตามข้อเท็จจริงของระบบในประเด็นหลัก แต่หัวข้อที่ถูกหักเป็นเรื่องความชัดเจนในการสรุปคำตอบให้ตรงคำถาม และการช่วยต่อยอดแนวทางใช้งานให้ร้านค้านำไปใช้ได้จริง',
    submissionChannel: 'Email',
    submissionEmail: 'Jariyawadee@robinhood.co.th',
    appealClosedNotice: DEFAULT_NOTICE,
    items: [
      { topic: '1.2 Information Accuracy', before: '4/5', after: '4/5', result: 'คงคะแนนเดิม 4/5', reason: 'ข้อมูลหลักถูกต้อง แต่คำตอบยังไม่ปิดประเด็นได้ชัดที่สุด' },
      { topic: '2.1 Case Accuracy', before: '4/5', after: '4/5', result: 'คงคะแนนเดิม 4/5', reason: 'คำตอบยังอธิบายการใช้งานระบบทั่วไปมากกว่าสรุปให้ตรงจุด' },
      { topic: '3.1 Root Cause Analysis & Resolution', before: '7/10', after: '7/10', result: 'คงคะแนนเดิม 7/10', reason: 'ยังไม่ได้ช่วยต่อยอดวิธีแก้ปัญหาให้ร้านค้าอย่างชัดเจนพอ' },
    ],
  },
  {
    agentName: 'Jariyawadee Taboodda',
    caseId: 'AA209311',
    caseNo: 'Case 05',
    auditDate: '20/03/2026',
    appealSubmitDate: '23/03/2026 23:29',
    appealResultDate: '24/03/2026 13:45',
    originalScore: '78.00',
    revisedScore: '78.00',
    originalGrade: 'C',
    revisedGrade: 'C',
    finalDecision: 'คงคะแนนเดิม',
    selectedCaseKey: '05|Jariyawadee Taboodda|20260301',
    summary: 'ไม่แนะนำให้ปรับคะแนนในประเด็นที่ยื่นอุทธรณ์ เพราะเหตุผลที่ Agent ชี้แจงเป็นเรื่องการดำเนินการภายในเป็นหลัก แต่จุดที่ถูกหักในผลประเมินเดิมเป็นเรื่องคุณภาพของการสื่อสารในแชท ซึ่งยังไม่ครบและไม่ชัดในบางประเด็น',
    submissionChannel: 'Email',
    submissionEmail: 'Jariyawadee@robinhood.co.th',
    appealClosedNotice: DEFAULT_NOTICE,
    items: [
      { topic: '2.3 Process Explanation Clarity', before: '4/5', after: '4/5', result: 'คงคะแนนเดิม 4/5', reason: 'คำตอบยังไม่ได้เรียงขั้นตอนให้ชัดเพียงพอ' },
      { topic: '3.1 Root Cause Analysis & Resolution', before: '7/10', after: '7/10', result: 'คงคะแนนเดิม 7/10', reason: 'ยังตอบไม่ครบในส่วนของคำถามย่อยและไม่อธิบายให้ชัดเพียงพอ' },
    ],
  },
  {
    agentName: 'Krivut Vongkampang',
    caseId: 'AA210992',
    caseNo: 'Case 05',
    auditDate: '24/03/2026',
    appealSubmitDate: '25/03/2026 16:22',
    appealResultDate: '',
    originalScore: '70.00',
    revisedScore: '72.00',
    originalGrade: 'C',
    revisedGrade: 'C',
    finalDecision: 'ปรับบางหัวข้อ',
    selectedCaseKey: '05|Krivut Vongkampan|20260301',
    summary: 'เคสนี้ยังสามารถนำมาประเมิน QA ได้ แม้จะเป็นแชทติดตามผลจากเคสเดิม แต่ยังคงเป็นการสื่อสารกับไรเดอร์จริง และยังมีผลต่อคุณภาพการให้บริการ จึงเห็นควรปรับคะแนนบางหัวข้อขึ้นเล็กน้อย',
    submissionChannel: 'Email',
    submissionEmail: 'Krivut@robinhood.co.th',
    appealClosedNotice: DEFAULT_NOTICE,
    items: [
      { topic: '2.4 Correct Reference Usage', before: '2/5', after: '3/5', result: 'ปรับคะแนน 3/5', reason: 'บริบทเป็นการ follow-up จากผลการประสานงานหลังบ้านอยู่แล้ว จึงไม่ควรถูกหักหนักเท่าเคสที่ไม่มีการตรวจสอบเลย' },
      { topic: '3.1 Root Cause Analysis & Resolution', before: '4/10', after: '5/10', result: 'ปรับคะแนน 5/10', reason: 'ในเคสลักษณะ follow-up ไม่ควรถูกคาดหวังให้วิเคราะห์ลึกเท่าเคสแก้ปัญหาใหม่' },
    ],
  },
];

function hasFullAccess(user: DemoUser | null) {
  return Boolean(user && user.role !== 'agent');
}

function validateCases(cases: AppealCase[]) {
  const seen = new Set<string>();
  const issues: string[] = [];
  for (const item of cases) {
    const key = `${item.agentName}-${item.caseId}`;
    if (seen.has(key)) issues.push(`Duplicate case found: ${key}`);
    seen.add(key);
    if (!item.items.length) issues.push(`Missing appeal items for ${key}`);
  }
  return issues;
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 whitespace-pre-line text-base font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function LoginScreen(props: {
  selectedLogin: string;
  accessCode: string;
  loginError: string;
  onSelectLogin: (value: string) => void;
  onChangeAccessCode: (value: string) => void;
  onUnlock: () => void;
}) {
  const { selectedLogin, accessCode, loginError, onSelectLogin, onChangeAccessCode, onUnlock } = props;
  return (
    <div className="min-h-screen bg-[#f5f3ff] px-6 py-10 text-slate-800 lg:px-10">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-[32px] bg-white shadow-[0_24px_80px_rgba(88,28,135,0.14)] ring-1 ring-purple-100">
        <div className="bg-gradient-to-r from-purple-900 via-violet-800 to-fuchsia-700 px-8 py-10 text-white">
          <div className="text-sm font-medium uppercase tracking-[0.24em] text-purple-200">Access</div>
          <h1 className="mt-3 text-3xl font-semibold leading-tight lg:text-4xl">QA Appeal Results Portal</h1>
          <p className="mt-3 text-sm leading-7 text-purple-100 lg:text-base">โหมดนี้เป็นเดโม role visibility เท่านั้น</p>
        </div>
        <div className="space-y-6 px-8 py-8">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Demo User</label>
            <select value={selectedLogin} onChange={(e) => onSelectLogin(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-purple-400">
              <option value="">Select demo user</option>
              {DEMO_USERS.map((user) => (
                <option key={user.label} value={user.label}>{user.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Access Code</label>
            <input type="password" value={accessCode} onChange={(e) => onChangeAccessCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onUnlock(); }} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-purple-400" placeholder="Enter access code" />
            {loginError ? <div className="mt-2 text-sm font-medium text-red-600">{loginError}</div> : null}
          </div>
          <button onClick={onUnlock} className="inline-flex items-center justify-center rounded-2xl bg-purple-700 px-5 py-3 text-sm font-semibold text-white hover:bg-purple-800">Unlock Dashboard</button>
        </div>
      </div>
    </div>
  );
}

export default function QAAppealResultMockup() {
  const [selectedLogin, setSelectedLogin] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [loginError, setLoginError] = useState('');
  const [currentUser, setCurrentUser] = useState<DemoUser | null>(null);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState('');

  const validationIssues = useMemo(() => validateCases(APPEAL_CASES), []);
  const visibleCases = useMemo(() => {
    if (!currentUser) return [] as AppealCase[];
    return hasFullAccess(currentUser) ? APPEAL_CASES : APPEAL_CASES.filter((item) => item.agentName === currentUser.agentName);
  }, [currentUser]);

  const filteredCases = useMemo(() => {
    if (!selectedAgent) return [] as AppealCase[];
    return visibleCases.filter((item) => item.agentName === selectedAgent);
  }, [selectedAgent, visibleCases]);

  const selectedCase = useMemo(() => {
    if (!selectedAgent) return null;
    return filteredCases.find((item) => item.caseId === selectedCaseId) ?? filteredCases[0] ?? null;
  }, [filteredCases, selectedAgent, selectedCaseId]);

  useEffect(() => {
    if (!currentUser) {
      setSelectedAgent('');
      setSelectedCaseId('');
      return;
    }
    if (currentUser.role === 'agent') {
      const own = currentUser.agentName ?? '';
      if (selectedAgent !== own) {
        setSelectedAgent(own);
        return;
      }
    }
    if (!selectedAgent) {
      setSelectedCaseId('');
      return;
    }
    if (!filteredCases.some((item) => item.caseId === selectedCaseId)) {
      setSelectedCaseId(filteredCases[0]?.caseId ?? '');
    }
  }, [currentUser, selectedAgent, selectedCaseId, filteredCases]);

  const handleUnlock = () => {
    const matched = DEMO_USERS.find((user) => user.label === selectedLogin);
    if (!matched) {
      setLoginError('กรุณาเลือกผู้ใช้งาน');
      return;
    }
    if (accessCode.trim() !== matched.password) {
      setLoginError('รหัสผ่านไม่ถูกต้อง');
      return;
    }
    setCurrentUser(matched);
    setLoginError('');
    setSelectedAgent(matched.role === 'agent' ? matched.agentName ?? '' : '');
    setSelectedCaseId('');
  };

  const handleLogout = () => {
    setSelectedLogin('');
    setAccessCode('');
    setLoginError('');
    setCurrentUser(null);
    setSelectedAgent('');
    setSelectedCaseId('');
  };

  if (!currentUser) {
    return <LoginScreen selectedLogin={selectedLogin} accessCode={accessCode} loginError={loginError} onSelectLogin={setSelectedLogin} onChangeAccessCode={setAccessCode} onUnlock={handleUnlock} />;
  }

  const selectableAgents = hasFullAccess(currentUser) ? AGENT_LIST : AGENT_LIST.filter((agent) => visibleCases.some((item) => item.agentName === agent));
  const resolvedAppealResultDate = (selectedCase && FILE_CREATED_AT_BY_CASE[selectedCase.caseId]) || selectedCase?.appealResultDate || '-';
  const notificationByline = `Songpon Phothong · ${resolvedAppealResultDate}`;

  return (
    <div className="min-h-screen bg-[#f5f3ff] text-slate-800">
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
        <section className="mb-8 overflow-hidden rounded-[28px] bg-white shadow-[0_20px_60px_rgba(88,28,135,0.10)] ring-1 ring-purple-100">
          <div className="bg-gradient-to-r from-purple-900 via-violet-800 to-fuchsia-700 px-8 py-8 text-white">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="mt-2 text-3xl font-semibold leading-tight lg:text-4xl">แจ้งผลการพิจารณาอุทธรณ์คะแนน QA รายบุคคล</h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-purple-100 lg:text-base">โหมดเดโม: Agent เห็นเฉพาะข้อมูลของตัวเอง ส่วน Supervisor, Senior และ QA Management สามารถเลือกดูได้ทุกคน</p>
              </div>
              <button onClick={handleLogout} className="inline-flex items-center justify-center rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 hover:bg-white/15">Lock Screen</button>
            </div>
          </div>
          <div className="grid gap-4 bg-[#fcfbff] px-8 py-5 lg:grid-cols-3">
            <Card label="Selected Agent" value={selectedAgent || '-'} />
            <Card label="Role" value="CS Customer (Non Voice)" />
            <Card label="Selected Case" value={selectedCase?.caseId || '-'} />
          </div>
        </section>

        {validationIssues.length > 0 ? (
          <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {validationIssues.map((issue) => (
              <div key={issue}>• {issue}</div>
            ))}
          </section>
        ) : null}

        <section className="mb-8 rounded-[28px] bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)] ring-1 ring-slate-200 lg:p-8">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_0.8fr] lg:items-end">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Agent Name</label>
              <select value={selectedAgent} disabled={currentUser.role === 'agent'} onChange={(e) => setSelectedAgent(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-purple-400 disabled:bg-slate-100">
                <option value="">ยังไม่เลือกชื่อ Agent</option>
                {selectableAgents.map((agent) => (
                  <option key={agent} value={agent}>{agent}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Case ID</label>
              <select value={selectedCase?.caseId || ''} onChange={(e) => setSelectedCaseId(e.target.value)} disabled={!selectedAgent} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-purple-400 disabled:bg-slate-100">
                {!selectedAgent ? <option value="">กรุณาเลือก Agent ก่อน</option> : null}
                {filteredCases.map((item) => (
                  <option key={item.caseId} value={item.caseId}>{item.caseId} · {item.caseNo}</option>
                ))}
              </select>
            </div>
            <div className="rounded-2xl bg-purple-50 px-4 py-4 ring-1 ring-purple-100">
              <div className="text-xs uppercase tracking-wide text-purple-700">Current View</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{selectedCase?.caseId || '-'}</div>
              <div className="mt-1 text-sm text-slate-600">{selectedCase?.agentName || 'ยังไม่มีข้อมูล'}</div>
            </div>
          </div>
        </section>

        {selectedCase ? (
          <section className="rounded-[28px] bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)] ring-1 ring-purple-300 lg:p-8">
            <div className="space-y-4 border-b border-slate-200 pb-5">
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                <div className="text-sm font-semibold text-red-800">{selectedCase.appealClosedNotice}</div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <Card label="Audit Date" value={selectedCase.auditDate || '-'} />
                <Card label="Appeal Submit Date & Time" value={selectedCase.appealSubmitDate || '-'} />
                <Card label="Appeal Result Date & Time" value={resolvedAppealResultDate} />
                <Card label="Original Score" value={`${selectedCase.originalScore} · ${selectedCase.originalGrade}`} />
                <Card label="Revised Score" value={`${selectedCase.revisedScore} · ${selectedCase.revisedGrade}`} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card label="Appeal Channel" value={`${selectedCase.submissionChannel} | ${selectedCase.submissionEmail || '-'}`} />
                <Card label="Appeal Result Notification" value={`${DEFAULT_NOTIFICATION_TITLE} | ${notificationByline} | ${DEFAULT_NOTIFICATION_EMAIL}`} />
              </div>
            </div>

            <div className="mt-6 grid gap-6">
              {selectedCase.items.map((item) => (
                <div key={item.topic} className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{item.topic}</h3>
                      <div className="mt-2 inline-flex rounded-full bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">ผลพิจารณา: {item.result}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 lg:min-w-[220px]">
                      <Card label="Original" value={item.before} />
                      <Card label="Revised" value={item.after} />
                    </div>
                  </div>

                  {item.agentAppeal ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900 shadow-sm">
                      <div className="font-semibold">ประเด็นที่ Agent ยื่นอุทธรณ์</div>
                      <div className="mt-2 whitespace-pre-line">{item.agentAppeal}</div>
                    </div>
                  ) : null}

                  <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm leading-7 text-indigo-950 shadow-sm">
                    <div className="font-semibold">คำชี้แจงผลพิจารณา</div>
                    <div className="mt-2 whitespace-pre-line">{item.reason}</div>
                  </div>

                  {item.guidance ? (
                    <div className="mt-4 rounded-2xl border border-purple-200 bg-purple-50 p-4 text-sm leading-7 text-purple-950 shadow-sm">
                      <div className="font-semibold">แนวทางการตอบ</div>
                      <div className="mt-2 whitespace-pre-line">{item.guidance}</div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
              <div className="text-sm font-semibold text-emerald-700">สรุปเคส {selectedCase.caseId}</div>
              <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-700">{selectedCase.summary}</p>
            </div>
          </section>
        ) : (
          <section className="rounded-[28px] bg-white p-8 text-center shadow-[0_20px_50px_rgba(15,23,42,0.06)] ring-1 ring-slate-200">
            <div className="text-lg font-semibold text-slate-900">กรุณาเลือกชื่อ Agent</div>
          </section>
        )}
      </div>
    </div>
  );
}
