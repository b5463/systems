# SYSTEMS. — Brand & Design System

The single source of truth for how SYSTEMS. looks, moves, and speaks. Anything
built for this product must conform to this document. If something here is wrong
or missing, update this file first, then the code — not the other way around.

> SYSTEMS. is a **self-hosted deployment control plane**. The visual language is
> dark, monochrome-first, industrial, and precise. It must read as *trustworthy
> infrastructure*, not a consumer SaaS. Restraint over decoration.

---

## 1. Core principles

1. **Monochrome first.** The interface is built from near-black surfaces and a
   four-level grey type ramp. Colour is meaning, never decoration (one brand
   exception below).
2. **Truth over flourish.** Never imply a state the system can't confirm. Status
   is derived, never asserted (see §7).
3. **Restraint.** No gradients-as-style, no glow except the focus treatment, no
   motion without purpose.
4. **Operator-grade.** Dense where it helps power users; legible at a glance;
   keyboard-complete.

---

## 2. Colour tokens

All colours live as CSS variables in `dashboard/src/style.css :root`. **Never
hardcode a hex in a component** — reference the token.

### Surfaces (near-black, layered low-chroma)
| Token | Hex | Use |
|-------|-----|-----|
| `--bg` | `#0a0a0c` | App background |
| `--bg-card` | `#0f1013` | Cards / panels |
| `--bg-elevated` | `#15161a` | Dropdowns, modals, raised surfaces |
| `--bg-hover` | `#1b1d22` | Hover / active row |
| `--bg-input` | `#0c0d10` | Inputs, code/log surfaces |

### Lines
| Token | Hex | Use |
|-------|-----|-----|
| `--border` | `#262830` | Default borders |
| `--border-soft` | `#1a1c22` | Subtle dividers |
| `--border-strong` | `#3a3d47` | Hover borders, emphasis |

### Type ramp (four levels — use exactly these)
| Token | Hex | Use |
|-------|-----|-----|
| `--text` | `#f0f1f3` | Primary text, headings |
| `--text-muted` | `#b2b6bf` | Secondary text, labels |
| `--text-dim` | `#868c98` | Metadata, captions, hints |
| `--text-disabled` | `#525862` | Disabled only — never normal copy |

### Focus — the white glow (brand signature)
| Token | Value | Use |
|-------|-------|-----|
| `--focus-border` | `rgba(255,255,255,0.92)` | Focus border |
| `--focus-ring` | `rgba(255,255,255,0.14)` | Focus outer ring |

Focus is **white**, never cyan. Every interactive element keeps a real
border/outline *plus* the ring — never rely on glow alone.

### Status colours (meaning only — never decorative)
| Token | Hex | Meaning |
|-------|-----|---------|
| `--ok` | `#45c267` | Healthy, success, confirmed live |
| `--warn` | `#d6a23c` | Degraded, pending attention, unpublished |
| `--danger` | `#ef5b51` | Failure, destructive action, critical |
| `--info` | `#6aa6e8` | Informational (sparingly) |
| `--grey` | `#585c66` | Unknown / unmeasured / inactive |

Dim companions exist for tinted backgrounds: `--ok-dim`, `--warn-dim`,
`--danger-dim`, `--accent-dim`.

### The one brand accent — `--accent` `#5fb0d4` (cyan)
**Decorative only.** Permitted: the logo dot, login/empty-state artwork, the
URL-preview slug highlight. **Forbidden:** focus, selection, interaction,
buttons, chart lines, status. If it's interactive, it's white/grey, not cyan.

---

## 3. Typography

- **Sans (`--font`)** — system stack. Everything: UI, forms, tables, body.
- **Mono (`--mono`)** — URLs, ports, IPs, commands, logs, versions, resource
  numbers, env-var names, IDs. Mono signals "machine value", never decoration.
- **Display** — the distorted wordmark is brand-only (login, empty states,
  deploy-success). Not for in-app headings.

