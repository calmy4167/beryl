import { appPageRegistry, type AppPageDescriptor } from '@/router/route-manifest'

/**
 * The route inventory and Vue-facing page registry share one framework-neutral
 * source so routes cannot silently omit or rename a page.
 */
export const vuePageRegistry: readonly AppPageDescriptor[] = appPageRegistry.map(page => ({ ...page }))
