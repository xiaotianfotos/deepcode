window.__ModuleLoader__.load({
	id: "relay-dsh-plugin-codex",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
		//#endregion
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region advanced-debug-preference.mjs
		const ADVANCED_DEBUG_STORAGE_KEY = "relay.ui.advanced-debug";
		var AdvancedDebugPreference = class {
			constructor({ storage = availableStorage(), eventTarget = availableEventTarget() } = {}) {
				this.storage = storage;
				this.eventTarget = eventTarget;
				this.listeners = /* @__PURE__ */ new Set();
				this.value = readPreference(storage);
				this.onStorage = (event) => {
					if (event?.key !== "relay.ui.advanced-debug") return;
					this.update(readPreference(this.storage), false);
				};
				this.eventTarget?.addEventListener?.("storage", this.onStorage);
			}
			getSnapshot = () => this.value;
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => this.listeners.delete(listener);
			};
			set(enabled) {
				this.update(Boolean(enabled), true);
			}
			dispose() {
				this.eventTarget?.removeEventListener?.("storage", this.onStorage);
				this.listeners.clear();
			}
			update(next, persist) {
				if (persist) writePreference(this.storage, next);
				if (next === this.value) return;
				this.value = next;
				for (const listener of this.listeners) listener();
			}
		};
		function readPreference(storage) {
			try {
				return storage?.getItem?.(ADVANCED_DEBUG_STORAGE_KEY) === "true";
			} catch {
				return false;
			}
		}
		function writePreference(storage, enabled) {
			try {
				storage?.setItem?.(ADVANCED_DEBUG_STORAGE_KEY, enabled ? "true" : "false");
			} catch {}
		}
		function availableStorage() {
			try {
				return globalThis.localStorage;
			} catch {
				return;
			}
		}
		function availableEventTarget() {
			return globalThis.window;
		}
		//#endregion
		//#region dsh-client-compat.mjs
		function sessionPreset(session) {
			if (session?.projectionValues && Object.hasOwn(session.projectionValues, "agentPreset")) return session.projectionValues.agentPreset;
			return session?.agentPreset;
		}
		const service = (ctx, name) => typeof ctx.get === "function" ? ctx.get(name) : ctx[name];
		function modelDirectory(ctx, sessionId) {
			const directories = service(ctx, "modelDirectories");
			if (directories) return directories.directoryFor(sessionId);
			const sessions = service(ctx, "connection")?.api?.sessions;
			if (!sessions) throw new Error("DSH model selection interface is unavailable");
			return {
				async load() {
					const response = await sessions.models({ sessionId });
					if (!response.result.ok) throw new Error("DSH model discovery failed");
					return response.result.value;
				},
				async select(selection) {
					if (!(await sessions.selectModel({
						sessionId,
						...selection
					})).result.ok) throw new Error("DSH model selection failed");
				}
			};
		}
		//#endregion
		//#region model-selection.mjs
		const DEFAULT_RETRY_DELAYS_MS = Object.freeze([
			50,
			250,
			1e3
		]);
		function installModelSelection(ctx, preset, provider, otherProvider, { retryDelaysMs = DEFAULT_RETRY_DELAYS_MS } = {}) {
			const operations = /* @__PURE__ */ new Map();
			const desired = /* @__PURE__ */ new Map();
			const pending = /* @__PURE__ */ new Set();
			const retryTimers = /* @__PURE__ */ new Map();
			let stopped = false;
			let nextGeneration = 1;
			const clearRetry = (id) => {
				const timer = retryTimers.get(id);
				if (timer !== void 0) clearTimeout(timer);
				retryTimers.delete(id);
			};
			const currentTarget = (id, target) => {
				const list = ctx.sessions.list.getSnapshot();
				const latest = list.byId[id];
				return !stopped && list.current === id && latest?.blank === true && desired.get(id)?.generation === target.generation && sessionPreset(latest) === target.selectedPreset;
			};
			const retry = (id, target) => {
				if (!currentTarget(id, target) || retryTimers.has(id)) return;
				const delay = retryDelaysMs[target.retry];
				if (delay === void 0) return;
				target.retry += 1;
				retryTimers.set(id, setTimeout(() => {
					retryTimers.delete(id);
					if (currentTarget(id, target)) reconcile(id, target);
				}, delay));
			};
			const reconcile = async (id, target) => {
				if (!currentTarget(id, target) || operations.has(id)) return;
				operations.set(id, target.generation);
				try {
					const directory = modelDirectory(ctx, id);
					const models = await directory.load();
					if (!currentTarget(id, target)) return;
					if (!models.current) {
						retry(id, target);
						return;
					}
					const currentProvider = models.current.provider;
					const group = target.selectedPreset === preset ? models.groups.find((candidate) => candidate.id === provider) : currentProvider === provider ? models.groups.find((candidate) => candidate.id !== provider && candidate.id !== otherProvider) : null;
					if (target.selectedPreset === preset && currentProvider === provider) return;
					if (!group || group.models.length === 0) {
						retry(id, target);
						return;
					}
					const model = group.models[0];
					await directory.select({
						provider: group.id,
						model: model.id,
						...model.reasoning?.defaultEffort ? { reasoningEffort: model.reasoning.defaultEffort } : {}
					});
					if (!currentTarget(id, target)) return;
					clearRetry(id);
				} catch {
					retry(id, target);
				} finally {
					operations.delete(id);
					if (pending.delete(id)) sync();
				}
			};
			const sync = () => {
				if (stopped) return;
				const list = ctx.sessions.list.getSnapshot();
				const id = list.current;
				if (id === void 0 || list.byId[id]?.blank !== true) return;
				const selectedPreset = sessionPreset(list.byId[id]);
				if (selectedPreset !== preset && selectedPreset === otherProvider) return;
				const desiredKey = `${selectedPreset ?? "standard"}`;
				let target = desired.get(id);
				if (!target || target.key !== desiredKey) {
					clearRetry(id);
					target = {
						key: desiredKey,
						selectedPreset,
						generation: nextGeneration++,
						retry: 0
					};
					desired.set(id, target);
				}
				if (operations.has(id)) {
					pending.add(id);
					return;
				}
				reconcile(id, target);
			};
			const off = ctx.sessions.list.subscribe(sync);
			sync();
			return () => {
				stopped = true;
				off();
				for (const id of retryTimers.keys()) clearRetry(id);
			};
		}
		//#endregion
		//#region \0relay-css-module:./src/client/AdvancedDebug.module.css.mjs
		const css$3 = ".Y4qSZW_section{width:100%;max-width:780px;color:var(--dsw-alias-label-primary)}.Y4qSZW_settingRow{border-bottom:1px solid var(--dsw-alias-border-l2);justify-content:space-between;align-items:center;gap:20px;min-height:58px;padding:8px 0;display:flex}.Y4qSZW_statusRow{border-bottom:1px solid var(--dsw-alias-border-l2);align-items:flex-start;gap:10px;min-height:70px;padding:10px 0;display:flex}.Y4qSZW_statusDot{background:var(--dsw-alias-label-tertiary);border-radius:50%;flex:none;width:8px;height:8px;margin-top:6px}.Y4qSZW_statusRow[data-codex-status=connected] .Y4qSZW_statusDot{background:#27a65b}.Y4qSZW_statusRow[data-codex-status=connection-failed] .Y4qSZW_statusDot,.Y4qSZW_statusRow[data-codex-status=unavailable] .Y4qSZW_statusDot,.Y4qSZW_statusRow[data-codex-status=rebind-required] .Y4qSZW_statusDot{background:#d94841}.Y4qSZW_settingCopy code{color:var(--dsw-alias-label-tertiary);font-size:11px}.Y4qSZW_statusBadge{border-radius:999px;padding:2px 7px;font-size:11px;font-weight:600;line-height:16px}.Y4qSZW_statusError{color:#d94841;background:#d9484124}.Y4qSZW_statusRebind{color:#a95d00;background:#c26a0029}.Y4qSZW_settingCopy{flex-direction:column;gap:2px;min-width:0;display:flex}.Y4qSZW_settingCopy strong{font-size:14px;font-weight:500;line-height:20px}.Y4qSZW_settingCopy span{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.Y4qSZW_switch{cursor:pointer;flex:none;width:36px;height:20px;display:inline-flex;position:relative}.Y4qSZW_switch input{opacity:0;width:1px;height:1px;position:absolute}.Y4qSZW_switch span{background:var(--dsw-alias-fill-l2);border-radius:10px;width:100%;transition:background-color .12s}.Y4qSZW_switch span:after{background:var(--dsw-alias-bg-layer-1);content:\"\";border-radius:50%;width:16px;height:16px;transition:transform .12s;position:absolute;top:2px;left:2px;box-shadow:0 1px 3px #0003}.Y4qSZW_switch input:checked+span{background:var(--dsw-alias-state-business-primary)}.Y4qSZW_switch input:checked+span:after{transform:translate(16px)}.Y4qSZW_switch input:focus-visible+span{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.Y4qSZW_marker{display:none}[data-relay-simple-conversation=true] [role=tablist]{display:none}";
		const tagId$3 = "relay-dsh-plugin-codex/AdvancedDebug.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$3) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "relay-dsh-plugin-codex";
			tag.dataset.pluginCss = tagId$3;
			tag.textContent = css$3;
			document.head.appendChild(tag);
		}
		var AdvancedDebug_module_css_default = {
			"marker": "Y4qSZW_marker",
			"section": "Y4qSZW_section",
			"settingCopy": "Y4qSZW_settingCopy",
			"settingRow": "Y4qSZW_settingRow",
			"statusBadge": "Y4qSZW_statusBadge",
			"statusDot": "Y4qSZW_statusDot",
			"statusError": "Y4qSZW_statusError",
			"statusRebind": "Y4qSZW_statusRebind",
			"statusRow": "Y4qSZW_statusRow",
			"switch": "Y4qSZW_switch"
		};
		//#endregion
		//#region src/client/codex-status-client.mjs
		const CODEX_STATUS_PATH = "/api/relay/codex/status";
		async function fetchCodexStatus(sessionId, fetchImpl = fetch) {
			const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
			const response = await fetchImpl(`${CODEX_STATUS_PATH}${query}`, {
				method: "GET",
				headers: { accept: "application/json" }
			});
			const body = await response.json().catch(() => null);
			if (!response.ok || !validStatus(body)) throw new Error(body?.message ?? `Codex status failed with HTTP ${response.status}`);
			return body;
		}
		function statusLocaleKey(status) {
			if (!status) return "statusLoading";
			if (status.state === "connected") return "statusConnected";
			if (status.state === "not-started") return "statusNotStarted";
			if (status.state === "starting") return "statusStarting";
			if (status.state === "rebind-required") return "statusRebindRequired";
			if (status.state === "unavailable") return "statusUnavailable";
			return "statusConnectionFailed";
		}
		function validStatus(value) {
			return value !== null && typeof value === "object" && typeof value.state === "string" && typeof value.code === "string" && typeof value.message === "string";
		}
		//#endregion
		//#region src/client/CodexStatus.tsx
		function useCodexStatus(sessionId, enabled = true) {
			const [status, setStatus] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				if (!enabled) {
					setStatus(null);
					return;
				}
				let active = true;
				const refresh = () => {
					fetchCodexStatus(sessionId).then((value) => {
						if (active) setStatus(value);
					}).catch(() => {
						if (active) setStatus({
							state: "connection-failed",
							code: "CODEX_STATUS_UNAVAILABLE",
							message: "DSH could not read Codex connection status.",
							action: "Restart DSH and try again.",
							changedAt: Date.now()
						});
					});
				};
				refresh();
				const timer = window.setInterval(refresh, 5e3);
				window.addEventListener("focus", refresh);
				return () => {
					active = false;
					window.clearInterval(timer);
					window.removeEventListener("focus", refresh);
				};
			}, [sessionId, enabled]);
			return status;
		}
		function CodexStatusBadge({ sessionId, useSessions, t }) {
			const preset = useSessions((state) => sessionPreset(state.byId[sessionId]));
			const status = useCodexStatus(String(sessionId), preset === "relay-codex");
			if (preset !== "relay-codex" || status === null || status.state === "connected") return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: `${AdvancedDebug_module_css_default.statusBadge} ${status.state === "rebind-required" ? AdvancedDebug_module_css_default.statusRebind : AdvancedDebug_module_css_default.statusError}`,
				title: `${status.message} ${status.action ?? ""}`.trim(),
				"data-codex-status": status.state,
				children: t(statusLocaleKey(status))
			});
		}
		//#endregion
		//#region src/client/AdvancedDebug.tsx
		function AdvancedDebugSection({ useAdvancedDebug, setAdvancedDebug, t }) {
			const enabled = useAdvancedDebug((value) => value);
			const codexStatus = useCodexStatus();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: AdvancedDebug_module_css_default.section,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: AdvancedDebug_module_css_default.statusRow,
					"data-codex-status": codexStatus?.state ?? "loading",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: AdvancedDebug_module_css_default.statusDot,
						"aria-hidden": "true"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: AdvancedDebug_module_css_default.settingCopy,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [
								t("statusTitle"),
								": ",
								t(statusLocaleKey(codexStatus))
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: codexStatus === null ? t("statusLoadingDetail") : `${codexStatus.message} ${codexStatus.action ?? ""}`.trim() }),
							codexStatus !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: codexStatus.code })
						]
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: AdvancedDebug_module_css_default.settingRow,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: AdvancedDebug_module_css_default.settingCopy,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("advancedDebug") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("advancedDebugDetail") })]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: AdvancedDebug_module_css_default.switch,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							role: "switch",
							"aria-label": t("advancedDebug"),
							checked: enabled,
							onChange: (event) => {
								setAdvancedDebug(event.currentTarget.checked);
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { "aria-hidden": "true" })]
					})]
				})]
			});
		}
		function AdvancedDebugGuard({ useAdvancedDebug }) {
			const enabled = useAdvancedDebug((value) => value);
			const marker = (0, react.useRef)(null);
			(0, react.useLayoutEffect)(() => {
				const header = marker.current?.closest("header");
				if (header === void 0 || header === null) return;
				if (enabled) header.removeAttribute("data-relay-simple-conversation");
				else {
					const selectChat = () => {
						const chatTab = header.querySelector("[role=\"tablist\"] [role=\"tab\"]");
						if (chatTab?.getAttribute("aria-selected") !== "true") chatTab?.click();
					};
					selectChat();
					header.setAttribute("data-relay-simple-conversation", "true");
					const observer = new MutationObserver(selectChat);
					observer.observe(header, {
						attributes: true,
						attributeFilter: ["aria-selected"],
						childList: true,
						subtree: true
					});
					return () => {
						observer.disconnect();
						header.removeAttribute("data-relay-simple-conversation");
					};
				}
				return () => {
					header.removeAttribute("data-relay-simple-conversation");
				};
			}, [enabled]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				ref: marker,
				className: AdvancedDebug_module_css_default.marker,
				"aria-hidden": "true"
			});
		}
		function HiddenSessionLogAction() {
			return null;
		}
		/**
		* @license lucide-react v1.37.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		//#endregion
		//#region codex-activity-wire.mjs
		var import_lucide_react = (/* @__PURE__ */ __commonJSMin(((exports) => {
			var react$1 = require("react");
			const hasA11yProp = (props) => {
				for (const prop in props) if (prop.startsWith("aria-") || prop === "role" || prop === "title") return true;
				return false;
			};
			const mergeClasses = (...classes) => classes.filter((className, index, array) => {
				return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
			}).join(" ").trim();
			const toCamelCase = (string) => string.replace(/^([A-Z])|[\s-_]+(\w)/g, (match, p1, p2) => p2 ? p2.toUpperCase() : p1.toLowerCase());
			const toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
			const toPascalCase = (string) => {
				const camelCase = toCamelCase(string);
				return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
			};
			var defaultAttributes = {
				xmlns: "http://www.w3.org/2000/svg",
				width: 24,
				height: 24,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 2,
				strokeLinecap: "round",
				strokeLinejoin: "round"
			};
			const LucideContext = react$1.createContext({});
			const useLucideContext = () => react$1.useContext(LucideContext);
			const Icon = react$1.forwardRef(({ color, size, strokeWidth, absoluteStrokeWidth, className = "", children, iconNode, ...rest }, ref) => {
				const { size: contextSize = 24, strokeWidth: contextStrokeWidth = 2, absoluteStrokeWidth: contextAbsoluteStrokeWidth = false, color: contextColor = "currentColor", className: contextClass = "" } = useLucideContext() ?? {};
				const calculatedStrokeWidth = absoluteStrokeWidth ?? contextAbsoluteStrokeWidth ? Number(strokeWidth ?? contextStrokeWidth) * 24 / Number(size ?? contextSize) : strokeWidth ?? contextStrokeWidth;
				return react$1.createElement("svg", {
					ref,
					...defaultAttributes,
					width: size ?? contextSize ?? defaultAttributes.width,
					height: size ?? contextSize ?? defaultAttributes.height,
					stroke: color ?? contextColor,
					strokeWidth: calculatedStrokeWidth,
					className: mergeClasses("lucide", contextClass, className),
					...!children && !hasA11yProp(rest) && { "aria-hidden": "true" },
					...rest
				}, [...iconNode.map(([tag, attrs]) => react$1.createElement(tag, attrs)), ...Array.isArray(children) ? children : [children]]);
			});
			const createLucideIcon = (iconName, iconNode) => {
				const Component = react$1.forwardRef(({ className, ...props }, ref) => react$1.createElement(Icon, {
					ref,
					iconNode,
					className: mergeClasses(`lucide-${toKebabCase(toPascalCase(iconName))}`, `lucide-${iconName}`, className),
					...props
				}));
				Component.displayName = toPascalCase(iconName);
				return Component;
			};
			createLucideIcon("a-arrow-down", [
				["path", {
					d: "m14 12 4 4 4-4",
					key: "buelq4"
				}],
				["path", {
					d: "M18 16V7",
					key: "ty0viw"
				}],
				["path", {
					d: "m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16",
					key: "d5nyq2"
				}],
				["path", {
					d: "M3.304 13h6.392",
					key: "1q3zxz"
				}]
			]);
			createLucideIcon("a-arrow-up", [
				["path", {
					d: "m14 11 4-4 4 4",
					key: "1pu57t"
				}],
				["path", {
					d: "M18 16V7",
					key: "ty0viw"
				}],
				["path", {
					d: "m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16",
					key: "d5nyq2"
				}],
				["path", {
					d: "M3.304 13h6.392",
					key: "1q3zxz"
				}]
			]);
			createLucideIcon("a-large-small", [
				["path", {
					d: "m15 16 2.536-7.328a1.02 1.02 1 0 1 1.928 0L22 16",
					key: "xik6mr"
				}],
				["path", {
					d: "M15.697 14h5.606",
					key: "1stdlc"
				}],
				["path", {
					d: "m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16",
					key: "d5nyq2"
				}],
				["path", {
					d: "M3.304 13h6.392",
					key: "1q3zxz"
				}]
			]);
			createLucideIcon("activity", [["path", {
				d: "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",
				key: "169zse"
			}]]);
			createLucideIcon("accessibility", [
				["circle", {
					cx: "16",
					cy: "4",
					r: "1",
					key: "1grugj"
				}],
				["path", {
					d: "m18 19 1-7-6 1",
					key: "r0i19z"
				}],
				["path", {
					d: "m5 8 3-3 5.5 3-2.36 3.5",
					key: "9ptxx2"
				}],
				["path", {
					d: "M4.24 14.5a5 5 0 0 0 6.88 6",
					key: "10kmtu"
				}],
				["path", {
					d: "M13.76 17.5a5 5 0 0 0-6.88-6",
					key: "2qq6rc"
				}]
			]);
			createLucideIcon("ad", [
				["path", {
					d: "M10 13H6",
					key: "18d9xh"
				}],
				["path", {
					d: "M10 15v-4a2 2 0 0 0-4 0v4",
					key: "ss28p3"
				}],
				["path", {
					d: "M14 14.5a.5.5 0 0 0 .5.5h1a2.5 2.5 0 0 0 2.5-2.5v-1A2.5 2.5 0 0 0 15.5 9h-1a.5.5 0 0 0-.5.5z",
					key: "b3f847"
				}],
				["rect", {
					x: "2",
					y: "5",
					width: "20",
					height: "14",
					rx: "2",
					key: "qneu4z"
				}]
			]);
			createLucideIcon("air-vent", [
				["path", {
					d: "M18 17.5a2.5 2.5 0 1 1-4 2.03V12",
					key: "yd12zl"
				}],
				["path", {
					d: "M6 12H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2",
					key: "larmp2"
				}],
				["path", {
					d: "M6 8h12",
					key: "6g4wlu"
				}],
				["path", {
					d: "M6.6 15.572A2 2 0 1 0 10 17v-5",
					key: "1x1kqn"
				}]
			]);
			createLucideIcon("alarm-clock-check", [
				["circle", {
					cx: "12",
					cy: "13",
					r: "8",
					key: "3y4lt7"
				}],
				["path", {
					d: "M5 3 2 6",
					key: "18tl5t"
				}],
				["path", {
					d: "m22 6-3-3",
					key: "1opdir"
				}],
				["path", {
					d: "M6.38 18.7 4 21",
					key: "17xu3x"
				}],
				["path", {
					d: "M17.64 18.67 20 21",
					key: "kv2oe2"
				}],
				["path", {
					d: "m9 13 2 2 4-4",
					key: "6343dt"
				}]
			]);
			createLucideIcon("alarm-clock-off", [
				["path", {
					d: "M6.87 6.87a8 8 0 1 0 11.26 11.26",
					key: "3on8tj"
				}],
				["path", {
					d: "M19.9 14.25a8 8 0 0 0-9.15-9.15",
					key: "15ghsc"
				}],
				["path", {
					d: "m22 6-3-3",
					key: "1opdir"
				}],
				["path", {
					d: "M6.26 18.67 4 21",
					key: "yzmioq"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M4 4 2 6",
					key: "1ycko6"
				}]
			]);
			createLucideIcon("airplay", [["path", {
				d: "M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1",
				key: "ns4c3b"
			}], ["path", {
				d: "m12 15 5 6H7Z",
				key: "14qnn2"
			}]]);
			createLucideIcon("alarm-clock-plus", [
				["circle", {
					cx: "12",
					cy: "13",
					r: "8",
					key: "3y4lt7"
				}],
				["path", {
					d: "M5 3 2 6",
					key: "18tl5t"
				}],
				["path", {
					d: "m22 6-3-3",
					key: "1opdir"
				}],
				["path", {
					d: "M6.38 18.7 4 21",
					key: "17xu3x"
				}],
				["path", {
					d: "M17.64 18.67 20 21",
					key: "kv2oe2"
				}],
				["path", {
					d: "M12 10v6",
					key: "1bos4e"
				}],
				["path", {
					d: "M9 13h6",
					key: "1uhe8q"
				}]
			]);
			createLucideIcon("alarm-clock-minus", [
				["circle", {
					cx: "12",
					cy: "13",
					r: "8",
					key: "3y4lt7"
				}],
				["path", {
					d: "M5 3 2 6",
					key: "18tl5t"
				}],
				["path", {
					d: "m22 6-3-3",
					key: "1opdir"
				}],
				["path", {
					d: "M6.38 18.7 4 21",
					key: "17xu3x"
				}],
				["path", {
					d: "M17.64 18.67 20 21",
					key: "kv2oe2"
				}],
				["path", {
					d: "M9 13h6",
					key: "1uhe8q"
				}]
			]);
			createLucideIcon("alarm-clock", [
				["circle", {
					cx: "12",
					cy: "13",
					r: "8",
					key: "3y4lt7"
				}],
				["path", {
					d: "M12 9v4l2 2",
					key: "1c63tq"
				}],
				["path", {
					d: "M5 3 2 6",
					key: "18tl5t"
				}],
				["path", {
					d: "m22 6-3-3",
					key: "1opdir"
				}],
				["path", {
					d: "M6.38 18.7 4 21",
					key: "17xu3x"
				}],
				["path", {
					d: "M17.64 18.67 20 21",
					key: "kv2oe2"
				}]
			]);
			createLucideIcon("alarm-smoke", [
				["path", {
					d: "M11 21c0-2.5 2-2.5 2-5",
					key: "1sicvv"
				}],
				["path", {
					d: "M16 21c0-2.5 2-2.5 2-5",
					key: "1o3eny"
				}],
				["path", {
					d: "m19 8-.8 3a1.25 1.25 0 0 1-1.2 1H7a1.25 1.25 0 0 1-1.2-1L5 8",
					key: "1bvca4"
				}],
				["path", {
					d: "M21 3a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a1 1 0 0 1 1-1z",
					key: "x3qr1j"
				}],
				["path", {
					d: "M6 21c0-2.5 2-2.5 2-5",
					key: "i3w1gp"
				}]
			]);
			createLucideIcon("album", [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2",
				ry: "2",
				key: "1m3agn"
			}], ["polyline", {
				points: "11 3 11 11 14 8 17 11 17 3",
				key: "1wcwz3"
			}]]);
			createLucideIcon("align-center-horizontal", [
				["path", {
					d: "M2 12h20",
					key: "9i4pu4"
				}],
				["path", {
					d: "M10 16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4",
					key: "11f1s0"
				}],
				["path", {
					d: "M10 8V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v4",
					key: "t14dx9"
				}],
				["path", {
					d: "M20 16v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1",
					key: "1w07xs"
				}],
				["path", {
					d: "M14 8V7c0-1.1.9-2 2-2h2a2 2 0 0 1 2 2v1",
					key: "1apec2"
				}]
			]);
			createLucideIcon("align-center-vertical", [
				["path", {
					d: "M12 2v20",
					key: "t6zp3m"
				}],
				["path", {
					d: "M8 10H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2h4",
					key: "14d6g8"
				}],
				["path", {
					d: "M16 10h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4",
					key: "1e2lrw"
				}],
				["path", {
					d: "M8 20H7a2 2 0 0 1-2-2v-2c0-1.1.9-2 2-2h1",
					key: "1fkdwx"
				}],
				["path", {
					d: "M16 14h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1",
					key: "1euafb"
				}]
			]);
			createLucideIcon("align-end-horizontal", [
				["rect", {
					width: "6",
					height: "16",
					x: "4",
					y: "2",
					rx: "2",
					key: "z5wdxg"
				}],
				["rect", {
					width: "6",
					height: "9",
					x: "14",
					y: "9",
					rx: "2",
					key: "um7a8w"
				}],
				["path", {
					d: "M22 22H2",
					key: "19qnx5"
				}]
			]);
			createLucideIcon("align-end-vertical", [
				["rect", {
					width: "16",
					height: "6",
					x: "2",
					y: "4",
					rx: "2",
					key: "10wcwx"
				}],
				["rect", {
					width: "9",
					height: "6",
					x: "9",
					y: "14",
					rx: "2",
					key: "4p5bwg"
				}],
				["path", {
					d: "M22 22V2",
					key: "12ipfv"
				}]
			]);
			createLucideIcon("align-horizontal-distribute-center", [
				["rect", {
					width: "6",
					height: "14",
					x: "4",
					y: "5",
					rx: "2",
					key: "1wwnby"
				}],
				["rect", {
					width: "6",
					height: "10",
					x: "14",
					y: "7",
					rx: "2",
					key: "1fe6j6"
				}],
				["path", {
					d: "M17 22v-5",
					key: "4b6g73"
				}],
				["path", {
					d: "M17 7V2",
					key: "hnrr36"
				}],
				["path", {
					d: "M7 22v-3",
					key: "1r4jpn"
				}],
				["path", {
					d: "M7 5V2",
					key: "liy1u9"
				}]
			]);
			createLucideIcon("align-horizontal-distribute-end", [
				["rect", {
					width: "6",
					height: "14",
					x: "4",
					y: "5",
					rx: "2",
					key: "1wwnby"
				}],
				["rect", {
					width: "6",
					height: "10",
					x: "14",
					y: "7",
					rx: "2",
					key: "1fe6j6"
				}],
				["path", {
					d: "M10 2v20",
					key: "uyc634"
				}],
				["path", {
					d: "M20 2v20",
					key: "1tx262"
				}]
			]);
			createLucideIcon("align-horizontal-distribute-start", [
				["rect", {
					width: "6",
					height: "14",
					x: "4",
					y: "5",
					rx: "2",
					key: "1wwnby"
				}],
				["rect", {
					width: "6",
					height: "10",
					x: "14",
					y: "7",
					rx: "2",
					key: "1fe6j6"
				}],
				["path", {
					d: "M4 2v20",
					key: "gtpd5x"
				}],
				["path", {
					d: "M14 2v20",
					key: "tg6bpw"
				}]
			]);
			createLucideIcon("align-horizontal-justify-center", [
				["rect", {
					width: "6",
					height: "14",
					x: "2",
					y: "5",
					rx: "2",
					key: "dy24zr"
				}],
				["rect", {
					width: "6",
					height: "10",
					x: "16",
					y: "7",
					rx: "2",
					key: "13zkjt"
				}],
				["path", {
					d: "M12 2v20",
					key: "t6zp3m"
				}]
			]);
			createLucideIcon("align-horizontal-justify-end", [
				["rect", {
					width: "6",
					height: "14",
					x: "2",
					y: "5",
					rx: "2",
					key: "dy24zr"
				}],
				["rect", {
					width: "6",
					height: "10",
					x: "12",
					y: "7",
					rx: "2",
					key: "1ht384"
				}],
				["path", {
					d: "M22 2v20",
					key: "40qfg1"
				}]
			]);
			createLucideIcon("align-horizontal-justify-start", [
				["rect", {
					width: "6",
					height: "14",
					x: "6",
					y: "5",
					rx: "2",
					key: "hsirpf"
				}],
				["rect", {
					width: "6",
					height: "10",
					x: "16",
					y: "7",
					rx: "2",
					key: "13zkjt"
				}],
				["path", {
					d: "M2 2v20",
					key: "1ivd8o"
				}]
			]);
			createLucideIcon("align-horizontal-space-around", [
				["rect", {
					width: "6",
					height: "10",
					x: "9",
					y: "7",
					rx: "2",
					key: "yn7j0q"
				}],
				["path", {
					d: "M4 22V2",
					key: "tsjzd3"
				}],
				["path", {
					d: "M20 22V2",
					key: "1bnhr8"
				}]
			]);
			createLucideIcon("align-start-horizontal", [
				["rect", {
					width: "6",
					height: "16",
					x: "4",
					y: "6",
					rx: "2",
					key: "1n4dg1"
				}],
				["rect", {
					width: "6",
					height: "9",
					x: "14",
					y: "6",
					rx: "2",
					key: "17khns"
				}],
				["path", {
					d: "M22 2H2",
					key: "fhrpnj"
				}]
			]);
			createLucideIcon("align-horizontal-space-between", [
				["rect", {
					width: "6",
					height: "14",
					x: "3",
					y: "5",
					rx: "2",
					key: "j77dae"
				}],
				["rect", {
					width: "6",
					height: "10",
					x: "15",
					y: "7",
					rx: "2",
					key: "bq30hj"
				}],
				["path", {
					d: "M3 2v20",
					key: "1d2pfg"
				}],
				["path", {
					d: "M21 2v20",
					key: "p059bm"
				}]
			]);
			createLucideIcon("align-start-vertical", [
				["rect", {
					width: "9",
					height: "6",
					x: "6",
					y: "14",
					rx: "2",
					key: "lpm2y7"
				}],
				["rect", {
					width: "16",
					height: "6",
					x: "6",
					y: "4",
					rx: "2",
					key: "rdj6ps"
				}],
				["path", {
					d: "M2 2v20",
					key: "1ivd8o"
				}]
			]);
			createLucideIcon("align-vertical-distribute-center", [
				["path", {
					d: "M22 17h-3",
					key: "1lwga1"
				}],
				["path", {
					d: "M22 7h-5",
					key: "o2endc"
				}],
				["path", {
					d: "M5 17H2",
					key: "1gx9xc"
				}],
				["path", {
					d: "M7 7H2",
					key: "6bq26l"
				}],
				["rect", {
					x: "5",
					y: "14",
					width: "14",
					height: "6",
					rx: "2",
					key: "1qrzuf"
				}],
				["rect", {
					x: "7",
					y: "4",
					width: "10",
					height: "6",
					rx: "2",
					key: "we8e9z"
				}]
			]);
			createLucideIcon("align-vertical-distribute-end", [
				["rect", {
					width: "14",
					height: "6",
					x: "5",
					y: "14",
					rx: "2",
					key: "jmoj9s"
				}],
				["rect", {
					width: "10",
					height: "6",
					x: "7",
					y: "4",
					rx: "2",
					key: "aza5on"
				}],
				["path", {
					d: "M2 20h20",
					key: "owomy5"
				}],
				["path", {
					d: "M2 10h20",
					key: "1ir3d8"
				}]
			]);
			createLucideIcon("align-vertical-distribute-start", [
				["rect", {
					width: "14",
					height: "6",
					x: "5",
					y: "14",
					rx: "2",
					key: "jmoj9s"
				}],
				["rect", {
					width: "10",
					height: "6",
					x: "7",
					y: "4",
					rx: "2",
					key: "aza5on"
				}],
				["path", {
					d: "M2 14h20",
					key: "myj16y"
				}],
				["path", {
					d: "M2 4h20",
					key: "mda7wb"
				}]
			]);
			createLucideIcon("align-vertical-justify-center", [
				["rect", {
					width: "14",
					height: "6",
					x: "5",
					y: "16",
					rx: "2",
					key: "1i8z2d"
				}],
				["rect", {
					width: "10",
					height: "6",
					x: "7",
					y: "2",
					rx: "2",
					key: "ypihtt"
				}],
				["path", {
					d: "M2 12h20",
					key: "9i4pu4"
				}]
			]);
			createLucideIcon("align-vertical-justify-end", [
				["rect", {
					width: "14",
					height: "6",
					x: "5",
					y: "12",
					rx: "2",
					key: "4l4tp2"
				}],
				["rect", {
					width: "10",
					height: "6",
					x: "7",
					y: "2",
					rx: "2",
					key: "ypihtt"
				}],
				["path", {
					d: "M2 22h20",
					key: "272qi7"
				}]
			]);
			createLucideIcon("align-vertical-justify-start", [
				["rect", {
					width: "14",
					height: "6",
					x: "5",
					y: "16",
					rx: "2",
					key: "1i8z2d"
				}],
				["rect", {
					width: "10",
					height: "6",
					x: "7",
					y: "6",
					rx: "2",
					key: "13squh"
				}],
				["path", {
					d: "M2 2h20",
					key: "1ennik"
				}]
			]);
			createLucideIcon("align-vertical-space-around", [
				["rect", {
					width: "10",
					height: "6",
					x: "7",
					y: "9",
					rx: "2",
					key: "b1zbii"
				}],
				["path", {
					d: "M22 20H2",
					key: "1p1f7z"
				}],
				["path", {
					d: "M22 4H2",
					key: "1b7qnq"
				}]
			]);
			createLucideIcon("align-vertical-space-between", [
				["rect", {
					width: "14",
					height: "6",
					x: "5",
					y: "15",
					rx: "2",
					key: "1w91an"
				}],
				["rect", {
					width: "10",
					height: "6",
					x: "7",
					y: "3",
					rx: "2",
					key: "17wqzy"
				}],
				["path", {
					d: "M2 21h20",
					key: "1nyx9w"
				}],
				["path", {
					d: "M2 3h20",
					key: "91anmk"
				}]
			]);
			createLucideIcon("ambulance", [
				["path", {
					d: "M10 10H6",
					key: "1bsnug"
				}],
				["path", {
					d: "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2",
					key: "wrbu53"
				}],
				["path", {
					d: "M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.578-.502l-1.539-3.076A1 1 0 0 0 16.382 8H14",
					key: "lrkjwd"
				}],
				["path", {
					d: "M8 8v4",
					key: "1fwk8c"
				}],
				["path", {
					d: "M9 18h6",
					key: "x1upvd"
				}],
				["circle", {
					cx: "17",
					cy: "18",
					r: "2",
					key: "332jqn"
				}],
				["circle", {
					cx: "7",
					cy: "18",
					r: "2",
					key: "19iecd"
				}]
			]);
			createLucideIcon("ampersand", [["path", {
				d: "M16 12h3",
				key: "4uvgyw"
			}], ["path", {
				d: "M17.5 12a8 8 0 0 1-8 8A4.5 4.5 0 0 1 5 15.5c0-6 8-4 8-8.5a3 3 0 1 0-6 0c0 3 2.5 8.5 12 13",
				key: "nfoe1t"
			}]]);
			createLucideIcon("amphora", [
				["path", {
					d: "M10 2v5.632c0 .424-.272.795-.653.982A6 6 0 0 0 6 14c.006 4 3 7 5 8",
					key: "1h8rid"
				}],
				["path", {
					d: "M10 5H8a2 2 0 0 0 0 4h.68",
					key: "3ezsi6"
				}],
				["path", {
					d: "M14 2v5.632c0 .424.272.795.652.982A6 6 0 0 1 18 14c0 4-3 7-5 8",
					key: "yt6q09"
				}],
				["path", {
					d: "M14 5h2a2 2 0 0 1 0 4h-.68",
					key: "8f95yk"
				}],
				["path", {
					d: "M18 22H6",
					key: "mg6kv4"
				}],
				["path", {
					d: "M9 2h6",
					key: "1jrp98"
				}]
			]);
			createLucideIcon("anchor", [
				["path", {
					d: "M12 6v16",
					key: "nqf5sj"
				}],
				["path", {
					d: "m19 13 2-1a9 9 0 0 1-18 0l2 1",
					key: "y7qv08"
				}],
				["path", {
					d: "M9 11h6",
					key: "1fldmi"
				}],
				["circle", {
					cx: "12",
					cy: "4",
					r: "2",
					key: "muu5ef"
				}]
			]);
			createLucideIcon("ampersands", [["path", {
				d: "M10 17c-5-3-7-7-7-9a2 2 0 0 1 4 0c0 2.5-5 2.5-5 6 0 1.7 1.3 3 3 3 2.8 0 5-2.2 5-5",
				key: "12lh1k"
			}], ["path", {
				d: "M22 17c-5-3-7-7-7-9a2 2 0 0 1 4 0c0 2.5-5 2.5-5 6 0 1.7 1.3 3 3 3 2.8 0 5-2.2 5-5",
				key: "173c68"
			}]]);
			createLucideIcon("angle", [["path", {
				d: "M3 3v16a2 2 0 0 0 2 2h16",
				key: "c24i48"
			}], ["path", {
				d: "M3 11a10 10 0 0 1 10 10",
				key: "jhvw44"
			}]]);
			createLucideIcon("antenna", [
				["path", {
					d: "M2 12 7 2",
					key: "117k30"
				}],
				["path", {
					d: "m7 12 5-10",
					key: "1tvx22"
				}],
				["path", {
					d: "m12 12 5-10",
					key: "ev1o1a"
				}],
				["path", {
					d: "m17 12 5-10",
					key: "1e4ti3"
				}],
				["path", {
					d: "M4.5 7h15",
					key: "vlsxkz"
				}],
				["path", {
					d: "M12 16v6",
					key: "c8a4gj"
				}]
			]);
			createLucideIcon("anvil", [
				["path", {
					d: "M7 10H6a4 4 0 0 1-4-4 1 1 0 0 1 1-1h4",
					key: "1hjpb6"
				}],
				["path", {
					d: "M7 5a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1 7 7 0 0 1-7 7H8a1 1 0 0 1-1-1z",
					key: "1qn45f"
				}],
				["path", {
					d: "M9 12v5",
					key: "3anwtq"
				}],
				["path", {
					d: "M15 12v5",
					key: "5xh3zn"
				}],
				["path", {
					d: "M5 20a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3 1 1 0 0 1-1 1H6a1 1 0 0 1-1-1",
					key: "1fi4x8"
				}]
			]);
			createLucideIcon("aperture", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["path", {
					d: "m14.31 8 5.74 9.94",
					key: "1y6ab4"
				}],
				["path", {
					d: "M9.69 8h11.48",
					key: "1wxppr"
				}],
				["path", {
					d: "m7.38 12 5.74-9.94",
					key: "1grp0k"
				}],
				["path", {
					d: "M9.69 16 3.95 6.06",
					key: "libnyf"
				}],
				["path", {
					d: "M14.31 16H2.83",
					key: "x5fava"
				}],
				["path", {
					d: "m16.62 12-5.74 9.94",
					key: "1vwawt"
				}]
			]);
			createLucideIcon("app-window", [
				["rect", {
					x: "2",
					y: "4",
					width: "20",
					height: "16",
					rx: "2",
					key: "izxlao"
				}],
				["path", {
					d: "M10 4v4",
					key: "pp8u80"
				}],
				["path", {
					d: "M2 8h20",
					key: "d11cs7"
				}],
				["path", {
					d: "M6 4v4",
					key: "1svtjw"
				}]
			]);
			createLucideIcon("app-window-mac", [
				["rect", {
					width: "20",
					height: "16",
					x: "2",
					y: "4",
					rx: "2",
					key: "18n3k1"
				}],
				["path", {
					d: "M6 8h.01",
					key: "x9i8wu"
				}],
				["path", {
					d: "M10 8h.01",
					key: "1r9ogq"
				}],
				["path", {
					d: "M14 8h.01",
					key: "1primd"
				}]
			]);
			createLucideIcon("archive-restore", [
				["rect", {
					width: "20",
					height: "5",
					x: "2",
					y: "3",
					rx: "1",
					key: "1wp1u1"
				}],
				["path", {
					d: "M4 8v11a2 2 0 0 0 2 2h2",
					key: "tvwodi"
				}],
				["path", {
					d: "M20 8v11a2 2 0 0 1-2 2h-2",
					key: "1gkqxj"
				}],
				["path", {
					d: "m9 15 3-3 3 3",
					key: "1pd0qc"
				}],
				["path", {
					d: "M12 12v9",
					key: "192myk"
				}]
			]);
			createLucideIcon("apple", [["path", {
				d: "M12 6.528V3a1 1 0 0 1 1-1h0",
				key: "11qiee"
			}], ["path", {
				d: "M18.237 21A15 15 0 0 0 22 11a6 6 0 0 0-10-4.472A6 6 0 0 0 2 11a15.1 15.1 0 0 0 3.763 10 3 3 0 0 0 3.648.648 5.5 5.5 0 0 1 5.178 0A3 3 0 0 0 18.237 21",
				key: "110c12"
			}]]);
			createLucideIcon("archive-x", [
				["rect", {
					width: "20",
					height: "5",
					x: "2",
					y: "3",
					rx: "1",
					key: "1wp1u1"
				}],
				["path", {
					d: "M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8",
					key: "1s80jp"
				}],
				["path", {
					d: "m9.5 17 5-5",
					key: "nakeu6"
				}],
				["path", {
					d: "m9.5 12 5 5",
					key: "1hccrj"
				}]
			]);
			createLucideIcon("archive", [
				["rect", {
					width: "20",
					height: "5",
					x: "2",
					y: "3",
					rx: "1",
					key: "1wp1u1"
				}],
				["path", {
					d: "M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8",
					key: "1s80jp"
				}],
				["path", {
					d: "M10 12h4",
					key: "a56b0p"
				}]
			]);
			createLucideIcon("armchair", [
				["path", {
					d: "M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3",
					key: "irtipd"
				}],
				["path", {
					d: "M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z",
					key: "1qyhux"
				}],
				["path", {
					d: "M5 18v2",
					key: "ppbyun"
				}],
				["path", {
					d: "M19 18v2",
					key: "gy7782"
				}]
			]);
			createLucideIcon("arrow-big-down-dash", [["path", {
				d: "M14 8a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h3.293a.707.707 0 0 1 .5 1.207l-6.939 6.939a1.207 1.207 0 0 1-1.708 0l-6.94-6.94a.707.707 0 0 1 .5-1.206H8a1 1 0 0 0 1-1V9a1 1 0 0 1 1-1z",
				key: "1b91ra"
			}], ["path", {
				d: "M9 4h6",
				key: "10am2s"
			}]]);
			createLucideIcon("arrow-big-left-dash", [["path", {
				d: "M13 9a1 1 0 0 1-1-1V4.707a.707.707 0 0 0-1.207-.5l-6.94 6.94a1.207 1.207 0 0 0 0 1.707l6.94 6.94a.707.707 0 0 0 1.207-.5V16a1 1 0 0 1 1-1h2a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1z",
				key: "17jy80"
			}], ["path", {
				d: "M20 9v6",
				key: "14roy0"
			}]]);
			createLucideIcon("arrow-big-down", [["path", {
				d: "M9 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6a1 1 0 0 0 1 1h3.293a.707.707 0 0 1 .5 1.207l-7.086 7.086a1 1 0 0 1-1.414 0l-7.086-7.086a.707.707 0 0 1 .5-1.207H8a1 1 0 0 0 1-1z",
				key: "1o3tkq"
			}]]);
			createLucideIcon("arrow-big-left", [["path", {
				d: "M10.793 19.793a.707.707 0 0 0 1.207-.5V16a1 1 0 0 1 1-1h6a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1h-6a1 1 0 0 1-1-1V4.707a.707.707 0 0 0-1.207-.5l-6.94 6.94a1.207 1.207 0 0 0 0 1.707z",
				key: "qbhtmx"
			}]]);
			createLucideIcon("arrow-big-right-dash", [["path", {
				d: "M11 9a1 1 0 0 0 1-1V4.707a.707.707 0 0 1 1.207-.5l6.94 6.94a1.207 1.207 0 0 1 0 1.707l-6.94 6.94a.707.707 0 0 1-1.207-.5V16a1 1 0 0 0-1-1H9a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z",
				key: "9idyso"
			}], ["path", {
				d: "M4 9v6",
				key: "bns7oa"
			}]]);
			createLucideIcon("arrow-big-right", [["path", {
				d: "M13.207 19.793a.707.707 0 0 1-1.207-.5V16a1 1 0 0 0-1-1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h6a1 1 0 0 0 1-1V4.707a.707.707 0 0 1 1.207-.5l6.94 6.94a1.207 1.207 0 0 1 0 1.707z",
				key: "zee3eo"
			}]]);
			createLucideIcon("arrow-big-up-dash", [["path", {
				d: "M14 16a1 1 0 0 0 1-1v-2a1 1 0 0 1 1-1h3.293a.707.707 0 0 0 .5-1.207l-6.939-6.939a1.207 1.207 0 0 0-1.708 0l-6.94 6.94a.707.707 0 0 0 .5 1.206H8a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1z",
				key: "q57loy"
			}], ["path", {
				d: "M9 20h6",
				key: "s66wpe"
			}]]);
			createLucideIcon("arrow-big-up", [["path", {
				d: "M9 19a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-6a1 1 0 0 1 1-1h3.293a.707.707 0 0 0 .5-1.207l-7.086-7.086a1 1 0 0 0-1.414 0l-7.086 7.086a.707.707 0 0 0 .5 1.207H8a1 1 0 0 1 1 1z",
				key: "106j91"
			}]]);
			createLucideIcon("arrow-down-0-1", [
				["path", {
					d: "m3 16 4 4 4-4",
					key: "1co6wj"
				}],
				["path", {
					d: "M7 20V4",
					key: "1yoxec"
				}],
				["rect", {
					x: "15",
					y: "4",
					width: "4",
					height: "6",
					ry: "2",
					key: "1bwicg"
				}],
				["path", {
					d: "M17 20v-6h-2",
					key: "1qp1so"
				}],
				["path", {
					d: "M15 20h4",
					key: "1j968p"
				}]
			]);
			createLucideIcon("arrow-down-1-0", [
				["path", {
					d: "m3 16 4 4 4-4",
					key: "1co6wj"
				}],
				["path", {
					d: "M7 20V4",
					key: "1yoxec"
				}],
				["path", {
					d: "M17 10V4h-2",
					key: "zcsr5x"
				}],
				["path", {
					d: "M15 10h4",
					key: "id2lce"
				}],
				["rect", {
					x: "15",
					y: "14",
					width: "4",
					height: "6",
					ry: "2",
					key: "33xykx"
				}]
			]);
			createLucideIcon("arrow-down-a-z", [
				["path", {
					d: "m3 16 4 4 4-4",
					key: "1co6wj"
				}],
				["path", {
					d: "M7 20V4",
					key: "1yoxec"
				}],
				["path", {
					d: "M20 8h-5",
					key: "1vsyxs"
				}],
				["path", {
					d: "M15 10V6.5a2.5 2.5 0 0 1 5 0V10",
					key: "ag13bf"
				}],
				["path", {
					d: "M15 14h5l-5 6h5",
					key: "ur5jdg"
				}]
			]);
			createLucideIcon("arrow-down-from-line", [
				["path", {
					d: "M19 3H5",
					key: "1236rx"
				}],
				["path", {
					d: "M12 21V7",
					key: "gj6g52"
				}],
				["path", {
					d: "m6 15 6 6 6-6",
					key: "h15q88"
				}]
			]);
			createLucideIcon("arrow-down-left", [["path", {
				d: "M17 7 7 17",
				key: "15tmo1"
			}], ["path", {
				d: "M17 17H7V7",
				key: "1org7z"
			}]]);
			createLucideIcon("arrow-down-narrow-wide", [
				["path", {
					d: "m3 16 4 4 4-4",
					key: "1co6wj"
				}],
				["path", {
					d: "M7 20V4",
					key: "1yoxec"
				}],
				["path", {
					d: "M11 4h4",
					key: "6d7r33"
				}],
				["path", {
					d: "M11 8h7",
					key: "djye34"
				}],
				["path", {
					d: "M11 12h10",
					key: "1438ji"
				}]
			]);
			createLucideIcon("arrow-down-right", [["path", {
				d: "m7 7 10 10",
				key: "1fmybs"
			}], ["path", {
				d: "M17 7v10H7",
				key: "6fjiku"
			}]]);
			createLucideIcon("arrow-down-to-dot", [
				["path", {
					d: "M12 2v14",
					key: "jyx4ut"
				}],
				["path", {
					d: "m19 9-7 7-7-7",
					key: "1oe3oy"
				}],
				["circle", {
					cx: "12",
					cy: "21",
					r: "1",
					key: "o0uj5v"
				}]
			]);
			createLucideIcon("arrow-down-up", [
				["path", {
					d: "m3 16 4 4 4-4",
					key: "1co6wj"
				}],
				["path", {
					d: "M7 20V4",
					key: "1yoxec"
				}],
				["path", {
					d: "m21 8-4-4-4 4",
					key: "1c9v7m"
				}],
				["path", {
					d: "M17 4v16",
					key: "7dpous"
				}]
			]);
			createLucideIcon("arrow-down-to-line", [
				["path", {
					d: "M12 17V3",
					key: "1cwfxf"
				}],
				["path", {
					d: "m6 11 6 6 6-6",
					key: "12ii2o"
				}],
				["path", {
					d: "M19 21H5",
					key: "150jfl"
				}]
			]);
			createLucideIcon("arrow-down-wide-narrow", [
				["path", {
					d: "m3 16 4 4 4-4",
					key: "1co6wj"
				}],
				["path", {
					d: "M7 20V4",
					key: "1yoxec"
				}],
				["path", {
					d: "M11 4h10",
					key: "1w87gc"
				}],
				["path", {
					d: "M11 8h7",
					key: "djye34"
				}],
				["path", {
					d: "M11 12h4",
					key: "q8tih4"
				}]
			]);
			createLucideIcon("arrow-left-from-line", [
				["path", {
					d: "m9 6-6 6 6 6",
					key: "7v63n9"
				}],
				["path", {
					d: "M3 12h14",
					key: "13k4hi"
				}],
				["path", {
					d: "M21 19V5",
					key: "b4bplr"
				}]
			]);
			createLucideIcon("arrow-down-z-a", [
				["path", {
					d: "m3 16 4 4 4-4",
					key: "1co6wj"
				}],
				["path", {
					d: "M7 4v16",
					key: "1glfcx"
				}],
				["path", {
					d: "M15 4h5l-5 6h5",
					key: "8asdl1"
				}],
				["path", {
					d: "M15 20v-3.5a2.5 2.5 0 0 1 5 0V20",
					key: "r6l5cz"
				}],
				["path", {
					d: "M20 18h-5",
					key: "18j1r2"
				}]
			]);
			createLucideIcon("arrow-down", [["path", {
				d: "M12 5v14",
				key: "s699le"
			}], ["path", {
				d: "m19 12-7 7-7-7",
				key: "1idqje"
			}]]);
			createLucideIcon("arrow-left-right", [
				["path", {
					d: "M8 3 4 7l4 4",
					key: "9rb6wj"
				}],
				["path", {
					d: "M4 7h16",
					key: "6tx8e3"
				}],
				["path", {
					d: "m16 21 4-4-4-4",
					key: "siv7j2"
				}],
				["path", {
					d: "M20 17H4",
					key: "h6l3hr"
				}]
			]);
			createLucideIcon("arrow-left-to-line", [
				["path", {
					d: "M3 19V5",
					key: "rwsyhb"
				}],
				["path", {
					d: "m13 6-6 6 6 6",
					key: "1yhaz7"
				}],
				["path", {
					d: "M7 12h14",
					key: "uoisry"
				}]
			]);
			createLucideIcon("arrow-left", [["path", {
				d: "m12 19-7-7 7-7",
				key: "1l729n"
			}], ["path", {
				d: "M19 12H5",
				key: "x3x0zl"
			}]]);
			createLucideIcon("arrow-right-from-line", [
				["path", {
					d: "M3 5v14",
					key: "1nt18q"
				}],
				["path", {
					d: "M21 12H7",
					key: "13ipq5"
				}],
				["path", {
					d: "m15 18 6-6-6-6",
					key: "6tx3qv"
				}]
			]);
			createLucideIcon("arrow-right-left", [
				["path", {
					d: "m16 3 4 4-4 4",
					key: "1x1c3m"
				}],
				["path", {
					d: "M20 7H4",
					key: "zbl0bi"
				}],
				["path", {
					d: "m8 21-4-4 4-4",
					key: "h9nckh"
				}],
				["path", {
					d: "M4 17h16",
					key: "g4d7ey"
				}]
			]);
			createLucideIcon("arrow-right-to-line", [
				["path", {
					d: "M17 12H3",
					key: "8awo09"
				}],
				["path", {
					d: "m11 18 6-6-6-6",
					key: "8c2y43"
				}],
				["path", {
					d: "M21 5v14",
					key: "nzette"
				}]
			]);
			createLucideIcon("arrow-right", [["path", {
				d: "M5 12h14",
				key: "1ays0h"
			}], ["path", {
				d: "m12 5 7 7-7 7",
				key: "xquz4c"
			}]]);
			createLucideIcon("arrow-up-0-1", [
				["path", {
					d: "m3 8 4-4 4 4",
					key: "11wl7u"
				}],
				["path", {
					d: "M7 4v16",
					key: "1glfcx"
				}],
				["rect", {
					x: "15",
					y: "4",
					width: "4",
					height: "6",
					ry: "2",
					key: "1bwicg"
				}],
				["path", {
					d: "M17 20v-6h-2",
					key: "1qp1so"
				}],
				["path", {
					d: "M15 20h4",
					key: "1j968p"
				}]
			]);
			createLucideIcon("arrow-up-a-z", [
				["path", {
					d: "m3 8 4-4 4 4",
					key: "11wl7u"
				}],
				["path", {
					d: "M7 4v16",
					key: "1glfcx"
				}],
				["path", {
					d: "M20 8h-5",
					key: "1vsyxs"
				}],
				["path", {
					d: "M15 10V6.5a2.5 2.5 0 0 1 5 0V10",
					key: "ag13bf"
				}],
				["path", {
					d: "M15 14h5l-5 6h5",
					key: "ur5jdg"
				}]
			]);
			createLucideIcon("arrow-up-1-0", [
				["path", {
					d: "m3 8 4-4 4 4",
					key: "11wl7u"
				}],
				["path", {
					d: "M7 4v16",
					key: "1glfcx"
				}],
				["path", {
					d: "M17 10V4h-2",
					key: "zcsr5x"
				}],
				["path", {
					d: "M15 10h4",
					key: "id2lce"
				}],
				["rect", {
					x: "15",
					y: "14",
					width: "4",
					height: "6",
					ry: "2",
					key: "33xykx"
				}]
			]);
			createLucideIcon("arrow-up-down", [
				["path", {
					d: "m21 16-4 4-4-4",
					key: "f6ql7i"
				}],
				["path", {
					d: "M17 20V4",
					key: "1ejh1v"
				}],
				["path", {
					d: "m3 8 4-4 4 4",
					key: "11wl7u"
				}],
				["path", {
					d: "M7 4v16",
					key: "1glfcx"
				}]
			]);
			createLucideIcon("arrow-up-from-dot", [
				["path", {
					d: "m5 9 7-7 7 7",
					key: "1hw5ic"
				}],
				["path", {
					d: "M12 16V2",
					key: "ywoabb"
				}],
				["circle", {
					cx: "12",
					cy: "21",
					r: "1",
					key: "o0uj5v"
				}]
			]);
			createLucideIcon("arrow-up-from-line", [
				["path", {
					d: "m18 9-6-6-6 6",
					key: "kcunyi"
				}],
				["path", {
					d: "M12 3v14",
					key: "7cf3v8"
				}],
				["path", {
					d: "M5 21h14",
					key: "11awu3"
				}]
			]);
			createLucideIcon("arrow-up-left", [["path", {
				d: "M7 17V7h10",
				key: "11bw93"
			}], ["path", {
				d: "M17 17 7 7",
				key: "2786uv"
			}]]);
			createLucideIcon("arrow-up-narrow-wide", [
				["path", {
					d: "m3 8 4-4 4 4",
					key: "11wl7u"
				}],
				["path", {
					d: "M7 4v16",
					key: "1glfcx"
				}],
				["path", {
					d: "M11 12h4",
					key: "q8tih4"
				}],
				["path", {
					d: "M11 16h7",
					key: "uosisv"
				}],
				["path", {
					d: "M11 20h10",
					key: "jvxblo"
				}]
			]);
			createLucideIcon("arrow-up-right", [["path", {
				d: "M7 7h10v10",
				key: "1tivn9"
			}], ["path", {
				d: "M7 17 17 7",
				key: "1vkiza"
			}]]);
			createLucideIcon("arrow-up-to-line", [
				["path", {
					d: "M5 3h14",
					key: "7usisc"
				}],
				["path", {
					d: "m18 13-6-6-6 6",
					key: "1kf1n9"
				}],
				["path", {
					d: "M12 7v14",
					key: "1akyts"
				}]
			]);
			createLucideIcon("arrow-up-wide-narrow", [
				["path", {
					d: "m3 8 4-4 4 4",
					key: "11wl7u"
				}],
				["path", {
					d: "M7 4v16",
					key: "1glfcx"
				}],
				["path", {
					d: "M11 12h10",
					key: "1438ji"
				}],
				["path", {
					d: "M11 16h7",
					key: "uosisv"
				}],
				["path", {
					d: "M11 20h4",
					key: "1krc32"
				}]
			]);
			createLucideIcon("arrow-up-z-a", [
				["path", {
					d: "m3 8 4-4 4 4",
					key: "11wl7u"
				}],
				["path", {
					d: "M7 4v16",
					key: "1glfcx"
				}],
				["path", {
					d: "M15 4h5l-5 6h5",
					key: "8asdl1"
				}],
				["path", {
					d: "M15 20v-3.5a2.5 2.5 0 0 1 5 0V20",
					key: "r6l5cz"
				}],
				["path", {
					d: "M20 18h-5",
					key: "18j1r2"
				}]
			]);
			createLucideIcon("arrow-up", [["path", {
				d: "m5 12 7-7 7 7",
				key: "hav0vg"
			}], ["path", {
				d: "M12 19V5",
				key: "x0mq9r"
			}]]);
			createLucideIcon("arrows-up-from-line", [
				["path", {
					d: "m4 6 3-3 3 3",
					key: "9aidw8"
				}],
				["path", {
					d: "M7 17V3",
					key: "19qxw1"
				}],
				["path", {
					d: "m14 6 3-3 3 3",
					key: "6iy689"
				}],
				["path", {
					d: "M17 17V3",
					key: "o0fmgi"
				}],
				["path", {
					d: "M4 21h16",
					key: "1h09gz"
				}]
			]);
			createLucideIcon("asterisk", [
				["path", {
					d: "M12 5v14",
					key: "s699le"
				}],
				["path", {
					d: "m18.065 8.496-12.125 7",
					key: "1h26g9"
				}],
				["path", {
					d: "m5.94 8.504 12.125 7",
					key: "k77sdm"
				}]
			]);
			createLucideIcon("astroid", [["path", {
				d: "M12.983 21.186a1 1 0 0 1-1.966 0 10 10 0 0 0-8.203-8.203 1 1 0 0 1 0-1.966 10 10 0 0 0 8.203-8.203 1 1 0 0 1 1.966 0 10 10 0 0 0 8.203 8.203 1 1 0 0 1 0 1.966 10 10 0 0 0-8.203 8.203",
				key: "1tipus"
			}]]);
			createLucideIcon("at-sign", [["circle", {
				cx: "12",
				cy: "12",
				r: "4",
				key: "4exip2"
			}], ["path", {
				d: "M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8",
				key: "7n84p3"
			}]]);
			createLucideIcon("atom", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "1",
					key: "41hilf"
				}],
				["path", {
					d: "M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5Z",
					key: "1l2ple"
				}],
				["path", {
					d: "M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5Z",
					key: "1wam0m"
				}]
			]);
			createLucideIcon("audio-lines-x", [
				["path", {
					d: "M10 3v18",
					key: "yhl04a"
				}],
				["path", {
					d: "M14 8v6.35",
					key: "1ubbml"
				}],
				["path", {
					d: "m17 17 5 5",
					key: "p7ous7"
				}],
				["path", {
					d: "M18 5v8.1",
					key: "1icuhc"
				}],
				["path", {
					d: "M2 10v3",
					key: "1fnikh"
				}],
				["path", {
					d: "M22 10v3",
					key: "154ddg"
				}],
				["path", {
					d: "m22 17-5 5",
					key: "gqnmv0"
				}],
				["path", {
					d: "M6 6v11",
					key: "11sgs0"
				}]
			]);
			createLucideIcon("audio-lines-off", [
				["path", {
					d: "M10 10v11",
					key: "tkf9cx"
				}],
				["path", {
					d: "M10 3v1.35",
					key: "1rsffz"
				}],
				["path", {
					d: "M14 14v1",
					key: "hsexio"
				}],
				["path", {
					d: "M14 8v.35",
					key: "isohmc"
				}],
				["path", {
					d: "M18 5v7.35",
					key: "1b0cqo"
				}],
				["path", {
					d: "M2 10v3",
					key: "1fnikh"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M22 10v3",
					key: "154ddg"
				}],
				["path", {
					d: "M6 6v11",
					key: "11sgs0"
				}]
			]);
			createLucideIcon("audio-lines", [
				["path", {
					d: "M2 10v3",
					key: "1fnikh"
				}],
				["path", {
					d: "M6 6v11",
					key: "11sgs0"
				}],
				["path", {
					d: "M10 3v18",
					key: "yhl04a"
				}],
				["path", {
					d: "M14 8v7",
					key: "3a1oy3"
				}],
				["path", {
					d: "M18 5v13",
					key: "123xd1"
				}],
				["path", {
					d: "M22 10v3",
					key: "154ddg"
				}]
			]);
			createLucideIcon("audio-waveform", [["path", {
				d: "M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2",
				key: "57tc96"
			}]]);
			createLucideIcon("award", [["path", {
				d: "m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526",
				key: "1yiouv"
			}], ["circle", {
				cx: "12",
				cy: "8",
				r: "6",
				key: "1vp47v"
			}]]);
			createLucideIcon("axe", [["path", {
				d: "m14 12-8.381 8.38a1 1 0 0 1-3.001-3L11 9",
				key: "5z9253"
			}], ["path", {
				d: "M15 15.5a.5.5 0 0 0 .5.5A6.5 6.5 0 0 0 22 9.5a.5.5 0 0 0-.5-.5h-1.672a2 2 0 0 1-1.414-.586l-5.062-5.062a1.205 1.205 0 0 0-1.704 0L9.352 5.648a1.205 1.205 0 0 0 0 1.704l5.062 5.062A2 2 0 0 1 15 13.828z",
				key: "19zklq"
			}]]);
			createLucideIcon("axis-3d", [
				["path", {
					d: "M13.5 10.5 15 9",
					key: "1nsxvm"
				}],
				["path", {
					d: "M4 4v15a1 1 0 0 0 1 1h15",
					key: "1w6lkd"
				}],
				["path", {
					d: "M4.293 19.707 6 18",
					key: "3g1p8c"
				}],
				["path", {
					d: "m9 15 1.5-1.5",
					key: "1xfbes"
				}]
			]);
			createLucideIcon("baby", [
				["path", {
					d: "M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5",
					key: "1u7htd"
				}],
				["path", {
					d: "M15 12h.01",
					key: "1k8ypt"
				}],
				["path", {
					d: "M19.38 6.813A9 9 0 0 1 20.8 10.2a2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1",
					key: "11xh7x"
				}],
				["path", {
					d: "M9 12h.01",
					key: "157uk2"
				}]
			]);
			createLucideIcon("backpack", [
				["path", {
					d: "M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z",
					key: "1ol0lm"
				}],
				["path", {
					d: "M8 10h8",
					key: "c7uz4u"
				}],
				["path", {
					d: "M8 18h8",
					key: "1no2b1"
				}],
				["path", {
					d: "M8 22v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6",
					key: "1fr6do"
				}],
				["path", {
					d: "M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2",
					key: "donm21"
				}]
			]);
			createLucideIcon("badge-alert", [
				["path", {
					d: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
					key: "3c2336"
				}],
				["line", {
					x1: "12",
					x2: "12",
					y1: "8",
					y2: "12",
					key: "1pkeuh"
				}],
				["line", {
					x1: "12",
					x2: "12.01",
					y1: "16",
					y2: "16",
					key: "4dfq90"
				}]
			]);
			createLucideIcon("badge-cent", [
				["path", {
					d: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
					key: "3c2336"
				}],
				["path", {
					d: "M12 7v10",
					key: "jspqdw"
				}],
				["path", {
					d: "M15.4 10a4 4 0 1 0 0 4",
					key: "2eqtx8"
				}]
			]);
			createLucideIcon("badge-check", [["path", {
				d: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
				key: "3c2336"
			}], ["path", {
				d: "m16 9-5.5 5.5L8 12",
				key: "xofnsj"
			}]]);
			createLucideIcon("badge-dollar-sign", [
				["path", {
					d: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
					key: "3c2336"
				}],
				["path", {
					d: "M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8",
					key: "1h4pet"
				}],
				["path", {
					d: "M12 18V6",
					key: "zqpxq5"
				}]
			]);
			createLucideIcon("badge-euro", [
				["path", {
					d: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
					key: "3c2336"
				}],
				["path", {
					d: "M7 12h5",
					key: "gblrwe"
				}],
				["path", {
					d: "M15 9.4a4 4 0 1 0 0 5.2",
					key: "1makmb"
				}]
			]);
			createLucideIcon("badge-indian-rupee", [
				["path", {
					d: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
					key: "3c2336"
				}],
				["path", {
					d: "M8 8h8",
					key: "1bis0t"
				}],
				["path", {
					d: "M8 12h8",
					key: "1wcyev"
				}],
				["path", {
					d: "m13 17-5-1h1a4 4 0 0 0 0-8",
					key: "nu2bwa"
				}]
			]);
			createLucideIcon("badge-info", [
				["path", {
					d: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
					key: "3c2336"
				}],
				["line", {
					x1: "12",
					x2: "12",
					y1: "16",
					y2: "12",
					key: "1y1yb1"
				}],
				["line", {
					x1: "12",
					x2: "12.01",
					y1: "8",
					y2: "8",
					key: "110wyk"
				}]
			]);
			createLucideIcon("badge-japanese-yen", [
				["path", {
					d: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
					key: "3c2336"
				}],
				["path", {
					d: "m9 8 3 3v7",
					key: "17yadx"
				}],
				["path", {
					d: "m12 11 3-3",
					key: "p4cfq1"
				}],
				["path", {
					d: "M9 12h6",
					key: "1c52cq"
				}],
				["path", {
					d: "M9 16h6",
					key: "8wimt3"
				}]
			]);
			createLucideIcon("badge-minus", [["path", {
				d: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
				key: "3c2336"
			}], ["line", {
				x1: "8",
				x2: "16",
				y1: "12",
				y2: "12",
				key: "1jonct"
			}]]);
			createLucideIcon("badge-percent", [
				["path", {
					d: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
					key: "3c2336"
				}],
				["path", {
					d: "m15 9-6 6",
					key: "1uzhvr"
				}],
				["path", {
					d: "M9 9h.01",
					key: "1q5me6"
				}],
				["path", {
					d: "M15 15h.01",
					key: "lqbp3k"
				}]
			]);
			createLucideIcon("badge-plus", [
				["path", {
					d: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
					key: "3c2336"
				}],
				["line", {
					x1: "12",
					x2: "12",
					y1: "8",
					y2: "16",
					key: "10p56q"
				}],
				["line", {
					x1: "8",
					x2: "16",
					y1: "12",
					y2: "12",
					key: "1jonct"
				}]
			]);
			createLucideIcon("badge-pound-sterling", [
				["path", {
					d: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
					key: "3c2336"
				}],
				["path", {
					d: "M8 12h4",
					key: "qz6y1c"
				}],
				["path", {
					d: "M10 16V9.5a2.5 2.5 0 0 1 5 0",
					key: "3mlbjk"
				}],
				["path", {
					d: "M8 16h7",
					key: "sbedsn"
				}]
			]);
			createLucideIcon("badge-russian-ruble", [
				["path", {
					d: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
					key: "3c2336"
				}],
				["path", {
					d: "M9 16h5",
					key: "1syiyw"
				}],
				["path", {
					d: "M9 12h5a2 2 0 1 0 0-4h-3v9",
					key: "1ge9c1"
				}]
			]);
			createLucideIcon("badge-question-mark", [
				["path", {
					d: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
					key: "3c2336"
				}],
				["path", {
					d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3",
					key: "1u773s"
				}],
				["line", {
					x1: "12",
					x2: "12.01",
					y1: "17",
					y2: "17",
					key: "io3f8k"
				}]
			]);
			createLucideIcon("badge-swiss-franc", [
				["path", {
					d: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
					key: "3c2336"
				}],
				["path", {
					d: "M11 17V8h4",
					key: "1bfq6y"
				}],
				["path", {
					d: "M11 12h3",
					key: "2eqnfz"
				}],
				["path", {
					d: "M9 16h4",
					key: "1skf3a"
				}]
			]);
			createLucideIcon("badge-turkish-lira", [
				["path", {
					d: "M11 7v10a5 5 0 0 0 5-5",
					key: "1ja3ih"
				}],
				["path", {
					d: "m15 8-6 3",
					key: "4x0uwz"
				}],
				["path", {
					d: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76",
					key: "18242g"
				}]
			]);
			createLucideIcon("badge-x", [
				["path", {
					d: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
					key: "3c2336"
				}],
				["line", {
					x1: "15",
					x2: "9",
					y1: "9",
					y2: "15",
					key: "f7djnv"
				}],
				["line", {
					x1: "9",
					x2: "15",
					y1: "9",
					y2: "15",
					key: "1shsy8"
				}]
			]);
			createLucideIcon("badge", [["path", {
				d: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
				key: "3c2336"
			}]]);
			createLucideIcon("baggage-claim", [
				["path", {
					d: "M22 18H6a2 2 0 0 1-2-2V7a2 2 0 0 0-2-2",
					key: "4irg2o"
				}],
				["path", {
					d: "M17 14V4a2 2 0 0 0-2-2h-1a2 2 0 0 0-2 2v10",
					key: "14fcyx"
				}],
				["rect", {
					width: "13",
					height: "8",
					x: "8",
					y: "6",
					rx: "1",
					key: "o6oiis"
				}],
				["circle", {
					cx: "18",
					cy: "20",
					r: "2",
					key: "t9985n"
				}],
				["circle", {
					cx: "9",
					cy: "20",
					r: "2",
					key: "e5v82j"
				}]
			]);
			createLucideIcon("balloon", [
				["path", {
					d: "M12 16v1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v1",
					key: "2nz4b"
				}],
				["path", {
					d: "M12 6a2 2 0 0 1 2 2",
					key: "7y7d82"
				}],
				["path", {
					d: "M18 8c0 4-3.5 8-6 8s-6-4-6-8a6 6 0 0 1 12 0",
					key: "vqb5s3"
				}]
			]);
			createLucideIcon("ban", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "M4.929 4.929 19.07 19.071",
				key: "196cmz"
			}]]);
			createLucideIcon("banana", [["path", {
				d: "M4 13c3.5-2 8-2 10 2a5.5 5.5 0 0 1 8 5",
				key: "1cscit"
			}], ["path", {
				d: "M5.15 17.89c5.52-1.52 8.65-6.89 7-12C11.55 4 11.5 2 13 2c3.22 0 5 5.5 5 8 0 6.5-4.2 12-10.49 12C5.11 22 2 22 2 20c0-1.5 1.14-1.55 3.15-2.11Z",
				key: "1y1nbv"
			}]]);
			createLucideIcon("bandage", [
				["path", {
					d: "M10 10.01h.01",
					key: "1e9xi7"
				}],
				["path", {
					d: "M10 14.01h.01",
					key: "ac23bv"
				}],
				["path", {
					d: "M14 10.01h.01",
					key: "2wfrvf"
				}],
				["path", {
					d: "M14 14.01h.01",
					key: "8tw8yn"
				}],
				["path", {
					d: "M18 6v12",
					key: "1bcixs"
				}],
				["path", {
					d: "M6 6v12",
					key: "vkc79e"
				}],
				["rect", {
					x: "2",
					y: "6",
					width: "20",
					height: "12",
					rx: "2",
					key: "1wpnh2"
				}]
			]);
			createLucideIcon("banknote-arrow-down", [
				["path", {
					d: "M12 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5",
					key: "x6cv4u"
				}],
				["path", {
					d: "m16 19 3 3 3-3",
					key: "1ibux0"
				}],
				["path", {
					d: "M18 12h.01",
					key: "yjnet6"
				}],
				["path", {
					d: "M19 16v6",
					key: "tddt3s"
				}],
				["path", {
					d: "M6 12h.01",
					key: "c2rlol"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "2",
					key: "1c9p78"
				}]
			]);
			createLucideIcon("banknote-arrow-up", [
				["path", {
					d: "M12 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5",
					key: "x6cv4u"
				}],
				["path", {
					d: "M18 12h.01",
					key: "yjnet6"
				}],
				["path", {
					d: "M19 22v-6",
					key: "qhmiwi"
				}],
				["path", {
					d: "m22 19-3-3-3 3",
					key: "rn6bg2"
				}],
				["path", {
					d: "M6 12h.01",
					key: "c2rlol"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "2",
					key: "1c9p78"
				}]
			]);
			createLucideIcon("banknote-check", [
				["path", {
					d: "M11.748 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4.875",
					key: "t4e5a5"
				}],
				["path", {
					d: "m16 19 2 2 4-4",
					key: "1b14m6"
				}],
				["path", {
					d: "M18 12h.01",
					key: "yjnet6"
				}],
				["path", {
					d: "M6 12h.01",
					key: "c2rlol"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "2",
					key: "1c9p78"
				}]
			]);
			createLucideIcon("banknote-x", [
				["path", {
					d: "M13 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5",
					key: "16nib6"
				}],
				["path", {
					d: "m17 17 5 5",
					key: "p7ous7"
				}],
				["path", {
					d: "M18 12h.01",
					key: "yjnet6"
				}],
				["path", {
					d: "m22 17-5 5",
					key: "gqnmv0"
				}],
				["path", {
					d: "M6 12h.01",
					key: "c2rlol"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "2",
					key: "1c9p78"
				}]
			]);
			createLucideIcon("banknote", [
				["rect", {
					width: "20",
					height: "12",
					x: "2",
					y: "6",
					rx: "2",
					key: "9lu3g6"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "2",
					key: "1c9p78"
				}],
				["path", {
					d: "M6 12h.01M18 12h.01",
					key: "113zkx"
				}]
			]);
			createLucideIcon("barrel", [
				["path", {
					d: "M10 3a41 41 0 000 18",
					key: "1f9k6x"
				}],
				["path", {
					d: "M14 3a41 41 0 010 18",
					key: "1qo28r"
				}],
				["path", {
					d: "M16.997 21a2 2 0 001.68-.92 15.25 15.25 0 000-16.16 2 2 0 00-1.68-.92h-10a2 2 0 00-1.681.92 15.25 15.25 0 000 16.16 2 2 0 001.681.92z",
					key: "1nrwe5"
				}],
				["path", {
					d: "M3.54 16h16.914",
					key: "jntgtt"
				}],
				["path", {
					d: "M3.54 8h16.914",
					key: "14pf7i"
				}]
			]);
			createLucideIcon("barcode", [
				["path", {
					d: "M3 5v14",
					key: "1nt18q"
				}],
				["path", {
					d: "M8 5v14",
					key: "1ybrkv"
				}],
				["path", {
					d: "M12 5v14",
					key: "s699le"
				}],
				["path", {
					d: "M17 5v14",
					key: "ycjyhj"
				}],
				["path", {
					d: "M21 5v14",
					key: "nzette"
				}]
			]);
			createLucideIcon("baseline", [
				["path", {
					d: "M4 20h16",
					key: "14thso"
				}],
				["path", {
					d: "m6 16 6-12 6 12",
					key: "1b4byz"
				}],
				["path", {
					d: "M8 12h8",
					key: "1wcyev"
				}]
			]);
			createLucideIcon("bath", [
				["path", {
					d: "M10 4 8 6",
					key: "1rru8s"
				}],
				["path", {
					d: "M17 19v2",
					key: "ts1sot"
				}],
				["path", {
					d: "M2 12h20",
					key: "9i4pu4"
				}],
				["path", {
					d: "M7 19v2",
					key: "12npes"
				}],
				["path", {
					d: "M9 5 7.621 3.621A2.121 2.121 0 0 0 4 5v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5",
					key: "14ym8i"
				}]
			]);
			createLucideIcon("battery-charging", [
				["path", {
					d: "m11 7-3 5h4l-3 5",
					key: "b4a64w"
				}],
				["path", {
					d: "M14.856 6H16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.935",
					key: "lre1cr"
				}],
				["path", {
					d: "M22 14v-4",
					key: "14q9d5"
				}],
				["path", {
					d: "M5.14 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2.936",
					key: "13q5k0"
				}]
			]);
			createLucideIcon("battery-full", [
				["path", {
					d: "M10 10v4",
					key: "1mb2ec"
				}],
				["path", {
					d: "M14 10v4",
					key: "1nt88p"
				}],
				["path", {
					d: "M22 14v-4",
					key: "14q9d5"
				}],
				["path", {
					d: "M6 10v4",
					key: "1n77qd"
				}],
				["rect", {
					x: "2",
					y: "6",
					width: "16",
					height: "12",
					rx: "2",
					key: "13zb55"
				}]
			]);
			createLucideIcon("battery-low", [
				["path", {
					d: "M22 14v-4",
					key: "14q9d5"
				}],
				["path", {
					d: "M6 14v-4",
					key: "14a6bd"
				}],
				["rect", {
					x: "2",
					y: "6",
					width: "16",
					height: "12",
					rx: "2",
					key: "13zb55"
				}]
			]);
			createLucideIcon("battery-medium", [
				["path", {
					d: "M10 14v-4",
					key: "suye4c"
				}],
				["path", {
					d: "M22 14v-4",
					key: "14q9d5"
				}],
				["path", {
					d: "M6 14v-4",
					key: "14a6bd"
				}],
				["rect", {
					x: "2",
					y: "6",
					width: "16",
					height: "12",
					rx: "2",
					key: "13zb55"
				}]
			]);
			createLucideIcon("battery-plus", [
				["path", {
					d: "M10 9v6",
					key: "17i7lo"
				}],
				["path", {
					d: "M12.543 6H16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3.605",
					key: "o09yah"
				}],
				["path", {
					d: "M22 14v-4",
					key: "14q9d5"
				}],
				["path", {
					d: "M7 12h6",
					key: "iekk3h"
				}],
				["path", {
					d: "M7.606 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.606",
					key: "xyqvf1"
				}]
			]);
			createLucideIcon("battery-warning", [
				["path", {
					d: "M10 17h.01",
					key: "nbq80n"
				}],
				["path", {
					d: "M10 7v6",
					key: "nne03l"
				}],
				["path", {
					d: "M14 6h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2",
					key: "1m83kb"
				}],
				["path", {
					d: "M22 14v-4",
					key: "14q9d5"
				}],
				["path", {
					d: "M6 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2",
					key: "h8lgfh"
				}]
			]);
			createLucideIcon("battery", [["path", {
				d: "M 22 14 L 22 10",
				key: "nqc4tb"
			}], ["rect", {
				x: "2",
				y: "6",
				width: "16",
				height: "12",
				rx: "2",
				key: "13zb55"
			}]]);
			createLucideIcon("beaker", [
				["path", {
					d: "M4.5 3h15",
					key: "c7n0jr"
				}],
				["path", {
					d: "M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3",
					key: "m1uhx7"
				}],
				["path", {
					d: "M6 14h12",
					key: "4cwo0f"
				}]
			]);
			createLucideIcon("bean-off", [
				["path", {
					d: "M9 9c-.64.64-1.521.954-2.402 1.165A6 6 0 0 0 8 22a13.96 13.96 0 0 0 9.9-4.1",
					key: "bq3udt"
				}],
				["path", {
					d: "M10.75 5.093A6 6 0 0 1 22 8c0 2.411-.61 4.68-1.683 6.66",
					key: "17ccse"
				}],
				["path", {
					d: "M5.341 10.62a4 4 0 0 0 6.487 1.208M10.62 5.341a4.015 4.015 0 0 1 2.039 2.04",
					key: "18zqgq"
				}],
				["line", {
					x1: "2",
					x2: "22",
					y1: "2",
					y2: "22",
					key: "a6p6uj"
				}]
			]);
			createLucideIcon("bean", [["path", {
				d: "M10.165 6.598C9.954 7.478 9.64 8.36 9 9c-.64.64-1.521.954-2.402 1.165A6 6 0 0 0 8 22c7.732 0 14-6.268 14-14a6 6 0 0 0-11.835-1.402Z",
				key: "1tvzk7"
			}], ["path", {
				d: "M5.341 10.62a4 4 0 1 0 5.279-5.28",
				key: "2cyri2"
			}]]);
			createLucideIcon("bed-double", [
				["path", {
					d: "M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8",
					key: "1k78r4"
				}],
				["path", {
					d: "M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4",
					key: "fb3tl2"
				}],
				["path", {
					d: "M12 4v6",
					key: "1dcgq2"
				}],
				["path", {
					d: "M2 18h20",
					key: "ajqnye"
				}]
			]);
			createLucideIcon("bed-single", [
				["path", {
					d: "M3 20v-8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8",
					key: "1wm6mi"
				}],
				["path", {
					d: "M5 10V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4",
					key: "4k93s5"
				}],
				["path", {
					d: "M3 18h18",
					key: "1h113x"
				}]
			]);
			createLucideIcon("bed", [
				["path", {
					d: "M2 4v16",
					key: "vw9hq8"
				}],
				["path", {
					d: "M2 8h18a2 2 0 0 1 2 2v10",
					key: "1dgv2r"
				}],
				["path", {
					d: "M2 17h20",
					key: "18nfp3"
				}],
				["path", {
					d: "M6 8v9",
					key: "1yriud"
				}]
			]);
			createLucideIcon("beef-off", [
				["path", {
					d: "M11.771 6.109a2.5 2.5 0 0 1 3.12 3.12",
					key: "3w1grc"
				}],
				["path", {
					d: "M17.852 12.185a6.5 6.5 0 0 0-9.035-9.04",
					key: "1xgl7b"
				}],
				["path", {
					d: "M18.013 18.013C15.029 20.349 10.831 22 7 22a3 3 0 0 1-2.68-1.66L2.4 16.5",
					key: "3m3yc0"
				}],
				["path", {
					d: "m18.5 6 2.19 4.5a6.48 6.48 0 0 1-.139 4.393",
					key: "1rvkn7"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M6.355 6.37a7 7 0 0 0-.075.23c-1.1 3.13-.78 3.9-3.18 6.08A3 3 0 0 0 5 18c3.356 0 6.993-1.267 9.85-3.151",
					key: "54713r"
				}]
			]);
			createLucideIcon("beef", [
				["path", {
					d: "M16.4 13.7A6.5 6.5 0 1 0 6.28 6.6c-1.1 3.13-.78 3.9-3.18 6.08A3 3 0 0 0 5 18c4 0 8.4-1.8 11.4-4.3",
					key: "cisjcv"
				}],
				["path", {
					d: "m18.5 6 1.754 3.5a6.48 6.48 0 0 1-1.854 8.2C15.4 20.2 11 22 7 22a3 3 0 0 1-2.68-1.66L2.4 16.5",
					key: "hvizuk"
				}],
				["circle", {
					cx: "12.5",
					cy: "8.5",
					r: "2.5",
					key: "9738u8"
				}]
			]);
			createLucideIcon("beer-off", [
				["path", {
					d: "M13 13v5",
					key: "igwfh0"
				}],
				["path", {
					d: "M17 11.47V8",
					key: "16yw0g"
				}],
				["path", {
					d: "M17 11h1a3 3 0 0 1 2.745 4.211",
					key: "1xbt65"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-3",
					key: "c55o3e"
				}],
				["path", {
					d: "M7.536 7.535C6.766 7.649 6.154 8 5.5 8a2.5 2.5 0 0 1-1.768-4.268",
					key: "1ydug7"
				}],
				["path", {
					d: "M8.727 3.204C9.306 2.767 9.885 2 11 2c1.56 0 2 1.5 3 1.5s1.72-.5 2.5-.5a1 1 0 1 1 0 5c-.78 0-1.5-.5-2.5-.5a3.149 3.149 0 0 0-.842.12",
					key: "q81o7q"
				}],
				["path", {
					d: "M9 14.6V18",
					key: "20ek98"
				}]
			]);
			createLucideIcon("beer", [
				["path", {
					d: "M17 11h1a3 3 0 0 1 0 6h-1",
					key: "1yp76v"
				}],
				["path", {
					d: "M9 12v6",
					key: "1u1cab"
				}],
				["path", {
					d: "M13 12v6",
					key: "1sugkk"
				}],
				["path", {
					d: "M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 2 11 2s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5Z",
					key: "1510fo"
				}],
				["path", {
					d: "M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8",
					key: "19jb7n"
				}]
			]);
			createLucideIcon("bell-check", [
				["path", {
					d: "M10.268 21a2 2 0 0 0 3.464 0",
					key: "vwvbt9"
				}],
				["path", {
					d: "m15 8 2 2 4-4",
					key: "sbrgsm"
				}],
				["path", {
					d: "M16.8607 4.4824A6 6 0 0 0 6 8C6 12.499 4.589 13.956 3.262 15.326",
					key: "qcog4a"
				}],
				["path", {
					d: "M3.262 15.326A1 1 0 0 0 4 17H20A1 1 0 0 0 20.74 15.327C20.209 14.779 19.665 14.218 19.203 13.454",
					key: "mxnnoh"
				}]
			]);
			createLucideIcon("bell-dot", [
				["path", {
					d: "M10.268 21a2 2 0 0 0 3.464 0",
					key: "vwvbt9"
				}],
				["path", {
					d: "M11.68 2.009A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673c-.824-.85-1.678-1.731-2.21-3.348",
					key: "xaq59h"
				}],
				["circle", {
					cx: "18",
					cy: "5",
					r: "3",
					key: "gq8acd"
				}]
			]);
			createLucideIcon("bell-electric", [
				["path", {
					d: "M18.518 17.347A7 7 0 0 1 14 19",
					key: "1emhpo"
				}],
				["path", {
					d: "M18.8 4A11 11 0 0 1 20 9",
					key: "127b67"
				}],
				["path", {
					d: "M9 9h.01",
					key: "1q5me6"
				}],
				["circle", {
					cx: "20",
					cy: "16",
					r: "2",
					key: "1v9bxh"
				}],
				["circle", {
					cx: "9",
					cy: "9",
					r: "7",
					key: "p2h5vp"
				}],
				["rect", {
					x: "4",
					y: "16",
					width: "10",
					height: "6",
					rx: "2",
					key: "bfnviv"
				}]
			]);
			createLucideIcon("bell-minus", [
				["path", {
					d: "M10.268 21a2 2 0 0 0 3.464 0",
					key: "vwvbt9"
				}],
				["path", {
					d: "M15 8h6",
					key: "8ybuxh"
				}],
				["path", {
					d: "M16.243 3.757A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673A9.4 9.4 0 0 1 18.667 12",
					key: "bdwj86"
				}]
			]);
			createLucideIcon("bell-off", [
				["path", {
					d: "M10.268 21a2 2 0 0 0 3.464 0",
					key: "vwvbt9"
				}],
				["path", {
					d: "M17 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 .258-1.742",
					key: "178tsu"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M8.668 3.01A6 6 0 0 1 18 8c0 2.687.77 4.653 1.707 6.05",
					key: "1hqiys"
				}]
			]);
			createLucideIcon("bell-plus", [
				["path", {
					d: "M10.268 21a2 2 0 0 0 3.464 0",
					key: "vwvbt9"
				}],
				["path", {
					d: "M15 8h6",
					key: "8ybuxh"
				}],
				["path", {
					d: "M18 5v6",
					key: "g5ayrv"
				}],
				["path", {
					d: "M20.002 14.464a9 9 0 0 0 .738.863A1 1 0 0 1 20 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 8.75-5.332",
					key: "1abcvy"
				}]
			]);
			createLucideIcon("bell-ring", [
				["path", {
					d: "M10.268 21a2 2 0 0 0 3.464 0",
					key: "vwvbt9"
				}],
				["path", {
					d: "M22 8c0-2.3-.8-4.3-2-6",
					key: "5bb3ad"
				}],
				["path", {
					d: "M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326",
					key: "11g9vi"
				}],
				["path", {
					d: "M4 2C2.8 3.7 2 5.7 2 8",
					key: "tap9e0"
				}]
			]);
			createLucideIcon("bell", [["path", {
				d: "M10.268 21a2 2 0 0 0 3.464 0",
				key: "vwvbt9"
			}], ["path", {
				d: "M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326",
				key: "11g9vi"
			}]]);
			createLucideIcon("between-horizontal-end", [
				["rect", {
					width: "13",
					height: "7",
					x: "3",
					y: "3",
					rx: "1",
					key: "11xb64"
				}],
				["path", {
					d: "m22 15-3-3 3-3",
					key: "26chmm"
				}],
				["rect", {
					width: "13",
					height: "7",
					x: "3",
					y: "14",
					rx: "1",
					key: "k6ky7n"
				}]
			]);
			createLucideIcon("between-horizontal-start", [
				["rect", {
					width: "13",
					height: "7",
					x: "8",
					y: "3",
					rx: "1",
					key: "pkso9a"
				}],
				["path", {
					d: "m2 9 3 3-3 3",
					key: "1agib5"
				}],
				["rect", {
					width: "13",
					height: "7",
					x: "8",
					y: "14",
					rx: "1",
					key: "1q5fc1"
				}]
			]);
			createLucideIcon("between-vertical-end", [
				["rect", {
					width: "7",
					height: "13",
					x: "3",
					y: "3",
					rx: "1",
					key: "1fdu0f"
				}],
				["path", {
					d: "m9 22 3-3 3 3",
					key: "17z65a"
				}],
				["rect", {
					width: "7",
					height: "13",
					x: "14",
					y: "3",
					rx: "1",
					key: "1squn4"
				}]
			]);
			createLucideIcon("biceps-flexed", [
				["path", {
					d: "M12.409 13.017A5 5 0 0 1 22 15c0 3.866-4 7-9 7-4.077 0-8.153-.82-10.371-2.462-.426-.316-.631-.832-.62-1.362C2.118 12.723 2.627 2 10 2a3 3 0 0 1 3 3 2 2 0 0 1-2 2c-1.105 0-1.64-.444-2-1",
					key: "1pmlyh"
				}],
				["path", {
					d: "M15 14a5 5 0 0 0-7.584 2",
					key: "5rb254"
				}],
				["path", {
					d: "M9.964 6.825C8.019 7.977 9.5 13 8 15",
					key: "kbvsx9"
				}]
			]);
			createLucideIcon("between-vertical-start", [
				["rect", {
					width: "7",
					height: "13",
					x: "3",
					y: "8",
					rx: "1",
					key: "1fjrkv"
				}],
				["path", {
					d: "m15 2-3 3-3-3",
					key: "1uh6eb"
				}],
				["rect", {
					width: "7",
					height: "13",
					x: "14",
					y: "8",
					rx: "1",
					key: "w3fjg8"
				}]
			]);
			createLucideIcon("bike", [
				["circle", {
					cx: "18.5",
					cy: "17.5",
					r: "3.5",
					key: "15x4ox"
				}],
				["circle", {
					cx: "5.5",
					cy: "17.5",
					r: "3.5",
					key: "1noe27"
				}],
				["circle", {
					cx: "15",
					cy: "5",
					r: "1",
					key: "19l28e"
				}],
				["path", {
					d: "M12 17.5V14l-3-3 4-3 2 3h2",
					key: "1npguv"
				}]
			]);
			createLucideIcon("binary", [
				["rect", {
					x: "14",
					y: "14",
					width: "4",
					height: "6",
					rx: "2",
					key: "p02svl"
				}],
				["rect", {
					x: "6",
					y: "4",
					width: "4",
					height: "6",
					rx: "2",
					key: "xm4xkj"
				}],
				["path", {
					d: "M6 20h4",
					key: "1i6q5t"
				}],
				["path", {
					d: "M14 10h4",
					key: "ru81e7"
				}],
				["path", {
					d: "M6 14h2v6",
					key: "16z9wg"
				}],
				["path", {
					d: "M14 4h2v6",
					key: "1idq9u"
				}]
			]);
			createLucideIcon("binoculars", [
				["path", {
					d: "M10 10h4",
					key: "tcdvrf"
				}],
				["path", {
					d: "M19 7V4a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3",
					key: "3apit1"
				}],
				["path", {
					d: "M20 21a2 2 0 0 0 2-2v-3.851c0-1.39-2-2.962-2-4.829V8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v11a2 2 0 0 0 2 2z",
					key: "rhpgnw"
				}],
				["path", {
					d: "M 22 16 L 2 16",
					key: "14lkq7"
				}],
				["path", {
					d: "M4 21a2 2 0 0 1-2-2v-3.851c0-1.39 2-2.962 2-4.829V8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2z",
					key: "104b3k"
				}],
				["path", {
					d: "M9 7V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v3",
					key: "14fczp"
				}]
			]);
			createLucideIcon("biohazard", [
				["circle", {
					cx: "12",
					cy: "11.9",
					r: "2",
					key: "e8h31w"
				}],
				["path", {
					d: "M6.7 3.4c-.9 2.5 0 5.2 2.2 6.7C6.5 9 3.7 9.6 2 11.6",
					key: "17bolr"
				}],
				["path", {
					d: "m8.9 10.1 1.4.8",
					key: "15ezny"
				}],
				["path", {
					d: "M17.3 3.4c.9 2.5 0 5.2-2.2 6.7 2.4-1.2 5.2-.6 6.9 1.5",
					key: "wtwa5u"
				}],
				["path", {
					d: "m15.1 10.1-1.4.8",
					key: "1r0b28"
				}],
				["path", {
					d: "M16.7 20.8c-2.6-.4-4.6-2.6-4.7-5.3-.2 2.6-2.1 4.8-4.7 5.2",
					key: "m7qszh"
				}],
				["path", {
					d: "M12 13.9v1.6",
					key: "zfyyim"
				}],
				["path", {
					d: "M13.5 5.4c-1-.2-2-.2-3 0",
					key: "1bi9q0"
				}],
				["path", {
					d: "M17 16.4c.7-.7 1.2-1.6 1.5-2.5",
					key: "1rhjqw"
				}],
				["path", {
					d: "M5.5 13.9c.3.9.8 1.8 1.5 2.5",
					key: "8gsud3"
				}]
			]);
			createLucideIcon("bird", [
				["path", {
					d: "M16 7h.01",
					key: "1kdx03"
				}],
				["path", {
					d: "M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20",
					key: "oj1oa8"
				}],
				["path", {
					d: "m20 7 2 .5-2 .5",
					key: "12nv4d"
				}],
				["path", {
					d: "M10 18v3",
					key: "1yea0a"
				}],
				["path", {
					d: "M14 17.75V21",
					key: "1pymcb"
				}],
				["path", {
					d: "M7 18a6 6 0 0 0 3.84-10.61",
					key: "1npnn0"
				}]
			]);
			createLucideIcon("birdhouse", [
				["path", {
					d: "M12 18v4",
					key: "jadmvz"
				}],
				["path", {
					d: "m17 18 1.956-11.468",
					key: "l5n2ro"
				}],
				["path", {
					d: "m3 8 7.82-5.615a2 2 0 0 1 2.36 0L21 8",
					key: "1sy6n7"
				}],
				["path", {
					d: "M4 18h16",
					key: "19g7jn"
				}],
				["path", {
					d: "M7 18 5.044 6.532",
					key: "1uqdf2"
				}],
				["circle", {
					cx: "12",
					cy: "10",
					r: "2",
					key: "1yojzk"
				}]
			]);
			createLucideIcon("blend", [["circle", {
				cx: "15",
				cy: "9",
				r: "7",
				key: "1i12rt"
			}], ["circle", {
				cx: "9",
				cy: "15",
				r: "7",
				key: "19bs8k"
			}]]);
			createLucideIcon("bitcoin", [["path", {
				d: "M11.767 19.089c4.924.868 6.14-6.025 1.216-6.894m-1.216 6.894L5.86 18.047m5.908 1.042-.347 1.97m1.563-8.864c4.924.869 6.14-6.025 1.215-6.893m-1.215 6.893-3.94-.694m5.155-6.2L8.29 4.26m5.908 1.042.348-1.97M7.48 20.364l3.126-17.727",
				key: "yr8idg"
			}]]);
			createLucideIcon("blender", [
				["path", {
					d: "M8 14a2 2 0 0 0-1.963 1.615l-1.018 5.193A1 1 0 0 0 6 22h12a1 1 0 0 0 .981-1.192l-1.018-5.193A2 2 0 0 0 16 14z",
					key: "11zxmj"
				}],
				["path", {
					d: "m17 2-1 12",
					key: "nxm2fw"
				}],
				["path", {
					d: "M8.006 14 7 2",
					key: "13bxiv"
				}],
				["path", {
					d: "M7.565 8.787A5 5 0 0 0 12 8a5 5 0 0 1 4.56-.75",
					key: "1s61ad"
				}],
				["path", {
					d: "M19 2H5a2 2 0 0 0-2 2v5a2 2 0 0 0 .688 1.5",
					key: "gel3rg"
				}],
				["path", {
					d: "M12 18h.01",
					key: "mhygvu"
				}]
			]);
			createLucideIcon("blinds", [
				["path", {
					d: "M3 3h18",
					key: "o7r712"
				}],
				["path", {
					d: "M20 7H8",
					key: "gd2fo2"
				}],
				["path", {
					d: "M20 11H8",
					key: "1ynp89"
				}],
				["path", {
					d: "M10 19h10",
					key: "19hjk5"
				}],
				["path", {
					d: "M8 15h12",
					key: "1yqzne"
				}],
				["path", {
					d: "M4 3v14",
					key: "fggqzn"
				}],
				["circle", {
					cx: "4",
					cy: "19",
					r: "2",
					key: "p3m9r0"
				}]
			]);
			createLucideIcon("blocks", [["path", {
				d: "M10 22V7a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2",
				key: "1ah6g2"
			}], ["rect", {
				x: "14",
				y: "2",
				width: "8",
				height: "8",
				rx: "1",
				key: "88lufb"
			}]]);
			createLucideIcon("bluetooth-connected", [
				["path", {
					d: "m7 7 10 10-5 5V2l5 5L7 17",
					key: "1q5490"
				}],
				["line", {
					x1: "18",
					x2: "21",
					y1: "12",
					y2: "12",
					key: "1rsjjs"
				}],
				["line", {
					x1: "3",
					x2: "6",
					y1: "12",
					y2: "12",
					key: "11yl8c"
				}]
			]);
			createLucideIcon("bluetooth-off", [
				["path", {
					d: "m17 17-5 5V12l-5 5",
					key: "v5aci6"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M14.5 9.5 17 7l-5-5v4.5",
					key: "1kddfz"
				}]
			]);
			createLucideIcon("bluetooth-searching", [
				["path", {
					d: "m7 7 10 10-5 5V2l5 5L7 17",
					key: "1q5490"
				}],
				["path", {
					d: "M20.83 14.83a4 4 0 0 0 0-5.66",
					key: "k8tn1j"
				}],
				["path", {
					d: "M18 12h.01",
					key: "yjnet6"
				}]
			]);
			createLucideIcon("bold", [["path", {
				d: "M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8",
				key: "mg9rjx"
			}]]);
			createLucideIcon("bluetooth", [["path", {
				d: "m7 7 10 10-5 5V2l5 5L7 17",
				key: "1q5490"
			}]]);
			createLucideIcon("bolt", [["path", {
				d: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
				key: "yt0hxn"
			}], ["circle", {
				cx: "12",
				cy: "12",
				r: "4",
				key: "4exip2"
			}]]);
			createLucideIcon("bomb", [
				["circle", {
					cx: "11",
					cy: "13",
					r: "9",
					key: "hd149"
				}],
				["path", {
					d: "M14.35 4.65 16.3 2.7a2.41 2.41 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-1.95 1.95",
					key: "jp4j1b"
				}],
				["path", {
					d: "m22 2-1.5 1.5",
					key: "ay92ug"
				}]
			]);
			createLucideIcon("bone-fracture", [
				["path", {
					d: "M14 4.5a1 1 0 0 1 5 0 .5.5 0 0 0 .5.5 1 1 0 0 1 0 5c-.81 0-1.8-.7-2.5 0l-1.958 1.957a.15.15 0 0 1-.252-.072l-.493-2.07a.15.15 0 0 0-.111-.112l-2.072-.494a.15.15 0 0 1-.072-.252L14 7c.7-.7 0-1.69 0-2.5",
					key: "1c7o5b"
				}],
				["path", {
					d: "m16 20-1-2",
					key: "5348lt"
				}],
				["path", {
					d: "m20 16-2-1",
					key: "2c7pv5"
				}],
				["path", {
					d: "m4 8 2 1",
					key: "rpj1x4"
				}],
				["path", {
					d: "m8 4 1 2",
					key: "1r4zbp"
				}],
				["path", {
					d: "M9.698 14.19a.15.15 0 0 0 .112.112l2.074.489a.15.15 0 0 1 .072.252L10 17c-.7.7 0 1.69 0 2.5a1 1 0 0 1-5 0 .495.495 0 0 0-.5-.5 1 1 0 0 1 0-5c.81 0 1.8.7 2.5 0l1.956-1.957a.15.15 0 0 1 .252.072z",
					key: "3u61yx"
				}]
			]);
			createLucideIcon("bone", [["path", {
				d: "M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z",
				key: "w610uw"
			}]]);
			createLucideIcon("book-a", [
				["path", {
					d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
					key: "k3hazp"
				}],
				["path", {
					d: "m8 13 4-7 4 7",
					key: "4rari8"
				}],
				["path", {
					d: "M9.1 11h5.7",
					key: "1gkovt"
				}]
			]);
			createLucideIcon("book-alert", [
				["path", {
					d: "M12 13h.01",
					key: "y0uutt"
				}],
				["path", {
					d: "M12 6v3",
					key: "1m4b9j"
				}],
				["path", {
					d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
					key: "k3hazp"
				}]
			]);
			createLucideIcon("book-audio", [
				["path", {
					d: "M12 6v7",
					key: "1f6ttz"
				}],
				["path", {
					d: "M16 8v3",
					key: "gejaml"
				}],
				["path", {
					d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
					key: "k3hazp"
				}],
				["path", {
					d: "M8 8v3",
					key: "1qzp49"
				}]
			]);
			createLucideIcon("book-check", [["path", {
				d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
				key: "k3hazp"
			}], ["path", {
				d: "m9 9.5 2 2 4-4",
				key: "1dth82"
			}]]);
			createLucideIcon("book-copy", [
				["path", {
					d: "M5 7a2 2 0 0 0-2 2v11",
					key: "1yhqjt"
				}],
				["path", {
					d: "M5.803 18H5a2 2 0 0 0 0 4h9.5a.5.5 0 0 0 .5-.5V21",
					key: "edzzo5"
				}],
				["path", {
					d: "M9 15V4a2 2 0 0 1 2-2h9.5a.5.5 0 0 1 .5.5v14a.5.5 0 0 1-.5.5H11a2 2 0 0 1 0-4h10",
					key: "1nwzrg"
				}]
			]);
			createLucideIcon("book-dashed", [
				["path", {
					d: "M12 17h1.5",
					key: "1gkc67"
				}],
				["path", {
					d: "M12 22h1.5",
					key: "1my7sn"
				}],
				["path", {
					d: "M12 2h1.5",
					key: "19tvb7"
				}],
				["path", {
					d: "M17.5 22H19a1 1 0 0 0 1-1",
					key: "10akbh"
				}],
				["path", {
					d: "M17.5 2H19a1 1 0 0 1 1 1v1.5",
					key: "1vrfjs"
				}],
				["path", {
					d: "M20 14v3h-2.5",
					key: "1naeju"
				}],
				["path", {
					d: "M20 8.5V10",
					key: "1ctpfu"
				}],
				["path", {
					d: "M4 10V8.5",
					key: "1o3zg5"
				}],
				["path", {
					d: "M4 19.5V14",
					key: "ob81pf"
				}],
				["path", {
					d: "M4 4.5A2.5 2.5 0 0 1 6.5 2H8",
					key: "s8vcyb"
				}],
				["path", {
					d: "M8 22H6.5a1 1 0 0 1 0-5H8",
					key: "1cu73q"
				}]
			]);
			createLucideIcon("book-down", [
				["path", {
					d: "M12 13V7",
					key: "h0r20n"
				}],
				["path", {
					d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
					key: "k3hazp"
				}],
				["path", {
					d: "m9 10 3 3 3-3",
					key: "zt5b4y"
				}]
			]);
			createLucideIcon("book-headphones", [
				["path", {
					d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
					key: "k3hazp"
				}],
				["path", {
					d: "M8 12v-2a4 4 0 0 1 8 0v2",
					key: "1vsqkj"
				}],
				["circle", {
					cx: "15",
					cy: "12",
					r: "1",
					key: "1tmaij"
				}],
				["circle", {
					cx: "9",
					cy: "12",
					r: "1",
					key: "1vctgf"
				}]
			]);
			createLucideIcon("book-heart", [["path", {
				d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
				key: "k3hazp"
			}], ["path", {
				d: "M8.62 9.8A2.25 2.25 0 1 1 12 6.836a2.25 2.25 0 1 1 3.38 2.966l-2.626 2.856a.998.998 0 0 1-1.507 0z",
				key: "9v40y5"
			}]]);
			createLucideIcon("book-key", [
				["path", {
					d: "M13 2H6.5A2.5 2.5 0 0 0 4 4.5v15",
					key: "4azifu"
				}],
				["path", {
					d: "M17 2v6",
					key: "qgmh37"
				}],
				["path", {
					d: "M17 4h2",
					key: "13vrzo"
				}],
				["path", {
					d: "M20 15.2V21a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
					key: "192hzx"
				}],
				["circle", {
					cx: "17",
					cy: "10",
					r: "2",
					key: "y0i25j"
				}]
			]);
			createLucideIcon("book-lock", [
				["path", {
					d: "M18 6V4a2 2 0 1 0-4 0v2",
					key: "1aquzs"
				}],
				["path", {
					d: "M20 15v6a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
					key: "1rkj32"
				}],
				["path", {
					d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H10",
					key: "18wgow"
				}],
				["rect", {
					x: "12",
					y: "6",
					width: "8",
					height: "5",
					rx: "1",
					key: "73l30o"
				}]
			]);
			createLucideIcon("book-image", [
				["path", {
					d: "m20 13.7-2.1-2.1a2 2 0 0 0-2.8 0L9.7 17",
					key: "q6ojf0"
				}],
				["path", {
					d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
					key: "k3hazp"
				}],
				["circle", {
					cx: "10",
					cy: "8",
					r: "2",
					key: "2qkj4p"
				}]
			]);
			createLucideIcon("book-marked", [["path", {
				d: "M10 2v8l3-3 3 3V2",
				key: "sqw3rj"
			}], ["path", {
				d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
				key: "k3hazp"
			}]]);
			createLucideIcon("book-minus", [["path", {
				d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
				key: "k3hazp"
			}], ["path", {
				d: "M9 10h6",
				key: "9gxzsh"
			}]]);
			createLucideIcon("book-open-check", [
				["path", {
					d: "M12 5v16",
					key: "1f6ucr"
				}],
				["path", {
					d: "m16 12 2 2 4-4",
					key: "mdajum"
				}],
				["path", {
					d: "M22 6V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2h4.001A2 2 0 0022 17v-1.344",
					key: "144kbk"
				}]
			]);
			const BookOpen = createLucideIcon("book-open", [["path", {
				d: "M12 5v16",
				key: "1f6ucr"
			}], ["path", {
				d: "M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z",
				key: "1fyvmf"
			}]]);
			createLucideIcon("book-open-text", [
				["path", {
					d: "M12 5v16",
					key: "1f6ucr"
				}],
				["path", {
					d: "M16 13h2",
					key: "weia3s"
				}],
				["path", {
					d: "M16 9h2",
					key: "1n7gjm"
				}],
				["path", {
					d: "M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z",
					key: "1fyvmf"
				}],
				["path", {
					d: "M6 13h2",
					key: "1cckiz"
				}],
				["path", {
					d: "M6 9h2",
					key: "1k7j9f"
				}]
			]);
			createLucideIcon("book-plus", [
				["path", {
					d: "M12 7v6",
					key: "lw1j43"
				}],
				["path", {
					d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
					key: "k3hazp"
				}],
				["path", {
					d: "M9 10h6",
					key: "9gxzsh"
				}]
			]);
			createLucideIcon("book-search", [
				["path", {
					d: "M11 22H5.5a1 1 0 0 1 0-5h4.501",
					key: "mcbepb"
				}],
				["path", {
					d: "m21 22-1.879-1.878",
					key: "12q7x1"
				}],
				["path", {
					d: "M3 19.5v-15A2.5 2.5 0 0 1 5.5 2H18a1 1 0 0 1 1 1v8",
					key: "olfd5n"
				}],
				["circle", {
					cx: "17",
					cy: "18",
					r: "3",
					key: "82mm0e"
				}]
			]);
			createLucideIcon("book-text", [
				["path", {
					d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
					key: "k3hazp"
				}],
				["path", {
					d: "M8 11h8",
					key: "vwpz6n"
				}],
				["path", {
					d: "M8 7h6",
					key: "1f0q6e"
				}]
			]);
			createLucideIcon("book-type", [
				["path", {
					d: "M10 13h4",
					key: "ytezjc"
				}],
				["path", {
					d: "M12 6v7",
					key: "1f6ttz"
				}],
				["path", {
					d: "M16 8V6H8v2",
					key: "x8j6u4"
				}],
				["path", {
					d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
					key: "k3hazp"
				}]
			]);
			createLucideIcon("book-up", [
				["path", {
					d: "M12 13V7",
					key: "h0r20n"
				}],
				["path", {
					d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
					key: "k3hazp"
				}],
				["path", {
					d: "m9 10 3-3 3 3",
					key: "11gsxs"
				}]
			]);
			createLucideIcon("book-up-2", [
				["path", {
					d: "M12 13V7",
					key: "h0r20n"
				}],
				["path", {
					d: "M18 2h1a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
					key: "161d7n"
				}],
				["path", {
					d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2",
					key: "1lorq7"
				}],
				["path", {
					d: "m9 10 3-3 3 3",
					key: "11gsxs"
				}],
				["path", {
					d: "m9 5 3-3 3 3",
					key: "l8vdw6"
				}]
			]);
			createLucideIcon("book-user", [
				["path", {
					d: "M15 13a3 3 0 1 0-6 0",
					key: "10j68g"
				}],
				["path", {
					d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
					key: "k3hazp"
				}],
				["circle", {
					cx: "12",
					cy: "8",
					r: "2",
					key: "1822b1"
				}]
			]);
			createLucideIcon("book-x", [
				["path", {
					d: "m14.5 7.5-5 5",
					key: "3lb6iw"
				}],
				["path", {
					d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
					key: "k3hazp"
				}],
				["path", {
					d: "m9.5 7.5 5 5",
					key: "ko136h"
				}]
			]);
			createLucideIcon("book", [["path", {
				d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
				key: "k3hazp"
			}]]);
			createLucideIcon("bookmark-check", [["path", {
				d: "M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z",
				key: "oz39mx"
			}], ["path", {
				d: "m9 10 2 2 4-4",
				key: "1gnqz4"
			}]]);
			createLucideIcon("bookmark-minus", [["path", {
				d: "M15 10H9",
				key: "o6yqo3"
			}], ["path", {
				d: "M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z",
				key: "oz39mx"
			}]]);
			createLucideIcon("bookmark-off", [
				["path", {
					d: "M19 19v1a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5",
					key: "nigmce"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M8.656 3H17a2 2 0 0 1 2 2v8.344",
					key: "hlvsa"
				}]
			]);
			createLucideIcon("bookmark-plus", [
				["path", {
					d: "M12 7v6",
					key: "lw1j43"
				}],
				["path", {
					d: "M15 10H9",
					key: "o6yqo3"
				}],
				["path", {
					d: "M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z",
					key: "oz39mx"
				}]
			]);
			createLucideIcon("bookmark-x", [
				["path", {
					d: "m14.5 7.5-5 5",
					key: "3lb6iw"
				}],
				["path", {
					d: "M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z",
					key: "oz39mx"
				}],
				["path", {
					d: "m9.5 7.5 5 5",
					key: "ko136h"
				}]
			]);
			createLucideIcon("bookmark", [["path", {
				d: "M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z",
				key: "oz39mx"
			}]]);
			createLucideIcon("boom-box", [
				["path", {
					d: "M4 9V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4",
					key: "vvzvr1"
				}],
				["path", {
					d: "M8 8v1",
					key: "xcqmfk"
				}],
				["path", {
					d: "M12 8v1",
					key: "1rj8u4"
				}],
				["path", {
					d: "M16 8v1",
					key: "1q12zr"
				}],
				["rect", {
					width: "20",
					height: "12",
					x: "2",
					y: "9",
					rx: "2",
					key: "igpb89"
				}],
				["circle", {
					cx: "8",
					cy: "15",
					r: "2",
					key: "fa4a8s"
				}],
				["circle", {
					cx: "16",
					cy: "15",
					r: "2",
					key: "14c3ya"
				}]
			]);
			createLucideIcon("bot-message-square", [
				["path", {
					d: "M12 6V2H8",
					key: "1155em"
				}],
				["path", {
					d: "M15 11v2",
					key: "i11awn"
				}],
				["path", {
					d: "M2 12h2",
					key: "1t8f8n"
				}],
				["path", {
					d: "M20 12h2",
					key: "1q8mjw"
				}],
				["path", {
					d: "M20 16a2 2 0 0 1-2 2H8.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 4 20.286V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z",
					key: "11gyqh"
				}],
				["path", {
					d: "M9 11v2",
					key: "1ueba0"
				}]
			]);
			createLucideIcon("bot-off", [
				["path", {
					d: "M13.67 8H18a2 2 0 0 1 2 2v4.33",
					key: "7az073"
				}],
				["path", {
					d: "M2 14h2",
					key: "vft8re"
				}],
				["path", {
					d: "M20 14h2",
					key: "4cs60a"
				}],
				["path", {
					d: "M22 22 2 2",
					key: "1r8tn9"
				}],
				["path", {
					d: "M8 8H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 1.414-.586",
					key: "s09a7a"
				}],
				["path", {
					d: "M9 13v2",
					key: "rq6x2g"
				}],
				["path", {
					d: "M9.67 4H12v2.33",
					key: "110xot"
				}]
			]);
			createLucideIcon("bot", [
				["path", {
					d: "M12 8V4H8",
					key: "hb8ula"
				}],
				["rect", {
					width: "16",
					height: "12",
					x: "4",
					y: "8",
					rx: "2",
					key: "enze0r"
				}],
				["path", {
					d: "M2 14h2",
					key: "vft8re"
				}],
				["path", {
					d: "M20 14h2",
					key: "4cs60a"
				}],
				["path", {
					d: "M15 13v2",
					key: "1xurst"
				}],
				["path", {
					d: "M9 13v2",
					key: "rq6x2g"
				}]
			]);
			createLucideIcon("bottle-wine", [["path", {
				d: "M10 3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a6 6 0 0 0 1.2 3.6l.6.8A6 6 0 0 1 17 13v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-8a6 6 0 0 1 1.2-3.6l.6-.8A6 6 0 0 0 10 5z",
				key: "blqgoc"
			}], ["path", {
				d: "M17 13h-4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h4",
				key: "43jbee"
			}]]);
			createLucideIcon("bow-arrow", [
				["path", {
					d: "M17 3h4v4",
					key: "19p9u1"
				}],
				["path", {
					d: "M18.575 11.082a13 13 0 0 1 1.048 9.027 1.17 1.17 0 0 1-1.914.597L14 17",
					key: "12t3w9"
				}],
				["path", {
					d: "M7 10 3.29 6.29a1.17 1.17 0 0 1 .6-1.91 13 13 0 0 1 9.03 1.05",
					key: "ogng5l"
				}],
				["path", {
					d: "M7 14a1.7 1.7 0 0 0-1.207.5l-2.646 2.646A.5.5 0 0 0 3.5 18H5a1 1 0 0 1 1 1v1.5a.5.5 0 0 0 .854.354L9.5 18.207A1.7 1.7 0 0 0 10 17v-2a1 1 0 0 0-1-1z",
					key: "8v3fy2"
				}],
				["path", {
					d: "M9.707 14.293 21 3",
					key: "ydm3bn"
				}]
			]);
			createLucideIcon("box", [
				["path", {
					d: "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",
					key: "hh9hay"
				}],
				["path", {
					d: "m3.3 7 8.7 5 8.7-5",
					key: "g66t2b"
				}],
				["path", {
					d: "M12 22V12",
					key: "d0xqtd"
				}]
			]);
			createLucideIcon("boxes", [
				["path", {
					d: "M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z",
					key: "lc1i9w"
				}],
				["path", {
					d: "m7 16.5-4.74-2.85",
					key: "1o9zyk"
				}],
				["path", {
					d: "m7 16.5 5-3",
					key: "va8pkn"
				}],
				["path", {
					d: "M7 16.5v5.17",
					key: "jnp8gn"
				}],
				["path", {
					d: "M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z",
					key: "8zsnat"
				}],
				["path", {
					d: "m17 16.5-5-3",
					key: "8arw3v"
				}],
				["path", {
					d: "m17 16.5 4.74-2.85",
					key: "8rfmw"
				}],
				["path", {
					d: "M17 16.5v5.17",
					key: "k6z78m"
				}],
				["path", {
					d: "M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z",
					key: "1xygjf"
				}],
				["path", {
					d: "M12 8 7.26 5.15",
					key: "1vbdud"
				}],
				["path", {
					d: "m12 8 4.74-2.85",
					key: "3rx089"
				}],
				["path", {
					d: "M12 13.5V8",
					key: "1io7kd"
				}]
			]);
			createLucideIcon("braces", [["path", {
				d: "M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1",
				key: "ezmyqa"
			}], ["path", {
				d: "M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1",
				key: "e1hn23"
			}]]);
			createLucideIcon("brackets", [["path", {
				d: "M16 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-3",
				key: "1kt8lf"
			}], ["path", {
				d: "M8 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h3",
				key: "gduv9"
			}]]);
			createLucideIcon("brain-circuit", [
				["path", {
					d: "M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z",
					key: "l5xja"
				}],
				["path", {
					d: "M9 13a4.5 4.5 0 0 0 3-4",
					key: "10igwf"
				}],
				["path", {
					d: "M6.003 5.125A3 3 0 0 0 6.401 6.5",
					key: "105sqy"
				}],
				["path", {
					d: "M3.477 10.896a4 4 0 0 1 .585-.396",
					key: "ql3yin"
				}],
				["path", {
					d: "M6 18a4 4 0 0 1-1.967-.516",
					key: "2e4loj"
				}],
				["path", {
					d: "M12 13h4",
					key: "1ku699"
				}],
				["path", {
					d: "M12 18h6a2 2 0 0 1 2 2v1",
					key: "105ag5"
				}],
				["path", {
					d: "M12 8h8",
					key: "1lhi5i"
				}],
				["path", {
					d: "M16 8V5a2 2 0 0 1 2-2",
					key: "u6izg6"
				}],
				["circle", {
					cx: "16",
					cy: "13",
					r: ".5",
					key: "ry7gng"
				}],
				["circle", {
					cx: "18",
					cy: "3",
					r: ".5",
					key: "1aiba7"
				}],
				["circle", {
					cx: "20",
					cy: "21",
					r: ".5",
					key: "yhc1fs"
				}],
				["circle", {
					cx: "20",
					cy: "8",
					r: ".5",
					key: "1e43v0"
				}]
			]);
			createLucideIcon("brain-cog", [
				["path", {
					d: "m10.852 14.772-.383.923",
					key: "11vil6"
				}],
				["path", {
					d: "m10.852 9.228-.383-.923",
					key: "1fjppe"
				}],
				["path", {
					d: "m13.148 14.772.382.924",
					key: "je3va1"
				}],
				["path", {
					d: "m13.531 8.305-.383.923",
					key: "18epck"
				}],
				["path", {
					d: "m14.772 10.852.923-.383",
					key: "k9m8cz"
				}],
				["path", {
					d: "m14.772 13.148.923.383",
					key: "1xvhww"
				}],
				["path", {
					d: "M17.598 6.5A3 3 0 1 0 12 5a3 3 0 0 0-5.63-1.446 3 3 0 0 0-.368 1.571 4 4 0 0 0-2.525 5.771",
					key: "jcbbz1"
				}],
				["path", {
					d: "M17.998 5.125a4 4 0 0 1 2.525 5.771",
					key: "1kkn7e"
				}],
				["path", {
					d: "M19.505 10.294a4 4 0 0 1-1.5 7.706",
					key: "18bmuc"
				}],
				["path", {
					d: "M4.032 17.483A4 4 0 0 0 11.464 20c.18-.311.892-.311 1.072 0a4 4 0 0 0 7.432-2.516",
					key: "uozx0d"
				}],
				["path", {
					d: "M4.5 10.291A4 4 0 0 0 6 18",
					key: "whdemb"
				}],
				["path", {
					d: "M6.002 5.125a3 3 0 0 0 .4 1.375",
					key: "1kqy2g"
				}],
				["path", {
					d: "m9.228 10.852-.923-.383",
					key: "1wtb30"
				}],
				["path", {
					d: "m9.228 13.148-.923.383",
					key: "1a830x"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "3",
					key: "1v7zrd"
				}]
			]);
			createLucideIcon("brick-wall-fire", [
				["path", {
					d: "M16 3v2.107",
					key: "gq8xun"
				}],
				["path", {
					d: "M17 9c1 3 2.5 3.5 3.5 4.5A5 5 0 0 1 22 17a5 5 0 0 1-10 0c0-.3 0-.6.1-.9a2 2 0 1 0 3.3-2C13 11.5 16 9 17 9",
					key: "1l2pih"
				}],
				["path", {
					d: "M21 8.274V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.938",
					key: "jrnqjp"
				}],
				["path", {
					d: "M3 15h5.253",
					key: "xqg7rb"
				}],
				["path", {
					d: "M3 9h8.228",
					key: "1ppb70"
				}],
				["path", {
					d: "M8 15v6",
					key: "1stoo3"
				}],
				["path", {
					d: "M8 3v6",
					key: "vlvjmk"
				}]
			]);
			const Brain = createLucideIcon("brain", [
				["path", {
					d: "M12 18V5",
					key: "adv99a"
				}],
				["path", {
					d: "M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4",
					key: "1e3is1"
				}],
				["path", {
					d: "M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5",
					key: "1gqd8o"
				}],
				["path", {
					d: "M17.997 5.125a4 4 0 0 1 2.526 5.77",
					key: "iwvgf7"
				}],
				["path", {
					d: "M18 18a4 4 0 0 0 2-7.464",
					key: "efp6ie"
				}],
				["path", {
					d: "M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517",
					key: "1gq6am"
				}],
				["path", {
					d: "M6 18a4 4 0 0 1-2-7.464",
					key: "k1g0md"
				}],
				["path", {
					d: "M6.003 5.125a4 4 0 0 0-2.526 5.77",
					key: "q97ue3"
				}]
			]);
			createLucideIcon("brick-wall-shield", [
				["path", {
					d: "M12 9v1.258",
					key: "iwpddn"
				}],
				["path", {
					d: "M16 3v5.46",
					key: "d7ew98"
				}],
				["path", {
					d: "M21 9.118V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5.75",
					key: "137t5x"
				}],
				["path", {
					d: "M22 17.5c0 2.499-1.75 3.749-3.83 4.474a.5.5 0 0 1-.335-.005c-2.085-.72-3.835-1.97-3.835-4.47V14a.5.5 0 0 1 .5-.499c1 0 2.25-.6 3.12-1.36a.6.6 0 0 1 .76-.001c.875.765 2.12 1.36 3.12 1.36a.5.5 0 0 1 .5.5z",
					key: "16j3tf"
				}],
				["path", {
					d: "M3 15h7",
					key: "1qldh6"
				}],
				["path", {
					d: "M3 9h12.142",
					key: "1yjd6m"
				}],
				["path", {
					d: "M8 15v6",
					key: "1stoo3"
				}],
				["path", {
					d: "M8 3v6",
					key: "vlvjmk"
				}]
			]);
			createLucideIcon("brick-wall", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M12 9v6",
					key: "199k2o"
				}],
				["path", {
					d: "M16 15v6",
					key: "8rj2es"
				}],
				["path", {
					d: "M16 3v6",
					key: "1j6rpj"
				}],
				["path", {
					d: "M3 15h18",
					key: "5xshup"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["path", {
					d: "M8 15v6",
					key: "1stoo3"
				}],
				["path", {
					d: "M8 3v6",
					key: "vlvjmk"
				}]
			]);
			createLucideIcon("briefcase-business", [
				["path", {
					d: "M12 12h.01",
					key: "1mp3jc"
				}],
				["path", {
					d: "M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2",
					key: "1ksdt3"
				}],
				["path", {
					d: "M22 13a18.15 18.15 0 0 1-20 0",
					key: "12hx5q"
				}],
				["rect", {
					width: "20",
					height: "14",
					x: "2",
					y: "6",
					rx: "2",
					key: "i6l2r4"
				}]
			]);
			createLucideIcon("briefcase-conveyor-belt", [
				["path", {
					d: "M10 20v2",
					key: "1n8e1g"
				}],
				["path", {
					d: "M14 20v2",
					key: "1lq872"
				}],
				["path", {
					d: "M18 20v2",
					key: "10uadw"
				}],
				["path", {
					d: "M21 20H3",
					key: "kdqkdp"
				}],
				["path", {
					d: "M6 20v2",
					key: "a9bc87"
				}],
				["path", {
					d: "M8 16V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v12",
					key: "17n9tx"
				}],
				["rect", {
					x: "4",
					y: "6",
					width: "16",
					height: "10",
					rx: "2",
					key: "1097i5"
				}]
			]);
			createLucideIcon("briefcase-medical", [
				["path", {
					d: "M12 11v4",
					key: "a6ujw6"
				}],
				["path", {
					d: "M14 13h-4",
					key: "1pl8zg"
				}],
				["path", {
					d: "M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2",
					key: "1ksdt3"
				}],
				["path", {
					d: "M18 6v14",
					key: "1mu4gy"
				}],
				["path", {
					d: "M6 6v14",
					key: "1s15cj"
				}],
				["rect", {
					width: "20",
					height: "14",
					x: "2",
					y: "6",
					rx: "2",
					key: "i6l2r4"
				}]
			]);
			createLucideIcon("briefcase", [["path", {
				d: "M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16",
				key: "jecpp"
			}], ["rect", {
				width: "20",
				height: "14",
				x: "2",
				y: "6",
				rx: "2",
				key: "i6l2r4"
			}]]);
			createLucideIcon("broccoli", [
				["path", {
					d: "M10 13a3 3 0 0 1-2.121-5.121",
					key: "1oqad0"
				}],
				["path", {
					d: "M15.606 14.204c-3.5 1.5-5.899 4.503-8.899 7.503A1 1 0 0 1 6 22c-2 0-4-2-4-4a1 1 0 0 1 .293-.707c1.911-1.911 3.823-3.578 5.347-5.441",
					key: "c93qjr"
				}],
				["path", {
					d: "M16.573 14.737A4 4 0 0 1 14 11",
					key: "1ymr17"
				}],
				["path", {
					d: "M7.14 10.907a4 4 0 1 1 2.756-7.43A4 4 0 0 1 16.7 4.48a2 2 0 0 1 2.82 2.82 4 4 0 0 1 1.002 6.805A4 4 0 1 1 13 16",
					key: "1kbgad"
				}]
			]);
			createLucideIcon("broom-sparkles", [
				["path", {
					d: "M11 2v2",
					key: "1539x4"
				}],
				["path", {
					d: "M12 3h-2",
					key: "1su5n0"
				}],
				["path", {
					d: "M13.5 10.5 22 2",
					key: "1yxz6l"
				}],
				["path", {
					d: "M14.734 13.841a2 2 0 00-.314-2.42L12.58 9.58a2 2 0 00-2.421-.314l-7.657 4.461A1 1 0 002.3 15.3l6.403 6.403a1 1 0 001.571-.204z",
					key: "1q75r6"
				}],
				["path", {
					d: "M20 15v4",
					key: "nmhudv"
				}],
				["path", {
					d: "M22 17h-4",
					key: "1sj068"
				}],
				["path", {
					d: "M4 4v4",
					key: "a4sqb9"
				}],
				["path", {
					d: "m5 18 2-2",
					key: "11qwpn"
				}],
				["path", {
					d: "M6 6H2",
					key: "1cli1h"
				}],
				["path", {
					d: "m7.699 10.7 5.602 5.601",
					key: "1rehuz"
				}]
			]);
			createLucideIcon("bring-to-front", [
				["rect", {
					x: "8",
					y: "8",
					width: "8",
					height: "8",
					rx: "2",
					key: "yj20xf"
				}],
				["path", {
					d: "M4 10a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2",
					key: "1ltk23"
				}],
				["path", {
					d: "M14 20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2",
					key: "1q24h9"
				}]
			]);
			createLucideIcon("brush-cleaning", [
				["path", {
					d: "m16 22-1-4",
					key: "1ow2iv"
				}],
				["path", {
					d: "M19 14a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2h-3a1 1 0 0 1-1-1V4a2 2 0 0 0-4 0v5a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1",
					key: "11gii7"
				}],
				["path", {
					d: "M19 14H5l-1.973 6.767A1 1 0 0 0 4 22h16a1 1 0 0 0 .973-1.233z",
					key: "bju7h4"
				}],
				["path", {
					d: "m8 22 1-4",
					key: "s3unb"
				}]
			]);
			createLucideIcon("broom", [
				["path", {
					d: "M13.5 10.5 22 2",
					key: "1yxz6l"
				}],
				["path", {
					d: "M14.734 13.841a2 2 0 00-.314-2.42L12.58 9.58a2 2 0 00-2.421-.314l-7.657 4.461A1 1 0 002.3 15.3l6.403 6.403a1 1 0 001.571-.204z",
					key: "1q75r6"
				}],
				["path", {
					d: "m5 18 2-2",
					key: "11qwpn"
				}],
				["path", {
					d: "m7.699 10.7 5.602 5.601",
					key: "1rehuz"
				}]
			]);
			createLucideIcon("brush", [
				["path", {
					d: "m11 10 3 3",
					key: "fzmg1i"
				}],
				["path", {
					d: "M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21z",
					key: "p4q2r7"
				}],
				["path", {
					d: "M9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031",
					key: "wy6l02"
				}]
			]);
			createLucideIcon("bubbles", [
				["path", {
					d: "M7.001 15.085A1.5 1.5 0 0 1 9 16.5",
					key: "y44lvh"
				}],
				["circle", {
					cx: "18.5",
					cy: "8.5",
					r: "3.5",
					key: "1wadoa"
				}],
				["circle", {
					cx: "7.5",
					cy: "16.5",
					r: "5.5",
					key: "6mdt3g"
				}],
				["circle", {
					cx: "7.5",
					cy: "4.5",
					r: "2.5",
					key: "637s54"
				}]
			]);
			createLucideIcon("bug-play", [
				["path", {
					d: "M10 19.655A6 6 0 0 1 6 14v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 3.97",
					key: "1gnv52"
				}],
				["path", {
					d: "M14 15.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997a1 1 0 0 1-1.517-.86z",
					key: "1weqy9"
				}],
				["path", {
					d: "M14.12 3.88 16 2",
					key: "qol33r"
				}],
				["path", {
					d: "M21 5a4 4 0 0 1-3.55 3.97",
					key: "5cxbf6"
				}],
				["path", {
					d: "M3 21a4 4 0 0 1 3.81-4",
					key: "1fjd4g"
				}],
				["path", {
					d: "M3 5a4 4 0 0 0 3.55 3.97",
					key: "1d7oge"
				}],
				["path", {
					d: "M6 13H2",
					key: "82j7cp"
				}],
				["path", {
					d: "m8 2 1.88 1.88",
					key: "fmnt4t"
				}],
				["path", {
					d: "M9 7.13V6a3 3 0 1 1 6 0v1.13",
					key: "1vgav8"
				}]
			]);
			createLucideIcon("bug-off", [
				["path", {
					d: "M12 20v-8",
					key: "i3yub9"
				}],
				["path", {
					d: "M12.656 7H14a4 4 0 0 1 4 4v1.344",
					key: "vvueyn"
				}],
				["path", {
					d: "M14.12 3.88 16 2",
					key: "qol33r"
				}],
				["path", {
					d: "M17.123 17.123A6 6 0 0 1 6 14v-3a4 4 0 0 1 1.72-3.287",
					key: "1cu21y"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M21 5a4 4 0 0 1-3.55 3.97",
					key: "5cxbf6"
				}],
				["path", {
					d: "M22 13h-3.344",
					key: "qb08am"
				}],
				["path", {
					d: "M3 21a4 4 0 0 1 3.81-4",
					key: "1fjd4g"
				}],
				["path", {
					d: "M3 5a4 4 0 0 0 3.55 3.97",
					key: "1d7oge"
				}],
				["path", {
					d: "M6 13H2",
					key: "82j7cp"
				}],
				["path", {
					d: "m8 2 1.88 1.88",
					key: "fmnt4t"
				}],
				["path", {
					d: "M9.712 4.06A3 3 0 0 1 15 6v1.13",
					key: "1bvup6"
				}]
			]);
			createLucideIcon("bug", [
				["path", {
					d: "M12 20v-9",
					key: "1qisl0"
				}],
				["path", {
					d: "M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z",
					key: "uouzyp"
				}],
				["path", {
					d: "M14.12 3.88 16 2",
					key: "qol33r"
				}],
				["path", {
					d: "M21 21a4 4 0 0 0-3.81-4",
					key: "1b0z45"
				}],
				["path", {
					d: "M21 5a4 4 0 0 1-3.55 3.97",
					key: "5cxbf6"
				}],
				["path", {
					d: "M22 13h-4",
					key: "1jl80f"
				}],
				["path", {
					d: "M3 21a4 4 0 0 1 3.81-4",
					key: "1fjd4g"
				}],
				["path", {
					d: "M3 5a4 4 0 0 0 3.55 3.97",
					key: "1d7oge"
				}],
				["path", {
					d: "M6 13H2",
					key: "82j7cp"
				}],
				["path", {
					d: "m8 2 1.88 1.88",
					key: "fmnt4t"
				}],
				["path", {
					d: "M9 7.13V6a3 3 0 1 1 6 0v1.13",
					key: "1vgav8"
				}]
			]);
			createLucideIcon("building", [
				["path", {
					d: "M12 10h.01",
					key: "1nrarc"
				}],
				["path", {
					d: "M12 14h.01",
					key: "1etili"
				}],
				["path", {
					d: "M12 6h.01",
					key: "1vi96p"
				}],
				["path", {
					d: "M16 10h.01",
					key: "1m94wz"
				}],
				["path", {
					d: "M16 14h.01",
					key: "1gbofw"
				}],
				["path", {
					d: "M16 6h.01",
					key: "1x0f13"
				}],
				["path", {
					d: "M8 10h.01",
					key: "19clt8"
				}],
				["path", {
					d: "M8 14h.01",
					key: "6423bh"
				}],
				["path", {
					d: "M8 6h.01",
					key: "1dz90k"
				}],
				["path", {
					d: "M9 22v-3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3",
					key: "cabbwy"
				}],
				["rect", {
					x: "4",
					y: "2",
					width: "16",
					height: "20",
					rx: "2",
					key: "1uxh74"
				}]
			]);
			createLucideIcon("bus-front", [
				["path", {
					d: "M4 6 2 7",
					key: "1mqr15"
				}],
				["path", {
					d: "M10 6h4",
					key: "1itunk"
				}],
				["path", {
					d: "m22 7-2-1",
					key: "1umjhc"
				}],
				["rect", {
					width: "16",
					height: "16",
					x: "4",
					y: "3",
					rx: "2",
					key: "1wxw4b"
				}],
				["path", {
					d: "M4 11h16",
					key: "mpoxn0"
				}],
				["path", {
					d: "M8 15h.01",
					key: "a7atzg"
				}],
				["path", {
					d: "M16 15h.01",
					key: "rnfrdf"
				}],
				["path", {
					d: "M6 19v2",
					key: "1loha6"
				}],
				["path", {
					d: "M18 21v-2",
					key: "sqyl04"
				}]
			]);
			createLucideIcon("building-2", [
				["path", {
					d: "M10 12h4",
					key: "a56b0p"
				}],
				["path", {
					d: "M10 8h4",
					key: "1sr2af"
				}],
				["path", {
					d: "M14 21v-3a2 2 0 0 0-4 0v3",
					key: "1rgiei"
				}],
				["path", {
					d: "M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2",
					key: "secmi2"
				}],
				["path", {
					d: "M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16",
					key: "16ra0t"
				}]
			]);
			createLucideIcon("bus", [
				["path", {
					d: "M8 6v6",
					key: "18i7km"
				}],
				["path", {
					d: "M15 6v6",
					key: "1sg6z9"
				}],
				["path", {
					d: "M2 12h19.6",
					key: "de5uta"
				}],
				["path", {
					d: "M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3",
					key: "1wwztk"
				}],
				["circle", {
					cx: "7",
					cy: "18",
					r: "2",
					key: "19iecd"
				}],
				["path", {
					d: "M9 18h5",
					key: "lrx6i"
				}],
				["circle", {
					cx: "16",
					cy: "18",
					r: "2",
					key: "1v4tcr"
				}]
			]);
			createLucideIcon("cable-car", [
				["path", {
					d: "M10 3h.01",
					key: "lbucoy"
				}],
				["path", {
					d: "M14 2h.01",
					key: "1k8aa1"
				}],
				["path", {
					d: "m2 9 20-5",
					key: "1kz0j5"
				}],
				["path", {
					d: "M12 12V6.5",
					key: "1vbrij"
				}],
				["rect", {
					width: "16",
					height: "10",
					x: "4",
					y: "12",
					rx: "3",
					key: "if91er"
				}],
				["path", {
					d: "M9 12v5",
					key: "3anwtq"
				}],
				["path", {
					d: "M15 12v5",
					key: "5xh3zn"
				}],
				["path", {
					d: "M4 17h16",
					key: "g4d7ey"
				}]
			]);
			createLucideIcon("cake-slice", [
				["path", {
					d: "M16 13H3",
					key: "1wpj08"
				}],
				["path", {
					d: "M16 17H3",
					key: "3lvfcd"
				}],
				["path", {
					d: "m7.2 7.9-3.388 2.5A2 2 0 0 0 3 12.01V20a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-8.654c0-2-2.44-6.026-6.44-8.026a1 1 0 0 0-1.082.057L10.4 5.6",
					key: "1gmhf7"
				}],
				["circle", {
					cx: "9",
					cy: "7",
					r: "2",
					key: "1305pl"
				}]
			]);
			createLucideIcon("cable", [
				["path", {
					d: "M17 19a1 1 0 0 1-1-1v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1z",
					key: "trhst0"
				}],
				["path", {
					d: "M17 21v-2",
					key: "ds4u3f"
				}],
				["path", {
					d: "M19 14V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V10",
					key: "1mo9zo"
				}],
				["path", {
					d: "M21 21v-2",
					key: "eo0ou"
				}],
				["path", {
					d: "M3 5V3",
					key: "1k5hjh"
				}],
				["path", {
					d: "M4 10a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2z",
					key: "1dd30t"
				}],
				["path", {
					d: "M7 5V3",
					key: "1t1388"
				}]
			]);
			createLucideIcon("cake", [
				["path", {
					d: "M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8",
					key: "1w3rig"
				}],
				["path", {
					d: "M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1",
					key: "n2jgmb"
				}],
				["path", {
					d: "M2 21h20",
					key: "1nyx9w"
				}],
				["path", {
					d: "M7 8v3",
					key: "1qtyvj"
				}],
				["path", {
					d: "M12 8v3",
					key: "hwp4zt"
				}],
				["path", {
					d: "M17 8v3",
					key: "1i6e5u"
				}],
				["path", {
					d: "M7 4h.01",
					key: "1bh4kh"
				}],
				["path", {
					d: "M12 4h.01",
					key: "1ujb9j"
				}],
				["path", {
					d: "M17 4h.01",
					key: "1upcoc"
				}]
			]);
			createLucideIcon("calculator", [
				["rect", {
					width: "16",
					height: "20",
					x: "4",
					y: "2",
					rx: "2",
					key: "1nb95v"
				}],
				["line", {
					x1: "8",
					x2: "16",
					y1: "6",
					y2: "6",
					key: "x4nwl0"
				}],
				["line", {
					x1: "16",
					x2: "16",
					y1: "14",
					y2: "18",
					key: "wjye3r"
				}],
				["path", {
					d: "M16 10h.01",
					key: "1m94wz"
				}],
				["path", {
					d: "M12 10h.01",
					key: "1nrarc"
				}],
				["path", {
					d: "M8 10h.01",
					key: "19clt8"
				}],
				["path", {
					d: "M12 14h.01",
					key: "1etili"
				}],
				["path", {
					d: "M8 14h.01",
					key: "6423bh"
				}],
				["path", {
					d: "M12 18h.01",
					key: "mhygvu"
				}],
				["path", {
					d: "M8 18h.01",
					key: "lrp35t"
				}]
			]);
			createLucideIcon("calendar-1", [
				["path", {
					d: "M11 13h1v4",
					key: "10p4bv"
				}],
				["path", {
					d: "M16 2v3",
					key: "otl347"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["path", {
					d: "M8 2v3",
					key: "1ioesn"
				}],
				["rect", {
					x: "3",
					y: "3",
					width: "18",
					height: "18",
					rx: "2",
					key: "h1oib"
				}]
			]);
			createLucideIcon("calendar-arrow-down", [
				["path", {
					d: "m14 17 4 4 4-4",
					key: "17qdjf"
				}],
				["path", {
					d: "M16 2v3",
					key: "otl347"
				}],
				["path", {
					d: "M18 13v8",
					key: "1a00n0"
				}],
				["path", {
					d: "M21 10.354V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h7.343",
					key: "1qsorh"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["path", {
					d: "M8 2v3",
					key: "1ioesn"
				}]
			]);
			createLucideIcon("calendar-arrow-up", [
				["path", {
					d: "m14 17 4-4 4 4",
					key: "1qa3u6"
				}],
				["path", {
					d: "M16 2v3",
					key: "otl347"
				}],
				["path", {
					d: "M18 21v-8",
					key: "1ao88k"
				}],
				["path", {
					d: "M21 10.343V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h9",
					key: "185mot"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["path", {
					d: "M8 2v3",
					key: "1ioesn"
				}]
			]);
			createLucideIcon("calendar-check-2", [
				["path", {
					d: "M 19 3 L 5 3",
					key: "1xn3iy"
				}],
				["path", {
					d: "M 21 13 L 21 5",
					key: "102s58"
				}],
				["path", {
					d: "M 21 5 A2 2 0 0 0 19 3",
					key: "1xylja"
				}],
				["path", {
					d: "M 3 19 A2 2 0 0 0 5 21",
					key: "19jxbv"
				}],
				["path", {
					d: "M 3 5 L 3 19",
					key: "1yylhw"
				}],
				["path", {
					d: "M 5 3 A2 2 0 0 0 3 5",
					key: "164twa"
				}],
				["path", {
					d: "m16 19 2 2 4-4",
					key: "1b14m6"
				}],
				["path", {
					d: "M16 2v3",
					key: "otl347"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["path", {
					d: "M5 21 L12.5 21",
					key: "1n38e0"
				}],
				["path", {
					d: "M8 2v3",
					key: "1ioesn"
				}]
			]);
			createLucideIcon("calendar-check", [
				["path", {
					d: "M8 2v3",
					key: "1ioesn"
				}],
				["path", {
					d: "M16 2v3",
					key: "otl347"
				}],
				["rect", {
					x: "3",
					y: "3",
					width: "18",
					height: "18",
					rx: "2",
					key: "h1oib"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["path", {
					d: "m9 15 2 2 4-4",
					key: "1grp1n"
				}]
			]);
			createLucideIcon("calendar-clock", [
				["path", {
					d: "M16 14v2.2l1.6 1",
					key: "fo4ql5"
				}],
				["path", {
					d: "M16 2v3",
					key: "otl347"
				}],
				["path", {
					d: "M21 7.338V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h2.338",
					key: "7hb8p4"
				}],
				["path", {
					d: "M3 9h5.859",
					key: "numkqi"
				}],
				["path", {
					d: "M8 2v3",
					key: "1ioesn"
				}],
				["circle", {
					cx: "16",
					cy: "16",
					r: "6",
					key: "qoo3c4"
				}]
			]);
			createLucideIcon("calendar-cog", [
				["path", {
					d: "m15.228 16.852-.923-.383",
					key: "npixar"
				}],
				["path", {
					d: "m15.228 19.148-.923.383",
					key: "51cr3n"
				}],
				["path", {
					d: "M16 2v3",
					key: "otl347"
				}],
				["path", {
					d: "m16.47 14.305.382.923",
					key: "obybxd"
				}],
				["path", {
					d: "m16.852 20.772-.383.924",
					key: "dpfhf9"
				}],
				["path", {
					d: "m19.148 15.228.383-.923",
					key: "1reyyz"
				}],
				["path", {
					d: "m19.53 21.696-.382-.924",
					key: "1goivc"
				}],
				["path", {
					d: "m20.773 16.852.924-.383",
					key: "ybmb4k"
				}],
				["path", {
					d: "m20.773 19.148.924.383",
					key: "1c2d3p"
				}],
				["path", {
					d: "M21 10.5V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h5.5",
					key: "1e6z1y"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["path", {
					d: "M8 2v3",
					key: "1ioesn"
				}],
				["circle", {
					cx: "18",
					cy: "18",
					r: "3",
					key: "1xkwt0"
				}]
			]);
			createLucideIcon("calendar-days", [
				["path", {
					d: "M8 2v3",
					key: "1ioesn"
				}],
				["path", {
					d: "M16 2v3",
					key: "otl347"
				}],
				["rect", {
					x: "3",
					y: "3",
					width: "18",
					height: "18",
					rx: "2",
					key: "h1oib"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["path", {
					d: "M8 13h.01",
					key: "1sbv64"
				}],
				["path", {
					d: "M12 13h.01",
					key: "y0uutt"
				}],
				["path", {
					d: "M16 13h.01",
					key: "wip0gl"
				}],
				["path", {
					d: "M8 17h.01",
					key: "p3bg7i"
				}],
				["path", {
					d: "M12 17h.01",
					key: "p32p05"
				}],
				["path", {
					d: "M16 17h.01",
					key: "ql8jdd"
				}]
			]);
			createLucideIcon("calendar-fold", [
				["path", {
					d: "M16 2v3",
					key: "otl347"
				}],
				["path", {
					d: "M21 15V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h10v-5a1 1 0 011-1za2.4 2.4 0 01-.706 1.706l-3.588 3.588A2.4 2.4 0 0115 21",
					key: "4uit17"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["path", {
					d: "M8 2v3",
					key: "1ioesn"
				}]
			]);
			createLucideIcon("calendar-heart", [
				["path", {
					d: "M12.127 21H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v5.125",
					key: "1fsxpc"
				}],
				["path", {
					d: "M14.62 17.8A2.25 2.25 0 1118 14.836a2.25 2.25 0 113.38 2.966l-2.626 2.856a.998.998 0 01-1.507 0z",
					key: "1gk3ue"
				}],
				["path", {
					d: "M16 2v3",
					key: "otl347"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["path", {
					d: "M8 2v3",
					key: "1ioesn"
				}]
			]);
			createLucideIcon("calendar-minus-2", [
				["path", {
					d: "M8 2v3",
					key: "1ioesn"
				}],
				["path", {
					d: "M16 2v3",
					key: "otl347"
				}],
				["rect", {
					x: "3",
					y: "3",
					width: "18",
					height: "18",
					rx: "2",
					key: "h1oib"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["path", {
					d: "M10 15h4",
					key: "192ueg"
				}]
			]);
			createLucideIcon("calendar-minus", [
				["path", {
					d: "M16 18h6",
					key: "987eiv"
				}],
				["path", {
					d: "M16 2v3",
					key: "otl347"
				}],
				["path", {
					d: "M21 14V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h8.3",
					key: "gcu0od"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["path", {
					d: "M8 2v3",
					key: "1ioesn"
				}]
			]);
			createLucideIcon("calendar-off", [
				["path", {
					d: "M16 2v3",
					key: "otl347"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M21 9h-5.5",
					key: "1g344v"
				}],
				["path", {
					d: "M3 9h6",
					key: "1q2djq"
				}],
				["path", {
					d: "M3.586 3.586A2 2 0 003 5v14a2 2 0 002 2h14a2 2 0 001.414-.586",
					key: "1g7ltu"
				}],
				["path", {
					d: "M8.656 3H19a2 2 0 012 2v10.344",
					key: "1bwpd1"
				}]
			]);
			createLucideIcon("calendar-plus-2", [
				["path", {
					d: "M8 2v3",
					key: "1ioesn"
				}],
				["path", {
					d: "M16 2v3",
					key: "otl347"
				}],
				["rect", {
					x: "3",
					y: "3",
					width: "18",
					height: "18",
					rx: "2",
					key: "h1oib"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["path", {
					d: "M10 15h4",
					key: "192ueg"
				}],
				["path", {
					d: "M12 13v4",
					key: "1il4po"
				}]
			]);
			createLucideIcon("calendar-plus", [
				["path", {
					d: "M16 18h6",
					key: "987eiv"
				}],
				["path", {
					d: "M16 2v3",
					key: "otl347"
				}],
				["path", {
					d: "M19 15v6",
					key: "10aioa"
				}],
				["path", {
					d: "M21 11.5V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h8.3",
					key: "jgwkxf"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["path", {
					d: "M8 2v3",
					key: "1ioesn"
				}]
			]);
			createLucideIcon("calendar-range", [
				["rect", {
					x: "3",
					y: "3",
					width: "18",
					height: "18",
					rx: "2",
					key: "h1oib"
				}],
				["path", {
					d: "M16 2v3",
					key: "otl347"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["path", {
					d: "M8 2v3",
					key: "1ioesn"
				}],
				["path", {
					d: "M17 13h-6",
					key: "1qbiup"
				}],
				["path", {
					d: "M13 17H7",
					key: "1x38vv"
				}],
				["path", {
					d: "M7 13h.01",
					key: "1vezk1"
				}],
				["path", {
					d: "M17 17h.01",
					key: "1sd3ek"
				}]
			]);
			createLucideIcon("calendar-search", [
				["path", {
					d: "M16 2v3",
					key: "otl347"
				}],
				["path", {
					d: "M21 10.69V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h7.25",
					key: "h6gkkz"
				}],
				["path", {
					d: "m22 21-1.875-1.875",
					key: "1dzjql"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["path", {
					d: "M8 2v3",
					key: "1ioesn"
				}],
				["circle", {
					cx: "18",
					cy: "17",
					r: "3",
					key: "1hty4x"
				}]
			]);
			createLucideIcon("calendar-sync", [
				["path", {
					d: "M11 10v4h4",
					key: "172dkj"
				}],
				["path", {
					d: "m11 14 1.535-1.605a5 5 0 018 1.5",
					key: "jekqcd"
				}],
				["path", {
					d: "M16 2v3",
					key: "otl347"
				}],
				["path", {
					d: "m21 18-1.535 1.605a5 5 0 01-8-1.5",
					key: "n107hu"
				}],
				["path", {
					d: "M21 22v-4h-4",
					key: "hrummi"
				}],
				["path", {
					d: "M21 8.517V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h3.517",
					key: "yafrba"
				}],
				["path", {
					d: "M3 9h4",
					key: "rnfnj5"
				}],
				["path", {
					d: "M8 2v3",
					key: "1ioesn"
				}]
			]);
			createLucideIcon("calendar-x-2", [
				["path", {
					d: "M16 2v3",
					key: "otl347"
				}],
				["path", {
					d: "m17 16 5 5",
					key: "1a37d9"
				}],
				["path", {
					d: "m17 21 5-5",
					key: "1b797a"
				}],
				["path", {
					d: "M21 12V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h8",
					key: "14ws7l"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["path", {
					d: "M8 2v3",
					key: "1ioesn"
				}]
			]);
			createLucideIcon("calendar-x", [
				["path", {
					d: "M8 2v3",
					key: "1ioesn"
				}],
				["path", {
					d: "M16 2v3",
					key: "otl347"
				}],
				["rect", {
					x: "3",
					y: "3",
					width: "18",
					height: "18",
					rx: "2",
					key: "h1oib"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["path", {
					d: "m14 13-4 4",
					key: "1gib57"
				}],
				["path", {
					d: "m10 13 4 4",
					key: "153uiq"
				}]
			]);
			createLucideIcon("calendars", [
				["path", {
					d: "M12 2v2",
					key: "tus03m"
				}],
				["path", {
					d: "M15.726 21.01A2 2 0 0 1 14 22H4a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2",
					key: "j6srht"
				}],
				["path", {
					d: "M18 2v2",
					key: "1kh14s"
				}],
				["path", {
					d: "M2 13h2",
					key: "13gyu8"
				}],
				["path", {
					d: "M8 8h14",
					key: "12jxz2"
				}],
				["rect", {
					x: "8",
					y: "3",
					width: "14",
					height: "14",
					rx: "2",
					key: "nsru6w"
				}]
			]);
			createLucideIcon("calendar", [
				["path", {
					d: "M8 2v3",
					key: "1ioesn"
				}],
				["path", {
					d: "M16 2v3",
					key: "otl347"
				}],
				["rect", {
					x: "3",
					y: "3",
					width: "18",
					height: "18",
					rx: "2",
					key: "h1oib"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}]
			]);
			createLucideIcon("camera-off", [
				["path", {
					d: "M14.564 14.558a3 3 0 1 1-4.122-4.121",
					key: "1rnrzw"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M20 20H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 .819-.175",
					key: "1x3arw"
				}],
				["path", {
					d: "M9.695 4.024A2 2 0 0 1 10.004 4h3.993a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v7.344",
					key: "1i84u0"
				}]
			]);
			createLucideIcon("camera", [["path", {
				d: "M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z",
				key: "18u6gg"
			}], ["circle", {
				cx: "12",
				cy: "13",
				r: "3",
				key: "1vg3eu"
			}]]);
			createLucideIcon("candy-cane", [
				["path", {
					d: "m10.8 5 2.111 4.223",
					key: "11kb8w"
				}],
				["path", {
					d: "M17.75 7 15 2.1",
					key: "12x7e8"
				}],
				["path", {
					d: "m4.874 14.647 2.12 4.24",
					key: "ccpt4b"
				}],
				["path", {
					d: "M5.7 21a2 2 0 0 1-3.5-2l8.6-14a6 6 0 0 1 10.4 6 2 2 0 1 1-3.464-2 2 2 0 1 0-3.464-2z",
					key: "u5e8z4"
				}],
				["path", {
					d: "m7.906 9.712 2.005 4.411",
					key: "1k0qph"
				}]
			]);
			createLucideIcon("candy", [
				["path", {
					d: "M10 7v10.9",
					key: "1gynux"
				}],
				["path", {
					d: "M14 6.1V17",
					key: "116kdf"
				}],
				["path", {
					d: "M16 7V3a1 1 0 0 1 1.707-.707 2.5 2.5 0 0 0 2.152.717 1 1 0 0 1 1.131 1.131 2.5 2.5 0 0 0 .717 2.152A1 1 0 0 1 21 8h-4",
					key: "gpb6xx"
				}],
				["path", {
					d: "M16.536 7.465a5 5 0 0 0-7.072 0l-2 2a5 5 0 0 0 0 7.07 5 5 0 0 0 7.072 0l2-2a5 5 0 0 0 0-7.07",
					key: "1tsln4"
				}],
				["path", {
					d: "M8 17v4a1 1 0 0 1-1.707.707 2.5 2.5 0 0 0-2.152-.717 1 1 0 0 1-1.131-1.131 2.5 2.5 0 0 0-.717-2.152A1 1 0 0 1 3 16h4",
					key: "qexcha"
				}]
			]);
			createLucideIcon("candy-off", [
				["path", {
					d: "M10 10v7.9",
					key: "m8g9tt"
				}],
				["path", {
					d: "M11.802 6.145a5 5 0 0 1 6.053 6.053",
					key: "dn87i3"
				}],
				["path", {
					d: "M14 6.1v2.243",
					key: "1kzysn"
				}],
				["path", {
					d: "m15.5 15.571-.964.964a5 5 0 0 1-7.071 0 5 5 0 0 1 0-7.07l.964-.965",
					key: "3sxy18"
				}],
				["path", {
					d: "M16 7V3a1 1 0 0 1 1.707-.707 2.5 2.5 0 0 0 2.152.717 1 1 0 0 1 1.131 1.131 2.5 2.5 0 0 0 .717 2.152A1 1 0 0 1 21 8h-4",
					key: "gpb6xx"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M8 17v4a1 1 0 0 1-1.707.707 2.5 2.5 0 0 0-2.152-.717 1 1 0 0 1-1.131-1.131 2.5 2.5 0 0 0-.717-2.152A1 1 0 0 1 3 16h4",
					key: "qexcha"
				}]
			]);
			createLucideIcon("cannabis-off", [
				["path", {
					d: "M12 22v-4c1.5 1.5 3.5 3 6 3 0-1.5-.5-3.5-2-5",
					key: "1bqfb7"
				}],
				["path", {
					d: "M13.988 8.327C13.902 6.054 13.365 3.82 12 2a9.3 9.3 0 0 0-1.445 2.9",
					key: "1p520n"
				}],
				["path", {
					d: "M17.375 11.725C18.882 10.53 21 7.841 21 6c-2.324 0-5.08 1.296-6.662 2.684",
					key: "q2itvb"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M21.024 15.378A15 15 0 0 0 22 15c-.426-1.279-2.67-2.557-4.25-2.907",
					key: "j9amvs"
				}],
				["path", {
					d: "M6.995 6.992C5.714 6.4 4.29 6 3 6c0 2 2.5 5 4 6-1.5 0-4.5 1.5-5 3 3.5 1.5 6 1 6 1-1.5 1.5-2 3.5-2 5 2.5 0 4.5-1.5 6-3",
					key: "8gmd5g"
				}]
			]);
			createLucideIcon("cannabis", [["path", {
				d: "M12 22v-4",
				key: "1utk9m"
			}], ["path", {
				d: "M7 12c-1.5 0-4.5 1.5-5 3 3.5 1.5 6 1 6 1-1.5 1.5-2 3.5-2 5 2.5 0 4.5-1.5 6-3 1.5 1.5 3.5 3 6 3 0-1.5-.5-3.5-2-5 0 0 2.5.5 6-1-.5-1.5-3.5-3-5-3 1.5-1 4-4 4-6-2.5 0-5.5 1.5-7 3 0-2.5-.5-5-2-7-1.5 2-2 4.5-2 7-1.5-1.5-4.5-3-7-3 0 2 2.5 5 4 6",
				key: "1mezod"
			}]]);
			createLucideIcon("captions", [["rect", {
				width: "18",
				height: "14",
				x: "3",
				y: "5",
				rx: "2",
				ry: "2",
				key: "12ruh7"
			}], ["path", {
				d: "M7 15h4M15 15h2M7 11h2M13 11h4",
				key: "1ueiar"
			}]]);
			createLucideIcon("captions-off", [
				["path", {
					d: "M10.5 5H19a2 2 0 0 1 2 2v8.5",
					key: "jqtk4d"
				}],
				["path", {
					d: "M17 11h-.5",
					key: "1961ue"
				}],
				["path", {
					d: "M19 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2",
					key: "1keqsi"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M7 11h4",
					key: "1o1z6v"
				}],
				["path", {
					d: "M7 15h2.5",
					key: "1ina1g"
				}]
			]);
			createLucideIcon("car-battery", [
				["path", {
					d: "M14 13h4",
					key: "xb9564"
				}],
				["path", {
					d: "M16 15v-4",
					key: "rpmtp7"
				}],
				["path", {
					d: "M18 5v2",
					key: "n2sebz"
				}],
				["path", {
					d: "M6 13h4",
					key: "vm80m7"
				}],
				["path", {
					d: "M6 5v2",
					key: "h3tt00"
				}],
				["rect", {
					x: "2",
					y: "7",
					width: "20",
					height: "12",
					rx: "2",
					key: "uzf593"
				}]
			]);
			createLucideIcon("car-front", [
				["path", {
					d: "m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8",
					key: "1imjwt"
				}],
				["path", {
					d: "M7 14h.01",
					key: "1qa3f1"
				}],
				["path", {
					d: "M17 14h.01",
					key: "7oqj8z"
				}],
				["rect", {
					width: "18",
					height: "8",
					x: "3",
					y: "10",
					rx: "2",
					key: "a7itu8"
				}],
				["path", {
					d: "M5 18v2",
					key: "ppbyun"
				}],
				["path", {
					d: "M19 18v2",
					key: "gy7782"
				}]
			]);
			createLucideIcon("car-taxi-front", [
				["path", {
					d: "M10 2h4",
					key: "n1abiw"
				}],
				["path", {
					d: "m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8",
					key: "1imjwt"
				}],
				["path", {
					d: "M7 14h.01",
					key: "1qa3f1"
				}],
				["path", {
					d: "M17 14h.01",
					key: "7oqj8z"
				}],
				["rect", {
					width: "18",
					height: "8",
					x: "3",
					y: "10",
					rx: "2",
					key: "a7itu8"
				}],
				["path", {
					d: "M5 18v2",
					key: "ppbyun"
				}],
				["path", {
					d: "M19 18v2",
					key: "gy7782"
				}]
			]);
			createLucideIcon("car", [
				["path", {
					d: "M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2",
					key: "5owen"
				}],
				["circle", {
					cx: "7",
					cy: "17",
					r: "2",
					key: "u2ysq9"
				}],
				["path", {
					d: "M9 17h6",
					key: "r8uit2"
				}],
				["circle", {
					cx: "17",
					cy: "17",
					r: "2",
					key: "axvx0g"
				}]
			]);
			createLucideIcon("caravan", [
				["path", {
					d: "M18 19V9a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v8a2 2 0 0 0 2 2h2",
					key: "19jm3t"
				}],
				["path", {
					d: "M2 9h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H2",
					key: "13hakp"
				}],
				["path", {
					d: "M22 17v1a1 1 0 0 1-1 1H10v-9a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v9",
					key: "1crci8"
				}],
				["circle", {
					cx: "8",
					cy: "19",
					r: "2",
					key: "t8fc5s"
				}]
			]);
			createLucideIcon("card-sim", [
				["path", {
					d: "M12 14v4",
					key: "1thi36"
				}],
				["path", {
					d: "M14.172 2a2 2 0 0 1 1.414.586l3.828 3.828A2 2 0 0 1 20 7.828V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z",
					key: "1o66bk"
				}],
				["path", {
					d: "M8 14h8",
					key: "1fgep2"
				}],
				["rect", {
					x: "8",
					y: "10",
					width: "8",
					height: "8",
					rx: "1",
					key: "1aonk6"
				}]
			]);
			createLucideIcon("carrot", [
				["path", {
					d: "M15 16a1 1 0 0 0-7-7q-4 4-5.987 12.385a.5.5 0 0 0 .602.602Q11 20 15 16l-3-3",
					key: "1ta62j"
				}],
				["path", {
					d: "M15 9q4 4 7 0-3-4-7 0 4-4 0-7-4 3 0 7",
					key: "1svf7i"
				}],
				["path", {
					d: "m8 15-2.58-2.58",
					key: "7t238r"
				}]
			]);
			createLucideIcon("case-lower", [
				["path", {
					d: "M10 9v7",
					key: "ylp826"
				}],
				["path", {
					d: "M14 6v10",
					key: "1jy4vg"
				}],
				["circle", {
					cx: "17.5",
					cy: "12.5",
					r: "3.5",
					key: "1a9481"
				}],
				["circle", {
					cx: "6.5",
					cy: "12.5",
					r: "3.5",
					key: "2jlv1r"
				}]
			]);
			createLucideIcon("case-sensitive", [
				["path", {
					d: "m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16",
					key: "d5nyq2"
				}],
				["path", {
					d: "M22 9v7",
					key: "pvm9v3"
				}],
				["path", {
					d: "M3.304 13h6.392",
					key: "1q3zxz"
				}],
				["circle", {
					cx: "18.5",
					cy: "12.5",
					r: "3.5",
					key: "z97x68"
				}]
			]);
			createLucideIcon("case-upper", [
				["path", {
					d: "M15 11h4.5a1 1 0 0 1 0 5h-4a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h3a1 1 0 0 1 0 5",
					key: "nxs35"
				}],
				["path", {
					d: "m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16",
					key: "d5nyq2"
				}],
				["path", {
					d: "M3.304 13h6.392",
					key: "1q3zxz"
				}]
			]);
			createLucideIcon("cast", [
				["path", {
					d: "M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6",
					key: "3zrzxg"
				}],
				["path", {
					d: "M2 12a9 9 0 0 1 8 8",
					key: "g6cvee"
				}],
				["path", {
					d: "M2 16a5 5 0 0 1 4 4",
					key: "1y1dii"
				}],
				["line", {
					x1: "2",
					x2: "2.01",
					y1: "20",
					y2: "20",
					key: "xu2jvo"
				}]
			]);
			createLucideIcon("cassette-tape", [
				["rect", {
					width: "20",
					height: "16",
					x: "2",
					y: "4",
					rx: "2",
					key: "18n3k1"
				}],
				["circle", {
					cx: "8",
					cy: "10",
					r: "2",
					key: "1xl4ub"
				}],
				["path", {
					d: "M8 12h8",
					key: "1wcyev"
				}],
				["circle", {
					cx: "16",
					cy: "10",
					r: "2",
					key: "r14t7q"
				}],
				["path", {
					d: "m6 20 .7-2.9A1.4 1.4 0 0 1 8.1 16h7.8a1.4 1.4 0 0 1 1.4 1l.7 3",
					key: "l01ucn"
				}]
			]);
			createLucideIcon("castle", [
				["path", {
					d: "M10 5V3",
					key: "1y54qe"
				}],
				["path", {
					d: "M14 5V3",
					key: "m6isi"
				}],
				["path", {
					d: "M15 21v-3a3 3 0 0 0-6 0v3",
					key: "lbp5hj"
				}],
				["path", {
					d: "M18 3v8",
					key: "2ollhf"
				}],
				["path", {
					d: "M18 5H6",
					key: "98imr9"
				}],
				["path", {
					d: "M22 11H2",
					key: "1lmjae"
				}],
				["path", {
					d: "M22 9v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9",
					key: "1rly83"
				}],
				["path", {
					d: "M6 3v8",
					key: "csox7g"
				}]
			]);
			createLucideIcon("cat", [
				["path", {
					d: "M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z",
					key: "x6xyqk"
				}],
				["path", {
					d: "M8 14v.5",
					key: "1nzgdb"
				}],
				["path", {
					d: "M16 14v.5",
					key: "1lajdz"
				}],
				["path", {
					d: "M11.25 16.25h1.5L12 17l-.75-.75Z",
					key: "12kq1m"
				}]
			]);
			createLucideIcon("cctv-off", [
				["path", {
					d: "m12.309 6.652 4.797 2.401a1 1 0 0 1 .447 1.341l-.501 1.001.605.605h2.725a1 1 0 0 1 .894 1.447l-.724 1.448",
					key: "e75roo"
				}],
				["path", {
					d: "m15.166 15.166-.719 1.439a1 1 0 0 1-1.342.447L3.61 12.3a2.92 2.92 0 0 1-1.3-3.91L3.69 5.6a2.9 2.9 0 0 1 .873-1.037",
					key: "1h9o5r"
				}],
				["path", {
					d: "M2 19h3.76a2 2 0 0 0 1.8-1.1l1.441-2.902",
					key: "1askrb"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M2 21v-4",
					key: "l40lih"
				}],
				["path", {
					d: "M7 9h.01",
					key: "19b3jx"
				}]
			]);
			createLucideIcon("cctv", [
				["path", {
					d: "M16.75 12h3.632a1 1 0 0 1 .894 1.447l-2.034 4.069a1 1 0 0 1-1.708.134l-2.124-2.97",
					key: "ir91b5"
				}],
				["path", {
					d: "M17.106 9.053a1 1 0 0 1 .447 1.341l-3.106 6.211a1 1 0 0 1-1.342.447L3.61 12.3a2.92 2.92 0 0 1-1.3-3.91L3.69 5.6a2.92 2.92 0 0 1 3.92-1.3z",
					key: "jlp8i1"
				}],
				["path", {
					d: "M2 19h3.76a2 2 0 0 0 1.8-1.1L9 15",
					key: "19bib8"
				}],
				["path", {
					d: "M2 21v-4",
					key: "l40lih"
				}],
				["path", {
					d: "M7 9h.01",
					key: "19b3jx"
				}]
			]);
			createLucideIcon("chart-area", [["path", {
				d: "M3 3v16a2 2 0 0 0 2 2h16",
				key: "c24i48"
			}], ["path", {
				d: "M7 11.207a.5.5 0 0 1 .146-.353l2-2a.5.5 0 0 1 .708 0l3.292 3.292a.5.5 0 0 0 .708 0l4.292-4.292a.5.5 0 0 1 .854.353V16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z",
				key: "q0gr47"
			}]]);
			createLucideIcon("chart-bar-big", [
				["path", {
					d: "M3 3v16a2 2 0 0 0 2 2h16",
					key: "c24i48"
				}],
				["rect", {
					x: "7",
					y: "13",
					width: "9",
					height: "4",
					rx: "1",
					key: "1iip1u"
				}],
				["rect", {
					x: "7",
					y: "5",
					width: "12",
					height: "4",
					rx: "1",
					key: "1anskk"
				}]
			]);
			createLucideIcon("chart-bar-decreasing", [
				["path", {
					d: "M3 3v16a2 2 0 0 0 2 2h16",
					key: "c24i48"
				}],
				["path", {
					d: "M7 11h8",
					key: "1feolt"
				}],
				["path", {
					d: "M7 16h3",
					key: "ur6vzw"
				}],
				["path", {
					d: "M7 6h12",
					key: "sz5b0d"
				}]
			]);
			createLucideIcon("chart-bar-increasing", [
				["path", {
					d: "M3 3v16a2 2 0 0 0 2 2h16",
					key: "c24i48"
				}],
				["path", {
					d: "M7 11h8",
					key: "1feolt"
				}],
				["path", {
					d: "M7 16h12",
					key: "wsnu98"
				}],
				["path", {
					d: "M7 6h3",
					key: "w9rmul"
				}]
			]);
			createLucideIcon("chart-bar-stacked", [
				["path", {
					d: "M11 13v4",
					key: "vyy2rb"
				}],
				["path", {
					d: "M15 5v4",
					key: "1gx88a"
				}],
				["path", {
					d: "M3 3v16a2 2 0 0 0 2 2h16",
					key: "c24i48"
				}],
				["rect", {
					x: "7",
					y: "13",
					width: "9",
					height: "4",
					rx: "1",
					key: "1iip1u"
				}],
				["rect", {
					x: "7",
					y: "5",
					width: "12",
					height: "4",
					rx: "1",
					key: "1anskk"
				}]
			]);
			createLucideIcon("chart-bar", [
				["path", {
					d: "M3 3v16a2 2 0 0 0 2 2h16",
					key: "c24i48"
				}],
				["path", {
					d: "M7 16h8",
					key: "srdodz"
				}],
				["path", {
					d: "M7 11h12",
					key: "127s9w"
				}],
				["path", {
					d: "M7 6h3",
					key: "w9rmul"
				}]
			]);
			createLucideIcon("chart-candlestick", [
				["path", {
					d: "M9 5v4",
					key: "14uxtq"
				}],
				["rect", {
					width: "4",
					height: "6",
					x: "7",
					y: "9",
					rx: "1",
					key: "f4fvz0"
				}],
				["path", {
					d: "M9 15v2",
					key: "r5rk32"
				}],
				["path", {
					d: "M17 3v2",
					key: "1l2re6"
				}],
				["rect", {
					width: "4",
					height: "8",
					x: "15",
					y: "5",
					rx: "1",
					key: "z38je5"
				}],
				["path", {
					d: "M17 13v3",
					key: "5l0wba"
				}],
				["path", {
					d: "M3 3v16a2 2 0 0 0 2 2h16",
					key: "c24i48"
				}]
			]);
			createLucideIcon("chart-column-big", [
				["path", {
					d: "M3 3v16a2 2 0 0 0 2 2h16",
					key: "c24i48"
				}],
				["rect", {
					x: "15",
					y: "5",
					width: "4",
					height: "12",
					rx: "1",
					key: "q8uenq"
				}],
				["rect", {
					x: "7",
					y: "8",
					width: "4",
					height: "9",
					rx: "1",
					key: "sr5ea"
				}]
			]);
			createLucideIcon("chart-column-decreasing", [
				["path", {
					d: "M13 17V9",
					key: "1fwyjl"
				}],
				["path", {
					d: "M18 17v-3",
					key: "1sqioe"
				}],
				["path", {
					d: "M3 3v16a2 2 0 0 0 2 2h16",
					key: "c24i48"
				}],
				["path", {
					d: "M8 17V5",
					key: "1wzmnc"
				}]
			]);
			createLucideIcon("chart-column-increasing", [
				["path", {
					d: "M13 17V9",
					key: "1fwyjl"
				}],
				["path", {
					d: "M18 17V5",
					key: "sfb6ij"
				}],
				["path", {
					d: "M3 3v16a2 2 0 0 0 2 2h16",
					key: "c24i48"
				}],
				["path", {
					d: "M8 17v-3",
					key: "17ska0"
				}]
			]);
			createLucideIcon("chart-column-stacked", [
				["path", {
					d: "M11 13H7",
					key: "t0o9gq"
				}],
				["path", {
					d: "M19 9h-4",
					key: "rera1j"
				}],
				["path", {
					d: "M3 3v16a2 2 0 0 0 2 2h16",
					key: "c24i48"
				}],
				["rect", {
					x: "15",
					y: "5",
					width: "4",
					height: "12",
					rx: "1",
					key: "q8uenq"
				}],
				["rect", {
					x: "7",
					y: "8",
					width: "4",
					height: "9",
					rx: "1",
					key: "sr5ea"
				}]
			]);
			createLucideIcon("chart-column", [
				["path", {
					d: "M3 3v16a2 2 0 0 0 2 2h16",
					key: "c24i48"
				}],
				["path", {
					d: "M18 17V9",
					key: "2bz60n"
				}],
				["path", {
					d: "M13 17V5",
					key: "1frdt8"
				}],
				["path", {
					d: "M8 17v-3",
					key: "17ska0"
				}]
			]);
			createLucideIcon("chart-gantt", [
				["path", {
					d: "M10 6h8",
					key: "zvc2xc"
				}],
				["path", {
					d: "M12 16h6",
					key: "yi5mkt"
				}],
				["path", {
					d: "M3 3v16a2 2 0 0 0 2 2h16",
					key: "c24i48"
				}],
				["path", {
					d: "M8 11h7",
					key: "wz2hg0"
				}]
			]);
			createLucideIcon("chart-line", [["path", {
				d: "M3 3v16a2 2 0 0 0 2 2h16",
				key: "c24i48"
			}], ["path", {
				d: "m19 9-5 5-4-4-3 3",
				key: "2osh9i"
			}]]);
			createLucideIcon("chart-network", [
				["path", {
					d: "m13.11 7.664 1.78 2.672",
					key: "go2gg9"
				}],
				["path", {
					d: "m14.162 12.788-3.324 1.424",
					key: "11x848"
				}],
				["path", {
					d: "m20 4-6.06 1.515",
					key: "1wxxh7"
				}],
				["path", {
					d: "M3 3v16a2 2 0 0 0 2 2h16",
					key: "c24i48"
				}],
				["circle", {
					cx: "12",
					cy: "6",
					r: "2",
					key: "1jj5th"
				}],
				["circle", {
					cx: "16",
					cy: "12",
					r: "2",
					key: "4ma0v8"
				}],
				["circle", {
					cx: "9",
					cy: "15",
					r: "2",
					key: "lf2ghp"
				}]
			]);
			createLucideIcon("chart-no-axes-column-decreasing", [
				["path", {
					d: "M5 21V3",
					key: "clc1r8"
				}],
				["path", {
					d: "M12 21V9",
					key: "uvy0l4"
				}],
				["path", {
					d: "M19 21v-6",
					key: "tkawy9"
				}]
			]);
			createLucideIcon("chart-no-axes-column-increasing", [
				["path", {
					d: "M5 21v-6",
					key: "1hz6c0"
				}],
				["path", {
					d: "M12 21V9",
					key: "uvy0l4"
				}],
				["path", {
					d: "M19 21V3",
					key: "11j9sm"
				}]
			]);
			createLucideIcon("chart-no-axes-column", [
				["path", {
					d: "M5 21v-6",
					key: "1hz6c0"
				}],
				["path", {
					d: "M12 21V3",
					key: "1lcnhd"
				}],
				["path", {
					d: "M19 21V9",
					key: "unv183"
				}]
			]);
			createLucideIcon("chart-no-axes-combined", [
				["path", {
					d: "M12 16v5",
					key: "zza2cw"
				}],
				["path", {
					d: "M16 14.639V21",
					key: "1s85h0"
				}],
				["path", {
					d: "M20 10.656V21",
					key: "q45596"
				}],
				["path", {
					d: "m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15",
					key: "1fw8x9"
				}],
				["path", {
					d: "M4 18.463V21",
					key: "1otddq"
				}],
				["path", {
					d: "M8 14.656V21",
					key: "1t2idw"
				}]
			]);
			createLucideIcon("chart-no-axes-gantt", [
				["path", {
					d: "M6 5h12",
					key: "fvfigv"
				}],
				["path", {
					d: "M4 12h10",
					key: "oujl3d"
				}],
				["path", {
					d: "M12 19h8",
					key: "baeox8"
				}]
			]);
			createLucideIcon("chart-pie", [["path", {
				d: "M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z",
				key: "pzmjnu"
			}], ["path", {
				d: "M21.21 15.89A10 10 0 1 1 8 2.83",
				key: "k2fpak"
			}]]);
			createLucideIcon("chart-scatter", [
				["circle", {
					cx: "7.5",
					cy: "7.5",
					r: ".5",
					fill: "currentColor",
					key: "kqv944"
				}],
				["circle", {
					cx: "18.5",
					cy: "5.5",
					r: ".5",
					fill: "currentColor",
					key: "lysivs"
				}],
				["circle", {
					cx: "11.5",
					cy: "11.5",
					r: ".5",
					fill: "currentColor",
					key: "byv1b8"
				}],
				["circle", {
					cx: "7.5",
					cy: "16.5",
					r: ".5",
					fill: "currentColor",
					key: "nkw3mc"
				}],
				["circle", {
					cx: "17.5",
					cy: "14.5",
					r: ".5",
					fill: "currentColor",
					key: "1gjh6j"
				}],
				["path", {
					d: "M3 3v16a2 2 0 0 0 2 2h16",
					key: "c24i48"
				}]
			]);
			createLucideIcon("chart-spline", [["path", {
				d: "M3 3v16a2 2 0 0 0 2 2h16",
				key: "c24i48"
			}], ["path", {
				d: "M7 16c.5-2 1.5-7 4-7 2 0 2 3 4 3 2.5 0 4.5-5 5-7",
				key: "lw07rv"
			}]]);
			createLucideIcon("check-line", [
				["path", {
					d: "M20 4L9 15",
					key: "1qkx8z"
				}],
				["path", {
					d: "M21 19L3 19",
					key: "100sma"
				}],
				["path", {
					d: "M9 15L4 10",
					key: "9zxff7"
				}]
			]);
			createLucideIcon("check-check", [["path", {
				d: "M18 6 7 17l-5-5",
				key: "116fxf"
			}], ["path", {
				d: "m22 10-7.5 7.5L13 16",
				key: "ke71qq"
			}]]);
			createLucideIcon("check", [["path", {
				d: "M20 6 9 17l-5-5",
				key: "1gmf2c"
			}]]);
			createLucideIcon("chef-hat", [["path", {
				d: "M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z",
				key: "1qvrer"
			}], ["path", {
				d: "M6 17h12",
				key: "1jwigz"
			}]]);
			createLucideIcon("cherry", [
				["path", {
					d: "M2 17a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3-2.5-2-5 .24-5 3Z",
					key: "cvxqlc"
				}],
				["path", {
					d: "M12 17a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3-2.5-2-5 .24-5 3Z",
					key: "1ostrc"
				}],
				["path", {
					d: "M7 14c3.22-2.91 4.29-8.75 5-12 1.66 2.38 4.94 9 5 12",
					key: "hqx58h"
				}],
				["path", {
					d: "M22 9c-4.29 0-7.14-2.33-10-7 5.71 0 10 4.67 10 7Z",
					key: "eykp1o"
				}]
			]);
			createLucideIcon("chess-bishop", [
				["path", {
					d: "M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z",
					key: "b89hwq"
				}],
				["path", {
					d: "M15 18c1.5-.615 3-2.461 3-4.923C18 8.769 14.5 4.462 12 2 9.5 4.462 6 8.77 6 13.077 6 15.539 7.5 17.385 9 18",
					key: "8jdkhx"
				}],
				["path", {
					d: "m16 7-2.5 2.5",
					key: "1jq90w"
				}],
				["path", {
					d: "M9 2h6",
					key: "1jrp98"
				}]
			]);
			createLucideIcon("chess-king", [
				["path", {
					d: "M4 20a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z",
					key: "mqzwx6"
				}],
				["path", {
					d: "m6.7 18-1-1C4.35 15.682 3 14.09 3 12a5 5 0 0 1 4.95-5c1.584 0 2.7.455 4.05 1.818C13.35 7.455 14.466 7 16.05 7A5 5 0 0 1 21 12c0 2.082-1.359 3.673-2.7 5l-1 1",
					key: "1gdt1g"
				}],
				["path", {
					d: "M10 4h4",
					key: "1xpv9s"
				}],
				["path", {
					d: "M12 2v6.818",
					key: "b17a49"
				}]
			]);
			createLucideIcon("chess-knight", [
				["path", {
					d: "M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z",
					key: "b89hwq"
				}],
				["path", {
					d: "M16.5 18c1-2 2.5-5 2.5-9a7 7 0 0 0-7-7H6.635a1 1 0 0 0-.768 1.64L7 5l-2.32 5.802a2 2 0 0 0 .95 2.526l2.87 1.456",
					key: "axbnlq"
				}],
				["path", {
					d: "m15 5 1.425-1.425",
					key: "15xz8w"
				}],
				["path", {
					d: "m17 8 1.53-1.53",
					key: "15zhqh"
				}],
				["path", {
					d: "M9.713 12.185 7 18",
					key: "1ocm0l"
				}]
			]);
			createLucideIcon("chess-pawn", [
				["path", {
					d: "M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z",
					key: "b89hwq"
				}],
				["path", {
					d: "m14.5 10 1.5 8",
					key: "cim3qy"
				}],
				["path", {
					d: "M7 10h10",
					key: "1101jm"
				}],
				["path", {
					d: "m8 18 1.5-8",
					key: "ja3yjd"
				}],
				["circle", {
					cx: "12",
					cy: "6",
					r: "4",
					key: "1frrej"
				}]
			]);
			createLucideIcon("chess-rook", [
				["path", {
					d: "M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z",
					key: "b89hwq"
				}],
				["path", {
					d: "M10 2v2",
					key: "7u0qdc"
				}],
				["path", {
					d: "M14 2v2",
					key: "6buw04"
				}],
				["path", {
					d: "m17 18-1-9",
					key: "10nd7q"
				}],
				["path", {
					d: "M6 2v5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2",
					key: "uxf4yx"
				}],
				["path", {
					d: "M6 4h12",
					key: "1x2ag7"
				}],
				["path", {
					d: "m7 18 1-9",
					key: "1si9vq"
				}]
			]);
			const ChevronDown = createLucideIcon("chevron-down", [["path", {
				d: "m6 9 6 6 6-6",
				key: "qrunsl"
			}]]);
			createLucideIcon("chess-queen", [
				["path", {
					d: "M4 20a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z",
					key: "mqzwx6"
				}],
				["path", {
					d: "m12.474 5.943 1.567 5.34a1 1 0 0 0 1.75.328l2.616-3.402",
					key: "1js4gl"
				}],
				["path", {
					d: "m20 9-3 9",
					key: "r75r3f"
				}],
				["path", {
					d: "m5.594 8.209 2.615 3.403a1 1 0 0 0 1.75-.329l1.567-5.34",
					key: "1joj19"
				}],
				["path", {
					d: "M7 18 4 9",
					key: "1mfzj8"
				}],
				["circle", {
					cx: "12",
					cy: "4",
					r: "2",
					key: "muu5ef"
				}],
				["circle", {
					cx: "20",
					cy: "7",
					r: "2",
					key: "9w7p1x"
				}],
				["circle", {
					cx: "4",
					cy: "7",
					r: "2",
					key: "1d9wy8"
				}]
			]);
			createLucideIcon("chevron-first", [["path", {
				d: "m17 18-6-6 6-6",
				key: "1yerx2"
			}], ["path", {
				d: "M7 6v12",
				key: "1p53r6"
			}]]);
			createLucideIcon("chevron-last", [["path", {
				d: "m7 18 6-6-6-6",
				key: "lwmzdw"
			}], ["path", {
				d: "M17 6v12",
				key: "1o0aio"
			}]]);
			createLucideIcon("chevron-left", [["path", {
				d: "m15 18-6-6 6-6",
				key: "1wnfg3"
			}]]);
			const ChevronRight = createLucideIcon("chevron-right", [["path", {
				d: "m9 18 6-6-6-6",
				key: "mthhwq"
			}]]);
			createLucideIcon("chevron-up", [["path", {
				d: "m18 15-6-6-6 6",
				key: "153udz"
			}]]);
			createLucideIcon("chevrons-down-up", [["path", {
				d: "m7 20 5-5 5 5",
				key: "13a0gw"
			}], ["path", {
				d: "m7 4 5 5 5-5",
				key: "1kwcof"
			}]]);
			createLucideIcon("chevrons-down", [["path", {
				d: "m7 6 5 5 5-5",
				key: "1lc07p"
			}], ["path", {
				d: "m7 13 5 5 5-5",
				key: "1d48rs"
			}]]);
			createLucideIcon("chevrons-left-right-ellipsis", [
				["path", {
					d: "M12 12h.01",
					key: "1mp3jc"
				}],
				["path", {
					d: "M16 12h.01",
					key: "1l6xoz"
				}],
				["path", {
					d: "m17 7 5 5-5 5",
					key: "1xlxn0"
				}],
				["path", {
					d: "m7 7-5 5 5 5",
					key: "19njba"
				}],
				["path", {
					d: "M8 12h.01",
					key: "czm47f"
				}]
			]);
			createLucideIcon("chevrons-left-right", [["path", {
				d: "m9 7-5 5 5 5",
				key: "j5w590"
			}], ["path", {
				d: "m15 7 5 5-5 5",
				key: "1bl6da"
			}]]);
			createLucideIcon("chevrons-left", [["path", {
				d: "m11 17-5-5 5-5",
				key: "13zhaf"
			}], ["path", {
				d: "m18 17-5-5 5-5",
				key: "h8a8et"
			}]]);
			createLucideIcon("chevrons-right", [["path", {
				d: "m6 17 5-5-5-5",
				key: "xnjwq"
			}], ["path", {
				d: "m13 17 5-5-5-5",
				key: "17xmmf"
			}]]);
			createLucideIcon("chevrons-right-left", [["path", {
				d: "m20 17-5-5 5-5",
				key: "30x0n2"
			}], ["path", {
				d: "m4 17 5-5-5-5",
				key: "16spf4"
			}]]);
			createLucideIcon("chevrons-up-down", [["path", {
				d: "m7 15 5 5 5-5",
				key: "1hf1tw"
			}], ["path", {
				d: "m7 9 5-5 5 5",
				key: "sgt6xg"
			}]]);
			createLucideIcon("chevrons-up", [["path", {
				d: "m17 11-5-5-5 5",
				key: "e8nh98"
			}], ["path", {
				d: "m17 18-5-5-5 5",
				key: "2avn1x"
			}]]);
			createLucideIcon("church", [
				["path", {
					d: "M10 9h4",
					key: "u4k05v"
				}],
				["path", {
					d: "M12 7v5",
					key: "ma6bk"
				}],
				["path", {
					d: "M14 21v-3a2 2 0 0 0-4 0v3",
					key: "1rgiei"
				}],
				["path", {
					d: "m18 9 3.52 2.147a1 1 0 0 1 .48.854V19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6.999a1 1 0 0 1 .48-.854L6 9",
					key: "flvdwo"
				}],
				["path", {
					d: "M6 21V7a1 1 0 0 1 .376-.782l5-3.999a1 1 0 0 1 1.249.001l5 4A1 1 0 0 1 18 7v14",
					key: "a5i0n2"
				}]
			]);
			createLucideIcon("cigarette-off", [
				["path", {
					d: "M12 12H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h13",
					key: "1gdiyg"
				}],
				["path", {
					d: "M18 8c0-2.5-2-2.5-2-5",
					key: "1il607"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M21 12a1 1 0 0 1 1 1v2a1 1 0 0 1-.5.866",
					key: "166zjj"
				}],
				["path", {
					d: "M22 8c0-2.5-2-2.5-2-5",
					key: "1gah44"
				}],
				["path", {
					d: "M7 12v4",
					key: "jqww69"
				}]
			]);
			createLucideIcon("cigarette", [
				["path", {
					d: "M17 12H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h14",
					key: "1mb5g1"
				}],
				["path", {
					d: "M18 8c0-2.5-2-2.5-2-5",
					key: "1il607"
				}],
				["path", {
					d: "M21 16a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",
					key: "1yl5r7"
				}],
				["path", {
					d: "M22 8c0-2.5-2-2.5-2-5",
					key: "1gah44"
				}],
				["path", {
					d: "M7 12v4",
					key: "jqww69"
				}]
			]);
			createLucideIcon("circle-arrow-down", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["path", {
					d: "M12 8v8",
					key: "napkw2"
				}],
				["path", {
					d: "m8 12 4 4 4-4",
					key: "k98ssh"
				}]
			]);
			createLucideIcon("circle-alert", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["line", {
					x1: "12",
					x2: "12",
					y1: "8",
					y2: "12",
					key: "1pkeuh"
				}],
				["line", {
					x1: "12",
					x2: "12.01",
					y1: "16",
					y2: "16",
					key: "4dfq90"
				}]
			]);
			createLucideIcon("circle-arrow-left", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["path", {
					d: "m12 8-4 4 4 4",
					key: "15vm53"
				}],
				["path", {
					d: "M16 12H8",
					key: "1fr5h0"
				}]
			]);
			createLucideIcon("circle-arrow-out-down-left", [
				["path", {
					d: "M2 12a10 10 0 1 1 10 10",
					key: "1yn6ov"
				}],
				["path", {
					d: "m2 22 10-10",
					key: "28ilpk"
				}],
				["path", {
					d: "M8 22H2v-6",
					key: "sulq54"
				}]
			]);
			createLucideIcon("circle-arrow-out-down-right", [
				["path", {
					d: "M12 22a10 10 0 1 1 10-10",
					key: "130bv5"
				}],
				["path", {
					d: "M22 22 12 12",
					key: "131aw7"
				}],
				["path", {
					d: "M22 16v6h-6",
					key: "1gvm70"
				}]
			]);
			createLucideIcon("circle-arrow-out-up-left", [
				["path", {
					d: "M2 8V2h6",
					key: "hiwtdz"
				}],
				["path", {
					d: "m2 2 10 10",
					key: "1oh8rs"
				}],
				["path", {
					d: "M12 2A10 10 0 1 1 2 12",
					key: "rrk4fa"
				}]
			]);
			createLucideIcon("circle-arrow-out-up-right", [
				["path", {
					d: "M22 12A10 10 0 1 1 12 2",
					key: "1fm58d"
				}],
				["path", {
					d: "M22 2 12 12",
					key: "yg2myt"
				}],
				["path", {
					d: "M16 2h6v6",
					key: "zan5cs"
				}]
			]);
			createLucideIcon("circle-arrow-right", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["path", {
					d: "m12 16 4-4-4-4",
					key: "1i9zcv"
				}],
				["path", {
					d: "M8 12h8",
					key: "1wcyev"
				}]
			]);
			createLucideIcon("circle-arrow-up", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["path", {
					d: "m16 12-4-4-4 4",
					key: "177agl"
				}],
				["path", {
					d: "M12 16V8",
					key: "1sbj14"
				}]
			]);
			createLucideIcon("circle-check-big", [["path", {
				d: "M21.801 10A10 10 0 1 1 17 3.335",
				key: "yps3ct"
			}], ["path", {
				d: "m9 11 3 3L22 4",
				key: "1pflzl"
			}]]);
			createLucideIcon("circle-check", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "m16 9-5.5 5.5L8 12",
				key: "xofnsj"
			}]]);
			createLucideIcon("circle-chevron-down", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "m16 10-4 4-4-4",
				key: "894hmk"
			}]]);
			createLucideIcon("circle-chevron-left", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "m14 16-4-4 4-4",
				key: "ojs7w8"
			}]]);
			createLucideIcon("circle-chevron-right", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "m10 8 4 4-4 4",
				key: "1wy4r4"
			}]]);
			createLucideIcon("circle-chevron-up", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "m8 14 4-4 4 4",
				key: "fy2ptz"
			}]]);
			createLucideIcon("circle-divide", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["line", {
					x1: "8",
					x2: "16",
					y1: "12",
					y2: "12",
					key: "1jonct"
				}],
				["line", {
					x1: "12",
					x2: "12",
					y1: "16",
					y2: "16",
					key: "aqc6ln"
				}],
				["line", {
					x1: "12",
					x2: "12",
					y1: "8",
					y2: "8",
					key: "1mkcni"
				}]
			]);
			createLucideIcon("circle-dollar-sign", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["path", {
					d: "M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8",
					key: "1h4pet"
				}],
				["path", {
					d: "M12 18V6",
					key: "zqpxq5"
				}]
			]);
			createLucideIcon("circle-dashed", [
				["path", {
					d: "M10.1 2.182a10 10 0 0 1 3.8 0",
					key: "5ilxe3"
				}],
				["path", {
					d: "M13.9 21.818a10 10 0 0 1-3.8 0",
					key: "11zvb9"
				}],
				["path", {
					d: "M17.609 3.721a10 10 0 0 1 2.69 2.7",
					key: "1iw5b2"
				}],
				["path", {
					d: "M2.182 13.9a10 10 0 0 1 0-3.8",
					key: "c0bmvh"
				}],
				["path", {
					d: "M20.279 17.609a10 10 0 0 1-2.7 2.69",
					key: "1ruxm7"
				}],
				["path", {
					d: "M21.818 10.1a10 10 0 0 1 0 3.8",
					key: "qkgqxc"
				}],
				["path", {
					d: "M3.721 6.391a10 10 0 0 1 2.7-2.69",
					key: "1mcia2"
				}],
				["path", {
					d: "M6.391 20.279a10 10 0 0 1-2.69-2.7",
					key: "1fvljs"
				}]
			]);
			createLucideIcon("circle-dot-dashed", [
				["path", {
					d: "M10.1 2.18a9.93 9.93 0 0 1 3.8 0",
					key: "1qdqn0"
				}],
				["path", {
					d: "M17.6 3.71a9.95 9.95 0 0 1 2.69 2.7",
					key: "1bq7p6"
				}],
				["path", {
					d: "M21.82 10.1a9.93 9.93 0 0 1 0 3.8",
					key: "1rlaqf"
				}],
				["path", {
					d: "M20.29 17.6a9.95 9.95 0 0 1-2.7 2.69",
					key: "1xk03u"
				}],
				["path", {
					d: "M13.9 21.82a9.94 9.94 0 0 1-3.8 0",
					key: "l7re25"
				}],
				["path", {
					d: "M6.4 20.29a9.95 9.95 0 0 1-2.69-2.7",
					key: "1v18p6"
				}],
				["path", {
					d: "M2.18 13.9a9.93 9.93 0 0 1 0-3.8",
					key: "xdo6bj"
				}],
				["path", {
					d: "M3.71 6.4a9.95 9.95 0 0 1 2.7-2.69",
					key: "1jjmaz"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "1",
					key: "41hilf"
				}]
			]);
			createLucideIcon("circle-dot", [["circle", {
				cx: "12",
				cy: "12",
				r: "1",
				key: "41hilf"
			}], ["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}]]);
			createLucideIcon("circle-ellipsis", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["path", {
					d: "M17 12h.01",
					key: "1m0b6t"
				}],
				["path", {
					d: "M12 12h.01",
					key: "1mp3jc"
				}],
				["path", {
					d: "M7 12h.01",
					key: "eqddd0"
				}]
			]);
			createLucideIcon("circle-equal", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["path", {
					d: "M7 10h10",
					key: "1101jm"
				}],
				["path", {
					d: "M7 14h10",
					key: "1mhdw3"
				}]
			]);
			createLucideIcon("circle-euro", [
				["path", {
					d: "M15 9.4a4 4 0 1 0 0 5.2",
					key: "1makmb"
				}],
				["path", {
					d: "M7 12h5",
					key: "gblrwe"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}]
			]);
			createLucideIcon("circle-fading-plus", [
				["path", {
					d: "M12 2a10 10 0 0 1 7.38 16.75",
					key: "175t95"
				}],
				["path", {
					d: "M12 8v8",
					key: "napkw2"
				}],
				["path", {
					d: "M16 12H8",
					key: "1fr5h0"
				}],
				["path", {
					d: "M2.5 8.875a10 10 0 0 0-.5 3",
					key: "1vce0s"
				}],
				["path", {
					d: "M2.83 16a10 10 0 0 0 2.43 3.4",
					key: "o3fkw4"
				}],
				["path", {
					d: "M4.636 5.235a10 10 0 0 1 .891-.857",
					key: "1szpfk"
				}],
				["path", {
					d: "M8.644 21.42a10 10 0 0 0 7.631-.38",
					key: "9yhvd4"
				}]
			]);
			createLucideIcon("circle-gauge", [
				["path", {
					d: "M15.6 2.7a10 10 0 1 0 5.7 5.7",
					key: "1e0p6d"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "2",
					key: "1c9p78"
				}],
				["path", {
					d: "M13.4 10.6 19 5",
					key: "1kr7tw"
				}]
			]);
			createLucideIcon("circle-fading-arrow-up", [
				["path", {
					d: "M12 2a10 10 0 0 1 7.38 16.75",
					key: "175t95"
				}],
				["path", {
					d: "m16 12-4-4-4 4",
					key: "177agl"
				}],
				["path", {
					d: "M12 16V8",
					key: "1sbj14"
				}],
				["path", {
					d: "M2.5 8.875a10 10 0 0 0-.5 3",
					key: "1vce0s"
				}],
				["path", {
					d: "M2.83 16a10 10 0 0 0 2.43 3.4",
					key: "o3fkw4"
				}],
				["path", {
					d: "M4.636 5.235a10 10 0 0 1 .891-.857",
					key: "1szpfk"
				}],
				["path", {
					d: "M8.644 21.42a10 10 0 0 0 7.631-.38",
					key: "9yhvd4"
				}]
			]);
			createLucideIcon("circle-minus", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "M8 12h8",
				key: "1wcyev"
			}]]);
			createLucideIcon("circle-off", [
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M8.35 2.69A10 10 0 0 1 21.3 15.65",
					key: "1pfsoa"
				}],
				["path", {
					d: "M19.08 19.08A10 10 0 1 1 4.92 4.92",
					key: "1ablyi"
				}]
			]);
			createLucideIcon("circle-parking-off", [
				["path", {
					d: "M12.656 7H13a3 3 0 0 1 2.984 3.307",
					key: "1sjx87"
				}],
				["path", {
					d: "M13 13H9",
					key: "e2beee"
				}],
				["path", {
					d: "M19.071 19.071A1 1 0 0 1 4.93 4.93",
					key: "1kb595"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M8.357 2.687a10 10 0 0 1 12.956 12.956",
					key: "5bsfdx"
				}],
				["path", {
					d: "M9 17V9",
					key: "ojradj"
				}]
			]);
			createLucideIcon("circle-parking", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "M9 17V7h4a3 3 0 0 1 0 6H9",
				key: "1dfk2c"
			}]]);
			createLucideIcon("circle-percent", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["path", {
					d: "m15 9-6 6",
					key: "1uzhvr"
				}],
				["path", {
					d: "M9 9h.01",
					key: "1q5me6"
				}],
				["path", {
					d: "M15 15h.01",
					key: "lqbp3k"
				}]
			]);
			createLucideIcon("circle-pile", [
				["circle", {
					cx: "12",
					cy: "19",
					r: "2",
					key: "13j0tp"
				}],
				["circle", {
					cx: "12",
					cy: "5",
					r: "2",
					key: "f1ur92"
				}],
				["circle", {
					cx: "16",
					cy: "12",
					r: "2",
					key: "4ma0v8"
				}],
				["circle", {
					cx: "20",
					cy: "19",
					r: "2",
					key: "1obnsp"
				}],
				["circle", {
					cx: "4",
					cy: "19",
					r: "2",
					key: "p3m9r0"
				}],
				["circle", {
					cx: "8",
					cy: "12",
					r: "2",
					key: "1nvbw3"
				}]
			]);
			createLucideIcon("circle-pause", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["line", {
					x1: "10",
					x2: "10",
					y1: "15",
					y2: "9",
					key: "c1nkhi"
				}],
				["line", {
					x1: "14",
					x2: "14",
					y1: "15",
					y2: "9",
					key: "h65svq"
				}]
			]);
			createLucideIcon("circle-play", [["path", {
				d: "M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z",
				key: "kmsa83"
			}], ["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}]]);
			createLucideIcon("circle-plus", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["path", {
					d: "M8 12h8",
					key: "1wcyev"
				}],
				["path", {
					d: "M12 8v8",
					key: "napkw2"
				}]
			]);
			createLucideIcon("circle-pound-sterling", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["path", {
					d: "M10 16V9.5a1 1 0 0 1 5 0",
					key: "1i1are"
				}],
				["path", {
					d: "M8 12h4",
					key: "qz6y1c"
				}],
				["path", {
					d: "M8 16h7",
					key: "sbedsn"
				}]
			]);
			createLucideIcon("circle-question-mark", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["path", {
					d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3",
					key: "1u773s"
				}],
				["path", {
					d: "M12 17h.01",
					key: "p32p05"
				}]
			]);
			createLucideIcon("circle-slash-2", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "M22 2 2 22",
				key: "y4kqgn"
			}]]);
			createLucideIcon("circle-power", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["path", {
					d: "M12 7v4",
					key: "xawao1"
				}],
				["path", {
					d: "M7.998 9.003a5 5 0 1 0 8-.005",
					key: "1pek45"
				}]
			]);
			createLucideIcon("circle-slash", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["line", {
				x1: "9",
				x2: "15",
				y1: "15",
				y2: "9",
				key: "1dfufj"
			}]]);
			createLucideIcon("circle-star", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "M11.051 7.616a1 1 0 0 1 1.909.024l.737 1.452a1 1 0 0 0 .737.535l1.634.256a1 1 0 0 1 .588 1.806l-1.172 1.168a1 1 0 0 0-.282.866l.259 1.613a1 1 0 0 1-1.541 1.134l-1.465-.75a1 1 0 0 0-.912 0l-1.465.75a1 1 0 0 1-1.539-1.133l.258-1.613a1 1 0 0 0-.282-.867l-1.156-1.152a1 1 0 0 1 .572-1.822l1.633-.256a1 1 0 0 0 .737-.535z",
				key: "285bvi"
			}]]);
			createLucideIcon("circle-stop", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["rect", {
				x: "9",
				y: "9",
				width: "6",
				height: "6",
				rx: "1",
				key: "1ssd4o"
			}]]);
			createLucideIcon("circle-user-round", [
				["path", {
					d: "M17.925 20.056a6 6 0 0 0-11.851.001",
					key: "z69sun"
				}],
				["circle", {
					cx: "12",
					cy: "11",
					r: "4",
					key: "1gt34v"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}]
			]);
			createLucideIcon("circle-user", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["circle", {
					cx: "12",
					cy: "10",
					r: "3",
					key: "ilqhr7"
				}],
				["path", {
					d: "M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662",
					key: "154egf"
				}]
			]);
			createLucideIcon("circle-x", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["path", {
					d: "m15 9-6 6",
					key: "1uzhvr"
				}],
				["path", {
					d: "m9 9 6 6",
					key: "z0biqf"
				}]
			]);
			createLucideIcon("circle-small", [["circle", {
				cx: "12",
				cy: "12",
				r: "6",
				key: "1vlfrh"
			}]]);
			createLucideIcon("circle", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}]]);
			createLucideIcon("circuit-board", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M11 9h4a2 2 0 0 0 2-2V3",
					key: "1ve2rv"
				}],
				["circle", {
					cx: "9",
					cy: "9",
					r: "2",
					key: "af1f0g"
				}],
				["path", {
					d: "M7 21v-4a2 2 0 0 1 2-2h4",
					key: "1fwkro"
				}],
				["circle", {
					cx: "15",
					cy: "15",
					r: "2",
					key: "3i40o0"
				}]
			]);
			createLucideIcon("citrus", [
				["path", {
					d: "M21.66 17.67a1.08 1.08 0 0 1-.04 1.6A12 12 0 0 1 4.73 2.38a1.1 1.1 0 0 1 1.61-.04z",
					key: "4ite01"
				}],
				["path", {
					d: "M19.65 15.66A8 8 0 0 1 8.35 4.34",
					key: "1gxipu"
				}],
				["path", {
					d: "m14 10-5.5 5.5",
					key: "92pfem"
				}],
				["path", {
					d: "M14 17.85V10H6.15",
					key: "xqmtsk"
				}]
			]);
			createLucideIcon("clapperboard", [
				["path", {
					d: "m12.296 3.464 3.02 3.956",
					key: "qash78"
				}],
				["path", {
					d: "M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z",
					key: "1h7j8b"
				}],
				["path", {
					d: "M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
					key: "4lm6w1"
				}],
				["path", {
					d: "m6.18 5.276 3.1 3.899",
					key: "zjj9t3"
				}]
			]);
			createLucideIcon("clipboard-check", [
				["rect", {
					width: "8",
					height: "4",
					x: "8",
					y: "2",
					rx: "1",
					ry: "1",
					key: "tgr4d6"
				}],
				["path", {
					d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
					key: "116196"
				}],
				["path", {
					d: "m9 14 2 2 4-4",
					key: "df797q"
				}]
			]);
			createLucideIcon("clipboard-clock", [
				["path", {
					d: "M16 14v2.2l1.6 1",
					key: "fo4ql5"
				}],
				["path", {
					d: "M16 4h2a2 2 0 0 1 2 2v.832",
					key: "1ujtp2"
				}],
				["path", {
					d: "M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h2",
					key: "qvpao1"
				}],
				["circle", {
					cx: "16",
					cy: "16",
					r: "6",
					key: "qoo3c4"
				}],
				["rect", {
					x: "8",
					y: "2",
					width: "8",
					height: "4",
					rx: "1",
					key: "ublpy"
				}]
			]);
			createLucideIcon("clipboard-copy", [
				["rect", {
					width: "8",
					height: "4",
					x: "8",
					y: "2",
					rx: "1",
					ry: "1",
					key: "tgr4d6"
				}],
				["path", {
					d: "M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
					key: "4jdomd"
				}],
				["path", {
					d: "M16 4h2a2 2 0 0 1 2 2v4",
					key: "3hqy98"
				}],
				["path", {
					d: "M21 14H11",
					key: "1bme5i"
				}],
				["path", {
					d: "m15 10-4 4 4 4",
					key: "5dvupr"
				}]
			]);
			createLucideIcon("clipboard-list", [
				["rect", {
					width: "8",
					height: "4",
					x: "8",
					y: "2",
					rx: "1",
					ry: "1",
					key: "tgr4d6"
				}],
				["path", {
					d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
					key: "116196"
				}],
				["path", {
					d: "M12 11h4",
					key: "1jrz19"
				}],
				["path", {
					d: "M12 16h4",
					key: "n85exb"
				}],
				["path", {
					d: "M8 11h.01",
					key: "1dfujw"
				}],
				["path", {
					d: "M8 16h.01",
					key: "18s6g9"
				}]
			]);
			createLucideIcon("clipboard-minus", [
				["rect", {
					width: "8",
					height: "4",
					x: "8",
					y: "2",
					rx: "1",
					ry: "1",
					key: "tgr4d6"
				}],
				["path", {
					d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
					key: "116196"
				}],
				["path", {
					d: "M9 14h6",
					key: "159ibu"
				}]
			]);
			createLucideIcon("clipboard-paste", [
				["path", {
					d: "M11 14h10",
					key: "1w8e9d"
				}],
				["path", {
					d: "M16 4h2a2 2 0 0 1 2 2v1.344",
					key: "1e62lh"
				}],
				["path", {
					d: "m17 18 4-4-4-4",
					key: "z2g111"
				}],
				["path", {
					d: "M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 1.793-1.113",
					key: "bjbb7m"
				}],
				["rect", {
					x: "8",
					y: "2",
					width: "8",
					height: "4",
					rx: "1",
					key: "ublpy"
				}]
			]);
			createLucideIcon("clipboard-pen-line", [
				["rect", {
					width: "8",
					height: "4",
					x: "8",
					y: "2",
					rx: "1",
					key: "1oijnt"
				}],
				["path", {
					d: "M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-.5",
					key: "1but9f"
				}],
				["path", {
					d: "M16 4h2a2 2 0 0 1 1.73 1",
					key: "1p8n7l"
				}],
				["path", {
					d: "M8 18h1",
					key: "13wk12"
				}],
				["path", {
					d: "M21.378 12.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z",
					key: "2t3380"
				}]
			]);
			createLucideIcon("clipboard-pen", [
				["path", {
					d: "M16 4h2a2 2 0 0 1 2 2v2",
					key: "j91f56"
				}],
				["path", {
					d: "M21.34 15.664a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z",
					key: "16fuwn"
				}],
				["path", {
					d: "M8 22H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
					key: "120tdm"
				}],
				["rect", {
					x: "8",
					y: "2",
					width: "8",
					height: "4",
					rx: "1",
					key: "ublpy"
				}]
			]);
			createLucideIcon("clipboard-plus", [
				["rect", {
					width: "8",
					height: "4",
					x: "8",
					y: "2",
					rx: "1",
					ry: "1",
					key: "tgr4d6"
				}],
				["path", {
					d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
					key: "116196"
				}],
				["path", {
					d: "M9 14h6",
					key: "159ibu"
				}],
				["path", {
					d: "M12 17v-6",
					key: "1y8rbf"
				}]
			]);
			createLucideIcon("clipboard-type", [
				["rect", {
					width: "8",
					height: "4",
					x: "8",
					y: "2",
					rx: "1",
					ry: "1",
					key: "tgr4d6"
				}],
				["path", {
					d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
					key: "116196"
				}],
				["path", {
					d: "M9 12v-1h6v1",
					key: "iehl6m"
				}],
				["path", {
					d: "M11 17h2",
					key: "12w5me"
				}],
				["path", {
					d: "M12 11v6",
					key: "1bwqyc"
				}]
			]);
			createLucideIcon("clipboard-x", [
				["rect", {
					width: "8",
					height: "4",
					x: "8",
					y: "2",
					rx: "1",
					ry: "1",
					key: "tgr4d6"
				}],
				["path", {
					d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
					key: "116196"
				}],
				["path", {
					d: "m14.5 11.5-5 5",
					key: "1eaq8h"
				}],
				["path", {
					d: "m9.5 11.5 5 5",
					key: "1exjew"
				}]
			]);
			createLucideIcon("clipboard", [["rect", {
				width: "8",
				height: "4",
				x: "8",
				y: "2",
				rx: "1",
				ry: "1",
				key: "tgr4d6"
			}], ["path", {
				d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
				key: "116196"
			}]]);
			createLucideIcon("clock-1", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "M12 6v6l2-4",
				key: "miptyd"
			}]]);
			createLucideIcon("clock-10", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "M12 6v6l-4-2",
				key: "cedpoo"
			}]]);
			createLucideIcon("clock-11", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "M12 6v6l-2-4",
				key: "ns39ag"
			}]]);
			createLucideIcon("clock-2", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "M12 6v6l4-2",
				key: "1r2kuh"
			}]]);
			createLucideIcon("clock-3", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "M12 6v6h4",
				key: "135r8i"
			}]]);
			createLucideIcon("clock-12", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "M12 6v6",
				key: "1ipuwl"
			}]]);
			createLucideIcon("clock-4", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "M12 6v6l4 2",
				key: "mmk7yg"
			}]]);
			createLucideIcon("clock-5", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "M12 6v6l2 4",
				key: "1287s9"
			}]]);
			createLucideIcon("clock-6", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "M12 6v10",
				key: "wf7rdh"
			}]]);
			createLucideIcon("clock-7", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "M12 6v6l-2 4",
				key: "1095bu"
			}]]);
			createLucideIcon("clock-8", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "M12 6v6l-4 2",
				key: "imc3wl"
			}]]);
			createLucideIcon("clock-9", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "M12 6v6H8",
				key: "u39vzm"
			}]]);
			createLucideIcon("clock-alert", [
				["path", {
					d: "M12 6v6l4 2",
					key: "mmk7yg"
				}],
				["path", {
					d: "M20 12v5",
					key: "12wsvk"
				}],
				["path", {
					d: "M20 21h.01",
					key: "1p6o6n"
				}],
				["path", {
					d: "M21.25 8.2A10 10 0 1 0 16 21.16",
					key: "17fp9f"
				}]
			]);
			createLucideIcon("clock-arrow-down", [
				["path", {
					d: "M12 6v6l2 1",
					key: "19cm8n"
				}],
				["path", {
					d: "M12.337 21.994a10 10 0 1 1 9.588-8.767",
					key: "28moa"
				}],
				["path", {
					d: "m14 18 4 4 4-4",
					key: "1waygx"
				}],
				["path", {
					d: "M18 14v8",
					key: "irew45"
				}]
			]);
			createLucideIcon("clock-arrow-left", [
				["path", {
					d: "M12 6v6l1.5.8",
					key: "uc7jki"
				}],
				["path", {
					d: "M12.338 21.994a10 10 0 1 1 9.587-8.767",
					key: "1lz5pu"
				}],
				["path", {
					d: "M14 18h8",
					key: "1le3fr"
				}],
				["path", {
					d: "m18 22-4-4 4-4",
					key: "dh5o1f"
				}]
			]);
			createLucideIcon("clock-arrow-up", [
				["path", {
					d: "M12 6v6l1.56.78",
					key: "14ed3g"
				}],
				["path", {
					d: "M13.227 21.925a10 10 0 1 1 8.767-9.588",
					key: "jwkls1"
				}],
				["path", {
					d: "m14 18 4-4 4 4",
					key: "ftkppy"
				}],
				["path", {
					d: "M18 22v-8",
					key: "su0gjh"
				}]
			]);
			createLucideIcon("clock-arrow-right", [
				["path", {
					d: "M12 6v6l2 1",
					key: "19cm8n"
				}],
				["path", {
					d: "M13.5 21.885A10 10 0 1 1 22 12",
					key: "xgp8as"
				}],
				["path", {
					d: "M14 18h8",
					key: "1le3fr"
				}],
				["path", {
					d: "m18 22 4-4-4-4",
					key: "mordo3"
				}]
			]);
			createLucideIcon("clock-check", [
				["path", {
					d: "M21.95 13a10 10 0 1 0-8.685 8.92",
					key: "1ujumx"
				}],
				["path", {
					d: "M12 6v6l4 2",
					key: "mmk7yg"
				}],
				["path", {
					d: "m16 19 2 2 4-4",
					key: "1b14m6"
				}]
			]);
			createLucideIcon("clock-fading", [
				["path", {
					d: "M12 2a10 10 0 0 1 7.38 16.75",
					key: "175t95"
				}],
				["path", {
					d: "M12 6v6l4 2",
					key: "mmk7yg"
				}],
				["path", {
					d: "M2.5 8.875a10 10 0 0 0-.5 3",
					key: "1vce0s"
				}],
				["path", {
					d: "M2.83 16a10 10 0 0 0 2.43 3.4",
					key: "o3fkw4"
				}],
				["path", {
					d: "M4.636 5.235a10 10 0 0 1 .891-.857",
					key: "1szpfk"
				}],
				["path", {
					d: "M8.644 21.42a10 10 0 0 0 7.631-.38",
					key: "9yhvd4"
				}]
			]);
			createLucideIcon("clock-plus", [
				["path", {
					d: "M12 6v6l3.644 1.822",
					key: "1jmett"
				}],
				["path", {
					d: "M16 19h6",
					key: "xwg31i"
				}],
				["path", {
					d: "M19 16v6",
					key: "tddt3s"
				}],
				["path", {
					d: "M21.92 13.267a10 10 0 1 0-8.653 8.653",
					key: "1u0osk"
				}]
			]);
			createLucideIcon("clock", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "M12 6v6l4 2",
				key: "mmk7yg"
			}]]);
			createLucideIcon("closed-caption", [
				["path", {
					d: "M10 9.17a3 3 0 1 0 0 5.66",
					key: "h9wayk"
				}],
				["path", {
					d: "M17 9.17a3 3 0 1 0 0 5.66",
					key: "1v6zke"
				}],
				["rect", {
					x: "2",
					y: "5",
					width: "20",
					height: "14",
					rx: "2",
					key: "qneu4z"
				}]
			]);
			createLucideIcon("cloud-alert", [
				["path", {
					d: "M12 12v4",
					key: "tww15h"
				}],
				["path", {
					d: "M12 20h.01",
					key: "zekei9"
				}],
				["path", {
					d: "M8.128 16.949A7 7 0 1 1 15.71 8h1.79a1 1 0 0 1 0 9h-1.642",
					key: "1namsd"
				}]
			]);
			createLucideIcon("cloud-check", [["path", {
				d: "m17 15-5.5 5.5L9 18",
				key: "15q87x"
			}], ["path", {
				d: "M5.516 16.07A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 3.501 7.327",
				key: "1xtj56"
			}]]);
			createLucideIcon("cloud-backup", [
				["path", {
					d: "M21 15.251A4.5 4.5 0 0 0 17.5 8h-1.79A7 7 0 1 0 3 13.607",
					key: "xpoh9y"
				}],
				["path", {
					d: "M7 11v4h4",
					key: "q9yh32"
				}],
				["path", {
					d: "M8 19a5 5 0 0 0 9-3 4.5 4.5 0 0 0-4.5-4.5 4.82 4.82 0 0 0-3.41 1.41L7 15",
					key: "1xm8iu"
				}]
			]);
			createLucideIcon("cloud-cog", [
				["path", {
					d: "m10.852 19.772-.383.924",
					key: "r7sl7d"
				}],
				["path", {
					d: "m13.148 14.228.383-.923",
					key: "1d5zpm"
				}],
				["path", {
					d: "M13.148 19.772a3 3 0 1 0-2.296-5.544l-.383-.923",
					key: "1ydik7"
				}],
				["path", {
					d: "m13.53 20.696-.382-.924a3 3 0 1 1-2.296-5.544",
					key: "1m1vsf"
				}],
				["path", {
					d: "m14.772 15.852.923-.383",
					key: "660p6e"
				}],
				["path", {
					d: "m14.772 18.148.923.383",
					key: "hrcpis"
				}],
				["path", {
					d: "M4.2 15.1a7 7 0 1 1 9.93-9.858A7 7 0 0 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.2",
					key: "j2q98n"
				}],
				["path", {
					d: "m9.228 15.852-.923-.383",
					key: "1p9ong"
				}],
				["path", {
					d: "m9.228 18.148-.923.383",
					key: "6558rz"
				}]
			]);
			createLucideIcon("cloud-download", [
				["path", {
					d: "M12 13v8l-4-4",
					key: "1f5nwf"
				}],
				["path", {
					d: "m12 21 4-4",
					key: "1lfcce"
				}],
				["path", {
					d: "M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284",
					key: "ui1hmy"
				}]
			]);
			createLucideIcon("cloud-drizzle", [
				["path", {
					d: "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242",
					key: "1pljnt"
				}],
				["path", {
					d: "M8 19v1",
					key: "1dk2by"
				}],
				["path", {
					d: "M8 14v1",
					key: "84yxot"
				}],
				["path", {
					d: "M16 19v1",
					key: "v220m7"
				}],
				["path", {
					d: "M16 14v1",
					key: "g12gj6"
				}],
				["path", {
					d: "M12 21v1",
					key: "q8vafk"
				}],
				["path", {
					d: "M12 16v1",
					key: "1mx6rx"
				}]
			]);
			createLucideIcon("cloud-fog", [
				["path", {
					d: "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242",
					key: "1pljnt"
				}],
				["path", {
					d: "M16 17H7",
					key: "pygtm1"
				}],
				["path", {
					d: "M17 21H9",
					key: "1u2q02"
				}]
			]);
			createLucideIcon("cloud-hail", [
				["path", {
					d: "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242",
					key: "1pljnt"
				}],
				["path", {
					d: "M16 14v2",
					key: "a1is7l"
				}],
				["path", {
					d: "M8 14v2",
					key: "1e9m6t"
				}],
				["path", {
					d: "M16 20h.01",
					key: "xwek51"
				}],
				["path", {
					d: "M8 20h.01",
					key: "1vjney"
				}],
				["path", {
					d: "M12 16v2",
					key: "z66u1j"
				}],
				["path", {
					d: "M12 22h.01",
					key: "1urd7a"
				}]
			]);
			createLucideIcon("cloud-lightning", [["path", {
				d: "M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973",
				key: "1cez44"
			}], ["path", {
				d: "m13 12-3 5h4l-3 5",
				key: "1t22er"
			}]]);
			createLucideIcon("cloud-moon-rain", [
				["path", {
					d: "M11 20v2",
					key: "174qtz"
				}],
				["path", {
					d: "M18.376 14.512a6 6 0 0 0 3.461-4.127c.148-.625-.659-.97-1.248-.714a4 4 0 0 1-5.259-5.26c.255-.589-.09-1.395-.716-1.248a6 6 0 0 0-4.594 5.36",
					key: "zwnc1e"
				}],
				["path", {
					d: "M3 20a5 5 0 1 1 8.9-4H13a3 3 0 0 1 2 5.24",
					key: "1qmrp3"
				}],
				["path", {
					d: "M7 19v2",
					key: "12npes"
				}]
			]);
			createLucideIcon("cloud-moon", [["path", {
				d: "M13 16a3 3 0 0 1 0 6H7a5 5 0 1 1 4.9-6z",
				key: "ie2ih4"
			}], ["path", {
				d: "M18.376 14.512a6 6 0 0 0 3.461-4.127c.148-.625-.659-.97-1.248-.714a4 4 0 0 1-5.259-5.26c.255-.589-.09-1.395-.716-1.248a6 6 0 0 0-4.594 5.36",
				key: "zwnc1e"
			}]]);
			createLucideIcon("cloud-off", [
				["path", {
					d: "M10.94 5.274A7 7 0 0 1 15.71 10h1.79a4.5 4.5 0 0 1 4.222 6.057",
					key: "1uxyv8"
				}],
				["path", {
					d: "M18.796 18.81A4.5 4.5 0 0 1 17.5 19H9A7 7 0 0 1 5.79 5.78",
					key: "99tcn7"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}]
			]);
			createLucideIcon("cloud-rain-wind", [
				["path", {
					d: "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242",
					key: "1pljnt"
				}],
				["path", {
					d: "m9.2 22 3-7",
					key: "sb5f6j"
				}],
				["path", {
					d: "m9 13-3 7",
					key: "500co5"
				}],
				["path", {
					d: "m17 13-3 7",
					key: "8t2fiy"
				}]
			]);
			createLucideIcon("cloud-rain", [
				["path", {
					d: "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242",
					key: "1pljnt"
				}],
				["path", {
					d: "M16 14v6",
					key: "1j4efv"
				}],
				["path", {
					d: "M8 14v6",
					key: "17c4r9"
				}],
				["path", {
					d: "M12 16v6",
					key: "c8a4gj"
				}]
			]);
			createLucideIcon("cloud-snow", [
				["path", {
					d: "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242",
					key: "1pljnt"
				}],
				["path", {
					d: "M8 15h.01",
					key: "a7atzg"
				}],
				["path", {
					d: "M8 19h.01",
					key: "puxtts"
				}],
				["path", {
					d: "M12 17h.01",
					key: "p32p05"
				}],
				["path", {
					d: "M12 21h.01",
					key: "h35vbk"
				}],
				["path", {
					d: "M16 15h.01",
					key: "rnfrdf"
				}],
				["path", {
					d: "M16 19h.01",
					key: "1vcnzz"
				}]
			]);
			createLucideIcon("cloud-sun-rain", [
				["path", {
					d: "M12 2v2",
					key: "tus03m"
				}],
				["path", {
					d: "m4.93 4.93 1.41 1.41",
					key: "149t6j"
				}],
				["path", {
					d: "M20 12h2",
					key: "1q8mjw"
				}],
				["path", {
					d: "m19.07 4.93-1.41 1.41",
					key: "1shlcs"
				}],
				["path", {
					d: "M15.947 12.65a4 4 0 0 0-5.925-4.128",
					key: "dpwdj0"
				}],
				["path", {
					d: "M3 20a5 5 0 1 1 8.9-4H13a3 3 0 0 1 2 5.24",
					key: "1qmrp3"
				}],
				["path", {
					d: "M11 20v2",
					key: "174qtz"
				}],
				["path", {
					d: "M7 19v2",
					key: "12npes"
				}]
			]);
			createLucideIcon("cloud-sun", [
				["path", {
					d: "M12 2v2",
					key: "tus03m"
				}],
				["path", {
					d: "m4.93 4.93 1.41 1.41",
					key: "149t6j"
				}],
				["path", {
					d: "M20 12h2",
					key: "1q8mjw"
				}],
				["path", {
					d: "m19.07 4.93-1.41 1.41",
					key: "1shlcs"
				}],
				["path", {
					d: "M15.947 12.65a4 4 0 0 0-5.925-4.128",
					key: "dpwdj0"
				}],
				["path", {
					d: "M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z",
					key: "s09mg5"
				}]
			]);
			createLucideIcon("cloud-upload", [
				["path", {
					d: "M12 13v8",
					key: "1l5pq0"
				}],
				["path", {
					d: "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242",
					key: "1pljnt"
				}],
				["path", {
					d: "m8 17 4-4 4 4",
					key: "1quai1"
				}]
			]);
			createLucideIcon("cloud-sync", [
				["path", {
					d: "m17 18-1.535 1.605a5 5 0 0 1-8-1.5",
					key: "adpv5j"
				}],
				["path", {
					d: "M17 22v-4h-4",
					key: "ex1ofj"
				}],
				["path", {
					d: "M20.996 15.251A4.5 4.5 0 0 0 17.495 8h-1.79a7 7 0 1 0-12.709 5.607",
					key: "ziqt14"
				}],
				["path", {
					d: "M7 10v4h4",
					key: "1j6gx1"
				}],
				["path", {
					d: "m7 14 1.535-1.605a5 5 0 0 1 8 1.5",
					key: "19q5h7"
				}]
			]);
			createLucideIcon("cloud", [["path", {
				d: "M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z",
				key: "p7xjir"
			}]]);
			createLucideIcon("cloudy", [["path", {
				d: "M17.5 12a1 1 0 1 1 0 9H9.006a7 7 0 1 1 6.702-9z",
				key: "44yre2"
			}], ["path", {
				d: "M21.832 9A3 3 0 0 0 19 7h-2.207a5.5 5.5 0 0 0-10.72.61",
				key: "leugyv"
			}]]);
			createLucideIcon("clover", [
				["path", {
					d: "M16.17 7.83 2 22",
					key: "t58vo8"
				}],
				["path", {
					d: "M4.02 12a2.827 2.827 0 1 1 3.81-4.17A2.827 2.827 0 1 1 12 4.02a2.827 2.827 0 1 1 4.17 3.81A2.827 2.827 0 1 1 19.98 12a2.827 2.827 0 1 1-3.81 4.17A2.827 2.827 0 1 1 12 19.98a2.827 2.827 0 1 1-4.17-3.81A1 1 0 1 1 4 12",
					key: "17k36q"
				}],
				["path", {
					d: "m7.83 7.83 8.34 8.34",
					key: "1d7sxk"
				}]
			]);
			createLucideIcon("club", [["path", {
				d: "M17.28 9.05a5.5 5.5 0 1 0-10.56 0A5.5 5.5 0 1 0 12 17.66a5.5 5.5 0 1 0 5.28-8.6Z",
				key: "27yuqz"
			}], ["path", {
				d: "M12 17.66L12 22",
				key: "ogfahf"
			}]]);
			createLucideIcon("code-xml", [
				["path", {
					d: "m18 16 4-4-4-4",
					key: "1inbqp"
				}],
				["path", {
					d: "m6 8-4 4 4 4",
					key: "15zrgr"
				}],
				["path", {
					d: "m14.5 4-5 16",
					key: "e7oirm"
				}]
			]);
			createLucideIcon("code", [["path", {
				d: "m16 18 6-6-6-6",
				key: "eg8j8"
			}], ["path", {
				d: "m8 6-6 6 6 6",
				key: "ppft3o"
			}]]);
			createLucideIcon("coffee", [
				["path", {
					d: "M10 2v2",
					key: "7u0qdc"
				}],
				["path", {
					d: "M14 2v2",
					key: "6buw04"
				}],
				["path", {
					d: "M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1",
					key: "pwadti"
				}],
				["path", {
					d: "M6 2v2",
					key: "colzsn"
				}]
			]);
			createLucideIcon("cog", [
				["path", {
					d: "M11 10.27 7 3.34",
					key: "16pf9h"
				}],
				["path", {
					d: "m11 13.73-4 6.93",
					key: "794ttg"
				}],
				["path", {
					d: "M12 22v-2",
					key: "1osdcq"
				}],
				["path", {
					d: "M12 2v2",
					key: "tus03m"
				}],
				["path", {
					d: "M14 12h8",
					key: "4f43i9"
				}],
				["path", {
					d: "m17 20.66-1-1.73",
					key: "eq3orb"
				}],
				["path", {
					d: "m17 3.34-1 1.73",
					key: "2wel8s"
				}],
				["path", {
					d: "M2 12h2",
					key: "1t8f8n"
				}],
				["path", {
					d: "m20.66 17-1.73-1",
					key: "sg0v6f"
				}],
				["path", {
					d: "m20.66 7-1.73 1",
					key: "1ow05n"
				}],
				["path", {
					d: "m3.34 17 1.73-1",
					key: "nuk764"
				}],
				["path", {
					d: "m3.34 7 1.73 1",
					key: "1ulond"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "2",
					key: "1c9p78"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "8",
					key: "46899m"
				}]
			]);
			createLucideIcon("coins", [
				["path", {
					d: "M13.744 17.736a6 6 0 1 1-7.48-7.48",
					key: "bq4yh3"
				}],
				["path", {
					d: "M15 6h1v4",
					key: "11y1tn"
				}],
				["path", {
					d: "m6.134 14.768.866-.5 2 3.464",
					key: "17snzx"
				}],
				["circle", {
					cx: "16",
					cy: "8",
					r: "6",
					key: "14bfc9"
				}]
			]);
			createLucideIcon("columns-2", [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2",
				key: "afitv7"
			}], ["path", {
				d: "M12 3v18",
				key: "108xh3"
			}]]);
			createLucideIcon("columns-3-cog", [
				["path", {
					d: "M10.6 21H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v5.6",
					key: "19s2bv"
				}],
				["path", {
					d: "m14.305 19.53.923-.382",
					key: "3m78fa"
				}],
				["path", {
					d: "M15 3v7.6",
					key: "mv9izd"
				}],
				["path", {
					d: "m15.229 16.852-.924-.383",
					key: "qpfz85"
				}],
				["path", {
					d: "m16.852 15.228-.383-.923",
					key: "5xggr7"
				}],
				["path", {
					d: "m16.852 20.772-.383.924",
					key: "dpfhf9"
				}],
				["path", {
					d: "m19.148 15.228.383-.923",
					key: "1reyyz"
				}],
				["path", {
					d: "m19.53 21.696-.382-.924",
					key: "1goivc"
				}],
				["path", {
					d: "m20.773 16.852.922-.383",
					key: "59dfo2"
				}],
				["path", {
					d: "m20.773 19.148.922.383",
					key: "1lk755"
				}],
				["path", {
					d: "M9 3v18",
					key: "fh3hqa"
				}],
				["circle", {
					cx: "18",
					cy: "18",
					r: "3",
					key: "1xkwt0"
				}]
			]);
			createLucideIcon("columns-3", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M9 3v18",
					key: "fh3hqa"
				}],
				["path", {
					d: "M15 3v18",
					key: "14nvp0"
				}]
			]);
			createLucideIcon("columns-4", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M7.5 3v18",
					key: "w0wo6v"
				}],
				["path", {
					d: "M12 3v18",
					key: "108xh3"
				}],
				["path", {
					d: "M16.5 3v18",
					key: "10tjh1"
				}]
			]);
			createLucideIcon("combine", [
				["path", {
					d: "M14 3a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1",
					key: "1l7d7l"
				}],
				["path", {
					d: "M19 3a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1",
					key: "9955pe"
				}],
				["path", {
					d: "m7 15 3 3",
					key: "4hkfgk"
				}],
				["path", {
					d: "m7 21 3-3H5a2 2 0 0 1-2-2v-2",
					key: "1xljwe"
				}],
				["rect", {
					x: "14",
					y: "14",
					width: "7",
					height: "7",
					rx: "1",
					key: "1cdgtw"
				}],
				["rect", {
					x: "3",
					y: "3",
					width: "7",
					height: "7",
					rx: "1",
					key: "zi3rio"
				}]
			]);
			createLucideIcon("command", [["path", {
				d: "M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3",
				key: "11bfej"
			}]]);
			createLucideIcon("compass", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z",
				key: "9ktpf1"
			}]]);
			createLucideIcon("component", [
				["path", {
					d: "M15.536 11.293a1 1 0 0 0 0 1.414l2.376 2.377a1 1 0 0 0 1.414 0l2.377-2.377a1 1 0 0 0 0-1.414l-2.377-2.377a1 1 0 0 0-1.414 0z",
					key: "1uwlt4"
				}],
				["path", {
					d: "M2.297 11.293a1 1 0 0 0 0 1.414l2.377 2.377a1 1 0 0 0 1.414 0l2.377-2.377a1 1 0 0 0 0-1.414L6.088 8.916a1 1 0 0 0-1.414 0z",
					key: "10291m"
				}],
				["path", {
					d: "M8.916 17.912a1 1 0 0 0 0 1.415l2.377 2.376a1 1 0 0 0 1.414 0l2.377-2.376a1 1 0 0 0 0-1.415l-2.377-2.376a1 1 0 0 0-1.414 0z",
					key: "1tqoq1"
				}],
				["path", {
					d: "M8.916 4.674a1 1 0 0 0 0 1.414l2.377 2.376a1 1 0 0 0 1.414 0l2.377-2.376a1 1 0 0 0 0-1.414l-2.377-2.377a1 1 0 0 0-1.414 0z",
					key: "1x6lto"
				}]
			]);
			createLucideIcon("computer", [
				["rect", {
					width: "14",
					height: "8",
					x: "5",
					y: "2",
					rx: "2",
					key: "wc9tft"
				}],
				["rect", {
					width: "20",
					height: "8",
					x: "2",
					y: "14",
					rx: "2",
					key: "w68u3i"
				}],
				["path", {
					d: "M6 18h2",
					key: "rwmk9e"
				}],
				["path", {
					d: "M12 18h6",
					key: "aqd8w3"
				}]
			]);
			createLucideIcon("concierge-bell", [
				["path", {
					d: "M3 20a1 1 0 0 1-1-1v-1a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1Z",
					key: "1pvr1r"
				}],
				["path", {
					d: "M20 16a8 8 0 1 0-16 0",
					key: "1pa543"
				}],
				["path", {
					d: "M12 4v4",
					key: "1bq03y"
				}],
				["path", {
					d: "M10 4h4",
					key: "1xpv9s"
				}]
			]);
			createLucideIcon("cone", [["path", {
				d: "m20.9 18.55-8-15.98a1 1 0 0 0-1.8 0l-8 15.98",
				key: "53pte7"
			}], ["ellipse", {
				cx: "12",
				cy: "19",
				rx: "9",
				ry: "3",
				key: "1ji25f"
			}]]);
			createLucideIcon("construction", [
				["rect", {
					x: "2",
					y: "6",
					width: "20",
					height: "8",
					rx: "1",
					key: "1estib"
				}],
				["path", {
					d: "M17 14v7",
					key: "7m2elx"
				}],
				["path", {
					d: "M7 14v7",
					key: "1cm7wv"
				}],
				["path", {
					d: "M17 3v3",
					key: "1v4jwn"
				}],
				["path", {
					d: "M7 3v3",
					key: "7o6guu"
				}],
				["path", {
					d: "M10 14 2.3 6.3",
					key: "1023jk"
				}],
				["path", {
					d: "m14 6 7.7 7.7",
					key: "1s8pl2"
				}],
				["path", {
					d: "m8 6 8 8",
					key: "hl96qh"
				}]
			]);
			createLucideIcon("contact-round", [
				["path", {
					d: "M16 2v2",
					key: "scm5qe"
				}],
				["path", {
					d: "M17.915 21a6 6 0 10-12 0",
					key: "13n4mv"
				}],
				["path", {
					d: "M8 2v2",
					key: "pbkmx"
				}],
				["circle", {
					cx: "12",
					cy: "11",
					r: "4",
					key: "1gt34v"
				}],
				["rect", {
					x: "3",
					y: "3",
					width: "18",
					height: "18",
					rx: "2",
					key: "h1oib"
				}]
			]);
			createLucideIcon("contact", [
				["path", {
					d: "M16 2v2",
					key: "scm5qe"
				}],
				["path", {
					d: "M7 21v-2a2 2 0 012-2h6a2 2 0 012 2v2",
					key: "k82dct"
				}],
				["path", {
					d: "M8 2v2",
					key: "pbkmx"
				}],
				["circle", {
					cx: "12",
					cy: "10",
					r: "3",
					key: "ilqhr7"
				}],
				["rect", {
					x: "3",
					y: "3",
					width: "18",
					height: "18",
					rx: "2",
					key: "h1oib"
				}]
			]);
			createLucideIcon("container", [
				["path", {
					d: "M22 7.7c0-.6-.4-1.2-.8-1.5l-6.3-3.9a1.72 1.72 0 0 0-1.7 0l-10.3 6c-.5.2-.9.8-.9 1.4v6.6c0 .5.4 1.2.8 1.5l6.3 3.9a1.72 1.72 0 0 0 1.7 0l10.3-6c.5-.3.9-1 .9-1.5Z",
					key: "1t2lqe"
				}],
				["path", {
					d: "M10 21.9V14L2.1 9.1",
					key: "o7czzq"
				}],
				["path", {
					d: "m10 14 11.9-6.9",
					key: "zm5e20"
				}],
				["path", {
					d: "M14 19.8v-8.1",
					key: "159ecu"
				}],
				["path", {
					d: "M18 17.5V9.4",
					key: "11uown"
				}]
			]);
			createLucideIcon("contrast", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "M12 18a6 6 0 0 0 0-12v12z",
				key: "j4l70d"
			}]]);
			createLucideIcon("cookie", [
				["path", {
					d: "M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5",
					key: "laymnq"
				}],
				["path", {
					d: "M8.5 8.5v.01",
					key: "ue8clq"
				}],
				["path", {
					d: "M16 15.5v.01",
					key: "14dtrp"
				}],
				["path", {
					d: "M12 12v.01",
					key: "u5ubse"
				}],
				["path", {
					d: "M11 17v.01",
					key: "1hyl5a"
				}],
				["path", {
					d: "M7 14v.01",
					key: "uct60s"
				}]
			]);
			createLucideIcon("cooking-pot", [
				["path", {
					d: "M2 12h20",
					key: "9i4pu4"
				}],
				["path", {
					d: "M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8",
					key: "u0tga0"
				}],
				["path", {
					d: "m4 8 16-4",
					key: "16g0ng"
				}],
				["path", {
					d: "m8.86 6.78-.45-1.81a2 2 0 0 1 1.45-2.43l1.94-.48a2 2 0 0 1 2.43 1.46l.45 1.8",
					key: "12cejc"
				}]
			]);
			createLucideIcon("copy-check", [
				["path", {
					d: "m12 15 2 2 4-4",
					key: "2c609p"
				}],
				["rect", {
					width: "14",
					height: "14",
					x: "8",
					y: "8",
					rx: "2",
					ry: "2",
					key: "17jyea"
				}],
				["path", {
					d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
					key: "zix9uf"
				}]
			]);
			createLucideIcon("copy-minus", [
				["line", {
					x1: "12",
					x2: "18",
					y1: "15",
					y2: "15",
					key: "1nscbv"
				}],
				["rect", {
					width: "14",
					height: "14",
					x: "8",
					y: "8",
					rx: "2",
					ry: "2",
					key: "17jyea"
				}],
				["path", {
					d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
					key: "zix9uf"
				}]
			]);
			createLucideIcon("copy-plus", [
				["line", {
					x1: "15",
					x2: "15",
					y1: "12",
					y2: "18",
					key: "1p7wdc"
				}],
				["line", {
					x1: "12",
					x2: "18",
					y1: "15",
					y2: "15",
					key: "1nscbv"
				}],
				["rect", {
					width: "14",
					height: "14",
					x: "8",
					y: "8",
					rx: "2",
					ry: "2",
					key: "17jyea"
				}],
				["path", {
					d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
					key: "zix9uf"
				}]
			]);
			createLucideIcon("copy-slash", [
				["line", {
					x1: "12",
					x2: "18",
					y1: "18",
					y2: "12",
					key: "ebkxgr"
				}],
				["rect", {
					width: "14",
					height: "14",
					x: "8",
					y: "8",
					rx: "2",
					ry: "2",
					key: "17jyea"
				}],
				["path", {
					d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
					key: "zix9uf"
				}]
			]);
			createLucideIcon("copy-x", [
				["path", {
					d: "M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2",
					key: "1qd6ae"
				}],
				["rect", {
					x: "8",
					y: "8",
					width: "14",
					height: "14",
					rx: "2",
					key: "1an92s"
				}],
				["path", {
					d: "m12.5 12.5 5 5",
					key: "1simgt"
				}],
				["path", {
					d: "m12.5 17.5 5-5",
					key: "pc59mn"
				}]
			]);
			createLucideIcon("copy", [["rect", {
				width: "14",
				height: "14",
				x: "8",
				y: "8",
				rx: "2",
				ry: "2",
				key: "17jyea"
			}], ["path", {
				d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
				key: "zix9uf"
			}]]);
			createLucideIcon("copyleft", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "M9.17 14.83a4 4 0 1 0 0-5.66",
				key: "1sveal"
			}]]);
			createLucideIcon("copyright", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "M14.83 14.83a4 4 0 1 1 0-5.66",
				key: "1i56pz"
			}]]);
			createLucideIcon("corner-down-left", [["path", {
				d: "M20 4v7a4 4 0 0 1-4 4H4",
				key: "6o5b7l"
			}], ["path", {
				d: "m9 10-5 5 5 5",
				key: "1kshq7"
			}]]);
			createLucideIcon("corner-down-right", [["path", {
				d: "m15 10 5 5-5 5",
				key: "qqa56n"
			}], ["path", {
				d: "M4 4v7a4 4 0 0 0 4 4h12",
				key: "z08zvw"
			}]]);
			createLucideIcon("corner-left-down", [["path", {
				d: "m14 15-5 5-5-5",
				key: "1eia93"
			}], ["path", {
				d: "M20 4h-7a4 4 0 0 0-4 4v12",
				key: "nbpdq2"
			}]]);
			createLucideIcon("corner-left-up", [["path", {
				d: "M14 9 9 4 4 9",
				key: "1af5af"
			}], ["path", {
				d: "M20 20h-7a4 4 0 0 1-4-4V4",
				key: "1blwi3"
			}]]);
			createLucideIcon("corner-right-down", [["path", {
				d: "m10 15 5 5 5-5",
				key: "1hpjnr"
			}], ["path", {
				d: "M4 4h7a4 4 0 0 1 4 4v12",
				key: "wcbgct"
			}]]);
			createLucideIcon("corner-right-up", [["path", {
				d: "m10 9 5-5 5 5",
				key: "9ctzwi"
			}], ["path", {
				d: "M4 20h7a4 4 0 0 0 4-4V4",
				key: "1plgdj"
			}]]);
			createLucideIcon("corner-up-left", [["path", {
				d: "M20 20v-7a4 4 0 0 0-4-4H4",
				key: "1nkjon"
			}], ["path", {
				d: "M9 14 4 9l5-5",
				key: "102s5s"
			}]]);
			createLucideIcon("corner-up-right", [["path", {
				d: "m15 14 5-5-5-5",
				key: "12vg1m"
			}], ["path", {
				d: "M4 20v-7a4 4 0 0 1 4-4h12",
				key: "1lu4f8"
			}]]);
			createLucideIcon("cpu", [
				["path", {
					d: "M12 20v2",
					key: "1lh1kg"
				}],
				["path", {
					d: "M12 2v2",
					key: "tus03m"
				}],
				["path", {
					d: "M17 20v2",
					key: "1rnc9c"
				}],
				["path", {
					d: "M17 2v2",
					key: "11trls"
				}],
				["path", {
					d: "M2 12h2",
					key: "1t8f8n"
				}],
				["path", {
					d: "M2 17h2",
					key: "7oei6x"
				}],
				["path", {
					d: "M2 7h2",
					key: "asdhe0"
				}],
				["path", {
					d: "M20 12h2",
					key: "1q8mjw"
				}],
				["path", {
					d: "M20 17h2",
					key: "1fpfkl"
				}],
				["path", {
					d: "M20 7h2",
					key: "1o8tra"
				}],
				["path", {
					d: "M7 20v2",
					key: "4gnj0m"
				}],
				["path", {
					d: "M7 2v2",
					key: "1i4yhu"
				}],
				["rect", {
					x: "4",
					y: "4",
					width: "16",
					height: "16",
					rx: "2",
					key: "1vbyd7"
				}],
				["rect", {
					x: "8",
					y: "8",
					width: "8",
					height: "8",
					rx: "1",
					key: "z9xiuo"
				}]
			]);
			createLucideIcon("creative-commons", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["path", {
					d: "M10 9.3a2.8 2.8 0 0 0-3.5 1 3.1 3.1 0 0 0 0 3.4 2.7 2.7 0 0 0 3.5 1",
					key: "1ss3eq"
				}],
				["path", {
					d: "M17 9.3a2.8 2.8 0 0 0-3.5 1 3.1 3.1 0 0 0 0 3.4 2.7 2.7 0 0 0 3.5 1",
					key: "1od56t"
				}]
			]);
			createLucideIcon("credit-card-check", [
				["path", {
					d: "M12.5 19H4a2 2 0 01-2-2V7a2 2 0 012-2h16a2 2 0 012 2v4",
					key: "1pfaq2"
				}],
				["path", {
					d: "m16 17 2 2 4-4",
					key: "uh5qu3"
				}],
				["path", {
					d: "M2 10h20",
					key: "1ir3d8"
				}]
			]);
			createLucideIcon("credit-card-minus", [
				["path", {
					d: "M16 17h6",
					key: "1ook5g"
				}],
				["path", {
					d: "M22 10H2",
					key: "jawrgs"
				}],
				["path", {
					d: "M22 13V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2h8.536",
					key: "ljwgfh"
				}]
			]);
			createLucideIcon("credit-card-plus", [
				["path", {
					d: "M16 17h6",
					key: "1ook5g"
				}],
				["path", {
					d: "M19 14v6",
					key: "1ckrd5"
				}],
				["path", {
					d: "M22 10H2",
					key: "jawrgs"
				}],
				["path", {
					d: "M22 11.354V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2h8.536",
					key: "19x2x0"
				}]
			]);
			createLucideIcon("credit-card-x", [
				["path", {
					d: "M12.5 19H4a2 2 0 01-2-2V7a2 2 0 012-2h16a2 2 0 012 2v3.5",
					key: "187u2m"
				}],
				["path", {
					d: "m16.5 14.5 5 5",
					key: "ozpm51"
				}],
				["path", {
					d: "M2 10h20",
					key: "1ir3d8"
				}],
				["path", {
					d: "m21.5 14.5-5 5",
					key: "1bnlip"
				}]
			]);
			createLucideIcon("credit-card", [["rect", {
				width: "20",
				height: "14",
				x: "2",
				y: "5",
				rx: "2",
				key: "ynyp8z"
			}], ["line", {
				x1: "2",
				x2: "22",
				y1: "10",
				y2: "10",
				key: "1b3vmo"
			}]]);
			createLucideIcon("croissant", [
				["path", {
					d: "M10.2 18H4.774a1.5 1.5 0 0 1-1.352-.97 11 11 0 0 1 .132-6.487",
					key: "14kkz9"
				}],
				["path", {
					d: "M18 10.2V4.774a1.5 1.5 0 0 0-.97-1.352 11 11 0 0 0-6.486.132",
					key: "1g7v07"
				}],
				["path", {
					d: "M18 5a4 3 0 0 1 4 3 2 2 0 0 1-2 2 10 10 0 0 0-5.139 1.42",
					key: "ratg6b"
				}],
				["path", {
					d: "M5 18a3 4 0 0 0 3 4 2 2 0 0 0 2-2 10 10 0 0 1 1.42-5.14",
					key: "4454f0"
				}],
				["path", {
					d: "M8.709 2.554a10 10 0 0 0-6.155 6.155 1.5 1.5 0 0 0 .676 1.626l9.807 5.42a2 2 0 0 0 2.718-2.718l-5.42-9.807a1.5 1.5 0 0 0-1.626-.676",
					key: "qmemie"
				}]
			]);
			createLucideIcon("crop", [["path", {
				d: "M6 2v14a2 2 0 0 0 2 2h14",
				key: "ron5a4"
			}], ["path", {
				d: "M18 22V8a2 2 0 0 0-2-2H2",
				key: "7s9ehn"
			}]]);
			createLucideIcon("crosshair", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["line", {
					x1: "22",
					x2: "18",
					y1: "12",
					y2: "12",
					key: "l9bcsi"
				}],
				["line", {
					x1: "6",
					x2: "2",
					y1: "12",
					y2: "12",
					key: "13hhkx"
				}],
				["line", {
					x1: "12",
					x2: "12",
					y1: "6",
					y2: "2",
					key: "10w3f3"
				}],
				["line", {
					x1: "12",
					x2: "12",
					y1: "22",
					y2: "18",
					key: "15g9kq"
				}]
			]);
			createLucideIcon("cross", [["path", {
				d: "M4 9a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h4a1 1 0 0 1 1 1v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a1 1 0 0 1 1-1h4a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-4a1 1 0 0 1-1-1V4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4a1 1 0 0 1-1 1z",
				key: "1xbrqy"
			}]]);
			createLucideIcon("crown", [["path", {
				d: "M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z",
				key: "1vdc57"
			}], ["path", {
				d: "M5 21h14",
				key: "11awu3"
			}]]);
			createLucideIcon("cuboid", [
				["path", {
					d: "M10 22v-8",
					key: "1f8443"
				}],
				["path", {
					d: "M2.336 8.89 10 14l11.715-7.029",
					key: "1qnufy"
				}],
				["path", {
					d: "M22 14a2 2 0 0 1-.971 1.715l-10 6a2 2 0 0 1-2.138-.05l-6-4A2 2 0 0 1 2 16v-6a2 2 0 0 1 .971-1.715l10-6a2 2 0 0 1 2.138.05l6 4A2 2 0 0 1 22 8z",
					key: "670npk"
				}]
			]);
			createLucideIcon("currency", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "8",
					key: "46899m"
				}],
				["line", {
					x1: "3",
					x2: "6",
					y1: "3",
					y2: "6",
					key: "1jkytn"
				}],
				["line", {
					x1: "21",
					x2: "18",
					y1: "3",
					y2: "6",
					key: "14zfjt"
				}],
				["line", {
					x1: "3",
					x2: "6",
					y1: "21",
					y2: "18",
					key: "iusuec"
				}],
				["line", {
					x1: "21",
					x2: "18",
					y1: "21",
					y2: "18",
					key: "yj2dd7"
				}]
			]);
			createLucideIcon("cup-soda", [
				["path", {
					d: "m6 8 1.75 12.28a2 2 0 0 0 2 1.72h4.54a2 2 0 0 0 2-1.72L18 8",
					key: "8166m8"
				}],
				["path", {
					d: "M5 8h14",
					key: "pcz4l3"
				}],
				["path", {
					d: "M7 15a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0",
					key: "yjz344"
				}],
				["path", {
					d: "m12 8 1-6h2",
					key: "3ybfa4"
				}]
			]);
			createLucideIcon("cylinder", [["ellipse", {
				cx: "12",
				cy: "5",
				rx: "9",
				ry: "3",
				key: "msslwz"
			}], ["path", {
				d: "M3 5v14a9 3 0 0 0 18 0V5",
				key: "aqi0yr"
			}]]);
			createLucideIcon("dam", [
				["path", {
					d: "M11 11.31c1.17.56 1.54 1.69 3.5 1.69 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
					key: "157kva"
				}],
				["path", {
					d: "M11.75 18c.35.5 1.45 1 2.75 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
					key: "d7q6m6"
				}],
				["path", {
					d: "M2 10h4",
					key: "l0bgd4"
				}],
				["path", {
					d: "M2 14h4",
					key: "1gsvsf"
				}],
				["path", {
					d: "M2 18h4",
					key: "1bu2t1"
				}],
				["path", {
					d: "M2 6h4",
					key: "aawbzj"
				}],
				["path", {
					d: "M7 3a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1L10 4a1 1 0 0 0-1-1z",
					key: "pr6s65"
				}]
			]);
			createLucideIcon("database-arrow-down", [
				["path", {
					d: "m16 19 3 3 3-3",
					key: "1ibux0"
				}],
				["path", {
					d: "M19 16v6",
					key: "tddt3s"
				}],
				["path", {
					d: "M21 12.536V5",
					key: "zeza6i"
				}],
				["path", {
					d: "M3 12A9 3 0 0 0 15.182 14.806",
					key: "11e5wb"
				}],
				["path", {
					d: "M3 5V19A9 3 0 0 0 13.318 21.968",
					key: "1lyu4j"
				}],
				["ellipse", {
					cx: "12",
					cy: "5",
					rx: "9",
					ry: "3",
					key: "msslwz"
				}]
			]);
			createLucideIcon("database-arrow-up", [
				["path", {
					d: "M19 22v-6",
					key: "qhmiwi"
				}],
				["path", {
					d: "M21 12.536V5",
					key: "zeza6i"
				}],
				["path", {
					d: "m22 19-3-3-3 3",
					key: "rn6bg2"
				}],
				["path", {
					d: "M3 12A9 3 0 0 0 14.457 14.886",
					key: "1941vg"
				}],
				["path", {
					d: "M3 5V19A9 3 0 0 0 13.318 21.968",
					key: "1lyu4j"
				}],
				["ellipse", {
					cx: "12",
					cy: "5",
					rx: "9",
					ry: "3",
					key: "msslwz"
				}]
			]);
			createLucideIcon("database-backup", [
				["ellipse", {
					cx: "12",
					cy: "5",
					rx: "9",
					ry: "3",
					key: "msslwz"
				}],
				["path", {
					d: "M3 12a9 3 0 0 0 5 2.69",
					key: "1ui2ym"
				}],
				["path", {
					d: "M21 9.3V5",
					key: "6k6cib"
				}],
				["path", {
					d: "M3 5v14a9 3 0 0 0 6.47 2.88",
					key: "i62tjy"
				}],
				["path", {
					d: "M12 12v4h4",
					key: "1bxaet"
				}],
				["path", {
					d: "M13 20a5 5 0 0 0 9-3 4.5 4.5 0 0 0-4.5-4.5c-1.33 0-2.54.54-3.41 1.41L12 16",
					key: "1f4ei9"
				}]
			]);
			createLucideIcon("database-minus", [
				["path", {
					d: "M21 15V5",
					key: "1lbg5w"
				}],
				["path", {
					d: "M22 19h-6",
					key: "vcuq98"
				}],
				["path", {
					d: "M3 12A9 3 0 0 0 21 12",
					key: "mv7ke4"
				}],
				["path", {
					d: "M3 5V19A9 3 0 0 0 13.318 21.968",
					key: "1lyu4j"
				}],
				["ellipse", {
					cx: "12",
					cy: "5",
					rx: "9",
					ry: "3",
					key: "msslwz"
				}]
			]);
			createLucideIcon("database-check", [
				["path", {
					d: "m16 19 2 2 4-4",
					key: "1b14m6"
				}],
				["path", {
					d: "M21 13.127V5",
					key: "59o5vz"
				}],
				["path", {
					d: "M3 12A9 3 0 0 0 21 12",
					key: "mv7ke4"
				}],
				["path", {
					d: "M3 5V19A9 3 0 0 0 13.318 21.968",
					key: "1lyu4j"
				}],
				["ellipse", {
					cx: "12",
					cy: "5",
					rx: "9",
					ry: "3",
					key: "msslwz"
				}]
			]);
			createLucideIcon("database-plus", [
				["path", {
					d: "M19 16v6",
					key: "tddt3s"
				}],
				["path", {
					d: "M21 12.536V5",
					key: "zeza6i"
				}],
				["path", {
					d: "M22 19h-6",
					key: "vcuq98"
				}],
				["path", {
					d: "M3 12A9 3 0 0 0 15.1824 14.8061",
					key: "ukc3b1"
				}],
				["path", {
					d: "M3 5V19A9 3 0 0 0 13.318 21.968",
					key: "1lyu4j"
				}],
				["ellipse", {
					cx: "12",
					cy: "5",
					rx: "9",
					ry: "3",
					key: "msslwz"
				}]
			]);
			createLucideIcon("database-search", [
				["path", {
					d: "M21 11.693V5",
					key: "175m1t"
				}],
				["path", {
					d: "m22 22-1.875-1.875",
					key: "13zax7"
				}],
				["path", {
					d: "M3 12a9 3 0 0 0 8.697 2.998",
					key: "151u9p"
				}],
				["path", {
					d: "M3 5v14a9 3 0 0 0 9.28 2.999",
					key: "q2rs2p"
				}],
				["circle", {
					cx: "18",
					cy: "18",
					r: "3",
					key: "1xkwt0"
				}],
				["ellipse", {
					cx: "12",
					cy: "5",
					rx: "9",
					ry: "3",
					key: "msslwz"
				}]
			]);
			createLucideIcon("database-x", [
				["path", {
					d: "m17 17 5 5",
					key: "p7ous7"
				}],
				["path", {
					d: "M19.323 13.744A9 3 0 0 0 21 12",
					key: "hmry77"
				}],
				["path", {
					d: "M21 13.127V5",
					key: "59o5vz"
				}],
				["path", {
					d: "m22 17-5 5",
					key: "gqnmv0"
				}],
				["path", {
					d: "M3 12A9 3 0 0 0 13.563 14.954",
					key: "1rmyhq"
				}],
				["path", {
					d: "M3 5V19A9 3 0 0 0 13 21.981",
					key: "159k2m"
				}],
				["ellipse", {
					cx: "12",
					cy: "5",
					rx: "9",
					ry: "3",
					key: "msslwz"
				}]
			]);
			createLucideIcon("database-zap", [
				["ellipse", {
					cx: "12",
					cy: "5",
					rx: "9",
					ry: "3",
					key: "msslwz"
				}],
				["path", {
					d: "M3 5V19A9 3 0 0 0 15 21.84",
					key: "14ibmq"
				}],
				["path", {
					d: "M21 5V8",
					key: "1marbg"
				}],
				["path", {
					d: "M21 12L18 17H22L19 22",
					key: "zafso"
				}],
				["path", {
					d: "M3 12A9 3 0 0 0 14.59 14.87",
					key: "1y4wr8"
				}]
			]);
			createLucideIcon("database", [
				["ellipse", {
					cx: "12",
					cy: "5",
					rx: "9",
					ry: "3",
					key: "msslwz"
				}],
				["path", {
					d: "M3 5V19A9 3 0 0 0 21 19V5",
					key: "1wlel7"
				}],
				["path", {
					d: "M3 12A9 3 0 0 0 21 12",
					key: "mv7ke4"
				}]
			]);
			createLucideIcon("decimals-arrow-left", [
				["path", {
					d: "m13 21-3-3 3-3",
					key: "s3o1nf"
				}],
				["path", {
					d: "M20 18H10",
					key: "14r3mt"
				}],
				["path", {
					d: "M3 11h.01",
					key: "1eifu7"
				}],
				["rect", {
					x: "6",
					y: "3",
					width: "5",
					height: "8",
					rx: "2.5",
					key: "v9paqo"
				}]
			]);
			createLucideIcon("decimals-arrow-right", [
				["path", {
					d: "M10 18h10",
					key: "1y5s8o"
				}],
				["path", {
					d: "m17 21 3-3-3-3",
					key: "1ammt0"
				}],
				["path", {
					d: "M3 11h.01",
					key: "1eifu7"
				}],
				["rect", {
					x: "15",
					y: "3",
					width: "5",
					height: "8",
					rx: "2.5",
					key: "76md6a"
				}],
				["rect", {
					x: "6",
					y: "3",
					width: "5",
					height: "8",
					rx: "2.5",
					key: "v9paqo"
				}]
			]);
			createLucideIcon("delete", [
				["path", {
					d: "M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z",
					key: "1yo7s0"
				}],
				["path", {
					d: "m12 9 6 6",
					key: "anjzzh"
				}],
				["path", {
					d: "m18 9-6 6",
					key: "1fp51s"
				}]
			]);
			createLucideIcon("dessert", [
				["path", {
					d: "M10.162 3.167A10 10 0 0 0 2 13a2 2 0 0 0 4 0v-1a2 2 0 0 1 4 0v4a2 2 0 0 0 4 0v-4a2 2 0 0 1 4 0v1a2 2 0 0 0 4-.006 10 10 0 0 0-8.161-9.826",
					key: "xi88qy"
				}],
				["path", {
					d: "M20.804 14.869a9 9 0 0 1-17.608 0",
					key: "1r28rg"
				}],
				["circle", {
					cx: "12",
					cy: "4",
					r: "2",
					key: "muu5ef"
				}]
			]);
			createLucideIcon("diameter", [
				["circle", {
					cx: "19",
					cy: "19",
					r: "2",
					key: "17f5cg"
				}],
				["circle", {
					cx: "5",
					cy: "5",
					r: "2",
					key: "1gwv83"
				}],
				["path", {
					d: "M6.48 3.66a10 10 0 0 1 13.86 13.86",
					key: "xr8kdq"
				}],
				["path", {
					d: "m6.41 6.41 11.18 11.18",
					key: "uhpjw7"
				}],
				["path", {
					d: "M3.66 6.48a10 10 0 0 0 13.86 13.86",
					key: "cldpwv"
				}]
			]);
			createLucideIcon("diamond-minus", [["path", {
				d: "M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41L13.7 2.71a2.41 2.41 0 0 0-3.41 0z",
				key: "1ey20j"
			}], ["path", {
				d: "M8 12h8",
				key: "1wcyev"
			}]]);
			createLucideIcon("diamond-percent", [
				["path", {
					d: "M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41L13.7 2.71a2.41 2.41 0 0 0-3.41 0Z",
					key: "1tpxz2"
				}],
				["path", {
					d: "M9.2 9.2h.01",
					key: "1b7bvt"
				}],
				["path", {
					d: "m14.5 9.5-5 5",
					key: "17q4r4"
				}],
				["path", {
					d: "M14.7 14.8h.01",
					key: "17nsh4"
				}]
			]);
			createLucideIcon("diamond-plus", [
				["path", {
					d: "M12 8v8",
					key: "napkw2"
				}],
				["path", {
					d: "M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41L13.7 2.71a2.41 2.41 0 0 0-3.41 0z",
					key: "1ey20j"
				}],
				["path", {
					d: "M8 12h8",
					key: "1wcyev"
				}]
			]);
			createLucideIcon("diamond", [["path", {
				d: "M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z",
				key: "1f1r0c"
			}]]);
			createLucideIcon("dice-1", [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2",
				ry: "2",
				key: "1m3agn"
			}], ["path", {
				d: "M12 12h.01",
				key: "1mp3jc"
			}]]);
			createLucideIcon("dice-2", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					ry: "2",
					key: "1m3agn"
				}],
				["path", {
					d: "M15 9h.01",
					key: "x1ddxp"
				}],
				["path", {
					d: "M9 15h.01",
					key: "fzyn71"
				}]
			]);
			createLucideIcon("dice-3", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					ry: "2",
					key: "1m3agn"
				}],
				["path", {
					d: "M16 8h.01",
					key: "cr5u4v"
				}],
				["path", {
					d: "M12 12h.01",
					key: "1mp3jc"
				}],
				["path", {
					d: "M8 16h.01",
					key: "18s6g9"
				}]
			]);
			createLucideIcon("dice-4", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					ry: "2",
					key: "1m3agn"
				}],
				["path", {
					d: "M16 8h.01",
					key: "cr5u4v"
				}],
				["path", {
					d: "M8 8h.01",
					key: "1e4136"
				}],
				["path", {
					d: "M8 16h.01",
					key: "18s6g9"
				}],
				["path", {
					d: "M16 16h.01",
					key: "1f9h7w"
				}]
			]);
			createLucideIcon("dice-5", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					ry: "2",
					key: "1m3agn"
				}],
				["path", {
					d: "M16 8h.01",
					key: "cr5u4v"
				}],
				["path", {
					d: "M8 8h.01",
					key: "1e4136"
				}],
				["path", {
					d: "M8 16h.01",
					key: "18s6g9"
				}],
				["path", {
					d: "M16 16h.01",
					key: "1f9h7w"
				}],
				["path", {
					d: "M12 12h.01",
					key: "1mp3jc"
				}]
			]);
			createLucideIcon("dice-6", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					ry: "2",
					key: "1m3agn"
				}],
				["path", {
					d: "M16 8h.01",
					key: "cr5u4v"
				}],
				["path", {
					d: "M16 12h.01",
					key: "1l6xoz"
				}],
				["path", {
					d: "M16 16h.01",
					key: "1f9h7w"
				}],
				["path", {
					d: "M8 8h.01",
					key: "1e4136"
				}],
				["path", {
					d: "M8 12h.01",
					key: "czm47f"
				}],
				["path", {
					d: "M8 16h.01",
					key: "18s6g9"
				}]
			]);
			createLucideIcon("dices", [
				["rect", {
					width: "12",
					height: "12",
					x: "2",
					y: "10",
					rx: "2",
					ry: "2",
					key: "6agr2n"
				}],
				["path", {
					d: "m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6",
					key: "1o487t"
				}],
				["path", {
					d: "M6 18h.01",
					key: "uhywen"
				}],
				["path", {
					d: "M10 14h.01",
					key: "ssrbsk"
				}],
				["path", {
					d: "M15 6h.01",
					key: "cblpky"
				}],
				["path", {
					d: "M18 9h.01",
					key: "2061c0"
				}]
			]);
			createLucideIcon("diff", [
				["path", {
					d: "M12 3v14",
					key: "7cf3v8"
				}],
				["path", {
					d: "M5 10h14",
					key: "elsbfy"
				}],
				["path", {
					d: "M5 21h14",
					key: "11awu3"
				}]
			]);
			createLucideIcon("disc-2", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "4",
					key: "4exip2"
				}],
				["path", {
					d: "M12 12h.01",
					key: "1mp3jc"
				}]
			]);
			createLucideIcon("disc-3", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["path", {
					d: "M6 12c0-1.7.7-3.2 1.8-4.2",
					key: "oqkarx"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "2",
					key: "1c9p78"
				}],
				["path", {
					d: "M18 12c0 1.7-.7 3.2-1.8 4.2",
					key: "1eah9h"
				}]
			]);
			createLucideIcon("disc", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["circle", {
				cx: "12",
				cy: "12",
				r: "2",
				key: "1c9p78"
			}]]);
			createLucideIcon("disc-album", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "5",
					key: "nd82uf"
				}],
				["path", {
					d: "M12 12h.01",
					key: "1mp3jc"
				}]
			]);
			createLucideIcon("divide", [
				["circle", {
					cx: "12",
					cy: "6",
					r: "1",
					key: "1bh7o1"
				}],
				["line", {
					x1: "5",
					x2: "19",
					y1: "12",
					y2: "12",
					key: "13b5wn"
				}],
				["circle", {
					cx: "12",
					cy: "18",
					r: "1",
					key: "lqb9t5"
				}]
			]);
			createLucideIcon("dna-off", [
				["path", {
					d: "M15 2c-1.35 1.5-2.092 3-2.5 4.5L14 8",
					key: "1bivrr"
				}],
				["path", {
					d: "m17 6-2.891-2.891",
					key: "xu6p2f"
				}],
				["path", {
					d: "M2 15c3.333-3 6.667-3 10-3",
					key: "nxix30"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "m20 9 .891.891",
					key: "3xwk7g"
				}],
				["path", {
					d: "M22 9c-1.5 1.35-3 2.092-4.5 2.5l-1-1",
					key: "18cutr"
				}],
				["path", {
					d: "M3.109 14.109 4 15",
					key: "q76aoh"
				}],
				["path", {
					d: "m6.5 12.5 1 1",
					key: "cs35ky"
				}],
				["path", {
					d: "m7 18 2.891 2.891",
					key: "1sisit"
				}],
				["path", {
					d: "M9 22c1.35-1.5 2.092-3 2.5-4.5L10 16",
					key: "rlvei3"
				}]
			]);
			createLucideIcon("dna", [
				["path", {
					d: "m10 16 1.5 1.5",
					key: "11lckj"
				}],
				["path", {
					d: "m14 8-1.5-1.5",
					key: "1ohn8i"
				}],
				["path", {
					d: "M15 2c-1.798 1.998-2.518 3.995-2.807 5.993",
					key: "80uv8i"
				}],
				["path", {
					d: "m16.5 10.5 1 1",
					key: "696xn5"
				}],
				["path", {
					d: "m17 6-2.891-2.891",
					key: "xu6p2f"
				}],
				["path", {
					d: "M2 15c6.667-6 13.333 0 20-6",
					key: "1pyr53"
				}],
				["path", {
					d: "m20 9 .891.891",
					key: "3xwk7g"
				}],
				["path", {
					d: "M3.109 14.109 4 15",
					key: "q76aoh"
				}],
				["path", {
					d: "m6.5 12.5 1 1",
					key: "cs35ky"
				}],
				["path", {
					d: "m7 18 2.891 2.891",
					key: "1sisit"
				}],
				["path", {
					d: "M9 22c1.798-1.998 2.518-3.995 2.807-5.993",
					key: "q3hbxp"
				}]
			]);
			createLucideIcon("dock", [
				["path", {
					d: "M2 8h20",
					key: "d11cs7"
				}],
				["rect", {
					width: "20",
					height: "16",
					x: "2",
					y: "4",
					rx: "2",
					key: "18n3k1"
				}],
				["path", {
					d: "M6 16h12",
					key: "u522kt"
				}]
			]);
			createLucideIcon("dollar-sign", [["line", {
				x1: "12",
				x2: "12",
				y1: "2",
				y2: "22",
				key: "7eqyqh"
			}], ["path", {
				d: "M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
				key: "1b0p4s"
			}]]);
			createLucideIcon("donut", [["path", {
				d: "M20.5 10a2.5 2.5 0 0 1-2.4-3H18a2.95 2.95 0 0 1-2.6-4.4 10 10 0 1 0 6.3 7.1c-.3.2-.8.3-1.2.3",
				key: "19sr3x"
			}], ["circle", {
				cx: "12",
				cy: "12",
				r: "3",
				key: "1v7zrd"
			}]]);
			createLucideIcon("dog", [
				["path", {
					d: "M11.25 16.25h1.5L12 17z",
					key: "w7jh35"
				}],
				["path", {
					d: "M16 14v.5",
					key: "1lajdz"
				}],
				["path", {
					d: "M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a11.702 11.702 0 0 0-.493-3.309",
					key: "u7s9ue"
				}],
				["path", {
					d: "M8 14v.5",
					key: "1nzgdb"
				}],
				["path", {
					d: "M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235A7.497 7.497 0 0 1 14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5",
					key: "v8hric"
				}]
			]);
			createLucideIcon("door-closed-locked", [
				["path", {
					d: "M10 12h.01",
					key: "1kxr2c"
				}],
				["path", {
					d: "M18 9V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14",
					key: "1bnhmg"
				}],
				["path", {
					d: "M2 20h8",
					key: "10ntw1"
				}],
				["path", {
					d: "M20 17v-2a2 2 0 1 0-4 0v2",
					key: "pwaxnr"
				}],
				["rect", {
					x: "14",
					y: "17",
					width: "8",
					height: "5",
					rx: "1",
					key: "15pjcy"
				}]
			]);
			createLucideIcon("door-closed", [
				["path", {
					d: "M10 12h.01",
					key: "1kxr2c"
				}],
				["path", {
					d: "M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14",
					key: "36qu9e"
				}],
				["path", {
					d: "M2 20h20",
					key: "owomy5"
				}]
			]);
			createLucideIcon("door-open", [
				["path", {
					d: "M11 20H2",
					key: "nlcfvz"
				}],
				["path", {
					d: "M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z",
					key: "au4z13"
				}],
				["path", {
					d: "M11 4H8a2 2 0 0 0-2 2v14",
					key: "74r1mk"
				}],
				["path", {
					d: "M14 12h.01",
					key: "1jfl7z"
				}],
				["path", {
					d: "M22 20h-3",
					key: "vhrsz"
				}]
			]);
			createLucideIcon("dot", [["circle", {
				cx: "12",
				cy: "12",
				r: "1",
				key: "41hilf"
			}]]);
			createLucideIcon("download", [
				["path", {
					d: "M12 15V3",
					key: "m9g1x1"
				}],
				["path", {
					d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
					key: "ih7n3h"
				}],
				["path", {
					d: "m7 10 5 5 5-5",
					key: "brsn70"
				}]
			]);
			createLucideIcon("drama", [
				["path", {
					d: "M10 11h.01",
					key: "d2at3l"
				}],
				["path", {
					d: "M14 6h.01",
					key: "k028ub"
				}],
				["path", {
					d: "M18 6h.01",
					key: "1v4wsw"
				}],
				["path", {
					d: "M6.5 13.1h.01",
					key: "1748ia"
				}],
				["path", {
					d: "M22 5c0 9-4 12-6 12s-6-3-6-12c0-2 2-3 6-3s6 1 6 3",
					key: "172yzv"
				}],
				["path", {
					d: "M17.4 9.9c-.8.8-2 .8-2.8 0",
					key: "1obv0w"
				}],
				["path", {
					d: "M10.1 7.1C9 7.2 7.7 7.7 6 8.6c-3.5 2-4.7 3.9-3.7 5.6 4.5 7.8 9.5 8.4 11.2 7.4.9-.5 1.9-2.1 1.9-4.7",
					key: "rqjl8i"
				}],
				["path", {
					d: "M9.1 16.5c.3-1.1 1.4-1.7 2.4-1.4",
					key: "1mr6wy"
				}]
			]);
			createLucideIcon("drafting-compass", [
				["path", {
					d: "m12.99 6.74 1.93 3.44",
					key: "iwagvd"
				}],
				["path", {
					d: "M19.136 12a10 10 0 0 1-14.271 0",
					key: "ppmlo4"
				}],
				["path", {
					d: "m21 21-2.16-3.84",
					key: "vylbct"
				}],
				["path", {
					d: "m3 21 8.02-14.26",
					key: "1ssaw4"
				}],
				["circle", {
					cx: "12",
					cy: "5",
					r: "2",
					key: "f1ur92"
				}]
			]);
			createLucideIcon("drill", [
				["path", {
					d: "M10 18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a3 3 0 0 1-3-3 1 1 0 0 1 1-1z",
					key: "ioqxb1"
				}],
				["path", {
					d: "M13 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1l-.81 3.242a1 1 0 0 1-.97.758H8",
					key: "1rs59n"
				}],
				["path", {
					d: "M14 4h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-3",
					key: "105ega"
				}],
				["path", {
					d: "M18 6h4",
					key: "66u95g"
				}],
				["path", {
					d: "m5 10-2 8",
					key: "xt2lic"
				}],
				["path", {
					d: "m7 18 2-8",
					key: "1bzku2"
				}]
			]);
			createLucideIcon("drone", [
				["path", {
					d: "M10 10 7 7",
					key: "zp14k7"
				}],
				["path", {
					d: "m10 14-3 3",
					key: "1jrpxk"
				}],
				["path", {
					d: "m14 10 3-3",
					key: "7tigam"
				}],
				["path", {
					d: "m14 14 3 3",
					key: "vm23p3"
				}],
				["path", {
					d: "M14.205 4.139a4 4 0 1 1 5.439 5.863",
					key: "1tm5p2"
				}],
				["path", {
					d: "M19.637 14a4 4 0 1 1-5.432 5.868",
					key: "16egi2"
				}],
				["path", {
					d: "M4.367 10a4 4 0 1 1 5.438-5.862",
					key: "1wta6a"
				}],
				["path", {
					d: "M9.795 19.862a4 4 0 1 1-5.429-5.873",
					key: "q39hpv"
				}],
				["rect", {
					x: "10",
					y: "8",
					width: "4",
					height: "8",
					rx: "1",
					key: "phrjt1"
				}]
			]);
			createLucideIcon("droplet-off", [
				["path", {
					d: "M18.715 13.186C18.29 11.858 17.384 10.607 16 9.5c-2-1.6-3.5-4-4-6.5a10.7 10.7 0 0 1-.884 2.586",
					key: "8suz2t"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M8.795 8.797A11 11 0 0 1 8 9.5C6 11.1 5 13 5 15a7 7 0 0 0 13.222 3.208",
					key: "19dw9m"
				}]
			]);
			createLucideIcon("droplet", [["path", {
				d: "M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z",
				key: "c7niix"
			}]]);
			createLucideIcon("droplets", [["path", {
				d: "M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z",
				key: "1ptgy4"
			}], ["path", {
				d: "M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97",
				key: "1sl1rz"
			}]]);
			createLucideIcon("drum", [
				["path", {
					d: "m2 2 8 8",
					key: "1v6059"
				}],
				["path", {
					d: "m22 2-8 8",
					key: "173r8a"
				}],
				["ellipse", {
					cx: "12",
					cy: "9",
					rx: "10",
					ry: "5",
					key: "liohsx"
				}],
				["path", {
					d: "M7 13.4v7.9",
					key: "1yi6u9"
				}],
				["path", {
					d: "M12 14v8",
					key: "1tn2tj"
				}],
				["path", {
					d: "M17 13.4v7.9",
					key: "eqz2v3"
				}],
				["path", {
					d: "M2 9v8a10 5 0 0 0 20 0V9",
					key: "1750ul"
				}]
			]);
			createLucideIcon("drumstick", [["path", {
				d: "M15.4 15.63a7.875 6 135 1 1 6.23-6.23 4.5 3.43 135 0 0-6.23 6.23",
				key: "1dtqwm"
			}], ["path", {
				d: "m8.29 12.71-2.6 2.6a2.5 2.5 0 1 0-1.65 4.65A2.5 2.5 0 1 0 8.7 18.3l2.59-2.59",
				key: "1oq1fw"
			}]]);
			createLucideIcon("dumbbell", [
				["path", {
					d: "M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z",
					key: "9m4mmf"
				}],
				["path", {
					d: "m2.5 21.5 1.4-1.4",
					key: "17g3f0"
				}],
				["path", {
					d: "m20.1 3.9 1.4-1.4",
					key: "1qn309"
				}],
				["path", {
					d: "M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z",
					key: "1t2c92"
				}],
				["path", {
					d: "m9.6 14.4 4.8-4.8",
					key: "6umqxw"
				}]
			]);
			createLucideIcon("ear-off", [
				["path", {
					d: "M6 18.5a3.5 3.5 0 1 0 7 0c0-1.57.92-2.52 2.04-3.46",
					key: "1qngmn"
				}],
				["path", {
					d: "M6 8.5c0-.75.13-1.47.36-2.14",
					key: "b06bma"
				}],
				["path", {
					d: "M8.8 3.15A6.5 6.5 0 0 1 19 8.5c0 1.63-.44 2.81-1.09 3.76",
					key: "g10hsz"
				}],
				["path", {
					d: "M12.5 6A2.5 2.5 0 0 1 15 8.5M10 13a2 2 0 0 0 1.82-1.18",
					key: "ygzou7"
				}],
				["line", {
					x1: "2",
					x2: "22",
					y1: "2",
					y2: "22",
					key: "a6p6uj"
				}]
			]);
			createLucideIcon("ear", [["path", {
				d: "M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0",
				key: "1dfaln"
			}], ["path", {
				d: "M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4",
				key: "1qnva7"
			}]]);
			createLucideIcon("earth-lock", [
				["path", {
					d: "M7 3.34V5a3 3 0 0 0 3 3",
					key: "w732o8"
				}],
				["path", {
					d: "M11 21.95V18a2 2 0 0 0-2-2 2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05",
					key: "f02343"
				}],
				["path", {
					d: "M21.54 15H17a2 2 0 0 0-2 2v4.54",
					key: "1djwo0"
				}],
				["path", {
					d: "M12 2a10 10 0 1 0 9.54 13",
					key: "zjsr6q"
				}],
				["path", {
					d: "M20 6V4a2 2 0 1 0-4 0v2",
					key: "1of5e8"
				}],
				["rect", {
					width: "8",
					height: "5",
					x: "14",
					y: "6",
					rx: "1",
					key: "1fmf51"
				}]
			]);
			createLucideIcon("eclipse", [["circle", {
				cx: "12",
				cy: "12",
				r: "10",
				key: "1mglay"
			}], ["path", {
				d: "M12 2a7 7 0 1 0 10 10",
				key: "1yuj32"
			}]]);
			createLucideIcon("earth", [
				["path", {
					d: "M21.54 15H17a2 2 0 0 0-2 2v4.54",
					key: "1djwo0"
				}],
				["path", {
					d: "M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17",
					key: "1tzkfa"
				}],
				["path", {
					d: "M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05",
					key: "14pb5j"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}]
			]);
			createLucideIcon("egg-fried", [["circle", {
				cx: "11.5",
				cy: "12.5",
				r: "3.5",
				key: "1cl1mi"
			}], ["path", {
				d: "M3 8c0-3.5 2.5-6 6.5-6 5 0 4.83 3 7.5 5s5 2 5 6c0 4.5-2.5 6.5-7 6.5-2.5 0-2.5 2.5-6 2.5s-7-2-7-5.5c0-3 1.5-3 1.5-5C3.5 10 3 9 3 8Z",
				key: "165ef9"
			}]]);
			createLucideIcon("egg-off", [
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M20 14.347V14c0-6-4-12-8-12-1.078 0-2.157.436-3.157 1.19",
					key: "13g2jy"
				}],
				["path", {
					d: "M6.206 6.21C4.871 8.4 4 11.2 4 14a8 8 0 0 0 14.568 4.568",
					key: "1581id"
				}]
			]);
			createLucideIcon("egg", [["path", {
				d: "M12 2C8 2 4 8 4 14a8 8 0 0 0 16 0c0-6-4-12-8-12",
				key: "1le142"
			}]]);
			createLucideIcon("ellipse", [["ellipse", {
				cx: "12",
				cy: "12",
				rx: "10",
				ry: "6",
				key: "swdkt4"
			}]]);
			createLucideIcon("eject", [["path", {
				d: "M4 13a1 1 0 0 1-.72-1.695l7.257-7.668a2 2 0 0 1 2.926 0l7.256 7.668A1 1 0 0 1 20 13z",
				key: "ua5u6w"
			}], ["rect", {
				x: "3",
				y: "17",
				width: "18",
				height: "4",
				rx: "1",
				key: "kj6cfs"
			}]]);
			createLucideIcon("ellipsis-vertical", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "1",
					key: "41hilf"
				}],
				["circle", {
					cx: "12",
					cy: "5",
					r: "1",
					key: "gxeob9"
				}],
				["circle", {
					cx: "12",
					cy: "19",
					r: "1",
					key: "lyex9k"
				}]
			]);
			createLucideIcon("ellipsis", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "1",
					key: "41hilf"
				}],
				["circle", {
					cx: "19",
					cy: "12",
					r: "1",
					key: "1wjl8i"
				}],
				["circle", {
					cx: "5",
					cy: "12",
					r: "1",
					key: "1pcz8c"
				}]
			]);
			createLucideIcon("equal-approximately", [["path", {
				d: "M5 15a6.5 6.5 0 0 1 7 0 6.5 6.5 0 0 0 7 0",
				key: "yrdkhy"
			}], ["path", {
				d: "M5 9a6.5 6.5 0 0 1 7 0 6.5 6.5 0 0 0 7 0",
				key: "gzkvyz"
			}]]);
			createLucideIcon("equal-not", [
				["line", {
					x1: "5",
					x2: "19",
					y1: "9",
					y2: "9",
					key: "1nwqeh"
				}],
				["line", {
					x1: "5",
					x2: "19",
					y1: "15",
					y2: "15",
					key: "g8yjpy"
				}],
				["line", {
					x1: "19",
					x2: "5",
					y1: "5",
					y2: "19",
					key: "1x9vlm"
				}]
			]);
			createLucideIcon("equal", [["line", {
				x1: "5",
				x2: "19",
				y1: "9",
				y2: "9",
				key: "1nwqeh"
			}], ["line", {
				x1: "5",
				x2: "19",
				y1: "15",
				y2: "15",
				key: "g8yjpy"
			}]]);
			createLucideIcon("ethernet-port", [
				["path", {
					d: "M10 8v1",
					key: "1talb4"
				}],
				["path", {
					d: "M14 8v1",
					key: "1rsfgr"
				}],
				["path", {
					d: "M18 8v1",
					key: "gnkwox"
				}],
				["path", {
					d: "M19 17a2 2 0 00-1.765 1.059l-.47.882A2 2 0 0115 20H9a2 2 0 01-1.765-1.059l-.47-.882A2 2 0 005 17H4a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v9a2 2 0 01-2 2z",
					key: "v5qa57"
				}],
				["path", {
					d: "M6 8v1",
					key: "1636ez"
				}]
			]);
			createLucideIcon("euro", [
				["path", {
					d: "M4 10h12",
					key: "1y6xl8"
				}],
				["path", {
					d: "M4 14h9",
					key: "1loblj"
				}],
				["path", {
					d: "M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2",
					key: "1j6lzo"
				}]
			]);
			createLucideIcon("ev-charger", [
				["path", {
					d: "M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-6.998a2 2 0 0 0-.59-1.42L18 5",
					key: "1wtuz0"
				}],
				["path", {
					d: "M14 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16",
					key: "e09ifn"
				}],
				["path", {
					d: "M2 21h13",
					key: "1x0fut"
				}],
				["path", {
					d: "M3 7h11",
					key: "19efrr"
				}],
				["path", {
					d: "m9 11-2 3h3l-2 3",
					key: "lmzxi1"
				}]
			]);
			createLucideIcon("eraser", [["path", {
				d: "M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21",
				key: "g5wo59"
			}], ["path", {
				d: "m5.082 11.09 8.828 8.828",
				key: "1wx5vj"
			}]]);
			createLucideIcon("external-link", [
				["path", {
					d: "M15 3h6v6",
					key: "1q9fwt"
				}],
				["path", {
					d: "M10 14 21 3",
					key: "gplh6r"
				}],
				["path", {
					d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
					key: "a6xqqp"
				}]
			]);
			createLucideIcon("expand", [
				["path", {
					d: "m15 15 6 6",
					key: "1s409w"
				}],
				["path", {
					d: "m15 9 6-6",
					key: "ko1vev"
				}],
				["path", {
					d: "M21 16v5h-5",
					key: "1ck2sf"
				}],
				["path", {
					d: "M21 8V3h-5",
					key: "1qoq8a"
				}],
				["path", {
					d: "M3 16v5h5",
					key: "1t08am"
				}],
				["path", {
					d: "m3 21 6-6",
					key: "wwnumi"
				}],
				["path", {
					d: "M3 8V3h5",
					key: "1ln10m"
				}],
				["path", {
					d: "M9 9 3 3",
					key: "v551iv"
				}]
			]);
			createLucideIcon("eye-closed", [
				["path", {
					d: "m15 18-.722-3.25",
					key: "1j64jw"
				}],
				["path", {
					d: "M2 8a10.645 10.645 0 0 0 20 0",
					key: "1e7gxb"
				}],
				["path", {
					d: "m20 15-1.726-2.05",
					key: "1cnuld"
				}],
				["path", {
					d: "m4 15 1.726-2.05",
					key: "1dsqqd"
				}],
				["path", {
					d: "m9 18 .722-3.25",
					key: "ypw2yx"
				}]
			]);
			createLucideIcon("eye-dashed", [
				["path", {
					d: "M13.054 18.946a11 11 0 0 1-2.11 0",
					key: "1lgjj0"
				}],
				["path", {
					d: "M13.054 5.054a11 11 0 0 0-2.11-.001",
					key: "f7voaa"
				}],
				["path", {
					d: "M17.072 6.274a11 11 0 0 1 1.753 1.173",
					key: "1rga24"
				}],
				["path", {
					d: "M18.825 16.552a11 11 0 0 1-1.753 1.174",
					key: "jfvai2"
				}],
				["path", {
					d: "M2.514 13.303a11 11 0 0 1-.452-.954 1 1 0 0 1 0-.697 11 11 0 0 1 .45-.955",
					key: "1deed4"
				}],
				["path", {
					d: "M21.485 10.697a11 11 0 0 1 .453.955 1 1 0 0 1 0 .697 11 11 0 0 1-.453.954",
					key: "1k4xil"
				}],
				["path", {
					d: "M5.173 7.448a11 11 0 0 1 1.753-1.174",
					key: "mwd8rq"
				}],
				["path", {
					d: "M6.926 17.726a11 11 0 0 1-1.753-1.174",
					key: "15rpim"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "3",
					key: "1v7zrd"
				}]
			]);
			createLucideIcon("eye", [["path", {
				d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
				key: "1nclc0"
			}], ["circle", {
				cx: "12",
				cy: "12",
				r: "3",
				key: "1v7zrd"
			}]]);
			createLucideIcon("face-angry", [
				["path", {
					d: "M15 12v-1.584",
					key: "1md67h"
				}],
				["path", {
					d: "M17 10a5 5 0 00-3 1",
					key: "1dqs4m"
				}],
				["path", {
					d: "M7 10a5 5 0 013 1",
					key: "1okmnq"
				}],
				["path", {
					d: "M9 12v-1.584",
					key: "cfo04w"
				}],
				["path", {
					d: "M9 17a5 5 0 016.001 0",
					key: "ipdrmp"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}]
			]);
			createLucideIcon("eye-off", [
				["path", {
					d: "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",
					key: "ct8e1f"
				}],
				["path", {
					d: "M14.084 14.158a3 3 0 0 1-4.242-4.242",
					key: "151rxh"
				}],
				["path", {
					d: "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",
					key: "13bj9a"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}]
			]);
			createLucideIcon("face-expressionless", [
				["path", {
					d: "M14 10h2",
					key: "1lstlu"
				}],
				["path", {
					d: "M8 10h2",
					key: "66od0"
				}],
				["path", {
					d: "M8 16h8",
					key: "10ke2u"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}]
			]);
			createLucideIcon("face-grinning", [
				["path", {
					d: "M15 10V9",
					key: "4dkmfx"
				}],
				["path", {
					d: "M7.084 14.302a5.12 5.12 0 009.833 0 .24.24 0 00-.235-.302H7.32a.24.24 0 00-.235.302",
					key: "1ad3z7"
				}],
				["path", {
					d: "M9 10V9",
					key: "1lazqi"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}]
			]);
			createLucideIcon("face-neutral", [
				["path", {
					d: "M15 10V9",
					key: "4dkmfx"
				}],
				["path", {
					d: "M8 16h8",
					key: "10ke2u"
				}],
				["path", {
					d: "M9 10V9",
					key: "1lazqi"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}]
			]);
			createLucideIcon("face-slightly-smiling-plus", [
				["path", {
					d: "M13.267 2.08a10 10 0 108.653 8.653",
					key: "1wbpyh"
				}],
				["path", {
					d: "M15 10V9",
					key: "4dkmfx"
				}],
				["path", {
					d: "M16 5h6",
					key: "1vod17"
				}],
				["path", {
					d: "M16.472 15a6 6 0 01-8.943 0",
					key: "7qomzy"
				}],
				["path", {
					d: "M19 2v6",
					key: "4bpg5p"
				}],
				["path", {
					d: "M9 10V9",
					key: "1lazqi"
				}]
			]);
			createLucideIcon("face-slightly-frowning", [
				["path", {
					d: "M15 10V9",
					key: "4dkmfx"
				}],
				["path", {
					d: "M9 10V9",
					key: "1lazqi"
				}],
				["path", {
					d: "M9 16a5 5 0 016 0",
					key: "34mdxb"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}]
			]);
			createLucideIcon("face-slightly-smiling", [
				["path", {
					d: "M15 10V9",
					key: "4dkmfx"
				}],
				["path", {
					d: "M16.472 15a6 6 0 01-8.943 0",
					key: "7qomzy"
				}],
				["path", {
					d: "M9 10V9",
					key: "1lazqi"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}]
			]);
			createLucideIcon("factory", [
				["path", {
					d: "M12 16h.01",
					key: "1drbdi"
				}],
				["path", {
					d: "M16 16h.01",
					key: "1f9h7w"
				}],
				["path", {
					d: "M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a.5.5 0 0 0-.769-.422l-4.462 2.844A.5.5 0 0 1 15 10.5v-2a.5.5 0 0 0-.769-.422L9.77 10.922A.5.5 0 0 1 9 10.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z",
					key: "1iv0i2"
				}],
				["path", {
					d: "M8 16h.01",
					key: "18s6g9"
				}]
			]);
			createLucideIcon("fan", [["path", {
				d: "M10.827 16.379a6.082 6.082 0 0 1-8.618-7.002l5.412 1.45a6.082 6.082 0 0 1 7.002-8.618l-1.45 5.412a6.082 6.082 0 0 1 8.618 7.002l-5.412-1.45a6.082 6.082 0 0 1-7.002 8.618l1.45-5.412Z",
				key: "484a7f"
			}], ["path", {
				d: "M12 12v.01",
				key: "u5ubse"
			}]]);
			createLucideIcon("feather", [
				["path", {
					d: "M14.086 18.412A2 2 0 0112.67 19H5v-7.672a2 2 0 01.586-1.414L11.75 3.75a6 6 0 118.49 8.49z",
					key: "1nq9jb"
				}],
				["path", {
					d: "M16 8 2 22",
					key: "vp34q"
				}],
				["path", {
					d: "M17.488 15H9",
					key: "16yirz"
				}]
			]);
			createLucideIcon("fast-forward", [["path", {
				d: "M12 6a2 2 0 0 1 3.414-1.414l6 6a2 2 0 0 1 0 2.828l-6 6A2 2 0 0 1 12 18z",
				key: "b19h5q"
			}], ["path", {
				d: "M2 6a2 2 0 0 1 3.414-1.414l6 6a2 2 0 0 1 0 2.828l-6 6A2 2 0 0 1 2 18z",
				key: "h7h5ge"
			}]]);
			createLucideIcon("fence", [
				["path", {
					d: "M4 3 2 5v15c0 .6.4 1 1 1h2c.6 0 1-.4 1-1V5Z",
					key: "1n2rgs"
				}],
				["path", {
					d: "M6 8h4",
					key: "utf9t1"
				}],
				["path", {
					d: "M6 18h4",
					key: "12yh4b"
				}],
				["path", {
					d: "m12 3-2 2v15c0 .6.4 1 1 1h2c.6 0 1-.4 1-1V5Z",
					key: "3ha7mj"
				}],
				["path", {
					d: "M14 8h4",
					key: "1r8wg2"
				}],
				["path", {
					d: "M14 18h4",
					key: "1t3kbu"
				}],
				["path", {
					d: "m20 3-2 2v15c0 .6.4 1 1 1h2c.6 0 1-.4 1-1V5Z",
					key: "dfd4e2"
				}]
			]);
			createLucideIcon("ferris-wheel", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "2",
					key: "1c9p78"
				}],
				["path", {
					d: "M12 2v4",
					key: "3427ic"
				}],
				["path", {
					d: "m6.8 15-3.5 2",
					key: "hjy98k"
				}],
				["path", {
					d: "m20.7 7-3.5 2",
					key: "f08gto"
				}],
				["path", {
					d: "M6.8 9 3.3 7",
					key: "1aevh4"
				}],
				["path", {
					d: "m20.7 17-3.5-2",
					key: "1liqo3"
				}],
				["path", {
					d: "m9 22 3-8 3 8",
					key: "wees03"
				}],
				["path", {
					d: "M8 22h8",
					key: "rmew8v"
				}],
				["path", {
					d: "M18 18.7a9 9 0 1 0-12 0",
					key: "dhzg4g"
				}]
			]);
			createLucideIcon("file-archive", [
				["path", {
					d: "M13.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v11.5",
					key: "4pqfef"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M8 12v-1",
					key: "1ej8lb"
				}],
				["path", {
					d: "M8 18v-2",
					key: "qcmpov"
				}],
				["path", {
					d: "M8 7V6",
					key: "1nbb54"
				}],
				["circle", {
					cx: "8",
					cy: "20",
					r: "2",
					key: "ckkr5m"
				}]
			]);
			createLucideIcon("file-axis-3d", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "m8 18 4-4",
					key: "12zab0"
				}],
				["path", {
					d: "M8 10v8h8",
					key: "tlaukw"
				}]
			]);
			createLucideIcon("file-badge", [
				["path", {
					d: "M13 22h5a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v3.3",
					key: "cvl1xm"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "m7.69 16.479 1.29 4.88a.5.5 0 0 1-.698.591l-1.843-.849a1 1 0 0 0-.879.001l-1.846.85a.5.5 0 0 1-.692-.593l1.29-4.88",
					key: "1ff7gj"
				}],
				["circle", {
					cx: "6",
					cy: "14",
					r: "3",
					key: "a1xfv6"
				}]
			]);
			createLucideIcon("file-box", [
				["path", {
					d: "M14 2v5a1 1 0 001 1h5",
					key: "9v5fu7"
				}],
				["path", {
					d: "M14.692 22H18a2 2 0 002-2V8a2.4 2.4 0 00-.706-1.706l-3.588-3.588A2.4 2.4 0 0014 2H6a2 2 0 00-2 2v3.804",
					key: "1ne0j7"
				}],
				["path", {
					d: "M2.264 13.752 7 16.5l4.737-2.748",
					key: "t73mg3"
				}],
				["path", {
					d: "M2.995 13.014A2 2 0 002 14.744v3.516a2 2 0 00.996 1.73l3 1.74a2 2 0 002.008 0l3-1.74A2 2 0 0012 18.26v-3.517a2 2 0 00-.995-1.73l-3-1.742a2 2 0 00-1.892-.064z",
					key: "h4qck"
				}],
				["path", {
					d: "M7 16.5V22",
					key: "1i1gou"
				}]
			]);
			createLucideIcon("file-braces", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1",
					key: "1oajmo"
				}],
				["path", {
					d: "M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1",
					key: "mpwhp6"
				}]
			]);
			createLucideIcon("file-braces-corner", [
				["path", {
					d: "M14 22h4a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v6",
					key: "14cnrg"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M5 14a1 1 0 0 0-1 1v2a1 1 0 0 1-1 1 1 1 0 0 1 1 1v2a1 1 0 0 0 1 1",
					key: "sr0ebq"
				}],
				["path", {
					d: "M9 22a1 1 0 0 0 1-1v-2a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-2a1 1 0 0 0-1-1",
					key: "w793db"
				}]
			]);
			createLucideIcon("file-chart-column-increasing", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M8 18v-2",
					key: "qcmpov"
				}],
				["path", {
					d: "M12 18v-4",
					key: "q1q25u"
				}],
				["path", {
					d: "M16 18v-6",
					key: "15y0np"
				}]
			]);
			createLucideIcon("file-chart-column", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M8 18v-1",
					key: "zg0ygc"
				}],
				["path", {
					d: "M12 18v-6",
					key: "17g6i2"
				}],
				["path", {
					d: "M16 18v-3",
					key: "j5jt4h"
				}]
			]);
			createLucideIcon("file-chart-pie", [
				["path", {
					d: "M15.941 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.704l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v3.512",
					key: "13hoie"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M4.017 11.512a6 6 0 1 0 8.466 8.475",
					key: "s6vs5t"
				}],
				["path", {
					d: "M9 16a1 1 0 0 1-1-1v-4c0-.552.45-1.008.995-.917a6 6 0 0 1 4.922 4.922c.091.544-.365.995-.917.995z",
					key: "1dl6s6"
				}]
			]);
			createLucideIcon("file-chart-line", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "m16 13-3.5 3.5-2-2L8 17",
					key: "zz7yod"
				}]
			]);
			createLucideIcon("file-check-corner", [
				["path", {
					d: "M10.5 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v6",
					key: "g5mvt7"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "m14 20 2 2 4-4",
					key: "15kota"
				}]
			]);
			createLucideIcon("file-check", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "m9 15 2 2 4-4",
					key: "1grp1n"
				}]
			]);
			createLucideIcon("file-clock", [
				["path", {
					d: "M16 22h2a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v2.85",
					key: "ryk6xj"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M8 14v2.2l1.6 1",
					key: "6m4bie"
				}],
				["circle", {
					cx: "8",
					cy: "16",
					r: "6",
					key: "10v15b"
				}]
			]);
			createLucideIcon("file-code-corner", [
				["path", {
					d: "M4 12.15V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3.35",
					key: "1wthlu"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "m5 16-3 3 3 3",
					key: "331omg"
				}],
				["path", {
					d: "m9 22 3-3-3-3",
					key: "lsp7cz"
				}]
			]);
			createLucideIcon("file-code", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M10 12.5 8 15l2 2.5",
					key: "1tg20x"
				}],
				["path", {
					d: "m14 12.5 2 2.5-2 2.5",
					key: "yinavb"
				}]
			]);
			createLucideIcon("file-cog", [
				["path", {
					d: "M15 8a1 1 0 0 1-1-1V2a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8z",
					key: "1ckgky"
				}],
				["path", {
					d: "M20 8v12a2 2 0 0 1-2 2h-4.182",
					key: "1726p0"
				}],
				["path", {
					d: "m3.305 19.53.923-.382",
					key: "ao1pio"
				}],
				["path", {
					d: "M4 10.592V4a2 2 0 0 1 2-2h8",
					key: "1foop0"
				}],
				["path", {
					d: "m4.228 16.852-.924-.383",
					key: "1fv9zy"
				}],
				["path", {
					d: "m5.852 15.228-.383-.923",
					key: "1a9hc2"
				}],
				["path", {
					d: "m5.852 20.772-.383.924",
					key: "1sh9ke"
				}],
				["path", {
					d: "m8.148 15.228.383-.923",
					key: "4yu6lf"
				}],
				["path", {
					d: "m8.53 21.696-.382-.924",
					key: "18b0s9"
				}],
				["path", {
					d: "m9.773 16.852.922-.383",
					key: "ti6xop"
				}],
				["path", {
					d: "m9.773 19.148.922.383",
					key: "rws47d"
				}],
				["circle", {
					cx: "7",
					cy: "18",
					r: "3",
					key: "lvkj7j"
				}]
			]);
			createLucideIcon("file-diff", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M9 10h6",
					key: "9gxzsh"
				}],
				["path", {
					d: "M12 13V7",
					key: "h0r20n"
				}],
				["path", {
					d: "M9 17h6",
					key: "r8uit2"
				}]
			]);
			createLucideIcon("file-digit", [
				["path", {
					d: "M4 12V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2",
					key: "jrl274"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M10 16h2v6",
					key: "1bxocy"
				}],
				["path", {
					d: "M10 22h4",
					key: "ceow96"
				}],
				["rect", {
					x: "2",
					y: "16",
					width: "4",
					height: "6",
					rx: "2",
					key: "r45zd0"
				}]
			]);
			createLucideIcon("file-down", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M12 18v-6",
					key: "17g6i2"
				}],
				["path", {
					d: "m9 15 3 3 3-3",
					key: "1npd3o"
				}]
			]);
			createLucideIcon("file-headphone", [
				["path", {
					d: "M4 6.835V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-.343",
					key: "1vfytu"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M2 19a2 2 0 0 1 4 0v1a2 2 0 0 1-4 0v-4a6 6 0 0 1 12 0v4a2 2 0 0 1-4 0v-1a2 2 0 0 1 4 0",
					key: "1etmh7"
				}]
			]);
			createLucideIcon("file-exclamation-point", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M12 9v4",
					key: "juzpu7"
				}],
				["path", {
					d: "M12 17h.01",
					key: "p32p05"
				}]
			]);
			createLucideIcon("file-image", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["circle", {
					cx: "10",
					cy: "12",
					r: "2",
					key: "737tya"
				}],
				["path", {
					d: "m20 17-1.296-1.296a2.41 2.41 0 0 0-3.408 0L9 22",
					key: "wt3hpn"
				}]
			]);
			createLucideIcon("file-heart", [
				["path", {
					d: "M13 22h5a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v7",
					key: "oagw2b"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M3.62 18.8A2.25 2.25 0 1 1 7 15.836a2.25 2.25 0 1 1 3.38 2.966l-2.626 2.856a1 1 0 0 1-1.507 0z",
					key: "rg3psg"
				}]
			]);
			createLucideIcon("file-input", [
				["path", {
					d: "M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1",
					key: "1q9hii"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M2 15h10",
					key: "jfw4w8"
				}],
				["path", {
					d: "m9 18 3-3-3-3",
					key: "112psh"
				}]
			]);
			createLucideIcon("file-key", [
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M4 12v6",
					key: "bg1pfk"
				}],
				["path", {
					d: "M4 14h2",
					key: "1sf9f8"
				}],
				["path", {
					d: "M9.65 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v4",
					key: "d56i0q"
				}],
				["circle", {
					cx: "4",
					cy: "20",
					r: "2",
					key: "6kqj1y"
				}]
			]);
			createLucideIcon("file-minus-corner", [
				["path", {
					d: "M20 14V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12",
					key: "l9p8hp"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M14 18h6",
					key: "1m8k6r"
				}]
			]);
			createLucideIcon("file-minus", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M9 15h6",
					key: "cctwl0"
				}]
			]);
			createLucideIcon("file-lock", [
				["path", {
					d: "M4 9.8V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3",
					key: "1432pc"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M9 17v-2a2 2 0 0 0-4 0v2",
					key: "168m41"
				}],
				["rect", {
					width: "8",
					height: "5",
					x: "3",
					y: "17",
					rx: "1",
					key: "o8vfew"
				}]
			]);
			createLucideIcon("file-output", [
				["path", {
					d: "M4.226 20.925A2 2 0 0 0 6 22h12a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v3.127",
					key: "wfxp4w"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "m5 11-3 3",
					key: "1dgrs4"
				}],
				["path", {
					d: "m5 17-3-3h10",
					key: "1mvvaf"
				}]
			]);
			createLucideIcon("file-music", [
				["path", {
					d: "M11.65 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v10.35",
					key: "5ad7z2"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M8 20v-7l3 1.474",
					key: "1ggyb9"
				}],
				["circle", {
					cx: "6",
					cy: "20",
					r: "2",
					key: "j7wjp0"
				}]
			]);
			const FilePenLine = createLucideIcon("file-pen-line", [
				["path", {
					d: "M14.364 13.634a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506l4.013-4.009a1 1 0 0 0-3.004-3.004z",
					key: "ukzhwg"
				}],
				["path", {
					d: "M14.487 7.858A1 1 0 0 1 14 7V2",
					key: "1klhew"
				}],
				["path", {
					d: "M20 19.645V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l2.516 2.516",
					key: "rxaxab"
				}],
				["path", {
					d: "M8 18h1",
					key: "13wk12"
				}]
			]);
			createLucideIcon("file-play", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M15.033 13.44a.647.647 0 0 1 0 1.12l-4.065 2.352a.645.645 0 0 1-.968-.56v-4.704a.645.645 0 0 1 .967-.56z",
					key: "1tzo1f"
				}]
			]);
			createLucideIcon("file-pen", [
				["path", {
					d: "M12.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v9.34",
					key: "o6klzx"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M10.378 12.622a1 1 0 0 1 3 3.003L8.36 20.637a2 2 0 0 1-.854.506l-2.867.837a.5.5 0 0 1-.62-.62l.836-2.869a2 2 0 0 1 .506-.853z",
					key: "zhnas1"
				}]
			]);
			createLucideIcon("file-plus", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M9 15h6",
					key: "cctwl0"
				}],
				["path", {
					d: "M12 18v-6",
					key: "17g6i2"
				}]
			]);
			createLucideIcon("file-plus-corner", [
				["path", {
					d: "M11.35 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v5.35",
					key: "17jvcc"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M14 19h6",
					key: "bvotb8"
				}],
				["path", {
					d: "M17 16v6",
					key: "18yu1i"
				}]
			]);
			createLucideIcon("file-question-mark", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M12 17h.01",
					key: "p32p05"
				}],
				["path", {
					d: "M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3",
					key: "mhlwft"
				}]
			]);
			createLucideIcon("file-scan", [
				["path", {
					d: "M20 10V8a2.4 2.4 0 0 0-.706-1.704l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h4.35",
					key: "1cdjst"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M16 14a2 2 0 0 0-2 2",
					key: "ceaadl"
				}],
				["path", {
					d: "M16 22a2 2 0 0 1-2-2",
					key: "1wqh5n"
				}],
				["path", {
					d: "M20 14a2 2 0 0 1 2 2",
					key: "1ny6zw"
				}],
				["path", {
					d: "M20 22a2 2 0 0 0 2-2",
					key: "1l9q4k"
				}]
			]);
			createLucideIcon("file-search-corner", [
				["path", {
					d: "M11.1 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.589 3.588A2.4 2.4 0 0 1 20 8v3.25",
					key: "uh4ikj"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "m21 22-2.88-2.88",
					key: "9dd25w"
				}],
				["circle", {
					cx: "16",
					cy: "17",
					r: "3",
					key: "11br10"
				}]
			]);
			createLucideIcon("file-search", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["circle", {
					cx: "11.5",
					cy: "14.5",
					r: "2.5",
					key: "1bq0ko"
				}],
				["path", {
					d: "M13.3 16.3 15 18",
					key: "2quom7"
				}]
			]);
			createLucideIcon("file-signal", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M8 15h.01",
					key: "a7atzg"
				}],
				["path", {
					d: "M11.5 13.5a2.5 2.5 0 0 1 0 3",
					key: "1fccat"
				}],
				["path", {
					d: "M15 12a5 5 0 0 1 0 6",
					key: "ps46cm"
				}]
			]);
			createLucideIcon("file-sliders", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M8 12h8",
					key: "1wcyev"
				}],
				["path", {
					d: "M10 11v2",
					key: "1s651w"
				}],
				["path", {
					d: "M8 17h8",
					key: "wh5c61"
				}],
				["path", {
					d: "M14 16v2",
					key: "12fp5e"
				}]
			]);
			createLucideIcon("file-stack", [
				["path", {
					d: "M11 21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1",
					key: "likhh7"
				}],
				["path", {
					d: "M16 16a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1",
					key: "17ky3x"
				}],
				["path", {
					d: "M21 6a2 2 0 0 0-.586-1.414l-2-2A2 2 0 0 0 17 2h-3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1z",
					key: "1hyeo0"
				}]
			]);
			createLucideIcon("file-spreadsheet", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M8 13h2",
					key: "yr2amv"
				}],
				["path", {
					d: "M14 13h2",
					key: "un5t4a"
				}],
				["path", {
					d: "M8 17h2",
					key: "2yhykz"
				}],
				["path", {
					d: "M14 17h2",
					key: "10kma7"
				}]
			]);
			createLucideIcon("file-symlink", [
				["path", {
					d: "M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h7",
					key: "huwfnr"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "m10 18 3-3-3-3",
					key: "18f6ys"
				}]
			]);
			createLucideIcon("file-terminal", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "m8 16 2-2-2-2",
					key: "10vzyd"
				}],
				["path", {
					d: "M12 18h4",
					key: "1wd2n7"
				}]
			]);
			createLucideIcon("file-text", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M10 9H8",
					key: "b1mrlr"
				}],
				["path", {
					d: "M16 13H8",
					key: "t4e002"
				}],
				["path", {
					d: "M16 17H8",
					key: "z1uh3a"
				}]
			]);
			createLucideIcon("file-type-corner", [
				["path", {
					d: "M12 22h6a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v6",
					key: "15usau"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M3 16v-1.5a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 .5.5V16",
					key: "s1gz5"
				}],
				["path", {
					d: "M6 22h2",
					key: "194x9m"
				}],
				["path", {
					d: "M7 14v8",
					key: "11ixej"
				}]
			]);
			createLucideIcon("file-type", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M11 18h2",
					key: "12mj7e"
				}],
				["path", {
					d: "M12 12v6",
					key: "3ahymv"
				}],
				["path", {
					d: "M9 13v-.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5v.5",
					key: "qbrxap"
				}]
			]);
			createLucideIcon("file-up", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M12 12v6",
					key: "3ahymv"
				}],
				["path", {
					d: "m15 15-3-3-3 3",
					key: "15xj92"
				}]
			]);
			createLucideIcon("file-user", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M16 22a4 4 0 0 0-8 0",
					key: "7a83pg"
				}],
				["circle", {
					cx: "12",
					cy: "15",
					r: "3",
					key: "g36mzq"
				}]
			]);
			createLucideIcon("file-video-camera", [
				["path", {
					d: "M4 12V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2",
					key: "jrl274"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "m10 17.843 3.033-1.755a.64.64 0 0 1 .967.56v4.704a.65.65 0 0 1-.967.56L10 20.157",
					key: "17aeo9"
				}],
				["rect", {
					width: "7",
					height: "6",
					x: "3",
					y: "16",
					rx: "1",
					key: "s27ndx"
				}]
			]);
			createLucideIcon("file-volume", [
				["path", {
					d: "M4 11.55V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-1.95",
					key: "44gpjv"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M12 15a5 5 0 0 1 0 6",
					key: "oxg87a"
				}],
				["path", {
					d: "M8 14.502a.5.5 0 0 0-.826-.381l-1.893 1.631a1 1 0 0 1-.651.243H3.5a.5.5 0 0 0-.5.501v3.006a.5.5 0 0 0 .5.501h1.129a1 1 0 0 1 .652.243l1.893 1.633a.5.5 0 0 0 .826-.38z",
					key: "8rtoi1"
				}]
			]);
			createLucideIcon("file-x-corner", [
				["path", {
					d: "M11 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v5",
					key: "1jo35a"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "m15 17 5 5",
					key: "36xl1x"
				}],
				["path", {
					d: "m20 17-5 5",
					key: "vdz27y"
				}]
			]);
			createLucideIcon("file-x", [
				["path", {
					d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
					key: "1oefj6"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "m14.5 12.5-5 5",
					key: "b62r18"
				}],
				["path", {
					d: "m9.5 12.5 5 5",
					key: "1rk7el"
				}]
			]);
			createLucideIcon("file", [["path", {
				d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
				key: "1oefj6"
			}], ["path", {
				d: "M14 2v5a1 1 0 0 0 1 1h5",
				key: "wfsgrz"
			}]]);
			createLucideIcon("files", [
				["path", {
					d: "M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8",
					key: "14sh0y"
				}],
				["path", {
					d: "M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706z",
					key: "1970lx"
				}],
				["path", {
					d: "M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1",
					key: "l4dndm"
				}]
			]);
			createLucideIcon("film", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M7 3v18",
					key: "bbkbws"
				}],
				["path", {
					d: "M3 7.5h4",
					key: "zfgn84"
				}],
				["path", {
					d: "M3 12h18",
					key: "1i2n21"
				}],
				["path", {
					d: "M3 16.5h4",
					key: "1230mu"
				}],
				["path", {
					d: "M17 3v18",
					key: "in4fa5"
				}],
				["path", {
					d: "M17 7.5h4",
					key: "myr1c1"
				}],
				["path", {
					d: "M17 16.5h4",
					key: "go4c1d"
				}]
			]);
			createLucideIcon("fingerprint-pattern", [
				["path", {
					d: "M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4",
					key: "1nerag"
				}],
				["path", {
					d: "M14 13.12c0 2.38 0 6.38-1 8.88",
					key: "o46ks0"
				}],
				["path", {
					d: "M17.29 21.02c.12-.6.43-2.3.5-3.02",
					key: "ptglia"
				}],
				["path", {
					d: "M2 12a10 10 0 0 1 18-6",
					key: "ydlgp0"
				}],
				["path", {
					d: "M2 16h.01",
					key: "1gqxmh"
				}],
				["path", {
					d: "M21.8 16c.2-2 .131-5.354 0-6",
					key: "drycrb"
				}],
				["path", {
					d: "M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2",
					key: "1tidbn"
				}],
				["path", {
					d: "M8.65 22c.21-.66.45-1.32.57-2",
					key: "13wd9y"
				}],
				["path", {
					d: "M9 6.8a6 6 0 0 1 9 5.2v2",
					key: "1fr1j5"
				}]
			]);
			createLucideIcon("fire-extinguisher", [
				["path", {
					d: "M15 6.5V3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3.5",
					key: "sqyvz"
				}],
				["path", {
					d: "M9 18h8",
					key: "i7pszb"
				}],
				["path", {
					d: "M18 3h-3",
					key: "7idoqj"
				}],
				["path", {
					d: "M11 3a6 6 0 0 0-6 6v11",
					key: "1v5je3"
				}],
				["path", {
					d: "M5 13h4",
					key: "svpcxo"
				}],
				["path", {
					d: "M17 10a4 4 0 0 0-8 0v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2Z",
					key: "vsjego"
				}]
			]);
			createLucideIcon("fish-off", [
				["path", {
					d: "M18 12.47v.03m0-.5v.47m-.475 5.056A6.744 6.744 0 0 1 15 18c-3.56 0-7.56-2.53-8.5-6 .348-1.28 1.114-2.433 2.121-3.38m3.444-2.088A8.802 8.802 0 0 1 15 6c3.56 0 6.06 2.54 7 6-.309 1.14-.786 2.177-1.413 3.058",
					key: "1j1hse"
				}],
				["path", {
					d: "M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33m7.48-4.372A9.77 9.77 0 0 1 16 6.07m0 11.86a9.77 9.77 0 0 1-1.728-3.618",
					key: "1q46z8"
				}],
				["path", {
					d: "m16.01 17.93-.23 1.4A2 2 0 0 1 13.8 21H9.5a5.96 5.96 0 0 0 1.49-3.98M8.53 3h5.27a2 2 0 0 1 1.98 1.67l.23 1.4M2 2l20 20",
					key: "1407gh"
				}]
			]);
			createLucideIcon("fish-symbol", [["path", {
				d: "M2 16s9-15 20-4C11 23 2 8 2 8",
				key: "h4oh4o"
			}]]);
			createLucideIcon("fish", [
				["path", {
					d: "M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z",
					key: "15baut"
				}],
				["path", {
					d: "M18 12v.5",
					key: "18hhni"
				}],
				["path", {
					d: "M16 17.93a9.77 9.77 0 0 1 0-11.86",
					key: "16dt7o"
				}],
				["path", {
					d: "M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33",
					key: "l9di03"
				}],
				["path", {
					d: "M10.46 7.26C10.2 5.88 9.17 4.24 8 3h5.8a2 2 0 0 1 1.98 1.67l.23 1.4",
					key: "1kjonw"
				}],
				["path", {
					d: "m16.01 17.93-.23 1.4A2 2 0 0 1 13.8 21H9.5a5.96 5.96 0 0 0 1.49-3.98",
					key: "1zlm23"
				}]
			]);
			createLucideIcon("fishing-hook", [
				["path", {
					d: "m17.586 11.414-5.93 5.93a1 1 0 0 1-8-8l3.137-3.137a.707.707 0 0 1 1.207.5V10",
					key: "157y8s"
				}],
				["path", {
					d: "M20.414 8.586 22 7",
					key: "5g2s34"
				}],
				["circle", {
					cx: "19",
					cy: "10",
					r: "2",
					key: "7363ft"
				}]
			]);
			createLucideIcon("fishing-rod", [
				["path", {
					d: "M4 11h1",
					key: "13eipc"
				}],
				["path", {
					d: "M8 15a2 2 0 0 1-4 0V3a1 1 0 0 1 1-1h.5C14 2 20 9 20 18v4",
					key: "1hs3im"
				}],
				["circle", {
					cx: "18",
					cy: "18",
					r: "2",
					key: "1emm8v"
				}]
			]);
			createLucideIcon("flag-off", [
				["path", {
					d: "M16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528",
					key: "1q158e"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M4 22V4",
					key: "1plyxx"
				}],
				["path", {
					d: "M7.656 2H8c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10.347",
					key: "xj1b71"
				}]
			]);
			createLucideIcon("flag-triangle-left", [["path", {
				d: "M18 22V2.8a.8.8 0 0 0-1.17-.71L5.45 7.78a.8.8 0 0 0 0 1.44L18 15.5",
				key: "rbbtmw"
			}]]);
			createLucideIcon("flag", [["path", {
				d: "M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528",
				key: "1jaruq"
			}]]);
			createLucideIcon("flag-triangle-right", [["path", {
				d: "M6 22V2.8a.8.8 0 0 1 1.17-.71l11.38 5.69a.8.8 0 0 1 0 1.44L6 15.5",
				key: "kfjsu0"
			}]]);
			createLucideIcon("flame-kindling", [
				["path", {
					d: "M12 2c1 3 2.5 3.5 3.5 4.5A5 5 0 0 1 17 10a5 5 0 1 1-10 0c0-.3 0-.6.1-.9a2 2 0 1 0 3.3-2C8 4.5 11 2 12 2Z",
					key: "1ir223"
				}],
				["path", {
					d: "m5 22 14-4",
					key: "1brv4h"
				}],
				["path", {
					d: "m5 18 14 4",
					key: "lgyyje"
				}]
			]);
			createLucideIcon("flame", [["path", {
				d: "M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4",
				key: "1slcih"
			}]]);
			createLucideIcon("flashlight-off", [
				["path", {
					d: "M11.652 6H18",
					key: "voqkpr"
				}],
				["path", {
					d: "M12 13v1",
					key: "176q98"
				}],
				["path", {
					d: "M16 16v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-8a4 4 0 0 0-.8-2.4l-.6-.8A3 3 0 0 1 6 7V6",
					key: "dzyf92"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M7.649 2H17a1 1 0 0 1 1 1v4a3 3 0 0 1-.6 1.8l-.6.8a4 4 0 0 0-.55 1.007",
					key: "1hvcfn"
				}]
			]);
			createLucideIcon("flashlight", [
				["path", {
					d: "M12 13v1",
					key: "176q98"
				}],
				["path", {
					d: "M17 2a1 1 0 0 1 1 1v4a3 3 0 0 1-.6 1.8l-.6.8A4 4 0 0 0 16 12v8a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-8a4 4 0 0 0-.8-2.4l-.6-.8A3 3 0 0 1 6 7V3a1 1 0 0 1 1-1z",
					key: "17vh7j"
				}],
				["path", {
					d: "M6 6h12",
					key: "n6hhss"
				}]
			]);
			createLucideIcon("flask-conical-off", [
				["path", {
					d: "M10 2v2.343",
					key: "15t272"
				}],
				["path", {
					d: "M14 2v6.343",
					key: "sxr80q"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M20 20a2 2 0 0 1-2 2H6a2 2 0 0 1-1.755-2.96l5.227-9.563",
					key: "k0duyd"
				}],
				["path", {
					d: "M6.453 15H15",
					key: "1f0z33"
				}],
				["path", {
					d: "M8.5 2h7",
					key: "csnxdl"
				}]
			]);
			createLucideIcon("flask-conical", [
				["path", {
					d: "M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2",
					key: "18mbvz"
				}],
				["path", {
					d: "M6.453 15h11.094",
					key: "3shlmq"
				}],
				["path", {
					d: "M8.5 2h7",
					key: "csnxdl"
				}]
			]);
			createLucideIcon("flip-horizontal-2", [
				["path", {
					d: "m3 7 5 5-5 5V7",
					key: "couhi7"
				}],
				["path", {
					d: "m21 7-5 5 5 5V7",
					key: "6ouia7"
				}],
				["path", {
					d: "M12 20v2",
					key: "1lh1kg"
				}],
				["path", {
					d: "M12 14v2",
					key: "8jcxud"
				}],
				["path", {
					d: "M12 8v2",
					key: "1woqiv"
				}],
				["path", {
					d: "M12 2v2",
					key: "tus03m"
				}]
			]);
			createLucideIcon("flask-round", [
				["path", {
					d: "M10 2v6.292a7 7 0 1 0 4 0V2",
					key: "1s42pc"
				}],
				["path", {
					d: "M5 15h14",
					key: "m0yey3"
				}],
				["path", {
					d: "M8.5 2h7",
					key: "csnxdl"
				}]
			]);
			createLucideIcon("flip-vertical-2", [
				["path", {
					d: "m17 3-5 5-5-5h10",
					key: "1ftt6x"
				}],
				["path", {
					d: "m17 21-5-5-5 5h10",
					key: "1m0wmu"
				}],
				["path", {
					d: "M4 12H2",
					key: "rhcxmi"
				}],
				["path", {
					d: "M10 12H8",
					key: "s88cx1"
				}],
				["path", {
					d: "M16 12h-2",
					key: "10asgb"
				}],
				["path", {
					d: "M22 12h-2",
					key: "14jgyd"
				}]
			]);
			createLucideIcon("flower-2", [
				["path", {
					d: "M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1",
					key: "3pnvol"
				}],
				["circle", {
					cx: "12",
					cy: "8",
					r: "2",
					key: "1822b1"
				}],
				["path", {
					d: "M12 10v12",
					key: "6ubwww"
				}],
				["path", {
					d: "M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z",
					key: "9hd38g"
				}],
				["path", {
					d: "M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z",
					key: "ufn41s"
				}]
			]);
			createLucideIcon("flower", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "3",
					key: "1v7zrd"
				}],
				["path", {
					d: "M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5",
					key: "14wa3c"
				}],
				["path", {
					d: "M12 7.5V9",
					key: "1oy5b0"
				}],
				["path", {
					d: "M7.5 12H9",
					key: "eltsq1"
				}],
				["path", {
					d: "M16.5 12H15",
					key: "vk5kw4"
				}],
				["path", {
					d: "M12 16.5V15",
					key: "k7eayi"
				}],
				["path", {
					d: "m8 8 1.88 1.88",
					key: "nxy4qf"
				}],
				["path", {
					d: "M14.12 9.88 16 8",
					key: "1lst6k"
				}],
				["path", {
					d: "m8 16 1.88-1.88",
					key: "h2eex1"
				}],
				["path", {
					d: "M14.12 14.12 16 16",
					key: "uqkrx3"
				}]
			]);
			createLucideIcon("focus", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "3",
					key: "1v7zrd"
				}],
				["path", {
					d: "M3 7V5a2 2 0 0 1 2-2h2",
					key: "aa7l1z"
				}],
				["path", {
					d: "M17 3h2a2 2 0 0 1 2 2v2",
					key: "4qcy5o"
				}],
				["path", {
					d: "M21 17v2a2 2 0 0 1-2 2h-2",
					key: "6vwrx8"
				}],
				["path", {
					d: "M7 21H5a2 2 0 0 1-2-2v-2",
					key: "ioqczr"
				}]
			]);
			createLucideIcon("fold-horizontal", [
				["path", {
					d: "M2 12h6",
					key: "1wqiqv"
				}],
				["path", {
					d: "M22 12h-6",
					key: "1eg9hc"
				}],
				["path", {
					d: "M12 2v2",
					key: "tus03m"
				}],
				["path", {
					d: "M12 8v2",
					key: "1woqiv"
				}],
				["path", {
					d: "M12 14v2",
					key: "8jcxud"
				}],
				["path", {
					d: "M12 20v2",
					key: "1lh1kg"
				}],
				["path", {
					d: "m19 9-3 3 3 3",
					key: "12ol22"
				}],
				["path", {
					d: "m5 15 3-3-3-3",
					key: "1kdhjc"
				}]
			]);
			createLucideIcon("fold-vertical", [
				["path", {
					d: "M12 22v-6",
					key: "6o8u61"
				}],
				["path", {
					d: "M12 8V2",
					key: "1wkif3"
				}],
				["path", {
					d: "M4 12H2",
					key: "rhcxmi"
				}],
				["path", {
					d: "M10 12H8",
					key: "s88cx1"
				}],
				["path", {
					d: "M16 12h-2",
					key: "10asgb"
				}],
				["path", {
					d: "M22 12h-2",
					key: "14jgyd"
				}],
				["path", {
					d: "m15 19-3-3-3 3",
					key: "e37ymu"
				}],
				["path", {
					d: "m15 5-3 3-3-3",
					key: "19d6lf"
				}]
			]);
			createLucideIcon("folder-archive", [
				["circle", {
					cx: "15",
					cy: "19",
					r: "2",
					key: "u2pros"
				}],
				["path", {
					d: "M20.9 19.8A2 2 0 0 0 22 18V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h5.1",
					key: "1jj40k"
				}],
				["path", {
					d: "M15 11v-1",
					key: "cntcp"
				}],
				["path", {
					d: "M15 17v-2",
					key: "1279jj"
				}]
			]);
			createLucideIcon("folder-bookmark", [["path", {
				d: "M12 6v8l3-3 3 3V6",
				key: "11pvqx"
			}], ["path", {
				d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z",
				key: "1u1bxd"
			}]]);
			createLucideIcon("folder-check", [["path", {
				d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
				key: "1kt360"
			}], ["path", {
				d: "m9 13 2 2 4-4",
				key: "6343dt"
			}]]);
			createLucideIcon("folder-clock", [
				["path", {
					d: "M16 14v2.2l1.6 1",
					key: "fo4ql5"
				}],
				["path", {
					d: "M7 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2",
					key: "1urifu"
				}],
				["circle", {
					cx: "16",
					cy: "16",
					r: "6",
					key: "qoo3c4"
				}]
			]);
			createLucideIcon("folder-closed", [["path", {
				d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
				key: "1kt360"
			}], ["path", {
				d: "M2 10h20",
				key: "1ir3d8"
			}]]);
			createLucideIcon("folder-code", [
				["path", {
					d: "M10 10.5 8 13l2 2.5",
					key: "m4t9c1"
				}],
				["path", {
					d: "m14 10.5 2 2.5-2 2.5",
					key: "14w2eb"
				}],
				["path", {
					d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z",
					key: "1u1bxd"
				}]
			]);
			createLucideIcon("folder-cog", [
				["path", {
					d: "M10.3 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.98a2 2 0 0 1 1.69.9l.66 1.2A2 2 0 0 0 12 6h8a2 2 0 0 1 2 2v3.3",
					key: "128dxu"
				}],
				["path", {
					d: "m14.305 19.53.923-.382",
					key: "3m78fa"
				}],
				["path", {
					d: "m15.228 16.852-.923-.383",
					key: "npixar"
				}],
				["path", {
					d: "m16.852 15.228-.383-.923",
					key: "5xggr7"
				}],
				["path", {
					d: "m16.852 20.772-.383.924",
					key: "dpfhf9"
				}],
				["path", {
					d: "m19.148 15.228.383-.923",
					key: "1reyyz"
				}],
				["path", {
					d: "m19.53 21.696-.382-.924",
					key: "1goivc"
				}],
				["path", {
					d: "m20.772 16.852.924-.383",
					key: "htqkph"
				}],
				["path", {
					d: "m20.772 19.148.924.383",
					key: "9w9pjp"
				}],
				["circle", {
					cx: "18",
					cy: "18",
					r: "3",
					key: "1xkwt0"
				}]
			]);
			createLucideIcon("folder-dot", [["path", {
				d: "M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z",
				key: "1fr9dc"
			}], ["circle", {
				cx: "12",
				cy: "13",
				r: "1",
				key: "49l61u"
			}]]);
			createLucideIcon("folder-down", [
				["path", {
					d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
					key: "1kt360"
				}],
				["path", {
					d: "M12 10v6",
					key: "1bos4e"
				}],
				["path", {
					d: "m15 13-3 3-3-3",
					key: "6j2sf0"
				}]
			]);
			createLucideIcon("folder-git-2", [
				["path", {
					d: "M18 19a5 5 0 0 1-5-5v8",
					key: "sz5oeg"
				}],
				["path", {
					d: "M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v5",
					key: "1w6njk"
				}],
				["circle", {
					cx: "13",
					cy: "12",
					r: "2",
					key: "1j92g6"
				}],
				["circle", {
					cx: "20",
					cy: "19",
					r: "2",
					key: "1obnsp"
				}]
			]);
			createLucideIcon("folder-git", [
				["circle", {
					cx: "12",
					cy: "13",
					r: "2",
					key: "1c1ljs"
				}],
				["path", {
					d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
					key: "1kt360"
				}],
				["path", {
					d: "M14 13h3",
					key: "1dgedf"
				}],
				["path", {
					d: "M7 13h3",
					key: "1pygq7"
				}]
			]);
			createLucideIcon("folder-heart", [["path", {
				d: "M10.638 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v3.417",
				key: "10r6g4"
			}], ["path", {
				d: "M14.62 18.8A2.25 2.25 0 1 1 18 15.836a2.25 2.25 0 1 1 3.38 2.966l-2.626 2.856a.998.998 0 0 1-1.507 0z",
				key: "15cy7q"
			}]]);
			createLucideIcon("folder-input", [
				["path", {
					d: "M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1",
					key: "fm4g5t"
				}],
				["path", {
					d: "M2 13h10",
					key: "pgb2dq"
				}],
				["path", {
					d: "m9 16 3-3-3-3",
					key: "6m91ic"
				}]
			]);
			createLucideIcon("folder-kanban", [
				["path", {
					d: "M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z",
					key: "1fr9dc"
				}],
				["path", {
					d: "M8 10v4",
					key: "tgpxqk"
				}],
				["path", {
					d: "M12 10v2",
					key: "hh53o1"
				}],
				["path", {
					d: "M16 10v6",
					key: "1d6xys"
				}]
			]);
			createLucideIcon("folder-key", [
				["path", {
					d: "M13 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v1.36",
					key: "1shsnm"
				}],
				["path", {
					d: "M19 12v6",
					key: "kflna4"
				}],
				["path", {
					d: "M19 14h2",
					key: "wp2qbk"
				}],
				["circle", {
					cx: "19",
					cy: "20",
					r: "2",
					key: "1jfyz6"
				}]
			]);
			createLucideIcon("folder-lock", [
				["rect", {
					width: "8",
					height: "5",
					x: "14",
					y: "17",
					rx: "1",
					key: "19aais"
				}],
				["path", {
					d: "M10 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v2.5",
					key: "1w6v7t"
				}],
				["path", {
					d: "M20 17v-2a2 2 0 1 0-4 0v2",
					key: "pwaxnr"
				}]
			]);
			createLucideIcon("folder-minus", [["path", {
				d: "M9 13h6",
				key: "1uhe8q"
			}], ["path", {
				d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
				key: "1kt360"
			}]]);
			createLucideIcon("folder-open-dot", [["path", {
				d: "m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2",
				key: "1nmvlm"
			}], ["circle", {
				cx: "14",
				cy: "15",
				r: "1",
				key: "1gm4qj"
			}]]);
			createLucideIcon("folder-pen", [["path", {
				d: "M2 11.5V5a2 2 0 0 1 2-2h3.9c.7 0 1.3.3 1.7.9l.8 1.2c.4.6 1 .9 1.7.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-9.5",
				key: "a8xqs0"
			}], ["path", {
				d: "M11.378 13.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z",
				key: "1saktj"
			}]]);
			createLucideIcon("folder-output", [
				["path", {
					d: "M2 7.5V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-1.5",
					key: "1yk7aj"
				}],
				["path", {
					d: "M2 13h10",
					key: "pgb2dq"
				}],
				["path", {
					d: "m5 10-3 3 3 3",
					key: "1r8ie0"
				}]
			]);
			const FolderOpen = createLucideIcon("folder-open", [["path", {
				d: "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2",
				key: "usdka0"
			}]]);
			createLucideIcon("folder-plus", [
				["path", {
					d: "M12 10v6",
					key: "1bos4e"
				}],
				["path", {
					d: "M9 13h6",
					key: "1uhe8q"
				}],
				["path", {
					d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
					key: "1kt360"
				}]
			]);
			createLucideIcon("folder-root", [
				["path", {
					d: "M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z",
					key: "1fr9dc"
				}],
				["circle", {
					cx: "12",
					cy: "13",
					r: "2",
					key: "1c1ljs"
				}],
				["path", {
					d: "M12 15v5",
					key: "11xva1"
				}]
			]);
			createLucideIcon("folder-search-2", [
				["circle", {
					cx: "11.5",
					cy: "12.5",
					r: "2.5",
					key: "1ea5ju"
				}],
				["path", {
					d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
					key: "1kt360"
				}],
				["path", {
					d: "M13.3 14.3 15 16",
					key: "1y4v1n"
				}]
			]);
			createLucideIcon("folder-search", [
				["path", {
					d: "M10.7 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v4.1",
					key: "1bw5m7"
				}],
				["path", {
					d: "m21 21-1.9-1.9",
					key: "1g2n9r"
				}],
				["circle", {
					cx: "17",
					cy: "17",
					r: "3",
					key: "18b49y"
				}]
			]);
			createLucideIcon("folder-symlink", [["path", {
				d: "M2 9.35V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h7",
				key: "y8kt7d"
			}], ["path", {
				d: "m8 16 3-3-3-3",
				key: "rlqrt1"
			}]]);
			createLucideIcon("folder-sync", [
				["path", {
					d: "M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v.5",
					key: "1dkoa9"
				}],
				["path", {
					d: "M12 10v4h4",
					key: "1czhmt"
				}],
				["path", {
					d: "m12 14 1.535-1.605a5 5 0 0 1 8 1.5",
					key: "lvuxfi"
				}],
				["path", {
					d: "M22 22v-4h-4",
					key: "1ewp4q"
				}],
				["path", {
					d: "m22 18-1.535 1.605a5 5 0 0 1-8-1.5",
					key: "14ync0"
				}]
			]);
			createLucideIcon("folder-tree", [
				["path", {
					d: "M20 10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z",
					key: "hod4my"
				}],
				["path", {
					d: "M20 21a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2.9a1 1 0 0 1-.88-.55l-.42-.85a1 1 0 0 0-.92-.6H13a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z",
					key: "w4yl2u"
				}],
				["path", {
					d: "M3 5a2 2 0 0 0 2 2h3",
					key: "f2jnh7"
				}],
				["path", {
					d: "M3 3v13a2 2 0 0 0 2 2h3",
					key: "k8epm1"
				}]
			]);
			createLucideIcon("folder-up", [
				["path", {
					d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
					key: "1kt360"
				}],
				["path", {
					d: "M12 10v6",
					key: "1bos4e"
				}],
				["path", {
					d: "m9 13 3-3 3 3",
					key: "1pxg3c"
				}]
			]);
			createLucideIcon("folder-x", [
				["path", {
					d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
					key: "1kt360"
				}],
				["path", {
					d: "m9.5 10.5 5 5",
					key: "ra9qjz"
				}],
				["path", {
					d: "m14.5 10.5-5 5",
					key: "l2rkpq"
				}]
			]);
			createLucideIcon("folder", [["path", {
				d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
				key: "1kt360"
			}]]);
			createLucideIcon("folders", [["path", {
				d: "M20 5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2.5a1.5 1.5 0 0 1 1.2.6l.6.8a1.5 1.5 0 0 0 1.2.6z",
				key: "a4852j"
			}], ["path", {
				d: "M3 8.268a2 2 0 0 0-1 1.738V19a2 2 0 0 0 2 2h11a2 2 0 0 0 1.732-1",
				key: "yxbcw3"
			}]]);
			createLucideIcon("forklift", [
				["path", {
					d: "M12 12H5a2 2 0 0 0-2 2v5",
					key: "7zsz91"
				}],
				["path", {
					d: "M15 19h7",
					key: "1askl3"
				}],
				["path", {
					d: "M16 19V2",
					key: "1gf9nk"
				}],
				["path", {
					d: "M6 12V7a2 2 0 0 1 2-2h2.172a2 2 0 0 1 1.414.586l3.828 3.828A2 2 0 0 1 16 10.828",
					key: "enx9tf"
				}],
				["path", {
					d: "M7 19h4",
					key: "fumhkk"
				}],
				["circle", {
					cx: "13",
					cy: "19",
					r: "2",
					key: "wjnkru"
				}],
				["circle", {
					cx: "5",
					cy: "19",
					r: "2",
					key: "v8kfzx"
				}]
			]);
			createLucideIcon("footprints", [
				["path", {
					d: "M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z",
					key: "1dudjm"
				}],
				["path", {
					d: "M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z",
					key: "l2t8xc"
				}],
				["path", {
					d: "M16 17h4",
					key: "1dejxt"
				}],
				["path", {
					d: "M4 13h4",
					key: "1bwh8b"
				}]
			]);
			createLucideIcon("form", [
				["path", {
					d: "M4 14h6",
					key: "77gv2w"
				}],
				["path", {
					d: "M4 2h10",
					key: "a2b314"
				}],
				["rect", {
					x: "4",
					y: "18",
					width: "16",
					height: "4",
					rx: "1",
					key: "sybzq6"
				}],
				["rect", {
					x: "4",
					y: "6",
					width: "16",
					height: "4",
					rx: "1",
					key: "1osc9e"
				}]
			]);
			createLucideIcon("forward", [["path", {
				d: "m15 17 5-5-5-5",
				key: "nf172w"
			}], ["path", {
				d: "M4 18v-2a4 4 0 0 1 4-4h12",
				key: "jmiej9"
			}]]);
			createLucideIcon("frame", [
				["line", {
					x1: "22",
					x2: "2",
					y1: "6",
					y2: "6",
					key: "15w7dq"
				}],
				["line", {
					x1: "22",
					x2: "2",
					y1: "18",
					y2: "18",
					key: "1ip48p"
				}],
				["line", {
					x1: "6",
					x2: "6",
					y1: "2",
					y2: "22",
					key: "a2lnyx"
				}],
				["line", {
					x1: "18",
					x2: "18",
					y1: "2",
					y2: "22",
					key: "8vb6jd"
				}]
			]);
			createLucideIcon("fuel", [
				["path", {
					d: "M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-6.998a2 2 0 0 0-.59-1.42L18 5",
					key: "1wtuz0"
				}],
				["path", {
					d: "M14 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16",
					key: "e09ifn"
				}],
				["path", {
					d: "M2 21h13",
					key: "1x0fut"
				}],
				["path", {
					d: "M3 9h11",
					key: "1p7c0w"
				}]
			]);
			createLucideIcon("fullscreen", [
				["path", {
					d: "M3 7V5a2 2 0 0 1 2-2h2",
					key: "aa7l1z"
				}],
				["path", {
					d: "M17 3h2a2 2 0 0 1 2 2v2",
					key: "4qcy5o"
				}],
				["path", {
					d: "M21 17v2a2 2 0 0 1-2 2h-2",
					key: "6vwrx8"
				}],
				["path", {
					d: "M7 21H5a2 2 0 0 1-2-2v-2",
					key: "ioqczr"
				}],
				["rect", {
					width: "10",
					height: "8",
					x: "7",
					y: "8",
					rx: "1",
					key: "vys8me"
				}]
			]);
			createLucideIcon("funnel-plus", [
				["path", {
					d: "M13.354 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14v6a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341l1.218-1.348",
					key: "8mvsmf"
				}],
				["path", {
					d: "M16 6h6",
					key: "1dogtp"
				}],
				["path", {
					d: "M19 3v6",
					key: "1ytpjt"
				}]
			]);
			createLucideIcon("funnel-x", [
				["path", {
					d: "M12.531 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14v6a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341l.427-.473",
					key: "ol2ft2"
				}],
				["path", {
					d: "m16.5 3.5 5 5",
					key: "15e6fa"
				}],
				["path", {
					d: "m21.5 3.5-5 5",
					key: "m0lwru"
				}]
			]);
			createLucideIcon("funnel", [["path", {
				d: "M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z",
				key: "sc7q7i"
			}]]);
			createLucideIcon("galaxy", [
				["path", {
					d: "M16.005 15.108a5.041 6.52 28.25 00-8.008-6.217 5.041 6.52 28.25 008.008 6.217A11.884 7.288-60.76 014.029 7.001",
					key: "1w3uyc"
				}],
				["path", {
					d: "M17 21h.01",
					key: "1yigvh"
				}],
				["path", {
					d: "M7 3h.01",
					key: "we4yfo"
				}],
				["path", {
					d: "M7.997 8.891a11.885 7.288-60.756 0111.977 8.107",
					key: "mpf5op"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "1",
					fill: "currentColor",
					key: "1t76vf"
				}]
			]);
			createLucideIcon("gallery-horizontal-end", [
				["path", {
					d: "M2 7v10",
					key: "a2pl2d"
				}],
				["path", {
					d: "M6 5v14",
					key: "1kq3d7"
				}],
				["rect", {
					width: "12",
					height: "18",
					x: "10",
					y: "3",
					rx: "2",
					key: "13i7bc"
				}]
			]);
			createLucideIcon("gallery-horizontal", [
				["path", {
					d: "M2 3v18",
					key: "pzttux"
				}],
				["rect", {
					width: "12",
					height: "18",
					x: "6",
					y: "3",
					rx: "2",
					key: "btr8bg"
				}],
				["path", {
					d: "M22 3v18",
					key: "6jf3v"
				}]
			]);
			createLucideIcon("gallery-thumbnails", [
				["rect", {
					width: "18",
					height: "14",
					x: "3",
					y: "3",
					rx: "2",
					key: "74y24f"
				}],
				["path", {
					d: "M4 21h1",
					key: "16zlid"
				}],
				["path", {
					d: "M9 21h1",
					key: "15o7lz"
				}],
				["path", {
					d: "M14 21h1",
					key: "v9vybs"
				}],
				["path", {
					d: "M19 21h1",
					key: "edywat"
				}]
			]);
			createLucideIcon("gallery-vertical-end", [
				["path", {
					d: "M7 2h10",
					key: "nczekb"
				}],
				["path", {
					d: "M5 6h14",
					key: "u2x4p"
				}],
				["rect", {
					width: "18",
					height: "12",
					x: "3",
					y: "10",
					rx: "2",
					key: "l0tzu3"
				}]
			]);
			createLucideIcon("gallery-vertical", [
				["path", {
					d: "M3 2h18",
					key: "15qxfx"
				}],
				["rect", {
					width: "18",
					height: "12",
					x: "3",
					y: "6",
					rx: "2",
					key: "1439r6"
				}],
				["path", {
					d: "M3 22h18",
					key: "8prr45"
				}]
			]);
			createLucideIcon("gamepad-2", [
				["line", {
					x1: "6",
					x2: "10",
					y1: "11",
					y2: "11",
					key: "1gktln"
				}],
				["line", {
					x1: "8",
					x2: "8",
					y1: "9",
					y2: "13",
					key: "qnk9ow"
				}],
				["line", {
					x1: "15",
					x2: "15.01",
					y1: "12",
					y2: "12",
					key: "krot7o"
				}],
				["line", {
					x1: "18",
					x2: "18.01",
					y1: "10",
					y2: "10",
					key: "1lcuu1"
				}],
				["path", {
					d: "M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z",
					key: "mfqc10"
				}]
			]);
			createLucideIcon("gamepad", [
				["line", {
					x1: "6",
					x2: "10",
					y1: "12",
					y2: "12",
					key: "161bw2"
				}],
				["line", {
					x1: "8",
					x2: "8",
					y1: "10",
					y2: "14",
					key: "1i6ji0"
				}],
				["line", {
					x1: "15",
					x2: "15.01",
					y1: "13",
					y2: "13",
					key: "dqpgro"
				}],
				["line", {
					x1: "18",
					x2: "18.01",
					y1: "11",
					y2: "11",
					key: "meh2c"
				}],
				["rect", {
					width: "20",
					height: "12",
					x: "2",
					y: "6",
					rx: "2",
					key: "9lu3g6"
				}]
			]);
			createLucideIcon("gamepad-directional", [
				["path", {
					d: "M11.146 15.854a1.207 1.207 0 0 1 1.708 0l1.56 1.56A2 2 0 0 1 15 18.828V21a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-2.172a2 2 0 0 1 .586-1.414z",
					key: "1re2og"
				}],
				["path", {
					d: "M18.828 15a2 2 0 0 1-1.414-.586l-1.56-1.56a1.207 1.207 0 0 1 0-1.708l1.56-1.56A2 2 0 0 1 18.828 9H21a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1z",
					key: "1pchrj"
				}],
				["path", {
					d: "M6.586 14.414A2 2 0 0 1 5.172 15H3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h2.172a2 2 0 0 1 1.414.586l1.56 1.56a1.207 1.207 0 0 1 0 1.708z",
					key: "16mt4c"
				}],
				["path", {
					d: "M9 3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2.172a2 2 0 0 1-.586 1.414l-1.56 1.56a1.207 1.207 0 0 1-1.708 0l-1.56-1.56A2 2 0 0 1 9 5.172z",
					key: "19ox6c"
				}]
			]);
			createLucideIcon("gauge", [["path", {
				d: "m12 14 4-4",
				key: "9kzdfg"
			}], ["path", {
				d: "M3.34 19a10 10 0 1 1 17.32 0",
				key: "19p75a"
			}]]);
			createLucideIcon("gavel", [
				["path", {
					d: "m14 13-8.381 8.38a1 1 0 0 1-3.001-3l8.384-8.381",
					key: "pgg06f"
				}],
				["path", {
					d: "m16 16 6-6",
					key: "vzrcl6"
				}],
				["path", {
					d: "m21.5 10.5-8-8",
					key: "a17d9x"
				}],
				["path", {
					d: "m8 8 6-6",
					key: "18bi4p"
				}],
				["path", {
					d: "m8.5 7.5 8 8",
					key: "1oyaui"
				}]
			]);
			createLucideIcon("gem", [
				["path", {
					d: "M10.5 3 8 9l4 13 4-13-2.5-6",
					key: "b3dvk1"
				}],
				["path", {
					d: "M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3z",
					key: "7w4byz"
				}],
				["path", {
					d: "M2 9h20",
					key: "16fsjt"
				}]
			]);
			createLucideIcon("georgian-lari", [
				["path", {
					d: "M11.5 21a7.5 7.5 0 1 1 7.35-9",
					key: "1gyj8k"
				}],
				["path", {
					d: "M13 12V3",
					key: "18om2a"
				}],
				["path", {
					d: "M4 21h16",
					key: "1h09gz"
				}],
				["path", {
					d: "M9 12V3",
					key: "geutu0"
				}]
			]);
			createLucideIcon("ghost", [
				["path", {
					d: "M15 10v1",
					key: "oj8wfp"
				}],
				["path", {
					d: "M7.528 20.472a1.6 1.6 0 012.277 0l1.057 1.056a1.6 1.6 0 002.276 0l1.057-1.056a1.6 1.6 0 012.277 0l1.114 1.114a1.4 1.4 0 002.414-1V10a8 8 0 00-16 0v10.586a1.4 1.4 0 002.414 1z",
					key: "13lou3"
				}],
				["path", {
					d: "M9 10v1",
					key: "1e14fa"
				}]
			]);
			createLucideIcon("gift", [
				["path", {
					d: "M12 7v14",
					key: "1akyts"
				}],
				["path", {
					d: "M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8",
					key: "1sqzm4"
				}],
				["path", {
					d: "M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5",
					key: "kc0143"
				}],
				["rect", {
					x: "3",
					y: "7",
					width: "18",
					height: "4",
					rx: "1",
					key: "1hberx"
				}]
			]);
			createLucideIcon("git-branch-plus", [
				["path", {
					d: "M6 3v12",
					key: "qpgusn"
				}],
				["path", {
					d: "M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
					key: "1d02ji"
				}],
				["path", {
					d: "M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
					key: "chk6ph"
				}],
				["path", {
					d: "M15 6a9 9 0 0 0-9 9",
					key: "or332x"
				}],
				["path", {
					d: "M18 15v6",
					key: "9wciyi"
				}],
				["path", {
					d: "M21 18h-6",
					key: "139f0c"
				}]
			]);
			createLucideIcon("git-branch-minus", [
				["path", {
					d: "M15 6a9 9 0 0 0-9 9V3",
					key: "1cii5b"
				}],
				["path", {
					d: "M21 18h-6",
					key: "139f0c"
				}],
				["circle", {
					cx: "18",
					cy: "6",
					r: "3",
					key: "1h7g24"
				}],
				["circle", {
					cx: "6",
					cy: "18",
					r: "3",
					key: "fqmcym"
				}]
			]);
			createLucideIcon("git-branch", [
				["path", {
					d: "M15 6a9 9 0 0 0-9 9V3",
					key: "1cii5b"
				}],
				["circle", {
					cx: "18",
					cy: "6",
					r: "3",
					key: "1h7g24"
				}],
				["circle", {
					cx: "6",
					cy: "18",
					r: "3",
					key: "fqmcym"
				}]
			]);
			createLucideIcon("git-commit-horizontal", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "3",
					key: "1v7zrd"
				}],
				["line", {
					x1: "3",
					x2: "9",
					y1: "12",
					y2: "12",
					key: "1dyftd"
				}],
				["line", {
					x1: "15",
					x2: "21",
					y1: "12",
					y2: "12",
					key: "oup4p8"
				}]
			]);
			createLucideIcon("git-commit-vertical", [
				["path", {
					d: "M12 3v6",
					key: "1holv5"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "3",
					key: "1v7zrd"
				}],
				["path", {
					d: "M12 15v6",
					key: "a9ows0"
				}]
			]);
			createLucideIcon("git-compare-arrows", [
				["circle", {
					cx: "5",
					cy: "6",
					r: "3",
					key: "1qnov2"
				}],
				["path", {
					d: "M12 6h5a2 2 0 0 1 2 2v7",
					key: "1yj91y"
				}],
				["path", {
					d: "m15 9-3-3 3-3",
					key: "1lwv8l"
				}],
				["circle", {
					cx: "19",
					cy: "18",
					r: "3",
					key: "1qljk2"
				}],
				["path", {
					d: "M12 18H7a2 2 0 0 1-2-2V9",
					key: "16sdep"
				}],
				["path", {
					d: "m9 15 3 3-3 3",
					key: "1m3kbl"
				}]
			]);
			createLucideIcon("git-compare", [
				["circle", {
					cx: "18",
					cy: "18",
					r: "3",
					key: "1xkwt0"
				}],
				["circle", {
					cx: "6",
					cy: "6",
					r: "3",
					key: "1lh9wr"
				}],
				["path", {
					d: "M13 6h3a2 2 0 0 1 2 2v7",
					key: "1yeb86"
				}],
				["path", {
					d: "M11 18H8a2 2 0 0 1-2-2V9",
					key: "19pyzm"
				}]
			]);
			createLucideIcon("git-graph", [
				["circle", {
					cx: "5",
					cy: "6",
					r: "3",
					key: "1qnov2"
				}],
				["path", {
					d: "M5 9v6",
					key: "158jrl"
				}],
				["circle", {
					cx: "5",
					cy: "18",
					r: "3",
					key: "104gr9"
				}],
				["path", {
					d: "M12 3v18",
					key: "108xh3"
				}],
				["circle", {
					cx: "19",
					cy: "6",
					r: "3",
					key: "108a5v"
				}],
				["path", {
					d: "M16 15.7A9 9 0 0 0 19 9",
					key: "1e3vqb"
				}]
			]);
			createLucideIcon("git-fork", [
				["circle", {
					cx: "12",
					cy: "18",
					r: "3",
					key: "1mpf1b"
				}],
				["circle", {
					cx: "6",
					cy: "6",
					r: "3",
					key: "1lh9wr"
				}],
				["circle", {
					cx: "18",
					cy: "6",
					r: "3",
					key: "1h7g24"
				}],
				["path", {
					d: "M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9",
					key: "1uq4wg"
				}],
				["path", {
					d: "M12 12v3",
					key: "158kv8"
				}]
			]);
			createLucideIcon("git-merge-conflict", [
				["path", {
					d: "M12 6h4a2 2 0 0 1 2 2v7",
					key: "18ej7s"
				}],
				["path", {
					d: "M6 12v9",
					key: "9e33v1"
				}],
				["path", {
					d: "m8.5 3.5-5 5",
					key: "cpmru9"
				}],
				["path", {
					d: "m8.5 8.5-5-5",
					key: "1blc57"
				}],
				["circle", {
					cx: "18",
					cy: "18",
					r: "3",
					key: "1xkwt0"
				}]
			]);
			createLucideIcon("git-merge", [
				["circle", {
					cx: "18",
					cy: "18",
					r: "3",
					key: "1xkwt0"
				}],
				["circle", {
					cx: "6",
					cy: "6",
					r: "3",
					key: "1lh9wr"
				}],
				["path", {
					d: "M6 21V9a9 9 0 0 0 9 9",
					key: "7kw0sc"
				}]
			]);
			createLucideIcon("git-pull-request-arrow", [
				["circle", {
					cx: "5",
					cy: "6",
					r: "3",
					key: "1qnov2"
				}],
				["path", {
					d: "M5 9v12",
					key: "ih889a"
				}],
				["circle", {
					cx: "19",
					cy: "18",
					r: "3",
					key: "1qljk2"
				}],
				["path", {
					d: "m15 9-3-3 3-3",
					key: "1lwv8l"
				}],
				["path", {
					d: "M12 6h5a2 2 0 0 1 2 2v7",
					key: "1yj91y"
				}]
			]);
			createLucideIcon("git-pull-request-closed", [
				["path", {
					d: "m15.5 3.5 5 5",
					key: "1kmx7t"
				}],
				["path", {
					d: "m15.5 8.5 5-5",
					key: "saftza"
				}],
				["path", {
					d: "M18 11.62V15",
					key: "1greaj"
				}],
				["path", {
					d: "M6 9v12",
					key: "1sc30k"
				}],
				["circle", {
					cx: "18",
					cy: "18",
					r: "3",
					key: "1xkwt0"
				}],
				["circle", {
					cx: "6",
					cy: "6",
					r: "3",
					key: "1lh9wr"
				}]
			]);
			createLucideIcon("git-pull-request-create-arrow", [
				["circle", {
					cx: "5",
					cy: "6",
					r: "3",
					key: "1qnov2"
				}],
				["path", {
					d: "M5 9v12",
					key: "ih889a"
				}],
				["path", {
					d: "m15 9-3-3 3-3",
					key: "1lwv8l"
				}],
				["path", {
					d: "M12 6h5a2 2 0 0 1 2 2v3",
					key: "1rbwk6"
				}],
				["path", {
					d: "M19 15v6",
					key: "10aioa"
				}],
				["path", {
					d: "M22 18h-6",
					key: "1d5gi5"
				}]
			]);
			createLucideIcon("git-pull-request-create", [
				["circle", {
					cx: "6",
					cy: "6",
					r: "3",
					key: "1lh9wr"
				}],
				["path", {
					d: "M6 9v12",
					key: "1sc30k"
				}],
				["path", {
					d: "M13 6h3a2 2 0 0 1 2 2v3",
					key: "1jb6z3"
				}],
				["path", {
					d: "M18 15v6",
					key: "9wciyi"
				}],
				["path", {
					d: "M21 18h-6",
					key: "139f0c"
				}]
			]);
			createLucideIcon("git-pull-request-draft", [
				["circle", {
					cx: "18",
					cy: "18",
					r: "3",
					key: "1xkwt0"
				}],
				["circle", {
					cx: "6",
					cy: "6",
					r: "3",
					key: "1lh9wr"
				}],
				["path", {
					d: "M18 6V5",
					key: "1oao2s"
				}],
				["path", {
					d: "M18 11v-1",
					key: "11c8tz"
				}],
				["line", {
					x1: "6",
					x2: "6",
					y1: "9",
					y2: "21",
					key: "rroup"
				}]
			]);
			createLucideIcon("git-pull-request", [
				["circle", {
					cx: "18",
					cy: "18",
					r: "3",
					key: "1xkwt0"
				}],
				["circle", {
					cx: "6",
					cy: "6",
					r: "3",
					key: "1lh9wr"
				}],
				["path", {
					d: "M13 6h3a2 2 0 0 1 2 2v7",
					key: "1yeb86"
				}],
				["line", {
					x1: "6",
					x2: "6",
					y1: "9",
					y2: "21",
					key: "rroup"
				}]
			]);
			createLucideIcon("glass-water", [["path", {
				d: "M5.116 4.104A1 1 0 0 1 6.11 3h11.78a1 1 0 0 1 .994 1.105L17.19 20.21A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-2-1.79z",
				key: "p55z4y"
			}], ["path", {
				d: "M6 12a5 5 0 0 1 6 0 5 5 0 0 0 6 0",
				key: "mjntcy"
			}]]);
			createLucideIcon("glasses", [
				["circle", {
					cx: "6",
					cy: "15",
					r: "4",
					key: "vux9w4"
				}],
				["circle", {
					cx: "18",
					cy: "15",
					r: "4",
					key: "18o8ve"
				}],
				["path", {
					d: "M14 15a2 2 0 0 0-2-2 2 2 0 0 0-2 2",
					key: "1ag4bs"
				}],
				["path", {
					d: "M2.5 13 5 7c.7-1.3 1.4-2 3-2",
					key: "1hm1gs"
				}],
				["path", {
					d: "M21.5 13 19 7c-.7-1.3-1.5-2-3-2",
					key: "1r31ai"
				}]
			]);
			createLucideIcon("globe-check", [["path", {
				d: "m15 6 2 2 4-4",
				key: "levio8"
			}], ["path", {
				d: "M2 12h20A10 10 0 1 1 12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 4-10",
				key: "46evmv"
			}]]);
			createLucideIcon("globe-lock", [
				["path", {
					d: "M15.686 15A14.5 14.5 0 0 1 12 22a14.5 14.5 0 0 1 0-20 10 10 0 1 0 9.542 13",
					key: "qkt0x6"
				}],
				["path", {
					d: "M2 12h8.5",
					key: "ovaggd"
				}],
				["path", {
					d: "M20 6V4a2 2 0 1 0-4 0v2",
					key: "1of5e8"
				}],
				["rect", {
					width: "8",
					height: "5",
					x: "14",
					y: "6",
					rx: "1",
					key: "1fmf51"
				}]
			]);
			createLucideIcon("globe-off", [
				["path", {
					d: "M10.114 4.462A14.5 14.5 0 0 1 12 2a10 10 0 0 1 9.313 13.643",
					key: "1jq2r7"
				}],
				["path", {
					d: "M15.557 15.556A14.5 14.5 0 0 1 12 22 10 10 0 0 1 4.929 4.929",
					key: "1ohfya"
				}],
				["path", {
					d: "M15.892 10.234A14.5 14.5 0 0 0 12 2a10 10 0 0 0-3.643.687",
					key: "1fyh9w"
				}],
				["path", {
					d: "M17.656 12H22",
					key: "1ttse4"
				}],
				["path", {
					d: "M19.071 19.071A10 10 0 0 1 12 22 14.5 14.5 0 0 1 8.44 8.45",
					key: "rmtjzo"
				}],
				["path", {
					d: "M2 12h10",
					key: "19562f"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}]
			]);
			createLucideIcon("globe-x", [
				["path", {
					d: "m16 3 5 5",
					key: "1husv6"
				}],
				["path", {
					d: "M2 12h20A10 10 0 1 1 12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 4-10",
					key: "46evmv"
				}],
				["path", {
					d: "m21 3-5 5",
					key: "1g5oa7"
				}]
			]);
			createLucideIcon("goal", [
				["path", {
					d: "M12 13V2l8 4-8 4",
					key: "5wlwwj"
				}],
				["path", {
					d: "M20.561 10.222a9 9 0 1 1-12.55-5.29",
					key: "1c0wjv"
				}],
				["path", {
					d: "M8.002 9.997a5 5 0 1 0 8.9 2.02",
					key: "gb1g7m"
				}]
			]);
			createLucideIcon("globe", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["path", {
					d: "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20",
					key: "13o1zl"
				}],
				["path", {
					d: "M2 12h20",
					key: "9i4pu4"
				}]
			]);
			createLucideIcon("gpu", [
				["path", {
					d: "M2 17h18a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H2",
					key: "hpo31w"
				}],
				["path", {
					d: "M2 21V3",
					key: "1bzk4w"
				}],
				["path", {
					d: "M7 17v3a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-3",
					key: "5hbqbf"
				}],
				["circle", {
					cx: "16",
					cy: "11",
					r: "2",
					key: "qt15rb"
				}],
				["circle", {
					cx: "8",
					cy: "11",
					r: "2",
					key: "ssideg"
				}]
			]);
			createLucideIcon("graduation-cap", [
				["path", {
					d: "M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z",
					key: "j76jl0"
				}],
				["path", {
					d: "M22 10v6",
					key: "1lu8f3"
				}],
				["path", {
					d: "M6 12.5V16a6 3 0 0 0 12 0v-3.5",
					key: "1r8lef"
				}]
			]);
			createLucideIcon("grape", [
				["path", {
					d: "M22 5V2l-5.89 5.89",
					key: "1eenpo"
				}],
				["circle", {
					cx: "16.6",
					cy: "15.89",
					r: "3",
					key: "xjtalx"
				}],
				["circle", {
					cx: "8.11",
					cy: "7.4",
					r: "3",
					key: "u2fv6i"
				}],
				["circle", {
					cx: "12.35",
					cy: "11.65",
					r: "3",
					key: "i6i8g7"
				}],
				["circle", {
					cx: "13.91",
					cy: "5.85",
					r: "3",
					key: "6ye0dv"
				}],
				["circle", {
					cx: "18.15",
					cy: "10.09",
					r: "3",
					key: "snx9no"
				}],
				["circle", {
					cx: "6.56",
					cy: "13.2",
					r: "3",
					key: "17x4xg"
				}],
				["circle", {
					cx: "10.8",
					cy: "17.44",
					r: "3",
					key: "1hogw9"
				}],
				["circle", {
					cx: "5",
					cy: "19",
					r: "3",
					key: "1sn6vo"
				}]
			]);
			createLucideIcon("grid-2x2-check", [["path", {
				d: "M12 3v17a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H3",
				key: "11za1p"
			}], ["path", {
				d: "m16 19 2 2 4-4",
				key: "1b14m6"
			}]]);
			createLucideIcon("grid-2x2-plus", [
				["path", {
					d: "M12 3v17a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H3",
					key: "11za1p"
				}],
				["path", {
					d: "M16 19h6",
					key: "xwg31i"
				}],
				["path", {
					d: "M19 22v-6",
					key: "qhmiwi"
				}]
			]);
			createLucideIcon("grid-2x2-x", [
				["path", {
					d: "M12 3v17a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H3",
					key: "11za1p"
				}],
				["path", {
					d: "m16.5 16.5 5 5",
					key: "zc9lw7"
				}],
				["path", {
					d: "m16.5 21.5 5-5",
					key: "1fr29m"
				}]
			]);
			createLucideIcon("grid-2x2", [
				["path", {
					d: "M12 3v18",
					key: "108xh3"
				}],
				["path", {
					d: "M3 12h18",
					key: "1i2n21"
				}],
				["rect", {
					x: "3",
					y: "3",
					width: "18",
					height: "18",
					rx: "2",
					key: "h1oib"
				}]
			]);
			createLucideIcon("grid-3x3", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["path", {
					d: "M3 15h18",
					key: "5xshup"
				}],
				["path", {
					d: "M9 3v18",
					key: "fh3hqa"
				}],
				["path", {
					d: "M15 3v18",
					key: "14nvp0"
				}]
			]);
			createLucideIcon("grid-3x2", [
				["path", {
					d: "M15 3v18",
					key: "14nvp0"
				}],
				["path", {
					d: "M3 12h18",
					key: "1i2n21"
				}],
				["path", {
					d: "M9 3v18",
					key: "fh3hqa"
				}],
				["rect", {
					x: "3",
					y: "3",
					width: "18",
					height: "18",
					rx: "2",
					key: "h1oib"
				}]
			]);
			createLucideIcon("grip-horizontal", [
				["circle", {
					cx: "12",
					cy: "9",
					r: "1",
					key: "124mty"
				}],
				["circle", {
					cx: "19",
					cy: "9",
					r: "1",
					key: "1ruzo2"
				}],
				["circle", {
					cx: "5",
					cy: "9",
					r: "1",
					key: "1a8b28"
				}],
				["circle", {
					cx: "12",
					cy: "15",
					r: "1",
					key: "1e56xg"
				}],
				["circle", {
					cx: "19",
					cy: "15",
					r: "1",
					key: "1a92ep"
				}],
				["circle", {
					cx: "5",
					cy: "15",
					r: "1",
					key: "5r1jwy"
				}]
			]);
			createLucideIcon("grip-vertical", [
				["circle", {
					cx: "9",
					cy: "12",
					r: "1",
					key: "1vctgf"
				}],
				["circle", {
					cx: "9",
					cy: "5",
					r: "1",
					key: "hp0tcf"
				}],
				["circle", {
					cx: "9",
					cy: "19",
					r: "1",
					key: "fkjjf6"
				}],
				["circle", {
					cx: "15",
					cy: "12",
					r: "1",
					key: "1tmaij"
				}],
				["circle", {
					cx: "15",
					cy: "5",
					r: "1",
					key: "19l28e"
				}],
				["circle", {
					cx: "15",
					cy: "19",
					r: "1",
					key: "f4zoj3"
				}]
			]);
			createLucideIcon("grip", [
				["circle", {
					cx: "12",
					cy: "5",
					r: "1",
					key: "gxeob9"
				}],
				["circle", {
					cx: "19",
					cy: "5",
					r: "1",
					key: "w8mnmm"
				}],
				["circle", {
					cx: "5",
					cy: "5",
					r: "1",
					key: "lttvr7"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "1",
					key: "41hilf"
				}],
				["circle", {
					cx: "19",
					cy: "12",
					r: "1",
					key: "1wjl8i"
				}],
				["circle", {
					cx: "5",
					cy: "12",
					r: "1",
					key: "1pcz8c"
				}],
				["circle", {
					cx: "12",
					cy: "19",
					r: "1",
					key: "lyex9k"
				}],
				["circle", {
					cx: "19",
					cy: "19",
					r: "1",
					key: "shf9b7"
				}],
				["circle", {
					cx: "5",
					cy: "19",
					r: "1",
					key: "bfqh0e"
				}]
			]);
			createLucideIcon("group", [
				["path", {
					d: "M3 7V5c0-1.1.9-2 2-2h2",
					key: "adw53z"
				}],
				["path", {
					d: "M17 3h2c1.1 0 2 .9 2 2v2",
					key: "an4l38"
				}],
				["path", {
					d: "M21 17v2c0 1.1-.9 2-2 2h-2",
					key: "144t0e"
				}],
				["path", {
					d: "M7 21H5c-1.1 0-2-.9-2-2v-2",
					key: "rtnfgi"
				}],
				["rect", {
					width: "7",
					height: "5",
					x: "7",
					y: "7",
					rx: "1",
					key: "1eyiv7"
				}],
				["rect", {
					width: "7",
					height: "5",
					x: "10",
					y: "12",
					rx: "1",
					key: "1qlmkx"
				}]
			]);
			createLucideIcon("guitar", [
				["path", {
					d: "m11.9 12.1 4.514-4.514",
					key: "109xqo"
				}],
				["path", {
					d: "M20.1 2.3a1 1 0 0 0-1.4 0l-1.114 1.114A2 2 0 0 0 17 4.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 17.828 7h1.344a2 2 0 0 0 1.414-.586L21.7 5.3a1 1 0 0 0 0-1.4z",
					key: "txyc8t"
				}],
				["path", {
					d: "m6 16 2 2",
					key: "16qmzd"
				}],
				["path", {
					d: "M8.23 9.85A3 3 0 0 1 11 8a5 5 0 0 1 5 5 3 3 0 0 1-1.85 2.77l-.92.38A2 2 0 0 0 12 18a4 4 0 0 1-4 4 6 6 0 0 1-6-6 4 4 0 0 1 4-4 2 2 0 0 0 1.85-1.23z",
					key: "1de1vg"
				}]
			]);
			createLucideIcon("ham", [
				["path", {
					d: "M13.144 21.144A7.274 10.445 45 1 0 2.856 10.856",
					key: "1k1t7q"
				}],
				["path", {
					d: "M13.144 21.144A7.274 4.365 45 0 0 2.856 10.856a7.274 4.365 45 0 0 10.288 10.288",
					key: "153t1g"
				}],
				["path", {
					d: "M16.565 10.435 18.6 8.4a2.501 2.501 0 1 0 1.65-4.65 2.5 2.5 0 1 0-4.66 1.66l-2.024 2.025",
					key: "gzrt0n"
				}],
				["path", {
					d: "m8.5 16.5-1-1",
					key: "otr954"
				}]
			]);
			createLucideIcon("hamburger", [
				["path", {
					d: "M12 16H4a2 2 0 1 1 0-4h16a2 2 0 1 1 0 4h-4.25",
					key: "5dloqd"
				}],
				["path", {
					d: "M5 12a2 2 0 0 1-2-2 9 7 0 0 1 18 0 2 2 0 0 1-2 2",
					key: "1vl3my"
				}],
				["path", {
					d: "M5 16a2 2 0 0 0-2 2 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 2 2 0 0 0-2-2q0 0 0 0",
					key: "1us75o"
				}],
				["path", {
					d: "m6.67 12 6.13 4.6a2 2 0 0 0 2.8-.4l3.15-4.2",
					key: "qqzweh"
				}]
			]);
			createLucideIcon("hammer", [
				["path", {
					d: "m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9",
					key: "1hayfq"
				}],
				["path", {
					d: "m18 15 4-4",
					key: "16gjal"
				}],
				["path", {
					d: "m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5",
					key: "15ts47"
				}]
			]);
			createLucideIcon("hand-coins", [
				["path", {
					d: "M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17",
					key: "geh8rc"
				}],
				["path", {
					d: "m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9",
					key: "1fto5m"
				}],
				["path", {
					d: "m2 16 6 6",
					key: "1pfhp9"
				}],
				["circle", {
					cx: "16",
					cy: "9",
					r: "2.9",
					key: "1n0dlu"
				}],
				["circle", {
					cx: "6",
					cy: "5",
					r: "3",
					key: "151irh"
				}]
			]);
			createLucideIcon("hand-fist", [
				["path", {
					d: "M12.035 17.012a3 3 0 0 0-3-3l-.311-.002a.72.72 0 0 1-.505-1.229l1.195-1.195A2 2 0 0 1 10.828 11H12a2 2 0 0 0 0-4H9.243a3 3 0 0 0-2.122.879l-2.707 2.707A4.83 4.83 0 0 0 3 14a8 8 0 0 0 8 8h2a8 8 0 0 0 8-8V7a2 2 0 1 0-4 0v2a2 2 0 1 0 4 0",
					key: "1ff7rl"
				}],
				["path", {
					d: "M13.888 9.662A2 2 0 0 0 17 8V5A2 2 0 1 0 13 5",
					key: "1xmd21"
				}],
				["path", {
					d: "M9 5A2 2 0 1 0 5 5V10",
					key: "f3wfjw"
				}],
				["path", {
					d: "M9 7V4A2 2 0 1 1 13 4V7.268",
					key: "eaoucv"
				}]
			]);
			createLucideIcon("hand-grab", [
				["path", {
					d: "M18 11.5V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1.4",
					key: "edstyy"
				}],
				["path", {
					d: "M14 10V8a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2",
					key: "19wdwo"
				}],
				["path", {
					d: "M10 9.9V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v5",
					key: "1lugqo"
				}],
				["path", {
					d: "M6 14a2 2 0 0 0-2-2a2 2 0 0 0-2 2",
					key: "1hbeus"
				}],
				["path", {
					d: "M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8 2 2 0 1 1 4 0",
					key: "1etffm"
				}]
			]);
			createLucideIcon("hand-heart", [
				["path", {
					d: "M11 14h2a2 2 0 0 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16",
					key: "1v1a37"
				}],
				["path", {
					d: "m14.45 13.39 5.05-4.694C20.196 8 21 6.85 21 5.75a2.75 2.75 0 0 0-4.797-1.837.276.276 0 0 1-.406 0A2.75 2.75 0 0 0 11 5.75c0 1.2.802 2.248 1.5 2.946L16 11.95",
					key: "fhfbnt"
				}],
				["path", {
					d: "m2 15 6 6",
					key: "10dquu"
				}],
				["path", {
					d: "m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a1 1 0 0 0-2.75-2.91",
					key: "1x6kdw"
				}]
			]);
			createLucideIcon("hand-helping", [
				["path", {
					d: "M11 12h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 14",
					key: "1j4xps"
				}],
				["path", {
					d: "m7 18 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9",
					key: "uospg8"
				}],
				["path", {
					d: "m2 13 6 6",
					key: "16e5sb"
				}]
			]);
			createLucideIcon("hand-metal", [
				["path", {
					d: "M18 12.5V10a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1.4",
					key: "wc6myp"
				}],
				["path", {
					d: "M14 11V9a2 2 0 1 0-4 0v2",
					key: "94qvcw"
				}],
				["path", {
					d: "M10 10.5V5a2 2 0 1 0-4 0v9",
					key: "m1ah89"
				}],
				["path", {
					d: "m7 15-1.76-1.76a2 2 0 0 0-2.83 2.82l3.6 3.6C7.5 21.14 9.2 22 12 22h2a8 8 0 0 0 8-8V7a2 2 0 1 0-4 0v5",
					key: "t1skq1"
				}]
			]);
			createLucideIcon("hand-platter", [
				["path", {
					d: "M12 3V2",
					key: "ar7q03"
				}],
				["path", {
					d: "m15.4 17.4 3.2-2.8a2 2 0 1 1 2.8 2.9l-3.6 3.3c-.7.8-1.7 1.2-2.8 1.2h-4c-1.1 0-2.1-.4-2.8-1.2l-1.302-1.464A1 1 0 0 0 6.151 19H5",
					key: "n2g93r"
				}],
				["path", {
					d: "M2 14h12a2 2 0 0 1 0 4h-2",
					key: "1o2jem"
				}],
				["path", {
					d: "M4 10h16",
					key: "img6z1"
				}],
				["path", {
					d: "M5 10a7 7 0 0 1 14 0",
					key: "1ega1o"
				}],
				["path", {
					d: "M5 14v6a1 1 0 0 1-1 1H2",
					key: "1hescx"
				}]
			]);
			createLucideIcon("hand", [
				["path", {
					d: "M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2",
					key: "1fvzgz"
				}],
				["path", {
					d: "M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2",
					key: "1kc0my"
				}],
				["path", {
					d: "M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8",
					key: "10h0bg"
				}],
				["path", {
					d: "M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15",
					key: "1s1gnw"
				}]
			]);
			createLucideIcon("handshake", [
				["path", {
					d: "m11 17 2 2a1 1 0 1 0 3-3",
					key: "efffak"
				}],
				["path", {
					d: "m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4",
					key: "9pr0kb"
				}],
				["path", {
					d: "m21 3 1 11h-2",
					key: "1tisrp"
				}],
				["path", {
					d: "M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3",
					key: "1uvwmv"
				}],
				["path", {
					d: "M3 4h8",
					key: "1ep09j"
				}]
			]);
			createLucideIcon("handbag", [["path", {
				d: "M2.048 18.566A2 2 0 0 0 4 21h16a2 2 0 0 0 1.952-2.434l-2-9A2 2 0 0 0 18 8H6a2 2 0 0 0-1.952 1.566z",
				key: "1qbui5"
			}], ["path", {
				d: "M8 11V6a4 4 0 0 1 8 0v5",
				key: "tcht90"
			}]]);
			createLucideIcon("hard-drive-download", [
				["path", {
					d: "M12 2v8",
					key: "1q4o3n"
				}],
				["path", {
					d: "m16 6-4 4-4-4",
					key: "6wukr"
				}],
				["rect", {
					width: "20",
					height: "8",
					x: "2",
					y: "14",
					rx: "2",
					key: "w68u3i"
				}],
				["path", {
					d: "M6 18h.01",
					key: "uhywen"
				}],
				["path", {
					d: "M10 18h.01",
					key: "h775k"
				}]
			]);
			createLucideIcon("hard-drive-upload", [
				["path", {
					d: "m16 6-4-4-4 4",
					key: "13yo43"
				}],
				["path", {
					d: "M12 2v8",
					key: "1q4o3n"
				}],
				["rect", {
					width: "20",
					height: "8",
					x: "2",
					y: "14",
					rx: "2",
					key: "w68u3i"
				}],
				["path", {
					d: "M6 18h.01",
					key: "uhywen"
				}],
				["path", {
					d: "M10 18h.01",
					key: "h775k"
				}]
			]);
			createLucideIcon("hard-drive", [
				["path", {
					d: "M10 16h.01",
					key: "1bzywj"
				}],
				["path", {
					d: "M2.212 11.577a2 2 0 0 0-.212.896V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
					key: "18tbho"
				}],
				["path", {
					d: "M21.946 12.013H2.054",
					key: "zqlbp7"
				}],
				["path", {
					d: "M6 16h.01",
					key: "1pmjb7"
				}]
			]);
			createLucideIcon("hard-hat", [
				["path", {
					d: "M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5",
					key: "1p9q5i"
				}],
				["path", {
					d: "M14 6a6 6 0 0 1 6 6v3",
					key: "1hnv84"
				}],
				["path", {
					d: "M4 15v-3a6 6 0 0 1 6-6",
					key: "9ciidu"
				}],
				["rect", {
					x: "2",
					y: "15",
					width: "20",
					height: "4",
					rx: "1",
					key: "g3x8cw"
				}]
			]);
			createLucideIcon("hash", [
				["line", {
					x1: "4",
					x2: "20",
					y1: "9",
					y2: "9",
					key: "4lhtct"
				}],
				["line", {
					x1: "4",
					x2: "20",
					y1: "15",
					y2: "15",
					key: "vyu0kd"
				}],
				["line", {
					x1: "10",
					x2: "8",
					y1: "3",
					y2: "21",
					key: "1ggp8o"
				}],
				["line", {
					x1: "16",
					x2: "14",
					y1: "3",
					y2: "21",
					key: "weycgp"
				}]
			]);
			createLucideIcon("hat-glasses", [
				["path", {
					d: "M14 18a2 2 0 0 0-4 0",
					key: "1v8fkw"
				}],
				["path", {
					d: "m19 11-2.11-6.657a2 2 0 0 0-2.752-1.148l-1.276.61A2 2 0 0 1 12 4H8.5a2 2 0 0 0-1.925 1.456L5 11",
					key: "1fkr7p"
				}],
				["path", {
					d: "M2 11h20",
					key: "3eubbj"
				}],
				["circle", {
					cx: "17",
					cy: "18",
					r: "3",
					key: "82mm0e"
				}],
				["circle", {
					cx: "7",
					cy: "18",
					r: "3",
					key: "lvkj7j"
				}]
			]);
			createLucideIcon("haze", [
				["path", {
					d: "m5.2 6.2 1.4 1.4",
					key: "17imol"
				}],
				["path", {
					d: "M2 13h2",
					key: "13gyu8"
				}],
				["path", {
					d: "M20 13h2",
					key: "16rner"
				}],
				["path", {
					d: "m17.4 7.6 1.4-1.4",
					key: "t4xlah"
				}],
				["path", {
					d: "M22 17H2",
					key: "1gtaj3"
				}],
				["path", {
					d: "M22 21H2",
					key: "1gy6en"
				}],
				["path", {
					d: "M16 13a4 4 0 0 0-8 0",
					key: "1dyczq"
				}],
				["path", {
					d: "M12 5V2.5",
					key: "1vytko"
				}]
			]);
			createLucideIcon("hd", [
				["path", {
					d: "M10 12H6",
					key: "15f2ro"
				}],
				["path", {
					d: "M10 15V9",
					key: "1lckn7"
				}],
				["path", {
					d: "M14 14.5a.5.5 0 0 0 .5.5h1a2.5 2.5 0 0 0 2.5-2.5v-1A2.5 2.5 0 0 0 15.5 9h-1a.5.5 0 0 0-.5.5z",
					key: "b3f847"
				}],
				["path", {
					d: "M6 15V9",
					key: "12stmj"
				}],
				["rect", {
					x: "2",
					y: "5",
					width: "20",
					height: "14",
					rx: "2",
					key: "qneu4z"
				}]
			]);
			createLucideIcon("hdmi-port", [["path", {
				d: "M22 9a1 1 0 00-1-1H3a1 1 0 00-1 1v4a1 1 0 001 1h.5a2 2 0 011.6.8l.3.4A2 2 0 007 16h10a2 2 0 001.6-.8l.3-.4a2 2 0 011.6-.8h.5a1 1 0 001-1z",
				key: "1kwg9h"
			}], ["path", {
				d: "M8 12h8",
				key: "1wcyev"
			}]]);
			createLucideIcon("heading-1", [
				["path", {
					d: "M4 12h8",
					key: "17cfdx"
				}],
				["path", {
					d: "M4 18V6",
					key: "1rz3zl"
				}],
				["path", {
					d: "M12 18V6",
					key: "zqpxq5"
				}],
				["path", {
					d: "m17 12 3-2v8",
					key: "1hhhft"
				}]
			]);
			createLucideIcon("heading-2", [
				["path", {
					d: "M4 12h8",
					key: "17cfdx"
				}],
				["path", {
					d: "M4 18V6",
					key: "1rz3zl"
				}],
				["path", {
					d: "M12 18V6",
					key: "zqpxq5"
				}],
				["path", {
					d: "M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1",
					key: "9jr5yi"
				}]
			]);
			createLucideIcon("heading-3", [
				["path", {
					d: "M4 12h8",
					key: "17cfdx"
				}],
				["path", {
					d: "M4 18V6",
					key: "1rz3zl"
				}],
				["path", {
					d: "M12 18V6",
					key: "zqpxq5"
				}],
				["path", {
					d: "M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2",
					key: "68ncm8"
				}],
				["path", {
					d: "M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2",
					key: "1ejuhz"
				}]
			]);
			createLucideIcon("heading-4", [
				["path", {
					d: "M12 18V6",
					key: "zqpxq5"
				}],
				["path", {
					d: "M17 10v3a1 1 0 0 0 1 1h3",
					key: "tj5zdr"
				}],
				["path", {
					d: "M21 10v8",
					key: "1kdml4"
				}],
				["path", {
					d: "M4 12h8",
					key: "17cfdx"
				}],
				["path", {
					d: "M4 18V6",
					key: "1rz3zl"
				}]
			]);
			createLucideIcon("heading-5", [
				["path", {
					d: "M4 12h8",
					key: "17cfdx"
				}],
				["path", {
					d: "M4 18V6",
					key: "1rz3zl"
				}],
				["path", {
					d: "M12 18V6",
					key: "zqpxq5"
				}],
				["path", {
					d: "M17 13v-3h4",
					key: "1nvgqp"
				}],
				["path", {
					d: "M17 17.7c.4.2.8.3 1.3.3 1.5 0 2.7-1.1 2.7-2.5S19.8 13 18.3 13H17",
					key: "2nebdn"
				}]
			]);
			createLucideIcon("heading-6", [
				["path", {
					d: "M4 12h8",
					key: "17cfdx"
				}],
				["path", {
					d: "M4 18V6",
					key: "1rz3zl"
				}],
				["path", {
					d: "M12 18V6",
					key: "zqpxq5"
				}],
				["circle", {
					cx: "19",
					cy: "16",
					r: "2",
					key: "15mx69"
				}],
				["path", {
					d: "M20 10c-2 2-3 3.5-3 6",
					key: "f35dl0"
				}]
			]);
			createLucideIcon("heading", [
				["path", {
					d: "M6 12h12",
					key: "8npq4p"
				}],
				["path", {
					d: "M6 20V4",
					key: "1w1bmo"
				}],
				["path", {
					d: "M18 20V4",
					key: "o2hl4u"
				}]
			]);
			createLucideIcon("headphones", [["path", {
				d: "M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3",
				key: "1xhozi"
			}]]);
			createLucideIcon("headphone-off", [
				["path", {
					d: "M21 14h-1.343",
					key: "1jdnxi"
				}],
				["path", {
					d: "M9.128 3.47A9 9 0 0 1 21 12v3.343",
					key: "6kipu2"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M20.414 20.414A2 2 0 0 1 19 21h-1a2 2 0 0 1-2-2v-3",
					key: "9x50f4"
				}],
				["path", {
					d: "M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 2.636-6.364",
					key: "1bkxnm"
				}]
			]);
			createLucideIcon("heart-crack", [["path", {
				d: "M12.409 5.824c-.702.792-1.15 1.496-1.415 2.166l2.153 2.156a.5.5 0 0 1 0 .707l-2.293 2.293a.5.5 0 0 0 0 .707L12 15",
				key: "idzbju"
			}], ["path", {
				d: "M13.508 20.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5a5.5 5.5 0 0 1 9.591-3.677.6.6 0 0 0 .818.001A5.5 5.5 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5z",
				key: "1su70f"
			}]]);
			createLucideIcon("headset", [["path", {
				d: "M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z",
				key: "12oyoe"
			}], ["path", {
				d: "M21 16v2a4 4 0 0 1-4 4h-5",
				key: "1x7m43"
			}]]);
			createLucideIcon("heart-handshake", [["path", {
				d: "M19.414 14.414C21 12.828 22 11.5 22 9.5a5.5 5.5 0 0 0-9.591-3.676.6.6 0 0 1-.818.001A5.5 5.5 0 0 0 2 9.5c0 2.3 1.5 4 3 5.5l5.535 5.362a2 2 0 0 0 2.879.052 2.12 2.12 0 0 0-.004-3 2.124 2.124 0 1 0 3-3 2.124 2.124 0 0 0 3.004 0 2 2 0 0 0 0-2.828l-1.881-1.882a2.41 2.41 0 0 0-3.409 0l-1.71 1.71a2 2 0 0 1-2.828 0 2 2 0 0 1 0-2.828l2.823-2.762",
				key: "17lmqv"
			}]]);
			createLucideIcon("heart-minus", [["path", {
				d: "m14.876 18.99-1.368 1.323a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5a5.2 5.2 0 0 1-.244 1.572",
				key: "15yztm"
			}], ["path", {
				d: "M15 15h6",
				key: "1u4692"
			}]]);
			createLucideIcon("heart-plus", [
				["path", {
					d: "m14.479 19.374-.971.939a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5a5.2 5.2 0 0 1-.219 1.49",
					key: "wg5jx"
				}],
				["path", {
					d: "M15 15h6",
					key: "1u4692"
				}],
				["path", {
					d: "M18 12v6",
					key: "1houu1"
				}]
			]);
			createLucideIcon("heart-off", [
				["path", {
					d: "M10.5 4.893a5.5 5.5 0 0 1 1.091.931.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 1.872-1.002 3.356-2.187 4.655",
					key: "1inpfl"
				}],
				["path", {
					d: "m16.967 16.967-3.459 3.346a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5a5.5 5.5 0 0 1 2.747-4.761",
					key: "vbc6x7"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}]
			]);
			createLucideIcon("heart-pulse", [["path", {
				d: "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5",
				key: "mvr1a0"
			}], ["path", {
				d: "M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27",
				key: "auskq0"
			}]]);
			createLucideIcon("heart-x", [
				["path", {
					d: "m15.5 12.5 5 5",
					key: "15wbfr"
				}],
				["path", {
					d: "m20.5 12.5-5 5",
					key: "o012pn"
				}],
				["path", {
					d: "M21.955 8.774a5.5 5.5 0 0 0-9.546-2.95.6.6 0 0 1-.818 0A5.5 5.5 0 0 0 2 9.5c0 2.3 1.5 4 3 5.5l5.508 5.332a2 2 0 0 0 2.57.352",
					key: "c1obtn"
				}]
			]);
			createLucideIcon("heart", [["path", {
				d: "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5",
				key: "mvr1a0"
			}]]);
			createLucideIcon("heater", [
				["path", {
					d: "M11 8c2-3-2-3 0-6",
					key: "1ldv5m"
				}],
				["path", {
					d: "M15.5 8c2-3-2-3 0-6",
					key: "1otqoz"
				}],
				["path", {
					d: "M6 10h.01",
					key: "1lbq93"
				}],
				["path", {
					d: "M6 14h.01",
					key: "zudwn7"
				}],
				["path", {
					d: "M10 16v-4",
					key: "1c25yv"
				}],
				["path", {
					d: "M14 16v-4",
					key: "1dkbt8"
				}],
				["path", {
					d: "M18 16v-4",
					key: "1yg9me"
				}],
				["path", {
					d: "M20 6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3",
					key: "1ubg90"
				}],
				["path", {
					d: "M5 20v2",
					key: "1abpe8"
				}],
				["path", {
					d: "M19 20v2",
					key: "kqn6ft"
				}]
			]);
			createLucideIcon("helicopter", [
				["path", {
					d: "M11 17v4",
					key: "14wq8k"
				}],
				["path", {
					d: "M14 3v8a2 2 0 0 0 2 2h5.865",
					key: "12oo5h"
				}],
				["path", {
					d: "M17 17v4",
					key: "hdt4hh"
				}],
				["path", {
					d: "M18 17a4 4 0 0 0 4-4 8 6 0 0 0-8-6 6 5 0 0 0-6 5v3a2 2 0 0 0 2 2z",
					key: "yynif"
				}],
				["path", {
					d: "M2 10v5",
					key: "sa5akn"
				}],
				["path", {
					d: "M6 3h16",
					key: "27qw71"
				}],
				["path", {
					d: "M7 21h14",
					key: "1ugz0u"
				}],
				["path", {
					d: "M8 13H2",
					key: "1thz1o"
				}]
			]);
			createLucideIcon("hexagon", [["path", {
				d: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
				key: "yt0hxn"
			}]]);
			createLucideIcon("highlighter", [["path", {
				d: "m9 11-6 6v3h9l3-3",
				key: "1a3l36"
			}], ["path", {
				d: "m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4",
				key: "14a9rk"
			}]]);
			createLucideIcon("hop-off", [
				["path", {
					d: "M10.82 16.12c1.69.6 3.91.79 5.18.85.28.01.53-.09.7-.27",
					key: "qyzcap"
				}],
				["path", {
					d: "M11.14 20.57c.52.24 2.44 1.12 4.08 1.37.46.06.86-.25.9-.71.12-1.52-.3-3.43-.5-4.28",
					key: "y078lb"
				}],
				["path", {
					d: "M16.13 21.05c1.65.63 3.68.84 4.87.91a.9.9 0 0 0 .7-.26",
					key: "1utre3"
				}],
				["path", {
					d: "M17.99 5.52a20.83 20.83 0 0 1 3.15 4.5.8.8 0 0 1-.68 1.13c-1.17.1-2.5.02-3.9-.25",
					key: "17o9hm"
				}],
				["path", {
					d: "M20.57 11.14c.24.52 1.12 2.44 1.37 4.08.04.3-.08.59-.31.75",
					key: "1d1n4p"
				}],
				["path", {
					d: "M4.93 4.93a10 10 0 0 0-.67 13.4c.35.43.96.4 1.17-.12.69-1.71 1.07-5.07 1.07-6.71 1.34.45 3.1.9 4.88.62a.85.85 0 0 0 .48-.24",
					key: "9uv3tt"
				}],
				["path", {
					d: "M5.52 17.99c1.05.95 2.91 2.42 4.5 3.15a.8.8 0 0 0 1.13-.68c.2-2.34-.33-5.3-1.57-8.28",
					key: "1292wz"
				}],
				["path", {
					d: "M8.35 2.68a10 10 0 0 1 9.98 1.58c.43.35.4.96-.12 1.17-1.5.6-4.3.98-6.07 1.05",
					key: "7ozu9p"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}]
			]);
			createLucideIcon("hop", [
				["path", {
					d: "M10.82 16.12c1.69.6 3.91.79 5.18.85.55.03 1-.42.97-.97-.06-1.27-.26-3.5-.85-5.18",
					key: "18lxf1"
				}],
				["path", {
					d: "M11.5 6.5c1.64 0 5-.38 6.71-1.07.52-.2.55-.82.12-1.17A10 10 0 0 0 4.26 18.33c.35.43.96.4 1.17-.12.69-1.71 1.07-5.07 1.07-6.71 1.34.45 3.1.9 4.88.62a.88.88 0 0 0 .73-.74c.3-2.14-.15-3.5-.61-4.88",
					key: "vtfxrw"
				}],
				["path", {
					d: "M15.62 16.95c.2.85.62 2.76.5 4.28a.77.77 0 0 1-.9.7 16.64 16.64 0 0 1-4.08-1.36",
					key: "13hl71"
				}],
				["path", {
					d: "M16.13 21.05c1.65.63 3.68.84 4.87.91a.9.9 0 0 0 .96-.96 17.68 17.68 0 0 0-.9-4.87",
					key: "1sl8oj"
				}],
				["path", {
					d: "M16.94 15.62c.86.2 2.77.62 4.29.5a.77.77 0 0 0 .7-.9 16.64 16.64 0 0 0-1.36-4.08",
					key: "19c6kt"
				}],
				["path", {
					d: "M17.99 5.52a20.82 20.82 0 0 1 3.15 4.5.8.8 0 0 1-.68 1.13c-2.33.2-5.3-.32-8.27-1.57",
					key: "85ghs3"
				}],
				["path", {
					d: "M4.93 4.93 3 3a.7.7 0 0 1 0-1",
					key: "x087yj"
				}],
				["path", {
					d: "M9.58 12.18c1.24 2.98 1.77 5.95 1.57 8.28a.8.8 0 0 1-1.13.68 20.82 20.82 0 0 1-4.5-3.15",
					key: "11xdqo"
				}]
			]);
			createLucideIcon("hospital", [
				["path", {
					d: "M12 7v4",
					key: "xawao1"
				}],
				["path", {
					d: "M14 21v-3a2 2 0 0 0-4 0v3",
					key: "1rgiei"
				}],
				["path", {
					d: "M14 9h-4",
					key: "1w2s2s"
				}],
				["path", {
					d: "M18 11h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2",
					key: "1tthqt"
				}],
				["path", {
					d: "M18 21V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16",
					key: "dw4p4i"
				}]
			]);
			createLucideIcon("hotel", [
				["path", {
					d: "M10 22v-6.57",
					key: "1wmca3"
				}],
				["path", {
					d: "M12 11h.01",
					key: "z322tv"
				}],
				["path", {
					d: "M12 7h.01",
					key: "1ivr5q"
				}],
				["path", {
					d: "M14 15.43V22",
					key: "1q2vjd"
				}],
				["path", {
					d: "M15 16a5 5 0 0 0-6 0",
					key: "o9wqvi"
				}],
				["path", {
					d: "M16 11h.01",
					key: "xkw8gn"
				}],
				["path", {
					d: "M16 7h.01",
					key: "1kdx03"
				}],
				["path", {
					d: "M8 11h.01",
					key: "1dfujw"
				}],
				["path", {
					d: "M8 7h.01",
					key: "1vti4s"
				}],
				["rect", {
					x: "4",
					y: "2",
					width: "16",
					height: "20",
					rx: "2",
					key: "1uxh74"
				}]
			]);
			createLucideIcon("hourglass", [
				["path", {
					d: "M5 22h14",
					key: "ehvnwv"
				}],
				["path", {
					d: "M5 2h14",
					key: "pdyrp9"
				}],
				["path", {
					d: "M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22",
					key: "1d314k"
				}],
				["path", {
					d: "M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2",
					key: "1vvvr6"
				}]
			]);
			createLucideIcon("house-heart", [["path", {
				d: "M8.62 13.8A2.25 2.25 0 1 1 12 10.836a2.25 2.25 0 1 1 3.38 2.966l-2.626 2.856a.998.998 0 0 1-1.507 0z",
				key: "n9s7kx"
			}], ["path", {
				d: "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
				key: "r6nss1"
			}]]);
			createLucideIcon("house-plug", [
				["path", {
					d: "M10 12V8.964",
					key: "1vll13"
				}],
				["path", {
					d: "M14 12V8.964",
					key: "1x3qvg"
				}],
				["path", {
					d: "M15 12a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2a1 1 0 0 1 1-1z",
					key: "ppykja"
				}],
				["path", {
					d: "M8.5 21H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-2",
					key: "365xoy"
				}]
			]);
			createLucideIcon("house-plus", [
				["path", {
					d: "M12.35 21H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v2.35",
					key: "8ek5ge"
				}],
				["path", {
					d: "M14.8 12.4A1 1 0 0 0 14 12h-4a1 1 0 0 0-1 1v8",
					key: "1rbg29"
				}],
				["path", {
					d: "M15 18h6",
					key: "3b3c90"
				}],
				["path", {
					d: "M18 15v6",
					key: "9wciyi"
				}]
			]);
			createLucideIcon("house-wifi", [
				["path", {
					d: "M9.5 13.866a4 4 0 0 1 5 .01",
					key: "1wy54i"
				}],
				["path", {
					d: "M12 17h.01",
					key: "p32p05"
				}],
				["path", {
					d: "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
					key: "r6nss1"
				}],
				["path", {
					d: "M7 10.754a8 8 0 0 1 10 0",
					key: "exoy2g"
				}]
			]);
			createLucideIcon("house", [["path", {
				d: "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",
				key: "5wwlr5"
			}], ["path", {
				d: "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
				key: "r6nss1"
			}]]);
			createLucideIcon("ice-cream-bowl", [
				["path", {
					d: "M12 17c5 0 8-2.69 8-6H4c0 3.31 3 6 8 6m-4 4h8m-4-3v3M5.14 11a3.5 3.5 0 1 1 6.71 0",
					key: "1uxfcu"
				}],
				["path", {
					d: "M12.14 11a3.5 3.5 0 1 1 6.71 0",
					key: "4k3m1s"
				}],
				["path", {
					d: "M15.5 6.5a3.5 3.5 0 1 0-7 0",
					key: "zmuahr"
				}]
			]);
			createLucideIcon("ice-cream-cone", [
				["path", {
					d: "m7 11 4.08 10.35a1 1 0 0 0 1.84 0L17 11",
					key: "1v6356"
				}],
				["path", {
					d: "M17 7A5 5 0 0 0 7 7",
					key: "151p3v"
				}],
				["path", {
					d: "M17 7a2 2 0 0 1 0 4H7a2 2 0 0 1 0-4",
					key: "1sdaij"
				}]
			]);
			createLucideIcon("id-card-lanyard", [
				["path", {
					d: "M13.5 8h-3",
					key: "xvov4w"
				}],
				["path", {
					d: "m15 2-1 2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3",
					key: "16uttc"
				}],
				["path", {
					d: "M16.899 22A5 5 0 0 0 7.1 22",
					key: "1d0ppr"
				}],
				["path", {
					d: "m9 2 3 6",
					key: "1o7bd9"
				}],
				["circle", {
					cx: "12",
					cy: "15",
					r: "3",
					key: "g36mzq"
				}]
			]);
			createLucideIcon("id-card", [
				["path", {
					d: "M16 10h2",
					key: "8sgtl7"
				}],
				["path", {
					d: "M16 14h2",
					key: "epxaof"
				}],
				["path", {
					d: "M6.17 15a3 3 0 0 1 5.66 0",
					key: "n6f512"
				}],
				["circle", {
					cx: "9",
					cy: "11",
					r: "2",
					key: "yxgjnd"
				}],
				["rect", {
					x: "2",
					y: "5",
					width: "20",
					height: "14",
					rx: "2",
					key: "qneu4z"
				}]
			]);
			createLucideIcon("image-down", [
				["path", {
					d: "M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21",
					key: "9csbqa"
				}],
				["path", {
					d: "m14 19 3 3v-5.5",
					key: "9ldu5r"
				}],
				["path", {
					d: "m17 22 3-3",
					key: "1nkfve"
				}],
				["circle", {
					cx: "9",
					cy: "9",
					r: "2",
					key: "af1f0g"
				}]
			]);
			createLucideIcon("image-minus", [
				["path", {
					d: "M21 9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7",
					key: "m87ecr"
				}],
				["line", {
					x1: "16",
					x2: "22",
					y1: "5",
					y2: "5",
					key: "ez7e4s"
				}],
				["circle", {
					cx: "9",
					cy: "9",
					r: "2",
					key: "af1f0g"
				}],
				["path", {
					d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21",
					key: "1xmnt7"
				}]
			]);
			createLucideIcon("image-off", [
				["line", {
					x1: "2",
					x2: "22",
					y1: "2",
					y2: "22",
					key: "a6p6uj"
				}],
				["path", {
					d: "M10.41 10.41a2 2 0 1 1-2.83-2.83",
					key: "1bzlo9"
				}],
				["line", {
					x1: "13.5",
					x2: "6",
					y1: "13.5",
					y2: "21",
					key: "1q0aeu"
				}],
				["line", {
					x1: "18",
					x2: "21",
					y1: "12",
					y2: "15",
					key: "5mozeu"
				}],
				["path", {
					d: "M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59",
					key: "mmje98"
				}],
				["path", {
					d: "M21 15V5a2 2 0 0 0-2-2H9",
					key: "43el77"
				}]
			]);
			createLucideIcon("image-play", [
				["path", {
					d: "M15 15.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997a1 1 0 0 1-1.517-.86z",
					key: "nrt1m3"
				}],
				["path", {
					d: "M21 12.17V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6",
					key: "99hgts"
				}],
				["path", {
					d: "m6 21 5-5",
					key: "1wyjai"
				}],
				["circle", {
					cx: "9",
					cy: "9",
					r: "2",
					key: "af1f0g"
				}]
			]);
			createLucideIcon("image-plus", [
				["path", {
					d: "M16 5h6",
					key: "1vod17"
				}],
				["path", {
					d: "M19 2v6",
					key: "4bpg5p"
				}],
				["path", {
					d: "M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5",
					key: "1ue2ih"
				}],
				["path", {
					d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21",
					key: "1xmnt7"
				}],
				["circle", {
					cx: "9",
					cy: "9",
					r: "2",
					key: "af1f0g"
				}]
			]);
			createLucideIcon("image-up", [
				["path", {
					d: "M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21",
					key: "9csbqa"
				}],
				["path", {
					d: "m14 19.5 3-3 3 3",
					key: "9vmjn0"
				}],
				["path", {
					d: "M17 22v-5.5",
					key: "1aa6fl"
				}],
				["circle", {
					cx: "9",
					cy: "9",
					r: "2",
					key: "af1f0g"
				}]
			]);
			createLucideIcon("image-upscale", [
				["path", {
					d: "M16 3h5v5",
					key: "1806ms"
				}],
				["path", {
					d: "M17 21h2a2 2 0 0 0 2-2",
					key: "130fy9"
				}],
				["path", {
					d: "M21 12v3",
					key: "1wzk3p"
				}],
				["path", {
					d: "m21 3-5 5",
					key: "1g5oa7"
				}],
				["path", {
					d: "M3 7V5a2 2 0 0 1 2-2",
					key: "kk3yz1"
				}],
				["path", {
					d: "m5 21 4.144-4.144a1.21 1.21 0 0 1 1.712 0L13 19",
					key: "fyekpt"
				}],
				["path", {
					d: "M9 3h3",
					key: "d52fa"
				}],
				["rect", {
					x: "3",
					y: "11",
					width: "10",
					height: "10",
					rx: "1",
					key: "1wpmix"
				}]
			]);
			createLucideIcon("images", [
				["path", {
					d: "m22 11-1.296-1.296a2.4 2.4 0 0 0-3.408 0L11 16",
					key: "9kzy35"
				}],
				["path", {
					d: "M4 8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2",
					key: "1t0f0t"
				}],
				["circle", {
					cx: "13",
					cy: "7",
					r: "1",
					fill: "currentColor",
					key: "1obus6"
				}],
				["rect", {
					x: "8",
					y: "2",
					width: "14",
					height: "14",
					rx: "2",
					key: "1gvhby"
				}]
			]);
			const Image = createLucideIcon("image", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					ry: "2",
					key: "1m3agn"
				}],
				["circle", {
					cx: "9",
					cy: "9",
					r: "2",
					key: "af1f0g"
				}],
				["path", {
					d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21",
					key: "1xmnt7"
				}]
			]);
			createLucideIcon("import", [
				["path", {
					d: "M12 3v12",
					key: "1x0j5s"
				}],
				["path", {
					d: "m8 11 4 4 4-4",
					key: "1dohi6"
				}],
				["path", {
					d: "M8 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4",
					key: "1ywtjm"
				}]
			]);
			createLucideIcon("inbox", [["polyline", {
				points: "22 12 16 12 14 15 10 15 8 12 2 12",
				key: "o97t9d"
			}], ["path", {
				d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
				key: "oot6mr"
			}]]);
			createLucideIcon("indian-rupee", [
				["path", {
					d: "M6 3h12",
					key: "ggurg9"
				}],
				["path", {
					d: "M6 8h12",
					key: "6g4wlu"
				}],
				["path", {
					d: "m6 13 8.5 8",
					key: "u1kupk"
				}],
				["path", {
					d: "M6 13h3",
					key: "wdp6ag"
				}],
				["path", {
					d: "M9 13c6.667 0 6.667-10 0-10",
					key: "1nkvk2"
				}]
			]);
			createLucideIcon("infinity", [["path", {
				d: "M6 16c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8",
				key: "18ogeb"
			}]]);
			createLucideIcon("info", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["path", {
					d: "M12 16v-4",
					key: "1dtifu"
				}],
				["path", {
					d: "M12 8h.01",
					key: "e9boi3"
				}]
			]);
			createLucideIcon("inspection-panel", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M7 7h.01",
					key: "7u93v4"
				}],
				["path", {
					d: "M17 7h.01",
					key: "14a9sn"
				}],
				["path", {
					d: "M7 17h.01",
					key: "19xn7k"
				}],
				["path", {
					d: "M17 17h.01",
					key: "1sd3ek"
				}]
			]);
			createLucideIcon("italic", [
				["line", {
					x1: "19",
					x2: "10",
					y1: "4",
					y2: "4",
					key: "15jd3p"
				}],
				["line", {
					x1: "14",
					x2: "5",
					y1: "20",
					y2: "20",
					key: "bu0au3"
				}],
				["line", {
					x1: "15",
					x2: "9",
					y1: "4",
					y2: "20",
					key: "uljnxc"
				}]
			]);
			createLucideIcon("iteration-ccw", [["path", {
				d: "m16 14 4 4-4 4",
				key: "hkso8o"
			}], ["path", {
				d: "M20 10a8 8 0 1 0-8 8h8",
				key: "1bik7b"
			}]]);
			createLucideIcon("iteration-cw", [["path", {
				d: "M4 10a8 8 0 1 1 8 8H4",
				key: "svv66n"
			}], ["path", {
				d: "m8 22-4-4 4-4",
				key: "6g7gki"
			}]]);
			createLucideIcon("japanese-yen", [
				["path", {
					d: "M12 9.5V21m0-11.5L6 3m6 6.5L18 3",
					key: "2ej80x"
				}],
				["path", {
					d: "M6 15h12",
					key: "1hwgt5"
				}],
				["path", {
					d: "M6 11h12",
					key: "wf4gp6"
				}]
			]);
			createLucideIcon("joystick", [
				["path", {
					d: "M21 17a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2Z",
					key: "jg2n2t"
				}],
				["path", {
					d: "M6 15v-2",
					key: "gd6mvg"
				}],
				["path", {
					d: "M12 15V9",
					key: "8c7uyn"
				}],
				["circle", {
					cx: "12",
					cy: "6",
					r: "3",
					key: "1gm2ql"
				}]
			]);
			createLucideIcon("kayak", [
				["path", {
					d: "M18 17a1 1 0 0 0-1 1v1a2 2 0 1 0 2-2z",
					key: "skzb1g"
				}],
				["path", {
					d: "M20.97 3.61a.45.45 0 0 0-.58-.58C10.2 6.6 6.6 10.2 3.03 20.39a.45.45 0 0 0 .58.58C13.8 17.4 17.4 13.8 20.97 3.61",
					key: "cv9jm7"
				}],
				["path", {
					d: "m6.707 6.707 10.586 10.586",
					key: "d2l993"
				}],
				["path", {
					d: "M7 5a2 2 0 1 0-2 2h1a1 1 0 0 0 1-1z",
					key: "i0et4n"
				}]
			]);
			createLucideIcon("kanban", [
				["path", {
					d: "M5 3v14",
					key: "9nsxs2"
				}],
				["path", {
					d: "M12 3v8",
					key: "1h2ygw"
				}],
				["path", {
					d: "M19 3v18",
					key: "1sk56x"
				}]
			]);
			createLucideIcon("key-round", [["path", {
				d: "M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z",
				key: "1s6t7t"
			}], ["circle", {
				cx: "16.5",
				cy: "7.5",
				r: ".5",
				fill: "currentColor",
				key: "w0ekpg"
			}]]);
			createLucideIcon("key-square", [
				["path", {
					d: "M12.4 2.7a2.5 2.5 0 0 1 3.4 0l5.5 5.5a2.5 2.5 0 0 1 0 3.4l-3.7 3.7a2.5 2.5 0 0 1-3.4 0L8.7 9.8a2.5 2.5 0 0 1 0-3.4z",
					key: "165ttr"
				}],
				["path", {
					d: "m14 7 3 3",
					key: "1r5n42"
				}],
				["path", {
					d: "m9.4 10.6-6.814 6.814A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814",
					key: "1ubxi2"
				}]
			]);
			createLucideIcon("key", [
				["path", {
					d: "m2 21 9.6-9.6",
					key: "9l79m3"
				}],
				["path", {
					d: "m7.5 15.5 2.3 2.3a1 1 0 0 1 0 1.4l-2.1 2.1a1 1 0 0 1-1.4 0L4 19",
					key: "fw8biw"
				}],
				["circle", {
					cx: "15.5",
					cy: "7.5",
					r: "5.5",
					key: "4wxmhb"
				}]
			]);
			createLucideIcon("keyboard-music", [
				["rect", {
					width: "20",
					height: "16",
					x: "2",
					y: "4",
					rx: "2",
					key: "18n3k1"
				}],
				["path", {
					d: "M6 8h4",
					key: "utf9t1"
				}],
				["path", {
					d: "M14 8h.01",
					key: "1primd"
				}],
				["path", {
					d: "M18 8h.01",
					key: "emo2bl"
				}],
				["path", {
					d: "M2 12h20",
					key: "9i4pu4"
				}],
				["path", {
					d: "M6 12v4",
					key: "dy92yo"
				}],
				["path", {
					d: "M10 12v4",
					key: "1fxnav"
				}],
				["path", {
					d: "M14 12v4",
					key: "1hft58"
				}],
				["path", {
					d: "M18 12v4",
					key: "tjjnbz"
				}]
			]);
			createLucideIcon("keyboard-off", [
				["path", {
					d: "M 20 4 A2 2 0 0 1 22 6",
					key: "1g1fkt"
				}],
				["path", {
					d: "M 22 6 L 22 16.41",
					key: "1qjg3w"
				}],
				["path", {
					d: "M 7 16 L 16 16",
					key: "n0yqwb"
				}],
				["path", {
					d: "M 9.69 4 L 20 4",
					key: "kbpcgx"
				}],
				["path", {
					d: "M14 8h.01",
					key: "1primd"
				}],
				["path", {
					d: "M18 8h.01",
					key: "emo2bl"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2",
					key: "s23sx2"
				}],
				["path", {
					d: "M6 8h.01",
					key: "x9i8wu"
				}],
				["path", {
					d: "M8 12h.01",
					key: "czm47f"
				}]
			]);
			createLucideIcon("keyboard", [
				["path", {
					d: "M10 8h.01",
					key: "1r9ogq"
				}],
				["path", {
					d: "M12 12h.01",
					key: "1mp3jc"
				}],
				["path", {
					d: "M14 8h.01",
					key: "1primd"
				}],
				["path", {
					d: "M16 12h.01",
					key: "1l6xoz"
				}],
				["path", {
					d: "M18 8h.01",
					key: "emo2bl"
				}],
				["path", {
					d: "M6 8h.01",
					key: "x9i8wu"
				}],
				["path", {
					d: "M7 16h10",
					key: "wp8him"
				}],
				["path", {
					d: "M8 12h.01",
					key: "czm47f"
				}],
				["rect", {
					width: "20",
					height: "16",
					x: "2",
					y: "4",
					rx: "2",
					key: "18n3k1"
				}]
			]);
			createLucideIcon("lamp-ceiling", [
				["path", {
					d: "M12 2v5",
					key: "nd4vlx"
				}],
				["path", {
					d: "M14.829 15.998a3 3 0 1 1-5.658 0",
					key: "1pybiy"
				}],
				["path", {
					d: "M20.92 14.606A1 1 0 0 1 20 16H4a1 1 0 0 1-.92-1.394l3-7A1 1 0 0 1 7 7h10a1 1 0 0 1 .92.606z",
					key: "ma1wor"
				}]
			]);
			createLucideIcon("lamp-desk", [
				["path", {
					d: "M10.293 2.293a1 1 0 0 1 1.414 0l2.5 2.5 5.994 1.227a1 1 0 0 1 .506 1.687l-7 7a1 1 0 0 1-1.687-.506l-1.227-5.994-2.5-2.5a1 1 0 0 1 0-1.414z",
					key: "sb8slu"
				}],
				["path", {
					d: "m14.207 4.793-3.414 3.414",
					key: "m2x3oj"
				}],
				["path", {
					d: "M3 20a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z",
					key: "8b3myj"
				}],
				["path", {
					d: "m9.086 6.5-4.793 4.793a1 1 0 0 0-.18 1.17L7 18",
					key: "43s6cu"
				}]
			]);
			createLucideIcon("lamp-floor", [
				["path", {
					d: "M12 10v12",
					key: "6ubwww"
				}],
				["path", {
					d: "M17.929 7.629A1 1 0 0 1 17 9H7a1 1 0 0 1-.928-1.371l2-5A1 1 0 0 1 9 2h6a1 1 0 0 1 .928.629z",
					key: "1o95gh"
				}],
				["path", {
					d: "M9 22h6",
					key: "1rlq3v"
				}]
			]);
			createLucideIcon("lamp-wall-down", [
				["path", {
					d: "M19.929 18.629A1 1 0 0 1 19 20H9a1 1 0 0 1-.928-1.371l2-5A1 1 0 0 1 11 13h6a1 1 0 0 1 .928.629z",
					key: "u4w2d7"
				}],
				["path", {
					d: "M6 3a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z",
					key: "15356w"
				}],
				["path", {
					d: "M8 6h4a2 2 0 0 1 2 2v5",
					key: "1m6m7x"
				}]
			]);
			createLucideIcon("lamp-wall-up", [
				["path", {
					d: "M19.929 9.629A1 1 0 0 1 19 11H9a1 1 0 0 1-.928-1.371l2-5A1 1 0 0 1 11 4h6a1 1 0 0 1 .928.629z",
					key: "1uvrbf"
				}],
				["path", {
					d: "M6 15a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z",
					key: "154r2a"
				}],
				["path", {
					d: "M8 18h4a2 2 0 0 0 2-2v-5",
					key: "z9mbu0"
				}]
			]);
			createLucideIcon("lamp", [
				["path", {
					d: "M12 12v6",
					key: "3ahymv"
				}],
				["path", {
					d: "M4.077 10.615A1 1 0 0 0 5 12h14a1 1 0 0 0 .923-1.385l-3.077-7.384A2 2 0 0 0 15 2H9a2 2 0 0 0-1.846 1.23Z",
					key: "1l7kg2"
				}],
				["path", {
					d: "M8 20a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z",
					key: "1mmzpi"
				}]
			]);
			createLucideIcon("land-plot", [
				["path", {
					d: "m12 8 6-3-6-3v10",
					key: "mvpnpy"
				}],
				["path", {
					d: "m8 11.99-5.5 3.14a1 1 0 0 0 0 1.74l8.5 4.86a2 2 0 0 0 2 0l8.5-4.86a1 1 0 0 0 0-1.74L16 12",
					key: "ek95tt"
				}],
				["path", {
					d: "m6.49 12.85 11.02 6.3",
					key: "1kt42w"
				}],
				["path", {
					d: "M17.51 12.85 6.5 19.15",
					key: "v55bdg"
				}]
			]);
			createLucideIcon("landmark", [
				["path", {
					d: "M10 18v-7",
					key: "wt116b"
				}],
				["path", {
					d: "M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z",
					key: "yxxwt6"
				}],
				["path", {
					d: "M14 18v-7",
					key: "vav6t3"
				}],
				["path", {
					d: "M18 18v-7",
					key: "aexdmj"
				}],
				["path", {
					d: "M3 22h18",
					key: "8prr45"
				}],
				["path", {
					d: "M6 18v-7",
					key: "1ivflk"
				}]
			]);
			createLucideIcon("languages", [
				["path", {
					d: "m5 8 6 6",
					key: "1wu5hv"
				}],
				["path", {
					d: "m4 14 6-6 2-3",
					key: "1k1g8d"
				}],
				["path", {
					d: "M2 5h12",
					key: "or177f"
				}],
				["path", {
					d: "M7 2h1",
					key: "1t2jsx"
				}],
				["path", {
					d: "m22 22-5-10-5 10",
					key: "don7ne"
				}],
				["path", {
					d: "M14 18h6",
					key: "1m8k6r"
				}]
			]);
			createLucideIcon("laptop-minimal-check", [
				["path", {
					d: "M2 20h20",
					key: "owomy5"
				}],
				["path", {
					d: "m9 10 2 2 4-4",
					key: "1gnqz4"
				}],
				["rect", {
					x: "3",
					y: "4",
					width: "18",
					height: "12",
					rx: "2",
					key: "8ur36m"
				}]
			]);
			createLucideIcon("laptop-minimal", [["rect", {
				width: "18",
				height: "12",
				x: "3",
				y: "4",
				rx: "2",
				ry: "2",
				key: "1qhy41"
			}], ["line", {
				x1: "2",
				x2: "22",
				y1: "20",
				y2: "20",
				key: "ni3hll"
			}]]);
			createLucideIcon("laptop", [["path", {
				d: "M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2z",
				key: "1pdavp"
			}], ["path", {
				d: "M20.054 15.987H3.946",
				key: "14rxg9"
			}]]);
			createLucideIcon("lasso-select", [
				["path", {
					d: "M7 22a5 5 0 0 1-2-4",
					key: "umushi"
				}],
				["path", {
					d: "M7 16.93c.96.43 1.96.74 2.99.91",
					key: "ybbtv3"
				}],
				["path", {
					d: "M3.34 14A6.8 6.8 0 0 1 2 10c0-4.42 4.48-8 10-8s10 3.58 10 8a7.19 7.19 0 0 1-.33 2",
					key: "gt5e1w"
				}],
				["path", {
					d: "M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
					key: "bq3ynw"
				}],
				["path", {
					d: "M14.33 22h-.09a.35.35 0 0 1-.24-.32v-10a.34.34 0 0 1 .33-.34c.08 0 .15.03.21.08l7.34 6a.33.33 0 0 1-.21.59h-4.49l-2.57 3.85a.35.35 0 0 1-.28.14z",
					key: "72q637"
				}]
			]);
			createLucideIcon("lasso", [
				["path", {
					d: "M3.704 14.467a10 8 0 1 1 3.115 2.375",
					key: "wxgc5m"
				}],
				["path", {
					d: "M7 22a5 5 0 0 1-2-3.994",
					key: "1xp6a4"
				}],
				["circle", {
					cx: "5",
					cy: "16",
					r: "2",
					key: "18csp3"
				}]
			]);
			createLucideIcon("layer-arrow-down", [
				["path", {
					d: "M12 10v10",
					key: "1ogziz"
				}],
				["path", {
					d: "M22 10a1 1 0 01-.59.92l-5.077 2.308",
					key: "q38q1t"
				}],
				["path", {
					d: "M22.017 10.005a1 1 0 00-.597-.916l-8.59-3.91a2 2 0 00-1.66.001L2.6 9.08a1 1 0 00-.02 1.831l5.093 2.316",
					key: "h1p4gn"
				}],
				["path", {
					d: "m9 17 3 3 3-3",
					key: "l18qqt"
				}]
			]);
			createLucideIcon("layer-arrow-up", [
				["path", {
					d: "M12 14V4",
					key: "1t7zjg"
				}],
				["path", {
					d: "M7.674 10.774 2.58 13.09a1 1 0 000 1.822l8.6 3.91a2 2 0 001.65 0l8.58-3.9a1 1 0 00.59-.92 1 1 0 00-.59-.922l-5.078-2.308",
					key: "1cy4ex"
				}],
				["path", {
					d: "m9 7 3-3 3 3",
					key: "8sjys4"
				}]
			]);
			createLucideIcon("layers-2", [["path", {
				d: "M13 13.74a2 2 0 0 1-2 0L2.5 8.87a1 1 0 0 1 0-1.74L11 2.26a2 2 0 0 1 2 0l8.5 4.87a1 1 0 0 1 0 1.74z",
				key: "15q6uc"
			}], ["path", {
				d: "m20 14.285 1.5.845a1 1 0 0 1 0 1.74L13 21.74a2 2 0 0 1-2 0l-8.5-4.87a1 1 0 0 1 0-1.74l1.5-.845",
				key: "byia6g"
			}]]);
			createLucideIcon("layers-arrow-down", [
				["path", {
					d: "M12 7v15",
					key: "1onnba"
				}],
				["path", {
					d: "M2 12a1 1 0 00.58.91l5.093 2.316",
					key: "xofxlj"
				}],
				["path", {
					d: "M22 12a1 1 0 01-.59.92l-5.077 2.308",
					key: "cc7swz"
				}],
				["path", {
					d: "M8 10.37 2.6 7.91a1 1 0 010-1.831l8.57-3.9a2 2 0 011.66.001l8.59 3.91a1 1 0 010 1.831l-5.392 2.45",
					key: "kdwjlb"
				}],
				["path", {
					d: "m9 19 3 3 3-3",
					key: "1fhphp"
				}]
			]);
			createLucideIcon("layers-arrow-up", [
				["path", {
					d: "M12 12V2",
					key: "17ugg4"
				}],
				["path", {
					d: "M2 17.002a1 1 0 00.58.91l8.6 3.91a2 2 0 001.65 0l8.58-3.9a1 1 0 00.59-.92",
					key: "1ke1hd"
				}],
				["path", {
					d: "M7.674 8.774 2.58 11.09a1 1 0 000 1.822l8.6 3.91a2 2 0 001.65 0l8.58-3.9a1 1 0 00.59-.92 1 1 0 00-.59-.922l-5.078-2.308",
					key: "hlro1u"
				}],
				["path", {
					d: "m9 5 3-3 3 3",
					key: "l8vdw6"
				}]
			]);
			createLucideIcon("layers-minus", [
				["path", {
					d: "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 .83.18 2 2 0 0 0 .83-.18l8.58-3.9a1 1 0 0 0 0-1.832z",
					key: "tq134k"
				}],
				["path", {
					d: "M16 17h6",
					key: "1ook5g"
				}],
				["path", {
					d: "M2.003 11.995a1 1 0 0 0 .597.915l8.58 3.91a2 2 0 0 0 .83.18",
					key: "8mjqed"
				}],
				["path", {
					d: "M2.003 16.995a1 1 0 0 0 .597.915l8.58 3.91a2 2 0 0 0 .83.18 2 2 0 0 0 .83-.18l2.11-.96",
					key: "7vwz41"
				}],
				["path", {
					d: "M22.018 12.004a1 1 0 0 1-.598.916l-.177.08",
					key: "bm5b9y"
				}]
			]);
			createLucideIcon("layers-plus", [
				["path", {
					d: "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 .83.18 2 2 0 0 0 .83-.18l8.58-3.9a1 1 0 0 0 0-1.831z",
					key: "zzgyd3"
				}],
				["path", {
					d: "M16 17h6",
					key: "1ook5g"
				}],
				["path", {
					d: "M19 14v6",
					key: "1ckrd5"
				}],
				["path", {
					d: "M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 .825.178",
					key: "1ia9y3"
				}],
				["path", {
					d: "M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l2.116-.962",
					key: "jksky3"
				}]
			]);
			createLucideIcon("layers", [
				["path", {
					d: "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z",
					key: "zw3jo"
				}],
				["path", {
					d: "M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12",
					key: "1wduqc"
				}],
				["path", {
					d: "M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17",
					key: "kqbvx6"
				}]
			]);
			createLucideIcon("layout-dashboard", [
				["rect", {
					width: "7",
					height: "9",
					x: "3",
					y: "3",
					rx: "1",
					key: "10lvy0"
				}],
				["rect", {
					width: "7",
					height: "5",
					x: "14",
					y: "3",
					rx: "1",
					key: "16une8"
				}],
				["rect", {
					width: "7",
					height: "9",
					x: "14",
					y: "12",
					rx: "1",
					key: "1hutg5"
				}],
				["rect", {
					width: "7",
					height: "5",
					x: "3",
					y: "16",
					rx: "1",
					key: "ldoo1y"
				}]
			]);
			createLucideIcon("layout-freeform", [
				["rect", {
					width: "7",
					height: "7",
					x: "3",
					y: "3",
					rx: "1",
					key: "1g98yp"
				}],
				["rect", {
					width: "7",
					height: "7",
					x: "14",
					y: "4",
					rx: "1",
					key: "n7b4zl"
				}],
				["rect", {
					width: "7",
					height: "7",
					x: "4",
					y: "14",
					rx: "1",
					key: "1ngf42"
				}]
			]);
			createLucideIcon("layout-grid", [
				["rect", {
					width: "7",
					height: "7",
					x: "3",
					y: "3",
					rx: "1",
					key: "1g98yp"
				}],
				["rect", {
					width: "7",
					height: "7",
					x: "14",
					y: "3",
					rx: "1",
					key: "6d4xhi"
				}],
				["rect", {
					width: "7",
					height: "7",
					x: "14",
					y: "14",
					rx: "1",
					key: "nxv5o0"
				}],
				["rect", {
					width: "7",
					height: "7",
					x: "3",
					y: "14",
					rx: "1",
					key: "1bb6yr"
				}]
			]);
			createLucideIcon("layout-list", [
				["rect", {
					width: "7",
					height: "7",
					x: "3",
					y: "3",
					rx: "1",
					key: "1g98yp"
				}],
				["rect", {
					width: "7",
					height: "7",
					x: "3",
					y: "14",
					rx: "1",
					key: "1bb6yr"
				}],
				["path", {
					d: "M14 4h7",
					key: "3xa0d5"
				}],
				["path", {
					d: "M14 9h7",
					key: "1icrd9"
				}],
				["path", {
					d: "M14 15h7",
					key: "1mj8o2"
				}],
				["path", {
					d: "M14 20h7",
					key: "11slyb"
				}]
			]);
			createLucideIcon("layout-panel-left", [
				["rect", {
					width: "7",
					height: "18",
					x: "3",
					y: "3",
					rx: "1",
					key: "2obqm"
				}],
				["rect", {
					width: "7",
					height: "7",
					x: "14",
					y: "3",
					rx: "1",
					key: "6d4xhi"
				}],
				["rect", {
					width: "7",
					height: "7",
					x: "14",
					y: "14",
					rx: "1",
					key: "nxv5o0"
				}]
			]);
			createLucideIcon("layout-template", [
				["rect", {
					width: "18",
					height: "7",
					x: "3",
					y: "3",
					rx: "1",
					key: "f1a2em"
				}],
				["rect", {
					width: "9",
					height: "7",
					x: "3",
					y: "14",
					rx: "1",
					key: "jqznyg"
				}],
				["rect", {
					width: "5",
					height: "7",
					x: "16",
					y: "14",
					rx: "1",
					key: "q5h2i8"
				}]
			]);
			createLucideIcon("layout-panel-top", [
				["rect", {
					width: "18",
					height: "7",
					x: "3",
					y: "3",
					rx: "1",
					key: "f1a2em"
				}],
				["rect", {
					width: "7",
					height: "7",
					x: "3",
					y: "14",
					rx: "1",
					key: "1bb6yr"
				}],
				["rect", {
					width: "7",
					height: "7",
					x: "14",
					y: "14",
					rx: "1",
					key: "nxv5o0"
				}]
			]);
			createLucideIcon("leaf", [["path", {
				d: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z",
				key: "nnexq3"
			}], ["path", {
				d: "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12",
				key: "mt58a7"
			}]]);
			createLucideIcon("leafy-green", [["path", {
				d: "M2 22c1.25-.987 2.27-1.975 3.9-2.2a5.56 5.56 0 0 1 3.8 1.5 4 4 0 0 0 6.187-2.353 3.5 3.5 0 0 0 3.69-5.116A3.5 3.5 0 0 0 20.95 8 3.5 3.5 0 1 0 16 3.05a3.5 3.5 0 0 0-5.831 1.373 3.5 3.5 0 0 0-5.116 3.69 4 4 0 0 0-2.348 6.155C3.499 15.42 4.409 16.712 4.2 18.1 3.926 19.743 3.014 20.732 2 22",
				key: "1134nt"
			}], ["path", {
				d: "M2 22 17 7",
				key: "1q7jp2"
			}]]);
			createLucideIcon("lens-concave", [["path", {
				d: "M7 2a1 1 0 0 0-.8 1.6 14 14 0 0 1 0 16.8A1 1 0 0 0 7 22h10a1 1 0 0 0 .8-1.6 14 14 0 0 1 0-16.8A1 1 0 0 0 17 2z",
				key: "109j23"
			}]]);
			createLucideIcon("lectern", [
				["path", {
					d: "M16 12h3a2 2 0 0 0 1.902-1.38l1.056-3.333A1 1 0 0 0 21 6H3a1 1 0 0 0-.958 1.287l1.056 3.334A2 2 0 0 0 5 12h3",
					key: "13jjxg"
				}],
				["path", {
					d: "M18 6V3a1 1 0 0 0-1-1h-3",
					key: "1550fe"
				}],
				["rect", {
					width: "8",
					height: "12",
					x: "8",
					y: "10",
					rx: "1",
					key: "qmu8b6"
				}]
			]);
			createLucideIcon("lens-convex", [["path", {
				d: "M13.433 2a1 1 0 0 1 .824.448 18 18 0 0 1 0 19.104 1 1 0 0 1-.824.448h-2.866a1 1 0 0 1-.824-.448 18 18 0 0 1 0-19.104A1 1 0 0 1 10.567 2z",
				key: "cq67go"
			}]]);
			createLucideIcon("library-big", [
				["rect", {
					width: "8",
					height: "18",
					x: "3",
					y: "3",
					rx: "1",
					key: "oynpb5"
				}],
				["path", {
					d: "M7 3v18",
					key: "bbkbws"
				}],
				["path", {
					d: "M20.4 18.9c.2.5-.1 1.1-.6 1.3l-1.9.7c-.5.2-1.1-.1-1.3-.6L11.1 5.1c-.2-.5.1-1.1.6-1.3l1.9-.7c.5-.2 1.1.1 1.3.6Z",
					key: "1qboyk"
				}]
			]);
			createLucideIcon("library", [
				["path", {
					d: "m16 6 4 14",
					key: "ji33uf"
				}],
				["path", {
					d: "M12 6v14",
					key: "1n7gus"
				}],
				["path", {
					d: "M8 8v12",
					key: "1gg7y9"
				}],
				["path", {
					d: "M4 4v16",
					key: "6qkkli"
				}]
			]);
			createLucideIcon("life-buoy", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["path", {
					d: "m4.93 4.93 4.24 4.24",
					key: "1ymg45"
				}],
				["path", {
					d: "m14.83 9.17 4.24-4.24",
					key: "1cb5xl"
				}],
				["path", {
					d: "m14.83 14.83 4.24 4.24",
					key: "q42g0n"
				}],
				["path", {
					d: "m9.17 14.83-4.24 4.24",
					key: "bqpfvv"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "4",
					key: "4exip2"
				}]
			]);
			createLucideIcon("ligature", [
				["path", {
					d: "M14 12h2v8",
					key: "c1fccl"
				}],
				["path", {
					d: "M14 20h4",
					key: "lzx1xo"
				}],
				["path", {
					d: "M6 12h4",
					key: "a4o3ry"
				}],
				["path", {
					d: "M6 20h4",
					key: "1i6q5t"
				}],
				["path", {
					d: "M8 20V8a4 4 0 0 1 7.464-2",
					key: "wk9t6r"
				}]
			]);
			createLucideIcon("lightbulb-off", [
				["path", {
					d: "M16.8 11.2c.8-.9 1.2-2 1.2-3.2a6 6 0 0 0-9.3-5",
					key: "1fkcox"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M6.3 6.3a4.67 4.67 0 0 0 1.2 5.2c.7.7 1.3 1.5 1.5 2.5",
					key: "10m8kw"
				}],
				["path", {
					d: "M9 18h6",
					key: "x1upvd"
				}],
				["path", {
					d: "M10 22h4",
					key: "ceow96"
				}]
			]);
			createLucideIcon("lightbulb", [
				["path", {
					d: "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5",
					key: "1gvzjb"
				}],
				["path", {
					d: "M9 18h6",
					key: "x1upvd"
				}],
				["path", {
					d: "M10 22h4",
					key: "ceow96"
				}]
			]);
			createLucideIcon("line-dot-right-horizontal", [["path", {
				d: "M 3 12 L 15 12",
				key: "ymhu98"
			}], ["circle", {
				cx: "18",
				cy: "12",
				r: "3",
				key: "1kchzo"
			}]]);
			createLucideIcon("line-squiggle", [["path", {
				d: "M7 3.5c5-2 7 2.5 3 4C1.5 10 2 15 5 16c5 2 9-10 14-7s.5 13.5-4 12c-5-2.5.5-11 6-2",
				key: "1lrphd"
			}]]);
			createLucideIcon("line-style", [
				["path", {
					d: "M11 5h2",
					key: "1s6z07"
				}],
				["path", {
					d: "M15 12h6",
					key: "upa0zy"
				}],
				["path", {
					d: "M19 5h2",
					key: "fjylsg"
				}],
				["path", {
					d: "M3 12h6",
					key: "ra68u1"
				}],
				["path", {
					d: "M3 19h18",
					key: "awlh7x"
				}],
				["path", {
					d: "M3 5h2",
					key: "1qgu90"
				}]
			]);
			createLucideIcon("link-2-off", [
				["path", {
					d: "M9 17H7A5 5 0 0 1 7 7",
					key: "10o201"
				}],
				["path", {
					d: "M15 7h2a5 5 0 0 1 4 8",
					key: "1d3206"
				}],
				["line", {
					x1: "8",
					x2: "12",
					y1: "12",
					y2: "12",
					key: "rvw6j4"
				}],
				["line", {
					x1: "2",
					x2: "22",
					y1: "2",
					y2: "22",
					key: "a6p6uj"
				}]
			]);
			createLucideIcon("link-2", [
				["path", {
					d: "M9 17H7A5 5 0 0 1 7 7h2",
					key: "8i5ue5"
				}],
				["path", {
					d: "M15 7h2a5 5 0 1 1 0 10h-2",
					key: "1b9ql8"
				}],
				["line", {
					x1: "8",
					x2: "16",
					y1: "12",
					y2: "12",
					key: "1jonct"
				}]
			]);
			createLucideIcon("list-check", [
				["path", {
					d: "M16 5H3",
					key: "m91uny"
				}],
				["path", {
					d: "M16 12H3",
					key: "1a2rj7"
				}],
				["path", {
					d: "M11 19H3",
					key: "zflm78"
				}],
				["path", {
					d: "m15 18 2 2 4-4",
					key: "1szwhi"
				}]
			]);
			createLucideIcon("link", [["path", {
				d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
				key: "1cjeqo"
			}], ["path", {
				d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
				key: "19qd67"
			}]]);
			const ListChecks = createLucideIcon("list-checks", [
				["path", {
					d: "M13 5h8",
					key: "a7qcls"
				}],
				["path", {
					d: "M13 12h8",
					key: "h98zly"
				}],
				["path", {
					d: "M13 19h8",
					key: "c3s6r1"
				}],
				["path", {
					d: "m3 17 2 2 4-4",
					key: "1jhpwq"
				}],
				["path", {
					d: "m3 7 2 2 4-4",
					key: "1obspn"
				}]
			]);
			createLucideIcon("list-chevrons-down-up", [
				["path", {
					d: "M3 5h8",
					key: "18g2rq"
				}],
				["path", {
					d: "M3 12h8",
					key: "1xfjp6"
				}],
				["path", {
					d: "M3 19h8",
					key: "fpbke4"
				}],
				["path", {
					d: "m15 5 3 3 3-3",
					key: "1t4thf"
				}],
				["path", {
					d: "m15 19 3-3 3 3",
					key: "y4ckd2"
				}]
			]);
			createLucideIcon("list-chevrons-up-down", [
				["path", {
					d: "M3 5h8",
					key: "18g2rq"
				}],
				["path", {
					d: "M3 12h8",
					key: "1xfjp6"
				}],
				["path", {
					d: "M3 19h8",
					key: "fpbke4"
				}],
				["path", {
					d: "m15 8 3-3 3 3",
					key: "bc4io6"
				}],
				["path", {
					d: "m15 16 3 3 3-3",
					key: "9wmg1l"
				}]
			]);
			createLucideIcon("list-clock", [
				["path", {
					d: "M16 13v2.2l1.6 1",
					key: "1bc147"
				}],
				["path", {
					d: "M3 12h3.458",
					key: "brzde3"
				}],
				["path", {
					d: "M3 19h3.832",
					key: "1d2y74"
				}],
				["path", {
					d: "M3 5h18",
					key: "1u36vt"
				}],
				["circle", {
					cx: "16",
					cy: "15",
					r: "6",
					key: "1cvf88"
				}]
			]);
			createLucideIcon("list-collapse", [
				["path", {
					d: "M10 5h11",
					key: "1hkqpe"
				}],
				["path", {
					d: "M10 12h11",
					key: "6m4ad9"
				}],
				["path", {
					d: "M10 19h11",
					key: "14g2nv"
				}],
				["path", {
					d: "m3 10 3-3-3-3",
					key: "i7pm08"
				}],
				["path", {
					d: "m3 20 3-3-3-3",
					key: "20gx1n"
				}]
			]);
			createLucideIcon("list-end", [
				["path", {
					d: "M16 5H3",
					key: "m91uny"
				}],
				["path", {
					d: "M16 12H3",
					key: "1a2rj7"
				}],
				["path", {
					d: "M9 19H3",
					key: "s61nz1"
				}],
				["path", {
					d: "m16 16-3 3 3 3",
					key: "117b85"
				}],
				["path", {
					d: "M21 5v12a2 2 0 0 1-2 2h-6",
					key: "hey24a"
				}]
			]);
			createLucideIcon("list-filter-plus", [
				["path", {
					d: "M12 5H2",
					key: "1o22fu"
				}],
				["path", {
					d: "M6 12h12",
					key: "8npq4p"
				}],
				["path", {
					d: "M9 19h6",
					key: "456am0"
				}],
				["path", {
					d: "M16 5h6",
					key: "1vod17"
				}],
				["path", {
					d: "M19 8V2",
					key: "1wcffq"
				}]
			]);
			createLucideIcon("list-filter", [
				["path", {
					d: "M2 5h20",
					key: "1fs1ex"
				}],
				["path", {
					d: "M6 12h12",
					key: "8npq4p"
				}],
				["path", {
					d: "M9 19h6",
					key: "456am0"
				}]
			]);
			createLucideIcon("list-indent-decrease", [
				["path", {
					d: "M21 5H11",
					key: "us1j55"
				}],
				["path", {
					d: "M21 12H11",
					key: "wd7e0v"
				}],
				["path", {
					d: "M21 19H11",
					key: "saa85w"
				}],
				["path", {
					d: "m7 8-4 4 4 4",
					key: "o5hrat"
				}]
			]);
			createLucideIcon("list-indent-increase", [
				["path", {
					d: "M21 5H11",
					key: "us1j55"
				}],
				["path", {
					d: "M21 12H11",
					key: "wd7e0v"
				}],
				["path", {
					d: "M21 19H11",
					key: "saa85w"
				}],
				["path", {
					d: "m3 8 4 4-4 4",
					key: "1a3j6y"
				}]
			]);
			createLucideIcon("list-minus", [
				["path", {
					d: "M16 5H3",
					key: "m91uny"
				}],
				["path", {
					d: "M11 12H3",
					key: "51ecnj"
				}],
				["path", {
					d: "M16 19H3",
					key: "zzsher"
				}],
				["path", {
					d: "M21 12h-6",
					key: "bt1uis"
				}]
			]);
			createLucideIcon("list-music", [
				["path", {
					d: "M16 5H3",
					key: "m91uny"
				}],
				["path", {
					d: "M11 12H3",
					key: "51ecnj"
				}],
				["path", {
					d: "M11 19H3",
					key: "zflm78"
				}],
				["path", {
					d: "M21 16V5",
					key: "yxg4q8"
				}],
				["circle", {
					cx: "18",
					cy: "16",
					r: "3",
					key: "1hluhg"
				}]
			]);
			createLucideIcon("list-ordered", [
				["path", {
					d: "M11 5h10",
					key: "1cz7ny"
				}],
				["path", {
					d: "M11 12h10",
					key: "1438ji"
				}],
				["path", {
					d: "M11 19h10",
					key: "11t30w"
				}],
				["path", {
					d: "M4 4h1v5",
					key: "10yrso"
				}],
				["path", {
					d: "M4 9h2",
					key: "r1h2o0"
				}],
				["path", {
					d: "M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02",
					key: "xtkcd5"
				}]
			]);
			createLucideIcon("list-plus", [
				["path", {
					d: "M16 5H3",
					key: "m91uny"
				}],
				["path", {
					d: "M11 12H3",
					key: "51ecnj"
				}],
				["path", {
					d: "M16 19H3",
					key: "zzsher"
				}],
				["path", {
					d: "M18 9v6",
					key: "1twb98"
				}],
				["path", {
					d: "M21 12h-6",
					key: "bt1uis"
				}]
			]);
			createLucideIcon("list-restart", [
				["path", {
					d: "M21 5H3",
					key: "1fi0y6"
				}],
				["path", {
					d: "M7 12H3",
					key: "13ou7f"
				}],
				["path", {
					d: "M7 19H3",
					key: "wbqt3n"
				}],
				["path", {
					d: "M12 18a5 5 0 0 0 9-3 4.5 4.5 0 0 0-4.5-4.5c-1.33 0-2.54.54-3.41 1.41L11 14",
					key: "qth677"
				}],
				["path", {
					d: "M11 10v4h4",
					key: "172dkj"
				}]
			]);
			createLucideIcon("list-sort-descending", [
				["path", {
					d: "M15 12H3",
					key: "6jk70r"
				}],
				["path", {
					d: "M3 5h18",
					key: "1u36vt"
				}],
				["path", {
					d: "M9 19H3",
					key: "s61nz1"
				}]
			]);
			createLucideIcon("list-start", [
				["path", {
					d: "M3 5h6",
					key: "1ltk0q"
				}],
				["path", {
					d: "M3 12h13",
					key: "ppymz1"
				}],
				["path", {
					d: "M3 19h13",
					key: "bpdczq"
				}],
				["path", {
					d: "m16 8-3-3 3-3",
					key: "1pjpp6"
				}],
				["path", {
					d: "M21 19V7a2 2 0 0 0-2-2h-6",
					key: "4zzq67"
				}]
			]);
			createLucideIcon("list-sort-ascending", [
				["path", {
					d: "M3 19h18",
					key: "awlh7x"
				}],
				["path", {
					d: "M15 12H3",
					key: "6jk70r"
				}],
				["path", {
					d: "M9 5H3",
					key: "15j2za"
				}]
			]);
			createLucideIcon("list-todo", [
				["path", {
					d: "M13 5h8",
					key: "a7qcls"
				}],
				["path", {
					d: "M13 12h8",
					key: "h98zly"
				}],
				["path", {
					d: "M13 19h8",
					key: "c3s6r1"
				}],
				["path", {
					d: "m3 17 2 2 4-4",
					key: "1jhpwq"
				}],
				["rect", {
					x: "3",
					y: "4",
					width: "6",
					height: "6",
					rx: "1",
					key: "cif1o7"
				}]
			]);
			createLucideIcon("list-tree", [
				["path", {
					d: "M8 5h13",
					key: "1pao27"
				}],
				["path", {
					d: "M13 12h8",
					key: "h98zly"
				}],
				["path", {
					d: "M13 19h8",
					key: "c3s6r1"
				}],
				["path", {
					d: "M3 10a2 2 0 0 0 2 2h3",
					key: "1npucw"
				}],
				["path", {
					d: "M3 5v12a2 2 0 0 0 2 2h3",
					key: "x1gjn2"
				}]
			]);
			createLucideIcon("list-video", [
				["path", {
					d: "M21 5H3",
					key: "1fi0y6"
				}],
				["path", {
					d: "M10 12H3",
					key: "1ulcyk"
				}],
				["path", {
					d: "M10 19H3",
					key: "108z41"
				}],
				["path", {
					d: "M15 12.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997a1 1 0 0 1-1.517-.86z",
					key: "ms4nik"
				}]
			]);
			createLucideIcon("list-x", [
				["path", {
					d: "M16 5H3",
					key: "m91uny"
				}],
				["path", {
					d: "M11 12H3",
					key: "51ecnj"
				}],
				["path", {
					d: "M16 19H3",
					key: "zzsher"
				}],
				["path", {
					d: "m15.5 9.5 5 5",
					key: "ytk86i"
				}],
				["path", {
					d: "m20.5 9.5-5 5",
					key: "17o44f"
				}]
			]);
			createLucideIcon("list", [
				["path", {
					d: "M3 5h.01",
					key: "18ugdj"
				}],
				["path", {
					d: "M3 12h.01",
					key: "nlz23k"
				}],
				["path", {
					d: "M3 19h.01",
					key: "noohij"
				}],
				["path", {
					d: "M8 5h13",
					key: "1pao27"
				}],
				["path", {
					d: "M8 12h13",
					key: "1za7za"
				}],
				["path", {
					d: "M8 19h13",
					key: "m83p4d"
				}]
			]);
			const LoaderCircle = createLucideIcon("loader-circle", [["path", {
				d: "M21 12a9 9 0 1 1-6.219-8.56",
				key: "13zald"
			}]]);
			createLucideIcon("loader-pinwheel", [
				["path", {
					d: "M22 12a1 1 0 0 1-10 0 1 1 0 0 0-10 0",
					key: "1lzz15"
				}],
				["path", {
					d: "M7 20.7a1 1 0 1 1 5-8.7 1 1 0 1 0 5-8.6",
					key: "1gnrpi"
				}],
				["path", {
					d: "M7 3.3a1 1 0 1 1 5 8.6 1 1 0 1 0 5 8.6",
					key: "u9yy5q"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}]
			]);
			createLucideIcon("loader", [
				["path", {
					d: "M12 2v4",
					key: "3427ic"
				}],
				["path", {
					d: "m16.2 7.8 2.9-2.9",
					key: "r700ao"
				}],
				["path", {
					d: "M18 12h4",
					key: "wj9ykh"
				}],
				["path", {
					d: "m16.2 16.2 2.9 2.9",
					key: "1bxg5t"
				}],
				["path", {
					d: "M12 18v4",
					key: "jadmvz"
				}],
				["path", {
					d: "m4.9 19.1 2.9-2.9",
					key: "bwix9q"
				}],
				["path", {
					d: "M2 12h4",
					key: "j09sii"
				}],
				["path", {
					d: "m4.9 4.9 2.9 2.9",
					key: "giyufr"
				}]
			]);
			createLucideIcon("locate-fixed", [
				["line", {
					x1: "2",
					x2: "5",
					y1: "12",
					y2: "12",
					key: "bvdh0s"
				}],
				["line", {
					x1: "19",
					x2: "22",
					y1: "12",
					y2: "12",
					key: "1tbv5k"
				}],
				["line", {
					x1: "12",
					x2: "12",
					y1: "2",
					y2: "5",
					key: "11lu5j"
				}],
				["line", {
					x1: "12",
					x2: "12",
					y1: "19",
					y2: "22",
					key: "x3vr5v"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "7",
					key: "fim9np"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "3",
					key: "1v7zrd"
				}]
			]);
			createLucideIcon("locate-off", [
				["path", {
					d: "M12 19v3",
					key: "npa21l"
				}],
				["path", {
					d: "M12 2v3",
					key: "qbqxhf"
				}],
				["path", {
					d: "M18.89 13.24a7 7 0 0 0-8.13-8.13",
					key: "1v9jrh"
				}],
				["path", {
					d: "M19 12h3",
					key: "osuazr"
				}],
				["path", {
					d: "M2 12h3",
					key: "1wrr53"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M7.05 7.05a7 7 0 0 0 9.9 9.9",
					key: "rc5l2e"
				}]
			]);
			createLucideIcon("locate", [
				["line", {
					x1: "2",
					x2: "5",
					y1: "12",
					y2: "12",
					key: "bvdh0s"
				}],
				["line", {
					x1: "19",
					x2: "22",
					y1: "12",
					y2: "12",
					key: "1tbv5k"
				}],
				["line", {
					x1: "12",
					x2: "12",
					y1: "2",
					y2: "5",
					key: "11lu5j"
				}],
				["line", {
					x1: "12",
					x2: "12",
					y1: "19",
					y2: "22",
					key: "x3vr5v"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "7",
					key: "fim9np"
				}]
			]);
			createLucideIcon("lock-keyhole-open", [
				["circle", {
					cx: "12",
					cy: "16",
					r: "1",
					key: "1au0dj"
				}],
				["rect", {
					width: "18",
					height: "12",
					x: "3",
					y: "10",
					rx: "2",
					key: "l0tzu3"
				}],
				["path", {
					d: "M7 10V7a5 5 0 0 1 9.33-2.5",
					key: "car5b7"
				}]
			]);
			createLucideIcon("lock-keyhole", [
				["circle", {
					cx: "12",
					cy: "16",
					r: "1",
					key: "1au0dj"
				}],
				["rect", {
					x: "3",
					y: "10",
					width: "18",
					height: "12",
					rx: "2",
					key: "6s8ecr"
				}],
				["path", {
					d: "M7 10V7a5 5 0 0 1 10 0v3",
					key: "1pqi11"
				}]
			]);
			createLucideIcon("lock-open", [["rect", {
				width: "18",
				height: "11",
				x: "3",
				y: "11",
				rx: "2",
				ry: "2",
				key: "1w4ew1"
			}], ["path", {
				d: "M7 11V7a5 5 0 0 1 9.9-1",
				key: "1mm8w8"
			}]]);
			createLucideIcon("lock", [["rect", {
				width: "18",
				height: "11",
				x: "3",
				y: "11",
				rx: "2",
				ry: "2",
				key: "1w4ew1"
			}], ["path", {
				d: "M7 11V7a5 5 0 0 1 10 0v4",
				key: "fwvmzm"
			}]]);
			createLucideIcon("log-in", [
				["path", {
					d: "m10 17 5-5-5-5",
					key: "1bsop3"
				}],
				["path", {
					d: "M15 12H3",
					key: "6jk70r"
				}],
				["path", {
					d: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4",
					key: "u53s6r"
				}]
			]);
			createLucideIcon("log-out", [
				["path", {
					d: "m16 17 5-5-5-5",
					key: "1bji2h"
				}],
				["path", {
					d: "M21 12H9",
					key: "dn1m92"
				}],
				["path", {
					d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",
					key: "1uf3rs"
				}]
			]);
			createLucideIcon("logs", [
				["path", {
					d: "M3 5h1",
					key: "1mv5vm"
				}],
				["path", {
					d: "M3 12h1",
					key: "lp3yf2"
				}],
				["path", {
					d: "M3 19h1",
					key: "w6f3n9"
				}],
				["path", {
					d: "M8 5h1",
					key: "1nxr5w"
				}],
				["path", {
					d: "M8 12h1",
					key: "1con00"
				}],
				["path", {
					d: "M8 19h1",
					key: "k7p10e"
				}],
				["path", {
					d: "M13 5h8",
					key: "a7qcls"
				}],
				["path", {
					d: "M13 12h8",
					key: "h98zly"
				}],
				["path", {
					d: "M13 19h8",
					key: "c3s6r1"
				}]
			]);
			createLucideIcon("lollipop", [
				["circle", {
					cx: "11",
					cy: "11",
					r: "8",
					key: "4ej97u"
				}],
				["path", {
					d: "m21 21-4.3-4.3",
					key: "1qie3q"
				}],
				["path", {
					d: "M11 11a2 2 0 0 0 4 0 4 4 0 0 0-8 0 6 6 0 0 0 12 0",
					key: "107gwy"
				}]
			]);
			createLucideIcon("luggage", [
				["path", {
					d: "M6 20a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2",
					key: "1m57jg"
				}],
				["path", {
					d: "M8 18V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v14",
					key: "1l99gc"
				}],
				["path", {
					d: "M10 20h4",
					key: "ni2waw"
				}],
				["circle", {
					cx: "16",
					cy: "20",
					r: "2",
					key: "1vifvg"
				}],
				["circle", {
					cx: "8",
					cy: "20",
					r: "2",
					key: "ckkr5m"
				}]
			]);
			createLucideIcon("magnet", [
				["path", {
					d: "m12 15 4 4",
					key: "lnac28"
				}],
				["path", {
					d: "M2.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.029-6.029a1 1 0 1 1 3 3l-6.029 6.029a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.365-6.367A1 1 0 0 0 8.716 4.282z",
					key: "nlhkjb"
				}],
				["path", {
					d: "m5 8 4 4",
					key: "j6kj7e"
				}]
			]);
			createLucideIcon("mail-badge", [
				["path", {
					d: "M22 7.7V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8.25",
					key: "1a6dr2"
				}],
				["path", {
					d: "M12 12.996a1.94 1.94 0 0 1-1.03-.296L2 7",
					key: "15acam"
				}],
				["path", {
					d: "m20.69 16.479 1.29 4.88a.5.5 0 0 1-.698.591l-1.843-.849a1 1 0 0 0-.879.001l-1.846.85a.5.5 0 0 1-.692-.593l1.29-4.88",
					key: "1kx8o4"
				}],
				["circle", {
					cx: "19",
					cy: "14",
					r: "3",
					key: "9c2nho"
				}]
			]);
			createLucideIcon("mail-check", [
				["path", {
					d: "M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8",
					key: "12jkf8"
				}],
				["path", {
					d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7",
					key: "1ocrg3"
				}],
				["path", {
					d: "m16 19 2 2 4-4",
					key: "1b14m6"
				}]
			]);
			createLucideIcon("mail-clock", [
				["path", {
					d: "M16 14v2.2l1.6 1",
					key: "fo4ql5"
				}],
				["path", {
					d: "m22 7-.759.484",
					key: "12ll7o"
				}],
				["path", {
					d: "M6.835 20H4a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v2",
					key: "1wt3ht"
				}],
				["path", {
					d: "M7.605 10.567 2 7",
					key: "1ducps"
				}],
				["circle", {
					cx: "16",
					cy: "16",
					r: "6",
					key: "qoo3c4"
				}]
			]);
			createLucideIcon("mail-minus", [
				["path", {
					d: "M22 15V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8",
					key: "fuxbkv"
				}],
				["path", {
					d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7",
					key: "1ocrg3"
				}],
				["path", {
					d: "M16 19h6",
					key: "xwg31i"
				}]
			]);
			createLucideIcon("mail-open", [["path", {
				d: "M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z",
				key: "1jhwl8"
			}], ["path", {
				d: "m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10",
				key: "1qfld7"
			}]]);
			createLucideIcon("mail-plus", [
				["path", {
					d: "M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8",
					key: "12jkf8"
				}],
				["path", {
					d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7",
					key: "1ocrg3"
				}],
				["path", {
					d: "M19 16v6",
					key: "tddt3s"
				}],
				["path", {
					d: "M16 19h6",
					key: "xwg31i"
				}]
			]);
			createLucideIcon("mail-question-mark", [
				["path", {
					d: "M22 10.5V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h12.5",
					key: "e61zoh"
				}],
				["path", {
					d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7",
					key: "1ocrg3"
				}],
				["path", {
					d: "M18 15.28c.2-.4.5-.8.9-1a2.1 2.1 0 0 1 2.6.4c.3.4.5.8.5 1.3 0 1.3-2 2-2 2",
					key: "7z9rxb"
				}],
				["path", {
					d: "M20 22v.01",
					key: "12bgn6"
				}]
			]);
			createLucideIcon("mail-warning", [
				["path", {
					d: "M22 10.5V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h12.5",
					key: "e61zoh"
				}],
				["path", {
					d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7",
					key: "1ocrg3"
				}],
				["path", {
					d: "M20 14v4",
					key: "1hm744"
				}],
				["path", {
					d: "M20 22v.01",
					key: "12bgn6"
				}]
			]);
			createLucideIcon("mail-search", [
				["path", {
					d: "M22 12.5V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h7.5",
					key: "w80f2v"
				}],
				["path", {
					d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7",
					key: "1ocrg3"
				}],
				["path", {
					d: "M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
					key: "8lzu5m"
				}],
				["circle", {
					cx: "18",
					cy: "18",
					r: "3",
					key: "1xkwt0"
				}],
				["path", {
					d: "m22 22-1.5-1.5",
					key: "1x83k4"
				}]
			]);
			createLucideIcon("mail-x", [
				["path", {
					d: "M22 12.532V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8.792",
					key: "8lpqwp"
				}],
				["path", {
					d: "m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7",
					key: "132q7q"
				}],
				["path", {
					d: "m16.5 16.5 5 5",
					key: "zc9lw7"
				}],
				["path", {
					d: "m21.5 16.5-5 5",
					key: "1empo3"
				}]
			]);
			createLucideIcon("mail", [["path", {
				d: "m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7",
				key: "132q7q"
			}], ["rect", {
				x: "2",
				y: "4",
				width: "20",
				height: "16",
				rx: "2",
				key: "izxlao"
			}]]);
			createLucideIcon("mailbox", [
				["path", {
					d: "M22 17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.5C2 7 4 5 6.5 5H18c2.2 0 4 1.8 4 4v8Z",
					key: "1lbycx"
				}],
				["polyline", {
					points: "15,9 18,9 18,11",
					key: "1pm9c0"
				}],
				["path", {
					d: "M6.5 5C9 5 11 7 11 9.5V17a2 2 0 0 1-2 2",
					key: "15i455"
				}],
				["line", {
					x1: "6",
					x2: "7",
					y1: "10",
					y2: "10",
					key: "1e2scm"
				}]
			]);
			createLucideIcon("mails", [
				["path", {
					d: "M17 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 1-1.732",
					key: "1vyzll"
				}],
				["path", {
					d: "m22 5.5-6.419 4.179a2 2 0 0 1-2.162 0L7 5.5",
					key: "k7ramc"
				}],
				["rect", {
					x: "7",
					y: "3",
					width: "15",
					height: "12",
					rx: "2",
					key: "17196g"
				}]
			]);
			createLucideIcon("map-minus", [
				["path", {
					d: "m11 19-1.106-.552a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0l4.212 2.106a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619V14",
					key: "40pylx"
				}],
				["path", {
					d: "M15 5.764V14",
					key: "1bab71"
				}],
				["path", {
					d: "M21 18h-6",
					key: "139f0c"
				}],
				["path", {
					d: "M9 3.236v15",
					key: "1uimfh"
				}]
			]);
			createLucideIcon("map-pin-check", [
				["path", {
					d: "M19.43 12.935c.357-.967.57-1.955.57-2.935a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 32.197 32.197 0 0 0 .813-.728",
					key: "1dq61d"
				}],
				["circle", {
					cx: "12",
					cy: "10",
					r: "3",
					key: "ilqhr7"
				}],
				["path", {
					d: "m16 18 2 2 4-4",
					key: "1mkfmb"
				}]
			]);
			createLucideIcon("map-pin-check-inside", [["path", {
				d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
				key: "1r0f0z"
			}], ["path", {
				d: "m9 10 2 2 4-4",
				key: "1gnqz4"
			}]]);
			createLucideIcon("map-pin-house", [
				["path", {
					d: "M15 22a1 1 0 0 1-1-1v-4a1 1 0 0 1 .445-.832l3-2a1 1 0 0 1 1.11 0l3 2A1 1 0 0 1 22 17v4a1 1 0 0 1-1 1z",
					key: "1p1rcz"
				}],
				["path", {
					d: "M18 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 .601.2",
					key: "mcbcs9"
				}],
				["path", {
					d: "M18 22v-3",
					key: "1t1ugv"
				}],
				["circle", {
					cx: "10",
					cy: "10",
					r: "3",
					key: "1ns7v1"
				}]
			]);
			createLucideIcon("map-pin-minus", [
				["path", {
					d: "M18.977 14C19.6 12.701 20 11.343 20 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 32 32 0 0 0 .824-.738",
					key: "11uxia"
				}],
				["circle", {
					cx: "12",
					cy: "10",
					r: "3",
					key: "ilqhr7"
				}],
				["path", {
					d: "M16 18h6",
					key: "987eiv"
				}]
			]);
			createLucideIcon("map-pin-minus-inside", [["path", {
				d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
				key: "1r0f0z"
			}], ["path", {
				d: "M9 10h6",
				key: "9gxzsh"
			}]]);
			createLucideIcon("map-pin-off", [
				["path", {
					d: "M12.75 7.09a3 3 0 0 1 2.16 2.16",
					key: "1d4wjd"
				}],
				["path", {
					d: "M17.072 17.072c-1.634 2.17-3.527 3.912-4.471 4.727a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 1.432-4.568",
					key: "12yil7"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M8.475 2.818A8 8 0 0 1 20 10c0 1.183-.31 2.377-.81 3.533",
					key: "lhrkcz"
				}],
				["path", {
					d: "M9.13 9.13a3 3 0 0 0 3.74 3.74",
					key: "13wojd"
				}]
			]);
			createLucideIcon("map-pin-pen", [
				["path", {
					d: "M17.97 9.304A8 8 0 0 0 2 10c0 4.69 4.887 9.562 7.022 11.468",
					key: "1fahp3"
				}],
				["path", {
					d: "M21.378 16.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z",
					key: "1817ys"
				}],
				["circle", {
					cx: "10",
					cy: "10",
					r: "3",
					key: "1ns7v1"
				}]
			]);
			createLucideIcon("map-pin-plus-inside", [
				["path", {
					d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
					key: "1r0f0z"
				}],
				["path", {
					d: "M12 7v6",
					key: "lw1j43"
				}],
				["path", {
					d: "M9 10h6",
					key: "9gxzsh"
				}]
			]);
			createLucideIcon("map-pin-plus", [
				["path", {
					d: "M19.914 11.105A7.298 7.298 0 0 0 20 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 32 32 0 0 0 .824-.738",
					key: "fcdtly"
				}],
				["circle", {
					cx: "12",
					cy: "10",
					r: "3",
					key: "ilqhr7"
				}],
				["path", {
					d: "M16 18h6",
					key: "987eiv"
				}],
				["path", {
					d: "M19 15v6",
					key: "10aioa"
				}]
			]);
			createLucideIcon("map-pin-search", [
				["path", {
					d: "M 12.248 21.969 a 1 1 0 0 1 -0.849 -0.17 C 9.539 20.193 4 14.993 4 10 a 8 8 0 0 1 16 0 C 20 10.42 19.961 10.841 19.888 11.262",
					key: "1jho5b"
				}],
				["path", {
					d: "m22 22-1.88-1.88",
					key: "1bgjp0"
				}],
				["circle", {
					cx: "12",
					cy: "10",
					r: "3",
					key: "ilqhr7"
				}],
				["circle", {
					cx: "18",
					cy: "18",
					r: "3",
					key: "1xkwt0"
				}]
			]);
			createLucideIcon("map-pin-x-inside", [
				["path", {
					d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
					key: "1r0f0z"
				}],
				["path", {
					d: "m14.5 7.5-5 5",
					key: "3lb6iw"
				}],
				["path", {
					d: "m9.5 7.5 5 5",
					key: "ko136h"
				}]
			]);
			createLucideIcon("map-pin-x", [
				["path", {
					d: "M19.752 11.901A7.78 7.78 0 0 0 20 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 19 19 0 0 0 .09-.077",
					key: "y0ewhp"
				}],
				["circle", {
					cx: "12",
					cy: "10",
					r: "3",
					key: "ilqhr7"
				}],
				["path", {
					d: "m21.5 15.5-5 5",
					key: "11iqnx"
				}],
				["path", {
					d: "m21.5 20.5-5-5",
					key: "1bylgx"
				}]
			]);
			createLucideIcon("map-pin", [["path", {
				d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
				key: "1r0f0z"
			}], ["circle", {
				cx: "12",
				cy: "10",
				r: "3",
				key: "ilqhr7"
			}]]);
			createLucideIcon("map-pinned", [
				["path", {
					d: "M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0 1 12 0",
					key: "11u0oz"
				}],
				["circle", {
					cx: "12",
					cy: "8",
					r: "2",
					key: "1822b1"
				}],
				["path", {
					d: "M8.714 14h-3.71a1 1 0 0 0-.948.683l-2.004 6A1 1 0 0 0 3 22h18a1 1 0 0 0 .948-1.316l-2-6a1 1 0 0 0-.949-.684h-3.712",
					key: "q8zwxj"
				}]
			]);
			createLucideIcon("map-plus", [
				["path", {
					d: "m11 19-1.106-.552a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0l4.212 2.106a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619V12",
					key: "svfegj"
				}],
				["path", {
					d: "M15 5.764V12",
					key: "1ocw4k"
				}],
				["path", {
					d: "M18 15v6",
					key: "9wciyi"
				}],
				["path", {
					d: "M21 18h-6",
					key: "139f0c"
				}],
				["path", {
					d: "M9 3.236v15",
					key: "1uimfh"
				}]
			]);
			createLucideIcon("map", [
				["path", {
					d: "M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z",
					key: "169xi5"
				}],
				["path", {
					d: "M15 5.764v15",
					key: "1pn4in"
				}],
				["path", {
					d: "M9 3.236v15",
					key: "1uimfh"
				}]
			]);
			createLucideIcon("mars-stroke", [
				["path", {
					d: "m14 6 4 4",
					key: "1q72g9"
				}],
				["path", {
					d: "M17 3h4v4",
					key: "19p9u1"
				}],
				["path", {
					d: "m21 3-7.75 7.75",
					key: "1cjbfd"
				}],
				["circle", {
					cx: "9",
					cy: "15",
					r: "6",
					key: "bx5svt"
				}]
			]);
			createLucideIcon("mars", [
				["path", {
					d: "M16 3h5v5",
					key: "1806ms"
				}],
				["path", {
					d: "m21 3-6.75 6.75",
					key: "pv0uzu"
				}],
				["circle", {
					cx: "10",
					cy: "14",
					r: "6",
					key: "1qwbdc"
				}]
			]);
			createLucideIcon("martini", [
				["path", {
					d: "M12 12 4.207 4.207A.707.707 0 0 1 4.707 3h14.586a.707.707 0 0 1 .5 1.207z",
					key: "vxdekd"
				}],
				["path", {
					d: "M12 12v10",
					key: "1nesaz"
				}],
				["path", {
					d: "M7 22h10",
					key: "10w4w3"
				}]
			]);
			createLucideIcon("maximize-2", [
				["path", {
					d: "M15 3h6v6",
					key: "1q9fwt"
				}],
				["path", {
					d: "m21 3-7 7",
					key: "1l2asr"
				}],
				["path", {
					d: "m3 21 7-7",
					key: "tjx5ai"
				}],
				["path", {
					d: "M9 21H3v-6",
					key: "wtvkvv"
				}]
			]);
			createLucideIcon("maximize", [
				["path", {
					d: "M8 3H5a2 2 0 0 0-2 2v3",
					key: "1dcmit"
				}],
				["path", {
					d: "M21 8V5a2 2 0 0 0-2-2h-3",
					key: "1e4gt3"
				}],
				["path", {
					d: "M3 16v3a2 2 0 0 0 2 2h3",
					key: "wsl5sc"
				}],
				["path", {
					d: "M16 21h3a2 2 0 0 0 2-2v-3",
					key: "18trek"
				}]
			]);
			createLucideIcon("megaphone-off", [
				["path", {
					d: "M11.636 6A13 13 0 0 0 19.4 3.2 1 1 0 0 1 21 4v11.344",
					key: "bycexp"
				}],
				["path", {
					d: "M14.378 14.357A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1",
					key: "1t17s6"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14",
					key: "1853fq"
				}],
				["path", {
					d: "M8 8v6",
					key: "aieo6v"
				}]
			]);
			createLucideIcon("medal", [
				["path", {
					d: "M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15",
					key: "143lza"
				}],
				["path", {
					d: "M11 12 5.12 2.2",
					key: "qhuxz6"
				}],
				["path", {
					d: "m13 12 5.88-9.8",
					key: "hbye0f"
				}],
				["path", {
					d: "M8 7h8",
					key: "i86dvs"
				}],
				["circle", {
					cx: "12",
					cy: "17",
					r: "5",
					key: "qbz8iq"
				}],
				["path", {
					d: "M12 18v-2h-.5",
					key: "fawc4q"
				}]
			]);
			createLucideIcon("megaphone", [
				["path", {
					d: "M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z",
					key: "q8bfy3"
				}],
				["path", {
					d: "M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14",
					key: "1853fq"
				}],
				["path", {
					d: "M8 6v8",
					key: "15ugcq"
				}]
			]);
			createLucideIcon("memory-stick", [
				["path", {
					d: "M12 12v-2",
					key: "fwoke6"
				}],
				["path", {
					d: "M12 18v-2",
					key: "qj6yno"
				}],
				["path", {
					d: "M16 12v-2",
					key: "heuere"
				}],
				["path", {
					d: "M16 18v-2",
					key: "s1ct0w"
				}],
				["path", {
					d: "M2 11h1.5",
					key: "15p63e"
				}],
				["path", {
					d: "M20 18v-2",
					key: "12ehxp"
				}],
				["path", {
					d: "M20.5 11H22",
					key: "khsy7a"
				}],
				["path", {
					d: "M4 18v-2",
					key: "1c3oqr"
				}],
				["path", {
					d: "M8 12v-2",
					key: "1mwtfd"
				}],
				["path", {
					d: "M8 18v-2",
					key: "qcmpov"
				}],
				["rect", {
					x: "2",
					y: "6",
					width: "20",
					height: "10",
					rx: "2",
					key: "1qcswk"
				}]
			]);
			createLucideIcon("menu", [
				["path", {
					d: "M4 5h16",
					key: "1tepv9"
				}],
				["path", {
					d: "M4 12h16",
					key: "1lakjw"
				}],
				["path", {
					d: "M4 19h16",
					key: "1djgab"
				}]
			]);
			createLucideIcon("merge", [
				["path", {
					d: "m8 6 4-4 4 4",
					key: "ybng9g"
				}],
				["path", {
					d: "M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22",
					key: "1hyw0i"
				}],
				["path", {
					d: "m20 22-5-5",
					key: "1m27yz"
				}]
			]);
			createLucideIcon("message-circle-check", [["path", {
				d: "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
				key: "1sd12s"
			}], ["path", {
				d: "m16 9-5.5 5.5L8 12",
				key: "xofnsj"
			}]]);
			createLucideIcon("message-circle-code", [
				["path", {
					d: "m10 9-3 3 3 3",
					key: "1oro0q"
				}],
				["path", {
					d: "m14 15 3-3-3-3",
					key: "bz13h7"
				}],
				["path", {
					d: "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
					key: "1sd12s"
				}]
			]);
			createLucideIcon("message-circle-dashed", [
				["path", {
					d: "M10.1 2.182a10 10 0 0 1 3.8 0",
					key: "5ilxe3"
				}],
				["path", {
					d: "M13.9 21.818a10 10 0 0 1-3.8 0",
					key: "11zvb9"
				}],
				["path", {
					d: "M17.609 3.72a10 10 0 0 1 2.69 2.7",
					key: "jiglxs"
				}],
				["path", {
					d: "M2.182 13.9a10 10 0 0 1 0-3.8",
					key: "c0bmvh"
				}],
				["path", {
					d: "M20.28 17.61a10 10 0 0 1-2.7 2.69",
					key: "elg7ff"
				}],
				["path", {
					d: "M21.818 10.1a10 10 0 0 1 0 3.8",
					key: "qkgqxc"
				}],
				["path", {
					d: "M3.721 6.391a10 10 0 0 1 2.7-2.69",
					key: "1mcia2"
				}],
				["path", {
					d: "m6.163 21.117-2.906.85a1 1 0 0 1-1.236-1.169l.965-2.98",
					key: "1qsu07"
				}]
			]);
			createLucideIcon("message-circle-dashed-check", [
				["path", {
					d: "M10.1 2.182a10 10 0 013.8 0",
					key: "upsxbf"
				}],
				["path", {
					d: "M13.9 21.818a10 10 0 01-3.8 0",
					key: "ms125y"
				}],
				["path", {
					d: "M17.609 3.72a10 10 0 012.69 2.7",
					key: "1jzhoq"
				}],
				["path", {
					d: "M2.182 13.9a10 10 0 010-3.8",
					key: "68e3e5"
				}],
				["path", {
					d: "M20.28 17.61a10 10 0 01-2.7 2.69",
					key: "1m37bo"
				}],
				["path", {
					d: "M21.818 10.1a10 10 0 010 3.8",
					key: "w6g6ls"
				}],
				["path", {
					d: "M3.721 6.391a10 10 0 012.7-2.69",
					key: "sn8908"
				}],
				["path", {
					d: "m6.163 21.117-2.906.85a1 1 0 01-1.236-1.169l.965-2.98",
					key: "7908cd"
				}],
				["path", {
					d: "m16 9-5.5 5.5L8 12",
					key: "xofnsj"
				}]
			]);
			createLucideIcon("message-circle-heart", [["path", {
				d: "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
				key: "1sd12s"
			}], ["path", {
				d: "M7.828 13.07A3 3 0 0 1 12 8.764a3 3 0 0 1 5.004 2.224 3 3 0 0 1-.832 2.083l-3.447 3.62a1 1 0 0 1-1.45-.001z",
				key: "hoo97p"
			}]]);
			createLucideIcon("message-circle-more", [
				["path", {
					d: "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
					key: "1sd12s"
				}],
				["path", {
					d: "M8 12h.01",
					key: "czm47f"
				}],
				["path", {
					d: "M12 12h.01",
					key: "1mp3jc"
				}],
				["path", {
					d: "M16 12h.01",
					key: "1l6xoz"
				}]
			]);
			createLucideIcon("message-circle-off", [
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M4.93 4.929a10 10 0 0 0-1.938 11.412 2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 0 0 11.302-1.989",
					key: "7il5tn"
				}],
				["path", {
					d: "M8.35 2.69A10 10 0 0 1 21.3 15.65",
					key: "1pfsoa"
				}]
			]);
			createLucideIcon("message-circle-plus", [
				["path", {
					d: "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
					key: "1sd12s"
				}],
				["path", {
					d: "M8 12h8",
					key: "1wcyev"
				}],
				["path", {
					d: "M12 8v8",
					key: "napkw2"
				}]
			]);
			createLucideIcon("message-circle-question-mark", [
				["path", {
					d: "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
					key: "1sd12s"
				}],
				["path", {
					d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3",
					key: "1u773s"
				}],
				["path", {
					d: "M12 17h.01",
					key: "p32p05"
				}]
			]);
			createLucideIcon("message-circle-reply", [
				["path", {
					d: "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
					key: "1sd12s"
				}],
				["path", {
					d: "m10 15-3-3 3-3",
					key: "1pgupc"
				}],
				["path", {
					d: "M7 12h8a2 2 0 0 1 2 2v1",
					key: "89sh1g"
				}]
			]);
			createLucideIcon("message-circle-warning", [
				["path", {
					d: "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
					key: "1sd12s"
				}],
				["path", {
					d: "M12 8v4",
					key: "1got3b"
				}],
				["path", {
					d: "M12 16h.01",
					key: "1drbdi"
				}]
			]);
			createLucideIcon("message-circle-x", [
				["path", {
					d: "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
					key: "1sd12s"
				}],
				["path", {
					d: "m15 9-6 6",
					key: "1uzhvr"
				}],
				["path", {
					d: "m9 9 6 6",
					key: "z0biqf"
				}]
			]);
			createLucideIcon("message-circle", [["path", {
				d: "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
				key: "1sd12s"
			}]]);
			createLucideIcon("message-square-check", [["path", {
				d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.7.7 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
				key: "m0kn7k"
			}], ["path", {
				d: "m9 11 2 2 4-4",
				key: "kz4plv"
			}]]);
			createLucideIcon("message-square-code", [
				["path", {
					d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
					key: "18887p"
				}],
				["path", {
					d: "m10 8-3 3 3 3",
					key: "fp6dz7"
				}],
				["path", {
					d: "m14 14 3-3-3-3",
					key: "1yrceu"
				}]
			]);
			createLucideIcon("message-square-dashed", [
				["path", {
					d: "M14 3h2",
					key: "1d12a5"
				}],
				["path", {
					d: "M16 19h-2",
					key: "1agirb"
				}],
				["path", {
					d: "M2 12v-2",
					key: "1ey295"
				}],
				["path", {
					d: "M2 16v5.286a.71.71 0 0 0 1.212.502l1.149-1.149",
					key: "120k8q"
				}],
				["path", {
					d: "M20 19a2 2 0 0 0 2-2v-1",
					key: "ior8tn"
				}],
				["path", {
					d: "M22 10v2",
					key: "rmlecy"
				}],
				["path", {
					d: "M22 6V5a2 2 0 0 0-2-2",
					key: "sp3k6r"
				}],
				["path", {
					d: "M4 3a2 2 0 0 0-2 2v1",
					key: "11zt7s"
				}],
				["path", {
					d: "M8 19h2",
					key: "jnunrx"
				}],
				["path", {
					d: "M8 3h2",
					key: "ysbsee"
				}]
			]);
			createLucideIcon("message-square-diff", [
				["path", {
					d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
					key: "18887p"
				}],
				["path", {
					d: "M10 15h4",
					key: "192ueg"
				}],
				["path", {
					d: "M10 9h4",
					key: "u4k05v"
				}],
				["path", {
					d: "M12 7v4",
					key: "xawao1"
				}]
			]);
			createLucideIcon("message-square-dot", [["path", {
				d: "M12.7 3H4a2 2 0 0 0-2 2v16.286a.71.71 0 0 0 1.212.502l2.202-2.202A2 2 0 0 1 6.828 19H20a2 2 0 0 0 2-2v-4.7",
				key: "wjb7ig"
			}], ["circle", {
				cx: "19",
				cy: "6",
				r: "3",
				key: "108a5v"
			}]]);
			createLucideIcon("message-square-heart", [["path", {
				d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
				key: "18887p"
			}], ["path", {
				d: "M7.5 9.5c0 .687.265 1.383.697 1.844l3.009 3.264a1.14 1.14 0 0 0 .407.314 1 1 0 0 0 .783-.004 1.14 1.14 0 0 0 .398-.31l3.008-3.264A2.77 2.77 0 0 0 16.5 9.5 2.5 2.5 0 0 0 12 8a2.5 2.5 0 0 0-4.5 1.5",
				key: "1faxuh"
			}]]);
			createLucideIcon("message-square-lock", [
				["path", {
					d: "M22 8.5V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v16.286a.71.71 0 0 0 1.212.502l2.202-2.202A2 2 0 0 1 6.828 19H10",
					key: "fu6chl"
				}],
				["path", {
					d: "M20 15v-2a2 2 0 0 0-4 0v2",
					key: "vl8a78"
				}],
				["rect", {
					x: "14",
					y: "15",
					width: "8",
					height: "5",
					rx: "1",
					key: "37aafw"
				}]
			]);
			createLucideIcon("message-square-more", [
				["path", {
					d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
					key: "18887p"
				}],
				["path", {
					d: "M12 11h.01",
					key: "z322tv"
				}],
				["path", {
					d: "M16 11h.01",
					key: "xkw8gn"
				}],
				["path", {
					d: "M8 11h.01",
					key: "1dfujw"
				}]
			]);
			createLucideIcon("message-square-off", [
				["path", {
					d: "M19 19H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.7.7 0 0 1 2 21.286V5a2 2 0 0 1 1.184-1.826",
					key: "1wyg69"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M8.656 3H20a2 2 0 0 1 2 2v11.344",
					key: "mhl4k6"
				}]
			]);
			createLucideIcon("message-square-plus", [
				["path", {
					d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
					key: "18887p"
				}],
				["path", {
					d: "M12 8v6",
					key: "1ib9pf"
				}],
				["path", {
					d: "M9 11h6",
					key: "1fldmi"
				}]
			]);
			createLucideIcon("message-square-quote", [
				["path", {
					d: "M14 14a2 2 0 0 0 2-2V8h-2",
					key: "1r06pg"
				}],
				["path", {
					d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
					key: "18887p"
				}],
				["path", {
					d: "M8 14a2 2 0 0 0 2-2V8H8",
					key: "1jzu5j"
				}]
			]);
			createLucideIcon("message-square-reply", [
				["path", {
					d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
					key: "18887p"
				}],
				["path", {
					d: "m10 8-3 3 3 3",
					key: "fp6dz7"
				}],
				["path", {
					d: "M17 14v-1a2 2 0 0 0-2-2H7",
					key: "1tkjnz"
				}]
			]);
			createLucideIcon("message-square-share", [
				["path", {
					d: "M12 3H4a2 2 0 0 0-2 2v16.286a.71.71 0 0 0 1.212.502l2.202-2.202A2 2 0 0 1 6.828 19H20a2 2 0 0 0 2-2v-4",
					key: "11da1y"
				}],
				["path", {
					d: "M16 3h6v6",
					key: "1bx56c"
				}],
				["path", {
					d: "m16 9 6-6",
					key: "m4dnic"
				}]
			]);
			createLucideIcon("message-square-warning", [
				["path", {
					d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
					key: "18887p"
				}],
				["path", {
					d: "M12 15h.01",
					key: "q59x07"
				}],
				["path", {
					d: "M12 7v4",
					key: "xawao1"
				}]
			]);
			createLucideIcon("message-square-text", [
				["path", {
					d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
					key: "18887p"
				}],
				["path", {
					d: "M7 11h10",
					key: "1twpyw"
				}],
				["path", {
					d: "M7 15h6",
					key: "d9of3u"
				}],
				["path", {
					d: "M7 7h8",
					key: "af5zfr"
				}]
			]);
			createLucideIcon("message-square-x", [
				["path", {
					d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
					key: "18887p"
				}],
				["path", {
					d: "m14.5 8.5-5 5",
					key: "19tnj2"
				}],
				["path", {
					d: "m9.5 8.5 5 5",
					key: "1oa8ql"
				}]
			]);
			createLucideIcon("message-square", [["path", {
				d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
				key: "18887p"
			}]]);
			createLucideIcon("messages-square", [["path", {
				d: "M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z",
				key: "1n2ejm"
			}], ["path", {
				d: "M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1",
				key: "1qfcsi"
			}]]);
			createLucideIcon("mic-audio-lines", [
				["path", {
					d: "M10 3v2.341",
					key: "d00509"
				}],
				["path", {
					d: "M12 17v4",
					key: "1riwvh"
				}],
				["path", {
					d: "M14 5v.341",
					key: "72nt6x"
				}],
				["path", {
					d: "M18 5v13",
					key: "123xd1"
				}],
				["path", {
					d: "M2 10v3",
					key: "1fnikh"
				}],
				["path", {
					d: "M22 10v3",
					key: "154ddg"
				}],
				["path", {
					d: "M6 6v11",
					key: "11sgs0"
				}],
				["path", {
					d: "M9 21h6",
					key: "1udhl7"
				}],
				["rect", {
					width: "4",
					height: "8",
					x: "10",
					y: "9",
					rx: "2",
					key: "1d9qhd"
				}]
			]);
			createLucideIcon("mic-off", [
				["path", {
					d: "M12 19v3",
					key: "npa21l"
				}],
				["path", {
					d: "M15 9.34V5a3 3 0 0 0-5.68-1.33",
					key: "1gzdoj"
				}],
				["path", {
					d: "M16.95 16.95A7 7 0 0 1 5 12v-2",
					key: "cqa7eg"
				}],
				["path", {
					d: "M18.89 13.23A7 7 0 0 0 19 12v-2",
					key: "16hl24"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M9 9v3a3 3 0 0 0 5.12 2.12",
					key: "r2i35w"
				}]
			]);
			createLucideIcon("metronome", [
				["path", {
					d: "M12 11.4V9.1",
					key: "audfby"
				}],
				["path", {
					d: "m12 17 6.59-6.59",
					key: "c0sb7j"
				}],
				["path", {
					d: "m15.05 5.7-.218-.691a3 3 0 0 0-5.663 0L4.418 19.695A1 1 0 0 0 5.37 21h13.253a1 1 0 0 0 .951-1.31L18.45 16.2",
					key: "1pkfrk"
				}],
				["circle", {
					cx: "20",
					cy: "9",
					r: "2",
					key: "1udoqf"
				}]
			]);
			createLucideIcon("mic-signal", [
				["path", {
					d: "M12 17v4",
					key: "1riwvh"
				}],
				["path", {
					d: "M18 11a6 6 0 00-3-5.197",
					key: "1lvu40"
				}],
				["path", {
					d: "M2 11a10 10 0 015-8.662",
					key: "bida4p"
				}],
				["path", {
					d: "M22 11a10 10 0 00-5-8.662",
					key: "idvinr"
				}],
				["path", {
					d: "M6 11a6 6 0 013-5.197",
					key: "17n2ii"
				}],
				["path", {
					d: "M9 21h6",
					key: "1udhl7"
				}],
				["rect", {
					x: "10",
					y: "9",
					width: "4",
					height: "8",
					rx: "2",
					key: "1l8p2f"
				}]
			]);
			createLucideIcon("mic", [
				["path", {
					d: "M12 19v3",
					key: "npa21l"
				}],
				["path", {
					d: "M19 10v2a7 7 0 0 1-14 0v-2",
					key: "1vc78b"
				}],
				["rect", {
					x: "9",
					y: "2",
					width: "6",
					height: "13",
					rx: "3",
					key: "s6n7sd"
				}]
			]);
			createLucideIcon("mic-vocal", [
				["path", {
					d: "m11 7.601-5.994 8.19a1 1 0 0 0 .1 1.298l.817.818a1 1 0 0 0 1.314.087L15.09 12",
					key: "80a601"
				}],
				["path", {
					d: "M16.5 21.174C15.5 20.5 14.372 20 13 20c-2.058 0-3.928 2.356-6 2-2.072-.356-2.775-3.369-1.5-4.5",
					key: "j0ngtp"
				}],
				["circle", {
					cx: "16",
					cy: "7",
					r: "5",
					key: "d08jfb"
				}]
			]);
			createLucideIcon("microscope", [
				["path", {
					d: "M6 18h8",
					key: "1borvv"
				}],
				["path", {
					d: "M3 22h18",
					key: "8prr45"
				}],
				["path", {
					d: "M14 22a7 7 0 1 0 0-14h-1",
					key: "1jwaiy"
				}],
				["path", {
					d: "M9 14h2",
					key: "197e7h"
				}],
				["path", {
					d: "M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z",
					key: "1bmzmy"
				}],
				["path", {
					d: "M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3",
					key: "1drr47"
				}]
			]);
			createLucideIcon("microchip", [
				["path", {
					d: "M10 12h4",
					key: "a56b0p"
				}],
				["path", {
					d: "M10 17h4",
					key: "pvmtpo"
				}],
				["path", {
					d: "M10 7h4",
					key: "1vgcok"
				}],
				["path", {
					d: "M18 12h2",
					key: "quuxs7"
				}],
				["path", {
					d: "M18 18h2",
					key: "4scel"
				}],
				["path", {
					d: "M18 6h2",
					key: "1ptzki"
				}],
				["path", {
					d: "M4 12h2",
					key: "1ltxp0"
				}],
				["path", {
					d: "M4 18h2",
					key: "1xrofg"
				}],
				["path", {
					d: "M4 6h2",
					key: "1cx33n"
				}],
				["rect", {
					x: "6",
					y: "2",
					width: "12",
					height: "20",
					rx: "2",
					key: "749fme"
				}]
			]);
			createLucideIcon("microwave", [
				["rect", {
					width: "20",
					height: "15",
					x: "2",
					y: "4",
					rx: "2",
					key: "2no95f"
				}],
				["rect", {
					width: "8",
					height: "7",
					x: "6",
					y: "8",
					rx: "1",
					key: "zh9wx"
				}],
				["path", {
					d: "M18 8v7",
					key: "o5zi4n"
				}],
				["path", {
					d: "M6 19v2",
					key: "1loha6"
				}],
				["path", {
					d: "M18 19v2",
					key: "1dawf0"
				}]
			]);
			createLucideIcon("midi-port", [
				["path", {
					d: "M12 18h.01",
					key: "mhygvu"
				}],
				["path", {
					d: "M15 2.458V5a1 1 0 01-1 1h-4a1 1 0 01-1-1V2.458",
					key: "1e2lr4"
				}],
				["path", {
					d: "M16 16h.01",
					key: "1f9h7w"
				}],
				["path", {
					d: "M18 12h.01",
					key: "yjnet6"
				}],
				["path", {
					d: "M6 12h.01",
					key: "c2rlol"
				}],
				["path", {
					d: "M8 16h.01",
					key: "18s6g9"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}]
			]);
			createLucideIcon("milestone", [
				["path", {
					d: "M12 13v8",
					key: "1l5pq0"
				}],
				["path", {
					d: "M12 3v3",
					key: "1n5kay"
				}],
				["path", {
					d: "M18.172 6a2 2 0 0 1 1.414.586l2.06 2.06a1.207 1.207 0 0 1 0 1.708l-2.06 2.06a2 2 0 0 1-1.414.586H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z",
					key: "8gz4t4"
				}]
			]);
			createLucideIcon("milk-off", [
				["path", {
					d: "M8 2h8",
					key: "1ssgc1"
				}],
				["path", {
					d: "M9 2v1.343M15 2v2.789a4 4 0 0 0 .672 2.219l.656.984a4 4 0 0 1 .672 2.22v1.131M7.8 7.8l-.128.192A4 4 0 0 0 7 10.212V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-3",
					key: "y0ejgx"
				}],
				["path", {
					d: "M7 15a6.47 6.47 0 0 1 5 0 6.472 6.472 0 0 0 3.435.435",
					key: "iaxqsy"
				}],
				["line", {
					x1: "2",
					x2: "22",
					y1: "2",
					y2: "22",
					key: "a6p6uj"
				}]
			]);
			createLucideIcon("milk", [
				["path", {
					d: "M8 2h8",
					key: "1ssgc1"
				}],
				["path", {
					d: "M9 2v2.789a4 4 0 0 1-.672 2.219l-.656.984A4 4 0 0 0 7 10.212V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-9.789a4 4 0 0 0-.672-2.219l-.656-.984A4 4 0 0 1 15 4.788V2",
					key: "qtp12x"
				}],
				["path", {
					d: "M7 15a6.472 6.472 0 0 1 5 0 6.47 6.47 0 0 0 5 0",
					key: "ygeh44"
				}]
			]);
			createLucideIcon("minimize-2", [
				["path", {
					d: "m14 10 7-7",
					key: "oa77jy"
				}],
				["path", {
					d: "M20 10h-6V4",
					key: "mjg0md"
				}],
				["path", {
					d: "m3 21 7-7",
					key: "tjx5ai"
				}],
				["path", {
					d: "M4 14h6v6",
					key: "rmj7iw"
				}]
			]);
			createLucideIcon("minus", [["path", {
				d: "M5 12h14",
				key: "1ays0h"
			}]]);
			createLucideIcon("minimize", [
				["path", {
					d: "M8 3v3a2 2 0 0 1-2 2H3",
					key: "hohbtr"
				}],
				["path", {
					d: "M21 8h-3a2 2 0 0 1-2-2V3",
					key: "5jw1f3"
				}],
				["path", {
					d: "M3 16h3a2 2 0 0 1 2 2v3",
					key: "198tvr"
				}],
				["path", {
					d: "M16 21v-3a2 2 0 0 1 2-2h3",
					key: "ph8mxp"
				}]
			]);
			createLucideIcon("mirror-rectangular", [
				["path", {
					d: "M11 6 8 9",
					key: "7zt14w"
				}],
				["path", {
					d: "m16 7-8 8",
					key: "tkgtvu"
				}],
				["rect", {
					x: "4",
					y: "2",
					width: "16",
					height: "20",
					rx: "2",
					key: "1uxh74"
				}]
			]);
			createLucideIcon("mirror-round", [
				["path", {
					d: "M10 6.6 8.6 8",
					key: "itrr7k"
				}],
				["path", {
					d: "M12 18v4",
					key: "jadmvz"
				}],
				["path", {
					d: "M15 7.5 9.5 13",
					key: "1vyrsv"
				}],
				["path", {
					d: "M7 22h10",
					key: "10w4w3"
				}],
				["circle", {
					cx: "12",
					cy: "10",
					r: "8",
					key: "1gshiw"
				}]
			]);
			createLucideIcon("monitor-check", [
				["path", {
					d: "m9 10 2 2 4-4",
					key: "1gnqz4"
				}],
				["rect", {
					width: "20",
					height: "14",
					x: "2",
					y: "3",
					rx: "2",
					key: "48i651"
				}],
				["path", {
					d: "M12 17v4",
					key: "1riwvh"
				}],
				["path", {
					d: "M8 21h8",
					key: "1ev6f3"
				}]
			]);
			createLucideIcon("monitor-cloud", [
				["path", {
					d: "M11 13a3 3 0 1 1 2.83-4H14a2 2 0 0 1 0 4z",
					key: "1da4q6"
				}],
				["path", {
					d: "M12 17v4",
					key: "1riwvh"
				}],
				["path", {
					d: "M8 21h8",
					key: "1ev6f3"
				}],
				["rect", {
					x: "2",
					y: "3",
					width: "20",
					height: "14",
					rx: "2",
					key: "x3v2xh"
				}]
			]);
			createLucideIcon("monitor-cog", [
				["path", {
					d: "M12 17v4",
					key: "1riwvh"
				}],
				["path", {
					d: "m14.305 7.53.923-.382",
					key: "1mlnsw"
				}],
				["path", {
					d: "m15.228 4.852-.923-.383",
					key: "82mpwg"
				}],
				["path", {
					d: "m16.852 3.228-.383-.924",
					key: "ln4sir"
				}],
				["path", {
					d: "m16.852 8.772-.383.923",
					key: "1dejw0"
				}],
				["path", {
					d: "m19.148 3.228.383-.924",
					key: "192kgf"
				}],
				["path", {
					d: "m19.53 9.696-.382-.924",
					key: "fiavlr"
				}],
				["path", {
					d: "m20.772 4.852.924-.383",
					key: "1j8mgp"
				}],
				["path", {
					d: "m20.772 7.148.924.383",
					key: "zix9be"
				}],
				["path", {
					d: "M22 13v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7",
					key: "1tnzv8"
				}],
				["path", {
					d: "M8 21h8",
					key: "1ev6f3"
				}],
				["circle", {
					cx: "18",
					cy: "6",
					r: "3",
					key: "1h7g24"
				}]
			]);
			createLucideIcon("monitor-dot", [
				["path", {
					d: "M12 17v4",
					key: "1riwvh"
				}],
				["path", {
					d: "M22 12.307V15a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8.693",
					key: "1dx6ho"
				}],
				["path", {
					d: "M8 21h8",
					key: "1ev6f3"
				}],
				["circle", {
					cx: "19",
					cy: "6",
					r: "3",
					key: "108a5v"
				}]
			]);
			createLucideIcon("monitor-down", [
				["path", {
					d: "M12 13V7",
					key: "h0r20n"
				}],
				["path", {
					d: "m15 10-3 3-3-3",
					key: "lzhmyn"
				}],
				["rect", {
					width: "20",
					height: "14",
					x: "2",
					y: "3",
					rx: "2",
					key: "48i651"
				}],
				["path", {
					d: "M12 17v4",
					key: "1riwvh"
				}],
				["path", {
					d: "M8 21h8",
					key: "1ev6f3"
				}]
			]);
			createLucideIcon("monitor-off", [
				["path", {
					d: "M12 17v4",
					key: "1riwvh"
				}],
				["path", {
					d: "M17 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 1.184-1.826",
					key: "cv7jms"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M8 21h8",
					key: "1ev6f3"
				}],
				["path", {
					d: "M8.656 3H20a2 2 0 0 1 2 2v10a2 2 0 0 1-.293 1.042",
					key: "z8ni2w"
				}]
			]);
			createLucideIcon("monitor-pause", [
				["path", {
					d: "M10 13V7",
					key: "1u13u9"
				}],
				["path", {
					d: "M14 13V7",
					key: "1vj9om"
				}],
				["rect", {
					width: "20",
					height: "14",
					x: "2",
					y: "3",
					rx: "2",
					key: "48i651"
				}],
				["path", {
					d: "M12 17v4",
					key: "1riwvh"
				}],
				["path", {
					d: "M8 21h8",
					key: "1ev6f3"
				}]
			]);
			createLucideIcon("monitor-play", [
				["path", {
					d: "M15.033 9.44a.647.647 0 0 1 0 1.12l-4.065 2.352a.645.645 0 0 1-.968-.56V7.648a.645.645 0 0 1 .967-.56z",
					key: "vbtd3f"
				}],
				["path", {
					d: "M12 17v4",
					key: "1riwvh"
				}],
				["path", {
					d: "M8 21h8",
					key: "1ev6f3"
				}],
				["rect", {
					x: "2",
					y: "3",
					width: "20",
					height: "14",
					rx: "2",
					key: "x3v2xh"
				}]
			]);
			createLucideIcon("monitor-speaker", [
				["path", {
					d: "M5.5 20H8",
					key: "1k40s5"
				}],
				["path", {
					d: "M17 9h.01",
					key: "1j24nn"
				}],
				["rect", {
					width: "10",
					height: "16",
					x: "12",
					y: "4",
					rx: "2",
					key: "ixliua"
				}],
				["path", {
					d: "M8 6H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h4",
					key: "1mp6e1"
				}],
				["circle", {
					cx: "17",
					cy: "15",
					r: "1",
					key: "tqvash"
				}]
			]);
			createLucideIcon("monitor-smartphone", [
				["path", {
					d: "M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8",
					key: "10dyio"
				}],
				["path", {
					d: "M10 19v-3.96 3.15",
					key: "1irgej"
				}],
				["path", {
					d: "M7 19h5",
					key: "qswx4l"
				}],
				["rect", {
					width: "6",
					height: "10",
					x: "16",
					y: "12",
					rx: "2",
					key: "1egngj"
				}]
			]);
			createLucideIcon("monitor-stop", [
				["path", {
					d: "M12 17v4",
					key: "1riwvh"
				}],
				["path", {
					d: "M8 21h8",
					key: "1ev6f3"
				}],
				["rect", {
					x: "2",
					y: "3",
					width: "20",
					height: "14",
					rx: "2",
					key: "x3v2xh"
				}],
				["rect", {
					x: "9",
					y: "7",
					width: "6",
					height: "6",
					rx: "1",
					key: "5m2oou"
				}]
			]);
			createLucideIcon("monitor-up", [
				["path", {
					d: "m9 10 3-3 3 3",
					key: "11gsxs"
				}],
				["path", {
					d: "M12 13V7",
					key: "h0r20n"
				}],
				["rect", {
					width: "20",
					height: "14",
					x: "2",
					y: "3",
					rx: "2",
					key: "48i651"
				}],
				["path", {
					d: "M12 17v4",
					key: "1riwvh"
				}],
				["path", {
					d: "M8 21h8",
					key: "1ev6f3"
				}]
			]);
			createLucideIcon("monitor-x", [
				["path", {
					d: "m14.5 12.5-5-5",
					key: "1jahn5"
				}],
				["path", {
					d: "m9.5 12.5 5-5",
					key: "1k2t7b"
				}],
				["rect", {
					width: "20",
					height: "14",
					x: "2",
					y: "3",
					rx: "2",
					key: "48i651"
				}],
				["path", {
					d: "M12 17v4",
					key: "1riwvh"
				}],
				["path", {
					d: "M8 21h8",
					key: "1ev6f3"
				}]
			]);
			createLucideIcon("moon-star", [
				["path", {
					d: "M18 5h4",
					key: "1lhgn2"
				}],
				["path", {
					d: "M20 3v4",
					key: "1olli1"
				}],
				["path", {
					d: "M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401",
					key: "kfwtm"
				}]
			]);
			createLucideIcon("monitor", [
				["rect", {
					width: "20",
					height: "14",
					x: "2",
					y: "3",
					rx: "2",
					key: "48i651"
				}],
				["line", {
					x1: "8",
					x2: "16",
					y1: "21",
					y2: "21",
					key: "1svkeh"
				}],
				["line", {
					x1: "12",
					x2: "12",
					y1: "17",
					y2: "21",
					key: "vw1qmm"
				}]
			]);
			createLucideIcon("moon", [["path", {
				d: "M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401",
				key: "kfwtm"
			}]]);
			createLucideIcon("mop-sparkles", [
				["path", {
					d: "M10 22a3 3 0 01-3-3",
					key: "oxdmti"
				}],
				["path", {
					d: "M10 22c2.761 0 5-1.79 5-4-4.42 0-4.08-5-8.5-5a4.501 4.501 0 000 9z",
					key: "q53vem"
				}],
				["path", {
					d: "M10 3H8",
					key: "mzdi2d"
				}],
				["path", {
					d: "M12.5 11.5 22 2",
					key: "1r4cui"
				}],
				["path", {
					d: "M20 13v4",
					key: "1ugfop"
				}],
				["path", {
					d: "M22 15h-4",
					key: "1es58f"
				}],
				["path", {
					d: "M4 5v4",
					key: "13jjxc"
				}],
				["path", {
					d: "M6 7H2",
					key: "8zbtv0"
				}],
				["path", {
					d: "m6.98 13.02 2.665-2.664a1.21 1.21 0 011.71 0l2.29 2.288a1.21 1.21 0 010 1.712l-2.088 2.087",
					key: "1dw0bk"
				}],
				["path", {
					d: "M9 2v2",
					key: "165o2o"
				}]
			]);
			createLucideIcon("mop", [
				["path", {
					d: "M10 22c2.761 0 5-1.79 5-4-4.42 0-4.08-5-8.5-5a1 1 0 100 9za3 3 0 01-3-3",
					key: "16ixf7"
				}],
				["path", {
					d: "M12.5 11.5 22 2",
					key: "1r4cui"
				}],
				["path", {
					d: "m6.98 13.02 2.665-2.664a1.21 1.21 0 011.71 0l2.29 2.288a1.21 1.21 0 010 1.712l-2.088 2.087",
					key: "1dw0bk"
				}]
			]);
			createLucideIcon("mosque", [
				["path", {
					d: "M12.268 2a2 2 0 003.465 2",
					key: "3in8xp"
				}],
				["path", {
					d: "M14 5 L14 8",
					key: "1fhhfb"
				}],
				["path", {
					d: "M16 22v-3a2 2 0 00-4 0v3",
					key: "1p6nbd"
				}],
				["path", {
					d: "M21 13c-.662-1.497-1.666-2.753-2.9-3.63C16.825 8.47 15.422 8 14 8s-2.826.47-4.1 1.37C8.668 10.248 7.663 11.504 7 13z",
					key: "ck3r5y"
				}],
				["path", {
					d: "M3 9h4",
					key: "rnfnj5"
				}],
				["path", {
					d: "M7 22V6a5 5 0 00-2-4 5 5 0 00-2 4v14a2 2 0 002 2h14a2 2 0 002-2v-7",
					key: "28kgc3"
				}]
			]);
			createLucideIcon("mountain", [["path", {
				d: "m8 3 4 8 5-5 5 15H2L8 3z",
				key: "otkl63"
			}]]);
			createLucideIcon("motorbike", [
				["path", {
					d: "m18 14-1-3",
					key: "bdajw9"
				}],
				["path", {
					d: "m3 9 6 2a2 2 0 0 1 2-2h2a2 2 0 0 1 1.99 1.81",
					key: "f5fotj"
				}],
				["path", {
					d: "M8 17h3a1 1 0 0 0 1-1 6 6 0 0 1 6-6 1 1 0 0 0 1-1v-.75A5 5 0 0 0 17 5",
					key: "3i90e2"
				}],
				["circle", {
					cx: "19",
					cy: "17",
					r: "3",
					key: "1otbdv"
				}],
				["circle", {
					cx: "5",
					cy: "17",
					r: "3",
					key: "1d8p0c"
				}]
			]);
			createLucideIcon("mountain-snow", [["path", {
				d: "m8 3 4 8 5-5 5 15H2L8 3z",
				key: "otkl63"
			}], ["path", {
				d: "M4.14 15.08c2.62-1.57 5.24-1.43 7.86.42 2.74 1.94 5.49 2 8.23.19",
				key: "1pvmmp"
			}]]);
			createLucideIcon("mouse-left", [
				["path", {
					d: "M12 7.318V10",
					key: "17s7lh"
				}],
				["path", {
					d: "M5 10v5a7 7 0 0 0 14 0V9c0-3.527-2.608-6.515-6-7",
					key: "imk5ea"
				}],
				["circle", {
					cx: "7",
					cy: "4",
					r: "2",
					key: "ra7k3"
				}]
			]);
			createLucideIcon("mouse-off", [
				["path", {
					d: "M12 6v.343",
					key: "1gyhex"
				}],
				["path", {
					d: "M18.218 18.218A7 7 0 0 1 5 15V9a7 7 0 0 1 .782-3.218",
					key: "ukzz01"
				}],
				["path", {
					d: "M19 13.343V9A7 7 0 0 0 8.56 2.902",
					key: "104jy9"
				}],
				["path", {
					d: "M22 22 2 2",
					key: "1r8tn9"
				}]
			]);
			createLucideIcon("mouse-pointer-2-off", [
				["path", {
					d: "m15.55 8.45 5.138 2.087a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063L8.45 15.551",
					key: "1qoshx"
				}],
				["path", {
					d: "M22 2 2 22",
					key: "y4kqgn"
				}],
				["path", {
					d: "m6.816 11.528-2.779-6.84a.495.495 0 0 1 .651-.651l6.84 2.779",
					key: "mymuvk"
				}]
			]);
			createLucideIcon("mouse-pointer-2", [["path", {
				d: "M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z",
				key: "edeuup"
			}]]);
			createLucideIcon("mouse-pointer-ban", [
				["path", {
					d: "M2.034 2.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.944L8.204 7.545a1 1 0 0 0-.66.66l-1.066 3.443a.5.5 0 0 1-.944.033z",
					key: "11pp1i"
				}],
				["circle", {
					cx: "16",
					cy: "16",
					r: "6",
					key: "qoo3c4"
				}],
				["path", {
					d: "m11.8 11.8 8.4 8.4",
					key: "oogvdj"
				}]
			]);
			createLucideIcon("mouse-pointer-click", [
				["path", {
					d: "M14 4.1 12 6",
					key: "ita8i4"
				}],
				["path", {
					d: "m5.1 8-2.9-.8",
					key: "1go3kf"
				}],
				["path", {
					d: "m6 12-1.9 2",
					key: "mnht97"
				}],
				["path", {
					d: "M7.2 2.2 8 5.1",
					key: "1cfko1"
				}],
				["path", {
					d: "M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z",
					key: "s0h3yz"
				}]
			]);
			createLucideIcon("mouse-pointer", [["path", {
				d: "M12.586 12.586 19 19",
				key: "ea5xo7"
			}], ["path", {
				d: "M3.688 3.037a.497.497 0 0 0-.651.651l6.5 15.999a.501.501 0 0 0 .947-.062l1.569-6.083a2 2 0 0 1 1.448-1.479l6.124-1.579a.5.5 0 0 0 .063-.947z",
				key: "277e5u"
			}]]);
			createLucideIcon("mouse-right", [
				["path", {
					d: "M12 7.318V10",
					key: "17s7lh"
				}],
				["path", {
					d: "M19 10v5a7 7 0 0 1-14 0V9c0-3.527 2.608-6.515 6-7",
					key: "2es5nn"
				}],
				["circle", {
					cx: "17",
					cy: "4",
					r: "2",
					key: "y5j2s2"
				}]
			]);
			createLucideIcon("mouse", [["rect", {
				x: "5",
				y: "2",
				width: "14",
				height: "20",
				rx: "7",
				key: "11ol66"
			}], ["path", {
				d: "M12 6v4",
				key: "16clxf"
			}]]);
			createLucideIcon("move-3d", [
				["path", {
					d: "M5 3v16h16",
					key: "1mqmf9"
				}],
				["path", {
					d: "m5 19 6-6",
					key: "jh6hbb"
				}],
				["path", {
					d: "m2 6 3-3 3 3",
					key: "tkyvxa"
				}],
				["path", {
					d: "m18 16 3 3-3 3",
					key: "1d4glt"
				}]
			]);
			createLucideIcon("move-diagonal", [
				["path", {
					d: "M11 19H5v-6",
					key: "8awifj"
				}],
				["path", {
					d: "M13 5h6v6",
					key: "7voy1q"
				}],
				["path", {
					d: "M19 5 5 19",
					key: "wwaj1z"
				}]
			]);
			createLucideIcon("move-diagonal-2", [
				["path", {
					d: "M19 13v6h-6",
					key: "1hxl6d"
				}],
				["path", {
					d: "M5 11V5h6",
					key: "12e2xe"
				}],
				["path", {
					d: "m5 5 14 14",
					key: "11anup"
				}]
			]);
			createLucideIcon("move-down-left", [["path", {
				d: "M11 19H5V13",
				key: "1akmht"
			}], ["path", {
				d: "M19 5L5 19",
				key: "72u4yj"
			}]]);
			createLucideIcon("move-down-right", [["path", {
				d: "M19 13V19H13",
				key: "10vkzq"
			}], ["path", {
				d: "M5 5L19 19",
				key: "5zm2fv"
			}]]);
			createLucideIcon("move-down", [["path", {
				d: "M8 18L12 22L16 18",
				key: "cskvfv"
			}], ["path", {
				d: "M12 2V22",
				key: "r89rzk"
			}]]);
			createLucideIcon("move-horizontal", [
				["path", {
					d: "m18 8 4 4-4 4",
					key: "1ak13k"
				}],
				["path", {
					d: "M2 12h20",
					key: "9i4pu4"
				}],
				["path", {
					d: "m6 8-4 4 4 4",
					key: "15zrgr"
				}]
			]);
			createLucideIcon("move-right", [["path", {
				d: "M18 8L22 12L18 16",
				key: "1r0oui"
			}], ["path", {
				d: "M2 12H22",
				key: "1m8cig"
			}]]);
			createLucideIcon("move-left", [["path", {
				d: "M6 8L2 12L6 16",
				key: "kyvwex"
			}], ["path", {
				d: "M2 12H22",
				key: "1m8cig"
			}]]);
			createLucideIcon("move-up-left", [["path", {
				d: "M5 11V5H11",
				key: "3q78g9"
			}], ["path", {
				d: "M5 5L19 19",
				key: "5zm2fv"
			}]]);
			createLucideIcon("move-up", [["path", {
				d: "M8 6L12 2L16 6",
				key: "1yvkyx"
			}], ["path", {
				d: "M12 2V22",
				key: "r89rzk"
			}]]);
			createLucideIcon("move-up-right", [["path", {
				d: "M13 5H19V11",
				key: "1n1gyv"
			}], ["path", {
				d: "M19 5L5 19",
				key: "72u4yj"
			}]]);
			createLucideIcon("move-vertical", [
				["path", {
					d: "M12 2v20",
					key: "t6zp3m"
				}],
				["path", {
					d: "m8 18 4 4 4-4",
					key: "bh5tu3"
				}],
				["path", {
					d: "m8 6 4-4 4 4",
					key: "ybng9g"
				}]
			]);
			createLucideIcon("move", [
				["path", {
					d: "M12 2v20",
					key: "t6zp3m"
				}],
				["path", {
					d: "m15 19-3 3-3-3",
					key: "11eu04"
				}],
				["path", {
					d: "m19 9 3 3-3 3",
					key: "1mg7y2"
				}],
				["path", {
					d: "M2 12h20",
					key: "9i4pu4"
				}],
				["path", {
					d: "m5 9-3 3 3 3",
					key: "j64kie"
				}],
				["path", {
					d: "m9 5 3-3 3 3",
					key: "l8vdw6"
				}]
			]);
			createLucideIcon("music-2", [["circle", {
				cx: "8",
				cy: "18",
				r: "4",
				key: "1fc0mg"
			}], ["path", {
				d: "M12 18V2l7 4",
				key: "g04rme"
			}]]);
			createLucideIcon("music-3", [["circle", {
				cx: "12",
				cy: "18",
				r: "4",
				key: "m3r9ws"
			}], ["path", {
				d: "M16 18V2",
				key: "40x2m5"
			}]]);
			createLucideIcon("music-4", [
				["path", {
					d: "M9 18V5l12-2v13",
					key: "1jmyc2"
				}],
				["path", {
					d: "m9 9 12-2",
					key: "1e64n2"
				}],
				["circle", {
					cx: "6",
					cy: "18",
					r: "3",
					key: "fqmcym"
				}],
				["circle", {
					cx: "18",
					cy: "16",
					r: "3",
					key: "1hluhg"
				}]
			]);
			createLucideIcon("music", [
				["path", {
					d: "M9 18V5l12-2v13",
					key: "1jmyc2"
				}],
				["circle", {
					cx: "6",
					cy: "18",
					r: "3",
					key: "fqmcym"
				}],
				["circle", {
					cx: "18",
					cy: "16",
					r: "3",
					key: "1hluhg"
				}]
			]);
			createLucideIcon("navigation-2-off", [
				["path", {
					d: "M9.31 9.31 5 21l7-4 7 4-1.17-3.17",
					key: "qoq2o2"
				}],
				["path", {
					d: "M14.53 8.88 12 2l-1.17 3.17",
					key: "k3sjzy"
				}],
				["line", {
					x1: "2",
					x2: "22",
					y1: "2",
					y2: "22",
					key: "a6p6uj"
				}]
			]);
			createLucideIcon("navigation-2", [["polygon", {
				points: "12 2 19 21 12 17 5 21 12 2",
				key: "x8c0qg"
			}]]);
			createLucideIcon("navigation-off", [
				["path", {
					d: "M8.43 8.43 3 11l8 2 2 8 2.57-5.43",
					key: "1vdtb7"
				}],
				["path", {
					d: "M17.39 11.73 22 2l-9.73 4.61",
					key: "tya3r6"
				}],
				["line", {
					x1: "2",
					x2: "22",
					y1: "2",
					y2: "22",
					key: "a6p6uj"
				}]
			]);
			createLucideIcon("navigation", [["polygon", {
				points: "3 11 22 2 13 21 11 13 3 11",
				key: "1ltx0t"
			}]]);
			createLucideIcon("network", [
				["rect", {
					x: "16",
					y: "16",
					width: "6",
					height: "6",
					rx: "1",
					key: "4q2zg0"
				}],
				["rect", {
					x: "2",
					y: "16",
					width: "6",
					height: "6",
					rx: "1",
					key: "8cvhb9"
				}],
				["rect", {
					x: "9",
					y: "2",
					width: "6",
					height: "6",
					rx: "1",
					key: "1egb70"
				}],
				["path", {
					d: "M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3",
					key: "1jsf9p"
				}],
				["path", {
					d: "M12 12V8",
					key: "2874zd"
				}]
			]);
			createLucideIcon("newspaper", [
				["path", {
					d: "M15 18h-5",
					key: "95g1m2"
				}],
				["path", {
					d: "M18 14h-8",
					key: "sponae"
				}],
				["path", {
					d: "M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2",
					key: "39pd36"
				}],
				["rect", {
					width: "8",
					height: "4",
					x: "10",
					y: "6",
					rx: "1",
					key: "aywv1n"
				}]
			]);
			createLucideIcon("nfc", [
				["path", {
					d: "M6 8.32a7.43 7.43 0 0 1 0 7.36",
					key: "9iaqei"
				}],
				["path", {
					d: "M9.46 6.21a11.76 11.76 0 0 1 0 11.58",
					key: "1yha7l"
				}],
				["path", {
					d: "M12.91 4.1a15.91 15.91 0 0 1 .01 15.8",
					key: "4iu2gk"
				}],
				["path", {
					d: "M16.37 2a20.16 20.16 0 0 1 0 20",
					key: "sap9u2"
				}]
			]);
			createLucideIcon("non-binary", [
				["path", {
					d: "M12 2v10",
					key: "mnfbl"
				}],
				["path", {
					d: "m8.5 4 7 4",
					key: "m1xjk3"
				}],
				["path", {
					d: "m8.5 8 7-4",
					key: "t0m5j6"
				}],
				["circle", {
					cx: "12",
					cy: "17",
					r: "5",
					key: "qbz8iq"
				}]
			]);
			createLucideIcon("notebook-pen", [
				["path", {
					d: "M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4",
					key: "re6nr2"
				}],
				["path", {
					d: "M2 6h4",
					key: "aawbzj"
				}],
				["path", {
					d: "M2 10h4",
					key: "l0bgd4"
				}],
				["path", {
					d: "M2 14h4",
					key: "1gsvsf"
				}],
				["path", {
					d: "M2 18h4",
					key: "1bu2t1"
				}],
				["path", {
					d: "M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z",
					key: "pqwjuv"
				}]
			]);
			createLucideIcon("notebook-tabs", [
				["path", {
					d: "M2 6h4",
					key: "aawbzj"
				}],
				["path", {
					d: "M2 10h4",
					key: "l0bgd4"
				}],
				["path", {
					d: "M2 14h4",
					key: "1gsvsf"
				}],
				["path", {
					d: "M2 18h4",
					key: "1bu2t1"
				}],
				["rect", {
					width: "16",
					height: "20",
					x: "4",
					y: "2",
					rx: "2",
					key: "1nb95v"
				}],
				["path", {
					d: "M15 2v20",
					key: "dcj49h"
				}],
				["path", {
					d: "M15 7h5",
					key: "1xj5lc"
				}],
				["path", {
					d: "M15 12h5",
					key: "w5shd9"
				}],
				["path", {
					d: "M15 17h5",
					key: "1qaofu"
				}]
			]);
			createLucideIcon("notebook-text", [
				["path", {
					d: "M2 6h4",
					key: "aawbzj"
				}],
				["path", {
					d: "M2 10h4",
					key: "l0bgd4"
				}],
				["path", {
					d: "M2 14h4",
					key: "1gsvsf"
				}],
				["path", {
					d: "M2 18h4",
					key: "1bu2t1"
				}],
				["rect", {
					width: "16",
					height: "20",
					x: "4",
					y: "2",
					rx: "2",
					key: "1nb95v"
				}],
				["path", {
					d: "M9.5 8h5",
					key: "11mslq"
				}],
				["path", {
					d: "M9.5 12H16",
					key: "ktog6x"
				}],
				["path", {
					d: "M9.5 16H14",
					key: "p1seyn"
				}]
			]);
			createLucideIcon("notebook", [
				["path", {
					d: "M2 6h4",
					key: "aawbzj"
				}],
				["path", {
					d: "M2 10h4",
					key: "l0bgd4"
				}],
				["path", {
					d: "M2 14h4",
					key: "1gsvsf"
				}],
				["path", {
					d: "M2 18h4",
					key: "1bu2t1"
				}],
				["rect", {
					width: "16",
					height: "20",
					x: "4",
					y: "2",
					rx: "2",
					key: "1nb95v"
				}],
				["path", {
					d: "M16 2v20",
					key: "rotuqe"
				}]
			]);
			createLucideIcon("notepad-text-dashed", [
				["path", {
					d: "M8 2v4",
					key: "1cmpym"
				}],
				["path", {
					d: "M12 2v4",
					key: "3427ic"
				}],
				["path", {
					d: "M16 2v4",
					key: "4m81vk"
				}],
				["path", {
					d: "M16 4h2a2 2 0 0 1 2 2v2",
					key: "j91f56"
				}],
				["path", {
					d: "M20 12v2",
					key: "w8o0tu"
				}],
				["path", {
					d: "M20 18v2a2 2 0 0 1-2 2h-1",
					key: "1c9ggx"
				}],
				["path", {
					d: "M13 22h-2",
					key: "191ugt"
				}],
				["path", {
					d: "M7 22H6a2 2 0 0 1-2-2v-2",
					key: "1rt9px"
				}],
				["path", {
					d: "M4 14v-2",
					key: "1v0sqh"
				}],
				["path", {
					d: "M4 8V6a2 2 0 0 1 2-2h2",
					key: "1mwabg"
				}],
				["path", {
					d: "M8 10h6",
					key: "3oa6kw"
				}],
				["path", {
					d: "M8 14h8",
					key: "1fgep2"
				}],
				["path", {
					d: "M8 18h5",
					key: "17enja"
				}]
			]);
			createLucideIcon("notepad-text", [
				["path", {
					d: "M8 2v4",
					key: "1cmpym"
				}],
				["path", {
					d: "M12 2v4",
					key: "3427ic"
				}],
				["path", {
					d: "M16 2v4",
					key: "4m81vk"
				}],
				["rect", {
					width: "16",
					height: "18",
					x: "4",
					y: "4",
					rx: "2",
					key: "1u9h20"
				}],
				["path", {
					d: "M8 10h6",
					key: "3oa6kw"
				}],
				["path", {
					d: "M8 14h8",
					key: "1fgep2"
				}],
				["path", {
					d: "M8 18h5",
					key: "17enja"
				}]
			]);
			createLucideIcon("nut-off", [
				["path", {
					d: "M12 4V2",
					key: "1k5q1u"
				}],
				["path", {
					d: "M5 10v4a7.004 7.004 0 0 0 5.277 6.787c.412.104.802.292 1.102.592L12 22l.621-.621c.3-.3.69-.488 1.102-.592a7.01 7.01 0 0 0 4.125-2.939",
					key: "1xcvy9"
				}],
				["path", {
					d: "M19 10v3.343",
					key: "163tfc"
				}],
				["path", {
					d: "M12 12c-1.349-.573-1.905-1.005-2.5-2-.546.902-1.048 1.353-2.5 2-1.018-.644-1.46-1.08-2-2-1.028.71-1.69.918-3 1 1.081-1.048 1.757-2.03 2-3 .194-.776.84-1.551 1.79-2.21m11.654 5.997c.887-.457 1.28-.891 1.556-1.787 1.032.916 1.683 1.157 3 1-1.297-1.036-1.758-2.03-2-3-.5-2-4-4-8-4-.74 0-1.461.068-2.15.192",
					key: "17914v"
				}],
				["line", {
					x1: "2",
					x2: "22",
					y1: "2",
					y2: "22",
					key: "a6p6uj"
				}]
			]);
			createLucideIcon("nut", [
				["path", {
					d: "M12 4V2",
					key: "1k5q1u"
				}],
				["path", {
					d: "M5 10v4a7.004 7.004 0 0 0 5.277 6.787c.412.104.802.292 1.102.592L12 22l.621-.621c.3-.3.69-.488 1.102-.592A7.003 7.003 0 0 0 19 14v-4",
					key: "1tgyif"
				}],
				["path", {
					d: "M12 4C8 4 4.5 6 4 8c-.243.97-.919 1.952-2 3 1.31-.082 1.972-.29 3-1 .54.92.982 1.356 2 2 1.452-.647 1.954-1.098 2.5-2 .595.995 1.151 1.427 2.5 2 1.31-.621 1.862-1.058 2.5-2 .629.977 1.162 1.423 2.5 2 1.209-.548 1.68-.967 2-2 1.032.916 1.683 1.157 3 1-1.297-1.036-1.758-2.03-2-3-.5-2-4-4-8-4Z",
					key: "tnsqj"
				}]
			]);
			createLucideIcon("octagon-alert", [
				["path", {
					d: "M12 16h.01",
					key: "1drbdi"
				}],
				["path", {
					d: "M12 8v4",
					key: "1got3b"
				}],
				["path", {
					d: "M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z",
					key: "1fd625"
				}]
			]);
			createLucideIcon("octagon-minus", [["path", {
				d: "M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z",
				key: "2d38gg"
			}], ["path", {
				d: "M8 12h8",
				key: "1wcyev"
			}]]);
			createLucideIcon("octagon-pause", [
				["path", {
					d: "M10 15V9",
					key: "1lckn7"
				}],
				["path", {
					d: "M14 15V9",
					key: "1muqhk"
				}],
				["path", {
					d: "M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z",
					key: "2d38gg"
				}]
			]);
			createLucideIcon("octagon-x", [
				["path", {
					d: "m15 9-6 6",
					key: "1uzhvr"
				}],
				["path", {
					d: "M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z",
					key: "2d38gg"
				}],
				["path", {
					d: "m9 9 6 6",
					key: "z0biqf"
				}]
			]);
			createLucideIcon("octagon", [["path", {
				d: "M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z",
				key: "2d38gg"
			}]]);
			createLucideIcon("omega", [["path", {
				d: "M3 20h4.5a.5.5 0 0 0 .5-.5v-.282a.52.52 0 0 0-.247-.437 8 8 0 1 1 8.494-.001.52.52 0 0 0-.247.438v.282a.5.5 0 0 0 .5.5H21",
				key: "1x94xo"
			}]]);
			createLucideIcon("option", [["path", {
				d: "M14 3h7",
				key: "16f0ms"
			}], ["path", {
				d: "M3 3h5.28a1 1 0 0 1 .948.684l5.544 16.632a1 1 0 0 0 .949.684H21",
				key: "1qf1im"
			}]]);
			createLucideIcon("orbit", [
				["path", {
					d: "M20.341 6.484A10 10 0 0 1 10.266 21.85",
					key: "1enhxb"
				}],
				["path", {
					d: "M3.659 17.516A10 10 0 0 1 13.74 2.152",
					key: "1crzgf"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "3",
					key: "1v7zrd"
				}],
				["circle", {
					cx: "19",
					cy: "5",
					r: "2",
					key: "mhkx31"
				}],
				["circle", {
					cx: "5",
					cy: "19",
					r: "2",
					key: "v8kfzx"
				}]
			]);
			createLucideIcon("origami", [
				["path", {
					d: "M12 12V4a1 1 0 0 1 1-1h6.297a1 1 0 0 1 .651 1.759l-4.696 4.025",
					key: "1bx4vc"
				}],
				["path", {
					d: "m12 21-7.414-7.414A2 2 0 0 1 4 12.172V6.415a1.002 1.002 0 0 1 1.707-.707L20 20.009",
					key: "1h3km6"
				}],
				["path", {
					d: "m12.214 3.381 8.414 14.966a1 1 0 0 1-.167 1.199l-1.168 1.163a1 1 0 0 1-.706.291H6.351a1 1 0 0 1-.625-.219L3.25 18.8a1 1 0 0 1 .631-1.781l4.165.027",
					key: "1hj4wg"
				}]
			]);
			createLucideIcon("package-2", [
				["path", {
					d: "M12 3v6",
					key: "1holv5"
				}],
				["path", {
					d: "M16.76 3a2 2 0 0 1 1.8 1.1l2.23 4.479a2 2 0 0 1 .21.891V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.472a2 2 0 0 1 .211-.894L5.45 4.1A2 2 0 0 1 7.24 3z",
					key: "187q7i"
				}],
				["path", {
					d: "M3.054 9.013h17.893",
					key: "grwhos"
				}]
			]);
			createLucideIcon("package-check", [
				["path", {
					d: "M12 22V12",
					key: "d0xqtd"
				}],
				["path", {
					d: "m16 17 2 2 4-4",
					key: "uh5qu3"
				}],
				["path", {
					d: "M21 11.127V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l1.32-.753",
					key: "kpkbpo"
				}],
				["path", {
					d: "M3.29 7 12 12l8.71-5",
					key: "19ckod"
				}],
				["path", {
					d: "m7.5 4.27 8.997 5.148",
					key: "9yrvtv"
				}]
			]);
			createLucideIcon("package-minus", [
				["path", {
					d: "M12 22V12",
					key: "d0xqtd"
				}],
				["path", {
					d: "M16 17h6",
					key: "1ook5g"
				}],
				["path", {
					d: "M21 13V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l1.675-.955",
					key: "zu9avd"
				}],
				["path", {
					d: "M3.29 7 12 12l8.71-5",
					key: "19ckod"
				}],
				["path", {
					d: "m7.5 4.27 8.997 5.148",
					key: "9yrvtv"
				}]
			]);
			createLucideIcon("package-open", [
				["path", {
					d: "M12 22v-9",
					key: "x3hkom"
				}],
				["path", {
					d: "M15.17 2.21a1.67 1.67 0 0 1 1.63 0L21 4.57a1.93 1.93 0 0 1 0 3.36L8.82 14.79a1.655 1.655 0 0 1-1.64 0L3 12.43a1.93 1.93 0 0 1 0-3.36z",
					key: "2ntwy6"
				}],
				["path", {
					d: "M20 13v3.87a2.06 2.06 0 0 1-1.11 1.83l-6 3.08a1.93 1.93 0 0 1-1.78 0l-6-3.08A2.06 2.06 0 0 1 4 16.87V13",
					key: "1pmm1c"
				}],
				["path", {
					d: "M21 12.43a1.93 1.93 0 0 0 0-3.36L8.83 2.2a1.64 1.64 0 0 0-1.63 0L3 4.57a1.93 1.93 0 0 0 0 3.36l12.18 6.86a1.636 1.636 0 0 0 1.63 0z",
					key: "12ttoo"
				}]
			]);
			createLucideIcon("package-plus", [
				["path", {
					d: "M12 22V12",
					key: "d0xqtd"
				}],
				["path", {
					d: "M16 17h6",
					key: "1ook5g"
				}],
				["path", {
					d: "M19 14v6",
					key: "1ckrd5"
				}],
				["path", {
					d: "M21 10.535V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l1.675-.955",
					key: "28k6lz"
				}],
				["path", {
					d: "M3.29 7 12 12l8.71-5",
					key: "19ckod"
				}],
				["path", {
					d: "m7.5 4.27 8.997 5.148",
					key: "9yrvtv"
				}]
			]);
			createLucideIcon("package-search", [
				["path", {
					d: "M12 22V12",
					key: "d0xqtd"
				}],
				["path", {
					d: "M20.27 18.27 22 20",
					key: "er2am"
				}],
				["path", {
					d: "M21 10.498V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l.98-.559",
					key: "tok1h1"
				}],
				["path", {
					d: "M3.29 7 12 12l8.71-5",
					key: "19ckod"
				}],
				["path", {
					d: "m7.5 4.27 8.997 5.148",
					key: "9yrvtv"
				}],
				["circle", {
					cx: "18.5",
					cy: "16.5",
					r: "2.5",
					key: "ke13xx"
				}]
			]);
			createLucideIcon("package-x", [
				["path", {
					d: "M12 22V12",
					key: "d0xqtd"
				}],
				["path", {
					d: "m16.5 14.5 5 5",
					key: "ozpm51"
				}],
				["path", {
					d: "m16.5 19.5 5-5",
					key: "syf6b9"
				}],
				["path", {
					d: "M21 10.5V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l.13-.074",
					key: "isw6gs"
				}],
				["path", {
					d: "M3.29 7 12 12l8.71-5",
					key: "19ckod"
				}],
				["path", {
					d: "m7.5 4.27 8.997 5.148",
					key: "9yrvtv"
				}]
			]);
			createLucideIcon("package", [
				["path", {
					d: "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z",
					key: "1a0edw"
				}],
				["path", {
					d: "M12 22V12",
					key: "d0xqtd"
				}],
				["polyline", {
					points: "3.29 7 12 12 20.71 7",
					key: "ousv84"
				}],
				["path", {
					d: "m7.5 4.27 9 5.15",
					key: "1c824w"
				}]
			]);
			createLucideIcon("paint-bucket", [
				["path", {
					d: "M11 7 6 2",
					key: "1jwth8"
				}],
				["path", {
					d: "M18.992 12H2.041",
					key: "xw1gg"
				}],
				["path", {
					d: "M21.145 18.38A3.34 3.34 0 0 1 20 16.5a3.3 3.3 0 0 1-1.145 1.88c-.575.46-.855 1.02-.855 1.595A2 2 0 0 0 20 22a2 2 0 0 0 2-2.025c0-.58-.285-1.13-.855-1.595",
					key: "1nkol4"
				}],
				["path", {
					d: "m8.5 4.5 2.148-2.148a1.205 1.205 0 0 1 1.704 0l7.296 7.296a1.205 1.205 0 0 1 0 1.704l-7.592 7.592a3.615 3.615 0 0 1-5.112 0l-3.888-3.888a3.615 3.615 0 0 1 0-5.112L5.67 7.33",
					key: "1nk1rd"
				}]
			]);
			createLucideIcon("paint-roller", [
				["rect", {
					width: "16",
					height: "6",
					x: "2",
					y: "2",
					rx: "2",
					key: "jcyz7m"
				}],
				["path", {
					d: "M10 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2",
					key: "1b9h7c"
				}],
				["rect", {
					width: "4",
					height: "6",
					x: "8",
					y: "16",
					rx: "1",
					key: "d6e7yl"
				}]
			]);
			createLucideIcon("paintbrush-vertical", [
				["path", {
					d: "M10 2v2",
					key: "7u0qdc"
				}],
				["path", {
					d: "M14 2v4",
					key: "qmzblu"
				}],
				["path", {
					d: "M17 2a1 1 0 0 1 1 1v9H6V3a1 1 0 0 1 1-1z",
					key: "ycvu00"
				}],
				["path", {
					d: "M6 12a1 1 0 0 0-1 1v1a2 2 0 0 0 2 2h2a1 1 0 0 1 1 1v2.9a2 2 0 1 0 4 0V17a1 1 0 0 1 1-1h2a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1",
					key: "iw4wnp"
				}]
			]);
			createLucideIcon("paintbrush", [
				["path", {
					d: "m14.622 17.897-10.68-2.913",
					key: "vj2p1u"
				}],
				["path", {
					d: "M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z",
					key: "18tc5c"
				}],
				["path", {
					d: "M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15",
					key: "ytzfxy"
				}]
			]);
			createLucideIcon("palette", [
				["path", {
					d: "M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z",
					key: "e79jfc"
				}],
				["circle", {
					cx: "13.5",
					cy: "6.5",
					r: ".5",
					fill: "currentColor",
					key: "1okk4w"
				}],
				["circle", {
					cx: "17.5",
					cy: "10.5",
					r: ".5",
					fill: "currentColor",
					key: "f64h9f"
				}],
				["circle", {
					cx: "6.5",
					cy: "12.5",
					r: ".5",
					fill: "currentColor",
					key: "qy21gx"
				}],
				["circle", {
					cx: "8.5",
					cy: "7.5",
					r: ".5",
					fill: "currentColor",
					key: "fotxhn"
				}]
			]);
			createLucideIcon("panda", [
				["path", {
					d: "M11.25 17.25h1.5L12 18z",
					key: "1wmwwj"
				}],
				["path", {
					d: "m15 12 2 2",
					key: "k60wz4"
				}],
				["path", {
					d: "M17.902 6.599a8 8 0 0 0-.5-.5",
					key: "1hpval"
				}],
				["path", {
					d: "M2 14.5C2 19.47 6.48 22 12 22s10-2.53 10-7.5a10 10 0 0 0-1.3-4.83 4.5 4.5 0 1 0-7.05-5.5 8 8 0 0 0-3.3 0 4.5 4.5 0 1 0-7.04 5.5A10 10 0 0 0 2 14.5",
					key: "fsvxqb"
				}],
				["path", {
					d: "M6.099 6.599a8 8 0 0 1 .5-.5",
					key: "1mh6nx"
				}],
				["path", {
					d: "m9 12-2 2",
					key: "326nkw"
				}]
			]);
			createLucideIcon("panel-bottom-dashed", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M14 15h1",
					key: "171nev"
				}],
				["path", {
					d: "M19 15h2",
					key: "1vnucp"
				}],
				["path", {
					d: "M3 15h2",
					key: "8bym0q"
				}],
				["path", {
					d: "M9 15h1",
					key: "1tg3ks"
				}]
			]);
			createLucideIcon("panel-bottom-open", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M3 15h18",
					key: "5xshup"
				}],
				["path", {
					d: "m9 10 3-3 3 3",
					key: "11gsxs"
				}]
			]);
			createLucideIcon("panel-bottom-close", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M3 15h18",
					key: "5xshup"
				}],
				["path", {
					d: "m15 8-3 3-3-3",
					key: "1oxy1z"
				}]
			]);
			createLucideIcon("panel-bottom", [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2",
				key: "afitv7"
			}], ["path", {
				d: "M3 15h18",
				key: "5xshup"
			}]]);
			createLucideIcon("panel-left-close", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M9 3v18",
					key: "fh3hqa"
				}],
				["path", {
					d: "m16 15-3-3 3-3",
					key: "14y99z"
				}]
			]);
			createLucideIcon("panel-left-dashed", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M9 14v1",
					key: "askpd8"
				}],
				["path", {
					d: "M9 19v2",
					key: "16tejx"
				}],
				["path", {
					d: "M9 3v2",
					key: "1noubl"
				}],
				["path", {
					d: "M9 9v1",
					key: "19ebxg"
				}]
			]);
			createLucideIcon("panel-left-open", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M9 3v18",
					key: "fh3hqa"
				}],
				["path", {
					d: "m14 9 3 3-3 3",
					key: "8010ee"
				}]
			]);
			createLucideIcon("panel-left-right-dashed", [
				["path", {
					d: "M15 10V9",
					key: "4dkmfx"
				}],
				["path", {
					d: "M15 15v-1",
					key: "6a4afx"
				}],
				["path", {
					d: "M15 21v-2",
					key: "1qshmc"
				}],
				["path", {
					d: "M15 5V3",
					key: "1fk0mb"
				}],
				["path", {
					d: "M9 10V9",
					key: "1lazqi"
				}],
				["path", {
					d: "M9 15v-1",
					key: "9lx740"
				}],
				["path", {
					d: "M9 21v-2",
					key: "1fwk0n"
				}],
				["path", {
					d: "M9 5V3",
					key: "2q8zi6"
				}],
				["rect", {
					x: "3",
					y: "3",
					width: "18",
					height: "18",
					rx: "2",
					key: "h1oib"
				}]
			]);
			createLucideIcon("panel-left", [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2",
				key: "afitv7"
			}], ["path", {
				d: "M9 3v18",
				key: "fh3hqa"
			}]]);
			createLucideIcon("panel-right-close", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M15 3v18",
					key: "14nvp0"
				}],
				["path", {
					d: "m8 9 3 3-3 3",
					key: "12hl5m"
				}]
			]);
			createLucideIcon("panel-right-dashed", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M15 14v1",
					key: "ilsfch"
				}],
				["path", {
					d: "M15 19v2",
					key: "1fst2f"
				}],
				["path", {
					d: "M15 3v2",
					key: "z204g4"
				}],
				["path", {
					d: "M15 9v1",
					key: "z2a8b1"
				}]
			]);
			createLucideIcon("panel-right-open", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M15 3v18",
					key: "14nvp0"
				}],
				["path", {
					d: "m10 15-3-3 3-3",
					key: "1pgupc"
				}]
			]);
			createLucideIcon("panel-right", [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2",
				key: "afitv7"
			}], ["path", {
				d: "M15 3v18",
				key: "14nvp0"
			}]]);
			createLucideIcon("panel-top-bottom-dashed", [
				["path", {
					d: "M14 15h1",
					key: "171nev"
				}],
				["path", {
					d: "M14 9h1",
					key: "l0svgy"
				}],
				["path", {
					d: "M19 15h2",
					key: "1vnucp"
				}],
				["path", {
					d: "M19 9h2",
					key: "te2zfg"
				}],
				["path", {
					d: "M3 15h2",
					key: "8bym0q"
				}],
				["path", {
					d: "M3 9h2",
					key: "1h4ldw"
				}],
				["path", {
					d: "M9 15h1",
					key: "1tg3ks"
				}],
				["path", {
					d: "M9 9h1",
					key: "15jzuz"
				}],
				["rect", {
					x: "3",
					y: "3",
					width: "18",
					height: "18",
					rx: "2",
					key: "h1oib"
				}]
			]);
			createLucideIcon("panel-top-close", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["path", {
					d: "m9 16 3-3 3 3",
					key: "1idcnm"
				}]
			]);
			createLucideIcon("panel-top-dashed", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M14 9h1",
					key: "l0svgy"
				}],
				["path", {
					d: "M19 9h2",
					key: "te2zfg"
				}],
				["path", {
					d: "M3 9h2",
					key: "1h4ldw"
				}],
				["path", {
					d: "M9 9h1",
					key: "15jzuz"
				}]
			]);
			createLucideIcon("panel-top-open", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["path", {
					d: "m15 14-3 3-3-3",
					key: "g215vf"
				}]
			]);
			createLucideIcon("panel-top", [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2",
				key: "afitv7"
			}], ["path", {
				d: "M3 9h18",
				key: "1pudct"
			}]]);
			createLucideIcon("panels-left-bottom", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M9 3v18",
					key: "fh3hqa"
				}],
				["path", {
					d: "M9 15h12",
					key: "5ijen5"
				}]
			]);
			createLucideIcon("panels-right-bottom", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M3 15h12",
					key: "1wkqb3"
				}],
				["path", {
					d: "M15 3v18",
					key: "14nvp0"
				}]
			]);
			createLucideIcon("paper-bag", [["path", {
				d: "M5.364 3.848C4 6 3 9.652 3 12.652V19a2 2 0 002 2h14a2 2 0 002-2v-5c0-2.334-1.816-4.668-2.622-7.002",
				key: "vlsvfu"
			}], ["path", {
				d: "M7 3h11.379a2 2 0 011.789 1.106l.723 1.447A1 1 0 0119.997 7h-8.525a2 2 0 01-1.789-1.106L8.79 4.105a2 2 0 10-3.579 1.789l2.261 4.522A5 5 0 018 12.652V21",
				key: "12exh5"
			}]]);
			createLucideIcon("panels-top-left", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["path", {
					d: "M9 21V9",
					key: "1oto5p"
				}]
			]);
			createLucideIcon("paperclip", [["path", {
				d: "m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551",
				key: "1miecu"
			}]]);
			createLucideIcon("parasol", [
				["path", {
					d: "M12.5 11.134 18.196 21",
					key: "gf58kt"
				}],
				["path", {
					d: "M20.425 5.299a10 10 0 0 0-16.941 9.78c.183.563.843.774 1.355.478L20.16 6.711c.512-.296.66-.973.264-1.413",
					key: "znqfe4"
				}],
				["path", {
					d: "M21 21H3",
					key: "oafrgs"
				}]
			]);
			createLucideIcon("parentheses", [["path", {
				d: "M8 21s-4-3-4-9 4-9 4-9",
				key: "uto9ud"
			}], ["path", {
				d: "M16 3s4 3 4 9-4 9-4 9",
				key: "4w2vsq"
			}]]);
			createLucideIcon("parking-meter", [
				["path", {
					d: "M11 15h2",
					key: "199qp6"
				}],
				["path", {
					d: "M12 12v3",
					key: "158kv8"
				}],
				["path", {
					d: "M12 19v3",
					key: "npa21l"
				}],
				["path", {
					d: "M15.282 19a1 1 0 0 0 .948-.68l2.37-6.988a7 7 0 1 0-13.2 0l2.37 6.988a1 1 0 0 0 .948.68z",
					key: "1jofit"
				}],
				["path", {
					d: "M9 9a3 3 0 1 1 6 0",
					key: "jdoeu8"
				}]
			]);
			createLucideIcon("party-popper", [
				["path", {
					d: "M5.8 11.3 2 22l10.7-3.79",
					key: "gwxi1d"
				}],
				["path", {
					d: "M4 3h.01",
					key: "1vcuye"
				}],
				["path", {
					d: "M22 8h.01",
					key: "1mrtc2"
				}],
				["path", {
					d: "M15 2h.01",
					key: "1cjtqr"
				}],
				["path", {
					d: "M22 20h.01",
					key: "1mrys2"
				}],
				["path", {
					d: "m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10",
					key: "hbicv8"
				}],
				["path", {
					d: "m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17",
					key: "1i94pl"
				}],
				["path", {
					d: "m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7",
					key: "1cofks"
				}],
				["path", {
					d: "M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z",
					key: "4kbmks"
				}]
			]);
			createLucideIcon("paw-print", [
				["circle", {
					cx: "11",
					cy: "4",
					r: "2",
					key: "vol9p0"
				}],
				["circle", {
					cx: "18",
					cy: "8",
					r: "2",
					key: "17gozi"
				}],
				["circle", {
					cx: "20",
					cy: "16",
					r: "2",
					key: "1v9bxh"
				}],
				["path", {
					d: "M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z",
					key: "1ydw1z"
				}]
			]);
			createLucideIcon("pc-case", [
				["rect", {
					width: "14",
					height: "20",
					x: "5",
					y: "2",
					rx: "2",
					key: "1uq1d7"
				}],
				["path", {
					d: "M15 14h.01",
					key: "1kp3bh"
				}],
				["path", {
					d: "M9 6h6",
					key: "dgm16u"
				}],
				["path", {
					d: "M9 10h6",
					key: "9gxzsh"
				}]
			]);
			createLucideIcon("pause", [["rect", {
				x: "14",
				y: "3",
				width: "5",
				height: "18",
				rx: "1",
				key: "kaeet6"
			}], ["rect", {
				x: "5",
				y: "3",
				width: "5",
				height: "18",
				rx: "1",
				key: "1wsw3u"
			}]]);
			createLucideIcon("pen-line", [["path", {
				d: "M13 21h8",
				key: "1jsn5i"
			}], ["path", {
				d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
				key: "1a8usu"
			}]]);
			createLucideIcon("pen-off", [
				["path", {
					d: "m10 10-6.157 6.162a2 2 0 0 0-.5.833l-1.322 4.36a.5.5 0 0 0 .622.624l4.358-1.323a2 2 0 0 0 .83-.5L14 13.982",
					key: "bjo8r8"
				}],
				["path", {
					d: "m12.829 7.172 4.359-4.346a1 1 0 1 1 3.986 3.986l-4.353 4.353",
					key: "16h5ne"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}]
			]);
			createLucideIcon("pen-tool", [
				["path", {
					d: "M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z",
					key: "nt11vn"
				}],
				["path", {
					d: "m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18",
					key: "15qc1e"
				}],
				["path", {
					d: "m2.3 2.3 7.286 7.286",
					key: "1wuzzi"
				}],
				["circle", {
					cx: "11",
					cy: "11",
					r: "2",
					key: "xmgehs"
				}]
			]);
			createLucideIcon("pen", [["path", {
				d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
				key: "1a8usu"
			}]]);
			createLucideIcon("pencil-line", [
				["path", {
					d: "M13 21h8",
					key: "1jsn5i"
				}],
				["path", {
					d: "m15 5 4 4",
					key: "1mk7zo"
				}],
				["path", {
					d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
					key: "1a8usu"
				}]
			]);
			createLucideIcon("pencil-off", [
				["path", {
					d: "m10 10-6.157 6.162a2 2 0 0 0-.5.833l-1.322 4.36a.5.5 0 0 0 .622.624l4.358-1.323a2 2 0 0 0 .83-.5L14 13.982",
					key: "bjo8r8"
				}],
				["path", {
					d: "m12.829 7.172 4.359-4.346a1 1 0 1 1 3.986 3.986l-4.353 4.353",
					key: "16h5ne"
				}],
				["path", {
					d: "m15 5 4 4",
					key: "1mk7zo"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}]
			]);
			createLucideIcon("pencil-ruler", [
				["path", {
					d: "M13 7 8.7 2.7a2.41 2.41 0 0 0-3.4 0L2.7 5.3a2.41 2.41 0 0 0 0 3.4L7 13",
					key: "orapub"
				}],
				["path", {
					d: "m8 6 2-2",
					key: "115y1s"
				}],
				["path", {
					d: "m18 16 2-2",
					key: "ee94s4"
				}],
				["path", {
					d: "m17 11 4.3 4.3c.94.94.94 2.46 0 3.4l-2.6 2.6c-.94.94-2.46.94-3.4 0L11 17",
					key: "cfq27r"
				}],
				["path", {
					d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
					key: "1a8usu"
				}],
				["path", {
					d: "m15 5 4 4",
					key: "1mk7zo"
				}]
			]);
			createLucideIcon("pencil-sparkles", [
				["path", {
					d: "M10 3H8",
					key: "mzdi2d"
				}],
				["path", {
					d: "m15.007 5.008 3.987 3.986",
					key: "1scubj"
				}],
				["path", {
					d: "M20 15v4",
					key: "nmhudv"
				}],
				["path", {
					d: "M21.174 6.813a2.82 2.82 0 0 0-3.986-3.987L3.842 16.175a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
					key: "fs0856"
				}],
				["path", {
					d: "M22 17h-4",
					key: "1sj068"
				}],
				["path", {
					d: "M4 5v4",
					key: "13jjxc"
				}],
				["path", {
					d: "M6 7H2",
					key: "8zbtv0"
				}],
				["path", {
					d: "M9 2v2",
					key: "165o2o"
				}]
			]);
			createLucideIcon("pencil", [["path", {
				d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
				key: "1a8usu"
			}], ["path", {
				d: "m15 5 4 4",
				key: "1mk7zo"
			}]]);
			createLucideIcon("pentagon", [["path", {
				d: "M10.83 2.38a2 2 0 0 1 2.34 0l8 5.74a2 2 0 0 1 .73 2.25l-3.04 9.26a2 2 0 0 1-1.9 1.37H7.04a2 2 0 0 1-1.9-1.37L2.1 10.37a2 2 0 0 1 .73-2.25z",
				key: "2hea0t"
			}]]);
			createLucideIcon("percent", [
				["line", {
					x1: "19",
					x2: "5",
					y1: "5",
					y2: "19",
					key: "1x9vlm"
				}],
				["circle", {
					cx: "6.5",
					cy: "6.5",
					r: "2.5",
					key: "4mh3h7"
				}],
				["circle", {
					cx: "17.5",
					cy: "17.5",
					r: "2.5",
					key: "1mdrzq"
				}]
			]);
			createLucideIcon("person-standing", [
				["circle", {
					cx: "12",
					cy: "5",
					r: "1",
					key: "gxeob9"
				}],
				["path", {
					d: "m9 20 3-6 3 6",
					key: "se2kox"
				}],
				["path", {
					d: "m6 8 6 2 6-2",
					key: "4o3us4"
				}],
				["path", {
					d: "M12 10v4",
					key: "1kjpxc"
				}]
			]);
			createLucideIcon("phi", [["path", {
				d: "M12 2v20",
				key: "t6zp3m"
			}], ["circle", {
				cx: "12",
				cy: "12",
				r: "7",
				key: "fim9np"
			}]]);
			createLucideIcon("philippine-peso", [
				["path", {
					d: "M20 11H4",
					key: "6ut86h"
				}],
				["path", {
					d: "M20 7H4",
					key: "zbl0bi"
				}],
				["path", {
					d: "M7 21V4a1 1 0 0 1 1-1h4a1 1 0 0 1 0 12H7",
					key: "1ana5r"
				}]
			]);
			createLucideIcon("phone-call", [
				["path", {
					d: "M13 2a9 9 0 0 1 9 9",
					key: "1itnx2"
				}],
				["path", {
					d: "M13 6a5 5 0 0 1 5 5",
					key: "11nki7"
				}],
				["path", {
					d: "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",
					key: "9njp5v"
				}]
			]);
			createLucideIcon("phone-forwarded", [
				["path", {
					d: "M14 6h8",
					key: "yd68k4"
				}],
				["path", {
					d: "m18 2 4 4-4 4",
					key: "pucp1d"
				}],
				["path", {
					d: "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",
					key: "9njp5v"
				}]
			]);
			createLucideIcon("phone-incoming", [
				["path", {
					d: "M16 2v6h6",
					key: "1mfrl5"
				}],
				["path", {
					d: "m22 2-6 6",
					key: "6f0sa0"
				}],
				["path", {
					d: "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",
					key: "9njp5v"
				}]
			]);
			createLucideIcon("phone-missed", [
				["path", {
					d: "m16 2 6 6",
					key: "1gw87d"
				}],
				["path", {
					d: "m22 2-6 6",
					key: "6f0sa0"
				}],
				["path", {
					d: "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",
					key: "9njp5v"
				}]
			]);
			createLucideIcon("phone-off", [
				["path", {
					d: "M10.1 13.9a14 14 0 0 0 3.732 2.668 1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2 18 18 0 0 1-12.728-5.272",
					key: "1wngk7"
				}],
				["path", {
					d: "M22 2 2 22",
					key: "y4kqgn"
				}],
				["path", {
					d: "M4.76 13.582A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 .244.473",
					key: "10hv5p"
				}]
			]);
			createLucideIcon("phone-outgoing", [
				["path", {
					d: "m16 8 6-6",
					key: "oawc05"
				}],
				["path", {
					d: "M22 8V2h-6",
					key: "oqy2zc"
				}],
				["path", {
					d: "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",
					key: "9njp5v"
				}]
			]);
			createLucideIcon("phone", [["path", {
				d: "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",
				key: "9njp5v"
			}]]);
			createLucideIcon("pi", [
				["line", {
					x1: "9",
					x2: "9",
					y1: "4",
					y2: "20",
					key: "ovs5a5"
				}],
				["path", {
					d: "M4 7c0-1.7 1.3-3 3-3h13",
					key: "10pag4"
				}],
				["path", {
					d: "M18 20c-1.7 0-3-1.3-3-3V4",
					key: "1gaosr"
				}]
			]);
			createLucideIcon("piano", [
				["path", {
					d: "M10 13v4",
					key: "5krxfa"
				}],
				["path", {
					d: "M14 13v4",
					key: "72xrsi"
				}],
				["path", {
					d: "M18 13v4",
					key: "1i7sbu"
				}],
				["path", {
					d: "M2 13h20",
					key: "5evz65"
				}],
				["path", {
					d: "M22 11.5A3.5 3.5 0 0018.5 8a3.52 3.52 0 01-3.173-2A7 7 0 002 9v10a2 2 0 002 2h16a2 2 0 002-2z",
					key: "1txdgy"
				}],
				["path", {
					d: "M6 13v4",
					key: "9v0cap"
				}]
			]);
			createLucideIcon("pickaxe", [
				["path", {
					d: "m14 13-8.381 8.38a1 1 0 0 1-3.001-3L11 9.999",
					key: "1lw9ds"
				}],
				["path", {
					d: "M15.973 4.027A13 13 0 0 0 5.902 2.373c-1.398.342-1.092 2.158.277 2.601a19.9 19.9 0 0 1 5.822 3.024",
					key: "ffj4ej"
				}],
				["path", {
					d: "M16.001 11.999a19.9 19.9 0 0 1 3.024 5.824c.444 1.369 2.26 1.676 2.603.278A13 13 0 0 0 20 8.069",
					key: "8tj4zw"
				}],
				["path", {
					d: "M18.352 3.352a1.205 1.205 0 0 0-1.704 0l-5.296 5.296a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l5.296-5.296a1.205 1.205 0 0 0 0-1.704z",
					key: "hh6h97"
				}]
			]);
			createLucideIcon("picture-in-picture-2", [["path", {
				d: "M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h4",
				key: "daa4of"
			}], ["rect", {
				width: "10",
				height: "7",
				x: "12",
				y: "13",
				rx: "2",
				key: "1nb8gs"
			}]]);
			createLucideIcon("picture-in-picture", [
				["path", {
					d: "M2 10h6V4",
					key: "zwrco"
				}],
				["path", {
					d: "m2 4 6 6",
					key: "ug085t"
				}],
				["path", {
					d: "M21 10V7a2 2 0 0 0-2-2h-7",
					key: "git5jr"
				}],
				["path", {
					d: "M3 14v2a2 2 0 0 0 2 2h3",
					key: "1f7fh3"
				}],
				["rect", {
					x: "12",
					y: "14",
					width: "10",
					height: "7",
					rx: "1",
					key: "1wjs3o"
				}]
			]);
			createLucideIcon("piggy-bank", [
				["path", {
					d: "M11 17h3v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a3.16 3.16 0 0 0 2-2h1a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-1a5 5 0 0 0-2-4V3a4 4 0 0 0-3.2 1.6l-.3.4H11a6 6 0 0 0-6 6v1a5 5 0 0 0 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1z",
					key: "1piglc"
				}],
				["path", {
					d: "M16 10h.01",
					key: "1m94wz"
				}],
				["path", {
					d: "M2 8v1a2 2 0 0 0 2 2h1",
					key: "1env43"
				}]
			]);
			createLucideIcon("pilcrow-left", [
				["path", {
					d: "M14 3v11",
					key: "mlfb7b"
				}],
				["path", {
					d: "M14 9h-3a3 3 0 0 1 0-6h9",
					key: "1ulc19"
				}],
				["path", {
					d: "M18 3v11",
					key: "1phi0r"
				}],
				["path", {
					d: "M22 18H2l4-4",
					key: "yt65j9"
				}],
				["path", {
					d: "m6 22-4-4",
					key: "6jgyf5"
				}]
			]);
			createLucideIcon("pilcrow-right", [
				["path", {
					d: "M10 3v11",
					key: "o3l5kj"
				}],
				["path", {
					d: "M10 9H7a1 1 0 0 1 0-6h8",
					key: "1wb1nc"
				}],
				["path", {
					d: "M14 3v11",
					key: "mlfb7b"
				}],
				["path", {
					d: "m18 14 4 4H2",
					key: "4r8io1"
				}],
				["path", {
					d: "m22 18-4 4",
					key: "1hjjrd"
				}]
			]);
			createLucideIcon("pilcrow", [
				["path", {
					d: "M13 4v16",
					key: "8vvj80"
				}],
				["path", {
					d: "M17 4v16",
					key: "7dpous"
				}],
				["path", {
					d: "M19 4H9.5a4.5 4.5 0 0 0 0 9H13",
					key: "sh4n9v"
				}]
			]);
			createLucideIcon("pill-bottle", [
				["path", {
					d: "M18 11h-4a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h4",
					key: "17ldeb"
				}],
				["path", {
					d: "M6 7v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7",
					key: "nc37y6"
				}],
				["rect", {
					width: "16",
					height: "5",
					x: "4",
					y: "2",
					rx: "1",
					key: "3jeezo"
				}]
			]);
			createLucideIcon("pill", [["path", {
				d: "m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z",
				key: "wa1lgi"
			}], ["path", {
				d: "m8.5 8.5 7 7",
				key: "rvfmvr"
			}]]);
			createLucideIcon("pin-off", [
				["path", {
					d: "M12 17v5",
					key: "bb1du9"
				}],
				["path", {
					d: "M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89",
					key: "znwnzq"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11",
					key: "c9qhm2"
				}]
			]);
			createLucideIcon("pin", [["path", {
				d: "M12 17v5",
				key: "bb1du9"
			}], ["path", {
				d: "M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z",
				key: "1nkz8b"
			}]]);
			createLucideIcon("pipette", [
				["path", {
					d: "m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12",
					key: "1y3wsu"
				}],
				["path", {
					d: "m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z",
					key: "110lr1"
				}],
				["path", {
					d: "m2 22 .414-.414",
					key: "jhxm08"
				}]
			]);
			createLucideIcon("pizza", [
				["path", {
					d: "m12 14-1 1",
					key: "11onhr"
				}],
				["path", {
					d: "m13.75 18.25-1.25 1.42",
					key: "1yisr3"
				}],
				["path", {
					d: "M17.775 5.654a15.68 15.68 0 0 0-12.121 12.12",
					key: "1qtqk6"
				}],
				["path", {
					d: "M18.8 9.3a1 1 0 0 0 2.1 7.7",
					key: "fbbbr2"
				}],
				["path", {
					d: "M21.964 20.732a1 1 0 0 1-1.232 1.232l-18-5a1 1 0 0 1-.695-1.232A19.68 19.68 0 0 1 15.732 2.037a1 1 0 0 1 1.232.695z",
					key: "1hyfdd"
				}]
			]);
			createLucideIcon("plane-landing", [["path", {
				d: "M2 22h20",
				key: "272qi7"
			}], ["path", {
				d: "M3.77 10.77 2 9l2-4.5 1.1.55c.55.28.9.84.9 1.45s.35 1.17.9 1.45L8 8.5l3-6 1.05.53a2 2 0 0 1 1.09 1.52l.72 5.4a2 2 0 0 0 1.09 1.52l4.4 2.2c.42.22.78.55 1.01.96l.6 1.03c.49.88-.06 1.98-1.06 2.1l-1.18.15c-.47.06-.95-.02-1.37-.24L4.29 11.15a2 2 0 0 1-.52-.38Z",
				key: "1ma21e"
			}]]);
			createLucideIcon("plane-takeoff", [["path", {
				d: "M2 22h20",
				key: "272qi7"
			}], ["path", {
				d: "M6.36 17.4 4 17l-2-4 1.1-.55a2 2 0 0 1 1.8 0l.17.1a2 2 0 0 0 1.8 0L8 12 5 6l.9-.45a2 2 0 0 1 2.09.2l4.02 3a2 2 0 0 0 2.1.2l4.19-2.06a2.41 2.41 0 0 1 1.73-.17L21 7a1.4 1.4 0 0 1 .87 1.99l-.38.76c-.23.46-.6.84-1.07 1.08L7.58 17.2a2 2 0 0 1-1.22.18Z",
				key: "fkigj9"
			}]]);
			createLucideIcon("plane", [["path", {
				d: "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z",
				key: "1v9wt8"
			}]]);
			createLucideIcon("play-off", [
				["path", {
					d: "m10.215 4.56 9.79 5.71a2 2 0 0 1 .003 3.458l-.393.23",
					key: "fdtkwz"
				}],
				["path", {
					d: "m16.042 16.042-8.034 4.686A2 2 0 0 1 5 19V5",
					key: "1c8hxg"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}]
			]);
			createLucideIcon("play", [["path", {
				d: "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z",
				key: "10ikf1"
			}]]);
			createLucideIcon("playing-card", [["path", {
				d: "M12.832 8.445a1 1 0 00-1.589-.098l-2.075 3.098a1 1 0 000 1.11l2 3a1 1 0 001.664 0l2-3a1 1 0 000-1.11z",
				key: "r2cm5y"
			}], ["rect", {
				x: "5",
				y: "2",
				width: "14",
				height: "20",
				rx: "2",
				key: "1k0ky4"
			}]]);
			createLucideIcon("playing-cards-fan", [
				["path", {
					d: "M12.65 7.65a2 2 0 012.629-1.046l5.51 2.374a2 2 0 011.046 2.628l-3.957 9.184a2 2 0 01-2.628 1.046l-5.51-2.374a2 2 0 01-1.046-2.628z",
					key: "15jvxw"
				}],
				["path", {
					d: "M18 7.777V4a2 2 0 00-2-2h-6a2 2 0 00-2 2v10a2 2 0 001.137 1.805",
					key: "y6hc3m"
				}],
				["path", {
					d: "m8 4.389-4.364.809a2 2 0 00-1.602 2.33l1.822 9.833a2 2 0 002.331 1.602l2.542-.47",
					key: "t01ww5"
				}]
			]);
			createLucideIcon("playing-cards", [
				["path", {
					d: "M14.832 8.445a1 1 0 00-1.589-.098l-2.075 3.098a1 1 0 000 1.11l2 3a1 1 0 001.664 0l2-3a1 1 0 000-1.11z",
					key: "ubuxio"
				}],
				["path", {
					d: "m7.18 20.827-5-11a2 2 0 01.993-2.647L7 5.44",
					key: "1dure5"
				}],
				["rect", {
					x: "7",
					y: "2",
					width: "14",
					height: "20",
					rx: "2",
					key: "p3xopd"
				}]
			]);
			createLucideIcon("plug-2", [
				["path", {
					d: "M9 2v6",
					key: "17ngun"
				}],
				["path", {
					d: "M15 2v6",
					key: "s7yy2p"
				}],
				["path", {
					d: "M12 17v5",
					key: "bb1du9"
				}],
				["path", {
					d: "M5 8h14",
					key: "pcz4l3"
				}],
				["path", {
					d: "M6 11V8h12v3a6 6 0 1 1-12 0Z",
					key: "wtfw2c"
				}]
			]);
			createLucideIcon("plug-zap", [
				["path", {
					d: "M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z",
					key: "goz73y"
				}],
				["path", {
					d: "m2 22 3-3",
					key: "19mgm9"
				}],
				["path", {
					d: "M7.5 13.5 10 11",
					key: "7xgeeb"
				}],
				["path", {
					d: "M10.5 16.5 13 14",
					key: "10btkg"
				}],
				["path", {
					d: "m18 3-4 4h6l-4 4",
					key: "16psg9"
				}]
			]);
			createLucideIcon("plug", [
				["path", {
					d: "M12 22v-5",
					key: "1ega77"
				}],
				["path", {
					d: "M15 8V2",
					key: "18g5xt"
				}],
				["path", {
					d: "M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z",
					key: "1xoxul"
				}],
				["path", {
					d: "M9 8V2",
					key: "14iosj"
				}]
			]);
			createLucideIcon("plus", [["path", {
				d: "M5 12h14",
				key: "1ays0h"
			}], ["path", {
				d: "M12 5v14",
				key: "s699le"
			}]]);
			createLucideIcon("pocket-knife", [
				["path", {
					d: "M3 2v1c0 1 2 1 2 2S3 6 3 7s2 1 2 2-2 1-2 2 2 1 2 2",
					key: "19w3oe"
				}],
				["path", {
					d: "M18 6h.01",
					key: "1v4wsw"
				}],
				["path", {
					d: "M6 18h.01",
					key: "uhywen"
				}],
				["path", {
					d: "M20.83 8.83a4 4 0 0 0-5.66-5.66l-12 12a4 4 0 1 0 5.66 5.66Z",
					key: "6fykxj"
				}],
				["path", {
					d: "M18 11.66V22a4 4 0 0 0 4-4V6",
					key: "1utzek"
				}]
			]);
			createLucideIcon("podium", [
				["path", {
					d: "M12 6V2h-1",
					key: "1hv4eo"
				}],
				["path", {
					d: "M9 15a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1",
					key: "1jvw5n"
				}],
				["path", {
					d: "M9 21V11a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v10",
					key: "rgi5dp"
				}]
			]);
			createLucideIcon("pointer-off", [
				["path", {
					d: "M10 4.5V4a2 2 0 0 0-2.41-1.957",
					key: "jsi14n"
				}],
				["path", {
					d: "M13.9 8.4a2 2 0 0 0-1.26-1.295",
					key: "hirc7f"
				}],
				["path", {
					d: "M21.7 16.2A8 8 0 0 0 22 14v-3a2 2 0 1 0-4 0v-1a2 2 0 0 0-3.63-1.158",
					key: "1jxb2e"
				}],
				["path", {
					d: "m7 15-1.8-1.8a2 2 0 0 0-2.79 2.86L6 19.7a7.74 7.74 0 0 0 6 2.3h2a8 8 0 0 0 5.657-2.343",
					key: "10r7hm"
				}],
				["path", {
					d: "M6 6v8",
					key: "tv5xkp"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}]
			]);
			createLucideIcon("pointer", [
				["path", {
					d: "M22 14a8 8 0 0 1-8 8",
					key: "56vcr3"
				}],
				["path", {
					d: "M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2",
					key: "1agjmk"
				}],
				["path", {
					d: "M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1",
					key: "wdbh2u"
				}],
				["path", {
					d: "M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10",
					key: "1ibuk9"
				}],
				["path", {
					d: "M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15",
					key: "g6ys72"
				}]
			]);
			createLucideIcon("popcorn", [
				["path", {
					d: "M18 8a2 2 0 0 0 0-4 2 2 0 0 0-4 0 2 2 0 0 0-4 0 2 2 0 0 0-4 0 2 2 0 0 0 0 4",
					key: "10td1f"
				}],
				["path", {
					d: "M10 22 9 8",
					key: "yjptiv"
				}],
				["path", {
					d: "m14 22 1-14",
					key: "8jwc8b"
				}],
				["path", {
					d: "M20 8c.5 0 .9.4.8 1l-2.6 12c-.1.5-.7 1-1.2 1H7c-.6 0-1.1-.4-1.2-1L3.2 9c-.1-.6.3-1 .8-1Z",
					key: "1qo33t"
				}]
			]);
			createLucideIcon("popsicle", [["path", {
				d: "M18.6 14.4c.8-.8.8-2 0-2.8l-8.1-8.1a4.95 4.95 0 1 0-7.1 7.1l8.1 8.1c.9.7 2.1.7 2.9-.1Z",
				key: "1o68ps"
			}], ["path", {
				d: "m22 22-5.5-5.5",
				key: "17o70y"
			}]]);
			createLucideIcon("pound-sterling", [
				["path", {
					d: "M18 7c0-5.333-8-5.333-8 0",
					key: "1prm2n"
				}],
				["path", {
					d: "M10 7v14",
					key: "18tmcs"
				}],
				["path", {
					d: "M6 21h12",
					key: "4dkmi1"
				}],
				["path", {
					d: "M6 13h10",
					key: "ybwr4a"
				}]
			]);
			createLucideIcon("power-off", [
				["path", {
					d: "M18.36 6.64A9 9 0 0 1 20.77 15",
					key: "dxknvb"
				}],
				["path", {
					d: "M6.16 6.16a9 9 0 1 0 12.68 12.68",
					key: "1x7qb5"
				}],
				["path", {
					d: "M12 2v4",
					key: "3427ic"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}]
			]);
			createLucideIcon("power", [["path", {
				d: "M12 2v10",
				key: "mnfbl"
			}], ["path", {
				d: "M18.4 6.6a9 9 0 1 1-12.77.04",
				key: "obofu9"
			}]]);
			createLucideIcon("presentation", [
				["path", {
					d: "M2 3h20",
					key: "91anmk"
				}],
				["path", {
					d: "M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3",
					key: "2k9sn8"
				}],
				["path", {
					d: "m7 21 5-5 5 5",
					key: "bip4we"
				}]
			]);
			createLucideIcon("printer-check", [
				["path", {
					d: "M13.5 22H7a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v.5",
					key: "qeb09x"
				}],
				["path", {
					d: "m16 19 2 2 4-4",
					key: "1b14m6"
				}],
				["path", {
					d: "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2",
					key: "1md90i"
				}],
				["path", {
					d: "M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6",
					key: "1itne7"
				}]
			]);
			createLucideIcon("printer-x", [
				["path", {
					d: "M12.531 22H7a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h6.377",
					key: "1w39xo"
				}],
				["path", {
					d: "m16.5 16.5 5 5",
					key: "zc9lw7"
				}],
				["path", {
					d: "m16.5 21.5 5-5",
					key: "1fr29m"
				}],
				["path", {
					d: "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1.5",
					key: "18he39"
				}],
				["path", {
					d: "M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6",
					key: "1itne7"
				}]
			]);
			createLucideIcon("printer", [
				["path", {
					d: "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2",
					key: "143wyd"
				}],
				["path", {
					d: "M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6",
					key: "1itne7"
				}],
				["rect", {
					x: "6",
					y: "14",
					width: "12",
					height: "8",
					rx: "1",
					key: "1ue0tg"
				}]
			]);
			createLucideIcon("projector", [
				["path", {
					d: "M5 7 3 5",
					key: "1yys58"
				}],
				["path", {
					d: "M9 6V3",
					key: "1ptz9u"
				}],
				["path", {
					d: "m13 7 2-2",
					key: "1w3vmq"
				}],
				["circle", {
					cx: "9",
					cy: "13",
					r: "3",
					key: "1mma13"
				}],
				["path", {
					d: "M11.83 12H20a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h2.17",
					key: "2frwzc"
				}],
				["path", {
					d: "M16 16h2",
					key: "dnq2od"
				}]
			]);
			createLucideIcon("proportions", [
				["rect", {
					width: "20",
					height: "16",
					x: "2",
					y: "4",
					rx: "2",
					key: "18n3k1"
				}],
				["path", {
					d: "M12 9v11",
					key: "1fnkrn"
				}],
				["path", {
					d: "M2 9h13a2 2 0 0 1 2 2v9",
					key: "11z3ex"
				}]
			]);
			createLucideIcon("puzzle", [["path", {
				d: "M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z",
				key: "w46dr5"
			}]]);
			createLucideIcon("pyramid", [["path", {
				d: "M2.5 16.88a1 1 0 0 1-.32-1.43l9-13.02a1 1 0 0 1 1.64 0l9 13.01a1 1 0 0 1-.32 1.44l-8.51 4.86a2 2 0 0 1-1.98 0Z",
				key: "aenxs0"
			}], ["path", {
				d: "M12 2v20",
				key: "t6zp3m"
			}]]);
			createLucideIcon("qr-code", [
				["rect", {
					width: "5",
					height: "5",
					x: "3",
					y: "3",
					rx: "1",
					key: "1tu5fj"
				}],
				["rect", {
					width: "5",
					height: "5",
					x: "16",
					y: "3",
					rx: "1",
					key: "1v8r4q"
				}],
				["rect", {
					width: "5",
					height: "5",
					x: "3",
					y: "16",
					rx: "1",
					key: "1x03jg"
				}],
				["path", {
					d: "M21 16h-3a2 2 0 0 0-2 2v3",
					key: "177gqh"
				}],
				["path", {
					d: "M21 21v.01",
					key: "ents32"
				}],
				["path", {
					d: "M12 7v3a2 2 0 0 1-2 2H7",
					key: "8crl2c"
				}],
				["path", {
					d: "M3 12h.01",
					key: "nlz23k"
				}],
				["path", {
					d: "M12 3h.01",
					key: "n36tog"
				}],
				["path", {
					d: "M12 16v.01",
					key: "133mhm"
				}],
				["path", {
					d: "M16 12h1",
					key: "1slzba"
				}],
				["path", {
					d: "M21 12v.01",
					key: "1lwtk9"
				}],
				["path", {
					d: "M12 21v-1",
					key: "1880an"
				}]
			]);
			createLucideIcon("quote", [["path", {
				d: "M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
				key: "rib7q0"
			}], ["path", {
				d: "M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
				key: "1ymkrd"
			}]]);
			createLucideIcon("rabbit", [
				["path", {
					d: "M13 16a3 3 0 0 1 2.24 5",
					key: "1epib5"
				}],
				["path", {
					d: "M18 12h.01",
					key: "yjnet6"
				}],
				["path", {
					d: "M18 21h-8a4 4 0 0 1-4-4 7 7 0 0 1 7-7h.2L9.6 6.4a1 1 0 1 1 2.8-2.8L15.8 7h.2c3.3 0 6 2.7 6 6v1a2 2 0 0 1-2 2h-1a3 3 0 0 0-3 3",
					key: "ue9ozu"
				}],
				["path", {
					d: "M20 8.54V4a2 2 0 1 0-4 0v3",
					key: "49iql8"
				}],
				["path", {
					d: "M7.612 12.524a3 3 0 1 0-1.6 4.3",
					key: "1e33i0"
				}]
			]);
			createLucideIcon("radar", [
				["path", {
					d: "M19.07 4.93A10 10 0 0 0 6.99 3.34",
					key: "z3du51"
				}],
				["path", {
					d: "M4 6h.01",
					key: "oypzma"
				}],
				["path", {
					d: "M2.29 9.62A10 10 0 1 0 21.31 8.35",
					key: "qzzz0"
				}],
				["path", {
					d: "M16.24 7.76A6 6 0 1 0 8.23 16.67",
					key: "1yjesh"
				}],
				["path", {
					d: "M12 18h.01",
					key: "mhygvu"
				}],
				["path", {
					d: "M17.99 11.66A6 6 0 0 1 15.77 16.67",
					key: "1u2y91"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "2",
					key: "1c9p78"
				}],
				["path", {
					d: "m13.41 10.59 5.66-5.66",
					key: "mhq4k0"
				}]
			]);
			createLucideIcon("radiation", [
				["path", {
					d: "M12 12h.01",
					key: "1mp3jc"
				}],
				["path", {
					d: "M14 15.4641a4 4 0 0 1-4 0L7.52786 19.74597 A 1 1 0 0 0 7.99303 21.16211 10 10 0 0 0 16.00697 21.16211 1 1 0 0 0 16.47214 19.74597z",
					key: "1y4lzb"
				}],
				["path", {
					d: "M16 12a4 4 0 0 0-2-3.464l2.472-4.282a1 1 0 0 1 1.46-.305 10 10 0 0 1 4.006 6.94A1 1 0 0 1 21 12z",
					key: "163ggk"
				}],
				["path", {
					d: "M8 12a4 4 0 0 1 2-3.464L7.528 4.254a1 1 0 0 0-1.46-.305 10 10 0 0 0-4.006 6.94A1 1 0 0 0 3 12z",
					key: "1l9i0b"
				}]
			]);
			createLucideIcon("radical", [["path", {
				d: "M3 12h3.28a1 1 0 0 1 .948.684l2.298 7.934a.5.5 0 0 0 .96-.044L13.82 4.771A1 1 0 0 1 14.792 4H21",
				key: "1mqj8i"
			}]]);
			createLucideIcon("radio-off", [
				["path", {
					d: "M13.414 13.414a2 2 0 1 1-2.828-2.828",
					key: "srl686"
				}],
				["path", {
					d: "M16.247 7.761a6 6 0 0 1 1.744 4.572",
					key: "1h86sp"
				}],
				["path", {
					d: "M19.075 4.933a10 10 0 0 1 2.234 10.72",
					key: "1n13k4"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M4.925 19.067a10 10 0 0 1 0-14.134",
					key: "1q22gi"
				}],
				["path", {
					d: "M7.753 16.239a6 6 0 0 1 0-8.478",
					key: "r2q7qm"
				}]
			]);
			createLucideIcon("radio-receiver", [
				["path", {
					d: "M5 16v2",
					key: "g5qcv5"
				}],
				["path", {
					d: "M19 16v2",
					key: "1gbaio"
				}],
				["rect", {
					width: "20",
					height: "8",
					x: "2",
					y: "8",
					rx: "2",
					key: "vjsjur"
				}],
				["path", {
					d: "M18 12h.01",
					key: "yjnet6"
				}]
			]);
			createLucideIcon("radio-tower", [
				["path", {
					d: "M4.9 16.1C1 12.2 1 5.8 4.9 1.9",
					key: "s0qx1y"
				}],
				["path", {
					d: "M7.8 4.7a6.14 6.14 0 0 0-.8 7.5",
					key: "1idnkw"
				}],
				["circle", {
					cx: "12",
					cy: "9",
					r: "2",
					key: "1092wv"
				}],
				["path", {
					d: "M16.2 4.8c2 2 2.26 5.11.8 7.47",
					key: "ojru2q"
				}],
				["path", {
					d: "M19.1 1.9a9.96 9.96 0 0 1 0 14.1",
					key: "rhi7fg"
				}],
				["path", {
					d: "M9.5 18h5",
					key: "mfy3pd"
				}],
				["path", {
					d: "m8 22 4-11 4 11",
					key: "25yftu"
				}]
			]);
			createLucideIcon("radio", [
				["path", {
					d: "M16.247 7.761a6 6 0 0 1 0 8.478",
					key: "1fwjs5"
				}],
				["path", {
					d: "M19.075 4.933a10 10 0 0 1 0 14.134",
					key: "ehdyv1"
				}],
				["path", {
					d: "M4.925 19.067a10 10 0 0 1 0-14.134",
					key: "1q22gi"
				}],
				["path", {
					d: "M7.753 16.239a6 6 0 0 1 0-8.478",
					key: "r2q7qm"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "2",
					key: "1c9p78"
				}]
			]);
			createLucideIcon("radius", [
				["path", {
					d: "M20.34 17.52a10 10 0 1 0-2.82 2.82",
					key: "fydyku"
				}],
				["circle", {
					cx: "19",
					cy: "19",
					r: "2",
					key: "17f5cg"
				}],
				["path", {
					d: "m13.41 13.41 4.18 4.18",
					key: "1gqbwc"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "2",
					key: "1c9p78"
				}]
			]);
			createLucideIcon("rainbow", [
				["path", {
					d: "M22 17a10 10 0 0 0-20 0",
					key: "ozegv"
				}],
				["path", {
					d: "M6 17a6 6 0 0 1 12 0",
					key: "5giftw"
				}],
				["path", {
					d: "M10 17a2 2 0 0 1 4 0",
					key: "gnsikk"
				}]
			]);
			createLucideIcon("rat", [
				["path", {
					d: "M13 22H4a2 2 0 0 1 0-4h12",
					key: "bt3f23"
				}],
				["path", {
					d: "M13.236 18a3 3 0 0 0-2.2-5",
					key: "1tbvmo"
				}],
				["path", {
					d: "M16 9h.01",
					key: "1bdo4e"
				}],
				["path", {
					d: "M16.82 3.94a3 3 0 1 1 3.237 4.868l1.815 2.587a1.5 1.5 0 0 1-1.5 2.1l-2.872-.453a3 3 0 0 0-3.5 3",
					key: "9ch7kn"
				}],
				["path", {
					d: "M17 4.988a3 3 0 1 0-5.2 2.052A7 7 0 0 0 4 14.015 4 4 0 0 0 8 18",
					key: "3s7e9i"
				}]
			]);
			createLucideIcon("ratio", [["rect", {
				width: "12",
				height: "20",
				x: "6",
				y: "2",
				rx: "2",
				key: "1oxtiu"
			}], ["rect", {
				width: "20",
				height: "12",
				x: "2",
				y: "6",
				rx: "2",
				key: "9lu3g6"
			}]]);
			createLucideIcon("receipt-cent", [
				["path", {
					d: "M12 7v10",
					key: "jspqdw"
				}],
				["path", {
					d: "M14.828 14.829a4 4 0 0 1-5.656 0 4 4 0 0 1 0-5.657 4 4 0 0 1 5.656 0",
					key: "qvqont"
				}],
				["path", {
					d: "M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z",
					key: "ycz6yz"
				}]
			]);
			createLucideIcon("receipt-euro", [
				["path", {
					d: "M15.828 14.829a4 4 0 0 1-5.656 0 4 4 0 0 1 0-5.657 4 4 0 0 1 5.656 0",
					key: "16zdw4"
				}],
				["path", {
					d: "M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z",
					key: "ycz6yz"
				}],
				["path", {
					d: "M8 12h5",
					key: "1g6qi8"
				}]
			]);
			createLucideIcon("receipt-indian-rupee", [
				["path", {
					d: "M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z",
					key: "ycz6yz"
				}],
				["path", {
					d: "M8 11h8",
					key: "vwpz6n"
				}],
				["path", {
					d: "M8 7h8",
					key: "i86dvs"
				}],
				["path", {
					d: "M9 7a4 4 0 0 1 0 8H8l3 2",
					key: "1xaco0"
				}]
			]);
			createLucideIcon("receipt-japanese-yen", [
				["path", {
					d: "m12 10 3-3",
					key: "1mc12w"
				}],
				["path", {
					d: "M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z",
					key: "ycz6yz"
				}],
				["path", {
					d: "M9 11h6",
					key: "1fldmi"
				}],
				["path", {
					d: "M9 15h6",
					key: "cctwl0"
				}],
				["path", {
					d: "m9 7 3 3v7",
					key: "1x0cue"
				}]
			]);
			createLucideIcon("receipt-swiss-franc", [
				["path", {
					d: "M10 11h4",
					key: "1i0mka"
				}],
				["path", {
					d: "M10 17V7h5",
					key: "k7jq18"
				}],
				["path", {
					d: "M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z",
					key: "ycz6yz"
				}],
				["path", {
					d: "M8 15h5",
					key: "vxg57a"
				}]
			]);
			createLucideIcon("receipt-pound-sterling", [
				["path", {
					d: "M10 17V9.5a1 1 0 0 1 5 0",
					key: "td22vl"
				}],
				["path", {
					d: "M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z",
					key: "ycz6yz"
				}],
				["path", {
					d: "M8 13h5",
					key: "1k9z8w"
				}],
				["path", {
					d: "M8 17h7",
					key: "8mjdqu"
				}]
			]);
			createLucideIcon("receipt-russian-ruble", [
				["path", {
					d: "M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z",
					key: "ycz6yz"
				}],
				["path", {
					d: "M8 11h5a2 2 0 0 0 0-4h-3v10",
					key: "agnv0r"
				}],
				["path", {
					d: "M8 15h5",
					key: "vxg57a"
				}]
			]);
			createLucideIcon("receipt-text", [
				["path", {
					d: "M13 16H8",
					key: "wsln4y"
				}],
				["path", {
					d: "M14 8H8",
					key: "1l3xfs"
				}],
				["path", {
					d: "M16 12H8",
					key: "1fr5h0"
				}],
				["path", {
					d: "M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z",
					key: "ycz6yz"
				}]
			]);
			createLucideIcon("receipt-turkish-lira", [
				["path", {
					d: "M10 7v10a5 5 0 0 0 5-5",
					key: "1blmz7"
				}],
				["path", {
					d: "m14 8-6 3",
					key: "2tb98i"
				}],
				["path", {
					d: "M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z",
					key: "ycz6yz"
				}]
			]);
			createLucideIcon("receipt", [
				["path", {
					d: "M12 17V7",
					key: "pyj7ub"
				}],
				["path", {
					d: "M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8",
					key: "1elt7d"
				}],
				["path", {
					d: "M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z",
					key: "ycz6yz"
				}]
			]);
			createLucideIcon("rectangle-circle", [["path", {
				d: "M14 4v16H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z",
				key: "1m5n7q"
			}], ["circle", {
				cx: "14",
				cy: "12",
				r: "8",
				key: "1pag6k"
			}]]);
			createLucideIcon("rectangle-ellipsis", [
				["rect", {
					width: "20",
					height: "12",
					x: "2",
					y: "6",
					rx: "2",
					key: "9lu3g6"
				}],
				["path", {
					d: "M12 12h.01",
					key: "1mp3jc"
				}],
				["path", {
					d: "M17 12h.01",
					key: "1m0b6t"
				}],
				["path", {
					d: "M7 12h.01",
					key: "eqddd0"
				}]
			]);
			createLucideIcon("rectangle-goggles", [["path", {
				d: "M20 6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4a2 2 0 0 1-1.6-.8l-1.6-2.13a1 1 0 0 0-1.6 0L9.6 17.2A2 2 0 0 1 8 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z",
				key: "d5y1f"
			}]]);
			createLucideIcon("rectangle-horizontal", [["rect", {
				width: "20",
				height: "12",
				x: "2",
				y: "6",
				rx: "2",
				key: "9lu3g6"
			}]]);
			createLucideIcon("rectangle-vertical", [["rect", {
				width: "12",
				height: "20",
				x: "6",
				y: "2",
				rx: "2",
				key: "1oxtiu"
			}]]);
			createLucideIcon("redo-2", [["path", {
				d: "m15 14 5-5-5-5",
				key: "12vg1m"
			}], ["path", {
				d: "M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13",
				key: "6uklza"
			}]]);
			createLucideIcon("redo-dot", [
				["circle", {
					cx: "12",
					cy: "17",
					r: "1",
					key: "1ixnty"
				}],
				["path", {
					d: "M21 7v6h-6",
					key: "3ptur4"
				}],
				["path", {
					d: "M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7",
					key: "1kgawr"
				}]
			]);
			createLucideIcon("recycle", [
				["path", {
					d: "M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5",
					key: "x6z5xu"
				}],
				["path", {
					d: "M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12",
					key: "1x4zh5"
				}],
				["path", {
					d: "m14 16-3 3 3 3",
					key: "f6jyew"
				}],
				["path", {
					d: "M8.293 13.596 7.196 9.5 3.1 10.598",
					key: "wf1obh"
				}],
				["path", {
					d: "m9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843",
					key: "9tzpgr"
				}],
				["path", {
					d: "m13.378 9.633 4.096 1.098 1.097-4.096",
					key: "1oe83g"
				}]
			]);
			createLucideIcon("redo", [["path", {
				d: "M21 7v6h-6",
				key: "3ptur4"
			}], ["path", {
				d: "M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7",
				key: "1kgawr"
			}]]);
			createLucideIcon("refresh-ccw-dot", [
				["path", {
					d: "M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",
					key: "14sxne"
				}],
				["path", {
					d: "M3 3v5h5",
					key: "1xhq8a"
				}],
				["path", {
					d: "M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16",
					key: "1hlbsb"
				}],
				["path", {
					d: "M16 16h5v5",
					key: "ccwih5"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "1",
					key: "41hilf"
				}]
			]);
			createLucideIcon("refresh-ccw", [
				["path", {
					d: "M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",
					key: "14sxne"
				}],
				["path", {
					d: "M3 3v5h5",
					key: "1xhq8a"
				}],
				["path", {
					d: "M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16",
					key: "1hlbsb"
				}],
				["path", {
					d: "M16 16h5v5",
					key: "ccwih5"
				}]
			]);
			createLucideIcon("refresh-cw-off", [
				["path", {
					d: "M21 8L18.74 5.74A9.75 9.75 0 0 0 12 3C11 3 10.03 3.16 9.13 3.47",
					key: "1krf6h"
				}],
				["path", {
					d: "M8 16H3v5",
					key: "1cv678"
				}],
				["path", {
					d: "M3 12C3 9.51 4 7.26 5.64 5.64",
					key: "ruvoct"
				}],
				["path", {
					d: "m3 16 2.26 2.26A9.75 9.75 0 0 0 12 21c2.49 0 4.74-1 6.36-2.64",
					key: "19q130"
				}],
				["path", {
					d: "M21 12c0 1-.16 1.97-.47 2.87",
					key: "4w8emr"
				}],
				["path", {
					d: "M21 3v5h-5",
					key: "1q7to0"
				}],
				["path", {
					d: "M22 22 2 2",
					key: "1r8tn9"
				}]
			]);
			createLucideIcon("refresh-cw", [
				["path", {
					d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",
					key: "v9h5vc"
				}],
				["path", {
					d: "M21 3v5h-5",
					key: "1q7to0"
				}],
				["path", {
					d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",
					key: "3uifl3"
				}],
				["path", {
					d: "M8 16H3v5",
					key: "1cv678"
				}]
			]);
			createLucideIcon("refrigerator", [
				["path", {
					d: "M5 6a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6Z",
					key: "fpq118"
				}],
				["path", {
					d: "M5 10h14",
					key: "elsbfy"
				}],
				["path", {
					d: "M15 7v6",
					key: "1nx30x"
				}]
			]);
			createLucideIcon("regex", [
				["path", {
					d: "M17 3v10",
					key: "15fgeh"
				}],
				["path", {
					d: "m12.67 5.5 8.66 5",
					key: "1gpheq"
				}],
				["path", {
					d: "m12.67 10.5 8.66-5",
					key: "1dkfa6"
				}],
				["path", {
					d: "M9 17a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2z",
					key: "swwfx4"
				}]
			]);
			createLucideIcon("remove-formatting", [
				["path", {
					d: "M4 7V4h16v3",
					key: "9msm58"
				}],
				["path", {
					d: "M5 20h6",
					key: "1h6pxn"
				}],
				["path", {
					d: "M13 4 8 20",
					key: "kqq6aj"
				}],
				["path", {
					d: "m15 15 5 5",
					key: "me55sn"
				}],
				["path", {
					d: "m20 15-5 5",
					key: "11p7ol"
				}]
			]);
			createLucideIcon("repeat-1", [
				["path", {
					d: "m17 2 4 4-4 4",
					key: "nntrym"
				}],
				["path", {
					d: "M3 11v-1a4 4 0 0 1 4-4h14",
					key: "84bu3i"
				}],
				["path", {
					d: "m7 22-4-4 4-4",
					key: "1wqhfi"
				}],
				["path", {
					d: "M21 13v1a4 4 0 0 1-4 4H3",
					key: "1rx37r"
				}],
				["path", {
					d: "M11 10h1v4",
					key: "70cz1p"
				}]
			]);
			createLucideIcon("repeat-2", [
				["path", {
					d: "m2 9 3-3 3 3",
					key: "1ltn5i"
				}],
				["path", {
					d: "M13 18H7a2 2 0 0 1-2-2V6",
					key: "1r6tfw"
				}],
				["path", {
					d: "m22 15-3 3-3-3",
					key: "4rnwn2"
				}],
				["path", {
					d: "M11 6h6a2 2 0 0 1 2 2v10",
					key: "2f72bc"
				}]
			]);
			createLucideIcon("repeat-off", [
				["path", {
					d: "M11.656 6H21l-4-4",
					key: "w9pozh"
				}],
				["path", {
					d: "M17.898 17.898A4 4 0 0 1 17 18H3l4-4",
					key: "156mfe"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M21 13v1a4 4 0 0 1-.171 1.159",
					key: "2p1713"
				}],
				["path", {
					d: "m21 6-4 4",
					key: "p7opkf"
				}],
				["path", {
					d: "M3 11v-1a4 4 0 0 1 3.102-3.898",
					key: "8cius9"
				}],
				["path", {
					d: "m7 22-4-4",
					key: "1kl3a3"
				}]
			]);
			createLucideIcon("repeat", [
				["path", {
					d: "m17 2 4 4-4 4",
					key: "nntrym"
				}],
				["path", {
					d: "M3 11v-1a4 4 0 0 1 4-4h14",
					key: "84bu3i"
				}],
				["path", {
					d: "m7 22-4-4 4-4",
					key: "1wqhfi"
				}],
				["path", {
					d: "M21 13v1a4 4 0 0 1-4 4H3",
					key: "1rx37r"
				}]
			]);
			createLucideIcon("replace-all", [
				["path", {
					d: "M14 14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1",
					key: "zg1ipl"
				}],
				["path", {
					d: "M14 4a1 1 0 0 1 1-1",
					key: "dhj8ez"
				}],
				["path", {
					d: "M15 10a1 1 0 0 1-1-1",
					key: "1mnyi5"
				}],
				["path", {
					d: "M19 14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1",
					key: "txt6k4"
				}],
				["path", {
					d: "M21 4a1 1 0 0 0-1-1",
					key: "sfs9ap"
				}],
				["path", {
					d: "M21 9a1 1 0 0 1-1 1",
					key: "mp6qeo"
				}],
				["path", {
					d: "m3 7 3 3 3-3",
					key: "x25e72"
				}],
				["path", {
					d: "M6 10V5a2 2 0 0 1 2-2h2",
					key: "15xut4"
				}],
				["rect", {
					x: "3",
					y: "14",
					width: "7",
					height: "7",
					rx: "1",
					key: "1bkyp8"
				}]
			]);
			createLucideIcon("replace", [
				["path", {
					d: "M14 4a1 1 0 0 1 1-1",
					key: "dhj8ez"
				}],
				["path", {
					d: "M15 10a1 1 0 0 1-1-1",
					key: "1mnyi5"
				}],
				["path", {
					d: "M21 4a1 1 0 0 0-1-1",
					key: "sfs9ap"
				}],
				["path", {
					d: "M21 9a1 1 0 0 1-1 1",
					key: "mp6qeo"
				}],
				["path", {
					d: "m3 7 3 3 3-3",
					key: "x25e72"
				}],
				["path", {
					d: "M6 10V5a2 2 0 0 1 2-2h2",
					key: "15xut4"
				}],
				["rect", {
					x: "3",
					y: "14",
					width: "7",
					height: "7",
					rx: "1",
					key: "1bkyp8"
				}]
			]);
			createLucideIcon("reply-all", [
				["path", {
					d: "m12 17-5-5 5-5",
					key: "1s3y5u"
				}],
				["path", {
					d: "M22 18v-2a4 4 0 0 0-4-4H7",
					key: "1fcyog"
				}],
				["path", {
					d: "m7 17-5-5 5-5",
					key: "1ed8i2"
				}]
			]);
			createLucideIcon("reply", [["path", {
				d: "M20 18v-2a4 4 0 0 0-4-4H4",
				key: "5vmcpk"
			}], ["path", {
				d: "m9 17-5-5 5-5",
				key: "nvlc11"
			}]]);
			createLucideIcon("rewind", [["path", {
				d: "M12 6a2 2 0 0 0-3.414-1.414l-6 6a2 2 0 0 0 0 2.828l6 6A2 2 0 0 0 12 18z",
				key: "2a1g8i"
			}], ["path", {
				d: "M22 6a2 2 0 0 0-3.414-1.414l-6 6a2 2 0 0 0 0 2.828l6 6A2 2 0 0 0 22 18z",
				key: "rg3s36"
			}]]);
			createLucideIcon("ribbon", [
				["path", {
					d: "M12 11.22C11 9.997 10 9 10 8a2 2 0 0 1 4 0c0 1-.998 2.002-2.01 3.22",
					key: "1rnhq3"
				}],
				["path", {
					d: "m12 18 2.57-3.5",
					key: "116vt7"
				}],
				["path", {
					d: "M6.243 9.016a7 7 0 0 1 11.507-.009",
					key: "10dq0b"
				}],
				["path", {
					d: "M9.35 14.53 12 11.22",
					key: "tdsyp2"
				}],
				["path", {
					d: "M9.35 14.53C7.728 12.246 6 10.221 6 7a6 5 0 0 1 12 0c-.005 3.22-1.778 5.235-3.43 7.5l3.557 4.527a1 1 0 0 1-.203 1.43l-1.894 1.36a1 1 0 0 1-1.384-.215L12 18l-2.679 3.593a1 1 0 0 1-1.39.213l-1.865-1.353a1 1 0 0 1-.203-1.422z",
					key: "nmifey"
				}]
			]);
			createLucideIcon("road", [
				["path", {
					d: "M12 17v4",
					key: "1riwvh"
				}],
				["path", {
					d: "M12 5V3",
					key: "vd5es"
				}],
				["path", {
					d: "M12 9v3",
					key: "qyerrc"
				}],
				["path", {
					d: "M2.077 18.449A2 2 0 0 0 4 21h16a2 2 0 0 0 1.924-2.55l-4-14A2 2 0 0 0 16 3H8a2 2 0 0 0-1.924 1.45z",
					key: "1cuxct"
				}]
			]);
			createLucideIcon("robot-arm", [
				["path", {
					d: "M12 21 7.5 8.322",
					key: "18d2q3"
				}],
				["path", {
					d: "m14 7 1.75-3.767a.5.5 0 0 1 .662-.172L20 5.005",
					key: "1ui6cx"
				}],
				["path", {
					d: "m20 8.998-3.588 1.944a.5.5 0 0 1-.662-.172L14 7H8",
					key: "mfi17k"
				}],
				["path", {
					d: "M3.486 21h10",
					key: "d8eyu2"
				}],
				["path", {
					d: "M5 21V8.732",
					key: "uljm3b"
				}],
				["circle", {
					cx: "6",
					cy: "7",
					r: "2",
					key: "11yjtp"
				}]
			]);
			createLucideIcon("rocket", [
				["path", {
					d: "M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5",
					key: "qeys4"
				}],
				["path", {
					d: "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09",
					key: "u4xsad"
				}],
				["path", {
					d: "M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z",
					key: "676m9"
				}],
				["path", {
					d: "M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05",
					key: "92ym6u"
				}]
			]);
			createLucideIcon("robot-vacuum", [
				["path", {
					d: "M11 17h2",
					key: "12w5me"
				}],
				["path", {
					d: "M12 12h.01",
					key: "1mp3jc"
				}],
				["path", {
					d: "M17 12a5 5 0 00-10 0",
					key: "7ltzr3"
				}],
				["path", {
					d: "M19 2v2.8",
					key: "5fivdr"
				}],
				["path", {
					d: "M2 5h2.8",
					key: "1hq9iq"
				}],
				["path", {
					d: "M22 5h-2.8",
					key: "1w5mcv"
				}],
				["path", {
					d: "M5 2v2.8",
					key: "1aozhq"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}]
			]);
			createLucideIcon("rocking-chair", [
				["path", {
					d: "m15 13 3.708 7.416",
					key: "1edxn9"
				}],
				["path", {
					d: "M3 19a15 15 0 0 0 18 0",
					key: "d0d1c4"
				}],
				["path", {
					d: "m3 2 3.21 9.633A2 2 0 0 0 8.109 13H18",
					key: "tpa4et"
				}],
				["path", {
					d: "m9 13-3.708 7.416",
					key: "1oplxx"
				}]
			]);
			createLucideIcon("roller-coaster", [
				["path", {
					d: "M6 19V5",
					key: "1r845m"
				}],
				["path", {
					d: "M10 19V6.8",
					key: "9j2tfs"
				}],
				["path", {
					d: "M14 19v-7.8",
					key: "10s8qv"
				}],
				["path", {
					d: "M18 5v4",
					key: "1tajlv"
				}],
				["path", {
					d: "M18 19v-6",
					key: "ielfq3"
				}],
				["path", {
					d: "M22 19V9",
					key: "158nzp"
				}],
				["path", {
					d: "M2 19V9a4 4 0 0 1 4-4c2 0 4 1.33 6 4s4 4 6 4a4 4 0 1 0-3-6.65",
					key: "1930oh"
				}]
			]);
			createLucideIcon("rose", [
				["path", {
					d: "M17 10h-1a4 4 0 1 1 4-4v.534",
					key: "7qf5zm"
				}],
				["path", {
					d: "M17 6h1a4 4 0 0 1 1.42 7.74l-2.29.87a6 6 0 0 1-5.339-10.68l2.069-1.31",
					key: "1et29u"
				}],
				["path", {
					d: "M4.5 17c2.8-.5 4.4 0 5.5.8s1.8 2.2 2.3 3.7c-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2",
					key: "kiv2lz"
				}],
				["path", {
					d: "M9.77 12C4 15 2 22 2 22",
					key: "h28rw0"
				}],
				["circle", {
					cx: "17",
					cy: "8",
					r: "2",
					key: "1330xn"
				}]
			]);
			createLucideIcon("rotate-3d", [
				["path", {
					d: "m15.194 13.707 3.814 1.86-1.86 3.814",
					key: "16shm9"
				}],
				["path", {
					d: "M16.47214 7.52786 A 5 10 0 1 0 13 21.79796",
					key: "1245p8"
				}],
				["path", {
					d: "M21.79796 11 A 10 5 0 1 0 19 15.57071",
					key: "1i40ks"
				}]
			]);
			createLucideIcon("rotate-ccw-clock", [
				["path", {
					d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",
					key: "1357e3"
				}],
				["path", {
					d: "M3 3v5h5",
					key: "1xhq8a"
				}],
				["path", {
					d: "M12 7v5l4 2",
					key: "1fdv2h"
				}]
			]);
			createLucideIcon("rotate-ccw-key", [
				["path", {
					d: "M12 7v6",
					key: "lw1j43"
				}],
				["path", {
					d: "M12 9h2",
					key: "1lpap9"
				}],
				["path", {
					d: "M3 12a9 9 0 1 0 9-9 9.74 9.74 0 0 0-6.74 2.74L3 8",
					key: "g2jlw"
				}],
				["path", {
					d: "M3 3v5h5",
					key: "1xhq8a"
				}],
				["circle", {
					cx: "12",
					cy: "15",
					r: "2",
					key: "1vpstw"
				}]
			]);
			createLucideIcon("rotate-ccw-square", [
				["path", {
					d: "M20 9V7a2 2 0 0 0-2-2h-6",
					key: "19z8uc"
				}],
				["path", {
					d: "m15 2-3 3 3 3",
					key: "177bxs"
				}],
				["path", {
					d: "M20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2",
					key: "d36hnl"
				}]
			]);
			createLucideIcon("rotate-ccw", [["path", {
				d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",
				key: "1357e3"
			}], ["path", {
				d: "M3 3v5h5",
				key: "1xhq8a"
			}]]);
			createLucideIcon("rotate-cw-fading-clock", [
				["path", {
					d: "M12 3a9.75 9.75 0 0 1 6.74 2.74",
					key: "1k3kxf"
				}],
				["path", {
					d: "M18.74 5.74 21 8",
					key: "1eb40o"
				}],
				["path", {
					d: "M21 8V3",
					key: "1et280"
				}],
				["path", {
					d: "M7.5 19.794c-6-3.464-6-12.124 0-15.588",
					key: "19r0lp"
				}],
				["path", {
					d: "M7.5 4.206A9 9 0 0 1 12 3",
					key: "s8r11"
				}],
				["path", {
					d: "M12 7v5l4 2",
					key: "1fdv2h"
				}],
				["path", {
					d: "M14 20.775A9 9 0 0 1 12 21",
					key: "184rgu"
				}],
				["path", {
					d: "M19 17.656a9 9 0 0 1-1.5 1.456",
					key: "7qgp6l"
				}],
				["path", {
					d: "M21 12a9 9 0 0 1-.228 2",
					key: "1h378y"
				}],
				["path", {
					d: "M21 8h-5",
					key: "k0yzmk"
				}]
			]);
			createLucideIcon("rotate-cw-square", [
				["path", {
					d: "M12 5H6a2 2 0 0 0-2 2v3",
					key: "l96uqu"
				}],
				["path", {
					d: "m9 8 3-3-3-3",
					key: "1gzgc3"
				}],
				["path", {
					d: "M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2",
					key: "1w2k5h"
				}]
			]);
			createLucideIcon("rotate-cw", [["path", {
				d: "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8",
				key: "1p45f6"
			}], ["path", {
				d: "M21 3v5h-5",
				key: "1q7to0"
			}]]);
			createLucideIcon("route-off", [
				["circle", {
					cx: "6",
					cy: "19",
					r: "3",
					key: "1kj8tv"
				}],
				["path", {
					d: "M9 19h8.5c.4 0 .9-.1 1.3-.2",
					key: "1effex"
				}],
				["path", {
					d: "M5.2 5.2A3.5 3.53 0 0 0 6.5 12H12",
					key: "k9y2ds"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M21 15.3a3.5 3.5 0 0 0-3.3-3.3",
					key: "11nlu2"
				}],
				["path", {
					d: "M15 5h-4.3",
					key: "6537je"
				}],
				["circle", {
					cx: "18",
					cy: "5",
					r: "3",
					key: "gq8acd"
				}]
			]);
			createLucideIcon("route", [
				["circle", {
					cx: "6",
					cy: "19",
					r: "3",
					key: "1kj8tv"
				}],
				["path", {
					d: "M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15",
					key: "1d8sl"
				}],
				["circle", {
					cx: "18",
					cy: "5",
					r: "3",
					key: "gq8acd"
				}]
			]);
			createLucideIcon("router", [
				["rect", {
					width: "20",
					height: "8",
					x: "2",
					y: "14",
					rx: "2",
					key: "w68u3i"
				}],
				["path", {
					d: "M6.01 18H6",
					key: "19vcac"
				}],
				["path", {
					d: "M10.01 18H10",
					key: "uamcmx"
				}],
				["path", {
					d: "M15 10v4",
					key: "qjz1xs"
				}],
				["path", {
					d: "M17.84 7.17a4 4 0 0 0-5.66 0",
					key: "1rif40"
				}],
				["path", {
					d: "M20.66 4.34a8 8 0 0 0-11.31 0",
					key: "6a5xfq"
				}]
			]);
			createLucideIcon("rows-2", [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2",
				key: "afitv7"
			}], ["path", {
				d: "M3 12h18",
				key: "1i2n21"
			}]]);
			createLucideIcon("rows-3", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M21 9H3",
					key: "1338ky"
				}],
				["path", {
					d: "M21 15H3",
					key: "9uk58r"
				}]
			]);
			createLucideIcon("rows-4", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M21 7.5H3",
					key: "1hm9pq"
				}],
				["path", {
					d: "M21 12H3",
					key: "2avoz0"
				}],
				["path", {
					d: "M21 16.5H3",
					key: "n7jzkj"
				}]
			]);
			createLucideIcon("ruler-dimension-line", [
				["path", {
					d: "M10 15v-3",
					key: "1pjskw"
				}],
				["path", {
					d: "M14 15v-3",
					key: "1o1mqj"
				}],
				["path", {
					d: "M18 15v-3",
					key: "cws6he"
				}],
				["path", {
					d: "M2 8V4",
					key: "3jv1jz"
				}],
				["path", {
					d: "M22 6H2",
					key: "1iqbfk"
				}],
				["path", {
					d: "M22 8V4",
					key: "16f4ou"
				}],
				["path", {
					d: "M6 15v-3",
					key: "1ij1qe"
				}],
				["rect", {
					x: "2",
					y: "12",
					width: "20",
					height: "8",
					rx: "2",
					key: "1tqiko"
				}]
			]);
			createLucideIcon("rss", [
				["path", {
					d: "M4 11a9 9 0 0 1 9 9",
					key: "pv89mb"
				}],
				["path", {
					d: "M4 4a16 16 0 0 1 16 16",
					key: "k0647b"
				}],
				["circle", {
					cx: "5",
					cy: "19",
					r: "1",
					key: "bfqh0e"
				}]
			]);
			createLucideIcon("ruler", [
				["path", {
					d: "M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z",
					key: "icamh8"
				}],
				["path", {
					d: "m14.5 12.5 2-2",
					key: "inckbg"
				}],
				["path", {
					d: "m11.5 9.5 2-2",
					key: "fmmyf7"
				}],
				["path", {
					d: "m8.5 6.5 2-2",
					key: "vc6u1g"
				}],
				["path", {
					d: "m17.5 15.5 2-2",
					key: "wo5hmg"
				}]
			]);
			createLucideIcon("russian-ruble", [["path", {
				d: "M6 11h8a4 4 0 0 0 0-8H9v18",
				key: "18ai8t"
			}], ["path", {
				d: "M6 15h8",
				key: "1y8f6l"
			}]]);
			createLucideIcon("sailboat", [
				["path", {
					d: "M10 2v15",
					key: "1qf71f"
				}],
				["path", {
					d: "M7 22a4 4 0 0 1-4-4 1 1 0 0 1 1-1h16a1 1 0 0 1 1 1 4 4 0 0 1-4 4z",
					key: "1pxcvx"
				}],
				["path", {
					d: "M9.159 2.46a1 1 0 0 1 1.521-.193l9.977 8.98A1 1 0 0 1 20 13H4a1 1 0 0 1-.824-1.567z",
					key: "5oog16"
				}]
			]);
			createLucideIcon("salad", [
				["path", {
					d: "M7 21h10",
					key: "1b0cd5"
				}],
				["path", {
					d: "M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z",
					key: "4rw317"
				}],
				["path", {
					d: "M11.38 12a2.4 2.4 0 0 1-.4-4.77 2.4 2.4 0 0 1 3.2-2.77 2.4 2.4 0 0 1 3.47-.63 2.4 2.4 0 0 1 3.37 3.37 2.4 2.4 0 0 1-1.1 3.7 2.51 2.51 0 0 1 .03 1.1",
					key: "10xrj0"
				}],
				["path", {
					d: "m13 12 4-4",
					key: "1hckqy"
				}],
				["path", {
					d: "M10.9 7.25A3.99 3.99 0 0 0 4 10c0 .73.2 1.41.54 2",
					key: "1p4srx"
				}]
			]);
			createLucideIcon("sandwich", [
				["path", {
					d: "m2.37 11.223 8.372-6.777a2 2 0 0 1 2.516 0l8.371 6.777",
					key: "f1wd0e"
				}],
				["path", {
					d: "M21 15a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-5.25",
					key: "1pfu07"
				}],
				["path", {
					d: "M3 15a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h9",
					key: "1oq9qw"
				}],
				["path", {
					d: "m6.67 15 6.13 4.6a2 2 0 0 0 2.8-.4l3.15-4.2",
					key: "1fnwu5"
				}],
				["rect", {
					width: "20",
					height: "4",
					x: "2",
					y: "11",
					rx: "1",
					key: "itshg"
				}]
			]);
			createLucideIcon("satellite-dish", [
				["path", {
					d: "M4 10a7.31 7.31 0 0 0 10 10Z",
					key: "1fzpp3"
				}],
				["path", {
					d: "m9 15 3-3",
					key: "88sc13"
				}],
				["path", {
					d: "M17 13a6 6 0 0 0-6-6",
					key: "15cc6u"
				}],
				["path", {
					d: "M21 13A10 10 0 0 0 11 3",
					key: "11nf8s"
				}]
			]);
			createLucideIcon("satellite", [
				["path", {
					d: "m13.5 6.5-3.148-3.148a1.205 1.205 0 0 0-1.704 0L6.352 5.648a1.205 1.205 0 0 0 0 1.704L9.5 10.5",
					key: "dzhfyz"
				}],
				["path", {
					d: "M16.5 7.5 19 5",
					key: "1ltcjm"
				}],
				["path", {
					d: "m17.5 10.5 3.148 3.148a1.205 1.205 0 0 1 0 1.704l-2.296 2.296a1.205 1.205 0 0 1-1.704 0L13.5 14.5",
					key: "nfoymv"
				}],
				["path", {
					d: "M9 21a6 6 0 0 0-6-6",
					key: "1iajcf"
				}],
				["path", {
					d: "M9.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l4.296-4.296a1.205 1.205 0 0 0 0-1.704l-2.296-2.296a1.205 1.205 0 0 0-1.704 0z",
					key: "nv9zqy"
				}]
			]);
			createLucideIcon("saudi-riyal", [
				["path", {
					d: "m20 19.5-5.5 1.2",
					key: "1aenhr"
				}],
				["path", {
					d: "M14.5 4v11.22a1 1 0 0 0 1.242.97L20 15.2",
					key: "2rtezt"
				}],
				["path", {
					d: "m2.978 19.351 5.549-1.363A2 2 0 0 0 10 16V2",
					key: "1kbm92"
				}],
				["path", {
					d: "M20 10 4 13.5",
					key: "8nums9"
				}]
			]);
			createLucideIcon("save-check", [
				["path", {
					d: "M12.5 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10.2a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4v4.35",
					key: "6jbevg"
				}],
				["path", {
					d: "m16 19 2 2 4-4",
					key: "1b14m6"
				}],
				["path", {
					d: "M17 15.13V14a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7",
					key: "1bzeol"
				}],
				["path", {
					d: "M7 3v4a1 1 0 0 0 1 1h7",
					key: "t51u73"
				}]
			]);
			createLucideIcon("save-all", [
				["path", {
					d: "M10 2v3a1 1 0 0 0 1 1h5",
					key: "1xspal"
				}],
				["path", {
					d: "M18 18v-6a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6",
					key: "1ra60u"
				}],
				["path", {
					d: "M18 22H4a2 2 0 0 1-2-2V6",
					key: "pblm9e"
				}],
				["path", {
					d: "M8 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9.172a2 2 0 0 1 1.414.586l2.828 2.828A2 2 0 0 1 22 6.828V16a2 2 0 0 1-2.01 2z",
					key: "1yve0x"
				}]
			]);
			createLucideIcon("save-off", [
				["path", {
					d: "M13 13H8a1 1 0 0 0-1 1v7",
					key: "h8g396"
				}],
				["path", {
					d: "M14 8h1",
					key: "1lfen6"
				}],
				["path", {
					d: "M17 21v-4",
					key: "1yknxs"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M20.41 20.41A2 2 0 0 1 19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 .59-1.41",
					key: "1t4vdl"
				}],
				["path", {
					d: "M29.5 11.5s5 5 4 5",
					key: "zzn4i6"
				}],
				["path", {
					d: "M9 3h6.2a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V15",
					key: "24cby9"
				}]
			]);
			createLucideIcon("save-pen", [
				["path", {
					d: "M13.33 13H8a1 1 0 00-1 1v7",
					key: "60fs50"
				}],
				["path", {
					d: "M14.363 17.634a2 2 0 00-.506.854l-.837 2.87a.5.5 0 00.62.62l2.87-.837a2 2 0 00.854-.506l4.013-4.009a1 1 0 10-3.004-3.004z",
					key: "dpj1he"
				}],
				["path", {
					d: "M7 3v4a1 1 0 001 1h7",
					key: "vkun1b"
				}],
				["path", {
					d: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h10.2a2 2 0 011.4.6l3.8 3.8a2 2 0 01.6 1.4v.3",
					key: "1oj3yb"
				}]
			]);
			createLucideIcon("save-plus", [
				["path", {
					d: "M12.5 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10.2a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V12",
					key: "bhibzn"
				}],
				["path", {
					d: "M16 13H8a1 1 0 0 0-1 1v7",
					key: "164ge7"
				}],
				["path", {
					d: "M19 22v-6",
					key: "qhmiwi"
				}],
				["path", {
					d: "M22 19h-6",
					key: "vcuq98"
				}],
				["path", {
					d: "M7 3v4a1 1 0 0 0 1 1h7",
					key: "t51u73"
				}]
			]);
			createLucideIcon("save", [
				["path", {
					d: "M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
					key: "1c8476"
				}],
				["path", {
					d: "M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7",
					key: "1ydtos"
				}],
				["path", {
					d: "M7 3v4a1 1 0 0 0 1 1h7",
					key: "t51u73"
				}]
			]);
			createLucideIcon("scale-3d", [
				["path", {
					d: "M5 7v11a1 1 0 0 0 1 1h11",
					key: "13dt1j"
				}],
				["path", {
					d: "M5.293 18.707 11 13",
					key: "ezgbsx"
				}],
				["circle", {
					cx: "19",
					cy: "19",
					r: "2",
					key: "17f5cg"
				}],
				["circle", {
					cx: "5",
					cy: "5",
					r: "2",
					key: "1gwv83"
				}]
			]);
			createLucideIcon("scale", [
				["path", {
					d: "M12 3v18",
					key: "108xh3"
				}],
				["path", {
					d: "m19 8 3 8a5 5 0 0 1-6 0zV7",
					key: "zcdpyk"
				}],
				["path", {
					d: "M3 7h1a17 17 0 0 0 8-2 17 17 0 0 0 8 2h1",
					key: "1yorad"
				}],
				["path", {
					d: "m5 8 3 8a5 5 0 0 1-6 0zV7",
					key: "eua70x"
				}],
				["path", {
					d: "M7 21h10",
					key: "1b0cd5"
				}]
			]);
			createLucideIcon("scan-barcode", [
				["path", {
					d: "M3 7V5a2 2 0 0 1 2-2h2",
					key: "aa7l1z"
				}],
				["path", {
					d: "M17 3h2a2 2 0 0 1 2 2v2",
					key: "4qcy5o"
				}],
				["path", {
					d: "M21 17v2a2 2 0 0 1-2 2h-2",
					key: "6vwrx8"
				}],
				["path", {
					d: "M7 21H5a2 2 0 0 1-2-2v-2",
					key: "ioqczr"
				}],
				["path", {
					d: "M8 7v10",
					key: "23sfjj"
				}],
				["path", {
					d: "M12 7v10",
					key: "jspqdw"
				}],
				["path", {
					d: "M17 7v10",
					key: "578dap"
				}]
			]);
			createLucideIcon("scaling", [
				["path", {
					d: "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7",
					key: "1m0v6g"
				}],
				["path", {
					d: "M14 15H9v-5",
					key: "pi4jk9"
				}],
				["path", {
					d: "M16 3h5v5",
					key: "1806ms"
				}],
				["path", {
					d: "M21 3 9 15",
					key: "15kdhq"
				}]
			]);
			createLucideIcon("scan-box", [
				["path", {
					d: "M12 12v5.5",
					key: "1fezw7"
				}],
				["path", {
					d: "M17 3h2a2 2 0 012 2v2",
					key: "sxhzt8"
				}],
				["path", {
					d: "M21 17v2a2 2 0 01-2 2h-2",
					key: "b4b27w"
				}],
				["path", {
					d: "M3 7V5a2 2 0 012-2h2",
					key: "5quapj"
				}],
				["path", {
					d: "M7 21H5a2 2 0 01-2-2v-2",
					key: "rx7q13"
				}],
				["path", {
					d: "M7.264 9.252 12 12l4.737-2.748",
					key: "176tmc"
				}],
				["path", {
					d: "M7.995 8.514A2 2 0 007 10.244v3.516a2 2 0 00.996 1.73l3 1.74a2 2 0 002.008 0l3-1.74A2 2 0 0017 13.76v-3.517a2 2 0 00-.995-1.73l-3-1.742a2 2 0 00-1.892-.064z",
					key: "7zy66p"
				}]
			]);
			createLucideIcon("scan-eye", [
				["path", {
					d: "M3 7V5a2 2 0 0 1 2-2h2",
					key: "aa7l1z"
				}],
				["path", {
					d: "M17 3h2a2 2 0 0 1 2 2v2",
					key: "4qcy5o"
				}],
				["path", {
					d: "M21 17v2a2 2 0 0 1-2 2h-2",
					key: "6vwrx8"
				}],
				["path", {
					d: "M7 21H5a2 2 0 0 1-2-2v-2",
					key: "ioqczr"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "1",
					key: "41hilf"
				}],
				["path", {
					d: "M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0",
					key: "11ak4c"
				}]
			]);
			createLucideIcon("scan-face", [
				["path", {
					d: "M3 7V5a2 2 0 0 1 2-2h2",
					key: "aa7l1z"
				}],
				["path", {
					d: "M17 3h2a2 2 0 0 1 2 2v2",
					key: "4qcy5o"
				}],
				["path", {
					d: "M21 17v2a2 2 0 0 1-2 2h-2",
					key: "6vwrx8"
				}],
				["path", {
					d: "M7 21H5a2 2 0 0 1-2-2v-2",
					key: "ioqczr"
				}],
				["path", {
					d: "M8 14s1.5 2 4 2 4-2 4-2",
					key: "1y1vjs"
				}],
				["path", {
					d: "M9 9h.01",
					key: "1q5me6"
				}],
				["path", {
					d: "M15 9h.01",
					key: "x1ddxp"
				}]
			]);
			createLucideIcon("scan-heart", [
				["path", {
					d: "M17 3h2a2 2 0 0 1 2 2v2",
					key: "4qcy5o"
				}],
				["path", {
					d: "M21 17v2a2 2 0 0 1-2 2h-2",
					key: "6vwrx8"
				}],
				["path", {
					d: "M3 7V5a2 2 0 0 1 2-2h2",
					key: "aa7l1z"
				}],
				["path", {
					d: "M7 21H5a2 2 0 0 1-2-2v-2",
					key: "ioqczr"
				}],
				["path", {
					d: "M7.828 13.07A3 3 0 0 1 12 8.764a3 3 0 0 1 4.172 4.306l-3.447 3.62a1 1 0 0 1-1.449 0z",
					key: "1ak1ef"
				}]
			]);
			createLucideIcon("scan-line", [
				["path", {
					d: "M3 7V5a2 2 0 0 1 2-2h2",
					key: "aa7l1z"
				}],
				["path", {
					d: "M17 3h2a2 2 0 0 1 2 2v2",
					key: "4qcy5o"
				}],
				["path", {
					d: "M21 17v2a2 2 0 0 1-2 2h-2",
					key: "6vwrx8"
				}],
				["path", {
					d: "M7 21H5a2 2 0 0 1-2-2v-2",
					key: "ioqczr"
				}],
				["path", {
					d: "M7 12h10",
					key: "b7w52i"
				}]
			]);
			createLucideIcon("scan-qr-code", [
				["path", {
					d: "M17 12v4a1 1 0 0 1-1 1h-4",
					key: "uk4fdo"
				}],
				["path", {
					d: "M17 3h2a2 2 0 0 1 2 2v2",
					key: "4qcy5o"
				}],
				["path", {
					d: "M17 8V7",
					key: "q2g9wo"
				}],
				["path", {
					d: "M21 17v2a2 2 0 0 1-2 2h-2",
					key: "6vwrx8"
				}],
				["path", {
					d: "M3 7V5a2 2 0 0 1 2-2h2",
					key: "aa7l1z"
				}],
				["path", {
					d: "M7 17h.01",
					key: "19xn7k"
				}],
				["path", {
					d: "M7 21H5a2 2 0 0 1-2-2v-2",
					key: "ioqczr"
				}],
				["rect", {
					x: "7",
					y: "7",
					width: "5",
					height: "5",
					rx: "1",
					key: "m9kyts"
				}]
			]);
			createLucideIcon("scan-search", [
				["path", {
					d: "M3 7V5a2 2 0 0 1 2-2h2",
					key: "aa7l1z"
				}],
				["path", {
					d: "M17 3h2a2 2 0 0 1 2 2v2",
					key: "4qcy5o"
				}],
				["path", {
					d: "M21 17v2a2 2 0 0 1-2 2h-2",
					key: "6vwrx8"
				}],
				["path", {
					d: "M7 21H5a2 2 0 0 1-2-2v-2",
					key: "ioqczr"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "3",
					key: "1v7zrd"
				}],
				["path", {
					d: "m16 16-1.9-1.9",
					key: "1dq9hf"
				}]
			]);
			createLucideIcon("scan-text", [
				["path", {
					d: "M3 7V5a2 2 0 0 1 2-2h2",
					key: "aa7l1z"
				}],
				["path", {
					d: "M17 3h2a2 2 0 0 1 2 2v2",
					key: "4qcy5o"
				}],
				["path", {
					d: "M21 17v2a2 2 0 0 1-2 2h-2",
					key: "6vwrx8"
				}],
				["path", {
					d: "M7 21H5a2 2 0 0 1-2-2v-2",
					key: "ioqczr"
				}],
				["path", {
					d: "M7 8h8",
					key: "1jbsf9"
				}],
				["path", {
					d: "M7 12h10",
					key: "b7w52i"
				}],
				["path", {
					d: "M7 16h6",
					key: "1vyc9m"
				}]
			]);
			createLucideIcon("scan-square", [
				["path", {
					d: "M3 7V5a2 2 0 0 1 2-2h2",
					key: "aa7l1z"
				}],
				["path", {
					d: "M17 3h2a2 2 0 0 1 2 2v2",
					key: "4qcy5o"
				}],
				["path", {
					d: "M21 17v2a2 2 0 0 1-2 2h-2",
					key: "6vwrx8"
				}],
				["path", {
					d: "M7 21H5a2 2 0 0 1-2-2v-2",
					key: "ioqczr"
				}],
				["rect", {
					width: "8",
					height: "8",
					x: "8",
					y: "8",
					rx: "1",
					key: "69yp3k"
				}]
			]);
			createLucideIcon("scan", [
				["path", {
					d: "M3 7V5a2 2 0 0 1 2-2h2",
					key: "aa7l1z"
				}],
				["path", {
					d: "M17 3h2a2 2 0 0 1 2 2v2",
					key: "4qcy5o"
				}],
				["path", {
					d: "M21 17v2a2 2 0 0 1-2 2h-2",
					key: "6vwrx8"
				}],
				["path", {
					d: "M7 21H5a2 2 0 0 1-2-2v-2",
					key: "ioqczr"
				}]
			]);
			createLucideIcon("school", [
				["path", {
					d: "M14 21v-3a2 2 0 0 0-4 0v3",
					key: "1rgiei"
				}],
				["path", {
					d: "M18 4.933V21",
					key: "tjwmp4"
				}],
				["path", {
					d: "m4 6 7.106-3.79a2 2 0 0 1 1.788 0L20 6",
					key: "zywc2d"
				}],
				["path", {
					d: "m6 11-3.52 2.147a1 1 0 0 0-.48.854V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a1 1 0 0 0-.48-.853L18 11",
					key: "1d4ql0"
				}],
				["path", {
					d: "M6 4.933V21",
					key: "1ufz1j"
				}],
				["circle", {
					cx: "12",
					cy: "9",
					r: "2",
					key: "1092wv"
				}]
			]);
			createLucideIcon("scissors-line-dashed", [
				["path", {
					d: "M5.42 9.42 8 12",
					key: "12pkuq"
				}],
				["circle", {
					cx: "4",
					cy: "8",
					r: "2",
					key: "107mxr"
				}],
				["path", {
					d: "m14 6-8.58 8.58",
					key: "gvzu5l"
				}],
				["circle", {
					cx: "4",
					cy: "16",
					r: "2",
					key: "1ehqvc"
				}],
				["path", {
					d: "M10.8 14.8 14 18",
					key: "ax7m9r"
				}],
				["path", {
					d: "M16 12h-2",
					key: "10asgb"
				}],
				["path", {
					d: "M22 12h-2",
					key: "14jgyd"
				}]
			]);
			createLucideIcon("scissors", [
				["circle", {
					cx: "6",
					cy: "6",
					r: "3",
					key: "1lh9wr"
				}],
				["path", {
					d: "M8.12 8.12 12 12",
					key: "1alkpv"
				}],
				["path", {
					d: "M20 4 8.12 15.88",
					key: "xgtan2"
				}],
				["circle", {
					cx: "6",
					cy: "18",
					r: "3",
					key: "fqmcym"
				}],
				["path", {
					d: "M14.8 14.8 20 20",
					key: "ptml3r"
				}]
			]);
			createLucideIcon("scooter", [
				["path", {
					d: "M21 4h-3.5l2 11.05",
					key: "1gktiw"
				}],
				["path", {
					d: "M6.95 17h5.142c.523 0 .95-.406 1.063-.916a6.5 6.5 0 0 1 5.345-5.009",
					key: "1bq3u3"
				}],
				["circle", {
					cx: "19.5",
					cy: "17.5",
					r: "2.5",
					key: "e4zhv9"
				}],
				["circle", {
					cx: "4.5",
					cy: "17.5",
					r: "2.5",
					key: "50vk4p"
				}]
			]);
			createLucideIcon("screen-share-off", [
				["path", {
					d: "M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3",
					key: "i8wdob"
				}],
				["path", {
					d: "M8 21h8",
					key: "1ev6f3"
				}],
				["path", {
					d: "M12 17v4",
					key: "1riwvh"
				}],
				["path", {
					d: "m22 3-5 5",
					key: "12jva0"
				}],
				["path", {
					d: "m17 3 5 5",
					key: "k36vhe"
				}]
			]);
			createLucideIcon("screen-share", [
				["path", {
					d: "M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3",
					key: "i8wdob"
				}],
				["path", {
					d: "M8 21h8",
					key: "1ev6f3"
				}],
				["path", {
					d: "M12 17v4",
					key: "1riwvh"
				}],
				["path", {
					d: "m17 8 5-5",
					key: "fqif7o"
				}],
				["path", {
					d: "M17 3h5v5",
					key: "1o3tu8"
				}]
			]);
			createLucideIcon("scroll-text", [
				["path", {
					d: "M15 12h-5",
					key: "r7krc0"
				}],
				["path", {
					d: "M15 8h-5",
					key: "1khuty"
				}],
				["path", {
					d: "M19 17V5a2 2 0 0 0-2-2H4",
					key: "zz82l3"
				}],
				["path", {
					d: "M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3",
					key: "1ph1d7"
				}]
			]);
			createLucideIcon("scroll", [["path", {
				d: "M19 17V5a2 2 0 0 0-2-2H4",
				key: "zz82l3"
			}], ["path", {
				d: "M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3",
				key: "1ph1d7"
			}]]);
			createLucideIcon("search-alert", [
				["circle", {
					cx: "11",
					cy: "11",
					r: "8",
					key: "4ej97u"
				}],
				["path", {
					d: "m21 21-4.3-4.3",
					key: "1qie3q"
				}],
				["path", {
					d: "M11 7v4",
					key: "m2edmq"
				}],
				["path", {
					d: "M11 15h.01",
					key: "k85uqc"
				}]
			]);
			createLucideIcon("search-check", [
				["path", {
					d: "m8 11 2 2 4-4",
					key: "1sed1v"
				}],
				["circle", {
					cx: "11",
					cy: "11",
					r: "8",
					key: "4ej97u"
				}],
				["path", {
					d: "m21 21-4.3-4.3",
					key: "1qie3q"
				}]
			]);
			createLucideIcon("search-slash", [
				["path", {
					d: "m13.5 8.5-5 5",
					key: "1cs55j"
				}],
				["circle", {
					cx: "11",
					cy: "11",
					r: "8",
					key: "4ej97u"
				}],
				["path", {
					d: "m21 21-4.3-4.3",
					key: "1qie3q"
				}]
			]);
			createLucideIcon("search-code", [
				["path", {
					d: "m13 13.5 2-2.5-2-2.5",
					key: "1rvxrh"
				}],
				["path", {
					d: "m21 21-4.3-4.3",
					key: "1qie3q"
				}],
				["path", {
					d: "M9 8.5 7 11l2 2.5",
					key: "6ffwbx"
				}],
				["circle", {
					cx: "11",
					cy: "11",
					r: "8",
					key: "4ej97u"
				}]
			]);
			createLucideIcon("search-x", [
				["path", {
					d: "m13.5 8.5-5 5",
					key: "1cs55j"
				}],
				["path", {
					d: "m8.5 8.5 5 5",
					key: "a8mexj"
				}],
				["circle", {
					cx: "11",
					cy: "11",
					r: "8",
					key: "4ej97u"
				}],
				["path", {
					d: "m21 21-4.3-4.3",
					key: "1qie3q"
				}]
			]);
			const Search = createLucideIcon("search", [["path", {
				d: "m21 21-4.34-4.34",
				key: "14j7rj"
			}], ["circle", {
				cx: "11",
				cy: "11",
				r: "8",
				key: "4ej97u"
			}]]);
			createLucideIcon("section", [["path", {
				d: "M16 5a4 3 0 0 0-8 0c0 4 8 3 8 7a4 3 0 0 1-8 0",
				key: "vqan6v"
			}], ["path", {
				d: "M8 19a4 3 0 0 0 8 0c0-4-8-3-8-7a4 3 0 0 1 8 0",
				key: "wdjd8o"
			}]]);
			createLucideIcon("send-horizontal", [["path", {
				d: "M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z",
				key: "117uat"
			}], ["path", {
				d: "M6 12h16",
				key: "s4cdu5"
			}]]);
			createLucideIcon("send-to-back", [
				["rect", {
					x: "14",
					y: "14",
					width: "8",
					height: "8",
					rx: "2",
					key: "1b0bso"
				}],
				["rect", {
					x: "2",
					y: "2",
					width: "8",
					height: "8",
					rx: "2",
					key: "1x09vl"
				}],
				["path", {
					d: "M7 14v1a2 2 0 0 0 2 2h1",
					key: "pao6x6"
				}],
				["path", {
					d: "M14 7h1a2 2 0 0 1 2 2v1",
					key: "19tdru"
				}]
			]);
			createLucideIcon("send", [["path", {
				d: "M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z",
				key: "1ffxy3"
			}], ["path", {
				d: "m21.854 2.147-10.94 10.939",
				key: "12cjpa"
			}]]);
			createLucideIcon("separator-horizontal", [
				["path", {
					d: "m16 16-4 4-4-4",
					key: "3dv8je"
				}],
				["path", {
					d: "M3 12h18",
					key: "1i2n21"
				}],
				["path", {
					d: "m8 8 4-4 4 4",
					key: "2bscm2"
				}]
			]);
			createLucideIcon("separator-vertical", [
				["path", {
					d: "M12 3v18",
					key: "108xh3"
				}],
				["path", {
					d: "m16 16 4-4-4-4",
					key: "1js579"
				}],
				["path", {
					d: "m8 8-4 4 4 4",
					key: "1whems"
				}]
			]);
			createLucideIcon("server-cog", [
				["path", {
					d: "m10.852 14.772-.383.923",
					key: "11vil6"
				}],
				["path", {
					d: "M13.148 14.772a3 3 0 1 0-2.296-5.544l-.383-.923",
					key: "1v3clb"
				}],
				["path", {
					d: "m13.148 9.228.383-.923",
					key: "t2zzyc"
				}],
				["path", {
					d: "m13.53 15.696-.382-.924a3 3 0 1 1-2.296-5.544",
					key: "1bxfiv"
				}],
				["path", {
					d: "m14.772 10.852.923-.383",
					key: "k9m8cz"
				}],
				["path", {
					d: "m14.772 13.148.923.383",
					key: "1xvhww"
				}],
				["path", {
					d: "M4.5 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-.5",
					key: "tn8das"
				}],
				["path", {
					d: "M4.5 14H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-.5",
					key: "1g2pve"
				}],
				["path", {
					d: "M6 18h.01",
					key: "uhywen"
				}],
				["path", {
					d: "M6 6h.01",
					key: "1utrut"
				}],
				["path", {
					d: "m9.228 10.852-.923-.383",
					key: "1wtb30"
				}],
				["path", {
					d: "m9.228 13.148-.923.383",
					key: "1a830x"
				}]
			]);
			createLucideIcon("server-crash", [
				["path", {
					d: "M6 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2",
					key: "4b9dqc"
				}],
				["path", {
					d: "M6 14H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2",
					key: "22nnkd"
				}],
				["path", {
					d: "M6 6h.01",
					key: "1utrut"
				}],
				["path", {
					d: "M6 18h.01",
					key: "uhywen"
				}],
				["path", {
					d: "m13 6-4 6h6l-4 6",
					key: "14hqih"
				}]
			]);
			createLucideIcon("server-off", [
				["path", {
					d: "M7 2h13a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-5",
					key: "bt2siv"
				}],
				["path", {
					d: "M10 10 2.5 2.5C2 2 2 2.5 2 5v3a2 2 0 0 0 2 2h6z",
					key: "1hjrv1"
				}],
				["path", {
					d: "M22 17v-1a2 2 0 0 0-2-2h-1",
					key: "1iynyr"
				}],
				["path", {
					d: "M4 14a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16.5l1-.5.5.5-8-8H4z",
					key: "161ggg"
				}],
				["path", {
					d: "M6 18h.01",
					key: "uhywen"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}]
			]);
			createLucideIcon("server-plus", [
				["path", {
					d: "M12.5 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2",
					key: "s66i12"
				}],
				["path", {
					d: "M16 12h6",
					key: "15xry1"
				}],
				["path", {
					d: "M19 9v6",
					key: "1kf5t6"
				}],
				["path", {
					d: "M22 18v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h8.5",
					key: "lo70fm"
				}],
				["path", {
					d: "M6 18h.01",
					key: "uhywen"
				}],
				["path", {
					d: "M6 6h.01",
					key: "1utrut"
				}]
			]);
			createLucideIcon("server", [
				["rect", {
					width: "20",
					height: "8",
					x: "2",
					y: "2",
					rx: "2",
					ry: "2",
					key: "ngkwjq"
				}],
				["rect", {
					width: "20",
					height: "8",
					x: "2",
					y: "14",
					rx: "2",
					ry: "2",
					key: "iecqi9"
				}],
				["line", {
					x1: "6",
					x2: "6.01",
					y1: "6",
					y2: "6",
					key: "16zg32"
				}],
				["line", {
					x1: "6",
					x2: "6.01",
					y1: "18",
					y2: "18",
					key: "nzw8ys"
				}]
			]);
			createLucideIcon("settings-2", [
				["path", {
					d: "M14 17H5",
					key: "gfn3mx"
				}],
				["path", {
					d: "M19 7h-9",
					key: "6i9tg"
				}],
				["circle", {
					cx: "17",
					cy: "17",
					r: "3",
					key: "18b49y"
				}],
				["circle", {
					cx: "7",
					cy: "7",
					r: "3",
					key: "dfmy0x"
				}]
			]);
			createLucideIcon("settings", [["path", {
				d: "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",
				key: "1i5ecw"
			}], ["circle", {
				cx: "12",
				cy: "12",
				r: "3",
				key: "1v7zrd"
			}]]);
			createLucideIcon("shapes", [
				["path", {
					d: "M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z",
					key: "1bo67w"
				}],
				["rect", {
					x: "3",
					y: "14",
					width: "7",
					height: "7",
					rx: "1",
					key: "1bkyp8"
				}],
				["circle", {
					cx: "17.5",
					cy: "17.5",
					r: "3.5",
					key: "w3z12y"
				}]
			]);
			createLucideIcon("share-2", [
				["circle", {
					cx: "18",
					cy: "5",
					r: "3",
					key: "gq8acd"
				}],
				["circle", {
					cx: "6",
					cy: "12",
					r: "3",
					key: "w7nqdw"
				}],
				["circle", {
					cx: "18",
					cy: "19",
					r: "3",
					key: "1xt0gg"
				}],
				["line", {
					x1: "8.59",
					x2: "15.42",
					y1: "13.51",
					y2: "17.49",
					key: "47mynk"
				}],
				["line", {
					x1: "15.41",
					x2: "8.59",
					y1: "6.51",
					y2: "10.49",
					key: "1n3mei"
				}]
			]);
			createLucideIcon("share", [
				["path", {
					d: "M12 2v13",
					key: "1km8f5"
				}],
				["path", {
					d: "m16 6-4-4-4 4",
					key: "13yo43"
				}],
				["path", {
					d: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8",
					key: "1b2hhj"
				}]
			]);
			createLucideIcon("sheet", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					ry: "2",
					key: "1m3agn"
				}],
				["line", {
					x1: "3",
					x2: "21",
					y1: "9",
					y2: "9",
					key: "1vqk6q"
				}],
				["line", {
					x1: "3",
					x2: "21",
					y1: "15",
					y2: "15",
					key: "o2sbyz"
				}],
				["line", {
					x1: "9",
					x2: "9",
					y1: "9",
					y2: "21",
					key: "1ib60c"
				}],
				["line", {
					x1: "15",
					x2: "15",
					y1: "9",
					y2: "21",
					key: "1n26ft"
				}]
			]);
			createLucideIcon("shell", [["path", {
				d: "M14 11a2 2 0 1 1-4 0 4 4 0 0 1 8 0 6 6 0 0 1-12 0 8 8 0 0 1 16 0 10 10 0 1 1-20 0 11.93 11.93 0 0 1 2.42-7.22 2 2 0 1 1 3.16 2.44",
				key: "1cn552"
			}]]);
			createLucideIcon("shelving-unit", [
				["path", {
					d: "M12 12V9a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3",
					key: "wiz68x"
				}],
				["path", {
					d: "M16 20v-3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3",
					key: "1b59c4"
				}],
				["path", {
					d: "M20 22V2",
					key: "1bnhr8"
				}],
				["path", {
					d: "M4 12h16",
					key: "1lakjw"
				}],
				["path", {
					d: "M4 20h16",
					key: "14thso"
				}],
				["path", {
					d: "M4 2v20",
					key: "gtpd5x"
				}],
				["path", {
					d: "M4 4h16",
					key: "1bkgr1"
				}]
			]);
			createLucideIcon("shield-alert", [
				["path", {
					d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
					key: "oel41y"
				}],
				["path", {
					d: "M12 8v4",
					key: "1got3b"
				}],
				["path", {
					d: "M12 16h.01",
					key: "1drbdi"
				}]
			]);
			createLucideIcon("shield-ban", [["path", {
				d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
				key: "oel41y"
			}], ["path", {
				d: "m4.243 5.21 14.39 12.472",
				key: "1c9a7c"
			}]]);
			createLucideIcon("shield-check", [["path", {
				d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
				key: "oel41y"
			}], ["path", {
				d: "m9 12 2 2 4-4",
				key: "dzmm74"
			}]]);
			createLucideIcon("shield-cog-corner", [
				["path", {
					d: "M11 22c-3.806-1.45-7-3.966-7-9V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1v4",
					key: "hf1sz5"
				}],
				["path", {
					d: "M14.923 16.547 14 16.164",
					key: "41f878"
				}],
				["path", {
					d: "m14.923 18.843-.923.383",
					key: "82rvv5"
				}],
				["path", {
					d: "M16.547 14.923 16.164 14",
					key: "1r7ypn"
				}],
				["path", {
					d: "m16.547 20.467-.383.924",
					key: "au4kyj"
				}],
				["path", {
					d: "m18.843 14.923.383-.923",
					key: "1cbrwq"
				}],
				["path", {
					d: "m19.225 21.391-.382-.924",
					key: "1u2bh9"
				}],
				["path", {
					d: "m20.467 16.547.923-.383",
					key: "cprboc"
				}],
				["path", {
					d: "m20.467 18.843.923.383",
					key: "inm8l2"
				}],
				["circle", {
					cx: "17.695",
					cy: "17.695",
					r: "3",
					key: "1i1rmh"
				}]
			]);
			createLucideIcon("shield-cog", [
				["path", {
					d: "m10.929 14.467-.383.924",
					key: "hdyevy"
				}],
				["path", {
					d: "M10.929 8.923 10.546 8",
					key: "1nr44d"
				}],
				["path", {
					d: "M13.225 8.923 13.608 8",
					key: "aewley"
				}],
				["path", {
					d: "m13.607 15.391-.382-.924",
					key: "m37gf1"
				}],
				["path", {
					d: "m14.849 10.547.923-.383",
					key: "1d3c4q"
				}],
				["path", {
					d: "m14.849 12.843.923.383",
					key: "lmvhy3"
				}],
				["path", {
					d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
					key: "oel41y"
				}],
				["path", {
					d: "m9.305 10.547-.923-.383",
					key: "1d13ox"
				}],
				["path", {
					d: "m9.305 12.843-.923.383",
					key: "7wxwh5"
				}],
				["circle", {
					cx: "12.077",
					cy: "11.695",
					r: "3",
					key: "fse9k8"
				}]
			]);
			createLucideIcon("shield-ellipsis", [
				["path", {
					d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
					key: "oel41y"
				}],
				["path", {
					d: "M8 12h.01",
					key: "czm47f"
				}],
				["path", {
					d: "M12 12h.01",
					key: "1mp3jc"
				}],
				["path", {
					d: "M16 12h.01",
					key: "1l6xoz"
				}]
			]);
			createLucideIcon("shield-half", [["path", {
				d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
				key: "oel41y"
			}], ["path", {
				d: "M12 22V2",
				key: "zs6s6o"
			}]]);
			createLucideIcon("shield-keyhole", [
				["path", {
					d: "M12 13v3",
					key: "gkc6qb"
				}],
				["path", {
					d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 01-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 011-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 011.52 0C14.51 3.81 17 5 19 5a1 1 0 011 1z",
					key: "1buusj"
				}],
				["circle", {
					cx: "12",
					cy: "11",
					r: "2",
					key: "1yggc4"
				}]
			]);
			createLucideIcon("shield-lock", [
				["path", {
					d: "M20 9.807V6a1 1 0 00-1-1c-2 0-4.49-1.19-6.24-2.72a1.17 1.17 0 00-1.52 0C9.5 3.8 7 5 5 5a1 1 0 00-1 1v7c0 3.88 2.107 6.254 5 7.796",
					key: "1gl1o4"
				}],
				["path", {
					d: "M19 17v-2a2 2 0 00-4 0v2",
					key: "uefur0"
				}],
				["rect", {
					x: "13",
					y: "17",
					width: "8",
					height: "5",
					rx: "1",
					key: "2y8vuh"
				}]
			]);
			createLucideIcon("shield-minus", [["path", {
				d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
				key: "oel41y"
			}], ["path", {
				d: "M9 12h6",
				key: "1c52cq"
			}]]);
			createLucideIcon("shield-off", [
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M5 5a1 1 0 0 0-1 1v7c0 5 3.5 7.5 7.67 8.94a1 1 0 0 0 .67.01c2.35-.82 4.48-1.97 5.9-3.71",
					key: "1jlk70"
				}],
				["path", {
					d: "M9.309 3.652A12.252 12.252 0 0 0 11.24 2.28a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1v7a9.784 9.784 0 0 1-.08 1.264",
					key: "18rp1v"
				}]
			]);
			createLucideIcon("shield-plus", [
				["path", {
					d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
					key: "oel41y"
				}],
				["path", {
					d: "M9 12h6",
					key: "1c52cq"
				}],
				["path", {
					d: "M12 9v6",
					key: "199k2o"
				}]
			]);
			createLucideIcon("shield-question-mark", [
				["path", {
					d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
					key: "oel41y"
				}],
				["path", {
					d: "M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3",
					key: "mhlwft"
				}],
				["path", {
					d: "M12 17h.01",
					key: "p32p05"
				}]
			]);
			createLucideIcon("shield-user", [
				["path", {
					d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
					key: "oel41y"
				}],
				["path", {
					d: "M6.376 18.91a6 6 0 0 1 11.249.003",
					key: "hnjrf2"
				}],
				["circle", {
					cx: "12",
					cy: "11",
					r: "4",
					key: "1gt34v"
				}]
			]);
			createLucideIcon("shield-x", [
				["path", {
					d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
					key: "oel41y"
				}],
				["path", {
					d: "m14.5 9.5-5 5",
					key: "17q4r4"
				}],
				["path", {
					d: "m9.5 9.5 5 5",
					key: "18nt4w"
				}]
			]);
			createLucideIcon("shield", [["path", {
				d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
				key: "oel41y"
			}]]);
			createLucideIcon("ship-cargo", [
				["path", {
					d: "M12 15v-3",
					key: "1rb51w"
				}],
				["path", {
					d: "M12 2v2",
					key: "tus03m"
				}],
				["path", {
					d: "M16.5 12V9a1 1 0 011-1h1a1 1 0 001-1V5a1 1 0 00-1-1h-13a1 1 0 00-1 1v2a1 1 0 001 1h1a1 1 0 011 1v3",
					key: "1byvar"
				}],
				["path", {
					d: "M19.38 19c1.076-1.815 1.636-4.89 1.628-6.008a1 1 0 00-1-.992H3.984a1 1 0 00-1 .984c-.03 1.86.97 5.621 2.826 7.776",
					key: "1kvu1n"
				}],
				["path", {
					d: "M2 20c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
					key: "1l8w7g"
				}]
			]);
			createLucideIcon("ship-wheel", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "8",
					key: "46899m"
				}],
				["path", {
					d: "M12 2v7.5",
					key: "1e5rl5"
				}],
				["path", {
					d: "m19 5-5.23 5.23",
					key: "1ezxxf"
				}],
				["path", {
					d: "M22 12h-7.5",
					key: "le1719"
				}],
				["path", {
					d: "m19 19-5.23-5.23",
					key: "p3fmgn"
				}],
				["path", {
					d: "M12 14.5V22",
					key: "dgcmos"
				}],
				["path", {
					d: "M10.23 13.77 5 19",
					key: "qwopd4"
				}],
				["path", {
					d: "M9.5 12H2",
					key: "r7bup8"
				}],
				["path", {
					d: "M10.23 10.23 5 5",
					key: "k2y7lj"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "2.5",
					key: "ix0uyj"
				}]
			]);
			createLucideIcon("ship", [
				["path", {
					d: "M12 2v2",
					key: "tus03m"
				}],
				["path", {
					d: "M12 9.189V13",
					key: "yp40p3"
				}],
				["path", {
					d: "M19 12V6a2 2 0 00-2-2H7a2 2 0 00-2 2v6",
					key: "1wcigf"
				}],
				["path", {
					d: "M19.38 19A11.6 11.6 0 0021 13l-8.188-3.639a2 2 0 00-1.624 0L3 13.001a11.6 11.6 0 002.81 7.76",
					key: "1kdp0u"
				}],
				["path", {
					d: "M2 20c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
					key: "1l8w7g"
				}]
			]);
			createLucideIcon("shirt", [["path", {
				d: "M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z",
				key: "1wgbhj"
			}]]);
			createLucideIcon("shopping-bag", [
				["path", {
					d: "M16 10a4 4 0 0 1-8 0",
					key: "1ltviw"
				}],
				["path", {
					d: "M3.103 6.034h17.794",
					key: "awc11p"
				}],
				["path", {
					d: "M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z",
					key: "o988cm"
				}]
			]);
			createLucideIcon("shopping-basket", [
				["path", {
					d: "m15 11-1 9",
					key: "5wnq3a"
				}],
				["path", {
					d: "m19 11-4-7",
					key: "cnml18"
				}],
				["path", {
					d: "M2 11h20",
					key: "3eubbj"
				}],
				["path", {
					d: "m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4",
					key: "yiazzp"
				}],
				["path", {
					d: "M4.5 15.5h15",
					key: "13mye1"
				}],
				["path", {
					d: "m5 11 4-7",
					key: "116ra9"
				}],
				["path", {
					d: "m9 11 1 9",
					key: "1ojof7"
				}]
			]);
			createLucideIcon("shopping-cart", [
				["path", {
					d: "m2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18",
					key: "uebgi3"
				}],
				["path", {
					d: "M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25",
					key: "1j7c9p"
				}],
				["circle", {
					cx: "18",
					cy: "20",
					r: "2",
					key: "t9985n"
				}],
				["circle", {
					cx: "8",
					cy: "20",
					r: "2",
					key: "ckkr5m"
				}]
			]);
			createLucideIcon("shovel", [
				["path", {
					d: "M21.56 4.56a1.5 1.5 0 0 1 0 2.122l-.47.47a3 3 0 0 1-4.212-.03 3 3 0 0 1 0-4.243l.44-.44a1.5 1.5 0 0 1 2.121 0z",
					key: "1gcedi"
				}],
				["path", {
					d: "M3 22a1 1 0 0 1-1-1v-3.586a1 1 0 0 1 .293-.707l3.355-3.355a1.205 1.205 0 0 1 1.704 0l3.296 3.296a1.205 1.205 0 0 1 0 1.704l-3.355 3.355a1 1 0 0 1-.707.293z",
					key: "pg9kv3"
				}],
				["path", {
					d: "m9 15 7.879-7.878",
					key: "1o1zgh"
				}]
			]);
			createLucideIcon("shower-head", [
				["path", {
					d: "m4 4 2.5 2.5",
					key: "uv2vmf"
				}],
				["path", {
					d: "M13.5 6.5a4.95 4.95 0 0 0-7 7",
					key: "frdkwv"
				}],
				["path", {
					d: "M15 5 5 15",
					key: "1ag8rq"
				}],
				["path", {
					d: "M14 17v.01",
					key: "eokfpp"
				}],
				["path", {
					d: "M10 16v.01",
					key: "14uyyl"
				}],
				["path", {
					d: "M13 13v.01",
					key: "1v1k97"
				}],
				["path", {
					d: "M16 10v.01",
					key: "5169yg"
				}],
				["path", {
					d: "M11 20v.01",
					key: "cj92p8"
				}],
				["path", {
					d: "M17 14v.01",
					key: "11cswd"
				}],
				["path", {
					d: "M20 11v.01",
					key: "19e0od"
				}]
			]);
			createLucideIcon("shredder", [
				["path", {
					d: "M4 13V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v5",
					key: "1eob4r"
				}],
				["path", {
					d: "M14 2v5a1 1 0 0 0 1 1h5",
					key: "wfsgrz"
				}],
				["path", {
					d: "M10 22v-5",
					key: "sfixh4"
				}],
				["path", {
					d: "M14 19v-2",
					key: "pdve8j"
				}],
				["path", {
					d: "M18 20v-3",
					key: "uox2gk"
				}],
				["path", {
					d: "M2 13h20",
					key: "5evz65"
				}],
				["path", {
					d: "M6 20v-3",
					key: "c6pdcb"
				}]
			]);
			createLucideIcon("shrimp", [
				["path", {
					d: "M11 12h.01",
					key: "1lr4k6"
				}],
				["path", {
					d: "M13 22c.5-.5 1.12-1 2.5-1-1.38 0-2-.5-2.5-1",
					key: "fatpdi"
				}],
				["path", {
					d: "M14 2a3.28 3.28 0 0 1-3.227 1.798l-6.17-.561A2.387 2.387 0 1 0 4.387 8H15.5a1 1 0 0 1 0 13 1 1 0 0 0 0-5H12a7 7 0 0 1-7-7V8",
					key: "kehrqe"
				}],
				["path", {
					d: "M14 8a8.5 8.5 0 0 1 0 8",
					key: "1imjx2"
				}],
				["path", {
					d: "M16 16c2 0 4.5-4 4-6",
					key: "z0nejz"
				}]
			]);
			createLucideIcon("shrink", [
				["path", {
					d: "m15 15 6 6m-6-6v4.8m0-4.8h4.8",
					key: "17vawe"
				}],
				["path", {
					d: "M9 19.8V15m0 0H4.2M9 15l-6 6",
					key: "chjx8e"
				}],
				["path", {
					d: "M15 4.2V9m0 0h4.8M15 9l6-6",
					key: "lav6yq"
				}],
				["path", {
					d: "M9 4.2V9m0 0H4.2M9 9 3 3",
					key: "1pxi2q"
				}]
			]);
			createLucideIcon("shrub", [
				["path", {
					d: "M12 22v-5.172a2 2 0 0 0-.586-1.414L9.5 13.5",
					key: "1p17fm"
				}],
				["path", {
					d: "M14.5 14.5 12 17",
					key: "dy5w4y"
				}],
				["path", {
					d: "M17 8.8A6 6 0 0 1 13.8 20H10A6.5 6.5 0 0 1 7 8a5 5 0 0 1 10 0z",
					key: "6z7b3o"
				}]
			]);
			createLucideIcon("shuffle", [
				["path", {
					d: "m18 14 4 4-4 4",
					key: "10pe0f"
				}],
				["path", {
					d: "m18 2 4 4-4 4",
					key: "pucp1d"
				}],
				["path", {
					d: "M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22",
					key: "1ailkh"
				}],
				["path", {
					d: "M2 6h1.972a4 4 0 0 1 3.6 2.2",
					key: "km57vx"
				}],
				["path", {
					d: "M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45",
					key: "os18l9"
				}]
			]);
			createLucideIcon("sigma", [["path", {
				d: "M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2",
				key: "wuwx1p"
			}]]);
			createLucideIcon("signal-high", [
				["path", {
					d: "M2 20h.01",
					key: "4haj6o"
				}],
				["path", {
					d: "M7 20v-4",
					key: "j294jx"
				}],
				["path", {
					d: "M12 20v-8",
					key: "i3yub9"
				}],
				["path", {
					d: "M17 20V8",
					key: "1tkaf5"
				}]
			]);
			createLucideIcon("signal-low", [["path", {
				d: "M2 20h.01",
				key: "4haj6o"
			}], ["path", {
				d: "M7 20v-4",
				key: "j294jx"
			}]]);
			createLucideIcon("signal-medium", [
				["path", {
					d: "M2 20h.01",
					key: "4haj6o"
				}],
				["path", {
					d: "M7 20v-4",
					key: "j294jx"
				}],
				["path", {
					d: "M12 20v-8",
					key: "i3yub9"
				}]
			]);
			createLucideIcon("signal-zero", [["path", {
				d: "M2 20h.01",
				key: "4haj6o"
			}]]);
			createLucideIcon("signal", [
				["path", {
					d: "M2 20h.01",
					key: "4haj6o"
				}],
				["path", {
					d: "M7 20v-4",
					key: "j294jx"
				}],
				["path", {
					d: "M12 20v-8",
					key: "i3yub9"
				}],
				["path", {
					d: "M17 20V8",
					key: "1tkaf5"
				}],
				["path", {
					d: "M22 4v16",
					key: "sih9yq"
				}]
			]);
			createLucideIcon("signature", [["path", {
				d: "m21 17-2.156-1.868A.5.5 0 0 0 18 15.5v.5a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1c0-2.545-3.991-3.97-8.5-4a1 1 0 0 0 0 5c4.153 0 4.745-11.295 5.708-13.5a2.5 2.5 0 1 1 3.31 3.284",
				key: "y32ogt"
			}], ["path", {
				d: "M3 21h18",
				key: "itz85i"
			}]]);
			createLucideIcon("signpost-big", [
				["path", {
					d: "M10 9H4L2 7l2-2h6",
					key: "1hq7x2"
				}],
				["path", {
					d: "M14 5h6l2 2-2 2h-6",
					key: "bv62ej"
				}],
				["path", {
					d: "M10 22V4a2 2 0 1 1 4 0v18",
					key: "eqpcf2"
				}],
				["path", {
					d: "M8 22h8",
					key: "rmew8v"
				}]
			]);
			createLucideIcon("signpost", [
				["path", {
					d: "M12 13v8",
					key: "1l5pq0"
				}],
				["path", {
					d: "M12 3v3",
					key: "1n5kay"
				}],
				["path", {
					d: "M2.354 10.354a1.207 1.207 0 0 1 0-1.708l2.06-2.06A2 2 0 0 1 5.828 6h12.344a2 2 0 0 1 1.414.586l2.06 2.06a1.207 1.207 0 0 1 0 1.708l-2.06 2.06a2 2 0 0 1-1.414.586H5.828a2 2 0 0 1-1.414-.586z",
					key: "1tm261"
				}]
			]);
			createLucideIcon("siren", [
				["path", {
					d: "M7 18v-6a5 5 0 1 1 10 0v6",
					key: "pcx96s"
				}],
				["path", {
					d: "M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2z",
					key: "1b4s83"
				}],
				["path", {
					d: "M21 12h1",
					key: "jtio3y"
				}],
				["path", {
					d: "M18.5 4.5 18 5",
					key: "g5sp9y"
				}],
				["path", {
					d: "M2 12h1",
					key: "1uaihz"
				}],
				["path", {
					d: "M12 2v1",
					key: "11qlp1"
				}],
				["path", {
					d: "m4.929 4.929.707.707",
					key: "1i51kw"
				}],
				["path", {
					d: "M12 12v6",
					key: "3ahymv"
				}]
			]);
			createLucideIcon("skip-back", [["path", {
				d: "M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z",
				key: "15892j"
			}], ["path", {
				d: "M3 20V4",
				key: "1ptbpl"
			}]]);
			createLucideIcon("skull", [
				["path", {
					d: "m12.5 17-.5-1-.5 1h1z",
					key: "3me087"
				}],
				["path", {
					d: "M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z",
					key: "1o5pge"
				}],
				["circle", {
					cx: "15",
					cy: "12",
					r: "1",
					key: "1tmaij"
				}],
				["circle", {
					cx: "9",
					cy: "12",
					r: "1",
					key: "1vctgf"
				}]
			]);
			createLucideIcon("skip-forward", [["path", {
				d: "M21 4v16",
				key: "7j8fe9"
			}], ["path", {
				d: "M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z",
				key: "zs4d6"
			}]]);
			createLucideIcon("slash", [["path", {
				d: "M22 2 2 22",
				key: "y4kqgn"
			}]]);
			createLucideIcon("slice", [["path", {
				d: "M11 16.586V19a1 1 0 0 1-1 1H2L18.37 3.63a1 1 0 1 1 3 3l-9.663 9.663a1 1 0 0 1-1.414 0L8 14",
				key: "1sllp5"
			}]]);
			createLucideIcon("sliders-horizontal", [
				["path", {
					d: "M10 5H3",
					key: "1qgfaw"
				}],
				["path", {
					d: "M12 19H3",
					key: "yhmn1j"
				}],
				["path", {
					d: "M14 3v4",
					key: "1sua03"
				}],
				["path", {
					d: "M16 17v4",
					key: "1q0r14"
				}],
				["path", {
					d: "M21 12h-9",
					key: "1o4lsq"
				}],
				["path", {
					d: "M21 19h-5",
					key: "1rlt1p"
				}],
				["path", {
					d: "M21 5h-7",
					key: "1oszz2"
				}],
				["path", {
					d: "M8 10v4",
					key: "tgpxqk"
				}],
				["path", {
					d: "M8 12H3",
					key: "a7s4jb"
				}]
			]);
			createLucideIcon("sliders-vertical", [
				["path", {
					d: "M10 8h4",
					key: "1sr2af"
				}],
				["path", {
					d: "M12 21v-9",
					key: "17s77i"
				}],
				["path", {
					d: "M12 8V3",
					key: "13r4qs"
				}],
				["path", {
					d: "M17 16h4",
					key: "h1uq16"
				}],
				["path", {
					d: "M19 12V3",
					key: "o1uvq1"
				}],
				["path", {
					d: "M19 21v-5",
					key: "qua636"
				}],
				["path", {
					d: "M3 14h4",
					key: "bcjad9"
				}],
				["path", {
					d: "M5 10V3",
					key: "cb8scm"
				}],
				["path", {
					d: "M5 21v-7",
					key: "1w1uti"
				}]
			]);
			createLucideIcon("smartphone-charging", [["rect", {
				width: "14",
				height: "20",
				x: "5",
				y: "2",
				rx: "2",
				ry: "2",
				key: "1yt0o3"
			}], ["path", {
				d: "M12.667 8 10 12h4l-2.667 4",
				key: "h9lk2d"
			}]]);
			createLucideIcon("smartphone-nfc", [
				["rect", {
					width: "7",
					height: "12",
					x: "2",
					y: "6",
					rx: "1",
					key: "5nje8w"
				}],
				["path", {
					d: "M13 8.32a7.43 7.43 0 0 1 0 7.36",
					key: "1g306n"
				}],
				["path", {
					d: "M16.46 6.21a11.76 11.76 0 0 1 0 11.58",
					key: "uqvjvo"
				}],
				["path", {
					d: "M19.91 4.1a15.91 15.91 0 0 1 .01 15.8",
					key: "ujntz3"
				}]
			]);
			createLucideIcon("smartphone", [["rect", {
				width: "14",
				height: "20",
				x: "5",
				y: "2",
				rx: "2",
				ry: "2",
				key: "1yt0o3"
			}], ["path", {
				d: "M12 18h.01",
				key: "mhygvu"
			}]]);
			createLucideIcon("snail", [
				["path", {
					d: "M2 13a6 6 0 1 0 12 0 4 4 0 1 0-8 0 2 2 0 0 0 4 0",
					key: "hneq2s"
				}],
				["circle", {
					cx: "10",
					cy: "13",
					r: "8",
					key: "194lz3"
				}],
				["path", {
					d: "M2 21h12c4.4 0 8-3.6 8-8V7a2 2 0 1 0-4 0v6",
					key: "ixqyt7"
				}],
				["path", {
					d: "M18 3 19.1 5.2",
					key: "9tjm43"
				}],
				["path", {
					d: "M22 3 20.9 5.2",
					key: "j3odrs"
				}]
			]);
			createLucideIcon("snowflake", [
				["path", {
					d: "m10 20-1.25-2.5L6 18",
					key: "18frcb"
				}],
				["path", {
					d: "M10 4 8.75 6.5 6 6",
					key: "7mghy3"
				}],
				["path", {
					d: "m14 20 1.25-2.5L18 18",
					key: "1chtki"
				}],
				["path", {
					d: "m14 4 1.25 2.5L18 6",
					key: "1b4wsy"
				}],
				["path", {
					d: "m17 21-3-6h-4",
					key: "15hhxa"
				}],
				["path", {
					d: "m17 3-3 6 1.5 3",
					key: "11697g"
				}],
				["path", {
					d: "M2 12h6.5L10 9",
					key: "kv9z4n"
				}],
				["path", {
					d: "m20 10-1.5 2 1.5 2",
					key: "1swlpi"
				}],
				["path", {
					d: "M22 12h-6.5L14 15",
					key: "1mxi28"
				}],
				["path", {
					d: "m4 10 1.5 2L4 14",
					key: "k9enpj"
				}],
				["path", {
					d: "m7 21 3-6-1.5-3",
					key: "j8hb9u"
				}],
				["path", {
					d: "m7 3 3 6h4",
					key: "1otusx"
				}]
			]);
			createLucideIcon("soap-dispenser-droplet", [
				["path", {
					d: "M10.5 2v4",
					key: "1xt6in"
				}],
				["path", {
					d: "M14 2H7a2 2 0 0 0-2 2",
					key: "e6xig3"
				}],
				["path", {
					d: "M19.29 14.76A6.67 6.67 0 0 1 17 11a6.6 6.6 0 0 1-2.29 3.76c-1.15.92-1.71 2.04-1.71 3.19 0 2.22 1.8 4.05 4 4.05s4-1.83 4-4.05c0-1.16-.57-2.26-1.71-3.19",
					key: "adq7uc"
				}],
				["path", {
					d: "M9.607 21H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h7V7a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3",
					key: "t9hm96"
				}]
			]);
			createLucideIcon("sofa", [
				["path", {
					d: "M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3",
					key: "1dgpiv"
				}],
				["path", {
					d: "M2 16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z",
					key: "xacw8m"
				}],
				["path", {
					d: "M4 18v2",
					key: "jwo5n2"
				}],
				["path", {
					d: "M20 18v2",
					key: "1ar1qi"
				}],
				["path", {
					d: "M12 4v9",
					key: "oqhhn3"
				}]
			]);
			createLucideIcon("solar-panel", [
				["path", {
					d: "M11 2h2",
					key: "isr7bz"
				}],
				["path", {
					d: "m14.28 14-4.56 8",
					key: "4anwcf"
				}],
				["path", {
					d: "m21 22-1.558-4H4.558",
					key: "enk13h"
				}],
				["path", {
					d: "M3 10v2",
					key: "w8mti9"
				}],
				["path", {
					d: "M6.245 15.04A2 2 0 0 1 8 14h12a1 1 0 0 1 .864 1.505l-3.11 5.457A2 2 0 0 1 16 22H4a1 1 0 0 1-.863-1.506z",
					key: "pouggg"
				}],
				["path", {
					d: "M7 2a4 4 0 0 1-4 4",
					key: "78s8of"
				}],
				["path", {
					d: "m8.66 7.66 1.41 1.41",
					key: "1vaqj8"
				}]
			]);
			createLucideIcon("soup", [
				["path", {
					d: "M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z",
					key: "4rw317"
				}],
				["path", {
					d: "M7 21h10",
					key: "1b0cd5"
				}],
				["path", {
					d: "M19.5 12 22 6",
					key: "shfsr5"
				}],
				["path", {
					d: "M16.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.73 1.62",
					key: "rpc6vp"
				}],
				["path", {
					d: "M11.25 3c.27.1.8.53.74 1.36-.05.83-.93 1.2-.98 2.02-.06.78.33 1.24.72 1.62",
					key: "1lf63m"
				}],
				["path", {
					d: "M6.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.74 1.62",
					key: "97tijn"
				}]
			]);
			createLucideIcon("space", [["path", {
				d: "M22 17v1c0 .5-.5 1-1 1H3c-.5 0-1-.5-1-1v-1",
				key: "lt2kga"
			}]]);
			createLucideIcon("spade", [["path", {
				d: "M12 18v4",
				key: "jadmvz"
			}], ["path", {
				d: "M2 14.499a5.5 5.5 0 0 0 9.591 3.675.6.6 0 0 1 .818.001A5.5 5.5 0 0 0 22 14.5c0-2.29-1.5-4-3-5.5l-5.492-5.312a2 2 0 0 0-3-.02L5 8.999c-1.5 1.5-3 3.2-3 5.5",
				key: "1aw2pz"
			}]]);
			createLucideIcon("sparkle", [["path", {
				d: "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",
				key: "1s2grr"
			}]]);
			createLucideIcon("sparkles", [
				["path", {
					d: "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",
					key: "1s2grr"
				}],
				["path", {
					d: "M20 2v4",
					key: "1rf3ol"
				}],
				["path", {
					d: "M22 4h-4",
					key: "gwowj6"
				}],
				["circle", {
					cx: "4",
					cy: "20",
					r: "2",
					key: "6kqj1y"
				}]
			]);
			createLucideIcon("speaker", [
				["rect", {
					width: "16",
					height: "20",
					x: "4",
					y: "2",
					rx: "2",
					key: "1nb95v"
				}],
				["path", {
					d: "M12 6h.01",
					key: "1vi96p"
				}],
				["circle", {
					cx: "12",
					cy: "14",
					r: "4",
					key: "1jruaj"
				}],
				["path", {
					d: "M12 14h.01",
					key: "1etili"
				}]
			]);
			createLucideIcon("speech", [
				["path", {
					d: "M8.8 20v-4.1l1.9.2a2.3 2.3 0 0 0 2.164-2.1V8.3A5.37 5.37 0 0 0 2 8.25c0 2.8.656 3.054 1 4.55a5.77 5.77 0 0 1 .029 2.758L2 20",
					key: "11atix"
				}],
				["path", {
					d: "M19.8 17.8a7.5 7.5 0 0 0 .003-10.603",
					key: "yol142"
				}],
				["path", {
					d: "M17 15a3.5 3.5 0 0 0-.025-4.975",
					key: "ssbmkc"
				}]
			]);
			createLucideIcon("spell-check-2", [
				["path", {
					d: "m6 16 6-12 6 12",
					key: "1b4byz"
				}],
				["path", {
					d: "M8 12h8",
					key: "1wcyev"
				}],
				["path", {
					d: "M4 21c1.1 0 1.1-1 2.3-1s1.1 1 2.3 1c1.1 0 1.1-1 2.3-1 1.1 0 1.1 1 2.3 1 1.1 0 1.1-1 2.3-1 1.1 0 1.1 1 2.3 1 1.1 0 1.1-1 2.3-1",
					key: "8mdmtu"
				}]
			]);
			createLucideIcon("spell-check", [
				["path", {
					d: "m20 15-5.5 5.5L12 18",
					key: "6ytzne"
				}],
				["path", {
					d: "m4 16 6-12 5.115 10.23",
					key: "fyukjg"
				}],
				["path", {
					d: "M6 12h8",
					key: "1hdiqa"
				}]
			]);
			createLucideIcon("spline-pointer", [
				["path", {
					d: "M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z",
					key: "xwnzip"
				}],
				["path", {
					d: "M5 17A12 12 0 0 1 17 5",
					key: "1okkup"
				}],
				["circle", {
					cx: "19",
					cy: "5",
					r: "2",
					key: "mhkx31"
				}],
				["circle", {
					cx: "5",
					cy: "19",
					r: "2",
					key: "v8kfzx"
				}]
			]);
			createLucideIcon("split", [
				["path", {
					d: "M16 3h5v5",
					key: "1806ms"
				}],
				["path", {
					d: "M8 3H3v5",
					key: "15dfkv"
				}],
				["path", {
					d: "M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3",
					key: "1qrqzj"
				}],
				["path", {
					d: "m15 9 6-6",
					key: "ko1vev"
				}]
			]);
			createLucideIcon("spline", [
				["circle", {
					cx: "19",
					cy: "5",
					r: "2",
					key: "mhkx31"
				}],
				["circle", {
					cx: "5",
					cy: "19",
					r: "2",
					key: "v8kfzx"
				}],
				["path", {
					d: "M5 17A12 12 0 0 1 17 5",
					key: "1okkup"
				}]
			]);
			createLucideIcon("spool", [["path", {
				d: "M17 13.44 4.442 17.082A2 2 0 0 0 4.982 21H19a2 2 0 0 0 .558-3.921l-1.115-.32A2 2 0 0 1 17 14.837V7.66",
				key: "13vns8"
			}], ["path", {
				d: "m7 10.56 12.558-3.642A2 2 0 0 0 19.018 3H5a2 2 0 0 0-.558 3.921l1.115.32A2 2 0 0 1 7 9.163v7.178",
				key: "s8x3u0"
			}]]);
			createLucideIcon("sport-shoe", [
				["path", {
					d: "m15 10.42 4.8-5.07",
					key: "10at9d"
				}],
				["path", {
					d: "M19 18h3",
					key: "nnkd4d"
				}],
				["path", {
					d: "M9.5 22 21.414 9.415A2 2 0 0 0 21.2 6.4l-5.61-4.208A1 1 0 0 0 14 3v2a2 2 0 0 1-1.394 1.906L8.677 8.053A1 1 0 0 0 8 9c-.155 6.393-2.082 9-4 9a2 2 0 0 0 0 4h14",
					key: "v410ed"
				}]
			]);
			createLucideIcon("spotlight", [
				["path", {
					d: "M15.295 19.562 16 22",
					key: "31jsb7"
				}],
				["path", {
					d: "m17 16 3.758 2.098",
					key: "121ar7"
				}],
				["path", {
					d: "m19 12.5 3.026-.598",
					key: "19ukd3"
				}],
				["path", {
					d: "M7.61 6.3a3 3 0 0 0-3.92 1.3l-1.38 2.79a3 3 0 0 0 1.3 3.91l6.89 3.597a1 1 0 0 0 1.342-.447l3.106-6.211a1 1 0 0 0-.447-1.341z",
					key: "lwb9l9"
				}],
				["path", {
					d: "M8 9V2",
					key: "1xa0v7"
				}]
			]);
			createLucideIcon("sprout", [
				["path", {
					d: "M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3",
					key: "139s4v"
				}],
				["path", {
					d: "M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4",
					key: "1dlkgp"
				}],
				["path", {
					d: "M5 21h14",
					key: "11awu3"
				}]
			]);
			createLucideIcon("spray-can", [
				["path", {
					d: "M3 3h.01",
					key: "159qn6"
				}],
				["path", {
					d: "M7 5h.01",
					key: "1hq22a"
				}],
				["path", {
					d: "M11 7h.01",
					key: "1osv80"
				}],
				["path", {
					d: "M3 7h.01",
					key: "1xzrh3"
				}],
				["path", {
					d: "M7 9h.01",
					key: "19b3jx"
				}],
				["path", {
					d: "M3 11h.01",
					key: "1eifu7"
				}],
				["rect", {
					width: "4",
					height: "4",
					x: "15",
					y: "5",
					key: "mri9e4"
				}],
				["path", {
					d: "m19 9 2 2v10c0 .6-.4 1-1 1h-6c-.6 0-1-.4-1-1V11l2-2",
					key: "aib6hk"
				}],
				["path", {
					d: "m13 14 8-2",
					key: "1d7bmk"
				}],
				["path", {
					d: "m13 19 8-2",
					key: "1y2vml"
				}]
			]);
			createLucideIcon("square-activity", [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2",
				key: "afitv7"
			}], ["path", {
				d: "M17 12h-2l-2 5-2-10-2 5H7",
				key: "15hlnc"
			}]]);
			createLucideIcon("square-arrow-down-left", [
				["path", {
					d: "M15 15H9l6-6",
					key: "1w52wt"
				}],
				["path", {
					d: "M9 15V9",
					key: "1kwqze"
				}],
				["rect", {
					x: "3",
					y: "3",
					width: "18",
					height: "18",
					rx: "2",
					key: "h1oib"
				}]
			]);
			createLucideIcon("square-arrow-down-right", [
				["path", {
					d: "M15 15 9 9",
					key: "qb9ybb"
				}],
				["path", {
					d: "M9 15h6V9",
					key: "1wezwn"
				}],
				["rect", {
					x: "3",
					y: "3",
					width: "18",
					height: "18",
					rx: "2",
					key: "h1oib"
				}]
			]);
			createLucideIcon("square-arrow-left", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "m12 8-4 4 4 4",
					key: "15vm53"
				}],
				["path", {
					d: "M16 12H8",
					key: "1fr5h0"
				}]
			]);
			createLucideIcon("square-arrow-down", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M12 8v8",
					key: "napkw2"
				}],
				["path", {
					d: "m8 12 4 4 4-4",
					key: "k98ssh"
				}]
			]);
			createLucideIcon("square-arrow-out-down-left", [
				["path", {
					d: "M13 21h6a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6",
					key: "14qz4y"
				}],
				["path", {
					d: "m3 21 9-9",
					key: "1jfql5"
				}],
				["path", {
					d: "M9 21H3v-6",
					key: "wtvkvv"
				}]
			]);
			createLucideIcon("square-arrow-out-down-right", [
				["path", {
					d: "M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6",
					key: "14rsvq"
				}],
				["path", {
					d: "m21 21-9-9",
					key: "1et2py"
				}],
				["path", {
					d: "M21 15v6h-6",
					key: "1jko0i"
				}]
			]);
			createLucideIcon("square-arrow-out-up-right", [
				["path", {
					d: "M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6",
					key: "y09zxi"
				}],
				["path", {
					d: "m21 3-9 9",
					key: "mpx6sq"
				}],
				["path", {
					d: "M15 3h6v6",
					key: "1q9fwt"
				}]
			]);
			createLucideIcon("square-arrow-out-up-left", [
				["path", {
					d: "M13 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6",
					key: "14mv1t"
				}],
				["path", {
					d: "m3 3 9 9",
					key: "rks13r"
				}],
				["path", {
					d: "M3 9V3h6",
					key: "ira0h2"
				}]
			]);
			createLucideIcon("square-arrow-right-enter", [
				["path", {
					d: "m10 16 4-4-4-4",
					key: "w9835o"
				}],
				["path", {
					d: "M3 12h11",
					key: "pmja8f"
				}],
				["path", {
					d: "M3 8V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3",
					key: "1bqs5q"
				}]
			]);
			createLucideIcon("square-arrow-right-exit", [
				["path", {
					d: "M10 12h11",
					key: "6m4ad9"
				}],
				["path", {
					d: "m17 16 4-4-4-4",
					key: "iin4zf"
				}],
				["path", {
					d: "M21 6.344V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1.344",
					key: "1ojbhp"
				}]
			]);
			createLucideIcon("square-arrow-right", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M8 12h8",
					key: "1wcyev"
				}],
				["path", {
					d: "m12 16 4-4-4-4",
					key: "1i9zcv"
				}]
			]);
			createLucideIcon("square-arrow-up-left", [
				["path", {
					d: "M15 15 9 9",
					key: "qb9ybb"
				}],
				["path", {
					d: "M9 15V9h6",
					key: "1pdr5l"
				}],
				["rect", {
					x: "3",
					y: "3",
					width: "18",
					height: "18",
					rx: "2",
					key: "h1oib"
				}]
			]);
			createLucideIcon("square-arrow-up-right", [
				["path", {
					d: "M15 15V9H9",
					key: "vxyd2h"
				}],
				["path", {
					d: "m9 15 6-6",
					key: "1ygkhp"
				}],
				["rect", {
					x: "3",
					y: "3",
					width: "18",
					height: "18",
					rx: "2",
					key: "h1oib"
				}]
			]);
			createLucideIcon("square-arrow-up", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "m16 12-4-4-4 4",
					key: "177agl"
				}],
				["path", {
					d: "M12 16V8",
					key: "1sbj14"
				}]
			]);
			createLucideIcon("square-bottom-dashed-scissors", [
				["path", {
					d: "M14 21h1",
					key: "v9vybs"
				}],
				["path", {
					d: "m17 17-2.18-2.18",
					key: "1y7dt1"
				}],
				["path", {
					d: "M5 21a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2",
					key: "2q1jq4"
				}],
				["path", {
					d: "M9 21h1",
					key: "15o7lz"
				}],
				["path", {
					d: "M9.56 14.44 17 7",
					key: "ue8l15"
				}],
				["path", {
					d: "M9.56 9.56 12 12",
					key: "rml9qv"
				}],
				["circle", {
					cx: "8.5",
					cy: "15.5",
					r: "1.5",
					key: "12hfy1"
				}],
				["circle", {
					cx: "8.5",
					cy: "8.5",
					r: "1.5",
					key: "cn5opk"
				}]
			]);
			createLucideIcon("square-asterisk", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M12 8v8",
					key: "napkw2"
				}],
				["path", {
					d: "m8.5 14 7-4",
					key: "12hpby"
				}],
				["path", {
					d: "m8.5 10 7 4",
					key: "wwy2dy"
				}]
			]);
			createLucideIcon("square-centerline-dashed-horizontal", [
				["path", {
					d: "M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3",
					key: "1i73f7"
				}],
				["path", {
					d: "M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3",
					key: "saxlbk"
				}],
				["path", {
					d: "M12 20v2",
					key: "1lh1kg"
				}],
				["path", {
					d: "M12 14v2",
					key: "8jcxud"
				}],
				["path", {
					d: "M12 8v2",
					key: "1woqiv"
				}],
				["path", {
					d: "M12 2v2",
					key: "tus03m"
				}]
			]);
			createLucideIcon("square-centerline-dashed-vertical", [
				["path", {
					d: "M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3",
					key: "14bfxa"
				}],
				["path", {
					d: "M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3",
					key: "14rx03"
				}],
				["path", {
					d: "M4 12H2",
					key: "rhcxmi"
				}],
				["path", {
					d: "M10 12H8",
					key: "s88cx1"
				}],
				["path", {
					d: "M16 12h-2",
					key: "10asgb"
				}],
				["path", {
					d: "M22 12h-2",
					key: "14jgyd"
				}]
			]);
			createLucideIcon("square-chart-gantt", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M9 8h7",
					key: "kbo1nt"
				}],
				["path", {
					d: "M8 12h6",
					key: "ikassy"
				}],
				["path", {
					d: "M11 16h5",
					key: "oq65wt"
				}]
			]);
			createLucideIcon("square-check-big", [["path", {
				d: "M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344",
				key: "2acyp4"
			}], ["path", {
				d: "m9 11 3 3L22 4",
				key: "1pflzl"
			}]]);
			createLucideIcon("square-check", [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2",
				key: "afitv7"
			}], ["path", {
				d: "m16 9-5.5 5.5L8 12",
				key: "xofnsj"
			}]]);
			createLucideIcon("square-chevron-down", [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2",
				key: "afitv7"
			}], ["path", {
				d: "m16 10-4 4-4-4",
				key: "894hmk"
			}]]);
			createLucideIcon("square-chevron-left", [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2",
				key: "afitv7"
			}], ["path", {
				d: "m14 16-4-4 4-4",
				key: "ojs7w8"
			}]]);
			createLucideIcon("square-chevron-right", [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2",
				key: "afitv7"
			}], ["path", {
				d: "m10 8 4 4-4 4",
				key: "1wy4r4"
			}]]);
			createLucideIcon("square-chevron-up", [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2",
				key: "afitv7"
			}], ["path", {
				d: "m8 14 4-4 4 4",
				key: "fy2ptz"
			}]]);
			createLucideIcon("square-code", [
				["path", {
					d: "m10 9-3 3 3 3",
					key: "1oro0q"
				}],
				["path", {
					d: "m14 15 3-3-3-3",
					key: "bz13h7"
				}],
				["rect", {
					x: "3",
					y: "3",
					width: "18",
					height: "18",
					rx: "2",
					key: "h1oib"
				}]
			]);
			createLucideIcon("square-dashed-bottom-code", [
				["path", {
					d: "M10 9.5 8 12l2 2.5",
					key: "3mjy60"
				}],
				["path", {
					d: "M14 21h1",
					key: "v9vybs"
				}],
				["path", {
					d: "m14 9.5 2 2.5-2 2.5",
					key: "1bir2l"
				}],
				["path", {
					d: "M5 21a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2",
					key: "as5y1o"
				}],
				["path", {
					d: "M9 21h1",
					key: "15o7lz"
				}]
			]);
			createLucideIcon("square-dashed-bottom", [
				["path", {
					d: "M5 21a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2",
					key: "as5y1o"
				}],
				["path", {
					d: "M9 21h1",
					key: "15o7lz"
				}],
				["path", {
					d: "M14 21h1",
					key: "v9vybs"
				}]
			]);
			createLucideIcon("square-dashed-kanban", [
				["path", {
					d: "M8 7v7",
					key: "1x2jlm"
				}],
				["path", {
					d: "M12 7v4",
					key: "xawao1"
				}],
				["path", {
					d: "M16 7v9",
					key: "1hp2iy"
				}],
				["path", {
					d: "M5 3a2 2 0 0 0-2 2",
					key: "y57alp"
				}],
				["path", {
					d: "M9 3h1",
					key: "1yesri"
				}],
				["path", {
					d: "M14 3h1",
					key: "1ec4yj"
				}],
				["path", {
					d: "M19 3a2 2 0 0 1 2 2",
					key: "18rm91"
				}],
				["path", {
					d: "M21 9v1",
					key: "mxsmne"
				}],
				["path", {
					d: "M21 14v1",
					key: "169vum"
				}],
				["path", {
					d: "M21 19a2 2 0 0 1-2 2",
					key: "1j7049"
				}],
				["path", {
					d: "M14 21h1",
					key: "v9vybs"
				}],
				["path", {
					d: "M9 21h1",
					key: "15o7lz"
				}],
				["path", {
					d: "M5 21a2 2 0 0 1-2-2",
					key: "sbafld"
				}],
				["path", {
					d: "M3 14v1",
					key: "vnatye"
				}],
				["path", {
					d: "M3 9v1",
					key: "1r0deq"
				}]
			]);
			createLucideIcon("square-dashed-mouse-pointer", [
				["path", {
					d: "M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z",
					key: "xwnzip"
				}],
				["path", {
					d: "M5 3a2 2 0 0 0-2 2",
					key: "y57alp"
				}],
				["path", {
					d: "M19 3a2 2 0 0 1 2 2",
					key: "18rm91"
				}],
				["path", {
					d: "M5 21a2 2 0 0 1-2-2",
					key: "sbafld"
				}],
				["path", {
					d: "M9 3h1",
					key: "1yesri"
				}],
				["path", {
					d: "M9 21h2",
					key: "1qve2z"
				}],
				["path", {
					d: "M14 3h1",
					key: "1ec4yj"
				}],
				["path", {
					d: "M3 9v1",
					key: "1r0deq"
				}],
				["path", {
					d: "M21 9v2",
					key: "p14lih"
				}],
				["path", {
					d: "M3 14v1",
					key: "vnatye"
				}]
			]);
			createLucideIcon("square-dashed-text", [
				["path", {
					d: "M14 21h1",
					key: "v9vybs"
				}],
				["path", {
					d: "M14 3h1",
					key: "1ec4yj"
				}],
				["path", {
					d: "M19 3a2 2 0 0 1 2 2",
					key: "18rm91"
				}],
				["path", {
					d: "M21 14v1",
					key: "169vum"
				}],
				["path", {
					d: "M21 19a2 2 0 0 1-2 2",
					key: "1j7049"
				}],
				["path", {
					d: "M21 9v1",
					key: "mxsmne"
				}],
				["path", {
					d: "M3 14v1",
					key: "vnatye"
				}],
				["path", {
					d: "M3 9v1",
					key: "1r0deq"
				}],
				["path", {
					d: "M5 21a2 2 0 0 1-2-2",
					key: "sbafld"
				}],
				["path", {
					d: "M5 3a2 2 0 0 0-2 2",
					key: "y57alp"
				}],
				["path", {
					d: "M7 12h10",
					key: "b7w52i"
				}],
				["path", {
					d: "M7 16h6",
					key: "1vyc9m"
				}],
				["path", {
					d: "M7 8h8",
					key: "1jbsf9"
				}],
				["path", {
					d: "M9 21h1",
					key: "15o7lz"
				}],
				["path", {
					d: "M9 3h1",
					key: "1yesri"
				}]
			]);
			createLucideIcon("square-dashed-top-solid", [
				["path", {
					d: "M14 21h1",
					key: "v9vybs"
				}],
				["path", {
					d: "M21 14v1",
					key: "169vum"
				}],
				["path", {
					d: "M21 19a2 2 0 0 1-2 2",
					key: "1j7049"
				}],
				["path", {
					d: "M21 9v1",
					key: "mxsmne"
				}],
				["path", {
					d: "M3 14v1",
					key: "vnatye"
				}],
				["path", {
					d: "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2",
					key: "89voep"
				}],
				["path", {
					d: "M3 9v1",
					key: "1r0deq"
				}],
				["path", {
					d: "M5 21a2 2 0 0 1-2-2",
					key: "sbafld"
				}],
				["path", {
					d: "M9 21h1",
					key: "15o7lz"
				}]
			]);
			createLucideIcon("square-dashed", [
				["path", {
					d: "M5 3a2 2 0 0 0-2 2",
					key: "y57alp"
				}],
				["path", {
					d: "M19 3a2 2 0 0 1 2 2",
					key: "18rm91"
				}],
				["path", {
					d: "M21 19a2 2 0 0 1-2 2",
					key: "1j7049"
				}],
				["path", {
					d: "M5 21a2 2 0 0 1-2-2",
					key: "sbafld"
				}],
				["path", {
					d: "M9 3h1",
					key: "1yesri"
				}],
				["path", {
					d: "M9 21h1",
					key: "15o7lz"
				}],
				["path", {
					d: "M14 3h1",
					key: "1ec4yj"
				}],
				["path", {
					d: "M14 21h1",
					key: "v9vybs"
				}],
				["path", {
					d: "M3 9v1",
					key: "1r0deq"
				}],
				["path", {
					d: "M21 9v1",
					key: "mxsmne"
				}],
				["path", {
					d: "M3 14v1",
					key: "vnatye"
				}],
				["path", {
					d: "M21 14v1",
					key: "169vum"
				}]
			]);
			createLucideIcon("square-dimensions", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M12 7H7v5",
					key: "ow32kf"
				}],
				["path", {
					d: "M12 17h5v-5",
					key: "1biuiz"
				}]
			]);
			createLucideIcon("square-divide", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					ry: "2",
					key: "1m3agn"
				}],
				["line", {
					x1: "8",
					x2: "16",
					y1: "12",
					y2: "12",
					key: "1jonct"
				}],
				["line", {
					x1: "12",
					x2: "12",
					y1: "16",
					y2: "16",
					key: "aqc6ln"
				}],
				["line", {
					x1: "12",
					x2: "12",
					y1: "8",
					y2: "8",
					key: "1mkcni"
				}]
			]);
			createLucideIcon("square-dot", [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2",
				key: "afitv7"
			}], ["circle", {
				cx: "12",
				cy: "12",
				r: "1",
				key: "41hilf"
			}]]);
			createLucideIcon("square-equal", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M7 10h10",
					key: "1101jm"
				}],
				["path", {
					d: "M7 14h10",
					key: "1mhdw3"
				}]
			]);
			createLucideIcon("square-function", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					ry: "2",
					key: "1m3agn"
				}],
				["path", {
					d: "M9 17c2 0 2.8-1 2.8-2.8V10c0-2 1-3.3 3.2-3",
					key: "m1af9g"
				}],
				["path", {
					d: "M9 11.2h5.7",
					key: "3zgcl2"
				}]
			]);
			createLucideIcon("square-kanban", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M8 7v7",
					key: "1x2jlm"
				}],
				["path", {
					d: "M12 7v4",
					key: "xawao1"
				}],
				["path", {
					d: "M16 7v9",
					key: "1hp2iy"
				}]
			]);
			createLucideIcon("square-library", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M7 7v10",
					key: "d5nglc"
				}],
				["path", {
					d: "M11 7v10",
					key: "pptsnr"
				}],
				["path", {
					d: "m15 7 2 10",
					key: "1m7qm5"
				}]
			]);
			createLucideIcon("square-m", [["path", {
				d: "M8 16V8.5a.5.5 0 0 1 .9-.3l2.7 3.599a.5.5 0 0 0 .8 0l2.7-3.6a.5.5 0 0 1 .9.3V16",
				key: "1ywlsj"
			}], ["rect", {
				x: "3",
				y: "3",
				width: "18",
				height: "18",
				rx: "2",
				key: "h1oib"
			}]]);
			createLucideIcon("square-menu", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M7 8h10",
					key: "1jw688"
				}],
				["path", {
					d: "M7 12h10",
					key: "b7w52i"
				}],
				["path", {
					d: "M7 16h10",
					key: "wp8him"
				}]
			]);
			createLucideIcon("square-minus", [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2",
				key: "afitv7"
			}], ["path", {
				d: "M8 12h8",
				key: "1wcyev"
			}]]);
			createLucideIcon("square-mouse-pointer", [["path", {
				d: "M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z",
				key: "xwnzip"
			}], ["path", {
				d: "M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6",
				key: "14rsvq"
			}]]);
			createLucideIcon("square-off", [
				["path", {
					d: "M20.4 20.4a2 2 0 01-1.4.6H5a2 2 0 01-2-2V5a2 2 0 01.59-1.41",
					key: "7ym6nm"
				}],
				["path", {
					d: "M21 15.3V5a2 2 0 00-2-2H8.7",
					key: "m4nk5y"
				}],
				["path", {
					d: "M22 22 2 2",
					key: "1r8tn9"
				}]
			]);
			createLucideIcon("square-parking-off", [
				["path", {
					d: "M3.6 3.6A2 2 0 0 1 5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-.59 1.41",
					key: "9l1ft6"
				}],
				["path", {
					d: "M3 8.7V19a2 2 0 0 0 2 2h10.3",
					key: "17knke"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M13 13a3 3 0 1 0 0-6H9v2",
					key: "uoagbd"
				}],
				["path", {
					d: "M9 17v-2.3",
					key: "1jxgo2"
				}]
			]);
			createLucideIcon("square-parking", [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2",
				key: "afitv7"
			}], ["path", {
				d: "M9 17V7h4a3 3 0 0 1 0 6H9",
				key: "1dfk2c"
			}]]);
			createLucideIcon("square-pen", [["path", {
				d: "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7",
				key: "1m0v6g"
			}], ["path", {
				d: "M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z",
				key: "ohrbg2"
			}]]);
			createLucideIcon("square-pause", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["line", {
					x1: "10",
					x2: "10",
					y1: "15",
					y2: "9",
					key: "c1nkhi"
				}],
				["line", {
					x1: "14",
					x2: "14",
					y1: "15",
					y2: "9",
					key: "h65svq"
				}]
			]);
			createLucideIcon("square-percent", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "m15 9-6 6",
					key: "1uzhvr"
				}],
				["path", {
					d: "M9 9h.01",
					key: "1q5me6"
				}],
				["path", {
					d: "M15 15h.01",
					key: "lqbp3k"
				}]
			]);
			createLucideIcon("square-pi", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M7 7h10",
					key: "udp07y"
				}],
				["path", {
					d: "M10 7v10",
					key: "i1d9ee"
				}],
				["path", {
					d: "M16 17a2 2 0 0 1-2-2V7",
					key: "ftwdc7"
				}]
			]);
			createLucideIcon("square-pilcrow", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M12 12H9.5a2.5 2.5 0 0 1 0-5H17",
					key: "1l9586"
				}],
				["path", {
					d: "M12 7v10",
					key: "jspqdw"
				}],
				["path", {
					d: "M16 7v10",
					key: "lavkr4"
				}]
			]);
			createLucideIcon("square-play", [["rect", {
				x: "3",
				y: "3",
				width: "18",
				height: "18",
				rx: "2",
				key: "h1oib"
			}], ["path", {
				d: "M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z",
				key: "kmsa83"
			}]]);
			createLucideIcon("square-plus", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M8 12h8",
					key: "1wcyev"
				}],
				["path", {
					d: "M12 8v8",
					key: "napkw2"
				}]
			]);
			createLucideIcon("square-power", [
				["path", {
					d: "M12 7v4",
					key: "xawao1"
				}],
				["path", {
					d: "M7.998 9.003a5 5 0 1 0 8-.005",
					key: "1pek45"
				}],
				["rect", {
					x: "3",
					y: "3",
					width: "18",
					height: "18",
					rx: "2",
					key: "h1oib"
				}]
			]);
			createLucideIcon("square-radical", [["path", {
				d: "M7 12h2l2 5 2-10h4",
				key: "1fxv6h"
			}], ["rect", {
				x: "3",
				y: "3",
				width: "18",
				height: "18",
				rx: "2",
				key: "h1oib"
			}]]);
			createLucideIcon("square-scissors", [
				["path", {
					d: "m17 17-2.18-2.18",
					key: "1y7dt1"
				}],
				["path", {
					d: "M9.56 14.44 17 7",
					key: "ue8l15"
				}],
				["path", {
					d: "M9.56 9.56 12 12",
					key: "rml9qv"
				}],
				["circle", {
					cx: "8.5",
					cy: "15.5",
					r: "1.5",
					key: "12hfy1"
				}],
				["circle", {
					cx: "8.5",
					cy: "8.5",
					r: "1.5",
					key: "cn5opk"
				}],
				["rect", {
					x: "3",
					y: "3",
					width: "18",
					height: "18",
					rx: "2",
					key: "h1oib"
				}]
			]);
			createLucideIcon("square-round-corner", [["path", {
				d: "M21 11a8 8 0 0 0-8-8",
				key: "1lxwo5"
			}], ["path", {
				d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",
				key: "1dv2y5"
			}]]);
			createLucideIcon("square-sigma", [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2",
				key: "afitv7"
			}], ["path", {
				d: "M16 8.9V7H8l4 5-4 5h8v-1.9",
				key: "9nih0i"
			}]]);
			createLucideIcon("square-split-horizontal", [
				["path", {
					d: "M12 2v20",
					key: "t6zp3m"
				}],
				["path", {
					d: "M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3",
					key: "saxlbk"
				}],
				["path", {
					d: "M8 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3",
					key: "m1vog4"
				}]
			]);
			createLucideIcon("square-split-vertical", [
				["path", {
					d: "M2 12h20",
					key: "9i4pu4"
				}],
				["path", {
					d: "M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3",
					key: "14rx03"
				}],
				["path", {
					d: "M3 8V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3",
					key: "1haecz"
				}]
			]);
			createLucideIcon("square-slash", [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2",
				key: "afitv7"
			}], ["line", {
				x1: "9",
				x2: "15",
				y1: "15",
				y2: "9",
				key: "1dfufj"
			}]]);
			createLucideIcon("square-square", [["rect", {
				x: "3",
				y: "3",
				width: "18",
				height: "18",
				rx: "2",
				key: "h1oib"
			}], ["rect", {
				x: "8",
				y: "8",
				width: "8",
				height: "8",
				rx: "1",
				key: "z9xiuo"
			}]]);
			createLucideIcon("square-stack", [
				["path", {
					d: "M4 10c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2",
					key: "4i38lg"
				}],
				["path", {
					d: "M10 16c-1.1 0-2-.9-2-2v-4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2",
					key: "mlte4a"
				}],
				["rect", {
					width: "8",
					height: "8",
					x: "14",
					y: "14",
					rx: "2",
					key: "1fa9i4"
				}]
			]);
			createLucideIcon("square-star", [["path", {
				d: "M11.035 7.69a1 1 0 0 1 1.909.024l.737 1.452a1 1 0 0 0 .737.535l1.634.256a1 1 0 0 1 .588 1.806l-1.172 1.168a1 1 0 0 0-.282.866l.259 1.613a1 1 0 0 1-1.541 1.134l-1.465-.75a1 1 0 0 0-.912 0l-1.465.75a1 1 0 0 1-1.539-1.133l.258-1.613a1 1 0 0 0-.282-.866l-1.156-1.153a1 1 0 0 1 .572-1.822l1.633-.256a1 1 0 0 0 .737-.535z",
				key: "13edca"
			}], ["rect", {
				x: "3",
				y: "3",
				width: "18",
				height: "18",
				rx: "2",
				key: "h1oib"
			}]]);
			createLucideIcon("square-stop", [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2",
				key: "afitv7"
			}], ["rect", {
				x: "9",
				y: "9",
				width: "6",
				height: "6",
				rx: "1",
				key: "1ssd4o"
			}]]);
			createLucideIcon("square-terminal", [
				["path", {
					d: "m7 11 2-2-2-2",
					key: "1lz0vl"
				}],
				["path", {
					d: "M11 13h4",
					key: "1p7l4v"
				}],
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					ry: "2",
					key: "1m3agn"
				}]
			]);
			createLucideIcon("square-text", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M7 8h8",
					key: "1jbsf9"
				}],
				["path", {
					d: "M7 12h10",
					key: "b7w52i"
				}],
				["path", {
					d: "M7 16h6",
					key: "1vyc9m"
				}]
			]);
			createLucideIcon("square-user", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["circle", {
					cx: "12",
					cy: "10",
					r: "3",
					key: "ilqhr7"
				}],
				["path", {
					d: "M7 21v-2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2",
					key: "1m6ac2"
				}]
			]);
			createLucideIcon("square-user-round", [
				["path", {
					d: "M18 21a6 6 0 0 0-12 0",
					key: "kaz2du"
				}],
				["circle", {
					cx: "12",
					cy: "11",
					r: "4",
					key: "1gt34v"
				}],
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}]
			]);
			createLucideIcon("square-x", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					ry: "2",
					key: "1m3agn"
				}],
				["path", {
					d: "m15 9-6 6",
					key: "1uzhvr"
				}],
				["path", {
					d: "m9 9 6 6",
					key: "z0biqf"
				}]
			]);
			createLucideIcon("square", [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2",
				key: "afitv7"
			}]]);
			createLucideIcon("squares-exclude", [["path", {
				d: "M16 12v2a2 2 0 0 1-2 2H9a1 1 0 0 0-1 1v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h0",
				key: "1mcohs"
			}], ["path", {
				d: "M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a1 1 0 0 1-1 1h-5a2 2 0 0 0-2 2v2",
				key: "1r1efp"
			}]]);
			createLucideIcon("squares-intersect", [
				["path", {
					d: "M10 22a2 2 0 0 1-2-2",
					key: "i7yj1i"
				}],
				["path", {
					d: "M14 2a2 2 0 0 1 2 2",
					key: "170a0m"
				}],
				["path", {
					d: "M16 22h-2",
					key: "18d249"
				}],
				["path", {
					d: "M2 10V8",
					key: "7yj4fe"
				}],
				["path", {
					d: "M2 4a2 2 0 0 1 2-2",
					key: "ddgnws"
				}],
				["path", {
					d: "M20 8a2 2 0 0 1 2 2",
					key: "1770vt"
				}],
				["path", {
					d: "M22 14v2",
					key: "iot8ja"
				}],
				["path", {
					d: "M22 20a2 2 0 0 1-2 2",
					key: "qj8q6g"
				}],
				["path", {
					d: "M4 16a2 2 0 0 1-2-2",
					key: "1dnafg"
				}],
				["path", {
					d: "M8 10a2 2 0 0 1 2-2h5a1 1 0 0 1 1 1v5a2 2 0 0 1-2 2H9a1 1 0 0 1-1-1z",
					key: "ci6f0b"
				}],
				["path", {
					d: "M8 2h2",
					key: "1gmkwm"
				}]
			]);
			createLucideIcon("squares-subtract", [
				["path", {
					d: "M10 22a2 2 0 0 1-2-2",
					key: "i7yj1i"
				}],
				["path", {
					d: "M16 22h-2",
					key: "18d249"
				}],
				["path", {
					d: "M16 4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3a1 1 0 0 0 1-1v-5a2 2 0 0 1 2-2h5a1 1 0 0 0 1-1z",
					key: "1njgbb"
				}],
				["path", {
					d: "M20 8a2 2 0 0 1 2 2",
					key: "1770vt"
				}],
				["path", {
					d: "M22 14v2",
					key: "iot8ja"
				}],
				["path", {
					d: "M22 20a2 2 0 0 1-2 2",
					key: "qj8q6g"
				}]
			]);
			createLucideIcon("squares-unite", [["path", {
				d: "M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a1 1 0 0 0 1 1h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-3a1 1 0 0 0-1-1z",
				key: "17jnth"
			}]]);
			createLucideIcon("squircle-dashed", [
				["path", {
					d: "M13.77 3.043a34 34 0 0 0-3.54 0",
					key: "1oaobr"
				}],
				["path", {
					d: "M13.771 20.956a33 33 0 0 1-3.541.001",
					key: "95iq0j"
				}],
				["path", {
					d: "M20.18 17.74c-.51 1.15-1.29 1.93-2.439 2.44",
					key: "1u6qty"
				}],
				["path", {
					d: "M20.18 6.259c-.51-1.148-1.291-1.929-2.44-2.438",
					key: "1ew6g6"
				}],
				["path", {
					d: "M20.957 10.23a33 33 0 0 1 0 3.54",
					key: "1l9npr"
				}],
				["path", {
					d: "M3.043 10.23a34 34 0 0 0 .001 3.541",
					key: "1it6jm"
				}],
				["path", {
					d: "M6.26 20.179c-1.15-.508-1.93-1.29-2.44-2.438",
					key: "14uchd"
				}],
				["path", {
					d: "M6.26 3.82c-1.149.51-1.93 1.291-2.44 2.44",
					key: "8k4agb"
				}]
			]);
			createLucideIcon("squircle", [["path", {
				d: "M12 3c7.2 0 9 1.8 9 9s-1.8 9-9 9-9-1.8-9-9 1.8-9 9-9",
				key: "garfkc"
			}]]);
			createLucideIcon("stamp", [
				["path", {
					d: "M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13",
					key: "i9gjdv"
				}],
				["path", {
					d: "M20 15.5a2.5 2.5 0 0 0-2.5-2.5h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1z",
					key: "1vzg3v"
				}],
				["path", {
					d: "M5 22h14",
					key: "ehvnwv"
				}]
			]);
			createLucideIcon("star-check", [["path", {
				d: "m19.06 12.501 2.78-2.707a.53.53 0 0 0-.294-.905l-5.166-.755a2.1 2.1 0 0 1-1.595-1.16l-2.31-4.68a.53.53 0 0 0-.95.001L9.216 6.974a2.1 2.1 0 0 1-1.597 1.16l-5.165.755a.53.53 0 0 0-.294.906l3.736 3.637a2.1 2.1 0 0 1 .611 1.879l-.88 5.139a.53.53 0 0 0 .769.56l4.617-2.428.027-.014",
				key: "14g7km"
			}], ["path", {
				d: "m15 18 2 2 4-4",
				key: "1szwhi"
			}]]);
			createLucideIcon("squirrel", [
				["path", {
					d: "M15.236 22a3 3 0 0 0-2.2-5",
					key: "21bitc"
				}],
				["path", {
					d: "M16 20a3 3 0 0 1 3-3h1a2 2 0 0 0 2-2v-2a4 4 0 0 0-4-4V4",
					key: "oh0fg0"
				}],
				["path", {
					d: "M18 13h.01",
					key: "9veqaj"
				}],
				["path", {
					d: "M18 6a4 4 0 0 0-4 4 7 7 0 0 0-7 7c0-5 4-5 4-10.5a4.5 4.5 0 1 0-9 0 2.5 2.5 0 0 0 5 0C7 10 3 11 3 17c0 2.8 2.2 5 5 5h10",
					key: "980v8a"
				}]
			]);
			createLucideIcon("star-half", [["path", {
				d: "M12 18.338a2.1 2.1 0 0 0-.987.244L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16l2.309-4.679A.53.53 0 0 1 12 2",
				key: "2ksp49"
			}]]);
			createLucideIcon("star-off", [
				["path", {
					d: "m10.344 4.688 1.181-2.393a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.237 3.152",
					key: "19ctli"
				}],
				["path", {
					d: "m17.945 17.945.43 2.505a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a8 8 0 0 0 .4-.099",
					key: "ptqqvy"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}]
			]);
			createLucideIcon("star-minus", [["path", {
				d: "M15 18h6",
				key: "3b3c90"
			}], ["path", {
				d: "M17.688 14a2.1 2.1 0 0 1 .416-.568l3.736-3.638a.53.53 0 0 0-.294-.905l-5.166-.755a2.1 2.1 0 0 1-1.595-1.16l-2.31-4.68a.53.53 0 0 0-.95.001L9.216 6.974a2.1 2.1 0 0 1-1.597 1.16l-5.165.755a.53.53 0 0 0-.294.906l3.736 3.637a2.1 2.1 0 0 1 .611 1.879l-.88 5.139a.53.53 0 0 0 .769.56l4.617-2.428.027-.014",
				key: "rwo527"
			}]]);
			createLucideIcon("star-plus", [
				["path", {
					d: "M11.013 18.582 6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16l2.309-4.679a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904L20 11.5",
					key: "1hs8rk"
				}],
				["path", {
					d: "M15 18h6",
					key: "3b3c90"
				}],
				["path", {
					d: "M18 15v6",
					key: "9wciyi"
				}]
			]);
			createLucideIcon("star-x", [
				["path", {
					d: "m15.5 15.5 5 5",
					key: "1ky94l"
				}],
				["path", {
					d: "m20.063 11.525 1.777-1.731a.53.53 0 0 0-.294-.905l-5.166-.755a2.1 2.1 0 0 1-1.595-1.16l-2.31-4.68a.53.53 0 0 0-.95.001L9.216 6.974a2.1 2.1 0 0 1-1.597 1.16l-5.165.755a.53.53 0 0 0-.294.906l3.736 3.637a2.1 2.1 0 0 1 .611 1.879l-.88 5.139a.53.53 0 0 0 .769.56l4.617-2.428a2.1 2.1 0 0 1 .987-.243 2 2 0 0 1 .132.004",
					key: "6uuto3"
				}],
				["path", {
					d: "m20.5 15.5-5 5",
					key: "1w5am3"
				}]
			]);
			createLucideIcon("star", [["path", {
				d: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
				key: "r04s7s"
			}]]);
			createLucideIcon("step-back", [["path", {
				d: "M13.971 4.285A2 2 0 0 1 17 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z",
				key: "19qhus"
			}], ["path", {
				d: "M21 20V4",
				key: "cb8qj8"
			}]]);
			createLucideIcon("step-forward", [["path", {
				d: "M10.029 4.285A2 2 0 0 0 7 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z",
				key: "1ystz2"
			}], ["path", {
				d: "M3 4v16",
				key: "1ph11n"
			}]]);
			createLucideIcon("stethoscope", [
				["path", {
					d: "M11 2v2",
					key: "1539x4"
				}],
				["path", {
					d: "M5 2v2",
					key: "1yf1q8"
				}],
				["path", {
					d: "M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1",
					key: "rb5t3r"
				}],
				["path", {
					d: "M8 15a6 6 0 0 0 12 0v-3",
					key: "x18d4x"
				}],
				["circle", {
					cx: "20",
					cy: "10",
					r: "2",
					key: "ts1r5v"
				}]
			]);
			createLucideIcon("sticker", [
				["path", {
					d: "M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z",
					key: "1dfntj"
				}],
				["path", {
					d: "M15 3v5a1 1 0 0 0 1 1h5",
					key: "6s6qgf"
				}],
				["path", {
					d: "M8 13h.01",
					key: "1sbv64"
				}],
				["path", {
					d: "M16 13h.01",
					key: "wip0gl"
				}],
				["path", {
					d: "M10 16s.8 1 2 1c1.3 0 2-1 2-1",
					key: "1vvgv3"
				}]
			]);
			createLucideIcon("sticky-note-check", [
				["path", {
					d: "m15 19 2 2 4-4",
					key: "1wqv71"
				}],
				["path", {
					d: "M15 3v5a1 1 0 0 0 1 1h5",
					key: "6s6qgf"
				}],
				["path", {
					d: "M21 13V9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6.5",
					key: "1onoss"
				}]
			]);
			createLucideIcon("sticky-note-minus", [
				["path", {
					d: "M15 3v5a1 1 0 0 0 1 1h5",
					key: "6s6qgf"
				}],
				["path", {
					d: "M21 14V9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7.35",
					key: "g18rj4"
				}],
				["path", {
					d: "M21 18h-6",
					key: "139f0c"
				}]
			]);
			createLucideIcon("sticky-note-off", [
				["path", {
					d: "M15 3v5a1 1 0 0 0 1 1h5",
					key: "6s6qgf"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M3.586 3.586A2 2 0 0 0 3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 1.414-.586",
					key: "12nghy"
				}],
				["path", {
					d: "M8.656 3H15a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 21 9v6.344",
					key: "134c6x"
				}]
			]);
			createLucideIcon("sticky-note-plus", [
				["path", {
					d: "M15 3v5a1 1 0 0 0 1 1h5",
					key: "6s6qgf"
				}],
				["path", {
					d: "M18 15v6",
					key: "9wciyi"
				}],
				["path", {
					d: "M21 12.356V9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7.355",
					key: "12ish9"
				}],
				["path", {
					d: "M21 18h-6",
					key: "139f0c"
				}]
			]);
			createLucideIcon("sticky-note", [["path", {
				d: "M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z",
				key: "1dfntj"
			}], ["path", {
				d: "M15 3v5a1 1 0 0 0 1 1h5",
				key: "6s6qgf"
			}]]);
			createLucideIcon("sticky-note-x", [
				["path", {
					d: "M15 3v5a1 1 0 0 0 1 1h5",
					key: "6s6qgf"
				}],
				["path", {
					d: "m16 16 5 5",
					key: "8tpb07"
				}],
				["path", {
					d: "M21 12V9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7",
					key: "156tez"
				}],
				["path", {
					d: "m21 16-5 5",
					key: "kplof2"
				}]
			]);
			createLucideIcon("sticky-notes", [
				["path", {
					d: "M10 8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 16 14v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z",
					key: "19nc0g"
				}],
				["path", {
					d: "M10 8v5a1 1 0 0 0 1 1h5",
					key: "m3law1"
				}],
				["path", {
					d: "M8 4a2 2 0 0 1 2-2h6a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 22 8v6a2 2 0 0 1-2 2",
					key: "1iu1qd"
				}],
				["path", {
					d: "M16 2v5a1 1 0 0 0 1 1h5",
					key: "af171p"
				}]
			]);
			createLucideIcon("stone", [
				["path", {
					d: "M11.264 2.205A4 4 0 0 0 6.42 4.211l-4 8a4 4 0 0 0 1.359 5.117l6 4a4 4 0 0 0 4.438 0l6-4a4 4 0 0 0 1.576-4.592l-2-6a4 4 0 0 0-2.53-2.53z",
					key: "1si4ox"
				}],
				["path", {
					d: "M11.99 22 14 12l7.822 3.184",
					key: "1u8to0"
				}],
				["path", {
					d: "M14 12 8.47 2.302",
					key: "guo3d5"
				}]
			]);
			createLucideIcon("store", [
				["path", {
					d: "M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5",
					key: "slp6dd"
				}],
				["path", {
					d: "M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244",
					key: "o0xfot"
				}],
				["path", {
					d: "M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05",
					key: "wn3emo"
				}]
			]);
			createLucideIcon("stretch-horizontal", [["rect", {
				width: "20",
				height: "6",
				x: "2",
				y: "4",
				rx: "2",
				key: "qdearl"
			}], ["rect", {
				width: "20",
				height: "6",
				x: "2",
				y: "14",
				rx: "2",
				key: "1xrn6j"
			}]]);
			createLucideIcon("stretch-vertical", [["rect", {
				width: "6",
				height: "20",
				x: "4",
				y: "2",
				rx: "2",
				key: "19qu7m"
			}], ["rect", {
				width: "6",
				height: "20",
				x: "14",
				y: "2",
				rx: "2",
				key: "24v0nk"
			}]]);
			createLucideIcon("strikethrough", [
				["path", {
					d: "M16 4H9a3 3 0 0 0-2.83 4",
					key: "43sutm"
				}],
				["path", {
					d: "M14 12a4 4 0 0 1 0 8H6",
					key: "nlfj13"
				}],
				["line", {
					x1: "4",
					x2: "20",
					y1: "12",
					y2: "12",
					key: "1e0a9i"
				}]
			]);
			createLucideIcon("subscript", [
				["path", {
					d: "m4 5 8 8",
					key: "1eunvl"
				}],
				["path", {
					d: "m12 5-8 8",
					key: "1ah0jp"
				}],
				["path", {
					d: "M20 19h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07",
					key: "e8ta8j"
				}]
			]);
			createLucideIcon("summary", [
				["path", {
					d: "M15 4H7",
					key: "oyc4c8"
				}],
				["path", {
					d: "m18 16 3 3-3 3",
					key: "1d4glt"
				}],
				["path", {
					d: "M3 4v13a2 2 0 0 0 2 2h16",
					key: "o3n0ii"
				}],
				["path", {
					d: "M7 14h7",
					key: "16kgpy"
				}],
				["path", {
					d: "M7 9h12",
					key: "ihq7ma"
				}]
			]);
			createLucideIcon("sun-dim", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "4",
					key: "4exip2"
				}],
				["path", {
					d: "M12 4h.01",
					key: "1ujb9j"
				}],
				["path", {
					d: "M20 12h.01",
					key: "1ykeid"
				}],
				["path", {
					d: "M12 20h.01",
					key: "zekei9"
				}],
				["path", {
					d: "M4 12h.01",
					key: "158zrr"
				}],
				["path", {
					d: "M17.657 6.343h.01",
					key: "31pqzk"
				}],
				["path", {
					d: "M17.657 17.657h.01",
					key: "jehnf4"
				}],
				["path", {
					d: "M6.343 17.657h.01",
					key: "gdk6ow"
				}],
				["path", {
					d: "M6.343 6.343h.01",
					key: "1uurf0"
				}]
			]);
			createLucideIcon("sun-medium", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "4",
					key: "4exip2"
				}],
				["path", {
					d: "M12 3v1",
					key: "1asbbs"
				}],
				["path", {
					d: "M12 20v1",
					key: "1wcdkc"
				}],
				["path", {
					d: "M3 12h1",
					key: "lp3yf2"
				}],
				["path", {
					d: "M20 12h1",
					key: "1vloll"
				}],
				["path", {
					d: "m18.364 5.636-.707.707",
					key: "1hakh0"
				}],
				["path", {
					d: "m6.343 17.657-.707.707",
					key: "18m9nf"
				}],
				["path", {
					d: "m5.636 5.636.707.707",
					key: "1xv1c5"
				}],
				["path", {
					d: "m17.657 17.657.707.707",
					key: "vl76zb"
				}]
			]);
			createLucideIcon("sun-moon", [
				["path", {
					d: "M12 2v2",
					key: "tus03m"
				}],
				["path", {
					d: "M14.837 16.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715",
					key: "xlf6rm"
				}],
				["path", {
					d: "M16 12a4 4 0 0 0-4-4",
					key: "6vsxu"
				}],
				["path", {
					d: "m19 5-1.256 1.256",
					key: "1yg6a6"
				}],
				["path", {
					d: "M20 12h2",
					key: "1q8mjw"
				}]
			]);
			createLucideIcon("sun", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "4",
					key: "4exip2"
				}],
				["path", {
					d: "M12 2v2",
					key: "tus03m"
				}],
				["path", {
					d: "M12 20v2",
					key: "1lh1kg"
				}],
				["path", {
					d: "m4.93 4.93 1.41 1.41",
					key: "149t6j"
				}],
				["path", {
					d: "m17.66 17.66 1.41 1.41",
					key: "ptbguv"
				}],
				["path", {
					d: "M2 12h2",
					key: "1t8f8n"
				}],
				["path", {
					d: "M20 12h2",
					key: "1q8mjw"
				}],
				["path", {
					d: "m6.34 17.66-1.41 1.41",
					key: "1m8zz5"
				}],
				["path", {
					d: "m19.07 4.93-1.41 1.41",
					key: "1shlcs"
				}]
			]);
			createLucideIcon("sun-snow", [
				["path", {
					d: "M10 21v-1",
					key: "1u8rkd"
				}],
				["path", {
					d: "M10 4V3",
					key: "pkzwkn"
				}],
				["path", {
					d: "M10 9a3 3 0 0 0 0 6",
					key: "gv75dk"
				}],
				["path", {
					d: "m14 20 1.25-2.5L18 18",
					key: "1chtki"
				}],
				["path", {
					d: "m14 4 1.25 2.5L18 6",
					key: "1b4wsy"
				}],
				["path", {
					d: "m17 21-3-6 1.5-3H22",
					key: "o5qa3v"
				}],
				["path", {
					d: "m17 3-3 6 1.5 3",
					key: "11697g"
				}],
				["path", {
					d: "M2 12h1",
					key: "1uaihz"
				}],
				["path", {
					d: "m20 10-1.5 2 1.5 2",
					key: "1swlpi"
				}],
				["path", {
					d: "m3.64 18.36.7-.7",
					key: "105rm9"
				}],
				["path", {
					d: "m4.34 6.34-.7-.7",
					key: "d3unjp"
				}]
			]);
			createLucideIcon("sunrise", [
				["path", {
					d: "M12 2v8",
					key: "1q4o3n"
				}],
				["path", {
					d: "m4.93 10.93 1.41 1.41",
					key: "2a7f42"
				}],
				["path", {
					d: "M2 18h2",
					key: "j10viu"
				}],
				["path", {
					d: "M20 18h2",
					key: "wocana"
				}],
				["path", {
					d: "m19.07 10.93-1.41 1.41",
					key: "15zs5n"
				}],
				["path", {
					d: "M22 22H2",
					key: "19qnx5"
				}],
				["path", {
					d: "m8 6 4-4 4 4",
					key: "ybng9g"
				}],
				["path", {
					d: "M16 18a4 4 0 0 0-8 0",
					key: "1lzouq"
				}]
			]);
			createLucideIcon("sunset", [
				["path", {
					d: "M12 10V2",
					key: "16sf7g"
				}],
				["path", {
					d: "m4.93 10.93 1.41 1.41",
					key: "2a7f42"
				}],
				["path", {
					d: "M2 18h2",
					key: "j10viu"
				}],
				["path", {
					d: "M20 18h2",
					key: "wocana"
				}],
				["path", {
					d: "m19.07 10.93-1.41 1.41",
					key: "15zs5n"
				}],
				["path", {
					d: "M22 22H2",
					key: "19qnx5"
				}],
				["path", {
					d: "m16 6-4 4-4-4",
					key: "6wukr"
				}],
				["path", {
					d: "M16 18a4 4 0 0 0-8 0",
					key: "1lzouq"
				}]
			]);
			createLucideIcon("swatch-book", [
				["path", {
					d: "M11 17a4 4 0 0 1-8 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2Z",
					key: "1ldrpk"
				}],
				["path", {
					d: "M16.7 13H19a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7",
					key: "11i5po"
				}],
				["path", {
					d: "M 7 17h.01",
					key: "1euzgo"
				}],
				["path", {
					d: "m11 8 2.3-2.3a2.4 2.4 0 0 1 3.404.004L18.6 7.6a2.4 2.4 0 0 1 .026 3.434L9.9 19.8",
					key: "o2gii7"
				}]
			]);
			createLucideIcon("superscript", [
				["path", {
					d: "m4 19 8-8",
					key: "hr47gm"
				}],
				["path", {
					d: "m12 19-8-8",
					key: "1dhhmo"
				}],
				["path", {
					d: "M20 12h-4c0-1.5.442-2 1.5-2.5S20 8.334 20 7.002c0-.472-.17-.93-.484-1.29a2.105 2.105 0 0 0-2.617-.436c-.42.239-.738.614-.899 1.06",
					key: "1dfcux"
				}]
			]);
			createLucideIcon("swiss-franc", [
				["path", {
					d: "M10 21V3h8",
					key: "br2l0g"
				}],
				["path", {
					d: "M6 16h9",
					key: "2py0wn"
				}],
				["path", {
					d: "M10 9.5h7",
					key: "13dmhz"
				}]
			]);
			createLucideIcon("switch-camera", [
				["path", {
					d: "M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5",
					key: "mtk2lu"
				}],
				["path", {
					d: "M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5",
					key: "120jsl"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "3",
					key: "1v7zrd"
				}],
				["path", {
					d: "m18 22-3-3 3-3",
					key: "kgdoj7"
				}],
				["path", {
					d: "m6 2 3 3-3 3",
					key: "1fnbkv"
				}]
			]);
			createLucideIcon("sword", [
				["path", {
					d: "m11 19-6-6",
					key: "s7kpr"
				}],
				["path", {
					d: "m5 21-2-2",
					key: "1kw20b"
				}],
				["path", {
					d: "m8 16-4 4",
					key: "1oqv8h"
				}],
				["path", {
					d: "M9.5 17.5 20.414 6.586A2 2 0 0021 5.172V3h-2.172a2 2 0 00-1.414.586L6.5 14.5",
					key: "1pjndt"
				}]
			]);
			createLucideIcon("swords", [
				["path", {
					d: "m13 19 6-6",
					key: "gj6q8g"
				}],
				["path", {
					d: "M14.5 17.5 3.586 6.586A2 2 0 013 5.172V3h2.172a2 2 0 011.414.586L17.5 14.5",
					key: "uwfxh8"
				}],
				["path", {
					d: "m14.828 6.172 2.586-2.586A2 2 0 0118.828 3H21v2.172a2 2 0 01-.586 1.414l-2.586 2.586",
					key: "1f17hx"
				}],
				["path", {
					d: "m16 16 4 4",
					key: "up5ibb"
				}],
				["path", {
					d: "m19 21 2-2",
					key: "1phfkn"
				}],
				["path", {
					d: "m5 14 4 4",
					key: "1gk0qx"
				}],
				["path", {
					d: "m5 21-2-2",
					key: "1kw20b"
				}],
				["path", {
					d: "M7.5 16.5 4 20",
					key: "14nozp"
				}]
			]);
			createLucideIcon("syringe", [
				["path", {
					d: "m18 2 4 4",
					key: "22kx64"
				}],
				["path", {
					d: "m17 7 3-3",
					key: "1w1zoj"
				}],
				["path", {
					d: "M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5",
					key: "1exhtz"
				}],
				["path", {
					d: "m9 11 4 4",
					key: "rovt3i"
				}],
				["path", {
					d: "m5 19-3 3",
					key: "59f2uf"
				}],
				["path", {
					d: "m14 4 6 6",
					key: "yqp9t2"
				}]
			]);
			createLucideIcon("table-2", [["path", {
				d: "M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18",
				key: "gugj83"
			}]]);
			createLucideIcon("table-cells-merge", [
				["path", {
					d: "M12 21v-6",
					key: "lihzve"
				}],
				["path", {
					d: "M12 9V3",
					key: "da5inc"
				}],
				["path", {
					d: "M3 15h18",
					key: "5xshup"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}]
			]);
			createLucideIcon("table-cells-split", [
				["path", {
					d: "M12 15V9",
					key: "8c7uyn"
				}],
				["path", {
					d: "M3 15h18",
					key: "5xshup"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}]
			]);
			createLucideIcon("table-of-contents", [
				["path", {
					d: "M16 5H3",
					key: "m91uny"
				}],
				["path", {
					d: "M16 12H3",
					key: "1a2rj7"
				}],
				["path", {
					d: "M16 19H3",
					key: "zzsher"
				}],
				["path", {
					d: "M21 5h.01",
					key: "wa75ra"
				}],
				["path", {
					d: "M21 12h.01",
					key: "msek7k"
				}],
				["path", {
					d: "M21 19h.01",
					key: "qvbq2j"
				}]
			]);
			createLucideIcon("table-columns-split", [
				["path", {
					d: "M14 14v2",
					key: "w2a1xv"
				}],
				["path", {
					d: "M14 20v2",
					key: "1lq872"
				}],
				["path", {
					d: "M14 2v2",
					key: "6buw04"
				}],
				["path", {
					d: "M14 8v2",
					key: "i67w9a"
				}],
				["path", {
					d: "M2 15h8",
					key: "82wtch"
				}],
				["path", {
					d: "M2 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H2",
					key: "up0l64"
				}],
				["path", {
					d: "M2 9h8",
					key: "yelfik"
				}],
				["path", {
					d: "M22 15h-4",
					key: "1es58f"
				}],
				["path", {
					d: "M22 3h-2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h2",
					key: "pdjoqf"
				}],
				["path", {
					d: "M22 9h-4",
					key: "1luja7"
				}],
				["path", {
					d: "M5 3v18",
					key: "14hmio"
				}]
			]);
			createLucideIcon("table-properties", [
				["path", {
					d: "M15 3v18",
					key: "14nvp0"
				}],
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M21 9H3",
					key: "1338ky"
				}],
				["path", {
					d: "M21 15H3",
					key: "9uk58r"
				}]
			]);
			createLucideIcon("table-rows-split", [
				["path", {
					d: "M14 10h2",
					key: "1lstlu"
				}],
				["path", {
					d: "M15 22v-8",
					key: "1fwwgm"
				}],
				["path", {
					d: "M15 2v4",
					key: "1044rn"
				}],
				["path", {
					d: "M2 10h2",
					key: "1r8dkt"
				}],
				["path", {
					d: "M20 10h2",
					key: "1ug425"
				}],
				["path", {
					d: "M3 19h18",
					key: "awlh7x"
				}],
				["path", {
					d: "M3 22v-6a2 2 135 0 1 2-2h14a2 2 45 0 1 2 2v6",
					key: "ibqhof"
				}],
				["path", {
					d: "M3 2v2a2 2 45 0 0 2 2h14a2 2 135 0 0 2-2V2",
					key: "1uenja"
				}],
				["path", {
					d: "M8 10h2",
					key: "66od0"
				}],
				["path", {
					d: "M9 22v-8",
					key: "fmnu31"
				}],
				["path", {
					d: "M9 2v4",
					key: "j1yeou"
				}]
			]);
			createLucideIcon("table", [
				["path", {
					d: "M12 3v18",
					key: "108xh3"
				}],
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["path", {
					d: "M3 9h18",
					key: "1pudct"
				}],
				["path", {
					d: "M3 15h18",
					key: "5xshup"
				}]
			]);
			createLucideIcon("tablet-smartphone", [
				["rect", {
					width: "10",
					height: "14",
					x: "3",
					y: "8",
					rx: "2",
					key: "1vrsiq"
				}],
				["path", {
					d: "M5 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2.4",
					key: "1j4zmg"
				}],
				["path", {
					d: "M8 18h.01",
					key: "lrp35t"
				}]
			]);
			createLucideIcon("tablet", [["rect", {
				width: "16",
				height: "20",
				x: "4",
				y: "2",
				rx: "2",
				ry: "2",
				key: "76otgf"
			}], ["line", {
				x1: "12",
				x2: "12.01",
				y1: "18",
				y2: "18",
				key: "1dp563"
			}]]);
			createLucideIcon("tablets", [
				["circle", {
					cx: "7",
					cy: "7",
					r: "5",
					key: "x29byf"
				}],
				["circle", {
					cx: "17",
					cy: "17",
					r: "5",
					key: "1op1d2"
				}],
				["path", {
					d: "M12 17h10",
					key: "ls21zv"
				}],
				["path", {
					d: "m3.46 10.54 7.08-7.08",
					key: "1rehiu"
				}]
			]);
			createLucideIcon("tag-plus", [
				["path", {
					d: "M16 13h6",
					key: "1um0mj"
				}],
				["path", {
					d: "m16.5 6.5-3.914-3.914A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l1.79-1.79",
					key: "dp0yc9"
				}],
				["path", {
					d: "M19 10v6",
					key: "13mz7b"
				}],
				["circle", {
					cx: "7.5",
					cy: "7.5",
					r: ".5",
					fill: "currentColor",
					key: "kqv944"
				}]
			]);
			createLucideIcon("tag-x", [
				["path", {
					d: "m16.5 6.5-3.914-3.914A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.43 2.43 0 0 0 3.42 0l1.79-1.79",
					key: "hu94c9"
				}],
				["path", {
					d: "m16.5 10.5 5 5",
					key: "1jo8bf"
				}],
				["path", {
					d: "m21.5 10.5-5 5",
					key: "jzei60"
				}],
				["circle", {
					cx: "7.5",
					cy: "7.5",
					r: ".5",
					fill: "currentColor",
					key: "kqv944"
				}]
			]);
			createLucideIcon("tag", [["path", {
				d: "M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z",
				key: "vktsd0"
			}], ["circle", {
				cx: "7.5",
				cy: "7.5",
				r: ".5",
				fill: "currentColor",
				key: "kqv944"
			}]]);
			createLucideIcon("tags", [
				["path", {
					d: "M13.172 2a2 2 0 0 1 1.414.586l6.71 6.71a2.4 2.4 0 0 1 0 3.408l-4.592 4.592a2.4 2.4 0 0 1-3.408 0l-6.71-6.71A2 2 0 0 1 6 9.172V3a1 1 0 0 1 1-1z",
					key: "16rjxf"
				}],
				["path", {
					d: "M2 7v6.172a2 2 0 0 0 .586 1.414l6.71 6.71a2.4 2.4 0 0 0 3.191.193",
					key: "178nd4"
				}],
				["circle", {
					cx: "10.5",
					cy: "6.5",
					r: ".5",
					fill: "currentColor",
					key: "12ikhr"
				}]
			]);
			createLucideIcon("tally-1", [["path", {
				d: "M4 4v16",
				key: "6qkkli"
			}]]);
			createLucideIcon("tally-2", [["path", {
				d: "M4 4v16",
				key: "6qkkli"
			}], ["path", {
				d: "M9 4v16",
				key: "81ygyz"
			}]]);
			createLucideIcon("tally-3", [
				["path", {
					d: "M4 4v16",
					key: "6qkkli"
				}],
				["path", {
					d: "M9 4v16",
					key: "81ygyz"
				}],
				["path", {
					d: "M14 4v16",
					key: "12vmem"
				}]
			]);
			createLucideIcon("tally-4", [
				["path", {
					d: "M4 4v16",
					key: "6qkkli"
				}],
				["path", {
					d: "M9 4v16",
					key: "81ygyz"
				}],
				["path", {
					d: "M14 4v16",
					key: "12vmem"
				}],
				["path", {
					d: "M19 4v16",
					key: "8ij5ei"
				}]
			]);
			createLucideIcon("tally-5", [
				["path", {
					d: "M4 4v16",
					key: "6qkkli"
				}],
				["path", {
					d: "M9 4v16",
					key: "81ygyz"
				}],
				["path", {
					d: "M14 4v16",
					key: "12vmem"
				}],
				["path", {
					d: "M19 4v16",
					key: "8ij5ei"
				}],
				["path", {
					d: "M22 6 2 18",
					key: "h9moai"
				}]
			]);
			createLucideIcon("target", [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "6",
					key: "1vlfrh"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "2",
					key: "1c9p78"
				}]
			]);
			createLucideIcon("tangent", [
				["circle", {
					cx: "17",
					cy: "4",
					r: "2",
					key: "y5j2s2"
				}],
				["path", {
					d: "M15.59 5.41 5.41 15.59",
					key: "l0vprr"
				}],
				["circle", {
					cx: "4",
					cy: "17",
					r: "2",
					key: "9p4efm"
				}],
				["path", {
					d: "M12 22s-4-9-1.5-11.5S22 12 22 12",
					key: "1twk4o"
				}]
			]);
			createLucideIcon("telescope", [
				["path", {
					d: "m10.065 12.493-6.18 1.318a.934.934 0 0 1-1.108-.702l-.537-2.15a1.07 1.07 0 0 1 .691-1.265l13.504-4.44",
					key: "k4qptu"
				}],
				["path", {
					d: "m13.56 11.747 4.332-.924",
					key: "19l80z"
				}],
				["path", {
					d: "m16 21-3.105-6.21",
					key: "7oh9d"
				}],
				["path", {
					d: "M16.485 5.94a2 2 0 0 1 1.455-2.425l1.09-.272a1 1 0 0 1 1.212.727l1.515 6.06a1 1 0 0 1-.727 1.213l-1.09.272a2 2 0 0 1-2.425-1.455z",
					key: "m7xp4m"
				}],
				["path", {
					d: "m6.158 8.633 1.114 4.456",
					key: "74o979"
				}],
				["path", {
					d: "m8 21 3.105-6.21",
					key: "1fvxut"
				}],
				["circle", {
					cx: "12",
					cy: "13",
					r: "2",
					key: "1c1ljs"
				}]
			]);
			createLucideIcon("tent", [
				["path", {
					d: "M3.5 21 14 3",
					key: "1szst5"
				}],
				["path", {
					d: "M20.5 21 10 3",
					key: "1310c3"
				}],
				["path", {
					d: "M15.5 21 12 15l-3.5 6",
					key: "1ddtfw"
				}],
				["path", {
					d: "M2 21h20",
					key: "1nyx9w"
				}]
			]);
			createLucideIcon("tent-tree", [
				["circle", {
					cx: "4",
					cy: "4",
					r: "2",
					key: "bt5ra8"
				}],
				["path", {
					d: "m14 5 3-3 3 3",
					key: "1sorif"
				}],
				["path", {
					d: "m14 10 3-3 3 3",
					key: "1jyi9h"
				}],
				["path", {
					d: "M17 14V2",
					key: "8ymqnk"
				}],
				["path", {
					d: "M17 14H7l-5 8h20Z",
					key: "13ar7p"
				}],
				["path", {
					d: "M8 14v8",
					key: "1ghmqk"
				}],
				["path", {
					d: "m9 14 5 8",
					key: "13pgi6"
				}]
			]);
			const Terminal = createLucideIcon("terminal", [["path", {
				d: "M12 19h8",
				key: "baeox8"
			}], ["path", {
				d: "m4 17 6-6-6-6",
				key: "1yngyt"
			}]]);
			createLucideIcon("test-tube-diagonal", [
				["path", {
					d: "M21 7 6.82 21.18a2.83 2.83 0 0 1-3.99-.01a2.83 2.83 0 0 1 0-4L17 3",
					key: "1ub6xw"
				}],
				["path", {
					d: "m16 2 6 6",
					key: "1gw87d"
				}],
				["path", {
					d: "M12 16H4",
					key: "1cjfip"
				}]
			]);
			createLucideIcon("test-tube", [
				["path", {
					d: "M14.5 2v17.5c0 1.4-1.1 2.5-2.5 2.5c-1.4 0-2.5-1.1-2.5-2.5V2",
					key: "125lnx"
				}],
				["path", {
					d: "M8.5 2h7",
					key: "csnxdl"
				}],
				["path", {
					d: "M14.5 16h-5",
					key: "1ox875"
				}]
			]);
			createLucideIcon("test-tubes", [
				["path", {
					d: "M9 2v17.5A2.5 2.5 0 0 1 6.5 22A2.5 2.5 0 0 1 4 19.5V2",
					key: "1hjrqt"
				}],
				["path", {
					d: "M20 2v17.5a2.5 2.5 0 0 1-2.5 2.5a2.5 2.5 0 0 1-2.5-2.5V2",
					key: "16lc8n"
				}],
				["path", {
					d: "M3 2h7",
					key: "7s29d5"
				}],
				["path", {
					d: "M14 2h7",
					key: "7sicin"
				}],
				["path", {
					d: "M9 16H4",
					key: "1bfye3"
				}],
				["path", {
					d: "M20 16h-5",
					key: "ddnjpe"
				}]
			]);
			createLucideIcon("text-align-end", [
				["path", {
					d: "M21 5H3",
					key: "1fi0y6"
				}],
				["path", {
					d: "M21 12H9",
					key: "dn1m92"
				}],
				["path", {
					d: "M21 19H7",
					key: "4cu937"
				}]
			]);
			createLucideIcon("text-align-center", [
				["path", {
					d: "M21 5H3",
					key: "1fi0y6"
				}],
				["path", {
					d: "M17 12H7",
					key: "16if0g"
				}],
				["path", {
					d: "M19 19H5",
					key: "vjpgq2"
				}]
			]);
			createLucideIcon("text-align-justify", [
				["path", {
					d: "M3 5h18",
					key: "1u36vt"
				}],
				["path", {
					d: "M3 12h18",
					key: "1i2n21"
				}],
				["path", {
					d: "M3 19h18",
					key: "awlh7x"
				}]
			]);
			createLucideIcon("text-align-start", [
				["path", {
					d: "M21 5H3",
					key: "1fi0y6"
				}],
				["path", {
					d: "M15 12H3",
					key: "6jk70r"
				}],
				["path", {
					d: "M17 19H3",
					key: "z6ezky"
				}]
			]);
			createLucideIcon("text-cursor-input", [
				["path", {
					d: "M12 20h-1a2 2 0 0 1-2-2 2 2 0 0 1-2 2H6",
					key: "1528k5"
				}],
				["path", {
					d: "M13 8h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7",
					key: "13ksps"
				}],
				["path", {
					d: "M5 16H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h1",
					key: "1n9rhb"
				}],
				["path", {
					d: "M6 4h1a2 2 0 0 1 2 2 2 2 0 0 1 2-2h1",
					key: "1mj8rg"
				}],
				["path", {
					d: "M9 6v12",
					key: "velyjx"
				}]
			]);
			createLucideIcon("text-cursor", [
				["path", {
					d: "M17 22h-1a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4h1",
					key: "uvaxm9"
				}],
				["path", {
					d: "M7 22h1a4 4 0 0 0 4-4",
					key: "1l7xii"
				}],
				["path", {
					d: "M7 2h1a4 4 0 0 1 4 4",
					key: "1vrvvh"
				}]
			]);
			createLucideIcon("text-initial", [
				["path", {
					d: "M15 5h6",
					key: "1pr8yx"
				}],
				["path", {
					d: "M15 12h6",
					key: "upa0zy"
				}],
				["path", {
					d: "M3 19h18",
					key: "awlh7x"
				}],
				["path", {
					d: "m3 12 3.553-7.724a.5.5 0 0 1 .894 0L11 12",
					key: "6lvno8"
				}],
				["path", {
					d: "M3.92 10h6.16",
					key: "1tl8ex"
				}]
			]);
			createLucideIcon("text-search", [
				["path", {
					d: "M21 5H3",
					key: "1fi0y6"
				}],
				["path", {
					d: "M10 12H3",
					key: "1ulcyk"
				}],
				["path", {
					d: "M10 19H3",
					key: "108z41"
				}],
				["circle", {
					cx: "17",
					cy: "15",
					r: "3",
					key: "1upz2a"
				}],
				["path", {
					d: "m21 19-1.9-1.9",
					key: "dwi7p8"
				}]
			]);
			createLucideIcon("text-wrap", [
				["path", {
					d: "m16 16-3 3 3 3",
					key: "117b85"
				}],
				["path", {
					d: "M3 12h14.5a1 1 0 0 1 0 7H13",
					key: "18xa6z"
				}],
				["path", {
					d: "M3 19h6",
					key: "1ygdsz"
				}],
				["path", {
					d: "M3 5h18",
					key: "1u36vt"
				}]
			]);
			createLucideIcon("text-quote", [
				["path", {
					d: "M17 5H3",
					key: "1cn7zz"
				}],
				["path", {
					d: "M21 12H8",
					key: "scolzb"
				}],
				["path", {
					d: "M21 19H8",
					key: "13qgcb"
				}],
				["path", {
					d: "M3 12v7",
					key: "1ri8j3"
				}]
			]);
			createLucideIcon("theater", [
				["path", {
					d: "M2 10s3-3 3-8",
					key: "3xiif0"
				}],
				["path", {
					d: "M22 10s-3-3-3-8",
					key: "ioaa5q"
				}],
				["path", {
					d: "M10 2c0 4.4-3.6 8-8 8",
					key: "16fkpi"
				}],
				["path", {
					d: "M14 2c0 4.4 3.6 8 8 8",
					key: "b9eulq"
				}],
				["path", {
					d: "M2 10s2 2 2 5",
					key: "1au1lb"
				}],
				["path", {
					d: "M22 10s-2 2-2 5",
					key: "qi2y5e"
				}],
				["path", {
					d: "M8 15h8",
					key: "45n4r"
				}],
				["path", {
					d: "M2 22v-1a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1",
					key: "1vsc2m"
				}],
				["path", {
					d: "M14 22v-1a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1",
					key: "hrha4u"
				}]
			]);
			createLucideIcon("thermometer-snowflake", [
				["path", {
					d: "m10 20-1.25-2.5L6 18",
					key: "18frcb"
				}],
				["path", {
					d: "M10 4 8.75 6.5 6 6",
					key: "7mghy3"
				}],
				["path", {
					d: "M10.585 15H10",
					key: "4nqulp"
				}],
				["path", {
					d: "M2 12h6.5L10 9",
					key: "kv9z4n"
				}],
				["path", {
					d: "M20 14.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z",
					key: "yu0u2z"
				}],
				["path", {
					d: "m4 10 1.5 2L4 14",
					key: "k9enpj"
				}],
				["path", {
					d: "m7 21 3-6-1.5-3",
					key: "j8hb9u"
				}],
				["path", {
					d: "m7 3 3 6h2",
					key: "1bbqgq"
				}]
			]);
			createLucideIcon("thermometer-sun", [
				["path", {
					d: "M12 2v2",
					key: "tus03m"
				}],
				["path", {
					d: "M12 8a4 4 0 0 0-1.645 7.647",
					key: "wz5p04"
				}],
				["path", {
					d: "M2 12h2",
					key: "1t8f8n"
				}],
				["path", {
					d: "M20 14.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z",
					key: "yu0u2z"
				}],
				["path", {
					d: "m4.93 4.93 1.41 1.41",
					key: "149t6j"
				}],
				["path", {
					d: "m6.34 17.66-1.41 1.41",
					key: "1m8zz5"
				}]
			]);
			createLucideIcon("thermometer", [["path", {
				d: "M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z",
				key: "17jzev"
			}]]);
			createLucideIcon("thumbs-down", [["path", {
				d: "M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z",
				key: "m61m77"
			}], ["path", {
				d: "M17 14V2",
				key: "8ymqnk"
			}]]);
			createLucideIcon("thumbs-up", [["path", {
				d: "M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z",
				key: "emmmcr"
			}], ["path", {
				d: "M7 10v12",
				key: "1qc93n"
			}]]);
			createLucideIcon("ticket-check", [["path", {
				d: "M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z",
				key: "qn84l0"
			}], ["path", {
				d: "m9 12 2 2 4-4",
				key: "dzmm74"
			}]]);
			createLucideIcon("ticket-minus", [["path", {
				d: "M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z",
				key: "qn84l0"
			}], ["path", {
				d: "M9 12h6",
				key: "1c52cq"
			}]]);
			createLucideIcon("ticket-percent", [
				["path", {
					d: "M2 9a3 3 0 1 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 1 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z",
					key: "1l48ns"
				}],
				["path", {
					d: "M9 9h.01",
					key: "1q5me6"
				}],
				["path", {
					d: "m15 9-6 6",
					key: "1uzhvr"
				}],
				["path", {
					d: "M15 15h.01",
					key: "lqbp3k"
				}]
			]);
			createLucideIcon("ticket-plus", [
				["path", {
					d: "M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z",
					key: "qn84l0"
				}],
				["path", {
					d: "M9 12h6",
					key: "1c52cq"
				}],
				["path", {
					d: "M12 9v6",
					key: "199k2o"
				}]
			]);
			createLucideIcon("ticket-x", [
				["path", {
					d: "M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z",
					key: "qn84l0"
				}],
				["path", {
					d: "m9.5 14.5 5-5",
					key: "qviqfa"
				}],
				["path", {
					d: "m9.5 9.5 5 5",
					key: "18nt4w"
				}]
			]);
			createLucideIcon("ticket-slash", [["path", {
				d: "M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z",
				key: "qn84l0"
			}], ["path", {
				d: "m9.5 14.5 5-5",
				key: "qviqfa"
			}]]);
			createLucideIcon("ticket", [
				["path", {
					d: "M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z",
					key: "qn84l0"
				}],
				["path", {
					d: "M13 5v2",
					key: "dyzc3o"
				}],
				["path", {
					d: "M13 17v2",
					key: "1ont0d"
				}],
				["path", {
					d: "M13 11v2",
					key: "1wjjxi"
				}]
			]);
			createLucideIcon("tickets", [
				["path", {
					d: "m3.173 8.18 11-5a2 2 0 0 1 2.647.993L18.56 8",
					key: "15hfpj"
				}],
				["path", {
					d: "M6 10V8",
					key: "1y41hn"
				}],
				["path", {
					d: "M6 14v1",
					key: "cao2tf"
				}],
				["path", {
					d: "M6 19v2",
					key: "1loha6"
				}],
				["rect", {
					x: "2",
					y: "8",
					width: "20",
					height: "13",
					rx: "2",
					key: "p3bz5l"
				}]
			]);
			createLucideIcon("tickets-plane", [
				["path", {
					d: "M10.5 17h1.227a2 2 0 0 0 1.345-.52L18 12",
					key: "16muxl"
				}],
				["path", {
					d: "m12 13.5 3.794.506",
					key: "6v5z87"
				}],
				["path", {
					d: "m3.173 8.18 11-5a2 2 0 0 1 2.647.993L18.56 8",
					key: "15hfpj"
				}],
				["path", {
					d: "M6 10V8",
					key: "1y41hn"
				}],
				["path", {
					d: "M6 14v1",
					key: "cao2tf"
				}],
				["path", {
					d: "M6 19v2",
					key: "1loha6"
				}],
				["rect", {
					x: "2",
					y: "8",
					width: "20",
					height: "13",
					rx: "2",
					key: "p3bz5l"
				}]
			]);
			createLucideIcon("timeline", [
				["path", {
					d: "M4 12h.01",
					key: "158zrr"
				}],
				["path", {
					d: "M4 16h.01",
					key: "jrnfb7"
				}],
				["path", {
					d: "M4 20h.01",
					key: "orx0iu"
				}],
				["path", {
					d: "M4 4h.01",
					key: "cieki8"
				}],
				["path", {
					d: "M4 8h.01",
					key: "43g258"
				}],
				["path", {
					d: "M9.414 13.414a2 2 0 0 0 1.414.586H19a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-8.172a2 2 0 0 0-1.414.586L8 12z",
					key: "1pvxkf"
				}],
				["path", {
					d: "M9.414 21.414a2 2 0 0 0 1.414.586H19a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-8.172a2 2 0 0 0-1.414.586L8 20z",
					key: "1k13gh"
				}],
				["path", {
					d: "M9.414 5.414A2 2 0 0 0 10.828 6H19a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1h-8.172a2 2 0 0 0-1.414.586L8 4z",
					key: "12x0hd"
				}]
			]);
			createLucideIcon("timer-off", [
				["path", {
					d: "M10 2h4",
					key: "n1abiw"
				}],
				["path", {
					d: "M4.6 11a8 8 0 0 0 1.7 8.7 8 8 0 0 0 8.7 1.7",
					key: "10he05"
				}],
				["path", {
					d: "M7.4 7.4a8 8 0 0 1 10.3 1 8 8 0 0 1 .9 10.2",
					key: "15f7sh"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M12 12v-2",
					key: "fwoke6"
				}]
			]);
			createLucideIcon("timer-reset", [
				["path", {
					d: "M10 2h4",
					key: "n1abiw"
				}],
				["path", {
					d: "M12 14v-4",
					key: "1evpnu"
				}],
				["path", {
					d: "M4 13a8 8 0 0 1 8-7 8 8 0 1 1-5.3 14L4 17.6",
					key: "1ts96g"
				}],
				["path", {
					d: "M9 17H4v5",
					key: "8t5av"
				}]
			]);
			createLucideIcon("timer", [
				["line", {
					x1: "10",
					x2: "14",
					y1: "2",
					y2: "2",
					key: "14vaq8"
				}],
				["line", {
					x1: "12",
					x2: "15",
					y1: "14",
					y2: "11",
					key: "17fdiu"
				}],
				["circle", {
					cx: "12",
					cy: "14",
					r: "8",
					key: "1e1u0o"
				}]
			]);
			createLucideIcon("toggle-left", [["circle", {
				cx: "9",
				cy: "12",
				r: "3",
				key: "u3jwor"
			}], ["rect", {
				width: "20",
				height: "14",
				x: "2",
				y: "5",
				rx: "7",
				key: "g7kal2"
			}]]);
			createLucideIcon("toggle-right", [["circle", {
				cx: "15",
				cy: "12",
				r: "3",
				key: "1afu0r"
			}], ["rect", {
				width: "20",
				height: "14",
				x: "2",
				y: "5",
				rx: "7",
				key: "g7kal2"
			}]]);
			createLucideIcon("toilet", [["path", {
				d: "M7 12h13a1 1 0 0 1 1 1 5 5 0 0 1-5 5h-.598a.5.5 0 0 0-.424.765l1.544 2.47a.5.5 0 0 1-.424.765H5.402a.5.5 0 0 1-.424-.765L7 18",
				key: "kc4kqr"
			}], ["path", {
				d: "M8 18a5 5 0 0 1-5-5V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8",
				key: "1tqs57"
			}]]);
			createLucideIcon("tool-case", [
				["path", {
					d: "M10 15h4",
					key: "192ueg"
				}],
				["path", {
					d: "m14.817 10.995-.971-1.45 1.034-1.232a2 2 0 0 0-2.025-3.238l-1.82.364L9.91 3.885a2 2 0 0 0-3.625.748L6.141 6.55l-1.725.426a2 2 0 0 0-.19 3.756l.657.27",
					key: "xbnumr"
				}],
				["path", {
					d: "m18.822 10.995 2.26-5.38a1 1 0 0 0-.557-1.318L16.954 2.9a1 1 0 0 0-1.281.533l-.924 2.122",
					key: "eaw7gc"
				}],
				["path", {
					d: "M4 12.006A1 1 0 0 1 4.994 11H19a1 1 0 0 1 1 1v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z",
					key: "1vaooh"
				}]
			]);
			createLucideIcon("toolbox", [
				["path", {
					d: "M16 12v4",
					key: "vf1vip"
				}],
				["path", {
					d: "M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2",
					key: "llnzfg"
				}],
				["path", {
					d: "M17 6a2 2 0 011.414.586l3 3A2 2 0 0122 11v8a2 2 0 01-2 2H4a2 2 0 01-2-2v-8a2 2 0 01.586-1.414l3-3A2 2 0 017 6z",
					key: "1hprxj"
				}],
				["path", {
					d: "M2 14h20",
					key: "myj16y"
				}],
				["path", {
					d: "M8 12v4",
					key: "1w4uao"
				}]
			]);
			createLucideIcon("tornado", [
				["path", {
					d: "M21 4H3",
					key: "1hwok0"
				}],
				["path", {
					d: "M18 8H6",
					key: "41n648"
				}],
				["path", {
					d: "M19 12H9",
					key: "1g4lpz"
				}],
				["path", {
					d: "M16 16h-6",
					key: "1j5d54"
				}],
				["path", {
					d: "M11 20H9",
					key: "39obr8"
				}]
			]);
			createLucideIcon("torus", [["ellipse", {
				cx: "12",
				cy: "11",
				rx: "3",
				ry: "2",
				key: "1b2qxu"
			}], ["ellipse", {
				cx: "12",
				cy: "12.5",
				rx: "10",
				ry: "8.5",
				key: "h8emeu"
			}]]);
			createLucideIcon("touchpad", [
				["rect", {
					width: "20",
					height: "16",
					x: "2",
					y: "4",
					rx: "2",
					key: "18n3k1"
				}],
				["path", {
					d: "M2 14h20",
					key: "myj16y"
				}],
				["path", {
					d: "M12 20v-6",
					key: "1rm09r"
				}]
			]);
			createLucideIcon("touchpad-off", [
				["path", {
					d: "M12 20v-6",
					key: "1rm09r"
				}],
				["path", {
					d: "M19.656 14H22",
					key: "170xzr"
				}],
				["path", {
					d: "M2 14h12",
					key: "d8icqz"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2",
					key: "s23sx2"
				}],
				["path", {
					d: "M9.656 4H20a2 2 0 0 1 2 2v10.344",
					key: "ovjcvl"
				}]
			]);
			createLucideIcon("towel-rack", [
				["path", {
					d: "M22 7h-2",
					key: "1okbx2"
				}],
				["path", {
					d: "M6.5 3h11A2.5 2.5 0 0 1 20 5.5V20a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V5.5a1 1 0 0 0-5 0V17a1 1 0 0 0 1 1h4",
					key: "kc32tg"
				}],
				["path", {
					d: "M9 7H2",
					key: "ahf7b7"
				}]
			]);
			createLucideIcon("tower-control", [
				["path", {
					d: "M18.2 12.27 20 6H4l1.8 6.27a1 1 0 0 0 .95.73h10.5a1 1 0 0 0 .96-.73Z",
					key: "1pledb"
				}],
				["path", {
					d: "M8 13v9",
					key: "hmv0ci"
				}],
				["path", {
					d: "M16 22v-9",
					key: "ylnf1u"
				}],
				["path", {
					d: "m9 6 1 7",
					key: "dpdgam"
				}],
				["path", {
					d: "m15 6-1 7",
					key: "ls7zgu"
				}],
				["path", {
					d: "M12 6V2",
					key: "1pj48d"
				}],
				["path", {
					d: "M13 2h-2",
					key: "mj6ths"
				}]
			]);
			createLucideIcon("toy-brick", [
				["rect", {
					width: "18",
					height: "12",
					x: "3",
					y: "8",
					rx: "1",
					key: "158fvp"
				}],
				["path", {
					d: "M10 8V5c0-.6-.4-1-1-1H6a1 1 0 0 0-1 1v3",
					key: "s0042v"
				}],
				["path", {
					d: "M19 8V5c0-.6-.4-1-1-1h-3a1 1 0 0 0-1 1v3",
					key: "9wmeh2"
				}]
			]);
			createLucideIcon("traffic-cone", [
				["path", {
					d: "M16.05 10.966a5 2.5 0 0 1-8.1 0",
					key: "m5jpwb"
				}],
				["path", {
					d: "m16.923 14.049 4.48 2.04a1 1 0 0 1 .001 1.831l-8.574 3.9a2 2 0 0 1-1.66 0l-8.574-3.91a1 1 0 0 1 0-1.83l4.484-2.04",
					key: "rbg3g8"
				}],
				["path", {
					d: "M16.949 14.14a5 2.5 0 1 1-9.9 0L10.063 3.5a2 2 0 0 1 3.874 0z",
					key: "vap8c8"
				}],
				["path", {
					d: "M9.194 6.57a5 2.5 0 0 0 5.61 0",
					key: "15hn5c"
				}]
			]);
			createLucideIcon("tractor", [
				["path", {
					d: "m10 11 11 .9a1 1 0 0 1 .8 1.1l-.665 4.158a1 1 0 0 1-.988.842H20",
					key: "she1j9"
				}],
				["path", {
					d: "M16 18h-5",
					key: "bq60fd"
				}],
				["path", {
					d: "M18 5a1 1 0 0 0-1 1v5.573",
					key: "1kv8ia"
				}],
				["path", {
					d: "M3 4h8.129a1 1 0 0 1 .99.863L13 11.246",
					key: "1q1ert"
				}],
				["path", {
					d: "M4 11V4",
					key: "9ft8pt"
				}],
				["path", {
					d: "M7 15h.01",
					key: "k5ht0j"
				}],
				["path", {
					d: "M8 10.1V4",
					key: "1jgyzo"
				}],
				["circle", {
					cx: "18",
					cy: "18",
					r: "2",
					key: "1emm8v"
				}],
				["circle", {
					cx: "7",
					cy: "15",
					r: "5",
					key: "ddtuc"
				}]
			]);
			createLucideIcon("trailer", [
				["path", {
					d: "M10 11.341V10",
					key: "1vu6ku"
				}],
				["path", {
					d: "M14 13v-3",
					key: "ywspeg"
				}],
				["path", {
					d: "M18 17V8a2 2 0 00-2-2H4a2 2 0 00-2 2v7a2 2 0 002 2h2",
					key: "19481b"
				}],
				["path", {
					d: "M22 15v1a1 1 0 01-1 1H10",
					key: "1lvljf"
				}],
				["path", {
					d: "M6 11.341V10",
					key: "1dkezj"
				}],
				["circle", {
					cx: "8",
					cy: "17",
					r: "2",
					key: "5kbc0u"
				}]
			]);
			createLucideIcon("train-front-tunnel", [
				["path", {
					d: "M2 22V12a10 10 0 1 1 20 0v10",
					key: "o0fyp0"
				}],
				["path", {
					d: "M15 6.8v1.4a3 2.8 0 1 1-6 0V6.8",
					key: "m8q3n9"
				}],
				["path", {
					d: "M10 15h.01",
					key: "44in9x"
				}],
				["path", {
					d: "M14 15h.01",
					key: "5mohn5"
				}],
				["path", {
					d: "M10 19a4 4 0 0 1-4-4v-3a6 6 0 1 1 12 0v3a4 4 0 0 1-4 4Z",
					key: "hckbmu"
				}],
				["path", {
					d: "m9 19-2 3",
					key: "iij7hm"
				}],
				["path", {
					d: "m15 19 2 3",
					key: "npx8sa"
				}]
			]);
			createLucideIcon("train-front", [
				["path", {
					d: "M8 3.1V7a4 4 0 0 0 8 0V3.1",
					key: "1v71zp"
				}],
				["path", {
					d: "m9 15-1-1",
					key: "1yrq24"
				}],
				["path", {
					d: "m15 15 1-1",
					key: "1t0d6s"
				}],
				["path", {
					d: "M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z",
					key: "1p0hjs"
				}],
				["path", {
					d: "m8 19-2 3",
					key: "13i0xs"
				}],
				["path", {
					d: "m16 19 2 3",
					key: "xo31yx"
				}]
			]);
			createLucideIcon("train-track", [
				["path", {
					d: "M2 17 17 2",
					key: "18b09t"
				}],
				["path", {
					d: "m2 14 8 8",
					key: "1gv9hu"
				}],
				["path", {
					d: "m5 11 8 8",
					key: "189pqp"
				}],
				["path", {
					d: "m8 8 8 8",
					key: "1imecy"
				}],
				["path", {
					d: "m11 5 8 8",
					key: "ummqn6"
				}],
				["path", {
					d: "m14 2 8 8",
					key: "1vk7dn"
				}],
				["path", {
					d: "M7 22 22 7",
					key: "15mb1i"
				}]
			]);
			createLucideIcon("tram-front", [
				["rect", {
					width: "16",
					height: "16",
					x: "4",
					y: "3",
					rx: "2",
					key: "1wxw4b"
				}],
				["path", {
					d: "M4 11h16",
					key: "mpoxn0"
				}],
				["path", {
					d: "M12 3v8",
					key: "1h2ygw"
				}],
				["path", {
					d: "m8 19-2 3",
					key: "13i0xs"
				}],
				["path", {
					d: "m18 22-2-3",
					key: "1p0ohu"
				}],
				["path", {
					d: "M8 15h.01",
					key: "a7atzg"
				}],
				["path", {
					d: "M16 15h.01",
					key: "rnfrdf"
				}]
			]);
			createLucideIcon("transgender", [
				["path", {
					d: "M12 16v6",
					key: "c8a4gj"
				}],
				["path", {
					d: "M14 20h-4",
					key: "m8m19d"
				}],
				["path", {
					d: "M18 2h4v4",
					key: "1341mj"
				}],
				["path", {
					d: "m2 2 7.17 7.17",
					key: "13q8l2"
				}],
				["path", {
					d: "M2 5.355V2h3.357",
					key: "18136r"
				}],
				["path", {
					d: "m22 2-7.17 7.17",
					key: "1epvy4"
				}],
				["path", {
					d: "M8 5 5 8",
					key: "mgbjhz"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "4",
					key: "4exip2"
				}]
			]);
			createLucideIcon("trash-2", [
				["path", {
					d: "M10 11v6",
					key: "nco0om"
				}],
				["path", {
					d: "M14 11v6",
					key: "outv1u"
				}],
				["path", {
					d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
					key: "miytrc"
				}],
				["path", {
					d: "M3 6h18",
					key: "d0wm0j"
				}],
				["path", {
					d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
					key: "e791ji"
				}]
			]);
			createLucideIcon("trash", [
				["path", {
					d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
					key: "miytrc"
				}],
				["path", {
					d: "M3 6h18",
					key: "d0wm0j"
				}],
				["path", {
					d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
					key: "e791ji"
				}]
			]);
			createLucideIcon("tree-deciduous", [["path", {
				d: "M8 19a4 4 0 0 1-2.24-7.32A3.5 3.5 0 0 1 9 6.03V6a3 3 0 1 1 6 0v.04a3.5 3.5 0 0 1 3.24 5.65A4 4 0 0 1 16 19Z",
				key: "oadzkq"
			}], ["path", {
				d: "M12 19v3",
				key: "npa21l"
			}]]);
			createLucideIcon("tree-palm", [
				["path", {
					d: "M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4",
					key: "foxbe7"
				}],
				["path", {
					d: "M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3",
					key: "18arnh"
				}],
				["path", {
					d: "M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35",
					key: "ywahnh"
				}],
				["path", {
					d: "M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14",
					key: "ft0feo"
				}]
			]);
			createLucideIcon("tree-pine", [["path", {
				d: "m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z",
				key: "cpyugq"
			}], ["path", {
				d: "M12 22v-3",
				key: "kmzjlo"
			}]]);
			createLucideIcon("trees", [
				["path", {
					d: "M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z",
					key: "1l6gj6"
				}],
				["path", {
					d: "M7 16v6",
					key: "1a82de"
				}],
				["path", {
					d: "M13 19v3",
					key: "13sx9i"
				}],
				["path", {
					d: "M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5",
					key: "1sj9kv"
				}]
			]);
			createLucideIcon("trending-down", [["path", {
				d: "M16 17h6v-6",
				key: "t6n2it"
			}], ["path", {
				d: "m22 17-8.5-8.5-5 5L2 7",
				key: "x473p"
			}]]);
			createLucideIcon("trending-up", [["path", {
				d: "M16 7h6v6",
				key: "box55l"
			}], ["path", {
				d: "m22 7-8.5 8.5-5-5L2 17",
				key: "1t1m79"
			}]]);
			createLucideIcon("trending-up-down", [
				["path", {
					d: "M14.828 14.828 21 21",
					key: "ar5fw7"
				}],
				["path", {
					d: "M21 16v5h-5",
					key: "1ck2sf"
				}],
				["path", {
					d: "m21 3-9 9-4-4-6 6",
					key: "1h02xo"
				}],
				["path", {
					d: "M21 8V3h-5",
					key: "1qoq8a"
				}]
			]);
			const TriangleAlert = createLucideIcon("triangle-alert", [
				["path", {
					d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
					key: "wmoenq"
				}],
				["path", {
					d: "M12 9v4",
					key: "juzpu7"
				}],
				["path", {
					d: "M12 17h.01",
					key: "p32p05"
				}]
			]);
			createLucideIcon("triangle-dashed", [
				["path", {
					d: "M10.17 4.193a2 2 0 0 1 3.666.013",
					key: "pltmmw"
				}],
				["path", {
					d: "M14 21h2",
					key: "v4qezv"
				}],
				["path", {
					d: "m15.874 7.743 1 1.732",
					key: "10m0iw"
				}],
				["path", {
					d: "m18.849 12.952 1 1.732",
					key: "zadnam"
				}],
				["path", {
					d: "M21.824 18.18a2 2 0 0 1-1.835 2.824",
					key: "fvwuk4"
				}],
				["path", {
					d: "M4.024 21a2 2 0 0 1-1.839-2.839",
					key: "1e1kah"
				}],
				["path", {
					d: "m5.136 12.952-1 1.732",
					key: "1u4ldi"
				}],
				["path", {
					d: "M8 21h2",
					key: "i9zjee"
				}],
				["path", {
					d: "m8.102 7.743-1 1.732",
					key: "1zzo4u"
				}]
			]);
			createLucideIcon("triangle-right", [["path", {
				d: "M22 18a2 2 0 0 1-2 2H3c-1.1 0-1.3-.6-.4-1.3L20.4 4.3c.9-.7 1.6-.4 1.6.7Z",
				key: "183wce"
			}]]);
			createLucideIcon("triangle", [["path", {
				d: "M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z",
				key: "14u9p9"
			}]]);
			createLucideIcon("trophy", [
				["path", {
					d: "M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2",
					key: "pwuv1l"
				}],
				["path", {
					d: "M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2",
					key: "1y54w1"
				}],
				["path", {
					d: "M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3",
					key: "e30mpu"
				}],
				["path", {
					d: "M4 22h16",
					key: "57wxv0"
				}],
				["path", {
					d: "M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z",
					key: "1mhfuq"
				}],
				["path", {
					d: "M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3",
					key: "i0yafy"
				}]
			]);
			createLucideIcon("truck-electric", [
				["path", {
					d: "M14 19V7a2 2 0 0 0-2-2H9",
					key: "15peso"
				}],
				["path", {
					d: "M15 19H9",
					key: "18q6dt"
				}],
				["path", {
					d: "M19 19h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62L18.3 9.38a1 1 0 0 0-.78-.38H14",
					key: "1dkp3j"
				}],
				["path", {
					d: "M2 13v5a1 1 0 0 0 1 1h2",
					key: "pkmmzz"
				}],
				["path", {
					d: "M4 3 2.15 5.15a.495.495 0 0 0 .35.86h2.15a.47.47 0 0 1 .35.86L3 9.02",
					key: "1n26pd"
				}],
				["circle", {
					cx: "17",
					cy: "19",
					r: "2",
					key: "1nxcgd"
				}],
				["circle", {
					cx: "7",
					cy: "19",
					r: "2",
					key: "gzo7y7"
				}]
			]);
			createLucideIcon("truck", [
				["path", {
					d: "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2",
					key: "wrbu53"
				}],
				["path", {
					d: "M15 18H9",
					key: "1lyqi6"
				}],
				["path", {
					d: "M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14",
					key: "lysw3i"
				}],
				["circle", {
					cx: "17",
					cy: "18",
					r: "2",
					key: "332jqn"
				}],
				["circle", {
					cx: "7",
					cy: "18",
					r: "2",
					key: "19iecd"
				}]
			]);
			createLucideIcon("turkish-lira", [
				["path", {
					d: "M15 4 5 9",
					key: "14bkc9"
				}],
				["path", {
					d: "m15 8.5-10 5",
					key: "1grtsx"
				}],
				["path", {
					d: "M18 12a9 9 0 0 1-9 9V3",
					key: "1sst7f"
				}]
			]);
			createLucideIcon("turntable", [
				["path", {
					d: "M10 12.01h.01",
					key: "7rp0yl"
				}],
				["path", {
					d: "M18 8v4a8 8 0 0 1-1.07 4",
					key: "1st48v"
				}],
				["circle", {
					cx: "10",
					cy: "12",
					r: "4",
					key: "19levz"
				}],
				["rect", {
					x: "2",
					y: "4",
					width: "20",
					height: "16",
					rx: "2",
					key: "izxlao"
				}]
			]);
			createLucideIcon("turtle", [
				["path", {
					d: "m12 10 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a8 8 0 1 0-16 0v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3l2-4h4Z",
					key: "1lbbv7"
				}],
				["path", {
					d: "M4.82 7.9 8 10",
					key: "m9wose"
				}],
				["path", {
					d: "M15.18 7.9 12 10",
					key: "p8dp2u"
				}],
				["path", {
					d: "M16.93 10H20a2 2 0 0 1 0 4H2",
					key: "12nsm7"
				}]
			]);
			createLucideIcon("tv-minimal-play", [
				["path", {
					d: "M15.033 9.44a.647.647 0 0 1 0 1.12l-4.065 2.352a.645.645 0 0 1-.968-.56V7.648a.645.645 0 0 1 .967-.56z",
					key: "vbtd3f"
				}],
				["path", {
					d: "M7 21h10",
					key: "1b0cd5"
				}],
				["rect", {
					width: "20",
					height: "14",
					x: "2",
					y: "3",
					rx: "2",
					key: "48i651"
				}]
			]);
			createLucideIcon("tv-minimal", [["path", {
				d: "M7 21h10",
				key: "1b0cd5"
			}], ["rect", {
				width: "20",
				height: "14",
				x: "2",
				y: "3",
				rx: "2",
				key: "48i651"
			}]]);
			createLucideIcon("tv", [["path", {
				d: "m17 2-5 5-5-5",
				key: "16satq"
			}], ["rect", {
				width: "20",
				height: "15",
				x: "2",
				y: "7",
				rx: "2",
				key: "1e6viu"
			}]]);
			createLucideIcon("type-outline", [["path", {
				d: "M14 16.5a.5.5 0 0 0 .5.5h.5a2 2 0 0 1 0 4H9a2 2 0 0 1 0-4h.5a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5V8a2 2 0 0 1-4 0V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-4 0v-.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5Z",
				key: "1reda3"
			}]]);
			createLucideIcon("type", [
				["path", {
					d: "M12 4v16",
					key: "1654pz"
				}],
				["path", {
					d: "M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2",
					key: "e0r10z"
				}],
				["path", {
					d: "M9 20h6",
					key: "s66wpe"
				}]
			]);
			createLucideIcon("umbrella-off", [
				["path", {
					d: "M12 13v7a2 2 0 0 0 4 0",
					key: "rpgb42"
				}],
				["path", {
					d: "M12 2v2",
					key: "tus03m"
				}],
				["path", {
					d: "M18.656 13h2.336a1 1 0 0 0 .97-1.274 10.284 10.284 0 0 0-12.07-7.51",
					key: "yawknk"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M5.961 5.957a10.28 10.28 0 0 0-3.922 5.769A1 1 0 0 0 3 13h10",
					key: "5sfalc"
				}]
			]);
			createLucideIcon("umbrella", [
				["path", {
					d: "M12 13v7a2 2 0 0 0 4 0",
					key: "rpgb42"
				}],
				["path", {
					d: "M12 2v2",
					key: "tus03m"
				}],
				["path", {
					d: "M20.992 13a1 1 0 0 0 .97-1.274 10.284 10.284 0 0 0-19.923 0A1 1 0 0 0 3 13z",
					key: "124nyo"
				}]
			]);
			createLucideIcon("underline", [["path", {
				d: "M6 4v6a6 6 0 0 0 12 0V4",
				key: "9kb039"
			}], ["line", {
				x1: "4",
				x2: "20",
				y1: "20",
				y2: "20",
				key: "nun2al"
			}]]);
			createLucideIcon("undo-2", [["path", {
				d: "M9 14 4 9l5-5",
				key: "102s5s"
			}], ["path", {
				d: "M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11",
				key: "f3b9sd"
			}]]);
			createLucideIcon("undo-dot", [
				["path", {
					d: "M21 17a9 9 0 0 0-15-6.7L3 13",
					key: "8mp6z9"
				}],
				["path", {
					d: "M3 7v6h6",
					key: "1v2h90"
				}],
				["circle", {
					cx: "12",
					cy: "17",
					r: "1",
					key: "1ixnty"
				}]
			]);
			createLucideIcon("undo", [["path", {
				d: "M3 7v6h6",
				key: "1v2h90"
			}], ["path", {
				d: "M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13",
				key: "1r6uu6"
			}]]);
			createLucideIcon("unfold-horizontal", [
				["path", {
					d: "M16 12h6",
					key: "15xry1"
				}],
				["path", {
					d: "M8 12H2",
					key: "1jqql6"
				}],
				["path", {
					d: "M12 2v2",
					key: "tus03m"
				}],
				["path", {
					d: "M12 8v2",
					key: "1woqiv"
				}],
				["path", {
					d: "M12 14v2",
					key: "8jcxud"
				}],
				["path", {
					d: "M12 20v2",
					key: "1lh1kg"
				}],
				["path", {
					d: "m19 15 3-3-3-3",
					key: "wjy7rq"
				}],
				["path", {
					d: "m5 9-3 3 3 3",
					key: "j64kie"
				}]
			]);
			createLucideIcon("unfold-vertical", [
				["path", {
					d: "M12 22v-6",
					key: "6o8u61"
				}],
				["path", {
					d: "M12 8V2",
					key: "1wkif3"
				}],
				["path", {
					d: "M4 12H2",
					key: "rhcxmi"
				}],
				["path", {
					d: "M10 12H8",
					key: "s88cx1"
				}],
				["path", {
					d: "M16 12h-2",
					key: "10asgb"
				}],
				["path", {
					d: "M22 12h-2",
					key: "14jgyd"
				}],
				["path", {
					d: "m15 19-3 3-3-3",
					key: "11eu04"
				}],
				["path", {
					d: "m15 5-3-3-3 3",
					key: "itvq4r"
				}]
			]);
			createLucideIcon("university", [
				["path", {
					d: "M14 21v-3a2 2 0 0 0-4 0v3",
					key: "1rgiei"
				}],
				["path", {
					d: "M18 12h.01",
					key: "yjnet6"
				}],
				["path", {
					d: "M18 16h.01",
					key: "plv8zi"
				}],
				["path", {
					d: "M22 7a1 1 0 0 0-1-1h-2a2 2 0 0 1-1.143-.359L13.143 2.36a2 2 0 0 0-2.286-.001L6.143 5.64A2 2 0 0 1 5 6H3a1 1 0 0 0-1 1v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z",
					key: "1ogmi3"
				}],
				["path", {
					d: "M6 12h.01",
					key: "c2rlol"
				}],
				["path", {
					d: "M6 16h.01",
					key: "1pmjb7"
				}],
				["circle", {
					cx: "12",
					cy: "10",
					r: "2",
					key: "1yojzk"
				}]
			]);
			createLucideIcon("ungroup", [["rect", {
				x: "11",
				y: "14",
				width: "10",
				height: "7",
				rx: "2",
				key: "nfm8rk"
			}], ["rect", {
				x: "3",
				y: "3",
				width: "10",
				height: "7",
				rx: "2",
				key: "1ljebb"
			}]]);
			createLucideIcon("unlink-2", [["path", {
				d: "M15 7h2a5 5 0 0 1 0 10h-2m-6 0H7A5 5 0 0 1 7 7h2",
				key: "1re2ne"
			}]]);
			createLucideIcon("unlink", [
				["path", {
					d: "m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71",
					key: "yqzxt4"
				}],
				["path", {
					d: "m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71",
					key: "4qinb0"
				}],
				["line", {
					x1: "8",
					x2: "8",
					y1: "2",
					y2: "5",
					key: "1041cp"
				}],
				["line", {
					x1: "2",
					x2: "5",
					y1: "8",
					y2: "8",
					key: "14m1p5"
				}],
				["line", {
					x1: "16",
					x2: "16",
					y1: "19",
					y2: "22",
					key: "rzdirn"
				}],
				["line", {
					x1: "19",
					x2: "22",
					y1: "16",
					y2: "16",
					key: "ox905f"
				}]
			]);
			createLucideIcon("upload", [
				["path", {
					d: "M12 3v12",
					key: "1x0j5s"
				}],
				["path", {
					d: "m17 8-5-5-5 5",
					key: "7q97r8"
				}],
				["path", {
					d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
					key: "ih7n3h"
				}]
			]);
			createLucideIcon("unplug", [
				["path", {
					d: "m19 5 3-3",
					key: "yk6iyv"
				}],
				["path", {
					d: "m2 22 3-3",
					key: "19mgm9"
				}],
				["path", {
					d: "M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z",
					key: "goz73y"
				}],
				["path", {
					d: "M7.5 13.5 10 11",
					key: "7xgeeb"
				}],
				["path", {
					d: "M10.5 16.5 13 14",
					key: "10btkg"
				}],
				["path", {
					d: "m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z",
					key: "1snsnr"
				}]
			]);
			createLucideIcon("usb-c-port", [["path", {
				d: "M6 12h12",
				key: "8npq4p"
			}], ["rect", {
				x: "2",
				y: "8",
				width: "20",
				height: "8",
				rx: "4",
				key: "86l77p"
			}]]);
			createLucideIcon("usb", [
				["circle", {
					cx: "10",
					cy: "7",
					r: "1",
					key: "dypaad"
				}],
				["circle", {
					cx: "4",
					cy: "20",
					r: "1",
					key: "22iqad"
				}],
				["path", {
					d: "M4.7 19.3 19 5",
					key: "1enqfc"
				}],
				["path", {
					d: "m21 3-3 1 2 2Z",
					key: "d3ov82"
				}],
				["path", {
					d: "M9.26 7.68 5 12l2 5",
					key: "1esawj"
				}],
				["path", {
					d: "m10 14 5 2 3.5-3.5",
					key: "v8oal5"
				}],
				["path", {
					d: "m18 12 1-1 1 1-1 1Z",
					key: "1bh22v"
				}]
			]);
			createLucideIcon("user-check", [
				["path", {
					d: "m16 11 2 2 4-4",
					key: "9rsbq5"
				}],
				["path", {
					d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
					key: "1yyitq"
				}],
				["circle", {
					cx: "9",
					cy: "7",
					r: "4",
					key: "nufk8"
				}]
			]);
			createLucideIcon("user-key", [
				["path", {
					d: "M20 11v6",
					key: "d77pzp"
				}],
				["path", {
					d: "M20 13h2",
					key: "16rner"
				}],
				["path", {
					d: "M3 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 2.072.578",
					key: "1yxgtw"
				}],
				["circle", {
					cx: "10",
					cy: "7",
					r: "4",
					key: "e45bow"
				}],
				["circle", {
					cx: "20",
					cy: "19",
					r: "2",
					key: "1obnsp"
				}]
			]);
			createLucideIcon("user-cog", [
				["path", {
					d: "M10 15H6a4 4 0 0 0-4 4v2",
					key: "1nfge6"
				}],
				["path", {
					d: "m14.305 16.53.923-.382",
					key: "1itpsq"
				}],
				["path", {
					d: "m15.228 13.852-.923-.383",
					key: "eplpkm"
				}],
				["path", {
					d: "m16.852 12.228-.383-.923",
					key: "13v3q0"
				}],
				["path", {
					d: "m16.852 17.772-.383.924",
					key: "1i8mnm"
				}],
				["path", {
					d: "m19.148 12.228.383-.923",
					key: "1q8j1v"
				}],
				["path", {
					d: "m19.53 18.696-.382-.924",
					key: "vk1qj3"
				}],
				["path", {
					d: "m20.772 13.852.924-.383",
					key: "n880s0"
				}],
				["path", {
					d: "m20.772 16.148.924.383",
					key: "1g6xey"
				}],
				["circle", {
					cx: "18",
					cy: "15",
					r: "3",
					key: "gjjjvw"
				}],
				["circle", {
					cx: "9",
					cy: "7",
					r: "4",
					key: "nufk8"
				}]
			]);
			createLucideIcon("user-lock", [
				["path", {
					d: "M19 16v-2a2 2 0 0 0-4 0v2",
					key: "17sujf"
				}],
				["path", {
					d: "M9.5 15H7a4 4 0 0 0-4 4v2",
					key: "9it25y"
				}],
				["circle", {
					cx: "10",
					cy: "7",
					r: "4",
					key: "e45bow"
				}],
				["rect", {
					x: "13",
					y: "16",
					width: "8",
					height: "5",
					rx: ".899",
					key: "ur80nz"
				}]
			]);
			createLucideIcon("user-minus", [
				["path", {
					d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
					key: "1yyitq"
				}],
				["circle", {
					cx: "9",
					cy: "7",
					r: "4",
					key: "nufk8"
				}],
				["line", {
					x1: "22",
					x2: "16",
					y1: "11",
					y2: "11",
					key: "1shjgl"
				}]
			]);
			createLucideIcon("user-pen", [
				["path", {
					d: "M11.5 15H7a4 4 0 0 0-4 4v2",
					key: "15lzij"
				}],
				["path", {
					d: "M21.378 16.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z",
					key: "1817ys"
				}],
				["circle", {
					cx: "10",
					cy: "7",
					r: "4",
					key: "e45bow"
				}]
			]);
			createLucideIcon("user-plus", [
				["path", {
					d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
					key: "1yyitq"
				}],
				["circle", {
					cx: "9",
					cy: "7",
					r: "4",
					key: "nufk8"
				}],
				["line", {
					x1: "19",
					x2: "19",
					y1: "8",
					y2: "14",
					key: "1bvyxn"
				}],
				["line", {
					x1: "22",
					x2: "16",
					y1: "11",
					y2: "11",
					key: "1shjgl"
				}]
			]);
			createLucideIcon("user-round-arrow-left", [
				["path", {
					d: "m19 16-3 3",
					key: "lp3y45"
				}],
				["path", {
					d: "M2 21a8 8 0 0 1 12.664-6.5",
					key: "1ap0vn"
				}],
				["path", {
					d: "M22 19h-6l3 3",
					key: "13fjle"
				}],
				["circle", {
					cx: "10",
					cy: "8",
					r: "5",
					key: "o932ke"
				}]
			]);
			createLucideIcon("user-round-check", [
				["path", {
					d: "M2 21a8 8 0 0 1 13.292-6",
					key: "bjp14o"
				}],
				["circle", {
					cx: "10",
					cy: "8",
					r: "5",
					key: "o932ke"
				}],
				["path", {
					d: "m16 19 2 2 4-4",
					key: "1b14m6"
				}]
			]);
			createLucideIcon("user-round-cog", [
				["path", {
					d: "m14.305 19.53.923-.382",
					key: "3m78fa"
				}],
				["path", {
					d: "m15.228 16.852-.923-.383",
					key: "npixar"
				}],
				["path", {
					d: "m16.852 15.228-.383-.923",
					key: "5xggr7"
				}],
				["path", {
					d: "m16.852 20.772-.383.924",
					key: "dpfhf9"
				}],
				["path", {
					d: "m19.148 15.228.383-.923",
					key: "1reyyz"
				}],
				["path", {
					d: "m19.53 21.696-.382-.924",
					key: "1goivc"
				}],
				["path", {
					d: "M2 21a8 8 0 0 1 10.434-7.62",
					key: "1yezr2"
				}],
				["path", {
					d: "m20.772 16.852.924-.383",
					key: "htqkph"
				}],
				["path", {
					d: "m20.772 19.148.924.383",
					key: "9w9pjp"
				}],
				["circle", {
					cx: "10",
					cy: "8",
					r: "5",
					key: "o932ke"
				}],
				["circle", {
					cx: "18",
					cy: "18",
					r: "3",
					key: "1xkwt0"
				}]
			]);
			createLucideIcon("user-round-key", [
				["path", {
					d: "M19 11v6",
					key: "rcqigv"
				}],
				["path", {
					d: "M19 13h2",
					key: "1gch44"
				}],
				["path", {
					d: "M2 21a8 8 0 0 1 12.868-6.349",
					key: "1lryzn"
				}],
				["circle", {
					cx: "10",
					cy: "8",
					r: "5",
					key: "o932ke"
				}],
				["circle", {
					cx: "19",
					cy: "19",
					r: "2",
					key: "17f5cg"
				}]
			]);
			createLucideIcon("user-round-minus", [
				["path", {
					d: "M2 21a8 8 0 0 1 13.292-6",
					key: "bjp14o"
				}],
				["circle", {
					cx: "10",
					cy: "8",
					r: "5",
					key: "o932ke"
				}],
				["path", {
					d: "M22 19h-6",
					key: "vcuq98"
				}]
			]);
			createLucideIcon("user-round-plus", [
				["path", {
					d: "M2 21a8 8 0 0 1 13.292-6",
					key: "bjp14o"
				}],
				["circle", {
					cx: "10",
					cy: "8",
					r: "5",
					key: "o932ke"
				}],
				["path", {
					d: "M19 16v6",
					key: "tddt3s"
				}],
				["path", {
					d: "M22 19h-6",
					key: "vcuq98"
				}]
			]);
			createLucideIcon("user-round-pen", [
				["path", {
					d: "M2 21a8 8 0 0 1 10.821-7.487",
					key: "1c8h7z"
				}],
				["path", {
					d: "M21.378 16.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z",
					key: "1817ys"
				}],
				["circle", {
					cx: "10",
					cy: "8",
					r: "5",
					key: "o932ke"
				}]
			]);
			createLucideIcon("user-round-search", [
				["circle", {
					cx: "10",
					cy: "8",
					r: "5",
					key: "o932ke"
				}],
				["path", {
					d: "M2 21a8 8 0 0 1 10.434-7.62",
					key: "1yezr2"
				}],
				["circle", {
					cx: "18",
					cy: "18",
					r: "3",
					key: "1xkwt0"
				}],
				["path", {
					d: "m22 22-1.9-1.9",
					key: "1e5ubv"
				}]
			]);
			createLucideIcon("user-round-x", [
				["path", {
					d: "m16.5 16.5 5 5",
					key: "zc9lw7"
				}],
				["path", {
					d: "M2 21a8 8 0 0 1 11.531-7.18",
					key: "x5izle"
				}],
				["path", {
					d: "m21.5 16.5-5 5",
					key: "1empo3"
				}],
				["circle", {
					cx: "10",
					cy: "8",
					r: "5",
					key: "o932ke"
				}]
			]);
			createLucideIcon("user-round", [["circle", {
				cx: "12",
				cy: "8",
				r: "5",
				key: "1hypcn"
			}], ["path", {
				d: "M20 21a8 8 0 0 0-16 0",
				key: "rfgkzh"
			}]]);
			createLucideIcon("user-search", [
				["circle", {
					cx: "10",
					cy: "7",
					r: "4",
					key: "e45bow"
				}],
				["path", {
					d: "M10.3 15H7a4 4 0 0 0-4 4v2",
					key: "3bnktk"
				}],
				["circle", {
					cx: "17",
					cy: "17",
					r: "3",
					key: "18b49y"
				}],
				["path", {
					d: "m21 21-1.9-1.9",
					key: "1g2n9r"
				}]
			]);
			createLucideIcon("user-shield", [
				["path", {
					d: "M10 15H6a4 4 0 0 0-4 4v2",
					key: "1nfge6"
				}],
				["path", {
					d: "M22 17.5c0 2.499-1.75 3.749-3.83 4.474a.5.5 0 0 1-.335-.005c-2.085-.72-3.835-1.97-3.835-4.47V14a.5.5 0 0 1 .5-.499c1 0 2.25-.6 3.12-1.36a.6.6 0 0 1 .76-.001c.875.765 2.12 1.36 3.12 1.36a.5.5 0 0 1 .5.5z",
					key: "16j3tf"
				}],
				["circle", {
					cx: "9",
					cy: "7",
					r: "4",
					key: "nufk8"
				}]
			]);
			createLucideIcon("user-star", [
				["path", {
					d: "M16.051 12.616a1 1 0 0 1 1.909.024l.737 1.452a1 1 0 0 0 .737.535l1.634.256a1 1 0 0 1 .588 1.806l-1.172 1.168a1 1 0 0 0-.282.866l.259 1.613a1 1 0 0 1-1.541 1.134l-1.465-.75a1 1 0 0 0-.912 0l-1.465.75a1 1 0 0 1-1.539-1.133l.258-1.613a1 1 0 0 0-.282-.866l-1.156-1.153a1 1 0 0 1 .572-1.822l1.633-.256a1 1 0 0 0 .737-.535z",
					key: "1m8t9f"
				}],
				["path", {
					d: "M8 15H7a4 4 0 0 0-4 4v2",
					key: "l9tmp8"
				}],
				["circle", {
					cx: "10",
					cy: "7",
					r: "4",
					key: "e45bow"
				}]
			]);
			createLucideIcon("user-x", [
				["path", {
					d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
					key: "1yyitq"
				}],
				["circle", {
					cx: "9",
					cy: "7",
					r: "4",
					key: "nufk8"
				}],
				["line", {
					x1: "17",
					x2: "22",
					y1: "8",
					y2: "13",
					key: "3nzzx3"
				}],
				["line", {
					x1: "22",
					x2: "17",
					y1: "8",
					y2: "13",
					key: "1swrse"
				}]
			]);
			createLucideIcon("user", [["path", {
				d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2",
				key: "975kel"
			}], ["circle", {
				cx: "12",
				cy: "7",
				r: "4",
				key: "17ys0d"
			}]]);
			createLucideIcon("users-round", [
				["path", {
					d: "M18 21a8 8 0 0 0-16 0",
					key: "3ypg7q"
				}],
				["circle", {
					cx: "10",
					cy: "8",
					r: "5",
					key: "o932ke"
				}],
				["path", {
					d: "M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3",
					key: "10s06x"
				}]
			]);
			createLucideIcon("users", [
				["path", {
					d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
					key: "1yyitq"
				}],
				["path", {
					d: "M16 3.128a4 4 0 0 1 0 7.744",
					key: "16gr8j"
				}],
				["path", {
					d: "M22 21v-2a4 4 0 0 0-3-3.87",
					key: "kshegd"
				}],
				["circle", {
					cx: "9",
					cy: "7",
					r: "4",
					key: "nufk8"
				}]
			]);
			createLucideIcon("utensils-crossed", [
				["path", {
					d: "m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8",
					key: "n7qcjb"
				}],
				["path", {
					d: "M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7",
					key: "d0u48b"
				}],
				["path", {
					d: "m2.1 21.8 6.4-6.3",
					key: "yn04lh"
				}],
				["path", {
					d: "m19 5-7 7",
					key: "194lzd"
				}]
			]);
			createLucideIcon("utensils", [
				["path", {
					d: "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2",
					key: "cjf0a3"
				}],
				["path", {
					d: "M7 2v20",
					key: "1473qp"
				}],
				["path", {
					d: "M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7",
					key: "j28e5"
				}]
			]);
			createLucideIcon("utility-pole", [
				["path", {
					d: "M12 2v20",
					key: "t6zp3m"
				}],
				["path", {
					d: "M2 5h20",
					key: "1fs1ex"
				}],
				["path", {
					d: "M3 3v2",
					key: "9imdir"
				}],
				["path", {
					d: "M7 3v2",
					key: "n0os7"
				}],
				["path", {
					d: "M17 3v2",
					key: "1l2re6"
				}],
				["path", {
					d: "M21 3v2",
					key: "1duuac"
				}],
				["path", {
					d: "m19 5-7 7-7-7",
					key: "133zxf"
				}]
			]);
			createLucideIcon("van", [
				["path", {
					d: "M13 6v5a1 1 0 0 0 1 1h6.102a1 1 0 0 1 .712.298l.898.91a1 1 0 0 1 .288.702V17a1 1 0 0 1-1 1h-3",
					key: "k3s650"
				}],
				["path", {
					d: "M5 18H3a1 1 0 0 1-1-1V8a2 2 0 0 1 2-2h12c1.1 0 2.1.8 2.4 1.8l1.176 4.2",
					key: "fnd93u"
				}],
				["path", {
					d: "M9 18h5",
					key: "lrx6i"
				}],
				["circle", {
					cx: "16",
					cy: "18",
					r: "2",
					key: "1v4tcr"
				}],
				["circle", {
					cx: "7",
					cy: "18",
					r: "2",
					key: "19iecd"
				}]
			]);
			createLucideIcon("vault", [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					key: "afitv7"
				}],
				["circle", {
					cx: "7.5",
					cy: "7.5",
					r: ".5",
					fill: "currentColor",
					key: "kqv944"
				}],
				["path", {
					d: "m7.9 7.9 2.7 2.7",
					key: "hpeyl3"
				}],
				["circle", {
					cx: "16.5",
					cy: "7.5",
					r: ".5",
					fill: "currentColor",
					key: "w0ekpg"
				}],
				["path", {
					d: "m13.4 10.6 2.7-2.7",
					key: "264c1n"
				}],
				["circle", {
					cx: "7.5",
					cy: "16.5",
					r: ".5",
					fill: "currentColor",
					key: "nkw3mc"
				}],
				["path", {
					d: "m7.9 16.1 2.7-2.7",
					key: "p81g5e"
				}],
				["circle", {
					cx: "16.5",
					cy: "16.5",
					r: ".5",
					fill: "currentColor",
					key: "fubopw"
				}],
				["path", {
					d: "m13.4 13.4 2.7 2.7",
					key: "abhel3"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "2",
					key: "1c9p78"
				}]
			]);
			createLucideIcon("vector-square", [
				["path", {
					d: "M19.5 7a24 24 0 0 1 0 10",
					key: "8n60xe"
				}],
				["path", {
					d: "M4.5 7a24 24 0 0 0 0 10",
					key: "2lmadr"
				}],
				["path", {
					d: "M7 19.5a24 24 0 0 0 10 0",
					key: "1q94o2"
				}],
				["path", {
					d: "M7 4.5a24 24 0 0 1 10 0",
					key: "2z8ypa"
				}],
				["rect", {
					x: "17",
					y: "17",
					width: "5",
					height: "5",
					rx: "1",
					key: "1ac74s"
				}],
				["rect", {
					x: "17",
					y: "2",
					width: "5",
					height: "5",
					rx: "1",
					key: "1e7h5j"
				}],
				["rect", {
					x: "2",
					y: "17",
					width: "5",
					height: "5",
					rx: "1",
					key: "1t4eah"
				}],
				["rect", {
					x: "2",
					y: "2",
					width: "5",
					height: "5",
					rx: "1",
					key: "940dhs"
				}]
			]);
			createLucideIcon("variable", [
				["path", {
					d: "M8 21s-4-3-4-9 4-9 4-9",
					key: "uto9ud"
				}],
				["path", {
					d: "M16 3s4 3 4 9-4 9-4 9",
					key: "4w2vsq"
				}],
				["line", {
					x1: "15",
					x2: "9",
					y1: "9",
					y2: "15",
					key: "f7djnv"
				}],
				["line", {
					x1: "9",
					x2: "15",
					y1: "9",
					y2: "15",
					key: "1shsy8"
				}]
			]);
			createLucideIcon("vegan", [
				["path", {
					d: "M16 8q6 0 6-6-6 0-6 6",
					key: "qsyyc4"
				}],
				["path", {
					d: "M17.41 3.59a10 10 0 1 0 3 3",
					key: "41m9h7"
				}],
				["path", {
					d: "M2 2a26.6 26.6 0 0 1 10 20c.9-6.82 1.5-9.5 4-14",
					key: "qiv7li"
				}]
			]);
			createLucideIcon("venetian-mask", [
				["path", {
					d: "M18 11c-1.5 0-2.5.5-3 2",
					key: "1fod00"
				}],
				["path", {
					d: "M4 6a2 2 0 0 0-2 2v4a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V8a2 2 0 0 0-2-2h-3a8 8 0 0 0-5 2 8 8 0 0 0-5-2z",
					key: "d70hit"
				}],
				["path", {
					d: "M6 11c1.5 0 2.5.5 3 2",
					key: "136fht"
				}]
			]);
			createLucideIcon("venus-and-mars", [
				["path", {
					d: "M10 20h4",
					key: "ni2waw"
				}],
				["path", {
					d: "M12 16v6",
					key: "c8a4gj"
				}],
				["path", {
					d: "M17 2h4v4",
					key: "vhe59"
				}],
				["path", {
					d: "m21 2-5.46 5.46",
					key: "19kypf"
				}],
				["circle", {
					cx: "12",
					cy: "11",
					r: "5",
					key: "16gxyc"
				}]
			]);
			createLucideIcon("venus", [
				["path", {
					d: "M12 15v7",
					key: "t2xh3l"
				}],
				["path", {
					d: "M9 19h6",
					key: "456am0"
				}],
				["circle", {
					cx: "12",
					cy: "9",
					r: "6",
					key: "1nw4tq"
				}]
			]);
			createLucideIcon("vibrate-off", [
				["path", {
					d: "m2 8 2 2-2 2 2 2-2 2",
					key: "sv1b1"
				}],
				["path", {
					d: "m22 8-2 2 2 2-2 2 2 2",
					key: "101i4y"
				}],
				["path", {
					d: "M8 8v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2",
					key: "1hbad5"
				}],
				["path", {
					d: "M16 10.34V6c0-.55-.45-1-1-1h-4.34",
					key: "1x5tf0"
				}],
				["line", {
					x1: "2",
					x2: "22",
					y1: "2",
					y2: "22",
					key: "a6p6uj"
				}]
			]);
			createLucideIcon("vibrate", [
				["path", {
					d: "m2 8 2 2-2 2 2 2-2 2",
					key: "sv1b1"
				}],
				["path", {
					d: "m22 8-2 2 2 2-2 2 2 2",
					key: "101i4y"
				}],
				["rect", {
					width: "8",
					height: "14",
					x: "8",
					y: "5",
					rx: "1",
					key: "1oyrl4"
				}]
			]);
			createLucideIcon("video-off", [
				["path", {
					d: "M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196",
					key: "w8jjjt"
				}],
				["path", {
					d: "M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2",
					key: "1xawa7"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}]
			]);
			createLucideIcon("video", [["path", {
				d: "m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5",
				key: "ftymec"
			}], ["rect", {
				x: "2",
				y: "6",
				width: "14",
				height: "12",
				rx: "2",
				key: "158x01"
			}]]);
			createLucideIcon("videotape", [
				["rect", {
					width: "20",
					height: "16",
					x: "2",
					y: "4",
					rx: "2",
					key: "18n3k1"
				}],
				["path", {
					d: "M2 8h20",
					key: "d11cs7"
				}],
				["circle", {
					cx: "8",
					cy: "14",
					r: "2",
					key: "1k2qr5"
				}],
				["path", {
					d: "M8 12h8",
					key: "1wcyev"
				}],
				["circle", {
					cx: "16",
					cy: "14",
					r: "2",
					key: "14k7lr"
				}]
			]);
			createLucideIcon("view", [
				["path", {
					d: "M21 17v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2",
					key: "mrq65r"
				}],
				["path", {
					d: "M21 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2",
					key: "be3xqs"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "1",
					key: "41hilf"
				}],
				["path", {
					d: "M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0",
					key: "11ak4c"
				}]
			]);
			createLucideIcon("voicemail", [
				["circle", {
					cx: "6",
					cy: "12",
					r: "4",
					key: "1ehtga"
				}],
				["circle", {
					cx: "18",
					cy: "12",
					r: "4",
					key: "4vafl8"
				}],
				["line", {
					x1: "6",
					x2: "18",
					y1: "16",
					y2: "16",
					key: "pmt8us"
				}]
			]);
			createLucideIcon("volume-1", [["path", {
				d: "M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z",
				key: "uqj9uw"
			}], ["path", {
				d: "M16 9a5 5 0 0 1 0 6",
				key: "1q6k2b"
			}]]);
			createLucideIcon("volleyball", [
				["path", {
					d: "M11 7a16 16 20 0 1 10.98 4.362",
					key: "1mmfx7"
				}],
				["path", {
					d: "M12 12a13 13 0 0 1-8.66 5",
					key: "14sm5y"
				}],
				["path", {
					d: "M16.83 13.634a16 16 0 0 1-9.267 7.328",
					key: "j0eyj5"
				}],
				["path", {
					d: "M20.66 17A13 13 0 0 0 12 12a13 13 0 0 1 0-10",
					key: "qaetsw"
				}],
				["path", {
					d: "M8.17 15.366a16 16 0 0 1-1.713-11.69",
					key: "17ewdd"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}]
			]);
			createLucideIcon("volume-2", [
				["path", {
					d: "M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z",
					key: "uqj9uw"
				}],
				["path", {
					d: "M16 9a5 5 0 0 1 0 6",
					key: "1q6k2b"
				}],
				["path", {
					d: "M19.364 18.364a9 9 0 0 0 0-12.728",
					key: "ijwkga"
				}]
			]);
			createLucideIcon("volume-off", [
				["path", {
					d: "M16 9a5 5 0 0 1 .95 2.293",
					key: "1fgyg8"
				}],
				["path", {
					d: "M19.364 5.636a9 9 0 0 1 1.889 9.96",
					key: "l3zxae"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "m7 7-.587.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298V11",
					key: "1gbwow"
				}],
				["path", {
					d: "M9.828 4.172A.686.686 0 0 1 11 4.657v.686",
					key: "s2je0y"
				}]
			]);
			createLucideIcon("volume-x", [
				["path", {
					d: "M11 4.702a.7.7 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.7.7 0 0 0 11 19.298z",
					key: "1p7khw"
				}],
				["path", {
					d: "m16.5 14.5 5-5",
					key: "cul3yw"
				}],
				["path", {
					d: "m16.5 9.5 5 5",
					key: "1akey5"
				}]
			]);
			createLucideIcon("volume", [["path", {
				d: "M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z",
				key: "uqj9uw"
			}]]);
			createLucideIcon("vote", [
				["path", {
					d: "m9 12 2 2 4-4",
					key: "dzmm74"
				}],
				["path", {
					d: "M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z",
					key: "1ezoue"
				}],
				["path", {
					d: "M22 19H2",
					key: "nuriw5"
				}]
			]);
			createLucideIcon("wallet-cards", [
				["path", {
					d: "M3 11h3.75a2 2 0 0 1 1.6.8l.45.6a4 4 0 0 0 6.4 0l.45-.6a2 2 0 0 1 1.6-.8H21",
					key: "1vwh6y"
				}],
				["path", {
					d: "M3 7h18",
					key: "1uiuf2"
				}],
				["rect", {
					x: "3",
					y: "3",
					width: "18",
					height: "18",
					rx: "2",
					key: "h1oib"
				}]
			]);
			createLucideIcon("wallet-minimal", [["path", {
				d: "M17 14h.01",
				key: "7oqj8z"
			}], ["path", {
				d: "M7 7h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14",
				key: "u1rqew"
			}]]);
			createLucideIcon("wallet", [["path", {
				d: "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",
				key: "18etb6"
			}], ["path", {
				d: "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",
				key: "xoc0q4"
			}]]);
			createLucideIcon("wallpaper", [
				["path", {
					d: "M12 17v4",
					key: "1riwvh"
				}],
				["path", {
					d: "M8 21h8",
					key: "1ev6f3"
				}],
				["path", {
					d: "m9 17 6.1-6.1a2 2 0 0 1 2.81.01L22 15",
					key: "1sl52q"
				}],
				["circle", {
					cx: "8",
					cy: "9",
					r: "2",
					key: "gjzl9d"
				}],
				["rect", {
					x: "2",
					y: "3",
					width: "20",
					height: "14",
					rx: "2",
					key: "x3v2xh"
				}]
			]);
			createLucideIcon("wand-sparkles", [
				["path", {
					d: "m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72",
					key: "ul74o6"
				}],
				["path", {
					d: "m14 7 3 3",
					key: "1r5n42"
				}],
				["path", {
					d: "M5 6v4",
					key: "ilb8ba"
				}],
				["path", {
					d: "M19 14v4",
					key: "blhpug"
				}],
				["path", {
					d: "M10 2v2",
					key: "7u0qdc"
				}],
				["path", {
					d: "M7 8H3",
					key: "zfb6yr"
				}],
				["path", {
					d: "M21 16h-4",
					key: "1cnmox"
				}],
				["path", {
					d: "M11 3H9",
					key: "1obp7u"
				}]
			]);
			createLucideIcon("wand", [
				["path", {
					d: "M15 4V2",
					key: "z1p9b7"
				}],
				["path", {
					d: "M15 16v-2",
					key: "px0unx"
				}],
				["path", {
					d: "M8 9h2",
					key: "1g203m"
				}],
				["path", {
					d: "M20 9h2",
					key: "19tzq7"
				}],
				["path", {
					d: "M17.8 11.8 19 13",
					key: "yihg8r"
				}],
				["path", {
					d: "M15 9h.01",
					key: "x1ddxp"
				}],
				["path", {
					d: "M17.8 6.2 19 5",
					key: "fd4us0"
				}],
				["path", {
					d: "m3 21 9-9",
					key: "1jfql5"
				}],
				["path", {
					d: "M12.2 6.2 11 5",
					key: "i3da3b"
				}]
			]);
			createLucideIcon("warehouse", [
				["path", {
					d: "M18 21V10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v11",
					key: "pb2vm6"
				}],
				["path", {
					d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 1.132-1.803l7.95-3.974a2 2 0 0 1 1.837 0l7.948 3.974A2 2 0 0 1 22 8z",
					key: "doq5xv"
				}],
				["path", {
					d: "M6 13h12",
					key: "yf64js"
				}],
				["path", {
					d: "M6 17h12",
					key: "1jwigz"
				}]
			]);
			createLucideIcon("washing-machine", [
				["path", {
					d: "M3 6h3",
					key: "155dbl"
				}],
				["path", {
					d: "M17 6h.01",
					key: "e2y6kg"
				}],
				["rect", {
					width: "18",
					height: "20",
					x: "3",
					y: "2",
					rx: "2",
					key: "od3kk9"
				}],
				["circle", {
					cx: "12",
					cy: "13",
					r: "5",
					key: "nlbqau"
				}],
				["path", {
					d: "M12 18a2.5 2.5 0 0 0 0-5 2.5 2.5 0 0 1 0-5",
					key: "17lach"
				}]
			]);
			createLucideIcon("watch", [
				["path", {
					d: "M12 10v2.2l1.6 1",
					key: "n3r21l"
				}],
				["path", {
					d: "m16.13 7.66-.81-4.05a2 2 0 0 0-2-1.61h-2.68a2 2 0 0 0-2 1.61l-.78 4.05",
					key: "18k57s"
				}],
				["path", {
					d: "m7.88 16.36.8 4a2 2 0 0 0 2 1.61h2.72a2 2 0 0 0 2-1.61l.81-4.05",
					key: "16ny36"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "6",
					key: "1vlfrh"
				}]
			]);
			createLucideIcon("waves-arrow-down", [
				["path", {
					d: "M12 10L12 2",
					key: "jvb0aw"
				}],
				["path", {
					d: "M16 6L12 10L8 6",
					key: "9j6vje"
				}],
				["path", {
					d: "M2 15C2.6 15.5 3.2 16 4.5 16C7 16 7 14 9.5 14C12.1 14 11.9 16 14.5 16C17 16 17 14 19.5 14C20.8 14 21.4 14.5 22 15",
					key: "s2zepw"
				}],
				["path", {
					d: "M2 21C2.6 21.5 3.2 22 4.5 22C7 22 7 20 9.5 20C12.1 20 11.9 22 14.5 22C17 22 17 20 19.5 20C20.8 20 21.4 20.5 22 21",
					key: "u68omc"
				}]
			]);
			createLucideIcon("waves-arrow-up", [
				["path", {
					d: "M12 2v8",
					key: "1q4o3n"
				}],
				["path", {
					d: "M2 15c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
					key: "1p9f19"
				}],
				["path", {
					d: "M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
					key: "vbxynw"
				}],
				["path", {
					d: "m8 6 4-4 4 4",
					key: "ybng9g"
				}]
			]);
			createLucideIcon("waves-horizontal", [
				["path", {
					d: "M2 12q2.5 2 5 0t5 0 5 0 5 0",
					key: "8ddzzs"
				}],
				["path", {
					d: "M2 19q2.5 2 5 0t5 0 5 0 5 0",
					key: "1wj4st"
				}],
				["path", {
					d: "M2 5q2.5 2 5 0t5 0 5 0 5 0",
					key: "69x50u"
				}]
			]);
			createLucideIcon("waves-ladder", [
				["path", {
					d: "M19 5a2 2 0 0 0-2 2v11",
					key: "s41o68"
				}],
				["path", {
					d: "M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
					key: "rd2r6e"
				}],
				["path", {
					d: "M7 13h10",
					key: "1rwob1"
				}],
				["path", {
					d: "M7 9h10",
					key: "12czzb"
				}],
				["path", {
					d: "M9 5a2 2 0 0 0-2 2v11",
					key: "x0q4gh"
				}]
			]);
			createLucideIcon("waves-vertical", [
				["path", {
					d: "M12 2q2 2.5 0 5t0 5 0 5 0 5",
					key: "13jdbg"
				}],
				["path", {
					d: "M19 2q2 2.5 0 5t0 5 0 5 0 5",
					key: "1ozhzu"
				}],
				["path", {
					d: "M5 2q2 2.5 0 5t0 5 0 5 0 5",
					key: "1bi6v5"
				}]
			]);
			createLucideIcon("waypoints", [
				["path", {
					d: "m10.586 5.414-5.172 5.172",
					key: "4mc350"
				}],
				["path", {
					d: "m18.586 13.414-5.172 5.172",
					key: "8c96vv"
				}],
				["path", {
					d: "M6 12h12",
					key: "8npq4p"
				}],
				["circle", {
					cx: "12",
					cy: "20",
					r: "2",
					key: "144qzu"
				}],
				["circle", {
					cx: "12",
					cy: "4",
					r: "2",
					key: "muu5ef"
				}],
				["circle", {
					cx: "20",
					cy: "12",
					r: "2",
					key: "1xzzfp"
				}],
				["circle", {
					cx: "4",
					cy: "12",
					r: "2",
					key: "1hvhnz"
				}]
			]);
			createLucideIcon("webcam-off", [
				["path", {
					d: "M12 22v-4",
					key: "1utk9m"
				}],
				["path", {
					d: "M12.754 7.096a3 3 0 0 1 2.15 2.15",
					key: "1v0qsm"
				}],
				["path", {
					d: "M12.863 12.873a3 3 0 0 1-3.736-3.735",
					key: "13aqxl"
				}],
				["path", {
					d: "M16.566 16.57A8 8 0 0 1 5.43 5.433",
					key: "1hliph"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "M7 22h10",
					key: "10w4w3"
				}],
				["path", {
					d: "M8.478 2.817a8 8 0 0 1 10.705 10.705",
					key: "r097k8"
				}]
			]);
			createLucideIcon("webcam", [
				["circle", {
					cx: "12",
					cy: "10",
					r: "8",
					key: "1gshiw"
				}],
				["circle", {
					cx: "12",
					cy: "10",
					r: "3",
					key: "ilqhr7"
				}],
				["path", {
					d: "M7 22h10",
					key: "10w4w3"
				}],
				["path", {
					d: "M12 22v-4",
					key: "1utk9m"
				}]
			]);
			createLucideIcon("webhook-off", [
				["path", {
					d: "M17 17h-5c-1.09-.02-1.94.92-2.5 1.9A3 3 0 1 1 2.57 15",
					key: "1tvl6x"
				}],
				["path", {
					d: "M9 3.4a4 4 0 0 1 6.52.66",
					key: "q04jfq"
				}],
				["path", {
					d: "m6 17 3.1-5.8a2.5 2.5 0 0 0 .057-2.05",
					key: "azowf0"
				}],
				["path", {
					d: "M20.3 20.3a4 4 0 0 1-2.3.7",
					key: "5joiws"
				}],
				["path", {
					d: "M18.6 13a4 4 0 0 1 3.357 3.414",
					key: "cangb8"
				}],
				["path", {
					d: "m12 6 .6 1",
					key: "tpjl1n"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}]
			]);
			createLucideIcon("webhook", [
				["path", {
					d: "M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2",
					key: "q3hayz"
				}],
				["path", {
					d: "m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06",
					key: "1go1hn"
				}],
				["path", {
					d: "m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8",
					key: "qlwsc0"
				}]
			]);
			createLucideIcon("weight-tilde", [
				["path", {
					d: "M6.5 8a2 2 0 0 0-1.906 1.46L2.1 18.5A2 2 0 0 0 4 21h16a2 2 0 0 0 1.925-2.54L19.4 9.5A2 2 0 0 0 17.48 8z",
					key: "1wl739"
				}],
				["path", {
					d: "M7.999 15a2.5 2.5 0 0 1 4 0 2.5 2.5 0 0 0 4 0",
					key: "1egezo"
				}],
				["circle", {
					cx: "12",
					cy: "5",
					r: "3",
					key: "rqqgnr"
				}]
			]);
			createLucideIcon("weight", [["circle", {
				cx: "12",
				cy: "5",
				r: "3",
				key: "rqqgnr"
			}], ["path", {
				d: "M6.5 8a2 2 0 0 0-1.905 1.46L2.1 18.5A2 2 0 0 0 4 21h16a2 2 0 0 0 1.925-2.54L19.4 9.5A2 2 0 0 0 17.48 8Z",
				key: "56o5sh"
			}]]);
			createLucideIcon("wheat", [
				["path", {
					d: "M2 22 16 8",
					key: "60hf96"
				}],
				["path", {
					d: "M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z",
					key: "1rdhi6"
				}],
				["path", {
					d: "M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z",
					key: "1sdzmb"
				}],
				["path", {
					d: "M11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z",
					key: "eoatbi"
				}],
				["path", {
					d: "M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z",
					key: "19rau1"
				}],
				["path", {
					d: "M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z",
					key: "tc8ph9"
				}],
				["path", {
					d: "M15.47 13.47 17 15l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z",
					key: "2m8kc5"
				}],
				["path", {
					d: "M19.47 9.47 21 11l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L13 11l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z",
					key: "vex3ng"
				}]
			]);
			createLucideIcon("wheat-off", [
				["path", {
					d: "m2 22 10-10",
					key: "28ilpk"
				}],
				["path", {
					d: "m16 8-1.17 1.17",
					key: "1qqm82"
				}],
				["path", {
					d: "M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z",
					key: "1rdhi6"
				}],
				["path", {
					d: "m8 8-.53.53a3.5 3.5 0 0 0 0 4.94L9 15l1.53-1.53c.55-.55.88-1.25.98-1.97",
					key: "4wz8re"
				}],
				["path", {
					d: "M10.91 5.26c.15-.26.34-.51.56-.73L13 3l1.53 1.53a3.5 3.5 0 0 1 .28 4.62",
					key: "rves66"
				}],
				["path", {
					d: "M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z",
					key: "19rau1"
				}],
				["path", {
					d: "M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z",
					key: "tc8ph9"
				}],
				["path", {
					d: "m16 16-.53.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.49 3.49 0 0 1 1.97-.98",
					key: "ak46r"
				}],
				["path", {
					d: "M18.74 13.09c.26-.15.51-.34.73-.56L21 11l-1.53-1.53a3.5 3.5 0 0 0-4.62-.28",
					key: "1tw520"
				}],
				["line", {
					x1: "2",
					x2: "22",
					y1: "2",
					y2: "22",
					key: "a6p6uj"
				}]
			]);
			createLucideIcon("whole-word", [
				["circle", {
					cx: "7",
					cy: "12",
					r: "3",
					key: "12clwm"
				}],
				["path", {
					d: "M10 9v6",
					key: "17i7lo"
				}],
				["circle", {
					cx: "17",
					cy: "12",
					r: "3",
					key: "gl7c2s"
				}],
				["path", {
					d: "M14 7v8",
					key: "dl84cr"
				}],
				["path", {
					d: "M22 17v1c0 .5-.5 1-1 1H3c-.5 0-1-.5-1-1v-1",
					key: "lt2kga"
				}]
			]);
			createLucideIcon("wifi-cog", [
				["path", {
					d: "m14.305 19.53.923-.382",
					key: "3m78fa"
				}],
				["path", {
					d: "m15.228 16.852-.923-.383",
					key: "npixar"
				}],
				["path", {
					d: "m16.852 15.228-.383-.923",
					key: "5xggr7"
				}],
				["path", {
					d: "m16.852 20.772-.383.924",
					key: "dpfhf9"
				}],
				["path", {
					d: "m19.148 15.228.383-.923",
					key: "1reyyz"
				}],
				["path", {
					d: "m19.53 21.696-.382-.924",
					key: "1goivc"
				}],
				["path", {
					d: "M2 7.82a15 15 0 0 1 20 0",
					key: "1ovjuk"
				}],
				["path", {
					d: "m20.772 16.852.924-.383",
					key: "htqkph"
				}],
				["path", {
					d: "m20.772 19.148.924.383",
					key: "9w9pjp"
				}],
				["path", {
					d: "M5 11.858a10 10 0 0 1 11.5-1.785",
					key: "3sn16i"
				}],
				["path", {
					d: "M8.5 15.429a5 5 0 0 1 2.413-1.31",
					key: "1pxovh"
				}],
				["circle", {
					cx: "18",
					cy: "18",
					r: "3",
					key: "1xkwt0"
				}]
			]);
			createLucideIcon("wifi-high", [
				["path", {
					d: "M12 20h.01",
					key: "zekei9"
				}],
				["path", {
					d: "M5 12.859a10 10 0 0 1 14 0",
					key: "1x1e6c"
				}],
				["path", {
					d: "M8.5 16.429a5 5 0 0 1 7 0",
					key: "1bycff"
				}]
			]);
			createLucideIcon("wifi-low", [["path", {
				d: "M12 20h.01",
				key: "zekei9"
			}], ["path", {
				d: "M8.5 16.429a5 5 0 0 1 7 0",
				key: "1bycff"
			}]]);
			createLucideIcon("wifi-off", [
				["path", {
					d: "M12 20h.01",
					key: "zekei9"
				}],
				["path", {
					d: "M8.5 16.429a5 5 0 0 1 7 0",
					key: "1bycff"
				}],
				["path", {
					d: "M5 12.859a10 10 0 0 1 5.17-2.69",
					key: "1dl1wf"
				}],
				["path", {
					d: "M19 12.859a10 10 0 0 0-2.007-1.523",
					key: "4k23kn"
				}],
				["path", {
					d: "M2 8.82a15 15 0 0 1 4.177-2.643",
					key: "1grhjp"
				}],
				["path", {
					d: "M22 8.82a15 15 0 0 0-11.288-3.764",
					key: "z3jwby"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}]
			]);
			createLucideIcon("wifi-pen", [
				["path", {
					d: "M2 8.82a15 15 0 0 1 20 0",
					key: "dnpr2z"
				}],
				["path", {
					d: "M21.378 16.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z",
					key: "1817ys"
				}],
				["path", {
					d: "M5 12.859a10 10 0 0 1 10.5-2.222",
					key: "rpb7oy"
				}],
				["path", {
					d: "M8.5 16.429a5 5 0 0 1 3-1.406",
					key: "r8bmzl"
				}]
			]);
			createLucideIcon("wifi-sync", [
				["path", {
					d: "M11.965 10.105v4L13.5 12.5a5 5 0 0 1 8 1.5",
					key: "1immaq"
				}],
				["path", {
					d: "M11.965 14.105h4",
					key: "uejny8"
				}],
				["path", {
					d: "M17.965 18.105h4L20.43 19.71a5 5 0 0 1-8-1.5",
					key: "1i3a7e"
				}],
				["path", {
					d: "M2 8.82a15 15 0 0 1 20 0",
					key: "dnpr2z"
				}],
				["path", {
					d: "M21.965 22.105v-4",
					key: "1ku6vx"
				}],
				["path", {
					d: "M5 12.86a10 10 0 0 1 3-2.032",
					key: "pemdtu"
				}],
				["path", {
					d: "M8.5 16.429h.01",
					key: "2bm739"
				}]
			]);
			createLucideIcon("wifi-zero", [["path", {
				d: "M12 20h.01",
				key: "zekei9"
			}]]);
			createLucideIcon("wifi", [
				["path", {
					d: "M12 20h.01",
					key: "zekei9"
				}],
				["path", {
					d: "M2 8.82a15 15 0 0 1 20 0",
					key: "dnpr2z"
				}],
				["path", {
					d: "M5 12.859a10 10 0 0 1 14 0",
					key: "1x1e6c"
				}],
				["path", {
					d: "M8.5 16.429a5 5 0 0 1 7 0",
					key: "1bycff"
				}]
			]);
			createLucideIcon("wind-arrow-down", [
				["path", {
					d: "M10 2v8",
					key: "d4bbey"
				}],
				["path", {
					d: "M12.8 21.6A2 2 0 1 0 14 18H2",
					key: "19kp1d"
				}],
				["path", {
					d: "M17.5 10a2.5 2.5 0 1 1 2 4H2",
					key: "19kpjc"
				}],
				["path", {
					d: "m6 6 4 4 4-4",
					key: "k13n16"
				}]
			]);
			createLucideIcon("wind", [
				["path", {
					d: "M12.8 19.6A2 2 0 1 0 14 16H2",
					key: "148xed"
				}],
				["path", {
					d: "M17.5 8a2.5 2.5 0 1 1 2 4H2",
					key: "1u4tom"
				}],
				["path", {
					d: "M9.8 4.4A2 2 0 1 1 11 8H2",
					key: "75valh"
				}]
			]);
			createLucideIcon("wine", [
				["path", {
					d: "M8 22h8",
					key: "rmew8v"
				}],
				["path", {
					d: "M7 10h10",
					key: "1101jm"
				}],
				["path", {
					d: "M12 15v7",
					key: "t2xh3l"
				}],
				["path", {
					d: "M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z",
					key: "10ffi3"
				}]
			]);
			createLucideIcon("wine-off", [
				["path", {
					d: "M8 22h8",
					key: "rmew8v"
				}],
				["path", {
					d: "M7 10h3m7 0h-1.343",
					key: "v48bem"
				}],
				["path", {
					d: "M12 15v7",
					key: "t2xh3l"
				}],
				["path", {
					d: "M7.307 7.307A12.33 12.33 0 0 0 7 10a5 5 0 0 0 7.391 4.391M8.638 2.981C8.75 2.668 8.872 2.34 9 2h6c1.5 4 2 6 2 8 0 .407-.05.809-.145 1.198",
					key: "1ymjlu"
				}],
				["line", {
					x1: "2",
					x2: "22",
					y1: "2",
					y2: "22",
					key: "a6p6uj"
				}]
			]);
			createLucideIcon("workflow", [
				["rect", {
					width: "8",
					height: "8",
					x: "3",
					y: "3",
					rx: "2",
					key: "by2w9f"
				}],
				["path", {
					d: "M7 11v4a2 2 0 0 0 2 2h4",
					key: "xkn7yn"
				}],
				["rect", {
					width: "8",
					height: "8",
					x: "13",
					y: "13",
					rx: "2",
					key: "1cgmvn"
				}]
			]);
			createLucideIcon("worm", [
				["path", {
					d: "m19 12-1.5 3",
					key: "9bcu4o"
				}],
				["path", {
					d: "M19.63 18.81 22 20",
					key: "121v98"
				}],
				["path", {
					d: "M6.47 8.23a1.68 1.68 0 0 1 2.44 1.93l-.64 2.08a6.76 6.76 0 0 0 10.16 7.67l.42-.27a1 1 0 1 0-2.73-4.21l-.42.27a1.76 1.76 0 0 1-2.63-1.99l.64-2.08A6.66 6.66 0 0 0 3.94 3.9l-.7.4a1 1 0 1 0 2.55 4.34z",
					key: "1tij6q"
				}]
			]);
			createLucideIcon("wrench-off", [
				["path", {
					d: "M10.747 5.093a6 6 0 0 1 6.841-2.882c.438.12.54.662.219.984L14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-2.882 6.842",
					key: "sded7h"
				}],
				["path", {
					d: "m13.5 13.5-7.88 7.88a1 1 0 0 1-2.999-3l7.88-7.88",
					key: "66etnh"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}]
			]);
			const Wrench = createLucideIcon("wrench", [["path", {
				d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z",
				key: "1ngwbx"
			}]]);
			createLucideIcon("x-line-top", [
				["path", {
					d: "M18 4H6",
					key: "1hsngl"
				}],
				["path", {
					d: "M18 8 6 20",
					key: "xspwia"
				}],
				["path", {
					d: "m6 8 12 12",
					key: "qb1veh"
				}]
			]);
			createLucideIcon("x", [["path", {
				d: "M18 6 6 18",
				key: "1bl5f8"
			}], ["path", {
				d: "m6 6 12 12",
				key: "d8bk6v"
			}]]);
			createLucideIcon("zap", [["path", {
				d: "M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z",
				key: "1v7up4"
			}]]);
			createLucideIcon("zap-off", [
				["path", {
					d: "M10.768 5.111 13.44 2.44a1.5 1.5 0 012.474 1.561l-1.633 4.625",
					key: "l6h226"
				}],
				["path", {
					d: "m18.889 13.232.672-.672A1.5 1.5 0 0018.5 10h-2.844",
					key: "1717b9"
				}],
				["path", {
					d: "m2 2 20 20",
					key: "1ooewy"
				}],
				["path", {
					d: "m7.94 7.94-3.5 3.499A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l5.5-5.5",
					key: "1bjzrh"
				}]
			]);
			createLucideIcon("zodiac-aquarius", [["path", {
				d: "m2 10 2.456-3.684a.7.7 0 0 1 1.106-.013l2.39 3.413a.7.7 0 0 0 1.096-.001l2.402-3.432a.7.7 0 0 1 1.098 0l2.402 3.432a.7.7 0 0 0 1.098 0l2.389-3.413a.7.7 0 0 1 1.106.013L22 10",
				key: "1o8iok"
			}], ["path", {
				d: "m2 18.002 2.456-3.684a.7.7 0 0 1 1.106-.013l2.39 3.413a.7.7 0 0 0 1.097 0l2.402-3.432a.7.7 0 0 1 1.098 0l2.402 3.432a.7.7 0 0 0 1.098 0l2.389-3.413a.7.7 0 0 1 1.106.013L22 18.002",
				key: "112qy7"
			}]]);
			createLucideIcon("zodiac-aries", [["path", {
				d: "M12 7.5a4.5 4.5 0 1 1 5 4.5",
				key: "k987hv"
			}], ["path", {
				d: "M7 12a4.5 4.5 0 1 1 5-4.5V21",
				key: "mjup0w"
			}]]);
			createLucideIcon("zodiac-cancer", [
				["path", {
					d: "M21 14.5A9 6.5 0 0 1 5.5 19",
					key: "1xj2o6"
				}],
				["path", {
					d: "M3 9.5A9 6.5 0 0 1 18.5 5",
					key: "1gln3t"
				}],
				["circle", {
					cx: "17.5",
					cy: "14.5",
					r: "3.5",
					key: "1ccu1t"
				}],
				["circle", {
					cx: "6.5",
					cy: "9.5",
					r: "3.5",
					key: "x5tc2d"
				}]
			]);
			createLucideIcon("zodiac-capricorn", [
				["path", {
					d: "M11 21a3 3 0 0 0 3-3V6.5a1 1 0 0 0-7 0",
					key: "1kkncs"
				}],
				["path", {
					d: "M7 19V6a3 3 0 0 0-3-3h0",
					key: "1jg5y1"
				}],
				["circle", {
					cx: "17",
					cy: "17",
					r: "3",
					key: "18b49y"
				}]
			]);
			createLucideIcon("zodiac-gemini", [
				["path", {
					d: "M16 4.525v14.948",
					key: "bgoxo0"
				}],
				["path", {
					d: "M20 3A17 17 0 0 1 4 3",
					key: "1djemw"
				}],
				["path", {
					d: "M4 21a17 17 0 0 1 16 0",
					key: "onoyo7"
				}],
				["path", {
					d: "M8 4.525v14.948",
					key: "u5iyof"
				}]
			]);
			createLucideIcon("zodiac-leo", [["path", {
				d: "M10 16c0-4-3-4.5-3-8a5 5 0 0 1 10 0c0 3.466-3 6.196-3 10a3 3 0 0 0 6 0",
				key: "1qj6nb"
			}], ["circle", {
				cx: "7",
				cy: "16",
				r: "3",
				key: "yyv3zl"
			}]]);
			createLucideIcon("zodiac-ophiuchus", [["path", {
				d: "M3 10A6.06 6.06 0 0 1 12 10 A6.06 6.06 0 0 0 21 10",
				key: "13lfmc"
			}], ["path", {
				d: "M6 3v12a6 6 0 0 0 12 0V3",
				key: "1jnivp"
			}]]);
			createLucideIcon("zodiac-pisces", [
				["path", {
					d: "M19 21a15 15 0 0 1 0-18",
					key: "br2vug"
				}],
				["path", {
					d: "M20 12H4",
					key: "1mtusc"
				}],
				["path", {
					d: "M5 3a15 15 0 0 1 0 18",
					key: "1w7hae"
				}]
			]);
			createLucideIcon("zodiac-libra", [["path", {
				d: "M3 16h6.857c.162-.012.19-.323.038-.38a6 6 0 1 1 4.212 0c-.153.057-.125.368.038.38H21",
				key: "1novf0"
			}], ["path", {
				d: "M3 20h18",
				key: "1l19wn"
			}]]);
			createLucideIcon("zodiac-sagittarius", [
				["path", {
					d: "M15 3h6v6",
					key: "1q9fwt"
				}],
				["path", {
					d: "M21 3 3 21",
					key: "1011np"
				}],
				["path", {
					d: "m9 9 6 6",
					key: "z0biqf"
				}]
			]);
			createLucideIcon("zodiac-scorpio", [
				["path", {
					d: "M10 19V5.5a1 1 0 0 1 5 0V17a2 2 0 0 0 2 2h5l-3-3",
					key: "1w8g0z"
				}],
				["path", {
					d: "m22 19-3 3",
					key: "1ix4wq"
				}],
				["path", {
					d: "M5 19V5.5a1 1 0 0 1 5 0",
					key: "1d4oa3"
				}],
				["path", {
					d: "M5 5.5A2.5 2.5 0 0 0 2.5 3",
					key: "gp646f"
				}]
			]);
			createLucideIcon("zodiac-taurus", [["circle", {
				cx: "12",
				cy: "15",
				r: "6",
				key: "lhqcmb"
			}], ["path", {
				d: "M18 3A6 6 0 0 1 6 3",
				key: "1p399e"
			}]]);
			createLucideIcon("zodiac-virgo", [
				["path", {
					d: "M11 5.5a1 1 0 0 1 5 0V16a5 5 0 0 0 5 5",
					key: "1szkuh"
				}],
				["path", {
					d: "M16 11.5a1 1 0 0 1 5 0V16a5 5 0 0 1-5 5",
					key: "pyq0k2"
				}],
				["path", {
					d: "M6 19V6a3 3 0 0 0-3-3h0",
					key: "pvee4g"
				}],
				["path", {
					d: "M6 5.5a1 1 0 0 1 5 0V19",
					key: "vncctg"
				}]
			]);
			createLucideIcon("zoom-in", [
				["circle", {
					cx: "11",
					cy: "11",
					r: "8",
					key: "4ej97u"
				}],
				["line", {
					x1: "21",
					x2: "16.65",
					y1: "21",
					y2: "16.65",
					key: "13gj7c"
				}],
				["line", {
					x1: "11",
					x2: "11",
					y1: "8",
					y2: "14",
					key: "1vmskp"
				}],
				["line", {
					x1: "8",
					x2: "14",
					y1: "11",
					y2: "11",
					key: "durymu"
				}]
			]);
			createLucideIcon("zoom-out", [
				["circle", {
					cx: "11",
					cy: "11",
					r: "8",
					key: "4ej97u"
				}],
				["line", {
					x1: "21",
					x2: "16.65",
					y1: "21",
					y2: "16.65",
					key: "13gj7c"
				}],
				["line", {
					x1: "8",
					x2: "14",
					y1: "11",
					y2: "11",
					key: "durymu"
				}]
			]);
			exports.BookOpen = BookOpen;
			exports.Brain = Brain;
			exports.ChevronDown = ChevronDown;
			exports.ChevronRight = ChevronRight;
			exports.FilePenLine = FilePenLine;
			exports.FolderOpen = FolderOpen;
			exports.Image = Image;
			exports.ListChecks = ListChecks;
			exports.LoaderCircle = LoaderCircle;
			exports.Search = Search;
			exports.Terminal = Terminal;
			exports.TriangleAlert = TriangleAlert;
			exports.Wrench = Wrench;
		})))();
		const CODEX_ACTIVITY_TOOL = "relay_codex_activity";
		function readActivityPayload(value) {
			if (!value || typeof value !== "object" || value.version !== 1 || typeof value.threadId !== "string" || typeof value.turnId !== "string" || typeof value.itemId !== "string" || !["started", "completed"].includes(value.phase)) return null;
			const activity = value.activity;
			if (!activity || typeof activity !== "object" || typeof activity.type !== "string" || typeof activity.title !== "string" || ![
				"running",
				"completed",
				"error"
			].includes(activity.status)) return null;
			for (const key of [
				"summary",
				"input",
				"output",
				"exitCode",
				"commandActions"
			]) if (activity[key] !== void 0 && typeof activity[key] !== "string") return null;
			return value;
		}
		//#endregion
		//#region codex-activity-labels.mjs
		const verbs = {
			read: [
				"Reading",
				"Read",
				"read",
				"File read"
			],
			search: [
				"Searching",
				"Searched",
				"search",
				"Search"
			],
			listFiles: [
				"Listing",
				"Listed",
				"list",
				"File listing"
			],
			command: [
				"Running",
				"Ran",
				"run",
				"Command"
			],
			edit: [
				"Editing",
				"Edited",
				"edit",
				"File edit"
			],
			image: [
				"Viewing",
				"Viewed",
				"view",
				"Image view"
			],
			imageGeneration: [
				"Generating",
				"Generated",
				"generate",
				"Image generation"
			],
			webSearch: [
				"Searching",
				"Searched",
				"search",
				"Web search"
			],
			tool: [
				"Using",
				"Used",
				"use",
				"Tool use"
			],
			plan: [
				"Updating",
				"Updated",
				"update",
				"Plan update"
			]
		};
		function describeActivity(activity) {
			const parts = activityParts(activity);
			const categories = new Set(parts.map((part) => part.category));
			return {
				title: parts.length === 1 ? partTitle(parts[0]) : summarizeParts(parts),
				category: categories.size === 1 ? parts[0].category : "command"
			};
		}
		function summarizeActivities(activities) {
			return summarizeParts(Array.from(activities, activityParts).flat());
		}
		function activityParts(activity) {
			const value = activity ?? {};
			const state = activityState(value);
			if (value.type === "commandExecution") {
				const command = commandText(value);
				return commandParts(value.commandActions, command).map((action) => ({
					...action,
					...state
				}));
			}
			const known = {
				fileChange: {
					category: "edit",
					subject: value.title === "Edited files" ? "files" : "a file"
				},
				imageView: {
					category: "image",
					subject: "an image"
				},
				imageGeneration: {
					category: "imageGeneration",
					subject: "an image"
				},
				webSearch: {
					category: "webSearch",
					subject: text(value.summary) ? `the web for ${quoted(value.summary)}` : "the web"
				},
				mcpToolCall: {
					category: "tool",
					subject: "a tool",
					label: value.title === "Used a tool" ? "" : short(value.title, 120)
				},
				plan: {
					category: "plan",
					subject: "the plan"
				}
			};
			return [{
				...Object.hasOwn(known, value.type) ? known[value.type] : {
					category: "unknown",
					label: short(value.title, 120) || short(humanize(value.type), 120) || "Unknown activity"
				},
				...state
			}];
		}
		function activityState(activity) {
			if (activity.status === "running" || activity.status === "error") return { state: activity.status };
			if (activity.status !== "completed") return { state: "unknown" };
			const code = activity.exitCode;
			const numeric = typeof code === "number" ? code : typeof code === "string" && /^-?\d+$/.test(code.trim()) ? Number(code) : NaN;
			if (activity.type === "commandExecution" && Number.isSafeInteger(numeric) && numeric !== 0) return {
				state: "exited",
				exitCode: numeric
			};
			return { state: "completed" };
		}
		function commandParts(metadata, command) {
			let actions = metadata;
			if (typeof actions === "string") {
				if (!actions.trim()) return simpleCommand(command);
				try {
					actions = JSON.parse(actions);
				} catch {
					return [structuredAction(null, command)];
				}
				if (!Array.isArray(actions)) return [structuredAction(null, command)];
			}
			if (actions == null || Array.isArray(actions) && actions.length === 0) return simpleCommand(command);
			return Array.isArray(actions) ? Array.from(actions, (action) => structuredAction(action, command)) : [structuredAction(null, command)];
		}
		function structuredAction(action, fallback) {
			if (action?.type === "read") {
				const path = text(action.path);
				const name = text(action.name) || basename(path);
				return {
					category: "read",
					subject: name || "files",
					target: path || name
				};
			}
			if (action?.type === "search") {
				const query = text(action.query);
				const path = text(action.path);
				return {
					category: "search",
					subject: `${query ? `for ${quoted(query)}` : "files"}${path ? ` in ${short(path)}` : ""}`
				};
			}
			if (action?.type === "listFiles") {
				const path = text(action.path);
				return {
					category: "listFiles",
					subject: `files${path ? ` in ${short(path)}` : ""}`
				};
			}
			return {
				category: "command",
				subject: short(text(action?.cmd) || fallback) || "a command"
			};
		}
		function commandText(activity) {
			const input = text(activity.input);
			return input ? input.replace(/^\$ /, "") : text(activity.summary);
		}
		function simpleCommand(command) {
			const fallback = [{
				category: "command",
				subject: short(command) || "a command"
			}];
			if (!command || !/^[A-Za-z0-9_./:@%+=, \t-]+$/.test(command)) return fallback;
			const [executable, ...args] = command.trim().split(/[ \t]+/);
			if (args.some((arg) => arg.startsWith("="))) return fallback;
			const name = basename(executable);
			if (executable !== name && ![
				"/bin/",
				"/usr/bin/",
				"/usr/local/bin/",
				"/opt/homebrew/bin/"
			].some((prefix) => executable === `${prefix}${name}`)) return fallback;
			let paths;
			if (name === "cat") paths = operands(args, /^-[nbsvET]+$/);
			else if (name === "head" || name === "tail") {
				let rest = args;
				if (rest[0] === "-n" || rest[0] === "-c") {
					if (!/^\d+$/.test(rest[1] ?? "")) return fallback;
					rest = rest.slice(2);
				} else if (/^-\d+$/.test(rest[0] ?? "")) rest = rest.slice(1);
				paths = operands(rest, /^-[qv]+$/);
			} else if (name === "sed" && args[0] === "-n" && /^\d+(,\d+)?p$/.test(args[1] ?? "")) paths = operands(args.slice(2));
			else if (name === "ls") {
				paths = operands(args, /^-[alAh1dFRtSr]+$/);
				return paths ? [listing(paths)] : fallback;
			} else if (name === "rg" && args[0] === "--files") {
				paths = operands(args.slice(1), /^(--hidden|--no-ignore)$/);
				return paths ? [listing(paths)] : fallback;
			} else if (name === "find" && args.length === 3 && args[1] === "-type" && /^[fd]$/.test(args[2])) return args[0].startsWith("-") ? fallback : [listing([args[0]])];
			else if (name === "rg" || name === "grep") {
				const rest = operands(args, /^-[nilwsvxF]+$/);
				if (!rest?.length || name === "grep" && rest.length < 2) return fallback;
				return [structuredAction({
					type: "search",
					query: rest[0],
					path: rest.slice(1).join(", ")
				}, command)];
			}
			return paths?.length && paths.every((path) => !path.endsWith("/") && ![".", ".."].includes(basename(path))) ? paths.map((path) => ({
				category: "read",
				subject: basename(path),
				target: path
			})) : fallback;
		}
		function operands(args, flags = /$a/) {
			const paths = [];
			let literal = false;
			for (const arg of args) {
				if (!literal && arg === "--") {
					literal = true;
					continue;
				}
				if (!literal && flags.test(arg)) continue;
				if (!literal && arg.startsWith("-")) return null;
				if (arg === "-") return null;
				paths.push(arg);
			}
			return paths;
		}
		function listing(paths) {
			return {
				category: "listFiles",
				subject: `files${paths.length ? ` in ${short(paths.join(", "))}` : ""}`
			};
		}
		function summarizeParts(parts) {
			const groups = /* @__PURE__ */ new Map();
			for (const part of parts) {
				const key = JSON.stringify([
					part.category,
					part.state,
					part.exitCode,
					part.category === "unknown" ? part.label : null
				]);
				const group = groups.get(key) ?? [];
				group.push(part);
				groups.set(key, group);
			}
			return [...groups.values()].map((group, index) => {
				const first = group[0];
				const title = partTitle({
					...first,
					label: first.category === "unknown" ? first.label : void 0,
					subject: groupSubject(group),
					count: group.length
				});
				return index > 0 && first.category !== "unknown" ? title[0].toLowerCase() + title.slice(1) : title;
			}).join(", ");
		}
		function groupSubject(group) {
			const part = group[0];
			const count = group.length;
			switch (part.category) {
				case "read": return group.some((item) => !item.target) || new Set(group.map((item) => item.target)).size > 1 ? "files" : "a file";
				case "search":
				case "listFiles": return "files";
				case "command": return count === 1 ? "a command" : "commands";
				case "edit": return count === 1 && part.subject === "a file" ? "a file" : "files";
				case "image":
				case "imageGeneration": return count === 1 ? "an image" : `${count} images`;
				case "webSearch": return "the web";
				case "tool": return count === 1 ? "a tool" : "tools";
				case "plan": return "the plan";
				default: return "";
			}
		}
		function partTitle(part) {
			if (part.label) {
				const suffix = {
					running: " (running)",
					error: " (failed)",
					unknown: " (status unknown)"
				}[part.state] ?? "";
				return `${short(part.label, 120)}${part.count > 1 ? ` (${part.count} activities)` : ""}${suffix}`;
			}
			const [present, past, infinitive, neutral] = verbs[part.category];
			const subject = short(part.subject);
			if (part.state === "running") return `${present} ${subject}`;
			if (part.state === "completed") return `${past} ${subject}`;
			if (part.state === "error") return `Failed to ${infinitive} ${subject}`;
			if (part.state === "exited") return `${neutral} exited ${part.exitCode}: ${subject}`;
			return `${neutral} (status unknown): ${subject}`;
		}
		function basename(path) {
			return path.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? "";
		}
		function humanize(value) {
			const label = text(value).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
			return label ? label[0].toUpperCase() + label.slice(1) : "";
		}
		function quoted(value) {
			return JSON.stringify(short(value, 60));
		}
		function short(value, limit = 80) {
			const chars = Array.from(text(value).replace(/[\x00-\x1f\x7f\s]+/g, " ").trim());
			return chars.length > limit ? chars.slice(0, limit - 3).join("") + "..." : chars.join("");
		}
		function text(value) {
			return typeof value === "string" ? value.trim() : "";
		}
		//#endregion
		//#region \0relay-css-module:./src/client/CodexActivityView.module.css.mjs
		const css$2 = ".jIHzgW_activity{width:min(100%,960px);color:var(--dsw-alias-label-secondary)}.jIHzgW_row{gap:8px;min-width:0;max-width:100%}.jIHzgW_title{text-overflow:ellipsis;white-space:nowrap;flex:0 auto;min-width:0;font-size:14px;line-height:24px;overflow:hidden}.jIHzgW_summary{min-width:0;color:var(--dsw-alias-label-tertiary);flex:1;align-items:center;gap:8px;font-size:13px;line-height:20px;display:flex}.jIHzgW_summary :first-child{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.jIHzgW_detail{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-background-container,#f6f6f7);color:var(--dsw-alias-label-secondary);border-radius:8px;margin:8px 0 12px 28px;overflow:hidden}.jIHzgW_detailBlock{min-width:0}.jIHzgW_detailLabel{color:var(--dsw-alias-label-tertiary);padding:10px 12px 0;font-size:13px;line-height:18px}.jIHzgW_detail pre{max-height:360px;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-markdown-code-block-small);white-space:pre-wrap;word-break:break-word;margin:0;padding:10px 12px 12px;overflow:auto}.jIHzgW_provenance{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;padding:10px 12px 0;font-size:12px;line-height:18px;overflow:hidden}.jIHzgW_footer{border-top:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);justify-content:space-between;gap:12px;padding:8px 12px;font-size:13px;line-height:18px;display:flex}";
		const tagId$2 = "relay-dsh-plugin-codex/CodexActivityView.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "relay-dsh-plugin-codex";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var CodexActivityView_module_css_default = {
			"activity": "jIHzgW_activity",
			"detail": "jIHzgW_detail",
			"detailBlock": "jIHzgW_detailBlock",
			"detailLabel": "jIHzgW_detailLabel",
			"footer": "jIHzgW_footer",
			"provenance": "jIHzgW_provenance",
			"row": "jIHzgW_row",
			"summary": "jIHzgW_summary",
			"title": "jIHzgW_title"
		};
		//#endregion
		//#region src/client/process-presence.ts
		const mounted = /* @__PURE__ */ new Map();
		const listeners = /* @__PURE__ */ new Set();
		const subscribe = (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		};
		const notify = () => {
			for (const listener of listeners) listener();
		};
		const keyOf = (sessionId, turn) => JSON.stringify([sessionId, turn]);
		/** Suppression is reversible and only active after the replacement mounts. */
		function mountProcess(sessionId, turn) {
			const key = keyOf(sessionId, turn);
			mounted.set(key, (mounted.get(key) ?? 0) + 1);
			notify();
			return () => {
				const count = (mounted.get(key) ?? 1) - 1;
				if (count === 0) mounted.delete(key);
				else mounted.set(key, count);
				notify();
			};
		}
		function useProcessPresence(sessionId, turn) {
			return (0, react.useSyncExternalStore)(subscribe, () => mounted.has(keyOf(sessionId, turn)), () => false);
		}
		//#endregion
		//#region src/client/compatible-chat.ts
		/** New DSH exposes chat directly; the older session snapshot contains it. */
		function useCompatibleChat(owner, selector) {
			if (owner.useChat) return owner.useChat(selector);
			return owner.useSession((snapshot) => {
				if (!("chat" in snapshot)) throw new Error("DSH legacy chat state is unavailable");
				return selector(snapshot.chat);
			});
		}
		//#endregion
		//#region src/client/codex-process.ts
		function record(value) {
			return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
		}
		/** Read the same opaque response metadata from a finish or persisted model source. */
		function readCodexPresentation(replayState) {
			const value = record(record(record(replayState)?.response)?.codexPresentation);
			if (value?.version !== 1 || !Array.isArray(value.blocks)) return void 0;
			const blocks = [];
			const seen = /* @__PURE__ */ new Set();
			for (const candidate of value.blocks) {
				const block = record(candidate);
				if (!block || typeof block.index !== "number" || !Number.isSafeInteger(block.index) || block.index < 0 || typeof block.itemId !== "string" || seen.has(block.index)) continue;
				seen.add(block.index);
				blocks.push({
					index: block.index,
					itemId: block.itemId,
					...block.phase === "commentary" || block.phase === "final_answer" ? { phase: block.phase } : {}
				});
			}
			return {
				version: 1,
				blocks
			};
		}
		function activityArguments(args) {
			try {
				return readActivityPayload(JSON.parse(args));
			} catch {
				return null;
			}
		}
		function initialCodexProcessState(turn, startedAt) {
			return withTakeoverSafety({
				turn,
				owned: false,
				ownedSteps: [],
				foreignSteps: [],
				startedAt,
				takeoverSafe: false,
				takeoverReasons: [],
				status: "running",
				segments: [],
				presentations: {}
			});
		}
		function visible(segment) {
			return segment.kind === "activity" || segment.attachment !== void 0 || Boolean(segment.text?.trim());
		}
		function withTakeoverSafety(state) {
			const takeoverReasons = [];
			if (!state.owned) takeoverReasons.push("unowned-turn");
			if (state.firstVisibleSeq === void 0) takeoverReasons.push("no-visible-content");
			if (state.foreignSteps.length) takeoverReasons.push("foreign-provider");
			if (state.segments.some((segment) => visible(segment) && !state.ownedSteps.includes(segment.step))) takeoverReasons.push("unowned-step");
			if (state.unsupportedToolSeq !== void 0) takeoverReasons.push("unsupported-tool");
			if (state.unsupportedContentSeq !== void 0) takeoverReasons.push("unsupported-content");
			if (state.orphanResultSeq !== void 0) takeoverReasons.push("orphan-tool-result");
			if (state.owned && Object.keys(state.presentations).length === 0 && !state.segments.some((segment) => segment.kind === "activity")) takeoverReasons.push("legacy-no-presentation");
			return {
				...state,
				takeoverSafe: takeoverReasons.length === 0,
				takeoverReasons
			};
		}
		/** Also require a visible, mounted process node before suppressing any native row. */
		function canTakeOverCodexProcess(state) {
			return state?.owned === true && state.takeoverSafe === true && state.firstVisibleSeq !== void 0;
		}
		function unsupportedTool(state, seq) {
			return {
				...state,
				unsupportedToolSeq: state.unsupportedToolSeq ?? seq
			};
		}
		function firstVisible(segments, steps) {
			return segments.filter((segment) => steps.includes(segment.step) && visible(segment)).reduce((seq, segment) => Math.min(seq ?? Infinity, segment.visibleSeq ?? segment.seq), void 0);
		}
		function ownStep(state, step) {
			if (state.foreignSteps.includes(step) || state.ownedSteps.includes(step)) return state;
			const ownedSteps = [...state.ownedSteps, step];
			return {
				...state,
				owned: true,
				ownedSteps,
				firstVisibleSeq: firstVisible(state.segments, ownedSteps),
				...state.stepErrors?.[step] ? {
					status: "error",
					error: state.stepErrors[step]
				} : {}
			};
		}
		function putSegment(state, segment, visibleSeq) {
			const index = state.segments.findIndex((value) => value.key === segment.key);
			const segments = [...state.segments];
			const next = {
				...segment,
				...visible(segment) ? { visibleSeq: segment.visibleSeq ?? visibleSeq } : {}
			};
			if (index < 0) segments.push(next);
			else segments[index] = next;
			return {
				...state,
				segments,
				firstVisibleSeq: firstVisible(segments, state.ownedSteps)
			};
		}
		function present(state, step, presentation) {
			if (!presentation) return state;
			const mapping = new Map(presentation.blocks.map((block) => [block.index, block]));
			return {
				...state,
				presentations: {
					...state.presentations,
					[step]: presentation
				},
				segments: state.segments.map((segment) => {
					const block = segment.step === step && segment.index !== void 0 ? mapping.get(segment.index) : void 0;
					return block ? {
						...segment,
						itemId: block.itemId,
						phase: block.phase ?? void 0
					} : segment;
				})
			};
		}
		function blockSegment(state, step, index, seq, block, settled) {
			if (state.foreignSteps.includes(step)) return state;
			if (block.type !== "text" && block.type !== "reasoning" && block.type !== "image") return state;
			const key = `block:${step}:${index}`;
			const previous = state.segments.find((segment) => segment.key === key);
			const mapping = state.presentations[step]?.blocks.find((value) => value.index === index);
			return putSegment(state, {
				...previous,
				key,
				seq: previous?.seq ?? seq,
				step,
				index,
				kind: block.type,
				settled,
				...block.type === "image" ? { attachment: block.attachment } : { text: block.text },
				...mapping ? {
					itemId: mapping.itemId,
					phase: mapping.phase ?? void 0
				} : {}
			}, seq);
		}
		function upsertActivity(state, step, seq, payload, details) {
			if (state.foreignSteps.includes(step)) return state;
			const key = `activity:${JSON.stringify([
				payload.threadId,
				payload.turnId,
				payload.itemId
			])}`;
			const previous = state.segments.find((segment) => segment.key === key);
			const completed = payload.phase === "completed" || details.isError === true;
			if (previous?.settled && !completed) return ownStep(state, step);
			const status = details.isError ? "error" : completed && payload.activity.status === "running" ? "completed" : payload.activity.status;
			return putSegment(ownStep(state, step), {
				...previous,
				key,
				seq: previous?.seq ?? seq,
				step: previous?.step ?? step,
				kind: "activity",
				id: payload.itemId,
				itemId: payload.itemId,
				threadId: payload.threadId,
				turnId: payload.turnId,
				callId: details.callId,
				name: CODEX_ACTIVITY_TOOL,
				...details.nativeCallSeq === void 0 ? {} : { nativeCallSeq: details.nativeCallSeq },
				...details.argsRaw === void 0 ? {} : { argsRaw: details.argsRaw },
				...details.messageId === void 0 ? {} : { messageId: details.messageId },
				activityPhase: completed ? "completed" : payload.phase,
				activity: {
					...previous?.activity,
					...payload.activity,
					status,
					provenance: {
						threadId: payload.threadId,
						turnId: payload.turnId
					}
				},
				settled: completed
			}, seq);
		}
		function closeProcess(state, time, reason) {
			const segments = state.segments.map((segment) => segment.kind === "activity" && !segment.settled ? {
				...segment,
				settled: true,
				activityPhase: "completed",
				activity: segment.activity && {
					...segment.activity,
					status: "error"
				}
			} : segment);
			return {
				...state,
				endedAt: time,
				endReason: reason,
				segments,
				status: reason.kind !== "completed" || state.status === "error" ? "error" : "completed",
				...reason.kind === "error" ? { error: reason.error.message } : {}
			};
		}
		function stepFailure(state, step, error) {
			return {
				...state,
				stepErrors: {
					...state.stepErrors,
					[step]: error
				},
				...state.ownedSteps.includes(step) ? {
					status: "error",
					error
				} : {},
				segments: state.segments.map((segment) => segment.step === step && segment.kind === "activity" && !segment.settled ? {
					...segment,
					settled: true,
					activityPhase: "completed",
					activity: segment.activity && {
						...segment.activity,
						status: "error"
					}
				} : segment)
			};
		}
		function sameBlock(segment, block) {
			if (segment.kind !== block.type) return false;
			if (block.type === "text" || block.type === "reasoning") return segment.text === block.text;
			return block.type === "image" && segment.attachment?.attachmentId === block.attachment.attachmentId;
		}
		function assistantMessage(state, event) {
			const { message, step } = event.data;
			if (message.source.provider !== "relay-codex") {
				const ownedSteps = state.ownedSteps.filter((value) => value !== step);
				const segments = state.segments.filter((segment) => segment.step !== step);
				const { [step]: _removed, ...presentations } = state.presentations;
				const { [step]: _failure, ...stepErrors } = state.stepErrors ?? {};
				const error = ownedSteps.map((value) => stepErrors[value]).filter(Boolean).at(-1);
				return {
					...state,
					ownedSteps,
					owned: ownedSteps.length > 0,
					segments,
					presentations,
					...state.stepErrors ? { stepErrors } : {},
					...state.endedAt === void 0 ? {
						status: error ? "error" : "running",
						error
					} : {},
					foreignSteps: state.foreignSteps.includes(step) ? state.foreignSteps : [...state.foreignSteps, step],
					firstVisibleSeq: firstVisible(segments, ownedSteps)
				};
			}
			if (state.foreignSteps.includes(step)) return state;
			let next = present(ownStep(state, step), step, readCodexPresentation(message.source.replayState));
			const blocks = next.segments.filter((segment) => segment.step === step && segment.kind !== "activity");
			const used = /* @__PURE__ */ new Set();
			let textPosition = 0;
			for (const [position, block] of message.content.entries()) {
				if (block.type === "tool-call") {
					const payload = block.name === "relay_codex_activity" ? activityArguments(block.arguments) : null;
					if (payload) next = upsertActivity(next, step, event.seq, payload, {
						callId: block.id,
						argsRaw: block.arguments
					});
					else next = unsupportedTool(next, event.seq);
					continue;
				}
				if (block.type !== "text" && block.type !== "reasoning" && block.type !== "image") {
					next = {
						...next,
						unsupportedContentSeq: next.unsupportedContentSeq ?? event.seq
					};
					continue;
				}
				const mapping = block.type === "image" ? void 0 : next.presentations[step]?.blocks[textPosition++];
				let previous = blocks.find((segment) => !used.has(segment.key) && sameBlock(segment, block));
				previous ??= blocks.find((segment) => !used.has(segment.key) && segment.index === mapping?.index && segment.kind === block.type);
				previous ??= blocks.find((segment) => !used.has(segment.key) && segment.index === position && segment.kind === block.type);
				previous ??= blocks.find((segment) => !used.has(segment.key) && segment.kind === block.type);
				let index = previous?.index ?? mapping?.index ?? position;
				if (!previous && (used.has(`block:${step}:${index}`) || next.segments.some((segment) => segment.key === `block:${step}:${index}`))) index = Math.max(index, ...next.segments.filter((segment) => segment.step === step).map((segment) => segment.index ?? -1)) + 1;
				used.add(`block:${step}:${index}`);
				next = blockSegment(next, step, index, event.seq, block, true);
			}
			return event.data.interrupted ? stepFailure(next, step, next.stepErrors?.[step] ?? "Interrupted") : next;
		}
		/** Pure ordered fold; no changes to native events, messages, blocks, or attachments. */
		function reduceCodexProcess(state, event) {
			const next = foldCodexProcess(state, event);
			return next === state ? state : withTakeoverSafety(next);
		}
		function foldCodexProcess(state, event) {
			const matched = codexProcessDefinition.match(event);
			if (event.type === "chunkrow/text-chunks" || event.type === "chunkrow/reasoning-chunks" || event.type === "chunkrow/tool-call-chunks") {
				if (!matched || matched.id !== String(state.turn)) return state;
				const count = event.type === "chunkrow/tool-call-chunks" ? event.data.args.length : event.data.texts.length;
				const offset = Math.max(0, (state.lastSeq ?? event.seq - 1) - event.seq + 1);
				if (offset >= count) return state;
				const next = {
					...state,
					lastSeq: event.seq + count - 1
				};
				if (state.foreignSteps.includes(event.data.step)) return next;
				if (event.type === "chunkrow/tool-call-chunks") return unsupportedTool(next, event.seq + offset);
				const { step, index } = event.data;
				const previous = state.segments.find((segment) => segment.key === `block:${step}:${index}`);
				if (previous?.settled) return next;
				const texts = event.data.texts.slice(offset);
				const firstVisibleOffset = texts.findIndex((text) => text.trim() !== "");
				const updated = blockSegment(next, step, index, event.seq + offset, {
					type: event.type === "chunkrow/text-chunks" ? "text" : "reasoning",
					text: (previous?.text ?? "") + texts.join("")
				}, false);
				if (previous?.visibleSeq !== void 0 || firstVisibleOffset <= 0) return updated;
				const segments = updated.segments.map((segment) => segment.key === `block:${step}:${index}` ? {
					...segment,
					visibleSeq: event.seq + offset + firstVisibleOffset
				} : segment);
				return {
					...updated,
					segments,
					firstVisibleSeq: firstVisible(segments, updated.ownedSteps)
				};
			}
			if (!matched || matched.id !== String(state.turn) || state.lastSeq !== void 0 && event.seq <= state.lastSeq) return state;
			let next = {
				...state,
				lastSeq: event.seq
			};
			switch (event.type) {
				case "turn/start": return {
					...next,
					startedAt: event.time
				};
				case "turn/end": return closeProcess(next, event.time, event.data.reason);
				case "assistant/message": return assistantMessage(next, event);
				case "tool/call": {
					const payload = event.data.name === "relay_codex_activity" ? activityArguments(event.data.arguments) : null;
					return payload ? upsertActivity(next, event.data.step, event.seq, payload, {
						callId: event.data.callId,
						argsRaw: event.data.arguments,
						nativeCallSeq: event.seq
					}) : unsupportedTool(next, event.seq);
				}
				case "tool/result": {
					const result = event.data.message.content[0];
					const callId = event.data.message.source.callId;
					const previous = next.segments.find((segment) => segment.kind === "activity" && segment.callId === callId);
					const payload = readActivityPayload(record(event.data.meta)?.codexActivity);
					if ((payload || previous?.activity) && (previous?.nativeCallSeq === void 0 || previous.messageId !== void 0 || result.toolCallId !== callId)) next = {
						...next,
						orphanResultSeq: next.orphanResultSeq ?? event.seq
					};
					const isError = result.isError === true || event.data.error !== void 0;
					if (payload) return upsertActivity(next, event.data.step, event.seq, {
						...payload,
						phase: "completed"
					}, {
						callId,
						isError,
						messageId: event.data.message.id
					});
					if (!previous?.activity) return unsupportedTool(next, event.seq);
					return putSegment(next, {
						...previous,
						settled: true,
						activityPhase: "completed",
						messageId: event.data.message.id,
						activity: {
							...previous.activity,
							status: isError ? "error" : "completed"
						}
					}, event.seq);
				}
				case "assistant/chunk": {
					const { step, chunk } = event.data;
					if (state.foreignSteps.includes(step)) return next;
					if (chunk.type === "finish") {
						next = present(next, step, readCodexPresentation(chunk.replayState));
						return chunk.reason.kind === "error" || chunk.reason.kind === "aborted" ? stepFailure(next, step, chunk.reason.failure.message) : next;
					}
					if (chunk.type === "usage") return next;
					if (chunk.type === "tool-call-delta" || chunk.type === "block-start" && chunk.blockType === "tool-call" || chunk.type === "block-end" && chunk.block.type === "tool-call") return unsupportedTool(next, event.seq);
					if (chunk.type === "block-start" && chunk.blockType !== "text" && chunk.blockType !== "reasoning" && chunk.blockType !== "image" || chunk.type === "block-end" && chunk.block.type !== "text" && chunk.block.type !== "reasoning" && chunk.block.type !== "image") return {
						...next,
						unsupportedContentSeq: next.unsupportedContentSeq ?? event.seq
					};
					const previous = next.segments.find((segment) => segment.key === `block:${step}:${chunk.index}`);
					if (previous?.settled) return next;
					if (chunk.type === "block-start") {
						if (previous || chunk.blockType !== "text" && chunk.blockType !== "reasoning") return next;
						return blockSegment(next, step, chunk.index, event.seq, {
							type: chunk.blockType,
							text: ""
						}, false);
					}
					if (chunk.type === "block-end") return blockSegment(next, step, chunk.index, event.seq, chunk.block, true);
					return blockSegment(next, step, chunk.index, event.seq, {
						type: chunk.type === "text-delta" ? "text" : "reasoning",
						text: (previous?.text ?? "") + chunk.text
					}, false);
				}
				default: return next;
			}
		}
		/** Rebuild a window without requiring its turn/start to have been loaded. */
		function replayCodexProcess(events) {
			let state;
			for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
				const match = codexProcessDefinition.match(event);
				if (!match) continue;
				state ??= initialCodexProcessState(Number(match.id), event.time);
				state = reduceCodexProcess(state, event);
			}
			return state;
		}
		function projectCodexProcess(context) {
			let state = context.state ?? replayCodexProcess(context.matches.map((match) => match.event));
			if (!state) return void 0;
			const location = context.start?.location ?? context.matches.find((match) => match.location.kind === "turn" || match.location.kind === "step")?.location;
			if (location?.kind === "turn" || location?.kind === "step") {
				if (location.turn.start && state.startedAt !== location.turn.start.time) state = {
					...state,
					startedAt: location.turn.start.time
				};
				if (state.endedAt === void 0 && location.turn.end) state = closeProcess(state, location.turn.end.time, location.turn.end.data.reason);
			}
			state = withTakeoverSafety(state);
			const segments = state.segments.filter((segment) => state.ownedSteps.includes(segment.step));
			return segments.length === state.segments.length ? state : {
				...state,
				segments
			};
		}
		/**
		* Legacy completed turns have no phase contract: their last nonempty text may
		* serve as the answer. This does not assign final_answer or remove any segment;
		* in particular a sole text remains available to render. Metadata disables guessing.
		*/
		function codexProcessAnswerSegments(state) {
			const text = state.segments.filter((segment) => segment.kind === "text" && visible(segment));
			const explicit = text.filter((segment) => segment.phase === "final_answer");
			if (explicit.length || Object.keys(state.presentations).length || state.status !== "completed") return explicit;
			const last = text.at(-1);
			return last ? [last] : [];
		}
		const codexProcessDefinition = {
			kind: "relay-codex-process",
			target: "chat",
			match: (event) => {
				if (event.type === "turn/start") return {
					id: String(event.data.turn),
					role: "start"
				};
				if (event.type === "turn/end" || event.type === "assistant/chunk" || event.type === "assistant/message" || event.type === "tool/result" || event.type === "tool/call" || event.type === "chunkrow/text-chunks" || event.type === "chunkrow/reasoning-chunks" || event.type === "chunkrow/tool-call-chunks") {
					if ((event.type === "assistant/message" || event.type === "tool/result") && event.surfaceOp !== void 0 && event.surfaceOp !== "append") return null;
					return {
						id: String(event.data.turn),
						role: "update"
					};
				}
				return null;
			},
			start: (_context, match) => {
				if (match.event.type !== "turn/start") throw new Error("relay-codex-process start requires turn/start");
				return reduceCodexProcess(initialCodexProcessState(match.event.data.turn, match.event.time), match.event);
			},
			update: (context, match) => reduceCodexProcess(context.state, match.event),
			publication: (match) => {
				if (match.event.type === "turn/start") return "none";
				if (match.event.type.startsWith("chunkrow/")) return "animation-frame";
				if (match.event.type !== "assistant/chunk") return "immediate";
				const type = match.event.data.chunk.type;
				if (type === "usage") return "none";
				return type === "text-delta" || type === "reasoning-delta" || type === "tool-call-delta" ? "animation-frame" : "immediate";
			},
			buildLocationData: (context, scope) => {
				if (scope !== "turn") return null;
				const state = projectCodexProcess(context);
				return state?.owned ? {
					kind: "turn",
					turn: state.turn,
					key: "relay-codex-process",
					value: state
				} : null;
			},
			buildViewNode: (context) => {
				const state = projectCodexProcess(context);
				if (!state || !canTakeOverCodexProcess(state)) {
					const previous = context.current.get("chat");
					return previous ? {
						...previous,
						visibility: "hidden",
						data: state ?? previous.data
					} : null;
				}
				return {
					key: context.key,
					kind: "relay-codex-process",
					id: context.id,
					target: "chat",
					anchorSeq: state.firstVisibleSeq,
					location: context.start?.location ?? context.matches[0]?.location ?? { kind: "unresolved" },
					visibility: "visible",
					data: state
				};
			}
		};
		//#endregion
		//#region src/client/CodexActivityView.tsx
		function dotState(status) {
			if (status === "running") return "ongoing";
			if (status === "error") return "error";
			return "done";
		}
		function ActivityIcon({ category }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(category === "read" ? import_lucide_react.BookOpen : category === "search" || category === "webSearch" ? import_lucide_react.Search : category === "listFiles" ? import_lucide_react.FolderOpen : category === "edit" ? import_lucide_react.FilePenLine : category === "image" || category === "imageGeneration" ? import_lucide_react.Image : category === "plan" ? import_lucide_react.ListChecks : category === "command" ? import_lucide_react.Terminal : import_lucide_react.Wrench, {
				size: 16,
				strokeWidth: 1.6,
				"aria-hidden": "true",
				"data-activity-icon": category
			});
		}
		const CodexActivityView = (0, react.memo)(function CodexActivityView({ node }) {
			const activity = node.data;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActivityRow, { activity });
		});
		function GroupedCodexToolActivityView(props) {
			const process = useCompatibleChat(props, (snapshot) => {
				const location = [...snapshot.nodes.values()].find((node) => node.kind === "tool-call" && node.id === props.callId)?.location;
				if (location?.kind !== "turn" && location?.kind !== "step") return void 0;
				return location.turn.data.get("relay-codex-process");
			});
			const mounted = useProcessPresence(props.sessionId, process?.turn ?? -1);
			const represented = process?.segments.some((segment) => segment.callId === props.callId);
			if (mounted && canTakeOverCodexProcess(process) && represented && props.block.subCalls.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				hidden: true,
				"data-codex-grouped-call": props.callId
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexToolActivityView, { ...props });
		}
		function CodexToolActivityView({ block }) {
			let payload = "kind" in block && block.meta && typeof block.meta === "object" ? readActivityPayload(block.meta.codexActivity) : null;
			if (payload === null) {
				const args = "kind" in block ? block.call?.argsRaw : block.argsRaw;
				try {
					payload = readActivityPayload(JSON.parse(args ?? "null"));
				} catch {}
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActivityRow, { activity: payload === null ? {
				type: "unknown",
				title: "Codex activity",
				status: "kind" in block ? block.isError ? "error" : "completed" : "running"
			} : {
				...payload.activity,
				..."kind" in block ? { status: block.isError ? "error" : "completed" } : {},
				provenance: {
					threadId: payload.threadId,
					turnId: payload.turnId
				}
			} });
		}
		function ActivityRow({ activity }) {
			const [open, setOpen] = (0, react.useState)(false);
			const description = describeActivity(activity);
			const expandable = activity.input !== void 0 || activity.output !== void 0 || activity.provenance !== void 0;
			const commandTranscript = activity.type === "commandExecution" ? [activity.input, activity.output].filter((value) => value !== void 0 && value !== "").join("\n\n") : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: CodexActivityView_module_css_default.activity,
				"data-codex-activity": activity.type,
				"data-status": activity.status,
				title: description.title,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActivityIcon, { category: description.category }),
					title: description.title,
					titleClassName: CodexActivityView_module_css_default.title,
					rowClassName: CodexActivityView_module_css_default.row,
					open,
					expandable,
					onToggle: () => {
						setOpen((value) => !value);
					},
					expandOnRowClick: true,
					collapsedContent: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: CodexActivityView_module_css_default.summary,
						children: activity.status !== "completed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
							state: dotState(activity.status),
							size: 8
						}) : null
					}),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CodexActivityView_module_css_default.detail,
						children: [
							activity.provenance !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: CodexActivityView_module_css_default.provenance,
								title: `Codex App Server · Thread ${activity.provenance.threadId} · Turn ${activity.provenance.turnId}`,
								children: [
									"Codex App Server · Thread ",
									shortId(activity.provenance.threadId),
									" · Turn ",
									shortId(activity.provenance.turnId)
								]
							}) : null,
							commandTranscript !== void 0 && commandTranscript !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DetailBlock, {
								label: "Shell",
								text: commandTranscript
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [activity.input !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DetailBlock, {
								label: "Input",
								text: activity.input
							}) : null, activity.output !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DetailBlock, {
								label: "Output",
								text: activity.output
							}) : null] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: CodexActivityView_module_css_default.footer,
								children: [activity.exitCode !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["exit ", activity.exitCode] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: statusLabel(activity.status) })]
							})
						]
					})
				})
			});
		}
		function DetailBlock({ label, text }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: CodexActivityView_module_css_default.detailBlock,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: CodexActivityView_module_css_default.detailLabel,
					children: label
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: text })]
			});
		}
		function statusLabel(status) {
			if (status === "running") return "Running";
			if (status === "error") return "Failed";
			return "Success";
		}
		function shortId(value) {
			return value.length > 15 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
		}
		//#endregion
		//#region src/client/process-files.ts
		function codexProducedFileMentions(segments, openFile, native) {
			const paths = /* @__PURE__ */ new Set();
			for (const { activity } of segments) {
				if (activity?.type !== "fileChange" || activity.status !== "completed" || !activity.input) continue;
				let changes;
				try {
					changes = JSON.parse(activity.input);
				} catch {
					continue;
				}
				if (!Array.isArray(changes)) continue;
				for (const change of changes) {
					if (!change || typeof change !== "object" || typeof change.path !== "string" || !change.path.trim() || /[\0\r\n]/.test(change.path)) continue;
					const kind = change.kind?.type ?? change.kind ?? change.action;
					if (kind === "delete") paths.delete(change.path);
					else if ([
						"add",
						"update",
						"create",
						"modify"
					].includes(kind)) {
						const moved = change.kind?.move_path;
						if (moved != null) {
							paths.delete(change.path);
							if (typeof moved === "string" && moved.trim() && !/[\0\r\n]/.test(moved)) paths.add(moved);
						} else paths.add(change.path);
					}
				}
			}
			if (paths.size === 0) return native;
			return { resolve(value) {
				const existing = native?.resolve(value);
				if (existing) return existing;
				const matches = [...paths].filter((path) => path === value || path.split(/[\\/]/).at(-1) === value);
				const path = paths.has(value) ? value : matches.length === 1 ? matches[0] : void 0;
				return path === void 0 ? void 0 : {
					open: () => {
						openFile(path);
					},
					title: path,
					label: `Open ${path}`
				};
			} };
		}
		//#endregion
		//#region \0relay-css-module:./src/client/CodexProcessView.module.css.mjs
		const css$1 = "._06p8sG_process{width:100%;min-width:0;color:var(--dsw-alias-label-secondary)}._06p8sG_processToggle,._06p8sG_groupToggle{min-width:0;max-width:100%;min-height:28px;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;align-items:center;gap:8px;padding:2px 0;font-size:14px;line-height:24px;display:flex}._06p8sG_processToggle{margin-bottom:16px}._06p8sG_processToggle:focus-visible,._06p8sG_groupToggle:focus-visible{outline:2px solid var(--dsw-static-deepseek-500,#416aff);outline-offset:3px;border-radius:4px}._06p8sG_groupToggle>svg{flex:none}._06p8sG_groupTitle{white-space:nowrap;text-overflow:ellipsis;min-width:0;overflow:hidden}._06p8sG_count{flex-shrink:0;font-size:12px}._06p8sG_flow,._06p8sG_answer{flex-direction:column;gap:20px;min-width:0;display:flex}._06p8sG_flow[hidden]{display:none}._06p8sG_flow{border-top:1px solid var(--dsw-alias-border-l2);padding-top:16px}._06p8sG_answer{color:var(--dsw-alias-label-primary)}._06p8sG_flow:not([hidden])+._06p8sG_answer{margin-top:24px}._06p8sG_prose{min-width:0;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}._06p8sG_prose p{margin:0 0 12px}._06p8sG_prose p:last-child{margin-bottom:0}._06p8sG_activities{flex-direction:column;gap:8px;min-width:0;padding:8px 0 0 20px;display:flex}._06p8sG_reasoning{overflow-wrap:anywhere;margin:8px 0 0 24px;font-size:13px}._06p8sG_error{color:var(--dsw-alias-state-error-primary,#b42318)}._06p8sG_spinner{animation:1.4s linear infinite _06p8sG_codex-spin}@keyframes _06p8sG_codex-spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){._06p8sG_spinner{animation:none}}[data-chat-flow-kind=assistant-step]:has(>[data-slot]>[data-codex-native-assistant]){display:none}[data-chat-flow-kind=tool-call]:has(>[data-slot]>[data-chat-call-id]>[data-slot]>[data-codex-grouped-call]){display:none}[data-chat-flow-kind=context]:has(>[data-slot]>[data-codex-internal-context]){display:none}[data-chat-flow-kind=relay-codex-process]:has(>[data-slot]>[data-codex-process-fallback]){display:none}[data-chat-flow]:has([data-codex-process-turn][data-status=running])>[role=status][aria-live=polite]{display:none}";
		const tagId$1 = "relay-dsh-plugin-codex/CodexProcessView.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "relay-dsh-plugin-codex";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var CodexProcessView_module_css_default = {
			"activities": "_06p8sG_activities",
			"answer": "_06p8sG_answer",
			"codex-spin": "_06p8sG_codex-spin",
			"count": "_06p8sG_count",
			"error": "_06p8sG_error",
			"flow": "_06p8sG_flow",
			"groupTitle": "_06p8sG_groupTitle",
			"groupToggle": "_06p8sG_groupToggle",
			"process": "_06p8sG_process",
			"processToggle": "_06p8sG_processToggle",
			"prose": "_06p8sG_prose",
			"reasoning": "_06p8sG_reasoning",
			"spinner": "_06p8sG_spinner"
		};
		//#endregion
		//#region src/client/CodexProcessView.tsx
		const markdownLabels = {
			code: {
				copyLabel: "Copy",
				copiedLabel: "Copied"
			},
			footnotes: "Footnotes"
		};
		const compatibleMarkdownLabels = {
			labels: markdownLabels,
			codeLabels: markdownLabels.code
		};
		function groupProcessSegments(segments) {
			const items = [];
			for (const segment of segments) {
				if (segment.kind === "reasoning") continue;
				if (segment.kind === "text" && !segment.text?.trim()) continue;
				if (segment.kind !== "activity") {
					items.push(segment);
					continue;
				}
				const last = items.at(-1);
				if (last && "activities" in last) last.activities.push(segment);
				else items.push({
					key: segment.key,
					activities: [segment]
				});
			}
			return items;
		}
		function CodexProcessView({ node, sessionId, renderMessageImages, useTurnData, useChat, useSession, openFile, fileMentions, turnProcess }) {
			const legacyBoundary = useCompatibleChat({
				useChat,
				useSession
			}, (snapshot) => [...snapshot.nodes.values()].some((candidate) => candidate.kind === "relay-codex-activity" && candidate.anchorSeq >= (node.data.firstVisibleSeq ?? Infinity) && candidate.anchorSeq <= (node.data.lastSeq ?? -1)));
			const safe = canTakeOverCodexProcess(node.data) && !legacyBoundary && !turnProcess?.foldable;
			(0, react.useLayoutEffect)(() => safe ? mountProcess(sessionId, node.data.turn) : void 0, [
				sessionId,
				node.data.turn,
				safe
			]);
			const tail = useTurnData("turn-tail");
			const turn = node.location.kind === "turn" || node.location.kind === "step" ? node.location.turn : void 0;
			const mentions = (0, react.useMemo)(() => {
				if (turn?.status !== "closed" || !tail?.closing) return void 0;
				const owner = {
					turn,
					seq: tail.closing.finalNode.seq,
					openFile
				};
				return codexProducedFileMentions(node.data.segments, openFile, fileMentions(owner));
			}, [
				turn,
				tail,
				node.data.segments,
				openFile,
				fileMentions
			]);
			return safe ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProcessBody, {
				state: node.data,
				renderMessageImages,
				fileMentions: mentions
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				hidden: true,
				"data-codex-process-fallback": true
			});
		}
		function ProcessBody({ state, renderMessageImages, fileMentions }) {
			const [expanded, setExpanded] = (0, react.useState)(null);
			const [now, setNow] = (0, react.useState)(Date.now());
			(0, react.useEffect)(() => {
				if (state.status !== "running") return;
				const timer = setInterval(() => {
					setNow(Date.now());
				}, 1e3);
				return () => {
					clearInterval(timer);
				};
			}, [state.status]);
			const answerKeys = new Set(codexProcessAnswerSegments(state).map((segment) => segment.key));
			const finalIndex = state.segments.findIndex((segment) => answerKeys.has(segment.key));
			const process = finalIndex < 0 ? state.segments : state.segments.slice(0, finalIndex);
			const answer = finalIndex < 0 ? [] : state.segments.slice(finalIndex);
			const deliverables = process.filter((segment) => segment.kind === "image");
			const hasProcess = process.some((segment) => segment.kind !== "text" || Boolean(segment.text?.trim()));
			const open = expanded ?? (state.status === "running" || answer.length === 0 && deliverables.length === 0);
			const visibleAnswer = [...open ? [] : deliverables, ...answer];
			const seconds = Math.max(0, Math.floor(((state.endedAt ?? now) - state.startedAt) / 1e3));
			const elapsed = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
			const status = state.status === "running" ? "Working" : state.status === "error" ? "Stopped" : "Worked";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: CodexProcessView_module_css_default.process,
				"data-codex-process-turn": state.turn,
				"data-status": state.status,
				children: [hasProcess && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					className: CodexProcessView_module_css_default.processToggle,
					type: "button",
					"aria-expanded": open,
					onClick: () => {
						setExpanded(!open);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
						status,
						" for ",
						elapsed
					] }), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(import_lucide_react.ChevronDown, { size: 15 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(import_lucide_react.ChevronRight, { size: 15 })]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: CodexProcessView_module_css_default.flow,
					hidden: !open,
					"data-codex-process-content": true,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProcessItems, {
							segments: process,
							renderMessageImages,
							running: state.status === "running",
							showImages: open
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReasoningSummary, { segments: process }),
						state.error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: CodexProcessView_module_css_default.error,
							role: "status",
							children: state.error
						})
					]
				})] }), visibleAnswer.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: CodexProcessView_module_css_default.answer,
					"data-codex-final-answer": true,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProcessItems, {
						segments: visibleAnswer,
						renderMessageImages,
						running: state.status === "running",
						fileMentions
					})
				})]
			});
		}
		function ProcessItems({ segments, renderMessageImages, running, fileMentions, showImages = true }) {
			return groupProcessSegments(segments).map((item) => "activities" in item ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActivityGroup, { segments: item.activities }, item.key) : item.kind === "image" && item.attachment ? showImages ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react.Fragment, { children: renderMessageImages({
				images: [{ attachment: item.attachment }],
				align: "start"
			}) }, item.key) : null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: CodexProcessView_module_css_default.prose,
				"data-codex-commentary": item.phase !== "final_answer" || void 0,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
					text: item.text ?? "",
					streaming: running && !item.settled,
					...compatibleMarkdownLabels,
					fileMentions
				})
			}, item.key));
		}
		function ActivityGroup({ segments }) {
			const [open, setOpen] = (0, react.useState)(false);
			const activities = segments.flatMap((segment) => segment.activity ? [segment.activity] : []);
			const active = activities.filter((activity) => activity.status === "running");
			const failed = activities.filter((activity) => activity.status === "error").length;
			const current = active.at(-1);
			const representative = current ?? activities.at(-1);
			if (!representative) return null;
			const description = describeActivity(representative);
			const title = current ? description.title : summarizeActivities(activities);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CodexProcessView_module_css_default.group,
				"data-codex-activity-group": true,
				"data-count": activities.length,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: CodexProcessView_module_css_default.groupToggle,
					"aria-expanded": open,
					title,
					onClick: () => {
						setOpen(!open);
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActivityIcon, { category: description.category }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: CodexProcessView_module_css_default.groupTitle,
							children: title
						}),
						active.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(import_lucide_react.LoaderCircle, {
							size: 14,
							className: CodexProcessView_module_css_default.spinner,
							"aria-label": "Running"
						}),
						active.length > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: CodexProcessView_module_css_default.count,
							children: [active.length, " running"]
						}),
						failed > 0 && current && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: CodexProcessView_module_css_default.error,
							children: [failed, " failed"]
						}),
						failed > 0 && !current && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(import_lucide_react.TriangleAlert, {
							size: 14,
							className: CodexProcessView_module_css_default.error,
							"aria-label": "Failed"
						}),
						open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(import_lucide_react.ChevronDown, { size: 14 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(import_lucide_react.ChevronRight, { size: 14 })
					]
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: CodexProcessView_module_css_default.activities,
					children: segments.map((segment) => segment.activity ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActivityRow, { activity: segment.activity }, segment.key) : null)
				})]
			});
		}
		function ReasoningSummary({ segments }) {
			const [open, setOpen] = (0, react.useState)(false);
			const text = segments.filter((segment) => segment.kind === "reasoning").map((segment) => segment.text).filter(Boolean).join("\n\n");
			if (!text) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
				title: "Thinking",
				icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(import_lucide_react.Brain, { size: 16 }),
				open,
				expandable: true,
				expandOnRowClick: true,
				onToggle: () => {
					setOpen(!open);
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: CodexProcessView_module_css_default.reasoning,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
						text,
						...compatibleMarkdownLabels
					})
				})
			});
		}
		//#endregion
		//#region src/client/compatible-runtime.ts
		function conversationEvents(ctx) {
			const events = ctx.get("uiConversation")?.events ?? ctx.get("conversationEvents");
			if (!events) throw new Error("DSH conversation events service is unavailable");
			return events;
		}
		/** Bind setup and disposal to the service family actually present in this DSH. */
		function withConversationRuntime(ctx, setup) {
			const current = ctx.inject(["uiConversation", "modelDirectories"], (inner) => setup(inner));
			const legacy = ctx.inject(["conversationEvents"], (inner) => {
				if (inner.get("uiConversation")) return;
				return setup(inner);
			});
			return () => {
				current.dispose();
				legacy.dispose();
			};
		}
		//#endregion
		//#region src/client/process-presentation.tsx
		/** Reuse only leaf registrations; child-slot authorization stays with DSH. */
		function installProcessPresentation(ctx, debug) {
			conversationEvents(ctx).register(codexProcessDefinition);
			installContextPresentation(ctx, debug);
			ctx.slots.inject("conversation.chat.node", () => {
				const disposeProcess = ctx.slots.register({
					name: "conversation.chat.node",
					key: "relay-codex-process"
				}, CodexProcessView);
				let previous;
				let disposeAssistant;
				const reconcile = () => {
					const original = ctx.slots.entries("conversation.chat.node").find((entry) => entry.options.key === "assistant-step" && (entry.options.priority ?? 0) >= 0);
					if (original === previous) return;
					disposeAssistant?.();
					disposeAssistant = void 0;
					previous = original;
					if (!original || original.children || original.store || original.inject || original.locale !== "chat" && original.locale !== "conversation") return;
					const Original = original.component;
					disposeAssistant = ctx.slots.register({
						name: "conversation.chat.node",
						key: "assistant-step",
						priority: -20,
						locale: original.locale
					}, function CodexAssistantBoundary(props) {
						const process = props.useTurnData("relay-codex-process");
						if (useProcessPresence(props.sessionId, process?.turn ?? -1) && canTakeOverCodexProcess(process) && process?.ownedSteps.includes(props.node.data.step)) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							hidden: true,
							"data-codex-native-assistant": true
						});
						return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Original, { ...props });
					});
				};
				const unsubscribe = ctx.slots.subscribe("conversation.chat.node", reconcile);
				reconcile();
				return () => {
					unsubscribe();
					disposeAssistant?.();
					disposeProcess();
				};
			});
		}
		function installContextPresentation(ctx, debug) {
			ctx.slots.inject("conversation.chat.node", () => {
				let previous;
				let dispose;
				const reconcile = () => {
					const original = ctx.slots.entries("conversation.chat.node").find((entry) => entry.options.key === "context" && (entry.options.priority ?? 0) >= 0);
					if (original === previous) return;
					dispose?.();
					dispose = void 0;
					previous = original;
					if (!original || original.children || original.store || original.inject || original.locale !== "chat" && original.locale !== "conversation") return;
					const Original = original.component;
					dispose = ctx.slots.register({
						name: "conversation.chat.node",
						key: "context",
						priority: -20,
						locale: original.locale
					}, function CodexInternalContext(props) {
						const enabled = (0, react.useSyncExternalStore)(debug.subscribe, debug.getSnapshot, debug.getSnapshot);
						const process = props.useTurnData("relay-codex-process");
						const mounted = useProcessPresence(props.sessionId, process?.turn ?? -1);
						const source = props.node.data.source;
						if (mounted && canTakeOverCodexProcess(process) && !enabled && source?.kind === "plugin" && source.plugin === "@deepseek-ai/dsh-system-prompt") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							hidden: true,
							"data-codex-internal-context": true
						});
						return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Original, { ...props });
					});
				};
				const unsubscribe = ctx.slots.subscribe("conversation.chat.node", reconcile);
				reconcile();
				return () => {
					unsubscribe();
					dispose?.();
				};
			});
		}
		//#endregion
		//#region src/client/codex-activity.ts
		const codexActivityDefinition = {
			kind: "relay-codex-activity",
			target: "chat",
			match: (event) => event.type === "relay-codex/activity" ? {
				id: event.data.itemId,
				role: event.data.phase === "started" ? "start" : "update"
			} : null,
			start: (_context, match) => {
				if (match.event.type !== "relay-codex/activity") throw new Error("Codex activity start requires relay-codex/activity");
				return {
					...match.event.data.activity,
					provenance: {
						threadId: match.event.data.threadId,
						turnId: match.event.data.turnId
					}
				};
			},
			update: (context, match) => match.event.type === "relay-codex/activity" ? {
				...match.event.data.activity,
				provenance: {
					threadId: match.event.data.threadId,
					turnId: match.event.data.turnId
				}
			} : context.state,
			buildViewNode: (context) => {
				if (context.start === void 0 || context.state === void 0) return null;
				return {
					key: context.key,
					kind: "relay-codex-activity",
					id: context.id,
					target: "chat",
					anchorSeq: context.start.event.seq,
					location: context.start.location,
					visibility: "visible",
					data: context.state
				};
			}
		};
		//#endregion
		//#region src/client/locales.ts
		const zh = {
			advancedNav: "高级",
			advancedDebug: "高级调试模式",
			advancedDebugDetail: "轨迹与诊断包",
			statusTitle: "Codex 连接",
			statusLoading: "正在读取",
			statusLoadingDetail: "正在读取 Codex App Server 状态。",
			statusConnected: "已连接",
			statusNotStarted: "未启动",
			statusStarting: "正在启动",
			statusConnectionFailed: "连接失败",
			statusUnavailable: "Codex 不可用",
			statusRebindRequired: "需要重新绑定",
			importAction: "从 Codex 导入",
			importTitle: "导入 Codex 会话",
			importDescription: "将此工作区已有的 Codex 会话接入 DSH。",
			importWorkspaceLabel: "目标 Workspace",
			importChooseWorkspace: "选择要扫描和导入会话的 Workspace。",
			importScanAction: "扫描会话",
			importNoWorkspace: "请先打开一个工作区，再导入 Codex 会话。",
			importScanning: "正在查找此工作区的 Codex 会话...",
			importEmpty: "此工作区没有可导入的 Codex 会话。",
			importFound: "找到",
			importExisting: "已存在",
			importRecoverable: "待恢复",
			importReady: "可导入",
			importCandidates: "可导入的 Codex 会话",
			importSelected: "已选择",
			importSelectAll: "全选",
			importClearSelection: "清空",
			importStatusReady: "可导入",
			importStatusRecoverable: "待恢复",
			importSelectedAction: "导入所选会话",
			importImporting: "正在导入",
			importComplete: "所有会话均已接入 DSH。",
			importPartial: "导入已完成，部分会话需要重试。",
			importImported: "已导入",
			importFailures: "失败",
			importFailed: "导入失败。",
			close: "关闭",
			cancel: "取消",
			retry: "重试"
		};
		const en = {
			advancedNav: "Advanced",
			advancedDebug: "Advanced debugging",
			advancedDebugDetail: "Trajectory and diagnostic archive",
			statusTitle: "Codex connection",
			statusLoading: "Loading",
			statusLoadingDetail: "Reading Codex App Server status.",
			statusConnected: "Connected",
			statusNotStarted: "Not started",
			statusStarting: "Starting",
			statusConnectionFailed: "Connection failed",
			statusUnavailable: "Codex unavailable",
			statusRebindRequired: "Rebind required",
			importAction: "Import from Codex",
			importTitle: "Import Codex Sessions",
			importDescription: "Connect existing Codex sessions for this Workspace to DSH.",
			importWorkspaceLabel: "Target Workspace",
			importChooseWorkspace: "Choose the Workspace whose sessions you want to scan and import.",
			importScanAction: "Scan sessions",
			importNoWorkspace: "Open a Workspace before importing Codex sessions.",
			importScanning: "Finding Codex sessions for this Workspace...",
			importEmpty: "No Codex sessions are available for this Workspace.",
			importFound: "Found",
			importExisting: "Existing",
			importRecoverable: "Recoverable",
			importReady: "Ready",
			importCandidates: "Codex sessions available to import",
			importSelected: "Selected",
			importSelectAll: "Select all",
			importClearSelection: "Clear",
			importStatusReady: "Ready",
			importStatusRecoverable: "Recoverable",
			importSelectedAction: "Import selected",
			importImporting: "Importing",
			importComplete: "All sessions are now available in DSH.",
			importPartial: "Import completed with sessions that need a retry.",
			importImported: "Imported",
			importFailures: "Failed",
			importFailed: "Import failed.",
			close: "Close",
			cancel: "Cancel",
			retry: "Retry"
		};
		//#endregion
		//#region codex-import-contract.mjs
		const CODEX_IMPORT_PATH = "/api/relay/codex/import";
		//#endregion
		//#region src/client/workspace-import-client.mjs
		function resolveImportWorkspace(workspaces, sessions) {
			const current = sessions?.current;
			if (current !== void 0) {
				const owner = workspaces?.items?.find((workspace) => workspace.sessionIds?.includes(current));
				if (owner) return owner;
			}
			const recent = workspaces?.recentWorkspaceId;
			return workspaces?.items?.find((workspace) => workspace.workspaceId === recent) ?? null;
		}
		async function scanCodexWorkspace(cwd, fetchImpl = fetch) {
			const response = await fetchImpl(CODEX_IMPORT_PATH, requestInit("scan", cwd));
			const body = await readJsonResponse(response);
			if (!response.ok) throw new Error(body?.message ?? `Codex import scan failed with HTTP ${response.status}`);
			return body;
		}
		async function importCodexWorkspace(cwd, { threadIds, onProgress } = {}, fetchImpl = fetch) {
			const response = await fetchImpl(CODEX_IMPORT_PATH, requestInit("import", cwd, threadIds));
			if (!response.ok) {
				const body = await readJsonResponse(response);
				throw new Error(body?.message ?? `Codex import failed with HTTP ${response.status}`);
			}
			let completed = null;
			for await (const frame of ndjsonFrames(response.body)) {
				if (frame?.type === "progress") onProgress?.(frame);
				if (frame?.type === "complete") completed = frame.result;
				if (frame?.type === "error") throw new Error(frame.message ?? "Codex import failed");
			}
			if (completed === null) throw new Error("Codex import response ended before completion");
			return completed;
		}
		async function refreshImportedWorkspace(sessions, workspaces) {
			await sessions.refresh();
			await workspaces.refresh();
		}
		async function* ndjsonFrames(body) {
			if (!body || typeof body.getReader !== "function") throw new Error("Codex import response has no readable body");
			const reader = body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			try {
				while (true) {
					const { done, value } = await reader.read();
					buffer += decoder.decode(value, { stream: !done });
					let newline = buffer.indexOf("\n");
					while (newline !== -1) {
						const line = buffer.slice(0, newline).trim();
						buffer = buffer.slice(newline + 1);
						if (line) yield parseFrame(line);
						newline = buffer.indexOf("\n");
					}
					if (done) break;
				}
				const finalLine = buffer.trim();
				if (finalLine) yield parseFrame(finalLine);
			} finally {
				reader.releaseLock();
			}
		}
		function requestInit(action, cwd, threadIds) {
			return {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					action,
					cwd,
					...threadIds === void 0 ? {} : { threadIds }
				})
			};
		}
		async function readJsonResponse(response) {
			try {
				return await response.json();
			} catch {
				return null;
			}
		}
		function parseFrame(line) {
			try {
				return JSON.parse(line);
			} catch {
				throw new Error("Codex import returned malformed progress data");
			}
		}
		//#endregion
		//#region src/client/workspace-import-ui-policy.mjs
		function workspaceImportUiPolicy(phase, selected = 0, failed = 0, hasWorkspace = true) {
			if (phase === "importing") return Object.freeze({
				canClose: false,
				primary: "importing",
				primaryDisabled: true
			});
			if (phase === "summary") return Object.freeze({
				canClose: true,
				secondary: "cancel",
				primary: "import-selected",
				primaryDisabled: selected === 0
			});
			if (phase === "select-workspace") return Object.freeze({
				canClose: true,
				secondary: "cancel",
				primary: "scan",
				primaryDisabled: !hasWorkspace
			});
			if (phase === "error") return Object.freeze({
				canClose: true,
				secondary: "cancel",
				primary: "retry",
				primaryDisabled: false
			});
			if (phase === "complete" && failed > 0) return Object.freeze({
				canClose: true,
				secondary: "close",
				primary: "retry",
				primaryDisabled: false
			});
			return Object.freeze({
				canClose: true,
				primary: "close",
				primaryDisabled: false
			});
		}
		function workspaceImportUpdatedAtDate(value) {
			if (value === null || value === void 0) return null;
			const milliseconds = typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 0xe8d4a51000 ? value * 1e3 : value;
			const date = new Date(milliseconds);
			return Number.isNaN(date.getTime()) ? null : date;
		}
		//#endregion
		//#region \0relay-css-module:./src/client/WorkspaceImportAction.module.css.mjs
		const css = ".MJ4r_a_dialog{width:min(700px,100vw - 32px)}.MJ4r_a_workspaceChoice{flex-direction:column;gap:7px;min-width:0;display:flex}.MJ4r_a_workspaceChoice label{color:var(--dsw-alias-label-primary);letter-spacing:0;font-size:13px;font-weight:500;line-height:20px}.MJ4r_a_workspaceChoice select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-fill-l1);width:100%;min-height:36px;color:var(--dsw-alias-label-primary);font:inherit;letter-spacing:0;border-radius:6px;padding:0 32px 0 10px;font-size:13px}.MJ4r_a_workspaceChoice select:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.MJ4r_a_workspacePath{overflow-wrap:anywhere;color:var(--dsw-alias-label-tertiary);letter-spacing:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:17px}.MJ4r_a_body{flex-direction:column;gap:18px;min-height:128px;display:flex}.MJ4r_a_workspace{border-bottom:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:3px;min-width:0;padding-bottom:12px;display:flex}.MJ4r_a_workspace strong{overflow-wrap:anywhere;color:var(--dsw-alias-label-primary);letter-spacing:0;font-size:14px;font-weight:500;line-height:20px}.MJ4r_a_workspace span{color:var(--dsw-alias-label-tertiary);letter-spacing:0;overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:17px;overflow:hidden}.MJ4r_a_message,.MJ4r_a_error,.MJ4r_a_success,.MJ4r_a_partial{letter-spacing:0;margin:0;font-size:13px;line-height:20px}.MJ4r_a_message{color:var(--dsw-alias-label-secondary)}.MJ4r_a_error,.MJ4r_a_dangerValue{color:var(--dsw-alias-state-error-primary)}.MJ4r_a_success,.MJ4r_a_accentValue{color:var(--dsw-alias-state-success-primary)}.MJ4r_a_partial{color:var(--dsw-alias-state-error-secondary)}.MJ4r_a_metrics{border-top:1px solid var(--dsw-alias-border-l2);border-left:1px solid var(--dsw-alias-border-l2);grid-template-columns:repeat(2,minmax(0,1fr));margin:0;display:grid}.MJ4r_a_summary{flex-direction:column;gap:14px;min-width:0;display:flex}.MJ4r_a_selectionToolbar{min-height:28px;color:var(--dsw-alias-label-secondary);letter-spacing:0;justify-content:space-between;align-items:center;gap:12px;font-size:12px;line-height:18px;display:flex}.MJ4r_a_selectionToolbar>div{gap:4px;display:flex}.MJ4r_a_selectionToolbar button{min-height:28px;color:var(--dsw-alias-state-business-primary);cursor:pointer;font:inherit;letter-spacing:0;background:0 0;border:0;border-radius:4px;padding:0 8px}.MJ4r_a_selectionToolbar button:hover{background:var(--dsw-alias-fill-l2)}.MJ4r_a_selectionToolbar button:focus-visible,.MJ4r_a_candidates input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.MJ4r_a_candidates{border-top:1px solid var(--dsw-alias-border-l2);flex-direction:column;max-height:min(390px,48vh);margin:0;padding:0;list-style:none;display:flex;overflow-y:auto}.MJ4r_a_candidates li{border-bottom:1px solid var(--dsw-alias-border-l2);min-width:0}.MJ4r_a_candidates label{cursor:pointer;grid-template-columns:18px minmax(0,1fr);gap:10px;min-width:0;padding:11px 4px;display:grid}.MJ4r_a_candidates input{width:16px;height:16px;accent-color:var(--dsw-alias-state-business-primary);margin:2px 0 0}.MJ4r_a_candidateBody{flex-direction:column;gap:2px;min-width:0;display:flex}.MJ4r_a_candidateHeading{justify-content:space-between;align-items:flex-start;gap:12px;min-width:0;display:flex}.MJ4r_a_candidateHeading strong{overflow-wrap:anywhere;min-width:0;color:var(--dsw-alias-label-primary);letter-spacing:0;font-size:13px;font-weight:500;line-height:19px}.MJ4r_a_candidateHeading>span{color:var(--dsw-alias-state-success-primary);letter-spacing:0;flex:none;font-size:11px;line-height:18px}.MJ4r_a_candidateBody code,.MJ4r_a_candidateBody>span,.MJ4r_a_candidateBody time{overflow-wrap:anywhere;min-width:0;color:var(--dsw-alias-label-tertiary);letter-spacing:0;font-size:11px;line-height:17px}.MJ4r_a_candidateBody code{color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.MJ4r_a_metric{border-right:1px solid var(--dsw-alias-border-l2);border-bottom:1px solid var(--dsw-alias-border-l2);min-width:0;padding:10px 12px}.MJ4r_a_metric dt{color:var(--dsw-alias-label-tertiary);letter-spacing:0;font-size:11px;line-height:16px}.MJ4r_a_metric dd{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;letter-spacing:0;margin:2px 0 0;font-size:18px;font-weight:500;line-height:24px}.MJ4r_a_progress{flex-direction:column;gap:10px;display:flex}.MJ4r_a_progressCopy{color:var(--dsw-alias-label-secondary);letter-spacing:0;justify-content:space-between;align-items:center;gap:16px;font-size:13px;line-height:20px;display:flex}.MJ4r_a_progressCopy strong{color:var(--dsw-alias-label-primary);font-weight:500}.MJ4r_a_progress progress{width:100%;height:6px;accent-color:var(--dsw-alias-state-business-primary)}.MJ4r_a_failures{flex-direction:column;gap:8px;margin:14px 0 0;padding:0;list-style:none;display:flex}.MJ4r_a_failures li{min-width:0;color:var(--dsw-alias-label-secondary);letter-spacing:0;grid-template-columns:minmax(88px,auto) minmax(0,1fr);gap:10px;font-size:12px;line-height:18px;display:grid}.MJ4r_a_failures code,.MJ4r_a_failures span{overflow-wrap:anywhere}.MJ4r_a_failures code{color:var(--dsw-alias-state-error-primary)}@media (width<=520px){.MJ4r_a_dialog{width:calc(100vw - 20px)}.MJ4r_a_metrics{grid-template-columns:minmax(0,1fr)}.MJ4r_a_selectionToolbar,.MJ4r_a_candidateHeading{flex-direction:column;align-items:flex-start}.MJ4r_a_candidateHeading{gap:2px}}";
		const tagId = "relay-dsh-plugin-codex/WorkspaceImportAction.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "relay-dsh-plugin-codex";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var WorkspaceImportAction_module_css_default = {
			"accentValue": "MJ4r_a_accentValue",
			"body": "MJ4r_a_body",
			"candidateBody": "MJ4r_a_candidateBody",
			"candidateHeading": "MJ4r_a_candidateHeading",
			"candidates": "MJ4r_a_candidates",
			"dangerValue": "MJ4r_a_dangerValue",
			"dialog": "MJ4r_a_dialog",
			"error": "MJ4r_a_error",
			"failures": "MJ4r_a_failures",
			"message": "MJ4r_a_message",
			"metric": "MJ4r_a_metric",
			"metrics": "MJ4r_a_metrics",
			"partial": "MJ4r_a_partial",
			"progress": "MJ4r_a_progress",
			"progressCopy": "MJ4r_a_progressCopy",
			"selectionToolbar": "MJ4r_a_selectionToolbar",
			"success": "MJ4r_a_success",
			"summary": "MJ4r_a_summary",
			"workspace": "MJ4r_a_workspace",
			"workspaceChoice": "MJ4r_a_workspaceChoice",
			"workspacePath": "MJ4r_a_workspacePath"
		};
		//#endregion
		//#region src/client/WorkspaceImportAction.tsx
		function WorkspaceImportProvider({ registerProvider, useWorkspaceImportWorkspaces, useWorkspaceImportSessions, scanWorkspace, importWorkspace, refreshWorkspaceState, t }) {
			const workspaces = useWorkspaceImportWorkspaces((value) => value);
			const availableTarget = resolveImportWorkspace(workspaces, useWorkspaceImportSessions((value) => value));
			const [open, setOpen] = (0, react.useState)(false);
			const [target, setTarget] = (0, react.useState)(null);
			const [phase, setPhase] = (0, react.useState)("idle");
			const [summary, setSummary] = (0, react.useState)(null);
			const [candidates, setCandidates] = (0, react.useState)([]);
			const [selectedIds, setSelectedIds] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [progress, setProgress] = (0, react.useState)(null);
			const [result, setResult] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)("");
			const request = (0, react.useRef)(0);
			const close = () => {
				if (!workspaceImportUiPolicy(phase, selectedIds.size, result?.failed).canClose) return;
				request.current += 1;
				setOpen(false);
			};
			const scan = (workspace) => {
				const generation = ++request.current;
				setPhase("scanning");
				setSummary(null);
				setCandidates([]);
				setSelectedIds(/* @__PURE__ */ new Set());
				setProgress(null);
				setResult(null);
				setError("");
				scanWorkspace(workspace.path).then((response) => {
					if (request.current !== generation) return;
					setSummary(response.summary);
					setCandidates(response.candidates);
					setSelectedIds(new Set(response.candidates.map((candidate) => candidate.id)));
					setPhase("summary");
				}, (reason) => {
					if (request.current !== generation) return;
					setError(messageOf(reason));
					setPhase("error");
				});
			};
			const begin = (0, react.useCallback)(() => {
				const selected = availableTarget ?? workspaces.items[0] ?? null;
				setTarget(selected);
				setOpen(true);
				if (selected === null) {
					setPhase("no-workspace");
					return;
				}
				setPhase("select-workspace");
			}, [availableTarget, workspaces.items]);
			(0, react.useEffect)(() => registerProvider({
				id: "codex",
				label: t("importAction"),
				icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCodeOutline16, { size: 16 }),
				order: 10,
				open: begin
			}), [
				begin,
				registerProvider,
				t
			]);
			const scanSelected = () => {
				if (target !== null) scan(target);
			};
			const importSelected = () => {
				const threadIds = candidates.filter((candidate) => selectedIds.has(candidate.id)).map((candidate) => candidate.id);
				if (target === null || summary === null || threadIds.length === 0 || phase === "importing") return;
				const generation = ++request.current;
				setPhase("importing");
				setProgress({
					completed: 0,
					total: threadIds.length,
					found: threadIds.length,
					imported: 0,
					existing: 0,
					failed: 0,
					failures: []
				});
				setError("");
				(async () => {
					try {
						const completed = await importWorkspace(target.path, threadIds, (update) => {
							if (request.current === generation) setProgress(update);
						});
						await refreshWorkspaceState();
						if (request.current !== generation) return;
						setResult(completed);
						setPhase("complete");
					} catch (reason) {
						if (request.current !== generation) return;
						setError(messageOf(reason));
						setPhase("error");
					}
				})();
			};
			const retry = () => {
				if (target !== null) scan(target);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open,
				onClose: close,
				title: t("importTitle"),
				closeLabel: t("close"),
				description: t("importDescription"),
				className: WorkspaceImportAction_module_css_default.dialog,
				footer: modalFooter({
					phase,
					selectedCount: selectedIds.size,
					result,
					close,
					scanSelected,
					retry,
					importSelected,
					t
				}),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: WorkspaceImportAction_module_css_default.body,
					"aria-live": "polite",
					children: [
						phase === "select-workspace" && target !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: WorkspaceImportAction_module_css_default.workspaceChoice,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									htmlFor: "codex-import-workspace",
									children: t("importWorkspaceLabel")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
									id: "codex-import-workspace",
									value: target.workspaceId,
									"aria-describedby": "codex-import-workspace-help",
									onChange: (event) => {
										const selected = workspaces.items.find((workspace) => workspace.workspaceId === event.currentTarget.value);
										if (selected !== void 0) setTarget(selected);
									},
									children: workspaces.items.map((workspace) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: workspace.workspaceId,
										children: workspace.title
									}, workspace.workspaceId))
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									id: "codex-import-workspace-help",
									className: WorkspaceImportAction_module_css_default.message,
									children: t("importChooseWorkspace")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: WorkspaceImportAction_module_css_default.workspacePath,
									title: target.path,
									children: target.path
								})
							]
						}),
						target !== null && phase !== "select-workspace" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: WorkspaceImportAction_module_css_default.workspace,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: target.title }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								title: target.path,
								children: target.path
							})]
						}),
						phase === "no-workspace" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: WorkspaceImportAction_module_css_default.message,
							children: t("importNoWorkspace")
						}),
						phase === "scanning" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: WorkspaceImportAction_module_css_default.message,
							children: t("importScanning")
						}),
						phase === "summary" && summary !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SummaryView, {
							summary,
							candidates,
							selectedIds,
							onSelectionChange: setSelectedIds,
							t
						}),
						phase === "importing" && progress !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProgressView, {
							progress,
							t
						}),
						phase === "complete" && result !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResultView, {
							result,
							t
						}),
						phase === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: WorkspaceImportAction_module_css_default.error,
							role: "alert",
							children: error || t("importFailed")
						})
					]
				})
			}) });
		}
		function SummaryView({ summary, candidates, selectedIds, onSelectionChange, t }) {
			const select = (id, checked) => {
				const next = new Set(selectedIds);
				if (checked) next.add(id);
				else next.delete(id);
				onSelectionChange(next);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: WorkspaceImportAction_module_css_default.summary,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
					className: WorkspaceImportAction_module_css_default.metrics,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
							label: t("importFound"),
							value: summary.found
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
							label: t("importExisting"),
							value: summary.existing
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
							label: t("importRecoverable"),
							value: summary.recoverable
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
							label: t("importReady"),
							value: summary.ready,
							accent: true
						})
					]
				}), candidates.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: WorkspaceImportAction_module_css_default.message,
					children: t("importEmpty")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: WorkspaceImportAction_module_css_default.selectionToolbar,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
						t("importSelected"),
						": ",
						selectedIds.size,
						" / ",
						candidates.length
					] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => onSelectionChange(new Set(candidates.map((candidate) => candidate.id))),
						children: t("importSelectAll")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => onSelectionChange(/* @__PURE__ */ new Set()),
						children: t("importClearSelection")
					})] })]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: WorkspaceImportAction_module_css_default.candidates,
					"aria-label": t("importCandidates"),
					children: candidates.map((candidate) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "checkbox",
						checked: selectedIds.has(candidate.id),
						onChange: (event) => select(candidate.id, event.currentTarget.checked)
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: WorkspaceImportAction_module_css_default.candidateBody,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: WorkspaceImportAction_module_css_default.candidateHeading,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: candidate.title }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: candidate.status === "recoverable" ? t("importStatusRecoverable") : t("importStatusReady") })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: candidate.id }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								title: candidate.cwd,
								children: candidate.cwd
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
								dateTime: dateTimeValue(candidate.updatedAt),
								children: formatUpdatedAt(candidate.updatedAt)
							})
						]
					})] }) }, candidate.id))
				})] })]
			});
		}
		function ProgressView({ progress, t }) {
			const maximum = Math.max(1, progress.total);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: WorkspaceImportAction_module_css_default.progress,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: WorkspaceImportAction_module_css_default.progressCopy,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("importImporting") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
						progress.completed,
						" / ",
						progress.total
					] })]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
					value: progress.completed,
					max: maximum,
					"aria-label": t("importImporting")
				})]
			});
		}
		function ResultView({ result, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: result.failed > 0 ? WorkspaceImportAction_module_css_default.partial : WorkspaceImportAction_module_css_default.success,
					children: result.failed > 0 ? t("importPartial") : t("importComplete")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
					className: WorkspaceImportAction_module_css_default.metrics,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
							label: t("importImported"),
							value: result.imported,
							accent: true
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
							label: t("importExisting"),
							value: result.existing
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
							label: t("importFailures"),
							value: result.failed,
							danger: result.failed > 0
						})
					]
				}),
				result.failures.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: WorkspaceImportAction_module_css_default.failures,
					"aria-label": t("importFailures"),
					children: result.failures.map((failure) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: failure.thread }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: failure.message })] }, failure.thread))
				})
			] });
		}
		function Metric({ label, value, accent = false, danger = false }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: WorkspaceImportAction_module_css_default.metric,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
					className: danger ? WorkspaceImportAction_module_css_default.dangerValue : accent ? WorkspaceImportAction_module_css_default.accentValue : void 0,
					children: value
				})]
			});
		}
		function modalFooter({ phase, selectedCount, result, close, scanSelected, retry, importSelected, t }) {
			const policy = workspaceImportUiPolicy(phase, selectedCount, result?.failed, phase !== "no-workspace");
			const actions = {
				cancel: close,
				close,
				"import-selected": importSelected,
				importing: void 0,
				retry,
				scan: scanSelected
			};
			const labels = {
				cancel: t("cancel"),
				close: t("close"),
				"import-selected": t("importSelectedAction"),
				importing: t("importImporting"),
				retry: t("retry"),
				scan: t("importScanAction")
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [policy.secondary !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				variant: "outline",
				onClick: actions[policy.secondary],
				children: labels[policy.secondary]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				variant: policy.primary === "close" ? "outline" : void 0,
				disabled: policy.primaryDisabled,
				onClick: actions[policy.primary],
				children: labels[policy.primary]
			})] });
		}
		function dateTimeValue(value) {
			return workspaceImportUpdatedAtDate(value)?.toISOString();
		}
		function formatUpdatedAt(value) {
			const date = workspaceImportUpdatedAtDate(value);
			return date === null ? "-" : new Intl.DateTimeFormat(void 0, {
				dateStyle: "medium",
				timeStyle: "short"
			}).format(date);
		}
		function messageOf(reason) {
			return reason instanceof Error ? reason.message : String(reason);
		}
		//#endregion
		//#region codex-sync-contract.mjs
		const CODEX_SYNC_PATH = "/api/relay/codex/sync";
		//#endregion
		//#region src/client/session-open-sync.mjs
		const DSH_CURRENT_SESSION_STORAGE_KEY = "dsh.sessions.current";
		function observeSessionOpen(currentProvideInfo, syncSession, onError = console.warn, readFallbackSessionId = readPersistedDshCurrentSessionId) {
			let selectedSessionId = null;
			let selectionRevision = 0;
			let latestOperation = null;
			const runSync = async (sessionId, revision) => {
				for (let attempt = 0; attempt < 2; attempt += 1) try {
					await syncSession(sessionId, () => selectionRevision === revision && selectedSessionId === sessionId);
					return;
				} catch (error) {
					const stillSelected = selectionRevision === revision && selectedSessionId === sessionId;
					if (!stillSelected || attempt === 1) {
						if (stillSelected) selectedSessionId = null;
						onError(error);
						return;
					}
				}
			};
			const reconcile = () => {
				const sessionId = currentProvideInfo.getSnapshot()?.sessionId ?? readFallbackSessionId() ?? null;
				if (sessionId === null && latestOperation !== null) return;
				if (sessionId === selectedSessionId) return;
				selectedSessionId = sessionId;
				selectionRevision += 1;
				if (sessionId === null) return;
				const operation = runSync(String(sessionId), selectionRevision);
				latestOperation = operation;
				operation.finally(() => {
					if (latestOperation === operation) latestOperation = null;
				});
			};
			const unsubscribe = currentProvideInfo.subscribe(reconcile);
			reconcile();
			return unsubscribe;
		}
		async function syncOpenedCodexSession(sessionId, fetchImpl = fetch) {
			const response = await fetchImpl(CODEX_SYNC_PATH, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ sessionId })
			});
			const body = await response.json().catch(() => null);
			if (!response.ok) throw new Error(body?.message ?? `Codex history sync failed with HTTP ${response.status}`);
			if (body?.status !== "synced" && body?.status !== "not-imported") throw new Error("Codex history sync returned an invalid response");
			return body;
		}
		async function syncOpenedCodexSessionAndRefresh(sessionId, refreshSessions, fetchImpl = fetch, openSession = null, writeCurrentSessionId = writePersistedDshCurrentSessionId, isLatestSelection = () => true) {
			const result = await syncOpenedCodexSession(sessionId, fetchImpl);
			const rebuiltSessionId = typeof result.rebuiltSessionId === "string" && result.rebuiltSessionId.trim() ? result.rebuiltSessionId : null;
			if (result.status === "synced" && (result.projectedMessages > 0 || rebuiltSessionId !== null)) await refreshSessions();
			if (rebuiltSessionId !== null && isLatestSelection()) {
				writeCurrentSessionId(rebuiltSessionId);
				try {
					await openSession?.(rebuiltSessionId);
				} catch (error) {
					if (!isLatestSelection()) return result;
					await refreshSessions();
					if (!isLatestSelection()) return result;
					await openSession?.(rebuiltSessionId);
				}
			}
			return result;
		}
		function readPersistedDshCurrentSessionId(storage = browserStorage()) {
			try {
				const raw = storage?.getItem?.(DSH_CURRENT_SESSION_STORAGE_KEY);
				if (!raw) return null;
				const parsed = JSON.parse(raw);
				return typeof parsed?.sessionId === "string" && parsed.sessionId.trim() ? parsed.sessionId : null;
			} catch {
				return null;
			}
		}
		function writePersistedDshCurrentSessionId(sessionId, storage = browserStorage()) {
			const candidate = typeof sessionId === "string" ? sessionId.trim() : "";
			if (!candidate) return;
			try {
				storage?.setItem?.(DSH_CURRENT_SESSION_STORAGE_KEY, JSON.stringify({ sessionId: candidate }));
			} catch {}
		}
		function browserStorage() {
			try {
				return typeof window === "undefined" ? null : window.localStorage;
			} catch {
				return null;
			}
		}
		//#endregion
		//#region src/client/index.ts
		const inject = [
			"slots",
			"theme",
			"locale",
			"sessions",
			"workspaces",
			"connection"
		];
		function apply(ctx) {
			const advancedDebug = applyAdvancedDebug(ctx);
			applyWorkspaceImport(ctx);
			applySessionOpenSync(ctx);
			applyConnectionStatus(ctx);
			return withConversationRuntime(ctx, (inner) => {
				applyActivityPresentation(inner);
				installProcessPresentation(inner, advancedDebug);
				return installModelSelection(inner, "relay-codex", "relay-codex", "relay-claude");
			});
		}
		function applyActivityPresentation(ctx) {
			ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
				name: "tool.call.toolview",
				key: CODEX_ACTIVITY_TOOL
			}, GroupedCodexToolActivityView));
			conversationEvents(ctx).register(codexActivityDefinition);
			ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
				name: "conversation.chat.node",
				key: "relay-codex-activity"
			}, CodexActivityView));
		}
		function applyConnectionStatus(ctx) {
			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "relay-codex-connection-status",
				order: -19,
				locale: "relay.codex"
			}, CodexStatusBadge));
		}
		function applySessionOpenSync(ctx) {
			ctx.effect(() => observeSessionOpen({
				getSnapshot: () => ({ sessionId: ctx.sessions.list.getSnapshot().current }),
				subscribe: (listener) => ctx.sessions.list.subscribe(listener)
			}, (sessionId, isLatestSelection) => syncOpenedCodexSessionAndRefresh(sessionId, () => Promise.all([ctx.sessions.refresh(), ctx.workspaces.refresh()]), fetch, (rebuiltSessionId) => ctx.sessions.open(rebuiltSessionId), void 0, isLatestSelection), (error) => console.warn("Codex open-time history sync failed:", error)), "relay-codex: open-time history sync");
		}
		function applyWorkspaceImport(ctx) {
			const injected = () => ({
				hooks: {
					workspaceImportWorkspaces: ctx.workspaces.list,
					workspaceImportSessions: ctx.sessions.list
				},
				scanWorkspace: (cwd) => scanCodexWorkspace(cwd),
				importWorkspace: (cwd, threadIds, onProgress) => importCodexWorkspace(cwd, {
					threadIds,
					onProgress
				}),
				refreshWorkspaceState: () => refreshImportedWorkspace(ctx.sessions, ctx.workspaces)
			});
			ctx.slots.inject("relay.session-import.provider", () => ctx.slots.register({
				name: "relay.session-import.provider",
				id: "codex",
				order: 10,
				inject: injected,
				locale: "relay.codex"
			}, WorkspaceImportProvider));
		}
		function applyAdvancedDebug(ctx) {
			ctx.effect(() => ctx.locale.register("relay.codex", {
				zh,
				en
			}), "relay-codex: dictionaries");
			const t = ctx.locale.bind("relay.codex");
			const advancedDebug = new AdvancedDebugPreference();
			const hooks = { hooks: { advancedDebug } };
			ctx.effect(() => () => {
				advancedDebug.dispose();
			}, "relay-codex: advanced debug preference");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "relay-codex-advanced-debug",
				order: 90,
				label: () => t("advancedNav"),
				locale: "relay.codex",
				inject: () => ({
					...hooks,
					setAdvancedDebug: (enabled) => {
						advancedDebug.set(enabled);
					}
				})
			}, AdvancedDebugSection));
			// Android keeps DSH's conversation views, including Voice Deck. The
			// upstream simple-mode observer forces every view back to chat.
			ctx.slots.inject("conversation.session.header.utilities", () => {
				let removeShadow;
				const reconcile = () => {
					if (advancedDebug.getSnapshot()) {
						removeShadow?.();
						removeShadow = void 0;
					} else if (removeShadow === void 0) removeShadow = ctx.slots.register({
						name: "conversation.session.header.utilities",
						id: "session-log-download",
						priority: -100
					}, HiddenSessionLogAction);
				};
				const unsubscribe = advancedDebug.subscribe(reconcile);
				reconcile();
				return () => {
					unsubscribe();
					removeShadow?.();
				};
			});
			return advancedDebug;
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
