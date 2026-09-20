from pathlib import Path
s=Path('android-shell/vendor/relay-dsh-plugin-codex/lib/host-plugin.js').read_text()
code=s[s.index('async function persistContentAddressedImage('):s.index('//#endregion',s.index('async function persistContentAddressedImage('))]
p=Path('.tools/image-cache-test.mjs');p.write_text('''import {chmod,link as nativeLink,lstat,mkdir,readFile,rename,unlink,writeFile,mkdtemp,rm,readdir,symlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';import {join} from 'node:path';import {tmpdir} from 'node:os';import assert from 'node:assert/strict';
let denied=false;const link=(...args)=>denied?Promise.reject(Object.assign(new Error('Android link denied'),{code:'EACCES'})):nativeLink(...args);
'''+code+'''
const root=await mkdtemp(join(process.argv[2]??tmpdir(),'dsh-image-cache-test-'));const data=process.argv[3]?await readFile(process.argv[3]):Buffer.from('verified image bytes');const hash=createHash('sha256').update(data).digest('hex');const target=join(root,hash+'.jpg');
try{
 denied=true;await persistContentAddressedImage(root,target,data,hash);assert.deepEqual(await readFile(target),data);
 await Promise.all(Array.from({length:5},()=>persistContentAddressedImage(root,target,data,hash)));assert.deepEqual(await readFile(target),data);
 await writeFile(target,'corrupt');await assert.rejects(persistContentAddressedImage(root,target,data,hash),{code:'CODEX_IMAGE_CACHE_INVALID'});assert.equal(await readFile(target,'utf8'),'corrupt');
 await unlink(target);const elsewhere=join(root,'outside');await writeFile(elsewhere,'do not change');await symlink(elsewhere,target);await assert.rejects(persistContentAddressedImage(root,target,data,hash),{code:'CODEX_IMAGE_CACHE_INVALID'});assert.equal(await readFile(elsewhere,'utf8'),'do not change');await unlink(target);
 denied=false;await persistContentAddressedImage(root,target,data,hash);assert.deepEqual(await readFile(target),data);assert(!(await readdir(root)).some(x=>x.endsWith('.tmp')));
 console.log(JSON.stringify({passed:true,sha256:hash,bytes:data.length,deniedLinkFallback:true,concurrentReuse:true,corruptAndSymlinkRejected:true,actualFilesystemVerified:true,tempFilesCleaned:true}));
}finally{await rm(root,{recursive:true,force:true})}
''')
