import React, { useMemo, useState } from "react";

type Topic = {
  code: string;
  title: string;
  score: number;
  focus?: string;
  meaning?: string;
  reviewGuide?: string;
  improveTip?: string;
  avoidDuplicate?: string;
  checklist?: string[];
};

type Section = {
  id: string;
  title: string;
  score: number;
  topics: Topic[];
};

type RubricVersion = {
  key: "MARCH_2026" | "APR_2026";
  label: string;
  subtitle: string;
  effectiveFrom: string;
  effectiveTo?: string;
  sourceLabel: string;
  totalScore: number;
  sections: Section[];
};

const MARCH_2026_RUBRIC: RubricVersion = {
  key: "MARCH_2026",
  label: "March 2026 Rubric",
  subtitle: "Effective 11–31 March 2026",
  effectiveFrom: "2026-03-11",
  effectiveTo: "2026-03-31",
  sourceLabel: "Customer Service QA Criteria (2) – Non Voice",
  totalScore: 100,
  sections: [
    {
      id: "S1",
      title: "Compliance & Policy = การปฏิบัติตามข้อกำหนดและนโยบาย",
      score: 20,
      topics: [
        {
          code: "1.1",
          title: "มาตรฐานการทักทายและปิดการสนทนา",
          score: 10,
          focus:
            "Greeting ตาม Script, แนะนำชื่อแอดมิน, เรียกชื่อแอดมินอย่างน้อย 2 ครั้ง, ปิดการสนทนาอย่างครบถ้วน",
          reviewGuide:
            "ตรวจว่ามีการทักทายตามมาตรฐาน แนะนำชื่อชัดเจน ใช้ชื่อแอดมินอย่างน้อย 2 ครั้ง และมี Closing ครบก่อนจบเคส",
          improveTip:
            "เพิ่มชื่อแอดมินช่วงปิดการสนทนา และเพิ่มข้อความเสนอความช่วยเหลือ/ขอบคุณก่อนปิดเคส",
        },
        {
          code: "1.2",
          title: "ความถูกต้องของข้อมูล (ไม่ให้ข้อมูลผิด/เกินจริง)",
          score: 5,
          focus:
            "ข้อมูลต้องถูกต้องตามระบบ นโยบาย และ KB ล่าสุด ห้ามคาดเดา",
          reviewGuide:
            "เช็กว่ามีการตรวจสอบข้อมูลก่อนตอบหรือไม่ และคำตอบสอดคล้องกับระบบจริงหรือไม่",
          improveTip:
            "หากยังไม่ยืนยันข้อมูลได้ ให้แจ้งลูกค้าว่ากำลังตรวจสอบเพิ่มเติมพร้อม timeline",
        },
        {
          code: "1.3",
          title: "การปฏิบัติตาม PDPA และนโยบายบริษัท",
          score: 5,
          focus:
            "ยืนยันตัวตนก่อนให้ข้อมูล และไม่เปิดเผยข้อมูลส่วนบุคคลโดยไม่ได้รับอนุญาต",
          reviewGuide:
            "พิจารณาว่ามีการ verify ก่อนเปิดเผยข้อมูลหรือไม่ และมีการละเมิดข้อมูลบุคคลที่สามหรือไม่",
          improveTip:
            "เพิ่มขั้นตอน verify และหลีกเลี่ยงการส่งข้อมูลระบุตัวตนที่ไม่จำเป็นลงในแชท",
        },
      ],
    },
    {
      id: "S2",
      title: "Accuracy & Knowledge = ความถูกต้องและความรู้",
      score: 20,
      topics: [
        {
          code: "2.1",
          title: "ความแม่นยำในการตอบตามเคสจริง",
          score: 5,
          focus:
            "คำตอบต้องตรงกับสถานะเคสจริง อ้างอิงข้อมูลจากระบบ ไม่ตอบผิดออเดอร์/ผิดลูกค้า",
          reviewGuide:
            "ตรวจว่าคำตอบอิงข้อมูลของเคสนั้นจริงหรือไม่ และมีการยืนยันข้อมูลสำคัญก่อนดำเนินการหรือไม่",
          improveTip:
            "ระบุสิ่งที่ตรวจพบจากระบบให้ชัดก่อนสรุปคำตอบกับลูกค้า",
        },
        {
          code: "2.2",
          title: "ความครบถ้วนในการตอบคำถาม",
          score: 5,
          focus:
            "ตอบครบทุกประเด็น ไม่มีตกหล่น โดยเฉพาะเมื่อมีหลายคำถามในข้อความเดียว",
          reviewGuide:
            "ไล่เช็กทีละประเด็นจากข้อความลูกค้าและดูว่าคำตอบครอบคลุมครบหรือไม่",
          improveTip:
            "เพิ่มคำตอบส่วนที่ตกหล่น รวมทั้งเงื่อนไขและ timeline ที่เกี่ยวข้อง",
        },
        {
          code: "2.3",
          title: "ความชัดเจนในการอธิบายขั้นตอน",
          score: 5,
          focus:
            "อธิบายขั้นตอนให้เข้าใจง่าย ทำตามได้จริง",
          reviewGuide:
            "ดูว่าลำดับขั้นตอนชัดเจนหรือไม่ และภาษาทำให้ผู้รับบริการเข้าใจว่าจะต้องทำอะไรต่อ",
          improveTip:
            "เขียนเป็น step 1-2-3 หรือแยกเป็นข้อเพื่อให้ทำตามได้ง่ายขึ้น",
        },
        {
          code: "2.4",
          title: "การใช้แหล่งอ้างอิงที่ถูกต้อง",
          score: 5,
          focus:
            "อ้างอิงระบบ นโยบาย หรือแหล่งข้อมูลที่เหมาะสมเมื่อจำเป็น",
          reviewGuide:
            "พิจารณาว่าคำตอบมีที่มาที่ถูกต้องและสอดคล้องกับแนวทางล่าสุดหรือไม่",
          improveTip:
            "ระบุว่าตรวจสอบจากระบบ/ประกาศ/ทีมที่เกี่ยวข้องแล้วเมื่อเป็นประเด็นสำคัญ",
        },
      ],
    },
    {
      id: "S3",
      title: "Resolution & Ownership = การแก้ไขปัญหาและความรับผิดชอบ",
      score: 20,
      topics: [
        {
          code: "3.1",
          title: "การวิเคราะห์และแก้ไขปัญหาได้ตรงจุด",
          score: 10,
          focus:
            "หาสาเหตุจริงและเลือกแนวทางแก้ที่ตรงจุด ไม่แก้เพียงปลายเหตุ",
          reviewGuide:
            "ตรวจว่ามีการหา root cause และแนวทางที่ให้สามารถแก้ปัญหาได้จริงหรือไม่",
          improveTip:
            "เพิ่มการตรวจสอบต้นเหตุและเสนอทางเลือกสำรองเมื่อแนวทางแรกใช้ไม่ได้",
        },
        {
          code: "3.2",
          title: "ความรับผิดชอบต่อเคส (ไม่ส่งต่อโดยไม่จำเป็น)",
          score: 5,
          focus:
            "รับผิดชอบเคสต่อเนื่อง และไม่โยนงานโดยไม่จำเป็น",
          reviewGuide:
            "ดูว่ามี ownership ต่อเคสหรือไม่ และหากต้องส่งต่อมีการสรุปข้อมูลเพียงพอหรือไม่",
          improveTip:
            "เพิ่มประโยค ownership และแจ้งเหตุผล/ทีมที่รับช่วงต่อให้ชัดเจน",
        },
        {
          code: "3.3",
          title: "การแจ้งแนวทางดำเนินการ (Next Step) ชัดเจน",
          score: 5,
          focus:
            "ลูกค้าต้องรู้ว่าจะเกิดอะไรต่อ ใครทำอะไร และควรติดตามอย่างไร",
          reviewGuide:
            "ตรวจว่ามี next step ชัดเจน มี timeline หรือวิธีติดตามผลหรือไม่",
          improveTip:
            "เพิ่ม next step, owner และช่วงเวลาที่คาดว่าจะอัปเดต",
        },
      ],
    },
    {
      id: "S4",
      title: "Communication Skill = ทักษะการสื่อสาร",
      score: 20,
      topics: [
        {
          code: "4.1",
          title: "โครงสร้างข้อความอ่านง่าย เป็นลำดับ",
          score: 5,
          focus: "ลำดับข้อความดี อ่านง่าย ไม่สับสน",
          reviewGuide:
            "ดูการแบ่งย่อหน้า การจัดลำดับประเด็น และความชัดเจนของโครงสร้างข้อความ",
          improveTip:
            "เพิ่มการขึ้นบรรทัดใหม่ แยกเป็น bullet หรือจัดลำดับเนื้อหาให้ชัดขึ้น",
        },
        {
          code: "4.2",
          title: "ความถูกต้องและความกระชับของภาษา",
          score: 5,
          focus: "ภาษาไม่ผิด ไม่กำกวม และไม่เยิ่นเย้อเกินจำเป็น",
          reviewGuide:
            "เช็กคำผิด โครงสร้างประโยค และความกระชับของการสื่อสาร",
          improveTip:
            "ตัดคำซ้ำ แก้คำผิด และเขียนให้ตรงประเด็นมากขึ้น",
        },
        {
          code: "4.3",
          title: "ความเหมาะสมของน้ำเสียง",
          score: 5,
          focus: "สุภาพ เหมาะกับบริบท และไม่ทำให้เกิดความขัดแย้ง",
          reviewGuide:
            "ดูว่าน้ำเสียงเหมาะสมกับสถานการณ์และรักษาความเป็นมืออาชีพหรือไม่",
          improveTip:
            "ปรับถ้อยคำให้นุ่มนวลขึ้น โดยเฉพาะเมื่อเจอเคสร้องเรียนหรือเคสอ่อนไหว",
        },
        {
          code: "4.4",
          title: "การปรับรูปแบบตามสถานการณ์",
          score: 5,
          focus: "เลือกวิธีสื่อสารให้เหมาะกับบริบทของแต่ละเคส",
          reviewGuide:
            "พิจารณาว่ารูปแบบการตอบสอดคล้องกับความเร่งด่วนและลักษณะปัญหาหรือไม่",
          improveTip:
            "ปรับระดับความละเอียด น้ำเสียง และรูปแบบข้อความให้เหมาะกับสถานการณ์จริง",
        },
      ],
    },
    {
      id: "S5",
      title: "Process & SLA = กระบวนการทำงานและข้อตกลงระดับการให้บริการ",
      score: 20,
      topics: [
        {
          code: "5.1",
          title: "การปฏิบัติตามขั้นตอนการทำงาน",
          score: 10,
          focus: "ทำงานตาม flow ที่กำหนด ไม่ข้ามขั้นตอนสำคัญ",
          reviewGuide:
            "ดูว่าการดำเนินการตาม workflow ถูกต้อง ครบถ้วน และเหมาะสมกับเคสหรือไม่",
          improveTip:
            "เพิ่มขั้นตอนที่ขาด และบันทึก action ที่ดำเนินการให้ครบ",
        },
        {
          code: "5.2",
          title: "การตอบกลับภายใน SLA",
          score: 5,
          focus: "รับและตอบกลับภายในเวลาที่กำหนด",
          reviewGuide:
            "ตรวจช่วงเวลารับเคส ช่วงเวลาตอบกลับ และการแจ้งคั่นเมื่อใช้เวลาตรวจสอบนาน",
          improveTip:
            "เพิ่มข้อความอัปเดตระหว่างรอ และควบคุมเวลา follow-up ให้ไม่หลุด SLA",
        },
        {
          code: "5.3",
          title: "ความถูกต้องในการบันทึกและอัปเดตสถานะเคส",
          score: 5,
          focus: "บันทึก case note และ status ให้ถูกต้องครบถ้วน",
          reviewGuide:
            "พิจารณาความครบถ้วนของ note และความถูกต้องของสถานะเคสหลังดำเนินการ",
          improveTip:
            "สรุป action/result ลง note ให้ครบ และอัปเดตสถานะให้สอดคล้องกับการปิดงานจริง",
        },
      ],
    },
  ],
};

