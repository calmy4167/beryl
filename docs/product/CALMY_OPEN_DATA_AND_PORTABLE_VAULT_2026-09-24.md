# Calmy 开放数据与 Portable Vault 架构设计

> 日期：2026-09-24  
> 状态：规划提案；原则与阶段边界见 D-020，具体格式升级和实现门槛由 OW-23 管理。  
> 本文描述长期目标，不代表所有能力已经实现。当前产品本体服从 [Calmy 产品总设计](CALMY_PRODUCT_DESIGN_2026-09-19.md)；现有数据安全、Repository 和 Vault 契约仍有效。

## 1. 目的与数据所有权

Calmy 不应成为用户长期数据的唯一容器。用户即使停止使用 Calmy，也应能用普通文件、Markdown 编辑器、Obsidian 或其他工具继续阅读和迁移有长期价值的内容。

核心原则：

> 数据属于用户；Calmy 负责理解、组织与操作；开放格式负责让数据可读、可带走、可迁移。

这不等于“一切都是文件”或“用 Markdown 替代数据库”。业务页面不直接选择 localStorage、IndexedDB、Markdown 或 D1；页面通过领域用例与 Repository 工作，底层持久化和可携带表达由适配边界处理。

### 1.1 长期用户资产与运行数据

| 类别 | 示例 | 产品要求 |
|---|---|---|
| 长期用户资产 | Capture、事项/项目、人物、目标、日记、知识、问题、思考、阅读笔记、图片、PDF、视频 | 有稳定身份；可理解、导出、迁移和回导；关系可解释；附件尽量保留普通文件形态 |
| 软件运行数据 | 展开菜单、滚动位置、搜索缓存、临时索引、权限句柄、登录 Token、同步游标 | 只按运行、安全和恢复所需保存；不因为位于本地就自动成为用户内容 |

Token、凭证和文件系统权限句柄属于敏感/设备运行数据，不进入可分享的 Markdown 或普通 Open Format 导出；完整备份也必须沿用当前敏感键排除规则。

### 1.2 当前代码盘点（2026-09-24）

以下是基于当前仓库代码的静态能力快照，不代表线上部署或真实用户目录已完成验收：

| 数据/能力 | 当前实现证据 | Open Format / Vault 覆盖 | 未完成或风险 |
|---|---|---|---|
| 本地运行数据 | IndexedDB 的 KV 快照与 pending write/outbox 为 durable 边界；Repository 通过 `b_*` 同步镜像兼容旧读写 | 不适用 | 仍有正式旧集合和 localStorage 兼容路径；不可据此宣布 localStorage 已退役 |
| 结构化核心实体 | Matter、Action、RealityRecord、TodayPlan 与统一 CoreEntity 分集合保存，实体使用稳定 `calmyId` 与 revision | Open Format v2 有显式类型映射、Markdown/frontmatter 和 manifest，并兼容读取 v1 | 仍不是所有业务数据的统一实体；旧模块集合需独立纳入覆盖矩阵 |
| 遗留业务集合 | Tasks、Inbox、Habits、Goals、Finance、Diary、Chars、Posts、Moments、Pomo、Scene 等保留旧键/兼容读取 | 多数不在当前 Open Format `OpenEntity` 范围 | JSON backup 与云同步白名单覆盖并不等于 Markdown/Vault 已覆盖 |
| 原始 Capture 与 Suggestion | `b_calmyCaptures`、`b_calmySuggestions` 由独立 Repository 保存；备份白名单包含这些集合 | 不属于当前 Open Format `OpenEntity` 类型 | 若要作为可移植长期资产，需决定原始 Capture/Suggestion 的格式与转换来源边界 |
| 附件 | Core `Asset` 是元数据实体；实际二进制目前由 `openAssets` 集合保存为 Base64 字符串，键为 `b_openAssets` | Open Format/Vault 可把附件作为普通二进制资产、按路径/hash/MIME 与 manifest 引用往返 | `b_openAssets` 已加入 JSON Backup 白名单；隔离 Chrome profile 的 `test:idb` 覆盖 JSON-safe 备份恢复到真实 IndexedDB KV，并以 4 个共 16 MiB 的合成附件检查 JSON 序列化/解析和逐文件样本字节。本机单次数据只作 smoke 基线，不证明设备性能或浏览器配额上限；键级云同步仍不包含该集合，真实管理页文件选择导入 UI 和专用附件云存储仍待验收 |
| 云端 | Worker D1 提供通用键级同步与实体级同步 API；前端同步值加密后传输 | 不构成用户可读副本 | S3 当前同步对象名为 `beryl-data.json`，属于 JSON 快照路径，不是独立附件对象存储 |
| Vault | 管理页可让用户手动选目录、扫描差异、对冲突作决定并写回；选择后的目录句柄已保存于独立 IndexedDB，启动只查询权限，恢复授权需用户主动点击，断开/完整重置清除句柄 | 已有单实体文件、manifest、hash、资产引用与 tombstone 基础；生产句柄存储通过隔离 Chrome 的 OPFS 跨进程重启测试；实际 OPFS 文件适配器注入附件写失败后保留旧 manifest，并在重试后恢复 | OPFS 重启测试不等同于用户选择的普通磁盘目录；Picker 用户授权、真实目录权限恢复/撤销、断电/进程中止等设备级恢复、自动监听及长时间运行尚待实测 |

