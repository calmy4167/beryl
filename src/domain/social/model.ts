export type SocialVisibility = 'private' | 'friends' | 'public'

export interface SocialAuthor {
  id: string
  name: string
  avatar?: string
}

export interface SocialComment {
  id: string
  postId: string
  author: SocialAuthor
  content: string
  createdAt: number
  parentId?: string
}

export interface SocialPost {
  id: string
  author: SocialAuthor
  content: string
  visibility: SocialVisibility
  createdAt: number
  updatedAt: number
  likedBy: string[]
  comments: SocialComment[]
}

export const VISIBILITY_LABEL: Record<SocialVisibility, string> = {
  private: '仅自己',
  friends: '朋友可见',
  public: '公开'
}
