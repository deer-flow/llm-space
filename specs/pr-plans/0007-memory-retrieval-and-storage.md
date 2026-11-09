# PR 计划 0007：记忆插件——日韩/中文检索修复 + 存储治理（去重、更新、加权、衰减、归档、管理面板）

> 状态：**§3.1–§3.7 全部已实现**（插件侧 15/15 测试通过）。§3.6 面板已写完，待装 `apps/desktop` 的 `@tanstack/react-virtual` 依赖引用后跑最终校验。
> ⚠️ 新增依赖引用：`apps/desktop` 需声明 `@tanstack/react-virtual`（根 catalog 已有 `^3.14.9`，`packages/ui` 正在用，故不产生新下载）。
> 已改：`apps/desktop/src/bun/plugins/memory-plugin-files.ts`（分词引擎 + 打分 + 去重/upsert/归档/衰减/加权 + `config.schema.json`，插件版本 1.0.0 → 1.1.0）、`apps/desktop/src/bun/plugins/seed.ts`（seed marker 升级机制 + 1.0.0 遗留哈希）、`seed.test.ts`（新增 11 个用例）。
> 性质：**含真 bug 修复**（日语/韩语/阿拉伯语等"非拉丁非汉字"脚本**完全搜不到**，实测见 §2.1）+ 若干能力补齐。建议与 **0006（i18n 日韩阿）** 打包同一 PR 或紧随其后——UI 变日文/韩文/阿拉伯文后，用户自然会往里存对应语言的内容，检索却搜不到，两条线必须一起交付。
> 改动集中在**内置记忆插件**（`apps/desktop/src/bun/plugins/memory-plugin-files.ts` 里的 `String.raw` 源码串）+ 桌面端新增一个设置页。**不碰运行时层、不改 core 的 plugin 契约**（§3.7 有一个可选的 core 常量共享提议）。

## 1. 背景与目标

内置记忆插件（`#162` 合入）目前"能存能搜"，但检索与存储两侧都有实打实的缺陷：

1. **非拉丁、非汉字的脚本全部检索不到（真 bug，不止日韩）**：`tokenize` 的分词正则只白名单放行 `a-z0-9` 与 CJK 汉字区，其余字符被整段当作分隔符丢掉——实测（bun 1.4.2）阿拉伯语、俄语、泰语、希伯来语的查询切出来都是**空数组**（详见 §2.1），日文假名也几乎全丢。英文是唯一"能用"的分支，但见下条。
   - **范围对齐 0006**：0006 覆盖 es/fr（拉丁）、ja（汉字+假名）、ko（韩文）、**ru（西里尔，本次新增）**、zh-TW（汉字）、ar（RTL 后续 PR）→ 这些脚本是**必测必过**；泰语、希伯来语不在 0006 内 → **不专门投入**（不写专门归一化、不排优先级），但由于新方案是按 Unicode 属性取词，它们**顺带就能搜**，只留一条最便宜的冒烟断言（§6）。
2. **中文也弱**：连续的汉字段不分词，多字词要求原文连续出现，命中率低于合理水平。
2b. **英文能用但很糙**：靠 `content.includes(term)` 做**子串**匹配，`"art"` 会命中 `"started"`/`"chart"`；也没有大小写/全角之外的任何归一化。
3. **1000 条上限是静默丢弃**：`records.shift()` 直接扔掉最旧的，用户无感。
4. **`origin` 存了不用**：每条记忆记了来源项目路径，检索既不加权也不过滤，当前项目的记忆没有优先优势。
5. **没有 update、没有去重**：改一条记忆只能 `forget` + `save`（id 还变了），重复 `save` 相同内容会堆多条。
6. **没有时间衰减**：三年前和昨天的记忆同分，容易召回过时结论。
7. **用户看不见存了什么**：只能靠 agent 转述，无法浏览/清理。

**目标**：把检索从"只认拉丁+汉字"改成**脚本无关**（日韩、阿拉伯、西里尔、泰文、希伯来等全部可用，中/日/泰这类无空格脚本用 Segmenter + bigram 提召回）、让容量操作可见且可恢复、让"当前项目 > 近期 > 远期"的排序成立、并给用户一个能看见能清理的管理面板。

## 2. 现状（代码事实）

