# Calmy 实感产品 UI 重构交接

日期：2026-09-21  
当前分支：`codex/tactile-product-ui`  
状态：设计已确认，实施计划已写，Task 1 已完成，Task 2 尚未开始  
Git：无 commit、无 push、无远端写入

## 1. 用户已经确认的方向

- 任务是重新设计整个网站的前端 UI 架构，不改后端业务逻辑。
- 以解决现实问题为根本，不增加多余步骤；最终思考与选择由人完成，系统只呈现方法、事实、证据和现实出口。
- 主页面要简洁，但整体信息密度不能太低；功能放入可收起侧边栏、紧凑列表或右侧情境区。
- “质感”必须同时体现在看起来和使用起来：有真实表面层级、稳定边界、按压/保存/切换反馈，不能像生成式概念图或假后台。
- 圆角更小；菜单切换使用连续渐变位移动效，禁止闪烁式淡入淡出。
- 左侧菜单可以整栏收起；右侧情境区可以从窄轨道展开。
- 参考用户提供的 23 张 SaaS 工作台图片，并借鉴芋道、若依的稳定壳层和信息密度，但不复制 KPI 后台内容。

## 2. 已确认的视觉方案

视觉原型：

- `.impeccable/prototypes/calmy-tactile-ui/index.html`
- `.impeccable/prototypes/calmy-tactile-ui/desktop-dense.png`
- `.impeccable/prototypes/calmy-tactile-ui/desktop-dense-collapsed.png`

关键结构：

- 冷灰画布 + 白色应用框架 + 浅灰工作区。
- 左栏 `232px ↔ 76px`，右栏 `356px ↔ 66px`。
- 普通面板圆角 `6/8/12px`，应用外框 `18px`。
- 午夜蓝负责稳定结构，电光蓝负责主操作与当前状态；珊瑚、琥珀、青绿、紫色只表达真实状态。
- 主导航只有一个渐变 active track，在菜单项之间连续滑动。
- Today 首屏顺序：页面状态 → 一件主行动 → 快速记录 → 今天记录 → 身体状态/思考/轨迹。

完整设计规范：

- `docs/superpowers/specs/2026-09-21-tactile-product-ui-architecture-design.md`

## 3. 已保存的改造前基线

基线来自真实 React 组件的隔离渲染，不是原型图：

- `docs/product/assets/ui-baseline-2026-09-21/today-desktop-before.png`（1440×1000）
- `docs/product/assets/ui-baseline-2026-09-21/today-mobile-before.png`（390×844）

基线辅助文件：

- `.impeccable/baseline/current.html`
- `.impeccable/baseline/current.tsx`
- `.impeccable/baseline/auth.html`
- `.impeccable/baseline/capture-cdp.mjs`

注意：正式 App 在全新无痕 Chrome 中会长期停在“正在恢复本机数据”，所以基线最终通过直接渲染真实 `AppShell + TodayPage` 组件获得。不要把加载屏截图当作 Before 图。

## 4. 已完成的实施工作

实施计划：

- `docs/superpowers/plans/2026-09-21-tactile-product-ui-implementation.md`

Task 1 已完成：

- 新增 `src/react/tactile-ui.css`，建立未来唯一的 tactile 视觉 contract。
- 已定义画布、表面、边界、文字、状态色、三档圆角、三档阴影、左右栏宽度、动效时长与 easing token。
- 已加入 focus ring、按钮按压反馈和 `prefers-reduced-motion`。
- `src/react/main.tsx` 已正式引入 `tactile-ui.css`，并始终给根元素增加 `tactile-ui` class；不再把新架构只藏在原来的 `?ui=refresh` 实验开关里。
- 新增 `src/__tests__/tactile-ui-architecture.test.ts`。

最新定向测试：

```text
npx vitest run src/__tests__/tactile-ui-architecture.test.ts
Test Files  1 passed
Tests       2 passed
```

## 5. 当前仓库状态

```text
branch: codex/tactile-product-ui

 M src/react/main.tsx
?? .impeccable/
?? PRODUCT.md
?? docs/product/assets/ui-baseline-2026-09-21/
?? docs/superpowers/plans/2026-09-21-tactile-product-ui-implementation.md
?? docs/superpowers/specs/2026-09-21-tactile-product-ui-architecture-design.md
?? src/__tests__/tactile-ui-architecture.test.ts
?? src/react/tactile-ui.css
```

这些未跟踪内容均属于当前 UI 设计/交接工作或之前已经存在的产品入口文档，不要删除、reset 或 checkout 覆盖。

## 6. 已知测试基线

实施前运行过全量测试：

- 297 项中 294 项通过，3 项失败。
- 3 项均在 `src/__tests__/accessibility-static.test.ts`。
- 原因是测试仍断言旧的硬编码 `<Route ...>` JSX，而当前生产路由已经由 `route-manifest` 注册表生成。
- 这是本次 UI 改造前就存在的静态断言漂移，与 tactile UI 无关。
- 不要为了 UI 任务顺手改路由架构；最终报告时把这 3 项作为既存失败列出。

## 7. 新对话从这里继续

先读取：

1. 本交接文件。
2. `docs/superpowers/specs/2026-09-21-tactile-product-ui-architecture-design.md`。
3. `docs/superpowers/plans/2026-09-21-tactile-product-ui-implementation.md`。
4. `src/react/tactile-ui.css` 和 `src/__tests__/tactile-ui-architecture.test.ts`。

然后直接执行实施计划 Task 2，不重新做产品定位或再画一轮原型。

### Task 2 下一步

1. 先扩展 `src/__tests__/tactile-ui-architecture.test.ts`，写失败测试：
   - `AppShell` 输出 `data-sidebar-state`、`data-context-state`。
   - `DesktopPrimaryNav` 有单一 `nav-active-track`。
   - 折叠按钮保留 `aria-expanded/aria-controls`。
   - 右栏收起后保留可操作 dock。
2. 运行测试确认失败。
3. 修改：
   - `src/react/AppShell.tsx`
   - `src/react/shell/DesktopPrimaryNav.tsx`
   - `src/react/shell/PageTopBar.tsx`
   - `src/react/shell/ContextRail.tsx`
   - `src/react/tactile-ui.css`
4. 实现真实三栏几何、连续 nav active track、标签渐隐、左右栏连续展开/收起。
5. 运行：

```powershell
npx vitest run src/__tests__/tactile-ui-architecture.test.ts src/__tests__/react-accessibility.test.ts
git diff --check
```

### Task 3 及以后

- Task 3：Today 高密度现实工作区重排。
- Task 4：窄屏/移动端统一。
- Task 5：全量测试、构建、After 截图与前后对照。
- 后续再迁移记录、处境、回顾和其他模块，不在第一切片一次性重写全站。

## 8. 执行边界

- 必须测试先行。
- 只改前端表达与组件结构，不碰数据/同步/认证/后端。
- 不使用子代理。
- 未经明确授权，不 commit、不 push、不写远端。
- 当前分支已经隔离，不要再创建新 worktree。
- 完成前必须使用同一视口生成 `today-desktop-after.png`、`today-mobile-after.png`，与 Before 图对照。
