<?php
declare(strict_types=1);

$_SESSION['csrf_token'] ??= bin2hex(random_bytes(32));
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$publicRoutes = ['/', '/login', '/register'];
$isPublic = in_array($path, $publicRoutes, true);
$title = $isPublic ? 'Layanan Warga' : 'Ruang Kerja Pemerintahan';
?><!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#102d3c">
  <title><?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?> · Desa Sukakerta</title>
  <link rel="stylesheet" href="/assets/css/app.css">
  <script src="/assets/js/app.js" defer></script>
</head>
<body class="<?= $isPublic ? 'portal-mode' : 'panel-mode' ?>" data-path="<?= htmlspecialchars($path, ENT_QUOTES, 'UTF-8') ?>">
<?php require APP_ROOT . '/app/views/layouts/portal.php'; ?>
<?php require APP_ROOT . '/app/views/layouts/panel.php'; ?>
<div class="toast-region" id="toast-region" aria-live="polite"></div>
</body>
</html>