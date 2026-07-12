# Thin NSIS wrapper around electrobun's console self-extractor.
#
# Why this exists: electrobun 1.18.x ships Windows installs as a console
# self-extractor that flashes a DEBUG console, creates shortcuts with
# silent-failure semantics, never registers an Add/Remove Programs entry, and
# offers no uninstaller (upstream #296/#252/#249). This wrapper keeps the
# extractor as the install engine — the in-app updater HARDCODES the layout it
# produces (%LOCALAPPDATA%\<identifier>\<channel>\app + self-extraction\) — and
# adds the OS integration around it deterministically.
#
# Compiled by scripts/build-win-installer.ts, which passes every !define below
# via makensis /D. Do not hardcode versions or paths here.
#
# Required defines:
#   APP_NAME          display name, e.g. "LLM Space"
#   APP_IDENTIFIER    e.g. tech.deerflow.llm-space (updater path contract)
#   CHANNEL           canary | stable
#   VERSION           full semver, e.g. 0.1.0-canary.3 (DisplayVersion)
#   VERSION_NUMERIC   4-part numeric for VIProductVersion, e.g. 0.1.0.0
#   PUBLISHER         Add/Remove Programs publisher string
#   PAYLOAD_SETUP_EXE absolute path to the electrobun extractor exe
#   PAYLOAD_METADATA  absolute path to <stem>.metadata.json
#   PAYLOAD_ARCHIVE   absolute path to <stem>.tar.zst
#   PAYLOAD_STEM      extractor basename without .exe, e.g. "LLM Space-Setup-canary"
#                     (the extractor locates .installer\<stem>.* next to itself)
#   ICON_FILE         absolute path to the .ico
#   OUT_FILE          absolute path of the installer exe to produce

Unicode true
ManifestDPIAware true
# The payload is already zstd-compressed; recompressing wastes minutes of CI
# for ~0 gain.
SetCompress off

!include "MUI2.nsh"
!include "FileFunc.nsh"

!if "${CHANNEL}" == "stable"
  !define DISPLAY_NAME "${APP_NAME}"
!else
  !define DISPLAY_NAME "${APP_NAME} (${CHANNEL})"
!endif

# The updater contract: it swaps $INSTDIR\app in place and restarts
# app\bin\launcher.exe, keying delta updates off self-extraction\<hash>.tar.
# $INSTDIR is pinned to this path in .onInit/un.onInit and never user-chosen.
!define CHANNEL_DIR "$LOCALAPPDATA\${APP_IDENTIFIER}\${CHANNEL}"
!define LAUNCHER "$INSTDIR\app\bin\launcher.exe"
!define REG_UNINSTALL "Software\Microsoft\Windows\CurrentVersion\Uninstall\LLMSpace-${CHANNEL}"
# Shortcut name matches the extractor's own .lnk attempts (metadata.name, no
# channel suffix) so delete-then-create never leaves duplicates.
!define SHORTCUT_NAME "${APP_NAME}.lnk"

Name "${DISPLAY_NAME}"
OutFile "${OUT_FILE}"
RequestExecutionLevel user

VIProductVersion "${VERSION_NUMERIC}"
VIAddVersionKey "ProductName" "${DISPLAY_NAME}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "CompanyName" "${PUBLISHER}"
VIAddVersionKey "FileDescription" "${DISPLAY_NAME} Installer"
VIAddVersionKey "LegalCopyright" "${PUBLISHER}"

!define MUI_ICON "${ICON_FILE}"
!define MUI_UNICON "${ICON_FILE}"
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Launch ${APP_NAME}"
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApp
# The finish page's "readme" checkbox repurposed as the optional desktop
# shortcut (standard NSIS pattern for one-click installers). Default checked.
!define MUI_FINISHPAGE_SHOWREADME
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Create desktop shortcut"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION CreateDesktopShortcut

!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  StrCpy $INSTDIR "${CHANNEL_DIR}"
FunctionEnd

Function un.onInit
  # Never trust where uninstall.exe happens to live — always operate on the
  # contract path.
  StrCpy $INSTDIR "${CHANNEL_DIR}"
FunctionEnd

# Best-effort: stop every process running from under $INSTDIR (launcher.exe,
# bun.exe, helper processes) so extraction/removal doesn't hit locked files.
!macro KILL_RUNNING_PROCESSES
  nsExec::ExecToLog `powershell -NoProfile -NonInteractive -Command "Get-Process | Where-Object { $$_.Path -like '$INSTDIR\*' } | Stop-Process -Force -ErrorAction SilentlyContinue"`
  Pop $0
  Sleep 800
!macroend

Function LaunchApp
  SetOutPath "$INSTDIR\app\bin"
  Exec '"${LAUNCHER}"'
FunctionEnd

Function CreateDesktopShortcut
  SetOutPath "$INSTDIR\app\bin"
  CreateShortCut "$DESKTOP\${SHORTCUT_NAME}" "${LAUNCHER}" "" "${LAUNCHER}" 0
FunctionEnd

