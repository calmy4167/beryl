# React 迁移记录

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
- React AppShell 已接管桌面侧栏、侧栏收起/展开、移动底部导航、更多入口抽屉、右侧上下文边、主题和保存状态；
- Today、Capture、Matters、Review、日历、人物、资料、图谱、场景、收件箱、任务、习惯、财务、目标、番茄钟、日记和文章已接入 React 路由，并继续复用原有领域仓储和应用用例；
- Admin 的常用设置、旧版统计口径、持久化重试、导入失败回滚、二次重置确认、导入导出、Cloudflare、S3、本地文件同步和诊断已由 React 承接；Vault/实体迁移等高风险能力通过隔离兼容桥接回 React 工作台，避免迁移期间丢失功能；
- React 扩展页面统一使用按需加载，收件箱、任务、习惯、财务、目标、番茄钟、日记、文章、资料、日历、人物、图谱和场景不会进入首屏页面代码；
- 旧 Vue 入口和兼容桥仍保留在仓库中，但不再作为整个应用的主入口渲染；
- UI smoke、54 个 Vitest 文件/264 个测试、生产构建和 PWA 预缓存均通过；当前异步持久化边界覆盖到 Finance、Pomo、Inbox 的兼容写入。

## 当前阶段

当前是“React 生产工作台 + Vue 迁移兼容层”阶段。核心工作流、参考产品页和主要扩展模块已由 React 接管；Vue、Vue Router、Element Plus 及旧入口暂不删除，避免影响仍依赖旧组件的边缘功能。

## 下一步

不再在本文件维护独立任务列表，统一执行 [`OPEN_WORK.md`](OPEN_WORK.md)：当前继续完成跨仓储 Application Use Case 提取、IndexedDB 边界深化和人工端侧验收，再评估 Vue 兼容层退出；Flow、真实 Bridge、AI 深化和共享空间属于受控扩展。