| 关注点 | 位置 | 现状 |
| --- | --- | --- |
| 分词 | `memory-plugin-files.ts:185-187` | `query.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/)`——**未覆盖**：日文平假名 `\u3040-\u309f`、片假名 `\u30a0-\u30ff`（含语音扩展 `\u31f0-\u31ff`）、韩文音节 `\uac00-\ud7a3` 与兼容字母 `\u3130-\u318f`、CJK 扩展 A `\u3400-\u4dbf`、兼容汉字 `\uf900-\ufaff`、全角/半角体系 `Ａ１` 与半角片假名 `\uff66-\uff9d` |
| 打分 | `:189-211` | 逐 term 累加：`id` 全等 +10、tag 全等 +5、tag 包含 +2、`content.includes(term)` +1；排序兜底按 `createdAt` 倒序（`:251-255`） |
| 记录结构 | `:41-47` | `{ id, content, tags, origin, createdAt }`——**无 `updatedAt`**，因此"改"无法表达 |
| 上限 | `:49-50`、`169-172` | `MAX_TOTAL_MEMORIES = 1000`；`while (records.length > MAX) records.shift();` ——**丢弃不提示、不归档** |
| origin 写入 | `:152-156` | 取自 `context.variables.current_working_directory`；**仅在工具返回值里回显，不参与打分** |
| 去重 | — | 无。同内容反复 `save` 会堆多条，id 每次都变 |
| 更新 | `:294-311` | 只有 `memory_forget`；改一条 = delete + save |
| 衰减 | — | 无。得分与时间无关 |
| 存储文件 | `:52-63` | `<LLM_SPACE_HOME>/data/plugins/@llm-space/memory/memories.jsonl`；`writeRecords` 已是 `.tmp` + `renameSync` 原子写（`:92-99`） |
| **部署坑** | `plugins/seed.ts:19-30` | 插件根已存在即 **return**，永不以新版本覆盖 → **现有安装永远拿不到本次修复**；`seed.test.ts:56-68` 明确断言"永不覆盖已有安装"（保留用户改动） |
| 插件可调参 | `packages/runtime/src/plugins/plugin-runner.ts:69-83`（尤其 `:71`） | 工具执行 context **已经带 `settings`**（schema 默认值与用户设置合并后的快照）；类型在 `packages/core/src/types/plugins.ts:166-175` |
| 通知通道 | `ThreadStorageContext.notify`（同上 `:169`；runner `:73` 转发宿主 `notify`） | 工具可向用户弹 toast —— 用于"已归档 N 条"这类必须可见的事件 |
| 插件 Settings 能力边界 | `docs/plugins.md:324-331` | `config.schema.json` 只生成**表单**（object/string/number/integer/boolean/enum/primitive array + required/default/title/description），**无法渲染列表 + 行内操作** → 浏览/清理面板必须是桌面端原生设置页 |
| 设置页注册 | `settings-dialog.tsx` `PAGES`（约 `:59-80`）+ `t.settingsDialog.pages[labelKey]`（`:246`、`:262`） | 新增页面 = 加一条 `PAGES` + i18n key + 页面组件 |
| 现成 RPC 范式 | `bun/skills/index.ts` + `client/skills.ts` | bun 侧注册 handler、client 侧薄包装、设置页消费——记忆面板照抄这套 |
| 源码书写约束 | `memory-plugin-files.ts:6-8` | 工具源码在 `String.raw` 里，**不能出现反引号与 `${`**，字符串一律用 `+` 拼接（写新代码时必须遵守） |

**关键结论**：tokenize 是"把非白名单字符当分隔符"，命中与否完全取决于字符是否落在白名单里。

### 2.1 实测：现状分词对各脚本的行为（bun 1.4.2，本机跑的）

用现状正则 `/[^a-z0-9\u4e00-\u9fff]+/` 直接 split：

| 查询 | 切出的 terms | 结论 |
| --- | --- | --- |
| `remember to use bun`（英） | `["remember","to","use","bun"]` | 唯一能用的分支 |
| `البحث في الذاكرة`（阿，0006 后续 PR） | `["",""]` | **全丢** → 必修 |
| `память поиск`（俄，0006 新增） | `["",""]` | **全丢** → 必修 |
| `これを覚えて`（日/假名） | `["","覚",""]` | 只剩汉字 → 必修 |
| `메모리 검색`（韩） | 同上 | → 必修 |
| `ค้นหาความจำ`（泰，**不在 0006**） | `["",""]` | 顺带覆盖，不专门投入 |
| `חיפוש זיכרון`（希伯来，**不在 0006**） | `["",""]` | 顺带覆盖，不专门投入 |