const APR_2026_RUBRIC: RubricVersion = {
  key: "APR_2026",
  label: "April 2026 – Current Rubric",
  subtitle: "Effective from 03 April 2026 to present",
  effectiveFrom: "2026-04-03",
  sourceLabel: "02_Detailed_Guide",
  totalScore: 100,
  sections: [
    {
      id: "A1",
      title: "1. Compliance, Process & Policy",
      score: 30,
      topics: [
        {
          code: "1.1",
          title: "มาตรฐานการทักทายและปิดการสนทนา",
          score: 10,
          focus:
            "Script เปิด–ปิด, ชื่อแอดมิน, ชื่อแอดมินอย่างน้อย 2 ครั้ง, ปิดแชทให้ครบ, แอดมินเป็นข้อความสุดท้าย",
          meaning:
            "ประเมินความครบถ้วนของการเริ่มต้นและสิ้นสุดการสนทนาตามมาตรฐานองค์กร เพื่อสะท้อนความเป็นมืออาชีพ ความชัดเจนของผู้ให้บริการ และการจบเคสอย่างเหมาะสม",
          reviewGuide:
            "ตรวจว่ามี Greeting ตามมาตรฐาน ระบุชื่อแอดมินชัดเจน มีการเรียกชื่อแอดมินรวมอย่างน้อย 2 ครั้งตลอดแชท มีการสรุป/เสนอความช่วยเหลือเพิ่มเติม ปิดบทสนทนาอย่างเหมาะสม และข้อความสุดท้ายต้องเป็นของแอดมิน",
          improveTip:
            "เพิ่มประโยคสรุปผล เพิ่ม Closing script เพิ่มชื่อแอดมินในช่วงปิด และส่ง follow-up ปิดท้ายก่อนจบเคส",
          avoidDuplicate:
            "ไม่ควรหักซ้ำเรื่องน้ำเสียงหรือความกระชับในหัวข้อนี้ เว้นแต่ส่งผลให้การเปิด/ปิดไม่ครบจริง",
          checklist: [
            "ดูว่ามี Greeting และ Closing หรือไม่",
            "เช็กชื่อแอดมินว่าปรากฏอย่างน้อย 2 ครั้ง",
            "เช็กว่าข้อความสุดท้ายเป็นของแอดมิน",
            "หากขาดเพียงรูปประโยค แต่สาระครบ ให้หักเล็กน้อยหรือไม่หักตามบริบท",
          ],
        },
        {
          code: "1.2",
          title: "การปฏิบัติตาม PDPA / Policy / ข้อกำหนด",
          score: 10,
          focus:
            "Verify ตัวตน, ขอข้อมูลเท่าที่จำเป็น, ไม่เปิดเผยข้อมูลผู้อื่น, ไม่เกินนโยบาย, ควบคุมข้อมูลระบุตัวตนในแชท",
          meaning:
            "ประเมินการปฏิบัติตามข้อกำหนดด้านข้อมูลส่วนบุคคลและนโยบายบริษัท โดยเฉพาะการคุ้มครองข้อมูลระบุตัวตนและการไม่ให้คำมั่นเกินขอบเขตที่องค์กรอนุญาต",
          reviewGuide:
            "ตรวจว่ามีการยืนยันตัวตนก่อนเปิดเผยข้อมูลหรือไม่ ขอข้อมูลเกินจำเป็นหรือไม่ มีการพิมพ์หรือเปิดเผยข้อมูลระบุตัวตนบนแชทโดยไม่จำเป็นหรือไม่ และมีการสื่อสารเกิน Policy หรือไม่",
          improveTip:
            "เพิ่มขั้นตอน verify ใช้ข้อความกลางแทนการส่งข้อมูลดิบ ตัดข้อมูลส่วนบุคคลออกจากแชท และอ้างอิงว่าตรวจสอบตามนโยบายแล้ว",
          avoidDuplicate:
            "หากสาระคำตอบถูก แต่ปัญหาอยู่ที่การเปิดเผยข้อมูล ให้หักที่หัวข้อนี้เป็นหลัก ไม่หักซ้ำกับ 2.1",
          checklist: [
            "ก่อนให้ข้อมูลสำคัญ มีการ verify หรือไม่",
            "มีการขอหรือพิมพ์ข้อมูลเกินจำเป็นหรือไม่",
            "มีการเปิดเผยข้อมูลลูกค้าคนอื่นหรือข้อมูลระบุตัวตนหรือไม่",
            "ถ้าปัญหาอยู่ที่ข้อมูลส่วนบุคคล ให้หักที่หัวข้อนี้เป็นหลัก",
          ],
        },
        {
          code: "1.3",
          title: "การปฏิบัติตามกระบวนการและ SLA",
          score: 10,
          focus:
            "เลือกหมวดเคสถูก, ทำตาม Flow, ไม่ข้ามขั้นตอน, รับและตอบกลับใน SLA, update status / note ครบ",
          meaning:
            "ประเมินว่างานถูกดำเนินการตามกระบวนการที่องค์กรกำหนดหรือไม่ รวมถึงความตรงต่อเวลาในการตอบกลับและความครบถ้วนของการบันทึกเคส",
          reviewGuide:
            "ตรวจการเลือกประเภทเคส การดำเนินการตาม flow จริง การประสานงานที่ต้องทำ เวลารับแชทภายใน 3–5 นาที เวลาตอบกลับหลังรับแชทไม่เกิน 3 นาที มีการแจ้งคั่นระหว่างตรวจสอบก่อนหลุด SLA และมี case note/status ครบหรือไม่",
          improveTip:
            "เพิ่มข้อความแจ้งลูกค้าระหว่างรอ เพิ่ม note สรุป action ที่ทำ และเพิ่มการอัปเดต timeline หากต้องตรวจสอบนาน",
          avoidDuplicate:
            "ไม่ควรหักซ้ำเรื่องวิเคราะห์ไม่ตรงจุดในหัวข้อนี้ เพราะหัวข้อนี้เน้นการทำตามขั้นตอนและเวลา",
          checklist: [
            "ตรวจเวลารับและเวลาตอบจากระบบ",
            "เช็กว่าทำตาม flow ครบหรือไม่",
            "มีการอัปเดตคั่นระหว่างรอตรวจสอบหรือไม่",
            "มี case note / status ครบหรือไม่",
          ],
        },
      ],
    },
    {
      id: "A2",
      title: "2. Answer Quality & Knowledge",
      score: 25,
      topics: [
        {
          code: "2.1",
          title: "ความถูกต้องของคำตอบ",
          score: 10,
          focus:
            "ข้อมูลตรง Policy/ระบบ/ประกาศล่าสุด, ไม่เดา, ไม่ให้ข้อมูลผิด",
          meaning:
            "ประเมินความถูกต้องเชิงสาระของคำตอบที่ให้แก่ลูกค้า โดยต้องสอดคล้องกับข้อมูลจากระบบ นโยบาย หรือประกาศที่ใช้อยู่จริง",
          reviewGuide:
            "เช็กว่าคำตอบสอดคล้องกับสถานะในระบบหรือไม่ ใช้ข้อมูลล่าสุดหรือไม่ มีการคาดเดาเมื่อไม่แน่ใจหรือไม่ และมีข้อความที่อาจทำให้ลูกค้าเข้าใจผิดหรือไม่",
          improveTip:
            "เพิ่มการตรวจสอบจากระบบก่อนตอบ ระบุข้อมูลที่ยืนยันแล้ว และใช้ข้อความกลางเมื่อยังรอผล",
          avoidDuplicate:
            "ไม่ควรหักเรื่องการเปิดเผยข้อมูลส่วนบุคคลซ้ำกับ 1.2",
          checklist: [
            "เทียบคำตอบกับระบบ/นโยบาย/ประกาศล่าสุด",
            "เช็กว่ามีการเดาหรือไม่",
            "ถ้าไม่ชัวร์แต่ตอบฟันธง ถือว่าเสี่ยงผิด",
            "ถ้าปัญหาเป็นเรื่องนโยบายหรือข้อมูลส่วนบุคคล ให้พิจารณา 1.2 ร่วมด้วยแต่ไม่หักซ้ำ",
          ],
        },
        {
          code: "2.2",
          title: "ความครบถ้วนของคำตอบ",
          score: 10,
          focus:
            "ตอบครบทุกคำถาม, แจ้งเงื่อนไข/ข้อจำกัดครบ, ไม่มีตกหล่น",
          meaning:
            "ประเมินว่าคำตอบครอบคลุมประเด็นที่ลูกค้าถามอย่างเพียงพอหรือไม่ รวมถึงการแจ้งข้อจำกัด เงื่อนไข และผลลัพธ์ที่เกี่ยวข้อง",
          reviewGuide:
            "ไล่ทีละประเด็นจากข้อความลูกค้าแล้วเช็กว่าตอบครบหรือไม่ หากมีหลายคำถามต้องตอบทุกข้อ หากมีข้อจำกัดต้องระบุให้ครบ และหากยังตอบไม่ได้ต้องบอกว่าจะตรวจสอบต่อ",
          improveTip:
            "เพิ่มคำตอบในประเด็นที่ตกหล่น เพิ่มเงื่อนไขหรือข้อจำกัด และเพิ่ม timeline ว่าจะกลับมาแจ้งเมื่อใด",
          avoidDuplicate:
            "ไม่ควรหักเพราะลูกค้าไม่ได้ถามในประเด็นนั้น และหากข้อมูลเชิงลึกไม่จำเป็นต่อคำถามหลัก ไม่ควรใช้เป็นเหตุหักคะแนน",
          checklist: [
            "แตกคำถามลูกค้าเป็นข้อย่อย",
            "เช็กว่าตอบครบทุกข้อหรือยัง",
            "มีเงื่อนไข ข้อจำกัด หรือ timeline ที่ควรแจ้งหรือไม่",
            "ถ้าลูกค้าไม่ได้ถามและไม่จำเป็น ไม่ต้องบังคับให้ตอบเพิ่ม",
          ],
        },
        {
          code: "2.3",
          title: "ความชัดเจนของขั้นตอนและแหล่งอ้างอิง",
          score: 5,
          focus:
            "มีลำดับขั้น, ทำตามได้จริง, อ้างอิงระบบ/ประกาศเมื่อจำเป็น",
          meaning:
            "ประเมินความชัดเจนในการอธิบายขั้นตอนการดำเนินการให้ผู้รับบริการหรือผู้รับช่วงงานเข้าใจและปฏิบัติตามได้จริง",
          reviewGuide:
            "ดูว่ามีการเรียงลำดับ 1-2-3 หรือไม่ มีการใช้ภาษาที่ลงมือทำตามได้จริงหรือไม่ และหากเป็นประเด็นที่ต้องยึดประกาศ/ระบบ ต้องระบุแหล่งอ้างอิงหรือฐานการตรวจสอบอย่างเหมาะสม",
          improveTip:
            "เพิ่ม step ที่ชัดขึ้น แยกเป็นข้อ และระบุว่าอ้างอิงระบบ/ประกาศใด",
          avoidDuplicate:
            "ไม่ควรหักเพียงเพราะข้อความสั้น ถ้ายังชัดและทำตามได้จริง",
          checklist: [
            "อ่านแล้วรู้ไหมว่าต้องทำอะไรต่อ",
            "ขั้นตอนเรียงลำดับหรือไม่",
            "มีการอ้างอิงแหล่งข้อมูล/ระบบ/ทีมที่เกี่ยวข้องอย่างเหมาะสมหรือไม่",
            "ถ้าข้อมูลถูกแต่เขียนสับสน ให้หักหัวข้อนี้หรือ 4.1 ตามสาเหตุหลัก",
          ],
        },
      ],
    },
    {
      id: "A3",
      title: "3. Resolution & Ownership",
      score: 25,
      topics: [
        {
          code: "3.1",
          title: "การวิเคราะห์และแก้ไขปัญหาได้ตรงจุด",
          score: 15,
          focus:
            "หา root cause, ไม่แก้ปลายเหตุ, เลือกแนวทางตรงจุด, เสนอทางเลือกเมื่อเหมาะสม",
          meaning:
            "ประเมินความสามารถในการวิเคราะห์สาเหตุของปัญหาและเลือกแนวทางแก้ไขที่ตอบโจทย์สาเหตุจริง ไม่ใช่เพียงตอบตามอาการ",
          reviewGuide:
            "พิจารณาว่ามีการตั้งคำถามหรือการตรวจสอบเพื่อหา root cause หรือไม่ แนวทางที่ให้แก้ปัญหาจริงได้หรือไม่ และมีการเสนอทางเลือกที่เหมาะสมเมื่อแนวทางแรกใช้ไม่ได้หรือไม่",
          improveTip:
            "เพิ่มการเช็กสาเหตุ ระบุสิ่งที่ตรวจพบ เสนอแผนแก้ที่ตรงจุด และเพิ่ม alternative solution",
          avoidDuplicate:
            "ไม่ควรหักซ้ำเรื่อง process/SLA ที่ 1.3 เพราะหัวข้อนี้เน้นคุณภาพของการวิเคราะห์และคุณภาพของทางแก้",
          checklist: [
            "ระบุปัญหาหลักให้ถูกก่อน",
            "แนวทางแก้ตรงกับสาเหตุหรือไม่",
            "มีการแก้ปลายเหตุแทนต้นเหตุหรือไม่",
            "ถ้ายังแก้ไม่ได้ ต้องแสดงเหตุผลว่ากำลังตรวจอะไรต่อ",
          ],
        },
        {
          code: "3.2",
          title: "Ownership และการแจ้ง Next Step",
          score: 10,
          focus:
            "ไม่โยนงาน, แจ้งผู้รับผิดชอบ, next step, timeline, ช่องทางติดตาม",
          meaning:
            "ประเมินความรับผิดชอบต่อเคสตั้งแต่รับเรื่องจนถึงจุดที่ลูกค้าเข้าใจว่าจะเกิดอะไรต่อ ใครทำอะไร และต้องติดตามอย่างไร",
          reviewGuide:
            "ตรวจว่ามีการรับ ownership หรือไม่ หากส่งต่อมีการสรุปข้อมูลครบหรือไม่ แจ้ง next step ชัดหรือไม่ มี timeline และผู้รับผิดชอบหรือไม่ และมีวิธีติดตามผลหรือไม่",
          improveTip:
            "เพิ่มประโยค ownership เพิ่มผู้รับผิดชอบ/กำหนดเวลา และเพิ่มวิธีติดตามผล",
          avoidDuplicate:
            "ไม่ควรหักเพียงเพราะยังแก้ไม่เสร็จ หากแอดมินได้แจ้ง next step และ timeline ชัดเจนแล้ว",
          checklist: [
            "แอดมินรับผิดชอบต่อเคสต่อเนื่องหรือไม่",
            "ลูกค้ารู้ขั้นตอนถัดไปชัดเจนหรือไม่",
            "ระบุ owner / เวลา / สิ่งที่จะอัปเดตหรือไม่",
            "ถ้าเป็นเคสส่งต่อ ต้องบอกว่าทีมไหนทำอะไรต่อ",
          ],
        },
      ],
    },
    {
      id: "A4",
      title: "4. Communication Skill",
      score: 20,
      topics: [
        {
          code: "4.1",
          title: "โครงสร้างข้อความและความอ่านง่าย",
          score: 5,
          focus:
            "เรียงประเด็นชัด, แยกย่อหน้า/ข้อ, ไม่ยาวติดกันจนอ่านยาก",
          meaning:
            "ประเมินรูปแบบการจัดเรียงข้อความให้ผู้อ่านเข้าใจง่ายและเห็นสารสำคัญโดยไม่ต้องตีความมากเกินจำเป็น",
          reviewGuide:
            "ตรวจการขึ้นบรรทัดใหม่ การแบ่งหัวข้อ การจัดลำดับก่อนหลัง และความหนาแน่นของข้อความ หากเป็นข้อความยาวควรแยกช่วงหรือแยกขั้นตอน",
          improveTip:
            "เพิ่ม bullet/ลำดับขั้น ตัดประโยคยาว และแบ่งข้อมูลเป็นย่อหน้า",
          avoidDuplicate:
            "ไม่ควรหักซ้ำกับ 2.3 หากขั้นตอนชัดอยู่แล้ว แต่รูปแบบยังอ่านยาก ให้หักที่หัวข้อนี้เท่าที่สมเหตุผล",
          checklist: [
            "ข้อความแบ่งย่อหน้าและลำดับประเด็นหรือไม่",
            "มี bullet / numbering เมื่อข้อมูลหลายข้อหรือไม่",
            "มีข้อความยาวติดกันจนอ่านยากหรือไม่",
            "หากสาระครบแต่รูปแบบอ่านยาก ให้หักหัวข้อนี้",
          ],
        },
        {
          code: "4.2",
          title: "ความกระชับและความถูกต้องของภาษา",
          score: 5,
          focus: "ภาษาไม่ผิด, ไม่กำกวม, กระชับพอดี, ไม่เยิ่นเย้อ",
          meaning:
            "ประเมินคุณภาพภาษาในเชิงความถูกต้อง ความกระชับ และการสื่อสารที่ไม่ทำให้เกิดความสับสน",
          reviewGuide:
            "ดูคำผิด ไวยากรณ์ ความกำกวม การใช้คำซ้ำ หรือประโยคยาวเกินจำเป็น หากข้อความสั้นแต่ความหมายชัด ไม่ควรถูกหักเพียงเพราะสั้น",
          improveTip:
            "แก้คำผิด ตัดคำซ้ำ ใช้ภาษาที่ตรงประเด็น และเขียนให้ชัดว่าใครทำอะไรเมื่อใด",
          avoidDuplicate:
            "ไม่ควรหักในหัวข้อนี้เพราะไม่มี empathy; ประเด็นน้ำเสียงให้พิจารณาใน 4.3",
          checklist: [
            "มีคำผิดหรือโครงสร้างประโยคผิดจนเข้าใจยากหรือไม่",
            "ใช้คำเยิ่นเย้อหรือวนหรือไม่",
            "ใช้คำกำกวมจนลูกค้าตีความผิดได้หรือไม่",
            "ถ้าคำตอบผิดเชิงสาระ ให้หัก 2.1 เป็นหลัก ไม่ใช่หัวข้อนี้",
          ],
        },
        {
          code: "4.3",
          title: "น้ำเสียงและความเหมาะสมตามสถานการณ์",
          score: 10,
          focus:
            "สุภาพ, เหมาะกับบริบท, มี empathy เมื่อจำเป็น, ปรับโทนตามเคสเร่งด่วน/ร้องเรียน",
          meaning:
            "ประเมินความเหมาะสมของน้ำเสียงกับสถานการณ์ โดยเฉพาะการแสดงความเข้าใจ ความเห็นใจ และความเป็นมืออาชีพต่อผู้รับบริการ",
          reviewGuide:
            "เช็กว่ากรณีร้องเรียนหรือได้รับผลกระทบมี empathy หรือไม่ ใช้น้ำเสียงแข็งหรือโยนความผิดหรือไม่ และมีการปรับระดับความจริงจังให้เหมาะกับเคสหรือไม่",
          improveTip:
            "เพิ่มคำขออภัยหรือแสดงความเข้าใจ ปรับโทนให้อ่อนลง และใช้ถ้อยคำที่ช่วยลดความขัดแย้ง",
          avoidDuplicate:
            "ไม่ควรหักเพียงเพราะข้อความสั้น หากยังสุภาพและเหมาะสม",
          checklist: [
            "น้ำเสียงสุภาพและเหมาะกับอารมณ์ลูกค้าหรือไม่",
            "กรณีร้องเรียน มี empathy หรือไม่",
            "หลีกเลี่ยงคำที่ฟังแข็ง ขู่ หรือปัดความรับผิดชอบหรือไม่",
            "ถ้าโทนดีแต่ขั้นตอนไม่ชัด ให้ไปหักหัวข้อที่ตรงสาเหตุแทน",
          ],
        },
      ],
    },
  ],
};

