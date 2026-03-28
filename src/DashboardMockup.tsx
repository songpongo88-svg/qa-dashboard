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
        
        // แปลงเป็น Array แบบ Row (Header: 1 คือเอาแถวแรกมาเป็น index)
        const rows = XLSX.utils.sheet_to_json<any[]>(sheet, {
          header: 1,
          defval: null,
          raw: true
        });

        // กำหนดตำแหน่ง Header (สมมติว่า Header อยู่แถวที่ 4 index 3)
        const headerRow = (rows[3] || []) as string[];
        const dataRows = rows.slice(4);

        const col = (name: string) => headerRow.findIndex((h) => h === name);
        const getValue = (row: any[], name: string) => {
          const idx = col(name);
          return idx >= 0 ? row[idx] : null;
        };

        // --- เริ่มต้นการ Map ข้อมูลที่ถูกต้อง ---
        const mapped: CaseItem[] = dataRows
          .filter((row) => {
            // กรองเอาเฉพาะแถวที่มีข้อมูลสำคัญจริงๆ เพื่อป้องกัน Error
            return row && getValue(row, "Agent Name") && getValue(row, "Case ID");
          })
          .map((row, index) => {
            // คำนวณรายหัวข้อ (Topics)
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
                comment: commentVal ? String(commentVal) : ""
              };
            });

            // คำนวณคะแนนรวม
            const finalScoreVal =
              Number(getValue(row, "Final Score")) ||
              topics.reduce((sum, topic) => sum + topic.score, 0);

            const inquiry = getValue(row, "Customer Inquiry");
            const weekLabel = getValue(row, "Week Label");

            return {
              key: `row-${index + 1}-${String(getValue(row, "Case ID"))}`,
              agent: String(getValue(row, "Agent Name")).trim(),
              auditDate: formatAuditDate(getValue(row, "Audit Date")),
              weekLabel: weekLabel ? String(weekLabel) : "-",
              caseId: String(getValue(row, "Case ID")),
              caseUrl: getValue(row, "Case URL") ? String(getValue(row, "Case URL")) : "",
              inquiryTh: inquiry ? String(inquiry) : "-",
              inquiryEn: inquiry ? String(inquiry) : "-",
              finalScore: finalScoreVal,
              previousScore: undefined,
              grade: scoreToGrade(finalScoreVal),
              reviewStatus: "Original",
              topics,
              revisedTopics: null
            };
          });

        // สุดท้ายนำข้อมูลที่ Map เสร็จแล้วไปเก็บใน State
        setAllCases(mapped);

      } catch (error: any) {
        console.error("Load Error:", error);
        setLoadError(error?.message || "โหลดไฟล์ Excel ไม่สำเร็จ");
      } finally {
        setIsLoading(false);
      }
    };

    loadWorkbook();
  }, []);
