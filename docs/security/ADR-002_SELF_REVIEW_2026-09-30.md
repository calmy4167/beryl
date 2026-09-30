# ADR-002 技术自审报告（非独立审查）

- **日期：** 2026-09-30
- **审查者：** Codex（参与了 ADR-002、Phase B 设计及审查委托书的起草）
- **独立性：** 不独立。本报告是作者辅助技术自审，不能替代由未参与方案/实现的密码学审查者出具的独立报告。
- **状态：** ADR-002 不具备 Accepted 条件；建议保持 Proposed。
- **审查范围：** ADR-002 与 Phase B 单 Entity 只读分享设计；现有 Vault/用户管理路径的只读静态检查；RFC 9180、IETF HPKE successor 草案、W3C Web Crypto 规范及所列 hpke-js 安全公告。
- **未覆盖：** 动态攻击测试、完整 Worker/D1/API 审计、部署平台访问日志与 Pages 配置、真实设备兼容性、HPKE 库完整源码审计、密码学形式化证明、用户研究。
- **验证方式：** 阅读文档和代码、查询 IETF/RFC Editor/W3C/GitHub 官方资料；未运行测试或构建，未新增协议实现。

## 执行摘要

当前代码没有跨 User 分享密钥、收件人公钥目录、grant/envelope API 或分享 UI。因此，本次没有确认到已部署的 Phase B 跨 User 密钥泄露漏洞；但候选协议缺少多项安全实施所必需的决策，不能据此开始真实数据分享。

主要阻断项是：首次收件人公钥的身份验证仍未决定；HPKE 标准文本、精确算法套件与封套格式未固定；封套上下文绑定、重放/降级防护和撤权原子性未定义；现有 Recovery Key 封套接口为只写一次，无法轮换；浏览器客户端交付方是否属于可信边界仍需产品明确确认。浏览器矩阵也只有目标版本，没有实际兼容证据。

**结论：ADR-002 保持 Proposed。** 以下自审发现不能关闭独立密码学审查门槛。不得将本报告表述为独立审查、密码学认证或 Phase B 上线批准。

## 发现

### CR-SR-001 — 阻断 ADR-002 接受：首次公钥身份验证没有确定方案

- **证据：** ADR-002 §“公钥目录威胁范围选项”仍把 A/B/C 留作待决定；审查委托书将 B 安全码/QR 作为候选基线，但不定义核验材料如何绑定双方账号身份、公钥版本和具体分享上下文。当前 Worker 没有分享公钥登记或查询端点（`backend/src/worker.js:4-9` 的路由导入列表、`backend/src/routes/` 当前实现）。
- **影响：** 若首次联系人公钥只从 Calmy 服务端读取，恶意或被攻陷的服务端可将攻击者公钥交给分享方，使分享者把 Content Key 封装给攻击者。TLS 不能证明该公钥属于目标 User。服务端还可能向双方展示不同目录视图。
- **要求：** 产品先明确是否把服务端主动替换首次公钥纳入威胁模型。若要求防护，采用经过审查的带外身份/指纹核验或等价机制；核验必须绑定用户可识别身份、密钥版本和 Calmy 分享上下文，并且跳过/失败时拒绝创建可读 grant/envelope。若不要求防护，必须把服务端首联信任写入 ADR 和准确的产品隐私承诺。密码学细节由独立审查确认。
- **状态：** Blocker；未解决。

### CR-SR-002 — 阻断真实分享：Recovery Key 泄露后的恢复封套无法轮换

