#!/usr/bin/env python3
"""Real PHP/SQLite integration tests in an isolated temporary database; no production writes."""
import base64
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

ROOT = Path(__file__).resolve().parents[2]
PASSWORD = 'Secure-test-password-2026'

def main():
    with tempfile.TemporaryDirectory(prefix='forsah-market-') as temp:
        env = {**os.environ, 'FORSAH_DB_PATH': str(Path(temp)/'test.sqlite'),
            'FORSAH_ADMIN_NAME':'Test Admin','FORSAH_ADMIN_EMAIL':'admin@example.test',
            'FORSAH_ADMIN_PASSWORD':PASSWORD,'FORSAH_CORS_ORIGINS':'https://t3lam.site,https://localhost'}
        subprocess.run(['php',str(ROOT/'backend/bootstrap-admin.php')],env=env,check=True,capture_output=True)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
        server=subprocess.Popen(['php','-S',f'127.0.0.1:{port}','-t',str(ROOT/'backend')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        base=f'http://127.0.0.1:{port}/api.php?'
        def call(query, method='GET', body=None, token=None, expected=200, raw=None, headers=None):
            h={'Origin':'https://localhost', **(headers or {})}
            if token: h['Authorization']='Bearer '+token
            if body is not None: h['Content-Type']='application/json';raw=json.dumps(body).encode()
            req=urllib.request.Request(base+query,method=method,data=raw,headers=h)
            try: response=urllib.request.urlopen(req,timeout=10)
            except urllib.error.HTTPError as e: response=e
            payload=response.read()
            assert response.status==expected, (query,method,response.status,payload)
            assert response.headers.get('Access-Control-Allow-Origin')=='https://localhost'
            if response.headers.get('Content-Type','').startswith('image/'):return payload
            return json.loads(payload) if payload else {}
        def register(name):
            result=call('resource=auth&action=register','POST',{'name':name,'email':name+'@example.test','password':PASSWORD},expected=201)['data']
            assert result['user']['role']=='user' and 'password_hash' not in result['user']
            return result['token'],int(result['user']['id'])
        try:
            for _ in range(80):
                try: urllib.request.urlopen(base+'resource=health',timeout=1);break
                except Exception:time.sleep(.1)
            else:raise AssertionError('PHP startup failed')
            assert call('resource=health')['data']['version']==2
            assert call('resource=health')['data']['images_supported'] is True
            call('resource=health','OPTIONS',headers={'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'},expected=204)
            admin=call('resource=admin&action=login','POST',{'email':'admin@example.test','password':PASSWORD})['data']['token']
            seller,seller_id=register('seller');buyer,buyer_id=register('buyer');outsider,_=register('outsider')
            call('resource=auth&action=register','POST',{'name':'fake','email':'seller@example.test','password':PASSWORD,'role':'super_admin'},expected=409)
            call('resource=admin&action=stats',token=seller,expected=401)
            call('resource=auth&action=me',expected=401)
            ad=call('resource=market&action=create','POST',{'title':'كرسي جديد','description':'أثاث نظيف','category':'المفروشات والموبيليا'},seller,201)['data'];aid=ad['id']
            assert ad['status']=='pending' and ad['user_id']==seller_id
            assert call('resource=market')['data']['items']==[]
            call(f'resource=market&action=detail&id={aid}',token=buyer,expected=404)
            call(f'resource=market&action=delete&id={aid}','DELETE',token=buyer,expected=404)
            call(f'resource=market&action=edit&id={aid}','PATCH',{'title':'hacked','description':'bad','category':'bad'},buyer,404)
            assert len(call('resource=market&action=mine',token=seller)['data']['items'])==1
            assert call('resource=market&action=mine',token=buyer)['data']['items']==[]
            # Generate a real PNG via GD, then test re-encoding and access control.
            png=subprocess.run(['php','-r','$im=imagecreatetruecolor(8,8);imagepng($im);'],check=True,capture_output=True).stdout
            def upload(data, token, expected=201):
                boundary='ForsahTestBoundary'
                raw=(f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="image.png"\r\nContent-Type: image/png\r\n\r\n'.encode()+data+f'\r\n--{boundary}--\r\n'.encode())
                return call(f'resource=market&action=image&id={aid}','POST',token=token,expected=expected,raw=raw,headers={'Content-Type':f'multipart/form-data; boundary={boundary}'})
            upload(b'<?php echo "malicious"; ?>',seller,422)
            upload(png,buyer,404)
            uploaded=upload(png,seller)['data'];image=uploaded['images'][0]
            call(f'resource=image&id={image}',expected=404)
            assert call(f'resource=image&id={image}',token=seller).startswith(b'\xff\xd8')
            assert call(f'resource=image&id={image}',token=admin).startswith(b'\xff\xd8')
            upload(png,seller);upload(png,seller);upload(png,seller,422)
            call(f'resource=admin&action=ad&id={aid}','PATCH',{'status':'active'},admin)
            assert len(call('resource=market&q=%D9%83%D8%B1%D8%B3%D9%8A')['data']['items'])==1
            assert call('resource=market&q=doesnotexist')['data']['items']==[]
            assert call(f'resource=image&id={image}').startswith(b'\xff\xd8')
            call(f'resource=favorites&id={aid}','POST',token=buyer)
            call(f'resource=favorites&id={aid}','POST',token=buyer)
            assert call('resource=favorites',token=buyer)['data']==[aid]
            assert len(call('resource=market&action=favorites',token=buyer)['data']['items'])==1
            assert call('resource=favorites',token=seller)['data']==[]
            call(f'resource=favorites&id={aid}','DELETE',token=buyer)
            assert call('resource=favorites',token=buyer)['data']==[]
            cid=call(f'resource=chat&action=start&id={aid}','POST',token=buyer)['data']['id']
            assert call(f'resource=chat&action=start&id={aid}','POST',token=buyer)['data']['id']==cid
            call(f'resource=chat&action=start&id={aid}','POST',token=seller,expected=422)
            call(f'resource=chat&action=messages&id={cid}',token=outsider,expected=404)
            call(f'resource=chat&action=send&id={cid}','POST',{'content':'attack'},outsider,404)
            first=call(f'resource=chat&action=send&id={cid}','POST',{'content':'هل ما زال متاحًا؟'},buyer,201)['data']['id']
            call(f'resource=chat&action=send&id={cid}','POST',{'content':'نعم'},seller,201)
            messages=call(f'resource=chat&action=messages&id={cid}',token=buyer)['data'];assert len(messages)==2
            assert int(messages[0]['sender_id'])==buyer_id
            assert len(call(f'resource=chat&action=messages&id={cid}&after={first}',token=seller)['data'])==1
            assert len(call('resource=chat&action=list',token=seller)['data'])==1
            ticket=call('resource=member-support&action=create','POST',{'subject':'مساعدة','content':'سؤال'},buyer,201)['data']['id']
            call(f'resource=member-support&action=detail&id={ticket}',token=seller,expected=404)
            call(f'resource=member-support&action=reply&id={ticket}','POST',{'content':'attack'},outsider,404)
            call(f'resource=admin&action=ticket-reply&id={ticket}','POST',{'content':'إجابة الدعم'},admin)
            thread=call(f'resource=member-support&action=detail&id={ticket}',token=buyer)['data'];assert len(thread['messages'])==2
            call(f'resource=member-support&action=reply&id={ticket}','POST',{'content':'شكرًا'},buyer,201)
            assert len(call(f'resource=member-support&action=detail&id={ticket}',token=buyer)['data']['messages'])==3
            assert len(call('resource=member-support&action=list',token=buyer)['data'])==1
            assert call('resource=member-support&action=list',token=outsider)['data']==[]
            call('resource=reports&action=create','POST',{'name':'Spoofed','email':'spoofed@example.test','entity_type':'ad','entity_id':aid,'reason':'بلاغ'},buyer,201)
            db=sqlite3.connect(env['FORSAH_DB_PATH'])
            assert db.execute('SELECT reporter_email FROM reports').fetchone()[0]=='buyer@example.test'
            db.close()
            call('resource=auth&action=profile','PATCH',{'name':'Updated buyer','phone':'123'},buyer)
            assert call('resource=auth&action=me',token=buyer)['data']['name']=='Updated buyer'
            # Editing returns a published listing to moderation, including its images.
            call(f'resource=market&action=edit&id={aid}','PATCH',{'title':'Updated','description':'Updated description','category':'أثاث'},seller)
            call(f'resource=image&id={image}',expected=404)
            call(f'resource=market&action=image-delete&id={aid}&image_id={image}','DELETE',token=buyer,expected=404)
            call(f'resource=market&action=image-delete&id={aid}&image_id={image}','DELETE',token=seller)
            call(f'resource=image&id={image}',token=seller,expected=404)
            # Banning revokes effective access to all member endpoints/conversations.
            call(f'resource=admin&action=user&id={buyer_id}','PATCH',{'is_banned':True},admin)
            call('resource=auth&action=me',token=buyer,expected=401)
            call(f'resource=chat&action=messages&id={cid}',token=seller,expected=404)
            call(f'resource=admin&action=user&id={buyer_id}','PATCH',{'is_banned':False},admin)
            call('resource=auth&action=password','POST',{'current_password':'wrong','password':'Replacement-password-123'},buyer,422)
            call('resource=auth&action=password','POST',{'current_password':PASSWORD,'password':'Replacement-password-123'},buyer)
            call('resource=auth&action=me',token=buyer,expected=401)
            buyer=call('resource=auth&action=login','POST',{'email':'buyer@example.test','password':'Replacement-password-123'})['data']['token']
            call('resource=auth&action=logout','POST',token=buyer)
            call('resource=auth&action=me',token=buyer,expected=401)
            call(f'resource=market&action=delete&id={aid}','DELETE',token=seller)
            assert call('resource=market&action=mine',token=seller)['data']['items']==[]
            print('PASS: v2 health, CORS, registration/login/logout/password revocation, roles, ad CRUD/moderation/search, actual image re-encoding and ownership, favorite isolation, chat delivery and IDOR protection, support round-trip, report identity, ban enforcement, deletion.')
        finally:
            server.terminate()
            try:server.wait(timeout=4)
            except subprocess.TimeoutExpired:server.kill();server.wait()

if __name__=='__main__':main()
