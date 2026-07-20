[English](./variables-and-templates.md) | 中文

---

# 变量与模板

变量和模板让 Prompt 既能复用又能动态生成：把会变化或重复的内容抽出来、按名称引用，再加上条件、循环、文件引入等逻辑。本文介绍的所有能力都可用于每一处文本——**System Prompt**、**消息**和**工具结果**；同时保存的 Thread 模板保持不变，替换只发生在运行时。

> 本文是 [核心概念 › 变量](./core-concepts.zh-CN.md#variables) 的进阶补充。建议先阅读那一节，了解 `{{variable_name}}` 的基础用法。

# 变量回顾

在文本中写 `{{variable_name}}`，运行时 LLM Space 会把它替换成变量的实际值。

- **内置变量**会自动计算取值：`{{current_date}}` 和 `{{available_skills}}`。
- **自定义（文本）变量**是你手动定义一次、可到处复用的「名称 → 文本值」。
- **JSON 变量**保存一个 JSON 对象或数组，可在模板里逐层访问字段并遍历——见下文 [JSON 变量](#json-变量)。
- **文件内容变量**保存一个文件路径，运行时会被替换为该文件的内容——即 `@include` 能力的「具名变量」形式。见下文 [文件内容变量](#文件内容变量)。
- 变量名必须以字母或下划线开头，且只能包含字母、数字和下划线。
- 任何不是已知变量的 `{{...}}` 都会**原样保留**，因此工具结果或搜索结果里的花括号永远不会被破坏。

以上这些都在 **Variables** 对话框里管理（从 Prompt 上方的变量胶囊，或编辑器悬浮提示里的「查看」按钮打开）。内置变量已自动生成；用 **Add ▸ Text** 或 **Add ▸ JSON** 创建你自己的变量。

# 模板

在普通变量之上，LLM Space 支持一套 **Jinja2 风格的模板语言**（基于 Nunjucks）。它带来宏（第一个是 `@include`）、条件判断和循环，让你可以把 Prompt 由更小的片段拼装出来，并根据上下文自适应。

## 模板何时会被渲染

为了保证不可信的工具输出安全，只有当文本包含以下之一时，才会启用模板渲染：

- **块标签** —— `{% … %}`（如 `{% if %}`、`{% for %}`）；
- **宏形式** —— `{{@ … }}`（如 `{{@include(...)}}`）；
- 使用了成员访问、下标、过滤器或调用的 **`{{ … }}` 表达式** —— 即其中含有 `.`、`[`、`|` 或 `(`（如 `{{ user.name }}`、`{{ items[0] }}`、`{{ price | round }}`）。

其余情况——普通 `{{variable}}` 占位符，或无关花括号——都走更简单的变量替换，不会被当作模板解析。正因如此，粘贴进来的工具结果里若恰好含有 `{{a.b}}` 这类表达式，是唯一会被当模板处理的边缘情况（其中的未知值会渲染为空，而不是原样保留）；这种情况很少见，代价换来的是像 `{{ user.name }}` 这样的独立字段访问。

如果模板无法解析（例如粘贴进来的工具结果里带了残缺的 `{%`，或者缺少 `{% endfor %}`），这段文本会**原样保留**——损坏的模板不会让整次运行失败。

## `@include` 宏

`@include` 会把一个文件的内容嵌入到 Prompt 中：

```text
{{@include("~/notes/writing-style.md")}}
```

- 路径可以是**任意绝对路径**，开头的 `~` 会展开为你的用户主目录。
- 如果文件不存在（或无法读取），会被替换为**空字符串**——不报错。
- 被引入的内容会**递归渲染**：它本身也可以使用 `{{变量}}`、控制流，甚至嵌套的 `@include`（有深度上限以防止循环）。

**编辑器智能提示：** 在任意 Prompt 编辑器中输入 `{{`，即可在变量列表里看到并选择 **`@include`**（也可以输入 `{{@`）。应用会插入 `@include("path/to/your/file")`，并**选中**其中的占位路径，你可以直接输入真实路径覆盖它。

想要可复用的「具名」版本？用 [文件内容变量](#文件内容变量) 代替重复写路径。

## 条件判断

```text
{% if company_name %}
你代表 {{company_name}}。
{% elif region %}
按照 {{region}} 的规范执行。
{% else %}
使用默认策略。
{% endif %}
```

空值或缺失值为「假」，因此 `{% if company_name %}` 很适合用来「仅当某个变量有值时」才包含某段内容。

条件是真正的表达式：可以用 `and` / `or` / `not` 组合，用 `==` `!=` `>` `<` `>=` `<=` 比较，用 `in` 判断成员关系，还能写内联的 `if/else`：

```text
{% if tier == "pro" and not trial %}完整权限。{% endif %}
{% if tags and "urgent" in tags %}立即升级处理。{% endif %}

模式：{{ "verbose" if debug else "concise" }}
```

## 循环

```text
{% for item in ["research", "draft", "review"] %}
{{ loop.index }}. {{ item }}
{% endfor %}
```

在循环内部可以使用：`loop.index`（从 1 开始）、`loop.index0`（从 0 开始）、`loop.first`、`loop.last`、`loop.length`。

`{% for %}` 还能带一个 `{% else %}`，在集合为空时执行；也可以按 `key, value` 遍历对象：

```text
{% for doc in documents %}
### {{ loop.index }}. {{ doc.title }}
{{ doc.body }}
{% else %}
未提供任何文档。
{% endfor %}

{% for key, value in settings %}
- {{ key }}：{{ value }}
{% endfor %}
```

要遍历的列表/对象通常来自 **JSON 变量**（见下文）、上面那样的字面量列表，或被引入的文件。纯文本变量不能作为数据被遍历。

## 在模板中使用变量

已定义的变量（内置和自定义）都可以在模板里按名称使用，未知名称则保持原样：

```text
{% if true %}今天是 {{current_date}}。{{unknown_name}}{% endif %}
```

会渲染成类似 `今天是 2026-07-20。{{unknown_name}}`——已知变量被解析，未知占位符原样保留。

## JSON 变量

**JSON 变量**保存的是一个 JSON 对象或数组，而不是纯文本。运行时它会被解析成真正的值，因此模板里可以读取字段、基于字段判断、以及遍历它。

在 **Variables** 对话框里用 **Add ▸ JSON** 创建，起个名字（比如 `profile`），在编辑器里输入 JSON（会随输入实时校验）：

```json
{
  "user": { "name": "Ada", "plan": "pro" },
  "features": ["search", "code", "vision"],
  "limits": { "maxTokens": 4096 }
}
```

然后按名称使用。**字段访问**用 `.` 逐层深入：

```text
你好 {{ profile.user.name }}——你的套餐是 {{ profile.user.plan }}。
```

**条件判断**读取嵌套值：

```text
{% if profile.user.plan == "pro" %}
你拥有完整权限（{{ profile.limits.maxTokens }} tokens）。
{% else %}
你在免费套餐。
{% endif %}
```

**循环**遍历数组（对象则用 `key, value`）：

```text
已启用的功能：
{% for feature in profile.features %}
- {{ loop.index }}. {{ feature }}
{% endfor %}
```

以 `{{ profile }}` 引用**整个变量**时，会输出**美化过的 JSON**——很适合把结构化上下文整段丢给模型：

```text
上下文：
{{ profile }}
```

注意：

- 字段访问支持**独立使用**——即使整段文本里没有任何 `{% %}` 标签，`{{ profile.user.name }}` 也会渲染（这正是 [模板何时会被渲染](#模板何时会被渲染) 里 `.` / `[` / `|` / `(` 触发条件的作用）。
- **缺失**的字段渲染为空（`{{ profile.nope }}` → ``），所以当字段可能不存在时用 `{% if %}` 兜一下。
- 如果 JSON **不合法**，编辑器会显示解析错误，且该变量在运行时保持未解析（其占位符原样保留），而不会让整次运行失败。

## 文件内容变量

**文件内容变量**保存的是一个文件**路径**，运行时会被替换为该文件的**内容**——和 `@include` 是同一种能力，只是从内联宏换成了可复用的具名变量。

在 **Variables** 对话框里用 **Add ▸ File content** 创建，然后设置路径：既可以点 **Browse…**（打开操作系统原生的文件选择框），也可以直接手动输入——开头的 `~` 会展开为用户主目录，且**不校验**路径是否存在。

按名称引用即可把文件内容嵌入进来：

```text
{{ writing_style }}

请遵循上面的写作规范。
```

- 文件**缺失或无法读取**时，嵌入**空字符串**——不报错。
- **路径为空**时，占位符原样保留（等同于未设置的变量）。
- 内容按**原样**嵌入——文件里的变量和模板标签**不会**被再次渲染。如果你需要文件里自己的 `{{变量}}` / `{% … %}` 生效，请改用 [`@include`](#include-宏)（它会递归渲染）。
- 在只读的网页查看器中没有文件系统，因此文件内容变量不会嵌入任何内容。

当同一个外部文件被多个 Prompt/Thread 引用时，用文件内容变量把路径集中管理，比到处重复 `@include("…")` 更省心。

## 过滤器（Filters）

过滤器用 `|` 对值做变换。几个常用的：

```text
{{ name | default("there") }}          {# 为空/未定义时的兜底 #}
{{ profile.features | length }}         {# 3 #}
{{ profile.features | join(", ") }}     {# search, code, vision #}
{{ profile.user.name | upper }}         {# ADA #}
{{ notes | truncate(200) }}
```

过滤器可以从左到右链式调用：`{{ items | sort | join(", ") }}`。

## 一个更完整的示例

组合一个 `@include` 人设、一个 JSON 变量 `brief` 和控制流：

```text
{{@include("~/prompts/persona.md")}}

## 任务
{% if brief.audience %}写作对象：{{ brief.audience }}。{% else %}面向一般读者写作。{% endif %}
语气：{{ brief.tone | default("neutral") }}。

## 参考来源（{{ brief.sources | length }}）
{% for src in brief.sources %}
- [{{ loop.index }}] {{ src.title }} —— {{ src.url }}
{% else %}
（未提供）
{% endfor %}

## 检查清单
{% for step in ["列提纲", "起草", "标注引用", "校对"] %}
- [ ] {{ loop.index }}. {{ step }}
{% endfor %}

当前日期：{{current_date}}
```

……其中 `brief` 是一个 JSON 变量，例如：

```json
{
  "audience": "engineers",
  "tone": "concise",
  "sources": [{ "title": "RFC 9110", "url": "https://www.rfc-editor.org/rfc/rfc9110" }]
}
```

# 编辑器支持

Prompt 编辑器（System Prompt、消息、工具结果）都能识别模板语法：

- **语法高亮** —— `{{变量}}` 占位符以琥珀色高亮，`{% … %}` 标签以紫色高亮，让模板结构从正文中凸显出来。高亮只做语法层面的识别，不校验名称是否存在。
- **变量 / `@include` 补全** —— 输入 `{{` 会弹出可用变量列表，并附带 **`@include`**。选择 `@include` 会插入 `@include("path/to/your/file")`，并选中占位路径，直接输入覆盖即可。（输入 `{{@` 则直接收窄到 `@include`。）
- **标签补全** —— 输入 `{%` 会弹出块标签：`if`、`elif`、`else`、`endif`、`for`、`endfor`、`set`、`raw`、`endraw`。每个都会插入一个完整的 `{% … %}` 标签，并把光标放在你需要继续输入的位置（例如 `{% for ‸ in  %}`）。

# 渲染、存储与运行历史

- 替换发生在**运行时**；保存的 Thread 会保留原始的 `{{...}}` 与 `{% ... %}` 源文本。
- 一条消息或工具结果一旦运行过，其渲染输出会**为该次运行历史冻结**，因此即使之后被引入的文件或时间发生变化，回放和比较仍然保持字节一致。编辑源文本后会在下次运行时重新渲染。
- 在只读的网页查看器中没有文件系统，因此 `@include` 会解析为空字符串。

# 小贴士

- 把可复用的片段（人设、语气、通用约束）放到 Markdown 文件里用 `@include` 引入；较短的片段则存为自定义文本变量。
- 把结构化、需复用的数据（配置、记录、功能开关）放进 **JSON 变量**，用它驱动 `{% if %}` / `{% for %}`，而不必手改多份 Prompt。
- 用 `{% if %}` 开关可选段落，而不必维护多份 Prompt。
- 对可能缺失的字段用 `{% if data.field %}` 或 `| default(...)` 兜底——缺失字段会渲染为空。
- 如果某处模板意外地以纯文本形式渲染出来，检查标签是否成对——无法解析的模板会静默回退为原始文本。

---

另请参阅：

- [核心概念 › 变量](./core-concepts.zh-CN.md#variables)
- [快速开始](./get-started.zh-CN.md)
- [设置 › Skills](./settings.zh-CN.md)
