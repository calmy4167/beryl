# Calmy User 身份与全产品数据访问设计

**日期：** 2026-09-29
**状态：** Accepted（用户已确认）
**产品依据：** [`Calmy-多人场景-模块关系与数据共享核心设计方案.md`](../../../Calmy-多人场景-模块关系与数据共享核心设计方案.md)
**配套约束：** [`CALMY_OPEN_DATA_AND_PORTABLE_VAULT_2026-09-24.md`](../../product/CALMY_OPEN_DATA_AND_PORTABLE_VAULT_2026-09-24.md)
**加密决策：** [`ADR-001：Calmy 采用零知识优先的数据架构`](../../adr/ADR-001-content-zero-knowledge-with-visible-access-metadata.md)

## 1. 目标

建立统一的 Calmy 数字账号 User，并让账号身份、数据归属、共享授权、加密同步和历史记录贯穿产品全部模块。用户管理页只是账号管理入口，不能单独代表多人能力完成。

本设计沿用 Calmy 当前 Vue + Cloudflare Worker + D1 技术边界，吸收芋道/若依常见的管理员创建账号、账号状态管理和后台列表操作方式；领域对象与授权语义以 Calmy 多人场景设计文档为准。

## 2. 产品概念与不可变边界

### 2.1 User 与 Person

- `User` 是数字账号，承担认证、会话、设备同步、账号安全和云端身份。
- `Person` 是现实人物，可在没有 User 的情况下存在。
- Person 与 User 通过显式绑定关联。绑定本身不创建历史数据授权，也不让被绑定 User 自动看到以该 Person 为 Subject 的私人数据。
- 未绑定 User 的 Person 可以出现在 Relation、SceneParticipant 和 Space 成员关系中，但不能登录或凭现实参与获得数字访问权。
- 账号管理只处理 User；人物关系、家庭角色、现实参与仍属于 Person/Scene/Space 领域。

### 2.2 现实对象与内容数据

- `Thing` 是用户理解现实的“一件事”；现有 Matter/Case 只作为迁移兼容入口，不能让 Thing 与内容 Entity 在产品语义上混为一类。
- `Scene` 是 Thing 的阶段性情境；参与关系由 `SceneParticipant` 表达。
- `Space` 是长期关系环境，不是自动授权边界。
- `Entity` 是现实过程中产生的业务数据；`Domain` 归类生活领域；`Relation` 连接对象。
- 当前模块可以保留领域表或旧集合，但必须通过明确的适配映射接入统一归属和权限查询；同一份数据不因出现在多个 View 而复制。

### 2.3 管理员权限与内容权限

- 系统管理员可以创建、停用和管理 User，但不因管理员身份自动读取任何私人业务 Entity。
- 系统账号管理能力与实体级 `Permission` 分属不同边界。
- 不引入部门树或全局岗位体系。SceneParticipant 保存现实参与；Space 成员保存长期关系；具体授权仍由 Permission/Scope 表达。

## 3. User 管理与身份生命周期

### 3.1 账号创建

- 首个管理员通过一次性初始化流程创建，不开放公共自助注册。
- 后续 User 由具备账号管理能力的管理员创建，设置唯一登录标识和初始凭据。
- 首次登录要求用户更换初始凭据。凭据只以安全哈希形式保存在服务端。
- User 使用不可变的稳定 `userId`。用户名、邮箱和显示名均不得充当关系外键或 Permission principal。
- User 可显式关联一个主 Person；该关联可后续变更，但不能重写既有 Entity 的 owner、subject、actor 或历史记录。

### 3.2 登录、停用和退出

- Worker 负责登录认证、会话签发、刷新、撤销和账号状态检查。
- 前端本机 `b_auth`/`b_session` 与 Worker 全局同步密码退出多人身份事实源角色；兼容迁移完成后，所有业务写入和云同步使用当前稳定 User ID 与会话。
- 停用 User 会撤销其服务端会话并拒绝后续 API 访问；启用账号不会自动重新授予已撤销的 Entity/Scope 权限。
- 用户主动退出或切换账号时，当前本机活动数据集、查询缓存和同步游标必须与目标 User 隔离。

