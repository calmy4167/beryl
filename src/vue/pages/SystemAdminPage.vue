<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { apiBaseUrl } from '@/core/api/base-url'
import { readServerSession } from '@/core/auth'
import * as admin from '@/core/api/system-admin'

const route = useRoute()
const base = apiBaseUrl()
const section = computed(() => route.path.split('/').at(-1) || 'users')
const title = computed(() => ({ users: '用户管理', roles: '角色权限', security: '安全设置', 'login-logs': '登录日志', 'operation-logs': '操作日志', sessions: '在线会话' }[section.value] || '系统管理'))
const busy = ref(false); const error = ref(''); const notice = ref(''); const granted = ref<string[]>([])
const userRows = ref<admin.AdminUser[]>([]); const roleRows = ref<admin.SystemRole[]>([]); const catalog = ref<string[]>([])
const rows = ref<Record<string, unknown>[]>([]); const sessionRows = ref<Record<string, unknown>[]>([])
const newUser = reactive({ username: '', displayName: '', email: '', phone: '' })
const userFilter = reactive({ q: '', status: '' })
const profileDraft = reactive({ id: '', username: '', displayName: '', email: '', phone: '', sex: '', remark: '' })
const profileEditorOpen = ref(false)
const oneTimeCredential = ref<{ username: string; password: string } | null>(null)
const editingRole = ref<admin.SystemRole | null>(null)
const roleEditorOpen = ref(false)
const roleDraft = reactive({ name: '', description: '', permissions: [] as string[] })
const policy = ref<admin.SecuritySettings>({})
const actorId = readServerSession()?.user.id
const assignableRoles = computed(() => roleRows.value.filter(item => item.code !== 'system.super_admin' && item.code !== 'system.basic_user'))
const hasCapability = (value: string) => granted.value.includes(value)

async function load() {
  error.value = ''; notice.value = ''; busy.value = true
  try {
    switch (section.value) {
      case 'users': { const result = await admin.users(base, userFilter); userRows.value = result.users; if (granted.value.includes('system.roles.read')) { try { roleRows.value = (await admin.roles(base)).roles } catch { roleRows.value = [] } } break }
      case 'roles': { const result = await admin.roles(base); roleRows.value = result.roles; catalog.value = result.capabilities; break }
      case 'security': policy.value = (await admin.security(base)).settings; break
      case 'login-logs': rows.value = (await admin.logs(base, 'login')).logs; break
      case 'operation-logs': rows.value = (await admin.logs(base, 'operation')).logs; break
      case 'sessions': sessionRows.value = (await admin.sessions(base)).sessions; break
    }
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '读取失败' }
  finally { busy.value = false }
}
watch(section, () => { void load() })
onMounted(async () => { try { granted.value = (await admin.capabilities(base)).capabilities } catch { granted.value = [] }; await load() })

