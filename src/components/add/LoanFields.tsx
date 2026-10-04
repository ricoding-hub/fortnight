import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Segmented } from '@/components/ui/Segmented'
import { FooterPortal } from '@/components/add/FooterPortal'
import { useAuth } from '@/hooks/useAuth'
import { useLoans } from '@/hooks/useLoans'
import { useSplitGroups } from '@/hooks/useSplitGroups'
import { useToast } from '@/hooks/useToast'
import { toKey } from '@/lib/calendar'
import { formatMXN } from '@/lib/format'
import {
  grupoDirectoPorContacto,
  grupoParaPrestamo,
  nombresDeConexiones,
  nombresDeContactos,
  unirNombres,
} from '@/lib/loanContacts'
import { isMoneyInput, moneyNum } from '@/lib/money'
import type { LoanDirection } from '@/types'

const OTRA = '__otra__'

interface LoanFieldsProps {
  footerTarget: HTMLElement | null
  onDone: () => void
}

/**
 * Registrar un préstamo desde «Agregar».
 *
 * Usa el MISMO criterio que la pantalla de Préstamos para decidir a qué conexión
 * pertenece (`lib/loanContacts`): si ya existe una 1:1 sin conectar con esa
 * persona, el préstamo se estampa ahí. Sin eso quedaría despegado de la relación
 * y sus saldos no cuadrarían.
 *
 * Estos hooks pesan — cargan préstamos y conexiones — así que sólo se montan
 * cuando se elige esta pestaña, no con cada apertura de la hoja.
 */
export function LoanFields({ footerTarget, onDone }: LoanFieldsProps) {
  const { user } = useAuth()
  const toast = useToast()
  const loans = useLoans()
  const { groups } = useSplitGroups({ loans: loans.data, paymentsByLoan: loans.paymentsByLoan })

  const [direccion, setDireccion] = useState<LoanDirection>('owed_to_me')
  const [persona, setPersona] = useState('')
  const [otroNombre, setOtroNombre] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => toKey(new Date()))
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const nombres = useMemo(
    () => unirNombres(nombresDeContactos(loans.data), nombresDeConexiones(groups, user?.id)),
    [loans.data, groups, user?.id],
  )
  const gruposDirectos = useMemo(() => grupoDirectoPorContacto(groups, user?.id), [groups, user?.id])

  // Sin contactos todavía, un campo de texto directo: un select vacío sólo con
  // «Otra persona…» es un paso de más.
  const sinLista = nombres.length === 0
  const escribiendo = sinLista || persona === OTRA
  const nombre = (escribiendo ? otroNombre : persona).trim()

  const monto = moneyNum(amount)
  const hoy = toKey(new Date())

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault()
    if (enviando) return
    if (!nombre) return setError('Elige o escribe a quién')
    if (!isMoneyInput(amount) || monto <= 0) return setError('Escribe un monto válido, por ejemplo 500')
    if (!date) return setError('Elige la fecha')
    if (date > hoy) return setError('La fecha no puede ser futura')
    setError('')
    setEnviando(true)
    try {
      await loans.create({
        name: nombre,
        amount: monto,
        direction: direccion,
        notes: note.trim() || null,
        group_id: grupoParaPrestamo(nombre, gruposDirectos),
        // Hoy no se envía: es el valor por omisión, y así un préstamo de hoy se
        // registra igual aunque la migración 034 no se haya corrido.
        ...(date !== hoy ? { loan_date: date } : {}),
      })
      toast.success('Préstamo registrado', `${nombre} · ${formatMXN(monto)}`)
      onDone()
    } catch (e) {
      setError(e instanceof Error && /migración/.test(e.message) ? e.message : 'No se pudo guardar el préstamo')
      setEnviando(false)
    }
  }

  return (
    <form id="add-form" onSubmit={guardar} className="flex flex-col gap-3" noValidate>
      <Segmented
        ariaLabel="Tipo de préstamo"
        value={direccion}
        onChange={setDireccion}
        options={[
          { value: 'owed_to_me', label: 'Me deben' },
          { value: 'i_owe', label: 'Yo debo', tone: 'debt' },
        ]}
      />

      {!sinLista && (
        <Select
          label={direccion === 'owed_to_me' ? '¿Quién te debe?' : '¿A quién le debes?'}
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
        >
          <option value="">Selecciona…</option>
          {nombres.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
          <option value={OTRA}>Otra persona…</option>
        </Select>
      )}
      {escribiendo && (
        <Input
          label={sinLista ? (direccion === 'owed_to_me' ? '¿Quién te debe?' : '¿A quién le debes?') : 'Nombre'}
          placeholder="Nombre"
          autoComplete="off"
          value={otroNombre}
          onChange={(e) => setOtroNombre(e.target.value)}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Monto"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          autoFocus={sinLista}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Input
          label="Fecha"
          type="date"
          max={hoy}
          value={date}
          className="w-full min-w-0"
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <Input
        label="Concepto (opcional)"
        placeholder="Para el celular, comida de ayer…"
        autoComplete="off"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <FooterPortal target={footerTarget}>
        <div className="flex flex-col gap-2">
          {error && <p className="text-xs font-semibold text-debt-ink">• {error}</p>}
          <Button type="submit" form="add-form" loading={enviando}>
            {isMoneyInput(amount) && monto > 0 ? `Registrar préstamo · ${formatMXN(monto)}` : 'Registrar préstamo'}
          </Button>
        </div>
      </FooterPortal>
    </form>
  )
}
