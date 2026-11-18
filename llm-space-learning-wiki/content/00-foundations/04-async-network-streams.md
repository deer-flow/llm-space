# 异步、网络、RPC 与流

> 难度：零基础到入门 · 建议用时：45 分钟 · 前置：函数与模块

## 1. 同步与异步

同步像在柜台排队：前一件事结束，才处理下一件。异步像取号：提交任务后可以做别的，结果准备好再回来处理。

```ts
const thread = await storage.read(path);
```

`await` 表示暂停当前异步函数，等待 Promise 完成；它不会冻结整个应用。

## 2. Promise

Promise 表示“未来会成功或失败的一个结果”：

```ts
try {
  const thread = await readThread();
} catch (error) {
  showError(error);
}
```

网络、文件和子进程都可能失败，所以错误路径与成功路径同样重要。

## 3. 流为什么不是一个 Promise

模型回答可能持续几十秒。如果等全部完成才显示，用户会感觉程序卡住。流把结果拆成事件：

```text
message_start
text_delta: "你"
text_delta: "好"
message_end
```

AsyncGenerator 允许多次 `yield`，消费端使用 `for await`：

```ts
for await (const event of stream) {
  reduce(event);
}
```

## 4. 取消

`AbortController` 像任务的紧急停止按钮：

```ts
const controller = new AbortController();
fetch(url, { signal: controller.signal });
controller.abort();
```

LLM Space 把 AbortSignal 从 UI 一直传到模型请求。任何一层漏传，用户虽然看到“已停止”，远端仍可能继续消耗 token。

## 5. HTTP

HTTP 是请求与响应协议：

```text
POST /rpc
Authorization: Bearer ...
Content-Type: application/json
```

请求包含方法、路径、Header 和 Body；响应包含状态码、Header 和 Body。

## 6. RPC

RPC（远程过程调用）让调用远端能力看起来像调用函数：

```ts
await runtime.fsRead({ path: "demo.json" });
```

底层可能被编码成：

```json
{ "id": "123", "method": "fs.read", "params": { "path": "demo.json" } }
```

Electrobun RPC 连接桌面 Renderer 与 Bun 主进程；Remote RPC 连接桌面与 Linux Server。

## 7. SSE

Server-Sent Events 是服务端持续向客户端发送文本事件的格式：

```text
data: {"type":"event","value":"..."}

data: [DONE]
```

LLM Space Remote Stream 使用 POST + fetch 手工解析 SSE，因为标准 EventSource 不方便携带请求 Body。

## 8. 竞态条件

如果两个异步写入同时进行，旧请求可能更晚完成并覆盖新数据：

```text
写入 A 开始
写入 B 开始
写入 B 完成
写入 A 完成 → 错误覆盖 B
```

SerializedPersistence 用队列保证顺序；RuntimeRunTracker 用租约阻止运行、保存和文件移动互相冲突。

## 9. 官方延伸阅读

- MDN JavaScript 异步基础：https://developer.mozilla.org/en-US/curriculum/core/javascript-fundamentals/#6.11_async_javascript_basics
- MDN AbortController：https://developer.mozilla.org/en-US/docs/Web/API/AbortController
- MDN AsyncIterator：https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncIterator

## 10. 理解自测

**为什么模型流需要 streamId？**

多个 Tab 可以并发运行，streamId 用于把返回事件送回正确消费者。

**为什么取消必须在 finally 中清理 listener 和 Map？**

否则会留下内存引用、重复响应或“幽灵任务”。
