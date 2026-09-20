// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ComposerPopupGuard, composerPopupMaxHeight, popupMaxWidth, popupShiftLeft,
} from '../src/client/composer-popup-guard.ts'

// jsdom ships no ResizeObserver; the guard only needs the observation API.
vi.stubGlobal('ResizeObserver', class {
  /** No-op: the guard re-measures through rAF anyway. */
  observe(): void {}
  /** No-op. */
  unobserve(): void {}
  /** No-op. */
  disconnect(): void {}
})

describe('popupMaxWidth', () => {
  it('keeps the design cap when the viewport is wide', () => {
    expect(popupMaxWidth(450)).toBe(340)
  })

  it('follows the viewport fraction on narrow phones', () => {
    expect(popupMaxWidth(360)).toBe(331)
  })
})

describe('popupShiftLeft', () => {
  it('shifts a popup that left the viewport back to the gap', () => {
    expect(popupShiftLeft(-84, 256, 360)).toBe(92)
  })

  it('shifts a popup that ran past the right edge', () => {
    expect(popupShiftLeft(200, 420, 360)).toBe(-68)
  })

  it('leaves an inside popup untouched', () => {
    expect(popupShiftLeft(20, 340, 360)).toBe(0)
  })

  it('keeps the left edge readable when the popup is wider than the viewport', () => {
    expect(popupShiftLeft(-30, 400, 360)).toBe(38)
  })
})

describe('composerPopupMaxHeight', () => {
  it('keeps an upward-opening menu below the mobile top bar', () => {
    expect(composerPopupMaxHeight(316, 61, 10)).toBe(233)
  })

  it('keeps the design cap when sufficient room exists', () => {
    expect(composerPopupMaxHeight(700, 61)).toBe(320)
  })

  it('honours the model-menu design cap', () => {
    expect(composerPopupMaxHeight(700, 61, 0, 360)).toBe(360)
  })

  it('does not produce a negative menu height', () => {
    expect(composerPopupMaxHeight(60, 61)).toBe(0)
  })
})

/** Build the composer DOM the guard looks for and pin the measured geometry. */
function mountComposer(rect: { left: number; right: number; bottom: number }): { card: HTMLElement; listbox: HTMLElement } {
  document.body.innerHTML = `
    <div data-dsh-mobile-topbar=""><button>menu</button></div>
    <div data-composer-card="">
      <div class="surface"><div role="listbox"><div>items</div></div></div>
    </div>`
  const card = document.querySelector<HTMLElement>('.surface')!
  card.getBoundingClientRect = () => ({ ...rect, top: 0, width: rect.right - rect.left, height: 0, x: rect.left, y: 0, toJSON: () => ({}) })
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 360 })
  return { card, listbox: card.querySelector<HTMLElement>('[role="listbox"]')! }
}

/** Let the guard's queued animation frame run. */
function flush(): Promise<void> {
  return new Promise(resolve => { setTimeout(resolve, 30) })
}

describe('ComposerPopupGuard', () => {
  let guard: ComposerPopupGuard | null = null

  afterEach(() => {
    guard?.detach()
    guard = null
    document.body.innerHTML = ''
  })

  it('caps the surface and its scroll container, and shifts the surface inside', async () => {
    const { card, listbox } = mountComposer({ left: -84, right: 256, bottom: 668 })
    guard = new ComposerPopupGuard()
    guard.attach()
    await flush()

    expect(card.style.getPropertyValue('--dsh-mobile-popup-max-width')).toBe('331px')
    expect(card.style.getPropertyValue('--dsh-mobile-popup-shift')).toBe('92px')
    expect(card.hasAttribute('data-dsh-popup')).toBe(true)
    expect(listbox.style.getPropertyValue('--dsh-mobile-popup-max-width')).toBe('331px')
    expect(listbox.style.getPropertyValue('--dsh-mobile-menu-max-height')).not.toBe('')
  })

  it('re-measures an already shifted surface without drifting', async () => {
    const { card } = mountComposer({ left: 20, right: 340, bottom: 668 })
    guard = new ComposerPopupGuard()
    guard.attach()
    await flush()

    expect(card.style.getPropertyValue('--dsh-mobile-popup-shift')).toBe('')
  })

  it('removes every correction on detach', async () => {
    const { card, listbox } = mountComposer({ left: -84, right: 256, bottom: 668 })
    guard = new ComposerPopupGuard()
    guard.attach()
    await flush()

    guard.detach()
    guard = null
    expect(card.style.getPropertyValue('--dsh-mobile-popup-max-width')).toBe('')
    expect(card.style.getPropertyValue('--dsh-mobile-popup-shift')).toBe('')
    expect(card.hasAttribute('data-dsh-popup')).toBe(false)
    expect(listbox.style.getPropertyValue('--dsh-mobile-menu-max-height')).toBe('')
  })

  it('does nothing without a composer card', async () => {
    document.body.innerHTML = '<div data-dsh-mobile-topbar=""></div>'
    guard = new ComposerPopupGuard()
    guard.attach()
    await flush()
    expect(document.body.querySelector('[data-dsh-popup]')).toBeNull()
  })
})
