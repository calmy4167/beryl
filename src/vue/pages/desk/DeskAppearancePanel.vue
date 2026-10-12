<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { DeskPreferences } from './preferences'

const props = defineProps<{ modelValue: DeskPreferences; saveError: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: DeskPreferences]
  reset: []
  close: []
}>()

const presets = ['#FBFBF8', '#F6F4EC', '#F2EDE0', '#F0EAE3', '#EDF0EA', '#1A1A18', '#131312', '#0E1110']
const fontSizes = [14, 16, 19, 22, 26] as const
const widths = [
  { value: 'full', label: '全宽' },
  { value: 64, label: '宽' },
  { value: 48, label: '标准' },
  { value: 32, label: '窄' },
] as const
const horizontalAlignments = [
  { value: 'left', label: '左' },
  { value: 'center', label: '中' },
  { value: 'right', label: '右' },
  { value: 'justify', label: '两端' },
] as const
const verticalAlignments = [
  { value: 'top', label: '上' },
  { value: 'middle', label: '中' },
  { value: 'bottom', label: '下' },
] as const
const lineSpacings = [1.5, 1.65, 1.85, 2, 2.2] as const
const letterSpacings = [-0.01, 0, 0.02, 0.05, 0.1] as const
const paragraphSpacings = [0, 0.5, 1, 1.5, 2] as const

const prefs = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const closeButton = ref<HTMLButtonElement | null>(null)
const isPresetColor = computed(() => presets.some(color => color.toLowerCase() === prefs.value.background.toLowerCase()))

function patch<K extends keyof DeskPreferences>(key: K, value: DeskPreferences[K]) {
  prefs.value = { ...prefs.value, [key]: value }
}

function closeOnEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', closeOnEscape, true)
  closeButton.value?.focus({ preventScroll: true })
})

onBeforeUnmount(() => document.removeEventListener('keydown', closeOnEscape, true))
</script>