### 3.3 管理员重置凭据与数据恢复

- 账号登录凭据与内容加密密钥分离。
- 管理员可重置登录凭据、撤销会话；管理员不能解密 User 的私人内容。
- User 通过用户持有的恢复密钥恢复内容密钥。恢复密钥丢失且没有仍可解锁的设备时，加密内容无法由管理员恢复；产品必须在首次密钥建立时明确告知并提供安全保存流程。

## 4. 数据归属、隐私和授权规则

### 4.1 Ownership

每个可独立访问的 Entity 在客户端语义数据中至少保留：

```text
createdByUserId
ownerRef: User | Person | Space
subjectRef: EntityRef（可选）
stewardRefs: PrincipalRef[]
privacy
```

创建者、所有者、内容主体和管理者不能互相推导。例如妈妈记录爸爸的血压时，创建者和 steward 可以是妈妈，subject 与 owner 可以是爸爸。若 Person 尚未绑定 User，owner 仍可表达现实归属，但数字操作需要有权的 User steward。这些字段及其 Person/Space 语义保存在加密 Entity Payload 中；服务端仅处理同步和授权所需的不透明 ID 与授权关系。

新建个人内容默认 `owner = 当前 User` 且 Private。内容提及某 Person、关联某 Thing/Scene/Space 或由管理员创建，都不会改变 owner 或隐私。

### 4.2 Permission 与 Scope

- 动作范围限于 `view`、`comment`、`edit`、`manage`。
- 客户端依据 Scope 语义按明确禁止 > 实体明确允许 > Scope/上下文继承允许 > 默认拒绝，计算每个 Entity 的最终控制面授权关系。
- 服务端只执行已提交并确认的不透明授权关系；面向用户解释“为什么可见/不可见”时，由客户端根据本地加密的 Scope 定义及实体语义给出原因和规则来源。
- SceneParticipant 和 Space 成员只提供现实上下文。用户显式选择“参与这件事的人”或“这个 Space”作为可见对象时，系统才建立对应 Scope/Permission。
- Permission 只授予操作者自身有权授出的数据和动作；`manage` 是分享、删除或管理成员的最高业务权限。
- `Private`、`Restricted`、`Scene`、`Space` 是面向用户的隐私表达，保存时转成统一的实体或 Scope 权限，不形成各业务模块独立的 ACL。

### 4.3 共享和撤销

产品入口对应三种授权动作：

1. 共享一个 Entity：指定已绑定 User 与允许动作。
2. 共享一个数据范围：用 Person、Domain、Thing、Scene、Space 等过滤条件建立 Scope。
3. 邀请一起处理一件事：建立 SceneParticipant，并显式建立相应 Scope/Permission。

向未绑定账号的 Person 添加现实参与，不发送数字访问权。账号绑定后仍需通过明确操作确认授权。移除参与者或关闭关系会撤销之后的查询和同步权；不追溯删除其本人此前合法持有的导出/离线副本。

## 5. 全产品统一数据路径：授权与语义查询分离

访问一个实体必须先通过服务端授权，再由客户端理解数据语义。二者顺序固定，职责不可混合：

```text
用户操作
  ↓
客户端本地语义查询（已有的、已解密且已获准的数据）
  ↓ 需要取得/同步数据时
服务端授权查询（认证身份 + 不透明控制面 ID + Permission）
  ↓
返回获准的密文、Key Envelope 和同步元数据
  ↓
客户端解密
  ↓
客户端语义查询（Owner / Person / Domain / Relation / Scene / Space 等）
  ↓
View / Search / Graph / AI Context
```

### 5.1 服务端授权查询（Control Plane）

服务端只判断当前认证 User 是否有权取得指定的不透明 Entity 密文或提交指定动作。请求和授权索引可使用 User ID、Device ID、Opaque Entity ID、Opaque Scope ID、Permission、Controller、授权版本、同步序列和删除状态等控制面信息。

