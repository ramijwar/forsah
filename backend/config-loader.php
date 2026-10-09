<?php
declare(strict_types=1);
// Configuration stays outside the public web root, never in the APK.
$configPath = getenv('FORSAH_CONFIG_PATH') ?: dirname(__DIR__, 2) . '/forsah-private/config.php';
if (is_file($configPath)) {
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
