param(
  [Parameter(Mandatory = $true)]
  [string]$WorkbookPath,

  [Parameter(Mandatory = $true)]
  [string]$SheetName,

  [Parameter(Mandatory = $true)]
  [string]$PayloadPath,

  [Parameter(Mandatory = $true)]
  [int]$CaseIdColumn,

  [switch]$ValueOnly
)

$ErrorActionPreference = "Stop"

function Release-ComObject($object) {
  if ($null -ne $object) {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($object)
  }
}

function Test-DateHeader($Header) {
  $text = [Convert]::ToString($Header).Trim().ToLowerInvariant()
  return (
    $text -eq "audit date" -or
    $text -eq "case date" -or
    $text -eq "month start" -or
    $text -eq "week start" -or
    $text -eq "week end" -or
    $text -eq "appeal submit" -or
    $text -eq "appeal result" -or
    $text -eq "appeal submit date & time" -or
    $text -eq "appeal result date & time" -or
    $text -eq "evaluation submitted at" -or
    $text.Contains("date")
  )
}

$payload = Get-Content -LiteralPath $PayloadPath -Raw -Encoding UTF8 | ConvertFrom-Json
$rows = @($payload.rows)

if ($rows.Count -eq 0) {
  Write-Output "No rows in payload."
  exit 0
}

$excel = $null
$workbook = $null
$sheet = $null
$saved = $false

try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $excel.ScreenUpdating = $false

  $workbook = $excel.Workbooks.Open($WorkbookPath)
  $sheet = $workbook.Worksheets.Item($SheetName)

  $targetRow = 5
  while ([string]::IsNullOrWhiteSpace([Convert]::ToString($sheet.Cells.Item([int]$targetRow, [int]$CaseIdColumn).Text)) -eq $false) {
    $targetRow++
  }

  $formatSourceRow = [Math]::Max(5, $targetRow - 1)
  $appended = 0
  $columnCount = @($rows[0]).Count
  $dateColumns = @{}
  for ($columnIndex = 1; $columnIndex -le $columnCount; $columnIndex++) {
    $header = $sheet.Cells.Item(4, [int]$columnIndex).Text
    if (Test-DateHeader $header) {
      $dateColumns[[int]$columnIndex] = $true
    }
  }

  foreach ($row in $rows) {
    if (-not $ValueOnly) {
      $sourceRange = $sheet.Range($sheet.Cells.Item([int]$formatSourceRow, 1), $sheet.Cells.Item([int]$formatSourceRow, [int]$columnCount))
      $targetRange = $sheet.Range($sheet.Cells.Item([int]$targetRow, 1), $sheet.Cells.Item([int]$targetRow, [int]$columnCount))
      $sourceRange.Copy() | Out-Null
      $targetRange.PasteSpecial(-4122) | Out-Null
    }

    $values = @($row)
    for ($index = 0; $index -lt $values.Count; $index++) {
      $value = $values[$index]
      if ($null -eq $value) {
        $value = ""
      }

      $cell = $sheet.Cells.Item([int]$targetRow, [int]($index + 1))
      if ($value -is [byte] -or $value -is [int16] -or $value -is [int32] -or $value -is [int64] -or $value -is [single] -or $value -is [double] -or $value -is [decimal]) {
        $cell.Value2 = [double]$value
      } else {
        $cell.Value2 = [Convert]::ToString($value)
      }

      if ($dateColumns.ContainsKey([int]($index + 1))) {
        $cell.NumberFormat = "dd/mm/yyyy"
      }
    }

    $targetRow++
    $appended++
  }

  if (-not $ValueOnly) {
    $excel.CutCopyMode = 0
  }
  $workbook.Save()
  $saved = $true
  Write-Output "Appended rows with Excel COM: $appended"
} finally {
  if ($null -ne $workbook) {
    $workbook.Close($saved)
  }
  if ($null -ne $excel) {
    $excel.Quit()
  }

  Release-ComObject $sheet
  Release-ComObject $workbook
  Release-ComObject $excel
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
