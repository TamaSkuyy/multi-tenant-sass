# TODO — Next Steps Multi-Tenant SaaS

Status per hari ini (yang sudah jalan, jangan dikerjakan ulang):

- ✅ Template JSON menyetir section portfolio (`theme.primaryColor`, `sections.*`) + seed `minimal`
- ✅ Routing subdomain (`client/proxy.ts`) → `/tenant/<slug>`, termasuk wildcard `*.localhost:3000`
- ✅ API Express 5 + Prisma 8 contract mode: `POST /api/tenants`, `GET /api/tenants/:slug`, `GET /api/templates`
- ✅ Migration baseline ter-commit + `develop.sh` (Postgres + API + client) & `deploy-production.sh`

Aturan main sepanjang repo ini:

1. **Setiap perubahan `api/prisma/schema.prisma`**: `npx prisma contract emit` → `npx prisma migration plan --name <slug>` → commit `api/migrations/` → `./develop.sh --db-only`. Tanpa paket migration, DB produksi baru tidak akan terbentuk.
2. **Referensi model Prisma 8**: `db.orm.public.<Model>.where({...}).first()` / `.create({...})` (tanpa wrapper `data`), teardown script pakai `db.close()`.
3. Jangan hardcode host/port di client — pakai `NEXT_PUBLIC_API_URL` (browser) & `API_URL` (SSR).

Urutan dependensi:

```mermaid
graph LR
  F0[Fase 0 · Prasyarat] --> F1[Fase 1 · Auth]
  F1 --> F2[Fase 2 · Blog]
  F1 --> F3[Fase 3 · Upload avatar]
  F1 --> F4[Fase 4 · Stripe]
  F1 --> F5[Fase 5 · Custom domain]
  F4 --> F5
```

---

## Fase 0 — Prasyarat ✅ SELESAI

> Diterapkan lewat migration `migrations/app/20260927T1240_phase_0_relations_and_fields`
> (12 operasi): tabel `User`, 5 kolom baru, 3 unique index, 3 foreign key.
> `db verify` lolos; `npm run check` hijau; sudah diuji end-to-end lewat `./develop.sh`.

### [x] 0.1 Tambah relasi / foreign key

**Masalah:** DB sekarang **0 foreign key**. `Tenant.templateId` dan `Post.tenantSlug` cuma string — tenant bisa menunjuk template yang tidak ada, dan blog post bisa yatim.

- [x] Di `schema.prisma`:

  ```prisma
  model Tenant {
    // ...
    template   Template @relation(fields: [templateId], references: [id])
    posts      Post[]
  }

  model Post {
    // ...
    tenant     Tenant @relation(fields: [tenantSlug], references: [slug])
  }
  ```

- [x] `npx prisma contract emit` → `npx prisma migration plan` → `db migrate`
- [x] Cek: 3 FK nyata di Postgres — `Post_tenantSlug_fkey`, `Tenant_templateId_fkey`, `Tenant_ownerId_fkey`; insert post dengan slug tenant palsu ditolak `23503`

**Keputusan:** FK ke `Tenant.slug` berarti **slug harus immutable** (tidak boleh di-rename). Itu konsisten dengan subdomain routing, jadi aman — tapi kalau nanti mau slug bisa berubah, FK harus pindah ke `Tenant.id`.

**Acceptance:** `prisma db verify` OK, `select count(*) from pg_constraint where contype='f'` > 0.
Estimasi: **S**

### [x] 0.2 Pagar minimum: typecheck + lint di satu perintah

- [x] Script root `package.json` (baru):

  ```json
  { "scripts": {
      "check": "npm --prefix api run typecheck && npm --prefix client run typecheck && npm --prefix client run lint"
  } }
  ```

- [x] Jalankan sebelum tiap commit (sudah terbukti hijau)
- [x] `.github/workflows/ci.yml`: install api+client → `npm run check` → `prisma db migrate` + `db verify` terhadap service Postgres 16

**Acceptance:** `npm run check` hijau di mesin bersih.
Estimasi: **S**

### [x] 0.3 Hardening endpoint tenant yang sudah ada

**Masalah:** `POST /api/tenants` masih terbuka untuk siapa pun, tanpa rate limit, tanpa validasi schema, dan `cors()` menerima semua origin.

- [x] `helmet` + `express-rate-limit` (20 tenant/jam per IP; store masih in-memory → ganti Redis kalau multi-instance)
- [x] Validasi body pakai `zod` (`api/src/schemas/tenant.schema.ts`) → 400 + `details[]` per field
- [x] CORS whitelist lewat `CLIENT_ORIGINS` di `api/.env` (`*` = satu label host, jadi `http://*.localhost:3000` mencakup subdomain tenant)
- [ ] Setelah Fase 1: endpoint ini jadi butuh login, "create tenant" pindah ke onboarding → **dipindah ke Fase 1**

