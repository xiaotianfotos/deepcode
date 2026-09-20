window.__ModuleLoader__.load({id:"@deepseek-ai/dsh-client-ui-voice-deck",factory:(require)=>{var module={exports:{}};var exports=module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_dsh_client_ui_renderer = require("@deepseek-ai/dsh-client-ui-renderer");

// src/client/state.ts
function adjacent(lanes, active, delta) {
  for (let n = 1; n <= lanes.length; n++) {
    const i = (active + delta * n + lanes.length * 2) % lanes.length;
    if (lanes[i]) return i;
  }
  return active;
}
function assign(lanes, index, id) {
  if (index < 0 || index >= 4) throw new Error("Invalid lane");
  const next = [...lanes];
  const existing = id === null ? -1 : next.indexOf(id);
  if (existing >= 0 && existing !== index) next[existing] = next[index];
  next[index] = id;
  return next;
}

// src/client/style.ts
var css = `
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
.dsh-deck-composer [aria-label*="\u9009\u62E9\u6A21\u578B"]{max-width:130px}.dsh-deck-composer [aria-label*="\u9009\u62E9\u6A21\u578B"] span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-deck-composer [aria-label*="\u8BBF\u95EE\u6A21\u5F0F"]{max-width:116px}.dsh-deck-composer [aria-label*="\u8BBF\u95EE\u6A21\u5F0F"] span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
}
.dsh-deck-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;border-style:dashed;opacity:.6}.dsh-deck-empty>span{font-size:24px;opacity:.4}.dsh-deck-empty p{font-size:12px}
.dsh-deck>footer{flex:none;min-height:18px;font-size:11px;opacity:.7;text-align:center}

`;

// src/client/chat-swipe.ts
function releaseTarget(left, velocity, stride, max) {
  if (stride <= 0) return Math.max(0, Math.min(max, left + velocity * 240));
  let index = Math.round((left + velocity * 240) / stride);
  if (velocity > 0.35) index = Math.max(index, Math.floor((left + 1) / stride) + 1);
  if (velocity < -0.35) index = Math.min(index, Math.ceil((left - 1) / stride) - 1);
  return Math.max(0, Math.min(max, index * stride));
}
function releaseVelocity(samples, now) {
  const first = samples[0], last = samples.at(-1);
  return !first || !last || now - last.time > 120 || last.time <= first.time ? 0 : (last.left - first.left) / (last.time - first.time);
}
function attachChatSwipe(grid, onSettled = () => {
}) {
  let drag;
  let frame, held;
  const hold = (target) => {
    if (held?.target === target) return;
    if (held) held.target.style.scrollSnapType = held.snap;
    held = { target, snap: target.style.scrollSnapType };
    target.style.scrollSnapType = "none";
  };
  const release = () => {
    if (held) held.target.style.scrollSnapType = held.snap;
    held = void 0;
  };
  const stop = () => {
    if (frame !== void 0) cancelAnimationFrame(frame);
    frame = void 0;
  };
  const selectingMessage = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return false;
    return [selection.anchorNode, selection.focusNode].some((node) => {
      const chat = (node instanceof Element ? node : node?.parentElement)?.closest(".dsh-deck-chat");
      return !!chat && grid.contains(chat);
    });
  };
  const selectionChanged = () => {
    if (selectingMessage()) {
      stop();
      drag = void 0;
      release();
    }
  };
  const sample = (samples, left) => {
    const now = performance.now();
    samples.push({ time: now, left });
    while (samples.length > 2 && samples[1].time < now - 100) samples.shift();
  };
  const coast = (target, velocity) => {
    hold(target);
    const lane = grid.firstElementChild;
    const stride = target === grid ? (lane?.getBoundingClientRect().width ?? 0) + 12 : 0;
    const from = target.scrollLeft, to = releaseTarget(from, velocity, stride, target.scrollWidth - target.clientWidth);
    const distance = to - from, start2 = performance.now(), duration = Math.max(260, Math.min(460, 260 + Math.abs(distance) * 0.25));
    const slope = distance === 0 ? 0 : Math.max(0, Math.min(3, velocity * duration / distance));
    const tick = (now) => {
      const t = Math.min(1, (now - start2) / duration);
      const progress = -2 * t * t * t + 3 * t * t + slope * (t * t * t - 2 * t * t + t);
      target.scrollLeft = from + distance * progress;
      if (t < 1) {
        frame = requestAnimationFrame(tick);
        return;
      }
      frame = void 0;
      target.scrollLeft = to;
      release();
      onSettled();
    };
    frame = requestAnimationFrame(tick);
  };
  const finish = (cancelled = false) => {
    const old = drag;
    drag = void 0;
    if (old?.axis === "x") {
      const velocity = cancelled ? 0 : releaseVelocity(old.samples, performance.now());
      coast(old.target, velocity);
    } else if (held) coast(held.target, 0);
  };
  const start = (event) => {
    stop();
    drag = void 0;
    if (selectingMessage()) {
      release();
      return;
    }
    if (event.touches.length !== 1 || !(event.target instanceof Element)) {
      if (held) coast(held.target, 0);
      return;
    }
    const chat = event.target.closest(".dsh-deck-chat");
    if (!chat) {
      if (held) coast(held.target, 0);
      return;
    }
    let target = grid;
    for (let node = event.target; node && node !== chat; node = node.parentElement) {
      if (node.scrollWidth > node.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(node).overflowX)) {
        target = node;
        break;
      }
    }
    const t = event.touches[0];
    drag = { x: t.clientX, y: t.clientY, left: target.scrollLeft, target, samples: [{ time: performance.now(), left: target.scrollLeft }] };
  };
  const move = (event) => {
    if (!drag) return;
    if (selectingMessage()) {
      selectionChanged();
      return;
    }
    if (event.touches.length !== 1) {
      finish(true);
      return;
    }
    const t = event.touches[0], dx = t.clientX - drag.x, dy = t.clientY - drag.y;
    if (!drag.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;
      drag.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
      if (drag.axis === "x") hold(drag.target);
    }
    if (drag.axis !== "x") return;
    if (event.cancelable) event.preventDefault();
    drag.target.scrollLeft = drag.left - dx;
    sample(drag.samples, drag.target.scrollLeft);
  };
  const end = () => finish(), cancel = () => finish(true);
  grid.addEventListener("touchstart", start, { passive: true });
  grid.addEventListener("touchmove", move, { passive: false });
  grid.addEventListener("touchend", end);
  grid.addEventListener("touchcancel", cancel);
  document.addEventListener("selectionchange", selectionChanged);
  return {
    busy: () => drag !== void 0 || frame !== void 0,
    cancel: () => {
      stop();
      drag = void 0;
      release();
    },
    dispose: () => {
      stop();
      drag = void 0;
      release();
      grid.removeEventListener("touchstart", start);
      grid.removeEventListener("touchmove", move);
      grid.removeEventListener("touchend", end);
      grid.removeEventListener("touchcancel", cancel);
      document.removeEventListener("selectionchange", selectionChanged);
    }
  };
}

// src/client/index.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var KEY = "dsh.voice-deck.controller.v2";
function useSource(source) {
  return (0, import_react.useSyncExternalStore)((fn) => source.subscribe(fn), () => source.getSnapshot());
}
var inject = ["layout", "slots", "sessions", "uiSession", "uiConversation", "conversation", "deckInput"];
function apply(ctx) {
  let state = { enabled: false, lanes: [null, null, null, null], active: 0, notice: "" };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    const old = JSON.parse(localStorage.getItem("dsh.voice-deck.lanes.v1") ?? "null");
    const ids = saved?.lanes ?? old;
    if (Array.isArray(ids)) state = { ...state, enabled: saved?.enabled === true, active: Number.isInteger(saved?.active) ? Math.max(0, Math.min(3, saved.active)) : 0, lanes: Array.from({ length: 4 }, (_, i) => typeof ids[i] === "string" && ids.indexOf(ids[i]) === i ? ids[i] : null) };
  } catch {
  }
  const listeners = /* @__PURE__ */ new Set(), leases = /* @__PURE__ */ new Map();
  let cancelSwipe;
  let mounted = 0, disposeView;
  let voice, gamepad, gamepadBind, disposed = false;
  const layout = ctx.layout;
  let detachMount;
  const syncGamepad = () => {
    if (disposed || !state.enabled || !gamepad || !mounted) {
      const off = gamepadBind;
      if (off) {
        gamepadBind = void 0;
        off();
      }
    } else if (!gamepadBind) {
      let live = true;
      const off = gamepad.bind((action) => {
        if (live) intent(action);
      });
      gamepadBind = () => {
        live = false;
        off();
      };
    }
  };
  const store = { getSnapshot: () => state, subscribe: (fn) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  } };
  const publish = (next) => {
    state = { ...state, ...next };
    localStorage.setItem(KEY, JSON.stringify({ ...state, notice: "" }));
    listeners.forEach((fn) => fn());
  };
  const notice = (text) => publish({ notice: text });
  const activeId = () => state.lanes[state.active];
  const syncLeases = () => {
    const list = ctx.sessions.list.getSnapshot();
    const ids = new Set(mounted && state.enabled ? state.lanes.filter((id) => !!id && !!list.byId[id]) : []);
    for (const [id, release] of leases) if (!ids.has(id)) {
      release();
      leases.delete(id);
    }
    for (const id of ids) if (!leases.has(id)) leases.set(id, ctx.sessions.acquireStage(id));
  };
  const hardwareKeyboard = () => {
    const bridge = window.androidBridge;
    if (!bridge) return matchMedia("(hover: hover) and (pointer: fine)").matches;
    try {
      return bridge.hasHardwareKeyboard?.() === true;
    } catch {
      return false;
    }
  };
  const focus = (atEnd = false) => {
    const id = activeId();
    if (!id || !hardwareKeyboard()) return;
    requestAnimationFrame(() => {
      if (!disposed && activeId() === id && mounted && hardwareKeyboard()) ctx.deckInput.for(id).focus(atEnd);
    });
  };
  const activate = (index) => {
    if (disposed) return;
    const old = activeId();
    if (!state.lanes[index]) return;
    if (old && ctx.deckInput.for(old).composing()) {
      notice("\u8BF7\u5148\u5B8C\u6210\u8F93\u5165\u6CD5\u62FC\u5B57");
      return;
    }
    cancelSwipe?.();
    gamepad?.stopRepeat();
    if (old && old !== state.lanes[index]) voice?.leave(old);
    if (old !== state.lanes[index] && !hardwareKeyboard()) {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused.closest("[data-deck-lane]")?.getAttribute("data-deck-lane") === old) focused.blur();
    }
    publish({ active: index, notice: "" });
    focus(old !== state.lanes[index]);
  };
  const bindLane = (index, id) => {
    if (disposed) return;
    if (id && !ctx.sessions.list.getSnapshot().byId[id]) return;
    const old = state.lanes[index];
    if (old && old !== id) voice?.leave(old);
    publish({ lanes: assign(state.lanes, index, id) });
    syncLeases();
    if (id) activate(index);
    else activate(adjacent(state.lanes, state.active, 1));
  };
  const setView = (view, id = ctx.sessions.list.getSnapshot().current, focusTarget) => {
    if (!id) return;
    const entry = ctx.slots.entries("conversation.session")[0];
    if (!entry) return;
    const binding = ctx.uiSession.adapter.resolve(id);
    const store2 = ctx.slots.resolveStore(entry.store, binding);
    ctx.uiConversation.binding(id).activate(view);
    if (focusTarget !== void 0) store2.actions.openView(view, focusTarget);
    else store2.actions.setView(view);
  };
  const open = () => {
    if (disposed || !state.enabled) return;
    const list = ctx.sessions.list.getSnapshot();
    const id = list.current ?? state.lanes.find((id2) => id2 && list.byId[id2]) ?? list.ids[0];
    if (!id) {
      notice("\u5148\u521B\u5EFA\u4E00\u4E2A\u4F1A\u8BDD\uFF0C\u518D\u6253\u5F00\u5DE5\u4F5C\u53F0");
      return;
    }
    if (!list.current) ctx.sessions.open(id);
    setView("voice-deck", id);
  };
  const intent = (action) => {
    if (disposed || !state.enabled || !mounted) return;
    if (action === "sidebar") {
      gamepad?.stopRepeat();
      ctx.layout.toggleSidebar();
      focus();
      return;
    }
    if (action === "previous" || action === "next") {
      activate(adjacent(state.lanes, state.active, action === "previous" ? -1 : 1));
      return;
    }
    const id = activeId();
    if (!id) {
      notice("\u5148\u5C06\u4F1A\u8BDD\u52A0\u5165\u5DE5\u4F5C\u53F0");
      return;
    }
    const editor = ctx.deckInput.for(id);
    if (action === "delete") {
      if (!editor.deleteBackward()) notice("\u8F93\u5165\u6846\u6682\u4E0D\u53EF\u7F16\u8F91\uFF0C\u8BF7\u5148\u5B8C\u6210\u8F93\u5165\u6CD5\u62FC\u5B57");
      return;
    }
    if (action === "send") {
      if (voice && ["permission", "preparing", "recording", "transcribing"].includes(voice.for(id).snapshot().phase)) {
        notice("\u8BF7\u5148\u7ED3\u675F\u5F55\u97F3\u5E76\u7B49\u5F85\u8F6C\u5F55\u5B8C\u6210");
        return;
      }
      gamepad?.stopRepeat();
      if (!editor.send()) notice("\u8349\u7A3F\u4E3A\u7A7A\u6216\u6682\u4E0D\u53EF\u53D1\u9001");
      else {
        notice("");
        focus();
      }
      return;
    }
    if (!voice) {
      notice("\u672A\u5B89\u88C5\u8BED\u97F3\u8F93\u5165\u63D2\u4EF6\uFF0C\u5F55\u97F3\u4E0D\u53EF\u7528\uFF1B\u53EF\u76F4\u63A5\u4F7F\u7528\u6587\u5B57\u8F93\u5165\u548C\u9644\u4EF6");
      return;
    }
    if (!voice.enabled()) {
      notice("\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u542F\u7528\u8BED\u97F3\u8F93\u5165");
      return;
    }
    const lane = voice.for(id), phase = lane.snapshot().phase;
    if (phase === "recording") {
      lane.stop();
      return;
    }
    if (voice.busy()) {
      notice("\u6B63\u5728\u5904\u7406\u4E0A\u4E00\u6BB5\u8BED\u97F3\uFF0C\u5B8C\u6210\u540E\u518D\u6309 \u25B3");
      return;
    }
    if (editor.composing() || editor.state.getSnapshot().phase !== "plain") {
      notice("\u8BF7\u5148\u5B8C\u6210\u5F53\u524D\u8F93\u5165");
      return;
    }
    focus();
    lane.start();
  };
  const setEnabled = (enabled) => {
    if (disposed) return;
    if (!enabled) setView("chat");
    publish({ enabled });
    disposeView?.();
    disposeView = void 0;
    if (enabled) disposeView = ctx.slots.register({ name: "conversation.view", id: "voice-deck", label: "\u4F1A\u8BDD\u5DE5\u4F5C\u53F0", order: 5 }, Deck);
    syncGamepad();
    syncLeases();
  };
  function Slots({ wide = true }) {
    const s = useSource(store), list = useSource(ctx.sessions.list);
    if (!s.enabled) return null;
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-deck-pins", "data-plugin": "deck-pins", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "dsh-deck-open", onClick: open, children: wide ? "\u4F1A\u8BDD\u5DE5\u4F5C\u53F0" : "\u25A6" }),
      wide && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-deck-pins-grid", children: s.lanes.map((id, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { onDragOver: (e) => e.preventDefault(), onDrop: (e) => {
        e.preventDefault();
        bindLane(i, e.dataTransfer.getData("text/plain"));
        open();
      }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: i + 1 }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { "aria-label": `\u6CF3\u9053 ${i + 1} \u4F1A\u8BDD`, value: id ?? "", onChange: (e) => {
          bindLane(i, e.target.value || null);
          open();
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: "\u6DFB\u52A0\u4F1A\u8BDD" }),
          list.ids.map((id2) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: id2, children: list.byId[id2]?.displayTitle ?? id2 }, id2))
        ] })
      ] }) }, i)) })
    ] });
  }
  const Lane = (0, import_react.memo)(function Lane2({ id, index, active }) {
    const root = (0, import_react.useRef)(null), block = useSource(ctx.conversation.blocks.storeFor(id));
    const list = useSource(ctx.sessions.list), row = list.byId[id];
    (0, import_react.useEffect)(() => ctx.deckInput.for(id).attach(), [id]);
    (0, import_react.useLayoutEffect)(() => {
      if (active) {
        root.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
        focus(true);
      }
    }, [active, id]);
    (0, import_react.useLayoutEffect)(() => {
      const lane = root.current, composer = lane?.querySelector(".dsh-deck-composer");
      if (!lane || !composer) return;
      const measure = () => {
        const card = composer.querySelector("[data-composer-card]"), header = lane.querySelector("header");
        if (card && header) composer.style.setProperty("--dsh-deck-menu-height", `${Math.max(0, Math.floor(card.getBoundingClientRect().top - header.getBoundingClientRect().bottom - 12))}px`);
      };
      const resize = new ResizeObserver(measure);
      resize.observe(lane);
      resize.observe(composer);
      measure();
      return () => resize.disconnect();
    }, [id]);
    const openView = (view, target) => {
      if (disposed) return;
      voice?.leave(id);
      ctx.sessions.open(id);
      setView(view, id, target);
    };
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { ref: root, className: "dsh-deck-lane", "data-deck-lane": id, "data-active": active, onClickCapture: () => {
      if (!active) activate(index);
    }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-deck-number", children: index + 1 }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { title: row?.displayTitle, children: row?.displayTitle ?? "\u4F1A\u8BDD\u4E0D\u53EF\u7528" }),
        row?.running && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-deck-running", children: "\u8FD0\u884C\u4E2D" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { "aria-label": `\u79FB\u51FA\u6CF3\u9053 ${index + 1}`, onClick: () => bindLane(index, null), children: "\xD7" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-deck-chat", "data-conversation-scroll": "", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_renderer.SessionSurface, { sessionId: id, part: "chat", openView }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-deck-composer", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_renderer.SessionSurface, { sessionId: id, part: "composer", blocked: block, openView }) })
    ] });
  });
  function Deck() {
    const s = useSource(store), list = useSource(ctx.sessions.list);
    const grid = (0, import_react.useRef)(null);
    (0, import_react.useEffect)(() => {
      const element = grid.current;
      if (!element) return;
      const chatSwipe = attachChatSwipe(element, () => settle());
      cancelSwipe = chatSwipe.cancel;
      let gesture, timer;
      const settle = () => {
        if (!gesture?.ended || chatSwipe.busy()) return;
        const delta = element.scrollLeft - gesture.left;
        gesture = void 0;
        if (Math.abs(delta) < 24) return;
        const bounds = element.getBoundingClientRect();
        const visible = [...element.querySelectorAll("[data-deck-lane]")].filter((lane) => {
          const box = lane.getBoundingClientRect();
          return Math.min(box.right, bounds.right) - Math.max(box.left, bounds.left) > box.width * 0.65;
        });
        const target = delta > 0 ? visible.at(-1) : visible[0];
        const index = state.lanes.indexOf(target?.dataset.deckLane ?? null);
        if (target && index >= 0) activate(index);
      };
      const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(settle, 160);
      };
      const start = () => {
        clearTimeout(timer);
        gesture = { left: element.scrollLeft, ended: false };
      };
      const end = () => {
        if (gesture) gesture.ended = true;
        schedule();
      };
      let width = element.clientWidth;
      let innerPair;
      const isFold = () => element.closest("[data-fold-workbench]") !== null;
      const rememberPair = () => {
        if (!isFold() || element.clientWidth <= 680 || element.clientWidth !== width) return;
        const bounds = element.getBoundingClientRect(), lanes = [...element.querySelectorAll("[data-deck-lane]")];
        const nearest = (x) => lanes.reduce((best, lane) => {
          const box = lane.getBoundingClientRect(), old = best?.getBoundingClientRect();
          return !old || Math.abs((box.left + box.right) / 2 - x) < Math.abs((old.left + old.right) / 2 - x) ? lane : best;
        }, void 0)?.dataset.deckLane;
        const left = nearest(bounds.left + bounds.width * 0.25), right = nearest(bounds.left + bounds.width * 0.75);
        if (left && right) innerPair = { left, right };
      };
      rememberPair();
      const hostWindow = window;
      const align = (id) => {
        const lane = [...element.querySelectorAll("[data-deck-lane]")].find((l) => l.dataset.deckLane === id);
        if (lane) element.scrollLeft += lane.getBoundingClientRect().left - element.getBoundingClientRect().left;
        return lane;
      };
      const hostReady = (cover) => {
        if (disposed) return true;
        if (!isFold() || !innerPair) return true;
        if (cover) {
          if (element.clientWidth > 680) return false;
          const index = state.lanes.indexOf(innerPair.right);
          if (index < 0) return true;
          if (state.active !== index) activate(index);
          const lane = align(innerPair.right);
          return !!lane && lane.dataset.active === "true" && Math.abs(lane.getBoundingClientRect().left - element.getBoundingClientRect().left) < 2;
        }
        if (element.clientWidth > 680) align(innerPair.left);
        return true;
      };
      hostWindow.__dshFoldDeckReady = hostReady;
      element.addEventListener("scroll", rememberPair, { passive: true });
      const resize = new ResizeObserver(() => {
        if (element.clientWidth === width) return;
        const wasWide = width > 680;
        width = element.clientWidth;
        chatSwipe.cancel();
        if (isFold() && innerPair) {
          if (wasWide && width <= 680) {
            const index = state.lanes.indexOf(innerPair.right);
            if (index >= 0) activate(index);
            align(innerPair.right);
            return;
          } else if (!wasWide && width > 680) {
            const left = innerPair.left;
            requestAnimationFrame(() => {
              align(left);
              rememberPair();
            });
          }
        }
        element.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
        if (wasWide && width > 680) rememberPair();
      });
      resize.observe(element);
      element.addEventListener("touchstart", start, { passive: true });
      element.addEventListener("touchend", end, { passive: true });
      element.addEventListener("touchcancel", end, { passive: true });
      element.addEventListener("scroll", schedule, { passive: true });
      element.addEventListener("scrollend", settle);
      return () => {
        if (hostWindow.__dshFoldDeckReady === hostReady) delete hostWindow.__dshFoldDeckReady;
        if (cancelSwipe === chatSwipe.cancel) cancelSwipe = void 0;
        chatSwipe.dispose();
        resize.disconnect();
        clearTimeout(timer);
        element.removeEventListener("touchstart", start);
        element.removeEventListener("touchend", end);
        element.removeEventListener("touchcancel", end);
        element.removeEventListener("scroll", schedule);
        element.removeEventListener("scroll", rememberPair);
        element.removeEventListener("scrollend", settle);
      };
    }, []);
    (0, import_react.useEffect)(() => {
      mounted++;
      layout.setWorkbenchActive?.(true);
      syncLeases();
      syncGamepad();
      focus(true);
      const reset = () => {
        const id = activeId();
        if (id) voice?.leave(id);
      };
      window.addEventListener("dsh-gamepad-reset", reset);
      let done = false;
      const detach = () => {
        if (done) return;
        done = true;
        if (detachMount === detach) detachMount = void 0;
        window.removeEventListener("dsh-gamepad-reset", reset);
        mounted--;
        layout.setWorkbenchActive?.(false);
        syncGamepad();
        for (const id of state.lanes) if (id) voice?.for(id).cancel();
        syncLeases();
      };
      detachMount = detach;
      return detach;
    }, []);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-deck", "data-plugin": "voice-deck", "data-conversation-composer-overlay": "", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { ref: grid, className: "dsh-deck-grid", "data-count": s.lanes.filter(Boolean).length, children: s.lanes.map((id, i) => id && list.byId[id] ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lane, { id, index: i, active: s.active === i }, id) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-deck-empty", onDragOver: (e) => e.preventDefault(), onDrop: (e) => {
        e.preventDefault();
        bindLane(i, e.dataTransfer.getData("text/plain"));
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: i + 1 }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u4ECE\u5DE6\u4FA7\u62D6\u5165\u4F1A\u8BDD" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { "aria-label": `\u6DFB\u52A0\u5230\u6CF3\u9053 ${i + 1}`, value: "", onChange: (e) => bindLane(i, e.target.value), children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: "\u9009\u62E9\u4F1A\u8BDD" }),
          list.ids.map((id2) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: id2, children: list.byId[id2]?.displayTitle ?? id2 }, id2))
        ] })
      ] }, `empty-${i}`)) }),
      s.notice && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("footer", { role: "status", children: s.notice })
    ] });
  }
  function Settings() {
    const s = useSource(store);
    const held = voice?.held() ?? [];
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { style: { padding: 20 }, "data-plugin": "deck-settings", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "\u4F1A\u8BDD\u5DE5\u4F5C\u53F0" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: s.enabled, onChange: (e) => setEnabled(e.target.checked) }),
        " \u542F\u7528\u56DB\u4F1A\u8BDD\u5DE5\u4F5C\u53F0"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u4ECE\u5DE6\u4FA7\u6DFB\u52A0\u4F1A\u8BDD\uFF0C\u7528\u4E00\u4E2A\u9EA6\u514B\u98CE\u548C\u624B\u67C4\u5207\u6362\u8F93\u5165\u3002\u8BED\u97F3\u53EA\u5199\u5165\u8349\u7A3F\u3002\u8BED\u97F3\u6216\u624B\u67C4\u63D2\u4EF6\u672A\u5B89\u88C5\u65F6\uFF0C\u5176\u4F59\u8F93\u5165\u3001\u9644\u4EF6\u4E0E\u6587\u5B57\u53D1\u9001\u4E0D\u53D7\u5F71\u54CD\u3002" }),
      s.enabled && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: open, children: "\u6253\u5F00\u5DE5\u4F5C\u53F0" }),
      held.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: "\u5F85\u63D2\u5165\u8BED\u97F3" }),
        held.map((v) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: ctx.sessions.list.getSnapshot().byId[v.sessionId]?.displayTitle ?? "\u539F\u4F1A\u8BDD\u4E0D\u53EF\u7528" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { children: v.text }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: () => voice?.for(v.sessionId).retry(), children: "\u63D2\u5165\u539F\u4F1A\u8BDD" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: () => voice?.for(v.sessionId).discard(), children: "\u4E22\u5F03" })
        ] }, v.sessionId))
      ] })
    ] });
  }
  ctx.provide("voiceDeck", { ...store, setEnabled, assign: bindLane, activate, open, intent });
  ctx.effect(() => {
    const style = document.createElement("style");
    style.textContent = css;
    style.dataset.plugin = "voice-deck";
    document.head.append(style);
    const off = ctx.sessions.list.subscribe(syncLeases);
    return () => {
      off();
      const detach = detachMount;
      detachMount = void 0;
      detach?.();
      disposed = true;
      const offBind = gamepadBind;
      if (offBind) {
        gamepadBind = void 0;
        offBind();
      }
      const offView = disposeView;
      disposeView = void 0;
      offView?.();
      for (const release of leases.values()) release();
      leases.clear();
      style.remove();
    };
  }, "voice deck lifecycle");
  ctx.slots.inject("sidebar.workspaces.before", () => ctx.slots.register({ name: "sidebar.workspaces.before", id: "voice-deck", order: -100 }, Slots));
  ctx.slots.inject("conversation.view", () => {
    if (state.enabled) setEnabled(true);
    return () => {
      disposeView?.();
      disposeView = void 0;
    };
  });
  ctx.slots.inject("settings.section", () => ctx.slots.register({ name: "settings.section", id: "voice-deck", label: () => "\u4F1A\u8BDD\u5DE5\u4F5C\u53F0", order: 87 }, Settings));
  ctx.inject(["androidVoice"], (c) => {
    voice = c.androidVoice;
    publish({});
    c.effect(() => () => {
      voice = void 0;
      publish({});
    }, "voice deck optional voice");
  });
  ctx.inject(["gamepadInput"], (c) => {
    gamepad = c.gamepadInput;
    syncGamepad();
    c.effect(() => () => {
      gamepad = void 0;
      syncGamepad();
    }, "voice deck optional gamepad");
  });
}
return module.exports;}});
