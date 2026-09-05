# 开发环境与 Monorepo

这一节帮助第一次接触 TypeScript 桌面项目的读者把仓库运行起来，并理解“一个仓库、多个可发布单元”的工程组织方式。

## 1. 基础概念

**Monorepo** 是把多个相互依赖的包放在同一个 Git 仓库中管理。LLM Space 使用 Bun workspace，根 `package.json` 的 `workspaces` 包含 `packages/*` 与 `apps/*`。内部依赖使用 `workspace:*`，因此修改共享包后不必发布 npm 版本就能被应用消费。

**Bun** 同时承担 JavaScript Runtime、包管理器、脚本执行器和测试运行器。项目明确不使用 npm、pnpm 或 yarn。

**mise** 负责锁定开发工具版本并提供人类可发现的任务入口。`mise.toml` 声明 Bun 1.3，`mise.lock` 锁定精确版本与校验和；真正的脚本实现仍在各级 `package.json`。

## 2. 首次安装

```bash
mise run setup
```

它等价于先安装锁定工具，再执行 `bun install`。如果只想快速安装已有 Bun 环境中的依赖：

```bash
bun install
```

关键文件：

- `mise.toml`：工具版本、开发、测试、构建、打包与发布任务。
- `package.json`：workspace、共享版本 catalog 和根脚本。
- `bun.lock`：依赖解析结果。
- `tsconfig.base.json`：公共 TypeScript 编译选项。
- `eslint.config.mjs`、`.prettierrc`：静态检查和格式化规则。

## 3. 常用命令

| 目标 | 命令 | 说明 |
| --- | --- | --- |
| 桌面开发 | `mise run dev` | Vite HMR + Electrobun，Bun 主进程代码变化通常需重启 |
| CEF 调试 | `mise run dev:cef` | 在 `127.0.0.1:9333` 开启 CDP |
| Web 开发 | `mise run dev:web` | 官网与共享 Thread 查看器 |
| 无头服务 | `mise run dev:server` | 启动 Remote Runtime 服务 |
| 全量测试 | `mise run test` | Bun 自动发现 `*.test.ts(x)` |
| 类型检查 | `mise run typecheck` | 分别检查各 workspace 的环境类型 |
| Lint | `mise run lint` | 零 warning 才算通过 |
| Web 构建 | `mise run build:web` | 产物位于 `apps/web/dist` |

## 4. 为什么存在多个 tsconfig

根配置偏向 Bun 环境，而 `packages/ui` 与 `apps/web` 需要 DOM、JSX 类型；`apps/desktop` 同时包含 Bun 主进程与浏览器 Renderer。每个 workspace 的 `tsconfig.json` 描述自己的运行环境，根 `typecheck` 将它们全部串起来。新增 workspace 时，只在根配置中“能被编辑器识别”还不够，还必须加入检查脚本。

## 5. 从目录判断运行边界

```text
apps/desktop/src/bun/       Bun 主进程，可访问文件系统与 Electrobun
apps/desktop/src/mainview/  Vite 入口
apps/desktop/src/app/       React 页面与 Provider 组合
apps/desktop/src/shared/    两个进程共同使用的纯类型/协议
packages/core/src/server/   仅 Node/Bun 可用
packages/core/src/client/   浏览器安全
packages/ui/src/            不能导入 Electrobun
```

看到某段代码前先问：“它会在哪个 JavaScript Runtime 中执行？”很多错误都来自把 Bun-only 模块打进 Web bundle。

## 6. 开发约定

- 文件名使用 `kebab-case`。
- 组件、类和类型用 `PascalCase`；函数与变量用 `camelCase`。
- 模块私有函数和类私有字段使用前导下划线。
- 共享依赖版本放根 `catalog`，不要在每个包分别升级。
- `packages/ui/src/ui/` 是生成的 shadcn 原语，不手工修改。
- 高频流式列表关注 memo、稳定 props 和窄 Zustand selector。

## 7. 实践

1. 运行 `mise tasks ls`，解释每个任务最终转发到了哪个脚本。
2. 运行 `mise run typecheck`，观察它为何要检查多个项目。
3. 找到 `@llm-space/core` 的 exports map，判断哪些入口可以被浏览器使用。
4. 修改一个无副作用的文案并运行对应测试，熟悉最小验证闭环。

## 检查点

你应能解释：为什么 `packages/core` 和 `packages/ui` 没有独立 build step；为什么直接消费 TypeScript 对 Vite/Bun 可行；为什么共享包中的路径别名可能被宿主 bundler 错误解释。
