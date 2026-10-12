# Calmy Reference Stage Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将全站前端迁入参考附件的全屏 Stage 架构，复用所有现有业务页面与数据能力。

**Architecture:** AppShell 负责路由、实体搜索、权限清单与保存事件；StageToolbar、StageNavigation 和 StageIcon 负责共享界面。框架中立的 stage-presentation 保存前端模式；reference-stage.css 统一主题、控件、页面原型和响应式结构。

**Tech Stack:** Vue 3、Vue Router、TypeScript、现有 Element Plus；不新增依赖。

**Spec:** docs/superpowers/specs/2026-10-04-reference-stage-frontend-design.md

## 2026-10-04 源码迁移修正（替代下方最初方案）

用户反馈原方案与附件效果不同。根因是继续使用旧业务页面模板，只修改外壳和共享样式。

- [x] 原附件完整 CSS 经 PostCSS 解析后迁移至 reference-native.css；只增加作用域与旧样式隔离，不再近似重画。
- [x] 六个原生 slide 同时挂载于 ReferenceStagePages.vue，保留 inner 滚动、面板层级、标题比例、日期导航、输入布局、习惯圆点与复盘柱图。
- [x] ReferenceAppShell.vue 提供六主题、左右线段导航、边缘显隐、三档 HUD、简洁/禅模式、命令面板、键盘与内容边界滚轮/触摸切换。
- [x] 真实数据接现有 Action / Today / Habit / Diary / Capture / Record 仓库；未添加演示数据或修改后端模型。缺失的注意力预算和评分不伪造数值。
- [x] 顶部直接可见“全部模块”入口；新旧外壳均可按原分组进入全部可访问模块。目录内原模块直接打开完整操作，额外页面保留原 URL。
- [x] 独立静态代码审查；修复保存互斥导致的专注丢失、旧习惯 dates 缺失、手机触摸滚动和长笔记自动增高。
- [x] Vite 打包通过（需正常权限启动 esbuild）。vue-tsc 仍只有既有 vault-sync.ts:189 类型错误。
- [ ] 登录后六模块桌面/手机视觉核对。当前可操作的内置浏览器停在登录页，外部浏览器登录会话不共享；等待用户在内置页登录或提供截图。

以下为最初方案的历史记录，不能作为本次原生六模块的验收证据。旧截图仅覆盖此前四个主流程；本次未新增或运行测试。

## Global Constraints

- 保留业务流程、页面能力、路由 URL、鉴权、Repository、同步、用户数据。
- 本地改动；不提交、不推送、不部署。
- 普通方向键和滚轮保持原生行为；快捷键避让输入和弹层。
- 主界面支持 320px、390px、1280px、1440px 和明暗主题；保存失败和冲突始终可见。
- 不新增实现镜像测试；新增测试验证真实交互约束，复用已有业务测试。

## Task 1: 前端展示偏好

**Files:** Create `src/ui/stage-presentation.ts`, `src/__tests__/stage-presentation.test.ts`。

**Interfaces:** `readStagePresentation(storage?): { mode: 'full'|'simple'; density: 'comfortable'|'compact' }`；`saveStagePresentation(value, storage?): boolean`。

- [x] 写入并运行测试：未知值/损坏 JSON/不可用存储回落，合法偏好可保存读取。
- [x] 实现只使用 `calmy.ui.stage.v1` 的展示偏好，并重新运行测试。

## Task 2: 全站工作台外壳

**Files:** Create `src/vue/shell/StageIcon.vue`, `StageToolbar.vue`, `StageNavigation.vue`, `src/__tests__/vue-stage-shell.test.ts`；Modify `src/vue/shell/AppShell.vue`。

**Interfaces:** Toolbar emits `search`, `directory`, `settings`, `theme`, `density`, `mode`, `immersive`, `context`; Navigation consumes current primary key and emits `navigate(path)`; AppShell continues consuming existing search, workspace tab and save-event APIs。

- [x] 写入交互测试并确认失败：六模块导航、功能目录权限、页面命令键盘选择、搜索恢复焦点、编辑快捷键避让、模式切换保持页面实例、保存失败可见。
- [x] 实现 Stage 组件；替换 AppShell 的固定双侧栏结构为工具栏/导航/标签/页面/状态结构，保留搜索并发保护与所有事件清理。
- [x] 运行新壳层测试，更新旧壳层测试中由本次架构取代的结构断言，保留独立导航和工作区标签行为测试。

## Task 3: 全站视觉接入

**Files:** Create `src/styles/shared/reference-stage.css`；Modify `src/main.ts`, `src/ui/theme-preferences.ts`；保留现有页面逻辑。

- [x] 统一纸白/深夜主题、系统文字层级、控件、焦点、选择、滚动条、轻量标签；后置导入至生产入口。
- [x] 为六个参考模块及列表/内容/日历/看板/设置页面原型定义布局；信息密度只改变前端间距与字号。
- [x] 对新外壳的全屏、手机底部导航、功能目录、搜索面板、简洁/沉浸模式实现响应式规则；自定义画布仍可读。

## Task 4: 验证与交付

- [ ] `npm run build` 及新增偏好/壳层测试，运行现有 Today/Capture/Matters/Review/路由/标签/主题相关测试。当前构建先被工作区既有 `src/core/content/vault-sync.ts:189` 类型错误阻断；Vitest/Vite 复核另受沙箱 `spawn EPERM` 限制，需在允许子进程的环境重跑。
- [ ] 本次原生六模块桌面/手机、六主题、空态/长文本/保存状态的浏览器核对。
- [x] 检测共享 UI 的机械问题；独立设计审查并批量修复材料问题；保存 DESIGN.md 与 token-bearing `.impeccable/design.json`。
- [x] 清理临时预览源码并记录验证结果，保留实际截图与本地改动范围。