也就是说：**加了 0006 的日/韩/阿 UI 之后，用户存进去的日文、韩文、阿拉伯文内容仍然搜不出来**——这正是本 PR 必须与 0006 一起交付的原因。

### 2.2 运行时能力探测（同样实测，决定方案选型）

| 能力 | 结果 |
| --- | --- |
| `Intl.Segmenter` | **可用**（bun 1.4.2）；`ja` 文本 → `["東京","都","の","設定"]`、`th` → `["ค้นหา","ความ","จำ"]`、`zh` → `["记忆","检索","召回"]`、`ar` → `["البحث","في","الذاكرة"]`、`ko` → `["메모리","검색"]` |
| Segmenter 对 locale 是否敏感 | **不敏感**：同一段日文在 ja/zh/ko/th/ar/en/und 下切分结果一致 → 不必猜 locale，用默认即可 |
| `\p{L}` / `\p{Script=...}`（`u` 标志） | 全部可用（`Script=Arabic` / `Thai` / `Han` / `Hiragana` / `Hangul` 均正常） |
| `[\p{L}\p{N}\p{M}]+` 取词 | 阿拉伯语带符词、西里尔词都完整保留；泰语/日语则整段连成一块（需要再切） |
| NFKC 折叠 | 全角 `Ａ１`→`A1`、半角片假名 `ﾃｽﾄ`→`テスト`、韩文兼容字母 `ㄱㅏ`→`가`（能组合） |
| NFKC **不折叠**的 | 阿拉伯语 alef 变体（أ إ آ ٱ ا 五个都保留）、词尾/词中形差异 |
| 去 `\p{M}` 组合记号 | 阿拉伯 harakat `البَحْثُ`→`البحث`、希伯来 niqqud 正常；**但天城体 `स्मृति`→`समत`（元音符号被吃掉，语义变形）→ 印度系脚本不能无脑去记号** |

## 3. 设计方案

### 3.1 检索修复：脚本感知的通用分词（不再堆白名单）

> 结论先行：**不要继续往白名单里加码点区间**（加了日韩，还有阿拉伯、西里尔、泰文、希伯来、天城体……永远补不完）。改成"按 Unicode 属性取词 → 按脚本决定怎么切 → 按脚本做归一化"，所有语言一次覆盖，将来出新脚本也不用改代码。

**第一步：用 Unicode 属性取词（覆盖一切脚本）**

```ts
// 词 = 字母 + 数字 + 组合记号（组合记号必须保留，否则阿拉伯语/希伯来语的元音符会被切开）
const WORD_RUN = /[\p{L}\p{N}\p{M}]+/gu;
```

- 从此 `a-z0-9` 只是"众多脚本中的一种"，阿拉伯语、西里尔、泰文、希伯来、天城体全部自动进 terms（实测见 §2.1，现状它们全是空数组）
- 不再需要枚举 `\u3040-\u309f` 这类区间；CJK 扩展区（`\u{20000}+` 之类）也自动覆盖

**第二步：按脚本决定"要不要再切"**

- **有空格的脚本**（拉丁、西里尔、希腊、阿拉伯、希伯来、天城体等）→ 整词成 term，不再处理
- **无空格的脚本**（汉字、平/片假名、韩文、泰文、老挝、高棉、缅甸等 scriptio continua）→ 必须再切，否则"多字词要求原文连续出现"的老问题会原样搬过来

**第三步：无空格脚本怎么切——`Intl.Segmenter` 优先 + bigram 兜底（实测两者都可用）**

```ts
// 1) ICU 分词（实测 bun 1.4.2 可用，且对 locale 不敏感 → 用默认 locale 即可）
//    ja: 東京都の設定 -> [東京, 都, の, 設定]   th: ค้นหาความจำ -> [ค้นหา, ความ, จำ]
//    zh: 记忆检索召回 -> [记忆, 检索, 召回]      ko: 메모리 검색 -> [메모리, 검색]
// 2) bigram 兜底：ICU 缺数据 / 抛错 / 切分不理想（如"東京都"被切成"東京"+"都"）时仍能召回
function subTerms(run: string): string[] {
  const grams: string[] = [];
  for (let i = 0; i + 1 < run.length; i++) { grams.push(run.slice(i, i + 2)); }
  if (run.length === 1) { return [run]; }
  const segmented = trySegmenterWords(run);      // Intl.Segmenter，失败返回 []
  return Array.from(new Set(grams.concat(segmented)));
}
```

