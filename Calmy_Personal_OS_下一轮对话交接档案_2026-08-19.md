# Calmy Personal OS 下一轮对话交接档案

> **历史交接**：当前续接入口为 [`Calmy_Personal_OS_下一轮对话交接档案_2026-08-22.md`](Calmy_Personal_OS_下一轮对话交接档案_2026-08-22.md)，产品文档入口为 [`docs/README.md`](docs/README.md)。

日期：2026-08-19
工作目录：`D:\dsharness`
原始设计源：`D:\dsharness\Calmy_Personal_OS_完整产品设计主档案_2026-08-18.docx`
当前实现总档案：`D:\dsharness\Calmy_Personal_OS_完整实现总档案_2026-08-19.md`

## 1. 用户当前目标

用户希望把原始产品设计主档案完整整理成新的 Markdown 总文档，并且后续所有代码都按照这份总文档实现。

用户明确要求：

- 使用 Markdown，不再使用 Word 作为后续工作文档。
- 审计时必须以原始 DOCX 为依据，不以拆分出来的文档作为设计源。
- 不要遗漏原始设计中的产品设计项。
- 继续分批实现，不能只停留在设计文档或局部 MVP 骨架。
- 当前产品不能在尚未完成时宣称“全部实现”。

## 2. 原始 DOCX 核心要求摘要

原始 DOCX 共约 583 个段落、31 个表格，主要设计要求如下：

### 产品原则

- Personal OS，不是普通任务清单。
- Single Source of Truth，One Reality Multiple Views。
- 现实优先于 Person、目标、原则、过程和数据表现。
- Person 是现实上下文，Matter 是主要产品主体。
- 数据实体与视图分离，页面不能成为独立事实源。
- 数据归用户所有，必须支持迁移、备份、恢复和离开系统。

### 统一领域链路

`Person → Relationship / Shared Space → Matter → Cycle → Stage → Action → Record`

同时需要支持：

- Resource
- Relation
- Seed
- Insight
- Outcome
- Practice
- DailyState
- Asset
- Trajectory

### Cycle / Stage

- 多 Cycle 并行。
- Cycle 可以暂停、恢复、完成、回退、重开、归档。
- Stage 不是强制单向线性状态机。
- 允许跨阶段、回退、暂停和重新开始。
- 只有复杂 Matter/Cycle 才创建子 Cycle。
- 五行/五阶段模型是产品过程语言，不是僵化流程。

### Today / Daily Opening

每天回答：

1. 今天最重要的 1–3 件事是什么？
2. 它为什么重要，连接哪个 Matter/方向？
3. 今天明确不做什么，以保护什么？

Today 还要承载：

- 身体状态。
- 心理状态。
- 当前负荷。
- 最小必要行动。
- 核心行动与可选行动。
- 实际现实记录。
- 晚间 observe → inspect → adjust 复盘。
- Outcome 与 Practice 的区分。

### 身体、心理、负向记录

- 身体容量优先于心理负荷。
- 身体或心理状态差时，自动降低建议行动强度。
- 停止是合法状态。
- 负向记录必须可记录。
- 浪费、逃避、退缩、损耗需要区分。
- 不能把所有娱乐默认判定为浪费。
- Trajectory 支持 advancing、stable、stalled、retreating、recovering、diverging。

### 约束与趋势

系统应识别：

- 身体容量与行动强度冲突。
- 心理负荷与任务堆叠冲突。
- 时间窗口与行动时长冲突。
- Matter 之间争夺注意力的冲突。
- 目标方向、资源和现实行动之间的冲突。

输出必须有证据、严重度、解释、最小调整建议，不能自动修改用户事实。

### AI 理解层

AI 只作为理解层，不能绕过领域层直接写入事实。

AI 可以识别：

- Person
- Domain
- Matter
- Cycle / Stage
- Action
- Record
- Resource
- Relation
- Outcome
- Practice
- Insight
- Seed
- 潜在冲突

AI 结果必须是可接受、修改、拒绝的 suggestion，并保留原文、推断依据、置信度、模型版本和隐私边界。

### IA / 入口

目标一级入口：

- Today
- Matters
- People
- Library
- Search
- Capture

Review、Calendar、Graph 是跨域视图，不应产生新的事实源。

旧模块 Inbox、Diary、Posts、Habits、Chars、Tasks、Goals、Finance、Pomo、Moments 应逐步回归统一领域模型。

### Open Format / Obsidian

默认 Vault 目录：

```text
00 Inbox/
10 People/
20 Matters/
30 Cycles/
40 Actions/
50 Records/
60 Resources/
70 Insights/
80 Daily/
90 Archive/
assets/
_calmy/manifest.json
```

格式要求：

- Markdown。
- YAML Frontmatter。
- Assets。
- Stable ID。
- revision。
- hash。
- manifest。
- 机器关系使用稳定 ID。
- 人类关系使用 Obsidian 双向链接。
- 无插件也能导入导出。
- 插件负责增量同步、监听和冲突交互。
- 冲突不能静默覆盖。
- 支持字段级 diff、保留本地、使用外部、字段合并和历史追踪。

