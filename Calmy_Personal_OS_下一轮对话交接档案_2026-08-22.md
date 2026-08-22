# Calmy Personal OS 下一轮对话交接档案

更新时间：2026-08-22

> 产品重审后的唯一文档入口：[`docs/README.md`](docs/README.md)。本文件只交接工程状态；产品范围、导航和发布门槛以 `docs/product/` 为准。

## 1. 下一轮唯一上下文

项目目录：`D:\dsharness`

实现状态总档案：`D:\dsharness\Calmy_Personal_OS_完整实现总档案_2026-08-19.md`

原始设计需求源：`D:\dsharness\Calmy_Personal_OS_完整产品设计主档案_2026-08-18.docx`

规则：原始 DOCX 只读，不修改；实现状态以 Markdown 总档案为准；产品优先级以产品决策记录和 2026-08-22 重设计包为准；不要从旧拆分文档重新推断需求，也不要把当前切片宣称为全部完成。

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
- 新增 Obsidian Local REST Vault 适配器：默认只读，支持递归目录、文本/二进制读取；PUT/DELETE 仅在显式关闭 `readOnly` 时启用。
- IndexedDB 已补启动恢复、durable outbox、串行重试 flush、运行状态和内部备份边界；同步 Repository 的纯 IndexedDB 主存储迁移尚未完成。
- Admin 已展示持久层 ready/degraded、恢复键数、待重试写入和最近镜像，并提供手动重试入口。
- 启动后同步 Repository 读取优先使用 IndexedDB KV hydrate 快照；IndexedDB 不可用时回退 localStorage，并由 `lsSet/lsRemove` 保持缓存一致。
- Admin 数据导出优先读取 IndexedDB 持久快照，IndexedDB 不可用时回退 localStorage 备份。
- 实体同步迁移计划和冲突扫描也优先使用 IndexedDB 持久快照，失败时回退同步缓存。
- KV 删除也进入 durable outbox，启动恢复会跳过 pending deletion，避免旧 IndexedDB 值复活。
- durable backup 和实体迁移计划读取前会先 flush pending writes，避免刚发生的 Repository 写入因异步事务尚未完成而被导出/迁移遗漏。
- Repository 已新增 `ready()` / `flushRepositoryWrites()` durable 边界：调用方可等待当前写入链，并获得 ready/degraded、pendingWrites 和错误状态；同步 API 仍保持兼容。
- 新增 `createAsyncCollectionRepository()` 迁移入口：读取优先 IndexedDB 快照，写入串行化并等待 durable flush；旧同步 Repository 仍作为兼容层保留。
- Today 已新增 `todayAsyncRepository`：保持现有同步 API 兼容，同时提供基于 IndexedDB durable snapshot 的异步迁移接口，并有专门回归测试。
- Action、Case、Unified 已分别新增异步 Repository 迁移入口；四个领域均保持同步 API，并有 durable snapshot、写入、导入/替换和 revision 边界测试。
- Capture、Record、Matter 已分别新增异步 Repository 迁移入口；当前七个领域均保持同步 API，并有 durable snapshot、写入、导入/替换和 revision/状态边界测试。
- Capture 的 `acceptSuggestion` 已切换为异步跨领域创建；Matter 的 Cycle/Stage/Outcome/Practice 高级过程编排已切换到 async facade，旧同步 API 仍保留兼容层。
- Calendar、People 的主要读取、人物主写入、Relationship/Shared Space 写入和共享上下文查询已切换到 async facade；共享 Matter/Action/Record Gateway、Matter mutation、Record revision 和历史回放也已切换到异步边界。
- 新增 `save-state.ts` 保存状态协议，Today、Capture、Matter、People 核心异步写入已接入 AppShell 的保存状态展示；新增 4 个协议回归测试。
- Case→Matter、Task→Action、inbox→Capture 已新增增量迁移：旧集合不删除、不更新，新实体使用稳定映射；旧 Cases、Tasks、inbox 路由改为兼容重定向，Reality 查询隐藏已迁移旧记录。
- 新增 `rollbackLegacyMigration()` 安全回滚入口：只删除未被用户修改的迁移产物；已修改对象保留并继续由映射隐藏旧记录，源集合始终不变。
- Social 已新增异步 Repository 入口，覆盖帖子、点赞、评论树和删除；Action/Unified 异步 facade 的 mutation/command 日志已迁移到 durable async repositories。
- Capture suggestion 已支持默认 30 天的显式过期与批量过期，过期只改变 suggestion 历史状态，不写入实体、不改变原始 Capture。
- 新增 `CaptureText` 应用用例：原文先保存，suggestion 失败时返回已保存原文与待重试错误，不由页面编排领域写入；新增 3 个用例回归测试。
- 新增 `AddActionToToday` 应用用例：创建行动与更新 Today 计划的跨仓储部分成功会显式返回，避免行动已保存但计划更新失败时静默丢失反馈；新增 3 个用例回归测试。
- 新增 `OpenToday` 应用用例：并行聚合 Today、Action、Matter、关系、共享空间和 Daily State，并由 Today 页面消费；新增 3 个用例回归测试。
- 新增 `RecordActionResult` 应用用例：关联行动完成与结果 Reality Record，空结果在写入前拒绝，记录失败显式返回半成功；Today 记录区已支持关联行动；`recordCommands` 已支持 command ID 幂等重试。
- 新增 `CompleteReview` 应用用例：只负责清理并保存四段 Today Review，保留 revision 乐观并发边界。
- 备份白名单已覆盖当前 Matter、Action、Capture、Record、Today、People/共享和 Unified 集合；导入删除键会同步删除 IndexedDB 镜像并等待 durable flush。
- 新增独立 UI browser smoke：验证 App 挂载、Today 默认路由、核心行动真实写入、关联行动→结果 Record 闭环、侧边栏收起/展开、Ctrl/⌘ B 与输入框误触防护、侧边栏状态刷新恢复、390×844 移动布局、820px 平板无横向溢出与 44px 触控目标、Today/Matters/Capture/Review 路由 active 状态、移动端 More 抽屉 dialog 名称/modal 语义、显式关闭按钮、过渡完成后真实 Escape 关闭、真实 Tab/Enter 键盘路径、AX tree 核心入口和保存控件名称、记录区无横向溢出、Capture 原文保存、建议拒绝后原文保留、保存状态可见性、导出→清空→导入数据往返、刷新后本地数据恢复，并在页面内阻断外部网络确认离线 fallback。
- 新增浏览器性能基线 harness：记录首屏、DOMContentLoaded、load 和 Today/Capture 路由切换，当前基线通过且外部网络允许请求数为 0。
- 桌面 AppShell 已形成四边工作台：左侧主导航、顶部上下文/保存状态、右侧快捷动作、底部快捷命令；左侧支持图标化收起/展开、Ctrl/⌘ B 和刷新恢复，窄桌面自动收起右栏，移动端保留底部主导航。
- 键级云端同步已接入删除 tombstone：本地删除写入 changes，推送 `deleted:true`，远端拉取删除本地快照且不再次生成本地 changes。
- 主要页面导航、表单和状态控件的一轮静态无障碍修复，并新增 5/5 静态回归测试。

