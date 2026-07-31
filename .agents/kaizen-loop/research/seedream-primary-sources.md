# Seedream `generate_image` 一手资料调研

- 访问日期：2026-07-31
- 范围：火山引擎方舟 Seedream 图片生成 API、OpenRouter Seedream 图片 API，以及 OpenAI / Anthropic / MCP 对 Agent 生图工具的最低能力基线
- 来源约束：仅使用服务商官方文档、官方协议和官方实时模型 API；不引用第三方教程

## 结论摘要

1. 火山方舟 Seedream 的数据面接口是 `POST https://ark.cn-beijing.volces.com/api/v3/images/generations`，最直接的鉴权方式是 `Authorization: Bearer $ARK_API_KEY`。[火山：图片生成 API][volc-image-api] [火山：Base URL 与鉴权][volc-auth]
2. 它不是“提交任务、拿 taskId、轮询结果”的异步任务 API。`stream: false`（默认）会等生成完成后一次性返回；支持流式的模型可在同一个 POST 上设置 `stream: true`，通过 SSE 返回逐张结果和结束事件。[火山：图片生成 API][volc-image-api] [火山：流式响应事件][volc-stream]
3. 截至访问日，火山官方图片生成模型已不止 Seedream 4.5，还包括 5.0 pro、5.0 lite、4.5、4.0。它们支持的分辨率、组图、流式、输出格式和参考图上限并不相同；配置不能把 “Seedream” 当作一个固定能力集合。[火山：模型列表][volc-models] [火山：图片生成 API][volc-image-api]
4. OpenRouter 当前官方 Image Models API 只列出 `bytedance-seed/seedream-4.5`。它使用 OpenRouter 统一的 `/api/v1/images` 契约、OpenRouter Key、标准化参数和 base64 响应；该 Seedream endpoint 明确 `supports_streaming: false`。[OpenRouter：图片生成][or-image-docs] [OpenRouter：实时模型列表][or-image-models] [OpenRouter：Seedream endpoint][or-seedream-endpoint]
5. 对 LLM Space 的 `generate_image` v1，最低完整体验不是只有一个 HTTP 封装：Agent 能发现并自主调用工具；工具输入有严格 schema；运行中、成功、失败清晰可见；成功结果以真正的 image content 回到对话；失败保留可操作错误；生成参数与实际模型可追踪。OpenAI 的 hosted image tool、Anthropic 的 client-tool loop 和 MCP Tools 规范共同支持这条基线。[OpenAI：Image generation tool][openai-image-tool] [Anthropic：Tool use][anthropic-tool-use] [MCP：Tools][mcp-tools]

## 1. 火山方舟 Seedream 原生 API

### Endpoint 与鉴权

| 项目 | 官方契约 |
| --- | --- |
| Base URL | `https://ark.cn-beijing.volces.com/api/v3` |
| 图片生成 | `POST /images/generations` |
| API Key | `Authorization: Bearer $ARK_API_KEY` |
| 内容类型 | `Content-Type: application/json` |
| Access Key | 数据面也支持 Access Key；使用 Access Key 时，请求体中的 `model` 必须使用 Endpoint ID |

来源：[火山：图片生成 API][volc-image-api]、[火山：Base URL 与鉴权][volc-auth]。

官方契约允许 `model` 使用 Model ID 或 Endpoint ID。Model ID 适合直接调用；Endpoint ID 提供独立限流、计费和监控等 endpoint 级能力。[火山：模型列表][volc-models]

### 当前图片模型与能力差异

