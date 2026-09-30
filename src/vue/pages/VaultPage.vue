<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { readServerSession } from '@/core/auth'
import { apiBaseUrl } from '@/core/api/base-url'
import { confirmRecoveryKeySaved, recoverVault, recoveryPackage, setupVault } from '@/core/vault-keys'

const router = useRouter()
const session = readServerSession()
const loading = ref(true)
const recoveryKey = ref('')
const recoveryInput = ref('')
const recoveryNeeded = ref(false)
const saved = ref(false)
const error = ref('')

onMounted(async () => {
  if (!session) { await router.replace('/login'); return }
  try {
    const result = await setupVault(apiBaseUrl(), session.user.id)
    if (result.alreadyUnlocked) { await router.replace('/app/today'); return }
    if (result.recoveryNeeded) recoveryNeeded.value = true
    if (result.recoveryKey) recoveryKey.value = result.recoveryKey
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Vault 初始化失败' }
  finally { loading.value = false }
})

async function unlock() {
  if (!session) return
  loading.value = true
  error.value = ''
  try {
    await recoverVault(apiBaseUrl(), session.user.id, recoveryInput.value)
    window.location.hash = '#/app/today'
    window.location.reload()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Vault 恢复失败' }
  finally { loading.value = false }
}

function downloadRecoveryPackage() {
  const blob = new Blob([recoveryPackage(recoveryKey.value)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `calmy-recovery-${session?.user.username || 'account'}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

async function finishSetup() {
  if (!saved.value) return
  if (session && recoveryKey.value) {
    loading.value = true
    try { await confirmRecoveryKeySaved(session.user.id) }
    catch (cause) { error.value = cause instanceof Error ? cause.message : '无法确认恢复密钥状态'; loading.value = false; return }
  }
  window.location.hash = '#/app/today'
  window.location.reload()
}
</script>

<template>
  <div class="login-wrap">
    <div class="login-brand"><div class="login-logo">⬡</div><h1 class="font-title">Calmy Vault</h1><p>你的内容密钥只由你的设备和恢复密钥掌握</p></div>
    <section class="beryl-card login-card">
      <p v-if="loading">正在检查本设备的 Vault…</p>
      <template v-else-if="recoveryKey">
        <h2>保存恢复密钥</h2>
        <p>Calmy 服务器无法替你找回这把密钥。请下载恢复包或抄写密钥，并存放在安全位置。离开此页后，密钥不会再次显示。</p>
        <textarea class="recovery-key" aria-label="Vault 恢复密钥" readonly :value="recoveryKey" rows="3" />
        <button class="app-button full" type="button" @click="downloadRecoveryPackage">下载恢复包</button>
        <label class="recovery-confirm"><input v-model="saved" type="checkbox" /> 我已将恢复密钥保存在 Calmy 之外</label>
        <button class="app-button primary full" type="button" :disabled="!saved" @click="finishSetup">继续使用 Calmy</button>
      </template>
      <template v-else-if="recoveryNeeded">
        <h2>在此设备恢复 Vault</h2>
        <p>此设备没有本账号的本地解锁密钥。输入此前保存的 32 字节恢复密钥；恢复密钥不会发送到服务器。</p>
        <label>恢复密钥<input v-model="recoveryInput" aria-label="恢复密钥" autocomplete="off" spellcheck="false" /></label>
        <button class="app-button primary full" type="button" :disabled="loading || !recoveryInput" @click="unlock">{{ loading ? '正在恢复…' : '恢复并解锁' }}</button>
      </template>
      <template v-else-if="error">
        <h2>Vault 暂时无法打开</h2><p class="form-error" role="alert">{{ error }}</p>
        <button class="app-button" type="button" @click="router.replace('/login')">返回登录</button>
      </template>
    </section>
  </div>
</template>

<style scoped>
.recovery-key { width: 100%; box-sizing: border-box; resize: vertical; padding: 12px; border-radius: 10px; user-select: all; overflow-wrap: anywhere; }
.recovery-confirm { display: flex; align-items: center; gap: 8px; margin: 16px 0; }
</style>
