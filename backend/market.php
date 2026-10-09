<?php
declare(strict_types=1);

// Additive migrations: never replace the existing users, ads or administration data.
function marketSchema(PDO $pdo): void {
    $pdo->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS favorites (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 ad_id INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY(user_id,ad_id)
);
CREATE TABLE IF NOT EXISTS ad_images (
 id INTEGER PRIMARY KEY AUTOINCREMENT, ad_id INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
 mime TEXT NOT NULL, content BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS ad_images_ad ON ad_images(ad_id);
CREATE TABLE IF NOT EXISTS conversations (
 id INTEGER PRIMARY KEY AUTOINCREMENT, ad_id INTEGER REFERENCES ads(id) ON DELETE SET NULL,
 buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(ad_id,buyer_id,seller_id)
);
CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id,id);
SQL);
}
function member(): array {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+([A-Za-z0-9_-]{40,})$/', $header, $matches)) fail(401, 'يلزم تسجيل الدخول / Sign in required');
    $q = db()->prepare("SELECT u.id,u.name,u.email,u.phone,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>datetime('now') AND u.is_banned=0");
    $q->execute([hash('sha256', $matches[1])]);
    $u = $q->fetch();
    if (!$u) fail(401, 'انتهت الجلسة / Session expired');
    $u['id'] = (int)$u['id'];
    return $u;
}
function optionalMember(): ?array { return empty($_SERVER['HTTP_AUTHORIZATION']) ? null : member(); }
function textField(array $body, string $key, int $max, bool $required = true): string {
    if (isset($body[$key]) && !is_string($body[$key])) fail(422, 'Invalid field: '.$key);
    $value = trim($body[$key] ?? '');
    if (($required && $value === '') || mb_strlen($value) > $max) fail(422, 'تحقق من الحقل / Invalid field: '.$key);
    return $value;
}
function issueSession(array $user): array {
    $token = rtrim(strtr(base64_encode(random_bytes(36)), '+/', '-_'), '=');
    $expires = gmdate('Y-m-d H:i:s', time() + 30 * 86400);
    db()->prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')->execute([hash('sha256', $token), $user['id'], $expires]);
    return ['token'=>$token, 'expires_at'=>$expires, 'user'=>array_intersect_key($user, array_flip(['id','name','email','phone','role']))];
}
function adData(array $ad): array {
    $ad['id']=(int)$ad['id']; $ad['user_id']=$ad['user_id'] === null ? null : (int)$ad['user_id'];
    $q=db()->prepare('SELECT id FROM ad_images WHERE ad_id=? ORDER BY id'); $q->execute([$ad['id']]);
    $ad['images']=array_map('intval', $q->fetchAll(PDO::FETCH_COLUMN));
    return $ad;
}
function ownedAd(int $id, array $u): array {
    $q=db()->prepare('SELECT * FROM ads WHERE id=? AND user_id=?'); $q->execute([$id,$u['id']]);
    $ad=$q->fetch(); if(!$ad) fail(404,'الإعلان غير موجود / Ad not found'); return $ad;
}
function readableAd(int $id, ?array $u): array {
    $q=db()->prepare('SELECT a.*,u.name AS owner_name,u.is_banned AS owner_banned FROM ads a LEFT JOIN users u ON u.id=a.user_id WHERE a.id=?'); $q->execute([$id]); $a=$q->fetch();
    $privileged=$u && ((int)($a['user_id']??0)===$u['id'] || in_array($u['role'],['admin','super_admin','support'],true));
    if (!$a || (!$privileged && ($a['status']!=='active' || (int)$a['owner_banned']===1))) fail(404,'الإعلان غير متاح / Ad unavailable');
    unset($a['owner_banned']); return $a;
}
function conversation(int $id,array $u): array {
    $q=db()->prepare('SELECT c.* FROM conversations c JOIN users b ON b.id=c.buyer_id JOIN users s ON s.id=c.seller_id WHERE c.id=? AND (c.buyer_id=? OR c.seller_id=?) AND b.is_banned=0 AND s.is_banned=0');
    $q->execute([$id,$u['id'],$u['id']]); $c=$q->fetch(); if(!$c)fail(404,'المحادثة غير متاحة / Conversation unavailable'); return $c;
}
function marketRoutes(string $resource,string $action,string $method,PDO $pdo): void {
    if (!in_array($resource,['health','auth','market','favorites','chat','member-support','image'],true)) return;
    marketSchema($pdo);
    if ($resource==='health' && $method==='GET') ok(['version'=>2,'images_supported'=>extension_loaded('gd'),'features'=>['accounts','market','images','favorites','chat','member-support','reports']]);
    if ($resource==='auth') {
        if ($method==='POST' && in_array($action,['register','login'],true)) {
            rateLimitLogin(); $b=jsonBody(); $email=strtolower(textField($b,'email',190)); $password=textField($b,'password',200);
            if(!filter_var($email,FILTER_VALIDATE_EMAIL))fail(422,'Invalid email');
            if($action==='register') {
                rateLimitPublic('register',5,60); $name=textField($b,'name',100);
                if(strlen($password)<12 || strlen($password)>72)fail(422,'كلمة المرور بين 12 و72 بايت / Password must be 12–72 bytes');
                // Only register new identities. Never claim a guest/support/admin record by email.
                $pdo->prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'user')")->execute([$name,$email,password_hash($password,PASSWORD_DEFAULT)]);
            }
            $q=$pdo->prepare('SELECT id,name,email,phone,role,password_hash,is_banned FROM users WHERE email=?'); $q->execute([$email]); $u=$q->fetch();
            if(!$u || !$u['password_hash'] || !password_verify($password,$u['password_hash']) || (int)$u['is_banned']===1)fail(401,'بيانات الدخول غير صحيحة / Invalid credentials');
            $u['id']=(int)$u['id']; ok(issueSession($u),$action==='register'?201:200);
        }
        $u=member();
        if ($method==='GET' && $action==='me') ok($u);
        if ($method==='POST' && $action==='logout') {
            $token=preg_replace('/^Bearer\s+/','',$_SERVER['HTTP_AUTHORIZATION']);
            $pdo->prepare('DELETE FROM sessions WHERE token_hash=?')->execute([hash('sha256',$token)]); ok(['logged_out'=>true]);
        }
        if ($method==='PATCH' && $action==='profile') {
            $b=jsonBody(); $name=textField($b,'name',100); $phone=textField($b,'phone',30,false);
            $pdo->prepare("UPDATE users SET name=?,phone=?,updated_at=datetime('now') WHERE id=?")->execute([$name,$phone,$u['id']]);ok(member());
        }
        if ($method==='POST' && $action==='password') {
            rateLimitPublic('password',5,15); $b=jsonBody(); $old=textField($b,'current_password',200); $new=textField($b,'password',200);
            $q=$pdo->prepare('SELECT password_hash FROM users WHERE id=?');$q->execute([$u['id']]);
            if(!password_verify($old,$q->fetchColumn() ?: '') || strlen($new)<12 || strlen($new)>72)fail(422,'تحقق من كلمة المرور / Check password');
            $pdo->beginTransaction();
            $pdo->prepare('UPDATE users SET password_hash=? WHERE id=?')->execute([password_hash($new,PASSWORD_DEFAULT),$u['id']]);
            $pdo->prepare('DELETE FROM sessions WHERE user_id=?')->execute([$u['id']]);$pdo->commit();ok(['login_required'=>true]);
        }
    }
    if ($resource==='market') {
        if ($method==='GET') {
            $u=optionalMember();
            if ($action==='detail') ok(adData(readableAd(positiveId(),$u)));
            $where="a.status='active' AND (u.is_banned IS NULL OR u.is_banned=0)"; $args=[];
            if ($action==='mine') { $u=member();$where='a.user_id=?';$args[]=$u['id']; }
            elseif ($action==='favorites') { $u=member();$where.=' AND EXISTS(SELECT 1 FROM favorites f WHERE f.ad_id=a.id AND f.user_id=?)';$args[]=$u['id']; }
            elseif ($action!=='' && $action!=='list') fail(404,'Unknown action');
            $search=trim((string)($_GET['q']??'')); $category=trim((string)($_GET['category']??''));
            if(mb_strlen($search)>120 || mb_strlen($category)>80)fail(422,'Invalid search');
            if($search!=='') { $where.=' AND (a.title LIKE ? OR a.description LIKE ?)';$args[]='%'.$search.'%';$args[]='%'.$search.'%'; }
            if($category!=='') { $where.=' AND a.category=?';$args[]=$category; }
            $page=max(1,min(10000,(int)($_GET['page']??1)));$offset=($page-1)*20;
            $q=$pdo->prepare("SELECT a.*,u.name AS owner_name FROM ads a LEFT JOIN users u ON u.id=a.user_id WHERE $where ORDER BY a.id DESC LIMIT 21 OFFSET $offset");$q->execute($args);$items=$q->fetchAll();$more=count($items)>20;
            ok(['items'=>array_map('adData',array_slice($items,0,20)),'has_more'=>$more,'page'=>$page]);
        }
        $u=member();$b=$action==='image'?[]:jsonBody();
        if($method==='POST' && $action==='create') {
            rateLimitPublic('member-ads',15,60);$title=textField($b,'title',120);$description=textField($b,'description',3000);$category=textField($b,'category',80);
            $pdo->prepare("INSERT INTO ads(user_id,title,description,category,status) VALUES(?,?,?,?,'pending')")->execute([$u['id'],$title,$description,$category]);ok(adData(ownedAd((int)$pdo->lastInsertId(),$u)),201);
        }
        $id=positiveId();$ad=ownedAd($id,$u);
        if($method==='PATCH' && $action==='edit') {
            $title=textField($b,'title',120);$description=textField($b,'description',3000);$category=textField($b,'category',80);
            if($ad['status']==='blocked')fail(403,'الإعلان محظور / Ad blocked');
            $pdo->prepare("UPDATE ads SET title=?,description=?,category=?,status='pending',updated_at=datetime('now') WHERE id=? AND user_id=?")->execute([$title,$description,$category,$id,$u['id']]);ok(adData(ownedAd($id,$u)));
        }
        if($method==='DELETE' && $action==='delete') { $pdo->prepare('DELETE FROM ads WHERE id=? AND user_id=?')->execute([$id,$u['id']]);ok(['deleted'=>true]); }
        if($method==='POST' && $action==='image') {
            rateLimitPublic('image-upload',30,60);
            if($ad['status']==='blocked')fail(403,'Ad blocked');
            if(!extension_loaded('gd'))fail(503,'امتداد GD مطلوب / GD extension required');
            $file=$_FILES['image']??null;
            if(!$file || $file['error']!==UPLOAD_ERR_OK || $file['size']>2*1024*1024 || !is_uploaded_file($file['tmp_name']))fail(422,'الصورة يجب أن تكون أقل من 2 MB / Invalid image');
            $info=@getimagesize($file['tmp_name']);
            if(!$info || !in_array($info[2],[IMAGETYPE_JPEG,IMAGETYPE_PNG,IMAGETYPE_WEBP],true) || $info[0]*$info[1]>12000000)fail(422,'JPEG, PNG or WebP only, max 12 megapixels');
            $image=@imagecreatefromstring(file_get_contents($file['tmp_name']));if(!$image)fail(422,'Invalid image');
            // Re-encode, stripping executable payloads and metadata (including GPS).
            ob_start();imagejpeg($image,null,85);$content=ob_get_clean();imagedestroy($image);
            if(strlen($content)>2*1024*1024)fail(422,'Image too large after decoding');
            $pdo->beginTransaction();
            $q=$pdo->prepare('SELECT COUNT(*) FROM ad_images WHERE ad_id=?');$q->execute([$id]);if((int)$q->fetchColumn()>=3){$pdo->rollBack();fail(422,'3 images maximum');}
            $q=$pdo->prepare('INSERT INTO ad_images(ad_id,mime,content) VALUES(?,?,?)');$q->bindValue(1,$id,PDO::PARAM_INT);$q->bindValue(2,'image/jpeg');$q->bindValue(3,$content,PDO::PARAM_LOB);$q->execute();
            $pdo->prepare("UPDATE ads SET status='pending' WHERE id=?")->execute([$id]);$pdo->commit();ok(adData(ownedAd($id,$u)),201);
        }
        if($method==='DELETE' && $action==='image-delete') {
            $imageId=filter_var($_GET['image_id']??null,FILTER_VALIDATE_INT);if(!$imageId)fail(422,'Invalid image ID');
            $pdo->prepare('DELETE FROM ad_images WHERE id=? AND ad_id=?')->execute([$imageId,$id]);ok(adData(ownedAd($id,$u)));
        }
    }
    if($resource==='image' && $method==='GET') {
        $q=$pdo->prepare('SELECT ad_id,mime,content FROM ad_images WHERE id=?');$q->execute([positiveId()]);$img=$q->fetch();if(!$img)fail(404,'Image not found');
        readableAd((int)$img['ad_id'],optionalMember());header('Content-Type: '.$img['mime']);header('Content-Length: '.strlen($img['content']));header('Content-Security-Policy: default-src \'none\'');echo $img['content'];exit;
    }
    if($resource==='favorites') {
        $u=member();
        if($method==='GET'){$q=$pdo->prepare('SELECT ad_id FROM favorites WHERE user_id=?');$q->execute([$u['id']]);ok(array_map('intval',$q->fetchAll(PDO::FETCH_COLUMN)));}
        $id=positiveId();
        if($method==='POST'){readableAd($id,$u);$pdo->prepare('INSERT OR IGNORE INTO favorites(user_id,ad_id) VALUES(?,?)')->execute([$u['id'],$id]);ok(['saved'=>true]);}
        if($method==='DELETE'){$pdo->prepare('DELETE FROM favorites WHERE user_id=? AND ad_id=?')->execute([$u['id'],$id]);ok(['saved'=>false]);}
    }
    if($resource==='chat') {
        $u=member();
        if($method==='POST' && $action==='start') {
            rateLimitPublic('chat-start',30,60);$ad=readableAd(positiveId(),$u);
            if(!$ad['user_id'] || (int)$ad['user_id']===$u['id'] || $ad['status']!=='active')fail(422,'لا يمكن بدء هذه المحادثة / Cannot start chat');
            $pdo->prepare('INSERT OR IGNORE INTO conversations(ad_id,buyer_id,seller_id) VALUES(?,?,?)')->execute([$ad['id'],$u['id'],$ad['user_id']]);
            $q=$pdo->prepare('SELECT id FROM conversations WHERE ad_id=? AND buyer_id=? AND seller_id=?');$q->execute([$ad['id'],$u['id'],$ad['user_id']]);ok(['id'=>(int)$q->fetchColumn()]);
        }
        if($method==='GET' && $action==='list') {
            $q=$pdo->prepare("SELECT c.id, a.title, CASE WHEN c.buyer_id=? THEN s.name ELSE b.name END AS partner, (SELECT content FROM messages WHERE conversation_id=c.id ORDER BY id DESC LIMIT 1) AS last_message FROM conversations c LEFT JOIN ads a ON a.id=c.ad_id JOIN users b ON b.id=c.buyer_id JOIN users s ON s.id=c.seller_id WHERE (c.buyer_id=? OR c.seller_id=?) AND b.is_banned=0 AND s.is_banned=0 ORDER BY COALESCE((SELECT MAX(id) FROM messages WHERE conversation_id=c.id),0) DESC LIMIT 100");$q->execute([$u['id'],$u['id'],$u['id']]);ok($q->fetchAll());
        }
        $id=positiveId();conversation($id,$u);
        if($method==='GET' && $action==='messages') {
            $after=max(0,(int)($_GET['after']??0));$q=$pdo->prepare('SELECT id,sender_id,content,created_at FROM messages WHERE conversation_id=? AND id>? ORDER BY id LIMIT 100');$q->execute([$id,$after]);ok($q->fetchAll());
        }
        if($method==='POST' && $action==='send') {
            rateLimitPublic('chat-send',60,1);$content=textField(jsonBody(),'content',3000);
            $pdo->prepare('INSERT INTO messages(conversation_id,sender_id,content) VALUES(?,?,?)')->execute([$id,$u['id'],$content]);ok(['id'=>(int)$pdo->lastInsertId()],201);
        }
    }
    if($resource==='member-support') {
        $u=member();
        if($method==='GET' && $action==='list'){$q=$pdo->prepare('SELECT id,subject,status,updated_at FROM support_tickets WHERE user_id=? ORDER BY id DESC LIMIT 100');$q->execute([$u['id']]);ok($q->fetchAll());}
        if($method==='POST' && $action==='create'){
            rateLimitPublic('member-support',8,15);$b=jsonBody();$subject=textField($b,'subject',160);$content=textField($b,'content',5000);
            $pdo->beginTransaction();$pdo->prepare('INSERT INTO support_tickets(user_id,user_name,user_email,subject) VALUES(?,?,?,?)')->execute([$u['id'],$u['name'],$u['email'],$subject]);$id=(int)$pdo->lastInsertId();
            $pdo->prepare("INSERT INTO ticket_messages(ticket_id,sender_type,sender_id,sender_name,content) VALUES(?,'user',?,?,?)")->execute([$id,$u['id'],$u['name'],$content]);$pdo->commit();ok(['id'=>$id],201);
        }
        $id=positiveId();$q=$pdo->prepare('SELECT id,subject,status FROM support_tickets WHERE id=? AND user_id=?');$q->execute([$id,$u['id']]);$ticket=$q->fetch();if(!$ticket)fail(404,'Ticket not found');
        if($method==='GET' && $action==='detail'){$q=$pdo->prepare('SELECT id,sender_type,sender_name,content,created_at FROM ticket_messages WHERE ticket_id=? ORDER BY id LIMIT 500');$q->execute([$id]);$ticket['messages']=$q->fetchAll();ok($ticket);}
        if($method==='POST' && $action==='reply'){
            rateLimitPublic('ticket-reply',30,15);$content=textField(jsonBody(),'content',5000);
            $pdo->beginTransaction();$pdo->prepare("INSERT INTO ticket_messages(ticket_id,sender_type,sender_id,sender_name,content) VALUES(?,'user',?,?,?)")->execute([$id,$u['id'],$u['name'],$content]);
            $pdo->prepare("UPDATE support_tickets SET status='open',updated_at=datetime('now') WHERE id=?")->execute([$id]);$pdo->commit();ok(['sent'=>true],201);
        }
    }
    fail(404,'Unknown route');
}
