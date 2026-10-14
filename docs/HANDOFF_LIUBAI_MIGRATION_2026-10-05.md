# 交接：把 Calmy 前端统一改成「留白 · 个人管理」（参考稿 v11）

> 交接时间：2026-10-05（第 33 轮整理）· 目标：`goal-83bff706-20ed-4b53-916e-182af337e6bd`
> 本文件在每一轮迁移后更新，用于在新会话里无损接续。

---

## 交付状态（2026-10-05 整理 · 设计仍在初步阶段，剩余清理按"不必做完"处理）

**已完成：目标第 ①②③④ 步全部完成，收尾清单 ①②③④ 也已完成，只剩 ⑤（可选）。**

| 项 | 状态 | 证据 |
|---|---|---|
| ① CSS 删层回归验证 | ✅ | 删掉 5 个死 CSS/旧壳后全页截图巡检无回归 |
| ② 权限修复 + 僵尸文件 | ✅ | `src/views/*`、`KongPage`、16 个旧壳组件、5 个死 CSS 已从磁盘删除 |
| ③ 逐页 v11 重写（30 个入口） | ✅ | 全部使用同一外壳 / `.slide-head` / `.panel` / `.chip` / `.seg` / 留白令牌 |
| ④ 删三份兼容层 + HUD 对齐 | ✅ | `liubai-bridge.css`/`liubai-compat.css` 删除，活规则并入唯一应用层；HUD 钩子与参考稿逐条核对 |
| 收尾① 孤儿逻辑模块 | ✅ | `router/navigation.ts`、`router/workspace-tabs.ts`、`ui/reference-presentation.ts` + 测试已删 |
| 收尾② `controls.css` 死作用域 | ✅ | 16 条 `html.tactile-ui` 规则删除（71→56 条），6 个 CSS 契约测试改指实际生效规则 |
| 收尾③ 外壳 `.page-head` 探针 | ✅ | 探针删除，飞书分支头部统一成 `.slide-head`（并修掉一处双标题） |
| 收尾④ 旧页面/旧测试清理 | ✅ | 9 个模块的旧页面删除、测试改测 `Liubai*`（页面文件 47 → 37） |
| 收尾⑤ 历史组件改 v11 词汇 → 退役旧全局层 | 🔶 仅做了 `FeishuTaskBoard`（12 处），其余未做 | 旧全局层仍在（`main.css`/`app.css`/`product-ui.css`/`controls.css`/feishu 两份） |

**当前样式架构（两层来源 + 页面层）**：
1. `src/styles/liubai/liubai-v11.css` —— 设计层，参考稿原样，**永不修改**
2. `<页面>.vue` 的 `<style scoped>` —— 页面层
3. `src/styles/liubai/liubai-app.css` —— 应用层（唯一）：外壳微调 + 旧类名 → 留白令牌 + 未挂外壳路由的放宽 + Element Plus 令牌

**验证口径（每轮都跑）**：`node tmp/liubai-shot.mjs`（CDP 真浏览器截图 + DOM 断言）
+ `npx vue-tsc --noEmit`（只剩历史遗留的 `vault-sync.ts:189`）+ `npx vitest run`（**126 文件 / 794 用例全绿**）。

**已知仍待产品决策**（不影响现有数据，详见 §4.2）：
- 两处"读得到、写不进"：`daily_state`（每日身体状态）、capture suggestion（AI 建议）——唯一写入方都是已删的旧页面；
- 若干旧交互没搬：处境的「飞书项目视图」、回顾的「7/30/90 证据浏览器」、日记的历史搜索框等。

> **2026-10-05 收工决定**：产品负责人表示「设计还在初步，没必要全部改完」，因此**收尾⑤（把历史组件改 v11 词汇、
> 退役旧全局样式层）不再推进**；上面"待产品决策"两项也保持原样，不做猜测性实现。
> 当前状态是一个**干净、全绿、可交付**的停点：四步目标全部完成、收尾 ①②③④ 完成、
> `126 文件 / 794 用例全绿`、`vue-tsc` 仅剩历史遗留的 `vault-sync.ts:189`、截图巡检无异常。
> 若日后设计定稿再继续，从这里接：先做收尾⑤，再处理上面两项数据缺口。

---

## 侧边栏重做（2026-10-12 第 34–35 轮 · 定稿）

**为什么要重做**：应用层里的侧边栏 CSS 是**四代覆盖叠在一起**的（约 490 行、大片 `!important` 互相打架），
最后压成 60px 图标窄轨：分组标题 9px 折成两行、条目全折叠、没有选中态、还压住左上角品牌。
34 个模块只给图标 = 用户找不到；展开成常驻 248px 又白占一条空白带。

