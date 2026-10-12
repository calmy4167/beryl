# Calmy 主入口桌面实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Follow the task order and preserve unrelated working-tree changes.

**Goal:** 将参考页的快速记录桌面设为登录并解锁 Vault 后的系统主入口，复用 Calmy 模块导航与现有 Capture/Action 数据。

**Architecture:** 在 Vue Router 的 app 壳中注册 `/app/desk`，并将根入口、`/app` 默认页和 Vault 完成后的落点指向它。桌面 UI 通过 Capture/Action 应用用例读写领域数据；桌面命令记录为撤销与重试提供幂等边界。外观偏好放在独立的本机设置模块。

**Tech Stack:** Vue 3、TypeScript、Vue Router 4、现有异步 Capture/Action repositories、浏览器本机偏好存储。

**Spec:** `docs/superpowers/specs/2026-10-05-calmy-desktop-entry-design.md`

## 全局约束

- `/app/desk` 必须复用 `LiubaiShell` 的路由、模块注册和管理器；默认空白输入画布，模块导航仅在侧边缘悬停或快捷键时展开。
- 桌面模块导航展开后保持固定，直到点击 × 或再次按快捷键关闭；不得让 shell 现有的 1.8 秒自动收起覆盖该行为。此导航状态仅对 `/app/desk` 生效，不改变其他模块的导航体验。
- 首页首次进入时模块导航收起；导航展开采用侧边抽屉，不覆盖系统 shell 的全局设置、弹层与页面区域。
- 登录、Vault 解锁和首次改密流程保持现有安全边界；桌面路由检查 `hasUnlockedVault` 后才读取业务数据。
- Capture 和 Action 继续使用现有领域仓库；不迁入参考页的 `pms.entries.v1` 业务存储。
- 外观偏好使用独立的本机存储，不混入业务实体，也不承诺跨设备同步。
- 保留用户现有的未提交修改；不得提交或推送，除非用户明确授权。
- 除非用户之后明确要求验证，否则不添加或运行测试；实施后说明验证限制，不声称未运行的检查已通过。

---

## 文件职责图

| 文件 | 职责 |
|---|---|
| `src/router/route-manifest.ts` | 将桌面注册为 app 页面和可勾选模块，并让 `/app` 默认去桌面。 |
| `src/router/index.ts` | 加载桌面页面、根入口与旧 `/desk` 兼容跳转、检查桌面的登录/Vault 状态。 |
| `src/vue/pages/VaultPage.vue` | 已解锁、完成初始化和恢复后统一进入 `/app/desk`。 |
| `src/vue/pages/DeskPage.vue` | 空白输入画布、Capture 录入、提示状态和 shell 内布局。 |
| `src/vue/shell/LiubaiShell.vue` | 只在 `/app/desk` 上处理边缘/快捷键打开和显式关闭的导航状态，同时保留原有模块管理器。 |
| `src/styles/liubai/liubai-v11.css`, `src/styles/liubai/liubai-app.css` | 桌面画布与导航抽屉在默认/展开/窄屏状态的布局；其他路由样式不变。 |
| `src/vue/pages/desk/DeskComposer.vue` | 多行输入、提交和 Enter/Alt+Enter 行为。 |
| `src/vue/pages/desk/DeskCaptureHistory.vue` | 最近 Capture 回看列表和跳转操作。 |
| `src/vue/pages/desk/DeskAppearancePanel.vue` | 桌面外观设置 UI。 |
| `src/vue/pages/desk/preferences.ts` | 默认值、验证、读取、保存和重置本机桌面偏好。 |
| `src/application/use-cases/desktop-entry.ts` | 桌面 Capture、转任务与撤销的幂等编排接口。 |
| `src/application/use-cases/capture-text.ts` | 保持既有调用兼容，增加可选稳定 Capture id 以便桌面命令安全重试。 |
| `src/application/use-cases/decide-capture.ts` | 暴露 Capture 决策关联查询，让历史可显示已有目标。 |
| `src/domain/capture/repository.ts` | 为桌面命令提供可安全重试的创建和恢复待处理状态能力。 |
| `src/domain/action/model.ts`, `src/domain/action/repository.ts` | 校验和记录由桌面命令创建的 Action 补偿/移除。 |
| `src/application/use-cases/index.ts`, `src/application/index.ts` | 导出桌面用例及其类型。 |

