# React、状态与界面更新

> 难度：零基础 · 建议用时：35 分钟 · 前置：JavaScript 对象与函数

## 1. 组件是界面零件

React 把界面拆成组件。组件接收 Props，并返回界面描述：

```tsx
function StatusTag({ status }: { status: string }) {
  return <span>{status}</span>;
}
```

Props 像父组件交给子组件的订单，子组件不应随意修改它。

## 2. State 是组件的记忆

State 保存会随交互变化的信息，例如当前标签、输入框内容或是否正在运行。State 变化后 React 重新计算界面。

```text
用户点击 Run
→ Store.status = "running"
→ 订阅 status 的组件重新渲染
→ 按钮显示为 Stop
```

“重新渲染”不是把整个应用窗口重启，而是 React 比较前后结果并更新需要变化的 DOM。

## 3. Context 是向下广播

如果许多深层组件都需要同一个能力，逐层传 Props 会很繁琐。Context 允许上层 Provider 提供值，下层任意组件读取最近的 Provider。

LLM Space 使用它注入：

- `HostServices`：文件、工具、导航等宿主能力。
- `ModelClient`：模型管理能力。
- 每个 Thread 的 Store。

可以把 Context 想成一栋楼的公共管线；Provider 决定当前楼层接入哪套水电。

## 4. Store 管复杂状态

Zustand Store 把大量状态和更新动作集中起来。每个 Thread Tab 都创建自己的 Store：

```text
Tab A → Store A → Thread A / Undo A / Stream A
Tab B → Store B → Thread B / Undo B / Stream B
```

因此切换标签不会把两个 Thread 的消息混在一起。

## 5. Selector 为什么重要

组件只应订阅自己需要的字段：

```ts
const status = useThreadStore((state) => state.status);
```

如果订阅整个 Store，任何 token、工具卡片或输入变化都可能让组件重渲染。流式界面尤其需要控制更新范围。

## 6. Effect 是连接外部系统

Effect 用于同步 React 之外的系统，比如网络连接、事件监听和计时器。它通常返回清理函数：

```ts
useEffect(() => {
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, []);
```

不要用 Effect 代替普通数据计算。React 官方把 Effect 定义为连接外部系统的“逃生舱”。

## 7. LLM Space 的 UI 数据流

```text
ThreadTabPane
→ 创建 Thread Store
→ ThreadPlayground 读取 selector
→ 用户动作调用 Store action
→ Store 产生新 state
→ 相关组件更新
→ SerializedPersistence 写磁盘
```

## 8. 官方延伸阅读

- React State：https://react.dev/learn/state-a-components-memory
- React Context：https://react.dev/reference/react/useContext
- React Effects：https://react.dev/reference/react/useEffect

## 9. 理解自测

**为什么 inactive Tab 只是隐藏而不卸载？**

为了保留 Store、Undo、编辑现场和进行中的流。

**为什么 Web Viewer 可以复用 ThreadPlayground？**

它注入 `presentational: true` 的 HostServices，界面结构复用，但运行和文件能力被关闭。