- actor 必须从认证 Session 得到，不能信任请求体声明的 User ID。
- Worker 按当前服务端已确认的授权关系及动作检查读取、推送、撤权和 Key Envelope 返回范围；无匹配授权时默认拒绝。
- 服务器不读取或执行 `ownerRef`、`subjectRef`、Person、Thing、Scene、Space、Domain、Relation 等语义谓词，不根据标题、Entity Type 或业务字段筛选数据。
- 客户端可以根据加密的 Scope 定义计算受影响的 Entity，并为每个 Entity 生成明确的控制面授权变更；服务端仅验证发起者当前是否有权管理该授权边，并记录不透明关系及版本，不解释 Scope 的含义。
- Scope 语义变化需要客户端重新计算并提交对应授权边。授权变更经服务端确认之前，UI 不得显示共享成功；长期离线造成的索引延迟要明确呈现。
- 服务端授权查询只返回密文、获准用户对应的 Key Envelope 与必要同步信息。对象数量、大小、时间和用户间授权关系可能泄露，属于 ADR-001 规定的元数据边界。

### 5.2 客户端语义查询（Local Semantic Plane）

客户端只对本地已解密且当前用户持有可用密钥的数据执行业务语义理解：

- 按加密 Payload 中的 owner、subject、steward、Person、Thing、Scene、Space、Domain 和 Relation 生成产品视图。
- 本地建立标题、正文和附件内容索引，执行 Search、筛选、排序和聚合。
- 本地构建 Graph、Review、Calendar、Today 和个性化 View。
- 为 AI 在本地查找当前用户获准的数据并形成最小 Context；向外部 AI 发送前由用户明确选择和确认。
- 未获授权的对象及其名称、关系、数量和存在性不得出现在客户端结果中，除非明确获准展示相应占位信息。

模块 View 只消费本地语义查询结果，不实现自有 ACL，也不直接访问未经授权的云端明文查询接口。服务端授权结果不能替代客户端语义过滤；客户端语义关系也不能扩大服务端授权。

所有写入通过统一领域命令路径：认证当前 User → 在本地校验数据操作与密钥能力 → 记录 actor、owner、subject、steward、版本和来源 → 加密本地保存 → 写入历史 → 排入同步队列 → 服务端按控制面授权校验并确认同步。

### 5.3 模块映射表

| 产品模块或能力 | 统一模型映射与约束 |
|---|---|
| User 管理 | User 与认证、账号状态、会话、恢复流程；管理员访问不扩展到私人业务数据 |
| People | Person、现实关系和显式 User 绑定；不能把 Person 记录等同账号目录 |
| Matters/Cases | Thing 的旧数据兼容入口；保留稳定 ID 和旧路由 |
| Scene | Thing 的阶段性上下文；SceneParticipant 表达现实参与，不直接授权 |
| Space | 长期关系环境及 Person 成员关系；成员关系不直接授权 |
| Tasks/Actions | 以 Action Entity 或兼容映射进入 Thing/Scene/Domain；写入者及 owner 明确 |
| Diary/Posts/Records/Notes | 作为内容 Entity；默认私人，主体 Person 与 owner 分离 |
| Finance/Health/Files/Assets/Events 等 | 由明确 Entity Type + Domain + Relation 表达；同一实体可同时关联多个上下文 |
| Capture/Inbox | 原始输入有创建者和隐私；转成业务 Entity 时保留来源，要求明确归属与可见范围 |
| Today/Review/Calendar | View；聚合授权查询结果，不持有副本或私有权限逻辑 |
| Search/Graph/AI context | 在客户端解密并索引当前 User 有权读取的实体；外部 AI 仅在用户逐次选择并确认内容后收到明文，不能因图谱占位、摘要或 AI 旁路泄漏受限内容 |
| Backup/Open Format/Vault | 往返 Entity ID、关系、Owner、Subject、Steward、Domain、隐私和历史引用；排除会话、令牌、密码与解密密钥 |

