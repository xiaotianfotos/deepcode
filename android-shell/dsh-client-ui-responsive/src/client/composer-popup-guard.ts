/**
 * Composer popup geometry guard (issues apk#135).
 *
 * Two popups anchor to the composer card: the slash-command menu
 * (`[role='listbox']` inside a surface card) and the model menu
 * (`[role='menu']`, which is its own surface). Both are sized and positioned
 * against their trigger rather than the viewport, so on phones they can
 *   (a) grow past the left viewport edge — long model ids lose their prefix
 *       ("deepseek-v4-…" renders as "eek-v4-…"),
 *   (b) keep a surface card wider than its content once a width cap applies to
 *       the inner scroll container only, leaving a blank strip and a scrollbar
 *       floating away from the card edge, and
 *   (c) rise above the mobile top bar and hide their first rows.
 * The guard measures each open popup and writes the corrections as a width cap,
 * a horizontal shift and a height cap. Measuring rather than matching upstream
 * class names keeps the fix alive across upstream CSS-module renames.
 */

/** Design cap on the slash-command menu height (figma SLASH 39:26572 MenuDropdown). */
const LISTBOX_HEIGHT_CAP = 320
/** Design cap on the model menu height (upstream ModelSelect .menu). */
const MENU_HEIGHT_CAP = 360
/** Space kept between a popup and the mobile top bar. */
const TOPBAR_CLEARANCE = 12
/** Design cap on a popup's width. */
const POPUP_WIDTH_CAP = 340
/** Fraction of the viewport width a popup may occupy (mirrors the shell's injected cap). */
const POPUP_VIEWPORT_FRACTION = 0.92

/** Gap kept between a popup and each horizontal viewport edge. */
export const POPUP_EDGE_GAP = 8

/**
 * Width cap for a composer popup: the design cap, never more than the fraction
 * of the viewport the shell's injected stylesheet allows.
 * @param viewportWidth - layout viewport width in CSS pixels.
 * @returns the cap in whole CSS pixels.
 */
export function popupMaxWidth(viewportWidth: number): number {
  return Math.max(0, Math.floor(Math.min(POPUP_WIDTH_CAP, viewportWidth * POPUP_VIEWPORT_FRACTION)))
}

/**
 * Horizontal shift that brings a popup back inside the viewport.
 * The right edge wins when the popup is wider than the viewport, so the
 * reading order (labels at the left) stays visible.
 * @param left - untransformed left edge.
 * @param right - untransformed right edge.
 * @param viewportWidth - layout viewport width in CSS pixels.
 * @param gap - minimum clearance to each edge.
 * @returns the shift in whole CSS pixels (0 when already inside).
 */
export function popupShiftLeft(left: number, right: number, viewportWidth: number, gap: number = POPUP_EDGE_GAP): number {
  if (right - left > viewportWidth - gap * 2) return Math.round(gap - left)
  if (right > viewportWidth - gap) return Math.round(viewportWidth - gap - right)
  if (left < gap) return Math.round(gap - left)
  return 0
}

/**
 * Usable height for an upward-opening popup.
 * The popup bottom is anchored to the composer, while the mobile top bar
 * occupies part of the viewport above it.
 * @param popupBottom - popup bottom edge.
 * @param topbarBottom - mobile top bar bottom edge.
 * @param chromeHeight - popup padding/border excluded from a content-box cap.
 * @param cap - design height cap for this popup kind.
 * @returns the height cap in whole CSS pixels.
 */
export function composerPopupMaxHeight(popupBottom: number, topbarBottom: number, chromeHeight = 0, cap = LISTBOX_HEIGHT_CAP): number {
  return Math.max(0, Math.min(cap, Math.floor(popupBottom - topbarBottom - TOPBAR_CLEARANCE - chromeHeight)))
}

/** The painted surface of a popup: the role element itself, or its card parent. */
function surfaceOf(popup: HTMLElement): HTMLElement {
  return popup.getAttribute('role') === 'menu' ? popup : popup.parentElement ?? popup
}

/** Height excluded from a content-box max-height (padding + border). */
function chromeHeight(element: HTMLElement): number {
  const style = getComputedStyle(element)
  if (style.boxSizing === 'border-box') return 0
  return ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
    .map(property => Number.parseFloat(style[property as keyof CSSStyleDeclaration] as string) || 0)
    .reduce((total, value) => total + value, 0)
}

/** Current inline horizontal shift of a surface. */
function readShift(surface: HTMLElement): number {
  return Number.parseFloat(surface.style.getPropertyValue('--dsh-mobile-popup-shift')) || 0
}

/**
 * Keeps every open composer popup inside the viewport: width cap on the surface
 * and its scroll container, horizontal shift on the surface, height cap on the
 * scrolling element.
 */
