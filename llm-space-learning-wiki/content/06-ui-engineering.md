# 第六章：共享 UI、Web 与工程实践

最后一章把共享 React UI、Web Viewer、测试、构建、发布和扩展开发放在一起。目标不是记住脚本，而是能独立完成一次从需求到发布的改动。

## 子课程

- [共享 UI、Host 抽象与状态管理](06-ui-engineering/01-shared-ui-host-state.md)
- [Web Viewer、分享与静态站点](06-ui-engineering/02-web-sharing.md)
- [测试、发布与毕业开发任务](06-ui-engineering/03-quality-release-practicum.md)

## 贯穿原则

- 共享 UI 不知道 Electrobun。
- 每个 Thread 有独立 Store。
- Web Viewer 用同一 Thread Playground，但注入只读 Host。
- 测试范围随边界风险扩大。
- 发布版本以 Desktop package 为唯一来源。
- 任何跨 Runtime、跨进程或跨持久化边界的改动都要验证失败路径。
