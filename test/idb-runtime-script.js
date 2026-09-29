const output = document.querySelector('#result')
const DB_NAME = 'beryl-db'

function markStage(stage) {
  output.dataset.stage = stage
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function persistVaultHandle(handle) {
  const { saveVaultHandle } = await import('/src/core/content/vault-handle-store.ts?browser-idb-test')
  await saveVaultHandle(handle)
}

async function restoreOpfsHandleAfterBrowserRestart() {
  const { createFileSystemVaultAdapter, readVaultSnapshot } = await import('/src/core/content/obsidian-adapter.ts?browser-idb-test')
  const { clearVaultHandle, loadVaultHandle, queryVaultHandlePermission } = await import('/src/core/content/vault-handle-store.ts?browser-idb-test')
  const saved = await loadVaultHandle()
  if (!saved?.handle || !saved?.name) throw new Error('opfs-handle-not-restored')
  const permission = await queryVaultHandlePermission(saved.handle)
  const snapshot = await readVaultSnapshot(createFileSystemVaultAdapter(saved.handle))
  const readable = snapshot.issues.length === 0
    && snapshot.entities.some(entity => entity.calmyId === 'mat_runtime_opfs' && 'title' in entity && entity.title === 'OPFS 外部修改标题')
    && snapshot.assets.some(asset => asset.path === 'assets/opfs-proof.png' && [...asset.data].join(',') === '3,4')
  const opfs = await navigator.storage.getDirectory()
  await opfs.removeEntry(saved.name, { recursive: true })
  await clearVaultHandle()
  const handleCleared = await loadVaultHandle() === undefined
  const checks = {
    directoryHandleRestoredAfterBrowserRestart: true,
    opfsHandlePermissionGrantedAfterRestart: permission === 'granted',
    opfsVaultReadableAfterRestart: readable,
    vaultHandleRemovedAfterDisconnect: handleCleared
  }
  return { ok: Object.values(checks).every(Boolean), checks }
}

async function seedVersionTwo() {
  const request = indexedDB.open(DB_NAME, 2)
  request.onupgradeneeded = () => {
    const db = request.result
    db.createObjectStore('kv')
    const changes = db.createObjectStore('changes', { keyPath: 'seq', autoIncrement: true })
    changes.createIndex('ts', 'ts', { unique: false })
    changes.createIndex('key', 'key', { unique: false })
    db.createObjectStore('meta')
    const entities = db.createObjectStore('entity_changes', { keyPath: 'id' })
    entities.createIndex('entity', 'entity', { unique: false })
    entities.createIndex('updatedAt', 'updatedAt', { unique: false })
  }
  const db = await requestResult(request)
  await new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite')
    tx.objectStore('kv').put('[{"id":"legacy"}]', 'b_tasks')
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function storeNames() {
  const db = await requestResult(indexedDB.open(DB_NAME, 3))
  const names = Array.from(db.objectStoreNames)
  db.close()
  return names
}

async function pendingWrites() {
  const db = await requestResult(indexedDB.open(DB_NAME, 3))
  const tx = db.transaction('pending_writes', 'readonly')
  const values = await requestResult(tx.objectStore('pending_writes').getAll())
  db.close()
  return values
}

async function entityChanges() {
  const db = await requestResult(indexedDB.open(DB_NAME, 3))
  const tx = db.transaction('entity_changes', 'readonly')
  const values = await requestResult(tx.objectStore('entity_changes').getAll())
  db.close()
  return values
}

async function seedPendingWrite(item) {
  const db = await requestResult(indexedDB.open(DB_NAME, 3))
  await new Promise((resolve, reject) => {
    const tx = db.transaction('pending_writes', 'readwrite')
    tx.objectStore('pending_writes').put(item)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function runOpfsVaultRoundTrip() {
  if (!navigator.storage?.getDirectory) return { available: false, exported: false, reviewed: false }
  const { createFileSystemVaultAdapter, readVaultSnapshot, syncWorkspaceToVault } = await import('/src/core/content/obsidian-adapter.ts?browser-idb-test')
  const { exportOpenWorkspace } = await import('/src/core/content/open-format.ts?browser-idb-test')
  const { applyVaultSyncPlan, buildVaultSyncPlan } = await import('/src/core/content/vault-sync.ts?browser-idb-test')
  const opfs = await navigator.storage.getDirectory()
  const vaultName = `calmy-runtime-vault-${crypto.randomUUID()}`
  let persistedForRestart = false
  try {
    const vaultDirectory = await opfs.getDirectoryHandle(vaultName, { create: true })
    const matter = {
      calmyId: 'mat_runtime_opfs',
      title: 'OPFS 原始标题',
      why: '验证真实浏览器目录往返',
      primaryContradiction: '',
      status: 'active',
      currentStage: 'wood',
      trajectory: 'unknown',
      evidenceIds: [],
      createdAt: 1,
      updatedAt: 1,
      revision: 1
    }
    const assetBytes = new Uint8Array([0, 1, 255])
    const workspace = exportOpenWorkspace({
      matters: [matter],
      assets: [{ path: 'assets/opfs-proof.png', data: assetBytes, mimeType: 'image/png' }]
    })
    const adapter = createFileSystemVaultAdapter(vaultDirectory)
    const initialWrite = await syncWorkspaceToVault(adapter, workspace)
    const initialSnapshot = await readVaultSnapshot(adapter)
    const exported = initialWrite.errors.length === 0
      && initialSnapshot.issues.length === 0
      && initialSnapshot.entities.some(entity => entity.calmyId === matter.calmyId && 'title' in entity && entity.title === matter.title)
      && initialSnapshot.assets.some(asset => asset.path === 'assets/opfs-proof.png' && [...asset.data].join(',') === '0,1,255' && asset.mimeType === 'image/png')

    const entityPath = workspace.manifest.entities.find(entity => entity.calmy_id === matter.calmyId)?.path
    if (!entityPath) throw new Error('opfs-runtime-entity-path-missing')
    const externalFileHandle = async path => {
      const segments = path.split('/')
      let directory = vaultDirectory
      for (const segment of segments.slice(0, -1)) directory = await directory.getDirectoryHandle(segment)
      return directory.getFileHandle(segments[segments.length - 1])
    }
    const entityHandle = await externalFileHandle(entityPath)
    const entityWriter = await entityHandle.createWritable()
    await entityWriter.write(workspace.files[entityPath].replace('OPFS 原始标题', 'OPFS 外部修改标题'))
    await entityWriter.close()
    const assetHandle = await externalFileHandle('assets/opfs-proof.png')
    const assetWriter = await assetHandle.createWritable()
    await assetWriter.write(new Uint8Array([3, 4]))
    await assetWriter.close()

    const plan = await buildVaultSyncPlan(adapter, workspace)
    const reviewed = plan.issues.length === 0
      && plan.conflicts.some(conflict => conflict.calmyId === matter.calmyId)
      && plan.assetConflicts.some(conflict => conflict.path === 'assets/opfs-proof.png')
      && plan.warnings.length === 2
    const applied = await applyVaultSyncPlan(adapter, plan, {
      [matter.calmyId]: 'keep-vault',
      'asset:assets/opfs-proof.png': 'keep-vault'
    })
    const finalSnapshot = await readVaultSnapshot(adapter)
    const editsKept = applied.errors.length === 0
      && finalSnapshot.issues.length === 0
      && finalSnapshot.entities.some(entity => entity.calmyId === matter.calmyId && 'title' in entity && entity.title === 'OPFS 外部修改标题')
      && finalSnapshot.assets.some(asset => asset.path === 'assets/opfs-proof.png' && [...asset.data].join(',') === '3,4' && asset.mimeType === 'image/png')

    const recoveryName = `calmy-runtime-recovery-${crypto.randomUUID()}`
    const recoveryDirectory = await opfs.getDirectoryHandle(recoveryName, { create: true })
    let interruptionGuarded = false
    let interruptionRecovered = false
    try {
      const recoveryMatter = { ...matter, calmyId: 'mat_runtime_recovery', title: '恢复测试事项', why: '失败前版本' }
      const recoveryV1 = exportOpenWorkspace({ matters: [recoveryMatter], assets: [{ path: 'assets/recovery.bin', data: new Uint8Array([1, 2]), mimeType: 'application/octet-stream' }] })
      const recoveryV2 = exportOpenWorkspace({
        matters: [{ ...recoveryMatter, why: '中断后重试版本', updatedAt: 2, revision: 2 }],
        assets: [{ path: 'assets/recovery.bin', data: new Uint8Array([9, 8, 7]), mimeType: 'application/octet-stream' }]
      })
      const recoveryAdapter = createFileSystemVaultAdapter(recoveryDirectory)
      const initialRecoveryWrite = await syncWorkspaceToVault(recoveryAdapter, recoveryV1)
      const previousManifest = await recoveryAdapter.readText('_calmy/manifest.json')
      const failingAdapter = { ...recoveryAdapter, writeBinary: async () => { throw new Error('runtime-simulated-asset-write-failure') } }
      const interruptedWrite = await syncWorkspaceToVault(failingAdapter, recoveryV2)
      const partialSnapshot = await readVaultSnapshot(recoveryAdapter)
      interruptionGuarded = initialRecoveryWrite.errors.length === 0
        && interruptedWrite.errors.some(error => error.includes('runtime-simulated-asset-write-failure'))
        && await recoveryAdapter.readText('_calmy/manifest.json') === previousManifest
        && partialSnapshot.issues.some(issue => issue.code === 'manifest-hash-mismatch')
      const retryWrite = await syncWorkspaceToVault(recoveryAdapter, recoveryV2)
      const recoveredSnapshot = await readVaultSnapshot(recoveryAdapter)
      interruptionRecovered = retryWrite.errors.length === 0
        && recoveredSnapshot.issues.length === 0
        && recoveredSnapshot.entities.some(entity => entity.calmyId === recoveryMatter.calmyId && 'why' in entity && entity.why === '中断后重试版本')
        && recoveredSnapshot.assets.some(asset => asset.path === 'assets/recovery.bin' && [...asset.data].join(',') === '9,8,7')
    } finally {
      await opfs.removeEntry(recoveryName, { recursive: true })
    }
    await persistVaultHandle(vaultDirectory)
    persistedForRestart = true
    return { available: true, exported, reviewed, editsKept, interruptionGuarded, interruptionRecovered, handleSaved: true }
  } finally {
    if (!persistedForRestart) await opfs.removeEntry(vaultName, { recursive: true })
  }
}

function encodeBase64(bytes) {
  const chunkSize = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

if (new URLSearchParams(location.search).get('phase') === 'restore-vault-handle') {
  markStage('restore-vault-handle')
  try {
    output.textContent = JSON.stringify(await restoreOpfsHandleAfterBrowserRestart())
  } catch (error) {
    output.textContent = JSON.stringify({ ok: false, error: error instanceof Error ? error.stack || error.message : String(error) })
  }
} else try {
  markStage('seed-v2')
  await seedVersionTwo()
  markStage('load-runtime-modules')
  const { dbDelete, dbPut, flushPendingDbWrites, getDbStatus, initDb, readChanges, readDbMeta, readKvSnapshot, writeDbMeta } = await import('/src/core/db.ts?browser-idb-test')
  const { syncEntityData } = await import('/src/core/entity-sync.ts?browser-idb-test')
  const { cloudConnect, disconnect } = await import('/src/core/sync.ts?browser-idb-test')
  const { createDurableBackup, parseBackup } = await import('/src/core/backup.ts?browser-idb-test')
  const { lsSet } = await import('/src/core/storage.ts?browser-idb-test')
  const { createDurableEntityMigrationPlan } = await import('/src/core/entity-migration.ts?browser-idb-test')
  const { createAsyncCollectionRepository } = await import('/src/core/repository.ts?browser-idb-test')
  markStage('init-db')
  await initDb()
  markStage('read-initial-snapshot')
  const restored = await readKvSnapshot()
  const names = await storeNames()
  markStage('indexeddb-and-sync')

  const metaWrite = await writeDbMeta('runtime:test-meta', { confirmed: true })
  const metaRead = await readDbMeta('runtime:test-meta')
  localStorage.setItem('b_tasks', JSON.stringify([{ id: 'initial-task', title: '首次同步快照' }]))
  const originalFetch = window.fetch
  let entityPulls = 0
  let entityPushes = 0
  window.fetch = async input => {
    const url = String(input)
    if (url.includes('/api/entity-sync/pull')) {
      entityPulls += 1
      return new Response(JSON.stringify({ records: [], nextCursor: { ts: entityPulls === 1 ? 7 : 8, device: 'remote', entity: 'tasks', entityId: `task-${entityPulls}` }, hasMore: false }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (url.includes('/api/entity-sync/push')) entityPushes += 1
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const entitySyncResult = await syncEntityData('https://runtime.test', 'runtime-token')
  const initialTaskPreserved = localStorage.getItem('b_tasks')?.includes('initial-task') === true
  const entityCursor = await readDbMeta('entity-sync:pull-cursor')
  const entityReady = await readDbMeta('entity-sync:ready')
  window.fetch = async input => {
    const url = String(input)
    if (url.includes('/api/sync/pull')) {
      return new Response(JSON.stringify({ ok: true, records: [], nextCursor: { ts: 9, device: 'remote', key: 'b_tasks' }, maxTs: 9, hasMore: false }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const keySyncConnected = await cloudConnect('https://runtime.test', 'runtime-token')
  const keyCursor = await readDbMeta('sync:pull-cursor')
  disconnect()
  window.fetch = originalFetch

  await seedPendingWrite({
    key: 'b_recovered',
    value: '[{"id":"recovered"}]',
    entityChanges: [{ id: 'replay-change', entity: 'recovered', entityId: 'recovered', operation: 'create', updatedAt: 1, device: 'runtime', value: { id: 'recovered' } }]
  })
  await initDb()
  const recovered = await readKvSnapshot()
  const recoveredEntityLog = await entityChanges()
  const pendingEntityReplay = recoveredEntityLog.some(change => change.id === 'replay-change:0' && change.entityId === 'recovered')

  await dbPut('b_tasks', '[{"id":"new"}]')
  const afterPut = await readKvSnapshot()
  const pendingAfterPut = await pendingWrites()

  await dbDelete('b_tasks')
  const afterDelete = await readKvSnapshot()
  const changes = await readChanges(0, 1000)
  const deletedChange = [...changes].reverse().find(change => change.key === 'b_tasks')

  localStorage.setItem('b_tasks', '[]')
  const pendingBackupWrite = dbPut('b_tasks', '[{"id":"backup-task","title":"立即备份"}]')
  const durableBackup = await createDurableBackup()
  await pendingBackupWrite
  const backupFlushesPendingWrite = durableBackup.b_tasks === '[{"id":"backup-task","title":"立即备份"}]'
  const openAssetsJson = JSON.stringify([{ path: 'assets/runtime.png', data: 'AAH/', mimeType: 'image/png' }])
  await dbPut('b_openAssets', openAssetsJson)
  const assetsBackup = parseBackup(JSON.parse(JSON.stringify(await createDurableBackup())))
  const backupIncludesOpenAssets = assetsBackup.b_openAssets === openAssetsJson
  await dbDelete('b_openAssets')
  await flushPendingDbWrites()
  const assetsRemovedBeforeImport = (await readKvSnapshot())?.b_openAssets === undefined
  const restoreWriteAccepted = lsSet('b_openAssets', assetsBackup.b_openAssets)
  await flushPendingDbWrites()
  const restoredAssetsSnapshot = await readKvSnapshot()
  const restoredOpenAssets = JSON.parse(restoredAssetsSnapshot?.b_openAssets || '[]')
  const restoredAssetBytes = [...new Uint8Array(Array.from(atob(restoredOpenAssets[0]?.data || ''), character => character.charCodeAt(0)))]
  const openAssetsImportRestoresBinaryToIndexedDb = restoreWriteAccepted && assetsRemovedBeforeImport && restoredAssetBytes.join(',') === '0,1,255' && restoredOpenAssets[0]?.mimeType === 'image/png'
  markStage('large-backup-roundtrip')
  const largeAssetSizes = [4 * 1024 * 1024, 4 * 1024 * 1024, 4 * 1024 * 1024, 4 * 1024 * 1024]
  const largeAssetPatterns = [17, 53, 101, 197]
  const largeAssetFixtures = largeAssetSizes.map((size, index) => {
    const bytes = new Uint8Array(size).fill(largeAssetPatterns[index])
    return { path: `assets/large-runtime-${index}.bin`, data: encodeBase64(bytes), mimeType: 'application/octet-stream', sizeBytes: size, pattern: largeAssetPatterns[index] }
  })
  const largeAssetsJson = JSON.stringify(largeAssetFixtures.map(({ path, data, mimeType }) => ({ path, data, mimeType })))
  const largeBackupStartedAt = performance.now()
  await dbPut('b_openAssets', largeAssetsJson)
  const serializedLargeBackup = JSON.stringify(await createDurableBackup())
  const parsedLargeBackup = parseBackup(JSON.parse(serializedLargeBackup))
  const largeAssetsRestored = JSON.parse(parsedLargeBackup.b_openAssets || '[]')
  const largeBackupJsonBytes = serializedLargeBackup.length
  const largeBackupRoundTripMs = Math.round(performance.now() - largeBackupStartedAt)
  const largeBackupRoundTripPreservesBinary = largeAssetsRestored.length === largeAssetFixtures.length
    && largeAssetsRestored.every((asset, index) => {
      const fixture = largeAssetFixtures[index]
      const decoded = new Uint8Array(Array.from(atob(asset.data), character => character.charCodeAt(0)))
      return asset.path === fixture.path
        && asset.mimeType === fixture.mimeType
        && decoded.length === fixture.sizeBytes
        && decoded[0] === fixture.pattern
        && decoded[decoded.length - 1] === fixture.pattern
    })
  markStage('durable-migration-and-repository')
  await dbDelete('b_openAssets')
  await flushPendingDbWrites()
  const pendingMigrationWrite = dbPut('b_tasks', '[{"id":"migration-task","title":"立即迁移"}]')
  const migrationPlan = await createDurableEntityMigrationPlan()
  await pendingMigrationWrite
  const migrationFlushesPendingWrite = migrationPlan.records.some(record => record.entityId === 'migration-task')
  const asyncRepository = createAsyncCollectionRepository('runtimeTasks')
  await asyncRepository.replace([{ id: 'async-runtime', title: '异步 Repository' }])
  const asyncRepositoryItems = await asyncRepository.list()
  const asyncRepositoryReady = await asyncRepository.ready()
  const entityLog = await entityChanges()
  const atomicEntityValueAndLog = asyncRepositoryItems[0]?.id === 'async-runtime' && entityLog.some(change => change.entity === 'runtimeTasks' && change.entityId === 'async-runtime' && change.operation === 'create')
  const asyncRepositoryUsesDurableSnapshot = asyncRepositoryItems[0]?.id === 'async-runtime' && asyncRepositoryReady.durable === true
  markStage('opfs-vault-roundtrip')
  const opfsVault = await runOpfsVaultRoundTrip()

  const checks = {
    upgradedFromV2: restored?.b_tasks === '[{"id":"legacy"}]',
    pendingStoreCreated: names.includes('pending_writes'),
    pendingWriteReplayed: recovered?.b_recovered === '[{"id":"recovered"}]',
    pendingEntityReplay,
    writeApplied: afterPut?.b_tasks === '[{"id":"new"}]',
    pendingQueueDrained: pendingAfterPut.length === 0,
    deleteApplied: afterDelete?.b_tasks === undefined,
    deletionChangeRecorded: deletedChange?.deleted === true,
    backupFlushesPendingWrite,
    backupIncludesOpenAssets,
    openAssetsImportRestoresBinaryToIndexedDb,
    largeBackupRoundTripPreservesBinary,
    largeBackupJsonBytes,
    largeBackupRoundTripMs,
    migrationFlushesPendingWrite,
    asyncRepositoryUsesDurableSnapshot,
    atomicEntityValueAndLog,
    opfsVaultRealBrowserRoundTrip: opfsVault.available && opfsVault.exported,
    opfsExternalEditExplicitReview: opfsVault.available && opfsVault.reviewed && opfsVault.editsKept,
    opfsInterruptedWriteKeepsPreviousManifest: opfsVault.available && opfsVault.interruptionGuarded,
    opfsInterruptedWriteRecoversOnRetry: opfsVault.available && opfsVault.interruptionRecovered,
    opfsHandlePreparedForBrowserRestart: opfsVault.available && opfsVault.handleSaved,
    dbMetaWriteConfirmed: metaWrite && metaRead?.confirmed === true,
    entityInitialMergeConfirmed: entitySyncResult.pulled === 0 && entityPushes === 1 && entityPulls === 2 && entityCursor?.ts === 8 && entityReady === true && initialTaskPreserved,
    keySyncCursorDurable: keySyncConnected && keyCursor?.ts === 9,
    databaseReady: getDbStatus().available === true
  }
  markStage('complete')
  output.textContent = JSON.stringify({ ok: Object.values(checks).every(Boolean), checks })
} catch (error) {
  output.textContent = JSON.stringify({ ok: false, error: error instanceof Error ? error.stack || error.message : String(error) })
}
