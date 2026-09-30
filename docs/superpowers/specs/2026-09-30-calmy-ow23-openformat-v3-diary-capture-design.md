# Calmy Open Format v3：Diary 与 Capture 设计

> 日期：2026-09-30  
> 状态：待产品负责人审阅  
> 关联：OW-23 Portable Vault；[开放数据与 Portable Vault 架构设计](../../product/CALMY_OPEN_DATA_AND_PORTABLE_VAULT_2026-09-24.md)

## 1. 目标

在现有 Portable Vault / Open Format 中可读、导出、预览冲突并安全回导 Diary 与原始 Capture，同时继续读取 Open Format v1、v2 文件。复用现有 `diary` 与 `calmyCaptures` 集合和 Repository；不迁移数据、不新增第二份事实存储，也不改变 Capture 转化为 Matter、Action、Record 或 Resource 的业务流程。

## 2. 决策

- 导出使用 `format_version: 3`、`b_version: 3`。导入继续读取 v1、v2、v3；不支持的版本必须明确报错。v1/v2 文件的字段和路径契约保持不变。旧客户端不保证识别 v3；不得把 v3 Vault 交给旧版读取器写回。
- v3 增加 `diary`、`capture` 两个 `calmy_type`。AI `Suggestion` 及候选、推理理由和模型元数据不进入本次便携格式。
- 新格式的 identity 沿用 Manifest 的 `(calmy_type, calmy_id)`。Diary 使用 `diary_<YYYY-MM-DD>` 的确定性 ID；Capture 保留 `CaptureItem.calmyId`。两者使用分开的类型目录和文件名。
- 仍用 `payload_json` 兼容 Calmy 恢复，并同时输出人可读字段与正文。导入时优先采用可读字段；旧格式兼容规则不变。
- 导入只进入既有集合与冲突确认路径。不会通过删除/重建整组集合来完成导入；无效字段、重复身份或无法安全合并时报告冲突/错误并保留原数据。

## 3. Diary 表达

`diary` 文件表达一条按日期保存的旧日记记录，映射到现有 `b_diary` 集合：

- `calmy_id`: `diary_<date>`，`calmy_type: diary`。
- 可读 frontmatter：`date`、`revision`、可选 `source_material_ids`。
- Markdown 正文：`DiaryEntry.content`；兼容载荷只包含已支持的 Diary 字段。
- 路径形如 `80 Daily/Diary__diary_<date>.md`，与 `daily`（TodayPlan）使用的 `<date>.md` 分开。
- `DiaryEntry.revision` 新增为可选字段。旧记录缺少时读取为 0；Diary 页面每次成功保存递增 revision。导入的新记录保留文件 revision；对既有日期的替换/合并仍需用户决策。
- 日期必须符合 `YYYY-MM-DD`，无效日期不作为合法身份导入。缺少内容的空日记不导出，避免产生空文件；外部 Markdown 明确导入为空正文时仍作为有效用户内容处理。

## 4. Capture 表达

`capture` 文件表达用户保存的原始输入，不表达 AI 建议或已创建的目标实体：

- `calmy_id`: 原始 `CaptureItem.calmyId`；`calmy_type: capture`。
- 可读 frontmatter：`status`、`created_at`、`updated_at`、`revision`、可选 `source_material_ids`。
- Markdown 正文和兼容载荷保存 `CaptureItem.body` 的当时快照。
- `suggestionIds`、Suggestion 内容/状态、模型和推理元数据不导出；这些不属于 v3 Capture 文件的字段契约。
- 新导入 Capture 的本地 `suggestionIds` 为空。把文件应用到已有同 ID Capture 时，未在便携类型中表达的本地 `suggestionIds` 必须保留，不因“使用 Vault 版本”而被清空。
- Capture 状态必须属于已有固定状态集合；未知状态会列为导入问题，不静默改成默认状态。`source_material_ids` 保留 Resource 稳定 ID；缺失来源可以产生可审阅提示，不得丢掉正文或改写 ID。

## 5. Repository 与冲突行为

