# review — spec

A local review desk: the PRs waiting on me, an agent review already drafted against each
one, and the ability to curate it and submit.

Status: draft for review. Nothing built.

---

## 1. Tech decision

**Local web app. TypeScript end to end. One process serving API + UI.**

| Layer | Choice |
|---|---|
| Runtime | Bun (or Node 22) |
| Backend | Hono, HTTP + SSE |
| Frontend | React + Vite, TanStack Query |
| Diff rendering | `react-diff-view` (parses unified diff, supports per-line decorations) |
| Agent transport | `@opencode-ai/sdk` against `opencode serve` |
| GitHub | `gh` CLI shelled out, or Octokit |
| Store | SQLite (`bun:sqlite`) |
| Chat pane | Native React components fed by the opencode SSE stream |

### Why not a TUI

The three core interactions are the ones terminals are worst at: multi-select checkboxes
over a long list, inline editing of a comment body, and a side-by-side diff with comments
anchored to lines. A TUI would be a fight for every one of them.

### Why no tmux / xterm.js / PTY

This was the assumption worth killing. `opencode serve` exposes an OpenAPI 3.1 HTTP server
with an SSE event stream, and the custom agents are already reachable over it — verified:

```
GET  /agent            -> [... "architect", "implementor", "pr-reviewer", "reviewer" ...]
POST /session/:id/message      body: { agent, parts }
POST /session/:id/prompt_async
GET  /event                    SSE: streaming parts, tool calls, permissions
```

So the right-hand pane is **not** an embedded terminal. It is a normal chat UI rendering
streamed message parts. That means: selectable text, clickable file references, a "quote
this diff hunk into the prompt" button, and no PTY lifecycle to manage. Embedding a
terminal would be strictly more work for strictly less capability.


### Capability parity with the CLI — verified, not assumed

The TUI is itself just a client of this server, so the server is the full surface. Checked
against a live `opencode serve`:

| Capability | Status |
|---|---|
| Custom agents | `GET /agent` returns `architect`, `implementor`, `pr-reviewer`, `reviewer` |
| **Skills** | `skill` is a real tool id; a session driven over HTTP emitted `TOOL skill` and answered from the loaded file correctly |
| Slash commands | `GET /command` lists `review-pr` alongside the built-ins |
| Tools | `bash`, `read`, `edit`, `write`, `task`, `grep`, `glob`, `webfetch`, `websearch`, `todowrite`, `question`, `apply_patch` |
| Subagents | `task` tool present, so `@`-style delegation works |
| Streaming | `GET /event` SSE — text parts, tool calls, step boundaries |
| Sessions | create, fork, abort, revert, summarize, child sessions |

**The one real difference: permission prompts.** In the TUI a human answers them. Headless,
an `ask` permission raises a request that must be answered via
`POST /session/:id/permissions/:permissionID` with `{ response, remember? }`, and is
otherwise rejected. Two consequences for this app:

1. It **must** subscribe to permission events and surface them in the chat pane as
   approve/deny, or agent runs will stall and fail exactly as the early CLI tests did.
2. `pr-reviewer` is already configured to avoid this on the review path (broad `bash` allow
   with targeted denies), so unattended reviews do not block. The interactive chat pane is
   where a human is present and prompts are wanted.

### Why TypeScript and not Python

The opencode SDK is TS and versioned in lockstep with the server (both `1.18.29`). A Python
backend means generating a client from `/doc` and re-generating on every opencode upgrade,
for no gain. Python stays a fine choice for one-off corpus scripts; it is the wrong choice
for this.

### Rejected

- **Electron / Tauri** — buys nothing over a localhost tab.
- **A GitHub App / bot** — the whole point is a human curation step before anything is
  posted. A bot removes it.
- **Extending the existing bash scripts** — they stay as the headless path, but shell is the
  wrong substrate for state, retries and a UI.

---

## 2. Architecture

