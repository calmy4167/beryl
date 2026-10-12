<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { saveFutureFeedback, saveFutureReflection } from '@/application'
import { withSaveState } from '@/core/save-state'
import { choiceOptions, customChoice, horizonOptions, impactProfiles, pathLabels, resolveImpactKey, type FutureReflectionHorizon } from '@/domain/future-lookback/data'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'

// 页面自带头部（参考稿里 .slide-head 属于页面自身），外壳因此不再渲染第二行标题。
useOwnSlideHead()

type Stage = 'intro' | 'scenarios' | 'reflection' | 'saved'
const stage = ref<Stage>('intro')
const horizon = ref<FutureReflectionHorizon>('six-months')
const choice = ref('')
const facts = ref('')
const interpretation = ref('')
const selectedChoice = ref<string | typeof customChoice>('')
const reflection = ref('')
const nextStep = ref('')
const externalUrl = ref('')
const reflectionCaptureId = ref('')
const feedback = ref('')
const feedbackSaving = ref(false)
const feedbackError = ref('')
const feedbackSaved = ref(false)
const feedbackNeedsReflectionResave = ref(false)
const feedbackReflectionResaving = ref(false)
const feedbackRecoveryMessage = ref('')
const showFeedbackForm = ref(false)
const saving = ref(false)
const error = ref('')
const stageHeading = ref<HTMLElement | null>(null)
const choiceInput = ref<HTMLTextAreaElement | null>(null)
const impactKey = computed(() => resolveImpactKey(selectedChoice.value, choice.value))
const impactProfile = computed(() => impactProfiles[impactKey.value])
const horizonImpact = computed(() => impactProfile.value.horizons[horizon.value])
const pathLabel = computed(() => pathLabels[impactKey.value])
const showContextFields = computed(() => selectedChoice.value !== '')
watch(stage, () => { void nextTick(() => stageHeading.value?.focus()) })

function selectChoice(value: string | typeof customChoice, text = ''): void {
  if (selectedChoice.value !== value) { selectedChoice.value = value; choice.value = text; facts.value = ''; interpretation.value = '' }
  if (value === customChoice) void nextTick(() => choiceInput.value?.focus())
}
function scenario(): void { if (choice.value.trim()) stage.value = 'scenarios' }
function startReflection(): void { stage.value = 'reflection'; error.value = '' }
async function submitReflection(): Promise<void> {
  if (!choice.value.trim()) { error.value = '先写下你想回头看的选择，再保存。'; return }
  if (!reflection.value.trim()) { error.value = '先写下看过这些可能后的想法，再保存。'; return }
  saving.value = true; error.value = ''
  try {
    const saved = await withSaveState(() => saveFutureReflection({ choice: choice.value, facts: facts.value, interpretation: interpretation.value, reflection: reflection.value, nextStep: nextStep.value, externalUrl: externalUrl.value }))
    reflectionCaptureId.value = saved.calmyId
    stage.value = 'saved'
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '保存失败，请重试。' }
  finally { saving.value = false }
}
async function submitFeedback(): Promise<void> {
  if (!reflectionCaptureId.value) { feedbackNeedsReflectionResave.value = true; feedbackError.value = '找不到对应的选择记录。你可以用当前页面保留的内容重新保存选择和反思。'; return }
  feedbackSaving.value = true; feedbackError.value = ''; feedbackRecoveryMessage.value = ''
  try { await withSaveState(() => saveFutureFeedback({ reflectionCaptureId: reflectionCaptureId.value, feedback: feedback.value })); feedbackSaved.value = true; showFeedbackForm.value = false }
  catch (cause) { feedbackError.value = cause instanceof Error ? cause.message : '反馈保存失败，请重试。'; if (cause instanceof Error && cause.message.includes('原选择记录已不存在')) feedbackNeedsReflectionResave.value = true }
  finally { feedbackSaving.value = false }
}
async function resaveReflection(): Promise<void> {
  if (!choice.value.trim() || !reflection.value.trim()) { feedbackError.value = '当前页面缺少选择或反思内容，请先补充后再保存。'; return }
  feedbackReflectionResaving.value = true; feedbackError.value = ''; feedbackRecoveryMessage.value = ''
  try { const saved = await withSaveState(() => saveFutureReflection({ choice: choice.value, facts: facts.value, interpretation: interpretation.value, reflection: reflection.value, nextStep: nextStep.value, externalUrl: externalUrl.value })); reflectionCaptureId.value = saved.calmyId; feedbackNeedsReflectionResave.value = false; feedbackRecoveryMessage.value = '选择和反思已重新保存，可以继续保存上面的反馈。' }
  catch (cause) { feedbackError.value = cause instanceof Error ? cause.message : '重新保存失败，请重试。' }
  finally { feedbackReflectionResaving.value = false }
}
function startOver(): void { stage.value = 'intro'; facts.value = ''; interpretation.value = ''; reflection.value = ''; nextStep.value = ''; externalUrl.value = ''; reflectionCaptureId.value = ''; feedback.value = ''; feedbackSaved.value = false; feedbackNeedsReflectionResave.value = false; feedbackRecoveryMessage.value = ''; showFeedbackForm.value = false; feedbackError.value = '' }
function gains(side: 'action' | 'inaction') { return horizonImpact.value[side].filter(item => side === 'action' ? item.kind !== 'cost' : item.kind === 'gain') }
function costs(side: 'action' | 'inaction') { return horizonImpact.value[side].filter(item => side === 'action' ? item.kind === 'cost' : item.kind !== 'gain') }
</script>

