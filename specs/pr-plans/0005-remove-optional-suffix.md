# PR 计划 0005：删掉 Exa / AnySearch API key 标签里的 "optional"
> 状态：**已实现（2026-09-08 核对）**：`messages.ts` 中 `Exa API key (optional)` / `AnySearch API key (optional)` 的 `(optional)` 已删（8 棵语言树同步）。**与 DeepSeek V4.1 Flash 内测模型（见下）合并为一个 PR 交付。** 改动在工作树，未提交。
>
> **追加：DeepSeek V4.1 Flash 内测模型（并入本 PR）**：`packages/runtime/src/models/providers/deepseek.ts` 新增 `deepseek-v4.1-flash-expires-on-0910`（id 后缀即截止日：2026-09-08 开、09-10 止）。原生多模态（text+image）、走 openai-completions（内测未宣布 Responses 支持）、上下文 1M / maxTokens 384k、定价同 v4-flash（in 0.14 / out 0.28 / cacheRead 0.0028）、每账号 20 并发、`thinkingFormat: "deepseek"` + thinkingLevelMap。测试 `deepseek.test.ts` 通过。

> 状态：计划（未写代码）
> 体量：极小（1 个文件，4 行文案）。适合作为独立小 PR 快速合入。

## 1. 背景与目标

搜索设置页里，Exa 与 AnySearch 的 API key 输入框标签写作「Exa API key (optional)」/「AnySearch API key（可选）」。两个 key 确实可选（无 key 也能匿名调用），但其他 provider（Brave / Firecrawl / Tavily / Zhihu）其实也都是"填了才能用"，标签风格却不统一——带括号后缀既不美观，也容易让人误以为只有这两个是可选的。

**目标**：去掉后缀，标签统一为「Exa API key」/「AnySearch API key」。

## 2. 现状（代码事实）

"optional" **不是组件 prop**，而是硬编码在 i18n 消息树 `search.keys` 里：

- 英文 `apps/desktop/src/i18n/messages.ts`
  - 654：`exa: "Exa API key (optional)"`
  - 655：`anysearch: "AnySearch API key (optional)"`
- 中文 `apps/desktop/src/i18n/messages.ts`
  - 1265：`exa: "Exa API Key（可选）"`
  - 1266：`anysearch: "AnySearch API Key（可选）"`

`apps/desktop/src/components/settings/search-page.tsx` 的 `ApiKeyField` 没有 `optional` 之类的 prop（label 取自 `t.search.keys[provider]`，126），所以**改文案即可，组件不用动**。

## 3. 改动

```diff
  // en
- exa: "Exa API key (optional)",
- anysearch: "AnySearch API key (optional)",
+ exa: "Exa API key",
+ anysearch: "AnySearch API key",

  // zh
- exa: "Exa API Key（可选）",
- anysearch: "AnySearch API Key（可选）",
+ exa: "Exa API Key",
+ anysearch: "AnySearch API Key",
```

**en / zh 必须同时改**，否则中英文案不一致（现有测试会强制两棵树结构一致，但不会检查文案是否同步，所以这一步靠手工核对）。

## 4. 影响面

- **无功能影响**：`ApiKeyField` 没有必填校验，搜索 key 全部可选；页面下方的 `keyNotes`（en 662 / zh 1273）已经说明了 Exa / AnySearch 可以无 key 使用，信息不会丢失。
- **无结构变化**：消息树 leaf 数量不变，`messages.test.ts` 的结构一致性测试自动通过。

## 5. 涉及文件

- `apps/desktop/src/i18n/messages.ts`（4 行）

## 6. 验证

- `bun test apps/desktop/src/i18n/messages.test.ts`
- 手动打开 Settings → Search，确认两个标签显示正常、说明文案仍在。

## 7. 工作量

极小（< 30 分钟，含验证）。

## 8. 备注

这是 PR #163（Exa / AnySearch / Zhihu provider）的收尾清理。可以在 #163 的 review 里顺带提一句，也可以单独开 PR——**单独开更干净**（reviewer 一眼能看完，合入快）。
