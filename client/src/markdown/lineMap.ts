/** Source line range of a rendered markdown block, 1-based and inclusive. */
export type LineRange = { startLine: number; endLine: number }

/** Source lines a block element spans, read from its `data-line-start` / `data-line-end`. */
export type BlockLines = { start: number; end: number }

/** The lines a selection covers when it starts in `startBlock` and ends in `endBlock`: min start, max end. */
export function linesFromBlocks(startBlock: BlockLines, endBlock: BlockLines): LineRange {
  return {
    startLine: Math.min(startBlock.start, endBlock.start),
    endLine: Math.max(startBlock.end, endBlock.end),
  }
}

/** Nearest ancestor (or self) carrying a line stamp, or null when the node is outside the document. */
export function blockOf(node: Node | null): BlockLines | null {
  const element = node instanceof Element ? node : node?.parentElement ?? null
  const block = element?.closest<HTMLElement>('[data-line-start]') ?? null
  if (!block) return null
  const start = Number(block.dataset.lineStart)
  const end = Number(block.dataset.lineEnd)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return { start, end }
}

type SelectionEnds = { anchorNode: Node | null; focusNode: Node | null }

/** Lines covered by a DOM selection over stamped blocks; null when either end is outside the document. */
export function rangeOfSelection(range: Range | SelectionEnds): LineRange | null {
  const [from, to] =
    range instanceof Range ? [range.startContainer, range.endContainer] : [range.anchorNode, range.focusNode]
  const startBlock = blockOf(from)
  const endBlock = blockOf(to)
  if (!startBlock || !endBlock) return null
  return linesFromBlocks(startBlock, endBlock)
}

/** Whether a thread's lines touch a block's lines. */
export function overlaps(thread: LineRange, block: BlockLines): boolean {
  return thread.startLine <= block.end && thread.endLine >= block.start
}
