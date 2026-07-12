# Windows 手动测试指南（首个 Windows 移植验证）

> English version: [Windows Manual Test Guide](./windows-manual-test.md).
>
> 目标读者：拥有 Windows 11 测试环境的测试人员 / agent。
> 预计耗时：30–45 分钟。请按顺序执行，逐项记录 ✅ / ❌ / 备注（含截图更佳）。

## 0. 获取被测包

1. 打开仓库 GitHub → Actions → **Windows branch build** workflow → 最新一次成功 run。
2. 下载 artifact `llm-space-win-x64-canary`，解压得到 GUI 安装器 `LLMSpace-Setup-canary.exe`。
   （electrobun 原始产物——Setup zip、tar.zst、update.json——在次级 artifact `llm-space-win-x64-canary-electrobun-raw` 里，仅调试打包本身时需要。）

环境要求：Windows 11 x64（§8 有一条可选的 Win10 冒烟项）。系统需有 WebView2 Runtime（Win11 自带）。

## 1. 安装与首启（阻塞级）

| # | 步骤 | 预期 |
|---|---|---|
| 1.1 | 双击 `LLMSpace-Setup-canary.exe` | SmartScreen 警告属预期（未签名）：「更多信息 → 仍要运行」后正常继续 |
| 1.2 | 安装向导 | 欢迎页 → 选项页（「Create a desktop shortcut」复选框，默认勾选）→ 安装进度 → 完成页（「Launch LLM Space」复选框，默认勾选）。无目录选择页（安装路径由更新器契约固定——有意为之）。**全程不闪任何控制台窗口** |
| 1.3 | 保持「Launch」勾选点 Finish | 应用启动，出现深色主界面（欢迎页或工作区），无控制台窗口。若首次运行弹出 Windows 防火墙提示，名称显示「LLM Space」（而非「Bun」）；提示本身属已知上游行为 |
| 1.4 | 开始菜单 | 开始菜单 → 程序根目录存在「LLM Space」项（未取消勾选则桌面也有快捷方式）；两者均显示 LLM Space 图标且可启动应用 |
| 1.5 | 应用管理 | 设置 → 应用 → 安装的应用里能看到「LLM Space (canary)」，版本号、发布者、图标正确，且提供卸载入口 |
| 1.6 | 任务栏图标 | 显示 LLM Space 图标（非默认 exe 图标），16px 下不模糊 |
| 1.7 | 数据目录 | `%APPDATA%\llm-space` 被创建，含 `workspace/`、`settings/` |
| 1.8 | 安装布局 | `%LOCALAPPDATA%\tech.deerflow.llm-space\canary\` 下有 `app\bin\launcher.exe`、`self-extraction\`、`uninstall.exe`（应用内更新器依赖这一精确布局） |

启动失败时：PowerShell 里 `$env:ELECTROBUN_CONSOLE=1; & "$env:LOCALAPPDATA\tech.deerflow.llm-space\canary\app\bin\launcher.exe"` 抓控制台输出附在报告里。

## 2. 窗口 chrome（本移植的最大风险面）

| # | 步骤 | 预期 |
|---|---|---|
| 2.1 | 观察窗口 | 无系统标题栏；右上角有自绘的 ➖ ▢ ✕ 三键 |
| 2.2 | 悬停 ✕ | 背景变红（#C42B1C），图标变白 |
| 2.3 | 三键逐个点击 | 最小化 / 最大化↔还原 / 关闭均生效 |
| 2.4 | 拖动顶部标签条空白区 | 可拖动窗口 |
| 2.5 | 双击标签条空白区 | 最大化 ↔ 还原 |
| 2.6 | 窗口边缘拖拽 | 八方向均可调整大小，窗口有阴影 |
| 2.7 | **Snap**：Win+←/→、拖到屏幕边缘 | 正常贴边分屏 |
| 2.8 | **Snap Layouts**：悬停自绘最大化按钮 | （已知风险项）记录是否出现布局面板；不出现不算失败，请标注 |
| 2.9 | 最大化状态下关闭重开 | 恢复最大化；普通状态下移动/缩放后重开恢复位置 |
| 2.10 | 侧栏收起（Ctrl+B 两次观察） | 左上角切换按钮不悬空、无为 mac 红绿灯预留的空白；侧栏头部显示 "LLM Space 4" 标题 |

## 3. 快捷键（Windows 无菜单栏，全部来自应用内 keymap）

逐条验证，重点关注与浏览器默认行为的冲突（WebView2 可能吞掉 Ctrl+N/W 等——发现被吞必须记录）：

| 快捷键 | 预期 |
|---|---|
| `Ctrl + Shift + P` | 打开 Command Palette |
| `Ctrl + ,` | 打开 Settings |
| `Ctrl + N` / `Ctrl + Shift + N` | 新建 Thread / 新建文件夹 |
| `Ctrl + W` / `Ctrl + Shift + T` | 关闭标签页 / 重新打开 |
| `Ctrl + B` | 切换侧栏 |
| `Ctrl + +` `Ctrl + -` `Ctrl + 0` | 缩放（见 §4） |
| `Ctrl + Alt + ←/→` | 切换标签页 |
| `F11` | 进入/退出全屏；全屏时自绘窗口按钮隐藏 |
| `Ctrl + Shift + R` | 重载应用 |
| 编辑器内 `Ctrl + Enter` | 运行 Thread（需先配好模型，可与 §6 合并验证） |

## 4. 页面缩放（CSS zoom 兜底路径）

| # | 步骤 | 预期 |
|---|---|---|
| 4.1 | `Ctrl + +` ×3 | 界面整体放大，布局不破 |
| 4.2 | `Ctrl + 0` → `Ctrl + -` ×2 | 恢复 100% → 缩小 |
| 4.3 | 设为 120% 后 `Ctrl + Shift + R` 重载 | 缩放保持 120% |
| 4.4 | 设为 120% 后退出应用重开 | 缩放保持 120% |

## 5. 文件操作与 OS 集成

| # | 步骤 | 预期 |
|---|---|---|
| 5.1 | 侧栏新建文件/文件夹、重命名、复制 | 均正常 |
| 5.2 | 文件右键 → 「Reveal in Explorer」 | 打开资源管理器并选中该文件（文案不是 "Finder"） |
| 5.3 | 文件右键 → 「Move to Recycle Bin」 | 确认框 → 文件进回收站（可还原） |
| 5.4 | Command Palette 搜 "Reveal" / "Recycle" | 命令面板同样显示 Explorer / Recycle Bin 文案 |
| 5.5 | Help 类命令（View Documentation 等，经 Command Palette） | 默认浏览器打开链接 |
| 5.6 | 运行按钮 tooltip / 侧栏 tooltip | 显示 `Ctrl` 而非 `⌘` |

## 6. Agent 运行与内置工具（需任一模型 API key）

在 Settings → Models 配置一个可用模型后，新建 Thread：

| # | 步骤 | 预期 |
|---|---|---|
| 6.1 | 简单对话 run | 流式输出正常、可中断（Ctrl+Enter 再按一次停止） |
| 6.2 | 启用内置 bash 工具，让模型执行 `列出当前目录` | **装有 Git Bash 的机器**：按 bash 语义执行；**未装**：工具描述显示 PowerShell，命令按 PowerShell 执行成功 |
| 6.3 | 启用 grep 工具，让模型在 workspace 里搜索文本 | 正常返回结果（验证捆绑的 rg.exe） |
| 6.4 | ls / read / write 等文件工具 | 路径显示为 Windows 反斜杠风格，读写正常 |

## 7. 自动更新链（分支包可只验前半段）

| # | 步骤 | 预期 |
|---|---|---|
| 7.1 | Command Palette → "Check for Updates..." | 不崩溃；分支包无 feed，报「无更新/检查失败」均可接受，但需记录提示文案 |
| 7.2 | （待第一个正式 canary tag 发布后）安装旧版 → 检查更新 | 下载 → "Restart to update" → 重启后为新版本（此项由发布流程回归，可跳过） |

## 8. 可选扩展项

| # | 步骤 | 预期 |
|---|---|---|
| 8.1 | Win10 x64 虚拟机重复 §1 + §2.1-2.6 | 尽力兼容项：能跑最好，问题记录为已知限制，不阻塞 |
| 8.2 | 150% 系统 DPI 缩放显示器 | 以应用启动时的缩放比例渲染清晰，布局填满窗口。会话中途更改缩放（或移到不同缩放的显示器）可能模糊，重启应用恢复——已知限制：逐显示器 DPI 需要 electrobun 上游支持 |
| 8.3 | 浅色系统主题下观察窗口阴影/边框 | 无明显视觉瑕疵 |

## 9. 卸载验证（最后执行——会移除安装）

| # | 步骤 | 预期 |
|---|---|---|
| 9.1 | 退出应用，设置 → 应用 → 安装的应用 → 「LLM Space (canary)」→ 卸载 | 弹出 NSIS 卸载器确认页，确认后正常执行完毕 |
| 9.2 | 安装目录 | `%LOCALAPPDATA%\tech.deerflow.llm-space\canary\` 整体消失（app、self-extraction、uninstall.exe） |
| 9.3 | 快捷方式 | 开始菜单项与桌面快捷方式均被移除 |
| 9.4 | 应用管理 | 「LLM Space (canary)」条目消失 |
| 9.5 | **用户数据保留** | `%APPDATA%\llm-space`（workspace、settings、已配置模型）原样保留；重装后此前的工作区恢复 |

## 报告格式

```
环境：Windows 11 <版本号> / <物理机|VM> / DPI 缩放 <100%|150%> / Git Bash <有|无>
结果：§1 ✅✅✅✅ · §2 ... （逐项）
阻塞问题：<编号 + 现象 + 复现步骤 + 截图/控制台输出>
非阻塞观察：<...>
```

已知预期差异（不算 bug）：SmartScreen 首装警告（未签名）；§2.8 Snap Layouts 面板可能不出现；§7.1 分支包检查更新报错。
