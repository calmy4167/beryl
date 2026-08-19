# Calmy Obsidian Vault Adapter 协议

## 目标

让 Obsidian Vault 成为可读写的开放工作区，但不让文件系统直接绕过 Calmy 的领域规则。

Adapter 只负责：

- 读取 Vault 中的 Markdown、manifest 和 assets；
- 将文件转换为 Calmy Open Format；
- 按稳定 ID、revision、hash 触发导入预览；
- 将已确认的 Open Workspace 写回 Vault。

Adapter 不负责：

- 直接决定本地实体是否被覆盖；
- 绕过领域 Repository 写入数据；
- 自动删除文件；
- 将 .obsidian 配置当作业务数据。

## 文件分类

| 路径 | 类型 | 处理方式 |
|---|---|---|
| *.md | 实体文件 | 读取文本并解析 YAML frontmatter |
| _calmy/manifest.json | Open Format 清单 | 最后写入，保存实体和附件 hash |
| assets/* | 二进制附件 | 读取 bytes，按路径和 hash 校验 |
| .obsidian/* | Obsidian 配置 | 忽略，不进入 Calmy 数据 |

## 写入顺序

实体 Markdown → assets/* → _calmy/manifest.json

manifest 最后写入，避免 Vault 在中间状态被识别为完整快照。

## 冲突规则

- 相同稳定 ID、内容相同：unchanged。
- 新稳定 ID：added。
- 相同稳定 ID、内容不同：进入冲突审阅。
- 相同附件路径、hash 不同：阻断导入。
- 缺失附件引用：阻断导入。
- 孤儿附件：提示但不自动删除。
- Vault 文件改名或移动：以 calmy_id 和 hash 识别，不以路径作为身份。

## 当前实现

代码位于 src/core/content/obsidian-adapter.ts：

- readVaultSnapshot()：读取并解析 Vault；
- syncWorkspaceToVault()：幂等写入；
- watchVault()：带防抖的文件变化监听边界。

当前 Adapter 是平台无关的接口层，后续 Obsidian 插件只需要实现 VaultAdapter 的读写与事件桥接，不需要复制 Calmy 的领域逻辑。

## Companion Bridge 边界

Web 与插件之间的消息契约单独定义在 `Calmy_Obsidian_Companion_Bridge协议_2026-08-19.md`，代码位于 `src/core/content/companion-bridge.ts`。Adapter 负责 Vault 文件读写，Bridge 只负责版本化消息、请求关联和用户确认后的冲突决策传递；两者都不能跳过领域 Repository。
