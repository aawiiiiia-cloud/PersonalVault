import { defineConfig } from 'vite';
import {cpSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const pdfRoot=path.dirname(require.resolve('pdfjs-dist/package.json'));

export default defineConfig({
  base: './',
  plugins:[{name:'local-pdf-resources',closeBundle(){for(const directory of ['cmaps','standard_fonts','wasm'])cpSync(path.join(pdfRoot,directory),path.resolve('../../canvas-editor/pdf-resources',directory),{recursive:true});}}],
  build: { target: 'esnext', outDir: '../../canvas-editor', emptyOutDir: true, rollupOptions:{input:{canvas:'index.html',viewer:'media-viewer.html'}} },
  server: {
    watch: {
      // 编辑器保存文件时走「写临时文件 + 原子重命名」，临时目录形如
      //   .<文件名>.<pid>.<uuid>.tmpdir/
      // 放在被编辑文件旁边。chokidar 会在这个临时文件上注册监听，而重命名
      // 瞬间它已不存在，于是抛出 EBUSY 并以未捕获异常直接杀死 dev server。
      // 排除任意临时目录，避免每次保存源码都崩掉服务器。
      ignored: ['**/.*.tmpdir/**', '**/*.tmpdir/**'],
    },
  },
});
