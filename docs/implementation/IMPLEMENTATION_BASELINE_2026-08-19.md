# Calmy Personal OS 完整实现总档案

版本：v1.0
原始建档/评审日期：2026-08-22（文件名保留原始建档日期）
当前事实校准：2026-08-29
性质：工程实现主档案 / 实现事实基线
上游设计源：[`docs/product/source/ORIGINAL_PRODUCT_DESIGN_2026-08-18.docx`](../product/source/ORIGINAL_PRODUCT_DESIGN_2026-08-18.docx)

> 2026-08-22 产品重审：当前产品范围、UI、工程停止线与路线图统一从 [`docs/README.md`](../README.md) 进入。本文件继续维护实现证据，但不再单独决定产品优先级。

## 0. 文档定位

本文件不是对原始设计的删减版，而是把原始产品设计转译为可实现、可验收、可持续更新的工程总档案。

后续约束：

- 原始 DOCX 与后续思想母本是产品意图的上游来源，本文件是工程实现事实基线；产品执行优先级由产品决策记录、[`CALMY_UNIFIED_PRODUCT_DESIGN_2026-08-29.md`](../product/CALMY_UNIFIED_PRODUCT_DESIGN_2026-08-29.md) 和 `OPEN_WORK.md` 共同决定。
- 所有产品设计必须落到“领域模型、命令、视图、开放格式、同步、测试”中的至少一项。
- 设计项没有验收条件，就视为尚未完成。
- 旧模块可以保留兼容，但不得继续形成独立数据模型和独立产品入口。
- 实现状态必须以代码、测试和可导出的数据格式为证据，不以页面存在作为完成依据。

### 状态定义

| 状态 | 含义 |
|---|---|
| 未开始 | 设计已记录，代码中没有可验证实现 |
| 骨架 | 已有类型、接口或占位页面，但不能形成完整闭环 |
| 部分实现 | 主路径可用，但存在明显缺口、旧模型或未覆盖场景 |
| 已实现 | 代码、测试、导入导出和主要边界均通过验收 |
| 已实现当前切片 | 当前验收范围已有代码、测试和实际入口，但原始设计总范围仍有明确缺口 |
| 本地规则 MVP | 已有离线规则建议和人工决策流程，生产级模型或服务层尚未完成 |
| 历史状态快照（已废弃） | 早期档案曾用“PWA 已验证，主存储未完成”描述阶段状态；当前持久化事实以第 17 节和 `docs/product/OPEN_WORK.md` 为准 |
| 待复核 | 已实现，但需要产品试用或真实 Vault/跨设备验证 |

## 1. 产品宪法

Calmy Personal OS 的核心不是任务清单，而是一个以现实为根、以人为上下文、以课题为主体、以行动和记录为证据、以关系和时间为导航的个人操作系统。

### 1.1 单一事实源

数据事实只有一份，页面只是不同视图。现实优先级为：

`现实 > 人 > 目标/方向 > 原则 > 过程 > 数据表现`

### 1.2 统一主链路

`Person → Relationship / Shared Space → Matter → Cycle → Stage → Action → Record`

资源、关系、结果、练习、洞察和种子可以从任意节点产生，但必须保留来源、时间和稳定 ID。

### 1.3 复杂度规则

- 顶层入口少而清晰，复杂度向实体详情、关系图和历史中下沉。
- Matter 是产品的主要承载主体，不把所有内容摊平成一级模块。
- Cycle 可多条并行，可暂停、重开、回退、跨阶段；不强制单向线性流程。
- 只有真正复杂的 Matter/Cycle 才创建子 Cycle，避免递归结构泛滥。
- Today 负责承载当下，不负责成为新的数据孤岛。

### 1.4 人与现实规则

- Person 是上下文，不是通讯录条目。
- Relationship 描述关系本身，Shared Space 描述共同生活/工作空间。
- 身体状态优先于心理负荷，负荷低时自动降低行动强度。
- 停止是合法状态；最小必要行动比虚假的完成率更重要。
- 负向记录、浪费、逃避和偏离必须可记录，但不能把所有娱乐都判定为浪费。

### 1.5 历史与开放规则

- 每个核心实体保留变更历史、来源、时间和版本。
- 任何同步冲突都不能静默覆盖。
- Open Format 使用 Markdown + YAML Frontmatter + Assets + Stable ID。
- 无插件也能导入导出；插件只负责增量同步、监听和更好的交互。
- 数据归用户所有，迁移、备份、恢复和离开系统必须可行。

## 2. 原始设计覆盖地图

下表把原始 DOCX 的章节映射为工程域。实现矩阵在第 10 节逐条列出验收条件。

| 原文范围 | 主题 | 工程域 |
|---|---|---|
| 0–1 | Personal OS、单一事实源 | 架构、公理、数据所有权 |
| 2–3 | Person、Relationship、Shared Space、Matter、Action、Record、Resource、Relation | 统一领域模型 |
| 4–6 | Cycle、Stage、五行流程、并行/暂停/回退 | Cycle/Stage 状态与视图 |
| 7 | 显性土、隐性土、资产库、资产生命周期 | Resource/Asset/Library |
| 8–9 | 生克、冲突与约束 | Constraint Engine、Trajectory |
| 10–11 | 矛盾、练习、知识、再次实践 | Outcome/Practice/Insight/Seed |
| 12–13 | 长期方向、节律、阶段 | Direction、Calendar、Review |
| 14–17 | Daily Opening、Today、Outcome/Practice、停止、复盘 | Today、Review、负荷调节 |
| 18–20 | 佛道理念、身体优先、心理负荷 | Policy、DailyState、AI 边界 |
| 21–23 | 负向变化、浪费/逃避、Trajectory、双时间轴 | Record、Trend、Calendar |
| 24–25 | 十神、五行行为流、Luhmann、旧模块回归统一模型 | Insight/Knowledge、导航重构 |
| 26–27 | Capture、AI 理解层 | Inbox、AI Suggestion、隐私边界 |
| 28–30 | IA、交互、技术架构 | AppShell、性能、PWA、无障碍 |
| 31 | Repository、历史、Open Format、Obsidian、同步 | Repository、Adapter、Bridge |
| 32–34 | 演进、产品宪法、Must Protect | DoD、回归清单、发布门槛 |

