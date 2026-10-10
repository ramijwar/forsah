<?php
declare(strict_types=1);
require_once __DIR__ . '/config-loader.php';
require_once __DIR__ . '/categories.php';

/* فرصة API: tokens opaque, random, stored only as SHA-256 hashes. */
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store');
header('Vary: Origin');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = array_filter(array_map('trim', explode(',', getenv('FORSAH_CORS_ORIGINS') ?: 'https://t3lam.site,https://localhost')));
if (in_array('*', $allowedOrigins, true)) header('Access-Control-Allow-Origin: *');
elseif ($origin !== '' && in_array($origin, $allowedOrigins, true)) header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') { http_response_code(204); exit; }

function respond(int $status, array $payload): never {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
function ok(mixed $data, int $status = 200): never { respond($status, ['ok' => true, 'data' => $data]); }
function fail(int $status, string $message): never { respond($status, ['ok' => false, 'error' => $message]); }
function jsonBody(): array {
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 65536) fail(413, 'Request too large');
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') return [];
    $body = json_decode($raw, true);
    if (!is_array($body)) fail(400, 'صيغة JSON غير صالحة.');
    return $body;
}
function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    if (!extension_loaded('pdo_sqlite')) fail(503, 'امتداد PDO SQLite غير مثبت على الخادم.');
    if (preg_match('/(^|\.)t3lam\.site$/', explode(':', $_SERVER['HTTP_HOST'] ?? '')[0]) && !getenv('FORSAH_DB_PATH')) fail(503, 'Private database path must be configured');
    umask(0077);
    $path = getenv('FORSAH_DB_PATH') ?: dirname(__DIR__) . '/var/forsah.sqlite';
    $documentRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? '') ?: '';
    if ($documentRoot !== '' && str_starts_with($path, rtrim($documentRoot, '/') . '/') && !protectedHostingDatabase($path)) fail(503, 'Local database requires active hosting access protection');
    $dir = dirname($path);
    $newDir = !is_dir($dir);
    if ($newDir && !mkdir($dir, 0700, true) && !is_dir($dir)) fail(500, 'تعذر إنشاء مجلد قاعدة البيانات.');
    if ($newDir) @chmod($dir, 0700);
    $pdo = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    @chmod($path, 0600);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA busy_timeout = 5000');
    $pdo->exec('PRAGMA journal_mode = WAL');
    initializeSchema($pdo);
    categorySchema($pdo);
    return $pdo;
}
function initializeSchema(PDO $pdo): void {
    $pdo->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  phone TEXT,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('super_admin','admin','support','user')),
  is_banned INTEGER NOT NULL DEFAULT 0 CHECK(is_banned IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS login_attempts_ip_time_idx ON login_attempts(ip_hash, attempted_at);
CREATE TABLE IF NOT EXISTS public_rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS public_rate_limits_lookup_idx ON public_rate_limits(scope,ip_hash,created_at);
CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','rejected','blocked')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ads_status_idx ON ads(status);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reporter_name TEXT NOT NULL,
  reporter_email TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('ad','user')),
  entity_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','handled','dismissed')),
  handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  handled_at TEXT
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status,created_at);
CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','urgent')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ticket_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK(sender_type IN ('user','admin','support')),
  sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ticket_messages_ticket_idx ON ticket_messages(ticket_id, id);
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER,
  details_json TEXT NOT NULL DEFAULT '{}',
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON admin_audit_log(created_at);
SQL);
    // Migration for databases created from the old role-less prototype.
    $columns = $pdo->query('PRAGMA table_info(users)')->fetchAll();
    $names = array_column($columns, 'name');
    if (!in_array('role', $names, true)) $pdo->exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
    if (!in_array('is_banned', $names, true)) $pdo->exec('ALTER TABLE users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0');
}
function requestIpHash(): string {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    return hash('sha256', $ip . (getenv('FORSAH_IP_HASH_SALT') ?: __FILE__));
}
function authenticate(): array {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+([A-Za-z0-9_-]{40,})$/', $header, $matches)) fail(401, 'يلزم تسجيل الدخول.');
    $stmt = db()->prepare("SELECT u.id,u.name,u.email,u.role,u.is_banned,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > datetime('now')");
    $stmt->execute([hash('sha256', $matches[1])]);
    $user = $stmt->fetch();
    if (!$user || (int)$user['is_banned'] === 1 || !in_array($user['role'], ['super_admin','admin','support'], true)) fail(401, 'انتهت الجلسة أو لا تملك صلاحية الإدارة.');
    db()->prepare("UPDATE sessions SET last_seen_at=datetime('now') WHERE token_hash=?")->execute([hash('sha256', $matches[1])]);
    return $user;
}
function requireAdmin(array $user, bool $superOnly = false): void {
    $allowed = $superOnly ? ['super_admin'] : ['super_admin','admin','support'];
    if (!in_array($user['role'], $allowed, true)) fail(403, 'ليست لديك صلاحية تنفيذ هذا الإجراء.');
}
function audit(array $actor, string $action, string $targetType, ?int $targetId, array $details = []): void {
    $stmt = db()->prepare('INSERT INTO admin_audit_log(actor_user_id,actor_role,action,target_type,target_id,details_json,ip_hash) VALUES(?,?,?,?,?,?,?)');
    $stmt->execute([(int)$actor['id'], $actor['role'], $action, $targetType, $targetId, json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), requestIpHash()]);
}
function positiveId(): int {
    $id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($id === false || $id === null) fail(400, 'معرّف السجل غير صالح.');
    return $id;
}
function userPublic(array $user): array {
    unset($user['password_hash']);
    $user['id'] = (int)$user['id']; $user['is_banned'] = (bool)($user['is_banned'] ?? false);
    return $user;
}
function rateLimitLogin(): void {
    $pdo = db(); $ipHash = requestIpHash();
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM login_attempts WHERE ip_hash=? AND attempted_at > datetime('now','-15 minutes')");
    $stmt->execute([$ipHash]);
    if ((int)$stmt->fetchColumn() >= 10) fail(429, 'محاولات كثيرة. حاول مرة أخرى بعد 15 دقيقة.');
    $pdo->prepare('INSERT INTO login_attempts(ip_hash) VALUES(?)')->execute([$ipHash]);
    $pdo->exec("DELETE FROM login_attempts WHERE attempted_at < datetime('now','-1 day')");
}
function rateLimitPublic(string $scope, int $limit = 12, int $minutes = 15): void {
    $pdo=db();$ipHash=requestIpHash();$stmt=$pdo->prepare("SELECT COUNT(*) FROM public_rate_limits WHERE scope=? AND ip_hash=? AND created_at > datetime('now',?)");$stmt->execute([$scope,$ipHash,'-'.$minutes.' minutes']);
    if((int)$stmt->fetchColumn()>=$limit)fail(429,'تم إرسال طلبات كثيرة. حاول مجددًا لاحقًا.');
    $pdo->prepare('INSERT INTO public_rate_limits(scope,ip_hash) VALUES(?,?)')->execute([$scope,$ipHash]);$pdo->exec("DELETE FROM public_rate_limits WHERE created_at < datetime('now','-1 day')");
}

