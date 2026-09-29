<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ensureAuth, isLocked, lockRemainSec, registerFail, resetFails, verifyPassword, writeSession } from '@/core/auth'

const router = useRouter()
const user = ref('')
const pass = ref('')
const error = ref('')
const loading = ref(false)
const locked = ref(0)
let lockTimer: number | undefined

onMounted(() => {
  lockTimer = window.setInterval(() => { locked.value = isLocked() ? lockRemainSec() : 0 }, 500)
})
onUnmounted(() => { if (lockTimer) window.clearInterval(lockTimer) })

async function submit() {
  if (isLocked()) return
  const username = user.value.trim()
  if (!username || !pass.value) {
    error.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  error.value = ''
  await new Promise(resolve => setTimeout(resolve, 250))
  try {
    const record = await ensureAuth()
    if (username === record.u && await verifyPassword(record, pass.value)) {
      resetFails()
      writeSession(username)
      await router.replace(record._d ? '/pass?mode=first' : '/app/today')
    } else {
      error.value = registerFail() ? '登录失败 5 次，已锁定 30 秒' : '用户名或密码错误'
    }
  } catch {
    error.value = '当前环境不支持安全加密，请通过 HTTPS 或本机文件访问'
  } finally {
    loading.value = false
  }
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
      <label>用户名<input v-model="user" aria-label="用户名" autocomplete="username" placeholder="请输入用户名" /></label>
      <label>密码<input v-model="pass" aria-label="密码" type="password" autocomplete="current-password" placeholder="请输入密码" /></label>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="app-button primary full" type="submit" :disabled="loading || locked > 0">{{ locked ? `锁定 ${locked}s` : loading ? '登录中…' : '登 录' }}</button>
      <p class="form-hint">本机会记住登录 30 天 · 失败 5 次锁定 30 秒</p>
    </form>
  </div>
</template>
