<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { readServerSession } from '@/core/auth'
import { apiBaseUrl } from '@/core/api/base-url'
import { createUser, listUsers, resetUserPassword, setUserStatus, type UserAccount } from '@/core/api/auth'

const users = ref<UserAccount[]>([])
const username = ref('')
const displayName = ref('')
const loading = ref(false)
const error = ref('')
const temporaryCredentials = ref<{ username: string; password: string } | null>(null)
const actorId = readServerSession()?.user.id

async function refresh() {
  loading.value = true
  error.value = ''
  try { users.value = await listUsers(apiBaseUrl()) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '用户列表读取失败' }
  finally { loading.value = false }
}
async function addUser() {
  error.value = ''
  try {
    const created = await createUser(apiBaseUrl(), { username: username.value.trim(), displayName: displayName.value.trim() })
    temporaryCredentials.value = { username: created.user.username, password: created.temporaryPassword }
    username.value = ''
    displayName.value = ''
    await refresh()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '创建用户失败' }
}
async function toggle(user: UserAccount) {
  error.value = ''
  try { await setUserStatus(apiBaseUrl(), user.id, user.status === 'active' ? 'disabled' : 'active'); await refresh() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '更新用户状态失败' }
}
async function resetPassword(user: UserAccount) {
  error.value = ''
  try { temporaryCredentials.value = { username: user.username, password: await resetUserPassword(apiBaseUrl(), user.id) } }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '重置密码失败' }
}
onMounted(() => { void refresh() })
</script>

<template>
  <section v-if="readServerSession()?.user.role === 'admin'" class="beryl-card hoverable block user-management" aria-label="用户账号管理">
    <p>管理员创建和停用账号。每个账号有独立的数据空间；管理员不会因此获得其他用户 Vault 内容的读取权。</p>
    <form class="user-create" @submit.prevent="addUser">
      <label>登录名<input v-model="username" autocomplete="off" minlength="3" maxlength="64" required placeholder="例如 li.ming" /></label>
      <label>显示名称<input v-model="displayName" autocomplete="off" maxlength="100" required placeholder="例如 李明" /></label>
      <button class="app-button primary" type="submit" :disabled="loading">创建用户</button>
    </form>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <div v-if="temporaryCredentials" class="temporary-credentials" role="status">
      <b>临时登录凭据（只显示这一次）</b>
      <p>用户名：<code>{{ temporaryCredentials.username }}</code></p>
      <p>临时密码：<code>{{ temporaryCredentials.password }}</code></p>
      <p>请通过安全渠道交给该用户；首次登录必须更改密码。</p>
      <button class="app-button" type="button" @click="temporaryCredentials = null">已记录，隐藏凭据</button>
    </div>
    <div class="user-table-wrap">
      <table class="user-table">
        <thead><tr><th>用户</th><th>角色</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="user in users" :key="user.id">
            <td><b>{{ user.displayName }}</b><small>{{ user.username }}</small></td>
            <td>{{ user.role === 'admin' ? '管理员' : '用户' }}</td>
            <td>{{ user.status === 'active' ? '启用' : '停用' }}</td>
            <td>{{ new Date(user.createdAt).toLocaleDateString() }}</td>
            <td class="user-actions">
              <button class="app-button" type="button" :disabled="loading || user.id === actorId" @click="toggle(user)">{{ user.status === 'active' ? '停用' : '启用' }}</button>
              <button class="app-button" type="button" :disabled="loading || user.id === actorId || user.status !== 'active'" @click="resetPassword(user)">重置密码</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!users.length && !loading">还没有用户。</p>
    </div>
  </section>
</template>

<style scoped>
.user-create { display: flex; align-items: end; gap: 12px; flex-wrap: wrap; margin: 16px 0; }
.user-create label { display: grid; gap: 5px; min-width: 190px; flex: 1; }
.user-create input { min-height: 38px; padding: 6px 10px; border: 1px solid var(--c-border, #d9ded8); border-radius: 8px; background: var(--c-surface, white); color: inherit; }
.user-table-wrap { overflow-x: auto; }
.user-table { width: 100%; border-collapse: collapse; text-align: left; }
.user-table th, .user-table td { padding: 10px 8px; border-bottom: 1px solid var(--c-border, #d9ded8); }
.user-table td small { display: block; opacity: .68; margin-top: 3px; }
.user-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.temporary-credentials { margin: 14px 0; padding: 14px; border: 1px solid #c69737; border-radius: 10px; overflow-wrap: anywhere; }
</style>
