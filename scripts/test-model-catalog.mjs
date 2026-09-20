/** Exercise the actual patched catalog, including per-provider failure isolation. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const source = readFileSync(process.env.DSH_MODEL_CATALOG_ASSET || 'android-shell/app/src/main/assets/patched/model-catalog-host.js','utf8');
const start = source.indexOf('async function androidModelProviderConfigured');
const end = source.indexOf('//#endregion', start);
const catalog = vm.runInNewContext(source.slice(start, end) + '\nbuildModelCatalog');
const inject = source.match(/static inject = (\[\s*"settings",[\s\S]*?\]);/);
assert(inject, 'SessionController must declare catalog services');
const dependencies = new Set(JSON.parse(inject[1]));
function fixture() {
  const ids = ['cloud', 'missing', 'ambient', 'oauth', 'local', 'catalog-only', 'broken', 'relay-codex'];
  const states = { cloud:true, missing:false, ambient:true, oauth:true, local:true, 'catalog-only':false, broken:true };
  const declarations = ids.filter(id=>id!=='relay-codex').map(provider=>({provider, settingsNs:provider==='cloud' || provider==='missing'?'explicit':'llm-pi-ai',settingsPath:['providers',provider]}));
  const profiles = Object.fromEntries(ids.map(id=>[id, ['cloud','missing'].includes(id)?{apiKeyEnv:id}:{}]));
  const current = {provider:'missing',model:'historical-model'};
  const calls = [];
  const ctx = {
    agentDefaultModel:{currentSelection:()=>current},
    settings:{describe:()=>['explicit','llm-pi-ai'].map(ns=>({ns,value:{providers:profiles}}))},
    get:()=>({describe:async ref=>({configured:states[ref]})}),
    llm:{
      listProviders:()=>ids.map(id=>({id,name:id})),
      listConfigurableProviders:()=>declarations,
      registration:()=>({adapter:{current:()=>({models:{checkAuth:async id=>states[id]?{source:id}:undefined}}),profileOf:(_,id)=>profiles[id],config:{resolveApiKey:async id=>{if(states[id])return 'fixture';throw Object.assign(new Error('Missing'),{code:'MISSING_CREDENTIAL'});}}}}),
      listModels:async id=>{calls.push(id);if(id==='broken')throw new Error('Temporary discovery failure');return [{id:'m',name:'Model'}];},
      resolveModelInfo:async()=>({reasoning:{efforts:[{id:'high',name:'High'}],defaultEffort:'high'}}),
    },
  };
  return {ctx,states,profiles,current,calls};
}
test('hide absent credentials/catalog-only presets; retain OAuth, ambient, local and plugin routes',async()=>{
 const {ctx,calls}=fixture();const result=await catalog(ctx);
 assert.deepEqual(Array.from(result.groups,g=>g.id),['cloud','ambient','oauth','local','relay-codex']);
 assert(!calls.includes('missing'));assert(!calls.includes('catalog-only'));
 assert.equal(result.groups[0].models[0].reasoning.defaultEffort,'high');
});
test('filtering never rewrites current selection or routing; discovery errors remain visible',async()=>{
 const {ctx,current}=fixture();const result=await catalog(ctx);
 assert.equal(result.default.model,current.model);assert(result.routableProviders.includes('missing'));
 assert.equal(result.failures.length,1);assert.equal(result.failures[0].id,'broken');
});
test('configured/removed credentials are reflected on the next catalog read',async()=>{
 const {ctx,states}=fixture();states['catalog-only']=true;
 assert((await catalog(ctx)).groups.some(g=>g.id==='catalog-only'));
 states['catalog-only']=false;assert(!(await catalog(ctx)).groups.some(g=>g.id==='catalog-only'));
});
test('explicit pi-ai refs must not fall back to ambient auth',async()=>{
 const {ctx,profiles,states}=fixture();profiles.ambient.apiKeyEnv='CUSTOM_REF';states.ambient=false;
 assert(!(await catalog(ctx)).groups.some(g=>g.id==='ambient'));
 states.ambient=true;assert((await catalog(ctx)).groups.some(g=>g.id==='ambient'));
});
test('credential lookup failures surface, not silently hide or advertise a provider',async()=>{
 const {ctx}=fixture();ctx.get=()=>({describe:async()=>{throw new Error('Store unavailable');}});
 const result=await catalog(ctx);assert(result.failures.some(f=>f.id==='cloud'));assert(result.groups.some(g=>g.id==='relay-codex'));
});
test('catalog dependencies satisfy Cordis injection enforcement, including settings and credentials',async()=>{
 const {ctx}=fixture();
 assert(dependencies.has('settings'));assert(dependencies.has('credentials'));
 const guarded=new Proxy(ctx,{get(target,key){
   if(key==='get')return name=>{if(!dependencies.has(name))throw Error(`cannot get ${name} without inject`);return target.get(name);};
   if(!dependencies.has(key))throw Error(`cannot get ${key} without inject`);
   return target[key];
 }});
 const result=await catalog(guarded);
 assert(result.groups.some(g=>g.id==='relay-codex'));
});
