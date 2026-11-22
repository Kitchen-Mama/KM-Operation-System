param([Parameter(Mandatory=$true)][ValidateSet('Sandbox','Production')][string]$Env)
$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Release = Join-Path $Repo 'output\ds1-service-20261122\release-2'
& node (Join-Path $PSScriptRoot 'verify-ds1-release.cjs') $Release
if ($LASTEXITCODE -ne 0) { throw 'DS1_PACKAGE_STOP' }
$Expected = Get-Content -LiteralPath (Join-Path $Release "expected\gs-ds1.$Env.json") -Raw | ConvertFrom-Json
$Report = Get-Content -LiteralPath (Join-Path $Release 'RELEASE.json') -Raw | ConvertFrom-Json
$Names = @($(if ($Env -eq 'Sandbox') { $Report.sandbox_delta_gs } else { $Report.production_delta_gs }))
$Dir = Join-Path $Repo ('output\ds1-service-20261122\capture\' + $Env + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $Dir -Force | Out-Null
$Bad = 0
foreach ($Name in $Names) {
  if ($Name -match '^(00_config|84_)') { throw 'PRIVATE_FILE_REFUSED' }
  Set-Clipboard -Value ' '
  Read-Host "Open $Env / $Name in Apps Script, Ctrl+A, Ctrl+C, then Enter here" | Out-Null
  $Value = Get-Clipboard -Raw
  if ($null -eq $Value -or $Value.Length -lt 200) { throw "CLIPBOARD_EMPTY $Name" }
  $Value = $Value.TrimStart([char]0xFEFF).Replace("`r`n", "`n")
  $Hash = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($Value))).Replace('-', '').ToLowerInvariant()
  [IO.File]::WriteAllText((Join-Path $Dir $Name), $Value, [Text.UTF8Encoding]::new($false))
  if ($Hash -ne $Expected.$Name) { Write-Output "DS1_GS_MISMATCH $Name"; $Bad++ } else { Write-Output "DS1_GS_MATCH $Name" }
}
if ($Bad -gt 0) { Write-Output "DS1_READBACK_STOP mismatches=$Bad capture=$Dir"; exit 2 }
Write-Output "DS1_READBACK_MATCH env=$Env files=$($Names.Count) capture=$Dir"
