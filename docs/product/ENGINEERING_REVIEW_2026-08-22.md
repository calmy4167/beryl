# Calmy 工程与设计一致性评审

> 评审日期：2026-08-22 · 范围：产品文档、路由、主要视图、领域层、持久化、同步、测试与品牌表达。

## 1. 结论

代码已经具备相当多的领域对象、导入导出、同步防护和自动化测试。产品壳已收敛到 Calmy 的核心闭环，Today、Capture、Matters、Review 作为默认主路径，旧入口仍以兼容方式保留。当前最大风险不再是默认导航，而是旧模型迁移、二级/高级页面的异步边界和真实设备验收尚未闭合。

因此当前状态应定义为“领域与基础设施能力丰富、核心产品闭环待收敛”，不能定义为完整产品已完成。

## 2. 设计—代码对齐矩阵

| 产品约束 | 当前证据 | 判断 | 处理 |
|---|---|---|---|
| 一条核心闭环 | Today、Capture、Matters、Review 均有页面 | 部分对齐 | 让 Today 成为默认入口并做端到端闭环验收 |
| 首版导航精简 | 路由和 AppShell 暴露十余入口与旧工具箱 | 不对齐 | 收敛为 4 个主入口 + More |
| Cases / Matters 单一概念 | 两套列表与详情路由并存 | 不对齐 | 统一到 Matter，保留数据迁移兼容 |
| 单一 Capture | Capture 与旧 inbox 并存 | 不对齐 | 导航只保留 Capture |
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
- 测试覆盖核心页面写入仍需继续扩展到导出再导入、离线失败恢复和真实设备。

下一步目标是统一 Application Service：页面只调用异步用例，等待 readiness，并获得明确的 `savedLocally / syncPending / failed` 结果；同时把兼容查询和高级路径标识为 secondary/legacy，而不是让它们重新成为主产品入口。

### 3.2 页面承担领域编排

Matter、Case 等大视图直接组合多个仓储和状态变化。风险是事务边界分散、错误恢复困难、同一命令在不同页面表现不同。应把“添加到 Today”“完成行动并记录”“结束 Review 并生成下一步”等闭环操作提取为应用用例。

### 3.3 双领域和双品牌

Cases / Matters、inbox / Capture、Beryl / Calmy、旧模块 / 统一实体同时存在。兼容代码可以存在，但用户路径和新写入必须只有一套。否则无法定义稳定的数据迁移和埋点口径。

## 4. P1 风险

- 视图文件体积大，数据读取、领域命令和展示耦合，难以做状态级测试。
- 路由没有产品分层，实验功能与主流程同权。
- 多个事件和存储键仍使用 `beryl-*`，品牌迁移需要兼容读取而不是直接改名。
- 同步、Vault Adapter、Companion Bridge 容易在 UI 中被合并成一个“同步”概念，用户无法知道数据实际保存在哪里。
- 静态无障碍检查已经增加，但尚缺移动设备、键盘、读屏和大字号人工审计。
- 性能基线通过不代表复杂真实数据量下的列表和图谱性能可接受。
- local-first 核心体验仍依赖 Google Fonts 和外部 Quote 请求；离线测试允许请求被阻断不等于移除了隐私、性能和稳定性成本。
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

## 6. 推荐迁移顺序

1. 冻结新模块、新实体和新导航入口；已完成核心 AppShell 收敛，继续保持旧入口兼容但不默认展示。
2. 完成 Case→Matter、Task→Action、inbox→Capture 的迁移、只读化和回滚策略，禁止旧模型新增写入。
3. 收口共享协作 Gateway、历史回放与部分兼容查询的异步边界；本轮已完成核心共享路径。
4. 建立统一保存结果：本地已保存、同步等待、冲突和失败，并覆盖核心页面的失败恢复；本轮已完成首个 UI 切片。
5. 建立真实浏览器端闭环测试：刷新、离线、冲突、失败恢复、导出再导入；随后进行移动端、键盘和读屏人工验收。
6. 完成品牌与存储键兼容读取的长期迁移策略，最后再删除旧入口或旧兼容实现。

## 7. 测试事实的正确表述

截至本轮结束，已有自动化结果记录为 48 个 Vitest 文件、241 个测试通过，Node 验证 15/15、E2E 22/22，并有浏览器 IndexedDB、UI、性能和 PWA 验证记录。这些结果证明已覆盖的代码路径没有检测到回归；它们不证明：

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
