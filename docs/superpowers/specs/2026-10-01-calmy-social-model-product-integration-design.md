# Calmy 多人场景模型的产品层收口设计

## 目标

严格实现《Calmy 多人场景、模块关系与数据共享核心设计方案》的完整目标。该原始文档是最终范围和验收基准；本设计只安排实施顺序，不得缩减、改写或以阶段性切片代替任何原文能力。按可独立验收的切片交付，旧记录和稳定 ID 保持兼容。

## 范围权威与完成规则

- 最终效果必须逐项符合原始文档 §1–45 的对象语义、关系、归属、权限、生命周期、视图、用户流程和 MVP 范围；尤其覆盖 §40 的 Person、Thing、简单 Scene、Entity、EntityRelation、Participant、Private/Shared、基础权限和基础 Domain，以及 §41 的邀请共同处理与新增数据可见范围选择。
- 编码前建立“原始文档章节/要求 → 当前实现证据 → 待实现切片 → 验收证据”的追踪矩阵。任何原文要求没有实现或明确验证前，不能标记多人场景设计整体完成。
- 逐章基线矩阵见[实施追踪矩阵](../../product/CALMY_SOCIAL_MODEL_TRACEABILITY_2026-10-01.md)；它覆盖原文 §1–45，包括 §38 案例和 §40–41 MVP 用户流程，并随实现更新证据与状态。
- 原文中的分阶段设计（§44）用于排列工作：核心对象关系、模块关系、Relation、Ownership、Permission、Lifecycle、View。后续规范文档可以补充实现约束，但不能降低原文的最终行为、用户体验或数据边界要求。
- ADR-002 独立审查是跨用户加密分享的真实实施前置条件，不是删除或永久搁置原文分享目标的依据。审查未通过时，相关能力保持未完成并明确阻塞原因；通过后继续实现，直到达到原文验收。
- “已有模型/接口”“阶段已交付”及纯构建/单元测试结果均不等于整体完成；需要端到端行为、兼容迁移、真实权限边界和用户可理解性证据。

## 当前状态

