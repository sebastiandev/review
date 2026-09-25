import { ChatsCircle, Crosshair, X } from '@phosphor-icons/react'
import type { ChatThreadRef } from '@review/shared'
import { basename } from '../files/scope'
import { selectionLabel, type QuoteLine } from './chatContext'
import { highlightLine, languageOf } from '../diff/highlight'

/** General and line-context chips plus the selected code quote, all outside the scrolling messages. */
export function DockContext({ refs, active, lines, onSelect, onJump }: { refs: ChatThreadRef[]; active: ChatThreadRef | null; lines: QuoteLine[]; onSelect: (id: string | null) => void; onJump: () => void }) {
  const anchor = active?.anchor
  return <>
    <div className="dock-context-tabs"><button className="dock-context-chip" aria-pressed={!active} onClick={() => onSelect(null)}><ChatsCircle size={12} />General</button>
      {refs.filter((ref) => ref.anchor).map((ref) => <button className="dock-context-chip mono" key={ref.id} title={ref.anchor!.path} aria-pressed={ref.id === active?.id} onClick={() => onSelect(ref.id)}><Crosshair size={12} />{selectionLabel(ref.anchor!)}</button>)}
    </div>
    {anchor && <div className="dock-quote-wrap"><section className="dock-selection-quote" data-dock-quote>
      <header><Crosshair size={12} /><span className="mono">{basename(anchor.path)} · {anchor.startLine === anchor.endLine ? 'line' : 'lines'} {anchor.startLine}{anchor.endLine !== anchor.startLine ? `–${anchor.endLine}` : ''}</span><button className="btn btn-ghost btn-xs" onClick={onJump}>Jump</button><button className="btn btn-ghost btn-xs" aria-label="Return to General" onClick={() => onSelect(null)}><X size={12} /></button></header>
      <div className="dock-quote-code">{lines.map((row, i) => <div className={`quote-${row.kind}`} key={i}><span>{row.line}</span><span>{row.kind === 'add' ? '+' : row.kind === 'del' ? '−' : ' '}</span><code>{highlightLine(row.text, languageOf(anchor.path))}</code></div>)}</div>
    </section></div>}
  </>
}
