<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { apiBaseUrl } from '@/core/api/base-url'
import { apiFetch } from '@/core/api/client'
import { createLegacyCipherBackup, importLegacyD1Export, inspectLegacyD1References, type LegacyReferencePreview } from '@/core/legacy-server-migration'
import { readDbMeta } from '@/core/db'
import { readServerSession } from '@/core/auth'
import { loadUserKey } from '@/core/vault-keys'

const counts = ref<{ recordCount: number; entityCount: number } | null>(null)
const legacyPassword = ref('')
const backupDownloaded = ref(false)
const deleteConfirmed = ref(false)
const loading = ref(false)
const error = ref('')
const report = ref('')
const referencePreview = ref<LegacyReferencePreview | null>(null)

async function loadStatus() {
  loading.value = true
  error.value = ''
  try {
    const response = await apiFetch(apiBaseUrl(), '/api/admin/legacy/status')
    const body = await response.json().catch(() => ({})) as { recordCount?: number; entityCount?: number; error?: string }
    if (!response.ok) throw new Error(body.error || `legacy-status:${response.status}`)
    counts.value = { recordCount: Number(body.recordCount || 0), entityCount: Number(body.entityCount || 0) }
    referencePreview.value = null
    if (!counts.value.recordCount && !counts.value.entityCount) report.value = '旧版 D1 中没有待迁移记录。'
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '无法读取旧版 D1 状态' }
  finally { loading.value = false }
}

async function inspectReferences() {
  if (!counts.value || !legacyPassword.value) return
  loading.value = true
  error.value = ''
  referencePreview.value = null
  deleteConfirmed.value = false
  try { referencePreview.value = await inspectLegacyD1References(apiBaseUrl(), legacyPassword.value, counts.value) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '无法安全检查旧数据引用' }
  finally { loading.value = false }
}

async function prepareBackup() {
  loading.value = true
  error.value = ''
  try {
    const session = readServerSession()
    if (!session) throw new Error('请先登录后再下载迁移备份。')
    const userKey = await loadUserKey(session.user.id)
    const blob = await createLegacyCipherBackup(apiBaseUrl(), {
      recordCount: counts.value?.recordCount || 0,
      entityCount: counts.value?.entityCount || 0
    }, userKey)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `calmy-legacy-d1-encrypted-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    backupDownloaded.value = true
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '旧数据备份失败' }
  finally { loading.value = false }
}

async function migrate() {
  if (!counts.value || !legacyPassword.value || !backupDownloaded.value || !deleteConfirmed.value || !referencePreview.value || referencePreview.value.unknownKeys.length) return
  loading.value = true
  error.value = ''
  report.value = ''
  try {
    const result = await importLegacyD1Export(apiBaseUrl(), legacyPassword.value, counts.value, progress => {
      report.value = `正在分批迁移并确认密文：${progress.processed}/${progress.total} 条`
    })
    report.value = `迁移完成：合并 ${result.keySets} 个旧集合、应用 ${result.entities} 个实体、向新 Vault 上传并校验 ${result.accepted} 项。旧版 D1 记录已按确认清理。`
    legacyPassword.value = ''
    deleteConfirmed.value = false
    backupDownloaded.value = false
    referencePreview.value = null
    counts.value = { recordCount: 0, entityCount: 0 }
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '迁移失败；旧版 D1 数据保留' }
  finally { loading.value = false }
}

onMounted(() => {
  void (async () => {
    await loadStatus()
    const migration = await readDbMeta<{ status?: string; processedRecords?: number; processedEntities?: number; recordCount?: number; entityCount?: number }>('vault:legacy-d1-migration')
    if (migration?.status === 'running') {
      const processed = Number(migration.processedRecords || 0) + Number(migration.processedEntities || 0)
      const total = Number(migration.recordCount || 0) + Number(migration.entityCount || 0)
      report.value = `检测到未完成的迁移进度：${processed}/${total} 条；重新下载备份后可以继续。`
    }
  })()
})
</script>

<template>
  <section class="beryl-card hoverable block" aria-labelledby="legacy-server-title">
    <h3 id="legacy-server-title" class="font-title sec">旧版云端数据迁移</h3>
    <p v-if="loading && !counts">正在检查旧版数据…</p>
    <p v-else-if="counts">旧 D1 数据：{{ counts.recordCount }} 条键记录、{{ counts.entityCount }} 条实体记录。只有首次管理员可以迁移。</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-if="report" role="status">{{ report }}</p>
    <template v-if="counts && (counts.recordCount || counts.entityCount) && !report.startsWith('迁移完成')">
      <p>先下载迁移前加密备份。行键、实体 ID 和旧密文会逐条用当前 Vault User Key 加密；请保管好恢复包，失去恢复密钥后该备份也无法读取。备份注明 30 天回滚期限，建议完成核对后按期删除；服务器不会保留副本。迁移时旧同步密码只在浏览器本地使用，不会发送给服务器。</p>
      <div class="migration-actions">
        <button class="app-button" type="button" :disabled="loading" @click="prepareBackup">{{ backupDownloaded ? '重新下载加密备份' : '导出并下载加密备份' }}</button>
        <label>旧版同步密码<input v-model="legacyPassword" type="password" autocomplete="current-password" /></label>
        <button class="app-button" type="button" :disabled="loading || !legacyPassword" @click="inspectReferences">检查旧数据引用</button>
        <div v-if="referencePreview" class="legacy-reference-preview" role="status">
          <p>本机解密预览：共享空间成员引用 {{ referencePreview.sharedSpaceMemberRefs }} 条（身份含义未验证）；Space 人物成员引用 {{ referencePreview.spacePersonRefs }} 条；场景参与者引用 {{ referencePreview.sceneParticipantRefs }} 条；Person 账号关联 {{ referencePreview.personLinkedUserRefs }} 条；Permission 主体引用 {{ referencePreview.permissionPrincipalRefs }} 条；归属/管理者 User 引用 {{ referencePreview.ownershipUserRefs }} 条。</p>
          <p>旧 ID 暂按原业务内容加密保留，不会自动匹配新 User、创建绑定或生成访问授权。</p>
          <p v-if="referencePreview.unknownKeys.length" class="form-error">发现暂不支持安全迁移的数据键：{{ referencePreview.unknownKeys.join('、') }}。请先为这些键定义迁移规则；当前不能清理旧数据。</p>
        </div>
        <label class="confirm"><input v-model="deleteConfirmed" type="checkbox" /> 我已保存备份和引用预览，并确认迁移后允许清理旧版 D1 全局数据</label>
        <button class="app-button primary" type="button" :disabled="loading || !backupDownloaded || !legacyPassword || !referencePreview || referencePreview.unknownKeys.length > 0 || !deleteConfirmed" @click="migrate">{{ loading ? '正在分批解密、加密并上传…' : '迁移并校验后清理旧数据' }}</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.migration-actions { display: grid; gap: 12px; margin-top: 14px; }
.legacy-reference-preview { padding: 12px; border: 1px solid var(--c-border, #d9ded8); border-radius: 8px; }
.legacy-reference-preview p { margin: 0 0 8px; }
.legacy-reference-preview p:last-child { margin-bottom: 0; }
.migration-actions label { display: grid; gap: 6px; }
.migration-actions input:not([type="checkbox"]) { min-height: 38px; padding: 6px 10px; border: 1px solid var(--c-border, #d9ded8); border-radius: 8px; background: var(--c-surface, white); color: inherit; }
.confirm { display: flex !important; align-items: center; }
</style>