## 3. 目标统一领域模型

所有模型必须具备：稳定 `id`、`createdAt`、`updatedAt`、`revision`、`source` 和可追溯历史。实体的展示名称可以改变，稳定 ID 不得因重命名改变。

### 3.1 核心实体

| 实体 | 作用 | 必须保留的关系 |
|---|---|---|
| Person | 人及其作为现实上下文的长期资料 | Relationship、SharedSpace、Matter、Record、Resource |
| Relationship | 与 Person 的关系、边界、节律和状态 | 两个 Person、SharedSpace、Matter、Record |
| SharedSpace | 多人共同生活/工作/协作的空间 | 成员、Relationship、Matter、Action、Record |
| Matter | 当前现实矛盾/课题，产品主体 | owner、Person、Cycle、Action、Record、Resource、Relation |
| Cycle | Matter 内的一段主题性周期 | Matter、父 Cycle、Stage、Action、Record |
| Stage | Cycle 内的阶段，不强制线性 | Cycle、Action、Record、Outcome、Practice |
| Action | 可执行的最小行动 | Matter、Cycle、Stage、Today、Outcome、Practice |
| Record | 对现实的事实、观察、洞察、种子、复盘或负向记录 | 任意来源实体、Evidence、Relation |
| Resource | 可复用的资料、工具、模板、知识资产 | Matter、Cycle、Record、Insight、Asset |
| Relation | 实体之间的有向/无向语义关系 | source、target、relationType、证据 |
| Seed | 尚未成熟但值得保留的可能性 | 来源 Record/Insight/Matter、未来 Matter/Action |
| Insight | 从记录、练习和关系中形成的洞察 | 来源、适用 Matter/Person/Resource |
| Outcome | 结果/产出，区别于行动本身 | Action、Matter、Record |
| Practice | 可重复的做法，区别于一次性结果 | Action、Outcome、Insight、Matter |
| DailyState | 某天的身体、心理、负荷、实际节律 | Today、Record、Action |
| Asset | 二进制或外部资料附件 | Resource、Record、Matter、manifest |

### 3.2 轨迹

`Trajectory` 是与完成状态正交的现实趋势：

`advancing | stable | stalled | retreating | recovering | diverging`

Trajectory 必须支持手动记录、从历史推断和解释来源；推断结果不能覆盖用户明确输入。

### 3.3 状态与动作原则

- 状态变化必须通过领域命令完成，不能由页面直接改字段。
- 允许 `pause`、`reopen`、`back`、`complete`、`retire` 等非线性动作。
- Action 的 `done` 不代表 Matter 完成；Matter 完成需要现实证据和复盘确认。
- “停止”必须带原因、保护对象或下一次重新评估时间。

## 4. 视图与信息架构

一级入口保持少量稳定入口：

1. Today：Daily Opening、当前容量、核心行动、现实记录、晚间复盘。
2. Matters：按课题、Cycle、Stage 和 Trajectory 组织现实。
3. People：Person、Relationship、Shared Space 和共同事项。
4. Library：Resource、Insight、Seed、Asset 和知识网络。
5. Search：全局搜索、关系筛选、时间筛选、命令面板。
6. Capture：低摩擦收集，之后归类为 Person/Matter/Action/Record/Resource/Seed。

Review、Calendar、Graph 是跨域视图，不增加新的事实源：

- Review：按日/周/月/周期复盘。
- Calendar：日历时间轴与成长轴叠加。
- Graph：Relation、引用、来源、反向链接和共同空间。

旧模块 Inbox、Diary、Posts、Habits、Chars、Tasks、Goals、Finance、Pomo、Moments 必须逐步回归统一实体，不再作为平行一级数据系统。

## 5. Today 与现实节律

### 5.1 Daily Opening

每天只回答三类问题：

- 今天最重要的 1–3 件事是什么？
- 它们为什么重要，关联哪个 Matter/方向？
- 今天明确不做什么，以保护什么？

Today 必须同时显示：方向、当前身体/心理容量、最小必要行动、可选行动和保护项。

### 5.2 Outcome 与 Practice

- Outcome：这次行动产生了什么结果。
- Practice：哪些做法值得重复、调整或停止。
- Result/Practice 不能混为一个备注字段。

### 5.3 负荷调节

身体状态低或心理负荷高时，系统应降低建议行动的数量、强度和切换成本，并保留用户覆盖理由。

### 5.4 复盘

复盘顺序固定为：`observe → inspect → adjust`，最后可生成 Insight 或 Seed。复盘不得只生成 KPI 或完成率。

## 6. 冲突、约束与趋势引擎

系统需要识别以下冲突类型：

- 身体容量与行动强度冲突。
- 时间窗口与行动时长冲突。
- 目标方向与当前行动冲突。
- 资源可用性与行动要求冲突。
- Relationship/Shared Space 边界与个人计划冲突。
- 同一时间段多个 Matter 的竞争冲突。

