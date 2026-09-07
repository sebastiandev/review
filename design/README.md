# Handoff: Review — PR review app with in-place AI agent

## Overview

Review is a local web app for reviewing pull requests with an AI agent in the loop. It fetches PRs assigned to you from configured accounts (GitHub, GitLab), shows the diff, and makes **every line actionable**: leave a review comment, open an in-place chat with a review agent, or copy a line reference. A chat dock is always available for the whole PR/diff, and markdown files get a rich reading view where any text selection carries the same three actions.

Two modes:

- **PR mode** — full workflow: fetch assigned PRs per repository, **add any PR manually even when it is not assigned to you**, create a worktree and check out the branch, comment on lines, see others' comments (folded, threaded), run an automatic review, submit as comment/approve/request-changes, browse past reviews, manage worktrees.
- **Diff mode** — drops PR fetching and review comments; focuses on one diff scope: a working tree, a folder inside a repo, or a `.diff` patch file. Intended for launching the app against a given diff (`review ~/dev/atelier` or `review poller-clamp.diff`).

## About the design files

The files in `prototype/` are **design references written in HTML** — a working prototype of the intended look and behavior, not production code to lift. Implement these designs in the target codebase's own environment (React + Vite is the natural fit given the app is a local web app; use whatever the repo already has) following its established patterns, component library and state conventions. The prototype's own structure (a single streaming component with a render-values function) is an artifact of the design tool and should **not** be reproduced.

`prototype/Review.dc.html` opens directly in a browser. Everything below is measured from it.

## Fidelity

**High fidelity.** Colors, type, spacing, radii, shadows, breakpoints and interaction states are final and are all listed here. Recreate the UI to match. The one thing deliberately not designed: real data loading/error states beyond what's listed under *Interactions*.

Content in the prototype is real content from `github.com/sebastiandev/atelier` (the diff is `backend/src/infrastructure/artifacts/pr_status_poller.py`, the markdown document is `docs/spec-agent-hooks.md`) plus plausible ShipHero repositories for the multi-repo case. Treat it as sample data.

---

## Design system

The app is built on **Nocturne**, included in full in `design-system/`:

- `design-system/styles.css` — **the** stylesheet: the token sheet (`:root` variables and 100–900 tonal ramps) plus a component layer (`.btn`, `.tag`, `.input`, `.field`, `.card`, `.table`, `.nav`, `.dialog`, `.hr`, `.lighten`). Link it once; take every color, font, spacing, radius and shadow from its variables.
- `design-system/readme.md` — the system's own guide (direction, color, type, interaction states, do/don't).
- `design-system/theme.json` — the machine-readable parameters the system was derived from.
- `design-system/_ds_manifest.json` — component/page inventory.

Rules that matter for this app, from that guide:

