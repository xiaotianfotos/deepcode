import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
const { name } = JSON.parse(readFileSync('package.json', 'utf8'))
await build({entryPoints:['src/index.ts'],bundle:true,format:'esm',platform:'node',target:'node22',outfile:'lib/index.js'})
await build({entryPoints:['src/client/index.tsx'],bundle:true,format:'cjs',platform:'browser',target:'es2022',jsx:'automatic',outfile:'lib/client.js',external:['react','react/jsx-runtime','@deepseek-ai/dsh-client-ui-renderer'],define:{'process.env.NODE_ENV':'"production"'},banner:{js:`window.__ModuleLoader__.load({id:${JSON.stringify(name)},factory:(require)=>{var module={exports:{}};var exports=module.exports;`},footer:{js:'return module.exports;}});'}})