<template>
  <div class="desk-settings-backdrop" @click.self="emit('close')">
    <section
      class="desk-settings"
      role="dialog"
      aria-modal="true"
      aria-labelledby="desk-settings-title"
      tabindex="-1"
    >
      <header class="desk-settings-header">
        <h2 id="desk-settings-title">控制</h2>
        <button ref="closeButton" type="button" class="desk-settings-close" aria-label="关闭外观设置" @click="emit('close')">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
        </button>
      </header>

      <div class="desk-settings-body">
        <fieldset class="desk-settings-group">
          <legend>背景</legend>
          <div class="desk-swatches" aria-label="背景颜色预设">
            <button
              v-for="color in presets"
              :key="color"
              type="button"
              class="desk-swatch"
              :class="{ 'is-selected': prefs.background.toLowerCase() === color.toLowerCase() }"
              :aria-label="`背景色 ${color}`"
              :aria-pressed="prefs.background.toLowerCase() === color.toLowerCase()"
              :style="{ '--swatch-color': color }"
              @click="patch('background', color)"
            />
            <label class="desk-swatch desk-custom-swatch" :class="{ 'is-selected': !isPresetColor }" title="自定义颜色">
              <span aria-hidden="true">＋</span>
              <input
                type="color"
                aria-label="自定义背景颜色"
                :value="prefs.background"
                @input="patch('background', ($event.target as HTMLInputElement).value)"
              >
            </label>
          </div>
        </fieldset>

        <fieldset class="desk-settings-group">
          <legend>字号</legend>
          <div class="desk-options" aria-label="字号">
            <button v-for="size in fontSizes" :key="size" type="button" class="desk-option" :class="{ 'is-selected': prefs.fontSize === size }" :aria-pressed="prefs.fontSize === size" @click="patch('fontSize', size)">{{ size }}</button>
          </div>
        </fieldset>

        <fieldset class="desk-settings-group">
          <legend>宽度</legend>
          <div class="desk-options" aria-label="内容宽度">
            <button v-for="item in widths" :key="item.value" type="button" class="desk-option" :class="{ 'is-selected': prefs.columnWidth === item.value }" :aria-pressed="prefs.columnWidth === item.value" @click="patch('columnWidth', item.value)">{{ item.label }}</button>
          </div>
        </fieldset>

        <fieldset class="desk-settings-group">
          <legend>水平对齐</legend>
          <div class="desk-options" aria-label="水平对齐">
            <button v-for="item in horizontalAlignments" :key="item.value" type="button" class="desk-option" :class="{ 'is-selected': prefs.horizontalAlign === item.value }" :aria-pressed="prefs.horizontalAlign === item.value" @click="patch('horizontalAlign', item.value)">{{ item.label }}</button>
          </div>
        </fieldset>

        <fieldset class="desk-settings-group">
          <legend>垂直位置</legend>
          <div class="desk-options" aria-label="垂直位置">
            <button v-for="item in verticalAlignments" :key="item.value" type="button" class="desk-option" :class="{ 'is-selected': prefs.verticalAlign === item.value }" :aria-pressed="prefs.verticalAlign === item.value" @click="patch('verticalAlign', item.value)">{{ item.label }}</button>
          </div>
        </fieldset>

        <fieldset class="desk-settings-group">
          <legend>行间距</legend>
          <div class="desk-options" aria-label="行间距">
            <button v-for="value in lineSpacings" :key="value" type="button" class="desk-option" :class="{ 'is-selected': prefs.lineSpacing === value }" :aria-pressed="prefs.lineSpacing === value" @click="patch('lineSpacing', value)">{{ value }}</button>
          </div>
        </fieldset>

        <fieldset class="desk-settings-group">
          <legend>字间距 <span>em</span></legend>
          <div class="desk-options" aria-label="字间距">
            <button v-for="value in letterSpacings" :key="value" type="button" class="desk-option" :class="{ 'is-selected': prefs.letterSpacing === value }" :aria-pressed="prefs.letterSpacing === value" @click="patch('letterSpacing', value)">{{ value }}</button>
          </div>
        </fieldset>

        <fieldset class="desk-settings-group">
          <legend>段间距 <span>em</span></legend>
          <div class="desk-options" aria-label="段间距">
            <button v-for="value in paragraphSpacings" :key="value" type="button" class="desk-option" :class="{ 'is-selected': prefs.paragraphSpacing === value }" :aria-pressed="prefs.paragraphSpacing === value" @click="patch('paragraphSpacing', value)">{{ value }}</button>
          </div>
        </fieldset>
      </div>

      <p v-if="saveError" class="desk-settings-error" role="status">设置未能保存，已继续使用当前显示。</p>
      <footer class="desk-settings-footer">
        <button type="button" class="desk-reset" @click="emit('reset')">恢复默认</button>
        <button type="button" class="desk-done" @click="emit('close')">完成</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.desk-settings-backdrop {
  position: fixed;
  z-index: 150;
  inset: 0;
  background: rgb(0 0 0 / 8%);
  animation: desk-backdrop-in 220ms ease-out both;
}

