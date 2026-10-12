import { createEntityId } from '@/core/repository'
import { actionAsyncRepository } from '@/domain/action/repository'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter } from '@/domain/matter/model'
import { recordAsyncRepository } from '@/domain/record/repository'
import { financeAsyncRepository } from '@/domain/finance/repository'
import { unifiedAsyncRepository, unifiedFactories, type CoreEntityType, type EntityRef, type RealitySettlementDecision, type Relation, type Scene } from '@/domain/unified'

export type RealitySettlementChoice = 'keep' | 'retire' | 'reassociate'
export interface RealitySettlementInput {
  entityRef: EntityRef
  choice: RealitySettlementChoice
  targetRef?: EntityRef
}

const SETTLEABLE_ENTITY_TYPES = new Set<EntityRef['entityType']>(['action', 'record', 'resource', 'asset', 'finance_entry', 'relationship', 'insight', 'important_date'])

function sameRef(a: EntityRef, b: EntityRef): boolean {
  return a.entityType === b.entityType && a.calmyId === b.calmyId
}

function sameRelationTarget(relation: Relation, source: EntityRef, target: EntityRef): boolean {
  return ['used_in', 'context_of'].includes(relation.relationType)
    && sameRef(relation.from, source) && sameRef(relation.to, target) && !relation.archivedAt
}

async function entityExists(ref: EntityRef): Promise<boolean> {
  if (ref.entityType === 'action') return !!await actionAsyncRepository.find(ref.calmyId)
  if (ref.entityType === 'record') return !!await recordAsyncRepository.find(ref.calmyId)
  if (ref.entityType === 'finance_entry') return !!await financeAsyncRepository.find(ref.calmyId)
  if (ref.entityType === 'thing' || ref.entityType === 'matter') return !!await matterAsyncRepository.find(ref.calmyId)
  if (['resource', 'asset'].includes(ref.entityType)) return !!await unifiedAsyncRepository.find(ref.entityType as 'resource' | 'asset', ref.calmyId)
  if (ref.entityType === 'relationship' || ref.entityType === 'insight' || ref.entityType === 'important_date') return !!await unifiedAsyncRepository.find(ref.entityType as CoreEntityType, ref.calmyId)
  if (ref.entityType === 'scene') return !!await unifiedAsyncRepository.find('scene', ref.calmyId)
  return false
}

/** Records choices and updates typed links only; payloads remain in their canonical repositories. */
export async function settleRealityContext(
  sceneId: string,
  inputs: RealitySettlementInput[],
  meta: { commandId?: string; actorId?: string } = {}
): Promise<Scene> {
  const contextRef: EntityRef = { entityType: 'scene', calmyId: sceneId }
  return settleContext(contextRef, inputs, meta) as Promise<Scene>
}

export async function settleThingContext(
  thingId: string,
  inputs: RealitySettlementInput[],
  meta: { commandId?: string; actorId?: string } = {}
): Promise<Matter> {
  const contextRef: EntityRef = { entityType: 'thing', calmyId: thingId }
  return settleContext(contextRef, inputs, meta) as Promise<Matter>
}

async function settleContext(
  contextRef: EntityRef,
  inputs: RealitySettlementInput[],
  meta: { commandId?: string; actorId?: string }
): Promise<Scene | Matter> {
  const context = contextRef.entityType === 'scene'
    ? await unifiedAsyncRepository.find<Scene>('scene', contextRef.calmyId)
    : await matterAsyncRepository.find(contextRef.calmyId)
  if (!context) throw new Error(`${contextRef.entityType} ${contextRef.calmyId} not found`)
  if (contextRef.entityType === 'scene' && (context as Scene).status !== 'completed' && (context as Scene).status !== 'archived') throw new Error('Complete the Scene before settling its records')
  if (contextRef.entityType === 'thing' && (context as Matter).status !== 'archived') throw new Error('Archive the Thing before settling its records')
  if (!inputs.length) throw new Error('Select at least one record to settle')
  const refs = inputs.map(input => `${input.entityRef.entityType}:${input.entityRef.calmyId}`)
  if (new Set(refs).size !== refs.length) throw new Error('A record can appear only once in a settlement')

  const commandId = meta.commandId || createEntityId()
  if (context.settlements?.some(settlement => settlement.commandId === commandId)) return context
  const activeRelations = (await unifiedAsyncRepository.list<Relation>('relation')).filter(item => !item.archivedAt)
  const decisions: RealitySettlementDecision[] = []
  const now = Date.now()
  const prepared: Array<RealitySettlementInput & { targetRef?: EntityRef }> = []

  for (const input of inputs) {
    if (!SETTLEABLE_ENTITY_TYPES.has(input.entityRef.entityType)) throw new Error(`Cannot settle ${input.entityRef.entityType} as a linked content Entity`)
    if (!await entityExists(input.entityRef)) {
      throw new Error(`Entity ${input.entityRef.entityType}:${input.entityRef.calmyId} not found`)
    }
    let targetRef: EntityRef | undefined
    if (input.choice === 'keep') targetRef = contextRef
    if (input.choice === 'reassociate') {
      targetRef = input.targetRef
      if (!targetRef || !['scene', 'thing', 'matter'].includes(targetRef.entityType)) throw new Error('Choose a Thing or Scene to re-associate this record')
      if (sameRef(targetRef, contextRef)) throw new Error('Choose another Thing or Scene, or keep the record in this context')
      if (!await entityExists(targetRef)) throw new Error(`Target ${targetRef.entityType}:${targetRef.calmyId} not found`)
    }
    prepared.push({ ...input, targetRef })
  }

  for (const input of prepared) {
    const targetRef = input.targetRef
    const previousContextLinks = activeRelations.filter(relation => sameRelationTarget(relation, input.entityRef, contextRef))
    if (previousContextLinks.length && (input.choice === 'retire' || input.choice === 'reassociate')) {
      for (const relation of previousContextLinks) {
        await unifiedAsyncRepository.update<Relation>('relation', relation.calmyId, { archivedAt: now }, {
          commandId: `${commandId}:archive:${relation.calmyId}`,
          actorId: meta.actorId, expectedRevision: relation.revision, sourceIds: ['reality:settlement']
        })
      }
    }
    if (targetRef && !activeRelations.some(relation => sameRelationTarget(relation, input.entityRef, targetRef))) {
      const relation = unifiedFactories.relation({ from: input.entityRef, to: targetRef, relationType: 'used_in', directed: true, sourceIds: ['reality:settlement'] })
      await unifiedAsyncRepository.create(relation, {
        commandId: `${commandId}:link:${input.entityRef.entityType}:${input.entityRef.calmyId}`,
        actorId: meta.actorId, sourceIds: ['reality:settlement']
      })
    }
    decisions.push({ entityRef: input.entityRef, choice: input.choice, targetRef, decidedAt: now })
  }

  const settlement = { commandId, settledAt: now, decisions }
  if (contextRef.entityType === 'scene') {
    const scene = context as Scene
    return unifiedAsyncRepository.update<Scene>('scene', scene.calmyId, { settlements: [...(scene.settlements || []), settlement] }, {
      commandId: `${commandId}:scene`, actorId: meta.actorId, expectedRevision: scene.revision, sourceIds: ['reality:settlement']
    })
  }
  const thing = context as Matter
  return matterAsyncRepository.update(thing.calmyId, { settlements: [...(thing.settlements || []), settlement] }, {
    commandId: `${commandId}:thing`, actorId: meta.actorId, expectedRevision: thing.revision, sourceIds: ['reality:settlement']
  })
}
