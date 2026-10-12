# 留白 Reference Frontend

## Reference and scope

The supplied deepseek HTML is the visual reference for the six original Liubai modules. Calmy now exposes 37 app routes through the single `LiubaiShell`; additional pages follow the same shell and shared page-family rules while retaining their own useful content density. Authentication, backend, domain models, canonical repositories and existing data remain authoritative.

## Structure

- LiubaiShell owns shared chrome, the grouped module drawer, six themes, module-specific HUD, simple/zen display, command palette and route activation.
- The six reference modules retain their slide hierarchy. Other routes use page archetypes from the route manifest, with shared page heading, action alignment, spacing, controls and state treatment.
- liubai-v11.css supplies the reference design layer; liubai-app.css adapts the expanded application pages to its theme tokens without changing their domain behavior.
- The supplied dimensions are retained: slide padding 4vw, 42px maximum overview headline, 30px maximum module headline, 14px panel radii, 680px mobile line-navigation breakpoint.
- Six themes are night, ink, forest, sunset, paper and sand. The default is night. Display settings live in calmy.ui.reference-stage.v2.
- One edge handle opens the same grouped module drawer across app pages. The command palette is available with Ctrl/Cmd K, and number shortcuts jump to the first nine visible modules.

## Interactions

- The module drawer opens from the selected screen edge or its handle. It overlays the page without shrinking the current content; on phones it becomes a full-height drawer.
- H cycles current HUD 0/1/2. Shift H switches all modules. M changes full/simple display. Shift Z changes zen display. Escape exits dialogs or zen.
- Ctrl/Cmd K opens commands. Number shortcuts jump to the first nine visible modules when focus is outside an editor.
- Wheel and touch movement scroll the current content only; they never switch modules.
- Dialogs trap focus and restore the trigger. Inactive slides and hidden HUD blocks are inert.
- Notes save with debounce and a per-date queue; tasks and focus completions use existing repositories through a shared mutation queue. No reference demo data is imported.
- Local save and cloud labels use existing events. Errors remain visible in simple and zen modes.

## Data adaptations

Tasks retain existing matter relations rather than introducing reference-only tag fields. Notes are existing date-keyed diary entries. Focus keeps the existing 25-minute completion model, showing elapsed time in the reference control. Attention budget categories with no canonical values remain unavailable; protection levels are reminders. Existing review editing stays available in complete functions.

## Evidence and remaining work

Vite packaging passed after esbuild was allowed to start. Type checking reports the pre-existing vault-sync.ts:189 union error. Independent static review closed four issues: focus completion lost during another save, absent legacy habit dates, mobile pan scrolling, and long-note auto-growth.

The expanded app still needs authenticated desktop/mobile screenshot comparison. Earlier screenshots in .impeccable/review depict previous implementations and are not current evidence. No tests were added or run during this correction.
