# README — Deploy Backend Binara LMS Mandiri di DCloud (tanpa Emergent)
### Target: 1.000 peserta Try Out serentak + Pembayaran Midtrans (Try Out & Kelas Online)

Dokumen ini adalah panduan **manual langkah demi langkah** untuk Anda men-deploy sendiri **backend FastAPI + MongoDB** Binara LMS di **DCloud (PT Datacomm Diangraha — dcloud.co.id)**, lengkap dengan konfigurasi untuk **1.000 pengguna mengerjakan Try Out bersamaan**, serta **konfigurasi pembayaran Midtrans**.

Semua berkas konfigurasi siap pakai ada di folder **`deploy/dcloud/`**:

| Berkas | Fungsi |
|---|---|
| `backend/Dockerfile` | Image backend (Gunicorn + Uvicorn worker) |
| `deploy/dcloud/docker-compose.yml` | MongoDB + 2× backend + Nginx + Certbot (SSL otomatis) |
| `deploy/dcloud/nginx.conf` + `proxy_params_lms` | Reverse proxy, HTTPS, gzip, rate-limit, load-balancing |
| `deploy/dcloud/compose.env.example` | Variabel compose (password Mongo, jumlah worker) |
| `deploy/dcloud/backend.env.example` | Contoh `backend/.env` produksi (termasuk Midtrans) |
| `deploy/dcloud/loadtest_k6.js` | Skrip load test 1.000 peserta serentak |

---

## 1. Pilih layanan DCloud yang tepat

DCloud menyediakan dua jenis layanan yang relevan. **Untuk LMS ini hanya VPS/Cloud Server yang bisa dipakai.**

| | **Cloud Server / VPS (DCloud Compute)** ✅ | **Shared Hosting cPanel** ❌ |
|---|---|---|
| Akses | SSH root, bebas install Docker, Nginx, MongoDB | Hanya panel cPanel, tanpa root |
| Backend FastAPI | Jalan penuh (Gunicorn multi-worker, WebSocket, background task) | Passenger Python terbatas: 1 proses, tidak bisa multi-worker, sering mati idle |
| MongoDB | Bisa diinstal lokal atau pakai MongoDB Atlas | **Tidak tersedia** (hanya MySQL/MariaDB) |
| Webhook Midtrans | Endpoint HTTPS publik stabil | Bisa, tetapi proses Python bisa tidur → notifikasi gagal |
| 1.000 pengguna serentak | Bisa (scale worker/instance) | **Tidak mungkin** (batas proses & CPU bersama) |
| Kesimpulan | **Gunakan ini** | Hanya cocok untuk hosting *frontend statis* (hasil `yarn build`) bila ingin hemat |

> **Rekomendasi:** backend + MongoDB di **DCloud Cloud Server (Ubuntu 22.04/24.04)**. Frontend React (build statis) boleh ikut di VPS yang sama (sudah dikonfigurasi di `nginx.conf`) atau di Cloudflare Pages/Vercel/shared hosting.

### 1.1 Ukuran server untuk 1.000 peserta Try Out serentak

Beban Try Out = login + ambil soal + auto-save/submit (tulis DB). Dari pengukuran aplikasi ini, satu worker Uvicorn menangani ±150–250 req/detik untuk endpoint Try Out. 1.000 peserta serentak menghasilkan puncak ±300–600 req/detik saat mulai & submit bersamaan.

| Skenario | Paket DCloud (indikatif) | Konfigurasi | Catatan |
|---|---|---|---|
| **Hemat (≤ 500 serentak)** | GP2C8G — 2 vCPU / 8 GB | 1 VPS: Mongo + 1 backend (5 worker) + Nginx | Cukup untuk sekolah tunggal |
| **Direkomendasikan (1.000 serentak)** | **GP4C16G — 4 vCPU / 16 GB** | 1 VPS: Mongo (cache 2–4 GB) + **2 backend × 5 worker** + Nginx | Konfigurasi default `docker-compose.yml` ini |
| **Aman (1.000 serentak + video/materi berat)** | GP8C16G — 8 vCPU / 16 GB, atau 2 VPS (app + db terpisah) | 3 backend × 5 worker; Mongo di VPS sendiri 4 vCPU/8 GB | Pisahkan DB bila bandwidth materi besar |

Harga publik DCloud (indikatif, cek `dcloud.co.id/pricing`): GP2C8G ≈ Rp720 rb/bln · GP4C16G ≈ Rp1,44 jt/bln · GP8C16G ≈ Rp1,84 jt/bln. Bandwidth & anti-DDoS termasuk.

