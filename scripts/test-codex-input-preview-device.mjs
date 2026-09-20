import {requireFoldDevice} from './lib/device-target.mjs'
import {execFileSync} from 'node:child_process';import {writeFileSync,mkdirSync} from 'node:fs';import {connect} from './lib/android-cdp.mjs';import assert from 'node:assert/strict';
const serial=process.argv[2];requireFoldDevice(serial);
const base='/data/user/0/com.dsharnessmobile.shell/files';
const source=`import * as fs from 'node:fs/promises';import * as path from 'node:path';import vm from 'node:vm';import {createHash,randomUUID} from 'node:crypto';
const base=${JSON.stringify(base)};const source=await fs.readFile(base+'/home/.dsh/profiles/web/node_modules/relay-dsh-plugin-codex/lib/host-plugin.js','utf8');const code=source.slice(source.indexOf('//#region codex-image.js'),source.indexOf('//#region codex-tools.js'));
const ctx=vm.createContext({...fs,...path,Buffer,createHash,randomUUID,homedir:()=>base+'/home',process:{env:{}},Uint8Array});vm.runInContext(code+';globalThis.api={codexImagePreviewRoots,importCodexImage}',ctx);
const roots=ctx.api.codexImagePreviewRoots('/storage/emulated/0/work',base+'/home/.dsh/codex-android/home');const input=base+'/home/.codex/dsh-input-images/7b132ce7182e73065164834bf2f2cc9eababc80f3d4379e6963bcecdc0759c0b.jpg';
await ctx.api.importCodexImage(input,roots,{async saveImage({data,mediaType}){console.log(JSON.stringify({mediaType,sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length,base64:data.toString('base64')}));return {attachmentId:'validation'}}});`;
const adb=(args,options={})=>execFileSync('adb',['-s',serial,...args],{maxBuffer:16*1024*1024,...options});
adb(['shell','run-as','com.dsharnessmobile.shell','sh','-c',"'cat > files/input-preview-test.mjs'"],{input:source});
let c;
try{
 const command=`LD_LIBRARY_PATH=${base}/usr/lib ${base}/usr/bin/node ${base}/input-preview-test.mjs`;
 const r=JSON.parse(adb(['shell','run-as','com.dsharnessmobile.shell','sh','-c',"'"+command+"'"]).toString());
 c=await connect(serial);const decoded=await c.evaluate(`(async()=>{const image=new Image();image.src=${JSON.stringify('data:'+r.mediaType+';base64,'+r.base64)};await image.decode();return {width:image.naturalWidth,height:image.naturalHeight}})()`);
 assert(decoded.width>0&&decoded.height>0);delete r.base64;const result={passed:true,installedPreviewFunctionUsed:true,realInputCacheAccepted:true,webViewDecoded:true,...r,...decoded};
 mkdirSync('docs/validation/2026-09-10-codex',{recursive:true});writeFileSync('docs/validation/2026-09-10-codex/input-preview-device.json',JSON.stringify(result,null,2)+'\n');console.log(result);
}finally{c?.close();adb(['shell','run-as','com.dsharnessmobile.shell','rm','-f','files/input-preview-test.mjs'])}