- **为什么要并集而不是二选一**：Segmenter 切得准（"設定"是词），bigram 切得全（不会漏"京都"这种跨边界组合）；两者并集召回最好，代价只是 gram 数量翻倍，在这个数据规模（≤1000 条）完全可以接受
- **兜底必须存在**：插件跑在独立子进程里，`Intl.Segmenter` 的可用性要在**插件 runner 内**实测确认（CLI 里可用不等于子进程可用，见 §6）

**第四步：归一化（脚本相关，不能一刀切）**

| 步骤 | 适用范围 | 实测依据 |
| --- | --- | --- |
| `NFKC` | 全部 | 全角 `Ａ１`→`A1`、半角片假名 `ﾃｽﾄ`→`テスト`、韩文兼容字母 `ㄱㅏ`→`가` |
| 去组合记号 `\p{M}` | **仅阿拉伯语、希伯来语** | `البَحْثُ`→`البحث`；但天城体 `स्मृति`→`समत`（元音被吃、语义变形）→ **印度系脚本禁止去记号** |
| 字母变体折叠 | 阿拉伯语 | NFKC **不折叠** alef 变体：أ إ آ ٱ 与 ا 是五个不同码位；另需 `ى→ي`、`ة→ه`（可选）、去 tatweel `ـ`、去 harakat `\u064b-\u0652` / `\u0670` |
| 大小写 | 拉丁/西里尔/希腊 | 沿用 `toLowerCase()`；希腊最终 sigma `ς/σ` 建议显式折叠 |

**第五步：打分改造**（保持现有信号，追加覆盖率与"整词"精度）

```ts
// 现有：id / tag / content 的匹配信号全部保留
// (a) gram 覆盖率  命中率 = |查询grams ∩ 记录grams| / |查询grams|
//     命中率 >= 0.5（可调）才计入 + coverage * GRAM_WEIGHT
// (b) 有空格脚本的整词 vs 子串：整词命中 +3，仅子串命中 +1
//     （现状只有 includes()，搜 "art" 会命中 "started"/"chart"）
```

- 目的：(a) 修掉"搜不到"，又不让「東京」因为单个「東」字召回一堆噪声；(b) 把英文从"子串乱命中"改成"整词优先、子串兜底"
- 排序 tie-break 不变（`score` 降序 → `createdAt` 降序）

### 3.2 容量上限：归档而不是静默丢弃

- 触发淘汰时，**先把淘汰项按行 append 到同目录 `memories.archive.jsonl`**（字段沿用 `MemoryRecord` + `archivedAt`），再落盘主文件
- 归档本身也设上限（建议保留最近 5000 行 FIFO），避免无限膨胀
- **必须让用户看见**：`await context.notify(...)` 弹 toast（例如"已达 1000 条上限，最旧的 3 条已归档到 memories.archive.jsonl"），并在返回值里带 `{ evicted: n, archived: true }`
- 提前预警：跨过 90% 阈值时 notify 一次——**只在跨越阈值的那一刻**，不是每次 save 都提示（避免刷屏）
- 决定：**不自动删除任何东西**（只搬去归档文件），用户/面板可以自行清理

### 3.3 `origin` 加权：当前项目优先命中

- 取 `context.variables.current_working_directory` 作为当前项目路径（两端去掉尾部 `/` 后比较）
- 打分：`record.origin === cwd` → **加 `projectBoost`（默认 +4，可调）**；排序后当前项目记忆自然靠前
- 新增可选参数 `scope: "auto" | "project" | "all"`（默认 `auto` = 加权但不排除；`"project"` = 只返回同源记忆；`"all"` = 关闭加权用于全局回忆）
- 权重与是否启用走插件 Settings（见 §3.6）

### 3.4 更新与去重

**更新（保持 id 不变）**：给 `memory_save` 增加**可选** `id` 参数（upsert）：

- 命中已有 `id` → 覆盖 `content` / `tags`，**保留 `id`**，`createdAt` 不变，新增 `updatedAt`（旧记录无此字段时按 `createdAt` 处理，`readRecords` 只校验 `id`/`content`，天然向后兼容）
- 返回 `{ saved: true, id, updated: true }`
- *为什么不加 `memory_update` 新工具*：现有描述里已经叫"忘+存"，多加一个工具面会让模型更容易选错；扩展 save 天然兼容旧调用（无 `id` 时行为完全不变）。**这点留给 maintainer 拍板**（§5.2）

