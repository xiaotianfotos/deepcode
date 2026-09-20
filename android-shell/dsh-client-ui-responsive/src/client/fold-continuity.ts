/** Fold crop metadata over the upstream frame; never replaces or remounts its children. */
export class FoldContinuity {
  private observer: MutationObserver | undefined
  private previous: unknown
  private readonly inset = (width: number): number => {
    if (document.documentElement.hasAttribute('data-dsh-fold-workbench')) return width / 2
    if (document.documentElement.hasAttribute('data-dsh-mobile-form')) return 0
    return document.querySelector<HTMLElement>('[data-dsh-frame] > [class*="sidebarCol"]')?.getBoundingClientRect().width ?? 0
  }
  private readonly sync = (): void => {
    let supported = false
    try { supported = JSON.parse((window as any).androidBridge?.foldStatus?.() ?? '{}').dual?.supported === true } catch {}
    const enabled = supported && document.querySelector('[data-deck-lane]') !== null
    document.documentElement.toggleAttribute('data-dsh-fold-workbench', enabled)
  }
  attach(): void {
    this.previous = (window as any).__dshNavigationInset
    ;(window as any).__dshNavigationInset = this.inset
    this.observer = new MutationObserver(this.sync)
    this.observer.observe(document.documentElement, {subtree:true, childList:true})
    window.addEventListener('dsh-physical-viewport', this.sync)
    this.sync()
  }
  detach(): void {
    this.observer?.disconnect()
    window.removeEventListener('dsh-physical-viewport', this.sync)
    document.documentElement.removeAttribute('data-dsh-fold-workbench')
    if ((window as any).__dshNavigationInset === this.inset) (window as any).__dshNavigationInset = this.previous
  }
}
