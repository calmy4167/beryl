import type { Ownership } from './model'

/** Assign a default owner only when the authenticated user explicitly creates an Entity. */
export function ownershipForSignedInUser(ownership: Ownership | undefined, userId: string): Ownership {
  if (ownership) return {
    ...ownership,
    createdByUserId: ownership.createdByUserId || userId,
    privacy: ownership.privacy || 'private'
  }
  return { createdByUserId: userId, ownerRef: { type: 'user', id: userId }, stewardRefs: [], privacy: 'private' }
}
