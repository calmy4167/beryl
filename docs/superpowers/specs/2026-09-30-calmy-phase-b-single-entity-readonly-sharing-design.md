# Calmy Phase B：单 Entity 只读分享设计

- **状态：** 设计草案，待用户审阅；recipient key protocol 仍待独立密码学审查
- **日期：** 2026-09-30
- **范围：** 一个拥有者向一位已启用 User 显式分享一条 Entity 的只读版本
- **架构依据：** [Calmy 多人场景与数据共享核心设计](../../../Calmy-多人场景-模块关系与数据共享核心设计方案.md)、[User identity and product access design](2026-09-29-calmy-user-identity-and-product-access-design.md)、[ADR-001：零知识优先架构](../../adr/ADR-001-content-zero-knowledge-with-visible-access-metadata.md)
- **相关安全材料：** [ADR-002 recipient key envelope protocol（Proposed）](../../adr/ADR-002-recipient-key-envelope-protocol.md)、[独立密码学审查委托](../../security/CALMY_PHASE_B_CRYPTO_REVIEW_REQUEST.md)

## 1. 目标与成功结果

Calmy 用户可以明确地把一条 Entity 分享给另一位已启用的 Calmy User，并让收件人在本机解密查看。服务器执行认证和授权，只存储加密业务内容及最小不透明授权元数据；Person、Thing、Scene、Space、Domain、Relation、标题和正文仍由客户端解密后理解。

首个可实现切片仅验证“一个拥有者、一个接收者、一条 Entity、只读访问”的授权和密钥交付闭环。它不代表所有模块、Scope 语义、多方编辑或产品默认分享入口已经完成。

## 2. 安全与产品边界

- 已登录 Session 决定 actor；请求体提供的 actor、owner 或角色字段一律不能决定权限。
- 没有服务端确认的 `view` grant 和匹配收件人的 Content Key envelope 时，默认拒绝读取。
- Person↔User 绑定、SceneParticipant、Space membership、管理员角色和现实关系本身都不授予访问权。
- 服务端只检查不透明 Entity ID 与 grant，不解释加密 Scope、Owner、Person、Domain、Thing、Scene、Space 或 Relation 语义。
- 首版只允许 Entity 拥有者分享和撤权；不给接收者 comment、edit、manage、转授权或变更 Owner 的权利。
- 登录凭据、Session、User Key、Recovery Key 和 Content Key 彼此分离；任何密钥不得传给 Worker 明文。
- Entity 内容及其 key envelope 必须按已审查协议加密。候选 RFC 9180/HPKE 仍未定套件、库或实现参数；不得在审查前实现 recipient key exchange。
- 当前推荐的试点威胁模型是 B：首次分享及收件人公钥变化时，由双方经独立可信渠道核验安全码/QR。此为候选建议，待独立审查确认；若最终只信任服务端公钥目录，则需明确缩小对恶意/被攻陷服务端的防护承诺。
- Calmy 服务端仍能观察必要 User 间授权关系、同步时间、对象数量/大小等元数据；授权存在本身可能泄露关系。
- 撤权阻止之后的在线读取和同步，不能远程收回此前已经下载、解密、复制或导出的副本。

## 3. 组件与数据归属

### 3.1 拥有者 Entity

原 Entity 保留拥有者 User 的稳定 ID、原有 Repository 与加密内容。分享不复制一个“收件人拥有”的第二份事实，也不把收件人写入业务 Entity 的 Owner 字段。共享内容由拥有者继续维护。

### 3.2 服务端 grant 与 envelope

D1 控制面为一条分享保存经审查后确认的最少字段：不透明 `grant_id`、`owner_user_id`、`recipient_user_id`、`opaque_entity_id`、动作 `view`、grant 状态/版本、Content Key 版本、收件人 key ID、加密 envelope 及必要时间/审计字段。精确 schema、Envelope 版本及身份认证字段须由 ADR-002 审查确认后再冻结。

D1 不保存 Entity 标题、类型、Domain、Person/Scene/Space 语义、Scope 条件、明文内容或解密密钥。owner 与 recipient User ID、授权动作及授权发生时间属于可见控制面元数据，按 ADR-001 向用户说明。

### 3.3 收件人视图与本地副本

收件方取得的数据表示一个来自拥有者的授权只读投影，不进入收件人的自有 Entity Repository，不允许以收件人身份写回源 Entity。已授权并解密的副本按收件 User 的本地隔离边界缓存，显示拥有者来源和最近一次服务端授权确认时间。

