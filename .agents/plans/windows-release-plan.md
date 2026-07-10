# Windows 发行版本方案 — llm-space

日期：2026-07-10 · 基线：Electrobun ^1.18.1 · Bun 1.3 · 当前发行仅 macOS arm64 + x64

## 0. 结论

**可行，且时机合适。** Electrobun 官方支持 Windows 11+ x64（系统 WebView2 内核，ARM64 走模拟运行 x64），
v1.18.0 稳定了 Windows 无边框窗口（保留 resize 边框 + DWM 阴影），v1.18.1 修复了 Windows
updater 的 canary/beta 路径 bug 与 bspatch 崩溃——正是我们锁定的版本线。核心业务代码
（RPC 桥、线程存储、流式 reducer）天然跨平台；工作量集中在 **发布管线、窗口 chrome、
快捷键/文案适配、两个内置 agent 工具** 四块。

## 1. 调研 A：Electrobun 的 Windows 能力（框架侧事实）

| 能力 | 状态 | 要点 |
|---|---|---|
| 目标平台 | ✅ 官方 | Windows 11+，仅 x64 产物；ARM64 经系统模拟运行 |
| 渲染内核 | ✅ | 系统 WebView2（Chromium 系）；可选 bundleCEF（+100MB）。我们 mac 默认用原生 WKWebView，Windows 用 WebView2 反而与 Web 标准更一致 |
| 构建 | ⚠️ 仅本机构建 | 无交叉编译；官方推荐 GitHub Actions 平台矩阵，Windows runner 上跑 `electrobun build --env=…` |
| 产物 | ✅ | `{channel}-win-x64-update.json` / `…-Setup.zip`（内含自解压 Setup.exe）/ `…-tar.zst` / `….patch`，与现有 `updates` feed 模型完全一致 |
| 自动更新 | ✅（1.18.1 起） | 同一 Updater API（check/download/apply），bsdiff 补丁链同 mac；我们 `bun/updates/` 代码零改动 |
| 窗口 | ✅/⚠️ | `titleBarStyle` 全平台可用；`hiddenInset` 在 Windows 等价于 `hidden`（无边框）；`trafficLightOffset` 在 Windows 被忽略；1.18 修复无边框 + Aero Snap 支持 |
| 应用菜单 | ⚠️ 受限 | Windows 支持 ApplicationMenu（窗内菜单栏），但 accelerator 仅可靠支持单字符（Ctrl+S 类）；复杂组合（Ctrl+Shift+P）"may not work"；mac 专属 role（hide/hideOthers/showAll 等）需移除 |
| 页面缩放 | ❌ 文档标注 no-op | `setPageZoom/getPageZoom` 仅 macOS WebKit 实现；Windows 需渲染层兜底 |
| 图标 | ✅ | `build.win.icon` 指向 `.ico` 或 `.png`（构建期自动转 ICO） |
| Windows 代码签名 | ❌ CLI 无内置 | CLI 源码无 signtool/PFX 逻辑（mac 签名/公证是内置的）；需 postPackage hook 自接 signtool / Azure Trusted Signing，或社区工具 electrobun-builder（NSIS/WiX/MSIX + 签名） |
| URL scheme / 文件关联 | ❌ Windows 未支持 | 本应用未使用，无影响 |
| 调试 | ✅ | Windows 构建为 GUI 子系统；`ELECTROBUN_CONSOLE=1` 可附加控制台看日志 |

## 2. 调研 B：Windows 桌面 UI 最佳实践（对本应用的适用子集）

来源：Microsoft Fluent/标题栏定制指南 + 主流深色开发工具（VS Code/Slack/Linear）惯例。

**必须遵守（用户肌肉记忆级）**
1. 窗口控制在**右侧**，顺序 最小化/最大化(还原)/关闭；关闭键 hover 红（#C42B1C）。
2. 自绘标题栏需保住系统行为：双击最大化/还原、拖拽、右键系统菜单、Win11 **Snap Layouts**
   （悬停最大化按钮出布局面板）、贴边分屏。Electrobun 1.18 的无边框修复 + Aero Snap 支持覆盖大头，需实测。
3. 快捷键 Ctrl 替代 Cmd；F11 全屏（mac 的 Cmd+Ctrl+F 概念不存在）；UI 中显示 `Ctrl+…` 而非 `⌘`。
4. 文案：Finder→文件资源管理器（Reveal in File Explorer / Show in Folder）、Trash→回收站。
5. 未签名 exe 触发 SmartScreen 拦截页（"更多信息→仍要运行"）；签名 + 下载量积累信誉后消失。

**已达标（无需动）**
- 深色主题、自绘细滚动条（`::-webkit-scrollbar`，WebView2 同为 Chromium 引擎，生效）。
- 字体栈 `"Geist Variable", system-ui`（自带变量字体 + Segoe UI 兜底）。
- 高 DPI：WebView2 自动处理。

