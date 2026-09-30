<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { claimLegacyLocalData, previewLegacyLocalData, type LegacyLocalPreview } from '@/core/legacy-local-migration'
import { readServerSession } from '@/core/auth'
import { encryptEntityContent, loadUserKey } from '@/core/vault-keys'

const preview = ref<LegacyLocalPreview | null>(null)
const loading = ref(true)
const backupDownloaded = ref(false)
const ownershipConfirmed = ref(false)
const report = ref('')
const error = ref('')

async function refresh() {
  loading.value = true
  error.value = ''
  try { preview.value = await previewLegacyLocalData() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '旧数据扫描失败' }
  finally { loading.value = false }
}
async function downloadBackup() {
  if (!preview.value) return
  loading.value = true
  error.value = ''
  try {
    const session = readServerSession()
    if (!session) throw new Error('请先登录后再导出迁移备份')
    const userKey = await loadUserKey(session.user.id)
    const payload = await encryptEntityContent(userKey, preview.value.values)
    const blob = new Blob([JSON.stringify({ format: 'calmy-legacy-local-encrypted-backup-v1', exportedAt: new Date().toISOString(), encryption: 'AES-GCM with the current Calmy User Key', payload }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `calmy-legacy-local-encrypted-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    backupDownloaded.value = true
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '加密备份失败，旧数据没有更改' }
  finally { loading.value = false }
}
async function importLegacy() {
  if (!preview.value || !backupDownloaded.value || !ownershipConfirmed.value) return
  loading.value = true
  error.value = ''
  try {
    const count = await claimLegacyLocalData(preview.value)
    report.value = `已将旧数据合并到当前管理员账号，共更新 ${count} 个数据集合。旧数据副本仍保留在原浏览器存储中。`
    preview.value = await previewLegacyLocalData()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '迁移失败，原数据仍保留' }
  finally { loading.value = false }
}
onMounted(() => { void refresh() })
</script>

<template>
  <section class="beryl-card hoverable block" aria-labelledby="legacy-local-title">
    <h3 id="legacy-local-title" class="font-title sec">旧设备本地数据</h3>
    <p v-if="loading">正在检查未归属的旧版浏览器数据…</p>
    <p v-else-if="error" class="form-error" role="alert">{{ error }}</p>
    <template v-else-if="preview">
      <p v-if="preview.count">找到 {{ preview.count }} 个旧数据集合，约 {{ (preview.bytes / 1024).toFixed(1) }} KB。数据内容不会显示在此页面。</p>
      <p v-else>没有发现可迁移的旧版浏览器数据。</p>
      <p v-if="preview.alreadyClaimed" class="mods-line">此浏览器的旧数据已经认领，或当前账号不是管理员。</p>
      <template v-else-if="preview.count">
        <p>导入前会先下载一份使用当前 Calmy Vault 密钥加密的备份。请同时保管恢复包；没有对应恢复密钥的备份无法读取。只有你确认这些数据属于当前管理员账号后，才会与当前账号数据合并；同 ID 冲突时保留当前账号版本。</p>
        <div class="migration-actions">
          <button class="app-button" type="button" @click="downloadBackup">下载迁移前备份</button>
          <label><input v-model="ownershipConfirmed" type="checkbox" /> 我确认这些旧数据属于当前账号</label>
          <button class="app-button primary" type="button" :disabled="loading || !backupDownloaded || !ownershipConfirmed" @click="importLegacy">合并到当前账号</button>
        </div>
      </template>
    </template>
    <p v-if="report" role="status">{{ report }}</p>
  </section>
</template>

<style scoped>
.migration-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
.migration-actions label { display: flex; align-items: center; gap: 7px; }
</style>
