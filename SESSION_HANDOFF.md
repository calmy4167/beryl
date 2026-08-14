# Beryl 项目 — 会话交接文档（2026-08-15 生成）

> **用途**：完整记录本会话的决策、状态、踩坑与待办，供新会话无缝续接。
> **使用方法**：把本文档全文发给新会话（或告知新会话先读 `D:\dsharness\SESSION_HANDOFF.md`）。
> **权威文档**：`DESIGN_README.md`（§1–§15，所有设计/部署/FAQ/更新日志都在里面，本文件是它的"会话级索引"）。

---

## 1. 项目一句话

**Beryl** = 个人管理体系（十神分类哲学 × 深色玻璃风）× 纯前端 + Serverless 云端同步（免费，无服务器）。

## 2. 当前状态快照

| 项 | 值 |
| --- | --- |
| 项目位置 | `D:\dsharness`（**git 仓库根**，v2 单一工程，v1 已删除） |
| 技术栈 | Vue 3 + Vite + TypeScript(严格) + Element Plus + Pinia + Vue Router(hash) |
| 版本 | v2 阶段 1 已完成（全功能平移）；后端沿用 v1 的 `_worker.js` + KV |
| Git 远端 | `https://github.com/calmy4167/beryl.git`，分支 `main`，**已有 3 次提交**（7f91621 / eac66ed / 6ce8466） |
| Cloudflare | Pages 项目 **`beryl-ddk`**（`https://beryl-ddk.pages.dev`）；KV 命名空间 **`beryl-kv`**；Worker `beryl-api`（旧，可弃用） |
| 测试 | node:test 15/15 通过（`npm run test:node`）；vitest 组件测试已写好（`npm test`，需用户本机跑） |
| 数据 | localStorage 键 `b_*`（v1/v2 兼容）；云端在 `beryl-kv` 的 `data` 键 |

## 3. 架构与关键决策（商讨结论）

- **路线**：不用若依/芋道（需 Java 服务器+MySQL，违背零成本）；前端技术栈对齐若依-Vue（Vue3+Element Plus）
- **UI**：Vue 3 + Element Plus + Pinia + hash 路由（已定稿，阶段 1 已按此实现）
- **同步策略**：按条 LWW + 删除墓碑 + 增量传输（**阶段 3 实施**，当前仍是整包快照）
- **云端后端**：Cloudflare D1（SQLite，**阶段 4 实施**；当前用 KV 快照）
- **账号**：本地登录（PBKDF2，每设备独立）+ 云端同步密码（全局唯一，SHA-256 哈希存 KV）
- **增强**：PWA + AES-GCM 加密（阶段 5）
- 四数据模式：本地 / 本地文件(Syncthing) / Cloudflare / S3 兼容云（SigV4 直连，阿里 OSS/腾讯 COS/华为 OBS 均支持）

## 4. 待办清单（按优先级，用户下一步操作）

- [ ] **① 用户自己执行 `git push`**（最新提交 6ce8466 尚未推送；沙箱无 GitHub 凭据，必须用户跑）
- [ ] **② Cloudflare Pages 绑定 KV**：项目 `beryl-ddk` → 设置 → 变量与机密 → KV 命名空间绑定 → `BERYL_KV` → `beryl-kv` → **保存后重新部署**
- [ ] **③ 确认构建配置**：根目录 `/`、构建命令 `npm run build`、输出目录 `dist`（v1 时代可能还是旧配置导致 "root directory not found"）
- [ ] **④ 自检 API**：浏览器打开 `https://beryl-ddk.pages.dev/api/data` → 应返回 `{"error":"unauthorized"}`（405=_worker.js 没进 dist，需重新构建；1101=KV 未绑定）
- [ ] **⑤ 同步密码**：`Invoke-RestMethod -Method Post -Uri "https://beryl-ddk.pages.dev/api/setup" -ContentType "application/json" -Body '{"password":"..."}'`；返回 `already-setup` = v1 时代设过，用旧密码即可
- [ ] **⑥ 本机验证 v2**：`npm run dev` 体验；`npm test`（vitest 组件测试，沙箱跑不了 worker，必须本机）
- [ ] **⑦ 清理**：确认 v2 正常后删 `_v1-backup\`；`v2` 空目录被进程占用删不掉（git 不跟踪空目录，重启后可删）
- [ ] **⑧ 前端连接云端**：v2 后台 →「🔄 数据同步」→「☁️ Cloudflare」→ 地址 `https://beryl-ddk.pages.dev` + 同步密码

## 5. 踩坑记录（重要，新会话必读）

