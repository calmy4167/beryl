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
  capability?: string
}

export interface FeatureNavigationGroup {
  id: FeatureNavigationGroupId
  label: string
  items: readonly FeatureNavigationItem[]
}

export function featureNavigationGroupsForAdmin(isAdmin: boolean, capabilities?: readonly string[]): readonly FeatureNavigationGroup[] {
  return featureNavigationGroupMeta.map(group => ({
    id: group.id,
    label: group.label,
    items: appPageRegistry
      .filter(page => page.navigation?.kind === 'feature' && page.navigation.groupId === group.id && (!page.adminOnly || isAdmin) && (!page.capability || !capabilities || capabilities.includes(page.capability)))
      .sort((left, right) => {
        const leftOrder = left.navigation?.kind === 'feature' ? left.navigation.order : 0
        const rightOrder = right.navigation?.kind === 'feature' ? right.navigation.order : 0
        return leftOrder - rightOrder
      })
      .flatMap(page => page.navigation?.kind === 'feature'
        ? [{ icon: page.navigation.icon, label: page.navigation.label, path: page.path, capability: page.capability }]
        : []),
  })).filter(group => group.items.length > 0)
}

/** Admin-inclusive navigation inventory retained for static navigation consumers. */
export const featureNavigationGroups = featureNavigationGroupsForAdmin(true)

export type DesktopNavigationGroupId = 'daily' | FeatureNavigationGroupId

export interface DesktopNavigationGroup {
  id: DesktopNavigationGroupId
  label: string
  items: readonly FeatureNavigationItem[]
}

export function desktopNavigationGroupsForAdmin(isAdmin: boolean): readonly DesktopNavigationGroup[] {
  const featureGroups = featureNavigationGroupsForAdmin(isAdmin)
  return [
    {
      id: 'daily',
      label: '日常',
      items: primaryNavigation.map(({ icon, label, path }) => ({ icon, label, path })),
    },
    ...featureGroups,
  ]
}
