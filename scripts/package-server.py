#!/usr/bin/env python3
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
ROOT = Path(__file__).resolve().parents[1]
out = ROOT / 'artifacts'
out.mkdir(exist_ok=True)
with ZipFile(out / 'forsah-server-v2.zip', 'w', ZIP_DEFLATED) as z:
    for file in (ROOT / 'dist').rglob('*'):
        if file.is_file(): z.write(file, 'public/' + str(file.relative_to(ROOT / 'dist')))
    for name in ['api.php', 'market.php', 'categories.php', 'default-categories.json', 'config-loader.php']:
        z.write(ROOT / 'backend' / name, 'public/' + name)
    z.write(ROOT / 'deployment/public.htaccess', 'public/.htaccess')
    z.write(ROOT / 'deployment/config.example.php', 'private/config.example.php')
    for name in ['bootstrap-admin.php', 'config-loader.php']:
        z.write(ROOT / 'backend' / name, 'tools/' + name)
    z.write(ROOT / 'deployment/DEPLOY.md', 'DEPLOY.md')
print(out / 'forsah-server-v2.zip')
