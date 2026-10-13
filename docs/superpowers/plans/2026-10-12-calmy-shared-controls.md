# Calmy Shared Controls Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with review checkpoints. Steps use checkbox syntax for tracking.

**Goal:** Establish reusable Calmy field, input, select, button, and panel composition patterns, then apply them to People and Finance.

**Architecture:** Build thin Vue components around the existing native controls and custom combobox. `CalmyField` provides shared accessibility context; `CalmyInput` and `CalmySelect` consume it. Keep domain behavior in the pages and extend `LbPanel` only with an optional header-actions slot.

**Tech Stack:** Vue 3.5, TypeScript, existing Calmy CSS tokens and custom controls.

**Spec:** `docs/superpowers/specs/2026-10-12-calmy-shared-controls.md`

## Global Constraints

- Do not add another UI component library.
- Preserve current repository calls, data models, validation, accessibility behavior, route behavior, and destructive-action flows.
- Do not add or run automated tests unless the user asks.
- Preserve all existing uncommitted work; do not stage, commit, or push changes.

---

### Task 1: Shared field context and field/input/button primitives

**Files:**
- Add: `src/vue/components/calmy-field-context.ts`
- Add: `src/vue/components/CalmyField.vue`
- Add: `src/vue/components/CalmyInput.vue`
- Add: `src/vue/components/CalmyButton.vue`
- Add: `src/vue/components/CalmyNativeSelect.vue`

**Interfaces:**
- `CalmyField` props: `id?: string`, `label: string`, `hint?: string`, `error?: string`, `required?: boolean`.
- `CalmyInput` props: `modelValue: string | number`, `type?: string`, `multiline?: boolean`; emits `update:modelValue` with a string.
- `CalmyButton` props: `type?: 'button' | 'submit' | 'reset'`, `variant?: 'default' | 'primary' | 'danger' | 'active'`, `loading?: boolean`, `disabled?: boolean`.
- `CalmyNativeSelect` keeps native select validation and accepts its `<option>` elements through the default slot.
- Field context carries `controlId`, `labelId`, `describedBy`, `required`, and `invalid` refs/computed values.

- [x] Add typed context and a field wrapper that renders label, slot, hint, and error with connected ids.
- [x] Add a native input/textarea wrapper that inherits attrs and binds field id, required, described-by, and invalid state.
- [x] Add a native button wrapper that keeps the existing `chip` styling hooks and blocks activation while loading or disabled.
- [x] Add a native select wrapper that retains browser validation and shares the field accessibility context.
- [x] Add focused shared CSS for field spacing and error/help text using current theme tokens.

### Task 2: Integrate the field contract with CalmySelect and panel composition

**Files:**
- Modify: `src/vue/components/CalmySelect.vue`
- Modify: `src/vue/liubai/LbPanel.vue`

**Interfaces:**
- `CalmySelect` retains its existing options, model, emitted `change`, compact, name, and keyboard behavior; `id` and `ariaLabel` may be omitted when a `CalmyField` parent provides label context.
- `LbPanel` adds optional `#header-actions` while keeping its title, note, noteTip, grow, and default slot unchanged.

- [x] Resolve select ids and accessible label/description/state from local props first, then the injected field context.
- [x] Keep the existing combobox DOM hooks and keyboard interactions unchanged.
- [x] Add a header actions slot aligned with the existing panel heading and render it only when supplied.

### Task 3: Migrate People and Finance representative pages

**Files:**
- Modify: `src/vue/pages/PeoplePage.vue`
- Modify: `src/vue/pages/FinancePage.vue`

**Interfaces:**
- Preserve all current `v-model` targets, form submit handlers, filter values, dynamic options, business methods, and emitted events.
- Use `CalmyField` + `CalmyInput` or `CalmyNativeSelect` for text/date/amount/search/filter/relation controls; keep the checkbox semantics native.
- Use `CalmyButton` for page actions while preserving `chip`, `on`, `danger`, accessible labels, disabled conditions, confirmation, and undo flow.

- [x] Migrate People important-date and person forms, search/filter controls, and action buttons.
- [x] Migrate Finance entry fields, list filter, relation control, and action buttons.
- [x] Update page-local layout selectors to target the shared field wrappers without changing responsive grouping.

### Task 4: Document shared composition and inspect the result

**Files:**
- Add: `docs/ui/calmy-component-composition.md`
- Review: the component and page files above.

- [x] Document field/input/select/button/panel composition and state patterns, including when to keep content and image markup native.
- [x] Inspect desktop and narrow views for label association, spacing, overflow, keyboard focus, and disabled/empty states.
- [x] Review the diff to confirm no business or storage behavior changed; state verification limitations in the handoff.

## Self-review

- Spec coverage: Tasks 1–2 build the shared controls and composition API; Task 3 applies the API to both pilot pages; Task 4 documents and inspects the delivered pattern.
- No new library or image abstraction is introduced without a repeated image use case.
- Existing CalmySelect semantics and panel usage remain backward-compatible.
