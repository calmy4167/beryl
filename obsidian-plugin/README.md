# Calmy Open Workspace Obsidian Adapter

这是 Obsidian 侧的最小插件骨架，当前提供：

- 命令面板与 Ribbon 图标：Validate Calmy Open Workspace；
- 读取当前 Vault 并运行 Open Format 校验；
- Markdown / manifest 变化后的防抖重新校验；
- 使用 Calmy 主仓库中的 Vault Adapter 和 Open Format。
- 预留并复用 `src/core/content/companion-bridge.ts` 的版本化消息契约。

当前没有伪造自动双向同步：插件尚未连接 Calmy Web 应用的 companion bridge，因此不会未经确认写回业务实体。下一阶段再加入显式“导入预览 → 冲突决策 → 写回”命令。

Bridge 当前只定义协议和校验器，不打开本地网络端口；插件仍然只做 Vault 校验和变化观察。

插件实例提供 `handleCompanionMessage(input)` 和 `attachCompanionPort(port)` 两个接入点。前者适合宿主自行调度消息，后者会把一个已授权的 `MessagePort` 接到带请求去重的 `CompanionBridgeSession`，并返回可调用的 detach 函数。

如果宿主应用明确传入 `MessagePort`，可配合 `src/core/content/companion-bridge-transport.ts` 使用；插件本身不会创建端口或监听网络。

## 构建

在本目录执行：

    npm install
    npm run build

然后将 manifest.json、main.js 复制到 Vault 的 .obsidian/plugins/calmy-open/ 目录，并在 Obsidian 设置中启用插件。
