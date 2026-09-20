import {build} from 'esbuild'
// One managed runtime file: upgrade it atomically without partially updating helpers.
await build({entryPoints:['src/index.ts'],bundle:true,format:'esm',platform:'node',target:'node22',outfile:'lib/index.js',packages:'external'})
