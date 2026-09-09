# Delta — since the 2026-09-07 handoff

Five changes. Nothing already built is invalidated; three of the five are additive settings, one is a new overlay, one replaces a placeholder affordance with a real one. Sections referenced below are in `README.md`.

---

## 1. ⌘K palette replaces the top-bar search placeholder

**Was:** a non-interactive search affordance in the top bar (`Search PRs, files, comments` + `⌘K`).

**Now:** that affordance is a button, and `⌘K` / `Ctrl+K` from anywhere opens **Open a pull request** — a top-anchored overlay palette (spec: §11). Grouped by repository, one highlighted row, arrow keys + `↵` to open, `esc` to close.

**Why it is specified in this much detail:** the implementation's own palette (the screenshot that prompted this round) let long titles run under the author column, clipped them mid-word, and produced both a horizontal scrollbar and a doubled header ("Open a pull request · 32 pending" above a separate `Filter…` field). The redesign fixes those specifically:

| Implementation | Redesign |
|---|---|
| Header line + separate boxed filter field | The input row **is** the header — transparent, borderless, autofocused; the count lives at its right edge |
| Titles clipped, colliding with authors, horizontal scrollbar | Fixed columns: number 54px, title `flex: 1; min-width: 0` with ellipsis, author 104px right-aligned; `overflow-x: hidden` |
| Flat list of 32 rows | Grouped by repository with per-group counts |
| Selection = grey band only | Accent tint + 2px inset accent bar + `↵` affordance on the row |
| No keyboard guidance | Footer: `↑↓ move · ↵ open · ⌘↵ browser · esc close` |

**Implementation work:** new overlay component; three pieces of state (`paletteOpen`, `pq`, `pi`); a global key handler that runs *before* the input guard, since `⌘K` must work while typing.

## 2. Focus mode

New (spec: §12). Hides the top bar and the icon rail, keeps files + diff + chat, and raises the diff body from 12.5/1.65 to 13.5/1.95. Toggle: the **Focus** button in the diff toolbar, or `f`; exit with `esc` or the button. Scoped to the workspace so the exit is always visible.

**Implementation work:** one boolean on the app root plus two conditional `display: none`s and a font-size/line-height override on the diff body. No second layout, no per-component changes.

## 3. Code font is now its own axis

**Was:** JetBrains Mono did two jobs — interface metadata and the diff body.

**Now:** those are separate roles (spec: *Fonts*, §Appearance axis 4). Interface mono stays JetBrains Mono permanently. The **diff body** takes a user-chosen face: JetBrains Mono (default), IBM Plex Mono, Fira Code, Source Code Pro. New setting in Appearance, new `codeFont` state to persist.

**Implementation work:** load the three additional families; apply the face to the merged and side-by-side diff bodies only — not to interface mono, not to the raw-markdown view, not to inline code in prose.

## 4. Four more diff themes, and a light-mode derivation rule

Added **Darkula, Neon, Solar, Acid** to Nocturne / Muted / Vivid / Paper — eight sets, values in the §3 table.

Two structural notes:

- The picker now exists **twice**: in the diff toolbar (swatch pair + label + `▾`, menu with a `●` on the active set) and in Settings → Appearance. One piece of state behind both.
- Because all eight sets are mixed for a dark ground, a light palette **derives** rather than duplicates: raise the fills to `0.30` / `0.26` alpha and swap the pale line text for dark ink (`#173a26` / `#4b1c1c`). Adding a ninth diff theme must never mean authoring a light twin.

## 5. Three more app palettes, one of them light

Added **Darkula** (warm grey, olive-gold), **Neon** (near-black, cyan) and **Daylight** (light ground, indigo) to Nocturne / Ember / Slate / Atelier.

**The one thing to watch:** Daylight is the first light palette, and it works by **inverting both ramps** — under it `--color-neutral-100` is ink and `--color-neutral-900` is paper. Every existing ramp reference keeps its meaning only because the ramp itself flipped. So: never hard-code a dark value where a ramp step belongs, and never assume 100 is light. If a component was built with "neutral-900 = dark panel" in mind rather than "neutral-900 = the quietest surface step", it will invert incorrectly — that is the one place to check when wiring this palette up.

---

## Unchanged

The app shell and its sizes, the responsive rules, all diff and markdown interactions, the add-a-PR flow, agent review, submit, past reviews, the chat dock, and every Settings section other than Appearance. The Nocturne base tokens and the Framed/Tonal surface axis are untouched.

## Prototype

`prototype/Review.dc.html` in this bundle is the current build — it carries all five changes. The palette, focus mode, both new pickers and all new themes are live in it.
