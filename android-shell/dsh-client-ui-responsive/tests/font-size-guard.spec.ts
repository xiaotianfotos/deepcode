// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { FontSizeGuard } from '../src/client/font-size-guard.ts'

it('intercepts font shortcuts at limits, resets, and leaves normal typing/IME intact', () => {
  let size = 14
  const guard = new FontSizeGuard({ getTheme: () => ({ fontSize: size }), setFontSize: px => { size = px } })
  const fire = (key: string, options: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true, ...options })
    document.dispatchEvent(event)
    return event.defaultPrevented
  }
  guard.attach()
  try {
    expect(fire('+')).toBe(true); expect(size).toBe(15)
    expect(fire('=')).toBe(true); expect(size).toBe(16)
    for (let i = 0; i < 5; i++) expect(fire('+')).toBe(true)
    expect(size).toBe(17)
    for (let i = 0; i < 10; i++) expect(fire('-')).toBe(true)
    expect(size).toBe(12)
    expect(fire('0')).toBe(true); expect(size).toBe(14)
    expect(fire('+', { ctrlKey: false })).toBe(false)
    expect(fire('+', { altKey: true })).toBe(false)
    expect(fire('+', { isComposing: true })).toBe(false)
    expect(fire('c')).toBe(false); expect(size).toBe(14)
    window.dispatchEvent(new CustomEvent('dsh-content-font-shortcut', { detail: 'increase' }))
    expect(size).toBe(15)
    window.dispatchEvent(new CustomEvent('dsh-content-font-shortcut', { detail: 'reset' }))
    expect(size).toBe(14)
  } finally { guard.detach() }
  expect(fire('+')).toBe(false)
})
