# PR 计划 0001：跨消息「过程块」自动折叠（结果优先）
> 状态：**已实现（2026-09-08 核对）**：`packages/ui` 的 process-groups / run-timeline-marks 已落地（含 `general.collapseProcessGroups` 设置项），测试 `process-groups.test.ts`、`run-timeline-marks.test.ts` 通过。改动在工作树，未提交。

> 状态：计划（未写代码）
> 目标形态：agent 产品常见体验——跑一轮时中间过程（思维 + 工具调用）正常显示，最终结果输出后自动收起成一栏，默认只看到答案。

## 1. 背景与目标

当前一条 assistant 消息的渲染顺序（`packages/ui/src/components/thread-playground/message/message-list-item.tsx`）：

1. `thinking` 思维过程（263-265）
2. `providerHostedToolActivities` 托管工具活动（266-272）
3. 图片（273-277）
4. **`content[text]` 正文，即最终结果**（278-301）
5. 引用（302-304）
6. **`toolCalls` 工具调用 + 结果**（305-327）

一次带工具的多轮运行会在消息流里留下若干条「中间消息」（只有 thinking + toolCalls，没有正文），最后一条才是答案。现在这些中间消息全部平铺展开，用户要翻很久才能看到结果。

**目标**：最终结果出现后，把本轮前面这段连续的中间消息自动折叠成一个可展开的栏，默认视图只留答案。折叠栏标题按约定显示 **「N 次工具调用」+ 最后一个工具名**。

## 2. 现状（代码事实）

| 关注点 | 位置 | 现状 |
| --- | --- | --- |
| 消息数据 | `stores/thread-store.ts` | `thread.context.messages`；`collapsedMessageIds: string[]`（声明 118，初值 680） |
| 单条折叠 | `toggleMessageCollapsed(id)`（1070-1077） | 仅运行时，**不持久化**；`message-list-item-header.tsx` 111-116 触发 |
| 折叠组件 | `packages/ui/src/ui/collapsible-content.tsx` | 现成可用 |
| 虚拟化列表 | `message/message-list-view.tsx` | `@tanstack/react-virtual`，**动态测量**：`measureElement` 227-240、`MESSAGE_HEIGHT_CACHE` 63、`_estimateMessageHeight` 81-108（折叠态估高 56），超过 20 条才虚拟化（60） |
| 派生显示层 | `display-messages.ts`（`resolveDisplayMessages`） | 视图派生的现成位置，**适合放分组逻辑** |
| 运行状态 | `ThreadState.status` | `"idle" \| "preparing" \| "running"`（108/113）；`finalizeActiveRun` 1219-1303 末尾置 `idle`（1295） |
| 工具汇总 | `packages/core/src/thread/tool-call-status.ts` | `summarizeToolCalls` 40-63 → `{ totalCount, readyCount, errorCount, canContinue }` |
| 工具名 / 失败 | 同上 | `toolCall.input.name`；`toolCall.output?.isError`（33-35） |

## 3. 设计方案

### 3.1 分组规则（核心判定）

在**派生层**（`display-messages.ts`）分组，不动 store 里的规范化 messages——分组是视图概念，与拖拽、持久化、streaming 解耦。

```
过程组成员 = assistant 消息 且 无正文 text 且 (有 thinking 或 有 toolCalls)
分组结束   = 遇到 user 消息，或遇到有正文的 assistant 消息（即结果）
```

这条规则不需要任何「轮次」元数据，也不依赖运行时侧的改动。

### 3.2 折叠时机

- **运行中**（`status === "running"` 或该组处于 streaming）：保持展开，避免流式输出跳动。
- **运行结束**（`status` 由 `running → idle`，即 `finalizeActiveRun` 收尾）：把新完成的过程组标记为折叠。
- 用户手动展开过的组，记住其状态（不因下一次运行被强制收起）。

折叠状态放哪：**新增 `collapsedGroupIds`**（store，运行时）+ 可选 localStorage 持久化用户偏好。组的 id 建议用首条消息 id（稳定、可复现），避免随机 id 导致状态漂移。

### 3.3 折叠栏（组头）

```
[›] 3 次工具调用 · 最后：web_search          ← 成功态
[›] 3 次工具调用 · 最后：bash · 1 步失败      ← 失败态（errorCount > 0，用警示色）
```

- N = 组内所有 `toolCalls` 累计（用 `summarizeToolCalls` 的 `totalCount`）
- 最后工具名 = 组内最后一条 `toolCalls.at(-1).input.name`
- 展开后恢复逐条渲染，与现在完全一致（含可编辑的工具结果）

### 3.4 虚拟化适配（最大技术风险点）

`@tanstack/react-virtual` 用动态测量。处理办法：

- **折叠态：整个组只渲染一个组头行**，高度固定（复用折叠态估高 56 的量级），不渲染成员；
- **展开态：组头 + 成员逐条渲染**，成员仍走现有测量逻辑。

改动点：`display-messages.ts` 产出分组结构 → `message-list-view.tsx` 的 `estimateSize` / `measureElement` 区分「组头行」与「普通消息行」→ `MessageRow` 增加组头分支。

**不要让折叠态的成员以 `height: 0` 留在 DOM 里**——那会污染虚拟化测量，也会让可编辑的 CodeEditor 仍然挂载。

### 3.5 开关与文案

- 新增 localStorage 键（`packages/ui/src/lib/local-storage.ts`）：`collapseProcessGroups`
- 设置入口：`settings/general-page.tsx` 用 `SettingsToggleRow`；默认开启
- i18n：`apps/desktop/src/i18n/messages.ts` 的 en/zh 两棵树同步新增（有测试强制结构一致）

## 4. 涉及文件

- `packages/ui/src/components/thread-playground/message/display-messages.ts`（分组逻辑）
- `packages/ui/src/components/thread-playground/message/message-list-view.tsx`（虚拟化适配）
- `packages/ui/src/components/thread-playground/message/` 新增 `process-group-header.tsx`（组头组件）
- `packages/ui/src/components/thread-playground/stores/thread-store.ts`（`collapsedGroupIds` + 折叠触发）
- `packages/ui/src/lib/local-storage.ts`（开关键）
- `apps/desktop/src/components/settings/general-page.tsx`（开关 UI）
- `apps/desktop/src/i18n/messages.ts`（文案）
- 新增测试：`packages/ui/tests/components/thread-playground/message/process-groups.test.ts`

## 5. 风险与待定

1. **虚拟化测量**：最可能出 bug 的地方，需要在长对话（>50 条、多组）下手动验证滚动位置与高度缓存。
2. **可编辑的工具结果**：现在工具结果 inline 可编辑（CodeEditor，默认展开）。自动收起会打断「改参数重跑」的工作流 → 只在运行结束后折叠，且用户展开即恢复编辑能力。
3. **消息拖拽 / 删除**：分组后若消息支持拖拽排序，组头与成员的操作需要明确（建议：组作为一个整体不可拆，删除组 = 删除全部成员）。
4. **纯工具轮无结果**：若一轮跑完没有任何正文（例如被中断），该组是否也折叠？建议：**不折叠**（没有结果就无所谓「结果优先」，且用户需要看到失败现场）。

## 6. 验证

- 单元测试：分组规则（各种边界：连续 / 被 user 消息打断 / 混合正文 / 空组）；折叠时机（running → idle）。
- 手动：长对话滚动、展开/收起、运行中途不折叠、失败工具组的警示态。

## 7. 工作量

中（2-3 天）。逻辑本身不大，成本主要在虚拟化适配与边界态验证。
