import { describe, expect, it } from 'vitest'
import { insertTextAtRange } from '@/domain/master-data-text'

describe('master-data text snapshots', () => {
  it('inserts a sentence at the active caret without replacing surrounding draft text', () => {
    expect(insertTextAtRange('前面的草稿后面的草稿', 5, 5, '可复用句子')).toEqual({
      value: '前面的草稿可复用句子后面的草稿',
      caret: 10,
    })
  })

  it('replaces only the selected range and returns the restored caret position', () => {
    const inserted = insertTextAtRange('开头旧句结尾', 2, 4, '当前模板内容')
    expect(inserted).toEqual({ value: '开头当前模板内容结尾', caret: 8 })
    expect(inserted.value).not.toContain('后来被修改的模板')
  })

  it('clamps invalid selection ranges to the available text', () => {
    expect(insertTextAtRange('草稿', -8, 50, '新内容')).toEqual({ value: '新内容', caret: 3 })
    expect(insertTextAtRange('草稿', 2, 1, '尾')).toEqual({ value: '草稿尾', caret: 3 })
  })
})
