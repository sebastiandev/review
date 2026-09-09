# Handoff: Review — PR review app with in-place AI agent

## Overview

Review is a local web app for reviewing pull requests with an AI agent in the loop. It fetches PRs assigned to you from configured accounts (GitHub, GitLab), shows the diff, and makes **every line actionable**: leave a review comment, open an in-place chat with a review agent, or copy a line reference. A chat dock is always available for the whole PR/diff, and markdown files get a rich reading view where any text selection carries the same three actions.

Two modes:

- **PR mode** — full workflow: fetch assigned PRs per tracked repository, add any PR manually even when it is not assigned to you, create a worktree and check out the branch, comment on lines, see others' comments (folded, threaded), run an automatic review, submit as comment/approve/request-changes, browse past reviews, manage worktrees.
- **Diff mode** — drops PR fetching and review comments; focuses on one diff scope: a working tree, a folder inside a repo, or a `.diff` patch file. Intended for launching the app against a given diff (`review ~/dev/atelier`, `review poller-clamp.diff`).

## About the design files

`prototype/Review.dc.html` is a **design reference written in HTML** — a working prototype of the intended look and behavior, not production code to lift. Implement it in the target codebase's own environment (React + Vite is the natural fit for a local web app; use what the repo already has) with its established patterns. The prototype's internal structure — one streaming component with a render-values function — is an artifact of the design tool and should **not** be reproduced.

To open it from this bundle: `prototype/Review.dc.html` next to `prototype/support.js`, with the stylesheet already vendored at `prototype/_ds/nocturne-…/styles.css`. It needs a network connection for the two Google Fonts.

## Fidelity

**High fidelity.** Colors, type, spacing, radii, shadows, breakpoints and interaction states are final and listed here. Not designed: real loading/error states beyond those noted under *Interactions*, and the worktree-creation progress state.

Content is real content from `github.com/sebastiandev/atelier` (the diff is `backend/src/infrastructure/artifacts/pr_status_poller.py`, the markdown document is `docs/spec-agent-hooks.md`) plus plausible ShipHero repositories for the multi-repo case. Sample data — replace it.

---

## Design system

The app is built on **Nocturne**, included in full in `design-system/`:

- `styles.css` — **the** stylesheet: the token sheet (`:root` variables plus 100–900 tonal ramps) and a component layer (`.btn`, `.tag`, `.input`, `.field`, `.card`, `.table`, `.nav`, `.dialog`, `.hr`, `.lighten`). Link it once and take every color, font, space, radius and shadow from its variables.
- `readme.md` — the system's own guide.
- `theme.json`, `_ds_manifest.json` — the parameters it was derived from, and its component inventory.

Rules that matter here: primary actions are **outlined**, never solid-filled; chroma stays low outside the accent; the accent appears as a line, a mark or a low-alpha tint, never a flood; elevation on a dark ground is a hairline edge plus ambient darkness (`--shadow-sm/md/lg`, never stacked); focus is always `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }`; icons are **Phosphor**; density is 0.70× — dense on purpose.

### Base tokens (Nocturne)

| Token | Value |
|---|---|
| `--color-bg` | `#161826` |
| `--color-surface` | `#232532` |
| `--color-text` | `#e9e9ed` |
| `--color-accent` | `#9184d9` |
| `--color-divider` | `color-mix(in srgb, #e9e9ed 16%, transparent)` |
| accent 100→900 | `#f5f4ff #e7e5fe #d2cefd #b5abfc #968ae0 #796cbf #5d5294 #423a6a #2b2741` |
| neutral 100→900 | `#f3f5fe #e4e7f5 #cfd3e5 #b2b6ca #9397ab #75798c #595d6c #3f424d #292b31` |
| `--space-1…8` | `2.8 5.6 8.4 11.2 16.8 22.4` px |
| `--radius-sm/md/lg` | `4 / 8 / 14` px |
| `--shadow-sm` | `0 0 0 1px #3f424d` |
| `--shadow-md` | `0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,0.55)` |
| `--shadow-lg` | `0 0 0 1px #9397ab, 0 16px 40px rgba(0,0,0,0.65)` |

### Fonts

- **Inter** 400/500/600/700 — UI and prose (loaded by `styles.css`).
- **JetBrains Mono** 400/500 — *interface mono*: paths, refs, branch names, line numbers, numeric meta. Never changes.
- **The code face is its own axis** (Settings → Appearance → *Code font*), applied to the **diff body only**: `JetBrains Mono` (default), `IBM Plex Mono`, `Fira Code`, `Source Code Pro` — 400/500, Google Fonts. Interface mono and code mono are deliberately separate roles: metadata wants a tight, quiet face, code wants a tall x-height and unambiguous `0/O` and `1/l/I`. Diff body is **12.5px / 1.65**, and **13.5px / 1.95 in focus mode**.

### Type sizes (px)

| Use | Size |
|---|---|
| Section heading (`h4`) | 20 |
| Sub-heading (`h5`) | 16 |
| Body / list row | 13–13.5 |
| Inbox card title | 16 (heading font) |
| Meta, captions, chips | 11–12.5 (mono for paths/counts) |
| Overline labels | 11, uppercase, 0.08em tracking |
| Code / diff | 12.5 mono (13.5 in focus mode) |
| Device-flow user code | 26 mono, 0.14em tracking |

---

## Four appearance axes (all in Settings → Appearance; keep all four)

They compose: any palette can run in either surface style, with any diff theme and any code font.

### 1. Surface style — `Framed` | `Tonal`

The structural axis, driven entirely by tokens set on the app root. Nothing is styled per-component.

