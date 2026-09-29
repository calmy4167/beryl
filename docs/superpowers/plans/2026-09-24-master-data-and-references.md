# 主数据中心与实体引用系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Keep the user's existing uncommitted dropdown work intact.

**Goal:** Add a first-level Master Data area for reusable sentence/person data and a progressive, accessible entity-reference flow that can be expanded into module dictionaries without creating duplicate data sources.

**Architecture:** Reuse the existing unified `Person` and `Resource(kind='template')` entities and their async Repository; do not add a competing master-data store. Register the new page through `route-manifest`, and implement reference behavior as UI composition over existing domain objects. Keep per-module dictionaries/status customization as a later vertical slice because its values must remain compatible with each domain state machine.

**Tech Stack:** React 19, React Router 7, TypeScript, unified async Repository, Vitest + Testing Library, existing Calmy CSS tokens.

**Spec:** `docs/product/MASTER_DATA_AND_ENTITY_REFERENCES_2026-09-24.md`

**Execution status (2026-09-24):** Tasks 1–4 have their first vertical slice implemented: `/app/master-data`, sentence/person management over the existing unified entities, the keyboardable picker/drawer/chip, and sentence snapshot insertion in Capture and Diary. Verification currently passes: template Resource Open Format round-trip; full suite (71 files / 399 tests); production build; and `git diff --check`. A separate OW-23 audit later added `b_openAssets` to the JSON Backup whitelist with regression coverage. Module dictionaries, configurable workflow states, source-ID provenance, and typed relationship-field rollout remain deferred OW-22 work.

## Global Constraints

- Preserve `Person`, `Resource`, and current durable Repository semantics; do not introduce a second facts collection.
- Keep existing user data, legacy `/app/people` routing, and `b_chars` migration behavior readable.
- Relationship references use `(entityType, entityId)`; body insertion uses a text snapshot and never rewrites old text on material edits.
- A failed save must not display success or discard unsaved form input.
- No commits or pushes; preserve all pre-existing uncommitted changes.

---

### Task 1: Route and first-level navigation

**Files:**
- Modify: `src/react/route-manifest.ts`
- Modify: `src/react/App.tsx`
- Modify: `src/react/lazy-pages.ts`
- Test: `src/__tests__/master-data-navigation.test.ts`

**Interfaces:**
- Produces route `/app/master-data`, page ID `master-data`, view key `masterData`, first-level feature group `data` labelled “主数据”.

- [x] **Step 1: Write the route/navigation regression test.** `src/__tests__/master-data-navigation.test.ts` checks the route, first-level group and label.
- [x] **Step 2: Verify route/navigation coverage.** The focused navigation test passes.
- [x] **Step 3: Add the route descriptor and lazy view wiring.** `/app/master-data` is registered; `/app/people` and legacy redirects remain available.
- [x] **Step 4: Run the focused test and verify it passes.** Repeat the same test command.

### Task 2: Material management using existing domain entities

**Files:**
- Create: `src/react/pages/MasterDataPage.tsx`
- Modify: `src/react/lazy-pages.ts`
- Modify: `src/react/App.tsx`
- Test: `src/__tests__/master-data-page.test.ts`

**Interfaces:**
- `MasterDataPage` lists `Resource` items of kind `template` and `Person` items from `unifiedAsyncRepository`.
- Sentence create/update/archive calls `unifiedAsyncRepository` with `unifiedFactories.resource` and existing revision semantics.
- People management reuses the existing People page or links to it; it never creates a duplicate Person repository.

- [x] **Step 1: Test sentence listing, search, create, validation, archive, and shared-person IDs against the real unified repository.** `src/__tests__/master-data-page.test.ts` covers sentence lifecycle and verifies the embedded People view preserves the seeded `calmyId` without creating a second Person.
- [x] **Step 2: Verify the focused page test.** Run `npm test -- --run src/__tests__/master-data-page.test.ts`.
- [x] **Step 3: Implement the minimal content-material view.** The page reuses the existing Resource/Person repositories and includes loading, empty, error/retry, saving, and archived states.
- [x] **Step 4: Run the focused test and verify persistence and UI states pass.** Repeat the same test command.
- [x] **Step 5: Add a regression test proving existing Person IDs/data are displayed from the existing repository.** The test asserts the exact original `calmyId` and collection cardinality.

### Task 3: Progressive MasterDataPicker primitive

