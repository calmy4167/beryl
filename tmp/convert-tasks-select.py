from pathlib import Path
p=Path('src/vue/pages/TasksPage.vue')
s=p.read_text(encoding='utf-8')
s=s.replace("const matterPicker = ref<HTMLElement | null>(null)\nconst pickerOpen = ref(false)\nconst activeMatter = ref('')\n", '')
s=s.replace("const selectedMatter = computed(() => matterOptions.value.find(item => item.value === matterId.value)?.label || '不关联课题')\n", '')
s=s.replace("onMounted(() => { void refresh(); document.addEventListener('pointerdown', closeOnOutside) })\nonUnmounted(() => { document.removeEventListener('pointerdown', closeOnOutside) })\nfunction closeOnOutside(event: PointerEvent): void {\n  if (!matterPicker.value?.contains(event.target as Node)) pickerOpen.value = false\n}\nfunction chooseMatter(value: string): void { matterId.value = value; pickerOpen.value = false }\nfunction pickerKeydown(event: KeyboardEvent): void {\n  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {\n    event.preventDefault()\n    const values = matterOptions.value.map(item => item.value)\n    const current = values.indexOf(pickerOpen.value ? activeMatter.value : matterId.value)\n    activeMatter.value = values[(current + (event.key === 'ArrowDown' ? 1 : -1) + values.length) % values.length] ?? ''\n    pickerOpen.value = true\n  } else if (event.key === 'Home' || event.key === 'End') {\n    event.preventDefault(); activeMatter.value = (event.key === 'Home' ? matterOptions.value[0] : matterOptions.value.at(-1))?.value ?? ''; pickerOpen.value = true\n  } else if (event.key === 'Enter' || event.key === ' ') {\n    event.preventDefault()\n    if (pickerOpen.value) chooseMatter(activeMatter.value)\n    else { activeMatter.value = matterId.value; pickerOpen.value = true }\n  } else if (event.key === 'Escape' || event.key === 'Tab') pickerOpen.value = false\n}\n", "onMounted(() => { void refresh() })\n")
old='''        <div ref="matterPicker" class="calmy-select" data-calmy-select>
          <button id="tasks-matter-select" class="calmy-select__trigger" type="button" role="combobox" aria-label="关联处境" aria-haspopup="listbox" :aria-expanded="pickerOpen" aria-controls="tasks-matter-listbox" :aria-activedescendant="pickerOpen ? `tasks-matter-listbox-${encodeURIComponent(activeMatter)}` : undefined" :disabled="saving" @click="activeMatter = matterId; pickerOpen = !pickerOpen" @keydown="pickerKeydown">
            <span class="calmy-select__value">{{ selectedMatter }}</span><svg class="calmy-select__chevron" :class="{ 'is-open': pickerOpen }" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
          </button>
          <div v-if="pickerOpen" class="calmy-select__popup"><div id="tasks-matter-listbox" role="listbox" aria-labelledby="tasks-matter-select" class="calmy-select__listbox">
            <div v-for="option in matterOptions" :id="`tasks-matter-listbox-${encodeURIComponent(option.value)}`" :key="option.value" role="option" :aria-selected="option.value === matterId" :data-value="option.value" class="calmy-select__option" :class="{ 'is-selected': option.value === matterId, 'is-active': option.value === activeMatter }" @mouseenter="activeMatter = option.value" @mousedown.prevent @click="chooseMatter(option.value)"><span>{{ option.label }}</span><span class="calmy-select__check" aria-hidden="true" /></div>
          </div></div>
        </div>'''
new='''        <select v-model="matterId" aria-label="关联处境" :disabled="saving">
          <option v-for="option in matterOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>'''
if old not in s: raise SystemExit('matter picker template not found')
s=s.replace(old,new)
p.write_text(s, encoding='utf-8')
