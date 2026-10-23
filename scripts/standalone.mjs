import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// This application has one JS bundle, no dynamic imports, and no asset files.
// Embed its production JS and CSS so file:// can run without module requests.
let html = await readFile('dist/index.html', 'utf8');
const scriptTags = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)];
for (const [tag, url] of scriptTags) {
  const js = await readFile(path.join('dist', url.replace(/^\//, '')), 'utf8');
  html = html.replace(tag, () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`);
}
const cssTags = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g)];
for (const [tag, url] of cssTags) {
  const css = await readFile(path.join('dist', url.replace(/^\//, '')), 'utf8');
  html = html.replace(tag, () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`);
}
if (/<script\b[^>]*\bsrc=|<link\b[^>]*\brel="stylesheet"/.test(html)) throw new Error('Standalone build contains external code dependencies');
await writeFile('海岛-双击打开.html', html);
await writeFile('dist/海岛-双击打开.html', html);
console.log('Standalone offline HTML generated: 海岛-双击打开.html');
