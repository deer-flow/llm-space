[CmdletBinding()]
param(
  [string]$ArtifactDirectory,
  [int]$ObservationSeconds = 15,
  [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class LlmSpaceNativeWindow
{
    [DllImport("user32.dll")]
    public static extern IntPtr SendMessage(
        IntPtr window,
        uint message,
        IntPtr wParam,
        IntPtr lParam
    );
}
"@
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
$desktopShortcutRoots = @(
  [Environment]::GetFolderPath("Desktop"),
  [Environment]::GetFolderPath("CommonDesktopDirectory")
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
$startMenuShortcutRoots = @(
  [Environment]::GetFolderPath("StartMenu"),
  [Environment]::GetFolderPath("CommonStartMenu")
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
$shortcutRoots = @($desktopShortcutRoots) + @($startMenuShortcutRoots) | Select-Object -Unique
$existingShortcutContents = @{}
foreach ($root in $shortcutRoots) {
  Get-ChildItem -LiteralPath $root -Recurse -File -Filter "*LLM Space*.lnk" -ErrorAction SilentlyContinue |
    ForEach-Object { $existingShortcutContents[$_.FullName] = [IO.File]::ReadAllBytes($_.FullName) }
}

function Get-WindowsExecutableSubsystem([string]$Path) {
  $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  $reader = [IO.BinaryReader]::new($stream)
  try {
    if ($stream.Length -lt 0x40 -or $reader.ReadUInt16() -ne 0x5A4D) {
      throw "$Path is not a Windows PE image: missing DOS header."
    }

    $stream.Position = 0x3C
    $peOffset = $reader.ReadUInt32()
    if ($peOffset + 24 -gt $stream.Length) {
      throw "$Path is not a Windows PE image: missing PE header."
    }

    $stream.Position = $peOffset
    if ($reader.ReadUInt32() -ne 0x00004550) {
      throw "$Path is not a Windows PE image: missing PE signature."
    }

    $stream.Position = $peOffset + 20
    $optionalHeaderSize = $reader.ReadUInt16()
    $optionalHeaderOffset = $peOffset + 24
    if ($optionalHeaderSize -lt 70 -or $optionalHeaderOffset + $optionalHeaderSize -gt $stream.Length) {
      throw "$Path has a truncated Windows PE optional header."
    }

    $stream.Position = $optionalHeaderOffset
    $magic = $reader.ReadUInt16()
    if ($magic -ne 0x10B -and $magic -ne 0x20B) {
      throw ("{0} has unsupported Windows PE optional-header magic 0x{1:X}." -f $Path, $magic)
    }

    $stream.Position = $optionalHeaderOffset + 68
    return $reader.ReadUInt16()
  } finally {
    $reader.Dispose()
    $stream.Dispose()
  }
}

function Assert-WindowsGuiExecutable([string]$Path, [string]$Description) {
  $subsystem = Get-WindowsExecutableSubsystem $Path
  if ($subsystem -ne 2) {
    throw "$Description must use the Windows GUI subsystem (2), found $subsystem at $Path."
  }
  Write-Host "Verified Windows GUI subsystem: $Description"
}

function Get-Shortcuts([string[]]$Roots) {
  @($Roots | ForEach-Object {
    Get-ChildItem -LiteralPath $_ -Recurse -File -Filter "*LLM Space*.lnk" -ErrorAction SilentlyContinue
  })
}

function Assert-Shortcuts([string[]]$Roots, [string]$Description, [string]$ExpectedTarget) {
  $shell = New-Object -ComObject WScript.Shell
  try {
    $matching = @(Get-Shortcuts $Roots | Where-Object {
      $shortcut = $shell.CreateShortcut($_.FullName)
      $shortcut.TargetPath.Equals($ExpectedTarget, [StringComparison]::OrdinalIgnoreCase)
    })
    if ($matching.Count -lt 1) {
      throw "The installer did not create an LLM Space $Description shortcut targeting $ExpectedTarget."
    }
  } finally {
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell)
  }
  Write-Host "Verified $Description shortcut: $($matching[0].FullName)"
}

function Get-TestProcesses([string]$InstallRoot) {
  $root = [IO.Path]::GetFullPath($InstallRoot).TrimEnd("\") + "\"
  Get-CimInstance Win32_Process | Where-Object {
    ($_.ExecutablePath -and $_.ExecutablePath.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) -or
    ($_.CommandLine -and $_.CommandLine.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0)
  }
}

function Get-DescendantProcesses([int]$RootProcessId) {
  $allProcesses = @(Get-CimInstance Win32_Process)
  $knownIds = [Collections.Generic.HashSet[int]]::new()
  [void]$knownIds.Add($RootProcessId)
  $descendants = [Collections.Generic.List[object]]::new()
  $added = $true
  while ($added) {
    $added = $false
    foreach ($process in $allProcesses) {
      if (-not $knownIds.Contains([int]$process.ProcessId) -and $knownIds.Contains([int]$process.ParentProcessId)) {
        [void]$knownIds.Add([int]$process.ProcessId)
        [void]$descendants.Add($process)
        $added = $true
      }
    }
  }
  $descendants
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
  $installerPayload = Join-Path $expandedInstaller ".installer"
  Remove-Item -LiteralPath $installerPayload -Recurse -Force
  if (Test-Path -LiteralPath $installerPayload) {
    throw "Setup.exe must remain installable without the external .installer payload."
  }
  Assert-WindowsGuiExecutable $setupFiles[0].FullName "Setup.exe"
  Write-Host "Installing $($installerZip[0].Name) into isolated LOCALAPPDATA..."
  $setupProcess = Start-Process -FilePath $setupFiles[0].FullName -PassThru
  [void]$ownedProcessIds.Add($setupProcess.Id)
  $setupWindowSeen = $false
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while (-not $setupProcess.HasExited -and [DateTime]::UtcNow -lt $deadline) {
    $setupProcess.Refresh()
    if ($setupProcess.HasExited) { break }
    $setupDescendants = @(Get-DescendantProcesses $setupProcess.Id)
    $setupDescendants | ForEach-Object { [void]$ownedProcessIds.Add([int]$_.ProcessId) }
    $visibleSetupProcesses = @(@($setupProcess) + @($setupDescendants | ForEach-Object {
      Get-Process -Id ([int]$_.ProcessId) -ErrorAction SilentlyContinue
    }) | Where-Object { $_.MainWindowHandle -ne 0 })
    $unexpectedSetupWindows = @($visibleSetupProcesses | Where-Object {
      $_.MainWindowTitle -and $_.MainWindowTitle -ne "LLM Space Setup"
    })
    if ($unexpectedSetupWindows.Count -gt 0) {
      $titles = @($unexpectedSetupWindows | ForEach-Object { "$($_.ProcessName): $($_.MainWindowTitle)" }) -join "; "
      throw "Expected only the LLM Space installation progress window; found: $titles"
    }
    if ($visibleSetupProcesses | Where-Object { $_.MainWindowTitle -eq "LLM Space Setup" }) {
      $setupWindowSeen = $true
    }
    Start-Sleep -Milliseconds 100
  }
  if (-not $setupProcess.HasExited) {
    throw "Setup.exe did not finish within $TimeoutSeconds seconds."
  }
  if (-not $setupWindowSeen) {
    throw "Setup.exe did not show the LLM Space installation progress window."
  }
  if ($setupProcess.ExitCode -ne 0) {
    throw "Setup.exe exited with code $($setupProcess.ExitCode)."
  }

  $installRoot = Join-Path $isolatedLocalAppData "$($metadata.identifier)\$($metadata.channel)\app"
  $launcher = Join-Path $installRoot "bin\launcher.exe"
  $coreLauncher = Join-Path $installRoot "bin\launcher-core.exe"
  $bundledBun = Join-Path $installRoot "bin\bun.exe"
  $mainScript = Join-Path $installRoot "Resources\main.js"
  Wait-ForPath $mainScript $TimeoutSeconds "installed Resources/main.js"
  foreach ($required in @($launcher, $coreLauncher, $bundledBun, $mainScript)) {
    if (-not (Test-Path -LiteralPath $required)) {
      throw "Installed package is missing $required"
    }
  }
  Assert-WindowsGuiExecutable $launcher "installed launcher.exe wrapper"
  Assert-WindowsGuiExecutable $bundledBun "installed bun.exe"
  $coreSubsystem = Get-WindowsExecutableSubsystem $coreLauncher
  if ($coreSubsystem -ne 3) {
    throw "installed launcher-core.exe must remain a console image behind the hidden wrapper; found subsystem $coreSubsystem."
  }
  Assert-Shortcuts $desktopShortcutRoots "desktop" $launcher
  Assert-Shortcuts $startMenuShortcutRoots "Start Menu" $launcher

  Write-Host "Launching installed Windows app..."
  $launcherProcess = Start-Process -FilePath $launcher -PassThru
  [void]$ownedProcessIds.Add($launcherProcess.Id)

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $coreProcess = $null
  $bunProcess = $null
  while ([DateTime]::UtcNow -lt $deadline) {
    Get-TestProcesses $installRoot | ForEach-Object { [void]$ownedProcessIds.Add([int]$_.ProcessId) }
    $wrapperAlive = Get-Process -Id $launcherProcess.Id -ErrorAction SilentlyContinue
    $coreProcess = Get-TestProcesses $installRoot | Where-Object {
      $_.Name -ieq "launcher-core.exe"
    } | Select-Object -First 1
    $bunProcess = Get-TestProcesses $installRoot | Where-Object {
      $_.Name -ieq "bun.exe" -and $_.CommandLine -and $_.CommandLine.IndexOf("Resources\main.js", [StringComparison]::OrdinalIgnoreCase) -ge 0
    } | Select-Object -First 1
    if ($wrapperAlive -and $coreProcess -and $bunProcess) { break }
    Start-Sleep -Seconds 1
  }
  if (-not $coreProcess) {
    throw "The console-free wrapper did not start launcher-core.exe."
  }
  if (-not $bunProcess) {
    throw "The installed app did not start bun.exe with Resources/main.js."
  }
  if (-not (Get-Process -Id $launcherProcess.Id -ErrorAction SilentlyContinue)) {
    throw "launcher.exe wrapper exited before the app became ready."
  }

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $mainWindow = $null
  while ([DateTime]::UtcNow -lt $deadline) {
    $mainWindow = Get-Process -Id ([int]$bunProcess.ProcessId) -ErrorAction SilentlyContinue |
      Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -eq "LLM Space" }
    if ($mainWindow) { break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $mainWindow) {
    throw "The installed app did not create the LLM Space main window."
  }
  $iconDeadline = [DateTime]::UtcNow.AddSeconds([Math]::Min($TimeoutSeconds, 10))
  $smallIcon = [IntPtr]::Zero
  $largeIcon = [IntPtr]::Zero
  while ([DateTime]::UtcNow -lt $iconDeadline) {
    $smallIcon = [LlmSpaceNativeWindow]::SendMessage(
      $mainWindow.MainWindowHandle,
      0x007F,
      [IntPtr]::Zero,
      [IntPtr]::Zero
    )
    $largeIcon = [LlmSpaceNativeWindow]::SendMessage(
      $mainWindow.MainWindowHandle,
      0x007F,
      [IntPtr]::new(1),
      [IntPtr]::Zero
    )
    if ($smallIcon -ne [IntPtr]::Zero -and $largeIcon -ne [IntPtr]::Zero) { break }
    Start-Sleep -Milliseconds 250
  }
  if ($smallIcon -eq [IntPtr]::Zero -or $largeIcon -eq [IntPtr]::Zero) {
    throw "The LLM Space window did not load its small and large application icons."
  }
  Write-Host "Verified LLM Space native window icons."
  Write-Host "Observing the single app window and process liveness for $ObservationSeconds seconds..."
  for ($second = 0; $second -lt $ObservationSeconds; $second++) {
    if (-not (Get-Process -Id $launcherProcess.Id -ErrorAction SilentlyContinue)) {
      throw "launcher.exe wrapper exited during the observation window."
    }
    if (-not (Get-Process -Id ([int]$coreProcess.ProcessId) -ErrorAction SilentlyContinue)) {
      throw "launcher-core.exe exited during the observation window."
    }
    $bunAlive = Get-TestProcesses $installRoot | Where-Object {
      $_.Name -ieq "bun.exe" -and $_.CommandLine -and $_.CommandLine.IndexOf("Resources\main.js", [StringComparison]::OrdinalIgnoreCase) -ge 0
    } | Select-Object -First 1
    if (-not $bunAlive) {
      throw "bun.exe exited during the observation window."
    }
    [void]$ownedProcessIds.Add([int]$bunAlive.ProcessId)
    $descendants = @(Get-DescendantProcesses $launcherProcess.Id)
    $descendants | ForEach-Object { [void]$ownedProcessIds.Add([int]$_.ProcessId) }
    $visibleAppProcesses = @($descendants | ForEach-Object {
      Get-Process -Id ([int]$_.ProcessId) -ErrorAction SilentlyContinue
    } | Where-Object { $_.MainWindowHandle -ne 0 })
    $unexpectedWindows = @($visibleAppProcesses | Where-Object { $_.MainWindowTitle -ne "LLM Space" })
    $mainWindows = @($visibleAppProcesses | Where-Object { $_.MainWindowTitle -eq "LLM Space" })
    if ($unexpectedWindows.Count -gt 0 -or $mainWindows.Count -ne 1) {
      $titles = @($visibleAppProcesses | ForEach-Object { "$($_.ProcessName): $($_.MainWindowTitle)" }) -join "; "
      throw "Expected only the LLM Space main window; visible related windows: $titles"
    }
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
      Where-Object { -not $existingShortcutContents.ContainsKey($_.FullName) } |
      Remove-Item -Force -ErrorAction SilentlyContinue
  }

  foreach ($entry in $existingShortcutContents.GetEnumerator()) {
    [IO.File]::WriteAllBytes($entry.Key, $entry.Value)
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
