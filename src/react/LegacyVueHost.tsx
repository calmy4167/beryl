import { useEffect, useRef } from 'react'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { ElButton, ElDialog, ElDrawer, ElForm, ElFormItem, ElInput, ElOption, ElRadioGroup, ElRadioButton, ElSelect } from 'element-plus'
import App from '@/App.vue'
import router from '@/router'
import { bootstrapData } from './bootstrap'

export function LegacyVueHost() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const vueApp = createApp(App)
    vueApp.use(createPinia())
    vueApp.use(router)
    for (const [name, component] of Object.entries({ ElButton, ElDialog, ElDrawer, ElForm, ElFormItem, ElInput, ElOption, ElRadioGroup, ElRadioButton, ElSelect })) {
      vueApp.component(name, component)
    }

    let cancelled = false
    let mounted = false
    void (async () => {
      await bootstrapData()
      if (cancelled || !host.current) return
      vueApp.mount(host.current)
      mounted = true
    })()

    return () => {
      cancelled = true
      if (mounted) vueApp.unmount()
    }
  }, [])

  return <div ref={host} className="legacy-vue-host" aria-label="兼容页面容器" />
}