- 导出来源：Diary 通过当前 `DiaryPage` 使用的 `diary` Repository；Capture 通过现有 Capture Repository。Portable 表达只映射现有字段，不写回业务数据。
- 导入应用：Diary 按日期 upsert 到同一个 `diary` 集合；Capture 通过 Capture Repository 按 `calmyId` 导入/替换，并保留未便携的本地 Suggestion 引用。导入必须继续经过 Open Workspace 现有比较、决策及 durable Repository 写入边界。
- 同 ID、内容不同的项目进入现有冲突预览；字段合并只允许在类型 schema 声明的字段内进行。Capture 的 `suggestionIds` 不可被 Vault 字段决策覆盖。
- Manifest tombstone 使用 `calmy_type` + `calmy_id` 识别。Diary 的 tombstone 不会误删同日 TodayPlan；Capture tombstone 不会删除它创建的 Matter/Action/Record/Resource。
- `calmy_id` 的重复检查和 Vault 路径/冲突映射需把类型纳入身份键；旧 v1/v2 Manifest 缺少同类型重复时按原映射规则读取。

## 6. 明确不做

- 不导出或导入 AI Suggestions；不把接受 Suggestion 创建的实体与 Capture 合并为同一个对象。
- 不纳入 Finance 交易、旧 Tasks/Goals 等其他集合或所有 localStorage 数据。
- 不做全目录扫描策略、自动目录监听、文件夹权限改造或附件对象存储设计。
- 不重写现有 IDs、Repository 键、Capture 正文、Diary 历史文本、Source Material 或被 Capture 创建的目标实体。
- 不因 Open Format v3 而自动覆盖用户文件；仍须使用当前扫描、差异预览、显式冲突决策和 Manifest 最后提交流程。

## 7. 验收标准

1. v3 导出包含 Diary 与 Capture，正文可由普通 Markdown 工具读取；未增加的 Suggestion 或运行/凭证数据不会出现在导出文件。
2. v1/v2 导入继续有效；v3 新类型可解析；不支持版本、重复 `(type,id)`、错误日期和未知 Capture 状态能被明确报告，不造成静默覆盖。
3. 导入/替换回到既有 `diary`、Capture 集合；旧记录缺少 revision/source IDs 仍可读；旧 IDs 与路径不被重写。
4. Capture 更新/删除不清空本机 Suggestion 关联，不级联修改其接受后生成的业务实体；Diary tombstone 与 TodayPlan 互不影响。
5. Vault 扫描和冲突决策使用类型化身份，导入前不写入，应用失败不推进成功 Manifest；合法外部编辑仍可审阅并按明确决策应用。
6. OW-23/OPEN_WORK 明确说明 v1/v2 旧客户端互操作限制与这一批实体边界，不把本切片宣称为全部长期资产已可移植。

## 8. 风险与兼容

- 旧版客户端拒绝 v3 格式是显式版本边界；应用需在格式说明和版本错误中提示升级，不能尝试降级解析后写回。
- Diary 的旧数据没有可靠的单调 revision；可选 revision 从新保存开始增长，内容 hash 仍是外部变化检测依据。
- 外部文件可引用不在 Vault 内的 Resource ID。引用 ID 保留原值并提示缺失，不自动创建占位 Resource。
- 当前全局身份映射曾主要按 `calmy_id` 建索引。v3 实现必须在 Open Format 比较、Manifest 路径/tombstone 查找、Vault 冲突决策中使用类型化 identity，避免新类型与旧类型 ID 偶合时错配。

## 9. 自审记录

- 旧 v1/v2 读入保持原行为，导出升级到 v3 是单向版本边界，符合 §6 的显式格式升级要求。
- Diary 不与 TodayPlan 共用文件路径或 tombstone identity；Capture 不携带无法解析的 Suggestion 外键。
- 未增加持久化事实来源、账户字段、凭证、权限句柄或附件复制流程。
- 用户批准的范围为 Diary + Capture；Suggestion、Finance 与其他遗留集合仍明确排除。
- 真实文件夹的用户授权、外部应用往返和浏览器重启恢复仍是后续实证工作，本设计不会将本地构建当作这些验收的替代品。
