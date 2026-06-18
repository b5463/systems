# SYSTEMS. — Accessibility

The dashboard is an admin tool used by keyboard and screen-reader users too.
This is the current posture and the checklist we hold changes to. It targets
**WCAG 2.1 AA** as a direction, not a certified claim.

## In place

- **Keyboard navigation.** A "Skip to content" link is the first focusable
  element; the main region is a focusable `<main id="main-content">` landmark.
  App-wide keyboard shortcuts (`?` to list them).
- **Dialogs.** `ConfirmDialog` uses `role="dialog"`, `aria-modal`,
  `aria-labelledby`, focuses the primary action (or the typed-confirm input) on
  open, **traps Tab focus** inside the dialog, closes on `Escape`, and restores
  focus to the trigger on close.
- **Forms.** Inputs have associated `<label for>` and `aria-label`s; the login
  form sets correct `autocomplete`/`inputmode` (`current-password`,
  `one-time-code`, numeric).
- **Navigation semantics.** `<nav>` landmarks; active links get `aria-current`
  via the router; icon-only mobile tabs carry `aria-label`s.
- **Motion.** Decorative animation (the ribbon "flow field") is inert and
  honours `prefers-reduced-motion`.
- **Status not by colour alone.** System status uses words
  (running / stopped / crashed) alongside colour.

## Known gaps / not yet

- No **automated a11y check** in CI yet. Recommended next step: add `axe-core`
  assertions to the Playwright e2e suite (`dashboard/e2e/`) so regressions fail
  the build.
- Colour-contrast on the dark theme has not been formally audited against AA.
- No full screen-reader pass (NVDA/VoiceOver) recorded.
- Charts (`StatsCharts`) lack a text/table equivalent of the plotted data.

## How to check

- Keyboard: Tab from page load — the skip link should appear first; Tab through
  every interactive control; open a destructive action and confirm focus is
  trapped in the dialog and returns on close.
- Quick automated pass: run Lighthouse (Chrome DevTools) → Accessibility, or
  the axe DevTools extension, on each view.
- When adding UI: label every control, keep focus order logical, don't signal
  state with colour alone, and respect `prefers-reduced-motion`.