```
                     ┌────────────────────────────┐
 fetch (30 min) ───► │  review server (Bun/Hono) │
                     │                            │
   browser ◄───SSE───┤  • GitHub sync             ├──► gh / Octokit
   :5173             │  • review orchestration    │
                     │  • draft store (SQLite)    ├──► opencode serve :4096
                     │  • submit gateway          │      (agent: pr-reviewer)
                     └────────────────────────────┘
```

One server. The timer only fetches; every review is started from the UI. Both paths call the
same internal services, so nothing is special-cased for the scheduler.

### Reuse from what already exists

- `_validate_review_lines.py` logic → port to TS as `validateAnchors()`. Non-negotiable: one
  bad line anchor makes GitHub reject the whole submission.
- `submit-review`'s approve gate → becomes a server-side policy, not a CLI flag.
- The `pr-reviewer` agent, `eng-doctrine` / `eng-review` / `shiphero-bindings` skills → used
  unchanged. **The app must not restate review taste.** It orchestrates; the skills decide.

---

## 3. Data model

```sql
pull_request(
  id, repo, number, title, author, url, head_sha, base_sha,
  is_draft, state,                -- open | merged | closed
  done_at,                        -- set by "mark as done"; NULL = active
  worktree_path,                  -- NULL once removed
  created_at, updated_at, synced_at
)

review_draft(
  id, pr_id, head_sha,           -- a draft is bound to the commit it reviewed
  status,                        -- pending | running | ready | submitted | failed
  agent, model,                  -- what actually produced it, for comparison
  event,                         -- COMMENT | REQUEST_CHANGES | APPROVE
  body,                          -- general feedback, editable
  agent_body,                    -- original, for "reset to agent's version"
  session_id,                    -- opencode session, so the chat pane can resume it
  error, created_at, submitted_at
)

draft_comment(
  id, draft_id, path, line, start_line, side,
  body, agent_body,              -- edited vs original
  selected,                      -- default true
  anchor_valid,                  -- from validateAnchors()
  origin                         -- agent | human
)

submission(id, draft_id, github_review_id, submitted_at, payload_json)

-- Diffs are immutable for a given commit, so they are cached forever.
pr_diff(
  pr_id, head_sha, base_sha,
  patch,                         -- raw unified diff
  files_json,                    -- [{path, status, additions, deletions}]
  anchors_json,                  -- {path: [line, ...]} precomputed for validation
  fetched_at,
  PRIMARY KEY (pr_id, head_sha)
)

-- Existing GitHub review comments, shown folded as context.
github_comment(
  id, pr_id, github_id, author, path, line, body, created_at, in_reply_to, fetched_at
)

-- One row; the watermark that makes sync incremental.
sync_state(
  key,                           -- e.g. "review-requested"
  last_run_at,
  watermark,                     -- max(updated_at) seen last run
  etag                           -- for conditional GETs
)
```

Two decisions worth stating:

- **Drafts are keyed to `head_sha`.** A new push does not mutate the old draft; it creates a
  new one. The previous draft stays as history.
- **`agent_body` is kept alongside `body`.** You can always see what the agent actually said
  versus what you rewrote — and that diff is the training signal for improving the skills.

---

## 3b. Sync strategy — fetch once, then only what moved

The point is to stop re-fetching. Three levels of caching, each keyed to what actually
invalidates it.

**Level 1 — the PR list.** Poll the search API for `review-requested:me`, sorted by
`updated`, and keep a `watermark` of the highest `updated_at` seen. Next run asks for
`updated:>=watermark` and stops paging as soon as it sees an item at or below it. A run
where nothing changed costs one request.

**Level 2 — PR detail.** Only fetch `GET /repos/:o/:r/pulls/:n` for PRs whose `updated_at`
moved past what is stored. Send `If-None-Match` with the stored ETag; a `304` costs no rate
limit quota and no parsing.