盘点结论：当前能力可支持“IndexedDB/Repository 运行面 + 手动 Open Format/Vault + JSON/key-sync 兼容面”的分层方向，但尚未形成覆盖所有长期资产的完整开放库。`b_openAssets` 的 JSON 备份白名单缺口已修复，需继续验证实际导入恢复；键级云同步仍未覆盖它，也不应在没有独立附件存储设计前将 Base64 大对象推入 D1。当前 v1 的明确支持范围和兼容停止线见 §6.1；原始 Capture、旧业务集合及更广泛附件仍在 v1 范围之外，后续纳入须另行评估，不能默认为已可移植。此结论只更新优先级，不授权改写现有存储键或实体 ID。

## 2. 总体架构目标

```text
Calmy UI（React 主路径 / Vue 兼容层）
             │ 用户意图
             ▼
领域模型 + Domain Command + Repository
             │
    ┌────────┼───────────────┐
    ▼        ▼               ▼
Runtime Store  Portable Vault  Cloud Sync
IndexedDB     Markdown/Files  D1（结构化同步）
    │                         对象存储（附件候选）
    └────── JSON 完整恢复备份 ──────┘
```

这是职责图，不表示所有箭头已经接通，也不要求 Repository 立即拆成多个新 Adapter。基础 Web 模式不依赖用户选择目录：以本地 Repository 和离线能力运行，并保留手动备份/导入导出；用户明确连接目录后才启用增强 Vault 工作流。

## 3. 各存储面的职责

| 存储面 | 目标职责 | 当前状态与边界 |
|---|---|---|
| Domain / Repository | 保存实体语义、稳定 ID、关系、版本和持久化结果；业务组件不直接绑定具体介质 | 已有多类同步/异步 Repository、统一实体、Domain Command 与 mutation log；并非所有旧模块都已迁移，也还不是一个完全可替换的通用 Storage Adapter |
| IndexedDB | Web 运行时的本地耐久存储、离线操作、变更/同步队列和高效读取 | 是当前本地 durable 权威边界；迁移及部分兼容路径尚未全域收口 |
| localStorage | 逐步收敛为轻量偏好、启动配置和旧版兼容镜像 | 当前仍有正式旧集合/标量及迁移回退用途；不能描述为“现在只存偏好”，也不能一次性清空或改键 |
| Calmy Open Format / Markdown | 面向用户的可读、可携带表达；前置元数据提供机器可恢复身份与关系 | 已有 v1 Markdown/frontmatter、manifest、资产引用、导入预览、稳定 ID/revision/hash 比较与冲突合并路径；覆盖范围服从已支持实体类型 |
| Portable Vault | 用户选择并持有的本地文件夹，与 Runtime Store 增量交换 Open Format 文件 | 已有 File System Access API Vault Adapter 与管理页的连接、扫描差异、决策、写回切片；浏览器支持、权限恢复、真实设备长期开启监听、可恢复写入等仍需验收，不能等同于全平台原生目录同步 |
| D1 / 云同步 | 跨设备传递结构化变化；不成为用户唯一副本 | 已有键级与实体级云同步边界；云端定位仍是同步节点/副本，不替代本地和开放导出 |
| S3 兼容对象存储 | 未来可承载二进制附件或远端副本 | 当前管理界面及连接实现包含 S3 兼容的 `beryl-data.json` 同步；这不自动等于已完成独立附件对象库、hash 去重与完整恢复闭环 |
| JSON Backup | 完整灾难恢复，包括数据库/兼容运行状态中恢复所需内容 | 与面向日常开放使用的 Markdown Vault 目的不同；继续保留并执行敏感数据排除与恢复测试 |

