import { createCollectionRepository, createEntityId } from '@/core/repository'
import {
  CoreDomainError,
  canTransitionCycle,
  canTransitionStage,
  type CoreCommandMeta,
  type CoreEntity,
  type CoreEntityMutation,
  type CoreEntitySource,
  type CoreEntityType,
  type Cycle,
  type CycleStatus,
  type DailyState,
  type Asset,
  type Insight,
  type Outcome,
  type Person,
  type Practice,
  type Relation,
  type Relationship,
  type Resource,
  type Seed,
  type SharedSpace,
  type Stage,
  type StageStatus
} from './model'

type RepositoryItem = CoreEntity

const entityStores = new Map<CoreEntityType, ReturnType<typeof createCollectionRepository<RepositoryItem>>>()
const mutations = createCollectionRepository<CoreEntityMutation>('coreEntityMutations')
const commands = createCollectionRepository<{ id: string; result: RepositoryItem }>('coreEntityCommands')

function storeFor(type: CoreEntityType) {
  let store = entityStores.get(type)
  if (!store) {
    store = createCollectionRepository<RepositoryItem>(`core:${type}`, item => item.calmyId)
    entityStores.set(type, store)
  }
  return store
}

function metaOf(meta: CoreCommandMeta = {}): Required<Pick<CoreCommandMeta, 'commandId' | 'actor' | 'sourceIds'>> {
  return { commandId: meta.commandId || createEntityId(), actor: meta.actor || 'user', sourceIds: meta.sourceIds || [] }
}

function requireText(value: string | undefined, label: string): string {
  const normalized = value?.trim() || ''
  if (!normalized) throw new CoreDomainError('VALIDATION_FAILED', `${label} is required`)
  return normalized
}

function assertEntity(entity: RepositoryItem): void {
  if (!entity.calmyId || !entity.entityType) throw new CoreDomainError('VALIDATION_FAILED', 'Core entity id and type are required')
  if (!Number.isFinite(entity.revision) || entity.revision < 1) throw new CoreDomainError('VALIDATION_FAILED', 'Core entity revision must be positive')
}

function appendMutation(entity: RepositoryItem, operation: CoreEntityMutation['operation'], commandId: string, actor: CoreEntitySource, sourceIds: string[], fromRevision: number, patch?: unknown): void {
  mutations.create({
    id: createEntityId(), entityType: entity.entityType, entityId: entity.calmyId, operation, commandId,
    actor, sourceIds, fromRevision, toRevision: entity.revision, occurredAt: Date.now(), patch
  })
}

function duplicateResult(commandId: string): RepositoryItem | undefined {
  return commands.find(commandId)?.result
}

function saveCommand(commandId: string, result: RepositoryItem): RepositoryItem {
  commands.create({ id: commandId, result })
  return result
}

function assertRevision(entity: RepositoryItem, expectedRevision?: number): void {
  if (expectedRevision !== undefined && expectedRevision !== entity.revision) {
    throw new CoreDomainError('REVISION_CONFLICT', `${entity.entityType} ${entity.calmyId} is at revision ${entity.revision}`)
  }
}

