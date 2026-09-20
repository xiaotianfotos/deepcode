import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,symlink,open} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {publishSharedExclusive,isAndroidSharedPath} from '../lib/publish-shared.js';
async function fixture(t) { const dir=await mkdtemp(join(homedir(),'dsh-shared-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir; }
test('shared publication preserves Unicode bytes and existing target',async t=>{
 const dir=await fixture(t),src=join(dir,'source'),dst=join(dir,'中文');await writeFile(src,'complete 中文');
 await publishSharedExclusive(src,dst);assert.equal(await readFile(dst,'utf8'),'complete 中文');
 await writeFile(src,'replacement');await assert.rejects(publishSharedExclusive(src,dst),{code:'EEXIST'});
 assert.equal(await readFile(dst,'utf8'),'complete 中文');
 // Inject a write failure after a prefix was written. The user-visible partial
 // file must remain for inspection, and the pre-existing target stays untouched.
 const sample=await open(src,'r');const prototype=Object.getPrototypeOf(sample);await sample.close();
 const mocked=t.mock.method(prototype,'writeFile',async function(){await this.write('partial');throw Object.assign(new Error('injected I/O error'),{code:'EIO'});});
 const partial=join(dir,'interrupted');
 await assert.rejects(publishSharedExclusive(src,partial),/partial file may remain/);
 assert.equal(await readFile(partial,'utf8'),'partial');
 assert.equal(await readFile(dst,'utf8'),'complete 中文');
 mocked.mock.restore();
});
test('concurrent shared creators have exactly one winner without replacement',async t=>{
 const dir=await fixture(t),dst=join(dir,'target');
 const sources=await Promise.all(Array.from({length:12},async(_,i)=>{const p=join(dir,''+i);await writeFile(p,'writer-'+i);return p;}));
 const results=await Promise.allSettled(sources.map(p=>publishSharedExclusive(p,dst)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 for(const r of results) if(r.status==='rejected')assert.equal(r.reason.code,'EEXIST');
 assert.equal(await readFile(dst,'utf8'),'writer-'+results.findIndex(r=>r.status==='fulfilled'));
});
test('missing source and dangling destination never overwrite user data',async t=>{
 const dir=await fixture(t),src=join(dir,'source'),dst=join(dir,'target');
 await assert.rejects(publishSharedExclusive(src,dst),{code:'ENOENT'});
 await assert.rejects(readFile(dst),{code:'ENOENT'});
 await writeFile(src,'data');await symlink(join(dir,'missing'),dst);
 await assert.rejects(publishSharedExclusive(src,dst),{code:'EEXIST'});
});
test('shared strategy applies only to Android shared-volume paths',()=>{
 for(const p of ['/storage/emulated/0/Docs/a','/storage/86FB-1E11/x'])assert.equal(isAndroidSharedPath(p,'android'),true);
 for(const [p,platform] of [['/data/data/pkg/files/x','android'],['/storage/invalid/x','android'],['/storage/86FB-1E11/x','linux']])assert.equal(isAndroidSharedPath(p,platform),false);
});
