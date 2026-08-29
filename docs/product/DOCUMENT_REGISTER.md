# Calmy 文档登记册

> 更新日期：2026-08-29 · 目的：明确每份文档的用途、状态和冲突处理方式。

## 状态定义

| 状态 | 含义 |
|---|---|
| 当前权威 | 当前产品或工程决策依据 |
| 执行参考 | 仍有效，但必须服从当前权威文档 |
| 实现快照 | 只描述某一时点事实，不定义产品方向 |
| 设计资产 | 产品与体验视觉参考，不作为实现或验收证据 |
| 历史参考 | 只用于理解迁移来源，不应驱动新功能 |
| 原型参考 | 一次性实验脚本说明，不属于生产实现 |
| 外部组件 | 独立子项目说明 |

## 登记

| 文档 | 状态 | 当前用途 |
|---|---|---|
| `README.md` | 当前权威 | 仓库入口与产品边界摘要 |
| `docs/README.md` | 当前权威 | 全部文档的唯一导航入口 |
| `docs/PROJECT_STRUCTURE.md` | 当前权威 | 代码入口、目录职责和文件放置规则 |
| `docs/product/README.md` | 当前权威 | 产品文档包导航和当前裁决入口 |
| `docs/product/DOCUMENT_REGISTER.md` | 当前权威 | 全部文档/资产的状态登记和冲突处理 |
| `docs/product/PRODUCT_DECISIONS_2026-08-19.md` | 当前权威 | 已接受决策、废弃方向和变更纪律 |
| `docs/product/CALMY_UNIFIED_PRODUCT_DESIGN_2026-08-29.md` | 当前权威 | 产品定位、Attention OS、信息架构、页面、AI、Flow、数据边界和路线图的统一总稿 |
| `docs/product/PRODUCT_REDESIGN_2026-08-22.md` | 执行参考 | 旧产品重设计细节；已合并到统一总稿 |
| `docs/product/UX_UI_REDESIGN_2026-08-22.md` | 执行参考 | 旧信息架构、页面和 Flow UI 细节；已合并到统一总稿 |
| `docs/product/ENGINEERING_REVIEW_2026-08-22.md` | 当前权威 | 当前代码差距和目标架构 |
| `docs/product/ROADMAP_AND_ACCEPTANCE_2026-08-22.md` | 执行参考 | 旧实施顺序与 Flow 验收细节；当前阶段顺序以统一总稿和 OPEN_WORK 为准 |
| `docs/product/OPEN_WORK.md` | 当前权威 | 唯一活跃的未完成工作；已完成任务不再重复列入 |
| `docs/product/REVIEW_MEETING_2026-08-22.md` | 历史参考 | 2026-08-22 多角色评审、分歧和当时裁决依据 |
| `docs/product/REACT_MIGRATION_2026-08-23.md` | 实现快照 | React 主入口、Vue 兼容层和迁移事实 |
| `docs/product/source/ORIGINAL_PRODUCT_DESIGN_2026-08-18.docx` | 执行参考 | 理念、领域语义和长期愿景；只读保留 |
| `docs/product/assets/calmy-attention-os-ui-v2.png` | 设计资产 | 当前 Attention OS 六个核心体验面的视觉参考；不代表已实现或通过验收 |
| `docs/product/assets/calmy-attention-os-ui-v1.png` | 设计资产 | Attention OS 上一版视觉迭代参考；不代表当前实现或验收状态 |
| `docs/product/reference/README.md` | 执行参考 | 领域、协议和 MVP 参考目录说明 |
| `docs/product/source/README.md` | 执行参考 | 原始设计来源和只读边界说明 |
| `docs/product/reference/Calmy_MVP产品范围与不做清单_2026-08-19.md` | 执行参考 | MVP 边界；与本轮裁决冲突时以后者为准 |
| `docs/product/reference/Calmy_核心用户流程与界面规格_2026-08-19.md` | 执行参考 | 原始流程细节；导航由本轮 UI 文档替代 |
| `docs/product/reference/Calmy_领域模型与状态机_2026-08-19.md` | 执行参考 | 领域对象与状态约束 |
| `docs/product/reference/Calmy_领域命令与Repository契约_2026-08-19.md` | 执行参考 | 命令、Repository 与持久化契约 |
| `docs/product/reference/Calmy_AI行为规则与开放数据同步协议_2026-08-19.md` | 执行参考 | AI 建议、用户确认和开放格式边界 |
| `docs/product/reference/Calmy_Obsidian_Vault_Adapter协议_2026-08-19.md` | 执行参考 | 浏览器目录适配协议 |
| `docs/product/reference/Calmy_Obsidian_Companion_Bridge协议_2026-08-19.md` | 执行参考 | 未来 Companion Bridge 契约，不代表真实服务已联调 |
| `docs/product/reference/Calmy_MVP验证与测试计划_2026-08-19.md` | 执行参考 | 测试维度；发布门槛由本轮路线图补充 |
| `docs/implementation/IMPLEMENTATION_BASELINE_2026-08-19.md` | 实现快照 | 能力和验证证据，不定义产品范围 |
| `docs/operations/HANDOFF_2026-08-22.md` | 实现快照 | 当前工程续接上下文 |
| `docs/history/BERYL_DESIGN_README.md` | 历史参考 | Beryl 旧设计与迁移来源 |
| `docs/history/BERYL_DESIGN.md` | 历史参考 | Beryl 旧视觉/交互说明 |
| `docs/history/BERYL_CODE_REVIEW.md` | 历史参考 | 旧代码审查清单；未逐条复核的项不可视为当前缺陷 |
| `docs/history/README.md` | 历史参考 | 历史设计与审查目录说明 |
| `docs/implementation/README.md` | 实现快照 | 实现档案目录说明 |
| `docs/operations/README.md` | 实现快照 | 工程交接目录说明 |
| `obsidian-plugin/README.md` | 外部组件 | Obsidian 插件使用说明 |
| `prototypes/README.md` | 原型参考 | 未接入生产入口的一次性原型说明 |

