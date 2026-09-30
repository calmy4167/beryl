# ADR-002（草案）：跨用户密钥封套与收件人密钥验证

- **状态：** Proposed，待独立密码学审查
- **日期：** 2026-09-30
- **范围：** Phase B 跨 User 的单 Entity Content Key 分享；不覆盖默认产品入口
- **依据：** [ADR-001](ADR-001-content-zero-knowledge-with-visible-access-metadata.md)、[User identity and product access design](../superpowers/specs/2026-09-29-calmy-user-identity-and-product-access-design.md) §6、§10、§13
- **配套实施准备：** [Phase B collaboration preflight plan](../superpowers/plans/2026-09-30-calmy-phase-b-collaboration-preflight.md)
- **独立审查委托：** [Phase B cryptographic review request](../security/CALMY_PHASE_B_CRYPTO_REVIEW_REQUEST.md)
- **作者技术自审（不满足独立审查门槛）：** [ADR-002 self-review](../security/ADR-002_SELF_REVIEW_2026-09-30.md)
- **首个授权切片设计：** [Phase B single-Entity read-only sharing](../superpowers/specs/2026-09-30-calmy-phase-b-single-entity-readonly-sharing-design.md)

## 背景

Phase A 为每条 Entity 生成 Content Key，并用创建者自己的 User Key 封装。该封套只适用于创建者的 Vault；它不能让另一位 User 解密 Entity。当前代码也没有经过认证的接收方公钥目录或跨 User 封套交换。

跨 User 分享需要同时做到：Worker 确认授权边、分享方客户端将 Content Key 交付给真正的接收方、接收方设备可以恢复解密能力，而服务器不能取得 Content Key。公钥的**真实性**与加密算法同等关键：若服务器可无提示地替换首次登记的接收方公钥，它可能把后续分享导向攻击者控制的密钥。

## 候选决策（尚未接受）

候选方向是为每个 User 建立稳定的分享公钥/私钥对：

- 公钥登记为不透明控制面元数据；私钥只在客户端，并由该 User 的 Vault 密钥保护。
- 分享者客户端把单个 Entity Content Key 封装给被选中 User 的分享公钥；Worker 只在明确 grant 确认后保存封套并允许接收方读取。
- 接收方新设备通过现有 Vault Recovery Key 恢复 User Key，再恢复分享私钥；登录密码重置不改变或恢复该私钥。
- 多个 Entity 各自保持独立 Content Key；服务端不接收解密后的实体或密钥。
- 候选封装机制为基于 RFC 9180 的 HPKE 标准实现。算法套件、库、与已确认产品浏览器矩阵相容的具体实现和调用参数由独立审查确定，不在本草案中自创封装算法。

