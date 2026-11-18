# Server、RPC、SSE 与兼容协议

## 1. Server 启动

`apps/server/src/index.ts` 解析：

```text
--token <value> | --token-stdin
--host 127.0.0.1
--port 39123
--home ~/.llm-space-server
```

Token 必须二选一。SSH 管理模式使用 stdin，避免 secret 出现在进程 argv。`createServerRuntime()` 设置 home、创建 workspace，并组装与本地桌面相同的模型、MCP、Skills、Tools、Trace 与 Streaming。

## 2. HTTP 接口

所有路由先校验 `Authorization: Bearer <token>`，包括 health。

| 路径 | 用途 |
| --- | --- |
| `GET /health` | 版本、协议、capabilities、路径和平台 |
| `POST /rpc` | 普通 Runtime 方法 |
| `POST /stream` | Agent Event SSE |
| `POST /shutdown` | 优雅停止 |

业务 RPC 错误通常仍是 HTTP 200，通过 envelope `ok:false` 表达；鉴权、非法 JSON 与未知路由使用 HTTP 状态码。

## 3. 共享协议

`packages/runtime/src/remote-protocol.ts` 定义协议版本、method union、request/response 和 health shape。桌面连接时校验：

- protocolVersion 严格一致。
- Server 版本与 Desktop 版本一致。
- 所需 capabilities 全部存在。

这种严格匹配牺牲部分滚动兼容，换来前后端行为确定性。新增方法要升级协议版本。

## 4. RPC Envelope

```json
{
  "id": "uuid",
  "method": "models.available",
  "params": {}
}
```

成功：

```json
{ "id": "uuid", "ok": true, "result": [] }
```

失败：

```json
{
  "id": "uuid",
  "ok": false,
  "error": { "code": "invalid_params", "message": "..." }
}
```

服务端 dispatcher 把 method 映射回 RuntimeClient。共享 union 让 TypeScript 检查两端 method/params/result。

## 5. SSE Streaming

这不是浏览器 EventSource，因为请求需要 POST body 和 Bearer Header。客户端用 fetch 读取 response body，手工解析：

```text
data: [START]

data: {"type":"message_update", ...}

data: [DONE]
```

服务端把 Runtime 的 callback event 编码为 SSE。解析器必须处理 chunk 边界不等于行边界、畸形 JSON、非 2xx 和提前关闭。

## 6. 取消链

```text
Renderer AbortSignal
→ Electrobun abort message
→ RemoteRuntimeClient.abortStream()
→ fetch AbortController
→ server request signal
→ runtime.abortStream(streamId)
→ StreamThreadController AbortController
```

任何一层漏传都会造成远端模型继续消耗资源。

## 7. 实践

1. 手工启动 server，用 curl 携带 Bearer 调 `/health`。
2. 发送未知 RPC method，区分 HTTP 与 envelope 错误。
3. 将 SSE JSON 拆成多个网络 chunk，验证解析器。
4. 模拟 Server protocolVersion 不同，确认连接在使用能力前失败。
