# 🚀 Panduan Deploy Binara LMS — Hemat, Server Indonesia, Kuat untuk 1.000 Pengguna Serentak

> Panduan ini ditulis untuk **pemula total**. Ikuti dari atas ke bawah, satu per satu. Setiap perintah tinggal **salin–tempel** di terminal server. Tujuan akhir: aplikasi Anda **online di domain sendiri**, **murah**, **server di Indonesia (latensi rendah)**, dan **sanggup 1.000 siswa mengerjakan Try Out bersamaan tanpa error**.

Dokumen lain yang melengkapi:
- `README_DCLOUD.md` — versi khusus provider DCloud + detail **pembayaran Midtrans**.
- `DEPLOYMENT_MANDIRI.md` — skala sangat besar (10.000 serentak, multi-server).
- Semua file konfigurasi siap pakai ada di folder **`deploy/dcloud/`** (bisa dipakai di VPS mana pun, bukan hanya DCloud).

---

## 📋 Daftar Isi
1. [Memahami aplikasi Anda (2 menit)](#1-memahami-aplikasi-anda)
2. [Pilih hosting — mana yang harus saya pilih?](#2-pilih-hosting)
3. [Perkiraan biaya & keputusan akhir](#3-perkiraan-biaya)
4. [Langkah A — Buat VPS](#langkah-a--buat-vps)
5. [Langkah B — Siapkan domain & DNS](#langkah-b--domain--dns)
6. [Langkah C — Setup server (sekali saja)](#langkah-c--setup-server)
7. [Langkah D — Ambil kode Anda dari GitHub](#langkah-d--ambil-kode)
8. [Langkah E — Isi konfigurasi (.env)](#langkah-e--isi-konfigurasi)
9. [Langkah F — Build tampilan (frontend)](#langkah-f--build-frontend)
10. [Langkah G — Nyalakan HTTPS & jalankan](#langkah-g--jalankan)
11. [Langkah H — Login admin & cek](#langkah-h--login-admin)
12. [Fitur opsional (Google, Email, Pembayaran, Upload file)](#fitur-opsional)
13. [Kenapa ini kuat untuk 1.000 serentak?](#kenapa-kuat-1000)
14. [Uji beban 1.000 user (WAJIB sebelum ujian besar)](#uji-beban)
15. [Operasional harian & backup](#operasional-harian)
16. [Kalau ada masalah (troubleshooting)](#troubleshooting)

---

<a name="1-memahami-aplikasi-anda"></a>
## 1. Memahami aplikasi Anda

Aplikasi Anda punya 3 bagian. Semua akan berjalan **di satu VPS** supaya murah:

| Bagian | Teknologi | Tugasnya |
|---|---|---|
| **Frontend** | React (hasil `yarn build` = file statis) | Tampilan web yang dilihat siswa, tentor, admin |
| **Backend** | FastAPI (Python) | "Otak" aplikasi: login, soal, penilaian, dll (semua di alamat `/api`) |
| **Database** | MongoDB | Tempat menyimpan data: user, soal, nilai, dll |

Tambahan yang membungkus semuanya:
- **Nginx** → pintu depan: mengatur HTTPS, membagi lalu lintas ke backend, menyajikan frontend, dan **menyeimbangkan beban** ke 2 backend.
- **Docker** → "kotak" yang membuat semua bagian jalan dengan 1 perintah, tanpa ribet instalasi manual.

> **Kabar baik:** semua konfigurasi berat (Nginx tuning, 2 backend, pool database, rate-limit, gzip, HTTP/2) **sudah dibuatkan** di folder `deploy/dcloud/`. Anda tinggal mengisi domain & password lalu menjalankan.

---

<a name="2-pilih-hosting"></a>
## 2. Pilih hosting — mana yang harus saya pilih?

Karena siswa & tentor Anda ada di **Indonesia**, pakailah **datacenter Jakarta** supaya loadingnya cepat & stabil meski internet siswa agak lemot. Jangan pakai shared hosting cPanel (tidak bisa Docker/MongoDB). **Yang Anda butuhkan adalah VPS / Cloud Server (ada akses SSH root).**

### Perbandingan VPS (spesifikasi incaran: 4 vCPU / 8 GB RAM, datacenter Jakarta)

| Provider | Paket | Lokasi | Harga/bulan (estimasi)* | Catatan |
|---|---|---|---:|---|
| **Biznet Gio — NEO Lite** | MM 8.4 (4 vCPU / 8 GB / 60 GB) | 🇮🇩 Jakarta | **± Rp269.000** (promo) | **Termurah di Indonesia.** vCPU "shared" → cukup bila pakai *staggered start*. |
| **Biznet Gio — NEO Virtual** | 4 vCPU / 16 GB | 🇮🇩 Jakarta | ± Rp1,0 – 1,4 jt | vCPU **dedicated** → paling stabil untuk ujian serentak. **Rekomendasi utama.** |
| **Rumahweb VPS** | XL (4 vCPU / 8 GB) | 🇮🇩 Indonesia | ± Rp250.000 | Murah, cek apakah lokasi Jakarta. |
| **KlikServer** | Vipie 8.4 (4 core / 8 GB / 160 GB NVMe) | 🇮🇩 Jakarta | ± Rp600.000 | Disk NVMe besar. |
| **IDCloudHost** | Cloud VPS 4 vCPU / 8 GB | 🇮🇩 Jakarta | ± Rp650.000 – 900.000 | Panel mudah untuk pemula. |
| **DomaiNesia** | Pluton 8 GB | 🇮🇩 Jakarta | ± Rp1,7 jt | Managed, cocok bila mau dibantu. |
| **DCloud (Datacomm)** | GP4C16G (4 vCPU / 16 GB) | 🇮🇩 Jakarta | ± Rp1,44 jt | Enterprise + anti-DDoS (lihat `README_DCLOUD.md`). |
| Contabo | VPS (4 vCPU / 8 GB) | 🇸🇬 Singapura | ± €5,5 (±Rp95 rb) | **Paling murah sticker**, tapi **bukan Indonesia** → latensi +20–40 ms. Alternatif super hemat. |

\* Harga **berubah-ubah & sering promo**. Selalu cek langsung di situs provider sebelum membeli. Angka di atas hasil pengecekan pasar terbaru sebagai patokan.

### 👉 Rekomendasi tegas (pilih salah satu)

- **Kalau mau PALING MURAH tapi tetap Indonesia:** **Biznet Gio NEO Lite 4 vCPU / 8 GB (± Rp269 rb/bln)**. Sanggup 1.000 siswa **asalkan** Anda membuka Try Out **bergelombang** (staggered start, dijelaskan di [bagian 13](#kenapa-kuat-1000)).
- **Kalau mau PALING AMAN & TENANG untuk 1.000 serentak (rekomendasi utama):** **Biznet Gio NEO Virtual / DCloud GP4C16G — 4 vCPU / 16 GB (± Rp1–1,5 jt/bln)**. vCPU dedicated + RAM lega → nyaris tanpa drama di hari ujian.
- **Kalau budget super mepet & tak masalah server luar:** **Contabo Singapura 4 vCPU / 8 GB (±Rp95 rb/bln)**. Masih cepat untuk Indonesia (beda ±30 ms saja).

> **Spesifikasi minimum yang harus Anda beli:** **4 vCPU, 8 GB RAM, disk SSD/NVMe ≥ 60 GB, OS Ubuntu 22.04 (atau 24.04).** Jangan ambil di bawah ini untuk target 1.000 serentak.

---

<a name="3-perkiraan-biaya"></a>
## 3. Perkiraan biaya & keputusan akhir

| Kebutuhan | Yang dibayar | Biaya/bulan |
|---|---|---:|
| **VPS** (wajib) | Biznet Gio NEO Lite 4C/8GB | ± Rp269.000 |
| **Domain** (wajib, dibayar tahunan) | `.com` ± Rp150–200 rb/th → per bulan | ± Rp15.000 |
| **SSL/HTTPS** | Let's Encrypt (sudah otomatis di config) | **Rp0** (gratis) |
| **CDN + anti-DDoS** (opsional tapi disarankan) | Cloudflare Free | **Rp0** (gratis) |
| **Email notifikasi** (opsional) | Brevo Free (300 email/hari) | **Rp0** |
| **Pembayaran online** (opsional) | Midtrans (potong per transaksi) | Rp0 biaya bulanan |
| **TOTAL minimum** | | **± Rp285.000 / bulan** |
| **TOTAL nyaman (4C/16GB)** | NEO Virtual/DCloud | **± Rp1,05 – 1,5 jt / bulan** |

**Keputusan paling umum untuk bimbel/sekolah:** mulai dari **NEO Lite 4C/8GB (± Rp285 rb/bln total)**. Jika saat *load test* ([bagian 14](#uji-beban)) ternyata CPU mentok > 80%, **naikkan (upgrade) ke 4C/16GB** cukup beberapa klik di panel provider — datanya tetap aman.

---

<a name="langkah-a--buat-vps"></a>
## Langkah A — Buat VPS

Contoh memakai **Biznet Gio** (provider lain mirip):

1. Daftar & login di **https://www.biznetgio.com** → masuk **Portal / Console**.
2. Pilih **NEO Lite** (termurah) atau **NEO Virtual** (lebih stabil) → **Create / Buat**.
3. Pengaturan saat membuat:
   - **OS:** Ubuntu **22.04 LTS** (atau 24.04).
   - **Paket:** 4 vCPU / 8 GB (atau 16 GB).
   - **Disk:** SSD/NVMe **≥ 60 GB**.
   - **Lokasi:** **Jakarta**.
   - **SSH key / Password root:** buat password root yang kuat **dan catat baik-baik**.
4. Setelah jadi, catat **IP Publik** server (contoh: `103.x.x.x`).
5. **Firewall / Security Group:** buka port **22** (SSH), **80** (HTTP), **443** (HTTPS). **JANGAN** buka port **27017** (itu database, harus tertutup dari internet).

---

<a name="langkah-b--domain--dns"></a>
## Langkah B — Siapkan domain & DNS

1. Beli domain (mis. di Niagahoster/Rumahweb/DomaiNesia), contoh: `binaralms.com`.
2. Di pengaturan DNS domain, buat **record tipe A** yang mengarah ke **IP VPS** Anda:

   | Tipe | Nama | Nilai (Isi) |
   |---|---|---|
   | A | `@` (atau `binaralms.com`) | `103.x.x.x` (IP VPS) |
   | A | `www` | `103.x.x.x` |

3. Tunggu 5–30 menit agar DNS menyebar. Cek dari laptop: `ping binaralms.com` harus menunjuk ke IP VPS.

> **Tips (opsional, sangat disarankan):** daftarkan domain ke **Cloudflare (gratis)** → dapat CDN + proteksi DDoS + sembunyikan IP asli. Jika pakai Cloudflare, set DNS di Cloudflare (bukan di registrar) dan **matikan dulu proxy (awan abu-abu)** saat menerbitkan SSL pertama kali, lalu nyalakan lagi.

---

<a name="langkah-c--setup-server"></a>
## Langkah C — Setup server (cukup sekali)

Dari laptop Anda, masuk ke server lewat SSH (Windows: pakai **PowerShell** atau **PuTTY**):

```bash
ssh root@IP-VPS-ANDA
```

Lalu salin–tempel blok berikut **seluruhnya** (menginstal Docker, firewall, swap, dan tuning untuk ribuan koneksi):

```bash
# 1) Update sistem + utilitas
apt update && apt upgrade -y
apt install -y git curl ufw htop

# 2) Firewall: hanya buka 22, 80, 443
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# 3) Install Docker + plugin Compose
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker compose version   # pastikan muncul versinya

# 4) Swap 4 GB (jaring pengaman memori saat puncak ujian)
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# 5) Tuning kernel untuk BANYAK koneksi sekaligus (1.000+ user)
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

<a name="langkah-d--ambil-kode"></a>
## Langkah D — Ambil kode Anda dari GitHub

1. Di chat Emergent, klik tombol **"Save to GitHub"** → pilih/buat repo → **Push**.
2. Di server, clone repo Anda:

```bash
git clone https://github.com/<user-anda>/<repo-anda>.git /opt/binara-lms
cd /opt/binara-lms
```

> Ganti `<user-anda>/<repo-anda>` sesuai repo GitHub Anda.

---

<a name="langkah-e--isi-konfigurasi"></a>
## Langkah E — Isi konfigurasi (.env)

Kita isi **3 hal**: `backend/.env`, `deploy/dcloud/.env`, dan domain di Nginx.

```bash
cd /opt/binara-lms

# 1) Konfigurasi backend
cp deploy/dcloud/backend.env.example backend/.env
nano backend/.env          # isi lalu simpan (Ctrl+O, Enter, Ctrl+X)

# 2) Konfigurasi compose (password MongoDB & jumlah worker)
cp deploy/dcloud/compose.env.example deploy/dcloud/.env
nano deploy/dcloud/.env

# 3) Ganti domain di Nginx (ketik huruf besar persis seperti contoh)
sed -i 's/domain-anda.com/BINARALMS.COM/g' deploy/dcloud/nginx.conf
```

**Isi minimum `backend/.env`:**
```env
DB_NAME=binara_lms
ADMIN_EMAIL=admin@binaralms.com
ADMIN_PASSWORD=GantiPasswordAdminKuat123!
JWT_SECRET=<tempel hasil: openssl rand -hex 32>
CORS_ORIGINS=https://binaralms.com,https://www.binaralms.com
# (MONGO_URL otomatis diisi oleh docker-compose, biarkan apa adanya)
```

Buat `JWT_SECRET` acak dengan perintah:
```bash
openssl rand -hex 32
```
Salin hasilnya ke `JWT_SECRET`.

**Isi `deploy/dcloud/.env`:**
```env
MONGO_ROOT_USER=lmsadmin
MONGO_ROOT_PASSWORD=GantiPasswordMongoKuat123!
WEB_CONCURRENCY=5
```

> **Yang WAJIB diisi hanya:** `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `JWT_SECRET`, `CORS_ORIGINS`, dan password Mongo. Sisanya (Google, Email, Midtrans, R2) **opsional** — lihat [Fitur opsional](#fitur-opsional). Tanpa itu pun aplikasi inti (login, Try Out, penilaian, IRT, analisis, ekspor) **jalan 100%**.

---

<a name="langkah-f--build-frontend"></a>
## Langkah F — Build tampilan (frontend)

```bash
# Install Node 20 + yarn (sekali saja)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs && npm i -g yarn

# Build frontend
cd /opt/binara-lms/frontend
printf 'REACT_APP_BACKEND_URL=https://BINARALMS.COM\n' > .env
# (opsional) kalau pakai login Google sendiri, tambahkan client ID Anda:
# printf 'REACT_APP_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com\n' >> .env
yarn install --frozen-lockfile
yarn build      # hasilnya di folder frontend/build (disajikan Nginx otomatis)
```

> Ganti `BINARALMS.COM` dengan domain Anda. Alamat ini dipakai browser untuk memanggil backend, jadi harus **persis** domain Anda (pakai `https://`).

---

<a name="langkah-g--jalankan"></a>
## Langkah G — Nyalakan HTTPS & jalankan

```bash
cd /opt/binara-lms/deploy/dcloud

# 1) Terbitkan sertifikat SSL pertama (gratis, Let's Encrypt)
mkdir -p certbot/conf certbot/www
docker run --rm -p 80:80 -v $PWD/certbot/conf:/etc/letsencrypt certbot/certbot certonly \
  --standalone -d BINARALMS.COM -d www.BINARALMS.COM \
  --email admin@BINARALMS.COM --agree-tos --no-eff-email

# 2) Jalankan semuanya (MongoDB + 2 backend + Nginx + auto-perpanjang SSL)
docker compose up -d --build

# 3) Verifikasi
docker compose ps                       # semua harus "running"/"healthy"
curl -s https://BINARALMS.COM/api/       # harus balas: {"message":"LMS RBAC API aktif"}
```

Buka `https://BINARALMS.COM` di browser → halaman LMS Anda sudah online. 🎉

> Kalau menerbitkan SSL untuk subdomain `api.` juga, tambahkan `-d api.BINARALMS.COM` pada perintah certbot.

---

<a name="langkah-h--login-admin"></a>
## Langkah H — Login admin & cek

1. Buka `https://BINARALMS.COM` → **Login**.
2. Masuk dengan `ADMIN_EMAIL` / `ADMIN_PASSWORD` yang Anda isi di `backend/.env`.
3. **Segera ganti password admin** lewat menu **Profil**.
4. Mulai isi data: sekolah, pengguna, kursus, bank soal, Try Out.

---

<a name="fitur-opsional"></a>
## Fitur opsional (nyalakan bila butuh)

Semua ini diisi di `backend/.env` lalu jalankan `docker compose restart backend`.

| Fitur | Variabel `.env` | Cara dapat | Kalau dikosongkan |
|---|---|---|---|
| **Login Google** | `GOOGLE_CLIENT_ID` (backend) + `REACT_APP_GOOGLE_CLIENT_ID` (saat build frontend) | Google Cloud Console → **APIs & Services → Credentials → OAuth Client ID (Web)**. Tambahkan domain Anda ke "Authorized JavaScript origins". | Tombol Google tidak berfungsi; login email/password tetap jalan. |
| **Email notifikasi** (bidding diterima, Try Out rilis) | `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` **atau** `SMTP_HOST/PORT/USER/PASSWORD` | Daftar **Brevo** (brevo.com) gratis 300 email/hari → Settings → SMTP & API → buat API key. | Email dilewati (tidak error). |
| **Pembayaran online** (jual Try Out / kelas) | `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION` | Dashboard Midtrans → Settings → Access Keys. **Detail lengkap + URL notifikasi ada di `README_DCLOUD.md` §7.** | Fitur beli nonaktif; item gratis tetap bisa diambil. |
| **Upload file besar** (video, PDF, CV, sertifikat) ke cloud | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` | **Cloudflare R2** (gratis 10 GB) → buat bucket + API token. | Upload disimpan di disk VPS (volume `backend_uploads`) — tetap jalan, tapi tidak ideal untuk file sangat besar/banyak. |

---

<a name="kenapa-kuat-1000"></a>
## 13. Kenapa konfigurasi ini kuat untuk 1.000 serentak?

Konfigurasi di `deploy/dcloud/` sudah dioptimalkan:

- **2 backend × 5 worker = 10 proses** memproses request paralel (atur lewat `WEB_CONCURRENCY`). Perlu lebih? `docker compose up -d --scale backend=3`.
- **Nginx**: HTTP/2, gzip, `least_conn` load-balancing, keep-alive, `worker_connections 8192` → ribuan koneksi lancar.
- **Rate-limit pintar**: login dibatasi (anti brute-force), API umum 60 req/dtk/IP (burst 200), webhook pembayaran tidak dibatasi ketat.
- **MongoDB**: index otomatis dibuat saat startup (untuk `attempts`, `questions`, `users`, dll) + WiredTiger cache 2 GB → query cepat, tanpa *full scan*.
- **Connection pool** database sudah disetel agar tahan lonjakan.
- **Backend stateless** (sesi di cookie JWT) → aman ditambah replika kapan saja.

### ⭐ 3 praktik WAJIB di hari ujian (ini kunci agar tidak error):
1. **Buka Try Out bergelombang (staggered start):** jangan semua klik "Mulai" di detik yang sama. Buka per gelombang, mis. **250 siswa/menit**. Ini memangkas beban puncak drastis — bahkan VPS termurah pun kuat.
2. **Minta siswa login 10–15 menit sebelum** ujian mulai (sebar beban login).
3. **Pantau server** selama ujian: `htop` dan `docker stats` (CPU idealnya < 75%).

---

<a name="uji-beban"></a>
## 14. Uji beban 1.000 user (WAJIB sebelum ujian besar)

Jangan tunggu hari-H untuk tahu kuat atau tidak. Uji dulu:

1. Buat akun siswa uji (`student1..student1000@lms.id`, password sama) lewat panel admin atau skrip di folder `loadtest/`.
2. Buat 1 Try Out uji (gratis, terbit), catat ID-nya.
3. Dari **laptop lain** (bukan server), install **k6** (https://k6.io), lalu:

```bash
k6 run -e BASE=https://BINARALMS.COM -e TRYOUT=<id_tryout> -e PASSWORD='Siswa@12345' \
  deploy/dcloud/loadtest_k6.js
```

**Target lulus:** p95 < 800 ms, error < 1%, CPU server < 75%.

Kalau belum lulus: `docker compose up -d --scale backend=3`, atau upgrade VPS ke **4C/16GB**, atau naikkan `WEB_CONCURRENCY`. Setelah uji, **hapus data uji** (akun & attempt `studentN`).

---

<a name="operasional-harian"></a>
## 15. Operasional harian & backup

| Kebutuhan | Perintah (jalankan di `/opt/binara-lms/deploy/dcloud`) |
|---|---|
| Lihat log backend | `docker compose logs -f --tail=200 backend` |
| Update aplikasi (setelah push kode baru) | `cd /opt/binara-lms && git pull && cd deploy/dcloud && docker compose up -d --build` |
| Tambah kapasitas sebelum ujian besar | `docker compose up -d --scale backend=3` (kembalikan `--scale backend=2` setelahnya) |
| Restart backend saja | `docker compose restart backend` |
| Status semua layanan | `docker compose ps` |

**Backup otomatis harian** (sangat disarankan):
```bash
chmod +x /opt/binara-lms/deploy/dcloud/backup.sh
crontab -e
# tambahkan baris ini (backup tiap jam 02:00):
0 2 * * * /opt/binara-lms/deploy/dcloud/backup.sh >> /var/log/lms-backup.log 2>&1
```
Backup tersimpan di `/opt/lms-backups/` (disimpan 14 versi terakhir). Sesekali **salin ke penyimpanan lain** (laptop/Cloud Storage) agar aman bila VPS bermasalah.

---

<a name="troubleshooting"></a>
## 16. Kalau ada masalah (troubleshooting)

| Gejala | Kemungkinan sebab & solusi |
|---|---|
| `curl https://domain/api/` tidak balas | Cek `docker compose ps` (semua running?) & `docker compose logs backend`. Pastikan DNS sudah menunjuk ke IP VPS. |
| Error SSL / sertifikat gagal terbit | Pastikan port 80 terbuka & DNS sudah benar. Jika pakai Cloudflare, matikan dulu proxy (awan abu-abu) saat menerbitkan certbot. |
| Browser bilang "CORS error" / tak bisa login | `CORS_ORIGINS` di `backend/.env` harus memuat domain frontend **persis** (`https://binaralms.com`). Lalu `docker compose restart backend`. |
| Login admin gagal | Pastikan `ADMIN_EMAIL`/`ADMIN_PASSWORD` benar. Admin dibuat otomatis saat **startup pertama**; cek log ada tulisan "Startup complete". |
| Halaman tampil tapi data kosong / tombol Google mati | Google itu opsional. Fitur inti tetap jalan. Isi `GOOGLE_CLIENT_ID` bila ingin mengaktifkan. |
| CPU 100% saat ujian | Terapkan **staggered start**, `--scale backend=3`, atau upgrade ke 4C/16GB. |
| Upload file gagal | Tanpa R2, file disimpan di disk VPS (jalan). Untuk file besar/banyak, isi kredensial **Cloudflare R2** di `.env`. |

---

## ✅ Checklist kesiapan hari-H
- [ ] VPS Jakarta aktif, firewall 22/80/443, DNS A record benar.
- [ ] `backend/.env` & `deploy/dcloud/.env` terisi (admin, JWT, CORS, password Mongo).
- [ ] `https://domain/api/` balas `LMS RBAC API aktif`; login admin sukses & password diganti.
- [ ] (Opsional) Google / Email / Midtrans / R2 diisi bila dipakai.
- [ ] **Load test 1.000 user lulus** (p95 < 800 ms, error < 1%).
- [ ] Backup harian aktif + sudah diuji restore.
- [ ] Rencana **staggered start** + pantau `htop`/`docker stats` saat ujian.

---

### Ringkasan arsitektur yang Anda deploy
```
Internet ──HTTPS──> Nginx (TLS, HTTP/2, gzip, rate-limit, least_conn)
                      ├── /api/*  ──> backend ×2 (Gunicorn 5 worker)  ──> MongoDB 7
                      └── /       ──> frontend/build (React statis)
```
Murah, di Indonesia, dan tahan 1.000 siswa serentak. Selamat deploy! 🚀
