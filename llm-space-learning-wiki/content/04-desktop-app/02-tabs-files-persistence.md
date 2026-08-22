# Thread Tabs、文件树与持久化

## 1. Tab 身份

Thread Tab 包含 `path + runtimeId + paneId`：

- path 是资源位置，可因重命名改变。
- runtimeId 防止本地与远程同路径冲突。
- paneId 是稳定编辑器实例身份，重命名后不变。

Trace Tab 使用 projectId + traceKey + runtimeId。标签页列表和 active ID 存在 Renderer localStorage，恢复时验证 Runtime 与文件是否仍存在。

## 2. 每 Tab 一个 Store

`ThreadTabPane` 为每个打开 Thread 创建独立 Zustand vanilla store。Inactive Pane 只隐藏不卸载，因此：

- Undo/Redo 保留。
- 编辑状态和选择保留。
- 流式运行不会因切换标签中断。

代价是更多常驻内存，因此历史和图片有预算限制。

## 3. React Query 与 Store 的分工

- React Query 负责按 `["thread", runtimeId, path]` 加载服务端/磁盘资源。
- Zustand 负责当前编辑与运行中的高频状态。
- 持久化组件监听 Store 变化并写回 Query 对应的资源。

不要把每个 streaming token 放 React Query cache，也不要让全局 Zustand 管所有标签。

## 4. SerializedPersistence

编辑后 500ms debounce 并不等于并发安全。SerializedPersistence 保证：

- 写入按顺序执行。
- 新状态不会被旧的慢写覆盖。
- 失败可以重试。
- `flush()` 等待当前和排队写入，是文件操作前的持久化屏障。

重命名、移动、关闭和切换 Runtime 前必须先 flush。

## 5. RuntimeRunTracker

Tracker 维护运行、保存、路径和 Runtime 租约，阻止：

- 运行中关闭/刷新 Pane。
- 保存中删除或覆盖文件。
- 运行中切断 Remote Runtime。
- 对重叠路径执行冲突的移动/删除。

这是跨组件一致性层，不只是“显示 loading”。

## 6. 文件树

文件树映射 workspace：

- 新建 Thread/文件夹。
- 重命名、复制、移动、删除。
- 展开祖先并定位 Deep Link 导入项。
- 拖放前用 file mutation guard 检查路径关系和 active leases。

本地删除注入 OS Trash；远程删除是 server 文件系统语义。UI 文案不能假设二者完全相同。

## 7. 标题与文件名

Thread 标题来源与文件名需要同步。重命名路径后，Pane 更新 tab path 并保留 paneId；写入 Thread 时存储层也会规范化 title。处理这类双向关系时必须防止 watch 循环。

## 8. 导入

外部文件经 Parser Registry 转换成一个或多个 Thread，生成不冲突文件名，写入选定 Runtime 的 workspace，然后打开。剪贴板导入也是虚拟文件，复用相同解析流程。

## 9. 实践

1. 打开两个同路径但不同 Runtime 的 Thread，验证 ID 不冲突。
2. 在保存延迟期间重命名文件，解释没有 flush 会发生什么。
3. 为移动目录构造“目标在源目录内部”的非法案例。
4. 运行中切换标签，验证 Pane 没有卸载。
5. 阅读 `serialized-persistence.test.ts` 和 `runtime-run-tracker` 相关测试。