- Primary actions are **outlined** (1px accent border on transparent), never solid-filled.
- Keep chroma low outside the accent; surfaces, borders and muted text come from `--color-neutral-*`.
- Never flood a large area with the accent — it appears as a line, a mark or a low-alpha tint.
- Elevation on a dark ground is a hairline edge plus ambient darkness: use `--shadow-sm/md/lg`, don't stack shadows.
- Focus is always `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }` — never the browser default.
- Icons: **Phosphor** (https://phosphoricons.com). The prototype inlines two: `chat-centered` (gutter chat marker) and `dots-three` (line action button).
- Density is 0.70× — this system is dense on purpose. Use the `--space-*` scale.

### Base tokens (Nocturne)

| Token | Value |
|---|---|
| `--color-bg` | `#161826` |
| `--color-surface` | `#232532` |
| `--color-text` | `#e9e9ed` |
| `--color-accent` | `#9184d9` |
| `--color-divider` | `color-mix(in srgb, #e9e9ed 16%, transparent)` |
| accent ramp 100→900 | `#f5f4ff #e7e5fe #d2cefd #b5abfc #968ae0 #796cbf #5d5294 #423a6a #2b2741` |
| neutral ramp 100→900 | `#f3f5fe #e4e7f5 #cfd3e5 #b2b6ca #9397ab #75798c #595d6c #3f424d #292b31` |
| `--space-1…8` | `2.8 5.6 8.4 11.2 16.8 22.4` px |
| `--radius-sm/md/lg` | `4 / 8 / 14` px |
| `--shadow-sm` | `0 0 0 1px #3f424d` |
| `--shadow-md` | `0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,0.55)` |
| `--shadow-lg` | `0 0 0 1px #9397ab, 0 16px 40px rgba(0,0,0,0.65)` |
| `--font-heading` / `--font-body` | Inter, weight 500 headings / 400 body |

### Fonts

- **Inter** (400/500/600/700) — UI and prose. Loaded by `styles.css` via Google Fonts.
- **JetBrains Mono** (400/500) — all code, paths, refs, branch names, numeric meta. Load from Google Fonts. Code is set at **12.5px / line-height 1.65**.

### Type sizes used in the app (px)

| Use | Size |
|---|---|
| Section heading (`h4`) | 20 |
| Sub-heading (`h5`) | 16 |
| Body / list item | 13–13.5 |
| Inbox card title | 16 (heading font) |
| Meta, captions, chips | 11–12.5 (mono for paths/counts) |
| Overline labels | 11, uppercase, letter-spacing 0.08em |
| Code / diff | 12.5 (mono), line-height 1.65 |
| Device-flow user code | 26 (mono), letter-spacing 0.14em |

---

## Themes (keep the selector)

Two selectors are part of the product, both in **Settings → Appearance**, and both must survive implementation:

### 1. UI theme — three dark themes

Implemented by re-pointing the same token names on the app root. Nocturne is the stylesheet's own palette (no overrides); the other two override the variables below.

**Ember** — warm ink, amber accent:

```
--color-bg:#191614; --color-surface:#221f1c; --color-text:#efe9e1;
--color-divider: color-mix(in srgb,#efe9e1 16%, transparent); --color-accent:#d9a05b;
--color-accent-100:#fdf6ec; -200:#f8e7cf; -300:#eecfa6; -400:#e0b578; -500:#cc9350;
--color-accent-600:#a8763d; -700:#825b2f; -800:#5c4123; -900:#332515;
--color-neutral-100:#f7f4f0; -200:#eae5df; -300:#d5cec6; -400:#b6ada3; -500:#958b80;
--color-neutral-600:#776d63; -700:#5b524a; -800:#413a34; -900:#2a2521;
--shadow-sm: 0 0 0 1px #413a34;
--shadow-md: 0 0 0 1px #5b524a, 0 6px 18px rgba(0,0,0,0.55);
--shadow-lg: 0 0 0 1px #958b80, 0 16px 40px rgba(0,0,0,0.65);
```

**Slate** — cool, high contrast, reading first:

```
--color-bg:#10151a; --color-surface:#182029; --color-text:#f4f8fb;
--color-divider: color-mix(in srgb,#f4f8fb 18%, transparent); --color-accent:#79b8d1;
--color-accent-100:#f2fafd; -200:#dcf0f7; -300:#bde0ee; -400:#96cbe1; -500:#6faec8;
--color-accent-600:#558da6; -700:#416d80; -800:#2f4e5c; -900:#1e323b;
--color-neutral-100:#f5f8fa; -200:#e6ebef; -300:#d0d8de; -400:#aeb9c2; -500:#8c99a4;
--color-neutral-600:#6e7b86; -700:#545f69; -800:#3b444c; -900:#212930;
--shadow-sm: 0 0 0 1px #3b444c;
--shadow-md: 0 0 0 1px #545f69, 0 6px 18px rgba(0,0,0,0.6);
--shadow-lg: 0 0 0 1px #8c99a4, 0 16px 40px rgba(0,0,0,0.7);
```

Because every surface reads the tokens, no component needs per-theme code. Persist the choice; a `data-theme` attribute on the root plus three CSS blocks is the clean implementation.

### 2. Diff theme — four line-tint sets

Applied to added/removed line backgrounds and their text color. Presented in settings as swatch pairs (add/remove, 12px rounded squares) with a label.

| Theme | Added bg | Removed bg | Added text | Removed text |
|---|---|---|---|---|
| Nocturne | `rgba(111,170,126,0.13)` | `rgba(196,123,123,0.13)` | `#cfe4d5` | `#e8cdcd` |
| Muted | `rgba(140,150,170,0.14)` | `rgba(170,140,150,0.14)` | `#dcdfe8` | `#e6dade` |
| Vivid | `rgba(86,190,120,0.20)` | `rgba(226,96,96,0.18)` | `#e2f5e7` | `#fbdede` |
| Paper | `rgba(200,205,180,0.14)` | `rgba(205,185,170,0.14)` | `#eceada` | `#f0e2d8` |

Fixed regardless of diff theme: context text `--color-neutral-300`, hunk header row background `--color-neutral-900` with `--color-neutral-500` text, line numbers `--color-neutral-700`, `+` / `−` counts `#6faa7e` / `#c47b7b`.

---

## App shell

Fixed chrome, top to bottom, at the default width (≥1300px):

| Region | Size | Notes |
|---|---|---|
| Top bar | height 46, padding 0 14, bottom 1px divider | brand, mode toggle, search, actions |
| Icon rail | width 48, right 1px divider | Inbox `◧`, Past reviews `◷`, Settings `⚙`, avatar pinned bottom |
| Sidebar | width **306 default, resizable 220–460**, right 1px divider | PR list / file tree / settings nav / past filters |
| Center pane | `flex: 1; min-width: 0` | diff, markdown, inbox, settings, past reviews |
| Chat dock | width 344 open / 44 collapsed rail, left 1px divider | always-available chat |
| Status bar | height 26, top 1px divider, 11px mono `--color-neutral-600` | mode · worktree · `press ? for shortcuts` |

Top bar contents, left to right: `</>` mark (JetBrains Mono 15px, `--color-accent`, no container) + wordmark "Review" (heading font, 15px, letter-spacing −0.01em); segmented **PR mode / Diff mode**; a search affordance (30px tall, 1px divider border, radius 8, `⌘K` hint in mono 11px, max-width 340); right side `?` (shortcuts) and `Dock` buttons, both `.btn-secondary` at height 30, font 13.

Segmented control (used throughout): a 1px divider-bordered container with 2px padding; options are borderless buttons, padding `4px 10px`, font 12px, radius `--radius-sm`; selected = `background: var(--color-accent-900); color: var(--color-accent-100)`, unselected = transparent with `--color-neutral-400`.

### Sidebar resize

A 6px hit area on the sidebar's right edge (`position:absolute; right:-3px; top:0; bottom:0; cursor:col-resize`), transparent until hover, then `color-mix(in srgb, var(--color-accent) 45%, transparent)`. Drag updates the stored width; the **stored value is the single source of truth** and is clamped on drag and on window resize to `[220, min(460, viewportW − 48 − dockWidth − 480)]` so the diff pane never drops below 480px. Do not re-clamp at render.

### Responsive rules

Computed from the viewport width; the diff always has priority.

- `narrow = width < 1300`
- Below **1060px** the chat dock auto-collapses to its 44px rail (the user's open/closed preference is kept and re-applied above 1060).
- `tight = narrow && dockOpen` → the **sidebar is hidden** and the workspace shows a top PR bar instead (see below). Collapsing the dock brings the sidebar back. The rail, and therefore the repo/scope selectors, always exist at some width.
- `centerW = width − 48 − (tight ? 0 : sidebarW) − (dockOpen ? 344 : 44)`
- `centerW < 720` → the diff file header's toolbar drops to its own full-width second row and "Side by side" shortens to "Split".
- `centerW < 780` → the markdown "Selections" aside stacks under the document instead of beside it.
- Diff body has a horizontal-scroll minimum: inner container `min-width: 620px` (merged) / `860px` (side by side) inside `overflow: auto` — code scrolls, it never wraps to 3-character lines.

**Top PR bar** (only when the sidebar is hidden): a horizontally scrollable row, padding `8px 14px`, bottom divider. In PR mode: a `←` back button and a `#412 ▾` chip that cycles PRs within the current repo, then the PR title (max-width 320, ellipsis), then file chips. In diff mode those two buttons are **not** rendered — the scope path shows instead (mono 12px, `--color-neutral-400`). File chips: padding `3px 9px`, mono 11.5px, radius 8; selected = accent border + `--color-accent-900` fill + `--color-accent-100` text.

---

## Screens

### 1. PR inbox (opening screen, PR mode)

**Purpose:** see what's assigned and pending in the selected repository, and open one.

**Sidebar.** Top: the **repo selector** — a full-width button (padding `6px 9px`, 1px divider border, radius 8, font 12.5) with a 6px accent dot, the repo name (ellipsis) and `▾`. It opens a menu (`--color-surface`, radius 8, `--shadow-md`, 4px padding) listing the tracked repositories with their assigned-PR counts, the current one in `--color-accent-200`, and a divider-separated **"Manage repositories…"** row in `--color-accent-300` that jumps to Settings → Tracked repositories. Switching repo **replaces** the list (repos are never mixed) and resets the selection.

Below: "Assigned to you" (heading font 15px) + count + two ghost buttons pushed right, **`Add PR`** (see *Add a PR manually*) and `Refresh`; a mono 11px fetch line (`fetched 40s ago · gh · 4 assigned`); then the PR list, each row padding `9px 14px`, cursor pointer, 2px transparent left border, selected = accent left border + `color-mix(in srgb, var(--color-accent) 9%, transparent)` background, hover = `color-mix(in srgb, var(--color-text) 5%, transparent)`.

Row content: mono 11px line with `#412`, a state pill, and the relative update time; the title at 13.5px/1.35 with `text-wrap: pretty`; a wrapping meta row (`gap: 4px 10px`, items `flex:none; white-space:nowrap`) with file count, `+add` `#6faa7e`, `−del` `#c47b7b`, an `added by you` pill for manually added PRs (padding `0 5px`, radius 8, 1px `--color-neutral-700` border, `--color-neutral-400`, font 10px), and an agent status pushed right.

State pill: padding `1px 6px`, radius 8, 1px border — open = `--color-accent-700` border / `--color-accent-300` text; draft = `--color-neutral-700` / `--color-neutral-400`.

Agent status text: `agent reviewing…` in `--color-neutral-400` while running; `agent: request changes` in `--color-accent-300` when a result exists; nothing when idle.

**Center.** `padding: 22px 26px 40px`, content max-width 760. `h4` "Pending review" and a 13px `--color-neutral-500` subtitle assembled from live state: `{repo} · {n} pending · polled every {interval}` plus ` · automatic review on new commits` when that setting is on. Then one card per PR: `--color-surface`, 1px divider border, radius 8, padding `14px 16px`, margin-bottom 10, hover border `--color-neutral-700`. Card content: mono 11px `repo · #id` + state pill + time; 16px heading-font title; a wrapping mono meta row (branch, file count, +/−, comment count, agent status). If the PR description references a spec file, a footer separated by a 9px-padded top divider: the spec path in mono `--color-accent-300`, then `spec referenced in the description · introduced in #398` in `--color-neutral-600` — the PR that introduced the spec is linked.

### 2. Review workspace — diff (PR mode) / diff scope (Diff mode)

**Purpose:** read the diff, act on lines.

**Sidebar becomes the file tree** (the PR list is hidden; a `← All PRs` ghost button returns — PR mode only). Header block (padding `10px 12px`, bottom divider): back button, PR title 13px, branch in mono 11px ellipsis. In **diff mode** the header instead carries the **scope selector** — same button shape as the repo selector with a `◨` glyph and the scope path in mono 11.5px — opening a menu of scopes with a kind label each (`working tree`, `folder`, `patch file`) and a final **"Open folder or .diff…"** row. Scopes in the prototype: `~/dev/atelier` (working tree), `~/dev/atelier/backend/src` (folder), `~/dev/shiphero-api` (working tree), `poller-clamp.diff` (patch file).

Then an overline row: `FILES` + `3/6 viewed` (mono, right-aligned). Then the file rows: `display:flex; gap:8px; padding:6px 12px`, 2px left border (accent when selected, plus the same 9% accent tint), hover 5% text tint. Each row has

- a 6px **status dot** — added `#6faa7e`, renamed `--color-accent`, deleted `#c47b7b`, modified `--color-neutral-600`;
- the **basename** in mono 11.5px, ellipsis, `--color-text` when selected else `--color-neutral-400`;
- a **comment count badge** when > 0: font 10px, padding `1px 5px`, radius 8, `--color-accent-900` bg, `--color-accent-200` text;
- a **viewed checkbox**: 15px square, radius 4, 1px `--color-neutral-700` border (accent border + `--color-accent-900` fill when checked), `✓` at 10px in `--color-accent-200`. Clicking it must not select the file (stop propagation).

PR-mode footer (top divider, padding `10px 12px`): the worktree path in mono 11px `--color-neutral-500`, then a full-width `.btn-primary` **"Submit review · {n}"** where n is the pending-comment count.

**File header** (center pane top, `flex-wrap: wrap`, `gap: 8px 12px`, padding `8px 14px`, bottom divider): the directory part of the path in mono 12.5px `--color-neutral-600`, shrinkable with ellipsis; the **basename** immediately after in `--color-text`, `flex: none` so it is never clipped; then `+34` / `−12` in mono 11px. Right (or on its own row when `centerW < 720`): the **Merged / Side by side** segmented control, an `Agent review · 4` `.btn-secondary` when an automatic review exists, and a `Mark viewed` / `Viewed ✓` `.btn-secondary`. Both buttons are height 28, font 12.

**Diff body.** `overflow: auto`, mono 12.5/1.65.

*Merged (unified).* One row per line: two 46px right-aligned line-number gutters (`--color-neutral-700`, `user-select: none`), the **line action button**, then the code (`white-space: pre-wrap; word-break: break-word`, padding `0 12px 0 6px`). Line text is prefixed with `+ `, `- ` or two spaces. Hunk headers occupy a full row with `--color-neutral-900` background, `···` in the first gutter and no action button.

*Side by side.* Two equal columns (`flex: 1; min-width: 0`), 1px divider between them. Left = removed/context (its own 46px gutter), right = added/context with the action button. A removed line leaves the right side empty and vice versa; backgrounds are applied per side.

**Line action button** — 18px square, radius 4, 1px `--color-neutral-800` border, `--color-neutral-500` **Phosphor `dots-three`** glyph (11px), hover `--color-accent-200` + accent border. Deliberately *not* a `+`, which would read as an addition marker. Clicking opens the **line menu**: a 244px `--color-surface` card at `left: 108px; top: 22px`, radius 8, `--shadow-md`, 4px padding, with full-width left-aligned rows (padding `7px 9px`, font 13, hover 8% text tint):

1. **Add review comment** — PR mode only.
2. **Ask the agent here**.
3. **Copy line reference**.

and a mono 11px footer showing the reference itself (`{path}:{line}`).

**Line-anchored artifacts**, all indented `margin-left: 92px` with `max-width: 720px` and set in the body font:

- **Agent finding** — left 2px accent border, `--color-accent-900` background, radius `0 8px 8px 0`, padding `9px 12px`. Header: `review-agent · opencode` in mono 11px `--color-accent-200` plus a severity in `--color-neutral-600`. Body 13px/1.5. Actions: `Keep in review` (primary), `Dismiss` (secondary), `Discuss` (ghost → opens the inline chat on that line).
- **Others' comments, folded by default** — a pill button (1px divider border, radius 8, padding `4px 10px`, font 12, `--color-neutral-400`) reading `{n} comments from others · {first author}`; expanded it becomes a bordered card whose replies are separated by top dividers, each with a mono 11px `author · when` line and 13px/1.5 body, and a reply composer at the bottom. **Threads are preserved** — replies belong to the comment, not the line.
- **Your pending comment** — 1px `--color-accent-700` border, radius 8, padding `10px 12px`, mono 11px `You · pending in this review` header.
- **Comment composer** — `--color-surface` fill, 1px divider border; the target reference in mono 11px, a `.input` textarea (min-height 64, font 13), then `Add to review` (primary), `Cancel` (secondary) and, pushed right, `Ask agent instead` (ghost).

**In-place agent chat.** Opening it must **not** move the diff. The card is rendered at **pane level** (not inside the horizontally scrolled diff body): `position: absolute; right: 16px; bottom: 16px; width: min(400px, calc(100% − 32px))`, `--color-surface`, radius 8, `--shadow-lg`, z-index above the diff and below modals. Header: 6px accent dot, "Inline chat", the line reference in mono 11px (ellipsis), then `–` (minimize) and `×` (close). Body: max-height 240, `overflow-y: auto`, 10px padding, 9px gaps; the user's turn is a right-aligned 12px bubble (`--color-accent-900` bg, `--color-accent-100` text, radius 4, max-width 88%), the agent's turn is plain 12.5px/1.55 text with inline mono for identifiers; suggestion chips (`Show me the diff`, `Turn into comment`) below. Footer: an input row + `Send`.

The **anchor line stays tinted** `color-mix(in srgb, var(--color-accent) 20%, transparent)` while its chat is open, and the line keeps a **gutter chat marker** next to the action button: 18px square, radius 4, `--color-accent-900` fill, 1px border (`--color-accent-700`, full `--color-accent` while open), Phosphor `chat-centered` at 11px. That marker is how you get back to a minimized chat — minimizing hides the card and leaves the marker; clicking the marker reopens it, clicking again minimizes. There is no floating pill stack.

### 3. Markdown review (rich / raw)

**Purpose:** read a spec or doc as prose, comment on it like a document.

Header: same directory + basename treatment; when the file is a spec, `spec · introduced in #398` with the PR linked; right side a **Rich / Raw diff** segmented control and, when selections exist, `2 selections · merged per line on submit` in mono 11.5px `--color-accent-300`.

**Rich view.** `padding: 26px 0 60px`, a wrapping row (max-width 1140, `padding: 0 24px`, gap 20) with the document column (`flex: 1 1 420px; max-width: 720px`) and a 224px **Selections** aside — which **stacks below the document** when `centerW < 780`. A one-line 11.5px `--color-neutral-600` hint at the top of the document reads: *"Select any text — a line, a phrase, a whole section — to comment or ask the agent about it."*

Markdown rendering: `h3` for the title, `h5` for section headings, paragraphs 15px/1.65 with `text-wrap: pretty`, inline code in mono 12.5px on `--color-neutral-900` with `padding: 1px 5px; border-radius: 4px`, fenced code blocks in mono 12px/1.6 on `--color-neutral-900`, radius 8, padding `12px 14px`, `overflow-x: auto`, and tables via the system's `.table` at 13px.

**Custom selection actions** (the doc-like behavior): selecting text anywhere in the document shows a floating toolbar — `position: fixed`, 42px above the selection rect, clamped to stay on screen; `--color-surface`, radius 8, `--shadow-md`, 3px padding; a mono 11px `{basename} · selection` label then three borderless actions: **Comment**, **Ask the agent**, **Copy reference** (padding `5px 9px`, font 12.5, hover 8% text tint). The toolbar buttons must `preventDefault` on mousedown so the selection survives the click.

Choosing Comment or Ask opens an anchored card (`position: fixed` just below the selection, `width: min(400px, calc(100vw − 40px))`, `--shadow-lg`): header with title (`Proposed change` / `Agent · on selection`), the reference, and a close button; the quoted selection in 12px italic `--color-neutral-400` between dividers; then either a textarea + `Add to review` + `Ask agent instead`, or the agent's answer with `Use as proposed change` / `Turn into comment` and an ask input.

**Existing selection threads** are shown two ways at once: the selected run of text is highlighted (`color-mix(in srgb, var(--color-accent) 14%, transparent)`, 26% when its card is open, with a 1px `--color-accent-600` bottom border) and a **margin marker** sits to the right of the block — 26×24, radius 4, 1px border, mono 11px, showing the comment count (or `−` when expanded). Clicking either opens the card inline under the block. The aside lists the same threads as small cards (`lines 22–24 · draft`, `line 47 · 1 reply`) as a second way in.

On submit, **custom selections that fall on the same line are merged into one comment before pushing** — stated in the submit dialog.

**Raw view.** The markdown file's own diff, rendered exactly like the code diff (same gutters, same action button and menu, 52px first gutter).

### 3b. Add a PR manually

**Purpose:** review a PR that was never assigned to you — a colleague asks for a second pair of eyes, or you want to read something before it lands.

Entry point: the **`Add PR`** ghost button in the PR-list header (title attribute: *"Review a PR that isn't assigned to you"*). It opens a modal (max-width 520, same shell as the other dialogs).

Contents, top to bottom:

- Header `h4` **"Review a PR"** with the current repository in mono 11.5px on the right, and a close `×`.
- A 12.5px `--color-neutral-500` line: *"Anything you paste here is added to your list even if it is not assigned to you."*
- Field **"PR URL or number"** — a mono 12px input (accepts a full `github.com/owner/repo/pull/415` URL, a `#415`, or a bare number, resolved against the selected repository) paired with a **`Resolve`** secondary button.
- **Resolved preview** (appears after resolving): a 1px `--color-accent-700` bordered card, radius 8, padding `11px 13px` — mono 11px row with the number, the state pill and `opened 1h ago`; the title at 13.5px/1.35; a wrapping mono 11px meta row with author, branch, file count and `+142` / `−96`. This is the confirmation step: no PR is added until the user commits.
- Overline **"Or pick an open PR in this repo"** and a scrollable multi-select list (max-height 200) of the repo's open PRs that are not assigned to the user — each row a checkbox, the title at 12.5px (ellipsis) and a mono 10.5px `#id · author · updated` line. Already-added PRs are filtered out.
- Checkbox: *"Run the automatic review once the worktree is ready"* (defaults on).
- Actions: **`Add to my list`** (primary; becomes `Add {n} PRs to my list` when several are picked), `Cancel`, and an 11.5px `--color-neutral-600` note *"a worktree is created on open"*.

**After adding.** The PR appears at the **top of the sidebar list** for that repository (manually added first, then assigned), carries an `added by you` pill in both the sidebar row and the inbox card, and behaves exactly like an assigned PR from then on — worktree, comments, agent review, submit. It is scoped to its repository like any other PR, counts toward the inbox count and subtitle, and moves to Past reviews once reviewed. Removing one from the list is a per-row action to design if you want it (the prototype has no remove); the natural place is the row's context menu alongside "Remove worktree".

Error states worth designing in implementation: an unresolvable URL/number, a PR in a repository that is not tracked (offer to track it), and a PR already in the list.

### 4. Automatic review results

**Purpose:** read what the review agent found and decide what to keep.

Opened from `Agent review · 4` in the file header (or `r`). An overlay over the center pane only: backdrop `color-mix(in srgb, var(--color-bg) 82%, transparent)`, panel max-width 720, `--color-surface`, radius 14, `--shadow-lg`, padding `20px 22px`, scrollable.

Header: `h4` "Automatic review" plus a mono 11.5px provenance line — `opencode · reviewer.md · effort high · 3m 12s ago` — and a close `×`.

**Suggested conclusion** block: 1px `--color-accent-700` border, radius 8, padding `12px 14px`; an 11px uppercase `--color-accent-300` overline "Suggested conclusion"; the verdict at 17px heading font (`Request changes`); then the agent's reasoning at 13px/1.55 in `--color-neutral-300`.

Then an 11px uppercase count overline and one card per finding (1px divider border, radius 8, padding `10px 12px`, hover `--color-neutral-600`, cursor pointer → jumps to the line): a mono 11px row with the reference in `--color-accent-300` and the severity in `--color-neutral-500`, then the body at 13px/1.5.

Footer actions: `Accept all into my review` (primary), `Keep 2 selected` (secondary), `Re-run` (ghost).

The same findings appear inline in the diff as agent findings (section 2), so the panel is a summary view, not the only surface.

### 5. Submit review

Modal (fixed, backdrop 78% bg, max-width 560, radius 14, `--shadow-lg`, padding `20px 22px`). Header `h4` "Submit review" + `#412 · 5 pending` in mono 11.5px. Three verdict options as full-width left-aligned buttons (padding `10px 12px`, radius 8, 1px divider border → `--color-accent` when selected): **Comment** ("Submit notes without a verdict"), **Approve** ("Agent agreed on 2 of 4 findings"), **Request changes** ("Agent suggests this"), each with a 13.5px label and a 12px `--color-neutral-500` hint. Then an overall-feedback textarea, the merge note about markdown selections, and `Submit` (primary) / `Cancel` (secondary).

### 6. Past reviews

Sidebar becomes a filter list (`All`, `Approved`, `Changes requested`, `Commented`) as 13px rows, padding `7px 10px`, radius 4, selected = `--color-accent-900` + `--color-accent-100`.

Center: `h4` "Past reviews", a 13px `--color-neutral-500` subtitle, then a `.table` (13px) with columns PR / Title / Your verdict / Agent / Worktree / action. The verdict cell is a pill (11.5px, padding `1px 7px`, radius 8): approved = `rgba(111,170,126,0.5)` border on `#8fc09d` text; changes requested = `rgba(196,123,123,0.5)` / `#d59a9a`; commented = neutral. The Agent column records whether the agent agreed with you (`agreed` / `disagreed` / `not run`) — this is how the automatic reviewer earns trust over time. Worktree column shows the path or `—`; the row action is `Remove worktree` or `Reopen`. Below the table: `Manage worktrees` (secondary) and a 12px `--color-neutral-600` total (`5 worktrees · 1.2 GB on disk`).

### 7. Settings

Sidebar becomes a section nav: **Accounts, Tracked repositories, Review agent, Fetching, Appearance, Worktrees, Shortcuts**. Center is a single scrolling column (max-width 660, `padding: 22px 26px 50px`, sections separated by 26px gaps); each section is an `h5` + a 12.5px `--color-neutral-500` description + its controls. Two-column control grids use `grid-template-columns: 1fr 1fr; gap: 12px`.

**Accounts.** One row per provider inside a bordered container (rows separated by dividers, padding `11px 13px`, wrapping): a 7px status dot (connected `#6faa7e`, pending `--color-accent` + pulse, disconnected `--color-neutral-700`), the provider name at 13.5px, a mono 11.5px meta line (`sebastiandev · repo, read:org` / `Not connected` / `Waiting for authorization…`), and the action button — `Connect` (primary) when disconnected, `Reauthorize` (secondary) when connected, `Authorizing…` while pending. Description: *OAuth tokens are stored in your OS keychain.*

**Device flow** (the designed auth path) — a modal, max-width 440:

1. *Code step.* Explanatory copy, then the user code at 26px mono, letter-spacing 0.14em, `--color-accent-200`, inside a `--color-accent-700`-bordered box (padding 14) with a `Copy` → `Copied` secondary button; below it `expires in 14:32 · scopes: repo, read:org` in mono 11.5px. Actions: `Open github.com/login/device` (primary), `Cancel` (secondary). A divider-separated ghost row offers **"Use the token from the gh CLI instead"** (`glab CLI` for GitLab) — the one-click path for anyone already authenticated locally.
2. *Polling.* An 8px accent dot pulsing (`@keyframes pulse` 0/100% opacity 0.3 → 50% opacity 1, 1.4s ease-in-out infinite), "Waiting for you to approve in the browser…", a 12.5px line repeating the code and host plus `Polling every 5s`, and `Reopen the page` / `Cancel`.
3. *Done.* Green dot, "{Provider} connected", "Token stored in the keychain. First fetch runs now.", `Done`.

The account row mirrors the phase throughout (pulsing dot + "Waiting for authorization…").

**Tracked repositories.** Description: *Each repository is fetched separately; you review one at a time from the rail's selector.* A bordered list, one row per repo: a checkbox, the `owner/name` in mono 12px, a 11.5px `--color-neutral-500` line (`github · 4 assigned · auto-review on`), and a `Remove` ghost button. Below: **`Track a repository…`** (primary) → modal (max-width 500) with (a) an `owner/name` field paired with a **GitHub / GitLab** segmented control, (b) an overline "Or pick from your account" and a scrollable multi-select list of repos discovered on the connected account with their open-PR counts, (c) a checkbox *"Run the automatic review on this repository too"*, and (d) `Track {n} repositories` / `Cancel`. The modal exists because there are two ways in — typing a name and picking from the account — plus a per-repo option; an inline field could not hold that.

**Review agent.** Description: *Runs on demand and, optionally, on every fetch.* A 2×2 grid:

- **Provider** — `opencode` (a select in the real app; opencode is what drives the review).
- **Agent file** — a read-only path field (mono 12px, ellipsis) plus a **`Browse…`** button opening a file-picker modal (max-width 520): header "Choose an agent file" with a mono `*.md` hint, then a scrollable bordered list of discovered agent files, each row a `◫` glyph, the path in mono 12px and an 11px `--color-neutral-500` note (`in this repo · 4.1 KB · edited 2d ago`, `global · shared across projects`); the current file's row is tinted 12% accent. Footer: `Browse the filesystem…` (secondary) and an 11.5px note naming the scanned locations (`.atelier/agents`, `~/.config/opencode/agent`).
- **Model** — a dropdown **populated from opencode's configured providers**: same button shape as the repo selector, menu headed `FROM OPENCODE · 3 PROVIDERS` (10.5px uppercase), each row the provider-qualified id in mono 12px plus a 10.5px note (`default`, `slower`, `openai`, `google`, `local`). Sample ids: `anthropic/claude-sonnet-4.5`, `anthropic/claude-opus-4.1`, `openai/gpt-5-codex`, `google/gemini-2.5-pro`, `ollama/qwen3-coder:30b`.
- **Effort / variant** — segmented `low / medium / high`.

**Fetching.** Poll interval as a segmented control (`1 min / 5 min / 15 min / manual`) and a checkbox *"Run the automatic review on newly fetched commits"* (15px box, radius 4, accent border + `--color-accent-900` fill + `✓` when on). Both feed the inbox subtitle.

**Appearance.** *Default diff view* (Merged / Side by side segmented), *Theme* (the three dark themes as bordered cards, each a 12.5px label over a 10.5px `--color-neutral-500` note, accent border when selected), and *Diff theme* (the four swatch-pair buttons described above).

**Worktrees.** Description: *Created when you open a PR for review; safe to remove once the PR is closed.* A bordered list: checkbox, path in mono 12px, `#412 · open · 284 MB` at 11.5px, `Remove` ghost. Below: `Remove selected · {n}` (secondary) and `Remove all for merged PRs` (ghost). Reachable directly from Past reviews.

### 8. Chat dock (always available)

Header (padding `9px 12px`, bottom divider): "Chat" in heading font 13.5px, the scope in mono 11px (`#412` / `inbox` / `working tree`), and a `›` collapse button. A context chip row (11px mono chips on `--color-neutral-900`, radius 10) shows what the chat can see: the current file and the file count. Body: scrollable, 12px gaps; user turns as right-aligned accent bubbles, agent turns as 13px/1.6 prose with a numbered breakdown (mono `01`/`02`/`03` in `--color-accent-300`), then suggestion chips (`Where is it read?`, `Draft that comment`, `Compare to the spec`). Footer: input + `Send` (primary) and a 10.5px mono provenance line `opencode · reviewer.md · worktree attached`.

Collapsed: a 44px rail with a `‹` button and the vertical word "Chat" (`writing-mode: vertical-rl`, 11px uppercase, letter-spacing 0.08em).

### 9. Keyboard shortcuts sheet

`?` opens a modal (max-width 560) titled "Keyboard" with `? to close` in mono 11.5px, and a two-column grid (`gap: 6px 24px`) of rows: a mono 11.5px `--color-accent-300` key (min-width 54) and a 12.5px `--color-neutral-300` label, each row separated by a bottom divider.

| Key | Action |
|---|---|
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

Implemented in the prototype: `?`, `esc`, `d`, `u`, `s`, `m`, `r`, `j`, `k`. The rest are specified and should be wired. Guard all handlers against firing while focus is in an `input` or `textarea`.

---

## Interactions & behavior

- **Mode switch** (PR ↔ Diff) resets the selection and returns to that mode's landing state: PR mode → inbox; diff mode → the current scope's file list. Diff mode hides everything comment- and PR-related: no comment action in the line menu, no submit-review button, no others'-comments strips.
- **Selecting a PR** replaces the sidebar with the file tree and opens the first file. In the real app this is also where the **worktree is created and the branch checked out** — that needs a progress state (creating worktree → fetching → ready) which the prototype only implies via the sidebar footer path and the status bar (`worktree ready · {branch}`).
- **Adding a PR manually** does not change the fetch behavior: the added PR is polled with the rest of the repository's PRs, and (when the dialog's checkbox is left on) its automatic review starts as soon as the worktree is ready.
- **Repo switch** clears the selected PR and any pending review state for the previous repo (or keeps it per repo — a product decision; the prototype clears the selection only).
- **Line menu** is single-open (opening one closes another) and closes on `esc`.
- **Inline chats** are per line, minimizable to the gutter marker, and several can exist at once. Only one card is shown at a time in the prototype; if you allow several, stagger them or queue them.
- **Others' comments** are folded by default, expand in place, keep their reply threads, and are read-only apart from replying.
- **Automatic review** runs per PR (on demand, or on newly fetched commits when that setting is on). PR rows show `agent reviewing…` while it runs. Results arrive as inline findings plus the panel, and carry a suggested conclusion which pre-selects nothing — the human still chooses in the submit dialog.
- **Device flow** polls until approved; in the prototype the polling phase resolves after ~2.6s. Cancel must abort the poll.
- **Transitions.** The design has no decorative motion: the only animation is the 1.4s pulse on pending status dots. Hovers are instant color/border changes.
- **Copy reference** puts `{path}:{line}` (and, for markdown selections, the quoted text) on the clipboard; the prototype only closes the menu.

## State

| State | Type | Notes |
|---|---|---|
| `mode` | `'pr' \| 'diff'` | drives everything comment-related |
| `view` | `'inbox' \| 'files' \| 'past' \| 'settings'` | which sidebar/center pair |
| `repo` | string | selected tracked repository |
| `scope` | string | diff-mode folder/patch |
| `prId`, `fileIdx` | id, index | current selection |
| `addedPrIds[]` | ids | manually added PRs, per repo; listed before assigned ones |
| `addOpen`, `addResolved`, `addPicks[]`, `addAuto` | dialog state | "Review a PR" modal |
| `diffMode` | `'unified' \| 'split'` | seeded from the setting |
| `mdMode` | `'rich' \| 'raw'` | |
| `dockOpen` | boolean | user preference; auto-collapsed below 1060px without being overwritten |
| `sbW` | number | sidebar width, clamped on write |
| `menuLine`, `composerLine`, `chatLine`, `minimizedChats[]` | line ids | per-line UI |
| `myComments{lineId: body}` | map | pending review comments |
| `othersOpen{lineId: bool}` | map | fold state |
| `viewed{fileIdx: bool}` | map | viewed checkboxes |
| `selRect`, `selText`, `selCard` | rect, string, `'comment' \| 'agent' \| null` | markdown custom selection |
| `agentPanelOpen`, `reviewOpen`, `shortcutsOpen`, `oauth`, `picker`, `trackOpen`, `modelMenu`, `repoMenu`, `scopeMenu` | booleans / objects | overlays; `esc` closes |
| `theme`, `diffTheme`, `defaultDiffMode`, `poll`, `autoOnFetch`, `effort`, `agentFile`, `model`, `connected{}`, `trackedRepos[]` | settings | persist all of these |
| `verdict` | `'comment' \| 'approve' \| 'changes'` | submit dialog |

Data the backend must supply: assigned PRs per tracked repo, open PRs in a repo that are not assigned to you (for the add dialog), single-PR lookup by URL or number (id, title, branch, state, updated, file count, +/−, comment count, spec reference and the PR that introduced it); file lists with status, +/−, comment counts; diffs (hunks with old/new line numbers); comment threads with authors and timestamps; agent review results (per-line findings with severity, plus a suggested conclusion and summary); worktree inventory with sizes; past reviews with your verdict and whether the agent agreed.

## Assets

No images. Two inline Phosphor icons (`chat-centered`, `dots-three`); the rail/UI glyphs are text characters (`◧ ◷ ⚙ ◨ ◫ ▾ ‹ › ← × – ✓ ⌕ ⋯`) — replace them with proper Phosphor icons when implementing. The app mark is the text `</>` in JetBrains Mono at `--color-accent`, no container. Fonts come from Google Fonts (Inter, JetBrains Mono).

## Files

> To open the prototype from this bundle, copy `design-system/styles.css` to `prototype/_ds/nocturne-6975616d-a227-4ef0-8369-0ec513f170f2/styles.css` (the path its `<link>` uses), or edit that one `<link>` to point at `../design-system/styles.css`. Without the stylesheet the layout renders unstyled.

- `prototype/Review.dc.html` — the full interactive prototype (all screens, both modes, both selectors). Open it in a browser; the design-tool wrapper around it is not meant to be reproduced.
- `design-system/styles.css` — Nocturne tokens + component classes. Use this as-is if the target app can take a stylesheet.
- `design-system/readme.md` — the design system's own guide.
- `design-system/theme.json`, `design-system/_ds_manifest.json` — theme parameters and component inventory.
