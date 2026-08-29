# Calmy 项目文件架构

> 更新时间：2026-08-29
> 本文描述当前仓库的真实入口、代码边界、文档分层和迁移兼容范围。

## 1. 生产启动链路

```text
index.html
  → src/react/main.tsx
  → src/react/bootstrap.ts / bootstrapData
  → src/react/App.tsx
  → src/react/lazy-pages.ts（扩展页与兼容桥的懒加载注册）
  → src/react/AppShell.tsx + src/react/ui.tsx（壳层与共享交互工具）
  → src/react/routes.tsx（路由树、兼容重定向和 Suspense 边界）
  → React Router + src/react/pages/*
  → src/application + src/domain + src/core
  → IndexedDB / localStorage 兼容层 / optional sync adapters
```

`src/main.ts`、`src/App.vue`、`src/router` 和 `src/views` 是 Vue 迁移兼容层，不是当前 `index.html` 的生产主入口。未被生产路由引用的 `src/react/LegacyVueHost.tsx` 已在 OW-06 第一批清理中移除；其余兼容层暂不直接删除，直到 `docs/product/OPEN_WORK.md` 的 OW-06 完成。

## 2. 目录职责

| 目录 | 职责 | 当前状态 |
|---|---|---|
| `src/react/` | 生产 React 壳层、路由、页面和样式 | 当前主 UI |
| `src/application/` | 跨实体用户用例，如 Today、Capture、Review、结果记录 | 当前写入编排边界 |
| `src/domain/` | Entity、状态机、Repository、查询、迁移和统一模型 | 领域事实与约束 |
| `src/core/` | 认证、存储、IndexedDB、备份、同步、开放格式、兼容层 | 基础设施，不由页面直接替代 |
| `src/components/` | Vue/历史共享组件及低频模块组件 | 迁移兼容，按 OW-06/08 清理 |
| `src/views/` | Vue 旧路由页面 | 迁移兼容 |
| `backend/` | Cloudflare Worker、D1、同步 API | 可选云端适配器，不是 local-first 核心启动依赖 |
| `obsidian-plugin/` | Obsidian 插件和 Vault 适配端 | 外部组件，协议/联调受 OW-13 管理 |
| `public/` | PWA manifest、图标和静态运行时资源 | 生产静态资源 |
| `scripts/` | 构建后预缓存和 PWA 校验脚本 | 发布工具 |
| `test/` | 浏览器运行时、E2E、性能、IDB、PWA 验证入口 | 运行时测试工具 |
| `src/__tests__/` | Vitest 领域、仓储、用例和组件测试 | 单元/集成测试 |
| `docs/` | 当前文档中心、产品基线、工程评审、实现档案和历史资料 | 唯一文档入口 |
| `prototypes/` | 未接入生产入口的一次性原型脚本 | 非运行时实验 |

## 3. React 页面分层

### 核心闭环

- `TodayPage`：Today 计划、行动、现实记录。
- `CapturePage`：原文保存和可拒绝 suggestion。
- `MattersPage` / `MatterDetailPage`：Matter 列表、详情和状态。
- `ReviewPage`：Today Review、证据和调整。
- `MemoryPage`：Fact / Reflection / AI Inference / Preference / Principle 分层与用户判断权；复用 Record/Insight，不新增记忆事实源。

### 参考产品页

- `CyclePage`：复用 Matter/Action/Today 数据的五行阶段视图。
- `ProfilePage`：复用 Reality、场景和现有模块的“我的”聚合页。

### 二级/兼容/实验页

`AdminPage`、`LibraryPage`、`CalendarPage`、`PeoplePage`、`GraphPage`、`ScenePage`、`InboxPage`、`TasksPage`、`TaskBoardPage`、`MemoryPage`、`HabitsPage`、`FinancePage`、`GoalsPage`、`PomoPage`、`DiaryPage`、`PostsPage`。其中 `TaskBoardPage` 是现有 Action 的看板视图，`MemoryPage` 是现有 Record/Insight 的治理视图；二者都不新增事实源。这些页面必须保留旧 URL 兼容，但不应重新形成独立事实源或绕过 Application Use Case。

## 4. 数据和写入边界

```text
React page
  → Application Use Case
  → Domain Command / Policy
  → Async Repository
  → IndexedDB durable snapshot + outbox
  → optional backup / Markdown / sync / Bridge adapter
```

