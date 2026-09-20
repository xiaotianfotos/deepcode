/**
 * Mobile settings-panel adaptation (issue #1; 2026-09-03 rework, 2026-09-10 de-fork).
 * Upstream SettingsRoot draws a fixed overlay with an 800px two-column panel
 * (nav + options). On the phone form it must reflow to a single column and fill
 * the viewport (user requirement: 设置页全屏显示).
 *
 * The panel renders inside the sidebar subtree, whose CSS-Module class names are
 * hashed and unreachable from here — and its own markup carries no stable
 * attribute. The mobile marker therefore tags the panel
 * (`data-dsh-settings-dialog`, written from its nav/content structure) and this
 * sheet keys on that tag plus the phone-form flag: pure attribute selectors,
 * effective on old kernels too (no `:has()`).
 */
export const MOBILE_SETTINGS_CSS: string = `
  html[data-dsh-mobile-form] [data-dsh-settings-dialog] {
    box-sizing: border-box;
    width: 100vw;
    max-width: none;
    /* The panel is centred by its fixed overlay, so shrinking the height would
       move its header back under the status bar. Keep the full height and inset
       the content instead: border-box keeps the total box at 100vh. */
    height: 100vh;
    max-height: none;
    padding-top: var(--dsh-mobile-top-inset, 0px);
    border-radius: 0;
    flex-direction: column;
  }

  html[data-dsh-mobile-form] [data-dsh-settings-dialog] > nav {
    width: 100%;
    height: auto;
    flex: none;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    overflow-x: auto;
    border-right: none;
    border-bottom: 1px solid var(--dsw-alias-border-l1);
  }

  html[data-dsh-mobile-form] [data-dsh-settings-dialog] > nav > div:first-child {
    flex: none;
    padding: 0;
    white-space: nowrap;
  }

  html[data-dsh-mobile-form] [data-dsh-settings-dialog] > nav > div:nth-child(2) {
    flex-direction: row;
    gap: 4px;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
  }

  html[data-dsh-mobile-form] [data-dsh-settings-dialog] > nav > div:nth-child(2) > button {
    /* Review 2026-08-18: the original rule was an unclosed empty block since #2 and never
       applied. Completed by container semantics: the nav button container is
       flex-direction: row + overflow-x: auto, so buttons need flex: none to avoid being
       compressed and to scroll horizontally with the container. */
    flex: none;
  }

  /* Content column: flex:1 but min-height:auto would hold the options scroll area's
     full content height and overflow the panel; allow it to shrink so the options
     area scrolls inside. */
  html[data-dsh-mobile-form] [data-dsh-settings-dialog] > div:nth-child(2) {
    min-height: 0;
  }
`
