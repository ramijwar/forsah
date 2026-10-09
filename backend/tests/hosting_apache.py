#!/usr/bin/env python3
"""Verify the exact packaged .htaccess files using a real Apache HTTP server.
PHP functionality is tested separately by hosting.py; no PHP source is requested here.
"""
from pathlib import Path
from zipfile import ZipFile
import grp
import os
import pwd
import socket
import subprocess
import tempfile
import time
import urllib.request
import urllib.error
ROOT=Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='forsah-apache-') as temp:
    root=Path(temp);web=root/'web';app=web/'forsah';app.mkdir(parents=True)
    with ZipFile(ROOT/'artifacts/forsah-hosting-ready.zip') as z:z.extractall(app)
    # Real files ensure denial isn't merely a missing-file 404.
    for name in ['forsah.sqlite','forsah.sqlite-wal','forsah.sqlite-shm','ip-salt','install.lock']:
        (app/'database'/name).write_text('private test content')
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    modules=['mpm_event','authz_core','authz_host','dir','mime','env','setenvif','rewrite']
    config='\n'.join(f'LoadModule {m}_module /usr/lib/apache2/modules/mod_{m}.so' for m in modules)
    config+=f'''
ServerRoot "/etc/apache2"
ServerName localhost
Listen 127.0.0.1:{port}
PidFile "{root}/http.pid"
ErrorLog "{root}/error.log"
User {pwd.getpwuid(os.getuid()).pw_name}
Group {grp.getgrgid(os.getgid()).gr_name}
DocumentRoot "{web}"
TypesConfig /etc/mime.types
<Directory "{web}">
  AllowOverride All
  Require all granted
</Directory>
'''
    conf=root/'apache.conf';conf.write_text(config)
    subprocess.run(['apache2','-t','-f',str(conf)],check=True)
    process=subprocess.Popen(['apache2','-f',str(conf),'-DFOREGROUND'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    def get(path):
        try:r=urllib.request.urlopen(f'http://127.0.0.1:{port}/forsah/'+path,timeout=3)
        except urllib.error.HTTPError as e:r=e
        return r.status,r.read()
    try:
        for _ in range(60):
            try:
                status,body=get('index.html');break
            except OSError:time.sleep(.1)
        else:raise AssertionError('Apache did not start')
        assert status==200,(status,body,(root/'error.log').read_text())
        for path in ['database/','database/forsah.seed.sqlite','database/forsah.sqlite','database/forsah.sqlite-wal','database/forsah.sqlite-shm','database/ip-salt','database/install.lock','.htaccess','config-loader.php','hosting-auto.php','bootstrap-admin.php','market.php']:
            status,body=get(path)
            assert status==403,(path,status,body)
        assert get('')[0]==200
        print('PASS: actual Apache .htaccess parsing, DirectoryIndex, and HTTP 403 for the database, seed, WAL/SHM, salt, lock and internal PHP files.')
    finally:
        process.terminate()
        try:process.wait(timeout=5)
        except subprocess.TimeoutExpired:process.kill();process.wait()