引擎输出必须包含：冲突对象、证据、严重度、解释、最小调整建议、是否需要用户确认。建议不能直接改变用户数据。

## 7. AI 理解层

AI 只作为理解层，不能绕过领域层直接写入事实。

AI 可协助识别：Person、Domain、Matter、Stage、Action、Record、Resource、Outcome、Practice、Insight、Seed、Relation 和潜在冲突。

所有 AI 结果使用 `suggestion` 状态，必须保留：

- 原文和提取结果。
- 推断依据和置信度。
- 影响的实体及字段。
- 用户接受、修改、拒绝和过期记录。
- 隐私边界、来源和模型版本。

默认不上传敏感内容；网络调用必须可关闭，并且失败时不影响本地核心流程。

## 8. Open Format 与 Obsidian 规范

### 8.1 Vault 目录

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

### 8.2 文件约定

每个实体一个 Markdown 文件，YAML Frontmatter 至少包含：

```yaml
calmy_id: matter_xxx
calmy_type: matter
schema_version: 1
title: 示例课题
created_at: 2026-08-19T00:00:00.000Z
updated_at: 2026-08-19T00:00:00.000Z
revision: 1
source: calmy
```

扩展字段按实体定义保存。机器关系使用稳定 ID，人类可读关系使用 Obsidian 双向链接；两者必须能互相校验。

### 8.3 同步阶段

- 阶段一：无插件 Markdown/ZIP 导入导出。
- 阶段二：增量同步，使用 `revision`、内容 hash、manifest、`last_synced_at`。
- 阶段三：Obsidian 插件/Companion Bridge 双向监听和冲突预览。

同步要求：字段级 diff、可选择保留本地/使用外部/合并、冲突历史可追溯、删除采用显式 tombstone 或归档，不静默删除。

## 9. 工程边界

- Domain 不依赖 Vue 组件。
- Repository 负责持久化、历史和迁移；命令负责业务不变量。
- View 只消费领域查询结果，不直接拼装事实。
- Open Format 是稳定协议，不把当前 UI 字段名称当作外部协议。
- local-first、离线可用、PWA、备份恢复、数据迁移是 Must Protect。

## 10. 全量实现矩阵

状态会随代码和测试更新；本表是防遗漏清单。早期条目的“当前状态”可能仍保留阶段快照，最新实现事实和未完成边界以第 17 节及 [`docs/product/OPEN_WORK.md`](../product/OPEN_WORK.md) 为准。

| 原文章节 | 设计项 | 当前状态 | 目标实现 | 验收条件 | 实现批次 |
|---|---|---|---|---|---|
| 0–1 | 单一事实源、One Reality Multiple Views | 已实现当前查询切片 | 统一 Reality 查询层连接主要页面 | 同一实体可在 Today/Matters/搜索等视图读取 | P0 |
| 2 | Person | 已实现当前切片 | Person 模型、仓储、People 视图 | 可创建、搜索、归档并保留稳定 ID | P1 |
| 2 | Relationship | 已实现当前协作切片 | 关系模型、边界、共享上下文和协作写入 | 可创建关系；成员权限、共同 Matter / Action / Record 写入、blocked 隔离和操作者历史可追溯 | P1 |
| 2 | Shared Space | 已实现当前协作切片 | 多人共同空间、边界、共享上下文和协作写入 | 可创建空间；成员/owner 权限、共同实体写入、blocked 隔离和操作者历史可追溯 | P1 |
| 2–3 | Matter/Action/Record/Resource/Relation | 已实现当前切片 | 统一核心模型与兼容旧仓储 | 主要实体有稳定 ID、查询、导入导出和测试 | P1/P2 |
| 4–6 | Cycle/Stage、并行/暂停/回退/重开 | 已实现当前切片 | 一等 Cycle/Stage 模型与命令 | Matter 页可创建、绑定、流转，并按 Cycle 隔离 Action / Record，保留来源和历史 | P1 |
| 7 | 显性土/隐性土与资产库 | 已实现当前切片 | Resource/Asset 生命周期 | 可创建、过期、退休并关联二进制 Asset | P1/P2 |
| 8–9 | 生克流、冲突/约束引擎 | 骨架 | 可解释约束检测与建议 | 有证据、严重度、最小调整且不自动改事实 | P3 |
| 10–11 | Outcome/Practice/Insight/Seed | 已实现当前切片 | 结果、练习、洞察、种子分离 | 已完成 Action 可沉淀 Outcome/Practice；Insight/Seed 可在 Library 管理 | P1/P3 |
| 12–13 | 长期方向、节律、双时间轴 | 已实现当前切片 | Direction/Calendar/Review 视图 | Calendar/Review 已接入 DailyState、Trajectory 和 Matter | P3/P4 |
| 14–17 | Daily Opening、Today、复盘、停止 | 已实现当前切片 | Today 与 DailyState 现实承载 | Today 已接入容量、约束、负向记录与状态保存 | P3 |
| 18–20 | 哲学产品化、身体优先、心理负荷 | 已实现基础切片 | 可解释 policy 与负荷规则 | 约束和容量建议可解释；策略配置仍需深化 | P3 |
| 21–23 | 负向记录、娱乐区分、Trajectory | 已实现当前切片 | negative record、趋势推断与手动覆盖 | 有证据的趋势推断和 Review 展示；手动覆盖仍需深化 | P3 |
| 24–25 | 十神、五行行为流、Luhmann、旧模块回归 | 部分实现 | Library/Knowledge/Graph | Library/Graph/Relation 与旧模块已有统一读取入口；知识语义仍需深化 | P4 |
| 26 | Capture 低摩擦 | 已实现当前切片 | Inbox → 分类建议 → 确认落库 | 原文保留，建议可接受/修改/拒绝，兼容统一实体 | P4 |
| 27 | AI 理解层和隐私边界 | 本地规则 MVP | AI suggestion pipeline | 本地规则建议、隐私边界和人工决策已存在；模型/服务层仍待接入 | P4 |
| 28–29 | IA、交互、性能、无障碍 | 已实现当前切片 | Today/Matters/People/Library/Search/Capture | 主要表单、导航和状态控件已补标签；完整手工审计仍需完成 | P4/P5 |
| 30 | PWA、local-first、离线 | 已实现当前切片 | React 主路径使用 IndexedDB durable snapshot、outbox、恢复和异步 Repository；同步兼容 API 及 localStorage fallback 保留 | PWA、React 主路径持久化与恢复通过；旧 Vue 同步兼容层退出由 OW-06 管理 | P5 |
| 31 | Repository/Domain、历史、迁移 | 已实现当前切片 | 核心仓储、历史和兼容边界 | 主要领域命令/查询有仓储与测试；全域迁移仍需完成 | P1/P5 |
| 31 | Open Format Markdown/YAML/Assets | 已实现当前切片 | 全核心实体 Open Format | 可读 Frontmatter 已覆盖支持实体，payload_json 保留兼容兜底 | P2 |
| 31 | Obsidian Adapter/Bridge | 已实现当前切片 | 全实体增量双向同步 | 浏览器目录适配器、manifest、Asset、MessagePort、跨设备协议级回归、并发重复消息幂等、tombstone、增量差异、字段级冲突决策和 Admin 写回入口已覆盖；真实 Obsidian 实机验证仍需完成 | P2/P5 |
| 32–34 | 演进规则、Must Protect、产品宪法 | 部分实现 | 发布门槛与回归清单 | 每次发布执行矩阵与全量测试 | P5 |

