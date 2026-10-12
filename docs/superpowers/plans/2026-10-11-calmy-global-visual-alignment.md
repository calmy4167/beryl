# Calmy 全站页面视觉对齐实施计划

> **For agentic workers:** 本计划在当前会话内由主 agent 按任务顺序执行，并在每个阶段进行静态复核。

**Goal:** 统一 Calmy 的桌面/模块导航和页面结构，并从首页入口打开完整记录页。

**Architecture:** 保留已有 LiubaiShell 作为唯一 app shell，在现有主题令牌和 CSS 适配层内建立统一 header、navigation、control、surface 和 state 规则。按 route-manifest 的 page archetype 对路由分组，逐类归一结构，不替换业务数据与存储链路。

**Tech Stack:** Vue 3、TypeScript、Vue Router、现有 CSS tokens 与 scoped styles。

**Spec:** docs/superpowers/specs/2026-10-11-calmy-global-visual-alignment.md

## Global Constraints

- 只修改本次导航、shell、桌面记录展开和页面视觉对齐涉及的文件。
- 保留用户工作区中其余已有更改，不重置、暂存、提交或推送。
- 保留当前路由、权限、数据模型、Repository、同步和记录安全隐藏行为。
- 滚轮与触控板只滚动当前内容，不切换 app 模块。
- 通过针对性回归测试与浏览器走查验证导航、首页完整记录页和页面布局。

---

### Task 1: 共享壳层和导航入口

**Files:**
- Modify: `src/vue/shell/LiubaiShell.vue`
- Modify: `src/styles/liubai/liubai-app.css`

**Interfaces:**
- Preserve the existing `vuePageRegistry` and `featureNavigationGroupMeta` as the navigation source.
- Keep route activation delegated to Vue Router.
- Keep keyboard commands and reduced-motion behavior compatible with existing shell state.

- [x] 统一导航分组、模块选中态、控制入口和页头动作的布局。
- [x] 移除滚轮/触控板边界切换模块的事件拦截，保留内容原生滚动。
- [x] 复核桌面导航与小屏导航的侧栏/抽屉表现一致。

### Task 2: 首页控制入口与完整记录页

**Files:**
- Modify: `src/vue/pages/DeskPage.vue`
- Modify: `src/vue/pages/desk/DeskCaptureHistory.vue`
- Add: `src/vue/pages/desk/DeskRecordsPage.vue`
- Modify: `src/router/route-manifest.ts`
- Modify: `src/router/index.ts`
- Modify: `src/vue/pages/desk/DeskAppearancePanel.vue`

**Interfaces:**
- Preserve `DesktopCaptureHistoryItem` input and existing emitted events.
- Preserve existing save, undo, archive/hide, restore, retry, and business-target routing functions.

- [x] 将首页右下角入口移到统一的右上角操作区。
- [x] 首页记录入口打开独立完整记录页，按列表-详情形式呈现全部桌面记录。
- [x] 保持主输入面的尺寸、位置与现有输入偏好。
- [x] 让控制入口承载桌面外观控制，避免重复的散落入口。

### Task 3: 按 archetype 对齐 app 页面

**Files:**
- Modify: `src/router/route-manifest.ts` only if page archetype metadata needs a consistency correction.
- Modify: `src/styles/liubai/liubai-app.css`
- Modify: impacted `src/vue/pages/*.vue` and `src/vue/liubai/*.vue` wrappers only when shared selectors cannot safely align them.

**Interfaces:**
- Treat `AppPageDescriptor.archetype` as the page-family contract.
- Preserve every page component's existing business actions and repository calls.

- [x] 对 today/capture、list-detail、timeline/content、board/calendar、personal-tool/insight、integration/settings 页面建立共同的页头和间距基线。
- [x] 统一页标题、说明、日期/筛选和页级操作的基础对齐。
- [x] 保留列表和表格密度，不将其改造成重复卡片栅格。
- [x] 通过 route archetype 给全部 app 页面提供样式钩子。

### Task 4: 收尾检查与交付说明

**Files:**
- Review only the files changed by Tasks 1–3.

- [ ] 对所有修改做静态差异检查，确认业务逻辑、路由、权限、数据未被改写。
- [ ] 检查窄屏断点、键盘焦点、弹层滚动、简洁/禅模式下控件可达性。
- [ ] 明确说明自动测试未运行及尚存的验证限制。

## Self-review

- Spec coverage: navigation/shell (Task 1), home/history (Task 2), page archetypes (Task 3), preservation and final review (Task 4).
- No placeholder steps are used.
- Functionality contracts remain anchored to the existing router registry, capture history item type, and emitted events.