首版只在独立的“分享给我”页面提供读取，不接入全局 Search、Graph、Review、Calendar、Today、AI Context 或各业务模块；这些能力须待全产品 Mapping 与双重授权/语义过滤审查后按 Phase C 逐项接入。首版不把分享缓存加入收件人的常规 JSON Backup 或 Portable Vault 导出；后续如需导出，必须作为用户明确操作设计并保留来源/所有权语义。

## 4. 授权与密钥数据路径

```text
拥有者从 Entity 详情选择已启用的 Calmy User
  ↓
确认只读、可见范围仅此 Entity，并按最终核准的协议验证收件人公钥
  ↓
拥有者客户端为该 recipient key 产生 Entity Content Key envelope
  ↓
Worker 从 Session 得到 owner actor，验证其拥有者权限
  ↓
Worker 原子确认 grant + recipient envelope；不完整则拒绝
  ↓
收件人 Session 查询自己的 active grants
  ↓
Worker 只返回被授权 Entity 的密文与此 recipient 的匹配 envelope
  ↓
收件人客户端验证 grant/entity/key 版本绑定并解密
  ↓
独立的“分享给我”只读视图
```

服务端返回数据前必须做访问检查，不得先把无权密文传给客户端再由页面隐藏。收件人不能以更改 request body 中 User ID、Owner ID、grant ID 或 Entity ID 的方式扩大权限。

本设计不规定公私钥算法、安全码算法、HPKE suite、recipient key identity proof、AAD 编码或私钥恢复格式；这些留给 ADR-002 独立审查。服务端确认 grant 的控制面能力和客户端验证/解包 envelope 是相互独立且缺一不可的条件。

## 5. Grant 生命周期

### 5.1 创建

- 分享只从一条已解锁、拥有者可管理的 Entity 发起。
- 收件人必须是已启用的 Calmy User；未注册 Person 不可直接成为数字收件人。
- 第一期动作固定为 `view`；客户端使用已核验的 recipient key 生成对应 envelope。
- Worker 必须把 grant 和 envelope 作为一个逻辑原子操作确认；任一校验或写入失败，grant 保持不可读取。
- 客户端以稳定 command/idempotency ID 重试，避免网络重试生成重复授权。
- UI 只有在 Worker 确认 grant 与匹配 envelope 后显示“已共享”。本地保存、排队、待核验或请求已发送均不能显示成功。

### 5.2 读取与变更

- 收件人只可读；所有 create/update/delete/transfer/manage 请求返回拒绝。
- Worker 每次拉取都重新检查当前 Session、grant 状态、recipient、opaque Entity ID 和 key version。
- Entity 内容后续由拥有者更新。只有经过 grant 与 envelope 检查，收件人才能取得当前内容版本；owner 的授权撤销不能因缓存或旧游标被绕过。
- 仅出现 Person、SceneParticipant 或 Space 关系不创建授权；首版没有 Scope share。

### 5.3 撤权与删除

- 首版只由拥有者撤权。Worker 将 grant 转为 revoked 后立即拒绝该收件人新的线上读取，并且不再返回对应 envelope。
- 撤权后，拥有者客户端轮换 Entity Content Key，并用新 key 写入当前内容版本；旧 key 不用于后续同步版本。具体服务端事务、Envelope 替换、失败恢复和幂等次序须经安全审查后定义。
- 拥有者删除 Entity 并产生 tombstone 时，授权视图在同步中成为 unavailable；仅归档/完成状态变化不隐式撤销分享。历史 grant 审计不得包含语义标题或明文。
- 再次分享使用新的 grant ID 和经核验的 key version；旧 revoked grant 不可重新激活。
- 旧设备保留的明文或旧密钥无法远程抹除，产品须明确说明。

## 6. 离线与失败行为

- 网络不可用时可以保留拥有者本机草稿，但不得显示“已共享”；待云端确认前收件人不能取得授权。
- 收件人可在离线时查看先前已下载且本机已解锁的副本。状态显示“离线，最后授权确认于 …”；再次联网后 Worker 状态决定后续可读性。
- User 被停用、grant 撤销、key version 不匹配或 owner entity tombstone 生效时，在线读取默认拒绝。
- 内容无法解密、Envelope 被篡改或版本上下文不匹配时，不显示密文字符串，不覆盖当前有效本地副本；报告可恢复的验证错误。
- grant 或 envelope 写入部分失败时不得向 recipient 返回密文；重试可重复执行且不产生第二个 grant。
- 收件人未能完成公钥核验时，分享停留在“未共享”并允许取消。核验材料不一致、公钥变化或降级协议时阻止 envelope 生成/提交。

