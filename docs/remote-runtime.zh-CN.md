[English](./remote-runtime.md) | 中文

---

# 通过 SSH 使用 Remote Runtime

Remote Runtime 允许桌面 UI 通过 SSH 连接一台 Linux 机器，并在远端运行 LLM Space runtime。本地桌面负责窗口和交互；远端机器负责该 runtime 的 workspace、模型配置、MCP、tools、skills 和网络访问。

## 推荐的 SSH 配置方式

使用系统 OpenSSH 配置。LLM Space 调用系统 `ssh` 命令，并复用与你在终端里相同的配置文件和行为。

macOS 和 Linux 的标准配置文件是：

```text
~/.ssh/config
```

Windows OpenSSH 的用户配置通常是：

```text
%USERPROFILE%\.ssh\config
```

典型 Host alias 示例：

```sshconfig
Host llm-devbox
  HostName 203.0.113.10
  User qiangenchao
  Port 22
  IdentityFile ~/.ssh/id_ed25519
  # 可选示例：
  # ProxyJump jump-host
  # ForwardAgent yes
```

然后在 LLM Space 里新增 Remote Server：

- **Name**：展示名，例如 `Devbox`
- **Host**：OpenSSH Host alias，例如 `llm-devbox`
- **User**：可选；如果 `~/.ssh/config` 里已经配置 `User`，这里可以留空

LLM Space 只保存这些字段。端口、私钥、跳板机、代理命令、agent 行为等 SSH 层配置，统一写在 `~/.ssh/config`。

## 密码和私钥 passphrase

LLM Space 不保存 SSH 密码，也不保存私钥 passphrase。

如果你的 SSH 需要认证，请使用 OpenSSH 的标准机制：ssh-agent、macOS Keychain，或系统密码/passphrase 弹窗。最简单的检查方式是：

```sh
ssh llm-devbox
```

如果这个命令在终端里连不上，请先修好 SSH，再回到 LLM Space 连接。

LLM Space 在检测平台和准备 runtime 时可能会调用多次短 `ssh` 命令。为了获得稳定体验，请先确保 `ssh <alias>` 在终端里能稳定连接，最好通过 ssh-agent 或系统 Keychain 完成认证。纯密码连接可能触发多次系统提示。

## 连接进度

点击 Connect 后，LLM Space 会展示关键阶段：

1. 检查 SSH 访问
2. 检测远端平台
3. 准备或下载远端 runtime
4. 启动远端 runtime
5. 建立 SSH tunnel
6. 验证远端 runtime
7. 连接成功

Remote Servers 页面还会展示 **Connection flow** 时间线，包含 SSH、Host key、Platform、Install runtime、Start server、Tunnel 和 Health check。连接失败时，失败步骤会保留详细信息，帮助判断失败发生在 SSH 认证、包安装、server 启动、隧道创建，还是 runtime 健康检查。

复用已安装的远端 runtime 包之前，LLM Space 会同时校验 `server-manifest.json` 和可执行文件 `bin/llm-space-server`。如果之前安装留下了残缺版本目录，例如 manifest 存在但二进制缺失或不可执行，本次连接会在安装阶段把它视为未完整安装并重新安装该版本。

默认安装目录 `~/.llm-space/remote-runtime` 会在 SSH 服务器上解析为该用户的 `$HOME/.llm-space/remote-runtime`；它不会在本机解析，也不应该在服务器上创建字面量 `~/` 目录。启动或 health check 失败不会触发自动重装 retry。如果安装后 `bin/llm-space-server` 缺失或不可执行，LLM Space 会直接报错，并附带 best-effort 远端诊断快照，包括 `$HOME`、`PWD`、安装目录、entrypoint 是否存在、是否可执行、manifest 内容，以及可能存在的字面量 `~/` 安装产物。重新连接前，优先检查安装目录权限、磁盘空间、外部清理任务和遗留的字面量 `~/` 目录。

如果启动或 health check 报远端 runtime 端口已被占用，通常是 `39123`，LLM Space 会检查监听进程是否是同一远端安装目录下遗留的 `llm-space-server`，例如 `~/.llm-space/remote-runtime/versions/<old-version>/bin/llm-space-server --host 127.0.0.1 --port 39123`。确认归属后，LLM Space 会停止这个 stale server，并对当前连接重试一次。LLM Space 不会停止无法确认归属或非 LLM Space 的进程；这种情况下请先在 SSH 目标机器上手动检查并停止占用进程，再重新连接。

## Host key 校验失败

OpenSSH 会阻止你连接身份未知或身份发生变化的主机。LLM Space 会把这两类情况分开处理。

首次连接某个 Host alias 或 IP 时，LLM Space 会展示主机 key type 和 SHA256 fingerprint。只有当你确认该 fingerprint 属于目标服务器后，才点击 **Trust and continue**。确认后，LLM Space 会把该 host key 写入 OpenSSH 的 `known_hosts`，后续连接会静默通过。

如果 LLM Space 报 SSH host key changed，不要直接删除 `known_hosts`，也不要寻找 “ignore host key”。这可能只是服务器重装或 IP 复用，也可能是真实的中间人攻击。

先向基础设施提供方或管理员确认主机身份。确认变更是预期行为之后，再按 OpenSSH 提示更新对应行，例如：

```text
/Users/bytedance/.ssh/known_hosts line 6
```

在 changed-key 弹窗中，LLM Space 会展示新的 fingerprint、`known_hosts` 文件和 offending line。只有勾选已确认主机身份后，才允许替换旧记录并继续连接。

常用诊断命令：

```sh
ssh -vvv llm-devbox
ssh -G llm-devbox
ssh-keygen -F llm-devbox -f ~/.ssh/known_hosts
```

如果 LLM Space 无法自动写入或替换 `known_hosts`，请在 Terminal 中执行一次 `ssh llm-devbox` 完成 OpenSSH 的标准确认流程；changed-key 场景请先确认主机身份，再按 OpenSSH 提示处理 stale entry。

LLM Space 不提供 “ignore host key” 按钮，因为绕过 host key 校验可能掩盖真实的中间人攻击。

## 下载 remote runtime 超时

如果进度到 **Downloading remote runtime package** 后报 server-install timeout，说明 SSH 已经通了。失败点是远端 Linux 机器没有在限定时间内下载完 `llm-space-server` release 包。

新版 LLM Space 会自动走二段式安装：先让远端服务器直接下载 GitHub release 包；如果远端下载失败，会改为在运行 Desktop 的本机下载同一个包，缓存到本机 settings 目录，再通过 SSH 上传到远端的 runtime downloads 目录并继续安装。

在 Mac 上这样检查远端网络：

```sh
ssh llm-devbox 'curl -I -L --connect-timeout 15 https://github.com/deer-flow/llm-space/releases/latest'
```

如果该命令卡住或失败，但 LLM Space 仍然连接成功，说明本地下载上传 fallback 生效了。

如果 fallback 后仍失败，按错误详情区分：本地无法访问 GitHub 时，修运行 Desktop 这台机器的网络或代理；上传失败时，检查 SSH 是否允许写入远端安装目录；远端安装失败时，检查远端磁盘空间、`tar` 是否可用、`~/.llm-space/remote-runtime` 权限、是否有外部清理任务，以及 remote install dir 是否配置错误。
