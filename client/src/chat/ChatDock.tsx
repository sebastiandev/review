import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { AppConfig, ChatPart, ChatSendRequest, DiffSelection, ModelRef, PermissionAsk, PermissionReply } from '@revu/shared'
import { Picker, type PickerItem } from './Picker'
import { quoteSelection, splitQuotes, type Quote } from './quotes'
import { LOCAL_COMMANDS, parseSlashCommand, slashPrefix, type LocalCommand } from './slashCommand'
import type { ChatTurn } from './useChat'
import type { TurnSettingsState } from './useTurnSettings'

export const DOCK_MIN_WIDTH = 320
const DOCK_STORAGE_KEY = 'revu.dockWidth'

/** Selections the user asked about; a new `id` appends them to the composer. */
export type QuoteRequest = { id: number; selections: DiffSelection[] }

type ChatDockProps = {
  open: boolean
  parts: ChatPart[]
  idle: boolean
  permissions: PermissionAsk[]
  error: string | null
  quoteRequest: QuoteRequest | null
  /** Undefined until /api/config has loaded. */
  config: AppConfig | undefined
  turn: TurnSettingsState
  lastTurn: ChatTurn | null
  /** Text, selections and command only; the caller attaches the turn settings. */
  onSend: (request: ChatSendRequest) => void
  onPermission: (id: string, response: PermissionReply) => void
  onJumpTo: (path: string, start: number, end: number) => void
}

const EMPTY_CONFIG: Pick<AppConfig, 'agents' | 'models' | 'commands'> = { agents: [], models: [], commands: [] }

const LOCAL_COMMAND_HINTS: Record<LocalCommand, string> = {
  models: 'pick a model',
  agents: 'pick an agent',
  variants: 'pick a variant',
}

const NO_VARIANT: PickerItem = { id: '', label: 'no variant' }

function storedDockWidth(): number {
  const stored = Number(localStorage.getItem(DOCK_STORAGE_KEY))
  return stored >= DOCK_MIN_WIDTH ? stored : 400
}

/** Dock width in px, persisted; `startResize` begins a pointer drag on the left edge. */
export function useDockWidth() {
  const [width, setWidth] = useState(storedDockWidth)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    localStorage.setItem(DOCK_STORAGE_KEY, String(width))
  }, [width])

  const startResize = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(true)
    const onMove = (move: globalThis.PointerEvent) => {
      const max = window.innerWidth - 400
      setWidth(Math.min(max, Math.max(DOCK_MIN_WIDTH, window.innerWidth - move.clientX)))
    }
    const onUp = () => {
      setDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [])

  return { width, dragging, startResize }
}

type QuoteBlockProps = { quote: Quote; onJumpTo: ChatDockProps['onJumpTo'] }

function QuoteBlock({ quote, onJumpTo }: QuoteBlockProps) {
  const range = quote.startLine === quote.endLine ? `${quote.startLine}` : `${quote.startLine}-${quote.endLine}`
  return (
    <div className="quote">
      <button type="button" className="quote-header" onClick={() => onJumpTo(quote.path, quote.startLine, quote.endLine)}>
        {quote.path}:{range}
      </button>
      <pre className="quote-code">{quote.text}</pre>
    </div>
  )
}

type PartViewProps = { part: ChatPart; onJumpTo: ChatDockProps['onJumpTo'] }

function PartView({ part, onJumpTo }: PartViewProps) {
  const [expanded, setExpanded] = useState(false)
  switch (part.type) {
    case 'text':
      if (part.role === 'user') {
        return (
          <div className="turn turn-user">
            {splitQuotes(part.text).map((segment, i) =>
              segment.kind === 'quote' ? (
                <QuoteBlock key={i} quote={segment.quote} onJumpTo={onJumpTo} />
              ) : (
                <p key={i} className="turn-text">
                  {segment.text.trim()}
                </p>
              ),
            )}
          </div>
        )
      }
      return (
        <div className="turn turn-assistant">
          <p className="turn-text">{part.text}</p>
        </div>
      )
    case 'tool':
      return (
        <div className={`part-tool part-tool-${part.status}`}>
          <button type="button" className="part-toggle" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
            <span className="part-chevron" aria-hidden>
              {expanded ? '▾' : '▸'}
            </span>
            <span className="part-tool-name">{part.tool}</span> {part.title}
          </button>
          {expanded && part.output && <pre className="part-output">{part.output}</pre>}
        </div>
      )
    case 'reasoning':
      return (
        <div className="part-reasoning">
          <button type="button" className="part-toggle" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
            <span className="part-chevron" aria-hidden>
              {expanded ? '▾' : '▸'}
            </span>
            reasoning
          </button>
          {expanded && <p className="part-reasoning-text">{part.text}</p>}
        </div>
      )
  }
}

