# JavaScript、TypeScript 与模块

> 难度：零基础 · 建议用时：35 分钟 · 前置：程序、文件与 JSON

## 1. JavaScript 与 TypeScript 的关系

JavaScript 是运行时真正执行的语言。TypeScript 在 JavaScript 上增加类型标注和开发工具，帮助编辑器和编译器提前发现错误，最终仍转换为 JavaScript。

```ts
function formatTitle(title: string): string {
  return title.trim();
}
```

`: string` 告诉工具“这里应当是文本”。它不会自动验证网络返回的数据。

## 2. 类型像合同

```ts
interface RuntimeInfo {
  id: string;
  kind: "local" | "remote";
  status: "connected" | "disconnected" | "error";
}
```

`interface` 像表格模板；联合类型 `"local" | "remote"` 表示只允许有限选项。这类带固定字段的联合在项目中常用来描述消息和事件。

## 3. 函数与依赖注入

函数接收输入并产生输出：

```ts
function createGreeting(name: string) {
  return `你好，${name}`;
}
```

依赖注入是把函数需要的外部能力从参数传进来，而不是在内部偷偷创建：

```ts
function saveThread(storage: Storage, thread: Thread) {
  return storage.write(thread);
}
```

这样本地存储、远程存储和测试假实现都能复用同一逻辑。

## 4. 模块

大型程序必须拆成文件。模块用 `export` 暴露能力，用 `import` 引入：

```ts
// math.ts
export function add(a: number, b: number) {
  return a + b;
}

// app.ts
import { add } from "./math";
```

Monorepo 再把多个模块组织成 Package。LLM Space 的 `packages/core`、`packages/runtime`、`packages/ui` 是共享包，`apps/*` 是可运行应用。

## 5. Package exports

`package.json` 的 `exports` 是包对外开放的门：

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./server": "./src/server/index.ts"
  }
}
```

浏览器代码只能使用安全入口；Bun 主进程才能引入 `./server`。这不是命名习惯，而是运行环境边界。

## 6. Monorepo 与 workspace

Monorepo 把多个相关包放在一个仓库。`workspace:*` 表示依赖当前仓库中的版本：

```text
apps/desktop
├── @llm-space/core
├── @llm-space/runtime
└── @llm-space/ui
```

修改共享包后，应用能立即消费源码，不需要先发布 npm。

## 7. 常见语法地图

| 语法 | 含义 |
| --- | --- |
| `const` | 声明不会重新赋值的变量 |
| `type` / `interface` | 描述数据形状 |
| `class` | 把状态和方法组合为实例 |
| `async` / `await` | 等待异步结果 |
| `T[]` | T 类型的数组 |
| `T \| null` | 可能是 T，也可能为空 |
| `?.` | 值存在时才继续访问 |
| `...value` | 展开数组或对象 |

## 8. 官方延伸阅读

- MDN JavaScript 基础课程：https://developer.mozilla.org/en-US/curriculum/core/javascript-fundamentals/
- MDN JavaScript 模块：https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules
- TypeScript Handbook：https://www.typescriptlang.org/docs/handbook/intro.html

## 9. 理解自测

**为什么 `packages/ui` 不能直接导入 Electrobun？**

因为同一 UI 还要在普通 Web 浏览器运行；Electrobun 只存在于桌面宿主。

**为什么根入口没有导出所有源码？**

Package exports 用来明确公共 API，并防止浏览器意外打包 Bun-only 模块。