**依据（先查规范，不凭感觉配色/定形）**：
- [NN/g《Left-Side Vertical Navigation on Desktop》](https://www.nngroup.com/articles/vertical-nav/)：
  宽而长的一级导航就该用左侧竖排；条目必须**左对齐**（居中会破坏竖排扫描，Sunglass Hut 就是反例）；
  **不要把桌面导航藏起来**——"导航一藏起来，用户就忘了去看"。
- [GitLab Pajamas《Navigation sidebar》](https://design-gitlab-com-gitlab-org-gitlab-services-f6beaf2fb7fd4cad76.gitlab.io/review-mr-6247/patterns/navigation-sidebar/)：
  两层结构（一级 = 图标 + 分组，二级 = 条目，不做第三层）；**≥1200px 默认常驻可见**；
  ≤1199px 默认隐藏，但用**半透明遮罩浮层**唤出、可锁定；用户偏好持久化；条目名 1–2 个词。

**定稿形态**：

| 断点 | 形态 |
|---|---|
| ≥1101px | **常驻 252px 侧边栏**：品牌 + 9 个分组 + 34 条"图标 + 文字"条目 + 底部动作；内容整体右移（slide 内边距 252px），不遮挡 |
| ≤1100px | **默认隐藏**；⌘K / 左边缘「模块」把手唤出 → 300px 浮层 + 半透明遮罩（点遮罩或 Esc 关闭），**不推挤内容** |
| 收起（`body:not(.nav-show)`） | 整条滑出屏幕 + 把手召回。**不再有"只给图标"的窄轨** |

- **一律带文字**：不存在需要猜图标的状态；左对齐（NN/g）。
- **语言全部取设计层令牌**，不自创：浮面 `--panel` + 1px `--line`；分组标签同 `.eyebrow`（.68rem / muted / .1em）；
  条目同 `.palette-item`/`.dm-item`（gap 10 / radius 9 / muted → hover `--hover` → 当前 `--accent`）；
  分组之间 1px `--line` 分隔（同 `.settings-panel` 的段落感）；当前项 = accent 文字 + 10% accent 底。
- 交互：⌘K 开合；Esc 关闭；遮罩点击关闭；窄屏选中模块后自动收起（桌面保持，方便连续切换）；
  偏好写入 `liubai-nav-open`。
- 钩子名全部保留（`nav.dots` / `.dot.active` / `.dot-group-title` / `.desk-nav-head` / `.desk-nav-close` /
  `.desk-nav-actions button` / `.module-nav-handle` ），新增 `.nav-scrim`；外壳测试 **8/8** 通过。
- 分组折叠从"手风琴·同时只开一个"改成**多分组独立折叠、默认全展开**（34 个模块下更好找），当前模块所在分组始终展开。

**顺带修掉的三处旧账**：
1. 外壳把 `⌘K`/把手/关闭都接到 `nav-hidden` 上，与"一个开关"的模型和外壳测试都不符 → 统一操作 `nav-show`；
2. `controls.css` 之外，`liubai-app.css` 里还留着一段**更早的 `@media (max-width: 680px)` 移动端导航**
   （`left/right:12px` + `max-height:min(58dvh,480px)` + `radius 12`）——窄屏量到"366×480 浮卡"就是它；已删；
3. 参考稿窄屏给 `.dots` 写了 `transform: none !important`，收起动画必须同用 `!important` 才能滑出屏幕。

**证据**：截图 `160-nav-night`（常驻）/ `161-nav-paper`（浅色）/ `162-nav-rail-night`（收起后滑出 + 把手）/
`163-nav-mobile-closed` / `164-nav-mobile-open`；探针 `nav expanded|rail|mobile`：
252px 常驻 · 34/34 条目标签 · 条目高 32 · 收起 x=-252（窄屏 -300）· 窄屏唤出时 `scrim visible`。

> 注意：本轮同时发现的 13 条**既存失败**（`vue-people-parity` / `vue-finance-parity` / `vue-calendar-parity` /
> `vue-auth-settings-parity` / `capture-text` / `domain-module-catalog`）来自**今天 09:28–16:37 的另一轮改造**
> （新增 `CalmyField`/`CalmyInput`/`CalmyNativeSelect`/`CalmyButton` 等表单组件、重写若干页面、新增路由），
> 与侧边栏无关，尚未处理。

### 美化（第 36 轮，同一处实现）

- **品牌统一**：面板头改成与外壳浮标同一套 `◆ Calmy`（去掉原来那块饱和的强调色方块），全站品牌只剩一种写法。
- **底部动作去框 + 吸底**：三行从"三个描边方块"改成 `.dm-item` 那样的无框行；首行常显 `搜索或跳转… ⌘K`，
  并用 `position: sticky` 吸底——34 条模块也不会把搜索入口挤出屏幕；上方加 18px 渐隐，避免硬切滚动中的条目，
  再用一个等高的滚动占位保证最后一条能完全滚出来。
- **节奏**：面板内边距 14 → 16/12px；分组之间 6 → 12px（分隔线降到 78% 不透明度）；条目 32 → 30px、圆角 9 → 8px；
  分组标签 .68 → .7rem、字距 .1 → .06em（中文更稳）；折叠箭头平时 `opacity:.5`。
- **状态**：选中 = accent 文字 + 8% accent 底 + `font-weight:500`（更克制）；hover 仍用 `--hover`。
- **显式左对齐**：参考稿桌面是 `align-items:flex-end`、窄屏是 `center`，会把内容顶到一侧/中间——
  应用层显式声明 `align-items: stretch`（基座/分组/窄屏三处），保证两级条目左对齐（NN/g 的要求）。
- **窄屏浮层**：`--panel` 94% 透明 + `backdrop-filter: blur(18px) saturate(125%)`，内容透出但不影响读字。

> 规模变化：应用层从 **1808 行 / 278 条规则**（四代叠加）降到 **857 行 / 124 条规则**（单一来源）。

---

## 今天页重做（2026-10-14 第 38 轮 · 参考稿布局）

用户给了新版参考图（顶部标题栏 + 四项指标条 + 通栏添加 + 左「今日计划」+ 右「专注概览/接下来/最近完成」），
要求**只做页面**、卡片与背景沿用 Image2 令牌。改动只落在 `src/vue/pages/LiubaiToday.vue`：

| 区块 | 内容 | 真实数据来源 |
|---|---|---|
| 顶部 | `今天` + 日期 + **`今天 ▾` 药丸**（复用 `LbDateNav`）+ `✓ 复盘今日` 主按钮 | — |
| 指标条 | 计划 / 已完成 / **今日专注** / 重点 | `actions` · `focusEntries(records)` · `TodayPlan.focusActionIds` |
| 通栏添加 | 输入 + 关联处境下拉 + `+` | `addTask`（`ActionItem` + `TodayPlan`） |
| 今日计划 | 行 = 标题（点击设为重点）+ 处境标签 + 完成；`≡ 重点优先/按状态` **真实排序**；已完成汇总一行 | `actions` · `plans` · `matters` |
| 今日时间线 | 记录 + 专注 + 完成按真实时间戳排列 | `records.occurredAt`（专注＝`[番茄钟]` 前缀记录）· 完成用 `action.updatedAt` |
| 当日数据 | 完成率环 + 完成率/待办/习惯/收集箱 | `actions` · `habits` · `inbox` |
| 习惯打卡 | 本周点阵 + **内联打卡** | `habits.dates` · `toggleHabit` |
| 收集箱 | 最近 2 条 + 全部 N 条入口 | `inbox` |

**参考稿里有、Calmy 无来源的字段一律不做**：剩余估算时长 → 换「重点 N 项」；计划时刻表/时长 → 换关联处境与
「重点优先/按状态」；优先级 → 用 `focusActionIds`；每日专注目标 → 环改成计划完成率；「休息次数」→ 无来源。
空态改为三块都在、各带可操作文案（此前无数据时整页只剩一个面板 + 大片空白）。

**验证**：`vue-today-parity` **4/4**（新增含处境、完成、点标题设重点、渲染）；`vue-tsc` 仅剩历史遗留 `vault-sync.ts:189`。
同步更新了测试里的旧钩子（当日重点→今日计划、`aria-label` 改为「添加今天要做的事」/「行动关联处境」、行内元素改为
`.today-title`），行为覆盖不变。预览通道 `/#/liubai-preview` 只读（写入报 `storage-write-failed`），带数据的对照以单测为准。

## 0. 第 7–11 轮（2026-10-05）已完成

1. **CSS 删层回归验证做完**（上一轮被中断的那一步）：新增截图 `40-purge-today / 41-purge-capture / 42-purge-mobile`，
   已迁移页 DOM 断言全部通过（`heads:1`、`panels`、`stats:4`），手机 390px 正常，**无视觉回归**。
2. **僵尸文件全部删除**（原来因权限删不掉的）：5 个死 CSS、`KongPage.vue`、旧壳 16 个组件、`src/views/` 整个目录（17 个残留 view）。
   连带把只测旧壳的 2 个测试文件退役，新增 `src/__tests__/liubai-shell.test.ts`（7 个测试）守住统一外壳的公共契约。
   **测试从 3 文件 / 23 用例失败 → 127 文件 / 815 用例全绿。**
3. **设置页迁到 v11**：`src/views/AdminView.vue` → `src/vue/pages/AdminPage.vue`（逻辑原样，只重写模板与样式），
   `heads:1 / panels:7 / collapsible 5 块`，HUD 第 1 档收起 2 块（rank 3 的两块），深夜与纸白两套主题都正确。
4. **看板迁到 v11**：`TaskBoardPage.vue` 改为 `.slide-head` + 筛选面板 + **5 个状态列各是一个面板** + 统计/说明块，
   `panels:8`、五列同一排（`rowTops:1`、等宽 255px）、HUD 3 块第 1 档收起 2 块；`vue-task-board-parity` 7/7 通过。
5. **人物迁到 v11**：`PeoplePage.vue` 改为 `.slide-head` + 重要日期 / 新增人物 / 人物列表 / 人物统计四个面板，
   `heads:1`、`headTag:H2`、`panels:4`、HUD 3 块第 1 档收起 1 块；`vue-people-parity` 11/11、
   `vue-master-data-parity` 8/8（含 `embedded` 嵌入用例）通过。
6. **主数据迁到 v11**：`MasterDataPage.vue` 改为 `.slide-head`（标题随 tab 变）+ `.seg` tab 段 +
   「保存一句可复用的话」/「句子素材」两个面板 + 统计/说明块；`src/styles/modules/master-data.css` 重写为
   v11 令牌并删掉死规则。`heads:1`、`panels:4`；切到「人物」tab 时 `heads:1 / embedded:true`（嵌入页没有抢标题）；
   `vue-master-data-parity` 8/8 通过。
7. **现实情境迁到 v11**：`RealityScenesPage.vue` 改为 `.slide-head` + 开始一段情境 / 长期空间两个 collapsible 面板 +
   情境卡片用 `.panel`；`heads:1`、`ownHeads:1`、`panels:2`、HUD 2 块（都是 rank 2，第 1 档不收）；
   `vue-reality-scenes` 16/16、`vue-reality-scenes-real-repository` 2/2 通过。
8. **情境视图迁到 v11**：`RealityContextPage.vue` 改为 `.slide-head` + 筛选 collapsible 面板 + 概览/资料卡片用 `.panel`；
   `heads:1`、`ownHeads:1`、`panels:1`（空态时只有筛选面板）、`vue-reality-context` 13/13 通过。
9. **目标 / 财务迁到 v11**（小页面批量）：`GoalsPage.vue`、`FinancePage.vue` 都改为 `.slide-head` + 面板 + 统计卡；
   两页截图断言都是 `heads:1 / ownHeads:1 / panels:3 / stats:4`，`vue-goals-parity` 6/6、`vue-finance-parity` 5/5 通过。
10. **资料迁到 v11**：`LibraryPage.vue` 改为 `.slide-head` + 保存/附件两个 collapsible 面板 +
    资源/洞察与种子两个并排面板 + 资料统计；截图断言 `heads:1 / ownHeads:1 / panels:5 / gridSections:2`，
    `vue-library-parity` 13/13 通过。
11. **图谱迁到 v11**：`GraphPage.vue` 把模板里**所有内联 style**（旧 `--c-*` 令牌）清掉、收进 scoped CSS，
    结构改为 `.slide-head` + 添加关系/关系图谱两个 collapsible 面板 + 节点列表/关系清单两个并排面板；
    截图断言 `heads:1 / ownHeads:1 / panels:4`，并新增一条**内联旧令牌计数 = 0** 的自检；
    `vue-graph-parity` 10/10、`vue-graph-typed-relations` 4/4 通过。
12. **收集 / 文章迁到 v11**（小页面批量）：`InboxPage.vue`（收集原文/筛选/收件内容三个面板）、
    `PostsPage.vue`（写一篇文章/文章列表两个面板 + 阅读抽屉改 v11 令牌）；两页截图断言
    `heads:1 / ownHeads:1 / panels:3 与 2 / inlineLegacyTokens:0`，`vue-inbox-parity` 9/9、`vue-posts-parity` 13/13 通过。
13. **日程 / 场景迁到 v11**：`CalendarPage.vue`（slide-head + 月份面板 + 选中日面板 + 两个证据面板，
    并把整块非 scoped 旧令牌样式改成 scoped v11 样式）、`ScenePage.vue`（standalone 页，自带 v11 排版）；
    截图断言 `heads:1 / ownHeads:1 / panels:4 / cells:42 / inlineLegacyTokens:0`，
    `vue-calendar-parity` 7/7、`vue-scene-parity` 3/3、`components.test.ts` 2/2 通过。
14. **我的 / 记忆迁到 v11**（小页面批量）：`ProfilePage.vue`（slide-head + 身份/场景卡 + 关联人物面板 + 数据概览面板）、
    `MemoryPage.vue`（slide-head + 层级 tab + 列表面板 + 边界说明）；两页截图断言
    `heads:1 / ownHeads:1 / inlineLegacyTokens:0`（我的 `panels:4`、记忆 `panels:1`），
    `vue-profile-parity` 2/2、`vue-memory-parity` 5/5 通过。
15. **未来迁到 v11**：`FuturePage.vue`（四阶段同页；`page-head` → `slide-head future-page-head`，四张阶段卡改成 `.panel`，
    动作类保留 `future-primary/secondary/text-link` 钩子并叠加 v11 `.chip`，整块 scoped 样式换成 v11 令牌）；
    截图断言 `heads:1 / panels:1 / inlineLegacyTokens:0`，`vue-future-parity` 5/5 通过。
16. **探索迁到 v11**：`FlowPage.vue`（`page-head` → `slide-head`，意图/结束/批次卡改成 `.panel`，
    `src/styles/modules/flow.css` 整块重写为 v11 令牌并删掉两条死规则）；
    截图断言 `heads:1 / ownHeads:1 / panels:1 / inlineLegacyTokens:0`，`vue-flow-parity` 12/12 通过。
17. **飞书迁到 v11**：`FeishuPage.vue`（`page-head` → `slide-head`，错误/概览/编辑器/项目卡/记录卡/任务卡改成 `.panel`，
    数据表 tab 换 `.seg`，视图切换与动作按钮换 `.chip`，详情抽屉与表格补 scoped v11 样式）；
    截图断言 `heads:1 / panels:3 / inlineLegacyTokens:0`，`vue-feishu-parity` 7/7 通过。
18. **系统管理迁到 v11**：`SystemAdminPage.vue`（`page-head` → `slide-head`，账号/角色/安全/日志各卡改成 `.panel`，
    按钮换 `.chip`；**整块单行 scoped 样式用 pwsh 字面量替换**把旧令牌与浅色兜底换成 v11 令牌）；
    截图断言 `heads:1 / panels:1 / inlineLegacyTokens:0`。
19. **处境详情迁到 v11**：`MatterDetailPage.vue`（`page-head` → `slide-head` 且标题用 **h1**，状态/关联情境/问题驱动学习改成 `.panel`，
    加载/读取失败/找不到三个分支也统一成面板）；截图断言 `heads:1 / ownHeads:1 / headTag:H1 / panels:1 / inlineLegacyTokens:0`，
    `vue-matter-detail-parity` 11/11 通过。
20. **周期迁到 v11 —— 逐页迁移全部完成**：`CyclePage.vue`（`page-head` → `slide-head`，五行转盘/这一轮的课题/今日行动/阶段分布改成 `.panel`）；
    截图断言 `heads:1 / ownHeads:1 / panels:4 / inlineLegacyTokens:0`，`vue-cycle-parity` 6/6 + `vue-cycle-real-repository` 2/2 通过。
21. **修掉两个会影响所有页面的设计层缺陷**：
   - `.inner` 是固定高度 flex 列，子项默认 `flex-shrink:1`，内容比一屏高时面板被压扁、看起来互相重叠 →
     已在 `liubai-app.css` 加 `.stage .slide .inner > *:not(.grow){flex:none}`；
   - `.dim` 在参考稿里只调 `.ov-list` 圆点颜色，没有"弱化文字"语义 → 已在 `liubai-app.css` 补 `.dim{color:var(--muted)}`。
   另外注意 `.act` 在参考稿里是 **26×26 图标按钮**，带文字的按钮要用 `.chip` / `.detail-btn`。
22. **第 ④ 步·删层完成**：三份兼容层合并为一份并删除两份 —— `liubai-bridge.css`、`liubai-compat.css` **已删除**，
    活规则并入唯一的应用层 `liubai-app.css`（0 引用的 18 个类剔除）；`main.ts` 只剩
    `liubai-v11.css`（设计层）+ `liubai-app.css`（应用层）两条样式导入。
23. **HUD 规则对齐核查**：逐条对照参考稿 `applyHudToSlide`/`DEFAULT_HUD_RULES`，
    确认 `data-hud-rank` 1/2/3 与参考稿的三种名单 `[]`/`[2]`/`[1,2]` 等价，
    且外壳已具备参考稿的全部钩子（`data-level`/`aria-label`/`aria-pressed`/`data-hud`/`.hud-hidden`）→ **无需改动**。
24. **第 ④ 步·孤儿模块清理完成**：删除 `src/router/navigation.ts`（旧侧边栏分组表，只有自己的测试引用）、
    `src/router/workspace-tabs.ts` + `src/__tests__/workspace-tabs.test.ts`（旧壳的标签页状态，已无 UI 使用）、
    `src/ui/reference-presentation.ts`（**零引用**，连测试都没有）。
    `master-data-navigation.test.ts` 保留但改成只断言仍存活的 `appPageRegistry`（去掉对已删模块的断言）。
    结果：测试 **127 文件 / 815 用例 → 126 文件 / 809 用例**，全绿。
25. **第 ④ 步·看板飞书分支头部统一（并修掉一个已存在的双标题）**：
    `FeishuTaskBoard.vue` 的 `page-head` → `.slide-head` + `useOwnSlideHead()`；
    顺手发现 `TaskBoardPage.vue` 的 `.slide-head` 是**无条件渲染**的，而飞书分支的子组件又自带一个标题 →
    **飞书分支一直显示两个标题**（旧时一个是 `.page-head`，所以截图探针没抓到）。改为"页面头只在本地分支渲染"。
    之后删掉 `LiubaiShell.vue` 里的 `.page-head` DOM 探针（`hasLegacyHead`/`syncLegacyHead`）——
    `showShellHead` 现在只看 `pageOwnsHead`；应用层里那 5 条 `.page-head` 映射规则也一并删除
    （只保留收窄后的 `.panel-head h2` 排版规则）。
    另修 `FeishuTaskBoard` 的 `.feishu-page` 宽度上限（放进外壳后被挤成中间一窄列）。
    截图脚本新增常驻探针 + 截图 `146-board-feishu.png`：`heads:1 / headTag:H2 / legacyHead:false / shellHead:false`。
26. **第 ④ 步·收尾④ 进行中：把 8 个模块的 parity 测试改测 v11 页面，并删掉旧页面。**
    本轮（第 26–27 轮）完成 4 个模块 + 1 个无测试页面：

    | 模块 | 旧页面 | 处理 | 结果 |
    |---|---|---|---|
    | 注意力 | `PomoPage.vue` | 测试改成测 `LiubaiPomo` 的可观察行为（计时/开始结束/落库/记录列表） | 已删旧页面，3 用例 |
    | 总览 | `TodayPage.vue`（+ `FeishuToday.vue`） | **先补功能**：加回"快速新增行动（含关联处境 + 回车）"；测试改成测 v11 的读取/新增/完成/设重点 | 已删两个旧页面，4 用例 |
    | 习惯 | `HabitsPage.vue` | 测试改成测 v11 的新建/打卡/**修订历史**（含"旧习惯打卡不伪造创建事件"不变量） | 已删旧页面，3 用例 |
    | 任务 | `TasksPage.vue` | **先补功能**：加回"创建时选日期 + 关联处境"与行动卡片的「所属领域 / 上下文关联 / 归属与可见范围」三块编辑（复用 `DomainPicker`/`ContextRelationPicker`/`OwnershipEditor`）；测试覆盖 6 条 | 已删旧页面，6 用例 |
    | 用户管理 | `UserAdminPage.vue` | 无测试、无引用 | 直接删除 |
    | 记录 | `CapturePage.vue` | **先补功能**：加回「常用句插入」（旧页面有、迁移时漏掉；`vue-master-data-parity` 也在跨页验证它）；
      测试覆盖落库/插入选区/现在行动/形成事项/放下 5 条；`vue-master-data-parity` 的入口同时改指 `LiubaiCapture` | 已删旧页面，5 用例 |
    | 日记 | `DiaryPage.vue` | **先补功能**：把常用句插入抽成共享组件 `src/vue/components/SentencePicker.vue`（记录页与日记页共用）；
      测试覆盖当天正文/日期切换/自动保存修订历史/空白不落库/按选区插入恢复光标/历史列表 5 条 | 已删旧页面，5 用例 |
    | 回顾 | `ReviewPage.vue` | **先补功能（重要）**：核对发现迁移把**唯一的复盘写入路径 `completeReview` 漏掉了**
      （全仓库只有旧页面调用它）→ `TodayPlan.review` 变成"读得到、写不进"；已按旧页面语义补回「今日复盘」表单
      （四段反思 + 主动放下清单，仍走 `completeReview → todayAsyncRepository.update({review, letGo}, revision)`）；
      测试覆盖读取/保存（含 trim、letGo 数组、revision+1、toast）/按周专注柱聚合/只读指标面板 4 条 | 已删旧页面，4 用例 |

    | 处境 | `MattersPage.vue` | **先补功能**：补回「问题驱动」六字段（Matter 自己的字段）、每行的「趋势」选择器、生命周期筛选
      （进行中/已暂停/已归档）与"先写下处境名称"校验；测试覆盖筛选/创建（含六字段）/**暂停⇄恢复⇄归档**/
      趋势与状态相互独立/放进今天 5 条，全部用真实仓储 | 已删旧页面，5 用例 |

    页面文件从 47 个降到 **37** 个；测试 **127 文件 / 815 用例 → 126 文件 / 794 用例**，全绿。
    → **④ 全部完成：9/9 模块的旧页面已删，测试全部改测 v11 页面。**
    本轮核对出**第二条"没有写入方"的缺口**：旧页面保存记录时会顺带写一条 AI 建议
    （`status:'suggested'` + `listSuggestions()` 有记录），v11 的记录页只落原文（`status:'inbox'`），
    **建议链路目前没有写入方**。已在新测试里显式断言"没有建议"（不假装它还在），并记入 §4.2。
    `SentencePicker` 抽出来之后，两个页面共用一处实现（旧页面各自内联了一份），
    键盘交互支持 ↑/↓/Enter/Esc（旧页面那套 `aria-activedescendant` + 「浏览全部」抽屉没有搬，见 §4.2）。

27. **一个必须记录的系统性发现（关于"功能缺口"）**：v11 的这批复刻页面是**按参考稿的信息架构重写的展示型页面**，
    而旧页面是**就地全能型工作台**。所以"迁移完成"不等于"功能等价"——逐页核对时发现 v11 页面普遍少了：
    就地新建/编辑、筛选 tab、来源切换、以及行动/处境卡片上的领域·关联·归属编辑。
    本轮给「总览」「任务」把它们补回来了（组件本来就在仓库里，只是迁移时没接上）；其余模块的缺口见 §4.2。

28. **第 ④ 步·收尾② 完成：`controls.css` 的死作用域清掉了。**
    `html.tactile-ui …` 那批规则（该 class 运行期从不添加）共 **16 条**，全部删除（71 条 → 54 条，全部是活规则）。
    它们不只是死代码——内容还是**上一代设计**：写死了旧浅色（`#dce3ed` / `#f8fafc` / `--t-*` 令牌）与
    `background-image:none; appearance:auto`，而真正生效的是同文件里的全局规则
    `html :where(select:not([multiple]):not([size]):not(.matter-trajectory-select))`（自定义 chevron + `appearance:none` + `--calmy-control-*`）。
    连带把 **6 个**读这些死规则做"CSS 契约"断言的测试改成断言**实际生效**的那条全局规则
    （`vue-feishu/finance/graph/inbox/library-parity` 各一处，`vue-goals-parity` 的窄屏规则见下），
    并在断言里加了"不得再出现 `html.tactile-ui` 规则"的守卫。
    **顺手修掉一个真 bug**：`.goal-context-fields select` 的窄屏 `width:100%` 原本挂在死作用域下，
    等于一直没生效；现在改成生效版本（`@media (max-width:760px)`），`vue-goals-parity` 那条用例因此继续通过。
    删完后全量截图巡检：**没有任何页面的 `heads != 1`**，各页 `panels` 不变，日记几何稳定。

29. 工作区权限：本会话已切到 **完全权限（danger-full-access）**，`src/`、`docs/`、`tmp/` 不再受限，
   删除/移动/子目录创建都可用（之前那套 ACL 修复对受限低完整性令牌无效，原因见 §8.3）。

**当前进度：目标四步（①②③④）全部完成；收尾清单 ①②③④ 已做，只剩 ⑤（历史组件改 v11 词汇 → 退役旧全局层）。**
样式来源只剩「设计层 `liubai-v11.css` + 应用层 `liubai-app.css` + 页面 scoped」；路由侧 30 个入口全是 v11 骨架，
运行期已无任何页面渲染 `.page-head`；9 个未挂路由的旧页面已从磁盘删除，页面文件 47 → 37；
`controls.css` 里上一代的死作用域（16 条）已清掉，6 个 CSS 契约测试改指实际生效的规则。
**注意 §4.2 第 2 项的"展示型 vs 工作台"缺口**：迁移不等于功能等价——已补回 5 处真实能力，
仍有两处"读得到、写不进"（`daily_state` 与 capture suggestion）**需要产品决策**，
以及若干"旧交互没搬"（飞书项目视图、回顾的证据浏览器 7/30/90、日记的历史搜索等）。

**走查通道已经没有任何 legacy 页面**（原 `/legacy/*` 全部迁完并改到正式路径）。


---

## 1. 一句话现状

参考稿六个模块 + 应用两个主入口（记录 / 处境）共 **8 个页面已完整迁移**；**第 9 个「设置」也已迁移**
（`/app/admin`，v11 面板 + HUD 分层）；统一的「留白」外壳接管全站（`/app/*` 与 `/login`）；
**旧四层死 CSS 与旧双壳组件已从磁盘删除**；剩余 **23 个旧页面靠桥接层自动继承新设计层**（可读、同族），
但它们的**内部骨架（`.panel` / `.stat-grid` / `.collapsible`）仍是旧的**。


---

## 2. 目标（原文）

> 把 D:\dsharness（Calmy）的整个前端统一改成 `D:\Downloads\deepseek_html_20261004_d9813b (11).html` 的「留白 · 个人管理」设计：以该参考稿为唯一视觉与交互基准，建立单一设计层与统一外壳，替换现有四层 CSS 与双壳并存；所有路由（含 38 个页面）都使用同一套外壳、排版、色彩与面板语言，业务逻辑与 Repository 不改；每一批迁移后用真实浏览器截图对照验证。

新会话接续方式：`get_goal` 拿到 id 与 revision → `update_goal` action=`resume` 重新武装 → 继续按第 5 节推进。

---

## 3. 已完成（含验证证据）

### 3.1 参考稿已切分入仓

| 文件 | 内容 |
|---|---|
| `src/styles/liubai/liubai-v11.css` | 参考稿全部 CSS（1307 行 / 50KB），**原样保留，不要改** |
| `docs/reference/liubai-v11/shell-markup.html` | 外壳与六模块 DOM（494 行） |
| `docs/reference/liubai-v11/interactions.js` | 参考稿交互脚本（3221 行，仅作规格） |
| `docs/reference/liubai-v11/source.html` | 原稿存档（186KB） |

> 切分时注意过：PowerShell 默认编码会把 UTF-8 读成 GBK 导致中文全乱码；必须用 `[System.IO.File]::ReadAllLines($path, [System.Text.UTF8Encoding]::new($false))`，并按 `<style>`/`<body>`/`<script>` 结构定位切片，不要用固定行号（read 工具与 Get-Content 的行数不一致）。

### 3.2 统一外壳 `src/vue/shell/LiubaiShell.vue`

按参考稿实现：固定 UI（progress / brand / counter / tip / dots / gear / HUD 三档 / mode / zen / toast / tooltip）+ 两个弹层（settings / palette）+ `main.stage > section.slide.active > .inner`（唯一滚动区）+ `header.slide-head`。

行为规格全部照参考稿实测值：边缘 96px 触发导航、1.8s 自动收起、**560ms 切换锁**、滚轮到 `.inner` 边界才换模块、`H`/`⇧H`/`M`/`⇧Z`/`1–6`/`⌘K`/`Esc`、`[data-tip]` 气泡跟随、`body` 上挂 `data-theme`/`data-nav`/`nav-show`/`idle`/`mode-simple`/`zen-mode`。

另外承接了旧壳的全局通道（**旧壳删掉后如果不接，全站提示会静默消失**）：
- `beryl-toast` → 显示在 `.toast`
- `beryl-save-state` → 仅 `conflict`/`failed` 时提示（成功保存按参考稿风格不打扰）

路由：`/app`（全部子路由）与 `/login` 都用它；原 `AppShell.vue` 的双壳切换（ReferenceAppShell / LegacyAppShell）已不再被路由引用。

### 3.3 页面自带头部（避免双标题）

参考稿里每张 slide 的头部是**页面自己的**。外壳只在页面没有提供头部时才渲染自己的标题栏：
- 已迁移页面调用 `useOwnSlideHead()`（`src/vue/liubai/slide-head.ts`）
- 旧页面靠外壳的 DOM 探测（页面里有 `.page-head` 就让位）

### 3.4 v11 组件层 `src/vue/liubai/`

| 文件 | 作用 |
|---|---|
| `LbPanel.vue` | `.panel` + `.panel-head`（title/note） |
| `LbCollapsible.vue` | `.collapsible[data-block][data-hud-rank]`，HUD 分层的载体 |
| `LbStatGrid.vue` | `.stat-grid`，DOM 与参考稿 `renderStatGrid()` 一致 |
| `LbDateNav.vue` | 日期切换（`.date-nav` + `.date-menu`） |
| `date-state.ts` | 每模块一格日期 + `全部` + 同步 + 持久化（键 `liubai-dates`） |
| `focus.ts` | 解析 `[番茄钟] 完成专注 N 分钟` 记录（专注/复盘共用） |
| `types.ts` | `LbStat` 类型（`<script setup>` 不能导出接口，故放 .ts） |
| `slide-head.ts` | `pageOwnsHead` 标记 |

### 3.5 已迁移页面（第一批 8 个，全部接真实 Repository）

> 后续每轮又迁了 设置 / 看板 / 人物 / 主数据 / 现实情境 / 情境视图，见 §3.9–§3.14；此处是第一批。

| 路由 | 页面 | 数据来源 |
|---|---|---|
| `/app/today` | `LiubaiToday.vue` | `openToday()` / `useReferenceWorkspace` |
| `/app/module/tasks` | `LiubaiTasks.vue` | `ActionItem` + `TodayPlan.focusActionIds` |
| `/app/module/habits` | `LiubaiHabits.vue` | `habits` 集合的 `dates: string[]` |
| `/app/module/pomo` | `LiubaiPomo.vue` | 25 分钟一段 → `completeFocus()` 写记录 |
| `/app/module/diary` | `LiubaiDiary.vue` | `DiaryEntry`（一日期一条）+ 停笔 1.2s 自动保存 |
| `/app/review` | `LiubaiReview.vue` | 柱状图/指标/流向全部由专注记录聚合 |
| `/app/capture` | `LiubaiCapture.vue` | `decideCapture` 五路注意门（幂等 commandId） |
| `/app/matters` | `LiubaiMatters.vue` | `matterAsyncRepository` 状态机 + `addActionToToday` |

### 3.6 迁移期兼容层（三份 → **已合并为一份并删除两份**，2026-10-05 第 24 轮）

| 文件 | 作用 | 现状 |
|---|---|---|
| `liubai-app.css` | **应用层（唯一）**：外壳微调（日期位置、`hidden` 恢复、长页面不被压扁、`.dim`）+ 旧类名 → 留白令牌（表面/次级表面/表单/文字层级/按钮/表格/字体层级）+ 未挂外壳路由的滚动与间距 + `tactile-ui.css` 搬来的活规则 + Element Plus 令牌 | 保留（合并后 40 条规则；第 25 轮又删掉了 `.page-head` 那 5 条，只留收窄的 `.panel-head h2` 排版） |
| `liubai-bridge.css` | 桥接层（旧类名映射） | **已删除**，活规则并入 `liubai-app.css` |
| `liubai-compat.css` | 未挂外壳路由的放宽 + 旧全局层中和 | **已删除**，活规则并入 `liubai-app.css` |

合并时按"还有没有用例"逐类核对（`src/**/*.vue|ts` 里按词边界统计引用文件数），
0 引用的类直接剔除、不再搬运：`.card` `.setting-card` `.admin-section` `.cycle-widget` `.opening`
`.legacy-stage` `.stage-directory` `.stage-command` `.status-tabs` `.source-tabs` `.page-container`
`.beryl-button` `.add-tag` `.edit-input` `.edit-tag` `.dr-input` `.dr-select` `.day-input`。

**由此确定的最终样式架构（两层来源 + 页面层）**：
1. `liubai-v11.css` —— 设计层，参考稿原样，**永不修改**
2. `<页面>.vue` 的 `<style scoped>` —— 页面层
3. `liubai-app.css` —— 应用层（唯一的全局应用侧样式）

### 3.7 已验证的结论（截图 + 断言）

- 参考稿六模块 + 记录/处境：`heads:1`、`headTag` 分别为 `H1`（总览）/`H2`（其余），与参考稿一致
- HUD 第 1 档收起 1 个辅助块；简洁模式生效；深浅两套主题均正确
- 日期切换：与图标簇不重叠（`overlapsIcons:false`）、与标题底对齐（`alignedWithTitle:true`）、菜单项在未偏离时为 4 项
- 旧页面在**不播种主题**时默认 `theme:"night"` 且可读、`heads:0`（无重复标题）
- `vue-tsc --noEmit`：只剩既有的历史错误 `src/core/content/vault-sync.ts:189`，本轮改动零新增错误

### 3.8 统一外壳的测试（第 7 轮新增）

`src/__tests__/liubai-shell.test.ts`（7 用例）守的是外壳对**全部路由**的公共契约，取代了随旧壳一起删除的
`vue-shell-parity.test.ts`（15 用例）与 `vue-stage-shell.test.ts`（7 用例）：
六个模块导航与计数、边缘 96px 唤出与 1.8s 自动收起、设置面板（主题/导航位置/显示模式）与 localStorage 持久化、
HUD 按 `data-hud-rank` 分层（rank 1 永不出局）、`beryl-toast` 与 `beryl-save-state`（成功不打扰、失败要提示）、
页面自带头部时让位、命令面板（⌘K → 过滤 → 执行）。

### 3.9 设置页已迁移（第 7 轮）

| 路由 | 页面 | 结构 | 数据来源 |
|---|---|---|---|
| `/app/admin`、`/app/admin/advanced` | `AdminPage.vue` | `.slide-head` + 7 个 `.panel` + 5 个 `.collapsible[data-hud-rank]` | 原 `AdminView` 逻辑**一字未改**（备份/导入/重置/Vault/迁移） |

- HUD：`adminStats`(rank 3)、`adminSystem`(rank 3) 在第 1 档收起（截图断言 `hud1 hidden: 2`）；`adminScene`/`adminVaultSync`/`adminObsidian`/`adminMigration` 为 rank 2。
- 旧的「返回工作台」按钮已去掉：导航由统一外壳负责（dots / ⌘K / 数字键）。
- 「旧数据迁移」段落合进 `adminMigration` 面板，标题改为「历史数据迁移」。
- 走查通道从 `/legacy/admin` 移到 **`/liubai-preview/admin`**（它不再是 legacy 页面）。

### 3.10 看板已迁移（第 7 轮后半）

| 路由 | 页面 | 结构 | 数据来源 |
|---|---|---|---|
| `/app/task-board` | `TaskBoardPage.vue` | `.slide-head` + 筛选 `.panel` + **5 个状态列各是一个 `.panel`** + 统计/说明 collapsible | `actionAsyncRepository` / `matterAsyncRepository`（逻辑未改） |

- 截图断言：`heads:1`/`headTag:H2`、`panels:8`、五列 `widths:[255×5]`、`columnsMatchParent:true`、`rowTops:1`（确实是一排）、HUD 3 块第 1 档收起 2 块；深夜/纸白两套主题都正确。
- `vue-task-board-parity.test.ts` **7/7 通过**，因为保留了下述测试钩子：`.task-board-toolbar > .task-board-count`、`.task-board-column`（`.panel` 加在同一元素上）、`.task-board-card`、`.action-status`、`.task-drag-hint`、`[aria-label="任务范围"] [role="tab"]`、`[aria-label="按事项筛选"]`（原生 `<select>`）、`[aria-label="${title}状态"]`。
- **踩坑**：旧 `app.css` 的 `.task-board-column-head > span` 会把面板头的 `<span>` 变成 24px 圆形徽章、`.task-board-column-body` 带 350px 最小高度。类名不能改（测试按它们断言），所以在页面 scoped 样式里显式复位这些旧规则 —— **后面迁「人物 / 资料 / 目标」这类同样复用旧类名的页面时会再遇到，照这个办法处理**。
- 页面根部**不要**再包一层 `<div class="task-board-page">`：外壳的头部让位/间距逻辑按 `.inner` 的直接子元素工作，包一层会让 `.slide-head` 探测不到、面板之间也失去 `.inner > * + *` 间距。
- 数据来源条 `WorkspaceSourceBar.vue` **本轮没动**（仍是桥接层下的旧卡片外观）：`vue-feishu-parity.test.ts` 断言 `.workspace-source small` 的具体文案，改动它要连那一组测试一起改，留到统一清理时做。

### 3.11 人物已迁移（第 8 轮）

| 路由 | 页面 | 结构 | 数据来源 |
|---|---|---|---|
| `/app/people` | `PeoplePage.vue` | `.slide-head` + 人物重要日期 / 新增人物 / 人物列表 / 人物统计 四个 `.panel`（前两个 + 统计包 collapsible） | `unifiedAsyncRepository`（逻辑未改） |

- **`embedded` 双身份**：它被 `MasterDataPage` 以 `<PeoplePage embedded />` 复用。所以头部写成
  `v-if="!embedded"`，并且 **`useOwnSlideHead()` 只在 `!embedded` 时调用**——否则嵌在主数据页里会抢掉宿主的标题。
  `vue-people-parity` 与 `vue-master-data-parity` 都断言 `.people-page-embedded` 存在、`.page-head` 不存在。
- **保留了这些测试钩子**：`.people-page-embedded`、`.matter-card`（`h2` = 姓名）、`.matter-grid`、
  `.ownership-editor` / `.context-relation-picker`（来自子组件，未动）、两个 `<form>`、
  以及 `[aria-label]`：人物名称/人物角色/人物标签/人物备注/日期名称/重要日期相关人物/重要日期/重要日期类型/
  重要日期重复方式/搜索人物/人物账号关联/绑定此人物到当前账号/解除此人物与当前账号的绑定/日期归档|恢复 {id}。
- 这一页的根**仍然保留** `<div class="people-page">`（因为 `people-page-embedded` 要有个落点），
  代价是 `.slide-head` 不是 `.inner` 的直接子元素；所以用 scoped `.people-page{display:flex;flex-direction:column;gap:…}`
  自己补回面板间距。截图脚本的探针已相应改为同时报 `heads`（`.inner .slide-head` 总数，>1 即双标题）
  与 `ownHeads`（直接子元素），**用 `heads` 判断双标题，不要用 `ownHeads`**。
- 表单里的提交按钮用 `.chip`，grid 会把它拉满整行 → 加 `.matter-create > .chip{justify-self:start}`。

### 3.12 主数据已迁移（第 9 轮）

| 路由 | 页面 | 结构 | 数据来源 |
|---|---|---|---|
| `/app/master-data` | `MasterDataPage.vue` | `.slide-head`（标题随 tab 变）+ `.seg` tab 段 + 保存素材 / 句子素材两个面板 + 统计 / 说明块 | `unifiedAsyncRepository`（逻辑未改） |

- 它是 **tab 宿主**：`句子` 自带面板；`人物` 渲染 `<PeoplePage embedded />`；`系统字典` / `生活领域` 用现成子组件（未改）。
- **保留了这些测试钩子**：`[role="tab"]`（文案严格是 句子/人物/系统字典/生活领域）、`[role="status"]`（文案严格是「正在读取素材…」）、
  `[role="alert"]`、`.master-data-list`、`[aria-label="搜索句子素材"]`、**恰好一个 `<form>`**（句子 tab 上）、
  **恰好一个 `[type="checkbox"]`**（「显示已归档」；标签选项在无字典数据时为 0 个）、按钮文案 编辑/归档/恢复/重试，
  以及页面上必须仍然出现「主数据管理」五个字（`hint` 里保留）。
- `src/styles/modules/master-data.css` 已重写为 v11 令牌；它原来的「React 原生按钮基线」规则挂在
  `html.tactile-ui #app .page-container …` 上（该 class 运行期从不添加 = 死规则），已删除，
  `vue-master-data-parity` 的第 1 个用例改为断言新基线（无死作用域 + 动作用 `.chip`）。
- 页面**没有**再包 `<main class="master-data-page">`：`.slide-head` 直接作为 `.inner` 子元素（`ownHeads:1`）；
  旧 `.master-data-page` 容器样式随之删除。
- **新增走查路由** `/liubai-preview/master-data`；截图 `80/81/82` 覆盖深夜、人物 tab（验证 embedded 不抢标题）、纸白。

### 3.13 现实情境已迁移（第 10 轮）

| 路由 | 页面 | 结构 | 数据来源 |
|---|---|---|---|
| `/app/reality-scenes` | `RealityScenesPage.vue` | `.slide-head` + 开始一段情境 / 长期空间两个 collapsible 面板 + 情境卡片（`.scene-card.panel`） | `unifiedAsyncRepository` / `matterAsyncRepository`（逻辑未改） |

- 保留了 parity 测试的全部钩子：`.space-create`（表单）、`.space-row`（空间行，同时也是 `.panel`）、
  `.scene-card`（`h2` = 情境名、`.ownership-editor`、按钮按文案找）、`.participant-list`，
  以及 `[aria-label]`：情境名称 / 关联的事情（可选）/ 长期空间（可选）/ 创建情境 / 空间名称 / 空间用途 /
  空间边界说明 / 新空间成员 / 管理空间成员 {title} / 上移|下移|完成|关闭空间|恢复空间 {title} /
  为{title}选择参与者。
- 页面**没有**再包 `<main>`：`.slide-head` 直接作为 `.inner` 子元素（`ownHeads:1`）。
- 两个面板都是 **rank 2**（HUD 第 1 档不收，第 2 档才收）——这一页没有 rank 3 的辅助块，属正常。
- **多选控件要独占一行**：`select[multiple]` 比单行控件高，和别的字段同排会把该行基线拉歪
  （第一版截图里「现实成员」的标签浮在右上）。修法是
  `label:has(select[multiple]){grid-column:1/-1}` + `select[multiple]{min-height:76px}`。
- **新增走查路由** `/liubai-preview/reality-scenes`；截图 `90/91/92` 覆盖深夜、HUD 第 1 档、纸白。

### 3.14 情境视图已迁移（第 11 轮）

| 路由 | 页面 | 结构 | 数据来源 |
|---|---|---|---|
| `/app/reality-context` | `RealityContextPage.vue` | `.slide-head` + 筛选 collapsible 面板 + 情境概览 / 资料卡片 / 历史面板 | `buildContextualView` / `listRealityDocumentsAsync` / `listRealityActivityAsync`（逻辑未改） |

- 保留了 parity 测试的全部钩子：`.context-filters`（表单，测试直接 `trigger('submit')`）、
  `.context-overview`、`.context-documents`、`.context-document`、`.history-panel`、
  `[aria-label]`：现实情境筛选 / 选择{人物,领域,事情,情境,空间,时间}上下文 / 应用情境筛选 /
  查看{title}的历史 / 情境概览 / 当前允许查看的资料，以及所有说明文案（所有者视图、当前账号是这份资料的所有者…）。
- **顺序不能动**：概览（含「住院」）必须排在资料列表（含「复诊」）之前——`vue-reality-context` 用
  `indexOf('住院') < indexOf('复诊')` 断言。
- 页面**没有**再包 `<main>`；`.muted` 统一换成全局 `.dim`（见 §3.11 的说明）。
- **新增走查路由** `/liubai-preview/reality-context`；截图 `100/102` 覆盖深夜与纸白。

### 3.15 目标 / 财务已迁移（第 12 轮）

| 路由 | 页面 | 结构 | 数据来源 |
|---|---|---|---|
| `/app/module/goals` | `GoalsPage.vue` | `.slide-head` + 添加目标（rank 2）/ 目标列表 / 目标统计（rank 3） | 旧 `goals` 集合 + `listRealityDocumentsAsync`（逻辑未改） |
| `/app/module/finance` | `FinancePage.vue` | `.slide-head` + 收支汇总（rank 3）/ 记一笔 / 记录 | `financeAsyncRepository`（逻辑未改） |

- 保留的钩子：目标页 `.goal-item`（`.goal-item .domain-picker select`、`.context-relation-picker`、
  `标记目标为{done/open}`、`{title} 进度百分比`、`page.get('form')` 只有一个表单）；
  财务页 `[aria-label="收支类型"]`（原生 select）、`.finance-item-actions .case-link`（原生 select）。
- **目标页的测试有两处断言旧实现细节，已按 v11 改写**（`vue-goals-parity`）：
  `(el as HTMLElement).style.display === 'flex'`（断言内联样式）→ 改成断言 `.goals-toolbar` 里有 `[role="tablist"]`；
  `page.find('.panel-head')`（第一个面板头）→ 改成先定位含 `.goals-toolbar` 的那个面板再取 `.panel-note`，
  因为 v11 里「添加目标」面板排在列表前面，第一个 `.panel-head` 不再是列表头。
- 财务页的收支汇总从旧的 `.stats-grid/.stat-card` 换成 `LbStatGrid`（收入/支出/结余/记录），
  `.finance-income/.finance-expense` 仍用于单条记录的金额着色。
- 截图 `110-goals-night`、`110-finance-night`、`112/113-*-paper`；旧的 `30-legacy-finance/goals` 截图已删。

### 3.16 资料已迁移（第 13 轮）

| 路由 | 页面 | 结构 | 数据来源 |
|---|---|---|---|
| `/app/library` | `LibraryPage.vue` | `.slide-head` + 保存一个可复用的东西 / 附件元数据（rank 2）+ 资源 / 洞察与种子（并排两个 `.panel`）+ 资料统计（rank 3） | `unifiedAsyncRepository`（逻辑未改） |

- 保留的钩子：`[aria-label="资源类型"]`（原生 select）、`[role="status"]`（头部那个必须显示「N 项开放资产」，
  且要是 DOM 里第一个 role=status）、`.library-card small`（`ResourceMetadata` 的文本节点形状）、
  **`.library-grid` 必须仍然只有两个 `<section>`**（测试用 `.library-grid section:last-child .library-card` /
  `... button` 定位洞察与种子那一栏）、`.evidence-row`、`[aria-label="所属领域（可选）"]`、按钮文案 保存/保存附件/退休/标记过期/恢复有效。
- `vue-library-parity` 还有一条 **CSS 契约**断言：`src/styles/controls.css` 里必须存在
  `html.tactile-ui #app .page-container .library-page select`。这条选择器作用在一个运行期从不添加的 class 上（死规则），
  测试只是读文件字符串；本轮**没动 controls.css**，所以它继续通过。清理 controls.css 时要连它一起改（见 §4.2.6 同类问题）。
- **新增走查路由** `/liubai-preview/library`；截图 `120/122`；legacy 组现在只剩 `/legacy/calendar`（截图 `30-legacy-calendar`）。

### 3.17 图谱已迁移（第 14 轮）

| 路由 | 页面 | 结构 | 数据来源 |
|---|---|---|---|
| `/app/graph` | `GraphPage.vue` | `.slide-head`（右侧 `[aria-label="图谱统计"]`）+ 添加关系 / 关系图谱（rank 2）+ 节点列表 / 关系清单（并排两个 `.panel`） | `@/domain/graph` + `unifiedAsyncRepository`（逻辑未改） |

- **这一页是内联样式重灾区**：原模板几乎每个元素都写 `style="…var(--c-text)…var(--c-text-3)…var(--c-border)…var(--c-scene)…"`。
  迁法是把全部内联样式换成 v11 令牌并收进 scoped CSS，模板只留结构；截图脚本新增
  `inlineStyled`（`.inner *` 里 style 含 `--c-` 的元素个数）自检，本次为 **0**。
- 保留的钩子：`.graph-node-list`（含按钮，测试按文案点击）、`.edge-list`（含按钮）、`.evidence-row`、
  `.graph-layout`、`.relation-form`、`.graph-toolbar`、`nodeClass(node)` 的 class 绑定、
  `[aria-label]`：图谱统计 / 关系类型 / 关系起点 / 关系终点 / 关系方向 / 筛选图谱 / 筛选节点类型，
  按钮文案 建立连接 / 重新读取 / 重试，以及两个 `[role="alert"]`（初次加载失败含「读取故障」、刷新失败含「刷新故障」）。
- `.graph-page` 类不再出现在组件里；`vue-graph-parity` 那两条 CSS 契约（读 `controls.css` 的字符串 +
  自建 DOM 验证 `.graph-page select` 的 cursor/transition）**没动 controls.css**，所以继续通过——
  清理 controls.css 死规则时要连它们一起改。
- **新增走查路由** `/liubai-preview/graph`；截图 `130/132`。

### 3.18 收集 / 文章已迁移（第 15 轮）

| 路由 | 页面 | 结构 | 数据来源 |
|---|---|---|---|
| `/app/module/inbox` | `InboxPage.vue` | `.slide-head` + 收集原文 / 筛选（rank 2）/ 收件内容三个面板；条目用 `.history-card.panel` | `captureAsyncRepository` + legacy inbox 迁移用例（逻辑未改） |
| `/app/module/posts` | `PostsPage.vue` | `.slide-head` + 写一篇文章 / 文章列表两个面板；阅读抽屉改 v11 令牌 | `createAsyncCollectionRepository('posts')` + `unifiedAsyncRepository`（逻辑未改） |

- **收集页的坑**：parity 测试用 `page.get('[role="status"]')` 取**第一个** role=status 并断言里面是操作提示
  （「没有 archive 操作」）。所以头部那行统计**不能加 `role="status"`**（我用了普通 `.panel-note`），
  否则第一条会被头部抢走。
  另外 `.opening-details small` 的**文本节点结构**必须保持原样（测试断言子文本节点恰好是
  `['Capture ID：', id, ' · revision ', revision]`），所以那段 `<template v-for>` 一字未改。
- **文章页的坑**：`vue-posts-parity` 断言 `.posts-active-count` 的**内联 `style="display: contents"`** 与
  `.load-pill` 的精确文案「0 篇在库」——这是"计数与静态文案是两个文本节点"的契约，所以我原样保留了
  `.load-pill` / `.posts-active-count` 与那行内联样式，只把外观写进 scoped CSS。
  卡片动作按钮从 `.app-button` 换成 `.chip`，测试里 4 处 `.history-card button.app-button` 相应改为
  `.history-card button.chip`（断言意图不变：保存中时卡片按钮全部 disabled）。
- **新增走查路由** `/liubai-preview/inbox`、`/liubai-preview/posts`；截图 `140-*-night`、`142/143-*-paper`。

### 3.19 日程 / 场景已迁移（第 16 轮）

| 路由 | 页面 | 结构 | 数据来源 |
|---|---|---|---|
| `/app/calendar` | `CalendarPage.vue` | `.slide-head`（右侧月份切换）+ 月份面板 + 选中日面板 + 当天证据 / 本月处境两个面板 | `actionAsyncRepository` / `recordAsyncRepository` / `unifiedAsyncRepository`（逻辑未改） |
| `/scene`（standalone） | `ScenePage.vue` | 自带 `.scene-intro` + `.scene-grid`（4 张 `.scene-card`）+ `.scene-start` | `@/core/scenes` + `store`（逻辑未改） |

- 日程页原来是**一整块非 scoped `<style>`**（旧 `--c-*` 令牌）+ 模板里的内联样式；本轮整块改成 `<style scoped>` 的
  v11 令牌版本，内联样式清空（截图 `inlineLegacyTokens:0`）。保留的钩子：`.calendar-cell`（42 格）、
  `.cell-dots i`、`.month-panel`（aria-label `YYYY年M月日历`）、`.selected-day h2`、`.day-metrics b:first-child`、
  `.state-line`、`.evidence-panel .panel-head`、`.evidence-row`、`.quiet`、`[aria-label="下一个月"]`、
  `.selected-day .domain-picker/.context-relation-picker/.ownership-editor`、`[role="alert"] button`。
- **`.scene-page` 必须写 `width:100%`**：它靠 `margin:0 auto` 居中，裸块级没问题，但一旦嵌进「留白」外壳的
  `.inner`（flex 列），交叉轴上的 auto margin 会让元素**收缩成内容宽度**，卡片网格塌成一列（第一版截图就是这样）。
  以后任何自带容器宽度的页面放进外壳都要注意这一点。
- **`/scene` 是 standalone 路由**（`route-manifest` 里 `shell:'standalone'`，且守卫要求登录），生产环境不套外壳。
  走查通道因此加了一份免鉴权副本 `/liubai-preview/scene`；注意在那张截图里外壳会多渲染一份自己的标题
  （ScenePage 不调用 `useOwnSlideHead()`，因为它在生产里不在外壳内）。**`/pass`、`/vault`、`/desk` 同样在外壳之外**，
  是否要收进统一外壳需要产品负责人拍板（`/desk` 是 23KB 的独立工作台）。
- 旧的 `30-legacy-*.png` 截图已全部删除；走查通道不再有 `legacy/*`。

### 3.20 我的 / 记忆已迁移（第 17 轮）

| 路由 | 页面 | 结构 | 数据来源 |
|---|---|---|---|
| `/app/profile` | `ProfilePage.vue` | `.slide-head`（右侧三个动作 chip）+ 身份/场景两张面板 + 关联现实人物面板 + 现有数据概览面板 | `listRealityDocumentsAsync` + `readSession`（逻辑未改） |
| `/app/memory` | `MemoryPage.vue` | `.slide-head`（右侧 `.memory-head-note`）+ 层级 tab + 列表面板 + 边界说明 | `recordAsyncRepository` / `unifiedAsyncRepository`（逻辑未改） |

- **`MemoryPage.vue` 的列表那一行超过 2000 字符**，`read` 工具会截断、`edit` 拿不到完整 `old_string`。
  处理办法：只做**token 级 replace_all**（`class="beryl-card memory-card"` → `class="memory-card"`、
  `class="app-button"` → `class="chip"`、`class="form-error"` → `class="dim memory-error"`、
  `class="empty-state"` → `class="dim"`、`:class` 数组里的 `'beryl-card'` → `'panel'`），
  不去重写整行。以后遇到超长行可以照这个办法。
- **记忆页的按钮顺序与类名是测试钩子**：`.memory-insight-card button:nth-child(1..3)`、
  `.memory-compose-card > button`、`.memory-composer button.primary`、`.memory-head-note button`、
  `button.danger`。所以「保存并确认」保留了 `.primary` 类，只在本文件 scoped 样式里把它画成 v11 主按钮。
- **又一处"测旧实现"的断言已改写**：`vue-memory-parity` 原本断言组件源码里存在
  `.memory-page{max-width:none}`（那是为了撤销旧壳的宽度上限）。v11 里页面直接挂在 `.inner` 下、
  本就占满内容宽度，于是改成断言「组件自己不再设任何数值 max-width」+「调用了 useOwnSlideHead()」。
- **旧 CSS 的浅色底会漏进来**：`.memory-head-note` 被旧 app.css 画成了浅色卡片，在外壳深色主题里非常突兀；
  在 scoped 样式里显式复位 `background/border/padding/box-shadow`。同类页面（自带"头部小卡"的）要留意。
- **新增走查路由** `/liubai-preview/profile`、`/liubai-preview/memory`；截图 `140-*-night`、`144/145-*-paper`。

### 3.21 未来已迁移（第 18 轮）

| 路由 | 页面 | 结构 | 数据来源 |
|---|---|---|---|
| `/app/future` | `FuturePage.vue` | `.slide-head future-page-head` + 四个阶段（intro / scenarios / reflection / saved）各自的 `.panel` | `@/domain/future-lookback/data` + `saveFutureReflection/Feedback`（逻辑未改） |

- **这一页有两条"源码字符串"断言**（`vue-future-parity`）：组件源码里必须存在 `@media (max-width: 620px)` 和
  `.future-page h2[tabindex="-1"]:focus-visible`。所以原样保留了这两条规则（它们也是 h2 被聚焦时的可见焦点环）。
- **类名即钩子**：`.future-page-head .future-text-link`（且必须是 `<a>`）、`button.future-primary`、
  `button.future-secondary`、`.future-saved .future-actions a.future-primary/a.future-secondary`、
  `.future-section-head h2`（焦点落点，保留 `tabindex="-1"`）、`[aria-label="选择一个想回头看的事情"] button`。
  做法是**保留旧类名 + 叠加 v11 `.chip` / `.chip on`**，外形由设计层给，钩子不变。
- 页面仍保留 `.future-page` 包装（焦点环选择器依赖它），代价是 `ownHeads:0`（同 §3.11 人物页），
  因此用 scoped `.future-page{display:flex;flex-direction:column;gap:…}` 自己补面板间距。
- **`justify-self` 只对 grid 生效**：阶段卡是 flex 列，里面的 pill / CTA 要用 `align-self:flex-start`，否则会被拉满整行
  （第一版截图「第一步」标签就是一条通栏）。
- **新增走查路由** `/liubai-preview/future`；截图 `140-future-night`（默认 intro 阶段）。

### 3.22 探索已迁移（第 19 轮）

| 路由 | 页面 | 结构 | 数据来源 |
|---|---|---|---|
| `/app/flow` | `FlowPage.vue` | `.slide-head` + 当前意图面板 + 结束/未开始/读取中三个状态 + 批次卡（`.flow-card.panel`）+ 回响记录 | `actionAsyncRepository` / `recordAsyncRepository` / `unifiedAsyncRepository`（逻辑未改） |

- **`.app-button` 是这一页的硬钩子**：`vue-flow-parity` 有 5 处断言
  `button.classes().includes('app-button')`（模式选择、批次头、卡片头、卡片动作、回响动作）。
  所以按钮类名**一个都没动**——外观交给桥接层把 `.app-button` 映射成 v11 描边按钮，
  `src/styles/modules/flow.css` 只补结构排版（并补 `.echo-actions button` 的间距与点击态）。
- `src/styles/modules/flow.css` 整块重写为 v11 令牌，删掉两条挂在 html 级实验 class 上的死规则。
- **新增走查路由** `/liubai-preview/flow`；截图 `140-flow-night`（默认未开始状态）。

### 3.23 飞书已迁移（第 20 轮）

| 路由 | 页面 | 结构 | 数据来源 |
|---|---|---|---|
| `/app/feishu` | `FeishuPage.vue` | `.slide-head` + 连接状态 + 错误/概览 + 任务编辑器 + 项目/记录卡 + 任务详情抽屉 | `feishuWorkspace`（`@/core/feishu`，逻辑未改） |

- **有一条精确文案断言**：`vue-feishu-parity` 要求 `.workspace-source small` 的 textContent
  **恰好**是「任务直接保存在飞书；前台每 15 秒检查更新。 此工作台始终显示飞书。」，
  所以页内那一整块数据来源（含 `.range-tabs` 旧类）**保持原样没动**——它是页内自带副本，
  和外壳组件 `WorkspaceSourceBar.vue` 是两处。
- 其余钩子：`[aria-label="飞书连接状态"]`（含 `role="status"` 文案 + 刷新按钮）、`[role="alert"]`（含「Worker 地址与同步密码」）、
  `[aria-label="飞书数据表"] [role="tab"]`（4 个）、`[aria-label="飞书周报列表"]`、`[aria-label="飞书任务看板"]`、
  `[aria-label="飞书任务关联项目"]`（原生 select）、`[aria-label="{任务}状态"]`（原生 select）、
  `.feishu-record-card button[aria-expanded]`、`.feishu-project-tasks .task-board-card h3`。
  另有两处读 `controls.css` 的 CSS 契约（未动该文件，继续通过）。
- **旧 app.css 给 `.feishu-page` 设了宽度上限并居中**：迁移后必须在新 scoped 样式里
  `width:100%; max-width:none; margin:0`，否则整页被挤成中间一窄列（第一版截图就是这样）。
- 页内 `<a>`（设置入口 / 数据来源两条）默认是浏览器蓝紫色，scoped 里统一成 `var(--accent)`。
- **新增走查路由** `/liubai-preview/feishu`；截图 `140-feishu-night`。

### 3.24 系统管理已迁移（第 21 轮）

| 路由 | 页面 | 结构 | 数据来源 |
|---|---|---|---|
| `/app/system/*`（users / roles / security / sessions / login-logs / operation-logs） | `SystemAdminPage.vue` | `.slide-head` + 各分区一张 `.panel`（账号筛选/创建/资料编辑/表格；角色矩阵；安全表单；日志表） | `@/core/api/system-admin`（逻辑未改） |

- **没有 parity 测试**（`grep SystemAdminPage src/__tests__` 无结果），所以这一页靠截图 + 全量测试保证。
- **整个 `<style scoped>` 是一行、2126 字符**（read 会截断）。做法是先 `read` 拿到行首，
  再用 `pwsh` 做**唯一字面量替换**（读文件 → `String.Replace` → UTF-8 无 BOM 写回）：
  `var(--c-border,#d9ded8)`→`var(--line)`、`var(--c-surface,#fff)`→`var(--panel-2)`、
  `#a43d37`→`var(--danger)`、`#28744a`→`var(--accent)`、`#c69737`→`var(--line-strong)`、
  `max-width:1180px;margin:0 auto;…`→`width:100%;max-width:none;display:flex;flex-direction:column;gap:…`，
  模板侧 `class="beryl-card system-card"`→`class="system-card panel"`、`app-button*`→`chip*`、`font-title` 去掉，
  最后删掉两条已死的 `.page-head{…}` 规则。替换后用正则统计残留（全部为 0）再截图。
- **走查路由要用真实分区名**：页面用 `route.path.split('/').at(-1)` 选分区，
  所以走查通道写成 `/liubai-preview/system/users`（写成 `/system-admin` 会只渲染标题、什么都不显示）。
- **新增走查路由** `/liubai-preview/system/users`；截图 `140-system-admin-night`。

### 3.25 处境详情已迁移（第 22 轮）

| 路由 | 页面 | 结构 | 数据来源 |
|---|---|---|---|
| `/app/matters/:id` | `MatterDetailPage.vue` | `.slide-head`（标题 **h1**）+ 当前状态面板 + 这件事中的情境面板 + 问题驱动学习面板；加载/读取失败/找不到三个分支也是面板 | `matterAsyncRepository` + `unifiedAsyncRepository`（逻辑未改） |

- **标题必须是 `<h1>`**：`vue-matter-detail-parity` 有 `expect(wrapper.get('h1').text()).toBe(…转向产品设计…)`。
  v11 里大多数页面用 h2，但这一页按测试契约保留 h1（详情页用 h1 也合理）。
- **`.admin-block .info` 是钩子**：测试用 `findAll('.admin-block .info')` 拿两条摘要行、再断言它们的**文本节点切分**
  （`['状态：','进行中',' · 阶段：','fire',…]`）。所以 LbPanel 上加了 `class="admin-block"`，
  两条摘要段落保留 `class="info dim"`（既有钩子又有 v11 弱化色）。
- 其余钩子：`.thing-scenes`（含 `li span` 列表）、`.problem-driven-detail`、`a[href*="reality-scenes"]?thing=…`、
  `围绕这个处境进入探索`（跳 `/app/flow?matter=…`）。
- **新增走查路由** `/liubai-preview/matter/:id`（用一个不存在的 id 展示"找不到"分支）；截图 `140-matter-detail-night`。
  真实数据分支由 `vue-matter-detail-parity` 的 11 个用例覆盖。

### 3.26 周期已迁移（第 23 轮 · 逐页迁移收官）

| 路由 | 页面 | 结构 | 数据来源 |
|---|---|---|---|
| `/app/cycle` | `CyclePage.vue` | `.slide-head` + 五行转盘面板 + 这一轮的课题/今日行动（`.cycle-lower` 两列）+ 阶段分布面板；加载/读取失败也统一成面板 | `actionAsyncRepository` / `matterAsyncRepository` / `todayAsyncRepository`（逻辑未改） |

- 钩子全部保留：`[aria-label="课题五行阶段分布"]` + 5 个 `.cycle-node`（`.current` 带 `aria-current="step"`）、
  `.cycle-center`、`#cycle-current-title`、`#cycle-matters-title` / `#cycle-actions-title`
  （测试用 `closest('section')`，所以这两块仍必须是 `<section>`）、
  `.cycle-completed-count|total-count|completion-count` 与 `.cycle-load-label` 都带内联 `style="display: contents"`。
- **别用 grid 覆盖五行转盘**：`.cycle-orbit` 的圆形布局与 `.node-0..4` 的绝对定位来自 app.css；
  第一版我给 `.cycle-orbit` 加了 `display:grid;grid-template-columns:…`，转盘立刻散架。
  正确做法是**只换底色**：app.css 的内圈是 `#f5fbf6`、节点圆盘是 `#fff`（深色主题下的白块），
  scoped 里重写 `background`（内圈用 `var(--panel)`）与 `.cycle-node > span{background:var(--panel-2)}`。
- **一次"看错了"的排查值得记住**：截图里转盘中心像个白圆盘，我用 CDP 探针取到
  `radial-gradient(circle, rgb(17,17,19) 0px, rgb(17,17,19) 28%, …)`、`nodeSpanBg: rgb(21,21,23)`，
  再直接采样 PNG 像素：中心 (711,300)/(711,275) 都是 `17,17,19`（深色），
  亮像素其实来自**节点标签文字**（app.css 让 `.cycle-node` 继承 `color:var(--node-color)`）。
  结论：**先量像素/取计算样式，再决定要不要改**——不要凭缩略图的观感下结论。
- 截图脚本里留了一个常驻自检 `cycle style probe`（打印 `.cycle-orbit` 的 `backgroundImage`、
  `.cycle-center` / `.cycle-node > span` 的底色、`--panel` 的值），以后再遇到"旧浅色底漏进来"可以一眼看到。
- **新增走查路由** `/liubai-preview/cycle`；截图 `140-cycle-night`。



















---

## 4. 当前未验证 / 已知问题

### 4.1 已解决（第 7 轮）

四层死 CSS 的删除**已跑完整截图回归**：`40-purge-today`、`41-purge-capture`、`42-purge-mobile`
与旧页面 `30-legacy-*` 全部正常，`main.ts` 的 import 收敛保持不动。


### 4.2 已知缺口（目标四步全部走完后剩下的收尾项）

1. **逐页迁移、删层、旧页面清理都已完成**（30 个入口 + 三份兼容层合并为一份 + 9 个旧页面删除）。
   路由侧已无旧页面骨架，页面文件 47 → 37。剩下的"旧文件"只有：
   `FeishuTaskBoard.vue`（`TaskBoardPage` 的**活子组件**，不能删）与
   `CompatibilityPlaceholderPage` / `MigrationPendingPage`（仍在路由里）。
2. **各模块的功能缺口（v11 页面 vs 旧页面）** —— 迁移时按参考稿的信息架构重写，普遍少了"就地编辑/筛选/来源切换"：
   - **注意力**：v11 只有"25 分钟一段 + 开始/结束"，少了"专注/休息模式切换 + 可独立编辑的两套时长"，也少了给完成记录挂情境。
     数据链路安全（`completeFocus()` 仍写 `pomoTotal`/`pomoCount` 与 `[番茄钟] 完成专注 N 分钟`），**无数据回归**。
   - **总览**：v11 已补"快速新增行动（含关联处境）"；仍少：就地写日记记录（记录类别/原文）、身体状态（capacity）
     —— *注意：`daily_state` 现在**没有任何写入方**了*（唯一写入方是已删的 `TodayPage.vue`），需要产品决策是搬到日记/回顾页还是放弃；
     还少了飞书来源切换（v11 把它放在看板页）。
   - **任务**：v11 已补"日期 + 关联处境 + 领域·关联·归属编辑"；仍少：状态筛选 tab、`.load-pill` 计数、空标题警告 toast、"打开看板"入口。
   - **习惯**：v11 不提供改名/删除（`useReferenceWorkspace` 未暴露方法，页面注释写明"不假装提供"）。
   - **记录（Capture）**：v11 已补回「常用句插入」（按记住的选区插入 + 恢复光标焦点，与日记页共用 `SentencePicker`）；
     仍少：保存时创建 AI 建议（见下）、建议标题可编辑后采纳、"忽略建议 → rejected"状态、飞书来源切换。
   - **日记（Diary）**：v11 改成"停笔约 1 秒自动保存"（旧的显式 form 提交 + 保存 toast、前后一天按钮、历史搜索框、
     `.load-pill` 计数、常用句「浏览全部」抽屉与 `aria-activedescendant` 键盘协议都没有搬）。
     数据路径不变（`saveNote` → 版本化写入，修订历史已用测试锁住）。
   - **处境（Matters）**：v11 已补回「问题驱动六字段 + 趋势选择器 + 生命周期筛选」；
     仍少：旧页面的「飞书项目视图」（只读项目列表 + 搜索 + 展开关联任务，走 `feishuWorkspace`）。
   - **回顾（Review）**：v11 已补回「今日复盘」表单（此前 `completeReview` 没有任何调用方）；
     仍少：旧页面的「近 7/30/90 天证据区间 + 每条证据的领域/关联/归属编辑」（v11 按参考稿改成"按周聚合专注记录"）。
   - **两处"没有写入方"的数据缺口（需要产品决策）**：
     ① `daily_state`（每日身体状态/capacity）：唯一写入方是已删的 `TodayPage.vue`；
     ② capture suggestion（`listSuggestions`）：唯一写入方是已删的 `CapturePage.vue`。
     两者都是**读得到、写不进**。要么搬到 v11 的某个页面（日记/回顾/记录），要么明确放弃并删掉读路径。
     （第 30 轮已修掉同类的第三处：`TodayPlan.review` 的唯一写入方 `completeReview` 搬到了 v11 复盘页。）
   - 上述"少了"的部分**都不影响既有数据**：写入路径要么已补回，要么仍在别处（以上两处例外）。
3. **参考稿有 16 处没有真实数据来源**（注意力预算配额 180/120/120/60、保护级别 L0–L3、专注块起止时刻、干扰源排行、上下文快照 files/unresolved、主观专注感 1–5、知识卡实体、任务 tag/attn、节假日表、五视角问题清单、`all` 与按周视图的部分细节…）。当前一律**不显示、不编造**。需要产品负责人决定：新造数据模型，还是保持占位。
4. **`vault-sync.ts:189` 历史类型错误仍在**：根因是 `src/core/content/open-format.ts:191` 的 `isRecord` 守卫不严谨（`'occurredAt' in entity` 也命中 `OpenLegacyInboxHistory`），顺带导致 inbox 历史文件落到 `50 Records/` 而非本意的 `90 History/Inbox/`。它让 `npm run build` 一直红。**修它需要产品负责人同意**（不属于前端迁移范围）。
5. **已删除**（第 7 轮）：`KongPage.vue`、5 个死 CSS、`src/views/*`、旧壳组件（AppShell / LegacyAppShell / ReferenceAppShell / ContextRail / Stage* / PrimaryNav / WorkspaceTabs / NavigationPageIcon / ReferenceStagePages / ReferenceDateNav）全部从磁盘删除，`src/vue/shell/` 现在只剩 `LiubaiShell.vue` 与 `WorkspaceSourceBar.vue`。
   （第 24 轮又删掉 `liubai-bridge.css`、`liubai-compat.css`。）
6. ~~仍可清理的孤儿逻辑模块~~ —— **第 25 轮已删除**：`src/router/navigation.ts`、`src/router/workspace-tabs.ts`（+ 其测试）、`src/ui/reference-presentation.ts`。
7. ~~`LiubaiShell` 里的 `.page-head` DOM 探针~~ —— **第 25 轮已删除**。做法：先把飞书分支的子组件 `FeishuTaskBoard.vue`
   的头部改成 `.slide-head`（并修掉 `TaskBoardPage` 在飞书分支下的**双标题**），探针与 `hasLegacyHead` 就没有存在理由了；
   应用层里那 5 条 `.page-head` 映射规则也一并删掉。运行期已无任何页面渲染 `.page-head`
   （只剩 10 个没有路由指向的旧页面文件在模板里用它）。
   遗留：`FeishuTaskBoard` 内部其余旧类名（`.beryl-card` `.app-button` `.range-tabs`…）仍靠应用层映射，可继续改成 v11 词汇。
8. **旧全局样式层仍在**（`main.css` / `shared/app.css` / `product-ui.css` / `controls.css` / feishu 两份）：
   它们服务的对象现在只剩历史组件与被上一条提到的分支；应用层里那批 `html.liubai-active body #app :where(...)` 中和规则
   正是为压过它们而存在。彻底删掉它们＝把这几处历史组件也改成 v11 词汇，属于可选收尾。
   （第 32 轮已把 `controls.css` 里"上一代设计"的死作用域清掉：71 → 54 条，剩下的都是真正在生效的规则。）



---

## 5. 下一轮该做什么（按优先级）

1. ~~回归验证 CSS 删层~~ —— 第 7 轮已完成。
2. ~~修工作区权限 + 删僵尸文件~~ —— 第 7 轮已完成（会话已是完全权限）。
3. **第 ④ 步（收官）状态**：
   a. ~~删除三份 liubai 兼容层~~ —— **第 24 轮完成**：`liubai-bridge.css` / `liubai-compat.css` 已删除，
      活规则（按引用数核对后）合并进唯一的应用层 `liubai-app.css`，`main.ts` 只剩设计层 + 应用层两条样式导入；
      删层后 `node tmp/liubai-shot.mjs`（全页 `heads:1`，各页 `panels` 不变）+ `npx vitest run`（127 文件 / 815 用例）+ `vue-tsc` 均无回退。
   b. ~~按参考稿 `DEFAULT_HUD_RULES` 对齐 HUD~~ —— **第 24 轮核查完成**：三种名单 `[]`/`[2]`/`[1,2]` 与 rank 1/2/3 等价，
      外壳钩子（`data-level`/`aria-label`/`aria-pressed`/`data-hud`/`.hud-hidden`）与参考稿一致，无需改动。
   c. **收尾进度**：
      ① ✅（第 25 轮）孤儿逻辑模块已删（`navigation.ts` / `workspace-tabs.ts` / `reference-presentation.ts` + 其测试）；
      ② ✅ **完成（第 32 轮）**：`controls.css` 里 16 条 `html.tactile-ui …` 死规则已删（71 → 54 条，全部活规则），
         6 个读它们的"CSS 契约"测试改成断言实际生效的全局 select 规则，并加了"不得再出现该规则"的守卫；
         顺带修掉挂在死作用域下、一直没生效的 `.goal-context-fields select` 窄屏 `width:100%`。
      ③ ✅（第 25 轮）`LiubaiShell` 的 `.page-head` 探针 + 应用层 `.page-head` 映射已删（先统一了 `FeishuTaskBoard` 的头，
         并修掉 `TaskBoardPage` 飞书分支的双标题）；
      ④ ✅ **完成（第 26–31 轮，9/9）**：parity 测试全部改测 `Liubai*` 页面，9 个未挂路由的旧页面全部删除
         （`PomoPage` / `TodayPage` / `FeishuToday` / `HabitsPage` / `TasksPage` / `CapturePage` / `DiaryPage` /
         `ReviewPage` / `MattersPage`，外加无引用的 `UserAdminPage`）。页面文件 47 → 37。
         过程中按"先补功能、再写测试、最后删页面"补回了 4 处被迁移漏掉的真实能力：
         总览新增行动、任务日期/处境/领域·关联·归属、记录与日记的常用句插入、**复盘的四段反思写入**（`completeReview` 此前无调用方）、
         处境的六字段与趋势选择器。
         固定做法：① 读旧测试 + v11 页面 → ② **先补齐 v11 页面缺的能力**（多数组件仓库里已有，只是没接上）→
         ③ 写 v11 原生测试（保留有价值的不变量，如修订历史/仓储写入）→ ④ 跑绿后删旧页面。
      ⑤ ⬜ 视情况把历史组件（`FeishuTaskBoard` 内部、`DomainPicker`、`OwnershipEditor`、`WorkspaceSourceBar` 等）
         改成 v11 词汇，最终退役旧全局样式层（`main.css`/`app.css`/`product-ui.css`/`controls.css`/feishu 两份）。
   d. 每次改完都要跑：`node tmp/liubai-shot.mjs` + `npx vue-tsc --noEmit` + `npx vitest run`，并抽查 paper/night 截图。
   经验合集：**先 grep parity 测试的选择器与源码字符串断言再动手**；含大量内联旧令牌的页面把内联样式一次性收进 scoped CSS，
   并用 `inlineLegacyTokens` 计数自检归零；自带容器宽度的页面放进外壳要写 `width:100%; max-width:none`；
   超过 2000 字符的行用 pwsh 字面量替换（§3.20 与 §3.24）；flex 列里的 pill/CTA 用 `align-self`；
   不要用 grid 覆盖 app.css 里靠绝对定位的图形（§3.26）；**先量像素/取计算样式再改样式**；
   批量替换后必须 grep 关键词与 `→` 残留。
4. **每迁一页的固定动作**（照 `AdminPage.vue` 这一轮的做法）：
   - `useOwnSlideHead()` + 自己的 `header.slide-head`（hint / `.head-title-row` + h2 / `.info[data-tip]`）
   - 内容拆成 `LbPanel`（`.panel`）、辅助块包 `LbCollapsible :rank`（1 常显 / 2 级别≥2 收 / 3 级别≥1 收）、
     指标用 `LbStatGrid`
   - 带文字的按钮用 **`.chip`**（危险动作用 `.chip.danger`）或 `.detail-btn`；`.act` 是 26×26 **图标**按钮，别放文字
   - 修 `vue-route-parity.test.ts` 里对应的那一行（`it.each` 表），并跑该页的 parity 测试
   - 补功能缺口时**不要编造参考稿没有来源的数据**（见 4.2.3）
5. 每批做完必须跑：`node tmp/liubai-shot.mjs`（截图 + DOM 断言）、`npx vue-tsc --noEmit`、`npx vitest run`。
   截图脚本已内置设置页的 `50/51/52` 三张；新迁页面照此加一段。
6. 全部迁完后：删除三份 liubai 兼容层（app / bridge / compat），把 `data-block` 的 HUD 规则按参考稿的
   `DEFAULT_HUD_RULES` 精确对齐，并清掉 4.2.6 的孤儿逻辑模块。


---

## 6. 代码地图（本次新增/改动）

**新增**
```
src/styles/liubai/            liubai-v11.css（设计层·参考稿原样）· liubai-app.css（应用层·唯一）
src/vue/liubai/               LbPanel / LbCollapsible / LbStatGrid / LbDateNav (.vue) · date-state.ts · focus.ts · types.ts · slide-head.ts
src/vue/shell/LiubaiShell.vue 统一外壳
src/vue/pages/Liubai*.vue     8 个迁移页面
docs/reference/liubai-v11/    参考稿存档（css 已单独放在 src/styles/liubai）
tmp/liubai-shot.mjs           CDP 截图脚本（开发工具，非产品代码）
liubai-shots/                 截图产物（根目录，受限进程唯一可写处）
```

**改动**
```
src/main.ts                  样式层 import 收敛 + body 上初始化主题/导航/模式/禅模式
src/router/index.ts          /app 与 /login 换 LiubaiShell；pageComponents 8 个换成 Liubai*；新增仅 DEV 的 /liubai-preview 走查通道
src/vue/composables/useReferenceWorkspace.ts  追加 resolveCapture / addMatter / setMatterStatus（additive，未改既有方法）
```

**第 7 轮新增/改动/删除**
```
新增  src/__tests__/liubai-shell.test.ts      统一外壳的 7 个契约测试（取代两个旧壳测试文件）
迁移  src/vue/pages/AdminPage.vue             设置页：由 src/views/AdminView.vue 移动而来 + 模板/样式重写为 v11
迁移  src/vue/pages/TaskBoardPage.vue         看板：slide-head + 筛选面板 + 5 个状态列面板 + 统计/说明块（旧类名保留给 parity 测试）
迁移  src/vue/pages/PeoplePage.vue            人物：slide-head + 重要日期/新增人物/人物列表/人物统计面板（embedded 时不自带头部）
迁移  src/vue/pages/MasterDataPage.vue        主数据：slide-head（随 tab 变）+ seg tab 段 + 两个面板 + 统计/说明块
重写  src/styles/modules/master-data.css      改为 v11 令牌，删除挂在死 class 上的旧作用域规则
迁移  src/vue/pages/RealityScenesPage.vue     现实情境：slide-head + 两个 collapsible 面板 + 情境卡片用 .panel
迁移  src/vue/pages/RealityContextPage.vue    情境视图：slide-head + 筛选面板 + 概览/资料/历史卡片用 .panel
迁移  src/vue/pages/GoalsPage.vue              目标：slide-head + 添加目标/目标列表/目标统计
迁移  src/vue/pages/FinancePage.vue            财务：slide-head + 收支汇总/记一笔/记录
迁移  src/vue/pages/LibraryPage.vue            资料：slide-head + 保存/附件面板 + 资源/洞察并排面板 + 统计
迁移  src/vue/pages/GraphPage.vue              图谱：清掉全部内联旧令牌样式并收进 scoped CSS，改 slide-head + 四个面板
迁移  src/vue/pages/InboxPage.vue              收集：slide-head + 收集原文/筛选/收件内容面板
迁移  src/vue/pages/PostsPage.vue              文章：slide-head + 写一篇文章/文章列表面板 + 阅读抽屉改 v11 令牌
改动  src/__tests__/vue-posts-parity.test.ts    卡片按钮选择器 .app-button → .chip（断言意图不变）
迁移  src/vue/pages/CalendarPage.vue           日程：整块非 scoped 旧令牌样式改成 scoped v11 样式 + slide-head + 四个面板
迁移  src/vue/pages/ScenePage.vue              场景：standalone 页自带 v11 排版（含 width:100% 修正）
迁移  src/vue/pages/ProfilePage.vue            我的：slide-head + 身份/场景/关联人物/数据概览面板
迁移  src/vue/pages/MemoryPage.vue             记忆：slide-head + 层级 tab + 列表面板 + 边界说明
迁移  src/vue/pages/FuturePage.vue             未来：slide-head（保留 .future-page-head 钩子）+ 四个阶段各自的 .panel
迁移  src/vue/pages/FlowPage.vue               探索：slide-head + 意图/批次卡面板（按钮保留 .app-button 钩子）
重写  src/styles/modules/flow.css              改为 v11 令牌，删除死规则，只补结构排版
迁移  src/vue/pages/FeishuPage.vue             飞书：slide-head + 各区块 .panel；数据来源块按精确文案断言原样保留
迁移  src/vue/pages/SystemAdminPage.vue        系统管理：slide-head + 各分区 .panel；整行 scoped 样式用 pwsh 字面量替换成 v11 令牌
迁移  src/vue/pages/MatterDetailPage.vue       处境详情：slide-head（标题 h1）+ 三个内容面板；三个状态分支也统一成面板
迁移  src/vue/pages/CyclePage.vue              周期：slide-head + 转盘/课题/行动/阶段分布面板（转盘只换底色，保留 app.css 的绝对定位）
改动  src/__tests__/vue-memory-parity.test.ts   改为断言「组件不再设数值 max-width + 调用 useOwnSlideHead()」
改动  src/__tests__/vue-goals-parity.test.ts   两处断言旧实现细节（内联 display、第一个 .panel-head）改为 v11 结构
改动  src/styles/liubai/liubai-app.css        +.inner 子项不压缩（长页面滚动）+ .dim 弱化文字，修所有页面共用的缺陷
改动  src/router/index.ts                     走查通道逐页从 /legacy/* 移到正式路径（现已几乎全部迁完），只剩 /legacy/calendar
改动  src/__tests__/vue-route-parity.test.ts  8 行组件表更新为 Liubai*
改动  src/__tests__/components.test.ts        从 views/{Login,Scene}View 改测 vue/pages/{Login,Scene}Page
改动  src/__tests__/workspace-motion.test.ts  不再读已删除的 tactile-ui.css，改守 product-ui + liubai-v11
改动  src/__tests__/admin-vault-review.test.ts / accessibility-static.test.ts / vue-auth-settings-parity.test.ts  指向新路径与新结构
改动  tmp/liubai-shot.mjs                     加设置页 50/51/52 三张；修 16/17 两张原来量错页面的问题
删除  src/styles/shared/{ui-refresh,tactile-ui,reference-stage,reference-native,mobile-nav}.css
删除  src/vue/pages/KongPage.vue
删除  src/vue/shell/{AppShell,LegacyAppShell,ReferenceAppShell,ReferenceStagePages,ReferenceDateNav,
                     StageDirectory,StageIcon,StageNavigation,StageDisplayControls,StageSettingsPanel,
                     StageCommandPalette,StageToolbar,ContextRail,PrimaryNav,NavigationPageIcon,WorkspaceTabs}.vue
删除  src/views/ 整个目录（17 个残留 view；AdminView 已迁走）
删除  src/__tests__/{vue-shell-parity,vue-stage-shell}.test.ts
```


---

## 7. 参考稿规格在哪查

- 类名词汇/结构：`docs/reference/liubai-v11/shell-markup.html`
- 交互与六模块算法：`docs/reference/liubai-v11/interactions.js`（3221 行，之前已产出完整规格，要点：`data-nav` 只有 left/right；`LOCK_MS=560`；滚轮累积阈值 26、150ms 归零；触摸 44px；HUD 三档 `DEFAULT_HUD_RULES`；主题键 `liubai-theme/nav/zen/mode`；每模块日期 `state.dates[6]`）
- 设计令牌：`src/styles/liubai/liubai-v11.css` 顶部六个 `body[data-theme=…]` 块（night/ink/forest/sunset/paper/sand）

---

## 8. 环境与工具链（**新会话必读**）

### 8.1 需要批准的少数命令

**2026-10-05 起本会话已切到完全权限（danger-full-access），下面这些命令不再需要申请。**
保留下表是因为它们"在受限沙箱下"会被挡，换会话如果回到 workspace-write 就要重新按这个清单申请：


| 命令 | 为什么被挡 |
|---|---|
| `npm run dev` | esbuild 需要命名管道启动服务进程 → `spawn EPERM` |
| `npx vue-tsc --noEmit` | 同上 |
| 任何 Chrome 调用 | Windows 上 Chrome 用命名管道做 Mojo IPC → `platform_channel.cc:112 拒绝访问` |

普通读写、`Invoke-WebRequest`、`node tmp/liubai-shot.mjs` 之外的 node 脚本都不需要额外批准。

### 8.2 预览与验证

```powershell
# 预览（默认端口 5173；已在跑就别重复起）
npm run dev            # → http://localhost:5173   ← 必须用 localhost
# Vite 只绑 IPv6，用 127.0.0.1 会连不上（这是之前"服务挂了"的假象来源）

# 类型检查（唯一能自动发现迁移错误的手段）
npx vue-tsc --noEmit   # 期望：只剩 vault-sync.ts:189

# 回归截图（CDP；会自己起 Chrome 并写 PNG 到 liubai-shots/）
node tmp/liubai-shot.mjs
```

- **开发走查通道**：`/#/liubai-preview` 下全部子路由都不再是遗留页面（`/tasks`、`/habits`、`/pomo`、`/diary`、`/review`、`/capture`、`/matters`、`/admin`、`/board`、`/people`、`/master-data`、`/reality-scenes`、`/reality-context`、`/goals`、`/finance`、`/library`、`/graph`、`/inbox`、`/posts`、`/calendar`、`/profile`、`/memory`，另加 `/scene` 的免鉴权副本）。仅 `import.meta.env.DEV` 存在，不鉴权。
- 主应用 `/app/*` **需要登录 + 已解锁 Vault**，所以无头浏览器里拿不到真实数据；走查通道只能看**空态**。截图脚本用 `?theme=<id>` 播种主题，靠 `Page.addScriptToEvaluateOnNewDocument` 在页面脚本前写入 localStorage（外壳只在 `onMounted` 读一次主题，挂载后再写就晚了）。
- hash 导航**不会重新加载**页面，所以脚本先导航到 `/?theme=…` 再改 `location.hash`。

### 8.3 工作区权限（第 7 轮结论：根因是完整性级别，不是 ACL）

- 旧现象：只有工作区**根目录**对受限进程可写；`src/`、`docs/`、`tmp/` 子目录创建/删除被拒（`EPERM`/拒绝访问）。
- **实测根因不是 ACL 缺权**：用 `diagnose-windows-sandbox-acl` 脚本对 `D:\dsharness\src` 跑完并**验证通过**
  （`writeOwner: false → true`，报告 `acl-recovery/acl-report-*.jsonl`、回滚脚本 `acl-recovery/acl-backup-*.json.ps1`），
  受限进程**仍然**被拒。真正原因是**强制完整性级别**：根目录带 low mandatory label，子目录没有，
  受限进程以 `S-1-16-4096 (Low)` 运行 → 对中完整性的子目录写不进去；该脚本不修 SACL 标签。
- **现在的解法**：本会话已切到完全权限（danger-full-access），文件操作不再受限，删除/移动/子目录创建都正常。
  如果换会话又回到 workspace-write，这个缺陷会重现；届时优先**请用户把会话切到完全权限**，
  不要重复跑 ACL 脚本（已验证修不动它）。`acl-recovery/` 留着，是那次 ACL 授权的回滚凭据。


---

## 9. 设计决策记录（不要无故推翻）

1. **`liubai-v11.css` 原样保留**，所有应用侧调整写在 `liubai-app.css`（迁移期的 `liubai-bridge.css` / `liubai-compat.css` 已在第 24 轮合并进来并删除），便于日后对照参考稿升级。
2. **默认主题 = 参考稿自己的「深夜」**。早期曾临时用「纸白」因为旧页面在深色下不可读；应用层的旧类名映射解决后已切回。
3. **旧页面用映射层统一，而不是逐页重写模板**：早期 24 页逐个重写成本过高，且映射层能立刻解决"不可读"这个硬问题。**该策略已于第 23 轮完成收尾**：30 个路由页全部改成 v11 骨架，映射层只剩仍在用的历史组件/分支。
4. **HUD 用 `data-hud-rank` 1/2/3 表达**，而不是参考稿的 `DEFAULT_HUD_RULES` 名单：rank 1 常显、rank 2 级别 ≥2 收起、rank 3 级别 ≥1 收起。已按参考稿逐模块核对过（任务/习惯的统计块应在第 1 档就收起 → rank 3）。
   第 24 轮又逐条对照参考稿实现：`applyHudToSlide` 是"per-block 名单 + 该级别是否隐藏"，三种常见名单 `[]`/`[2]`/`[1,2]` 与我们的 rank 1/2/3 **等价**；
   外壳已具备参考稿的全部钩子（`.hud-toggle` 的 `data-level`/`aria-label`/`aria-pressed`、活动 slide 的 `data-hud`、`.hud-hidden`），无需改动。
5. **外壳不再强加标题栏**：页面自带 `.page-head`（旧）或 `useOwnSlideHead()`（新）即让位。
6. **外壳必须承接 `beryl-toast` 与 `beryl-save-state`**：这是全站的反馈通道，旧壳删掉后不接就会静默丢失。
7. **`useReferenceWorkspace` 只做追加**（`resolveCapture`/`addMatter`/`setMatterStatus`），既有方法与领域层、Repository 一律不动。
8. **`hidden` 属性在作者样式设了 `display` 时失效**——这是 `date-menu` 里"同步到所有模块"一直显示的原因，已在 `liubai-app.css` 用作用域规则恢复。
9. **特异性教训**：`product-ui.css` 的 `#app :where(input,textarea,select)` 与 `reference-stage.css` 的 `html.reference-stage body` 都带 id / 高特异性，普通 class 规则压不过；桥接层统一用 `html.liubai-active body #app …`（1,1,2）。踩过两次，别再踩。

---

## 10. 不要做

- 不要改 `liubai-v11.css` 本体（它是参考稿）
- 不要改领域层、Repository、Use Case 的业务语义（目标明确要求"业务逻辑与 Repository 不改"）
- 不要为了让截图好看而**编造数据**（参考稿那 16 处无来源的东西一律保持不显示）
- 不要在没跑 `vue-tsc` 与截图的情况下声称某页"迁完了"
- 不要把 `npm run build` 当绿灯：它因为 `vault-sync.ts:189` 一直红，只有 `vite` 转译能过
- 不要把 `.act` 当普通按钮用：它在参考稿里是 26×26 的图标动作按钮；带文字的按钮用 `.chip` / `.detail-btn`
- 不要再对子目录跑 `diagnose-windows-sandbox-acl`：已实测修不动（根因是完整性级别，见 8.3），
  正确做法是请用户把会话切成完全权限
