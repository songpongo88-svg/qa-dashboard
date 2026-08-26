function replaceOrThrow(context, code, search, replacement, label) {
  if (!code.includes(search)) {
    context.error(`Analytics bilingual topic PDF patch could not find ${label}.`);
  }
  return code.replace(search, replacement);
}

export function analyticsBilingualTopicPdfPatch() {
  let patched = false;

  return {
    name: "analytics-bilingual-topic-pdf",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/SummaryMockup.tsx")) return null;

      let next = code;

      next = replaceOrThrow(
        this,
        next,
        `        group.topics.forEach((topic: any, topicIndex: number) => {
          const topicLines = wrapText(topic.code + ". " + topic.label, 34, 2);
          const rowHeight = Math.max(13, 4 + topicLines.length * 3.6);`,
        `        group.topics.forEach((topic: any, topicIndex: number) => {
          const topicTitle = splitAnalyticsTopicTitle(String(topic.label || topic.code || "Topic"));
          const thaiTopicLines = wrapText(topic.code + ". " + topicTitle.thai, 30, 2);
          const englishTopicLines = topicTitle.english ? wrapText(topicTitle.english, 30, 2) : [];
          const rowHeight = Math.max(
            15,
            4 + thaiTopicLines.length * 3.4 + englishTopicLines.length * 3.1
          );`,
        "comparison matrix topic sizing"
      );

      next = replaceOrThrow(
        this,
        next,
        `          doc.setFont("helvetica", "normal");
          doc.setFontSize(5.8);
          doc.setTextColor(51, 65, 85);
          topicLines.forEach((line: string, lineIndex: number) => {
            drawText(line, margin + 3, y + 5 + lineIndex * 3.6);
          });`,
        `          doc.setFont("helvetica", "bold");
          doc.setFontSize(5.7);
          doc.setTextColor(15, 23, 42);
          thaiTopicLines.forEach((line: string, lineIndex: number) => {
            drawText(line, margin + 3, y + 4.8 + lineIndex * 3.4);
          });

          if (englishTopicLines.length) {
            doc.setFont("helvetica", "italic");
            doc.setFontSize(5);
            doc.setTextColor(225, 29, 72);
            englishTopicLines.forEach((line: string, lineIndex: number) => {
              drawText(
                line,
                margin + 3,
                y + 4.8 + thaiTopicLines.length * 3.4 + lineIndex * 3.1
              );
            });
          }`,
        "comparison matrix bilingual topic drawing"
      );

      next = replaceOrThrow(
        this,
        next,
        `              drawText("No Data", centerX, y + 7, { align: "center" });`,
        `              drawText("No Data", centerX, y + rowHeight / 2 + 1.5, { align: "center" });`,
        "comparison matrix no-data alignment"
      );

      next = replaceOrThrow(
        this,
        next,
        `              centerX,
              y + 5.5,
              { align: "center" }
            );

            doc.setFontSize(5);`,
        `              centerX,
              y + rowHeight / 2 - 0.2,
              { align: "center" }
            );

            doc.setFontSize(5);`,
        "comparison matrix score alignment"
      );

      next = replaceOrThrow(
        this,
        next,
        `              centerX,
              y + 10,
              { align: "center" }
            );`,
        `              centerX,
              y + rowHeight / 2 + 4.1,
              { align: "center" }
            );`,
        "comparison matrix difference alignment"
      );

      next = replaceOrThrow(
        this,
        next,
        `          periodRow.topics.forEach((topic: any) => {
            const titleLines = wrapText(
              "Topic " + topic.code + " - " + topic.label + "  " + (topic.delta > 0 ? "+" : "") + topic.delta.toFixed(2) + " pp",
              88,
              2
            );`,
        `          periodRow.topics.forEach((topic: any) => {
            const topicTitle = splitAnalyticsTopicTitle(String(topic.label || topic.code || "Topic"));
            const thaiTitleLines = wrapText("Topic " + topic.code + " - " + topicTitle.thai, 80, 2);
            const englishTitleLines = topicTitle.english ? wrapText(topicTitle.english, 88, 1) : [];`,
        "score factors bilingual title preparation"
      );

      next = replaceOrThrow(
        this,
        next,
        `            const rowHeight = Math.max(18, 8 + titleLines.length * 3.4 + causeLineCount * 3.1);`,
        `            const titleBlockHeight = thaiTitleLines.length * 3.4 + englishTitleLines.length * 3.1;
            const rowHeight = Math.max(20, 10 + titleBlockHeight + causeLineCount * 3.1);`,
        "score factors row sizing"
      );

      next = replaceOrThrow(
        this,
        next,
        `            doc.setFont("helvetica", "bold");
            doc.setFontSize(6.6);
            doc.setTextColor(topic.direction === "down" ? 190 : 4, topic.direction === "down" ? 24 : 120, topic.direction === "down" ? 93 : 87);
            titleLines.forEach((line: string, lineIndex: number) => {
              drawText(line, margin + 4, y + 5 + lineIndex * 3.4);
            });

            let lineY = y + 6 + titleLines.length * 3.4;`,
        `            doc.setFont("helvetica", "bold");
            doc.setFontSize(6.6);
            doc.setTextColor(15, 23, 42);
            thaiTitleLines.forEach((line: string, lineIndex: number) => {
              drawText(line, margin + 4, y + 5 + lineIndex * 3.4);
            });

            if (englishTitleLines.length) {
              doc.setFont("helvetica", "italic");
              doc.setFontSize(5.8);
              doc.setTextColor(225, 29, 72);
              englishTitleLines.forEach((line: string, lineIndex: number) => {
                drawText(
                  line,
                  margin + 4,
                  y + 5 + thaiTitleLines.length * 3.4 + lineIndex * 3.1
                );
              });
            }

            doc.setFont("helvetica", "bold");
            doc.setFontSize(6.2);
            doc.setTextColor(
              topic.direction === "down" ? 190 : 4,
              topic.direction === "down" ? 24 : 120,
              topic.direction === "down" ? 93 : 87
            );
            drawText(
              (topic.delta > 0 ? "+" : "") + topic.delta.toFixed(2) + " pp",
              pageWidth - margin - 4,
              y + 5,
              { align: "right" }
            );

            let lineY = y + 7 + titleBlockHeight;`,
        "score factors bilingual title drawing"
      );

      patched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!patched) this.error("Analytics bilingual topic PDF patch was not applied.");
    },
  };
}
