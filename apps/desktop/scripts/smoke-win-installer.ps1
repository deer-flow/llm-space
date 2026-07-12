# CI smoke test for the NSIS Windows installer (scripts/build-win-installer.ts
# output). Proves the machine-verifiable acceptance criteria on a headless
# runner:
#   - silent install (/S) establishes the exact updater-contract layout
#     (%LOCALAPPDATA%\tech.deerflow.llm-space\<channel>\app\bin\launcher.exe),
#     Start Menu + desktop shortcuts, and a real HKCU uninstall entry
#   - silent uninstall removes all of it and never touches user data at
#     %APPDATA%\llm-space
# Run from apps/desktop after build-win-installer.ts.
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet("canary", "stable")]
  [string]$Channel
)

$ErrorActionPreference = "Stop"

$identifier = "tech.deerflow.llm-space"
$root = Join-Path $env:LOCALAPPDATA "$identifier\$Channel"
$launcher = Join-Path $root "app\bin\launcher.exe"
$suffix = if ($Channel -eq "stable") { "" } else { "-$Channel" }
$installer = Join-Path "artifacts" "LLMSpace-Setup$suffix.exe"
$startMenuLnk = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\LLM Space.lnk"
$desktopLnk = Join-Path ([Environment]::GetFolderPath("Desktop")) "LLM Space.lnk"
$regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\LLMSpace-$Channel"
$userDataSentinel = Join-Path $env:APPDATA "llm-space\settings\smoke-sentinel.txt"

function Assert-True([bool]$Condition, [string]$What) {
  if (-not $Condition) {
    throw "ASSERT FAILED: $What"
  }
  Write-Host "ok: $What"
}

if (-not (Test-Path $installer)) {
  throw "installer not found: $installer (run build-win-installer.ts first)"
}

# Plant user data the uninstaller must preserve.
New-Item -ItemType Directory -Force -Path (Split-Path $userDataSentinel) | Out-Null
Set-Content -Path $userDataSentinel -Value "must survive uninstall"

Write-Host "== silent install: $installer =="
$install = Start-Process -FilePath (Resolve-Path $installer) -ArgumentList "/S" -Wait -PassThru
if ($install.ExitCode -ne 0) {
  # The installer persists the extractor's output here when extraction fails.
  $failLog = Join-Path $env:TEMP "llm-space-install-fail.log"
  if (Test-Path $failLog) {
    Write-Host "---- extractor log ----"
    Get-Content $failLog | Write-Host
    Write-Host "---- end extractor log ----"
  }
  throw "silent install exited with $($install.ExitCode)"
}
Write-Host "ok: silent install exit code 0"

# Updater path contract: the in-app updater hardcodes this layout and restarts
# bin\launcher.exe from it — any deviation silently breaks self-update.
Assert-True (Test-Path $launcher) "launcher at updater-contract path: $launcher"
Assert-True ((Get-ChildItem (Join-Path $root "self-extraction") -Filter "*.tar" -ErrorAction SilentlyContinue).Count -ge 1) "self-extraction\<hash>.tar present (delta-update seed)"
Assert-True (Test-Path (Join-Path $root "uninstall.exe")) "uninstall.exe in channel dir"
Assert-True (Test-Path (Join-Path $root "app.ico")) "standalone app.ico at channel root (survives app-folder swaps)"
Assert-True (Test-Path $startMenuLnk) "Start Menu shortcut"
Assert-True (Test-Path $desktopLnk) "desktop shortcut"

$shell = New-Object -ComObject WScript.Shell
$smShortcut = $shell.CreateShortcut($startMenuLnk)
Assert-True ($smShortcut.TargetPath -eq $launcher) "Start Menu shortcut targets launcher (got '$($smShortcut.TargetPath)')"
Assert-True ($smShortcut.IconLocation -like "*app.ico*") "Start Menu shortcut icon is app.ico (got '$($smShortcut.IconLocation)')"
Assert-True ($shell.CreateShortcut($desktopLnk).IconLocation -like "*app.ico*") "desktop shortcut icon is app.ico"

# The extractor must have been run with USERPROFILE stripped: its own
# PowerShell shortcut-creation spawns flash visible console windows (the CI
# runner cannot see windows, so assert the code path was skipped instead).
$installLog = Join-Path $root "install.log"
Assert-True (Test-Path $installLog) "extractor install.log persisted in channel dir"
Assert-True ([bool](Select-String -Path $installLog -Pattern "Could not get USERPROFILE" -Quiet)) "extractor shortcut step (console-flashing PowerShell spawns) was skipped"

