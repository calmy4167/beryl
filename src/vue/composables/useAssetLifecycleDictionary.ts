import { computed, onMounted, onUnmounted, ref } from 'vue'
import { unifiedAsyncRepository, type AssetLifecycle, type DictionaryOption } from '@/domain/unified'
import { assetLifecycleLabel, orderedAssetLifecycles } from '@/domain/unified/asset-lifecycle-labels'

export function useAssetLifecycleDictionary() {
  const options = ref<DictionaryOption[]>([])
  const error = ref('')
  const lifecycles = computed(() => orderedAssetLifecycles(options.value))
  function labelFor(lifecycle: AssetLifecycle): string { return assetLifecycleLabel(lifecycle, options.value) }
  async function refresh(): Promise<void> {
    try {
      options.value = await unifiedAsyncRepository.list<DictionaryOption>('dictionary_option')
      error.value = ''
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '附件生命周期字典读取失败'
    }
  }
  function onDictionaryUpdated(event: Event): void {
    const detail = (event as CustomEvent<{ module?: string; field?: string }>).detail
    if (!detail || (detail.module === 'asset' && detail.field === 'status')) void refresh()
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
  return { options, lifecycles, labelFor, error, refresh }
}
