# PST Portal — Architecture & Project Structure

**Partido Socialista de Timor** · *Pelo Progresso, Igualdade*

One Next.js application serves three surfaces: the public portal (`/[locale]/…`), the
backoffice (`/[locale]/admin/…`) and the REST API (`/api/…`). PostgreSQL holds the data,
Redis handles rate limits, OTPs and the notification queue, and Nginx sits in front.

## Stack (versions as of Nov 2026)

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router, `output: "standalone"`) | Server Actions for forms, Route Handlers for REST/mobile |
| Language | TypeScript 5.9, strict | |
| UI | Tailwind CSS 4, shadcn/ui, Lucide, Framer Motion | `LazyMotion` + `domAnimation` to keep JS small |
| i18n | next-intl 4 | `tet` (default), `pt`, `id`, `en` |
| ORM | Prisma 7 + `@prisma/adapter-pg` | URL in `prisma.config.ts`, client generated to `src/generated/prisma` |
| DB | PostgreSQL 16 | |
| Cache/queue | Redis 7 (ioredis) | rate limit, OTP, sessions cache, notification queue |
| Auth | Custom DB sessions + argon2id + TOTP 2FA | see "Auth decision" below |
| Notifications | Telegram Bot API, Nodemailer | durable `notification_outbox` table |
| KTA cards | `@react-pdf/renderer`, `qrcode`, Ed25519 (`node:crypto`) | |
| Infra | Docker Compose, Nginx, Certbot, Ubuntu 26.04 LTS | |

### Auth decision

The backoffice uses **its own opaque session tokens stored in Postgres** (`user_sessions`,
SHA-256 hashed) instead of Auth.js:

- Auth.js Credentials only supports stateless JWT sessions, so an admin session
  can't be revoked instantly (needed for lockouts, suspensions, "log out all devices").
- 2FA step-up, forced password rotation, password history and IP auditing are
  first-class requirements, and each one is a workaround in Auth.js.
- Auth.js v5 is still beta.

Public members never log in. They check their status with `registrationRef` + date of birth
or a phone OTP.

## Folder structure

`✅` = delivered in Phase 1 · `P2/P3/P4` = phase that delivers it.