**Level 3 — the diff.** Keyed by `(pr_id, head_sha)`. A diff for a given commit **can never
change**, so it is fetched exactly once and cached permanently. A new push means a new
`head_sha`, which is a new row — the old one stays, which is what makes "what changed since
I last reviewed" answerable later.

Comments are refetched when `pr.updated_at` moves, since there is no cheaper signal.

```
sync():
  for pr in search(review-requested, updated >= watermark):
     upsert pull_request
     if pr.head_sha not in pr_diff:  fetch + store diff, precompute anchors
     if pr.updated_at > stored:      refetch comments
  watermark = max(updated_at)
```

**Deletion.** A PR that drops out of the search result (review dismissed, closed, merged) is
marked `state` accordingly rather than deleted, so submitted drafts keep their context.

**Rate limits.** Search is 30 req/min, core is 5000/hr. The above keeps a 30-minute cycle at
roughly one search request plus a handful of conditional GETs. Store `X-RateLimit-Remaining`
on `sync_state` and back off below 500.

**Anchors are precomputed at fetch time.** `anchors_json` holds the set of commentable lines
per file, derived from the patch once. Both the submit-time validation and the UI's
"can I comment here" check read it, so they can never disagree.

## 4. Backend API

```
GET  /api/prs                      list, filtered + sorted
POST /api/prs/sync                 force a GitHub refresh
GET  /api/prs/:id                  PR + diff + existing GitHub comments + draft

POST /api/prs/:id/review           run a review now (202, progress via SSE)
                                   body: { agent?, model? } — defaults from settings
POST /api/prs/:id/done             mark reviewed; removes the worktree
DELETE /api/prs/:id/done           un-mark, back to the active rail
GET  /api/drafts/:id               draft + comments
PATCH /api/drafts/:id              { event?, body? }
PATCH /api/drafts/:id/comments/:cid  { body?, selected? }
POST /api/drafts/:id/comments      add my own comment on a line
DELETE /api/drafts/:id/comments/:cid
POST /api/drafts/:id/validate      re-run anchor validation
POST /api/drafts/:id/submit        -> GitHub

POST /api/prs/:id/chat             message to the opencode session, optional quoted selection
GET  /api/config                   agents, commands, models, themes + current settings
PATCH /api/config                  { defaultReviewAgent?, defaultModel?, reviewCommand?, theme? }
POST /api/sessions/:id/permission  answer a permission request { id, response }
GET  /api/events                   SSE: sync, review progress, chat parts, permission asks
```

### Submit rules

1. Only `selected = true` comments are sent.
2. `validateAnchors()` runs server-side immediately before the POST. Any invalid anchor
   fails the request and returns which ones — the UI must not be the only guard.
3. `APPROVE` requires an explicit confirmation flag in the request body — a server-side
   policy, not a UI guard.
4. On success, record the `submission` row and mark the draft `submitted`.

---

## 5. UI

```
┌──────────┬────────────────────────────────────┬─────────────────┐
│ PR LIST  │  DIFF                              │  AGENT CHAT     │
│          │                                    │                 │
│ ● #47807 │  file.py                           │  opencode       │
│   kernel │   48   def _resolve(...)           │  session for    │
│   4 cmts │   49 + if user.id == SERVICE:      │  this PR        │
│          │      ┌──────────────────────────┐  │                 │
│ ○ #46757 │      │ ☑ agent                  │  │  context:       │
│   uom    │      │ `has_access` already ... │  │  diff + descr   │
│   3 cmts │      │ [edit] [delete]          │  │  + linked spec  │
│          │      └──────────────────────────┘  │                 │
│ ○ #47921 │   50 + return None                 │  > why is this  │
│   lpn    │                                    │    branch dead? │
│   (none) │  ▸ 2 existing comments (folded)    │                 │
│  [review]│                                    │                 │
├──────────┴────────────────────────────────────┴─────────────────┤
│ ○ Comment  ● Request changes  ○ Approve                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ general feedback, prefilled from the agent, editable        │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ 4 of 6 comments selected · anchors ok        [Submit to GitHub] │
└──────────────────────────────────────────────────────────────────┘
```