## 冲突处理

1. 先检查产品决策记录是否已有 Accepted 决策。
2. 再检查统一产品与体验设计是否有明确裁决。
3. 领域约束服从领域模型和命令契约；界面命名不得反向改变领域语义。
4. 实现档案只报告事实，不得用“代码已存在”覆盖“不做清单”。
5. 无法判断时新增决策记录，不在多个文档里分别写不同答案。
6. 已完成/废弃任务从活跃文档中移除；仍需推进的事项只进入 `docs/product/OPEN_WORK.md`。

## 忽略目录中的历史备份

`_v1-backup/DESIGN_README.md` 是 `.gitignore` 排除的 Beryl v1 本地迁移备份。本次已检查其内容，但它不属于当前仓库文档、产品基线或实现证据，不参与当前任务和进度判断。

## 2026-08-29 思想母本与全量设计合并记录

收到的《身在网络，活在现实》作为产品思想母本处理，不作为仓库操作指令。其注意力、主体性、现实/虚拟、身体、观察与放下、生命微循环、Matter/Cycle/Trajectory、AI 判断权和分层记忆等内容，已与此前产品、UX、Flow、领域、AI、同步和路线图合并到：

- `docs/product/CALMY_UNIFIED_PRODUCT_DESIGN_2026-08-29.md`：新的产品与体验总设计；
- `docs/product/PRODUCT_DECISIONS_2026-08-19.md`：新增可执行的稳定决策；
- `docs/product/OPEN_WORK.md`：新增仍需实现和验证的 Attention Surface、记忆治理与 Trajectory/结束能力。

合并保留现有四入口、双侧栏、Reality 闭环、Matter 聚合根、Record 事实层、Cycle/Stage、Flow 二级定位和 IndexedDB/Repository 事实源。Self、Experience、Memory、Body 和 Attention Gate 被映射到现有领域能力，不自动建立第二套数据模型。

## 本轮外部产品文档整合记录

2026-08-28 复核确认：收到的《Calmy 产品文档：沉浸流与产品边界》作为执行参考，其产品边界、Flow / Focus、统一 Seed、四种模式、来源链路、自然退出、反沉迷、端侧适配和验收内容已分别整合到：