## 任务

### 任务 1：把桌面接入 app 路由与模块导航

**文件：**

- 修改：`src/router/route-manifest.ts`
- 修改：`src/router/index.ts`
- 修改：`src/vue/pages/VaultPage.vue`
- 修改：`src/vue/pages/DeskPage.vue`

**接口：**

- 产出路由 `/app/desk`，页面 id 为 `desk`，导航标签为“桌面”，进入现有 `LiubaiShell`、边缘导航抽屉和模块管理器。
- 兼容旧 `/desk`，它只跳转到 `/app/desk`，不再注册同名路由。
- 桌面路由只有有效会话且 `hasUnlockedVault(session.user.id)` 为真时才继续；分别将未登录、需首次改密和 Vault 未解锁用户导向 `/login`、`/pass`、`/vault`。
- `/` 和 `/app` 的默认落点、Vault 已解锁检查、初始化完成和恢复完成后的落点均使用 `/app/desk`。

- [x] 在 `route-manifest.ts` 为 `desk` 增加 `AppRouteViewKey` 和 app 页面描述，设置模块导航元数据；检查 `LiubaiShell` 从 `vuePageRegistry` 自动生成模块清单，不另写第二份菜单。
- [x] 在 `router/index.ts` 为 `desk` 接入 `DeskPage.vue`，将 `/`、app 空路由和旧 `/desk` 指向 `/app/desk`；旧兼容路由使用独立名称以避免与 app 子路由重名。
- [x] 在 app 路由守卫中对 `/app/desk` 异步调用 `hasUnlockedVault`；锁定或不可读时转去 `/vault`，且不挂载桌面页面。
- [x] 将 `VaultPage.vue` 中 already-unlocked、`unlock()` 成功、`finishSetup()` 成功的三个 `/app/today` 跳转改为 `/app/desk`。
- [x] 让 `LiubaiShell.vue` 在 `/app/desk` 初始收起侧边模块导航；侧边缘悬停和 Ctrl/Cmd+K 打开并保持展开；抽屉中的 × 或再次按 Ctrl/Cmd+K 显式关闭；在导航中保留命令面板与模块管理器入口。对其他路由继续使用原有自动收起和 Ctrl/Cmd+K 命令面板行为。
- [x] 将 `DeskPage.vue` 布局设为全屏输入画布并通过 `useOwnSlideHead()` 避免重复标题；采用固定定位填满被 shell 变换的舞台，抽屉打开时仍可编辑并压缩可用宽度。

### 任务 2：建立桌面录入命令与可恢复撤销边界

**文件：**

- 新建：`src/application/use-cases/desktop-entry.ts`
- 修改：`src/application/use-cases/capture-text.ts`
- 修改：`src/application/use-cases/decide-capture.ts`
- 修改：`src/domain/capture/repository.ts`
- 修改：`src/domain/action/model.ts`
- 修改：`src/domain/action/repository.ts`
- 修改：`src/application/use-cases/index.ts`
- 修改：`src/application/index.ts`

**接口：**

```ts
import type { CaptureItem } from '@/domain/capture'
import type { CaptureDecision, DecideCaptureResult } from './decide-capture'
import type { CaptureTextResult } from './capture-text'

export interface SaveDesktopEntryInput { operationId: string; body: string }
export interface UpgradeDesktopEntryInput { operationId: string }
export interface UndoDesktopEntryInput { operationId: string }

export function saveDesktopEntry(input: SaveDesktopEntryInput): Promise<CaptureTextResult>
export function upgradeDesktopEntry(input: UpgradeDesktopEntryInput): Promise<DecideCaptureResult>
export function undoDesktopEntry(input: UndoDesktopEntryInput): Promise<void>
export function listDesktopCaptureHistory(): Promise<Array<{ capture: CaptureItem; decision?: CaptureDecision; entityId?: string }>>
```

