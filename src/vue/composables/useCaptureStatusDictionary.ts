import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { CaptureStatus } from '@/domain/capture/model'
import { unifiedAsyncRepository, type DictionaryOption } from '@/domain/unified'
import { captureStatusLabel, orderedCaptureStatuses } from '@/domain/unified/capture-status-labels'

export function useCaptureStatusDictionary() {
  const options = ref<DictionaryOption[]>([])
  const error = ref('')
  const hasLoadedOptions = ref(false)
  const statuses = computed(() => orderedCaptureStatuses(options.value))
  function labelFor(status: CaptureStatus): string { return captureStatusLabel(status, options.value) }
  async function refresh(): Promise<void> {
    try {
      options.value = await unifiedAsyncRepository.list<DictionaryOption>('dictionary_option')
      error.value = ''
      hasLoadedOptions.value = true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '收集状态字典读取失败'
    }
  }
  function onDictionaryUpdated(event: Event): void {
    const detail = (event as CustomEvent<{ module?: string; field?: string }>).detail
    if (!detail || (detail.module === 'capture' && detail.field === 'status')) void refresh()
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
  return { options, statuses, labelFor, error, hasLoadedOptions, refresh }
}
