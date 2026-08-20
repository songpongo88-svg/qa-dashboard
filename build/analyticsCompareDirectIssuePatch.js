function replaceOrThrow(context, code, search, replacement, label) {
  if (!code.includes(search)) {
    context.error(`Analytics compare direct issue patch could not find ${label}.`);
  }
  return code.replace(search, replacement);
}

export function analyticsCompareDirectIssuePatch() {
  let patched = false;

  return {
    name: "analytics-compare-direct-issue",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/SummaryMockup.tsx")) return null;

      let next = code;

      next = replaceOrThrow(
        this,
        next,
        `function summarizeAnalyticsScoreDriverReason(item: any, direction: "down" | "up", pdf = false) {\n  const category = getAnalyticsScoreDriverCategory(item);\n  if (pdf) return direction === "down" ? category.pdfNegative : category.pdfPositive;\n  return direction === "down" ? category.negative : category.positive;\n}\n\nfunction getAnalyticsScoreDriverHeadline(driver: any, pdf = false) {\n  const categories = Array.from(\n    new Map(\n      (driver?.drivers || []).map((item: any) => {\n        const category = getAnalyticsScoreDriverCategory(item);\n        return [category.key, category];\n      })\n    ).values()\n  ) as any[];\n\n  const labels = categories.slice(0, 3).map((item) => item.label);\n  if (!labels.length) {\n    return pdf\n      ? (driver?.direction === "down" ? "Score decreased; no clear driver category was found" : "Score increased; no clear driver category was found")\n      : (driver?.direction === "down" ? "คะแนนลดลง แต่ยังไม่พบสาเหตุหลักที่จัดกลุ่มได้" : "คะแนนเพิ่มขึ้น แต่ยังไม่พบสาเหตุหลักที่จัดกลุ่มได้");\n  }\n\n  if (pdf) {\n    return (driver?.direction === "down" ? "Main decline drivers: " : "Main improvement drivers: ") + labels.join(" / ");\n  }\n\n  return (driver?.direction === "down" ? "คะแนนลดลงหลัก ๆ จาก " : "คะแนนเพิ่มขึ้นหลัก ๆ จาก ") + labels.join(" · ");\n}\n`,
        `function getDirectAnalyticsScoreDriverIssue(item: any) {\n  const raw = sanitizeAnalyticsScoreDriverValue(item?.reason || "")\n    .replace(/^(?:จุดที่หักคือ|จุดที่ควรปรับ|ข้อควรปรับ|สาเหตุ|Issue)\\s*[:：-]?\\s*/i, "")\n    .replace(/(?:ตัวอย่างที่เหมาะสม|เงื่อนไขที่ใช้หักคะแนนตามไฟล์|Process ที่ใช้เทียบ|Summary of Process).*$/i, "")\n    .trim();\n\n  if (!raw || /ไม่พบรายละเอียด Issue\\/Comment/i.test(raw)) return "";\n\n  const parts = raw\n    .split(/(?:[.!?。;；]|\\s+(?:แต่|อย่างไรก็ตาม|อย่างไรก็ดี|เนื่องจาก|เพราะ|จึง|รวมถึง)\\s+)/)\n    .map((part) => part.trim())\n    .filter(Boolean);\n\n  const direct = parts.find((part) =>\n    /(ไม่|ขาด|เกิน|ผิด|ตกหล่น|ล่าช้า|ไม่ได้|ไม่ครบ|ไม่ถูก|ไม่ชัด|สะกด|SLA|Process|Policy|PDPA|Follow[- ]?up|Next Step|Greeting|Closing|Case Note|Tag)/i.test(part)\n  ) || parts[0] || raw;\n\n  const cleaned = direct\n    .replace(/^จากการตรวจสอบ\\s*/i, "")\n    .replace(/^แอดมิน\\s*/i, "แอดมิน ")\n    .trim();\n\n  return cleaned.length > 125\n    ? cleaned.slice(0, 124).trimEnd() + "…"\n    : cleaned;\n}\n\nfunction summarizeAnalyticsScoreDriverReason(item: any, direction: "down" | "up", pdf = false) {\n  const directIssue = getDirectAnalyticsScoreDriverIssue(item);\n\n  if (direction === "down") {\n    if (directIssue) return directIssue;\n    const topic = sanitizeAnalyticsScoreDriverValue(item?.topicLabel || item?.topicCode || "Topic");\n    return pdf\n      ? "Score declined in " + topic + "; no explicit deduction reason was stored"\n      : topic + " คะแนนลดลง แต่ผลประเมินไม่ได้ระบุจุดที่หักไว้ชัดเจน";\n  }\n\n  if (directIssue && !/(ไม่|ขาด|เกิน|ผิด|ตกหล่น|ล่าช้า|ไม่ได้|ไม่ครบ|ไม่ถูก)/i.test(directIssue)) {\n    return directIssue;\n  }\n\n  const topic = sanitizeAnalyticsScoreDriverValue(item?.topicLabel || item?.topicCode || "Topic");\n  return pdf\n    ? topic + " improved from " + Number(item?.previousPct || 0).toFixed(2) + "% to " + Number(item?.currentPct || 0).toFixed(2) + "%"\n    : topic + " ดีขึ้นจาก " + Number(item?.previousPct || 0).toFixed(2) + "% เป็น " + Number(item?.currentPct || 0).toFixed(2) + "%";\n}\n\nfunction getAnalyticsScoreDriverHeadline(driver: any, pdf = false) {\n  const count = Array.isArray(driver?.drivers) ? driver.drivers.length : 0;\n  if (pdf) {\n    return driver?.direction === "down"\n      ? "Score decreased; see the exact deduction reasons from " + count + " representative case(s) below"\n      : "Score increased; see the strongest improvements from " + count + " representative case(s) below";\n  }\n\n  return driver?.direction === "down"\n    ? "คะแนนลดลงจากจุดที่หักจริงในเคสตัวอย่างด้านล่าง"\n    : "คะแนนเพิ่มขึ้นจากผลการทำงานที่ดีขึ้นในเคสตัวอย่างด้านล่าง";\n}\n`,
        "direct score-driver reason helpers"
      );

      next = replaceOrThrow(
        this,
        next,
        `<div className="mt-1 text-sm font-black text-slate-950">{group.label}</div>`,
        `{topicGroups.length > 1 ? (\n                  <div className="mt-1 text-[10px] font-semibold text-slate-500">Different QA Criteria · {group.label}</div>\n                ) : null}`,
        "redundant policy group label"
      );

      next = replaceOrThrow(
        this,
        next,
        `              <div className="mt-1 text-[10px] font-semibold text-slate-500">สรุปสาเหตุหลักจากเคสจริง พร้อม Intent และ Case ตัวอย่าง โดยไม่แสดง Raw Comment ยาว ๆ</div>`,
        `              <div className="mt-1 text-[10px] font-semibold text-slate-500">สรุปจากจุดที่หักจริงในผลประเมิน พร้อม Intent และ Case ตัวอย่าง</div>`,
        "direct score-driver subtitle"
      );

      patched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!patched) this.error("Analytics compare direct issue patch was not applied.");
    },
  };
}
