# Beryl 代码级审查与修复记录

> **历史参考**：本文件是旧时点审查记录，测试数字和缺陷状态可能已变化。当前 Calmy 工程结论见 [`product/ENGINEERING_REVIEW_2026-08-22.md`](product/ENGINEERING_REVIEW_2026-08-22.md)。

> 审查基准：当前仓库实际代码（`src/`、`backend/`、`test/`、`docs/DESIGN.md`）。
> 本文不引入新的产品理念，只记录现有实现中的职责、数据一致性、同步、安全与性能问题。
> 严重级别：P0 = 现在必须解决；P1 = 近期解决；P2 = 未来优化；P3 = 暂时不要动。

## 基线

- `npm test`：审查开始时 5 个文件、31 项通过。
- `npm run test:node`：15 项通过。
- `npm run test:e2e`：失败；`test/e2e-sync.mjs` 引用了不存在的根目录 `_worker.js`。
- `npm run build`：通过，但主 JS chunk 约 1 MB，Vite 报超过 500 KB 警告。
- 仓库原有未提交修改：`DESIGN_README.md`、`SESSION_HANDOFF.md`；本次审查不覆盖、不回退。

## P0：现在必须解决

### P0-01：任务删除使用排序后索引

- 文件路径：[src/components/modules/TasksModule.vue](../src/components/modules/TasksModule.vue)
- 当前问题：列表先按完成状态、优先级排序，删除时却用排序索引去 splice 原始数组。
- 为什么是问题：删除按钮可能删除另一条任务，属于可复现的数据丢失。
- 推荐修改：删除函数接收任务 id，在原始数组中按 id 定位后删除；模板传入 `t.id`。
- 是否必须现在修改：是。
- 修改风险：低；只改变定位方式，不改变数据格式。

### P0-02：收件箱过滤后仍按显示索引删除

- 文件路径：[src/components/modules/InboxModule.vue](../src/components/modules/InboxModule.vue)
- 当前问题：显示层过滤空文本/脏条目后，删除仍把显示索引当原数组索引；转任务/课题又按 `id` 过滤。
- 为什么是问题：历史无 id 或前面有隐藏条目时会删错；多个无 id 条目转化时可能全部被删除。
- 推荐修改：为显示项保留源数组索引；删除和转化都只删除该源项，并保留无 id 历史数据。
- 是否必须现在修改：是。
- 修改风险：低；兼容旧数据。

### P0-03：IndexedDB 恢复读取错误且启动存在竞态

- 文件路径：[src/core/db.ts](../src/core/db.ts)、[src/main.ts](../src/main.ts)
- 当前问题：`kv` 使用 out-of-line key，但 `restoreFromDb` 把 `getAll()` 的字符串值强转成 `{key,value}`；`initDb` 异步恢复不被等待，UI 和迁移可先读到空数据。
- 为什么是问题：localStorage 被清理后无法恢复，刷新时可能把空快照再次镜像/同步。
- 推荐修改：按 `getAllKeys + getAll`（或 cursor）配对读取；启动先恢复再镜像，并让 `main.ts` 等待初始化完成。
- 是否必须现在修改：是。
- 修改风险：中；启动顺序改变，需要保持 IndexedDB 不可用时仍可降级。

### P0-04：同步游标使用全局时间，分页会跳过记录

- 文件路径：[src/core/sync.ts](../src/core/sync.ts)、[backend/src/worker.js](../backend/src/worker.js)
- 当前问题：服务端 pull 返回全局 `maxTs`，客户端单页处理后直接把游标推进到 `maxTs`；本地合并也用一个全局 `b_sync_ts` 判断所有 key。
- 为什么是问题：超过 500 条或不同 key 时间线交错时，未返回的记录会永久跳过，整键同步会覆盖本地较新的其他 key。
- 推荐修改：游标只推进到本页最后一条 `(ts,device,key)`；本地时间线按 key 保存；服务端返回 `nextCursor/hasMore`，客户端分页拉完再提交游标。
- 是否必须现在修改：是。
- 修改风险：中高；协议和旧数据兼容需要回归测试。