<template>
  <div class="future-page">
    <header class="slide-head future-page-head">
      <div class="head-main">
        <p class="hint">未来 · 试验</p>
        <div class="head-title-row">
          <h2>先去未来看看，再回来决定。</h2>
          <span class="info" tabindex="0" data-tip="行动和暂缓，都可能有收获，也可能有代价。这里给出的是有条件的可能性，不是结果保证。H 收起辅助信息。" aria-label="未来说明">i</span>
        </div>
      </div>
      <RouterLink class="future-text-link chip" to="/app/today">回到今天</RouterLink>
    </header>
    <section v-if="stage === 'intro'" class="future-intro panel"><span class="future-example-label">第一步</span><h2 ref="stageHeading" tabindex="-1" >你想提前想想什么？</h2><p>选项可以修改，也可以自己填写。</p><div class="future-choice-options" role="group" aria-label="选择一个想回头看的事情"><button v-for="option in choiceOptions" :key="option.value" type="button" :class="{ selected: selectedChoice === option.value }" :aria-pressed="selectedChoice === option.value" @click="selectChoice(option.value, option.text)">{{ option.label }}</button><button type="button" :class="{ selected: selectedChoice === customChoice }" :aria-pressed="selectedChoice === customChoice" @click="selectChoice(customChoice)">自己填写</button></div><label class="future-choice-label">你的选择<textarea ref="choiceInput" v-model="choice" @input="selectedChoice = customChoice" maxLength="120" rows="2" placeholder="写下一件你正在考虑的事" /></label><div v-if="showContextFields" class="future-context-fields"><label class="future-choice-label">已经发生的事（可选）<textarea v-model="facts" maxLength="500" rows="2" placeholder="例如：我看到了一个岗位，要求有……" /></label><label class="future-choice-label">我的理解或担心（可选）<textarea v-model="interpretation" maxLength="500" rows="2" placeholder="例如：我担心自己的经验还不够……" /></label></div><div class="future-choice-meta"><span>{{ impactKey === 'custom' ? '自定义内容需要先查证事实，当前原型不会编造结果。' : '后面会展示这类选择的具体影响链。' }}</span><span>{{ choice.length }}/120</span></div><div class="future-time-picker"><b>从什么时候回头看？</b><div class="future-horizons" role="group" aria-label="选择回望时间"><button v-for="option in horizonOptions" :key="option.value" type="button" :class="{ selected: horizon === option.value }" :aria-pressed="horizon === option.value" @click="horizon = option.value">{{ option.label }}</button></div></div><p class="future-boundary-note">这些是有条件的可能性，不是结果保证；本页不会根据你的个人情况预测结果。</p><button class="future-primary chip on" type="button" :disabled="!choice.trim()" @click="scenario">开始体验</button></section>
    <section v-else-if="stage === 'scenarios'" class="future-scenarios"><div class="future-section-head"><div><span class="future-example-label">影响推演</span><h2 ref="stageHeading" tabindex="-1" >如果从{{ horizonOptions.find(option => option.value === horizon)?.label }}回头看</h2><p>「{{ choice }}」可能带来的收获与代价。</p></div><div class="future-horizons" role="group" aria-label="选择回望时间"><button v-for="option in horizonOptions" :key="option.value" type="button" :class="{ selected: horizon === option.value }" :aria-pressed="horizon === option.value" @click="horizon = option.value">{{ option.label }}</button></div></div><aside v-if="facts.trim() || interpretation.trim()" class="future-context-summary" aria-label="你补充的背景"><b>你补充的背景</b><p v-if="facts.trim()"><strong>已经发生的事：</strong>{{ facts }}</p><p v-if="interpretation.trim()"><strong>你的理解或担心：</strong>{{ interpretation }}</p></aside><p v-if="impactKey !== 'work' && impactKey !== 'custom'" class="future-boundary-note">目前只有工作预设补齐了两种选择各自的收获与代价；其他预设尚未完成平衡复核。</p><p v-if="impactKey === 'custom'" class="future-boundary-note">这条自定义内容没有可用事实依据，下面只说明为什么暂停推演，不代表未来结果。</p><div class="future-path-grid"><article v-for="side in (['action', 'inaction'] as const)" :key="side" class="future-path panel"><header><span>{{ pathLabel[side] }}</span><h3 >{{ side === 'action' ? impactProfile.actionTitle : impactProfile.inactionTitle }}</h3></header><template v-if="impactKey === 'custom'"><section v-for="item in horizonImpact[side]" :key="item.title" class="future-possibility future-uncertain"><h4>{{ item.title }}</h4><p>{{ item.body }}</p></section></template><template v-else><div v-if="side === 'action' || gains(side).length" class="future-impact-group"><h4>可能收获</h4><section v-for="item in gains(side)" :key="item.title" class="future-possibility future-glad"><h5>{{ item.title }}</h5><p>{{ item.body }}</p></section></div><div v-if="side === 'inaction' || costs(side).length" class="future-impact-group"><h4>可能代价</h4><section v-for="item in costs(side)" :key="item.title" class="future-possibility future-regret"><h5>{{ item.title }}</h5><p>{{ item.body }}</p></section></div></template></article></div><aside v-if="impactProfile.sources.length" class="future-evidence" aria-label="推演依据"><b>推演依据</b><ul><li v-for="source in impactProfile.sources" :key="source.url"><a :href="source.url" target="_blank" rel="noreferrer">{{ source.label }}</a><span>{{ source.note }}</span></li></ul></aside><p class="future-boundary-note">每条都是一种可能，不代表唯一未来。工作预设使用一般求职步骤，不包含你所在地区的岗位或薪酬数据。</p><div class="future-actions"><button class="future-secondary chip" type="button" @click="stage = 'intro'">修改这件事</button><button class="future-primary chip on" type="button" @click="startReflection">回到我现在的想法</button></div></section>
    <section v-else-if="stage === 'reflection'" class="future-reflection panel"><span class="future-example-label">回到今天</span><h2 ref="stageHeading" tabindex="-1" >看过可能的收获和代价，你现在怎么想？</h2><p>你在想的是：「{{ choice }}」。写下哪些结果对你重要，以及你准备怎样回应。</p><form @submit.prevent="void submitReflection()"><label>此刻的想法<textarea v-model="reflection" rows="4" placeholder="例如：我想试一小步，看看它是否真的重要……" required :disabled="saving" /></label><label>我准备的下一步（可选）<input v-model="nextStep" placeholder="例如：这周先留出一个晚上" :disabled="saving" /></label><label>我准备查看的链接（可选）<input v-model="externalUrl" type="url" maxLength="1000" placeholder="https://…" :disabled="saving" /></label><small class="future-save-note">保存后链接会和你的反思一起保存；Calmy 不会读取链接内容。</small><p v-if="error" class="future-error" role="alert">{{ error }}</p><div class="future-actions"><button class="future-secondary chip" type="button" @click="stage = 'scenarios'; error = ''">再看一次</button><button class="future-primary chip on" type="submit" :disabled="saving || !reflection.trim()">{{ saving ? '正在保存…' : '保存我的反思' }}</button></div></form><small class="future-save-note">确认保存时会一并保存你填写的事实、理解、选择和反思；推演内容和来源不会保存。</small></section>
    <section v-else class="future-saved panel"><span class="future-saved-mark">✓</span><h2 ref="stageHeading" tabindex="-1" >选择和反思已保存</h2><p>你可以稍后查看原文；推演内容没有保存。</p><p v-if="externalUrl.trim()"><a class="future-secondary chip" :href="externalUrl" target="_blank" rel="noopener noreferrer">打开我选的链接</a></p><p>回来后可以在这里记下现实反馈；Calmy 不会自动读取外部工具。</p><p v-if="feedbackSaved" class="future-feedback-saved" role="status">现实反馈已另存，可在已保存的内容中查看。</p><div v-else class="future-feedback-entry"><button v-if="!showFeedbackForm" class="future-secondary chip" type="button" @click="showFeedbackForm = true">记录后来发生的事</button><form v-else @submit.prevent="void submitFeedback()"><label>后来现实中发生了什么？<textarea v-model="feedback" rows="3" maxLength="2000" placeholder="例如：我查看了岗位要求，发现……" required :disabled="feedbackSaving" /></label><small class="future-save-note">这条反馈会另存为一条内容，并附上这次选择记录的编号，方便之后对照。</small><p v-if="feedbackError" class="future-error" role="alert">{{ feedbackError }}</p><button v-if="feedbackNeedsReflectionResave" class="future-secondary chip" type="button" :disabled="feedbackReflectionResaving" @click="void resaveReflection()">{{ feedbackReflectionResaving ? '正在重新保存…' : '用当前内容重新保存选择和反思' }}</button><p v-if="feedbackRecoveryMessage" class="future-feedback-saved" role="status">{{ feedbackRecoveryMessage }}</p><div class="future-actions"><button class="future-secondary chip" type="button" :disabled="feedbackSaving" @click="showFeedbackForm = false">稍后再记</button><button class="future-primary chip on" type="submit" :disabled="feedbackSaving || !feedback.trim()">{{ feedbackSaving ? '正在保存…' : '保存现实反馈' }}</button></div></form></div><div class="future-actions"><RouterLink class="future-secondary chip" to="/app/capture">查看已保存的内容</RouterLink><RouterLink class="future-primary chip on" to="/app/today">回到今天</RouterLink><button class="future-text-link" type="button" @click="startOver">再体验一次</button></div></section>
  </div>
