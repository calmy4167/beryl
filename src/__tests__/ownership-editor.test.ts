import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { setActiveAccount } from '@/core/account-context'
import { resetStoreCache } from '@/core/storage'
import OwnershipEditor from '@/vue/components/OwnershipEditor.vue'

describe('OwnershipEditor privacy explanations', () => {
  afterEach(() => { setActiveAccount(null); resetStoreCache() })

  it('explains the access boundary for each visibility choice', async () => {
    setActiveAccount('ownership-editor-test-user')
    const page = mount(OwnershipEditor, {
      props: { people: [], currentUserId: 'user-1', ownership: { ownerRef: { type: 'user', id: 'user-1' }, stewardRefs: [], privacy: 'private' } }
    })
    await flushPromises()

    expect(page.text()).toContain('私人：只有所有者可以查看；情境和空间成员身份不会开放访问。')
    const privacySelect = page.get('.ownership-fields label:last-of-type select')
    await privacySelect.setValue('restricted')
    expect(page.text()).toContain('指定授权后可见：必须明确授予这份资料的权限，情境或空间范围授权不会覆盖此设置。')
    await privacySelect.setValue('scene')
    expect(page.text()).toContain('仅情境授权范围：需有对应情境的授权；参与者身份本身不会开放访问。')
    await privacySelect.setValue('space')
    expect(page.text()).toContain('仅空间授权范围：需有对应空间的授权；成员身份本身不会开放访问。')
  })
})
