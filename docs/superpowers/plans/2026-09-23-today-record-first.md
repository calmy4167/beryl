# Today Record-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the local Today page into a record-first surface with a large composer categorized as “心 / 事实”, while retaining existing Today modules inside a collapsed “其他” section.

**Architecture:** Add an optional `journalCategory` field to the existing reality-record object without changing `RecordType` or migrating old records. Keep the existing record repository, save feedback, local-first persistence, and module callbacks; restructure only the local Today composition, make its timeline record-only, and leave the Feishu Today view and other page layouts unchanged.

**Tech Stack:** React 19, TypeScript, CSS design tokens, Vitest, Vite, current local/IndexedDB repository and sync serialization.

**Spec:** `docs/superpowers/specs/2026-09-23-today-record-first-design.md`

## Global Constraints

- Do not commit or push.
- Do not change existing `RecordType` values or reinterpret old records.
- Keep `journalCategory` optional so old records and backups without the field remain valid.
- New Today records use `journalCategory: 'mind' | 'fact'`; UI labels are “心” and “事实”.
- Keep “其他” modules’ existing callbacks, data, navigation, and persistence behavior unchanged.
- Keep the Feishu Today workspace and legacy compatibility Today route unchanged.
- Do not add analysis, recommendations, reminders, completion scores, or generated content.
- Test first; run targeted tests, full tests, production build, screenshots, detector, and `git diff --check` before handoff.

---

## File map

- `src/domain/record/model.ts`: shared `JournalCategory`, optional record/input field, and an `isJournalCategory` type guard for safe display.
- `src/domain/record/repository.ts`: preserve the optional field in synchronous and asynchronous creation/import paths.
- `src/domain/reality/query.ts`: pass the optional category through record-document projections used by Today without changing other page filters.
- `src/react/pages/today/useTodayWorkspace.ts`: own selected category and include it in new record creation while retaining existing save/error state.
- `src/react/pages/today/TodayActionForms.tsx`: replace the one-line Today composer with a larger multi-line composer and category control; remove action/matter association controls from this record-only entry.
- `src/react/pages/today/TodayRecentRecords.tsx`: query and display Today records only, with a category label only when the new field exists.
- `src/react/pages/TodayPage.tsx`: keep page identity and errors in place; put the former action/body/context/secondary modules together inside one closed “其他” disclosure.
- `src/react/tactile-ui.css`: style the larger composer, category control, record-only timeline, and collapsed disclosure for desktop/mobile.
- `src/__tests__/record.test.ts`, `src/__tests__/record-async-repository.test.ts`, `src/__tests__/reality-query.test.ts`: verify persistence, compatibility, and projection.
- `src/__tests__/tactile-today-structure.test.ts`: verify Today ordering, default-collapsed “其他”, composer categories, and preserved callbacks.

## Task 1: Add the backward-compatible record category field

**Files:** `src/domain/record/model.ts`, `src/domain/record/repository.ts`, `src/__tests__/record.test.ts`, `src/__tests__/record-async-repository.test.ts`, `src/__tests__/backup.test.ts`

- [ ] **Step 1: Write failing domain and persistence tests.** Add a synchronous create case asserting that `{ body: '刚才停下来休息', journalCategory: 'mind' }` returns the category unchanged while `type` remains `fact`. Add an asynchronous repository case asserting `journalCategory: 'fact'` survives its durable JSON-backed collection write and read. Add a legacy case asserting a record with no category remains category-less after read/import. In `backup.test.ts`, assert a backup round-trip preserves the JSON string containing `journalCategory` and accepts an older `b_realityRecords` value without that field.
- [ ] **Step 2: Run the focused tests and confirm failure.** Run `npx vitest run src/__tests__/record.test.ts src/__tests__/record-async-repository.test.ts src/__tests__/backup.test.ts`. Expected before implementation: TypeScript rejects the unknown input property or the new assertions fail because the category is absent.
- [ ] **Step 3: Implement the minimal additive model.** In `model.ts`, export:

  ```ts
  export type JournalCategory = 'mind' | 'fact'
  export function isJournalCategory(value: unknown): value is JournalCategory {
    return value === 'mind' || value === 'fact'
  }
  ```

  Add `journalCategory?: JournalCategory` to both `RealityRecord` and `RecordCreateInput`. In `repository.ts`, include `journalCategory` in created `RealityRecord` objects in both synchronous and asynchronous creation paths; keep all existing `type`, impact, revision, and source logic unchanged.
