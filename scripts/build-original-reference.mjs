// Test-only baseline built directly from the user's original ZIP.
// Never included in dist or a hosting/APK package.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwind from '../tailwind.config.js';
const root=resolve('artifacts/reference-source');
execFileSync('python3',['-c',`from pathlib import Path
from zipfile import ZipFile
root=Path(${JSON.stringify(root)})
with ZipFile('forsah-admin-project.zip') as archive:
    for name in archive.namelist():
        if (name.startswith('src/') or name=='index.html') and not name.endswith('/'):
            path=root/name
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_bytes(archive.read(name))
`]);
const css=resolve(root,'src/index.css');
writeFileSync(css,readFileSync(css,'utf8').replace(/^@import url[^\n]+\n/,''));
const main=resolve(root,'src/main.tsx');
writeFileSync(main,[400,500,600,700].map(w=>`import '@fontsource/ibm-plex-sans-arabic/${w}.css';`).join('\n')+'\n'+readFileSync(main,'utf8'));
await build({configFile:false,root,base:'./',plugins:[react()],define:{'import.meta.env.VITE_API_BASE_URL':'undefined'},
  css:{postcss:{plugins:[tailwindcss({...tailwind,content:[`${root}/index.html`,`${root}/src/**/*.{ts,tsx}`]}),autoprefixer()]}},
  build:{outDir:resolve('artifacts/reference-dist'),emptyOutDir:true},logLevel:'warn'});
console.log('Original ZIP reference built with the same locally hosted font; no design or DOM changes.');