**Left rail.** PRs needing my review. Badge shows draft state: none / running / N comments /
submitted. Stale drafts (PR moved past the reviewed SHA) are marked. A `[review]` button per
PR for the manual path.

**Center.** Unified diff, file-collapsible. Agent comments render inline at their anchor,
each with a checkbox, defaulting to selected. Inline edit in place; a "reset" affordance
when `body != agent_body`. Existing GitHub comments render folded, expandable — they are
context, never submitted. Clicking any diff line adds my own comment there.

A comment whose `anchor_valid = false` renders in an error state and cannot be selected.

### Per-line commenting — the core interaction

This is the part that must feel like GitHub or the app is not worth using.

**Gutter affordance.** Hovering any line in the diff shows a `+` in the gutter. Clicking it
opens a composer anchored to that line. Only lines present in `anchors_json` are
commentable — everything else has no `+`, which makes the constraint visible instead of
failing at submit time.

**Multi-line.** Click-and-drag, or click `+` then shift-click a second line, selects a
range and writes `start_line` + `line`. The range highlights while composing.

**Sides.** On a deleted line the comment anchors to `side: "LEFT"`; on added or context
lines, `"RIGHT"`. Derived automatically from the row the user clicked — never a control they
have to think about.

**Composer.** Markdown textarea, monospace, `⌘↵` saves and `Esc` cancels. Supports a
"suggestion" block that renders as GitHub's suggested-change syntax. Draft text survives a
reload — persisted on change, not on save.

**Agent comments are the same objects.** An agent comment renders in the same component with
`origin = "agent"` and a checkbox. Editing it sets `body` while preserving `agent_body`;
a small "reset" link restores the original. Unselecting greys it out but keeps it, so a
comment can be reconsidered before submitting.

**Threading.** Existing GitHub comments render folded under their line, with a count
(`▸ 2 comments`). Expanding shows the thread; replying creates a comment with
`in_reply_to`. Replies submit through the same review payload.

**Keyboard.** `j`/`k` next/previous file, `n`/`p` next/previous comment, `c` comment on the
focused line, `x` toggle selection, `⌘↵` submit the review. Reviewing 22 PRs with a mouse is
the thing that made this app necessary.

**State.** Every edit is a `PATCH` — no explicit save. The submit button is the only
irreversible action in the UI.

**Right.** Chat against the opencode session for this PR, seeded with the diff, the PR
description, and any spec the description links to. Session persists per PR, so reasoning
survives a reload.

### Ask the agent about a selection

Selecting text anywhere in the rendered diff raises a small floating action: **Ask**. It
opens the right dock if closed, quotes the selection into the composer as a fenced block
with its file path and line range, and leaves the cursor after it so a question can be
typed. `⌘↵` sends.

Details that make it usable rather than a demo:

- The selection carries `path`, `startLine`, `endLine` and side, so the agent is told where
  the code is, not just what it says. It can then read the surrounding file itself.
- Selection may span hunks or files; the quote is split per file with its own header.
- The same action offers **Comment** when the selection is entirely within commentable
  lines — same gesture, two destinations, so exploring and reviewing are one motion.
- The dock is resizable and collapsible; state persists.

### Theme

Dark and light, with a picker, in the shape opencode uses: a named theme list plus
`system`, resolved to CSS custom properties on the root element. Persisted in settings and
served with the first paint so there is no flash.

**The diff respects the theme.** This is the part that is usually skipped and then looks
broken. Concretely:

- Syntax highlighting reads its palette from the same tokens as the chrome — one source of
  truth, no separate highlighter theme to drift.
- Add/delete/context backgrounds, gutter, and the selection highlight are theme tokens, not
  hardcoded greens and reds. Contrast is checked in both modes for the add/delete pair,
  which is where light themes typically fail.
