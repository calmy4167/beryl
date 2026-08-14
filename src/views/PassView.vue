<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { createAuthRecord, ensureAuth, verifyPassword, writeSession } from '@/core/auth'
import { lsSet } from '@/core/storage'

const route = useRoute()
const router = useRouter()
const mode = ref<string>((route.query.mode as string) || 'first')
const cur = ref('')
const user = ref((route.query.u as string) || '')
const np = ref('')
const cp = ref('')
const err = ref('')
const loading = ref(false)

onMounted(async () => {
  if (mode.value === 'change') {
    const rec = await ensureAuth()
    user.value = rec.u
  }
})

async function submit() {
  const u = user.value.trim()
  if (!u || np.value.length < 6 || np.value !== cp.value) {
    err.value = '用户名不能为空；新密码至少 6 位；两次输入需一致'
    return
  }
  loading.value = true
  err.value = ''
  if (mode.value === 'change') {
    const rec = await ensureAuth()
    if (!(await verifyPassword(rec, cur.value))) {
      err.value = '当前密码不正确'
      loading.value = false
      return
    }
  }
  try {
    const rec = await createAuthRecord(u, np.value, false)
    lsSet('b_auth', JSON.stringify(rec))
    writeSession(u)
    ElMessage.success('密码已更新，请牢记 🔒')
    if (mode.value === 'first') router.replace('/scene')
    else router.replace('/app/admin')
  } catch {
    ElMessage.error('当前环境不支持安全加密，请通过 HTTPS 或本机文件访问')
  }
  loading.value = false
}
</script>

<template>
  <div class="pass-wrap">
    <div class="text-center mb-8">
      <div class="logo">⬡</div>
      <h1 class="font-title title">{{ mode === 'first' ? '设置你的专属密码' : '修改密码' }}</h1>
      <p class="subtitle">{{ mode === 'first' ? '默认密码仅限首次登录，请立即更换' : '修改后将使用新密码登录' }}</p>
    </div>

    <form class="beryl-card card" @submit.prevent="submit">
      <el-form label-position="top">
        <el-form-item v-if="mode === 'change'" label="当前密码">
          <el-input v-model="cur" type="password" placeholder="当前密码" autocomplete="current-password" show-password />
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="user" placeholder="用户名" autocomplete="username" />
        </el-form-item>
        <el-form-item label="新密码（至少 6 位）">
          <el-input v-model="np" type="password" placeholder="新密码" autocomplete="new-password" show-password />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input v-model="cp" type="password" placeholder="确认新密码" autocomplete="new-password" show-password />
        </el-form-item>
      </el-form>

      <p v-if="err" class="err">{{ err }}</p>

      <el-button type="primary" size="large" class="w-full" native-type="submit" :loading="loading">保存并继续</el-button>
      <el-button v-if="mode === 'change'" class="w-full mt-2" @click="router.push('/app/admin')">返回</el-button>
    </form>
  </div>
</template>

<style scoped>
.pass-wrap {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
}
.logo { font-size: 40px; color: var(--scene); }
.title { font-size: 1.5rem; font-weight: 700; margin: 12px 0 4px; }
.subtitle { font-size: 12px; color: #71717a; }
.card { width: 100%; max-width: 384px; padding: 24px; }
.err { color: #f87171; font-size: 12px; margin: 0 0 12px; }
</style>
