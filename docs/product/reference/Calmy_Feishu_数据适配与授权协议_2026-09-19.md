# Calmy 飞书多维表格数据适配与授权协议

> 状态：实验接入 · 日期：2026-09-19
>
> 本文记录 Calmy 与飞书多维表格的第一阶段接入边界。它不表示飞书已经成为生产主事实源；在真实数据往返、权限、错误恢复和用户验证完成前，IndexedDB 仍是当前本地实现的事实源。

下一阶段产品建议见 [飞书生活工作台规划](../FEISHU_LIFE_WORKSPACE_PLAN_2026-09-19.md)与 D-014（proposed）。当前协议描述已实现的接入与待验收项，不将规划中的新导航、工作区 Provider 或字段自动兼容提前标记为完成。

## 1. 目标

将飞书多维表格作为可配置的数据源，用 Calmy 提供更轻、更人性化的表格、看板、Today 和复盘界面。

第一阶段只接入用户现有的“项目管理甘特图” Base：

- `项目` → Calmy 事项 / Matter；
- `任务` → Calmy 行动 / Action；
- `周报` → Calmy 复盘 / Review；
- `成员` → 执行人和人物上下文；
- `项目数据统计` → 前端派生统计，不新增事实源。

## 2. 授权边界

### 当前单用户模式

- 使用应用身份 `tenant_access_token`；
- App Secret 只保存在 Cloudflare Worker Secret；App ID 可保存为 Worker vars 或 Secret；
- Base Token、数据表 ID 和视图 ID 作为 Worker 配置；
- 浏览器只访问 Calmy Worker，不直接访问飞书，也不接触 App Secret；
- 应用同时需要 API 权限和目标 Base 的文档协作者权限。

### 未来多人模式

- 同一租户的共享 Base：可保留应用身份访问，并由 Calmy 自己记录用户和权限；
- 用户自己的 Base 或跨租户数据：增加飞书 OAuth 和 `user_access_token`；
- 每个用户/租户的连接配置必须独立保存，不能共用一个 Base Token；
- 多人能力进入正式产品前，需要补充租户隔离、权限审计、撤销授权和 Token 刷新验收。

## 3. 当前后端接口

所有接口先复用现有 Calmy Worker 的同步密码保护：

- `GET /api/feishu/status`：检查配置状态，不返回密钥；
- `GET /api/feishu/schema?tables=projects,tasks,reviews,members`：读取已配置数据表字段；
- `GET /api/feishu/records?table=projects|tasks|reviews|members`：读取记录，支持分页和视图参数；
- `POST /api/feishu/records?table=tasks`：新增记录；
- `PUT /api/feishu/records/:recordId?table=tasks`：更新记录。

当前不开放删除接口。页面只展示经过允许的项目、任务、周报和成员字段；只有任务页面开放新增与状态修改。

## 4. 配置项

公开配置可以放在 Worker vars：

```text
FEISHU_APP_ID
FEISHU_BASE_TOKEN
FEISHU_TABLE_PROJECTS
FEISHU_TABLE_TASKS
FEISHU_TABLE_REVIEWS
FEISHU_TABLE_MEMBERS
FEISHU_VIEW_PROJECTS
FEISHU_VIEW_TASKS
FEISHU_VIEW_REVIEWS
FEISHU_VIEW_MEMBERS
```

敏感配置只能作为 Worker Secret：

```text
FEISHU_APP_SECRET
```

本地开发可使用被 `.gitignore` 忽略的 `backend/.dev.vars`；生产环境使用 Cloudflare Secret，例如：

```powershell
npx wrangler secret put FEISHU_APP_SECRET --config backend/wrangler.toml
```

本次 Base 的本地开发配置可以先按下面填写，App Secret 留在本机，不要粘贴到聊天中：

