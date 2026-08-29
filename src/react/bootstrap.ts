import { initDb, readKvSnapshot } from '@/core/db'
import { hydrateStoreCache } from '@/core/storage'
import { migrateData } from '@/core/migrate'
import { purgeCorruptedEncryptedKeys } from '@/core/sync'
import { ensureLegacyMigration } from '@/domain/legacy/migration'

let bootstrapPromise: Promise<void> | null = null

export function bootstrapData(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise
  bootstrapPromise = (async () => {
    await initDb()
    hydrateStoreCache(await readKvSnapshot())
    migrateData()
    purgeCorruptedEncryptedKeys()
    await ensureLegacyMigration()
  })()
  return bootstrapPromise
}
