# Calmy 文档整理审计

> 日期：2026-10-05 · 性质：一次性审计报告与处置建议（不定义产品方向）
> 范围：仓库内全部文档、截图证据、以及文档与代码的一致性和未完成项
> 核实方式：通读文档 + 静态读代码 + 实测两条验证命令。凡未实测的标注「无法核实」。

---

## 0. 裁决结果（2026-10-05）

本报告提出三项待裁决事项，产品负责人当日裁决如下，已写入 `PRODUCT_DECISIONS_2026-08-19.md` 的 **D-021**：

| 事项 | 裁决 | 对本文的影响 |
|---|---|---|
| 零知识加密（ADR-001）在雏形阶段是否保留 | **保留**。后端业务逻辑改动不得越过「服务端无业务语义 / 无服务端语义检索 / 各模块不各自建 ACL / 管理员不可解密」边界 | §1.3 ③-1 与 §4.3 关闭；§5.4 第 5 条（`crypto.ts` 遗留明文路径）仍是需要处理的冲突，但**不是**放宽边界的理由 |
| 多人模型 §1–45 是否仍是验收基准 | **仍是基准，但排在雏形范围之后**；「不得缩减原文任何能力」不作当前完成门，Phase B 与 ADR-002 不启动 | §4.1 第 1、7 条维持「停止投入」结论；§4.3 关闭 |
| 审计时 142 个未提交改动 | 未裁决 | §7 批 3 仍然待办；整理后未重新划分用户工作区改动，当前状态仍应以 `git status --short` 为准 |

初始执行范围是批 1；在用户确认“先对齐入口、状态和待办，暂不移动/删除”后，本轮又完成了**低风险的入口收敛**：新增 `docs/CURRENT/README.md` 与 01–04 摘要页，更新 `docs/README.md`、根目录 `README.md`、`docs/PROJECT_STRUCTURE.md`、产品文档包入口和 `OPEN_WORK.md` 的优先级说明。批量归档、截图台账外移与代码修复（`open-format.ts` 类型守卫、`vault-sync.ts:189`、`CompatibilityPlaceholderPage.vue` 文案）仍未执行。

---

## 1. 结论摘要

### 1.1 文档乱在哪里

不是文档太少，而是**三代方向叠加、旧文档没有退场**：

| 现象 | 实测 |
|---|---|
| 正文体量 | 108 份 Markdown，约 1.76 MB（不含截图） |
| 截图证据 | `docs/superpowers/migrations/captures/` 2363 个文件 / 119 MB |
| UI 规格 | 同一件事重设计 4 轮，4 套视觉 CSS 同时被 `src/main.ts` 加载 |
| 壳层 | 2 套壳并存（`ReferenceAppShell` + `LegacyAppShell`），且命名与实际权重相反 |
| 导航 | 2 套并行体系（`appPageRegistry` 与硬编码 `stageNavigation`） |
| 身份/加密/分享 | 拆成 4 期、4 份设计 + 4 份计划，跨用户分享 **0 行代码** |
| 迁移编号 | `0002` 被 system-administration 与 Phase B 两份计划同时占用 |
| 登记册 | 有 60+ 条登记，但 3 份根目录正式文档**未登记** |

### 1.2 现在真实的状态（我实测的）

| 项目 | 结果 |
|---|---|
| `npx vitest run` | **128 文件 / 831 项 → 816 通过、15 失败** |
| 失败位置 | 全部在最前沿的前端：`vue-shell-parity.test.ts`（8 项）、`vue-stage-shell.test.ts`（7 项） |
| `npx vue-tsc --noEmit` | **1 个错误**：`src/core/content/vault-sync.ts(189,43)` |
| `npm run build` | **红**。脚本首步是 `vue-tsc --noEmit`，因此构建在第一步就断 |
| Git 工作区 | `main` 分支，HEAD `fa4ea52`，**142 个文件已改未提交（+4905/−1270）**，59 个未跟踪文件 |

> 文档里写的「126 文件 / 801 项通过」「`npm run build` 通过」都已过期，且 `DESIGN.md` 自己承认的 `vault-sync.ts:189` 类型错误仍在，这意味着 **`npm run build` 一直是红的**——之前记录的「构建通过」实际只跑了 `vite build`，绕过了类型门。

### 1.3 直接回答：未实现的东西里，哪些不必做

按「先做雏形、方向未定、前后端都允许大改」这个前提，未实现项可以分三档：

**① 建议停止投入（雏形阶段不需要，放弃不产生返工）**

