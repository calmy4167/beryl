# 实现状态快照

> 静态代码盘点：2026-10-05。路径用于复核；本轮只整理文档，没有运行测试、构建、线上调用或真实设备验收。代码存在不等于生产部署、功能闭环或用户验证通过。

| 能力 | 状态 | 代码线索 | 边界 / 未确认项 |
|---|---|---|---|
| 生产前端 | 已实现：Vue 3 应用入口 | `src/main.ts`、`src/router/index.ts`、`src/vue/` | 当前工作区含大量前端新增/变更；本快照不等于视觉/可访问性验收 |
| Today、Capture、Matter、Review | 已实现：可用流程/页面 | `src/vue/pages/TodayPage.vue`、`CapturePage.vue`、`MattersPage.vue`、`ReviewPage.vue`、对应 `src/application/use-cases/` | 页面实现不证明该流程就是最终产品主线 |
| Future / 未来回望 | 部分实现：原型 | `src/vue/pages/FuturePage.vue`、`src/domain/future-lookback/` | 缺少真实用户验证和完整外部工具反馈闭环 |
| 任务、看板、番茄、日历、日记、动态等模块 | 部分实现至已实现，按模块不同 | `src/vue/pages/`、`src/domain/` | 不作为雏形阶段必须逐模块收口的证明；逐项记录见审计报告 §3 |
| Reality / Scene、Graph、Finance | 部分实现：已有领域模型和页面切片 | `src/domain/reality/`、`src/domain/graph/`、`src/domain/finance/`；对应 `src/vue/pages/` | 多人授权和全模型验收未完成；跨账号分享不由客户端模型代码证明 |
| 身份与账号 | 已实现：本地代码路径 | `backend/src/routes/auth.js`、`users.js`、`backend/migrations/`、`src/vue/pages/UserAdminPage.vue` | 生产部署、迁移应用及真实账号 cutover 未核实 |
| 加密实体同步 | 已实现：客户端密钥与后端密文路由 | `src/core/vault-keys.ts`、`src/core/entity-sync.ts`、`backend/src/routes/vault.js` | 云端实际运行状态未核实；ADR-001 约束必须保持 |
| 跨账号分享 / 邀请 / 密钥封套 | 未实现 | `backend/src/routes/` 当前没有分享授权路由；ADR-002 为 Proposed | 保持暂缓，独立密码学审查是后续前置条件 |
| Open Format / Vault | 部分实现 | `src/core/content/open-format.ts`、`vault-sync.ts`、`open-workspace.ts` | 写出 v3、读 v1/v2/v3，但实体覆盖与真实用户目录往返/权限恢复尚未完整验收 |
| 备份与恢复 | 部分实现：JSON 备份/加密导出路径存在 | `src/core/backup.ts` | 备份集合采用白名单；新增集合须登记。真实用户大型备份和所有资料类型覆盖仍须验证 |
| PWA / 离线 | 部分实现：Service Worker/缓存外壳存在 | `src/main.ts`、`public/sw.js`（若部署目录不同，以实际入口核对） | 不据此宣称“离线可用”；跨重启、未登录、真实网络中断流程需实测 |
| Obsidian Adapter | 已实现：格式/适配代码 | `src/core/content/obsidian-adapter.ts`（以实际路径为准） | 和 Companion Bridge 是两件事 |
| Obsidian Companion Bridge | 未实现：没有生产 transport | `obsidian-plugin/README.md`、`src/core/content/` | 现有协议或单测不等于已联调 |
| 飞书 | 部分实现：Worker 集成代码 | `backend/src/lib/feishu.js`、`backend/src/routes/feishu.js`、`src/vue/pages/FeishuPage.vue` | 真实租户读写、权限、线上部署未核实 |
| 系统管理 | 已实现：代码级页面/API | `backend/src/routes/system-admin.js`、`src/vue/pages/SystemAdminPage.vue` | 生产运行和进一步运营需求未核实；暂不扩建 |

## 验证记录的时效

《文档整理审计》§1.2 保存了其审计时的命令输出：128 个 Vitest 文件/831 项中 816 通过、15 失败，`vue-tsc` 有 1 个错误，构建未通过。该记录是审计快照，不是本次运行结果。它与 `OPEN_WORK.md` 中更早的 126 文件/801 项通过等记录属于不同日期，不能相互替代。若要确认当前状态，另开验证任务并记录新日期及完整命令输出。

## 分类原则

- 已实现：生产代码路径可定位；用户验证、部署和真实数据验收另列。
- 部分实现：代码存在但有明确覆盖/恢复/闭环缺口。
- 未实现：缺少生产实现，方案或测试不能算完成。
- 暂缓：优先级结论，不是代码状态。