try {
    $pdo = db();
    $resource = $_GET['resource'] ?? '';
    $action = $_GET['action'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    require_once __DIR__ . '/market.php';
    marketRoutes($resource, $action, $method, $pdo);
    if ($resource === 'admin' && $action === 'login' && $method === 'POST') {
        rateLimitLogin(); $body = jsonBody();
        $email = strtolower(trim((string)($body['email'] ?? ''))); $password = (string)($body['password'] ?? '');
        $stmt = $pdo->prepare("SELECT id,name,email,role,is_banned,password_hash FROM users WHERE email=? AND role IN ('super_admin','admin','support')");
        $stmt->execute([$email]); $user = $stmt->fetch();
        if (!$user || !$user['password_hash'] || !password_verify($password, $user['password_hash']) || (int)$user['is_banned'] === 1) fail(401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) $pdo->prepare('UPDATE users SET password_hash=? WHERE id=?')->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
        $token = rtrim(strtr(base64_encode(random_bytes(36)), '+/', '-_'), '='); $expiresAt = gmdate('Y-m-d H:i:s', time() + 12 * 3600);
        $pdo->prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')->execute([hash('sha256', $token), $user['id'], $expiresAt]);
        audit($user, 'admin.login', 'session', null);
        unset($user['password_hash'], $user['is_banned']);
        ok(['token' => $token, 'expires_at' => $expiresAt, 'user' => userPublic($user)]);
    }
    if ($resource === 'services' && $method === 'GET') {
        ok(categoriesData($pdo));
    }
    if ($resource === 'ads' && $method === 'POST') {
        rateLimitPublic('ads', 8, 60);
        $body = jsonBody(); $title = trim((string)($body['title'] ?? '')); $description = trim((string)($body['description'] ?? '')); $category = trim((string)($body['category'] ?? ''));
        if ($title === '' || mb_strlen($title) > 120 || $description === '' || mb_strlen($description) > 3000 || $category === '' || mb_strlen($category) > 80) fail(422, 'تحقق من العنوان والوصف والتصنيف.');
        validCategory($pdo,$category);
        $stmt = $pdo->prepare('INSERT INTO ads(title,description,category,status) VALUES(?,?,?,\'pending\')'); $stmt->execute([$title,$description,$category]);
        ok(['id' => (int)$pdo->lastInsertId(), 'status' => 'pending'], 201);
    }
    if ($resource === 'support' && $action === 'tickets' && $method === 'POST') {
        rateLimitPublic('support', 8, 15);
        $body = jsonBody(); $name = trim((string)($body['name'] ?? '')); $email = trim((string)($body['email'] ?? '')); $subject = trim((string)($body['subject'] ?? '')); $message = trim((string)($body['message'] ?? ''));
        if ($name === '' || mb_strlen($name) > 100 || !filter_var($email,FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 190 || $subject === '' || mb_strlen($subject) > 160 || $message === '' || mb_strlen($message) > 5000) fail(422, 'يرجى إدخال الاسم والبريد والموضوع والرسالة بشكل صحيح.');
        $pdo->beginTransaction(); $pdo->prepare('INSERT INTO support_tickets(user_name,user_email,subject) VALUES(?,?,?)')->execute([$name,$email,$subject]); $id=(int)$pdo->lastInsertId();
        $pdo->prepare("INSERT INTO ticket_messages(ticket_id,sender_type,sender_name,content) VALUES(?,'user',?,?)")->execute([$id,$name,$message]); $pdo->commit(); ok(['id'=>$id,'status'=>'open'],201);
    }
    if ($resource === 'reports' && $action === 'create' && $method === 'POST') {
        rateLimitPublic('reports', 12, 15);
        $body=jsonBody(); $reporter=optionalMember(); if($reporter){$body['name']=$reporter['name'];$body['email']=$reporter['email'];} $name=trim((string)($body['name']??'')); $email=trim((string)($body['email']??'')); $entityType=(string)($body['entity_type']??''); $entityId=filter_var($body['entity_id']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]); $reason=trim((string)($body['reason']??'')); $description=trim((string)($body['description']??''));
        if($name===''||mb_strlen($name)>100||!filter_var($email,FILTER_VALIDATE_EMAIL)||mb_strlen($email)>190||!in_array($entityType,['ad','user'],true)||$entityId===false||$reason===''||mb_strlen($reason)>160||mb_strlen($description)>2000) fail(422,'بيانات البلاغ غير مكتملة أو غير صالحة.');
        if($entityType==='ad'){$check=$pdo->prepare('SELECT id FROM ads WHERE id=?');$check->execute([$entityId]);}else{$check=$pdo->prepare("SELECT id FROM users WHERE id=? AND role='user'");$check->execute([$entityId]);}
        if(!$check->fetch())fail(404,'العنصر المطلوب الإبلاغ عنه غير موجود.');
        $pdo->prepare('INSERT INTO reports(reporter_user_id,reporter_name,reporter_email,entity_type,entity_id,reason,description) VALUES(?,?,?,?,?,?,?)')->execute([$reporter['id']??null,$name,$email,$entityType,$entityId,$reason,$description]);ok(['id'=>(int)$pdo->lastInsertId(),'status'=>'pending'],201);
    }
    if ($resource !== 'admin') fail(404, 'المسار غير موجود.');
    if ($action === 'logout' && $method === 'POST') {
        $user = authenticate(); $header = $_SERVER['HTTP_AUTHORIZATION'] ?? ''; preg_match('/^Bearer\s+(.+)$/',$header,$matches);
        $pdo->prepare('DELETE FROM sessions WHERE token_hash=?')->execute([hash('sha256',$matches[1])]); audit($user,'admin.logout','session',null); ok(['logged_out'=>true]);
    }
    $user = authenticate();
    categoryAdmin($pdo,$user,$action,$method);
    if ($action === 'me' && $method === 'GET') { unset($user['is_banned']); ok(userPublic($user)); }
    if ($action === 'stats' && $method === 'GET') {
        $result = [
          'users'=>(int)$pdo->query("SELECT COUNT(*) FROM users WHERE role='user'")->fetchColumn(),
          'active_ads'=>(int)$pdo->query("SELECT COUNT(*) FROM ads WHERE status='active'")->fetchColumn(),
          'pending_ads'=>(int)$pdo->query("SELECT COUNT(*) FROM ads WHERE status='pending'")->fetchColumn(),
          'pending_reports'=>(int)$pdo->query("SELECT COUNT(*) FROM reports WHERE status='pending'")->fetchColumn(),
          'open_tickets'=>(int)$pdo->query("SELECT COUNT(*) FROM support_tickets WHERE status IN ('open','in_progress')")->fetchColumn(),
        ]; ok($result);
    }
    if (in_array($action,['ad','user'],true) && $method==='POST') {
        if(!in_array($user['role'],['admin','super_admin'],true)) fail(403,'إنشاء السجلات متاح للمدير فقط.');
        $body=jsonBody();
        if($action==='ad') {
            $title=textField($body,'title',120);$description=textField($body,'description',3000,false);$category=textField($body,'category',80);
            validCategory($pdo,$category);
            $status=$body['status']??'pending';if(!in_array($status,['pending','active'],true))fail(422,'حالة الإعلان غير صالحة.');
            $pdo->prepare('INSERT INTO ads(user_id,title,description,category,status) VALUES(?,?,?,?,?)')->execute([$user['id'],$title,$description,$category,$status]);
            $id=(int)$pdo->lastInsertId();audit($user,'ad.create','ad',$id);ok(['id'=>$id],201);
        }
        $name=textField($body,'name',100);$email=strtolower(textField($body,'email',190));$phone=textField($body,'phone',30,false);$password=textField($body,'password',200);
        if(!filter_var($email,FILTER_VALIDATE_EMAIL)||mb_strlen($password)<6||strlen($password)>72)fail(422,'تحقق من البريد وكلمة المرور (6 أحرف على الأقل و72 بايت كحد أقصى).');
        $role=$body['role']??'user';
        if(!in_array($role,['user','admin','support'],true))fail(422,'الدور غير صالح.');
        if($role!=='user')requireAdmin($user,true);
        $pdo->prepare('INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,?)')->execute([$name,$email,$phone,password_hash($password,PASSWORD_DEFAULT),$role]);
        $id=(int)$pdo->lastInsertId();audit($user,'user.create','user',$id,['role'=>$role]);ok(['id'=>$id],201);
    }
    if ($action === 'ads' && $method === 'GET') {
        $items=$pdo->query("SELECT a.id,a.title,a.description,a.category,a.status,a.created_at,u.name AS owner_name,u.email AS owner_email FROM ads a LEFT JOIN users u ON u.id=a.user_id ORDER BY CASE a.status WHEN 'pending' THEN 0 ELSE 1 END,a.created_at DESC LIMIT 500")->fetchAll();
        foreach($items as &$item) $item['id']=(int)$item['id']; unset($item); ok(['items'=>$items]);
    }
    if ($action === 'ad' && in_array($method,['PATCH','DELETE'],true)) {
        $id=positiveId(); $stmt=$pdo->prepare('SELECT id,category FROM ads WHERE id=?'); $stmt->execute([$id]); $existingAd=$stmt->fetch(); if(!$existingAd) fail(404,'الإعلان غير موجود.');
        if($method==='DELETE'){ $pdo->prepare('DELETE FROM ads WHERE id=?')->execute([$id]); audit($user,'ad.delete','ad',$id); ok(['id'=>$id,'deleted'=>true]); }
        $body=jsonBody(); $allowed=['title','description','category','status']; $updates=[]; $values=[];
        foreach($allowed as $field){ if(!array_key_exists($field,$body)) continue; $value=$body[$field];
            if($field==='status'&&!in_array($value,['pending','active','rejected','blocked'],true)) fail(422,'حالة الإعلان غير صالحة.');
            if($field!=='status'){ $value=trim((string)$value); $max=$field==='title'?120:($field==='category'?80:3000); if($value===''&&$field!=='description'||mb_strlen($value)>$max) fail(422,'تحقق من بيانات الإعلان.'); }
            if($field==='category')validCategory($pdo,$value,$existingAd['category']);
            $updates[]="$field=?"; $values[]=$value;
        }
        if(!$updates) fail(422,'لم يتم إرسال أي تغييرات.'); $updates[]="updated_at=datetime('now')"; $values[]=$id; $pdo->prepare('UPDATE ads SET '.implode(',',$updates).' WHERE id=?')->execute($values); audit($user,'ad.update','ad',$id,array_keys($body)); ok(['id'=>$id]);
    }
    if ($action === 'users' && $method === 'GET') {
        $items=$pdo->query('SELECT id,name,email,phone,role,is_banned,created_at FROM users ORDER BY created_at DESC LIMIT 500')->fetchAll(); foreach($items as &$item) $item=userPublic($item); unset($item); ok(['items'=>$items]);
    }
    if ($action === 'user' && $method === 'PATCH') {
        $id=positiveId(); $stmt=$pdo->prepare('SELECT id,role,is_banned FROM users WHERE id=?'); $stmt->execute([$id]); $target=$stmt->fetch(); if(!$target) fail(404,'المستخدم غير موجود.');
        if((int)$target['id']===(int)$user['id']) fail(422,'لا يمكنك تعديل حالة حسابك من هذه الشاشة.');
        if($user['role']==='support' && $target['role']!=='user') fail(403,'لا يسمح للدعم بتعديل حسابات الإدارة.');
        $body=jsonBody(); $updates=[]; $values=[];
        if(array_key_exists('name',$body)){ $v=trim((string)$body['name']); if($v===''||mb_strlen($v)>100) fail(422,'الاسم غير صالح.'); $updates[]='name=?';$values[]=$v; }
        if(array_key_exists('email',$body)){ $v=strtolower(trim((string)$body['email']));if(!filter_var($v,FILTER_VALIDATE_EMAIL)||mb_strlen($v)>190) fail(422,'البريد الإلكتروني غير صالح.');$updates[]='email=?';$values[]=$v; }
        if(array_key_exists('phone',$body)){ $v=trim((string)$body['phone']);if(mb_strlen($v)>30)fail(422,'رقم الهاتف طويل جدًا.');$updates[]='phone=?';$values[]=$v; }
        if(array_key_exists('is_banned',$body)){ if($target['role']!=='user') fail(403,'لا يمكن حظر حساب إداري من هذه الشاشة.');$updates[]='is_banned=?';$values[]=$body['is_banned']?1:0; }
        if(array_key_exists('role',$body)){ requireAdmin($user,true); if((int)$id===(int)$user['id'])fail(422,'لا يمكن تغيير دور حسابك بنفسك.'); if(!in_array($body['role'],['admin','support','user'],true))fail(422,'الدور المطلوب غير صالح.');$updates[]='role=?';$values[]=$body['role']; }
        if(!$updates)fail(422,'لم يتم إرسال أي تغييرات.');$updates[]="updated_at=datetime('now')";$values[]=$id;
        try{$pdo->prepare('UPDATE users SET '.implode(',',$updates).' WHERE id=?')->execute($values);}catch(PDOException $e){if(str_contains(strtolower($e->getMessage()),'unique'))fail(409,'هذا البريد مسجل لحساب آخر.');throw $e;}
        audit($user,'user.update','user',$id,array_keys($body));ok(['id'=>$id]);
    }
    if ($action === 'reports' && $method === 'GET') {
        $items=$pdo->query("SELECT r.id,r.reporter_name,r.reporter_email,r.entity_type,r.entity_id,r.reason,r.description,r.status,r.created_at,CASE WHEN r.entity_type='ad' THEN a.title ELSE u.name END AS target_label FROM reports r LEFT JOIN ads a ON r.entity_type='ad' AND a.id=r.entity_id LEFT JOIN users u ON r.entity_type='user' AND u.id=r.entity_id ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 500")->fetchAll();
        foreach($items as &$item){$item['id']=(int)$item['id'];$item['entity_id']=(int)$item['entity_id'];}unset($item);ok(['items'=>$items]);
    }
    if ($action === 'report' && $method === 'PATCH') {
        $id=positiveId();$body=jsonBody();$status=$body['status']??'';if(!in_array($status,['handled','dismissed'],true))fail(422,'حالة البلاغ غير صالحة.');
        $stmt=$pdo->prepare("UPDATE reports SET status=?,handled_by=?,handled_at=datetime('now') WHERE id=? AND status='pending'");$stmt->execute([$status,$user['id'],$id]);if(!$stmt->rowCount()){ $check=$pdo->prepare('SELECT id FROM reports WHERE id=?');$check->execute([$id]);if(!$check->fetch())fail(404,'البلاغ غير موجود.'); }
        audit($user,'report.review','report',$id,['status'=>$status]);ok(['id'=>$id,'status'=>$status]);
    }
    if ($action === 'tickets' && $method === 'GET') {
        $items=$pdo->query('SELECT id,subject,status,priority,user_name,user_email,updated_at FROM support_tickets ORDER BY CASE status WHEN \'open\' THEN 0 WHEN \'in_progress\' THEN 1 ELSE 2 END,updated_at DESC LIMIT 500')->fetchAll();foreach($items as &$item)$item['id']=(int)$item['id'];unset($item);ok(['items'=>$items]);
    }
    if ($action === 'ticket' && $method === 'GET') {
        $id=positiveId();$stmt=$pdo->prepare('SELECT id,subject,status,priority,user_name,user_email,updated_at FROM support_tickets WHERE id=?');$stmt->execute([$id]);$ticket=$stmt->fetch();if(!$ticket)fail(404,'التذكرة غير موجودة.');$ticket['id']=(int)$ticket['id'];
        $stmt=$pdo->prepare('SELECT id,sender_type,sender_name,content,created_at FROM ticket_messages WHERE ticket_id=? ORDER BY id');$stmt->execute([$id]);$ticket['messages']=$stmt->fetchAll();foreach($ticket['messages'] as &$message)$message['id']=(int)$message['id'];unset($message);ok($ticket);
    }
    if ($action === 'ticket' && $method === 'PATCH') {
        $id=positiveId();$body=jsonBody();$status=$body['status']??'';if(!in_array($status,['open','in_progress','resolved'],true))fail(422,'حالة التذكرة غير صالحة.');$stmt=$pdo->prepare("UPDATE support_tickets SET status=?,updated_at=datetime('now') WHERE id=?");$stmt->execute([$status,$id]);if(!$stmt->rowCount()){$check=$pdo->prepare('SELECT id FROM support_tickets WHERE id=?');$check->execute([$id]);if(!$check->fetch())fail(404,'التذكرة غير موجودة.');}audit($user,'ticket.status','ticket',$id,['status'=>$status]);$q=$pdo->prepare('SELECT id,subject,status,priority,user_name,user_email,updated_at FROM support_tickets WHERE id=?');$q->execute([$id]);$ticket=$q->fetch();$ticket['id']=(int)$ticket['id'];$q=$pdo->prepare('SELECT id,sender_type,sender_name,content,created_at FROM ticket_messages WHERE ticket_id=? ORDER BY id');$q->execute([$id]);$ticket['messages']=$q->fetchAll();foreach($ticket['messages'] as &$m)$m['id']=(int)$m['id'];unset($m);ok($ticket);
    }
    if ($action === 'ticket-reply' && $method === 'POST') {
        $id=positiveId();$body=jsonBody();$content=trim((string)($body['content']??''));if($content===''||mb_strlen($content)>5000)fail(422,'اكتب ردًا صالحًا لا يتجاوز 5000 حرف.');$q=$pdo->prepare('SELECT id FROM support_tickets WHERE id=?');$q->execute([$id]);if(!$q->fetch())fail(404,'التذكرة غير موجودة.');$senderType=$user['role']==='support'?'support':'admin';
        $pdo->beginTransaction();$pdo->prepare('INSERT INTO ticket_messages(ticket_id,sender_type,sender_id,sender_name,content) VALUES(?,?,?,?,?)')->execute([$id,$senderType,$user['id'],$user['name'],$content]);$pdo->prepare("UPDATE support_tickets SET status='in_progress',updated_at=datetime('now') WHERE id=? AND status!='resolved'")->execute([$id]);$pdo->commit();audit($user,'ticket.reply','ticket',$id);$q=$pdo->prepare('SELECT id,subject,status,priority,user_name,user_email,updated_at FROM support_tickets WHERE id=?');$q->execute([$id]);$ticket=$q->fetch();$ticket['id']=(int)$ticket['id'];$q=$pdo->prepare('SELECT id,sender_type,sender_name,content,created_at FROM ticket_messages WHERE ticket_id=? ORDER BY id');$q->execute([$id]);$ticket['messages']=$q->fetchAll();foreach($ticket['messages'] as &$m)$m['id']=(int)$m['id'];unset($m);ok($ticket);
    }
    fail(404,'المسار غير موجود.');
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
    error_log('[forsah-api] ' . $e->getMessage());
    if ($e instanceof PDOException && str_contains(strtolower($e->getMessage()), 'unique')) fail(409, 'البريد الإلكتروني مستخدم بالفعل.');
    fail(500, 'حدث خطأ داخلي. راجع سجل الخادم للتفاصيل.');
}