- [x] 在 `desktop-entry.ts` 创建持久命令记录，至少保存 `operationId`、Capture id、可选 Action id、命令种类、创建时间和 `started/completed/undo-started/undone` 阶段；重复提交同一个 `operationId` 返回同一结果，撤销用例只接受成功操作后的 4 秒窗口。
- [x] 在 `capture-text.ts` 给 `captureText` 增加可选 `{ captureId?: string }` 参数，保持已有两个参数调用不变；在 Capture 仓库中支持指定 id 的重复创建：相同 id/原文返回现有实体，不同原文报 command conflict。
- [x] 让 `saveDesktopEntry` 先持久化命令 id 与预留 Capture id，再经现有 `captureText` 创建 Capture，并将结果关联到桌面命令；保留 Capture 已保存但建议失败时的成功结果。
- [x] 让 `upgradeDesktopEntry` 用稳定的 Capture 决策命令将对应 Capture 转为当天 Action；重试不得重复创建 Action，失败时 Capture 保持可回看的待处理状态。
- [x] 在 `decide-capture.ts` 导出 `findCaptureDecision(captureId)`，只返回该 Capture 已完成决策的类型、entity 类型和 entity id；待处理/进行中的命令不作为历史目标。
- [x] 在 Capture 异步仓库增加带期望 revision 的待处理恢复能力，追加 Capture history；桌面创建的 Capture 必须能从持久命令中被重试识别。
- [x] 在 Action 异步仓库增加有来源校验的撤销移除操作：只允许移除该桌面决策创建、revision 仍为初始值且仍为 planned 的 Action；补充 Action 删除/补偿 mutation 以保留审计轨迹。
- [x] 在 `undoDesktopEntry` 实现两种补偿：仅创建 Capture 时撤销该 Capture；已转 Action 时先校验 Capture 和 Action 未被后续修改，再移除该 Action 并恢复 Capture。逐步持久化撤销阶段，重复调用继续未完成步骤，只有完成全部步骤才返回成功。
- [x] 实现 `listDesktopCaptureHistory`：按 Capture 更新时间倒序返回最近 Capture，并对每条 Capture 查询已完成决策结果，附加决策类型和目标 entity id，供回看列表显示状态和跳转。
- [x] 更新两个 use-case export 文件，使桌面组件仅依赖应用用例，不直接编排跨仓库写入。

### 任务 3：实现快速输入、历史回看和快捷键

**文件：**

- 新建：`src/vue/pages/desk/DeskComposer.vue`
- 新建：`src/vue/pages/desk/DeskCaptureHistory.vue`
- 修改：`src/vue/pages/DeskPage.vue`
- 使用：`src/application/use-cases/desktop-entry.ts`

**接口：**

- `DeskComposer` 接收 `busy`，发出 `submit(body)` 和 `upgrade-last`；父页面负责命令 id、应用用例调用和错误提示。
- `DeskCaptureHistory` 接收 Capture 列表，发出 `close` 和 `open-target(capture)`；数据由父页面从 Capture 仓库读取。
- 父页面通过 `listDesktopCaptureHistory()` 获取 Capture 与目标关联信息。

- [x] 用多行输入组件替换现有分散的“一件事/记一句”入口，输入默认聚焦；普通 Enter 提交非空文本，Alt+Enter 保留换行。
- [x] 识别首个提交后 500 毫秒内的空输入 Enter，发出 `upgrade-last`；保存尚未返回 Capture id 时记住升级意图，拿到 id 后调用 `upgradeDesktopEntry`。Alt+Enter 和 Shift+Enter 都插入换行，组合输入期间不提交。
- [x] 每次提交生成一个操作 id 并调用 `saveDesktopEntry`；成功后清空文本、更新最近操作和最近历史；Capture 建议错误提示“已保存”，不能让用户误以为记录失败。
- [x] Escape 打开历史面板且不清除未提交草稿；历史通过 `listDesktopCaptureHistory()` 按创建时间顺序展示原文、时间、状态和已有目标，不在页面层读取决策命令或拼接关联。
- [x] 在最近一次成功录入/转任务后的 4 秒内处理 Ctrl/Cmd+Z，调用 `undoDesktopEntry`；新草稿开始输入或新操作发生后清除旧撤销目标；编辑草稿时保留输入框原生文本撤销；撤销成功刷新 Capture 历史及桌面状态。
- [x] 为保存、转 Action、历史读取和撤销设置独立忙碌/错误状态；保存失败保留输入，转换失败保留 Capture，撤销补偿中断时展示重试。
- [x] 使用 Vue 生命周期和时间戳窗口处理键盘交互，卸载时清理撤销/提示计时器；所有按钮提供可读标签和键盘焦点状态。

