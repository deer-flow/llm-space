[CmdletBinding()]
param(
  [string]$ArtifactDirectory,
  [int]$ObservationSeconds = 15,
  [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
  throw "The Windows package smoke test must run on Windows."
}
if (-not $ArtifactDirectory) {
  $ArtifactDirectory = Join-Path $PSScriptRoot "..\artifacts"
}

$testRoot = Join-Path ([IO.Path]::GetTempPath()) ("llm-space-smoke-" + [guid]::NewGuid().ToString("N"))
$isolatedLocalAppData = Join-Path $testRoot "local-app-data"
$isolatedAppData = Join-Path $testRoot "roaming-app-data"
$isolatedHome = Join-Path $testRoot "llm-space-home"
$expandedInstaller = Join-Path $testRoot "installer"
$oldEnvironment = @{
  LOCALAPPDATA = $env:LOCALAPPDATA
  APPDATA = $env:APPDATA
  LLM_SPACE_HOME = $env:LLM_SPACE_HOME
}
$launcherProcess = $null
$ownedProcessIds = [Collections.Generic.HashSet[int]]::new()
$shortcutRoots = @(
  [Environment]::GetFolderPath("Desktop"),
  [Environment]::GetFolderPath("StartMenu"),
  [Environment]::GetFolderPath("CommonDesktopDirectory"),
  [Environment]::GetFolderPath("CommonStartMenu")
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
$existingShortcuts = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($root in $shortcutRoots) {
  Get-ChildItem -LiteralPath $root -Recurse -File -Filter "*LLM Space*.lnk" -ErrorAction SilentlyContinue |
    ForEach-Object { [void]$existingShortcuts.Add($_.FullName) }
}

function Get-TestProcesses([string]$InstallRoot) {
  $root = [IO.Path]::GetFullPath($InstallRoot).TrimEnd("\") + "\"
  Get-CimInstance Win32_Process | Where-Object {
    ($_.ExecutablePath -and $_.ExecutablePath.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) -or
    ($_.CommandLine -and $_.CommandLine.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0)
  }
}

function Wait-ForPath([string]$Path, [int]$Seconds, [string]$Description) {
  $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (Test-Path -LiteralPath $Path) { return }
    Start-Sleep -Milliseconds 500
  }
  throw "Timed out waiting for $Description at $Path"
}

try {
  New-Item -ItemType Directory -Force -Path $isolatedLocalAppData, $isolatedAppData, $isolatedHome, $expandedInstaller | Out-Null
  $env:LOCALAPPDATA = $isolatedLocalAppData
  $env:APPDATA = $isolatedAppData
  $env:LLM_SPACE_HOME = $isolatedHome

  $installerZip = @(Get-ChildItem -LiteralPath $ArtifactDirectory -File -Filter "*Setup*.zip")
  if ($installerZip.Count -ne 1) {
    throw "Expected one Windows Setup ZIP in $ArtifactDirectory, found $($installerZip.Count)."
  }
  Expand-Archive -LiteralPath $installerZip[0].FullName -DestinationPath $expandedInstaller -Force
  $setupFiles = @(Get-ChildItem -LiteralPath $expandedInstaller -File -Filter "*.exe")
  if ($setupFiles.Count -ne 1) {
    throw "Expected one setup executable in $($installerZip[0].Name), found $($setupFiles.Count)."
  }
  $metadataFiles = @(Get-ChildItem -LiteralPath $expandedInstaller -Recurse -File -Filter "*.metadata.json")
  if ($metadataFiles.Count -ne 1) {
    throw "Expected one installer metadata file in $($installerZip[0].Name), found $($metadataFiles.Count)."
  }
  $metadata = Get-Content -LiteralPath $metadataFiles[0].FullName -Raw | ConvertFrom-Json
  if (-not $metadata.identifier -or -not $metadata.channel) {
    throw "Installer metadata must contain identifier and channel."
  }

  Write-Host "Installing $($installerZip[0].Name) into isolated LOCALAPPDATA..."
  $setupProcess = Start-Process -FilePath $setupFiles[0].FullName -Wait -PassThru -WindowStyle Hidden
  if ($setupProcess.ExitCode -ne 0) {
    throw "Setup.exe exited with code $($setupProcess.ExitCode)."
  }

  $installRoot = Join-Path $isolatedLocalAppData "$($metadata.identifier)\$($metadata.channel)\app"
  $launcher = Join-Path $installRoot "bin\launcher.exe"
  $bundledBun = Join-Path $installRoot "bin\bun.exe"
  $mainScript = Join-Path $installRoot "Resources\main.js"
  Wait-ForPath $mainScript $TimeoutSeconds "installed Resources/main.js"
  foreach ($required in @($launcher, $bundledBun, $mainScript)) {
    if (-not (Test-Path -LiteralPath $required)) {
      throw "Installed package is missing $required"
    }
  }

  Write-Host "Launching installed Windows app..."
  $launcherProcess = Start-Process -FilePath $launcher -PassThru -WindowStyle Hidden
  [void]$ownedProcessIds.Add($launcherProcess.Id)

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $bunProcess = $null
  while ([DateTime]::UtcNow -lt $deadline) {
    Get-TestProcesses $installRoot | ForEach-Object { [void]$ownedProcessIds.Add([int]$_.ProcessId) }
    $launcherAlive = Get-Process -Id $launcherProcess.Id -ErrorAction SilentlyContinue
    $bunProcess = Get-TestProcesses $installRoot | Where-Object {
      $_.Name -ieq "bun.exe" -and $_.CommandLine -and $_.CommandLine.IndexOf("Resources\main.js", [StringComparison]::OrdinalIgnoreCase) -ge 0
    } | Select-Object -First 1
    if ($launcherAlive -and $bunProcess) { break }
    Start-Sleep -Seconds 1
  }
  if (-not $bunProcess) {
    throw "The installed app did not start bun.exe with Resources/main.js."
  }
  if (-not (Get-Process -Id $launcherProcess.Id -ErrorAction SilentlyContinue)) {
    throw "launcher.exe exited before the Bun main process became ready."
  }

  Write-Host "Observing launcher and Bun process liveness for $ObservationSeconds seconds..."
  for ($second = 0; $second -lt $ObservationSeconds; $second++) {
    if (-not (Get-Process -Id $launcherProcess.Id -ErrorAction SilentlyContinue)) {
      throw "launcher.exe exited during the observation window."
    }
    $bunAlive = Get-TestProcesses $installRoot | Where-Object {
      $_.Name -ieq "bun.exe" -and $_.CommandLine -and $_.CommandLine.IndexOf("Resources\main.js", [StringComparison]::OrdinalIgnoreCase) -ge 0
    } | Select-Object -First 1
    if (-not $bunAlive) {
      throw "bun.exe exited during the observation window."
    }
    [void]$ownedProcessIds.Add([int]$bunAlive.ProcessId)
    Start-Sleep -Seconds 1
  }

  Write-Host "Windows package smoke test passed."
} finally {
  if (Test-Path -LiteralPath $isolatedLocalAppData) {
    Get-TestProcesses $isolatedLocalAppData | ForEach-Object { [void]$ownedProcessIds.Add([int]$_.ProcessId) }
  }
  foreach ($processId in $ownedProcessIds) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }

  foreach ($root in $shortcutRoots) {
    Get-ChildItem -LiteralPath $root -Recurse -File -Filter "*LLM Space*.lnk" -ErrorAction SilentlyContinue |
      Where-Object { -not $existingShortcuts.Contains($_.FullName) } |
      Remove-Item -Force -ErrorAction SilentlyContinue
  }

  foreach ($name in $oldEnvironment.Keys) {
    $value = $oldEnvironment[$name]
    if ($null -eq $value) {
      Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    } else {
      Set-Item "Env:$name" $value
    }
  }

  $resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd("\") + "\"
  $resolvedTestRoot = [IO.Path]::GetFullPath($testRoot)
  if ($resolvedTestRoot.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force -ErrorAction SilentlyContinue
  } else {
    Write-Warning "Refused to remove smoke-test path outside the system temp directory: $resolvedTestRoot"
  }
}
