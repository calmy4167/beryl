# Calmy 项目文件架构

> 更新时间：2026-09-26
> 本文描述当前仓库的生产入口、代码边界、文档分层和迁移档案。

## 1. 生产启动链路

```text
index.html
  → src/main.ts（Vue 3、Pinia、Element Plus 和生产样式）
  → initDb / 读取并恢复 durable snapshot / 兼容数据迁移
  → src/App.vue（会话守卫、同步恢复和 RouterView）
  → src/router/index.ts（Hash 路由、认证守卫、兼容重定向）
  → src/vue/shell/AppShell.vue + src/vue/page-registry.ts
  → src/vue/pages/*（各产品页面和设置页）
  → src/application + src/domain + src/core
  → IndexedDB / localStorage 兼容层 / 可选同步适配器 / Feishu Bitable adapter
```

`index.html` 是唯一应用入口。工作台和独立页面均由 Vue Router 懒加载；`src/router/route-manifest.ts` 保存框架中立的路由、导航和页面元数据，`src/vue/page-registry.ts` 将页面清单接入 Vue。React 运行时代码、依赖、构建插件和预览页已从工程移除；迁移时的配对 PNG/几何数据只作为历史验收档案保存。

## 2. 目录职责

| 目录 | 职责 | 当前边界 |
|---|---|---|
| `src/vue/` | Vue 工作台壳层、导航、标签、目录弹层和产品页面 | 当前 UI；页面调用 Application、Domain 与 Core |
| `src/router/` | Vue Router、共享路由/导航清单、工作区标签状态 | 路由与兼容 URL 的唯一入口 |
| `src/application/` | 跨实体用户用例，如 Today、Capture、Review 和结果记录 | 写入编排边界 |
| `src/domain/` | Entity、状态机、Repository 契约、查询、迁移和统一模型 | 领域事实与规则 |
| `src/core/` | 认证、存储、IndexedDB、备份、同步、开放格式和适配器 | 基础设施，不由页面替代 |
| `src/components/` | 可复用 Vue 控件和共享组件 | 跨页面展示/交互能力 |
| `src/views/` | 与旧数据/功能接轨的 Vue 页面模块 | 由当前 Vue 页面按需组合；不是另一套运行时 |
| `src/styles/` | 全局基础样式、共享样式和模块样式 | 由 `src/main.ts` 载入共享样式，按需样式随页面加载 |
| `src/ui/` | 主题偏好等框架中立的界面状态 | UI 持久化和系统偏好边界 |
| `backend/` | Cloudflare Worker、D1、同步 API、飞书多维表格适配器 | 可选云端适配器；飞书凭证只保存在 Worker 侧 |
| `obsidian-plugin/` | Obsidian 插件和 Vault 适配端 | 外部组件；协议/联调由 OW-13 管理 |
| `public/` | PWA manifest、图标和静态运行时资源 | 生产静态资源 |
| `scripts/` | 构建后预缓存和 PWA 校验脚本 | 发布工具 |
| `test/` | 浏览器运行时、E2E、性能、IDB、PWA 与镜像比较脚本 | 运行时验证工具；迁移配对图像保存在 `captures/` 和迁移档案 |
| `src/__tests__/` | Vitest 领域、仓储、用例及 Vue 组件测试 | 单元/集成测试 |
| `docs/` | 当前产品文档、工程档案和历史资料 | 唯一文档导航入口 |
| `prototypes/` | 未接入生产入口的一次性实验 | 非运行时代码 |

## 3. 页面与路由边界

- `src/router/route-manifest.ts` 定义用户可见页面、导航分组、页面描述、兼容重定向与页面类型；未知旧模块入口由兼容占位页接住。
- `src/router/index.ts` 用 `createWebHashHistory()` 构建路由，并在进入工作台/受保护页面时验证会话；`/app/admin/advanced` 继续兼容并复用同一设置体验。
- `src/vue/shell/AppShell.vue` 负责桌面/移动导航、工作区标签、页面容器、焦点和全局搜索等共用交互。
- `src/vue/pages/` 保存 Today、Capture、Matters、Review、Calendar、People、Library、Graph、Inbox、Tasks、Task Board、Feishu、Memory、Habits、Finance、Goals、Pomo、Diary、Posts、Future、Cycle、Flow、Profile、登录、场景及设置等 Vue 页面。
- 旧路由兼容只负责将既有 URL 送到当前 Vue 页面或占位说明，不重新引入第二套页面实现或事实源。

