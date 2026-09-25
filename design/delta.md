# Delta — since the 2026-09-09 handoff

Six changes, all in PR mode. They are specified in `README.md` §13–§16 and are live in `prototype/Review Attention.dc.html`. `prototype/Review.dc.html` stays the reference for everything else (settings, add-PR, submit, past reviews, markdown, ⌘K palette, diff mode).

---

## 1. Inbox center becomes "Needs your attention" (§13)

**Was:** one card per assigned PR ("Pending review"). In the implementation it had already turned into a flat list of full-width comment dumps with uppercase PR titles, every comment fully expanded.

**Now:** three foldable sections (**Direct mentions**, **Unread replies**, **Awaiting their reply**), filter chips with counts, conversations grouped by PR. **PR groups are collapsed by default**; a collapsed header shows the conversation count and who is waiting on you. Rows are compact (author, kind tag, shortened `…/dir/file.py:line`, date), clamp the body to `previewLines` lines, and carry the *"You: …"* quote of the comment being answered. Click → the exact file, line and thread.

**Implementation work:** `AttentionDashboard.tsx` rewrite; fold state per section and per `section+prId` group (default folded); body clamp + "Show more"; inline markdown renderer for `code`, **bold**, `@mentions` (you highlighted) and shortened GitHub URLs.

## 2. PR Overview (§14)

Description in a collapsible card, clamped to 240px behind a fade with *Show full description*. **Your conversations** with filter chips (All / Needs you / Awaiting reply / Answered), each thread foldable with a two-line preview, `Open in diff` or a reason it cannot (outdated / file no longer in diff). Expanding a thread marks it read.

**Implementation work:** `PrOverview.tsx` — replace the always-expanded thread list; reuse `VisibleComment` read receipts.

## 3. Diff: one file at a time, GitHub formatting (§15)

The diff shows **only the selected file**; `j` / `k` (and ↑↓ buttons with `2 / 3` in the file header) move between files. GitHub-style body: hunk header rows, two number gutters, a sign column, tinted +/− lines with stronger gutters, sticky file header with diffstat squares and a **Viewed** toggle, basic syntax colouring. Merged and side-by-side both supported. The sidebar file list shows the **directory path above the basename** (muted, 10.5px).

## 4. Lines with review comments are marked (§15)

3px accent bar in the leftmost column, accent-tinted number gutters, and a count pill (`chats` icon + n). Unread conversations glow (accent-700 pill, accent-400 border, soft accent shadow). The thread renders **under the line**, foldable, with an `Ask agent` action. `x` collapses / expands all conversations in the current file; `n` jumps to the next conversation (unread first) across files.

## 5. Agent chat moves to the right dock only (§16)

**Was:** selecting a line opened an in-place chat card over the diff (README §2, *In-place agent chat*). **Removed.**

**Now:** a line number click (shift-click extends a range) or the line's chat icon selects the line(s) and **switches the dock to that line's chat** (existing history, or a new empty chat). The dock header carries a chip row — **General** plus one chip per line chat — to switch context; a quoted-code card shows what the chat is about. A drawn **connector** (accent, 1.5px, elbow along the dock seam, dots at both ends, dashed when the line is scrolled off-screen) joins the selected rows to that card. Always on.

**Implementation work:** chat threads keyed by `scope + path + line range`; `InlineChat.tsx` retires; `ChatDock.tsx` gains the context chip row and quote card; an overlay SVG that re-measures on scroll/resize.

## 6. Toolbar and surface styles

The diff toolbar keeps **Merged / Side by side**, the **diff-theme picker** (8 sets) and **Focus**, and adds **Collapse / Expand conversations**. Every new surface reads the Framed/Tonal tokens (`--sep`, `--code-bg`, `--chip-bg`, `--ctl-bg`, `--card-shadow`, `--r-chip`, §15 table) — nothing is styled per-style.

---

## Earlier (2026-09-09)

⌘K palette, focus mode, code font as its own axis, four more diff themes with the light-mode derivation rule, three more app palettes (Daylight is light, ramps inverted). All still apply.
