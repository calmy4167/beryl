import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { ElButton, ElDialog, ElDrawer, ElForm, ElFormItem, ElInput, ElOption, ElRadioGroup, ElRadioButton, ElSelect } from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
// ── 旧样式层（迁移期仍在服务未改版页面） ──────────────────────────────
import './styles/main.css'
import './styles/shared/app.css'
import './styles/shared/feishu-workspace.css'
import './styles/shared/feishu-board.css'
import './styles/shared/product-ui.css'
import './styles/controls.css'
// 2026-10-05 已删的四层（核实为死代码后移除）：
//   ui-refresh.css      仅 html.ui-refresh（?ui=refresh）生效，实验层，无人使用
//   tactile-ui.css      603 条规则里 599 条挂在 html.tactile-ui 上，而该 class 运行期从不添加；
//                       仅 7 条活规则（.capture-composer-tools / .master-sentence-error）已搬入 liubai-app.css
//   reference-stage.css 随旧壳 ReferenceAppShell / LegacyAppShell 一起作废（其 --stage-* 无其它引用）
//   reference-native.css 全部规则作用域是 #app .reference-layout，该容器已无人渲染
//   mobile-nav.css      只被 src/views/AppShell.vue（僵尸文件）引用
import './styles/liubai/liubai-v11.css'
// 「留白」应用层：外壳微调 + 旧类名映射 + 表单/第三方控件跟随主题（见文件头注释）
import './styles/liubai/liubai-app.css'
// Calmy Image2 UI 首版：轻量全局导航与 Today 首页视觉层
import './styles/liubai/calmy-image2-ui.css'
import App from './App.vue'
import router from './router'
import { initDb, readKvSnapshot, selectDbAccount } from './core/db'
import { hydrateStoreCache } from './core/storage'
import { migrateData } from './core/migrate'
import { purgeCorruptedEncryptedKeys } from './core/sync'
import { setModuleRealityReader } from './core/modules'
import { listRealityDocuments, type RealityEntityType } from './domain/reality'
import { ensureLegacyMigration } from './domain/legacy/migration'
import { applyBackgroundPreferences } from './ui/theme-preferences'
import { restoreSession } from './core/api/auth'
import { apiBaseUrl } from './core/api/base-url'
import { hasUnlockedVault } from './core/vault-keys'

setModuleRealityReader(type => listRealityDocuments({ types: [type as RealityEntityType] }))

const app = createApp(App)
app.use(createPinia())
app.use(router)
// 只注册实际使用的组件，避免把 Element Plus 全量运行时代码打进首屏。
for (const [name, component] of Object.entries({ ElButton, ElDialog, ElDrawer, ElForm, ElFormItem, ElInput, ElOption, ElRadioGroup, ElRadioButton, ElSelect })) {
  app.component(name, component)
}

// 主题初始化：默认浅色；b_theme='dark' 时启用深色（在挂载前设置，避免闪烁）
let savedTheme: string | null = null
try { savedTheme = localStorage.getItem('b_theme') } catch { /* ignore */ }
document.documentElement.classList.toggle('dark', savedTheme === 'dark')
applyBackgroundPreferences(savedTheme === 'dark' ? 'dark' : 'light')

// 「留白」外壳状态：theme / nav / 简洁 / 禅模式。
// 放在 body 上（CSS 以 body[data-theme]、body.nav-show、body.mode-simple 等为选择器），
// 在挂载前设置以避免主题闪烁；运行期切换由 LiubaiShell 负责。
try {
  // 默认使用明亮的纸白主题；用户已保存的主题偏好继续生效。
  const liubaiTheme = localStorage.getItem('liubai-theme') || 'paper'
  const storedNav = localStorage.getItem('liubai-nav') || 'left'
  const liubaiNav = ['left', 'right', 'top', 'bottom'].includes(storedNav) ? storedNav : 'left'
  document.body.dataset.theme = ['night', 'ink', 'forest', 'sunset', 'paper', 'sand'].includes(liubaiTheme) ? liubaiTheme : 'night'
  document.body.dataset.nav = liubaiNav
  if (localStorage.getItem('liubai-mode') === 'simple') document.body.classList.add('mode-simple')
  if (localStorage.getItem('liubai-zen') === '1') document.body.classList.add('zen-mode')
} catch { /* 隐私模式：用默认值 */ }

async function bootstrap() {
  let session = null
  if (apiBaseUrl()) session = await restoreSession(apiBaseUrl())
  if (session && !session.mustChangePassword && await hasUnlockedVault(session.user.id)) {
    selectDbAccount(session.user.id)
    await initDb()
    hydrateStoreCache(await readKvSnapshot())
    migrateData()
    purgeCorruptedEncryptedKeys()
    await ensureLegacyMigration()
  } else {
    // Never hydrate the old shared local database before a server identity is validated.
    selectDbAccount(null)
    hydrateStoreCache({})
    if (session?.mustChangePassword) window.location.hash = '#/pass?mode=first'
    else if (session) window.location.hash = '#/vault'
    else window.location.hash = '#/login'
  }
  app.mount('#app')
}

// 阶段 5：PWA Service Worker（仅生产构建注册，避免开发热更新干扰）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* ignore */ })
  })
}

void bootstrap()
