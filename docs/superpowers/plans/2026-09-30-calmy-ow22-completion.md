# Calmy OW-22 Completion Plan

> **For agentic workers:** Execute inline in this task, one independently reviewable slice at a time. Preserve the product rules in the linked design and track each completed item below.

**Goal:** Complete OW-22's accepted main-data, entity-reference, and module-dictionary scope with backward-compatible data handling and verified UI behavior.

**Architecture:** Keep existing Person, Resource, Action, TodayPlan, and other repositories as the single facts sources. Add typed stable-ID references or optional provenance to their existing records; do not create duplicate content stores. Keep module dictionaries keyed by fixed domain codes, and map configured labels only at display and selection boundaries.

**Tech Stack:** Vue 3, TypeScript, IndexedDB-backed async repositories, existing Open Format v2, Vite production build.

**Spec:** `docs/product/MASTER_DATA_AND_ENTITY_REFERENCES_2026-09-24.md`; active work item `docs/product/OPEN_WORK.md` → OW-22.

## Global Constraints

- Sentence insertion stores the confirmed text snapshot; edits to source material never rewrite old text.
- Relationship references use stable typed IDs and resolve current display names.
- Archiving a referenced entity never cascades deletion to business records.
- Dictionary options stay separated by module and field; fixed lifecycle codes and domain transitions remain unchanged.
- Existing records remain readable without migration; new optional fields round-trip through Open Format where supported.
- Do not introduce a new entity type when an existing repository can safely express the feature.

---

### Task 1: Add sentence insertion to Review fields — complete

**Files:**
- Modify `src/domain/today/model.ts` to add optional field-scoped source material IDs to `TodayReview`.
- Modify `src/application/use-cases/complete-review.ts` to trim text while retaining valid, deduplicated source IDs.
- Modify `src/vue/pages/ReviewPage.vue` to provide searchable sentence insertion into the focused review field, preserve selection/caret, and allow clearing provenance before save.
- Modify `src/core/content/open-format.ts` so each review field's source IDs export and import as optional arrays.
- Modify `docs/product/OPEN_WORK.md` with implementation and acceptance evidence.

**Acceptance:**
- Each Today Review field can receive a selected sentence at the current selection; the insertion is a text snapshot.
- Source IDs stay attached to the field that received the insertion, are deduplicated, and can be cleared before save.
- Existing Today plans without source IDs continue to read; Open Format round-trips optional IDs.
- Keyboard selection, empty/error/retry states, and focus restoration work without covering or discarding the review draft.

**Verification:** `npm run build`, `git diff --check`, and independent read-only review. Automated tests are outside this execution's authorized verification scope.

**Evidence (2026-09-30):** Review now inserts active Resource templates at the selected field's current range, restores caret/focus, tracks deduplicated source IDs per field, and permits clearing provenance without changing text. TodayPlan storage/backup retain the optional nested data in their existing collection records; Open Format exports/imports each field's source-ID array and accepts legacy files with none. Build and diff check pass. Independent review found one keyboard activation edge case; the Enter shortcut is now limited to the combobox, and follow-up review confirmed closure.

### Task 2: Audit remaining reference call sites — complete

Inspect the accepted D-019 high-frequency contexts and current screens. Record a short matrix of each candidate field, current repository field, UI entry point, and Open Format boundary. Implement only missing references that have a clear user workflow and can use an existing fact source; otherwise document the specific reason the field is not applicable. Do not add global search, new material types, or blanket reference controls.

**Acceptance:** Capture/Diary/Review sentence provenance and the Task-Person stable relation are covered; any remaining planned high-frequency reference has a concrete UI and persistence path or an evidence-based exclusion.

**Evidence (2026-09-30):** The D-019 prioritized call sites are covered: Capture and Diary store a text snapshot plus optional source Resource IDs; all four Review fields do the same with field-scoped IDs; Tasks store optional `Action.personId`, resolve the current Person name, and retain archived/missing references without cascading. Existing Action→Matter and Record→Matter stable ID fields remain the facts source and Open Format boundary. The next candidate objects in §3 (locations, books/files, accounts) have no validated user workflow and are explicitly deferred by §8; no duplicate entity store was added.

### Task 3: Close module dictionary coverage and compatibility — complete

Audit existing user-facing status and category fields against the fixed-key dictionaries now supported in Action, Goal, Matter, Person, Resource, Asset, Seed, and Insight. Add a module only when an existing product field and workflow justify it. Check Core registration, repository validation, error/retry behavior, Open Format parsing, backup, and encrypted-sync coverage for each added option.

**Acceptance:** No visible supported lifecycle field exposes an unlabelled internal status code; unsupported model-only states are documented with the absence of a product call site, and no configured label changes domain transitions.

**Evidence (2026-09-30):** Configurable fixed-key lifecycle mappings cover Action, Capture, Goal, Matter, Person, Resource, Asset, Seed, and Insight; module options remain partitioned and repository-validated. Capture filters follow configured ordering and user-visible status labels; AI Suggestion workflow states remain a separate internal flow. Finance category remains its own module and its transaction portable-format gap remains in OW-23. Model entities with no dedicated product status-management/selection workflow are explicitly listed in OPEN_WORK; no new transition codes were added.

### Task 4: OW-22 acceptance sweep and closeout — complete

Review the master-data route and pages for search, create/edit/archive, picker keyboard/focus behavior, mobile layout, read/write failure feedback, old records, name changes, references after archive, and import/export boundaries. Fix confirmed defects, obtain independent review, run the production build and diff check, then update OW-22 from `in_progress` only when every acceptance item has evidence.

**Acceptance:** The nine items in §9 of `MASTER_DATA_AND_ENTITY_REFERENCES_2026-09-24.md` have explicit evidence or a documented, spec-aligned reason for exclusion; OW-22's completion record does not imply that the separate OW-23 Finance transaction format work is done.

**Verification available:** `npm run build` and `git diff --check`; automated test suites are not authorized in this execution. A local computer-use preview was attempted but the CUA runtime failed twice with `Module not found: @oai/cua/tinyskyAlt`; code-level keyboard/focus and responsive CSS review are recorded without claiming real-browser/device execution.

**Evidence (2026-09-30):** The §9 acceptance items are mapped in OPEN_WORK to the current master-data route, Resource/Person sources, Capture/Diary/Review text snapshots and stable provenance, Task-Person IDs, dictionary isolation/fixed status codes, backup/Open Format boundaries, and archived/missing-reference behavior. Independent review found and closed the Review Enter-key interception, Capture status semantics/order/error-copy issues, and three Vault compatibility risks: whole-array LWW across offline edits, stale legacy-setting overwrite of a newer same-ID item, and deletion tombstone resurrection. TodayPlan/Capture/Suggestion now sync as per-item records; legacy `setting:<collection-key>` arrays merge by stable ID and per-item `updatedAt`, then the final migration diff is emitted as per-item changes. Pulled per-item versions/tombstones are durably retained before advancing the Vault pull cursor, with pruning preserving the latest version per supported collection item. Final `npm run build` and `git diff --check` pass. Automated suites remain unrun under the execution constraint; real browser/device interaction remains unverified because the CUA runtime is unavailable, so this limitation is explicit in OPEN_WORK.
