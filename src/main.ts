import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/main.css'
import App from './App.vue'
import router from './router'
import { initDb } from './core/db'
import { migrateData } from './core/migrate'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })

// 主题初始化：默认浅色；b_theme='dark' 时启用深色（在挂载前设置，避免闪烁）
let savedTheme: string | null = null
try { savedTheme = localStorage.getItem('b_theme') } catch { /* ignore */ }
document.documentElement.classList.toggle('dark', savedTheme === 'dark')

// 阶段 2：数据版本迁移 + localStorage 数据镜像到 IndexedDB（异步，不阻塞渲染）
migrateData()
void initDb()

// 阶段 5：PWA Service Worker（仅生产构建注册，避免开发热更新干扰）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* ignore */ })
  })
}

app.mount('#app')
