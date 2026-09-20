"""Pinned attachment plugin overlay: route image intake to its original session."""
import hashlib,pathlib
root=pathlib.Path(__file__).resolve().parents[1]
source=root/'android-shell/vendor/dsh-attachment-formats/client.original.js'
raw=source.read_bytes()
assert hashlib.sha256(raw).hexdigest()=='35911f6da9af3363a185b6b1564f813eb249a9d99a68f52bd56400be84bb2f98'
s=raw.decode()
def replace(old,new,count=1):
 global s
 assert s.count(old)==count,old[:100]
 s=s.replace(old,new)
start=s.index('\t\tfunction redispatchDrop(files) {')
end=s.index('\t\tfunction injectTexts(notes) {',start)
s=s[:start]+'''        function redispatchDrop(files, sessionId) {
            // Never broadcast synthetic document drops to competing editors.
            if (!sessionId || !activeSession.imageInput?.for(sessionId).addImages(files)) {
                throw new Error("目标会话暂不可添加图片，请回到该会话重试");
            }
        }
'''+s[end:]
replace('redispatchDrop(images);','''try { redispatchDrop(images, sessionId); }
                catch (error) { setBus({phase:"error",label:"图片未添加",detail:error.message});return; }''')
replace('const inject = ["slots", "sessions"];','const inject = ["slots", "sessions", "deckInput"];')
replace('activeSession.sessionsService = ctx.sessions;','activeSession.sessionsService = ctx.sessions;\n            activeSession.imageInput = ctx.deckInput;')
start=s.index('\t\tfunction composerReady() {')
end=s.index('\n\t\t}',start)+len('\n\t\t}')
s=s[:start]+'''        function composerReady(sessionId) {
            if (!sessionId) return false;
            try {
                const state = activeSession.imageInput?.for(sessionId).state.getSnapshot();
                return !!state && state.phase !== "adjudicating" && state.phase !== "submitting";
            } catch { return false; }
        }'''+s[end:]
replace('if (!composerReady()) {','if (!composerReady(requestSession)) {')
replace('function currentCwd() {','function currentCwd(explicitSessionId) {')
replace('const id = resolveSessionId(undefined);','const id = resolveSessionId(explicitSessionId);')
replace('const cwd = currentCwd();\n\t\t\tconst sessionId = resolveSessionId(explicitSessionId);','const sessionId = resolveSessionId(explicitSessionId);\n            const cwd = currentCwd(sessionId);')
# Capture the event's lane before asynchronous conversions or focus changes.
replace('void intake(files);','void intake(files, eventSessionId(event));')
replace('void intake(files).then(() => {','void intake(files, eventSessionId(event)).then(() => {')
replace('if (files.every((file) => classifyFile(file) === "native-image")) return; // 原生图片走内建管线','// Images also use the addressed intake instead of global drop listeners.')
replace('if (files.every((file) => classifyFile(file) === "native-image")) return;','// Bind native image paste to the originating editor too.')
replace('function resolveSessionId(explicit) {','''function eventSessionId(event) {
            const target = event.target instanceof Element ? event.target : document.activeElement;
            return target?.closest('[data-deck-lane]')?.getAttribute('data-deck-lane') ?? shellCurrentSessionId();
        }
        function resolveSessionId(explicit) {''')
# Per-session cancellation avoids one lane's upload superseding another lane's.
replace('let intakeSeq = 0;','const intakeSeqBySession = new Map();')
replace('const seq = ++intakeSeq;','const requestSession = resolveSessionId(explicitSessionId);\n            const seq = (intakeSeqBySession.get(requestSession) ?? 0) + 1;\n            intakeSeqBySession.set(requestSession, seq);')
replace('seq !== intakeSeq','seq !== intakeSeqBySession.get(requestSession)',s.count('seq !== intakeSeq'))
out=root/'android-shell/app/src/main/assets/patched/attachment-session-client.js';out.write_text(s)
print('Patched attachment session routing',hashlib.sha256(out.read_bytes()).hexdigest())
