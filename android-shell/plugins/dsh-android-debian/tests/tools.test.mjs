import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { apply } from '../lib/index.js';

test('Debian tools reject read-only execution before Bash dispatch', async () => {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  const previousPrefix = process.env.TERMUX__PREFIX;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-debian-test-'));
  try {
    Object.defineProperty(process, 'platform', {value:'android'});
    process.env.TERMUX__PREFIX = path.join(temp, 'usr');
    const definitions = new Map();
    let dispatched = false;
    let mode = 'read-only';
    const context = {tools:{register(tool){definitions.set(tool.name, tool);},execute(){dispatched=true;}},
      get(){return {resolve(){return {mode,workspaceRoot:temp};}};}};
    apply(context);
    const exec = {agent:{session:{id:'test-owner',header:{cwd:temp}}}};
    for (const name of ['debian_exec','debian_install']) {
      await assert.rejects(definitions.get(name).execute({command:'touch forbidden'},exec), /read-only/);
    }
    assert.equal(dispatched,false);
    mode = 'workspace-write';
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-external-test-'));
    try {
      exec.agent.session.header.cwd = outside;
      fs.writeFileSync(path.join(temp, 'network-dns.json'), JSON.stringify({allFilesAccessRequired:true,allFilesAccessGranted:false}));
      await assert.rejects(definitions.get('debian_exec').execute({command:'touch forbidden'},exec), /EACCES/);
      assert.equal(dispatched,false);
    } finally { fs.rmSync(outside,{recursive:true,force:true}); }
    exec.agent.session.header.cwd = temp;

    const id='00000000-0000-4000-8000-000000000000';
    fs.writeFileSync(path.join(temp,'home/.dsh/debian/jobs',id+'.state.json'),JSON.stringify({owner:'another-session',status:'running'}));
    await assert.rejects(definitions.get('debian_tasks').execute({cancelTaskId:id},exec), /another session/);
    await assert.rejects(definitions.get('debian_exec').execute({command:'true'},{}), /session/);
  } finally {
    Object.defineProperty(process,'platform',original);
    if(previousPrefix===undefined) delete process.env.TERMUX__PREFIX; else process.env.TERMUX__PREFIX=previousPrefix;
    fs.rmSync(temp,{recursive:true,force:true});
  }
});
