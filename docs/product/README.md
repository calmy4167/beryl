# Calmy 统一产品设计包

> 产品设计对齐：2026-08-29。统一产品方向以 `CALMY_UNIFIED_PRODUCT_DESIGN_2026-08-29.md` 为准；已完成实现与剩余任务分别以实现总档案和 `OPEN_WORK.md` 为准。

这组文档把《身在网络，活在现实》、原始产品主档案、2026-08-19 执行文档、2026-08-22 重设计和当前实现放在同一个框架下。统一设计不推翻四入口、Reality 闭环和现有事实源，而是将它们收敛到“保护注意力、尊重身体、返回现实、保留判断权”的 Attention OS。

## 当前裁决

- 产品只承诺一条首版闭环：捕捉现实、建立课题、选出今日最小行动、记录真实结果、调整下一步。
- 主导航收敛为 `Today / Capture / Matters / Review`；全局搜索作为工具，不作为主页面。
- People、Library、Calendar 为二级上下文；Graph、共享空间、场景、十神工具箱和旧模块退出默认体验。
- 五行、Cycle、Stage、Trajectory 保留为领域能力，但默认用自然语言和渐进披露呈现。
- 在 React 生产主路径及仍纳入发布范围的扩展页面完成异步持久化边界、真实离线恢复和人工可访问性检查前，不宣称“完整实现”；Vue 兼容层的退出由 OW-06 单独管理。
- 沉浸流 / Flow 作为受控二级能力整合：用于把用户已有内容在合适时机重新带回现实语境，不替代核心四页、不默认无限浏览、不以停留和消费量作为目标。
- Flow 的来源、统一 Seed 模型、四种模式、自然退出、反沉迷和现实行动验收已经纳入产品主文档、UX 文档和路线图。
- Today 从 Dashboard 进一步收敛为“现在 / 思考 / 轨迹”的 Attention Surface；旧模块仍通过 More 和兼容路由保留。
- Attention Gate 统一处理“现在行动 / Matter / Record / Seed / 放下”，不新增第二套实体事实源。
- 身体只采用可跳过的轻量状态，不建立 Health Dashboard；AI 记忆必须区分 Fact、Reflection、AI Inference、Preference 和 Principle。

## 文件说明

- [统一产品与体验设计](CALMY_UNIFIED_PRODUCT_DESIGN_2026-08-29.md)
- [文档登记册](DOCUMENT_REGISTER.md)
- [旧产品重设计细节](PRODUCT_REDESIGN_2026-08-22.md)
- [旧 UI / UX 重设计细节](UX_UI_REDESIGN_2026-08-22.md)
- [工程评审](ENGINEERING_REVIEW_2026-08-22.md)
- [旧路线图与验收细节](ROADMAP_AND_ACCEPTANCE_2026-08-22.md)
- [产品评审会历史纪要](REVIEW_MEETING_2026-08-22.md)
- [当前未完成工作](OPEN_WORK.md)
- [项目文件架构](../PROJECT_STRUCTURE.md)
- [产品决策](PRODUCT_DECISIONS_2026-08-19.md)
- [产品参考与领域协议](reference/README.md)
- [原始产品设计源](source/README.md)

视觉资产：`assets/calmy-attention-os-ui-v2.png` 是当前设计参考，`assets/calmy-attention-os-ui-v1.png` 是上一版迭代参考；两者均不替代实现验收证据。
