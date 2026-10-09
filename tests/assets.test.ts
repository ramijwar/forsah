import { expect, it } from 'vitest';
// @ts-expect-error Node build utility intentionally remains plain JS.
import { normalizeHtmlAssets } from '../scripts/check-assets.mjs';
it('only normalizes HTML asset references, not JS module imports',()=>{
  const html='<script src="./assets/app.js"></script><link href="./assets/style.css"><script>import("./assets/lazy.js")</script>';
  const output=normalizeHtmlAssets(html);
  expect(output).toContain('src="assets/app.js"');
  expect(output).toContain('href="assets/style.css"');
  expect(output).toContain('import("./assets/lazy.js")');
});
it.each(['/','/forsah/','/deeply/nested/site/'])('resolves bare assets inside %s',folder=>{
  for(const asset of ['assets/app.js','assets/style.css'])expect(new URL(asset,`https://example.test${folder}#/messages`).pathname).toBe(`${folder}${asset}`);
});