保存状态必须分别表达“本地 durable”“开放文件已同步”“云端已同步”。一个面的成功不能冒充另一个面的成功。离线、目录权限拒绝或云端失败不得阻止已有本地核心流程，也不得静默丢弃待写数据。

## 4. Domain 模型与稳定 ID

长期目标要求每个核心对象拥有稳定 ID、类型、创建/更新时间、revision、schema 版本、内容和关系。示例结构只表达目标语义：

```yaml
calmy_id: cap_01K...
calmy_type: capture
schema_version: 1
created_at: 2026-09-24T13:04:00+08:00
updated_at: 2026-09-24T13:04:00+08:00
revision: 3
relations:
  project_ids:
    - prj_01K...
```

约束：

- 名称、文件路径和分类均不可作为关系身份；改名或移动不得断链。
- 关系保存类型化稳定 ID；展示层可以额外导出 Wiki Link，但 Wiki Link 不是关系事实。
- 迁移先保留现有 `calmyId`、旧 ID、实体类型与 Repository 契约。`per_...` 等类型前缀只是命名提案；未完成碰撞、迁移、外部引用与回滚方案前，不重写现存 ID。
- 当前实体模型并未全部统一为 `id/type/schemaVersion/content/metadata/relations` 通用外壳。引入公共 envelope 或 `schemaVersion` 字段前，必须证明它比现有领域类型更安全，并提供双向兼容迁移。
- Domain Command 是有业务约束写入的入口；导入、同步和 Vault Adapter 不得绕过领域校验静默修改实体。

## 5. Portable Vault 目录与命名

期望的用户可读目录形态可按实体类别分组，例如：

```text
Calmy Vault/
├── Captures/
├── Matters/
├── Notes/
├── Daily/2026/09/
├── Projects/
├── Goals/
├── MasterData/
│   ├── People/
│   ├── Areas/
│   ├── Places/
│   ├── Tags/
│   └── Accounts/
├── Attachments/
└── _calmy/
    ├── manifest.json
    ├── schema.json
    ├── tombstones.jsonl
    └── version
```

目录名是建议，不是 v1 已承诺格式。未来主数据目录可按真实实体类型增加项目、知识、文件、书籍、物品等子目录；只在确有内容和使用场景时新增，不预建空壳分类。当前 Open Format 已使用 `10 People/`、`20 Matters/`、`30 Cycles/`、`40 Actions/`、`50 Records/`、`60 Resources/`、`70 Insights/`、`80 Daily/` 和 `_calmy/manifest.json`。既有 Obsidian Vault 路径必须继续按稳定 ID 识别；目录重排或从 `_calmy` 改名 `.calmy` 只能通过明确的格式版本和迁移实现，不能当作普通 UI 改动。

建议文件名由可读标题、短 ID 辅助识别；manifest 中的完整稳定 ID 才是身份依据。改名/移动时按 ID/hash 找回，不以路径判断实体是否相同。清理或删除 Vault 文件须先呈现差异和用户决定；manifest 最后写入，以降低中断时暴露半成品快照的风险。

