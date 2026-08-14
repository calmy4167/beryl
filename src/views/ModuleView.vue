<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MODS, MOD_CAT } from '@/core/modules'
import { CATS } from '@/core/modules'
import InboxModule from '@/components/modules/InboxModule.vue'
import TasksModule from '@/components/modules/TasksModule.vue'
import HabitsModule from '@/components/modules/HabitsModule.vue'
import DiaryModule from '@/components/modules/DiaryModule.vue'
import PomoModule from '@/components/modules/PomoModule.vue'
import FinanceModule from '@/components/modules/FinanceModule.vue'
import GoalsModule from '@/components/modules/GoalsModule.vue'
import CharsModule from '@/components/modules/CharsModule.vue'
import PostsModule from '@/components/modules/PostsModule.vue'

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id || 'inbox'))
const mod = computed(() => MODS[id.value] || MODS.inbox)
const cat = computed(() => CATS.find(c => c.id === MOD_CAT[id.value]))

const MODULES: Record<string, unknown> = {
  inbox: InboxModule, tasks: TasksModule, habits: HabitsModule,
  diary: DiaryModule, pomo: PomoModule, finance: FinanceModule,
  goals: GoalsModule, chars: CharsModule, posts: PostsModule
}
const current = computed(() => MODULES[id.value] || InboxModule)
</script>

<template>
  <div>
    <div class="head fade-enter-active">
      <el-button circle text @click="router.push('/app/home')" title="返回首页">←</el-button>
      <span class="mod-icon">{{ mod.icon }}</span>
      <h2 class="font-title mod-name">{{ mod.name }}</h2>
      <span v-if="cat" class="cat-badge" :style="{ color: cat.color, background: cat.color + '1a', borderColor: cat.color + '40' }">{{ cat.icon }} {{ cat.name }}</span>
    </div>
    <component :is="current" />
  </div>
</template>

<style scoped>
.head { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.mod-icon { font-size: 20px; }
.mod-name { font-size: 1.25rem; font-weight: 700; }
.cat-badge { margin-left: auto; font-size: 10px; padding: 2px 8px; border-radius: 999px; border: 1px solid; }
</style>