```
pst-portal/
├── .env.example                         ✅ all environment variables
├── .gitignore                           ✅
├── package.json                         ✅ (deps grow per phase)
├── prisma.config.ts                     ✅ Prisma 7 config (datasource url, seed)
├── tsconfig.json                        ✅
├── next.config.ts                       P3 standalone output, security headers, images
├── middleware.ts                        P2 locale routing + admin session gate
├── Dockerfile                           P4 multi-stage, standalone, non-root
├── docker-compose.yml                   P4 app, postgres, redis, nginx, certbot, backup
├── deploy-ubuntu-26.04.sh               P4 UFW, Fail2Ban, Docker, swap, SSL, launch
├── nginx/
│   ├── pst.conf                         P4 reverse proxy, HTTP/3, brotli, rate limits
│   └── snippets/security-headers.conf   P4
├── scripts/
│   ├── backup/pg-backup.sh              P4 nightly pg_dump + rotation
│   ├── migrate-legacy.ts                P4 import from old PHP/MariaDB `pst_db`
│   └── rotate-encryption-key.ts         P4
├── docs/
│   └── ARCHITECTURE.md                  ✅ this file
├── prisma/
│   ├── schema.prisma                    ✅ 43 models, 27 enums
│   ├── seed.ts                          ✅ 14 municípios, postos, categories, settings, super admin
│   ├── data/
│   │   ├── geography.ts                 ✅ município + posto reference data
│   │   └── sucos-aldeias.example.csv    ✅ CSV template for sucos/aldeias import
│   └── migrations/
│       └── 20261113103306_init/         ✅ initial migration (verified on Postgres 16)
├── messages/                            P3 next-intl dictionaries
│   ├── tet.json
│   ├── pt.json
│   ├── id.json
│   └── en.json
├── public/
│   ├── brand/                           P3 emblem SVG/PNG, favicons, OG image
│   └── fonts/                           P3 self-hosted (no Google Fonts round-trip)
└── src/
    ├── generated/prisma/                (git-ignored) Prisma client output
    ├── i18n/
    │   ├── routing.ts                   P2 locales, defaultLocale "tet"
    │   └── request.ts                   P2
    ├── app/
    │   ├── [locale]/
    │   │   ├── layout.tsx               P3
    │   │   ├── (public)/
    │   │   │   ├── page.tsx             P3 hero + motto + statements + CTA
    │   │   │   ├── about/               P3 history, ideology, comité central
    │   │   │   │   ├── page.tsx
    │   │   │   │   ├── statute/page.tsx
    │   │   │   │   ├── program/page.tsx
    │   │   │   │   └── leadership/page.tsx
    │   │   │   ├── news/                P3 list, [slug], category/[slug]
    │   │   │   ├── press/               P3 comunicados de imprensa
    │   │   │   ├── media/               P3 galleries, videos
    │   │   │   ├── documents/           P3 PDF library
    │   │   │   ├── municipalities/      P3 map + [slug] branch directory
    │   │   │   ├── events/              P3 agenda, [slug]
    │   │   │   ├── join/                P3 E-KTA registration wizard
    │   │   │   ├── membership-status/   P3 status check (ref + DOB / OTP)
    │   │   │   ├── voice/               P3 aspirations form + ticket tracking
    │   │   │   ├── contact/             P3
    │   │   │   └── verify/[token]/      P3 public KTA QR verification
    │   │   └── admin/
    │   │       ├── login/               P2 login, 2FA challenge, forced password change
    │   │       └── (dashboard)/
    │   │           ├── layout.tsx       P3 sidebar shell, RBAC-filtered nav
    │   │           ├── page.tsx         P3 executive analytics
    │   │           ├── members/         P3 SIM-PST CRUD, approvals, import/export, KTA
    │   │           ├── posts/           P3 TipTap multilingual editor
    │   │           ├── documents/       P3
    │   │           ├── media/           P3
    │   │           ├── leadership/      P3
    │   │           ├── branches/        P3
    │   │           ├── events/          P3 incl. attendance / QR check-in
    │   │           ├── aspirations/     P3 ticket inbox
    │   │           ├── messages/        P3 contact inbox
    │   │           ├── users/           P3 admin accounts (SUPER_ADMIN)
    │   │           ├── audit/           P3 audit log viewer (AUDITOR)
    │   │           └── settings/        P3
    │   ├── api/
    │   │   ├── auth/                    P2 login, logout, 2fa, password
    │   │   ├── register/                P2 public militant registration
    │   │   ├── geo/                     P2 cascading município → posto → suco → aldeia
    │   │   ├── members/                 P2 admin CRUD, status, import, export
    │   │   ├── kta/                     P2 card PDF/PNG render, verify
    │   │   ├── posts/ documents/ events/ media/ leadership/   P2
    │   │   ├── aspirations/             P2
    │   │   ├── contact/                 P2
    │   │   ├── telegram/webhook/        P2
    │   │   └── health/                  P2
    │   ├── sitemap.ts                   P3
    │   └── robots.ts                    P3
    ├── components/
    │   ├── ui/                          P3 shadcn/ui primitives
    │   ├── public/                      P3 hero, news cards, municipality map…
    │   ├── admin/                       P3 data tables, editor, charts
    │   └── kta/                         P2 card template (react-pdf)
    ├── lib/
    │   ├── db.ts                        ✅ Prisma client singleton (pg adapter)
    │   ├── security/
    │   │   ├── password.ts              ✅ argon2id hash/verify/needsRehash
    │   │   ├── crypto.ts                P2 AES-256-GCM, blind index HMAC, tokens
    │   │   ├── session.ts               P2 create/validate/revoke sessions
    │   │   ├── totp.ts                  P2
    │   │   ├── rbac.ts                  P2 permission matrix + municipal scoping
    │   │   └── rate-limit.ts            P2 Redis sliding window
    │   ├── redis.ts                     P2
    │   ├── audit.ts                     P2 hash-chained audit writer
    │   ├── kta/                         P2 number generator, signer, renderer
    │   ├── notify/
    │   │   ├── telegram.ts              P2
    │   │   ├── mailer.ts                P2
    │   │   └── queue.ts                 P2 Redis queue + outbox worker
    │   ├── storage/                     P2 local / S3 drivers, signed URLs, image pipeline
    │   ├── validation/                  P2 zod schemas shared by forms and API
    │   └── i18n/                        P2 translation fallback helpers
    ├── server/
    │   ├── actions/                     P2 Server Actions
    │   └── services/                    P2 domain services used by actions and API
    └── worker/
        └── index.ts                     P2 notification and view-counter worker
```