- `Person`、独立的规范 `ImportantDate`、规范 `Thing` 兼容门面、真实 `Scene` / `SceneParticipant`、`Space` 兼容投影、`Domain`、`RelationDefinition`、`Ownership`、`Scope`、`Permission`、纯权限评估、历史投影、Open Format/Backup/实体同步登记及只读迁移审计已有实现。ImportantDate 以稳定 ID 独立存储、通过 typed Relation 关联 Person，支持年重复/单次和隐私归属，归档可恢复。
- `GraphPage` 已切换为由 `RELATION_DEFINITIONS` 提供关系语义和端点候选，隐藏 legacy compatibility 类型，按定义呈现有向/双向并过滤达到基数上限的节点；Repository 校验端点、方向和基数。`subject_of` 方向已校准为 Entity→Person，并声明逆向 `has_related_content`。图谱与关系聚焦回归已覆盖当前行为，其余模块和 MVP 流程仍待实施。
- `MasterDataPage` 现提供生活领域管理；`PeoplePage`、ImportantDate、Thing/Matter 详情、Action 任务和 Review 中的规范 Action/Record、Finance 旧条目、Library 中的 Resource/Asset/Seed/Insight 通过可选 `belongs_to_domain` Relation 选择领域。Graph 节点清单为其余支持归类的规范 Core Entity 提供通用 Domain picker。旧 Person 文本领域仍只作历史备注，不在创建时再复制写入；日记和其他 legacy 模块尚未迁移为稳定 Relation。
- 新增 `/app/reality-scenes` 现实情境页，与 `/scene` 的静态主题配置分开；支持创建可不关联 Space 的 Scene、关联既有 Thing、记录 Person 参与/离开和 Scene 状态转换。Space 可关闭/归档而不删除关联行；参与记录明确不授予数字访问。Scene 有稳定 order 字段并纳入 Open Format；新建时按 Thing 追加顺序，Matter/Thing 详情按 order 显示 Scene 并传递稳定 Thing ID。手动重排、Space 成员管理、数据保留集成验收及“留下”沉淀尚未完成。
- Matter/Thing 详情现显示按时间排列的关联 Scene，并把稳定 Thing ID 带入新增 Scene 表单；仍未实现 Scene 明细页、历史关系沉淀和端到端数据保留验收。
- Ownership 已扩展共同所有者集合和 Organization Principal/Entity，隐私标签可表达 Private/Restricted/Scene/Space，旧 `shared` 仅作兼容；Open Format/Backup/Sync 通过 Core Entity 注册继承这些字段。该元数据不会授予访问，按人执行和管理 UI 尚未实现。
- 新增 `RealityContextPage` 与纯函数 `buildContextualView`，通过同一 RealityDocument 投影按当前 User、Scope/Permission、隐私标签过滤；未授权/未知类型默认隐藏，页面复用原记录引用。ImportantDate 归属隐私默认 Private；关联 Person 本身不因此获得访问。由于服务端跨用户授权仍受 ADR-002 阻塞、现有数据尚未完成 Ownership 标注，该 View 暂不代表可用的多人协作流程。
- `module-catalog.ts` 已覆盖 route-manifest 的所有页面，记录页面视图角色、数据类型、规范仓库、Domain 能力、Reality Object 引用和稳定 ID 字段；页面录入 Reality Object 上下文的统一交互仍待阶段 B/D。
- 当前 `/scene` 页面管理主题和模块配置（`SCENES`），不是领域模型中的现实 Scene 实例；不得将二者合并或迁移为同一数据。
- 共享 UI、跨用户授权及服务端 grant/envelope API 尚未实现。ADR-002 仍为 Proposed，独立审查人尚未指定。
- `Ownership.privacy` 已有 `private | restricted | scene | space` 标签，并保留 legacy `shared` 兼容值；Private/Restricted 和 Scene/Space 的纯策略边界已实现，但用户编辑、服务端执行和完整格式回归仍待完成。
- 已有纯权限评估与 explainable reason 类型不代表原文 §21–30 的端到端共享、范围继承、冲突解释、界面呈现和服务端授权已完成。
- Scene 和已归档 Thing/Matter 的沉淀面板现可查看并处理 Action、Record、Resource、Asset、Finance、Relationship、Insight 和 ImportantDate；这仍不代表原文 §34 的全部旧模块、恢复、完整生命周期体验，或 §35 的关系结束处理和 §36 的多人个性化视图已完成。

## 原始文档逐章追踪

以下编号和要求均指向[原始设计方案](../../../Calmy-多人场景-模块关系与数据共享核心设计方案.md)。状态用于防止把相近的底层类型误报为完整产品交付；阶段名称对应下文实施分解。