Section "Install"
  SetDetailsPrint both
  DetailPrint "Closing running ${APP_NAME} instances..."
  !insertmacro KILL_RUNNING_PROCESSES

  # Stage the electrobun artifacts in the auto-cleaned plugins dir, in the
  # exact layout the extractor expects: exe at root, payload in .installer\.
  InitPluginsDir
  SetOutPath "$PLUGINSDIR\payload\.installer"
  File "/oname=${PAYLOAD_STEM}.metadata.json" "${PAYLOAD_METADATA}"
  File "/oname=${PAYLOAD_STEM}.tar.zst" "${PAYLOAD_ARCHIVE}"
  SetOutPath "$PLUGINSDIR\payload"
  File "/oname=${PAYLOAD_STEM}.exe" "${PAYLOAD_SETUP_EXE}"

  # Run the extractor hidden (nsExec runs cmd with no window) as the install
  # engine — it owns the updater-contract layout, including
  # self-extraction\<hash>.tar for future delta updates. Its output goes to a
  # log file: nsExec's log window is invisible in silent installs, and the
  # extractor's diagnostics are the only clue when it fails.
  DetailPrint "Extracting ${APP_NAME} ${VERSION}..."
  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /C ""$PLUGINSDIR\payload\${PAYLOAD_STEM}.exe" > "$PLUGINSDIR\extractor.log" 2>&1"'
  Pop $0
  DetailPrint "Extractor finished (exit code $0)"

  # The extractor has a known stall/failure mode (upstream #249) and its exit
  # code alone is not trustworthy — verify the contract path materialized.
  IfFileExists "${LAUNCHER}" extraction_ok
    SetDetailsPrint both
    DetailPrint "ERROR: ${LAUNCHER} was not created (extractor exit code $0)."
    # $PLUGINSDIR is wiped on exit — persist the extractor log where a human
    # (or the CI smoke test) can find it.
    CopyFiles /SILENT "$PLUGINSDIR\extractor.log" "$TEMP\llm-space-install-fail.log"
    SetErrorLevel 2
    MessageBox MB_ICONSTOP "Installation failed: the application files could not be extracted.$\r$\n$\r$\nExpected launcher at:$\r$\n${LAUNCHER}$\r$\n$\r$\nA log was saved to:$\r$\n$TEMP\llm-space-install-fail.log" /SD IDOK
    Abort "Extraction failed — launcher.exe missing."
  extraction_ok:

  # Shortcuts: the extractor's own PowerShell .lnk creation has silent-failure
  # semantics — delete whatever it did (or didn't) create, then create ours
  # deterministically. Same name, so nothing ever duplicates.
  SetOutPath "$INSTDIR\app\bin"
  Delete "$SMPROGRAMS\${SHORTCUT_NAME}"
  CreateShortCut "$SMPROGRAMS\${SHORTCUT_NAME}" "${LAUNCHER}" "" "${LAUNCHER}" 0
  Delete "$DESKTOP\${SHORTCUT_NAME}"
  # GUI installs recreate the desktop shortcut from the finish-page checkbox;
  # silent installs honor the checkbox default (on).
  IfSilent 0 +2
    Call CreateDesktopShortcut

  WriteUninstaller "$INSTDIR\uninstall.exe"

  # Real Add/Remove Programs entry (the extractor only drops a manual .reg
  # file inside the app dir).
  WriteRegStr HKCU "${REG_UNINSTALL}" "DisplayName" "${DISPLAY_NAME}"
  WriteRegStr HKCU "${REG_UNINSTALL}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${REG_UNINSTALL}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKCU "${REG_UNINSTALL}" "DisplayIcon" "${LAUNCHER}"
  WriteRegStr HKCU "${REG_UNINSTALL}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${REG_UNINSTALL}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKCU "${REG_UNINSTALL}" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegDWORD HKCU "${REG_UNINSTALL}" "NoModify" 1
  WriteRegDWORD HKCU "${REG_UNINSTALL}" "NoRepair" 1
  ${GetSize} "$INSTDIR\app" "/S=0K" $0 $1 $2
  WriteRegDWORD HKCU "${REG_UNINSTALL}" "EstimatedSize" $0

  # Leave $OUTDIR outside $PLUGINSDIR so its auto-cleanup isn't blocked.
  SetOutPath "$INSTDIR"
SectionEnd

Section "Uninstall"
  !insertmacro KILL_RUNNING_PROCESSES

  Delete "$SMPROGRAMS\${SHORTCUT_NAME}"
  Delete "$DESKTOP\${SHORTCUT_NAME}"

  DeleteRegKey HKCU "${REG_UNINSTALL}"
  # The extractor also drops a manual .reg file whose key is the bare app
  # identifier; clean it up in case the user imported it.
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_IDENTIFIER}"

  # Remove the whole channel dir (app + self-extraction + uninstall.exe).
  # User data lives elsewhere (%APPDATA%\llm-space) and is NEVER touched.
  RMDir /r "$INSTDIR"
  # Remove the identifier dir only if no other channel remains (non-recursive).
  RMDir "$LOCALAPPDATA\${APP_IDENTIFIER}"
SectionEnd
