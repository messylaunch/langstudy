---
name: design-review
description: Design + accessibility + React guidance for the Fala! app. Invoke before changing any UI, CSS, or component layout. Encodes the reputable principles from Anthropic's Frontend Design guidance, Vercel's Web Interface Guidelines, and WCAG — vetted and consolidated so we don't blind-install third-party skill packages.
---

# Design review — Fala!

Consolidated, verifiable design guidance. This is a local, auditable stand-in
for the assorted third-party "UI/UX skills" — it keeps only principles from
sources we trust (Anthropic Frontend Design, Vercel Web Interface Guidelines,
WCAG 2.2) and drops anything unverifiable or off-platform (e.g. React Native
guidance — this app is a web PWA).

## Avoid the generic-AI look (Anthropic Frontend Design)

- **Never** ship the default AI aesthetic: Inter/Roboto/Arial/system-ui as the
  only typeface, purple-on-white gradients, cookie-cutter card grids with no
  point of view. Commit to a real visual identity.
- Fala! identity: **Brazilian, warm, editorial.** Cream paper background,
  Atlantic-green ink, a butter-yellow and cobalt-blue accent drawn from the
  flag. A **serif display face** for the brand and headings gives character;
  a clean humanist sans for body keeps it readable. Use offline-safe font
  stacks — this is a PWA, no blocking web-font requests.
- One decisive accent per surface, not five. Let whitespace and type carry
  hierarchy before color does.

## Web interface fundamentals (Vercel guidelines)

- **Type scale**: a consistent modular scale, not ad-hoc px values. Body 16px
  minimum. Line-height ~1.5 for prose, tighter for display.
- **Spacing**: one rhythm unit (multiples of 4px). Consistent card padding,
  section gaps, and vertical rhythm.
- **Hit targets** ≥ 44×44px for anything tappable.
- **Motion**: subtle, fast (120–200ms), and `prefers-reduced-motion` aware.
  Never animate layout on scroll.
- **States**: every interactive element needs hover, active, focus, and
  disabled states. Loading and empty states are designed, not afterthoughts.

## Accessibility (WCAG 2.2 AA)

- Text contrast ≥ 4.5:1 (≥ 3:1 for large/bold). White-on-color badges and
  buttons must pass — verify each status color.
- **`:focus-visible`** ring on every focusable element; never `outline: none`
  without a replacement.
- Clickable non-buttons need `role="button"`, `tabIndex=0`, and Enter/Space
  handlers (use `src/lib/a11y.js` → `pressable`).
- Icon-only buttons need a `title` / `aria-label`.
- Respect `prefers-reduced-motion` and `prefers-color-scheme` where feasible.

## React / component hygiene (Vercel React Best Practices)

- Don't unmount a view mid-interaction (loses in-progress session state).
- Guard async actions against double-submit.
- Keys must be stable and unique.
- Derive state; don't duplicate it.

## Review checklist (run before committing UI changes)

1. Does it still look like *Fala!*, not generic AI output?
2. Type scale + spacing consistent with the rest of the app?
3. All four interaction states present? Focus-visible ring?
4. Contrast checked on any new color-on-color text?
5. Works at 360px width and in an installed PWA (safe areas)?
6. Reduced-motion honored?
