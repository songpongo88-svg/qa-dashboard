# QA Dashboard domainless Cloudflare VPC gateway, only for existing local status API.
# NO Firestore access, no QA writes/imports, and no PostgreSQL port exposure.
[CmdletBinding()]
param([string]$VPCServiceId = '')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$tunnelId = '983dbe5d-037a-43e3-8ff8-501c717189e8'
$serviceName = 'qa-standby-loopback-8788'
$envFile = Join-Path $HOME 'Documents\QA_Backup\bridge\.env.local'
$workerRoot = Join-Path $HOME 'Documents\QA_Backup\cloudflare-qa-vpc'
$workerSource = Join-Path $workerRoot 'worker.mjs'
$workerConfig = Join-Path $workerRoot 'wrangler.json'
$workerSourceCommit = '4c55241174ce6d25b86b1e99def72a8080d4ce91'

function Stop-Safe([string]$reason) {
  Write-Host ('QA_VPC=' + $reason)
  exit 2
}
if (!(Test-Path -LiteralPath $envFile -PathType Leaf)) {
  Stop-Safe 'LOCAL_BRIDGE_CONFIG_MISSING'
}
$token = $null
foreach ($line in [IO.File]::ReadAllLines($envFile)) {
  if ($line -match '^\s*QA_LOCAL_API_TOKEN\s*=\s*(.*)$') {
    $value = $Matches[1].Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1,$value.Length-2)
    }
    $token = $value
  }
}
if ([string]::IsNullOrWhiteSpace($token) -or $token.Length -lt 40) {
  Stop-Safe 'LOCAL_BRIDGE_TOKEN_INVALID'
}
try {
  $headers = @{ Authorization = ('Bearer ' + $token) }
  $ready = Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:8788/ready' -Headers $headers -TimeoutSec 5
  $summary = Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:8788/summary' -Headers $headers -TimeoutSec 5
  if ($ready.ok -ne $true -or $ready.readOnly -ne $true -or
      $ready.databaseConnected -ne $true -or $ready.failoverReady -ne $false -or
      $summary.ok -ne $true -or $summary.importedArchiveCountMatch -ne $true -or
      $summary.failoverReady -ne $false) {
    Stop-Safe 'LOCAL_READ_ONLY_ARCHIVE_NOT_READY'
  }
} catch {
  Stop-Safe 'LOCAL_8788_NOT_READY'
}
$cloudflared = Get-Service cloudflared -ErrorAction SilentlyContinue
if (!$cloudflared -or $cloudflared.Status -ne 'Running') {
  Stop-Safe 'CLOUDFLARED_SERVICE_NOT_RUNNING'
}
$npx = Get-Command npx.cmd -ErrorAction SilentlyContinue
if (!$npx) { Stop-Safe 'NPX_NOT_FOUND' }
$sha = [Security.Cryptography.SHA256]::Create()
try {
  $digestBytes = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($token))
  $digest = -join ($digestBytes | ForEach-Object { $_.ToString('x2') })
} finally { $sha.Dispose() }
New-Item -Path $workerRoot -ItemType Directory -Force | Out-Null
$sourceUrl = 'https://raw.githubusercontent.com/songpongo88-svg/qa-dashboard/' + $workerSourceCommit + '/cloudflare/qa-standby-vpc-worker.mjs'
try {
  Invoke-WebRequest -Uri $sourceUrl -UseBasicParsing -OutFile $workerSource -TimeoutSec 30
} catch {
  Stop-Safe 'WORKER_SOURCE_DOWNLOAD_FAILED'
}
Write-Host 'QA_VPC=CHECKING_CLOUDFLARE_LOGIN'
& $npx.Source --yes wrangler whoami *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'QA_VPC=LOGIN_REQUIRED'
  & $npx.Source --yes wrangler login
  if ($LASTEXITCODE -ne 0) { Stop-Safe 'CLOUDFLARE_LOGIN_NOT_AUTHORIZED' }
}
if ($VPCServiceId -and $VPCServiceId -notmatch '^[a-fA-F0-9-]{36}$') {
  Stop-Safe 'INVALID_VPC_SERVICE_ID'
}
if (!$VPCServiceId) {
  Write-Host 'QA_VPC=CREATING_PRIVATE_HTTP_SERVICE'
  $output = & $npx.Source --yes wrangler vpc service create $serviceName --type http --ipv4 127.0.0.1 --http-port 8788 --tunnel-id $tunnelId 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'QA_VPC=CLOUDFLARE_SERVICE_CREATE_FAILED'
    Write-Host 'QA_VPC=CHECK_WORKERS_VPC_BETA_AVAILABILITY_IN_DASHBOARD'
    exit 2
  }
  $guids = [regex]::Matches(($output | Out-String),
    '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}') |
    ForEach-Object { $_.Value.ToLowerInvariant() } |
    Where-Object { $_ -ne $tunnelId } | Select-Object -Unique
  if (@($guids).Count -ne 1) {
    Write-Host 'QA_VPC=SERVICE_ID_NOT_DETERMINED'
    Write-Host 'QA_VPC=USE_WORKERS_VPC_SERVICE_ID_FROM_CLOUDFLARE_DASHBOARD'
    exit 2
  }
  $VPCServiceId = @($guids)[0]
}
$config = [ordered]@{
  name = 'robinhood-qa-standby-bridge'
  main = 'worker.mjs'
  compatibility_date = '2026-11-11'
  workers_dev = $true
  vpc_services = @(@{
    binding = 'QA_PRIVATE_HTTP_VPC'
    service_id = $VPCServiceId
  })
}
$configText = $config | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText($workerConfig,$configText,(New-Object Text.UTF8Encoding($false)))
Push-Location $workerRoot
try {
  Write-Host 'QA_VPC=DEPLOYING_READ_ONLY_WORKER'
  $deployResult = & $npx.Source --yes wrangler deploy --config $workerConfig 2>&1
  if ($LASTEXITCODE -ne 0) { Stop-Safe 'WORKER_DEPLOY_FAILED' }
  Write-Host 'QA_VPC=CONFIGURING_EDGE_SECRET_HASH'
  $digest | & $npx.Source --yes wrangler secret put QA_EDGE_BEARER_SHA256 --config $workerConfig *> $null
  if ($LASTEXITCODE -ne 0) { Stop-Safe 'WORKER_SECRET_CONFIG_FAILED' }
  $urls = [regex]::Matches(($deployResult | Out-String),
    'https://[a-z0-9.-]+\.workers\.dev') |
    ForEach-Object { $_.Value } | Select-Object -Unique
  Write-Host 'QA_VPC=PRIVATE_WORKER_CONFIGURED'
  Write-Host 'QA_VPC=LOCAL_8788_READ_ONLY'
  Write-Host 'QA_VPC=FAILOVER_OFF'
  Write-Host 'QA_VPC=FIRESTORE_LIVE_PARITY_UNVERIFIED'
  if (@($urls).Count -ne 1) {
    Stop-Safe 'WORKER_URL_NOT_DETERMINED_FOR_VERCEL'
  }
  $workerUrl = @($urls)[0]
  Write-Host ('QA_VPC_WORKER_URL=' + $workerUrl)
  if ($workerUrl -notmatch '^https://[a-zA-Z0-9.-]+\.workers\.dev$') {
    Stop-Safe 'UNRECOGNIZED_WORKER_DOMAIN'
  }
  $urlFile = Join-Path $workerRoot 'qa-worker-url.txt'
  [IO.File]::WriteAllText($urlFile,$workerUrl,[Text.Encoding]::UTF8)
  # Only the QA standby PR Preview branch receives these variables;
  # NEVER change Production or QA Sparks environment variables.
  $vercelBranch = 'feat/qa-local-firestore-failover-current-main-20261110'
  $vercelProjectId = 'prj_zLlvaJW3gOrsCm5eXArEKxXITLAA'
  Write-Host 'QA_VPC=CHECKING_VERCEL_PREVIEW_LINK'
  & $npx.Source --yes vercel whoami *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'QA_VPC=VERCEL_BROWSER_LOGIN_REQUIRED'
    & $npx.Source --yes vercel login
    if ($LASTEXITCODE -ne 0) { Stop-Safe 'VERCEL_LOGIN_NOT_AUTHORIZED' }
  }
  $projectPath = Join-Path $workerRoot '.vercel\project.json'
  if (!(Test-Path -LiteralPath $projectPath -PathType Leaf)) {
    & $npx.Source --yes vercel link --yes --project $vercelProjectId *> $null
    if ($LASTEXITCODE -ne 0) { Stop-Safe 'VERCEL_PROJECT_LINK_REQUIRED' }
  }
  $linkedProject = Get-Content -LiteralPath $projectPath -Raw | ConvertFrom-Json
  if ($linkedProject.projectId -ne $vercelProjectId) {
    Stop-Safe 'VERCEL_PROJECT_ID_MISMATCH_NO_ENV_CHANGED'
  }
  Write-Host 'QA_VPC=PAIRING_VERCEL_PREVIEW_SECRETS'
  # PowerShell pipes existing secret from .env.local directly into Vercel CLI:
  # no token in argv, shell history, GitHub, URLs or console output.
  $token | & $npx.Source --yes vercel env add QA_LOCAL_BRIDGE_TOKEN preview $vercelBranch --sensitive --yes --force *> $null
  if ($LASTEXITCODE -ne 0) { Stop-Safe 'VERCEL_PREVIEW_TOKEN_NOT_SAVED' }
  ($workerUrl + '/') | & $npx.Source --yes vercel env add QA_LOCAL_BRIDGE_URL preview $vercelBranch --yes --force *> $null
  if ($LASTEXITCODE -ne 0) { Stop-Safe 'VERCEL_PREVIEW_URL_NOT_SAVED' }
  Write-Host 'QA_VPC=VERCEL_PREVIEW_BRIDGE_PAIRED'
  Write-Host 'QA_VPC=PRODUCTION_UNCHANGED'
  Write-Host 'QA_VPC=QA_SPARKS_UNCHANGED'
} finally { Pop-Location }
