import type { AssetLifecycle, DictionaryOption } from './model'
import { ASSET_LIFECYCLES } from './model'

export const ASSET_LIFECYCLE_DEFAULTS: Record<AssetLifecycle, string> = {
  active: '存在',
  expired: '过期',
  retired: '退休',
  missing: '缺失',
}

function optionFor(lifecycle: AssetLifecycle, options: DictionaryOption[]): DictionaryOption | undefined {
  return options.find(option => option.module === 'asset' && option.field === 'status' && option.systemKey === lifecycle && option.status === 'active')
}

export function assetLifecycleLabel(lifecycle: AssetLifecycle, options: DictionaryOption[]): string {
  return optionFor(lifecycle, options)?.value || ASSET_LIFECYCLE_DEFAULTS[lifecycle]
}

export function orderedAssetLifecycles(options: DictionaryOption[]): AssetLifecycle[] {
  return [...ASSET_LIFECYCLES].sort((left, right) => {
    const leftOrder = optionFor(left, options)?.sortOrder ?? ASSET_LIFECYCLES.indexOf(left) * 10
    const rightOrder = optionFor(right, options)?.sortOrder ?? ASSET_LIFECYCLES.indexOf(right) * 10
    return leftOrder - rightOrder || ASSET_LIFECYCLES.indexOf(left) - ASSET_LIFECYCLES.indexOf(right)
  })
}
