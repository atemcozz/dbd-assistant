import { hasEnoughEscapes, requiredEscapes } from '../src/game-rules'

describe('Escape win threshold', () => {
  it('rounds the required escapes up', () => {
    expect(requiredEscapes(1)).toBe(1)
    expect(requiredEscapes(2)).toBe(1)
    expect(requiredEscapes(3)).toBe(2)
    expect(requiredEscapes(4)).toBe(2)
    expect(requiredEscapes(5)).toBe(3)
    expect(requiredEscapes(7)).toBe(4)
  })

  it('does not award a win without survivors', () => {
    expect(hasEnoughEscapes(0, 0)).toBe(false)
  })

  it('requires reaching the rounded-up threshold', () => {
    expect(hasEnoughEscapes(2, 5)).toBe(false)
    expect(hasEnoughEscapes(3, 5)).toBe(true)
    expect(hasEnoughEscapes(3, 7)).toBe(false)
    expect(hasEnoughEscapes(4, 7)).toBe(true)
  })
})
