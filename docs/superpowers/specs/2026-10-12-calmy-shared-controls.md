# Calmy shared controls: design specification

## Goal

Make common form and action patterns easier to combine consistently across Calmy pages, starting with People and Finance while preserving their existing data flow and visual language.

## Direction

- Keep Vue 3, existing theme tokens, and the existing custom `CalmySelect`; do not add another component library.
- Add `CalmyField`, `CalmyInput`, and `CalmyButton` as thin semantic building blocks.
- Let `CalmyField` provide its control id, label id, required state, hint id, and error id to `CalmyInput` and `CalmySelect` through Vue provide/inject.
- Keep native inputs and the existing custom accessible combobox behavior. Preserve normal browser input semantics and keyboard navigation.
- Extend `LbPanel` with a header actions slot while retaining its current props and default slot.
- Migrate the People and Finance forms, filters, and actions as representative pages. Keep repository calls, emitted events, data models, validation, and archive/delete semantics unchanged.
- Compose forms from one field label, one control, and optional hint/error text. Keep related fields in a row only when users enter them as one short unit; put longer descriptions below the relevant control.
- Use a shared button for page actions with default, primary, danger, and active variants. Keep destructive actions explicit and preserve their confirmation/undo behavior.
- Use a media wrapper only when the project has a repeated image pattern. Current People and Finance surfaces contain no actual image controls, so document that composition guidance rather than inventing an unused image abstraction.

## Acceptance criteria

- A field label points to its input or combobox, and hint/error text is included in `aria-describedby`.
- Required and invalid states reach the control without duplicating accessibility attributes on every page.
- Existing `CalmySelect` keyboard behavior and styling remain intact.
- People and Finance form/action behavior is unchanged; the new controls only standardize markup and shared states.
- Shared panel header actions can be added without changing panels that use only the default slot.
- The composition guidance explains when to use fields, controls, buttons, panels, and native media.

## Verification

- Review the rendered People and Finance pages at desktop and narrow widths, including label association, focus visibility, and disabled/empty states.
- Do not add or run automated tests unless requested by the user.
- Record existing build limitations without attributing them to this change.
