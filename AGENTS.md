# Review — working in this repo

Entry point for anyone (human or agent) changing the app. Architecture rules come from the
global `AGENTS.md` (clean architecture, Commands own transactions, ports in `domain`); this file
says where those things live *here* and how the recurring tasks are done.

Read next, by task: `README.md` (install, CLI) · `SPEC.md` (data model, sync, worktrees, agent
contract) · `design/README.md` (every screen, pixel values) · `PLAN.md` (what shipped, by phase)
· `docs/pr-mode-design.md` (server design of PR mode).

## Map

```
shared/index.ts                    wire types: rows, events (ServerEvent), settings, payload shapes. Server and client both import.
server/src/domain/                 framework-free
  pullRequests.ts store.ts …        entities + ports (Store, PullRequestProvider, Worktrees, AgentRunner, CredentialStore…)
  commands/                         use cases; the only place that calls store.transaction / emits results
  actions/                          steps shared by commands (cachePrDiff, replaceComments, recordRemoteReviews…), run inside a transaction
  agentReview.ts                    review prompt (buildReviewPrompt) + payload parsing (parsePayload, severityOf)
  diff.ts                           patch → DiffDocument (files, anchors), context-gap helpers
  rules.ts errors.ts                pure predicates; DomainError subclasses → HTTP 404/409 by code
  testing/fakes.ts                  in-memory ports for tests (fakeProvider, fakeWorktrees, fakeRunner, fakeChatHub, openTestStore…)
server/src/infrastructure/         adapters
  sqlite/store.ts + migrations/     Store over node:sqlite; NNNN_*.sql applied at open
  github/ghProvider.ts mapping.ts   PullRequestProvider over the `gh` CLI (GraphQL for PRs/reviews, REST for comments)
  github/oauthDeviceFlow.ts         device flow, `gh auth token`, GH_TOKEN injection (withGithubToken)
  gitWorktrees.ts                   clone per repo, detached worktree per PR, checkout on head move
  opencodeRunner.ts opencodeChat.ts opencodeCatalog.ts opencodeServer.ts   agent runs, chat sessions, agents/models list, spawn `opencode serve`
  keychain.ts fsPayloads.ts fileLog.ts diffSources.ts appWindow.ts
server/src/application/            wiring + HTTP
  main.ts                           composition roots: startPrMode / startDiffMode
  prMode.ts                         builds deps, subscribes policies (auto-review), returns app + scheduler + accounts
  app.ts                            shared routes (/api/scopes/:scope/*, /api/config, /api/settings, /api/events SSE) + error mapping
  prRoutes.ts                       PR-mode routes; each one = parse → one Command / one view → respond
  scopes.ts scheduler.ts reviewQueue.ts accounts.ts   diff/chat scopes, poll loop, one-at-a-time agent queue, account session
  cliReview.ts update.ts            `review pr` client + formatter, `review update`
server/src/cli.ts                  argument parsing only
client/src/
  App.tsx                           shell state: mode, view, overlays, repo/PR selection, keyboard, deep link
  pr/queries.ts                     react-query keys + hooks; useSyncInvalidation maps ServerEvents → invalidations
  api.ts                            every fetch to the server; ApiError carries the DomainError code
  workspace/Workspace.tsx           file tree + DiffView/MarkdownView + inline chats + dock, for one scope
  pr/PrWorkspace.tsx                PR wrapper: detail query, comments/drafts/findings → artifacts, submit, run review
  diff/  markdown/  chat/  inbox/  settings/  past/  shell/   one folder per screen area; *.ts = pure logic (tested), *.tsx = components
  app.css                           all styling; tokens from theme/nocturne.css; sections marked with `/* ── … ── */`
.agents/skills/review-run-debug/   how to diagnose an agent run (script + reading guide)
```

## How data flows

1. **Sync** (`scheduler` → `syncRepo`): list review-requested PRs, upsert rows, cache diff per head, replace
   comments + record my GitHub reviews for active PRs, release worktrees of finished PRs (unless a review runs).