| Token | Framed | Tonal |
|---|---|---|
| `--seam` (authored dividers) | `var(--color-divider)` | `transparent` |
| `--color-divider` (design-system rules read this directly) | palette value | `transparent` |
| `--hairline` (the one line that must survive: split-diff boundary) | `var(--color-divider)` | `var(--color-neutral-800)` |
| `--chrome-bg` (top bar, rail, sidebar, dock, status bar) | `var(--color-bg)` | `var(--color-surface)` |
| `--panel-bg` (bordered list containers) | `transparent` | `var(--color-neutral-900)` |
| `--pop-bg` (popovers, menus, inline chat, modals) | `var(--color-surface)` | `var(--color-neutral-900)` |
| `--ctl-bg` (inputs) | `var(--color-surface)` | `var(--color-neutral-900)` |
| `--btn-bg` (secondary buttons) | `transparent` | `var(--color-neutral-900)` |
| `--r-pop` | `var(--radius-md)` | `8px` |
| `--radius-sm/md/lg` | `4/8/14` | `2/3/6` |
| `--shadow-sm` | `0 0 0 1px …` | `none` |

**Framed** is Nocturne as authored: hairline dividers, chrome flush with the canvas, outlined buttons. **Tonal** is the borderless treatment from Atelier's own `docs/design-system.md` ("Direction D"): no borders anywhere, separation by surface steps (canvas → rails/chrome → controls/panels → popovers), flatter radii, and shadows *only* on floating layers — ordinary cards never cast one. When implementing, this is a `data-style="framed|tonal"` block, not a second component tree.

### 2. Theme — seven palettes (six dark, one light)

They all re-point the same token names, so no component needs per-theme code. Implement as `data-theme` blocks and persist the choice.

- **Nocturne** — the stylesheet's own palette (no overrides). Blurple on blue-grey.
- **Ember** — warm ink, amber accent:
  `--color-bg:#191614; --color-surface:#221f1c; --color-text:#efe9e1; --color-accent:#d9a05b;`
  accent 100→900 `#fdf6ec #f8e7cf #eecfa6 #e0b578 #cc9350 #a8763d #825b2f #5c4123 #332515`;
  neutral 100→900 `#f7f4f0 #eae5df #d5cec6 #b6ada3 #958b80 #776d63 #5b524a #413a34 #2a2521`;
  divider `color-mix(in srgb,#efe9e1 16%, transparent)`; shadows re-tuned to `#413a34 / #5b524a / #958b80`.
- **Slate** — cool, high contrast, reading first:
  `--color-bg:#10151a; --color-surface:#182029; --color-text:#f4f8fb; --color-accent:#79b8d1;`
  accent 100→900 `#f2fafd #dcf0f7 #bde0ee #96cbe1 #6faec8 #558da6 #416d80 #2f4e5c #1e323b`;
  neutral 100→900 `#f5f8fa #e6ebef #d0d8de #aeb9c2 #8c99a4 #6e7b86 #545f69 #3b444c #212930`;
  divider `color-mix(in srgb,#f4f8fb 18%, transparent)`.
- **Atelier** — the workbench's own blue-grey, lifted from `frontend/src/styles.css` and contrast-corrected for this app's use of the ramp:
  `--color-bg: oklch(0.165 0.006 260); --color-surface: oklch(0.195 0.008 260); --color-text: oklch(0.95 0.005 260); --color-divider: oklch(0.32 0.010 260); --color-accent: oklch(0.62 0.18 278);`
  accent 100→500 `oklch(0.97 0.02 278) / (0.90 0.06) / (0.80 0.11) / (0.70 0.15) / (0.62 0.18)`, 600→900 the accent at `/0.55 /0.45 /0.28 /0.16` alpha;
  neutral 100→900 `oklch(0.98 0.003) (0.95 0.005) (0.88 0.006) (0.78 0.008) (0.68 0.010) (0.58 0.010) (0.50 0.010) (0.27 0.010) (0.225 0.009)` — all hue 260.
  Note the correction: Atelier's `--fg-4`/`--line` steps (0.42/0.30) are too dark for the 11–12.5px meta text and line numbers this design puts on `--color-neutral-600/700`, so those map to 0.58 and 0.50 instead (≈4.3:1 and ≈2.9:1); the darkest steps carry seams only.

- **Darkula** — warm grey ground, olive-gold accent (for people who live in JetBrains IDEs):
  `--color-bg:#2b2b2b; --color-surface:#313335; --color-text:#e4e2dd; --color-accent:#c9a45a;`
  accent 100→900 `#fbf5e6 #f2e4c4 #e3cd9c #d4b675 #c9a45a #a3843f #7c6531 #574823 #3b3320`;
  neutral 100→900 `#f6f5f2 #e8e6e1 #d2cfc8 #b2aea6 #918d85 #746f68 #575350 #3f3f41 #323234`.
- **Neon** — near-black, cyan accent, the only palette where a shadow carries accent colour (`--shadow-lg` outer ring `#52e3c2`):
  `--color-bg:#0b0e13; --color-surface:#121722; --color-text:#eaf4ff; --color-accent:#52e3c2;`
  accent 100→900 `#eefffb #ccfdf1 #9df3e2 #6ee9ce #52e3c2 #33b39a #24866f #1a5a4c #123830`;
  neutral 100→900 `#f4f9ff #e2ebf6 #c6d4e4 #9fb0c4 #7c8da3 #5f6f84 #465364 #29323f #171d27`;
  divider `color-mix(in srgb,#7ff3e0 22%, transparent)`.
- **Daylight** — the one **light** palette; indigo accent on a near-white ground:
  `--color-bg:#f7f7f9; --color-surface:#ffffff; --color-text:#1c1e26; --color-divider:#d9dae1; --color-accent:#5b4fd6;`
  **both ramps run inverted** so every existing use of a ramp step keeps its meaning: accent 100→900 `#24206a #33297f #4a3fbb #5b4fd6 #6e63e0 #9c95ec #c3bef5 #ded9fb #eeebff`, neutral 100→900 `#14161c #24272f #3b3f4a #565b66 #6f7480 #8a8f9a #b7bbc4 #dcdee4 #f0f1f4`. Shadows lose the bright outer ring and become a hairline plus a soft drop.
  This palette is the reason ramp steps must never be assumed dark — 100 is *ink* here, 900 is *paper*.

### 3. Diff theme — eight line-tint sets

Picked in two places: the **diff toolbar** (a swatch-pair button showing the current colours + label + `▾`, opening a 180px menu of all eight with a `●` on the active one) and Settings → Appearance (swatch-pair cards). One state, both surfaces.

