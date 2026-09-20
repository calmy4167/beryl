# Calmy 全站 UI 架构实施计划

> **For agentic workers:** implement this plan task by task in the current authorized session. Keep each task independently reviewable and preserve all route, data, and interaction contracts.

**Goal:** 为 Calmy 的 React 工作台、全部扩展页面、场景页和 Vue 设置宿主建立一致、可访问、可回退的全站 UI 架构，并加入主题级自定义背景色。

**Architecture:** 用一个类型化页面注册表驱动路由元数据、主导航、扩展分组、页面标题和 archetype；将当前 AppShell 拆成聚焦的壳层组件；在独立 CSS 文件中增加令牌与共享页面样式，逐个页面 archetype 接入。以 `?ui=refresh` 选择新界面，默认继续使用现有 UI；主题背景偏好单独保存在本机 UI 设置中，不进入领域数据。

**Tech Stack:** React 19、TypeScript 5.7、React Router 7、Vue 3、Element Plus、CSS custom properties、Vite 6。

**Spec:** `docs/superpowers/specs/2026-09-20-full-site-ui-architecture-design.md`

## 当前续作记录（2026-09-20）

- 用户本地预览后指出实际界面与概念板仍有明显差距。此反馈优先于此前“视觉审阅完成”的记录：视觉收敛重新打开，不能据此宣称全站已获用户验收。
- 本轮按概念板修正了 Today 首屏顺序与空状态入口、真实的当天记录列表、快速记录的折叠关联选项；手机端回到底部四主入口，功能目录留在顶栏；压缩移动端数据源条，并放开 Capture/Future 长标题宽度。
- Today 最近记录从现有异步 Reality Repository 只读查询当天 action/record；空态不伪造示例数据，保存记录后刷新。移动首屏下快速记录保存按钮位于底栏上方。
- 本轮 Playwright + Chrome 复核 Today、Capture、Future 桌面截图及 Today 390px 视口：页面宽度 390px、四项底栏、功能目录可打开并由 Escape 关闭、快速记录选项可展开、无页面级错误。Capture/Future 标题均单行。`npm run build` 与 `git diff --check` 通过。
- 这些复核使用独立空数据浏览器上下文，所以 Today 显示真实空态；不代表用户自己的真实记录呈现或全路由最终视觉验收。共享样式修改后其余扩展路由还要再抽样核对，等待用户对当前本地预览反馈后继续。
- 用户已批准全站 UI 方向、分阶段实施和浅/深主题独立的自定义背景色。本计划是后续继续工作的入口。
- 实施基线为 `90ee9ed`；本地工作树另有本次 UI 调整，尚未提交或推送。不得执行远程写入。
- Task 1–3 已完成：页面/导航注册表、可回退的 `?ui=refresh`、主题背景偏好、拆分后的 React 桌面/移动壳层均已落地。
- Task 4–8 的实现已完成：共享令牌和页面原语、全站 archetype 样式、设置页外观区及 React 页面接入；背景色对比度、保存、切主题和恢复默认均已在隔离浏览器上下文验证。
- 浏览器审阅已覆盖 26 个 canonical 路由、8 个旧路径别名；390px 下路由均无页面级横向溢出。键盘打开/关闭功能目录、焦点返回、Ctrl+K 搜索及主题偏好刷新持久化已检查。
- 本次续作补查了 Future 四阶段、飞书任务/项目/周报/成员四表及任务看板/表格切换。Future 可完成本机隔离上下文中的保存闭环；飞书未配置 Worker，已检查连接错误/空态和视图切换，未能检查真实记录内容与写入。
- 720 CSS px 视口（代表 1440px 屏幕的 200% 缩放重排宽度）中，飞书和 Future 页面未出现页面级横向溢出。尚未在真实浏览器 UI 中改变缩放倍率，也未完成真实设备、读屏器和系统大字号验证。
- `npm run build` 在最近一次源代码改动后成功；仍有 VueUse Rollup 注释和大 bundle 警告。`git diff --check` 已通过。未运行自动化测试套件。
- CUA 调用因缺少 `@oai/cua/tinyskyAlt` 模块失败；本轮改用 Playwright + 本机 Chrome 完成上述浏览器审阅，没有未能打开的路由。
- 继续时从 Task 9 的真实浏览器缩放/辅助技术缺口和有实际飞书数据时的记录视图复核开始；OW-04 与 OW-21 仍保持开放。不要把这些未做的验证写成通过。

## Global Constraints

