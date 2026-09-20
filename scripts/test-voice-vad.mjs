/** Physical speaker -> microphone test of automatic VAD endpoint and waveform. */
import { connect } from './lib/android-cdp.mjs'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'
const [serial, folder] = process.argv.slice(2)
if (!folder) throw new Error('Usage: SERIAL OUTPUT')
mkdirSync(folder, { recursive: true })
const c = await connect(serial), samples = [], pause = ms => new Promise(r => setTimeout(r, ms))
const observe = () => c.evaluate(`(()=>{const editor=document.querySelector('[data-composer-input]'),panel=document.querySelector('.dsh-voice-panel');return {voice:JSON.parse(androidBridge.voiceStatus()),draft:editor?.innerText,prompt:panel?.innerText,bars:document.querySelectorAll('.dsh-voice-wave path').length,above:!!panel&&panel.getBoundingClientRect().bottom<=editor.getBoundingClientRect().top,geometry:panel?{panel:panel.getBoundingClientRect().toJSON(),composer:document.querySelector('[data-composer-card]').getBoundingClientRect().toJSON()}:null,heights:[...document.querySelectorAll('.dsh-voice-wave path')].map(e=>e.getAttribute('d'))}})()`)
try {
  const requests = []; c.on('Network.requestWillBeSent', e => requests.push(new URL(e.request.url).pathname)); await c.call('Network.enable')
  const initial = await observe()
  assert(['idle', 'error', 'canceled'].includes(initial.voice.phase), 'Active user recording')
  const refs = () => c.evaluate(`[...document.querySelectorAll('[data-composer-chip=reference]')].map(e=>e.outerHTML)`)
  const beforeRefs = await refs()
  await c.evaluate(`document.querySelector('[aria-label="语音输入"]').click()`)
  const start = Date.now(); let ready = false
  while (Date.now() - start < 95000) {
    const s = await observe(); if (s.voice.phase === 'recording') { ready = true; break }
    if (s.voice.phase === 'error') throw new Error(s.voice.error)
    await pause(100)
  }
  assert(ready, 'Microphone not ready')
  const wav = readFileSync(new URL('../asr-lab/app/src/main/assets/samples/asr_zh.wav', import.meta.url)).toString('base64')
  const play = await c.call('Runtime.evaluate', { expression: `(()=>{const a=new Audio(${JSON.stringify('data:audio/wav;base64,' + wav)});window.__voiceTestAudio=a;a.onended=()=>{window.__voicePlayEnded=Date.now()};a.play();return true})()`, userGesture: true, returnByValue: true })
  assert(!play.exceptionDetails)
  let result, endpoint, maximumBars = 0, shot = false, above = false
  const audioStart = Date.now()
  while (Date.now() - audioStart < 120000) {
    result = await observe(); samples.push({ atMs: Date.now() - audioStart, ...result })
    maximumBars = Math.max(maximumBars, result.bars); above ||= result.above
    if (!shot && result.voice.phase === 'recording' && result.voice.capturedMs > 1000 && result.voice.level > .15) {
      const capture = await c.call('Page.captureScreenshot', { format: 'png' }); writeFileSync(folder + '/waveform.png', Buffer.from(capture.data, 'base64')); shot = true
    }
    if (result.voice.autoStopped && !endpoint) endpoint = { ...result.voice, observedAtMs: Date.now() - audioStart }
    if (['idle', 'error'].includes(result.voice.phase)) break
    await pause(75)
  }
  assert.equal(result.voice.phase, 'idle', result.prompt)
  assert(endpoint?.speechDetected && endpoint.autoStopped, 'No automatic speech endpoint')
  assert.equal(endpoint.silenceMs, 5000)
  assert.equal(maximumBars, 3); assert(above, 'Waveform not above editor'); const g=samples.find(s=>s.geometry)?.geometry; assert(g && Math.abs(g.panel.left-g.composer.left)<2 && Math.abs(g.panel.right-g.composer.right)<2,'Waveform must align with composer'); assert(g.panel.height<=56,'Waveform strip too tall'); assert(g.composer.top-g.panel.bottom<=12,'Waveform too far from composer')
  assert(new Set(samples.filter(s => s.voice.phase === 'recording').map(s => s.heights.join(','))).size > 4, 'Waveform did not respond to audio')
  assert(result.draft.startsWith(initial.draft)); assert(result.draft.length > initial.draft.length)
  assert.deepEqual(await refs(), beforeRefs)
  assert(!requests.some(p => p.includes('/api/session/prompt')))
  const performance = await c.evaluate('JSON.parse(androidBridge.performanceSample())'); assert(!('cpu' in performance))
  const receipt = { source: 'tablet speaker -> physical microphone -> WebRTC VAD -> Qwen3-ASR-0.6B CPU -> draft', waveformCurves: maximumBars, aboveComposer: above, referenceCount: beforeRefs.length, referencesPreserved: true, agentPromptRequests: 0, finalDraft: result.draft, capturedMs: result.voice.capturedMs, lastSpeechMs: result.voice.lastSpeechMs, audioMs: result.voice.audioMs, silenceMs: result.voice.silenceMs, autoStopped: result.voice.autoStopped, requestMs: result.voice.requestMs, firstTextMs: result.voice.firstTextMs, audioStartToDraftMs: Date.now() - audioStart, performance }
  writeFileSync(folder + '/receipt.json', JSON.stringify(receipt, null, 2)); console.log(JSON.stringify(receipt, null, 2))
} finally {
  writeFileSync(folder + '/samples.json', JSON.stringify(samples, null, 2))
  await c.evaluate(`(()=>{window.__voiceTestAudio?.pause();delete window.__voiceTestAudio;delete window.__voicePlayEnded;const s=JSON.parse(androidBridge.voiceStatus());if(['preparing','recording','transcribing'].includes(s.phase))androidBridge.voiceCancel(s.id)})()`).catch(() => {})
  c.close()
}