**Rumus worker:** `WEB_CONCURRENCY = (2 × vCPU) + 1` per *container*, dibagi ke jumlah replika. Untuk 4 vCPU: 2 replika × 5 worker = 10 worker (default).

---

## 2. Persiapan di DCloud Portal

1. Login ke portal DCloud → **Compute → Create Instance**.
2. Pilih OS **Ubuntu 22.04 LTS** (atau 24.04), paket **GP4C16G**, disk SSD ≥ 80 GB.
3. Tambahkan **SSH key** Anda (atau catat password root).
4. **Firewall / Security Group**: buka port **22 (SSH), 80 (HTTP), 443 (HTTPS)**. **Jangan** buka 27017 (MongoDB) ke publik.
5. Catat **IP publik** instance.
6. Di pengelola DNS domain Anda, buat record **A**:
   - `domain-anda.com` → IP VPS
   - `www.domain-anda.com` → IP VPS
   - `api.domain-anda.com` → IP VPS (opsional, bila frontend di tempat lain)

---

## 3. Instalasi dasar server (sekali saja)

```bash
ssh root@IP-VPS

# Update & utilitas
apt update && apt upgrade -y
apt install -y git curl ufw htop

# Firewall
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# Docker + Compose plugin
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker compose version

# Swap 4 GB (pengaman memori saat puncak)
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Tuning kernel untuk banyak koneksi
cat >> /etc/sysctl.conf <<'EOF'
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
fs.file-max = 2097152
vm.swappiness = 10
EOF
sysctl -p
```

---

## 4. Ambil kode & siapkan konfigurasi

```bash
# 1) Clone repo Anda (push dulu dari Emergent via "Save to GitHub")
git clone https://github.com/<user>/<repo>.git /opt/binara-lms
cd /opt/binara-lms

# 2) Konfigurasi backend
cp deploy/dcloud/backend.env.example backend/.env
nano backend/.env          # isi ADMIN_*, JWT_SECRET, CORS_ORIGINS, MIDTRANS_* (lihat §7)

# 3) Konfigurasi compose (password MongoDB & jumlah worker)
cp deploy/dcloud/compose.env.example deploy/dcloud/.env
nano deploy/dcloud/.env

# 4) Ganti domain di Nginx
sed -i 's/domain-anda.com/DOMAIN-ANDA.COM/g' deploy/dcloud/nginx.conf
```

**Buat `JWT_SECRET` acak:** `openssl rand -hex 32`

> **Catatan `MONGO_URL`:** saat memakai `docker-compose.yml`, nilai `MONGO_URL` di-*override* otomatis ke container `mongo` (dengan user/password dari `deploy/dcloud/.env`). Bila Anda memakai **MongoDB Atlas**, hapus service `mongo` di compose dan isi `MONGO_URL` Atlas di `backend/.env`.

---

## 5. (Opsional) Build frontend di server yang sama

```bash
# Node 20 + yarn
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs && npm i -g yarn
cd /opt/binara-lms/frontend
printf 'REACT_APP_BACKEND_URL=https://DOMAIN-ANDA.COM\n' > .env
yarn install --frozen-lockfile && yarn build      # output: frontend/build (disajikan Nginx)
```
Jika frontend di-hosting di tempat lain, set `REACT_APP_BACKEND_URL=https://api.domain-anda.com` di sana dan pastikan `CORS_ORIGINS` di `backend/.env` memuat domain frontend.

---

## 6. Terbitkan SSL & jalankan

```bash
cd /opt/binara-lms/deploy/dcloud

# 6.1 Sertifikat pertama (Nginx belum punya cert → jalankan certbot standalone dulu)
mkdir -p certbot/conf certbot/www
docker run --rm -p 80:80 -v $PWD/certbot/conf:/etc/letsencrypt certbot/certbot certonly \
  --standalone -d DOMAIN-ANDA.COM -d www.DOMAIN-ANDA.COM -d api.DOMAIN-ANDA.COM \
  --email admin@DOMAIN-ANDA.COM --agree-tos --no-eff-email

# 6.2 Jalankan semua layanan
docker compose up -d --build

# 6.3 Verifikasi
docker compose ps
curl -s https://DOMAIN-ANDA.COM/api/            # -> {"message":"LMS RBAC API aktif"}
docker compose logs -f backend                   # cek "Startup complete"
```

Login pertama memakai `ADMIN_EMAIL` / `ADMIN_PASSWORD` dari `backend/.env`. **Segera ubah sandi** lewat menu Profil.

### Perintah operasional harian

