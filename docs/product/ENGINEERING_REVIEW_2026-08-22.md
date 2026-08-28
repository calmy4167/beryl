# Calmy 工程与设计一致性评审

> 评审日期：2026-08-22 · 范围：产品文档、路由、主要视图、领域层、持久化、同步、测试与品牌表达。

> 第 1–11 节为 2026-08-22 至 2026-08-23 的评审历史快照；当前实现状态以第 12 节及 [`OPEN_WORK.md`](OPEN_WORK.md) 为准。

## 1. 结论

代码已经具备相当多的领域对象、导入导出、同步防护和自动化测试。产品壳已收敛到 Calmy 的核心闭环，Today、Capture、Matters、Review 作为默认主路径，旧入口仍以兼容方式保留。当前最大风险不再是默认导航，而是旧模型迁移、二级/高级页面的异步边界和真实设备验收尚未闭合。

因此当前状态应定义为“领域与基础设施能力丰富、核心产品闭环待收敛”，不能定义为完整产品已完成。

## 2. 设计—代码对齐矩阵

| 产品约束 | 当前证据 | 判断 | 处理 |
|---|---|---|---|
| 一条核心闭环 | Today、Capture、Matters、Review 均有页面 | 部分对齐 | 让 Today 成为默认入口并做端到端闭环验收 |
| 首版导航精简 | React 主导航为 Today、Capture、Matters、Review，其余入口进入 More/二级路由 | 已对齐 | 保持四入口，兼容入口不回到默认导航 |
| Cases / Matters 单一概念 | Case→Matter 迁移和主路径统一，旧 URL 保留兼容 | 当前切片已对齐 | 禁止旧模型新增写入 |
| 单一 Capture | inbox→Capture 主路径已统一，旧入口保留兼容 | 当前切片已对齐 | 禁止旧入口成为默认入口 |
| 关系系统不进 MVP | People、共享写入、四种关系场景已可见 | 范围超前 | 默认降级或实验开关 |
| 五行默认隐藏 | 十神分类和场景模块在导航直接出现 | 不对齐 | 只在高级解释层显示 |
| IndexedDB 为权威 | 异步 Repository 已逐步建立 | 核心页面与共享协作主路径已接入 | Today、Capture、Review、Matters/Matter、Calendar、People 及共享 Matter/Action/Record 主路径已使用异步读取与主要写入；旧同步 API 仍作为兼容层存在 |
| AI 不自动改事实 | 协议强调建议、确认、可撤销 | 原则对齐 | 用 UI 集成测试验证，不只看协议 |
| 开放格式可携带 | 有导入导出、Vault Adapter 和测试 | 较好 | 以真实样本往返和失败恢复验收 |
| 实时桥接非 MVP | 存在 Bridge 协议与相关实现切片 | 易误解 | 文案明确“实验/未联调”，不宣称真实 Bridge 可用 |
| 品牌统一 | 包名和 AppShell 仍为 `beryl` | 不对齐 | 单独迁移品牌、存储键和兼容策略 |

## 3. P0 风险

### 3.1 核心页面已迁移，边界仍需显式化

Today、Capture、Review、Matters 列表和 Matter 主路径已经接入 async Repository；Action 状态命令、Capture suggestion 的跨领域接受、共享协作 Gateway 和历史回放也已补齐异步入口。仍需关注的边界包括：

- Matter 的 Cycle/Stage/Outcome/Practice 主要创建、状态流转和绑定写入已接入 async facade；共享 Matter/Action/Record 写入、revision/command 日志和 Matter/Record 历史回放已接入 async facade；
- Calendar、People 的主要读取、人物主写入和 Relationship/Shared Space 写入已迁移；共享上下文查询也已提供异步入口；
- 旧同步 API 仍作为迁移层存在，因此不能宣称全域已经纯异步；
- 导出再导入、离线重开、核心保存状态和失败恢复已有自动化覆盖；剩余重点是 Vue/旧模块兼容边界、复杂高级同步路径，以及真实设备和辅助技术人工验收。

