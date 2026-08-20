function replaceOrThrow(context, code, search, replacement, label) {
  if (!code.includes(search)) {
    context.error(`Analytics score drivers summary patch could not find ${label}.`);
  }
  return code.replace(search, replacement);
}

export function analyticsScoreDriversSummaryPatch() {
  let patched = false;

  return {
    name: "analytics-score-drivers-summary",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/SummaryMockup.tsx")) return null;

      let next = code;

      const helperCode = String.raw`
function sanitizeAnalyticsScoreDriverValue(value: unknown) {
  return String(value || "")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[\r\n•▪●◦]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactAnalyticsScoreDriverIntent(value: unknown) {
  let text = sanitizeAnalyticsScoreDriverValue(value);
  if (!text) return "ไม่พบ Intent";
  if (/[ก-๙]/.test(text)) {
    text = text.replace(/\s*\([^()]{6,}\)\s*$/g, "").trim();
  }
  return text.length > 105 ? text.slice(0, 104).trimEnd() + "…" : text;
}

function getAnalyticsScoreDriverCategory(item: any) {
  const reason = sanitizeAnalyticsScoreDriverValue(item?.reason || "");
  const topicLabel = sanitizeAnalyticsScoreDriverValue(item?.topicLabel || "");
  const combined = (reason + " " + topicLabel).toLowerCase();

  const category = (
    key: string,
    label: string,
    negative: string,
    positive: string,
    pdfNegative: string,
    pdfPositive: string
  ) => ({ key, label, negative, positive, pdfNegative, pdfPositive });

  if (/(sla|response\s*time|first\s*response|reply\s*time|close\s*time|ตอบช้า|ตอบล่าช้า|ล่าช้า|เกินเวลา|เกิน\s*\d+\s*นาที|ระยะเวลา)/i.test(combined)) {
    return category(
      "sla",
      "SLA",
      "SLA เกินเกณฑ์หรือมีการตอบ/ดำเนินการล่าช้า",
      "ตอบและดำเนินการได้ตาม SLA",
      "SLA or response time exceeded",
      "Handled within SLA"
    );
  }

  if (/(greeting|closing|opening|ทักทาย|ปิดการสนทนา|เปิดการสนทนา|แนะนำตัว|ชื่อแอดมิน)/i.test(combined)) {
    return category(
      "greeting",
      "Greeting / Closing",
      "Greeting / Closing ไม่ครบตามมาตรฐาน",
      "Greeting / Closing ถูกต้องครบถ้วน",
      "Greeting or closing standard was incomplete",
      "Greeting and closing met the standard"
    );
  }

  if (/(pdpa|verify|verification|ยืนยันข้อมูล|ตรวจสอบข้อมูล|ข้อมูลส่วนบุคคล|พิสูจน์ตัวตน)/i.test(combined)) {
    return category(
      "verification",
      "Verification / PDPA",
      "การตรวจสอบหรือยืนยันข้อมูลไม่ครบตามเกณฑ์",
      "ตรวจสอบและยืนยันข้อมูลได้ครบตามเกณฑ์",
      "Verification or PDPA checks were incomplete",
      "Verification and PDPA checks were complete"
    );
  }

  if (/(case\s*note|case\s*logging|logging|tag|status\s*accuracy|บันทึกเคส|เคสโน้ต|สถานะเคส|ใส่แท็ก|แท็ก)/i.test(combined)) {
    return category(
      "logging",
      "Case Note / Tag / Status",
      "Case Note / Tag / Status ไม่ครบหรือไม่ถูกต้อง",
      "Case Note / Tag / Status ถูกต้องครบถ้วน",
      "Case note, tag, or status was incomplete or incorrect",
      "Case note, tag, and status were accurate"
    );
  }

  if (/(สะกด|คำผิด|ภาษา|grammar|spelling|tone|empathy|สุภาพ|น้ำเสียง|โครงสร้างข้อความ|อ่านง่าย|communication)/i.test(combined)) {
    const spellingIssue = /(สะกด|คำผิด|spelling|grammar|ภาษา)/i.test(combined);
    return category(
      "communication",
      "Communication",
      spellingIssue ? "การใช้ภาษา/การสะกดคำไม่เป็นไปตามเกณฑ์" : "การสื่อสารหรือน้ำเสียงไม่เป็นไปตามเกณฑ์",
      spellingIssue ? "ใช้ภาษาและสะกดคำได้ถูกต้อง" : "สื่อสารได้ชัดเจนและเหมาะสม",
      spellingIssue ? "Language or spelling did not meet the standard" : "Communication or tone did not meet the standard",
      spellingIssue ? "Language and spelling met the standard" : "Communication was clear and appropriate"
    );
  }

  if (/(follow[- ]?up|ownership|next\s*step|case\s*handling|ติดตาม|สรุปผล|ขั้นตอนถัดไป|next step|ดูแลเคส|ประสานงาน|ปิดเคส)/i.test(combined)) {
    return category(
      "case-handling",
      "Case Handling / Follow-up",
      "Case Handling / Follow-up / Next Step ไม่ครบ",
      "Case Handling / Follow-up / Next Step ทำได้ครบ",
      "Case handling, follow-up, or next step was incomplete",
      "Case handling, follow-up, and next step were complete"
    );
  }

  if (/(answer|accuracy|completeness|คำตอบ|ข้อมูลไม่ถูก|ไม่ถูกต้อง|ไม่ครบถ้วน|ไม่ครบ|ชัดเจน|วิเคราะห์|problem\s*analysis|analysis)/i.test(combined)) {
    return category(
      "answer",
      "Answer Quality",
      "คำตอบ/การวิเคราะห์ไม่ถูกต้องหรือไม่ครบถ้วน",
      "คำตอบและการวิเคราะห์ถูกต้องครบถ้วน",
      "Answer quality or analysis was inaccurate or incomplete",
      "Answer quality and analysis were accurate and complete"
    );
  }

  if (/(process|policy|ขั้นตอน|กระบวนการ|นโยบาย|ดำเนินการ|ปฏิบัติตาม)/i.test(combined)) {
    return category(
      "process",
      "Process / Policy",
      "ดำเนินการไม่ครบตาม Process / Policy",
      "ดำเนินการได้ครบตาม Process / Policy",
      "Process or policy steps were incomplete",
      "Process and policy steps were completed correctly"
    );
  }

  const normalizedTopic = topicLabel.toLowerCase();
  if (/(process|policy|ขั้นตอน|กระบวนการ)/i.test(normalizedTopic)) {
    return category("process", "Process / Policy", "ดำเนินการไม่ครบตาม Process / Policy", "ดำเนินการได้ครบตาม Process / Policy", "Process or policy steps were incomplete", "Process and policy steps were completed correctly");
  }
  if (/(answer|analysis|คำตอบ|วิเคราะห์)/i.test(normalizedTopic)) {
    return category("answer", "Answer Quality", "คำตอบ/การวิเคราะห์ยังไม่ครบตามเกณฑ์", "คำตอบและการวิเคราะห์ทำได้ดีขึ้น", "Answer quality or analysis was below standard", "Answer quality and analysis improved");
  }
  if (/(case handling|follow|ติดตาม|ดูแลเคส)/i.test(normalizedTopic)) {
    return category("case-handling", "Case Handling / Follow-up", "Case Handling / Follow-up ยังไม่ครบตามเกณฑ์", "Case Handling / Follow-up ทำได้ครบ", "Case handling or follow-up was below standard", "Case handling and follow-up improved");
  }
  if (/(communication|สื่อสาร|ภาษา)/i.test(normalizedTopic)) {
    return category("communication", "Communication", "การสื่อสารยังไม่ครบตามเกณฑ์", "การสื่อสารทำได้ดีขึ้น", "Communication was below standard", "Communication improved");
  }

  return category(
    "topic",
    topicLabel || "Topic",
    (topicLabel || "หัวข้อนี้") + " มีคะแนนลดลงจากเกณฑ์เดิม",
    (topicLabel || "หัวข้อนี้") + " มีผลการทำงานดีขึ้น",
    (topicLabel || "This topic") + " declined",
    (topicLabel || "This topic") + " improved"
  );
}

function summarizeAnalyticsScoreDriverReason(item: any, direction: "down" | "up", pdf = false) {
  const category = getAnalyticsScoreDriverCategory(item);
  if (pdf) return direction === "down" ? category.pdfNegative : category.pdfPositive;
  return direction === "down" ? category.negative : category.positive;
}

function getAnalyticsScoreDriverHeadline(driver: any, pdf = false) {
  const categories = Array.from(
    new Map(
      (driver?.drivers || []).map((item: any) => {
        const category = getAnalyticsScoreDriverCategory(item);
        return [category.key, category];
      })
    ).values()
  ) as any[];

  const labels = categories.slice(0, 3).map((item) => item.label);
  if (!labels.length) {
    return pdf
      ? (driver?.direction === "down" ? "Score decreased; no clear driver category was found" : "Score increased; no clear driver category was found")
      : (driver?.direction === "down" ? "คะแนนลดลง แต่ยังไม่พบสาเหตุหลักที่จัดกลุ่มได้" : "คะแนนเพิ่มขึ้น แต่ยังไม่พบสาเหตุหลักที่จัดกลุ่มได้");
  }

  if (pdf) {
    return (driver?.direction === "down" ? "Main decline drivers: " : "Main improvement drivers: ") + labels.join(" / ");
  }

  return (driver?.direction === "down" ? "คะแนนลดลงหลัก ๆ จาก " : "คะแนนเพิ่มขึ้นหลัก ๆ จาก ") + labels.join(" · ");
}

`;

      next = replaceOrThrow(
        this,
        next,
        `function buildAnalyticsScoreDrivers(periodReports: any[]) {`,
        `${helperCode}function buildAnalyticsScoreDrivers(periodReports: any[]) {`,
        "score driver helper injection"
      );

      next = replaceOrThrow(
        this,
        next,
        `              <div className="mt-1 text-[10px] font-semibold text-slate-500">หยิบเคสตัวแทนจาก Topic ที่เปลี่ยนเด่นที่สุด พร้อม Intent และประเด็นจากผลประเมิน</div>`,
        `              <div className="mt-1 text-[10px] font-semibold text-slate-500">สรุปสาเหตุหลักจากเคสจริง พร้อม Intent และ Case ตัวอย่าง โดยไม่แสดง Raw Comment ยาว ๆ</div>`,
        "score driver subtitle"
      );

      next = replaceOrThrow(
        this,
        next,
        `                </div>\n\n                {driver.drivers.length ? (`,
        `                </div>\n\n                <div className={"mt-3 rounded-xl border px-3.5 py-2.5 text-[11px] font-black " + (driver.direction === "down" ? "border-rose-100 bg-rose-50/70 text-rose-700" : "border-emerald-100 bg-emerald-50/70 text-emerald-700")}>\n                  {getAnalyticsScoreDriverHeadline(driver)}\n                </div>\n\n                {driver.drivers.length ? (`,
        "score driver headline"
      );

      next = replaceOrThrow(
        this,
        next,
        `<div className="mt-0.5 text-[10px] font-semibold leading-5 text-slate-700">{item.intent}</div>`,
        `<div className="mt-0.5 text-[10px] font-semibold leading-5 text-slate-700">{compactAnalyticsScoreDriverIntent(item.intent)}</div>`,
        "score driver compact intent"
      );

      next = replaceOrThrow(
        this,
        next,
        `<div className="mt-2 text-[9px] font-black uppercase tracking-wide text-slate-400">ประเด็นจากผลประเมิน</div>\n                          <div className="mt-0.5 text-[10px] font-semibold leading-5 text-slate-700">{item.reason}</div>`,
        `<div className="mt-2 text-[9px] font-black uppercase tracking-wide text-slate-400">สรุปสาเหตุ</div>\n                          <div className={"mt-0.5 text-[10px] font-black leading-5 " + (driver.direction === "down" ? "text-rose-700" : "text-emerald-700")}>{summarizeAnalyticsScoreDriverReason(item, driver.direction)}</div>`,
        "score driver concise cause"
      );

      next = replaceOrThrow(
        this,
        next,
        `            const intentLines = wrapText("Intent: " + item.intent, 82, 2);\n            const reasonLines = wrapText("Reason: " + item.reason, 82, 2);`,
        `            const intentLines = wrapText("Intent: " + compactAnalyticsScoreDriverIntent(item.intent), 82, 2);\n            const reasonLines = wrapText("Cause: " + summarizeAnalyticsScoreDriverReason(item, driver.direction, true), 82, 2);`,
        "score driver PDF concise cause"
      );

      next = replaceOrThrow(
        this,
        next,
        `          y += 18;\n\n          driver.drivers.forEach((item: any, itemIndex: number) => {`,
        `          y += 18;\n\n          const driverHeadlineLines = wrapText(getAnalyticsScoreDriverHeadline(driver, true), 95, 2);\n          ensureSpace(7 + driverHeadlineLines.length * 3.2);\n          doc.setFont("helvetica", "bold");\n          doc.setFontSize(6.6);\n          doc.setTextColor(isDown ? 190 : 4, isDown ? 24 : 120, isDown ? 93 : 87);\n          driverHeadlineLines.forEach((line: string, lineIndex: number) => {\n            drawText(line, margin + 2, y + 4 + lineIndex * 3.2);\n          });\n          y += 7 + driverHeadlineLines.length * 3.2;\n\n          driver.drivers.forEach((item: any, itemIndex: number) => {`,
        "score driver PDF headline"
      );

      patched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!patched) this.error("Analytics score drivers summary patch was not applied.");
    },
  };
}