| Theme | Added bg | Removed bg | Added text | Removed text |
|---|---|---|---|---|
| Nocturne | `rgba(111,170,126,0.13)` | `rgba(196,123,123,0.13)` | `#cfe4d5` | `#e8cdcd` |
| Muted | `rgba(140,150,170,0.14)` | `rgba(170,140,150,0.14)` | `#dcdfe8` | `#e6dade` |
| Vivid | `rgba(86,190,120,0.20)` | `rgba(226,96,96,0.18)` | `#e2f5e7` | `#fbdede` |
| Paper | `rgba(200,205,180,0.14)` | `rgba(205,185,170,0.14)` | `#eceada` | `#f0e2d8` |
| Darkula | `rgba(83,120,80,0.26)` | `rgba(125,72,72,0.26)` | `#d9e8cf` | `#f0d2d2` |
| Neon | `rgba(57,255,178,0.16)` | `rgba(255,64,140,0.16)` | `#c6ffe6` | `#ffd0e2` |
| Solar | `rgba(133,153,0,0.20)` | `rgba(220,50,47,0.16)` | `#e7ebcf` | `#f7d7d3` |
| Acid | `rgba(166,226,46,0.15)` | `rgba(249,38,114,0.15)` | `#e9f6cd` | `#fbd4e3` |

Fixed across diff themes: context text `--color-neutral-300`; hunk header row `--color-neutral-900` bg with `--color-neutral-500` text; line numbers `--color-neutral-700`; `+`/`−` counts `#6faa7e` / `#c47b7b`.

**On a light palette the tints are derived, not authored.** All eight sets are mixed for a dark ground, so under **Daylight** the app raises the fills to `0.30` (added) / `0.26` (removed) alpha and replaces the pale line text with dark ink (`#173a26` added, `#4b1c1c` removed). Implement that as a light-mode transform of the chosen set, so adding a diff theme never means authoring a second light variant.

### 4. Code font — four faces, diff body only

Bordered cards, each rendering **its own name in its own face** over a 10.5px note (`tall x-height`, `narrower, bookish`, `ligatures`, `neutral, compact`), accent border when selected. Applies to the merged and side-by-side diff bodies. Interface mono, the raw-markdown view and inline code in prose stay on JetBrains Mono.

---

## App shell

| Region | Size | Notes |
|---|---|---|
| Top bar | height 46, padding 0 14 | brand, mode toggle, search, actions |
| Icon rail | width 48 | Inbox `◧`, Past reviews `◷`, Settings `⚙`, avatar pinned bottom |
| Sidebar | width **306 default, resizable 220–460** | PR list / file tree / settings nav / past filters |
| Center pane | `flex: 1; min-width: 0` | diff, markdown, inbox, settings, past reviews |
| Chat dock | 344 open / 44 collapsed rail | always-available chat |
| Status bar | height 26, 11px mono `--color-neutral-600` | mode · worktree · `press ? for shortcuts` |

Top bar, left to right: the `</>` mark (JetBrains Mono 15px, `--color-accent`, no container) and the wordmark **Review** (heading font 15px, −0.01em); a **PR mode / Diff mode** segmented control; the search affordance (height 30, radius 8, `⌘K` hint in mono 11px, max-width 340) — a **button**, not a field: it opens the *Open a pull request* palette (§11); at the right `?` and `Dock`, both `.btn-secondary` height 30, font 13.

Segmented control, used throughout: container with 2px padding and a 1px seam border; options are borderless buttons, padding `4px 10px`, font 12, radius `--radius-sm`; selected `background: var(--color-accent-900); color: var(--color-accent-100)`, unselected transparent + `--color-neutral-400`.

### Sidebar resize

6px hit area on the sidebar's right edge (`position:absolute; right:0; top:0; bottom:0; cursor:col-resize`), transparent until hover, then `color-mix(in srgb, var(--color-accent) 45%, transparent)`. The **stored width is the single source of truth**, clamped on drag and on window resize to `[220, min(460, viewportW − 48 − dockWidth − 480)]` so the diff never drops below 480px. Never re-clamp at render.

### Responsive rules

- `narrow = width < 1300`.
- Below **1060px** the dock auto-collapses to its 44px rail; the user's open/closed preference is kept and re-applied above 1060.
- `tight = narrow && dockOpen` → the sidebar hides and the workspace shows a **top PR bar** instead; collapsing the dock brings the sidebar back. The sidebar must exist at some width at every viewport — it carries the repo and scope selectors and the resize handle.
- `centerW = width − 48 − (tight ? 0 : sidebarW) − (dockOpen ? 344 : 44)`.
- `centerW < 720` → the diff header's toolbar drops to its own full-width row and "Side by side" shortens to "Split".
- `centerW < 780` → the markdown Selections aside stacks under the document.
- Diff body scrolls horizontally at a minimum: inner container `min-width: 620px` (merged) / `860px` (side by side). **Line annotations are sized against the visible pane** (`width: centerW − 116`), not that wrapper — prose must never require horizontal scrolling.

**Top PR bar** (sidebar hidden): scrollable row, padding `8px 14px`. PR mode: a `←` back button and a `#412 ▾` chip cycling PRs within the repo, the PR title (max-width 320, ellipsis), then file chips. Diff mode renders **neither** button — the scope path shows instead (mono 12px, `--color-neutral-400`). Chips: padding `3px 9px`, mono 11.5px, radius 8; selected = accent border + `--color-accent-900` + `--color-accent-100`.

---

## Screens

### 1. PR inbox (opening screen, PR mode)

**Sidebar.** Top: the **repo selector** — full-width button (padding `6px 9px`, 1px seam, radius 8, font 12.5) with a 6px accent dot, the repo name (ellipsis) and `▾`. Its menu (`--pop-bg`, `--r-pop`, `--shadow-md`, 4px padding) lists tracked repositories with assigned counts, the current one in `--color-accent-200`, plus a separated **"Manage repositories…"** row in `--color-accent-300` jumping to Settings → Tracked repositories. Switching repo **replaces** the list — repositories are never mixed — and clears the selection.