</template>

<style scoped>
/* 迁移说明：本文件里 `@media (max-width: 620px)` 与 `.future-page h2[tabindex="-1"]:focus-visible`
   这两条规则被 vue-future-parity 以**源码字符串**断言，必须原样保留。
   其余 `future-*` 类词汇保留（测试钩子），颜色一律换成「留白」令牌。 */
.future-page { display: flex; flex-direction: column; gap: clamp(8px, 1.2vh, 14px); max-width: none; }
.future-page-head h2 { font-size: clamp(1.4rem, 3vw, 2rem); }

.future-intro, .future-reflection, .future-saved { width: 100%; max-width: 740px; margin: 0 auto; gap: 10px; }
/* 这些 pill / CTA 是 flex 列里的直接子元素：用 align-self 而不是 justify-self（后者只在 grid 里生效）。 */
.future-example-label { align-self: flex-start; padding: 4px 10px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: .66rem; letter-spacing: .1em; }
.future-intro > .future-primary { align-self: flex-start; }
.future-intro h2, .future-reflection h2, .future-saved h2 { margin: 0; font-size: clamp(1.2rem, 2.6vw, 1.6rem); line-height: 1.35; }
.future-intro > p, .future-reflection > p, .future-saved > p { margin: 0; max-width: 620px; color: var(--muted); font-size: .82rem; line-height: 1.75; }

