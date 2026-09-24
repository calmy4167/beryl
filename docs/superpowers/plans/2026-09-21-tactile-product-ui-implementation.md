# Calmy 实感产品 UI 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for this plan. Do not use subagents for this run. Work test-first, preserve product/data behavior, and stop at each visual checkpoint.

**Goal:** 用已批准的“实感工作台”原型替换当前前端视觉底层，先完成全站外壳与 Today 垂直切片，再按同一设计系统迁移其余页面；保持现有领域模型、存储、同步和路由行为不变。

**Architecture:** 新增唯一的 tactile 设计系统入口，统一基础 token、表面材质、密度、圆角与动效；AppShell 负责稳定的三栏框架和可收起状态，页面只负责内容结构。Today 作为第一条完整用户路径验证底层架构，后续页面复用同一 shell、surface 和 motion contract，而不是各自新增视觉语言。

**Tech Stack:** React 19、React Router 7、TypeScript、CSS design tokens、Vitest、Vite、Chrome DevTools Protocol visual capture。

**Spec:** `docs/superpowers/specs/2026-09-21-tactile-product-ui-architecture-design.md`

## Global Constraints

- 不修改后端、领域模型、IndexedDB、同步协议或数据结构。
- 不增加新的业务步骤；系统只呈现现实问题、事实、可用方法和下一步入口，最终选择仍由用户完成。
- 主页面保持简洁；高频功能进入左侧栏、右侧上下文栏或紧凑列表。
- 圆角控制在 6–12px，工作台外框最多 18px；禁止大面积胶囊与漂浮海报式卡片。
- 状态切换使用连续渐变位移/淡入淡出，禁止整块闪烁；遵守 `prefers-reduced-motion`。
- 所有改动先写失败测试；每个阶段运行定向测试、全量测试、构建和视觉截图。
- 当前基线截图：`docs/product/assets/ui-baseline-2026-09-21/today-desktop-before.png`、`today-mobile-before.png`。
- 未经用户单独授权，不 commit、不 push；用 `git diff --check` 和截图作为检查点。

---

## Task 1: 固化 tactile 设计系统入口

**Files:**
- Create: `src/react/tactile-ui.css`
- Modify: `src/react/main.tsx`
- Modify: `src/react/theme-preferences.ts`
- Test: `src/__tests__/tactile-ui-architecture.test.ts`

**Step 1: Write the failing architecture test**

断言 `main.tsx` 只加载一个新的 tactile 入口并给根节点增加 `tactile-ui`；断言 CSS 定义以下 token：画布、表面、边框、文本、三档圆角、三档阴影、shell/rail 宽度、标准与强调动效。

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/tactile-ui-architecture.test.ts`

Expected: FAIL，提示缺少 `tactile-ui.css` 或 token。

**Step 3: Implement the minimal design-system entry**

在 `tactile-ui.css` 中建立可复用 token，并把根画布、字体、focus ring、surface、button、input 的材质规则集中到同一层。`main.tsx` 始终启用 `tactile-ui`，不再把正式外观依赖临时 `?ui=refresh` 开关。

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/tactile-ui-architecture.test.ts`

Expected: PASS。

**Step 5: Checkpoint**

Run: `git diff --check`

Expected: 无输出；不提交。

## Task 2: 重建可收起的桌面工作台外壳

**Files:**
- Modify: `src/react/AppShell.tsx`
- Modify: `src/react/shell/DesktopPrimaryNav.tsx`
- Modify: `src/react/shell/PageTopBar.tsx`
- Modify: `src/react/shell/ContextRail.tsx`
- Modify: `src/react/tactile-ui.css`
- Test: `src/__tests__/tactile-ui-architecture.test.ts`

**Step 1: Write failing shell-contract tests**

