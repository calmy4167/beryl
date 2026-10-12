# Calmy 文档中心

> 当前文档入口 · 更新：2026-10-05

这是仓库文档的唯一导航入口。文件存在不代表其仍定义当前产品或已经实现；各类文档的状态见[登记册](product/DOCUMENT_REGISTER.md)。

## 快速开始

1. [当前工作文档](CURRENT/README.md)：雏形方向、决策索引、暂缓项、实现状态和硬约束。
2. [文档整理审计](DOCUMENT_CONSOLIDATION_2026-10-05.md)：全量文档清单、实现/未实现证据、审计日期和已知矛盾。
3. [项目文件架构](PROJECT_STRUCTURE.md)：代码入口、目录职责和文件放置规则。

## 当前文档来源

| 主题 | 权威来源 | 用途 |
|---|---|---|
| 当前产品假设 | [产品总设计](product/CALMY_PRODUCT_DESIGN_2026-09-19.md) + D-018 | 当前方向基线；仍需真实场景验证 |
| 产品决策 | [决策记录](product/PRODUCT_DECISIONS_2026-08-19.md) | 已接受决策、实验假设、废弃方向；D-021 为当前阶段优先级裁决 |
| 雏形优先级 | [CURRENT/03](CURRENT/03-prototype-scope-and-backlog.md) | 当前“先做/可暂缓”清单；不是永久路线图 |
| 实现事实 | [CURRENT/04](CURRENT/04-implementation-facts.md) | 带日期的代码状态快照，不宣称线上部署或真实用户验收 |
| 安全/数据边界 | [CURRENT/05](CURRENT/05-boundaries.md)、[ADR-001](adr/ADR-001-content-zero-knowledge-with-visible-access-metadata.md) | 修改前端、业务层或后端前核对 |
| 多人模型基准 | [核心设计方案](../Calmy-多人场景-模块关系与数据共享核心设计方案.md) + D-021 | 保留为未来参考；不要求雏形全面达标 |
| 全文档状态 | [文档登记册](product/DOCUMENT_REGISTER.md) | 文档权威性、过期状态与目录索引 |

## 其他资料

- `docs/product/`：产品方案、决策、长篇任务记录、协议和参考资料。详细状态见登记册。
- `docs/adr/`：架构决策记录。ADR-001 已接受；ADR-002 仍是提案，不能当作已实现能力。
- `docs/superpowers/`：设计规格、实施计划、迁移台账等历史协作材料。计划文件不自动表示工作仍排期或已经完成。
- `docs/implementation/`、`docs/operations/`：实现快照与运行手册；使用前核对日期和登记状态。
- `docs/history/`：Beryl 等历史材料。
- `docs/security/`：安全审查和审查模板。
- `docs/product/source/`：只读原始设计来源。
- `Obsidian_calmy/`：理念母本和候选产品语料，作为只读参考；不自动成为产品决策或代码待办。
- `obsidian-plugin/`：独立插件说明；不等同于 Companion Bridge 已联通。
- `prototypes/`：非生产原型。

## 维护约定

- 先改产品决策/范围，再改专题设计；实现状态只根据可定位代码和带日期的验证证据更新。
- 已完成、过期、暂缓的文档保留原位置并在登记册标注；本轮不批量移动或删除文件。
- “有页面、有类型、有测试”不等于完整用户闭环；线上部署和真实用户验证单独标注。
- 新增正式文档时，在登记册加入状态、用途、权威来源和复查条件。
