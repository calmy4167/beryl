import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appPageRegistry, appRouteDefinitions } from '../router/route-manifest'

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

describe('Vue migration entry and route registry', () => {
  it('uses Vue in production and removes the retired React runtime', () => {
    const html = source('index.html')
    const packageJson = JSON.parse(source('package.json')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    const vite = source('vite.config.ts')

    expect(html).toContain('<script type="module" src="/src/main.ts"></script>')
    expect(html).not.toContain('/src/react/main.tsx')
    expect(existsSync(resolve(process.cwd(), 'react-preview.html'))).toBe(false)
    expect(existsSync(resolve(process.cwd(), 'vue-preview.html'))).toBe(true)
    expect(source('vue-preview.html')).toContain('/src/main.ts')
    expect(existsSync(resolve(process.cwd(), 'src/react'))).toBe(false)
    expect(Object.keys(packageJson.dependencies)).not.toEqual(expect.arrayContaining(['react', 'react-dom', 'react-router-dom']))
    expect(Object.keys(packageJson.devDependencies)).not.toEqual(expect.arrayContaining([
      'react', 'react-dom', 'react-router-dom', '@types/react', '@types/react-dom',
    ]))
    expect(vite).not.toContain('@vitejs/plugin-react')
  })

  it('keeps every registered page unique and connected to a Vue route definition', () => {
    const ids = appPageRegistry.map(page => page.id)
    expect(new Set(ids).size).toBe(ids.length)

    for (const page of appPageRegistry.filter(page => page.shell === 'app')) {
      expect(appRouteDefinitions).toContainEqual(expect.objectContaining({ kind: 'view', viewKey: page.viewKey }))
    }
  })

  it('keeps legacy Case, Task, and inbox paths as compatibility routes', () => {
    expect(appRouteDefinitions).toContainEqual({ kind: 'redirect', path: 'cases', redirectTo: '/app/matters' })
    expect(appRouteDefinitions).toContainEqual({ kind: 'redirect', path: 'module/chars', redirectTo: '/app/people' })
    expect(appRouteDefinitions).toContainEqual({ kind: 'redirect', path: 'module/moments', redirectTo: '/app/module/posts' })
    expect(appRouteDefinitions).toContainEqual({ kind: 'redirect', path: 'module/:id', redirectTo: '/app/module/inbox' })
  })
})

describe('飞书缓存安全边界', () => {
  it('刷新时立即进入只读状态，并在缓存清理失败时保留错误', () => {
    const admin = source('src/views/AdminView.vue')
    const workspace = source('src/core/feishu/workspace.ts')
    const resetHandler = admin.slice(admin.indexOf('function resetData()'), admin.indexOf('\nfunction logout()'))

    expect(workspace).toContain("this.publish({ loading: true, ready: false, error: '' })")
    expect(workspace).toContain('this.snapshot.loading')
    expect(resetHandler).toContain('await clearFeishuCache()')
    expect(resetHandler).toContain('ElMessage.error(')
    expect(resetHandler).toContain('location.reload()')
    expect(resetHandler).not.toContain('clearFeishuCache().catch(')
  })
})
