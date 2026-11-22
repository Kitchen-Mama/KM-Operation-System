param(
  [Parameter(Mandatory = $true)][ValidateSet('Sandbox','Production')][string]$Env,
  [switch]$DeltaOnly
)
$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Release = Join-Path $Repo 'output\ad4-codex-20261122\release-final'
& node (Join-Path $PSScriptRoot 'verify-ad4-release.cjs') $Release
if ($LASTEXITCODE -ne 0) { throw 'PACKAGE_VERIFICATION_STOP' }
$Expected = Get-Content -LiteralPath (Join-Path $Release "expected\gs-ad4.$Env.json") -Raw | ConvertFrom-Json
$Report = Get-Content -LiteralPath (Join-Path $Release 'RELEASE.json') -Raw | ConvertFrom-Json
$Names = @($Report.production_gs_in_paste_order)
if ($DeltaOnly) { $Names = @($(if ($Env -eq 'Sandbox') { $Report.sandbox_delta_gs } else { $Report.production_delta_gs })) }
$Dir = Join-Path $Repo ('output\ad4-codex-20261122\owner-capture\' + $Env + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $Dir -Force | Out-Null
$Bad = 0
foreach ($Name in $Names) {
  if ($Name -match '^(00_config|84_)') { throw 'PRIVATE_FILE_REFUSED' }
  Set-Clipboard -Value ' '
  Read-Host "Open $Env / $Name in Apps Script, Ctrl+A, Ctrl+C, then press Enter here" | Out-Null
  $Value = Get-Clipboard -Raw
  if ($null -eq $Value -or $Value.Length -lt 200) { throw "CLIPBOARD_EMPTY $Name" }
  $Value = $Value.TrimStart([char]0xFEFF).Replace("`r`n", "`n")
  $Bytes = [Text.Encoding]::UTF8.GetBytes($Value)
  $Hash = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($Bytes)).Replace('-', '').ToLowerInvariant()
  [IO.File]::WriteAllText((Join-Path $Dir $Name), $Value, [Text.UTF8Encoding]::new($false))
  if ($Hash -ne $Expected.$Name) { Write-Output "AD4_GS_MISMATCH $Name"; $Bad++ } else { Write-Output "AD4_GS_MATCH $Name" }
}
if ($Bad -gt 0) { Write-Output "AD4_READBACK_STOP mismatches=$Bad capture=$Dir"; exit 2 }
Write-Output "AD4_READBACK_MATCH env=$Env files=$($Names.Count) capture=$Dir"