## 6. Markdown、YAML 与 Manifest

Markdown 正文面向人类阅读；frontmatter 与 manifest 面向机器恢复。Open Format 应提供实体类型、稳定 ID、Schema/Format 版本、创建/更新时间、revision、状态、类型化关系和必要来源字段；内容字段以明确名称导出，`payload_json` 可作为兼容恢复载荷，但不能成为唯一可读内容。

当前格式使用 `calmy_id`、`calmy_type`、`b_version`、`revision` 等字段；`_calmy/manifest.json` 已记录实体 ID/类型/路径/revision/hash、资产路径/hash/大小/MIME 和正文附件引用，并能解析 tombstone。未来 schema 要求需向后兼容现有 `format_version: 1`；不允许仅凭标题/正文相同自动合并实体。

### 6.1 Open Format v1 冻结契约

本节冻结的是**v1 的兼容边界**，不是宣称 Portable Vault 已完成稳定版验收。2026-09-24 编写本节时，读写器均为 v1；自 2026-09-29 起写出 v2、同时读取 v1/v2，增量变化见 §6.2。v1 字段语义、身份和路径约定保持不变。

| 契约项 | v1 契约范围 |
|---|---|
| 实体 | 4 种既有 OpenEntity（Matter、ActionItem、RealityRecord、TodayPlan）及 13 种 CoreEntity（Person、Relationship、SharedSpace、Cycle、Stage、Resource、Relation、Seed、Insight、Outcome、Practice、DailyState、Asset），合计 17 种显式类型；类型由 `calmy_type` 标识 |
| 身份与版本 | 以现有 `calmy_id` 为实体身份；frontmatter 保存 `calmy_type`、`b_version: 1` 与 `revision`。TodayPlan 的现有身份规则按日期映射为 `daily_<date>`，不在 v1 中改成新 ID |
| 可读内容与旧载荷 | 导出同时写入可读 frontmatter/正文及 `payload_json` 兼容载荷。存在可读字段时，导入以可读字段为准；旧文件缺少可读字段时可从 `payload_json` 恢复。已知字段可往返；任意用户自定义 frontmatter、未知字段的保留不作承诺 |
| 关系 | 由各领域实体已有的类型化 ID 字段表达；v1 没有统一 `relations` envelope。文件移动/改名不改变实体 ID；但这不等于所有悬空关系都已具备全局校验和自动修复 |
| Manifest | 固定路径 `_calmy/manifest.json`，`format: "calmy-open"`、`format_version: 1`；记录实体 path/revision/hash、二进制资产 path/hash/size/MIME、识别到的 Markdown/Obsidian 附件引用，以及可选 tombstone |
| 附件 | 二进制 `OpenAsset` 是按相对路径、MIME 和原始字节处理的普通文件，不是 Base64 Markdown。Core `Asset` 则是 13 种 CoreEntity 之一的**元数据实体**，两者不是同一对象或可互相替代的记录。Manifest 的 FNV-1a hash 用于变化/损坏检测，不用于安全或防篡改证明 |
| 删除与边界 | Vault 差异流程可生成/保留 tombstone；普通工作区导出并不因此承诺完整历史删除日志。原始 Capture/Suggestion、遗留业务集合、UI/运行状态、认证信息及未进入当前 `OpenWorkspaceInput` 的数据不属于 v1 支持范围 |

兼容规则：

1. v1 的字段含义、实体身份、路径语义及可读字段优先级保持稳定；修复不改变这些语义，也不改变现有存储键/实体 ID。
2. v1 不承诺忽略后仍保留未知字段。因此，新增会丢失数据的必需字段、字段含义变化、实体身份或关系模型变化、二进制/Manifest 结构不兼容、目录约定变化，都不能冒充 v1 的安全扩展。
3. 导入器不支持的 `format_version` 或 `b_version` 必须明确报不兼容，不得降级解析、静默丢字段或覆盖用户文件。v2 已按新版本双读策略实施，具体兼容范围见 §6.2。
4. 本次补入统一 Core `Asset` 的可读 YAML 字段往返测试，只证明该实体已纳入 v1 映射回归，不证明真实用户 Vault、IndexedDB 备份恢复或附件云同步已通过验收。

