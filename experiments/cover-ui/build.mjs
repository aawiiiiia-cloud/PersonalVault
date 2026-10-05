import {build} from 'esbuild';
await build({entryPoints:['../blocksuite-edgeless/src/canvas-summary.js'],bundle:true,minify:true,format:'esm',target:'es2022',outfile:'../../canvas-summary.js',legalComments:'linked'});
await build({entryPoints:['src/main.jsx'],bundle:true,minify:true,format:'iife',target:'es2022',outfile:'../../cover-ui.js',define:{'process.env.NODE_ENV':'"production"'},legalComments:'linked'});
