useEffect(() => {
 const loadWorkbook = async () => {
   try {
     setIsLoading(true);
     setLoadError("");
     const response = await fetch("/QA_RawData1.xlsx");
     if (!response.ok) {
       throw new Error("ไม่พบไฟล์ QA_RawData1.xlsx ในโฟลเดอร์ public");
     }
     const buffer = await response.arrayBuffer();
     const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
     const sheet = workbook.Sheets["Raw_Data"] || workbook.Sheets[workbook.SheetNames[0]];
     const rows = XLSX.utils.sheet_to_json<any[]>(sheet, {
       header: 1,
       defval: null,
       raw: true,
     });
     const normalizeHeader = (value: unknown) =>
       String(value ?? "")
         .replace(/\u00A0/g, " ")
         .replace(/\s+/g, " ")
         .trim()
         .toLowerCase();
     const findHeaderRowIndex = () => {
       for (let i = 0; i < rows.length; i++) {
         const row = (rows[i] || []) as any[];
         const normalized = row.map(normalizeHeader);
         const hasAgent = normalized.includes("agent name");
         const hasCaseId = normalized.includes("case id");
         if (hasAgent && hasCaseId) return i;
       }
       return -1;
     };
     const headerIndex = findHeaderRowIndex();
     if (headerIndex === -1) {
       throw new Error("ไม่พบแถว Header ในไฟล์ Excel");
     }
     const headerRow = ((rows[headerIndex] || []) as any[]).map((h) => String(h ?? "").trim());
     const dataRows = rows.slice(headerIndex + 1);
     const col = (name: string) => {
       const target = normalizeHeader(name);
       return headerRow.findIndex((h) => normalizeHeader(h) === target);
     };
     const getValue = (row: any[], name: string) => {
       const idx = col(name);
       return idx >= 0 ? row[idx] : null;
     };
     const mapped: CaseItem[] = dataRows
       .filter((row) => {
         return row && getValue(row, "Agent Name") && getValue(row, "Case ID");
       })
       .map((row, index) => {
         const topics: Topic[] = TOPIC_MASTER.map((topic) => {
           const scoreVal = Number(getValue(row, `${topic.code} Score`) || 0);
           const score = Number.isFinite(scoreVal) ? scoreVal : 0;
           const commentVal = getValue(row, `${topic.code} Comment`);
           return {
             code: topic.code,
             label: topic.label,
             score,
             max: topic.max,
             pct: topic.max > 0 ? Math.round((score / topic.max) * 100) : 0,
             comment: commentVal ? String(commentVal).trim() : "",
           };
         });
         const finalScoreVal =
           Number(getValue(row, "Final Score")) ||
           topics.reduce((sum, topic) => sum + topic.score, 0);
         const inquiry =
           getValue(row, "Customer Inquiry") ??
           getValue(row, "Inquiry TH") ??
           getValue(row, "Inquiry");
         const weekLabel =
           getValue(row, "Week Label") ??
           getValue(row, "Week") ??
           "-";
         const caseUrl =
           getValue(row, "Case URL") ??
           getValue(row, "Case Url") ??
           getValue(row, "URL") ??
           "";
         return {
           key: `row-${index + 1}-${String(getValue(row, "Case ID")).trim()}`,
           agent: String(getValue(row, "Agent Name")).trim(),
           auditDate: formatAuditDate(getValue(row, "Audit Date")),
           weekLabel: String(weekLabel || "-").trim(),
           caseId: String(getValue(row, "Case ID")).trim(),
           caseUrl: caseUrl ? String(caseUrl).trim() : "",
           inquiryTh: inquiry ? String(inquiry).trim() : "-",
           inquiryEn: inquiry ? String(inquiry).trim() : "-",
           finalScore: finalScoreVal,
           previousScore: undefined,
           grade: scoreToGrade(finalScoreVal),
           reviewStatus: "Original",
           topics,
           revisedTopics: null,
         };
       });
     const cleaned = mapped.filter(
       (item) => item.agent && item.caseId && item.auditDate
     );
     setAllCases(cleaned);
   } catch (error: any) {
     console.error("Load Error:", error);
     setLoadError(error?.message || "โหลดไฟล์ Excel ไม่สำเร็จ");
   } finally {
     setIsLoading(false);
   }
 };
 loadWorkbook();
}, []);