- 保留当前主入口名称、顺序和 URL：今天 `/app/today`、记录 `/app/capture`、处境 `/app/matters`、回顾 `/app/review`。
- 保留当前六个扩展分组、全部 canonical routes、动态详情、旧别名、认证边界、业务行为、数据模型、存储、导入导出和同步语义。
- 只将 `?ui=refresh` 用作临时视觉实验选择；不带参数时旧 UI 继续工作，移除参数即可回退；实验开关不写入业务数据或偏好存储。
- 自定义画布颜色在浅色和深色外观中分别保存为本机 UI 偏好；卡片、输入框、按钮、导航和状态色保持语义表面；普通文字对比度至少 4.5:1，大号文字至少 3:1。
- 新增外观设置位于现有 Vue 设置页标题后方、数据管理内容前方；仅增加 UI 偏好，不改变 Vue 设置页现有数据操作。
- 不添加或运行自动化测试套件；使用类型/生产构建检查、`git diff --check` 和人工页面/键盘/响应式审阅，不把静态检查当作 OW-04 实际设备验收。
- 页面文案保留已有产品文案；概念图中的记录、日期、姓名和数字不复制到页面。
- 不提交、不推送，也不操作远程 Git。由于当前沙箱把 `.git` 标为只读，不创建 branch 或 worktree。

---

## 文件职责地图

- `src/react/route-manifest.ts`：新增唯一的类型化页面、导航、标题、页面类型和兼容路由定义。
- `src/react/routes.tsx`：根据注册表生成受保护的 app 路由；仍显式处理登录、根路径和认证外壳。
- `src/react/navigation.ts`：从注册表导出当前菜单形状，兼容现有调用方，不再硬编码路径副本。
- `src/react/AppShell.tsx`：仅编排壳层状态、事件、路由元数据和共享弹层。
- `src/react/shell/`：新增桌面导航、顶栏、右栏、移动栏、功能目录和搜索的纯展示组件。
- `src/react/ui.tsx`：保留 Button 与焦点工具，增加小型通用页面组件，不引入第二套控件体系。
- `src/react/theme-preferences.ts`：新增背景偏好验证、对比度计算、读写和 CSS 令牌应用。
- `src/react/ui-refresh.css`：新增隔离的实验视觉令牌、壳层、页面类型和响应式规则；不重写 `react.css` 的旧规则。
- `src/react/main.tsx`：以 URL 查询参数标记实验版，并在全局样式之后加载实验样式。
- `src/views/AdminView.vue`：在设置标题下增加外观设置控件；保留原有设置区与 Element Plus 行为。
- `src/react/pages/`：按 archetype 将现有标题、表面、列表、空状态接入共享视觉层；页面专属业务状态和命令不迁入壳层。

## Task 1: 建立统一页面与导航注册表

**Files:**

- Create: `src/react/route-manifest.ts`
- Modify: `src/react/navigation.ts`
- Modify: `src/react/routes.tsx`
- Modify: `src/react/AppShell.tsx`

**Interfaces:**

- `AppPageId`：主页面与扩展页面的稳定 ID。
- `AppRouteViewKey`：现有 `AppRouteViews` 的 view keys。
- `AppPageDescriptor`：`{ id, path, viewKey, title, description, archetype, navGroup?, primaryKey?, shell: 'app' | 'standalone', lazyLabel? }`。
- `AppRouteAlias`：`{ path, redirectTo }` 或显式 `viewKey`，供旧入口和动态兼容页使用。
- `getPageForPath(pathname: string): AppPageDescriptor | undefined`：使用 React Router 的 `matchPath` 做精确路由匹配并返回页面元数据。
- `primaryNavigation` 和 `featureNavigationGroups`：从 descriptor 的 `primaryKey` / `navGroup` 生成，保留 `navigation.ts` 现有导出形状。