### P0-05：密文解密失败时回退写入原始密文

- 文件路径：[src/core/sync.ts](../src/core/sync.ts)
- 当前问题：v2 密文解密失败时返回原字符串，后续可能作为业务 JSON 写入 localStorage；启动清理逻辑还会删除看似密文的业务键。
- 为什么是问题：错误密码、损坏数据或协议异常会污染本地数据，严重时触发数据覆盖/删除。
- 推荐修改：v2 密文解密失败必须跳过并报告，不得当明文应用；清理改为备份后、仅针对明确的历史格式并可恢复。
- 是否必须现在修改：是。
- 修改风险：中；旧版本残留密文不会自动显示，需要诊断提示。

### P0-06：路由和首次改密只靠前端页面状态

- 文件路径：[src/router/index.ts](../src/router/index.ts)、[src/App.vue](../src/App.vue)、[src/views/PassView.vue](../src/views/PassView.vue)
- 当前问题：没有全局路由守卫；直接访问 `/app/*` 可绕过登录页；`/pass?mode=first` 可被直接构造。
- 为什么是问题：用户界面认为“需要登录”的页面实际没有统一入口约束，状态恢复也容易出现竞态。
- 推荐修改：在 router 层统一检查 session；`first` 模式必须由登录流程设置的一次性标记证明，不能信任 query alone。
- 是否必须现在修改：是。
- 修改风险：中；需要兼容已有 session 和首次安装流程。

### P0-07：导入、导出、重置会泄露或丢失数据

- 文件路径：[src/views/AdminView.vue](../src/views/AdminView.vue)
- 当前问题：导出包含 `b_cloud`、`b_s3`、session、同步游标等敏感/运行态键；导入逐键写入、无 schema/备份/回滚；重置只删 localStorage，不清 IDB。
- 为什么是问题：备份文件可能泄露凭据；导入中断会得到半套数据；重置后 IndexedDB 可再次恢复旧数据。
- 推荐修改：默认仅导出业务键，敏感键显式二次确认；导入先校验完整快照并写临时备份，再原子替换；重置同步清理 IDB 和运行态游标。
- 是否必须现在修改：是。
- 修改风险：中；旧备份格式需要兼容提示。

### P0-08：端到端测试入口失效，文档宣称的安全网不存在

- 文件路径：[test/e2e-sync.mjs](../test/e2e-sync.mjs)、[docs/DESIGN.md](DESIGN.md)
- 当前问题：测试导入不存在的 `_worker.js`，`docs/DESIGN.md` 仍宣称 12 项 E2E 通过。
- 为什么是问题：同步协议修改没有可执行的端到端回归，文档给出错误质量信号。
- 推荐修改：测试直接加载 `backend/src/worker.js`，补齐分页、并发时间戳、密文失败等断言，并同步更新文档。
- 是否必须现在修改：是。
- 修改风险：低到中；测试可能暴露现有协议不一致。

### P0-09：迁移失败仍写入最新版本号

- 文件路径：[src/core/migrate.ts](../src/core/migrate.ts)
- 当前问题：单步迁移异常被吞掉，循环结束后无条件写 `DATA_VERSION`。
- 为什么是问题：迁移未完成但版本已前进，下一次启动不会重试，形成不可逆的数据结构不一致。
- 推荐修改：记录成功步数；任一步失败立即停止且不升级版本号，提供诊断信息。
- 是否必须现在修改：是。
- 修改风险：低；只会让失败迁移在下次重试。

## P1：近期解决

### P1-01：存储层写入失败仍触发同步和 IDB 写入

- 文件路径：[src/core/storage.ts](../src/core/storage.ts)
- 当前问题：`lsSet` 失败后仍调用 sync hook、`dbPut`、`recordEntityChanges`；storage 与 db 互相 import。
- 为什么是问题：内存状态、IDB、云端可能记录了实际上未落盘的值；循环依赖增加初始化不确定性。
- 推荐修改：只有 `lsSet` 成功才发布副作用；抽出无副作用的 localStorage 适配函数供 db 使用。
- 是否必须现在修改：近期。
- 修改风险：中；需要验证所有 store.set 调用方对 false 的处理。

