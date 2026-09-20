import { connect } from './lib/android-cdp.mjs'
import { readFileSync } from 'node:fs'
const cdp=await connect(process.argv[2])
try { console.log(JSON.stringify(await cdp.evaluate(process.argv[3]?readFileSync(process.argv[3],'utf8'):`({text:document.body.innerText.slice(-12000),buttons:[...document.querySelectorAll('button')].map(b=>({label:b.getAttribute('aria-label'),title:b.title,text:b.textContent})),voice:!!window.androidBridge?.voiceStart})`),null,2)) }
finally { cdp.close() }
