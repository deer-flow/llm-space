# Runtime、模型与流式生命周期

## 1. RuntimeClient

`packages/runtime/src/runtime/types.ts` 定义完整能力面：streaming、filesystem、models、MCP、built-in tools、skills、search、network、traces。

`RuntimeInfo.capabilities` 用于远程握手与 UI 能力判断。`RuntimeRouter` 保证 local 永远存在、默认 Runtime 不可被直接注销、未传 ID 时选择默认实例。

## 2. LocalRuntimeClient 是 Facade

它几乎不实现领域算法，而是把调用转交给：

- `ModelManager`
- `LocalFileSystem`
- `McpManager`
- `ToolRegistry`
- `SkillsManager`
- `SearchSettingsManager`
- `NetworkSettingsManager`
- `TraceManager`
- `StreamThreadController`

这种门面让远端协议只需对齐一个接口，而不是暴露所有内部类。

## 3. ModelManager

配置保存在 `settings/models.json`。Manager 合并：

- 用户启用的内置 Provider。
- 自定义 Provider/Model。
- 插件声明的只读 Provider。
- 多个 Provider Profile。
- 默认模型选择。

用户配置优先于冲突的插件贡献。昂贵 Models registry 懒构建；配置变化只失效缓存，下一次使用再重建。

## 4. Connection Snapshot

Thread 保存 Provider + Model，不保存凭证。运行时：

```text
providerId + optional profileId
→ ModelManager.resolveConnection()
→ { apiKey, baseUrl, headers }
```

这个结果在本次运行期间固定。若用户运行中切换 Profile，不应改变已经发出的请求。

## 5. StreamThreadController

每个 `streamId` 对应一个 `AbortController`：

```text
run(payload)
→ 校验 connection provider
→ resolveConnection
→ getAvailableModels
→ streamAgent
→ send(event...)
→ send(done) / send(error)
→ finally 删除 active stream
```

Abort 时直接结束，不伪造 done/error。Shutdown 会取消所有 active stream。

## 6. 模型连接测试

连接测试复用真实 `streamAgent()`，发送最小 “Reply with ok” 上下文。这样能覆盖 adapter、认证、Base URL 和流式协议，而不是只做浅层 HTTP ping。

## 7. Provider-Hosted Tools 与 Response Format

`streamAgent()` 在 provider 已构建的 payload 上通过 `onPayload` 注入：

- 原样 Provider-Hosted Tool configs。
- `json_object` 或 `json_schema` response format。

不同 API 的 tools 容器位置不同，代码按 Google、Bedrock、pi-messages 等 adapter 分支处理。Provider 负责最终能力验证。

## 8. Telemetry

运行结束记录 outcome、耗时、消息数、工具数和是否有 System Prompt。自定义 Provider/Model 名称会被替换为 `"custom"`，减少敏感信息采集。

## 9. 生命周期顺序

启动先 Network，再创建会发请求或子进程的 Manager。关闭顺序由宿主组合根显式控制：远端、streaming、tool host、MCP、plugins、auth、analytics。

## 10. 实践

1. 新增一个 Runtime capability，列出必须同步修改的协议位置。
2. 模拟两个并发 streamId，验证取消其中一个不影响另一个。
3. 修改 Provider Profile 后检查 Models registry 与 Connection Snapshot 的区别。
4. 阅读 `stream-thread.test.ts`，补一个 provider 不匹配用例。