### 6.2 Open Format v2：现实社交模型增量

2026-09-29 的多人现实数据模型实现需要表示规范 Thing、Scene、SceneParticipant、Space、Domain、Scope 与 Permission，因此新增 Open Format v2。导出使用 `format_version: 2` 与 `b_version: 2`；读取器继续接受 v1 Manifest 与实体文件，Matter 文件仍可导入，Thing 文件通过同一稳定 `calmy_id` 写回唯一 Matter 持久化仓库。v1 的字段语义和路径契约仍按 §6.1 保持；旧版读取器不保证理解 v2 新类型，不能把 v2 文件交给旧版读取器。

v2 为 Thing 与新增 Core 类型写出类型化可读字段和恢复载荷；新 Core 存储键纳入 JSON Backup 与实体级同步集合。Space 与旧 SharedSpace 的边界映射由显式 `SpaceCompatibilityProjection` 承载，转换不会创建额外事实副本或授予权限。新格式回归、旧 v1 文件读取、备份白名单和实体同步测试通过；这不是用户真实 Vault 目录迁移或多账号远端权限验收。

Manifest 的长期职责：

- 快速映射实体 ID、类型、路径、revision、hash 和最近更新时间；
- 记录附件元数据和正文引用；
- 支持变化发现、冲突审阅、Vault 修复和增量写入；
- 配合 tombstone 防止删除内容从旧设备/旧文件复活。

manifest 缺失、格式不支持、实体重复 ID、无法解析的正文/附件、缺失附件引用时，应显示可理解的问题并阻止危险写入。内容可解析但 hash 与 manifest 不同，表示文件可能在 Calmy 外被编辑：扫描应把它作为完整性警告和实体/附件冲突预览，要求明确选择或合并后才写回；不能把它静默覆盖，也不能仅因 hash 不同而让用户无法审阅有效编辑。孤儿附件可提示，不能自动删除。

## 7. 附件

图片、PDF、音视频等二进制数据不写为 Base64 Markdown 正文。Vault 中以原始文件和相对路径保存，Markdown 使用普通相对链接；manifest 记录路径、hash、字节数和 MIME。Runtime Store/Domain 只保留足以索引和关联的元数据；未来对象存储以附件 ID、hash、文件名、MIME、大小和位置作为同步元信息。

路径规范、同名策略、hash 去重、移动/改名、媒体预览、缺失恢复和云端对象生命周期都需要单独验收。当前 Open Format 已具备资产路径/hash/MIME/size 与引用校验的基础，但不代表所有业务附件都已完成 Vault+云端往返。

## 8. 创建、增量同步与删除

目标创建流：

```text
用户编辑 → Domain Entity / Command → Repository → 本地 durable 提交
                                              ├─ ChangeLog → 云端同步节点
                                              ├─ Open Format Writer → 对应实体文件 + Manifest
                                              └─ JSON Backup（用户发起/策略触发）
```

本地提交优先保证页面响应和数据安全；Vault/云端同步独立报告状态，可延后重试。正常修改只更新受影响实体文件与 manifest 条目，不重建整个 Vault。变更记录至少能支持实体 ID、操作、revision、时间和设备标识；删除以 tombstone/可恢复墓碑传播，不以物理删文件代替领域删除。写入任一实体或附件失败时应停止并保留旧 manifest 作为上次已提交基线；失败前已落盘的部分文件可能仍在目录中，必须返回错误并允许再次扫描/恢复，不能把部分结果报告成完整提交。

用户选择文件夹连接后，应展示权限状态、最近扫描/同步时间、待同步/冲突数量和失败原因。浏览器不支持目录 API、拒绝授权、离线或插件未连接时，Calmy 仍可使用本地模式与手动导入导出。

