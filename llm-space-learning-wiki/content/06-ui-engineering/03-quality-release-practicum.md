# 测试、发布与毕业开发任务

## 1. 质量门禁

一次完整验证：

```bash
mise run test
mise run lint
mise run typecheck
mise run build:web
```

桌面相关改动还应执行 Renderer build；发布前 Lint 必须零 warning。

## 2. 测试策略

### 纯领域逻辑

使用小型单测覆盖 schema、normalizer、reducer、模板和历史不变量。

### Manager/Registry

用临时目录与 fake dependency 覆盖配置损坏、冲突、缓存失效和 shutdown。

### 跨边界协议

覆盖 request/response shape、错误 envelope、事件顺序、Abort、版本不兼容。

### React

关注用户可观察行为、Store 生命周期、竞态与 Runtime ownership，不对实现细节做脆弱 snapshot。

### 构建

Web/Electrobun bundling 问题可能不被 TypeScript 发现，因此 CI 必须实际生产构建。

## 3. 发布链

版本唯一来源是 `apps/desktop/package.json`。

```text
mise run release
→ 检查 main/clean/sync
→ conventional version + tag
→ 原子 push
→ release workflow
→ arm64/x64 × regular/performance
→ 签名、公证、smoke
→ rolling update feed + versioned release
```

稳定版需要手工维护 `CHANGELOG.md` 对应版本。Rolling `updates` release 的 patch 文件不能删除，旧客户端可能依赖增量升级链。

## 4. 两个桌面版本

- Regular 使用系统 WebView，体积小。
- Performance 内嵌 CEF，渲染一致。

二者不同 bundle ID 与 update feed，但共享 `~/.llm-space`。x64 签名前有 headerpad 修复 Hook；不要在未验证 Mach-O 的情况下扩大扫描范围。

## 5. 一次合格改动的流程

1. 从用户行为写出验收标准。
2. 找到边界类型和组合根。
3. 先补最靠近不变量的测试。
4. 做最小实现，不跨层偷依赖。
5. 运行 focused tests。
6. 运行 typecheck/lint/build。
7. 用真实桌面 Renderer 验证。
8. 更新用户文档、AGENTS/RFC/CHANGELOG 中受影响事实。

## 6. 毕业任务：新增 Runtime Scoped 工具能力

建议实现一个只读的“项目信息” Built-in Tool：

1. 在 Runtime Tool Module 定义 schema 与 handler。
2. 通过 ToolRegistry 注册并测试重复名/freeze。
3. 在 Host Tool 列表中可导入 Thread。
4. 执行路径携带 runtimeId。
5. 本地返回本机信息，Remote 返回远端信息。
6. Tool Call Output 可持久化、回放和分享。
7. 添加权限/错误/超长输出处理。
8. 补 Registry、RPC、Remote contract 与 UI 测试。

这个任务会迫使你贯穿 Core Tool 类型、Runtime Registry、Desktop RPC、HostServices、Thread Store、Remote Server 与 UI。

## 7. 备选毕业任务

- 新增一个 Parser，并导入第三方对话格式。
- 新增一个只读 Thread Storage Connector。
- 新增一个 Trace 导入来源。
- 为现有 Runtime capability 增加 Remote 支持。

## 8. 最终掌握检查表

- 能从 `startDesktopApp()` 解释完整对象图和关闭顺序。
- 能从 Run 按钮追到 Provider Event 再返回 React。
- 能解释 Thread JSON 的兼容、恢复、图片与原子写入。
- 能区分五类工具的执行所有权。
- 能新增 Runtime 方法并同步协议。
- 能定位 Remote 连接每个阶段。
- 能在共享 UI 中不引入 Electrobun。
- 能选择正确测试层并完成发布前门禁。

达到这些标准后，你已经具备独立开发 LLM Space 主流程功能的能力。