```text
FEISHU_APP_ID=你的应用 App ID
FEISHU_BASE_TOKEN=GzwsbWYmda71uhssuBoce0ALnac
FEISHU_TABLE_PROJECTS=tblJUWeyYlzULBjF
FEISHU_TABLE_TASKS=tblpBPlPoIgvGry5
FEISHU_TABLE_REVIEWS=tblrFDKpRuWAkZVQ
FEISHU_TABLE_MEMBERS=tbloPcZ8ZDK3byDc
```

当前“飞书工作台”已读取四张表：任务以看板展示并可新增、修改状态；项目、周报和成员以只读视图展示，避免前期误改飞书主数据。

当前 Base 已识别的映射如下，适配层只使用这些配置的表 ID，界面不会把 Base URL 或密钥暴露给浏览器：

- `🚩 项目`：`FEISHU_TABLE_PROJECTS`；
- `✅ 任务`：`FEISHU_TABLE_TASKS`；
- `📝 周报`：`FEISHU_TABLE_REVIEWS`；
- `🧑🏻‍💻 成员`：`FEISHU_TABLE_MEMBERS`。

不要把真实 Secret 写入 `wrangler.toml`、前端 `.env`、截图或聊天消息。

## 5. 已校准字段

| 表 | 当前页面使用的字段 |
| --- | --- |
| 项目 | 项目名称、目标、状态、任务数量、任务完成度、项目截止时间 |
| 任务 | 任务、所属项目、状态、截止时间、任务执行人、解决方案 |
| 周报 | 日期、汇报标题、汇报人、所属项目、进度内容 |
| 成员 | 成员名、账号、部门、任务 |

## 6. 字段演进规则

- Worker 可读取字段 schema；首版页面按已校准的字段显示名称读取，任务标题兼容 `任务` / `任务名称`，任务新增仍使用当前表的 `任务` 字段；
- 新增字段默认忽略，不阻断旧页面；
- 任意字段改名、删除及类型变化的自动兼容尚未实现；正式化前需要完成字段 ID 映射、schema 检查、兼容转换和明确的配置错误反馈；
- 拆分或合并数据表必须建立迁移方案后再实施。

## 7. 交付状态与手动部署

截至本次交付：四张真实飞书表均已验证可读；前端生产构建、Worker dry-run 和 6 项本地飞书接口测试通过；前端与 Worker 产物已检查不包含 App Secret。新增及状态写回只进行了本地模拟测试，尚未修改真实飞书记录。本次不执行远端部署，部署由用户完成。

需要更新后端 Worker 与前端 Pages 两部分。本地 `.dev.vars` 已包含四张表的配置，可以直接将其中的飞书配置上传为 Worker Secrets，命令不输出值：

```powershell
# Cloudflare 登录过期时先执行
npx wrangler login

# 将本地飞书配置上传到当前 beryl-api Worker
npx wrangler secret bulk backend/.dev.vars --config backend/wrangler.toml

# 发布后端接口
npm run deploy:api

# 构建前端，并沿用现有 Pages 发布流程发布 dist
npm run build
```

前端逻辑路由为 `/app/feishu`，当前使用 HashRouter，网页访问形式为 `/#/app/feishu`，也可从“更多 → 飞书工作台”进入。浏览器中先在“设置与同步”连接同一个 Worker 地址和现有同步密码。部署后的 `/api/health` 应返回 200；不携带同步密码访问 `/api/feishu/status` 或记录接口应返回 401。携带有效同步密码后可检查配置状态及四张表读取，再由用户在页面上验证一次真实新增或状态更新。

接口已将飞书 HTTP 200 中的业务错误转换为 502，防止被误判为成功；任务、项目、周报与成员列表均会自动读取后续分页，不会只展示前 500 条记录。

## 8. 暂不承诺

- 飞书实时事件同步；
- 跨租户多人 OAuth；
- 飞书权限自动映射为 Calmy 全部领域权限；
- 以飞书数据往返测试代替本地 Repository 测试；
- 将当前 IndexedDB 主事实源直接替换为飞书。