断言 shell 输出明确的 `data-sidebar-state`、`data-context-state`；导航具有独立 active indicator；折叠按钮保留 `aria-expanded/aria-controls`；右栏在宽屏收起后仍保留可点击 dock。

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/tactile-ui-architecture.test.ts`

Expected: FAIL，提示缺少状态 contract 或 active indicator。

**Step 3: Implement shell geometry and material**

实现 232px ↔ 76px 左栏、356px ↔ 66px 右栏；主内容保持稳定最小宽度；顶栏与两侧栏使用真实分隔线、微阴影、内层高光构成层级。折叠时标签通过 `opacity/transform/clip` 过渡，不使用瞬时 `display:none`。

**Step 4: Implement continuous navigation motion**

为主导航增加单一渐变 active track，根据当前导航索引平滑位移；文字和图标只做颜色/位移补偿。使用 220–280ms、`cubic-bezier(.22,.8,.24,1)`；减少动态偏好下关闭位移。

**Step 5: Verify shell behavior**

Run: `npx vitest run src/__tests__/tactile-ui-architecture.test.ts src/__tests__/react-accessibility.test.ts`

Expected: PASS。

## Task 3: 把 Today 重排为高密度、低干扰的现实工作区

**Files:**
- Modify: `src/react/pages/TodayPage.tsx`
- Modify: `src/react/pages/today/TodayNowPanel.tsx`
- Modify: `src/react/pages/today/TodayActionForms.tsx`
- Modify: `src/react/pages/today/TodayRecentRecords.tsx`
- Modify: `src/react/pages/today/TodayBodyStatePanel.tsx`
- Modify: `src/react/pages/today/TodayContextPanels.tsx`
- Modify: `src/react/tactile-ui.css`
- Test: `src/__tests__/tactile-today-structure.test.ts`

**Step 1: Write failing Today structure tests**

断言首屏顺序为：页面状态 → 一件主行动 → 快速记录 → 今天记录 → 身体状态/思考/轨迹；主要 CTA 只有一个，辅助内容不抢占主视觉；已有表单 label、按钮文本和数据回调保持不变。

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/tactile-today-structure.test.ts`

Expected: FAIL，提示缺少新的区域 contract。

**Step 3: Implement the approved Today composition**

用 12 列内容网格实现主区与辅助区；主行动占主要横向空间，快速记录成为紧凑工具条，记录列表使用真实行分隔，身体状态与思考/轨迹作为次级面板。保留所有现有 hooks、repository 调用和用户输入路径。

**Step 4: Add tactile interaction states**

为保存、展开、选择、完成和空状态补全 hover/focus/pressed/pending/success；展开区域用 grid-row/opacity 渐进动画，禁止内容闪现。

**Step 5: Verify Today behavior**

Run: `npx vitest run src/__tests__/tactile-today-structure.test.ts src/__tests__/open-today.test.ts src/__tests__/today-async-repository.test.ts`

Expected: PASS。

## Task 4: 统一移动端和窄屏行为

**Files:**
- Modify: `src/react/shell/MobileHeader.tsx`
- Modify: `src/react/shell/MobilePrimaryNav.tsx`
- Modify: `src/react/tactile-ui.css`
- Test: `src/__tests__/tactile-ui-architecture.test.ts`

**Step 1: Extend the failing responsive contract**

断言窄屏隐藏桌面 rail、保留可达的功能目录、底部主导航触控区不小于 44px，并为键盘焦点与 reduced motion 定义样式。

**Step 2: Run targeted tests**

Run: `npx vitest run src/__tests__/tactile-ui-architecture.test.ts src/__tests__/react-accessibility.test.ts`

Expected: 先 FAIL，实施后 PASS。

**Step 3: Implement compact mobile composition**

移动端只保留轻量品牌顶栏、单列内容和固定底部主导航；辅助功能进入目录抽屉，不把桌面右栏原样堆到底部。

## Task 5: 视觉回归与构建验证

**Files:**
- Modify: `.impeccable/baseline/current.tsx`
- Create: `docs/product/assets/ui-baseline-2026-09-21/today-desktop-after.png`
- Create: `docs/product/assets/ui-baseline-2026-09-21/today-mobile-after.png`

**Step 1: Run the full test suite**

Run: `npm test`

Expected: PASS。

**Step 2: Run production build**

Run: `npm run build`

Expected: PASS，无 TypeScript 或打包错误。

**Step 3: Capture after screenshots**

用与基线完全相同的 1440×1000 和 390×844 视口截取 After 图，逐项核对：信息密度、圆角、左栏折叠、右栏 dock、连续渐变动效、首屏 CTA 数量、移动端可操作性。

**Step 4: Final hygiene**

Run: `git diff --check`

Expected: 无输出；列出改动与尚未迁移的页面，不提交。

## Follow-up plans after this vertical slice

