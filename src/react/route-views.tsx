import { useEffect, useState } from 'react'
import { Navigate, Outlet, useNavigate, useParams } from 'react-router-dom'
import { readSession, ensureAuth, verifyPassword, registerFail, resetFails, isLocked, lockRemainSec, writeSession } from '@/core/auth'
import { legacyTargetFor } from '@/domain/legacy/migration'
import { Button } from './ui'

export function ProtectedRoute() { return readSession() ? <Outlet /> : <Navigate to="/login" replace /> }

export function LegacyCaseRedirect() {
  const { id } = useParams()
  const target = id ? legacyTargetFor('case', id) : undefined
  return <Navigate to={target ? `/app/matters/${target}` : '/app/matters'} replace />
}

export function LoginPage() {
  const navigate = useNavigate(); const [user, setUser] = useState(''); const [pass, setPass] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [locked, setLocked] = useState(0)
  useEffect(() => { const timer = window.setInterval(() => setLocked(isLocked() ? lockRemainSec() : 0), 500); return () => clearInterval(timer) }, [])
  async function submit(event: React.FormEvent) { event.preventDefault(); if (isLocked()) return; if (!user.trim() || !pass) { setError('请输入用户名和密码'); return } setLoading(true); setError(''); await new Promise(resolve => setTimeout(resolve, 250)); try { const rec = await ensureAuth(); if (user.trim() === rec.u && await verifyPassword(rec, pass)) { resetFails(); writeSession(user.trim()); navigate(rec._d ? '/pass?mode=first' : '/app/today', { replace: true }) } else { setError(registerFail() ? '登录失败 5 次，已锁定 30 秒' : '用户名或密码错误') } } catch { setError('当前环境不支持安全加密，请通过 HTTPS 或本机文件访问') } finally { setLoading(false) } }
  return <div className="login-wrap"><div className="login-brand"><div className="login-logo">⬡</div><h1 className="font-title">Calmy</h1><p>现实行动系统</p></div><form className="beryl-card login-card" onSubmit={submit}><label>用户名<input aria-label="用户名" autoComplete="username" value={user} onChange={event => setUser(event.target.value)} placeholder="请输入用户名" /></label><label>密码<input aria-label="密码" type="password" autoComplete="current-password" value={pass} onChange={event => setPass(event.target.value)} placeholder="请输入密码" /></label>{error && <p className="form-error" role="alert">{error}</p>}<Button className="primary full" disabled={loading || locked > 0}>{locked ? `锁定 ${locked}s` : loading ? '登录中…' : '登 录'}</Button><p className="form-hint">本机会记住登录 30 天 · 失败 5 次锁定 30 秒</p></form></div>
}

export function PassPage() { const navigate = useNavigate(); return <div className="simple-page"><section className="beryl-card empty-state"><h1 className="font-title">设置访问密码</h1><p>首次登录流程已迁移到 React 页面。请返回 Today 继续使用。</p><Button className="primary" onClick={() => navigate('/app/today')}>进入 Today</Button></section></div> }

export function PlaceholderPage({ title = '这个模块正在迁移', description = '核心 Today、Capture、课题、复盘与设置已经由 React 接管，其余入口保留在迁移队列中。' }: { title?: string; description?: string }) { return <div className="simple-page"><section className="beryl-card empty-state"><p className="eyebrow">REACT MIGRATION</p><h1 className="font-title">{title}</h1><p>{description}</p></section></div> }
