import { expect, it } from 'vitest'
import { mentionsUser } from './attention.ts'

it.each([
  ['@seba please', true], ['Thanks (@Seba).', true], ['@sebastian', false],
  ['@seba-team', false], ['@seba/team', false], ['mail@seba.com', false], ['@@seba', false],
])('matches explicit mentions in %s', (body, expected) => {
  expect(mentionsUser(body, 'seba')).toBe(expected)
})
