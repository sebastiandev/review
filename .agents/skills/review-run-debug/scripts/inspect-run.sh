#!/usr/bin/env bash
# Inspect one agent review run end to end: DB row, payload files, opencode session transcript.
# usage: inspect-run.sh [run-id | latest] [--cache-dir DIR] [--opencode URL] [--full]
set -euo pipefail

CACHE_DIR="${REVIEW_CACHE_DIR:-$HOME/.cache/review}"
OPENCODE="${REVIEW_OPENCODE_URL:-http://localhost:4096}"
RUN="latest"
FULL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --cache-dir) CACHE_DIR="$2"; shift 2 ;;
    --opencode) OPENCODE="$2"; shift 2 ;;
    --full) FULL=1; shift ;;
    *) RUN="$1"; shift ;;
  esac
done
DB="$CACHE_DIR/review.sqlite"
[ -f "$DB" ] || { echo "no database at $DB"; exit 1; }

if [ "$RUN" = "latest" ]; then
  RUN=$(sqlite3 "$DB" "SELECT id FROM agent_review ORDER BY id DESC LIMIT 1")
fi

echo "== agent_review #$RUN"
sqlite3 -header -column "$DB" "SELECT ar.id, ar.status, ar.agent, ar.model, ar.variant, ar.verdict, ar.invalid_anchor_count AS bad_anchors,
  ar.started_at, ar.finished_at, pr.number AS pr, pr.head_sha = ar.head_sha AS on_current_head
  FROM agent_review ar JOIN pull_request pr ON pr.id = ar.pr_id WHERE ar.id = $RUN"
echo
echo "-- summary / error"
sqlite3 "$DB" "SELECT COALESCE(summary, '(none)') FROM agent_review WHERE id = $RUN"
sqlite3 "$DB" "SELECT 'error: ' || error FROM agent_review WHERE id = $RUN AND error IS NOT NULL"
echo
echo "-- findings"
sqlite3 -header -column "$DB" "SELECT severity, path, line, substr(body, 1, 90) AS body FROM agent_finding WHERE agent_review_id = $RUN ORDER BY id"

read -r PR_ID HEAD SESSION WT < <(sqlite3 -separator ' ' "$DB" "SELECT ar.pr_id, ar.head_sha, COALESCE(ar.session_id, '-'), COALESCE(pr.worktree_path, '-')
  FROM agent_review ar JOIN pull_request pr ON pr.id = ar.pr_id WHERE ar.id = $RUN")

echo
echo "== payload files"
ls -la "$CACHE_DIR/payloads/" 2>/dev/null | grep "pr-$PR_ID-$HEAD-$RUN\." || echo "(none written)"
PAYLOAD="$CACHE_DIR/payloads/pr-$PR_ID-$HEAD-$RUN.json"
[ -f "$PAYLOAD" ] && { echo; cat "$PAYLOAD"; echo; }

if [ "$SESSION" != "-" ] && [ "$WT" != "-" ]; then
  echo
  echo "== opencode session $SESSION (cwd $WT)"
  ENC=$(python3 -c "import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))" "$WT")
  curl -sf "$OPENCODE/session/$SESSION/message?directory=$ENC" | FULL=$FULL python3 -c '
import sys, json, os
full = os.environ.get("FULL") == "1"
ms = json.load(sys.stdin)
tools = 0
for m in ms:
    role = m["info"]["role"]
    for p in m["parts"]:
        t = p["type"]
        if t == "text":
            text = p["text"] if full else p["text"][:500].replace("\n", " | ")
            print(f"{role:9} TEXT  {text}")
        elif t == "tool":
            tools += 1
            st = p.get("state", {})
            inp = json.dumps(st.get("input", {}))
            if not full: inp = inp[:160]
            err = st.get("error")
            line = f"{role:9} TOOL  {p['"'"'tool'"'"']:10} {st.get('"'"'status'"'"','"'"'?'"'"'):9} {inp}"
            if err: line += f"\n          ERROR {str(err)[:300]}"
            print(line)
        elif t == "reasoning" and full:
            print(f"{role:9} THINK {p.get('"'"'text'"'"','"'"''"'"')[:800]}")
print(f"-- {len(ms)} messages, {tools} tool calls")
last = [m for m in ms if m["info"]["role"] == "assistant"]
if last:
    info = last[-1]["info"]
    print(f"-- ran as agent={info.get('"'"'agent'"'"')} model={info.get('"'"'providerID'"'"')}/{info.get('"'"'modelID'"'"')} variant={info.get('"'"'variant'"'"')}")
' || echo "(session not reachable at $OPENCODE — is opencode serve running?)"
fi

echo
echo "== log lines for this run"
grep -h "agentReviewId\":$RUN[,}]" "$CACHE_DIR"/logs/*.log 2>/dev/null | tail -20 || true