### 任务 4：迁移完整桌面外观设置

**文件：**

- 新建：`src/vue/pages/desk/preferences.ts`
- 新建：`src/vue/pages/desk/DeskAppearancePanel.vue`
- 修改：`src/vue/pages/DeskPage.vue`

**接口：**

```ts
export interface DeskPreferences {
  background: string
  fontSize: 14 | 16 | 19 | 22 | 26
  columnWidth: 'full' | 64 | 48 | 32
  horizontalAlign: 'left' | 'center' | 'right' | 'justify'
  verticalAlign: 'top' | 'middle' | 'bottom'
  lineSpacing: 1.5 | 1.65 | 1.85 | 2 | 2.2
  letterSpacing: -0.01 | 0 | 0.02 | 0.05 | 0.1
  paragraphSpacing: 0 | 0.5 | 1 | 1.5 | 2
}

export function readDeskPreferences(): DeskPreferences
export function saveDeskPreferences(value: DeskPreferences): boolean
export function resetDeskPreferences(): DeskPreferences
```

- [x] 在 `preferences.ts` 定义默认值和独立版本化 key；读取 JSON 时校验对象与每个数值范围，损坏或不可读时返回默认值；保存失败返回 `false`，重置移除 key 并返回默认值。
- [x] 默认外观取参考页档位：字号 19px、全宽、左对齐、顶部位置、行距 1.85、字距和段距 0；背景按系统深浅色偏好在 `#FBFBF8` 与 `#131312` 间选择。色板包含参考稿的 8 个颜色并保留自定义色。
- [x] 在 `DeskAppearancePanel.vue` 为背景色、字号、栏宽、水平/垂直对齐、行距、字距、段落间距提供可操作控件，并提供恢复默认按钮。
- [x] 由 `DeskPage.vue` 提供角落入口、桌面预览绑定和保存状态；设置面板使用右侧抽屉、窄屏适配与可滚动布局，Escape 关闭时不影响主编辑器快捷键。
- [x] 只保存外观偏好，不读取或迁移参考页的 `pms.prefs.v6`；不修改全局 LiubaiShell 主题 key。

### 任务 5：收尾与范围一致性检查

**文件：**

- 检查：`docs/superpowers/specs/2026-10-05-calmy-desktop-entry-design.md`
- 检查：本计划列出的所有路由、应用用例、领域仓库和桌面组件。

- [x] 将实现与设计文档逐项比对，覆盖路由/Vault/模块显隐、Enter 与双 Enter、Alt/Shift+Enter、Escape、4 秒 Ctrl/Cmd+Z、Capture 状态、外观档位和窄屏布局。
- [x] 将已批准的首页默认收起、边缘悬停唤出、Ctrl/Cmd+K 显式开合、× 关闭与仅桌面路由固定展开行为逐项对照；浏览器预览确认快捷键开合及抽屉内容，其他路由分支保留原行为。
- [x] 静态检查跨集合撤销的开始、完成、重试与对象 revision 冲突路径；确认只在全部补偿完成后成功返回，并检查了相关命令幂等边界。
- [x] 保留工作区已有的大量修改，只改本任务相关实现与设计/计划文件；不提交或推送。
- [x] 按全局约束未新增或执行自动化测试；另运行全项目类型检查，报告现存的非本功能错误。

### 任务 6：补齐参考页的整屏输入交互

**文件：**

- 修改：`src/vue/pages/DeskPage.vue`
- 修改：`src/vue/pages/desk/DeskComposer.vue`

**接口：**

- `DeskComposer` 暴露 `focus()`，父页面可在弹层关闭后把焦点还给编辑器。
- 父页面的空白画布点击逻辑只响应画布背景，不截断历史、外观、导航和编辑器中的原生操作。

