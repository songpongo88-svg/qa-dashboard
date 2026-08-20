function replaceOrThrow(context, code, search, replacement, label) {
  if (!code.includes(search)) {
    context.error(`Analytics score drivers patch could not find ${label}.`);
  }
  return code.replace(search, replacement);
}

export function analyticsScoreDriversPatch() {
  let patched = false;

  return {
    name: "analytics-score-drivers",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/SummaryMockup.tsx")) return null;

      let next = code;

      const helperCode = `
function cleanAnalyticsScoreDriverText(value: unknown, maxLength = 150) {
  const source = String(value || "")
    .split(/(?:ตัวอย่างที่เหมาะสม|เงื่อนไขที่ใช้หักคะแนนตามไฟล์|Process ที่ใช้เทียบ|Summary of Process)/i)[0]
    .replace(/[\\r\\n•▪●◦]+/g, " ")
    .replace(/\\s+/g, " ")
    .trim();

  if (!source) return "";

  const cleaned = source
    .replace(/^(?:จุดที่หักคือ|จุดที่ควรปรับ|ข้อควรปรับ|สิ่งที่ทำได้ดี|จุดเด่น|สาเหตุ|Issue)\\s*[:：-]?\\s*/i, "")
    .trim();

  const firstClause = cleaned
    .split(/(?:[.!?。;；]|\\s+(?:แต่|อย่างไรก็ตาม|อย่างไรก็ดี|เนื่องจาก|เพราะ|จึง|รวมถึง)\\s+)/)[0]
    .trim();

  const result = firstClause || cleaned;
  return result.length > maxLength
    ? result.slice(0, Math.max(1, maxLength - 1)).trimEnd() + "…"
    : result;
}

function getAnalyticsScoreDriverIntent(item: any) {
  return cleanAnalyticsScoreDriverText(
    item?.inquiryTh && item.inquiryTh !== "-"
      ? item.inquiryTh
      : item?.inquiryEn && item.inquiryEn !== "-"
        ? item.inquiryEn
        : "",
    110
  ) || "ไม่พบ Intent";
}

function getAnalyticsScoreDriverTopics(item: any) {
  return item?.reviewStatus === "Revised" && item?.revisedTopics?.length
    ? mergeTopicSet(item.topics || [], item.revisedTopics)
    : item?.topics || [];
}

function buildAnalyticsScoreDrivers(periodReports: any[]) {
  if (!Array.isArray(periodReports) || periodReports.length < 2) return [];

  return periodReports
    .map((report, index) => {
      if (index === 0) return null;

      const previous = periodReports[index - 1];
      const scoreDelta = Number(
        (Number(report?.avgScore || 0) - Number(previous?.avgScore || 0)).toFixed(2)
      );
      if (Math.abs(scoreDelta) < 0.005) return null;

      const direction = scoreDelta < 0 ? "down" : "up";
      const previousTopics = new Map(
        (previous?.topics || []).map((topic: any) => [String(topic.code || ""), topic])
      );

      let topicCandidates = (report?.topics || [])
        .map((topic: any) => {
          const previousTopic: any = previousTopics.get(String(topic.code || ""));
          if (!previousTopic) return null;
          const topicDelta = Number((Number(topic.pct || 0) - Number(previousTopic.pct || 0)).toFixed(2));
          return {
            code: String(topic.code || ""),
            label: String(topic.label || topic.code || "Topic"),
            currentPct: Number(topic.pct || 0),
            previousPct: Number(previousTopic.pct || 0),
            topicDelta,
          };
        })
        .filter(Boolean) as any[];

      const aligned = topicCandidates.filter((topic) =>
        direction === "down" ? topic.topicDelta < 0 : topic.topicDelta > 0
      );
      if (aligned.length) topicCandidates = aligned;

      topicCandidates.sort((a, b) =>
        direction === "down"
          ? a.topicDelta - b.topicDelta
          : b.topicDelta - a.topicDelta
      );

      const usedCaseIds = new Set<string>();
      const drivers = topicCandidates.slice(0, 5).reduce((rows: any[], topic: any) => {
        if (rows.length >= 3) return rows;

        const candidates = (report?.cases || [])
          .map((item: any) => {
            const matchedTopic = getAnalyticsScoreDriverTopics(item).find(
              (caseTopic: any) => String(caseTopic.code || "") === topic.code
            );
            if (!matchedTopic) return null;

            return {
              item,
              topicPct: Number(matchedTopic.pct || 0),
              issue: cleanAnalyticsScoreDriverText(matchedTopic.comment || "", 150),
            };
          })
          .filter(Boolean) as any[];

        candidates.sort((a, b) =>
          direction === "down"
            ? a.topicPct - b.topicPct
            : b.topicPct - a.topicPct
        );

        const representative =
          candidates.find((candidate) =>
            candidate.issue && !usedCaseIds.has(String(candidate.item?.caseId || ""))
          ) ||
          candidates.find((candidate) =>
            !usedCaseIds.has(String(candidate.item?.caseId || ""))
          ) ||
          candidates[0];

        if (!representative) return rows;

        const caseId = String(representative.item?.caseId || "-").trim() || "-";
        usedCaseIds.add(caseId);

        rows.push({
          topicCode: topic.code,
          topicLabel: topic.label,
          topicDelta: topic.topicDelta,
          currentPct: topic.currentPct,
          previousPct: topic.previousPct,
          caseId,
          caseScore: Number(representative.item?.finalScore || 0),
          intent: getAnalyticsScoreDriverIntent(representative.item),
          reason:
            representative.issue ||
            "ไม่พบรายละเอียด Issue/Comment ของหัวข้อนี้ในผลประเมิน",
        });

        return rows;
      }, []);

      return {
        period: String(report?.label || ""),
        previousPeriod: String(previous?.label || ""),
        scoreDelta,
        direction,
        drivers,
      };
    })
    .filter(Boolean);
}

`;

      next = replaceOrThrow(
        this,
        next,
        `function AnalyticsCompareTopicDetail({`,
        `${helperCode}function AnalyticsCompareTopicDetail({`,
        "compare component helper anchor"
      );

      next = replaceOrThrow(
        this,
        next,
        `  return (\n    <div data-analytics-topic-compare-v1="true" className="space-y-6">`,
        `  const scoreDrivers = buildAnalyticsScoreDrivers(periodReports);\n\n  return (\n    <div data-analytics-topic-compare-v1="true" className="space-y-6">`,
        "score driver calculation"
      );

      const explainerAnchor = `      <div className="rounded-2xl border border-violet-100 bg-violet-50/40 px-4 py-3 text-[10px] font-semibold leading-5 text-violet-800">\n        Difference แสดงการเปลี่ยนแปลงเป็น percentage point (pp) เทียบกับช่วงก่อนหน้าในลำดับ Compare • สีแดง = ต่ำกว่า Target • สีเขียว = ผ่าน Target\n      </div>\n\n      {topicGroups.map((group) => {`;

      const scoreDriversUi = `      <div className="rounded-2xl border border-violet-100 bg-violet-50/40 px-4 py-3 text-[10px] font-semibold leading-5 text-violet-800">\n        Difference แสดงการเปลี่ยนแปลงเป็น percentage point (pp) เทียบกับช่วงก่อนหน้าในลำดับ Compare • สีแดง = ต่ำกว่า Target • สีเขียว = ผ่าน Target\n      </div>\n\n      {scoreDrivers.length ? (\n        <section data-analytics-score-drivers-v1="true" className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">\n          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-4 sm:px-5">\n            <div>\n              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-600">Score Drivers</div>\n              <div className="mt-1 text-sm font-black text-slate-950">สาเหตุที่คะแนนเพิ่ม / ลด</div>\n              <div className="mt-1 text-[10px] font-semibold text-slate-500">หยิบเคสตัวแทนจาก Topic ที่เปลี่ยนเด่นที่สุด พร้อม Intent และประเด็นจากผลประเมิน</div>\n            </div>\n            <div className="rounded-full bg-violet-50 px-3 py-1.5 text-[9px] font-black text-violet-700">สูงสุด 3 ประเด็น / ช่วง</div>\n          </div>\n\n          <div className="divide-y divide-slate-100">\n            {scoreDrivers.map((driver: any) => (\n              <div key={driver.period} className="px-4 py-5 sm:px-5">\n                <div className="flex flex-wrap items-center justify-between gap-3">\n                  <div>\n                    <div className="text-[11px] font-black text-slate-900">{driver.period}</div>\n                    <div className="mt-1 text-[9px] font-semibold text-slate-500">เทียบกับ {driver.previousPeriod}</div>\n                  </div>\n                  <div className={\"rounded-xl px-3 py-2 text-right \" + (driver.direction === \"down\" ? \"bg-rose-50 text-rose-700\" : \"bg-emerald-50 text-emerald-700\")}>\n                    <div className="text-[9px] font-bold">{driver.direction === "down" ? "คะแนนลดลง" : "คะแนนเพิ่มขึ้น"}</div>\n                    <div className="text-base font-black">{driver.scoreDelta > 0 ? "+" : ""}{driver.scoreDelta.toFixed(2)} pp</div>\n                  </div>\n                </div>\n\n                {driver.drivers.length ? (\n                  <div className="mt-4 grid gap-3 xl:grid-cols-3">\n                    {driver.drivers.map((item: any) => (\n                      <article key={driver.period + "-" + item.topicCode + "-" + item.caseId} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">\n                        <div className="flex items-start justify-between gap-3">\n                          <div className="min-w-0">\n                            <div className="text-[9px] font-black uppercase tracking-[0.12em] text-violet-600">Topic {item.topicCode}</div>\n                            <div className="mt-1 line-clamp-2 text-[11px] font-bold leading-5 text-slate-900">{item.topicLabel}</div>\n                          </div>\n                          <span className={\"shrink-0 rounded-full px-2 py-1 text-[9px] font-black \" + (item.topicDelta < 0 ? \"bg-rose-100 text-rose-700\" : \"bg-emerald-100 text-emerald-700\")}>\n                            {item.topicDelta > 0 ? "+" : ""}{item.topicDelta.toFixed(2)} pp\n                          </span>\n                        </div>\n\n                        <div className="mt-3 rounded-xl bg-white px-3 py-2.5">\n                          <div className="flex flex-wrap items-center justify-between gap-2">\n                            <span className="text-[10px] font-black text-slate-900">Case {item.caseId}</span>\n                            <span className="text-[9px] font-bold text-slate-500">Case Score {item.caseScore.toFixed(2)}</span>\n                          </div>\n                          <div className="mt-2 text-[9px] font-black uppercase tracking-wide text-slate-400">Intent</div>\n                          <div className="mt-0.5 text-[10px] font-semibold leading-5 text-slate-700">{item.intent}</div>\n                          <div className="mt-2 text-[9px] font-black uppercase tracking-wide text-slate-400">ประเด็นจากผลประเมิน</div>\n                          <div className="mt-0.5 text-[10px] font-semibold leading-5 text-slate-700">{item.reason}</div>\n                        </div>\n                      </article>\n                    ))}\n                  </div>\n                ) : (\n                  <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-[10px] font-semibold text-slate-400">ไม่พบ Topic ที่สามารถจับคู่เพื่ออธิบายการเปลี่ยนแปลงได้</div>\n                )}\n              </div>\n            ))}\n          </div>\n        </section>\n      ) : null}\n\n      {topicGroups.map((group) => {`;

      next = replaceOrThrow(
        this,
        next,
        explainerAnchor,
        scoreDriversUi,
        "score drivers UI anchor"
      );

      const pdfAnchor = `    periodTopicReports.forEach((report, reportIndex) => {`;
      const pdfBlock = `    if (isComparisonMode) {\n      const scoreDriverReports = buildAnalyticsScoreDrivers(periodTopicReports);\n\n      if (scoreDriverReports.length) {\n        startNewPage();\n        drawSectionTitle(\n          "Score Drivers — Why Scores Changed",\n          "Representative cases from the Topics with the largest movement vs the previous period"\n        );\n\n        scoreDriverReports.forEach((driver: any, driverIndex: number) => {\n          ensureSpace(22);\n\n          if (driverIndex > 0) y += 4;\n\n          const isDown = driver.direction === "down";\n          doc.setFillColor(isDown ? 255 : 236, isDown ? 241 : 253, isDown ? 242 : 245);\n          doc.setDrawColor(isDown ? 254 : 167, isDown ? 205 : 243, isDown ? 211 : 208);\n          doc.roundedRect(margin, y, contentWidth, 14, 2.5, 2.5, "FD");\n          doc.setFont("helvetica", "bold");\n          doc.setFontSize(8);\n          doc.setTextColor(isDown ? 190 : 4, isDown ? 24 : 120, isDown ? 93 : 87);\n          drawText(driver.period, margin + 4, y + 6);\n          drawText(\n            (isDown ? "Down " : "Up ") + (driver.scoreDelta > 0 ? "+" : "") + driver.scoreDelta.toFixed(2) + " pp",\n            pageWidth - margin - 4,\n            y + 6,\n            { align: "right" }\n          );\n          doc.setFont("helvetica", "normal");\n          doc.setFontSize(5.8);\n          doc.setTextColor(100, 116, 139);\n          drawText("vs " + driver.previousPeriod, margin + 4, y + 11);\n          y += 18;\n\n          driver.drivers.forEach((item: any, itemIndex: number) => {\n            const intentLines = wrapText("Intent: " + item.intent, 82, 2);\n            const reasonLines = wrapText("Reason: " + item.reason, 82, 2);\n            const rowHeight = Math.max(20, 12 + (intentLines.length + reasonLines.length) * 3.2);\n            ensureSpace(rowHeight + 3);\n\n            doc.setFillColor(itemIndex % 2 === 0 ? 255 : 248, itemIndex % 2 === 0 ? 255 : 250, 252);\n            doc.setDrawColor(226, 232, 240);\n            doc.roundedRect(margin, y, contentWidth, rowHeight, 2, 2, "FD");\n\n            doc.setFont("helvetica", "bold");\n            doc.setFontSize(6.7);\n            doc.setTextColor(15, 23, 42);\n            drawText(\n              "Topic " + item.topicCode + " · " + item.topicLabel,\n              margin + 4,\n              y + 5.5\n            );\n\n            doc.setTextColor(item.topicDelta < 0 ? 190 : 5, item.topicDelta < 0 ? 24 : 150, item.topicDelta < 0 ? 93 : 105);\n            drawText(\n              (item.topicDelta > 0 ? "+" : "") + item.topicDelta.toFixed(2) + " pp",\n              pageWidth - margin - 4,\n              y + 5.5,\n              { align: "right" }\n            );\n\n            doc.setFont("helvetica", "bold");\n            doc.setFontSize(5.8);\n            doc.setTextColor(76, 29, 149);\n            drawText(\n              "Case " + item.caseId + " · Case Score " + item.caseScore.toFixed(2),\n              margin + 4,\n              y + 10\n            );\n\n            doc.setFont("helvetica", "normal");\n            doc.setFontSize(5.5);\n            doc.setTextColor(51, 65, 85);\n            let textY = y + 14;\n            intentLines.forEach((line: string) => {\n              drawText(line, margin + 4, textY);\n              textY += 3.2;\n            });\n            reasonLines.forEach((line: string) => {\n              drawText(line, margin + 4, textY);\n              textY += 3.2;\n            });\n\n            y += rowHeight + 3;\n          });\n        });\n\n        y += 4;\n      }\n    }\n\n    periodTopicReports.forEach((report, reportIndex) => {`;

      next = replaceOrThrow(
        this,
        next,
        pdfAnchor,
        pdfBlock,
        "score drivers PDF anchor"
      );

      patched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!patched) this.error("Analytics score drivers patch was not applied.");
    },
  };
}
