# Calmy Obsidian Companion Bridge 协议

## 定位

Companion Bridge 是 Calmy Web 与 Obsidian 插件之间的消息契约层。

当前阶段只固定消息格式、版本和校验规则，不启动本地端口，也不隐式建立跨应用连接。真实传输层可以在后续选择 `postMessage`、本地应用桥或用户明确授权的其他方式，但传输层不能改变领域规则。

代码位于 `src/core/content/companion-bridge.ts`。

## 通用字段

每条消息都包含：

| 字段 | 类型 | 规则 |
|---|---|---|
| `bridge_version` | `1` | 当前唯一支持的协议版本 |
| `message_id` | string | 每条消息唯一，用于日志和去重 |
| `kind` | string | 消息类型 |

请求/响应类消息额外使用 `request_id` 关联一次交互。

`workspace_export` 和 `workspace_import_apply` 的 `workspace` 使用可序列化结构：Markdown 放在 `files`，附件放在 `assets`，附件 bytes 使用 Base64 的 `data_base64`。这样传输层可以使用普通 JSON，不需要直接传递 `Uint8Array`。

## 消息类型

| kind | 方向 | 用途 |
|---|---|---|
| `hello` | 双向 | 声明客户端身份和能力 |
| `workspace_export_request` | Calmy Web → 插件 | 请求获取当前 Vault 快照摘要 |
| `workspace_export_offer` | 插件 → Calmy Web | 返回 manifest hash、实体数和附件数 |
| `workspace_export` | 插件 → Calmy Web | 返回完整的 JSON 安全 Workspace 快照 |
| `workspace_import_preview` | 任一侧 → 另一侧 | 传递 added / unchanged / conflict 及附件问题 |
| `workspace_import_apply` | Calmy Web → 插件 | 携带用户确认后的冲突决策 |
| `ack` | 双向 | 表示请求已处理 |
| `error` | 双向 | 返回稳定错误码和可读消息 |

## 冲突决策

`workspace_import_apply.decisions` 的 key 是稳定实体 ID，value 只能是：

```ts
'keep-local'
```

```ts
'use-incoming'
```

```ts
{
  mode: 'merge',
  fields: {
    title: 'use-incoming',
    status: 'keep-local'
  }
}
```

未出现在 decisions 中的冲突不能被默认覆盖。字段合并同样必须逐字段给出选择；没有选择的字段不应写回。

## 校验与兼容性

- 版本不为 `1` 时拒绝解析，并返回 `bridge-version-unsupported`。
- `message_id`、`request_id`、稳定 ID、路径和错误字段必须是非空字符串。
- 数量字段必须是非负整数。
- 冲突决策只允许 `keep-local`、`use-incoming` 或合法的 `merge`。
- 未知 `kind` 必须拒绝，避免把新消息误当成旧消息处理。
- 解析器不负责执行写入；它只负责把外部输入转换成可信的协议对象。

## 后续接入边界

1. 插件读取 Vault，使用 Open Format 生成导出摘要。
2. Calmy Web 展示导入预览，并在用户确认后生成 decisions。
3. 传输层发送 `workspace_import_apply`。
4. 插件仍须经过 Open Format 校验和 Calmy Repository 规则，不能因为消息已校验就绕过领域层。
5. 写入完成后返回 `ack`；失败时返回带 `request_id` 的 `error`。

运行时实现位于 `src/core/content/companion-bridge-runtime.ts`：

- `CompanionBridgeSession`：按 `message_id` 做响应去重；
- `buildWorkspaceImportPreview()`：生成实体、附件、缺失引用和孤儿附件预览；
- `applyWorkspaceImportToVault()`：要求所有实体冲突都有显式决策，附件冲突或 manifest 问题直接阻断写回；
- 写回沿用 Adapter 的实体 → assets → manifest 顺序，并尽量保持既有实体路径，避免改标题产生重复实体文件。

Web 侧客户端位于 `src/core/content/companion-bridge-client.ts`：

- `CompanionBridgeTransport` 只要求 `send()` 和 `subscribe()`，不规定具体通信方式；
- `CalmyWebBridgeClient.requestVaultWorkspace()` 请求 Vault 快照并返回本地对比预览；
- `applyWorkspaceToVault()` 只发送用户已经确认的 decisions，远端错误会以异常返回；
- 当前没有默认网络实现，避免插件或网页在用户不知情时建立连接。

标准端口适配器位于 `src/core/content/companion-bridge-transport.ts`：

- `createMessagePortTransport()` 只接受外部明确传入的 `MessagePort`；
- 入站数据必须先通过 `parseCompanionMessage()`，无效消息会丢弃并交给可选错误回调；
- `close()` 会移除监听、清空订阅并关闭端口；
- 该适配器不创建端口、不监听端口、不连接网络，端口的创建和授权由宿主应用负责。

插件端可以使用 `attachCompanionBridgeSession(port, session)` 自动完成消息转发，并通过返回值 detach。Obsidian 插件的 `attachCompanionPort(port)` 已封装这一生命周期，插件卸载时会主动解除监听并关闭端口。

第一版不包含自动后台同步、自动冲突覆盖、自动删除 Vault 文件和未授权网络监听。