Below: "Assigned to you" (heading font 15) + count + two ghost buttons pushed right, **`Add PR`** and `Refresh`; a mono 11px fetch line (`fetched 40s ago · gh · 4 assigned`); then rows, padding `9px 14px`, 2px transparent left border, selected = accent left border + `color-mix(in srgb, var(--color-accent) 9%, transparent)`, hover = 5% text tint.

Row: mono 11px `#412` + state pill + relative time; title 13.5px/1.35 `text-wrap: pretty`; a **wrapping** meta row (`gap: 4px 10px`, children `flex:none; white-space:nowrap`) with file count, `+add` `#6faa7e`, `−del` `#c47b7b`, an `added by you` pill when applicable (padding `0 5px`, radius 8, 1px `--color-neutral-700`, font 10), and the agent status pushed right.

State pill: padding `1px 6px`, radius 8, 1px border — open = `--color-accent-700` / `--color-accent-300`; draft = `--color-neutral-700` / `--color-neutral-400`.

Agent status: `agent reviewing…` in `--color-neutral-400` while running; `agent: request changes` in `--color-accent-300` when a result exists; nothing when idle.

**Center.** Padding `22px 26px 40px`, max-width 760. `h4` "Pending review" and a 13px `--color-neutral-500` subtitle built from live state: `{repo} · {n} pending · polled every {interval}` (+ ` · automatic review on new commits` when enabled). Then one card per PR: `--color-surface`, 1px seam, radius 8, padding `14px 16px`, margin-bottom 10, hover border `--color-neutral-700`. Card: mono 11px `repo · #id` + state pill + time; 16px heading-font title; wrapping mono meta row (branch, files, +/−, comments, `added by you`, agent status). When the description references a spec file, a footer above a 9px top divider: the spec path in mono `--color-accent-300`, then `spec referenced in the description · introduced in #398` in `--color-neutral-600`, with that PR linked.

### 2. Review workspace — diff

**Sidebar becomes the file tree.** Header (padding `10px 12px`): `← All PRs` ghost button (PR mode only, `white-space: nowrap`), the PR title at 13px, the branch in mono 11px. In **diff mode** the header instead carries the **scope selector** — same button shape with a `◨` glyph and the path in mono 11.5px — whose menu lists scopes with a kind label each (`working tree`, `folder`, `patch file`) and a final **"Open folder or .diff…"** row. Sample scopes: `~/dev/atelier` (working tree), `~/dev/atelier/backend/src` (folder), `~/dev/shiphero-api` (working tree), `poller-clamp.diff` (patch file).

Then an overline row `FILES` + `3/6 viewed` (mono, right). File rows: `display:flex; gap:8px; padding:6px 12px`, 2px left border + 9% accent tint when selected, with

- a 6px **status dot** — added `#6faa7e`, renamed `--color-accent`, deleted `#c47b7b`, modified `--color-neutral-600`;
- the **basename** in mono 11.5px, ellipsis, `--color-text` selected / `--color-neutral-400` otherwise;
- a **comment badge** when > 0: 10px, padding `1px 5px`, radius 8, `--color-accent-900` on `--color-accent-200`;
- a **viewed checkbox**: 15px, radius 4, 1px `--color-neutral-700` (accent + `--color-accent-900` when checked), `✓` 10px `--color-accent-200`. Clicking it must not select the file.

PR-mode footer: worktree path in mono 11px `--color-neutral-500`, then a full-width `.btn-primary` **"Submit review · {n}"**.

**File header** (`flex-wrap: wrap`, `gap: 8px 12px`, padding `8px 14px`): the path's directory in mono 12.5px `--color-neutral-600`, shrinkable with ellipsis, then the **basename** in `--color-text` at `flex: none` so it is never clipped, then `+34` / `−12` in mono 11px. Right (or its own row when `centerW < 720`): **Merged / Side by side** segmented; the **diff-theme picker** (`.btn-secondary` with two 9px swatches, the theme name and `▾`); **Focus** / **Exit focus**; an `Agent review · 4` `.btn-secondary` when a review exists; and `Mark viewed` / `Viewed ✓`. Buttons height 28, font 12.

**Diff body.** `overflow: auto`, mono 12.5/1.65.

*Merged:* per row two 46px right-aligned number gutters (`--color-neutral-700`, `user-select:none`), the line action button, then the code (`white-space: pre-wrap; word-break: break-word`, padding `0 12px 0 6px`), prefixed `+ `, `- ` or two spaces. Hunk headers take a full row on `--color-neutral-900` with `···` in the first gutter and no action button.

*Side by side:* two equal columns (`flex: 1; min-width: 0`) with `1px solid var(--hairline)` between them — this seam survives Tonal. Left = removed/context, right = added/context with the action button; a removed line leaves the right empty and vice versa; backgrounds apply per side.

**Line action button** — 18px square, radius 4, 1px `--color-neutral-800`, `--color-neutral-500` **Phosphor `dots-three`** at 11px, hover `--color-accent-200` + accent border. Deliberately not a `+`, which reads as an addition marker. It opens the **line menu**: 244px `--pop-bg` card at `left: 108px; top: 22px`, `--r-pop`, `--shadow-md`, 4px padding; full-width left-aligned rows (padding `7px 9px`, font 13, hover 8% text tint): **Add review comment** (PR mode only), **Ask the agent here**, **Copy line reference**, then a mono 11px footer with the reference itself.

**Line-anchored artifacts** — all `margin: 6px 0 8px 92px`, width `centerW − 116`, body font:

- **Agent finding** — left 2px accent border, `--color-accent-900` fill, radius `0 8px 8px 0`, padding `9px 12px`; header `review-agent · opencode` in mono 11px `--color-accent-200` + severity in `--color-neutral-600`; body 13px/1.5; actions `Keep in review` (primary), `Dismiss` (secondary), `Discuss` (ghost → inline chat on that line).
- **Others' comments, folded by default** — a pill button (1px seam, radius 8, padding `4px 10px`, font 12, `--color-neutral-400`) reading `{n} comments from others · {first author}`; expanded, a container whose replies are separated by top dividers, each with a mono 11px `author · when` and 13px/1.5 body, plus a reply composer. **Threads are preserved** — replies belong to the comment, not the line.
- **Your pending comment** — 1px `--color-accent-700`, radius 8, padding `10px 12px`, mono 11px `You · pending in this review`.
- **Comment composer** — `--color-surface` fill; the reference in mono 11px, a `.input` textarea (min-height 64, font 13), then `Add to review`, `Cancel`, and `Ask agent instead` (ghost, pushed right).

