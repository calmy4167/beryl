# Calmy 产品设计包

> 产品设计对齐：2026-09-19。当前产品本体以 `CALMY_PRODUCT_DESIGN_2026-09-19.md` 与 D-018 为准；旧 Attention OS 总稿解释当前实现与迁移约束。已完成实现与剩余任务分别以实现总档案和 `OPEN_WORK.md` 为准。

> 账号与数据安全边界已由 2026-09-29 User Identity 设计和 2026-09-29 Accepted ADR-001 补充；二者约束全部产品模块。ADR-002 仍为待独立密码学审查的草案，不表示已启用跨用户分享。

Calmy 已从以 Matter 和四入口为中心的 Attention OS，转向“人与世界之间的反思层”。迁移不会直接删除旧数据和稳定实现，而是先验证自然语言处境、未来回望、外部工具上下文和现实反馈的完整体验。

## 当前裁决

- 产品从“我正在面对什么”出发，不要求用户先建立项目、任务或 Matter。
- 日常内容快速略过、留下或行动；只有高代价、低可逆和长期影响的处境进入深度反思。
- 未来回望同时呈现做与不做可能带来的后悔和庆幸，不能用恐惧推动用户服从。
- Word、Excel、IDE、Obsidian、Calendar、浏览器和通信工具负责专业工作；Calmy 保存它们与人、处境和决定之间的上下文。
- 唯识及其他思想影响数据结构和 AI 理解，不成为用户必须学习的页面概念。
- 长期模式和方向从有来源的经历中被观察出来，不由用户手工创建，也不能成为人格标签。
- `Today / Capture / Matters / Review`、Matter、Action、Record、Cycle、Stage、Trajectory 等暂为迁移兼容层；后续去留服从 OW-21 的验证和迁移设计。
- 生产前端现统一为 Vue 3；React 运行时代码、依赖和预览入口已从当前工程移除，配对截图保留为迁移验收档案。离线恢复、真实设备和人工可访问性检查仍按 OW-04 验收，不能由前端迁移测试代替。
- 设置与同步以 `/app/admin` 为唯一主入口，集中展示备份、同步、Vault 与实体迁移；旧 `/app/admin/advanced` 仅为兼容地址，不能再形成第二套设置体验。
- 账号由管理员创建并管理；管理员权限不等于私人业务数据读取权。个人数据归属、模块访问和数据解密分别服从已接受的 User Identity 设计与 ADR-001。
- 已接受 ADR-001：服务端负责身份、授权与密文同步，客户端负责解密和语义处理；必要的授权关系等控制元数据仍可能对服务端可见。

## 外部数据源规划

[飞书生活工作台规划](FEISHU_LIFE_WORKSPACE_PLAN_2026-09-19.md)对应 D-014（proposed）：飞书保存主数据，Calmy 提供更轻的访问与回顾。该提案形成于 D-018 之前，继续作为外部数据源与减少重复维护的参考，不定义新产品导航；当前四入口仍是兼容实现，IndexedDB 事实源边界保持不变。

[飞书官方能力同步清单](FEISHU_OFFICIAL_CAPABILITY_CHECKLIST_2026-09-19.md)对应 D-016：记录飞书多维表格官方能力、Calmy 适配状态、验收标准和后续同步规则。

## 文件说明

- [当前产品总设计](CALMY_PRODUCT_DESIGN_2026-09-19.md)
- [主数据与实体引用设计](MASTER_DATA_AND_ENTITY_REFERENCES_2026-09-24.md)
- [开放数据与 Portable Vault 架构设计（规划提案）](CALMY_OPEN_DATA_AND_PORTABLE_VAULT_2026-09-24.md)
- [Attention OS 迁移参考](CALMY_UNIFIED_PRODUCT_DESIGN_2026-08-29.md)
- [文档登记册](DOCUMENT_REGISTER.md)
- [文档与界面统一审计](DOCUMENT_AUDIT_2026-09-19.md)
- [旧产品重设计细节](PRODUCT_REDESIGN_2026-08-22.md)
- [旧 UI / UX 重设计细节](UX_UI_REDESIGN_2026-08-22.md)
- [工程评审](ENGINEERING_REVIEW_2026-08-22.md)
- [旧路线图与验收细节](ROADMAP_AND_ACCEPTANCE_2026-08-22.md)
- [产品评审会历史纪要](REVIEW_MEETING_2026-08-22.md)
- [当前未完成工作](OPEN_WORK.md)
- [项目文件架构](../PROJECT_STRUCTURE.md)
- [产品决策](PRODUCT_DECISIONS_2026-08-19.md)
- [User 身份与产品访问设计（已接受）](../superpowers/specs/2026-09-29-calmy-user-identity-and-product-access-design.md)
- [ADR-001：零知识优先的数据架构（已接受）](../adr/ADR-001-content-zero-knowledge-with-visible-access-metadata.md)
- [ADR-002：收件人密钥封套（草案，待独立审查）](../adr/ADR-002-recipient-key-envelope-protocol.md)
- [产品参考与领域协议](reference/README.md)
- [飞书数据适配与授权协议](reference/Calmy_Feishu_数据适配与授权协议_2026-09-19.md)
- [飞书生活工作台规划（提案）](FEISHU_LIFE_WORKSPACE_PLAN_2026-09-19.md)
- [飞书官方能力同步清单](FEISHU_OFFICIAL_CAPABILITY_CHECKLIST_2026-09-19.md)
- [原始产品设计源](source/README.md)
- [Obsidian 思想母本与模块库](../../Obsidian_calmy/README.md)

视觉资产：`assets/calmy-attention-os-ui-v2.png` 与 V1 均是 Attention OS 阶段的迁移参考；新产品总设计尚无经确认的视觉稿，两者均不代表新方向或实现验收证据。
