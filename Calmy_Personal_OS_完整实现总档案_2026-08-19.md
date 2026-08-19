# Calmy Personal OS 完整实现总档案

版本：v1.0
日期：2026-08-19
性质：实现主档案 / 唯一执行基线
上游设计源：`Calmy_Personal_OS_完整产品设计主档案_2026-08-18.docx`

## 0. 文档定位

本文件不是对原始设计的删减版，而是把原始产品设计转译为可实现、可验收、可持续更新的工程总档案。

后续约束：

- 原始 DOCX 是产品意图的上游来源，本文件是工程执行的唯一基线。
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

状态会随代码和测试更新；本表是防遗漏清单。

| 原文章节 | 设计项 | 当前状态 | 目标实现 | 验收条件 | 实现批次 |
|---|---|---|---|---|---|
| 0–1 | 单一事实源、One Reality Multiple Views | 部分实现 | 所有视图基于统一实体查询 | 同一实体在 Today/Matters/导出中一致 | P0 |
| 2 | Person | 部分实现 | Person 模型、仓储、People 视图 | 可创建、编辑、归档、导出并保留历史 | P1 |
| 2 | Relationship | 部分实现 | 关系模型与边界字段 | 两人关系可关联 Matter/Record/Space | P1 |
| 2 | Shared Space | 部分实现 | 多人共同空间模型 | 成员、共同 Matter、权限边界可追溯 | P1 |
| 2–3 | Matter/Action/Record/Resource/Relation | 部分实现 | 统一核心模型替代 legacy 平行模型 | 每类对象有稳定 ID、历史和导入导出 | P1/P2 |
| 4–6 | Cycle/Stage、并行/暂停/回退/重开 | 部分实现 | 一等 Cycle/Stage 模型与命令 | 可并行、暂停、回退、重开并保留历史 | P1 |
| 7 | 显性土/隐性土与资产库 | 部分实现 | Resource/Asset 生命周期 | 可标记过期、退休、版本和来源 | P1/P2 |
| 8–9 | 生克流、冲突/约束引擎 | 骨架 | 可解释约束检测与建议 | 有证据、严重度、最小调整且不自动改事实 | P3 |
| 10–11 | Outcome/Practice/Insight/Seed | 骨架 | 结果、练习、洞察、种子分离 | Action 完成后可分别沉淀四类内容 | P1/P3 |
| 12–13 | 长期方向、节律、双时间轴 | 部分实现 | Direction/Calendar/Review 视图 | 日历时间轴与成长轴可交叉查看 | P3/P4 |
| 14–17 | Daily Opening、Today、复盘、停止 | 部分实现 | Today 与 DailyState 完整闭环 | 身体/心理/负荷影响建议；复盘可生成 Seed | P3 |
| 18–20 | 哲学产品化、身体优先、心理负荷 | 骨架 | 可配置 policy 与负荷规则 | 规则可解释、可关闭、可测试 | P3 |
| 21–23 | 负向记录、娱乐区分、Trajectory | 部分实现 | negative record、趋势推断与手动覆盖 | 趋势有证据；娱乐不被默认判废 | P3 |
| 24–25 | 十神、五行行为流、Luhmann、旧模块回归 | 未开始 | Library/Knowledge/Graph | 可从记录形成卡片、关系和反向链接 | P4 |
| 26 | Capture 低摩擦 | 部分实现 | Inbox → 分类建议 → 确认落库 | 记录原文不丢失，分类可改可退回 | P4 |
| 27 | AI 理解层和隐私边界 | 未开始 | AI suggestion pipeline | 可接受/修改/拒绝；离线核心流程不受影响 | P4 |
| 28–29 | IA、交互、性能、无障碍 | 部分实现 | Today/Matters/People/Library/Search/Capture | 键盘操作、响应时间、移动端布局通过测试 | P4/P5 |
| 30 | PWA、local-first、离线 | 部分实现 | IndexedDB 主存储、同步队列、恢复 | 断网读写和重启恢复通过测试 | P5 |
| 31 | Repository/Domain、历史、迁移 | 部分实现 | 全域仓储、迁移和审计日志 | 版本升级不丢数据，历史可回放 | P1/P5 |
| 31 | Open Format Markdown/YAML/Assets | 部分实现 | 全核心实体 Open Format | 所有核心实体可无插件往返导入导出 | P2 |
| 31 | Obsidian Adapter/Bridge | 部分实现 | 全实体增量双向同步 | 字段级冲突预览、无静默覆盖 | P2/P5 |
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

截至 2026-08-19，现有代码已经具备 Matter、Action、Record、Today 的局部领域骨架、旧模块、统一核心实体模型/Repository 初版、统一实体 Open Format 往返初版、Obsidian Adapter/Companion Bridge 初版、约束引擎初版、Today 容量承载、负向记录、People/Library 初版页面、Relationship/Shared Space 创建入口、Cycle/Stage 非线性状态命令和基础测试；但 Outcome/Practice 自动沉淀、完整 AI 理解层、趋势推断、全量同步冲突 UI、IndexedDB 主存储和真实 Vault 验证仍未完成。

因此，本项目当前不能宣称“原始设计全部实现”。本档案的作用是把剩余内容固定下来，并按 P1–P5 逐批实现、测试、复核和更新。

## 14. 防遗漏清单

- [ ] Person / Relationship / Shared Space
- [ ] Matter / Cycle / Stage 的真实一等模型
- [ ] Action / Record / Resource / Relation
- [ ] Outcome / Practice / Insight / Seed
- [ ] DailyState / Today / Review / Calendar
- [ ] Trajectory / negative record / entertainment distinction
- [ ] constraint engine / inter-generation / anti-generation
- [ ] Capture / AI understanding / privacy boundary
- [ ] People / Matters / Library / Search / Capture / Review / Graph
- [ ] Open Format 全实体、目录、资产、manifest、版本和 hash
- [ ] Obsidian Adapter / Bridge 全实体双向同步和冲突历史
- [ ] local-first / offline / IndexedDB / backup / migration
- [ ] Repository / Domain 分离、历史、稳定 ID、数据所有权
- [ ] 性能、移动端、键盘、无障碍、E2E 和真实 Vault 验证

本清单只有在代码、测试和导出数据均有证据时才能逐项勾选。
