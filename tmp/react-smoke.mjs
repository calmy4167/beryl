import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import net from 'node:net'

const browser = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
if (!existsSync(browser)) throw new Error('Chrome is unavailable')
const port = await new Promise((resolvePort, reject) => {
  const server = net.createServer().listen(0, '127.0.0.1', () => {
    const address = server.address(); if (!address || typeof address === 'string') return reject(new Error('port'))
    server.close(() => resolvePort(address.port))
  })
})
const profile = mkdtempSync(join(tmpdir(), 'calmy-react-smoke-'))
let chrome, socket, id = 0
const pending = new Map()
try {
  chrome = spawn(browser, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-background-networking', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })
  let page
  for (let i=0; i<200 && !page; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(x=>x.type==='page'&&x.url==='about:blank') } catch {}
    if (!page) await new Promise(r=>setTimeout(r,100))
  }
  if (!page) throw new Error('chrome page timeout')
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolveOpen,reject)=>{socket.addEventListener('open',resolveOpen,{once:true});socket.addEventListener('error',reject,{once:true})})
  socket.addEventListener('message', e=>{const m=JSON.parse(String(e.data));if(m.method==='Runtime.exceptionThrown'||m.method==='Log.entryAdded')console.error('browser-event',JSON.stringify(m.params).slice(0,1200));if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);p(m)}}})
  const call=(method,params={})=>new Promise((res,rej)=>{const n=++id;pending.set(n,m=>m.error?rej(new Error(m.error.message)):res(m.result));socket.send(JSON.stringify({id:n,method,params}))})
  const evaluate=async expression=>{const x=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(x.exceptionDetails)throw new Error(JSON.stringify(x.exceptionDetails));return x.result?.value}
  await call('Page.enable'); await call('Runtime.enable'); await call('Log.enable')
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('b_session', JSON.stringify({u:'calmy',ts:Date.now()}));`})
  await call('Page.navigate',{url:'http://127.0.0.1:4173/react-preview.html#/app/library'})
  let report
  for(let i=0;i<200;i++){report=await evaluate(`({ready:document.readyState, url:location.href, title:document.title, text:document.body?.innerText?.slice(0,1200), html:document.querySelector('#app')?.innerHTML?.slice(0,1200), resources:performance.getEntriesByType('resource').map(x=>x.name).filter(x=>/react|main|tsx|router/.test(x)).slice(-20), app:!!document.querySelector('#app')?.firstElementChild})`);if(report?.app)break;await new Promise(r=>setTimeout(r,100))}
  console.log(JSON.stringify(report))
  const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  writeFileSync('tmp/react-smoke.png',Buffer.from(shot.data,'base64'))
} finally {
  if(chrome?.exitCode===null){chrome.kill();await new Promise(r=>chrome.once('close',r))}
  const abs=resolve(profile), base=resolve(tmpdir())
  if(abs.startsWith(base+join('',''))&&abs.includes('calmy-react-smoke-'))rmSync(abs,{recursive:true,force:true})
}