- **证据：** 当前服务端 `handlePutUserKey` 对 `user_key_envelopes` 使用 `INSERT ... ON CONFLICT(user_id) DO NOTHING`，已初始化后返回 409（`backend/src/routes/vault.js:38-50`）。恢复流程用 Recovery Key 解出 User Key，并将其写入本机 Device Key 保护的 keyring（`src/core/vault-keys.ts:186-201`）。管理员重置密码只改登录密码/强制改密并撤销 Session，没有更新 Vault 恢复封套（`backend/src/routes/users.js:67-78`）。
- **影响：** 若未来分享私钥由 User Key 包裹，持有旧 Recovery Key 和旧服务器恢复封套的人仍可恢复 User Key 与相应分享私钥。单纯换登录密码或把同一 User Key 重新封装到新 Recovery Key 下，不能撤销攻击者已复制的旧组合。
- **要求：** 独立审查确定失陷响应是否必须支持轮换；设计并实现有版本、条件更新/并发控制、失败恢复和审计语义的恢复封套轮换。若泄露旧组合即视为长期失陷，必须分析 User Key 轮换对本地设备、每条 Entity Content Key envelope、已分享 envelope 和历史备份的迁移范围。不能先把分享私钥建立在当前不可轮换恢复路径上，再把该风险留到试点后处理。
- **状态：** Blocker；当前代码能力不足。

### CR-SR-003 — 阻断 ADR-002 接受：HPKE 版本、模式和应用封套格式未冻结

