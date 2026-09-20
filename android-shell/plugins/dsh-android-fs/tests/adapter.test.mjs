import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,stat,symlink} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {Context} from '@deepseek-ai/cordis';
import {AndroidFileSystem} from '../lib/index.js';
import {publishNoReplace} from '../lib/publish.js';

const python=process.env.TERMUX__PREFIX ? join(process.env.TERMUX__PREFIX,'bin/python3') : '/usr/bin/python3';
async function fixture(t) {
  const base=await mkdtemp(join(homedir(),'.dsh-fs-adapter-'));
  const cwd=join(base,'workspace');await mkdir(cwd);
  const ctx=new Context();
  const policy={mode:'workspace-write',workspaceRoot:cwd};
  ctx.provide('sandboxPolicy',{defaultMode:policy.mode,resolve:()=>policy});
  const fiber=await ctx.plugin(AndroidFileSystem,{cwd,pythonPath:python});
  assert.ok(ctx.fs instanceof AndroidFileSystem);
  t.after(async()=>{await fiber.dispose();await rm(base,{recursive:true,force:true});});
  return {base,cwd,fs:ctx.fs,policy};
}
async function noStaging(cwd) {assert.equal((await readdir(cwd)).filter(x=>x.endsWith('.tmpdir')).length,0);}

test('create/read/edit retain Unicode, permissions and stale-version checks',async t=>{
  const {cwd,fs}=await fixture(t);const target=await fs.resolve('中文 $() \' spaced.txt');
  const first=await fs.writeText(target,'初始 29',{kind:'createIfAbsent'});
  assert.equal(first.operation,'create');assert.equal(await fs.readText(target),'初始 29');
  assert.equal((await stat(target.targetKey)).mode & 0o777,0o600);
  const edited=await fs.editText(target,{oldString:'29',newString:'42',replaceAll:false},{version:first.version});
  assert.equal(await fs.readText(target),'初始 42');
  await assert.rejects(fs.writeText(target,'stale',{kind:'replaceIfVersion',version:first.version}),{code:'FS_STALE_VERSION'});
  assert.ok(edited.version);await noStaging(cwd);
});

test('existing target is never replaced',async t=>{
  const {cwd,fs}=await fixture(t);const target=await fs.resolve('existing');await writeFile(target.targetKey,'keep');
  await assert.rejects(fs.writeText(target,'overwrite',{kind:'createIfAbsent'}),{code:'FS_NOT_OBSERVED'});
  assert.equal(await readFile(target.targetKey,'utf8'),'keep');await noStaging(cwd);
});

test('a competitor appearing after preflight wins without being overwritten',async t=>{
  const {cwd,fs}=await fixture(t);const target=await fs.resolve('raced');
  fs.internals.inspectTemp=()=>writeFile(target.targetKey,'competitor',{flag:'wx'});
  await assert.rejects(fs.writeText(target,'ours',{kind:'createIfAbsent'}),{code:'FS_NOT_OBSERVED'});
  assert.equal(await readFile(target.targetKey,'utf8'),'competitor');await noStaging(cwd);
});

test('native publication across 12 independent processes has exactly one winner',async t=>{
  const {cwd}=await fixture(t);const target=join(cwd,'winner');
  const sources=await Promise.all(Array.from({length:12},async(_,i)=>{const p=join(cwd,'src-'+i);await writeFile(p,'writer-'+i);return p;}));
  const results=await Promise.allSettled(sources.map(p=>publishNoReplace(python,p,target)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  for(const r of results) if(r.status==='rejected') assert.equal(r.reason.code,'EEXIST');
  const winner=results.findIndex(r=>r.status==='fulfilled');assert.equal(await readFile(target,'utf8'),'writer-'+winner);
  assert.equal(existsSync(sources[winner]),false);
});

test('read-only and workspace containment still deny mutations',async t=>{
  const {base,fs,policy}=await fixture(t);
  await assert.rejects(fs.writeText(await fs.resolve(join(base,'outside')),'x',{kind:'createIfAbsent'}),{code:'FS_SANDBOX_DENIED'});
  policy.mode='read-only';
  await assert.rejects(fs.writeText(await fs.resolve('readonly'),'x',{kind:'createIfAbsent'}),{code:'FS_SANDBOX_DENIED'});
});

test('symlink escape remains denied',async t=>{
  const {base,cwd,fs}=await fixture(t);await mkdir(join(base,'outside'));
  await symlink(join(base,'outside'),join(cwd,'escape'));
  await assert.rejects(fs.writeText(await fs.resolve('escape/new'),'x',{kind:'createIfAbsent'}),{code:'FS_SANDBOX_DENIED'});
});

test('abort after staging but before publication cleans temporary files',async t=>{
  const {cwd,fs}=await fixture(t);const ac=new AbortController();
  fs.internals.inspectTemp=()=>ac.abort();
  const target=await fs.resolve('aborted');
  await assert.rejects(fs.writeText(target,'x',{kind:'createIfAbsent'},ac.signal),{code:'FS_ABORTED'});
  assert.equal(existsSync(target.targetKey),false);await noStaging(cwd);
});

test('native publication error removes staging and never creates a partial file',async t=>{
  const {cwd,fs}=await fixture(t);const target=await fs.resolve('failure');
  fs.internals.linkFile=(source,dest)=>publishNoReplace(python,source+'.missing',dest);
  await assert.rejects(fs.writeText(target,'x',{kind:'createIfAbsent'}));
  assert.equal(existsSync(target.targetKey),false);await noStaging(cwd);
});

test('unavailable helper fails closed and cleans staging',async t=>{
  const {cwd,fs}=await fixture(t);const target=await fs.resolve('unavailable');
  fs.internals.linkFile=(source,dest)=>publishNoReplace('/nonexistent/python3',source,dest);
  await assert.rejects(fs.writeText(target,'x',{kind:'createIfAbsent'}));
  assert.equal(existsSync(target.targetKey),false);await noStaging(cwd);
});

test('native no-replace refuses an existing dangling symlink',async t=>{
  const {cwd}=await fixture(t);const source=join(cwd,'source');const dest=join(cwd,'dangling');
  await writeFile(source,'keep');await symlink(join(cwd,'absent'),dest);
  await assert.rejects(publishNoReplace(python,source,dest),{code:'EEXIST'});
  assert.equal(await readFile(source,'utf8'),'keep');
});