**可不做（明确排除）**
- Mica/Acrylic 背景材质：Electrobun 未暴露 DWM backdrop API，且本应用为不透明深色主题，收益趋零。
- 任务栏 Jump List、系统通知、托盘：当前功能面不需要。

## 3. 现状审计（代码库全量扫描结论）

**已就绪（仅需回归验证）**：fs reveal/trash 已有 win32 分支（explorer /select、PowerShell 回收站）、
locale 检测（powershell Get-UICulture）、env hydrate 已显式 win32 早退、路径全部 `os.homedir()+path.join`、
`~` 展开兼容反斜杠、headerpad 修复脚本自动 no-op、`win: { bundleCEF: false }` 配置桩已存在。

**阻塞级（不做无法发行/核心功能缺失）**
| # | 位置 | 问题 |
|---|---|---|
| B1 | `.github/workflows/release.yml` | 构建矩阵仅 macos-15/macos-15-intel；签名/公证/冒烟测试/发布 glob（`*.dmg`）全为 mac 专属 |
| B2 | `apps/desktop/icon.iconset/` | 无 `.ico`；`electrobun.config.ts` win 块无 icon 字段 |
| B3 | `src/bun/app/window.ts:43-48` | `titleBarStyle: "hiddenInset"` + `trafficLightOffset` — Windows 下为无边框窗口且无任何窗口控制按钮 |
| B4 | `src/bun/app/menu.ts:18-44` | mac 应用菜单结构（about/hide/hideOthers/showAll/quit role）；`Option+Left/Right`（148,153）应为 Alt；全屏应为 F11 |
| B5 | `src/bun/tools/built-in/fs.ts:604,487` | agent 的 bash 工具 spawn `bash -c`、grep 工具 spawn `rg` — 裸 Windows 均不存在 |
| B6 | 更新 feed | 代码零改动，但 CI 不产 win 产物则 Windows 安装无 feed 可拉（随 B1 解决） |

**视觉/正确性级**
| # | 位置 | 问题 |
|---|---|---|
| V1 | `thread-tabs.tsx:243-248`、`file-system-tree-view.tsx:390` | 为 mac 红绿灯预留的左侧 padding / 标题隐藏逻辑，Windows 下错位 |
| V2 | `code-editor/editor.tsx:226`、`code-editor/index.tsx:217`、`message-list-item.tsx:144`、`tool-call-list-item.tsx:92` | 仅判 `e.metaKey` 无 ctrlKey 兜底，Windows 下快捷键静默失效 |
| V3 | `thread-tabs.tsx:256`、`thread-playground.tsx:325` | 硬编码 `⌘ B` / `⌘ Enter` 标签 |
| V4 | `shared/commands.ts:342-343` | 命令注册表硬编码 "Move to Trash" / "Reveal in Finder"（命令面板会露出）；右键菜单虽已有 `_isWindows` 切换但注册表没走 |
| V5 | `setPageZoom` 依赖（`window-state.ts`、菜单缩放项） | Windows no-op，缩放功能失效 |

## 4. 决策点（8 组，见 HTML 交互页）

