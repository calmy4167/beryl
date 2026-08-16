# Beryl v2 · 当前设计与实现基线

> 本文以仓库当前代码为准，描述已经存在的系统边界。历史 v1 方案不再作为当前实现说明。

## 1. 当前技术边界

- 前端：Vue 3 + Vite + TypeScript + Element Plus + Vue Router（Hash History）。
- 部署：Cloudflare Pages 托管 `dist`；独立 Cloudflare Worker 提供 `/api/*`；D1 是当前云端数据库。
- 兼容层：localStorage 保存 `b_*` 键；IndexedDB 保存本地镜像、键级变更日志和实体级本地日志。
- 同步：Cloudflare 默认按实体保存，实体级增量 LWW/tombstone + AES-GCM 密文；场景等标量仍走键级增量协议。
- 认证：本机登录使用 PBKDF2 哈希；Worker 同步密码使用 PBKDF2，新版本兼容旧 SHA-256 哈希。

## 2. 产品信息架构

```
工作台
├── 快速记录 → 收集箱 / 行动 / 现实课题
├── 正在推进的现实课题
├── 今日行动
└── 收集箱数量、已解决课题数量

现实课题
├── 木：问题、结果、限制、可能路径
├── 火：新建或关联任务
├── 土：关联人物、日记、财务、文章
├── 金：备选项与结论
└── 水：复盘与下一轮课题

工具箱
└── 动态、任务、习惯、日记、番茄钟、财务、目标、人物、文章
```

当前首页是 `HomeView` 工作台，不是 QuoteWall。`src/core/quotes.ts` 和
`src/components/quotes/` 仍存在，但没有被当前首页导入，属于未接入的保留代码。

## 3. Case 领域模型

`Case` 是新增的顶层对象，不替换原有工具模块。

- `b_cases`：课题本体，包含问题、期望结果、状态、当前阶段、阶段笔记、决策和复盘。
- `b_caseRelations`：关系记录，通过 `caseId + targetType + targetId` 引用任务、人物、日记、财务、文章。
- 五阶段是工作侧重点，不是审批流，允许跳过、回退和反复进入。

| 阶段 | 当前职责 |
|---|---|
| 木 | 问题、期望结果、限制条件、可能路径 |
| 火 | 新建或关联行动任务 |
| 土 | 关联资源并记录摘要 |
| 金 | 保存判断主题、备选项和结论 |
| 水 | 保存复盘并创建下一轮课题 |

领域读写优先经过 `src/domain/case/repository.ts` 和
`src/core/repository.ts`。旧工具模块仍有直接 `store` 读写，尚未全部迁移。

## 4. 路由与页面

| 路由 | 页面 | 当前职责 |
|---|---|---|
| `/login` | 登录 | 本地用户凭据验证与失败锁定 |
| `/pass` | 设置/修改密码 | 首次登录改密或已登录修改密码 |
| `/scene` | 场景选择 | 选择场景并应用主题 |
| `/app/home` | 工作台 | 快速记录、正在推进、今日行动、统计 |
| `/app/cases` | 课题列表 | 状态筛选、搜索、新建课题 |
| `/app/cases/:id` | 课题详情 | 五阶段工作区、关系和复盘 |
| `/app/module/:id` | 工具模块 | 10 个工具模块，按需异步加载；包含动态/评论 |
| `/app/admin` | 后台 | 数据管理、场景、同步、诊断 |

`src/router/index.ts` 负责路由守卫；`src/App.vue` 只在有效 session 恢复后启动自动同步。

## 5. 数据与存储

### 5.1 localStorage 兼容层

`src/core/storage.ts` 提供 `lsGet`、`lsSet`、`safeParse` 和 `store`。业务键统一使用
`b_*` 前缀。写入成功后才触发同步 hook、IndexedDB 镜像和实体日志。

### 5.2 IndexedDB

`src/core/db.ts` 当前包含：

