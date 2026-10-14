import { expect, it } from 'vitest'
import { submitsComment } from './commentKeyboard'

it.each([
  [false, false, false, false, false],
  [false, false, true, false, false],
  [true, false, false, false, true],
  [false, true, false, false, true],
  [true, false, true, false, false],
  [true, false, false, true, false],
])('comment submission with meta=%s ctrl=%s shift=%s composing=%s', (metaKey, ctrlKey, shiftKey, isComposing, expected) => {
  expect(submitsComment({ key: 'Enter', metaKey, ctrlKey, shiftKey, isComposing })).toBe(expected)
})