### P1-02：变更日志读取和裁剪可能丢未推送变更

- 文件路径：[src/core/db.ts](../src/core/db.ts)、[src/core/sync.ts](../src/core/sync.ts)
- 当前问题：`readChanges` 先全量排序再取最后 limit；日志无推送确认位点，只按数量裁剪；无变更时 sync 会生成全量快照。
- 为什么是问题：旧变更可能被新变更挤掉，离线时间长时无法可靠增量推送，网络恢复会产生无必要全量上传。
- 推荐修改：按 seq 游标顺序读取；按已确认 push cursor 裁剪；无变更时返回空变更集。
- 是否必须现在修改：近期。
- 修改风险：中；需要与旧 `b_push_cursor` 兼容。

### P1-03：Case 页面直接组合多个写入，无法原子回滚

- 文件路径：[src/views/CaseView.vue](../src/views/CaseView.vue)、[src/domain/case/repository.ts](../src/domain/case/repository.ts)
- 当前问题：创建任务、关系、决策、复盘是多个独立 localStorage 写入；视图中重复定义 Task/Person 等类型。
- 为什么是问题：中途失败会留下半个课题；类型漂移会让关联字段逐渐不一致。
- 推荐修改：把课题操作收敛到 domain service/repository 的事务式命令，统一复用领域类型。
- 是否必须现在修改：近期。
- 修改风险：中；需保持现有键格式。

### P1-04：同步后页面刷新策略粗暴，Case 列表容易陈旧

- 文件路径：[src/components/modules/ModuleView.vue](../src/components/modules/ModuleView.vue)、[src/views/CasesView.vue](../src/views/CasesView.vue)、[src/views/CaseView.vue](../src/views/CaseView.vue)
- 当前问题：模块收到同步事件后直接 key remount；Cases/Case 页面没有同步事件监听。
- 为什么是问题：输入中的草稿、计时器状态会丢；打开课题不会反映远端更新。
- 推荐修改：按 key 精确刷新数据，保留本地草稿；为列表和详情订阅同步事件并重新读取数据。
- 是否必须现在修改：近期。
- 修改风险：中；需要明确组件本地瞬态状态的保留边界。

### P1-05：管理页统计不是响应式，且导入缺少语义校验

- 文件路径：[src/views/AdminView.vue](../src/views/AdminView.vue)
- 当前问题：统计 computed 不依赖响应式源，`refreshCounts` 只读取值不会触发更新；导入只验证 `b_` 前缀和字符串。
- 为什么是问题：数据改变后诊断数字可能不变；任意 JSON 字符串都能进入业务键。
- 推荐修改：用明确的版本化快照模型和刷新 token；导入按键 schema 校验并报告错误键。
- 是否必须现在修改：近期。
- 修改风险：低到中；旧备份需给出兼容错误而不是静默跳过。

### P1-06：Worker 旧 PUT 无条件覆盖，D1 鉴权过弱且是全局密码

- 文件路径：[backend/src/worker.js](../backend/src/worker.js)、[backend/src/lib/auth.js](../backend/src/lib/auth.js)
- 当前问题：兼容 `/api/data` PUT 直接覆盖；同步密码使用无盐 SHA-256；auth 表只有一条全局记录。
- 为什么是问题：旧客户端或重放请求可覆盖新数据；密码离线破解成本低；多人/多空间无法隔离。
- 推荐修改：旧 PUT 也走 ts/device LWW 或明确只读；密码改为带 salt 的慢哈希并逐步迁移；为后续空间隔离预留 owner/space 字段。
- 是否必须现在修改：近期（若旧 API 仍暴露则提升为 P0）。
- 修改风险：高；需要兼容已部署数据和旧客户端。

### P1-07：完整数组快照导致性能和冲突面扩大

