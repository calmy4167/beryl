<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ path: string }>()
const pageName = computed(() => props.path.split('/').pop())
</script>

<template>
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <template v-if="pageName === 'today'">
      <path d="m4 10 8-6 8 6v10H4z" /><path d="M9 20v-6h6v6" />
    </template>
    <template v-else-if="pageName === 'capture'">
      <path d="M6 4h8l4 4v12H6zM14 4v4h4M9 13h6M9 16h4" />
    </template>
    <template v-else-if="pageName === 'matters'">
      <circle cx="12" cy="12" r="8" /><path d="m15 9-2 4-4 2 2-4z" />
    </template>
    <template v-else-if="pageName === 'review'">
      <path d="M5 5v5h5M5.5 10a7 7 0 1 1-.3 5M12 8v4l3 2" />
    </template>
    <template v-else-if="pageName === 'task-board'">
      <rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M9 4v16M15 4v16M5.5 9h2M11 13h2M17 8h2" />
    </template>
    <template v-else-if="pageName === 'tasks'">
      <path d="m4 7 2 2 3-3M12 8h8M4 16l2 2 3-3M12 17h8" />
    </template>
    <template v-else-if="pageName === 'goals'">
      <circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".8" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="pageName === 'calendar'">
      <rect x="4" y="6" width="16" height="15" rx="2" /><path d="M8 3v6M16 3v6M4 11h16M8 15h3" />
    </template>
    <template v-else-if="pageName === 'feishu'">
      <rect x="4" y="5" width="10" height="10" rx="2" /><path d="M10 10h8a2 2 0 0 1 2 2v7H10v-9Z" />
    </template>
    <template v-else-if="pageName === 'cycle'">
      <path d="M19 8a8 8 0 0 0-13-2L4 8M4 4v4h4M5 16a8 8 0 0 0 13 2l2-2M20 20v-4h-4" />
    </template>
    <template v-else-if="pageName === 'inbox'">
      <path d="M5 4h14l2 14H3L5 4ZM3.5 14H9l2 3h2l2-3h5.5" />
    </template>
    <template v-else-if="pageName === 'library'">
      <path d="M4 5h5v15H4zM10 4h5v16h-5zM17 7l3-1 3 13-3 1z" />
    </template>
    <template v-else-if="pageName === 'flow'">
      <circle cx="6" cy="6" r="2" /><circle cx="18" cy="9" r="2" /><circle cx="9" cy="18" r="2" /><path d="m8 6 8 2M17 11l-7 5M7 8l2 8" />
    </template>
    <template v-else-if="pageName === 'diary'">
      <path d="M12 6c-2-1-5-1.5-9-1v14c4-.5 7 0 9 1 2-1 5-1.5 9-1V5c-4-.5-7 0-9 1ZM12 6v14M6 9h3M15 9h3" />
    </template>
    <template v-else-if="pageName === 'posts'">
      <path d="M5 4h12v8M5 4v16h13v-4M8 8h6M8 12h4" /><path d="m14 17 5-5 2 2-5 5-3 1z" />
    </template>
    <template v-else-if="pageName === 'people'">
      <circle cx="9" cy="8" r="3" /><path d="M3 20c.5-4 2.5-6 6-6s5.5 2 6 6M17 5a3 3 0 0 1 0 6M17 14c2.5.5 3.8 2.5 4 6" />
    </template>
    <template v-else-if="pageName === 'graph'">
      <circle cx="5" cy="12" r="2" /><circle cx="12" cy="5" r="2" /><circle cx="19" cy="12" r="2" /><circle cx="12" cy="19" r="2" /><path d="m6.5 10.5 4-4m3 0 4 4m0 3-4 4m-3 0-4-4" />
    </template>
    <template v-else-if="pageName === 'memory'">
      <path d="m12 3 9 5-9 5-9-5 9-5ZM4 12l8 5 8-5M4 16l8 5 8-5" />
    </template>
    <template v-else-if="pageName === 'habits'">
      <path d="M19 8a8 8 0 1 0 1 6M19 4v4h-4M9 12l2 2 4-4" />
    </template>
    <template v-else-if="pageName === 'finance'">
      <rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 9h18M16 15h2M6 6V4h12" />
    </template>
    <template v-else-if="pageName === 'pomo'">
      <circle cx="12" cy="13" r="8" /><path d="M12 8v5l3 2M9 2h6M12 2v3" />
    </template>
    <template v-else-if="pageName === 'future'">
      <path d="M4 20c3-2 5-5 7-9M11 11c2-4 4-6 9-7M11 11c2 5 4 7 9 9M17 4h3v3M17 20h3v-3" />
    </template>
    <template v-else-if="pageName === 'scene'">
      <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m5 17 5-5 3 3 3-4 3 3M8 9h.01" />
    </template>
    <template v-else-if="pageName === 'profile'">
      <circle cx="12" cy="8" r="4" /><path d="M4 20c.7-4 3.3-6 8-6s7.3 2 8 6" />
    </template>
    <template v-else>
      <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </template>
  </svg>
</template>
