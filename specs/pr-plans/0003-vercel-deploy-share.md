# PR 计划 0003：把生成的前端产物一键部署到 Vercel 并分享链接
> 状态：**已实现（2026-09-08 核对）**：`bun/vercel/`（client + token-store 0600 + preflight）、`bun/rpc/deploy-vercel.ts`、`deploy-vercel-dialog.tsx`、`client/vercel.ts` 等 55 个新文件中约 12 个属于本 PR；测试 `vercel-client.test.ts`、`vercel-token-store.test.ts`（18 用例）通过。改动在工作树，未提交。

> 状态：计划（未写代码）
> 无新增依赖：Vercel REST API 用原生 `fetch` 调用即可。

## 1. 背景与目标

现状：codegen 能把 thread 导出成可运行项目，但产物只落在本地磁盘（`~/Desktop` 默认目录），成功页只提供「打开文件夹 / 开终端跑命令」，**没有预览、没有部署、没有分享**。想给别人看一个生成的前端页面，目前只能自己想办法。

**目标**：生成产物后一键部署到 Vercel，拿到一个公开 URL 直接分享。

### 1.1 为什么不能复用现有 thread 分享

现有分享走 **GitHub Gist**（`packages/core/src/storage/gist/`）：`POST /gists` 存的是 thread JSON，viewer（`apps/web/src/thread-viewer.tsx`）用 `ThreadZodSchema` 严格校验后交给 `ThreadPlayground` 渲染。**它是结构化数据通道，不是静态文件托管**：HTML 塞进去会被 schema 拒绝，即使绕过，viewer 也不会渲染。Gist raw 还是 `text/plain`，浏览器不渲染 HTML。

→ 需要独立的一条部署通道。

## 2. 现状（代码事实）

| 关注点 | 位置 | 现状 |
| --- | --- | --- |
| 产物生成 | `packages/ui/src/components/thread-playground/codegen/generate-project-button.tsx` | 当前导出 LangGraph/Python 项目（77）；产物写本地磁盘，走 `generatorWriteFile` RPC（`rpc.ts` 508-511）；默认父目录 `~/Desktop`（80） |
| 产物出口 | 同上 `SuccessStep`（1296-1413） | 只有「Open Folder」（`fsReveal` 393-405）、开终端（519）、复制命令 |
| 外部请求 | 全部走 **bun 主进程** | 分享：`shareThread` RPC（419-427）→ `share-thread.ts` → `gist-api.ts` 的 fetch（76-96）；Firecrawl 同样在 bun 侧 |
| 凭据存储 | bun 侧文件 | GitHub token：`settings/auth.json`（0600，`github-auth-manager.ts` 200-206），token 永不出 bun；模型/搜索 key：`ModelManager` 用 `getSettingsDir` + `atomicWriteJsonFileSync` |

**关键约束**：出网请求和凭据都在 bun 主进程，渲染进程只通过 RPC 拿结果。Vercel 集成必须遵守同一条规则。

## 3. 设计方案

### 3.1 凭据

- bun 侧新增 `settings/vercel.json`（权限 0600），复用 `atomicWriteJsonFileSync` / `getSettingsDir`——与 `auth.json`、`ModelManager` 的模式完全一致
- RPC：`setVercelToken` / `getVercelStatus`；**渲染进程只拿到「是否已配置」的布尔值，拿不到 token 本身**

### 3.2 部署流程（bun 侧）

1. 收集产物文件：遍历生成目录，取静态资源（`.html` / `.css` / `.js` / 图片等），排除 `node_modules`、`.git`、超大文件
2. `POST https://api.vercel.com/v13/deployments`
   - `Authorization: Bearer <token>`
   - body 形如 `{ name, files: [{ file: "index.html", data: "<内容>" }], projectSettings: { framework: null } }`
3. 轮询部署状态直到 `ready`（或失败/超时），返回 `url`
4. 结果通过 RPC 回传渲染进程

无需 SDK，原生 `fetch` 足够。

### 3.3 UI

- codegen 成功页新增「Deploy to Vercel」按钮（未配置 token 时引导去设置页）
- 设置页（Search / Account 视归类而定）新增 Vercel token 输入 + 「已配置 / 未配置」状态，复用现有 `ApiKeyField` 风格
- 部署中显示进度，完成后给出可复制的 URL
- i18n：en/zh 双树新增文案

## 4. 涉及文件

- `apps/desktop/src/bun/` 新增 `vercel/vercel-client.ts` + `vercel/vercel-token-store.ts`
- `apps/desktop/src/bun/rpc.ts` 新增 handler（`setVercelToken` / `getVercelStatus` / `deployToVercel`）
- `apps/desktop/src/client/` 新增对应渲染侧调用封装
- `packages/ui/src/components/thread-playground/codegen/generate-project-button.tsx`（按钮 + 进度 + 结果）
- `apps/desktop/src/components/settings/`（token 输入页）
- `apps/desktop/src/i18n/messages.ts`
- 新增测试：`apps/desktop/src/bun/vercel/vercel-client.test.ts`（mock fetch：成功 / 401 / 超时 / 大文件拒绝）

## 5. 风险与待定

1. **产物是公开 URL**：Vercel 部署默认公开可访问。必须在 UI 上明确提示「将公开到互联网」，避免用户把含密钥/隐私的产物传上去。
2. **token 权限**：建议文档里引导用户创建受限 scope 的 token；不要复用全权限 token。
3. **体积与时间**：Vercel 对单次部署有文件数与体积限制 → 部署前检查并给出清晰报错（哪些文件被排除、总体积）。
4. **产物类型**：当前 codegen 只导出 LangGraph/Python，不是前端项目。**本 PR 是否要同时支持导出静态前端项目？** 若只做部署按钮，而产物是 Python 后端，按钮就没有意义。
   → **待定**：建议先明确"前端产物"从哪来（codegen 新增静态 HTML 导出？还是用户工作区里已有的 HTML 文件？后者更通用：右键任意 HTML/文件夹 → Deploy）。
5. **maintainer 接受度**：引入第三方商业平台依赖是有争议的方向。建议 PR 描述里把接口抽象成「部署目标」，Vercel 只是第一个实现，后续可加 Netlify / Cloudflare Pages。

## 6. 验证

- 单元测试：token 存储（权限、读写）、部署请求构造、状态轮询、错误处理（401/网络/超时）。
- 手动：真实 token 部署一个静态 HTML，拿到 URL 能打开；未配置 token 时的引导；失败提示。

## 7. 工作量

中（3-4 天），其中大半在凭据/错误处理/UI 状态机；API 本身不复杂。**无新增依赖**。