- [x] 参考 HTML 的整块可编辑区域占据主画布；点击编辑区以外的空白画布聚焦输入，存在历史/设置视图时不抢焦点。
- [x] 空状态提示改为参考稿的快捷说明；提示不占据编辑内容，输入框继续以纯文本方式粘贴。
- [x] 输入、分段和保存反馈采用短暂暖色背景与左下角状态提示；错误文字保持可读并持续到恢复，不被提示计时器隐藏。
- [x] 历史或外观视图关闭后恢复编辑器焦点；Esc 按当前打开层级关闭视图，编辑时首次 Esc 打开记录。
- [x] 首页控制改到参考页右下角的轻量角落区域，清除与参考页不符的表单边框和顶部品牌/操作行；保留 Calmy 的模块导航边缘和 Ctrl/⌘+K 入口。

### 任务 7：将最近记录补成完整时间线并安全隐藏

**文件：**

- 修改：`src/application/use-cases/desktop-entry.ts`
- 修改：`src/vue/pages/DeskPage.vue`
- 修改：`src/vue/pages/desk/DeskCaptureHistory.vue`
- 修改或新建：`src/vue/pages/desk/history-visibility.ts`

**接口：**

```ts
export function readHiddenDesktopCaptureIds(): string[]
export function hideDesktopCaptureId(id: string): boolean
export function restoreDesktopCaptureId(id: string): boolean
```

- [x] 历史完整展示 Capture，不截断在最近 100 条；按本地自然日分组并显示时间，Action 显示轻量类型标记，长内容与空状态不溢出。
- [x] 历史视图改为全屏记录层，提供 Esc/角落按钮返回输入画布；列表滚动只发生在记录层内。
- [x] 每条记录提供“从桌面移除”操作。未处理 Capture 经 `decideCapture(..., decision: 'let_go')` 归档后从默认时间线隐藏，保留 Capture 历史；已完成决策的 Capture 只写入版本化本机隐藏索引，不修改或删除目标实体。
- [x] 记录层可切换显示隐藏项，并将项目恢复到桌面时间线；隐藏索引损坏或不可写时安全回退并报告局部错误。
- [x] 保持历史目标跳转使用现有 Capture 决策关联，不创建第二份记录列表业务存储，不读取参考页 `pms.entries.v1`。

### 任务 8：将外观设置还原为参考页抽屉交互

**文件：**

- 修改：`src/vue/pages/DeskPage.vue`
- 修改：`src/vue/pages/desk/DeskAppearancePanel.vue`
- 修改：`src/vue/pages/desk/preferences.ts`

- [x] 将居中模态框改为右侧滑入面板，背景轻遮罩；遮罩点击、关闭按钮和 Escape 都能关闭，关闭后输入焦点恢复。
- [x] 保留参考页 8 个背景色、自定义色和字号/宽度/水平对齐/垂直位置/行距/字距/段距档位，将原生 select 控件换成可聚焦、可读当前选中的轻量选项按钮。
- [x] 按面板宽度适配窄屏和安全区；滚动、键盘操作及保存错误提示可见。
- [x] 设置只写 Calmy 独立的 `calmy.desk.preferences.v1`；不导入或读取 `pms.prefs.v6`，不修改全局主题偏好。

### 任务 9：完整参考页行为核对

**文件：**

- 检查：`docs/superpowers/specs/2026-10-05-calmy-desktop-entry-design.md`
- 检查：任务 6–8 列出的输入、历史、偏好组件与用例。

- [x] 静态对照参考 HTML 核对空白点击聚焦、纯文本粘贴、Enter/空 Enter 快速升级、Alt/Shift+Enter、Esc 层级、Ctrl/Cmd+Z、暖色提示、历史分组/安全隐藏/恢复以及全部偏好档位。
- [ ] 在浏览器检查桌面全屏输入、记录视图、外观抽屉和窄屏布局；不写入测试 Capture 或更改用户业务数据。（已检查桌面输入视图；历史、抽屉与窄屏未做浏览器视觉验收。）
- [x] 运行一次 Impeccable 机械扫描，并静态检查数据语义边界；遵守全局约束，不添加或运行自动化测试，不提交或推送。