- [ ] **Step 4: Run the focused tests and confirm compatibility.** Run `npx vitest run src/__tests__/record.test.ts src/__tests__/record-async-repository.test.ts src/__tests__/backup.test.ts`. Expected: PASS, including the legacy record and backup without category.

## Task 2: Build the categorized, larger Today composer

**Files:** `src/react/pages/today/useTodayWorkspace.ts`, `src/react/pages/today/TodayActionForms.tsx`, `src/react/pages/TodayPage.tsx`, `src/__tests__/tactile-today-structure.test.ts`

- [ ] **Step 1: Add failing composer contract tests.** Render `TodayRealityRecordPanel` with an initial category and assert it exposes two accessible category controls named `心` and `事实`, a multi-line textarea, and a save control. Click each category and verify the corresponding change callback receives `mind` or `fact`; save must still invoke the existing callback exactly once.
- [ ] **Step 2: Run the structure test and confirm failure.** Run `npx vitest run src/__tests__/tactile-today-structure.test.ts`. Expected: FAIL because the composer currently exposes “事实 / 负向变化” inside advanced options and has no journal-category callback.
- [ ] **Step 3: Implement the composer and save mapping.** Add `journalCategory` state to `useTodayWorkspace`, default it to `fact`, and pass it to the record repository create input. Keep `type: 'fact'` as the existing record type for this journal entry and do not change the established record type enum. Change the composer props to accept `journalCategory` and `onJournalCategoryChange`; render the “心 / 事实” controls beside the larger textarea; remove only the Today quick-capture action/matter/negative-impact selectors, because this entry is now for recording rather than recording an action result. Keep `onSave`, validation, save-state, toast, and error recovery in the existing path. Use this component contract:

  ```ts
  type TodayRealityRecordPanelProps = {
    body: string
    journalCategory: JournalCategory
    onBodyChange: (value: string) => void
    onJournalCategoryChange: (value: JournalCategory) => void
    onSave: () => void | Promise<void>
  }
  ```
- [ ] **Step 4: Run the focused tests and confirm the green path.** Run `npx vitest run src/__tests__/tactile-today-structure.test.ts src/__tests__/open-today.test.ts src/__tests__/today-async-repository.test.ts`. Expected: PASS, including existing save behavior and the new category callbacks.

## Task 3: Move existing Today modules into “其他”

**Files:** `src/react/pages/TodayPage.tsx`, `src/__tests__/tactile-today-structure.test.ts`, `src/react/tactile-ui.css`

- [ ] **Step 1: Add failing layout assertions.** Update `TodayWorkspaceLayout` tests to expect page identity, composer, records, then one `<details>` disclosure named “其他” with no `open` attribute. Assert the disclosure contains the existing primary action, body state, thinking/trajectory, let-go, and add-action regions.
- [ ] **Step 2: Run the focused test and confirm failure.** Run `npx vitest run src/__tests__/tactile-today-structure.test.ts`. Expected: FAIL because all regions are currently rendered in the primary stack and secondary grid.
- [ ] **Step 3: Implement one collapsed grouping without changing children.** Update `TodayWorkspaceLayout` so status/error remain visible, then render the record composer and record list in the main stack. Put the existing `TodayNowPanel`, `TodayBodyStatePanel`, `TodayContextPanels`, `TodayLetGoPanel`, and `TodayAddActionPanel` inside one `<details className="today-other">` with a visible `<summary>其他</summary>`. Pass their existing elements unchanged; do not change hooks, callbacks, routes, or persistence. Use this layout contract:

  ```tsx
  <div className="today-page attention-today-page tactile-today-workspace">
    <section className="today-page-status">{status}{alert}</section>
    <section className="today-journal-stack" aria-label="今天的记录">{capture}{records}</section>
    <details className="today-other">
      <summary>其他</summary>
      <div className="today-other-content">{others}</div>
    </details>
  </div>
  ```
