# Calmy UI review follow-up implementation plan

## Approved direction

Implement the recommendations from the 2026-10-13 UI audit. Preserve the 112px Liquid Glass sidebar and all module access; expose Today, Capture, Matters, and Review as direct daily navigation, with remaining modules in an All modules flyout. Keep the main canvas white and full width. Use a right-side detail panel only where an existing detail flow can support it without altering data or route semantics. Fix primary action contrast and keyboard/focus behavior first, then simplify Today, Capture, Tasks/Board, Matters, and Review layouts.

## Constraints

- Frontend UI and interaction code only; no backend, business model, repository, or persisted data changes.
- Keep all existing routes, fields, module visibility settings, destructive confirmations, and domain actions.
- Preserve pre-existing working-tree edits. Do not stage, commit, or push.
- Do not generate another concept image in this implementation step; the user approved following the audit recommendations and the existing visual direction.

## Steps

1. **Button-state regression.** Add a focused regression for selected/primary `.chip.on` contrast and disabled states. Scope neutral button rules so they cannot erase primary colors. Confirm “新增处境” and “保存复盘” remain legible in paper theme.
2. **Shared shell navigation and keyboard.** Add four direct daily links while keeping every module reachable and current visibility controls intact. Group expanded modules under “全部模块”; preserve edge, width, and mobile drawer behavior. Pause single-character shortcuts inside every form control and IME composition. Standardize settings/command/module-manager focus entry, Tab containment, Escape close, and trigger focus restoration. Keep menu semantics and date popover within viewport.
3. **Today and quick-entry surfaces.** Preserve repositories and submit handlers. Reduce empty-state visual weight, give task/capture inputs visible submit affordances, use semantic controls for focus/complete/archive/cancel, and protect Chinese IME composition.
4. **Page-family layouts.** Align title/action/filter rows across Capture, Tasks/Board, Matters, and Review. Reduce redundant empty panels and zero metrics. Reuse existing detail route/components or existing drawer conventions for contextual details; do not invent a new data flow.
5. **Responsive and visual QA.** Review paper theme at desktop and narrow viewport; verify long Chinese labels, empty/loading/error states, keyboard focus, action contrast, and no hidden modules. Run relevant tests and type/build checks, documenting pre-existing failures separately.

## Candidate files

- `src/styles/liubai/calmy-image2-ui.css`
- `src/vue/shell/LiubaiShell.vue`
- `src/vue/pages/LiubaiToday.vue`, `LiubaiCapture.vue`, `LiubaiTasks.vue`, `TaskBoardPage.vue`, `LiubaiMatters.vue`, `LiubaiReview.vue`
- `src/vue/liubai/LbDateNav.vue`
- Focused existing Vue unit tests under `src/__tests__`

Only edit a page after confirming its existing route and UI flow; do not modify a candidate page solely because it appears in this list.