**去重**：

- 归一化 key = NFKC + 小写 + 折叠空白；**完全重复** → 不写盘，返回 `{ saved: true, id: <既有 id>, duplicate: true }`
- **近重复**（gram Jaccard ≥ 0.9，阈值可调）→ **不自动覆盖**，返回 `{ duplicate: true, existingId, similarity }`，让 agent 决定要不要带 `id` 更新——避免"静默合并"把两条不同信息吞成一条
- 兜底：返回体统一带 flag，SKILL.md 里写明"发现 duplicate 时优先用 id 更新，而不是再 save 一条"

### 3.5 时间衰减

- `decay = Math.pow(2, -ageDays / halfLifeDays)`，`halfLifeDays` 默认 **90**（可调）
- **不要乘到 0**：`finalScore = baseScore * (0.3 + 0.7 * decay)`（老记忆最低保留 30% 权重，身份/长期偏好类不该被时间抹掉）
- "无 query 时按最新返回"的分支（`:257-259`）保持原样

### 3.6 管理面板（让用户看得见）—— 已实现

落地面（2026-09-08）：

- `apps/desktop/src/bun/memory/index.ts`：bun 侧读写 store；每次 mutation **先重读再原子写**（`.tmp` + `rename`），与插件共用同一份格式，避免并发时互相覆盖。面板搜索走"NFKC 归一化后的子串匹配"（浏览用），**排序/打分仍在插件侧**，不复制一套引擎
- `apps/desktop/src/shared/memory.ts` + `shared/rpc.ts`（契约）+ `bun/rpc/index.ts`（handler）+ `client/memory.ts`（包装）：走 vercel 那组**非 runtime 作用域**的 RPC，因为记忆是机器级存储
- `apps/desktop/src/components/settings/memory-page.tsx`：`@tanstack/react-virtual` 虚拟滚动、项目下拉筛选、行内编辑/删除、导出（写 JSON 到 store 旁 + `fsReveal` 打开）、清理归档
- **隐私**：内容默认**遮罩**，可全局"显示内容"或逐条点开；删除 / 导出 / 清归档都走 `ConfirmDialog`，导出明确告知写入的是未加密文件
- **RTL**：每条内容容器 `dir="auto"`，阿英混排由浏览器判方向
- i18n：7 棵语言树各补 `memory` 子树 + `settingsDialog.pages.memory`

- **Settings → Memory 新页**（`PAGES` 注册 + i18n en/zh，日韩等语言随 0006 补齐）：
  - 数据层：新增 `bun/memory/index.ts`（读写 `memories.jsonl` / `memories.archive.jsonl`）+ `client/memory.ts` 薄包装，照抄 `skills` 的 RPC 范式；返回 `{ total, limit, archiveCount, memories[] }`
  - 功能：搜索框、按项目（origin）筛选、列表展示 content/tags/origin/时间、单条编辑与删除、导出 JSON、清理归档
  - 展示上限进度（如 `842 / 1000`），把曾经的"静默丢弃"变成可见状态
  - **混排与 RTL**：阿拉伯语/希伯来语内容要让浏览器自己判方向（容器加 `dir="auto"`），否则阿英混排的记忆会显示错乱——与 0006 的阿拉伯语 RTL 是同一条线，可直接复用它的处理方式
- **Why not `config.schema.json`**：它只能生成表单控件（§2 现状表），渲染不了"列表 + 行内操作"
- **顺手用上 `config.schema.json` 做旋钮**（RFC 0001 §4 的插件 Settings 正是为此设计，且 `plugin-runner.ts:71` 已经把 settings 喂给了工具）：`projectBoost`、`decayHalfLifeDays`、`duplicateSimilarity`、`archiveEnabled`、`scopeDefault`。工具通过 `context.settings` 读取，UI 由 plugins 设置页自动生成——**面板负责"看得见的数据"，schema 负责"调得动的参数"**，两者职责不重叠

### 3.7 已安装插件怎么升级（必须解决，否则 PR 白修）

`seed.ts:19-30` 在插件根存在时直接 return → **已经安装过插件的老用户永远停在旧版本**。方案：

