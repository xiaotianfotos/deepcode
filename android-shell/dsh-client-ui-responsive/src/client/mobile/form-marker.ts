/**
 * Mobile-form marker: the single source of truth behind every narrow-screen
 * rule this plugin injects.
 *
 * Two DOM facts are published here:
 * - `data-dsh-mobile-form` on `<html>` mirrors the `(max-width: 767px)` media
 *   query, so stylesheets re-anchored from the retired fork's `[data-mobile]`
 *   attribute keep one gate that matches the frame's own breakpoint choices
 *   (upstream's right panel turns fullscreen below 768px of frame width).
 * - `data-dsh-frame` tags the upstream frame root. The frame carries no stable
 *   hook of its own; its right column does (`data-rightbar-col`), so the tag is
 *   written from there and re-applied whenever the frame remounts.
 * - `data-dsh-modal-open` on `<html>` and `data-dsh-settings-dialog` on the
 *   settings panel. The settings overlay renders inside the sidebar subtree, so
 *   a translated (off-canvas) ancestor would carry it off-screen; the settings
 *   panel itself has no attribute to key a stylesheet on, only its nav/content
 *   structure.
 */

/** Width at or below which the phone form applies; matches upstream's 768px fullscreen threshold. */
export const MOBILE_FORM_MAX_WIDTH = 767

/** The media query the marker mirrors. */
const MOBILE_FORM_QUERY = `(max-width: ${MOBILE_FORM_MAX_WIDTH}px)`

/** Frame tag consumed by this plugin's narrow-form stylesheet. */
const FRAME_TAG = 'data-dsh-frame'

/** Settings-panel tag consumed by the mobile settings stylesheet. */
const SETTINGS_TAG = 'data-dsh-settings-dialog'

/** Marks the phone form on `<html>` and tags the upstream frame root. */
export class MobileFormMarker {
  private media: MediaQueryList | null = null
  private observer: MutationObserver | null = null
  private frame: HTMLElement | null = null
  private modal: HTMLElement | null = null

  /** Publish both facts and keep them current. */
  attach(): void {
    this.media = typeof window.matchMedia === 'function' ? window.matchMedia(MOBILE_FORM_QUERY) : null
    this.media?.addEventListener?.('change', this.syncForm)
    this.syncForm()
    this.observer = new MutationObserver(this.syncDom)
    this.observer.observe(document.documentElement, { childList: true, subtree: true })
    this.syncDom()
  }

  /** Remove listeners, the observer, and both marks. */
  detach(): void {
    this.media?.removeEventListener?.('change', this.syncForm)
    this.media = null
    this.observer?.disconnect()
    this.observer = null
    this.frame?.removeAttribute(FRAME_TAG)
    this.frame = null
    this.modal?.removeAttribute(SETTINGS_TAG)
    this.modal = null
    document.documentElement.removeAttribute('data-dsh-mobile-form')
    document.documentElement.removeAttribute('data-dsh-modal-open')
  }

  private readonly syncDom = (): void => {
    this.syncFrame()
    this.syncModal()
  }

  /**
   * Publish "a modal is up" and tag the settings panel.
   *
   * Dialogs inside the frame's own overlay layer (this plugin's export-result
   * dialog) are not modals over the sidebar and never pin the drawer.
   */
  private syncModal(): void {
    const dialogs = [...document.querySelectorAll<HTMLElement>("[role='dialog'][aria-modal='true']")]
      .filter(dialog => dialog.closest('[data-shell-overlay]') === null)
    const settings = dialogs.find(dialog => dialog.querySelector(':scope > nav') !== null) ?? null
    if (settings !== this.modal) {
      this.modal?.removeAttribute(SETTINGS_TAG)
      this.modal = settings
      settings?.setAttribute(SETTINGS_TAG, '')
    }
    document.documentElement.toggleAttribute('data-dsh-modal-open', dialogs.length > 0)
  }

  private readonly syncForm = (): void => {
    const matches = this.media === null ? window.innerWidth <= MOBILE_FORM_MAX_WIDTH : this.media.matches
    document.documentElement.toggleAttribute('data-dsh-mobile-form', matches)
  }

  private readonly syncFrame = (): void => {
    const frame = document.querySelector<HTMLElement>('[data-rightbar-col]')?.parentElement ?? null
    if (frame === this.frame) return
    this.frame?.removeAttribute(FRAME_TAG)
    this.frame = frame
    frame?.setAttribute(FRAME_TAG, '')
  }
}
