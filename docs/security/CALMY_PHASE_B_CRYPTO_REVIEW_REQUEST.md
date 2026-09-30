# Calmy Phase B 独立密码学审查委托

- **状态：** 待指定独立审查人；不是已完成的安全审查
- **日期：** 2026-09-30
- **审查对象：** Calmy Phase B 单 Entity 跨 User Content Key 封套协议
- **主要设计文件：** [ADR-001：零知识优先架构](../adr/ADR-001-content-zero-knowledge-with-visible-access-metadata.md)、[ADR-002 草案](../adr/ADR-002-recipient-key-envelope-protocol.md)、[User identity and product access design](../superpowers/specs/2026-09-29-calmy-user-identity-and-product-access-design.md) §4–§6、§9–§13、[Phase B implementation preflight](../superpowers/plans/2026-09-30-calmy-phase-b-collaboration-preflight.md)
- **审查结果模板：** [ADR-002 独立审查记录模板](ADR-002_INDEPENDENT_REVIEW_TEMPLATE.md)（空白模板，不表示审查已进行）
- **已有作者自审：** [ADR-002 技术自审报告](ADR-002_SELF_REVIEW_2026-09-30.md)；作者参与方案编写，故不能视为独立审查或替代本委托书所要求的独立报告。

## 审查目标

判断候选设计能否安全支持显式的单 Entity 分享、跨设备恢复和撤权轮换，并指出在真实用户数据分享前必须修复的问题。审查要独立于该方案的实现作者；内部自查、构建成功和单元测试不能替代该审查。

产品已确认首版分享能力目标支持矩阵：Windows 11 最新及前一主版本 Chrome、Edge；macOS 最新及前一主版本 Safari、Chrome；iOS 最新及前一主版本 Safari；Android 最新及前一主版本 Chrome。Firefox 不在首版分享能力范围。请评估候选协议与密钥存储/恢复流程能否覆盖该矩阵，并列出实际需要测试的稳定版版本号和设备组合；若要求缩小或调整支持范围，请给出理由和建议。