async function createAccount() {
  error.value = ''
  try {
    const result = await admin.createUser(base, { ...newUser })
    oneTimeCredential.value = { username: result.user.username, password: result.temporaryPassword }
    Object.assign(newUser, { username: '', displayName: '', email: '', phone: '' }); await load()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '创建失败' }
}
async function status(user: admin.AdminUser) { try { await admin.setUserStatus(base, user.id, user.status === 'active' ? 'disabled' : 'active'); await load() } catch (cause) { error.value = cause instanceof Error ? cause.message : '操作失败' } }
async function reset(user: admin.AdminUser) { try { const result = await admin.userAction(base, user.id, 'reset-password') as { temporaryPassword: string }; oneTimeCredential.value = { username: user.username, password: result.temporaryPassword } } catch (cause) { error.value = cause instanceof Error ? cause.message : '重置失败' } }
async function unlock(user: admin.AdminUser) { try { await admin.userAction(base, user.id, 'unlock'); notice.value = '账号登录锁定已解除'; await load() } catch (cause) { error.value = cause instanceof Error ? cause.message : '解锁失败' } }
function editUser(user: admin.AdminUser) { Object.assign(profileDraft, { id: user.id, username: user.username, displayName: user.displayName, email: user.email || '', phone: user.phone || '', sex: user.sex || '', remark: user.remark || '' }); profileEditorOpen.value = true }
async function saveUserProfile() { try { await admin.updateUser(base, profileDraft.id, { username: profileDraft.username, displayName: profileDraft.displayName, email: profileDraft.email, phone: profileDraft.phone, sex: profileDraft.sex, remark: profileDraft.remark }); profileEditorOpen.value = false; notice.value = '用户资料已保存'; await load() } catch (cause) { error.value = cause instanceof Error ? cause.message : '保存用户资料失败' } }
async function removeUser(user: admin.AdminUser) { if (!window.confirm(`确定停用并删除账号“${user.username}”吗？历史审计关联会保留。`)) return; try { await admin.deleteUser(base, user.id); await load() } catch (cause) { error.value = cause instanceof Error ? cause.message : '删除失败' } }
async function changeRoles(user: admin.AdminUser, event: Event) {
  const input = event.target as HTMLSelectElement
  const values = Array.from(input.selectedOptions, option => option.value)
  try { await admin.setUserRoles(base, user.id, values); await load() } catch (cause) { error.value = cause instanceof Error ? cause.message : '角色更新失败' }
}
function beginRole(role?: admin.SystemRole) {
  roleEditorOpen.value = Boolean(role) || !roleEditorOpen.value
  editingRole.value = role || null
  Object.assign(roleDraft, { name: role?.name || '', description: role?.description || '', permissions: [...(role?.permissions || [])] })
}
async function persistRole() {
  try { await admin.saveRole(base, { ...(editingRole.value ? { id: editingRole.value.id } : {}), ...roleDraft }); notice.value = '角色已保存'; roleEditorOpen.value = false; editingRole.value = null; Object.assign(roleDraft, { name: '', description: '', permissions: [] }); await load() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '保存失败' }
}
async function removeRole(role: admin.SystemRole) { if (!window.confirm(`删除角色“${role.name}”？`)) return; try { await admin.deleteRole(base, role.id); await load() } catch (cause) { error.value = cause instanceof Error ? cause.message : '删除失败' } }
async function savePolicy() { try { policy.value = (await admin.security(base, policy.value)).settings; notice.value = '安全策略已保存' } catch (cause) { error.value = cause instanceof Error ? cause.message : '保存失败' } }
async function revoke(session: Record<string, unknown>) { if (!window.confirm(`撤销 ${String(session.username || '')} 的此登录会话？`)) return; try { await admin.revokeSession(base, String(session.id)); await load() } catch (cause) { error.value = cause instanceof Error ? cause.message : '撤销失败' } }
async function revokeAccountSessions(session: Record<string, unknown>) { if (!window.confirm(`撤销 ${String(session.username || '')} 的全部登录会话？`)) return; try { await admin.revokeUserSessions(base, String(session.userId)); await load() } catch (cause) { error.value = cause instanceof Error ? cause.message : '撤销失败' } }
function date(value: unknown) { return value ? new Date(Number(value)).toLocaleString() : '—' }
</script>

