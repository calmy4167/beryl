<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ensureAuth, verifyPassword, registerFail, resetFails, isLocked, lockRemainSec, writeSession } from '@/core/auth'

const router = useRouter()
const user = ref('')
const pass = ref('')
const err = ref('')
const loading = ref(false)
const lockLeft = ref(0)
let lockTimer: number | undefined

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function startLockTick() {
  clearInterval(lockTimer)
  lockTimer = window.setInterval(() => {
    lockLeft.value = isLocked() ? lockRemainSec() : 0
    if (lockLeft.value <= 0) { clearInterval(lockTimer); lockTimer = undefined }
  }, 500)
  tickLock()
}
function tickLock() {
  lockLeft.value = isLocked() ? lockRemainSec() : 0
  if (lockLeft.value <= 0 && lockTimer) { clearInterval(lockTimer); lockTimer = undefined }
}

async function submit() {
  if (isLocked()) { tickLock(); return }
  const u = user.value.trim()
  const p = pass.value
  if (!u || !p) { ElMessage.warning('请输入用户名和密码'); return }
  loading.value = true
  err.value = ''
  await sleep(350) // 最小校验延迟，减缓暴力破解
  try {
    const rec = await ensureAuth()
    const ok = u === rec.u && await verifyPassword(rec, p)
    if (ok) {
      resetFails()
      writeSession(u)
      if (rec._d) router.replace({ path: '/pass', query: { mode: 'first', u } })
      else router.replace('/scene')
    } else {
      if (registerFail()) { startLockTick(); ElMessage.warning('登录失败 5 次，锁定 30 秒'); }
      else err.value = '用户名或密码错误'
    }
  } catch {
    ElMessage.error('当前环境不支持安全加密，请通过 HTTPS 或本机文件访问')
  }
  loading.value = false
}

onUnmounted(() => clearInterval(lockTimer))
</script>

<template>
  <div class="login-wrap">
    <div class="text-center mb-8">
      <div class="logo">⬡</div>
      <h1 class="font-title title">Beryl</h1>
      <p class="subtitle">个 人 管 理 体 系</p>
    </div>

    <form class="beryl-card card" @submit.prevent="submit">
      <el-form label-position="top">
        <el-form-item label="用户名">
          <el-input v-model="user" placeholder="请输入用户名" autocomplete="username" size="large" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="pass" type="password" placeholder="请输入密码" autocomplete="current-password" size="large" show-password />
        </el-form-item>
      </el-form>

      <p v-if="err" class="err">{{ err }}</p>

      <el-button type="primary" size="large" class="w-full" native-type="submit" :loading="loading" :disabled="lockLeft > 0">
        {{ lockLeft > 0 ? `锁定 ${lockLeft}s` : '登 录' }}
      </el-button>
      <p class="hint">本机会记住登录 30 天 · 失败 5 次锁定 30 秒</p>
    </form>
  </div>
</template>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
}
.logo { font-size: 48px; color: var(--scene); }
.title { font-size: 2rem; font-weight: 700; letter-spacing: 0.3em; margin: 12px 0 4px; }
.subtitle { font-size: 12px; color: #71717a; letter-spacing: 0.3em; }
.card { width: 100%; max-width: 384px; padding: 24px; }
.err { color: #f87171; font-size: 12px; margin: 0 0 12px; }
.hint { text-align: center; font-size: 10px; color: #52525b; margin-top: 12px; }
</style>