Capture 是捕捉入口，不是转化时可覆盖的临时草稿：用户可保持原始 Capture，也可在确认后基于它新建 Matter、Note、Task 或其他受支持实体；新对象与原始 Capture 之间如建立关系，应保存稳定 ID，不以复制标题或文件名代替来源关系。历史 Capture 不因整理、归类或转换而静默删除。

## 9. 外部编辑和冲突

外部编辑流程以稳定 ID 与格式版本识别，而不是文件名：扫描 → 解析 frontmatter/正文 → 校验 Schema、revision、hash、关系和附件 → 将可解析的 hash 漂移列为审阅警告 → 与本地 Repository 比较 → 展示差异 → 用户确认 → 走领域兼容导入路径 → 确认持久化 → 更新 Vault manifest。结构损坏、缺失引用及不兼容格式仍阻止写入；有效字段变化可进入冲突决策，不因旧 manifest hash 而被拒绝。

Calmy 与外部文件同时修改时禁止静默覆盖。冲突 UI 至少能区分 Calmy 版本、文件版本、revision/更新时间、字段差异，并在支持时提供逐字段合并；缺失文件、外部删除、tombstone、失效关系与缺失附件均需可解释处置。写入失败不能推进已确认 manifest，重试不得重复应用变更。

Obsidian 是一种可选编辑器和 Vault 客户端，不是 Calmy 的底层 schema 标准。`[[Wiki Link]]` 可作为阅读便利视图，真实关系仍以类型化稳定 ID 为准。

## 10. 首次连接与基础 Web 模式

首次连接通过用户手势选择目录，并先做只读检查：

1. 空目录：预览并确认初始化 Portable Vault 结构；
2. 已有 Calmy manifest：校验格式版本、实体数、附件和最近修改，再预览差异；
3. 普通 Markdown：只扫描用户显式选择的目录；提供“作为普通文件预览/导入”或取消，不自动把全文库接管为业务数据；
4. 权限不足、格式不兼容或文件缺失：显示原因与恢复选项，不清空现有目录。

网页基础模式继续为 IndexedDB + 现有手动导出/导入；目录连接是可选增强。目录权限句柄按浏览器安全模型处理，不能写入用户 Markdown、普通共享文件或敏感备份字段。

## 11. 数据所有权体验

未来“我的数据 / 数据与所有权”区域可说明：本地数据保存位置、Vault 连接状态、上次成功同步、实体/附件大致数量、完整备份与开放格式的区别、权限/离线边界，以及导出、导入、断开或迁移入口。容量/数量仅在能可靠统计且确有帮助时显示；不得以未经核实或装饰性指标制造信任。

数据健康检查可逐步覆盖重复 ID、无效关系、缺失/孤儿附件、Manifest/hash 异常、旧 Schema、未同步文件和冲突，并提供修复预览、备份/回滚与用户确认。禁止未经预览自动删除或自动合并。

## 12. 搜索与索引

开放文件负责可读和可携带，不能成为每次打开页面时扫描数千份 Markdown 并重算关系的运行数据库。全文检索和关系查询由 IndexedDB/搜索索引提供；索引可以重建，不得成为唯一事实源。扫描 Vault 是同步/校验流程，按 manifest、hash 与增量变化降低全目录重复解析。

## 13. Schema、版本与兼容迁移

长期结构演进使用显式 Schema/Format 版本和可测试迁移：旧版本 → 读取/预览 → 迁移 → 校验 → 写入新版本；旧文件须在兼容窗口可读。迁移前检查重复、悬空关系、损坏文件与备份；失败需保留原始数据并允许受保护回滚。增量实体 revision、文件 hash 与设备/来源版本共同用于冲突识别，不把单一时间戳当成所有场景的充分依据。

localStorage 业务集合只能逐批迁入 IndexedDB：先盘点读写方和键名，再 durable 导入、数量/hash 对账、双读/受控回退，之后才可停止旧写入；每一步需可验证回滚。`localStorage` 只有在覆盖与验证全部既有模块后，才能收敛为偏好和启动状态。