export class ComposerPopupGuard {
  private readonly onViewportChange = (): void => { this.queue() }
  private readonly mutationObserver = new MutationObserver((records) => {
    if (records.some(record => this.isRelevantMutation(record))) this.queue()
  })
  private readonly resizeObserver = new ResizeObserver(() => { this.queue() })
  private frame: number | null = null
  private observed: Element[] = []
  private styled = new Set<HTMLElement>()

  /** Start observing composer popup geometry. */
  attach(): void {
    this.mutationObserver.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', this.onViewportChange)
    window.addEventListener('scroll', this.onViewportChange, true)
    window.visualViewport?.addEventListener('resize', this.onViewportChange)
    this.queue()
  }

  /** Stop observing and remove every geometric correction. */
  detach(): void {
    this.mutationObserver.disconnect()
    this.resizeObserver.disconnect()
    window.removeEventListener('resize', this.onViewportChange)
    window.removeEventListener('scroll', this.onViewportChange, true)
    window.visualViewport?.removeEventListener('resize', this.onViewportChange)
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
    this.clear()
    this.observed = []
  }

  private queue(): void {
    if (this.frame !== null) return
    this.frame = requestAnimationFrame(() => {
      this.frame = null
      this.apply()
    })
  }

  private apply(): void {
    const card = document.querySelector<HTMLElement>('[data-composer-card]')
    const topbar = document.querySelector<HTMLElement>('[data-dsh-mobile-topbar]')
    if (card === null) {
      this.clear()
      return
    }
    const popups = Array.from(card.querySelectorAll<HTMLElement>("[role='menu'], [role='listbox']"))
    if (popups.length === 0) {
      this.clear()
      return
    }

    const viewportWidth = document.documentElement.clientWidth
    const widthCap = `${popupMaxWidth(viewportWidth)}px`
    const topbarBottom = topbar?.getBoundingClientRect().bottom ?? 0
    const styled = new Set<HTMLElement>()
    const measured: Element[] = topbar === null ? [] : [topbar, card]

    for (const popup of popups) {
      const surface = surfaceOf(popup)
      styled.add(surface)
      styled.add(popup)
      measured.push(surface, popup)

      for (const element of surface === popup ? [popup] : [popup, surface]) {
        if (element.style.getPropertyValue('--dsh-mobile-popup-max-width') !== widthCap) {
          element.style.setProperty('--dsh-mobile-popup-max-width', widthCap)
        }
      }

      const currentShift = readShift(surface)
      const rect = surface.getBoundingClientRect()
      const shift = popupShiftLeft(rect.left - currentShift, rect.right - currentShift, viewportWidth)
      if (shift !== currentShift) {
        surface.style.setProperty('--dsh-mobile-popup-shift', `${shift}px`)
      }
      surface.setAttribute('data-dsh-popup', '')

      const heightCap = `${composerPopupMaxHeight(
        rect.bottom,
        topbarBottom,
        chromeHeight(popup),
        popup.getAttribute('role') === 'menu' ? MENU_HEIGHT_CAP : LISTBOX_HEIGHT_CAP,
      )}px`
      if (popup.style.getPropertyValue('--dsh-mobile-menu-max-height') !== heightCap) {
        popup.style.setProperty('--dsh-mobile-menu-max-height', heightCap)
      }
    }

    for (const element of this.styled) {
      if (!styled.has(element)) this.clearElement(element)
    }
    this.styled = styled
    this.syncObserved(measured)
  }

  /** Drop every correction and forget the touched elements. */
  private clear(): void {
    for (const element of this.styled) this.clearElement(element)
    this.styled = new Set()
    this.syncObserved([])
  }

  private clearElement(element: HTMLElement): void {
    element.style.removeProperty('--dsh-mobile-popup-max-width')
    element.style.removeProperty('--dsh-mobile-popup-shift')
    element.style.removeProperty('--dsh-mobile-menu-max-height')
    element.removeAttribute('data-dsh-popup')
  }

  private syncObserved(next: Element[]): void {
    if (next.length === this.observed.length && next.every((element, index) => element === this.observed[index])) return
    this.resizeObserver.disconnect()
    for (const element of next) this.resizeObserver.observe(element)
    this.observed = next
  }

  private isRelevantMutation(record: MutationRecord): boolean {
    if (record.target instanceof Element && record.target.closest('[data-composer-card]') !== null) return true
    return [...record.addedNodes, ...record.removedNodes].some(node => {
      if (!(node instanceof Element)) return false
      return node.matches('[data-composer-card], [role="listbox"], [role="menu"]') ||
        node.querySelector('[data-composer-card], [role="listbox"], [role="menu"]') !== null
    })
  }
}
