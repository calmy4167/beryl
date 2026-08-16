import { createCollectionRepository, createEntityId } from '@/core/repository'
import { readSession } from '@/core/auth'
import type { SocialAuthor, SocialComment, SocialPost, SocialVisibility } from './model'

const posts = createCollectionRepository<SocialPost>('moments')

export function currentAuthor(): SocialAuthor {
  const id = readSession()?.u || 'local-user'
  return { id, name: id }
}

export const socialRepository = {
  list(): SocialPost[] {
    return posts.list().slice().sort((a, b) => b.createdAt - a.createdAt)
  },
  create(content: string, visibility: SocialVisibility = 'private'): SocialPost {
    const now = Date.now()
    const post: SocialPost = { id: createEntityId(), author: currentAuthor(), content: content.trim(), visibility, createdAt: now, updatedAt: now, likedBy: [], comments: [] }
    return posts.create(post)
  },
  remove(id: string): boolean { return posts.remove(id) },
  toggleLike(id: string, authorId = currentAuthor().id): boolean {
    return posts.update(id, post => ({ ...post, likedBy: post.likedBy.includes(authorId) ? post.likedBy.filter(item => item !== authorId) : [...post.likedBy, authorId], updatedAt: Date.now() }))
  },
  addComment(postId: string, content: string, parentId?: string, author = currentAuthor()): SocialComment | null {
    const value = content.trim(); if (!value) return null
    const comment: SocialComment = { id: createEntityId(), postId, author, content: value, createdAt: Date.now(), ...(parentId ? { parentId } : {}) }
    return posts.update(postId, post => ({ ...post, comments: [...(post.comments || []), comment], updatedAt: Date.now() })) ? comment : null
  },
  removeComment(postId: string, commentId: string): boolean {
    return posts.update(postId, post => ({ ...post, comments: (post.comments || []).filter(comment => comment.id !== commentId && comment.parentId !== commentId), updatedAt: Date.now() }))
  }
}