type PermissionRowProps = { ask: PermissionAsk; onPermission: ChatDockProps['onPermission'] }

function PermissionRow({ ask, onPermission }: PermissionRowProps) {
  return (
    <div className="permission">
      <span className="permission-title">{ask.title}</span>
      <span className="permission-actions">
        <button type="button" onClick={() => onPermission(ask.id, 'once')}>
          Allow once
        </button>
        <button type="button" onClick={() => onPermission(ask.id, 'always')}>
          Always
        </button>
        <button type="button" onClick={() => onPermission(ask.id, 'reject')}>
          Reject
        </button>
      </span>
    </div>
  )
}

type ComposerProps = {
  idle: boolean
  quoteRequest: QuoteRequest | null
  commands: AppConfig['commands']
  onSend: ChatDockProps['onSend']
  onOpenPicker: (kind: LocalCommand) => void
}

function Composer({ idle, quoteRequest, commands, onSend, onOpenPicker }: ComposerProps) {
  const [draft, setDraft] = useState('')
  const [attached, setAttached] = useState<DiffSelection[]>([])
  const textarea = useRef<HTMLTextAreaElement>(null)
  const consumed = useRef<number | null>(null)
  const commandNames = commands.map((c) => c.name)
  const prefix = slashPrefix(draft)

  useEffect(() => {
    if (!quoteRequest || consumed.current === quoteRequest.id) return
    consumed.current = quoteRequest.id
    const quoted = quoteRequest.selections.map(quoteSelection).join('')
    const next = draft.length && !draft.endsWith('\n') ? `${draft}\n${quoted}` : `${draft}${quoted}`
    setDraft(next)
    setAttached((current) => [...current, ...quoteRequest.selections])
    const element = textarea.current
    if (element) {
      element.focus()
      requestAnimationFrame(() => element.setSelectionRange(next.length, next.length))
    }
  }, [quoteRequest, draft])

  const clear = () => {
    setDraft('')
    setAttached([])
  }

  const submit = () => {
    const text = draft.trim()
    if (!text || !idle) return
    const parsed = parseSlashCommand(text, commandNames)
    if (parsed.kind === 'local') {
      onOpenPicker(parsed.name)
      clear()
      return
    }
    const selections = attached.length ? attached : undefined
    if (parsed.kind === 'server') onSend({ command: parsed.name, text: parsed.args, selections })
    else onSend({ text, selections })
    clear()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      clear()
    }
  }

  const completions: PickerItem[] = [
    ...LOCAL_COMMANDS.map((name) => ({ id: name, label: name, hint: LOCAL_COMMAND_HINTS[name] })),
    ...commands.map((c) => ({ id: c.name, label: c.name, hint: c.description })),
  ]

  const onComplete = (item: PickerItem) => {
    const parsed = parseSlashCommand(`/${item.id}`, commandNames)
    if (parsed.kind === 'local') {
      onOpenPicker(parsed.name)
      clear()
      return
    }
    setDraft(`/${item.id} `)
    textarea.current?.focus()
  }

  return (
    <div className="composer">
      {prefix !== null && (
        <Picker items={completions} filter={prefix} keySource={textarea} onPick={onComplete} onClose={clear} />
      )}
      <textarea
        ref={textarea}
        className="composer-input"
        value={draft}
        placeholder="Ask about the diff…  ⌘↵ to send  / for commands"
        rows={4}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="composer-actions">
        <button type="button" className="button-primary" disabled={!idle || !draft.trim()} onClick={submit}>
          Send
        </button>
      </div>
    </div>
  )
}

type StatusRowProps = {
  config: Pick<AppConfig, 'agents' | 'models' | 'commands'>
  turn: TurnSettingsState
  lastTurn: ChatTurn | null
  picker: LocalCommand | null
  onOpenPicker: (kind: LocalCommand | null) => void
}

const sameModel = (a: ModelRef, b: ModelRef) => a.providerID === b.providerID && a.modelID === b.modelID

