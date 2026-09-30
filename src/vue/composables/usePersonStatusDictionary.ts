import { computed, onMounted, onUnmounted, ref } from 'vue'
import { unifiedAsyncRepository, type DictionaryOption, type PersonStatus } from '@/domain/unified'
import { personStatusLabel, orderedPersonStatuses } from '@/domain/unified/person-status-labels'

export function usePersonStatusDictionary() {
  const options = ref<DictionaryOption[]>([])
  const statuses = computed(() => orderedPersonStatuses(options.value))
  function labelFor(status: PersonStatus): string { return personStatusLabel(status, options.value) }
  async function refresh(): Promise<void> {
    try { options.value = await unifiedAsyncRepository.list<DictionaryOption>('dictionary_option') }
    catch { /* Keep built-in labels and ordering when optional dictionary data is unavailable. */ }
  }
  function onDictionaryUpdated(event: Event): void {
    const detail = (event as CustomEvent<{ module?: string; field?: string }>).detail
    if (!detail || (detail.module === 'person' && detail.field === 'status')) void refresh()
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
  return { options, statuses, labelFor, refresh }
}