**In-place agent chat.** Opening it must **not** move the diff. The card renders at **pane level**, outside the horizontally scrolled diff body: `position: absolute; right: 16px; bottom: 16px; width: min(400px, calc(100% − 32px))`, `--pop-bg`, `--r-pop`, `--shadow-lg`. Header: 6px accent dot, "Inline chat", the reference in mono 11px (ellipsis), `–` (minimize), `×` (close). Body: max-height 240, scrollable, 9px gaps; the user's turn a right-aligned 12px bubble (`--color-accent-900` on `--color-accent-100`, radius 4, max-width 88%), the agent's turn plain 12.5px/1.55 with inline mono identifiers; suggestion chips (`Show me the diff`, `Turn into comment`). Footer: input + `Send`.

The **anchor line stays tinted** `color-mix(in srgb, var(--color-accent) 20%, transparent)` while open, and the line keeps a **gutter chat marker** beside the action button: 18px square, radius 4, `--color-accent-900` fill, 1px border (`--color-accent-700`, full accent while open), Phosphor `chat-centered` 11px. That marker is the way back to a minimized chat — minimizing hides the card and leaves the marker; clicking toggles. There is no floating pill stack.

### 3. Markdown review (rich / raw)

Header: same directory + basename treatment; for a spec, `spec · introduced in #398` with the PR linked; right a **Rich / Raw diff** segmented control and, when selections exist, `2 selections · merged per line on submit` in mono 11.5px `--color-accent-300`.

**Rich view.** Padding `26px 0 60px`; a wrapping row (max-width 1140, `padding: 0 24px`, gap 20) with the document column (`flex: 1 1 420px; max-width: 720px`) and a 224px **Selections** aside that stacks below the document when `centerW < 780`. A 11.5px `--color-neutral-600` hint at the top: *"Select any text — a line, a phrase, a whole section — to comment or ask the agent about it."*

Rendering: `h3` title, `h5` sections, paragraphs 15px/1.65 `text-wrap: pretty`, inline code mono 12.5px on `--color-neutral-900` (`padding: 1px 5px; radius 4`), fenced blocks mono 12px/1.6 on `--color-neutral-900` (radius 8, padding `12px 14px`, `overflow-x: auto`), tables via `.table` at 13px.

**Custom selection actions.** Selecting text in the document shows a floating toolbar: `position: fixed`, 42px above the selection rect and clamped on screen; `--pop-bg`, `--r-pop`, `--shadow-md`, 3px padding; a mono 11px `{basename} · selection` label then **Comment**, **Ask the agent**, **Copy reference** (padding `5px 9px`, font 12.5, hover 8% tint). The buttons must `preventDefault` on mousedown so the selection survives the click.

Comment or Ask opens an anchored card (`position: fixed` below the selection, `width: min(400px, calc(100vw − 40px))`, `--shadow-lg`): header with title (`Proposed change` / `Agent · on selection`), the reference, close; the quoted selection in 12px italic `--color-neutral-400` between dividers; then either a textarea + `Add to review` + `Ask agent instead`, or the agent's answer with `Use as proposed change` / `Turn into comment` and an ask input.

**Existing selection threads** appear two ways at once: the selected run is highlighted (`color-mix(in srgb, var(--color-accent) 14%, transparent)`, 26% when open, 1px `--color-accent-600` bottom border) and a **margin marker** sits right of the block (26×24, radius 4, 1px border, mono 11px, showing the count or `−` when open). Either opens the card inline under the block. The aside lists the same threads as small cards (`lines 22–24 · draft`, `line 47 · 1 reply`).

On submit, **custom selections on the same line merge into one comment before pushing** — stated in the submit dialog.

**Raw view.** The file's own diff, rendered like the code diff (52px first gutter, same action button and menu).

### 4. Add a PR manually

**Purpose:** review a PR that was never assigned to you.

Entry: the **`Add PR`** ghost button in the PR-list header (title: *"Review a PR that isn't assigned to you"*). Modal, max-width 520:

- `h4` **"Review a PR"**, the current repository in mono 11.5px at the right, close `×`.
- A 12.5px `--color-neutral-500` line: *"Anything you paste here is added to your list even if it is not assigned to you."*
- Field **"PR URL or number"** — mono 12px input (full URL, `#415`, or bare number resolved against the selected repo) plus a **`Resolve`** secondary button.
- **Resolved preview** after resolving: 1px `--color-accent-700`, radius 8, padding `11px 13px` — mono 11px number + state pill + `opened 1h ago`; title 13.5px/1.35; wrapping mono 11px meta (author, branch, files, `+142` / `−96`). Nothing is added until the user commits.
- Overline **"Or pick an open PR in this repo"** and a scrollable multi-select list (max-height 200) of the repo's open PRs not assigned to the user — checkbox, title 12.5px (ellipsis), mono 10.5px `#id · author · updated`. Already-added PRs are filtered out.
- Checkbox *"Run the automatic review once the worktree is ready"* (default on).
- **`Add to my list`** (primary; `Add {n} PRs to my list` for several), `Cancel`, and an 11.5px note *"a worktree is created on open"*.

**After adding:** the PR appears at the **top of that repository's list** (manually added first, then assigned), carries an `added by you` pill in the sidebar row and the inbox card, and behaves exactly like an assigned PR — worktree, comments, agent review, submit, and on to Past reviews. Worth designing in implementation: unresolvable input, a PR in an untracked repository (offer to track it), a duplicate, and a per-row remove.

### 5. Automatic review results

