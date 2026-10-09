<?php
// Copy to /home/YOUR_ACCOUNT/forsah-private/config.php (outside public_html).
return [
    // For an existing installation, point to the EXISTING database after backing it up.
    'FORSAH_DB_PATH' => '/home/YOUR_ACCOUNT/forsah-private/forsah.sqlite',
    'FORSAH_CORS_ORIGINS' => 'https://t3lam.site,https://localhost',
    // Replace with a random deployment-specific string; never publish this file.
    'FORSAH_IP_HASH_SALT' => 'REPLACE_WITH_RANDOM_DEPLOYMENT_SALT',
];