- `kv`：localStorage 的持久镜像，out-of-line key。
- `changes`：键级 append-only 变更日志，按 seq 读取并限制窗口。
- `meta`：镜像和设备元数据。
- `entity_changes`：实体级本地日志，用于 Cloudflare 默认实体同步的增量推送。

启动顺序是：迁移数据版本 → 从 IndexedDB 恢复缺失的 `b_*` 键 → 镜像当前 localStorage。
IndexedDB 不可用时仍降级到 localStorage。

### 5.3 ID 与金额

- 设备 ID 持久化在浏览器中；新实体 ID 带设备前缀，历史 ID 不重写。
- Finance 新记录保存 `amountCents` 最小单位整数，同时保留 `amount` 兼容旧数据；旧小数读取时转换为 cents。

## 6. 同步协议

### 6.1 客户端

`src/core/sync.ts` 支持 local/file/cloud/s3 四种模式。Cloud 模式使用：

- `b_pull_cursor`：复合游标 `{ ts, device, key }`。
- `b_sync_ts`：按业务键保存本地版本时间。
- `b_push_cursor`：IndexedDB 键级变更日志 seq。
- 变更写入后 800ms 防抖推送；前台每 5 秒轮询；切回窗口立即拉取。
- v2 密文解密失败时跳过记录，不把密文当作业务明文；历史疑似密文只检测、不自动删除。

### 6.2 Worker/D1

`backend/src/worker.js` 在请求时确保 `records` 和 `auth` 表存在，并兼容旧 KV 迁移。

```text
POST /api/setup
POST /api/sync/pull { since, sinceDevice, sinceKey }
POST /api/sync/push { changes[] }
GET  /api/data                 # 旧客户端兼容
PUT  /api/data                 # 旧客户端兼容，仍走 LWW
```

`pull` 按 `(ts, device, key)` 排序，返回最多 500 条、`nextCursor`、`hasMore` 和全局诊断用 `maxTs`。
`push` 按 `ts` 决胜，同一时间按 `device` 字典序决胜。云端不解析业务 JSON，只保存密文字符串。

### 6.3 同步粒度的明确限制

Cloudflare 模式下，集合数据默认走**实体级同步**：实体按 `(entity, entityId)` 使用 LWW 和删除墓碑，
并以 AES-GCM 密文传输；场景、番茄统计等标量仍走键级增量协议。file/S3 模式仍保留整键快照语义。
多人权限和细粒度可见范围目前只在动态数据模型中预留，尚未接入成员管理。

## 7. 备份、导入与重置

`AdminView` 默认导出业务键，排除本地认证、云端密钥、S3 密钥、session 和同步游标。
导入先做业务键白名单和 JSON 校验，写入失败时恢复原快照。重置会删除 localStorage 的业务键并清理
IndexedDB 镜像、变更日志和实体日志。

## 8. 当前性能边界

- 工具模块通过异步组件按需加载；Element Plus 只注册当前实际使用的组件。
- 当前入口 JS 约 392 KB，未触发 500 KB chunk 警告；CSS 仍包含 Element Plus 全局样式。
- 多数工具模块仍按集合全量解析和写回，数据量明显增长后应逐步迁移到 Repository/IndexedDB 查询。
- Service Worker 已预缓存应用外壳、manifest 和图标；构建生成的 hash 资源仍通过 network-first 运行时缓存。

## 9. 测试与验证

- `npm test`：11 个文件、48 项 Vitest 测试（含动态、点赞、评论和回复线程）。
- `npm run test:node`：15 项 Node 核心测试。
- `npm run test:e2e`：19 项真实 SQLite + Worker 协议测试，覆盖 setup、鉴权、LWW、KV 迁移、复合游标、实体级 tombstone 和 KV 退役状态。
- `npm run build`：`vue-tsc --noEmit` 和 Vite 构建通过；仅有第三方 `@vueuse` Rollup 注释提示。

## 10. 已知限制与后续路线

### P0/P1（需要有迁移和回滚方案）

- 将实体级本地日志升级为云端逐条同步前，必须保留当前键级协议并完成双端回滚验证。
- 继续把工具模块从直接 localStorage 读写收敛到 Repository，但不一次性重写全部模块。
- 在真实 D1 上完成 `entity_records` 迁移演练，并在保留键级回滚路径的前提下评估灰度切换。

