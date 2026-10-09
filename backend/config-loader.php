<?php
declare(strict_types=1);
// Fail closed, but distinguish protection failures without disclosing host paths.
function hostingDatabaseProtectionIssue(string $path): ?string {
    $directory = __DIR__ . '/database';
    if (!is_file(__DIR__ . '/hosting-auto.php') || is_link($directory) || is_link($path)
        || realpath(dirname($path)) !== realpath($directory) || basename($path) !== 'forsah.sqlite') {
        return 'DB_UNSAFE_PATH';
    }
    $guard = $directory . '/.htaccess';
    if (!is_file($guard)) return 'DB_GUARD_FILE_MISSING';
    if (!is_readable($guard)) return 'DB_GUARD_FILE_UNREADABLE';
    $content = (string)file_get_contents($guard);
    // Editors may add a UTF-8 BOM, comments or CRLF; these do not change the rule.
    $content = preg_replace('/^\xEF\xBB\xBF/', '', $content);
    $lines = array_filter(array_map('trim', explode("\n", $content)), fn($line) => $line !== '' && !str_starts_with($line, '#'));
    if (count($lines) !== 1 || !preg_match('/^Require\s+all\s+denied$/i', array_values($lines)[0])) return 'DB_GUARD_RULE_INVALID';
    if (PHP_SAPI === 'cli') return null;
    // Apache internal redirects can prefix variables more than once. Never
    // accept HTTP_* request headers as proof of protection.
    foreach ($_SERVER as $key => $value) {
        if (preg_match('/^(REDIRECT_)*FORSAH_PROTECTED_DATABASE$/', $key) && $value === '1') return null;
    }
    $environmentKey = 'FORSAH_PROTECTED_DATABASE';
    for ($redirects = 0; $redirects <= 8; $redirects++) {
        if (getenv($environmentKey) === '1') return null;
        $environmentKey = 'REDIRECT_' . $environmentKey;
    }
    return 'DB_GUARD_SIGNAL_MISSING';
}
function protectedHostingDatabase(string $path): bool {
    return hostingDatabaseProtectionIssue($path) === null;
}
// Explicit configuration is respected. The local hosting package must not
// silently continue using an old auto-discovered external config.
$configPath = getenv('FORSAH_CONFIG_PATH') ?: dirname(__DIR__, 2) . '/forsah-private/config.php';
if (is_file($configPath) && (getenv('FORSAH_CONFIG_PATH') || !is_file(__DIR__ . '/hosting-auto.php'))) {
    $config = require $configPath;
    if (!is_array($config)) throw new RuntimeException('Invalid private configuration');
    foreach (['FORSAH_DB_PATH','FORSAH_CORS_ORIGINS','FORSAH_IP_HASH_SALT'] as $key) {
        if (isset($config[$key]) && is_string($config[$key])) putenv($key.'='.$config[$key]);
    }
}
// Present only in the ready-to-extract hosting bundle. Explicit/private
// configuration takes precedence over automatic initialization.
if (!getenv('FORSAH_DB_PATH') && is_file(__DIR__ . '/hosting-auto.php')) {
    require_once __DIR__ . '/hosting-auto.php';
}
if (empty($_SERVER['HTTP_AUTHORIZATION']) && !empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
    $_SERVER['HTTP_AUTHORIZATION'] = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
}
