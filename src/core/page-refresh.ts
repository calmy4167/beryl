import { onActivated, onDeactivated, onMounted, onUnmounted } from 'vue'

/** 让 KeepAlive 页面只在当前激活时响应同步，并合并短时间内的重复通知。 */
export function usePageRefresh(refresh: () => void | Promise<void>): void {
  let active = false
  let timer = 0
  let queued = false
  let running = false
  let pending = false

  const execute = () => {
    if (!active) return
    running = true
    Promise.resolve(refresh()).catch(() => undefined).finally(() => {
      running = false
      if (active && pending) {
        pending = false
        run()
      }
    })
  }

  const run = () => {
    if (!active) return
    if (running) { pending = true; return }
    if (queued) return
    queued = true
    timer = window.setTimeout(() => {
      queued = false
      execute()
    }, 80)
  }
  const attach = () => {
    if (active) return
    active = true
    window.addEventListener('beryl-data-synced', run)
  }
  const detach = () => {
    active = false
    window.removeEventListener('beryl-data-synced', run)
    if (timer) window.clearTimeout(timer)
    timer = 0
    queued = false
    pending = false
  }

  onMounted(() => { attach(); execute() })
  onActivated(() => { if (!active) { attach(); execute() } })
  onDeactivated(detach)
  onUnmounted(detach)
}