Opened from `Agent review · 4` (or `r`). Overlay over the center pane only: backdrop `color-mix(in srgb, var(--color-bg) 82%, transparent)`; panel max-width 720, `--pop-bg`, `--r-pop`, `--shadow-lg`, padding `20px 22px`, scrollable.

Header: `h4` "Automatic review" + a mono 11.5px provenance line `opencode · reviewer.md · effort high · 3m 12s ago` + close.

**Suggested conclusion** block: 1px `--color-accent-700`, radius 8, padding `12px 14px`; 11px uppercase `--color-accent-300` overline; the verdict at 17px heading font; the reasoning at 13px/1.55 `--color-neutral-300`.

Then an 11px uppercase count overline and one card per finding (1px seam, radius 8, padding `10px 12px`, hover `--color-neutral-600`, click jumps to the line): mono 11px reference in `--color-accent-300` + severity in `--color-neutral-500`, body 13px/1.5.

Footer: `Accept all into my review` (primary), `Keep 2 selected` (secondary), `Re-run` (ghost). The same findings also appear inline in the diff, so this panel is a summary, not the only surface.

### 6. Submit review

Modal, max-width 560. Header `h4` "Submit review" + `#412 · 5 pending` in mono 11.5px. Three verdicts as full-width left-aligned buttons (padding `10px 12px`, radius 8, 1px seam → `--color-accent` when selected), each a 13.5px label over a 12px `--color-neutral-500` hint: **Comment** ("Submit notes without a verdict"), **Approve** ("Agent agreed on 2 of 4 findings"), **Request changes** ("Agent suggests this"). Then an overall-feedback textarea, the merge note about markdown selections, and `Submit` / `Cancel`.

### 7. Past reviews

Sidebar becomes a filter list (`All`, `Approved`, `Changes requested`, `Commented`): 13px rows, padding `7px 10px`, radius 4, selected `--color-accent-900` + `--color-accent-100`.

Center: `h4` "Past reviews", a 13px `--color-neutral-500` subtitle, then a `.table` (13px): PR / Title / Your verdict / Agent / Worktree / action. Verdict pill (11.5px, padding `1px 7px`, radius 8): approved `rgba(111,170,126,0.5)` border on `#8fc09d`; changes requested `rgba(196,123,123,0.5)` / `#d59a9a`; commented neutral. The **Agent** column records whether the agent agreed with you (`agreed` / `disagreed` / `not run`) — how the automatic reviewer earns trust over time. Worktree shows the path or `—`; the row action is `Remove worktree` or `Reopen`. Below: `Manage worktrees` (secondary) and a 12px total (`5 worktrees · 1.2 GB on disk`).

### 8. Settings

Sidebar nav: **Accounts, Tracked repositories, Review agent, Fetching, Appearance, Worktrees, Shortcuts**. Center is one scrolling column (max-width 660, padding `22px 26px 50px`, 26px between sections); each section is an `h5` + a 12.5px `--color-neutral-500` description + controls. Two-column grids: `grid-template-columns: 1fr 1fr; gap: 12px`.

**Accounts.** One row per provider in a bordered container (rows separated by dividers, padding `11px 13px`, wrapping): a 7px status dot (connected `#6faa7e`, pending `--color-accent` + pulse, disconnected `--color-neutral-700`), the name at 13.5px, a mono 11.5px meta line (`sebastiandev · repo, read:org` / `Not connected` / `Waiting for authorization…`), and the action — `Connect` (primary), `Reauthorize` (secondary), `Authorizing…` while pending. Description: *OAuth tokens are stored in your OS keychain.*

**Device flow** (the designed auth path), modal max-width 440:

1. *Code step.* Explanatory copy; the user code at 26px mono, 0.14em, `--color-accent-200`, in a `--color-accent-700`-bordered box (padding 14) with `Copy` → `Copied`; below, `expires in 14:32 · scopes: repo, read:org` in mono 11.5px. Actions `Open github.com/login/device` (primary), `Cancel`. A separated ghost row offers **"Use the token from the gh CLI instead"** (`glab CLI` for GitLab) — the one-click path for anyone already authenticated locally.
2. *Polling.* An 8px accent dot pulsing (`@keyframes pulse` 0/100% opacity 0.3 → 50% opacity 1, 1.4s ease-in-out infinite), "Waiting for you to approve in the browser…", a 12.5px line repeating code and host + `Polling every 5s`, then `Reopen the page` / `Cancel`.
3. *Done.* Green dot, "{Provider} connected", "Token stored in the keychain. First fetch runs now.", `Done`.

The account row mirrors the phase throughout.

**Tracked repositories.** Description: *Each repository is fetched separately; you review one at a time from the rail's selector.* A bordered list: checkbox, `owner/name` in mono 12px, an 11.5px `--color-neutral-500` line (`github · 4 assigned · auto-review on`), `Remove` ghost. Below, **`Track a repository…`** (primary) → modal (max-width 500) with (a) an `owner/name` field plus a **GitHub / GitLab** segmented control, (b) overline "Or pick from your account" and a scrollable multi-select of repos discovered on the connected account with open-PR counts, (c) a checkbox *"Run the automatic review on this repository too"*, (d) `Track {n} repositories` / `Cancel`. The modal earns its place because there are two ways in plus a per-repo option.

**Review agent.** Description: *Runs on demand and, optionally, on every fetch.* A 2×2 grid:

- **Provider** — `opencode`.
- **Agent file** — a read-only path field (mono 12px, ellipsis) plus **`Browse…`** opening a picker (max-width 520): "Choose an agent file" with a mono `*.md` hint, then a scrollable list of discovered files — `◫` glyph, path in mono 12px, 11px `--color-neutral-500` note (`in this repo · 4.1 KB · edited 2d ago`, `global · shared across projects`) — the current one tinted 12% accent. Footer `Browse the filesystem…` and a note naming the scanned locations (`.atelier/agents`, `~/.config/opencode/agent`).
- **Model** — a dropdown **populated from opencode's configured providers**, menu headed `FROM OPENCODE · 3 PROVIDERS` (10.5px uppercase), rows showing the provider-qualified id in mono 12px + a 10.5px note. Samples: `anthropic/claude-sonnet-4.5` (default), `anthropic/claude-opus-4.1` (slower), `openai/gpt-5-codex`, `google/gemini-2.5-pro`, `ollama/qwen3-coder:30b` (local).
- **Effort / variant** — segmented `low / medium / high`.

