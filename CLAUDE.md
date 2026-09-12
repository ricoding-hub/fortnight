# Fortnight — Personal Finance PWA

> Know where you stand every payday.

## Project context

Personal finance PWA built mobile-first for the Mexican context (catorcena = biweekly pay, multiple Mexican fintechs without public APIs). Solo developer project, also serves as GitHub portfolio piece. Code quality and design polish matter as much as feature completeness.

## Why this exists

Existing finance apps fail because:
- They assume bank API integration (Mexican fintechs like Nu, Plata, Klar don't expose APIs)
- They assume monthly pay cycles (Mexican workers get catorcena = every 14 days)
- They require too much friction to update (manual entry must take under 10 seconds)

Fortnight solves this with:
- Manual entry optimized for speed (one tap to edit balance)
- Catorcena-aware debt payoff projections
- Hybrid model: balance snapshots + categorized transactions
- Credit card cycle awareness (cut date, payment due)

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Build | Vite | Fast HMR, clean PWA support |
| UI | React 19 + TypeScript | Modern, strong portfolio signal |
| Styling | Tailwind CSS v4 | Mobile-first; palette in `@theme`, no config file |
| State (UI) | Zustand | Minimal boilerplate |
| Backend | Supabase | Postgres + auth + realtime + RLS |
| PWA | vite-plugin-pwa | Workbox under the hood |
| Charts | Recharts | TypeScript-friendly |
| Routing | React Router v7 | Standard |
| Forms | React Hook Form + Zod | Type-safe validation |
| Dates | date-fns | Tree-shakeable, locale-aware |
| Deploy | Vercel | Free HTTPS, instant deploys |

## Design rules (non-negotiable)

- **Light mode FIRST**. No dark mode initially.
- **Mobile-first**. Design at 380px width baseline. Tablet/desktop come second.
- **Responsive layout**: mobile (< 768px) bottom nav, tablet/desktop (≥ 1024px) sidebar nav.
- **Glassmorphism with care**: translucent cards with backdrop-blur. Always maintain text contrast ≥ 4.5:1.
- **Gradients allowed**: used for hero sections, CTAs, and accent areas. Keep subtle on data-heavy sections.
- **Shadows allowed**: layered elevation system for depth and hierarchy.
- **Micro-animations**: subtle transitions on hover, focus, and state changes. Respect `prefers-reduced-motion`.
- **One-screen views.** Avoid long-scroll pages on mobile.
- **Currency**: MXN, formatted with `Intl.NumberFormat('es-MX')`. More currencys will be added
- **Typography**: Outfit (Google Fonts) — geometric, modern, excellent for financial numerals.
- **Color palette**:
  - Primary: `#6366F1` (indigo) — trust, intelligence
  - Primary deep: `#4338CA` — CTAs, active states
  - Accent: `#F59E0B` (amber) — rewards, streaks, warmth
  - Positive/asset: `#10B981` (emerald) — income, growth
  - Negative/debt: `#EF4444` (rose-red) — debt, alerts
  - Warning: `#F97316` (orange)
  - Surface: `#FAFBFF` primary, `#F0F1F8` secondary
  - Glass: `rgba(255,255,255,0.7)` + backdrop-blur
  - Text: `#0F0D2E` primary, `#6B7194` secondary
  - Border: `rgba(99,102,241,0.12)` (indigo-tinted)
- **Sentence case** in all labels. Never Title Case.
- **No emoji as decoration.** Only as account icons if explicitly chosen by user.

## Data model

### accounts
- `id` uuid, `user_id` uuid (RLS)
- `name` text, `type` text ('debit' | 'credit')
- `balance` numeric (always positive number; for credit, represents debt amount)
- `credit_limit` numeric (nullable, credit only)
- `cut_day` int 1-31 (nullable, credit only)
- `payment_due_day` int 1-31 (nullable, credit only)
- `color` text (nullable, for UI accent)
- `created_at`, `updated_at`

### transactions
- `id` uuid, `user_id` uuid (RLS)
- `account_id` uuid → accounts
- `amount` numeric (signed: + or -)
  - Debit: positive = deposit, negative = expense
  - Credit: positive = purchase (debt up), negative = payment (debt down)
- `category_id` uuid → categories (nullable)
- `description` text (nullable)
- `date` date
- `type` text ('transaction' | 'adjustment')
  - 'adjustment' = balance reconciliation, auto-created when user edits balance directly
- `created_at`

### categories
- `id` uuid, `user_id` uuid (RLS)
- `name` text, `kind` text ('fixed' | 'variable' | 'income')
- `icon` text (nullable, Tabler icon name)
- `color` text (nullable)

Pre-seeded categories per user:
- Fixed: Renta, Servicios, Suscripciones
- Variable: Comida, Social, Transporte, Salud, Otros
- Income: Salario, Vales, Extra

### loans
- `id` uuid, `user_id` uuid (RLS)
- `name` text (debtor name)
- `amount` numeric
- `notes` text (nullable)
- `created_at`, `paid_at` (nullable)

### user_config
- `user_id` uuid pk
- `catorcena` numeric (net biweekly pay)
- `vales` numeric (food vouchers per biweekly)
- `fixed_monthly` numeric (estimated)
- `variable_monthly` numeric (estimated)
- `next_pay_date` date
- `updated_at`

## Hybrid balance model

The user has two ways to keep balances current:

1. **Quick balance update** — Tap account, edit balance, save. App creates an 'adjustment' transaction with the diff so history isn't lost.

2. **Log transaction** — Add categorized transaction. Balance updates automatically via DB trigger.

Both are valid. UX should make both equally easy. Defaults to quick balance update for speed.

## Credit card cycles

Each credit card has `cut_day` and `payment_due_day`. The UI surfaces:
- Days until cut
- Days until payment due
- Red highlight when payment due in less than 5 days
- Cycle progress visualization

## Projection logic

```
monthlyIncome = (catorcena * 2) + (vales * 2)
monthlyDisposable = monthlyIncome - fixedMonthly - variableMonthly
```

Project total credit debt month by month subtracting monthlyDisposable. Output: months until debt-free, displayed as bar chart.

## Score logic

Financial score 1-10 calculated from:
- Credit utilization ratio (sum of balances / sum of limits)
- Liquidity ratio (debit total / credit debt)
- Adjusted weights based on values

## Views (bottom nav, 5 tabs)

1. **Resumen** — Balance neto hero, stats grid, credit utilization, urgent payment alerts
2. **Cuentas** — Debit + credit accounts, edit inline, credit cycle info per card
3. **Movimientos** — Transaction log, filter by category/account, add new
4. **Proyección** — Debt payoff timeline chart, score, supuestos
5. **Préstamos** — Loans-to-friends tracker

## Auth

Supabase auth, tres caminos que conviven:

- **Correo y contraseña** (`signInWithPassword` / `signUp`). Mínimo 10
  caracteres, validado en `src/lib/password.ts` antes de llegar al servidor.
- **Enlace mágico** (`signInWithOtp`), que sigue siendo lo más cómodo en móvil.
- **Google** (OAuth).

Recuperación en `/auth/forgot` → correo → `/auth/reset`. Reglas que no se
negocian:

- La solicitud de recuperación responde **siempre lo mismo**, exista la cuenta o
  no: decir lo contrario convierte la pantalla en un detector de correos
  registrados.
- El enlace de recuperación **abre sesión real** (`detectSessionInUrl`), así que
  `useAuth` marca `isRecovery` y `ProtectedRoute` bloquea la app hasta que se
  elija contraseña nueva.
- Los mensajes de error salen de `src/lib/authErrors.ts`, nunca del texto crudo
  de Supabase, que viene en inglés y con códigos.

## Security

This handles sensitive financial data. Rules:
- ALL Supabase tables MUST use RLS — users only see their own data
- No third-party analytics
- No tracking
- Export to JSON available from settings
- No external APIs called from client beyond Supabase

## Code style

- Function components with TypeScript, no class components
- Custom hooks for data: `useAccounts()`, `useTransactions()`, `useLoans()`
- Zustand for UI state only (modal open, editing id, etc.)
- Supabase queries co-located in custom hooks
- Tailwind classes inline, no separate CSS files except globals
- File naming: PascalCase for components, camelCase for utilities and hooks
- Import order: react → third-party → @/lib → @/components → @/types → relative

## Project structure

```
fortnight/
├── public/
│   ├── icons/         # PWA icons 192, 512, maskable
│   └── manifest.webmanifest
├── src/
│   ├── components/
│   │   ├── ui/        # Button, Card, Input, Modal (base)
│   │   ├── BalanceHero.tsx
│   │   ├── AccountCard.tsx
│   │   ├── TransactionRow.tsx
│   │   ├── ProjectionChart.tsx
│   │   ├── LoanRow.tsx
│   │   ├── CreditCycleBadge.tsx
│   │   └── BottomNav.tsx
│   ├── views/
│   │   ├── Resumen.tsx
│   │   ├── Cuentas.tsx
│   │   ├── Movimientos.tsx
│   │   ├── Proyeccion.tsx
│   │   ├── Prestamos.tsx
│   │   └── auth/
│   │       ├── Login.tsx
│   │       └── AuthCallback.tsx
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useAccounts.ts
│   │   ├── useTransactions.ts
│   │   ├── useLoans.ts
│   │   └── useConfig.ts
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── projection.ts
│   │   ├── score.ts
│   │   ├── dates.ts       # catorcena calculations
│   │   └── format.ts      # currency, date formatters
│   ├── store/
│   │   └── uiStore.ts
│   ├── types/
│   │   └── index.ts
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css          # @import 'tailwindcss' + @theme palette
│   └── vite-env.d.ts      # env var typings
├── supabase/
│   └── migrations/
│       └── 001_initial.sql
├── CLAUDE.md              # this file
├── README.md
├── .env.example
├── vite.config.ts
└── package.json
```

## Out of scope for V1

These are explicitly NOT to be built without future user request:
- Multi-currency support
- Bank API integration
- Multi-user / shared accounts
- Investment tracking
- Push notifications (iOS PWA limitation anyway)
- Dark mode
- AI categorization
- Receipt scanning

## Acceptance criteria for V1

- [ ] PWA installable from iPhone Safari
- [ ] Auth via magic link works end to end
- [ ] All 5 views functional
- [ ] Sync between iPhone and laptop works (sub-2-second propagation)
- [ ] Data export to JSON works
- [ ] Lighthouse mobile PWA score above 90
- [ ] Works offline for read access (Workbox cache)
