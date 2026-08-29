# React 迁移记录

> 当前事实校准：2026-08-29。文件名保留迁移启动日期；最新剩余任务只以 `OPEN_WORK.md` 为准。

## 选型

目标技术栈：React + Vite + TypeScript + React Router。

选择 React 是为了扩大前端生态与人员可获得性；选择 Vite 而不是 Next.js，是因为当前产品是本地优先、Hash 路由、静态部署和 PWA，不依赖服务端渲染。

## 不变边界

以下内容在迁移期间保持不变：

- `src/core/**`：认证、IndexedDB、storage、repository、同步、备份；
- `src/domain/**`：领域模型、查询和异步仓储；
- `src/application/**`：应用用例；
- localStorage 键名、IndexedDB schema、Hash URL、PWA service worker；
- 离线、导入导出、同步冲突和保存状态协议。

## 已完成

- 安装 React、React DOM、React Router、React Vite 插件和 TypeScript 类型；
- Vite 同时支持 Vue 与 React；
- React 入口 `src/react/main.tsx` 已接管应用启动和生产环境 Service Worker 注册；
- React Router 已接管 Hash 路由、登录守卫、旧 `/app/home` 书签兼容和扩展模块入口；
- React AppShell（`src/react/AppShell.tsx`）已接管桌面侧栏、侧栏收起/展开、移动底部导航、更多入口抽屉、右侧上下文边、主题和保存状态；共享 Button、页面头部和焦点陷阱位于 `src/react/ui.tsx`；
- Today、Capture、Matters、Review、日历、人物、资料、图谱、场景、收件箱、任务、习惯、财务、目标、番茄钟、日记和文章已接入 React 路由，并继续复用原有领域仓储和应用用例；
- Admin 的常用设置、旧版统计口径、持久化重试、导入失败回滚、二次重置确认、导入导出、Cloudflare、S3、本地文件同步和诊断已由 React 承接；Vault/实体迁移等高风险能力通过隔离兼容桥接回 React 工作台，避免迁移期间丢失功能；
- React 扩展页面统一使用按需加载，收件箱、任务、习惯、财务、目标、番茄钟、日记、文章、资料、日历、人物、图谱和场景不会进入首屏页面代码；
- 2026-08-29 已将上述 React lazy 页面注册集中到 `src/react/lazy-pages.ts`，不改变 URL、Suspense 边界或按需加载行为；路由树、AppShell 和页面状态仍由 OW-07 继续拆分。
- 2026-08-29 已将路由树、旧入口兼容重定向和 Suspense 边界收口到 `src/react/routes.tsx`；`App.tsx` 只负责启动、守卫组件和页面节点装配，页面状态拆分仍由 OW-07 继续推进。
- 旧 Vue 入口和兼容桥仍保留在仓库中，但不再作为整个应用的主入口渲染；键级立即同步/自动恢复完成后会继续调用实体同步，兼容层仍不是新的事实查询入口；
- UI smoke、58 个 Vitest 文件/292 个测试、Node 15/15、同步协议 22/22、IndexedDB 浏览器运行时、生产构建和 PWA 预缓存均通过；当前异步持久化边界覆盖到 Finance、Pomo、Inbox 的兼容写入，Finance/Inbox 跨仓储流程已提取为 Application Use Case，React Review、全局搜索及其他 React 模块的 Reality 查询也已切换到异步 Repository；业务集合值与实体日志已实现同事务提交且 pending replay 保留日志上下文，首次实体同步已增加推送后的完整 pull 确认，实体与键级主同步 pull cursor、push cursor 已增加 durable `meta` 确认，键级同步业务白名单隔离、键级同步/实体同步编排边界、React 页面同步 Reality 隔离、React/Vue 生产入口隔离和 Capture Attention Gate 的跨集合重复提交保护已补齐。

## 当前阶段

当前是“React 生产工作台 + Vue 迁移兼容层”阶段。入口审计和浏览器 smoke 已确认 React 是唯一生产启动链，静态回归同时确认 React 页面目录不直接依赖 Vue、Vue Router 或 Element Plus；未被生产路由引用的 `LegacyVueHost` 已完成第一批清理，旧 `/app/cases`、`/app/cases/:id`、`/app/module/chars`、`/app/module/moments` 和未知 `/app/module/:id` 已补齐 React 兼容重定向并通过 UI smoke，其余 Vue、Vue Router、Element Plus 及旧入口暂不删除，避免影响仍依赖旧组件的边缘功能；普通设置走 React，完整旧版设置/实体迁移工具仅由显式 `admin/advanced` 兼容路由承载，返回 React 后旧桥接会卸载。

## 下一步

不再在本文件维护独立任务列表，统一执行 [`OPEN_WORK.md`](OPEN_WORK.md)：当前继续完成 IndexedDB 边界深化和人工端侧验收，再评估 Vue 兼容层退出；Flow、真实 Bridge、AI 深化和共享空间属于受控扩展。

## 2026-08-29 边界说明

React 生产页面使用 `listRealityDocumentsAsync` 读取跨域 Reality；同步 `listRealityDocuments` 及 `src/core/modules.ts` 的同步统计 reader 仅保留给 Vue/旧模块兼容，React bootstrap 不再注册该同步 reader。实体同步的 LWW、删除墓碑、durable flush 和共享协作命令幂等均已有自动化回归，不能据此把 Vue 兼容层或真实端侧验收标记为完成。