| 模型 | Model ID | 单图 | 组图 | `stream` | 主要尺寸能力 | 参考图上限 |
| --- | --- | --- | --- | --- | --- | --- |
| Seedream 5.0 pro | `doubao-seedream-5-0-pro-260628` | 是 | 否 | 否 | 1K / 2K；默认 2K | 10 |
| Seedream 5.0 lite | `doubao-seedream-5-0-260128`；官方也注明 `doubao-seedream-5-0-lite-260128` | 是 | 是 | 是 | 2K / 3K / 4K | 14 |
| Seedream 4.5 | `doubao-seedream-4-5-251128` | 是 | 是 | 是 | 2K / 4K | 14 |
| Seedream 4.0 | `doubao-seedream-4-0-250828` | 是 | 是 | 是 | 1K / 2K / 4K | 14 |

官方模型列表为上述图片模型标注的最大 IPM 均为 500。具体配额仍可能受账号、Endpoint 和服务策略影响，不应把列表上限当作客户端稳定吞吐保证。[火山：模型列表][volc-models]

### 请求字段

| 字段 | 必填 | 类型 / 取值 | 关键约束 |
| --- | --- | --- | --- |
| `model` | 是 | `string` | Model ID 或 Endpoint ID |
| `prompt` | 是 | `string` | 支持中英文；官方建议不超过 300 个汉字或 600 个英文单词 |
| `image` | 否 | `string \| string[]` | HTTP(S) URL 或 `data:image/<format>;base64,...`；用于参考图/编辑 |
| `size` | 否 | 档位或 `宽x高` | 档位与显式像素不可混用；各模型档位和像素范围不同 |
| `optimize_prompt_options` | 否 | `{ mode?: "standard" \| "fast" }` | 默认 `standard`；`fast` 以质量/优化程度换较低延迟 |
| `output_format` | 否 | `"png" \| "jpeg"` | 默认 `jpeg`；官方当前只标注 5.0 pro / lite 支持 |
| `response_format` | 否 | `"url" \| "b64_json"` | 默认 `url`；URL 仅 24 小时有效 |
| `sequential_image_generation` | 否 | `"auto" \| "disabled"` | 默认 `disabled`；只适用于 5.0 lite / 4.5 / 4.0 |
| `sequential_image_generation_options.max_images` | 否 | `1..15` | 默认 15；输入参考图数 + 最终生成图数不得超过 15 |
| `stream` | 否 | `boolean` | 默认 `false`；只适用于 5.0 lite / 4.5 / 4.0 |
| `tools` | 否 | `[{ type: "web_search" }]` | 只适用于 5.0 lite |
| `watermark` | 否 | `boolean` | 默认 `true`，在右下角加“AI 生成”水印 |

参考图官方约束：支持 jpeg/png/webp/bmp/tiff/gif/heic/heif；base64 data URL 中格式名需小写；宽高比在 `[1/16, 16]`；边长大于 14 px；单图不超过 30 MB；总像素不超过 36,000,000。[火山：图片生成 API][volc-image-api]

显式尺寸范围按模型不同：

- 5.0 pro：总像素 `[921600, 4624220]`，宽高比 `[1/16, 16]`。
- 5.0 lite / 4.5：总像素 `[3686400, 16777216]`；显式像素默认 `2048x2048`。
- 4.0：总像素 `[921600, 16777216]`；显式像素默认 `2048x2048`。

来源：[火山：图片生成 API][volc-image-api]。

### 非流式响应

`stream: false` 时，服务完成生成后返回一个 JSON 对象：

- 顶层包含 `created`、`model`、`data[]`、`usage`，必要时包含 `error` 和 `tools`。
- 每个成功的 `data` 元素按 `response_format` 返回 `url` 或 `b64_json`，并带 `size`。
- 组图允许“部分成功”：单张失败可在对应 `data` 元素中返回 `error: { code, message }`，其他成功图不受影响；只有全部未生成才返回顶层错误。
- `usage.generated_images` 是成功生成的图片数，官方说明只对成功图片计费；另有 `output_tokens`、`total_tokens`。5.0 pro 还可能返回 `input_images`，5.0 lite 联网搜索时可能返回 `tool_usage.web_search`。
- 审核导致的单图失败会继续后续组图；内部服务 500 会停止后续图片任务。

