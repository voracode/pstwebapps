# Panduan Instalasi & Konfigurasi — VPS Ubuntu 26.04 LTS

**Portal Partido Socialista de Timor (PST)** · *Pelo Progresso, Igualdade*

Panduan ini menjelaskan cara memasang portal PST (situs publik, backoffice SIM-PST, dan API) di VPS Ubuntu 26.04 LTS, lalu mengonfigurasi, mengoperasikan, memperbarui, dan memulihkannya.

Seluruh instalasi dijalankan oleh satu skrip, `deploy-ubuntu-26.04.sh`. Skrip ini **aman dijalankan ulang**. Menjalankannya lagi juga merupakan cara untuk memperbarui sistem, dan skrip tidak pernah menimpa rahasia (secrets), data, maupun sertifikat yang sudah ada.

---

## Daftar Isi

1. [Gambaran arsitektur](#1-gambaran-arsitektur)
2. [Persyaratan](#2-persyaratan)
3. [Persiapan DNS](#3-persiapan-dns)
4. [Persiapan server](#4-persiapan-server)
5. [Instalasi](#5-instalasi)
6. [Login pertama & mengamankan akun admin](#6-login-pertama--mengamankan-akun-admin)
7. [Menyimpan rahasia secara offline (WAJIB)](#7-menyimpan-rahasia-secara-offline-wajib)
8. [Konfigurasi lanjutan](#8-konfigurasi-lanjutan)
9. [Mengimpor konten situs lama](#9-mengimpor-konten-situs-lama)
10. [Data wilayah: suco & aldeia](#10-data-wilayah-suco--aldeia)
11. [Verifikasi setelah instalasi](#11-verifikasi-setelah-instalasi)
12. [Operasional harian](#12-operasional-harian)
13. [Backup & pemulihan (restore)](#13-backup--pemulihan-restore)
14. [Memperbarui aplikasi](#14-memperbarui-aplikasi)
15. [Rotasi kunci enkripsi](#15-rotasi-kunci-enkripsi)
16. [Pemecahan masalah](#16-pemecahan-masalah)
17. [Daftar periksa keamanan](#17-daftar-periksa-keamanan)
18. [Lampiran: lokasi file & variabel penting](#18-lampiran-lokasi-file--variabel-penting)

---

## 1. Gambaran arsitektur

Semua komponen berjalan sebagai kontainer Docker yang dikelola Docker Compose:

| Layanan | Fungsi | Akses jaringan |
|---|---|---|
| `nginx` | Reverse proxy, TLS, HTTP/2 + HTTP/3, Brotli/gzip, rate limit, menyajikan `/media` | Jaringan host: port 80/tcp, 443/tcp, 443/udp |
| `app` | Next.js: situs publik, backoffice, REST API | Hanya `127.0.0.1:3000` (tidak bisa diakses dari luar) |
| `worker` | Antrean notifikasi Telegram/e-mail, publikasi terjadwal, statistik, pemantauan kesehatan | Internal |
| `postgres` | Database PostgreSQL 16 | Internal (tanpa port publik) |
| `redis` | Rate limit, antrean, OTP | Internal (tanpa port publik) |
| `migrate` | Tugas sekali jalan: migrasi database, seed, skrip pemeliharaan | Internal |
| `certbot` | Perpanjangan sertifikat Let's Encrypt otomatis (setiap 12 jam) | — |
| `backup` | Backup harian database + mingguan file unggahan | Internal |

Pengamanan database: migrasi dijalankan oleh pemilik skema (`pst_owner`), sedangkan aplikasi memakai akun terbatas (`pst_app`). Akun aplikasi **tidak dapat mengubah atau menghapus log audit**; ia hanya bisa menambah dan membaca.

---

## 2. Persyaratan

### Server

| | Minimum | Disarankan |
|---|---|---|
| CPU | 2 vCPU | 2–4 vCPU |
| RAM | 2 GB (dengan swap) | **4 GB** |
| Disk | 25 GB | **40 GB SSD** atau lebih |
| OS | Ubuntu **26.04 LTS** (amd64 atau arm64), instalasi bersih | — |
| Jaringan | IPv4 publik; IPv6 opsional | — |

> Kebutuhan disk terutama berasal dari image Docker (sekitar 3–4 GB), backup, dan foto/dokumen unggahan.

### Yang perlu disiapkan

- [ ] Domain, misalnya `pst.tl`, dengan akses ke pengaturan DNS-nya
- [ ] Akses SSH root (atau pengguna dengan `sudo`) ke VPS, **sebaiknya dengan kunci SSH**
- [ ] Alamat e-mail untuk pemberitahuan Let's Encrypt
- [ ] *(Opsional)* Bot Telegram dan ID grup admin (lihat [§8.2](#82-notifikasi-telegram))
- [ ] *(Opsional)* Akun SMTP untuk e-mail (lihat [§8.3](#83-e-mail-smtp))

---

## 3. Persiapan DNS

Buat record DNS berikut **sebelum** instalasi, karena Let's Encrypt memverifikasi domain lewat port 80:

| Tipe | Nama | Nilai |
|---|---|---|
| `A` | `pst.tl` | IP publik VPS |
| `A` | `www.pst.tl` | IP publik VPS |
| `AAAA` | `pst.tl`, `www.pst.tl` | IPv6 VPS *(jika ada)* |

Periksa dari komputer Anda:

```bash
dig +short A pst.tl
```

```bash
dig +short A www.pst.tl
```

Keduanya harus menampilkan IP VPS. Perubahan DNS bisa butuh beberapa menit sampai beberapa jam untuk menyebar.

> ⚠️ **Cloudflare / CDN:** jika domain diproksikan Cloudflare (ikon awan oranye), Nginx hanya melihat IP Cloudflare, sehingga rate limit dan Fail2Ban akan memblokir IP yang salah. Gunakan mode **DNS only** (awan abu-abu), kecuali Anda menambahkan konfigurasi `real_ip` untuk Cloudflare di Nginx.

---

## 4. Persiapan server

Masuk ke VPS:

```bash
ssh root@IP_VPS
```

Pastikan versi OS:

```bash
cat /etc/os-release | grep VERSION=
```

Jika Anda belum memakai kunci SSH, sangat disarankan untuk menambahkannya sekarang (dari komputer Anda, bukan dari server):

```bash
ssh-copy-id root@IP_VPS
```

Port yang akan dibuka oleh skrip: SSH (port SSH Anda saat ini, terdeteksi otomatis), **80/tcp**, **443/tcp**, dan **443/udp** (HTTP/3). Jika penyedia VPS memiliki *firewall* di panel kontrolnya (security group), buka juga port-port tersebut di sana.

---

## 5. Instalasi

### 5.1 Ambil kode sumber

Kloning repositori langsung ke direktori instalasi `/opt/pst-portal`:

```bash
apt-get update && apt-get install -y git
```

```bash
git clone https://github.com/voracode/pstwebapps.git /opt/pst-portal
```

```bash
cd /opt/pst-portal
```

> Dengan mengkloning langsung ke `/opt/pst-portal`, pembaruan nantinya cukup `git pull` lalu menjalankan ulang skrip (lihat [§14](#14-memperbarui-aplikasi)).

### 5.2 Jalankan installer

```bash
sudo DOMAIN=pst.tl CERTBOT_EMAIL=tech@pst.tl ./deploy-ubuntu-26.04.sh
```

Ganti `pst.tl` dan `tech@pst.tl` dengan domain dan e-mail Anda. Dengan menjalankan perintah ini, Anda menyetujui *Subscriber Agreement* Let's Encrypt untuk e-mail tersebut.

#### Opsi yang tersedia (variabel lingkungan)

| Variabel | Default | Keterangan |
|---|---|---|
| `DOMAIN` | — (**wajib**) | Domain utama, mis. `pst.tl` |
| `CERTBOT_EMAIL` | — (wajib, kecuali `SKIP_CERTBOT=1`) | E-mail untuk pemberitahuan sertifikat |
| `DOMAIN_ALIASES` | `www.$DOMAIN` | Domain tambahan yang dialihkan ke domain utama (pisahkan dengan koma/spasi). Kosongkan (`DOMAIN_ALIASES=`) jika tidak ada |
| `APP_DIR` | `/opt/pst-portal` | Direktori instalasi |
| `SSH_PORT` | terdeteksi dari `sshd` | Port SSH yang dibuka di firewall |
| `SWAP_SIZE` | `2G` | Ukuran swap file (dibuat hanya jika belum ada swap) |
| `CERTBOT_STAGING` | `0` | `1` = gunakan Let's Encrypt *staging* (untuk uji coba) |
| `SKIP_CERTBOT` | `0` | `1` = pakai sertifikat *self-signed* (mis. DNS belum siap) |
| `HARDEN_SSH` | `0` | `1` = SSH hanya dengan kunci (password & login root ber-password dimatikan). Hanya diterapkan jika ada `authorized_keys` |
| `SEED_SUPER_ADMIN_PASSWORD` | dibuat acak | Password awal admin (minimal 12 karakter). Jika kosong, dibuat acak |

Contoh dengan SSH dikunci dan tanpa alias `www`:

```bash
sudo DOMAIN=pst.tl DOMAIN_ALIASES= CERTBOT_EMAIL=tech@pst.tl HARDEN_SSH=1 ./deploy-ubuntu-26.04.sh
```

### 5.3 Apa yang dilakukan skrip (10 tahap)

| Tahap | Isi |
|---|---|
| 1. Preflight | Memeriksa OS, arsitektur, RAM, disk, domain, port SSH |
| 2. Paket sistem | Pembaruan, zona waktu `Asia/Dili`, *unattended-upgrades* (pembaruan keamanan otomatis), cek DNS |
| 3. Swap & kernel | Swap file, tuning jaringan (buffer QUIC/HTTP3), pengerasan sysctl |
| 4. Docker | Docker Engine + plugin Compose dari repositori resmi Docker |
| 5. Firewall UFW | Hanya SSH (dengan rate limit), 80/tcp, 443/tcp, 443/udp |
| 6. Fail2Ban | Jail: SSH, penyalahgunaan rate limit Nginx, login gagal berulang, pemindai kerentanan; pemblokiran lewat UFW |
| 7. Rahasia | Membuat `/opt/pst-portal/.env.production` (mode 600) dengan semua password & kunci acak; kunci tanda tangan KTA |
| 8. Build & database | Build image, migrasi database, seed (14 município, 69 posto, kategori, admin) |
| 9. Sertifikat TLS | Sertifikat Let's Encrypt via HTTP-01 (webroot) |
| 10. Start & verifikasi | Menjalankan semua layanan dan memeriksa `https://DOMAIN/api/health` |

Instalasi pertama butuh sekitar **10–20 menit**, sebagian besar untuk build image. Log lengkap tersimpan di `/var/log/pst-deploy.log`.

Di akhir, skrip menampilkan ringkasan: alamat backoffice, lokasi password awal, dan langkah berikutnya.

---

## 6. Login pertama & mengamankan akun admin

1. Ambil password satu kali:

   ```bash
   sudo cat /root/pst-initial-admin.txt
   ```

2. Buka `https://pst.tl/admin` dan masuk dengan `admin@pst.tl` serta password tersebut.
3. Sistem akan **memaksa penggantian password**. Syarat: minimal 12 karakter dengan campuran huruf besar/kecil, angka, atau simbol, atau frasa sandi 20+ karakter.
4. Sistem kemudian **mewajibkan verifikasi dua langkah (2FA)**. Pindai kode QR dengan Google Authenticator, Microsoft Authenticator, atau Aegis, lalu masukkan kode 6 digit.
5. Simpan **10 kode pemulihan (recovery codes)** di tempat aman dan offline. Kode-kode ini hanya ditampilkan sekali.
6. Hapus file password awal:

   ```bash
   sudo rm /root/pst-initial-admin.txt
   ```

7. Buat akun untuk tim di menu **Pengguna (Users)**: Sekretaris Nasional, Koordinator Munisipal (wajib memilih município), Editor Media, dan Auditor. Tanpa SMTP, sistem menampilkan **tautan undangan**; kirimkan tautan itu secara aman kepada yang bersangkutan.

> 2FA wajib untuk peran `SUPER_ADMIN`, `NATIONAL_SECRETARY`, dan `AUDITOR` (dapat diubah lewat `TWO_FACTOR_REQUIRED_ROLES`).

---

## 7. Menyimpan rahasia secara offline (WAJIB)

Simpan salinan berikut di tempat aman di luar server, misalnya pengelola kata sandi atau media terenkripsi:

| File | Mengapa penting |
|---|---|
| `/opt/pst-portal/.env.production` | Berisi semua password dan kunci. **Jika `DATA_ENCRYPTION_KEY` hilang, nomor identitas (BI) anggota yang terenkripsi tidak akan pernah bisa dibaca lagi.** |
| `/root/pst-kta-signing-key-AAAAMMDD.pem` | Kunci privat tanda tangan kartu KTA. Setelah disalin, **hapus dari server**. |

Menyalin ke komputer Anda (jalankan di komputer Anda):

```bash
scp root@IP_VPS:/opt/pst-portal/.env.production ./pst-env.production.backup
```

```bash
scp "root@IP_VPS:/root/pst-kta-signing-key-*.pem" ./
```

Lalu di server:

```bash
sudo rm /root/pst-kta-signing-key-*.pem
```

> Kunci KTA tetap tersimpan di `.env.production`, jadi kartu tetap bisa diterbitkan dan diverifikasi.

---

## 8. Konfigurasi lanjutan

Semua pengaturan ada di `/opt/pst-portal/.env.production`. Cara menerapkan perubahan:

```bash
cd /opt/pst-portal
```

```bash
sudo nano .env.production
```

Lalu terapkan dengan menjalankan ulang skrip (cara paling aman):

```bash
sudo DOMAIN=pst.tl CERTBOT_EMAIL=tech@pst.tl ./deploy-ubuntu-26.04.sh
```

Atau, lebih cepat, buat ulang hanya kontainer aplikasi:

```bash
sudo docker compose --env-file .env.production up -d --force-recreate app worker
```

### 8.1 Pengaturan umum

| Variabel | Keterangan |
|---|---|
| `SESSION_TTL_HOURS` | Lama sesi backoffice (default 8 jam) |
| `SESSION_IDLE_TIMEOUT_MINUTES` | Logout otomatis jika tidak aktif (default 30 menit) |
| `LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCKOUT_MINUTES` | Kunci akun setelah N percobaan gagal (default 5 kali / 15 menit) |
| `PASSWORD_MAX_AGE_DAYS` | Password wajib diganti setelah N hari (default 180; `0` = tidak pernah) |
| `KTA_VALIDITY_YEARS` | Masa berlaku kartu KTA (default 5 tahun) |
| `UPLOAD_MAX_IMAGE_MB` / `UPLOAD_MAX_DOCUMENT_MB` | Batas ukuran unggahan |

Pengaturan situs lainnya (moto, kontak kantor pusat, media sosial, usia minimal anggota, kewajiban scan identitas) diubah dari **backoffice → Website → Pengaturan** (khusus SUPER_ADMIN).

### 8.2 Notifikasi Telegram

Admin menerima peringatan instan untuk: pendaftaran anggota baru, aspirasi, pesan kontak, akun terkunci, ekspor data, peristiwa keamanan kritis, perubahan status sistem, dan kegagalan backup.

1. Di Telegram, buka **@BotFather** → `/newbot` → ikuti petunjuk → salin **token**.
2. Buat grup admin dan tambahkan bot ke grup tersebut.
3. Kirim pesan apa pun di grup, lalu cari **chat id** grup (angka negatif, mis. `-1001234567890`):

   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates"
   ```

4. Isi di `.env.production`:

   ```ini
   TELEGRAM_ENABLED=true
   TELEGRAM_BOT_TOKEN=123456:ABC...
   TELEGRAM_ADMIN_CHAT_ID=-1001234567890
   # Opsional: grup terpisah per topik (jika kosong, memakai grup admin)
   TELEGRAM_CHAT_ID_REGISTRATIONS=
   TELEGRAM_CHAT_ID_ASPIRATIONS=
   TELEGRAM_CHAT_ID_SECURITY=
   TELEGRAM_CHAT_ID_SYSTEM=
   ```

5. Terapkan perubahan (lihat awal [§8](#8-konfigurasi-lanjutan)).
6. *(Opsional)* Aktifkan perintah bot `/stats`, `/pending`, `/aspirations`, `/health`. Nilai `TELEGRAM_WEBHOOK_SECRET` sudah dibuat otomatis di `.env.production`:

   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/setWebhook" -d url=https://pst.tl/api/telegram/webhook -d secret_token=<TELEGRAM_WEBHOOK_SECRET>
   ```

   Bot hanya menjawab di grup yang terdaftar dalam variabel `TELEGRAM_*CHAT_ID`. Nginx hanya menerima webhook dari jaringan resmi Telegram.

### 8.3 E-mail (SMTP)

E-mail dipakai untuk: konfirmasi pendaftaran dan verifikasi anggota, undangan dan reset password admin, balasan aspirasi, serta peringatan akun terkunci. Selama `SMTP_HOST` kosong, tidak ada e-mail yang dikirim.

```ini
SMTP_HOST=smtp.penyedia-anda.com
SMTP_PORT=587
SMTP_SECURE=false          # true untuk port 465
SMTP_USER=no-reply@pst.tl
SMTP_PASSWORD=...
MAIL_FROM="PST — Partido Socialista de Timor <no-reply@pst.tl>"
MAIL_REPLY_TO=sekretariat@pst.tl
MAIL_ADMIN_INBOX=sekretariat@pst.tl   # salinan aspirasi & pesan kontak
```

> Agar e-mail tidak masuk spam, atur **SPF**, **DKIM**, dan **DMARC** untuk domain pengirim sesuai petunjuk penyedia SMTP Anda.

### 8.4 Perlindungan formulir publik (Cloudflare Turnstile, opsional)

Menambahkan tantangan anti-bot ringan pada formulir pendaftaran, aspirasi, dan kontak:

1. Buat *widget* Turnstile di dasbor Cloudflare untuk domain Anda.
2. Isi kedua nilai berikut. **Keduanya harus diisi bersamaan**:

   ```ini
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAA...
   TURNSTILE_SECRET_KEY=0x4AAAAAAA...
   ```

3. Buat ulang kontainer `app`. Nilai ini dibaca saat aplikasi berjalan, jadi tidak perlu build ulang.

### 8.5 Backup terenkripsi

Disarankan agar file backup dienkripsi sebelum disimpan atau disalin keluar server.

1. Di **komputer Anda** (bukan di server), buat pasangan kunci [age](https://age-encryption.org):

   ```bash
   age-keygen -o pst-backup-key.txt
   ```

   Perintah ini menampilkan *public key* (`age1...`). File `pst-backup-key.txt` adalah **private key**: simpan dengan aman dan **jangan pernah** taruh di server.

2. Di server, isi `.env.production`:

   ```ini
   BACKUP_ENCRYPTION_PUBLIC_KEY=age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

3. Terapkan dengan menjalankan ulang skrip. Backup berikutnya berakhiran `.age`.

Jadwal dan retensi (opsional):

```ini
BACKUP_SCHEDULE="0 2 * * *"   # setiap hari pukul 02:00 waktu Dili
BACKUP_KEEP_DAYS=14
BACKUP_KEEP_WEEKS=8
BACKUP_KEEP_MONTHS=6
```

### 8.6 Peta

Peta município memakai tile OpenStreetMap. Untuk penyedia lain:

```ini
NEXT_PUBLIC_MAP_TILE_URL=https://penyedia/{z}/{x}/{y}.png
NEXT_PUBLIC_MAP_ATTRIBUTION="© Penyedia"
```

> Jika domain tile diganti, tambahkan juga domain tersebut ke `img-src` pada `nginx/snippets/security-headers.conf`, lalu jalankan ulang skrip.

---

## 9. Mengimpor konten situs lama

Skrip impor memindahkan konten dari situs PHP lama (database `pst_db`): berita, artikel (beserta PDF), galeri, pimpinan, program, bagian "Tentang", anggota, dan pesan kontak. Impor ini **aman dijalankan ulang** karena tidak membuat duplikat.

**Yang dibutuhkan:** file `pst_db.sql` dan folder situs lama `pst-website` (yang berisi `uploads/`).

1. Unggah kedua bahan ke server (dari komputer Anda):

   ```bash
   scp pst_db.sql root@IP_VPS:/root/legacy/
   ```

   ```bash
   scp -r pst-website root@IP_VPS:/root/legacy/
   ```

2. Jalankan MariaDB sementara di jaringan Docker portal dan muat database lama:

   ```bash
   cd /opt/pst-portal
   ```

   ```bash
   export LEGACY_PW=$(openssl rand -hex 16)
   ```

   ```bash
   docker run -d --rm --name pst-legacy-db --network pst_backend -e MARIADB_ROOT_PASSWORD=$LEGACY_PW -e MARIADB_DATABASE=pst_db -v /root/legacy:/seed:ro mariadb:11
   ```

   Tunggu sekitar 20 detik, lalu:

   ```bash
   docker exec pst-legacy-db sh -c "mariadb -uroot -p$LEGACY_PW pst_db < /seed/pst_db.sql"
   ```

3. Uji coba (*dry run*, tidak ada yang ditulis):

   ```bash
   docker compose --env-file .env.production run --rm -v /root/legacy/pst-website:/legacy:ro -e LEGACY_SITE_ROOT=/legacy -e LEGACY_MYSQL_URL="mysql://root:$LEGACY_PW@pst-legacy-db:3306/pst_db" migrate npx tsx scripts/migrate-legacy.ts --dry-run
   ```

4. Jika ringkasan terlihat benar, jalankan impor sesungguhnya (perintah yang sama **tanpa** `--dry-run`):

   ```bash
   docker compose --env-file .env.production run --rm -v /root/legacy/pst-website:/legacy:ro -e LEGACY_SITE_ROOT=/legacy -e LEGACY_MYSQL_URL="mysql://root:$LEGACY_PW@pst-legacy-db:3306/pst_db" migrate npx tsx scripts/migrate-legacy.ts
   ```

5. Bersihkan. Database lama berisi hash password admin lama, jadi jangan dibiarkan:

   ```bash
   docker stop pst-legacy-db
   ```

   ```bash
   rm -rf /root/legacy && unset LEGACY_PW
   ```

Catatan:
- Anggota dari situs lama masuk dengan status **PENDING** dan harus diverifikasi ulang, karena situs lama tidak menyimpan nomor identitas maupun catatan persetujuan.
- Akun admin lama **tidak** diimpor. Buat ulang akun lewat menu Pengguna.
- Ikon program lama berupa emoji. Atur ikon baru (nama ikon Lucide, mis. `graduation-cap`) di **Website → Halaman**.

---

## 10. Data wilayah: suco & aldeia

Seed bawaan memuat **14 município** dan **69 posto administrativo**. Suco (±450) dan aldeia (±2.200) dimuat dari file CSV:

1. Siapkan `prisma/data/sucos-aldeias.csv` (contoh format ada di `prisma/data/sucos-aldeias.example.csv`):

   ```csv
   municipality_code,admin_post,suco,aldeia
   DI,Cristo Rei,Becora,Aldeia Contoh
   ```

   Kode município: `DI` Dili, `BA` Baucau, `ER` Ermera, `BO` Bobonaro, `VI` Viqueque, `LA` Lautém, `CO` Covalima, `AN` Ainaro, `MF` Manufahi, `LI` Liquiçá, `MT` Manatuto, `AL` Aileu, `OE` Oé-Cusse Ambeno, `AT` Ataúro.

2. Salin file ke server di `/opt/pst-portal/prisma/data/sucos-aldeias.csv`, lalu build ulang image tools dan jalankan seed:

   ```bash
   cd /opt/pst-portal
   ```

   ```bash
   docker compose --env-file .env.production build migrate
   ```

   ```bash
   docker compose --env-file .env.production run --rm migrate npx prisma db seed
   ```

> ⚠️ Daftar posto administrativo disusun dari sumber publik. Cocokkan dengan daftar resmi Kementerian Administrasi Negara (MAE), terutama untuk **Ataúro** dan kemungkinan **Hatulia B** di Ermera.

---

## 11. Verifikasi setelah instalasi

### Status layanan

```bash
cd /opt/pst-portal
```

```bash
docker compose --env-file .env.production ps
```

Semua layanan harus `Up`; `app` harus `(healthy)`. Layanan `migrate` boleh berstatus *Exited (0)*.

### Kesehatan sistem

```bash
curl -s https://pst.tl/api/health
```

Detail per komponen (database, Redis, antrean, notifikasi), dengan `HEALTHCHECK_TOKEN` dari `.env.production`:

```bash
curl -s -H "Authorization: Bearer <HEALTHCHECK_TOKEN>" "https://pst.tl/api/health?details=1"
```

### Smoke test otomatis (hanya-baca)

`WRITE=0` memastikan tes **tidak menulis data apa pun** ke sistem produksi:

```bash
docker compose --env-file .env.production run --rm --no-deps -e BASE_URL=http://app:3000 -e ORIGIN=https://pst.tl -e WRITE=0 migrate node scripts/test/smoke.mjs
```

### Pemeriksaan eksternal

- TLS: [SSL Labs](https://www.ssllabs.com/ssltest/), target nilai **A** atau **A+**
- Header keamanan: [securityheaders.com](https://securityheaders.com)
- HTTP/3: [http3check.net](https://http3check.net)

### Firewall & Fail2Ban

```bash
sudo ufw status verbose
```

```bash
sudo fail2ban-client status
```

---

## 12. Operasional harian

Jalankan semua perintah dari `/opt/pst-portal`. Untuk mempersingkat, buat alias:

```bash
echo "alias pst='docker compose --project-directory /opt/pst-portal --env-file /opt/pst-portal/.env.production'" >> ~/.bashrc && source ~/.bashrc
```

| Tugas | Perintah |
|---|---|
| Status layanan | `pst ps` |
| Log aplikasi (langsung) | `pst logs -f app` |
| Log worker | `pst logs -f worker` |
| Restart aplikasi | `pst restart app worker` |
| Hentikan semua | `pst down` *(data tetap aman di volume)* |
| Jalankan semua | `pst up -d` |
| Backup sekarang | `pst exec backup pg-backup` |
| Log akses Nginx | `tail -f /opt/pst-portal/data/nginx-logs/access.log` |
| IP yang diblokir | `sudo fail2ban-client status pst-auth` |
| Buka blokir IP | `sudo fail2ban-client set pst-auth unbanip 1.2.3.4` |
| Penggunaan disk Docker | `docker system df` |
| Bersihkan image lama | `docker image prune -f` |

Akun admin yang terkunci karena salah password berulang bisa dibuka oleh SUPER_ADMIN lewat **Pengguna → aksi → Buka kunci**, atau tunggu 15 menit.

---

## 13. Backup & pemulihan (restore)

### Yang dibackup otomatis

| Apa | Kapan | Lokasi | Retensi |
|---|---|---|---|
| Database (pg_dump, diverifikasi) | Setiap hari 02:00 Dili | `data/backups/daily/` | 14 hari |
| Salinan mingguan | Minggu | `data/backups/weekly/` | 8 minggu |
| Salinan bulanan | Tanggal 1 | `data/backups/monthly/` | 6 bulan |
| File unggahan (foto, PDF, kartu KTA) | Minggu | `data/backups/files/` | 8 minggu |

Jika backup gagal dan Telegram aktif, admin langsung menerima peringatan.

### ⚠️ Salin backup ke luar server

Backup yang hanya ada di VPS yang sama **tidak melindungi** dari kerusakan atau hilangnya VPS. Tarik backup secara berkala dari komputer atau server lain, misalnya:

```bash
rsync -avz root@IP_VPS:/opt/pst-portal/data/backups/ ./pst-backups/
```

### Restore database

1. Hentikan aplikasi:

   ```bash
   cd /opt/pst-portal
   ```

   ```bash
   docker compose --env-file .env.production stop app worker
   ```

2. Lihat daftar backup:

   ```bash
   ls -lh data/backups/daily/
   ```

3. Pulihkan (sistem meminta Anda mengetik nama database untuk konfirmasi):

   ```bash
   docker compose --env-file .env.production exec backup pg-restore-pst /backups/daily/pst-db-AAAAMMDD-HHMM.dump
   ```

   Untuk backup terenkripsi (`.age`), *private key* dibutuhkan **sementara**. Unggah ke server (mis. `scp pst-backup-key.txt root@IP_VPS:/root/`), salin ke kontainer, pulihkan, lalu hapus kembali dari kontainer **dan** dari `/root`:

   ```bash
   docker compose --env-file .env.production cp /root/pst-backup-key.txt backup:/tmp/key.txt
   ```

   ```bash
   docker compose --env-file .env.production exec -e AGE_KEY_FILE=/tmp/key.txt backup pg-restore-pst /backups/daily/pst-db-AAAAMMDD-HHMM.dump.age
   ```

   ```bash
   docker compose --env-file .env.production exec backup rm /tmp/key.txt && rm /root/pst-backup-key.txt
   ```

4. Jalankan kembali aplikasi:

   ```bash
   docker compose --env-file .env.production start app worker
   ```

### Restore file unggahan

Volume `pst_storage` dipulihkan lewat kontainer sementara (untuk arsip `.tar.gz.age`, dekripsi dulu di komputer Anda dengan `age -d -i pst-backup-key.txt`):

```bash
docker run --rm -v pst_storage:/storage -v /opt/pst-portal/data/backups/files:/b:ro alpine sh -c "cd /storage && tar -xzf /b/pst-storage-AAAAMMDD.tar.gz"
```

### Pindah ke server baru

1. Instal di server baru (§5), dengan `.env.production` **lama** disalin ke `/opt/pst-portal/` **sebelum** menjalankan skrip, sehingga semua kunci tetap sama.
2. Restore database (§13) dan file unggahan.
3. Arahkan DNS ke server baru, lalu jalankan ulang skrip untuk menerbitkan sertifikat.

---

## 14. Memperbarui aplikasi

```bash
cd /opt/pst-portal
```

```bash
git pull
```

```bash
sudo DOMAIN=pst.tl CERTBOT_EMAIL=tech@pst.tl ./deploy-ubuntu-26.04.sh
```

Skrip akan membangun ulang image, menerapkan migrasi database baru, dan me-restart layanan. Rahasia, data, dan sertifikat tidak disentuh.

> Saran: jalankan `pst exec backup pg-backup` sebelum memperbarui. Selama build dan restart (beberapa menit), pengunjung mungkin sesekali melihat halaman "Manutensaun / Pemeliharaan".

---

## 15. Rotasi kunci enkripsi

Jika ada dugaan `DATA_ENCRYPTION_KEY` bocor:

1. Buat kunci baru:

   ```bash
   openssl rand -base64 32
   ```

2. Di `.env.production`:

   ```ini
   DATA_ENCRYPTION_PREVIOUS_KEY=<nilai DATA_ENCRYPTION_KEY yang lama>
   DATA_ENCRYPTION_PREVIOUS_KEY_ID=<nilai DATA_ENCRYPTION_KEY_ID yang lama>
   DATA_ENCRYPTION_KEY=<kunci baru>
   DATA_ENCRYPTION_KEY_ID=k2027a
   ```

3. Terapkan (buat ulang `app` dan `worker`), lalu enkripsi ulang data lama. Lakukan dulu uji coba, lalu jalankan sungguhan:

   ```bash
   docker compose --env-file .env.production run --rm migrate npx tsx scripts/rotate-encryption-key.ts --dry-run
   ```

   ```bash
   docker compose --env-file .env.production run --rm migrate npx tsx scripts/rotate-encryption-key.ts
   ```

4. Setelah laporan menunjukkan **0 gagal**, hapus kedua variabel `DATA_ENCRYPTION_PREVIOUS_*` dan terapkan lagi.
5. Simpan `.env.production` baru secara offline (§7).

---

## 16. Pemecahan masalah

| Gejala | Kemungkinan penyebab & solusi |
|---|---|
| Skrip: *"Let's Encrypt failed"* | DNS belum mengarah ke VPS, atau port 80 terblokir (UFW / firewall penyedia). Situs tetap jalan dengan sertifikat *self-signed*. Perbaiki DNS/port, lalu jalankan ulang skrip |
| Browser: *"koneksi tidak aman"* | Masih memakai sertifikat sementara. Lihat baris di atas, atau periksa `ls /opt/pst-portal/data/letsencrypt/live/` |
| Halaman "Manutensaun / Pemeliharaan" | Aplikasi tidak merespons. Periksa `pst ps` dan `pst logs --tail 100 app` |
| `app` tidak *healthy* | Periksa `pst logs app`. Penyebab umum: variabel di `.env.production` salah ketik; database belum siap (`pst logs postgres`) |
| Tidak menerima Telegram | `TELEGRAM_ENABLED=true`? Bot sudah ditambahkan ke grup? Chat id benar (negatif untuk grup)? Lihat `pst logs worker` |
| E-mail tidak terkirim | `SMTP_HOST` kosong atau kredensial salah. Lihat `pst logs worker` (baris `[notify] EMAIL`) |
| Admin terkunci | SUPER_ADMIN lain bisa membuka kunci lewat menu Pengguna, atau tunggu 15 menit. IP diblokir Fail2Ban? Lihat [§12](#12-operasional-harian) |
| Admin kehilangan aplikasi 2FA | Masuk dengan **kode pemulihan**. Jika habis, SUPER_ADMIN lain dapat mereset 2FA lewat menu Pengguna |
| Satu-satunya SUPER_ADMIN lupa password & tanpa SMTP | Di server, jalankan seed dengan reset: `pst run --rm -e SEED_SUPER_ADMIN_RESET=true migrate npx prisma db seed`, lalu ambil password baru dari keluaran perintah |
| HTTP 429 *Too Many Requests* | Rate limit aktif (wajar untuk percobaan login berulang). Tunggu sebentar |
| Formulir publik selalu gagal *"verifikasi"* | Hanya satu dari dua kunci Turnstile yang diisi. Isi keduanya atau kosongkan keduanya ([§8.4](#84-perlindungan-formulir-publik-cloudflare-turnstile-opsional)) |
| Disk penuh | `docker system df`, lalu `docker image prune -f` dan `docker builder prune -f`. Periksa juga ukuran `data/backups` |
| Peta tidak tampil | Domain tile tidak diizinkan di CSP ([§8.6](#86-peta)) |

Log penting:

| Log | Lokasi |
|---|---|
| Instalasi | `/var/log/pst-deploy.log` |
| Aplikasi & worker | `pst logs app`, `pst logs worker` |
| Nginx | `/opt/pst-portal/data/nginx-logs/access.log`, `error.log` |
| Backup | `pst logs backup` |
| Audit (siapa melakukan apa) | Backoffice → **Log Audit** (peran AUDITOR/SUPER_ADMIN), termasuk tombol **Verifikasi integritas** |

---

## 17. Daftar periksa keamanan

- [ ] Login SSH hanya dengan kunci (`HARDEN_SSH=1`)
- [ ] Password admin awal sudah diganti; `/root/pst-initial-admin.txt` dihapus
- [ ] 2FA aktif untuk semua admin; kode pemulihan disimpan offline
- [ ] `.env.production` dan kunci KTA disalin offline; file `.pem` dihapus dari server
- [ ] Backup terenkripsi (`BACKUP_ENCRYPTION_PUBLIC_KEY`) dan **disalin ke luar server** secara berkala
- [ ] Telegram aktif agar peringatan keamanan diterima
- [ ] Setiap pengguna backoffice memakai akun sendiri dengan peran seminimal mungkin
- [ ] Koordinator munisipal hanya diberi município-nya sendiri
- [ ] `sudo ufw status` hanya menampilkan SSH, 80, 443/tcp, dan 443/udp
- [ ] Pembaruan sistem otomatis aktif (`unattended-upgrades`)
- [ ] Integritas log audit diperiksa berkala (Log Audit → Verifikasi integritas)
- [ ] Teks kebijakan privasi & persetujuan pendaftaran sudah disiapkan oleh partai

---

## 18. Lampiran: lokasi file & variabel penting

### Lokasi di server

| Path | Isi |
|---|---|
| `/opt/pst-portal/` | Kode sumber & konfigurasi |
| `/opt/pst-portal/.env.production` | Semua pengaturan & rahasia (mode 600) |
| `/opt/pst-portal/data/letsencrypt/` | Sertifikat TLS |
| `/opt/pst-portal/data/backups/` | Backup database & file |
| `/opt/pst-portal/data/nginx-logs/` | Log Nginx (dibaca Fail2Ban, rotasi harian 30 hari) |
| `/opt/pst-portal/data/.seeded` | Penanda bahwa seed awal sudah dijalankan |
| Volume Docker `pst_pgdata` | Data PostgreSQL |
| Volume Docker `pst_storage` | Foto, dokumen, kartu KTA (`public/` disajikan Nginx; `private/` hanya lewat tautan bertanda tangan) |
| `/etc/fail2ban/jail.d/pst.local` | Konfigurasi Fail2Ban |
| `/var/log/pst-deploy.log` | Log instalasi |

### Variabel yang dibuat otomatis (jangan diubah tanpa alasan)

`POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `REDIS_PASSWORD`, `AUTH_SECRET`, `DATA_ENCRYPTION_KEY`, `BLIND_INDEX_KEY`, `KTA_SIGNING_PRIVATE_KEY`, `KTA_SIGNING_PUBLIC_KEY`, `HEALTHCHECK_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, serta `DATABASE_URL`, `MIGRATE_DATABASE_URL`, `REDIS_URL`, `APP_URL` dan URL turunan domain lainnya.

> ⚠️ Mengganti `BLIND_INDEX_KEY` akan merusak deteksi duplikat nomor identitas. Mengganti `KTA_SIGNING_PRIVATE_KEY` tanpa prosedur rotasi membuat semua kartu KTA lama dianggap tidak sah.

### Variabel yang biasanya Anda isi

| Kelompok | Variabel |
|---|---|
| Telegram | `TELEGRAM_ENABLED`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, `TELEGRAM_CHAT_ID_*` |
| E-mail | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `MAIL_REPLY_TO`, `MAIL_ADMIN_INBOX` |
| Backup | `BACKUP_ENCRYPTION_PUBLIC_KEY`, `BACKUP_SCHEDULE`, `BACKUP_KEEP_*` |
| Anti-bot | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` |
| Peta | `NEXT_PUBLIC_MAP_TILE_URL`, `NEXT_PUBLIC_MAP_ATTRIBUTION` |
| Keamanan sesi | `SESSION_TTL_HOURS`, `SESSION_IDLE_TIMEOUT_MINUTES`, `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCKOUT_MINUTES`, `PASSWORD_MAX_AGE_DAYS`, `TWO_FACTOR_REQUIRED_ROLES` |

Penjelasan setiap variabel ada di `.env.example`. Detail teknis arsitektur ada di [`docs/ARCHITECTURE.md`](ARCHITECTURE.md).