| 未实现项 | 为什么不必做 |
|---|---|
| 跨用户分享全链路（ADR-002 密钥封套 + Phase B + Stage E） | **0 行代码可维护**，是纯加法能力。搁置零债务，恢复成本没有增加；现在做等于把最贵的密码学押在未定的方向 |
| 系统管理深化（RBAC 角色/权限/审计/会话/登录风控） | 代码已够用（5 角色 16 权限已落库）。雏形阶段没有第二个用户，深化它只是维护成本 |
| Portable Vault 阶段 3–6（真实目录往返、增量写入、冲突审阅 UI、附件对象存储/R2） | 你已经有一个可用的 Open Format v3 + JSON 备份导出。雏形要的是「数据能拿出来」，这个已经满足 |
| Obsidian Companion Bridge 真实联调 | 插件自述「尚未连接 bridge」，协议只在测试里跑。它不阻塞任何核心体验 |
| 飞书线上写回、多工作台、OAuth、跨设备设置 | 依赖你部署和真实 Base 权限。雏形阶段本地路径更短 |
| 多人邀请/成员管理/可见范围选择 UI + §1–45 全面达标 | 这是当前最大的一块「未实现」。它假设了「方向已定」——而你说方向还没定 |
| OW-08 逐模块离线/同步/错误验收、OW-09 品牌键名长期迁移、OW-10 8–12 人 2–4 周试点、OW-12 AI 理解层、OW-11 Flow 完整实现 | 都是「方向确定后」才值得投入的收口工作 |
| 335 组逐像素审计、119 MB 截图/几何台账 | 用户已确认接受外观残差。台账已无执行价值，只占仓库体积 |
| `Obsidian_calmy` 里的 LIMS/报告体系/可配置平台/软件之外的产品设计语料 | 与当前代码零交叉（grep 实测在 `docs/` 下几乎 0 命中），是理念素材，不是待办 |

**② 必须保留——但它们不是「功能」，是「改了会返工」的边界**

| 边界 | 为什么雏形阶段也要留 |
|---|---|
| 数据契约：IndexedDB/Repository + 本地 `b_*` 集合 + 稳定 ID | 大改前端可以，但换掉 ID/集合语义会让已有本地数据作废 |
| Open Format 版本兼容（读 v1/v2/v3，写出 v3） | 这是「用户数据能拿出来」的唯一保证；改数据模型必须同步这里的往返 |
| User 身份与归属（Phase A 已落地） | 已写进 `backend/migrations/0001`，且旧同步端点在有 User 后会 410。删它比留它贵 |
| 备份白名单（`BACKUP_ALLOWED_KEYS`） | 新增集合不入名单会被**静默排除**在备份外。这是无声的数据丢失风险 |
| Vue 3 + Pinia + Element Plus 底座 | React 已删除，这是既成事实，不是待退出层 |

**③ 需要你先裁决的三件事（决定了后面所有整理和开发）**

1. **零知识加密要不要在雏形阶段保留？**
   ADR-001（Accepted）明确禁止：服务端存业务语义列、服务端筛选/检索、各模块自建 ACL、管理员可解密、密码充当内容密钥。这直接限制你「大改后端业务逻辑」的空间——现在的后端只能做「身份 + 不透明密文 + 授权边」。
   如果要自由重做后端逻辑，就要先把 ADR-001 降级或改写成「雏形阶段例外」，并接受改 D1 schema。**这是最有杠杆的一个决定。**
2. **多人与共享模型是「方向」还是「已冻结范围」？**
   `Calmy-多人场景-模块关系与数据共享核心设计方案.md`（2450 行 §1–45）被 5 份文档当作验收基准，`CALMY_SOCIAL_MODEL_TRACEABILITY_2026-10-01.md` 的完成规则是「不得缩减原文任何能力」。这与「方向未定、可大改」直接冲突，需要你明确：是继续当基准，还是降为「一个可选方向」。
3. **当前 142 个未提交改动先提交还是先回退？**
   任何文档归档动作都不该和这批改动混在一起。

---

## 2. 文档全景与四类归档

| 类别 | 份数 | 该怎么处置 |
|---|---|---|
| **A. 当前权威（必须留，且必须看一眼）** | 6 | 保留并精简；这是唯一入口 |
| **B. 硬约束（保留，改代码前对照）** | 4 | 保留；建议合成一份 `BOUNDARIES` |
| **C. 实现证据 / 历史快照（保留但不得作为方向）** | ~20 | 加「已过期」眉批或移入 archive |
| **D. 已死 / 重复 / 一次性（可归档，不必再看）** | ~70 | 移入 `docs/archive/` 或删除 |
| **E. 截图与几何台账** | 2363 文件 / 119 MB | 移出仓库或压缩留档 |

### A. 当前权威（6 份）

| 文件 | 说明 |
|---|---|
| `README.md` | 仓库入口与产品边界摘要 |
| `PRODUCT.md` | 产品定义/用户/定位/品牌承诺。**未在登记册中** |
| `DESIGN.md` | 「留白 Reference Frontend」当前视觉方向。**未在登记册中** |
| `docs/README.md` | 全部文档的唯一导航入口 |
| `docs/product/CALMY_PRODUCT_DESIGN_2026-09-19.md` | 当前产品本体（人与世界之间的反思层） |
| `docs/product/PRODUCT_DECISIONS_2026-08-19.md` | 决策记录（D-001…D-020，废弃方向） |
| `docs/product/OPEN_WORK.md` | 唯一活跃待办（但已膨胀到 70 KB，需要砍到雏形范围） |
| `docs/product/DOCUMENT_REGISTER.md` | 文档登记与冲突处理 |

