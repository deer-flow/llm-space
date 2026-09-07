# Windows 本地开发环境与启动指南

本文面向需要在 Windows 上从源码运行 LLM Space 的开发者，包含两条路径：

- 当前计算机已经安装过依赖，只需要重新启动项目；
- 一台全新的 Windows 计算机，需要从零安装工具链、克隆代码并完成首次启动。

本文以 Windows 10/11 x64 和 PowerShell 为准。项目的主要交付物是 Electrobun 桌面应用，不是普通网站。

> [!IMPORTANT]
> 项目以 `mise` 作为任务入口、以 Bun 作为 JavaScript 运行时和包管理器。不要使用 `npm`、`pnpm` 或 `yarn` 安装依赖或启动项目。

## 1. 已配置计算机：快速启动

打开一个新的 PowerShell，进入仓库根目录：

```powershell
Set-Location "C:\path\to\llm-space"
```

确认 `5173` 没有被其他程序占用：

```powershell
Get-NetTCPConnection -State Listen -LocalPort 5173 -ErrorAction SilentlyContinue
```

如果命令没有输出，直接启动桌面应用：

```powershell
mise run dev
```

正常情况下会同时发生以下事情：

1. Vite 在 `http://localhost:5173` 启动渲染器 HMR 服务；
2. Vite 生成一次桌面渲染器构建；
3. Electrobun 启动 Bun 主进程和 Windows WebView2 窗口；
4. 标题为 **LLM Space** 的桌面窗口出现。

停止开发环境时，在启动命令所在终端按 `Ctrl+C`，并确认桌面窗口已经关闭。

## 2. 全新 Windows 计算机：从零配置

### 2.1 前置条件

| 项目       | 要求                                   | 说明                                                            |
| ---------- | -------------------------------------- | --------------------------------------------------------------- |
| 操作系统   | Windows 10/11 x64                      | 当前 Windows 构件使用 x64 Electrobun 核心。                     |
| PowerShell | Windows PowerShell 5.1 或 PowerShell 7 | 本文命令均使用 PowerShell。                                     |
| winget     | 可执行 `winget --version`              | Windows 的 App Installer 提供该命令。                           |
| Git        | Git for Windows                        | 用于克隆仓库和运行 Husky Git hooks。                            |
| WebView2   | Microsoft Edge WebView2 Runtime        | Windows 桌面渲染器的运行基础。大多数 Windows 10/11 已预装。     |
| 网络       | 能访问 GitHub 和包注册表               | 首次安装会下载 Bun、JavaScript 依赖和 Electrobun Windows 构件。 |

不需要单独安装 Node.js。Bun 会由项目锁文件控制版本。

### 2.2 安装 Git、mise 和 WebView2

在 PowerShell 中执行：

```powershell
winget install --id Git.Git --exact --accept-package-agreements --accept-source-agreements
winget install --id jdx.mise --exact --scope user --accept-package-agreements --accept-source-agreements
```

安装完成后关闭并重新打开 PowerShell，让新的用户 PATH 生效，然后验证：

```powershell
git --version
mise --version
```

项目要求的最低 mise 版本记录在 [`mise.toml`](../mise.toml) 中。若 WebView2 未安装或后续出现空白窗口，可执行：

```powershell
winget install --id Microsoft.EdgeWebView2Runtime --exact --accept-package-agreements --accept-source-agreements
```

### 2.3 可选：为安装过程配置 v2rayN 代理

如果 GitHub 直连较慢或出现 `ETIMEDOUT`，建议在执行克隆、安装和首次启动的同一个 PowerShell 会话中设置代理环境变量。

先查看 Windows 当前系统代理：

```powershell
Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" |
  Select-Object ProxyEnable, ProxyServer
```

v2rayN 的 HTTP 代理常见地址是 `127.0.0.1:10809`，但应以本机实际配置为准：

```powershell
$proxyUrl = "http://127.0.0.1:10809"
$env:HTTP_PROXY = $proxyUrl
$env:HTTPS_PROXY = $proxyUrl
```

测试代理能否访问 GitHub：

```powershell
curl.exe --proxy $proxyUrl -I https://github.com
```

这些环境变量只对当前 PowerShell 会话及其子进程生效。即使 Windows 系统代理已经打开，命令行下载器也不一定会自动继承它，因此显式设置环境变量更可靠。若已有 `NO_PROXY`，请确认其中没有 `github.com` 或 GitHub 的下载域名。

