<?php
declare(strict_types=1);
// Internal storage is allowed ONLY for the guarded drop-in database path.
function protectedHostingDatabase(string $path): bool {
    $directory = __DIR__ . '/database';
    $marker = $_SERVER['FORSAH_PROTECTED_DATABASE'] ?? $_SERVER['REDIRECT_FORSAH_PROTECTED_DATABASE'] ?? getenv('FORSAH_PROTECTED_DATABASE');
    return is_file(__DIR__ . '/hosting-auto.php')
        && !is_link($directory) && !is_link($path)
        && realpath(dirname($path)) === realpath($directory)
        && basename($path) === 'forsah.sqlite'
        && is_file($directory . '/.htaccess')
        && trim((string)file_get_contents($directory . '/.htaccess')) === 'Require all denied'
        && (PHP_SAPI === 'cli' || $marker === '1');
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
