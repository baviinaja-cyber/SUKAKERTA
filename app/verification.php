<?php
declare(strict_types=1);

$token = $match[1];
$valid = false;
$details = null;
try {
    $connection = db();
    $bucket = hash('sha256', 'verify|' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    $connection->prepare('INSERT IGNORE INTO rate_limits (bucket_key, attempts, window_started_at) VALUES (?, 0, NOW())')->execute([$bucket]);
    $connection->prepare('UPDATE rate_limits SET attempts = IF(window_started_at < DATE_SUB(NOW(), INTERVAL 1 HOUR), 1, attempts + 1), window_started_at = IF(window_started_at < DATE_SUB(NOW(), INTERVAL 1 HOUR), NOW(), window_started_at) WHERE bucket_key = ?')->execute([$bucket]);
    $limit = $connection->prepare('SELECT attempts, blocked_until FROM rate_limits WHERE bucket_key = ?');
    $limit->execute([$bucket]);
    $rate = $limit->fetch();
    if ((int) $rate['attempts'] > 30) {
        $connection->prepare('UPDATE rate_limits SET blocked_until = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE bucket_key = ?')->execute([$bucket]);
    } elseif (empty($rate['blocked_until']) || strtotime($rate['blocked_until']) < time()) {
        $query = $connection->prepare('SELECT l.letter_number, t.name AS type_name, l.issued_at, l.status, p.revoked_at
            FROM letter_verification_tokens v JOIN letters l ON l.id = v.letter_id JOIN letter_applications a ON a.id = l.application_id
            JOIN letter_types t ON t.id = a.letter_type_id LEFT JOIN letter_publications p ON p.letter_id = l.id AND p.revoked_at IS NULL
            WHERE v.token_hash = ? AND v.revoked_at IS NULL LIMIT 1');
        $query->execute([hash('sha256', $token)]);
        $details = $query->fetch();
        $valid = $details && $details['status'] === 'issued' && $details['revoked_at'] === null;
    }
} catch (Throwable $error) {
    error_log('[sukakerta verification] ' . $error->getMessage());
}
?><!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Verifikasi dokumen · Desa Sukakerta</title><link rel="stylesheet" href="/assets/css/app.css"></head>
<body><main class="auth-wrap verify-card"><section class="auth-form"><div class="eyebrow">PEMERINTAH DESA SUKAKERTA</div><h1><?= $valid ? 'Dokumen terverifikasi' : 'Dokumen tidak dapat diverifikasi' ?></h1><p><?= $valid ? 'Informasi berikut cocok dengan catatan penerbitan.' : 'Token tidak valid, dokumen dibatalkan, atau layanan verifikasi sedang tidak tersedia.' ?></p><?php if ($valid): ?><div class="detail-list"><div class="detail-item"><span>Nomor surat</span><strong><?= htmlspecialchars($details['letter_number'], ENT_QUOTES, 'UTF-8') ?></strong></div><div class="detail-item"><span>Jenis surat</span><strong><?= htmlspecialchars($details['type_name'], ENT_QUOTES, 'UTF-8') ?></strong></div><div class="detail-item"><span>Tanggal terbit</span><strong><?= htmlspecialchars(date('d-m-Y', strtotime($details['issued_at'])), ENT_QUOTES, 'UTF-8') ?></strong></div><div class="detail-item"><span>Status</span><strong><?= $details['revoked_at'] === null ? 'Berlaku' : 'Dibatalkan' ?></strong></div></div><?php endif; ?><p class="hero-note">Halaman verifikasi hanya menampilkan informasi minimum dan tidak menampilkan data pribadi pemohon.</p></section></main></body></html>