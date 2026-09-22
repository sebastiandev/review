# Review

Local PR review app: GitHub inbox, per-PR worktrees, side-by-side diffs, inline chat with an
opencode agent, automatic agent reviews, submit from the same screen.

## Install

Requirements: Node 22+, `git`, `gh` (logged in: `gh auth login`), `opencode` on PATH.
macOS with Chrome or Vivaldi gets a standalone app window; anything else opens a browser tab.

```
git clone <this repo> review && cd review
npm install
npm run build
npm link -w server        # puts `review` on your PATH → server/dist/cli.js
review
```

`review update` does pull → install → build (and re-links) from then on.

**Dock icon.** `review` opens a Chromium app window; macOS shows it with the browser's icon.
For a Review icon: open http://localhost:5178 in Chrome/Vivaldi once and choose *Install Review*
(the install icon in the address bar). That creates `~/Applications/<Browser> Apps/Review.app`,
and `review` launches it from then on.

## Commands

```
review                              PR inbox in an app window
review diff <patch-file>            view a patch file
review diff <repo-dir> [--base b]   uncommitted changes, or branch vs base
review pr <url | owner/repo#n>      add/open the PR and run the agent review in the UI
review pr … --cli                   same, printed to the terminal, no UI
review pr … --agent a --model p/m --variant v
review update                       pull the latest version, install, build, re-link

--port 5178   --opencode http://localhost:4096   --cache-dir ~/.cache/review
--tab (browser tab instead of app window)   --no-open (no UI)   --dev (Vite client on :5177)
```

`opencode serve` is started automatically when nothing answers at `--opencode`.

## Where things live

- `~/.cache/review/review.sqlite` — repos, PRs, diffs, comments, drafts, submissions, agent runs
- `~/.cache/review/repos/<owner>/<name>` — one clone per repo; `worktrees/<owner>/<name>/<n>` — one checkout per PR
- `~/.cache/review/payloads/` — the supplied diff and the agent's JSON response saved by the app, per run
- `~/.cache/review/logs/review-YYYY-MM-DD.log` — console + every server event, 7 days kept
- GitHub token — macOS keychain (`security find-generic-password -s review -a github`)

## Development

```
npm run dev          # server (tsx watch, :5178) + Vite client (:5177)
npm run typecheck
npm test
```

Server: `server/src/{domain,infrastructure,application}` — domain defines ports and Commands,
infrastructure implements them (sqlite, gh, git, opencode, keychain), application wires routes.
Client: `client/src` — React + Vite. Design source: `design/README.md`.

Debugging an agent run that failed or came back empty: `.agents/skills/review-run-debug/`.
