import { describe, expect, it } from 'vitest'
import { parsePatch, splitRows, type DiffLine } from './parsePatch'

const PATCH = `diff --git a/src/a.py b/src/a.py
index 1111111..2222222 100644
--- a/src/a.py
+++ b/src/a.py
@@ -1,3 +1,3 @@
 keep
-old
+new
 tail
\\ No newline at end of file
diff --git a/gone.txt b/gone.txt
deleted file mode 100644
--- a/gone.txt
+++ /dev/null
@@ -1 +0,0 @@
-bye
`

describe('parsePatch', () => {
  const files = parsePatch(PATCH)

  it('identifies files by their new path, or the old one when deleted', () => {
    expect(files.map((f) => f.path)).toEqual(['src/a.py', 'gone.txt'])
  })

  it('numbers each line on the sides it exists on and strips the marker', () => {
    expect(files[0]!.hunks[0]!.lines).toEqual([
      { kind: 'normal', oldLine: 1, newLine: 1, text: 'keep' },
      { kind: 'del', oldLine: 2, newLine: null, text: 'old' },
      { kind: 'add', oldLine: null, newLine: 2, text: 'new' },
      { kind: 'normal', oldLine: 3, newLine: 3, text: 'tail' },
    ])
  })

  it('keeps the hunk header verbatim', () => {
    expect(files[1]!.hunks[0]!.header).toBe('@@ -1 +0,0 @@')
  })

  it('returns no files for an empty patch', () => {
    expect(parsePatch('')).toEqual([])
  })
})

describe('splitRows', () => {
  const normal = (n: number): DiffLine => ({ kind: 'normal', oldLine: n, newLine: n, text: `c${n}` })
  const del = (n: number): DiffLine => ({ kind: 'del', oldLine: n, newLine: null, text: `d${n}` })
  const add = (n: number): DiffLine => ({ kind: 'add', oldLine: null, newLine: n, text: `a${n}` })

  it('puts context on both sides', () => {
    expect(splitRows([normal(1)])).toEqual([{ left: normal(1), right: normal(1) }])
  })

  it('pairs a removal run with the addition run that follows it', () => {
    expect(splitRows([del(2), del(3), add(2)])).toEqual([
      { left: del(2), right: add(2) },
      { left: del(3), right: null },
    ])
  })

  it('leaves the left side empty for additions without removals', () => {
    expect(splitRows([normal(1), add(2), normal(2)])).toEqual([
      { left: normal(1), right: normal(1) },
      { left: null, right: add(2) },
      { left: normal(2), right: normal(2) },
    ])
  })
})
