<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if (str_starts_with($path, '/api/')) {
    require dirname(__DIR__) . '/app/api.php';
    exit;
}

if (preg_match('#^/verifikasi/([a-f0-9]{64})$#', $path, $match)) {
    require dirname(__DIR__) . '/app/verification.php';
    exit;
}

require dirname(__DIR__) . '/app/page.php';