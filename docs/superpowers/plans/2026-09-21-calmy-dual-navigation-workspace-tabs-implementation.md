# Calmy 双层导航与工作区 Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变 Calmy 路由、业务和数据逻辑的前提下，实现已选定的双层侧栏与浏览器式工作区 Tab。

**Architecture:** 导航数据继续从 `route-manifest.ts` 派生；`DesktopPrimaryNav` 只管理当前查看的视觉分组，`WorkspaceTabs` 只管理会话级已打开路径。`AppShell` 连接路由、保存状态与壳层组件，页面组件和数据 hooks 不参与这次改造。

**Tech Stack:** React 19、React Router 7、TypeScript、CSS、Vitest、JSDOM。

**Spec:** `docs/superpowers/specs/2026-09-21-calmy-dual-navigation-workspace-tabs-design.md`

## Global Constraints

- 只改前端 UI 壳层，不修改领域模型、Repository、IndexedDB、同步、认证、保存协议或路由语义。
- 所有导航项必须从现有 `primaryNavigation` 与 `featureNavigationGroups` 派生，不能复制产品结构。
- 桌面 Tab 使用 `sessionStorage`，不进入业务数据或跨设备同步。
- 移动端保留当前顶栏、底部导航和功能抽屉。
- 严格测试先行；不 commit、不 push。

---

### Task 1: 建立可测试的工作区 Tab 状态模型

**Files:**
- Create: `src/react/shell/workspace-tabs.ts`
- Test: `src/__tests__/workspace-tabs.test.ts`

**Interfaces:**
- Produces: `WorkspaceTab`, `createWorkspaceTabs`, `visitWorkspaceTab`, `closeWorkspaceTab`, `readWorkspaceTabs`, `writeWorkspaceTabs`。
- `WorkspaceTab` 包含 `path: string`、`title: string`、`pinned: boolean`。

- [ ] **Step 1:** 写失败测试，使用字面量期望覆盖“今天固定、路径去重、活动 Tab 关闭后选择左邻、最多 12 个、损坏缓存回退”。
- [ ] **Step 2:** 运行 `npx vitest run src/__tests__/workspace-tabs.test.ts`，确认因模块不存在而失败。
- [ ] **Step 3:** 实现纯函数；缓存只读写 `calmy_workspace_tabs_v1`，解析失败返回仅含今天的列表。
- [ ] **Step 4:** 重跑定向测试，确认通过。

### Task 2: 渲染并操作工作区 Tab 条

**Files:**
- Create: `src/react/shell/WorkspaceTabs.tsx`
- Modify: `src/react/AppShell.tsx`
- Modify: `src/react/tactile-ui.css`
- Test: `src/__tests__/workspace-tabs.test.ts`

**Interfaces:**
- Consumes: Task 1 的状态函数。
- Produces: `WorkspaceTabs({ tabs, activePath, saveState, onActivate, onClose })`。

- [ ] **Step 1:** 写失败组件测试，断言 `role="tablist"`、固定今天无关闭按钮、活动项 `aria-selected="true"`、关闭按钮标签与点击回调。
- [ ] **Step 2:** 运行测试并确认缺少组件而失败。
- [ ] **Step 3:** 实现最小组件并在 `AppShell` 中随路由访问更新、随关闭选择相邻页、写入 `sessionStorage`。
- [ ] **Step 4:** 添加 42px Tab 行和水平滚动 CSS，把 `workspace-shell` 调整为顶栏 / Tab / 页面三行。
- [ ] **Step 5:** 运行 `npx vitest run src/__tests__/workspace-tabs.test.ts src/__tests__/tactile-ui-architecture.test.ts`。

### Task 3: 把现有桌面导航重排为一级轨道和二级侧栏

**Files:**
- Modify: `src/react/navigation.ts`
- Modify: `src/react/shell/DesktopPrimaryNav.tsx`
- Modify: `src/react/tactile-ui.css`
- Modify: `src/__tests__/tactile-ui-architecture.test.ts`

**Interfaces:**
- Produces: `desktopNavigationGroups`，第一组 id 为 `daily`，其 items 直接引用 `primaryNavigation`；其他组直接引用 `featureNavigationGroups`。
- `DesktopPrimaryNav` 保留现有目录、搜索、折叠和导航回调签名。

- [ ] **Step 1:** 写失败测试，断言分组覆盖现有路径且无重复、一级轨道只有一个 active track、二级侧栏只渲染所选组页面、当前页面保留 `aria-current`。
- [ ] **Step 2:** 运行测试，确认因缺少 `desktopNavigationGroups` 或新 DOM contract 而失败。
- [ ] **Step 3:** 在 `navigation.ts` 派生视觉分组；重写 `DesktopPrimaryNav` 的标记结构，但不改任何路径与标签。
- [ ] **Step 4:** 重写左栏 CSS：固定 68px 轨道、弹性二级栏、收起时只保留轨道；折叠按钮保持 40px 且位于栏内。
- [ ] **Step 5:** 运行 `npx vitest run src/__tests__/tactile-ui-architecture.test.ts src/__tests__/react-accessibility.test.ts`。

### Task 4: 回归与视觉验证

**Files:**
- Modify only if a failing UI test identifies a shell defect.

- [ ] **Step 1:** 运行 `npx vitest run src/__tests__/workspace-tabs.test.ts src/__tests__/tactile-ui-architecture.test.ts src/__tests__/tactile-all-pages.test.ts src/__tests__/react-accessibility.test.ts`。
- [ ] **Step 2:** 运行 `npm test`，记录并区分既存失败与本轮回归。
- [ ] **Step 3:** 运行 `npm run build` 与 `git diff --check`。
- [ ] **Step 4:** 在 1440×1000 与 390×844 验证侧栏、Tab、拖动分隔线、折叠按钮和移动端退化；不提交、不推送。

