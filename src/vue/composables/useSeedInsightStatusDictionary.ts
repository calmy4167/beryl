import { computed, onMounted, onUnmounted, ref } from 'vue'
import { unifiedAsyncRepository, type DictionaryOption, type InsightStatus, type SeedStatus } from '@/domain/unified'
import { insightStatusLabel, orderedInsightStatuses } from '@/domain/unified/insight-status-labels'
import { seedStatusLabel, orderedSeedStatuses } from '@/domain/unified/seed-status-labels'

export function useSeedInsightStatusDictionary() {
  const options = ref<DictionaryOption[]>([])
  const error = ref('')
  const seedStatuses = computed(() => orderedSeedStatuses(options.value))
  const insightStatuses = computed(() => orderedInsightStatuses(options.value))
  function seedLabelFor(status: SeedStatus): string { return seedStatusLabel(status, options.value) }
  function insightLabelFor(status: InsightStatus): string { return insightStatusLabel(status, options.value) }
  async function refresh(): Promise<void> {
    try {
      options.value = await unifiedAsyncRepository.list<DictionaryOption>('dictionary_option')
      error.value = ''
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '洞察与种子状态字典读取失败'
    }
  }
  function onDictionaryUpdated(event: Event): void {
    const detail = (event as CustomEvent<{ module?: string; field?: string }>).detail
    if (!detail || ((detail.module === 'seed' || detail.module === 'insight') && detail.field === 'status')) void refresh()
  }
  function onDataSynced(): void { void refresh() }
  onMounted(() => {
    void refresh()
    window.addEventListener('calmy-dictionary-updated', onDictionaryUpdated)
    window.addEventListener('beryl-data-synced', onDataSynced)
  })
  onUnmounted(() => {
    window.removeEventListener('calmy-dictionary-updated', onDictionaryUpdated)
    window.removeEventListener('beryl-data-synced', onDataSynced)
  })
  return { options, seedStatuses, insightStatuses, seedLabelFor, insightLabelFor, error, refresh }
}