- [x] **Step 1: 把当前可见页面和路径写入注册表。** 按 `/app/today`、`capture`、`matters`、`matters/:id`、`review`、`cycle`、`flow`、`profile`、`memory`、`future`、`calendar`、`people`、`library`、`graph`、`module/inbox`、`module/tasks`、`task-board`、`module/habits`、`module/finance`、`module/goals`、`module/pomo`、`module/diary`、`module/posts`、`feishu`、`admin`、`admin/advanced` 和独立 `/scene` 建立 descriptor；标题和说明从当前页面/`AppShell.tsx` 迁移，用户可见主入口保持“今天/记录/处境/回顾”。
- [x] **Step 2: 将六个功能组和菜单路径改为派生数据。** `navigation.ts` 不保留另一份 path 清单；保留现有 ID、图标、中文标签、顺序和数组类型。
- [x] **Step 3: 将旧路径定义为兼容 alias。** 保持 `/app` index、`home`、`items`、`cases`、`cases/:id`、`module/chars`、`module/moments`、`module/:id`、`module/*`、未匹配路由、`/` 和认证重定向现有行为。
- [x] **Step 4: 让 `AppRoutes` 从注册表生成业务页 Route。** 保留外层 ProtectedRoute、AppShell 子路由边界和 `/scene` 的独立壳层；保留懒加载 fallback label。
- [x] **Step 5: 让 AppShell 按注册表查当前页。** 移除 `pathname.includes()` 链和重复的 `meta` 对象；动态事项详情仍标记“处境”，主菜单 `aria-current` 与右侧上下文跟随匹配项。
- [x] **Step 6: 做静态差异审阅。** 对照 `routes.tsx` 当前路径表逐项核对每个 descriptor、redirect 和 view key；仅运行 `git diff --check`，不执行自动化测试。

## Task 2: 建立主题背景偏好与无损回退开关

**Files:**

- Create: `src/react/theme-preferences.ts`
- Create: `src/react/ui-refresh.css`
- Modify: `src/react/main.tsx`

**Interfaces:**

- `ThemeMode = 'light' | 'dark'`。
- `BackgroundPreferences = Partial<Record<ThemeMode, string>>`，每个值是规范化 `#RRGGBB`。
- `BackgroundSaveResult = { ok: true } | { ok: false; reason: 'invalid-format' | 'insufficient-contrast' | 'storage-unavailable' }`。
- `CanvasTextPalette = { primary: string; secondary: string; muted: string }`。
- `getThemeMode(): ThemeMode`、`setThemeMode(mode: ThemeMode): void`，统一 `html.dark`、现有 `b_theme` 和当前主题的背景应用。
- `readBackgroundPreferences(): BackgroundPreferences`、`saveBackgroundColor(mode, color): BackgroundSaveResult`、`resetBackgroundColor(mode): boolean`、`applyBackgroundPreferences(mode): void`。
- `getContrastRatio(foreground, background): number`、`getCanvasTextPalette(background): CanvasTextPalette` 和 `isAccessibleCanvasColor(color): boolean`。

- [x] **Step 1: 添加十六进制色值和对比度工具。** 拒绝非 `#RRGGBB` 输入；使用 sRGB 相对亮度计算 WCAG 对比度；从黑/白中选对比更高的画布正文色，再逐级混合生成 secondary/muted 色，三者均需达到 4.5:1，确保大号文字也达到 3:1。
- [x] **Step 2: 实现按主题隔离的本机偏好。** 使用一个版本化 localStorage UI key 保存 light/dark 两个画布色；`saveBackgroundColor` 返回具体失败原因；所有读写捕获 storage 异常；任何异常时保留主题默认值、不影响启动和业务存储。
- [x] **Step 3: 应用及恢复 CSS 变量。** 将自定义值写为 `--calmy-page-canvas`；启动时在初始化 light/dark class 后读取并应用对应值；恢复只清除所选主题值并还原主题默认。背景值不写入 IndexedDB、业务 export 或同步。
- [x] **Step 4: 只用查询参数启用设计实验。** 在 `main.tsx` 读取 `?ui=refresh`，有值时在 `document.documentElement` 上设置 `ui-refresh`，无值时移除；不写入 localStorage、不修改 hash 路由。
- [x] **Step 5: 创建隔离样式入口。** 新的 `ui-refresh.css` 以 `html.ui-refresh` 限定重设计样式；画布 token 对默认和实验界面均生效；`react.css` 保持原样以便 `?ui=refresh` 移除时回退。
- [x] **Step 6: 运行 `npm run build` 检查 TypeScript/Vue 编译。** 如编译失败，修正本任务引入的问题；不运行任何 test 脚本。

## Task 3: 拆分应用壳层组件

**Files:**

- Create: `src/react/shell/DesktopPrimaryNav.tsx`
- Create: `src/react/shell/PageTopBar.tsx`
- Create: `src/react/shell/ContextRail.tsx`
- Create: `src/react/shell/MobileHeader.tsx`
- Create: `src/react/shell/MobilePrimaryNav.tsx`
- Create: `src/react/shell/FeatureDirectoryDialog.tsx`
- Create: `src/react/shell/GlobalSearchDialog.tsx`
- Modify: `src/react/AppShell.tsx`
- Modify: `src/react/ui-refresh.css`