## 3. 本轮文档对齐内容

已更新：`D:\dsharness\Calmy_Personal_OS_完整实现总档案_2026-08-19.md`

- 更新第 10 节实现矩阵中的过期状态，标记 Relationship / Shared Space 协作写入切片已完成。
- 更新第 13 节当前执行状态到 2026-08-22。
- 将第 14 节改为“已有证据 / 仍需深化”两部分。
- 新增第 15 节“2026-08-22 实现对齐快照”，固定当前完成切片、验证结果和下一阶段顺序。
- 补充 Companion Bridge 跨设备协议级回归、并发重复消息幂等和真实实机验证边界。
- 补充 IndexedDB 启动恢复、durable outbox、失败重试和状态/备份边界。
- 补充 IndexedDB 原生 `pending_writes` 队列、旧 localStorage outbox 合并及启动重放边界。
- 补充键级云端 tombstone 的 Worker 持久化及跨设备删除回归。
- 补充 IndexedDB 持久快照权威读取、空快照防回退和 hydrate 后数据迁移边界。
- 补充 Today 异步 Repository 首个迁移切片、浏览器性能基线和静态无障碍回归证据。
- 补充 Action、Case、Unified 三个领域异步 Repository 迁移入口和 9 个回归测试。
- 补充 Capture、Record、Matter 三个领域异步 Repository 迁移入口和 17 个回归测试。

本文件替代旧的 2026-08-19 交接档案作为下一轮启动入口；旧文件保留作历史记录。

## 4. 当前验证结果

