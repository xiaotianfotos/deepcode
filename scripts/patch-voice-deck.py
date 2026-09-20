#!/usr/bin/env python3
"""Version-guarded, reproducible client overlays; upstream checkout stays untouched."""
import hashlib
import json
import pathlib
import tarfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
PREFIX = 'usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/'
PACKAGES = ['dsh-api-session-controller', 'dsh-client-ui-renderer', 'dsh-client-ui-conversation', 'dsh-client-ui-workspace']
DEST = ROOT / '.tools/deck-patches'

def replace(s, old, new, count=1):
    assert s.count(old) == count, f'Unsupported runtime: expected {count} occurrences: {old[:100]!r}, got {s.count(old)}'
    return s.replace(old, new)

def patch(name, s, engine_version="0.1.2-rc.1"):
    assert engine_version in {"0.1.2-rc.1", "0.1.5-rc.1"}, "Unsupported deck engine"
    modern = engine_version == "0.1.5-rc.1"
    if name == 'dsh-api-session-controller':
        s = replace(s, '\t\t\twatched;', '''\t\t\twatched;
            stageRefs = new Map();
            acquireStage(id) {
                const record = this.resolve(id);
                if (!record) throw new Error('Unavailable session');
                this.stageRefs.set(id, (this.stageRefs.get(id) || 0) + 1);
                void record.session.open();
                let released = false;
                return () => {
                    if (released) return;
                    released = true;
                    const refs = this.stageRefs.get(id) || 0;
                    if (refs <= 1) this.stageRefs.delete(id); else this.stageRefs.set(id, refs - 1);
                    this.sweepDeferred(); this.pruneScopes();
                };
            }
''')
        s = replace(s, 'if (id === this.watched)', 'if (id === this.watched || this.stageRefs.has(id))', 2)
    elif name == 'dsh-client-ui-renderer':
        # Deliberately limited surface: no arbitrary slot access, same renderer machinery.
        s = replace(s, '\t\texports.SlotRegistry = SlotRegistry;', '''
        function SessionSurface({sessionId, part, blocked, openView}) {
            const host = useHost();
            observableHook(host.scopeRevision)(value => value);
            const adapter = host.scope('session');
            if (!adapter) throw new SlotAssemblyError('Session adapter unavailable');
            observableHook(adapter.current)(value => value);
            const binding = adapter.resolve(sessionId);
            if (!binding) return null;
            return react_jsx_runtime.jsx(ScopeBindingContext.Provider, {value: binding,
                children: react_jsx_runtime.jsx(SessionSurfaceBody, {part, blocked, openView})}, sessionId);
        }
        function SessionSurfaceBody({part, blocked, openView}) {
            const binding = useScopeBinding();
            const root = useRootBinding();
            const session = observableHook(binding.hooks.session)(value => value);
            const input = observableHook(binding.hooks.input)(value => value);
            const pending = maybeObservableHook(root.hooks.sessionPendingInteraction)(value => value.get(binding.key));
            if (part === 'chat') return react_jsx_runtime.jsx(SlotOutlet, {
                slotKey: 'conversation.view', opts: {only:'chat'},
                ownerProps: {viewRequest:null, openView, completeViewRequest:()=>{}}});
            if (part !== 'composer') throw new Error('Unknown session surface');
            const fallback = react_jsx_runtime.jsxs(react.Fragment, {children:[
                react_jsx_runtime.jsx(SlotOutlet, {slotKey:'conversation.input.dock',ownerProps:{session,input}}),
                react_jsx_runtime.jsx(SlotOutlet, {slotKey:'conversation.composer.bar',ownerProps:{variant:'composer',blocked}})
            ]});
            return react_jsx_runtime.jsx(SlotOutlet, {slotKey:'conversation.composer',
                ownerProps:{sessionId:binding.key,session,pendingInteraction:pending}, opts:{fallback}});
        }
        exports.SessionSurface = SessionSurface;
\t\texports.SlotRegistry = SlotRegistry;''')
    elif name == 'dsh-client-ui-conversation':
        s = replace(s, 'function ConversationRoot({ sessionId,', 'function ConversationRoot({ useDeckView, sessionId,')
        s = replace(s, 'hooks: { composerBlock: sessionId === void 0 ? ABSENT_BLOCK : composerBlocks.storeFor(sessionId) },', 'hooks: { composerBlock: sessionId === void 0 ? ABSENT_BLOCK : composerBlocks.storeFor(sessionId), deckView: sessionId === void 0 ? ABSENT_BLOCK : ctx.slots.resolveStore(conversationStore, ctx.uiSession.adapter.resolve(sessionId)) },')
        s = replace(s, 'const composerBlock = useComposerBlock((block) => block);', 'const composerBlock = useComposerBlock((block) => block);\n            const deckMode = useDeckView(value => value?.view === "voice-deck");')
        s = replace(s, 'const hero = sessionId === void 0 || shellPhase === "blank" && (openState === "open" || summaryBlank === true);', 'const hero = !deckMode && (sessionId === void 0 || shellPhase === "blank" && (openState === "open" || summaryBlank === true));')
        s = replace(s, 'children: composer\n', 'children: deckMode ? null : composer\n')
        s = replace(s, 'if (session.blank && conversationPhase(session, conversation) === "blank") return null;', 'if (active?.id !== "voice-deck" && session.blank && conversationPhase(session, conversation) === "blank") return null;')
        # Only the repeated session title row disappears; view navigation stays reachable.
        s = replace(s, '"aria-hidden": hideChrome || void 0,', '"aria-hidden": hideChrome || void 0,\n                "data-deck-header": active?.id === "voice-deck" || void 0,')
        s = replace(s, 'className: ConversationRoot_module_css_default.titleRow,', 'className: ConversationRoot_module_css_default.titleRow,\n                    style: active?.id === "voice-deck" ? {display:"none"} : void 0,')
        s = replace(s, '"data-composer-card": true,', '"data-composer-card": true,\n                        "data-dsh-input-session": sessionId,')
        # Bind to the mounted official InputBar so its live guards and submit path stay authoritative.
        s = replace(s, '\t\tconst InputBar = (0, react.memo)(function InputBar(', '\t\tconst deckSubmitters = new Map();\n        const deckImageIntakes = new Map();\n\t\tconst InputBar = (0, react.memo)(function InputBar(')
        s = replace(s, 'if (rejected !== null) showToast(rejected);', 'if (rejected !== null) showToast(rejected);\n                return rejected === null;')
        drop_anchor = 'const canAcceptDrop = subagent === null && !locked && !machineBusy && addFiles !== void 0;' if modern else 'const canAcceptDrop = !locked && !machineBusy && addImages !== void 0;'
        intake = 'intakeFiles' if modern else 'intakeImages'
        s = replace(s, drop_anchor, drop_anchor + '''
            react.useLayoutEffect(() => {
                if (sessionId === void 0) return;
                const accept = files => canAcceptDrop && intakeImages(files) === true;
                deckImageIntakes.set(sessionId, accept);
                const card = cardRef.current;
                const nativeImages = event => { event.detail.accepted = accept(event.detail.files); };
                card?.addEventListener('dsh-native-images', nativeImages);
                return () => {
                    card?.removeEventListener('dsh-native-images', nativeImages);
                    if (deckImageIntakes.get(sessionId) === accept) deckImageIntakes.delete(sessionId);
                };
            }, [sessionId, canAcceptDrop, intakeImages]);'''.replace('intakeImages', intake))
        submit = """
            const submitDraft = () => {
                if (keyboard === void 0 || empty || disabled || machineBusy || uploadsPending || editor?.isComposing()) return false;
                keyboard.submit(primarySubmitMode);
                return true;
            };
            react.useLayoutEffect(() => {
                if (sessionId === void 0) return;
                deckSubmitters.set(sessionId, submitDraft);
                return () => { if (deckSubmitters.get(sessionId) === submitDraft) deckSubmitters.delete(sessionId); };
            }, [sessionId, submitDraft]);
"""
        if modern:
            s = replace(s, '\t\t\tconst onPrimary = () => {', submit + '\t\t\tconst onPrimary = () => {')
        else:
            s = replace(s, '\t\t\tconst onPrimary = () => {', """
                const submitDraft = () => {
                    if (inputActions === void 0 || empty || disabled || machineBusy || editor?.isComposing()) return false;
                    inputActions.submit();
                    return true;
                };
                react.useLayoutEffect(() => {
                    if (sessionId === void 0) return;
                    deckSubmitters.set(sessionId, submitDraft);
                    return () => { if (deckSubmitters.get(sessionId) === submitDraft) deckSubmitters.delete(sessionId); };
                }, [sessionId, submitDraft]);
                const onPrimary = () => {""")
            s = replace(s, '\t\t\t\tif (inputActions === void 0) return;\n\t\t\t\t/* v8 ignore next -- defensive: the primary button is disabled while empty||disabled, so a click cannot reach the false arm. */\n\t\t\t\tif (!empty && !disabled && !machineBusy) inputActions.submit();', '\t\t\t\tsubmitDraft();')
        # Background completion must never steal another lane's DOM selection.
        s = replace(s, 'applied = $replaceDetectSpanWithText(span, text);\n\t\t\t\t});',
                    'applied = $replaceDetectSpanWithText(span, text);\n\t\t\t\t}, this.editor.getRootElement() === document.activeElement ? "history-push" : "skip-dom-selection");')
        # Avoid four simultaneous mount effects stealing focus from the chosen lane.
        s = replace(s, 'if (locked || editor === null) return;\n\t\t\t\teditor.getRootElement()?.focus',
                    'if (locked || editor === null || editor.getRootElement()?.closest("[data-deck-lane]")) return;\n\t\t\t\teditor.getRootElement()?.focus')
        s = replace(s, '\t\t\tconst inputHub = new InputHub(ctx, t);', '''
            const inputHub = new InputHub(ctx, t);
            // Narrow public adapter; Lexical symbols remain inside their owning bundle.
            ctx.reflect.provide('deckInput', {for: (id) => {
                const shell = inputHub.shell(id);
                return {
                    state: shell.state,
                    composing: () => shell.editor.isComposing(),
                    focus: (atEnd = false) => {
                        const root = shell.editor.getRootElement();
                        if (!root || !shell.editor.isEditable() || atEnd && shell.editor.isComposing()) return false;
                        root.focus({preventScroll:true});
                        if (atEnd) shell.editor.update(() => nl().selectEnd(), {discrete:true, tag:'focus'});
                        shell.editor.focus(undefined, {defaultSelection:'rootEnd'});
                        return true;
                    },
                    send: () => deckSubmitters.get(id)?.() ?? false,
                    addImages: files => deckImageIntakes.get(id)?.(files) ?? false,
                    deleteBackward: () => {
                        if (shell.editor.isComposing() || !shell.editor.isEditable() || shell.snapshot.phase !== 'plain') return false;
                        return shell.editor.dispatchCommand($e$2, true);
                    },
                    attach: () => {
                        const entry = ctx.slots.entries('conversation.session')[0];
                        if (!entry?.store) throw new Error('Conversation store unavailable');
                        const instance = ctx.slots.resolveStore(entry.store, ctx.uiSession.adapter.resolve(id));
                        const stored = instance.getSnapshot().draft;
                        if (!shell.snapshot.draft && stored) shell.actions.setDraft(stored);
                        return shell.bindMirror(instance.actions.setDraft);
                    }
                };
            }});
''')
    else:
        # Insert a small root-scoped sidebar extension, without session claims.
        s = replace(s, '"sidebar.workspaces.directoryFlow": {\n', '"sidebar.workspaces.before": {kind:"list",scope:"root"},\n\t\t\t\t\t"sidebar.workspaces.directoryFlow": {\n')
        anchor = 'className: clsx(WorkspaceBrowser_module_css_default.root, !wide && WorkspaceBrowser_module_css_default.rail),\n\t\t\t\tchildren: ['
        s = replace(s, anchor, anchor + '\n                    renderSlot("sidebar.workspaces.before", {wide}),')
    return s

def main():
    source = ROOT / 'downloads/snapshot-arm64.tar.xz'
    expected = next(x['digest'].split(':',1)[1] for x in json.loads((ROOT/'docs/download-sources.json').read_text()) if x['name']==source.name)
    assert hashlib.file_digest(source.open('rb'),'sha256').hexdigest() == expected
    found = {}
    with tarfile.open(source, 'r|xz') as tar:
        for member in tar:
            for name in PACKAGES:
                if member.name == PREFIX + name + '/lib/client.js':
                    found[name] = tar.extractfile(member).read()
    assert set(found) == set(PACKAGES)
    DEST.mkdir(parents=True,exist_ok=True)
    receipt = {}
    for name, raw in found.items():
        result = patch(name, raw.decode()).encode()
        path = DEST / (name+'.js'); path.write_bytes(result)
        receipt[name] = {'base':hashlib.sha256(raw).hexdigest(), 'patched':hashlib.sha256(result).hexdigest()}
    (DEST/'manifest.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(receipt,indent=2))

if __name__ == '__main__': main()