Type scale (tokens — don't hardcode sizes):
`--fs-h1` clamp 30–36px · `--fs-h2` clamp 20–24px · `--fs-body` 16px ·
`--fs-sm` 13px (secondary/metadata) · `--fs-xs` 12px · `--fs-label` 12px
(uppercase section labels). Weights: `--fw-normal` 400 · `--fw-medium` 550 ·
`--fw-semibold` 600 · `--fw-bold` 700.

Rules: nothing readable below 12px; uppercase labels use letter-spacing
`0.1em`; button text never heavier than nearby headings.

---

## 4. Spacing, radius, layout

- **Spacing scale (4px base):** `--sp-1` 4 · `--sp-2` 8 · `--sp-3` 12 ·
  `--sp-4` 16 · `--sp-5` 20 · `--sp-6` 24. Use these for padding/gaps.
- **Radius:** `--radius` 8 (cards/panels) · `--radius-sm` 6 (controls) ·
  `--radius-xs` 4 (chips, small).
- **Content widths:** `--content-max` 1760 cap; forms read best 720–960,
  operational detail 1100–1440. Increase columns before scaling type on 4K.
- **Density:** Comfortable (default) and Compact (`:root.density-compact`).
  New components must honour both — don't hardcode heights that break compact.

---

## 5. Iconography  ⚠️ (governs the icon work)

- **No Unicode glyph characters for UI affordances.** Never use `→ ← ↑ ↓ ↗ ✓ ✕
  × ▸ ⇪ ●` etc. as arrows, checks, carets, close buttons, or status marks.
  They render inconsistently across platforms and don't inherit our stroke
  style. (A literal `×` as a *multiplication sign* in prose, e.g. "256k × 3",
  is text, not an icon — that's fine.)
- **Use the `Icon` component** (`dashboard/src/components/Icon.vue`) with a named
  icon. To add an icon, add it to that component's set — don't inline ad-hoc SVG
  in views.
- **Icon style:** stroke-based, `stroke="currentColor"`, `fill="none"`,
  `stroke-width: 1.7`, `stroke-linecap/linejoin: round`, on a 24×24 viewBox.
  Icons inherit colour from text (`currentColor`) — never give an icon its own
  colour except via a status token on the parent.
- **Sizing:** default 1em-relative or 16–20px; nav icons 18–20px.
- **Status dots** (`.sdot`) are the one allowed non-icon mark — a filled circle
  whose colour is a status token, always paired with a text label.

---

## 6. Motion

- **Purpose only.** Motion communicates state change or spatial relationship;
  never ambient decoration in operational views (the login/empty-state art is
  the exception).
- **Durations:** micro-interactions 0.12–0.15s; transitions/fades 0.18–0.25s;
  status pulses ~1.4–1.8s. Easing: `ease` / `ease-in-out`.
- **Allowed animations:** focus ring appear, hover colour, fade route/dialog
  transitions, the `--warn` status-dot pulse, the live-deploy pulse, spinner,
  skeleton shimmer.
- **Never:** animate every step of a pipeline at once (implies all-active);
  bounce; parallax; gratuitous entrance animations on dense lists.
- **Reduced motion is mandatory.** Every animation must be disabled or reduced
  under `@media (prefers-reduced-motion: reduce)`. JS-driven motion (e.g.
  FlowField) must check `matchMedia('(prefers-reduced-motion: reduce)')`.

---

## 7. Status model (truth)

One derived headline state, never per-page invention. `deriveState(project)` in
`utils/status.js` is the source. Independent facts (runtime, route, TLS, health,
visibility) are shown separately; the headline is derived from them.

- **Live** only when the public route is published **and** health is healthy.
- Running but unrouted (public intent) → **Running — unpublished** (`--warn`).
- Private + running → **Running privately** (`--ok`).
- Running but unhealthy → **Degraded** (`--warn`).
- `error` with an image → **Crashed**; without → **Build failed** (`--danger`).

Actions must be state-dependent: never offer an action that cannot succeed.
"Open" reflects what opens (public URL vs local endpoint) and only appears when
reachable.

---

## 8. Components & states

Every interactive component must define: default, hover, focus-visible, active,
selected, disabled, loading, and (where relevant) success / warning / error.
Keyboard focus must be visible independently of hover.

- **Buttons:** primary (white fill), secondary (bordered), ghost (transparent,
  visible rest border), danger (red), icon-only. Every async action shows a
  spinner + disabled + result.
- **Inputs:** persistent labels (never placeholder-as-label); white-glow focus;
  hover/readonly/invalid states.
- **Dropdowns/dialogs/palette:** teleport above content; trap focus; Escape to
  close; restore focus to opener; accessible name; outside-click dismiss.
- **Empty / loading / error / stale** states are required for every data view.

---

## 9. Accessibility (non-negotiable)

- WCAG AA contrast for normal text; dark UI needs *more* contrast discipline.
- Full keyboard operation; visible focus everywhere.
- Colour never the only signal — status dots always carry a text label.
- Dialogs trap + restore focus; live async results announced via a polite live
  region (the toast stack is `role="status"`).
- Respect `prefers-reduced-motion` and `prefers-contrast: more`.
- Test at 360–3840px widths and 80–200% zoom.

---

## 10. Voice

Plain, precise, operator-to-operator. Say what happened and what to do next.
Standardise terms: **Deploy** (not "ship" in actions, though "Ship" is the
page/brand verb), ZIP, URL, HTTPS, container, route, health. Surface
consequences before destructive or infrastructure-level actions.
