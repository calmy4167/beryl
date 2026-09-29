import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import net from 'node:net'

const root = 'D:\\dsharness'
const browser = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const output = join(tmpdir(), 'calmy-task8-auth-states')
mkdirSync(output, { recursive: true })

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(error => error ? reject(error) : resolve(address.port))
    })
  })
}
async function waitFor(check, timeout = 20000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const result = await check().catch(() => null)
    if (result) return result
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('state capture timed out')
}

const serverPort = await freePort()
const vite = spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(serverPort)], { cwd: root, stdio: 'ignore' })
const base = `http://127.0.0.1:${serverPort}`
const manifest = { capturedAt: new Date().toISOString(), browser, server: 'isolated local Vite', captures: [], vaultAttempts: [] }

async function captureFramework(framework) {
  const profile = mkdtempSync(join(tmpdir(), `calmy-task8-${framework}-`))
  const port = await freePort()
  const chrome = spawn(browser, ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })
  let socket
  try {
    const target = await waitFor(async () => {
      const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      return tabs.find(tab => tab.type === 'page')?.webSocketDebuggerUrl
    })
    socket = new WebSocket(target)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    let id = 0
    const pending = new Map()
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data))
      if (!pending.has(message.id)) return
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result)
    })
    function call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const requestId = ++id
        pending.set(requestId, { resolve, reject })
        socket.send(JSON.stringify({ id: requestId, method, params }))
      })
    }
    async function evaluate(expression) {
      const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text)
      return response.result.value
    }
    async function fill(selector, value) {
      const focused = await evaluate(`(() => { const input=document.querySelector(${JSON.stringify(selector)}); if(!input) return false; input.focus(); input.select(); return document.activeElement===input })()`)
      if (!focused) throw new Error(`${framework}: input missing: ${selector}`)
      await call('Input.insertText', { text: value })
      await waitFor(() => evaluate(`document.querySelector(${JSON.stringify(selector)})?.value===${JSON.stringify(value)}`))
    }
    async function screenshot(state, expected) {
      for (const width of [1440, 390]) {
        const height = width === 390 ? 844 : 900
        await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 })
        await evaluate('window.dispatchEvent(new Event("resize")); new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        const actual = await evaluate(`(() => { const form=document.querySelector('.login-card'); const alert=form?.querySelector('[role="alert"]'); const button=form?.querySelector('button'); const rect=button?.getBoundingClientRect(); return {path:location.hash,alert:alert?.textContent,button:button?.textContent,disabled:button?.disabled,overflow:document.documentElement.scrollWidth>innerWidth,buttonRect:rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height}:null} })()`)
        if (!actual.alert?.includes(expected) || actual.overflow || (state === 'lock' && (!actual.disabled || !actual.button?.startsWith('锁定')))) throw new Error(`${framework} ${state} ${width}: ${JSON.stringify(actual)}`)
        const shot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
        const image = join(output, `${framework}-login-${state}-${width}x${height}.png`)
        writeFileSync(image, Buffer.from(shot.data, 'base64'))
        manifest.captures.push({ framework, state, width, height, image, ...actual })
        console.log(`${framework} ${state} ${width}x${height}: ${JSON.stringify(actual)}`)
      }
    }

    await call('Page.enable')
    await call('Runtime.enable')
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {const rec={u:'ui-parity-fixture',salt:'00'.repeat(16),hash:'00'.repeat(32),iter:1};localStorage.clear();sessionStorage.clear();localStorage.setItem('b_auth',JSON.stringify(rec));})()` })
    await call('Page.navigate', { url: `${base}${framework === 'react' ? '/' : '/vue-preview.html'}#/login` })
    await waitFor(() => evaluate("!!document.querySelector('.login-card input[aria-label=\"用户名\"]')"), 30000)
    await fill('input[aria-label="用户名"]', 'ui-parity-fixture')
    await fill('input[aria-label="密码"]', 'wrong-password')
    for (let attempt = 1; attempt <= 5; attempt++) {
      const clicked = await evaluate(`(() => { const button=document.querySelector('.login-card button'); if(!button || button.disabled) return false; button.click(); return true })()`)
      if (!clicked) throw new Error(`${framework}: cannot submit attempt ${attempt}`)
      if (attempt < 5) {
        await waitFor(() => evaluate(`(() => {const form=document.querySelector('.login-card');return form?.querySelector('[role="alert"]')?.textContent==='用户名或密码错误' && form?.querySelector('button')?.textContent==='登 录' && !form?.querySelector('button')?.disabled})()`))
        if (attempt === 1) await screenshot('error', '用户名或密码错误')
      } else {
        await waitFor(() => evaluate(`(() => {const form=document.querySelector('.login-card');return form?.querySelector('[role="alert"]')?.textContent==='登录失败 5 次，已锁定 30 秒' && form?.querySelector('button')?.textContent?.startsWith('锁定')})()`))
        await screenshot('lock', '登录失败 5 次，已锁定 30 秒')
      }
    }
    try {
      await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
      await evaluate(`(async () => { const {writeSession}=await import('/src/core/auth.ts'); writeSession('ui-parity-fixture'); location.hash='#/app/admin'; return true })()`)
      await waitFor(() => evaluate("!!document.querySelector('.legacy-admin-host .admin-view')"), 30000)
      const fixture = await evaluate(`(async () => {
        const {matterRepository}=await import('/src/domain/matter/repository.ts');
        const {exportOpenWorkspace}=await import('/src/core/content/open-format.ts');
        const matter={calmyId:'task8-vault-matter',title:'本地标题',why:'隔离浏览器冲突预览',primaryContradiction:'',status:'active',currentStage:'wood',trajectory:'stable',evidenceIds:[],createdAt:1723900000000,updatedAt:1723900001000,revision:1};
        matterRepository.importEntity(matter);
        const root=await navigator.storage.getDirectory();
        const workspace=exportOpenWorkspace({matters:[matter],assets:[]});
        for(const [path,original] of Object.entries(workspace.files)) {
          const segments=path.split('/'); const filename=segments.pop(); let dir=root;
          for(const segment of segments) dir=await dir.getDirectoryHandle(segment,{create:true});
          const file=await dir.getFileHandle(filename,{create:true});
          const writer=await file.createWritable();
          const contents=path.endsWith('.md')?original.replace('title: "本地标题"','title: "外部标题"'):original;
          await writer.write(contents); await writer.close();
        }
        Object.defineProperty(window,'showDirectoryPicker',{configurable:true,value:async()=>root});
        return {files:Object.keys(workspace.files),rootName:root.name};
      })()`)
      const choose = await evaluate(`(() => {const button=[...document.querySelectorAll('.legacy-admin-host button')].find(item=>item.textContent.trim()==='选择 Vault');if(!button)return false;button.click();return true})()`)
      if (!choose) throw new Error('choose-vault-button-missing')
      await waitFor(() => evaluate("document.querySelector('.legacy-admin-host')?.textContent.includes('当前 Vault：')"), 12000)
      const scan = await evaluate(`(() => {const button=[...document.querySelectorAll('.legacy-admin-host button')].find(item=>item.textContent.trim()==='扫描差异');if(!button||button.disabled)return false;button.click();return true})()`)
      if (!scan) throw new Error('scan-vault-button-disabled')
      const conflictSelector = '[aria-label="冲突 task8-vault-matter 的处理方式"]'
      await waitFor(() => evaluate(`!!document.querySelector(${JSON.stringify(conflictSelector)})`), 12000)
      for (const width of [1440, 390]) {
        const height = width === 390 ? 844 : 900
        await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 })
        await evaluate('window.dispatchEvent(new Event("resize"))')
        await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        await evaluate(`(() => { const control=document.querySelector(${JSON.stringify(conflictSelector)}); control.scrollIntoView({block:'center'}); if(control.getAttribute('aria-expanded')!=='true') control.click(); return true })()`)
        await waitFor(() => evaluate(`(() => { const control=document.querySelector(${JSON.stringify(conflictSelector)}); const dropdown=document.querySelector('.el-select-dropdown'); const style=dropdown&&getComputedStyle(dropdown); const rect=dropdown?.getBoundingClientRect(); return control?.getAttribute('aria-expanded')==='true' && style?.visibility==='visible' && Number(style.opacity)===1 && !!rect && rect.width>0 && rect.height>0 })()`), 5000)
        await waitFor(() => evaluate("document.getAnimations().every(animation => animation.playState !== 'running')"), 3000)
        await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        const actual = await evaluate(`(() => {const control=document.querySelector(${JSON.stringify(conflictSelector)});const rect=control.getBoundingClientRect();const nav=document.querySelector('.bottom-nav');const navStyle=nav&&getComputedStyle(nav);const navRect=nav?.getBoundingClientRect();const active=nav?.querySelector('.on');const activeStyle=active&&getComputedStyle(active);const bodyStyle=getComputedStyle(document.body);return {path:location.hash,viewport:{width:innerWidth,height:innerHeight},appCompact:document.querySelector('.app-shell')?.getAttribute('data-compact'),bottomNavCount:document.querySelectorAll('.bottom-nav').length,mobileHeaderCount:document.querySelectorAll('.mobile-header').length,conflict:true,listbox:!!document.querySelector('.el-select-dropdown'),overflow:document.documentElement.scrollWidth>innerWidth,scroll:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},controlRect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},bottomNav:nav&&navRect?{rect:{x:navRect.x,y:navRect.y,width:navRect.width,height:navRect.height},backgroundColor:navStyle.backgroundColor,backdropFilter:navStyle.backdropFilter,borderTopColor:navStyle.borderTopColor,opacity:navStyle.opacity,activeClass:active?.className,activeColor:activeStyle?.color,bodyBackground:bodyStyle.backgroundColor}:null}})()`)
        const shot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
        const image = join(output, `${framework}-vault-dropdown-${width}x${height}.png`)
        writeFileSync(image, Buffer.from(shot.data, 'base64'))
        manifest.captures.push({ framework, state: 'vault-dropdown', width, height, image, ...actual })
      }
      manifest.vaultAttempts.push({ framework, status: 'captured', fixture })
    } catch (error) {
      const diagnostic = await evaluate(`({path:location.hash,vaultText:document.querySelector('.legacy-admin-host')?.textContent.slice(-1200),picker:typeof window.showDirectoryPicker})`).catch(() => null)
      manifest.vaultAttempts.push({ framework, status: 'open', error: String(error), diagnostic })
      console.log(`${framework} Vault dropdown remains open: ${String(error)} ${JSON.stringify(diagnostic)}`)
    }
  } finally {
    try { socket?.close() } catch {}
    chrome.kill()
    await Promise.race([new Promise(resolve => chrome.once('close', resolve)), new Promise(resolve => setTimeout(resolve, 3000))])
    rmSync(profile, { recursive: true, force: true })
  }
}

try {
  await waitFor(async () => (await fetch(`${base}/vue-preview.html`)).ok)
  for (const framework of ['react', 'vue']) await captureFramework(framework)
  const manifestPath = join(output, 'manifest-login-error-lock.json')
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  console.log(`manifest=${manifestPath}`)
} finally {
  vite.kill()
  await Promise.race([new Promise(resolve => vite.once('close', resolve)), new Promise(resolve => setTimeout(resolve, 3000))])
}
