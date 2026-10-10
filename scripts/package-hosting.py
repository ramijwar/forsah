#!/usr/bin/env python3
"""Build a flat extract-in-place hosting archive, with an EMPTY schema seed."""
from pathlib import Path
import re
import shutil
import sqlite3
import tempfile
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/forsah-hosting-ready.zip'

def main():
    if not (ROOT / 'dist/index.html').is_file():
        raise SystemExit('Run npm run build first')
    OUT.parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='forsah-seed-') as temp:
        seed = Path(temp) / 'forsah.seed.sqlite'
        connection = sqlite3.connect(seed)
        connection.execute('PRAGMA foreign_keys=ON')
        for file in ['api.php', 'market.php', 'categories.php']:
            code = (ROOT / 'backend' / file).read_text()
            schemas = re.findall(r"<<<'SQL'\n(.*?)\nSQL\);", code, flags=re.S)
            if len(schemas) != 1:
                raise RuntimeError(f'Unexpected schema format in {file}; refusing to ship an incomplete DB')
            connection.executescript(schemas[0])
        assert connection.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert not connection.execute('PRAGMA foreign_key_check').fetchall()
        tables = [r[0] for r in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        for table in tables:
            assert connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] == 0
        connection.commit()
        connection.close()
        with ZipFile(OUT, 'w', ZIP_DEFLATED) as archive:
            for file in sorted((ROOT / 'dist').rglob('*')):
                if file.is_file(): archive.write(file, str(file.relative_to(ROOT / 'dist')))
            for name in ['api.php','market.php','categories.php','default-categories.json','config-loader.php','bootstrap-admin.php']:
                archive.write(ROOT / 'backend' / name, name)
            archive.write(ROOT / 'deployment/hosting-auto.php', 'hosting-auto.php')
            archive.write(ROOT / 'deployment/hosting.htaccess', '.htaccess')
            archive.write(ROOT / 'deployment/INSTALL.txt', 'INSTALL.txt')
            archive.write(seed, 'database/forsah.seed.sqlite')
            archive.writestr('database/.htaccess', 'Require all denied\n')
        with ZipFile(OUT) as archive:
            assert archive.testzip() is None
            assert {'index.html','api.php','.htaccess','database/forsah.seed.sqlite'} <= set(archive.namelist())
        # GitHub wraps this directory once: users download deployment files,
        # not a ZIP containing several other ZIPs. Include hidden guard files.
        folder = OUT.parent / 'hosting-ready'
        if folder.exists(): shutil.rmtree(folder)
        with ZipFile(OUT) as archive: archive.extractall(folder)
        assert (folder / '.htaccess').is_file()
        assert (folder / 'database/.htaccess').is_file()
        assert not list(folder.rglob('*.zip'))
        assert not (folder / 'database/forsah.sqlite').exists()
        for obsolete in ['forsah-hosting-fix.zip', 'forsah-ui-update.zip']:
            (OUT.parent / obsolete).unlink(missing_ok=True)
        print(f'Created {OUT}: {len(tables)} empty SQLite tables, no user data or credentials.')

if __name__ == '__main__': main()
