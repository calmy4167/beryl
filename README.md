# Calmy

Calmy 是人与世界之间的反思层：帮助人看见自己正在面对什么，在行动之前经历可能的未来，在行动之后看见这段经历把自己变成了什么。

## 当前文档入口

请从 [`docs/README.md`](docs/README.md) 开始；当前产品本体见 [`docs/product/CALMY_PRODUCT_DESIGN_2026-09-19.md`](docs/product/CALMY_PRODUCT_DESIGN_2026-09-19.md)，产品演进裁决见 [`docs/product/PRODUCT_DECISIONS_2026-08-19.md`](docs/product/PRODUCT_DECISIONS_2026-08-19.md)。旧 Attention OS 总稿保留为当前代码与迁移参考，不再定义新增功能的产品本体。

原始完整产品设计 DOCX 保持只读，位于 `docs/product/source/`；Beryl 历史文档位于 `docs/history/`，工程交接位于 `docs/operations/`，它们都不再定义当前产品。

## 当前方向与实现边界

- 产品从“我正在面对什么”出发，通过日常快速处理和重要问题的深度反思连接人、现实、决定、外部工具与结果。
- “提前后悔”采用平衡的未来回望：同时看见行动与不行动可能带来的后悔和庆幸；模拟是可修改的情境，不是预测。
- Word、Excel、IDE、Obsidian、Calendar、浏览器和通信工具继续承担专业工作；Calmy 负责保存它们为何与同一个人和处境有关。
- 当前代码仍以 Today、Capture、Matters、Review 及既有领域对象运行；这些属于迁移兼容层，不能据此推断新总设计已经实现。
- 设置与同步只有一个主入口：`/#/app/admin`。它集中承载备份、Cloudflare / S3 / 本地文件同步、诊断、Obsidian Vault 与实体迁移；旧 `/#/app/admin/advanced` 只保留兼容地址并显示同一界面。
- 不复制成熟专业软件，不把哲学术语做成页面，不让所有日常选择进入深度思考，也不把 AI 模拟或长期模式包装成事实。

当前未完成工作以 [`docs/product/OPEN_WORK.md`](docs/product/OPEN_WORK.md) 为唯一活跃入口；实现证据见 [`docs/implementation/IMPLEMENTATION_BASELINE_2026-08-19.md`](docs/implementation/IMPLEMENTATION_BASELINE_2026-08-19.md)。不得仅凭页面或测试数量宣称产品完整完成。

项目代码和文件职责见 [`docs/PROJECT_STRUCTURE.md`](docs/PROJECT_STRUCTURE.md)。

2026-09-19 的文档与界面统一审计见 [`docs/product/DOCUMENT_AUDIT_2026-09-19.md`](docs/product/DOCUMENT_AUDIT_2026-09-19.md)。
