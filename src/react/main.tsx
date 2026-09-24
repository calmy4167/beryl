import { createRoot } from 'react-dom/client'
import { App } from './App'
import '@/styles/main.css'
import './react.css'
import './mobile-nav.css'
import './feishu-workspace.css'
import './feishu-board.css'
import './product-ui.css'
import './ui-refresh.css'
import './tactile-ui.css'
import { applyBackgroundPreferences } from './theme-preferences'

let savedTheme: string | null = null
try { savedTheme = localStorage.getItem('b_theme') } catch { /* ignore */ }
document.documentElement.classList.toggle('dark', savedTheme === 'dark')
document.documentElement.classList.toggle('ui-refresh', new URLSearchParams(window.location.search).get('ui') === 'refresh')
document.documentElement.classList.add('tactile-ui')
applyBackgroundPreferences(savedTheme === 'dark' ? 'dark' : 'light')

const root = document.getElementById('app')
if (!root) throw new Error('app-root-missing')
createRoot(root).render(<App />)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* ignore */ })
  })
}
