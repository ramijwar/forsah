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
