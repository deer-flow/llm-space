[English](./sharing.md) | 中文

---

# 分享 Thread

Sharing 会发布一个只读的 Thread 副本，其他人可以在浏览器或 LLM Space 中打开。源 Thread 仍保留在原工作区中，不会被修改。

## 使用条件

- 桌面应用需要能够访问 GitHub。
- 发布前必须登录 GitHub。如果尚未登录，Sharing 流程会先请求确认，然后启动 GitHub Device Flow。
- 如果 Thread 属于远端 Runtime，该 Runtime 必须处于已连接状态。

## 如何分享

1. 打开需要分享的 Thread。
2. 点击 Thread 顶部的 **More Actions**（`...`）。
3. 选择 **Share Thread**。
4. 检查或修改标题，并按需填写描述。这些内容只影响分享副本。
5. 点击 **Generate link**。如果出现提示，请完成 GitHub 登录；登录成功后发布会自动继续。
6. 复制生成的链接，或直接在浏览器中打开。

每次发布都会创建一个新的分享链接。关闭对话框或发布失败都不会修改本地 Thread。

## 查看者能看到什么

分享链接会打开 LLM Space 的静态 Web Viewer，以只读方式展示完整的分享 Thread，包括 prompts、messages、tool calls 以及其他已持久化的 Thread 数据。查看者不需要 GitHub 账号。页面还提供 **Open in LLM Space**；如果已安装桌面应用，可以通过 deep link 在应用中打开同一个分享 Thread。

发布前，LLM Space 会解析 Thread 实际使用的模型，并把模型显示名称写入分享副本。这样 Web Viewer 即使无法访问发布者本地的 provider 设置，也能展示正确的模型信息。

## 隐私与 GitHub Gist

分享的 Thread 会保存为 **Secret GitHub Gist**。Secret Gist 不会被公开索引，也不会出现在公共搜索中，但它并不是私有内容：任何拿到 URL 的人都可以阅读和转发。

分享前请检查 Thread。不要发布 API Key、账号凭证、私有源代码、个人信息或其他敏感内容。标题和描述也会发送到 GitHub。若要撤销访问，需要从自己的 GitHub 账号中删除对应 Gist；已经被复制或下载的内容无法追回。

## 实现方式

- 桌面端从 Thread 所属的 Runtime 中读取文件，因此本地和远端 Thread 的归属关系都会被正确保留。
- 分享副本会写入可选标题和已解析的模型元数据，但不会修改源文件。
- `GistThreadWriter` 通过 GitHub API 创建 Secret Gist。
- 返回的浏览器地址指向静态 LLM Space Viewer 的 `#/shared/gist/threads/<gistId>` 路由。
- Web Viewer 使用 `GistThreadReader` 读取数据，并以 presentational、只读模式渲染。

相关实现位于 `apps/desktop/src/components/share-thread-dialog.tsx`、`apps/desktop/src/bun/rpc/share-thread.ts` 和 `packages/core/src/storage/gist/`。

## 常见问题

- **登录无法完成：** 取消并重新发起 GitHub Device Flow，同时确认配置的代理能够访问 GitHub。
- **Runtime 未连接：** 先重新连接拥有该 Thread 的 Runtime，再尝试分享。
- **剪贴板不可用：** 手动选中并复制界面中显示的 URL。
- **需要让链接失效：** 从 GitHub 中删除对应的 Secret Gist。
