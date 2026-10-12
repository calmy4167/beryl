# 05 硬约束清单（改前后端之前先看这一页）

> 建立于 2026-10-05 · 用途：在「方向未定、前后端都可能大改」的阶段，划出**改了会返工或丢数据**的边界。
> 依据：`docs/adr/ADR-001`、`docs/superpowers/specs/2026-09-29-calmy-user-identity-and-product-access-design.md`、`docs/superpowers/specs/2026-09-30-calmy-ow23-openformat-v3-diary-capture-design.md`、`docs/product/PRODUCT_DECISIONS_2026-08-19.md` D-005 / D-021。
> 整理依据与证据：[Calmy 文档整理审计](../DOCUMENT_CONSOLIDATION_2026-10-05.md)。

## 一句话

**表现层、导航、页面结构、领域对象内部字段、View 组合——随便改。数据语义、稳定 ID、开放文件格式、账号归属——改之前先算迁移成本。**

---

## 1. 可以自由改

| 范围 | 说明 |
|---|---|
| 全部前端表现层 | CSS、主题、壳层、导航结构、页面布局、组件拆分。当前有 4 套视觉 CSS 与 2 套壳并存，收敛它们没有数据风险 |
| 路由与导航 | 保留旧 URL 可用即可（兼容重定向）；`appPageRegistry` 与硬编码 `stageNavigation` 的重复可合并 |
| 领域对象内部字段与语义 | 加密载荷内部、本地 Repository、索引、Migration、View 组合 |
| 控制面新增**不透明**列 | `opaque_id`、`version`、授权边、grant、审计元数据——方向与 ADR-001 一致 |
| 整页增删 | 未来回望、扩展模块页面等；方向变了可以直接丢掉 |

## 2. 不能破的（改了会返工）

| 边界 | 具体要求 | 撞线后果 |
|---|---|---|
| 稳定 ID 与集合语义 | 本地 `b_*` 集合键名与实体稳定 ID 不得直接改名；`OW-09` 的兼容读取与可验证回滚未完成前保留旧键 | 旧用户本地数据作废 |
| Open Format 版本兼容 | 写出 v3，必须继续**读 v1/v2/v3**；`format_version`、`_calmy/manifest.json`、`(calmy_type, calmy_id)` 身份与 tombstone 规则不得破坏 | 用户已导出的文件无法回导 |
| User 身份与归属 | 新建私人数据默认归当前 User 且 Private；`Ownership/Scope/Permission` 默认拒绝；隐私标签 ≠ 授权 | `0001` 迁移与旧端点 410 逻辑失效 |
| 备份白名单 | `src/core/backup.ts` 的 `BACKUP_ALLOWED_KEYS` 是显式清单，**新增集合不入名单会被静默排除在备份外** | 无声数据丢失 |
| 零知识边界（ADR-001，D-021 重申） | 服务端不存业务语义列／不做语义检索筛选／各模块不各自建 ACL／管理员不可解密／密码不得充当内容密钥 | 违反 Accepted ADR；要越界必须另开 ADR |

## 3. 零知识边界的具体撞线清单（改后端前逐条对照）

1. 给 D1 加业务语义列（title / type / domain / owner / subject 或用于筛选分组的字段）→ 撞「三层数据边界」。
2. 各模块自建 ACL 表（`matter_shares`、`diary_permissions`…）→ 撞「授权必须物化为统一的不透明授权边」。
3. 把授权判定搬到服务端做语义解析（服务端理解 Person/Thing/Scene/Space 谓词）→ 撞双边界。
4. 引入服务端全文检索、筛选、排序、聚合 → 撞「Search / Graph / 推荐」。
5. 让 AI 默认读取整个 Vault 或由服务端组 Context → 撞「AI 边界」。
6. 给管理员／客服加解密或代取能力 → 撞「身份与密钥」+「管理员与产品边界」。
7. 复用登录密码／同步密码派生内容密钥 → 撞「身份与密钥」。
8. 改动密钥模型本身（新增设备、换机、恢复、轮换、公钥真实性）→ 必须先过安全设计门槛，不能边改边试。
9. 把 R2 加密数据面拉进雏形 → 属未实现（当前 `wrangler.toml` 只有 D1 绑定），引入成本远超一般模型改动。
10. 写入路径改成「服务端成功才算保存成功」→ 撞离线优先写入与「本地持久化状态 / 云端确认状态分开表达」。

## 4. 现存暗礁（与本次整理同时记录，尚未处理）

| 暗礁 | 位置 | 为什么危险 |
|---|---|---|
| 遗留明文加密路径 | `src/core/crypto.ts`（PBKDF2 + 同步密码），入口 `LegacyServerMigrationPanel.vue` | 这是 ADR-001 明令否定的模式，但**仍可从 UI 到达**。大改数据模型时最容易被忽略的冲突点 |
| 恢复封套不可轮换 | `backend/src/routes/vault.js:49-53`（`ON CONFLICT DO NOTHING` + 409） | 自审报告 CR-SR-002 判为 Blocker：任何密钥模型改动前必须先解决；目前 `docs/security/` 只有作者自审，**无独立审查** |
| 「本地优先 · 离线可用」是错的说法 | `ReferenceAppShell.vue:27`；根因 `src/core/storage.ts` 的 `lsGet` + `src/core/auth.ts:62` 的 `sessionStorage` 会话 | 浏览器重启或新标签页后未登录**读不到任何本地数据**。文案与事实相反 |
| 备份静默排除 | `src/core/backup.ts` | 新集合忘记登记就没有备份，且没有任何提示 |
| `npm run build` 一直是红的 | `src/core/content/vault-sync.ts:189`，根因 `open-format.ts` 的 `isRecord` 守卫不严谨 | 类型门失败意味着「构建通过」的记录都不成立 |
| 同一迁移编号被两份计划占用 | `0002_system_administration.sql`（存在）vs Phase B 预留的 `0002_entity_shares.sql` | 恢复 Phase B 时必须重新编号 |

## 5. 维护规则

- 新增硬约束（新 ADR 或 Accepted 决策）时更新本页，而不是散落到各规格里。
- 越界前先写 ADR，不要就地放宽既有 Accepted 决策。
- 本页只写「不能破什么」和「破了会怎样」，不写产品方向。
