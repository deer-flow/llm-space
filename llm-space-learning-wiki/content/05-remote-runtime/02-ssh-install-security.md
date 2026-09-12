# SSH 安装、Host Key 与安全

## 1. 连接前提

LLM Space 调用系统 OpenSSH，复用 `~/.ssh/config`。Host、User、IdentityFile、ProxyJump 和 ssh-agent 均由 OpenSSH 管理，应用不保存密码或私钥 passphrase。

## 2. Host Key

Host Key 验证服务器身份，阻止中间人攻击。

- 首次连接：展示 key type 与 SHA-256 fingerprint，等待用户确认。
- Key Changed：默认拒绝，要求用户先向管理员确认。
- 信任后写入或替换 `known_hosts`。

确认请求带 request ID，避免过期弹窗被重放。正式信任前会禁用 multiplexing 并重新建立严格连接，确认当前 key 仍与用户批准的一致。

## 3. 平台检测

通过 SSH 执行 `uname -s` 与 `uname -m`，仅支持 Linux x64/arm64。平台决定下载哪个 Server 包。

## 4. 安装布局

```text
~/.llm-space/remote-runtime/
├── downloads/
├── versions/<desktop-version>/
│   ├── server-manifest.json
│   └── bin/llm-space-server
└── current -> versions/<desktop-version>
```

复用前同时检查 manifest 和可执行文件。仅有 manifest 的残缺安装不会被误认为成功。

## 5. 下载与完整性

优先让远端直接下载 GitHub Release 的 tar.gz 与 `.sha256`。失败时：

1. 桌面本地下载。
2. 本地校验 SHA-256。
3. 通过 SSH stdin 上传远端缓存。
4. 解压到临时目录。
5. 验证 manifest、平台与 executable。
6. 原子替换版本目录并更新 current symlink。

## 6. 启动与 Token

每次 Managed 连接生成新随机 Token，命令使用：

```text
llm-space-server
  --host 127.0.0.1
  --port <remote-port>
  --token-stdin
  --home <remote-home>
```

Server 只监听远端 loopback；Token 从 stdin 输入，不进入 argv 或持久化配置。

## 7. SSH Tunnel

独立进程执行：

```bash
ssh -N -o ExitOnForwardFailure=yes \
  -L 127.0.0.1:<local-port>:127.0.0.1:<remote-port> \
  <target>
```

Desktop 的 RemoteRuntimeClient 只访问本地 loopback URL。远程服务没有直接暴露公网端口。

## 8. 端口与残留进程

Remote 端口冲突时先判断监听者是否属于同一安装目录的旧 LLM Space Server。只有确认归属才停止 stale process；不能确认时拒绝自动 kill。随机端口尝试也有上限。

## 9. 威胁模型

- SSH Host Key 保护服务器身份。
- Tunnel 保护 Bearer Token 与 HTTP 内容。
- Loopback 限制服务暴露面。
- SHA-256 保护下载完整性，但发布账户仍是信任根。
- 远端 Agent 文件/shell 工具拥有该 SSH 用户权限，不能视为沙箱。

## 10. 实践

1. 用 `ssh -G alias` 查看最终解析配置。
2. 验证 Server Token 不出现在 `ps` 命令行。
3. 模拟下载中断留下半目录，检查下次是否重装。
4. 模拟 Host Key changed，确认系统不会提供 ignore 按钮。
