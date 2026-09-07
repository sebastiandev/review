import type { DatabaseSync, SQLInputValue, SQLOutputValue } from 'node:sqlite'
import type { InboxRow, PastReviewRow, PrDetail, RepoSummary, UserSettings, Verdict, WorktreeRow } from '@review/shared'
import type { PrDiff, PullRequest, RemoteComment, RemotePullRequest, Repo, RepoRef } from '../../domain/pullRequests.ts'
import type { AgentFinding, AgentReview } from '../../domain/agentReview.ts'
import type { DraftComment, ReviewDraft, Submission } from '../../domain/review.ts'
import type { Store } from '../../domain/store.ts'
import { DEFAULT_USER_SETTINGS } from '../../domain/settings.ts'

type Row = Record<string, SQLOutputValue>

/** `Store` over one `node:sqlite` connection. Transactions are BEGIN/COMMIT on that connection. */
export function sqliteStore(db: DatabaseSync): Store {
  const q = (sql: string) => db.prepare(sql)

  const store: Store = {
    transaction(fn) {
      if (db.isTransaction) throw new Error('nested transaction')
      db.exec('BEGIN')
      try {
        const result = fn()
        db.exec('COMMIT')
        return result
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    },

    repos: {
      list: () => q('SELECT * FROM repo ORDER BY owner, name').all().map(toRepo),
      get: (id) => nullable(q('SELECT * FROM repo WHERE id = ?').get(id), toRepo),
      find: (ref) =>
        nullable(q('SELECT * FROM repo WHERE provider = ? AND owner = ? AND name = ?').get(ref.provider, ref.owner, ref.name), toRepo),
      insert(r) {
        const { lastInsertRowid } = q(
          'INSERT INTO repo (provider, owner, name, tracked, auto_review, synced_at, sync_error) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(r.provider, r.owner, r.name, int(r.tracked), int(r.autoReview), r.syncedAt, r.syncError)
        return toRepo(q('SELECT * FROM repo WHERE id = ?').get(lastInsertRowid)!)
      },
      update(id, patch) {
        const cols = columns(patch, {
          provider: (v) => v,
          owner: (v) => v,
          name: (v) => v,
          tracked: int,
          autoReview: int,
          syncedAt: (v) => v,
          syncError: (v) => v,
        })
        if (cols.sets.length) q(`UPDATE repo SET ${cols.sets.join(', ')} WHERE id = ?`).run(...cols.values, id)
      },
    },

    pullRequests: {
      get: (id) => nullable(q('SELECT * FROM pull_request WHERE id = ?').get(id), toPullRequest),
      find: (repoId, number) =>
        nullable(q('SELECT * FROM pull_request WHERE repo_id = ? AND number = ?').get(repoId, number), toPullRequest),
      listByRepo(repoId, filter) {
        const where = ['repo_id = ?']
        if (filter.active) where.push('done_at IS NULL')
        if (filter.open) where.push("state = 'open'")
        return q(`SELECT * FROM pull_request WHERE ${where.join(' AND ')} ORDER BY number`).all(repoId).map(toPullRequest)
      },
      upsert(repoId, remote, fields, syncedAt) {
        const remoteValues = {
          title: remote.title,
          author: remote.author,
          url: remote.url,
          body: remote.body,
          head_ref: remote.headRef,
          base_ref: remote.baseRef,
          head_sha: remote.headSha,
          base_sha: remote.baseSha,
          is_draft: int(remote.isDraft),
          state: remote.state,
          additions: remote.additions,
          deletions: remote.deletions,
          changed_files: remote.changedFiles,
          remote_created_at: remote.createdAt,
          remote_updated_at: remote.updatedAt,
          synced_at: syncedAt,
        }
        const local = columns(fields, {
          addedByUser: int,
          reviewOnOpen: int,
          reviewRequested: int,
          specRef: (v) => v,
        })
        const existing = q('SELECT id FROM pull_request WHERE repo_id = ? AND number = ?').get(repoId, remote.number)
        if (existing) {
          const sets = [...Object.keys(remoteValues).map((k) => `${k} = ?`), ...local.sets]
          q(`UPDATE pull_request SET ${sets.join(', ')} WHERE id = ?`).run(...Object.values(remoteValues), ...local.values, existing.id)
          return toPullRequest(q('SELECT * FROM pull_request WHERE id = ?').get(existing.id)!)
        }
        const names = ['repo_id', 'number', ...Object.keys(remoteValues), ...local.names]
        const values: SQLInputValue[] = [repoId, remote.number, ...Object.values(remoteValues), ...local.values]
        const { lastInsertRowid } = q(
          `INSERT INTO pull_request (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
        ).run(...values)
        return toPullRequest(q('SELECT * FROM pull_request WHERE id = ?').get(lastInsertRowid)!)
      },
      update(id, patch) {
        const cols = columns(patch, {
          doneAt: (v) => v,
          worktreePath: (v) => v,
          state: (v) => v,
          reviewRequested: int,
        })
        if (cols.sets.length) q(`UPDATE pull_request SET ${cols.sets.join(', ')} WHERE id = ?`).run(...cols.values, id)
      },
    },

    diffs: {
      get: (prId, headSha) => nullable(q('SELECT * FROM pr_diff WHERE pr_id = ? AND head_sha = ?').get(prId, headSha), toPrDiff),
      insert(d) {
        q(
          'INSERT INTO pr_diff (pr_id, head_sha, base_sha, patch, files_json, anchors_json, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(d.prId, d.headSha, d.baseSha, d.patch, JSON.stringify(d.files), JSON.stringify(d.anchors), d.fetchedAt)
      },
    },

    comments: {
      list: (prId) => q('SELECT * FROM remote_comment WHERE pr_id = ? ORDER BY remote_created_at, id').all(prId).map(toRemoteComment),
      replace(prId, rows, fetchedAt) {
        q('DELETE FROM remote_comment WHERE pr_id = ?').run(prId)
        const insert = q(
          `INSERT INTO remote_comment (pr_id, remote_id, author, path, line, start_line, side, body, in_reply_to, remote_created_at, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        for (const c of rows) {
          insert.run(prId, c.remoteId, c.author, c.path, c.line, c.startLine, c.side, c.body, c.inReplyTo, c.createdAt, fetchedAt)
        }
      },
    },

    drafts: {
      open: (prId, headSha) =>
        nullable(q("SELECT * FROM review_draft WHERE pr_id = ? AND head_sha = ? AND status = 'open'").get(prId, headSha), toDraft),
      latestOpen: (prId) =>
        nullable(q("SELECT * FROM review_draft WHERE pr_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1").get(prId), toDraft),
      insert(prId, headSha, now) {
        const { lastInsertRowid } = q(
          "INSERT INTO review_draft (pr_id, head_sha, status, created_at, submitted_at) VALUES (?, ?, 'open', ?, NULL)",
        ).run(prId, headSha, now)
        return toDraft(q('SELECT * FROM review_draft WHERE id = ?').get(lastInsertRowid)!)
      },
      markSubmitted(id, now) {
        q("UPDATE review_draft SET status = 'submitted', submitted_at = ? WHERE id = ?").run(now, id)
      },
      comments: (draftId) => q('SELECT * FROM draft_comment WHERE draft_id = ? ORDER BY id').all(draftId).map(toDraftComment),
      getComment: (id) => nullable(q('SELECT * FROM draft_comment WHERE id = ?').get(id), toDraftComment),
      commentForFinding: (draftId, findingId) =>
        nullable(q('SELECT * FROM draft_comment WHERE draft_id = ? AND finding_id = ?').get(draftId, findingId), toDraftComment),
      insertComment(c, now) {
        const { lastInsertRowid } = q(
          `INSERT INTO draft_comment (draft_id, path, line, start_line, side, body, agent_body, origin, selected, anchor_valid, in_reply_to, finding_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          c.draftId, c.path, c.line, c.startLine, c.side, c.body, c.agentBody, c.origin,
          int(c.selected), int(c.anchorValid), c.inReplyTo, c.findingId, now, now,
        )
        return toDraftComment(q('SELECT * FROM draft_comment WHERE id = ?').get(lastInsertRowid)!)
      },
      updateComment(id, patch, now) {
        const cols = columns(patch, { body: (v) => v, selected: int, anchorValid: int })
        if (cols.sets.length) {
          q(`UPDATE draft_comment SET ${cols.sets.join(', ')}, updated_at = ? WHERE id = ?`).run(...cols.values, now, id)
        }
      },
      deleteComment(id) {
        q('DELETE FROM draft_comment WHERE id = ?').run(id)
      },
    },

    submissions: {
      insert(s, payloadJson) {
        const { lastInsertRowid } = q(
          'INSERT INTO submission (draft_id, remote_review_id, verdict, body, agent_verdict, submitted_at, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(s.draftId, s.remoteReviewId, s.verdict, s.body, s.agentVerdict, s.submittedAt, payloadJson)
        return toSubmission(q('SELECT * FROM submission WHERE id = ?').get(lastInsertRowid)!)
      },
    },

    agentReviews: {
      get: (id) => nullable(q('SELECT * FROM agent_review WHERE id = ?').get(id), toAgentReview),
      latest: (prId, headSha, status) =>
        nullable(
          q('SELECT * FROM agent_review WHERE pr_id = ? AND head_sha = ? AND (? IS NULL OR status = ?) ORDER BY id DESC LIMIT 1').get(
            prId, headSha, status, status,
          ),
          toAgentReview,
        ),
      listForPr(prId) {
        const reviews = q('SELECT * FROM agent_review WHERE pr_id = ? ORDER BY id DESC').all(prId).map(toAgentReview)
        const findings = q(
          'SELECT f.* FROM agent_finding f JOIN agent_review r ON r.id = f.agent_review_id WHERE r.pr_id = ? ORDER BY f.id',
        )
          .all(prId)
          .map(toAgentFinding)
        return reviews.map((review) => ({ review, findings: findings.filter((f) => f.agentReviewId === review.id) }))
      },
      insert(r) {
        const { lastInsertRowid } = q(
          "INSERT INTO agent_review (pr_id, head_sha, status, agent, model, variant) VALUES (?, ?, 'queued', ?, ?, ?)",
        ).run(r.prId, r.headSha, r.agent, r.model ? JSON.stringify(r.model) : null, r.variant)
        return toAgentReview(q('SELECT * FROM agent_review WHERE id = ?').get(lastInsertRowid)!)
      },
      update(id, patch) {
        const cols = columns(patch, {
          status: (v) => v,
          sessionId: (v) => v,
          verdict: (v) => v,
          summary: (v) => v,
          error: (v) => v,
          invalidAnchorCount: (v) => v,
          startedAt: (v) => v,
          finishedAt: (v) => v,
        })
        if (cols.sets.length) q(`UPDATE agent_review SET ${cols.sets.join(', ')} WHERE id = ?`).run(...cols.values, id)
      },
      findings: (reviewId) => q('SELECT * FROM agent_finding WHERE agent_review_id = ? ORDER BY id').all(reviewId).map(toAgentFinding),
      getFinding: (id) => nullable(q('SELECT * FROM agent_finding WHERE id = ?').get(id), toAgentFinding),
      insertFindings(reviewId, rows) {
        const insert = q(
          'INSERT INTO agent_finding (agent_review_id, path, line, start_line, side, severity, body) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        for (const f of rows) insert.run(reviewId, f.path, f.line, f.startLine, f.side, f.severity, f.body)
        return store.agentReviews.findings(reviewId)
      },
    },

    viewed: {
      list: (prId) =>
        q('SELECT path, head_sha FROM viewed_file WHERE pr_id = ? ORDER BY path')
          .all(prId)
          .map((r) => ({ path: str(r.path), headSha: str(r.head_sha) })),
      set(prId, path, headSha) {
        if (headSha === null) q('DELETE FROM viewed_file WHERE pr_id = ? AND path = ?').run(prId, path)
        else {
          q(
            'INSERT INTO viewed_file (pr_id, path, head_sha) VALUES (?, ?, ?) ON CONFLICT(pr_id, path) DO UPDATE SET head_sha = excluded.head_sha',
          ).run(prId, path, headSha)
        }
      },
    },

    settings: {
      read() {
        const row = q('SELECT json FROM settings WHERE id = 1').get()
        return row ? { ...DEFAULT_USER_SETTINGS, ...(JSON.parse(str(row.json)) as Partial<UserSettings>) } : DEFAULT_USER_SETTINGS
      },
      write(s) {
        q('INSERT INTO settings (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json').run(JSON.stringify(s))
      },
    },

    views: {
      inbox: (repoId) =>
        q(`${INBOX_SELECT} WHERE pr.repo_id = ? AND pr.done_at IS NULL ORDER BY pr.review_requested DESC, pr.remote_updated_at DESC`)
          .all(repoId)
          .map(toInboxRow),
      prDetail(prId) {
        const row = q(`${INBOX_SELECT} WHERE pr.id = ?`).get(prId)
        if (!row) return null
        const pr = toPullRequest(row)
        const diff = store.diffs.get(pr.id, pr.headSha)
        const draft = store.drafts.open(pr.id, pr.headSha)
        const agentReview = store.agentReviews.latest(pr.id, pr.headSha, null)
        return {
          pr: {
            ...toInboxRow(row),
            body: pr.body,
            headRef: pr.headRef,
            baseRef: pr.baseRef,
            baseSha: pr.baseSha,
            specRef: pr.specRef,
            worktreePath: pr.worktreePath,
          },
          diff: diff && {
            source: { kind: 'pr', repo: str(row.repo), number: pr.number, headSha: diff.headSha },
            patch: diff.patch,
            files: diff.files,
            anchors: diff.anchors,
          },
          comments: store.comments.list(pr.id),
          draft: draft && {
            id: draft.id,
            headSha: draft.headSha,
            status: draft.status,
            comments: store.drafts.comments(draft.id).map(({ draftId: _draftId, ...c }) => c),
          },
          agentReview: agentReview && { review: agentReview, findings: store.agentReviews.findings(agentReview.id) },
          viewed: store.viewed.list(pr.id),
        }
      },
      repoCounts: () =>
        q(
          `SELECT r.*,
                  (SELECT COUNT(*) FROM pull_request p WHERE p.repo_id = r.id AND p.done_at IS NULL) AS active_count,
                  (SELECT COUNT(*) FROM pull_request p WHERE p.repo_id = r.id AND p.done_at IS NULL AND p.review_requested = 1) AS review_requested_count
           FROM repo r ORDER BY r.owner, r.name`,
        )
          .all()
          .map((r) => ({
            ...toRepo(r),
            activeCount: num(r.active_count),
            reviewRequestedCount: num(r.review_requested_count),
          })),
      pastReviews: (verdict) =>
        q(
          `SELECT s.id AS submission_id, pr.id AS pr_id, r.owner || '/' || r.name AS repo, pr.number, pr.title, pr.url,
                  s.verdict, s.agent_verdict, s.body, s.submitted_at,
                  CASE WHEN s.agent_verdict IS NULL THEN 'not run'
                       WHEN s.agent_verdict = s.verdict THEN 'agreed' ELSE 'disagreed' END AS agent_agreement
           FROM submission s
           JOIN review_draft d ON d.id = s.draft_id
           JOIN pull_request pr ON pr.id = d.pr_id
           JOIN repo r ON r.id = pr.repo_id
           WHERE (? IS NULL OR s.verdict = ?)
           ORDER BY s.submitted_at DESC, s.id DESC`,
        )
          .all(verdict, verdict)
          .map(
            (r): PastReviewRow => ({
              submissionId: num(r.submission_id),
              prId: num(r.pr_id),
              repo: str(r.repo),
              number: num(r.number),
              title: str(r.title),
              url: str(r.url),
              verdict: str(r.verdict) as Verdict,
              agentVerdict: (r.agent_verdict as Verdict | null) ?? null,
              agentAgreement: str(r.agent_agreement) as PastReviewRow['agentAgreement'],
              body: str(r.body),
              submittedAt: str(r.submitted_at),
            }),
          ),
      worktrees: () =>
        q(
          `SELECT pr.id AS pr_id, r.owner || '/' || r.name AS repo, pr.number, pr.title, pr.worktree_path, pr.state, pr.done_at
           FROM pull_request pr JOIN repo r ON r.id = pr.repo_id
           WHERE pr.worktree_path IS NOT NULL ORDER BY repo, pr.number`,
        )
          .all()
          .map(
            (r): Omit<WorktreeRow, 'sizeBytes'> => ({
              prId: num(r.pr_id),
              repo: str(r.repo),
              number: num(r.number),
              title: str(r.title),
              path: str(r.worktree_path),
              state: str(r.state) as WorktreeRow['state'],
              doneAt: (r.done_at as string | null) ?? null,
            }),
          ),
    },
  }
  return store
}

/** `pull_request.*` plus the inbox aggregates; callers append WHERE/ORDER BY. */
const INBOX_SELECT = `SELECT pr.*, r.owner || '/' || r.name AS repo,
         (SELECT COUNT(*) FROM remote_comment rc WHERE rc.pr_id = pr.id) AS remote_comment_count,
         (SELECT COUNT(*) FROM draft_comment dc JOIN review_draft d ON d.id = dc.draft_id
           WHERE d.pr_id = pr.id AND d.head_sha = pr.head_sha AND d.status = 'open') AS draft_comment_count,
         (SELECT s.verdict FROM submission s JOIN review_draft d ON d.id = s.draft_id
           WHERE d.pr_id = pr.id AND d.head_sha = pr.head_sha ORDER BY s.id DESC LIMIT 1) AS submitted_verdict,
         (SELECT ar.status FROM agent_review ar WHERE ar.pr_id = pr.id AND ar.head_sha = pr.head_sha ORDER BY ar.id DESC LIMIT 1) AS agent_status,
         (SELECT ar.verdict FROM agent_review ar WHERE ar.pr_id = pr.id AND ar.head_sha = pr.head_sha ORDER BY ar.id DESC LIMIT 1) AS agent_verdict
  FROM pull_request pr JOIN repo r ON r.id = pr.repo_id`

// --- row mapping ---------------------------------------------------------------------------

const int = (v: boolean) => (v ? 1 : 0)
const bool = (v: SQLOutputValue) => v === 1
const num = (v: SQLOutputValue) => Number(v)
const str = (v: SQLOutputValue) => String(v)
const nullable = <T>(row: Row | undefined, map: (r: Row) => T): T | null => (row ? map(row) : null)

/** Turn a camelCase patch into `SET` fragments; keys absent from `patch` are skipped. */
function columns<P extends object>(
  patch: P,
  encoders: { [K in keyof Required<P>]: (v: Exclude<P[K], undefined>) => SQLInputValue },
): { names: string[]; sets: string[]; values: SQLInputValue[] } {
  const names: string[] = []
  const values: SQLInputValue[] = []
  for (const key of Object.keys(encoders) as (keyof P & string)[]) {
    const value = patch[key]
    if (value === undefined) continue
    names.push(key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`))
    values.push(encoders[key](value as Exclude<P[typeof key], undefined>))
  }
  return { names, sets: names.map((n) => `${n} = ?`), values }
}

function toRepo(r: Row): Repo {
  return {
    id: num(r.id),
    provider: str(r.provider) as RepoRef['provider'],
    owner: str(r.owner),
    name: str(r.name),
    tracked: bool(r.tracked),
    autoReview: bool(r.auto_review),
    syncedAt: (r.synced_at as string | null) ?? null,
    syncError: (r.sync_error as string | null) ?? null,
  }
}

function toRemote(r: Row): RemotePullRequest {
  return {
    number: num(r.number),
    title: str(r.title),
    author: str(r.author),
    url: str(r.url),
    body: str(r.body),
    headRef: str(r.head_ref),
    baseRef: str(r.base_ref),
    headSha: str(r.head_sha),
    baseSha: str(r.base_sha),
    isDraft: bool(r.is_draft),
    state: str(r.state) as PullRequest['state'],
    additions: num(r.additions),
    deletions: num(r.deletions),
    changedFiles: num(r.changed_files),
    reviewRequested: bool(r.review_requested),
    createdAt: str(r.remote_created_at),
    updatedAt: str(r.remote_updated_at),
  }
}

function toPullRequest(r: Row): PullRequest {
  return {
    ...toRemote(r),
    id: num(r.id),
    repoId: num(r.repo_id),
    addedByUser: bool(r.added_by_user),
    reviewOnOpen: bool(r.review_on_open),
    specRef: (r.spec_ref as string | null) ?? null,
    doneAt: (r.done_at as string | null) ?? null,
    worktreePath: (r.worktree_path as string | null) ?? null,
    syncedAt: str(r.synced_at),
  }
}

function toPrDiff(r: Row): PrDiff {
  return {
    prId: num(r.pr_id),
    headSha: str(r.head_sha),
    baseSha: str(r.base_sha),
    patch: str(r.patch),
    files: JSON.parse(str(r.files_json)) as PrDiff['files'],
    anchors: JSON.parse(str(r.anchors_json)) as PrDiff['anchors'],
    fetchedAt: str(r.fetched_at),
  }
}

function toRemoteComment(r: Row): RemoteComment {
  return {
    remoteId: str(r.remote_id),
    author: str(r.author),
    path: str(r.path),
    line: (r.line as number | null) ?? null,
    startLine: (r.start_line as number | null) ?? null,
    side: (r.side as RemoteComment['side']) ?? null,
    body: str(r.body),
    inReplyTo: (r.in_reply_to as string | null) ?? null,
    createdAt: str(r.remote_created_at),
  }
}

function toDraft(r: Row): ReviewDraft {
  return {
    id: num(r.id),
    prId: num(r.pr_id),
    headSha: str(r.head_sha),
    status: str(r.status) as ReviewDraft['status'],
    createdAt: str(r.created_at),
    submittedAt: (r.submitted_at as string | null) ?? null,
  }
}

function toDraftComment(r: Row): DraftComment {
  return {
    id: num(r.id),
    draftId: num(r.draft_id),
    path: str(r.path),
    line: num(r.line),
    startLine: (r.start_line as number | null) ?? null,
    side: str(r.side) as DraftComment['side'],
    body: str(r.body),
    agentBody: (r.agent_body as string | null) ?? null,
    origin: str(r.origin) as DraftComment['origin'],
    selected: bool(r.selected),
    anchorValid: bool(r.anchor_valid),
    inReplyTo: (r.in_reply_to as string | null) ?? null,
    findingId: (r.finding_id as number | null) ?? null,
  }
}

function toSubmission(r: Row): Submission {
  return {
    id: num(r.id),
    draftId: num(r.draft_id),
    remoteReviewId: str(r.remote_review_id),
    verdict: str(r.verdict) as Verdict,
    body: str(r.body),
    agentVerdict: (r.agent_verdict as Verdict | null) ?? null,
    submittedAt: str(r.submitted_at),
  }
}

function toInboxRow(r: Row): InboxRow {
  return {
    id: num(r.id),
    repoId: num(r.repo_id),
    number: num(r.number),
    title: str(r.title),
    author: str(r.author),
    url: str(r.url),
    isDraft: bool(r.is_draft),
    state: str(r.state) as InboxRow['state'],
    additions: num(r.additions),
    deletions: num(r.deletions),
    changedFiles: num(r.changed_files),
    headSha: str(r.head_sha),
    headRef: str(r.head_ref),
    specRef: (r.spec_ref as string | null) ?? null,
    reviewRequested: bool(r.review_requested),
    addedByUser: bool(r.added_by_user),
    doneAt: (r.done_at as string | null) ?? null,
    hasWorktree: r.worktree_path !== null,
    createdAt: str(r.remote_created_at),
    updatedAt: str(r.remote_updated_at),
    remoteCommentCount: num(r.remote_comment_count),
    draftCommentCount: num(r.draft_comment_count),
    submittedVerdict: (r.submitted_verdict as Verdict | null) ?? null,
    agentStatus: (r.agent_status as InboxRow['agentStatus']) ?? null,
    agentVerdict: (r.agent_verdict as Verdict | null) ?? null,
  }
}

function toAgentReview(r: Row): AgentReview {
  return {
    id: num(r.id),
    prId: num(r.pr_id),
    headSha: str(r.head_sha),
    status: str(r.status) as AgentReview['status'],
    agent: str(r.agent),
    model: r.model === null ? null : (JSON.parse(str(r.model)) as AgentReview['model']),
    variant: (r.variant as string | null) ?? null,
    sessionId: (r.session_id as string | null) ?? null,
    verdict: (r.verdict as Verdict | null) ?? null,
    summary: (r.summary as string | null) ?? null,
    error: (r.error as string | null) ?? null,
    invalidAnchorCount: num(r.invalid_anchor_count),
    startedAt: (r.started_at as string | null) ?? null,
    finishedAt: (r.finished_at as string | null) ?? null,
  }
}

function toAgentFinding(r: Row): AgentFinding {
  return {
    id: num(r.id),
    agentReviewId: num(r.agent_review_id),
    path: str(r.path),
    line: num(r.line),
    startLine: (r.start_line as number | null) ?? null,
    side: str(r.side) as AgentFinding['side'],
    severity: str(r.severity) as AgentFinding['severity'],
    body: str(r.body),
  }
}
