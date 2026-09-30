/** Active account namespace for browser storage and IndexedDB. */
let activeUserId: string | null = null

export function setActiveAccount(userId: string | null): void {
  activeUserId = userId
}

export function getActiveAccount(): string | null {
  return activeUserId
}

function namespacePrefix(): string | null {
  if (!activeUserId) return null
  // User IDs are server generated, but encode them anyway to keep storage keys stable.
  return `calmy:user:${encodeURIComponent(activeUserId)}:`
}

export function accountStorageKey(key: string): string {
  if (!key.startsWith('b_') || key === 'b_theme') return key
  const prefix = namespacePrefix()
  return prefix ? `${prefix}${key}` : key
}

export function accountStoragePrefix(): string | null {
  return namespacePrefix()
}

export function unaccountStorageKey(key: string): string | null {
  const prefix = namespacePrefix()
  return prefix && key.startsWith(prefix) ? key.slice(prefix.length) : null
}

export function accountDatabaseName(): string {
  return activeUserId ? `calmy-db-${encodeURIComponent(activeUserId)}` : 'beryl-db'
}
