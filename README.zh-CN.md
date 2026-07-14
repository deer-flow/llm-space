[English](./README.md) | 中文

---

# LLM Space 4

![screenshot](https://github.com/user-attachments/assets/7fe0a937-a7fa-4a3c-9417-34ee5a35b19d)

[**LLM Space** v4](https://github.com/deer-flow/llm-space) 是一款为 Agent 开发者打造的桌面应用。你可以在一个地方原型验证新的 Agent 想法，观察 harness 执行的每一步，调试失败原因，并评估性能表现。

LLM Space 是 [DeerFlow](https://github.com/bytedance/deer-flow) 的姊妹项目，DeerFlow 团队也一直在重度使用它：DeerFlow 的每个版本都会用 LLM Space 来构建和调试。这个项目始于 2023 年 3 月，v4 是它的第四次大版本迭代。

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [安装](#安装)
- [运行应用](#运行应用)
- [用户指南](#用户指南)
- [参与贡献](#参与贡献)
- [赞助商](#赞助商)
- [捐助](#捐助)
- [许可证](#许可证)

## 功能特性

- **构建**：编写并版本化你的 prompts、system messages、tools 和 model settings。
- **追踪**：实时查看 agent loop 中的每一次模型调用和工具运行。
- **调试**：从运行历史中回放一次执行，并逐步排查问题。
- **评估**：跨多次运行衡量你的 Agent 表现。
- **管理**：把 threads 作为本机文件组织和管理。

你的文件和 API keys 都保存在本机。LLM Space 会收集少量匿名使用数据来改进应用；具体收集内容和退出方式见 [TELEMETRY.md](./TELEMETRY.md)。

## 技术栈

- **语言与工具链**：TypeScript，使用 [Bun](https://bun.com) 构建和管理。
- **桌面壳**：[Electrobun](https://electrobun.dev)，一种轻量的原生应用交付方式。
- **UI**：React、Tailwind CSS 和 shadcn/ui。
- **Agent 框架**：[Pi Agent Core](https://github.com/earendil-works/pi)，一个用于构建 Agent 的轻量框架。

## 项目结构

LLM Space 是一个 Bun monorepo：

```text
packages/
  core/       # 共享逻辑：类型、agent loop、thread storage
apps/
  desktop/    # 桌面应用：Electrobun shell + React UI
```

## 安装

你需要先安装 [Bun](https://bun.com)。Bun 是一个快速、一体化的 JavaScript runtime 和 package manager，可以理解为 Node.js 和 npm 的替代方案。请参考 [官方安装指南](https://bun.com/docs/installation)。

Bun 准备好后，在仓库根目录安装依赖：

```bash
bun install
```

如果要参与开发、或想使用与 CI 完全一致的工具链：安装 [mise](https://mise.jdx.dev) 后运行 `mise run setup`，它会一步装好锁定版本的 Bun（来自 `mise.lock`）和 JS 依赖。

## 运行应用

启动本地开发版桌面应用：

```bash
mise run dev
```

构建 canary 版本：

```bash
mise run build:canary
```

## 用户指南

中文用户指南在这个仓库中：

- [快速开始](./docs/get-started.zh-CN.md)
- [用户手册](./docs/index.zh-CN.md)
- [核心概念](./docs/core-concepts.zh-CN.md)

## 参与贡献

目前我们只合并来自 [DeerFlow](https://github.com/bytedance/deer-flow) 核心团队成员的 Pull Request。

其他朋友也非常欢迎通过 [提交 issue](https://github.com/deer-flow/llm-space/issues) 来帮助项目成长。Bug report、想法和反馈都会让项目变得更好。

## 赞助商

LLM Space 是免费开源项目，并且依靠赞助保持持续发展。我们很荣幸，也非常感谢赞助商的支持。

### 🏆 白金赞助商

<p align="center">
  <a href="https://superdesign.dev" target="_blank" rel="noopener">
    <img src="./docs/images/sponsor-superdesign.svg" alt="Superdesign - AI product design agent that turns prompts into designs on an infinite canvas (Platinum Sponsor)" width="600" />
  </a>
</p>

<p align="center">
  <strong><a href="https://superdesign.dev">Superdesign</a></strong> 是一款 AI 产品设计 Agent，可以把自然语言 prompt 转换成 UI mockup、组件和完整设计，并呈现在无限画布上。感谢它让 LLM Space 成为可能。💜
</p>

想在这里看到你的 logo？欢迎联系我们：[提交 issue](https://github.com/deer-flow/llm-space/issues) 或 [支持这个项目](#捐助)。

## 捐助

如果 LLM Space 对你有帮助，并且你愿意支持它的开发，可以在这里捐助：

**[支持 LLM Space →](https://my.feishu.cn/wiki/OvLBwVuSkiCR1ik5wGEcBXZfnye)**

感谢支持。

## 许可证

LLM Space 基于 [MIT License](LICENSE) 发布。
