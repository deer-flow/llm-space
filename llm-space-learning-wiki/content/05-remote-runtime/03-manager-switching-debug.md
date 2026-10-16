# 连接状态机、切换与诊断

## 1. RemoteServerManager

Manager 保存服务器配置、串行化操作、管理 Host Key 请求、安装进度、Runtime 注册和默认切换。配置不包含本次连接 Token。

## 2. 连接状态机

```text
ssh-check
→ host-key-check
→ platform-detect
→ server-install
→ server-start
→ tunnel-start
→ health-check
→ connected
```

UI 展示每一步及错误详情。把过程做成状态机比一个“Connecting...” spinner 更容易定位认证、下载、启动还是协议问题。

## 3. 切换策略

RuntimeRouter 中 local 始终存在。连接成功后注册 `remote:<server-id>` 并可设为 default。

资源必须携带 runtimeId：

- 文件树。
- Thread Tab。
- Model/MCP/Skills 设置。
- Agent Run。
- Tool execution。

Run 开始后绑定 owner Runtime，用户后来切 workspace 也不能把 in-flight stream 改路由。

## 4. 无损切换

如果新连接与旧连接不是同 endpoint，Manager 先保留旧连接，待新连接 health 成功才清理旧连接。连接失败时用户仍能继续使用当前工作区。

断开前检查 RuntimeRunTracker：

- 是否有 active run。
- 是否有 save/persistence。
- 是否有文件 mutation lease。

通过后注销 Runtime、关闭 Client/隧道/Server、移除对应 Tabs 和 Query Cache，再回到 local。

## 5. 常见故障定位

### SSH check

先在终端执行 `ssh alias`、`ssh -vvv alias`。

### Host Key

用 `ssh-keygen -F` 检查 known_hosts，不要未确认就删除。

### Platform

确认 Linux 架构在支持列表，远端 shell 可运行基本命令。

### Install

检查磁盘、目录权限、tar、GitHub 网络、SHA 文件和 executable bit。

### Server start

检查远程端口、home 展开、manifest 与二进制；注意不能创建字面量 `~/` 目录。

### Tunnel

检查本地端口、ProxyJump 与 `ExitOnForwardFailure` 输出。

### Health

检查 Bearer、版本、protocol 与 capabilities。不要把不兼容误报为普通网络失败。

## 6. Source 模式

`LLM_SPACE_REMOTE_SERVER_MODE=source` 可在远端仓库直接运行 Bun 源码，适合开发协议；生产连接使用已打包二进制，确保版本精确一致。

## 7. 测试重点

Remote 测试覆盖 Host Key、shell quoting、Token stdin、平台、SHA、上传 fallback、端口冲突、状态机、协议检查、并发流与取消。新增阶段时应补：

- happy path。
- 用户取消。
- timeout。
- 资源清理。
- 重连幂等。

## 8. 实践

1. 从 UI 一条进度记录反查到 Manager phase 与 SSH 命令。
2. 模拟 health 成功但少一个 capability。
3. 在旧 Runtime 有未保存 Thread 时尝试断开，验证阻止逻辑。
4. 画出连接失败时应释放的 Server process、Tunnel、Client 与 Registry 项。