**Files:**
- Create: `src/react/ui/MasterDataPicker.tsx`
- Create: `src/react/ui/MasterDataPicker.css` (or add scoped rules to the existing React component stylesheet)
- Test: `src/__tests__/master-data-picker.test.ts`

**Interfaces:**
- `MasterDataPicker<T>` accepts labelled typed items and emits the selected item; optional `onQuickCreate(query)` creates and returns a newly selected item.
- Compact mode opens a searchable combobox; “浏览全部” opens a right-side Drawer; selected values render as an accessible removable Entity Chip.

- [x] **Step 1: Test keyboard search/selection, Escape close, Drawer open/selection/return, quick-create auto-selection, and chip removal.** `src/__tests__/master-data-picker.test.ts` covers these interactions.
- [x] **Step 2: Verify the focused picker test.** Run `npm test -- --run src/__tests__/master-data-picker.test.ts`.
- [x] **Step 3: Implement the keyboard-accessible combobox, Drawer, Quick Create handoff, and chip.** Entity mutation remains in the caller/Repository.
- [x] **Step 4: Run the focused test and verify all interactions pass.** Repeat the same command.
- [x] **Step 5: Add a non-modal text-insertion mode for sentence material with an immutable text snapshot.** Capture and Diary regressions verify inserted body text remains unchanged after the source material is edited.

### Task 4: First consumer integration

**Files:**
- Modify: `src/react/pages/CapturePage.tsx`
- Modify: `src/react/pages/DiaryPage.tsx`
- Test: `src/__tests__/master-data-consumers.test.ts`

**Interfaces:**
- Common text-entry pages can invoke the sentence picker without losing draft text or cursor position; selecting a sentence inserts its current text as a snapshot.
- Existing Person management remains on the same Person entities; no Person-to-task relation is invented in this first consumer slice.

- [x] **Step 1: Test picker invocation and phrase insertion at the current caret in Capture and Diary; assert surrounding draft text is preserved. Edit the source material after insertion and assert the already-inserted draft string is unchanged.**
- [x] **Step 2: Verify focused consumer tests.** Run `npm test -- --run src/__tests__/master-data-consumers.test.ts`.
- [x] **Step 3: Integrate into Capture and Diary only.** No controls were added to unrelated fields and no relationship field was invented.
- [x] **Step 4: Run focused tests and verify cursor and snapshot behavior.** Repeat the same command.

### Task 5: Persistence, sync/export compatibility, and verification

**Files:**
- Inspect/modify only if required: `src/core/sync.ts`, `src/core/entity-sync.ts`, `src/core/content/open-format.ts`, `src/views/AdminView.vue`
- Test: relevant existing backup, open-format, and sync tests plus new master-data tests

- [x] **Step 1: Add a regression test proving template resources and references survive the existing export/import or entity-sync path.** `src/__tests__/unified-open-format.test.ts` now round-trips a template Resource including its stable ID, source IDs, Matter IDs and tags.
- [x] **Step 2: Run the focused existing tests and confirm the relevant gap.** The existing Open Format conversion already retains template kind, stable entity ID, source IDs and tags; no gap was found.
- [x] **Step 3: Make the smallest compatibility change only if existing paths omit template resources or typed references.** No production compatibility change was needed.
- [x] **Step 4: Run focused tests, full `npm test`, `npm run build`, and `git diff --check`.** 71 test files / 392 tests pass; production build and whitespace check pass.

## Deferred follow-up (required by D-019, not this first vertical slice)

- Add dictionary entities scoped by `(moduleId, fieldId)` for categories, labels, sources, then module statuses.
- Before allowing new workflow states, extend that domain's command transitions, projections, filters, persistence/open-format compatibility, migrations, and rollback tests; retired used options remain readable and cannot be hard-deleted.
- Expand Picker/Drawer to other modules based on actual fields; add recent/favorites and per-type rendering without making them engagement metrics.
- Evaluate Ctrl+K global search, independent large-data browser, advanced tree selectors, and drag/drop only after usage evidence.

## Verification closeout (2026-09-24)

- Added regression coverage for exact Person ID reuse, sentence create/required-field validation/archive, Picker Escape close, Diary caret insertion, and immutable text snapshots when source materials change.
- Full product scope remains staged: typed business relationship fields, source-ID provenance for inserted text, dictionaries, configurable state machines, and real mobile/browser user validation are deferred OW-22 follow-up, not silently implied complete by this first vertical slice.
- Full suite result at closeout: 71 files / 399 tests passed. Build was re-run after the attachment-backup allowlist change.