.future-choice-options, .future-horizons, .future-actions { display: flex; flex-wrap: wrap; gap: 7px; }
.future-choice-options button, .future-horizons button { padding: 6px 12px; border: 1px solid var(--line); border-radius: 999px; background: none; color: var(--muted); font: inherit; font-size: .76rem; cursor: pointer; }
.future-choice-options button.selected, .future-horizons button.selected { border-color: var(--accent); background: var(--panel-2); color: var(--fg); font-weight: 600; }
.future-choice-label, .future-feedback-entry label { display: grid; gap: 6px; color: var(--muted); font-size: .72rem; }
.future-choice-label textarea, .future-choice-label input, .future-reflection textarea, .future-reflection input, .future-feedback-entry textarea { padding: 8px 10px; font: inherit; font-size: .82rem; }
.future-choice-meta, .future-save-note { display: flex; justify-content: space-between; gap: 10px; color: var(--muted); font-size: .68rem; }
.future-time-picker { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
.future-time-picker > b { color: var(--fg); font-size: .78rem; }
.future-context-fields { display: grid; gap: 10px; }
.future-boundary-note { margin: 0; color: var(--muted); font-size: .72rem; line-height: 1.7; }
.future-error { margin: 0; color: var(--danger); font-size: .78rem; }

.future-scenarios { display: grid; gap: 12px; }
.future-section-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; }
.future-section-head h2 { margin: 6px 0 4px; font-size: clamp(1.2rem, 2.6vw, 1.6rem); }
.future-section-head p { margin: 0; color: var(--muted); font-size: .82rem; }
.future-context-summary { padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel-2); }
.future-context-summary b { color: var(--fg); font-size: .8rem; }
.future-context-summary p { margin: 6px 0 0; color: var(--muted); font-size: .78rem; line-height: 1.7; }
.future-path-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: clamp(10px, 1.2vw, 14px); align-items: start; }
.future-path header { display: grid; gap: 4px; }
.future-path header span { color: var(--muted); font-size: .68rem; letter-spacing: .1em; text-transform: uppercase; }
.future-path h3 { margin: 0; font-size: 1rem; }
.future-impact-group { display: grid; gap: 8px; margin-top: 8px; }
.future-impact-group h4 { margin: 0; color: var(--muted); font-size: .72rem; letter-spacing: .1em; }
.future-possibility { padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-2); }
.future-possibility h5, .future-possibility h4 { margin: 0 0 4px; font-size: .84rem; }
.future-possibility p { margin: 0; color: var(--muted); font-size: .78rem; line-height: 1.7; }
.future-possibility.future-glad { border-left: 2px solid var(--accent); }
.future-possibility.future-cost { border-left: 2px solid var(--danger); }
.future-possibility.future-uncertain { border-left: 2px dashed var(--line-strong); }

.future-saved { gap: 10px; }
.future-saved-mark { align-self: flex-start; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--accent); color: var(--accent-fg); }
.future-feedback-entry, .future-feedback-saved { display: grid; gap: 8px; }
.future-feedback-saved { color: var(--accent); font-size: .78rem; }

@media (max-width: 620px) {
  .future-page h2[tabindex="-1"]:focus-visible {
    outline: 1px auto -webkit-focus-ring-color;
    outline-color: #e59700;
  }
}
</style>