- Comment cards, the composer and the anchor-error state derive from the same tokens.

**Bottom.** Verdict radio prefilled from the agent's `event`. Feedback textarea prefilled
from `body`. Submit is disabled while any selected comment has an invalid anchor.

---

## 6. Agent integration

### The review agent is configuration, not a constant

`pr-reviewer` is the default, not a hardcode. `GET /agent`, `GET /command` and the provider
list on the opencode server already enumerate what is available, so every picker is over
live data rather than a typed string.

**Settings hold the defaults.** `defaultReviewAgent` (ships as `pr-reviewer`),
`defaultModel`, `theme`, and optionally `reviewCommand` when a slash command should drive
the run instead of a raw prompt.

**A run may override them.** `POST /api/prs/:id/review` takes optional `agent` and `model`;
absent, the defaults apply. The review button is a split button — click runs with the
defaults, the caret opens agent + model pickers for this run only.

Whatever was actually used is recorded on the draft (`agent`, `model`), because a draft you
cannot attribute is useless for comparison. Re-running the same PR with a different agent or
model creates another draft against the same `head_sha`; both are kept side by side. That is
the harness for tuning taste — swap one variable, re-run, read the difference.

Changing a default takes effect on the next run. No restart.

```ts
const client = createOpencodeClient({ baseUrl: "http://localhost:4096" })
const session = await client.session.create({ title: `PR ${repo}#${num}` })