### 2.4 克隆仓库

以下示例把源码放到当前用户的 `source` 目录：

```powershell
$sourceRoot = Join-Path $env:USERPROFILE "source"
New-Item -ItemType Directory -Force -Path $sourceRoot | Out-Null
Set-Location $sourceRoot
git clone https://github.com/deer-flow/llm-space.git
Set-Location .\llm-space
```

如果代码已经存在，直接进入仓库根目录即可。后续命令都应在包含 `mise.toml` 和根 `package.json` 的目录执行。

### 2.5 信任配置并安装工具链与依赖

先查看 [`mise.toml`](../mise.toml) 中定义的工具和任务，确认无误后信任当前仓库：

```powershell
mise trust
```

执行一次性初始化：

```powershell
mise run setup
```

该任务会：

1. 根据 [`mise.lock`](../mise.lock) 安装精确锁定的 Bun 版本；
2. 执行 `bun install` 安装整个 monorepo 的依赖；
3. 运行项目的 `prepare` 脚本并配置 Husky hooks。

安装完成后验证：

```powershell
mise exec -- bun --version
mise tasks ls
```

Bun 的期望版本始终以 `mise.lock` 为准，不要在 workspace 中另外安装一个不同版本。

### 2.6 检查端口并首次启动

桌面渲染器固定使用 `5173`，而且 Vite 开启了 `strictPort`。启动前检查端口：

```powershell
Get-NetTCPConnection -State Listen -LocalPort 5173 -ErrorAction SilentlyContinue
```

确认端口空闲后启动：

```powershell
mise run dev
```