- 文件路径：[src/core/sync.ts](../src/core/sync.ts)、[src/core/repository.ts](../src/core/repository.ts)、各模块组件
- 当前问题：大多数模块以 `b_*` 整数组存储，每次修改都序列化、镜像和同步整键；只有 Posts 使用 repository，模型不统一。
- 为什么是问题：数据量增长后写放大、冲突覆盖和 JSON 解析成本线性上升。
- 推荐修改：先统一 repository 接口和模型，再按高频/大集合逐步迁移到实体级 IDB；不要一次性重写全部模块。
- 是否必须现在修改：近期规划，非一次性实施。
- 修改风险：高；必须有迁移和回滚方案。

### P1-08：构建包过大，模块页仍 eager import 全部模块

- 文件路径：[src/main.ts](../src/main.ts)、[src/views/ModuleView.vue](../src/views/ModuleView.vue)
- 当前问题：Element Plus 全量导入；ModuleView 静态导入 9 个模块。
- 为什么是问题：首屏下载和解析成本高，移动端尤其明显。
- 推荐修改：按需引入 Element Plus；模块组件改为异步 registry，首屏只加载当前模块。
- 是否必须现在修改：近期。
- 修改风险：中；需验证主题样式和异步组件错误态。

### P1-09：数据写入 ID 和设备 ID 不稳定

- 文件路径：[src/core/storage.ts](../src/core/storage.ts)、[src/core/db.ts](../src/core/db.ts)
- 当前问题：`nextId` 和 `DEVICE_ID` 依赖随机数/页面加载。
- 为什么是问题：重载后设备身份变化，冲突排序和实体关联诊断不稳定。
- 推荐修改：设备 ID 持久化；实体 ID 使用持久化设备前缀+单调序列，保留旧 ID。
- 是否必须现在修改：近期。
- 修改风险：中；不能重写历史实体 ID。

### P1-10：实体变更事务未等待且无清理策略

- 文件路径：[src/core/db.ts](../src/core/db.ts)
- 当前问题：`recordEntityChanges` 未等待 transaction 完成，`entity_changes` 不 prune。
- 为什么是问题：页面关闭时变更可能丢；长期使用数据库无限增长。
- 推荐修改：等待事务完成；按已确认游标或保留窗口清理，并补异常日志。
- 是否必须现在修改：近期。
- 修改风险：低到中。

### P1-11：Finance 使用浮点金额

- 文件路径：[src/components/modules/FinanceModule.vue](../src/components/modules/FinanceModule.vue)
- 当前问题：金额以 JS `number` 浮点保存和汇总。
- 为什么是问题：金额出现 0.1+0.2 类精度误差，后续同步/导出难以纠正。
- 推荐修改：以最小货币单位整数保存，显示时格式化；迁移旧小数并保留原始值备份。
- 是否必须现在修改：近期（启用财务模块前）。
- 修改风险：中；迁移需处理不同币种和历史空值。

## P2：未来优化

### P2-01：QuoteWall 首页接入（已完成）

- 文件路径：[src/core/quotes.ts](../src/core/quotes.ts)、[src/components/quotes/](../src/components/quotes/)、[src/views/HomeView.vue](../src/views/HomeView.vue)、[docs/DESIGN.md](DESIGN.md)
- 当前问题：已解决，`HomeView.vue` 正式渲染 `QuoteWall`。
- 为什么是问题：此前维护者会误判真实渲染链路；现在首页和组件实现已重新对齐。
- 推荐修改：继续只在 QuoteWall 组件链路维护名句墙，新增交互补组件测试。
- 是否必须现在修改：否，代码已完成。
- 修改风险：低；网络源失败仍由离线名句池兜底。

### P2-02：旧模块注册表与场景层职责重叠

- 文件路径：[src/core/modules.ts](../src/core/modules.ts)、[src/core/scenes.ts](../src/core/scenes.ts)
- 当前问题：`MODS/CATS` 注册表与 ModuleView 自己的 `MODULES` 重复；场景、模块可见性与 UI 主题混在一起。
- 为什么是问题：新增模块需要改多处，长期会出现显示名/统计口径不一致。
- 推荐修改：确认真实入口后保留一个 registry；场景只负责主题和布局，不承担业务权限。
- 是否必须现在修改：否。
- 修改风险：中。

