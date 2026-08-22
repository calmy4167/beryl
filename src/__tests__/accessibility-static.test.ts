import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')
const appShell = source('src/views/AppShell.vue')
const router = source('src/router/index.ts')
const admin = source('src/views/AdminView.vue')
const scene = source('src/views/SceneView.vue')
const today = source('src/views/TodayView.vue')
const matters = source('src/views/MattersView.vue')
const review = source('src/views/ReviewView.vue')

describe('静态无障碍语义', () => {
  it('为 AppShell 的核心导航、更多入口和图标提供名称与状态', () => {
    expect(appShell).toContain('id="primary-navigation" class="primary-nav" aria-label="主导航">')
    expect(appShell).toContain(':aria-current="active === \'today\' ? \'page\' : undefined"')
    expect(appShell).toContain('aria-label="打开更多入口"')
    expect(appShell).toContain(":aria-label=\"sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'\"")
    expect(appShell).toContain(':aria-expanded="!sidebarCollapsed"')
    expect(appShell).toContain('id="app-sidebar"')
    expect(appShell).toContain('aria-controls="app-sidebar"')
    expect(appShell).toContain('aria-controls="mobile-more-drawer"')
    expect(appShell).toContain('aria-haspopup="dialog"')
    expect(appShell).toContain(':aria-expanded="drawer"')
    expect(appShell).toContain('<el-drawer id="mobile-more-drawer" aria-label="更多入口"')
    expect(appShell).toContain('aria-label="关闭更多入口"')
    expect(appShell).toContain('.bottom-nav button{min-height:44px}')
    expect(appShell).toContain('calmy_sidebar_collapsed')
    expect(appShell).toContain('<nav class="drawer-links" aria-label="更多入口">')
    expect(appShell).toContain('<header v-if="!isMobile" class="desktop-topbar" aria-label="当前工作上下文">')
    expect(appShell).toContain('<aside v-if="!isMobile" class="right-rail" aria-label="上下文快捷动作">')
    expect(appShell).toContain('<nav v-if="!isMobile" class="command-bar" aria-label="快捷命令">')
    expect(appShell).toContain('role="status" aria-live="polite"')
    expect(appShell).toContain("SAVE_STATE_EVENT")
    expect(appShell).toContain('保存冲突，需要确认')
    expect(appShell).toContain('<span class="brand-mark" aria-hidden="true">C</span>')
    expect(appShell).toContain('Today')
    expect(appShell).toContain('Capture')
    expect(appShell).toContain('课题')
    expect(appShell).toContain('复盘')
  })

  it('为 AdminView 的返回、文件输入、场景和动态状态提供语义', () => {
    expect(admin).toContain('aria-label="返回工作台"')
    expect(admin).toContain('aria-label="选择要导入的 JSON 数据文件"')
    expect(admin).toContain('role="status" aria-live="polite"')
    expect(admin).toContain(':aria-pressed="scene === s.id"')
    expect(admin).toContain('role="region" aria-label="同步诊断结果"')
    expect(admin).toContain(':aria-label="`冲突 ${conflict.calmyId} 的处理方式`"')
  })

  it('将旧 Case、Task、inbox 路径限制为兼容重定向', () => {
    expect(router).toContain("{ path: 'cases', name: 'cases', redirect: '/app/matters' }")
    expect(router).toContain("{ path: 'module/inbox', name: 'legacy-inbox', redirect: '/app/capture' }")
    expect(router).toContain("{ path: 'module/tasks', name: 'legacy-tasks', redirect: '/app/today' }")
    expect(router).not.toContain("component: () => import('@/views/CasesView.vue')")
  })

  it('为 SceneView 的场景组、选择状态和装饰内容提供语义', () => {
    expect(scene).toContain('id="scene-title"')
    expect(scene).toContain('role="group" aria-labelledby="scene-title"')
    expect(scene).toContain(':aria-pressed="selected === s.id"')
    expect(scene).toContain(':aria-describedby="`scene-description-${s.id}`"')
    expect(scene).toContain('<div class="logo" aria-hidden="true">')
    expect(scene).toContain('class="bar" aria-hidden="true"')
  })

  it('为 Today 的结果记录控件提供可访问名称和保存状态', () => {
    expect(today).toContain('aria-label="现实记录内容"')
    expect(today).toContain('aria-label="记录类型"')
    expect(today).toContain('aria-label="结果关联行动"')
    expect(today).toContain('aria-label="记录关联 Matter"')
    expect(today).toContain('role="status" aria-live="polite"')
    expect(today).toContain('recordActionId')
    expect(matters).toContain('role="group" aria-label="Matter 状态筛选"')
    expect(matters).toContain(':aria-pressed="status === item[0]"')
    expect(review).toContain(':aria-pressed="rangeDays === item[0]"')
    expect(review).toContain(':aria-current="selected?.date === day.date ? \'date\' : undefined"')
    expect(review).toContain('aria-label="今日复盘：观，今天实际发生了什么"')
    expect(review).toContain('aria-label="今日复盘：察，哪些条件影响了今天"')
    expect(review).toContain('aria-label="今日复盘：调，明天如何调整"')
    expect(review).toContain('aria-label="今日复盘：下一轮线索"')
    expect(review).toContain('保存今日复盘')
  })

  it('将缺失可访问名称识别为失败边界', () => {
    const unlabeledIconButton = '<button>⌂</button>'
    const unlabeledFileInput = '<input type="file">'
    expect(/aria-label|aria-labelledby/.test(unlabeledIconButton)).toBe(false)
    expect(/aria-label|aria-labelledby/.test(unlabeledFileInput)).toBe(false)
    expect(/aria-label="返回工作台"/.test(admin)).toBe(true)
    expect(/aria-label="选择要导入的 JSON 数据文件"/.test(admin)).toBe(true)
  })
})
