/** Touch browsers can retain hover/focus after a tap. Hide hover-only help
 * while using touch, without cancelling clicks, focus, or accessible labels.
 * Pointer events distinguish a real mouse from touch's compatibility mouse
 * events, so a connected mouse can still use desktop tooltips. */
export class TouchTooltipGuard {
  private readonly style = document.createElement('style')
  private readonly onPointer = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') this.setTouch(true)
    else if (event.pointerType === 'mouse') this.setTouch(false)
  }
  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Tab') this.setTouch(false)
  }

  attach(): void {
    this.style.dataset.plugin = 'touch-tooltip-guard'
    this.style.textContent = 'body[data-dsh-touch-input] [role="tooltip"] { display: none !important; }'
    document.head.append(this.style)
    this.setTouch(matchMedia('(hover: none)').matches)
    document.addEventListener('pointerdown', this.onPointer, true)
    document.addEventListener('pointermove', this.onPointer, true)
    document.addEventListener('keydown', this.onKey, true)
  }

  detach(): void {
    document.removeEventListener('pointerdown', this.onPointer, true)
    document.removeEventListener('pointermove', this.onPointer, true)
    document.removeEventListener('keydown', this.onKey, true)
    document.body.removeAttribute('data-dsh-touch-input')
    this.style.remove()
  }

  private setTouch(touch: boolean): void {
    if (document.body.hasAttribute('data-dsh-touch-input') !== touch) {
      document.body.toggleAttribute('data-dsh-touch-input', touch)
    }
  }
}
