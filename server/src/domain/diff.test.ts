import { describe, expect, it } from 'vitest'
import { buildDiffDocument } from './diff.ts'

const ref = { kind: 'patch' as const, path: 'x.patch' }

const patch = `diff --git a/src/a.py b/src/a.py
--- a/src/a.py
+++ b/src/a.py
@@ -1,3 +1,3 @@
 keep
-old
+new
 tail
diff --git a/src/gone.py b/src/gone.py
deleted file mode 100644
--- a/src/gone.py
+++ /dev/null
@@ -1,2 +0,0 @@
-a
-b
diff --git a/src/fresh.py b/src/fresh.py
new file mode 100644
--- /dev/null
+++ b/src/fresh.py
@@ -0,0 +1 @@
+hello
`

describe('buildDiffDocument', () => {
  const doc = buildDiffDocument(ref, patch)

  it('anchors added and context lines on the new side, never deleted ones', () => {
    expect(doc.anchors['src/a.py']).toEqual([1, 2, 3])
  })

  it('a deleted file has no anchors', () => {
    expect(doc.anchors['src/gone.py']).toEqual([])
  })

  it.each([
    ['src/a.py', 'modified', 1, 1],
    ['src/gone.py', 'deleted', 0, 2],
    ['src/fresh.py', 'added', 1, 0],
  ])('%s is %s with +%i/-%i', (path, status, additions, deletions) => {
    expect(doc.files.find((f) => f.path === path)).toEqual({ path, status, additions, deletions })
  })

  it('keeps the raw patch and source ref', () => {
    expect(doc.patch).toBe(patch)
    expect(doc.source).toEqual(ref)
  })
})
