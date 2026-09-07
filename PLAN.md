# Review — implementation plan

Source of truth for UI: `design/README.md` + `design/prototype/Review.dc.html`. It supersedes
SPEC.md §5 (UI) and §9 (UI language). SPEC.md stays authoritative for data model, sync,
worktrees, agent integration and diff mode semantics.

Architecture: `server/src/{domain,infrastructure,application}`; domain defines ports,
infrastructure implements them, application wires. Client: React + Vite, Nocturne stylesheet
as-is, tokens only.

Status legend: [x] done · [ ] pending

---

## Phase 0 — Reskin to Nocturne (diff mode only)  ~½ day

Goal: what exists today looks like the design. No new features.

- [x] Replace `client/src/theme/tokens.css` with `design/design-system/styles.css`; map the old
      token names onto Nocturne variables during the transition, then delete them.
- [x] Three UI themes (Nocturne / Ember / Slate) via `data-theme`; four diff themes via
      `data-diff-theme`. Persist both. Drop `system`/light.
- [x] App shell: top bar 46, icon rail 48, sidebar 306 (resizable 220–460, clamp rule from README),
      center, dock 344/44, status bar 26. Responsive rules (1300 / 1060 / centerW 720 / 780).
- [x] Diff body per README §2: gutters 46, `⋯` line action button (Phosphor `dots-three`), hunk
      rows, merged + side-by-side, `min-width` 620/860 inside `overflow:auto`.
- [x] Chat dock per README §8, keeping the status row (agent · model · variant) and `/` commands.
- [x] Sidebar = file tree with status dots and viewed checkboxes; scope selector in diff mode.
- [x] Fonts: Inter + JetBrains Mono. Phosphor icons for rail glyphs.
- [x] Shortcuts sheet (`?`) and the keys already meaningful in diff mode: `j k u s d v y esc`.

## Phase 1 — Line actions and inline chat  ~1 day

- [x] Line menu (single-open, `esc` closes): Ask the agent here · Copy line reference
      (Add review comment appears in PR mode only, phase 3).
- [x] Inline chat card at pane level (absolute, right/bottom), per line, minimizable to a gutter
      marker (Phosphor `chat-centered`); anchor line tinted while open. Several may exist;
      one card shown at a time.
- [x] Server: `ChatSession` gains child sessions keyed by line reference; each inline chat is an
      opencode child session of the PR/scope session so it inherits context.
- [x] Keys: `a` ask in place, `y` copy ref, `c` reserved.
- [x] Text-selection → Ask stays as a second entry point in the diff (decided: both).

## Phase 2 — Markdown rich view  ~1 day

- [x] `m` toggles rich ↔ raw. Raw = the normal diff. Rich = rendered markdown (react-markdown
      or similar; one dependency, justified: rendering GFM correctly is not a weekend job).
- [x] Selection toolbar (fixed, 42px above, clamped; `preventDefault` on mousedown):
      Comment · Ask the agent · Copy reference.
- [x] Selection threads: highlight run + margin marker + Selections aside (stacks < 780).
- [x] Ask-on-selection reuses the inline chat from phase 1 anchored to a text range.

## Phase 3 — PR mode: fetch, worktrees, comments, submit  ~3 days

Server first, then UI.

- [x] SQLite store (`node:sqlite` or better-sqlite3) with the SPEC §3 schema + `viewed`,
      `added_by_user`, `repo` tables. Migrations as numbered SQL files.
- [x] Ports in `domain`: `PullRequestProvider` (list assigned, list open unassigned, get by
      number/url, diff, comments, submit review), `Worktrees` (create/remove/list/size),
      `SettingsStore`. GitHub adapter over `gh` (token from the CLI). GitLab: port only.
- [x] Sync per SPEC §3b, per tracked repo, interval from settings (1/5/15/manual). Merged/closed
      → remove worktree, keep rows.
- [x] Commands (the only place that commits): `SyncRepo`, `OpenPullRequest` (creates worktree,
      progress events creating → fetching → ready), `AddPullRequestManually`, `MarkDone`,
      `SubmitReview` (validateAnchors server-side, APPROVE needs explicit flag), `RemoveWorktree`.
- [x] UI: PR inbox (sidebar list + center cards + repo selector), Add PR modal, file tree footer
      (worktree path + Submit review · n), others' comments folded/threaded, your pending comment,
      comment composer, submit modal with three verdicts.
- [x] Top PR bar for the `tight` layout.

## Phase 4 — Automatic review  ~1½ days

- [ ] `RunReview` Command: queue depth 1, agent+model+variant per run from settings or override,
      linked-spec resolution (SPEC §6), payload ingest into `review_draft` + `draft_comment`,
      failure surfaced on the draft.
- [ ] Inline agent findings with Keep in review / Dismiss / Discuss; review panel with suggested
      conclusion and Accept all / Keep selected / Re-run; `r` key; `Agent review · n` header button;
      `agent reviewing…` / `agent: request changes` in PR rows.
- [ ] Setting "run on newly fetched commits", default off, per repo.
- [ ] Submit dialog hints ("Agent agreed on 2 of 4 findings") computed from kept vs dismissed.

## Phase 5 — Past reviews, worktree management, settings polish  ~1 day

- [ ] Past reviews table with verdict pill, agent agreed / disagreed / not run, worktree column,
      Remove worktree / Reopen; totals line with size on disk.
- [ ] Settings → Worktrees list with sizes; Remove selected; Remove all for merged PRs.
- [ ] Settings → Tracked repositories modal (type owner/name, or pick from account).
- [ ] Settings → Review agent (agent picker from opencode, model from providers, variant), Fetching,
      Appearance (default diff view, theme, diff theme).

## Phase 6 — Accounts  ~1 day

- [ ] GitHub: both paths — device-flow OAuth with keychain storage (macOS `security`) and
      "use the token from the gh CLI". Account row phases per README.
- [ ] GitLab: deferred; provider port exists from phase 3.

## Deferred / not planned

- Light theme (decided: design wins, dark themes only).
- GitLab (decided: defer).
- Multiple inline chat cards visible at once.

---

## Rename

Product name is **Review**. Folder `review` → `review` at the end of phase 0, together with
package names (`@review/*`), the CLI binary (`review diff <path>`), and `~/.cache/review`.
