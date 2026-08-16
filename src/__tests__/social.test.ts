import { beforeEach, describe, expect, it } from 'vitest'
import { socialRepository } from '@/domain/social/repository'

describe('social moments repository', () => {
  beforeEach(() => localStorage.clear())

  it('creates a single-user post with a future-safe author and visibility contract', () => {
    const post = socialRepository.create('今天完成了一件小事', 'friends')
    expect(post.content).toBe('今天完成了一件小事')
    expect(post.visibility).toBe('friends')
    expect(post.author.id).toBeTruthy()
    expect(post.likedBy).toEqual([])
    expect(post.comments).toEqual([])
  })

  it('toggles likes idempotently for the same author', () => {
    const post = socialRepository.create('一条动态')
    socialRepository.toggleLike(post.id, 'me')
    expect(socialRepository.list()[0].likedBy).toEqual(['me'])
    socialRepository.toggleLike(post.id, 'me')
    expect(socialRepository.list()[0].likedBy).toEqual([])
  })

  it('stores threaded comments and removes a reply tree with its parent', () => {
    const post = socialRepository.create('欢迎评论')
    const root = socialRepository.addComment(post.id, '第一条评论', undefined, { id: 'me', name: '我' })!
    socialRepository.addComment(post.id, '回复第一条', root.id, { id: 'friend', name: '朋友' })
    expect(socialRepository.list()[0].comments[1].parentId).toBe(root.id)
    socialRepository.removeComment(post.id, root.id)
    expect(socialRepository.list()[0].comments).toEqual([])
  })

  it('rejects blank comments without mutating the post', () => {
    const post = socialRepository.create('不能有空评论')
    expect(socialRepository.addComment(post.id, '   ')).toBeNull()
    expect(socialRepository.list()[0].comments).toEqual([])
  })
})