截至 2026-09-30 的初始版本快照与官方来源见[分享设计 §10](../superpowers/specs/2026-09-30-calmy-phase-b-single-entity-readonly-sharing-design.md#版本快照2026-09-30官方发布记录)：桌面 Chrome 154/153、Edge 154/153、Safari 26.6.1/18.6、iOS Safari 对应 iOS 26.6.2/18.7.10、Android Chrome 154/153。该快照只用于明确测试目标，不代表测试通过；请审查人刷新实际可用 build，并记录设备型号、操作系统 build 与完整浏览器版本。旧 Safari/iOS 设备可获得性需明确说明。

## 当前建议的威胁范围

本轮建议按 **B：首次分享和收件人公钥变化时进行带外安全码/QR 核验** 作为审查基线。请审查人可接受地证明或推翻该建议，并比较：

- **A：** 信任 Calmy 服务端首次提供的收件人公钥。目标仅是数据库静态泄漏时，服务器没有 Content Key；不防服务端主动替换首次分享公钥。
- **B：** 分享双方用独立可信渠道核验短码/QR；尝试防止首次联系时服务器向分享者提供攻击者公钥。需要核验失败时默认拒绝，并验证码的编码、上下文绑定和用户理解性。
- **C：** 对 User ID 与公钥映射使用密钥透明性、可验证的一致性证明和独立 witness/auditor。需评估运营主体、分叉视图检测、隐私元数据、恢复和第三方失效。

**审查人应明确回答：** Calmy “零知识优先”是否应包含对服务端主动替换首次收件人公钥的防护？若包含，选择 B、C 或等价方案；若不包含，明确记录服务端目录信任假设及产品可使用的准确隐私表述。

## 当前实现证据

- `src/core/vault-keys.ts` 使用 AES-GCM 封装 User Key 与 Entity Content Key；Device Key 是不可导出的 AES-GCM `CryptoKey`。
- 当前应用没有分享用公私钥对、经过认证的 User 公钥目录、跨 User Content Key 封套或接收方解包流程。
- 根 `package.json` 没有声明 HPKE 依赖；`vite.config.ts` 的 `es2020` 是语法目标。仓库没有既有正式浏览器/系统矩阵，产品现已在本委托书开头确认首版分享目标矩阵；兼容性仍未验证。
- 当前 ADR-002 只把 RFC 9180 HPKE 列为候选方向；未选算法套件、库、公钥身份验证方案、恢复格式或撤权轮换协议。
- `src/core/vault-keys.ts` 使用 Recovery Key 解开 User Key；当前 `backend/src/routes/vault.js` 对 `user_key_envelopes` 只执行首次插入并在冲突时拒绝，盘点未发现 Recovery Key/恢复封套轮换流程。因此新分享私钥若由 User Key 包裹，会继承现有恢复密钥的信任边界；该事实尚未经过独立审查。
- 静态检查 `backend/src/routes/users.js`：管理员重置其他用户密码只更新 `password_hash`、`must_change_password` 和时间戳，并撤销该用户 Session；未触及 Vault 恢复封套。`backend/src/routes/vault.js` 的恢复封套读取按认证 Session 的 `actor.userId` 查询，不接受请求方指定目标 User ID。此为代码静态观察，尚非动态越权测试或完整管理员边界审计。
- 对 `backend/src` 的静态搜索未发现应用显式把请求正文或密文写入 `console`/logger；前端找到的日志仅记录 IndexedDB 恢复数量和迁移版本号。此检查不覆盖 Cloudflare 平台访问日志、部署/构建日志、浏览器遥测或未来加入的第三方监控；审查和隐私评估需分别确认这些数据源。
- `backend/src/worker.js` 注释说明前端由 Cloudflare Pages 独立托管，`index.html` 由浏览器加载应用模块；仓库中未发现独立客户端代码完整性验证机制。首版建议暂将 Pages/浏览器客户端交付链列为可信计算基，并将此假设与主动公钥替换防护分开审查；此为工作建议，须由产品和独立审查确认，不构成对恶意代码交付的防护证明。
- 初步候选线索：[`dajiaji/hpke-js`](https://github.com/dajiaji/hpke-js) 声明实现 RFC 9180 并支持 Web Crypto 浏览器，但自述未经过正式审计；其 `@hpke/core` 曾披露异步 `seal()` nonce 竞态（受影响 `<=1.7.4`，公告标示 `1.7.5` 起修复）。[`panva/hpke`](https://github.com/panva/hpke) 跟踪的是演进中的标准草案。此清单不推荐依赖，只提醒审查确认精确协议版本、库状态、nonce 并发语义和支持矩阵。
- D1 用户隔离与单 User ciphertext 同步已在 Phase A 实现；OW-14 记录的跨 User 授权和撤权 UI 尚未实现，也未部署远端授权。

以上仅为代码与配置的静态事实，不代表审计发现或安全结论。

## 必须分析的攻击/故障场景

1. **数据库快照泄漏：** 攻击者取得 Users、opaque grants、公钥目录、密文和所有 key envelopes，能否恢复任何 User 的 Content Key？
2. **活跃服务端替换公钥：** 服务端对分享者返回攻击者公钥，但对受邀 User 返回真实公钥。客户端如何发现并拒绝？
3. **分叉目录：** 服务端给不同客户端展示同一 User 的不同公钥映射；核验方案是否能检测并提供可验证证据？
4. **公钥重绑/降级：** 攻击者或服务端重放旧密钥、替换算法套件、删除密钥版本、抢占初次注册或强制弱版本，是否可造成静默授权？
5. **伪造或串用封套：** 把 Entity A 的 envelope 放到 Entity B、grant X、另一个 User 或旧 key version 下，客户端和 Worker 分别如何拒绝？
6. **账号与密钥恢复：** 管理员重置登录密码、账号停用、恢复包恢复新设备、恢复包丢失、可信设备丢失，分别能否影响或泄露分享私钥？
7. **撤权竞态：** 撤权请求、密钥轮换、新封套上传、云端确认和离线写入任意交错时，旧/新 recipient 是否能读取之后的版本？失败如何原子回滚？
8. **被授权设备失陷：** 恶意软件或合法收件人复制明文/密钥后，产品是否诚实说明不可远程收回？
9. **管理员/身份边界：** 管理员、Person↔User 绑定、SceneParticipant 或 Space membership 是否有路径绕过显式授权获取密文或封套？
10. **服务端可观测性：** 账号间关系、访问时间、对象数量、密钥更改时间及透明日志查询会泄漏哪些元数据？
11. **核验 UX 失败路径：** 用户跳过核验、核验材料不一致、收件人离线、公钥变化后旧验证标记是否仍可用；客户端和 Worker 是否都能确保这些路径不能返回可用的 Content Key Envelope？
12. **历史封套与长期密钥泄露：** 若 recipient 的长期分享私钥在某日泄露，攻击者拿到以前缓存的 HPKE 封套后可恢复哪些历史 Content Key？公钥轮换、撤权和删除服务器历史副本分别能保护什么、不能保护什么？审查需明确前向保密限制以及这对历史内容和恢复策略的影响。
13. **Recovery Key 泄露与轮换：** 若 Recovery Key/恢复包与旧恢复封套都被复制，攻击者能否恢复 User Key 和全部历史分享私钥？只把同一个 User Key 重新封装给新 Recovery Key 不会使攻击者已持有的旧组合失效；是否需要轮换 User Key，并处理所有现有 Entity Content Key 封套、分享私钥及未来版本？当前服务端恢复封套是首次写入后不可更新；审查需判定恢复密钥轮换和失陷响应是否为实现前 blocker，以及如何处理并发设备、丢失设备、历史副本与账号接管。
14. **浏览器客户端代码交付：** 当前用户通过浏览器加载 Calmy 客户端，而解密后的明文与密钥会进入该客户端。若网页托管/代码交付方主动或被攻陷后投放窃密脚本，现有端到端加密是否仍满足产品承诺？请明确该攻击者是否在威胁模型内；若排除，给出准确隐私表述与残余信任假设；若纳入，评估可行的独立客户端完整性验证/分发机制及其上线门槛。浏览器端 E2EE 的代码交付风险背景见 [CISPA：Trust on Reload (2026)](https://cispa.de/en/research/publications/213253-trust-on-reload-securing-browser-based-end-to-end-encryption)。

## 请审查人交付的结论

请提交有日期的书面审查记录，至少回答：

1. 审查者的相关密码学/端到端加密经验、审查范围和独立性说明。
2. 威胁模型及明确排除的攻击者能力，包括数据库/Worker 访问、首次公钥替换、网页客户端代码交付、被授权终端失陷和用户主动复制等边界。
3. A/B/C 方案比较和推荐的公钥身份验证策略；若推荐 B，说明安全码如何把两端身份、公钥版本和 Calmy 分享上下文绑定，且不在此处发明未经证明的算法。
4. 对候选 HPKE 标准实现、确切 KEM/KDF/AEAD 套件、维护状态、审计/测试向量、浏览器能力、封套格式版本，以及 HPKE 自身不提供的重放/降级防护和接收方密钥泄露前向保密性的处理结论；明确选择 RFC 9180 或当前 IETF successor 草案/最终 RFC，并核实库的准确协议版本与模式（草案 `draft-ietf-hpke-hpke-05` 截至 2026-09-30 仍是 IESG Evaluation 中的工作草案，若获批将取代 RFC 9180，且其当前 KEM 接口移除了 AuthEncap/AuthDecap）；可以要求替换 HPKE 候选。
5. 分享私钥及 Recovery Key 的生成、存储、恢复、设备新增、失陷后的轮换和旧 Envelope 迁移的完整状态图。
6. grant 建立与撤权时 Worker 的原子顺序、幂等规则、离线冲突、重放防护和错误关闭策略。
7. 针对上节每个攻击场景的成功/失败条件与建议新增的验证用例。
8. `blocker`、`must-fix before pilot`、`accepted residual risk` 三类发现，以及 ADR-002 可否进入 Accepted 的明确结论。

可复制 [独立审查记录模板](ADR-002_INDEPENDENT_REVIEW_TEMPLATE.md) 后填写；最终记录应另存为带日期的审查报告，保留模板和证据链接。

## 审查通过后的实现边界

- 在书面结论关闭 blocker 和 must-fix 前，不新增依赖、不新增公钥登记接口、不写跨 User key envelope、不添加分享入口。
- 即使 ADR-002 被接受，先实现单 Entity/单接收方路径；Scene invite 和 Space Scope 是后续独立门槛。
- Worker 只接受 session actor，不解释加密 Scope 语义；无服务端确认 grant 时默认拒绝。
- 用户界面不得把“本地保存”“已发出授权请求”呈现为“对方已经可读”；只有授权与对应封套都被服务端确认后才可显示成功。
- 用户试点与产品隐私评审仍是单独门槛；密码学审查通过不等同于允许分享功能默认上线。

## 审查状态记录

| 日期 | 审查人 | 结论 | 未解决 blocker | ADR-002 状态 |
| --- | --- | --- | --- | --- |
| — | 尚未指定 | 尚未审查 | 尚未审查 | Proposed |
