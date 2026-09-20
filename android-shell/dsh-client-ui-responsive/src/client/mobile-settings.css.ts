/** Fullscreen settings in the Android drawer: left categories, right content.
 * Fold's workbench also uses this drawer at desktop widths, so never infer
 * horizontal tabs from the drawer ancestor. Each column scrolls independently.
 */
export const MOBILE_SETTINGS_CSS: string = `
  html[data-dsh-mobile-form] [data-dsh-settings-dialog] {
    width: 100vw;
    max-width: none;
    height: 100vh;
    height: 100dvh;
    max-height: none;
    border-radius: 0;
    flex-direction: row;
  }

  html[data-dsh-mobile-form] [data-dsh-settings-dialog] > nav {
    width: clamp(124px, 23vw, 188px);
    min-height: 0;
    height: 100%;
    flex: none;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding: 18px 8px 12px;
    overflow: hidden;
    border-right: 1px solid var(--dsw-alias-border-l1);
    border-bottom: none;
  }

  html[data-dsh-mobile-form] [data-dsh-settings-dialog] > nav > div:first-child {
    flex: none;
    padding: 0 8px;
    white-space: nowrap;
  }

  html[data-dsh-mobile-form] [data-dsh-settings-dialog] > nav > div:nth-child(2) {
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-height: 0;
    min-width: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
  }

  html[data-dsh-mobile-form] [data-dsh-settings-dialog] > nav > div:nth-child(2) > button {
    flex: none;
    min-height: 40px;
    padding-left: 8px;
    padding-right: 8px;
  }

  html[data-dsh-mobile-form] [data-dsh-settings-dialog] > div:nth-child(2) {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  /* Keep the close control reachable while settings content scrolls. */
  html[data-dsh-mobile-form] [data-dsh-settings-dialog] > div:nth-child(2) > div:first-child {
    flex-shrink: 0;
    min-height: 52px;
    padding: 4px 8px;
  }
  html[data-dsh-mobile-form] [data-dsh-settings-dialog] > div:nth-child(2) > div:first-child > button {
    min-width: 44px;
    min-height: 44px;
  }
`
