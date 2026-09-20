// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NativeInteractionGuard } from '../src/client/native-interaction-guard.ts'

let guard: NativeInteractionGuard
beforeEach(() => {
  vi.stubGlobal('androidBridge', {})
  document.body.innerHTML = '<header><span id="title">Title</span></header><div data-chat-flow><p id="message">Message</p><pre id="code">Code</pre><button><span id="copy">Copy</span></button></div><div contenteditable="true"><p id="draft">Draft</p></div><input id="input"><textarea id="area"></textarea>'
  guard = new NativeInteractionGuard()
  guard.attach()
})
afterEach(() => { guard.detach(); document.body.innerHTML = ''; vi.unstubAllGlobals() })
function dispatch(id: string, type: string) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  document.getElementById(id)!.dispatchEvent(event)
  return event
}
it('blocks chrome defaults while allowing plugin menus to receive the event', () => {
  const menu = vi.fn()
  document.getElementById('title')!.addEventListener('contextmenu', menu)
  expect(dispatch('title', 'contextmenu').defaultPrevented).toBe(true)
  expect(menu).toHaveBeenCalledOnce()
  expect(dispatch('title', 'selectstart').defaultPrevented).toBe(true)
  expect(dispatch('copy', 'contextmenu').defaultPrevented).toBe(true)
})
it('preserves touch and mouse selection/copy menus in messages, code and editors', () => {
  for (const id of ['message', 'code', 'draft', 'input', 'area'])
    for (const type of ['selectstart', 'contextmenu']) expect(dispatch(id, type).defaultPrevented).toBe(false)
})
it('leaves clicks, scrolling and drag events untouched', () => {
  for (const type of ['click', 'touchstart', 'pointerdown', 'dragstart'])
    expect(dispatch('title', type).defaultPrevented).toBe(false)
})
it('cleans up and stays inactive in a regular browser', () => {
  guard.detach()
  expect(dispatch('title', 'contextmenu').defaultPrevented).toBe(false)
  expect(document.querySelector('[data-plugin="native-interaction-guard"]')).toBeNull()
  vi.stubGlobal('androidBridge', undefined)
  guard.attach()
  expect(document.body.hasAttribute('data-dsh-native-interaction')).toBe(false)
  expect(dispatch('title', 'selectstart').defaultPrevented).toBe(false)
})
