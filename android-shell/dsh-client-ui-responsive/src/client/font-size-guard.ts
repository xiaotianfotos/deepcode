/** Hardware keyboard shortcuts change the durable content font setting. */
interface FontTheme {
  getTheme(): { fontSize: number }
  setFontSize(px: number): void
}

export class FontSizeGuard {
  constructor(private readonly theme: FontTheme) {}

  private change(delta: number): void {
    this.theme.setFontSize(delta ? Math.min(17, Math.max(12, this.theme.getTheme().fontSize + delta)) : 14)
  }

  // Android WebView can consume hardware zoom keys before any DOM key event.
  private readonly onNativeShortcut = (event: Event): void => {
    const action = (event as CustomEvent).detail
    if (action === 'increase' || action === 'decrease' || action === 'reset') this.change(action === 'increase' ? 1 : action === 'decrease' ? -1 : 0)
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!event.ctrlKey || event.altKey || event.metaKey || event.isComposing || event.keyCode === 229) return
    const key = event.key
    const delta = key === '+' || key === '=' || event.code === 'NumpadAdd' ? 1
      : key === '-' || event.code === 'NumpadSubtract' ? -1 : 0
    if (!delta && key !== '0') return
    event.preventDefault()
    event.stopPropagation()
    // Match the authoritative ThemeRuntime's supported 12–17 px range.
    this.change(delta)
  }

  attach(): void {
    document.addEventListener('keydown', this.onKeyDown, true)
    window.addEventListener('dsh-content-font-shortcut', this.onNativeShortcut)
  }
  detach(): void {
    document.removeEventListener('keydown', this.onKeyDown, true)
    window.removeEventListener('dsh-content-font-shortcut', this.onNativeShortcut)
  }
}