| 原文 | 必须保持的目标 | 当前状态与后续阶段 |
|---|---|---|
| §1 | Calmy 表达现实中的人、事情、共同经历、数据归属、可见范围和经历结束后的沉淀。 | 仍是全项目验收目标；以端到端真实案例验收，不以对象注册完成代替。阶段 C–G。 |
| §2 | 明确系统核心对象及对象之间的边界。 | 规范模型已有首轮实现；须在其余阶段保持相同语义。阶段 A。 |
| §3–4 | User 是数字账号；Person 是现实人物锚点，可未注册、可绑定账号，不是通讯录副本。 | Person 与可选 `linkedUserId` 已实现；需完成关联账号真实身份、未绑定参与者和用户流程验收。阶段 A、E。 |
| §5 | Thing 是用户理解现实的“一件事”，不同于传统任务，可长期存在。 | Thing/Matter 同 ID 兼容门面已实现；底层仍使用 Matter Repository，产品界面尚未全面以 Thing 语义呈现。阶段 A、C。 |
| §6–8 | Scene 是 Thing 的阶段性现实情境，只存上下文/参与/时间/关联，不成为业务数据孤岛；简单事务可不暴露 Scene。 | Scene 和 Participant 模型/状态校验已实现；创建、关联多类 Entity、简单情境隐藏和生命周期 UI 未完成。`SCENES` 主题配置须保持独立。阶段 D、F。 |
| §9–11 | Space 是长期关系背景，不是权限边界；Scene 可以没有 Space，现实发生后才按需建立 Space。 | Space/旧 SharedSpace 兼容投影已有；自然语言管理、延后建立、关闭流程及权限边界尚无完整产品验收。阶段 D–F。 |
| §12–13 | Entity 是独立可关联的数据；Thing 是 Reality Object，不能再作为普通内容 Entity；既有业务内容保持一个事实源。 | 统一核心类型及兼容模型部分存在，但 Action、Record、Finance、文件等仍使用各自仓储/集合；尚无完整通用 Entity 读写/引用层。不得声称数据层已完全统一。阶段 B、C。 |
| §14 | Entity Type 表示数据形态，Domain 表示生活领域，两者分离。 | Domain 类型/格式已实现；真实领域目录、业务字段引用和旧实体逐步挂接尚未完成。阶段 B。 |
| §15–16 | 用户模块应是 Domain + Entity + Relation + View；同一 Entity 可同时关联 Person、Thing、Scene、Space、Domain、Time，数据不复制。 | 关系与多个上下文类型已存在，但非 Core 业务实体的统一挂接、模块分类矩阵和单实体多关系用户流程未完成。阶段 B、C、G。 |
| §17–18 | 关系必须类型化，并规定端点、方向、基数、逆向关系和约束；不能任意增长。 | RelationDefinition 和写入校验已有；GraphPage 仍用固定类型列表，选择流程未依定义过滤端点，也未完整呈现方向/基数/逆向约束。阶段 C。 |
| §19–20 | 数据分别记录创建者、所有者、主体、管理者；现实 Participant 不自动获得账号或访问权。 | Ownership 元数据和 Person/Participant 分离模型已有；组织所有者、各业务数据写入、归属选择/解释及实际账号权限联动未完成。阶段 D、E。 |
| §21–25 | 支持单 Entity 分享、数据范围分享、邀请共同处理，以及独立于数据模型的分享页面/交付层。 | Scope/Permission 模型与纯评估已有；分享入口、收件人选择、邀请、scope 维护、服务端授权、撤权及分享页面均未完成。阶段 E，受 ADR-002 门槛约束。 |
| §26–27 | 数据有 Private、Restricted、Scene、Space 可见范围；同一 Scene/Thing 同时容纳共享数据和私人数据。 | 当前隐私枚举仅 `private/shared`，目标范围尚未建模为完整可执行授权语义；不可把共同上下文推断为公开。阶段 D、E。 |
| §28–30 | 权限首版为 View/Comment/Edit/Manage；明确 Entity > Scope > Scene > Space 的允许/拒绝/继承优先级，并向用户解释原因。 | 四种 action 与纯评估 reason 已有；上下文级权限继承、真实授权执行、拒绝冲突端到端行为和自然语言解释页面尚未完成。阶段 E。 |
| §31–33 | Scene 可 Draft/Active/Paused/Completed/Archived；Thing 可跨多个 Scene；Scene 结束不删除 Entity 或历史。 | Scene 状态、Thing 引用及历史保留基础已实现；多阶段产品流程及真实关联内容在关闭/归档后的可追溯验收仍需完成。阶段 F。 |
| §34 | Thing/Scene 结束时提供“有什么值得留下”，把档案、文件、费用、关系变化、重要时间和经验重新建立长期关系，不复制数据。 | Settlement/沉淀机制尚未实现。阶段 F。 |
| §35 | 关系/Space 关闭后，私人数据各自保留访问权，共同数据按明确所有权处理；关系关闭不等于删除数据。 | Space 生命周期字段不构成访问权转移或撤权实现；离开、关闭、共同数据处置和恢复流程尚未完成。阶段 E、F。 |
| §36 | 同一 Thing/Scene/Entity 对不同的人生成不同 View，依据其授权和上下文显示不同内容。 | 已有基于同一 RealityDocument 投影的默认拒绝 filter 和 `/app/reality-context` 页；服务端授权、角色身份 View 与 Thing/Scene 完整聚合仍待 Stage E/G。 |
| §37 | 数据保存创建/更新者、来源、版本和历史，可追溯原值与修改。 | 多种 mutation/audit 来源已有只读归一投影；全部业务 Entity 的统一版本、actor/source/history 和用户查看能力尚未覆盖。阶段 D、G。 |
| §38 | “爸爸住院”案例完整贯穿 Thing、Scene、Participant、Domain/Relation/Ownership、邀请/权限、私人记录、完成沉淀及新情境复用。 | 尚无完整端到端案例。各阶段完成后必须按该案例做综合验收；分享安全门槛通过前，本项保持未完成。阶段 E–G。 |
| §39 | 前台用“人、这件事、和谁一起、谁能看到、我的还是我们的、结束后留下什么”等自然语言，不暴露底层技术词。 | 部分页面已有自然语言；多人核心体验页面尚未交付，需随各阶段做文案和用户理解验收。阶段 C–G。 |
| §40–41 | MVP 包含 Person、Thing、简单 Scene、Entity、EntityRelation、Participant、Private/Shared、基础权限、基础 Domain；用户可进入一件事、查看参与者/内容/时间并邀请共同处理，新增内容时选择可见范围。Space/简单 Scope 有基础支持。 | 现有对象层只覆盖部分；邀请、可见范围选择、简单 Scope、多人页面和新增内容隐私选择尚未完成。此 MVP 是首个整体产品验收门槛，但不能替代 §1–45 最终目标。阶段 A–F。 |
| §42–43 | 最终架构按 Person → Thing → Scene → Entity → Domain → Relation → Ownership → Permission → View → Settlement 组织，并遵守十二条原则。 | 其中若干对象/策略已实现，跨业务数据路径、归属与权限产品层、View 和 Settlement 未闭合。阶段 A–G。 |
| §44 | 依序完成核心对象关系、模块分类、Relation、Ownership、Permission、Lifecycle、View 的设计。 | 阶段 A 已有基础；阶段 B–G 按原顺序补齐，并在每阶段计划中保留此映射。 |
| §45 | 建成表达现实经历、参与者、数据、归属、可见性及经历结束后沉淀的系统。 | 总体验收声明；上述章节未全部实现并验收前保持未完成。 |