每一种仍处在旧集合中的实体都需要一条显式 Mapping Registry 记录：旧类型/集合、稳定 ID、canonical Entity Type、Domain 推导策略、默认 owner、privacy、关联字段、读写 Repository、导入导出和迁移规则。没有映射的旧类型不得默认为公开或跳过权限过滤。

### 5.4 View 与查询

- Today、各模块列表/详情、全局搜索、Graph、Review、Calendar、历史和 AI Context 均只消费客户端语义查询提供的、已经解密且经过授权的数据。
- 服务器授权过滤发生在密文同步返回之前；客户端语义过滤发生在 View 组合、排序和搜索索引之前。不得先从服务器取得无权密文再依赖组件隐藏。
- 对无权对象不展示内容、名称、数量、关联边或“受限对象存在”的提示，除非用户已获准看到该占位信息。
- View 面向用户使用“谁可以看到”“这是我的还是共同的”“为什么我能看到”等自然语言；不直接暴露 Entity、Principal、Scope 等术语。

## 6. 本机离线、云端加密和账号隔离

### 6.1 账号会话与内容密钥分离

- 登录 token 仅证明 User 身份，不作为 AES 内容密钥。
- Credential、Device Key、User Key、Content Key、Recovery Key 是不同密钥/凭据角色；登录密码不能直接等于或派生为内容密钥。管理员重置登录凭据不解锁用户 Vault。
- 私人 Entity 使用独立数据密钥加密；Entity 被授权给另一个 User 时，为其建立受保护的数据密钥封套。
- Worker 校验 User 会话及不透明 Entity ID 对应的授权关系、动作和版本，再返回已授权的密文和 Key Envelope；Worker 不持有内容明文或解密密钥。
- Person、Domain、Thing、Scene、Space 等语义关系及 Scope 定义/条件留在客户端加密内容中。客户端解析 Scope 并将范围物化为逐 Entity 的控制面授权关系；只有当前有权管理授权的用户才能提交变更，服务端不解释 Scope 语义。
- **D1 控制面：** 保存 Identity、Session、Device、Opaque Entity Header、Permission、Opaque Scope ID/成员关系、Key Envelope、Version、Sync Change Log 和 Audit Metadata。服务端可见必要 User ID、Opaque ID、授权关系、动作、Controller、版本、同步序列、删除状态、更新时间和大小等元数据。
- **R2 加密数据面：** 保存加密附件、图片、视频、PDF、大型 Payload 和加密备份；R2 只处理对象和密文。
- **IndexedDB 本地语义面：** 保存已解密 Entity、Relation、Domain、本地 Search/Graph Index、Pending Mutation、Sync Cursor 和本机 View Cache；按 User 隔离。
- 标题、正文、字段值、Entity Type、Domain/Person/Thing/Scene/Space 语义、Relation 语义、Scope 条件、文件名、搜索词和历史 patch 均不得以明文进入 D1、API 日志或错误遥测。
- 具体密钥封套原语需使用浏览器标准密码库并经过实现前的密码学与浏览器兼容性审查；不自行设计密码算法。

### 6.2 离线和撤权

- 保留现有本地优先与离线写入能力；本机 durable 保存状态与云端同步确认状态分开显示。
- 本机持久化、Repository 缓存、全文搜索索引、同步队列和游标均按 User 隔离。切换 User 不得复用上一个 User 的活动数据集。
- 离线设备可访问此前已下载并由用户本机密钥解锁的副本；停用账号或撤销权限在该设备重新连接校验前不能即时清除这些副本。
- 重新联网时，服务器拒绝已经无权的数据；未确认的本机写入保留为可解释的冲突/待处理项，不静默丢弃。
- 权限撤销阻止后续读取/同步并移除授权边和相应密钥封套；为避免被撤销者继续解密未来内容，轮换受影响 Entity 的数据密钥，并只向当前获准者分发新密钥。无法收回用户此前解密、复制或导出的明文。

### 6.3 同步隔离

