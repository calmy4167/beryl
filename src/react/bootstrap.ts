import { initDb, readKvSnapshot } from '@/core/db'
import { hydrateStoreCache } from '@/core/storage'
import { migrateData } from '@/core/migrate'
import { purgeCorruptedEncryptedKeys } from '@/core/sync'
import { setModuleRealityReader } from '@/core/modules'
import { listRealityDocuments, type RealityEntityType } from '@/domain/reality'
import { ensureLegacyMigration } from '@/domain/legacy/migration'

setModuleRealityReader(type => listRealityDocuments({ types: [type as RealityEntityType] }))

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