> 注：A 类实际 8 份。`DOCUMENT_REGISTER.md` 把前 6 份中的 4 份列为当前权威，另 2 份（`PRODUCT.md`、`DESIGN.md`）漏登记。

### B. 硬约束（4 份）

| 文件 | 约束 |
|---|---|
| `docs/adr/ADR-001-content-zero-knowledge-with-visible-access-metadata.md` | Accepted。零知识三层边界，已固化进 D1 schema |
| `docs/superpowers/specs/2026-09-29-calmy-user-identity-and-product-access-design.md` | Accepted。User 生命周期、归属、授权、密钥分层 |
| `docs/superpowers/specs/2026-09-30-calmy-ow23-openformat-v3-diary-capture-design.md` | Accepted 且已实现。Open Format v3 兼容边界 |
| `docs/superpowers/specs/2026-09-24-calmy-vue-element-plus-migration-design.md` | 已完成。Vue 是唯一生产入口 |

### E. 截图台账

`docs/superpowers/migrations/captures/` = 2363 文件 / 119 MB 的 PNG + geometry.json。用户已在 2026-09-28 确认「纯外观差异接受」，原始 335 组目标已作废。建议移出仓库（或转成单个压缩包 + 一份结论摘要）。

---

## 3. 已实现 / 未实现总表

状态判定以代码与实测为准；文档自述仅作参考。

| 能力域 | 真实状态 | 关键证据 | 备注 |
|---|---|---|---|
| 今日 Today | ✅ 已实现 | `src/vue/pages/TodayPage.vue` + `src/application/use-cases/open-today.ts` | 四入口是唯一 primary nav |
| 记录 Capture | ✅ 已实现 | `CapturePage.vue` + `capture-text.ts` / `decide-capture.ts` | 五种 Attention Gate 动作已接入 |
| 处境 Matter | ✅ 已实现 | `MattersPage.vue` / `MatterDetailPage.vue` + `matterAsyncRepository` | |
| 回顾 Review | ✅ 已实现 | `ReviewPage.vue` + `complete-review.ts` | 7/30/90 天切换真实过滤 |
| 未来回望 Future | ✅ 已实现（原型），未验收 | `FuturePage.vue` + `src/domain/future-lookback/` | 真实用户验证未做 |
| 任务/看板/番茄 | ✅ 已实现 | `TasksPage` / `TaskBoardPage` / `PomoPage` → `actionAsyncRepository` | |
| 习惯 Habits | ⚠️ 部分 | `HabitsPage.vue` 仍用旧集合 `b_habits` | 未升格为 Core Entity |
| 现实模型 Reality/Scene | ✅ 已实现（领域层） | `src/domain/reality/`、`RealityScenesPage.vue`、`RealityContextPage.vue` | `ScenePage.vue` 是主题皮肤选择器，与 Reality Scene 无关（易混） |
| 图谱 Graph | ✅ 已实现 | `src/domain/graph/query.ts` 真实遍历关系与引用边 | 含 `placeholder:true` 未解析引用节点 |
| 主数据 MasterData | ⚠️ 部分 | `MasterDataPage.vue` 操作 `resource`/`dictionary_option` | 字典只重命名/排序固定 key |
| 财务 Finance | ✅ 已实现 | `FinancePage.vue` + ownership + case 关联 | |
| 日历 / 日记 / 动态 | ✅ 已实现 | `CalendarPage` / `DiaryPage` / `PostsPage` | |
| 身份与账号 | ✅ 已实现（代码层） | `backend/src/routes/{auth,users}.js` + `0001_*.sql` + `UserManagementPanel.vue` | 生产是否已 cutover **无法核实** |
| 加密与密钥 | ✅ 已实现 | `src/core/vault-keys.ts`、`backend/src/routes/vault.js` | 服务端只见不透明 ID + 密文 |
| Open Format / Vault | ⚠️ 部分 | `open-format.ts` 已 v3、`vault-sync.ts` | 未覆盖 Suggestion/Finance 交易；真实目录往返未验收 |
| 云同步 | ✅ 已实现但双协议互斥 | 新 `entity-sync.ts`+`vault.js`；旧 `sync.ts`+`sync.js` | 有 User 后旧端点全部 410 |
| 备份 / 导出 | ✅ 已实现（白名单式） | `src/core/backup.ts` | 明文 JSON 导出与加密导出两条路径并存 |
| 系统管理 | ✅ 已实现（代码层） | `0002_*.sql` + `system-admin.js` + `SystemAdminPage.vue` | 文档仍是 Draft；未部署 |
| Obsidian Vault 适配 | ✅ 已实现 | `obsidian-adapter.ts` / `vault-sync.ts` | |
| Obsidian Companion Bridge | ❌ 未实现（仅协议+单测） | 无生产 transport；插件自述未连接 | |
| 飞书适配 | ✅ 已实现（集成代码） | `backend/src/lib/feishu.js` 真实调 `open.feishu.cn` | 真实租户写回 **无法核实** |
| PWA / 离线 | ⚠️ 外壳有，**离线不成立** | 见 §5.4 第 2 条 | 「本地优先 · 离线可用」是错误文案 |
| 多人与共享 | ⚠️ 单账号内权限已实现；跨账号未实现 | `src/domain/social/collaboration.ts`（563 行，客户端） | 服务端无共享表、无授权端点 |
| 跨用户密钥分享 | ❌ 未实现 | 0 行代码；无 HPKE 依赖；无 `0002_entity_shares.sql` | ADR-002 仍 Proposed，未指定独立审查人 |