## 实施分解

### 阶段 A（原文 §2–8、§20）：核心对象与现实语义

保留已实现的 User/Person、Thing/Matter、Scene/Participant 和 Space 兼容模型；完成旧数据、单事实源、简单事务不暴露 Scene、真实参与不授予账号权限等验收。

### 阶段 B（原文 §12–16、§42、§44 第二阶段）：实体与模块分类

逐模块确定其为 Entity Type、Domain、View 或独立 Reality Object，并标出每类数据的唯一事实源及可关联上下文。Domain 目录与业务实体挂接渐进上线；避免复制数据或把旧模块包装成彼此隔离的数据库。

### 阶段 C（原文 §17–18、§44 第三阶段）：关系定义驱动的关系操作

让关系创建界面读取规范 RelationDefinition，先选关系语义，再只提供符合 from/to 类型约束的实体；清楚呈现方向和不适用状态。保存继续使用统一 Repository 校验，旧关系仍可读取和展示，新 UI 不创建未注册或不兼容的关系。

验收：候选实体集合与 RelationDefinition 一致；无合法端点时不能提交；创建失败保留用户选择并给出可理解错误；旧 Relation 和隐式关联在图谱中维持现状。

### 阶段 D（原文 §19–20、§37、§44 第四阶段）：归属与历史

