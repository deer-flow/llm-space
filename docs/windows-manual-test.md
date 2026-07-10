# Windows Manual Test Guide (first Windows port verification)

> For Chinese, see [Windows 手动测试指南](./windows-manual-test.zh-CN.md).
>
> Audience: a tester / agent with a Windows 11 test environment.
> Estimated time: 30–45 minutes. Work through the sections in order and record ✅ / ❌ / notes for each item (screenshots welcome).

## 0. Get the build under test

1. Open the repository on GitHub → Actions → **Windows branch build** workflow → the latest successful run.
2. Download the `llm-space-win-x64-canary` artifact and unzip it; it contains `canary-win-x64-LLMSpace-Setup-canary.zip` and friends.
3. Unzip `*-Setup*.zip` to get the Setup exe.

Environment: Windows 11 x64 (§8 has one optional Win10 smoke item). The system needs the WebView2 Runtime (bundled with Windows 11).

## 1. Install and first launch (blocking)

| # | Step | Expected |
|---|---|---|
| 1.1 | Double-click the Setup exe | A SmartScreen warning is expected (unsigned build): "More info → Run anyway" continues normally |
| 1.2 | Finish the self-extracting install and launch | The app starts with the dark main UI (welcome screen or workspace), no console window |
| 1.3 | Taskbar icon | Shows the LLM Space icon (not the default exe icon), crisp at 16px |
| 1.4 | Data directory | `%APPDATA%\llm-space` is created, containing `workspace/` and `settings/` |

If launch fails: in PowerShell run `$env:ELECTROBUN_CONSOLE=1; & "<install path>\LLM Space.exe"` and attach the console output to your report.

## 2. Window chrome (the biggest risk area of this port)

| # | Step | Expected |
|---|---|---|
| 2.1 | Observe the window | No system title bar; self-drawn ➖ ▢ ✕ buttons in the top-right corner |
| 2.2 | Hover ✕ | Background turns red (#C42B1C), glyph turns white |
| 2.3 | Click each of the three buttons | Minimize / maximize↔restore / close all work |
| 2.4 | Drag the empty area of the top tab strip | Window moves |
| 2.5 | Double-click the empty tab-strip area | Maximize ↔ restore |
| 2.6 | Drag the window edges | Resizable in all eight directions; the window has a DWM shadow |
| 2.7 | **Snap**: Win+←/→, drag to screen edges | Normal snap/split behavior |
| 2.8 | **Snap Layouts**: hover the self-drawn maximize button | (Known risk item) Record whether the layout flyout appears; its absence is not a failure, but note it |
| 2.9 | Close while maximized, then reopen | Restores maximized; after moving/resizing in normal state, position is restored on reopen |
| 2.10 | Collapse the sidebar (press Ctrl+B twice and watch) | The toggle button in the top-left doesn't float oddly and there is no blank inset reserved for macOS traffic lights; the sidebar header shows the "LLM Space 4" title |

## 3. Keyboard shortcuts (no menu bar on Windows — all from the in-app keymap)

Verify each row. Pay special attention to conflicts with browser default behavior (WebView2 may swallow Ctrl+N/W etc. — any swallowed chord MUST be recorded):

| Shortcut | Expected |
|---|---|
| `Ctrl + Shift + P` | Opens the Command Palette |
| `Ctrl + ,` | Opens Settings |
| `Ctrl + N` / `Ctrl + Shift + N` | New Thread / new folder |
| `Ctrl + W` / `Ctrl + Shift + T` | Close tab / reopen closed tab |
| `Ctrl + B` | Toggle sidebar |
| `Ctrl + +` `Ctrl + -` `Ctrl + 0` | Zoom (see §4) |
| `Ctrl + Alt + ←/→` | Switch tabs |
| `F11` | Enter/exit fullscreen; the self-drawn window buttons hide in fullscreen |
| `Ctrl + Shift + R` | Reload the app |
| `Ctrl + Enter` inside an editor | Run the Thread (needs a configured model; can be combined with §6) |

## 4. Page zoom (the CSS-zoom fallback path)

| # | Step | Expected |
|---|---|---|
| 4.1 | `Ctrl + +` ×3 | The whole UI scales up without breaking layout |
| 4.2 | `Ctrl + 0` → `Ctrl + -` ×2 | Back to 100% → scales down |
| 4.3 | Set 120%, then `Ctrl + Shift + R` to reload | Zoom stays at 120% |
| 4.4 | Set 120%, quit and relaunch | Zoom stays at 120% |

## 5. File operations and OS integration

| # | Step | Expected |
|---|---|---|
| 5.1 | Create file/folder in the sidebar, rename, duplicate | All work |
| 5.2 | File context menu → "Reveal in Explorer" | Opens File Explorer with the file selected (label is NOT "Finder") |
| 5.3 | File context menu → "Move to Recycle Bin" | Confirm dialog → file goes to the Recycle Bin (restorable) |
| 5.4 | Search "Reveal" / "Recycle" in the Command Palette | Palette shows the Explorer / Recycle Bin wording too |
| 5.5 | Help-style commands (View Documentation etc., via the palette) | Open in the default browser |
| 5.6 | Run-button tooltip / sidebar tooltip | Show `Ctrl`, not `⌘` |

## 6. Agent runs and built-in tools (needs any model API key)

Configure a working model in Settings → Models, then create a Thread:

| # | Step | Expected |
|---|---|---|
| 6.1 | Simple conversation run | Streaming output works and can be aborted (press Ctrl+Enter again to stop) |
| 6.2 | Enable the built-in bash tool, ask the model to "list the current directory" | **Machines with Git Bash**: executes with bash semantics; **without**: the tool description says PowerShell and the command succeeds as PowerShell |
| 6.3 | Enable the grep tool, ask the model to search text in the workspace | Returns results normally (validates the bundled rg.exe) |
| 6.4 | ls / read / write and other file tools | Paths display in Windows backslash style; reads/writes work |

## 7. Auto-update chain (branch builds can only verify the first half)

| # | Step | Expected |
|---|---|---|
| 7.1 | Command Palette → "Check for Updates..." | No crash; a branch build has no feed, so "no update / check failed" is acceptable — record the exact message |
| 7.2 | (After the first tagged canary ships) install an older version → check for updates | Download → "Restart to update" → relaunches on the new version (covered by the release flow; may skip) |

## 8. Optional extras

| # | Step | Expected |
|---|---|---|
| 8.1 | Repeat §1 + §2.1–2.6 in a Win10 x64 VM | Best-effort support: working is great, problems are recorded as known limitations, non-blocking |
| 8.2 | A display at 150% system DPI scaling | UI stays sharp, no blurriness |
| 8.3 | Observe window shadow/border under a light system theme | No obvious visual glitches |

## Report format

```
Environment: Windows 11 <build> / <physical|VM> / DPI scaling <100%|150%> / Git Bash <yes|no>
Results: §1 ✅✅✅✅ · §2 ... (item by item)
Blocking issues: <number + symptom + repro steps + screenshot/console output>
Non-blocking observations: <...>
```

Known expected differences (not bugs): the SmartScreen warning on first install (unsigned); the Snap Layouts flyout in §2.8 may not appear; the update check error in §7.1 on branch builds.
