/** App chrome should behave like controls, while messages and editors retain
 * native touch/mouse selection and copy/paste. Do not swallow touch gestures
 * or stop contextmenu propagation: plugins may provide their own menus. */
const readable = '[data-chat-flow], [data-dsh-selectable]'
const editors = 'input, textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'
const controls = 'button, [role="button"], [role="tab"], [role="menuitem"], [data-disclosure-row], select'
const scope = 'body[data-dsh-native-interaction]'

export class NativeInteractionGuard {
  private style: HTMLStyleElement | undefined
  private readonly onDefault = (event: Event): void => {
    const target = event.composedPath().find(node => node instanceof Element)
      ?? (event.target instanceof Node ? event.target.parentElement : null)
    if (!(target instanceof Element)) return
    if (target.closest(editors)) return
    if (!target.closest(controls) && target.closest(readable) && !target.closest('img, video, svg')) return
    event.preventDefault()
  }

  attach(): void {
    this.detach()
    if (!(window as unknown as { androidBridge?: unknown }).androidBridge) return
    this.style = document.createElement('style')
    this.style.dataset.plugin = 'native-interaction-guard'
    this.style.textContent = `
      ${scope}, ${scope} * {
        -webkit-user-select: none !important; user-select: none !important;
        -webkit-touch-callout: none;
      }
      ${scope} :is(${readable}, ${editors}), ${scope} :is(${readable}, ${editors}) * {
        -webkit-user-select: text !important; user-select: text !important;
        -webkit-touch-callout: default;
      }
      ${scope} :is(${controls}), ${scope} :is(${controls}) * {
        -webkit-user-select: none !important; user-select: none !important;
        -webkit-touch-callout: none;
      }
    `
    document.head.append(this.style)
    document.body.setAttribute('data-dsh-native-interaction', '')
    document.addEventListener('contextmenu', this.onDefault, true)
    document.addEventListener('selectstart', this.onDefault, true)
  }

  detach(): void {
    document.removeEventListener('contextmenu', this.onDefault, true)
    document.removeEventListener('selectstart', this.onDefault, true)
    if (this.style) document.body.removeAttribute('data-dsh-native-interaction')
    this.style?.remove()
    this.style = undefined
  }
}