来源：[火山：图片生成 API][volc-image-api]。

### 流式与“是否异步”

该接口有两种同请求响应方式，而非任务队列协议：

| 模式 | 行为 |
| --- | --- |
| `stream: false` | 同一 HTTP 请求等待所有图片完成，随后一次性返回 JSON |
| `stream: true` | 同一 POST 保持连接并返回 SSE；逐张成功/失败，最后返回完成事件 |

SSE 事件包括：

- `image_generation.partial_succeeded`：某张图成功，包含 `image_index`、`url` 或 `b64_json`、`size`。
- `image_generation.partial_failed`：某张图失败，包含 `image_index` 和 `error`。
- `image_generation.completed`：全部处理结束，包含 `usage`，必要时包含 `tools`。
- 顶层失败使用 `error` 事件。

Seedream 5.0 pro 暂不支持 `stream`；5.0 lite、4.5、4.0 支持。[火山：图片生成 API][volc-image-api] [火山：流式响应事件][volc-stream]

### 错误语义与客户端处理边界

| HTTP | 代表性错误码 | 官方语义 | v1 客户端处理推论 |
| --- | --- | --- | --- |
| 400 | `MissingParameter`、`InvalidParameter`、`InvalidParameter.UnsupportedParameter` | 缺少/非法/不支持的参数 | 不重试；把字段错误显示给用户 |
| 400 | `InputTextSensitiveContentDetected`、`InputImageSensitiveContentDetected`、`OutputImageSensitiveContentDetected` | 输入文本、输入图片或输出图片命中内容安全 | 不盲目重试；给 Agent 和用户可读原因 |
| 400 | `InvalidImageURL.InvalidFormat` | 图片 URL 或格式非法 | 不重试；提示修正输入 |
| 401 | `AuthenticationError` | API Key 或 AK/SK 缺失/无效 | 不重试；引导检查凭据 |
| 403 | `OperationDenied.ServiceNotOpen` 等 | 服务未开通、欠费或无权限 | 不重试；保留官方 code/message |
| 404 | `InvalidEndpointOrModel.NotFound`、`ModelNotOpen` 等 | Model / Endpoint 不存在或未开通 | 不重试；检查配置的模型标识 |
| 429 | `ModelAccountIpmRateLimitExceeded`、Endpoint/API 限流、`QuotaExceeded`、`ServerOverloaded` 等 | 达到图片 IPM、RPM/TPM、配额或系统过载 | 可对可恢复项指数退避；给出最终失败原因 |
| 500 | `InternalServiceError` | 内部系统异常 | 可有限重试并保留 request context |

上表前三列来自[火山：错误码][volc-errors]。最后一列是根据 HTTP/错误语义给 LLM Space 的工程推论，不是火山官方规定；网络瞬断同样可做有限指数退避。

### 最小连通请求

```bash
curl 'https://ark.cn-beijing.volces.com/api/v3/images/generations' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "doubao-seedream-5-0-pro-260628",
    "prompt": "一只在窗边晒太阳的橘猫",
    "size": "2K",
    "response_format": "b64_json",
    "watermark": false
  }'
```

字段均来自[火山：图片生成 API][volc-image-api]。对 Agent tool，选择 `b64_json` 可以直接转成 image content，避免 URL 24 小时失效和二次下载，但会放大 RPC/消息载荷；选择默认 `url` 则应立即下载并持久化或转成 image content。这是实现取舍，不是官方建议。

## 2. OpenRouter Seedream 图片 API 差异

### 当前官方实时能力

OpenRouter 的官方实时 Image Models API 在访问时只返回一个 Seedream 图片模型：`bytedance-seed/seedream-4.5`。[OpenRouter：实时模型列表][or-image-models]

对应 endpoint 记录为：