---

## 4. 未实现项 → 雏形阶段取舍（完整版）

### 4.1 建议停止投入（10 项）

1. **ADR-002 密钥封套 + Phase B 单 Entity 分享 + Stage E**：5 份文档 + 4 份计划 + 0 行代码。恢复入口和攻击面清单（CR-SR-001…006）原样保留即可。
2. **系统管理深化**：代码已完整，文档标 Draft。只需把文档状态收敛为 Accepted，不再加功能。
3. **Portable Vault 阶段 3–6**：保留 v3 导出/导入与 JSON 备份即可；真实用户目录往返、增量写入、附件对象存储（R2 完全未落地）推迟。
4. **Obsidian Companion Bridge 联调**：无生产 transport，不阻塞任何核心体验。
5. **飞书线上写回 / 多工作台 / OAuth**：需要部署与真实 Base 权限，雏形不值得。
6. **多人邀请/成员/可见范围 UI**：假设了方向已定。
7. **`CALMY_SOCIAL_MODEL_TRACEABILITY_2026-10-01.md` 的「§1–45 全面达标」完成规则**：与「方向未定、可大改」正面冲突，建议改写成「已实现的模型层保留，其余按需推进」。
8. **OW-08 / OW-09 / OW-10 / OW-11 / OW-12**：都是方向确定后的收口工作（逐模块验收、品牌键名迁移、8–12 人试点、Flow 完整实现、AI 理解层深化）。
9. **335 组逐像素审计 + 119 MB 台账**：用户已接受外观残差，台账已无执行价值。
10. **`Obsidian_calmy` 的语料模块（报告体系/LIMS/可配置平台/软件之外）**：理念素材，与代码零交叉。

### 4.2 必须保留的边界（5 项）

见 §1.3 的 ② 表。核心一句：**换 UI 随便换，换数据语义和 ID 要付迁移代价。**

### 4.3 需要裁决的三件事

见 §1.3 的 ③。其中第 1 条（零知识加密在雏形阶段是否保留）影响最大。

---

## 5. 必须修的冲突清单

### 5.1 僵尸文档（描述已不存在的代码）

| 文件 | 僵尸表现 |
|---|---|
| `docs/operations/HANDOFF_2026-08-22.md` | 第 20 行仍称「生产入口是 `index.html → src/react/main.tsx`」。**`src/react` 目录已不存在** |
| `docs/implementation/IMPLEMENTATION_BASELINE_2026-08-19.md` | §15–§19 全篇以 React 为主语（第 484/485/499/501 行），且仍被 README 当作实现证据指向 |
| `docs/product/DOCUMENT_REGISTER.md`（正文段落） | 第 132–133 行描述 React 入口，与同文件第 5 行的「OW-06 已完成」自相矛盾 |
| `docs/product/REACT_MIGRATION_2026-08-23.md` | 自述已被 Vue 迁移取代，却留在 `docs/product/` 顶层 |
| `docs/product/ENGINEERING_REVIEW_2026-08-22.md` | 登记为「当前权威」，但第 133/135/146/159 行证据全是 `src/react/*` |
| `docs/product/DOCUMENT_AUDIT_2026-09-19.md` | 第 15 行「所有 React 页面共用一组视觉基础」与 Vue 终态不符 |
| `docs/history/BERYL_DESIGN_README.md` | 78 KB / 1046 行，维护约定指向已不存在的 v1 单文件 `index.html` |
| `Obsidian_calmy/README.md` | 第 4 行仍把已降级的 `CALMY_UNIFIED_PRODUCT_DESIGN_2026-08-29.md` 当跨仓第一权威 |

### 5.2 未登记的正式文档

