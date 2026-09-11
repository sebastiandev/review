import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** An agent turn rendered as markdown (GFM): paragraphs, lists, fenced code, tables, links. Styles under `.chat-md`. */
export function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="chat-md">
      <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
    </div>
  )
}