- **证据：** ADR-002 只把 RFC 9180 HPKE 列为候选；尚无算法套件、依赖版本、规范 wire format、canonical key encoding 或 AAD/context 字段（ADR-002 §候选决策和 §必须由独立审查解决的问题）。RFC 9180 说明 HPKE 不提供通用重放保护，应用需自行确定顺序/新鲜度；接收方长期密钥泄露可解开此前封套。[RFC 9180](https://www.rfc-editor.org/rfc/rfc9180.html)
- **最新标准状态：** 截至 2026-09-30，`draft-ietf-hpke-hpke-05` 是活跃 Internet-Draft，目标为 Proposed Standard；Datatracker 显示 IESG Evaluation、计划于 2026-10-08 讨论，并写明若获批将取代 RFC 9180。当前草案 KEM 接口移除了 RFC 9180 的 AuthEncap/AuthDecap 模式，且它仍是工作草案，不是已发布 RFC。[IETF Datatracker](https://datatracker.ietf.org/doc/draft-ietf-hpke-hpke/) [草案历史与状态](https://datatracker.ietf.org/doc/draft-ietf-hpke-hpke/history/)
- **库风险：** `@hpke/core` 曾披露异步 `seal()` 竞态可让多个 Seal 操作复用 AEAD nonce，受影响版本 `<=1.7.4`，修复从 `1.7.5` 起；候选库必须以精确版本、调用方式和修复证据评估。[GitHub 安全公告](https://github.com/dajiaji/hpke-js/security/advisories/GHSA-73g8-5h73-26h4)
- **影响：** 仅写“使用 HPKE”不足以确保双方使用同一套标准、相同编码及正确绑定的封套。错误重放、串用到另一 Entity/grant/User/key version、降级或 nonce 并发错误都可能破坏保密性/完整性或恢复流程。
- **要求：** 选择一份确切的规范文本和单次封装模式，确定 KEM/KDF/AEAD、库版本、测试向量和兼容矩阵；定义 versioned envelope 与规范编码；把 recipient User/key ID、opaque Entity ID、grant ID、Content Key version 和协议版本绑定进经认证上下文；定义服务端状态版本和陈旧封套拒绝规则。HPKE Auth 模式即使使用，也不等于 Calmy User 身份验证。独立审查确认后才接受。
- **状态：** Blocker；未解决。

### CR-SR-004 — 阻断实现：撤权与 Content Key 轮换没有原子状态机

- **证据：** 设计仅提出撤权后轮换 Entity Content Key；worker grant、封套存取、并发请求、离线编辑和部分失败的原子顺序尚未定义（Phase B 设计 §安全边界与 §实现门槛；审查委托书攻击场景 7）。当前 Worker 路由清单也没有 grant/envelope API（`backend/src/worker.js:4-9`）。
- **影响：** 先发新 envelope 后撤权失败，可能让目标之外的主体取得新 key；若先撤权、后续轮换或上传部分失败，则可能造成数据不可用、旧 key 持续可读或 UI 错报成功。幂等重试与离线设备可能重新引入旧授权状态。
- **要求：** 定义默认拒绝的服务端状态机和原子提交/补偿次序：先阻止撤权对象读取，再接受新版本和仅面向存续授权者的 envelopes；给出请求幂等键、并发版本、重复/过期请求和离线冲突规则。UI 只在 Worker 确认 grant 与所需 envelopes 都可用后报告成功。通过书面设计及实现后的可执行验收用例证明。
- **状态：** Blocker；未解决。

### CR-SR-005 — 阻断隐私承诺定稿：浏览器代码交付方可读取明文

- **证据：** HTML 入口直接加载浏览器模块（`index.html:12-15`）；Worker 注释说明前端由 Cloudflare Pages 独立托管（`backend/src/worker.js:11-18`）。一旦合法客户端解密，代码可读到明文及密钥；本自审未见独立验证客户端资源完整性并阻止被修改脚本执行的机制。
- **影响：** 若网页托管账户/客户端交付链被控制，改动脚本可读取并外传明文或密钥，数据库静态加密无法防止该攻击。故现有零知识表述只能在明确假设客户端交付链与终端可信的威胁模型下成立。
- **要求：** 产品明确接纳此可信计算基假设并限制隐私承诺；若必须防恶意客户端交付，先设计、验证独立客户端完整性/分发机制，再接受 ADR-002。审查报告应把恶意 Worker/API 与静态存储泄露、恶意静态客户端代码区别讨论。
- **状态：** Blocker to ADR-002 acceptance；是否接受此边界未决定。

### CR-SR-006 — 接受/试点前必须补齐：浏览器与密钥恢复没有实测证据

- **证据：** 首版 12 个平台/浏览器主版本组合仅是 2026-09-30 的发布版本目标；设计、ADR 和审查模板均注明兼容性未验证。当前尚未选出最终 HPKE 库和 suite，因此不存在可证明的 HPKE 浏览器支持结果。
- **影响：** 某些浏览器/系统可能不支持所选密码库、密钥导入导出或 IndexedDB `CryptoKey` 持久化/恢复，导致无法解密、恢复异常或危险的静默回退。W3C Web Crypto 说明 `CryptoKey` 可序列化存入 IndexedDB，但具体 UA/底层提供程序能力会有限制，规范本身不是 Calmy 的设备通过记录。[W3C Web Cryptography API §5.2](https://www.w3.org/TR/WebCryptoAPI/#key-storage)
- **要求：** 对精确发布 build 和真实设备执行审查模板中的兼容验证表；覆盖官方向量、负向输入、持久化/重启、新设备恢复、移动端挂起/恢复及并发调用。不可获得的旧版设备要显式列为未验证或缩小支持范围；不得以 `es2020` 构建目标、库 README 或模拟器结果代替。
- **状态：** Must-fix before ADR-002 acceptance and pilot；未执行。

## 明确的残余风险（当前尚未由产品正式接受）

| ID | 风险 | 说明与处置 |
| --- | --- | --- |
| CR-R-001 | 收件人长期分享私钥泄露会暴露历史封套 | RFC 9180 的 HPKE 不提供对收件方长期密钥泄露的前向保密。撤权和换公钥不能追回攻击者已复制的旧 envelope；须披露并决定旧 CK/envelope 历史策略。 |
| CR-R-002 | 收件人可复制已解密明文 | 合法接收方可以截图、导出或备份明文。服务器撤权不能远程擦除用户设备或副本；产品必须明确说明。 |
| CR-R-003 | 服务端仍可见控制面元数据 | opaque grant、涉及的 User、访问/更新时间、对象数量及版本变化可能暴露关系信息；静态密文并不隐藏这些元数据。 |

这些风险目前只被文档识别，尚未证明由产品负责人或隐私负责人正式接受。

## 攻击场景快速结论

| 场景 | 自审结论 | 当前依据/下一步 |
| --- | --- | --- |
| D1/备份静态泄露 | 目标属性未验证 | 无跨用户 key envelope；实现后需要对完整 DB/备份快照验证不能恢复 Content Key。 |
| 首次公钥替换 | 未解决，CR-SR-001 | 无公钥目录/身份核验路径。 |
| 分叉公钥目录 | 未解决 | 若选 B，仅靠目录一致性检查不能检测服务器向两侧分叉；评估带外核验能发现什么。 |
| 公钥重绑、降级、重放 | 未定义，CR-SR-003 | 没有 key version、协议版本、透明性/变化处理状态机。 |
| Entity/User/grant/key-version envelope 串用 | 未定义，CR-SR-003 | 没有格式、AAD/context 或客户端拒绝规则。 |
| 密码重置、Recovery Key 丢失/泄露 | 部分静态观察，CR-SR-002 | 密码重置撤销 Session；不会轮换 Recovery envelope/User Key。 |
| 撤权、轮换、离线并发 | 未实现，CR-SR-004 | 无 grant/envelope API 或状态机。 |
| 授权设备失陷/拷贝明文 | 固有限制，CR-R-002 | 撤权不能收回已下载内容。 |
| 管理员/Person/Scene/Space 越权 | 部分静态观察；未来端点未审 | 现有恢复读取绑定 session actor；不能替代未来授权接口的动态越权测试。 |
| 账号关系/控制面元数据 | 残余风险 CR-R-003 | opaque grant 仍可能揭示关联关系、时间和数量。 |
| 用户跳过/失败核验 | 未实现，CR-SR-001 | 无分享 UI；需求候选规定失败关闭，但尚无代码。 |
| 长期 recipient key 泄露 | 残余风险 CR-R-001 | HPKE recipient compromise 无前向保密。 |
| Recovery Key 与旧 envelope 同时泄露 | 持续性风险 CR-SR-002 | 当前恢复封套 write-once；需要轮换/失陷响应设计。 |
| 浏览器恶意代码交付 | 信任边界未定，CR-SR-005 | 客户端能读明文，未见独立完整性保护机制。 |

## 建议的状态和后续

1. 保持 ADR-002 为 Proposed；不新增跨 User 公钥登记、key envelope、grant schema/API 或分享 UI。
2. 产品负责人决定首联公钥验证与客户端代码交付两项威胁边界，并确认是否接受表中残余风险。
3. 固定 HPKE 规范版本、实现库、suite、封套编码/AAD 和 Recovery Key 轮换要求；将 CR-SR-001 至 CR-SR-005 关闭条件写进协议方案。
4. 将本报告连同原始委托书发给未参与该方案的密码学审查人，要求对每项发现独立复核、提出新增发现并提交签署的书面结论。
5. 只有独立审查发现均已修复或由具备权限的负责人明确接受、浏览器矩阵验证完成且 ADR-002 被正式接受后，才能进入受控实现阶段；试点和默认入口另有单独门槛。

## 来源

- [RFC 9180 — HPKE](https://www.rfc-editor.org/rfc/rfc9180.html)
- [IETF draft-ietf-hpke-hpke-05 和当前流程状态](https://datatracker.ietf.org/doc/draft-ietf-hpke-hpke/)
- [IETF draft 历史](https://datatracker.ietf.org/doc/draft-ietf-hpke-hpke/history/)
- [W3C Web Cryptography API — Key Storage](https://www.w3.org/TR/WebCryptoAPI/#key-storage)
- [hpke-js GHSA-73g8-5h73-26h4](https://github.com/dajiaji/hpke-js/security/advisories/GHSA-73g8-5h73-26h4)
