import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

// Bare relative HTML URLs work at /, /forsah/ and arbitrarily nested folders.
// Do NOT strip ./ from JS import specifiers: that changes them to package imports.
export function normalizeHtmlAssets(html) {
  return html.replace(/\b(src|href)=(['"])\.\/(assets\/[^'"]+)\2/g, '$1=$2$3$2');
}
export function verifyBuild(directory) {
  const index = resolve(directory, 'index.html');
  const html = normalizeHtmlAssets(readFileSync(index, 'utf8'));
  writeFileSync(index, html);
  const urls = [...html.matchAll(/\b(?:src|href)=["']([^"']+\.(?:js|css))["']/g)].map(match => match[1]);
  if (!urls.some(url => url.endsWith('.js')) || !urls.some(url => url.endsWith('.css'))) throw new Error('Missing built JS/CSS');
  for (const url of urls) {
    if (!url.startsWith('assets/') || !existsSync(resolve(directory, url))) throw new Error(`Invalid asset URL: ${url}`);
    for (const folder of ['/', '/forsah/', '/nested/another-folder/']) {
      const actual = new URL(url, `https://example.test${folder}#/account`).pathname;
      if (actual !== `${folder}${url}`) throw new Error(`Asset escaped deployment folder: ${actual}`);
    }
    if (url.endsWith('.css')) {
      const css = readFileSync(resolve(directory,url),'utf8');
      if (css.includes('fonts.googleapis.com')) throw new Error('The application font must be packaged locally');
      for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
        const asset = match[1];
        if (asset.startsWith('data:')) continue;
        if (asset.startsWith('/') || /https?:/.test(asset) || !existsSync(resolve(directory, dirname(url), asset))) throw new Error(`Non-portable CSS asset: ${asset}`);
      }
    }
  }
  console.log('PASS: HTML uses assets/... without ./ or leading /; JS/CSS/fonts resolve at root and nested deployment folders.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) verifyBuild(process.argv[2] || 'dist');
