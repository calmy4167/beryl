# Beryl 项目交接（当前版：2026-08-16）

## 先读什么

1. 本文件：当前工作状态与下一步。
2. `D:\dsharness\DESIGN_README.md` 的 **§17**：当前权威架构、已完成与待办。
3. `D:\dsharness\DESIGN_README.md` 的 §15–16：部署与 Case 架构。

`DESIGN_README.md` 的前半部分保留了 v1 历史，不能当作当前部署说明。

## 项目快照

| 项 | 当前状态 |
| --- | --- |
| 路径 | `D:\dsharness`（Git 仓库根） |
| 技术栈 | Vue 3 + Vite + TypeScript + Element Plus + Vue Router（hash 路由） |
| 前端 | Cloudflare Pages，构建命令 `npm run build`，输出目录 `dist` |
| 后端 | 独立 Cloudflare Worker：`backend/src/worker.js`，通过 `backend/wrangler.toml` 部署 |
| 数据库 | D1 是当前必需后端存储；KV 只保留为旧同步数据/认证迁移兼容 |
| 同步 | 默认仍是 `b_*` 整键保存的键级增量 LWW、复合游标和 AES-GCM 密文同步；实体级 D1 push/pull、LWW、tombstone 兼容层已实现但未切换默认 |
| 当前产品中心 | Case（现实课题）→ 木、火、土、金、水五阶段；任务等是被关联的工具实体 |
| 测试 | `npm run build`、`npm test`（44 项）、`npm run test:node`（15 项）、`npm run test:e2e`（19 项）、`npm run test:pwa` 均通过；`git diff --check` 通过 |

## 本轮已完成

- 前后端分离已完成：Pages 前端 + Worker/D1 API；前端 API 客户端集中在 `src/core/api/client.ts`。
- Case 领域对象、关系表、五阶段工作区、收集箱转行动/课题均已实现。
- Repository 基础层、IndexedDB 镜像和实体变更日志已建立；实体云同步兼容层已建立，但默认键级同步仍保留。
- 当前 UI 已重做：自然低饱和主题、桌面侧栏、移动底部导航、新工作台、课题列表/详情、任务和收集箱；工具模块按需异步加载。

## Git 状态与本次文档改动

- 当前 UI 重设计已在最近提交 `18414cc feat: add case-centered workspace` 中；提交前仍应自行用 `git log -1 --stat` 核对。
- 本次会话新增/更新的未提交内容是 `DESIGN_README.md` 与 `SESSION_HANDOFF.md`，用于纠正过去过时的架构和待办描述。
- 在操作前先运行 `git status --short`，不要覆盖用户后续产生的改动。

## 真正待办（不要重复做已完成项）

### P0 数据安全

1. 实体级同步已成为 Cloudflare 默认流程；首次连接自动迁移本地集合，后台仍保留迁移计划、冲突扫描和回滚入口。
2. 键级同步继续保留，用于标量键和兼容镜像；实体同步已有 tombstone/LWW/游标 E2E 覆盖。
3. KV 已退役，D1 是唯一云端来源。

### P1 Case 可用性

1. 任务/日记/人物/财务/文章列表已可直接关联 Case；土阶段已支持快捷新建人物、日记、财务和文章。
2. 任务的截止日期、排序、筛选与 Case 上下文已完成。
3. Case 的优先级、截止日、删除/归档确认、搜索、阶段完成度已完成。
4. 水阶段下一轮课题输入与土阶段快捷新建资源已完成。

### P2 体验/工程

1. 逐页重做余下工具模块的 UI 与移动端细节。
2. QuoteWall、全局课题搜索/命令面板、8 秒撤销删除、主要页面空状态和基础无障碍标签已完成；完整人工读屏审计仍可继续。
3. PWA 构建 hash precache、`npm run test:pwa` 资源完整性演练、Worker D1/同步路由拆分已完成；AES-GCM 传输加密已启用。

## 部署备忘

- Worker：在 `backend/wrangler.toml` 配置 D1 `database_id`、`FRONTEND_ORIGINS`；部署命令 `npm run deploy:api`。
- Pages：环境变量 `VITE_API_BASE_URL=https://<worker>.workers.dev`，构建 `npm run build`，目录 `dist`。
- 本轮 Pages 部署预览：`https://8df2397e.beryl-ddk.pages.dev`；主域名与 `/sw.js` 已完成线上 200 校验。
- 最新 Pages 部署预览：`https://2482983a.beryl-ddk.pages.dev`；主域名、`/sw.js`、Worker `/api/health` 已完成线上 200 校验。
- 访问 `https://<worker>/api/data` 返回 `unauthorized` 说明 API 可达；`/api/health` 可用于健康检查。
- `workers.dev` 域名由 Cloudflare 账户级子域决定，改显示用户名不会变。中国大陆部分网络无法直连 Pages/Workers，需另行做国内可达性架构。

> 2026-08-17 生产检查：`/api/health` 正常，旧同步接口、新实体同步接口和 `/api/kv-status` 未授权均返回 401，KV 已从生产绑定移除。Worker 版本 ID：`d6d7240f-cf9a-4b3c-be22-fac6d545a148`。
> Pages 最新前端已部署到项目 `beryl`；预览地址 `https://2482983a.beryl-ddk.pages.dev`，主域名与预览域名 HTTP 200。

## 可直接复制到下个对话的提示词

```text
继续开发 D:\dsharness 的 Beryl 项目。请先完整阅读：
1) D:\dsharness\SESSION_HANDOFF.md
2) D:\dsharness\DESIGN_README.md 的 §15、§16、§17

重要约束：
- 当前是 Cloudflare Pages 前端 + 独立 Cloudflare Worker/D1 后端，必须保持前后端分离；不要把 Worker 放回 Pages 或改为传统服务器。
- 默认同步仍是键级增量 LWW：本地集合整键传输，使用复合游标和 AES-GCM 密文；实体级 D1 兼容层已实现但未切换默认，任何生产灰度必须保留迁移、回滚和测试。
- Case（现实课题）是产品中心；任务、日记、人物、财务和文章等是可关联资源。
- 本地工作区可能有未提交改动，先执行 git status --short 和阅读相关源文件；不要覆盖无关改动。
- 使用 apply_patch 修改文件；每次代码改动后同步更新 DESIGN_README.md §17 与本交接文档。
- 改动后至少执行 npm run build、npm run test:node、git diff --check，并报告结果。

请先根据 §17.3 的未完成清单，检查代码现状；默认实体同步、备份恢复代码演练、基础无障碍与撤销体验已落地，后续主要是旧模块视觉细节、人工读屏和 CSS 体积优化。
```