## 7. 首版界面范围

### 拥有者

1. 从 Entity 详情选择“分享”。
2. 选择一位已启用 User；列表明确区分账号与现实 Person。
3. 查看“只读”权限和所选 Entity 的可见范围。
4. 按最终核准协议进行安全码/QR 核验；公钥未核验或已变化时不可跳过后宣称成功。
5. 等待服务端确认，分别显示本地待处理、等待核验、服务端未确认、已共享、撤权中、已撤权和需要重新核验。
6. 可以撤权，说明无法收回对方此前下载的副本。

### 收件人

1. 在独立的“分享给我”列表看到当前可读的共享 Entity。
2. 打开后查看解密的内容、拥有者来源和最近一次授权确认状态。
3. 无授权时不显示 Entity 名称、占位提示或数量；曾有授权但已撤销时，只显示不泄漏其他隐藏对象信息的不可用状态。
4. 不显示编辑、评论、分享或转授权操作。

## 8. 验收标准

实现后必须覆盖下列行为（本设计文档不宣称测试已创建或执行）：

1. 未授权 User 无法从任何列表、详情、同步游标或附件路径读取该 Entity 的 ciphertext 或 envelope。
2. 有效 owner actor 对指定 recipient 创建 `view` 后，只有该 recipient 获得可解密封套；无关 User、已停用 User 或伪造 actor 均被拒。
3. 伪造 request body 的 owner/user/entity/grant 字段不能扩大权限；Person/User 绑定、SceneParticipant 与 Space membership 本身不授予访问。
4. 缺少 grant、缺少匹配 envelope、部分写入、revoked 状态、key/grant version 不匹配时，在线读均默认拒绝。
5. 收件人所有修改请求都被拒绝；Entity 的唯一事实和生命周期仍由拥有者维护。
6. revoke 确认后，recipient 的后续在线读取/同步失败；owner 的后续版本使用新 Content Key。之前已下载副本按产品边界保留。
7. 离线收件人副本显示最后确认时间；恢复在线后及时应用授权状态，不把未确认的本地缓存冒充当前授权。
8. Envelope 篡改、错误用户/Entity 绑定、重放、降级和密钥变化在客户端与 Worker 两侧按独立审查确定的机制拒绝。
9. 共享 Entity 不会出现在首版以外模块、Search、Graph、AI Context、自有 Entity 数据、常规备份或 Vault 导出中。
10. 日志与 D1 仅含批准的控制面元数据和密文，不含 Entity 标题、类型、Scope 条件、密钥、正文或错误响应中的明文。

## 9. 交付顺序与发布门槛

1. **设计审阅：** 用户审阅本文；修改完成后再生成实施计划。
2. **密码学审查：** 独立审查人确认收件人 key identity、协议 suite/library、恢复/设备更换、撤权轮换、重放与降级策略；关闭 blocker。兼容验证按 §10 已确认的分享能力支持矩阵执行。
3. **单 Entity 只读实现：** 先实现控制面授权、密文+recipient envelope 同步、独立只读视图、撤权/轮换和离线状态；默认隐藏入口。
4. **安全验收：** 用两位 User 和隔离数据验证 §8 中的越权、失败关闭、撤权、旧副本和日志边界；独立审查报告保持附档。
5. **真实试点与隐私评审：** 验证用户是否理解收件人、只读动作、元数据可见性、核验步骤与撤权限制。密码学审查通过不等于可以默认上线。
6. **后续阶段：** 只有单 Entity 切片通过后，再分别设计 comment/edit、Scene 邀请、Space Scope、Search/Graph/AI 和导出接入；不得把首版扩张成隐含全域共享。

## 10. 未决且不得自行假定的事项

### 已确认的首版分享能力支持矩阵

- 桌面：Windows 11 上最新及前一主版本的 Chrome、Edge；macOS 上最新及前一主版本的 Safari、Chrome。
- 移动端：iOS 上最新及前一主版本的 Safari；Android 上最新及前一主版本的 Chrome。
- Firefox 暂不属于 Phase B 首版分享能力的支持范围；这不改变 Calmy 其他功能已有的兼容范围。
- “最新及前一主版本”按每次发布验收时的稳定版记录具体版本号；安全审查和发布验证须覆盖该矩阵，验证 IndexedDB 中 CryptoKey 的持久化/恢复以及所选密码库和算法的能力。审查若要求调整范围，应先更新本文与计划。

