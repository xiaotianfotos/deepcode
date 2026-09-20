export const css=`
.dsh-deck-pins{padding:8px 10px 12px;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff18)}
.dsh-deck-open{font-weight:600;background:none;border:0;color:inherit;padding:8px 2px;cursor:pointer}
.dsh-deck-pins-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:6px}.dsh-deck-pins label{display:flex;align-items:center;gap:6px}
.dsh-deck-pins select,.dsh-deck-empty select{min-width:0;width:100%;background:var(--dsw-specific-input-major,#27272a);color:inherit;border:1px solid var(--dsw-alias-border-l2,#ffffff18);border-radius:7px;padding:7px 4px}
[data-conversation-scroll]:has(> [data-slot="conversation.session"] .dsh-deck){overflow:hidden!important}
[data-slot="conversation.session"]:has(.dsh-deck)>div{flex:1 1 0!important;min-height:0!important;height:100%}
.dsh-deck{height:100%;min-height:0;display:flex;flex-direction:column;gap:10px;padding:8px 12px max(8px,var(--dsh-android-system-bottom,0px));box-sizing:border-box;color:var(--dsw-alias-label-primary,#e4e4e7);container-type:inline-size}
.dsh-deck-lane>header button{background:transparent;color:inherit;border:1px solid var(--dsw-alias-border-l2,#ffffff20);border-radius:7px;padding:5px 9px;cursor:pointer}
.dsh-deck-grid{display:grid;grid-template-columns:repeat(4,calc((100% - 12px)/2));grid-template-rows:minmax(0,1fr);flex:1;min-height:0;gap:12px;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;overscroll-behavior-x:contain;scrollbar-width:none}
.dsh-deck-grid::-webkit-scrollbar{display:none;width:0;height:0}
.dsh-deck-lane,.dsh-deck-empty{scroll-snap-align:start;min-width:0;min-height:0;border:1px solid var(--dsw-alias-border-l2,#ffffff20);border-radius:12px;overflow:hidden;background:var(--dsw-alias-bg-base,#202022)}
.dsh-deck-lane{display:flex;flex-direction:column;--dsh-composer-side-clearance:12px;--dsh-composer-card-max-width:100%;--dsh-composer-text-max-height:120px;container-type:inline-size}
.dsh-deck-lane[data-active=true]{border-color:#72b2d8;box-shadow:0 0 0 1px #72b2d820}.dsh-deck-lane>header{height:38px;padding:0 8px;display:flex;align-items:center;gap:7px;flex:none;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff12);font-size:12px}
@media(orientation:portrait){.dsh-deck-lane[data-active=true]{border-color:var(--dsw-alias-border-l2,#ffffff20);box-shadow:none}}
.dsh-deck-lane>header strong{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.dsh-deck-number{opacity:.6}.dsh-deck-lane[data-active=true] .dsh-deck-number{color:#93c5fd;opacity:1}.dsh-deck-running{font-size:10px;color:#86bc9b}
.dsh-deck-lane>header button{padding:1px 6px;border:0;font-size:18px}.dsh-deck-chat{flex:1;min-height:0;overflow:auto;overscroll-behavior-y:contain;position:relative;--dsh-composer-height:0px}
.dsh-deck-chat [data-slot="conversation.view"]>div{min-height:100%;max-width:100%;box-sizing:border-box}
.dsh-deck-chat{touch-action:pan-y pinch-zoom}
.dsh-deck-composer{flex:none;max-height:55%;min-height:0;overflow:visible;position:relative;z-index:1;padding-top:8px}
/* The official editor already scrolls its text. Scrolling this outer wrapper
 * clips its upward-opening slash/file overlay, making suggestions unreachable. */
.dsh-deck-composer [role=listbox]{max-height:min(320px,var(--dsh-deck-menu-height,320px))!important;max-width:100%;box-sizing:border-box}
@container(max-width:680px){
.dsh-deck-grid{grid-template-columns:repeat(4,100%)}
}
@container(max-width:560px){
.dsh-deck-composer [aria-label*="选择模型"]{max-width:130px}.dsh-deck-composer [aria-label*="选择模型"] span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-deck-composer [aria-label*="访问模式"]{max-width:116px}.dsh-deck-composer [aria-label*="访问模式"] span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
}
.dsh-deck-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;border-style:dashed;opacity:.6}.dsh-deck-empty>span{font-size:24px;opacity:.4}.dsh-deck-empty p{font-size:12px}
.dsh-deck>footer{flex:none;min-height:18px;font-size:11px;opacity:.7;text-align:center}

`