.desk-settings {
  position: absolute;
  inset: 0 0 0 auto;
  display: flex;
  flex-direction: column;
  width: min(24rem, 88vw);
  min-width: 18rem;
  height: 100%;
  overflow: hidden;
  padding: 1.65rem 1.55rem calc(1.5rem + env(safe-area-inset-bottom));
  background: var(--desk-bg, #fbfbf8);
  color: var(--desk-ink, #25251f);
  box-shadow: -1px 0 0 rgb(0 0 0 / 5%), -30px 0 80px rgb(0 0 0 / 12%);
  animation: desk-sheet-in 320ms cubic-bezier(.2, .75, .25, 1) both;
}

.desk-settings-header,
.desk-settings-footer {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.desk-settings-header { min-height: 2.7rem; margin-bottom: 1.1rem; }
.desk-settings-header h2 { margin: 0; font-size: 1.2rem; font-weight: 500; letter-spacing: -.035em; }
.desk-settings-close { display: grid; width: 2rem; height: 2rem; place-items: center; border: 0; border-radius: 50%; background: transparent; color: var(--desk-muted, rgb(37 37 31 / 55%)); cursor: pointer; }
.desk-settings-close:hover { background: var(--desk-faint, rgb(37 37 31 / 8%)); color: var(--desk-ink, #25251f); }
.desk-settings-close svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-width: 1.5; }

.desk-settings-body {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-color: var(--desk-faint, rgb(37 37 31 / 18%)) transparent;
  scrollbar-width: thin;
  padding: 0 .15rem .5rem 0;
}

.desk-settings-group { min-width: 0; margin: 0; padding: 0; border: 0; }
.desk-settings-group + .desk-settings-group { margin-top: 1.45rem; }
.desk-settings-group legend { margin: 0 0 .7rem; padding: 0; color: var(--desk-muted, rgb(37 37 31 / 58%)); font-size: .68rem; font-weight: 550; letter-spacing: .17em; }
.desk-settings-group legend span { letter-spacing: .02em; }
.desk-options, .desk-swatches { display: flex; flex-wrap: wrap; align-items: center; gap: .45rem; }

.desk-option {
  display: inline-flex;
  min-width: 2.65rem;
  height: 2.1rem;
  align-items: center;
  justify-content: center;
  padding: 0 .75rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--desk-faint, rgb(37 37 31 / 12%));
  color: var(--desk-muted, rgb(37 37 31 / 68%));
  font: inherit;
  font-size: .76rem;
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease, box-shadow 150ms ease;
}
.desk-option:hover { color: var(--desk-ink, #25251f); box-shadow: inset 0 0 0 1px var(--desk-muted, rgb(37 37 31 / 45%)); }
.desk-option.is-selected { background: var(--desk-ink, #25251f); box-shadow: none; color: var(--desk-bg, #fbfbf8); }

.desk-swatch {
  position: relative;
  display: grid;
  width: 2rem;
  height: 2rem;
  flex: none;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: var(--swatch-color);
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 7%);
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease;
}
.desk-swatch:hover { transform: scale(1.08); }
.desk-swatch.is-selected { box-shadow: inset 0 0 0 1px rgb(0 0 0 / 7%), 0 0 0 2px var(--desk-bg, #fbfbf8), 0 0 0 3px var(--desk-accent, #718578); }
.desk-custom-swatch { background: transparent; color: var(--desk-muted, rgb(37 37 31 / 65%)); font-size: 1.2rem; font-weight: 300; box-shadow: inset 0 0 0 1px currentColor; overflow: hidden; }
.desk-custom-swatch input { position: absolute; inset: 0; width: 100%; height: 100%; padding: 0; border: 0; opacity: 0; cursor: pointer; }

.desk-settings-error { flex: none; margin: .6rem 0 0; color: #a53e36; font-size: .75rem; }
.desk-settings-footer { margin-top: .65rem; padding-top: 1rem; border-top: 1px solid var(--desk-line, rgb(37 37 31 / 12%)); }
.desk-settings-footer button { min-height: 2.2rem; padding: 0 .95rem; border: 0; border-radius: 999px; background: transparent; color: var(--desk-muted, rgb(37 37 31 / 68%)); font: inherit; font-size: .78rem; cursor: pointer; }
.desk-settings-footer .desk-reset:hover { color: var(--desk-ink, #25251f); background: var(--desk-faint, rgb(37 37 31 / 8%)); }
.desk-settings-footer .desk-done { background: var(--desk-ink, #25251f); color: var(--desk-bg, #fbfbf8); }
.desk-settings-footer .desk-done:hover { opacity: .86; }

.desk-settings button:focus-visible, .desk-custom-swatch:focus-within { outline: 2px solid var(--desk-accent, #718578); outline-offset: 3px; }

@keyframes desk-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes desk-sheet-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
@media (max-width: 420px) {
  .desk-settings { width: 100%; min-width: 0; padding: 1.2rem 1.15rem calc(1rem + env(safe-area-inset-bottom)); }
  .desk-settings-header { margin-bottom: .8rem; }
  .desk-settings-group + .desk-settings-group { margin-top: 1.15rem; }
  .desk-option { min-width: 2.45rem; padding-inline: .62rem; }
}
@media (prefers-reduced-motion: reduce) {
  .desk-settings-backdrop, .desk-settings { animation-duration: 1ms; }
  .desk-option, .desk-swatch { transition-duration: 1ms; }
}
</style>
