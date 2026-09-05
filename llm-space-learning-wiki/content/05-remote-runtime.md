# 第五章：Remote Runtime 与无头 Server

Remote Runtime 让桌面 UI 留在本机，同时把 workspace、模型、MCP、Tools、Skills、网络和 Trace 放到 Linux 服务器运行。系统通过 `RuntimeClient` 抹平本地与远程差异。

## 架构

```text
React Renderer
→ Electrobun RPC
→ Desktop Bun RuntimeRouter
→ RemoteRuntimeClient
→ localhost HTTP
→ SSH tunnel
→ remote 127.0.0.1:39123
→ apps/server
→ LocalRuntimeClient + Managers
```

## 子课程

- [Server、RPC、SSE 与兼容协议](05-remote-runtime/01-server-protocol.md)
- [SSH 安装、Host Key 与安全](05-remote-runtime/02-ssh-install-security.md)
- [连接状态机、切换与诊断](05-remote-runtime/03-manager-switching-debug.md)

远端功能不是“在 URL 前加个 host”。它同时涉及包发布、架构识别、SSH 信任、Token 注入、进程生命周期、隧道、协议兼容和 UI 资源所有权。