### P2-03：Pomo/模块存在高频全量读写

- 文件路径：[src/components/modules/PomoModule.vue](../src/components/modules/PomoModule.vue)、各模块组件
- 当前问题：计时器 interval 和模块操作直接读写 localStorage，列表每次全量解析。
- 为什么是问题：长时间运行和大数据量时主线程、序列化开销增大。
- 推荐修改：将计时器状态放入内存 composable，完成事件再持久化；列表按 repository 查询。
- 是否必须现在修改：否。
- 修改风险：中。

### P2-04：构建资源 hash precache

- 文件路径：[public/sw.js](../public/sw.js)、[src/main.ts](../src/main.ts)
- 当前问题：已解决。`npm run build` 会执行 `scripts/generate-sw-precache.mjs`，将 `dist/assets` 中的 hash 资源写入构建后的 SW；仍需真实浏览器离线安装演练。
- 为什么是问题：离线首次打开体验不可靠。
- 推荐修改：保留构建后生成清单，并在真实浏览器验证安装、升级和离线回退。
- 是否必须现在修改：否，代码已完成。
- 修改风险：低；主要剩余风险是浏览器缓存升级行为。

## P3：暂时不要动

### P3-01：ContentEditor/Renderer/markdown 边界清晰

- 文件路径：[src/components/content/ContentEditor.vue](../src/components/content/ContentEditor.vue)、[src/components/content/ContentRenderer.vue](../src/components/content/ContentRenderer.vue)、[src/core/content/markdown.ts](../src/core/content/markdown.ts)
- 当前问题：未发现高置信职责或数据一致性缺陷。
- 为什么暂不处理：当前抽象规模小且边界清晰，重构只会增加风险。
- 推荐修改：保持现状，新增语法时补测试。
- 是否必须现在修改：否。
- 修改风险：无。

### P3-02：crypto/auth/api client 暂不重写

- 文件路径：[src/core/crypto.ts](../src/core/crypto.ts)、[src/core/auth.ts](../src/core/auth.ts)、[src/core/api/client.ts](../src/core/api/client.ts)
- 当前问题：职责集中，主要风险在调用方和服务端兼容，而非实现本身。
- 为什么暂不处理：这些模块是稳定边界，推倒重写没有当前收益。
- 推荐修改：仅补充错误路径测试和协议迁移，不做风格重构。
- 是否必须现在修改：否。
- 修改风险：若无需求强行修改则中高。

## 实际修复顺序

1. 修复 E2E 入口并补同步回归测试，先恢复质量门禁。
2. 修复 Tasks/Inbox 的确定性删除。
3. 修复 IndexedDB 恢复顺序、key 读取和写入失败副作用。
4. 修复路由守卫、首次改密标记、迁移版本提交。
5. 修复 Admin 导入导出/重置的备份、敏感键和原子性。
6. 修复同步游标、分页、密文失败策略以及 Worker 端对应协议。
7. 修复 Case/列表同步刷新、类型与 repository 边界。
8. 修复构建体积、设备 ID、实体日志清理和金额模型。
9. 最后处理 P2 死代码、registry、PWA 缓存等需要产品确认的项目。

## 第一批实际修改文件（最多 10 个）

1. [test/e2e-sync.mjs](../test/e2e-sync.mjs)
2. [src/__tests__/syncv2.test.ts](../src/__tests__/syncv2.test.ts)
3. [src/components/modules/TasksModule.vue](../src/components/modules/TasksModule.vue)
4. [src/components/modules/InboxModule.vue](../src/components/modules/InboxModule.vue)
5. [src/main.ts](../src/main.ts)
6. [src/views/AdminView.vue](../src/views/AdminView.vue)
7. [src/core/db.ts](../src/core/db.ts)
8. [src/core/sync.ts](../src/core/sync.ts)
9. [backend/src/worker.js](../backend/src/worker.js)
10. [docs/DESIGN.md](DESIGN.md)

