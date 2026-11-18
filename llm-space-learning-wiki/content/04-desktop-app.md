# 第四章：Electrobun 桌面应用

桌面应用同时运行两个 JavaScript 世界：

- Bun 主进程拥有窗口、文件系统、网络、子进程、认证、更新与 Runtime。
- WebView/CEF Renderer 运行 React，拥有页面、标签页和交互状态。

二者通过单一 typed Electrobun RPC contract 通信。理解这条边界后，`apps/desktop` 的大体量代码会变得可分解。

## 子课程

- [启动、RPC 与 Command Bus](04-desktop-app/01-bootstrap-rpc-commands.md)
- [Thread Tabs、文件树与持久化](04-desktop-app/02-tabs-files-persistence.md)
- [Host Services、设置与生命周期](04-desktop-app/03-host-settings-lifecycle.md)

## 总体路径

```text
bun/index.ts
→ startDesktopApp()
→ managers / runtime / rpc / window
→ mainview/main.tsx
→ app/layout.tsx providers
→ app/page.tsx
→ file tree + tabs + shared ThreadPlayground
```

先阅读组合根与 RPC contract，再阅读具体设置页面。不要从 1500 行 React 页面开始猜系统。
