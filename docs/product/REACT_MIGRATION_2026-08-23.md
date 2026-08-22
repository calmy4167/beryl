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
- Today、Capture、Matters、Review、Admin 已切换到 React，并继续复用原有领域仓储和应用用例；
- 旧 Vue 入口和兼容桥仍保留在仓库中，供未迁移扩展页面回退，不再作为主入口渲染；
- UI smoke、53 个 Vitest 文件/260 个测试、生产构建和 PWA 预缓存均通过。

## 当前阶段

当前是“React 工作台 + Vue 回退代码”阶段。核心工作流已经由 React 接管；日历、人物、资料、图谱和场景等扩展入口已统一到 React 路由，并显示明确迁移状态。Vue、Vue Router、Element Plus 及旧入口暂不删除，避免影响仍依赖旧组件的边缘功能。

## 下一步

1. 将日历、人物、资料、图谱、场景等扩展页面从迁移占位页替换为 React 功能页；
2. 逐步删除 Vue 兼容桥、Vue Router 和 Element Plus，并按页面拆分首包；
3. 完成扩展页面的离线、导入导出、同步和可访问性回归。