## 本轮执行状态

- P0-01、P0-02：已修复为按稳定 id/源数组索引删除。
- P0-03：已修复 IndexedDB cursor 读取、恢复优先于镜像、镜像删除陈旧键。
- P0-04：已修复 `(ts,device,key)` 分页游标、`hasMore` 拉取和按键本地版本。
- P0-05：已修复 v2 解密失败不回退密文；历史残留只检测不删除。
- P0-06：已增加路由守卫和一次性首次改密标记；App 不再在未认证时启动同步。
- P0-07：已过滤敏感导出键、导入 schema/回滚、重置清理 IndexedDB。
- P0-08：已修复 E2E Worker 路径；`npm run test:e2e` 当前覆盖 19 项断言。
- P0-09：已修复迁移失败不推进版本号。
- P1-01、P1-02：已修复写入失败副作用、变更日志取前 limit、远端镜像不追加本地日志、无变化不全量上传。
- P1-03：已为 repository 写入失败抛错，并为课题“新建行动+关联”增加回滚；更大范围事务仍需后续 IDB 主存储化。
- P1-04：Cases/Case/Admin/Home 已监听同步事件；模块页仍保留 remount 作为旧模块刷新兼容，草稿保留需后续 composable 化。
- P1-05：管理页统计有显式刷新 token，导入改为业务键白名单。
- P1-06：Worker 旧 PUT 改为 LWW；新增 PBKDF2 密码格式并兼容旧 SHA-256 哈希。
- P1-07：暂完成边界收敛（Home/Case 使用 repository）；整数组迁移不在本轮一次性推倒。
- P1-08：模块页改为异步组件，Element Plus 改为按实际组件注册；主 JS 已降至约 387 KB，未再触发 500 KB chunk 警告。
- P1-09、P1-10、P1-11：已分别完成持久设备 ID 前缀、实体日志 transaction/prune、金额最小单位整数兼容写入。
- P1-12：Case 已补优先级、截止日期、阶段进度、归档/删除确认、复盘下一轮标题；资源模块已增加直接关联入口；全局课题搜索已加入。
- P1-13：新增 `src/core/backup.ts` 统一备份白名单与校验、`src/core/undo.ts` 8 秒实体级撤销；新增 PWA 外壳预缓存。
- P0-10：实体级 D1 同步、迁移回滚/冲突扫描、加密推送和 KV 状态检查均已部署；首次连接已自动执行集合迁移，后台仍保留显式计划与回滚入口。
- P2-01/P2-02/P2-03、完整人工无障碍审计和 CSS 细拆仍按文档保留；本轮已完成 QuoteWall 接回首页、默认实体同步、土阶段快捷创建、主要页面 EmptyState、基础 aria 标签、hash precache、PWA 资源演练及 Worker D1/同步路由拆分。

## 最终验证

- `npm test`：48 项通过（含动态、点赞、评论和回复线程测试）。
- `npm run test:node`：15 项通过。
- `npm run test:e2e`：19 项通过。
- `npm run test:pwa`：55 个 precache 文件完整性通过。
- `npm run build`：通过；仅保留第三方 `@vueuse` 的 Rollup 注释提示。

## 生产部署验证（2026-08-17）

- Worker `https://beryl-api.3091634749.workers.dev` 已完成 OAuth 后部署 P0 版本。
- `/api/health` 返回正常；`/api/sync/pull`、`/api/entity-sync/pull` 与 `/api/kv-status` 未授权均返回 `401`，KV 绑定已移除。
- 默认实体同步已接入客户端首次连接流程；生产 D1 中已有键级记录会在首次连接时按实体快照自动迁移，后台仍保留备份、冲突扫描和回滚入口。
- Worker 最新版本 ID：`264a4304-56b4-473d-8e12-80fb4e8c2caa`；Pages 最新预览地址：`https://5aa02cbf.beryl-ddk.pages.dev`，主域名和预览域名均返回 HTTP 200。