1. **Pages 合体 API 405**：vite build 不会把根目录 `_worker.js` 复制进 `dist/` → Pages 部署后无 API，`/api/*` 返回 405。**已修复**：build 脚本末尾追加 `node -e "const fs=require('fs');fs.copyFileSync('_worker.js','dist/_worker.js')"`（提交 6ce8466）。将来改 `_worker.js` 不要动这步。
2. **Pages "root directory not found"**：根目录配置指向已不存在的 `v2` → 改为 `/`。
3. **沙箱限制（本环境）**：esbuild/vite/vitest worker 需要 spawn/命名管道 → 构建与 vitest 需 `danger-full-access` 审批；**node:test 单进程可跑**（`npm run test:node`）；Chrome headless 也跑不了。
4. **PowerShell 5.1**：不支持 `&&`（用户机器），文档命令均逐行。
5. **快速输入**：Enter 记随想，**1 秒内再按 Enter 转待办**（支持连续敲回车，输入框空也行）；v1 曾因"输入框清空后第二次回车被忽略"修过一次（v1.7.1）。
6. **幽灵上传**：定时器只置 null 未 clearTimeout 会多传一次（v1.8.0 修复）——v2 `sync.ts` 已按正确写法实现。
7. **GitHub 强推**：本地仓库已重置（v1 历史删除），远端曾拒绝推送 → 用户已用 `git push --force` 覆盖成功。
8. **vitest 误收集 node:test 文件**：vite.config `test.include` 限定 `src/**/*.test.ts`；node 测试在 `test/node/`，用 `npm run test:node`。
9. **组件测试**：需 `global.plugins: [router, ElementPlus]` + 先 `router.push`（否则 el-* 解析失败、路由告警）。

## 6. 命令速查

```powershell
# 开发 / 构建 / 测试（项目根 D:\dsharness）
npm run dev          # 本地开发
npm run build        # 构建 → dist（自动含 _worker.js）
npm run test:node    # 核心逻辑测试（15 项，沙箱可用）
npm test             # vitest 组件测试（本机跑）
npm run preview      # 预览构建产物

# Git 常规流程（PS 5.1 逐行）
git add .
git commit -m "说明"
git push
```

## 7. 数据与安全

- 登录密码：`b_auth`（PBKDF2 哈希，每设备独立，首次默认凭据 calmy/cy2024 仅一次，登录后强制改密）
- 会话：`b_session`（30 天记住登录；退出登录在后台）
- 云端同步密码：唯一门禁，SHA-256 哈希存 KV `auth` 键；忘记 → 删 KV 的 `auth` 键后重设
- 备份：`_v1-backup\`（v1 的 index.html/worker.js/文档/测试脚本）
- 敏感提醒：S3 密钥明文存 `b_s3`（建议子账号最小权限）；数据明文 JSON 上云（阶段 5 加密）

## 8. 后续路线图

| 阶段 | 内容 | 状态 |
| ---- | ---- | ---- |
| 1 | 工程化重构（Vue3+TS+Element Plus） | ✅ 完成 |
| 2 | IndexedDB 逐条存储 + 变更日志 + 旧数据迁移 | 待启动 |
| 3 | 增量同步 + 按条 LWW + 删除墓碑（替换整包快照） | 待启动 |
| 4 | `_worker.js` 升级 D1 + 新同步 API（改绑定） | 待启动 |
| 5 | PWA + AES-GCM 加密 | 待启动 |

其他规划/优化：Element Plus 按需引入（主包 1MB→约 300KB）；Worker 改密码接口；云端统一账号（可选）；rclone 方案（文档 §11.6，零代码配合本地文件模式）；若依/芋道已排除（§14.1 有原因）。

## 9. 文档索引（DESIGN_README.md）

- §1-2 概述与文件清单 ｜ §3-4 技术栈与结构 ｜ §5 功能模块详解 ｜ §6 存储架构 ｜ §7-8 视觉与交互 ｜ §9 维护规范（**每次改动必须更新文档+日志**）｜ §10 更新日志（v1.0.0→v1.10.0）｜ §11 GitHub Pages/Syncthing/rclone ｜ §12 安全边界 ｜ §13 Cloudflare 部署（含 FAQ）｜ §14 v2 架构规划 ｜ §15 v2 部署指南

## 10. 给新会话的开场白（可复制）

> 这是 Beryl 个人管理系统的续接会话。请先读 `D:\dsharness\SESSION_HANDOFF.md` 和 `D:\dsharness\DESIGN_README.md`（重点 §14/§15/§10）。当前状态：v2 阶段 1 完成（Vue3+TS+Element Plus，位于 D:\dsharness 根），git 3 次提交未 push（待用户推送），Cloudflare Pages beryl-ddk 待绑定 KV 后云端同步可用。维护规范：每次改 index.html/源码必须同步更新文档 §10 日志并跑 `npm run test:node`。下一步候选：① 陪用户完成部署收尾；② 启动阶段 2（IndexedDB）。