下一步目标是统一 Application Service：页面只调用异步用例，等待 readiness，并获得明确的 `savedLocally / syncPending / failed` 结果；同时把兼容查询和高级路径标识为 secondary/legacy，而不是让它们重新成为主产品入口。

### 3.2 页面承担领域编排

Vue Case/旧模块及部分高级页面仍存在页面侧编排。React 核心 Today、Capture、Review、Matters 已使用 Application Use Case；后续只继续收口剩余兼容和高级路径，避免重新形成页面侧事务。

### 3.3 双领域和双品牌

Cases / Matters、inbox / Capture、Beryl / Calmy、旧模块 / 统一实体同时存在。兼容代码可以存在，但用户路径和新写入必须只有一套。否则无法定义稳定的数据迁移和埋点口径。

## 4. P1 风险

- 视图文件体积大，数据读取、领域命令和展示耦合，难以做状态级测试。
- 路由没有产品分层，实验功能与主流程同权。
- 多个事件和存储键仍使用 `beryl-*`，品牌迁移需要兼容读取而不是直接改名。
- 同步、Vault Adapter、Companion Bridge 容易在 UI 中被合并成一个“同步”概念，用户无法知道数据实际保存在哪里。
- 静态无障碍检查已经增加，但尚缺移动设备、键盘、读屏和大字号人工审计。
- 性能基线通过不代表复杂真实数据量下的列表和图谱性能可接受。
- 核心路径已移除外部 Quote 请求，当前代码未引用 Google Fonts；外部网络请求仅存在于用户显式启用的同步或 Vault 适配器，不属于首屏依赖。
- 当前性能阈值允许首屏 12 秒、路由 5 秒，适合作为防死锁上限，不适合作为产品体验目标。

## 5. 目标架构

```text
Vue Views / Components
        ↓ 只调用异步用例
Application Use Cases
  - OpenToday
  - CaptureText
  - AddActionToToday
  - RecordActionResult
  - CompleteReview
        ↓
Domain Commands + Policies
        ↓
Repository Interfaces
        ↓
IndexedDB authoritative store
        ├─ local migration compatibility
        ├─ Markdown import/export adapter
        └─ optional sync/bridge adapters
```

界面只感知保存结果和冲突，不感知 localStorage、IndexedDB、D1 或 Obsidian 的具体编排。

## 6. 推荐迁移顺序（2026-08-22 历史快照）

1. 冻结新模块、新实体和新导航入口；已完成核心 AppShell 收敛，继续保持旧入口兼容但不默认展示。
2. 完成 Case→Matter、Task→Action、inbox→Capture 的迁移、只读化和回滚策略，禁止旧模型新增写入。
3. 收口共享协作 Gateway、历史回放与部分兼容查询的异步边界；本轮已完成核心共享路径。
4. 建立统一保存结果：本地已保存、同步等待、冲突和失败，并覆盖核心页面的失败恢复；本轮已完成首个 UI 切片。
5. 建立真实浏览器端闭环测试：刷新、离线、冲突、失败恢复、导出再导入；随后进行移动端、键盘和读屏人工验收。
6. 完成品牌与存储键兼容读取的长期迁移策略，最后再删除旧入口或旧兼容实现。

## 7. 测试事实的正确表述

截至 2026-08-22 的历史快照，自动化结果为 53 个 Vitest 文件、260 个测试通过，Node 验证 15/15、E2E 22/22，并有浏览器 IndexedDB、UI、性能和 PWA 验证记录。当前验证数量和边界见第 12 节；历史结果不代表当前基线。这些结果证明当时已覆盖的代码路径没有检测到回归；它们不证明：

- 所有页面已经使用纯异步 Application Use Case 和 IndexedDB 权威写入；
- Companion Bridge 已与真实外部服务联调；
- 移动设备和读屏体验已通过人工审计；
- 用户能理解当前复杂导航并完成核心价值闭环。

## 8. 停止线

在以下事项完成前停止增加新产品模块：

- 核心四页导航和命名统一；
- Today → Record → Review 真实浏览器闭环稳定；
- 二级页面与 Matter 高级过程编排完成异步持久化迁移；
- 旧模型迁移已经过真实样本之外的所有生产级往返和显式回滚演练；
- 本地保存、同步等待、冲突和失败恢复在 UI 中可区分。