- provider：`Seed`，slug/tag 均为 `seed`。
- 输入模态：`text`、`image`；输出模态：`image`。
- 分辨率：`1K`、`2K`、`4K`。
- 宽高比：`1:1`、`1:2`、`2:1`、`2:3`、`3:2`、`3:4`、`4:3`、`4:5`、`5:4`、`9:16`、`16:9`、`9:19.5`、`19.5:9`、`9:20`、`20:9`、`9:21`、`21:9`、`auto`。
- `n` 为 1–10；`input_references` 为 0–14；支持 `seed`。
- `supports_streaming: false`，无 provider passthrough 参数。
- 访问时价格记录为每张输出图 USD 0.04；价格是动态数据，实施前应重新读 API，不应硬编码。

来源：[OpenRouter：Seedream endpoint][or-seedream-endpoint]。

### 请求与响应

```http
POST https://openrouter.ai/api/v1/images
Authorization: Bearer <OPENROUTER_API_KEY>
Content-Type: application/json
```

最小 body 是 `model` + `prompt`。成功响应的 `data[]` 返回 `b64_json`，能够识别格式时同时返回 `media_type`；`usage` 可包含 token 与成本。OpenRouter 还提供统一的 `resolution`、`aspect_ratio`、`size`、`n`、`seed`、`input_references`、provider routing 等字段，但调用前应以实时模型/endpoint 的 `supported_parameters` 为准。[OpenRouter：图片生成][or-image-docs]

### 原生方舟与 OpenRouter 对照

| 维度 | 火山方舟原生 Seedream | OpenRouter Seedream |
| --- | --- | --- |
| Endpoint | `/api/v3/images/generations` | `/api/v1/images` |
| 鉴权 | 火山 ARK API Key；也支持 AK/SK | OpenRouter API Key |
| 当前模型覆盖 | 5.0 pro、5.0 lite、4.5、4.0 | 实时 API 当前只列 4.5 |
| 模型标识 | `doubao-seedream-*` 或 Endpoint ID | `bytedance-seed/seedream-4.5` |
| 参数风格 | Seedream 原生字段与逐型号能力 | OpenRouter 标准化字段与实时 capability descriptor |
| 返回 | `url` 或 `b64_json` | `b64_json` + 可识别时的 `media_type` |
| URL 生命周期 | 默认 URL 24 小时 | 正常响应直接 base64，无短期 URL 依赖 |
| 组图 | 5.0 lite / 4.5 / 4.0 可由模型决定组图，最多受总数 15 限制 | `n` 1–10；语义是请求图片数 |
| 流式 | 5.0 lite / 4.5 / 4.0 支持 SSE | 当前 Seedream 4.5 endpoint 明确不支持流式 |
| Provider routing | 无聚合路由 | 支持 `provider.only/order/ignore/sort/allow_fallbacks`，但当前 Seedream endpoint 只有 `seed` |
| 错误/计费 | 原生错误 code/message；组图可部分失败，成功图计费 | 官方说明 generation 完成则全额计费；失败或取消不计费，未完成返回 502；当前 Seedream 不流式 |

OpenRouter 对取消/失败的计费与 502 语义来自[OpenRouter：图片生成 - Billing and Cancellation][or-image-docs]。这不应被套用到火山原生 API。

## 3. Agent / workbench 的 `generate_image` 最低体验

下表不是对竞品 GUI 的截图审计，而是从官方工具契约推导的 v1 表格化基线；“LLM Space 最低要求”列属于产品/工程推论。

