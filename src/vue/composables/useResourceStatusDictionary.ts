import { computed, onMounted, onUnmounted, ref } from 'vue'
import { unifiedAsyncRepository, type DictionaryOption, type ResourceStatus } from '@/domain/unified'
import { resourceStatusLabel, orderedResourceStatuses } from '@/domain/unified/resource-status-labels'

export function useResourceStatusDictionary() {
  const options = ref<DictionaryOption[]>([])
  const error = ref('')
  const statuses = computed(() => orderedResourceStatuses(options.value))
  function labelFor(status: ResourceStatus): string { return resourceStatusLabel(status, options.value) }
  async function refresh(): Promise<void> {
    try {
      options.value = await unifiedAsyncRepository.list<DictionaryOption>('dictionary_option')
      error.value = ''
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '资源状态字典读取失败'
    }
  }
  function onDictionaryUpdated(event: Event): void {
    const detail = (event as CustomEvent<{ module?: string; field?: string }>).detail
    if (!detail || (detail.module === 'resource' && detail.field === 'status')) void refresh()
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
  return { options, statuses, labelFor, error, refresh }
}