## 11. 实现批次

### P0：基线与保护

- 新总档案、实现矩阵、版本策略。
- 保留原始 DOCX，不再从拆分文档推断需求。
- 建立全量验证命令和回归清单。

### P1：统一领域模型

- Person、Relationship、SharedSpace、Cycle、Stage、Resource、Relation、Seed、Insight、Outcome、Practice、DailyState、Asset。
- 统一实体元数据、历史、命令和 Repository 契约。
- 为旧 Matter/Case/Action/Record 建立迁移边界。

### P2：完整开放格式

- 扩展 OpenEntity、目录映射、manifest、资产引用、稳定 ID。
- 无插件导入导出所有核心实体。
- Obsidian Adapter/Bridge 支持全实体和冲突预览。

### P3：现实节律与推理

- Today 与 DailyState 完整闭环。
- Outcome/Practice、负向记录、Trajectory、趋势。
- 冲突/约束引擎和最小必要行动建议。

### P4：理解层与完整导航

- AI suggestion pipeline、隐私边界、接受/拒绝/修改历史。
- People、Library、Review、Calendar、Graph、Search、Capture 统一入口。
- 十神静态库、五行行为流和 Luhmann 风格知识连接。

### P5：可靠性与发布

- IndexedDB 主存储、离线、同步队列、备份恢复、迁移。
- 性能、移动端、无障碍、E2E、真实 Vault 验证。
- 发布前逐项核对第 10 节矩阵和第 12 节 Definition of Done。

## 12. Definition of Done

一项产品设计只有同时满足以下条件才可标记“已实现”：

- 有领域模型和稳定 ID。
- 有领域命令或明确的只读查询契约。
- 有 Repository 持久化和历史策略。
- 至少有一个实际视图或入口使用它。
- 能导出到 Open Format，并能从 Open Format 导入。
- 有核心边界测试和回归测试。
- 对冲突、删除、离线、权限或隐私有明确行为。
- 该项在实现矩阵中状态已更新，并注明验证证据。

## 13. 当前执行状态

> 以下为 2026-08-22 历史状态快照；当前未完成边界以第 17 节和 [`docs/product/OPEN_WORK.md`](../product/OPEN_WORK.md) 为准。

截至 2026-08-22，代码已经验证具备统一核心实体与 Reality 查询切片、Matter/Cycle/Stage 创建绑定与状态流转、并行 Cycle 的 Action / Record 隔离、Stage → Record 来源 ID / 查询 / 修订历史 / Open Format 导出、Relationship / Shared Space 的共同 Matter / Action / Record 查询、成员/owner 协作写入、blocked 边界隔离、操作者级共享历史审计、Outcome/Practice 当前沉淀入口、Today/DailyState/约束/负向记录、People/Relationship/Shared Space 基础边界、Resource/Asset 生命周期、Library/Review/Calendar/Graph/搜索接入、Capture 本地规则建议、可读 Open Format Frontmatter、Obsidian Adapter/Companion Bridge、浏览器目录 Vault 读写、全实体增量差异、字段级冲突决策、显式删除 tombstone 写回、PWA 构建、性能基线、八个领域异步 Repository 迁移入口和主要页面无障碍静态修复。

因此，本项目当时仍不能宣称“原始设计全部实现”。当前完成的是一组有代码、测试和构建证据的产品切片；全量共享边界、生产级 AI、真实 Vault 冲突流程、IndexedDB 主存储、发布级 UI E2E 与手工可访问性审计仍需继续，当前增量以第 17 节为准。

## 14. 防遗漏清单

### 已有代码与测试证据

