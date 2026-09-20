window.__ModuleLoader__.load({
	id: "@dsh-android/dsh-client-ui-responsive",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		/** Viewport width below which the sidebar auto-collapses to the rail (deepsuite
		* LG breakpoint); a manual toggle below it re-expands over the squeezed center
		* (stores.ts narrowExpanded). */
		const SIDEBAR_AUTO_COLLAPSE = 1024;
		/**
		* Clamp a panel width into its contract range.
		* @param px - requested width.
		* @param min - range lower bound.
		* @param max - range upper bound.
		* @returns the clamped width.
		*/
		function clampWidth(px, min, max) {
			return Math.min(max, Math.max(min, Math.round(px)));
		}
		/**
		* Solve the three column widths for one viewport frame. Pure: no hysteresis —
		* the output is a function of (viewport, preferences) only, so recovery on
		* re-widening is automatic. Preferences re-clamp here because they cross the
		* store boundary and callers may still supply stale ranges.
		* @param viewport - available frame width in px.
		* @param sidebar - sidebar width preference in px (0 = closed).
		* @param details - details width preference in px (0 = closed).
		* @returns resolved widths; details 0 means visually closed (never unmounted), while a closed sidebar keeps its compact rail.
		*/
		function computeColumns(viewport, sidebar, details) {
			const s = sidebar === 0 ? 56 : clampWidth(sidebar, 264, 420);
			const d0 = details === 0 ? 0 : clampWidth(details, 300, 520);
			if (s + d0 + 640 <= viewport) return {
				sidebar: s,
				center: viewport - s - d0,
				details: d0
			};
			const d1 = d0 === 0 ? 0 : Math.max(300, viewport - s - 640);
			if (s + d1 + 640 <= viewport) return {
				sidebar: s,
				center: 640,
				details: d1
			};
			return {
				sidebar: s,
				center: Math.max(0, viewport - s),
				details: 0
			};
		}
		//#endregion
		//#region \0dsh-css:android-shell/dsh-client-ui-responsive/src/client/AppFrame.module.css.mjs
		const css$1 = ".vhxdTa_frame{background:var(--dsw-alias-bg-base);height:100%;transition:grid-template-columns var(--ds-transition-duration-slow) var(--ds-ease-in-out);grid-template-rows:100%;display:grid;position:relative;overflow:hidden}.vhxdTa_frame[data-dragging]{transition:none}@media (prefers-reduced-motion:reduce){.vhxdTa_frame{transition:none}}.vhxdTa_sidebarCol{background:var(--dsw-specific-sidebar-fill);border-right:1px solid var(--dsw-alias-border-l1);min-width:0;overflow:hidden}.vhxdTa_centerCol{flex-direction:column;min-width:0;display:flex;overflow:hidden}.vhxdTa_detailsCol{border-left:1px solid var(--dsw-alias-border-l2);min-width:0;overflow:hidden}.vhxdTa_frame[data-details-collapsed] .vhxdTa_detailsCol{border-left:none}.vhxdTa_handle{cursor:col-resize;z-index:2;touch-action:none;width:8px;transition:left var(--ds-transition-duration-slow) var(--ds-ease-in-out);margin-left:-4px;position:absolute;top:0;bottom:0}.vhxdTa_frame[data-dragging] .vhxdTa_handle{transition:none}@media (prefers-reduced-motion:reduce){.vhxdTa_handle{transition:none}}.vhxdTa_handle[data-side=details]:after{content:\"\";box-sizing:border-box;background:var(--dsw-alias-button-floating-fill);border:1px solid var(--dsw-alias-border-l2-darkmode-thin);opacity:0;width:12px;height:32px;transition:opacity var(--ds-transition-duration-slow) var(--ds-ease-in-out), background var(--ds-transition-duration-slow) var(--ds-ease-in-out);border-radius:10px;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}.vhxdTa_detailsCol:hover~.vhxdTa_handle[data-side=details]:after,.vhxdTa_handle[data-side=details]:hover:after,.vhxdTa_handle[data-side=details][data-dragging=true]:after{opacity:1}.vhxdTa_handle[data-side=details]:hover:after,.vhxdTa_handle[data-side=details][data-dragging=true]:after{background:var(--dsw-alias-button-floating-hover);border-color:var(--dsw-alias-border-l3)}.vhxdTa_overlayLayer{z-index:20;pointer-events:none;position:absolute;inset:0}.vhxdTa_overlayLayer>*{pointer-events:auto}.vhxdTa_mobileFrame{background:var(--dsw-alias-bg-base);flex-direction:column;height:100%;display:flex;position:relative;overflow:clip}.vhxdTa_mobileTopBar{padding:calc(env(safe-area-inset-top) + 8px) 12px 8px;background:var(--dsw-specific-sidebar-fill);border-bottom:1px solid var(--dsw-alias-border-l1);z-index:3;align-items:center;gap:8px;display:flex}.vhxdTa_mobileHamburger{width:44px;height:44px;color:var(--dsw-alias-text-l1);cursor:pointer;touch-action:manipulation;background:0 0;border:none;border-radius:10px;flex:none;font-size:20px}.vhxdTa_mobileHamburger:active{background:var(--dsw-alias-button-floating-fill)}.vhxdTa_mobileTitle{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-text-l1);flex:1;font-size:16px;font-weight:600;overflow:hidden}.vhxdTa_mobileFrame[data-compact-header]>.vhxdTa_mobileTopBar{background:0 0;border:0;padding:0;position:absolute;top:12px;left:4px}.vhxdTa_mobileFrame[data-compact-header] .vhxdTa_mobileTitle{display:none}.vhxdTa_mobileFrame[data-compact-header] [data-slot=\"conversation.session.header\"]>header>:first-child{min-height:44px;padding-inline-start:48px}.vhxdTa_mobileBody{flex-direction:column;flex:1;min-height:0;display:flex}.vhxdTa_mobileBody .vhxdTa_centerCol{flex:1}.vhxdTa_mobileSheet{background:var(--dsw-alias-bg-base);border-top:1px solid var(--dsw-alias-border-l2);z-index:8;max-height:70%;padding-bottom:env(safe-area-inset-bottom);transition:transform var(--ds-transition-duration-slow) var(--ds-ease-in-out);border-radius:16px 16px 0 0;flex-direction:column;display:flex;position:absolute;bottom:0;left:0;right:0;transform:translateY(100%)}.vhxdTa_mobileSheet[data-open]{transform:translateY(0)}.vhxdTa_mobileSheetGrab{background:var(--dsw-alias-border-l2);cursor:pointer;touch-action:manipulation;border-radius:4px;flex:none;width:44px;height:8px;margin:8px auto 4px}.vhxdTa_mobileSheet>:last-child{min-height:0;overflow:auto}.vhxdTa_mobileMask{background:var(--dsw-alias-overlay-mask);opacity:0;pointer-events:none;z-index:9;transition:opacity var(--ds-transition-duration-slow) var(--ds-ease-in-out);position:absolute;inset:0}.vhxdTa_mobileMask[data-open]{opacity:1;pointer-events:auto}.vhxdTa_mobileDrawer{background:var(--dsw-specific-sidebar-fill);border-right:1px solid var(--dsw-alias-border-l1);z-index:10;width:min(300px,85vw);padding-top:env(safe-area-inset-top);transition:margin-left var(--ds-transition-duration-slow) var(--ds-ease-in-out);flex-direction:column;margin-left:-100%;display:flex;position:absolute;top:0;bottom:0;left:0}.vhxdTa_mobileDrawer[data-open]{margin-left:0}.vhxdTa_mobileDrawer>*{min-height:0;overflow:auto}.vhxdTa_frame[data-layout-changing],.vhxdTa_mobileFrame[data-layout-changing],[data-layout-changing]>.vhxdTa_mobileDrawer,[data-layout-changing]>.vhxdTa_mobileSheet,[data-layout-changing]>.vhxdTa_mobileMask,[data-layout-changing]>.vhxdTa_handle{transition:none}@media (prefers-reduced-motion:reduce){.vhxdTa_mobileSheet,.vhxdTa_mobileMask,.vhxdTa_mobileDrawer{transition:none}}.vhxdTa_mobileFrame[data-compact-header] [data-deck-header] [role=tablist]{align-items:center;min-height:44px;padding-inline-start:48px}[data-fold-workbench] .dsh-deck{padding-inline:6px}[data-fold-workbench]{--dsh-fold-workbench-layout:1}.vhxdTa_mobileHamburger{place-items:center;display:grid}";
		const tagId$1 = "@dsh-android/dsh-client-ui-responsive/AppFrame.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh-android/dsh-client-ui-responsive";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var AppFrame_module_css_default = {
			"mobileDrawer": "vhxdTa_mobileDrawer",
			"detailsCol": "vhxdTa_detailsCol",
			"mobileHamburger": "vhxdTa_mobileHamburger",
			"mobileMask": "vhxdTa_mobileMask",
			"sidebarCol": "vhxdTa_sidebarCol",
			"handle": "vhxdTa_handle",
			"mobileBody": "vhxdTa_mobileBody",
			"mobileSheetGrab": "vhxdTa_mobileSheetGrab",
			"frame": "vhxdTa_frame",
			"mobileSheet": "vhxdTa_mobileSheet",
			"centerCol": "vhxdTa_centerCol",
			"overlayLayer": "vhxdTa_overlayLayer",
			"mobileTitle": "vhxdTa_mobileTitle",
			"mobileFrame": "vhxdTa_mobileFrame",
			"mobileTopBar": "vhxdTa_mobileTopBar"
		};
		//#endregion
		//#region src/client/AppFrame.tsx
		/**
		* Three-column shell frame, registered into the built-in 'root' slot (the web
		* shell renders only 'root'). Owns the grid tracks (sidebar | center |
		* details), the drag handles (pointer capture + rAF throttle), the concession
		* chain (columns.ts), and the child-slot render decisions: the sidebar slot
		* renders HERE with live parameters from the concession solve, and the
		* session-aware occupants render in fixed column positions; strict entries
		* gate themselves on current-session availability while session-maybe
		* entries retain identity. Pure component: everything arrives
		* through the three framework shares — zero cordis or framework imports,
		* zero self-made hooks.
		*/
		function hasNativeFoldLayout() {
			try {
				const bridge = window.androidBridge;
				return JSON.parse(bridge?.foldStatus?.() ?? "{}").dual?.supported === true;
			} catch {
				return false;
			}
		}
		function sidebarPreferenceForWidth(width, panels) {
			return (width < 1024 ? !panels.narrowExpanded : panels.sidebar === 0) ? 0 : panels.sidebar === 0 ? 280 : panels.sidebar;
		}
		/** Center column grid item (session-body building block). */
		function CenterColumn(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: AppFrame_module_css_default.centerCol,
				children: props.children
			});
		}
		/** Details column grid item; width 0 keeps the subtree mounted (never unmount on close). */
		function DetailsColumn(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: AppFrame_module_css_default.detailsCol,
				children: props.children
			});
		}
		/**
		* One drag handle: pointer capture, rAF-throttled dx reports against the drag-start origin.
		* `side` keys the hover-reveal CSS to the owning column.
		*/
		function DragHandle(props) {
			const [dragging, setDragging] = (0, react.useState)(false);
			const origin = (0, react.useRef)(0);
			const latest = (0, react.useRef)(0);
			const frame = (0, react.useRef)(null);
			const callbacks = (0, react.useRef)({
				onStart: props.onStart,
				onDrag: props.onDrag,
				onEnd: props.onEnd
			});
			callbacks.current = {
				onStart: props.onStart,
				onDrag: props.onDrag,
				onEnd: props.onEnd
			};
			const onPointerDown = (0, react.useCallback)((e) => {
				e.preventDefault();
				e.currentTarget.setPointerCapture(e.pointerId);
				origin.current = e.clientX;
				latest.current = e.clientX;
				callbacks.current.onStart();
				setDragging(true);
			}, []);
			const onPointerMove = (0, react.useCallback)((e) => {
				if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
				latest.current = e.clientX;
				frame.current ??= requestAnimationFrame(() => {
					frame.current = null;
					callbacks.current.onDrag(latest.current - origin.current);
				});
			}, []);
			const onPointerUp = (0, react.useCallback)((e) => {
				if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
				e.currentTarget.releasePointerCapture(e.pointerId);
				if (frame.current !== null) {
					cancelAnimationFrame(frame.current);
					frame.current = null;
				}
				callbacks.current.onDrag(latest.current - origin.current);
				setDragging(false);
				callbacks.current.onEnd();
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: AppFrame_module_css_default.handle,
				style: { left: props.left },
				"data-side": props.side,
				"data-dragging": dragging || void 0,
				onPointerDown,
				onPointerMove,
				onPointerUp
			});
		}
		/** The three-column frame (see module doc). */
		function AppFrame({ useStore, useSessions, actions, renderSlot, SessionProvider }) {
			const panels = useStore((s) => s);
			const detailsSession = useSessions((s) => {
				const current = s.current;
				return current !== void 0 && s.byId[current]?.blank === false ? current : void 0;
			});
			const frameRef = (0, react.useRef)(null);
			const [viewport, setViewport] = (0, react.useState)(() => window.innerWidth);
			const [compactMobileHeader] = (0, react.useState)(hasNativeFoldLayout);
			const foldWorkbench = compactMobileHeader && panels.workbench === true;
			const lastSession = (0, react.useRef)(detailsSession);
			(0, react.useLayoutEffect)(() => {
				if (detailsSession === void 0) return;
				if (lastSession.current !== void 0 && lastSession.current !== detailsSession) actions.closeDetails();
				lastSession.current = detailsSession;
			}, [actions, detailsSession]);
			(0, react.useEffect)(() => {
				const el = frameRef.current;
				/* v8 ignore next -- the ref is always attached by effect time: the frame div renders unconditionally. */
				if (el === null) return;
				let raf = null;
				const observer = new ResizeObserver(() => {
					raf ??= requestAnimationFrame(() => {
						raf = null;
						const width = el.getBoundingClientRect().width;
						if (width > 0) setViewport(width);
					});
				});
				observer.observe(el);
				return () => {
					observer.disconnect();
					if (raf !== null) cancelAnimationFrame(raf);
				};
			}, []);
			const narrow = viewport < SIDEBAR_AUTO_COLLAPSE;
			(0, react.useEffect)(() => {
				actions.setNarrow(narrow);
			}, [actions, narrow]);
			const mobile = viewport < 640;
			const drawerLayout = mobile || foldWorkbench;
			const previousMobile = (0, react.useRef)(drawerLayout);
			(0, react.useLayoutEffect)(() => {
				if (previousMobile.current === drawerLayout) return;
				previousMobile.current = drawerLayout;
				const frame = frameRef.current;
				if (!frame) return;
				frame.dataset.layoutChanging = "true";
				let raf = requestAnimationFrame(() => {
					frame.offsetWidth;
					raf = requestAnimationFrame(() => {
						delete frame.dataset.layoutChanging;
					});
				});
				return () => {
					cancelAnimationFrame(raf);
					delete frame.dataset.layoutChanging;
				};
			}, [drawerLayout]);
			(0, react.useEffect)(() => {
				actions.setMobile(drawerLayout);
			}, [actions, drawerLayout]);
			const sidebarCollapsed = narrow ? !panels.narrowExpanded : panels.sidebar === 0;
			const sidebarPreference = sidebarPreferenceForWidth(viewport, panels);
			(0, react.useLayoutEffect)(() => {
				const target = window;
				const inset = (width) => width < 640 ? 0 : foldWorkbench ? width / 2 : computeColumns(width, sidebarPreferenceForWidth(width, panels), 0).sidebar;
				target.__dshNavigationInset = inset;
				return () => {
					if (target.__dshNavigationInset === inset) delete target.__dshNavigationInset;
				};
			}, [
				panels.sidebar,
				panels.narrowExpanded,
				foldWorkbench
			]);
			const cols = computeColumns(viewport, sidebarPreference, detailsSession === void 0 ? 0 : panels.details);
			const colsRef = (0, react.useRef)(cols);
			colsRef.current = cols;
			const sidebarBase = (0, react.useRef)(0);
			const detailsBase = (0, react.useRef)(0);
			const [dragging, setDragging] = (0, react.useState)(false);
			const onDragEnd = (0, react.useCallback)(() => {
				setDragging(false);
			}, []);
			const onSidebarStart = (0, react.useCallback)(() => {
				sidebarBase.current = colsRef.current.sidebar;
				setDragging(true);
			}, []);
			const onDetailsStart = (0, react.useCallback)(() => {
				detailsBase.current = colsRef.current.details;
				setDragging(true);
			}, []);
			const onSidebarDrag = (0, react.useCallback)((dx) => {
				actions.setSidebar(sidebarBase.current + dx);
			}, [actions]);
			const onDetailsDrag = (0, react.useCallback)((dx) => {
				actions.setDetails(detailsBase.current - dx);
			}, [actions]);
			const sheetOpen = detailsSession !== void 0 && panels.details > 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: frameRef,
				"data-app-frame": true,
				className: drawerLayout ? AppFrame_module_css_default.mobileFrame : AppFrame_module_css_default.frame,
				style: drawerLayout ? void 0 : { gridTemplateColumns: `${cols.sidebar}px minmax(0, 1fr) ${cols.details}px` },
				"data-mobile": mobile || void 0,
				"data-compact-header": drawerLayout && compactMobileHeader || void 0,
				"data-fold-workbench": foldWorkbench || void 0,
				"data-sidebar-collapsed": !drawerLayout && sidebarCollapsed || void 0,
				"data-details-collapsed": !drawerLayout && cols.details === 0 || void 0,
				"data-dragging": dragging || void 0,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: AppFrame_module_css_default.mobileTopBar,
						"data-mobile-topbar": true,
						style: drawerLayout ? void 0 : { display: "none" },
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: AppFrame_module_css_default.mobileHamburger,
							"aria-label": panels.drawerOpen ? "收起导航" : "打开导航",
							"aria-expanded": panels.drawerOpen,
							onClick: () => actions.toggleSidebar(),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
								width: "22",
								height: "22",
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "1.7",
								"aria-hidden": "true",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
										x: "3",
										y: "4",
										width: "18",
										height: "16",
										rx: "3"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M9 4v16" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: panels.drawerOpen ? "m16 9-3 3 3 3" : "m13 9 3 3-3 3" })
								]
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: AppFrame_module_css_default.mobileTitle,
							children: "DeepSeek Harness"
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: drawerLayout ? AppFrame_module_css_default.mobileDrawer : AppFrame_module_css_default.sidebarCol,
						"data-open": drawerLayout && panels.drawerOpen || void 0,
						children: renderSlot("sidebar", {
							collapsed: drawerLayout ? false : sidebarCollapsed,
							width: drawerLayout ? 300 : cols.sidebar
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: drawerLayout ? AppFrame_module_css_default.mobileBody : void 0,
						style: drawerLayout ? void 0 : { display: "contents" },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CenterColumn, { children: renderSlot("conversation", {}) })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: drawerLayout ? AppFrame_module_css_default.mobileSheet : void 0,
						style: drawerLayout ? void 0 : { display: "contents" },
						"data-open": drawerLayout && sheetOpen || void 0,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: AppFrame_module_css_default.mobileSheetGrab,
							style: drawerLayout ? void 0 : { display: "none" },
							onClick: () => actions.closeDetails()
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DetailsColumn, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionProvider, { children: renderSlot("details", {}) }) })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: AppFrame_module_css_default.mobileMask,
						style: drawerLayout ? void 0 : { display: "none" },
						"data-open": drawerLayout && panels.drawerOpen || void 0,
						onClick: () => actions.toggleSidebar()
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: AppFrame_module_css_default.overlayLayer,
						"data-shell-overlay": true,
						children: renderSlot("shell.overlay", {})
					}),
					!drawerLayout && !sidebarCollapsed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DragHandle, {
						side: "sidebar",
						left: cols.sidebar,
						onStart: onSidebarStart,
						onDrag: onSidebarDrag,
						onEnd: onDragEnd
					}),
					!drawerLayout && cols.details > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DragHandle, {
						side: "details",
						left: viewport - cols.details,
						onStart: onDetailsStart,
						onDrag: onDetailsDrag,
						onEnd: onDragEnd
					})
				]
			});
		}
		//#endregion
		//#region node_modules/zustand/esm/vanilla.mjs
		const createStoreImpl = (createState) => {
			let state;
			const listeners = /* @__PURE__ */ new Set();
			const setState = (partial, replace) => {
				const nextState = typeof partial === "function" ? partial(state) : partial;
				if (!Object.is(nextState, state)) {
					const previousState = state;
					state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
					listeners.forEach((listener) => listener(state, previousState));
				}
			};
			const getState = () => state;
			const subscribe = (listener) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			};
			const destroy = () => {
				listeners.clear();
			};
			const api = {
				setState,
				getState,
				subscribe,
				destroy
			};
			state = createState(setState, getState, api);
			return api;
		};
		const createStore = (createState) => createState ? createStoreImpl(createState) : createStoreImpl;
		//#endregion
		//#region node_modules/zustand/esm/middleware.mjs
		const subscribeWithSelectorImpl = (fn) => (set, get, api) => {
			const origSubscribe = api.subscribe;
			api.subscribe = (selector, optListener, options) => {
				let listener = selector;
				if (optListener) {
					const equalityFn = (options == null ? void 0 : options.equalityFn) || Object.is;
					let currentSlice = selector(api.getState());
					listener = (state) => {
						const nextSlice = selector(state);
						if (!equalityFn(currentSlice, nextSlice)) {
							const previousSlice = currentSlice;
							optListener(currentSlice = nextSlice, previousSlice);
						}
					};
					if (options == null ? void 0 : options.fireImmediately) optListener(currentSlice, currentSlice);
				}
				return origSubscribe(listener);
			};
			return fn(set, get, api);
		};
		const subscribeWithSelector = subscribeWithSelectorImpl;
		//#endregion
		//#region node_modules/immer/dist/immer.mjs
		var NOTHING = Symbol.for("immer-nothing");
		var DRAFTABLE = Symbol.for("immer-draftable");
		var DRAFT_STATE = Symbol.for("immer-state");
		function die(error, ...args) {
			throw new Error(`[Immer] minified error nr: ${error}. Full error at: https://bit.ly/3cXEKWf`);
		}
		var getPrototypeOf = Object.getPrototypeOf;
		function isDraft(value) {
			return !!value && !!value[DRAFT_STATE];
		}
		function isDraftable(value) {
			if (!value) return false;
			return isPlainObject(value) || Array.isArray(value) || !!value[DRAFTABLE] || !!value.constructor?.[DRAFTABLE] || isMap(value) || isSet(value);
		}
		var objectCtorString = Object.prototype.constructor.toString();
		var cachedCtorStrings = /* @__PURE__ */ new WeakMap();
		function isPlainObject(value) {
			if (!value || typeof value !== "object") return false;
			const proto = Object.getPrototypeOf(value);
			if (proto === null || proto === Object.prototype) return true;
			const Ctor = Object.hasOwnProperty.call(proto, "constructor") && proto.constructor;
			if (Ctor === Object) return true;
			if (typeof Ctor !== "function") return false;
			let ctorString = cachedCtorStrings.get(Ctor);
			if (ctorString === void 0) {
				ctorString = Function.toString.call(Ctor);
				cachedCtorStrings.set(Ctor, ctorString);
			}
			return ctorString === objectCtorString;
		}
		function each(obj, iter, strict = true) {
			if (getArchtype(obj) === 0) (strict ? Reflect.ownKeys(obj) : Object.keys(obj)).forEach((key) => {
				iter(key, obj[key], obj);
			});
			else obj.forEach((entry, index) => iter(index, entry, obj));
		}
		function getArchtype(thing) {
			const state = thing[DRAFT_STATE];
			return state ? state.type_ : Array.isArray(thing) ? 1 : isMap(thing) ? 2 : isSet(thing) ? 3 : 0;
		}
		function has(thing, prop) {
			return getArchtype(thing) === 2 ? thing.has(prop) : Object.prototype.hasOwnProperty.call(thing, prop);
		}
		function set(thing, propOrOldValue, value) {
			const t = getArchtype(thing);
			if (t === 2) thing.set(propOrOldValue, value);
			else if (t === 3) thing.add(value);
			else thing[propOrOldValue] = value;
		}
		function is(x, y) {
			if (x === y) return x !== 0 || 1 / x === 1 / y;
			else return x !== x && y !== y;
		}
		function isMap(target) {
			return target instanceof Map;
		}
		function isSet(target) {
			return target instanceof Set;
		}
		function latest(state) {
			return state.copy_ || state.base_;
		}
		function shallowCopy(base, strict) {
			if (isMap(base)) return new Map(base);
			if (isSet(base)) return new Set(base);
			if (Array.isArray(base)) return Array.prototype.slice.call(base);
			const isPlain = isPlainObject(base);
			if (strict === true || strict === "class_only" && !isPlain) {
				const descriptors = Object.getOwnPropertyDescriptors(base);
				delete descriptors[DRAFT_STATE];
				let keys = Reflect.ownKeys(descriptors);
				for (let i = 0; i < keys.length; i++) {
					const key = keys[i];
					const desc = descriptors[key];
					if (desc.writable === false) {
						desc.writable = true;
						desc.configurable = true;
					}
					if (desc.get || desc.set) descriptors[key] = {
						configurable: true,
						writable: true,
						enumerable: desc.enumerable,
						value: base[key]
					};
				}
				return Object.create(getPrototypeOf(base), descriptors);
			} else {
				const proto = getPrototypeOf(base);
				if (proto !== null && isPlain) return { ...base };
				const obj = Object.create(proto);
				return Object.assign(obj, base);
			}
		}
		function freeze(obj, deep = false) {
			if (isFrozen(obj) || isDraft(obj) || !isDraftable(obj)) return obj;
			if (getArchtype(obj) > 1) Object.defineProperties(obj, {
				set: dontMutateMethodOverride,
				add: dontMutateMethodOverride,
				clear: dontMutateMethodOverride,
				delete: dontMutateMethodOverride
			});
			Object.freeze(obj);
			if (deep) Object.values(obj).forEach((value) => freeze(value, true));
			return obj;
		}
		function dontMutateFrozenCollections() {
			die(2);
		}
		var dontMutateMethodOverride = { value: dontMutateFrozenCollections };
		function isFrozen(obj) {
			if (obj === null || typeof obj !== "object") return true;
			return Object.isFrozen(obj);
		}
		var plugins = {};
		function getPlugin(pluginKey) {
			const plugin = plugins[pluginKey];
			if (!plugin) die(0, pluginKey);
			return plugin;
		}
		var currentScope;
		function getCurrentScope() {
			return currentScope;
		}
		function createScope(parent_, immer_) {
			return {
				drafts_: [],
				parent_,
				immer_,
				canAutoFreeze_: true,
				unfinalizedDrafts_: 0
			};
		}
		function usePatchesInScope(scope, patchListener) {
			if (patchListener) {
				getPlugin("Patches");
				scope.patches_ = [];
				scope.inversePatches_ = [];
				scope.patchListener_ = patchListener;
			}
		}
		function revokeScope(scope) {
			leaveScope(scope);
			scope.drafts_.forEach(revokeDraft);
			scope.drafts_ = null;
		}
		function leaveScope(scope) {
			if (scope === currentScope) currentScope = scope.parent_;
		}
		function enterScope(immer2) {
			return currentScope = createScope(currentScope, immer2);
		}
		function revokeDraft(draft) {
			const state = draft[DRAFT_STATE];
			if (state.type_ === 0 || state.type_ === 1) state.revoke_();
			else state.revoked_ = true;
		}
		function processResult(result, scope) {
			scope.unfinalizedDrafts_ = scope.drafts_.length;
			const baseDraft = scope.drafts_[0];
			if (result !== void 0 && result !== baseDraft) {
				if (baseDraft[DRAFT_STATE].modified_) {
					revokeScope(scope);
					die(4);
				}
				if (isDraftable(result)) {
					result = finalize(scope, result);
					if (!scope.parent_) maybeFreeze(scope, result);
				}
				if (scope.patches_) getPlugin("Patches").generateReplacementPatches_(baseDraft[DRAFT_STATE].base_, result, scope.patches_, scope.inversePatches_);
			} else result = finalize(scope, baseDraft, []);
			revokeScope(scope);
			if (scope.patches_) scope.patchListener_(scope.patches_, scope.inversePatches_);
			return result !== NOTHING ? result : void 0;
		}
		function finalize(rootScope, value, path) {
			if (isFrozen(value)) return value;
			const useStrictIteration = rootScope.immer_.shouldUseStrictIteration();
			const state = value[DRAFT_STATE];
			if (!state) {
				each(value, (key, childValue) => finalizeProperty(rootScope, state, value, key, childValue, path), useStrictIteration);
				return value;
			}
			if (state.scope_ !== rootScope) return value;
			if (!state.modified_) {
				maybeFreeze(rootScope, state.base_, true);
				return state.base_;
			}
			if (!state.finalized_) {
				state.finalized_ = true;
				state.scope_.unfinalizedDrafts_--;
				const result = state.copy_;
				let resultEach = result;
				let isSet2 = false;
				if (state.type_ === 3) {
					resultEach = new Set(result);
					result.clear();
					isSet2 = true;
				}
				each(resultEach, (key, childValue) => finalizeProperty(rootScope, state, result, key, childValue, path, isSet2), useStrictIteration);
				maybeFreeze(rootScope, result, false);
				if (path && rootScope.patches_) getPlugin("Patches").generatePatches_(state, path, rootScope.patches_, rootScope.inversePatches_);
			}
			return state.copy_;
		}
		function finalizeProperty(rootScope, parentState, targetObject, prop, childValue, rootPath, targetIsSet) {
			if (childValue == null) return;
			if (typeof childValue !== "object" && !targetIsSet) return;
			const childIsFrozen = isFrozen(childValue);
			if (childIsFrozen && !targetIsSet) return;
			if (isDraft(childValue)) {
				const res = finalize(rootScope, childValue, rootPath && parentState && parentState.type_ !== 3 && !has(parentState.assigned_, prop) ? rootPath.concat(prop) : void 0);
				set(targetObject, prop, res);
				if (isDraft(res)) rootScope.canAutoFreeze_ = false;
				else return;
			} else if (targetIsSet) targetObject.add(childValue);
			if (isDraftable(childValue) && !childIsFrozen) {
				if (!rootScope.immer_.autoFreeze_ && rootScope.unfinalizedDrafts_ < 1) return;
				if (parentState && parentState.base_ && parentState.base_[prop] === childValue && childIsFrozen) return;
				finalize(rootScope, childValue);
				if ((!parentState || !parentState.scope_.parent_) && typeof prop !== "symbol" && (isMap(targetObject) ? targetObject.has(prop) : Object.prototype.propertyIsEnumerable.call(targetObject, prop))) maybeFreeze(rootScope, childValue);
			}
		}
		function maybeFreeze(scope, value, deep = false) {
			if (!scope.parent_ && scope.immer_.autoFreeze_ && scope.canAutoFreeze_) freeze(value, deep);
		}
		function createProxyProxy(base, parent) {
			const isArray = Array.isArray(base);
			const state = {
				type_: isArray ? 1 : 0,
				scope_: parent ? parent.scope_ : getCurrentScope(),
				modified_: false,
				finalized_: false,
				assigned_: {},
				parent_: parent,
				base_: base,
				draft_: null,
				copy_: null,
				revoke_: null,
				isManual_: false
			};
			let target = state;
			let traps = objectTraps;
			if (isArray) {
				target = [state];
				traps = arrayTraps;
			}
			const { revoke, proxy } = Proxy.revocable(target, traps);
			state.draft_ = proxy;
			state.revoke_ = revoke;
			return proxy;
		}
		var objectTraps = {
			get(state, prop) {
				if (prop === DRAFT_STATE) return state;
				const source = latest(state);
				if (!has(source, prop)) return readPropFromProto(state, source, prop);
				const value = source[prop];
				if (state.finalized_ || !isDraftable(value)) return value;
				if (value === peek(state.base_, prop)) {
					prepareCopy(state);
					return state.copy_[prop] = createProxy(value, state);
				}
				return value;
			},
			has(state, prop) {
				return prop in latest(state);
			},
			ownKeys(state) {
				return Reflect.ownKeys(latest(state));
			},
			set(state, prop, value) {
				const desc = getDescriptorFromProto(latest(state), prop);
				if (desc?.set) {
					desc.set.call(state.draft_, value);
					return true;
				}
				if (!state.modified_) {
					const current2 = peek(latest(state), prop);
					const currentState = current2?.[DRAFT_STATE];
					if (currentState && currentState.base_ === value) {
						state.copy_[prop] = value;
						state.assigned_[prop] = false;
						return true;
					}
					if (is(value, current2) && (value !== void 0 || has(state.base_, prop))) return true;
					prepareCopy(state);
					markChanged(state);
				}
				if (state.copy_[prop] === value && (value !== void 0 || prop in state.copy_) || Number.isNaN(value) && Number.isNaN(state.copy_[prop])) return true;
				state.copy_[prop] = value;
				state.assigned_[prop] = true;
				return true;
			},
			deleteProperty(state, prop) {
				if (peek(state.base_, prop) !== void 0 || prop in state.base_) {
					state.assigned_[prop] = false;
					prepareCopy(state);
					markChanged(state);
				} else delete state.assigned_[prop];
				if (state.copy_) delete state.copy_[prop];
				return true;
			},
			getOwnPropertyDescriptor(state, prop) {
				const owner = latest(state);
				const desc = Reflect.getOwnPropertyDescriptor(owner, prop);
				if (!desc) return desc;
				return {
					writable: true,
					configurable: state.type_ !== 1 || prop !== "length",
					enumerable: desc.enumerable,
					value: owner[prop]
				};
			},
			defineProperty() {
				die(11);
			},
			getPrototypeOf(state) {
				return getPrototypeOf(state.base_);
			},
			setPrototypeOf() {
				die(12);
			}
		};
		var arrayTraps = {};
		each(objectTraps, (key, fn) => {
			arrayTraps[key] = function() {
				arguments[0] = arguments[0][0];
				return fn.apply(this, arguments);
			};
		});
		arrayTraps.deleteProperty = function(state, prop) {
			return arrayTraps.set.call(this, state, prop, void 0);
		};
		arrayTraps.set = function(state, prop, value) {
			return objectTraps.set.call(this, state[0], prop, value, state[0]);
		};
		function peek(draft, prop) {
			const state = draft[DRAFT_STATE];
			return (state ? latest(state) : draft)[prop];
		}
		function readPropFromProto(state, source, prop) {
			const desc = getDescriptorFromProto(source, prop);
			return desc ? `value` in desc ? desc.value : desc.get?.call(state.draft_) : void 0;
		}
		function getDescriptorFromProto(source, prop) {
			if (!(prop in source)) return void 0;
			let proto = getPrototypeOf(source);
			while (proto) {
				const desc = Object.getOwnPropertyDescriptor(proto, prop);
				if (desc) return desc;
				proto = getPrototypeOf(proto);
			}
		}
		function markChanged(state) {
			if (!state.modified_) {
				state.modified_ = true;
				if (state.parent_) markChanged(state.parent_);
			}
		}
		function prepareCopy(state) {
			if (!state.copy_) state.copy_ = shallowCopy(state.base_, state.scope_.immer_.useStrictShallowCopy_);
		}
		var Immer2 = class {
			constructor(config) {
				this.autoFreeze_ = true;
				this.useStrictShallowCopy_ = false;
				this.useStrictIteration_ = true;
				/**
				* The `produce` function takes a value and a "recipe function" (whose
				* return value often depends on the base state). The recipe function is
				* free to mutate its first argument however it wants. All mutations are
				* only ever applied to a __copy__ of the base state.
				*
				* Pass only a function to create a "curried producer" which relieves you
				* from passing the recipe function every time.
				*
				* Only plain objects and arrays are made mutable. All other objects are
				* considered uncopyable.
				*
				* Note: This function is __bound__ to its `Immer` instance.
				*
				* @param {any} base - the initial state
				* @param {Function} recipe - function that receives a proxy of the base state as first argument and which can be freely modified
				* @param {Function} patchListener - optional function that will be called with all the patches produced here
				* @returns {any} a new state, or the initial state if nothing was modified
				*/
				this.produce = (base, recipe, patchListener) => {
					if (typeof base === "function" && typeof recipe !== "function") {
						const defaultBase = recipe;
						recipe = base;
						const self = this;
						return function curriedProduce(base2 = defaultBase, ...args) {
							return self.produce(base2, (draft) => recipe.call(this, draft, ...args));
						};
					}
					if (typeof recipe !== "function") die(6);
					if (patchListener !== void 0 && typeof patchListener !== "function") die(7);
					let result;
					if (isDraftable(base)) {
						const scope = enterScope(this);
						const proxy = createProxy(base, void 0);
						let hasError = true;
						try {
							result = recipe(proxy);
							hasError = false;
						} finally {
							if (hasError) revokeScope(scope);
							else leaveScope(scope);
						}
						usePatchesInScope(scope, patchListener);
						return processResult(result, scope);
					} else if (!base || typeof base !== "object") {
						result = recipe(base);
						if (result === void 0) result = base;
						if (result === NOTHING) result = void 0;
						if (this.autoFreeze_) freeze(result, true);
						if (patchListener) {
							const p = [];
							const ip = [];
							getPlugin("Patches").generateReplacementPatches_(base, result, p, ip);
							patchListener(p, ip);
						}
						return result;
					} else die(1, base);
				};
				this.produceWithPatches = (base, recipe) => {
					if (typeof base === "function") return (state, ...args) => this.produceWithPatches(state, (draft) => base(draft, ...args));
					let patches, inversePatches;
					return [
						this.produce(base, recipe, (p, ip) => {
							patches = p;
							inversePatches = ip;
						}),
						patches,
						inversePatches
					];
				};
				if (typeof config?.autoFreeze === "boolean") this.setAutoFreeze(config.autoFreeze);
				if (typeof config?.useStrictShallowCopy === "boolean") this.setUseStrictShallowCopy(config.useStrictShallowCopy);
				if (typeof config?.useStrictIteration === "boolean") this.setUseStrictIteration(config.useStrictIteration);
			}
			createDraft(base) {
				if (!isDraftable(base)) die(8);
				if (isDraft(base)) base = current(base);
				const scope = enterScope(this);
				const proxy = createProxy(base, void 0);
				proxy[DRAFT_STATE].isManual_ = true;
				leaveScope(scope);
				return proxy;
			}
			finishDraft(draft, patchListener) {
				const state = draft && draft[DRAFT_STATE];
				if (!state || !state.isManual_) die(9);
				const { scope_: scope } = state;
				usePatchesInScope(scope, patchListener);
				return processResult(void 0, scope);
			}
			/**
			* Pass true to automatically freeze all copies created by Immer.
			*
			* By default, auto-freezing is enabled.
			*/
			setAutoFreeze(value) {
				this.autoFreeze_ = value;
			}
			/**
			* Pass true to enable strict shallow copy.
			*
			* By default, immer does not copy the object descriptors such as getter, setter and non-enumrable properties.
			*/
			setUseStrictShallowCopy(value) {
				this.useStrictShallowCopy_ = value;
			}
			/**
			* Pass false to use faster iteration that skips non-enumerable properties
			* but still handles symbols for compatibility.
			*
			* By default, strict iteration is enabled (includes all own properties).
			*/
			setUseStrictIteration(value) {
				this.useStrictIteration_ = value;
			}
			shouldUseStrictIteration() {
				return this.useStrictIteration_;
			}
			applyPatches(base, patches) {
				let i;
				for (i = patches.length - 1; i >= 0; i--) {
					const patch = patches[i];
					if (patch.path.length === 0 && patch.op === "replace") {
						base = patch.value;
						break;
					}
				}
				if (i > -1) patches = patches.slice(i + 1);
				const applyPatchesImpl = getPlugin("Patches").applyPatches_;
				if (isDraft(base)) return applyPatchesImpl(base, patches);
				return this.produce(base, (draft) => applyPatchesImpl(draft, patches));
			}
		};
		function createProxy(value, parent) {
			const draft = isMap(value) ? getPlugin("MapSet").proxyMap_(value, parent) : isSet(value) ? getPlugin("MapSet").proxySet_(value, parent) : createProxyProxy(value, parent);
			(parent ? parent.scope_ : getCurrentScope()).drafts_.push(draft);
			return draft;
		}
		function current(value) {
			if (!isDraft(value)) die(10, value);
			return currentImpl(value);
		}
		function currentImpl(value) {
			if (!isDraftable(value) || isFrozen(value)) return value;
			const state = value[DRAFT_STATE];
			let copy;
			let strict = true;
			if (state) {
				if (!state.modified_) return state.base_;
				state.finalized_ = true;
				copy = shallowCopy(value, state.scope_.immer_.useStrictShallowCopy_);
				strict = state.scope_.immer_.shouldUseStrictIteration();
			} else copy = shallowCopy(value, true);
			each(copy, (key, childValue) => {
				set(copy, key, currentImpl(childValue));
			}, strict);
			if (state) state.finalized_ = false;
			return copy;
		}
		var produce = new Immer2().produce;
		//#endregion
		//#region node_modules/@deepseek-ai/dsh-client-store/lib/index.js
		/**
		* React-free snapshot store engine (zustand vanilla + immer + subscribeWithSelector +
		* rafFlush middleware + opt-in persist + dev freeze) plus the declarative
		* shell over it: {@link defineStore} bakes an init/persist/actions literal
		* into a {@link StoreHandle}, the registration-side store seat of slot
		* terminals. Engine products are bare observables — subscribe/getSnapshot/
		* update/set, NO selector hook. Hook synthesis is ui-renderer's (the one
		* uSES bridge, cached per source at the binding site).
		*/
		/**
		* Notify an observer set without allowing one callback to starve the rest.
		* @param listeners - current observer callbacks; copied before dispatch.
		* @param label - diagnostic owner prefix.
		* @param args - callback arguments.
		*/
		function notifySubscribers(listeners, label, ...args) {
			for (const listener of [...listeners]) try {
				listener(...args);
			} catch (error) {
				console.error(`${label} subscriber failed:`, error);
			}
		}
		/** Batches subscriber notification into one flush per animation frame. */
		function rafBatch(notify) {
			const schedule = typeof requestAnimationFrame === "function" ? (fn) => {
				requestAnimationFrame(() => {
					fn();
				});
			} : (fn) => {
				queueMicrotask(fn);
			};
			let scheduled = false;
			return () => {
				if (scheduled) return;
				scheduled = true;
				schedule(() => {
					scheduled = false;
					notify();
				});
			};
		}
		/**
		* Create a snapshot store.
		*
		* Flush default is 'sync' (controlled inputs need same-tick echo); frame-driven
		* stores opt into 'raf', where a frame's worth of updates coalesces into one
		* notification. Known raf-mode tradeoff: a component mounting mid-frame reads
		* fresh state while existing subscribers hear it next flush — transient
		* frame-level skew, same nature as the object layer's microtask batching.
		*
		* @param init - initial state.
		* @param opts - flush mode and opt-in persistence (localStorage, keyed by name).
		* @returns the store.
		*/
		function createSnapshotStore(init, opts) {
			const withSelector = subscribeWithSelector(() => init);
			const api = createStore()(withSelector);
			if (opts?.persist) attachPersistence(api, opts.persist.name);
			let subscribe = (fn) => api.subscribe(() => {
				notifySubscribers([fn], "[client-store]");
			});
			if (opts?.flush === "raf") {
				const listeners = /* @__PURE__ */ new Set();
				const flush = rafBatch(() => {
					notifySubscribers(listeners, "[client-store]");
				});
				api.subscribe(flush);
				subscribe = (fn) => {
					listeners.add(fn);
					return () => {
						listeners.delete(fn);
					};
				};
			}
			return {
				getSnapshot: () => api.getState(),
				subscribe: (fn) => subscribe(fn),
				update: (mutator) => {
					api.setState(produce(api.getState(), (draft) => {
						mutator(draft);
					}), true);
				},
				set: (next) => {
					api.setState(devFreeze(next), true);
				}
			};
		}
		/**
		* Whole-value JSON persistence to localStorage. Hand-rolled instead of the
		* zustand persist middleware: its write path spreads state into an object
		* (`partialize({ ...get() })`), exploding primitive state (a persisted string
		* draft becomes {0:'h',1:'e',...}) — not fixable via merge/deserialize options
		* because the corruption happens before serialization. Storage failures
		* (quota, private mode) only disable persistence, never break the store.
		*/
		function attachPersistence(api, name) {
			if (typeof localStorage === "undefined") return;
			try {
				const raw = localStorage.getItem(name);
				if (raw !== null) api.setState(devFreeze(JSON.parse(raw)), true);
			} catch (error) {
				console.error(`snapshot store '${name}' rehydration failed:`, error);
			}
			api.subscribe((state) => {
				try {
					localStorage.setItem(name, JSON.stringify(state));
				} catch (error) {
					console.error(`snapshot store '${name}' persistence failed:`, error);
				}
			});
		}
		/** Deep-freeze draftable wholesale-set state outside production: set() bypasses immer's freeze. */
		function devFreeze(value) {
			return freeze(value, true);
		}
		/**
		* Declare a store: initial state, optional persistence, and the full write
		* set as pure draft mutators. The returned handle is the registration
		* currency of the store seat — its identity keys instance sharing. Satisfies
		* ui-slots' DefineStore contract (the handle/instance are the engine-extended
		* subtypes).
		*
		* The `A & ActionsDecl<T>` actions position is load-bearing: T resolves from
		* `init` in the first inference round, and the intersection then contextually
		* types each mutator's draft parameter (context-sensitive functions defer),
		* so call sites write `(d, x: X) => { ... }` with no draft annotation. If a
		* future TS version breaks this single-literal inference, the design's
		* documented fallback is currying (`defineStore(init).actions({...})`).
		* @param decl - init lambda (fresh state per instance), optional persist key, actions table.
		* @returns the store handle.
		*/
		function defineStore(decl) {
			return {
				spec: decl,
				create(scopeKey) {
					const persistKey = decl.persist === void 0 ? void 0 : scopeKey === void 0 ? decl.persist : `${decl.persist}.${scopeKey}`;
					const store = createSnapshotStore(decl.init(), persistKey !== void 0 ? { persist: { name: persistKey } } : void 0);
					const actions = {};
					for (const key of Object.keys(decl.actions)) {
						const mutate = decl.actions[key];
						actions[key] = (...params) => {
							store.update((draft) => {
								mutate(draft, ...params);
							});
						};
					}
					return {
						actions,
						getSnapshot: () => store.getSnapshot(),
						subscribe: (fn) => store.subscribe(fn),
						store,
						clearPersisted: () => {
							if (persistKey === void 0 || typeof localStorage === "undefined") return;
							try {
								localStorage.removeItem(persistKey);
							} catch {}
						}
					};
				}
			};
		}
		//#endregion
		//#region src/client/stores.ts
		/**
		* The root entry's transient layout store: panel geometry as plain widths in
		* px (0 = closed). Module level exports the factory only — a module-level
		* handle would pin the store's identity in the module
		* cache (a de-facto singleton surviving plugin reloads). register() receives
		* the factory (exclusive use: the framework instantiates per entry), AppFrame
		* derives its PropsStore share from the return type, and the service face
		* receives the bound actions through the registration's inject hook.
		*/
		/**
		* The complete write set (package-internal export: pure draft mutators, so
		* columns/stores specs drive them without the runtime's module-loader; the
		* register-time actions table below references this literal). Drag writes
		* clamp into the panel's contract range and never cross the open/closed
		* line; open/close transitions write 0 / the default explicitly. Below the
		* auto-collapse breakpoint (AppFrame feeds setNarrow) the sidebar toggle
		* flips the narrowExpanded override instead of the preference.
		*/
		const layoutActions = {
			setWorkbench: (d, enabled) => {
				if (d.workbench === enabled) return;
				d.workbench = enabled;
				d.drawerOpen = false;
			},
			setSidebar: (d, px) => {
				d.sidebar = clampWidth(px, 264, 420);
			},
			setDetails: (d, px) => {
				d.details = clampWidth(px, 300, 520);
			},
			toggleSidebar: (d) => {
				if (d.mobile) d.drawerOpen = !d.drawerOpen;
				else if (d.narrow) d.narrowExpanded = !d.narrowExpanded;
				else d.sidebar = d.sidebar === 0 ? 280 : 0;
			},
			setNarrow: (d, narrow) => {
				if (d.narrow === narrow) return;
				d.narrow = narrow;
				d.narrowExpanded = false;
			},
			setMobile: (d, mobile) => {
				if (d.mobile === mobile) return;
				d.mobile = mobile;
				if (mobile) d.drawerOpen = false;
			},
			openDetails: (d) => {
				if (d.details === 0) d.details = 360;
			},
			closeDetails: (d) => {
				d.details = 0;
			}
		};
		/**
		* Create the layout panel store handle. The preference IS the width, so
		* closing a panel forgets its drag width — reopening restores the contract
		* default. Actions are the complete write set: drag writes clamp
		* into the panel's contract range and never cross the open/closed line;
		* open/close transitions write 0 / the default explicitly. Below the
		* auto-collapse breakpoint (AppFrame feeds setNarrow) the sidebar toggle
		* flips the narrowExpanded override instead of the preference.
		* @returns the store handle (spec + type + identity + factory in one).
		*/
		function createLayoutStore() {
			return defineStore({
				init: () => ({
					sidebar: 280,
					details: 0,
					narrow: false,
					narrowExpanded: false,
					mobile: false,
					drawerOpen: false
				}),
				actions: layoutActions
			});
		}
		//#endregion
		//#region src/client/service.ts
		/** Cross-plugin panel-action face (ctx.layout). */
		var LayoutController = class {
			#panels;
			/**
			* Adopt the root entry's bound store actions. Called from the root
			* registration's inject hook (a sanctioned assembly side effect), so the
			* face is live from the entry's first render; on entry re-register the
			* fresh actions overwrite the stale set.
			* @param actions - bound actions of the entry's layout store instance.
			*/
			attachPanels(actions) {
				this.#panels = actions;
			}
			setWorkbenchActive(enabled) {
				this.#require().setWorkbench(enabled);
			}
			/** Toggle the sidebar panel (closed ⟷ contract default width). */
			toggleSidebar() {
				this.#require().toggleSidebar();
			}
			/** Open the details panel (no-op when already open). */
			openDetails() {
				this.#require().openDetails();
			}
			/** Close the details panel. */
			closeDetails() {
				this.#require().closeDetails();
			}
			#require() {
				if (this.#panels === void 0) throw new Error("layout: panel actions not wired (root entry not mounted)");
				return this.#panels;
			}
		};
		//#endregion
		//#region src/client/theme-presenter.ts
		/** Body attribute selecting the dark base palette in the token stylesheets. */
		const DARK_ATTRIBUTE = "data-ds-dark-theme";
		/** Applies theme snapshots to the document; one instance per plugin fiber. */
		var ThemePresenter = class ThemePresenter {
			static nextId = 0;
			/** Last-writer marker (L3): global writes (colorScheme/dark attribute) are retracted only by the
			*  last apply'ing instance — under HMR dual fibers / multiple coexisting instances, an earlier
			*  dispose must not clear a later writer's global state. */
			uid = "p" + ThemePresenter.nextId++;
			/** Token variables and the values this presenter wrote (L3: dispose retracts only variables whose
			*  value is still "mine" — when a later writer overrode the same token, the earlier dispose must
			*  not delete the later writer's value). */
			appliedTokens = /* @__PURE__ */ new Map();
			/** The single metadata node this presenter inserts and removes. */
			themeColorMeta;
			/** Create the presenter-owned metadata node before the first snapshot arrives. */
			constructor() {
				this.themeColorMeta = document.createElement("meta");
				this.themeColorMeta.name = "theme-color";
			}
			/**
			* Project a snapshot onto the document: set root `color-scheme` and the body
			* palette attribute from `active.colorScheme` (never the id — `system` is
			* resolved upstream), then replace the previously applied token variables
			* with `active.tokens`. Browser theme-color metadata follows the computed
			* body background after those writes, so the rendered palette remains the
			* color authority.
			* @param snapshot - resolved theme snapshot from ctx.theme.
			*/
			apply(snapshot) {
				const scheme = snapshot.active.colorScheme;
				document.documentElement.style.colorScheme = scheme;
				const body = document.body;
				if (scheme === "dark") body.setAttribute(DARK_ATTRIBUTE, "");
				else body.removeAttribute(DARK_ATTRIBUTE);
				document.documentElement.dataset.dshPresenter = this.uid;
				for (const [name, value] of this.appliedTokens) if (body.style.getPropertyValue(name) === value) body.style.removeProperty(name);
				this.appliedTokens.clear();
				for (const [name, value] of Object.entries(snapshot.active.tokens)) {
					body.style.setProperty(name, value);
					this.appliedTokens.set(name, value);
				}
				const fontSize = `${snapshot.fontSize ?? 14}px`;
				body.style.setProperty("--dsh-content-font-size", fontSize);
				this.appliedTokens.set("--dsh-content-font-size", fontSize);
				this.themeColorMeta.content = getComputedStyle(body).backgroundColor;
				const channels = this.themeColorMeta.content.match(/^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/);
				if (channels) {
					const color = "#" + channels.slice(1, 4).map((v) => Math.min(255, Number(v)).toString(16).padStart(2, "0")).join("");
					window.androidBridge?.setChromeTheme?.(color, scheme === "dark");
				}
				if (!this.themeColorMeta.isConnected) document.head.append(this.themeColorMeta);
			}
			/** Retract what this presenter wrote: global fields only when still owned
			*  (last writer), token variables and the owned metadata node always. */
			dispose() {
				if (document.documentElement.dataset.dshPresenter === this.uid) {
					document.documentElement.style.removeProperty("color-scheme");
					document.body.removeAttribute(DARK_ATTRIBUTE);
					delete document.documentElement.dataset.dshPresenter;
				}
				const body = document.body;
				for (const [name, value] of this.appliedTokens) if (body.style.getPropertyValue(name) === value) body.style.removeProperty(name);
				this.appliedTokens.clear();
				this.themeColorMeta.remove();
			}
		};
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
		//#region src/client/enter-guard.ts
		/**
		* EnterGuard: mobile-form Enter-key semantics.
		*
		* On the phone soft keyboard the Enter (newline) key fires a plain keydown
		* Enter — upstream InputBar treats it as submit (keyboard.submit), and there
		* is no Shift to fall back on. This guard, on the mobile form only
		* (viewport < MOBILE_BREAKPOINT), intercepts a plain Enter inside the
		* composer textarea at document capture phase — before React's root listener
		* — and converts it into a newline insertion, leaving the send button as the
		* only send channel.
		*
		* Guards that must stay untouched:
		* - IME composition (isComposing / keyCode 229): the candidate-confirm Enter.
		* - Open command menu ([role=listbox]): Enter picks the highlighted item.
		* - Shift+Enter (external keyboards): upstream native newline.
		* - Desktop/wide viewport: upstream behavior unchanged.
		*/
		var EnterGuard = class {
			onKeyDown = (event) => {
				if (event.key !== "Enter" || event.shiftKey) return;
				if (event.isComposing || event.keyCode === 229) return;
				const target = event.target;
				if (!(target instanceof HTMLElement)) return;
				if (target.closest("[data-composer-card] textarea") === null) return;
				if (document.querySelector("[role=\"listbox\"]") !== null) return;
				if (window.innerWidth >= 640) return;
				event.stopPropagation();
				event.preventDefault();
				const active = document.activeElement;
				if (active instanceof HTMLTextAreaElement && active === target) try {
					document.execCommand("insertText", false, "\n");
				} catch {}
			};
			attach() {
				document.addEventListener("keydown", this.onKeyDown, { capture: true });
			}
			detach() {
				document.removeEventListener("keydown", this.onKeyDown, { capture: true });
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
		//#region src/client/keyboard-boundary.ts
		/** Keep every Android layout inside the keyboard's visual viewport.
		* Edge-to-edge WebViews can keep innerHeight unchanged and pan the visual
		* viewport to the focused editor. Height alone cannot cancel that pan.
		* Native IME insets gate this behavior; ordinary resize/zoom stays untouched.
		*/
		var KeyboardBoundary = class {
			frame = null;
			originalHeight = "";
			originalTranslate = "";
			seats = /* @__PURE__ */ new Map();
			media = null;
			observer = null;
			attach() {
				this.detach();
				window.visualViewport?.addEventListener("resize", this.onViewportChange);
				window.visualViewport?.addEventListener("scroll", this.onViewportChange);
				this.media = typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 640px)") : null;
				this.media?.addEventListener?.("change", this.onViewportChange);
				this.observer = new MutationObserver(this.onViewportChange);
				this.observer.observe(document.documentElement, {
					attributes: true,
					attributeFilter: ["style"]
				});
				this.onViewportChange();
			}
			detach() {
				window.visualViewport?.removeEventListener("resize", this.onViewportChange);
				window.visualViewport?.removeEventListener("scroll", this.onViewportChange);
				this.media?.removeEventListener?.("change", this.onViewportChange);
				this.observer?.disconnect();
				this.observer = null;
				this.restore();
			}
			onViewportChange = () => {
				const frame = document.querySelector("[data-app-frame], [data-mobile]");
				const ime = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dsh-android-ime-bottom")) || 0;
				const vv = window.visualViewport;
				if (!frame || ime <= 0 || !vv || vv.height <= 0) {
					this.restore();
					return;
				}
				if (this.frame !== frame) {
					this.restore();
					this.frame = frame;
					this.originalHeight = frame.style.height;
					this.originalTranslate = frame.style.translate;
				}
				frame.style.height = `${vv.height}px`;
				frame.style.translate = `0px ${Math.max(0, vv.offsetTop || 0)}px`;
				for (const seat of document.querySelectorAll("[data-composer-seat]")) {
					if (!this.seats.has(seat)) this.seats.set(seat, seat.style.paddingBottom);
					seat.style.paddingBottom = "0px";
				}
			};
			restore() {
				if (this.frame) {
					this.frame.style.height = this.originalHeight;
					this.frame.style.translate = this.originalTranslate;
				}
				this.frame = null;
				for (const [seat, padding] of this.seats) seat.style.paddingBottom = padding;
				this.seats.clear();
			}
		};
		//#endregion
		//#region \0dsh-css:android-shell/dsh-client-ui-responsive/src/client/ExportResultDialog.module.css.mjs
		const css = ".xBZyWa_backdrop{z-index:1;background:var(--dsw-alias-bg-mask-1,#0000003d);justify-content:center;align-items:center;padding:16px;display:flex;position:absolute;inset:0}.xBZyWa_dialog{box-sizing:border-box;background:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l2,#0000001a);width:min(440px,100%);max-height:70%;color:var(--dsw-alias-label-primary,#0f1115);border-radius:12px;flex-direction:column;gap:12px;padding:16px;display:flex;overflow:auto}.xBZyWa_title{margin:0;font-size:16px;font-weight:600}.xBZyWa_detail{overflow-wrap:anywhere;white-space:pre-wrap;margin:0;font-size:13px;line-height:1.5}.xBZyWa_detail[data-status=success]{color:var(--dsw-alias-state-success-primary)}.xBZyWa_detail[data-status=error]{color:var(--dsw-alias-state-error-primary)}.xBZyWa_actions{justify-content:flex-end;display:flex}.xBZyWa_button{border:1px solid var(--dsw-alias-border-l2,#0000001a);background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground,#fff);cursor:pointer;border-radius:8px;padding:8px 14px;font-size:13px}.xBZyWa_button:hover{background:var(--dsw-alias-button-primary-hover)}";
		const tagId = "@dsh-android/dsh-client-ui-responsive/ExportResultDialog.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh-android/dsh-client-ui-responsive";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var ExportResultDialog_module_css_default = {
			"dialog": "xBZyWa_dialog",
			"detail": "xBZyWa_detail",
			"backdrop": "xBZyWa_backdrop",
			"title": "xBZyWa_title",
			"button": "xBZyWa_button",
			"actions": "xBZyWa_actions"
		};
		//#endregion
		//#region src/client/ExportResultDialog.tsx
		/**
		* Export-result dialog: the `shell.overlay` entry that renders the Android
		* shell's session-export outcome. Pure component: state arrives through the
		* store share, dismissal through the bound action. The markup reuses the
		* web-ui dialog conventions (role=dialog / aria-modal) and the shared design
		* tokens, so the dialog matches the app's modal surfaces.
		*/
		/** The single entry component; renders nothing while no result is open. */
		function ExportResultDialog({ useStore, actions }) {
			const state = useStore((s) => s);
			(0, react.useEffect)(() => {
				if (!state.open) return;
				const onKeyDown = (event) => {
					if (event.key === "Escape") actions.close();
				};
				window.addEventListener("keydown", onKeyDown);
				return () => {
					window.removeEventListener("keydown", onKeyDown);
				};
			}, [state.open, actions]);
			if (!state.open) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: ExportResultDialog_module_css_default.backdrop,
				onClick: () => actions.close(),
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
								onClick: () => actions.close(),
								children: "关闭"
							})
						})
					]
				})
			});
		}
		//#endregion
		//#region src/client/export-result.ts
		/**
		* Export-result dialog store: the single transient in-app feedback surface
		* for the shell's session-export download. The shell pushes the outcome from
		* Kotlin through `window.__dshExportResult`; this store carries it into the
		* `shell.overlay` entry. Module level exports the factory only — a module-level
		* handle would pin store identity across plugin reloads.
		*/
		/**
		* Create the export-result store handle. `show` replaces whatever dialog was
		* open, so a second export supersedes a still-open first result; `close` only
		* folds the dialog, never mutates the last result.
		* @returns the store handle (spec + type + identity + factory in one).
		*/
		function createExportResultStore() {
			return defineStore({
				init: () => ({
					open: false,
					ok: true,
					title: "",
					detail: ""
				}),
				actions: {
					show: (d, result) => {
						d.open = true;
						d.ok = result.ok;
						d.title = result.title;
						d.detail = result.detail;
					},
					close: (d) => {
						d.open = false;
					}
				}
			});
		}
		//#endregion
		//#region src/client/mobile-settings.css.ts
		/** Fullscreen settings in the Android drawer: left categories, right content.
		* Fold's workbench also uses this drawer at desktop widths, so never infer
		* horizontal tabs from the drawer ancestor. Each column scrolls independently.
		*/
		const MOBILE_SETTINGS_CSS = `
  [class*="mobileDrawer"] [role='dialog'][aria-modal='true'] {
    width: 100vw;
    max-width: none;
    height: 100vh;
    height: 100dvh;
    max-height: none;
    border-radius: 0;
    flex-direction: row;
  }

  [class*="mobileDrawer"] [role='dialog'][aria-modal='true'] > nav {
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

  [class*="mobileDrawer"] [role='dialog'][aria-modal='true'] > nav > div:first-child {
    flex: none;
    padding: 0 8px;
    white-space: nowrap;
  }

  [class*="mobileDrawer"] [role='dialog'][aria-modal='true'] > nav > div:nth-child(2) {
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-height: 0;
    min-width: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
  }

  [class*="mobileDrawer"] [role='dialog'][aria-modal='true'] > nav > div:nth-child(2) > button {
    flex: none;
    min-height: 40px;
    padding-left: 8px;
    padding-right: 8px;
  }

  [class*="mobileDrawer"] [role='dialog'][aria-modal='true'] > div:nth-child(2) {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  /* Keep the close control reachable while settings content scrolls. */
  [class*="mobileDrawer"] [role='dialog'][aria-modal='true'] > div:nth-child(2) > div:first-child {
    flex-shrink: 0;
    min-height: 52px;
    padding: 4px 8px;
  }
  [class*="mobileDrawer"] [role='dialog'][aria-modal='true'] > div:nth-child(2) > div:first-child > button {
    min-width: 44px;
    min-height: 44px;
  }
`;
		//#endregion
		//#region src/client/composer-menu.css.ts
		/**
		* Composer command-menu scroll fix (upstream ui-input-trigger):
		* .viewport (the menu's scroll container) is a flex child without flex:1,
		* so when the candidate list exceeds max-height (320px), the viewport grows
		* past the menu and gets clipped by the menu's overflow:hidden — the
		* scrollbar lands outside the visible area and the list appears unscrollable.
		* Fix: let the viewport fill the menu and scroll inside it.
		*/
		const COMPOSER_MENU_CSS = `
[data-composer-card] [role='listbox'] > div {
  flex: 1 1 0%;
  min-height: 0;
}

/* The upstream menu limits itself against viewport y=0. On the mobile form,
 * the fixed top bar owns the upper part of that viewport, so the geometry
 * guard writes a stricter cap for each open menu. */
[data-mobile] [data-composer-card] [role='listbox'] {
  max-height: var(--dsh-mobile-menu-max-height, 320px) !important;
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
  [data-mobile] aside[aria-label="Event details"] {
    position: fixed;
    inset: 0;
    z-index: 40;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    border-left: none;
    box-shadow: none;
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  [data-mobile] aside[aria-label="Event details"] [aria-label="Resize event details"] {
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
     在面板开合时切换 data-mobile-ledger-raised）。 */
  [data-mobile] [class*="ledger"]:has(aside[aria-label="Event details"]) {
    z-index: 12;
  }
  [data-mobile] [class*="ledger"].data-mobile-ledger-raised {
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
		* 给所属 ledger 切换 data-mobile-ledger-raised class（trajectory-details.css.ts
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
				if (this.attached && this.ledger !== null) this.ledger.classList.remove("data-mobile-ledger-raised");
				this.attached = false;
			}
			/** 面板存在 → 抬升 ledger（class 路径，CSS .data-mobile-ledger-raised）；否则移除。 */
			sync() {
				if (this.ledger === null) return;
				const panel = this.ledger.querySelector("aside[aria-label=\"Event details\"]");
				this.ledger.classList.toggle("data-mobile-ledger-raised", panel !== null);
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
		//#region src/client/menu-viewport-guard.ts
		/** Maximum command-menu height from the upstream visual specification. */
		const MENU_CAP = 320;
		/** Space kept below the mobile top bar before the command menu begins. */
		const TOPBAR_CLEARANCE = 12;
		/**
		* Calculate the usable height for an upward-opening command menu.
		* The menu bottom is anchored to the composer, while the mobile top bar
		* occupies part of the viewport above it.
		*/
		function mobileMenuMaxHeight(menuBottom, topbarBottom, chromeHeight = 0) {
			return Math.max(0, Math.min(MENU_CAP, Math.floor(menuBottom - topbarBottom - TOPBAR_CLEARANCE - chromeHeight)));
		}
		/**
		* Keeps the upstream bottom-anchored command menu below the mobile top bar.
		* The upstream hook clamps only to viewport top; the frame owns the extra
		* mobile chrome and applies this additional geometric constraint.
		*/
		var MenuViewportGuard = class {
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
			menu = null;
			/** Start observing mobile menu geometry. */
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
			/** Stop observing and remove the transient inline constraint. */
			detach() {
				this.mutationObserver.disconnect();
				this.resizeObserver.disconnect();
				window.removeEventListener("resize", this.onViewportChange);
				window.removeEventListener("scroll", this.onViewportChange, true);
				window.visualViewport?.removeEventListener("resize", this.onViewportChange);
				if (this.frame !== null) cancelAnimationFrame(this.frame);
				this.frame = null;
				this.menu?.style.removeProperty("--dsh-mobile-menu-max-height");
				this.menu = null;
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
				const topbar = document.querySelector("[data-mobile-topbar]");
				const menu = document.querySelector("[data-composer-card] [role=\"listbox\"]");
				if (topbar === null || menu === null) {
					this.menu?.style.removeProperty("--dsh-mobile-menu-max-height");
					this.menu = null;
					this.syncObserved([]);
					return;
				}
				const seat = menu.closest("[data-composer-seat]");
				const card = menu.closest("[data-composer-card]");
				this.menu = menu;
				this.syncObserved([
					topbar,
					seat,
					card
				].filter((element) => element !== null));
				const value = `${mobileMenuMaxHeight(menu.getBoundingClientRect().bottom, topbar.getBoundingClientRect().bottom, menuChromeHeight(menu))}px`;
				if (menu.style.getPropertyValue("--dsh-mobile-menu-max-height") !== value) menu.style.setProperty("--dsh-mobile-menu-max-height", value);
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
					return node.matches("[data-composer-card], [role=\"listbox\"]") || node.querySelector("[data-composer-card], [role=\"listbox\"]") !== null;
				});
			}
		};
		/** Height excluded from CSS max-height when the menu uses content-box sizing. */
		function menuChromeHeight(menu) {
			const style = getComputedStyle(menu);
			if (style.boxSizing === "border-box") return 0;
			return [
				"paddingTop",
				"paddingBottom",
				"borderTopWidth",
				"borderBottomWidth"
			].map((property) => Number.parseFloat(style[property]) || 0).reduce((total, value) => total + value, 0);
		}
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
		*/
		const SESSION_LOG_DIALOG_HIDE_CSS = `