- 键级同步与实体级同步均按认证 User 和服务端确认的不透明授权关系过滤；客户端传入的 owner、actor、Scope 语义或权限结论不可被 Worker 直接信任。
- 用户个人数据与授权 Entity 使用不透明稳定 ID；授权边通过最小非语义索引同步，Permission/Scope 的语义定义加密保存，并按 User 维护独立同步游标。
- 不再允许所有账号通过同一个 bearer 同步密码读取全局 `records` 和 `entity_records`。

## 7. 生命周期、历史与可携带数据

- 每个 Entity 的操作历史至少保留 created/updated actor、时间、来源、版本和变更引用。
- RealityRecord、实体 Mutation、协作审计是不同事实来源；统一 Activity View 只做可追溯投影。
- Scene 完成/归档不删除所关联数据；用户可通过“留下”将值得长期使用的 Entity 重新关联到 Person、Domain 或 Thing，不复制内容。
- Space 关闭、关系结束或成员离开不删除 Space、Entity 或历史。个人所有内容继续归原 owner；共同所有内容按原规则保留，并可显式更换 steward/owner。
- 删除 User 默认先停用、撤销会话并保留历史引用；涉及共同内容时必须先有明确 owner/steward 处理方案，不能级联删除。
- 导入时验证所有引用、Owner、principal、Scope 与 key envelope；冲突进入预览和审核，禁止自动扩大可见范围。

## 8. 旧数据迁移

### 8.1 首次初始化

1. 部署拥有者使用一次性初始化入口创建首个管理员 User。
2. 生成加密备份和只读迁移审计；先盘点本机旧数据、云端键记录、实体记录、Person、SharedSpace 和旧同步密码关系。
3. 现有单用户数据集归属首个 User，默认 Private；保留 IDs、内容、原 Mutation、来源和兼容键。
4. 若旧内容存在可验证的分享授权，可生成显式迁移候选供管理员审阅；无法验证的成员 ID、账号绑定或共享范围保持无访问权并报告问题。
5. 客户端解密旧密文并按新密钥体系重加密；分批提交并记录迁移游标，失败可恢复或回滚。
6. 新多用户同步验证完成后，再停用旧全局同步密码 API；迁移完成前旧路径只允许受控兼容使用，不与新用户共用可写数据池。

### 8.2 老记录所有权规则

- 旧 Matter/Thing 相同 ID 属于兼容投影，不创建重复事实。
- 旧 Person 不因姓名相同自动匹配 User；绑定必须显式确认。
- 旧 SharedSpace.memberIds 可能是账号 ID，也可能是现实 Person ID；未经确认不得重分类为新 User 或授权主体。
- 无 Owner 字段的旧私人业务记录归迁移源 User；Subject/Relation 等现有语义保留。
- 迁移报告列出所有未知 owner、无效引用、权限无法映射和密钥不可解密记录，提供人工处理入口。

## 9. 失败和边界行为

- 认证服务不可用：保留已登录设备上的本机工作能力，明确标记云端同步未确认。
- User 被停用：线上请求立即拒绝；离线设备按已知授权保留只读/可编辑缓存，重连后校验并处理待同步修改。
- Permission 冲突或引用失效：默认拒绝，显示可理解原因；不自动修复或扩大访问。
- 内容密钥不可用：不回退展示密文字符串，不覆盖原始密文；报告恢复或授权问题。
- 分享中途失败：不得让 UI 显示“已共享”，直到服务端确认授权索引和密钥封套可用。
- 导入/迁移部分失败：原记录与密文保留，可重试，写入幂等且留下审计。

## 10. 分阶段交付

### Phase A：身份与个人数据集

- 首个管理员初始化、管理员创建 User、登录/改密/停用/撤销会话。
- 稳定 User ID、User↔Person 显式绑定、账号与密钥恢复体验。
- 本机账号隔离、按 User 的云端个人数据分区和旧单用户迁移演练。

### Phase B：核心授权和协作

