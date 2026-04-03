import { RubricTopicDefinition } from "./evaluationTypes";

export const APR_2026_TOPICS: RubricTopicDefinition[] = [
  {
    rubricVersion: "APR_2026",
    topicCode: "1.1",
    topicLabel: "มาตรฐานการทักทายและปิดการสนทนา",
    topicGroup: "Compliance",
    maxScore: 10,
    focus: "ประเมินการเปิดและปิดบทสนทนาตามมาตรฐานองค์กร",
    practicalCheckpoints: [
      "มี greeting หรือไม่",
      "มีการแนะนำตัวหรือบทบาทหรือไม่",
      "มี closing หรือไม่",
      "มีการเสนอช่วยเหลือเพิ่มเติมก่อนปิดหรือไม่",
    ],
    boundaryRule:
      "ไม่ใช้หักเรื่องข้อมูลผิดหรือข้อมูลไม่ครบ และไม่ใช้หักเรื่อง tone แข็ง",
  },
  {
    rubricVersion: "APR_2026",
    topicCode: "1.2",
    topicLabel: "การปฏิบัติตาม PDPA / Policy / ข้อกำหนด",
    topicGroup: "Compliance",
    maxScore: 10,
    focus: "ประเมินการปฏิบัติตามกฎหมาย นโยบาย และข้อกำหนดเกี่ยวกับข้อมูล",
    practicalCheckpoints: [
      "มีการ verify หรือไม่ เมื่อกรณีจำเป็น",
      "มีการขอข้อมูลเกินจำเป็นหรือไม่",
      "มีการเปิดเผยข้อมูลโดยไม่มีสิทธิหรือไม่",
      "มีการให้คำแนะนำขัด policy หรือไม่",
    ],
    boundaryRule: "หากปัญหาหลักคือ PDPA/policy ให้หักที่ข้อนี้เป็นหลัก",
  },
  {
    rubricVersion: "APR_2026",
    topicCode: "1.3",
    topicLabel: "การปฏิบัติตามกระบวนการและ SLA",
    topicGroup: "Compliance",
    maxScore: 10,
    focus: "ประเมินการทำงานตาม flow, process, logging, status handling และ SLA",
    practicalCheckpoints: [
      "ตอบใน SLA หรือไม่",
      "ดำเนินการตาม process ที่ถูกต้องหรือไม่",
      "มีการ update status หรือไม่",
      "ปิดเคสหรือส่งต่อถูกขั้นตอนหรือไม่",
    ],
    boundaryRule: "หัวข้อนี้เน้น process/SLA ไม่ใช่ root cause",
  },
  {
    rubricVersion: "APR_2026",
    topicCode: "2.1",
    topicLabel: "ความถูกต้องของคำตอบ",
    topicGroup: "Answer Quality",
    maxScore: 10,
    focus: "ประเมินว่าสาระของคำตอบถูกต้องตามข้อเท็จจริง ระบบ และบริบทของเคสหรือไม่",
    practicalCheckpoints: [
      "คำตอบตรงกับคำถามหลักหรือไม่",
      "ข้อมูลถูกต้องตามบริบทเคสหรือไม่",
      "มีการเดาหรือรับปากเกินจริงหรือไม่",
    ],
    boundaryRule:
      "ข้อนี้เน้นถูกหรือผิด ถ้าถูกแต่ยังตอบไม่ครบ ให้ไปที่ 2.2",
  },
  {
    rubricVersion: "APR_2026",
    topicCode: "2.2",
    topicLabel: "ความครบถ้วนของคำตอบ",
    topicGroup: "Answer Quality",
    maxScore: 10,
    focus: "ประเมินว่าคำตอบครอบคลุมประเด็นสำคัญและคำถามย่อยครบถ้วนหรือไม่",
    practicalCheckpoints: [
      "ตอบครบทุกประเด็นหรือไม่",
      "มีประเด็นย่อยตกหล่นหรือไม่",
      "รายละเอียดเพียงพอให้ดำเนินการต่อหรือไม่",
    ],
    boundaryRule: "ข้อนี้เน้นครบหรือไม่ครบ",
  },
  {
    rubricVersion: "APR_2026",
    topicCode: "2.3",
    topicLabel: "ความชัดเจนของขั้นตอนและแหล่งอ้างอิง",
    topicGroup: "Answer Quality",
    maxScore: 5,
    focus: "ประเมินการอธิบายขั้นตอนและการใช้อ้างอิงให้ผู้รับบริการทำตามได้จริง",
    practicalCheckpoints: [
      "อธิบายเป็นลำดับหรือไม่",
      "ระบุสิ่งที่ต้องทำต่อชัดหรือไม่",
      "ขั้นตอนนำไปใช้จริงได้หรือไม่",
    ],
    boundaryRule: "ข้อนี้เน้น how-to clarity ไม่ใช่ความถูกต้องของสาระ",
  },
  {
    rubricVersion: "APR_2026",
    topicCode: "3.1",
    topicLabel: "การวิเคราะห์และแก้ไขปัญหาได้ตรงจุด",
    topicGroup: "Resolution",
    maxScore: 15,
    focus: "ประเมินการเข้าใจปัญหา การหา root cause และการเลือกแนวทางแก้ไขที่ตรงจุด",
    practicalCheckpoints: [
      "เข้าใจปัญหาหลักของเคสหรือไม่",
      "วิเคราะห์สาเหตุได้สอดคล้องหรือไม่",
      "แนวทางแก้ไขตรงกับสาเหตุหรือไม่",
    ],
    boundaryRule:
      "ข้อนี้เน้นการคิดและการแก้ปัญหา ไม่ใช้หักเรื่องความสุภาพหรือรูปแบบภาษา",
  },
  {
    rubricVersion: "APR_2026",
    topicCode: "3.2",
    topicLabel: "Ownership และการแจ้ง Next Step",
    topicGroup: "Resolution",
    maxScore: 10,
    focus: "ประเมินการรับผิดชอบเคส การดูแลต่อเนื่อง และการแจ้งสิ่งที่จะเกิดขึ้นต่อไปอย่างชัดเจน",
    practicalCheckpoints: [
      "มี next step หรือไม่",
      "ระบุผู้รับผิดชอบหรือไม่",
      "มี timeline หรือไม่",
      "มีช่องทางติดตามหรือไม่",
    ],
    boundaryRule:
      "ถ้าปัญหาคือ flow ผิด ให้หักที่ 1.3 ถ้าปัญหาคือแก้ปัญหาไม่ตรง ให้หักที่ 3.1",
  },
  {
    rubricVersion: "APR_2026",
    topicCode: "4.1",
    topicLabel: "โครงสร้างข้อความและความอ่านง่าย",
    topicGroup: "Communication",
    maxScore: 5,
    focus: "ประเมินการเรียบเรียงข้อความ การจัดลำดับ และความอ่านง่าย",
    practicalCheckpoints: [
      "เรียงลำดับสาระเหมาะสมหรือไม่",
      "ข้อความอ่านง่ายหรือไม่",
      "แยกประเด็นชัดหรือไม่",
    ],
    boundaryRule: "ไม่ใช้หักเรื่องข้อมูลผิดหรือไม่ครบ",
  },
  {
    rubricVersion: "APR_2026",
    topicCode: "4.2",
    topicLabel: "การใช้ภาษาในการตอบแชท",
    topicGroup: "Communication",
    maxScore: 5,
    focus:
      "ประเมินคุณภาพของภาษาเขียน ความสุภาพ ความชัดเจน และความเหมาะสมกับบริบทแอปเดลิเวอรี",
    practicalCheckpoints: [
      "ใช้ถ้อยคำสุภาพหรือไม่",
      "สะกดไทย/อังกฤษถูกต้องหรือไม่",
      "ประโยคชัดเจน ไม่วกวนหรือไม่",
      "ระดับภาษาเหมาะสมหรือไม่",
    ],
    boundaryRule:
      "ข้อนี้เน้นภาษาเขียน ไม่ใช้หักเรื่อง tone เชิงอารมณ์ ให้ไปที่ 4.3",
  },
  {
    rubricVersion: "APR_2026",
    topicCode: "4.3",
    topicLabel: "น้ำเสียงและความเหมาะสมตามสถานการณ์",
    topicGroup: "Communication",
    maxScore: 10,
    focus:
      "ประเมินโทนการสื่อสารและความรู้สึกที่ผู้รับบริการได้รับ ทั้งจากข้อความและจากเสียง หากมีการโทรออก",
    practicalCheckpoints: [
      "ข้อความอ่านแล้วสุภาพและเหมาะสมหรือไม่",
      "ไม่มีลักษณะประชด ประชัน หรือโต้แย้งเชิงอารมณ์หรือไม่",
      "ถ้ามีโทรออก น้ำเสียงจริงเหมาะสมหรือไม่",
    ],
    boundaryRule:
      "ถ้าปัญหาคือสะกดหรือภาษาวกวน ให้หักที่ 4.2 ถ้าปัญหาคือความรู้สึกจาก tone ให้หักที่ 4.3",
  },
];