- [x] Person / Relationship / Shared Space 模型、页面、共同上下文查询、成员/owner 写入权限、blocked 隔离和操作者历史审计测试
- [x] Matter / Cycle / Stage 创建、绑定、状态流转与并行 Cycle 隔离
- [x] Action / Record / Resource / Relation 当前查询、命令或页面切片
- [x] Outcome / Practice 当前沉淀入口，以及 Insight / Seed 的 Library 管理
- [x] DailyState / Today / Review / Calendar 当前闭环
- [x] Trajectory / negative record / entertainment distinction 当前推断与展示切片
- [x] constraint engine 当前规则、证据和建议切片
- [x] Capture / 本地规则 suggestion / privacy boundary / accept-modify-reject
- [x] People / Matters / Library / Search / Capture / Review / Graph 主要入口
- [x] Open Format 可读 Frontmatter、payload_json 兼容兜底、Asset 和 manifest 基础能力
- [x] Obsidian Adapter / Bridge、真实目录读写、增量差异、字段级冲突决策、tombstone 写回和同步测试
- [x] IndexedDB 持久镜像、启动恢复、durable outbox、失败重试、状态和备份边界测试
- [x] PWA 构建、类型检查、Node/E2E/PWA/全量测试证据
- [x] 主要页面导航、表单和状态控件的静态无障碍修复

### 活跃工作索引

活动中的未完成任务已经统一收口到 [docs/product/OPEN_WORK.md](../product/OPEN_WORK.md)，本节不再复制任务列表。
本档案只保留实现事实、验证证据和已完成切片；“当前切片已实现”不表示原始设计的全部范围已经完成。

## 15. 2026-08-22 实现对齐快照

> 本节为 2026-08-22 历史验证快照；测试数量和 PWA 文件数量不代表当前基线。

本节覆盖并刷新第 10、13、14 节中截至 2026-08-19 的旧状态。原始需求源仍是 [`docs/product/source/ORIGINAL_PRODUCT_DESIGN_2026-08-18.docx`](../product/source/ORIGINAL_PRODUCT_DESIGN_2026-08-18.docx)；本 Markdown 总档案是实现状态的唯一维护入口，不修改原始 DOCX。

### 已验证完成的当前切片

- 统一实体、兼容旧仓储和 Reality 只读查询层已接入主要页面及搜索。
- Matter 详情页已支持 Cycle/Stage 创建、Matter 绑定、状态流转和按 Cycle 隔离 Action / Record；Record 创建时校验 Stage → Cycle → Matter 归属、同步 Stage.recordIds，并展示历史回放。
- 已完成 Action 的 Outcome/Practice 当前沉淀入口；Library 可管理 Resource、Insight、Seed。
- Today 已接入 DailyState、容量、约束、负向记录和现实状态；Review/Calendar 已接入趋势与复盘切片；Today/Capture/Review/Matters 已有异步页面读取与核心写入路径。
- People 已覆盖 Person、Relationship、Shared Space 的基础创建和展示；Resource/Asset 已覆盖创建、退休、过期和资产引用切片。
- People / Matter 已接入 Shared Context：共同 Matter / Action / Record 查询、blocked 隔离、边界状态和共享历史展示。
- Relationship / Shared Space 已接入协作 Gateway：成员/owner 权限、共同 Matter / Action / Record 写入、blocked 拒绝、revision 冲突边界和操作者级共享审计；People / Matter 页面会使用该 Gateway 写入共享上下文。
- Capture 已保留原文，并支持本地规则建议、隐私边界及接受/修改/拒绝；接受 suggestion 的跨领域写入已切换为异步路径。
- Open Format 已覆盖支持实体的可读 Frontmatter；`payload_json` 仍作为兼容旧数据和未展开字段的兜底。
- Obsidian Adapter/Companion Bridge 已有 manifest、Asset、MessagePort、session、attach/detach；浏览器目录适配器已支持递归读写，Vault 同步已覆盖全实体增量差异、字段级冲突决策和显式删除 tombstone 写回；跨设备协议级回归已覆盖重连、并发重复消息幂等和 tombstone 回传。
- 新增 `obsidian-rest-adapter.ts`：对 Obsidian Local REST API 提供递归目录、文本和二进制读取；默认只读，PUT/DELETE 只有显式关闭 `readOnly` 才会暴露，避免误写用户 Vault。
- 实机探测记录：当前环境检测到 Obsidian 1.13.7 正在运行并存在打开 Vault，未发现本项目 Companion Bridge/MessagePort 插件 manifest；但现有 Local REST API 4.1.3 健康检查和鉴权后 `/vault/` 读取均成功，递归入口返回 10 项。此次只读探测未修改用户 Vault，因此仍不能把协议模拟写成真实 Bridge 实机证据。
- 主要页面已完成一轮静态无障碍修复；这不等同于完整人工审计。

### 当前验证证据

