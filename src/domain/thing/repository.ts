import type { MatterCommandMeta, MatterCreateInput, MatterMutation, MatterUpdatePatch, Thing } from '@/domain/matter/model'
import { matterFromThing, thingFromMatter } from '@/domain/matter/model'
import { matterAsyncRepository, matterRepository } from '@/domain/matter/repository'

export type ThingCreateInput = MatterCreateInput
export type ThingUpdatePatch = MatterUpdatePatch

export const thingRepository = {
  find(calmyId: string): Thing | undefined {
    const matter = matterRepository.find(calmyId)
    return matter && thingFromMatter(matter, matterRepository.mutations(calmyId))
  },
  list(): Thing[] {
    return matterRepository.list().map(matter => thingFromMatter(matter, matterRepository.mutations(matter.calmyId)))
  },
  create(input: ThingCreateInput, meta: MatterCommandMeta = {}): Thing {
    const matter = matterRepository.create(input, meta)
    return thingFromMatter(matter, matterRepository.mutations(matter.calmyId))
  },
  update(calmyId: string, patch: ThingUpdatePatch, meta: MatterCommandMeta = {}): Thing {
    const matter = matterRepository.update(calmyId, patch, meta)
    return thingFromMatter(matter, matterRepository.mutations(calmyId))
  },
  mutations(calmyId?: string): MatterMutation[] {
    return matterRepository.mutations(calmyId)
  }
}

export const thingAsyncRepository = {
  async find(calmyId: string): Promise<Thing | undefined> {
    const matter = await matterAsyncRepository.find(calmyId)
    if (!matter) return undefined
    return thingFromMatter(matter, await matterAsyncRepository.mutations(calmyId))
  },
  async list(): Promise<Thing[]> {
    const matters = await matterAsyncRepository.list()
    return Promise.all(matters.map(async matter => thingFromMatter(matter, await matterAsyncRepository.mutations(matter.calmyId))))
  },
  async create(input: ThingCreateInput, meta: MatterCommandMeta = {}): Promise<Thing> {
    const matter = await matterAsyncRepository.create(input, meta)
    return thingFromMatter(matter, await matterAsyncRepository.mutations(matter.calmyId))
  },
  async update(calmyId: string, patch: ThingUpdatePatch, meta: MatterCommandMeta = {}): Promise<Thing> {
    const matter = await matterAsyncRepository.update(calmyId, patch, meta)
    return thingFromMatter(matter, await matterAsyncRepository.mutations(calmyId))
  },
  mutations(calmyId?: string): Promise<MatterMutation[]> {
    return matterAsyncRepository.mutations(calmyId)
  }
}

// Keep a direct conversion available for callers that receive a Thing payload.
export { matterFromThing }
