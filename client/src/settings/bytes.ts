const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/** `284 MB`, `1.2 GB`: one decimal from GB up, none below. */
export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000
    unit++
  }
  const text = unit >= 3 ? value.toFixed(1).replace(/\.0$/, '') : Math.round(value).toString()
  return `${text} ${UNITS[unit]}`
}
