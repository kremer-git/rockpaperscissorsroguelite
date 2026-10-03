// Bundles the game into a single self-contained HTML page plus its media folders.
//   dist/index.html        the published game: full document, NO debug panel (GitHub Pages serves this)
//   dist/artifact.html     same page without <html>/<head>/<body> wrappers (for hosts that add their own)
//   .e2e/index.html        test build WITH the debug panel, used by tests/e2e.mjs (git-ignored, never published)
// Media ships next to the page and loads on demand: audio/*.mp3, portraits/*.jpg, art/*.webp.
//
//   node scripts/build.mjs          public build + test build
//   node scripts/build.mjs --dev    same, but dist/ also gets the debug panel (local tinkering only)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';

const dev = process.argv.includes('--dev');
const MEDIA = ['audio', 'portraits', 'art'];

async function page(debug) {
  const result = await build({
    entryPoints: ['src/ui/main.ts'],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    minify: !dev,
    write: false,
    legalComments: 'none',
    define: { __DEBUG__: debug ? 'true' : 'false' },
  });
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const css = readFileSync('src/ui/styles.css', 'utf8');
  return readFileSync('src/ui/page.html', 'utf8').replace('/*STYLES*/', () => css).replace('/*SCRIPT*/', () => js);
}

function wrap(fragment) {
  const head = fragment.slice(0, fragment.indexOf('<div id="app"'));
  const bodyPart = fragment.slice(fragment.indexOf('<div id="app"'));
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}</head>\n<body>\n${bodyPart}</body>\n</html>\n`;
}

function write(dir, fragment, withArtifact) {
  mkdirSync(dir, { recursive: true });
  for (const m of MEDIA) cpSync(`assets/${m}`, `${dir}/${m}`, { recursive: true });
  if (withArtifact) writeFileSync(`${dir}/artifact.html`, fragment);
  writeFileSync(`${dir}/index.html`, wrap(fragment));
}

const pub = await page(dev);
write('dist', pub, true);
write('.e2e', await page(true), false);
console.log(`built dist/index.html (${(pub.length / 1024).toFixed(0)} KB${dev ? ', with debug panel' : ', no debug panel'}) and .e2e/index.html (test build)`);
