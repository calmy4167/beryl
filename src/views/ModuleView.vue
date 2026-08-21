<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, defineAsyncComponent, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MODS, MOD_CAT } from '@/core/modules'
import { CATS } from '@/core/modules'

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id || 'inbox'))
const mod = computed(() => MODS[id.value] || MODS.inbox)
const cat = computed(() => CATS.find(c => c.id === MOD_CAT[id.value]))

const lazy = (loader: () => Promise<{ default: Component }>) => defineAsyncComponent(loader)
const MODULES: Record<string, Component> = {
  inbox: lazy(() => import('@/components/modules/InboxModule.vue')),
  tasks: lazy(() => import('@/components/modules/TasksModule.vue')),
  habits: lazy(() => import('@/components/modules/HabitsModule.vue')),
  diary: lazy(() => import('@/components/modules/DiaryModule.vue')),
  pomo: lazy(() => import('@/components/modules/PomoModule.vue')),
  finance: lazy(() => import('@/components/modules/FinanceModule.vue')),
  goals: lazy(() => import('@/components/modules/GoalsModule.vue')),
  chars: lazy(() => import('@/components/modules/CharsModule.vue')),
  posts: lazy(() => import('@/components/modules/PostsModule.vue')),
  moments: lazy(() => import('@/components/modules/MomentsModule.vue'))
}
const current = computed(() => MODULES[id.value] || MODULES.inbox)

/* 云端同步应用后重建当前模块组件（重新读取存储，让新数据上屏） */
const syncTick = ref(0)
function bumpSync() { syncTick.value++ }
onMounted(() => window.addEventListener('beryl-data-synced', bumpSync))
onUnmounted(() => window.removeEventListener('beryl-data-synced', bumpSync))
</script>

<template>
  <div>
    <div class="head fade-enter-active">
      <button class="back" aria-label="返回工作台" @click="router.push('/app/home')" title="返回工作台">←</button>
      <div class="heading"><p v-if="cat">{{ cat.icon }} {{ cat.name }}</p><h1 class="font-title"><span>{{ mod.icon }}</span>{{ mod.name }}</h1></div>
    </div>
    <component :is="current" :key="syncTick" />
  </div>
</template>

<style scoped>
.head{display:flex;align-items:center;gap:13px;margin:4px 0 27px}.back{width:32px;height:32px;border:1px solid var(--c-border);border-radius:9px;background:var(--c-card);color:var(--c-text-2);cursor:pointer}.heading p{font-size:10px;letter-spacing:.1em;color:var(--scene);margin:0 0 4px;font-weight:700}.heading h1{font-size:31px;letter-spacing:-.025em;margin:0;line-height:1}.heading h1 span{font-family:inherit;font-size:21px;margin-right:8px}
</style>