<template>
  <section class="system-admin-page">
    <header class="page-head"><div><p class="eyebrow">系统管理</p><h1 class="font-title">{{ title }}</h1><p>管理 Calmy 登录账号与后台功能权限。系统角色不授予其他用户 Vault 数据访问权。</p></div><button class="app-button" type="button" :disabled="busy" @click="load">刷新</button></header>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p><p v-if="notice" class="system-notice" role="status">{{ notice }}</p><p v-if="busy" class="system-muted">正在读取…</p>

    <section v-if="section === 'users'" class="beryl-card system-card">
      <form class="user-filters" @submit.prevent="load"><label>搜索<input v-model="userFilter.q" placeholder="账号或显示名称" /></label><label>状态<select v-model="userFilter.status"><option value="">全部状态</option><option value="active">启用</option><option value="disabled">停用</option></select></label><button class="app-button">筛选</button></form>
      <form v-if="hasCapability('system.users.create')" class="system-form" @submit.prevent="createAccount"><label>登录名<input v-model="newUser.username" minlength="3" maxlength="64" required /></label><label>显示名称<input v-model="newUser.displayName" maxlength="80" required /></label><label>邮箱<input v-model="newUser.email" type="email" maxlength="160" /></label><label>电话<input v-model="newUser.phone" maxlength="40" /></label><button class="app-button primary" :disabled="busy">创建用户</button></form>
      <form v-if="profileEditorOpen" class="profile-editor" @submit.prevent="saveUserProfile"><h2>编辑用户资料</h2><label>登录名<input v-model="profileDraft.username" required minlength="3" maxlength="64" /></label><label>显示名称<input v-model="profileDraft.displayName" required maxlength="80" /></label><label>邮箱<input v-model="profileDraft.email" type="email" maxlength="160" /></label><label>电话<input v-model="profileDraft.phone" maxlength="40" /></label><label>性别<select v-model="profileDraft.sex"><option value="">未设置</option><option value="unknown">未知</option><option value="male">男</option><option value="female">女</option><option value="other">其他</option></select></label><label>备注<input v-model="profileDraft.remark" maxlength="500" /></label><button class="app-button primary">保存</button><button class="app-button" type="button" @click="profileEditorOpen = false">取消</button></form>
      <div v-if="oneTimeCredential" class="one-time"><b>一次性临时凭据，只展示这一次</b><p>{{ oneTimeCredential.username }} · <code>{{ oneTimeCredential.password }}</code></p><button class="app-button" type="button" @click="oneTimeCredential = null">隐藏凭据</button></div>
      <div class="table-scroll"><table><thead><tr><th>用户</th><th>系统角色</th><th>状态</th><th>最近登录</th><th>操作</th></tr></thead><tbody><tr v-for="user in userRows" :key="user.id"><td><b>{{ user.displayName }}</b><small>{{ user.username }}<span v-if="user.email"> · {{ user.email }}</span></small></td><td><select v-if="hasCapability('system.users.assign_roles')" multiple :value="user.roles.filter(id => id !== 'system.basic_user' && id !== 'system.super_admin')" aria-label="系统角色" @change="changeRoles(user, $event)"><option v-for="role in assignableRoles" :key="role.id" :value="role.id">{{ role.name }}</option></select><span v-else>{{ user.roles.join('、') }}</span></td><td>{{ user.status === 'active' ? (user.mustChangePassword ? '启用 · 待改密' : '启用') : '停用' }}</td><td>{{ date(user.lastLoginAt) }}</td><td class="actions"><button v-if="hasCapability('system.users.update')" class="app-button" @click="editUser(user)">资料</button><button v-if="hasCapability(user.status === 'active' ? 'system.users.disable' : 'system.users.update')" class="app-button" :disabled="user.id === actorId" @click="status(user)">{{ user.status === 'active' ? '停用' : '启用' }}</button><button v-if="hasCapability('system.users.reset_password')" class="app-button" :disabled="user.status !== 'active'" @click="reset(user)">重置密码</button><button v-if="hasCapability('system.users.unlock')" class="app-button" @click="unlock(user)">解锁</button><button v-if="hasCapability('system.users.delete')" class="app-button danger" :disabled="user.id === actorId" @click="removeUser(user)">删除</button></td></tr></tbody></table><p v-if="!userRows.length && !busy" class="system-muted">暂无用户</p></div>
    </section>

    <section v-else-if="section === 'roles'" class="system-grid"><div class="beryl-card system-card"><div class="section-title"><h2>系统角色</h2><button v-if="hasCapability('system.roles.manage')" class="app-button primary" @click="beginRole()">新建角色</button></div><div v-for="role in roleRows" :key="role.id" class="role-row"><div><b>{{ role.name }}</b><small>{{ role.description }}<span v-if="role.builtIn"> · 内置角色</span></small></div><div v-if="hasCapability('system.roles.manage')"><button class="app-button" :disabled="role.code === 'system.super_admin'" @click="beginRole(role)">配置</button><button v-if="!role.builtIn" class="app-button danger" @click="removeRole(role)">删除</button></div></div></div><form v-if="hasCapability('system.roles.manage') && roleEditorOpen" class="beryl-card system-card" @submit.prevent="persistRole"><h2>{{ editingRole ? '编辑角色' : '新建角色' }}</h2><label>名称<input v-model="roleDraft.name" maxlength="80" required /></label><label>说明<input v-model="roleDraft.description" maxlength="240" /></label><fieldset><legend>功能权限</legend><label v-for="capability in catalog" :key="capability" class="check"><input v-model="roleDraft.permissions" type="checkbox" :value="capability" />{{ capability }}</label></fieldset><button class="app-button primary">保存角色</button><button class="app-button" type="button" @click="roleEditorOpen = false; editingRole = null">取消</button></form></section>

    <section v-else-if="section === 'security'" class="beryl-card system-card security-form"><h2>密码策略</h2><div class="system-form"><label>最短长度<input v-model.number="policy['security.password.minLength']" type="number" min="6" max="256" /></label><label>最长长度<input v-model.number="policy['security.password.maxLength']" type="number" min="6" max="256" /></label><label>失败次数<input v-model.number="policy['security.login.maxFailures']" type="number" min="1" max="100" /></label><label>失败统计窗口（秒）<input v-model.number="policy['security.login.windowSeconds']" type="number" min="10" max="3600" /></label><label>锁定时长（秒）<input v-model.number="policy['security.login.lockSeconds']" type="number" min="10" max="86400" /></label><label>密码有效期（天，0 为不过期）<input v-model.number="policy['security.password.expiryDays']" type="number" min="0" max="3650" /></label></div><label class="check"><input v-model="policy['security.password.requireUppercase']" type="checkbox" />要求大写字母</label><label class="check"><input v-model="policy['security.password.requireLowercase']" type="checkbox" />要求小写字母</label><label class="check"><input v-model="policy['security.password.requireNumber']" type="checkbox" />要求数字</label><label class="check"><input v-model="policy['security.password.requireSymbol']" type="checkbox" />要求符号</label><label class="check"><input v-model="policy['security.login.captchaEnabled']" type="checkbox" />启用登录算术验证码</label><p class="system-muted">默认允许 6 位密码（例如 123456），不强制复杂度；服务端仍会按此处策略验证。</p><button class="app-button primary" @click="savePolicy">保存安全设置</button></section>

    <section v-else-if="section === 'login-logs' || section === 'operation-logs'" class="beryl-card system-card table-scroll"><table><thead><tr><th>时间</th><th v-if="section === 'login-logs'">账号</th><th v-if="section === 'login-logs'">结果</th><th v-if="section === 'login-logs'">IP / 设备</th><th v-if="section === 'operation-logs'">操作</th><th v-if="section === 'operation-logs'">对象</th><th v-if="section === 'operation-logs'">变更字段</th></tr></thead><tbody><tr v-for="row in rows" :key="String(row.id)"><td>{{ date(row.createdAt) }}</td><td v-if="section === 'login-logs'">{{ row.username }}</td><td v-if="section === 'login-logs'">{{ row.outcome }}<small>{{ row.failureCode }}</small></td><td v-if="section === 'login-logs'">{{ row.ipAddress }}<small>{{ row.deviceId }}</small></td><td v-if="section === 'operation-logs'">{{ row.action }}</td><td v-if="section === 'operation-logs'">{{ row.targetType }} · {{ row.targetId }}</td><td v-if="section === 'operation-logs'"><code>{{ row.changes }}</code></td></tr></tbody></table><p v-if="!rows.length" class="system-muted">暂无记录</p></section>

    <section v-else-if="section === 'sessions'" class="beryl-card system-card table-scroll"><table><thead><tr><th>账号</th><th>设备</th><th>IP</th><th>最近活动</th><th>过期时间</th><th></th></tr></thead><tbody><tr v-for="session in sessionRows" :key="String(session.id)"><td>{{ session.displayName }}<small>{{ session.username }}</small></td><td>{{ session.deviceId }}<small>{{ session.userAgent }}</small></td><td>{{ session.ipAddress }}</td><td>{{ date(session.lastSeenAt) }}</td><td>{{ date(session.expiresAt) }}</td><td><button v-if="hasCapability('system.sessions.revoke')" class="app-button" @click="revokeAccountSessions(session)">撤销账号全部</button><button v-if="hasCapability('system.sessions.revoke')" class="app-button danger" @click="revoke(session)">撤销此会话</button></td></tr></tbody></table><p v-if="!sessionRows.length" class="system-muted">没有有效会话</p></section>
  </section>