2. **Open PR** (`openPullRequest`): clone/fetch/checkout → `pr.worktreePath`; `worktree.*` events.
3. **Scope** (`scopes.ts`): `pr:<id>` = cached diff + opencode chat session in the worktree; `local` = diff mode.
4. **Agent review** (`reviewQueue` → `runReview`): write the diff file, prompt the agent in the worktree,
   ingest the payload (file or inline JSON), one `agent_review` row per run, `review.*` events.
5. **Submit** (`submitReview`): re-check remote state/head, push draft comments + verdict via `gh`, mark files viewed.
6. **Events**: every state change emits a `ServerEvent` (`shared/index.ts`) on the bus → `/api/events` SSE →
   `useSyncInvalidation` refetches the right queries. Also logged to `~/.cache/review/logs/`.

## Recipes

**Add a use case.** `domain/commands/<name>.ts`: docstring with pre/post-conditions, `deps: Pick<Store, …>`
plus the ports it needs, `store.transaction(() => …)` for writes, emit events. Test it in
`<name>.test.ts` with `openTestStore()` (real SQLite in a temp dir) and the fakes. Then one route in
`prRoutes.ts` (or `app.ts` for scope routes) and, if the client needs it, a function in `client/src/api.ts`.

**Add a table/column.** New `server/src/infrastructure/sqlite/migrations/000N_*.sql` (never edit an applied
one). Extend the `Store` port in `domain/store.ts`, implement in `sqlite/store.ts` (`toX` row mappers at the
bottom), bump the expected versions in `sqlite/store.test.ts`. Migrations run on startup.

**Add an event.** Add the variant to `ServerEvent` in `shared/index.ts`; emit from the Command; handle it in
`client/src/pr/queries.ts:useSyncInvalidation` (invalidate) or a component (`useServerEvent`).

**Add a provider call.** Extend `PullRequestProvider` in `domain/pullRequests.ts`; implement in
`ghProvider.ts` with mapping in `mapping.ts` (fixtures in `__fixtures__/`, tests in `mapping.test.ts`);
add it to `fakeProvider` in `testing/fakes.ts` (record the call in `calls`).

**Change the review prompt or payload rules.** `domain/agentReview.ts` only. The agent's own
instructions are outside the repo (`~/.config/opencode/agent/pr-reviewer.md`, skills under `~/.agents/skills`).
opencode reads agent files at process start — restart it after editing.

**Add a screen or panel.** Pure logic in a `.ts` next to the component with a test; component in `.tsx`;
styles appended to `app.css` under a new `/* ── Section ── */`. Register keyboard shortcuts in `App.tsx`
(shell-level) or `Workspace.tsx` (diff-level) and in `shell/ShortcutsSheet.tsx`; every handler must check
`isEditing(e.target)`.

**Add a setting.** `UserSettings` in `shared/index.ts` → `domain/settings.ts` defaults → control in
`client/src/settings/Settings.tsx` (saves via `useUpdateSettings`).

## Conventions that matter here

- `commit`/`rollback` only inside `store.transaction` inside a Command; actions run inside the caller's transaction.
- Domain errors: subclass `DomainError` with a stable `code`; the client switches on `ApiError.code`.
- Tenant/identity: the GitHub login comes from the provider (`viewerLogin`), never hard-coded.
- Everything the agent needs is in the prompt or on disk; it never calls GitHub for the PR.
- Tests: Commands and routes against a real temp SQLite + fakes (`app.test.ts` is the full-path suite);
  client tests only for pure `.ts` modules. No mocks of our own modules.
- Naming: `RemoteX` = as fetched from the provider, `X` = stored entity, `XRow` = wire shape for the client.

## Run / verify

```
npm run dev            # server :5178 (tsx watch) + Vite :5177; opencode is spawned if absent
npm run typecheck      # both workspaces
npm test               # server (vitest, real sqlite) + client (vitest)
review pr <url> --cli  # end-to-end smoke of the review pipeline
.agents/skills/review-run-debug/scripts/inspect-run.sh latest   # why did that run fail / return nothing
```

State lives in `~/.cache/review/` (sqlite, clones, worktrees, payloads, logs). Deleting it is a clean slate.
