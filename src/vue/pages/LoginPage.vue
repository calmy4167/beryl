<script setup lang="ts">
import { ref } from 'vue'
import { apiBaseUrl, saveApiBaseUrl } from '@/core/api/base-url'
import { login } from '@/core/api/auth'
import { writeServerSession } from '@/core/auth'

const apiUrl = ref(apiBaseUrl())
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  if (!username.value.trim() || !password.value) { error.value = '请输入用户名和密码'; return }
  loading.value = true
  try {
    const baseUrl = saveApiBaseUrl(apiUrl.value)
    const session = await login(baseUrl, username.value.trim(), password.value)
    writeServerSession(session)
    if (session.mustChangePassword) {
      window.location.hash = '#/pass?mode=first'
      window.location.reload()
      return
    }
    window.location.hash = '#/vault'
    window.location.reload()
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : ''
    error.value = message.includes('invalid-credentials') || message.includes('rate-limited')
      ? '用户名或密码错误，请稍后再试。'
      : message || '登录失败，请检查服务地址和网络后重试。'
  } finally { loading.value = false }
}
</script>

<template>
  <div class="login-wrap">
    <div class="login-brand">
      <div class="login-logo">⬡</div>
      <h1 class="font-title">Calmy</h1>
      <p>现实行动系统</p>
    </div>
    <form class="beryl-card login-card" @submit.prevent="submit">
      <label>服务地址<input v-model="apiUrl" aria-label="服务地址" autocomplete="url" placeholder="https://你的-calmy-worker.workers.dev" required /></label>
      <label>用户名<input v-model="username" aria-label="用户名" autocomplete="username" placeholder="请输入管理员创建的用户名" /></label>
      <label>密码<input v-model="password" aria-label="密码" type="password" autocomplete="current-password" placeholder="请输入密码" /></label>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="app-button primary full" type="submit" :disabled="loading">{{ loading ? '登录中…' : '登 录' }}</button>
      <p class="form-hint">账号由 Calmy 管理员创建。登录后，业务数据按账号隔离保存在本设备。</p>
    </form>
  </div>
</template>
