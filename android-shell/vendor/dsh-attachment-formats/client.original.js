// dsh-attachment-formats — browser half.
//
// Codex 风格的附件格式扩展，不改动任何核心包：
//
//   1. `conversation.input.left` 增加一枚回形针按钮（文件选择器入口）；
//   2. 文档级 capture 监听拦截拖放/粘贴：凡包含「原生图片之外」格式的
//      文件一律由本插件接管（原生图片仍走内建管线）；
//   3. PDF → 上传主机路由逐页渲染成 PNG/JPEG，再以「合成 drop」重新投喂
//      给内建的图片草稿栏（沿用原生限额校验、历史渲染、模型请求管道）；
//   4. docx/xlsx/pptx → 主机提取文本；txt/md/代码等 → 浏览器本地读取；
//      文本统一注入输入框草稿（带 [附件: 文件名] 标记，可编辑）；
//   5. BMP/ICO/AVIF/SVG 等浏览器可解码图片 → 画布转 PNG 后同样走合成 drop；
//   6. `conversation.input.dock` 显示转换进度/错误状态条。
window.__ModuleLoader__.load({
	id: "dsh-attachment-formats",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let jsxRuntime = require("react/jsx-runtime");
		let primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		const { useState, useEffect, useRef, useCallback, useSyncExternalStore } = react;
		const { jsx, jsxs, Fragment } = jsxRuntime;
		const { Tooltip, IconPaperclipOutline16 } = primitives;

		// ---- constants ---------------------------------------------------
		const ROUTE_PATH = "/api/attach-formats/convert";
		const MAX_TEXT_BYTES = 2 * 1024 * 1024;
		const MAX_TEXT_CHARS = 300_000;
		/** 文本直插草稿的阈值；超过则上传主机走索引卡模式（T2）。 */
		const DIRECT_TEXT_CHARS = 80_000;
		/** 长文本上传主机的字节上限。 */
		const MAX_CACHE_BYTES = 16 * 1024 * 1024;
		const RASTER_PIXEL_CAP = 8_000_000; // 降采样阈值（原生限额为 4e7）
		const NATIVE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
		const TEXT_EXTENSIONS = new Set([
			"txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "ndjson", "yaml", "yml",
			"toml", "ini", "cfg", "conf", "env", "log", "xml", "html", "htm", "css", "scss",
			"less", "js", "mjs", "cjs", "jsx", "ts", "tsx", "py", "java", "kt", "kts", "c", "h",
			"cpp", "hpp", "cc", "cs", "go", "rs", "rb", "php", "swift", "scala", "sql", "r",
			"lua", "pl", "dart", "ex", "exs", "elm", "hs", "clj", "fs", "fsx", "vue", "svelte",
			"graphql", "gql", "proto", "sh", "bat", "cmd", "ps1", "dockerfile", "makefile",
			"cmake", "gradle", "properties", "gitignore", "gitattributes", "editorconfig", "tex", "rst"
		]);
		const ACCEPT = [
			"image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp", "image/avif",
			"image/svg+xml", "image/x-icon", "image/tiff", "application/pdf",
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			"application/vnd.openxmlformats-officedocument.presentationml.presentation",
			"application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint",
			"application/epub+zip", "application/vnd.oasis.opendocument.text", "application/rtf",
			"text/plain", "text/markdown", "text/csv", "application/json", "application/xml",
			".js", ".ts", ".jsx", ".tsx", ".py", ".java", ".go", ".rs", ".c", ".h", ".cpp",
			".cs", ".rb", ".php", ".sh", ".bat", ".ps1", ".sql", ".yaml", ".yml", ".toml",
			".ini", ".log", ".vue", ".svelte", ".css", ".scss", ".html", ".graphql",
			".doc", ".xls", ".ppt", ".tiff", ".tif", ".epub", ".odt", ".rtf"
		].join(",");

		// ---- tiny state bus for the status dock --------------------------
		let busState = null;
		const busListeners = new Set();
		function setBus(patch) {
			busState = patch === null ? null : { seq: Date.now(), ...patch };
			for (const listener of busListeners) listener();
		}
		function subscribeBus(listener) {
			busListeners.add(listener);
			return () => {
				busListeners.delete(listener);
			};
		}
		function useBusState() {
			return useSyncExternalStore(subscribeBus, () => busState, () => null);
		}

		// ---- document chips store（Codex 式：内容挂卡片，输入框保持干净）----
		// { sessionId, items: [{ key, name, kind: "text"|"card"|"note", text, chars }] }
		let chipsState = { sessionId: undefined, items: [] };
		const chipsListeners = new Set();
		function setChips(items, sessionId) {
			chipsState = { sessionId, items };
			for (const listener of chipsListeners) listener();
		}
		function subscribeChips(listener) {
			chipsListeners.add(listener);
			return () => {
				chipsListeners.delete(listener);
			};
		}
		function useChipsState() {
			return useSyncExternalStore(subscribeChips, () => chipsState, () => ({ sessionId: undefined, items: [] }));
		}
		let chipSeq = 0;
		function addChips(entries, sessionId) {
			const current = chipsState.sessionId === sessionId ? chipsState.items : [];
			const next = [...current];
			for (const entry of entries) {
				next.push({ key: `chip-${++chipSeq}`, chars: entry.text.length, ...entry });
			}
			setChips(next, sessionId);
		}
		function currentSessionId() {
			return shellCurrentSessionId() ?? activeSession.sessionId;
		}
		function removeChip(key) {
			const sessionId = currentSessionId();
			const current = chipsState.sessionId === sessionId ? chipsState.items : [];
			const next = current.filter((item) => item.key !== key);
			setChips(next, sessionId);
			// 最后一张卡片移除后，立即清掉残留的"已挂载"提示（不留 6 秒尾巴）
			if (next.length === 0 && busState !== null && busState.phase === "done") setBus(null);
		}

		// ---- helpers ------------------------------------------------------
		function extensionOf(name) {
			const base = String(name ?? "").toLowerCase();
			const dot = base.lastIndexOf(".");
			if (dot < 0 || dot === base.length - 1) return "";
			return base.slice(dot + 1);
		}
		function baseNameOf(name) {
			const base = String(name ?? "").replace(/\\/g, "/").split("/").pop() ?? "attachment";
			const dot = base.lastIndexOf(".");
			return dot > 0 ? base.slice(0, dot) : base;
		}
		function bytesToBase64(bytes) {
			let binary = "";
			const chunk = 32768;
			for (let offset = 0; offset < bytes.length; offset += chunk) {
				binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
			}
			return btoa(binary);
		}
		function b64ToBytes(data) {
			const binary = atob(String(data ?? ""));
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
			return bytes;
		}
		function composerTextarea() {
			const el = document.querySelector("[data-composer-card] textarea");
			return el instanceof HTMLTextAreaElement ? el : null;
		}
		function composerReady() {
			const el = composerTextarea();
			if (el === null) return false;
			return !el.disabled && !el.readOnly;
		}

		// ---- classification ----------------------------------------------
		function classifyFile(file) {
			const type = (file.type || "").toLowerCase();
			const ext = extensionOf(file.name);
			if (NATIVE_IMAGE_TYPES.has(type)) return "native-image";
			if (type === "application/pdf" || ext === "pdf") return "pdf";
			if (ext === "docx" || ext === "xlsx" || ext === "pptx") return ext;
			if (ext === "doc" || ext === "xls" || ext === "ppt") return ext;
			if (ext === "epub" || ext === "odt" || ext === "rtf") return ext;
			if (ext === "tiff" || ext === "tif" || type === "image/tiff") return "tiff";
			if (ext === "svg" || type === "image/svg+xml") return "browser-image";
			if (type.startsWith("image/")) return "browser-image";
			if (
				TEXT_EXTENSIONS.has(ext) ||
				type.startsWith("text/") ||
				type === "application/json" ||
				type.endsWith("+json") ||
				type === "application/xml" ||
				type === "application/x-yaml" ||
				type === "application/javascript"
			) return "text";
			return "unsupported";
		}

		// ---- local conversions ---------------------------------------------
		function loadImage(url) {
			return new Promise((resolve, reject) => {
				const img = new Image();
				img.onload = () => resolve(img);
				img.onerror = () => reject(new Error("图片解码失败"));
				img.src = url;
			});
		}
		function canvasToPngFile(canvas, name) {
			return new Promise((resolve) => {
				canvas.toBlob((blob) => {
					if (blob === null) {
						resolve(null);
						return;
					}
					resolve(new File([blob], name, { type: "image/png" }));
				}, "image/png");
			});
		}
		function drawIntoPng(source, width, height, name) {
			const scale = Math.min(1, Math.sqrt(RASTER_PIXEL_CAP / Math.max(1, width * height)));
			const w = Math.max(1, Math.round(width * scale));
			const h = Math.max(1, Math.round(height * scale));
			const canvas = document.createElement("canvas");
			canvas.width = w;
			canvas.height = h;
			const context = canvas.getContext("2d");
			if (context === null) return Promise.resolve(null);
			context.fillStyle = "#ffffff";
			context.fillRect(0, 0, w, h);
			try {
				context.drawImage(source, 0, 0, w, h);
			} catch {
				return Promise.resolve(null);
			}
			return canvasToPngFile(canvas, name);
		}
		async function fileToPngFile(file) {
			const stem = baseNameOf(file.name) || "image";
			const name = `${stem}.png`;
			if ((file.type || "").toLowerCase() === "image/svg+xml" || extensionOf(file.name) === "svg") {
				const text = await file.text();
				const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
				try {
					const img = await loadImage(url);
					const w = img.naturalWidth || img.width || 1024;
					const h = img.naturalHeight || img.height || 1024;
					return await drawIntoPng(img, w, h, name);
				} finally {
					URL.revokeObjectURL(url);
				}
			}
			let bitmap = null;
			try {
				bitmap = await createImageBitmap(file);
			} catch {
				const url = URL.createObjectURL(file);
				try {
					const img = await loadImage(url);
					return await drawIntoPng(img, img.naturalWidth || img.width, img.naturalHeight || img.height, name);
				} catch {
					return null;
				} finally {
					URL.revokeObjectURL(url);
				}
			}
			try {
				return await drawIntoPng(bitmap, bitmap.width, bitmap.height, name);
			} finally {
				bitmap.close();
			}
		}
		function countReplacement(text) {
			let count = 0;
			for (let i = 0; i < text.length; i += 1) {
				if (text.charCodeAt(i) === 0xfffd) count += 1;
			}
			return count;
		}
		async function fileToText(file) {
			if (file.size > MAX_TEXT_BYTES) {
				throw new Error(`文本文件过大（超过 ${Math.round(MAX_TEXT_BYTES / 1024 / 1024)}MB），未附加`);
			}
			const bytes = new Uint8Array(await file.arrayBuffer());
			const head = bytes.subarray(0, Math.min(8192, bytes.length));
			let nuls = 0;
			for (const byte of head) {
				if (byte === 0) nuls += 1;
			}
			if (nuls > head.length * 0.02) {
				throw new Error("文件看起来是二进制内容，未按文本附加");
			}
			let text = new TextDecoder("utf-8").decode(bytes);
			const utf8Broken = countReplacement(text);
			if (utf8Broken > Math.min(64, Math.max(8, text.length * 0.005))) {
				try {
					const alt = new TextDecoder("gb18030").decode(bytes);
					if (countReplacement(alt) < utf8Broken) text = alt;
				} catch {
					/* gb18030 unavailable — keep utf-8 */
				}
			}
			if (text.length > MAX_TEXT_CHARS) {
				text = `${text.slice(0, MAX_TEXT_CHARS)}\n…[内容过长，已截断]`;
			}
			return text;
		}

		// ---- host conversion -----------------------------------------------
		/** 浏览器本地 SHA-256（完整内容哈希，供 host 同源判定；不可用时返回 null）。 */
		async function fileSha256(file) {
			try {
				const bytes = new Uint8Array(await file.arrayBuffer());
				const digest = await crypto.subtle.digest("SHA-256", bytes);
				return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
			} catch {
				return null;
			}
		}
		/**
		 * 工作区零拷贝：按「文件名 + 字节数 + 完整 SHA-256」询问主机是否有
		 * 同源文件（P2-1）。name+size 只是候选过滤，哈希相等才算同源——
		 * 同名同大小的不同内容绝不挂成 workspace ref。
		 */
		async function resolveWorkspaceRef(file, cwd, sessionId) {
			try {
				const hash = await fileSha256(file);
				if (hash === null) return null;
				const params = new URLSearchParams({ name: file.name, size: String(file.size), hash });
				if (cwd !== undefined) params.set("cwd", cwd);
				if (sessionId !== undefined) params.set("sessionId", sessionId);
				const response = await fetch(`/api/attach-formats/resolve?${params.toString()}`, {
					signal: AbortSignal.timeout(4000)
				});
				if (!response.ok) return null;
				const payload = await response.json();
				if (payload?.ok !== true || payload?.found !== true || typeof payload.rel !== "string") return null;
				return payload.rel;
			} catch {
				return null;
			}
		}
		async function convertRemote(file, kind, cwd, sessionId, directLimit) {
			const data = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
			let response;
			try {
				response = await fetch(ROUTE_PATH, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						cwd,
						sessionId,
						directLimitChars: directLimit,
						files: [{ name: file.name, kind, data }]
					})
				});
			} catch {
				throw new Error("转换服务不可用（主机插件未加载？）");
			}
			if (!response.ok) throw new Error(`转换服务错误 (HTTP ${response.status})`);
			const payload = await response.json();
			if (!payload || payload.ok !== true) {
				throw new Error(payload?.error?.message ?? "转换服务返回异常");
			}
			const result = Array.isArray(payload.results) ? payload.results[0] : null;
			if (result === null || result === undefined) throw new Error("转换服务未返回结果");
			if (result.kind === "error") throw new Error(result.error?.message ?? "转换失败");
			return result;
		}

		// ---- injection into the native pipeline ------------------------------
		function redispatchDrop(files) {
			const dt = new DataTransfer();
			for (const file of files) dt.items.add(file);
			let event;
			try {
				event = new DragEvent("drop", { bubbles: false, cancelable: true, dataTransfer: dt });
			} catch {
				event = new Event("drop", { bubbles: false, cancelable: true });
				Object.defineProperty(event, "dataTransfer", { value: dt });
			}
			document.dispatchEvent(event);
		}
		function injectTexts(notes) {
			const el = composerTextarea();
			if (el === null) return false;
			const blocks = notes
				.map(({ name, text, note, raw }) => (raw
					? `\n\n${text}`
					: note
						? `\n\n[附件说明: ${name}]\n${text}`
						: `\n\n[附件: ${name}]\n${text}`))
				.join("");
			const current = el.value;
			const next = current.trim() === "" ? blocks.replace(/^\n+/, "") : current + blocks;
			const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
			setter.call(el, next);
			// 合并自检：DOM 值未生效说明桥接失败——绝不静默丢内容
			if (el.value !== next) return false;
			el.setSelectionRange(next.length, next.length);
			el.dispatchEvent(new Event("input", { bubbles: true }));
			try {
				el.focus({ preventScroll: false });
			} catch {
				/* focus is best-effort */
			}
			return true;
		}

		// ---- send-time merge（发送瞬间把文档卡片并入草稿，再走原生提交）----
		function mergeChipsIntoDraft() {
			const sessionId = currentSessionId();
			const mine = chipsState.sessionId === sessionId ? chipsState.items : [];
			if (mine.length === 0) return;
			const el = composerTextarea();
			if (el === null || el.disabled || el.readOnly) return; // 忙/锁定：不合并，卡片保留
			const merged = injectTexts(mine.map((item) => ({
				name: item.name,
				text: item.text,
				note: item.kind === "note",
				raw: item.kind === "card" || item.kind === "ref"
			})));
			if (!merged) {
				// 桥接失败：卡片保留，明确报错（不让用户以为已发送）
				setBus({
					phase: "error",
					label: "卡片内容未能并入输入框",
					detail: "请使用卡片条的「发送」按钮重试；若仍失败，先移除卡片后手动复制内容"
				});
				return;
			}
			setChips([], sessionId);
			// 卡片并入草稿后，清掉残留的"已挂载"提示
			if (busState !== null && busState.phase === "done") setBus(null);
		}
		function sendChipsNow() {
			mergeChipsIntoDraft();
			const el = composerTextarea();
			if (el === null) return;
			try {
				el.focus({ preventScroll: false });
			} catch {
				/* focus is best-effort */
			}
			// 合成 Enter：即使原生发送按钮因空草稿被禁用，键盘提交路径也有效
			el.dispatchEvent(new KeyboardEvent("keydown", {
				key: "Enter",
				code: "Enter",
				keyCode: 13,
				which: 13,
				bubbles: true,
				cancelable: true
			}));
		}

		// ---- intake pipeline --------------------------------------------------
		// 会话归属解析顺序（修复「附件跑到别的对话框」）：
		//   1. 按钮路径：按钮组件自身的 sessionId prop（按构造精确）；
		//   2. 拖放/粘贴路径：sessions.list.getSnapshot().current —— shell 的
		//      「当前打开会话」，即用户正在看的这个对话框（document title 同源）；
		//   3. 兜底：input.left 插槽 inject 留下的单例（多会话挂载时按渲染
		//      顺序 last-writer-wins，不可靠，只作最后兜底）。
		let activeSession = { sessionId: undefined, cwd: undefined, sessionsService: undefined };
		function shellCurrentSessionId() {
			const { sessionsService } = activeSession;
			if (sessionsService === undefined) return undefined;
			try {
				const snapshot = sessionsService.list.getSnapshot();
				return typeof snapshot?.current === "string" && snapshot.current !== "" ? snapshot.current : undefined;
			} catch {
				return undefined;
			}
		}
		function resolveSessionId(explicit) {
			if (typeof explicit === "string" && explicit !== "") return explicit;
			return shellCurrentSessionId() ?? activeSession.sessionId;
		}
		function currentCwd() {
			const { sessionsService } = activeSession;
			if (sessionsService === undefined) return undefined;
			try {
				const snapshot = sessionsService.list.getSnapshot();
				const id = resolveSessionId(undefined);
				return snapshot?.byId?.[id]?.cwd ?? undefined;
			} catch {
				return undefined;
			}
		}
		let intakeSeq = 0;
		// ---- v2b：上下文余量感知的直插上限 -------------------------------
		// 读 token-meter 的 contextPressure 投影（contextWindow × projectedTokens），
		// 换算为保守字符预算（中文 ≈1.5 字符/token）；缺数据回退固定阈值。
		function contextBudgetChars() {
			const { sessionsService } = activeSession;
			const sessionId = resolveSessionId(undefined);
			if (sessionsService === undefined || sessionId === undefined) return undefined;
			try {
				const face = sessionsService.binding(sessionId)?.session?.projections?.faceOf?.("contextPressure");
				const snapshot = face?.getSnapshot?.();
				if (snapshot === null || snapshot === undefined || typeof snapshot !== "object") return undefined;
				const windowTokens = snapshot.contextWindow;
				const usedTokens = Number.isFinite(snapshot.projectedTokens) ? snapshot.projectedTokens : snapshot.surfaceTokens;
				if (!Number.isFinite(windowTokens) || !Number.isFinite(usedTokens)) return undefined;
				const reserve = Math.max(2000, windowTokens * 0.15);
				const remaining = windowTokens - usedTokens - reserve;
				if (remaining <= 0) return 4000; // 余量耗尽：一律索引卡
				return Math.max(4000, Math.floor(remaining * 1.5));
			} catch {
				return undefined;
			}
		}
		function currentDirectLimit() {
			const budget = contextBudgetChars();
			return budget === undefined ? DIRECT_TEXT_CHARS : Math.min(DIRECT_TEXT_CHARS, budget);
		}
		/** 当前会话输入 phase（adjudicating/submitting 视为忙——原生 drop 会拒绝）。 */
		function currentSessionPhase(sessionId) {
			try {
				const svc = activeSession.sessionsService;
				if (svc === undefined || sessionId === undefined) return undefined;
				const binding = svc.binding?.(sessionId);
				const input = binding?.hooks?.input ?? svc.provideInfo?.(sessionId)?.hooks?.input;
				return input?.getSnapshot?.()?.phase;
			} catch {
				return undefined;
			}
		}
		/** 等当前会话空闲再投喂图片（忙时原生管线会拒绝合成 drop，图片会流到其它空闲会话）。 */
		function waitForSessionIdle(sessionId, timeoutMs = 15_000) {
			return new Promise((resolve) => {
				const busy = (phase) => phase === "adjudicating" || phase === "submitting";
				if (!busy(currentSessionPhase(sessionId))) {
					resolve();
					return;
				}
				const deadline = Date.now() + timeoutMs;
				const timer = setInterval(() => {
					const phase = currentSessionPhase(sessionId);
					if (!busy(phase) || Date.now() > deadline) {
						clearInterval(timer);
						resolve();
					}
				}, 250);
			});
		}
		async function intake(files, explicitSessionId) {
			const seq = ++intakeSeq;
			if (files.length === 0) return;
			if (!composerReady()) {
				setBus({
					phase: "error",
					label: "无法接收附件",
					detail: "请先选择/创建工作区，并等待当前回复完成后再试"
				});
				return;
			}
			const cwd = currentCwd();
			const sessionId = resolveSessionId(explicitSessionId);
			const directLimit = currentDirectLimit();
			const images = [];
			const chips = [];
			const failedNames = [];
			let firstError = null;
			let budgetTiered = false;
			setBus({
				phase: "working",
				label: files.length === 1 ? `正在处理 ${files[0].name}` : `正在处理 ${files.length} 个文件`,
				detail: ""
			});
			for (const file of files) {
				const kind = classifyFile(file);
				try {
					switch (kind) {
						case "native-image": {
							images.push(file);
							break;
						}
						case "browser-image": {
							setBus({ phase: "working", label: file.name, detail: "正在转换为图片…" });
							const png = await fileToPngFile(file);
							if (png !== null) images.push(png);
							else setBus({ phase: "error", label: file.name, detail: "图片解码失败，已跳过" });
							break;
						}
						case "text": {
							// 超过主机转存上限：无法零拷贝、也无法上传（零拷贝哈希会读
							// 整个文件，>16MB 时成本过高，直接拒绝）
							if (file.size > MAX_CACHE_BYTES) {
								throw new Error(`文件过大（超过 ${Math.round(MAX_CACHE_BYTES / 1024 / 1024)}MB），未附加`);
							}
							// 工作区零拷贝（P2-1）：较大文本文件先按「名 + 大小 + 完整
							// SHA-256」解析同源路径，命中则挂「引用」卡片，不读内容、
							// 不上传字节，模型用 read 工具读取。
							if (file.size > 512 * 1024) {
								setBus({ phase: "working", label: file.name, detail: "正在校验工作区同源文件…" });
								const ref = await resolveWorkspaceRef(file, cwd, sessionId);
								if (ref !== null) {
									chips.push({
										name: file.name,
										kind: "ref",
										text: `[附件引用: ${file.name}]\n工作区文件: ${ref}\n（内容未上传；用 read 工具按行读取，行号即出处坐标）`,
										tagExtra: "引用"
									});
									break;
								}
							}
							// ≤2MB：本地解码判断直插还是转存；2–16MB：本地不再解码
							// （避免大文本拖慢浏览器），直接交主机 text-cache 全量落盘。
							if (file.size <= MAX_TEXT_BYTES) {
								setBus({ phase: "working", label: file.name, detail: "正在读取文本…" });
								const text = await fileToText(file);
								if (text.length <= directLimit) {
									chips.push({ name: file.name, kind: "text", text });
									break;
								}
								// 超过上下文预算：上传主机落盘 + 索引卡，杜绝顶爆上下文
								if (text.length <= DIRECT_TEXT_CHARS) budgetTiered = true;
								setBus({
									phase: "working",
									label: file.name,
									detail: text.length <= DIRECT_TEXT_CHARS ? "上下文余量不足，正在转存并生成索引…" : "文档较大，正在转存并生成索引…"
								});
								const cached = await convertRemote(file, "text-cache", cwd, sessionId, directLimit);
								if (cached.kind === "index") {
									chips.push({
										name: file.name,
										kind: "card",
										text: cached.card,
										tagExtra: text.length <= DIRECT_TEXT_CHARS ? "余量不足" : undefined
									});
								} else if (cached.kind === "text") {
									chips.push({ name: file.name, kind: "text", text: cached.text });
								} else {
									throw new Error("长文本转存失败");
								}
								break;
							}
							// 2MB < size ≤ 16MB：直接交主机（工作区外的大文本也能完整转存）
							setBus({ phase: "working", label: file.name, detail: "文档较大，正在上传转存并生成索引…" });
							const cached = await convertRemote(file, "text-cache", cwd, sessionId, directLimit);
							if (cached.kind === "index") {
								chips.push({ name: file.name, kind: "card", text: cached.card });
							} else if (cached.kind === "text") {
								chips.push({ name: file.name, kind: "text", text: cached.text });
							} else {
								throw new Error("长文本转存失败");
							}
							break;
						}
						case "pdf":
						case "docx":
						case "xlsx":
						case "pptx":
						case "doc":
						case "xls":
						case "ppt":
						case "epub":
						case "odt":
						case "rtf": {
							setBus({
								phase: "working",
								label: file.name,
								detail: kind === "pdf" ? "正在提取文字层…" : kind === "tiff" ? "正在转换为图片…" : "正在提取文本…"
							});
							const result = await convertRemote(file, kind, cwd, sessionId, directLimit);
							if (result.kind === "images") {
								for (const image of result.images) {
									images.push(new File([b64ToBytes(image.data)], image.name, { type: image.mediaType }));
								}
								if (Array.isArray(result.warnings) && result.warnings.length > 0) {
									chips.push({ name: file.name, kind: "note", text: result.warnings.join("\n") });
								}
							} else if (result.kind === "text") {
								chips.push({ name: file.name, kind: "text", text: result.text });
							} else if (result.kind === "index") {
								if (result.tierReason === "budget") budgetTiered = true;
								chips.push({
									name: file.name,
									kind: "card",
									text: result.card,
									tagExtra: result.tierReason === "budget" ? "余量不足" : undefined
								});
							}
							break;
						}
						case "tiff": {
							setBus({ phase: "working", label: file.name, detail: "正在转换为图片…" });
							const result = await convertRemote(file, kind, cwd, sessionId, directLimit);
							if (result.kind === "images") {
								for (const image of result.images) {
									images.push(new File([b64ToBytes(image.data)], image.name, { type: image.mediaType }));
								}
								if (Array.isArray(result.warnings) && result.warnings.length > 0) {
									chips.push({ name: file.name, kind: "note", text: result.warnings.join("\n") });
								}
							} else if (result.kind === "error") {
								throw new Error(result.error?.message ?? "TIFF 转换失败");
							}
							break;
						}
						default: {
							failedNames.push(file.name);
							const message = `暂不支持该格式${file.type === "" ? "" : `（${file.type}）`}，已跳过`;
							if (firstError === null) firstError = message;
							setBus({ phase: "error", label: file.name, detail: message });
						}
					}
				} catch (error) {
					failedNames.push(file.name);
					if (firstError === null) firstError = error instanceof Error ? error.message : String(error);
					setBus({
						phase: "error",
						label: file.name,
						detail: error instanceof Error ? error.message : String(error)
					});
				}
			}
			if (seq !== intakeSeq) return;
			if (images.length > 0) {
				// 等当前会话空闲再投喂：忙时当前会话的原生 drop 会拒绝，
				// 而其它已挂载的空闲会话会接住合成 drop —— 图片就"跑到别的对话框"了。
				setBus({ phase: "working", label: images.length === 1 ? "图片已就绪" : `${images.length} 张图片已就绪`, detail: "等待当前会话空闲后附加…" });
				await waitForSessionIdle(sessionId);
				redispatchDrop(images);
			}
			if (chips.length > 0) addChips(chips, sessionId);
			const parts = [];
			if (images.length > 0) parts.push(`${images.length} 张图片`);
			if (chips.length > 0) parts.push(`${chips.length} 个文档卡片`);
			if (parts.length === 0 && failedNames.length > 0) {
				setBus({ phase: "error", label: "附件处理失败", detail: firstError ?? "转换失败" });
				return;
			}
			setBus({
				phase: "done",
				label: parts.length > 0
					? `已挂载 ${parts.join("、")}${failedNames.length > 0 ? `；${failedNames.length} 个文件失败` : ""}，输入框保持干净，发送时自动并入消息`
					: "附件处理完成",
				detail: budgetTiered ? "部分文档因上下文余量不足转为索引卡（可用 read 工具按需读取，或 /attach full 并入全文）" : ""
			});
		}

		// ---- attachment dock：文档卡片条 + 状态条 -------------------------------
		function ChipPill({ item }) {
			const tag = item.kind === "card" ? "索引" : item.kind === "note" ? "说明" : item.kind === "ref" ? "引用" : "全文";
			const base = item.chars >= 1000
				? `${(item.chars / 1000).toFixed(1)}k 字符 · ${tag}`
				: `${item.chars} 字符 · ${tag}`;
			const meta = item.tagExtra === undefined ? base : `${base} · ${item.tagExtra}`;
			const icon = item.kind === "card" ? "🗂" : item.kind === "ref" ? "📎" : "📄";
			return jsxs("div", {
				className: "dshaf-chip",
				title: `${item.name}（${tag}）`,
				children: [
					jsx("span", { className: "dshaf-chip-icon", children: icon }),
					jsxs("span", {
						className: "dshaf-chip-text",
						children: [
							jsx("span", { className: "dshaf-chip-name", children: item.name }),
							jsx("span", { className: "dshaf-chip-meta", children: meta })
						]
					}),
					jsx("button", {
						type: "button",
						className: "dshaf-chip-remove",
						"aria-label": `移除 ${item.name}`,
						title: "移除",
						onClick: () => removeChip(item.key),
						children: "✕"
					})
				]
			}, item.key);
		}
		function AttachDock({ sessionId }) {
			const state = useBusState();
			const chips = useChipsState();
			const mine = chips.sessionId === sessionId ? chips.items : [];
			// 有卡片时不显示"已挂载"完成提示（卡片条本身就是状态，避免两条堆叠）
			const showStatus = state !== null && !(mine.length > 0 && state.phase === "done");
			useEffect(() => {
				if (state === null || state.phase !== "done" || mine.length > 0) return;
				const timer = setTimeout(() => setBus(null), 3000);
				return () => clearTimeout(timer);
			}, [state?.seq, state?.phase, mine.length]);
			if (state === null && mine.length === 0) return null;
			const error = state !== null && state.phase === "error";
			return jsx("div", {
				className: "dshaf-dock",
				children: [
					mine.length > 0
						? jsxs("div", {
							className: "dshaf-chipbar",
							children: [
								jsx("span", { className: "dshaf-chipbar-hint", children: "附件" }),
								...mine.map((item) => jsx(ChipPill, { item }, item.key)),
								jsx("button", {
									type: "button",
									className: "dshaf-chip-send",
									title: "把文档卡片并入消息并发送",
									onClick: sendChipsNow,
									children: "发送"
								})
							]
						}, "chips")
						: null,
					showStatus
						? jsx("div", {
							"data-dshaf-phase": state.phase,
							children: jsxs("div", {
								className: `dshaf-bar${error ? " dshaf-bar-error" : ""}`,
								children: [
									jsx("span", {
										className: "dshaf-lead",
										children: state.phase === "working"
											? jsx("span", { className: "dshaf-spinner", "aria-hidden": true })
											: error
												? "⚠"
												: "✓"
									}),
									jsxs("div", {
										className: "dshaf-text",
										children: [
											jsx("div", { className: "dshaf-label", children: state.label }),
											state.detail
												? jsx("div", { className: "dshaf-detail", children: state.detail })
												: null
										]
									}),
									error
										? jsx("button", {
											type: "button",
											className: "dshaf-close",
											"aria-label": "关闭提示",
											onClick: () => setBus(null),
											children: "✕"
										})
										: null
								]
							})
						}, "status")
						: null
				]
			});
		}

		// ---- attach button ------------------------------------------------------
		function AttachButton({ sessionId }) {
			const inputRef = useRef(null);
			return jsxs(Fragment, {
				children: [
					jsx("input", {
						ref: inputRef,
						type: "file",
						multiple: true,
						accept: ACCEPT,
						style: { display: "none" },
						"aria-hidden": true,
						tabIndex: -1,
						onChange: (event) => {
							const files = Array.from(event.target.files ?? []);
							event.target.value = "";
							if (files.length > 0) void intake(files, sessionId);
						}
					}),
					jsx(Tooltip, {
						label: "添加附件（图片 / PDF / Word / Excel / PPT / 文本·代码）",
						side: "top",
						delayMs: 500,
						children: jsx("button", {
							type: "button",
							className: "dshaf-btn",
							"aria-label": "添加附件",
							title: sessionId === undefined ? "添加附件" : undefined,
							onMouseDown: (event) => {
								event.preventDefault();
							},
							onClick: () => {
								inputRef.current?.click();
							},
							children: jsx(IconPaperclipOutline16, { size: 14 })
						})
					})
				]
			});
		}

		// ---- cache settings page（P1-3：settings.section 注册）----------------
		function CacheSettings() {
			const [state, setState] = useState({ loading: true, docs: [], sizeBytes: 0, error: null, busy: null });
			const refresh = useCallback(async () => {
				setState((current) => ({ ...current, loading: true, error: null }));
				try {
					const cwd = currentCwd();
					const sessionId = activeSession?.sessionId;
					const params = new URLSearchParams();
					if (cwd !== undefined) params.set("cwd", cwd);
					if (sessionId !== undefined) params.set("sessionId", sessionId);
					const query = params.toString();
					const url = `/api/attach-formats/cache${query === "" ? "" : `?${query}`}`;
					const response = await fetch(url);
					const payload = await response.json();
					if (payload?.ok !== true) throw new Error(payload?.error?.message ?? "读取缓存失败");
					setState({ loading: false, docs: payload.docs ?? [], sizeBytes: payload.sizeBytes ?? 0, error: null, busy: null });
				} catch (error) {
					setState({ loading: false, docs: [], sizeBytes: 0, error: error instanceof Error ? error.message : String(error), busy: null });
				}
			}, []);
			useEffect(() => {
				void refresh();
			}, [refresh]);
			const act = useCallback(async (path, body = {}) => {
				setState((current) => ({ ...current, busy: path }));
				try {
					const response = await fetch(path, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ cwd: currentCwd(), sessionId: activeSession?.sessionId, ...body })
					});
					const payload = await response.json();
					if (payload?.ok !== true) throw new Error(payload?.error?.message ?? "操作失败");
				} catch (error) {
					setState((current) => ({ ...current, error: error instanceof Error ? error.message : String(error) }));
				} finally {
					await refresh();
				}
			}, [refresh]);
			const sizeText = state.sizeBytes >= 1024 * 1024
				? `${(state.sizeBytes / 1024 / 1024).toFixed(1)} MB`
				: `${Math.round(state.sizeBytes / 1024)} KB`;
			const fmt = (value) => {
				if (value === null || value === undefined) return "—";
				const date = new Date(value);
				return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
			};
			return jsx("div", {
				className: "dshaf-settings",
				children: [
					jsxs("div", {
						className: "dshaf-settings-head",
						children: [
							jsxs("div", {
								className: "dshaf-settings-title",
								children: [
									jsx("div", { className: "dshaf-settings-name", children: "附件缓存" }),
									jsx("div", {
										className: "dshaf-settings-sub",
										children: state.loading
											? "读取中…"
											: `${state.docs.length} 个已转存文档 · 共 ${sizeText}（工作区 .dsh-attachments/，约 7 天未访问自动清理）`
									})
								]
							}),
							jsx("button", {
								type: "button",
								className: "dshaf-settings-btn",
								disabled: state.busy !== null || state.loading,
								onClick: () => void act("/api/attach-formats/cache/clear"),
								children: "全部清空"
							})
						]
					}, "head"),
					state.error !== null
						? jsx("div", { className: "dshaf-settings-error", children: state.error }, "error")
						: null,
					state.docs.length === 0 && !state.loading
						? jsx("div", { className: "dshaf-settings-empty", children: "还没有转存的文档——拖入超过 8 万字符的文本或长 PDF 后会出现在这里。" }, "empty")
						: jsx("div", {
							className: "dshaf-settings-list",
							children: state.docs.map((doc) => jsxs("div", {
								className: "dshaf-settings-row",
								children: [
									jsxs("div", {
										className: "dshaf-settings-rowtext",
										children: [
											jsx("div", { className: "dshaf-settings-rowname", children: doc.name }),
											jsx("div", {
												className: "dshaf-settings-rowmeta",
												children: `${doc.id} · ${doc.pageCount > 0 ? `${doc.pageCount} 页` : `${doc.lineCount} 行`} · ${doc.charCount} 字符 · ${fmt(doc.createdAt)}`
											})
										]
									}),
									jsx("button", {
										type: "button",
										className: "dshaf-settings-btn",
										disabled: state.busy !== null,
										onClick: () => void act("/api/attach-formats/cache/delete", { ids: [doc.id] }),
										children: "删除"
									})
								]
							}, doc.id))
						}, "list")
				]
			});
		}

		// ---- styles -------------------------------------------------------------
		function injectStyles() {
			if (document.getElementById("dsh-attachment-formats-styles")) return;
			const el = document.createElement("style");
			el.id = "dsh-attachment-formats-styles";
			el.textContent = [
				".dshaf-btn{width:32px;height:32px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:999px;justify-content:center;align-items:center;padding:0;display:inline-flex}",
				".dshaf-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}",
				".dshaf-btn:focus-visible{outline:2px solid var(--dsw-alias-label-tertiary);outline-offset:-2px}",
				".dshaf-dock{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));max-width:calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));margin:0 auto;padding:0 var(--dsh-composer-dock-inset);flex:none}",
				".dshaf-bar{background:color-mix(in srgb, var(--dsw-specific-input-major,#1f2430) 92%, var(--dsw-alias-label-primary,#e6e8ee));border:1px solid var(--dsw-alias-border-l1,rgba(127,140,160,.4));border-radius:12px;align-items:center;gap:10px;min-height:36px;margin:0 auto;padding:4px 10px 4px 12px;display:flex}",
				".dshaf-bar-error{border-color:var(--dsw-alias-state-error-primary)}",
				".dshaf-lead{color:var(--dsw-alias-label-tertiary);flex:none;width:16px;place-items:center;display:grid}",
				".dshaf-spinner{box-sizing:border-box;width:14px;height:14px;border:2px solid var(--dsw-alias-label-tertiary);border-top-color:transparent;border-radius:50%;animation:dshaf-spin .8s linear infinite;display:inline-block}",
				"@keyframes dshaf-spin{to{transform:rotate(360deg)}}",
				".dshaf-text{min-width:0;flex-direction:column;flex:1;display:flex}",
				".dshaf-label{color:var(--dsw-alias-label-primary);white-space:nowrap;text-overflow:ellipsis;font-size:13px;line-height:18px;overflow:hidden}",
				".dshaf-detail{color:var(--dsw-alias-label-secondary);white-space:nowrap;text-overflow:ellipsis;font-size:12px;line-height:16px;overflow:hidden}",
				".dshaf-close{width:24px;height:24px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:999px;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}",
				".dshaf-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}",
				".dshaf-chipbar{box-sizing:border-box;background:color-mix(in srgb, var(--dsw-specific-input-major,#1f2430) 90%, var(--dsw-alias-label-primary,#e6e8ee));border:1px solid var(--dsw-alias-border-l1,rgba(127,140,160,.4));border-radius:14px;box-shadow:var(--dsw-shadow-lv2,0 8px 24px rgba(0,0,0,.25));align-items:center;gap:8px;min-height:44px;max-height:96px;overflow-y:auto;margin:0 auto 8px;padding:7px 10px;display:flex;flex-wrap:wrap}",
				".dshaf-chipbar-hint{color:var(--dsw-alias-label-secondary,#aab0bd);flex:none;font-size:12px;font-weight:600;line-height:30px;padding-left:4px;padding-right:2px}",
				".dshaf-chip{background:color-mix(in srgb, var(--dsw-specific-input-major,#1f2430) 76%, var(--dsw-alias-label-primary,#e6e8ee));border:1px solid var(--dsw-alias-border-l1,rgba(127,140,160,.4));border-radius:10px;box-shadow:0 1px 2px rgba(0,0,0,.16);align-items:center;gap:7px;max-width:300px;height:30px;padding:0 6px 0 10px;display:inline-flex}",
				".dshaf-chip:hover{border-color:var(--dsw-alias-border-l2,rgba(127,140,160,.65))}",
				".dshaf-chip-icon{flex:none;font-size:13px;line-height:1}",
				".dshaf-chip-text{min-width:0;align-items:baseline;gap:6px;display:flex}",
				".dshaf-chip-name{color:var(--dsw-alias-label-primary,#e6e8ee);white-space:nowrap;text-overflow:ellipsis;font-size:12px;font-weight:500;line-height:28px;max-width:190px;overflow:hidden}",
				".dshaf-chip-meta{color:var(--dsw-alias-label-secondary,#aab0bd);white-space:nowrap;font-size:11px;line-height:28px}",
				".dshaf-chip-remove{width:20px;height:20px;color:var(--dsw-alias-label-tertiary,#8b93a5);cursor:pointer;background:0 0;border:none;border-radius:999px;flex:none;justify-content:center;align-items:center;padding:0;font-size:10px;line-height:1;display:inline-flex}",
				".dshaf-chip-remove:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.12));color:var(--dsw-alias-label-primary,#e6e8ee)}",
				".dshaf-chip-send{border:1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary,#4c8dff) 55%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-business-primary,#4c8dff) 16%, var(--dsw-specific-input-major,#1f2430));color:var(--dsw-alias-state-business-primary,#7fb0ff);cursor:pointer;border-radius:10px;flex:none;height:30px;padding:0 14px;font-size:12px;font-weight:600;line-height:28px}",
				".dshaf-chip-send:hover{background:color-mix(in srgb, var(--dsw-alias-state-business-primary,#4c8dff) 28%, var(--dsw-specific-input-major,#1f2430))}",
				".dshaf-settings{display:flex;flex-direction:column;gap:12px;max-width:760px}",
				".dshaf-settings-head{display:flex;justify-content:space-between;align-items:center;gap:12px}",
				".dshaf-settings-title{min-width:0;flex-direction:column;display:flex}",
				".dshaf-settings-name{color:var(--dsw-alias-label-primary,#e6e8ee);font-size:15px;font-weight:600;line-height:22px}",
				".dshaf-settings-sub{color:var(--dsw-alias-label-secondary,#aab0bd);font-size:12px;line-height:18px}",
				".dshaf-settings-btn{border:1px solid var(--dsw-alias-border-l1,rgba(127,140,160,.4));background:color-mix(in srgb, var(--dsw-specific-input-major,#1f2430) 88%, var(--dsw-alias-label-primary,#e6e8ee));color:var(--dsw-alias-label-primary,#e6e8ee);cursor:pointer;border-radius:8px;flex:none;height:30px;padding:0 12px;font-size:12px;line-height:28px}",
				".dshaf-settings-btn:hover{border-color:var(--dsw-alias-border-l2,rgba(127,140,160,.65))}",
				".dshaf-settings-btn:disabled{opacity:.5;cursor:default}",
				".dshaf-settings-error{color:var(--dsw-alias-state-error-primary,#ff6b6b);font-size:12px;line-height:18px}",
				".dshaf-settings-empty{color:var(--dsw-alias-label-secondary,#aab0bd);font-size:13px;line-height:20px;border:1px dashed var(--dsw-alias-border-l1,rgba(127,140,160,.4));border-radius:10px;padding:16px}",
				".dshaf-settings-list{flex-direction:column;gap:8px;display:flex}",
				".dshaf-settings-row{border:1px solid var(--dsw-alias-border-l1,rgba(127,140,160,.4));background:color-mix(in srgb, var(--dsw-specific-input-major,#1f2430) 90%, var(--dsw-alias-label-primary,#e6e8ee));border-radius:10px;justify-content:space-between;align-items:center;gap:12px;padding:8px 12px;display:flex}",
				".dshaf-settings-rowtext{min-width:0;flex-direction:column;flex:1;display:flex}",
				".dshaf-settings-rowname{color:var(--dsw-alias-label-primary,#e6e8ee);white-space:nowrap;text-overflow:ellipsis;font-size:13px;font-weight:500;line-height:20px;overflow:hidden}",
				".dshaf-settings-rowmeta{color:var(--dsw-alias-label-tertiary,#8b93a5);white-space:nowrap;text-overflow:ellipsis;font-size:11px;line-height:16px;overflow:hidden}",
				"@media (prefers-reduced-motion: reduce){.dshaf-spinner{animation:none}}"
			].join("\n");
			document.head.appendChild(el);
		}

		// ---- client plugin body ---------------------------------------------------
		const inject = ["slots", "sessions"];

		function apply(ctx) {
			injectStyles();
			activeSession.sessionsService = ctx.sessions;
			ctx.effect(() => {
				const onDropCapture = (event) => {
					const transfer = event.dataTransfer;
					if (transfer === null || transfer === undefined) return;
					if (!transfer.types.includes("Files")) return;
					const files = Array.from(transfer.files ?? []);
					if (files.length === 0) return;
					if (files.every((file) => classifyFile(file) === "native-image")) return; // 原生图片走内建管线
					event.preventDefault();
					event.stopImmediatePropagation();
					window.dispatchEvent(new Event("dragend")); // 复位内建 DropOverlay
					void intake(files);
				};
				const onPasteCapture = (event) => {
					const items = event.clipboardData?.items;
					if (items === undefined) return;
					const files = [];
					for (const item of items) {
						if (item.kind !== "file") continue;
						const file = item.getAsFile();
						if (file !== null) files.push(file);
					}
					if (files.length === 0) return;
					if (files.every((file) => classifyFile(file) === "native-image")) return;
					event.preventDefault();
					event.stopImmediatePropagation();
					const text = event.clipboardData?.getData("text/plain") ?? "";
					void intake(files).then(() => {
						if (text.trim() !== "") injectTexts([{ name: "剪贴板", text, note: false }]);
					});
				};
				// 发送瞬间把文档卡片并入草稿（Enter 提交 / 主按钮点击），随后由原生提交发送
				const onKeyDownCapture = (event) => {
					if (event.key !== "Enter" || event.shiftKey) return;
					if (event.target !== composerTextarea()) return;
					mergeChipsIntoDraft();
				};
				const onClickCapture = (event) => {
					const target = event.target;
					if (target === null || target === undefined || typeof target.closest !== "function") return;
					const card = target.closest("[data-composer-card]");
					if (card === null) return;
					const button = target.closest("button");
					if (button === null) return;
					const buttons = card.querySelectorAll("button");
					if (buttons.length === 0 || buttons[buttons.length - 1] !== button) return;
					if (button.querySelector("svg rect") !== null) return; // 停止按钮：不合并
					mergeChipsIntoDraft();
				};
				document.addEventListener("drop", onDropCapture, true);
				document.addEventListener("paste", onPasteCapture, true);
				document.addEventListener("keydown", onKeyDownCapture, true);
				document.addEventListener("click", onClickCapture, true);
				return () => {
					document.removeEventListener("drop", onDropCapture, true);
					document.removeEventListener("paste", onPasteCapture, true);
					document.removeEventListener("keydown", onKeyDownCapture, true);
					document.removeEventListener("click", onClickCapture, true);
				};
			}, "dsh-attachment-formats: drop/paste/send interception");

			ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
				name: "conversation.input.left",
				id: "attach-formats",
				order: 20,
				inject: (sessionId) => {
					activeSession.sessionId = sessionId;
					return { sessionId };
				}
			}, AttachButton));

			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "attach-formats",
				order: 60,
				inject: (sessionId) => ({ sessionId })
			}, AttachDock));

			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "attach-cache",
				order: 50,
				label: "附件缓存"
			}, CacheSettings));
		}

		exports.apply = apply;
		exports.inject = inject;
		// 测试出口：让 smoke-client 能真正 mount 组件（SSR），验证的不是"框架"而是"产品"
		exports.__components = { AttachButton, AttachDock, ChipPill, CacheSettings };
		return module.exports;
	}
});