export const unifiedRepository = {
  list<T extends RepositoryItem>(entityType: T['entityType']): T[] {
    return storeFor(entityType).list().filter(item => item.entityType === entityType) as T[]
  },
  listCyclesForMatter(matterId: string): Cycle[] {
    return this.list<Cycle>('cycle')
      .filter(item => item.matterId === matterId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  },
  listStagesForCycle(cycleId: string): Stage[] {
    return this.list<Stage>('stage')
      .filter(item => item.cycleId === cycleId)
      .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.createdAt - b.createdAt)
  },
  listRelationshipsForMatter(matterId: string): Relationship[] {
    return this.list<Relationship>('relationship')
      .filter(item => item.status === 'active' && (item.matterIds.includes(matterId) || item.blockedMatterIds?.includes(matterId) || item.allowedMatterIds?.includes(matterId)))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  },
  listSharedSpacesForMatter(matterId: string): SharedSpace[] {
    return this.list<SharedSpace>('shared_space')
      .filter(item => item.status === 'active' && (item.matterIds.includes(matterId) || item.blockedMatterIds?.includes(matterId) || item.allowedMatterIds?.includes(matterId)))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  },
  listOutcomesForAction(actionId: string): Outcome[] {
    return this.list<Outcome>('outcome')
      .filter(item => item.actionId === actionId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  },
  listPracticesForOutcome(outcomeId: string): Practice[] {
    return this.list<Practice>('practice')
      .filter(item => item.outcomeIds.includes(outcomeId))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  },
  find<T extends RepositoryItem>(entityType: T['entityType'], calmyId: string): T | undefined {
    return storeFor(entityType).find(calmyId) as T | undefined
  },
  create<T extends RepositoryItem>(entity: T, meta: CoreCommandMeta = {}): T {
    assertEntity(entity)
    const command = metaOf(meta)
    const duplicate = duplicateResult(command.commandId)
    if (duplicate) return duplicate as T
    const current = storeFor(entity.entityType).find(entity.calmyId)
    if (current) throw new CoreDomainError('VALIDATION_FAILED', `${entity.entityType} ${entity.calmyId} already exists`)
    storeFor(entity.entityType).create(entity)
    appendMutation(entity, 'create', command.commandId, command.actor, command.sourceIds, 0, entity)
    return saveCommand(command.commandId, entity) as T
  },
  update<T extends RepositoryItem>(entityType: T['entityType'], calmyId: string, patch: Partial<T>, meta: CoreCommandMeta = {}): T {
    const command = metaOf(meta)
    const duplicate = duplicateResult(command.commandId)
    if (duplicate) return duplicate as T
    const current = storeFor(entityType).find(calmyId)
    if (!current) throw new CoreDomainError('NOT_FOUND', `${entityType} ${calmyId} not found`)
    assertRevision(current, meta.expectedRevision)
    const next = { ...current, ...patch, updatedAt: Date.now(), revision: current.revision + 1 } as T
    assertEntity(next)
    storeFor(entityType).update(calmyId, () => next)
    appendMutation(next, 'update', command.commandId, command.actor, command.sourceIds, current.revision, patch)
    return saveCommand(command.commandId, next) as T
  },
  transitionCycle(calmyId: string, status: CycleStatus, meta: CoreCommandMeta = {}): Cycle {
    const current = this.find<Cycle>('cycle', calmyId)
    if (!current) throw new CoreDomainError('NOT_FOUND', `cycle ${calmyId} not found`)
    if (!canTransitionCycle(current.status, status)) throw new CoreDomainError('INVALID_TRANSITION', `${current.status} → ${status} is not allowed`)
    return this.update<Cycle>('cycle', calmyId, { status }, meta)
  },
  transitionStage(calmyId: string, status: StageStatus, meta: CoreCommandMeta = {}): Stage {
    const current = this.find<Stage>('stage', calmyId)
    if (!current) throw new CoreDomainError('NOT_FOUND', `stage ${calmyId} not found`)
    if (!canTransitionStage(current.status, status)) throw new CoreDomainError('INVALID_TRANSITION', `${current.status} → ${status} is not allowed`)
    return this.update<Stage>('stage', calmyId, { status }, meta)
  },
  createCycleForMatter(input: Omit<Cycle, keyof CoreEntityMetaSeed>, meta: CoreCommandMeta = {}): Cycle {
    return this.create(unifiedFactories.cycle(input), meta)
  },
  createStageForCycle(input: Omit<Stage, keyof CoreEntityMetaSeed>, meta: CoreCommandMeta = {}): Stage {
    const cycle = this.find<Cycle>('cycle', input.cycleId)
    if (!cycle) throw new CoreDomainError('NOT_FOUND', `cycle ${input.cycleId} not found`)
    const stage = this.create(unifiedFactories.stage(input), meta)
    if (!cycle.stageIds.includes(stage.calmyId)) {
      this.update<Cycle>('cycle', cycle.calmyId, { stageIds: [...cycle.stageIds, stage.calmyId] }, { expectedRevision: cycle.revision })
    }
    return stage
  },
  createOutcomeForAction(input: Omit<Outcome, keyof CoreEntityMetaSeed>, meta: CoreCommandMeta = {}): Outcome {
    return this.create(unifiedFactories.outcome({ ...input, actionId: requireText(input.actionId, 'Outcome actionId'), summary: requireText(input.summary, 'Outcome summary') }), meta)
  },
  createPracticeFromOutcome(input: Omit<Practice, keyof CoreEntityMetaSeed>, meta: CoreCommandMeta = {}): Practice {
    const title = requireText(input.title, 'Practice title')
    const description = requireText(input.description, 'Practice description')
    if (!input.outcomeIds.length) throw new CoreDomainError('VALIDATION_FAILED', 'Practice must reference at least one Outcome')
    for (const outcomeId of input.outcomeIds) {
      if (!this.find<Outcome>('outcome', outcomeId)) throw new CoreDomainError('NOT_FOUND', `outcome ${outcomeId} not found`)
    }
    return this.create(unifiedFactories.practice({ ...input, title, description }), meta)
  },
  createAsset(input: Omit<Asset, keyof CoreEntityMetaSeed>, meta: CoreCommandMeta = {}): Asset {
    return this.create(unifiedFactories.asset(input), meta)
  },
  updateResourceStatus(calmyId: string, status: Resource['status'], meta: CoreCommandMeta = {}): Resource {
    const current = this.find<Resource>('resource', calmyId)
    if (!current) throw new CoreDomainError('NOT_FOUND', `resource ${calmyId} not found`)
    return this.update<Resource>('resource', calmyId, { status, archivedAt: status === 'retired' ? Date.now() : undefined }, meta)
  },
  updateAssetLifecycle(calmyId: string, lifecycle: Asset['lifecycle'], meta: CoreCommandMeta = {}): Asset {
    const current = this.find<Asset>('asset', calmyId)
    if (!current) throw new CoreDomainError('NOT_FOUND', `asset ${calmyId} not found`)
    return this.update<Asset>('asset', calmyId, { lifecycle, archivedAt: lifecycle === 'retired' ? Date.now() : undefined }, meta)
  },
  archive<T extends RepositoryItem>(entityType: T['entityType'], calmyId: string, meta: CoreCommandMeta = {}): T {
    const current = this.find<T>(entityType, calmyId)
    if (!current) throw new CoreDomainError('NOT_FOUND', `${entityType} ${calmyId} not found`)
    return this.update(entityType, calmyId, { archivedAt: Date.now() } as Partial<T>, meta)
  },
  importEntity<T extends RepositoryItem>(entity: T): 'created' | 'unchanged' {
    assertEntity(entity)
    const current = storeFor(entity.entityType).find(entity.calmyId)
    if (current) {
      if (JSON.stringify(current) === JSON.stringify(entity)) return 'unchanged'
      throw new CoreDomainError('REVISION_CONFLICT', `${entity.entityType} ${entity.calmyId} has local changes`)
    }
    storeFor(entity.entityType).create(entity)
    appendMutation(entity, 'create', `import:${entity.calmyId}:${entity.revision}`, 'import', [], 0, entity)
    return 'created'
  },
  replaceImported<T extends RepositoryItem>(entity: T): 'replaced' | 'unchanged' | 'created' {
    assertEntity(entity)
    const current = storeFor(entity.entityType).find(entity.calmyId)
    if (!current) return this.importEntity(entity)
    if (JSON.stringify(current) === JSON.stringify(entity)) return 'unchanged'
    storeFor(entity.entityType).update(entity.calmyId, () => entity)
    appendMutation(entity, 'update', `import-replace:${entity.calmyId}:${entity.revision}`, 'import', [], current.revision, entity)
    return 'replaced'
  },
  mutations(entityType?: CoreEntityType, calmyId?: string): CoreEntityMutation[] {
    return mutations.list().filter(item => (!entityType || item.entityType === entityType) && (!calmyId || item.entityId === calmyId)).sort((a, b) => a.occurredAt - b.occurredAt)
  },
  remove(entityType: CoreEntityType, calmyId: string): boolean {
    return storeFor(entityType).remove(calmyId)
  }
}

function createMeta<T extends CoreEntityType>(entityType: T, source: CoreEntitySource = 'user'): CoreEntityMetaSeed & { entityType: T } {
  const now = Date.now()
  return { calmyId: createEntityId(), entityType, createdAt: now, updatedAt: now, revision: 1, source }
}

type CoreEntityMetaSeed = { calmyId: string; entityType: CoreEntityType; createdAt: number; updatedAt: number; revision: number; source: CoreEntitySource }

export const unifiedFactories = {
  person(input: Pick<Person, 'displayName'> & Partial<Omit<Person, keyof CoreEntityMetaSeed | 'displayName'>>): Person {
    return {
      ...createMeta('person'), displayName: requireText(input.displayName, 'Person displayName'), status: input.status || 'active',
      roles: input.roles || [], domain: input.domain, notes: input.notes, tags: input.tags || []
    }
  },
  cycle(input: Omit<Cycle, keyof CoreEntityMetaSeed>): Cycle {
    return { ...createMeta('cycle'), ...input }
  },
  stage(input: Omit<Stage, keyof CoreEntityMetaSeed>): Stage {
    return { ...createMeta('stage'), ...input }
  },
  relationship(input: Omit<Relationship, keyof CoreEntityMetaSeed>): Relationship {
    return { ...createMeta('relationship'), ...input }
  },
  sharedSpace(input: Omit<SharedSpace, keyof CoreEntityMetaSeed>): SharedSpace {
    return { ...createMeta('shared_space'), ...input }
  },
  resource(input: Omit<Resource, keyof CoreEntityMetaSeed>): Resource {
    return { ...createMeta('resource'), ...input, title: requireText(input.title, 'Resource title') }
  },
  relation(input: Omit<Relation, keyof CoreEntityMetaSeed>): Relation {
    return { ...createMeta('relation'), ...input }
  },
  seed(input: Omit<Seed, keyof CoreEntityMetaSeed>): Seed {
    return { ...createMeta('seed'), ...input }
  },
  insight(input: Omit<Insight, keyof CoreEntityMetaSeed>): Insight {
    return { ...createMeta('insight'), ...input }
  },
  outcome(input: Omit<Outcome, keyof CoreEntityMetaSeed>): Outcome {
    return { ...createMeta('outcome'), ...input }
  },
  practice(input: Omit<Practice, keyof CoreEntityMetaSeed>): Practice {
    return { ...createMeta('practice'), ...input }
  },
  asset(input: Omit<Asset, keyof CoreEntityMetaSeed>): Asset {
    const path = requireText(input.path, 'Asset path')
    const mimeType = requireText(input.mimeType, 'Asset mimeType')
    if (!Number.isFinite(input.sizeBytes) || input.sizeBytes < 0) throw new CoreDomainError('VALIDATION_FAILED', 'Asset sizeBytes must be non-negative')
    if (!Number.isInteger(input.version) || input.version < 1) throw new CoreDomainError('VALIDATION_FAILED', 'Asset version must be a positive integer')
    return { ...createMeta('asset'), ...input, path, mimeType }
  },
  dailyState(input: Omit<DailyState, keyof CoreEntityMetaSeed>): DailyState {
    if (input.load < 0 || input.load > 100) throw new CoreDomainError('VALIDATION_FAILED', 'DailyState load must be between 0 and 100')
    return { ...createMeta('daily_state'), ...input }
  }
}
