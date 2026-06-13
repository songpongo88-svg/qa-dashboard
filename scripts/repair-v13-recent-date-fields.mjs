import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { initializeApp, getApps } from "firebase/app";
import { collection, getDocs, getFirestore, limit, query, where } from "firebase/firestore/lite";

const TARGET_WORKBOOK =
  process.env.QA_V13_WORKBOOK ||
  "C:\\Users\\Songpon\\OneDrive - Purple Ventures\\Report QA\\ROWDATA\\QA_Score_Dashboard_byDao_V13.xlsx";

const TARGET_CASE_IDS = (
  process.env.QA_REPAIR_CASE_IDS ||
  "AA247564,AA247935,AA249067,AA249484,AA249537,AA249639,AA249782,AA250026,AA250907,AA250826,AA250632,AA250837,AA250930,AA248064,AA248311"
)
  .split(",")
  .map((item) => item.trim().toUpperCase())
  .filter(Boolean);

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyBn03smavKzc0l761okJQqCSyT0Wq022DQ",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "qa-dashboard-b0b5d.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "qa-dashboard-b0b5d",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "qa-dashboard-b0b5d.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "441715183213",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:441715183213:web:4e00da66b84546ff03964",
};

function excelDateSerialFromDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.getTime() / 86400000 + 25569;
}

function excelDateSerialFromParts(year, month, day) {
  return Date.UTC(year, month - 1, day) / 86400000 + 25569;
}

function parseDateOnly(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return excelDateSerialFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return excelDateSerialFromParts(Number(match[3]), Number(match[2]), Number(match[1]));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : excelDateSerialFromDate(parsed);
}

function parseDateTime(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime())
    ? ""
    : excelDateSerialFromDate(new Date(parsed.getTime() + 7 * 60 * 60 * 1000));
}

function parseTimeSerial(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return "";
  return (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0)) / 86400;
}

async function fetchEvaluation(caseId) {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const snapshot = await getDocs(query(collection(db, "qa_evaluations"), where("case_id", "==", caseId), limit(1)));
  if (snapshot.empty) return null;
  return snapshot.docs[0].data();
}

function runPowerShell(records) {
  const payloadPath = path.join(os.tmpdir(), `qa-v13-date-repair-${Date.now()}.json`);
  fs.writeFileSync(payloadPath, JSON.stringify({ records }), "utf8");

  const script = `
$ErrorActionPreference = 'Stop'
$payload = Get-Content -LiteralPath '${payloadPath.replaceAll("'", "''")}' -Raw -Encoding UTF8 | ConvertFrom-Json
$path = '${TARGET_WORKBOOK.replaceAll("'", "''")}'
$excel = $null
$wb = $null
$raw = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $wb = $excel.Workbooks.Open($path)
  $raw = $wb.Worksheets.Item('Raw_Data')
  $updated = 0
  foreach ($record in @($payload.records)) {
    $row = 5
    while (-not [string]::IsNullOrWhiteSpace([Convert]::ToString($raw.Cells.Item($row, 6).Text))) {
      $caseId = [Convert]::ToString($raw.Cells.Item($row, 6).Text).Trim().ToUpper()
      if ($caseId -eq [Convert]::ToString($record.caseId).Trim().ToUpper()) {
        if ($record.auditSerial -ne $null -and [Convert]::ToString($record.auditSerial) -ne '') { $raw.Cells.Item($row, 1).Value2 = [double]$record.auditSerial }
        if ($record.caseSerial -ne $null -and [Convert]::ToString($record.caseSerial) -ne '') { $raw.Cells.Item($row, 3).Value2 = [double]$record.caseSerial }
        if ($record.waitingSerial -ne $null -and [Convert]::ToString($record.waitingSerial) -ne '') { $raw.Cells.Item($row, 4).Value2 = [double]$record.waitingSerial }
        if ($record.serviceSerial -ne $null -and [Convert]::ToString($record.serviceSerial) -ne '') { $raw.Cells.Item($row, 5).Value2 = [double]$record.serviceSerial }
        Write-Output "Repaired $caseId row $row"
        $updated++
        break
      }
      $row++
    }
  }
  $wb.Save()
  Write-Output "Repaired total: $updated"
} finally {
  if ($wb) { $wb.Close($true) | Out-Null }
  if ($excel) { $excel.Quit() | Out-Null }
  if ($raw) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($raw) }
  if ($wb) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
  if ($excel) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
`;

  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
    timeout: 120000,
  });

  try {
    fs.unlinkSync(payloadPath);
  } catch {
    // Best effort cleanup.
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`Repair failed with exit code ${result.status}`);
}

async function main() {
  const records = [];
  for (const caseId of TARGET_CASE_IDS) {
    const data = await fetchEvaluation(caseId);
    if (!data) {
      console.log(`Missing evaluation: ${caseId}`);
      continue;
    }
    const preview = data.raw_data_preview || {};
    records.push({
      caseId,
      auditSerial: parseDateTime(data.submitted_at || preview["Evaluation Submitted At"]),
      caseSerial: parseDateOnly(preview["Case Date"] || preview["Audit Date"] || data.audit_date),
      waitingSerial: parseTimeSerial(data.waiting_time || preview["Waiting Time"]),
      serviceSerial: parseTimeSerial(data.service_time || preview["Service Time"]),
    });
  }
  console.log(`Repair records: ${records.length}`);
  runPowerShell(records);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