将 Created By、Owner、Subject、Steward 应用到需要的业务数据；覆盖个人、共同、Space 和组织归属；让来源、版本和历史可追溯。为内容提供 Private/Restricted/Scene/Space 可见范围的语义字段，但所有授权行为仍须经阶段 E 实施。

验收：创建者/所有者/主体/管理者不互相推断；个人、共同、Space、组织所有权可表达；来源与历史不被关闭流程删除；隐私默认最小可见。

### 阶段 E（原文 §21–30、§35、§40–41）：完整访问和共享

实现单 Entity 分享、Scope 共享、邀请共同处理、页面交付层、私人/共同内容并存、四种权限、继承/显式拒绝优先级、原因解释、关闭关系后的权限处理，以及 MVP 的可见范围选择。

该阶段存在 ADR-002 安全审查前置条件：审查未通过时可继续非授权模型工作，但不能开放真实跨用户访问；该阶段和依赖它的端到端场景保持未完成。

### 阶段 F（原文 §31–35、§38、§44 第六阶段）：生命周期与沉淀

为真实 Scene 提供独立的查询、查看和生命周期操作，使用既有 Scene / SceneParticipant Repository。把参与记录与账号绑定分开；结束或归档 Scene 不删除 Entity、RealityRecord、Mutation 或审计历史。主题配置页保持现状并用文案/路由名称消除歧义。

增加 Thing/Scene 完成后的“留下”流程；按 Owner/隐私规则处理关系退出和 Space 关闭；把有价值的信息重新关联到长期对象，不复制业务数据。

验收：Scene/Space 的结束、归档、关系成员离开互不等同于删除；可追溯历史保留；沉淀通过关系指向原 Entity。

### 阶段 G（原文 §15–16、§36、§39–45、§44 第七阶段）：按人和情境生成 View

对同一 Thing/Scene 按当前用户、授权、场景、Domain、设备和任务生成不同 View；复用同一批 Entity 和 Relations，不创建视图副本；面向用户只显示现实概念，并用原文 §38 案例验证整套流程。

整体验收：普通用户无需理解 Entity、Scope、Principal、Grant、RelationDefinition 或 Ownership，即可完成 §41 用户流程；§38 案例中可正确隔离私人内容、邀请参与者、解释权限、结束 Scene、完成沉淀并在新情境复用。

### 安全实施门槛（覆盖阶段 D–G 中的跨用户部分）

只有在指定独立密码学审查人、收到带日期报告、解决 blocker/must-fix、接受 ADR-002 并固定库/协议/密钥核验/恢复轮换/浏览器矩阵后，才实施真实跨用户授权。审查未通过时，相关能力保持明确未完成；通过后继续按原文做，不把“单 Entity 单收件人”误当成原文完整共享目标。

## 兼容与工作区约束

- 不更改现有 Entity ID、Matter 持久化事实源、历史 key、旧格式兼容读取或主题配置 key。
- 新用户流程使用异步 Repository，并保留保存、冲突、错误和重试状态。
- 不把 SceneParticipant、Space 成员关系或 Domain 关联当作授权。
- 实施时只修改本设计对应的文件；保留工作区其他未提交修改，不提交、不推送。

## 交付顺序

A → B → C → D → E → F → G。此顺序严格映射原文 §44，仅表示先后，不表示原文任何要求可以省略。跨用户部分依照安全审查门槛暂停开放，但保留在最终范围内。每个阶段的实施计划必须带原文需求追踪项；在 §1–45 全部需求有实现和验收证据之前，整体任务保持未完成。每个阶段分别列出代码验收、兼容性验收和实际用户/设备验收，不以构建通过代替后者。
