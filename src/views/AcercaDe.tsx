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

const STACK: { label: string; role: string }[] = [
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
            version="1.1.3"
            date="14 jul 2026"
            current
            notes={[
              'Corregido: crear una conexión o saldar con una persona nueva ya no falla por permisos',
              'Las misiones de score ya no se marcan como logradas si tu score no llega a la meta',
            ]}
          />
          <VersionRow
            version="1.1.2"
            date="9 jul 2026"
            notes={[
              'Los saldos con una persona se tratan como conexión directa 1-a-1, no como grupo',
              'Los errores muestran la causa real (antes se ocultaba en los mensajes de Supabase)',
            ]}
          />
          <VersionRow
            version="1.1.1"
            date="8 jul 2026"
            notes={[
              'Corregido: abrir grupo y saldar con personas nuevas ya no falla',
              'Se evita crear grupos duplicados al abrir el de un contacto',
              'Los errores muestran la causa real en vez de un mensaje genérico',
            ]}
          />
          <VersionRow
            version="1.1.0"
            date="8 jul 2026"
            notes={[
              'Sobrenombre en Perfil: el nombre que eliges se usa en toda la app y lo ven las personas conectadas',
              'Foto para los grupos, para identificarlos de un vistazo',
              'Reordena personas y grupos arrastrándolos; el orden se guarda y se sincroniza entre dispositivos',
              'Los grupos ahora se expanden en la lista: balances y movimientos sin entrar al detalle',
            ]}
          />
          <VersionRow
            version="1.0.2"
            date="7 jul 2026"
            notes={[
              'Los contactos conectados muestran su foto de perfil real',
              'Los gastos compartidos se desglosan y editan directamente en el card de cada persona',
              'KPIs y saldos en enteros — sin decimales descuadrados',
            ]}
          />
          <VersionRow
            version="1.0.1"
            date="7 jul 2026"
            notes={[
              'Relación 1:1 coherente: al conectarse una persona, sus préstamos se convierten en registros compartidos del grupo',
              'Sin duplicados: la sección Grupos es solo para 3+ personas; cada persona vive en un solo card',
              '"Saldar todo" ahora salda TODOS los préstamos (ambas direcciones) y refresca al instante',
              'Recientes muestra solo usuarios reales con cuenta conectada',
            ]}
          />
          <VersionRow
            version="1.0.0"
            date="6 jul 2026"
            notes={[
              'Versión estable — auditoría completa de sistema con todas las causas raíz corregidas',
              'XP arreglado: premios atómicos en servidor, sin reinicios ni parpadeos a nivel 1',
              'La fecha de pago ya se guarda siempre (incluso si navegas de inmediato)',
              'Foto de perfil funcional: el almacenamiento faltaba desde el inicio, ya existe',
              'Logo en el login y favicon nítido en pestaña y PWA instalada',
              'Diseño más limpio: sin barras de acento, colores unificados al sistema de tokens',
              'Estabilidad: sin recargas dobles, sin pantallas de error transitorias, "Saldar todo" robusto',
            ]}
          />
          <VersionRow
            version="0.10.0"
            date="6 jul 2026"
            notes={[
              'Cada persona ahora es un grupo: comparte enlace, divide gastos y ve su historial desde su card',
              '"Saldar todo": liquida todos los préstamos y gastos con una persona en un solo movimiento',
              'Trazabilidad total: cada préstamo, abono, edición y saldado queda en el historial del grupo',
              'KPIs renovados: balance neto con proporción, por cobrar/pagar y recuperado en 30 días',
              'Gráfica "Flujo de préstamos": cuánto prestas vs recuperas cada mes y lo que te deben al cierre',
            ]}
          />
          <VersionRow
            version="0.9.1"
            date="6 jul 2026"
            notes={[
              'Invitación por enlace: comparte el link del grupo y quien lo abre elige quién es o se agrega como nueva persona',
              'Contactos recientes: agrega a tu grupo gente de grupos anteriores con un toque',
              'Nuevo: editar gastos, renombrar grupo, agregar personas a grupos existentes y deshacer liquidaciones',
              'Corregido: miembros invitados ya pueden registrar gastos y liquidaciones en sus propias cuentas',
            ]}
          />
          <VersionRow
            version="0.9.0"
            date="5 jul 2026"
            notes={[
              'Grupos compartidos multi-usuario: invita amigos por correo y dividan gastos en tiempo real',
              'Historial de actividad por grupo: quién agregó, editó o eliminó cada gasto',
              'Notificaciones de grupo: gastos nuevos, pagos e invitaciones, con acceso directo',
              'Cualquier miembro puede registrar y editar gastos; los balances se mantienen coherentes para todos',
            ]}
          />
          <VersionRow
            version="0.8.0"
            date="3 jul 2026"
            notes={[
              'Mini split: grupos de gastos compartidos entre varias personas',
              'Repartición por igual, porcentaje, monto exacto o partes',
              'Simplificación de deudas: pagos mínimos sugeridos para saldar el grupo',
              'Los préstamos 1:1 existentes se conservan y conviven con los grupos',
            ]}
          />
          <VersionRow
            version="0.7.0"
            date="20 jun 2026"
            notes={[
              'Agregar gasto rediseñado: cuentas en grilla 2 columnas, todas las categorías visibles',
              'Bug crítico corregido: pantalla de éxito ya no destella y regresa al formulario',
              'XP y rachas arreglados: umbrales más accesibles (nivel 2 a los 100 XP)',
              'Fórmula de nivel unificada entre cliente y servidor',
            ]}
          />
          <VersionRow
            version="0.6.4"
            date="16 jun 2026"
            notes={[
              'Hero restaurado: balance neto como número principal, barra split Activos / Deuda',
              'Chip "Cuotas mensuales" (morado) muestra lo que debes cubrir este ciclo si tienes planes MSI activos',
              'Planes MSI muestran monto restante ($) en lugar del total, para comparar contra estado de cuenta',
            ]}
          />
          <VersionRow
            version="0.6.3"
            date="15 jun 2026"
            notes={[
              'Editar plan MSI: corrige meses pagados, monto, nombre — incluyendo deshacer "marcar mes pagado"',
              'Badge de tipo cambia de "0%" a "Sin interés" (eliminaba la confusión con el porcentaje de progreso)',
              'Chip "Este mes" en hero mostrando obligación mensual real (mensualidades MSI + saldo libre)',
            ]}
          />
          <VersionRow
            version="0.6.2"
            date="15 jun 2026"
            notes={[
              'Revertida la complejidad de deuda v0.5.0: APR, tipo de costo y % mínimo eliminados del formulario',
              'Error silencioso al guardar MSI corregido: ahora muestra toast de error con el mensaje real',
              'AccountCard simplificada: elimina línea de pago mínimo y buffer de prepago',
              'Hero restaurado con mini dashboard Activos / Deuda',
            ]}
          />
          <VersionRow
            version="0.5.0"
            date="10 jun 2026"
            notes={[
              'Inteligencia de deuda: clasificación stock vs flujo, APR, buffer de prepago y bandera MSI',
              'Columna is_zero_interest en planes a meses',
            ]}
          />
          <VersionRow
            version="0.4.1"
            date="7 jun 2026"
            notes={[
              'Préstamos: acciones siempre visibles, KPIs responsive, FAB contextual y ordenamiento por fecha',
            ]}
          />
          <VersionRow
            version="0.3.0"
            date="4 jun 2026"
            notes={[
              'Optimistic updates: crear/editar/eliminar cuentas, movimientos, préstamos y metas se refleja al instante',
              'Balance neto: la tendencia de 7 días ahora incluye ajustes de saldo',
              'Meses sin intereses (MSI): registra gastos a meses con progreso y monto mensual',
              'Correo de vencimiento: se envía automáticamente cada día vía cron de Vercel',
              'Misiones ampliadas: 9 misiones nuevas (categorizar, ajustar, préstamos, score, etc.)',
              'Próxima fecha de cobro en el hero de balance',
              'StatCards: barra superior de color en lugar de borde lateral',
              'Proyección: desglose de gastos con etiquetas claras y sección explicativa',
              'Fix: racha de días ya no se sobreescribe al reclamar misiones',
            ]}
          />
          <VersionRow
            version="0.2.9"
            date="25 may 2026"
            notes={[
              'Cuentas: reordena con el modo "Reordenar" y elige logo del banco + color de acento',
              'Movimientos: por defecto muestra los últimos 30 días; toca un movimiento para ver el detalle completo',
              'Atajo claro a Movimientos desde la lista de cuentas, sin ocupar otra pestaña',
            ]}
          />
          <VersionRow
            version="0.2.8"
            date="25 may 2026"
            notes={[
              'Saldos de crédito sincronizados ya se guardan y muestran en positivo',
              'Movimientos vive ahora como subtab dentro de Cuentas',
              'Tap a cualquier cuenta abre Movimientos prefiltrado por esa cuenta',
            ]}
          />
          <VersionRow
            version="0.2.7"
            date="25 may 2026"
            notes={[
              'Toca el score para ver el desglose completo: 5 señales con pesos y contribución',
              'Widget de banco: timeout explícito de 20 s en token + 15 s en script, mejor mensaje de error',
              'Bug: el script del widget ya se reinicializa al reintentar (no quedaba en estado de error)',
            ]}
          />
          <VersionRow
            version="0.2.6"
            date="25 may 2026"
            notes={[
              'Score financiero real: ahora mezcla utilización, liquidez, ahorro, racha y disciplina del plan',
              'Sparkline del score lee tu historial diario en lugar de un patrón sintético',
              'Marca tu meta principal con la estrella; se muestra primero en Plan y alimenta el "libre de deuda" del Resumen',
              'Misiones de la semana persisten en Supabase y otorgan XP al instante al completarse',
              'Card de Logros ahora navega al Perfil para ver tus logros completos',
            ]}
          />
          <VersionRow
            version="0.2.5"
            date="25 may 2026"
            notes={[
              'Tarjetas con pago hoy muestran "Pagar hoy" en lugar de "0 días"',
              'XP y racha vuelven a registrarse en cada movimiento',
              'Realtime activado para gamificación: streak y XP se actualizan al instante',
            ]}
          />
          <VersionRow
            version="0.2.4"
            date="25 may 2026"
            notes={[
              'Proyección lee fijos y variables del plan, no del onboarding',
              'Todos los items del presupuesto se pueden marcar como pagados',
            ]}
          />
          <VersionRow
            version="0.2.3"
            date="25 may 2026"
            notes={[
              'Proyección es la pestaña por defecto al abrir Plan',
              'Tu preset personalizado se guarda automáticamente al editar',
              'Confirmación al cambiar de preset si tienes uno personalizado',
              'Renombrar tu preset personal desde el chip activo',
              'Ajuste manual del gasto real por categoría desde modo edit',
              'Botón "Ajustar %" reubicado junto a los buckets',
            ]}
          />
          <VersionRow
            version="0.2.2"
            date="25 may 2026"
            notes={[
              'Gráfica de proyección muestra deuda real (no estimación original)',
              'Aporte mensual derivado del disponible real del presupuesto',
              'Card "Saldo actual" colapsable con desglose por cuenta',
              'Meta de deuda se muestra primero si el balance general es negativo',
            ]}
          />
          <VersionRow
            version="0.2.1"
            date="25 may 2026"
            notes={[
              'Edición y eliminación de metas desde el ícono de lápiz',
              'Re-enlace de cuentas en cualquier momento',
            ]}
          />
          <VersionRow
            version="0.2.0"
            date="25 may 2026"
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
