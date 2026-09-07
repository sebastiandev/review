/** Names of the `--*` custom properties declared inside the first CSS block matching `selector`. */
export function declaredVariables(css: string, selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const block = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))
  if (!block?.[1]) throw new Error(`no block for ${selector}`)
  return [...block[1].matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!)
}
