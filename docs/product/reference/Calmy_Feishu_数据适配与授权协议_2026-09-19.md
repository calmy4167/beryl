# Calmy 飞书多维表格数据适配与授权协议

> 状态：实验接入 · 日期：2026-09-19
>
> 本文记录 Calmy 与飞书多维表格的第一阶段接入边界。它不表示飞书已经成为生产主事实源；在真实数据往返、权限、错误恢复和用户验证完成前，IndexedDB 仍是当前本地实现的事实源。

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
- App ID 和 App Secret 只保存在 Cloudflare Worker Secret；
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
- `GET /api/feishu/schema?tables=projects,tasks,reviews`：读取已配置数据表字段；
- `GET /api/feishu/records?table=tasks`：读取记录，支持分页和视图参数；
- `POST /api/feishu/records?table=tasks`：新增记录；
- `PUT /api/feishu/records/:recordId?table=tasks`：更新记录。

当前不开放删除接口，不把飞书原始字段直接暴露给页面；页面后续通过字段映射层读写。

## 4. 配置项

公开配置可以放在 Worker vars：

```text
FEISHU_APP_ID
FEISHU_BASE_TOKEN
FEISHU_TABLE_PROJECTS
FEISHU_TABLE_TASKS
FEISHU_TABLE_REVIEWS
FEISHU_VIEW_PROJECTS
FEISHU_VIEW_TASKS
FEISHU_VIEW_REVIEWS
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
FEISHU_TABLE_TASKS=tblpBPlPoIgvGry5
```

项目表、周报表的表 ID 暂时未知时可以先不填；当前“飞书工作台”页面先验证任务表读写。

不要把真实 Secret 写入 `wrangler.toml`、前端 `.env`、截图或聊天消息。

## 5. 字段演进规则

- 页面和适配层使用字段 ID，不依赖字段显示名称；
- 新增字段默认忽略，不阻断旧页面；
- 字段改名不应影响映射；
- 字段类型改变需要 schema 检查和兼容转换；
- 删除字段只产生可见配置错误，不静默覆盖本地数据；
- 拆分或合并数据表必须建立迁移方案后再实施。

## 6. 暂不承诺

- 飞书实时事件同步；
- 跨租户多人 OAuth；
- 飞书权限自动映射为 Calmy 全部领域权限；
- 以飞书数据往返测试代替本地 Repository 测试；
- 将当前 IndexedDB 主事实源直接替换为飞书。