- [ ] **Step 4: Run Today and related behavior tests.** Run `npx vitest run src/__tests__/tactile-today-structure.test.ts src/__tests__/open-today.test.ts src/__tests__/today-async-repository.test.ts`. Expected: PASS; default disclosure remains closed and opening it reveals the original module actions.

## Task 4: Make Today’s timeline record-only and category-aware

**Files:** `src/domain/reality/query.ts`, `src/react/pages/today/TodayRecentRecords.tsx`, `src/__tests__/reality-query.test.ts`, `src/__tests__/tactile-today-structure.test.ts`

- [ ] **Step 1: Write failing query and timeline tests.** Add a reality-query case asserting a record carrying `journalCategory: 'mind'` preserves that optional field in its `RealityDocument`. Add a Today timeline case asserting the request asks only for `record` documents and that category-less legacy rows render without a fabricated “心” or “事实” badge.
- [ ] **Step 2: Run the tests and confirm failure.** Run `npx vitest run src/__tests__/reality-query.test.ts src/__tests__/tactile-today-structure.test.ts`. Expected: FAIL because projections omit `journalCategory` and the Today query currently includes action documents.
- [ ] **Step 3: Implement projection and display only.** Add optional `journalCategory` to `RealityDocument` and copy it through all record projection paths in `reality/query.ts`. In `TodayRecentRecords`, request only `record` documents and render a badge only when `isJournalCategory(document.journalCategory)` is true; label `mind` as “心” and `fact` as “事实”. Keep time ordering, error/loading state, and review navigation unchanged.
- [ ] **Step 4: Re-run the focused tests.** Run `npx vitest run src/__tests__/reality-query.test.ts src/__tests__/tactile-today-structure.test.ts`. Expected: PASS for categorized new entries, uncategorized legacy entries, and action exclusion.

## Task 5: Finish responsive styles and verify the vertical slice

**Files:** `src/react/tactile-ui.css`, current screenshot outputs under `docs/product/assets/ui-baseline-2026-09-21/`

- [ ] **Step 1: Style the record-first surface.** Give the textarea a desktop minimum height of 176px, allow vertical resize, preserve a visible save button, style the two category controls as a compact mutually-exclusive group, and style the `其他` summary as one low-emphasis disclosure row. At mobile width, stack controls without hiding the save action and keep the disclosure closed by default. Scope every new rule to `.tactile-today-workspace` or `.today-page`.
- [ ] **Step 2: Run the complete verification set.** Run `npm test`, `npm run build`, `git diff --check`, then `C:\Users\30916\.codex\skills\impeccable\scripts\impeccable.cmd detect --json src/react/pages/TodayPage.tsx src/react/pages/today/TodayActionForms.tsx src/react/pages/today/TodayRecentRecords.tsx src/react/tactile-ui.css`.
- [ ] **Step 3: Capture and inspect both device sizes.** Start the current app with `npm run dev -- --host 127.0.0.1 --port 5180`. Use Edge DevTools Protocol to capture `/app/today` at 1440×1000 to `docs/product/assets/ui-baseline-2026-09-21/today-record-first-desktop.png` and at 390×844 to `docs/product/assets/ui-baseline-2026-09-21/today-record-first-mobile.png`. Verify the first viewport leads with composer and records, “其他” stays closed, long text does not overlap controls, and mobile has no horizontal overflow.
- [ ] **Step 4: Hand off without integrating.** Report changed files, test/build/detector results, and any existing build warnings. Do not commit or push.

## Plan self-review

- Spec coverage: homepage order and module grouping are covered in Tasks 2–3; category persistence and legacy compatibility in Tasks 1–2; record-only timeline and category display in Task 4; responsive interaction and verification in Task 5; Feishu and compatibility routes remain unchanged by scope.
- Type consistency: the optional field is named `journalCategory` throughout; the exported union is `JournalCategory = 'mind' | 'fact'`; UI labels are `心` and `事实`; existing record `type` remains `RecordType` and new Today journal records use the existing `fact` type.
- Scope note: this plan intentionally does not change module internals or any other page presentation. The category field is passed through the existing generic record persistence/sync object without rewriting older records.
