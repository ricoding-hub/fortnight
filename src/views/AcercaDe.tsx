import { useNavigate } from 'react-router-dom'
import {
  IconChevronLeft,
  IconBrandGithub,
  IconShieldLock,
  IconSparkles,
  IconCode,
  IconHeart,
} from '@tabler/icons-react'
import { Card } from '@/components/ui/Card'

const VERSION = __APP_VERSION__

const STACK = [
  { label: 'React 19 + TypeScript', role: 'UI' },
  { label: 'Tailwind CSS v4', role: 'Estilos' },
  { label: 'Supabase', role: 'Backend / Auth' },
  { label: 'Vite + PWA', role: 'Build' },
  { label: 'Zustand', role: 'Estado UI' },
  { label: 'Recharts', role: 'Gráficas' },
  { label: 'date-fns', role: 'Fechas' },
]

export function AcercaDe() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col pb-8 animate-[fade-in_300ms_ease-out]">
      {/* Header */}
      <header className="flex items-center px-4 pb-2 pt-4 lg:pt-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Volver"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-elevated text-text-secondary shadow-card transition-colors hover:bg-bg-secondary"
        >
          <IconChevronLeft size={18} />
        </button>
        <h1 className="mx-auto font-display text-lg font-bold tracking-tight text-text">
          Acerca de
        </h1>
        <div className="w-10" />
      </header>

      {/* Hero */}
      <div className="px-4 pt-2">
        <div
          className="relative overflow-hidden rounded-2xl p-6 text-white"
          style={{ background: 'linear-gradient(135deg, #2A4BFF 0%, #9B7BFF 100%)' }}
        >
          <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10" />
          <div className="absolute -bottom-6 -left-4 h-24 w-24 rounded-full bg-white/8" />
          <div className="relative flex flex-col gap-1">
            <p className="font-display text-3xl font-extrabold tracking-tight">Fortnight</p>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 font-mono text-xs font-bold">
                v{VERSION}
              </span>
              <span className="text-xs text-white/70">Versión actual</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-white/85">
              Tu app de finanzas personales para el contexto mexicano. Sueldo catorcenal,
              sin APIs bancarias, sin fricción.
            </p>
          </div>
        </div>
      </div>

      {/* Qué es */}
      <SectionHeader icon={IconSparkles}>Por qué existe</SectionHeader>
      <div className="px-4">
        <Card className="flex flex-col gap-3 text-[13px] leading-relaxed text-text-secondary">
          <p>
            Las apps de finanzas asumen que tu banco tiene API pública y que cobras mensual.
            En México, fintechs como Nu, Plata o Klar no exponen APIs, y la mayoría de los
            trabajadores cobra cada catorcena.
          </p>
          <p>
            Fortnight resuelve esto con entrada manual optimizada para velocidad (editar
            saldo en menos de 10 segundos), proyecciones de deuda con ciclo catorcenal, y
            consciencia del ciclo de corte y pago de tarjetas.
          </p>
        </Card>
      </div>

      {/* Privacidad */}
      <SectionHeader icon={IconShieldLock}>Privacidad</SectionHeader>
      <div className="px-4">
        <Card className="flex flex-col gap-2">
          <PrivacyRow label="Sin analytics de terceros" ok />
          <PrivacyRow label="Sin tracking" ok />
          <PrivacyRow label="Tus datos solo van a Supabase (PostgreSQL)" ok />
          <PrivacyRow label="RLS activo en todas las tablas" ok />
          <PrivacyRow label="Exporta tus datos completos en JSON" ok />
        </Card>
      </div>

      {/* Stack */}
      <SectionHeader icon={IconCode}>Construido con</SectionHeader>
      <div className="px-4">
        <Card className="overflow-hidden p-0">
          {STACK.map((item, i) => (
            <div
              key={item.label}
              className={
                'flex items-center justify-between px-4 py-3 ' +
                (i < STACK.length - 1 ? 'border-b border-bg-secondary' : '')
              }
            >
              <span className="text-[13px] font-semibold text-text">{item.label}</span>
              <span className="rounded-md bg-bg-secondary px-2 py-0.5 text-[11px] font-bold text-text-tertiary">
                {item.role}
              </span>
            </div>
          ))}
        </Card>
      </div>

      {/* Historial */}
      <SectionHeader icon={IconBrandGithub}>Historial de versiones</SectionHeader>
      <div className="px-4">
        <Card className="flex flex-col gap-3">
          <VersionRow
            version="0.2.0"
            date="25 may 2026"
            current
            notes={[
              'Metas enlazables a múltiples cuentas (cajitas, apartados, CETES)',
              'Proyección muestra saldo real de tus cuentas, no estimación',
              'Desglose: ingreso → fijos → suscripciones → variables → disponible',
              'Gráfica de proyección interactiva con tooltip',
              'Marcar gastos fijos como pagados del mes',
              'Suscripciones registradas alimentan la línea del presupuesto',
              'Chip "vas adelantado/atrasado" basado en pagos reales',
            ]}
          />
          <VersionRow
            version="0.1.0"
            date="23 may 2026"
            notes={[
              'Lanzamiento inicial del PWA',
              'Auth con magic link (Supabase)',
              'Vistas: Resumen, Cuentas, Movimientos, Plan, Préstamos, Perfil',
              'Ciclo catorcenal y proyección de deuda',
              'Score financiero 1-10',
              'Exportación de datos en JSON',
              'Richeto y misiones diarias',
            ]}
          />
        </Card>
      </div>

      {/* Footer */}
      <div className="mt-6 flex flex-col items-center gap-1 px-4">
        <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
          <IconHeart size={11} className="text-debt" />
          <span>Hecho en México</span>
        </div>
        <p className="font-mono text-[10px] text-text-tertiary">
          Fortnight v{VERSION} · SemVer · Keep a Changelog
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Primitives                                                           */
/* ------------------------------------------------------------------ */

function SectionHeader({ children, icon: Icon }: { children: React.ReactNode; icon: typeof IconSparkles }) {
  return (
    <div className="flex items-center gap-2 px-4 pb-2 pt-5">
      <Icon size={13} className="text-text-tertiary" />
      <h2 className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-text-tertiary">
        {children}
      </h2>
    </div>
  )
}

function PrivacyRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ' +
          (ok ? 'bg-asset-soft text-asset-deep' : 'bg-debt-soft text-debt-deep')
        }
      >
        {ok ? '✓' : '✗'}
      </span>
      <span className="text-[13px] text-text">{label}</span>
    </div>
  )
}

interface VersionRowProps {
  version: string
  date: string
  current?: boolean
  notes: string[]
}

function VersionRow({ version, date, current, notes }: VersionRowProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-extrabold text-text">v{version}</span>
        {current && (
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-extrabold text-primary">
            actual
          </span>
        )}
        <span className="ml-auto text-[11px] text-text-tertiary">{date}</span>
      </div>
      <ul className="flex flex-col gap-1">
        {notes.map((note) => (
          <li key={note} className="flex items-start gap-2 text-[12px] text-text-secondary">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-text-tertiary" />
            {note}
          </li>
        ))}
      </ul>
    </div>
  )
}
