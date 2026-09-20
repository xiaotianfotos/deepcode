/**
 * Mobile chrome: the phone form's top bar and its drawer mask.
 *
 * Registered into the frame's `shell.overlay` seat. It owns exactly one
 * control — the sidebar toggle — which is why it exists at all: on a phone the
 * upstream collapsed rail sits off-canvas (mobile-form.css), so the drawer
 * needs one reachable entry, and the composer row stays free of another icon.
 *
 * The open state is mirrored from the frame's own `data-sidebar-collapsed`
 * attribute rather than owned here: the rail keeps its own toggle, and the
 * marker may also flip the attribute through rotation. Reading it keeps the
 * mask and `aria-expanded` honest without a second source of truth.
 */
import { useEffect, useState } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './MobileChrome.module.css'

/** Copy (the Android layer's product strings are Chinese; see DevSection/ExportResultDialog). */
const TOGGLE_OPEN = '打开导航'
const TOGGLE_CLOSE = '关闭导航'

/** The apply-world callbacks this entry may use. */
export interface MobileChromeInjected {
  /** Toggle the frame's left sidebar (upstream `ctx.layout.toggleSidebar`). */
  toggleSidebar(): void
}

/** Full props: the overlay runtime share (session list included) plus the injected toggle. */
export type MobileChromeProps =
  & PropsRuntime<'shell.overlay'>
  & InjectFace<MobileChromeInjected>

/** The frame root, tagged by the form marker; the right column identifies it before the tag lands. */
function frameElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-dsh-frame]')
    ?? document.querySelector<HTMLElement>('[data-rightbar-col]')?.parentElement
    ?? null
}

/**
 * Mirror whether the left sidebar is expanded.
 * @returns true while the frame renders the sidebar opened.
 */
function useSidebarOpen(): boolean {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let frame: HTMLElement | null = null
    let frameObserver: MutationObserver | null = null
    const sync = (): void => { setOpen(frame !== null && !frame.hasAttribute('data-sidebar-collapsed')) }
    const bind = (): boolean => {
      frame = frameElement()
      if (frame === null) return false
      frameObserver = new MutationObserver(sync)
      frameObserver.observe(frame, { attributes: true, attributeFilter: ['data-sidebar-collapsed'] })
      sync()
      return true
    }
    if (bind()) return () => { frameObserver?.disconnect() }
    // The frame can mount after this entry (plugin order): wait for it.
    const waitObserver = new MutationObserver(() => { if (bind()) waitObserver.disconnect() })
    waitObserver.observe(document.documentElement, { childList: true, subtree: true })
    return () => {
      waitObserver.disconnect()
      frameObserver?.disconnect()
    }
  }, [])
  return open
}

/**
 * The phone form's top bar with the sidebar toggle, plus the drawer mask.
 * @param props - runtime share (unused) and the injected toggle.
 * @returns the chrome, or the hidden shell when the phone form is off.
 */
export function MobileChrome({ toggleSidebar }: MobileChromeProps) {
  const open = useSidebarOpen()
  return (
    <div className={css.root}>
      <div
        className={css.mask}
        data-open={open || undefined}
        data-dsh-mobile-mask=""
        onClick={() => { toggleSidebar() }}
      />
      <div className={css.bar} data-dsh-mobile-topbar="">
        <button
          type="button"
          className={css.toggle}
          aria-label={open ? TOGGLE_CLOSE : TOGGLE_OPEN}
          aria-expanded={open}
          onClick={() => { toggleSidebar() }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
