<?php
declare(strict_types=1);

define('APP_ROOT', dirname(__DIR__));
define('APP_NAME', 'Sistem Informasi dan Generator Surat Digital Desa Sukakerta');

date_default_timezone_set(getenv('APP_TIMEZONE') ?: 'Asia/Jakarta');
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_name('sukakerta_session');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $https,
    'httponly' => true,
    'samesite' => 'Lax',
]);
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
if (isset($_SESSION['last_activity']) && time() - (int) $_SESSION['last_activity'] > 1800) {
    $_SESSION = [];
    session_regenerate_id(true);
}
$_SESSION['last_activity'] = time();

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
if ($https) {
    header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
}

function db(): PDO
{
    static $connection;
    if ($connection instanceof PDO) {
        return $connection;
    }

    $localConfig = APP_ROOT . '/config/local.php';
    $settings = is_file($localConfig) ? require $localConfig : [];
    $dsn = $settings['dsn'] ?? (getenv('DB_DSN') ?: 'mysql:host=127.0.0.1;dbname=sukakerta;charset=utf8mb4');
    $username = $settings['username'] ?? (getenv('DB_USER') ?: '');
    $password = $settings['password'] ?? (getenv('DB_PASSWORD') ?: '');
    $connection = new PDO($dsn, $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $connection;
}

function json_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function request_data(): array
{
    $data = json_decode(file_get_contents('php://input') ?: '', true);
    return is_array($data) ? $data : $_POST;
}

function current_user(): ?array
{
    if (empty($_SESSION['user_id'])) {
        return null;
    }
    $query = db()->prepare('SELECT u.id, u.email, u.full_name, u.status, r.role_key, r.name AS role_name
        FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND u.status = "active"');
    $query->execute([$_SESSION['user_id']]);
    $user = $query->fetch();
    if (!$user) {
        unset($_SESSION['user_id']);
        return null;
    }
    return $user;
}

function require_user(): array
{
    $user = current_user();
    if (!$user) {
        json_response(['error' => 'Silakan masuk untuk melanjutkan.'], 401);
    }
    return $user;
}

function can(array $user, string $permission): bool
{
    if ($user['role_key'] === 'super_admin') {
        return true;
    }
    $query = db()->prepare('SELECT 1 FROM user_permissions up
        JOIN permissions p ON p.id = up.permission_id
        WHERE up.user_id = ? AND p.permission_key = ? LIMIT 1');
    $query->execute([$user['id'], $permission]);
    return (bool) $query->fetchColumn();
}

function require_permission(array $user, string $permission): void
{
    if (!can($user, $permission)) {
        json_response(['error' => 'Anda tidak memiliki izin untuk tindakan ini.'], 403);
    }
}

function require_csrf(): void
{
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!isset($_SESSION['csrf_token']) || !hash_equals($_SESSION['csrf_token'], $token)) {
        json_response(['error' => 'Sesi formulir berakhir. Muat ulang halaman dan coba lagi.'], 419);
    }
}

function audit(PDO $connection, ?int $actorId, string $action, string $entity, ?int $entityId, array $details = []): void
{
    $query = $connection->prepare('INSERT INTO audit_logs (actor_id, action_key, entity_type, entity_id, details_json, ip_hash)
        VALUES (?, ?, ?, ?, ?, ?)');
    $query->execute([
        $actorId,
        $action,
        $entity,
        $entityId,
        json_encode($details, JSON_UNESCAPED_UNICODE),
        hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown'),
    ]);
}

function notify(PDO $connection, int $userId, string $title, string $message, ?int $applicationId = null): void
{
    $query = $connection->prepare('INSERT INTO notifications (user_id, application_id, title, message) VALUES (?, ?, ?, ?)');
    $query->execute([$userId, $applicationId, $title, $message]);
}