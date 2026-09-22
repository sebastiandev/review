---
name: review-run-debug
description: Diagnose an agent review run in the Review app — why it failed, hung, or came back with zero findings. Walks the agent_review row, the payload files, the opencode session transcript (tool calls, denied permissions, final reply) and the daily log. Use when a review is stuck on "Reviewing…", shows "Review failed", or returns "No findings" and you want to know what the agent actually did.
---

# Debugging an agent review run

One command does the whole walk:

```
.agents/skills/review-run-debug/scripts/inspect-run.sh            # latest run
.agents/skills/review-run-debug/scripts/inspect-run.sh 8          # run #8
.agents/skills/review-run-debug/scripts/inspect-run.sh 8 --full   # untruncated text + reasoning
```

Flags: `--cache-dir DIR` (default `~/.cache/review`), `--opencode URL` (default `http://localhost:4096`).

## What it prints, and what each part tells you

1. **`agent_review` row** — status, agent/model/variant, verdict, `bad_anchors`, timestamps,
   `on_current_head`. `started_at` set but `finished_at` null for minutes = the run died with
   the server (a restart marks it failed on next boot). `on_current_head = 0` = the PR moved;
   the UI shows "Run agent review" again even though this run is fine.
2. **findings** — valid inline comments. Empty with `bad_anchors > 0` = invalid line anchors;
   the current app preserves those comments in the summary. Older runs may have dropped
   them; their original text remains in the saved payload. Check whether the agent copied
   Read's `.diff` file line prefixes instead of source-file line numbers.
3. **payload files** — `.diff` = what the Command handed the agent; `.json` = what came back.
   The app saves `.json` from the final reply. No `.json` means no valid JSON reply was
   received or persistence failed. Check the transcript and run error.
4. **opencode session** — every tool call with status. Look for:
    - `TOOL apply_patch error` / `write error` → stale instructions tried to write a file.
      The current contract is read-only with JSON in the final reply; reload the agent
      configuration and check `buildReviewPrompt`, rather than granting write permission.
   - `bash gh pr view/diff` → the agent ignored the supplied diff and re-fetched; check the
     prompt in `server/src/domain/agentReview.ts:buildReviewPrompt`.
   - many `read`/`grep` then a final reply with an empty `comments` array → the model decided
     against reporting. Check the reasoning titles (`--full`), the variant (`low` suppresses),
     and the suppression language in `~/.agents/skills/eng-review/SKILL.md` and
     `~/.config/opencode/agent/pr-reviewer.md`.
   - last line `ran as agent=… model=… variant=…` — confirms what actually executed.
5. **log lines** — `review.queued/running/progress/ready/failed` events for the run from
   `~/.cache/review/logs/review-YYYY-MM-DD.log`.

## Manual equivalents

```
sqlite3 ~/.cache/review/review.sqlite "select * from agent_review order by id desc limit 3"
ls ~/.cache/review/payloads | tail
curl -s "localhost:4096/session/<id>/message?directory=<url-encoded worktree>" | jq '.[].parts[] | select(.type=="tool") | {tool, status: .state.status}'
grep review.failed ~/.cache/review/logs/review-$(date +%F).log
```

## Things that looked like bugs but were not

- **Empty findings after 30–45 tool calls.** Not an ingest bug; the model chose silence.
- **Run stuck spinning forever.** The dev server restarted mid-run (`tsx watch`); the row
  stayed `running`. Startup now marks such rows failed.
- **Review "did not land"** on GitHub while the row says `ready` — check `submission`, not
  `agent_review`; the agent run and the human submit are different tables.

## Checking whether opencode has the current agent definition

opencode reads agent `.md` files at process start. After editing one:

```
curl -s "localhost:4096/agent?directory=<encoded cwd>" | jq '.[] | select(.name=="pr-reviewer") | .prompt' | grep -c "<a phrase you just added>"
```

`0` → restart `opencode serve` (the app spawns it; restarting the app restarts it).
