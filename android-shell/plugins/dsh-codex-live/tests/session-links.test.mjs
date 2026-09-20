import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,renameSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {sessionLinkLookup} from '../src/session-links.mjs'
test('read-only thread lookup reloads atomic links and refuses missing, corrupt or ambiguous bindings',()=>{
 const dir=mkdtempSync(join(tmpdir(),'codex-links-')),file=join(dir,'links.json'),lookup=sessionLinkLookup(file)
 const write=sessions=>{writeFileSync(file+'.tmp',JSON.stringify({sessions}));renameSync(file+'.tmp',file)}
 try{assert.equal(lookup('t'),null);write({'session-a':{threadId:'t'}});assert.equal(lookup('t'),'session-a');assert.equal(lookup('other'),null)
 write({'session-a':{threadId:'t'},'session-b':{threadId:'t'}});assert.equal(lookup('t'),null)
 write({'session-b':{threadId:'t'}});assert.equal(lookup('t'),'session-b');writeFileSync(file,'bad');assert.equal(lookup('t'),null)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
