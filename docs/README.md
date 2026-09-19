# Calmy 文档中心

> 状态：当前入口 · 更新日期：2026-09-19

本页是仓库文档的唯一入口。文档是否仍有约束力，以[文档登记册](product/DOCUMENT_REGISTER.md)为准；文件存在不代表其仍是当前产品规范。

## 先读这五份

1. [当前产品总设计](product/CALMY_PRODUCT_DESIGN_2026-09-19.md)：人与世界之间的反思层、未来回望、双循环、外部工具边界与迁移原则。
2. [产品决策](product/PRODUCT_DECISIONS_2026-08-19.md)：已接受决策、实验假设、废弃方向和变更纪律；D-018 定义最新产品本体。
3. [当前未完成工作](product/OPEN_WORK.md)：唯一活跃的产品/工程待办和停止线。
4. [工程评审](product/ENGINEERING_REVIEW_2026-08-22.md)：代码差距、风险和目标架构。
5. [实现总档案](implementation/IMPLEMENTATION_BASELINE_2026-08-19.md)：当前实现事实与验证证据。

旧 [Attention OS 统一设计](product/CALMY_UNIFIED_PRODUCT_DESIGN_2026-08-29.md)继续解释现有四入口、页面和兼容对象，但不再定义新增功能的产品本体。2026-09-19 的[文档与界面统一审计](product/DOCUMENT_AUDIT_2026-09-19.md)仍是当时实现快照。

项目代码、运行时入口和文件放置规则见[项目文件架构](PROJECT_STRUCTURE.md)。

产品迁移的活跃入口是 [OPEN_WORK](product/OPEN_WORK.md) 中的 OW-21。飞书生活工作台仍是外部数据源规划提案，不自动成为新产品主线。

## 文档目录

- `docs/product/`：当前产品、UI、视觉资产、路线图、评审和唯一未完成清单。
- `docs/product/CALMY_PRODUCT_DESIGN_2026-09-19.md`：当前产品本体与迁移方向。
- `docs/product/CALMY_UNIFIED_PRODUCT_DESIGN_2026-08-29.md`：Attention OS 现有实现与迁移参考。
- `docs/product/reference/`：旧版 MVP、领域模型、协议和测试参考。
- `docs/product/reference/Calmy_Feishu_数据适配与授权协议_2026-09-19.md`：飞书多维表格接入、授权、字段映射和多人扩展边界。
- `docs/product/FEISHU_OFFICIAL_CAPABILITY_CHECKLIST_2026-09-19.md`：飞书官方多维表格能力同步清单、适配状态和后续验收。
- `docs/product/source/`：只读原始产品设计 DOCX。
- `Obsidian_calmy/`：思想母本与模块化扩展语料；库内自身双向同步，但执行裁决仍服从产品决策和统一总设计。
- `docs/implementation/`：实现事实和验证证据。
- `docs/operations/`：当前工程交接索引。
- `docs/history/`：Beryl 历史设计与代码审查。
- `prototypes/`：未接入生产入口的一次性原型脚本。

## 权威层级

```text
2026-09-19 当前产品总设计 + D-018
  ↓
已接受的其他产品决策
  ↓
2026-08-29 Attention OS 迁移参考
  ↓
当前未完成工作（唯一活跃任务）
  ↓
工程与实现档案（只描述当前代码事实）
  ↓
旧参考与历史文档
```

发生冲突时，先遵循当前产品总设计和 D-018；现有数据安全、AI 判断权与迁移约束继续遵循未被替代的已接受决策。实现状态必须以代码和可复现验证为证据，不能用文档方向更新宣称新产品已经完成。

## 维护规则

- 新功能先更新产品决策与验收标准，再进入代码。
- UI 不得直接扩展领域范围；试验能力默认放入“更多”或设置中的实验区。
- “已有页面”“已有类型”“测试通过”都不等同于产品闭环已经可用。
- 领域模型、协议和产品决策作为参考证据保留；已完成或已废弃的任务文档不再作为活跃入口，统一合并到 `docs/product/OPEN_WORK.md` 后删除或标记为历史。