/** One 24px row naming agent · model · variant. Shows what the last turn actually used once known. */
function StatusRow({ config, turn, lastTurn, picker, onOpenPicker }: StatusRowProps) {
  const { settings } = turn
  const shownAgent = lastTurn ? lastTurn.agent : settings.agent
  const shownModel = lastTurn ? lastTurn.model : settings.model
  const shownVariant = lastTurn ? lastTurn.variant : settings.variant
  const shownModelEntry = shownModel && config.models.find((m) => sameModel(m, shownModel))
  const hasVariants = (shownModelEntry?.variants.length ?? 0) > 0

  // Pickers reflect what the user chose; the variant list follows the chosen (else actual) model.
  const variantModel = settings.model ?? lastTurn?.model
  const variantEntry = variantModel && config.models.find((m) => sameModel(m, variantModel))

  const pickers: Record<LocalCommand, { items: PickerItem[]; currentId?: string; onPick: (item: PickerItem) => void }> = {
    agents: {
      items: config.agents.map((a) => ({ id: a.name, label: a.name, hint: a.description })),
      currentId: settings.agent,
      onPick: (item) => turn.setAgent(item.id),
    },
    models: {
      items: config.models.map((m) => ({ id: `${m.providerID}/${m.modelID}`, label: m.modelID, hint: m.providerID })),
      currentId: settings.model && `${settings.model.providerID}/${settings.model.modelID}`,
      onPick: (item) => {
        const entry = config.models.find((m) => `${m.providerID}/${m.modelID}` === item.id)
        if (entry) turn.setModel({ providerID: entry.providerID, modelID: entry.modelID }, entry.variants)
      },
    },
    variants: {
      items: [NO_VARIANT, ...(variantEntry?.variants ?? []).map((v) => ({ id: v, label: v }))],
      currentId: settings.variant ?? NO_VARIANT.id,
      onPick: (item) => turn.setVariant(item.id || undefined),
    },
  }

  const close = () => onOpenPicker(null)

  return (
    <div className="status">
      {picker && (
        <Picker
          items={pickers[picker].items}
          currentId={pickers[picker].currentId}
          onPick={(item) => {
            pickers[picker].onPick(item)
            close()
          }}
          onClose={close}
        />
      )}
      <button type="button" className="status-item" onClick={() => onOpenPicker('agents')}>
        {shownAgent ?? 'default agent'}
      </button>
      <span className="status-sep" aria-hidden>
        ·
      </span>
      <button type="button" className="status-item" onClick={() => onOpenPicker('models')}>
        {shownModel?.modelID ?? 'default model'}
      </button>
      {hasVariants && (
        <>
          <span className="status-sep" aria-hidden>
            ·
          </span>
          <button type="button" className="status-item" onClick={() => onOpenPicker('variants')}>
            {shownVariant ?? 'no variant'}
          </button>
        </>
      )}
    </div>
  )
}

/** Right-hand chat dock: message list, pending permission asks and the composer. */
export function ChatDock({
  open,
  parts,
  idle,
  permissions,
  error,
  quoteRequest,
  config,
  turn,
  lastTurn,
  onSend,
  onPermission,
  onJumpTo,
}: ChatDockProps) {
  const { width, dragging, startResize } = useDockWidth()
  const list = useRef<HTMLDivElement>(null)
  const [picker, setPicker] = useState<LocalCommand | null>(null)
  const catalog = config ?? EMPTY_CONFIG

  useEffect(() => {
    const element = list.current
    if (element) element.scrollTop = element.scrollHeight
  }, [parts, permissions])

  return (
    <aside className={`dock${dragging ? ' dock-dragging' : ''}`} style={{ width: open ? width : 0 }} inert={!open}>
      <div className="dock-resize" role="separator" aria-orientation="vertical" onPointerDown={startResize} />
      <div className="dock-inner" style={{ width }}>
        <div ref={list} className="dock-messages">
          {parts.map((part) => (
            <PartView key={part.id} part={part} onJumpTo={onJumpTo} />
          ))}
          {permissions.map((ask) => (
            <PermissionRow key={ask.id} ask={ask} onPermission={onPermission} />
          ))}
          {error && <p className="dock-error">{error}</p>}
        </div>
        <div className="dock-footer">
          <StatusRow config={catalog} turn={turn} lastTurn={lastTurn} picker={picker} onOpenPicker={setPicker} />
          <Composer idle={idle} quoteRequest={quoteRequest} commands={catalog.commands} onSend={onSend} onOpenPicker={setPicker} />
        </div>
      </div>
    </aside>
  )
}
