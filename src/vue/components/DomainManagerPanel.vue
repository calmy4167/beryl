<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { withSaveState } from '@/core/save-state'
import { unifiedAsyncRepository, unifiedFactories, type Domain } from '@/domain/unified'

const domains = ref<Domain[]>([])
const editing = ref<Domain | null>(null)
const key = ref('')
const displayName = ref('')
const showRetired = ref(false)
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const visibleDomains = computed(() => domains.value.filter(domain => showRetired.value || domain.status === 'active'))

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    domains.value = (await unifiedAsyncRepository.list<Domain>('domain')).sort((a, b) => a.displayName.localeCompare(b.displayName))
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '领域读取失败' }
  finally { loading.value = false }
}

function resetForm() { editing.value = null; key.value = ''; displayName.value = '' }
function beginEdit(domain: Domain) { editing.value = domain; key.value = domain.key; displayName.value = domain.displayName }

async function save() {
  const normalizedKey = key.value.trim()
  const normalizedName = displayName.value.trim()
  if (!normalizedKey || !normalizedName) { error.value = '请填写领域标识和名称。'; return }
  if (domains.value.some(item => item.calmyId !== editing.value?.calmyId && item.key.toLocaleLowerCase() === normalizedKey.toLocaleLowerCase())) {
    error.value = '这个领域标识已经使用。'
    return
  }
  saving.value = true
  error.value = ''
  try {
    await withSaveState(async () => {
      if (editing.value) {
        await unifiedAsyncRepository.update<Domain>('domain', editing.value.calmyId, {
          key: normalizedKey, displayName: normalizedName
        }, { expectedRevision: editing.value.revision })
      } else {
        await unifiedAsyncRepository.create(unifiedFactories.domain({ key: normalizedKey, displayName: normalizedName }))
      }
    })
    resetForm()
    await refresh()
    window.dispatchEvent(new CustomEvent('beryl-data-synced'))
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '领域保存失败' }
  finally { saving.value = false }
}

async function setRetired(domain: Domain, retired: boolean) {
  saving.value = true
  error.value = ''
  try {
    await withSaveState(() => unifiedAsyncRepository.update<Domain>('domain', domain.calmyId, {
      status: retired ? 'retired' : 'active'
    }, { expectedRevision: domain.revision }))
    await refresh()
    window.dispatchEvent(new CustomEvent('beryl-data-synced'))
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '领域状态更新失败' }
  finally { saving.value = false }
}

onMounted(() => { void refresh() })
</script>

<template>
  <section class="domain-manager" aria-labelledby="domain-manager-title">
    <header class="master-data-library-heading">
      <div><h2 id="domain-manager-title">生活领域</h2><p>领域用于整理同一份资料，不会复制记录或自动授予访问权。</p></div>
      <label><input v-model="showRetired" type="checkbox">显示已停用</label>
    </header>
    <form class="sentence-meta-form" @submit.prevent="void save()">
      <label>稳定标识<input v-model="key" aria-label="领域稳定标识" maxlength="80" placeholder="例如 health"></label>
      <label>显示名称<input v-model="displayName" aria-label="领域名称" maxlength="100" placeholder="例如 健康"></label>
      <div class="master-data-form-actions">
        <button v-if="editing" class="app-button" type="button" :disabled="saving" @click="resetForm">取消</button>
        <button class="app-button primary" type="submit" :disabled="saving">{{ saving ? '保存中…' : editing ? '保存领域' : '新增领域' }}</button>
      </div>
    </form>
    <p v-if="error" class="master-data-state error" role="alert">{{ error }}</p>
    <p v-if="loading" class="master-data-state" role="status">正在读取领域…</p>
    <ul v-else-if="visibleDomains.length" class="master-data-list">
      <li v-for="domain in visibleDomains" :key="domain.calmyId" :class="{ retired: domain.status === 'retired' }">
        <div class="master-data-copy"><div class="master-data-title-row"><h3>{{ domain.displayName }}</h3><span v-if="domain.status === 'retired'" class="master-data-status">已停用</span></div><p>{{ domain.key }}</p></div>
        <div class="master-data-item-actions">
          <button type="button" class="app-button" :disabled="saving" @click="beginEdit(domain)">编辑</button>
          <button type="button" class="app-button" :disabled="saving" @click="void setRetired(domain, domain.status !== 'retired')">{{ domain.status === 'retired' ? '恢复' : '停用' }}</button>
        </div>
      </li>
    </ul>
    <p v-else class="master-data-state">{{ showRetired ? '还没有领域。' : '还没有启用的领域。' }}</p>
  </section>
</template>