const RUBRICS: RubricVersion[] = [MARCH_2026_RUBRIC, APR_2026_RUBRIC];
const SONGKRAN_THEME_END = new Date(2026, 3, 25, 23, 59, 59);

function isSongkranThemeActive() {
  const now = new Date();
  return now <= SONGKRAN_THEME_END && now.getFullYear() === 2026 && now.getMonth() === 3;
}

function SongkranBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-[-40px] top-10 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="absolute right-0 top-12 h-36 w-36 rounded-full bg-fuchsia-300/20 blur-3xl" />
      <div className="absolute left-1/3 bottom-0 h-40 w-40 rounded-full bg-sky-300/15 blur-3xl" />
      <div className="absolute right-1/4 bottom-4 h-28 w-28 rounded-full bg-violet-300/15 blur-3xl" />
      <div className="absolute left-5 bottom-4 hidden rounded-[24px] border border-white/20 bg-white/10 px-3 py-2 text-2xl backdrop-blur md:flex">🔫💦</div>
      <div className="absolute right-5 top-4 hidden rounded-[24px] border border-white/20 bg-white/10 px-3 py-2 text-2xl backdrop-blur md:flex">🪣🌸</div>
    </div>
  );
}

function SongkranFlowerCorner({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute ${className}`}>
      <div className="relative h-12 w-12">
        <span className="absolute left-4 top-0 h-4 w-4 rounded-full bg-pink-300/70" />
        <span className="absolute left-0 top-4 h-4 w-4 rounded-full bg-fuchsia-300/70" />
        <span className="absolute left-4 top-8 h-4 w-4 rounded-full bg-cyan-300/70" />
        <span className="absolute left-8 top-4 h-4 w-4 rounded-full bg-sky-300/70" />
        <span className="absolute left-4 top-4 h-4 w-4 rounded-full bg-white/85 shadow-sm" />
      </div>
    </div>
  );
}


function formatDate(isoDate?: string) {
  if (!isoDate) return "Present";
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isDateInRange(target: string, start: string, end?: string) {
  const t = new Date(`${target}T00:00:00`).getTime();
  const s = new Date(`${start}T00:00:00`).getTime();
  const e = end ? new Date(`${end}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;
  return t >= s && t <= e;
}

function getAutoRubricKey() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayIso = `${yyyy}-${mm}-${dd}`;

  if (isDateInRange(todayIso, "2026-04-03")) return "APR_2026";
  if (isDateInRange(todayIso, "2026-03-11", "2026-03-31")) return "MARCH_2026";
  return "APR_2026";
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-200">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold text-white">{value}</div>
    </div>
  );
}

