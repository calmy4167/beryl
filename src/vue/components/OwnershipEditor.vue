<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { unifiedAsyncRepository } from '@/domain/unified/repository'
import type { EntityRef, Organization, Ownership, PrincipalRef, Space } from '@/domain/unified/model'
import type { Person } from '@/domain/unified/model'

const props = defineProps<{
  ownership?: Ownership
  people: Person[]
  principals?: PrincipalRef[]
  currentUserId?: string
  disabled?: boolean
  label?: string
}>()
const emit = defineEmits<{ save: [ownership: Ownership | undefined] }>()

const enabled = ref(!!props.ownership)
const ownerValue = ref('')
const coOwnerValues = ref<string[]>([])
const subjectPersonId = ref('')
const stewardValues = ref<string[]>([])
const privacy = ref<Ownership['privacy'] | ''>('')
const saving = ref(false)
const error = ref('')
const organizations = ref<Organization[]>([])
const spaces = ref<Space[]>([])
const principalLoadError = ref('')

function principalValue(principal: PrincipalRef): string { return `${principal.type}:${principal.id}` }
function parsePrincipal(value: string): PrincipalRef | undefined {
  const separator = value.indexOf(':')
  if (separator < 0) return undefined
  const type = value.slice(0, separator)
  const id = value.slice(separator + 1)
  if (!id || !['user', 'person', 'space', 'organization'].includes(type)) return undefined
  return { type: type as PrincipalRef['type'], id }
}
function syncFromProps(): void {
  enabled.value = !!props.ownership
  ownerValue.value = props.ownership ? principalValue(props.ownership.ownerRef) : ''
  coOwnerValues.value = (props.ownership?.coOwnerRefs || []).map(principalValue)
  subjectPersonId.value = props.ownership?.subjectRef?.entityType === 'person' ? props.ownership.subjectRef.calmyId : ''
  stewardValues.value = (props.ownership?.stewardRefs || []).map(principalValue)
  privacy.value = props.ownership?.privacy && props.ownership.privacy !== 'shared' ? props.ownership.privacy : ''
}
watch(() => props.ownership, syncFromProps, { immediate: true, deep: true })

const builtInPrincipals = () => [
  ...(props.currentUserId ? [{ type: 'user' as const, id: props.currentUserId }] : []),
  ...props.people.map(person => ({ type: 'person' as const, id: person.calmyId })),
  ...(props.principals || [])
]
function principalLabel(value: string): string {
  const principal = parsePrincipal(value)
  if (!principal) return value
  if (principal.type === 'user') return principal.id === props.currentUserId ? '当前账号' : `账号 ${principal.id}`
  if (principal.type === 'person') return props.people.find(person => person.calmyId === principal.id)?.displayName || '已归档人物'
  if (principal.type === 'space') return spaces.value.find(space => space.calmyId === principal.id)?.title || `空间 ${principal.id}`
  return organizations.value.find(organization => organization.calmyId === principal.id)?.title || `组织 ${principal.id}`
}
function optionsFor(...principals: PrincipalRef[]): string[] {
  const existing = [
    ...organizations.value.map(item => ({ type: 'organization' as const, id: item.calmyId })),
    ...spaces.value.map(item => ({ type: 'space' as const, id: item.calmyId }))
  ]
  return [...new Set([...builtInPrincipals().map(principalValue), ...existing.map(principalValue), ...principals.map(principalValue)])]
}
const principalOptions = () => optionsFor(...(props.ownership?.coOwnerRefs || []), ...(props.ownership?.stewardRefs || []), ...(props.ownership ? [props.ownership.ownerRef] : []))
const privacyExplanation = () => {
  if (privacy.value === 'private') return '私人：只有所有者可以查看；情境和空间成员身份不会开放访问。'
  if (privacy.value === 'restricted') return '指定授权后可见：必须明确授予这份资料的权限，情境或空间范围授权不会覆盖此设置。'
  if (privacy.value === 'scene') return '仅情境授权范围：需有对应情境的授权；参与者身份本身不会开放访问。'
  if (privacy.value === 'space') return '仅空间授权范围：需有对应空间的授权；成员身份本身不会开放访问。'
  return '未指定：权限信息不完整时默认隐藏，只有所有者或明确授权者可以查看。'
}

