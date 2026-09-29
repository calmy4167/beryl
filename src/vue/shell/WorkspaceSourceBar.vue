<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { feishuWorkspace } from '@/domain/feishu/workspace-instance'
import type { WorkspaceSnapshot } from '@/core/feishu/workspace'

const key = 'calmy:workspace:source'
const eventName = 'calmy-workspace-source'
const source = ref<'local'|'feishu'>(readSource())
const snapshot = ref<WorkspaceSnapshot>(feishuWorkspace.getSnapshot())
let stop: (()=>void)|undefined
function readSource(): 'local'|'feishu' { try { return localStorage.getItem(key)==='feishu'?'feishu':'local' } catch { return 'local' } }
function sync() { source.value=readSource() }
function choose(value:'local'|'feishu') { try { localStorage.setItem(key,value);source.value=value;window.dispatchEvent(new Event(eventName)) } catch { window.dispatchEvent(new CustomEvent('beryl-toast',{detail:{message:'浏览器无法保存来源选择，请允许网站存储。',kind:'error'}})) } }
onMounted(()=>{stop=feishuWorkspace.subscribe(()=>{snapshot.value=feishuWorkspace.getSnapshot()});window.addEventListener(eventName,sync);window.addEventListener('storage',sync)})
onUnmounted(()=>{stop?.();window.removeEventListener(eventName,sync);window.removeEventListener('storage',sync)})
</script>
<template>
  <section class="beryl-card workspace-source" aria-label="数据来源"><div><b>数据来源</b><div class="range-tabs" role="group" aria-label="选择数据来源"><button type="button" :aria-pressed="source==='local'" :class="{on:source==='local'}" :disabled="snapshot.saving" @click="choose('local')">本地</button><button type="button" :aria-pressed="source==='feishu'" :class="{on:source==='feishu'}" :disabled="snapshot.saving" @click="choose('feishu')">飞书</button></div></div><small>{{source==='feishu'?'任务直接保存在飞书；前台每 15 秒检查更新。':'保留原有本机数据；切换来源不会迁移或删除数据。'}}</small><RouterLink to="/app/admin">连接设置 →</RouterLink><RouterLink to="/app/feishu">飞书 →</RouterLink></section>
</template>