## 14. Storage Adapter 与代码边界

目标上，业务模块依赖稳定 Repository/领域接口，不依赖具体文件、浏览器 API、D1 或对象存储。IndexedDB、Open Format/Vault、JSON Backup、云同步可作为外部适配边界；每个 Adapter 都须共享 ID、revision、错误和冲突契约。

本提案不要求立即重构为某个固定目录树，也不要求将代码搬到 `src/core/domain` 等建议路径。当前主路径在 `src/domain`、`src/core/repository.ts`、`src/core/content/` 与同步模块；先由 OW-23 验证接口职责和真实用例，只有出现重复编排、测试困难或新介质接入成本证据后，才拆分代码结构。

职责上可评估 Domain、Repository、IndexedDB/旧键存储、Vault/Open Format、同步/冲突、附件和 Backup 的边界；这是一种候选职责图，不是必须照搬的目录树。页面只感知保存结果、离线/同步状态和需要用户决策的冲突，不直接编排目录或云 API。

## 15. 阶段实施顺序

1. **模型与所有权盘点**：列出长期资产/运行数据、实体 ID 与关系、现存 Repository/键、Open Format 覆盖、Vault/D1/S3 当前证据；明确兼容矩阵与不可改写边界。
2. **稳定本地运行面**：完成核心生产写入 durable 边界、localStorage 旧数据迁移策略和恢复对账；保持当前 IndexedDB 权威和 Repository 规则。
3. **Portable Vault v1 契约与实证**：以 §6.1 冻结的当前支持范围为基线，不扩展格式；使用代表性真实样本验证导出→外部编辑→回导、附件和错误恢复，确认差距后再提出版本化变更。
4. **增量 Vault 写入与扫描**：实现连接授权恢复、只写变化、Manifest 最后提交、外部变更发现、差异预览、冲突合并、故障重试/修复；拒绝权限不影响基本模式。
5. **反向同步与冲突收口**：验证 Obsidian/VS Code/Typora 等普通工具编辑的支持边界；测试并发修改、旧版本、删除墓碑、丢失附件和回滚。
6. **云和附件分工**：验证 D1 仅作结构化同步节点、对象存储负责附件的访问/隐私/成本/删除语义；不把已有 S3 JSON 快照连接 UI 误当作附件架构已完成。
7. **所有权与健康界面**：只有状态能真实测量后才展示 Vault、备份、冲突和健康指标；依真实故障补齐恢复。
8. **桌面模式评估**：Web 与开放格式长期往返成熟后，再评估本地 Vault-first 桌面应用，不提前创建另一套持久化事实源。

各阶段需有独立的测试、导入导出真实样本、损坏/权限失败测试和可回滚条件；不得以一次代码构建代替用户数据安全验收。

## 16. 当前验收线与停止线

近期可验收：现有 IndexedDB/Repository durable 边界；核心实体 Open Format round-trip；Vault 差异预览与明确冲突决定；备份恢复；权限失败不阻断本地使用；旧 ID 与关系稳定。

Portable Vault v1 作为稳定能力前，还须验证：

- 用户可独立阅读 Markdown 和附件，不依赖运行中的 Calmy；
- 全部纳入承诺范围的实体、关系、来源 ID、tombstone、附件与 schema 可往返；
- 单实体编辑只改必要文件，manifest/hash 与文件中断恢复正确；
- 外部编辑不会静默覆盖本地，导入路径通过领域/Repository 边界；
- 丢失附件、目录权限拒绝、浏览器重启、离线、同步失败与旧版本都有可理解恢复；
- D1/对象存储失败或 Calmy 不再可用都不会让用户失去本地/开放副本。

如果开放目录能力迫使基础 Web 用户授权、如果要扫描全盘/复制无关私人文件、如果冲突无法安全解释、如果格式升级要求直接重写旧数据，或如果存储抽象只增加层次却未减少风险，则暂停该阶段并退回手动导出/导入与现有本地 Repository。