- IndexedDB 已补启动恢复、IndexedDB 原生 `pending_writes` durable outbox、localStorage 兼容 outbox 合并、串行重试 flush、运行状态和内部备份边界；同步 Repository 的纯 IndexedDB 主存储迁移仍未完成。
- IndexedDB durable snapshot、outbox 和 React 主路径异步 Repository 已完成；尚未退出的是同步兼容 API 与 localStorage fallback，不代表 React 核心页面仍使用同步事实源。
- Admin 已展示 IndexedDB ready/degraded、恢复键数、待重试写入和最近镜像，并提供手动持久化重试入口。
- 启动后同步 Repository 读取优先使用 IndexedDB KV hydrate 快照；IndexedDB 不可用时回退 localStorage，并由 `lsSet/lsRemove` 保持缓存一致。
- Admin 数据导出优先读取 IndexedDB 持久快照，IndexedDB 不可用时回退 localStorage 备份。
- 实体同步迁移计划和冲突扫描也优先使用 IndexedDB 持久快照，失败时回退同步缓存。
- KV 删除也进入 durable outbox，启动恢复会跳过 pending deletion，避免旧 IndexedDB 值复活。
- durable backup 和实体迁移计划读取前会先 flush pending writes，避免刚发生的 Repository 写入因异步事务尚未完成而被导出/迁移遗漏。
- Repository 已新增 `ready()` / `flushRepositoryWrites()` durable 边界：调用方可等待当前写入链，并获得 ready/degraded、pendingWrites 和错误状态；同步 API 仍保持兼容。
- 新增 `createAsyncCollectionRepository()` 迁移入口：读取优先 IndexedDB 快照，写入串行化并等待 durable flush；旧同步 Repository 仍作为兼容层保留。
- Today 已新增 `todayAsyncRepository`：在保持现有同步 API 兼容的同时，提供基于 IndexedDB durable snapshot 的异步 list/get/update/import/replaceImported/ready 迁移接口，并有专门回归测试。
- Action、Case、Unified 已分别新增异步 Repository 迁移入口，均保持原同步 API，并覆盖 durable snapshot、写入、导入/替换和 revision 边界测试；当前异步入口已覆盖 Today/Action/Case/Unified 四个领域。
- Capture、Record、Matter 已分别新增异步 Repository 迁移入口，均保持原同步 API，并覆盖 durable snapshot、写入、导入/替换和 revision/状态边界测试；当前异步入口已覆盖七个领域。
- Capture 的 `acceptSuggestion` 已支持异步跨领域创建；Matter 的 Cycle/Stage/Outcome/Practice 高级过程编排已切换到异步 Unified facade，旧同步 API 仍保留兼容边界。
- Calendar、People 的主要读取、人物主写入、Relationship/Shared Space 写入和共享上下文查询已切换到 async facade。Matter 的共享 Matter/Action/Record 写入、revision/command 日志、Matter mutation 与 Record revision 历史回放也已切换到异步边界。
- 新增 `save-state.ts` 统一广播 `saving / saved / pending / conflict / failed`，Today、Capture、Matter、People 的核心异步写入已接入；AppShell 顶部状态不再被普通同步事件覆盖，Today revision conflict 也统一带错误码。
- 新增 Case→Matter、Task→Action、inbox→Capture 的增量迁移：旧集合不删除、不更新，新实体写入稳定映射并可重复执行；旧 Cases、Tasks、inbox 路由改为兼容重定向，Reality 查询隐藏已迁移旧记录，源数据保留以支持回滚。
- 新增安全回滚入口 `rollbackLegacyMigration()`：仅删除 revision=1 且时间戳仍与源记录一致的迁移产物；用户已修改的 Matter/Action/Capture 会保留，映射也保留以避免旧数据重新形成双事实源。
- Social 已新增异步 Repository 入口，支持帖子、点赞、评论树和删除的 durable 写入；Action/Unified 异步 facade 的 mutation/command 日志已迁移到 durable async repositories，并保留同步 API 兼容。
- Capture suggestion 已支持默认 30 天的显式过期与批量过期，过期只改变 suggestion 历史状态，不写入实体、不改变原始 Capture。
- 新增 `CaptureText` 应用用例：原文先保存，suggestion 失败时返回已保存原文与待重试错误；新增 3 个用例回归测试。
- 新增 `AddActionToToday` 应用用例：创建行动与更新 Today 计划的跨仓储部分成功会显式返回；新增 3 个用例回归测试。
- 新增 `OpenToday` 应用用例：并行聚合 Today、Action、Matter、关系、共享空间和 Daily State，并由 Today 页面消费；新增 3 个用例回归测试。
- 新增 `RecordActionResult` 应用用例：关联行动完成与结果 Reality Record，空结果在写入前拒绝，记录失败显式返回半成功；Today 记录区已支持关联行动；`recordCommands` 已支持 command ID 幂等重试。
- 新增 `CompleteReview` 应用用例：只负责清理并保存四段 Today Review，保留 revision 乐观并发边界。
- 备份白名单已覆盖当前领域集合，导入删除键会同步删除 IndexedDB 镜像并等待 durable flush。
- 新增独立 UI browser smoke：验证 App 挂载、Today 默认路由、核心行动真实写入、关联行动→结果 Record 闭环、侧边栏收起/展开、390×844 移动布局、820px 平板无横向溢出与 44px 触控目标、More 抽屉展开和真实 Escape 关闭、Capture/Review 路由 active 状态、真实 Tab/Enter 键盘路径、记录区无横向溢出、Capture 原文保存、建议拒绝后原文保留、导出→清空→导入数据往返、刷新后本地数据恢复，并在页面内阻断外部网络确认离线 fallback。
- 新增真实形态迁移样本和回归：覆盖旧 Case/Task/inbox 的备份导出、隔离清空、导入、迁移、关系保持、源集合不变和用户修改后的受保护回滚；备份白名单已包含 `b_tasks`、`b_inbox`。
- 装饰性名句墙已改为纯本地语料源，首屏不再请求外部 Quote API，并有回归测试确认 `fetch` 不被调用。
- Graph 建立 Relation、Posts 创建/编辑/归档/删除，以及 Diary、Goals、Habits 的读取和写入已切换到异步 Repository 和统一保存状态边界，保留旧数据键与 URL；本段所述 Finance、Pomo、Inbox 的旧状态已在后续切片完成异步收口，当前仅保留兼容层复核。
- 新增浏览器性能基线 harness：记录首屏、DOMContentLoaded、load 和 Today/Capture 路由切换，并阻断外部网络；本轮运行首屏 690.5ms、DOMContentLoaded 402.9ms、load 409.5ms、Today→Today 18.4ms、Today→Capture 165.2ms，允许外部请求数为 0。
- 桌面 AppShell 已形成四边工作台：左侧主导航、顶部上下文/保存状态、右侧快捷动作、底部快捷命令；窄桌面自动收起右栏，移动端保留底部主导航。
- 新增 AppShell/Admin/Scene/旧入口静态无障碍回归测试，5/5 通过；完整移动端与屏幕阅读器人工审计仍未完成。
- 键级云端同步已接入删除 tombstone：本地删除写入 changes，推送 `deleted:true`，远端拉取删除本地快照且不再次生成本地 changes。
- `npm test -- --run`：53 个测试文件、260 个测试通过。
- `npx vue-tsc --noEmit`：通过。
- `npm run test:node`：15/15 通过。
- `npm run test:e2e`：22/22 通过，新增键级 tombstone 的 push、pull 和旧值不复活回归。
- `npm run test:idb`：浏览器运行时通过，覆盖 v2→v3 升级、`pending_writes` 重放、KV 写入、删除和 tombstone changes、未 await 写入后立即 backup/migration 的 durable flush，以及真实浏览器中的 async Repository durable snapshot。
- `node test/ui-runtime.mjs`：UI browser smoke 通过，覆盖 App 挂载、Home/Today 路由、侧边栏收起/展开、Capture 流程、导出→清空→导入数据往返、刷新恢复本地数据和外部网络阻断。
- `node test/performance-runtime.mjs`：浏览器性能基线通过，首屏、导航、路由切换均低于阈值，外部网络允许请求数为 0。
- `accessibility-static.test.ts`：5/5 通过，覆盖导航当前项、抽屉语义、状态区域、场景语义标签和旧入口重定向。
- `legacy-migration.test.ts`：1/1 通过，覆盖旧 Case/Task/inbox 增量复制、稳定映射、关联 Matter、源集合不变和修改后安全回滚。
- `capture-async-repository.test.ts`、`record-async-repository.test.ts`、`matter-async-repository.test.ts`：17/17 通过，覆盖 Capture/Record/Matter 的 durable snapshot、写入、建议过期、Stage 关联、导入替换、revision/状态冲突和 degraded fallback。
- `social-async-repository.test.ts`：5/5 通过，覆盖 Social durable snapshot、帖子、点赞、评论和删除边界；Action/Unified 异步日志回归已纳入对应异步 Repository 测试。
- `action-async-repository.test.ts`、`case-async-repository.test.ts`、`unified-async-repository.test.ts`：异步 Repository 回归通过，覆盖三个领域的 durable snapshot、写入、导入/替换和 revision 冲突边界；Unified 当前为 7/7。
- `collaboration.test.ts`：4/4 通过，覆盖同步兼容协作、异步共享 Gateway、成员权限、blocked 隔离、审计和 Matter/Record 历史回放。
- `obsidian-rest-adapter.test.ts`：3/3 通过，覆盖递归目录、鉴权、URL 编码、二进制读取、路径穿越拒绝和显式写入开关。
- `npm run build`：通过，生成 67 个 PWA precache URLs。
- `npm run test:pwa`：通过，67 个本地文件可用。
- `git diff --check`：通过；仅有既存 CRLF 提示。

