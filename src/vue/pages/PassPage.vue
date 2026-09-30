<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { changeLoginPassword } from '@/core/api/auth'
import { apiBaseUrl } from '@/core/api/base-url'
import { readServerSession } from '@/core/auth'

const route = useRoute()
const session = readServerSession()
const firstLogin = computed(() => route.query.mode === 'first' || session?.mustChangePassword === true)
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const error = ref('')
const done = ref(false)
const loading = ref(false)

async function submit() {
  error.value = ''
  if (newPassword.value.length < 12) { error.value = '新密码至少需要 12 个字符'; return }
  if (newPassword.value !== confirmPassword.value) { error.value = '两次输入的新密码不一致'; return }
  loading.value = true
  try {
    await changeLoginPassword(apiBaseUrl(), currentPassword.value, newPassword.value)
    done.value = true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '修改密码失败，请重试。'
  } finally { loading.value = false }
}
function continueToVault() {
  window.location.hash = '#/vault'
  window.location.reload()
}
</script>

<template>
  <div class="login-wrap">
    <div class="login-brand"><div class="login-logo">⬡</div><h1 class="font-title">{{ firstLogin ? '设置新密码' : '修改密码' }}</h1><p>你的登录密码只用于身份验证</p></div>
    <form v-if="!done" class="beryl-card login-card" @submit.prevent="submit">
      <label>当前密码<input v-model="currentPassword" type="password" autocomplete="current-password" required /></label>
      <label>新密码<input v-model="newPassword" type="password" autocomplete="new-password" minlength="12" required /></label>
      <label>再次输入新密码<input v-model="confirmPassword" type="password" autocomplete="new-password" minlength="12" required /></label>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="app-button primary full" type="submit" :disabled="loading">{{ loading ? '保存中…' : '保存新密码' }}</button>
      <p class="form-hint">登录密码与 Vault 数据密钥相互独立。请勿把登录密码当作恢复密钥。</p>
    </form>
    <section v-else class="beryl-card login-card">
      <h2>密码已更新</h2>
      <p>现在可以进入 Calmy。</p>
      <button class="app-button primary full" type="button" @click="continueToVault">继续</button>
    </section>
  </div>
</template>
