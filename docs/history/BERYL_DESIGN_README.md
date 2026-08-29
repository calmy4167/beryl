# Beryl 个人管理体系 — 设计与维护文档

> **历史参考**：这是 Beryl 旧体系与迁移来源，不再作为 Calmy 当前产品或 UI 基线。当前入口见 [`../README.md`](../README.md)，状态说明见 [`../product/DOCUMENT_REGISTER.md`](../product/DOCUMENT_REGISTER.md)。

> 本文档是 `index.html` 的完整设计说明与维护日志。
> **维护约定：每次网页有任何改动，必须同步更新本文档**（详见 [第 9 节 维护规范](#9-维护规范强制约定)）。
>
> **历史文档声明（当前有效性）**：第 1–13 节主要记录 v1 单文件/旧 KV 实现；当前仓库是 `D:\dsharness` 的 Vue + 独立 Worker/D1 实现，当前事实以 [`../PROJECT_STRUCTURE.md`](../PROJECT_STRUCTURE.md) 和本文 §17 为准。历史章节中的轮询、KV、QuoteWall 和阶段状态不能作为当前系统说明。

---

## 1. 项目概述

**Beryl** 是一个纯前端、单文件（index.html）的个人管理体系网站，采用深色主题设计，融合中国传统十神分类哲学。所有数据存储在浏览器本地（localStorage，键名前缀 `b_`），无需服务器，离线可用（依赖 CDN 资源时需要网络，见 §3）。

- 应用版本：**v1.10.0**（后台管理系统信息中显示）
- 数据版本：**4**（`b_version`，仅数据结构不兼容时递增）
- 更新日期：2026-08-14

### 页面入口流程

```
登录页（用户名+密码）
    ↓ 验证通过
场景选择（个人/情侣/夫妻/家庭）
    ↓ 选择场景
主应用（首页 + 模块功能页 + 后台管理）
```

---

## 2. 文件清单

```
D:\dsharness\            ← 项目根（git 仓库，v2 工程已上移为单一项目）
├── index.html           ← Vite 入口
├── src\                 ← 源码（core 逻辑 / views / components / styles）
├── test\node\           ← 核心逻辑测试（node:test，15 项，npm run test:node）
├── src\__tests__\       ← 组件测试（vitest，本机 npm test）
├── backend\src\worker.js ← 云端 API 后端（独立 Cloudflare Worker）
├── backend\wrangler.toml  ← Worker 的 D1/KV/CORS 部署配置
├── DESIGN_README.md     ← 本文档（设计规范 + 维护日志）
├── package.json         ← 依赖与脚本（dev/build/test/test:node）
└── wrangler.toml        ← Cloudflare Worker 配置（如适用）
```

> v1（单文件 index.html）已移除（备份于 `_v1-backup\`，确认无误后可删）；git 历史已重置，v2 为全新仓库。

---

## 3. 技术栈

| 技术               | 用途                                     |
| ------------------ | ---------------------------------------- |
| HTML5              | 页面结构                                 |
| Tailwind CSS (CDN) | 样式框架（布局工具类）                   |
| 原生 JavaScript    | 全部逻辑（无框架，经典 script 单块）     |
| Google Fonts       | Space Grotesk（标题） + DM Sans（正文）  |
| localStorage       | 数据持久化（键名前缀 `b_`，统一容错封装）|

> 离线兜底：自定义 CSS 中内置 `.hidden{display:none!important}` 及全部主题样式，Tailwind CDN 加载失败时功能与视图切换不受影响，仅布局工具类缺失。

---

## 4. 页面结构与导航

```
view-login   → 登录页
view-pass    → 密码设置页（首次登录强制 / 后台修改密码）
view-scene   → 场景选择页
view-app     → 主应用
    ├── 顶栏（sticky）：B 徽标 + beryl + 场景标签 | ⚙️管理 / 🎭场景 / 头像
    ├── page-home    首页（品牌区 / 快速输入 / 统计卡片 / 十神导航）
    ├── page-module  功能模块页（10 个模块共用，动态渲染）
    ├── page-admin   后台管理页
    └── page-reader  博客阅读视图
```

视图切换：`showView(id)` 切换登录/场景/主应用三幕；`showPage(p)` 在主应用内切换四个页面。

---

## 5. 功能模块详解

### 5.1 登录（安全机制）

- 内置默认凭据仅用于**首次登录**（明文不出现在页面与文档中），登录成功后**强制修改密码**
- 密码以 **PBKDF2 哈希**存储（随机盐 + 100,000 次迭代 + SHA-256），localStorage 中不落明文
- 登录失败 **5 次锁定 30 秒**（按钮显示倒计时）；每次校验前强制 350ms 最小延迟，减缓暴力破解
- 错误提示为通用文案「用户名或密码错误」，不泄露账号是否存在
- **记住登录（v1.4.0）**：登录/改密成功后写入本地会话 `b_session`，30 天内打开网页自动进入系统（已有场景记录则直达主应用，否则进入场景选择）；会话过期或账号不匹配自动清除；后台「🚪 退出登录」可手动清除
- 密码设置页（`view-pass`）两种入口：首次登录强制（`first` 模式）/ 后台「🔑 修改密码」（`change` 模式，需验证当前密码）
- 新密码规则：至少 6 位，两次输入一致；用户名可一并修改
- Enter 键提交；登录成功进入场景选择；头像显示用户名首字母大写
- 安全说明：纯前端应用无法做到绝对安全（DevTools 可读本地数据与内存），本机制用于防止"轻易"破解；需要更高等级安全时须引入后端认证（见 §12 规划）

### 5.2 场景选择（各场景独立配置，v1.4.0 起差异化）

| 场景     | 名称 | 图标 | 描述         | 主题色           | 首页标语 | 可用模块 | 统计卡片 |
| -------- | ---- | ---- | ------------ | ---------------- | -------- | -------- | -------- |
| personal | 个人 | 🧑    | 专注自我提升 | `#4F6EF7` 电感蓝 | 写下你的想法 | 10 个全部 | 待办 / 完成 / 习惯 / 目标 |
| couple   | 情侣 | 💑    | 共同成长     | `#F472B6` 樱花粉 | 写下你们的故事 | 10 个全部 | 待办 / 完成 / 习惯 / 番茄 |
| married  | 夫妻 | 👩❤️👨  | 共建家庭     | `#FB923C` 暖橙   | 经营你们的小家 | 9 个（隐藏番茄钟） | 待办 / 完成 / 结余 / 目标 |
| family   | 家庭 | 👨👩👧👦 | 全家共享     | `#34D399` 翠绿   | 记录全家人的生活 | 8 个（隐藏番茄钟、人物） | 待办 / 习惯 / 结余 / 文章 |

- 场景配置集中在 `SCENES`：`tagline`（首页副标题）、`mods`（可见模块，十神导航与「全部」下拉按此过滤）、`stats`（首页统计卡片类型）
- 2×2 卡片网格，点击选中（主题色描边 + 高亮），卡片显示模块数量，「开始使用」激活
- 场景存入 `b_scene`；顶栏显示场景标签；后台可切换（切换后首页/导航即时按新场景渲染）
- 数据本身各场景共享，差异化体现在界面与模块组合（数据隔离见 §12 规划）

### 5.3 首页

1. **品牌区**：⬡ Beryl 大标题（颜色随场景主题色）
2. **快速输入框**：
   - **Enter**：立即记录为随想（入收件箱，零延迟）
   - **1 秒内再次 Enter**：升级为待办（支持"连续敲回车"——第一次回车后输入框已清空，直接再按一次 Enter 即可升级；也支持重新输入相同内容后再回车）
   - 提示文字随行为同步说明
3. **统计卡片（按场景配置 4 个，可点击直达模块）**：卡片类型由 `SCENES[id].stats` 决定，见 §5.2 表格。类型说明：

   | 类型 | 显示内容 | 点击跳转 |
   | ---- | -------- | -------- |
   | count   | 任务总数（数值随场景主题色） | 任务 |
   | done    | 已完成任务数 | 任务 |
   | streak  | 习惯最长连续天数 | 习惯 |
   | pct     | 目标完成百分比 | 目标 |
   | balance | 财务结余（收入−支出） | 财务 |
   | pomo    | 番茄总专注分钟 | 番茄钟 |
   | posts   | 文章数 | 博客 |

4. **十神分类导航**：横排标签 + 点击展开子模块下拉（点击外部/再次点击关闭）；**下拉只显示当前场景可见模块**（`visibleCats` 过滤，空分类自动隐藏）

   | 分类      | 图标 | 颜色             | 包含模块     |
   | --------- | ---- | ---------------- | ------------ |
   | 全部      | ⬡    | 琥珀色 `#F59E0B` | 所有模块     |
   | 印枭·输入 | 📖    | 蓝色 `#6366F1`   | 收件箱、日记 |
   | 食伤·输出 | ✍️    | 琥珀色 `#F59E0B` | 博客         |
   | 比劫·身心 | 🤝    | 绿色 `#10B981`   | 习惯、人物   |
   | 官杀·目标 | 🎯    | 红色 `#EF4444`   | 任务、目标   |
   | 财才·资源 | 💰    | 紫色 `#8B5CF6`   | 财务、番茄钟 |

### 5.4 功能模块（9 个）

| 模块 | 数据键 | 功能要点 |
| ---- | ------ | -------- |
| 收件箱 📥 | `b_inbox` | 快速添加、圆点+文本+日期列表、删除、Enter 提交 |
| 任务 📌 | `b_tasks` | 标题+优先级（高红/中琥珀/低蓝）；圆形勾选完成划线；删除；**列表展示排序：未完成置顶 → 高/中/低 → 新在前**（仅展示排序，不改存储顺序） |
| 习惯 🎯 | `b_habits` | 5 个预设（晨间阅读/运动/日记/喝水/冥想，各有颜色）；周一到周日 7 天打卡圆钮，今日琥珀描边；累计天数；最长连续天数统计 |
| 日记 📓 | `b_diary` | 每日文本域保存（按日期 upsert）；最近 5 条历史倒序 |
| 番茄钟 🍅 | `b_pomoTotal` `b_pomoCount` | 专注 25′/休息 5′ 模式切换；SVG 进度环（专注琥珀/休息翠绿）；开始/暂停/继续；完成专注 +25 分钟 +1 番茄并自动切休息；页面标题实时显示倒计时 |
| 财务 💰 | `b_finance` | 收入/支出/结余三卡；收支切换按钮、分类（datalist）、金额、备注；正负色列表；删除 |
| 目标 🥅 | `b_goals` | 添加、勾选完成划线、删除；进度同步首页统计 |
| 人物 👥 | `b_chars` | 姓名+身份；卡片网格（姓名哈希色首字头像）；删除 |
| 博客 ✍️ | `b_posts` | 标题+内容；列表（日期/标题/摘要）；点击进独立阅读视图；删除 |

### 5.5 后台管理（⚙️）

1. **数据统计**：任务数、财务记录数、习惯数、文章数
2. **场景切换**：4 个场景胶囊按钮，点击即时切换（更新顶栏标签、全局主题色、首页统计与模块组合）；下方显示当前场景的模块清单
3. **数据管理**：
   - 📤 导出：全部 `b_*` 数据导出为 `beryl_日期.json`
   - 📥 导入：**白名单 + 类型校验**（见 §6.3），校验通过才整体写入，失败提示且不产生部分写入
   - 🗑️ 重置：二次确认后清空所有 `b_*` 数据并刷新
4. **系统信息**：版本 v1.4.0、数据版本、当前场景、日期；「🔑 修改密码」（需验证当前密码）、「🚪 退出登录」（清除本地会话）入口

### 5.6 本地文件同步（Syncthing）

- **原理**：通过 File System Access API 把全部业务数据读写到**本地 JSON 文件**（`beryl-data.json`）；把该文件放入 Syncthing 共享文件夹，多设备即自动同步
- **入口**：后台管理 → 「🔄 本地文件同步」卡片 → 「选择已有数据文件」或「创建新数据文件」
- **兼容**：文件格式与「导出」完全一致，可直接复用已有导出备份；旧版明文 `b_auth` 导入后自动升级
- **同步键**：8 个内容数组 + 场景 + 番茄统计（`SYNC_KEYS`）；**认证（`b_auth`）、版本（`b_version`）每设备独立，不同步**
- **写入策略**：本地变更 0.8s 防抖后全量写文件（最后写入者胜）；同时回写 localStorage 作缓存副本，断开同步后数据不丢
- **外部更新**：每 5s 轮询文件 mtime，检测到其他设备更新自动加载并刷新界面
- **冲突处理**：首次连接时若本机与文件都有数据 → 弹出选择：「使用文件数据（覆盖本机）」或「使用本机数据（覆盖文件）」
- **恢复连接**：文件句柄持久化于 IndexedDB；下次打开自动恢复（权限失效时提供「恢复连接」按钮）
- **限制**：仅 Chrome / Edge 支持（File System Access API）；建议 HTTPS（GitHub Pages）或 localhost 访问；同一设备请只开一个标签页；文件为明文 JSON，注意同步文件夹访问权限

### 5.7 云端同步（Cloudflare / S3 兼容云，v1.5.0 起，v1.6.0 扩展）

- **四种数据模式可切换**（后台「🔄 数据同步」卡片内互斥切换）：

  | 模式 | 载体 | 适用场景 |
  | ---- | ---- | -------- |
  | 本地 | 仅浏览器 localStorage | 单机使用 |
  | 本地文件 | 本地 JSON 文件（Syncthing 同步） | 自有设备/局域网 |
  | ☁️ Cloudflare | Worker API + KV | 国外访问佳、零配置存储 |
  | 🗄️ S3 兼容云 | 阿里云 OSS / 腾讯云 COS / 华为云 OBS / 七牛 / MinIO 等 | **国内访问佳** |

- **自动重连（v1.9.0 起）**：刷新/重开页面时自动重连已保存的云端/对象存储配置并**立即拉取最新数据**（刷新即同步）；**提示只报结果**：成功提示「✅ 已自动同步最新数据」，失败提示「⚠️ 同步失败」并降级为「🟡 已保存配置（未连接）」手动入口，不弹"开始同步"等中间态提示（v1.9.1）；「忘记配置」可一键清除；断开后配置保留，可随时手动重连
- **机制**：四种模式同构——全量数据存内存 + 双写 localStorage 缓存；**连接后**本地变更 0.8s 防抖上传/写入、**前台 5s 轮询**检测其他端更新自动加载（v1.10.0，接近实时）、**后台暂停轮询省流量**、**切回页面/窗口聚焦时立即拉取**；首次连接双方有数据时弹窗选择数据源；断开不丢本地数据
- **立即同步（v1.8.0，双向）**：后台「💾 立即同步」先拉取远端（远端较新则覆盖本地）再上传本地（有本地改动则上传）；**云端与本机都有新改动时弹窗让你选择以谁为准**；`dirty` 标记跟踪本地未上传改动，上传成功/拉取后清除
- **Cloudflare**：API 地址 + 同步密码（Worker 内 PBKDF2 校验，兼容旧 SHA-256）；`b_cloud` 持久化自动重连
- **S3 兼容云**：浏览器端 AWS Signature V4 签名直连（无需服务器）；配置 Endpoint/Bucket/Region/AccessKey/SecretKey；对象键 `beryl-data.json`；`b_s3` 持久化自动重连
- **限制**：数据以明文 JSON 经 HTTPS 传输与存储；S3 密钥以明文存本机（建议子账号 + 最小权限）；bucket 必须配置 CORS（见 §13.6）

---

## 6. 数据存储与版本迁移

### 6.1 存储键一览

| Key            | 内容       | 格式                                        |
| -------------- | ---------- | ------------------------------------------- |
| `b_tasks`      | 任务列表   | `[{id, title, priority, date, done}]`       |
| `b_inbox`      | 收件箱     | `[{id, text, date}]`                        |
| `b_habits`     | 习惯       | `[{id, name, color, days, dates[]}]`（`dates` 为打卡日期数组，`days` 同步为其长度） |
| `b_goals`      | 目标       | `[{id, title, done}]`                       |
| `b_finance`    | 财务       | `[{id, type, amount, category, note, date}]`|
| `b_diary`      | 日记       | `[{date, content}]`                         |
| `b_chars`      | 人物       | `[{id, name, title, date}]`                 |
| `b_posts`      | 博客       | `[{id, title, content, date}]`              |
| `b_pomoTotal`  | 番茄总分钟 | number（字符串存储）                        |
| `b_pomoCount`  | 番茄个数   | number（字符串存储）                        |
| `b_auth`       | 登录凭据   | `{u, salt, hash, iter, _d?}`（PBKDF2 哈希，不存明文；`_d` 为默认凭据标记，首次登录后移除） |
| `b_scene`      | 当前场景   | JSON 字符串（`"couple"`；v3 及以前为裸字符串，v4 迁移后统一） |
| `b_tid`        | ID 计数器  | number（字符串存储）                        |
| `b_session`    | 登录会话   | `{u, ts}`（记住登录 30 天；过期/退出登录即清除） |
| `b_version`    | 数据版本   | number（字符串存储），当前为 **4**          |

> 说明：`b_habits` 在基础结构上增加 `dates` 数组，用于支撑周打卡日历与最长连续天数统计（`days` 字段同步维护，保持兼容）。

### 6.2 版本迁移机制

- 启动时 `migrateData()` 读取 `b_version`，若低于当前版本则依次执行 `MIGRATIONS[v]` 迁移函数后写入新版本号；幂等（重复执行安全）。
- 迁移记录：
  - **v1 → v2**（2026-08-14）：引入版本号机制，v1 数据结构与 v2 完全兼容，无需转换。
  - **v2 → v3**（2026-08-14）：`b_auth` 改为 PBKDF2 哈希格式；旧版明文记录（`{u,p}`，密码恒为默认值）在 `ensureAuth()` 中惰性升级为哈希记录并标记为默认凭据，触发首次登录强制改密。
  - **v3 → v4**（2026-08-14）：标量键统一为 JSON 字符串存储（`b_scene` 由裸字符串 `personal` 迁移为 `"personal"`；`b_tid`/`b_pomoTotal` 等数字字符串天然兼容）。

### 6.3 导入校验规则（IMPORT_SCHEMA）

导入文件必须全部通过校验才会写入（先验证后写入，杜绝部分写入污染）：

| 键           | 校验规则                     |
| ------------ | ---------------------------- |
| 8 个列表键   | 必须是数组（JSON 字符串需可解析为数组） |
| 3 个数字键   | `Number()` 结果必须非 NaN    |
| `b_auth`     | 对象且含字符串 `u`，且为以下两者之一：含字符串 `p`（旧版明文，导入后惰性升级）或含字符串 `salt`/`hash` 与数字 `iter`（新版哈希） |
| `b_scene`    | 必须是 `SCENES` 中的合法值    |
| `b_version`  | 任意值（导入后重置为当前版本）|
| 其他任何键   | 拒绝（提示"包含未知键"）     |

### 6.4 写入容错

- 所有写入（含 `b_tid`、番茄计数、场景、认证等）统一走 `lsSet()`：try/catch 包裹，配额满（QuotaExceededError）或存储不可用时弹出提示「⚠️ 存储失败：空间不足或不可用，请先导出备份」，**不抛异常、不白屏**。

### 6.5 统一存储层与同步架构（v1.3.0 起，v1.6.0 扩展）

- **四种数据模式**：`local`（仅 localStorage）/ `file`（本地 JSON 文件，Syncthing 同步）/ `cloud`（Cloudflare Worker API）/ `s3`（S3 兼容对象存储，SigV4 直连）；`store.get/set` 统一路由，`fileData` 内存 + localStorage 双写，断开后数据不丢。
- **文件格式**（与导出格式一致，另含 `_meta` 元信息）：
  ```json
  {
    "b_tasks": "[{\"id\":\"lwxyz-1a2b3c\",...}]",
    "b_scene": "\"couple\"",
    "_meta": { "appVersion": "v1.3.0", "dataVersion": 4, "savedAt": "..." }
  }
  ```
- **ID 策略**：`nextId()` 改为「时间戳(36进制) + 随机后缀」，多设备并发写入不产生重复 ID（`b_tid` 键仅保留兼容导出格式，不再用于生成）。
- **同步键**：`SYNC_KEYS` = 8 个内容数组 + `b_scene` + `b_pomoTotal` + `b_pomoCount`；`b_auth`/`b_version`/`b_tid` 不参与文件同步（设备独立）。
- **外部更新检测**：`file` 模式每 5s 轮询文件 mtime；`cloud` 模式前台每 5s 拉取增量游标；`s3` 模式按 `Last-Modified` 检测；判定“其他端更新”后应用数据并广播同步事件。
- **冲突语义**：最后写入者胜（Syncthing 原生语义）；首次连接双方都有数据时弹窗让用户选择数据源，避免误覆盖。
- **云端 API**（`worker.js`）：`POST /api/setup`、`POST /api/sync/pull`、`POST /api/sync/push` 为当前 D1 协议；`GET/PUT /api/data` 仅作旧客户端兼容。同步密码新格式为 PBKDF2，业务值为 AES-GCM 密文。
- **S3 直连**（浏览器内实现）：AWS Signature V4 签名（HMAC-SHA256 密钥链），path-style URL `{endpoint}/{bucket}/beryl-data.json`，请求头含 `x-amz-date` / `x-amz-content-sha256` / `Authorization`；对象存储需开启 CORS（§13.6）。

---

## 7. 视觉设计规范

### 7.1 背景

- 深碳黑 `#0A0A0F`
- 径向渐变：左上光晕（8% 透明度）+ 右下光晕（4%），**颜色随场景主题色**
- 40px 网格纹理（1.5% 白线）

### 7.2 颜色

| 用途           | 色值                       |
| -------------- | -------------------------- |
| 默认强调（琥珀）| `#F59E0B`，hover `#D97706` |
| 印枭蓝         | `#6366F1`                  |
| 比劫绿         | `#10B981`                  |
| 官杀红         | `#EF4444`                  |
| 财才紫         | `#8B5CF6`                  |
| 成功绿         | `#34D399`                  |
| 正文白         | `#E4E4E7`                  |

### 7.3 场景主题 CSS 变量（v1.1.0 新增）

`applySceneTheme()` 在启动与场景切换时把场景色写入 `documentElement` 的 CSS 变量，全局生效：

| 变量                     | 含义                                  |
| ------------------------ | ------------------------------------- |
| `--scene`                | 场景主色（主按钮渐变底、品牌元素）    |
| `--scene-light`          | 主色提亮 35%（主按钮渐变顶）          |
| `--glow-a` / `--glow-b`  | 背景左上/右下光晕（8% / 4% 透明度）   |
| `--scene-focus`          | 输入框焦点边框（50% 透明度）          |
| `--scene-border`         | 图标按钮 hover / 分类标签激活边框     |
| `--scene-border-soft`    | 卡片 hover 边框                       |
| `--scene-border-strong`  | 头像边框                              |
| `--scene-soft`           | 柔色背景（徽标底、标签激活底）        |
| `--scene-glow-strong`    | 主按钮 hover 阴影                     |

所有变量均带琥珀色默认值兜底。受影响的元素：背景光晕、主按钮（登录/添加/开始等）、输入框焦点、卡片 hover、图标按钮、十神标签激活态、品牌 ⬡、顶栏 B 徽标、头像、场景标签。

### 7.4 卡片

- 背景 `rgba(24,24,29,0.75)`，`backdrop-filter: blur(12px)` 玻璃感
- 边框 `rgba(255,255,255,0.06)`，hover 变场景主题色
- 圆角 14px

### 7.5 字体与动效

- 标题 Space Grotesk / 正文 DM Sans；标题 2rem vs 辅助文字 0.55rem 强对比
- `fadeIn 0.3s`（translateY 10px→0）；按钮 hover 上浮 1px、active 缩放 0.97
- 任务/目标完成划线效果；习惯今日琥珀描边；番茄钟进度环动画

### 7.6 响应式

- 内容区最大宽度 720px 居中；移动端网格自动降为单列/双列

---

## 8. 交互清单

| 操作                     | 行为                                              |
| ------------------------ | ------------------------------------------------- |
| 登录页 Enter             | 提交登录（失败 5 次锁定 30 秒）                   |
| 登录/改密成功            | 写入本地会话，30 天内免登录                       |
| 打开网页（会话有效）     | 自动进入系统（直达主应用或场景选择）              |
| 后台 🚪 退出登录         | 清除会话并返回登录页                              |
| 首次登录成功             | 强制进入密码设置页（默认密码仅限一次）            |
| 后台 🔑 修改密码         | 验证当前密码后设置新密码                          |
| 首页输入框 Enter         | 立即记录随想（入收件箱）                          |
| 首页输入框 1 秒内再按 Enter（可连续敲回车） | 随想升级为待办（中优先级）          |
| 统计卡片点击             | 直达任务 / 习惯 / 目标模块                        |
| 十神分类点击             | 展开/关闭子模块下拉                               |
| 点击下拉外区域           | 关闭下拉                                          |
| 模块内 Enter             | 提交添加                                          |
| 番茄钟开始/暂停/继续     | 切换计时；模式切换重置时间（25′/5′）              |
| 后台重置                 | 二次确认后清空数据                                |
| 后台导入                 | 白名单+类型校验，通过后写入并刷新                 |
| 场景切换                 | 即时生效：顶栏标签 + 全局主题色 + 背景光晕         |
| 后台选择/创建数据文件    | 连接本地文件（Syncthing 同步），冲突时弹窗选择     |
| 其他设备更新数据文件     | 每 5s 自动检测并加载（toast 提示）                 |
| 后台断开同步             | 停止轮询与写入，数据保留在本机 localStorage        |

---

## 9. 维护规范（强制约定）

### 9.1 每次改动必须执行的步骤

1. **修改代码**：只改 `index.html`（单文件应用）。
2. **语法校验**：`node --check`（见下方命令）。
3. **回归测试**：运行 jsdom 冒烟测试（130 项断言），必须全部通过（见下方命令）。
4. **同步本文档**：
   - 新增/修改功能 → 更新 §5 对应模块说明
   - 数据键或结构变化 → 更新 §6.1，并**递增 `b_version` + 编写 `MIGRATIONS` 迁移函数**
   - 样式/颜色变化 → 更新 §7
   - 交互变化 → 更新 §8
5. **更新日志**：在 §10 顶部追加一条记录，格式：

   ```
   ### vX.Y.Z（YYYY-MM-DD）
   1. 改动描述一
   2. 改动描述二（涉及章节：§5.3 / §6.2 …）
   ```

### 9.2 验证命令

```powershell
# 1) 语法校验（提取内联 script 后 node --check）
$html = Get-Content -Raw -Encoding utf8 "D:\dsharness\index.html"
$m = [regex]::Match($html, '(?s)<script>(.*)</script>')
[System.IO.File]::WriteAllText("$env:TEMP\_check.js", $m.Groups[1].Value, (New-Object System.Text.UTF8Encoding($false)))
node --check "$env:TEMP\_check.js"

# 2) 回归测试（首次需安装 jsdom，约 20 秒）
npm install --prefix "D:\dsharness\.testdeps" jsdom --no-audit --no-fund --cache "D:\dsharness\.npmcache"
node "D:\dsharness\.testdeps\run-test.js"   # 期望输出 ok=130 fail=0 EXIT=0
```

### 9.3 版本号规则

- **应用版本**（后台系统信息显示）：语义化版本，功能/优化/修复均递增。
- **数据版本**（`b_version`）：仅当既有数据结构不兼容（字段增删改）时递增，并必须提供迁移函数。

---

## 10. 更新日志

### v1.10.0（2026-08-14）— 接近实时同步（5s 前台轮询）

1. **轮询间隔 15s → 5s**（前台页面），电脑/其他设备更新后手机**约 5 秒内**自动显示（涉及章节：§5.7）。
2. **后台暂停轮询**：页面切到后台时停止轮询（浏览器本就会节流，省 KV 请求/流量），切回/聚焦时立即恢复并拉取一次（涉及章节：§5.7）。
3. **免费额度核算**：5s 前台轮询 × 每天 8 小时 ≈ 5,760 次请求，仍远低于免费限额（10 万次/天）；后台暂停后实际用量更低。
4. **说明**：5s 轮询是"免费、无服务器"方案下最接近实时的做法；如需秒级/即时推送（WebSocket/Durable Objects），见 §12.2 规划。

### v1.9.1（2026-08-14）— 同步提示只报结果

1. **去掉"开始同步"中间态提示**：自动重连时静默拉取，不再弹「已连接云端，开始同步」；改为**只提示结果**——成功「✅ 已自动同步最新数据」、失败「⚠️ 同步失败」并降级为手动入口（涉及章节：§5.7）。
2. **测试**：新增成功/失败 toast 断言，130 项全部通过。

### v1.9.0（2026-08-14）— 刷新自动同步（自动重连）

1. **刷新即同步**：刷新/重开页面时自动重连已保存的云端（Cloudflare/S3）配置并立即拉取最新数据——解决"手机上添加的数据，电脑刷新后也看不到"的问题（涉及章节：§5.7、§8）。
2. **失败静默降级**：自动重连失败时不弹打扰提示，仅降级为「🟡 已保存配置（未连接）」手动入口（涉及章节：§5.7）。
3. **本地文件句柄**：已授权（granted）的本地文件句柄刷新后自动重连；需授权的保持手动确认（涉及章节：§5.6）。
4. **测试**：新增自动重连+自动拉取、失败静默降级断言，128 项全部通过。

### v1.8.0（2026-08-14）— 立即同步（双向）+ 修复幽灵上传

1. **「立即同步」改为双向同步**：先拉取远端（远端较新则覆盖本地），再上传本地（有本地改动则上传）；**两端都有新改动时弹窗选择以谁为准**（复用冲突模态）；新增 `dirty` 标记跟踪本地未上传改动（涉及章节：§5.7、§8）。
2. **切回页面立即拉取**：`visibilitychange` + `focus` 事件触发即时轮询，弥补后台标签页 15s 轮询被浏览器节流导致"手机上看不到新数据"的问题（涉及章节：§5.7）。
3. **修复幽灵上传**：`SYNC.writeTimer = null` 只丢弃引用未 `clearTimeout`，已排队的防抖定时器仍会触发一次多余上传（真实场景会覆盖较新的云端数据）——统一在 `syncWriteFile` 入口取消定时器；测试抓出（涉及章节：§6.5）。
4. **测试**：冒烟测试扩展至 128 项断言（立即同步拉取/上传/冲突弹窗/focus 轮询；mock 改为确定性时间戳），全部通过。

### v1.7.1（2026-08-14）— 快速输入修复与优化

1. **修复"连续敲回车不能转待办"**：第一次回车后输入框被清空，第二次回车被当作空输入忽略——现改为 1 秒内再次回车（输入框为空或内容相同）直接把上一条随想升级为待办（涉及章节：§5.3、§8）。
2. **双击窗口 500ms → 1 秒**：更符合手动"连续敲回车"的节奏；提示文案同步更新（涉及章节：§5.3）。
3. **测试**：冒烟测试扩展至 123 项断言（新增连续敲回车、重新输入同内容、超时不升级、内容不同不升级四类场景），全部通过；期间测试抓出升级分支漏写 `store.set('tasks')` 的笔误。

### v1.7.0（2026-08-14）— 同步改为手动连接

1. **连接全部手动**：Cloudflare / S3 / 本地文件的重连不再自动触发——启动只恢复「已保存配置」状态（🟡 显示入口），由用户点击「连接」按钮才建立连接；移除自动重连失败的打扰提示（涉及章节：§5.6、§5.7、§8）。
2. **配置管理**：新增「忘记配置」一键清除已保存的云端/对象存储配置；断开后配置保留，可随时手动重连（涉及章节：§5.7）。
3. **自动同步保留**：连接建立后，本地变更 0.8s 自动上传、远端更新自动拉取（15s 轮询）的机制不变（涉及章节：§5.7）。
4. **测试**：冒烟测试扩展至 120 项断言（已保存状态展示、手动重连含冲突确认、忘记配置、无配置不打扰），全部通过。

### v1.6.0（2026-08-14）— 国内云同步（S3 兼容对象存储）

1. **S3 兼容云模式**：新增「🗄️ 国内云(S3)」——浏览器端实现 AWS Signature V4 签名（HMAC-SHA256 密钥链），直连阿里云 OSS / 腾讯云 COS / 华为云 OBS / 七牛 / MinIO 等所有 S3 兼容存储；配置 Endpoint/Bucket/Region/AccessKey/SecretKey，对象键 `beryl-data.json`（涉及章节：§5.7、§6.5）。
2. **四模式互斥切换**：本地 / 文件（Syncthing）/ Cloudflare / S3 可在后台同一卡片切换；`Last-Modified` 响应头驱动 15s 轮询；`b_s3` 配置持久化自动重连（涉及章节：§5.7）。
3. **修复**：`syncPollCheck` 入口判断漏掉 S3 模式导致轮询失效（测试抓出）。
4. **测试**：冒烟测试扩展至 116 项断言（mock 对象存储：403 拒绝、冲突模态、防抖 PUT 的 SigV4 签名头/日期头格式校验、Last-Modified 外部更新、断开保留配置、自动重连），全部通过。

### v1.5.0（2026-08-14）— 云端同步（Cloudflare Workers）

1. **云端数据模式**：新增「☁️ 连接云端」——数据读写 Cloudflare Worker API（KV 存储），与本地文件模式同构（内存+localStorage 双写、0.8s 防抖上传、15s 轮询 `updatedAt`、冲突弹窗、断连保留本地数据）；`b_cloud` 配置持久化，刷新自动重连（涉及章节：§5.7、§6.5、§8）。
2. **后端 worker.js**：`POST /api/setup`（同步密码 SHA-256 哈希，仅可设置一次）/ `GET`、`PUT /api/data`（Bearer 鉴权 + CORS + KV 元数据时间戳）；免费额度个人使用绰绰有余（涉及章节：§13）。
3. **三种模式互斥切换**：本地 / 文件（Syncthing）/ 云端（Cloudflare）可在后台同一卡片内切换；`store` 路由、轮询、冲突处理统一分发（涉及章节：§5.6、§5.7、§6.5）。
4. **测试**：冒烟测试扩展至 105 项断言（mock fetch：401 拒绝、冲突模态、防抖上传、云端外部更新、断开保留配置、自动重连），全部通过。

### v1.4.0（2026-08-14）— 记住登录 + 场景差异化

1. **记住登录**：登录/改密成功后写入 `b_session` 会话（30 天有效），打开网页自动恢复（有场景直达主应用）；过期或账号不匹配自动清除；后台新增「🚪 退出登录」（涉及章节：§5.1、§5.5、§8）。
2. **场景差异化**：`SCENES` 配置扩展为 `tagline`（首页副标题）、`mods`（可见模块）、`stats`（统计卡片类型）——个人 9 模块/待办·完成·习惯·目标；情侣 9 模块/加番茄统计；夫妻 8 模块（隐藏番茄钟）/显示财务结余；家庭 7 模块（隐藏番茄钟、人物）/显示文章数（涉及章节：§5.2、§5.3）。
3. **导航联动**：十神分类与「全部」下拉按场景过滤模块，空分类自动隐藏；后台场景切换显示当前场景模块清单；场景选择卡片显示模块数量（涉及章节：§5.2、§5.3）。
4. **统计卡片重构**：`statValue/statLabel/statColor/statMod` 按类型驱动，支持待办/完成/习惯/目标/结余/番茄/文章七种卡片，点击直达对应模块（涉及章节：§5.3）。
5. **测试**：冒烟测试扩展至 96 项断言（会话写入/恢复/过期/退出、四场景模块与统计差异、下拉过滤等），全部通过。

### v1.3.0（2026-08-14）— 本地文件同步（Syncthing）

1. **本地文件同步**：新增「🔄 本地文件同步」模块——通过 File System Access API 将数据读写到本地 JSON 文件，放入 Syncthing 共享文件夹即可多设备自动同步；支持选择已有文件 / 创建新文件、0.8s 防抖写入、5s 轮询外部更新自动加载、冲突弹窗选择数据源、IndexedDB 持久化句柄并在启动时自动恢复（涉及章节：§5.6、§6.5、§8）。
2. **存储层重构**：统一 `store` 双后端路由（localStorage + 本地文件），`safeParse` 容错解析；文件模式双写 localStorage 作缓存副本，断开同步数据不丢（涉及章节：§6.5）。
3. **多设备安全 ID**：`nextId()` 改为时间戳+随机后缀，避免多设备并发产生重复 ID；`b_tid` 键仅保留兼容导出（涉及章节：§6.5）。
4. **数据版本 v3→v4**：标量键统一 JSON 字符串存储（`b_scene` 裸字符串迁移）；导入校验的 `b_scene` 兼容新旧两种格式（涉及章节：§6.2、§6.3）。
5. **导入联动同步**：文件同步模式下导入数据会同步写入本地文件（涉及章节：§5.5、§6.5）。
6. **修复**：博客阅读视图 ID 从数字改为字符串后 `Number()` 转换导致打不开（测试抓出）。
7. **测试**：冒烟测试扩展至 78 项断言（mock 文件系统 API：连接、写入、外部更新、冲突弹窗、断开回退、ID 唯一性、场景迁移），全部通过。

### v1.2.0（2026-08-14）— 安全加固

1. **移除登录页默认凭据提示**：登录页不再显示默认账号密码（涉及章节：§5.1、§8）。
2. **密码哈希存储**：`b_auth` 改为 PBKDF2（随机盐 + 100,000 次迭代 + SHA-256）哈希格式，localStorage 不再存明文；`crypto.subtle` 不可用（非 HTTPS/非本机文件）时登录会明确提示（涉及章节：§5.1、§6.1）。
3. **首次登录强制改密**：默认凭据仅限首次登录，成功后强制进入密码设置页（`view-pass`），新密码至少 6 位、需二次确认、用户名可一并修改（涉及章节：§5.1、§4、§8）。
4. **后台修改密码入口**：系统信息卡片新增「🔑 修改密码」，需验证当前密码（涉及章节：§5.5）。
5. **登录防爆破**：失败 5 次锁定 30 秒（按钮倒计时）；每次校验前强制 350ms 最小延迟；错误提示统一为「用户名或密码错误」（涉及章节：§5.1、§8）。
6. **数据版本 v2→v3**：`b_auth` 结构变更；旧明文记录在 `ensureAuth()` 中惰性升级并触发强制改密；导入白名单兼容新旧两种 `b_auth` 格式（涉及章节：§6.2、§6.3）。
7. **测试**：冒烟测试扩展至 66 项断言（新增改密流程、哈希/明文检测、密码校验、锁定拦截、旧版导入升级等），全部通过。

### v1.1.0（2026-08-14）— 优化批次

1. **数据层加固**：新增 `b_version` 数据版本号与迁移机制（`migrateData`/`MIGRATIONS`，v1→v2 无结构变更）；所有 localStorage 写入统一走 `lsSet()` 容错封装，配额满/不可用时提示而非白屏（涉及章节：§6.1、§6.2、§6.4）。
2. **导入校验**：导入升级为白名单 + 类型校验（`IMPORT_SCHEMA`），先验证后整体写入，非法键/非法类型拒绝并提示（涉及章节：§6.3）。
3. **快速输入零延迟**：Enter 立即记录随想（不再有 500ms 等待），500ms 内再次 Enter（同内容）将随想升级为待办（涉及章节：§5.3、§8）。
4. **统计卡片可点击**：待办/完成/习惯/目标四卡直达对应模块（`data-open-mod` 事件委托，涉及章节：§5.3、§8）。
5. **场景主题色全局化**：`applySceneTheme()` 将场景色写入 CSS 变量，驱动背景光晕、主按钮、输入框焦点、卡片 hover、品牌徽标、头像、分类标签激活态（涉及章节：§7.3）。
6. **细节改进**：顶栏切换场景按钮 🏠→🎭 消除歧义；任务列表展示排序（未完成置顶→优先级→新在前）；后台系统信息新增「数据版本」；应用版本 v1.0.0→v1.1.0。
7. **测试**：冒烟测试扩展至 49 项断言（新增数据版本、主题色、快速输入新语义、统计卡片、导入校验等），全部通过。

### v1.0.0（2026-08-14）— 初始完整实现

1. 单文件应用骨架：登录 → 场景选择 → 主应用三幕结构，深色十神主题视觉。
2. 全部 9 个功能模块：收件箱、任务、习惯、日记、番茄钟、财务、目标、人物、博客。
3. 首页：品牌区、快速输入（双击 Enter 记待办）、4 统计卡片、十神分类导航下拉。
4. 后台管理：数据统计、场景切换、导出/导入/重置、系统信息。
5. 数据层：11 个 `b_*` 键，ID 计数器 `b_tid`。
6. 冒烟测试 37 项断言（jsdom），期间修复 2 个 bug（模块内容未注入、番茄钟按钮文案延迟刷新）。

---

## 11. GitHub Pages 部署指南

> Beryl 是零构建的单文件静态站点，GitHub Pages 直接托管即可。部署成功后站点为 **HTTPS**，`crypto.subtle` 可用（登录加密正常）。

### 11.1 前置准备

- GitHub 账号（免费版 Pages 要求**仓库为公开**；站点数据都在访问者浏览器本地，公开仓库不泄露任何个人数据）
- 本机已安装 git（本机版本 2.55.0 ✓）
- 首次部署前建议先建 `.gitignore`（避免把测试脚手架推上仓库）：
  ```
  # 在 D:\dsharness 下新建 .gitignore，内容：
  .testdeps/
  .npmcache/
  ```

### 11.2 方式一：网页操作 + 命令行（推荐）

> ⚠️ **注意**：Windows PowerShell 5.1 不支持 `&&`（仅 PowerShell 7+ / cmd / bash 支持），以下命令请**逐行执行**或用 `;` 分隔。

1. 打开 https://github.com/new 创建仓库，名称如 `beryl`，选 **Public**，不要勾选初始化 README
2. 本机 PowerShell 推代码（逐行执行）：
   ```powershell
   cd D:\dsharness
   git init
   git add .          # 暂存全部改动（.gitignore 会自动排除 .testdeps/ 等，勿用 git add *：* 不匹配隐藏文件）
   git commit -m "Beryl v1.6.0"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/beryl.git
   git push -u origin main
   ```
3. 开启 Pages：仓库页面 → **Settings → Pages** → Source 选择 **Deploy from a branch** → Branch 选 `main`、目录选 `/ (root)` → **Save**
4. 等待 1–2 分钟，访问 `https://<你的用户名>.github.io/beryl/`

**实测记录（2026-08-14）**：本地 `git init`、`git add`、`git commit`（提交号 `d7e9e37`，3 个文件）、`git branch -M main` 均已执行完成；git 身份已配置。首次提交时 Git 会提示 `LF will be replaced by CRLF` 警告（无害，可忽略）。push 若提示认证失败：GitHub → Settings → Developer settings → Personal access tokens → 生成勾选 `repo` 权限的 token，push 时用户名填用户名、密码填 token。

### 11.3 方式二：GitHub CLI（需先安装 gh 并登录）

```powershell
# 逐行执行（PS 5.1 不支持 &&）
cd D:\dsharness
git init
git add .
git commit -m "Beryl v1.3.0"
git branch -M main
gh repo create beryl --public --source=. --push
gh api repos/<你的用户名>/beryl/pages -X POST -f "source[branch]=main" -f "source[path]=/"
```

### 11.4 部署后须知

- **首次登录流程**：用内置默认凭据登录 → 强制设置新密码 → 进入系统（之后默认凭据失效）
- **数据不跨设备**：localStorage 属于各浏览器本地；多设备同步请用「本地文件同步」（见 §5.6），或换设备时在后台导出 JSON 再导入
- **需要联网**：Tailwind CDN 与 Google Fonts 依赖外网加载
- **以后每次更新**（无脑三连，逐行执行或用 `;` 一行串起来）：
  ```powershell
  git add .
  git commit -m "改动说明"
  git push
  ```
  不需要先看文件变动：`.gitignore` 已保证测试脚手架不会混入；万一暂存了不该提交的文件，用 `git reset HEAD <文件>` 取消暂存。Pages 会自动重新发布。
- **自定义域名**（可选）：Settings → Pages → Custom domain 绑定并配置 DNS CNAME

### 11.5 与 Syncthing 配合使用

1. 在 Syncthing 中新建共享文件夹（例如 `D:\beryl-sync`），并与其他设备共享（设备 ID 配对）
2. 首次使用时：浏览器打开 Beryl（建议部署后的 HTTPS 地址）→ 登录 → 后台管理 → 「🔄 本地文件同步」→ **创建新数据文件** → 保存到 `D:\beryl-sync\beryl-data.json`
3. 其他设备同样安装 Syncthing 并共享同一文件夹后，打开 Beryl → 后台 → 「选择已有数据文件」→ 选择同步过来的 `beryl-data.json`
4. 此后任何一端的增删改都会在 5 秒内自动同步到其他设备；两端同时修改时以最后写入者为准（Syncthing 原生语义）
5. 注意：数据文件为明文 JSON，请勿放入未加密的公共共享位置

### 11.6 与 rclone 配合使用（任意云盘/对象存储）

> 原理：rclone 把任意云后端（Google Drive、OneDrive、阿里 OSS、腾讯 COS 等几十种）同步/挂载成本地文件夹，Beryl 现有的「本地文件」模式直接读写该文件夹即可。**Beryl 无需改动，零代码。** 免费、开源自托管（https://rclone.org/downloads/）。

**方案 A：定时双向同步（推荐，简单可靠）**

1. 安装 rclone → PowerShell 执行 `rclone config` → 按向导配置你的云后端（如 `rclone config` 里选 `s3` → 阿里云 OSS，或 `drive` → Google Drive 等）
2. 在云上建一个专属目录（如 `beryl/`），本地建同步目录：
   ```powershell
   rclone bisync 云:beryl D:\beryl-rclone --create-empty-src-dirs --resync
   ```
3. 测试同步正常后，注册为计划任务定时跑（如每 5 分钟）：
   ```powershell
   schtasks /create /tn "beryl-sync" /tr "rclone bisync 云:beryl D:\beryl-rclone" /sc minute /mo 5
   ```
4. Beryl 后台 → 「📂 选择已有数据文件」→ 选择 `D:\beryl-rclone\beryl-data.json`（首次创建则用「➕ 创建新数据文件」）
5. 之后 Beryl 每次写入文件，rclone 会在下次任务运行时同步上云；其他设备执行同样的 bisync 即可共享

**方案 B：挂载为本地盘（实时，需 WinFsp）**

```powershell
# 安装 WinFsp 后：
rclone mount 云:beryl X:\ --vfs-cache-mode full --vfs-cache-max-size 1G
```
Beryl 直接读写 `X:\beryl-data.json`，写入即实时上传；适合单设备 + 云端备份场景。

**可选：加密目录（crypt）**

```powershell
rclone config   # 新建 crypt 类型 remote：remote = 云:beryl-crypt，密码自定
rclone bisync crypt: D:\beryl-rclone
```
注意：**Beryl 无法直接读取 crypt 加密后的云端文件**（格式专有），加密只作用于"rclone 上传层"——Beryl 读本地明文，上传到云的是密文。这正好符合"云端密文、本地明文"的隐私需求。

**注意：** rclone 同步时机由其调度决定（非实时，方案 A 是 5 分钟级；方案 B 实时但需常驻服务）；多端同时写为"最后写入者胜"（与 Beryl 文件模式语义一致）；同步目录与 Syncthing 目录不要混用同一文件夹。

---

## 12. 安全边界与规划

### 12.1 已知边界（如实说明）

| 威胁场景 | 现状 | 说明 |
| -------- | ---- | ---- |
| 密码泄露（本机数据被查看） | ✅ 已缓解 | 密码只存 PBKDF2 哈希，无法反推明文 |
| 暴力破解 | ✅ 已缓解 | 5 次失败锁定 30s + 350ms 最小延迟 |
| 本机被他人直接打开浏览器 | ⚠️ 注意 | 记住登录会话（30 天）会免密进入系统；公共电脑请使用后台「🚪 退出登录」 |
| 默认凭据被他人抢注 | ✅ 已缓解 | 首次登录强制改密；且各浏览器 localStorage 相互隔离 |
| 云端数据被窃取/篡改 | ⚠️ 注意 | 数据经 HTTPS 明文传输；Cloudflare 凭同步密码（Worker 内哈希），S3 凭 AccessKey/SecretKey（明文存本机，建议子账号最小权限）；泄露凭据 = 数据泄露 |
| 同步数据文件被窃取 | ⚠️ 注意 | 同步文件为明文 JSON（含日记/财务等），注意同步文件夹访问权限；敏感场景可启用 Syncthing 文件夹加密（.stfolder 加密） |
| 有 DevTools 能力的人 | ⚠️ 无法防御 | 纯前端可读内存/改本地数据/改代码，任何前端方案都无法根治 |
| 跨设备数据被劫持 | ⚠️ 不在范围内 | 数据只经 Syncthing 局域网/自有信道传输，不经任何第三方服务器 |

### 12.2 规划（如需更高等级安全）

1. 引入轻量后端做真正的服务端认证与会话管理（当前云端模式仅做数据仓库，登录仍在本地）
2. 可选数据加密：同步/导出文件用口令加密（AES-GCM）
3. PWA 化（manifest + service worker），"添加到主屏幕"离线使用

---

## 13. Cloudflare 云端部署指南（免费，无需服务器）

> 云端模式 = Cloudflare Worker（API）+ KV（存储）。前端「☁️ 连接云端」后，任何设备凭 API 地址 + 同步密码访问同一份数据。域名可选（Cloudflare 自定义域名绑定免费）。

### 13.0 架构说明：为什么需要 Worker（先读这段）

**浏览器不能直接存取云端数据**（安全限制），必须有一个"门卫"代为读写——**Worker（beryl-api）就是门卫**：它验证同步密码，把数据存入 KV 仓库。所以：

- **网站（index.html）**和 **数据 API（worker.js）是两个独立部署、两个地址**：

| 仓库文件 | 角色 | 部署到 | 地址形态 |
| -------- | ---- | ------ | -------- |
| `worker.js` | 数据 API（门卫） | Cloudflare Workers（Git 集成或粘贴） | `https://beryl-api.<子域>.workers.dev` |
| `index.html` | 网站页面（门面） | Cloudflare Pages / GitHub Pages（静态托管） | `https://beryl.<子域>.pages.dev` 或 `github.io/beryl` |

- **Git 集成绑定仓库 = 自动部署 worker.js**（push 后 API 自动更新），但**不会**自动部署网站——index.html 必须另行托管（§13.5）。**绑定非必需**：不绑定也可以粘贴代码部署，功能完全一样，仅"改代码后需要手动粘贴"的差别；且绑定只服务于 API 更新，与网站上线无关
- 浏览器直接打开 Worker 地址只会看到 JSON（`unauthorized` / `not-found`），这是正常现象，不是故障
- 网站部署到 Pages 后，访问 Pages 地址看到深色 Beryl 登录页即正常

**合体模式（推荐）：一个 Pages 项目搞定网站 + API**

仓库里的 `_worker.js` 是 Pages 合体版（API 逻辑 + 静态资源转发）。把 `index.html` 与 `_worker.js` 一起部署到 **Cloudflare Pages**（上传或 Git 集成），则：

- 网站：`https://<项目名>.<子域>.pages.dev/`
- API：`https://<项目名>.<子域>.pages.dev/api/data`（同地址，前端「☁️ Cloudflare」填 `https://<项目名>.<子域>.pages.dev`）
- KV 绑定到 Pages 项目（变量名 `BERYL_KV`）后，原独立 Worker（beryl-api）即可删除
- 同步密码沿用同一 KV（beryl-kv），**无需重新设置**；`/api/setup/` 尾斜杠已兼容

> 两种部署选一即可：**独立 Worker + Pages 网站**（两个项目两个地址）或 **Pages 合体**（一个项目一个地址，推荐）。

**关于 GitHub 绑定（可以解除，不影响任何已部署内容）：**
- 绑定 = "push 自动部署"的传送带；**解除绑定 ≠ 删除项目 ≠ 丢数据**——已部署的代码照常运行，KV 数据完全不受影响
- Pages 绑定建议保留（网站频繁更新）；Worker 绑定可留可解（API 稳定后基本不改）
- 如何判断 API 由谁提供：浏览器打开 `Pages地址/api/data`——返回 `unauthorized` 说明 Pages 是合体模式（独立 Worker 可删）；返回 404 说明 API 由独立 Worker 提供（该 Worker 项目别删，绑定可解）

### 13.1 部署 Worker（约 10 分钟）

> 需要三个东西：一个 Worker（跑 API 代码）、一个 KV 命名空间（存数据）、一次绑定（`BERYL_KV`）。部署方式任选：**Dashboard 粘贴**或 **Git 集成（push 自动构建）**。

#### 13.1.1 创建 KV 命名空间

1. 注册 Cloudflare 账号（免费）→ 登录 https://dash.cloudflare.com
2. **Workers & Pages → KV** → 创建命名空间 → 名称填 `beryl-kv`（记下这个名字）

#### 13.1.2 部署 Worker 代码

**方式 A：Dashboard 粘贴（推荐，简单直观）**

1. Workers & Pages → 创建应用程序 → Worker → 名称填 `beryl-api` → 部署（先用默认模板）
2. 进入 Worker → **编辑代码** → 清空编辑器 → 粘贴 `worker.js` 全部内容 → **部署**

**方式 B：Git 集成（push 自动构建）**

1. Workers → 创建 Worker → 选择 **连接 Git 仓库**（GitHub，授权后选你的 `beryl` 仓库）
2. 之后每次 `git push` 自动触发构建：项目 → **Deployments 标签** 查看状态（绿色 = 构建成功；红色 = 点进去看日志）
3. 首次部署后仍需把 `worker.js` 作为 Worker 入口（若仓库根目录文件不是 worker.js，需在构建配置里指定）

#### 13.1.3 绑定 KV 命名空间

> 旧版路径在「设置 → 变量与机密 → KV 绑定」，新版统一在 **Bindings 标签**：两者等效，以你看到的界面为准。

1. Worker 详情 → **设置 → 变量与机密 → KV 命名空间绑定**（新版：**Bindings 标签**）→ 添加绑定
2. 变量名填 **`BERYL_KV`**（必须与 `worker.js` 里一致）→ 选择命名空间 `beryl-kv` → 保存
3. 回到 **Bindings 标签**：应能看到 `BERYL_KV → beryl-kv`——看到它就说明绑定生效
4. **绑定后重新部署一次**（改动绑定不会自动触发部署）：Pages 项目 → **Deployments 标签** → 最近一条部署右侧 **"⋯" → Retry deployment**（重试部署）；Git 集成模式也可用 `git commit --allow-empty -m "retry"` + `git push` 触发；上传模式可重新上传文件。等状态变绿色 Success 即可

#### 13.1.4 设置同步密码（仅一次，先想好再执行）

**为什么要设？** Worker 的地址（`https://beryl-api.xxx.workers.dev`）是**公网地址**，任何人都能访问。没有密码，谁拿到 URL 就能读走或清空你的全部数据。**同步密码 = 云端数据的唯一门禁**：前端每次请求都带 `Authorization: Bearer <同步密码>`，Worker 比对 SHA-256 哈希通过才返回数据（云端只存哈希，不存明文）。

**为什么仅一次？** 设置接口本身不需要密码（此时还没有密码），如果允许重复设置，任何知道你 URL 的人都能抢先改密码把你锁在门外。所以设计成**首次设置后永久锁定**。

1. 在 Worker 的 **Overview 页**复制你的地址（形如 `https://beryl-api.<你的子域>.workers.dev`）
2. PowerShell 执行（**请先想好并记牢密码，至少 6 位，建议 10 位以上**）：
   ```powershell
   Invoke-RestMethod -Method Post -Uri "https://beryl-api.<你的子域>.workers.dev/api/setup" -ContentType "application/json" -Body '{"password":"你的同步密码"}'
   ```
3. 返回 `{"ok":true}` ＝ 成功；返回 `{"error":"already-setup"}` ＝ 之前已设置过，用原来的密码
4. 把「地址 + 同步密码」记进密码管理器

**执行常见错误：** 返回 `{"error":"not-found"}` ＝ 请求到了 Worker 但**路径或方法不匹配**。按顺序排查：
1. **必须在 PowerShell 执行（POST）**，不能直接在浏览器地址栏打开（浏览器是 GET，必然 not-found）；检查命令里有没有 `-Method Post`
2. URL 必须完整：`https://beryl-api.<子域>.workers.dev/api/setup`——不能少 `/api`、不能有尾斜杠、`<子域>` 必须替换成自己的
3. 自检代码是否部署成功：浏览器打开 `.../api/data` —— 返回 `{"error":"unauthorized"}` ＝ 代码正常（问题只在 setup 请求）；返回 `not-found` ＝ URL 或部署位置问题；返回 `Hello World!` ＝ 还是默认模板，没粘贴 `worker.js`
4. 确认部署在 **Workers**（不是 Pages）；Git 集成部署看 Deployments 标签为绿色，绑定 KV 后需重新部署一次
5. **兜底**：在 KV 控制台手动添加键 `auth`（值为密码的 SHA-256 哈希，可用在线工具计算），效果与 setup 相同

**忘记密码 / 想改密码怎么办？** Cloudflare 控制台 → Workers → KV（`beryl-kv`）→ 查看键 → **删除 `auth` 键** → 重新执行上面的 setup 命令设置新密码。

**它和 Beryl 登录密码的区别：**

| | Beryl 登录密码 | 云端同步密码 |
| --- | --- | --- |
| 管什么 | 设备本地登录 | 云端数据读写 |
| 每设备独立？ | 是 | **否（全局唯一，所有设备共用）** |
| 建议 | 与同步密码不同 | 至少 10 位，记入密码管理器 |

#### 13.1.5 前端连接云端

1. 浏览器打开 Beryl → 若界面没有「☁️ Cloudflare」按钮，按 **Ctrl+F5 强制刷新**（旧缓存看不到新功能）
2. 登录 → 后台管理 → 「🔄 数据同步」→ 点击 **「☁️ Cloudflare」**
3. 填入：
   - API 地址：`https://beryl-api.<你的子域>.workers.dev`（不带 `/api/data`）
   - 同步密码：13.1.4 设置的密码
4. 点「连接」→ 卡片状态变为 **「☁️ 已连接云端：…」** 即成功
5. 首次连接若云端与本地都有数据 → 弹窗选择「使用云端数据」或「使用本机数据」
6. 之后全自动：本地变更 0.8s 上传、云端更新 15s 拉取（手动点「连接」之后无需任何操作）

**连接失败排查：** 提示"密码错误"＝ 密码不对或没执行 13.1.4；提示"连接失败"＝ 地址拼写（多了 `/api/data`、少了 `https://`）或网络问题；返回 `unauthorized` ＝ 未设置同步密码。

### 13.2 换设备使用

1. 新设备浏览器打开 Beryl（本地或已部署的站点均可）
2. 登录（首次需设置本地密码）→ 后台 → ☁️ 连接云端 → 填同一 API 地址 + 同步密码
3. 若云端与本地都有数据 → 弹窗选择数据源；之后自动双向同步（前台 5s 轮询）

### 13.3 绑定自定义域名（可选，绑定免费）

1. 在任意注册商购买域名（如 `beryl.example.com`，约 10–50 元/年）
2. Cloudflare 添加站点（Add a site）→ 输入域名 → 按提示把域名的 NS 记录改为 Cloudflare 提供的两个地址（注册商处修改）
3. 等 DNS 生效（几分钟到几小时）→ Worker 详情 → **设置 → 域与路由 → 添加 → 自定义域** → 填 `api.beryl.example.com`
4. 前端连接时 API 地址换成 `https://api.beryl.example.com` 即可

### 13.4 费用与限额（免费计划）

| 项目 | 免费额度 | Beryl 实际用量（约） |
| ---- | -------- | -------------------- |
| Worker 请求 | 10 万次/天 | 轮询 15s ≈ 5,760 次/天 |
| KV 读 | 10 万次/天 | 同上 |
| KV 写 | 1 千次/天 | 每 0.8s 防抖合并一次写入，远低于限额 |
| 自定义域名 | 免费 | — |

### 13.5 网站本身的展示部署

> ⚠️ **网站与 API 是两个独立的部署、两个地址**：Worker（`worker.js`）只提供数据接口，浏览器直接打开它只会看到 JSON；网站（`index.html`）必须另部署到静态托管，见下。**推荐用合体模式**（§13.0）：把 `index.html` 与 `_worker.js` 一起部署到 Cloudflare Pages，一个项目同时是网站和 API。

- 云端模式只负责数据；网站页面仍可用任意静态托管展示：
  - **Cloudflare Pages（推荐，与 Worker 同账号）**：Workers & Pages → Pages → 创建项目 → 连接 Git 仓库（或直接上传 `index.html` + `_worker.js`）→ 框架预设 None、输出目录 `/（根目录）` → 部署后得到 `https://beryl.你的子域.pages.dev`；之后每次 `git push` 自动重建
  - **GitHub Pages**（见 §11，仅网站，API 仍需 Worker 或合体 Pages）
  - 托管后把站点 URL 发给 Claude 或任何设备/工具即可访问展示

### 13.6 国内云（S3 兼容对象存储）部署指南

> 前端「🗄️ 国内云(S3)」填 5 项配置即可直连（浏览器内 SigV4 签名，无需服务器）。三件事：① 创建 Bucket；② 创建子账号密钥；③ 配置 CORS。以下以三家主流厂商为例。

#### 阿里云 OSS

1. 开通 OSS → 创建 Bucket（读写权限建议「私有」）→ 记下 Endpoint（如 `https://oss-cn-hangzhou.aliyuncs.com`）与 Region（`cn-hangzhou`）
2. RAM 访问控制 → 创建用户（仅编程访问）→ 生成 AccessKey ID / Secret → 授权策略：`AliyunOSSFullAccess`（或更细的自定义策略仅限该 Bucket）
3. Bucket → 数据安全 → **跨域设置（CORS）** → 添加规则：
   - 来源：`*`（或你的站点域名）｜方法：`GET, PUT`｜允许 Headers：`*`（至少含 `Authorization, x-amz-*`）｜暴露 Headers：`ETag, Last-Modified`｜缓存时间：600

#### 腾讯云 COS

1. 创建存储桶（访问权限「私有读写」）→ 记下 Endpoint（如 `https://cos.ap-guangzhou.myqcloud.com`）与 Region（`ap-guangzhou`）
2. 访问管理 CAM → 新建子用户（编程访问）→ 关联策略 `QcloudCOSFullAccess` → 生成 SecretId / SecretKey
3. 存储桶 → 安全管理 → **跨域访问 CORS 规则** → 添加规则：来源 `*`｜操作 `GET, PUT`｜Allow-Header `*`｜Expose-Header `ETag, Last-Modified`｜Max-Age 600

#### 华为云 OBS

1. 创建桶（权限「私有」）→ 记下 Endpoint（如 `https://obs.cn-north-4.myhuaweicloud.com`）与 Region（`cn-north-4`）
2. 我的凭证 → 访问密钥 → 新增访问密钥（AK/SK）；IAM 授权 `OBS OperateAccess`
3. 桶 → 权限 → **CORS 规则** → 添加：AllowedOrigin `*`｜AllowedMethod `GET, PUT`｜AllowedHeader `*`｜ExposeHeader `ETag, Last-Modified`｜MaxAgeSeconds 600

#### 前端连接

后台 → 「🔄 数据同步」→ 「🗄️ 国内云(S3)」→ 填 Endpoint / Bucket / Region / AccessKey / SecretKey → 连接。之后任何设备填入相同配置即可读写同一份数据（`beryl-data.json`）。

> ⚠️ 安全提示：密钥以明文存于浏览器本地（`b_s3`），请务必使用**子账号 + 最小权限**；泄露后到云控制台吊销重建。敏感数据建议启用对象存储服务端加密（SSE）。

### 13.7 常见问题（FAQ）

**Q：访问 `pages.dev/api/data` 报 `Error 1101 Worker threw exception`？**
A：Pages 项目**没有绑定 KV**（`env.BERYL_KV` 为 undefined，代码一执行就抛异常）。修复：Pages 项目 → 设置 → 变量与机密 → **KV 命名空间绑定** → 变量名 `BERYL_KV`、选 `beryl-kv` → 保存 → **重新部署一次**。出现 1101 反而证明 `_worker.js` 已在 Pages 中生效，只差绑定。

**Q：打开地址看到 `{"error":"not-found"}` 一片空白？**
A：你访问的是 **Worker 数据 API 地址**（`beryl-api.xxx.workers.dev`），不是网站。网站（index.html）需要另行部署到静态托管：本地直接双击 `D:\dsharness\index.html`，或部署到 Cloudflare Pages / GitHub Pages（见 §13.5、§11）。Worker 地址只用于前端「☁️ Cloudflare」连接配置，浏览器直接打开它只会看到 JSON。两个地址分工：

| 东西 | 地址形态 | 打开看到 |
| ---- | -------- | -------- |
| 网站 | `https://beryl.xxx.pages.dev` 或 `https://<用户>.github.io/beryl/` | Beryl 登录页 |
| 数据 API | `https://beryl-api.xxx.workers.dev` | JSON（unauthorized / not-found） |

**Q：后台看不到「☁️ Cloudflare / 🗄️ 国内云(S3)」按钮？**
A：是旧版本缓存。本地打开按 **Ctrl+F5** 强制刷新；部署在 Pages 的站点需确认已 push 最新代码并等待构建完成后再强刷。v1.6.0 起才有这两个按钮。

**Q：`/api/setup` 返回 `{"error":"not-found"}`？**
A：请求到了 Worker 但路径或方法不匹配。最常见：在浏览器地址栏打开了 URL（GET 而非 POST，必须在 PowerShell 执行 `-Method Post`）；或 URL 少了 `/api`、带了尾斜杠、`<子域>` 占位符未替换。自检：浏览器打开 `.../api/data`，返回 `unauthorized` 说明代码正常；返回 `Hello World!` 说明没粘贴 worker.js。兜底方案见 §13.1.4 第 5 条（KV 控制台手动加 `auth` 键）。

**Q：`/api/setup` 返回 `already-setup`？**
A：说明同步密码之前已设置过（全局唯一）。请回忆原来的密码；确实忘了就去 KV（`beryl-kv`）删除 `auth` 键后重新执行 setup。

**Q：连接时提示密码错误 / `unauthorized`？**
A：密码不对，或 Worker 从未执行过 setup。也可能是 KV 绑定未生效（检查 Bindings 标签有 `BERYL_KV → beryl-kv`，且绑定后重新部署过）。

**Q：为什么打开网页没有自动连接云端？**
A：v1.9.0 起**会自动重连**：只要在「☁️ Cloudflare / 🗄️ 国内云(S3)」连接过一次（配置已保存），刷新/重开页面就会自动重连并立即拉取最新数据；连接失败时静默降级为「🟡 已保存配置（未连接）」，点按钮手动重连即可（不会弹失败打扰）。

**Q：换设备/换浏览器怎么用云端数据？**
A：新设备登录 Beryl → 后台 → ☁️ Cloudflare → 填**同一** API 地址 + 同步密码 → 连接。云端数据自动拉取；若新设备本地也有数据会弹窗让你选择数据源。

**Q：账号密码存在云端吗？**
A：**不存**。登录账号密码（`b_auth`）只在本机浏览器（PBKDF2 哈希，每设备独立）；云端只保存 D1 `auth` 表中的同步密码哈希（新格式 PBKDF2，兼容旧 SHA-256）和经过 AES-GCM 保护的业务记录。换设备时：新设备用默认凭据登录 → 设置本设备密码 → 连接云端拉取数据。

**Q：数据存在哪？安全吗？**
A：当前云端业务记录存于 D1 `records` 表，值为前端 AES-GCM 密文，读写需 Bearer 同步密码；KV 仅保留为旧数据/认证迁移兼容层。S3 模式仍由用户自行配置对象存储权限。

**Q：免费额度够用吗？**
A：当前 Cloud 模式前台每 5s 轮询，具体配额以 Cloudflare 当前套餐为准；同步仍支持手动触发和窗口切换即时拉取。

**Q：能同时用 Cloudflare 和国内云（S3）吗？**
A：同一时刻只能连接一种模式（本地/文件/Cloudflare/S3 互斥）。想双写备份可先手动「导出」再在另一模式「导入」，或使用 rclone 方案（见 §11.6）。

---

## 14. v2 历史架构规划（2026-08-14 快照）

> 本节保留当时的规划快照，不代表当前实现。当前仓库是 `D:\dsharness`，以 §17 和 [`docs/PROJECT_STRUCTURE.md`](../PROJECT_STRUCTURE.md) 为准；条目级 IndexedDB 主存储与默认实体云同步尚未启用，实体级接口仅作为兼容层存在。

### 14.1 定稿决策（经商讨确认）

| 决策点 | 结论 |
| ------ | ---- |
| 路线 | **A：Serverless + Vue 生态**（不用若依/芋道：需 Java 服务器+MySQL，违背零成本约束；前端技术栈对齐若依-Vue） |
| UI 框架 | **Vue 3 + Vite + TypeScript + Element Plus + Pinia + Vue Router**（hash 路由，适配静态托管） |
| 同步策略 | 规划为按条 LWW；当前实际为键级增量 LWW（复合游标 + AES-GCM 密文） |
| 云端后端 | **Cloudflare D1**（SQLite，事务与查询；替换整包 KV 快照） |
| 账号体系 | 保持本地登录（每设备独立，PBKDF2）；云端仅数据同步 |
| 增强 | **PWA**（离线可用、可安装）+ **数据 AES-GCM 加密**（主密码派生密钥，云端密文） |

### 14.2 分层架构

```
UI 层：Vue3 组件 + Element Plus + 路由（#/login #/home #/tasks …）
领域层：纯函数业务逻辑（统计、打卡、番茄状态机，可单测）
数据层：localStorage 兼容层 + IndexedDB 镜像/变更日志 + 元数据
同步引擎：键级增量同步（复合游标）+ LWW；传输适配器（Cloudflare API/S3/文件导出）
基础设施：本地认证 / AES-GCM 加密 / PWA / 错误边界
```

### 14.3 数据模型（IndexedDB 表）

```
实体表：tasks / inbox / habits / goals / finance / diary / chars / posts
  每条：{ id, …, updatedAt, deviceId, deleted(墓碑) }
changes：{ seq, deviceId, ts, op, table, id, data }（离线队列/增量来源）
meta：配置 / 会话 / 同步游标
```

### 14.4 同步协议（Worker + D1）

```
POST /api/sync/push { changes[] } → 逐条应用，LWW 决胜
POST /api/sync/pull { since, sinceDevice, sinceKey } → 返回分页游标之后的变更
```

### 14.5 迁移路线（5 阶段，每阶段可独立上线、可回退）

| 阶段 | 内容 | 状态 |
| ---- | ---- | ---- |
| 1 | 工程化重构：Vite+Vue3+TS，功能平移 | ✅ 完成（登录/场景/首页/9 模块/后台/同步引擎全部平移；构建 ✅；node 核心测试 15 项 ✅；部署见 §15） |
| 2 | IndexedDB 镜像、键级变更日志、启动恢复和版本迁移 | ✅ 当前实现（实体日志仅本地） |
| 3 | 键级增量同步、复合游标、LWW、加密传输 | ✅ 当前实现；实体级云同步待规划 |
| 4 | Worker/D1、旧 KV 迁移、旧 API 兼容 | ✅ 当前实现 |
| 5 | PWA、AES-GCM、工程打磨 | 部分完成；PWA precache 和体验项待完成 |

保底：每阶段保留导出/导入与旧版回退；v1 与 v2 数据格式在阶段 1 完全兼容（共用 localStorage 键）。
---

## 15. v2 部署指南（Pages 前端 + Worker 后端）

> 自 2026-08-16 起，网站与数据 API 分离部署：Cloudflare Pages 只托管 Vue 静态产物，Cloudflare Worker 只提供 `/api/*` 与 D1 数据访问。现有本地数据、同步协议和旧 KV 迁移能力保持不变。

### 15.1 构建

```powershell
cd D:\dsharness
npm install          # 首次（沙箱环境需加 --ignore-scripts；正常环境不需要）
npm run build        # 产物输出 dist（纯静态，不再包含 Worker）
npm run test:node    # 核心逻辑测试（15 项，沙箱可用）
npm test             # 组件测试（vitest，建议本机运行）
```

### 15.2 部署后端 Worker

1. 在 Cloudflare D1 控制台复制数据库 ID，填入 `backend/wrangler.toml` 的 `database_id`。
2. 将 `FRONTEND_ORIGINS` 改为 Pages 站点地址；有自定义域名时可用英文逗号追加多个来源。
3. 首次从旧 KV 迁移时保留 `BERYL_KV` 绑定；确认 D1 已有数据后可删除该段配置。
4. 执行 `npm run deploy:api`，得到 `https://beryl-api.<账户>.workers.dev`；也可为它绑定 `api.你的域名`。
5. 首次设置同步密码：`Invoke-RestMethod -Method Post -Uri "https://<API 地址>/api/setup" -ContentType "application/json" -Body '{"password":"你的同步密码"}'`。

### 15.3 部署前端 Pages

1. Pages → 创建项目 → 连接仓库，根目录 `/`、构建命令 `npm run build`、输出目录 `dist`。
2. 在 Pages 的环境变量添加 `VITE_API_BASE_URL=https://<API 地址>`，然后重新部署。该值会自动带入后台的 Cloudflare 地址输入框，仍可手动覆盖。
3. `dist` 不含 `_worker.js`；访问 Pages 地址的 `/api/*` 返回 404 属于预期，API 应访问 Worker 地址。

### 15.4 验证与连接

1. 浏览器访问 `https://<API 地址>/api/data`，应得到 `{"error":"unauthorized"}`。
2. 浏览器打开 Pages 网站 → 后台管理 →「Cloudflare」；地址会预填 `VITE_API_BASE_URL`，输入同步密码后连接。
3. 后端 API 与前端 Pages 可独立更新；部署前端不会重启或覆盖 D1 数据。

### 15.5 与 v1 的关系

| | v1（index.html） | v2（v2/dist） |
| --- | --- | --- |
| 状态 | 稳定版，继续可用 | 阶段 1 功能平移完成，可并行体验 |
| 数据 | 共用 localStorage 键 | 共用（格式兼容） |
| 后续 | 冻结新功能 | 阶段 2 起能力升级（IndexedDB/增量同步/加密） |

---

## 16. 架构演进基线（2026-08-16）

前后端继续保持分离：Pages 只部署 Vue 静态前端；`backend/` 的 Worker 提供 API 并绑定 D1。以下基础设施用于后续演进，均不改变现有 `b_*` 数据格式与键级云同步协议。

- **Repository**：新增 `src/core/repository.ts`，领域模块应逐步使用 `list/create/update/remove`，而不是直接操作浏览器存储。博客已作为首个迁移模块。
- **持久化**：localStorage 目前仍是兼容读写层；IndexedDB 保存镜像、键级同步日志及新增的实体级本地变更日志。后续可迁移为 IndexedDB 主存储，不改变 Repository 调用方。
- **同步状态**：`sync.phase` 显式表示 `idle / dirty / syncing / offline / conflict / error`，界面展示当前同步状态与错误原因。
- **内容系统**：`ContentEditor` 与安全的 `ContentRenderer` 提供统一 Markdown 编辑/渲染入口；博客已接入，日记、随想、人物将在后续逐步接入。
- **Worker 分层**：HTTP/CORS 响应与认证哈希已拆至 `backend/src/lib/`；路由和 D1 数据访问将按 API 领域继续拆分。
- **API 边界**：前端通过 `src/core/api/client.ts` 请求独立 Worker，统一处理超时、网络错误与 URL 拼接；`GET /api/health` 可在不携带密码的情况下确认 Worker/D1 部署状态，且不返回用户数据。

> 实体级变更日志目前仅在本地生成，用于验证和后续迁移；云端仍使用经过验证的键级加密 LWW 协议。待完成旧数据回填、双端合并与回滚方案后，再单独启用实体级云端同步，避免影响已有用户数据。

### 16.1 Case-centered v3（兼容式启用）

`Case`（现实课题）是新增的顶层领域对象，而不是替换既有模块。一个课题包含问题、期望结果、状态、当前五行阶段与五个独立工作区：木（定义）、火（行动）、土（沉淀）、金（判断）、水（复盘）。

- 数据：`b_cases` 与 `b_caseRelations` 已纳入现有加密同步。
- 关系：`CaseRelation` 通过 `caseId + targetType + targetId` 引用任务、日记、人物、财务和文章，不复制原始数据。
- 自由过程：五行表示当前工作的侧重点，不是审批流；允许跳过、回退、反复进入。
- 兼容性：原来的任务、日记、人物、财务、博客、收集箱等模块保持独立可用；火阶段目前可直接新建并关联任务。

### 16.2 Case 工作区职责

- **木**：问题、期望结果、限制条件和可能路径。
- **火**：新建或关联已有任务；任务仍是工具数据，Case 只保存关联。
- **土**：关联人物、日记、财务记录和文章，并记录资源摘要。
- **金**：结构化保存判断主题、备选项与结论。
- **水**：保存复盘；可把新的问题直接新建为下一轮待梳理 Case。

首页改为“正在解决 / 今日行动 / 待处理收集箱”优先。收集箱条目可转为 Case（待梳理）或任务（行动）；导航优先展示首页、现实课题和收集箱，其余旧模块收纳为工具。

---

## 17. 当前权威状态与下一轮清单（2026-08-16）

> **本节优先级最高。** 第 1–13 节含有 v1 单文件、KV、Pages 合体 API 等历史记录，仅用于追溯；与本节或 §15–16 冲突时，以本节为准。

### 17.1 已完成

| 范畴 | 当前实现 |
| --- | --- |
| 前后端部署 | Vue 前端由 **Cloudflare Pages** 托管；`backend/` 中的独立 **Cloudflare Worker** 提供 API，并使用 **D1** 存储。前端与 API 不能混用地址。 |
| 前端 API | `src/core/api/client.ts` 集中处理 API 基地址、超时和错误；`VITE_API_BASE_URL` 会预填后台的 Worker 地址。 |
| 同步 | Cloudflare 默认使用安全优先的**实体级增量 LWW 同步**：集合按实体和 tombstone 增量传输，云端保存 AES-GCM 密文；场景等标量仍走键级协议，D1 为唯一云端来源。 |
| 本地数据 | `localStorage` 仍为兼容数据层；IndexedDB 维护镜像与本地实体变更日志。`b_cases`、`b_caseRelations` 已被纳入同步键。 |
| 领域模型 | 现实课题（Case）为顶层对象；木/火/土/金/水分别负责定义、行动、资源、判断和复盘。Case 通过关系表引用任务、人物、日记、财务、文章，不复制原始数据。 |
| 交互 | 收集箱条目可转行动或课题；课题的火阶段可新建/关联任务，土阶段可关联资源；首页与课题页均优先显示正在推进的事项。 |
| 动态/评论 | 新增 `b_moments` 动态集合：单人发布、可见范围、点赞、评论、回复线程和删除；作者、成员与可见范围字段已为多人扩展预留。 |
| UI（本轮） | 已重做全局颜色、字体、桌面侧栏、移动端底部导航、工作台、课题列表、课题详情阶段导航、任务与收集箱；QuoteWall 已重新接入首页，旧工具仍保留在工具箱内。 |
| 校验 | 当前 `npm run build`、`npm test`（48 项）、`npm run test:node`（15 项）、`npm run test:e2e`（19 项）、`npm run test:pwa` 均通过；主入口 JS 约 391 KB，未触发 500 KB chunk 警告。 |
| 兼容同步 | `entity_records` 与 `/api/entity-sync/*` 已成为 Cloudflare 默认集合同步路径；键级同步保留用于标量键和兼容镜像。 |

### 17.2 当前界面信息架构

```
工作台
├── 快速记录 → 收集箱 / 行动 / 现实课题
├── 正在推进的现实课题
└── 今日行动、收集箱数量、已解决数量

现实课题
├── 木：问题、结果、限制、可能路径
├── 火：行动任务
├── 土：人物 / 日记 / 财务 / 文章等资源关系
├── 金：备选项与结论
└── 水：复盘与下一轮课题

工具箱
└── 动态、任务、习惯、日记、番茄钟、财务、目标、人物、文章等模块
```

### 17.3 尚未实现（按优先级记录，不能误称已完成）

**P0：数据与同步正确性**

- [x] 实体级同步已成为 Cloudflare 默认流程：首次连接自动迁移本地集合，之后按实体游标增量拉取、AES-GCM 加密推送、LWW/tombstone 合并；键级协议继续保留用于标量键和兼容镜像。
- [x] 已实现旧快照 → 实体同步的迁移计划、本地回滚快照、冲突扫描和加密推送；首次连接会自动执行安全边界内的迁移，后台仍可查看计划并回滚。
- [x] 补齐当前键级和实体级同步端到端测试（setup、鉴权、LWW、KV/D1 迁移、复合游标、tombstone）。
- [x] KV 已退役：Worker 与 `backend/wrangler.toml` 已移除 KV 绑定和认证/数据回退；D1 是唯一云端来源。

**P1：课题系统可用性**

- [x] 任务、日记、人物、财务、文章列表已增加直接“关联课题”入口；新建后可立即关联，原始数据不复制。
- [x] 任务已支持截止日期、排序、筛选和课题上下文。
- [x] 支持 Case 的优先级、截止日期、归档/删除确认、阶段完成度与跨课题搜索。
- [x] 水阶段改为独立、明确的“下一轮课题标题”输入，避免把整段复盘当作标题。
- [x] 土阶段支持快捷创建人物、日记、财务和文章，并自动建立资源关联。

**P2：产品体验与工程质量**

- 其余旧模块的视觉、移动端和回归收口已移入 [`../product/OPEN_WORK.md`](../product/OPEN_WORK.md) 的 OW-07/OW-08；本历史文件不再维护未完成任务。
- [x] QuoteWall 已重新接入首页；全局课题搜索/命令面板、8 秒撤销删除、统一空状态和主要控件基础无障碍标签已加入。
- [x] 数据 AES-GCM 传输加密已启用，构建后会把 hash 资源写入 PWA precache；`npm run test:pwa` 已执行本地离线资源完整性演练，真实设备安装仍建议再做一次人工确认。
- [x] Worker 已拆出 `backend/src/lib/d1.js` 和 `backend/src/routes/sync.js`；更细的业务路由拆分仍属于低收益整理。
- [x] Element Plus 改为按实际组件注册，入口 JS 约 392 KB；样式和资源按需拆分的后续工作统一见 [`../product/OPEN_WORK.md`](../product/OPEN_WORK.md) 的 OW-07。

### 17.4 部署现实与注意事项

- Cloudflare 的 `workers.dev` 子域属于账户级资源，**修改 Cloudflare 显示用户名不会改变它**；需要易读地址应绑定自定义域名。
- Pages 与 Workers 在部分中国大陆网络环境可能不可直连；这是网络可达性问题，代码分离不能解决。业务若必须稳定中国大陆访问，需要国内 CDN/对象存储或国内后端方案，属于架构扩展。
- Pages 环境变量：`VITE_API_BASE_URL=https://<你的 Worker>.workers.dev`；Worker 变量：`FRONTEND_ORIGINS=https://<你的 Pages>.pages.dev`（有自定义域名时用逗号追加）。
- D1 绑定为必需。KV 仅为旧迁移兼容，不是新部署必需；若当前仍有旧 KV 数据，先迁移和验证，不能直接删除。
- 2026-08-17 生产检查：Worker `/api/health` 正常，旧 `/api/sync/pull`、新 `/api/entity-sync/pull` 和 `/api/kv-status` 未授权均返回 401；KV 已从生产绑定移除。当前 Worker 版本 ID：`264a4304-56b4-473d-8e12-80fb4e8c2caa`。
- Worker 已部署到 `https://beryl-api.3091634749.workers.dev`，版本 ID：`264a4304-56b4-473d-8e12-80fb4e8c2caa`；`/api/health` 返回 200，实体/键级同步未授权均返回 401。
- Pages 前端已部署到项目 `beryl`；本轮预览地址：`https://5aa02cbf.beryl-ddk.pages.dev`，主域名 `https://beryl-ddk.pages.dev` 返回 200；`/sw.js` 返回 200 且包含 hash 资源清单。

### 17.5 文档维护规则

任何后续代码改动不再在本历史文件拆分任务；已实现项以实现总档案为证据，未完成项统一写入 `../product/OPEN_WORK.md`，交接摘要写入当前交接索引。不要再把旧的 v1 或 KV 描述当作当前部署说明。
