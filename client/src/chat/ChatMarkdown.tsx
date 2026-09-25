import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAccount } from '../pr/queries'
import { ImageSquare } from '@phosphor-icons/react'

type TextNode = { type: string; value?: string; url?: string; children?: TextNode[] }

/** Recognize mention tokens in prose only, never in code or existing links. */
function remarkMentions() {
  return (tree: TextNode) => {
    const walk = (node: TextNode) => {
      if (!node.children || ['link', 'code', 'inlineCode', 'html'].includes(node.type)) return
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text') { walk(child); return [child] }
        return (child.value ?? '').split(/(@[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*)/g).map((value) =>
          value.startsWith('@') ? { type: 'link', url: `https://github.com/${value.slice(1)}`, children: [{ type: 'text', value }] } : { type: 'text', value })
      })
    }
    walk(tree)
  }
}

/** An agent turn rendered as markdown (GFM): paragraphs, lists, fenced code, tables, links. Styles under `.chat-md`. */
export function ChatMarkdown({ text, compact = false }: { text: string; compact?: boolean }) {
  const viewer = useAccount().data?.login
  return (
    <div className={compact ? 'chat-md chat-md-compact' : 'chat-md'}>
      <Markdown skipHtml remarkPlugins={[remarkGfm, remarkMentions]} components={{
        ...(compact ? {
          p: ({ children }: { children?: React.ReactNode }) => <span>{children} </span>,
          pre: ({ children }: { children?: React.ReactNode }) => <span>{children} </span>,
          h1: ({ children }: { children?: React.ReactNode }) => <strong>{children} </strong>,
          h2: ({ children }: { children?: React.ReactNode }) => <strong>{children} </strong>,
          h3: ({ children }: { children?: React.ReactNode }) => <strong>{children} </strong>,
          h4: ({ children }: { children?: React.ReactNode }) => <strong>{children} </strong>,
          h5: ({ children }: { children?: React.ReactNode }) => <strong>{children} </strong>,
          h6: ({ children }: { children?: React.ReactNode }) => <strong>{children} </strong>,
          ul: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
          ol: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
          li: ({ children }: { children?: React.ReactNode }) => <span>• {children} </span>,
          blockquote: ({ children }: { children?: React.ReactNode }) => <span>{children} </span>,
          table: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
          thead: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
          tbody: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
          tr: ({ children }: { children?: React.ReactNode }) => <span>{children} </span>,
          th: ({ children }: { children?: React.ReactNode }) => <span>{children} </span>,
          td: ({ children }: { children?: React.ReactNode }) => <span>{children} </span>,
          hr: () => <span> · </span>,
        } : {}),
        a: ({ href, children }) => {
          const raw = String(children)
          const mention = raw.startsWith('@')
          const attachment = raw.startsWith('▧ image')
          const shortened = raw.startsWith('https://github.com/')
            ? raw.replace(/^https:\/\/github.com\/[^/]+\/[^/]+\//, '').replace(/(changes\/|commit\/)([a-f0-9]{7})[a-f0-9]+/g, '$1$2') : raw
          return <a href={href} target="_blank" rel="noreferrer" title={href} className={attachment ? 'attachment-chip' : mention ? `mention${raw.slice(1).toLowerCase() === viewer?.toLowerCase() ? ' mention-me' : ''}` : undefined}>
            {attachment ? <><ImageSquare size={14} />{raw.slice(2)}</> : raw.startsWith('https://github.com/') ? shortened.length > 64 ? `…${shortened.slice(-63)}` : shortened : children}
          </a>
        },
        img: ({ src, alt }) => <a className="attachment-chip" href={src} target="_blank" rel="noreferrer"><ImageSquare size={14} />{alt || 'image'} · Open</a>,
      }}>{text}</Markdown>
    </div>
  )
}