核心页面不得直接把 `localStorage`、D1、Vault 或同步协议当作业务事实源。React 页面 Reality 查询、扩展页面的直接同步写入和当前 Finance/Inbox 跨仓储 Use Case 已完成第一轮收口；IndexedDB 权威边界的 OW-03 实施切片已完成，具体证据以实现基线和交接档案为准。旧同步 Repository、`src/core/modules.ts` 的同步统计读取和 `beryl-*` 键名只作为迁移兼容，React bootstrap 不注册同步统计 reader；新的核心写入必须经过统一异步边界和保存状态协议。

## 5. 文档架构

### 当前入口

- `docs/README.md`：全部文档导航和权威层级。
- `docs/PROJECT_STRUCTURE.md`：本文件，项目架构和文件放置规则。
- `docs/product/DOCUMENT_REGISTER.md`：文档状态登记和冲突处理。

### 当前产品文档

- `docs/product/CALMY_UNIFIED_PRODUCT_DESIGN_2026-08-29.md`：产品定位、Attention OS、信息架构、页面、AI、Flow、数据边界、验收和路线图的统一权威总稿。
- `docs/product/PRODUCT_REDESIGN_2026-08-22.md`、`UX_UI_REDESIGN_2026-08-22.md`、`ROADMAP_AND_ACCEPTANCE_2026-08-22.md`：已并入统一总稿的设计细节参考。
- `docs/product/OPEN_WORK.md`：唯一活跃的未完成工作清单。
- `docs/product/PRODUCT_DECISIONS_2026-08-19.md`：产品决策、废弃方向和变更纪律。
- `docs/product/ENGINEERING_REVIEW_2026-08-22.md`：当前代码差距、风险和目标架构。
- `docs/product/REACT_MIGRATION_2026-08-23.md`：React 迁移事实快照，下一步以 `OPEN_WORK.md` 为准。
- `docs/product/REVIEW_MEETING_2026-08-22.md`：历史评审会议记录。
- `docs/product/assets/`：当前与历史视觉设计资产；只作产品/体验参考，不作为实现证据。

### 领域与协议参考

`docs/product/reference/` 集中保存 2026-08-19 的领域与协议参考：MVP 范围、核心流程、领域模型、Repository 契约、AI/同步、Vault Adapter、Companion Bridge 和测试计划。它们不能覆盖当前产品重设计，也不再承载活跃任务。

原始 DOCX 位于 `docs/product/source/`，只读保留。

### 实现证据

`docs/implementation/IMPLEMENTATION_BASELINE_2026-08-19.md` 保留实现事实、测试证据和历史快照；`docs/operations/HANDOFF_2026-08-22.md` 保留当前工程续接入口；二者都不是产品优先级入口。两份文档的最新校准段落以 2026-08-29 为当前事实，早期日期仅保留历史上下文。

### 历史资料与原型

`docs/history/` 保存 Beryl 旧设计和历史代码审查；`prototypes/` 保存未接入生产入口的一次性原型脚本。两者都不能恢复已废弃产品范围。

## 6. 文件放置规则

- 新产品和 UX 总体变更：更新 `docs/product/CALMY_UNIFIED_PRODUCT_DESIGN_2026-08-29.md`；可执行裁决同时追加到 `PRODUCT_DECISIONS_2026-08-19.md`。
- 新未完成事项：只写入 `docs/product/OPEN_WORK.md`，不要新增临时任务文档。
- 新领域约束：更新 `docs/product/reference/` 中对应领域/协议参考，并在登记册标明来源。
- 新实现证据：更新实现总档案或迁移快照，不把完成项复制回活跃待办。
- 新测试入口：放入 `test/` 或 `src/__tests__/`，并在验证文档记录命令。
- 设计原型和一次性实验：放入明确的 `docs/` 或 `prototypes/` 子目录，不在根目录新增无说明脚本。

## 7. 本地/历史文件处理

- `_v1-backup/`、`.docx-review-2026-08-19/`、`.wrangler/`、`dist/`、`node_modules/` 属于本地备份、生成物或依赖目录，不作为产品源码和文档依据。
- `docs/history/` 是 Beryl 历史参考；保留其迁移证据，但新任务不得从中恢复旧产品范围。
- `prototypes/csdiy-p1.js`、`prototypes/csdiy-p2.js`、`prototypes/csdiy-p3.js` 是未接入生产入口的原型脚本。