| 文件 | 问题 |
|---|---|
| `Calmy-多人场景-模块关系与数据共享核心设计方案.md`（根目录 29 KB / 2450 行） | 被 5 份文档当作验收基准，**却不在登记册中** |
| `PRODUCT.md` | 产品定义，未登记 |
| `DESIGN.md` | 当前视觉方向，未登记 |
| `docs/superpowers/plans/2026-10-04-reference-stage-frontend.md` | 最新前端方向，未登记 |
| `docs/product/OW-21_WORK_SCENARIO_PILOT_2026-09-20.md` | 未登记 |

### 5.3 文档互相矛盾

| 矛盾 | 双方 |
|---|---|
| 测试规模 | 98 文件/555 项 ↔ 117 文件/61 失败 ↔ 126 文件/801 项 ↔ **实测 128 文件/831 项** |
| OW-06 状态 | `ENGINEERING_REVIEW` §20 称已完成 ↔ `OPEN_WORK` 仍列在 P1 未完成段 |
| Vue 是「唯一入口」还是「待退出兼容层」 | `2026-09-24` 迁移设计 ↔ `PRODUCT.md`/旧 `OPEN_WORK` 段落 |
| 桌面导航结构 | `dual-navigation`（轨道 68px + 二级侧栏）↔ 同日 `tactile`（单一左栏 232px + 右侧情境轨道）；代码是**两者混合**，合并裁决无文档记录 |
| Today 首屏 | `tactile` §6（主行动第一）↔ `today-record-first`（记录框第一，主行动收进「其他」）；代码按后者 |
| 迁移编号 | `0002_system_administration.sql`（存在）↔ Phase B 计划预留 `0002_entity_shares.sql` |

### 5.4 代码里的混乱（与文档同源，一并修）

1. **`npm run build` 一直是红的**：`vue-tsc --noEmit` 卡在 `src/core/content/vault-sync.ts(189,43)`，15 个测试失败全部在最前沿的 Stage 前端。
2. **「本地优先 · 离线可用」是错的说法**：`src/core/storage.ts` 的 `lsGet` 在无活动账号时返回 `null`，会话只写 `sessionStorage`（`src/core/auth.ts:62`），因此**浏览器重启或新标签页后未登录读不到任何本地数据**；而 `ReferenceAppShell.vue:27` 仍常驻展示该文案。
3. **一整层不可达旧 UI 代码**：`src/views/` 18 个文件中 17 个不在生产路由图；`src/components/modules/*`（10 个）只被孤立的 `ModuleView.vue` 引用。它们同时是同步 Reality 查询的最大存量。
4. **`CompatibilityPlaceholderPage.vue:4` 仍对用户显示**「今天、记录、处境、回顾和设置已由 React 接管」——React 已不存在，且该页仍在真实使用。
5. **两条加密路径并存**：`src/core/vault-keys.ts`（零知识）与 `src/core/crypto.ts`（PBKDF2 + 同步密码），后者是 ADR-001 明令否定的模式，但仍可从 `LegacyServerMigrationPanel.vue` 到达。**大改数据模型时最容易撞到的暗礁。**
6. **双壳层命名与实际权重相反**：`AppShell.vue` 按 `stageNavigation`（仅 6 条路由）在 `ReferenceAppShell` / `LegacyAppShell` 间切换，因此「Legacy」壳层其实是绝大多数页面的实际壳层。
7. **四套视觉 CSS 同时加载**：`src/main.ts` 依次 import `app.css` → `product-ui.css` → `ui-refresh.css`(24 KB) → `tactile-ui.css`(113 KB) → `reference-stage.css`(47 KB) → `reference-native.css`(50 KB)。`src/` 下 14 个 CSS 共 342 KB。
8. **品牌残留**：`package.json` 仍叫 `beryl-v2`；`beryl_device_id`、`beryl-db`、`beryl-cache-v2`、`service:'beryl-api'` 仍在用。
9. **备份静默丢数据的风险**：`src/core/backup.ts` 的 `BACKUP_ALLOWED_KEYS` 是显式白名单，新增集合不登记就会被导出**静默排除**。

---

## 6. 建议的目标文档结构

当前 108 份摊在一个层级里，任何人和任何 AI 都无法判断哪份有效。建议收敛成「一份入口 + 一个小核心 + 一个大归档」：

