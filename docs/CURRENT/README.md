# Calmy：当前工作文档

> 更新：2026-10-05。这里是短入口和阶段快照，不取代各专题的原始决策、协议或设计文档。产品方向仍可根据雏形验证调整。

## 阅读顺序

1. [当前产品假设](01-product.md)：现在在探索什么，哪些内容尚未定型。
2. [决策索引](02-decisions.md)：已接受的决策在哪里，哪些是产品选择、哪些是必须守住的数据边界。
3. [雏形范围与暂缓清单](03-prototype-scope-and-backlog.md)：先完成什么，什么不需要现在做。
4. [实现状态](04-implementation-facts.md)：功能在代码中的实际状态和当前无法确认的事项。
5. [硬约束](05-boundaries.md)：改前后端前检查的数据、安全和兼容边界。

## 权威来源

- 产品决策全文：[`docs/product/PRODUCT_DECISIONS_2026-08-19.md`](../product/PRODUCT_DECISIONS_2026-08-19.md)。
- 当前产品设计原文：[`docs/product/CALMY_PRODUCT_DESIGN_2026-09-19.md`](../product/CALMY_PRODUCT_DESIGN_2026-09-19.md)。它是当前工作假设，不等同于已经通过真实用户验证的最终方向。
- 零知识边界：[`docs/adr/ADR-001-content-zero-knowledge-with-visible-access-metadata.md`](../adr/ADR-001-content-zero-knowledge-with-visible-access-metadata.md)。
- 多人模型基准：仓库根目录 [`Calmy-多人场景-模块关系与数据共享核心设计方案.md`](../../Calmy-多人场景-模块关系与数据共享核心设计方案.md)；D-021 已把它排在雏形工作之后。
- 完整历史待办与实现记录：[`docs/product/OPEN_WORK.md`](../product/OPEN_WORK.md)。本目录的雏形清单用于当前优先级；旧清单中的计划不能自动视为当前承诺。
- 全文档登记册：[`docs/product/DOCUMENT_REGISTER.md`](../product/DOCUMENT_REGISTER.md)。

## 状态语义

- **已实现**：代码中有可追踪的生产路径；不自动代表部署完成或通过真实用户验收。
- **部分实现/原型**：已有代码，但覆盖、闭环或验收仍有限。
- **未实现**：当前代码中缺少所需能力。
- **待外部验证**：需要线上环境、真实账号/数据、设备或参与者才能确认。
- **暂缓**：方向未定前不投入；保留文档和恢复线索，不代表永久放弃。

## 维护规则

- 变更产品方向先更新决策与范围，再更新专题设计；不要把设计稿存在写成实现完成。
- 每次功能状态更新写明日期、代码证据和验证边界；未运行的验证明确标出。
- 旧方案和协作计划留在原处，通过登记册标状态。本轮不要求移动或删除历史文件。
