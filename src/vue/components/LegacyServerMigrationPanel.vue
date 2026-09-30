<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { apiBaseUrl } from '@/core/api/base-url'
import { apiFetch } from '@/core/api/client'
import { exportLegacyCipherBackup, fetchLegacyD1Export, importLegacyD1Export, legacyD1RowCount, type LegacyD1Export } from '@/core/legacy-server-migration'

const counts = ref<{ recordCount: number; entityCount: number } | null>(null)
const backup = ref<LegacyD1Export | null>(null)
const legacyPassword = ref('')
const backupDownloaded = ref(false)
const deleteConfirmed = ref(false)
const loading = ref(false)
const error = ref('')
const report = ref('')

async function loadStatus() {
  loading.value = true
  error.value = ''
  try {
    const response = await apiFetch(apiBaseUrl(), '/api/admin/legacy/status')
    const body = await response.json().catch(() => ({})) as { recordCount?: number; entityCount?: number; error?: string }
    if (!response.ok) throw new Error(body.error || `legacy-status:${response.status}`)
    counts.value = { recordCount: Number(body.recordCount || 0), entityCount: Number(body.entityCount || 0) }
    if (!counts.value.recordCount && !counts.value.entityCount) report.value = '旧版 D1 中没有待迁移记录。'
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '无法读取旧版 D1 状态' }
  finally { loading.value = false }
}

async function prepareBackup() {
  loading.value = true
  error.value = ''
  try {
    const data = await fetchLegacyD1Export(apiBaseUrl())
    const actualCount = legacyD1RowCount(data)
    const expectedCount = (counts.value?.recordCount || 0) + (counts.value?.entityCount || 0)
    if (actualCount !== expectedCount) throw new Error(`旧数据分页校验不一致：状态 ${expectedCount} 行，导出 ${actualCount} 行。请刷新后重试。`)
    backup.value = data
    const blob = new Blob([exportLegacyCipherBackup(data)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `calmy-legacy-d1-cipher-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    backupDownloaded.value = true
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '旧数据备份失败' }
  finally { loading.value = false }
}

async function migrate() {
  if (!backup.value || !legacyPassword.value || !backupDownloaded.value || !deleteConfirmed.value) return
  loading.value = true
  error.value = ''
  report.value = ''
  try {
    const result = await importLegacyD1Export(apiBaseUrl(), legacyPassword.value, backup.value)
    report.value = `迁移完成：合并 ${result.keySets} 个旧集合、应用 ${result.entities} 个实体、向新 Vault 上传并校验 ${result.accepted} 项。旧版 D1 记录已按确认清理。`
    legacyPassword.value = ''
    backup.value = null
    deleteConfirmed.value = false
    backupDownloaded.value = false
    counts.value = { recordCount: 0, entityCount: 0 }
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '迁移失败；旧版 D1 数据保留' }
  finally { loading.value = false }
}

onMounted(() => { void loadStatus() })
</script>

<template>
  <section class="beryl-card hoverable block" aria-labelledby="legacy-server-title">
    <h3 id="legacy-server-title" class="font-title sec">旧版云端数据迁移</h3>
    <p v-if="loading && !counts">正在检查旧版数据…</p>
    <p v-else-if="counts">旧 D1 数据：{{ counts.recordCount }} 条键记录、{{ counts.entityCount }} 条实体记录。只有首次管理员可以迁移。</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-if="report" role="status">{{ report }}</p>
    <template v-if="counts && (counts.recordCount || counts.entityCount) && !report.startsWith('迁移完成')">
      <p>先下载旧密文备份。迁移在浏览器本地使用旧同步密码解密，再以当前 Vault 密钥重新加密；旧密码不会发送给服务器。</p>
      <div class="migration-actions">
        <button class="app-button" type="button" :disabled="loading" @click="prepareBackup">{{ backupDownloaded ? '重新下载旧密文备份' : '导出并下载旧密文备份' }}</button>
        <label>旧版同步密码<input v-model="legacyPassword" type="password" autocomplete="current-password" /></label>
        <label class="confirm"><input v-model="deleteConfirmed" type="checkbox" /> 我已保存备份，并确认迁移后允许清理旧版 D1 全局数据</label>
        <button class="app-button primary" type="button" :disabled="loading || !backup || !backupDownloaded || !legacyPassword || !deleteConfirmed" @click="migrate">{{ loading ? '正在解密、加密并上传…' : '迁移并校验后清理旧数据' }}</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.migration-actions { display: grid; gap: 12px; margin-top: 14px; }
.migration-actions label { display: grid; gap: 6px; }
.migration-actions input:not([type="checkbox"]) { min-height: 38px; padding: 6px 10px; border: 1px solid var(--c-border, #d9ded8); border-radius: 8px; background: var(--c-surface, white); color: inherit; }
.confirm { display: flex !important; align-items: center; }
</style>
