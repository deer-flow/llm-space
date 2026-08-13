# Web Viewer、分享与静态站点

## 1. 一个 Vite 应用，两类页面

`apps/web` 同时包含：

- Landing：产品介绍与下载。
- Shared Thread Viewer：只读展示 Gist 等连接器中的 Thread。

Provider 树复用 Theme、ModelProvider、HostServices、Tooltip 与 I18n。

## 2. 为什么使用 HashRouter

GitHub Pages 对任意深层 URL 不提供 SPA server fallback。Hash 部分不发送给服务器，因此：

```text
/llm-space/#/shared/gist/threads/<id>
```

HTTP 始终请求存在的 `/llm-space/`，React 再解析 hash。

## 3. Viewer 数据链

```text
route connectorId/threadId
→ CONNECTORS 查找实现
→ readShared() 或 readLatestThread()
→ { thread, meta }
→ ThreadPlayground readonly
```

`ThreadConnector` 抽象资源来源。Gist Reader 返回作者、描述、文件名、raw URL 等 metadata。

## 4. Presentational Host

Viewer 使用：

- `presentational: true`
- 无 Transport
- 无 Tool execution
- 空 ModelClient
- 无文件和 Generator
- `openLink` 仍可安全打开外链

ThreadPlayground 因此只展示保存证据，不尝试重新运行。

## 5. Embedded 与 Fullscreen

Hash query 的 `?embedded` 或窄 viewport 进入 chrome-free 模式，适合 iframe。Embedded 决策在打开时固定，避免加载后随 resize 反复闪动图片和布局。

## 6. Open in App

Web 构造：

```text
llm-space://shared/<connectorId>/threads/<threadId>
```

尝试交给桌面应用；超时则回 Landing 下载页。桌面 Deep Link Handler 读取连接器、写入本地 workspace 并打开。

## 7. Landing

Landing 自带 i18n 和发布下载逻辑。`useReleases` 先展示内置 fallback，再请求 GitHub Releases，网络失败或 rate limit 时仍可下载。部署 base 是 `/llm-space/`，公共资源路径应使用 `import.meta.env.BASE_URL`。

## 8. GitHub Pages 发布

`.github/workflows/pages.yml` 在 main push 后：

1. 安装锁定依赖。
2. build web。
3. upload `apps/web/dist`。
4. deploy-pages。

CI 也 build web，防止合并后才发现 Vite 问题。

## 9. 安全

- 外链使用 `noopener,noreferrer`。
- Viewer 不注入本地文件能力。
- Gist 网络错误与“资源不存在”分开展示。
- Thread 内容按应用现有 Markdown/代码渲染安全策略处理。

## 10. 实践

1. 本地运行 Viewer，测试正常、rate limit 与不存在三种状态。
2. 验证直接刷新 hash deep link 返回 HTTP 200。
3. 新增静态图片并验证 `/llm-space/` base path。
4. 从 Web 点击 Open in App，跟踪到桌面 workspace 文件。
