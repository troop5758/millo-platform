param(
  [string]$BaseUrl = $env:BASE_URL,
  [string]$AdminToken = $env:ADMIN_TOKEN,
  [string]$UserToken = $env:USER_TOKEN,
  [string]$ExpectPaymentsDisabled = $env:EXPECT_PAYMENTS_DISABLED,
  [string]$ExpectPayoutsDisabled = $env:EXPECT_PAYOUTS_DISABLED,
  [string]$ExpectKycDisabled = $env:EXPECT_KYC_DISABLED
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function IsTrue([string]$v) {
  if ([string]::IsNullOrWhiteSpace($v)) { return $false }
  $x = $v.Trim().ToLowerInvariant()
  return ($x -eq "1" -or $x -eq "true" -or $x -eq "yes")
}

function Pass([string]$msg) {
  Write-Host "[PASS] $msg" -ForegroundColor Green
  $script:PassCount++
}

function Fail([string]$msg) {
  Write-Host "[FAIL] $msg" -ForegroundColor Red
  $script:FailCount++
}

function Info([string]$msg) {
  Write-Host "[INFO] $msg" -ForegroundColor Cyan
}

function Invoke-HttpCode {
  param(
    [string]$Method = "GET",
    [string]$Url,
    [hashtable]$Headers = @{},
    [object]$Body = $null
  )
  try {
    $params = @{
      Method = $Method
      Uri = $Url
      Headers = $Headers
      SkipHttpErrorCheck = $true
    }
    if ($null -ne $Body) {
      $params["Body"] = $Body
    }
    $resp = Invoke-WebRequest @params
    return [int]$resp.StatusCode
  } catch {
    return 0
  }
}

$script:PassCount = 0
$script:FailCount = 0

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
  Write-Error "BASE_URL is required (param -BaseUrl or env BASE_URL)."
}
if ([string]::IsNullOrWhiteSpace($AdminToken)) {
  Write-Error "ADMIN_TOKEN is required (param -AdminToken or env ADMIN_TOKEN)."
}

Info "BASE_URL=$BaseUrl"

Info "1) Control plane"
try {
  $cp = Invoke-RestMethod -Method GET -Uri "$BaseUrl/api/system/control-plane"
  if ($null -ne $cp -and $null -ne $cp.capabilities) {
    Pass "control-plane endpoint returned capabilities"
  } else {
    Fail "control-plane endpoint payload missing capabilities"
  }
} catch {
  Fail "control-plane endpoint failed"
}

Info "2) Observability admin payload"
$obsCode = Invoke-HttpCode -Method "GET" -Url "$BaseUrl/admin/metrics/observability" -Headers @{ Authorization = "Bearer $AdminToken" }
if ($obsCode -eq 200) {
  Pass "admin observability endpoint authorized and healthy"
} else {
  Fail "admin observability endpoint returned HTTP $obsCode"
}

Info "3) Health + metrics"
$healthCode = Invoke-HttpCode -Method "GET" -Url "$BaseUrl/health"
$metricsCode = Invoke-HttpCode -Method "GET" -Url "$BaseUrl/metrics"
if ($healthCode -eq 200 -or $healthCode -eq 503) {
  Pass "/health reachable (HTTP $healthCode)"
} else {
  Fail "/health unreachable (HTTP $healthCode)"
}
if ($metricsCode -eq 200) {
  Pass "/metrics reachable"
} else {
  Fail "/metrics unreachable (HTTP $metricsCode)"
}

if (-not [string]::IsNullOrWhiteSpace($UserToken)) {
  Info "4) Capability-gated payment probes"
  $jsonHeaders = @{
    Authorization = "Bearer $UserToken"
    "Content-Type" = "application/json"
  }

  $payBody = '{"packId":"starter","deviceFingerprint":"fp-test-12345678"}'
  $payCode = Invoke-HttpCode -Method "POST" -Url "$BaseUrl/payments/coins/intent" -Headers $jsonHeaders -Body $payBody
  if (IsTrue $ExpectPaymentsDisabled) {
    if ($payCode -eq 503) { Pass "payments disabled gate active (coins/intent => 503)" } else { Fail "expected payments 503, got $payCode" }
  } else {
    if ($payCode -ne 503) { Pass "payments path not hard-blocked by control-plane" } else { Fail "unexpected payments 503" }
  }

  $payoutBody = '{"amount":10}'
  $payoutCode = Invoke-HttpCode -Method "POST" -Url "$BaseUrl/payments/payouts/request" -Headers $jsonHeaders -Body $payoutBody
  if (IsTrue $ExpectPayoutsDisabled) {
    if ($payoutCode -eq 503) { Pass "payouts disabled gate active (request => 503)" } else { Fail "expected payouts 503, got $payoutCode" }
  } else {
    if ($payoutCode -ne 503) { Pass "payouts path not hard-blocked by control-plane" } else { Fail "unexpected payouts 503" }
  }

  $kycBody = '{"returnUrl":"https://milloapp.com/dashboard"}'
  $kycCode = Invoke-HttpCode -Method "POST" -Url "$BaseUrl/payments/kyc/start" -Headers $jsonHeaders -Body $kycBody
  if (IsTrue $ExpectKycDisabled) {
    if ($kycCode -eq 503) { Pass "kyc disabled gate active (kyc/start => 503)" } else { Fail "expected kyc 503, got $kycCode" }
  } else {
    if ($kycCode -ne 503) { Pass "kyc path not hard-blocked by control-plane" } else { Fail "unexpected kyc 503" }
  }
} else {
  Info "Skipping user-gated probes because USER_TOKEN is unset"
}

Write-Host "----------------------------------------"
Write-Host "Smoke Summary: PASS=$script:PassCount FAIL=$script:FailCount"
if ($script:FailCount -gt 0) {
  exit 1
}
Write-Host "Staging smoke checks passed."
exit 0

