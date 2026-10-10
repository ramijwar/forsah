#!/usr/bin/env python3
"""Disposable local PHP/SQLite integration smoke test for Forsah admin API."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import secrets
import socket
import stat
import sqlite3
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
TEST_PASSWORD = 'Smoke-Test-Password-16chars'


def main() -> None:
    with tempfile.TemporaryDirectory(prefix='forsah-api-test-') as temp:
        env = os.environ.copy()
        env.update({
            'FORSAH_DB_PATH': str(Path(temp) / 'test.sqlite'),
            'FORSAH_ADMIN_NAME': 'مدير الاختبار',
            'FORSAH_ADMIN_EMAIL': 'superadmin@example.test',
            'FORSAH_ADMIN_PASSWORD': TEST_PASSWORD,
            'FORSAH_CORS_ORIGINS': '*',
        })
        created = subprocess.run(['php', str(ROOT / 'backend/bootstrap-admin.php')], env=env, text=True, capture_output=True)
        assert created.returncode == 0, f'bootstrap failed: {created.stderr or created.stdout}'
        db_mode = stat.S_IMODE(Path(env['FORSAH_DB_PATH']).stat().st_mode)
        assert db_mode == 0o600, f'database file permissions should be 0600, got {oct(db_mode)}'
        duplicate = subprocess.run(['php', str(ROOT / 'backend/bootstrap-admin.php')], env=env, text=True, capture_output=True)
        assert duplicate.returncode == 2, 'bootstrap should refuse a second admin account'

        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        server = subprocess.Popen(['php', '-S', f'127.0.0.1:{port}', '-t', str(ROOT / 'backend')], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        base = f'http://127.0.0.1:{port}/api.php'
        try:
            for _ in range(50):
                try:
                    urllib.request.urlopen(base + '?resource=services', timeout=1).read()
                    break
                except Exception:
                    time.sleep(.1)
            else:
                raise AssertionError('PHP dev server did not start')

            def call(query: str, method: str = 'GET', payload=None, token: str | None = None, expected: int = 200):
                headers = {'Content-Type': 'application/json'}
                if token:
                    headers['Authorization'] = 'Bearer ' + token
                request = urllib.request.Request(base + '?' + query, method=method, headers=headers,
                    data=None if payload is None else json.dumps(payload, ensure_ascii=False).encode())
                try:
                    response = urllib.request.urlopen(request, timeout=5)
                    status, raw = response.status, response.read()
                except urllib.error.HTTPError as exc:
                    status, raw = exc.code, exc.read()
                assert status == expected, f'{method} {query}: expected {expected}, got {status}: {raw!r}'
                return json.loads(raw) if raw else {}

            assert call('resource=services')['data'][0]['name'] == 'الحراج الشعبي'
            assert call('resource=admin&action=stats', expected=401)['ok'] is False
            login = call('resource=admin&action=login', 'POST', {'email': env['FORSAH_ADMIN_EMAIL'], 'password': TEST_PASSWORD})['data']
            admin_token = login['token']
            assert login['user']['role'] == 'super_admin'
            initial_stats = call('resource=admin&action=stats', token=admin_token)['data']
            assert initial_stats['pending_reports'] == 0

            ad = call('resource=ads', 'POST', {'title': 'إعلان اختبار', 'description': 'وصف اختباري', 'category': 'خدمات الصيانة المنزلية'}, expected=201)['data']
            ticket = call('resource=support&action=tickets', 'POST', {'name': 'عميل اختبار', 'email': 'customer@example.test', 'subject': 'مساعدة', 'message': 'أحتاج مساعدة'}, expected=201)['data']
            report = call('resource=reports&action=create', 'POST', {'name': 'مبلّغ اختبار', 'email': 'reporter@example.test', 'entity_type': 'ad', 'entity_id': ad['id'], 'reason': 'محتوى يحتاج مراجعة', 'description': 'بلاغ تجريبي'}, expected=201)['data']
            stats = call('resource=admin&action=stats', token=admin_token)['data']
            assert (stats['pending_ads'], stats['pending_reports'], stats['open_tickets']) == (1, 1, 1), stats
            call(f'resource=admin&action=ad&id={ad["id"]}', 'PATCH', {'status': 'active'}, admin_token)
            listed_ads = call('resource=admin&action=ads', token=admin_token)['data']['items']
            assert listed_ads[0]['status'] == 'active'
            reports = call('resource=admin&action=reports', token=admin_token)['data']['items']
            assert reports[0]['id'] == report['id']
            call(f'resource=admin&action=report&id={report["id"]}', 'PATCH', {'status': 'handled'}, admin_token)
            thread = call(f'resource=admin&action=ticket&id={ticket["id"]}', token=admin_token)['data']
            assert len(thread['messages']) == 1
            answered = call(f'resource=admin&action=ticket-reply&id={ticket["id"]}', 'POST', {'content': 'تم استلام طلبك'}, admin_token)['data']
            assert len(answered['messages']) == 2 and answered['status'] == 'in_progress'

            # Create disposable user and support operator directly, with a valid stored session for the user.
            support_password = 'Support-Test-Password-16chars'
            hash_result = subprocess.run(['php', '-r', 'echo password_hash($argv[1], PASSWORD_DEFAULT);', support_password], text=True, capture_output=True, check=True)
            connection = sqlite3.connect(env['FORSAH_DB_PATH'])
            user_id = connection.execute("INSERT INTO users(name,email,role) VALUES(?,?, 'user')", ('مستخدم اختبار', 'user@example.test')).lastrowid
            connection.execute('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)', ('موظف دعم اختبار', 'support@example.test', hash_result.stdout, 'support'))
            user_token = secrets.token_urlsafe(48)
            connection.execute('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,datetime(\'now\',\'+1 hour\'))', (hashlib.sha256(user_token.encode()).hexdigest(), user_id))
            connection.commit(); connection.close()
            call('resource=admin&action=stats', token=user_token, expected=401)
            support_token = call('resource=admin&action=login', 'POST', {'email': 'support@example.test', 'password': support_password})['data']['token']
            call(f'resource=admin&action=user&id={user_id}', 'PATCH', {'is_banned': True}, support_token)
            call(f'resource=admin&action=user&id={user_id}', 'PATCH', {'is_banned': False}, support_token)
            call(f'resource=admin&action=user&id={user_id}', 'PATCH', {'role': 'admin'}, support_token, expected=403)
            call(f'resource=admin&action=user&id={user_id}', 'PATCH', {'role': 'support'}, admin_token)
            new_body={'name':'New member','email':'new@example.test','phone':'123','password':'abc123'}
            call('resource=admin&action=user','POST',new_body,support_token,expected=403)
            created_user=call('resource=admin&action=user','POST',new_body,admin_token,expected=201)['data']
            assert created_user['id']>0
            call('resource=admin&action=user','POST',new_body,admin_token,expected=409)
            assert call('resource=auth&action=login','POST',{'email':new_body['email'],'password':'abc123'})['data']['user']['role']=='user'
            call('resource=admin&action=user','POST',{**new_body,'email':'bad@example.test','password':'short'},admin_token,expected=422)
            limited=call('resource=admin&action=user','POST',{**new_body,'email':'limited@example.test','role':'admin'},admin_token,expected=201)['data']
            limited_token=call('resource=admin&action=login','POST',{'email':'limited@example.test','password':'abc123'})['data']['token']
            call('resource=admin&action=user','POST',{**new_body,'email':'forged@example.test','role':'admin'},limited_token,expected=403)
            new_ad={'title':'Admin listing','description':'Created by administrator','category':'خدمات الصيانة المنزلية','status':'active'}
            call('resource=admin&action=ad','POST',new_ad,support_token,expected=403)
            new_id=call('resource=admin&action=ad','POST',new_ad,admin_token,expected=201)['data']['id']
            assert call(f'resource=market&action=detail&id={new_id}')['data']['title']=='Admin listing'
            category_body={'name':'قسم اختبار','name_en':'Test category','description':'Description','icon':'Gavel','color':'#123456','tint':'#eeeeee','subcategories':['خيار أول'],'sort_order':8,'is_active':True}
            call('resource=admin&action=category','POST',category_body,support_token,expected=403)
            cid=call('resource=admin&action=category','POST',category_body,admin_token,expected=201)['data']['id']
            assert any(c['id']==cid and c['name']=='قسم اختبار' for c in call('resource=services')['data'])
            call('resource=admin&action=category','POST',category_body,admin_token,expected=409)
            cat_ad=call('resource=admin&action=ad','POST',{**new_ad,'category':'قسم اختبار'},admin_token,expected=201)['data']['id']
            call('resource=admin&action=ad','POST',{**new_ad,'category':'does-not-exist'},admin_token,expected=422)
            renamed={**category_body,'name':'قسم معدل','sort_order':0}
            call(f'resource=admin&action=category&id={cid}','PATCH',renamed,admin_token)
            assert call(f'resource=market&action=detail&id={cat_ad}')['data']['category']=='قسم معدل'
            call(f'resource=admin&action=category&id={cid}','PATCH',{**renamed,'is_active':False},admin_token)
            assert all(c['id']!=cid for c in call('resource=services')['data'])
            call('resource=admin&action=ad','POST',{**new_ad,'category':'قسم معدل'},admin_token,expected=422)
            call(f'resource=admin&action=category&id={cid}','DELETE',{},admin_token,expected=409)
            replacement=call('resource=services')['data'][0]
            call(f'resource=admin&action=category&id={cid}','DELETE',{'replacement_id':replacement['id']},admin_token)
            assert call(f'resource=market&action=detail&id={cat_ad}')['data']['category']==replacement['name']
            assert all(c['id']!=cid for c in call('resource=admin&action=categories',token=admin_token)['data']['items'])
            # Reopening the API does not resurrect removed seed categories.
            empty_id=call('resource=admin&action=category','POST',{**category_body,'name':'Disposable'},admin_token,expected=201)['data']['id']
            call(f'resource=admin&action=category&id={empty_id}','DELETE',{},admin_token)
            assert all(c['id']!=empty_id for c in call('resource=services')['data'])
            call('resource=admin&action=logout', 'POST', {}, admin_token)
            call('resource=admin&action=stats', token=admin_token, expected=401)
            audits = sqlite3.connect(env['FORSAH_DB_PATH']).execute('SELECT COUNT(*) FROM admin_audit_log').fetchone()[0]
            assert audits >= 7, f'expected audit records, got {audits}'
            print('PASS: bootstrap rejects duplicates; services endpoint; missing/regular-user auth rejected; super_admin and support login; ads moderation; support ticket/reply; report review; user ban/unban; support role restrictions; admin role change; logout revocation; audit log.')
        finally:
            server.terminate()
            try: server.wait(timeout=4)
            except subprocess.TimeoutExpired: server.kill(); server.wait()


if __name__ == '__main__':
    main()
