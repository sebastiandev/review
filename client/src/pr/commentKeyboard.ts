/** Submit comments only with an unshifted command/control Enter outside IME composition. */
export function submitsComment(event: { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; isComposing: boolean }): boolean {
  return event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.isComposing
}