## Data model overview

| Domain | Models |
|---|---|
| Geography | `Municipality` → `AdminPost` → `Suco` → `Aldeia` |
| Backoffice auth | `User`, `UserSession`, `UserRecoveryCode`, `PasswordResetToken`, `PasswordHistory` |
| SIM-PST | `Member`, `MemberStatusChange`, `MembershipCard`, `MemberNumberSequence`, `ImportJob` |
| Media | `MediaAsset`, `Album`, `AlbumTranslation`, `AlbumItem` |
| CMS | `Category`(+T), `Tag`, `Post`, `PostTranslation`, `PostViewDaily` |
| Documents | `Document`, `DocumentTranslation` (one PDF per language) |
| Static content | `PageSection`(+T), `HeroSlide`(+T), `SiteSetting` |
| Organisation | `Leadership`(+T), `BranchOffice` |
| Events | `Event`(+T), `EventAttendance` |
| Voice of the People | `Aspiration`, `AspirationAttachment`, `AspirationNote`, `ContactMessage` |
| Security | `AuditLog` (hash-chained), `NotificationOutbox` |

### Key design rules

- **Translations.** Each translatable entity has a `*Translation` row per locale,
  unique on `(parentId, locale)`. Slugs are unique per locale, so `/tet/notisia/...` and
  `/pt/noticias/...` can differ. Reads fall back to `tet`, then `pt`.
- **Personal data.** ID numbers are stored AES-256-GCM encrypted (`idNumberEnc`) with an
  HMAC blind index (`idNumberHash`, unique) for duplicate detection; only the last 4
  digits are shown. Member photos and ID scans are `PRIVATE` media served through
  short-lived signed URLs. Public forms keep an HMAC of the IP, not the raw address.
- **KTA numbers.** `PST-<MUN>-<YYYY>-<NNNNNN>`, e.g. `PST-DI-2026-000042`, assigned on
  verification from `MemberNumberSequence` with `UPDATE … RETURNING`, so concurrent
  approvals never collide. The QR code holds `KTA_VERIFY_URL/<qrToken>`, a random token
  that can be rotated without changing the card number. Each issued card stores an
  Ed25519 signature over its payload.
- **Municipal scope.** `MUNICIPAL_COORDINATOR` users carry `municipalityId`. The RBAC
  layer (P2) adds that filter to every member, event and aspiration query.
- **Audit.** Rows are append-only. `hash = SHA256(prevHash || canonical(row))` makes
  deletions and edits detectable. The app DB role gets no `UPDATE`/`DELETE` on
  `audit_logs` (P4 grants script).
- **Legacy migration.** `legacySource` + `legacyId` (unique together) on posts, media,
  documents, leadership, page sections, members and contact messages, so the importer
  for the old PHP site can be re-run safely.

### Legacy → new mapping (old `pst_db` MariaDB)

| Legacy table | New model(s) |
|---|---|
| `news` | `Post(type=NEWS)` + `PostTranslation` (tet ← base cols, pt, en) |
| `articles` | `Post(type=ARTICLE)` + `PostTranslation`; `pdf_file` → `Document` |
| `gallery` | `MediaAsset` (+ `Album` per category) |
| `leadership` | `Leadership(level=CENTRAL_COMMITTEE)` + `LeadershipTranslation` |
| `programs` | `PageSection(page=PROGRAM, icon)` + translations |
| `about_sections` | `PageSection(page=ABOUT)` + translations |
| `members` | `Member(channel=LEGACY_MIGRATION, status=PENDING)`: re-verification needed, since the legacy rows have no ID number or consent record |
| `contact_messages` | `ContactMessage` |
| `admins` | not migrated; accounts are recreated with argon2id and 2FA |

## Local development (Phase 1)

```bash
cp .env.example .env            # set DATABASE_URL to your local Postgres
npm install                     # runs `prisma generate`
npx prisma migrate dev          # applies prisma/migrations
npx prisma db seed              # prints a one-time super admin password
```

To load sucos and aldeias, copy `prisma/data/sucos-aldeias.example.csv` to
`prisma/data/sucos-aldeias.csv`, fill in the official MAE list, and re-run the seed.