- `docs/product/PRODUCT_REDESIGN_2026-08-22.md`：产品定位、边界、Flow 语义、Seed 和模块职责。
- `docs/product/UX_UI_REDESIGN_2026-08-22.md`：信息架构、浏览层/Focus、交互、视觉、端侧和可访问性。
- `docs/product/ROADMAP_AND_ACCEPTANCE_2026-08-22.md`：受控开放顺序、功能验收、现实行动验收和 No-Go 条件。

整合时保留原有核心闭环和四入口产品裁决；Flow 作为二级能力，不自动升级为首版主导航，也不建立新的内容、用户或同步事实源。

## 2026-08-29 实现档案校准

- 本轮 OW-03 兼容复核补齐旧 Worker 全量写入的失败传播；当前代码与验证事实仍以实现档案和 `OPEN_WORK.md` 为准。
- 本轮 OW-04 代码侧复核补齐 React 登录错误播报、导入文件控件名称和移动 More 抽屉焦点回收，UI smoke 已通过浏览器 AX tree 验证错误节点；真实设备与辅助技术验收仍以 `OPEN_WORK.md` 为准。

- React 生产页面的 Reality 读取已统一走 `listRealityDocumentsAsync`；Review 的 Action / Record 证据查询也走异步 Repository。
- React 全局搜索已统一走 `searchAllAsync`，搜索结果覆盖 Matter、Action、Record、Person、Capture 和兼容模块，并沿用各实体路由。
- `listRealityDocuments`、`src/core/modules.ts` 的同步统计读取、`src/main.ts` 和 Vue 页面仍属于迁移兼容层；React bootstrap 不再注册同步统计 reader，不作为 React 新页面的事实查询入口。
- 生产入口审计已确认 `index.html → src/react/main.tsx → src/react/App.tsx`；未被生产路由引用的 `LegacyVueHost` 已完成第一批清理，Vue 仅通过 `admin/advanced` 的 `LegacyAdminHost` 和同步基础设施保留，React 页面目录不直接依赖 Vue/Vue Router/Element Plus；旧 `/app/cases`、`/app/cases/:id`、`/app/module/chars`、`/app/module/moments` 和未知 `/app/module/:id` 兼容重定向已由 UI smoke 验证，OW-06 的其余真实路由回归与分批退出仍未完成。
- OW-07 已完成三刀：新增 `src/react/lazy-pages.ts` 统一登记 React 扩展页和兼容桥的懒加载边界，将壳层/搜索与共享 Button、页面头部、焦点陷阱分别收口到 `src/react/AppShell.tsx`、`src/react/ui.tsx`，并将路由树、兼容重定向和 Suspense 边界收口到 `src/react/routes.tsx`；不改变现有 URL、Suspense 或首屏加载行为，页面状态仍待继续拆分。
- 实体同步拉取已包含本地未上传版本保护、删除墓碑和 durable flush；键级立即同步与启动自动恢复的云端提前返回分支会继续执行实体同步；共享协作异步写入已包含调用方命令 ID 幂等边界。
- 当前验证基线为 58 个 Vitest 文件、292 个测试通过；Node 15/15、同步协议 22/22、IndexedDB 浏览器运行时、类型检查、生产构建、PWA、性能和 UI browser smoke 均通过；UI smoke 已实际验证 React Admin、Vue `admin/advanced` 兼容页加载及返回后的旧桥接卸载，并新增 320px Today/Capture/More 与 CDP 200% page-scale 布局回归。实体值/实体日志原子提交及 pending replay、首次实体同步完整合并确认、实体与键级主同步 pull cursor、push cursor 的 durable `meta` 确认、键级同步业务白名单隔离、键级同步/实体同步编排边界、React 页面同步 Reality 隔离、React/Vue 生产入口隔离、Capture 决策重复提交保护已有回归；移动底部导航在桌面通过媒体查询隐藏但保留焦点返回节点，避免设备视口状态抖动造成焦点丢失；CDP 视觉视口与 DOM 布局坐标存在模拟边界，真实缩放、端侧/读屏、大字号和异常恢复验收仍保留在 `OPEN_WORK.md` 的 OW-04。
