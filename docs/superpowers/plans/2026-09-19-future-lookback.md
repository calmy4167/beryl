# 「未来回望」首个体验切片实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Calmy 中加入独立的「未来回望」体验，用户可查看行动可能带来的收益和一直不行动可能错过的结果，并在确认后保存自己的选择与反思。

**Architecture:** 新增应用用例直接创建 Capture 原文，避免通用 Capture 用例自动生成整理建议。React 页面承载预设主题、可编辑选择句、时间选择、各预设独立的事实影响链与用户反思；通过 `/app/future` 路由和「更多」抽屉试验入口访问。

**Tech Stack:** React 19、TypeScript、React Router、项目现有 Capture repository、项目现有 CSS 变量与组件样式。

**Spec:** `docs/superpowers/specs/2026-09-19-future-lookback-design.md`

## Global Constraints

- 预设结果必须按具体领域建立行动收益链和不行动代价链，不使用原句填空式模板。
- 页面展示事实依据和限制，不得声称是实时搜索、AI 分析或个性化结果。
- 自定义输入没有可用依据时停止推演；不调用外部生成服务、不新增同步或遥测用途。
- 只有用户主动确认保存后，才调用现有 Capture 存储；保存只包含影响推演体验标记、用户选择、反思和可选下一步，不保存推演文案。
- Today 首页及其现有导航顺序保持不变；新入口只放在「更多」抽屉。
- 不添加或运行测试；完成后可运行项目构建命令作类型与打包检查。
- 仅修改本地工作区；不提交、不推送、不写远端分支。

---

### Task 1: 增加只保存选择与反思的应用用例

**Files:**
- Create: `src/application/use-cases/save-future-reflection.ts`
- Modify: `src/application/use-cases/index.ts`
- Modify: `src/application/index.ts`

**Interfaces:**
- Produces: `saveFutureReflection(input): Promise<CaptureItem>`，输入字段为必填 `choice: string`、`reflection: string` 和可选 `nextStep?: string`。
- 实现直接调用 `captureAsyncRepository.create(body)`；不得调用 `captureText` 或 `suggest`。

- [x] 定义输入类型并校验去空格后的 `reflection` 非空；空内容抛出清晰的中文错误。
- [x] 保存正文只组合模板体验标记、用户选择、用户反思和非空的可选下一步，不保存未来情境文案。
- [x] 导出用例及输入类型到应用层公共导出。

### Task 2: 实现未来回望体验页

**Files:**
- Create: `src/react/pages/FuturePage.tsx`
- Modify: `src/react/react.css`

**Interfaces:**
- Consumes: Task 1 的 `saveFutureReflection`。
- 页面状态：`intro`、`scenarios`、`reflection`、`saved` 四种阶段；回望时间为 `'six-months' | 'five-years'`。

- [x] 创建体验介绍阶段，提供预设主题、可编辑选择句和「开始体验」。
- [x] 支持修改预设内容或完全自填，并在空白时禁用开始操作。
- [x] 提供半年后和五年后选项；每个时间都展示「去做可能得到」与「一直不做可能错过」。
- [x] 为每个预设建立独立影响链，并为各路径提供回到反思输入页的操作。
- [x] 反思页提供必填判断和可选下一步；仅点击「保存我的反思」时调用保存用例。
- [x] 保存期间锁定输入；保存失败时保留输入并显示可读错误；保存成功后显示 Capture 保存位置和返回入口。
- [x] 增加响应式页面样式，使用已有 CSS 变量与卡片、按钮约定。

### Task 3: 接入路由与试验入口

**Files:**
- Modify: `src/react/App.tsx`
- Modify: `src/react/lazy-pages.ts`
- Modify: `src/react/routes.tsx`
- Modify: `src/react/AppShell.tsx`

**Interfaces:**
- Consumes: Task 2 的 `FuturePage`。
- Route: `/app/future`；Drawer label: `未来回望（试验）`。

- [x] 在 `lazy-pages.ts` 按项目现有方式动态加载页面，并在 `App.tsx` 向 `AppRoutes` 提供页面。
- [x] 在应用内增加 `/app/future` 路由。
- [x] 在 `AppShell` 增加页面标题元数据和「更多」抽屉入口；不改主导航和 Today 默认路由。

### Task 4: 检查改动

**Files:** 无新增文件。

- [x] 运行 `npm run build`，确认 TypeScript 检查和 Vite 构建完成。
- [x] 查看工作区差异，确认只包含本计划相关文件以及开始前已经存在的用户改动。
- [x] 确认没有测试、提交、推送或远端写入操作。

### 反馈迭代：选项加自定义输入

- [x] 使用四个常见主题作为起点；预设填入可编辑输入框，另提供清空后自填入口。
- [x] 将选择带入通用模板，并明确标出模板不代表个性化分析或预测。
- [x] 确认保存正文只含用户选择、反思和可选下一步，不包含模板文案。

### 反馈迭代：事实影响链

- [x] 删除行动与不行动各自的庆幸／遗憾四象限，改成行动收益与不行动代价两条路径。
- [x] 将「学习与成长」具体化为「学习 Python」，按能力、项目、效率和职业机会展开近期与长期影响。
- [x] 为四个预设分别编写影响链并展示来源、条件和不确定性。
- [x] 自定义内容没有事实检索结果时明确停止，不退回原句填空模板。

### OW-21 后续试改（2026-09-20）

- [x] 按 D-018 恢复四个已有预设中行动与暂缓各自的可能收获和代价；自定义内容仍暂停推演。
- [x] 所有主题允许可选填写事实与解释；只有明确确认保存才把用户输入写入 Capture。
- [x] 支持用户提交并打开普通 HTTP(S) 链接，不读取或抓取外部内容。
- [x] 支持用户返回后把现实反馈另存为 Capture，并在正文引用原选择 Capture ID。
- [x] 更新 OW-21 纵向试点设计与 `OPEN_WORK.md`；真实场景、外部工具往返和用户语言验证仍未完成。
- [x] 运行 `npm run build`；遵守本计划不添加或运行测试、不提交、不推送、不写远端分支的约束。

完整迁移边界与待验证条件见[OW-21 工作机会纵向试点设计](../../product/OW-21_WORK_SCENARIO_PILOT_2026-09-20.md)。