**Interfaces:**

- 展示组件只通过 typed props 接收 `activePage`, `items`, `onNavigate`, `onSearch`, `onOpenDirectory`, `onToggleTheme` 等状态和回调。
- 搜索继续调用 `searchAllAsync(query, 8)`；drawer 和 search 共用现有 `FOCUSABLE_SELECTOR`、`trapFocus` 与 focus-return 约定。

- [x] **Step 1: 抽出 DesktopPrimaryNav 与 PageTopBar。** 保留按钮 label、当前页语义、收起状态、快捷搜索键和保存状态播报；AppShell 持有状态与导航动作。
- [x] **Step 2: 抽出 ContextRail。** 由页面 metadata 与当前主入口推导上下文和已有快捷动作；保留折叠偏好及宽屏条件。
- [x] **Step 3: 抽出 MobileHeader 与 MobilePrimaryNav。** 保留搜索、功能目录和四个主入口；保留安全区 padding 与 44px 最小触控目标。
- [x] **Step 4: 抽出 FeatureDirectoryDialog。** 从派生的 feature group 渲染菜单；保留 `role=dialog`、Escape 关闭、focus trap、恢复触发器焦点、主题切换。
- [x] **Step 5: 抽出 GlobalSearchDialog。** 保留搜索空态、错误/加载语义、结果路由和关闭时焦点返回。
- [x] **Step 6: 收敛 AppShell。** 它只装配 shell、管理全局事件/状态并将 props 传给展示组件；核对 Ctrl/⌘+K、Ctrl/⌘+B、resize、toast、save event。

## Task 4: 建立共用页面组件与样式令牌

**Files:**

- Modify: `src/react/ui.tsx`
- Modify: `src/react/ui-refresh.css`
- Modify: `src/styles/main.css`

**Interfaces:**

- `PageHead` 保持现有 props，并新增可选 `className?: string` 和 `id?: string`。
- 新增 `PageSection({ title, description?, action?, children, className? })`、`Surface({ as?, className?, children })`、`EmptyState({ title?, description, action?, className? })`、`StatusMessage({ kind, children })`；只负责语义结构和共享 class。
- 保持现有 `Button` API 不变。

- [x] **Step 1: 在独立 CSS 文件定义 light/dark 语义令牌。** 包含 canvas、raised surface、muted surface、文字层级、边框、焦点环、间距、内容宽度、层级和动效；场景强调色继续由 `applySceneTheme` 设置。
- [x] **Step 2: 让 `PageHead` 兼容旧页面并支持扩展 class/id。** 不改变现有标题内容或默认 DOM 层级。
- [x] **Step 3: 创建 PageSection、Surface、EmptyState 和 StatusMessage。** EmptyState 保留空态具体文案；StatusMessage 给出正确的角色和 live 属性，不重复播报已经由页面负责的状态。
- [x] **Step 4: 接入 `prefers-reduced-motion` 和键盘 focus-visible。** 保持至少 44px 的交互尺寸，避免只有颜色表达当前状态。
- [x] **Step 5: 手工比对概念板中的页面标题、卡片、列表行、空状态、主次按钮和状态反馈。** 已对照三张概念板并浏览 Today、Future、设置等实际页面；没有把概念板记录或日期写入页面。

## Task 5: 迁移四个主入口页面

**Files:**

- Modify: `src/react/pages/TodayPage.tsx`
- Modify: `src/react/pages/today/TodayNowPanel.tsx`
- Modify: `src/react/pages/CapturePage.tsx`
- Modify: `src/react/pages/CaptureSections.tsx`
- Modify: `src/react/pages/MattersPage.tsx`
- Modify: `src/react/pages/MatterDetailPage.tsx`
- Modify: `src/react/pages/ReviewPage.tsx`
- Modify: `src/react/ui-refresh.css`

- [x] **Step 1: Today 接入共享页面标题、卡片表面和页面 archetype 样式。** 保留现有行动排序、身体状态、记录、主动放下、Explore/Review 跳转和数据保存。
- [x] **Step 2: Capture 与 CaptureSections 接入共享输入表面、历史列表行和空态样式。** 保留原文优先、来源/标签、保存快捷键、接受/放下操作和历史语义。
- [x] **Step 3: Matters 与 MatterDetail 使用统一页面/卡片样式。** 保留查询、创建、关联、异步读取与现有 URL。
- [x] **Step 4: Review 使用统一时间范围、事实列表、来源行和状态表面样式。** 保留现有跨域证据、结束/放下、复盘表单和反馈语义；不得把计数增强为用户价值分数。
- [x] **Step 5: 在桌面和 390px 窄屏核对四页路由呈现及主要页面结构。** 全路由加载、导航、内容宽度和横向溢出已检查；未穷举每个业务动作组合，也未运行自动化测试。

