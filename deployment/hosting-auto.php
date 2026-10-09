<?php
declare(strict_types=1);

/** Drop-in package only: the public seed is never the live database. */
function initializeHostingDatabase(): void {
    if (getenv('FORSAH_DB_PATH')) return;
    $configuredRoot = getenv('FORSAH_WEB_ROOT') ?: ($_SERVER['DOCUMENT_ROOT'] ?? '');
    $root = $configuredRoot !== '' ? realpath($configuredRoot) : false;
    if (!$root || $root === DIRECTORY_SEPARATOR) {
        // CLI helper, normally installed in public_html/forsah.
        $root = realpath(dirname(__DIR__));
    }
    if (!$root) throw new RuntimeException('Cannot determine hosting document root');
    $boundary = $root;
    // A subdomain can live below public_html; do not create its private DB in
    // a directory still accessible through the primary domain.
    for ($dir = $root; dirname($dir) !== $dir; $dir = dirname($dir)) {
        if (in_array(strtolower(basename($dir)), ['public_html','httpdocs','htdocs','wwwroot'], true)) $boundary = $dir;
    }
    $private = dirname($boundary) . '/forsah-private';
    if (is_link($private)) throw new RuntimeException('Private database directory must not be a symlink');
    umask(0077);
    if (!is_dir($private) && !@mkdir($private, 0700, true) && !is_dir($private)) {
        throw new RuntimeException('Cannot create private database directory. Configure FORSAH_DB_PATH outside the public web root.');
    }
    $private = realpath($private);
    if (!$private || str_starts_with($private . '/', rtrim($boundary, '/') . '/')) throw new RuntimeException('Unsafe private database path');
    $path = $private . '/forsah.sqlite';
    $lock = @fopen($private . '/install.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) throw new RuntimeException('Cannot lock database initialization');
    try {
        if (!file_exists($path)) {
            // Do not silently create a fresh identity store when upgrading a
            // legacy installation. Point at/migrate its DB explicitly instead.
            foreach ([__DIR__.'/var/forsah.sqlite', dirname(__DIR__).'/var/forsah.sqlite', __DIR__.'/database/forsah.sqlite'] as $legacy) {
                if (is_file($legacy)) throw new RuntimeException('Existing legacy database detected. Configure FORSAH_DB_PATH; do not replace your users.');
            }
            $seed = __DIR__ . '/database/forsah.seed.sqlite';
            if (!is_file($seed)) throw new RuntimeException('Database seed missing; extract the complete hosting ZIP');
            $temp = tempnam($private, '.install-');
            if ($temp === false) throw new RuntimeException('Cannot create database file');
            try {
                if (!copy($seed, $temp) || !chmod($temp, 0600) || !rename($temp, $path)) throw new RuntimeException('Cannot install database');
            } finally { if (is_file($temp)) unlink($temp); }
        }
        if (is_link($path)) throw new RuntimeException('Database must not be a symlink');
        if (!is_file($path) || !is_writable($path)) throw new RuntimeException('Private database is not writable by PHP');
        putenv('FORSAH_DB_PATH=' . $path);
        // Persistent random salt, never shipped in the downloadable archive.
        $saltPath = $private . '/ip-salt';
        if (!is_file($saltPath) && file_put_contents($saltPath, bin2hex(random_bytes(32))) === false) throw new RuntimeException('Cannot save private deployment salt');
        $salt = trim((string)file_get_contents($saltPath));
        if (strlen($salt) < 32) throw new RuntimeException('Invalid deployment salt');
        if (!getenv('FORSAH_IP_HASH_SALT')) putenv('FORSAH_IP_HASH_SALT=' . $salt);
    } finally { flock($lock, LOCK_UN); fclose($lock); }
}

try {
    initializeHostingDatabase();
} catch (Throwable $error) {
    error_log('[forsah hosting] ' . $error->getMessage());
    if (PHP_SAPI === 'cli') { fwrite(STDERR, $error->getMessage() . "\n"); exit(1); }
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['ok'=>false, 'error'=>'تعذر إعداد قاعدة البيانات الخاصة. راجع سجل PHP وملف INSTALL.txt؛ يلزم مسار قابل للكتابة خارج المجلد العام.'], JSON_UNESCAPED_UNICODE);
    exit;
}
