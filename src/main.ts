import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { ElButton, ElDialog, ElDrawer, ElForm, ElFormItem, ElInput, ElOption, ElRadioGroup, ElRadioButton, ElSelect } from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/main.css'
import App from './App.vue'
import router from './router'
import { initDb, readKvSnapshot } from './core/db'
import { hydrateStoreCache } from './core/storage'
import { migrateData } from './core/migrate'
import { purgeCorruptedEncryptedKeys } from './core/sync'
import { setModuleRealityReader } from './core/modules'
import { listRealityDocuments, type RealityEntityType } from './domain/reality'
import { ensureLegacyMigration } from './domain/legacy/migration'

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

async function bootstrap() {
  await initDb()
  // 让挂载后的同步 Repository 优先读 IndexedDB 持久快照；不可用时由 storage 自己回退到 localStorage。
  hydrateStoreCache(await readKvSnapshot())
  // 数据迁移必须在持久快照 hydrate 后执行，避免用过期 localStorage 覆盖 IndexedDB 主读取路径。
  migrateData()
  // 清除本地密文残留（历史同步 bug 写入的密文字符串，幂等安全）
  purgeCorruptedEncryptedKeys()
  // 旧 Case/Task/inbox 只做增量复制，原集合保持不变以支持回滚；新入口从此不再写旧模型。
  await ensureLegacyMigration()
  app.mount('#app')
}

// 阶段 5：PWA Service Worker（仅生产构建注册，避免开发热更新干扰）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* ignore */ })
  })
}

void bootstrap()