## Task 6: 迁移工作、行动和时间类扩展

**Files:**

- Modify: `src/react/pages/TaskBoardPage.tsx`
- Modify: `src/react/pages/TasksPage.tsx`
- Modify: `src/react/pages/GoalsPage.tsx`
- Modify: `src/react/pages/CyclePage.tsx`
- Modify: `src/react/pages/CalendarPage.tsx`
- Modify: `src/react/FeishuWorkspaceViews.tsx`
- Modify: `src/react/feishu-workspace.tsx`
- Modify: `src/react/ui-refresh.css`

- [x] **Step 1: 看板与任务列表统一标题、工具条、卡片/列表行及空态样式。** 保留 Action 状态机、全部既有筛选、拖动、键盘/触控状态选择和 revision 写入。
- [x] **Step 2: Goals 与 Cycle 统一页面标题、证据区、时间/阶段信息和状态提示样式。** 保留现有目标证据、周期和只读空态，不增加连续天数或虚假达成度。
- [x] **Step 3: Calendar 统一时间选择器、选中日、事件行和证据区样式。** 保留原有时间格、查询、日期操作和写入行为。
- [x] **Step 4: Feishu 页面及 workspace 子视图统一来源说明、数据表切换、记录卡片、看板和连接错误表面。** 已检查无 Worker 配置的错误/空态和四表、看板/表格切换；未连接真实数据，记录密集状态待实际配置后复核。保留只读缓存边界、权限、Worker 地址和飞书外部数据写入行为。
- [x] **Step 5: 窄屏检查看板、日历、飞书表格/看板。** 390px 下全页无水平溢出，飞书表格仅在自身容器内按设计横向滚动；任务看板自适应列数。

## Task 7: 迁移内容、关系和个人工具扩展

**Files:**

- Modify: `src/react/pages/InboxPage.tsx`
- Modify: `src/react/pages/LibraryPage.tsx`
- Modify: `src/react/pages/FlowPage.tsx`
- Modify: `src/react/pages/DiaryPage.tsx`
- Modify: `src/react/pages/PostsPage.tsx`
- Modify: `src/react/pages/PeoplePage.tsx`
- Modify: `src/react/pages/GraphPage.tsx`
- Modify: `src/react/pages/MemoryPage.tsx`
- Modify: `src/react/pages/ProfilePage.tsx`
- Modify: `src/react/pages/FinancePage.tsx`
- Modify: `src/react/pages/HabitsPage.tsx`
- Modify: `src/react/pages/PomoPage.tsx`
- Modify: `src/react/ui-refresh.css`

- [x] **Step 1: 收集、资料、探索、日记与文章接入共享页面/内容表面和空态样式。** 保留 Flow 的明确意图、批次范围、自然退出和现实出口；不复制资产/内容数据。
- [x] **Step 2: 人物、图谱与记忆统一证据来源、详情层次和空态样式。** 保留来源链路、AI 推断的待确认/可否认/可删除状态和现有删除能力。
- [x] **Step 3: 我的页面统一摘要和分组表面。** 不在用户体验确认前移动或删除其现有内容/模块入口。
- [x] **Step 4: 财务、习惯、专注统一各自的输入、列表、状态反馈和窄屏样式。** 保留 Finance 和 Pomo 数据边界、撤销/保存语义，不新增评分或强制打卡。
- [ ] **Step 5: 逐项对照全部页面现有 actions 与空/加载/错误状态清单。** 本轮仅浏览了路由级呈现和实际可达的空/错误状态；真实数据依赖状态及全部操作组合尚未穷举。不改 Repository 或领域状态机。

## Task 8: 迁移试验页面和 Vue 设置宿主

**Files:**

- Modify: `src/react/pages/FuturePage.tsx`
- Modify: `src/react/pages/future-lookback/ScenarioPathCard.tsx`
- Modify: `src/react/pages/future-lookback/ReflectionStage.tsx`
- Modify: `src/react/pages/future-lookback/SavedStage.tsx`
- Modify: `src/react/pages/ScenePage.tsx`
- Modify: `src/views/AdminView.vue`
- Modify: `src/react/theme-preferences.ts`
- Modify: `src/react/ui-refresh.css`

