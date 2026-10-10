<?php
declare(strict_types=1);

final class HostingSetupException extends RuntimeException {
    public function __construct(public readonly string $reason, string $detail) { parent::__construct($detail); }
}
function hostingFailure(string $reason, string $detail): never { throw new HostingSetupException($reason, $detail); }

/** Drop-in package: local database directory must be denied by the web server. */
function initializeHostingDatabase(): void {
    if (getenv('FORSAH_DB_PATH')) return;
    $private = __DIR__ . '/database';
    if (is_link($private)) hostingFailure('DB_UNSAFE_PATH', 'Private database directory must not be a symlink');
    umask(0077);
    if (!is_dir($private) && !@mkdir($private, 0700, true) && !is_dir($private)) {
        hostingFailure('DB_DIRECTORY_CREATE_FAILED', 'Cannot create writable database directory inside the application');
    }
    $private = realpath($private);
    if (!$private) hostingFailure('DB_DIRECTORY_UNREADABLE', 'Invalid database directory');
    $path = $private . '/forsah.sqlite';
    $protectionIssue = hostingDatabaseProtectionIssue($path);
    if ($protectionIssue !== null) hostingFailure($protectionIssue, 'Database access protection is not active');
    if (!is_writable($private)) hostingFailure('DB_DIRECTORY_NOT_WRITABLE', 'PHP cannot write to database directory');
    @chmod($private, 0700);
    $lock = @fopen($private . '/install.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) hostingFailure('DB_LOCK_FAILED', 'Cannot lock database initialization');
    try {
        if (!file_exists($path)) {
            // Fresh-install policy explicitly requested by the owner: legacy files
            // are left untouched, but do not block a new local identity store.
            // An existing local database is NEVER reset, including on re-extraction.
            $seed = __DIR__ . '/database/forsah.seed.sqlite';
            $temp = tempnam($private, '.install-');
            if ($temp === false) hostingFailure('DB_TEMP_CREATE_FAILED', 'Cannot create database file');
            try {
                if (is_file($seed) && !copy($seed, $temp)) hostingFailure('DB_INSTALL_FAILED', 'Cannot copy database seed');
                // Without a seed, PDO initializes this empty file using the application schema.
                if (!chmod($temp, 0600) || !rename($temp, $path)) hostingFailure('DB_INSTALL_FAILED', 'Cannot install database');
            } finally { if (is_file($temp)) unlink($temp); }
        }
        if (is_link($path)) hostingFailure('DB_UNSAFE_PATH', 'Database must not be a symlink');
        if (!is_file($path) || !is_writable($path)) hostingFailure('DB_FILE_NOT_WRITABLE', 'Private database is not writable by PHP');
        putenv('FORSAH_DB_PATH=' . $path);
        // Persistent random salt, never shipped in the downloadable archive.
        $saltPath = $private . '/ip-salt';
        if (!is_file($saltPath) && file_put_contents($saltPath, bin2hex(random_bytes(32))) === false) hostingFailure('DB_SALT_WRITE_FAILED', 'Cannot save private deployment salt');
        $salt = trim((string)file_get_contents($saltPath));
        if (strlen($salt) < 32) hostingFailure('DB_SALT_INVALID', 'Invalid deployment salt');
        if (!getenv('FORSAH_IP_HASH_SALT')) putenv('FORSAH_IP_HASH_SALT=' . $salt);
    } finally { flock($lock, LOCK_UN); fclose($lock); }
}

try {
    initializeHostingDatabase();
} catch (Throwable $error) {
    $reason = $error instanceof HostingSetupException ? $error->reason : 'DB_SETUP_UNEXPECTED';
    error_log('[forsah hosting][' . $reason . '] ' . $error->getMessage());
    if (PHP_SAPI === 'cli') { fwrite(STDERR, $error->getMessage() . "\n"); exit(1); }
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    $messages = [
        'DB_GUARD_SIGNAL_MISSING' => 'لم تصل علامة حماية .htaccess إلى PHP. استبدل .htaccess الجذري بالنسخة المرفقة، وتأكد من دعم الاستضافة له وتمرير متغيراته إلى PHP. لا تعطل الحماية.',
        'DB_GUARD_FILE_MISSING' => 'ملف database/.htaccess غير موجود. فعّل عرض الملفات المخفية وارفع الملف المرفق إلى database.',
        'DB_GUARD_FILE_UNREADABLE' => 'لا يستطيع PHP قراءة database/.htaccess. تحقق من ملكية الملف وصلاحيات قراءته.',
        'DB_GUARD_RULE_INVALID' => 'ملف database/.htaccess لا يطابق قاعدة الحظر الآمنة. استبدله بالملف المرفق؛ لا تحذف الحماية.',
        'DB_DIRECTORY_CREATE_FAILED' => 'تعذر إنشاء مجلد database. أنشئه داخل مجلد التطبيق مع صلاحية الكتابة لمستخدم PHP.',
        'DB_DIRECTORY_UNREADABLE' => 'لا يستطيع PHP الوصول إلى مجلد database. تحقق من ملكيته وصلاحياته.',
        'DB_DIRECTORY_NOT_WRITABLE' => 'مجلد database غير قابل للكتابة بواسطة PHP. صحح الملكية والصلاحيات من لوحة الاستضافة، ولا تستخدم 777.',
        'DB_LOCK_FAILED' => 'تعذر فتح ملف القفل داخل database. تحقق من قابلية كتابة المجلد وملف install.lock بواسطة PHP.',
        'DB_FILE_NOT_WRITABLE' => 'ملف database/forsah.sqlite غير قابل للكتابة بواسطة PHP. تحقق من ملكيته وصلاحياته.',
        'DB_UNSAFE_PATH' => 'مسار القاعدة غير آمن أو يستخدم رابطًا رمزيًا. استخدم مجلد database الحقيقي داخل التطبيق.',
        'DB_TEMP_CREATE_FAILED' => 'تعذر إنشاء ملف داخل database. تحقق من صلاحيات الكتابة ومساحة الاستضافة.',
        'DB_INSTALL_FAILED' => 'تعذر تجهيز ملف SQLite. تحقق من الصلاحيات والمساحة وسجل أخطاء PHP.',
        'DB_SALT_WRITE_FAILED' => 'تعذر كتابة ملف ip-salt داخل database. تحقق من صلاحياته ومساحة الاستضافة.',
        'DB_SALT_INVALID' => 'ملف ip-salt غير صالح أو لا يمكن قراءته. راجع سجل PHP وصلاحيات الملف؛ لا تحذف قاعدة البيانات.',
    ];
    echo json_encode(['ok'=>false, 'code'=>$reason, 'error'=>$messages[$reason] ?? 'تعذر إعداد قاعدة البيانات. راجع سجل PHP باستخدام رمز الخطأ المرفق.'], JSON_UNESCAPED_UNICODE);

    exit;
}