## 9. 2026-08-22 输入布局与切换性能收敛

- Today 记录区、行动创建区和 Matters 目录改用容器宽度驱动的弹性布局，避免固定列宽在平板和紧凑桌面下挤压输入框。
- IndexedDB 仍是持久权威来源，但应用启动完成快照恢复后，页面 Repository 读取优先使用已恢复的内存快照；只有缓存尚未就绪时才重新读取持久层。
- AppShell 增加短页面过渡，保留现有路由、离线、Open Vault 和保存协议，不引入芋道/若依后台依赖。

## 10. 2026-08-22 并行评审后的收口（历史快照）

- 多路评审确认，当前卡顿主要来自路由重挂载、重复读取和轮询重叠，不是更换后台脚手架即可解决的问题。
- 核心四页启用有限 KeepAlive；Today、Capture、Matters、Review 在空闲或即将点击时预热；当前页面才监听同步事件，并将 80ms 内的重复刷新合并。
- 同步轮询增加 single-flight；Review 在指定时间范围内一次读取现实文档，再按日期分组，避免近 90 天按天重复扫描全量数据。
- Today 在 1100px 以下切单列，记录区和行动创建区在 1100px 以下改为安全的两列/分行布局；Review 在 1050px 以下切单列；回归检查覆盖 390、820、1024、1280px 的无重叠与无横向溢出。
- 当时验证：53 个 Vitest 文件、260 个测试，类型检查、浏览器 UI smoke、性能基线、生产构建和 PWA 预缓存均通过；当前基线见第 12 节。

## 11. 2026-08-23 文件与实现状态收口

- `index.html → src/react/main.tsx → src/react/App.tsx` 已确认是当前生产启动链路；`src/main.ts`、`src/App.vue`、`src/router` 和 `src/views` 归类为 Vue 迁移兼容层，暂不删除。
- React AppShell 已包含左侧主导航、顶部状态、宽屏右侧独立栏和窄桌面/移动端 More 抽屉；右侧栏默认收起、可独立记忆，相关回归已加入 UI smoke。
- 参考产品页 Cycle、我的和目标入口已接入，旧模块路由继续保留；这些页面不改变现有领域事实源。
- 当前已完成项不再进入活跃任务；未完成工作统一见 [`OPEN_WORK.md`](OPEN_WORK.md)，后续不再从旧 2026-08-19 任务拆解文档恢复任务。

截至该阶段尚未闭合的工程边界包括：真实样本迁移演练、扩展页面的 Application Use Case/IndexedDB 收口、真实设备与读屏人工验收、外部字体/Quote 依赖、Vue 兼容层退出评估、Flow 内容能力和真实 Bridge 联调。真实样本迁移和 Quote 外部请求已在后续切片完成；当前剩余项以本文件 2026-08-28 校准段和 [`OPEN_WORK.md`](OPEN_WORK.md) 为准，不应被“页面存在”或自动化测试通过替代。

## 12. 2026-08-28 档案与实现再校准

- React 生产页面的跨域 Reality 读取已统一使用 `listRealityDocumentsAsync`；Review 的 Action / Record 证据读取同样通过异步 Repository 完成。
- `src/react/bootstrap.ts` 和 `src/main.ts` 中的同步模块统计 reader 仍为旧模块/Vue 兼容边界。它服务同步统计 API，不代表 React 页面继续以同步 Reality 查询作为事实源。
- 实体级同步已完成远端应用后的 durable flush、本地未上传版本的 `(updatedAt, device)` LWW 保护、删除墓碑回归；共享协作异步写入已完成调用方命令 ID 幂等回归。
- 当前自动化验证为 57 个 Vitest 文件、278 个测试；Node 15/15、同步协议 22/22、IndexedDB 浏览器运行时、`vue-tsc`、生产构建、PWA、性能和 UI browser smoke 均通过。未完成项只以 [`OPEN_WORK.md`](OPEN_WORK.md) 为准，当前 P0 仍包括 OW-03 的实体日志/首次同步/游标 durable 复核与 OW-04 人工端侧验收。
