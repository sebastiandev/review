import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DiffFile } from '@review/shared'
import { MarkdownView, type MarkdownThread } from './MarkdownView'

const file: DiffFile = { path: 'docs/spec.md', status: 'modified', additions: 3, deletions: 1 }

const content = [
  '# Title', // 1
  '', // 2
  'First paragraph', // 3
  'continues here.', // 4
  '', // 5
  '- one', // 6
  '- two', // 7
  '', // 8
  '```', // 9
  'code', // 10
  '```', // 11
  '', // 12
  '| a | b |', // 13
  '|---|---|', // 14
  '| 1 | 2 |', // 15
].join('\n')

function render(threads: MarkdownThread[] = []): string {
  return renderToStaticMarkup(
    createElement(MarkdownView, {
      file,
      content,
      compact: false,
      centerW: 900,
      threads,
      toolbar: null,
      onAsk: () => {},
      onToggleThread: () => {},
    }),
  )
}

describe('MarkdownView line stamps', () => {
  it.each([
    ['heading', '<h1 id="title" data-line-start="1" data-line-end="1"'],
    ['paragraph', '<p data-line-start="3" data-line-end="4"'],
    ['list item', '<li data-line-start="6" data-line-end="6"'],
    ['fenced code', '<pre data-line-start="9" data-line-end="11"'],
    ['table row', '<tr data-line-start="15" data-line-end="15"'],
    ['table wrapper carrying the lines, the table itself styled by Nocturne', '<div data-line-start="13" data-line-end="15"><table class="table">'],
  ])('stamps a %s with its source lines', (_, expected) => {
    expect(render()).toContain(expected)
  })
})

describe('MarkdownView threads', () => {
  const thread: MarkdownThread = { id: 'line:docs/spec.md:4', startLine: 4, endLine: 4, text: 'continues here.', open: false }

  it('highlights the block a thread touches and shows its count in the margin', () => {
    const html = render([thread])
    expect(html).toContain('<p data-line-start="3" data-line-end="4" class="md-hit"')
    expect(html).toContain('class="md-marker"')
    expect(html).toContain('>1</button>')
  })

  it('marks the block open and shows − while its card is showing', () => {
    const html = render([{ ...thread, open: true }])
    expect(html).toContain('class="md-hit md-hit-open"')
    expect(html).toContain('>−</button>')
  })

  it('leaves blocks outside the thread untouched', () => {
    const html = render([thread])
    expect(html).toContain('<h1 id="title" data-line-start="1" data-line-end="1">')
  })

  it('lists the thread in the Selections aside', () => {
    const html = render([{ ...thread, startLine: 3, endLine: 4 }])
    expect(html).toContain('lines 3–4 · chat')
  })

  it('stacks the aside under the document below 780px of center width', () => {
    expect(renderToStaticMarkup(createElement(MarkdownView, { file, content, compact: false, centerW: 700, threads: [], toolbar: null, onAsk: () => {}, onToggleThread: () => {} }))).toContain('md-row-stacked')
  })
})