| 能力 | OpenAI 官方 image tool | Claude / MCP 官方能力 | LLM Space `generate_image` v1 最低要求（推论） |
| --- | --- | --- | --- |
| Agent 自主调用 | Responses API 加入 `{ type: "image_generation" }` 后，主模型可决定何时、如何生图；也可用 `tool_choice` 强制 | Claude 默认 `tool_choice:auto`，根据工具描述决定调用；MCP tools 是 model-controlled | 用户在对话中提出生图意图后，Agent 可发现并调用；无需用户手工执行 HTTP |
| 输入契约 | Hosted tool 暴露 size、quality、format、compression、background、action 等选项 | Claude custom tool 使用 `input_schema`，`strict:true` 可保证 schema 一致；MCP `inputSchema` 定义参数 | `prompt` 必填；型号能力用 enum/range 表达；不向不支持的模型发送字段 |
| 运行状态 | 返回 `image_generation_call`，含 `status`；支持 1–3 张 partial images 的流式反馈 | MCP 要求/建议客户端提供清晰调用指示；工具调用有明确 request/result 边界 | 至少呈现 running / completed / failed；v1 可不做预览流，但不能表现为静默卡住 |
| 原生图片结果 | `image_generation_call.result` 是 base64 图片 | MCP tool result 原生支持 `{ type:"image", data, mimeType }` | 工具结果返回真正 image content，并在消息中内联显示；不能只返回一段 URL 文本 |
| Agent 续写 | 生图结果是 response output；支持用 previous response/image call ID 多轮编辑 | Claude 应用执行 client tool 后以 `tool_result` 回传，模型继续回答 | 成功或失败都要回到 agent loop，使模型能解释结果或继续任务 |
| 错误可见性 | Call 有 status；API 错误由 Responses API 暴露 | MCP 区分 JSON-RPC protocol error 与 `isError:true` 的执行错误；Anthropic 明确要求处理 tool result/error | 保留 provider 的 code/message，区分配置、输入审核、限流和服务错误；让用户能行动 |
| 可追踪性 | Call 暴露 `revised_prompt`；结果关联 call ID | MCP 建议显示工具输入、记录工具使用；工具有稳定 name/title/schema | 记录实际 provider、model、输入参数和 tool call 状态；如有优化后的 prompt，应保留而非覆盖原输入 |
| 人在回路 | 可由应用用 `tool_choice` 控制是否强制调用 | MCP 建议清楚显示暴露的工具、调用指示，并让用户能拒绝敏感调用 | 生图本身通常可自动执行；但必须清晰显示工具调用与参数，未来涉及付费/敏感外部写入时可加确认策略 |

来源：[OpenAI：Image generation tool][openai-image-tool]、[Anthropic：Tool use][anthropic-tool-use]、[MCP：Tools][mcp-tools]。

补充边界：Anthropic 当前官方 server-tool 目录没有内置 image generation tool；Claude 的可行路径是自定义 client tool 或 MCP tool。MCP 的 Tool Result 原生支持 base64 `ImageContent` 与 `mimeType`，因此协议层无需把图片降级成 URL 文本。[Anthropic：Tool use - Choose a tool][anthropic-tool-use] [MCP：Tools - Image Content][mcp-tools]

## 4. 对本次 Kaizen v1 的直接含义

以下为基于官方契约的实现建议，不是服务商原文：

1. **Provider 与 model 分离。** Seedream 配置至少需要 provider 类型、凭据、base URL 和 model ID；不能用一个布尔值代表全部 Seedream 能力。
2. **v1 取公共单图子集。** `prompt`、可选参考图、`size`、`response_format`、`watermark` 足以形成可体验的原生方舟 v1。不要默认发送 5.0 pro 不支持的 `stream` / 组图字段，也不要向 4.x 默认发送仅 5.0 被文档标注的 `output_format`。
3. **返回 image content。** 若直接请求 `b64_json`，可直接形成 Agent 的图片内容；若请求 URL，应立即下载并转成持久结果，因为方舟 URL 24 小时失效。
4. **v1 可以非流式。** 原生 API 的 `stream:false` 是完整同步请求，足以实现最小闭环；状态 UI 仍需显示 running。SSE、partial image 和组图可作为后续能力。
5. **错误不可压平成字符串 `Generation failed`。** 应保留 HTTP status、provider code 和 message；内容审核、凭据、未开通、模型错误与限流需要不同用户动作。
6. **OpenRouter 是独立接入路径。** 如果 v1 目标明确是“火山 Seedream 配置”，不要把 OpenRouter 当作原生 base URL 替换；两者鉴权、模型 ID、参数、返回与能力发现机制不同。

