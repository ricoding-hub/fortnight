# Changelog

All notable changes to Fortnight are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **`0.x.x`** — active development phase; features and data model may change between minor versions.
> **`1.0.0`** — will be tagged when all V1 acceptance criteria are met (PWA installable, full offline read, Lighthouse ≥ 90).

---

## [Unreleased]

### Planned
- Dark mode
- Multi-currency support
- Push notifications (post-iOS PWA limitation resolution)

---

## [0.1.0] — 2026-05-23

### Added
- Initial working release of the Fortnight PWA
- Auth via Supabase magic link (email, no password)
- **Resumen** view: net balance hero, stats grid, credit utilization, payment alerts
- **Cuentas** view: debit and credit account cards, quick balance edit, credit cycle info (cut date, due date)
- **Movimientos** view: transaction log with category and account filters, add transaction modal
- **Plan** view with three sub-sections:
  - Presupuesto: budget tracking against income
  - Proyección: catorcena-aware debt payoff chart
  - Objetivos: savings goals with progress tracking
- **Préstamos** view: loans-to-friends tracker
- **Perfil** view: pay frequency and amount config, upcoming paydays, notification toggles, Richeto pet toggle, connected banks, data export (JSON)
- Financial score (1–10) based on credit utilization and liquidity ratios
- Hybrid balance model: quick balance snapshot + categorized transaction log
- DB triggers: balance auto-updates on transaction insert/update/delete
- Row-Level Security on all Supabase tables
- Catorcena (biweekly) pay cycle support with auto-detected upcoming paydays
- Richeto: floating companion pet with XP/level system
- Misiones diarias: streak-based daily finance habits
- Podium and ranking (gamification scaffold)
- PWA manifest and Workbox offline cache for read access
- Syncfy integration scaffold for connected bank accounts
- Vercel deployment with instant HTTPS