1. 主路径迁移：记录、处境、回顾。
2. 工作与内容路径迁移：任务、看板、日历、资料库、收件箱。
3. 关系、工具、试验、个人与设置模块迁移。
4. 全站暗色主题、空状态、错误态和跨页面视觉回归。

每个 follow-up 继续复用本计划建立的 token、shell 和 motion contract，不再新增页面级视觉底层。

---

## Task 6: 建立全站页面原型与可调分栏 contract

**Files:**
- Modify: `src/react/AppShell.tsx`
- Create: `src/react/shell/ShellResizeHandle.tsx`
- Modify: `src/react/tactile-ui.css`
- Test: `src/__tests__/tactile-all-pages.test.ts`

**Step 1: Write failing contracts**

断言所有 app 页面都通过 route registry 暴露 `data-page-id` / `data-page-archetype`；左右分栏具有键盘可达的 `role="separator"`、当前宽度与最小/最大值；宽度计算会夹在安全范围内。

**Step 2: Implement adjustable geometry**

展开态左栏允许在 `196–320px` 间拖动，展开态右栏允许在 `280–480px` 间拖动；使用 Pointer Events、键盘方向键、Home/End 和本机 UI 偏好持久化。收起态、窄桌面和移动端禁用拖动，不改变业务数据。

## Task 7: 统一全站控件、表面和边界语言

**Files:**
- Modify: `src/react/tactile-ui.css`
- Test: `src/__tests__/tactile-all-pages.test.ts`

**Step 1: Reproduce visibility defects**

用真实 DOM 断言普通、主操作、危险和静默按钮均有明确前景色、背景/边界与禁用状态；输入、选择、文本域和 focus ring 继承 tactile token。

**Step 2: Replace fragmented framing**

把旧 `.beryl-card` 的普遍强边框收敛为开放分组、行分隔与三档表面；统一页面标题、工具栏、列表行、表单和状态提示。禁止通过逐页临时颜色修补解决不可见按钮。

## Task 8: 按页面原型迁移全部 React/Vue 兼容页面

**Files:**
- Modify: `src/react/tactile-ui.css`
- Modify as needed: `src/react/pages/*.tsx`
- Modify as needed: `src/react/feishu-*.css`
- Modify as needed: `src/react/LegacyAdminHost.tsx`
- Test: `src/__tests__/tactile-all-pages.test.ts`

迁移顺序：

1. 四条主路径：记录、处境、回顾、处境详情。
2. 高频工作路径：任务、看板、日历、目标、周期、飞书。
3. 内容与理解：资料、收集、探索、日记、文章、人物、图谱、记忆。
4. 个人工具与实验：习惯、财务、专注、未来、我的、场景。
5. 设置与兼容页：React 容器和 Vue 管理页共享同一 token、控件和边界语言。

每一组保持原 hooks、repository、路由和回调，只重排结构或替换表现层 class；用代表页面覆盖空、典型、长内容和窄屏状态。

## Task 9: 全站视觉回归与交互验证

扩展隔离预览使其可按 route 渲染真实页面；桌面至少覆盖每种 archetype，移动端覆盖四条主路径与高密度页面。逐项检查：按钮可见、边界连续、分栏拖动、焦点顺序、长文本、空状态、横向溢出和 reduced motion。最后运行定向测试、全量测试、构建、`git diff --check`，不提交。

### 2026-09-21 execution record

- Tasks 6–9 已按测试先行完成；业务 hooks、repository、数据模型与路由行为未改。
- 定向 contract：`17 passed`；生产构建通过并生成 33 个 precache URL。
- 全量测试：`314 passed / 3 failed`。3 个失败均来自 `accessibility-static.test.ts` 仍硬编码旧 `<Route>` JSX，而生产路由已由既有 route manifest 生成；本 UI 任务未改路由架构。
- Chrome CDP 在真实 Pointer Events 下验证：左栏 `232 → 260px`，右栏 `356 → 388px`，CSS 变量和 `localStorage` 同步持久化。
- 390×844 回归覆盖 Today、记录、回顾、看板和设置，均满足 `scrollWidth === clientWidth`；看板横向浏览只发生在列容器内部。
- 视觉证据位于 `docs/product/assets/ui-baseline-2026-09-21/route-audit/`；未 commit、未 push。