- Ownership、隐私预设、Permission/Scope 的端到端写入与服务端校验。
- 单 Entity 分享、Scene Participant 邀请、Space 显式 Scope 分享。
- 撤权、解释原因、操作历史和离线冲突处理。

### Phase C：全产品 Mapping 与 View

- 建立所有旧实体/集合 Mapping Registry。
- Today、业务模块、搜索、Graph、Review、Calendar、AI Context、导入导出全部经服务端授权同步与客户端语义查询两道边界。
- 逐个退役重复的模块级权限判断，同时保留数据格式和路由兼容。

### Phase D：历史关系与真实试点

- 关系关闭、数据沉淀、共同数据 owner/steward 变更流程。
- 真实用户试点、越权场景与撤回演练；隐私评审通过后才将分享入口作为默认产品能力。

## 11. 验收标准

1. 管理员可以创建、启用、停用和重置 User 账号；普通 User 不能管理账号。
2. User 与 Person 始终可区分；未注册 Person 可以参与现实场景但不可登录；绑定账号不自动授权历史内容。
3. 系统管理员不因管理身份读取用户 Private Entity。
4. 两个 User 的私人数据在列表、详情、搜索、Graph、Review、Calendar、AI context、备份和同步中互相不可见。
5. 用户显式共享 Entity、Scope 或 Scene 数据后，获准者仅可执行授予动作；Space 成员关系单独存在时访问仍默认拒绝。
6. Explicit Deny 覆盖所有直接/继承允许；无匹配授权时默认拒绝，并返回可解释的拒绝原因。
7. Worker 对每个读写/同步请求按认证 User 强制校验；伪造客户端身份、owner 或 scope 不能越权。
8. 云端 D1 不含业务明文；未经授权的 User 拿不到可解密密钥封套。
9. 账号切换不串本机数据、IndexedDB 元数据、搜索缓存、pending writes 或同步游标。
10. 离线保存不冒充云端成功；重连后的撤权写入有明确冲突处理且不丢数据。
11. 关闭/归档 Scene 或 Space、成员退出、User 停用不会级联删除仍有效 Entity 或历史。
12. 旧数据迁移前后 ID、来源、Mutation 和可读内容可验证；未知分享范围不会自动授权。
13. Open Format、备份和 Vault 不导出会话/令牌/解密密钥，能保留用户数据归属和关系并报告无法表达的授权信息。

## 12. 产品设计依据与需要保持的一致解释

本设计以多人场景方案第 3、4、9–11、19–30、31–37、39–45 节为领域规范。Space “成员不自动获得数据访问权”采用第 43 节原则作为一致解释：将 Space 选作数据受众时才建立显式 Scope/Permission，成员身份本身不授权。加密和服务端可见元数据遵循 [ADR-001](../../adr/ADR-001-content-zero-knowledge-with-visible-access-metadata.md)。

产品文档第 29 节的“家庭 Space 默认成员可以看”示例因此解释为：用户明确为对应 Space 建立默认可见 Scope，而不是加入 Space 后自动获得权限。后续如修订原产品文档，应同步改写这个示例，避免和全局原则冲突。

开放数据文档继续约束本机离线能力、云端只存密文、Token/凭据不进入用户导出以及保存状态必须区分本地 durable 与云端确认。

## 13. 实施前风险与待验证项

- 多用户端到端加密的密钥封套、换机、恢复、重置凭据、撤权密钥轮换需先做浏览器能力验证和独立密码学审查；服务器可见字段遵循已接受的 [ADR-001](../../adr/ADR-001-content-zero-knowledge-with-visible-access-metadata.md)。
- 现有同步协议的业务加密密钥与 Worker bearer 凭据共用；需要证明旧数据可完整解密、重加密和回滚。
- 用户离线后无法收到服务端撤权；设计只保证再次联网后的拒绝和同步屏蔽，不能收回已下载/复制数据。
- 文档覆盖全部现有旧集合仍需按 Mapping Registry 清点；Phase C 未完成前不得声称所有模块已接入统一权限。
- 本规格不等同于部署完成或真实多人试点通过。
