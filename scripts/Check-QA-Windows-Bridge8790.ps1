# Check the separate QA Windows candidate on loopback only.
# No migrations, Firestore access, writes, token changes, or failover activation.
# Windows PowerShell 5.1+ / PowerShell 7.
[CmdletBinding()]
param(
  [ValidateRange(1024,65535)][int]$Port = 8790
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($Port -eq 8787 -or $Port -eq 8788) {
  Write-Output 'QA_8790=RESERVED_EXISTING_BRIDGE_PORT'
  exit 2
}

# The archive probe key cannot authorize QA data reads/writes.
# Reuse only the existing archive-token configuration, never request a secret.
$token = [Environment]::GetEnvironmentVariable('QA_LOCAL_BRIDGE_TOKEN','Process')
if ([string]::IsNullOrWhiteSpace($token)) {
  $token = [Environment]::GetEnvironmentVariable('QA_LOCAL_BRIDGE_TOKEN','User')
}
if ([string]::IsNullOrWhiteSpace($token)) {
  $oldConfig = Join-Path $HOME 'Documents\QA_Backup\bridge\.env.local'
  if (Test-Path -LiteralPath $oldConfig -PathType Leaf) {
    foreach ($line in [IO.File]::ReadAllLines($oldConfig)) {
      if ($line -match '^\s*QA_LOCAL_API_TOKEN\s*=\s*(.*)$') {
        $token = $Matches[1].Trim()
        if ($token.Length -ge 2 -and
          (($token.StartsWith('"') -and $token.EndsWith('"')) -or
           ($token.StartsWith("'") -and $token.EndsWith("'")))) {
          $token = $token.Substring(1, $token.Length - 2)
        }
        break
      }
    }
  }
}
if ([string]::IsNullOrWhiteSpace($token) -or $token.Length -lt 40) {
  Write-Output 'QA_8790=ARCHIVE_TOKEN_NOT_CONFIGURED'
  exit 2
}

$origin = 'http://127.0.0.1:' + [string]$Port
$headers = @{ Authorization = ('Bearer ' + $token); Accept = 'application/json' }
try {
  $ready = Invoke-RestMethod -Method Get -Uri ($origin + '/ready') -Headers $headers -TimeoutSec 5
  $summary = Invoke-RestMethod -Method Get -Uri ($origin + '/summary') -Headers $headers -TimeoutSec 5
  if ($ready.ok -ne $true -or $ready.readOnly -ne $true -or
      $ready.databaseConnected -ne $true -or $ready.failoverReady -ne $false -or
      $summary.ok -ne $true -or $summary.readOnly -ne $true -or
      $summary.failoverReady -ne $false) {
    Write-Output 'QA_8790=UNVERIFIED_RESPONSE'
    exit 3
  }
  Write-Output 'QA_8790=LOCAL_ARCHIVE_MONITOR_READY'
  Write-Output ('QA_8790_DOCUMENTS=' + [string]$summary.sourceDocumentCount)
  Write-Output ('QA_8790_COLLECTIONS=' + [string]$summary.collectionCount)
  Write-Output ('QA_8790_ARCHIVE_COUNTS_MATCH=' + [string]$summary.importedArchiveCountMatch)
  Write-Output 'QA_8790_LIVE_FIRESTORE_PARITY=UNVERIFIED'
  Write-Output 'QA_8790_WRITE_AUTHORITY=NOT_TESTED'
  Write-Output 'QA_8790_PRODUCTION_FAILOVER=NOT_APPROVED'
  exit 0
} catch {
  Write-Output 'QA_8790=NOT_REACHABLE_OR_AUTH_FAILED'
  exit 3
}
