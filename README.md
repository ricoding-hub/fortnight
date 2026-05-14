# Fortnight

> Know where you stand every payday.

A **mobile-first personal finance PWA** built for the Mexican context. Track multiple bank accounts, log categorized transactions, project your debt payoff timeline, and monitor credit card cycles — all synced in real time across devices.

<!-- TODO: Add screenshots
![Resumen view](docs/screenshots/resumen.png)
![Cuentas view](docs/screenshots/cuentas.png)
![Proyección view](docs/screenshots/proyeccion.png)
-->

## Why Fortnight?

Existing finance apps fail Mexican users because they:

- **Assume bank API integration** — Mexican fintechs (Nu, Plata, Klar) don't expose APIs
- **Assume monthly pay cycles** — Most Mexican workers receive _catorcena_ (biweekly pay)
- **Require too much friction** — Manual entry must take under 10 seconds

Fortnight solves this with a hybrid balance + transaction model, catorcena-aware projections, and one-tap balance updates.

## Features

- 📊 **Dashboard** — Net balance, debit totals, credit debt, and financial score at a glance
- 🏦 **Multi-account** — Track debit and credit accounts separately with credit utilization bars
- 💳 **Credit card cycles** — Cut date and payment due date awareness with urgent payment alerts
- 📈 **Debt projection** — Visualize your path to debt freedom based on your catorcena income
- 🤝 **Loans tracker** — Keep track of money lent to friends
- 🔄 **Real-time sync** — Supabase Realtime keeps all devices in sync
- 📱 **Installable PWA** — Works on iOS, Android, and desktop as a standalone app
- 📡 **Offline access** — Read your financial data even without internet
- 📤 **Data export** — Download all your data as JSON from Settings
- 🔐 **Magic link auth** — No passwords, just email

## Tech Stack

| Layer | Choice |
| --- | --- |
| **Build** | [Vite](https://vite.dev) |
| **UI** | [React 19](https://react.dev) + TypeScript |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com) |
| **State** | [Zustand](https://zustand.docs.pmnd.rs) |
| **Backend** | [Supabase](https://supabase.com) (Postgres + Auth + Realtime + RLS) |
| **PWA** | [vite-plugin-pwa](https://vite-pwa-org.netlify.app) (Workbox) |
| **Charts** | [Recharts](https://recharts.org) |
| **Routing** | [React Router v7](https://reactrouter.com) |
| **Forms** | [React Hook Form](https://react-hook-form.com) + [Zod](https://zod.dev) |
| **Dates** | [date-fns](https://date-fns.org) |
| **Icons** | [Tabler Icons](https://tabler.io/icons) |
| **Deploy** | [Vercel](https://vercel.com) |

## Prerequisites

- **Node.js** ≥ 20
- **npm** ≥ 10
- A free [Supabase](https://supabase.com) project

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/ricoding-hub/fortnight.git
cd fortnight
npm install
```

### 2. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the migration file:

```bash
# Option A: Using Supabase CLI
supabase db push

# Option B: Paste the contents of supabase/migrations/001_initial.sql
# into the Supabase SQL Editor and execute
```

3. Go to **Settings → API** and copy your **Project URL** and **anon key**

### 3. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Deploy to Vercel

### One-click deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ricoding-hub/fortnight&env=VITE_SUPABASE_URL,VITE_SUPABASE_KEY)

### Manual deploy

1. Install the [Vercel CLI](https://vercel.com/docs/cli):

```bash
npm i -g vercel
```

2. Deploy:

```bash
vercel
```

3. Set environment variables in the Vercel dashboard or CLI:

```bash
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_KEY
```

### Environment Variables

| Variable | Description | Where to find it |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Your Supabase project URL | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_KEY` | Your Supabase anon/public key | Supabase → Settings → API → `anon` `public` |

> [!IMPORTANT]
> Never expose your Supabase `service_role` key in the client. Only the `anon` key should be used. Row Level Security (RLS) ensures users can only access their own data.

## Project Structure

```
fortnight/
├── public/
│   ├── icons/              # PWA icons (192, 512, maskable)
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── ui/             # Base components (Button, Card, Input, Modal…)
│   │   ├── SettingsDrawer.tsx
│   │   ├── BottomNav.tsx
│   │   └── ...
│   ├── views/
│   │   ├── Resumen.tsx     # Dashboard / home
│   │   ├── Cuentas.tsx     # Accounts management
│   │   ├── Movimientos.tsx # Transaction log
│   │   ├── Proyeccion.tsx  # Debt projection
│   │   ├── Prestamos.tsx   # Loans tracker
│   │   └── auth/
│   ├── hooks/              # Data hooks with Supabase Realtime
│   ├── lib/                # Utilities (format, projection, score)
│   ├── store/              # Zustand UI state
│   └── types/              # TypeScript interfaces
├── supabase/
│   └── migrations/
├── vercel.json
├── vite.config.ts
└── package.json
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Type-check + production build |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |

## License

[MIT](LICENSE)
