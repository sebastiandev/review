import { describe, expect, it } from 'vitest'
import type { ChatPart, PermissionAsk, ServerEvent } from '@review/shared'
import { EMPTY_THREAD, applyEvent, applyHistory, type ThreadsState } from './threadStore'

const text = (id: string, text: string): ChatPart => ({ type: 'text', id, messageID: 'm1', role: 'assistant', text })
const ask = (id: string): PermissionAsk => ({ id, sessionID: 's1', title: `run ${id}` })

const LINE = 'line:src/a.ts:12'

describe('applyEvent', () => {
  it('appends a new part to its thread', () => {
    const state = applyEvent({}, { type: 'chat.part', thread: 'dock', part: text('p1', 'hi') })
    expect(state.dock?.parts).toEqual([text('p1', 'hi')])
  })

  it('replaces a part with the same id in place', () => {
    const before = applyEvent({}, { type: 'chat.part', thread: 'dock', part: text('p1', 'hi') })
    const after = applyEvent(before, { type: 'chat.part', thread: 'dock', part: text('p1', 'hi there') })
    expect(after.dock?.parts).toEqual([text('p1', 'hi there')])
  })

  it('sets idle only on the named thread', () => {
    const busy: ThreadsState = { dock: { ...EMPTY_THREAD, idle: false }, [LINE]: { ...EMPTY_THREAD, idle: false } }
    const state = applyEvent(busy, { type: 'chat.idle', thread: LINE })
    expect(state[LINE]?.idle).toBe(true)
    expect(state.dock?.idle).toBe(false)
  })

  it('records the turn provenance on its thread', () => {
    const turn: ServerEvent = { type: 'chat.turn', thread: LINE, agent: 'plan', model: { providerID: 'p', modelID: 'm' }, variant: null }
    expect(applyEvent({}, turn)[LINE]?.lastTurn).toEqual(turn)
  })

  it('stores an error and returns the thread to idle', () => {
    const busy: ThreadsState = { dock: { ...EMPTY_THREAD, idle: false } }
    const state = applyEvent(busy, { type: 'chat.error', thread: 'dock', message: 'boom' })
    expect(state.dock).toMatchObject({ error: 'boom', idle: true })
  })

  it('adds a permission ask once per id', () => {
    const once = applyEvent({}, { type: 'permission.ask', thread: LINE, permission: ask('perm1') })
    const twice = applyEvent(once, { type: 'permission.ask', thread: LINE, permission: ask('perm1') })
    expect(twice[LINE]?.permissions).toEqual([ask('perm1')])
  })

  it('removes a permission ask when done', () => {
    const asked = applyEvent({}, { type: 'permission.ask', thread: LINE, permission: ask('perm1') })
    const done = applyEvent(asked, { type: 'permission.done', thread: LINE, permissionID: 'perm1' })
    expect(done[LINE]?.permissions).toEqual([])
  })

  it('never touches another thread', () => {
    const before: ThreadsState = { dock: { ...EMPTY_THREAD, parts: [text('d1', 'dock')], permissions: [ask('pd')] } }
    let state = applyEvent(before, { type: 'chat.part', thread: LINE, part: text('l1', 'line') })
    state = applyEvent(state, { type: 'permission.ask', thread: LINE, permission: ask('pl') })
    state = applyEvent(state, { type: 'permission.done', thread: LINE, permissionID: 'pd' })
    expect(state.dock).toBe(before.dock)
  })

  it('ignores event types it does not know', () => {
    const before: ThreadsState = { dock: EMPTY_THREAD }
    const unknown = { type: 'chat.future', thread: 'dock' } as unknown as ServerEvent
    expect(applyEvent(before, unknown)).toBe(before)
  })
})

describe('applyHistory', () => {
  it('keeps streamed parts and merges history by id', () => {
    const streamed = applyEvent({}, { type: 'chat.part', thread: 'dock', part: text('p2', 'live') })
    const state = applyHistory(streamed, 'dock', [text('p1', 'old'), text('p2', 'final')])
    expect(state.dock?.parts).toEqual([text('p2', 'final'), text('p1', 'old')])
  })
})