- [x] **Step 1: Future 使用共享页面表面、可能路径双列、来源/不确定性提示和确认动作。** 保留行动/不行动、后悔/庆幸两侧对称、依据展示和用户确认；不把概念板占位文案写入真实数据。
- [x] **Step 2: Scene 页共享背景/标题/按钮/焦点令牌。** 保留场景选择、现有保存错误、开始后跳转和独立页面外壳。
- [x] **Step 3: 为 Vue 设置宿主增加外观区。** 放在 `AdminView.vue` 标题下、数据管理区前；含浅/深主题选择、原生颜色输入、可访问的 hex 输入、预设色、实时预览、应用与恢复默认。
- [x] **Step 4: 颜色应用前验证 active theme 正文色的对比度。** 保存有效色并调用 `applyBackgroundPreferences()`；无效时不写入、不改变当前 canvas，显示可读且可播报的错误；storage 不可用时显示保存失败状态。
- [x] **Step 5: 浅/深主题分别保存值；切换主题时应用各自背景。** AppShell 和 Vue 设置页均调用 `setThemeMode(mode)`；通过 `calmy-theme-mode-change` 事件同步 AppShell 的切换按钮状态；场景色改变只更新 accent，不覆盖用户画布颜色；恢复默认只影响当前主题背景。
- [x] **Step 6: 手工检查 Vue/React 样式边界。** 已检查外观区、Element Plus 控件和 React 页面表面；原设置数据操作未改动。

## Task 9: 完成全路由视觉收敛与交付检查

**Files:**

- Modify: `src/react/ui-refresh.css`
- Modify: any affected page/shell component identified during review
- Reference: three accepted concept files under `docs/product/assets/`

- [x] **Step 1: 启动 Vite 并打开 `/?ui=refresh#/app/today`。** 已验证默认 URL 不带 `?ui=refresh` 时实验样式关闭，移除参数即可回退。
- [x] **Step 2: 人工浏览所有注册表页面。** 覆盖 26 个 canonical 页面、Future 四阶段、Feishu 四表及任务两种视图、设置/高级设置、`/scene` 和 8 个兼容/redirect 路径。Feishu 没有 Worker 配置，数据行与写入状态未能审阅。
- [x] **Step 3: 桌面检查。** 已检查活动导航/标题、右栏折叠、扩展目录、全局搜索、主题切换、背景偏好和场景 accent。
- [ ] **Step 4: 手机与放大检查。** 390px 路由检查通过；720 CSS px（1440px 屏幕 200% 缩放对应宽度）重排未见页面级横向溢出。尚未实际改变浏览器缩放倍率、验证放大后的物理字号或真实设备。
- [x] **Step 5: 背景颜色检查。** 浅、深主题分别保存并在刷新/切换后保留；低对比色被拒绝且旧色仍生效；恢复默认只还原当前主题画布。
- [x] **Step 6: 概念对照与视觉修正。** 对照三张概念板检查导航层级、主题色、页面边距、主次操作、面板密度和移动布局；未将生成占位内容混入用户数据。
- [x] **Step 7: 运行 `npm run build` 和 `git diff --check`。** 最近一次源代码改动后 `npm run build` 通过；本次文档更新后 `git diff --check` 通过。不运行 `npm test`、e2e、PWA 或同步测试。
- [x] **Step 8: 汇报受限验证项。** CUA 因 `@oai/cua/tinyskyAlt` 缺失不可用；改由 Playwright + Chrome 浏览全部上述路由。真实浏览器缩放、设备/读屏验收和真实 Feishu 数据视图仍未确认；不关闭 OW-04/OW-21。

## Spec Coverage Self-Review

- 路由单一元数据、兼容与旧路径：Task 1。
- 桌面/手机共享壳层、抽屉、搜索、焦点：Task 3。
- 语义令牌、共用组件、可回退实验：Tasks 2 和 4。
- 四个核心入口与所有扩展模块 archetypes：Tasks 5–8。
- 独立场景、Vue 设置、自定义背景、可读对比和本机保存：Task 8。
- 桌面、窄屏、移动、深浅主题、空/加载/错误/保存状态与概念对照：Task 9。
- 真实设备/读屏器验证仍独立开放：Task 9 Step 8；不宣称 OW-04/OW-21 完成。
