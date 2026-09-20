import * as fs from 'node:fs/promises';import * as path from 'node:path';import {tmpdir} from 'node:os';import vm from 'node:vm';import assert from 'node:assert/strict';import {createHash,randomUUID} from 'node:crypto';
const source=await fs.readFile('android-shell/vendor/relay-dsh-plugin-codex/lib/host-plugin.js','utf8');
const code=source.slice(source.indexOf('//#region codex-image.js'),source.indexOf('//#region codex-tools.js'));
const root=await fs.mkdtemp(path.join(tmpdir(),'dsh-preview-roots-'));
try{
 const hostHome=path.join(root,'host'),runtimeHome=path.join(root,'runtime'),workspace=path.join(root,'workspace');
 const context=vm.createContext({...fs,...path,Buffer,createHash,randomUUID,homedir:()=>hostHome,process:{env:{}},Uint8Array});
 vm.runInContext(code+';globalThis.api={codexImagePreviewRoots,importCodexImage}',context);
 const roots=context.api.codexImagePreviewRoots(workspace,runtimeHome);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=','base64');
 let saved=0;const attachments={async saveImage(input){assert.deepEqual(input.data,png);saved++;return {attachmentId:'fixture'}}};
 for(const dir of roots){await fs.mkdir(dir,{recursive:true});const file=path.join(dir,'test.png');await fs.writeFile(file,png);await context.api.importCodexImage(file,roots,attachments)}
 assert.equal(saved,3);
 const outside=path.join(root,'outside.png');await fs.writeFile(outside,png);
 await assert.rejects(context.api.importCodexImage(outside,roots,attachments),/outside/);
 const escape=path.join(roots[2],'escape.png');await fs.symlink(outside,escape);
 await assert.rejects(context.api.importCodexImage(escape,roots,attachments),/outside/);
 const sibling=roots[2]+'-other';await fs.mkdir(sibling);await fs.writeFile(path.join(sibling,'test.png'),png);
 await assert.rejects(context.api.importCodexImage(path.join(sibling,'test.png'),roots,attachments),/outside/);
 assert.equal(saved,3);console.log(JSON.stringify({passed:true,workspaceAndGeneratedAndInputAccepted:true,outsideSiblingAndSymlinkRejected:true}));
}finally{await fs.rm(root,{recursive:true,force:true})}