## 4. 数据与写入边界

```text
Vue page
  → Application Use Case
  → Domain Command / Policy
  → Async Repository
  → IndexedDB durable snapshot + outbox
  → optional backup / Markdown / sync / Bridge / Feishu adapter
```

核心页面不得把 `localStorage`、D1、Vault 或同步协议当作业务事实源。旧同步 Repository、`src/core/modules.ts` 的同步统计读取和 `beryl-*` 键名只保留为兼容边界；新的核心写入通过异步 Repository 和保存状态协议。数据导出、Portable Vault、云同步和外部连接分别服从对应协议与当前开放工作。

飞书仍属于外部适配层：页面经 `src/core/feishu/` 工作区服务读取缓存或写入操作，API 调用通过 `backend/src/routes/feishu.js` 和 `backend/src/lib/feishu.js`；`FEISHU_APP_SECRET` 只能作为 Worker Secret。字段变化、授权和多人边界以 `docs/product/reference/Calmy_Feishu_数据适配与授权协议_2026-09-19.md` 及 OW-19 为准。

## 5. 文档与验收证据

### 当前入口

- `docs/README.md`：全部文档导航和权威层级。
- `docs/PROJECT_STRUCTURE.md`：本文件，当前代码目录和边界。
- `docs/product/DOCUMENT_REGISTER.md`：文档状态登记和冲突处理。
- `docs/product/OPEN_WORK.md`：唯一活跃未完成工作清单。

### 当前产品与工程文档

- `docs/product/CALMY_PRODUCT_DESIGN_2026-09-19.md`：当前产品方向和体验边界。
- `docs/product/PRODUCT_DECISIONS_2026-08-19.md`：已接受决策与变更纪律。
- `docs/product/CALMY_OPEN_DATA_AND_PORTABLE_VAULT_2026-09-24.md`：开放数据与 Portable Vault 规划。
- `docs/product/MASTER_DATA_AND_ENTITY_REFERENCES_2026-09-24.md`：主数据与实体引用设计。
- `docs/product/REACT_MIGRATION_2026-08-23.md`：旧 React 实施事实的历史快照，不定义当前技术栈。
- `docs/superpowers/migrations/2026-09-24-vue-parity-ledger.md`：Vue 迁移逐页验收、截图复核和最终门禁证据。
- `docs/superpowers/plans/2026-09-24-vue-exact-parity-migration.md`：迁移计划和最终完成记录。

`docs/product/reference/` 集中保存领域与协议参考；它们不能覆盖当前产品设计，也不承载活跃优先级。原始 DOCX 位于 `docs/product/source/`，只读保留。`docs/implementation/` 和 `docs/operations/` 保存实现/交接快照，不替代产品待办入口。

### 文件放置规则

- 新产品方向和 UX 总体变更：更新当前产品设计；接受的裁决同时追加到产品决策。
- 新未完成事项：写入 `docs/product/OPEN_WORK.md`，避免新增重复待办。
- 新领域约束：更新 `docs/product/reference/` 中对应协议并更新登记册。
- 新实现证据：写入实现档案或迁移台账，不把已完成任务再放回活跃待办。
- 新自动化验证入口：放入 `test/` 或 `src/__tests__/`，并记录可复现命令。
- 原型和一次性实验：放入明确的 `docs/` 或 `prototypes/` 子目录，不在根目录增加无说明脚本。

## 6. 本地和历史文件

- `_v1-backup/`、`.docx-review-2026-08-19/`、`.wrangler/`、`dist/`、`node_modules/` 属于本地备份、生成物或依赖目录，不作为产品源码和文档依据。
- `docs/history/` 保存 Beryl 历史资料；保留迁移证据，不从中恢复已废弃产品范围。
- `captures/` 与 `docs/superpowers/migrations/captures/` 中的 React/Vue 成对图像是迁移历史证据，不是应用入口或可执行运行时。
- `prototypes/csdiy-p1.js`、`prototypes/csdiy-p2.js`、`prototypes/csdiy-p3.js` 是未接入生产入口的原型脚本。