- 给每个 seeded 文件算 SHA-256，写入插件根 `<root>/.llm-space-seed.json`：`{ version, files: { path: hash } }`
- 启动时：
  - 无 marker（旧安装 / 用户自建）→ **不动**（保持现有"永不覆盖"语义）
  - marker 存在且**所有文件 hash 与 marker 一致**（说明用户没改过）→ 安全覆写为新版本
  - marker 存在但 hash 不匹配（用户改过）→ **不覆盖**，仅在应用启动日志/bun 侧记录一次提示
- `memory-plugin-files.ts` 里 `PACKAGE_JSON` 版本 `1.0.0` → `1.1.0`
- 现有测试 `seed.test.ts:56-68`（写坏 `package.json` 后不被覆盖）必须继续绿：它落在"marker 存在但 hash 不匹配"分支

## 4. 涉及文件

- `apps/desktop/src/bun/plugins/memory-plugin-files.ts`：
  - `STORE_HELPERS`：新增 `archiveFilePath()`、`archiveRecords()`、`computeFileHashes()` 等；`MemoryRecord` 加可选 `updatedAt`
  - `MEMORY_SEARCH_TS`：脚本感知分词（`[\p{L}\p{N}\p{M}]+` + 脚本分类 + `Intl.Segmenter`∪bigram + 脚本相关归一化）+ term 缓存 + 覆盖率/整词打分 + origin 加权 + 时间衰减 + `scope` 参数
  - `MEMORY_SAVE_TS`：可选 `id`（upsert）、归一化去重/近重复检测、淘汰改归档 + `context.notify` 提示
  - `PACKAGE_JSON`：`1.1.0` + 新增 `skills/memory/SKILL.md` 行为说明更新
  - 新增 `config.schema.json`：只放少量旋钮（见 §3.6）
- `apps/desktop/src/bun/plugins/seed.ts`（marker 版升级逻辑）+ `seed.test.ts`（新增：日/韩/中/阿/俄/泰/希伯来检索、bigram 召回、归档、去重、upsert、boost、衰减、升级路径）
- 新增 `apps/desktop/src/bun/memory/index.ts`、`apps/desktop/src/client/memory.ts`（面板 RPC）
- 新增 `apps/desktop/src/components/settings/memory-page.tsx`；`settings-dialog.tsx`（`PAGES`）、`i18n/messages.ts`（en/zh）
- 可选共享：`packages/core/src/server/memory-store.ts`（路径与读写 helper 单点）——需先验证插件子进程能否 import core 的**运行时**值；不行则退化为"常量来自同一份 core 文件、bun 侧与插件侧各用一份"

## 5. 风险与待定

1. **`String.raw` 源码约束**（`:6-8`）：工具代码不得出现反引号与 `${`，新写的字符串拼接一律用 `+`；正则字面量可以直接用（现状已经在用）。
2. **update 的形态要拍板**：扩展 `memory_save` vs 新增 `memory_update` 工具。倾向前者（少一个工具面），但 maintainer 可能更喜欢工具边界清晰——PR 描述里写清取舍。
3. **并发写**：面板（bun 侧）与插件工具两侧都在 read-modify-write 同一个 JSONL。原子写已有（`.tmp` + `rename`），但仍需避免"读-改-写"交叉丢失。建议：面板的**写操作**（删除/编辑/清理归档）只在非空闲时串行化，或干脆让两侧共用同一份 core helper（§4 可选共享）。
4. **阈值需要实测，不要拍脑袋**：`coverage >= 0.5`、`projectBoost = +4`、`halfLifeDays = 90`、`Jaccard >= 0.9`、衰减地板 30% 都是初值；实现时用一批中/日/韩混合样例跑一遍再定，并把默认值放进 `config.schema.json` 让用户可调。
5. **排序变化影响既有测试**：现有 `seed.test.ts` 断言"跨项目搜 'bun toolchain preference' 首条含 bun"，英文分支必须保持原样不被 gram 分支污染。
6. **归档文件的隐私与体积**：`memories.archive.jsonl` 会长存且可能含敏感内容；面板要能看到归档条数并提供清理入口，导出/删除都走显式确认。
7. **逐条 gram 化的成本**：1000 条 × 8KB 上限，逐条切 gram 的上界约 8MB 字符/次查询。先用"content 哈希 + 模块级缓存"兜住；若实测慢，再考虑把 gram 集合**落盘到索引文件**（次轮可做，本 PR 不铺）。
8. **与 0006 的耦合**：面板文案需要 ja/ko 等语言树；若 0006 未合，本 PR 先出 en/zh，日韩随 0006 补齐。
9. **`Intl.Segmenter` 必须在插件子进程里复验**：CLI（bun 1.4.2）实测可用，但插件跑在独立的 plugin-runner 子进程，ICU 数据与 `Intl` 可用性不保证一致。**必须在子进程内 `typeof Intl.Segmenter === "function"` 探测，失败则纯 bigram 兜底**（兜底路径同样要有测试）。
10. **Segmenter 的切分不保证"正确"**：实测「東京都の設定」→ `東京 / 都 / の / 設定`，「東京都」被拆开。所以才要 **bigram 并集**；别只信 ICU 的词边界。
11. **印度系脚本不要去组合记号**：实测天城体 `स्मृति` 去 `\p{M}` 后变成 `समत`（元音符号被吃掉），只做 NFKC；同理泰文的音符/声调也谨慎处理（泰文靠 bigram/Segmenter 已够用）。
12. **阿拉伯语形态**：alef 变体折叠 + 去 harakat 是必做；**轻词干化**（去 `ال` 定冠词、`و/ف/ب/ك/ل` 前缀）是可选增强，收益与误召各半，先不做，留配置项。
13. **英文精度改变会影响既有断言**：把"整词 +3 / 子串 +1"引入后，`seed.test.ts` 里"搜 bun 命中含 bun 的记录"必须仍然成立（bun 是整词，只会更强）。