await client.session.promptAsync(session.id, {
  agent: settings.reviewAgent,
  parts: [{ type: "text", text: buildReviewPrompt(pr, priorComments, linkedSpecs) }],
})
// consume /event for progress; parse and persist the agent's final JSON response
```

Notes:

- Reviews run in a **queue with concurrency 1–2**. Six parallel Opus reviews is a bad
  afternoon. Observed: ~2–15 min per PR depending on size.
- Prior comments (mine and the bot's) are passed in, as the current script does, so a
  re-review does not repeat itself.
- The agent returns one JSON object, without file writes or re-fetching the supplied diff.
  The server saves the response and ingests it into `agent_review` + `agent_finding`.
  The payload includes `pr`, `repo`, `commit_id`, `coverage`, `event`, `body`, and `comments`.
  Supplied identity/revision must match the run. Coverage is `complete`, `incomplete`, or
  `unknown`; legacy responses or completeness claims without a revision remain unknown.
  Incomplete reviews retain their useful findings and explain limitations in `body`.
  Keeping a finding copies it into the human's draft.
- A run has a 20-minute deadline. The runner cancels the remote OpenCode session before
  returning a timeout failure, with a bounded cancellation request. Cancellation failure
  is explicit in the error; local event connections are closed in either case.
- Failures are recorded on the draft (`status = failed`, `error`), surfaced in the rail, and
  retryable from the button. The current script silently swallows failures — do not carry
  that over.

### Linked specs go into the prompt

Most PRs worth reviewing point at a spec, and reviewing a diff without it is guessing at
intent. So `buildReviewPrompt` resolves them and hands them to the agent alongside the diff.

Sources, in order:

1. Links in the PR body — Linear/Jira issue URLs, `SPEC.md`-style paths in the repo, raw
   GitHub file links.
2. Repo-relative paths are read from the PR's worktree, so the spec matches the branch.
3. Remote issues are fetched through whatever the agent already has; if fetching fails the
   run continues with a note in the prompt saying the spec was unavailable. A missing spec
   degrades the review, it does not fail it.

Resolved specs are cached per `(pr_id, head_sha)` with the diff, so a re-run is free and the
UI can show exactly what context the agent was given.

---

## 6b. Diff mode — a diff, a chat, no PR

The center pane's input is a unified diff and a set of commentable lines. A GitHub PR is one
way to produce that; it is not the only one. So the app runs in a second mode where there is
no PR, no draft, no submit — just a diff and an agent to talk to about it.

```
review diff path/to/change.patch     # a diff file
review diff ~/src/shiphero/Foo       # a repo: uncommitted changes vs HEAD
review diff ~/src/foo --base main    # a repo: current branch vs a base
```

Opens the browser on a session whose center pane is the diff and whose right dock is the
chat. Selecting any part of the diff and hitting **Ask** works exactly as in PR mode —
same component, same gesture, same quoting with path and line range.

**What is absent, deliberately:**

- No review button, no verdict radio, no submit bar. Nothing here can reach GitHub.
- No worktree management. The repo you pointed at *is* the checkout, and the app only reads
  it — reading a working tree is safe in a way that switching its branch is not.
- No `review_draft`, no `draft_comment`. Notes you take are chat, not comments.

**What this is for.** Reading a diff someone sent you. Reviewing your own uncommitted work
before you push, with the agent that already knows your taste. Sanity-checking a rebase.
None of those are PRs, and all of them are the same reading problem.

**The design consequence, stated once.** The diff source is a port with three
implementations — GitHub PR, patch file, local repo — each returning `{ patch, files,
anchors }`. Everything downstream of it (rendering, theming, selection, ask, keyboard nav)
is written against that shape and knows nothing about pull requests. PR-only concerns
(drafts, comments, submit, worktrees) sit strictly above it. If diff mode needs a special
case inside the viewer, the boundary was drawn wrong.

Diff mode ships in **phase 1**, because it is phase 1 minus GitHub — building it second
would mean retrofitting the seam instead of having it from the start.

---

## 7. Cron — fetch only, never review

Internal scheduler, not crontab, so it shares the store.

Every 30 min it runs `sync()` and nothing else: refresh the PR list, fetch new diffs and
comments, mark merged/closed PRs. **It never enqueues a review.** Reviews are triggered by
hand, on PRs chosen by hand.

The reason is that the comparison is the product: a PR is reviewed by a human first, then by
the agent, and the difference between the two is the tuning signal for the skills. A
scheduler that reviews everything overnight destroys that signal.

**Merge detection.** When sync sees a PR move to `merged` or `closed`, its worktree is
removed automatically and the PR leaves the active rail. Drafts and submissions are kept.

Scheduled review may come back later. It is out of scope until the manual loop is boring.

---

## 7b. Worktrees and lifecycle

The agent reads surrounding code to find canonical helpers, so a review wants a checkout at
the PR's head. It must never be the user's own working tree.

- One dedicated clone at `~/.cache/review/repos/<repo>`, seeded once. The Shiphero-API tracked
  tree is 170MB, so this is cheap; the 10GB figure is `.venv`s and caches, not git.
- A worktree per PR, created lazily the first time that PR is reviewed, at
  `~/.cache/review/worktrees/<repo>/<number>`.
- `worktree_path` is recorded on `pull_request`.

Removal happens on exactly two events:

1. **Mark as done** — an explicit action in the rail. Removes the worktree, hides the PR from
   the active list. Reversible; the row and its drafts stay.
2. **Merged or closed**, seen by sync. Same removal, done automatically.

Reviews still run **sequentially, queue depth 1**. Selecting a PR in the UI does not touch
any worktree; only running a review does. A second review request while one is running
enqueues.

---

## 8. Phases

| # | Deliverable | Value |
|---|---|---|
| 1 | Themed diff viewer over the diff-source port + sync + list + mark as done + **diff mode** | replaces opening 22 GitHub tabs |
| 2 | Run review (agent + model per run), render comments inline, select/edit, **comment on any line myself**, submit | the core loop |
| 3 | Fetch scheduler + review queue + failure surfacing + worktree lifecycle | it stays current on its own |
| 4 | Chat pane over SSE, permission prompts, ask-about-selection | ask about the diff in place |
| 5 | Threading/replies, suggestion blocks, settings pane, linked-spec resolution | full parity, and tunable |

Phase 2 is where it earns its keep. Phase 1 alone is a worse GitHub.

Theme lands in phase 1 because retrofitting a diff viewer's colours later is more work than
tokenising them once.

---

## 9. UI language

One rule above the rest: **the diff is the page.** Everything else is furniture, and
furniture is quiet.

### Layout

Three regions, no more: a collapsible left rail (PR list; hidden in diff mode), the diff,
and a collapsible right dock (chat). No header bar. The title, mode and theme picker live in
a single 32px strip above the diff. Nothing is fixed-position over the diff.

### Type and spacing

- One monospace family for code, one sans for chrome. System stacks by default;
  configurable with the theme.
- Code at 13px / 20px line height. Chrome at 13px. No text under 12px anywhere.
- Spacing on a 4px grid. Diff rows have no vertical padding beyond line height.
- Measure is not capped — diffs are wide, and wrapping code is worse than scrolling.

### Colour

Every colour is a token from the theme. There are exactly these token groups and no
ad-hoc values:

```
bg, bg-raised, bg-sunken            surfaces
fg, fg-muted, fg-faint              text
border                              one border colour, used sparingly
accent                              one accent, used for focus and the Ask affordance
diff-add-bg, diff-add-fg
diff-del-bg, diff-del-fg
diff-hunk-bg                        hunk headers
selection-bg                        the user's selection inside the diff
syntax-*                            keyword, string, comment, number, function, type
```

Add/delete backgrounds are tinted surfaces, not saturated fills — text stays `fg`, not
green-on-green. Contrast for `fg` on `diff-add-bg` and on `diff-del-bg` must pass 7:1 in
both modes; this is checked, not eyeballed.

### Affordances

- Nothing on the diff is decorated until the pointer is over it. Hover shows the gutter `+`
  and nothing else.
- A selection inside the diff shows one floating pill near its end: **Ask** (and
  **Comment** in PR mode when the range is commentable). The pill is the only element that
  uses `accent` as a fill.
- Buttons are text with a 1px border. Primary action (Submit, Send) is a filled button;
  there is at most one on screen.
- No icons without labels except the collapse chevrons and the theme picker.
- No shadows. Depth is `bg-raised` on `bg`, that is all.

### Chat dock

Plain message list. User turns right-aligned in `bg-raised`, agent turns unboxed on `bg`.
Tool calls collapse to one line (`read src/foo.py`) and expand on click. Quoted diff
selections render as a compact code block with a `path:start-end` header that, when
clicked, scrolls the diff to that range and flashes it. Streaming text appears in place;
no typing indicator, no avatars.

### Motion

Two durations, 120ms and 200ms, ease-out. Used for: dock open/close, pill appear, the
scroll-to flash. Nothing else animates.

### Keyboard

Everything reachable by mouse is reachable by keyboard. Focus ring is `accent`, 2px, offset
2px, never suppressed.

---

## 10. Open questions

1. ~~**Repo checkout for the agent.**~~ Settled: dedicated clone under `~/.cache/review`,
   per-PR worktrees, removed on done or merge. See §7b.
2. **Multi-repo.** Schema is repo-aware; the agent needs a path per repo. Configure a
   `repo -> localPath` map?
3. **Approve.** Enabled in the UI at all, or forced through the CLI so it stays deliberate?
4. **Model pinning.** Reviews via the server inherit the session model. Pin the review agent
   to opus-5 for consistency, given Option A was chosen for the interactive agents? If the
   agent is a setting, the model probably belongs beside it as one.
5. **Auth.** Localhost-only bind and no auth, presumably. `OPENCODE_SERVER_PASSWORD` if the
   opencode server is shared.
6. **Retention.** Keep every superseded draft forever? They are the record of what the agent
   said versus what I actually submitted — that is worth keeping for tuning the skills.
