import { useState } from 'react'
import { CaretDown, CaretRight } from '@phosphor-icons/react'
import { relativeTime } from '../inbox/inboxRows'
import type { RemoteThread } from './comments'

type OutdatedCommentsProps = { threads: RemoteThread[]; now: number }

/**
 * Comments left on an earlier commit of this file. GitHub cannot place them on the current diff
 * (`line` is null), so they are listed here with the line they had at the time, folded by default.
 */
export function OutdatedComments({ threads, now }: OutdatedCommentsProps) {
  const [open, setOpen] = useState(false)
  if (threads.length === 0) return null
  const count = threads.reduce((n, t) => n + 1 + t.replies.length, 0)
  const sha = threads[0]!.root.originalCommitSha
  return (
    <section className="outdated">
      <button type="button" className="outdated-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? <CaretDown size={12} /> : <CaretRight size={12} />}
        {count} outdated comment{count === 1 ? '' : 's'}
        <span className="outdated-note">left on an earlier commit{sha ? ` (${sha.slice(0, 7)})` : ''}; the lines have since changed</span>
      </button>
      {open && (
        <div className="outdated-list">
          {threads.map((t) => (
            <div key={t.root.remoteId} className="thread outdated-thread">
              <div className="outdated-ref mono">
                line {t.root.originalLine ?? '?'}
                {t.root.side === 'LEFT' ? ' (old side)' : ''}
              </div>
              {[t.root, ...t.replies].map((c) => (
                <div key={c.remoteId} className="thread-comment">
                  <div className="artifact-ref">
                    {c.author} · {relativeTime(c.createdAt, now)}
                  </div>
                  <div className="artifact-body">{c.body}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
