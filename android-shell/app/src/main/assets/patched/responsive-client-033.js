window.__ModuleLoader__.load({
	id: "@dsh-android/dsh-client-ui-responsive",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/fold-continuity.ts
		/** Fold crop metadata over the upstream frame; never replaces or remounts its children. */
		var FoldContinuity = class {
			observer;
			previous;
			inset = (width) => {
				if (document.documentElement.hasAttribute("data-dsh-fold-workbench")) return width / 2;
				if (document.documentElement.hasAttribute("data-dsh-mobile-form")) return 0;
				return document.querySelector("[data-dsh-frame] > [class*=\"sidebarCol\"]")?.getBoundingClientRect().width ?? 0;
			};
			sync = () => {
				let supported = false;
				try {
					supported = JSON.parse(window.androidBridge?.foldStatus?.() ?? "{}").dual?.supported === true;
				} catch {}
				const enabled = supported && document.querySelector("[data-deck-lane]") !== null;
				document.documentElement.toggleAttribute("data-dsh-fold-workbench", enabled);
			};
			attach() {
				this.previous = window.__dshNavigationInset;
				window.__dshNavigationInset = this.inset;
				this.observer = new MutationObserver(this.sync);
				this.observer.observe(document.documentElement, {
					subtree: true,
					childList: true
				});
				window.addEventListener("dsh-physical-viewport", this.sync);
				this.sync();
			}
			detach() {
				this.observer?.disconnect();
				window.removeEventListener("dsh-physical-viewport", this.sync);
				document.documentElement.removeAttribute("data-dsh-fold-workbench");
				if (window.__dshNavigationInset === this.inset) window.__dshNavigationInset = this.previous;
			}
		};
		//#endregion
		//#region src/client/font-size-guard.ts
		var FontSizeGuard = class {
			theme;
			constructor(theme) {
				this.theme = theme;
			}
			change(delta) {
				this.theme.setFontSize(delta ? Math.min(17, Math.max(12, this.theme.getTheme().fontSize + delta)) : 14);
			}
			onNativeShortcut = (event) => {
				const action = event.detail;
				if (action === "increase" || action === "decrease" || action === "reset") this.change(action === "increase" ? 1 : action === "decrease" ? -1 : 0);
			};
			onKeyDown = (event) => {
				if (!event.ctrlKey || event.altKey || event.metaKey || event.isComposing || event.keyCode === 229) return;
				const key = event.key;
				const delta = key === "+" || key === "=" || event.code === "NumpadAdd" ? 1 : key === "-" || event.code === "NumpadSubtract" ? -1 : 0;
				if (!delta && key !== "0") return;
				event.preventDefault();
				event.stopPropagation();
				this.change(delta);
			};
			attach() {
				document.addEventListener("keydown", this.onKeyDown, true);
				window.addEventListener("dsh-content-font-shortcut", this.onNativeShortcut);
			}
			detach() {
				document.removeEventListener("keydown", this.onKeyDown, true);
				window.removeEventListener("dsh-content-font-shortcut", this.onNativeShortcut);
			}
		};
		//#endregion
		//#region src/client/touch-tooltip-guard.ts
		/** Touch browsers can retain hover/focus after a tap. Hide hover-only help
		* while using touch, without cancelling clicks, focus, or accessible labels.
		* Pointer events distinguish a real mouse from touch's compatibility mouse
		* events, so a connected mouse can still use desktop tooltips. */
		var TouchTooltipGuard = class {
			style = document.createElement("style");
			onPointer = (event) => {
				if (event.pointerType === "touch" || event.pointerType === "pen") this.setTouch(true);
				else if (event.pointerType === "mouse") this.setTouch(false);
			};
			onKey = (event) => {
				if (event.key === "Tab") this.setTouch(false);
			};
			attach() {
				this.style.dataset.plugin = "touch-tooltip-guard";
				this.style.textContent = "body[data-dsh-touch-input] [role=\"tooltip\"] { display: none !important; }";
				document.head.append(this.style);
				this.setTouch(matchMedia("(hover: none)").matches);
				document.addEventListener("pointerdown", this.onPointer, true);
				document.addEventListener("pointermove", this.onPointer, true);
				document.addEventListener("keydown", this.onKey, true);
			}
			detach() {
				document.removeEventListener("pointerdown", this.onPointer, true);
				document.removeEventListener("pointermove", this.onPointer, true);
				document.removeEventListener("keydown", this.onKey, true);
				document.body.removeAttribute("data-dsh-touch-input");
				this.style.remove();
			}
			setTouch(touch) {
				if (document.body.hasAttribute("data-dsh-touch-input") !== touch) document.body.toggleAttribute("data-dsh-touch-input", touch);
			}
		};
		//#endregion
		//#region src/client/native-interaction-guard.ts
		/** App chrome should behave like controls, while messages and editors retain
		* native touch/mouse selection and copy/paste. Do not swallow touch gestures
		* or stop contextmenu propagation: plugins may provide their own menus. */
		const readable = "[data-chat-flow], [data-dsh-selectable]";
		const editors = "input, textarea, [contenteditable=\"\"], [contenteditable=\"true\"], [contenteditable=\"plaintext-only\"]";
		const controls = "button, [role=\"button\"], [role=\"tab\"], [role=\"menuitem\"], [data-disclosure-row], select";
		const scope = "body[data-dsh-native-interaction]";
		var NativeInteractionGuard = class {
			style;
			onDefault = (event) => {
				const target = event.composedPath().find((node) => node instanceof Element) ?? (event.target instanceof Node ? event.target.parentElement : null);
				if (!(target instanceof Element)) return;
				if (target.closest(editors)) return;
				if (!target.closest(controls) && target.closest(readable) && !target.closest("img, video, svg")) return;
				event.preventDefault();
			};
			attach() {
				this.detach();
				if (!window.androidBridge) return;
				this.style = document.createElement("style");
				this.style.dataset.plugin = "native-interaction-guard";
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
    `;
				document.head.append(this.style);
				document.body.setAttribute("data-dsh-native-interaction", "");
				document.addEventListener("contextmenu", this.onDefault, true);
				document.addEventListener("selectstart", this.onDefault, true);
			}
			detach() {
				document.removeEventListener("contextmenu", this.onDefault, true);
				document.removeEventListener("selectstart", this.onDefault, true);
				if (this.style) document.body.removeAttribute("data-dsh-native-interaction");
				this.style?.remove();
				this.style = void 0;
			}
		};
		//#endregion
		//#region \0dsh-css:src/client/ExportResultDialog.module.css.mjs
		const css$3 = ".GVJvPa_backdrop{z-index:1;background:var(--dsw-alias-bg-mask-1,#0000003d);justify-content:center;align-items:center;padding:16px;display:flex;position:absolute;inset:0}.GVJvPa_dialog{box-sizing:border-box;background:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l2,#0000001a);width:min(440px,100%);max-height:70%;color:var(--dsw-alias-label-primary,#0f1115);border-radius:12px;flex-direction:column;gap:12px;padding:16px;display:flex;overflow:auto}.GVJvPa_title{margin:0;font-size:16px;font-weight:600}.GVJvPa_detail{overflow-wrap:anywhere;white-space:pre-wrap;margin:0;font-size:13px;line-height:1.5}.GVJvPa_detail[data-status=success]{color:var(--dsw-alias-state-success-primary)}.GVJvPa_detail[data-status=error]{color:var(--dsw-alias-state-error-primary)}.GVJvPa_actions{justify-content:flex-end;display:flex}.GVJvPa_button{border:1px solid var(--dsw-alias-border-l2,#0000001a);background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground,#fff);cursor:pointer;border-radius:8px;padding:8px 14px;font-size:13px}.GVJvPa_button:hover{background:var(--dsw-alias-button-primary-hover)}";
		const tagId$3 = "@dsh-android/dsh-client-ui-responsive/ExportResultDialog.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$3) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh-android/dsh-client-ui-responsive";
			tag.dataset.pluginCss = tagId$3;
			tag.textContent = css$3;
			document.head.appendChild(tag);
		}
		var ExportResultDialog_module_css_default = {
			"title": "GVJvPa_title",
			"actions": "GVJvPa_actions",
			"detail": "GVJvPa_detail",
			"button": "GVJvPa_button",
			"backdrop": "GVJvPa_backdrop",
			"dialog": "GVJvPa_dialog"
		};
		//#endregion
		//#region src/client/ExportResultDialog.tsx
		/**
		* Export-result dialog: the `shell.overlay` entry that renders the Android
		* shell's session-export outcome (and this plugin's own native-action
		* failures). Pure component: state arrives through the framework-bound
		* `useExportResult` hook, dismissal through the injected callback. The markup
		* reuses the web-ui dialog conventions (role=dialog / aria-modal) and the
		* shared design tokens, so the dialog matches the app's modal surfaces.
		*/
		/** The single entry component; renders nothing while no result is open. */
		function ExportResultDialog({ useExportResult, close }) {
			const state = useExportResult((snapshot) => snapshot);
			(0, react.useEffect)(() => {
				if (!state.open) return;
				const onKeyDown = (event) => {
					if (event.key === "Escape") close();
				};
				window.addEventListener("keydown", onKeyDown);
				return () => {
					window.removeEventListener("keydown", onKeyDown);
				};
			}, [state.open, close]);
			if (!state.open) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: ExportResultDialog_module_css_default.backdrop,
				onClick: () => close(),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					role: "dialog",
					"aria-modal": "true",
					"aria-labelledby": "dsh-export-result-title",
					className: ExportResultDialog_module_css_default.dialog,
					onClick: (event) => {
						event.stopPropagation();
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							id: "dsh-export-result-title",
							className: ExportResultDialog_module_css_default.title,
							children: state.title
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: ExportResultDialog_module_css_default.detail,
							"data-status": state.ok ? "success" : "error",
							children: state.detail
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: ExportResultDialog_module_css_default.actions,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: ExportResultDialog_module_css_default.button,
								onClick: () => close(),
								children: "关闭"
							})
						})
					]
				})
			});
		}
		//#endregion
		//#region src/client/mobile-settings.css.ts
		/** Fullscreen settings in the Android drawer: left categories, right content.
		* Fold's workbench also uses this drawer at desktop widths, so never infer
		* horizontal tabs from the drawer ancestor. Each column scrolls independently.
		*/
		const MOBILE_SETTINGS_CSS = `
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
`;
		//#endregion
		//#region src/client/composer-menu.css.ts
		/**
		* Composer popup geometry (upstream ui-input-trigger + ui-model-selection):
		* - The slash menu's scroll container (`.viewport`, the `[role='listbox']`) is a
		*   flex child without flex:1, so when the candidate list exceeds max-height the
		*   viewport grows past the menu and is clipped by the menu's overflow:hidden —
		*   the scrollbar lands outside the visible area and the list appears
		*   unscrollable. Fix: let the viewport fill the menu and scroll inside it.
		* - The upstream menus clamp against viewport y=0 only, and size themselves
		*   against their trigger, so on phones they can leave the viewport sideways or
		*   rise above the fixed top bar. `ComposerPopupGuard` measures each open popup
		*   and writes the caps below; the width cap is applied to the scroll container
		*   and to the painted card alike so the card never stays wider than its
		*   content (a blank strip with a detached scrollbar — issue apk#135).
		*/
		const COMPOSER_MENU_CSS = `
[data-composer-card] [role='listbox'] > div {
  flex: 1 1 0%;
  min-height: 0;
}

/* 宽度钳制只作用在绘制卡片上（[data-dsh-popup]），滚动容器（listbox）必须铺满卡片：
   实测（450px 视口）卡片 424 宽而 listbox 只有 340 → 滚动条离卡片右缘 64px，
   看起来就是「滚动条没吸在最右侧、和布局边界不匹配」（#135 的回归形态）。
   注意：本段注释在模板字符串内，**不要写反引号**（会提前终止字符串，tsc 报 TS1005）。 */
html[data-dsh-mobile-form] [data-composer-card] [data-dsh-popup] {
  max-width: var(--dsh-mobile-popup-max-width, min(96vw, 420px)) !important;
}
html[data-dsh-mobile-form] [data-composer-card] [role='menu'] {
  max-width: var(--dsh-mobile-popup-max-width, min(96vw, 420px)) !important;
}
html[data-dsh-mobile-form] [data-composer-card] [role='listbox'] {
  max-width: none !important;
}

html[data-dsh-mobile-form] [data-composer-card] [role='listbox'] {
  max-height: var(--dsh-mobile-menu-max-height, 320px) !important;
}

/* The model menu is its own painted surface; its height cap only exists while
   the guard measures one, so the upstream 360px design cap stays in charge. */
html[data-dsh-mobile-form] [data-composer-card] [role='menu'] {
  max-height: var(--dsh-mobile-menu-max-height, none) !important;
}

/* Horizontal containment: the guard marks the painted card of every open
   popup and writes its shift, keeping the card inside the viewport. */
[data-dsh-popup] {
  transform: translateX(var(--dsh-mobile-popup-shift, 0px));
}
`;
		//#endregion
		//#region src/client/composer-row.css.ts
		/**
		* Composer control-row narrow-screen fixes:
		* - The model-selection pill is 176px fixed; on phones below the 400px
		*   breakpoint it overlaps the permission/access pill (device-observed on
		*   360dp phones). Cap its width and ellipsize so both stay tappable.
		* - The row is flex-wrap: wrap (upstream InputBar). On 360dp the left group
		*   (add + access-mode, 88px) + gap (12px) + trailing group (model pill +
		*   context meter + send, 204px at pill 118px) = 304px > 302px content width
		*   (318px card - 16px padding), so the trailing group wraps to a second
		*   line and the add/access controls misalign vertically with the model
		*   picker (issue #54). Capping the pill at 104px shrinks the trailing group
		*   to 182px (282px total), keeping the whole toolbar on one line; the pill's
		*   own content (label + effort + chevron, ~98px) still fits without
		*   truncation. Verified on-device (vivo V2425A, 360dp): tools y 627→670 and
		*   aligns with the model trigger.
		*/
		const COMPOSER_ROW_CSS = `
@media (max-width: 400px) {
  [data-composer-card] [aria-label*='选择模型'],
  [data-composer-card] [aria-label*='model'] {
    max-width: 104px;
  }
  [data-composer-card] [aria-label*='选择模型'] span,
  [data-composer-card] [aria-label*='model'] span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
`;
		//#endregion
		//#region src/client/composer-insets.css.ts
		/**
		* Composer insets adaptation for mobile/edge-to-edge:
		* On Android edge-to-edge mode, the shell supplies --dsh-android-system-bottom
		* (gesture / nav-bar height) and --dsh-android-ime-bottom (soft keyboard height).
		* Padding the whole composer seat ([data-composer-seat]) pushes the input card,
		* mode pills, anchored command menu, and the StatsLine footer above the navigation
		* bar / gesture pill and the soft keyboard.
		* On desktop / non-Android environments where CSS variables are unset,
		* max(0px, 0px, 0px) evaluates cleanly to 0px (zero side-effects).
		*/
		const COMPOSER_INSETS_CSS = `
[data-composer-seat] {
  padding-bottom: max(
    env(safe-area-inset-bottom, 0px),
    var(--dsh-android-system-bottom, 0px),
    var(--dsh-android-ime-bottom, 0px)
  );
}
`;
		//#endregion
		//#region src/client/trajectory-details.css.ts
		/**
		* Trajectory local details panel (upstream ui-trajectory) on narrow screens
		* (issue apk#67): the upstream ≤760px media query positions the panel
		* absolute within the ledger region — sandwiched between the trajectory
		* timeline bar above and the composer seat below (which also covers its
		* bottom), leaving a cramped reading band. Overlay it full-viewport inside
		* the mobile frame: fixed positioning escapes the ledger, so the panel spans
		* the whole screen (header + tabs fixed, body scrolls) and the input bar
		* never covers it. The upstream col-resize handle is pointless on touch.
		*/
		const TRAJECTORY_DETAILS_CSS = `
@media (max-width: 760px) {
  /* aside-scoped: the upstream panel's tablist ALSO carries aria-label="Event
     details", so a bare attribute selector would also turn the tabs into a
     fixed full-screen overlay covering the header and the close button. */
  html[data-dsh-mobile-form] aside[aria-label="Event details"] {
    position: fixed;
    inset: 0;
    z-index: 40;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    border-left: none;
    box-shadow: none;
    padding-top: var(--dsh-mobile-top-inset, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  html[data-dsh-mobile-form] aside[aria-label="Event details"] [aria-label="Resize event details"] {
    display: none;
  }
  /* The panel's fixed z-index lives inside the ledger's stacking context
     (position:relative; z-index:0; isolation:isolate), so it loses to the
     top bar (z3), the tabs and the timeline bar (z1) — the banner then
     covers the panel and the tabs/timeline stay visible above it. While the
     panel is open, raise the ledger itself so the whole subtree (panel
     included) covers them.
     2026-08-23 (#17 回归修复)：:has() 是 Chromium 105+；MIUI12 旧 WebView
     (Chromium 83) 整条规则被丢弃 → 面板遮挡回归。保留 :has() 路径（新内核
     零开销，无 JS 依赖）并追加 class 路径（旧内核由 TrajectoryPanelsObserver
     在面板开合时切换 dsh-mobile-ledger-raised）。 */
  html[data-dsh-mobile-form] [class*="ledger"]:has(aside[aria-label="Event details"]) {
    z-index: 12;
  }
  html[data-dsh-mobile-form] [class*="ledger"].dsh-mobile-ledger-raised {
    z-index: 12;
  }
}
`;
		//#endregion
		//#region src/client/trajectory-panels-observer.ts
		/**
		* 轨迹详情面板开合的 class 降级路径（2026-08-23，#17 回归修复）：
		* 主 CSS 用 :has()（Chromium 105+）抬升 ledger z-index；旧 WebView（MIUI12
		* 时代 Chromium 83）不支持 :has()，整条规则被丢弃 → 面板被顶部 banner 遮挡。
		* 本观察器用 MutationObserver 检测 aside[aria-label="Event details"] 的存在，
		* 给所属 ledger 切换 dsh-mobile-ledger-raised class（trajectory-details.css.ts
		* 的伴随规则兜底），并在浏览器原生支持 :has() 时自动停摆（零重复开销）。
		*/
		var TrajectoryPanelsObserver = class {
			mutationObserver = new MutationObserver((records) => {
				if (records.some((record) => this.isRelevantMutation(record))) this.sync();
			});
			ledger;
			attached = false;
			constructor(ledger) {
				this.ledger = ledger;
			}
			/** 开始监听面板开合（幂等）。 */
			attach() {
				if (this.attached) return;
				if (this.supportsHasSelector()) return;
				this.attached = true;
				this.mutationObserver.observe(document.body, {
					childList: true,
					subtree: true
				});
				this.sync();
			}
			/** 停止监听并清除 class。 */
			detach() {
				this.mutationObserver.disconnect();
				if (this.attached && this.ledger !== null) this.ledger.classList.remove("dsh-mobile-ledger-raised");
				this.attached = false;
			}
			/** 面板存在 → 抬升 ledger（class 路径，CSS .dsh-mobile-ledger-raised）；否则移除。 */
			sync() {
				if (this.ledger === null) return;
				const panel = this.ledger.querySelector("aside[aria-label=\"Event details\"]");
				this.ledger.classList.toggle("dsh-mobile-ledger-raised", panel !== null);
			}
			isRelevantMutation(record) {
				return [
					record.target,
					...record.addedNodes,
					...record.removedNodes
				].some((node) => {
					if (!(node instanceof Element)) return false;
					return node.matches("aside[aria-label=\"Event details\"]") || node.querySelector("aside[aria-label=\"Event details\"]") !== null;
				});
			}
			/** CSS 支持探测：:has() 对旧内核很可能是 SyntaxError 整条丢弃后的误报，
			*  用 CSS.supports 的官方探测（Chromium 105+ 才有 CSS.supports('selector(:has(*))') 真值）。 */
			supportsHasSelector() {
				try {
					return typeof CSS !== "undefined" && CSS.supports !== void 0 && CSS.supports("selector(:has(*))");
				} catch {
					return false;
				}
			}
		};
		//#endregion
		//#region src/client/composer-popup-guard.ts
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
		const LISTBOX_HEIGHT_CAP = 320;
		/** Design cap on the model menu height (upstream ModelSelect .menu). */
		const MENU_HEIGHT_CAP = 360;
		/** Space kept between a popup and the mobile top bar. */
		const TOPBAR_CLEARANCE = 12;
		/** Design cap on a popup's width. */
		const POPUP_WIDTH_CAP = 340;
		/** Fraction of the viewport width a popup may occupy (mirrors the shell's injected cap). */
		const POPUP_VIEWPORT_FRACTION = .92;
		/**
		* Width cap for a composer popup: the design cap, never more than the fraction
		* of the viewport the shell's injected stylesheet allows.
		* @param viewportWidth - layout viewport width in CSS pixels.
		* @returns the cap in whole CSS pixels.
		*/
		function popupMaxWidth(viewportWidth) {
			return Math.max(0, Math.floor(Math.min(POPUP_WIDTH_CAP, viewportWidth * POPUP_VIEWPORT_FRACTION)));
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
		function popupShiftLeft(left, right, viewportWidth, gap = 8) {
			if (right - left > viewportWidth - gap * 2) return Math.round(gap - left);
			if (right > viewportWidth - gap) return Math.round(viewportWidth - gap - right);
			if (left < gap) return Math.round(gap - left);
			return 0;
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
		function composerPopupMaxHeight(popupBottom, topbarBottom, chromeHeight = 0, cap = LISTBOX_HEIGHT_CAP) {
			return Math.max(0, Math.min(cap, Math.floor(popupBottom - topbarBottom - TOPBAR_CLEARANCE - chromeHeight)));
		}
		/** The painted surface of a popup: the role element itself, or its card parent. */
		function surfaceOf(popup) {
			return popup.getAttribute("role") === "menu" ? popup : popup.parentElement ?? popup;
		}
		/** Height excluded from a content-box max-height (padding + border). */
		function chromeHeight(element) {
			const style = getComputedStyle(element);
			if (style.boxSizing === "border-box") return 0;
			return [
				"paddingTop",
				"paddingBottom",
				"borderTopWidth",
				"borderBottomWidth"
			].map((property) => Number.parseFloat(style[property]) || 0).reduce((total, value) => total + value, 0);
		}
		/** Current inline horizontal shift of a surface. */
		function readShift(surface) {
			return Number.parseFloat(surface.style.getPropertyValue("--dsh-mobile-popup-shift")) || 0;
		}
		/**
		* Keeps every open composer popup inside the viewport: width cap on the surface
		* and its scroll container, horizontal shift on the surface, height cap on the
		* scrolling element.
		*/
		var ComposerPopupGuard = class {
			onViewportChange = () => {
				this.queue();
			};
			mutationObserver = new MutationObserver((records) => {
				if (records.some((record) => this.isRelevantMutation(record))) this.queue();
			});
			resizeObserver = new ResizeObserver(() => {
				this.queue();
			});
			frame = null;
			observed = [];
			styled = /* @__PURE__ */ new Set();
			/** Start observing composer popup geometry. */
			attach() {
				this.mutationObserver.observe(document.body, {
					childList: true,
					subtree: true
				});
				window.addEventListener("resize", this.onViewportChange);
				window.addEventListener("scroll", this.onViewportChange, true);
				window.visualViewport?.addEventListener("resize", this.onViewportChange);
				this.queue();
			}
			/** Stop observing and remove every geometric correction. */
			detach() {
				this.mutationObserver.disconnect();
				this.resizeObserver.disconnect();
				window.removeEventListener("resize", this.onViewportChange);
				window.removeEventListener("scroll", this.onViewportChange, true);
				window.visualViewport?.removeEventListener("resize", this.onViewportChange);
				if (this.frame !== null) cancelAnimationFrame(this.frame);
				this.frame = null;
				this.clear();
				this.observed = [];
			}
			queue() {
				if (this.frame !== null) return;
				this.frame = requestAnimationFrame(() => {
					this.frame = null;
					this.apply();
				});
			}
			apply() {
				const card = document.querySelector("[data-composer-card]");
				const topbar = document.querySelector("[data-dsh-mobile-topbar]");
				if (card === null) {
					this.clear();
					return;
				}
				const popups = Array.from(card.querySelectorAll("[role='menu'], [role='listbox']"));
				if (popups.length === 0) {
					this.clear();
					return;
				}
				const viewportWidth = document.documentElement.clientWidth;
				const widthCap = `${popupMaxWidth(viewportWidth)}px`;
				const topbarBottom = topbar?.getBoundingClientRect().bottom ?? 0;
				const styled = /* @__PURE__ */ new Set();
				const measured = topbar === null ? [] : [topbar, card];
				for (const popup of popups) {
					const surface = surfaceOf(popup);
					styled.add(surface);
					styled.add(popup);
					measured.push(surface, popup);
					for (const element of surface === popup ? [popup] : [popup, surface]) if (element.style.getPropertyValue("--dsh-mobile-popup-max-width") !== widthCap) element.style.setProperty("--dsh-mobile-popup-max-width", widthCap);
					const currentShift = readShift(surface);
					const rect = surface.getBoundingClientRect();
					const shift = popupShiftLeft(rect.left - currentShift, rect.right - currentShift, viewportWidth);
					if (shift !== currentShift) surface.style.setProperty("--dsh-mobile-popup-shift", `${shift}px`);
					surface.setAttribute("data-dsh-popup", "");
					const heightCap = `${composerPopupMaxHeight(rect.bottom, topbarBottom, chromeHeight(popup), popup.getAttribute("role") === "menu" ? MENU_HEIGHT_CAP : LISTBOX_HEIGHT_CAP)}px`;
					if (popup.style.getPropertyValue("--dsh-mobile-menu-max-height") !== heightCap) popup.style.setProperty("--dsh-mobile-menu-max-height", heightCap);
				}
				for (const element of this.styled) if (!styled.has(element)) this.clearElement(element);
				this.styled = styled;
				this.syncObserved(measured);
			}
			/** Drop every correction and forget the touched elements. */
			clear() {
				for (const element of this.styled) this.clearElement(element);
				this.styled = /* @__PURE__ */ new Set();
				this.syncObserved([]);
			}
			clearElement(element) {
				element.style.removeProperty("--dsh-mobile-popup-max-width");
				element.style.removeProperty("--dsh-mobile-popup-shift");
				element.style.removeProperty("--dsh-mobile-menu-max-height");
				element.removeAttribute("data-dsh-popup");
			}
			syncObserved(next) {
				if (next.length === this.observed.length && next.every((element, index) => element === this.observed[index])) return;
				this.resizeObserver.disconnect();
				for (const element of next) this.resizeObserver.observe(element);
				this.observed = next;
			}
			isRelevantMutation(record) {
				if (record.target instanceof Element && record.target.closest("[data-composer-card]") !== null) return true;
				return [...record.addedNodes, ...record.removedNodes].some((node) => {
					if (!(node instanceof Element)) return false;
					return node.matches("[data-composer-card], [role=\"listbox\"], [role=\"menu\"]") || node.querySelector("[data-composer-card], [role=\"listbox\"], [role=\"menu\"]") !== null;
				});
			}
		};
		//#endregion
		//#region src/client/session-log-dialog.css.ts
		/**
		* Hide the upstream session-log-export modal on Android shell builds.
		*
		* The shell APK already owns the export result surface: MainActivity pushes
		* the final success/failure through `window.__dshExportResult`, and
		* `ExportResultDialog` renders it in `shell.overlay`. The upstream
		* `session-log-export` modal also opens (preparing → success/error), so two
		* dialogs stack. The upstream CSS Module class names are hashed, so this
		* stylesheet targets the modal's stable ARIA attributes instead.
		*
		* ST-14: the `:has()` rules are the primary path (Chromium 105+); an old kernel
		* drops the whole rule as a syntax error — the exact shape of the #17 regression
		* the trajectory ledger already hit. So the companion class rules below are the
		* fallback path, applied by `SessionLogDialogObserver` only when
		* `CSS.supports('selector(:has(*))')` is false.
		*/
		/** Class the fallback path toggles on the modal's `[role=presentation]` (or the dialog itself). */
		const SESSION_LOG_DIALOG_HIDE_CLASS = "dsh-mobile-hide-session-log-dialog";
		/** ARIA labels the upstream export modal opens with (localized; keep in one place). */
		const SESSION_LOG_DIALOG_LABEL_PREFIXES = [
			"正在导出 Session",
			"Session 导出",
			"Exporting Session",
			"Session download",
			"Session export"
		];
		const SESSION_LOG_DIALOG_HIDE_CSS = `
[role="presentation"]:has([role="dialog"][aria-label^="正在导出 Session"]),
[role="presentation"]:has([role="dialog"][aria-label^="Session 导出"]),
[role="presentation"]:has([role="dialog"][aria-label^="Exporting Session"]),
[role="presentation"]:has([role="dialog"][aria-label^="Session download"]),
[role="presentation"]:has([role="dialog"][aria-label^="Session export"]) {
  display: none !important;
}

/* ST-14 兜底路径（旧内核无 :has()）：由 SessionLogDialogObserver 打 class。 */
[role="presentation"].${SESSION_LOG_DIALOG_HIDE_CLASS},
[role="dialog"].${SESSION_LOG_DIALOG_HIDE_CLASS} {
  display: none !important;
}
`;
		//#endregion
		//#region src/client/session-log-dialog-observer.ts
		/**
		* 导出弹窗隐藏的 **class 降级路径**（ST-14，F-UI-06）。
		*
		* 主路径是 `session-log-dialog.css.ts` 的 `:has()` 规则（Chromium 105+）。旧内核把整条
		* 规则当语法错误丢弃 —— 与 #17 的轨迹面板遮挡同一形态（TrajectoryPanelsObserver 已踩过），
		* 而"规则文本还在页面里"会让 grep 类检查全绿（假绿）。本观察器照
		* `TrajectoryPanelsObserver` 的形状实现：
		*  - 能力探测：`CSS.supports('selector(:has(*))')` 为真 → 不启用（零重复开销）；
		*  - 为假 → MutationObserver 盯住上游导出弹窗，给其 `[role=presentation]`（无则由弹窗自身承担）
		*    打上 `dsh-mobile-hide-session-log-dialog` class，由伴随规则隐藏。
		*/
		/** 上游导出弹窗的判定：`[role=dialog]` 且 aria-label 命中导出文案前缀。 */
		function isSessionLogDialog(element) {
			if (!element.matches("[role=\"dialog\"]")) return false;
			const label = element.getAttribute("aria-label") ?? "";
			return SESSION_LOG_DIALOG_LABEL_PREFIXES.some((prefix) => label.startsWith(prefix));
		}
		var SessionLogDialogObserver = class {
			mutationObserver = new MutationObserver((records) => {
				if (records.some((record) => this.isRelevantMutation(record))) this.sync();
			});
			attached = false;
			tagged = /* @__PURE__ */ new Set();
			/** 开始监听导出弹窗（幂等）；原生支持 :has() 时 CSS 路径已足够，class 降级不启用。 */
			attach() {
				if (this.attached) return;
				if (supportsHasSelector()) return;
				this.attached = true;
				this.mutationObserver.observe(document.body, {
					childList: true,
					subtree: true,
					attributes: true,
					attributeFilter: ["aria-label"]
				});
				this.sync();
			}
			/** 停止监听并清除所有 class。 */
			detach() {
				this.mutationObserver.disconnect();
				for (const element of this.tagged) element.classList.remove(SESSION_LOG_DIALOG_HIDE_CLASS);
				this.tagged.clear();
				this.attached = false;
			}
			/** 同步一次：命中导出弹窗 → 打 class；弹窗消失 → 收 class（绝不残留）。 */
			sync() {
				const next = /* @__PURE__ */ new Set();
				for (const dialog of document.querySelectorAll("[role=\"dialog\"]")) {
					if (!isSessionLogDialog(dialog)) continue;
					const target = dialog.closest("[role=\"presentation\"]") ?? dialog;
					target.classList.add(SESSION_LOG_DIALOG_HIDE_CLASS);
					next.add(target);
				}
				for (const element of [...this.tagged]) {
					if (next.has(element)) continue;
					element.classList.remove(SESSION_LOG_DIALOG_HIDE_CLASS);
					this.tagged.delete(element);
				}
				for (const element of next) this.tagged.add(element);
			}
			isRelevantMutation(record) {
				if (record.type === "attributes") return record.target instanceof Element && isSessionLogDialog(record.target);
				return [
					record.target,
					...record.addedNodes,
					...record.removedNodes
				].some((node) => {
					if (!(node instanceof Element)) return false;
					return isSessionLogDialog(node) || node.querySelector("[role=\"dialog\"]") !== null;
				});
			}
		};
		/** CSS 支持探测：旧内核缺 `selector(:has(*))` 支持（真值需 Chromium 105+）。 */
		function supportsHasSelector() {
			try {
				return typeof CSS !== "undefined" && CSS.supports !== void 0 && CSS.supports("selector(:has(*))");
			} catch {
				return false;
			}
		}
		//#endregion
		//#region src/client/mobile/use-shell-state.ts
		/**
		* 壳侧状态订阅钩子（ST-09 / ST-27：禁止裸写一次性桥读）。
		*
		* 「从系统设置返回」是本项目最高频、最容易踩的路径（F-UI-12）：在系统侧改了状态
		* （权限/开关/偏好）后回到页面，React 不会重挂载，一次性 `useState(() => bridge.getX())`
		* 读到的旧值会一直显示 —— 展示值与真源分裂。
		*
		* 本钩子统一提供：**挂载读一次 + `visibilitychange`/`focus` 重读 + 可选轮询**，
		* 并返回一个 `refresh()` 供"写后回读"（§4.5 七模式之五）使用。
		*
		* 纪律：组件里禁止「useState 初值器直读 window.androidBridge」这类一次性裸读（ST-27 的 grep 判据）；
		* 设备侧/壳侧状态一律经本钩子进入 React state（回归见 tests/shell-state-discipline.spec.ts）。
		*/
		/**
		* @param getter - 真源读函数（壳桥或由其派生的值）；必须同步、无副作用。
		* @param options - 可选轮询间隔。
		* @returns `[当前值, refresh]`：refresh 立即重读真源（供写后回读），失败保留上一次值。
		*/
		function useShellState(getter, options = {}) {
			const getterRef = (0, react.useRef)(getter);
			getterRef.current = getter;
			const [value, setValue] = (0, react.useState)(() => {
				try {
					return getter();
				} catch {
					return;
				}
			});
			const refresh = (0, react.useCallback)(() => {
				let next;
				try {
					next = getterRef.current();
				} catch {
					return;
				}
				setValue((prev) => Object.is(prev, next) ? prev : next);
			}, []);
			const pollMs = options.pollMs;
			(0, react.useEffect)(() => {
				const onVisible = () => {
					if (document.visibilityState === "visible") refresh();
				};
				document.addEventListener("visibilitychange", onVisible);
				window.addEventListener("focus", onVisible);
				const timer = pollMs !== void 0 && pollMs > 0 ? window.setInterval(onVisible, pollMs) : void 0;
				return () => {
					document.removeEventListener("visibilitychange", onVisible);
					window.removeEventListener("focus", onVisible);
					if (timer !== void 0) window.clearInterval(timer);
				};
			}, [refresh, pollMs]);
			return [value, refresh];
		}
		//#endregion
		//#region src/client/dev-section/DevSection.tsx
		/**
		* Developer-options settings page (Android shell facilities): restart / shut down (both with a
		* custom confirm) / refresh UI / open console / dev debug-log toggle. Registered at the upstream
		* settings.section extension point (auto-projected by ui-settings-general's nav, zero upstream
		* changes). Bridge calls go through window.androidBridge (injected by MainActivity's
		* addJavascriptInterface).
		*
		* Restart and shut down draw a custom frontend confirm because WebView's window.confirm is
		* unreliable under the shell's auto-approving onJsAlert; "Shut down" stops the engine and falls
		* back to the init screen (shell shutdownToGuide bridge).
		*/
		/** 壳侧悬浮球开关真值回读（桥不可用/抛错 → false）。
		*  ST-02（页侧半边）：壳侧 getOverlayEnabled() = 偏好 && 悬浮窗权限 && 服务实例在场，
		*  权限缺失时偏好已回落 false —— 展示值只能以该回读为准，不得沿用上次的 UI 值。 */
		function readOverlayEnabled() {
			try {
				return window.androidBridge?.getOverlayEnabled?.() ?? false;
			} catch {
				return false;
			}
		}
		const CONFIRM_TEXT = {
			restart: {
				title: "重启 DeepSeek Harness？",
				desc: "将终止并自动重新启动本地引擎与页面（约数秒）。未发送的内容会保留在输入框。",
				ok: "重启"
			},
			close: {
				title: "关闭并回退到初始化界面？",
				desc: "将停止本地引擎并退出到初始化界面；引擎不会自动重启，需手动再次启动。",
				ok: "关闭"
			}
		};
		/**
		* Render the developer-options section content column.
		* @param props - composed slot props (contract/slots.ts).
		* @returns the section element tree.
		*/
		function DevSection({ renderSlot }) {
			const [devLog, refreshDevLog] = useShellState(() => {
				try {
					return window.androidBridge?.getDevLogEnabled?.() ?? false;
				} catch {
					return false;
				}
			});
			const [overlayOn, refreshOverlay] = useShellState(readOverlayEnabled);
			const [overlayMsg, setOverlayMsg] = (0, react.useState)(null);
			const [restarting, setRestarting] = (0, react.useState)(false);
			const [allFiles] = useShellState(() => {
				try {
					return window.androidBridge?.hasAllFilesAccess?.() ?? false;
				} catch {
					return false;
				}
			});
			const [confirm, setConfirm] = (0, react.useState)(null);
			const [incomingBytes, setIncomingBytes] = (0, react.useState)(null);
			const [incomingMsg, setIncomingMsg] = (0, react.useState)(null);
			const [cleaning, setCleaning] = (0, react.useState)(false);
			const refreshIncoming = (0, react.useCallback)(async () => {
				try {
					const r = await fetch("/api/android/file-incoming", {
						credentials: "same-origin",
						cache: "no-store"
					});
					if (r.status === 401 || r.status === 403) {
						setIncomingMsg("未获授权（HTTP " + r.status + "）——来件状态不可读");
						return;
					}
					if (r.ok) {
						const j = await r.json();
						setIncomingBytes(typeof j.bytes === "number" ? j.bytes : null);
					}
				} catch {}
			}, []);
			(0, react.useEffect)(() => {
				refreshIncoming();
			}, [refreshIncoming]);
			(0, react.useEffect)(() => {
				const onVisible = () => {
					if (document.visibilityState !== "visible") return;
					refreshIncoming();
				};
				document.addEventListener("visibilitychange", onVisible);
				window.addEventListener("focus", onVisible);
				return () => {
					document.removeEventListener("visibilitychange", onVisible);
					window.removeEventListener("focus", onVisible);
				};
			}, [refreshIncoming]);
			const cleanIncoming = (0, react.useCallback)(async () => {
				setCleaning(true);
				setIncomingMsg(null);
				try {
					const r = await fetch("/api/android/file-incoming/clean", {
						method: "POST",
						credentials: "same-origin",
						cache: "no-store"
					});
					if (r.status === 401 || r.status === 403 || r.status === 405) {
						setIncomingMsg("清理未获授权（HTTP " + r.status + "）——仅限本机壳侧/已授权页面");
						return;
					}
					const j = await r.json().catch(() => null);
					setIncomingMsg(j?.ok ? `已清理本工具临时项（${j.removed ?? 0} 项）——相关会话中的文件引用将失效` : "清理失败");
				} catch {
					setIncomingMsg("清理请求失败（仅安卓宿主可用）");
				} finally {
					setCleaning(false);
					refreshIncoming();
				}
			}, [refreshIncoming]);
			const fmtBytes = (n) => {
				if (n >= 1048576) return (n / 1024 / 1024).toFixed(1) + " MB";
				if (n >= 1024) return (n / 1024).toFixed(1) + " KB";
				return n + " B";
			};
			const askRestart = (0, react.useCallback)(() => setConfirm("restart"), []);
			const askClose = (0, react.useCallback)(() => setConfirm("close"), []);
			const cancelConfirm = (0, react.useCallback)(() => setConfirm(null), []);
			const doRestart = (0, react.useCallback)(() => {
				setConfirm(null);
				setRestarting(true);
				try {
					window.androidBridge?.restartEngine?.();
				} catch {}
				window.setTimeout(() => setRestarting(false), 2e3);
			}, []);
			const doClose = (0, react.useCallback)(() => {
				setConfirm(null);
				try {
					window.androidBridge?.shutdownToGuide?.();
				} catch {}
			}, []);
			const reload = (0, react.useCallback)(() => {
				try {
					window.androidBridge?.reloadWebUI?.();
				} catch {}
			}, []);
			const openConsole = (0, react.useCallback)(() => {
				try {
					window.androidBridge?.openConsole?.();
				} catch {}
			}, []);
			const toggleLog = (0, react.useCallback)((enabled) => {
				try {
					window.androidBridge?.setDevLogEnabled?.(enabled);
				} catch {}
				refreshDevLog();
			}, [refreshDevLog]);
			const toggleOverlay = (0, react.useCallback)((enabled) => {
				setOverlayMsg(null);
				try {
					const started = window.androidBridge?.setOverlayEnabled?.(enabled) ?? false;
					refreshOverlay();
					if (enabled && !started) setOverlayMsg("已打开系统授权页；授予后请重新打开本开关");
					else if (enabled) setOverlayMsg(null);
					else setOverlayMsg(null);
				} catch {
					setOverlayMsg("桥不可用（仅安卓宿主支持悬浮球）");
				}
			}, [refreshOverlay]);
			const [configMsg, setConfigMsg] = (0, react.useState)(null);
			const exportConfig = (0, react.useCallback)(() => {
				try {
					const raw = window.androidBridge?.exportConfig?.();
					const j = JSON.parse(raw ?? "{}");
					setConfigMsg(j.ok ? `已导出到 ${j.path ?? "exports/config/settings.yaml"}` : `导出失败：${j.error ?? "未知错误"}`);
				} catch {
					setConfigMsg("导出失败：桥不可用（仅安卓宿主可用）");
				}
			}, []);
			const importConfig = (0, react.useCallback)(() => {
				try {
					const raw = window.androidBridge?.importConfig?.();
					const j = JSON.parse(raw ?? "{}");
					setConfigMsg(j.ok ? `已导入并生效（原配置备份为 settings.yaml.import-backup）。${j.hint ?? ""}` : `导入失败：${j.error ?? "未知错误"}`);
				} catch {
					setConfigMsg("导入失败：桥不可用（仅安卓宿主可用）");
				}
			}, []);
			const onKeyDown = (0, react.useCallback)((e) => {
				if (e.key === "Escape") cancelConfirm();
			}, [cancelConfirm]);
			const logPathHint = allFiles === false ? "日志位置：应用私有目录" : "日志位置：Documents/dshdata/log";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-plugin": "dev-section",
				onKeyDown,
				children: [
					renderSlot?.("settings.dev.item", {}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-dev-row",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsh-dev-btn",
								onClick: askRestart,
								disabled: restarting,
								children: restarting ? "重启中…" : "重启"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsh-dev-btn dsh-dev-danger",
								onClick: askClose,
								children: "关闭"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsh-dev-btn",
								onClick: reload,
								children: "刷新界面"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsh-dev-btn",
								onClick: openConsole,
								children: "打开控制台"
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "dsh-dev-row dsh-dev-switch",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: devLog,
							onChange: (e) => toggleLog(e.target.checked)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "开发者调试日志" })]
					}),
					devLog && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "dsh-dev-hint",
						children: [logPathHint, "。含对话与命令内容。"]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "dsh-dev-row dsh-dev-switch",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: overlayOn,
							onChange: (e) => toggleOverlay(e.target.checked)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "鲸鱼悬浮球" })]
					}),
					overlayMsg !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-dev-hint",
						children: overlayMsg
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-dev-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-dev-btn",
							onClick: exportConfig,
							children: "导出配置"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-dev-btn",
							onClick: importConfig,
							children: "导入配置"
						})]
					}),
					configMsg !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-dev-hint",
						children: configMsg
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
						className: "dsh-dev-hint",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: "配置说明" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "导出到 Documents/dshdata/exports/config/settings.yaml，修改后可重新导入。导出不含 API 密钥。" })]
					}),
					incomingBytes !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-dev-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["临时文件：", fmtBytes(incomingBytes)] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-dev-btn dsh-dev-danger",
							disabled: cleaning || incomingBytes === 0,
							onClick: () => void cleanIncoming(),
							children: cleaning ? "清理中…" : "清理"
						})]
					}),
					incomingMsg !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-dev-hint",
						children: incomingMsg
					}),
					incomingBytes !== null && incomingBytes > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-dev-hint",
						children: "清理后，相关会话将无法再访问这些临时文件。"
					}),
					confirm !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-dev-modal-overlay",
						role: "dialog",
						"aria-modal": "true",
						"aria-label": CONFIRM_TEXT[confirm].title,
						onClick: cancelConfirm,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-dev-modal",
							role: "document",
							onClick: (e) => e.stopPropagation(),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "dsh-dev-modal-title",
									children: CONFIRM_TEXT[confirm].title
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "dsh-dev-modal-desc",
									children: CONFIRM_TEXT[confirm].desc
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dsh-dev-modal-actions",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dsh-dev-btn",
										autoFocus: true,
										onClick: cancelConfirm,
										children: "取消"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: confirm === "close" ? "dsh-dev-btn dsh-dev-danger" : "dsh-dev-btn",
										onClick: confirm === "restart" ? doRestart : doClose,
										children: CONFIRM_TEXT[confirm].ok
									})]
								})
							]
						})
					})
				]
			});
		}
		//#endregion
		//#region src/client/dev-section/dev-section.css.ts
		/**
		* Developer-options settings-page styles: reuse --dsw-* semantic tokens (auto light/dark), buttons in
		* a wrapping row layout; on narrow screens (mobile form) buttons become a two-column grid.
		* Injection matches mobile-settings.css.ts (style tag + data-plugin attribute; this page's root
		* selector uses [data-plugin='dev-section'] against class-hash churn).
		*/
		const DEV_SECTION_CSS = `
[data-plugin='dev-section'] {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0 12px;
}

.dsh-dev-note {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary, #666);
}

.dsh-dev-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.dsh-dev-btn {
  min-height: 36px;
  padding: 6px 14px;
  border: 1px solid var(--dsw-alias-border-strong, #ccc);
  border-radius: 8px;
  background: var(--dsw-alias-bg-elevated, #fff);
  color: var(--dsw-alias-label-primary, #222);
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
}

.dsh-dev-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.dsh-dev-danger {
  border-color: var(--dsw-alias-danger-fg, #c0392b);
  color: var(--dsw-alias-danger-fg, #c0392b);
}

.dsh-dev-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  padding: calc(20px + var(--dsh-mobile-top-inset, 0px)) 20px 20px;
}

.dsh-dev-modal {
  width: 100%;
  max-width: 360px;
  padding: 18px 20px;
  border: 1px solid var(--dsw-alias-border-strong, #ccc);
  border-radius: 12px;
  background: var(--dsw-alias-bg-elevated, #fff);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.25);
}

.dsh-dev-modal-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #222);
}

.dsh-dev-modal-desc {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary, #666);
}

.dsh-dev-modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.dsh-dev-switch {
  font-size: 14px;
  color: var(--dsw-alias-label-primary, #222);
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

.dsh-dev-switch input {
  width: 16px;
  height: 16px;
  margin: 0;
}

.dsh-dev-label {
  font-size: 14px;
  color: var(--dsw-alias-label-primary, #222);
  min-width: 64px;
}

.dsh-dev-value {
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, #666);
  min-width: 44px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.dsh-dev-row input[type='range'] {
  flex: 1;
  min-width: 120px;
}

.dsh-dev-hint {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #666);
}

.dsh-dev-warn {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-danger-fg, #c0392b);
}

/* Dark-theme fallback (#43, 2026-08-18): in some environments --dsw-alias-bg-elevated is undefined
 * and falls back to #fff (white bg), while label-primary is white text in dark mode → white-on-white.
 * Provide explicit theme-consistent fallbacks for tokens that may not exist. */
@media (prefers-color-scheme: dark) {
  .dsh-dev-btn {
    background: var(--dsw-alias-bg-elevated, #26262b);
    color: var(--dsw-alias-label-primary, #f2f2f4);
    border-color: var(--dsw-alias-border-strong, #55555c);
  }
  .dsh-dev-note, .dsh-dev-hint {
    color: var(--dsw-alias-label-secondary, #c9c9cf);
  }
  .dsh-dev-warn {
    color: var(--dsw-alias-danger-fg, #ff9c9c);
  }
  .dsh-dev-danger {
    border-color: var(--dsw-alias-danger-fg, #ff9c9c);
    color: var(--dsw-alias-danger-fg, #ff9c9c);
  }
  .dsh-dev-modal {
    background: var(--dsw-alias-bg-elevated, #26262b);
    border-color: var(--dsw-alias-border-strong, #55555c);
  }
  .dsh-dev-modal-title {
    color: var(--dsw-alias-label-primary, #f2f2f4);
  }
  .dsh-dev-modal-desc {
    color: var(--dsw-alias-label-secondary, #c9c9cf);
  }
}

@media (max-width: 639px) {
  .dsh-dev-btn {
    flex: 1 1 calc(50% - 5px);
    text-align: center;
  }
}
`;
		//#endregion
		//#region src/client/general-settings/GeneralSettings.tsx
		/**
		* General-settings additions for the Android shell (issue #59): the upstream
		* Settings → General section lost the Android-only immersive status-bar toggle.
		* The shell bridge exists (androidBridge.getImmersiveMode / setImmersiveMode,
		* whose truth source is the shell's ShellState.ImmersiveMode) and the row
		* registers at the upstream settings.general.item extension point (auto
		* projected into the General section nav), mirroring DevSection.
		*
		* 0.13.3 (D6 收益省略): the font-size slider (WebView textZoom, 50–200%)
		* retired — upstream ui-theme now ships a native fontSize field (12–17px
		* content font size) rendered in the Appearance section with persistence.
		* The shell's setTextZoom bridge and persistence were removed with it.
		*
		* ST-10: the value is the bridge's getImmersiveMode() (shell pref is the truth
		* source). The localStorage key (dsh.android.immersive) is only a fallback for
		* hosts without that bridge (desktop / older shells), and this page is its sole
		* writer — no injected index.html script writes it.
		*
		* ST-09: the read goes through useShellState (mount + visible/foreground
		* re-read + write-then-read-back), never a one-shot bridge read.
		*/
		const IMMERSIVE_KEY = "dsh.android.immersive";
		/**
		* Immersive initial value (ST-10): the shell bridge is the sole truth source
		* (ShellState.ImmersiveMode); the localStorage mirror is only the fallback for
		* hosts without that bridge, and the default stays true (the shell's default).
		* @returns the effective immersive flag for this render.
		*/
		function readImmersive() {
			try {
				const fromBridge = window.androidBridge?.getImmersiveMode?.();
				if (typeof fromBridge === "boolean") return fromBridge;
			} catch {}
			try {
				return localStorage.getItem(IMMERSIVE_KEY) !== "0";
			} catch {
				return true;
			}
		}
		/**
		* Render the Android general-settings rows (immersive toggle).
		* @param props - composed slot props (contract/slots.ts).
		* @returns the section element tree.
		*/
		function GeneralSettings(_props) {
			const [immersive, refreshImmersive] = useShellState(readImmersive);
			const toggleImmersive = (0, react.useCallback)((enabled) => {
				try {
					localStorage.setItem(IMMERSIVE_KEY, enabled ? "1" : "0");
				} catch {}
				try {
					window.androidBridge?.setImmersiveMode?.(enabled);
				} catch {}
				refreshImmersive();
			}, [refreshImmersive]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-plugin": "android-general",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
					className: "dsh-dev-row dsh-dev-switch",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "checkbox",
						checked: immersive,
						onChange: (e) => toggleImmersive(e.target.checked)
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "沉浸式状态栏" })]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "dsh-dev-hint",
					children: "常态隐藏系统状态栏，边缘滑动临时呼出；关闭后常驻显示。"
				})]
			});
		}
		//#endregion
		//#region src/client/theme-bridge.ts
		/**
		* ThemeBridge: make prefers-color-scheme follow the OS dark state on
		* WebViews whose media query does not track the system uiMode (observed on
		* vivo/Android 16: FORCE_DARK_AUTO leaves matchMedia stuck at light).
		*
		* The shell APK watches Configuration changes and pushes the dark flag via
		* window.__dshThemeBridge.setDark(dark). This module hooks matchMedia for the
		* (prefers-color-scheme: dark) query so the upstream ui-theme service
		* (default preference: system) resolves and live-updates through its own
		* listener — zero upstream changes.
		*/
		var ThemeBridge = class {
			dark = false;
			listeners = /* @__PURE__ */ new Set();
			patched = false;
			/** Install the matchMedia hook and the bridge object (idempotent). */
			install() {
				if (this.patched) return;
				this.patched = true;
				const android = window.androidBridge;
				if (window.__dshThemeBridge) return;
				if (!android || typeof android.getSystemDark !== "function") return;
				const self = this;
				const nativeMatchMedia = window.matchMedia.bind(window);
				window.matchMedia = ((query) => {
					if (!query.includes("prefers-color-scheme")) return nativeMatchMedia(query);
					const onChange = () => {
						for (const listener of self.listeners) try {
							listener();
						} catch {}
					};
					return {
						get matches() {
							return self.dark;
						},
						get media() {
							return query;
						},
						get onchange() {
							return null;
						},
						set onchange(_v) {},
						addEventListener: (type, cb) => {
							if (type !== "change" || typeof cb !== "function") return;
							self.listeners.add(cb);
							onChange();
						},
						removeEventListener: (type, cb) => {
							if (type !== "change" || typeof cb !== "function") return;
							self.listeners.delete(cb);
						},
						addListener: (cb) => {
							self.listeners.add(cb);
						},
						removeListener: (cb) => {
							self.listeners.delete(cb);
						},
						dispatchEvent: () => false
					};
				});
				const globalObj = window;
				globalObj.__dshThemeBridge = { setDark: (d) => {
					if (self.dark === d) return;
					self.dark = d;
					for (const listener of self.listeners) try {
						listener();
					} catch {}
				} };
				try {
					if (android.getSystemDark()) globalObj.__dshThemeBridge.setDark(true);
				} catch {}
			}
		};
		//#endregion
		//#region src/client/mobile/form-marker.ts
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
		const MOBILE_FORM_MAX_WIDTH = 767;
		/** The media query the marker mirrors. */
		const MOBILE_FORM_QUERY = `(max-width: 767px)`;
		/** Frame tag consumed by this plugin's narrow-form stylesheet. */
		const FRAME_TAG = "data-dsh-frame";
		/** Settings-panel tag consumed by the mobile settings stylesheet. */
		const SETTINGS_TAG = "data-dsh-settings-dialog";
		/** Marks the phone form on `<html>` and tags the upstream frame root. */
		var MobileFormMarker = class {
			media = null;
			observer = null;
			frame = null;
			modal = null;
			/** Publish both facts and keep them current. */
			attach() {
				this.media = typeof window.matchMedia === "function" ? window.matchMedia(MOBILE_FORM_QUERY) : null;
				this.media?.addEventListener?.("change", this.syncForm);
				this.syncForm();
				this.observer = new MutationObserver(this.syncDom);
				this.observer.observe(document.documentElement, {
					childList: true,
					subtree: true
				});
				this.syncDom();
			}
			/** Remove listeners, the observer, and both marks. */
			detach() {
				this.media?.removeEventListener?.("change", this.syncForm);
				this.media = null;
				this.observer?.disconnect();
				this.observer = null;
				this.frame?.removeAttribute(FRAME_TAG);
				this.frame = null;
				this.modal?.removeAttribute(SETTINGS_TAG);
				this.modal = null;
				document.documentElement.removeAttribute("data-dsh-mobile-form");
				document.documentElement.removeAttribute("data-dsh-modal-open");
			}
			syncDom = () => {
				this.syncFrame();
				this.syncModal();
			};
			/**
			* Publish "a modal is up" and tag the settings panel.
			*
			* Dialogs inside the frame's own overlay layer (this plugin's export-result
			* dialog) are not modals over the sidebar and never pin the drawer.
			*/
			syncModal() {
				const dialogs = [...document.querySelectorAll("[role='dialog'][aria-modal='true']")].filter((dialog) => dialog.closest("[data-shell-overlay]") === null);
				const settings = dialogs.find((dialog) => dialog.querySelector(":scope > nav") !== null) ?? null;
				if (settings !== this.modal) {
					this.modal?.removeAttribute(SETTINGS_TAG);
					this.modal = settings;
					settings?.setAttribute(SETTINGS_TAG, "");
				}
				document.documentElement.toggleAttribute("data-dsh-modal-open", dialogs.length > 0);
			}
			syncForm = () => {
				const matches = this.media === null ? window.innerWidth <= 767 : this.media.matches;
				document.documentElement.toggleAttribute("data-dsh-mobile-form", matches);
			};
			syncFrame = () => {
				const frame = document.querySelector("[data-rightbar-col]")?.parentElement ?? null;
				if (frame === this.frame) return;
				this.frame?.removeAttribute(FRAME_TAG);
				this.frame = frame;
				frame?.setAttribute(FRAME_TAG, "");
			};
		};
		//#endregion
		//#region src/client/enter-guard.ts
		/**
		* EnterGuard: mobile-form Enter-key semantics.
		*
		* On the phone soft keyboard the Enter (newline) key fires a plain keydown
		* Enter — upstream InputBar treats it as submit (keyboard.submit), and there
		* is no Shift to fall back on. This guard, on the mobile form only
		* (viewport <= MOBILE_FORM_MAX_WIDTH), intercepts a plain Enter inside the
		* composer's editable at document capture phase — before React's root
		* listener — and turns it into a line break, leaving the send button as the
		* only send channel.
		*
		* The editable is upstream's Lexical contenteditable since 0.1.5 (the
		* pre-0.1.5 composer was a textarea), and Lexical's own line break is reached
		* through the Shift+Enter gesture: the composer keymap returns false for
		* shiftKey and lets @lexical/plain-text insert the break. The guard therefore
		* re-dispatches the swallowed Enter as Shift+Enter on the same element instead
		* of writing text itself. Dropping the textarea assumption is what kept this
		* guard alive across the 0.1.5 upgrade: a textarea-only check silently turned
		* every soft-keyboard Enter back into a submit (measured 2026-09-10 on MuMu,
		* WebView 110: composer innerText was empty after Enter and the message had
		* been sent).
		*
		* Guards that must stay untouched:
		* - IME composition (isComposing / keyCode 229): the candidate-confirm Enter.
		* - Open command/reference menu ([role=listbox]): Enter picks the highlighted item.
		* - Shift+Enter (external keyboards): upstream native newline.
		* - Desktop/wide viewport: upstream behavior unchanged.
		*/
		/** The composer's own editable: upstream's Lexical host, or the pre-0.1.5 textarea. */
		const COMPOSER_EDITABLE = "[contenteditable=\"true\"], textarea";
		/**
		* 中文 IME 的候选确认键常落在 compositionend **之后**几毫秒（apk #182-3）。
		* 那段时间里 `isComposing=false` 且 keyCode 不是 229，只看这两条会把「确认候选」误判成
		* 「用户按了换行」→ 被改发 Shift+Enter，多插一个换行。上游 keymap 用 `recentlyComposing`
		* 补这一档，这里对齐同样的宽限窗。
		*/
		const COMPOSITION_GRACE_MS = 10;
		var EnterGuard = class {
			lastCompositionEndAt = 0;
			onCompositionEnd = () => {
				this.lastCompositionEndAt = Date.now();
			};
			onKeyDown = (event) => {
				if (event.key !== "Enter" || event.shiftKey) return;
				if (event.isComposing || event.keyCode === 229) return;
				if (Date.now() - this.lastCompositionEndAt <= COMPOSITION_GRACE_MS) return;
				const target = event.target;
				if (!(target instanceof HTMLElement)) return;
				const card = target.closest("[data-composer-card]");
				if (card === null) return;
				const editable = target.closest(COMPOSER_EDITABLE);
				if (editable === null || !card.contains(editable)) return;
				if (document.querySelector("[role=\"listbox\"]") !== null) return;
				if (window.innerWidth > 767) return;
				event.stopPropagation();
				event.preventDefault();
				if (editable instanceof HTMLTextAreaElement) {
					try {
						document.execCommand("insertText", false, "\n");
					} catch {}
					return;
				}
				try {
					editable.dispatchEvent(new KeyboardEvent("keydown", {
						key: "Enter",
						code: "Enter",
						shiftKey: true,
						bubbles: true,
						cancelable: true
					}));
				} catch {}
			};
			attach() {
				document.addEventListener("keydown", this.onKeyDown, { capture: true });
				document.addEventListener("compositionend", this.onCompositionEnd, { capture: true });
			}
			detach() {
				document.removeEventListener("keydown", this.onKeyDown, { capture: true });
				document.removeEventListener("compositionend", this.onCompositionEnd, { capture: true });
			}
		};
		//#endregion
		//#region src/client/keyboard-boundary.ts
		/**
		* KeyboardBoundary (issue #57): Android 16 edge-to-edge WebViews do not
		* shrink the layout viewport when the soft keyboard opens (adjustResize
		* does not resize the WebView content; visualViewport shrinks but
		* innerHeight stays 758). The frame (height: 100%, upstream ui-layout's root
		* grid) therefore extends under the keyboard, and its scrollable content leaves
		* a blank band below the composer — swiping up past the input reveals empty
		* black.
		*
		* Fix: while the IME inset is non-zero, pin the mobile frame's height to the
		* visualViewport height (the keyboard's top edge). The frame's overflow:
		* hidden then clips the blank band instead of letting it scroll into view.
		* Restored to 100% when the keyboard closes.
		*
		* The composer seat (position: sticky; bottom: 0) normally relies on
		* composer-insets.css.ts padding-bottom = --dsh-android-ime-bottom to lift
		* the input above the keyboard while the frame keeps its full height. Once
		* this class pins the frame to the keyboard top edge, that same padding
		* becomes redundant and inflates the seat past its sticky container (seat
		* height > scrollBody height makes the sticky bottom anchor inert and the
		* composer drifts to the top of the viewport). While pinned, the seat's
		* padding-bottom is therefore zeroed; it is restored on keyboard close.
		*/
		var KeyboardBoundary = class {
			frame = null;
			seat = null;
			media = null;
			lastIme = 0;
			lastVv = 0;
			/** 上次补偿用的视觉视口平移量（#197 机制①第二道防线）。 */
			lastVvTop = 0;
			/** 收敛代次（#197 机制②）：新事件打断旧的复算链，避免过期复算覆盖新状态。 */
			settleGeneration = 0;
			/** 延迟复算的定时器句柄（detach 时清掉；jsdom 测试结束后残留回调会报错）。 */
			settleTimer = null;
			/** 已卸载标记：卸载后任何延迟回调都必须直接返回（宿主可能已销毁 window/document）。 */
			detached = false;
			/** Watch visualViewport resize + scroll + the shell's IME inset variable. */
			attach() {
				this.detached = false;
				window.visualViewport?.addEventListener("resize", this.onViewportChange);
				window.visualViewport?.addEventListener("scroll", this.onViewportChange);
				this.media = typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 767px)") : null;
				this.media?.addEventListener?.("change", this.onViewportChange);
				this.onViewportChange();
			}
			/** Remove listeners and restore the frame and seat styles. */
			detach() {
				this.detached = true;
				if (this.settleTimer !== null) {
					window.clearTimeout(this.settleTimer);
					this.settleTimer = null;
				}
				window.visualViewport?.removeEventListener("resize", this.onViewportChange);
				window.visualViewport?.removeEventListener("scroll", this.onViewportChange);
				this.media?.removeEventListener?.("change", this.onViewportChange);
				this.restore();
			}
			onViewportChange = () => {
				const frame = document.querySelector("[data-dsh-frame]");
				if (frame === null) return;
				this.frame = frame;
				this.apply(frame);
				const generation = ++this.settleGeneration;
				const settle = () => {
					if (this.detached || generation !== this.settleGeneration) return;
					try {
						this.apply(frame);
					} catch {}
				};
				requestAnimationFrame(settle);
				this.settleTimer = window.setTimeout(() => {
					this.settleTimer = null;
					settle();
				}, 260);
			};
			/** 按当前 IME inset 与可视视口高度决定钉住还是还原（可重复调用，幂等）。 */
			apply(frame) {
				const rootStyle = getComputedStyle(document.documentElement);
				const ime = Number.parseFloat(rootStyle.getPropertyValue("--dsh-android-ime-bottom")) || 0;
				const vv = window.visualViewport;
				const vvHeight = vv === null ? 0 : Math.round(vv.height);
				const rawTop = vv === null ? 0 : Number(vv.offsetTop);
				const vvTop = Number.isFinite(rawTop) ? Math.max(0, Math.round(rawTop)) : 0;
				if (ime > 0 && vvHeight > 0 && (ime !== this.lastIme || vvHeight !== this.lastVv || vvTop !== this.lastVvTop)) {
					this.lastIme = ime;
					this.lastVv = vvHeight;
					this.lastVvTop = vvTop;
					frame.style.height = `${vvHeight + vvTop}px`;
					const seat = document.querySelector("[data-composer-seat]");
					if (seat !== null) {
						this.seat = seat;
						seat.style.paddingBottom = "0px";
					}
				} else if (ime === 0 && (this.lastIme !== 0 || frame.style.height !== "")) this.restore();
			}
			/** Restore the natural frame height and seat padding. */
			restore() {
				if (this.frame !== null) this.frame.style.height = "";
				this.frame = null;
				if (this.seat !== null) this.seat.style.paddingBottom = "";
				this.seat = null;
				this.lastIme = 0;
				this.lastVv = 0;
				this.lastVvTop = 0;
			}
		};
		//#endregion
		//#region src/client/export-result.ts
		/** Host-owned channel: the plugin writes, the dialog component reads. */
		var ExportResultChannel = class {
			listeners = /* @__PURE__ */ new Set();
			snapshot = {
				open: false,
				ok: true,
				title: "",
				detail: ""
			};
			/** @returns the current dialog state. */
			getSnapshot = () => this.snapshot;
			/**
			* @param listener - change observer.
			* @returns its disposer.
			*/
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			};
			/**
			* Open the dialog with one outcome; a second result supersedes a still-open first.
			* @param payload - the outcome to show.
			*/
			show(payload) {
				this.snapshot = {
					open: true,
					ok: payload.ok,
					title: payload.title,
					detail: payload.detail
				};
				this.publish();
			}
			/** Fold the dialog; the last result stays recorded. */
			close() {
				this.snapshot = {
					...this.snapshot,
					open: false
				};
				this.publish();
			}
			publish() {
				for (const listener of [...this.listeners]) listener();
			}
		};
		/**
		* Report one user-facing outcome through the shell-overlay dialog.
		*
		* The dialog entry subscribes to the `dsh:export-result` DOM event, which the
		* shell's export bridge and this plugin's own native-action failures both use:
		* one surface, one dismissal, no second dialog implementation.
		* @param payload - the outcome to show.
		*/
		function reportUserFacingResult(payload) {
			window.dispatchEvent(new CustomEvent("dsh:export-result", { detail: payload }));
		}
		//#endregion
		//#region src/client/mobile/mobile-form.css.ts
		/**
		* The phone form (<768px) over the upstream frame.
		*
		* Upstream keeps ownership of the frame, the columns, and both sidebars; this
		* sheet only re-shapes them for a phone:
		* - the left sidebar becomes an off-canvas drawer (its collapsed rail steps
		*   aside with it; the top bar's toggle is the entry, and the rail's own
		*   toggle keeps working from inside the drawer);
		* - the centre column spans the whole frame and pads under that top bar;
		* - the right column keeps its zero-width track so the upstream panel (already
		*   fullscreen below 768px of frame width) hangs over the centre as a
		*   slide-over, with the system insets respected;
		* - the desktop drag handles are touch noise and step aside.
		*
		* The frame's track widths are inline styles, so the grid override must be
		* `!important`. Children are placed explicitly: with the sidebar out of flow,
		* auto-placement would otherwise drop the centre column into the first track.
		*/
		const MOBILE_FORM_CSS = `
:root {
  --dsh-mobile-top-inset: max(env(safe-area-inset-top, 0px), var(--dsh-android-system-top, 0px));
  --dsh-mobile-topbar-height: 44px;
}

html:is([data-dsh-mobile-form], [data-dsh-fold-workbench]) {
  [data-dsh-frame] {
    grid-template-columns: 0 minmax(0, 1fr) 0 !important;
  }

  [data-dsh-frame] > [class*='sidebarCol'] {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    width: min(288px, 82vw);
    z-index: 30;
    background: var(--dsw-specific-sidebar-fill);
    transform: translateX(-100%);
    transition: transform var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease);
    /* 顶部安全区（2026-09-11 真机反馈）：关闭沉浸式状态栏时抽屉全高贴顶，上游侧栏的品牌行
       （logo）被状态栏盖住；这里与右栏/中栏用同一个 inset 变量（沉浸式打开时为 0，不影响布局）。 */
    padding-top: var(--dsh-mobile-top-inset, 0px);
    /* 底部安全区（apk #153 / PR #157）：抽屉全高贴底时，底部用户栏里的设置入口与系统手势条
       重叠，点击被拦截。与 composer-insets 的底部 inset 取值保持一致。 */
    padding-bottom: max(env(safe-area-inset-bottom, 0px), var(--dsh-android-system-bottom, 0px));
  }

  [data-dsh-frame]:not([data-sidebar-collapsed]) > [class*='sidebarCol'] {
    transform: none;
  }

  /* The settings overlay renders inside the sidebar subtree: a translated
     (off-canvas) ancestor would carry it off-screen. While any modal outside
     the frame's own overlay layer is up, the drawer stays on screen. */
  html[data-dsh-modal-open] [data-dsh-frame] > [class*='sidebarCol'] {
    transform: none;
  }

  [data-dsh-frame] > [class*='centerCol'] {
    grid-column: 1 / -1;
    padding-top: calc(var(--dsh-mobile-topbar-height) + var(--dsh-mobile-top-inset, 0px));
  }

  [data-dsh-frame] > [class*='rightbarCol'] {
    grid-column: 3;
  }

  [data-dsh-frame] [class*='handle'] {
    display: none;
  }

  [data-sidebar-right-panel='fullscreen'] {
    box-sizing: border-box;
    padding-top: var(--dsh-mobile-top-inset, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
}

@media (prefers-reduced-motion: reduce) {
  [data-dsh-frame] > [class*='sidebarCol'] {
    transition: none;
  }
}
`;
		//#endregion
		//#region \0dsh-css:src/client/mobile/MobileChrome.module.css.mjs
		const css$2 = ".qPD0FW_root{pointer-events:none;z-index:25;position:absolute;inset:0}.qPD0FW_bar,.qPD0FW_mask{display:none}html:is([data-dsh-mobile-form],[data-dsh-fold-workbench]){& .qPD0FW_bar{box-sizing:border-box;height:calc(var(--dsh-mobile-topbar-height,44px) + var(--dsh-mobile-top-inset,0px));padding:var(--dsh-mobile-top-inset,0px) 4px 0;background:var(--dsw-specific-sidebar-fill);border-bottom:1px solid var(--dsw-alias-border-l1);pointer-events:auto;z-index:26;align-items:center;display:flex;position:absolute;top:0;left:0;right:0}& .qPD0FW_toggle{width:44px;height:44px;color:var(--dsw-alias-text-l1);cursor:pointer;touch-action:manipulation;background:0 0;border:none;border-radius:10px;flex:none;justify-content:center;align-items:center;display:inline-flex}& .qPD0FW_toggle:active{background:var(--dsw-alias-button-floating-fill)}& .qPD0FW_mask{opacity:0;pointer-events:none;transition:opacity var(--ds-transition-duration-slow,.2s) var(--ds-ease-in-out,ease);z-index:25;background:#00000073;display:block;position:absolute;inset:0}& .qPD0FW_mask[data-open]{opacity:1;pointer-events:auto}}@media (prefers-reduced-motion:reduce){.qPD0FW_mask{transition:none}}";
		const tagId$2 = "@dsh-android/dsh-client-ui-responsive/MobileChrome.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh-android/dsh-client-ui-responsive";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var MobileChrome_module_css_default = {
			"mask": "qPD0FW_mask",
			"bar": "qPD0FW_bar",
			"toggle": "qPD0FW_toggle",
			"root": "qPD0FW_root"
		};
		//#endregion
		//#region src/client/mobile/MobileChrome.tsx
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
		/** Copy (the Android layer's product strings are Chinese; see DevSection/ExportResultDialog). */
		const TOGGLE_OPEN = "打开导航";
		const TOGGLE_CLOSE = "关闭导航";
		/** The frame root, tagged by the form marker; the right column identifies it before the tag lands. */
		function frameElement() {
			return document.querySelector("[data-dsh-frame]") ?? document.querySelector("[data-rightbar-col]")?.parentElement ?? null;
		}
		/**
		* Mirror whether the left sidebar is expanded.
		* @returns true while the frame renders the sidebar opened.
		*/
		function useSidebarOpen() {
			const [open, setOpen] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				let frame = null;
				let frameObserver = null;
				const sync = () => {
					setOpen(frame !== null && !frame.hasAttribute("data-sidebar-collapsed"));
				};
				const bind = () => {
					frame = frameElement();
					if (frame === null) return false;
					frameObserver = new MutationObserver(sync);
					frameObserver.observe(frame, {
						attributes: true,
						attributeFilter: ["data-sidebar-collapsed"]
					});
					sync();
					return true;
				};
				if (bind()) return () => {
					frameObserver?.disconnect();
				};
				const waitObserver = new MutationObserver(() => {
					if (bind()) waitObserver.disconnect();
				});
				waitObserver.observe(document.documentElement, {
					childList: true,
					subtree: true
				});
				return () => {
					waitObserver.disconnect();
					frameObserver?.disconnect();
				};
			}, []);
			return open;
		}
		/**
		* The phone form's top bar with the sidebar toggle, plus the drawer mask.
		* @param props - runtime share (unused) and the injected toggle.
		* @returns the chrome, or the hidden shell when the phone form is off.
		*/
		function MobileChrome({ toggleSidebar }) {
			const open = useSidebarOpen();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: MobileChrome_module_css_default.root,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: MobileChrome_module_css_default.mask,
					"data-open": open || void 0,
					"data-dsh-mobile-mask": "",
					onClick: () => {
						toggleSidebar();
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: MobileChrome_module_css_default.bar,
					"data-dsh-mobile-topbar": "",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: MobileChrome_module_css_default.toggle,
						"aria-label": open ? TOGGLE_CLOSE : TOGGLE_OPEN,
						"aria-expanded": open,
						onClick: () => {
							toggleSidebar();
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
							width: "18",
							height: "18",
							viewBox: "0 0 18 18",
							"aria-hidden": "true",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
								d: "M7 3v12M3 3h12v12H3Z",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "1.6",
								strokeLinecap: "round"
							})
						})
					})
				})]
			});
		}
		//#endregion
		//#region src/client/mobile/open-path.ts
		/**
		* Whether the running host can raise the native chooser.
		* @returns true when the shell injected the method.
		*/
		function chooserAvailable() {
			return typeof window.androidBridge?.openPathChooser === "function";
		}
		/**
		* Ask the shell to open a path through the system chooser.
		* @param path - absolute device path.
		* @param mode - `folder` targets file managers on the directory, `view` on the file.
		* @returns the shell's outcome; `{ ok: false, reason: 'unavailable' }` without a shell.
		*/
		function openPathChooser(path, mode = "view") {
			const bridge = window.androidBridge;
			if (typeof bridge?.openPathChooser !== "function") return {
				ok: false,
				reason: "unavailable"
			};
			try {
				const raw = bridge.openPathChooser(path, mode);
				if (typeof raw !== "string" || raw === "") return {
					ok: false,
					reason: "empty-answer"
				};
				const answer = JSON.parse(raw);
				if (answer.ok === true) return { ok: true };
				return {
					ok: false,
					reason: typeof answer.reason === "string" ? answer.reason : "refused"
				};
			} catch (error) {
				return {
					ok: false,
					reason: error instanceof Error ? error.message : "bridge-error"
				};
			}
		}
		//#endregion
		//#region src/client/mobile/session-cwd.ts
		/**
		* Read one Session's workspace directory.
		* @param state - the runtime's session-list snapshot.
		* @param sessionId - the Session whose summary is read.
		* @returns the directory, or `undefined` when the summary lacks one.
		*/
		function sessionCwd(state, sessionId) {
			const cwd = state.byId?.[sessionId]?.cwd;
			return typeof cwd === "string" && cwd !== "" ? cwd : void 0;
		}
		//#endregion
		//#region \0dsh-css:src/client/mobile/OpenInFileManagerAction.module.css.mjs
		const css$1 = ".LX5Q1G_button{width:28px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:28px;flex:none;justify-content:center;align-items:center;padding:0;line-height:1;display:inline-flex}.LX5Q1G_button:hover,.LX5Q1G_button:active{background:var(--dsw-alias-interactive-bg-hover)}";
		const tagId$1 = "@dsh-android/dsh-client-ui-responsive/OpenInFileManagerAction.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh-android/dsh-client-ui-responsive";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var OpenInFileManagerAction_module_css_default = { "button": "LX5Q1G_button" };
		//#endregion
		//#region src/client/mobile/OpenInFileManagerAction.tsx
		/** Label used for both the accessible name and the tooltip. */
		const LABEL = "在文件中打开";
		/**
		* The header button.
		* @param props - the session-scoped utility share.
		* @returns the button, or null when the host cannot open paths.
		*/
		function OpenInFileManagerAction({ sessionId, useSessions }) {
			const cwd = useSessions((state) => sessionCwd(state, sessionId));
			if (!chooserAvailable() || cwd === void 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: OpenInFileManagerAction_module_css_default.button,
				"aria-label": LABEL,
				title: LABEL,
				onClick: () => {
					const result = openPathChooser(cwd, "folder");
					if (!result.ok) reportUserFacingResult({
						ok: false,
						title: "无法打开文件管理器",
						detail: result.reason === "no-handler" ? "设备上没有可用的文件管理器应用。" : `调用系统选择器失败（${result.reason ?? "unknown"}）。`
					});
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
					width: "16",
					height: "16",
					viewBox: "0 0 16 16",
					"aria-hidden": "true",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M1.75 4.25c0-.55.45-1 1-1h3.1c.3 0 .58.13.77.36l.86 1.03h5.77c.55 0 1 .45 1 1v6.11c0 .55-.45 1-1 1H2.75c-.55 0-1-.45-1-1V4.25Z",
						fill: "none",
						stroke: "currentColor",
						strokeWidth: "1.2",
						strokeLinejoin: "round"
					})
				})
			});
		}
		//#endregion
		//#region src/client/mobile/address.ts
		/** The scheme and type every file address opens with. */
		const FILE_ADDRESS_PREFIX = "dsh-resource://file/";
		/** Whether a decoded first segment is a Windows drive (`C:`). */
		function isDriveSegment(segment) {
			return segment !== void 0 && /^[A-Za-z]:$/.test(segment);
		}
		/**
		* Read a file address back into its parts.
		* @param address - a candidate address.
		* @returns the parts, or `undefined` when the string is not a file address in a known scope or a segment is malformed.
		*/
		function parseFileAddress(address) {
			try {
				if (!address.startsWith(FILE_ADDRESS_PREFIX)) return void 0;
				const end = address.search(/[?#]/);
				const [scope, ...rest] = address.slice(20, end === -1 ? void 0 : end).split("/");
				if (scope === "session") {
					const [id, ...segments] = rest;
					if (id === void 0 || id === "" || segments.length === 0) return void 0;
					return {
						scope,
						sessionId: decodeURIComponent(id),
						path: segments.map(decodeURIComponent).join("/")
					};
				}
				if (scope === "absolute") {
					const unc = rest[0] === "" && rest.length > 1;
					const segments = (unc ? rest.slice(1) : rest).map(decodeURIComponent);
					if (segments.length === 0 || segments[0] === "") return void 0;
					if (unc) return {
						scope,
						path: `//${segments.join("/")}`
					};
					return {
						scope,
						path: isDriveSegment(segments[0]) ? segments.join("/") : `/${segments.join("/")}`
					};
				}
				return;
			} catch {
				return;
			}
		}
		/**
		* Resolve a parsed address to the absolute device path the shell can open.
		* @param parsed - the parsed address.
		* @param sessionRoot - the Session's workspace directory, from its summary.
		* @returns the absolute path, or `undefined` when a relative path has no known root.
		*/
		function resolveAbsolutePath(parsed, sessionRoot) {
			if (parsed.scope === "absolute") return parsed.path;
			if (parsed.path.startsWith("/")) return parsed.path;
			if (sessionRoot === void 0 || sessionRoot === "") return void 0;
			const root = sessionRoot.replace(/\/+$/, "");
			return parsed.path === "" ? root : `${root}/${parsed.path}`;
		}
		//#endregion
		//#region src/client/mobile/external-open-paths.ts
		/** This type's identity: the registry id and the key its body registers under. */
		const EXTERNAL_OPEN_ID = "@dsh-android/client-ui-responsive/open-with";
		/** This type's kind discriminator. */
		const EXTERNAL_OPEN_KIND = "open-with";
		/** The address family this type claims. */
		const FILE_ADDRESS_PATTERN = "dsh-resource://file/**";
		/**
		* Suffixes whose content is not text and has no preview renderer, so the phone
		* answer is "hand it to another application": archives, Android/iOS packages,
		* disk images, installers, databases, machine code, fonts.
		*/
		const EXTERNAL_ONLY_EXTENSIONS = [
			"7z",
			"a",
			"aab",
			"aar",
			"apk",
			"apks",
			"bin",
			"bz2",
			"cab",
			"class",
			"dat",
			"db",
			"deb",
			"dex",
			"dll",
			"dmg",
			"dylib",
			"exe",
			"gz",
			"img",
			"iso",
			"jar",
			"lz4",
			"lzma",
			"msi",
			"msix",
			"o",
			"pak",
			"rar",
			"rpm",
			"so",
			"sqlite",
			"sqlite3",
			"tar",
			"tgz",
			"ttf",
			"otf",
			"wasm",
			"xapk",
			"xz",
			"zip",
			"zst"
		];
		/**
		* The lowercase suffix of a path, without its dot.
		* @param path - decoded file path.
		* @returns the suffix, or an empty string when the name has none.
		*/
		function extensionOf(path) {
			const name = path.replace(/\\/g, "/").split("/").pop() ?? "";
			const dot = name.lastIndexOf(".");
			return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
		}
		/**
		* Whether a path's content has no preview and belongs to another application.
		* @param path - decoded file path.
		* @returns true for the curated suffix list.
		*/
		function isExternalOnlyPath(path) {
			return EXTERNAL_ONLY_EXTENSIONS.includes(extensionOf(path));
		}
		/**
		* The decoded last segment of an address, used as the tab's chip title.
		* @param address - a `dsh-resource://file/…` address.
		* @returns the decoded name, or the address when it has no segment.
		*/
		function basenameOf(address) {
			const name = address.slice(address.lastIndexOf("/") + 1);
			if (name === "") return address;
			try {
				return decodeURIComponent(name);
			} catch {
				return name;
			}
		}
		/**
		* The type's registry definition.
		* @param claimedByAnother - asks the registry whether a builtin or extension type already welcomes the address.
		* @returns the definition to register.
		*/
		function externalOpenDefinition(claimedByAnother) {
			return {
				id: EXTERNAL_OPEN_ID,
				kind: EXTERNAL_OPEN_KIND,
				patterns: [FILE_ADDRESS_PATTERN],
				priority: "extension",
				canOpen: (address) => {
					const parsed = parseFileAddress(address);
					if (parsed === void 0) return false;
					if (parsed.scope === "absolute") return true;
					if (!isExternalOnlyPath(parsed.path)) return false;
					return !claimedByAnother(address);
				},
				title: basenameOf
			};
		}
		//#endregion
		//#region \0dsh-css:src/client/mobile/ExternalOpen.module.css.mjs
		const css = ".KSQr-q_card{flex-direction:column;gap:8px;min-width:0;padding:16px;display:flex}.KSQr-q_name{font-size:var(--dsh-content-font-size-primary,14px);color:var(--dsw-alias-text-l1);overflow-wrap:anywhere;margin:0}.KSQr-q_path{font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, monospace);font-size:var(--dsh-content-font-size-secondary,13px);color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;margin:0}.KSQr-q_hint{font-size:var(--dsh-content-font-size-secondary,13px);color:var(--dsw-alias-label-tertiary);margin:0}.KSQr-q_actions{flex-wrap:wrap;gap:8px;margin-top:4px;display:flex}.KSQr-q_primary,.KSQr-q_secondary{border:1px solid var(--dsw-alias-border-l1);font-size:var(--dsh-content-font-size-secondary,13px);cursor:pointer;touch-action:manipulation;border-radius:10px;flex:none;padding:8px 14px}.KSQr-q_primary{color:var(--dsw-alias-text-l1);background:var(--dsw-alias-interactive-bg-hover)}.KSQr-q_secondary{color:var(--dsw-alias-text-l1);background:0 0}.KSQr-q_failure{font-size:var(--dsh-content-font-size-secondary,13px);color:var(--dsw-alias-error-text,#e5484d);margin:4px 0 0}";
		const tagId = "@dsh-android/dsh-client-ui-responsive/ExternalOpen.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh-android/dsh-client-ui-responsive";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var ExternalOpen_module_css_default = {
			"primary": "KSQr-q_primary",
			"secondary": "KSQr-q_secondary",
			"failure": "KSQr-q_failure",
			"hint": "KSQr-q_hint",
			"name": "KSQr-q_name",
			"actions": "KSQr-q_actions",
			"card": "KSQr-q_card",
			"path": "KSQr-q_path"
		};
		//#endregion
		//#region src/client/mobile/external-open.tsx
		/**
		* "Open with" tab body: what the right Sidebar shows for a file no preview can
		* render (archives, packages, binaries, installers). The type's claims live in
		* `external-open-paths.ts`; this file is only the card and its two gestures.
		*
		* The body reads no file content: it names the file and hands the absolute
		* device path to the shell's native chooser, so opening a 200 MB archive costs
		* nothing.
		*/
		/** The directory holding a path (the chooser's `folder` target). */
		function parentDirectory(path) {
			const cut = path.replace(/\/+$/, "").lastIndexOf("/");
			return cut <= 0 ? path : path.slice(0, cut);
		}
		/**
		* The tab body: name the file, then hand it to the system chooser.
		* @param props - the session-scoped tab share (runtime hooks + the tab reader).
		* @returns the card, or an explanation when this host cannot open paths.
		*/
		function ExternalOpenTab({ sessionId, useSessions, useTabInfo }) {
			const info = useTabInfo();
			const cwd = useSessions((state) => sessionCwd(state, sessionId));
			const address = info.tab.navigation.address;
			const parsed = parseFileAddress(address);
			const absolute = parsed === void 0 ? void 0 : resolveAbsolutePath(parsed, cwd);
			const [failure, setFailure] = (0, react.useState)(null);
			const hand = (target, mode) => {
				const result = openPathChooser(target, mode);
				if (result.ok) {
					setFailure(null);
					return;
				}
				const next = result.reason === "no-handler" ? {
					title: "没有可用的文件管理器",
					detail: "设备上没有能打开该路径的应用，可先安装 MT 管理器。"
				} : {
					title: "打开失败",
					detail: `调用系统选择器失败（${result.reason ?? "unknown"}）。`
				};
				setFailure(next);
				reportUserFacingResult({
					ok: false,
					...next
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: ExternalOpen_module_css_default.card,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: ExternalOpen_module_css_default.name,
						children: basenameOf(address)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: ExternalOpen_module_css_default.path,
						children: absolute ?? address
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: ExternalOpen_module_css_default.hint,
						children: "该格式没有内置预览，可交给设备上的应用打开。"
					}),
					chooserAvailable() && absolute !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: ExternalOpen_module_css_default.actions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: ExternalOpen_module_css_default.primary,
							onClick: () => {
								hand(parentDirectory(absolute), "folder");
							},
							children: "打开所在文件夹"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: ExternalOpen_module_css_default.secondary,
							onClick: () => {
								hand(absolute, "view");
							},
							children: "用其它应用打开"
						})]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: ExternalOpen_module_css_default.hint,
						children: absolute === void 0 ? "无法确定该文件的设备路径。" : "当前宿主不支持调用系统应用。"
					}),
					failure !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: ExternalOpen_module_css_default.failure,
						children: [
							failure.title,
							"：",
							failure.detail
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/mobile/settings-document.ts
		/**
		* Mobile takeover of the upstream "open configuration file" settings action (apk #152).
		*
		* Upstream renders that action while the settings dialog is open and, on click, calls
		* `settings.openSettingsDocument()`: the Host materializes the provider-owned document and
		* hands it to a native desktop text editor (mac/win/linux). Android has no such opener, so the
		* click always ended in the localized 「无法打开配置文件」 error.
		*
		* The shell can open any path the app is allowed to read through its system chooser
		* (`androidBridge.openPathChooser`), and the settings document path is a fixed app-private
		* location the shell can report (`androidBridge.settingsPath`). This handler claims the click
		* while the settings dialog is up and routes it there; when either bridge is missing, or the
		* chooser refuses, the event is left alone so upstream behavior (and its error message) stays.
		*/
		/** Upstream action labels this handler claims (zh / en dictionaries). */
		const ACTION_LABELS = ["打开配置文件", "Open configuration file"];
		/** Read the settings document path from the shell bridge; empty when unavailable. */
		function settingsPath() {
			const bridge = window.androidBridge;
			if (typeof bridge?.settingsPath !== "function") return "";
			try {
				return bridge.settingsPath() || "";
			} catch {
				return "";
			}
		}
		/**
		* apk #168 的关键一步：优先用**壳侧导出的副本**路径。
		*
		* 活动配置在私有 `$DSH_HOME`，而选择器白名单（与 FileProvider 映射）刻意不包括 `.dsh`——
		* 那里有 `.credentials.yaml` 等凭据，放宽等于把凭据交给系统选择器。所以壳侧先把 settings.yaml
		* 复制到已放行的 `Documents/dshdata/exports/config/`，页面打开的是这份副本（UI 文案已说明）。
		* 副本拿不到时才退回旧路径（私有路径会被白名单拒绝，届时仍走上游错误路径）。
		*/
		function settingsPathForChooser() {
			const bridge = window.androidBridge;
			if (typeof bridge?.exportSettingsDocument === "function") try {
				const exported = bridge.exportSettingsDocument() || "";
				if (exported !== "") return exported;
			} catch {}
			return settingsPath();
		}
		/** Whether the clicked element is the upstream open-configuration-file action. */
		function isSettingsDocumentAction(target) {
			if (!(target instanceof Element)) return false;
			const button = target.closest("button");
			if (button === null) return false;
			if (button.closest("[data-dsh-settings-dialog]") === null) return false;
			const label = (button.textContent ?? "").trim();
			return ACTION_LABELS.includes(label);
		}
		/** Claims the upstream action and opens the settings document through the shell chooser. */
		var SettingsDocumentAction = class {
			onClick = (event) => {
				if (!chooserAvailable()) return;
				if (!isSettingsDocumentAction(event.target)) return;
				const path = settingsPathForChooser();
				if (path === "") return;
				if (!openPathChooser(path, "view").ok) return;
				event.preventDefault();
				event.stopPropagation();
			};
			attach() {
				document.addEventListener("click", this.onClick, true);
			}
			detach() {
				document.removeEventListener("click", this.onClick, true);
			}
		};
		//#endregion
		//#region src/client/mobile/reference-menu.ts
		/**
		* Mobile reference-menu enhancer (apk #163 / 多选 chrome 审计 apk #169)。
		*
		* Upstream's `@` menu gives a directory row two verbs: the row body settles the pick (the folder
		* itself becomes an atomic reference and the menu closes) while only the ~14px trailing chevron
		* (or Tab) drills into it. That is fine with a mouse and keyboard; on a phone the chevron is a
		* poor target, so tapping a folder row referenced the folder and the user never reached the
		* files inside — reported as "the @ feature is unusable" (#150 / #144 / #163).
		*
		* The row-body behavior itself is fixed one layer down, in the engine tree: patch
		* `reference-drill-F6` makes the mobile form's directory rows settle into the folder. This
		* enhancer therefore owns only the multi-select chrome.
		*
		* ## 0.13.8（本版按审计 #169 的六条逐条修）
		*
		* 1. **勾选态落地**：状态挂在**行元素**上（`data-dsh-ref-on`），视觉 100% 由 CSS 从该属性派生；
		*    没有任何 JS「视觉同步」步骤，因此不存在「集合已选中而方框未勾」的失配窗口。
		* 2. **不再有无界 rAF/DOM 抖动**：`renderBar()` 幂等——节点只建一次，之后只改文本；
		*    绝不 `innerHTML=''` 重建（旧实现在选中期间每帧重建 → 触发 observer → 再重建）。
		* 3. **不再静默丢弃选择**：多选插入逐个进行，某个候选找不到时**保留剩余选择**并在底部条
		*    如实报告「已插入 k 项 / m 项未找到（可能已下钻目录）」，不再无声清空。
		* 4. **移动形态门**：非移动形态（宽视口 / 桌面模式）直接不注入——审计指出旧实现会在宽视口
		*    装一套手机专用 chrome，而此时 F6 不生效，形成未验证的第三种行为。
		* 5. **稳定身份**：多选键是「标签 + 同标签内序号」（`data-dsh-ref-key`），不是裸显示文本——
		*    同名文件/同名会话不再互相塌缩；已存在的键优先保留，列表变化时不打散已选项。
		* 6. **按行去抖 + 关菜单即清态**：去抖按「目标行」而非全局时间戳（400ms 内点第二行不再被吞）；
		*    菜单关闭时清空集合与底部条，重开不会出现幻影「已选 N 项」。
		*/
		const ROW_SELECTOR = "[data-trigger-menu] [role=\"option\"]";
		const MENU_SELECTOR$1 = "[data-trigger-menu]";
		const CHECK_ATTR = "data-dsh-ref-check";
		/** 选中标记（**视觉状态的唯一来源**：属性是状态，样式是后果，由 CSS 消费）。 */
		const ON_ATTR = "data-dsh-ref-on";
		/** 多选键（稳定身份：标签 + 同标签内序号），挂在行上。 */
		const KEY_ATTR = "data-dsh-ref-key";
		const BAR_ATTR = "data-dsh-ref-bar";
		const COUNT_ATTR = "data-dsh-ref-bar-count";
		const ADD_ATTR = "data-dsh-ref-add";
		/** Gesture kinds one tap can arrive as; only the first of an interaction acts. */
		const GESTURES = [
			"pointerdown",
			"mousedown",
			"click"
		];
		/** 同一行的一次点按（pointerdown + mousedown + click）折叠成一个动作的时间窗。 */
		const ROW_DEBOUNCE_MS = 400;
		/** 移动形态门（与 form-marker.ts 的 767px 单一来源一致）。 */
		const MOBILE_QUERY = "(max-width: 767px)";
		/** 品牌蓝。**不取 `--dsw-alias-brand-primary`**：该 token 在深色主题下实测解析为
		*  rgb(249,250,251)（近白），当底色配白字就是「白底白字不可见」。 */
		const BRAND = "#4d6bfe";
		/**
		* 勾选框与底部条样式。
		*
		* - 勾选框用 `<span>` + CSS 画（原生 input 在深色主题里是浏览器默认方块，与上游行样式不融）；
		* - 选中态由 `[data-dsh-ref-on]` 属性派生 —— 属性是状态，样式是后果，中间没有 JS 同步步骤；
		* - 底部条的关键样式在 JS 里内联 `!important`（上游 button 默认样式会盖过注入样式表）。
		*/
		const REFERENCE_BAR_CSS = `
[data-dsh-ref-check] {
  flex: none;
  width: 18px;
  height: 18px;
  margin: 0 10px 0 2px;
  align-self: center;
  border-radius: 5px;
  border: 1.5px solid #8b909a;
  background: transparent;
  box-sizing: border-box;
  position: relative;
  transition: background-color .12s ease, border-color .12s ease;
}
[data-dsh-ref-on] [data-dsh-ref-check] {
  background: ${BRAND};
  border-color: ${BRAND};
}
[data-dsh-ref-on] [data-dsh-ref-check]::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 1.5px;
  width: 4px;
  height: 8px;
  border: solid #ffffff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
[data-dsh-ref-bar] {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid var(--dsw-alias-border-l1, #e5e5e5);
  background: var(--dsw-alias-bg-l1, #ffffff);
}
[data-dsh-ref-bar-count] {
  font-size: 13px;
  color: var(--dsw-alias-text-l2, #5f6368);
}
[data-dsh-ref-add] {
  padding: 6px 14px;
  border-radius: 8px;
  border: none;
  background: ${BRAND};
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
}
[data-dsh-ref-add]:active { filter: brightness(0.92); }
@media (prefers-color-scheme: dark) {
  [data-dsh-ref-check] { border-color: #6b7075; }
  [data-dsh-ref-bar] {
    border-top-color: var(--dsw-alias-border-l1, #2a2b30);
    background: var(--dsw-alias-bg-l1, #17181c);
  }
  [data-dsh-ref-bar-count] { color: var(--dsw-alias-text-l2, #9aa0a6); }
}
`;
		/** Read a row's candidate label (upstream renders it in the name span; fall back to text). */
		function rowLabel(row) {
			return ((row.querySelector("[class*=\"itemName\"]")?.textContent ?? row.textContent) || "").trim();
		}
		/** The composer's editable host (upstream Lexical root). */
		function composerEditable() {
			return document.querySelector("[data-composer-card] [contenteditable=\"true\"], [data-composer-card] textarea");
		}
		/** 是否移动形态（#169-4）：以页面标记或 767px 视口为准，宽视口不注入手机专用 chrome。 */
		function isMobileForm() {
			if (document.documentElement.hasAttribute("data-dsh-mobile-form")) return true;
			return typeof window.matchMedia === "function" && window.matchMedia(MOBILE_QUERY).matches;
		}
		/** Multi-select state plus the mobile-only row behavior for the reference menu. */
		var ReferenceMenuEnhancer = class {
			/** 多选集合：**稳定键**（标签 + 同标签内序号），不是裸显示文本（#169-5）。 */
			checked = /* @__PURE__ */ new Set();
			observer = null;
			/** 按行去抖（#169-6）：同一行的三连手势只动作一次，但**不**吞掉别的行。 */
			lastGesture = /* @__PURE__ */ new WeakMap();
			scheduled = false;
			onGesture = (event) => {
				if (!isMobileForm()) return;
				const target = event.target;
				if (!(target instanceof Element)) return;
				const row = target.closest(ROW_SELECTOR);
				if (row === null) return;
				if (target.closest("[data-dsh-ref-check]") === null) return;
				event.preventDefault();
				event.stopImmediatePropagation();
				event.stopPropagation();
				const now = Date.now();
				if (now - (this.lastGesture.get(row) ?? 0) < ROW_DEBOUNCE_MS) return;
				this.lastGesture.set(row, now);
				this.toggle(row);
			};
			onMenuClick = (event) => {
				const target = event.target;
				if (!(target instanceof Element) || target.closest("[data-dsh-ref-bar]") === null) return;
				if (target.closest("[data-dsh-ref-add]") === null) return;
				event.preventDefault();
				event.stopPropagation();
				this.addSelected();
			};
			attach() {
				for (const kind of GESTURES) document.addEventListener(kind, this.onGesture, true);
				document.addEventListener("click", this.onMenuClick, true);
				this.observer = new MutationObserver(() => {
					this.schedule();
				});
				this.observer.observe(document.body, {
					childList: true,
					subtree: true
				});
				this.schedule();
			}
			detach() {
				for (const kind of GESTURES) document.removeEventListener(kind, this.onGesture, true);
				document.removeEventListener("click", this.onMenuClick, true);
				this.observer?.disconnect();
				this.observer = null;
				this.clearState();
			}
			/** Coalesce DOM churn into one enhance pass per frame. */
			schedule() {
				if (this.scheduled) return;
				this.scheduled = true;
				requestAnimationFrame(() => {
					this.scheduled = false;
					this.enhance();
				});
			}
			/** 清空多选状态与底部条（菜单关闭 / 卸载时；#169-6 的幻影残留防线）。 */
			clearState() {
				this.checked.clear();
				document.querySelectorAll("[data-dsh-ref-on]").forEach((el) => {
					el.removeAttribute(ON_ATTR);
				});
				document.querySelector("[data-dsh-ref-bar]")?.remove();
			}
			/**
			* Ensure every row carries a checkbox + a stable key, re-apply the checked mark, refresh the bar.
			* 菜单不在场时清态（避免关掉菜单后重开还看到「已选 N 项」）。
			* 非移动形态直接不注入（#169-4）。
			*/
			enhance() {
				if (!isMobileForm()) {
					if (this.checked.size > 0) this.clearState();
					return;
				}
				if (document.querySelector(MENU_SELECTOR$1) === null) {
					if (this.checked.size > 0 || document.querySelector("[data-dsh-ref-bar]") !== null) this.clearState();
					return;
				}
				const seen = /* @__PURE__ */ new Map();
				for (const row of document.querySelectorAll(ROW_SELECTOR)) {
					const label = rowLabel(row);
					const occurrence = (seen.get(label) ?? 0) + 1;
					seen.set(label, occurrence);
					const candidate = label + "#" + String(occurrence);
					const current = row.getAttribute(KEY_ATTR);
					const key = current !== null && this.checked.has(current) ? current : candidate;
					if (current !== key) row.setAttribute(KEY_ATTR, key);
					let box = row.querySelector("[data-dsh-ref-check]");
					if (box === null) {
						box = document.createElement("span");
						box.setAttribute(CHECK_ATTR, "");
						box.setAttribute("role", "checkbox");
						box.setAttribute("aria-label", label);
						row.insertBefore(box, row.firstChild);
					}
					const on = this.checked.has(key);
					if (on) row.setAttribute(ON_ATTR, "");
					else row.removeAttribute(ON_ATTR);
					box.setAttribute("aria-checked", on ? "true" : "false");
				}
				this.renderBar();
			}
			/** Toggle one row：状态落在行元素上，随后由 CSS 呈现（无二次同步步骤）。 */
			toggle(row) {
				const key = row.getAttribute(KEY_ATTR);
				if (key === null) return;
				const on = !row.hasAttribute(ON_ATTR);
				if (on) {
					row.setAttribute(ON_ATTR, "");
					this.checked.add(key);
				} else {
					row.removeAttribute(ON_ATTR);
					this.checked.delete(key);
				}
				row.querySelector("[data-dsh-ref-check]")?.setAttribute("aria-checked", on ? "true" : "false");
				this.renderBar();
			}
			/**
			* 底部条关键样式内联写入：`style.setProperty(..., 'important')` 优先级高于任何样式表规则
			* （含上游对 `button` 的默认样式——真机实测过一次「白底白字」正是这个原因）。
			* 颜色不取 `--dsw-alias-brand-primary`（深色下近白），用显式品牌蓝。
			*/
			applyBarStyles(bar, count, add) {
				const set = (el, prop, value) => {
					el.style.setProperty(prop, value, "important");
				};
				const dark = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
				set(bar, "display", "flex");
				set(bar, "gap", "8px");
				set(bar, "align-items", "center");
				set(bar, "justify-content", "space-between");
				set(bar, "padding", "8px 12px");
				set(bar, "border-top", "1px solid var(--dsw-alias-border-l1, " + (dark ? "#2a2b30" : "#e5e5e5") + ")");
				set(bar, "background", "var(--dsw-alias-bg-l1, " + (dark ? "#17181c" : "#ffffff") + ")");
				set(count, "font-size", "13px");
				set(count, "color", "var(--dsw-alias-text-l2, " + (dark ? "#9aa0a6" : "#5f6368") + ")");
				set(add, "background-color", BRAND);
				set(add, "background-image", "none");
				set(add, "color", "#ffffff");
				set(add, "border", "none");
				set(add, "border-radius", "8px");
				set(add, "padding", "6px 14px");
				set(add, "font-size", "13px");
				set(add, "font-weight", "500");
				set(add, "line-height", "1.4");
				set(add, "appearance", "none");
			}
			/**
			* 底部条渲染（**幂等**，#169-2）：节点只建一次，之后只更新文本；绝不 `innerHTML=''` 重建
			* ——旧实现每帧重建子节点会触发 MutationObserver → schedule() → 再重建，选中期间持续抖动。
			*/
			renderBar() {
				const menu = document.querySelector(MENU_SELECTOR$1);
				const existing = document.querySelector("[data-dsh-ref-bar]");
				if (menu === null || this.checked.size === 0) {
					existing?.remove();
					return;
				}
				let bar = existing;
				if (bar === null) {
					bar = document.createElement("div");
					bar.setAttribute(BAR_ATTR, "");
					const count = document.createElement("span");
					count.setAttribute(COUNT_ATTR, "");
					const add = document.createElement("button");
					add.type = "button";
					add.setAttribute(ADD_ATTR, "");
					bar.append(count, add);
					this.applyBarStyles(bar, count, add);
					menu.appendChild(bar);
				}
				const count = bar.querySelector("[data-dsh-ref-bar-count]");
				const add = bar.querySelector("[data-dsh-ref-add]");
				if (count !== null) count.textContent = this.statusText("已选 " + String(this.checked.size) + " 项");
				if (add !== null) add.textContent = "添加 " + String(this.checked.size) + " 项";
			}
			/** 上一次插入的残留提示（#169-3：失败要如实说，不能无声清空选择）。 */
			lastReport = "";
			statusText(base) {
				return this.lastReport === "" ? base : base + " · " + this.lastReport;
			}
			/** Insert every checked candidate through upstream's settle-pick, one reference at a time. */
			async addSelected() {
				const keys = [...this.checked];
				let inserted = 0;
				this.lastReport = "";
				for (const key of keys) {
					if (!await this.pickByKey(key)) break;
					inserted++;
					this.checked.delete(key);
				}
				if (this.checked.size === 0) {
					this.clearState();
					return;
				}
				this.lastReport = "已插入 " + String(inserted) + " 项，" + String(this.checked.size) + " 项未找到（可能已下钻目录）";
				for (const row of document.querySelectorAll(ROW_SELECTOR)) {
					const key = row.getAttribute(KEY_ATTR);
					if (key === null) continue;
					if (this.checked.has(key)) row.setAttribute(ON_ATTR, "");
					else row.removeAttribute(ON_ATTR);
				}
				this.renderBar();
			}
			/**
			* Drive one upstream pick for `key`: focus the composer, (re)open the menu with `@` when it
			* closed, then settle the matching row. Upstream owns the reference it inserts; a row that never
			* appears ends the sequence (reported by the caller) rather than inventing text upstream would
			* not have produced.
			*/
			async pickByKey(key) {
				const editable = composerEditable();
				if (editable === null) return false;
				editable.focus();
				if (document.querySelector(MENU_SELECTOR$1) === null) {
					document.execCommand("insertText", false, "@");
					if (!await this.waitFor(() => this.findRow(key) !== null)) return false;
				}
				const row = this.findRow(key);
				if (row === null) return false;
				row.dispatchEvent(new MouseEvent("mousedown", {
					bubbles: true,
					cancelable: true
				}));
				await this.waitFor(() => document.querySelector(MENU_SELECTOR$1) === null || this.findRow(key) === null, 600);
				return true;
			}
			/** The row whose stable key matches（#169-5：不再按显示文本取第一个同名行）。 */
			findRow(key) {
				for (const row of document.querySelectorAll(ROW_SELECTOR)) if (row.getAttribute(KEY_ATTR) === key) return row;
				return null;
			}
			/** Poll one predicate for up to `timeout` ms (menu open/close is not observable otherwise). */
			waitFor(predicate, timeout = 1500) {
				return new Promise((resolve) => {
					const started = Date.now();
					const tick = () => {
						if (predicate()) {
							resolve(true);
							return;
						}
						if (Date.now() - started > timeout) {
							resolve(false);
							return;
						}
						setTimeout(tick, 60);
					};
					tick();
				});
			}
		};
		//#endregion
		//#region src/client/mobile/back-stack.ts
		/** The phone-form marker (`mobile/form-marker.ts`); the drawer is a layer only on phones. */
		const MOBILE_FORM_ATTR = "data-dsh-mobile-form";
		/** The frame root, tagged by the form marker; identified before the tag lands by its right column. */
		const FRAME_SELECTOR = "[data-dsh-frame]";
		const RIGHT_COL_SELECTOR = "[data-rightbar-col]";
		/** Frame attribute: present while the left sidebar is collapsed (drawer closed). */
		const SIDEBAR_COLLAPSED_ATTR = "data-sidebar-collapsed";
		/** Every upstream modal surface (settings panel, ui-primitives Modal, image lightbox). */
		const DIALOG_SELECTOR = "[role=\"dialog\"][aria-modal=\"true\"]";
		/** Accessible names of the trajectory "Event details" side panel (zh + en dictionaries). */
		const TRAJECTORY_LABELS = ["Event details", "事件详情"];
		/**
		* Right column in its fullscreen presentation **and actually shown**.
		*
		* The panel element keeps `data-sidebar-right-panel="fullscreen"` while the column is collapsed
		* (upstream derives the attribute from the mode alone, and the mode is remembered); what marks the
		* column as presented is `data-sidebar-right-open`, written only while expanded, with
		* `aria-hidden` following it (`SidebarRight.tsx:298-303`). Measured on the MuMu x86_64 build: a
		* collapsed panel carries `aria-hidden="true"` and no open attribute, yet keeps the fullscreen
		* attribute. Counting it as a layer produced a phantom layer that consumed every back press
		* forever (IX-BG-12 red: four presses, depth stuck at 1, the activity never finished).
		*/
		const RIGHT_FULLSCREEN_SELECTOR = "[data-sidebar-right-panel=\"fullscreen\"][data-sidebar-right-open]:not([aria-hidden=\"true\"])";
		const MENU_SELECTOR = "[data-trigger-menu]";
		/** The drilled-listing breadcrumb header (a `nav`; the candidate list is a `div[role=listbox]`). */
		const MENU_DRILL_SELECTOR = "[data-trigger-menu] nav";
		/** Hashed CSS-module close controls still carry the class token (`[class*=ledger]` precedent). */
		const CLOSE_CLASS_HINT = "[class*=\"close\"]";
		/** Attributes any layer's presence is derived from; the filter keeps the observer cheap. */
		const OBSERVED_ATTRIBUTES = [
			MOBILE_FORM_ATTR,
			SIDEBAR_COLLAPSED_ATTR,
			"role",
			"aria-modal",
			"aria-label",
			"aria-hidden",
			"data-sidebar-right-panel",
			"data-sidebar-right-open",
			"data-trigger-menu"
		];
		/** Dispatch one pointerdown, degrading to MouseEvent where PointerEvent is absent. */
		function dispatchPointerDown(target) {
			if (typeof PointerEvent === "function") {
				target.dispatchEvent(new PointerEvent("pointerdown", {
					bubbles: true,
					cancelable: true
				}));
				return;
			}
			target.dispatchEvent(new MouseEvent("pointerdown", {
				bubbles: true,
				cancelable: true
			}));
		}
		/** Dispatch one mouse gesture (bubbling + cancelable: React handlers and `preventDefault` both rely on it). */
		function dispatchMouse(target, type) {
			target.dispatchEvent(new MouseEvent(type, {
				bubbles: true,
				cancelable: true
			}));
		}
		/**
		* Close a modal surface through its own dismissal path.
		* @param dialog - the `[role=dialog][aria-modal]` element.
		* @returns whether a control was found and triggered.
		*/
		function closeDialog(dialog) {
			const mask = dialog.parentElement?.querySelector(":scope > [aria-hidden=\"true\"]") ?? dialog.querySelector(":scope > [aria-hidden=\"true\"]");
			if (mask !== null && mask !== void 0) {
				dispatchMouse(mask, "mousedown");
				dispatchMouse(mask, "click");
				return true;
			}
			const close = dialog.querySelector(`button${CLOSE_CLASS_HINT}`) ?? dialog.querySelector(CLOSE_CLASS_HINT);
			if (close !== null) {
				dispatchMouse(close, "click");
				return true;
			}
			const backdrop = dialog.parentElement;
			if (backdrop !== null) {
				dispatchMouse(backdrop, "click");
				return true;
			}
			return false;
		}
		/**
		* Close the trajectory "Event details" side panel through its own close button.
		* @param aside - the panel element.
		* @returns whether the close control was found and triggered.
		*/
		function closeTrajectoryDetails(aside) {
			const close = aside.querySelector(`button${CLOSE_CLASS_HINT}`) ?? aside.querySelector(CLOSE_CLASS_HINT);
			if (close === null) return false;
			dispatchMouse(close, "click");
			return true;
		}
		/**
		* Leave the right column's fullscreen presentation.
		* @param panel - the `[data-sidebar-right-panel=fullscreen]` element.
		* @returns whether a control was found and triggered.
		*/
		function closeRightFullscreen(panel) {
			const target = panel.querySelector("[data-sidebar-right-mode]") ?? panel.querySelector("[data-sidebar-right-toggle]");
			if (target === null) return false;
			dispatchMouse(target, "click");
			return true;
		}
		/**
		* Dismiss a trigger menu (slash / `@`) through the menu's own dismissal path.
		* @param menu - the `[data-trigger-menu]` element.
		* @returns whether the dismissal was dispatched.
		*/
		function closeMenu(menu) {
			if (menu.contains(document.body)) return false;
			dispatchPointerDown(document.body);
			return true;
		}
		/**
		* Pop one drill-down level of an `@` menu listing.
		* @param nav - the breadcrumb header inside the menu.
		* @returns whether an ancestor step was found and triggered.
		*/
		function popMenuDrill(nav) {
			const ancestors = [...nav.querySelectorAll("button")].filter((button) => button.getAttribute("aria-current") === null && !button.disabled);
			const parent = ancestors[ancestors.length - 1];
			if (parent === void 0) return false;
			dispatchMouse(parent, "mousedown");
			return true;
		}
		/**
		* The page-side layer stack behind the shell's system-back callback.
		*
		* `attach` publishes `window.__dshBack` and starts observing; `detach` removes
		* the observer, the globals, and the shell's cached availability (a hot unload
		* must not leave the shell believing a layer is still up).
		*/
		var BackStackSignal = class {
			options;
			observer = null;
			layers = [];
			seq = 0;
			depth = -1;
			kinds = [];
			uplinked = false;
			available = false;
			attached = false;
			/** @param options - the drawer toggle callback. */
			constructor(options) {
				this.options = options;
			}
			/** Publish the back entry and keep the stack current. */
			attach() {
				if (this.attached) return;
				this.attached = true;
				window.__dshBack = () => this.popTop();
				this.observer = new MutationObserver(() => {
					this.sync();
				});
				this.observer.observe(document.documentElement, {
					childList: true,
					subtree: true,
					attributes: true,
					attributeFilter: OBSERVED_ATTRIBUTES
				});
				this.sync();
			}
			/** Stop observing and remove every trace of the signal. */
			detach() {
				if (!this.attached) return;
				this.attached = false;
				this.observer?.disconnect();
				this.observer = null;
				this.layers = [];
				delete window.__dshBack;
				delete window.__dshBackDepth;
				delete window.__dshBackKinds;
				this.uplinked = false;
				this.publish();
			}
			/** The layer kinds currently stacked, bottom to top (device-side assertions read the global). */
			currentKinds() {
				return this.kinds;
			}
			/**
			* Pop the topmost layer through its own control.
			* @returns whether a layer existed (the shell consumes the press either way);
			*   the stack itself only shrinks when the layer's anchor leaves the DOM.
			*/
			popTop() {
				this.sync();
				const top = this.layers[this.layers.length - 1];
				if (top === void 0) return false;
				try {
					return top.close();
				} catch {
					return false;
				}
			}
			/** Reconcile the observed layers with the stack, keeping open order. */
			sync() {
				const detected = this.detect();
				const next = [];
				for (const detection of detected) {
					const existing = this.layers.find((layer) => layer.id === detection.id);
					next.push(existing === void 0 ? {
						...detection,
						seq: ++this.seq
					} : {
						...existing,
						close: detection.close
					});
				}
				next.sort((a, b) => a.seq - b.seq);
				this.layers = next;
				this.publish();
			}
			/** Every layer currently in the DOM, in a fixed detection order. */
			detect() {
				const found = [];
				const drawer = this.detectDrawer();
				if (drawer !== null) found.push(drawer);
				for (const dialog of this.detectDialogs()) found.push(dialog);
				const trajectory = this.detectTrajectoryDetails();
				if (trajectory !== null) found.push(trajectory);
				const fullscreen = this.detectRightFullscreen();
				if (fullscreen !== null) found.push(fullscreen);
				const menu = this.detectMenu();
				if (menu !== null) found.push(menu);
				const drill = this.detectMenuDrill();
				if (drill !== null) found.push(drill);
				return found;
			}
			/** The drawer: the phone form's expanded left sidebar. */
			detectDrawer() {
				if (!document.documentElement.hasAttribute(MOBILE_FORM_ATTR)) return null;
				const frame = document.querySelector(FRAME_SELECTOR) ?? document.querySelector(RIGHT_COL_SELECTOR)?.parentElement ?? null;
				if (frame === null || frame.hasAttribute(SIDEBAR_COLLAPSED_ATTR)) return null;
				return {
					id: "drawer",
					kind: "drawer",
					close: () => {
						this.options.toggleSidebar();
						return true;
					}
				};
			}
			/** Every modal surface, in document order (settings panel, Modal, lightbox). */
			detectDialogs() {
				return [...document.querySelectorAll(DIALOG_SELECTOR)].map((dialog, index) => ({
					id: `dialog:${String(index)}`,
					kind: "dialog",
					close: () => closeDialog(dialog)
				}));
			}
			/** The trajectory inspector side panel. */
			detectTrajectoryDetails() {
				for (const aside of document.querySelectorAll("aside[aria-label]")) {
					if (!TRAJECTORY_LABELS.includes(aside.getAttribute("aria-label") ?? "")) continue;
					return {
						id: "trajectory-details",
						kind: "trajectory-details",
						close: () => closeTrajectoryDetails(aside)
					};
				}
				return null;
			}
			/** The right column's fullscreen presentation. */
			detectRightFullscreen() {
				const panel = document.querySelector(RIGHT_FULLSCREEN_SELECTOR);
				if (panel === null) return null;
				return {
					id: "right-fullscreen",
					kind: "right-fullscreen",
					close: () => closeRightFullscreen(panel)
				};
			}
			/** An open command/reference menu. */
			detectMenu() {
				const menu = document.querySelector(MENU_SELECTOR);
				if (menu === null) return null;
				return {
					id: "menu",
					kind: "menu",
					close: () => closeMenu(menu)
				};
			}
			/** A menu listing descended into a directory (its breadcrumb header is up). */
			detectMenuDrill() {
				const nav = document.querySelector(MENU_DRILL_SELECTOR);
				if (nav === null) return null;
				return {
					id: "menu-drill",
					kind: "menu-drill",
					close: () => popMenuDrill(nav)
				};
			}
			/** Publish the observability globals and the shell uplink (only on change). */
			publish() {
				const kinds = this.layers.map((layer) => layer.kind);
				if (kinds.length !== this.depth || kinds.some((kind, index) => kind !== this.kinds[index])) {
					this.depth = kinds.length;
					this.kinds = kinds;
					window.__dshBackDepth = kinds.length;
					window.__dshBackKinds = kinds;
				}
				const available = kinds.length > 0;
				if (this.uplinked && available === this.available) return;
				this.uplinked = true;
				this.available = available;
				try {
					window.dshBackBridge?.setAvailable?.(available);
				} catch {}
			}
		};
		//#endregion
		//#region src/client/mobile/session-marker.ts
		/** 发布当前会话 id 的 DOM 属性名（注入层与 e2e 断言共用）。 */
		const SESSION_ID_ATTRIBUTE = "data-dsh-session-id";
		var SessionMarker = class {
			sessions;
			unsubscribe;
			attached = false;
			constructor(sessions) {
				this.sessions = sessions;
			}
			/** 开始跟踪当前会话（幂等）。 */
			attach() {
				if (this.attached) return;
				this.attached = true;
				this.sync();
				try {
					this.unsubscribe = this.sessions?.list?.subscribe?.(() => {
						this.sync();
					});
				} catch {
					this.unsubscribe = void 0;
				}
			}
			/** 停止跟踪并移除标记。 */
			detach() {
				try {
					this.unsubscribe?.();
				} catch {}
				this.unsubscribe = void 0;
				this.attached = false;
				try {
					document.documentElement.removeAttribute(SESSION_ID_ATTRIBUTE);
				} catch {}
			}
			/** 同步一次：当前会话 id → 属性；无会话则移除。 */
			sync() {
				try {
					const current = this.sessions?.list?.getSnapshot?.()?.current;
					const root = document.documentElement;
					if (current === void 0 || current === null || String(current) === "") root.removeAttribute(SESSION_ID_ATTRIBUTE);
					else root.setAttribute(SESSION_ID_ATTRIBUTE, String(current));
				} catch {}
			}
		};
		//#endregion
		//#region src/client/mobile/browser-tab.tsx
		/**
		* 侧边栏 AI 浏览器的面板入口（U-1）：与上游「工作区文件」同级的右侧栏 tab 类型。
		*
		* 注册面与 ui-sidebar-files 完全同构：类型进 ctx.sidebarRightTabs（其 guide 条目就是
		* 「文件」面板里的同级卡片），body 进 keyed sidebar.right.pane.tab 座位。
		*
		* 数据面：引擎侧 host 半（plugins/dsh-android-browser）的**只读**路由
		* /api/android/browser/status。档位优先来自壳桥 browserCaps；op 未实现时回落 env/实测基线，
		* 并在 factsSource / capsNote 里如实标注（页面不得把它显示成"已实测"）。
		*
		* 跨包命名镜像：kind 与路由在本文件按 plugins/dsh-android-browser/src/contract.ts 的值镜像
		* （该插件是权威契约源；改名必须同批，否则面板打不开）。
		*/
		/** 与 contract.ts 的 BROWSER_TAB_ID/BROWSER_TAB_KIND 对齐（openTab 用 kind）。 */
		const BROWSER_TAB_ID = "android-browser";
		const BROWSER_TAB_KIND = "android-browser";
		/** 与 contract.ts 的 BROWSER_ROUTES.status 对齐。 */
		const BROWSER_STATUS_ROUTE = "/api/android/browser/status";
		/**
		* 浏览器 tab 类型定义。
		* @returns 注册进 ctx.sidebarRightTabs 的定义（guide 条目 = 「文件」面板的同级卡片）。
		*/
		function browserTabDefinition() {
			return {
				id: BROWSER_TAB_ID,
				kind: BROWSER_TAB_KIND,
				priority: "extension",
				title: () => "AI 浏览器",
				guide: [{
					order: 20,
					title: () => "AI 浏览器",
					description: () => "在右侧栏打开 AI 专用浏览器工作台（档位 / 视口 / 身份）"
				}]
			};
		}
		/**
		* 面板本体：档位 + 视口/身份档位骨架 + 页面区占位。
		* @param props - 组合槽位属性（本组件不读 owner 分享）。
		* @returns 面板元素树。
		*/
		function BrowserTab(_props) {
			const [status, setStatus] = (0, react.useState)(null);
			const [note, setNote] = (0, react.useState)(null);
			const refresh = (0, react.useCallback)(async () => {
				try {
					const r = await fetch(BROWSER_STATUS_ROUTE, {
						credentials: "same-origin",
						cache: "no-store"
					});
					if (r.status === 401 || r.status === 403) {
						setNote("未获授权（HTTP " + r.status + "）——浏览器档位不可读");
						return;
					}
					if (!r.ok) {
						setNote("档位接口不可用（HTTP " + r.status + "）");
						return;
					}
					const json = await r.json().catch(() => null);
					if (json === null || json.ok !== true) {
						setNote("档位接口返回异常");
						return;
					}
					setStatus(json);
					setNote(null);
				} catch {
					setNote("浏览器面板不可用（host 半未挂载或引擎未就绪）");
				}
			}, []);
			(0, react.useEffect)(() => {
				refresh();
				const onVisible = () => {
					if (document.visibilityState === "visible") refresh();
				};
				document.addEventListener("visibilitychange", onVisible);
				window.addEventListener("focus", onVisible);
				return () => {
					document.removeEventListener("visibilitychange", onVisible);
					window.removeEventListener("focus", onVisible);
				};
			}, [refresh]);
			const degraded = status?.degradedNotes ?? [];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-plugin": "android-browser",
				style: {
					height: "100%",
					minHeight: 0,
					overflow: "hidden",
					display: "flex",
					flexDirection: "column",
					gap: "8px",
					padding: "8px",
					boxSizing: "border-box"
				},
				children: [note !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					"data-testid": "browser-note",
					style: { margin: 0 },
					children: note
				}), status !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						"data-testid": "browser-tier",
						style: { margin: 0 },
						children: "档位 " + status.tier + " · 视口 " + status.viewportRoute + " · 身份 " + status.identityRoute
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						"data-testid": "browser-source",
						style: {
							margin: 0,
							opacity: .75
						},
						children: "事实来源 " + status.factsSource + (status.capsNote === void 0 ? "" : "（" + status.capsNote + "）")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: {
							display: "flex",
							gap: "6px",
							alignItems: "center"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "视口档位" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
							"data-testid": "browser-viewport",
							disabled: true,
							defaultValue: "phone-portrait",
							children: (status.viewportPresets ?? []).map((p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: p.id,
								children: p.label + " " + String(p.width) + "x" + String(p.height)
							}, p.id))
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: {
							display: "flex",
							gap: "6px",
							alignItems: "center"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "身份档位" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
							"data-testid": "browser-identity",
							disabled: true,
							defaultValue: "android-real",
							children: (status.identityProfiles ?? []).map((p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: p.id,
								children: p.label + (p.requiresConfirm ? "（需二次确认）" : "")
							}, p.id))
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						"data-testid": "browser-stage",
						style: {
							flex: 1,
							minHeight: 0,
							border: "1px dashed currentColor",
							borderRadius: "6px",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							padding: "12px",
							textAlign: "center",
							opacity: .85
						},
						children: status.browserWebViewAvailable ? "浏览器画面将在此显示（壳侧 host 已就绪）" : "壳侧 BrowserHost 未接入：等待 MainActivity 窗口释放后启用有头浏览面"
					}),
					degraded.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						"data-testid": "browser-degraded",
						style: {
							margin: 0,
							paddingLeft: "18px",
							opacity: .8
						},
						children: degraded.map((n) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: n }, n))
					})
				] })]
			});
		}
		//#endregion
		//#region src/client/index.ts
		/** Required services: composition, copy/theme faces, the runtime sessions, and the frame's panel actions. */
		const inject = [
			"slots",
			"theme",
			"sessions",
			"layout"
		];
		/** Append one stylesheet and return its disposer. */
		function injectStyle(id, css) {
			const style = document.createElement("style");
			style.setAttribute("data-plugin", id);
			style.textContent = css;
			document.head.appendChild(style);
			return () => {
				style.remove();
			};
		}
		/**
		* Client plugin body: the Android adaptation layer over the upstream frame.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => {
				const bridge = new FoldContinuity();
				bridge.attach();
				return () => bridge.detach();
			}, "ui-responsive: fold crop continuity");
			ctx.effect(() => {
				const guard = new NativeInteractionGuard();
				guard.attach();
				return () => guard.detach();
			}, "ui-layout: native interaction guard");
			ctx.effect(() => {
				const guard = new TouchTooltipGuard();
				guard.attach();
				return () => guard.detach();
			}, "ui-layout: touch tooltip guard");
			ctx.effect(() => injectStyle("mobile-form", MOBILE_FORM_CSS), "ui-responsive: mobile form styles");
			ctx.effect(() => {
				const marker = new MobileFormMarker();
				marker.attach();
				return () => {
					marker.detach();
				};
			}, "ui-responsive: mobile form marker");
			ctx.effect(() => injectStyle("mobile-settings", MOBILE_SETTINGS_CSS), "ui-responsive: mobile settings styles");
			ctx.effect(() => injectStyle("composer-row", COMPOSER_ROW_CSS), "ui-responsive: composer row narrow fix");
			ctx.effect(() => injectStyle("composer-insets", COMPOSER_INSETS_CSS), "ui-responsive: composer insets adaptation");
			ctx.effect(() => injectStyle("composer-menu", COMPOSER_MENU_CSS), "ui-responsive: composer menu scroll fix");
			ctx.effect(() => {
				const guard = new ComposerPopupGuard();
				guard.attach();
				return () => {
					guard.detach();
				};
			}, "ui-responsive: composer popup geometry guard");
			ctx.effect(() => {
				const disposeStyle = injectStyle("trajectory-details", TRAJECTORY_DETAILS_CSS);
				const observer = new TrajectoryPanelsObserver(document.querySelector("[class*=\"ledger\"]"));
				observer.attach();
				return () => {
					observer.detach();
					disposeStyle();
				};
			}, "ui-responsive: trajectory details full-viewport overlay + :has() fallback");
			ctx.effect(() => {
				const guard = new FontSizeGuard(ctx.theme);
				guard.attach();
				return () => guard.detach();
			}, "ui-layout: content font keyboard shortcuts");
			ctx.effect(() => {
				const guard = new EnterGuard();
				guard.attach();
				return () => {
					guard.detach();
				};
			}, "ui-responsive: mobile enter guard");
			ctx.effect(() => {
				const boundary = new KeyboardBoundary();
				boundary.attach();
				return () => {
					boundary.detach();
				};
			}, "ui-responsive: mobile keyboard boundary");
			ctx.effect(() => {
				new ThemeBridge().install();
				return () => {};
			}, "ui-responsive: theme bridge");
			ctx.effect(() => injectStyle("dev-section", DEV_SECTION_CSS), "ui-responsive: dev section styles");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "android-dev",
				order: 99,
				label: () => "开发者选项",
				children: { "settings.dev.item": {
					kind: "list",
					scope: "root"
				} }
			}, DevSection));
			ctx.slots.inject("settings.general.item", () => ctx.slots.register({
				name: "settings.general.item",
				id: "android-general",
				order: 90,
				label: () => "Android 显示"
			}, GeneralSettings));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "mobile-chrome",
				inject: () => ({ toggleSidebar: () => {
					ctx.layout.toggleSidebar();
				} })
			}, MobileChrome));
			const exportChannel = new ExportResultChannel();
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "export-result",
				inject: () => ({
					hooks: { exportResult: exportChannel },
					close: () => {
						exportChannel.close();
					}
				})
			}, ExportResultDialog));
			ctx.effect(() => injectStyle("session-log-dialog", SESSION_LOG_DIALOG_HIDE_CSS), "ui-responsive: hide upstream session-log dialog");
			ctx.effect(() => {
				const observer = new SessionLogDialogObserver();
				observer.attach();
				return () => {
					observer.detach();
				};
			}, "ui-responsive: session-log dialog :has() fallback");
			ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
				name: "conversation.session.header.utilities",
				id: "android-open-in-file-manager",
				order: -10
			}, OpenInFileManagerAction));
			ctx.effect(() => {
				const tabs = ctx.get("sidebarRightTabs");
				if (tabs === void 0) return () => {};
				let ranking = false;
				const claimedByAnother = (address) => {
					if (ranking) return false;
					ranking = true;
					try {
						return tabs.candidates(address).some((definition) => definition.id !== "@dsh-android/client-ui-responsive/open-with" && definition.priority !== "fallback");
					} finally {
						ranking = false;
					}
				};
				return tabs.register(externalOpenDefinition(claimedByAnother));
			}, "ui-responsive: open-with tab type");
			ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
				name: "sidebar.right.pane.tab",
				key: EXTERNAL_OPEN_ID
			}, ExternalOpenTab));
			ctx.effect(() => {
				const marker = new SessionMarker(ctx.sessions);
				marker.attach();
				return () => {
					marker.detach();
				};
			}, "ui-responsive: session id marker for tool-row file links");
			ctx.effect(() => {
				const tabs = ctx.get("sidebarRightTabs");
				if (tabs === void 0) return () => {};
				return tabs.register(browserTabDefinition());
			}, "ui-responsive: AI browser tab type");
			ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
				name: "sidebar.right.pane.tab",
				key: BROWSER_TAB_ID
			}, BrowserTab));
			ctx.effect(() => {
				const enhancer = new ReferenceMenuEnhancer();
				enhancer.attach();
				return () => {
					enhancer.detach();
				};
			}, "ui-responsive: reference menu enhancer");
			ctx.effect(() => injectStyle("reference-bar", REFERENCE_BAR_CSS), "ui-responsive: reference menu bar styles");
			ctx.effect(() => {
				const action = new SettingsDocumentAction();
				action.attach();
				return () => {
					action.detach();
				};
			}, "ui-responsive: settings document action takeover");
			ctx.effect(() => {
				const backStack = new BackStackSignal({ toggleSidebar: () => {
					ctx.layout.toggleSidebar();
				} });
				backStack.attach();
				return () => {
					backStack.detach();
				};
			}, "ui-responsive: back-stack signal (page layers → shell back gate)");
			ctx.effect(() => {
				const onResult = (event) => {
					const payload = event.detail;
					if (payload === null || typeof payload !== "object") return;
					if (typeof payload.ok !== "boolean" || typeof payload.title !== "string" || typeof payload.detail !== "string") return;
					exportChannel.show(payload);
				};
				const bridge = (payload) => {
					reportUserFacingResult(payload);
				};
				window.__dshExportResult = bridge;
				window.addEventListener("dsh:export-result", onResult);
				return () => {
					window.removeEventListener("dsh:export-result", onResult);
					delete window.__dshExportResult;
				};
			}, "ui-responsive: export result dialog bridge");
			ctx.effect(() => {
				const opened = /* @__PURE__ */ new Set();
				let busy = false;
				const poll = async () => {
					if (busy) return;
					busy = true;
					try {
						const r = await fetch("/api/android/file-incoming", {
							credentials: "same-origin",
							cache: "no-store"
						});
						if (!r.ok) {
							if (r.status === 401 || r.status === 403) console.warn("[dsh-mobile] file-incoming unauthorized (HTTP " + r.status + ")——来件消费已停");
							return;
						}
						const j = await r.json().catch(() => null);
						if (!j?.items) return;
						for (const item of j.items) {
							if (!item.sessionId || opened.has(item.sessionId)) continue;
							try {
								ctx.sessions.open(item.sessionId);
								opened.add(item.sessionId);
								fetch("/api/android/file-incoming/claim", {
									method: "POST",
									credentials: "same-origin",
									headers: { "content-type": "application/json" },
									body: JSON.stringify({ file: item.file })
								}).catch(() => {});
							} catch {}
						}
					} catch {} finally {
						busy = false;
					}
				};
				const timer = window.setInterval(() => {
					if (document.visibilityState === "visible") poll();
				}, 4e3);
				const onVisible = () => {
					if (document.visibilityState === "visible") poll();
				};
				document.addEventListener("visibilitychange", onVisible);
				window.addEventListener("focus", onVisible);
				poll();
				return () => {
					window.clearInterval(timer);
					document.removeEventListener("visibilitychange", onVisible);
					window.removeEventListener("focus", onVisible);
				};
			}, "ui-responsive: file-incoming consumer (F5)");
		}
		//#endregion
		exports.MOBILE_FORM_MAX_WIDTH = MOBILE_FORM_MAX_WIDTH;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map