首次启动还会从 GitHub Release 下载与依赖版本匹配的 Electrobun CLI 和 Windows 核心组件。下载完成后会被缓存，后续启动不需要重复下载。若这里出现 GitHub 连接超时，请在同一终端按[代理配置](#23-可选为安装过程配置-v2rayn-代理)设置环境变量，再重新运行 `mise run dev`。

## 3. 如何确认启动成功

终端中应能看到类似信息：

```text
VITE ready
Local: http://localhost:5173/
HMR enabled: Using Vite dev server at http://localhost:5173
```

然后检查 Vite 页面：

```powershell
(Invoke-WebRequest -UseBasicParsing http://localhost:5173/).StatusCode
```

预期返回 `200`。检查桌面窗口是否响应：

```powershell
Get-Process |
  Where-Object MainWindowTitle -EQ "LLM Space" |
  Select-Object Id, ProcessName, MainWindowTitle, Responding
```

预期 `Responding` 为 `True`。应用首次打开后，可进入 **Settings → Models → Add provider** 配置模型服务。

## 4. Windows 平台说明

### 4.1 Windows 使用 WebView2

Windows 配置中的 `bundleCEF` 为 `false`，因此开发环境使用系统 WebView2。`mise run dev:cef` 的完整 CEF/CDP 配置当前只作用于 macOS Performance 版，不应把它当作 Windows 的默认调试入口。

Windows 日常开发请使用：

```powershell
mise run dev
```

### 4.2 HMR 与重启边界

- 修改 React、CSS 和其他渲染器代码时，Vite 通常会自动热更新；
- 修改 `apps/desktop/src/bun/` 下的 Bun 主进程代码时，需要停止并重新执行 `mise run dev`；
- 窗口启动时只探测一次 `5173`。若 Vite 尚未就绪而窗口加载了静态构建，等待 Vite 显示 ready 后重启整个开发命令。

### 4.3 本地数据目录

默认用户数据写入：

```text
%USERPROFILE%\.llm-space
```

其中包含 workspace、运行历史和设置。不要为了修复普通启动错误而直接删除该目录。

如需隔离测试数据，可在启动前临时覆盖：

```powershell
$env:LLM_SPACE_HOME = Join-Path $env:TEMP "llm-space-dev-data"
mise run dev
```

## 5. 常用开发命令

| 目的             | 命令                     | 说明                                 |
| ---------------- | ------------------------ | ------------------------------------ |
| 查看全部入口     | `mise tasks ls`          | 项目任务清单的权威入口。             |
| 初始化或补齐依赖 | `mise run setup`         | 安装锁定工具链并执行 `bun install`。 |
| 启动桌面应用     | `mise run dev`           | Vite HMR 使用 `5173`。               |
| 启动静态网站     | `mise run dev:web`       | 网站开发服务器默认使用 `5175`。      |
| 启动无头运行时   | `mise run dev:server`    | 启动 LLM Space runtime server。      |
| 运行测试         | `mise run test`          | 执行完整 Bun 测试套件。              |
| 检查当前改动     | `mise run check:changed` | 普通开发优先使用，只检查相关文件。   |
| 构建 canary      | `mise run build:canary`  | 构建本地 canary 桌面产物。           |

## 6. 常见问题

### 6.1 `mise` 不是可识别的命令

安装后先关闭并重新打开 PowerShell，再执行：

```powershell
Get-Command mise
winget list --id jdx.mise --exact
```

若 winget 显示已安装但当前终端仍找不到命令，通常是旧终端没有刷新用户 PATH。

### 6.2 `5173` 已被占用

先定位监听者：

```powershell
$portOwner = Get-NetTCPConnection -State Listen -LocalPort 5173 |
  Select-Object -First 1
$portOwnerId = $portOwner.OwningProcess
Get-CimInstance Win32_Process -Filter "ProcessId = $portOwnerId" |
  Select-Object ProcessId, Name, ExecutablePath, CommandLine
```

优先回到对应程序的终端正常停止它。只有确认它是可以结束的旧开发进程后，才执行：

```powershell
Stop-Process -Id $portOwnerId
```

不要让本项目自动切换到 `5174`：桌面主进程也固定探测 `5173`，否则可能加载错误页面。

### 6.3 Electrobun 下载出现 `ETIMEDOUT`

这通常是 GitHub 直连问题，不是项目编译错误。设置 `HTTP_PROXY` 和 `HTTPS_PROXY` 后重新执行：

```powershell
$proxyUrl = "http://127.0.0.1:10809"
$env:HTTP_PROXY = $proxyUrl
$env:HTTPS_PROXY = $proxyUrl
mise run dev
```

代理端口应以本机 v2rayN 配置为准。先重试启动，不要立即删除整个 `node_modules`；已完成的 Electrobun 组件会复用缓存。

### 6.4 窗口空白、未出现或 WebView2 报错

安装或修复 WebView2 Runtime，然后重启 PowerShell 和开发命令：

```powershell
winget install --id Microsoft.EdgeWebView2Runtime --exact --accept-package-agreements --accept-source-agreements
```

同时确认没有安全软件阻止仓库内的 Electrobun、launcher 或 Bun 子进程。

### 6.5 LLM Space 窗口显示了另一个 Vite 项目

说明启动前已有其他项目占用 `5173`。关闭 LLM Space，按 [6.2](#62-5173-已被占用) 找到并正常停止端口监听者，然后重新执行 `mise run dev`。

### 6.6 依赖安装异常

先重新执行项目提供的幂等初始化任务：

```powershell
mise run setup
```

不要改用 npm，也不要在没有确认原因前删除锁文件。若问题仍存在，保留完整错误日志，并同时记录以下输出：

```powershell
mise --version
mise exec -- bun --version
git status --short
```

## 7. 启动检查清单

- [ ] Windows 10/11 x64；
- [ ] `git --version` 正常；
- [ ] `mise --version` 满足 `mise.toml` 的最低版本；
- [ ] `mise exec -- bun --version` 与 `mise.lock` 一致；
- [ ] WebView2 Runtime 已安装；
- [ ] GitHub 和包注册表可访问，必要时已设置命令行代理；
- [ ] `5173` 未被其他程序占用；
- [ ] `mise run setup` 已成功完成；
- [ ] `mise run dev` 后 Vite 返回 HTTP 200；
- [ ] LLM Space 窗口出现且 `Responding=True`。

## 8. 配置来源

本文中的命令和平台行为以以下仓库文件为准：

- [`mise.toml`](../mise.toml)：工具版本范围和全部人类可用任务；
- [`mise.lock`](../mise.lock)：Bun 的精确版本和平台校验信息；
- [`package.json`](../package.json)：根 workspace 脚本；
- [`apps/desktop/package.json`](../apps/desktop/package.json)：桌面开发、HMR 和构建脚本；
- [`apps/desktop/vite.config.mts`](../apps/desktop/vite.config.mts)：`5173` 与 `strictPort`；
- [`apps/desktop/electrobun.config.ts`](../apps/desktop/electrobun.config.ts)：Windows WebView2/CEF 构建配置；
- [`apps/desktop/src/bun/app/window.ts`](../apps/desktop/src/bun/app/window.ts)：桌面窗口对 Vite 开发服务器的探测逻辑。
