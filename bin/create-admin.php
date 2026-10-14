<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/app/bootstrap.php';

$email = strtolower(trim((string) getenv('ADMIN_EMAIL')));
$name = trim((string) (getenv('ADMIN_NAME') ?: 'Administrator Desa Sukakerta'));
$roleKey = getenv('ADMIN_ROLE') ?: 'super_admin';
$password = (string) getenv('ADMIN_PASSWORD');

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 14 || !in_array($roleKey, ['super_admin','staff'], true)) {
    fwrite(STDERR, "Set ADMIN_EMAIL, ADMIN_PASSWORD (minimal 14 karakter), dan ADMIN_ROLE=super_admin|staff sebelum menjalankan skrip.\n");
    exit(2);
}

try {
    $connection = db();
    $roleQuery = $connection->prepare('SELECT id FROM roles WHERE role_key = ?');
    $roleQuery->execute([$roleKey]);
    $roleId = $roleQuery->fetchColumn();
    if (!$roleId) throw new RuntimeException('Role belum tersedia. Impor database/schema.sql terlebih dahulu.');

    $algorithm = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
    $insert = $connection->prepare('INSERT INTO users (role_id, email, full_name, password_hash, status, email_verified_at) VALUES (?, ?, ?, ?, "active", NOW())');
    $insert->execute([$roleId, $email, $name, password_hash($password, $algorithm)]);
    $userId = (int) $connection->lastInsertId();

    if ($roleKey === 'staff') {
        $permissions = $connection->query("SELECT id FROM permissions WHERE permission_key <> 'users.manage'")->fetchAll(PDO::FETCH_COLUMN);
        $grant = $connection->prepare('INSERT INTO user_permissions (user_id, permission_id, granted_by) VALUES (?, ?, ?)');
        foreach ($permissions as $permissionId) $grant->execute([$userId, $permissionId, $userId]);
    }
    fwrite(STDOUT, 'Akun ' . $roleKey . ' dibuat: ' . $email . "\n");
} catch (Throwable $error) {
    fwrite(STDERR, 'Gagal membuat akun: ' . $error->getMessage() . "\n");
    exit(1);
}