[role="presentation"]:has([role="dialog"][aria-label^="正在导出 Session"]),
[role="presentation"]:has([role="dialog"][aria-label^="Session 导出"]),
[role="presentation"]:has([role="dialog"][aria-label^="Exporting Session"]),
[role="presentation"]:has([role="dialog"][aria-label^="Session download"]),
[role="presentation"]:has([role="dialog"][aria-label^="Session export"]) {
  display: none !important;
}
`;
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
			const [devLog, setDevLog] = (0, react.useState)(() => {
				try {
					return window.androidBridge?.getDevLogEnabled?.() ?? false;
				} catch {
					return false;
				}
			});
			const [overlayOn, setOverlayOn] = (0, react.useState)(() => {
				try {
					return window.androidBridge?.getOverlayEnabled?.() ?? false;
				} catch {
					return false;
				}
			});
			const [overlayMsg, setOverlayMsg] = (0, react.useState)(null);
			const [restarting, setRestarting] = (0, react.useState)(false);
			const [allFiles, setAllFiles] = (0, react.useState)(null);
			const [confirm, setConfirm] = (0, react.useState)(null);
			const [incomingBytes, setIncomingBytes] = (0, react.useState)(null);
			const [incomingMsg, setIncomingMsg] = (0, react.useState)(null);
			const [cleaning, setCleaning] = (0, react.useState)(false);
			const refreshIncoming = (0, react.useCallback)(async () => {
				try {
					const r = await fetch("/api/android/file-incoming");
					if (r.ok) {
						const j = await r.json();
						setIncomingBytes(typeof j.bytes === "number" ? j.bytes : null);
					}
				} catch {}
			}, []);
			(0, react.useEffect)(() => {
				refreshIncoming();
			}, [refreshIncoming]);
			const cleanIncoming = (0, react.useCallback)(async () => {
				setCleaning(true);
				setIncomingMsg(null);
				try {
					const j = await (await fetch("/api/android/file-incoming/clean", { method: "POST" })).json().catch(() => null);
					setIncomingMsg(j?.ok ? `已清空临时工作区（${j.removed ?? 0} 项）——相关会话中的文件引用将失效` : "清理失败");
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
			(0, react.useEffect)(() => {
				try {
					setAllFiles(window.androidBridge?.hasAllFilesAccess?.() ?? false);
				} catch {
					setAllFiles(false);
				}
			}, []);
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
				setDevLog(enabled);
				try {
					window.androidBridge?.setDevLogEnabled?.(enabled);
				} catch {}
			}, []);
			const toggleOverlay = (0, react.useCallback)((enabled) => {
				setOverlayOn(enabled);
				setOverlayMsg(null);
				try {
					const started = window.androidBridge?.setOverlayEnabled?.(enabled) ?? false;
					if (enabled && !started) setOverlayMsg("未授予悬浮窗权限——已打开系统授权页，返回后自动生效（也可在开发者选项重新开关）");
					else if (enabled) setOverlayMsg("悬浮球已开启：任意界面可拖拽；点开面板实时查看工具调用，可一键停止");
					else setOverlayMsg("悬浮球已关闭");
				} catch {
					setOverlayMsg("桥不可用（仅安卓宿主支持悬浮球）");
				}
			}, []);
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
			const logPathHint = allFiles === false ? "未授予「所有文件访问」：日志将写入应用私有目录，授权后自动切换公共目录。" : "开启后按天写入 Documents/dshdata/log/dsh-<日期>.log。";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-plugin": "dev-section",
				onKeyDown,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-dev-note",
						children: "Android 壳调试设施：控制台为快照内嵌 Termux bash；日志默认关闭。"
					}),
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "dsh-dev-row dsh-dev-switch",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: overlayOn,
							onChange: (e) => toggleOverlay(e.target.checked)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "悬浮球（实时查看 AI 工作，可一键停止）" })]
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-dev-hint",
						children: "导出位置 Documents/dshdata/exports/config/settings.yaml；用文件管理器修改后点「导入配置」即可生效。 配置不含 API 密钥（密钥在应用私有目录，不随导出泄漏）。"
					}),
					incomingBytes !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-dev-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["文件直达临时工作区占用：", fmtBytes(incomingBytes)] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-dev-btn dsh-dev-danger",
							disabled: cleaning || incomingBytes === 0,
							onClick: () => void cleanIncoming(),
							children: cleaning ? "清理中…" : "一键清理"
						})]
					}),
					incomingMsg !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-dev-hint",
						children: incomingMsg
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-dev-hint",
						children: "清理会删除临时工作区内的外部文件；相关会话中的文件引用将失效（D15：纯手动清理，无自动清理）。"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-dev-hint",
						children: logPathHint
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-dev-warn",
						children: "日志包含命令与模型内容，仅用于排查，请及时清理。"
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
  padding: 20px;
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
		* The shell bridge exists (androidBridge.setImmersiveMode, persisted by
		* MainActivity) and the row registers at the upstream settings.general.item
		* extension point (auto projected into the General section nav), mirroring
		* DevSection.
		*
		* 0.13.3 (D6 收益省略): the font-size slider (WebView textZoom, 50–200%)
		* retired — upstream ui-theme now ships a native fontSize field (12–17px
		* content font size) rendered in the Appearance section with persistence.
		* The shell's setTextZoom bridge and persistence were removed with it.
		* The immersive toggle reads localStorage (dsh.android.immersive, written by
		* the patched index.html immersive script) for its initial state.
		*/
		const IMMERSIVE_KEY = "dsh.android.immersive";
		/** Read the persisted immersive flag with the same default the shell uses (true). */
		function readImmersive() {
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
			const [immersive, setImmersive] = (0, react.useState)(readImmersive);
			(0, react.useEffect)(() => {
				setImmersive(readImmersive());
			}, []);
			const toggleImmersive = (0, react.useCallback)((enabled) => {
				setImmersive(enabled);
				try {
					localStorage.setItem(IMMERSIVE_KEY, enabled ? "1" : "0");
				} catch {}
				try {
					window.androidBridge?.setImmersiveMode?.(enabled);
				} catch {}
			}, []);
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
		//#region src/client/index.ts
		/** Required services (cordis fiber inject — the loader passes all module exports as an object plugin). */
		const inject = [
			"slots",
			"theme",
			"sessions"
		];
		/**
		* Client plugin body: provide ctx.layout, then one register() call — AppFrame
		* into 'root' with the four child-slot declarations, the layout store seat,
		* and the inject hook that hands the store's bound actions to the service.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
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
			const layout = new LayoutController();
			ctx.effect(() => {
				const disposeService = ctx.reflect.provide("layout", layout);
				const disposeRegistration = ctx.slots.register({
					name: "root",
					children: {
						"sidebar": {
							kind: "single",
							scope: "root"
						},
						"conversation": {
							kind: "single",
							scope: "session-maybe"
						},
						"details": {
							kind: "single",
							scope: "session"
						},
						"shell.overlay": {
							kind: "list",
							scope: "root"
						}
					},
					store: createLayoutStore,
					inject: (actions) => {
						layout.attachPanels(actions);
						return {};
					}
				}, AppFrame);
				return () => {
					disposeRegistration();
					disposeService();
				};
			}, "ui-layout: service + root registration");
			ctx.effect(() => {
				const style = document.createElement("style");
				style.setAttribute("data-plugin", "mobile-settings");
				style.textContent = MOBILE_SETTINGS_CSS;
				document.head.appendChild(style);
				return () => {
					style.remove();
				};
			}, "ui-layout: mobile settings styles");
			ctx.effect(() => {
				const style = document.createElement("style");
				style.setAttribute("data-plugin", "dev-section");
				style.textContent = DEV_SECTION_CSS;
				document.head.appendChild(style);
				return () => {
					style.remove();
				};
			}, "ui-layout: dev section styles");
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
			ctx.effect(() => {
				const style = document.createElement("style");
				style.setAttribute("data-plugin", "composer-row");
				style.textContent = COMPOSER_ROW_CSS;
				document.head.appendChild(style);
				return () => {
					style.remove();
				};
			}, "ui-layout: composer row narrow fix");
			ctx.effect(() => {
				const style = document.createElement("style");
				style.setAttribute("data-plugin", "composer-insets");
				style.textContent = COMPOSER_INSETS_CSS;
				document.head.appendChild(style);
				return () => {
					style.remove();
				};
			}, "ui-layout: composer insets adaptation");
			ctx.effect(() => {
				const style = document.createElement("style");
				style.setAttribute("data-plugin", "composer-menu");
				style.textContent = COMPOSER_MENU_CSS;
				document.head.appendChild(style);
				return () => {
					style.remove();
				};
			}, "ui-layout: composer menu scroll fix");
			ctx.effect(() => {
				const style = document.createElement("style");
				style.setAttribute("data-plugin", "trajectory-details");
				style.textContent = TRAJECTORY_DETAILS_CSS;
				document.head.appendChild(style);
				const observer = new TrajectoryPanelsObserver(document.querySelector("[class*=\"ledger\"]"));
				observer.attach();
				return () => {
					observer.detach();
					style.remove();
				};
			}, "ui-layout: trajectory details full-viewport overlay + :has() fallback");
			ctx.effect(() => {
				const guard = new MenuViewportGuard();
				guard.attach();
				return () => {
					guard.detach();
				};
			}, "ui-layout: mobile command menu top clearance");
			ctx.effect(() => {
				const style = document.createElement("style");
				style.setAttribute("data-plugin", "session-log-dialog");
				style.textContent = SESSION_LOG_DIALOG_HIDE_CSS;
				document.head.appendChild(style);
				return () => {
					style.remove();
				};
			}, "ui-layout: hide upstream session-log dialog");
			ctx.effect(() => {
				const presenter = new ThemePresenter();
				presenter.apply(ctx.theme.getTheme());
				const off = ctx.on("theme/change", (snapshot) => {
					presenter.apply(snapshot);
				});
				return () => {
					off();
					presenter.dispose();
				};
			}, "ui-layout: theme presenter");
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
			}, "ui-layout: mobile enter guard");
			ctx.effect(() => {
				const boundary = new KeyboardBoundary();
				boundary.attach();
				return () => {
					boundary.detach();
				};
			}, "ui-layout: keyboard boundary");
			ctx.effect(() => {
				new ThemeBridge().install();
				return () => {};
			}, "ui-layout: theme bridge");
			let exportActions;
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "export-result",
				store: createExportResultStore,
				inject: (actions) => {
					exportActions = actions;
					return {};
				}
			}, ExportResultDialog));
			ctx.effect(() => {
				const opened = /* @__PURE__ */ new Set();
				let busy = false;
				const poll = async () => {
					if (busy) return;
					busy = true;
					try {
						const r = await fetch("/api/android/file-incoming");
						if (!r.ok) return;
						const j = await r.json().catch(() => null);
						if (!j?.items) return;
						for (const item of j.items) {
							if (!item.sessionId || opened.has(item.sessionId)) continue;
							try {
								ctx.sessions.open(item.sessionId);
								opened.add(item.sessionId);
								fetch("/api/android/file-incoming/claim", {
									method: "POST",
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
			ctx.effect(() => {
				const onResult = (event) => {
					const payload = event.detail;
					if (payload === null || typeof payload !== "object") return;
					if (typeof payload.ok !== "boolean" || typeof payload.title !== "string" || typeof payload.detail !== "string") return;
					exportActions?.show(payload);
				};
				const bridge = (payload) => {
					window.dispatchEvent(new CustomEvent("dsh:export-result", { detail: payload }));
				};
				window.__dshExportResult = bridge;
				window.addEventListener("dsh:export-result", onResult);
				return () => {
					window.removeEventListener("dsh:export-result", onResult);
					delete window.__dshExportResult;
				};
			}, "ui-layout: export result dialog bridge");
		}
		//#endregion
		exports.LayoutController = LayoutController;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map