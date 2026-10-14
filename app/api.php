<?php
declare(strict_types=1);

header('Cache-Control: no-store');
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$data = request_data();

function take_rate_limit(PDO $connection, string $key, int $limit, int $seconds): void
{
    $bucket = hash('sha256', $key . '|' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    $connection->beginTransaction();
    try {
        $connection->prepare('INSERT IGNORE INTO rate_limits (bucket_key, attempts, window_started_at) VALUES (?, 0, NOW())')->execute([$bucket]);
        $query = $connection->prepare('SELECT attempts, window_started_at, blocked_until FROM rate_limits WHERE bucket_key = ? FOR UPDATE');
        $query->execute([$bucket]);
        $row = $query->fetch();
        if (!empty($row['blocked_until']) && strtotime($row['blocked_until']) > time()) {
            $connection->rollBack();
            json_response(['error' => 'Terlalu banyak percobaan. Coba lagi nanti.'], 429);
        }
        $expired = strtotime($row['window_started_at']) < time() - $seconds;
        $attempts = $expired ? 0 : (int) $row['attempts'];
        $attempts++;
        $blocked = $attempts >= $limit ? date('Y-m-d H:i:s', time() + $seconds) : null;
        $update = $connection->prepare('UPDATE rate_limits SET attempts = ?, window_started_at = ?, blocked_until = ? WHERE bucket_key = ?');
        $update->execute([$attempts, $expired ? date('Y-m-d H:i:s') : $row['window_started_at'], $blocked, $bucket]);
        $connection->commit();
    } catch (Throwable $error) {
        if ($connection->inTransaction()) $connection->rollBack();
        throw $error;
    }
}

function allocate_number(PDO $connection, string $key, string $format): string
{
    $connection->prepare('INSERT IGNORE INTO number_sequences (sequence_key, current_value) VALUES (?, 0)')->execute([$key]);
    $query = $connection->prepare('SELECT current_value FROM number_sequences WHERE sequence_key = ? FOR UPDATE');
    $query->execute([$key]);
    $number = (int) $query->fetchColumn() + 1;
    $connection->prepare('UPDATE number_sequences SET current_value = ? WHERE sequence_key = ?')->execute([$number, $key]);
    return strtr($format, [
        '{SEQ}' => str_pad((string) $number, 4, '0', STR_PAD_LEFT),
        '{MONTH}' => strtoupper(date('M')),
        '{YEAR}' => date('Y'),
    ]);
}

function validate_dynamic_fields(array $schema, mixed $input): array
{
    if (!is_array($input)) json_response(['error' => 'Data formulir tidak valid.'], 422);
    $definitions = $schema['fields'] ?? [];
    $allowedKeys = array_column($definitions, 'key');
    if (array_diff(array_keys($input), $allowedKeys)) json_response(['error' => 'Formulir memuat field yang tidak dikenal.'], 422);
    $validated = [];
    foreach ($definitions as $field) {
        $key = (string) ($field['key'] ?? '');
        $raw = $input[$key] ?? '';
        if (!is_scalar($raw)) json_response(['error' => 'Nilai formulir tidak valid.'], 422);
        $value = trim((string) $raw);
        if (!empty($field['required']) && $value === '') json_response(['error' => 'Field wajib belum diisi: ' . ($field['label'] ?? $key)], 422);
        if (mb_strlen($value) > 4000) json_response(['error' => 'Isian terlalu panjang.'], 422);
        if ($value !== '' && ($field['type'] ?? '') === 'date') {
            $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
            if (!$date || $date->format('Y-m-d') !== $value) json_response(['error' => 'Format tanggal tidak valid.'], 422);
        }
        if ($value !== '' && ($field['type'] ?? '') === 'number' && !is_numeric($value)) json_response(['error' => 'Nilai harus berupa angka.'], 422);
        if ($value !== '' && ($field['type'] ?? '') === 'select' && !in_array($value, $field['options'] ?? [], true)) json_response(['error' => 'Pilihan formulir tidak valid.'], 422);
        $validated[$key] = $value;
    }
    return $validated;
}

try {
    if ($path === '/api/session' && $method === 'GET') {
        $_SESSION['csrf_token'] ??= bin2hex(random_bytes(32));
        json_response(['csrf' => $_SESSION['csrf_token'], 'user' => empty($_SESSION['user_id']) ? null : current_user()]);
    }

    if ($method !== 'GET' && $method !== 'HEAD') require_csrf();
    $connection = db();

    if ($path === '/api/login' && $method === 'POST') {
        take_rate_limit($connection, 'login', 8, 900);
        $email = mb_strtolower(trim((string) ($data['email'] ?? '')));
        $query = $connection->prepare('SELECT id, password_hash, status FROM users WHERE email = ? LIMIT 1');
        $query->execute([$email]);
        $account = $query->fetch();
        if (!$account || !password_verify((string) ($data['password'] ?? ''), $account['password_hash']) || $account['status'] !== 'active') {
            usleep(250000);
            json_response(['error' => 'Email atau kata sandi tidak cocok, atau akun belum aktif.'], 401);
        }
        session_regenerate_id(true);
        $_SESSION['user_id'] = (int) $account['id'];
        $_SESSION['last_activity'] = time();
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        $connection->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?')->execute([$account['id']]);
        audit($connection, (int) $account['id'], 'login', 'user', (int) $account['id']);
        json_response(['ok' => true, 'user' => current_user()]);
    }

    if ($path === '/api/register' && $method === 'POST') {
        take_rate_limit($connection, 'register', 5, 3600);
        $nik = trim((string) ($data['nik'] ?? ''));
        $kk = trim((string) ($data['family_card_number'] ?? ''));
        $email = mb_strtolower(trim((string) ($data['email'] ?? '')));
        $password = (string) ($data['password'] ?? '');
        $required = ['full_name','birth_place','birth_date','gender','marital_status','religion','occupation','address','rt','rw','hamlet','whatsapp'];
        foreach ($required as $field) {
            if (trim((string) ($data[$field] ?? '')) === '') json_response(['error' => 'Semua data wajib harus diisi.'], 422);
        }
        if (!preg_match('/^\d{16}$/', $nik) || !preg_match('/^\d{16}$/', $kk)) json_response(['error' => 'NIK dan nomor KK harus terdiri dari 16 digit.'], 422);
        $birthDate = DateTimeImmutable::createFromFormat('!Y-m-d', (string) $data['birth_date']);
        if (!$birthDate || $birthDate->format('Y-m-d') !== $data['birth_date'] || $birthDate > new DateTimeImmutable('today')) json_response(['error' => 'Tanggal lahir tidak valid.'], 422);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_response(['error' => 'Format email tidak valid.'], 422);
        if (strlen($password) < 10 || $password !== (string) ($data['password_confirmation'] ?? '')) json_response(['error' => 'Kata sandi minimal 10 karakter dan konfirmasi harus sama.'], 422);
        if (!in_array($data['gender'] ?? '', ['L','P'], true)) json_response(['error' => 'Jenis kelamin tidak valid.'], 422);
        $hashAlgorithm = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
        $connection->beginTransaction();
        try {
            $roleId = $connection->query("SELECT id FROM roles WHERE role_key = 'resident'")->fetchColumn();
            $insert = $connection->prepare('INSERT INTO users (role_id, email, nik, full_name, password_hash, status) VALUES (?, ?, ?, ?, ?, "pending")');
            $insert->execute([$roleId, $email, $nik, trim($data['full_name']), password_hash($password, $hashAlgorithm)]);
            $userId = (int) $connection->lastInsertId();
            $profile = $connection->prepare('INSERT INTO resident_profiles
                (user_id, family_card_number, birth_place, birth_date, gender, marital_status, religion, occupation, citizenship, address, rt, rw, hamlet, whatsapp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $profile->execute([$userId, $kk, trim($data['birth_place']), $data['birth_date'], $data['gender'], trim($data['marital_status']), trim($data['religion']), trim($data['occupation']), trim((string) ($data['citizenship'] ?? 'WNI')), trim($data['address']), trim($data['rt']), trim($data['rw']), trim($data['hamlet']), trim($data['whatsapp'])]);
            audit($connection, $userId, 'resident.registered', 'user', $userId, ['verification' => 'pending']);
            $connection->commit();
            json_response(['ok' => true, 'message' => 'Registrasi diterima. Akun menunggu aktivasi petugas dan verifikasi identitas di kantor desa.'], 201);
        } catch (PDOException $error) {
            if ($connection->inTransaction()) $connection->rollBack();
            if ($error->getCode() === '23000') json_response(['error' => 'NIK atau email sudah terdaftar.'], 409);
            throw $error;
        }
    }

    if ($path === '/api/logout' && $method === 'POST') {
        $actor = current_user();
        if ($actor) audit($connection, (int) $actor['id'], 'logout', 'user', (int) $actor['id']);
        $_SESSION = [];
        session_regenerate_id(true);
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        $_SESSION['last_activity'] = time();
        json_response(['ok' => true, 'csrf' => $_SESSION['csrf_token']]);
    }

    if ($path === '/api/letter-types' && $method === 'GET') {
        $rows = $connection->query('SELECT id, type_key, name, description, form_schema FROM letter_types WHERE active = 1 ORDER BY name')->fetchAll();
        foreach ($rows as &$row) $row['form_schema'] = json_decode($row['form_schema'], true);
        json_response(['items' => $rows]);
    }

    $user = require_user();

    if ($path === '/api/templates' && $method === 'GET') {
        require_permission($user, 'templates.manage');
        $query = $connection->query('SELECT t.id, t.letter_type_id, t.name, t.status, t.current_version, lt.name AS type_name
            FROM letter_templates t JOIN letter_types lt ON lt.id = t.letter_type_id ORDER BY t.updated_at DESC');
        json_response(['items' => $query->fetchAll()]);
    }

    if (preg_match('#^/api/templates/(\\d+)$#', $path, $match) && $method === 'GET') {
        require_permission($user, 'templates.manage');
        $query = $connection->prepare('SELECT t.id, t.letter_type_id, t.name, t.status, v.id AS version_id, v.version_number, v.page_settings
            FROM letter_templates t JOIN letter_template_versions v ON v.template_id = t.id AND v.version_number = t.current_version WHERE t.id = ?');
        $query->execute([(int) $match[1]]);
        $template = $query->fetch();
        if (!$template) json_response(['error' => 'Template tidak ditemukan.'], 404);
        $elements = $connection->prepare('SELECT page_number, element_order, element_type, content, position_json, style_json FROM letter_template_elements WHERE template_version_id = ? ORDER BY page_number, element_order');
        $elements->execute([$template['version_id']]);
        $template['page_settings'] = json_decode($template['page_settings'], true);
        $template['elements'] = array_map(static function (array $row): array {
            $row['position_json'] = json_decode($row['position_json'], true);
            $row['style_json'] = json_decode($row['style_json'], true);
            return $row;
        }, $elements->fetchAll());
        json_response(['item' => $template]);
    }

    $isTemplateCreate = $path === '/api/templates' && $method === 'POST';
    $isTemplateUpdate = preg_match('#^/api/templates/(\\d+)$#', $path, $templateMatch) && $method === 'PUT';
    if ($isTemplateCreate || $isTemplateUpdate) {
        require_permission($user, 'templates.manage');
        $templateId = $isTemplateUpdate ? (int) $templateMatch[1] : 0;
        $typeId = (int) ($data['letter_type_id'] ?? 0);
        $templateName = trim((string) ($data['name'] ?? ''));
        $elements = $data['elements'] ?? null;
        if ($templateName === '' || mb_strlen($templateName) > 160 || !is_array($elements) || count($elements) < 1 || count($elements) > 150) json_response(['error' => 'Nama dan isi template tidak valid.'], 422);
        $connection->beginTransaction();
        try {
            if ($isTemplateCreate) {
                $typeQuery = $connection->prepare('SELECT id FROM letter_types WHERE id = ? AND active = 1');
                $typeQuery->execute([$typeId]);
                if (!$typeQuery->fetchColumn()) json_response(['error' => 'Jenis surat tidak tersedia.'], 422);
                $connection->prepare('INSERT INTO letter_templates (letter_type_id, name, updated_by) VALUES (?, ?, ?)')->execute([$typeId, $templateName, $user['id']]);
                $templateId = (int) $connection->lastInsertId();
                $version = 1;
            } else {
                $lock = $connection->prepare('SELECT current_version FROM letter_templates WHERE id = ? FOR UPDATE');
                $lock->execute([$templateId]);
                $currentVersion = $lock->fetchColumn();
                if (!$currentVersion) json_response(['error' => 'Template tidak ditemukan.'], 404);
                $version = (int) $currentVersion + 1;
                $connection->prepare('UPDATE letter_templates SET name = ?, current_version = ?, updated_by = ? WHERE id = ?')->execute([$templateName, $version, $user['id'], $templateId]);
            }
            $settings = $data['page_settings'] ?? [];
            $pageSettings = ['orientation' => ($settings['orientation'] ?? '') === 'landscape' ? 'landscape' : 'portrait', 'margin' => max(5, min(45, (int) ($settings['margin'] ?? 22))), 'page_count' => max(1, min(12, (int) ($settings['page_count'] ?? 1)))];
            $connection->prepare('INSERT INTO letter_template_versions (template_id, version_number, page_settings, created_by) VALUES (?, ?, ?, ?)')->execute([$templateId, $version, json_encode($pageSettings), $user['id']]);
            $versionId = (int) $connection->lastInsertId();
            $insertElement = $connection->prepare('INSERT INTO letter_template_elements (template_version_id, page_number, element_order, element_type, content, position_json, style_json) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $allowedTypes = ['heading','text','variable','line','sign','table','image','qr','page_number'];
            foreach ($elements as $order => $element) {
                if (!is_array($element) || !in_array($element['type'] ?? '', $allowedTypes, true)) json_response(['error' => 'Tipe elemen template tidak diizinkan.'], 422);
                $page = max(1, min(12, (int) ($element['page'] ?? 1)));
                $position = ['x' => max(0, min(1200, (int) ($element['x'] ?? 0))), 'y' => max(0, min(1600, (int) ($element['y'] ?? 0)))];
                $style = ['font_size' => max(8, min(48, (int) ($element['font_size'] ?? 12)))];
                $content = mb_substr((string) ($element['content'] ?? ''), 0, 6000);
                $insertElement->execute([$versionId, $page, $order, $element['type'], $content, json_encode($position), json_encode($style)]);
            }
            audit($connection, (int) $user['id'], 'template.saved', 'template', $templateId, ['version' => $version]);
            $connection->commit();
            json_response(['ok' => true, 'template_id' => $templateId, 'version' => $version], $isTemplateCreate ? 201 : 200);
        } catch (Throwable $error) {
            if ($connection->inTransaction()) $connection->rollBack();
            throw $error;
        }
    }

    if ($path === '/api/dashboard' && $method === 'GET') {
        $isStaff = $user['role_key'] !== 'resident';
        if ($isStaff) require_permission($user, 'applications.read');
        $where = $isStaff ? '' : ' WHERE resident_id = ' . (int) $user['id'];
        $statusRows = $connection->query('SELECT status, COUNT(*) AS total FROM letter_applications' . $where . ' GROUP BY status')->fetchAll();
        $counts = array_fill_keys(['submitted','checking','waiting_documents','waiting_office','verifying','revision','approved','ready_to_issue','issued','rejected'], 0);
        foreach ($statusRows as $row) $counts[$row['status']] = (int) $row['total'];
        if ($isStaff) {
            $residentCounts = $connection->query('SELECT COUNT(*) AS residents, SUM(u.status = "pending") AS pending_accounts FROM users u JOIN roles r ON r.id = u.role_id WHERE r.role_key = "resident"')->fetch();
            $counts['residents'] = (int) $residentCounts['residents'];
            $counts['pending_accounts'] = (int) $residentCounts['pending_accounts'];
        }
        $query = $connection->prepare('SELECT a.id, a.application_no, a.status, a.submitted_at, t.name AS type_name,
            r.full_name, lr.register_number FROM letter_applications a JOIN letter_types t ON t.id = a.letter_type_id
            JOIN users r ON r.id = a.resident_id LEFT JOIN letter_registers lr ON lr.application_id = a.id' . $where . ' ORDER BY a.submitted_at DESC LIMIT 12');
        $query->execute();
        $notifications = $connection->prepare('SELECT id, title, message, created_at FROM notifications WHERE user_id = ? AND read_at IS NULL ORDER BY created_at DESC LIMIT 8');
        $notifications->execute([$user['id']]);
        json_response(['counts' => $counts, 'applications' => $query->fetchAll(), 'notifications' => $notifications->fetchAll()]);
    }

    if ($path === '/api/applications' && $method === 'GET') {
        $isStaff = $user['role_key'] !== 'resident';
        if ($isStaff) require_permission($user, 'applications.read');
        $sql = 'SELECT a.id, a.application_no, a.status, a.submitted_at, a.updated_at, t.name AS type_name,
            u.full_name, lr.register_number FROM letter_applications a JOIN letter_types t ON t.id = a.letter_type_id
            JOIN users u ON u.id = a.resident_id LEFT JOIN letter_registers lr ON lr.application_id = a.id';
        if (!$isStaff) $sql .= ' WHERE a.resident_id = ' . (int) $user['id'];
        $sql .= ' ORDER BY a.submitted_at DESC LIMIT 100';
        json_response(['items' => $connection->query($sql)->fetchAll()]);
    }

    if ($path === '/api/letters' && $method === 'GET') {
        $isStaff = $user['role_key'] !== 'resident';
        if ($isStaff) require_permission($user, 'applications.read');
        $sql = 'SELECT l.id, l.letter_number, l.status, l.issued_at, a.id AS application_id, a.application_no,
            t.name AS type_name, u.full_name, lr.register_number FROM letters l
            JOIN letter_applications a ON a.id = l.application_id JOIN letter_types t ON t.id = a.letter_type_id
            JOIN users u ON u.id = a.resident_id LEFT JOIN letter_registers lr ON lr.application_id = a.id';
        if (!$isStaff) $sql .= ' WHERE a.resident_id = ' . (int) $user['id'];
        $sql .= ' ORDER BY l.issued_at DESC LIMIT 100';
        json_response(['items' => $connection->query($sql)->fetchAll()]);
    }

    if ($path === '/api/applications' && $method === 'POST') {
        if ($user['role_key'] !== 'resident') json_response(['error' => 'Pengajuan hanya dapat dibuat dari akun penduduk.'], 403);
        $typeQuery = $connection->prepare('SELECT id, type_key, register_format, form_schema FROM letter_types WHERE id = ? AND active = 1');
        $typeQuery->execute([(int) ($data['letter_type_id'] ?? 0)]);
        $type = $typeQuery->fetch();
        if (!$type) json_response(['error' => 'Jenis surat tidak tersedia.'], 422);
        $schema = json_decode($type['form_schema'], true) ?: ['fields' => []];
        $fields = validate_dynamic_fields($schema, $data['fields'] ?? null);
        $connection->beginTransaction();
        try {
            $applicationNo = 'SKT-' . date('ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
            $insert = $connection->prepare('INSERT INTO letter_applications (application_no, resident_id, letter_type_id) VALUES (?, ?, ?)');
            $insert->execute([$applicationNo, $user['id'], $type['id']]);
            $applicationId = (int) $connection->lastInsertId();
            $fieldsJson = json_encode($fields, JSON_UNESCAPED_UNICODE);
            $connection->prepare('INSERT INTO letter_application_data (application_id, data_json) VALUES (?, ?)')->execute([$applicationId, $fieldsJson]);
            $connection->prepare('INSERT INTO letter_application_versions (application_id, version_number, data_json, reason, edited_by) VALUES (?, 1, ?, "Pengajuan awal", ?)')->execute([$applicationId, $fieldsJson, $user['id']]);
            $period = date('Y');
            $registerNo = allocate_number($connection, 'register:' . $period, $type['register_format']);
            $connection->prepare('INSERT INTO letter_registers (application_id, register_number, period_key) VALUES (?, ?, ?)')->execute([$applicationId, $registerNo, $period]);
            $connection->prepare('INSERT INTO application_status_history (application_id, actor_id, new_status, note) VALUES (?, ?, "submitted", "Pengajuan diterima melalui portal penduduk.")')->execute([$applicationId, $user['id']]);
            notify($connection, (int) $user['id'], 'Pengajuan diterima', 'Pengajuan ' . $applicationNo . ' berhasil diterima.', $applicationId);
            audit($connection, (int) $user['id'], 'application.submitted', 'application', $applicationId);
            $connection->commit();
            json_response(['ok' => true, 'application_no' => $applicationNo, 'register_number' => $registerNo], 201);
        } catch (Throwable $error) {
            if ($connection->inTransaction()) $connection->rollBack();
            throw $error;
        }
    }

    if (preg_match('#^/api/applications/(\d+)$#', $path, $match) && $method === 'PUT') {
        if ($user['role_key'] !== 'resident') json_response(['error' => 'Perubahan pengajuan hanya dapat dilakukan pemohon.'], 403);
        $applicationId = (int) $match[1];
        $connection->beginTransaction();
        try {
            $query = $connection->prepare('SELECT a.status, a.resident_id, t.form_schema FROM letter_applications a JOIN letter_types t ON t.id = a.letter_type_id WHERE a.id = ? FOR UPDATE');
            $query->execute([$applicationId]);
            $application = $query->fetch();
            if (!$application || (int) $application['resident_id'] !== (int) $user['id']) json_response(['error' => 'Pengajuan tidak ditemukan.'], 404);
            if ($application['status'] !== 'revision') json_response(['error' => 'Pengajuan tidak sedang menunggu revisi.'], 409);
            $schema = json_decode($application['form_schema'], true) ?: ['fields' => []];
            $fields = validate_dynamic_fields($schema, $data['fields'] ?? null);
            $versionQuery = $connection->prepare('SELECT COALESCE(MAX(version_number), 0) FROM letter_application_versions WHERE application_id = ?');
            $versionQuery->execute([$applicationId]);
            $version = (int) $versionQuery->fetchColumn() + 1;
            $json = json_encode($fields, JSON_UNESCAPED_UNICODE);
            $connection->prepare('UPDATE letter_application_data SET data_json = ? WHERE application_id = ?')->execute([$json, $applicationId]);
            $connection->prepare('INSERT INTO letter_application_versions (application_id, version_number, data_json, reason, edited_by) VALUES (?, ?, ?, ?, ?)')->execute([$applicationId, $version, $json, 'Perbaikan oleh pemohon', $user['id']]);
            $connection->prepare('UPDATE letter_applications SET status = "submitted" WHERE id = ?')->execute([$applicationId]);
            $connection->prepare('INSERT INTO application_status_history (application_id, actor_id, old_status, new_status, note) VALUES (?, ?, "revision", "submitted", "Pemohon mengirim perbaikan.")')->execute([$applicationId, $user['id']]);
            audit($connection, (int) $user['id'], 'application.revised', 'application', $applicationId, ['version' => $version]);
            $connection->commit();
            json_response(['ok' => true, 'version' => $version]);
        } catch (Throwable $error) {
            if ($connection->inTransaction()) $connection->rollBack();
            throw $error;
        }
    }

    if (preg_match('#^/api/applications/(\d+)$#', $path, $match) && $method === 'GET') {
        $query = $connection->prepare('SELECT a.*, t.name AS type_name, t.form_schema, u.full_name, u.email, u.nik,
            p.family_card_number, p.birth_place, p.birth_date, p.gender, p.marital_status, p.religion, p.occupation,
            p.address, p.rt, p.rw, p.hamlet, p.whatsapp, d.data_json, lr.register_number,
            l.id AS letter_id, l.letter_number, l.status AS letter_status
            FROM letter_applications a JOIN letter_types t ON t.id = a.letter_type_id JOIN users u ON u.id = a.resident_id
            JOIN resident_profiles p ON p.user_id = u.id JOIN letter_application_data d ON d.application_id = a.id
            LEFT JOIN letter_registers lr ON lr.application_id = a.id LEFT JOIN letters l ON l.application_id = a.id WHERE a.id = ?');
        $query->execute([(int) $match[1]]);
        $application = $query->fetch();
        if (!$application || ($user['role_key'] === 'resident' && (int) $application['resident_id'] !== (int) $user['id'])) json_response(['error' => 'Pengajuan tidak ditemukan.'], 404);
        if ($user['role_key'] !== 'resident') require_permission($user, 'applications.read');
        $history = $connection->prepare('SELECT h.old_status, h.new_status, h.note, h.created_at, u.full_name AS actor_name FROM application_status_history h LEFT JOIN users u ON u.id = h.actor_id WHERE h.application_id = ? ORDER BY h.created_at');
        $history->execute([$application['id']]);
        $application['data'] = json_decode($application['data_json'], true);
        $application['form_schema'] = json_decode($application['form_schema'], true);
        unset($application['data_json']);
        $application['history'] = $history->fetchAll();
        json_response(['item' => $application]);
    }

    if (preg_match('#^/api/applications/(\d+)/transition$#', $path, $match) && $method === 'POST') {
        require_permission($user, 'applications.process');
        $applicationId = (int) $match[1];
        $action = (string) ($data['action'] ?? '');
        $note = trim((string) ($data['note'] ?? ''));
        $connection->beginTransaction();
        try {
            $query = $connection->prepare('SELECT a.*, t.letter_format, u.id AS resident_id FROM letter_applications a JOIN letter_types t ON t.id = a.letter_type_id JOIN users u ON u.id = a.resident_id WHERE a.id = ? FOR UPDATE');
            $query->execute([$applicationId]);
            $application = $query->fetch();
            if (!$application) json_response(['error' => 'Pengajuan tidak ditemukan.'], 404);
            $transitions = [
                'periksa' => ['submitted' => 'checking'], 'tunggu_dokumen' => ['submitted' => 'waiting_documents', 'checking' => 'waiting_documents'],
                'jadwalkan_validasi' => ['submitted' => 'waiting_office', 'checking' => 'waiting_office'], 'validasi' => ['waiting_office' => 'verifying', 'checking' => 'verifying'],
                'minta_revisi' => ['submitted' => 'revision', 'checking' => 'revision', 'verifying' => 'revision', 'approved' => 'revision'],
                'setujui' => ['checking' => 'approved', 'verifying' => 'approved'], 'siap_terbit' => ['approved' => 'ready_to_issue'],
                'tolak' => ['submitted' => 'rejected', 'checking' => 'rejected', 'verifying' => 'rejected'],
                'arsipkan' => ['issued' => 'archived'], 'batalkan' => ['submitted' => 'cancelled', 'checking' => 'cancelled', 'revision' => 'cancelled'],
            ];
            $oldStatus = $application['status'];
            if ($action === 'terbitkan') {
                require_permission($user, 'letters.issue');
                if (!in_array($oldStatus, ['approved','ready_to_issue'], true)) json_response(['error' => 'Surat hanya dapat diterbitkan setelah disetujui.'], 409);
                if ($note === '') $note = 'Surat diterbitkan setelah pemeriksaan petugas.';
                $format = $application['letter_format'];
                $letterNo = allocate_number($connection, 'letter:' . date('Y'), $format);
                $connection->prepare('INSERT INTO letters (application_id, letter_number, status, issued_by, issued_at) VALUES (?, ?, "issued", ?, NOW()) ON DUPLICATE KEY UPDATE letter_number = VALUES(letter_number), status = "issued", issued_by = VALUES(issued_by), issued_at = NOW()')->execute([$applicationId, $letterNo, $user['id']]);
                $letterLookup = $connection->prepare('SELECT id FROM letters WHERE application_id = ?');
                $letterLookup->execute([$applicationId]);
                $letterId = (int) $letterLookup->fetchColumn();
                $token = bin2hex(random_bytes(32));
                $connection->prepare('INSERT INTO letter_verification_tokens (letter_id, token_hash) VALUES (?, ?)')->execute([$letterId, hash('sha256', $token)]);
                $connection->prepare('UPDATE letter_applications SET status = "issued" WHERE id = ?')->execute([$applicationId]);
                notify($connection, (int) $application['resident_id'], 'Surat diterbitkan', 'Surat ' . $letterNo . ' telah diterbitkan.', $applicationId);
                audit($connection, (int) $user['id'], 'letter.issued', 'letter', $letterId, ['letter_number' => $letterNo]);
            } else {
                $nextStatus = $transitions[$action][$oldStatus] ?? null;
                if (!$nextStatus) json_response(['error' => 'Tindakan tidak sesuai dengan status pengajuan.'], 409);
                if (in_array($action, ['minta_revisi','tolak','tunggu_dokumen'], true) && $note === '') json_response(['error' => 'Catatan wajib diisi untuk tindakan ini.'], 422);
                $connection->prepare('UPDATE letter_applications SET status = ? WHERE id = ?')->execute([$nextStatus, $applicationId]);
                $notifyTitle = match ($nextStatus) { 'waiting_office' => 'Verifikasi di kantor desa', 'revision' => 'Pengajuan perlu diperbaiki', 'approved' => 'Pengajuan disetujui', 'rejected' => 'Pengajuan ditolak', default => 'Status pengajuan diperbarui' };
                notify($connection, (int) $application['resident_id'], $notifyTitle, $note ?: 'Status pengajuan berubah menjadi ' . $nextStatus . '.', $applicationId);
                audit($connection, (int) $user['id'], 'application.' . $action, 'application', $applicationId, ['from' => $oldStatus, 'to' => $nextStatus]);
            }
            $newStatus = $action === 'terbitkan' ? 'issued' : $transitions[$action][$oldStatus];
            $connection->prepare('INSERT INTO application_status_history (application_id, actor_id, old_status, new_status, note) VALUES (?, ?, ?, ?, ?)')->execute([$applicationId, $user['id'], $oldStatus, $newStatus, $note]);
            $connection->commit();
            json_response(['ok' => true, 'status' => $newStatus]);
        } catch (Throwable $error) {
            if ($connection->inTransaction()) $connection->rollBack();
            throw $error;
        }
    }

    if ($path === '/api/notifications' && $method === 'GET') {
        $query = $connection->prepare('SELECT id, application_id, title, message, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50');
        $query->execute([$user['id']]);
        json_response(['items' => $query->fetchAll()]);
    }

    if (preg_match('#^/api/notifications/(\d+)/read$#', $path, $match) && $method === 'POST') {
        $query = $connection->prepare('UPDATE notifications SET read_at = NOW() WHERE id = ? AND user_id = ?');
        $query->execute([(int) $match[1], $user['id']]);
        json_response(['ok' => true]);
    }

    if ($path === '/api/pending-residents' && $method === 'GET') {
        require_permission($user, 'residents.activate');
        $rows = $connection->query('SELECT u.id, u.full_name, u.email, u.nik, u.created_at FROM users u JOIN roles r ON r.id = u.role_id WHERE r.role_key = "resident" AND u.status = "pending" ORDER BY u.created_at')->fetchAll();
        json_response(['items' => $rows]);
    }

    if (preg_match('#^/api/users/(\d+)/activate$#', $path, $match) && $method === 'POST') {
        require_permission($user, 'residents.activate');
        $targetId = (int) $match[1];
        $connection->beginTransaction();
        $query = $connection->prepare('UPDATE users u JOIN roles r ON r.id = u.role_id SET u.status = "active" WHERE u.id = ? AND r.role_key = "resident" AND u.status = "pending"');
        $query->execute([$targetId]);
        if (!$query->rowCount()) { $connection->rollBack(); json_response(['error' => 'Akun tidak ditemukan atau sudah aktif.'], 404); }
        audit($connection, (int) $user['id'], 'resident.activated', 'user', $targetId);
        notify($connection, $targetId, 'Akun diaktifkan', 'Akun aktif. Identitas Anda tetap perlu diverifikasi petugas di kantor desa.');
        $connection->commit();
        json_response(['ok' => true]);
    }

    if (preg_match('#^/api/residents/(\d+)/verify$#', $path, $match) && $method === 'POST') {
        require_permission($user, 'residents.verify');
        $targetId = (int) $match[1];
        $result = (string) ($data['result'] ?? '');
        $note = trim((string) ($data['note'] ?? ''));
        if (!in_array($result, ['verified','rejected'], true) || ($result === 'rejected' && $note === '')) json_response(['error' => 'Hasil dan catatan verifikasi harus lengkap.'], 422);
        $connection->beginTransaction();
        try {
            $profile = $connection->prepare('SELECT user_id FROM resident_profiles WHERE user_id = ? FOR UPDATE');
            $profile->execute([$targetId]);
            if (!$profile->fetchColumn()) json_response(['error' => 'Profil penduduk tidak ditemukan.'], 404);
            $verifiedAt = $result === 'verified' ? date('Y-m-d H:i:s') : null;
            $connection->prepare('UPDATE resident_profiles SET resident_verified_at = ? WHERE user_id = ?')->execute([$verifiedAt, $targetId]);
            $connection->prepare('INSERT INTO resident_verifications (user_id, officer_id, result, notes) VALUES (?, ?, ?, ?)')->execute([$targetId, $user['id'], $result, $note ?: 'Data dicocokkan dengan dokumen asli di kantor desa.']);
            audit($connection, (int) $user['id'], 'resident.' . $result, 'user', $targetId, ['result' => $result]);
            notify($connection, $targetId, $result === 'verified' ? 'Data penduduk terverifikasi' : 'Verifikasi perlu ditindaklanjuti', $note ?: 'Data telah dicocokkan oleh petugas di kantor desa.');
            $connection->commit();
            json_response(['ok' => true, 'resident_verified_at' => $verifiedAt]);
        } catch (Throwable $error) {
            if ($connection->inTransaction()) $connection->rollBack();
            throw $error;
        }
    }

    json_response(['error' => 'Endpoint tidak ditemukan.'], 404);
} catch (Throwable $error) {
    error_log('[sukakerta] ' . $error->getMessage());
    json_response(['error' => 'Layanan belum siap atau terjadi kesalahan. Periksa konfigurasi aplikasi.'], 503);
}