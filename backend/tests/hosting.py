#!/usr/bin/env python3
"""Exercise the shipped ZIP itself, not the repository's development layout."""
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
ZIP = ROOT/'artifacts/forsah-hosting-ready.zip'

def scenario(legacy=False, protected=True):
    with tempfile.TemporaryDirectory(prefix='forsah-hosting-') as temp:
        home=Path(temp); web=home/'public_html'; app=web/'forsah'; app.mkdir(parents=True)
        with ZipFile(ZIP) as archive: archive.extractall(app)
        if legacy:
            old=web/'var';old.mkdir();sqlite3.connect(old/'forsah.sqlite').close()
        env={k:v for k,v in os.environ.items() if not k.startswith('FORSAH_')}
        # Built-in PHP does not process .htaccess. Simulate the Apache marker
        # for functional tests; also test fail-closed without it.
        if protected: env['FORSAH_PROTECTED_DATABASE']='1'
        with socket.socket() as sock:
            sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        log=open(home/'php.log','w')
        server=subprocess.Popen(['php','-S',f'127.0.0.1:{port}','-t',str(web)],env=env,stdout=log,stderr=log)
        def request(path, body=None):
            req=urllib.request.Request(f'http://127.0.0.1:{port}/forsah/'+path,
                data=None if body is None else json.dumps(body).encode(),
                headers={'Host':'t3lam.site','Content-Type':'application/json','Origin':'https://localhost'})
            try:r=urllib.request.urlopen(req,timeout=10)
            except urllib.error.HTTPError as error:r=error
            return r.status,r.read()
        try:
            for _ in range(80):
                try:request('index.html');break
                except OSError:time.sleep(.1)
            else:raise AssertionError('Server did not start')
            assert request('index.html')[0]==200
            status,raw=request('api.php?resource=health')
            private=app/'database/forsah.sqlite'
            if legacy or not protected:
                assert status==503,(status,raw)
                assert not private.exists(), 'Must not silently replace legacy data with a new DB'
                if legacy: assert (web/'var/forsah.sqlite').exists()
                return
            assert status==200,(status,raw)
            assert json.loads(raw)['data']['version']==2
            assert json.loads(raw)['data']['images_supported'] is True
            assert private.exists() and not (app/'forsah.sqlite').exists()
            seed=sqlite3.connect(app/'database/forsah.seed.sqlite')
            assert seed.execute('SELECT COUNT(*) FROM users').fetchone()[0]==0;seed.close()
            registered,raw=request('api.php?resource=auth&action=register',{'name':'Preserved user','email':'preserved@example.test','password':'Strong-test-password-123'})
            assert registered==201,(registered,raw)
            saved=json.loads(raw)['data']
            # Extracting the archive a second time must leave all live data intact.
            with ZipFile(ZIP) as archive:archive.extractall(app)
            assert request('api.php?resource=health')[0]==200
            database=sqlite3.connect(private)
            assert database.execute('SELECT email FROM users').fetchone()[0]=='preserved@example.test'
            assert database.execute('PRAGMA integrity_check').fetchone()[0]=='ok';database.close()
            # CLI bootstrap uses the exact same auto-configured database.
            cli={**env,'FORSAH_ADMIN_NAME':'Hosting Admin','FORSAH_ADMIN_EMAIL':'admin@example.test','FORSAH_ADMIN_PASSWORD':'Admin-test-password-123'}
            result=subprocess.run(['php','bootstrap-admin.php'],cwd=app,env=cli,capture_output=True,text=True)
            assert result.returncode==0,result.stderr
            code,raw=request('api.php?resource=admin&action=login',{'email':'admin@example.test','password':'Admin-test-password-123'})
            assert code==200,(code,raw)
            assert saved['user']['role']=='user'
            assert len((app/'database/ip-salt').read_text())==64
            assert (private.stat().st_mode & 0o777)==0o600
        finally:
            server.terminate()
            try:server.wait(timeout=5)
            except subprocess.TimeoutExpired:server.kill();server.wait()
            log.close()

if __name__=='__main__':
    scenario()
    scenario(legacy=True)
    scenario(protected=False)
    print('PASS: flat ZIP extraction, HTTP v2 API, protected in-folder DB auto-install, empty public seed, member registration, non-destructive re-extraction, private salt, CLI admin bootstrap, legacy DB safety, fail-closed without protection marker. Apache directives require Apache hosting; this test uses the PHP server.')