```text
README.md                      ← 仓库入口（保留，指向 docs/README.md）
PRODUCT.md                     ← 产品定义（保留并登记）
DESIGN.md                      ← 当前视觉方向（保留并登记）

docs/
  README.md                    ← 唯一导航；明确「只有 CURRENT 里的 5 份有约束力」
  CURRENT/
    01-product.md              ← 由 CALMY_PRODUCT_DESIGN_2026-09-19.md 更名
    02-decisions.md            ← 由 PRODUCT_DECISIONS_2026-08-19.md 更名
    03-scope-and-backlog.md    ← 由 OPEN_WORK.md 砍到雏形范围后更名
    04-implementation-facts.md ← 重写；现有 IMPLEMENTATION_BASELINE 是 React 时代的
    05-boundaries.md           ← 新写：数据契约 / OpenFormat / 身份归属 / 零知识边界（4 份硬约束的摘要）
  ARCHIVE/                     ← 其余全部，只读，不再维护
    product-legacy/            ← 08-22 三份旧设计、REVIEW_MEETING、ROADMAP、REACT_MIGRATION
    ui-rounds/                 ← 4 轮 UI 规格与计划
    social-model/              ← 多人场景方案 + §1–45 追踪矩阵 + 4 份分享/身份计划
    implementation/            ← 旧实现档案、HANDOFF、平行台账
    history/                   ← Beryl 历史（保留原样）
    evidence/                  ← 截图与几何台账（2363 文件 / 119 MB，建议直接移出仓库）
  adr/                         ← ADR-001 保留；ADR-002 连同 security/ 一并标注「Proposed，暂停」
  operations/                  ← 只留仍在用的运行说明（系统管理、身份切换）
```

`docs/superpowers/`（31 份 spec+plan+handoff+ledger）建议整体进归档：它是「AI 协作过程产物」，不是产品文档。

---

## 7. 执行计划（分三批）

### 批 1 — 低风险，可以立刻做（不改语义、不移动文件）

1. 新增本审计报告（已完成）。
2. 修 `DOCUMENT_REGISTER.md`：补登记 5 份游离文档；把 8 份僵尸文档的状态改为「已过期（描述 React 时代，勿据此判断当前实现）」。
3. 给 8 份僵尸文档各加一行眉批：`> ⚠️ 已过期：本文描述的生产前端为 React，该代码已不存在。当前事实见 docs/CURRENT/。`
4. 修 `CompatibilityPlaceholderPage.vue` 的错误文案（用户可见）。
5. 修 `vault-sync.ts:189` 的类型错误，让 `npm run build` 转绿。

### 批 2 — 需你确认（会移动文件，靠 git 可回滚）

6. 建 `docs/ARCHIVE/`，`git mv` 约 40 份过期文档进去（保留 git 历史）。
7. 把 `captures/` 移出仓库（或打成一个压缩包留档），并把 `docs/product/assets/ui-baseline-2026-09-21/`（64 张 PNG / 12.8 MB）一并处理。
8. ~~按 §6 建立 `docs/CURRENT/`，把 4 份硬约束摘要成 `05-boundaries.md`。~~ **已完成低风险版本**：建立入口、产品/决策/范围/实现状态摘要和硬约束页；原始专题文件仍保留原位。
9. ~~把 `OPEN_WORK.md` 从 70 KB 砍到雏形范围。~~ **已改为分层入口**：`CURRENT/03-prototype-scope-and-backlog.md` 管当前优先级，`OPEN_WORK.md` 保留完整工程待办和历史记录，暂不删除或移动条目。

### 批 3 — 需你先决策（前两批的前置）

10. **先提交或回退那 142 个未提交改动**——否则整理动作会和它们混在一个 diff 里，无法审查。
11. 裁决 §1.3 的三件事：零知识加密是否保留、多人模型是否仍是基准、Stage 前端 15 个失败测试是修还是回退。

---

## 附录 A：全量文档处置清单（108 份）

图例：**留** = 保留在入口；**留档** = 保留但移入 archive；**删** = 建议删除；**补登记** = 保留 + 写入登记册。

### 根目录（4）

| 文件 | 处置 | 理由 |
|---|---|---|
| `README.md` | 留 | 仓库入口 |
| `PRODUCT.md` | 补登记 | 产品定义，与当前实现一致 |
| `DESIGN.md` | 补登记 | 当前视觉方向，代码已落地 |
| `Calmy-多人场景-模块关系与数据共享核心设计方案.md` | 补登记 + 待裁决 | 5 份文档的基准，2450 行 |

### docs/（2）

| 文件 | 处置 | 理由 |
|---|---|---|
| `README.md` | 留 + 重写 | 导航入口需精简 |
| `PROJECT_STRUCTURE.md` | 留 | 代码入口与文件放置规则，仍准确 |

### docs/adr/（2）

| 文件 | 处置 | 理由 |
|---|---|---|
| `ADR-001-...zero-knowledge...md` | 留 | Accepted 硬约束 |
| `ADR-002-recipient-key-envelope-protocol.md` | 留档 | Proposed，未过审查门槛，0 实现 |

### docs/security/（3）

| 文件 | 处置 | 理由 |
|---|---|---|
| `ADR-002_SELF_REVIEW_2026-09-30.md` | 留档 | 作者自审，明示不能替代独立审查；CR-SR-002 是重要事实 |
| `ADR-002_INDEPENDENT_REVIEW_TEMPLATE.md` | 留档 | 空白模板，恢复方向时复用 |
| `CALMY_PHASE_B_CRYPTO_REVIEW_REQUEST.md` | 留档 | 审查委托书，攻击面清单有价值 |

### docs/implementation/（2）