#### 版本快照（2026-09-30，官方发布记录）

以下版本用于独立审查和后续兼容性测试的初始目标，不表示 Calmy 已通过测试。正式实现/发布前必须刷新版本并保存设备、系统、浏览器完整 build、测试结果和日志。

| 平台与浏览器 | 最新稳定版目标 | 前一主版本目标 | 备注 |
| --- | --- | --- | --- |
| Windows 11 / Chrome | 154.0.8037.58 | 153.0.8010.48 | Windows 桌面版；Chrome 155 在 9 月 23 日仅进行 early stable 小比例推送，不作为此快照的广泛稳定版。 |
| macOS / Chrome | 154.0.8037.58 | 153.0.8010.48 | macOS 桌面版。 |
| Windows 11 / Edge | 154.0.4258.37 | 153.0.4234.32 | Edge 官方稳定频道记录。 |
| macOS / Safari | 26.6.1 | 18.6 | Safari 26.6.1 适用于 macOS Sonoma/Sequoia；Safari 18.6 适用于 macOS Ventura/Sonoma。应分别在可获得的支持系统上测试并记录系统 build。 |
| iOS / Safari | iOS 26.6.2 | iOS 18.7.10 | iOS 主版本承载 Safari/WebKit 版本；iOS 18.7.10 适用于 Apple 列出的较旧 iPhone 型号，设备型号需随测试一并记录。 |
| Android / Chrome | 154.0.8037.57 | 153.0.8010.47 | Google Play 分阶段推送；需记录实际设备收到的完整版本和 Android 版本。 |

官方来源： [Chrome 154 桌面稳定版](https://chromereleases.googleblog.com/2026/09/stable-channel-update-for-desktop_0856730748.html)、[Chrome 153 桌面稳定版](https://chromereleases.googleblog.com/2026/09/stable-channel-update-for-desktop_0808145027.html)、[Chrome 9 月发布记录（含 Android）](https://chromereleases.googleblog.com/2026/09)、[Edge 稳定频道版本计划](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-release-schedule)、[Apple 安全版本记录](https://support.apple.com/en-asia/100100)、[Safari 26.6.1](https://support.apple.com/en-us/148286)、[Safari 18.6 发布记录](https://support.apple.com/en-afri/100100)。

这些是按日期查得的测试目标，不是对 Apple 旧 Safari/iOS 设备可采购性或 HPKE 库兼容性的判断。独立审查人应确认前一主版本的实际可获得环境；不能获得时须记录限制并提出等效验证方案，不能把模拟器测试写成真机结果。

- ADR-002 最终是否要求防服务端主动替换首次公钥，以及 B 人工核验能否满足目标。
- 首版是否采纳当前建议的工作边界：信任 Cloudflare Pages/浏览器客户端交付链及用户终端，保护范围包括服务端存储泄露和未经授权的 API 读取，但不包括主动投放恶意客户端代码；若产品要求包含该攻击，需先补充客户端完整性方案与上线门槛。
- 独立审查认可的 HPKE 套件或其他标准协议、维护库、key encoding、AAD 和安全码绑定格式。
- IndexedDB CryptoKey 持久化、恢复及密钥生命周期在 §10 支持矩阵中的实际验证结果。
- Worker grant+envelope 的具体数据库事务、历史 key version 保留期限及内容 tombstone 协议。
- 收件人缓存的清除策略和明确触发点；无论如何都不能承诺远程抹除已下载明文。
- 真实用户试点如何招募、记录与隐私评审如何批准。

## 11. 自审记录

- 已对照身份与产品访问设计 §4–§6、§8–§13、ADR-001、Phase B 前置计划和 ADR-002；单 Entity 只读范围没有把 Scene/Space 成员隐式升级为权限。
- 已区分控制面授权和加密语义；服务端只看不透明 ID、授权和版本，客户端负责解密语义。
- 已确认产品支持矩阵；公钥目录与浏览器客户端代码交付的威胁边界、独立密码学审查、浏览器兼容验证和真实用户试点仍未完成；未将候选算法或上线状态写成已确认事实。
- 本文是待审阅设计，不是授权实现或已完成安全评审的声明。
