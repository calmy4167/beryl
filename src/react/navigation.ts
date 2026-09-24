import {
  appPageRegistry,
  featureNavigationGroupMeta,
  type FeatureNavigationGroupId,
  type PrimaryNavigationKey,
} from './route-manifest'

export interface PrimaryNavigationItem {
  key: PrimaryNavigationKey
  icon: string
  label: string
  path: string
}

export const primaryNavigation: readonly PrimaryNavigationItem[] = appPageRegistry
  .filter(page => page.navigation?.kind === 'primary')
  .sort((left, right) => {
    const leftOrder = left.navigation?.kind === 'primary' ? left.navigation.order : 0
    const rightOrder = right.navigation?.kind === 'primary' ? right.navigation.order : 0
    return leftOrder - rightOrder
  })
  .flatMap(page => page.navigation?.kind === 'primary'
    ? [{ key: page.navigation.key, icon: page.navigation.icon, label: page.navigation.label, path: page.path }]
    : [])

export interface FeatureNavigationItem {
  icon: string
  label: string
  path: string
}

export interface FeatureNavigationGroup {
  id: FeatureNavigationGroupId
  label: string
  items: readonly FeatureNavigationItem[]
}

export const featureNavigationGroups: readonly FeatureNavigationGroup[] = featureNavigationGroupMeta.map(group => ({
  id: group.id,
  label: group.label,
  items: appPageRegistry
    .filter(page => page.navigation?.kind === 'feature' && page.navigation.groupId === group.id)
    .sort((left, right) => {
      const leftOrder = left.navigation?.kind === 'feature' ? left.navigation.order : 0
      const rightOrder = right.navigation?.kind === 'feature' ? right.navigation.order : 0
      return leftOrder - rightOrder
    })
    .flatMap(page => page.navigation?.kind === 'feature'
      ? [{ icon: page.navigation.icon, label: page.navigation.label, path: page.path }]
      : []),
}))

export type DesktopNavigationGroupId = 'daily' | FeatureNavigationGroupId

export interface DesktopNavigationGroup {
  id: DesktopNavigationGroupId
  label: string
  items: readonly FeatureNavigationItem[]
}

export const desktopNavigationGroups: readonly DesktopNavigationGroup[] = [
  {
    id: 'daily',
    label: '日常',
    items: primaryNavigation.map(({ icon, label, path }) => ({ icon, label, path })),
  },
  ...featureNavigationGroups,
]
