# PR 计划 0004：完全访问模式（Full access）
> 状态：**已实现（2026-09-08 核对）**：`stores/run-mode.ts` + experimental 页开关 + 显式确认对话框；测试 `thread-store-full-access.test.ts` 通过。改动在工作树，未提交。

> 状态：计划（未写代码）
> 性质：安全相关改动 —— 默认关闭、显式确认、只影响本机。PR 描述需特别谨慎。

## 1. 背景与目标

现状：开启 ReAct loop / Auto-run tools 后，仍然有一批命令被判定为"危险"而**暂停自动执行**，需要用户手动点。对把 agent 当日常工具、明确知道自己在本机跑什么的用户来说，这层拦截在反复打断流程。

**目标**：提供 opt-in 的「完全访问模式」——开启后所有工具（含被判定为危险的命令）都自动执行；首次开启必须弹窗明确告知风险与免责。

## 2. 现状（代码事实）

| 关注点 | 位置 | 现状 |
| --- | --- | --- |
| 自动运行开关 | `packages/ui/src/components/thread-playground/stores/run-mode.ts` | `LOCAL_STORAGE_KEYS.autoRunTools`（`local-storage.ts:13`）；`getEffectiveAutoRunTools() = getReactLoop() \|\| getAutoRunTools()`（60-62） |
| 危险命令判定 | `packages/core/src/types/tools/index.ts` | `isDangerousBashCommand()`（311），基于 `DANGEROUS_BASH_PATTERNS`（292-303） |
| 判定规则全集 | 同上 | `rm `、`mkfs`、`dd ... of=`、fork bomb、`shutdown\|reboot\|halt\|poweroff`、`chmod -R`、`chown -R`、`> /dev/(sd\|nvme\|disk)`、`sudo`、`curl\|wget ... \| sh\|bash\|zsh` |
| **硬拦截点** | `stores/thread-store.ts` 576-593 | bash + `isDangerousBashCommand(command)` → `toast.warning("Auto-run paused for a risky command")` + `return null` |
| 其他受限工具 | `misc.ts` 189 | `terminate` 等通过工具自带的 "Never auto-executed" 属性控制 |
| 运行时层 | `packages/runtime`、`core/generator` | 未发现任何工具批准/危险门控 → **拦截只在 UI 层** |
| 确认弹窗 | `packages/ui/src/components/confirm-dialog.tsx` 17 | 现成 `ConfirmDialog`（title/description/confirmLabel/onConfirm） |
| 开关 + 确认范例 | `apps/desktop/src/components/settings/experimental-page.tsx` | `SettingsToggleRow`（36-41）+ 首次开启弹 `ConfirmDialog`（54-71） |

**关键结论**：拦截是 UI 层单点（`thread-store.ts` 576-593），运行时层无二次拦截 → 改动面很小，不需要碰 agent 运行时。

## 3. 设计方案

### 3.1 开关

- 新增 localStorage 键（建议 `llm-space-full-access`），仿 `run-mode.ts` 写 get/set（含 `useSyncExternalStore` 订阅）
- 入口：Experimental 设置页 `SettingsToggleRow`，位于 auto-run 相关开关附近
- **默认关闭**

### 3.2 首次开启的风险确认

复用 `ConfirmDialog`，首次开启时弹出，文案要点：

- 该模式下 agent 将**不经确认执行任何工具**，包括删除文件、格式化磁盘、sudo、执行远程脚本等不可逆操作
- 这些操作由模型决定，可能出错，**造成的任何数据丢失或系统损坏由用户自行承担**
- 建议仅在可支配的环境（本机开发机 / 虚拟机 / 容器）中开启
- 可随时在设置中关闭

确认后写入 `fullAccessAcknowledged`（localStorage），避免重复弹窗；**每次重新安装/清数据后重新确认**。

### 3.3 拦截逻辑改动

```ts
// thread-store.ts 576 附近
if (
  !getFullAccessMode() &&                       // ← 新增
  tool.type === "builtin" &&
  tool.name === "bash" &&
  isDangerousBashCommand(command)
) {
  toast.warning(...);
  return null;
}
```

即：完全访问模式下跳过危险命令暂停，其余逻辑不变。

### 3.4 视觉提示（重要）

开启时必须有持久的醒目提示，避免用户忘记自己开过：

- 工具栏/输入框附近显示一个「完全访问」徽章（警示色）
- 建议：每次运行开始时若该模式开启，toast 提示一次（可关）

### 3.5 文案与 i18n

`apps/desktop/src/i18n/messages.ts` en/zh 双树新增：开关标题、说明、确认弹窗正文、徽章文案。

## 4. 涉及文件

- `packages/ui/src/lib/local-storage.ts`（新键）
- `packages/ui/src/components/thread-playground/stores/run-mode.ts`（get/set 与订阅）
- `packages/ui/src/components/thread-playground/stores/thread-store.ts`（拦截处加判断，约 3 行）
- `packages/ui/src/components/thread-playground/thread-playground.tsx`（徽章）
- `apps/desktop/src/components/settings/experimental-page.tsx`（开关 + 确认弹窗）
- `apps/desktop/src/i18n/messages.ts`
- 新增/更新测试：`run-mode` 相关测试；thread-store 在两种模式下对危险命令的行为

## 5. 风险与待定

1. **maintainer 可能抵触**：这是主动降低安全护栏的改动。降低阻力的要点——默认关闭、只影响本机、显式免责确认、持久徽章、不触碰运行时层、可随时关闭。若 maintainer 认为不可接受，可退一步做成「危险命令二次确认的开关」而非「完全跳过」。
2. **只覆盖 bash 危险命令拦截**：`terminate` 这类靠工具属性（"Never auto-executed"）限制的，**本 PR 是否也放开？** 建议**不放开**——它们是运行控制类工具，放开没有收益。需在 PR 描述中说明边界。
3. **范围界定**：只跳过"危险暂停"，不改变 auto-run 本身的语义；未开启 auto-run 时完全访问模式不产生额外效果（需明确，避免误解）。
4. **免责声明措辞**：涉及责任声明的文案建议请 maintainer 定稿，不要自己拍板法律措辞。

## 6. 验证

- 单元测试：`getFullAccessMode` 默认 false；危险命令在关闭时暂停、开启时执行。
- 手动：开启弹窗（只弹一次）、徽章显示、执行一条 `rm -rf /tmp/xxx` 类命令验证自动执行、关闭后恢复拦截。

## 7. 工作量

小-中（1-2 天）。代码改动量很小（核心 3 行 + 开关 + 弹窗），主要成本在文案、讨论与 maintainer 沟通。