## 3. 已创建的关键文档

### 当前唯一实现基线

[Calmy_Personal_OS_完整实现总档案_2026-08-19.md](D:\dsharness\Calmy_Personal_OS_完整实现总档案_2026-08-19.md)

该文档包含：

- 产品宪法。
- 原文章节覆盖地图。
- 统一领域模型。
- Today 与现实节律。
- AI 行为边界。
- Open Format 和 Obsidian 规范。
- 全量实现矩阵。
- P0–P5 实现批次。
- Definition of Done。
- 防遗漏清单。

### 其他已存在的拆分文档

这些文档是此前整理出的辅助材料，不是原始设计源，也不是唯一执行基线：

- `Calmy_MVP产品范围与不做清单_2026-08-19.md`
- `Calmy_领域模型与状态机_2026-08-19.md`
- `Calmy_核心用户流程与界面规格_2026-08-19.md`
- `Calmy_AI行为规则与开放数据同步协议_2026-08-19.md`
- `Calmy_产品决策记录与演进规则_2026-08-19.md`
- `Calmy_MVP验证与测试计划_2026-08-19.md`
- `Calmy_MVP实现路线与任务拆解_2026-08-19.md`
- `Calmy_领域命令与Repository契约_2026-08-19.md`
- `Calmy_Obsidian_Vault_Adapter协议_2026-08-19.md`
- `Calmy_Obsidian_Companion_Bridge协议_2026-08-19.md`

### 本交接档案

本文件用于下一轮快速恢复上下文，不替代实现总档案。

## 4. 已完成代码

### 统一领域模型

