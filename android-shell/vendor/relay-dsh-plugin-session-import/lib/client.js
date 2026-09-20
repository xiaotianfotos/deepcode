window.__ModuleLoader__.load({
	id: "relay-dsh-plugin-session-import",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region \0relay-css-module:./src/client/SessionImportHub.module.css.mjs
		const css = ".GwK6rW_menuRoot{flex:auto;width:100%;min-width:0}.GwK6rW_menuRootRail{flex:none;width:36px}.GwK6rW_trigger{box-sizing:border-box;width:calc(100% + 4px);height:42px;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;letter-spacing:0;background:0 0;border:0;border-radius:12px;align-items:center;gap:8px;margin:4px -2px;padding:0 10px 0 8px;font-size:14px;line-height:22px;display:flex;overflow:hidden}.GwK6rW_trigger:hover{background:var(--dsw-alias-interactive-bg-hover)}.GwK6rW_trigger:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}.GwK6rW_triggerRail{border-radius:50%;justify-content:center;gap:0;width:36px;height:36px;margin:8px 0 2px;padding:0}.GwK6rW_label{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}";
		const tagId = "relay-dsh-plugin-session-import/SessionImportHub.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "relay-dsh-plugin-session-import";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var SessionImportHub_module_css_default = {
			"label": "GwK6rW_label",
			"menuRoot": "GwK6rW_menuRoot",
			"menuRootRail": "GwK6rW_menuRootRail",
			"trigger": "GwK6rW_trigger",
			"triggerRail": "GwK6rW_triggerRail"
		};
		//#endregion
		//#region src/client/SessionImportHub.tsx
		/** One provider-neutral footer action backed by provider-owned import flows. */
		function SessionImportHub({ wide, renderSlot, t }) {
			const records = (0, react.useRef)(/* @__PURE__ */ new Map());
			const [providers, setProviders] = (0, react.useState)([]);
			const [open, setOpen] = (0, react.useState)(false);
			const publish = (0, react.useCallback)(() => {
				setProviders([...records.current.values()].sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id)));
			}, []);
			const registerProvider = (0, react.useCallback)((provider) => {
				if ([...records.current.values()].some((record) => record.id === provider.id)) throw new Error(`session import provider "${provider.id}" is already registered`);
				const token = Symbol(provider.id);
				records.current.set(token, {
					...provider,
					token
				});
				publish();
				return () => {
					if (!records.current.delete(token)) return;
					publish();
				};
			}, [publish]);
			(0, react.useEffect)(() => {
				if (providers.length === 0) setOpen(false);
			}, [providers.length]);
			const items = providers.map((provider) => ({
				id: provider.id,
				label: provider.label,
				icon: provider.icon
			}));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [renderSlot("relay.session-import.provider", { registerProvider }), providers.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
				className: wide ? SessionImportHub_module_css_default.menuRoot : `${SessionImportHub_module_css_default.menuRoot} ${SessionImportHub_module_css_default.menuRootRail}`,
				open,
				onClose: () => {
					setOpen(false);
				},
				items,
				onSelect: (id) => {
					const provider = providers.find((candidate) => candidate.id === id);
					if (provider === void 0) return;
					setOpen(false);
					provider.open();
				},
				side: wide ? "top" : "right",
				portal: true,
				anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
					label: t("importSessions"),
					side: "top",
					delayMs: 500,
					disabled: wide,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: wide ? SessionImportHub_module_css_default.trigger : `${SessionImportHub_module_css_default.trigger} ${SessionImportHub_module_css_default.triggerRail}`,
						"aria-label": t("importSessions"),
						"aria-haspopup": "menu",
						"aria-expanded": open,
						"data-session-import-hub": "true",
						onClick: () => {
							setOpen((value) => !value);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDownloadOutline16, { size: wide ? 16 : 18 }), wide && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SessionImportHub_module_css_default.label,
							children: t("importSessions")
						})]
					})
				})
			})] });
		}
		//#endregion
		//#region src/client/locales.ts
		const en = { importSessions: "Import sessions..." };
		const zh = { importSessions: "导入会话..." };
		//#endregion
		//#region src/client/index.ts
		const inject = ["slots", "locale"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register("relay.session-import", {
				zh,
				en
			}), "relay-session-import: dictionaries");
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "relay-session-import-hub",
				order: -10,
				children: { "relay.session-import.provider": {
					kind: "list",
					scope: "root"
				} },
				locale: "relay.session-import"
			}, SessionImportHub));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map