### 活跃工作索引（统一入口）

活跃清单统一见 [docs/product/OPEN_WORK.md](../product/OPEN_WORK.md)；本档案只保留实现事实和验证证据，避免在多个历史文档中维护不同版本的待办。

## 16. 2026-08-24 P0 收口进度

- OW-01 已完成当前代码范围的真实形态迁移演练：`legacy-migration-sample.ts` 覆盖 Case → Matter、Task → Action、inbox → Capture 的备份导出、隔离清空、导入、关系保持、源集合不变和用户修改后受保护回滚；迁移回归 2/2 通过。
- OW-05 已完成：装饰性名句墙改为本地语料，核心首屏不再请求 Quote API；新增回归确认 `fetch` 调用次数为 0。
- OW-02 已完成当前 React 扩展范围：Graph、Posts、Diary、Goals、Habits、Finance、Pomo、Inbox 的直接同步写入已切换到异步 Repository；Finance 课题关联、Pomo 旧标量键和 Inbox 旧版转换均保留原有键与兼容撤销；Finance/Inbox 跨仓储流程已提取为 Application Use Case，并用 command journal、稳定 ID 和重复提交测试收口。
- 新增 durable 边界回归：旧标量键读写、CaseRelation 异步读写均有测试覆盖。
- OW-03 已推进：实体迁移回滚不再只改 localStorage，生产路径通过 `rollbackMigrationDurable` 写入 IndexedDB/outbox；IndexedDB 暂不可用时仍保留可重放回滚意图。
- 实体级同步的远端记录应用已改为异步 durable flush，避免 `syncEntityData` 在本地集合已变更但持久镜像尚未完成时提前返回。
- 实体级同步拉取应用前会读取本地实体变更日志，并按 `(updatedAt, device)` 做本地/远端 LWW 裁决；本地较新未上传时不会被旧远端覆盖。
- 共享协作异步创建/更新/状态变更/Record 修订支持调用方命令 ID；实体仓储和共享审计会复用重复命令结果，避免重试产生重复事实或审计。
- React Review 的 Action/Record 跨域证据查询已切到异步 Repository；同步 `listRealityDocuments` 仍保留给 Vue 兼容层和未迁移旧模块。
- 全量 React Reality 文档查询入口已改为 `listRealityDocumentsAsync`，Profile、Goals、Diary、Posts、Inbox、Admin 等页面不再直接调用同步查询。
- 当时验证（2026-08-24）：`npm test -- --run` 通过 56 个测试文件、273 个测试；`npx vue-tsc --noEmit` 通过；`npm run build` 通过并生成 27 个 PWA precache 文件；`npm run test:pwa` 和 `node test/ui-runtime.mjs` 通过。该行保留为历史快照，当前验证见下方 2026-08-29 校准段。