**Acceptance:** `curl` body invalid → 400 dengan detail field; origin asing → ditolak.
Estimasi: **S**

### [x] 0.4 Tambah field yang dibutuhkan fase berikutnya (sekali migration)

- [x] `Tenant.avatarUrl String?` (client sudah membacanya — sekarang tidak selalu jatuh ke inisial)
- [x] `Post.published Boolean @default(false)`, `Post.slug String`, `Post.updatedAt DateTime @updatedAt`
- [x] `@@unique([tenantSlug, slug])` di `Post`
- [x] `Tenant.ownerId String?` + model `User` (dipakai Fase 1)

**Catatan implementasi:** planner merender `dataTransform`/backfill untuk `Post.slug` &
`Post.updatedAt` (NOT NULL tanpa default) dengan `placeholder(...)`. Backfill itu tidak
diperlukan — kolomnya belum pernah ada dan `Post` kosong di semua environment — jadi
migration-nya diedit untuk menambah kedua kolom langsung sebagai NOT NULL, lalu
self-emit (`node migrations/app/.../migration.ts`). Untuk backfill sungguhan di masa
depan, isi placeholder dengan query-plan dari `postgres<End>({ contractJson: endContract })`.

**Acceptance:** `contract emit` + `migration plan` lolos, client `tsc` masih hijau.
Estimasi: **M**

---

## Fase 1 — Autentikasi (NextAuth v5) + dashboard tenant ✅ SELESAI

**Target:** tenant bisa login, lalu edit portfolio-nya (bio, skills, pilih section) tanpa kehilangan data.

> ⚠️ **Temuan penting:** `@auth/prisma-adapter` **butuh `@prisma/client`**, sedangkan repo ini pakai Prisma 8 contract mode (`@prisma/orm-postgres`). Karena itu **Prisma adapter tidak dipakai**: sesi memakai **JWT** dan verifikasi kredensial dilakukan lewat API Express (pemegang database).

**Yang dipakai:** provider **Credentials** (email + password, hash `scrypt` bawaan Node — tanpa dependensi tambahan). OAuth belum dipasang karena butuh kredensial pihak ketiga.

### [x] 1.1 Model auth di contract

- [x] `User` + `passwordHash String?` (nullable agar akun OAuth murni tetap valid); `Tenant.ownerId` FK ke `User.id` (dari Fase 0)
- [x] `Tenant.config Json?` — override section per-tenant (dipakai dashboard)
- [x] Migration `20260927T1315_phase_1_auth_fields` (2 operasi) + `db verify` lolos

### [x] 1.2 NextAuth v5 di client

- [x] `next-auth@5.0.0-beta.32` (peer `next: ^16` ✓ terverifikasi)
- [x] `client/auth.ts` — Credentials + `session.strategy: "jwt"`, callback `jwt`/`session` membawa `user.id`
- [x] `client/app/api/auth/[...nextauth]/route.ts` → export handler
- [x] `AUTH_SECRET` di `client/.env.local` (digenerate `develop.sh`, tidak di-commit)
- [x] `client/app/login/page.tsx` (server action `signIn`), `client/app/register/page.tsx`, tombol keluar di dashboard

### [x] 1.3 Jembatan session → API Express (opsi A, disempurnakan)

Rencana awal: `rewrites` + Bearer token. Yang dipakai: **server action + HMAC** — lebih sedikit bagian, tanpa CORS.

- [x] `client/lib/internal-auth.ts` menandatangani `<subject>.<exp>.<hmac>`; API memverifikasi di `api/src/lib/internal-auth.ts` dengan rahasia yang sama (`INTERNAL_API_SECRET`)
- [x] Middleware Express: `requireService` (login), `requireUser` (identitas user → `req.userId`), `identifyUser` (opsional)
- [x] `POST /api/auth/register` (publik, rate-limited) + `POST /api/auth/verify-credentials` (internal-only)
- [x] `GET`/`PATCH /api/tenants/me` — hanya menyentuh tenant milik user di session
- [x] Tenant baru dari jalur BFF otomatis dapat `ownerId`; satu akun = satu portfolio (409 kalau sudah ada)
- [x] `POST /api/tenants` **tetap publik** (form landing page) — sengaja supaya demo signup tetap jalan; jalur dashboard memakai identitas login

### [x] 1.4 Dashboard

