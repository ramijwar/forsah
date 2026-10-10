<?php
declare(strict_types=1);
require_once __DIR__ . '/config-loader.php';

if (PHP_SAPI !== 'cli') { http_response_code(404); exit("Not found\n"); }
if (!extension_loaded('pdo_sqlite')) { fwrite(STDERR, "خطأ: ثبّت امتداد pdo_sqlite في PHP أولًا.\n"); exit(1); }
$path = getenv('FORSAH_DB_PATH') ?: dirname(__DIR__) . '/var/forsah.sqlite';
$dir = dirname($path);
umask(0077);
$newDir = !is_dir($dir);
if ($newDir && !mkdir($dir, 0700, true) && !is_dir($dir)) { fwrite(STDERR, "تعذر إنشاء مجلد قاعدة البيانات.\n"); exit(1); }
if ($newDir) @chmod($dir, 0700);
$pdo = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
@chmod($path, 0600);
$pdo->exec('PRAGMA foreign_keys = ON');
$pdo->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE UNIQUE,
 phone TEXT, password_hash TEXT, role TEXT NOT NULL DEFAULT 'user', is_banned INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
SQL);
$columns = array_column($pdo->query('PRAGMA table_info(users)')->fetchAll(), 'name');
if (!in_array('role', $columns, true)) $pdo->exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
if (!in_array('is_banned', $columns, true)) $pdo->exec('ALTER TABLE users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0');
$existing = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role IN ('super_admin','admin','support')")->fetchColumn();
if ($existing > 0) { fwrite(STDERR, "يوجد حساب إداري بالفعل. لم يتم إنشاء حساب إضافي.\n"); exit(2); }
$name = trim((string)(getenv('FORSAH_ADMIN_NAME') ?: prompt('اسم المدير الفائق: ')));
$email = strtolower(trim((string)(getenv('FORSAH_ADMIN_EMAIL') ?: prompt('البريد الإلكتروني: '))));
$password = (string)(getenv('FORSAH_ADMIN_PASSWORD') ?: promptSecret('كلمة مرور قوية (6 أحرف على الأقل): '));
if ($name === '' || mb_strlen($name) > 100 || !filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 190) { fwrite(STDERR, "الاسم أو البريد الإلكتروني غير صالح.\n"); exit(1); }
if (mb_strlen($password) < 6 || strlen($password) > 72) { fwrite(STDERR, "يجب أن تكون كلمة المرور 6 أحرف على الأقل وحتى 72 بايت.\n"); exit(1); }
try {
 $stmt=$pdo->prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'super_admin')");
 $stmt->execute([$name,$email,password_hash($password,PASSWORD_DEFAULT)]);
 fwrite(STDOUT, "تم إنشاء حساب المدير الفائق بنجاح.\nالبريد: {$email}\nلا يُطبع أو يُحفظ نص كلمة المرور.\n");
} catch (PDOException $e) { fwrite(STDERR, "تعذر إنشاء الحساب (قد يكون البريد مستخدمًا).\n"); exit(1); }
function prompt(string $text): string { fwrite(STDOUT,$text); return (string)fgets(STDIN); }
function promptSecret(string $text): string {
 fwrite(STDOUT,$text);
 $stty = trim((string)shell_exec('stty -g 2>/dev/null'));
 if ($stty !== '') shell_exec('stty -echo');
 $value = (string)fgets(STDIN);
 if ($stty !== '') { shell_exec('stty ' . escapeshellarg($stty)); fwrite(STDOUT,"\n"); }
 return rtrim($value,"\r\n");
}