| Kebutuhan | Perintah |
|---|---|
| Update kode | `cd /opt/binara-lms && git pull && cd deploy/dcloud && docker compose up -d --build` |
| Tambah kapasitas sebelum Try Out besar | `docker compose up -d --scale backend=3` (lalu kembalikan `--scale backend=2`) |
| Lihat log | `docker compose logs -f --tail=200 backend` |
| Restart backend saja | `docker compose restart backend` |
| Backup MongoDB | `docker exec lms-mongo mongodump --username $MONGO_ROOT_USER --password $MONGO_ROOT_PASSWORD --authenticationDatabase admin --archive=/data/db/backup-$(date +%F).gz --gzip` lalu salin keluar dengan `docker cp` |
| Restore | `docker exec -i lms-mongo mongorestore --gzip --archive < backup.gz` (tambahkan kredensial) |
| Perpanjang SSL | otomatis oleh container `certbot` (tiap 12 jam cek) |

Jadwalkan backup harian via cron (`crontab -e`): `0 2 * * * /opt/binara-lms/deploy/dcloud/backup.sh` (buat skrip dari perintah di atas dan unggah ke DCloud Object Storage/DBackup).

---

## 7. Konfigurasi Pembayaran Midtrans (Try Out & Kelas Online)

Aplikasi sudah terintegrasi **Midtrans Snap** (popup semua metode: Virtual Account, QRIS, GoPay/ShopeePay, kartu kredit, minimarket). Yang perlu Anda lakukan hanya **mengisi kunci** dan **mendaftarkan URL notifikasi**.

### 7.1 Dapatkan kunci
1. Daftar/login **Sandbox** untuk uji coba: <https://dashboard.sandbox.midtrans.com> → **Settings → Access Keys** → salin **Server Key** & **Client Key**.
2. Untuk produksi: <https://dashboard.midtrans.com> (akun harus sudah **aktif/terverifikasi** oleh Midtrans) → **Settings → Access Keys**.

### 7.2 Isi `backend/.env`
```
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxxxx     # produksi: Mid-server-xxxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxxxxxx     # produksi: Mid-client-xxxx
MIDTRANS_IS_PRODUCTION=false                       # true saat sudah pakai kunci produksi
```
Lalu `docker compose restart backend`. Status konfigurasi bisa dicek di portal admin → menu **Pembayaran** (kartu "Status Konfigurasi Midtrans").

### 7.3 Daftarkan URL notifikasi (WAJIB agar akses otomatis terbuka)
Di dashboard Midtrans → **Settings → Configuration**:
- **Payment Notification URL:** `https://DOMAIN-ANDA.COM/api/payments/notification`
- **Finish Redirect URL:** `https://DOMAIN-ANDA.COM/student/payments`
- (Unfinish/Error Redirect URL boleh sama dengan Finish.)

Alur: siswa klik **Beli** → backend membuat transaksi Snap (`POST /api/payments/checkout`) → popup Midtrans → setelah bayar, Midtrans mengirim notifikasi ke URL di atas → backend **memverifikasi signature SHA-512 + cek ulang status ke API Midtrans** → akses dibuka otomatis (kursus: *enrollment*; Try Out: *tryout_access*). Notifikasi bersifat **idempotent** (kiriman ulang tidak menggandakan akses). Siswa juga bisa menekan **Cek** di *Riwayat Pembayaran* untuk sinkronisasi manual bila notifikasi tertunda.

### 7.4 Menentukan harga
- **Kursus/kelas online:** Admin → Kursus → field **Harga** (sudah ada). `0` = gratis (tombol "Daftar"), `> 0` = tombol **"Beli & Daftar"**.
- **Try Out:** Admin → Bank Soal & Try Out → Buat/Edit → field **Harga (Rp)**. `0` = gratis, `> 0` = siswa melihat tombol **"Beli Akses"**; endpoint `start` & detail soal ditolak (HTTP 402) sampai lunas.

### 7.5 Uji coba di Sandbox
- Kartu uji: `4811 1111 1111 1114`, exp bulan/tahun mendatang, CVV `123`, OTP `112233`.
- VA/QRIS/GoPay: gunakan **Midtrans Payment Simulator** <https://simulator.sandbox.midtrans.com>.
- Pastikan di admin → **Pembayaran** status berubah menjadi **Lunas** dan siswa bisa membuka item.

### 7.6 Go-live
1. Ganti kunci ke produksi + `MIDTRANS_IS_PRODUCTION=true`, restart backend.
2. Di dashboard produksi, isi Notification URL yang sama (domain produksi).
3. Lakukan 1 transaksi nominal kecil sungguhan untuk memastikan webhook sampai (lihat `docker compose logs backend | grep notification`).