- [x] `client/app/dashboard/page.tsx` — session-gated (`redirect("/login")` bila belum login), di root domain
- [x] Form edit nama/bio/skills + toggle 6 section → server action `updateMyTenant`
- [x] Akun tanpa portfolio → form `createMyTenant`
- [x] Link preview ke `/tenant/<slug>` + teks subdomain
- [x] `proxy.ts`: allowlist subdomain reserved (`www`, `app`, `api`, `admin`)
- [x] Halaman portfolio menggabungkan `Template.config.sections` + `Tenant.config.sections` (override per-tenant)

**Bukti uji end-to-end:**

- register → 201; email duplikat → 409; password <8 → 400 + `details`
- password salah → 401 yang **tidak** membocorkan apakah email terdaftar
- `GET /api/auth/session` berisi `user.id` ✓
- `/dashboard` tanpa cookie → **307 ke `/login`**; dengan cookie → 200 + form edit ✓
- `PATCH /api/tenants/me` → 200; section `blog` yang dimatikan **hilang** dari halaman portfolio ✓
- `verify-credentials` tanpa token internal → 401; `PATCH` tanpa identitas → 401
- `Host: app.localhost:3000` → landing page, bukan `/tenant/app` ✓

**Belum termasuk (lanjutan):** OAuth (GitHub/Google), reset password & verifikasi email, revoke session (JWT tidak bisa dibatalkan — logout hanya menghapus cookie), 2FA, dan rate limit per-akun untuk login (sekarang hanya per-IP di `/register`).

Estimasi: **L**

---

## Fase 2 — Manajemen blog (pakai model `Post`)

### [ ] 2.1 API blog

- [ ] `POST /api/posts` (create, `published: false` default), `PATCH /api/posts/:id`, `DELETE /api/posts/:id` — semua **scoped ke tenant dari session**
- [ ] `GET /api/posts?tenantSlug=...` (publik, hanya `published = true`)
- [ ] `GET /api/posts/:tenantSlug/:slug` (publik, satu post)
- [ ] Slug unik per tenant (`@@unique([tenantSlug, slug])` sudah di 0.4); generate dari title, tangani bentrok → 409

### [ ] 2.2 UI blog

- [ ] `client/app/dashboard/posts/page.tsx` — list + editor (textarea/markdown sederhana), tombol publish/unpublish
- [ ] `client/app/tenant/[slug]/blog/page.tsx` — daftar post published
- [ ] `client/app/tenant/[slug]/blog/[postSlug]/page.tsx` — detail + `generateMetadata` (title/description dari post)
- [ ] Section `blog` di portfolio sekarang menampilkan post asli (ganti array hardcode di `client/app/tenant/[slug]/page.tsx` baris ~276)
- [ ] Tombol "Projects" juga masih hardcode (baris ~253) — jadikan `Tenant.projects Json?` atau model `Project` terpisah

**Acceptance:** tenant A publish post → muncul di `a.localhost` dan **tidak** muncul di `b.localhost`.
Estimasi: **L**

---

## Fase 3 — Upload avatar (Cloudinary)

### [ ] 3.1 Cloudinary

- [ ] `npm --prefix api i cloudinary`; env `CLOUDINARY_URL` (atau `CLOUD_NAME`/`API_KEY`/`API_SECRET`)
- [ ] `POST /api/tenants/me/avatar` — terima `multipart/form-data` (`multer`), batasi ≤2 MB + tipe `image/*`, upload ke folder `tenants/<slug>`, simpan `secure_url` ke `Tenant.avatarUrl`
- [ ] Alternatif tanpa server: **unsigned upload preset** langsung dari browser (lebih sedikit kode, preset harus dibatasi folder + max size)

### [ ] 3.2 UI

- [ ] Di dashboard: input file + preview; setelah sukses panggil `PATCH`/refresh session
- [ ] Di `client/app/tenant/[slug]/page.tsx` fallback inisial **sudah siap** — begitu `avatarUrl` terisi, foto otomatis tampil
- [ ] Pakai `next/image` untuk optimisasi (butuh `images.remotePatterns` untuk domain Cloudinary di `next.config.ts`)

**Acceptance:** upload → avatar tampil di halaman tenant; file >2 MB / bukan gambar ditolak 400.
Estimasi: **M**

---

## Fase 4 — Stripe subscription

### [ ] 4.1 Model & env

