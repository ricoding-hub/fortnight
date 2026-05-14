# Fortnight — Prompt sequence for Claude Code

Use these prompts in order. Each one is scoped tight enough that Claude Code can execute cleanly with CLAUDE.md as context.

## Prerequisites (do BEFORE opening Claude Code)

1. Create a free Supabase project at supabase.com
2. Run the SQL in `supabase/migrations/001_initial.sql` from the Supabase SQL Editor
3. Grab your project URL and anon key from Supabase Settings > API
4. Create the project locally:

```bash
npm create vite@latest fortnight -- --template react-ts
cd fortnight
```

5. Drop `CLAUDE.md` into the project root
6. Drop `001_initial.sql` into `supabase/migrations/`
7. Create `.env.local` with:

```
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_KEY=your_anon_key
```

8. Open Claude Code in the project folder: `claude`

---

## Prompt 1 — Project setup

```
Read CLAUDE.md fully. Then set up the project foundation:

1. Install dependencies: tailwindcss, postcss, autoprefixer, 
   vite-plugin-pwa, @supabase/supabase-js, zustand, recharts, 
   react-router-dom, react-hook-form, zod, @hookform/resolvers, 
   date-fns, @tabler/icons-react, clsx

2. Configure Tailwind with our color palette as theme extensions 
   (red 600, teal 600, blue 600, amber 600 from CLAUDE.md)

3. Configure vite-plugin-pwa in vite.config.ts with name "Fortnight", 
   short_name "Fortnight", display "standalone", theme_color "#185FA5"

4. Set up path alias @/ pointing to ./src/

5. Create the folder structure exactly as in CLAUDE.md

6. Create src/lib/supabase.ts with the typed client using env vars

7. Create src/types/index.ts with all interfaces matching CLAUDE.md data model

Show me the diffs before applying.
```

---

## Prompt 2 — Auth flow

```
Build the auth flow:

1. src/hooks/useAuth.ts — Supabase magic link auth, session listener, 
   sign in / sign out

2. src/views/auth/Login.tsx — Email input, "Send magic link" button, 
   light mode styling per CLAUDE.md design rules

3. src/views/auth/AuthCallback.tsx — Handles the magic link return

4. src/App.tsx — Route structure with auth guard. Public: /login, 
   /auth/callback. Protected: everything else.

5. src/components/ui/Button.tsx, Input.tsx, Card.tsx — Base components 
   following design rules

No mock data. Use real Supabase.
```

---

## Prompt 3 — Data hooks

```
Create custom hooks for data fetching, each returns { data, loading, 
error, mutations }:

1. src/hooks/useAccounts.ts — list, create, update, deleteAccount, 
   updateBalance (creates adjustment transaction)

2. src/hooks/useTransactions.ts — list (with filters: account, 
   category, dateRange), create, delete

3. src/hooks/useLoans.ts — list active, list paid, create, 
   markPaid, delete

4. src/hooks/useConfig.ts — get, update user_config

5. src/hooks/useCategories.ts — list

All hooks must:
- Subscribe to Supabase realtime for cross-device sync
- Handle loading and error states cleanly
- Type returns strictly with our types/index.ts

Add a src/lib/format.ts with formatMXN(n) and formatDateMX(d) helpers.
```

---

## Prompt 4 — Base layout and BottomNav

```
Build the persistent layout:

1. src/components/BottomNav.tsx — 5 tabs (Resumen, Cuentas, 
   Movimientos, Proyección, Préstamos) with Tabler icons, 
   matches design rules

2. src/App.tsx update — Wrap protected routes in a Layout that 
   includes BottomNav. Max width 420px centered on larger screens 
   but flush on mobile.

3. Add global styles in src/index.css: Tailwind directives, 
   font-family system stack, prevent text size adjust on iOS, 
   safe-area-inset-bottom padding for BottomNav on iPhone.
```

---

## Prompt 5 — Resumen view