## 6. 验证

- 单元测试（扩展 `apps/desktop/src/bun/plugins/seed.test.ts`）：
  - **多脚本回归（对齐 0006 的语言集合，现状全部返回 0，修复后必须能召回）**：纯假名「これを覚えて」、韩文「메모리 검색」、阿拉伯语「البحث في الذاكرة」、俄语「память поиск」、繁体/汉字「記憶檢索」
  - 顺带冒烟（**不在 0006，只留一条断言证明脚本无关分词确实生效**）：泰语「ค้นหาความจำ」与希伯来语「חיפוש זיכרון」能召回即可，不做归一化与调参
  - bigram 召回：「東京」命中「東京都の設定」（现状要求原文连续出现）
  - 阿拉伯语归一化：带 harakat 的「البَحْثُ」能召回不带符的「البحث」；alef 变体（أ/إ/آ/ٱ/ا）互相可召回
  - 英文精度：搜「art」时"整词 art"排在"started/chart"之前（现状靠 includes 全部同分）
  - 混合查询（如「bun の設定」「مemory 設定」）能同时命中两种脚本
  - 达 1000 条后 save：最旧项进入 `memories.archive.jsonl`，返回值带 `evicted`，未丢数据
  - 重复 save 相同内容：返回同一 `id`、`duplicate: true`，记录数不增长
  - 带既有 `id` save：`updated: true`、`id` 不变、`content` 已改
  - 当前 cwd 的记忆排在前面；`scope: "project"` 只返回同源记忆
  - 时间衰减：等分内容下新的排在前面，且老记忆不会被压到完全消失
  - 无 query 分支仍按最新返回；既有"跨项目能搜到"用例保持绿
  - 升级路径：marker 一致 → 被新版本覆盖；用户改过内容 → 不被覆盖
- 手动：Settings → Memory 面板浏览/筛选/编辑/删除/导出；多语言内容（含阿语 RTL 混排）实际搜一次并确认面板显示方向正确；确认 toast 提示出现且只出现一次
- **子进程复验**：在 plugin-runner 里跑一次 `typeof Intl.Segmenter`，确认 §3.1 第三步的主路径可用、且兜底路径被测试覆盖

## 7. 工作量

中-大（3.5-5.5 天）。构成：检索修复（脚本感知分词 + Segmenter/bigram + 打分）1.5-2 天、存储治理（归档/去重/upsert/衰减/加权）1.5-2 天、管理面板 0.5-1 天、升级 marker 机制 + 测试 0.5 天。**无新第三方依赖**（纯 Node/Bun 内置 `Intl` 与正则）。建议与 0006 一起提交，PR 描述里把"日韩/阿拉伯 UI 上线但检索搜不到"的现状说清楚，降低 maintainer 评估成本。
