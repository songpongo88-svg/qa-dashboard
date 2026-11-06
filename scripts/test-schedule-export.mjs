import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
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
  const { createUploadedScheduleWorkbook, uploadedShiftValue, uploadedScheduleExportFileName, createDisplayedScheduleWorkbook, displayedScheduleExportFileName } =
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

  // The Excel layout remains unchanged, but this button now exports the
  // processed, edited SCH values that users actually see on the screen.
  const modified = { ...month, entries: records.map((entry, index) => ({
    ...entry, workMode: index === 0 ? "WFH" : index === 2 ? "Workspace" : "",
  })) };
  const displayed = {
    shift: (entry) => entry.status || entry.shiftCode || "",
    workMode: (entry) => entry.status ? "" : entry.workMode || "Workspace",
    ot: (entry) => entry.otText ? `OT ${entry.otText}` : "",
  };
  assert.equal(displayedScheduleExportFileName(modified), "SCH_Current_2026-10.xlsx");
  const currentWb = createDisplayedScheduleWorkbook(modified, displayed);
  assert.deepEqual(currentWb.SheetNames, ["Current Schedule", "Current OT Notes", "Export Info"]);
  const currentBytes = XLSX.write(currentWb, { type: "buffer", bookType: "xlsx" });
  const currentExcel = XLSX.read(currentBytes, { type: "buffer" });
  const currentGrid = XLSX.utils.sheet_to_json(currentExcel.Sheets["Current Schedule"], { header: 1, defval: "" });
  assert.deepEqual(currentGrid[5], grid[5], "current XLSX must keep the established calendar layout");
  const currentByName = new Map(currentGrid.slice(6).map(row => [row[1], row]));
  assert.equal(currentByName.get("Agent Test")[4], "12:00-21:00 (WFH)", "manual shift and WFH are exported");
  assert.equal(currentByName.get("Agent Test")[5], "OFF", "OFF after import is exported");
  assert.equal(currentByName.get("Another Agent")[4], "08:00-17:00 (Workspace)", "processed shift and Workspace are exported");
  assert.ok(!JSON.stringify(currentGrid).includes("07:30-16:30"), "original baseline must not replace the SCH current value");
  const currentNotes = XLSX.utils.sheet_to_json(currentExcel.Sheets["Current OT Notes"], { header: 1, defval: "" });
  assert.deepEqual(currentNotes[1].slice(4), ["12:00-21:00 (WFH)", "OT 19:00-20:00", "edited later"]);
  assert.ok(!JSON.stringify(currentNotes).includes("OT requested"), "outdated Excel note must not replace edited SCH note");
  const currentInfo = XLSX.utils.sheet_to_json(currentExcel.Sheets["Export Info"], { header: 1, defval: "" });
  assert.ok(JSON.stringify(currentInfo).includes("Latest SCH view"));
  const source = await readFile(path.join(root, "src/ScheduleMockup.tsx"), "utf8");
  assert.match(source, /createDisplayedScheduleWorkbook\(month,\s*\{/);
  assert.match(source, /shift:\s*\(entry\)\s*=>\s*scheduleCellLabel\(entry\)/);
  assert.match(source, /isWfhEntry\(entry\)/);
  assert.match(source, /ot:\s*\(entry\)\s*=>\s*scheduleOtLabel\(entry\)/);
  assert.match(source, /Export SCH Excel/);
  console.log("PASS SCH current-view export: processed shifts, WFH, Workspace, OFF, edited OT/notes, unchanged layout and screen-format integration");
} finally {
  await rm(temp, { recursive: true, force: true });
}
