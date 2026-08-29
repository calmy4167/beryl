import { createRoot } from 'react-dom/client'
import { App } from './App'
import '@/styles/main.css'
import './react.css'
import './mobile-nav.css'

let savedTheme: string | null = null
try { savedTheme = localStorage.getItem('b_theme') } catch { /* ignore */ }
document.documentElement.classList.toggle('dark', savedTheme === 'dark')

const root = document.getElementById('app')
if (!root) throw new Error('app-root-missing')
createRoot(root).render(<App />)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* ignore */ })
  })
}
