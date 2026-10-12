<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ modelValue: string; busy: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
  submit: [body: string]
  'upgrade-last': []
  activity: []
}>()

const editor = ref<HTMLDivElement | null>(null)
const value = computed({ get: () => props.modelValue, set: next => emit('update:modelValue', next) })

function content(): string {
  return (editor.value?.innerText || '').replace(/\u200B/g, '').replace(/\n+$/, '')
}

function render(value: string) {
  const node = editor.value
  if (!node) return
  if (!value) { node.replaceChildren(); return }
  const fragment = document.createDocumentFragment()
  for (const line of value.split('\n')) {
    const paragraph = document.createElement('div')
    if (line) paragraph.textContent = line
    else paragraph.append(document.createElement('br'))
    fragment.append(paragraph)
  }
  node.replaceChildren(fragment)
}

function onInput() { value.value = content(); emit('activity') }

function focus() { editor.value?.focus() }
function blur() { editor.value?.blur() }
defineExpose({ focus, blur })

function onPaste(event: ClipboardEvent) {
  event.preventDefault()
  const text = event.clipboardData?.getData('text/plain') || ''
  document.execCommand('insertText', false, text)
  onInput()
}

function onKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  if (event.key !== 'Enter' || event.metaKey || event.ctrlKey) return
  if (event.altKey) {
    event.preventDefault()
    document.execCommand('insertParagraph', false)
    onInput()
    return
  }
  if (event.shiftKey) return
  event.preventDefault()
  event.stopPropagation()
  const body = content().trim()
  if (body && !props.busy) emit('submit', body)
  else if (!body) emit('upgrade-last')
}

watch(() => props.modelValue, next => {
  if (content() !== next) render(next)
})

onMounted(() => {
  render(props.modelValue)
  requestAnimationFrame(() => editor.value?.focus())
})
onBeforeUnmount(() => { editor.value = null })
</script>

<template>
  <div class="desk-composer" :aria-busy="busy ? 'true' : 'false'">
    <div
      id="desk-composer-input"
      ref="editor"
      class="desk-composer-editor"
      :class="{ 'is-empty': !modelValue }"
      contenteditable="true"
      role="textbox"
      aria-multiline="true"
      aria-label="记录此刻正在面对的事情"
      data-placeholder="回车记录 · 连按两次回车建任务 · Alt+回车换行"
      spellcheck="false"
      @input="onInput"
      @paste="onPaste"
      @keydown="onKeydown"
    />
  </div>
</template>

<style scoped>
.desk-composer { display: flex; flex: 1 1 auto; flex-direction: column; width: 100%; min-width: 0; }
.desk-composer-editor {
  flex: none;
  width: 100%;
  min-height: 1lh;
  overflow-y: auto;
  padding: 0 2px;
  border: 0;
  outline: 0;
  color: inherit;
  font: inherit;
  line-height: inherit;
  letter-spacing: inherit;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  caret-color: var(--desk-accent);
}
.desk-composer-editor.is-empty::before {
  color: color-mix(in srgb, currentColor 34%, transparent);
  content: attr(data-placeholder);
  pointer-events: none;
}
.desk-composer-editor > :deep(div), .desk-composer-editor > :deep(p) {
  min-height: 1em;
  margin: 0 0 var(--desk-paragraph-spacing, 0em);
}
.desk-composer-editor > :deep(div:last-child), .desk-composer-editor > :deep(p:last-child) { margin-bottom: 0; }
@media (max-width: 620px) {
  .desk-composer-editor { min-height: 1lh; }
}
</style>
