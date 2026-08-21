# Calmy Personal OS 下一轮对话交接档案

更新时间：2026-08-22

## 1. 下一轮唯一上下文

项目目录：`D:\dsharness`

实现状态总档案：`D:\dsharness\Calmy_Personal_OS_完整实现总档案_2026-08-19.md`

原始设计需求源：`D:\dsharness\Calmy_Personal_OS_完整产品设计主档案_2026-08-18.docx`

规则：原始 DOCX 只读，不修改；实现状态以 Markdown 总档案为准；不要从旧拆分文档重新推断需求，也不要把当前切片宣称为全部完成。

## 2. 当前已完成的实现切片

- 统一核心实体、兼容旧仓储，以及连接主要页面的 Reality 只读查询层。
- Matter 详情页的 Cycle/Stage 创建、Matter 绑定、状态流转和并行 Cycle Action / Record 隔离。
- Stage → Record 来源 ID、创建入口、Stage/Cycle 查询、修订历史回放和 Open Format 导出。
- Shared Context 查询已覆盖共同 Matter / Action / Record、shared/allowed/blocked 权限边界和共享历史展示。
- Relationship / Shared Space 已接入协作 Gateway：成员/owner 编辑权限、共同 Matter / Action / Record 写入、blocked 拒绝、revision 边界和操作者级共享审计。
- Action 完成后的 Outcome/Practice 当前沉淀入口；Library 的 Resource、Insight、Seed 管理。
- Today/DailyState、容量、约束、负向记录、Review、Calendar 和 Trajectory 当前切片。
- Person、Relationship、Shared Space 的基础创建和展示。
- Resource/Asset 创建、过期、退休和资产引用切片。
- Capture 原文保留、本地规则建议、隐私边界、接受/修改/拒绝。
- Open Format 可读 Frontmatter；`payload_json` 作为兼容兜底。
- Obsidian Adapter/Companion Bridge 的 manifest、Asset、MessagePort、session、attach/detach；浏览器目录 Vault 递归读写、全实体增量差异、字段级冲突决策和显式删除 tombstone 写回；已补跨设备协议级重连、并发重复消息幂等和 tombstone 回传回归。
- IndexedDB 已补启动恢复、durable outbox、串行重试 flush、运行状态和内部备份边界；同步 Repository 的纯 IndexedDB 主存储迁移尚未完成。
- Admin 已展示持久层 ready/degraded、恢复键数、待重试写入和最近镜像，并提供手动重试入口。
- 主要页面导航、表单和状态控件的一轮静态无障碍修复。

## 3. 本轮文档对齐内容

已更新：`D:\dsharness\Calmy_Personal_OS_完整实现总档案_2026-08-19.md`

- 更新第 10 节实现矩阵中的过期状态，标记 Relationship / Shared Space 协作写入切片已完成。
- 更新第 13 节当前执行状态到 2026-08-22。
- 将第 14 节改为“已有证据 / 仍需深化”两部分。
- 新增第 15 节“2026-08-22 实现对齐快照”，固定当前完成切片、验证结果和下一阶段顺序。
- 补充 Companion Bridge 跨设备协议级回归、并发重复消息幂等和真实实机验证边界。
- 补充 IndexedDB 启动恢复、durable outbox、失败重试和状态/备份边界。

本文件替代旧的 2026-08-19 交接档案作为下一轮启动入口；旧文件保留作历史记录。

## 4. 当前验证结果

- `npm test -- --run`：35 个测试文件、169 个测试通过。
- `npx vue-tsc --noEmit`：通过。
- `npm run test:node`：15/15 通过。
- `npm run test:e2e`：19/19 通过。
- `npm run build`：通过，75 个 PWA precache URLs。
- `npm run test:pwa`：通过，75 个本地文件可用。
- `git diff --check`：通过；仅有既存 CRLF 提示。

代码变更可能与用户已有工作区改动混合，下一轮开始必须先执行 `git status --short`，不得使用破坏性回滚操作。

## 5. 尚未完成或需要深化的内容

按优先级排序：

1. Obsidian：真实 Obsidian 实机、Companion Bridge 端到端冲突流程和跨设备手工回归；协议级模拟已完成，当前环境无实机证据。
2. 存储可靠性：将现有 IndexedDB 持久层推进为同步 Repository 的主存储，并补离线队列、恢复、备份和迁移。
3. 发布质量：UI E2E、性能基线、移动端实机和手工屏幕阅读器审计。
4. 理解层深化：真实 AI provider/offline model、建议过期历史、知识网络沉淀和更细隐私策略。

## 6. 下一轮推荐执行顺序

先确认第 1 项是否有真实客户端；若当前环境仍无 Obsidian/插件实机，则保留阻塞证据并继续第 2 项，不要重新审计已完成的 Cycle/Stage/Record/Shared Context/Relationship/Shared Space 协作/Obsidian 同步当前切片；协议级 Bridge 回归已经完成，不能把它写成真实实机证据：

1. 使用真实浏览器目录选择 Obsidian Vault，并接入实际 Companion Bridge / MessagePort，准备两台设备或两个客户端的最小测试数据。
2. 手工验证全实体增量同步、tombstone、字段级冲突决策、权限边界、断线和重连行为。
3. 记录真实 Obsidian/插件/浏览器版本、设备和结果；若环境不可用，记录阻塞原因，不把协议级模拟宣称为实机证据。
4. 继续 IndexedDB 主存储迁移：让 Repository 读取路径使用持久层快照，并明确启动 readiness、离线写入队列、恢复、备份和迁移回滚边界。
5. 运行类型检查、全量测试、Node/E2E/PWA 测试和生产构建。

## 7. 下一轮开场提示词

可直接复制以下内容作为新对话第一条消息：

> 继续执行 `D:\dsharness\Calmy_Personal_OS_下一轮对话交接档案_2026-08-22.md`。设计基线是 `D:\dsharness\Calmy_Personal_OS_完整实现总档案_2026-08-19.md`，原始需求源是 `D:\dsharness\Calmy_Personal_OS_完整产品设计主档案_2026-08-18.docx`。先检查 `git status --short`，保留现有工作区改动，不修改原始 DOCX。先确认是否有真实浏览器、Obsidian Vault 和实际 Companion Bridge；若没有，就记录实机阻塞，不把协议级模拟宣称为实机证据，并继续 IndexedDB 主存储迁移：推进 Repository 持久读取、readiness、离线队列、恢复、备份和迁移回滚。不要重新从头做 Cycle/Stage/Record/Shared Context/Relationship/Shared Space 协作当前切片。完成后运行类型检查、全量测试、Node/E2E/PWA 测试和生产构建；不要宣称原始设计全部完成。

## 8. 工作纪律

- 文件编辑使用 `apply_patch`。
- 不执行 `git reset --hard`、`git checkout --` 或其他破坏性回滚。
- 不修改原始 DOCX。
- 每个实现切片都要同步更新总档案中的状态和验证证据。
- 测试失败时先记录真实失败原因，不用文档描述掩盖未完成项。
