# Sistem Informasi Surat Digital Desa Sukakerta

Aplikasi PHP native untuk layanan pengajuan dan pemeriksaan surat Desa Sukakerta. Portal penduduk dan panel pemerintahan berbagi satu basis data MySQL, dengan layout dan navigasi terpisah. Seluruh keputusan validasi dan penerbitan tetap dilakukan petugas.

## Isi yang Tersedia

- Login, registrasi penduduk, aktivasi akun oleh petugas, pengelolaan sesi, CSRF, rate limit login/registrasi/verifikasi, dan izin berbasis permission.
- Dashboard terhubung ke data pengajuan; portal menampilkan hanya milik penduduk yang masuk.
- Dua belas jenis surat contoh dengan skema formulir dinamis.
- Pengajuan dan nomor register transaksional; urutan register global per tahun mencegah benturan antarjenis surat.
- Proses pemeriksaan, permintaan revisi, validasi langsung, persetujuan, penerbitan, pembatalan/arsip terbatas, notifikasi, serta riwayat dan audit.
- Editor tata letak visual A4 multi-halaman dengan drag-and-drop, posisi elemen, orientasi, undo/redo, dan versi template yang disimpan ke database.
- Token acak untuk verifikasi publik yang tidak menampilkan NIK atau data kontak.
- Clean URL Apache, layout PHP terpisah, CSP dan header keamanan, serta penyimpanan konfigurasi privat di luar webroot.

## Batas Implementasi

Rilis fondasi ini belum menyediakan semua modul yang tercantum dalam spesifikasi besar. PDF final, QR sebagai gambar pada dokumen, unggahan lampiran, email aktivasi/reset kata sandi, percakapan pesan, publikasi/pencabutan surat, revisi isi surat setelah diterbitkan, CRUD lengkap pengaturan/jenis surat/petugas, AI, backup terenkripsi/pemulihan, dan ekspor laporan belum tersedia. Tombol cetak saat ini menggunakan dialog cetak browser dan tidak menghasilkan PDF tersimpan. Jangan gunakan untuk menerbitkan dokumen resmi sebelum format tata naskah, alur publikasi, perlindungan dokumen, dan kebijakan penomoran dikonfigurasi serta diuji.

Fitur AI sengaja tidak mengirim data penduduk ke layanan eksternal dan belum diaktifkan. Seed berisi jenis surat contoh saja, bukan identitas penduduk nyata.

## Persyaratan

- PHP 8.1+ dengan ekstensi `pdo_mysql`, `mbstring`, `openssl`, dan `fileinfo`.
- MySQL 8.0+ atau MariaDB 10.6+ dengan InnoDB dan database berkolasi `utf8mb4_unicode_ci`.
- Apache dengan `mod_rewrite` dan `AllowOverride All`, atau konfigurasi rewrite setara.
- HTTPS wajib untuk deployment publik.

> Catatan: container pengembangan saat ini tidak memiliki ekstensi PHP `pdo_mysql` atau server MySQL. Sintaks PHP/JavaScript dapat divalidasi lokal, tetapi alur database harus dijalankan setelah konfigurasi MySQL.

## Instalasi Shared Hosting / cPanel

1. Buat database dan user MySQL dari cPanel. Pilih charset `utf8mb4` dan collation `utf8mb4_unicode_ci`, lalu berikan hak akses database kepada user tersebut.
2. Impor `database/schema.sql` ke database yang sudah dibuat melalui phpMyAdmin. File ini tidak membuat database atau memakai nama database tetap.
3. Atur document root domain/subdomain ke direktori `public/`. Jangan jadikan root repo sebagai document root. Pastikan `app/`, `config/`, `database/`, `storage/`, dan `bin/` tetap di luar webroot.
4. Salin `config/local.example.php` menjadi `config/local.php` dan isi DSN, username, serta password database. File lokal diabaikan Git dan berada di luar direktori publik.
5. Buat akun Super Admin pertama dari CLI pada lingkungan yang dapat membaca konfigurasi tersebut:

	```sh
	read -r -p 'Email admin: ' ADMIN_EMAIL
	read -r -p 'Nama admin: ' ADMIN_NAME
	read -r -s -p 'Kata sandi (minimal 14 karakter): ' ADMIN_PASSWORD; printf '\n'
	export ADMIN_EMAIL ADMIN_NAME ADMIN_PASSWORD ADMIN_ROLE=super_admin
	php bin/create-admin.php
	unset ADMIN_EMAIL ADMIN_NAME ADMIN_PASSWORD ADMIN_ROLE
	```

	Untuk akun petugas terbatas, gunakan `ADMIN_ROLE=staff`. Skrip memberi permission operasional tanpa `users.manage`; hanya Super Admin yang memperoleh akses penuh.
