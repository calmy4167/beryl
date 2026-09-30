import { computed, onMounted, onUnmounted, ref } from 'vue'
import { unifiedAsyncRepository, type DictionaryOption } from '@/domain/unified'
import type { ActionStatus } from '@/domain/action/model'
import { actionStatusLabel, orderedActionStatuses } from '@/domain/action/status-labels'

export function useActionStatusDictionary() {
  const options = ref<DictionaryOption[]>([])
  const statuses = computed(() => orderedActionStatuses(options.value))
  function labelFor(status: ActionStatus): string { return actionStatusLabel(status, options.value) }
  async function refresh(): Promise<void> {
    try { options.value = await unifiedAsyncRepository.list<DictionaryOption>('dictionary_option') }
    catch { /* Keep the built-in labels and status order when optional dictionary data is unavailable. */ }
  }
  function onDictionaryUpdated(event: Event): void {
    const detail = (event as CustomEvent<{ module?: string; field?: string }>).detail
    if (!detail || (detail.module === 'action' && detail.field === 'status')) void refresh()
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