export default function QARubricMockup({
  currentUser,
}: {
  currentUser: any;
}) {
  const [selectedKey, setSelectedKey] = useState<RubricVersion["key"]>(getAutoRubricKey());

  const activeRubric = useMemo(
    () => RUBRICS.find((item) => item.key === selectedKey) || APR_2026_RUBRIC,
    [selectedKey]
  );

  const totalTopics = activeRubric.sections.reduce(
    (sum, section) => sum + section.topics.length,
    0
  );
  const songkranTheme = useMemo(() => isSongkranThemeActive(), []);

  const isCurrentDefault = selectedKey === getAutoRubricKey();

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="relative mx-auto max-w-7xl">
        {songkranTheme ? <SongkranBackdrop /> : null}
        <div className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-r from-violet-950 via-violet-800 to-fuchsia-700 px-6 py-5 text-white shadow-xl">
          {songkranTheme ? <SongkranFlowerCorner className="-right-2 -top-2 scale-75 opacity-80" /> : null}
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">
            Robinhood QA Rubric
          </div>

          <div className="mt-3 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="text-3xl font-bold">QA Rubric</h1>
              <div className="mt-2 text-sm text-violet-100">
                Logged in as {currentUser?.displayName || "-"} ({currentUser?.role || "-"})
              </div>
              <div className="mt-3 inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-violet-50">
                {isCurrentDefault ? "Auto-selected by effective date" : "Manual rubric selection"}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Version" value={activeRubric.label} />
              <StatCard label="Sections" value={activeRubric.sections.length} />
              <StatCard label="Topics" value={totalTopics} />
              <StatCard label="Total Score" value={activeRubric.totalScore} />
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-3xl border border-violet-200 bg-white shadow-sm">
          <div className="border-b border-violet-100 px-6 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-lg font-semibold text-slate-900">
                  Effective Rubric Version
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  March 2026 uses the legacy non-voice criteria. April 2026 onward uses the detailed guide.
                </div>
              </div>

              <div className="w-full max-w-sm">
                <select
                  value={selectedKey}
                  onChange={(e) => setSelectedKey(e.target.value as RubricVersion["key"])}
                  className="w-full rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-violet-400 focus:bg-white"
                >
                  {RUBRICS.map((rubric) => (
                    <option key={rubric.key} value={rubric.key}>
                      {rubric.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                Active Period
              </div>
              <div className="mt-2 text-sm font-medium text-slate-800">
                {formatDate(activeRubric.effectiveFrom)} - {formatDate(activeRubric.effectiveTo)}
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Source File
              </div>
              <div className="mt-2 text-sm font-medium text-slate-800">
                {activeRubric.sourceLabel}
              </div>
            </div>

            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Rubric Scope
              </div>
              <div className="mt-2 text-sm font-medium text-slate-800">
                {activeRubric.subtitle}
              </div>
            </div>

            <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                Usage
              </div>
              <div className="mt-2 text-sm font-medium text-slate-800">
                Dashboard view, QA reference, coaching, and appeal review
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {activeRubric.sections.map((section) => (
            <div
              key={section.id}
              className="overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-sm"
            >
              <div className="flex flex-col gap-3 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-6 py-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">
                    Section
                  </div>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">{section.title}</h2>
                </div>

                <div className="inline-flex items-center rounded-2xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white shadow-sm">
                  {section.score} คะแนน
                </div>
              </div>

              <div className="grid gap-4 p-6 xl:grid-cols-2">
                {section.topics.map((topic) => (
                  <div
                    key={topic.code}
                    className="rounded-2xl border border-violet-100 bg-slate-50 p-5 transition hover:border-violet-200 hover:bg-white hover:shadow-md"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="inline-flex rounded-xl bg-violet-100 px-3 py-1 text-sm font-bold text-violet-800">
                        {topic.code}
                      </div>
                      <div className="rounded-xl bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                        {topic.score} pts
                      </div>
                    </div>

                    <div className="mt-4 text-base font-semibold leading-7 text-slate-900">
                      {topic.title}
                    </div>

                    {topic.focus && (
                      <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
                          Focus
                        </div>
                        <div className="mt-2 text-sm leading-6 text-slate-700">{topic.focus}</div>
                      </div>
                    )}

                    {topic.meaning && (
                      <div className="mt-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Formal Meaning
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-700">{topic.meaning}</p>
                      </div>
                    )}

                    {topic.reviewGuide && (
                      <div className="mt-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          How to Review
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-700">{topic.reviewGuide}</p>
                      </div>
                    )}

                    {topic.improveTip && (
                      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                          Coaching Tip When Score Is Not Full
                        </div>
                        <div className="mt-2 text-sm leading-6 text-slate-700">{topic.improveTip}</div>
                      </div>
                    )}

                    {topic.avoidDuplicate && (
                      <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">
                          Do Not Double Deduct
                        </div>
                        <div className="mt-2 text-sm leading-6 text-slate-700">{topic.avoidDuplicate}</div>
                      </div>
                    )}

                    {topic.checklist && topic.checklist.length > 0 && (
                      <div className="mt-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Reviewer Checklist
                        </div>
                        <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
                          {topic.checklist.map((item) => (
                            <li key={item} className="flex gap-2">
                              <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-violet-500" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
