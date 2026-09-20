window.__ModuleLoader__.load({id:"@dsh-android/dsh-android-voice-input",factory:(require)=>{var module={exports:{}};var exports=module.exports;
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

// src/client/waveform.ts
function buildVoiceWavePath(values, energy, verticalOffset, scale, shift) {
  const width = 360;
  const centerY = 38 + verticalOffset;
  const usable = Math.max(2, values.length - 1);
  const points = values.map((value, index) => {
    const x = index / usable * width;
    const sample = values[(index + shift) % values.length] ?? value;
    const sample2 = values[(index + shift + 5) % values.length] ?? value;
    const signed = Math.max(-1, Math.min(1, sample * 0.82 + sample2 * 0.18));
    const envelope = 0.28 + Math.sin(index / usable * Math.PI) * 0.72;
    const amplitude = (18 + energy * 92) * envelope * scale;
    return { x, y: centerY + signed * amplitude };
  });
  if (!points.length) return `M 0 ${centerY} L ${width} ${centerY}`;
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const midX = (previous.x + current.x) / 2;
    const midY = (previous.y + current.y) / 2;
    d += ` Q ${previous.x.toFixed(1)} ${previous.y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
  }
  const last = points[points.length - 1];
  d += ` T ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

// src/client/draft.ts
function insertion(state, transcript) {
  const text = transcript.trim();
  if (!text || state.phase !== "plain") return void 0;
  const prefix = state.draft && !/\s$/.test(state.draft) ? "\n" : "";
  const end = state.draft.length - (state.occurrences ?? []).reduce((sum, ref) => sum + ref.length - 1, 0);
  if (!Number.isInteger(end) || end < 0) return void 0;
  return { text: prefix + text, span: { start: end, end, draftRev: state.draftRev } };
}

// src/client/index.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function bridge() {
  return window.androidBridge;
}
var enabledEvent = "dsh-voice-toggle";
var hostEnabled = false;
function readEnabled() {
  return hostEnabled;
}
function setEnabled(value) {
  hostEnabled = value;
  if (!value) bridge()?.voiceRelease();
  window.dispatchEvent(new CustomEvent(enabledEvent, { detail: value }));
}
function useEnabled() {
  const [enabled, set] = (0, import_react.useState)(readEnabled);
  (0, import_react.useEffect)(() => {
    const update = (e) => set(e.detail);
    window.addEventListener(enabledEvent, update);
    return () => window.removeEventListener(enabledEvent, update);
  }, []);
  return enabled;
}
var busy = (phase) => ["permission", "preparing", "recording", "transcribing"].includes(phase);
var idle = () => ({ ok: true, id: "", phase: "idle" });
var VoiceSession = class {
  constructor(insert, sessionId, acquire) {
    this.insert = insert;
    this.sessionId = sessionId;
    this.acquire = acquire;
    try {
      const text = localStorage.getItem("dsh.voice.held." + sessionId);
      if (text) this.state = { ok: true, id: "", phase: "error", text, error: "\u6709\u5C1A\u672A\u63D2\u5165\u7684\u8BED\u97F3\u6587\u5B57\u3002" };
    } catch {
    }
  }
  state = idle();
  listeners = /* @__PURE__ */ new Set();
  timer;
  active = null;
  users = 0;
  releaseLease;
  retry = () => {
    if (!this.state.text || !this.tryInsert(this.state.text)) return;
    this.discard();
  };
  discard = () => {
    try {
      localStorage.removeItem("dsh.voice.held." + this.sessionId);
    } catch {
    }
    this.finish();
    this.publish(idle());
  };
  tryInsert(text) {
    try {
      return this.insert(text);
    } catch {
      return false;
    }
  }
  finish() {
    if (this.active) bridge()?.voiceAcknowledge(this.active);
    this.active = null;
    this.stopPolling();
    this.releaseLease?.();
    this.releaseLease = void 0;
  }
  snapshot = () => this.state;
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  publish(value) {
    this.state = value;
    this.listeners.forEach((fn) => fn());
  }
  stopPolling() {
    if (this.timer !== void 0) clearInterval(this.timer);
    this.timer = void 0;
  }
  attach() {
    this.users++;
    return () => {
      this.users--;
    };
  }
  start = () => {
    const native = bridge();
    if (!readEnabled() || !native?.voiceStart || this.active || this.state.text) return;
    const id = crypto.randomUUID();
    try {
      this.releaseLease = this.acquire();
      const next = JSON.parse(native.voiceStart(id));
      if (!next.ok) {
        this.finish();
        this.publish({ ...next, id, phase: "error" });
        return;
      }
      this.active = id;
      this.publish(next);
      this.timer = window.setInterval(this.poll, 75);
    } catch {
      native.voiceCancel(id);
      this.finish();
      this.publish({ ok: false, id, phase: "error", error: "\u65E0\u6CD5\u542F\u52A8\u8BED\u97F3\u8F93\u5165" });
    }
  };
  stop = () => {
    if (this.active) bridge()?.voiceStop(this.active);
  };
  cancel = () => {
    if (this.active) bridge()?.voiceCancel(this.active);
    this.active = null;
    this.stopPolling();
    this.releaseLease?.();
    this.releaseLease = void 0;
    if (this.state.phase !== "error" || !this.state.text) this.publish(idle());
  };
  poll = () => {
    const id = this.active;
    if (!id) return;
    try {
      const next = JSON.parse(bridge().voiceStatus());
      if (next.id !== id) {
        this.cancel();
        return;
      }
      if (next.phase === "done") {
        this.stopPolling();
        const inserted = next.text ? this.tryInsert(next.text) : false;
        if (!inserted && next.text) {
          try {
            localStorage.setItem("dsh.voice.held." + this.sessionId, next.text);
          } catch {
            this.active = id;
            this.publish({ ...next, phase: "error", error: "\u6587\u5B57\u5C1A\u672A\u4FDD\u5B58\uFF0C\u8BF7\u5148\u590D\u5236\u3002" });
            return;
          }
        }
        this.finish();
        this.publish(inserted || !next.text ? idle() : { ...next, phase: "error", error: "\u8349\u7A3F\u6682\u4E0D\u53EF\u7F16\u8F91\uFF0C\u8F6C\u5F55\u4FDD\u7559\u5728\u8FD9\u91CC\uFF0C\u53EF\u590D\u5236\u540E\u4F7F\u7528\u3002" });
      } else if (["error", "canceled"].includes(next.phase)) {
        this.active = null;
        this.stopPolling();
        this.publish(next.phase === "canceled" ? idle() : next);
        this.releaseLease?.();
        this.releaseLease = void 0;
      } else this.publish(next);
    } catch {
      this.cancel();
      this.publish({ ok: false, id, phase: "error", error: "\u8BED\u97F3\u8FDE\u63A5\u5DF2\u4E2D\u65AD\uFF0C\u8BF7\u91CD\u8BD5" });
    }
  };
};
var css = `
.dsh-voice-control{display:inline-flex;align-items:center}
.dsh-voice-mic{border:0;background:transparent;color:inherit;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;cursor:pointer}
.dsh-voice-mic:hover{background:color-mix(in srgb,currentColor 10%,transparent)}.dsh-voice-mic:disabled{opacity:.4;cursor:default}.dsh-voice-mic[data-recording=true]{background:#0d948825;color:#2dd4bf}
.dsh-voice-panel{box-sizing:border-box;width:calc(100% - 2 * var(--dsh-composer-side-clearance,16px));max-width:var(--dsh-composer-card-max-width,868px);margin:0 auto;border:1px solid color-mix(in srgb,#4fd8e8 18%,var(--dsw-alias-border-l2));border-radius:16px;background:var(--dsw-specific-input-major,#27272a);color:var(--dsw-alias-label-primary,#e4e4e7);font:12px/1.5 system-ui}
.dsh-voice-strip{display:grid;grid-template-columns:auto minmax(60px,1fr) auto;align-items:center;gap:16px;min-height:52px;padding:0 12px 0 16px}.dsh-voice-status{font-size:11px;font-weight:600;color:#4fd8e8;white-space:nowrap}.dsh-voice-wave{height:40px;min-width:0;opacity:.9}.dsh-voice-wave svg{display:block;width:100%;height:100%;overflow:hidden}.dsh-voice-wave path{fill:none;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;transition:d 80ms linear,opacity 120ms ease}
.dsh-voice-actions{display:flex;align-items:center;gap:4px}.dsh-voice-actions button{width:36px;height:36px;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-secondary,#a1a1aa);display:grid;place-items:center;cursor:pointer}.dsh-voice-actions button:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff0d)}.dsh-voice-actions .dsh-voice-finish{color:#4fd8e8}.dsh-voice-timer{min-width:32px;text-align:right;margin-right:6px;font:11px ui-monospace,monospace;color:var(--dsw-alias-label-tertiary,#8c8c93)}
.dsh-voice-error{padding:10px 16px;color:var(--dsw-alias-label-secondary,#a1a1aa)}.dsh-voice-result{white-space:pre-wrap;user-select:text;max-height:150px;overflow:auto;margin-top:8px}.dsh-voice-settings{padding:18px;line-height:1.65}.dsh-voice-settings p{opacity:.75}
@media(max-width:480px){.dsh-voice-strip{gap:8px;padding-left:12px}.dsh-voice-timer{display:none}}

`;
function useVoice(voice) {
  (0, import_react.useEffect)(() => voice.attach(), [voice]);
  return (0, import_react.useSyncExternalStore)(voice.subscribe, voice.snapshot);
}
function Microphone({ voice, useInput }) {
  const state = useVoice(voice), phase = useInput((s) => s.phase), recording = state.phase === "recording";
  const label = recording ? "\u505C\u6B62\u5F55\u97F3\u5E76\u8F6C\u6210\u6587\u5B57" : "\u8BED\u97F3\u8F93\u5165";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-voice-control", "data-plugin": "android-voice-input", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "button",
    {
      type: "button",
      className: "dsh-voice-mic",
      "aria-label": label,
      title: label,
      "data-recording": recording,
      disabled: !bridge()?.voiceStart || !recording && (busy(state.phase) || phase !== "plain"),
      onClick: recording ? voice.stop : voice.start,
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { width: "23", height: "23", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", "aria-hidden": "true", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "9", y: "3", width: "6", height: "12", rx: "3" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M5 11v1a7 7 0 0 0 14 0v-1M12 19v3M8 22h8" })
      ] })
    }
  ) });
}
function Panel({ voice }) {
  const state = useVoice(voice), recording = state.phase === "recording", uid = (0, import_react.useId)().replace(/:/g, "");
  if (state.phase === "idle" || state.phase === "canceled") return null;
  const title = state.phase === "permission" ? "\u5141\u8BB8\u9EA6\u514B\u98CE" : state.phase === "preparing" ? "\u51C6\u5907\u4E2D" : recording ? "\u6B63\u5728\u8046\u542C" : state.phase === "transcribing" ? "\u8F6C\u5F55\u4E2D" : "\u8BED\u97F3\u8F93\u5165";
  const remaining = Math.max(0, (5e3 - (state.silenceMs ?? 0)) / 1e3);
  const source = recording ? state.waveformSamples ?? Array(72).fill(0) : Array(72).fill(0);
  const energy = recording ? Math.max(0.05, state.level ?? 0) : 0.03;
  const paths = [[0, 1.45, 0], [-8, 0.9, 11], [8, 0.82, 23]].map(([offset, scale, shift]) => buildVoiceWavePath(source, energy, offset, scale, shift));
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "dsh-voice-panel", "data-plugin": "voice-waveform", "aria-label": "\u8BED\u97F3\u8F93\u5165\u6CE2\u5F62", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-voice-strip", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-voice-status", role: "status", children: title }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-voice-wave", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { viewBox: "0 0 360 76", preserveAspectRatio: "none", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("defs", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", { id: `${uid}-main`, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "0%", stopColor: "#4fd8e8", stopOpacity: ".1" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "30%", stopColor: "#4fd8e8", stopOpacity: ".85" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "62%", stopColor: "#93c5fd", stopOpacity: ".75" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "100%", stopColor: "#a5b4fc", stopOpacity: ".12" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", { id: `${uid}-upper`, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "0%", stopColor: "#93c5fd", stopOpacity: ".06" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "50%", stopColor: "#93c5fd", stopOpacity: ".48" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "100%", stopColor: "#4fd8e8", stopOpacity: ".06" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", { id: `${uid}-lower`, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "0%", stopColor: "#a5b4fc", stopOpacity: ".06" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "50%", stopColor: "#a5b4fc", stopOpacity: ".42" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "100%", stopColor: "#4fd8e8", stopOpacity: ".06" })
          ] })
        ] }),
        paths.map((d, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d, stroke: `url(#${uid}-${["main", "upper", "lower"][i]})`, strokeWidth: i === 0 ? 1.25 : 0.9, opacity: i === 0 ? 0.85 : 0.52 }, i))
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-voice-actions", children: [
        recording && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-voice-timer", title: "\u8FDE\u7EED 5 \u79D2\u65E0\u8BED\u97F3\u81EA\u52A8\u7ED3\u675F", children: [
          remaining.toFixed(1),
          "s"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", "aria-label": busy(state.phase) ? "\u53D6\u6D88\u8BED\u97F3\u8F93\u5165" : "\u5173\u95ED\u8BED\u97F3\u63D0\u793A", title: "\u53D6\u6D88", onClick: voice.cancel, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m6 6 12 12M6 18 18 6" }) }) }),
        recording && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-voice-finish", "aria-label": "\u5B8C\u6210\u5F55\u97F3", title: "\u5B8C\u6210\u5F55\u97F3", onClick: voice.stop, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { width: "19", height: "19", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m5 12 4 4L19 6" }) }) })
      ] })
    ] }),
    state.phase === "error" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-voice-error", children: [
      state.error,
      state.text && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-voice-result", children: [
        state.text,
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: voice.retry, children: "\u63D2\u5165\u8349\u7A3F" }),
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: voice.discard, children: "\u4E22\u5F03\u6587\u5B57" })
        ] })
      ] })
    ] })
  ] });
}
function MicrophoneEntry(props) {
  return useEnabled() ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Microphone, { ...props }) : null;
}
function PanelEntry(props) {
  return useEnabled() ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, { ...props }) : null;
}
var inject = ["slots", "sessions", "conversation", "settingsScope"];
function apply(ctx) {
  const sessions = /* @__PURE__ */ new Map();
  const settings = ctx.settingsScope.bind({ namespace: "speech-services" });
  ctx.effect(() => {
    let dead = false, migrating = false;
    const update = () => {
      const snap = settings.getSnapshot();
      setEnabled(snap.status === "ready" && snap.value?.enabled === true && snap.value?.asrEnabled === true);
      const old = localStorage.getItem("dsh.android.voice.enabled");
      if (!dead && !migrating && snap.status === "ready" && snap.writable && old !== null && !Object.prototype.hasOwnProperty.call(snap.user ?? {}, "asrEnabled")) {
        migrating = true;
        void settings.set("asrEnabled", old !== "false").then(() => {
          localStorage.removeItem("dsh.android.voice.enabled");
        }).catch(() => {
        }).finally(() => {
          migrating = false;
        });
      }
    };
    const off = settings.subscribe(update);
    update();
    return () => {
      dead = true;
      off();
      setEnabled(false);
    };
  }, "Default speech service settings");
  const inject2 = (sessionId) => {
    let voice = sessions.get(sessionId);
    if (!voice) {
      voice = new VoiceSession((text) => {
        const scope = ctx.sessions.scope(sessionId);
        if (!scope) return false;
        const request = insertion(ctx.conversation.input.for(scope).state.getSnapshot(), text);
        return request ? scope.bail(scope, "slash/input-insert-text", request) === true : false;
      }, sessionId, () => ctx.sessions.acquireStage?.(sessionId) ?? (() => {
      }));
      sessions.set(sessionId, voice);
    }
    return { sessionId, voice };
  };
  ctx.provide("androidVoice", {
    for: (id) => inject2(id).voice,
    enabled: readEnabled,
    leave: (id) => {
      const voice = sessions.get(id);
      if (!voice) return;
      const phase = voice.snapshot().phase;
      if (phase === "recording") voice.stop();
      else if (phase === "preparing" || phase === "permission") voice.cancel();
    },
    busy: () => [...sessions.values()].some((v) => busy(v.snapshot().phase)),
    held: () => Object.keys(localStorage).filter((k) => k.startsWith("dsh.voice.held.")).map((k) => ({ sessionId: k.slice("dsh.voice.held.".length), text: localStorage.getItem(k) }))
  });
  ctx.effect(() => {
    const s = document.createElement("style");
    s.dataset.plugin = "android-voice-input";
    s.textContent = css;
    document.head.append(s);
    return () => {
      sessions.forEach((voice) => voice.cancel());
      sessions.clear();
      s.remove();
      bridge()?.voiceRelease();
    };
  }, "voice plugin lifecycle");
  ctx.slots.inject("conversation.input.right", () => ctx.slots.register({ name: "conversation.input.right", id: "android-voice-input", order: 90, inject: inject2 }, MicrophoneEntry));
  ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({ name: "conversation.input.dock", id: "android-voice-waveform", order: 99, inject: inject2 }, PanelEntry));
}
return module.exports;}});
