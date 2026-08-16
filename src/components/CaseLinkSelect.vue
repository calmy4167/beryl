<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { caseRelationRepository, caseRepository } from '@/domain/case/repository'
import type { CaseRelation } from '@/domain/case/model'

const props = defineProps<{
  targetType: CaseRelation['targetType']
  targetId: string
  compact?: boolean
}>()

const cases = ref(caseRepository.list())
const selected = ref('')
function refresh() {
  cases.value = caseRepository.list().filter(item => item.status !== 'archived')
  selected.value = caseRelationRepository.listForTarget(props.targetType, props.targetId)[0]?.caseId || ''
}
function save() {
  const current = selected.value
  caseRelationRepository.unlinkForTarget(props.targetType, props.targetId)
  if (current) caseRelationRepository.link(current, props.targetType, props.targetId, 'earth')
  ElMessage.success(current ? '已关联课题' : '已取消课题关联')
  refresh()
}
function onDataSynced() { refresh() }
onMounted(() => { refresh(); window.addEventListener('beryl-data-synced', onDataSynced) })
onUnmounted(() => window.removeEventListener('beryl-data-synced', onDataSynced))
</script>

<template>
  <select v-model="selected" class="case-link" :class="{ compact }" :aria-label="selected ? '已关联课题' : '关联课题'" @change="save">
    <option value="">{{ compact ? '关联课题' : '不关联课题' }}</option>
    <option v-for="item in cases" :key="item.id" :value="item.id">◈ {{ item.title }}</option>
  </select>
</template>

<style scoped>
.case-link { min-width: 150px; max-width: 220px; border: 1px solid var(--c-border-soft); background: var(--c-card); color: var(--c-text-2); border-radius: 7px; padding: 4px 7px; font-size: 10px; }
.case-link.compact { min-width: 104px; max-width: 150px; }
</style>
