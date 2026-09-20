"""Narrow compatibility for Relay's out-of-band v1 tool activity messages.

An activity projection is not the settlement of the model's pending text stream.
Keep that attempt alive and preserve the activity's empty stream and ordering.
Unknown/missing chunk provenance still fails closed in the upstream migrator.
Live-only pre-step transcripts receive an explicitly marked empty format frame;
no request, prompt text, original event timestamp or message order is invented.
"""
import hashlib

BASE_SHA = '23950e7d0366d1bf5f46c9db69cbbfc64c0cfaab786147bdd40d044cefc74584'
ANCHOR = '\tif (!Array.isArray(sources)) {\n\t\tif (pending !== void 0) throw refusal'
INSERT = '''\t// DeepCode legacy Relay activity is an independent, non-streamed message.
\tconst activity = data["message"];
\tif (sources === void 0 && pending !== void 0 &&
\t\tactivity?.role === "assistant" && activity.source?.kind === "model" &&
\t\tactivity.source.provider === "relay-codex" &&
\t\tArray.isArray(activity.content) && activity.content.length === 1 &&
\t\tactivity.content[0].type === "tool-call" &&
\t\tactivity.content[0].name === "relay_codex_activity" &&
\t\ttypeof activity.content[0].id === "string" &&
\t\tactivity.content[0].id.startsWith("relay-codex:") &&
\t\t(event.surfaceOp === void 0 || event.surfaceOp === "append")) {
\t\tflushBuffered(state, pending, context);
\t\temitSource(state, messageEvent(event, attemptGroup(turn, step)), context);
\t\treturn;
\t}
'''

def patch_legacy_codex_migration(source: str) -> str:
    if INSERT in source:
        original = source.replace(INSERT, '', 1)
        if hashlib.sha256(original.encode()).hexdigest() == BASE_SHA:
            return source
        raise ValueError('Modified legacy migration patch payload')
    if hashlib.sha256(source.encode()).hexdigest() != BASE_SHA or source.count(ANCHOR) != 1:
        raise ValueError('Unsupported dsh-session-format-v1-to-v2 source; re-audit before patching')
    return source.replace(ANCHOR, INSERT + ANCHOR, 1)

LIVE_BASE_SHA = '2d35e1e0ed497af569d5735fc590187de1568489cfe60d070b5f61330cd5a338'
LIVE_EDITS = [
    ('\tprompt = "";\n\tconstructor(input)', '\tprompt = "";\n\tlegacyLiveUser;\n\tlegacyOpenTurn;\n\tlegacyProvider;\n\tconstructor(input)'),
    ('\ttransformEvent(event, context) {\n\t\tif (event.seq !== this.mapping.length)', '''\ttransformEvent(event, context) {
\t\t// A released GPT Live user projection was a complete, step-less turn.
\t\t// Wait for its closing event before adding an explicit format-only frame.
\t\tif (this.legacyLiveUser !== void 0) {
\t\t\tconst user = this.legacyLiveUser;
\t\t\tif (event.seq !== user.seq + 1 || event.type !== "turn/end" ||
\t\t\t\tevent.data?.turn !== this.legacyOpenTurn) throw new SessionFormatUnsupportedMigrationError("unsupported legacy Live user turn framing");
\t\t\tassertEvent(event, 2);
\t\t\tconst frame = { turn: this.legacyOpenTurn, step: 1 };
\t\t\tcontext.emitEvent(canonicalizeTransformedEvent({type: "step/start", seq: this.targetSeq++, time: user.time, data: frame}));
\t\t\tthis.step = frame;
\t\t\tthis.emitSystem("", user, context, "deepcode-legacy-live-migration");
\t\t\tcontext.emitEvent(canonicalizeTransformedEvent({type: "step/end", seq: this.targetSeq++, time: user.time, data: frame}));
\t\t\tthis.step = void 0;
\t\t\tthis.legacyLiveUser = void 0;
\t\t\tthis.transformEvent(user, context);
\t\t}
\t\tif (event.seq !== this.mapping.length)'''),
    ('\t\tif (SURFACE_TYPES.has(event.type) && this.head === void 0) throw new SessionFormatUnsupportedMigrationError("format v2 surface before first step cannot acquire a system head without changing chronology");', '''\t\tif (SURFACE_TYPES.has(event.type) && this.head === void 0) {
\t\t\tif (event.type === "user/message" && this.step === void 0 &&
\t\t\t\tthis.legacyOpenTurn !== void 0 && this.legacyProvider === "relay-codex" &&
\t\t\t\tdata["source"]?.kind === "user" && typeof data["id"] === "string" &&
\t\t\t\t/^gpt-live:[0-9a-f-]{36}:[0-9a-f-]{36}$/.test(data["id"]) && event.surfaceOp === "append") {
\t\t\t\tthis.legacyLiveUser = event;
\t\t\t\treturn;
\t\t\t}
\t\t\tthrow new SessionFormatUnsupportedMigrationError("format v2 surface before first step cannot acquire a system head without changing chronology");
\t\t}'''),
    ('\t\tif (event.type === "step/start") {\n\t\t\tthis.step = {', '''\t\tif (event.type === "turn/start") this.legacyOpenTurn = data["turn"];
\t\telse if (event.type === "turn/end") this.legacyOpenTurn = void 0;
\t\tif (event.type === "model/selection") this.legacyProvider = data["provider"];
\t\tif (event.type === "step/start") {
\t\t\tthis.step = {'''),
    ('\tfinish(_context) {\n\t\tconst cut', '\tfinish(_context) {\n\t\tif (this.legacyLiveUser !== void 0) throw new SessionFormatUnsupportedMigrationError("incomplete legacy Live user turn");\n\t\tconst cut'),
    ('\temitSystem(prompt, anchor, context) {', '\temitSystem(prompt, anchor, context, sourcePlugin = "@deepseek-ai/dsh-system-prompt") {'),
    ('\t\t\t\t\t\tplugin: "@deepseek-ai/dsh-system-prompt"', '\t\t\t\t\t\tplugin: sourcePlugin'),
]

def patch_legacy_live_migration(source: str) -> str:
    original = source
    if 'legacyLiveUser;' in source:
        for before, after in reversed(LIVE_EDITS):
            if original.count(after) != 1:
                raise ValueError('Modified legacy Live migration patch payload')
            original = original.replace(after, before, 1)
        if hashlib.sha256(original.encode()).hexdigest() != LIVE_BASE_SHA:
            raise ValueError('Modified legacy Live migration base')
        return source
    if hashlib.sha256(source.encode()).hexdigest() != LIVE_BASE_SHA:
        raise ValueError('Unsupported dsh-session-format-v2-to-v3 source')
    for before, after in LIVE_EDITS:
        if source.count(before) != 1:
            raise ValueError('Legacy Live migration anchor mismatch')
        source = source.replace(before, after, 1)
    return source