6. Aktifkan sertifikat HTTPS, `mod_rewrite`, dan `AllowOverride All`. Cookie sesi ditandai `Secure` saat request menggunakan HTTPS.
7. Pastikan direktori `storage/` tidak berada di bawah `public/`. Saat unggahan ditambahkan, atur batas ukuran dan izin tulis paling minimum.
8. Buka `/login`, masuk dengan akun awal, lalu uji aktivasi akun penduduk. Akun registrasi baru berstatus menunggu sampai petugas mengaktifkannya; verifikasi identitas tetap dilakukan di kantor desa.

PHP built-in server untuk pemeriksaan lokal (jalankan dari root repo):

```sh
php -S 127.0.0.1:8080 -t public
```

## Konfigurasi dan Keamanan

- Konfigurasi produksi dibaca dari `config/local.php` atau environment `DB_DSN`, `DB_USER`, dan `DB_PASSWORD`.
- Jangan gunakan akun database dengan hak `root`; batasi ke database aplikasi.
- Jangan commit `config/local.php`, kredensial, backup, log, atau dokumen penduduk.
- Semua mutasi API memerlukan token CSRF dan pemeriksaan sesi/permission. Endpoint detail memeriksa kepemilikan pengajuan penduduk di server.
- Kata sandi memakai Argon2id jika tersedia, atau bcrypt. Pesan kesalahan publik tidak mengungkap query/path internal.
- Token verifikasi menyimpan hash di database; endpoint publik hanya menampilkan nomor surat, jenis, tanggal terbit, dan validitas.
- Sampai pengelolaan file privat dan backup teruji, jangan unggah dokumen identitas atau gunakan data produksi.

## Skenario Uji Manual

1. Impor skema pada database kosong, buat Super Admin dan akun petugas, lalu pastikan akun petugas tidak dapat membuka pengelolaan akun.
2. Daftarkan penduduk dengan NIK/KK nonpribadi 16 digit; pastikan NIK/email duplikat ditolak dan akun belum bisa masuk sebelum diaktifkan.
3. Aktifkan akun, masuk sebagai penduduk, buat pengajuan pada beberapa jenis surat, lalu pastikan data form dan nomor register tersimpan.
4. Buat beberapa pengajuan pada jenis berbeda secara bersamaan; verifikasi nomor register tidak berulang. Coba kirim ulang request yang sama dan pastikan sistem tidak mengubah nomor yang telah diberikan.
5. Pastikan penduduk A mendapat `404` ketika meminta detail ID milik penduduk B.
6. Sebagai petugas, jalankan pemeriksaan → validasi kantor → persetujuan → siap terbit → terbitkan; verifikasi surat tidak memiliki nomor resmi sebelum penerbitan.
7. Minta revisi dan pastikan status serta catatan tercatat sementara nomor register tetap. Uji tindakan yang tidak sesuai status dan pastikan ditolak.
8. Simpan template dengan beberapa halaman, muat ulang editor, bandingkan posisi/orientasi/elemen, dan pastikan versi tersimpan bertambah.
9. Ubah satu karakter token verifikasi dan pastikan data dokumen tidak terbuka. Verifikasi token yang benar hanya menunjukkan metadata minimum.
10. Uji CSRF kosong/salah, login berulang, permission endpoint, cookie HTTPS, dan header respons sebelum deployment.

## Struktur Utama

```text
app/                 Bootstrap, API, routing halaman, layout
bin/                 Perintah CLI akun awal
config/              Contoh konfigurasi privat
database/schema.sql  Skema dan data contoh jenis surat
public/              Document root, aset, dan front controller
storage/             Lokasi privat untuk pengembangan berikutnya
```