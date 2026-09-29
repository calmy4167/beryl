from pathlib import Path
p=Path('src/vue/pages/TaskBoardPage.vue')
s=p.read_text(encoding='utf-8')
s=s.replace("import CalmySelect from '@/vue/components/CalmySelect.vue'\n", '')
s=s.replace('<CalmySelect id="board-matter-filter" ariaLabel="按事项筛选" v-model="matterFilter" :options="matterOptions"/>', '<select id="board-matter-filter" aria-label="按事项筛选" v-model="matterFilter"><option value="">全部事项</option><option v-for="matter in matters.filter(item => item.status !== \'archived\')" :key="matter.calmyId" :value="matter.calmyId">{{ matter.title }}</option></select>')
s=s.replace('<CalmySelect :id="`task-board-status-${item.calmyId}`" :ariaLabel="`${item.title}状态`" :model-value="item.status" :options="statusOptions" :disabled="busy===item.calmyId" @change="move(item, $event as ActionStatus)"/>', '<select :aria-label="`${item.title}状态`" :value="item.status" :disabled="busy===item.calmyId" @change="move(item, ($event.target as HTMLSelectElement).value as ActionStatus)"><option v-for="option in columns" :key="option.status" :value="option.status">{{ option.label }}</option></select>')
p.write_text(s, encoding='utf-8')

p=Path('src/styles/controls.css')
s=p.read_text(encoding='utf-8')
needle='/* Graph and Finance use native controls in the React parity reference.'
addition='''/* The React task board uses compact native selectors, with different sizes in its toolbar and cards. */
html.tactile-ui #app .page-container .task-board-page .task-board-toolbar select {
  min-height: 38px;
  padding: 8px 10px;
  border-radius: 8px;
  background-color: var(--c-bg);
  background-image: none;
  appearance: auto;
}
html.tactile-ui #app .page-container .task-board-page .task-board-card-footer select {
  min-height: 0;
  padding: 5px 18px 5px 6px;
  border-radius: 6px;
  background-color: var(--c-bg);
  background-image: none;
  appearance: auto;
  color: var(--c-text-2);
  max-width: 88px;
}

'''
if addition not in s: s=s.replace(needle,addition+needle)
p.write_text(s, encoding='utf-8')