</template>

<style scoped>
.system-admin-page{max-width:1180px;margin:0 auto;padding-bottom:48px}.page-head{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:20px}.system-card{padding:20px;margin-bottom:16px}.system-form,.user-filters{display:flex;align-items:end;gap:12px;flex-wrap:wrap;margin-bottom:18px}.profile-editor{display:flex;align-items:end;gap:12px;flex-wrap:wrap;padding:14px;margin:14px 0;border:1px solid var(--c-border,#d9ded8);border-radius:10px}.profile-editor h2{width:100%}.profile-editor label,.user-filters label{display:grid;gap:5px;min-width:150px;flex:1}.system-form label,.security-form>label:not(.check){display:grid;gap:5px;min-width:150px;flex:1}.system-form input,.profile-editor input,.profile-editor select,.user-filters input,.user-filters select,.security-form input:not([type=checkbox]),.system-card select{min-height:38px;padding:6px 9px;border:1px solid var(--c-border,#d9ded8);border-radius:8px;background:var(--c-surface,#fff);color:inherit}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;text-align:left}th,td{padding:10px 8px;border-bottom:1px solid var(--c-border,#d9ded8);vertical-align:top}td small,.role-row small{display:block;opacity:.68;margin-top:3px;max-width:320px;overflow-wrap:anywhere}.actions{display:flex;gap:5px;flex-wrap:wrap}.one-time{padding:14px;margin:12px 0;border:1px solid #c69737;border-radius:10px;overflow-wrap:anywhere}.system-notice{color:#28744a}.system-muted{opacity:.7}.system-grid{display:grid;grid-template-columns:minmax(280px,1fr) minmax(300px,1fr);gap:16px}.section-title,.role-row{display:flex;justify-content:space-between;align-items:center;gap:12px}.role-row{padding:12px 0;border-bottom:1px solid var(--c-border,#d9ded8)}.role-row button{margin-left:5px}.system-card fieldset{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:7px;margin:14px 0}.check{display:flex;align-items:center;gap:8px;margin:7px 0}.security-form h2{margin-top:0}.danger{color:#a43d37}@media(max-width:760px){.system-grid{grid-template-columns:1fr}.page-head{align-items:flex-start}.system-form label{min-width:100%}}
</style>