onMounted(async () => {
  const [organizationResult, spaceResult] = await Promise.allSettled([
    unifiedAsyncRepository.list<Organization>('organization'), unifiedAsyncRepository.list<Space>('space')
  ])
  if (organizationResult.status === 'fulfilled') organizations.value = organizationResult.value.filter(item => item.status === 'active')
  if (spaceResult.status === 'fulfilled') spaces.value = spaceResult.value.filter(item => item.status === 'active')
  if (organizationResult.status === 'rejected' || spaceResult.status === 'rejected') principalLoadError.value = '组织或空间候选暂时无法读取；已保存的归属仍可保留。'
})

async function save(): Promise<void> {
  error.value = ''
  if (!enabled.value) {
    saving.value = true
    try { emit('save', undefined) } finally { saving.value = false }
    return
  }
  const ownerRef = parsePrincipal(ownerValue.value)
  if (!ownerRef) { error.value = '请选择所有者'; return }
  const ownership: Ownership = {
    createdByUserId: props.ownership?.createdByUserId || props.currentUserId,
    ownerRef,
    coOwnerRefs: coOwnerValues.value.map(parsePrincipal).filter((item): item is PrincipalRef => !!item),
    subjectRef: subjectPersonId.value ? { entityType: 'person', calmyId: subjectPersonId.value } as EntityRef : undefined,
    stewardRefs: stewardValues.value.map(parsePrincipal).filter((item): item is PrincipalRef => !!item),
    privacy: privacy.value || undefined
  }
  saving.value = true
  try { emit('save', ownership) } finally { saving.value = false }
}
</script>

<template>
  <details class="ownership-editor" @toggle="error = ''">
    <summary>{{ label || '归属与可见范围' }}{{ ownership ? ' · 已设置' : ' · 未指定' }}</summary>
    <div class="ownership-fields">
      <label class="ownership-toggle"><input v-model="enabled" type="checkbox" :disabled="disabled">设置明确归属与可见范围</label>
      <p v-if="principalLoadError" class="form-error" role="status">{{ principalLoadError }}</p>
      <template v-if="enabled">
        <label>所有者
          <select v-model="ownerValue" :disabled="disabled">
            <option value="">选择所有者</option><option v-for="value in principalOptions()" :key="value" :value="value">{{ principalLabel(value) }}</option>
          </select>
        </label>
        <label>共同所有者
          <select v-model="coOwnerValues" multiple :disabled="disabled" aria-label="共同所有者"><option v-for="value in principalOptions()" :key="value" :value="value">{{ principalLabel(value) }}</option></select>
        </label>
        <label>数据主体（内容关于谁）
          <select v-model="subjectPersonId" :disabled="disabled"><option value="">未指定</option><option v-for="person in people" :key="person.calmyId" :value="person.calmyId">{{ person.displayName }}</option></select>
        </label>
        <label>管理者
          <select v-model="stewardValues" multiple :disabled="disabled" aria-label="管理者"><option v-for="value in principalOptions()" :key="value" :value="value">{{ principalLabel(value) }}</option></select>
        </label>
        <label>可见范围
          <select v-model="privacy" :disabled="disabled"><option value="">未指定（按默认拒绝处理）</option><option value="private">私人</option><option value="restricted">指定授权后可见</option><option value="scene">仅情境授权范围</option><option value="space">仅空间授权范围</option></select>
        </label>
        <p class="privacy-explanation">{{ privacyExplanation() }}</p>
      </template>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="app-button" type="button" :disabled="disabled || saving" @click="save">{{ saving ? '保存中…' : '保存归属设置' }}</button>
    </div>
  </details>
</template>

<style scoped>
.ownership-editor{margin-top:8px}.ownership-editor summary{cursor:pointer;color:var(--c-text-2);font-size:.82rem}.ownership-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));align-items:end;gap:8px;margin-top:8px}.ownership-fields label{display:grid;gap:4px;font-size:.78rem;color:var(--c-text-2)}.ownership-fields select{min-height:36px;max-width:100%;border:1px solid var(--c-border);border-radius:8px;background:var(--c-bg);color:var(--c-text);padding:6px}.ownership-toggle{grid-column:1/-1;display:flex!important;align-items:center;gap:8px}.ownership-fields button{justify-self:start}.privacy-explanation{grid-column:1/-1;margin:0;color:var(--c-text-2);font-size:.78rem}.form-error{grid-column:1/-1}
</style>