### P2（未来优化）

- 删除未接入的 QuoteWall 实验代码前先确认产品取舍。
- 统一旧模块 registry 和无障碍检查；全局课题搜索、撤销删除与 PWA 外壳预缓存已完成，仍需真实浏览器验收。
- Worker 继续按领域拆分路由和 D1 访问层。

### P3（暂不动）

`ContentEditor`、`ContentRenderer`、Markdown 解析、前端 crypto/auth/api client 当前边界清晰，
除非出现新需求或回归缺陷，不做为了风格而进行的重构。

## 11. 文档维护规则

代码行为、协议、测试数量、部署方式发生变化时，必须同步更新本文、`DESIGN_README.md` §17、
`SESSION_HANDOFF.md` 和必要的 `docs/CODE_REVIEW.md` 修复状态。旧 v1 描述只能保留在明确标记的历史章节，
不能继续作为当前部署或架构说明。
## 12. 2026-08-16 本轮实现补充

### 12.1 课题可用性

- `CaseView` 支持优先级、截止日期、阶段进度、归档状态和删除确认；删除课题会级联删除 `caseRelations`，避免悬挂关联。
- 水阶段将“复盘内容”和“下一轮课题标题”分开，避免把整段复盘误当标题。
- `CasesView` 支持归档筛选，并展示优先级和截止日期。
- `CaseLinkSelect` 是唯一的跨模块关联入口：任务、人物、日记、财务记录、文章均可直接关联或取消关联课题。
- 任务支持截止日期、按截止日期/优先级排序，以及未完成/全部/已完成筛选。

### 12.2 导航、备份和离线

- `AppShell` 提供 Ctrl/Cmd+K 全局课题搜索；搜索只读当前本地 Case 数据，不引入新的索引服务。
- `src/core/backup.ts` 统一备份白名单、敏感配置排除和 JSON 校验；恢复失败会回滚本地快照。`src/core/undo.ts` 提供 8 秒实体级撤销删除。
- `public/sw.js` 预缓存应用外壳、manifest 和图标，并保留网络优先及离线 `index.html` 兜底。

### 12.3 实体级同步兼容层

- IndexedDB `entity_changes` 已记录集合内实体的 create/update/delete 变化。
- `src/core/entity-sync.ts` 提供实体变更映射、推送和分页拉取客户端。
- Worker 新增 `/api/entity-sync/push` 与 `/api/entity-sync/pull`，D1 表 `entity_records` 使用 `(entity, entity_id)` 主键和 `(updated_at, device, entity, entity_id)` LWW 游标。
- 默认同步仍是已验证的键级增量协议；实体级接口仅供迁移演练和后续灰度使用，不会自动切换，避免在生产部署前改变冲突语义。

### 12.4 当前验证

- Vitest：48 项通过。
- Node 核心测试：15 项通过。
- Worker 端到端：19 项通过（包含实体级 tombstone、LWW、复合游标和 KV 退役状态检查）。
- `npm run build`：通过；首屏 JS 约 392 KB，未出现 500 KB 警告。

仍需真实 Cloudflare 环境完成的工作：D1 `entity_records` 生产迁移演练、KV 解绑前的备份/恢复演练，以及 Pages 部署后在真实浏览器验证 PWA 安装和离线启动。这些依赖外部环境，代码仓库内不做假完成标记。

截至 2026-08-17 的生产检查：`/api/health` 返回 `{"ok":true,"protocol":2}`；旧 `/api/sync/pull`、新 `/api/entity-sync/pull` 和 `/api/kv-status` 未授权均返回 `401`，KV 已从生产绑定移除。当前 Worker 版本 ID：`264a4304-56b4-473d-8e12-80fb4e8c2caa`。
Pages P0 前端也已部署；最新预览地址为 `https://c272f0f3.beryl-ddk.pages.dev`，主域名返回 HTTP 200。
