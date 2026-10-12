# Calmy Open Format v3: Diary and Capture Implementation Plan

> **For agentic workers:** Use the executing-plans workflow task-by-task. Track work with the checkbox steps below. Preserve existing uncommitted worktree changes.

**Goal:** Extend Portable Vault/Open Format v3 to round-trip Diary and raw Capture through their existing durable collections while preserving v1/v2 compatibility and typed identity.

**Architecture:** Add narrow Diary and Capture mappings to the existing OpenEntity parser/serializer, and use typed `(calmy_type, calmy_id)` keys throughout import comparison and Vault conflict/tombstone handling. Keep existing repositories as the only facts store; specialized async import methods write Diary/Capture durably and Capture replacement preserves local Suggestion links. Suggestion data and all unrelated legacy collections remain outside v3.

**Tech Stack:** Vue 3, TypeScript, existing Open Format/Vault adapters, IndexedDB-backed collection repositories.

**Spec:** `docs/superpowers/specs/2026-09-30-calmy-ow23-openformat-v3-diary-capture-design.md`

## Global Constraints

- Export `format_version: 3` and `b_version: 3`; read versions 1, 2, and 3; reject unsupported versions.
- Preserve v1/v2 fields, IDs, and paths.
- Add only `diary` and raw `capture`; omit AI Suggestion records and metadata.
- Diary ID is `diary_<YYYY-MM-DD>`; Capture ID remains `CaptureItem.calmyId`.
- Keep existing `diary` and `calmyCaptures` collections and their durable repositories.
- Do not replace collections wholesale, rewrite IDs, or cascade deletion to derived entities.
- Preserve local `CaptureItem.suggestionIds` when applying an incoming Capture.
- Use `(calmy_type, calmy_id)` as identity in comparisons, Vault maps, conflict decisions, paths, and tombstones.
- Do not run automated tests; verify with production build, syntax/type checks, and diff review only.
- Do not migrate user data, deploy, or modify remote branches.

---

## Task 1: Extend Open Format v3 types and serializers

**Files:**
- Modify: `src/core/content/open-format.ts`
- Create: `src/domain/diary/model.ts`

- [x] Define `DiaryEntry` (`date`, `content`, optional `sourceMaterialIds`, optional `revision`) and add `CaptureItem`/`DiaryEntry` to `OpenEntity` and `OpenWorkspaceInput`.
- [x] Add `diary` and `capture` to `OpenEntityType`; add `openEntityKey(entity)` returning `${type}:${id}` and make `entityRevision` use zero when a legacy Diary has no revision.
- [x] Export Diary at `80 Daily/Diary__diary_<date>.md` and Capture under a distinct `15 Captures/` directory; keep TodayPlan at `80 Daily/<date>.md`.
- [x] Serialize only portable Capture fields (`body`, `status`, timestamps, revision, optional source IDs); never serialize `suggestionIds` or Suggestion data. Use raw body text for Diary and Capture Markdown bodies.
- [x] Parse v1/v2/v3; validate real ISO Diary dates, deterministic Diary ID/date consistency, and Capture status against `CAPTURE_STATUSES`; report malformed identity/status as import issues.

## Task 2: Make Open Format identity type-aware

**Files:**
- Modify: `src/core/content/open-format.ts`
- Modify: `src/views/MattersView.vue`
- Modify: `src/core/content/open-workspace.ts`

- [x] Key export duplicate detection, import duplicate detection, entity comparison, conflict decisions, local lookup, and replacement dispatch by `openEntityKey`.
- [x] Carry `identityKey` on typed conflict rows so two entity types can safely share the same `calmy_id`.
- [x] Keep manifest and tombstone matching on both `calmy_type` and `calmy_id`; preserve legacy manifests whose existing entries were globally unique.
- [x] Route Diary and Capture through explicit type checks before generic `TodayPlan` fallback.

## Task 3: Add durable Diary/Capture repository import paths

**Files:**
- Create: `src/domain/diary/repository.ts`
- Modify: `src/domain/capture/repository.ts`
- Modify: `src/core/content/open-workspace.ts`
- Modify: `src/vue/pages/DiaryPage.vue`

- [x] Expose sync reads and async durable list/create/import/replace methods for the existing `diary` collection; keep one record per date.
- [x] Increment Diary revision after a successful edit; missing legacy revision reads as `0`; a new Diary file's revision is preserved on import.
- [x] Expose Capture import/replace on the existing async repository; incoming replacement copies local `suggestionIds` while accepting portable fields.
- [x] Add an async `applyOpenEntitiesDurable` entry point for the MattersView import commit; preserve current synchronous APIs for callers that do not use Diary/Capture.
- [x] Include Diary/Capture in current local OpenEntity snapshots and ensure Diary list/read includes imported `diary` collection entries even without a legacy RealityDocument.

## Task 4: Type Vault sync maps, decisions, and tombstones

**Files:**
- Modify: `src/core/content/vault-sync.ts`
- Modify: `src/views/AdminView.vue`

- [x] Use `openEntityKey` for local/Vault entity maps, manifest path lookup, tombstone lookup, conflict records, required decisions, and apply decisions.
- [x] Include `calmy_type` in tombstone deduplication and retained-tombstone filtering; Diary deletion must not touch TodayPlan for the same date.
- [x] Preserve Capture's nonportable `suggestionIds` in the local collection during normal import application; Vault file decisions only change Vault output, not unrelated derived entities.
- [x] Keep externally visible messages readable as `type · id`; never use bare ID as an internal collision-sensitive key.

## Task 5: Update export/import UI and format documentation

**Files:**
- Modify: `src/core/content/open-workspace.ts`
- Modify: `src/views/MattersView.vue`
- Modify: `docs/product/CALMY_OPEN_DATA_AND_PORTABLE_VAULT_2026-09-24.md`
- Modify: `docs/product/OPEN_WORK.md`

- [x] Add Diary/Capture data to the existing export/import path and conflict preview; retain explicit per-conflict decisions.
- [x] Surface missing source-material IDs as a nonblocking review hint while preserving their stable IDs and content.
- [x] Document v3's two new types, exact paths/fields, v1/v2 read compatibility, and old-client write incompatibility.
- [x] Record scope limitations: Suggestion, Finance, and other legacy collections are not covered; no claim that all long-term assets are portable.

## Task 6: Review and verify the implementation

- [x] Inspect every identity map and tombstone consumer for bare-ID keys.
- [x] Inspect portable Capture fields for accidental Suggestion/model metadata leakage; confirm suggestion links survive incoming replacements.
- [x] Run `npm run build`, `node --check` is not applicable to TypeScript but use existing TypeScript compiler via build, and run `git diff --check`.
- [x] Do not run automated tests or alter production D1/deployment state.

**Review/verification:** Independent read-only review found and helped close three Important edge cases plus one ambiguous legacy decision fallback. Final scoped re-review found no remaining Critical/Important issue. `npm run build` exited 0; `git diff --check` exited 0 with only the repository's LF-to-CRLF informational warnings. Automated tests were not run per the execution constraint.