## 5. 不确定性与实施前复核

- 火山文档在访问时已经出现 5.0 pro / lite，且页面更新到 2026-07。模型标识和能力变化快，实施和发布前应重新读取模型列表与图片 API 页面。
- `output_format` 当前只标注 5.0 pro / lite 支持；4.5 / 4.0 不应发送，除非真实账号连通测试证明并补充测试依据。
- OpenRouter 官方文档示例中的 Seedream capability 可能是示例快照；本报告对当前能力采用实时 `/api/v1/images/models` 与 endpoint API 的返回。价格尤其不能硬编码。
- 本次没有可用的真实火山或 OpenRouter 凭据，因此没有执行付费生成请求；请求/响应结论来自官方契约，连通性、账号地区权限、内容审核与真实延迟仍待沙盒账号验证。
- 本报告未依赖或保留额外的 OpenAI Docs MCP 配置；OpenAI 部分直接使用官方 `developers.openai.com` 的 Markdown 文档，不使用非官方镜像。
- “最低体验”是由官方 API/协议行为推导，不等同于对 OpenAI/Claude 最终用户 GUI 的完整竞品审计。

## 官方来源

所有链接访问日期均为 **2026-07-31**。

| 来源 | URL | 本报告用途 |
| --- | --- | --- |
| 火山引擎方舟：图片生成 API | [链接][volc-image-api] | endpoint、模型差异、请求/非流式响应、计费与输入约束 |
| 火山引擎方舟：Base URL 与鉴权 | [链接][volc-auth] | Base URL、API Key / Access Key |
| 火山引擎方舟：图片生成流式响应事件 | [链接][volc-stream] | SSE 事件与完成语义 |
| 火山引擎方舟：错误码 | [链接][volc-errors] | HTTP 状态与 provider error code |
| 火山引擎方舟：模型列表 / 图片生成能力 | [链接][volc-models] | 当前 Model ID、能力与 IPM |
| OpenRouter：Image Generation | [链接][or-image-docs] | 统一图片 API、参数、响应、路由、计费/取消 |
| OpenRouter：Image Models API | [链接][or-image-models] | 当前图片模型能力实时数据 |
| OpenRouter：Seedream 4.5 endpoint API | [链接][or-seedream-endpoint] | 当前 provider、参数、流式与价格记录 |
| OpenAI：Image generation tool | [链接][openai-image-tool] | Agent 自主生图、call/result、参数、修订 prompt、多轮与流式 |
| Anthropic：Tool use with Claude | [链接][anthropic-tool-use] | client/server tool loop、schema、tool choice 与错误处理边界 |
| Model Context Protocol：Tools | [链接][mcp-tools] | tool discovery/call、ImageContent、structured result、错误与 UI 安全建议 |

[volc-image-api]: https://www.volcengine.com/docs/82379/1541523
[volc-auth]: https://www.volcengine.com/docs/82379/1298459
[volc-stream]: https://www.volcengine.com/docs/82379/1824137
[volc-errors]: https://www.volcengine.com/docs/82379/1299023
[volc-models]: https://www.volcengine.com/docs/82379/1330310#9df4d9fd
[or-image-docs]: https://openrouter.ai/docs/guides/overview/multimodal/image-generation
[or-image-models]: https://openrouter.ai/api/v1/images/models
[or-seedream-endpoint]: https://openrouter.ai/api/v1/images/models/bytedance-seed/seedream-4.5/endpoints
[openai-image-tool]: https://developers.openai.com/api/docs/guides/tools-image-generation
[anthropic-tool-use]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
[mcp-tools]: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
