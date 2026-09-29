import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import process from 'node:process';

const result = await build({
  entryPoints: ['src/main.ts'], bundle: true, platform: 'node', target: 'node24',
  format: 'esm', outfile: 'dist/index.mjs', write: false, legalComments: 'inline',
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
});
if (process.argv.includes('--check')) {
  if (!readFileSync('dist/index.mjs').equals(result.outputFiles[0].contents)) {
    throw new Error('dist/index.mjs is stale. Run npm run build and include dist in the commit.');
  }
  console.log('dist/index.mjs matches the source');
} else {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync('dist', { recursive: true });
  writeFileSync('dist/index.mjs', result.outputFiles[0].contents);
  console.log(`Built dist/index.mjs (${result.outputFiles[0].contents.length} bytes)`);
}
