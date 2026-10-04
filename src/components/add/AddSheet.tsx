import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { InstallmentFields } from '@/components/add/InstallmentFields'
import { LoanFields } from '@/components/add/LoanFields'
import { MovementFields } from '@/components/add/MovementFields'
import { useInstallments } from '@/hooks/useInstallments'
import type { NewTransaction } from '@/hooks/useTransactions'
import type { Account, Category } from '@/types'

export type AddKind = 'gasto' | 'ingreso' | 'prestamo' | 'meses'

interface AddSheetProps {
  open: boolean
  onClose: () => void
  accounts: Account[]
  categories: Category[]
  onCreate: (tx: NewTransaction) => Promise<void>
  /** Con qué tipo abre. Sin él, Gasto: lo que se anota nueve de cada diez veces. */
  initialKind?: AddKind
}

/**
 * «Agregar»: una sola hoja para lo que se anota a diario.
 *
 * Gasto, ingreso, préstamo y compra a meses, antes repartidos en tres
 * formularios de tres pantallas. Está construida sobre `ui/Modal` — antes era
 * una segunda copia del armazón, con un numpad fijo de ~40 % de la pantalla, y
 * por eso la rejilla de categorías se cortaba a media fila — y el botón vive en
 * su pie fijo: siempre a la vista, con el teclado abierto o sin él.
 *
 * `Modal` desmonta su contenido al cerrarse, así que cada apertura empieza con el
 * formulario limpio sin tener que resetear nada a mano.
 */
export function AddSheet({ open, onClose, accounts, categories, onCreate, initialKind }: AddSheetProps) {
  const [footerEl, setFooterEl] = useState<HTMLElement | null>(null)

  return (
    <Modal open={open} onClose={onClose} title="Agregar" footer={<div ref={setFooterEl} />}>
      <CuerpoDeLaHoja
        accounts={accounts}
        categories={categories}
        onCreate={onCreate}
        initialKind={initialKind}
        footerTarget={footerEl}
        onDone={onClose}
      />
    </Modal>
  )
}

function CuerpoDeLaHoja({
  accounts,
  categories,
  onCreate,
  initialKind,
  footerTarget,
  onDone,
}: Omit<AddSheetProps, 'open' | 'onClose'> & { footerTarget: HTMLElement | null; onDone: () => void }) {
  // Siempre empieza en Gasto salvo que quien abre sepa qué quiere (el CTA de
  // cobro abre en Ingreso). No se recuerda el último tipo a propósito: tras
  // anotar la quincena, el siguiente toque al + abriría en «Ingreso» y sería una
  // sorpresa. Lo que sí se recuerda es la categoría y la cuenta.
  const [kind, setKind] = useState<AddKind>(initialKind ?? 'gasto')

  return (
    <div className="flex flex-col gap-3.5">
      <Segmented
        ariaLabel="Qué vas a agregar"
        ancho="content"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'gasto', label: 'Gasto', tone: 'debt' },
          { value: 'ingreso', label: 'Ingreso', tone: 'asset' },
          { value: 'prestamo', label: 'Préstamo' },
          { value: 'meses', label: 'A meses' },
        ]}
      />

      {/* `key` por tipo: al cambiar de pestaña el formulario nace limpio, y los
          hooks pesados (préstamos, conexiones, planes) sólo existen mientras su
          pestaña está activa. */}
      {kind === 'gasto' || kind === 'ingreso' ? (
        <MovementFields
          key={kind}
          direction={kind === 'gasto' ? 'spend' : 'receive'}
          accounts={accounts}
          categories={categories}
          onCreate={onCreate}
          footerTarget={footerTarget}
          onDone={onDone}
        />
      ) : kind === 'prestamo' ? (
        <LoanFields key="prestamo" footerTarget={footerTarget} onDone={onDone} />
      ) : (
        <ComprasAMeses accounts={accounts} footerTarget={footerTarget} onDone={onDone} />
      )}
    </div>
  )
}

/** Aparte porque `useInstallments` sólo debe montarse con esta pestaña. */
function ComprasAMeses({
  accounts,
  footerTarget,
  onDone,
}: {
  accounts: Account[]
  footerTarget: HTMLElement | null
  onDone: () => void
}) {
  const { create } = useInstallments()
  return (
    <InstallmentFields
      key="meses"
      formId="add-form"
      accounts={accounts}
      footerTarget={footerTarget}
      onSubmit={create}
      onDone={onDone}
    />
  )
}