| 文件 | 处置 | 理由 |
|---|---|---|
| `IMPLEMENTATION_BASELINE_2026-08-19.md` | 留档 + 眉批 | §15–§19 描述 React，已失真 |
| `README.md` | 留档 | 目录说明 |

### docs/operations/（4）

| 文件 | 处置 | 理由 |
|---|---|---|
| `calmy-system-administration.md` | 留 | 仍在用的运行说明 |
| `calmy-user-identity-cutover.md` | 留 | 部署窗口仍在待办 |
| `HANDOFF_2026-08-22.md` | 留档 + 眉批 | 生产入口描述错误 |
| `README.md` | 留档 | 目录说明 |

### docs/product/（19）

| 文件 | 处置 | 理由 |
|---|---|---|
| `CALMY_PRODUCT_DESIGN_2026-09-19.md` | 留（CURRENT/01） | 当前产品本体 |
| `PRODUCT_DECISIONS_2026-08-19.md` | 留（CURRENT/02） | 决策记录 |
| `OPEN_WORK.md` | 留 + 大砍（CURRENT/03） | 70 KB，混入大量已完成/非雏形项 |
| `DOCUMENT_REGISTER.md` | 留 + 修 | 登记册自身含矛盾段落 |
| `CALMY_UNIFIED_PRODUCT_DESIGN_2026-08-29.md` | 留档 | 30 KB，迁移参考，已被 D-018 降级 |
| `MASTER_DATA_AND_ENTITY_REFERENCES_2026-09-24.md` | 留档 | D-019 支撑，功能已部分实现 |
| `CALMY_OPEN_DATA_AND_PORTABLE_VAULT_2026-09-24.md` | 留档 | 28 KB，规划提案，阶段 3–6 建议停 |
| `CALMY_SOCIAL_MODEL_TRACEABILITY_2026-10-01.md` | 留档 + 改写完成规则 | 41 KB，与「方向未定」冲突 |
| `ENGINEERING_REVIEW_2026-08-22.md` | 留档 + 眉批 | 被登记为权威但证据是 React |
| `OW-21_WORK_SCENARIO_PILOT_2026-09-20.md` | 补登记 | OW-21 的试点设计，是当前真方向 |
| `FEISHU_LIFE_WORKSPACE_PLAN_2026-09-19.md` | 留档 | D-014 proposed，依赖部署 |
| `FEISHU_OFFICIAL_CAPABILITY_CHECKLIST_2026-09-19.md` | 留档 | D-016 accepted，能力清单 |
| `DOCUMENT_AUDIT_2026-09-19.md` | 留档 | 快照，含 React 陈述 |
| `REACT_MIGRATION_2026-08-23.md` | 留档 | React 时代记录 |
| `REVIEW_MEETING_2026-08-22.md` | 留档 | 已合并进统一总稿 |
| `ROADMAP_AND_ACCEPTANCE_2026-08-22.md` | 留档 | 旧路线图，与 OPEN_WORK 重叠 |
| `PRODUCT_REDESIGN_2026-08-22.md` | 留档 | 已合并 |
| `UX_UI_REDESIGN_2026-08-22.md` | 留档 | 已合并 |
| `README.md` | 留 + 修 | 产品文档包导航，需同步新结构 |

### docs/product/reference/（10）

| 文件 | 处置 | 理由 |
|---|---|---|
| `README.md` | 留档 | 目录说明 |
| `Calmy_领域模型与状态机_2026-08-19.md` | 留档 | 与多人模型文档主题重叠 |
| `Calmy_领域命令与Repository契约_2026-08-19.md` | 留档 | 是否仍逐条对应当前代码**无法核实** |
| `Calmy_AI行为规则与开放数据同步协议_2026-08-19.md` | 留档 | D-010 仍有效，Open Format 已实现 |
| `Calmy_Obsidian_Vault_Adapter协议_2026-08-19.md` | 留 | 与 `obsidian-adapter.ts` 同源且在用 |
| `Calmy_Obsidian_Companion_Bridge协议_2026-08-19.md` | 留档 | OW-13 阻塞，无生产 transport |
| `Calmy_Feishu_数据适配与授权协议_2026-09-19.md` | 留档 | 与另两份飞书文档重叠 |
| `Calmy_MVP产品范围与不做清单_2026-08-19.md` | 留档 | 早于 D-018 |
| `Calmy_核心用户流程与界面规格_2026-08-19.md` | 留档 | 导航部分已被替代 |
| `Calmy_MVP验证与测试计划_2026-08-19.md` | 留档 | React 时期编写 |

### docs/product/source/（2）

| 文件 | 处置 | 理由 |
|---|---|---|
| `README.md` | 留 | 只读边界说明 |
| `ORIGINAL_PRODUCT_DESIGN_2026-08-18.docx`（73 KB） | 留 | 原始母本，只读 |

### docs/product/assets/（69 PNG / 12.8 MB）

