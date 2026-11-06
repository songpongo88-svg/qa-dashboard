import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import * as XLSX from "xlsx";

const root = process.cwd();
const temp = await mkdtemp(path.join(root, ".sch-export-test-"));
try {
  const output = path.join(temp, "schedule-export.mjs");
  await build({
    entryPoints: [path.join(root, "src/scheduleExport.ts")],
    outfile: output, bundle: true, platform: "node", format: "esm",
    packages: "external", logLevel: "silent",
  });
  const { createUploadedScheduleWorkbook, uploadedShiftValue, uploadedScheduleExportFileName } =
    await import(pathToFileURL(output).href);
  const records = [
    {
      employeeId: "QA-001", agentName: "Agent Test", nickname: "A",
      section: "Live Chat", date: "2026-10-01",
      shiftCode: "12:00-21:00", shiftStart: "12:00", shiftEnd: "21:00",
      status: "", otText: "19:00-20:00", note: "edited later", manualShift: true,
      excelShiftCode: "09:00-18:00", excelShiftStart: "09:00", excelShiftEnd: "18:00",
      excelStatus: "", excelOtText: "18:00-19:00", excelNote: "OT requested",
      manualOtEdited: true, manualOtText: "19:00-20:00", manualNoteText: "edited later",
    },
    {
      employeeId: "QA-001", agentName: "Agent Test", nickname: "A",
      section: "Live Chat", date: "2026-10-02", shiftCode: "OFF", status: "OFF",
      excelShiftCode: "OFF", excelStatus: "OFF", excelOtText: "", excelNote: "",
    },
    {
      employeeId: "QA-002", agentName: "Another Agent", nickname: "B",
      section: "Live Chat", date: "2026-10-01",
      shiftCode: "08:00-17:00", status: "",
      excelShiftCode: "07:30-16:30", excelOtText: "", excelNote: "",
    },
  ];
  const month = {
    monthKey: "2026-10", sourceFileName: "schedule-original.xlsx",
    sheetName: "October", entries: records, holidayDates: ["2026-10-13"],
    updatedBy: "QA reviewer", updatedAtIso: "2026-11-06T07:00:00Z",
  };
  assert.equal(uploadedShiftValue(records[0]), "09:00-18:00");
  assert.equal(uploadedShiftValue({ manualShift: true, shiftCode: "11:00-20:00" }), "ไม่พบค่ากะต้นฉบับ");
  assert.equal(uploadedScheduleExportFileName(month), "SCH_Uploaded_2026-10.xlsx");

  const wb = createUploadedScheduleWorkbook(month);
  assert.deepEqual(wb.SheetNames, ["Uploaded Schedule", "Uploaded OT Notes", "Export Info"]);
  const bytes = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const reopened = XLSX.read(bytes, { type: "buffer", raw: true });
  const grid = XLSX.utils.sheet_to_json(reopened.Sheets["Uploaded Schedule"], { header: 1, defval: "" });
  assert.equal(grid[5][4], "01/10/2026");
  const byName = new Map(grid.slice(6).map(row => [row[1], row]));
  assert.equal(byName.get("Agent Test")[4], "09:00-18:00");
  assert.equal(byName.get("Agent Test")[5], "OFF");
  assert.equal(byName.get("Another Agent")[4], "07:30-16:30");
  assert.ok(!JSON.stringify(grid).includes("12:00-21:00"), "manual Dashboard edits must not appear as original shifts");
  const noteRows = XLSX.utils.sheet_to_json(reopened.Sheets["Uploaded OT Notes"], { header: 1, defval: "" });
  assert.equal(noteRows.length, 2);
  assert.deepEqual(noteRows[1].slice(4), ["09:00-18:00", "18:00-19:00", "OT requested"]);
  assert.ok(!JSON.stringify(noteRows).includes("edited later"));
  const info = XLSX.utils.sheet_to_json(reopened.Sheets["Export Info"], { header: 1, defval: "" });
  assert.ok(JSON.stringify(info).includes("schedule-original.xlsx"));
  assert.ok(JSON.stringify(info).includes("ไม่ได้เก็บไฟล์ต้นฉบับ"));
  console.log("PASS SCH uploaded Excel export: original baseline, OT/notes, multiple staff, selected month, accurate source limitation");
} finally {
  await rm(temp, { recursive: true, force: true });
}
