// Bundles the game into a single self-contained HTML file.
//   dist/index.html        full document (open directly in any browser)
//   dist/artifact.html     same page without <html>/<head>/<body> wrappers (for hosts that add their own)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';

const watch = process.argv.includes('--dev');
const result = await build({
  entryPoints: ['src/ui/main.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: !watch,
  write: false,
  legalComments: 'none',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync('src/ui/styles.css', 'utf8');
const fragment = readFileSync('src/ui/page.html', 'utf8').replace('/*STYLES*/', () => css).replace('/*SCRIPT*/', () => js);
mkdirSync('dist', { recursive: true });
// Audio ships next to the page (dist/audio/*.mp3) and loads on demand; it is not inlined.
cpSync('assets/audio', 'dist/audio', { recursive: true });
writeFileSync('dist/artifact.html', fragment);
const titleEnd = fragment.indexOf('</title>') + '</title>'.length;
const head = fragment.slice(0, fragment.indexOf('<div id="app"'));
const bodyPart = fragment.slice(fragment.indexOf('<div id="app"'));
writeFileSync('dist/index.html', `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}</head>\n<body>\n${bodyPart}</body>\n</html>\n`);
console.log(`built dist/index.html (${(fragment.length / 1024).toFixed(0)} KB)`);
void titleEnd;