```
Build src/views/Resumen.tsx with these sections, matching the 
prototype we already validated:

1. BalanceHero component — Big balance neto number (positive green, 
   negative red), subtitle "activos − deuda total"

2. Stats grid 2x2 — Activos en débito, Deuda total, Por cobrar, 
   Score financiero

3. Credit utilization card — Progress bars per credit card with 
   color coding (red >80%, amber >50%, green otherwise)

4. Urgent payment alert — If any credit card has payment_due_day 
   within 5 days, show prominent warning card with days remaining

5. Last updated footer

Use the hooks from Prompt 3. No mock data. Compute score using 
src/lib/score.ts (create it: function calculateScore(accounts) 
implementing the logic from CLAUDE.md).
```

---

## Prompt 6 — Cuentas view with credit cycle

```
Build src/views/Cuentas.tsx:

1. Two sections: Débito and Crédito

2. Each account row: colored initials icon, name, balance, edit 
   pencil, current cycle info for credit cards

3. Tap to edit balance inline. Saving creates an 'adjustment' 
   transaction with the diff (uses useAccounts.updateBalance).

4. Long press or settings icon: edit account details (name, limit, 
   cut_day, payment_due_day)

5. Add new account button at bottom of each section

6. src/components/CreditCycleBadge.tsx — Shows days until cut, 
   days until payment due. Red if payment due within 5 days. 
   Use date-fns for calculations.

Forms validated with Zod + React Hook Form.
```

---

## Prompt 7 — Movimientos view

```
Build src/views/Movimientos.tsx — Transaction log:

1. Filter bar top: account dropdown, category dropdown, date range

2. List grouped by date (Today, Yesterday, Mar 12, etc.)

3. Each row: category icon + name, account name, amount (signed 
   color), description if any

4. Floating action button bottom right: opens add transaction modal

5. Add transaction modal: amount, account (required), category, 
   description, date (defaults today). Signed amount based on 
   account type and intent (form has "income / expense" toggle 
   that flips the sign automatically).

6. Swipe left on row to delete (with confirmation)

Real Supabase data, no mocks. Form uses React Hook Form + Zod.
```

---

## Prompt 8 — Proyección view

```
Build src/views/Proyeccion.tsx:

1. Big "Disponible mensual para deuda" number computed from 
   useConfig

2. Bar chart using Recharts: month labels x-axis, projected debt 
   y-axis. Bars green when reaches 0.

3. Stats: Deuda actual, Mes libre de deuda

4. Supuestos card with current values (catorcena, vales, fixed, 
   variable). Tap to edit modal.

5. src/lib/projection.ts — function projectDebtPayoff(totalDebt, 
   monthlyAvailable, startDate) returns array of { month, debt } 
   points.

If monthlyAvailable <= 0, show clear warning instead of chart.
```

---

## Prompt 9 — Préstamos view

```
Build src/views/Prestamos.tsx:

1. Total por cobrar hero at top

2. List of active loans: name, amount, notes preview, edit and 
   "marked paid" actions

3. Tap row to expand inline edit (amount + notes)

4. Check button: mark as paid. Confirmation. Sets paid_at to now() 
   but keeps record (for history view later).

5. Plus button at bottom: inline form to add new (name, amount, 
   optional notes)

6. Empty state when no active loans
```

---

## Prompt 10 — PWA polish and deploy

```
1. Generate PWA icons (192x192, 512x512, maskable) using a simple 
   "F" mark on the blue 600 background. Place in public/icons/.

2. Verify manifest.webmanifest is correct (name, short_name, 
   theme_color, background_color "#FFFFFF", display "standalone", 
   start_url "/").

3. Add a Settings drawer accessible from Resumen header:
   - Sign out
   - Export data to JSON (downloads file with all user data)
   - App version

4. Test offline read access works (Workbox should cache the shell)

5. Create README.md for GitHub with: project description, screenshots 
   placeholders, tech stack, setup instructions, deploy instructions

6. Set up Vercel deployment: create vercel.json, add environment 
   variables guide to README

Run a full Lighthouse audit and address anything below 90 on 
mobile PWA score.
```

---

## After V1: Future prompts

These are reserved for after V1 ships and you've used it for 2 weeks:

- Recurring transactions (auto-create rent on 5th of month)
- Trend charts (balance over time, spending by category)
- Catorcena calendar view
- Income tracking with multiple sources (bonuses, fondo de ahorro)
- Search across all transactions
- Tags in addition to categories
- Multi-currency (if traveling)

Don't add these to V1. Ship V1 first, use it, then prioritize.
