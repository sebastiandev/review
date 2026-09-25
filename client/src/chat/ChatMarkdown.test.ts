import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it } from 'vitest'
import { ChatMarkdown } from './ChatMarkdown'

/** Render through the real Markdown pipeline and query context without browser effects. */
function render(text: string, compact = true) {
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(ChatMarkdown, { text, compact })))
}

it('omits bot metadata and renders Markdown instead of dumping its source in a preview', () => {
  const html = render('<!-- toolbox-reviewer-meta:{"users":["private-marker"]} -->\n\n### Current status\n\n**Please check** `code`.\n\n```python\ndef check():\n    pass\n```')
  expect(html).not.toContain('private-marker')
  expect(html).not.toContain('<!--')
  expect(html).not.toContain('```')
  expect(html).toContain('<strong>Please check</strong>')
  expect(html).toContain('<code>code</code>')
  expect(html).not.toMatch(/<(p|pre|h[1-6])(?:\s|>)/)
})

it('flattens lists and tables in previews while keeping expanded messages structured', () => {
  const text = '- first\n- second\n\n| A | B |\n|---|---|\n| 1 | 2 |'
  expect(render(text)).not.toMatch(/<(ul|li|table|tr|td)(?:\s|>)/)
  expect(render(text, false)).toContain('<table>')
  expect(render(text, false)).toContain('<ul>')
})