**Fetching.** Poll interval segmented (`1 min / 5 min / 15 min / manual`) and a checkbox *"Run the automatic review on newly fetched commits"* (15px box, radius 4, accent + `--color-accent-900` + `✓` when on). Both feed the inbox subtitle.

**Appearance.** *Default diff view* (Merged / Side by side), **Surface style** (Framed / Tonal), **Theme** (the seven palettes), **Code font** (the four faces), **Diff theme** (the eight swatch pairs). Style, Theme and Code font render as bordered cards, each a 12.5px label over a 10.5px `--color-neutral-500` note, accent border when selected.

**Worktrees.** Description: *Created when you open a PR for review; safe to remove once the PR is closed.* Bordered list: checkbox, path in mono 12px, `#412 · open · 284 MB` at 11.5px, `Remove` ghost. Below: `Remove selected · {n}` and `Remove all for merged PRs`. Reachable from Past reviews.

### 9. Chat dock (always available)

Header (padding `9px 12px`): "Chat" in heading font 13.5px, the scope in mono 11px (`#412` / `inbox` / `working tree`), a `›` collapse button. A context chip row (11px mono chips on `--color-neutral-900`, radius 10) shows what the chat can see: current file and file count. Body: scrollable, 12px gaps; user turns as right-aligned accent bubbles, agent turns as 13px/1.6 prose with a numbered breakdown (mono `01`/`02`/`03` in `--color-accent-300`), then suggestion chips (`Where is it read?`, `Draft that comment`, `Compare to the spec`). Footer: input + `Send` and a 10.5px mono provenance line `opencode · reviewer.md · worktree attached`.

Collapsed: a 44px rail with `‹` and the vertical word "Chat" (`writing-mode: vertical-rl`, 11px uppercase, 0.08em).

### 10. Keyboard shortcuts sheet

`?` opens a modal (max-width 560) titled "Keyboard" with `? to close` in mono 11.5px and a two-column grid (`gap: 6px 24px`): a mono 11.5px `--color-accent-300` key (min-width 54) and a 12.5px `--color-neutral-300` label, rows separated by dividers.

| Key | Action |
|---|---|
| `⌘K` | open a pull request (palette) |
| `f` | focus mode |
| `j` / `k` | next / previous file |
| `⏎` | open selected PR |
| `esc` | back / close |
| `u` | merged diff |
| `s` | side by side |
| `m` | rich ↔ raw markdown |
| `c` | comment on the focused line |
| `a` | ask the agent in place |
| `y` | copy line reference |
| `d` | toggle the chat dock |
| `v` | mark file viewed |
| `⌘⏎` | submit review |
| `r` | run the automatic review |
| `?` | this sheet |

Wired in the prototype: `⌘K`, `f`, `?`, `esc`, `d`, `u`, `s`, `m`, `r`, `j`, `k`. The rest are specified and should be implemented. Guard every handler against firing while focus is in an `input` or `textarea`.

### 11. Open a pull request (⌘K palette)

Opened by `⌘K`/`Ctrl+K` from anywhere, or by clicking the top-bar search affordance. It replaces free-text search as the primary way to move between PRs.

Overlay: `position: fixed; inset: 0`, backdrop `color-mix(in srgb, var(--color-bg) 72%, transparent)`, content top-anchored with `padding: 84px 24px 24px` (the palette should never be vertically centred — it must not move as the result count changes). Card: `width: 100%; max-width: 660px; max-height: 62vh`, `--pop-bg`, 1px seam, `--r-pop`, `--shadow-lg`, `overflow: hidden`, column flex. Backdrop click and `esc` close; the card stops propagation.

- **Input row** — height 46, padding `0 14px`, bottom `--hairline`: a 13px `⌕` in `--color-accent`, then a **borderless, transparent** input (body font 14px, placeholder *"Open a pull request"*) — the row is the field, so there is no box-in-a-box. Autofocused on open. At the right, a mono 11px count in `--color-neutral-600`: `32 pending` with no query, `7 of 32` while filtering.
- **Results** — scrollable, `overflow-x: hidden`, 6px vertical padding, **grouped by repository**. Group header: mono 10.5px uppercase, 0.06em tracking, `--color-neutral-600`, the repo name (ellipsis) left and `4 prs` right.
- **Row** — `display: flex; gap: 10px; padding: 7px 14px`, fixed columns so nothing ever overflows: `#48048` in mono 11.5px `--color-neutral-500` at **width 54**; the title in body font 13.5px, `flex: 1; min-width: 0`, single line with **ellipsis**; `19 files` in mono 11px `--color-neutral-600`; the author in mono 11px `--color-neutral-500`, right-aligned at **width 104**, ellipsis; then a 12px slot holding `↵`, visible only on the highlighted row. The layout is columnar on purpose — the implementation's palette lets long titles collide with the author and produces a horizontal scrollbar.
- **Highlight** — one row only: `background: color-mix(in srgb, var(--color-accent) 15%, transparent)` plus `box-shadow: inset 2px 0 0 var(--color-accent)`. Mouse-over moves the highlight (it does not fight the keyboard: hovering sets the same index arrows move).
- **Empty state** — `No pull request matches {query}`, the query in mono `--color-neutral-400`.
- **Footer** — height 34, top `--hairline`, mono 10.5px `--color-neutral-600`: `↑↓ move`, `↵ open`, `⌘↵ browser`, and `esc close` pushed right.

Matching runs over title, number, author, branch and repo (case-insensitive substring; a fuzzy matcher is fine in implementation). Arrow keys move within the flat result order across group boundaries; `↵` opens the highlighted PR — which selects it, switches the sidebar to its file tree and opens the first file — and clears the query. `⌘↵` is specified for *open on the host in a browser* and is not wired in the prototype.

### 12. Focus mode