此方向利用标准混合公钥加密方案。RFC 9180 定义以接收方公钥封装任意明文的 HPKE，并提供 ECDH、HKDF、AEAD 等标准构件；Web Crypto API 提供底层密码原语，但并不等于应用已经正确组合了完整的 HPKE 协议。具体实现应使用经审查的标准实现，或经审查后才考虑组合原语。[RFC 9180](https://www.rfc-editor.org/rfc/rfc9180.html)；[W3C Web Cryptography API](https://www.w3.org/TR/WebCryptoAPI/)

## 当前实现与兼容性盘点（2026-09-30）

- `src/core/vault-keys.ts` 目前用 AES-GCM 封装 User Key 和 Entity Content Key；本地 Device Key 是不可导出的 AES-GCM `CryptoKey`。现有实现没有分享密钥对、收件人公钥登记、HPKE 封装或接收方封套解包流程。
- 根 `package.json` 未声明 HPKE 或公钥封装依赖；本盘点未把其他工具的依赖视为生产应用可用依赖。
- `vite.config.ts` 的 `target: 'es2020'` 是语法构建目标，不是浏览器支持承诺；仓库未找到 Browserslist。产品已确认 Phase B 首版分享能力目标矩阵及 2026-09-30 初始测试版本快照，见[分享设计 §10](../superpowers/specs/2026-09-30-calmy-phase-b-single-entity-readonly-sharing-design.md#版本快照2026-09-30官方发布记录)。Firefox 不在首版分享能力范围。
- 本次只读盘点没有新增依赖、没有运行浏览器兼容测试，也没有验证真实设备支持情况。独立审查须针对该矩阵评估协议库与 Web Crypto 能力；发布验证记录实际版本，并覆盖 IndexedDB CryptoKey 持久化、恢复和密钥生命周期。若审查要求调整矩阵，须先更新 ADR、设计和计划。

### HPKE JavaScript 库的初步证据（不是选择结论）

- [`dajiaji/hpke-js`](https://github.com/dajiaji/hpke-js) 的项目文档称其实现 RFC 9180，并以 Web Crypto API 支持浏览器；同一文档也明确称项目未经过正式审计。文档没有给出本项目已确认的具体浏览器/OS 主版本，因此“支持浏览器”不能替代 Calmy 的实际兼容验证。
- 该项目曾披露 `@hpke/core` 的异步 `seal()` 并发竞态可能复用 AEAD nonce，影响版本为 `<=1.7.4`，公告标示从 `1.7.5` 修复。独立审查需检查候选准确版本、调用并发方式与修复状态，不得只看 package 名称或版本范围推断安全。[GHSA-73g8-5h73-26h4](https://github.com/dajiaji/hpke-js/security/advisories/GHSA-73g8-5h73-26h4)
- [`panva/hpke`](https://github.com/panva/hpke) 项目说明其跟踪的是仍在演进的 HPKE 标准草案，而非直接实现 RFC 9180；不能与 `hpke-js` 或 RFC 9180 协议视为可互换实现。
- 截至 2026-09-30，`draft-ietf-hpke-hpke-05` 是 IETF 活跃 Internet-Draft，目标状态为 Proposed Standard，正在 IESG Evaluation（Datatracker 显示计划于 2026-10-08 讨论）；草案声明若获批将取代 RFC 9180。该草案的当前 KEM 接口移除了 RFC 9180 的 AuthEncap/AuthDecap authenticated modes。它仍是工作草案，不是已发布 RFC；Calmy 必须明确固定使用 RFC 9180 还是未来标准文本，并要求候选库提供相应精确版本的兼容性、测试向量和维护证据。Calmy 目标只需公钥加密 Content Key，HPKE Base single-shot 可能足够，不能因为协议有 Auth mode 就将其误当作用户身份验证。[IETF draft-ietf-hpke-hpke-05 与状态](https://datatracker.ietf.org/doc/draft-ietf-hpke-hpke/)；[RFC 9180](https://www.rfc-editor.org/rfc/rfc9180.html)

上述仅是候选筛查线索，不构成库、算法套件或依赖版本的批准。

以上是代码与配置的静态盘点，不是对现有 AES-GCM 用法的独立密码学审计，也不代表浏览器支持 HPKE。

## 浏览器客户端交付的信任边界（待定）

Calmy 当前通过浏览器交付客户端代码；该代码在解密后能够读取业务明文和密钥。若控制网页资源的服务端、托管账户或交付链路被恶意控制、胁迫或攻陷，它可能向浏览器发送窃取这些内容的改动代码。数据库密文与 HPKE 封套本身不能防止这类客户端代码攻击。现有 ADR 与 Phase B 设计尚未定义独立验证并阻止被修改客户端代码的机制。

当前可见实现把前端作为静态浏览器应用独立于 Worker API 托管；入口 HTML 加载应用模块，仓库未发现独立客户端完整性验证/拒绝改动资源的方案。基于此现状，本 ADR 建议首版分享采用一个有限的工作威胁模型：防服务端数据库/存储泄露和未获授权的 API 读取；信任浏览器客户端代码交付链与用户终端，不声称抵御恶意或被攻陷的代码托管方。该建议不是独立审查结论，也不是对更强保护的拒绝；若产品要求将主动代码交付攻击纳入威胁模型，必须先设计并验证可部署的完整性机制，再接受 ADR-002。

关于浏览器端 E2EE 的客户端代码交付风险，可参见 [CISPA：Trust on Reload (2026)](https://cispa.de/en/research/publications/213253-trust-on-reload-securing-browser-based-end-to-end-encryption)；此引用是风险依据，不表示该论文方案已在 Calmy 验证或采用。

## 安全属性与明确限制

- 公钥加密保护封套内容；Worker 另行执行授权，二者必须同时成立。持有可解密封套不能绕过已撤销的服务端访问资格。
- HPKE Base 模式本身不证明接收方公钥属于用户界面显示的那个 User，也不提供发送者身份认证。授权者身份由登录会话和服务端 grant 表示；收件人公钥的身份绑定必须由单独机制解决。
- RFC 9180 不提供重放、降级或消息乱序/丢失保护，也没有规定 HPKE 封套的 wire format；应用协议必须定义并严格检查封套编码、套件版本、授权/密钥版本和新鲜度。
- RFC 9180 的 HPKE 不提供针对接收方长期私钥泄露的前向保密性：若收件人的长期分享私钥之后泄露，攻击者可能解开此前保存的封套。更换公钥只能保护之后按新公钥封装的内容，不能让既有封套追溯安全；审查须据此确定旧封套、内容密钥轮换和历史同步策略。
- HPKE Auth 模式提供的是对发送方密钥持有的认证，不会自行把该密钥绑定到 Calmy User 身份；RFC 9180 还列出了相关的密钥泄露冒充边界。不得把 Auth 模式当作公钥目录身份验证或用户授权的替代品。
- TLS 与已登录会话只能保护公钥登记/查询的传输和账号操作。若不校验密钥指纹、密钥透明性或等价机制，恶意/被攻陷服务端仍可能对新建关系替换公钥。此时不能声称可以抵抗服务端主动密钥替换。
- 当前静态代码盘点显示，管理员密码重置仅修改登录凭据、强制改密状态并撤销目标 User 的 Session；Vault 恢复封套读取绑定当前 Session User。该证据与“管理权限不授予解密权”的目标一致，但未覆盖动态越权测试，也不替代审查所有未来共享/密钥管理端点。
- 接收方已取得并解密的历史副本不可远程收回。撤权只阻止后续服务端读取，并通过 Entity Content Key 轮换保护未来版本。
- User 分享私钥若由 User Key 包裹，则所有能恢复 User Key 的可信设备均可解开该私钥；账号停用不能擦除离线设备中的私钥或明文。
- 当前 Phase A 的 Recovery Key 可解开服务端存储的 User Key 恢复封套；检查到的 Worker 接口只允许首次插入该封套（冲突时拒绝），目前没有恢复密钥轮换接口。因此新分享私钥若继续由 User Key 保护，会继承 Recovery Key 泄露的影响，而且现有流程无法直接撤销已泄露的 Recovery Key。仅把同一个 User Key 改用新 Recovery Key 重新封装，不能使攻击者手中已有的“旧 Recovery Key + 旧恢复封套”失效；若将该组合视为已泄露，恢复边界可能要求轮换 User Key，并评估所有 Entity Content Key 封套、分享私钥与未来版本的连带处理。独立审查须明确先补齐哪种恢复/失陷响应，或接受并准确披露哪些残余风险。

## 必须由独立审查解决的问题

1. **公钥身份验证：** 在分享者确认受邀 User 前，如何防止服务端将公钥替换为攻击者密钥？比较安全码/QR 带外核验、可信联系人指纹、密钥透明日志及组合方案的威胁与用户负担。不能把“TLS 下从服务器读取”视作端到端身份验证。
2. **协议与库：** 选择 RFC 9180 的哪一套 KEM/KDF/AEAD，库如何维护、如何验证向量、是否适用于当前目标浏览器；定义 canonical key encoding 和 suite/version downgrade 防护。
3. **私钥保护和恢复：** User 分享私钥的生成、可导出性、由 User Key 包裹的具体格式、密钥版本和恢复过程；恢复包丢失时是否必须使用仍解锁的设备重新签发。
4. **设备更换/丢失：** 新设备恢复后如何取得历史获准的 Entity Content Key；设备密钥泄露时如何判断需要重发封套或轮换 Entity Content Key。
5. **重放和绑定上下文：** 封套需绑定的 opaque Entity ID、grant ID、recipient User/key ID、Content Key version 和 protocol version；确定这些字段如何进入经过认证的上下文，以及服务端如何拒绝陈旧 grant/envelope。
6. **撤权原子性：** 服务端先禁用读取，再接受新版本/新封套；明确批量失败、离线修改、重试幂等和审计顺序，避免部分轮换期间暴露新数据。
7. **恶意客户端边界：** 已授权用户可复制明文或密钥；分享无法保证授权设备没有恶意软件、截图或二次导出。

## 公钥目录威胁范围选项

| 级别 | 保护目标 | 机制与代价 | 未覆盖的风险 |
| --- | --- | --- | --- |
| A. 可信服务端目录 | 防止数据库泄漏直接暴露 Content Key；假定服务端会诚实提供收件人公钥 | TLS 会话下从服务端读取公钥；界面提示当前公钥及变化。实现成本较低 | 被攻陷或恶意服务端可在首次分享前替换公钥，接收分享密钥；Key TOFU 只能在已记住旧 key 后提示变化 |
| B. 人工核验 | 额外发现/阻止服务端在首次联系时替换公钥 | 分享双方通过面对面或可信外部渠道对比安全码/扫描 QR；不依赖 Calmy 密钥目录，但要用户采取额外步骤 | 用户可能跳过、误读或通过同一被控渠道核验；新设备/密钥重置会产生重新核验负担 |
| C. 密钥透明性 | 检查服务器是否向不同用户展示不一致的 User→Public Key 映射 | 可验证的透明日志、跨客户端一致性证明和独立 witness/auditor；工程、运营及第三方依赖最大 | 不能证明账号背后是现实中的正确个人；若无独立 witness 或一致性检查，服务端仍可能展示分叉视图 |

Signal 的公开说明将密钥透明性描述为验证用户目录中的账号与公钥映射保持一致，并指出安全码/QR 可以作为人工核验方式；其当前方案还展示了第三方审计者在检查目录一致性中的角色。这是机制参考，不代表 Calmy 应直接采用 Signal 的方案或其实现。[Signal：Automatic Key Verification](https://signal.org/blog/automatic-key-verification/)；[Signal：Safety Number Updates](https://signal.org/blog/safety-number-updates/)

上述 HPKE 边界依据 [RFC 9180 §9–§10](https://www.rfc-editor.org/rfc/rfc9180.html#section-9)；其身份认证语义与 key-compromise 边界须由独立审查落实到最终协议，不应仅凭此草案推导具体套件或 API。

**尚待决定：** Calmy 的零知识承诺是否把“服务端主动替换首次分享公钥”纳入威胁模型？若纳入，A 不能单独满足要求；需要 B、C 或经独立审查认可的等价方案。由于 Calmy 目前没有透明日志运营能力，本草案不把 C 描述为现成可部署能力。

### B 方案的候选产品约束（待审查）

- 分享方和收件方要通过独立于 Calmy 密钥目录的可信渠道核验同一份验证材料；验证材料必须绑定到双方实际公钥与对应密钥版本，不能只核对一个不含密钥上下文的随机短码。
- 首次核验未通过、被跳过或结果不一致时，不提交可读取的授权和 Content Key Envelope；页面显示“尚未验证，未共享”，允许取消。
- 已验证公钥变化后，旧验证标记立即失效；新版本 Envelope 在重新核验前不得发放。
- UI 分别显示本地待处理、等待核验、服务端未确认、已共享、撤权中、已撤权和需要重新核验；只有 grant 与 recipient envelope 均由服务端确认后才能显示“已共享”。
- 这是产品行为候选，不定义安全码计算、密钥序列化、核验消息格式或协议 API；这些由独立审查决定。审查人还应评估“双方确认”对家庭用户的现实可用性，并提出失败关闭但可退出的流程。

## 拒绝的捷径

- 不将接收方 User Key、登录密码、Recovery Key 或 session token 发送给分享者或 Worker。
- 不因 Person↔User 绑定、SceneParticipant、Space 成员身份或管理员角色自动发放任何封套。
- 不把服务端保存的一条 `recipient_user_id` 权限记录当作密钥交付。
- 不使用自制 RSA/ECDH/AES 拼装协议；不在未经审查的情况下以“Web Crypto 支持某算法”推断协议安全。
- 不在接收方公钥首次绑定尚未解决时开启线上真实数据分享。

## 接受标准

只有在下列条件全满足时，才可将本 ADR 从 Proposed 改为 Accepted 并进入实现：

- 独立审查人书面确认协议威胁模型、原语套件、身份验证、恢复和撤权方案；审查发现均已处理或明确接受。
- 浏览器兼容验证覆盖当前正式支持浏览器，并验证所选标准实现、密钥导入/导出限制、恢复和错误路径。
- 对服务端替换收件人密钥、篡改/重放封套、伪造 actor/owner、撤权后拉取、离线旧副本等攻击定义了可执行的验收场景。
- 产品文案如实说明服务端仍可见账号间 grant 元数据、离线副本不能即时撤回，以及密钥首次验证机制的限制。

## 状态

本草案没有选定最终算法、库、公钥真实性方案或设备恢复协议；没有授权开始跨 User 密钥封套实现。Phase B 继续受 [OW-14](../product/OPEN_WORK.md) 的真实用户试点和隐私评审门槛约束。

## 决策记录

| 日期 | 决策 | 结果 |
| --- | --- | --- |
| 2026-09-30 | 产品负责人确认保留独立密码学审查门槛；Codex 作者技术自审不作为替代 | ADR-002 保持 Proposed；等待未参与本方案的审查者提交书面报告 |