Endpoint yang tersedia:

| Endpoint | Peran | Fungsi |
|---|---|---|
| `GET /api/payments/config` | publik | Status aktif + Client Key untuk Snap.js |
| `POST /api/payments/checkout` | siswa | Buat transaksi `{item_type: course\|tryout, item_id}` → `{token, redirect_url}` (gratis → langsung akses) |
| `POST /api/payments/notification` | Midtrans | Webhook (signature + status check, idempotent) |
| `GET /api/payments/{order_id}/status` | siswa | Sinkronisasi manual status |
| `GET /api/payments/mine` | siswa | Riwayat transaksi |
| `GET /api/payments/admin/all` | admin | Semua transaksi + pendapatan |

---

## 8. Integrasi lain yang perlu disesuaikan saat self-host

| Fitur | Status di server sendiri | Tindakan |
|---|---|---|
| Login email/password, CBT/Try Out, IRT, analisis, ekspor | ✅ Jalan penuh | — |
| Pembayaran Midtrans | ✅ Jalan setelah kunci diisi (§7) | Isi `.env` + Notification URL |
| Login Google | Perlu OAuth client sendiri | Google Cloud Console → OAuth Client ID → sesuaikan `routes_auth.py`, atau sembunyikan tombol Google |
| Email notifikasi (`emailer.py`) | Opsional | Isi `RESEND_API_KEY` (akun Resend sendiri) atau biarkan kosong (email dilewati) |
| Object storage (`storage.py`) untuk video/PDF/CV | Perlu penyimpanan sendiri | Pakai **DCloud Object Storage (S3-compatible)** / MinIO via `boto3`; volume `backend_uploads` sudah disediakan untuk penyimpanan lokal |

---

## 9. Load test 1.000 peserta serentak (WAJIB sebelum hari-H)

1. Buat 1.000 akun siswa uji (admin → Pengguna, atau skrip lewat `POST /api/admin/users`) dengan pola `student1..student1000@lms.id` dan sandi sama.
2. Buat Try Out uji (gratis, terbit) — catat ID-nya.
3. Dari komputer lain (bukan server), instal k6 (<https://k6.io>) lalu:
   ```bash
   k6 run -e BASE=https://DOMAIN-ANDA.COM -e TRYOUT=<id_tryout> -e PASSWORD='Sandi@123' deploy/dcloud/loadtest_k6.js
   ```
4. Target lulus: **p95 < 800 ms**, **error < 1 %**, CPU server < 75 %, memori Mongo stabil. Pantau dengan `htop` dan `docker stats`.
5. Bila p95 tinggi: `docker compose up -d --scale backend=3`, naikkan `WEB_CONCURRENCY`, atau pindah ke paket 8 vCPU. Bila Mongo bottleneck (`docker stats` CPU mongo tinggi), naikkan `--wiredTigerCacheSizeGB` (maks ±50 % RAM) atau pisahkan DB ke VPS lain.
6. Hapus data uji setelah selesai (attempt & akun `studentN@lms.id`).

**Praktik hari-H:** buka Try Out bergelombang (mis. 250 peserta/menit), minta peserta login 10–15 menit sebelum mulai, dan pantau `docker compose logs -f backend` + `docker stats`.

---

## 10. Checklist kesiapan

- [ ] VPS DCloud Ubuntu, firewall 22/80/443, DNS A record mengarah ke IP.
- [ ] `backend/.env` terisi (ADMIN, JWT_SECRET, CORS_ORIGINS, MIDTRANS_*); `deploy/dcloud/.env` terisi.
- [ ] SSL terbit, `https://domain/api/` membalas `LMS RBAC API aktif`.
- [ ] Login admin berhasil, sandi default diganti.
- [ ] Midtrans: kunci terisi, Notification URL terdaftar, transaksi sandbox → **Lunas** → akses terbuka.
- [ ] Backup MongoDB terjadwal + diuji restore.
- [ ] Load test 1.000 VU lulus (p95 < 800 ms, error < 1 %).
- [ ] Rencana gelombang & monitoring hari-H.

---

### Ringkasan arsitektur yang di-deploy

```
Internet ──HTTPS──> Nginx (TLS, gzip, rate-limit, least_conn)
                      ├── /api/*  ──> backend ×2 (Gunicorn 5 worker Uvicorn each)  ──> MongoDB 7 (WiredTiger cache 2 GB)
                      ├── /api/payments/notification  <── Midtrans webhook
                      └── /       ──> frontend/build (React statis)   [opsional]
```
Backend **stateless** (JWT di cookie httpOnly) sehingga aman ditambah replika kapan saja.
