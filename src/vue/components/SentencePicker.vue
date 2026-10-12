<script setup lang="ts">
/**
 * 常用句选择器（「插入常用句」）。
 *
 * 素材来自 unified resource：`kind === 'template'` 且 `status === 'active'`（已归档的不显示）。
 * 组件只负责"选一句"，**插入与光标恢复由父组件做**（父组件才知道自己的输入框与记住的选区）：
 * 选中时 `emit('insert', label)`，父组件把文本插进编辑器再把焦点/光标放回去。
 *
 * 迁移说明：这个能力原本内联在旧 `CapturePage.vue` / `DiaryPage.vue` 里，v11 迁移时两页都漏掉了；
 * 第 29 轮抽成共享组件，两页复用（旧页面还有"浏览全部"抽屉与 aria-activedescendant 级别的键盘协议，
 * 这里实现了列表内的 ↑/↓/Enter/Esc，抽屉那套没有搬，见交接文档 §4.2）。
 */
import { computed, onMounted, ref } from 'vue'
import { unifiedAsyncRepository, type Resource } from '@/domain/unified'
import '@/styles/shared/master-data-picker.css'

const props = withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false })
const emit = defineEmits<{ insert: [text: string] }>()

const sentences = ref<Array<{ id: string; label: string; detail: string }>>([])
const query = ref('')
const open = ref(false)
const activeIndex = ref(0)

const matches = computed(() => {
  const term = query.value.trim().toLocaleLowerCase()
  const all = sentences.value.filter(item => !term || `${item.label} ${item.detail}`.toLocaleLowerCase().includes(term))
  return all.slice(0, 20)
})

async function loadSentences() {
  const resources = await unifiedAsyncRepository.list<Resource>('resource')
  sentences.value = resources
    .filter(item => item.kind === 'template' && item.status === 'active')
    .map(item => ({ id: item.calmyId, label: item.body || item.title, detail: item.title }))
}
onMounted(() => { void loadSentences() })

function move(step: number) {
  if (!matches.value.length) return
  activeIndex.value = (activeIndex.value + step + matches.value.length) % matches.value.length
}
function choose(item?: { label: string }) {
  const target = item || matches.value[activeIndex.value]
  if (!target) return
  query.value = ''
  open.value = false
  emit('insert', target.label)
}
defineExpose({ loadSentences })
</script>

<template>
  <div class="master-picker sentence-picker">
    <input
      v-model="query"
      class="master-picker-field"
      type="text"
      :disabled="props.disabled"
      aria-label="插入常用句"
      placeholder="插入常用句…"
      @focus="open = true"
      @input="open = true; activeIndex = 0"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter.prevent="choose()"
      @keydown.esc="open = false"
      @blur="open = false"
    >
    <ul v-if="open && matches.length" class="sentence-options" role="listbox" aria-label="常用句选项">
      <li v-for="(item, index) in matches" :key="item.id">
        <button
          type="button"
          role="option"
          :data-item-id="item.id"
          :aria-current="index === activeIndex ? 'true' : undefined"
          @mousedown.prevent="choose(item)"
          @click="choose(item)"
        >{{ item.label }}</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.sentence-picker {
  position: relative;
  flex: 0 0 auto;
}
.sentence-options {
  position: absolute;
  z-index: 20;
  bottom: calc(100% + 6px);
  left: 0;
  min-width: 16em;
  max-height: 15em;
  overflow: auto;
  margin: 0;
  padding: 4px;
  list-style: none;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
  box-shadow: 0 12px 28px rgb(0 0 0 / 35%);
}
.sentence-options button {
  display: block;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 7px;
  background: none;
  color: var(--fg);
  font: inherit;
  font-size: 0.78rem;
  text-align: left;
  cursor: pointer;
}
.sentence-options button:hover,
.sentence-options button[aria-current='true'] {
  background: var(--panel-2);
}
</style>
