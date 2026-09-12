# Prompt 模板、导入解析与代码生成

## 1. Prompt 变量系统

变量分为：

- 内置日期 `currentDate`。
- 当前工作目录 `workingDirectory`。
- 可用 Skills 列表 `skills`。
- 用户 JSON 变量。
- 文件内容变量。
- `variableVariants` 中的自定义文本值。

`prompt-variables.ts` 负责定义、规范化、解析、引用替换和 Snapshot。占位符名必须满足标识符规则。

## 2. 两级渲染策略

简单 `{{name}}` 使用轻量替换；只有检测到块标签、宏、成员访问、过滤器或调用时才启用 Nunjucks 模板。这样可减少把不可信工具输出误当模板执行的概率。

复杂模板支持：

- `{% if %}`、`{% for %}`。
- 字段和数组访问。
- Filters。
- `exists(path)`。
- `{{@include("path")}}` 递归包含。

解析失败时返回原文，不让一次坏模板毁掉整个运行。递归 include 受最大深度与数量限制，避免循环包含。

## 3. 文件变量与 include 的差别

- 文件内容变量只读取并原样嵌入，不递归渲染文件内模板。
- `@include` 会递归渲染。
- Web Viewer 没有文件系统，两者解析为空或不可用。

## 4. 可复现 Snapshot

变量值按稳定 Prompt place 保存，例如：

```text
systemPrompt
message:<id>:text
toolResult:<message-id>:<tool-call-id>
```

编辑变量时只失效引用了该变量的 Snapshot；编辑某条消息则失效对应位置。这样新内容能更新，旧已运行前缀仍稳定。

## 5. Parser Registry

Parser 根据扩展名和内容尝试：

- 原生 Thread。
- OpenAI Chat Completions。
- Anthropic Messages。
- Aurora。
- DeerFlow run-event JSONL。

每个 Parser 输出候选 Thread，再经 `normalizeThread()` 与 schema 边界统一。导入器需要处理工具调用 ID、消息角色差异、System Prompt 位置和模型字段映射。

## 6. Generator 协议

`GeneratorDefinition` 描述生成器 ID、输入要求和 `run()`。宿主通过 `GeneratorCapabilities` 注入：

- 写入/删除文件。
- 运行 `uv`。
- 打开终端。
- 读取搜索设置和真实环境变量。

当前 `langgraphGenerator` 确定性生成 Python 工程，包括：

- `pyproject.toml` 与 `.env`。
- Prompt、变量、Skills/MCP 配置。
- 模型工厂与工具源码。
- LangGraph Agent 入口。

## 7. TypeScript 与生成 Python 的语义一致性

模板系统存在两套 Runtime：当前 TypeScript 应用和生成的 Python 项目。增加变量、Filter、`exists()` 或 include 行为时，必须同时修改：

- `packages/core/src/thread/`。
- `packages/core/src/generator/langgraph/templates.ts`。
- Generator regression tests。

只把变量写进导出 JSON 不代表 Python 运行时会解析它。

## 8. Workflow

`WorkflowContext` 提供 phase、log、agent 与 parallel。并发由 Semaphore 限制，默认最多四个 agent task。当前 LangGraph Generator 主要走确定性文件生成，但 Workflow 协议为未来多阶段生成保留了统一进度事件。

## 9. 安全边界

- Provider-Hosted Tools 暂不支持 LangGraph 导出，应明确失败。
- 导出真实 API Key 必须由用户明确选择。
- 生成目录先授权并限制相对路径，避免越界写文件。
- `uv` 执行有 timeout，失败不应留下无反馈的后台进程。

## 10. 实践

1. 添加一个 JSON 变量并在条件与循环中使用。
2. 制造递归 include，观察上限行为。
3. 导入一份 OpenAI tool_calls JSON，检查统一后的 Thread。
4. 生成 General Agent，运行 Python 语法与模板行为测试。
5. 思考新增内置变量需要修改哪些 TypeScript、Python、UI 和测试位置。
