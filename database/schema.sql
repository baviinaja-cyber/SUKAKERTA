CREATE TABLE roles (
  id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_key VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE permissions (
  id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  permission_key VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_id TINYINT UNSIGNED NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  nik CHAR(16) NULL UNIQUE,
  full_name VARCHAR(160) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status ENUM('pending','active','locked','disabled') NOT NULL DEFAULT 'pending',
  email_verified_at DATETIME NULL,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

CREATE TABLE user_permissions (
  user_id BIGINT UNSIGNED NOT NULL,
  permission_id SMALLINT UNSIGNED NOT NULL,
  granted_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, permission_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id),
  FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE resident_profiles (
  user_id BIGINT UNSIGNED PRIMARY KEY,
  family_card_number CHAR(16) NOT NULL,
  birth_place VARCHAR(100) NOT NULL,
  birth_date DATE NOT NULL,
  gender ENUM('L','P') NOT NULL,
  marital_status VARCHAR(40) NOT NULL,
  religion VARCHAR(40) NOT NULL,
  occupation VARCHAR(100) NOT NULL,
  citizenship VARCHAR(60) NOT NULL DEFAULT 'WNI',
  address TEXT NOT NULL,
  rt VARCHAR(3) NOT NULL,
  rw VARCHAR(3) NOT NULL,
  hamlet VARCHAR(80) NOT NULL,
  whatsapp VARCHAR(20) NOT NULL,
  resident_verified_at DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_profile_name (family_card_number)
) ENGINE=InnoDB;

CREATE TABLE resident_verifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  officer_id BIGINT UNSIGNED NOT NULL,
  result ENUM('verified','rejected') NOT NULL,
  notes TEXT NULL,
  verified_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (officer_id) REFERENCES users(id),
  INDEX idx_resident_verification (user_id, verified_at)
) ENGINE=InnoDB;

CREATE TABLE letter_types (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type_key VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  description TEXT NULL,
  register_format VARCHAR(120) NOT NULL DEFAULT '{SEQ}/REG/DS-SKT/{MONTH}/{YEAR}',
  letter_format VARCHAR(120) NOT NULL DEFAULT '{SEQ}/DS-SKT/{MONTH}/{YEAR}',
  form_schema JSON NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE letter_templates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  letter_type_id INT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  status ENUM('draft','active','archived') NOT NULL DEFAULT 'draft',
  current_version INT UNSIGNED NOT NULL DEFAULT 1,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (letter_type_id) REFERENCES letter_types(id),
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE letter_template_versions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT UNSIGNED NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  page_settings JSON NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_template_version (template_id, version_number),
  FOREIGN KEY (template_id) REFERENCES letter_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE letter_template_elements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  template_version_id BIGINT UNSIGNED NOT NULL,
  page_number SMALLINT UNSIGNED NOT NULL,
  element_order SMALLINT UNSIGNED NOT NULL,
  element_type VARCHAR(24) NOT NULL,
  content MEDIUMTEXT NULL,
  position_json JSON NOT NULL,
  style_json JSON NOT NULL,
  FOREIGN KEY (template_version_id) REFERENCES letter_template_versions(id) ON DELETE CASCADE,
  INDEX idx_template_elements_order (template_version_id, page_number, element_order)
) ENGINE=InnoDB;

CREATE TABLE letter_form_fields (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  letter_type_id INT UNSIGNED NOT NULL,
  field_key VARCHAR(80) NOT NULL,
  label VARCHAR(120) NOT NULL,
  field_type ENUM('text','textarea','date','select','number','file') NOT NULL,
  required TINYINT(1) NOT NULL DEFAULT 0,
  options_json JSON NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_letter_field (letter_type_id, field_key),
  FOREIGN KEY (letter_type_id) REFERENCES letter_types(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE letter_applications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_no VARCHAR(32) NOT NULL UNIQUE,
  resident_id BIGINT UNSIGNED NOT NULL,
  letter_type_id INT UNSIGNED NOT NULL,
  status ENUM('submitted','checking','waiting_documents','waiting_office','verifying','revision','approved','ready_to_issue','issued','rejected','cancelled','archived') NOT NULL DEFAULT 'submitted',
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (resident_id) REFERENCES users(id),
  FOREIGN KEY (letter_type_id) REFERENCES letter_types(id),
  INDEX idx_application_queue (status, submitted_at),
  INDEX idx_application_resident (resident_id, submitted_at)
) ENGINE=InnoDB;

CREATE TABLE letter_application_data (
  application_id BIGINT UNSIGNED PRIMARY KEY,
  data_json JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES letter_applications(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE letter_application_versions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id BIGINT UNSIGNED NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  data_json JSON NOT NULL,
  reason VARCHAR(500) NOT NULL,
  edited_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_application_version (application_id, version_number),
  FOREIGN KEY (application_id) REFERENCES letter_applications(id) ON DELETE CASCADE,
  FOREIGN KEY (edited_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE letter_attachments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id BIGINT UNSIGNED NOT NULL,
  uploaded_by BIGINT UNSIGNED NOT NULL,
  original_name VARCHAR(190) NOT NULL,
  storage_key CHAR(64) NOT NULL UNIQUE,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES letter_applications(id),
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE number_sequences (
  sequence_key VARCHAR(100) PRIMARY KEY,
  current_value BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE letter_registers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id BIGINT UNSIGNED NOT NULL UNIQUE,
  register_number VARCHAR(120) NOT NULL UNIQUE,
  period_key VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES letter_applications(id)
) ENGINE=InnoDB;

CREATE TABLE letters (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id BIGINT UNSIGNED NOT NULL UNIQUE,
  letter_number VARCHAR(120) NULL UNIQUE,
  status ENUM('draft','issued','cancelled','archived') NOT NULL DEFAULT 'draft',
  current_version INT UNSIGNED NOT NULL DEFAULT 1,
  issued_by BIGINT UNSIGNED NULL,
  issued_at DATETIME NULL,
  FOREIGN KEY (application_id) REFERENCES letter_applications(id),
  FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE letter_versions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  letter_id BIGINT UNSIGNED NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  reason VARCHAR(500) NOT NULL,
  content_json JSON NOT NULL,
  document_path VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_letter_version (letter_id, version_number),
  FOREIGN KEY (letter_id) REFERENCES letters(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE letter_publications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  letter_id BIGINT UNSIGNED NOT NULL,
  published_by BIGINT UNSIGNED NOT NULL,
  published_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  FOREIGN KEY (letter_id) REFERENCES letters(id),
  FOREIGN KEY (published_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE letter_verification_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  letter_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  FOREIGN KEY (letter_id) REFERENCES letters(id)
) ENGINE=InnoDB;

CREATE TABLE application_status_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id BIGINT UNSIGNED NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  old_status VARCHAR(32) NULL,
  new_status VARCHAR(32) NOT NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES letter_applications(id),
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_status_history (application_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  application_id BIGINT UNSIGNED NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (application_id) REFERENCES letter_applications(id) ON DELETE SET NULL,
  INDEX idx_notifications_unread (user_id, read_at, created_at)
) ENGINE=InnoDB;

CREATE TABLE messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  recipient_id BIGINT UNSIGNED NOT NULL,
  message TEXT NOT NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES letter_applications(id),
  FOREIGN KEY (sender_id) REFERENCES users(id),
  FOREIGN KEY (recipient_id) REFERENCES users(id),
  INDEX idx_messages_thread (application_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id BIGINT UNSIGNED NULL,
  action_key VARCHAR(64) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  details_json JSON NULL,
  ip_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_entity (entity_type, entity_id, created_at),
  INDEX idx_audit_actor (actor_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE system_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE backup_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  storage_key VARCHAR(255) NOT NULL,
  checksum CHAR(64) NOT NULL,
  status ENUM('created','verified','failed','restored') NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE rate_limits (
  bucket_key CHAR(64) PRIMARY KEY,
  attempts SMALLINT UNSIGNED NOT NULL,
  window_started_at DATETIME NOT NULL,
  blocked_until DATETIME NULL
) ENGINE=InnoDB;

INSERT INTO roles (role_key, name) VALUES
('super_admin', 'Super Admin'), ('staff', 'Admin / Petugas Desa'), ('resident', 'Penduduk');

INSERT INTO permissions (permission_key, name) VALUES
('applications.read', 'Melihat pengajuan'), ('applications.process', 'Memproses pengajuan'),
('residents.read', 'Melihat data penduduk'), ('residents.activate', 'Mengaktifkan akun penduduk'), ('residents.verify', 'Memvalidasi penduduk'),
('templates.manage', 'Mengelola template'), ('letters.issue', 'Menerbitkan surat'),
('letters.publish', 'Mempublikasikan surat'), ('reports.read', 'Melihat laporan'),
('users.manage', 'Mengelola akun'), ('settings.manage', 'Mengelola pengaturan');

INSERT INTO letter_types (type_key, name, description, form_schema) VALUES
('domisili', 'Surat Keterangan Domisili', 'Keterangan tempat tinggal penduduk.', '{"fields":[{"key":"keperluan","label":"Keperluan","type":"textarea","required":true}]}'),
('usaha', 'Surat Keterangan Usaha', 'Keterangan kegiatan usaha penduduk.', '{"fields":[{"key":"nama_usaha","label":"Nama usaha","type":"text","required":true},{"key":"alamat_usaha","label":"Alamat usaha","type":"textarea","required":true},{"key":"keperluan","label":"Keperluan","type":"textarea","required":true}]}'),
('tidak-mampu', 'Surat Keterangan Tidak Mampu', 'Keterangan untuk keperluan administrasi.', '{"fields":[{"key":"keperluan","label":"Keperluan","type":"textarea","required":true}]}'),
('belum-menikah', 'Surat Keterangan Belum Menikah', 'Keterangan status perkawinan.', '{"fields":[{"key":"keperluan","label":"Keperluan","type":"textarea","required":true}]}'),
('kematian', 'Surat Keterangan Kematian', 'Keterangan peristiwa kematian.', '{"fields":[{"key":"nama_almarhum","label":"Nama almarhum/almarhumah","type":"text","required":true},{"key":"tanggal_peristiwa","label":"Tanggal peristiwa","type":"date","required":true},{"key":"keperluan","label":"Keperluan","type":"textarea","required":true}]}'),
('kelahiran', 'Surat Keterangan Kelahiran', 'Keterangan peristiwa kelahiran.', '{"fields":[{"key":"nama_bayi","label":"Nama bayi","type":"text","required":true},{"key":"tanggal_peristiwa","label":"Tanggal lahir","type":"date","required":true},{"key":"keperluan","label":"Keperluan","type":"textarea","required":true}]}'),
('pengantar', 'Surat Pengantar', 'Surat pengantar administrasi.', '{"fields":[{"key":"keperluan","label":"Keperluan","type":"textarea","required":true}]}'),
('penghasilan', 'Surat Keterangan Penghasilan', 'Keterangan penghasilan penduduk.', '{"fields":[{"key":"penghasilan","label":"Penghasilan per bulan","type":"number","required":true},{"key":"keperluan","label":"Keperluan","type":"textarea","required":true}]}'),
('ahli-waris', 'Surat Keterangan Ahli Waris', 'Keterangan ahli waris untuk verifikasi petugas.', '{"fields":[{"key":"nama_almarhum","label":"Nama pewaris","type":"text","required":true},{"key":"daftar_ahli_waris","label":"Daftar ahli waris","type":"textarea","required":true}]}'),
('kehilangan', 'Surat Keterangan Kehilangan', 'Keterangan kehilangan barang/dokumen.', '{"fields":[{"key":"barang_hilang","label":"Barang/dokumen yang hilang","type":"text","required":true},{"key":"tanggal_peristiwa","label":"Tanggal kehilangan","type":"date","required":true}]}'),
('pindah', 'Surat Keterangan Pindah', 'Keterangan perpindahan penduduk.', '{"fields":[{"key":"alamat_tujuan","label":"Alamat tujuan","type":"textarea","required":true},{"key":"tanggal_pindah","label":"Tanggal pindah","type":"date","required":true}]}'),
('lainnya', 'Surat Keterangan Lainnya', 'Pengajuan surat di luar kategori umum.', '{"fields":[{"key":"uraian","label":"Uraian keperluan","type":"textarea","required":true}]}');