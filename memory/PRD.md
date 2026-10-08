# PRD — CendekiaLMS (LMS RBAC, 5 Portal)

## Problem Statement (original)
Bangun platform Learning Management System (LMS) berbasis Role-Based Access Control dengan 5 portal terintegrasi: Landing Publik, Dashboard Siswa, Dashboard Admin, Dashboard Tentor, Dashboard Proktor. Deliverable: arsitektur, skema DB (ERD), alur data (Admin buat soal → Proktor lihat nilai), strategi auth & keamanan antar 5 role, lalu aplikasi fungsional.

## User Choices
- Auth: JWT email/password untuk 5 role + Google login (siswa). Sistem sesi terpadu (Google→JWT internal).
- CBT auto-grading: pilihan ganda, pilihan ganda kompleks, benar/salah, esai (cocok teks, case-insensitive).
- Tanpa integrasi pihak ketiga lain di tahap awal.
- Warna: "Intelligent & Comfortable" (Intellect Blue #4361EE, Vivid Amber #FF9F1C, latar Soft Slate).
- Output: dokumen arsitektur + aplikasi end-to-end + fondasi bertahap dari Admin.

## Architecture
- Frontend: React 19 + React Router 7, Tailwind, shadcn/ui, Recharts, Framer Motion. Fonts: Outfit/DM Sans/JetBrains Mono.
- Backend: FastAPI + Motor (async MongoDB). Modular routers per role (auth/public/admin/student/tutor/proctor).
- DB: MongoDB (UUID string `id`, selalu project `{_id:0}`).
- Auth: JWT httpOnly cookies (access 24h / refresh 7d), bcrypt, brute-force lockout, RBAC via `require_roles`.
- Dokumen arsitektur lengkap: `/app/ARCHITECTURE.md`.

## Personas
- Publik/Calon mitra, Siswa, Admin (pusat kendali), Tentor, Proktor (pemantau sekolah mitra).

## Core Requirements (static)
- Landing: panduan, value prop, kalender akademik, form kemitraan, berita.
- Siswa: ruang belajar (materi publik/privat), CBT/Try Out, katalog & pendaftaran kursus, jadwal.
- Admin: CMS berita & kalender, kursus & jadwal, job-bidding, bank soal + kunci + timing + skor, broadcast, kemitraan, pengguna & sekolah.
- Tentor: job bidding (cek kualifikasi), kalender pribadi, presensi, unggah materi publik/privat.
- Proktor: live monitoring, laporan nilai (CSV), analitik tren — terbatas sekolahnya (isolasi multi-tenant).

## Implemented (2026-08-19)
- Semua 5 portal fungsional end-to-end. Auth JWT + Google, RBAC diberlakukan.
- CBT engine (timer, navigasi soal, 4 tipe soal) + penilaian otomatis + halaman hasil & pembahasan.
- Admin: TryoutBuilder (4 tipe soal + kunci), assignment job-bidding (slot open→confirmed), semua CRUD.
- Tutor: bidding, kalender, presensi, materi.
- Proktor: dashboard, live monitoring (polling 10s), analitik (bar + multi-line trend, recharts), laporan + unduh CSV. Isolasi sekolah terverifikasi.
- Seed data demo lengkap (users semua role, kursus, 3 tryout + soal, slot/bids, berita, kalender, broadcast, attempts historis untuk analitik).
- Testing: 38/38 backend PASS; seluruh flow frontend kritis PASS (iteration_1.json). Tidak ada bug.

## Implemented — Iterasi 2 (2026-08-19)
- **Notifikasi Email (Resend, dikelola Emergent)**: email ke tentor saat bidding diterima; email ke siswa aktif (yang terdaftar kursus) saat Try Out baru dirilis. Non-blocking via BackgroundTasks; modul `emailer.py` dengan guard keamanan (tanpa form/kredensial/short-URL).
- **Impor Bank Soal CSV + Excel (.xlsx)**: di TryoutBuilder ada tombol Template & Impor. Endpoint `POST /api/admin/tryouts/{id}/questions/import`. Mendukung 4 tipe soal; kunci berupa huruf A-D / benar-salah / teks esai (pisah `|`).
- **Kursus Interaktif**: Admin kelola konten kursus (`/admin/courses/:id/content`) — video pembelajaran via YouTube atau unggah file (object storage) + lampiran PDF/dokumen, serta Latihan Soal bernilai (tryout kind=exercise). Siswa buka kelas (`/student/courses/:id/learn`): pemutar video, unduh lampiran, kerjakan latihan; nilai kursus = **Total Poin + Rata-rata** (numerik dari latihan, bukan polling tentor). Object storage via `storage.py` + `routes_files.py` (`/api/upload`, `/api/files/{path}`).
- **Favorit Siswa (per kursus/kelas)**: tentor menandai siswa unggulan + catatan di Manajemen Kelas; Proktor melihat daftar "Siswa Unggulan" untuk siswa sekolahnya (school-scoped).
- Testing iterasi 2: 13/13 backend PASS + seluruh flow frontend kritis PASS (iteration_2.json). Tidak ada bug produk.

## Implemented — Iterasi 3 (2026-08-19)
- **Progres kursus per pelajaran**: bar progres (selesai/total + %) di CourseLearn; tombol "Tandai Selesai" per pelajaran (`POST /api/student/lessons/{id}/complete`), ikon checklist di daftar pelajaran.
- **Achievement/Lencana (bukan sertifikat)**: 4 badge — `video_master`, `exercise_champion`, `perfect_score`, `course_complete` — tampil di CourseLearn (earned/locked) + strip lencana di StudentDashboard.
- **Kuis acak & ulang (retake)**: siswa bisa mengulang latihan (attempt baru), soal & opsi diacak (`random.shuffle`), nilai kursus pakai best-score.
- **Impor materi massal (ZIP)**: admin unggah 1 ZIP berisi banyak video/PDF → otomatis jadi pelajaran (`POST /api/admin/courses/{id}/lessons/import-zip`). UI: tombol "Impor ZIP" + dialog hasil (created/skipped/errors) di CourseContent.
- Testing iterasi 3: 9/9 backend PASS + seluruh flow frontend kritis PASS (iteration_3.json). Tidak ada bug.

## Implemented — Iterasi 4: Halaman Publik & Skala Server (2026-08-19)
- **Halaman publik terpisah** untuk SEO & jangkauan trafik besar: `/kalender` (CalendarPage), `/berita` (NewsPage), `/berita/:id` (NewsDetail). Nav header landing kini menuju halaman-halaman ini.
- **Kalender bulanan penuh (grid)**: komponen `MonthCalendar` menampilkan grid bulan berjalan mengikuti waktu server (`GET /api/public/time`), hari ini disorot, event ditandai dot berwarna + legend + daftar agenda. Dipakai di landing (compact) dan halaman `/kalender` (lengkap + navigasi bulan).
- **Berita ringkas di landing**: hanya poin + judul (klik → detail `/berita/:id`). Endpoint baru `GET /api/public/news/{id}` (404 bila tidak ada).
- **Skalabilitas**: `Cache-Control: public, max-age=60, stale-while-revalidate=300` pada endpoint publik (`/news`, `/news/{id}`, `/calendar`, `/time`, `/stats`) untuk caching CDN/proxy. Panduan lengkap 10.000 concurrent visitor di `/app/README_SERVER.md` (CDN, horizontal scaling, indeks Mongo, object storage+CDN, rate limit, monitoring, load test).
- Verifikasi: endpoint publik dites via curl (list/detail/time/404/cache header di app-level OK); ke-4 halaman publik dites via screenshot (grid kalender, bullet berita, navigasi ke detail). Catatan: ingress preview meng-override Cache-Control jadi no-store (perilaku env preview, bukan bug kode).

## Implemented — Iterasi 5: SEO, Kursus Publik & Berita Terkait (2026-08-19)
- **SEO Boost**: hook `useSeo` (title dinamis + meta description + Open Graph + Twitter Card + canonical) dipakai di Landing, /kalender, /berita, /berita/:id (OG per-berita), /kursus. Default OG/description ditanam di `frontend/public/index.html`. `robots.txt` (allow publik, disallow portal privat) + sitemap dinamis `GET /api/public/sitemap.xml` (URL absolut dari header proxy, mencakup semua halaman berita). Catatan: OG per-berita di-set client-side (ideal untuk Google yang render JS; social scraper non-JS butuh SSR/prerender bila diperlukan nanti).
- **Halaman Kursus Publik** `/kursus` (CoursesPage): katalog kursus aktif tanpa login (dari `GET /api/public/courses`), kartu + harga + CTA "Daftar" → /register. Ditautkan di nav header & footer publik + nav landing.
- **Berita Terkait**: bagian "Berita Lainnya" di bawah artikel `/berita/:id` (prioritas kategori sama, maks 4) untuk menahan pengunjung menjelajah lebih lama.
- Verifikasi: sitemap/courses/robots via curl; halaman /kursus, related news, dan OG title/description dinamis via screenshot. Frontend di-restart sekali agar perubahan `public/index.html` & `public/robots.txt` terbaca.

## Implemented — Iterasi 6: Registrasi Lengkap, Verifikasi Akun & Isolasi Sekolah (2026-08-20)
- **Registrasi Siswa lengkap** (`/register`): nama, kelas, no WhatsApp, asal sekolah (dropdown sekolah terdaftar, wajib), email, kata sandi, target/tujuan. Akun dibuat `status="pending"`.
- **Registrasi Proktor** (`/register/proktor`): nama sekolah (teks → `school_name_text`), nama PIC, email, WhatsApp, kata sandi. `status="pending"`, `school_id=null` (ditautkan admin).
- **Sistem Verifikasi**: user baru (siswa/proktor/Google) mulai `pending`; boleh login tetapi diarahkan ke halaman `/pending` (PendingVerification) dan diblokir dari API portal (403 via `require_roles`, admin dikecualikan). Migrasi startup men-set semua akun lama → `approved`.
- **Admin kelola akun** (ManageUsers): tab "Menunggu" + badge jumlah; tombol cepat Setujui/Tolak; dialog edit untuk ubah role, tautkan/ubah sekolah, ubah status. `PUT /api/admin/users/{id}`. Akun buatan admin auto-approved.
- **Isolasi sekolah proktor** diperkuat: `_school_students` mengembalikan kosong bila `school_id` None; proktor hanya melihat siswa sekolah yang ditautkan.
- **Proktor "Kegiatan Pelatihan"** (`/proctor/trainings`): daftar kursus yang diikuti siswa sekolahnya + jumlah peserta + nama siswa. `GET /api/proctor/trainings`.
- Testing iterasi 6: 14/14 backend + 11/11 UI PASS (iteration_4.json). Tidak ada bug. Data uji dibersihkan; akun demo utuh & tetap berfungsi.

## Implemented — Iterasi 7: Notifikasi Admin, Detail Kursus Publik & Edit Profil (2026-08-20)
- **Notifikasi Admin**: lonceng di header admin (badge jumlah pendaftaran menunggu, polling 30s, klik → /admin/users) + banner alert di dashboard admin. Endpoint `GET /api/admin/pending-count` + field `pending_verifications` di `/admin/stats`.
- **Detail Kursus Publik** (`/kursus/:id`, CourseDetail): tanpa login — hero (judul/harga/CTA daftar), silabus (daftar pelajaran), tentor (cocok kualifikasi = subjek kursus; fallback "Tim Pengajar CendekiaLMS"), ringkasan benefit. Kartu di /kursus menaut ke detail. `GET /api/public/courses/{id}` (404 bila tidak ada). SEO via useSeo (OG per-kursus).
- **Edit Profil semua role** (`/profile`, Profile): ubah nama, WhatsApp; siswa juga kelas/target/asal sekolah; proktor nama sekolah. Ubah kata sandi (verifikasi sandi lama; Google set sandi baru). `PUT /api/auth/profile` + `POST /api/auth/change-password`. Diakses via avatar header (header-profile-link) & menu sidebar "Profil Saya" (nav-profile) di semua portal.
- Testing iterasi 7: 100% backend + 100% frontend PASS (iteration_5.json). Tidak ada bug. Data uji dibersihkan; sandi demo dikembalikan; 10 akun demo utuh.

## Implemented — Iterasi 8: Kelas Multi-Sesi + Materi per Pertemuan (2026-08-20)
- **Kelas multi-pertemuan** (admin): `ManageSchedule` kini membuat kelas dengan banyak pertemuan (mis. 8) — generator mingguan otomatis + tambah/edit/hapus manual (tiap pertemuan: tanggal, jam, topik). Kursus wajib ditautkan. Model `teaching_slots.sessions[]`; endpoint `POST/PUT /api/admin/slots` (multi-session), DELETE cascade materi+presensi. Backfill sesi untuk slot lama saat startup.
- **Bidding tetap**: tentor bidding kelas → admin verifikasi & tugaskan (unchanged).
- **Materi per pertemuan**: tentor & admin menamb/hapus materi tiap pertemuan (judul + deskripsi + tautan + unggah berkas via `/api/upload`). Model `class_materials` (slot_id, session_id).
- **Presensi per pertemuan**: kehadiran dicatat per sesi (bukan per kelas). Model `attendance` ditambah `session_id`.
- **Router bersama** `routes_classes.py` (`/api/classes`, role tutor+admin): `/mine`, roster, attendance, materials. Tutor hanya kelasnya; admin semua. Komponen `ClassManagerView` dipakai halaman tutor (`/tutor/classes`) & admin (`/admin/classes`, menu "Kelola Kelas").
- **Siswa (read-only)**: `StudentSchedule` menampilkan kelas → expand ke tiap pertemuan (topik/jadwal + badge kehadiran + materi tautan/berkas). `GET /api/student/schedule` & `/api/student/classes/{id}` (403 bila tak berhak).
- Testing iterasi 8: 100% backend (13/13) + frontend fungsional PASS (iteration_6.json). Hanya warning a11y minor (Radix aria-describedby). Data uji dibersihkan; 3 slot seed utuh.

## Implemented — Iterasi 9: Registrasi & Onboarding Tentor (2026-08-20)
- **Registrasi Tentor** (`/register/tentor`): email/password + login Google. Akun tentor mulai `status="pending"`.
- **Onboarding Tentor** (`/onboarding/tutor`): unggah CV (PDF wajib) + sertifikat (PDF atau gambar PNG/JPEG). Validasi server-side: gambar sertifikat maks **2 MB** (HTTP 400 bila lebih). Dokumen ditinjau admin sebelum verifikasi.
- Alur Google "become tutor": akun Google baru bisa dialihkan menjadi tentor pending → onboarding.
- Admin melihat CV & sertifikat tentor di ManageUsers sebelum approve. Setelah approved, tentor akses portal.
- Testing iterasi 10 (iteration_8.json): 14/14 backend + frontend 100% (setelah fix redirect RegisterTutor.js: tentor pending tanpa cv_url diarahkan ke /onboarding/tutor, bukan /pending). JANGAN revert fix ini.

## Implemented — Iterasi 10: Analisis Kelemahan Siswa & Ekspor Nilai (2026-06)
- **Kompetensi soal (AKM)**: field `competency` pada bank soal — Numerasi | Literasi | Umum. Ditambahkan di TryoutBuilder (Select + badge), impor CSV/Excel (kolom `competency`), dan template soal.
- **Laporan Analisis Kelemahan** (`analysis.py`): agregasi attempt tersubmit menjadi 3 tampilan — `scores` (nilai per Try Out), `recap` (per siswa: rata-rata, mapel terlemah, Numerasi% vs Literasi%, kompetensi terlemah, tren naik/turun), `items` (analisis butir: % benar + tingkat kesulitan Mudah/Sedang/Sulit). Summary: rata-rata kelas, rata Numerasi/Literasi, area terlemah.
- **Admin (global)** `/admin/analysis` ("Analisis Nilai") — semua sekolah. **Proktor (per sekolah)** `/proctor/weakness` ("Analisis Kelemahan") — hanya siswa sekolahnya (isolasi multi-tenant terverifikasi: admin 7 siswa, proktor 5 siswa Nusantara).
- **3 Ekspor CSV** untuk pelaporan sekolah: `nilai_siswa.csv`, `rekap_kelemahan_siswa.csv`, `analisis_butir_soal.csv` (header Bahasa Indonesia). Endpoint `GET {/admin|/proctor}/analysis` + `/analysis/{scores,recap,items}.csv`.
- Komponen bersama `WeaknessReportView.jsx` dipakai kedua portal. Migrasi startup `migrate_analysis()` (idempotent, meta `analysis_seed_v1`) menandai soal demo Numerasi/Literasi & mengisi per_question attempt seed agar laporan punya data.
- Testing iterasi 11 (iteration_11.json): 15/15 backend + frontend 100% PASS. Tidak ada bug. Data uji dibersihkan; 10 akun seed & to_3 (5 soal) utuh.

## Implemented — Iterasi 11: Tag Soal Massal & Berkas Tentor (2026-06)
- **Tag Soal Massal** (TryoutBuilder / Kelola Bank Soal): checkbox per soal + "Pilih Semua" + toolbar bulk untuk menandai banyak soal sekaligus sebagai Numerasi/Literasi/Umum tanpa buka satu per satu. Endpoint `POST /api/admin/tryouts/{id}/questions/bulk-competency` (question_ids, competency).
- **Berkas Tentor untuk verifikasi** (ManageUsers): baris tentor yang punya berkas menampilkan tombol "Berkas" (folder) → dialog berisi CV & sertifikat dengan aksi **Lihat** (buka tab baru) + **Unduh** (blob terautentikasi). Blok berkas juga ada di dialog edit/verifikasi. Komponen `TutorDocs`. Berkas diambil via `GET /api/files/{path}` (butuh login; admin boleh akses).
- Testing iterasi 12 (iteration_12.json): 10/10 backend + frontend 100% PASS. Tidak ada bug. Data seed dipulihkan (to_3 & 10 akun utuh); tentor uji dihapus.

## Implemented — Iterasi 12: Kualifikasi Tentor Mandiri & Matching Bidding Case-Insensitive (2026-06)
- **Tentor kelola kualifikasi & CV sendiri** di halaman `/profile`: editor tag "Keahlian & Kualifikasi" (ketik bidang keahlian, Enter/koma untuk menambah, dedupe case-insensitive) + kartu update CV (unggah/ganti PDF). Disimpan via `PUT /api/auth/profile` (field baru `qualifications`, dibersihkan oleh `_clean_quals`).
- **Job Bidding case-insensitive**: pencocokan `required_qualifications` slot vs `qualifications` tentor kini memakai normalisasi huruf kecil (`_qset` di routes_tutor.py) — "Fisika" = "fisika". Diterapkan di `open_slots` (flag qualified) & `place_bid` (gate 403).
- Link "Kelola kualifikasi & CV" di dashboard tentor (`/tutor`) dan banner hint di halaman Job Bidding menuju `/profile`.
- Testing iterasi 13 (iteration_13.json): frontend 100% PASS; backend curl-verified (simpan lowercase+dupe → tersimpan bersih; slot Fisika tetap qualified dengan qual lowercase). Data tentor demo dipulihkan (`['Matematika','Fisika','Kimia']`, cv_url null); 10 akun seed utuh.
- Catatan minor (belum di-scope): `PUT /auth/profile` belum bisa meng-null-kan cv_url (null dianggap skip) — hanya ganti CV yang didukung.

## Implemented — Iterasi 14: Rebrand ke "Binara LMS" & Kesiapan Publish (2026-06)
- **Rebrand nama**: seluruh teks "Cendekia/CendekiaLMS" → **"Binara LMS"** (frontend, index.html/meta, robots.txt, SEO, email). Storage internal `APP_NAME="cendekialms"` sengaja DIBIARKAN (path storage internal, bukan user-facing).
- **Palet warna Binara** (navy + gold + cyan), diselaraskan dengan binara.site: primary `#4361EE`→`#0E7490` (cyan), hover→`#0B5C74`, aksen `#FF9F1C`→`#C9A227` (gold), navy `#0A1128` dipertahankan; termasuk tint (#E6F5F8, #FBF3DC, dll).
- **Kesiapan deploy** (deployment_agent: tidak ada blocker):
  - CORS `server.py` pakai `allow_origin_regex` domain Emergent + `allow_credentials` (tetap aman untuk cookie httponly; TIDAK memakai `*`).
  - Optimasi N+1: `routes_student._course_bundle` & `/student/tryouts` kini batch (agregasi `$group` + satu query attempts).
  - Auth redirect Google memakai `window.location.origin` + handler hash global di `App.js` (bukan bug).
- Testing iterasi 15 (iteration_15.json): frontend regresi 100% PASS — tidak ada teks "Cendekia", semua 4 role login & dashboard normal, palet baru rapi. 10 akun seed utuh.
- **Status: siap publish.** Sisa WARN dari scan hanya N+1 pada dashboard admin (low-traffic, bounded) — non-blocker.

## Implemented — Iterasi 13: Kelola Sertifikat di Profil & Rekomendasi Latihan Otomatis (2026-06)
- **Kelola Sertifikat di Profil** (`/profile`, tentor): kartu "Sertifikat" untuk tambah/hapus sertifikat (PDF atau gambar PNG/JPEG, gambar maks 2 MB) langsung dari profil — tidak hanya saat onboarding. Simpan via `PUT /api/auth/profile` (array `certificates`).
- **Rekomendasi Latihan otomatis** berdasarkan area terlemah (mapel + Numerasi/Literasi) dari hasil analisis:
  - Logika di `analysis.py` (`_recommend`): kursus aktif (subject match) + Try Out/latihan terbit (subject match ATAU memuat soal kompetensi terlemah).
  - **Dashboard siswa**: kartu "Rekomendasi Latihan untuk Kamu" (`StudentRecommendations.jsx`) via `GET /api/student/recommendations`.
  - **Laporan Analisis Kelemahan (Admin & Proktor)**: seksi "Rekomendasi Latihan per Siswa" per siswa (di `WeaknessReportView.jsx`, dari `recap[].recommendations`).
- Testing iterasi 14 (iteration_14.json): frontend 100% PASS (sertifikat add/remove + validasi 2MB, rekomendasi siswa & staff). Backend curl-verified. Data tentor demo dipulihkan (3 kualifikasi, cv null, certificates []); 10 akun seed utuh.

## Implemented — Iterasi 15: Penilaian IRT (3PL), Rekomendasi Komposisi Soal & Template Excel (2026-06)
- **Model IRT 3PL** (`backend/irt.py`): parameter butir a (daya pembeda), b (kesulitan), c (tebakan). Kalibrasi otomatis dari data jawaban peserta (p-value→b via normal, point-biserial→a, c dari tipe/jumlah opsi; min 5 responden/soal). Estimasi kemampuan peserta theta via EAP (prior N(0,1)) + skor skala IRT (~100-900, rata-rata 500).
- **Pembuatan soal (TryoutBuilder)**: field baru "Tingkat Kesulitan (IRT)" Mudah/Sedang/Sulit (label manual) di form + badge tingkat & badge parameter IRT (a/b/c) pada kartu soal setelah kalibrasi. Tagging massal tingkat kesulitan (`POST /api/admin/tryouts/{id}/questions/bulk-difficulty`) berdampingan dengan tagging kompetensi yang sudah ada. **Semua fitur lama dipertahankan (hanya penambahan).**
- **Rekomendasi komposisi IRT** (`IrtBlueprintPanel.jsx` + `GET /api/admin/tryouts/{id}/irt-blueprint`): panel menampilkan komposisi Mudah/Sedang/Sulit vs target 30/40/30, gap "kurang/lebih N soal", grafik Test Information Function (recharts) + titik puncak θ, saran tekstual untuk staff admin, dan status kalibrasi. Tombol "Kalibrasi IRT" (`POST /api/admin/tryouts/{id}/calibrate`) mengkalibrasi butir + menghitung ulang theta semua attempt.
- **Pembuatan soal skala besar**: template **Excel (.xlsx)** baru (`GET /api/admin/questions/template.xlsx`, berisi sheet Soal + Petunjuk) di samping template CSV; impor CSV/Excel kini mendukung kolom `tingkat` (mudah/sedang/sulit).
- **Skor IRT ditampilkan**: hasil siswa (`TryoutResult`) menampilkan Skor IRT + θ; tabel Hasil & Peringkat admin (`TryoutResults`) menambah kolom "Skor IRT". Submit attempt kini mengembalikan theta/irt_scaled + auto-recalibrate (BackgroundTasks).
- Testing iterasi 16 (iteration_16.json): backend 10/10 (1 skip wajar) + frontend 100% PASS. Tidak ada bug fungsional. Kalibrasi to_1 → 5 soal terkalibrasi, 7 attempt di-skor theta. Catatan: `.env` backend/frontend dibuat ulang sesi ini (hilang dari repo karena gitignore).

## Backlog / Next (P1/P2)
- P1: Retake/multiple attempt & bank soal impor massal; timer server-side enforcement.
- P1: Notifikasi email (Resend) untuk pengumuman & konfirmasi bidding.
- P2: Pembayaran kursus (Stripe/Razorpay); upload file materi (object storage).
- P2: WebSocket untuk live monitoring real-time (saat ini polling).
- P2: Lifespan handler menggantikan on_event; body model untuk update partnership.

## Test Credentials
Lihat `/app/memory/test_credentials.md`.
