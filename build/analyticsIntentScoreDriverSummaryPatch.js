function replaceOrThrow(context, code, search, replacement, label) {
  if (!code.includes(search)) {
    context.error(`Analytics intent score driver summary patch could not find ${label}.`);
  }
  return code.replace(search, replacement);
}

export function analyticsIntentScoreDriverSummaryPatch() {
  let patched = false;

  return {
    name: "analytics-intent-score-driver-summary",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/SummaryMockup.tsx")) return null;

      let next = code;

      const managementCode = String.raw`
function getManagementDriverCauseCandidates(commentValue: unknown, topicLabelValue: unknown, direction: "down" | "up") {
  const comment = sanitizeAnalyticsScoreDriverValue(commentValue);
  const topicLabel = sanitizeAnalyticsScoreDriverValue(topicLabelValue);
  const combined = (comment + " " + topicLabel).toLowerCase();
  const rows: Array<{ key: string; label: string }> = [];
  const add = (key: string, label: string) => {
    if (!rows.some((row) => row.key === key)) rows.push({ key, label });
  };

  if (direction === "down") {
    if (/(first\s*response|ตอบครั้งแรก|ตอบแรก)/i.test(combined) && /(5\s*นาที|5\s*min|เกิน|ล่าช้า|ช้า)/i.test(combined)) {
      add("sla-first", "First Response เกิน 5 นาที");
    }
    if (/(reply|ตอบระหว่าง|ตอบกลับ)/i.test(combined) && /(2\s*นาที|2\s*min|เกิน|ล่าช้า|ช้า)/i.test(combined)) {
      add("sla-reply", "Reply ระหว่างแชทเกิน 2 นาที");
    }
    if (/(close|closing|ปิดเคส|จบการสนทนา|ปิดการสนทนา)/i.test(combined) && /(4\s*นาที|4\s*min|เกิน|ล่าช้า|ช้า)/i.test(combined)) {
      add("sla-close", "ปิดเคสเกิน 4 นาที");
    }
    if (/(sla|ตอบช้า|ล่าช้า|เกินเวลา)/i.test(combined) && !rows.some((row) => row.key.startsWith("sla-"))) {
      add("sla", "SLA เกินเกณฑ์");
    }
    if (/(สะกด|คำผิด|พิมพ์ผิด|spelling|grammar)/i.test(combined)) {
      add("spelling", "สะกดคำหรือพิมพ์ข้อความผิด");
    }
    if (/(greeting|opening|ทักทาย|เปิดการสนทนา|แนะนำตัว)/i.test(combined) && /(ไม่|ขาด|ผิด|ไม่ครบ|ตกหล่น)/i.test(combined)) {
      add("greeting", "Greeting / Opening ไม่ครบตามมาตรฐาน");
    }
    if (/(closing|ปิดการสนทนา|จบการสนทนา)/i.test(combined) && /(ไม่|ขาด|ผิด|ไม่ครบ|ตกหล่น)/i.test(combined)) {
      add("closing", "Closing ไม่ครบตามมาตรฐาน");
    }
    if (/(verify|verification|pdpa|ยืนยันข้อมูล|ตรวจสอบข้อมูล|พิสูจน์ตัวตน)/i.test(combined) && /(ไม่|ขาด|ผิด|ไม่ครบ|ตกหล่น)/i.test(combined)) {
      add("verification", "Verification / PDPA ไม่ครบตามเกณฑ์");
    }
    if (/(case\s*note|case\s*logging|tag|status\s*accuracy|บันทึกเคส|เคสโน้ต|สถานะเคส|ใส่แท็ก|แท็ก)/i.test(combined) && /(ไม่|ขาด|ผิด|ไม่ครบ|ตกหล่น)/i.test(combined)) {
      add("logging", "Case Note / Tag / Status ไม่ครบหรือไม่ถูกต้อง");
    }
    if (/(follow[- ]?up|next\s*step|ownership|ติดตาม|ขั้นตอนถัดไป|สรุปผล|ดูแลเคส)/i.test(combined) && /(ไม่|ขาด|ผิด|ไม่ครบ|ตกหล่น|ไม่ได้)/i.test(combined)) {
      add("followup", "Follow-up / Next Step ไม่ครบ");
    }
    if (/(answer|accuracy|analysis|คำตอบ|วิเคราะห์|ข้อมูล)/i.test(combined) && /(ไม่ถูก|ผิด|ไม่ครบ|ขาด|คลาดเคลื่อน|ไม่ชัด)/i.test(combined)) {
      add("answer", "คำตอบหรือการวิเคราะห์ไม่ถูกต้อง/ไม่ครบถ้วน");
    }
    if (/(process|policy|ขั้นตอน|กระบวนการ|นโยบาย|ปฏิบัติตาม)/i.test(combined) && /(ไม่|ขาด|ผิด|ไม่ครบ|ตกหล่น|ไม่ได้)/i.test(combined)) {
      add("process", "ทำงานไม่ครบตาม Process / Policy");
    }
    if (/(communication|tone|empathy|น้ำเสียง|สุภาพ|การสื่อสาร)/i.test(combined) && /(ไม่|ขาด|ผิด|ไม่ครบ|ไม่เหมาะ)/i.test(combined)) {
      add("communication", "การสื่อสารหรือน้ำเสียงไม่เป็นไปตามเกณฑ์");
    }

    return rows;
  }

  if (/(sla|response\s*time|reply|close\s*time|ตอบ.*เวลา|ตามเวลา)/i.test(combined) && /(ผ่าน|ตาม|ไม่เกิน|ทัน|within)/i.test(combined)) {
    add("sla", "ตอบและดำเนินการได้ตาม SLA");
  }
  if (/(process|policy|ขั้นตอน|กระบวนการ|นโยบาย|ปฏิบัติตาม)/i.test(combined) && /(ถูกต้อง|ครบ|ผ่าน|เหมาะสม|ตาม)/i.test(combined)) {
    add("process", "ทำงานตาม Process / Policy ได้ครบขึ้น");
  }
  if (/(follow[- ]?up|next\s*step|ownership|ติดตาม|ขั้นตอนถัดไป|สรุปผล|ดูแลเคส)/i.test(combined) && /(ถูกต้อง|ครบ|ผ่าน|เหมาะสม|ชัดเจน)/i.test(combined)) {
    add("followup", "Follow-up / Next Step ครบขึ้น");
  }
  if (/(answer|accuracy|analysis|คำตอบ|วิเคราะห์|ข้อมูล)/i.test(combined) && /(ถูกต้อง|ครบ|ผ่าน|ชัดเจน|เหมาะสม)/i.test(combined)) {
    add("answer", "คำตอบและการวิเคราะห์ถูกต้องครบถ้วนขึ้น");
  }
  if (/(communication|tone|empathy|น้ำเสียง|สุภาพ|การสื่อสาร|ภาษา)/i.test(combined) && /(ถูกต้อง|ครบ|ผ่าน|ชัดเจน|เหมาะสม|สุภาพ)/i.test(combined)) {
    add("communication", "การสื่อสารชัดเจนและเหมาะสมขึ้น");
  }
  if (/(greeting|opening|closing|ทักทาย|เปิดการสนทนา|ปิดการสนทนา)/i.test(combined) && /(ถูกต้อง|ครบ|ผ่าน|ตามมาตรฐาน)/i.test(combined)) {
    add("greeting-closing", "Greeting / Closing ครบตามมาตรฐานขึ้น");
  }
  if (/(verify|verification|pdpa|ยืนยันข้อมูล|ตรวจสอบข้อมูล)/i.test(combined) && /(ถูกต้อง|ครบ|ผ่าน|ตามเกณฑ์)/i.test(combined)) {
    add("verification", "Verification / PDPA ครบตามเกณฑ์ขึ้น");
  }

  return rows;
}

function getManagementDriverFallbackCause(topicLabelValue: unknown, direction: "down" | "up") {
  const topicLabel = sanitizeAnalyticsScoreDriverValue(topicLabelValue);
  const normalized = topicLabel.toLowerCase();
  if (direction === "down") {
    return { key: "unclear", label: "ไม่พบจุดที่หักที่ระบุชัดเจนในผลประเมิน" };
  }
  if (/(process|policy|ขั้นตอน|กระบวนการ)/i.test(normalized)) return { key: "process", label: "ผลด้าน Process / Policy ดีขึ้น" };
  if (/(answer|analysis|คำตอบ|วิเคราะห์)/i.test(normalized)) return { key: "answer", label: "ผลด้านคำตอบและการวิเคราะห์ดีขึ้น" };
  if (/(case handling|follow|ติดตาม|ดูแลเคส)/i.test(normalized)) return { key: "followup", label: "ผลด้าน Case Handling / Follow-up ดีขึ้น" };
  if (/(communication|สื่อสาร|ภาษา)/i.test(normalized)) return { key: "communication", label: "ผลด้านการสื่อสารดีขึ้น" };
  return { key: "topic-improved", label: (topicLabel || "หัวข้อนี้") + " มีผลดีขึ้น" };
}

function buildAnalyticsIntentDriverSummary(periodReports: any[]) {
  if (!Array.isArray(periodReports) || periodReports.length < 2) return [];

  return periodReports
    .map((report, reportIndex) => {
      if (reportIndex === 0) return null;
      const previous = periodReports[reportIndex - 1];
      const previousTopics = new Map(
        (previous?.topics || []).map((topic: any) => [String(topic.code || ""), topic])
      );

      const topicRows = (report?.topics || [])
        .map((topic: any) => {
          const previousTopic: any = previousTopics.get(String(topic.code || ""));
          if (!previousTopic) return null;
          const delta = Number((Number(topic.pct || 0) - Number(previousTopic.pct || 0)).toFixed(2));
          if (Math.abs(delta) < 0.005) return null;
          const direction: "down" | "up" = delta < 0 ? "down" : "up";
          const causeMap = new Map<string, any>();
          const relevantIntents: string[] = [];

          (report?.cases || []).forEach((caseItem: any) => {
            const matchedTopic = getAnalyticsScoreDriverTopics(caseItem).find(
              (caseTopic: any) => String(caseTopic.code || "") === String(topic.code || "")
            );
            if (!matchedTopic) return;

            const intent = compactAnalyticsScoreDriverIntent(getAnalyticsScoreDriverIntent(caseItem));
            const topicPct = Number(matchedTopic.pct || 0);
            const comment = matchedTopic.comment || "";
            let causes = getManagementDriverCauseCandidates(comment, topic.label, direction);

            const shouldUseCase = direction === "down"
              ? topicPct < 100 || causes.length > 0
              : topicPct >= Number(topic.pct || 0) || causes.length > 0;
            if (!shouldUseCase) return;

            if (!causes.length && direction === "up" && topicPct >= 85) {
              causes = [getManagementDriverFallbackCause(topic.label, direction)];
            }

            causes.forEach((cause) => {
              if (!causeMap.has(cause.key)) {
                causeMap.set(cause.key, {
                  key: cause.key,
                  label: cause.label,
                  count: 0,
                  intents: [],
                });
              }
              const bucket = causeMap.get(cause.key);
              bucket.count += 1;
              if (intent && intent !== "ไม่พบ Intent" && !bucket.intents.includes(intent)) {
                bucket.intents.push(intent);
              }
            });

            if (intent && intent !== "ไม่พบ Intent" && !relevantIntents.includes(intent)) {
              relevantIntents.push(intent);
            }
          });

          if (!causeMap.size) {
            const fallback = getManagementDriverFallbackCause(topic.label, direction);
            causeMap.set(fallback.key, {
              key: fallback.key,
              label: fallback.label,
              count: 0,
              intents: relevantIntents,
            });
          }

          const causes = Array.from(causeMap.values())
            .sort((a: any, b: any) => b.count - a.count)
            .slice(0, 3)
            .map((cause: any) => ({
              ...cause,
              intents: cause.intents.slice(0, 3),
            }));

          return {
            code: String(topic.code || ""),
            label: String(topic.label || topic.code || "Topic"),
            previousPct: Number(previousTopic.pct || 0),
            currentPct: Number(topic.pct || 0),
            delta,
            direction,
            causes,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => Math.abs(b.delta) - Math.abs(a.delta));

      return {
        period: String(report?.label || ""),
        previousPeriod: String(previous?.label || ""),
        overallDelta: Number((Number(report?.avgScore || 0) - Number(previous?.avgScore || 0)).toFixed(2)),
        topics: topicRows,
      };
    })
    .filter(Boolean);
}

function AnalyticsIntentDriverSummary({ rows }: { rows: any[] }) {
  return null;

  if (!rows.length) return null;

  return (
    <section data-analytics-intent-driver-summary-v1="true" className="overflow-hidden rounded-[20px] border border-slate-300 bg-slate-50/70 shadow-[0_6px_18px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div>
          <div className="text-sm font-bold text-slate-950">ปัจจัยที่มีผลต่อคะแนน</div>
          <div className="mt-0.5 text-[10px] font-medium text-slate-500">หัวข้อที่เปลี่ยน พร้อมเหตุผลและ Intent ที่เกี่ยวข้อง</div>
        </div>
        <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[9px] font-bold text-violet-700">Topic comparison</span>
      </div>

      <div className="divide-y divide-slate-200">
        {rows.map((periodRow: any) => (
          <div key={periodRow.period} className="px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <div className="text-[11px] font-bold text-slate-900">{periodRow.period}</div>
                <div className="text-[9px] font-medium text-slate-500">เทียบกับ {periodRow.previousPeriod}</div>
              </div>
              <span className={"rounded-full px-3 py-1.5 text-[10px] font-bold " + (periodRow.overallDelta < 0 ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700")}>
                Overall {periodRow.overallDelta > 0 ? "+" : ""}{periodRow.overallDelta.toFixed(2)} pp
              </span>
            </div>

            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="hidden grid-cols-[minmax(220px,1.2fr)_110px_minmax(300px,1.8fr)] gap-4 bg-slate-900 px-4 py-2.5 text-[9px] font-bold uppercase tracking-wide text-slate-200 lg:grid">
                <span>Topic</span><span>Change</span><span>Reason &amp; Intent</span>
              </div>
              {periodRow.topics.map((topic: any) => (
                <div key={periodRow.period + "-" + topic.code} className="grid gap-3 border-t border-slate-100 px-4 py-3 first:border-t-0 lg:grid-cols-[minmax(220px,1.2fr)_110px_minmax(300px,1.8fr)] lg:gap-4">
                  <div className="min-w-0">
                    <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-violet-600">Topic {topic.code}</div>
                    <div className="mt-0.5 text-[11px] font-bold leading-5 text-slate-900">{topic.label}</div>
                    <div className="mt-0.5 text-[9px] font-medium text-slate-500">{topic.previousPct.toFixed(2)}% → {topic.currentPct.toFixed(2)}%</div>
                  </div>
                  <div className="flex items-start lg:pt-1">
                    <span className={"rounded-full px-2.5 py-1 text-[9px] font-bold " + (topic.direction === "down" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700")}>
                      {topic.direction === "down" ? "" : "+"}{topic.delta.toFixed(2)} pp
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {topic.causes.map((cause: any) => (
                      <div key={topic.code + "-" + cause.key} className="text-[10px] font-medium leading-5 text-slate-600">
                        <span className={"font-bold " + (topic.direction === "down" ? "text-rose-700" : "text-emerald-700")}>
                          {cause.label}{cause.count > 0 ? " · " + cause.count + " เคส" : ""}
                        </span>
                        <span className="text-slate-400"> — </span>
                        <span>Intent: {cause.intents.length ? cause.intents.join(" · ") : "ไม่พบข้อมูล"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

`;

      next = replaceOrThrow(
        this,
        next,
        `function AnalyticsCompareTopicDetail({`,
        `${managementCode}function AnalyticsCompareTopicDetail({`,
        "management summary helper/component anchor"
      );

      next = replaceOrThrow(
        this,
        next,
        `  const scoreDrivers = buildAnalyticsScoreDrivers(periodReports);`,
        `  const scoreDrivers = buildAnalyticsScoreDrivers(periodReports);\n  const intentDriverSummary = buildAnalyticsIntentDriverSummary(periodReports);`,
        "management summary calculation"
      );

      next = replaceOrThrow(
        this,
        next,
        `      {scoreDrivers.length ? (`,
        `      {intentDriverSummary.length ? (\n        <AnalyticsIntentDriverSummary rows={intentDriverSummary} />\n      ) : null}\n\n      {scoreDrivers.length ? (`,
        "management summary UI insertion"
      );

      next = replaceOrThrow(
        this,
        next,
        `<section data-analytics-score-drivers-v1="true" className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">`,
        `<section data-analytics-score-drivers-v1="true" className="hidden overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">`,
        "hide legacy case-level score drivers"
      );

      const pdfReplacement = String.raw`const managementScoreDriverReports = buildAnalyticsIntentDriverSummary(periodTopicReports);
      const scoreDriverReports: any[] = [];

      if (managementScoreDriverReports.length) {
        startNewPage();
        drawSectionTitle(
          "Score Factors",
          "Topic movement, key reasons and related Intent groups"
        );

        managementScoreDriverReports.forEach((periodRow: any, periodIndex: number) => {
          ensureSpace(18);
          if (periodIndex > 0) y += 4;

          const periodDown = periodRow.overallDelta < 0;
          doc.setFillColor(periodDown ? 255 : 236, periodDown ? 241 : 253, periodDown ? 242 : 245);
          doc.setDrawColor(periodDown ? 254 : 167, periodDown ? 205 : 243, periodDown ? 211 : 208);
          doc.roundedRect(margin, y, contentWidth, 13, 2.5, 2.5, "FD");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(periodDown ? 190 : 4, periodDown ? 24 : 120, periodDown ? 93 : 87);
          drawText(periodRow.period, margin + 4, y + 5.5);
          drawText(
            (periodRow.overallDelta > 0 ? "+" : "") + periodRow.overallDelta.toFixed(2) + " pp",
            pageWidth - margin - 4,
            y + 5.5,
            { align: "right" }
          );
          doc.setFont("helvetica", "normal");
          doc.setFontSize(5.5);
          doc.setTextColor(100, 116, 139);
          drawText("vs " + periodRow.previousPeriod, margin + 4, y + 10.2);
          y += 17;

          periodRow.topics.forEach((topic: any) => {
            const titleLines = wrapText(
              "Topic " + topic.code + " - " + topic.label + "  " + (topic.delta > 0 ? "+" : "") + topic.delta.toFixed(2) + " pp",
              88,
              2
            );
            const causeLineCount = topic.causes.reduce((sum: number, cause: any) => {
              const causeLines = wrapText((topic.direction === "down" ? "Cause: " : "Improvement: ") + cause.label, 90, 2);
              const intentLines = wrapText("Intent: " + (cause.intents.length ? cause.intents.join(" / ") : "Not clearly specified"), 90, 2);
              return sum + causeLines.length + intentLines.length;
            }, 0);
            const rowHeight = Math.max(18, 8 + titleLines.length * 3.4 + causeLineCount * 3.1);
            ensureSpace(rowHeight + 3);

            doc.setFillColor(250, 250, 252);
            doc.setDrawColor(226, 232, 240);
            doc.roundedRect(margin, y, contentWidth, rowHeight, 2, 2, "FD");

            doc.setFont("helvetica", "bold");
            doc.setFontSize(6.6);
            doc.setTextColor(topic.direction === "down" ? 190 : 4, topic.direction === "down" ? 24 : 120, topic.direction === "down" ? 93 : 87);
            titleLines.forEach((line: string, lineIndex: number) => {
              drawText(line, margin + 4, y + 5 + lineIndex * 3.4);
            });

            let lineY = y + 6 + titleLines.length * 3.4;
            topic.causes.forEach((cause: any) => {
              doc.setFont("helvetica", "bold");
              doc.setFontSize(5.8);
              doc.setTextColor(51, 65, 85);
              const causeLines = wrapText((topic.direction === "down" ? "Cause: " : "Improvement: ") + cause.label, 90, 2);
              causeLines.forEach((line: string) => {
                drawText(line, margin + 5, lineY);
                lineY += 3.1;
              });

              doc.setFont("helvetica", "normal");
              doc.setFontSize(5.5);
              doc.setTextColor(100, 116, 139);
              const intentLines = wrapText("Intent: " + (cause.intents.length ? cause.intents.join(" / ") : "Not clearly specified"), 90, 2);
              intentLines.forEach((line: string) => {
                drawText(line, margin + 5, lineY);
                lineY += 3.1;
              });
            });

            y += rowHeight + 3;
          });
        });
      }`;

      next = replaceOrThrow(
        this,
        next,
        `const scoreDriverReports = buildAnalyticsScoreDrivers(periodTopicReports);`,
        pdfReplacement,
        "management summary PDF replacement"
      );

      patched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!patched) this.error("Analytics intent score driver summary patch was not applied.");
    },
  };
}