目录：`D:\dsharness\src\domain\unified\`

关键文件：

- `model.ts`
- `repository.ts`
- `index.ts`

已经定义并支持 Repository 的对象：

- Person
- Relationship
- SharedSpace
- Cycle
- Stage
- Resource
- Relation
- Seed
- Insight
- Outcome
- Practice
- DailyState
- Asset

统一元数据包括：

- `calmyId`
- `entityType`
- `createdAt`
- `updatedAt`
- `revision`
- `source`
- `archivedAt`

Repository 已支持：

- list
- find
- create
- update
- archive
- importEntity
- replaceImported
- mutation history
- command idempotency
- expectedRevision 冲突保护

### Cycle / Stage 命令

`src/domain/unified/model.ts` 和 `repository.ts` 已支持：

- `canTransitionCycle`
- `canTransitionStage`
- `transitionCycle`
- `transitionStage`

已经测试：

- planned → active
- active → paused
- paused → active
- planned → active
- active → completed
- 非法状态跳转会抛出 CoreDomainError

### Today / DailyState

`src/views/TodayView.vue` 已接入：

- DailyState 创建和更新。
- 身体状态选择。
- 心理负荷选择。
- 当前负荷持久化。
- 约束引擎建议。
- 最小必要行动提示。
- 原有 Daily Opening、核心行动、现实记录和晚间复盘。

### 约束引擎

目录：`D:\dsharness\src\domain\constraints\`

文件：

- `model.ts`
- `engine.ts`
- `index.ts`

当前支持：

- body_capacity
- mental_load
- time_window
- matter_competition
- protected_space

输出包括：

- finding
- severity
- evidence
- explanation
- minimumAdjustment
- minimumActionId
- suggestedActionIds
- reducedIntensity

### 负向记录

`src/domain/record/model.ts` 和 `repository.ts` 已扩展：

- RecordType 增加 `negative`。
- NegativeRecordImpact：`waste | escape | retreat | loss | other`。
- 增加 `recordRepository.createNegative()`。
- Today 记录区支持事实/观察与负向变化切换。

### Open Format

`src/core/content/open-format.ts` 已支持：

- 旧 Matter / Action / Record / Daily。
- 新统一 CoreEntity。
- People、Cycles、Resources、Insights、Daily 等目录映射。
- Stable ID。
- revision。
- manifest。
- asset references。
- Markdown 往返导入导出。

目前统一实体完整对象通过 `payload_json` 保证原样恢复，同时输出部分可读 Frontmatter 字段。后续仍需把所有核心对象进一步规范成更完整的人类可读 YAML 字段，减少对 payload_json 的依赖。

### Open Workspace

`src/core/content/open-workspace.ts` 已支持：

- currentOpenEntities 包含统一实体。
- 统一实体导出。
- 统一实体导入。
- 保留本地。
- 使用外部。
- 字段合并。
- 统一 Repository 冲突处理。

### Obsidian / Companion Bridge

已存在初版：

- `src/core/content/obsidian-adapter.ts`
- `src/core/content/companion-bridge.ts`
- `src/core/content/companion-bridge-runtime.ts`
- `src/core/content/companion-bridge-client.ts`
- `src/core/content/companion-bridge-transport.ts`
- `obsidian-plugin/`

已经支持：

- Vault 读写。
- Workspace 导入导出。
- manifest。
- Asset。
- MessagePort 传输。
- Bridge session。
- 插件 attach/detach。

但全量实体同步、真实 Vault 验证、冲突 UI 和删除/tombstone 仍需继续。

### People 页面

文件：`src/views/PeopleView.vue`

当前支持：

- 创建 Person。
- Person 列表。
- 搜索 Person。
- 归档 Person。
- 创建 Relationship。
- 创建 Shared Space。
- 展示关系双方和共同空间成员。

### Library 页面

文件：`src/views/LibraryView.vue`

当前支持：

- 创建 Resource。
- 创建 Seed。
- 展示 Resource。
- 展示 Insight。
- 展示 Seed。
- 退休 Resource。
- 退休 Seed。

### 路由和导航

已新增：

- `/app/people`
- `/app/library`

已接入：

- 桌面侧边栏。
- 移动端底栏。
- 移动端抽屉菜单。

## 5. 当前验证结果

最近一次验证结果：

- `npm test -- --run`
  - 24 个测试文件通过。
  - 106 个测试通过。
- `npx vue-tsc --noEmit`
  - 通过。
- `npm run build`
  - 通过。
  - Vite 生产构建成功。
  - 生成 68 个 PWA precache URLs。

构建中只有已有的 `@vueuse/core PURE` 注释警告，不是本轮新增错误。

## 6. 尚未完成的重要内容

### P1/P2

- Relationship 的边界、节律、共同 Matter、证据完整编辑。
- Shared Space 的权限边界、共同 Matter、共同 Action、共享历史。
- Matter 与 Cycle 的真正绑定和页面展示。
- Stage 与 Action/Record 的完整来源链。
- Resource / Asset 的过期、退休、版本、缺失生命周期。
- Open Format 全核心实体的完整可读 YAML 规范。
- 原始 DOCX 中 Cycle / Daily 的 ISO 日期示例兼容性。
- Open Format 当前仍依赖 `payload_json`，需要逐实体补齐字段解析。
- Obsidian 全实体目录、链接和冲突 UI。

### P3

- Outcome 与 Action 完成后的自动沉淀流程。
- Practice 从 Outcome/Review 中的生成和重复使用。
- Insight / Seed 从复盘中的明确生成流程。
- Trajectory 趋势推断。
- 负向记录与趋势之间的证据链。
- 更完整的约束类型：资源、目标方向、Relationship 边界、Shared Space 冲突。
- Calendar 的日历轴与成长轴叠加。
- Review 的周/月/Cycle 复盘视图。

### P4

- AI suggestion pipeline。
- AI 接受、修改、拒绝、过期历史。
- AI 隐私边界和离线降级。
- Capture 页面和 Inbox 分类流程。
- 全局 Search 不应只搜索旧 Case。
- Graph / Relation 视图。
- 十神静态库、五行行为流、Luhmann 知识卡片网络。

### P5

- IndexedDB 作为真正主存储，而不是 localStorage 主存储 + IndexedDB 镜像。
- 离线写入队列和恢复流程。
- 备份、恢复、迁移版本机制。
- 删除 tombstone / Archive 同步策略。
- 完整字段级同步冲突 UI。
- 真实 Obsidian Vault 测试。
- 性能、移动端、键盘、无障碍测试。
- 全量 E2E 回归。

## 7. 下一轮建议顺序

推荐继续顺序：

1. 给 Cycle/Stage 做实际 Matter 详情页和关系展示。
2. 增加 Outcome/Practice Repository 命令和 Action 完成后的沉淀界面。
3. 实现 Review/Calendar 视图，把 DailyState、Trajectory 和 Matter/Cycle 叠加起来。
4. 完善 Open Format 的逐实体可读 YAML，去掉主要实体对 `payload_json` 的依赖。
5. 将 People/Library/Matters/Search 统一到一个可搜索的领域查询层。
6. 实现 Capture → AI Suggestion → 用户确认 → 统一实体落库。
7. 完善 Obsidian 全量双向同步和冲突预览。
8. 最后再把 IndexedDB 主存储、备份迁移和发布级 E2E 补齐。

## 8. 下一轮开场提示词

可以直接把下面这段作为下一轮第一条消息：

> 继续执行 `D:\dsharness\Calmy_Personal_OS_下一轮对话交接档案_2026-08-19.md`。唯一设计基线是 `D:\dsharness\Calmy_Personal_OS_完整实现总档案_2026-08-19.md`，原始需求源是 `D:\dsharness\Calmy_Personal_OS_完整产品设计主档案_2026-08-18.docx`。不要重新从拆分文档推断需求，也不要宣称全部完成。按建议顺序继续：先补 Cycle/Stage 与 Matter 详情绑定，再做 Outcome/Practice 闭环，并运行测试和生产构建。

## 9. 注意事项

- 不修改原始 DOCX。
- 不使用 Word 作为新的实现文档。
- 不把当前骨架、路由或类型定义误报为完整产品实现。
- 不用旧的拆分文档替代原始 DOCX 做需求审计。
- 保留工作区中已有用户修改，不执行破坏性 git 操作。
- 文件编辑使用 apply_patch。