## 17. 2026-08-29 档案与实现再校准

本节覆盖上一节之后的当前事实；此前章节中的日期和测试数量保留为历史快照，不再作为当前状态引用。

- React 生产页面的完整 Reality 查询已统一到 `listRealityDocumentsAsync`；Profile、Goals、Diary、Posts、Inbox、Admin 和 Review 不再以同步 Reality 查询读取页面事实。
- 同步 `listRealityDocuments` 及 `src/core/modules.ts` 的 `statValue` reader 仍保留给 Vue/旧模块兼容边界；React bootstrap 不再注册同步统计 reader，React 主路径不会因启动而携带同步 Reality 查询入口。
- 实体同步拉取已在应用远端记录前读取本地变更日志并按 `(updatedAt, device)` 裁决；实际写入后等待 `flushRepositoryWrites()`，删除墓碑不会回环生成本地变更；键级立即同步的提前返回和启动自动恢复的云端分支均会继续执行实体同步。
- 共享协作异步创建、更新、状态变更和 Record 修订支持调用方命令 ID，重复命令复用原实体/审计结果；权限、revision 和 blocked 隔离边界保持不变。
- 当前验证基线：58 个 Vitest 文件、292 个测试通过；Node 15/15、同步协议 22/22、IndexedDB 浏览器运行时、`npx vue-tsc --noEmit`、`npm run build`、`npm run test:pwa`、性能基线、`node test/ui-runtime.mjs` 和 `git diff --check` 均通过。浏览器 smoke 已覆盖 React Admin、Vue `admin/advanced` 兼容页的实际加载及旧桥接卸载；业务集合值/实体日志同事务提交及 pending replay、首次实体同步完整合并确认、实体同步同设备版本递增、批量顺序、失败时不推进游标、实体/键级 pull cursor 与 push cursor 的 durable `meta` 确认、键级同步业务白名单隔离、Capture 决策跨集合幂等、React 全局搜索异步边界、React 页面同步 Reality 隔离、工作台键盘边界、键级同步/实体同步编排边界和 React/Vue 生产入口隔离已有回归；UI smoke 另已覆盖 320px Today/Capture/More 以及 CDP 200% page-scale 的布局视口检查；CDP 视觉视口与 DOM 坐标分离，真实缩放裁切仍属 OW-04 人工验收；构建仍有既有第三方注释与大 chunk 提示。
- 当前剩余任务仅以 [`docs/product/OPEN_WORK.md`](../product/OPEN_WORK.md) 为准：OW-04 的真实设备与辅助技术验收，以及后续 P1/P2 收口；OW-03 的同步统计/旧 Vue 查询兼容层复核已完成，旧 Vue 退出由 OW-06 管理；键级 LWW 的同 key 批次最终版本、同毫秒设备决胜和墓碑覆盖边界已在本轮补齐；已完成切片不再恢复为活跃待办。
- 本轮 OW-03 兼容复核还收紧了旧 Worker 全量写入回退：失败不再被吞掉，外层会保留待同步状态并进入统一错误处理；成功后才推进兼容同步完成状态。
- 本轮调用链复核确认：旧同步统计定义当前无生产调用；React Admin 统计使用异步 Reality 查询，Vue Admin 和未迁移 Vue 页面保留同步 Reality 查询，仅作为兼容层，待 OW-06 完成后再评估退出。
- OW-03 已收口：上述兼容层经过入口、调用链和 durable snapshot 复核，不再作为 P0 未完成项。
- OW-04 代码侧无障碍边界已补齐：React 登录错误使用 `role="alert"` 即时播报，React 导入文件控件提供明确 accessible name，390/320px More 抽屉 Escape 关闭后焦点返回触发按钮；移动底部导航在桌面通过媒体查询隐藏但保留焦点返回节点，避免设备视口状态抖动造成焦点丢失；UI smoke 已通过浏览器 AX tree 确认错误节点进入无障碍树；真实读屏、系统大字号和设备缩放仍待人工验收。
- OW-06 第一批清理已完成：未被生产路由引用的 `src/react/LegacyVueHost.tsx` 已移除；静态回归扫描整个 `src/react`，确认 Vue/Vue Router/Element Plus 直接依赖只存在于显式 `admin/advanced` 的 `LegacyAdminHost` 兼容桥，React 生产入口仍为唯一启动链。旧 `/app/cases`、`/app/cases/:id`、`/app/module/chars`、`/app/module/moments` 和未知 `/app/module/:id` 已在 React 路由补齐到 Matters、People、Posts、Inbox 的兼容重定向，并由 UI smoke 验证；其余 Vue 运行时依赖和旧路由继续等待真实回归与分批退出。
- OW-07 已完成三刀：`src/react/lazy-pages.ts` 集中维护 React 扩展页和兼容桥的懒加载注册，`src/react/AppShell.tsx` 收口工作台壳层与搜索弹层，`src/react/ui.tsx` 收口共享 Button、页面头部和焦点陷阱，`src/react/routes.tsx` 收口路由树、兼容重定向和 Suspense 边界；`src/react/App.tsx` 保持原有 URL、兼容行为和按需加载行为不变，页面状态仍是后续拆分范围。