| 项 | 处置 | 理由 |
|---|---|---|
| 顶层 5 张 Attention OS 概念板 | 留档 | 登记为「设计资产」，不代表当前实现 |
| `ui-baseline-2026-09-21/`（64 张） | 留档或移出 | 历史验收档案，已被 reference-native 取代 |

### docs/history/（4）

| 文件 | 处置 | 理由 |
|---|---|---|
| `README.md` | 留档 | 目录说明 |
| `BERYL_DESIGN_README.md`（78 KB） | 留档 | 指向已不存在的 v1 单文件形态 |
| `BERYL_DESIGN.md` | 留档 | |
| `BERYL_CODE_REVIEW.md` | 留档 | 未复核项不可视为当前缺陷 |

### docs/superpowers/（32）

| 目录/文件 | 处置 | 理由 |
|---|---|---|
| `specs/` 14 份 | 留档（其中 4 份是硬约束，已在 §2.B 单列） | 实现层描述因 Vue 迁移整体失效 |
| `plans/` 16 份 | 全部留档 | 过程产物；勾选状态已被证明不可信 |
| `handoffs/` 1 份 | 留档 | 指引的 React 路径全部失效 |
| `migrations/2026-09-24-vue-parity-ledger.md`（159 KB） | 留档，建议只保留末段结论 | 逐条像素差异已作废 |

### Obsidian_calmy/（约 20 份 + 3 脚本）

| 文件 | 处置 | 理由 |
|---|---|---|
| `Calmy_产品设计完整整理_2026-09-02.md`（118 KB） | 留 | 思想母本，只读用语料 |
| `00_总纲与治理/02_为解决问题而学习.md` | 留 | D-012 理念源 |
| `00_总纲与治理/01_身在网络活在现实.md` | 留档（原文） | 已并入统一总稿 |
| `01_报告体系/`、`02_LIMS与实验体系/`、`03_产品体验与简洁化/`、`04_可配置平台/`、`05_软件之外的产品设计/` | 留（只读语料） | grep 实测与 `docs/` 几乎零交叉 |
| `90_同步与变更/备份/`（2 份，158 KB） | 删 | 旧版总文档，同源重复 |
| `90_同步与变更/合并身在网络活在现实.ps1` | 删 | 一次性脚本，已完成使命 |
| `90_同步与变更/Calmy-文档同步.ps1` | **先别跑 Auto** | 见下方警告 |
| `Calmy_产品设计思维导图.md`、`README.md` | 留 + 勘误 | README 权威指针停在 2026-08-29 之前 |

> ⚠️ **Obsidian 同步工具的待爆状态**：`.同步状态.json` 记录的 `masterHash` 与当前总文档 SHA-256 不一致，而 11 个模块路径全部未变。按脚本 Auto 规则（总文档单边变化 → 总文档覆盖模块），**任何人跑一次 `-Mode Auto` 都会用滞后语义覆盖库内模块正文**。改这个库之前先跑 `-Mode Status` 人工决定方向。

### 其他（3）

| 文件 | 处置 | 理由 |
|---|---|---|
| `obsidian-plugin/README.md` | 留 | 外部组件说明，import 指向真实存在的模块 |
| `prototypes/README.md` | 留档 | 自述不属于生产，`csdiy-*` 与本项目关系**无法核实** |
| `_v1-backup/`（被 gitignore） | 留 | 不参与当前任务与进度判断 |

---

## 附录 B：无法核实清单（需要运行环境或人来确认）

1. **生产 Cloudflare 状态**：D1 迁移是否 apply、`CALMY_BOOTSTRAP_SECRET` 是否设置、首个管理员是否创建、线上是否 cutover。仅有 `backend/.wrangler/` 下的本地日志痕迹。
2. **飞书真实租户**：是否成功读过/写过真实 Base。`.dev.vars` 存在不等于调用成功。
3. **真实设备 / 读屏 / 大字号 / 系统缩放（OW-04）**：全部依赖人工验收。
4. **Portable Vault 在真实用户目录的往返**与浏览器 File System Access 授权恢复。
5. **Obsidian Companion Bridge 实机联调**：无生产 transport。
6. **Phase A 旧数据迁移的真实运行结果**。
7. **`prototypes/csdiy-*` 与 Calmy 的关系**。
8. **`docs/product/reference/` 两份契约文档与当前 Repository 代码的逐条一致性**。

---

## 附录 C：这次审计自身动了什么

- 新增本文件 `docs/DOCUMENT_CONSOLIDATION_2026-10-05.md` 与 `docs/CURRENT/` 入口/摘要页。
- 更新文档入口、登记册相关说明、产品文档包说明、`OPEN_WORK.md` 的优先级说明和项目文件架构说明；未移动或删除任何文件，未改前后端代码。
- 为得到真实基线，运行了 `npx vitest run`、`npx vue-tsc --noEmit`（只读源码，不产出构建物）。
