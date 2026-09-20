// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { FoldContinuity } from '../src/client/fold-continuity.ts'
afterEach(() => { document.body.innerHTML = ''; document.documentElement.removeAttribute('data-dsh-mobile-form'); delete (window as any).androidBridge; vi.restoreAllMocks() })
it('physical cover hints preserve the upstream composer, selection and frame width', async () => {
  document.body.innerHTML = '<main data-dsh-frame><aside class="sidebarCol"></aside><textarea></textarea></main>'
  const editor = document.querySelector('textarea')!
  editor.value = 'draft🙂unchanged'; editor.focus(); editor.setSelectionRange(7,7)
  vi.spyOn(document.querySelector('aside')!, 'getBoundingClientRect').mockReturnValue({width:56} as DOMRect)
  const bridge = new FoldContinuity(); bridge.attach()
  try {
    for (const width of [424,390,859]) {
      window.dispatchEvent(new CustomEvent('dsh-physical-viewport', {detail:{width}}))
      expect(document.querySelector('textarea')).toBe(editor)
      expect(editor.value).toBe('draft🙂unchanged'); expect(editor.selectionStart).toBe(7)
      expect(document.activeElement).toBe(editor)
      expect((window as any).__dshNavigationInset(859)).toBe(56)
      expect(document.documentElement.hasAttribute('data-dsh-mobile-form')).toBe(false)
    }
  } finally { bridge.detach() }
})
it('fold workbench crops the right half; removing it restores the existing sidebar', async () => {
  (window as any).androidBridge = {foldStatus:()=>JSON.stringify({dual:{supported:true}})}
  document.body.innerHTML = '<main data-dsh-frame><aside class="sidebarCol"></aside><section data-deck-lane="one"><textarea></textarea></section></main>'
  vi.spyOn(document.querySelector('aside')!, 'getBoundingClientRect').mockReturnValue({width:56} as DOMRect)
  const previous = vi.fn(); (window as any).__dshNavigationInset = previous
  const bridge = new FoldContinuity(); bridge.attach()
  try {
    expect((window as any).__dshNavigationInset(859)).toBe(429.5)
    expect(document.documentElement.hasAttribute('data-dsh-fold-workbench')).toBe(true)
    document.querySelector('section')!.remove(); await Promise.resolve()
    expect((window as any).__dshNavigationInset(859)).toBe(56)
    document.documentElement.setAttribute('data-dsh-mobile-form','')
    expect((window as any).__dshNavigationInset(424)).toBe(0)
  } finally { bridge.detach() }
  expect((window as any).__dshNavigationInset).toBe(previous)
})