- `npm test -- --run`：53 个测试文件、260 个测试通过。
- `npx vue-tsc --noEmit`：通过。
- `npm run test:node`：15/15 通过。
- `npm run test:e2e`：22/22 通过，覆盖键级 tombstone 的 push、pull 和旧值不复活。
- `npm run test:idb`：Chrome 浏览器运行时通过，覆盖 v2→v3 升级、`pending_writes` 重放、KV 写入、删除和 tombstone changes、未 await 写入后立即 backup/migration 的 durable flush，以及真实浏览器中的 async Repository durable snapshot。
- `node test/ui-runtime.mjs`：UI browser smoke 通过，覆盖 App 挂载、Today 默认路由、真实行动写入、侧边栏收起/展开、Ctrl/⌘ B 与输入框误触防护、侧边栏状态刷新恢复、Capture 原文保存、建议拒绝后原文保留、保存状态可见性、导出→清空→导入数据往返、刷新恢复本地数据和外部网络阻断。
- `node test/performance-runtime.mjs`：浏览器性能基线通过，首屏、导航、路由切换均低于阈值，外部网络允许请求数为 0。
- `accessibility-static.test.ts`：6/6 通过，覆盖导航当前项、抽屉语义、状态区域、Today 结果记录控件、场景语义标签和旧入口重定向。
- `legacy-migration.test.ts`：1/1 通过，覆盖旧 Case/Task/inbox 增量复制、稳定映射、关联 Matter、源集合不变和修改后安全回滚。
- `obsidian-rest-adapter.test.ts`：3/3 通过，覆盖递归目录、鉴权、URL 编码、二进制读取、路径穿越拒绝和显式写入开关。
- `npm run build`：通过，67 个 PWA precache URLs。
- `npm run test:pwa`：通过，67 个本地文件可用。
- `git diff --check`：通过；仅有既存 CRLF 提示。

代码变更可能与用户已有工作区改动混合，下一轮开始必须先执行 `git status --short`，不得使用破坏性回滚操作。

## 5. 尚未完成或需要深化的内容

按优先级排序：

1. 事实源收敛：对 Case→Matter、Task→Action、inbox→Capture 迁移补充真实样本和导出再导入演练；当前增量复制、稳定映射、源集合保留、旧路由重定向和受保护回滚已完成。
2. 存储边界深化：收口共享协作 Gateway、历史回放和部分兼容查询；Calendar、People 与 Matter 高级过程主路径已完成第一轮异步迁移。
3. 发布质量：完成核心闭环 UI E2E、数据导出再导入、移动端实机、键盘和手工屏幕阅读器审计；性能基线、独立 UI smoke 和静态无障碍检查已完成。
4. Obsidian / Bridge：Local REST 只读入口已经验证，但未发现本项目 Companion Bridge/MessagePort 插件；真实 Bridge 联调继续标为实验和阻塞，不进入当前核心路径。
5. 理解层深化：真实 AI provider/offline model、知识网络和共享空间在小规模试点证明核心闭环前暂缓。

## 6. 下一轮推荐执行顺序

按 `docs/product/ROADMAP_AND_ACCEPTANCE_2026-08-22.md` 执行，不再以 Bridge 或新领域能力作为首要任务：

1. 对旧模型迁移补充真实样本和导出再导入演练，继续保持旧集合只读兼容。
2. 继续补齐已有应用用例的页面覆盖，并开始设计下一批不改变领域边界的闭环用例。
3. 继续扩展核心闭环浏览器测试、数据往返和失败恢复覆盖；统一保存状态协议首个 UI 切片已完成。
4. 进行移动端、键盘和屏幕阅读器人工验收。
5. 继续运行类型检查、全量测试、Node/E2E/PWA 测试和生产构建。

## 7. 下一轮开场提示词

可直接复制以下内容作为新对话第一条消息：

> 继续执行 `D:\dsharness\Calmy_Personal_OS_下一轮对话交接档案_2026-08-22.md`，先读 `D:\dsharness\docs\README.md` 和 `D:\dsharness\docs\product\ROADMAP_AND_ACCEPTANCE_2026-08-22.md`。保留现有工作区改动，不修改原始 DOCX。当前第一优先级是收敛 Calmy 产品壳与事实源：默认进入 Today，主导航只保留 Today/Capture/Matters/Review，旧入口只读兼容；随后让四个核心页面统一走异步应用用例和 IndexedDB 权威路径。Bridge、Graph、共享空间和新领域能力暂缓，不把协议模拟宣称为真实联调。完成后运行类型检查、全量测试、Node/E2E/PWA 测试和生产构建；不要宣称原始设计全部完成。

## 8. 工作纪律

- 文件编辑使用 `apply_patch`。
- 不执行 `git reset --hard`、`git checkout --` 或其他破坏性回滚。
- 不修改原始 DOCX。
- 每个实现切片都要同步更新总档案中的状态和验证证据。
- 测试失败时先记录真实失败原因，不用文档描述掩盖未完成项。