- [ ] `Tenant`: `plan`, `stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus`, `currentPeriodEnd`
- [ ] Env API: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`
- [ ] **Stripe harus hidup di API Express** (bukan Next) karena API yang memegang DB

### [ ] 4.2 Checkout + portal

- [ ] `POST /api/billing/checkout` → buat Stripe Checkout Session, `success_url` ke dashboard
- [ ] `POST /api/billing/portal` → Billing Portal untuk ganti kartu/batal
- [ ] Tombol "Upgrade" di dashboard memanggil endpoint di atas

### [ ] 4.3 Webhook (raw body!)

- [ ] **Gotcha:** `express.json()` merusak signature Stripe. Daftarkan route webhook **sebelum** `express.json()`:

  ```ts
  app.post("/api/billing/webhook", express.raw({ type: "application/json" }), handler);
  app.use(express.json());
  ```

- [ ] Verifikasi `stripe.webhooks.constructEvent(body, sig, secret)` → update `subscriptionStatus`/`currentPeriodEnd`
- [ ] Idempotensi: simpan `event.id` yang sudah diproses
- [ ] Gate fitur: portfolio `unpublished` + banner kalau langganan lewat `currentPeriodEnd`

**Acceptance:** `stripe listen --forward-to localhost:8080/api/billing/webhook` → status tenant berubah; event duplikat tidak memproses dua kali.
Estimasi: **L**

---

## Fase 5 — Custom domain (paling akhir, paling berat)

### [ ] 5.1 Keputusan arsitektur

- [ ] **Proxy Next 16 default-nya runtime Node.js** (terverifikasi di `node_modules/next/dist/docs/.../proxy.md`), jadi lookup DB dari `proxy.ts` *bisa* — tapi satu query per request itu mahal. Lebih baik: proxy hanya meneruskan `Host` lewat header, dan **page (server component)** yang resolve domain → slug.
- [ ] Tabel `Domain` (`host @unique`, `tenantSlug`, `verifiedAt`, `verificationToken`)
- [ ] `proxy.ts` sekarang me-rewrite **setiap** subdomain ke `/tenant/<slug>`; untuk custom domain (`janedoe.com`) perlu jalur baru: kalau host bukan domain kita dan bukan IP, jangan rewrite — biar page yang menentukan

### [ ] 5.2 Alur verifikasi

- [ ] Dashboard: input domain → generate token → user pasang `CNAME janedoe.com → cname.example.com` (atau TXT untuk verifikasi)
- [ ] Job verifikasi (cron/saat dibuka): DNS lookup + tandai `verifiedAt`
- [ ] Halaman tenant resolve: host → `Domain` → `tenantSlug`; kalau belum terverifikasi → 404

### [ ] 5.3 Infrastruktur (di luar kode)

- [ ] Wildcard TLS (`*.example.com`) + sertifikat per custom domain (Let's Encrypt/ACME atau Cloudflare for SaaS)
- [ ] Reverse proxy (Nginx/Caddy/Traefik) yang meneruskan semua Host ke Next
- [ ] **Cookie auth ikut terdampak:** session NextAuth harus `domain: .example.com` untuk dipakai lintas subdomain; custom domain di luar `example.com` praktis **tidak** ikut kebagian cookie → dashboard tetap di domain utama

**Acceptance:** domain terverifikasi membuka portfolio tenant yang benar; domain belum terverifikasi → 404; cert valid.
Estimasi: **XL**

---

## Fase 6 — Ops (paralel, jangan ditunda)

- [ ] Dockerfile API + service `api` di `docker-compose.yml` (dev), lalu image produksi multi-stage
- [ ] CI: `check` + `prisma db verify` + build client
- [ ] Backup terjadwal (`deploy-production.sh --backup` baru manual; jadikan cron/pgBackRest)
- [ ] Observability: request log terstruktur + `/ready` (sudah ada) dipakai healthcheck orchestrator
- [ ] Test: minimal integration test endpoint tenant (`supertest`) + 1 snapshot render halaman tenant

---

## Urutan eksekusi yang disarankan

| # | Fase | Kenapa di sini | Estimasi |
|---|------|----------------|----------|
| 1 | 0.1 relasi/FK | semua fitur menyentuh DB, FK dulu supaya migration berikutnya bersih | S |
| 2 | 0.4 field baru | digabung sekali migration dengan 0.1 kalau mau hemat | M |
| 3 | 0.2 + 0.3 pagar | mencegah regresi sebelum fitur menumpuk | S |
| 4 | 1 Auth + dashboard | pintu masuk semua fitur tenant-facing | L |
| 5 | 2 Blog | memanfaatkan `Post` yang sudah ada, tanpa layanan eksternal | L |
| 6 | 3 Avatar | kecil, tapi butuh 0.4 (`avatarUrl`) | M |
| 7 | 4 Stripe | butuh auth + status langganan | L |
| 8 | 5 Custom domain | butuh DNS/TLS di hosting, cookie tetap di domain utama | XL |
| 9 | 6 Ops | jalan paralel sejak sekarang | — |
