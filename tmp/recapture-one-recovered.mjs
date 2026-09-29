import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import net from 'node:net'

const manifestPath = resolve(process.argv[2])
const requestedFramework = process.argv[3] || 'react'
const frameworks = requestedFramework === 'both' ? ['react', 'vue'] : [requestedFramework]
const requestedViewport = process.argv[4]
const outputDir = process.argv[5] ? resolve(process.argv[5]) : resolve('tmp')
mkdirSync(outputDir, { recursive: true })
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const browser = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const port = await new Promise((done, fail) => { const server=net.createServer().listen(0,'127.0.0.1',()=>{const a=server.address();server.close(()=>a&&typeof a!=='string'?done(a.port):fail(new Error('port')))}) })
const profile = mkdtempSync(join(tmpdir(),'calmy-recapture-'))
let chrome, socket, next=0
const pending = new Map()
const pause=ms=>new Promise(r=>setTimeout(r,ms))
try {
  chrome=spawn(browser,['--headless=new','--disable-gpu','--no-sandbox','--disable-background-networking','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'})
  let page
  for(let i=0;i<200&&!page;i++){try{page=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(x=>x.type==='page'&&x.url==='about:blank')}catch{} if(!page)await pause(100)}
  if(!page)throw new Error('chrome-target-timeout')
  socket=new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true})})
  socket.addEventListener('message',e=>{const m=JSON.parse(String(e.data));if(m.id){const cb=pending.get(m.id);if(cb){pending.delete(m.id);m.error?cb.reject(new Error(m.error.message)):cb.resolve(m.result)}}})
  const call=(method,params={})=>new Promise((resolveCall,reject)=>{const id=++next;pending.set(id,{resolve:resolveCall,reject});socket.send(JSON.stringify({id,method,params}))})
  const evalJS=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
  await call('Page.enable');await call('Runtime.enable');await call('DOM.enable');await call('CSS.enable')
  const firstViewport=manifest.viewports.find(v=>v.framework==='react'&&(!requestedViewport||`${v.width}x${v.height}`===requestedViewport))
  await call('Emulation.setDeviceMetricsOverride',{width:firstViewport.width,height:firstViewport.height,deviceScaleFactor:1,mobile:firstViewport.width<=620})
  const firstGeometry=JSON.parse(readFileSync(resolve(firstViewport.geometry),'utf8'))
  await call('Emulation.setPageScaleFactor',{pageScaleFactor:Number(firstGeometry.viewport?.visualScale)||1})
  for (const framework of frameworks) {
  if (framework === 'vue' && requestedFramework === 'both') await call('Storage.clearDataForOrigin',{origin:'http://127.0.0.1:4174',storageTypes:'all'})
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const fixedNow=Date.parse('2026-09-26T12:00:00.000Z');const NativeDate=Date;class StableDate extends NativeDate{constructor(...args){super(...(args.length?args:[fixedNow]))}static now(){return fixedNow}}Object.defineProperty(window,'Date',{value:StableDate,configurable:true});let uuidCounter=0;const stableUuid=()=>{uuidCounter+=1;return '00000000-0000-4000-8000-'+String(uuidCounter).padStart(12,'0')};try{Object.defineProperty(crypto,'randomUUID',{value:stableUuid,configurable:true})}catch{try{Object.defineProperty(Crypto.prototype,'randomUUID',{value:stableUuid,configurable:true})}catch{}}let randomState=0x51f15e;window.__setMigrationRandomSeed=seed=>{randomState=seed>>>0};Math.random=()=>{randomState=(randomState*1664525+1013904223)>>>0;return randomState/0x100000000}})();localStorage.setItem('b_session',JSON.stringify({u:'calmy',ts:Date.now()}));localStorage.setItem('b_scene',JSON.stringify('personal'));`})
  const html=framework==='react'?'react-preview.html':'vue-preview.html'
  const previousTimeOrigin=await evalJS('performance.timeOrigin')
  await call('Page.navigate',{url:`http://127.0.0.1:4174/${html}#${manifest.route}`})
  console.log(JSON.stringify({navigationRequested:framework,expectedPath:`/${html}`,observedPath:await evalJS('location.pathname'),previousTimeOrigin,currentTimeOrigin:await evalJS('performance.timeOrigin'),documentReadyState:await evalJS('document.readyState'),vueRootMounted:await evalJS('!!document.querySelector("#app[data-v-app]")')}))
  const routeRoot=manifest.route==='/login'?'.login-wrap':manifest.route==='/pass'?'.simple-page':manifest.route==='/scene'?'.scene-page':manifest.route.startsWith('/app/admin')?'.legacy-admin-host':'.app-shell'
  let rootReady=false
  for(let i=0;i<300;i++){rootReady=await evalJS(`!!document.querySelector(${JSON.stringify(routeRoot)})`);if(rootReady)break;await pause(100)}
  if(!rootReady)throw new Error(`route-root-timeout ${routeRoot}; url=${await evalJS('location.href')} body=${String(await evalJS('document.body.innerText')).slice(0,500)}`)
  if(manifest.route==='/app/feishu'){
    await evalJS(`(async()=>{const baseUrl='https://worker.example.invalid';const workspaceId='migration-parity-fixture';localStorage.setItem('b_cloud',JSON.stringify({url:baseUrl,key:'migration-parity-fixture'}));const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('calmy-feishu-cache',1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('snapshots'))request.result.createObjectStore('snapshots')};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});const tx=db.transaction('snapshots','readwrite');const store=tx.objectStore('snapshots');store.put(workspaceId,'feishu:connection:'+baseUrl);store.put({workspaceId,tables:{tasks:[],projects:[],reviews:[],members:[]},fields:{},bindings:{},tableErrors:{},updatedAt:Date.now()},'feishu:workspace:'+workspaceId);await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});db.close();const {sync}=await import('/src/core/sync.ts');sync.saved.cloud={url:baseUrl,key:'migration-parity-fixture'};const {feishuWorkspace}=await import('/src/domain/feishu/workspace-instance.ts');await feishuWorkspace.refresh();return true})()`)
  }
  const readySelector=manifest.route==='/login'?'.login-card':manifest.route==='/pass'?'.simple-page h1':manifest.route==='/scene'?'.scene-intro h1':manifest.route==='/app/master-data'?'.master-data-page':manifest.route.startsWith('/app/admin')?'.legacy-admin-host':manifest.route.startsWith('/app/matters/')?'.page-container .matter-detail, .page-container .empty-state':'.page-container h1'
  let ready=false
  for(let i=0;i<300;i++){ready=await evalJS(`!!document.querySelector(${JSON.stringify(readySelector)})`);if(ready)break;await pause(100)}
  if(!ready)throw new Error(`page-ready-timeout ${readySelector}`)
  await evalJS('document.fonts?.ready')
  await pause(300)
  if(manifest.route==='/app/module/tasks')await evalJS(`(async()=>{const repository=await import('/src/domain/action/repository.ts');const target=repository.actionAsyncRepository;const original=target.transition.bind(target);window.__transitionProbe=[];target.transition=async(...args)=>{try{const result=await original(...args);window.__transitionProbe.push({args,result:{id:result.calmyId,status:result.status,revision:result.revision}});return result}catch(error){window.__transitionProbe.push({args,error:String(error)});throw error}}})()`)
  for(const [stepIndex,step] of (manifest.interaction?.steps||[]).entries()){
    if(step.type==='fill'||step.type==='change'){
      for(let i=0;i<300&&!await evalJS(`!!document.querySelector(${JSON.stringify(step.selector)})`);i++)await pause(100)
      const arg=JSON.stringify(step)
      const ok=await evalJS(`(async()=>{const s=${arg};let e=document.querySelector(s.selector);if(!e&&s.selector==='.global-search'){document.querySelector('.topbar-search')?.click();for(let i=0;i<30&&!document.querySelector('.search-panel .global-search');i++)await new Promise(r=>setTimeout(r,20));e=document.querySelector('.search-panel .global-search')}if(!e)return false;e.focus();const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value')?.set;if(d)d.call(e,s.value);else e.value=s.value;e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:s.value}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
      if(!ok)throw new Error(`fill-selector-missing ${step.selector} body=${String(await evalJS('document.body.innerText')).slice(0,500)}`)
    }else if(step.type==='click'||step.type==='tap'){
      const seed=(0x51f15e+Math.imul(stepIndex+1,0x9e3779b9))>>>0
      await evalJS(`window.__setMigrationRandomSeed?.(${seed})`)
      let selector=framework==='vue'?step.selector.replaceAll('.react-btn','.app-button'):step.selector
      const mobile=Number(requestedViewport?.split('x')[0]||0)<=620
      if(mobile&&selector==='.sidebar-toggle')selector='[aria-label="打开功能目录"],.menu'
      if(mobile&&selector.includes('[data-group-id='))continue
      const selectIndex=selector.match(/\.calmy-select__option:nth-child\((\d+)\)/)?.[1]
      const optionValue=selector.match(/\[data-value="([^"]+)"\]/)?.[1]
      const taskTitle=selector.match(/aria-label="([^"]+)"/)?.[1]
      if(!selectIndex&&!taskTitle)for(let i=0;i<300&&!await evalJS(`!!document.querySelector(${JSON.stringify(selector)})`);i++)await pause(100)
      const routePath=selector.match(/data-path="([^"]+)"/)?.[1]
      const target=await evalJS(`(()=>{const point=e=>{if(!e)return null;if(e.tagName==='SELECT'){e.click();return {kind:'native-select'}}const r=e.getBoundingClientRect();e.scrollIntoView({block:"center",inline:"nearest"});const b=e.getBoundingClientRect();return {kind:'pointer',x:b.left+b.width/2,y:b.top+b.height/2}};const s=${JSON.stringify(selector)};let e=document.querySelector(s);const title=${JSON.stringify(taskTitle||'')};if(!e&&title){const h=[...document.querySelectorAll('h3')].find(x=>x.textContent?.trim()===title);e=h?.closest('article')?.querySelector('select,[role="combobox"]')}if(e)return point(e);const path=${JSON.stringify(routePath||'')};if(path){const drawer=document.querySelector('#more-drawer');const words=path==='/app/library'?['资料�?,'资料']:path==='/app/module/inbox'?['收集']:path==='/app/module/diary'?['日记']:path==='/app/flow'?['探索']:[];e=Array.from(drawer?.querySelectorAll('button')||[]).find(b=>words.some(w=>b.textContent?.includes(w)));if(e)return point(e)}const n=${JSON.stringify(selectIndex||'')};const v=${JSON.stringify(optionValue||'')};const controls=[...document.querySelectorAll('select,[role="combobox"]')];const c=controls.find(x=>x.tagName==='SELECT'?[...x.options].some(o=>v?o.value===v:true):[...(x.closest('.calmy-select')?.querySelectorAll('[role="option"]')||[])].some(o=>v?o.getAttribute('data-value')===v:true));if(!c)return null;if(c.tagName==='SELECT'){const o=v?[...c.options].find(x=>x.value===v):c.options[Number(n)-1];if(!o)return null;c.value=o.value;c.dispatchEvent(new Event('input',{bubbles:true}));c.dispatchEvent(new Event('change',{bubbles:true}));return {kind:'changed-select'}}const options=c.closest('.calmy-select')?.querySelectorAll('[role="option"]');const option=v?[...options||[]].find(o=>o.getAttribute('data-value')===v):options?.[Number(n)-1];return option?point(option):null})()`)
      if(!target)throw new Error(`click-selector-missing ${selector}; body=${String(await evalJS('document.body.innerText')).slice(0,1200)}`)
      if(target.kind==='pointer'){
        await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:target.x,y:target.y})
        await call('Input.dispatchMouseEvent',{type:'mousePressed',x:target.x,y:target.y,button:'left',clickCount:1})
        await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:target.x,y:target.y,button:'left',clickCount:1})
      }
    }else if(step.type==='press'){
      const target=step.selector?await evalJS(`(()=>{const e=document.querySelector(${JSON.stringify(step.selector)});if(!e)return false;e.focus();return true})()`):true
      if(!target)throw new Error(`press-selector-missing ${step.selector}`)
      for(const key of step.keys||[]){
        const code=key==='Escape'?'Escape':key==='Tab'?'Tab':key.length===1?`Key${key.toUpperCase()}`:key
        const vk=key==='Escape'?27:key==='Tab'?9:key.length===1?key.toUpperCase().charCodeAt(0):0
        await call('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:vk})
        await call('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk})
      }
    }else if(step.type==='failFlowRead'){
      await evalJS(`(async()=>{const m=await import('/src/core/storage.ts');const o=m.store.get.bind(m.store);let armed=true;m.store.get=function(...a){if(armed){armed=false;throw new Error('Injected read failure')}return o(...a)};return true})()`)
    }else if(step.type==='failActionRead'){
      await evalJS(`(async()=>{const m=await import('/src/domain/action/repository.ts');const r=m.actionAsyncRepository;const original=r.list.bind(r);let armed=true;r.list=function(...args){if(armed){armed=false;return Promise.reject(new Error('迁移验收读取失败'))}return original(...args)};return true})()`)
    }else if(step.type==='failRealityRead'){
      await evalJS(`(async()=>{const m=await import('/src/domain/unified/repository.ts');const r=m.unifiedAsyncRepository;const original=r.list.bind(r);let armed=true;r.list=function(...args){if(armed){armed=false;return Promise.reject(new Error('迁移验收概览读取失败'))}return original(...args)};location.hash='#/app/admin';setTimeout(()=>{location.hash='#/app/profile'},120);return true})()`)
      await pause(300)
    }else if(step.type==='matterDetail'){
      const path=await evalJS(`(async()=>{const m=await import('/src/domain/matter/repository.ts');const items=await m.matterAsyncRepository.list();const item=items.find(x=>x.title===${JSON.stringify(step.title)});if(!item)return '';const target='/app/matters/'+encodeURIComponent(item.calmyId);location.hash='#'+target;return target})()`)
      if(!path)throw new Error(`matter-detail-seed-missing ${step.title}`)
      let navigated=false
      for(let i=0;i<100;i++){navigated=await evalJS(`location.hash===${JSON.stringify('#'+path)}`);if(navigated)break;await pause(100)}
      if(!navigated)throw new Error(`matter-detail-navigation-timeout ${path}`)
    }else if(step.type==='reload'){
      await call('Page.reload',{ignoreCache:true})
      let reloaded=false
      for(let i=0;i<300;i++){try{reloaded=await evalJS(`!!document.querySelector(${JSON.stringify(routeRoot)})`);if(reloaded)break}catch{} await pause(100)}
      if(!reloaded)throw new Error(`reload-route-timeout ${routeRoot}`)
      let pageReady=false
      for(let i=0;i<300;i++){try{pageReady=await evalJS(`!!document.querySelector(${JSON.stringify(readySelector)})`);if(pageReady)break}catch{} await pause(100)}
      if(!pageReady)throw new Error(`reload-page-timeout ${readySelector}`)
      await evalJS('document.fonts?.ready')
    }else if(step.type==='drag'){
      const result=await evalJS(`(async()=>{const s=document.querySelector(${JSON.stringify(step.from)});const t=document.querySelector(${JSON.stringify(step.to)});if(!s||!t)return {ok:false,source:!!s,target:!!t};const seen=[];s.addEventListener('dragstart',()=>seen.push('dragstart'),true);t.addEventListener('dragover',()=>seen.push('dragover'),true);t.addEventListener('drop',()=>seen.push('drop'),true);const transfer=new DataTransfer();const bounds=e=>e.getBoundingClientRect();const a=bounds(s),b=bounds(t);s.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer,clientX:a.x+a.width/2,clientY:a.y+a.height/2}));t.dispatchEvent(new DragEvent('dragenter',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:b.x+b.width/2,clientY:b.y+b.height/2}));t.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:b.x+b.width/2,clientY:b.y+b.height/2}));const dropEvent=new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:b.x+b.width/2,clientY:b.y+b.height/2});t.dispatchEvent(dropEvent);s.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:transfer}));await new Promise(r=>setTimeout(r,180));const module=await import('/src/domain/action/repository.ts');const actions=await module.actionAsyncRepository.list();return {ok:true,seen,dropDefaultPrevented:dropEvent.defaultPrevented,dropEffect:transfer.dropEffect,storedId:transfer.getData('text/plain'),status:actions.find(item=>item.title===${JSON.stringify('临时拖放状态行�?)})?.status,transitions:window.__transitionProbe,text:document.body.innerText.slice(-80)}})()`)
      console.log(JSON.stringify({dragEventResult:result,framework}))
      if(!result?.ok)throw new Error(`drag-target-missing ${JSON.stringify(result)}`)
    }else if(step.type==='graphRelation'){
      const seeded=await evalJS(`(async()=>{
        const matter=await import('/src/domain/matter/repository.ts')
        const unified=await import('/src/domain/unified/repository.ts')
        matter.matterRepository.create({title:'迁移验收关系处境'})
        await unified.unifiedAsyncRepository.create(unified.unifiedFactories.person({displayName:'迁移验收关系人物'}))
        window.dispatchEvent(new CustomEvent('beryl-data-synced'))
        return true
      })()`)
      if(!seeded)throw new Error('graph-relation-fixture-seed-failed')
      await pause(120)
      if(step.fail){
        const armed=await evalJS(`(async()=>{const m=await import('/src/domain/unified/repository.ts');const r=m.unifiedAsyncRepository;const original=r.create.bind(r);let armed=true;r.create=function(...args){if(armed){armed=false;return Promise.reject(new Error('迁移验收关系写入失败'))}return original(...args)};return true})()`)
        if(!armed)throw new Error('graph-relation-failure-hook-unavailable')
      }
      const result=await evalJS(`(async()=>{
        const pick=(label,value)=>{
          const control=document.querySelector('[aria-label="'+label+'"]')
          if(!control)return false
          if(control.tagName==='SELECT'){
            const option=[...control.options].find(item=>item.value===value)
            if(!option)return false
            control.value=value
            control.dispatchEvent(new Event('input',{bubbles:true}))
            control.dispatchEvent(new Event('change',{bubbles:true}))
            return true
          }
          if(control.getAttribute('aria-expanded')!=='true')control.click()
          const root=control.closest('.calmy-select')
          const option=[...(root?.querySelectorAll('[role="option"]')||[])].find(item=>item.getAttribute('data-value')===value)
          if(!option)return false
          option.click()
          return true
        }
        const getValues=async label=>{
          const control=document.querySelector('[aria-label="'+label+'"]')
          if(!control)return []
          if(control.tagName==='SELECT')return [...control.options].map(option=>option.value).filter(Boolean)
          if(control.getAttribute('aria-expanded')!=='true')control.click()
          await new Promise(resolve=>setTimeout(resolve,80))
          return [...(control.closest('.calmy-select')?.querySelectorAll('[role="option"]')||[])].map(option=>option.getAttribute('data-value')).filter(Boolean)
        }
        const entries=async label=>{
          const control=document.querySelector('[aria-label="'+label+'"]')
          if(!control)return []
          if(control.tagName==='SELECT')return [...control.options].filter(option=>option.value).map(option=>({value:option.value,label:option.textContent||''}))
          if(control.getAttribute('aria-expanded')!=='true')control.click()
          await new Promise(resolve=>setTimeout(resolve,80))
          return [...(control.closest('.calmy-select')?.querySelectorAll('[role="option"]')||[])].map(option=>({value:option.getAttribute('data-value'),label:option.textContent||''})).filter(option=>option.value)
        }
        const from=(await entries('关系起点')).find(option=>option.label.startsWith('处境 ·'))?.value
        if(!from||!pick('关系起点',from))return {ok:false,reason:'missing-from-node'}
        const to=(await entries('关系终点')).find(option=>option.value!==from&&option.label.startsWith('人物 ·'))?.value
        if(!to||!pick('关系终点',to))return {ok:false,reason:'missing-distinct-to-node'}
        const typeValues=await getValues('关系类型')
        if(typeValues.includes('supports')&&!pick('关系类型','supports'))return {ok:false,reason:'cannot-pick-relation-type'}
        const submit=document.querySelector('[aria-labelledby="add-relation-title"] .relation-form button.primary')
        if(!submit)return {ok:false,reason:'missing-submit'}
        submit.click()
        return {ok:true,from,to}
      })()`)
      if(!result?.ok)throw new Error(`graph-relation-setup-failed ${JSON.stringify(result)}`)
      await pause(500)
    }else if(step.type==='waitText'){
      const expectedText=manifest.route==='/app/feishu'&&step.text==='整理缓存状�??'当前显示':step.text
      let found=false;for(let i=0;i<120;i++){found=await evalJS(`document.body.innerText.includes(${JSON.stringify(expectedText)})`);if(found)break;await pause(100)}
      if(!found)throw new Error(`wait-text-timeout ${step.text}; body=${String(await evalJS('document.body.innerText')).slice(0,1200)}`)
    }else if(step.type==='waitNoText'){
      let absent=false;for(let i=0;i<120;i++){absent=!(await evalJS(`document.body.innerText.includes(${JSON.stringify(step.text)})`));if(absent)break;await pause(100)}
      if(!absent)throw new Error(`wait-no-text-timeout ${step.text}`)
    }else if(step.type==='wait') await pause(step.ms||step.duration||500)
    else throw new Error(`unsupported-step ${step.type}`)
    await pause(80)
    if(process.env.CALMY_TRACE_STEPS)console.log('TRACE',stepIndex,step.type,step.selector||'',await evalJS('location.hash'))
  }
  const vp=manifest.viewports.find(v=>v.framework===framework&&(!requestedViewport||`${v.width}x${v.height}`===requestedViewport))
  const geometryPath=resolve(vp.geometry)
  const oldGeometry=JSON.parse(readFileSync(geometryPath,'utf8'))
  await call('Emulation.setPageScaleFactor',{pageScaleFactor:Number(oldGeometry.viewport?.visualScale)||1})
  const scrollTop=oldGeometry.layoutDiagnostics?.roots?.find(x=>x.selector==='.page-container')?.scroll?.top ?? 0
  await call('Emulation.setDeviceMetricsOverride',{width:vp.width,height:vp.height,deviceScaleFactor:1,mobile:vp.width<=620})
  await evalJS(`(()=>{const e=document.querySelector('.page-container');if(e)e.scrollTop=${Number(scrollTop)}})()`)
  if (await evalJS(`document.activeElement?.matches('textarea, input, select')`)) {
    for (const params of [
      {type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9},
      {type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9},
      {type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8},
      {type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8},
    ]) await call('Input.dispatchKeyEvent',params)
  }
  await pause(1100)
  if(manifest.route==='/app/module/tasks'&&(manifest.interaction?.steps||[]).some(step=>step.type==='drag')){
    const state=await evalJS(`(async()=>{const repository=await import('/src/domain/action/repository.ts');return {source:document.querySelector('.task-board-column')?'board':'other',columns:Array.from(document.querySelectorAll('.task-board-column')).map(column=>({name:column.querySelector('h2')?.textContent?.trim(),cards:Array.from(column.querySelectorAll('.task-board-card h3')).map(title=>title.textContent?.trim())})),actions:(await repository.actionAsyncRepository.list()).map(item=>({id:item.calmyId,title:item.title,status:item.status,revision:item.revision}))}})()`)
    console.log(JSON.stringify({dragState:state,framework,route:manifest.route}))
  }
  const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  writeFileSync(join(outputDir,`recaptured-${framework}.png`),Buffer.from(shot.data,'base64'))
  const selectDiagnostics=await evalJS(`Array.from(document.querySelectorAll('.page-container select')).map(e=>{const s=getComputedStyle(e);return {label:e.getAttribute('aria-label'),attrs:Array.from(e.attributes).map(a=>a.name),scopedMatch:e.matches('.graph-page select[data-v-ba9a60d7]'),rect:e.getBoundingClientRect().toJSON(),text:e.selectedOptions[0]?.textContent,value:e.value,disabled:e.disabled,color:s.color,opacity:s.opacity,font:s.font,fontFamily:s.fontFamily,fontSize:s.fontSize,lineHeight:s.lineHeight,background:s.backgroundColor,backgroundImage:s.backgroundImage,appearance:s.appearance,padding:s.padding,border:s.border,borderRadius:s.borderRadius,boxShadow:s.boxShadow}})`)
  writeFileSync(join(outputDir,`selects-${framework}.json`),JSON.stringify(selectDiagnostics,null,2))
  const diagnostic=await evalJS(`(()=>{const props=['display','position','boxSizing','width','height','margin','padding','gap','font','fontSize','fontWeight','lineHeight','letterSpacing','color','backgroundColor','border','borderRadius','boxShadow','outline','textRendering','fontKerning','fontFeatureSettings'];const selectors=['.simple-page','.compatibility-placeholder-card','.beryl-card.empty-state','.flow-page','.page-container','.master-data-page','.master-data-heading','.master-data-heading h1','.master-data-heading p','.master-data-heading .load-pill','.master-data-tabs','.master-data-tabs button','.master-data-composer','.master-data-composer-heading','.master-data-composer h2','.master-data-composer p','.master-data-composer form','.master-data-composer label','.master-data-composer input','.master-data-composer textarea','.master-data-form-actions','.master-data-form-actions button','.master-data-library','.master-data-library-heading','.master-data-library h2','.master-data-library p','.master-data-archived-toggle','.master-data-search','.master-data-state','.master-data-dictionary-note','.goals-page','.page-head','.goals-head-actions','.goals-head-actions .load-pill','.goals-head-actions button','.matter-create','.create-row','.create-row input','.goal-context-fields','.admin-block','.panel-head','.goals-toolbar','.range-tabs','.goals-list','.goal-item','.goal-item h3','.goal-context-summary','.goal-context-summary small','.goal-item .chk','.goal-item .load-pill','.goal-item input[type=range]','.goal-item input[type=number]','.goal-item .muted'];return Object.fromEntries(selectors.map(q=>{const e=document.querySelector(q);if(!e)return[q,null];const s=getComputedStyle(e);const textRects=Array.from(e.childNodes).filter(n=>n.nodeType===3&&n.nodeValue.trim()).map(n=>{const r=document.createRange();r.selectNodeContents(n);return {text:n.nodeValue,rects:Array.from(r.getClientRects()).map(x=>x.toJSON())}});return[q,{rect:e.getBoundingClientRect().toJSON(),class:e.className,text:(e.innerText||e.textContent||'').trim().slice(0,80),nodes:Array.from(e.childNodes).map(n=>({type:n.nodeType,value:n.nodeValue})),textRects,style:Object.fromEntries(props.map(k=>[k,s[k]]))}]}))})()`)
  writeFileSync(`tmp/geometry-${framework}.json`,JSON.stringify(diagnostic,null,2))
  const textLayout=await evalJS(`(()=>{const root=document.querySelector('.page-container')||document.querySelector('.login-wrap')||document.querySelector('.simple-page')||document.querySelector('.scene-page')||document.body;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const rows=[];while(walker.nextNode()){const n=walker.currentNode;if(!n.nodeValue.trim())continue;const r=document.createRange();r.selectNodeContents(n);const rects=Array.from(r.getClientRects()).map(x=>x.toJSON());if(!rects.length)continue;const p=n.parentElement,s=getComputedStyle(p);rows.push({text:n.nodeValue,parent:p.tagName+'.'+(typeof p.className==='string'?p.className:''),rects,font:s.font,color:s.color})}return rows})()`)
  writeFileSync(`tmp/text-layout-${framework}.json`,JSON.stringify(textLayout,null,2))
  const fullLayout=await evalJS(`(()=>{const root=document.querySelector('.master-data-page');if(!root)return [];return [root,...root.querySelectorAll('*')].map(e=>{const s=getComputedStyle(e);return {tag:e.tagName,class:typeof e.className==='string'?e.className:'',text:(e.innerText||e.textContent||'').trim().slice(0,40),rect:e.getBoundingClientRect().toJSON(),style:Object.fromEntries(Array.from(s).map(k=>[k,s.getPropertyValue(k)]))}})})()`)
  writeFileSync(`tmp/full-layout-${framework}.json`,JSON.stringify(fullLayout,null,2))
  const shellLayout=await evalJS(`(()=>{const selectors=['html','body','#app','.app-shell','.sidebar','.mobile-header','.workspace-shell','.desktop-topbar','.workspace-tabs','.page-container','.right-rail','.context-dock','.context-dock-settings','.context-dock-settings svg','.route-motion','.bottom-nav','.mobile-nav','.mobile-drawer','.context-rail'];return selectors.map(q=>{const e=document.querySelector(q);if(!e)return {selector:q,missing:true};const s=getComputedStyle(e);return {selector:q,class:typeof e.className==='string'?e.className:'',rect:e.getBoundingClientRect().toJSON(),scrollWidth:e.scrollWidth,scrollHeight:e.scrollHeight,markup:q.includes('context-dock-settings')?e.outerHTML:undefined,style:Object.fromEntries(Array.from(s).map(k=>[k,s.getPropertyValue(k)]))}})})()`)
  const pseudoLayout=await evalJS(`(()=>{const b=getComputedStyle(document.body,'::before');return {content:b.content,opacity:b.opacity,background:b.background,backgroundImage:b.backgroundImage,position:b.position,inset:b.inset,transform:b.transform}})()`)
  writeFileSync(`tmp/shell-layout-${framework}.json`,JSON.stringify({shellLayout,pseudoLayout},null,2))
  const documentNode=await call('DOM.getDocument',{depth:-1,pierce:true})
  const usedFonts=[]
  for(const selector of ['.master-data-page h1','.master-data-page p','.master-data-page button','.master-data-page input','.master-data-page textarea','.mobile-header .brand b']){
    const queried=await call('DOM.querySelector',{nodeId:documentNode.root.nodeId,selector})
    if(queried.nodeId){const fonts=await call('CSS.getPlatformFontsForNode',{nodeId:queried.nodeId});usedFonts.push({selector,fonts:fonts.fonts})}
  }
  writeFileSync(`tmp/platform-fonts-${framework}.json`,JSON.stringify({fonts:await evalJS(`Array.from(document.fonts,f=>({family:f.family,weight:f.weight,style:f.style,status:f.status,check:document.fonts.check(f.weight+' 16px '+f.family)}))`),usedFonts,rendering:await evalJS(`(()=>{const e=document.querySelector('.master-data-page h1')||document.querySelector('.page-container h1')||document.querySelector('.legacy-admin-host h2')||document.querySelector('.page-container button')||document.body,s=getComputedStyle(e),h=getComputedStyle(document.documentElement);return {dpr:devicePixelRatio,zoom:visualViewport?.scale,fontFamily:s.fontFamily,fontSmoothing:s.webkitFontSmoothing,textRendering:s.textRendering,fontKerning:s.fontKerning,fontSynthesis:s.fontSynthesis,colorScheme:s.colorScheme,opacity:s.opacity,transform:s.transform,rootSmoothing:h.webkitFontSmoothing,agent:navigator.userAgent}})()`)},null,2))
  console.log(JSON.stringify({route:manifest.route,viewport:[vp.width,vp.height],scrollTop,windowY:await evalJS('window.scrollY'),pageTop:await evalJS('document.querySelector(".page-container")?.scrollTop'),htmlClass:await evalJS('document.documentElement.className'),grid:await evalJS(`(()=>{const e=document.querySelector('.workspace-shell'),h=document.querySelector('.desktop-topbar'),m=document.querySelector('.page-container');return {rows:e?getComputedStyle(e).gridTemplateRows:null,cols:e?getComputedStyle(e).gridTemplateColumns:null,header:h?.getBoundingClientRect().toJSON(),main:m?.getBoundingClientRect().toJSON()}})()`),form:await evalJS(`(()=>{const p=document.querySelector('.goal-context-fields');if(!p)return null;return {parent:p.getBoundingClientRect().toJSON(),template:getComputedStyle(p).gridTemplateColumns,children:Array.from(p.children).map(e=>{const s=getComputedStyle(e);return {tag:e.tagName,rect:e.getBoundingClientRect().toJSON(),margin:s.margin,padding:s.padding,border:s.border,borderRadius:s.borderRadius,font:s.font,minHeight:s.minHeight,background:s.backgroundColor,backgroundImage:s.backgroundImage,appearance:s.appearance,boxShadow:s.boxShadow,color:s.color}})}})()`),hit:await evalJS(`document.elementsFromPoint(372,737).slice(0,6).map(e=>({tag:e.tagName,cls:e.className,text:(e.innerText||e.textContent||'').slice(0,70),rect:e.getBoundingClientRect().toJSON(),color:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor,font:getComputedStyle(e).font}))`),focus:await evalJS('document.activeElement?.outerHTML?.slice(0,140)'),text:(await evalJS('document.body.innerText')).slice(0,400)}))
  console.log(JSON.stringify({route:manifest.route,viewport:[vp.width,vp.height],scrollTop,windowY:await evalJS('window.scrollY'),pageTop:await evalJS('document.querySelector(".page-container")?.scrollTop'),htmlClass:await evalJS('document.documentElement.className'),grid:await evalJS(`(()=>{const e=document.querySelector('.workspace-shell'),h=document.querySelector('.desktop-topbar'),m=document.querySelector('.page-container');return {rows:e?getComputedStyle(e).gridTemplateRows:null,cols:e?getComputedStyle(e).gridTemplateColumns:null,header:h?.getBoundingClientRect().toJSON(),main:m?.getBoundingClientRect().toJSON()}})()`),form:await evalJS(`(()=>{const p=document.querySelector('.goal-context-fields');if(!p)return null;return {parent:p.getBoundingClientRect().toJSON(),template:getComputedStyle(p).gridTemplateColumns,children:Array.from(p.children).map(e=>{const s=getComputedStyle(e);return {tag:e.tagName,rect:e.getBoundingClientRect().toJSON(),margin:s.margin,padding:s.padding,border:s.border,borderRadius:s.borderRadius,font:s.font,minHeight:s.minHeight,background:s.backgroundColor,backgroundImage:s.backgroundImage,appearance:s.appearance,boxShadow:s.boxShadow,color:s.color}})}})()`),hit:await evalJS(`document.elementsFromPoint(372,737).slice(0,6).map(e=>({tag:e.tagName,cls:e.className,text:(e.innerText||e.textContent||'').slice(0,70),rect:e.getBoundingClientRect().toJSON(),color:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor,font:getComputedStyle(e).font}))`),focus:await evalJS('document.activeElement?.outerHTML?.slice(0,140)'),text:(await evalJS('document.body.innerText')).slice(0,400)}))
  }
}finally{
  if(socket?.readyState===WebSocket.OPEN)socket.close()
  if(chrome?.exitCode===null){chrome.kill();await new Promise(r=>chrome.once('close',r))}
  const abs=resolve(profile), base=resolve(tmpdir())
  if(abs.startsWith(base+'\\')&&basename(abs).startsWith('calmy-recapture-'))rmSync(abs,{recursive:true,force:true})
}