For long reads. Toggled by **Focus** in the diff toolbar, by `f`, and off again with `esc` or the same button (relabelled **Exit focus**).

Hidden: the top bar and the icon rail. Kept: the file list, the diff, and the chat dock — the three things a review actually needs. Readability: the diff body goes **12.5px/1.65 → 13.5px/1.95** (the same code font, just larger and airier); nothing else resizes, so no layout reflows beyond the reclaimed 46px and 48px.

It is scoped to the workspace (`view === 'files' || mode === 'diff'`), so the toolbar carrying the exit is always on screen; leaving the workspace suspends it rather than trapping the user in a chromeless inbox. Implement it as a single flag on the app root, not as a separate layout.

---

## Interactions & behavior

- **Mode switch** resets to that mode's landing state: PR mode → inbox; diff mode → the scope's file list. Diff mode hides everything comment- and PR-related: no comment action in the line menu, no submit button, no others'-comments strips, no PR chip or back button in the top bar.
- **Selecting a PR** replaces the sidebar with the file tree and opens the first file. This is where the real app **creates the worktree and checks out the branch** — needs a progress state (creating → fetching → ready) that the prototype only implies via the sidebar footer path and the status bar (`worktree ready · {branch}`).
- **Adding a PR manually** does not change fetch behavior: it is polled with the rest of the repository's PRs, and its automatic review starts when the worktree is ready if that checkbox was left on.
- **Repo switch** clears the selected PR (per-repo retention of pending review state is a product decision).
- **Line menu** is single-open and closes on `esc`.
- **Inline chats** are per line, minimize to the gutter marker, and several can exist; the prototype shows one card at a time.
- **Others' comments** are folded by default, expand in place, keep their threads, and are read-only apart from replying.
- **Automatic review** runs per PR (on demand, or on newly fetched commits). Rows show `agent reviewing…` while running. Results arrive as inline findings plus the panel and carry a suggested conclusion that pre-selects nothing — the human still chooses.
- **Device flow** polls until approved (≈2.6s in the prototype); Cancel aborts the poll.
- **⌘K** takes precedence over every other key handler and works while focus is in an input; every other shortcut is guarded against `input`/`textarea`.
- **Focus mode** persists across file switches within a PR; it is a view preference, not per-file state.
- **Appearance changes apply live** — palette, surface style, diff theme and code font all re-render immediately, with no reload and no per-component code.
- **Motion**: none decorative. The only animation is the 1.4s pulse on pending status dots; hovers are instant color/border changes.
- **Copy reference** puts `{path}:{line}` (for markdown selections, plus the quoted text) on the clipboard.

## State

| State | Type | Notes |
|---|---|---|
| `mode` | `'pr' \| 'diff'` | drives everything comment-related |
| `view` | `'inbox' \| 'files' \| 'past' \| 'settings'` | sidebar/center pair |
| `repo`, `scope` | string | selected repository / diff scope |
| `prId`, `fileIdx` | id, index | current selection |
| `addedPrIds[]` | ids | manually added PRs, listed before assigned ones |
| `addOpen`, `addResolved`, `addPicks[]`, `addAuto` | dialog state | "Review a PR" modal |
| `diffMode` | `'unified' \| 'split'` | seeded from the setting |
| `mdMode` | `'rich' \| 'raw'` | |
| `focus` | boolean | focus mode; only takes effect inside the workspace |
| `paletteOpen`, `pq`, `pi` | boolean, string, index | ⌘K palette: open, query, highlighted row |
| `diffThemeMenu` | boolean | the toolbar picker's menu |
| `codeFont` | string | diff-body face; persist it |
| `dockOpen` | boolean | preference; auto-collapsed below 1060px without being overwritten |
| `sbW` | number | sidebar width, clamped on write |
| `menuLine`, `composerLine`, `chatLine`, `minimizedChats[]` | line ids | per-line UI |
| `myComments{lineId: body}` | map | pending review comments |
| `othersOpen{lineId: bool}` | map | fold state |
| `viewed{fileIdx: bool}` | map | viewed checkboxes |
| `selRect`, `selText`, `selCard` | rect, string, `'comment' \| 'agent' \| null` | markdown custom selection |
| `agentPanelOpen`, `reviewOpen`, `shortcutsOpen`, `oauth`, `picker`, `trackOpen`, `modelMenu`, `repoMenu`, `scopeMenu` | overlays | `esc` closes |
| `styleMode`, `theme`, `diffTheme`, `defaultDiffMode`, `poll`, `autoOnFetch`, `effort`, `agentFile`, `model`, `connected{}`, `trackedRepos[]` | settings | persist all of these |
| `verdict` | `'comment' \| 'approve' \| 'changes'` | submit dialog |

Backend data required: assigned PRs per tracked repo (id, title, branch, state, updated, file count, +/−, comment count, spec reference and the PR that introduced it); open PRs in a repo not assigned to you, and single-PR lookup by URL or number (for the add dialog); file lists with status, +/− and comment counts; diffs as hunks with old/new line numbers; comment threads with authors and timestamps; agent review results (per-line findings with severity, a suggested conclusion, a summary); worktree inventory with sizes; past reviews with your verdict and whether the agent agreed.

## Assets

No images. Two inline Phosphor icons (`chat-centered`, `dots-three`); other glyphs are text characters (`◧ ◷ ⚙ ◨ ◫ ▾ ‹ › ← × – ✓ ⌕`) — replace them with proper Phosphor icons. The app mark is the text `</>` in JetBrains Mono at `--color-accent`, no container. Fonts from Google Fonts (Inter, JetBrains Mono).

## Files

- `delta.md` — what changed since the previous handoff, and what implementation work each change implies. Read it first if you already built against the earlier bundle.
- `prototype/Review.dc.html` — the full interactive prototype (all screens, both modes, all three appearance axes), with `support.js` and the vendored stylesheet beside it.
- `design-system/styles.css` — Nocturne tokens + component classes; usable as-is if the target app can take a stylesheet.
- `design-system/readme.md` — the design system's own guide.
- `design-system/theme.json`, `design-system/_ds_manifest.json` — theme parameters and component inventory.