# Identity sweep from scripts/brand-win-binaries.ts (postBuild hook): every
# statically checkable user-visible surface. bun.exe owns the window (taskbar
# icon, firewall prompt, Task Manager); launcher.exe is the shortcut target;
# the helpers show in Task Manager during self-updates.
$binDir = Join-Path $root "app\bin"
foreach ($exe in "bun.exe", "launcher.exe") {
  $info = (Get-Item (Join-Path $binDir $exe)).VersionInfo
  Assert-True ($info.FileDescription -eq "LLM Space") "$exe FileDescription branded (got '$($info.FileDescription)')"
  Assert-True ($info.ProductName -eq "LLM Space") "$exe ProductName branded (got '$($info.ProductName)')"
  Assert-True ($info.CompanyName -eq "DeerFlow") "$exe CompanyName branded (got '$($info.CompanyName)')"
}
foreach ($exe in "bspatch.exe", "zig-zstd.exe") {
  $info = (Get-Item (Join-Path $binDir $exe)).VersionInfo
  Assert-True ($info.FileDescription -eq "LLM Space update helper") "$exe FileDescription branded (got '$($info.FileDescription)')"
}

$bunExe = Join-Path $binDir "bun.exe"
# DPI manifest: deliberately SYSTEM-aware, not PerMonitorV2 — electrobun's
# win32 layer cannot rescale webviews mid-flight (VM round-2 regression).
Assert-True ([bool](Select-String -Path $bunExe -Pattern "dpiAware" -Quiet)) "bun.exe embeds a DPI-aware manifest"
Assert-True (-not (Select-String -Path $bunExe -Pattern "PerMonitorV2" -Quiet)) "bun.exe manifest is NOT PerMonitorV2 (framework can't rescale webviews)"

# Icon resources: the taskbar falls back to the window-owning exe's icon.
# ExtractAssociatedIcon returns Windows' generic exe icon for a resource-less
# binary — compare against bspatch.exe (deliberately not icon-branded).
Add-Type -AssemblyName System.Drawing
function Get-IconBytes([string]$path) {
  $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($path)
  $ms = New-Object System.IO.MemoryStream
  $icon.ToBitmap().Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  return [Convert]::ToBase64String($ms.ToArray())
}
$genericIcon = Get-IconBytes (Join-Path $binDir "bspatch.exe")
Assert-True ((Get-IconBytes $bunExe) -ne $genericIcon) "bun.exe carries a real icon resource (taskbar/alt-tab identity)"
Assert-True ((Get-IconBytes (Join-Path $binDir "launcher.exe")) -ne $genericIcon) "launcher.exe carries a real icon resource"

& $bunExe --version | Out-Null
Assert-True ($LASTEXITCODE -eq 0) "bun.exe still executes after rcedit branding"

$reg = Get-ItemProperty -Path $regPath
foreach ($name in "DisplayName", "DisplayVersion", "Publisher", "DisplayIcon", "InstallLocation", "UninstallString", "QuietUninstallString") {
  Assert-True ([bool]$reg.$name) "uninstall entry has $name ('$($reg.$name)')"
}
Assert-True ($reg.NoModify -eq 1 -and $reg.NoRepair -eq 1) "uninstall entry NoModify/NoRepair"
Assert-True ($reg.EstimatedSize -gt 0) "uninstall entry EstimatedSize > 0"

Write-Host "== silent uninstall =="
$uninstall = Start-Process -FilePath (Join-Path $root "uninstall.exe") -ArgumentList "/S" -Wait -PassThru
Assert-True ($uninstall.ExitCode -eq 0) "silent uninstall exit code 0 (got $($uninstall.ExitCode))"

# NSIS uninstallers respawn from %TEMP% to delete themselves; the original
# process exits immediately, so poll for the terminal state (the channel dir
# is removed last in the uninstall section).
$deadline = (Get-Date).AddSeconds(90)
while ((Test-Path $root) -and ((Get-Date) -lt $deadline)) {
  Start-Sleep -Milliseconds 500
}
Assert-True (-not (Test-Path $root)) "channel dir removed: $root"
Assert-True (-not (Test-Path $startMenuLnk)) "Start Menu shortcut removed"
Assert-True (-not (Test-Path $desktopLnk)) "desktop shortcut removed"
Assert-True (-not (Test-Path $regPath)) "uninstall registry key removed"
Assert-True (Test-Path $userDataSentinel) "user data at %APPDATA%\llm-space preserved"

Write-Host "smoke test passed"
