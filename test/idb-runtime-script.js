const output = document.querySelector('#result')
const DB_NAME = 'beryl-db'

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
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

try {
  await seedVersionTwo()
  const { dbDelete, dbPut, getDbStatus, initDb, readChanges, readDbMeta, readKvSnapshot, writeDbMeta } = await import('/src/core/db.ts?browser-idb-test')
  const { syncEntityData } = await import('/src/core/entity-sync.ts?browser-idb-test')
  const { cloudConnect, disconnect } = await import('/src/core/sync.ts?browser-idb-test')
  const { createDurableBackup } = await import('/src/core/backup.ts?browser-idb-test')
  const { createDurableEntityMigrationPlan } = await import('/src/core/entity-migration.ts?browser-idb-test')
  const { createAsyncCollectionRepository } = await import('/src/core/repository.ts?browser-idb-test')
  await initDb()
  const restored = await readKvSnapshot()
  const names = await storeNames()

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
    migrationFlushesPendingWrite,
    asyncRepositoryUsesDurableSnapshot,
    atomicEntityValueAndLog,
    dbMetaWriteConfirmed: metaWrite && metaRead?.confirmed === true,
    entityInitialMergeConfirmed: entitySyncResult.pulled === 0 && entityPushes === 1 && entityPulls === 2 && entityCursor?.ts === 8 && entityReady === true && initialTaskPreserved,
    keySyncCursorDurable: keySyncConnected && keyCursor?.ts === 9,
    databaseReady: getDbStatus().available === true
  }
  output.textContent = JSON.stringify({ ok: Object.values(checks).every(Boolean), checks })
} catch (error) {
  output.textContent = JSON.stringify({ ok: false, error: error instanceof Error ? error.stack || error.message : String(error) })
}