- **A · 窗口 chrome**：A1 系统标题栏（稳，快，但深色应用顶着一条可能是浅色的原生栏，且与 mac 形态不一致）／ A2 无边框自绘标题栏 + 自绘 min/max/close（与现 UI 形态延续——顶部 tab 条已是拖拽区，VS Code 式；依赖 1.18 无边框修复，需实测 Snap Layouts）／ A3 先 A1 发首版，二期做 A2。**推荐 A2**（现 UI 就是 frameless 形态，A1 反而多出一条重复 chrome）。
- **B · 应用菜单**：B1 Windows 装原生窗内菜单栏（结构重排 + 单字符 accelerator 限制，复杂快捷键仍需渲染层兜底）／ B2 Windows 不装菜单，快捷键全量下沉到渲染层统一 keymap，入口靠命令面板 + 右键 +（若 A2）标题栏 ☰ 按钮。**推荐 B2**（menu.ts 动作本就全部路由到 Command 层，渲染层 keymap 是单一跨平台事实源；mac 保留原生菜单不动）。
- **C · 代码签名**：C0 SignPath Foundation 免费 OSS 签名（本仓库 MIT + public + CI 构建，条件全满足；发布者显示 "SignPath Foundation"；需申请审核周期）／ C1 首发不签名（SmartScreen 提示仅首装触发——自动更新写入无 MOTW 不会弹；canary 可接受）／ C2 Azure Trusted Signing（约 $9.99/月，发布者显示自己身份）／ C3 传统 OV/EV 证书。**推荐 C1 发 canary → 同步申请 C0 → stable 用 C0 签名**，全程 $0；配套提交 winget manifest（零成本、开发者主流安装路径、无 SmartScreen 弹窗体验）。注意：签名须发生在打包/哈希生成之前（postBuild/postWrap hook 位），否则 updater 哈希与补丁链失配——落地前需验证 hook 时序。排除项：Microsoft Store（需 MSIX 重打包且与 Electrobun bsdiff 自更新冲突）、自签名证书（对 SmartScreen 无效）。
- **D1 · bash 工具**：探测 Git Bash（开发者机器普遍有）→ 有则用，无则回退 PowerShell 并改写工具描述 ／ 纯 PowerShell ／ 无 Git Bash 则禁用并 UI 提示。**推荐 探测+回退**。
- **D2 · rg**：随包捆绑 rg.exe（~2MB，MIT/UNLICENSE，build.copy 加平台分支）／ PATH 探测 + 缺失时友好报错。**推荐 捆绑**。
- **E · 数据目录**：维持 `~/.llm-space`（即 `C:\Users\<u>\.llm-space`，零改动，`LLM_SPACE_HOME` 覆盖机制不变）／ Windows 改用 `%APPDATA%\llm-space`（更合惯例，但首发就引入迁移逻辑）。**推荐 维持**。
- **F · 页面缩放**：渲染层 CSS zoom 兜底（`document.documentElement` zoom，win 分支走它，mac 继续原生）／ Windows 隐藏缩放命令等上游。**推荐 兜底**（先实测 WebView2 下 setPageZoom 是否真 no-op，文档口径以 CEF 为主）。
- **H · Win10 支持口径**：Electrobun 官方仅承诺 Win11+（上游只在 Win11 测试），但 WebView2/Bun/DirectComposition 技术栈完整覆盖 Win10，且 Win10 已于 2025-10 EOL。H1 系统要求写 Win11+，安装器不阻止 Win10，P0 顺手 Win10 VM 冒烟一次，Win10 专属 bug 标记已知限制不修 ／ H2 严格 Win11+（安装器/文档明确拒绝）／ H3 正式支持 Win10（承诺修 bug，不推荐——为 EOL 系统背长期负担）。**推荐 H1**。

## 5. 无争议改造（默认全做，HTML 页可逐项取消）

1. V2 四处 `metaKey` → `metaKey || ctrlKey`（提取 `isModEnter(e)` 工具）。
2. 平台化快捷键展示：`lib/platform.ts`（`navigator.userAgent` 判定，沿用现有先例）+ `Kbd` 调用点改 `Ctrl` / `⌘` 自适应（V3）。
3. `shared/commands.ts` 标签平台化（V4，与 node-actions/thread-tabs 现有 `_isWindows` 逻辑合流为单一 helper）。
4. 红绿灯 padding / 侧栏标题隐藏逻辑按平台 gate（V1）。
5. `menu.ts`：`Option`→`CommandOrControl+Alt`、全屏 accelerator 平台化（B4 一部分；菜单整体结构随决策 B）。
6. `electrobun.config.ts`：win 块补 `icon`；`useCefRenderer` 逃生舱同样作用于 win（`dev:cef` 在 Windows 也可用）。
7. 生成多尺寸 `.ico`（16/32/48/256，源自现 iconset 512px PNG）。
8. CI：release.yml 加 `windows-latest` 矩阵项、win 冒烟测试（起进程→tasklist→taskkill + `ELECTROBUN_CONSOLE=1` 抓日志）、发布 glob 加 `*-Setup.zip`、release notes 加 Windows 下载说明。
9. 文档：AGENTS.md「Releases ship for macOS arm64 + x64」段、`docs/settings.md` 菜单路径描述、`docs/shortcut-keys*.md` 校对。

## 6. 实施阶段

- **P0 · 本地跑通**（前置：需要一台 Windows 11 实机或 VM）：`bun dev` 起来、RPC/存储/流式回归、实测 setPageZoom / 无边框行为 / WebView2 渲染差异。
- **P1 · CI canary**：B1/B2 + 无争议项 6-8；发出第一个未签名 `canary-win-x64` 产物；验证安装→自动更新链（1.18.1 修复项重点回归）。
- **P2 · UI/快捷键适配**：决策 A/B 落地 + 无争议项 1-5 + D1/D2/F。
- **P3 · stable + 签名**：决策 C 落地（SignPath 申请在 P1 即可并行发起）、签名时序验证、winget manifest 提交、文档（项 9）、AGENTS.md 更新、对外 release notes。

**风险清单**：① Windows 实机验证资源（P0 硬前置）；② 自绘标题栏的 Snap Layouts/系统菜单完整度依赖 Electrobun 1.18 新代码，成熟度未知——A2 需在 P0 实测后才能最终确认，留 A1 为回退；③ 签名与补丁哈希的时序（C2 前研究）；④ WebView2 与 mac WKWebView 的渲染差异（CodeMirror/Tailwind OKLch 均为 Chromium 友好，风险低但需过一遍）。
