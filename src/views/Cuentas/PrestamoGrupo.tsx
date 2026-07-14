import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  IconArrowLeft,
  IconArrowsExchange,
  IconCheck,
  IconChevronRight,
  IconHistory,
  IconLogout,
  IconPencil,
  IconPlus,
  IconReceipt,
  IconTrash,
  IconUserPlus,
  IconUsers,
  IconCamera,
  IconLink,
} from '@tabler/icons-react'
import clsx from 'clsx'

import { useAuth } from '@/hooks/useAuth'
import { useLoans, loanRemaining } from '@/hooks/useLoans'
import { useSplitGroups, memberIsMe, type NewSettlement } from '@/hooks/useSplitGroups'
import { useToast } from '@/hooks/useToast'
import { useUiStore } from '@/store/uiStore'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonRow } from '@/components/ui/Skeleton'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { ExpenseFormModal } from '@/components/split/ExpenseFormModal'
import { SettleModal } from '@/components/split/SettleModal'
import { AddMemberModal } from '@/components/split/AddMemberModal'
import { AbonoModal, MarkPaidModal } from '@/components/split/LoanActionModals'
import { SettleAllModal } from '@/components/split/SettleAllModal'
import { ImageCropModal } from '@/components/ui/ImageCropModal'
import { ImageViewerModal } from '@/components/ui/ImageViewerModal'
import { activityLabel } from '@/lib/splitActivity'
import { nameColorClass } from '@/lib/avatarColors'
import { formatMXN, formatDateGroupMX } from '@/lib/format'
import type { Loan, SplitExpense, SplitMember, SplitSettlement } from '@/types'

export function PrestamoGrupo() {
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const loans = useLoans()
  const {
    groups,
    profiles,
    recentContacts,
    loading,
    ready,
    multiUserReady,
    displayName,
    addMember,
    updateGroup,
    addExpense,
    updateExpense,
    deleteExpense,
    addSettlement,
    deleteSettlement,
    deleteGroup,
    leaveGroup,
    settleAllWithContact,
    syncLoansIntoGroup,
    uploadGroupImage,
  } = useSplitGroups({ loans: loans.data, paymentsByLoan: loans.paymentsByLoan })

  const storeExpenseOpen = useUiStore((s) => s.expenseModalOpen)
  const closeExpenseModal = useUiStore((s) => s.closeExpenseModal)

  const [expenseFormOpen, setExpenseFormOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<SplitExpense | null>(null)
  const [settleEdge, setSettleEdge] = useState<{ from: SplitMember; to: SplitMember; amount: number } | null>(null)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deletingExpense, setDeletingExpense] = useState<SplitExpense | null>(null)
  const [deletingSettlement, setDeletingSettlement] = useState<SplitSettlement | null>(null)
  const [abonoLoan, setAbonoLoan] = useState<Loan | null>(null)
  const [markPaidLoan, setMarkPaidLoan] = useState<Loan | null>(null)
  const [settleAllOpen, setSettleAllOpen] = useState(false)
  const [uploadingGroupImage, setUploadingGroupImage] = useState(false)
  const groupImageRef = useRef<HTMLInputElement>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [viewer, setViewer] = useState<{ src: string; alt: string; onChange?: () => void } | null>(null)
  const [deletingGroup, setDeletingGroup] = useState(false)
  const [leavingGroup, setLeavingGroup] = useState(false)
  const [showAllActivity, setShowAllActivity] = useState(false)

  const g = useMemo(() => groups.find((x) => x.group.id === groupId), [groups, groupId])

  useEffect(() => {
    if (storeExpenseOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpenseFormOpen(true)
      closeExpenseModal()
    }
  }, [storeExpenseOpen, closeExpenseModal])

  const membersById = useMemo(() => {
    const map = new Map<string, SplitMember>()
    for (const m of g?.members ?? []) map.set(m.id, m)
    return map
  }, [g])

  const totalGastado = useMemo(
    () => (g?.expenses ?? []).reduce((s, e) => s + Number(e.amount), 0),
    [g],
  )
  const me = g?.members.find((m) => memberIsMe(m, user?.id))
  const myNet = me ? (g?.nets.get(me.id) ?? 0) : 0

  // Connected 1:1 groups exclude private loans from the shared math — any
  // still-open loans of mine with the contact must be SYNCED (converted to
  // shared expenses) so both users see the same balance.
  const unsyncedLoans = useMemo(() => {
    if (!g || !g.isConnected || g.activeMembers.length !== 2 || !user) return []
    const contact = g.activeMembers.find((m) => !memberIsMe(m, user.id))
    if (!contact) return []
    const key = contact.name.trim().toLowerCase()
    return loans.data.filter(
      (l) =>
        !l.paid_at &&
        (l.group_id === g.group.id ||
          (l.group_id == null && l.name.trim().toLowerCase() === key)),
    )
  }, [g, user, loans.data])
  const [syncing, setSyncing] = useState(false)

  // File pick → open the square cropper. Upload happens on crop confirm.
  function handleGroupImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setViewer(null)
    setCropSrc(URL.createObjectURL(file))
    if (groupImageRef.current) groupImageRef.current.value = ''
  }

  async function handleGroupCropped(blob: Blob) {
    if (!groupId) return
    setUploadingGroupImage(true)
    try {
      await uploadGroupImage(groupId, blob)
      if (cropSrc) URL.revokeObjectURL(cropSrc)
      setCropSrc(null)
      toast.success('Foto del grupo actualizada', 'Todos los miembros la verán')
    } catch (err) {
      toast.error('Error al subir foto', err instanceof Error ? err.message : 'Inténtalo de nuevo.')
    } finally {
      setUploadingGroupImage(false)
    }
  }

  async function handleSyncLoans() {
    if (!groupId) return
    setSyncing(true)
    try {
      const n = await syncLoansIntoGroup(groupId)
      await loans.refetch()
      toast.success(
        'Préstamos sincronizados',
        `${n} préstamo${n === 1 ? '' : 's'} ahora ${n === 1 ? 'es un gasto compartido' : 'son gastos compartidos'} de la conexión`,
      )
    } catch {
      toast.error('Error', 'No se pudieron sincronizar los préstamos')
    } finally {
      setSyncing(false)
    }
  }

  // Recent contacts not already in this group (for the add-member modal).
  const addableContacts = useMemo(() => {
    if (!g) return []
    const inGroup = new Set(
      g.members.map((m) => m.member_user_id ?? `local:${m.name.trim().toLowerCase()}`),
    )
    return recentContacts.filter(
      (c) => !inGroup.has(c.memberUserId ?? `local:${c.name.trim().toLowerCase()}`),
    )
  }, [g, recentContacts])

  const inviteLink = g?.group.invite_code
    ? `${window.location.origin}/join/${g.group.invite_code}`
    : undefined

  /** Members for the expense form, with linked profile names resolved. */
  const formMembers = useMemo(
    () => (g?.activeMembers ?? []).map((m) => ({ ...m, name: displayName(m) })),
    [g, displayName],
  )

  if (loading || loans.loading) {
    return (
      <div className="flex flex-col gap-2 px-4 py-3 animate-[fade-in_300ms_ease-out]">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    )
  }

  if (!ready || !g) {
    return (
      <div className="p-4">
        <EmptyState
          icon={IconUsers}
          title="No encontrado"
          description="No existe o fue eliminado."
          action={
            <Button compact onClick={() => void navigate('/cuentas/prestamos')}>
              <IconArrowLeft size={14} /> Volver a préstamos
            </Button>
          }
        />
      </div>
    )
  }

  const hasActivity = g.expenses.length > 0 || g.settlements.length > 0 || g.legacyLoans.length > 0
  const visibleActivity = showAllActivity ? g.activity : g.activity.slice(0, 8)
  // A 2-person relationship is a direct 1:1 connection, not a "group".
  const isDirect = g.activeMembers.length === 2
  // Leaving is a group concept; a 1:1 connection is deleted, never "left"
  // (soft-leaving a 2-person group strands it in a broken half-state).
  const canLeave = multiUserReady && !g.isOwner && !isDirect && Math.abs(myNet) < 0.005
  // The other person in a 1:1 connection (for header avatar + invite wording).
  const contact = isDirect ? g.activeMembers.find((m) => !memberIsMe(m, user?.id)) : undefined
  const contactProfile = contact?.member_user_id ? profiles.get(contact.member_user_id) : undefined
  const contactName = contact ? displayName(contact) : g.group.name
  const noun = isDirect ? 'conexión' : 'grupo'

  function creatorName(userId: string): string | null {
    if (userId === user?.id) return null // don't label your own expenses
    return profiles.get(userId)?.display_name ?? null
  }

  async function handleSettle(s: NewSettlement) {
    if (!groupId) return
    await addSettlement(groupId, s)
    toast.success('Liquidación registrada', `Los balances de la ${noun} fueron actualizados`)
  }

  async function handleDeleteExpense() {
    if (!deletingExpense) return
    try {
      await deleteExpense(deletingExpense.id)
      toast.success('Gasto eliminado', `El gasto fue eliminado de la ${noun}`)
    } catch {
      toast.error('Error', 'No se pudo eliminar el gasto')
    }
    setDeletingExpense(null)
  }

  async function handleDeleteSettlement() {
    if (!deletingSettlement) return
    try {
      await deleteSettlement(deletingSettlement.id)
      toast.success('Liquidación eliminada', `Los balances de la ${noun} fueron restaurados`)
    } catch {
      toast.error('Error', 'No se pudo eliminar la liquidación')
    }
    setDeletingSettlement(null)
  }

  async function handleDeleteGroup() {
    if (!groupId) return
    try {
      await deleteGroup(groupId)
      toast.success(
        isDirect ? 'Conexión eliminada' : 'Grupo eliminado',
        'Los préstamos que se habían sincronizado vuelven a tu lista',
      )
      void navigate('/cuentas/prestamos')
    } catch {
      toast.error('Error', `No se pudo eliminar la ${noun}`)
    }
  }

  async function handleLeaveGroup() {
    if (!groupId) return
    try {
      await leaveGroup(groupId)
      toast.success('Saliste del grupo', 'Ya no verás su actividad')
      void navigate('/cuentas/prestamos')
    } catch {
      toast.error('Error', 'No se pudo salir del grupo')
    }
    // Note: leaving is only offered for 3+ groups (canLeave excludes isDirect).
  }

  return (
    <div className="flex flex-col gap-3 pb-24 animate-[fade-in_300ms_ease-out]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-2">
        <button
          type="button"
          onClick={() => void navigate('/cuentas/prestamos')}
          aria-label="Volver"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-secondary"
        >
          <IconArrowLeft size={18} />
        </button>
        {/* 3+ groups have an editable group photo. */}
        {!isDirect && (
          <>
            <button
              type="button"
              onClick={() =>
                g.group.image_url
                  ? setViewer({
                      src: g.group.image_url,
                      alt: g.group.name,
                      onChange: () => groupImageRef.current?.click(),
                    })
                  : groupImageRef.current?.click()
              }
              aria-label={g.group.image_url ? 'Ver foto del grupo' : 'Agregar foto del grupo'}
              className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-lavender-soft text-lavender-deep transition-transform active:scale-95"
            >
              {g.group.image_url ? (
                <img src={g.group.image_url} alt={g.group.name} className="h-full w-full object-cover" />
              ) : (
                <IconUsers size={20} stroke={2} />
              )}
              <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-white ring-2 ring-bg">
                <IconCamera size={9} stroke={2.5} />
              </span>
              {uploadingGroupImage && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                </span>
              )}
            </button>
            <input
              ref={groupImageRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleGroupImagePick}
            />
          </>
        )}
        {/* A 1:1 connection shows the OTHER person's avatar (never a group photo). */}
        {isDirect && (
          contactProfile?.avatar_url ? (
            <button
              type="button"
              onClick={() => setViewer({ src: contactProfile.avatar_url!, alt: contactName })}
              aria-label={`Ver foto de ${contactName}`}
              className="h-10 w-10 shrink-0 overflow-hidden rounded-xl transition-transform active:scale-95"
            >
              <img src={contactProfile.avatar_url} alt={contactName} className="h-full w-full object-cover" />
            </button>
          ) : (
            <div
              className={clsx(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[15px] font-bold',
                nameColorClass(contactName),
              )}
              aria-hidden
            >
              {(contactName[0] ?? '?').toUpperCase()}
            </div>
          )
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-text">{g.group.name}</p>
          <p className="flex items-center gap-1 text-[11px] text-text-tertiary">
            {isDirect ? (
              <>
                <IconLink size={11} className="shrink-0" />
                {g.isConnected ? 'Conexión directa · conectado' : 'Conexión directa'}
              </>
            ) : (
              `${g.activeMembers.length} personas · ${g.expenses.length} gasto${g.expenses.length === 1 ? '' : 's'}`
            )}
          </p>
        </div>
        {/* Renaming applies to real groups; a 1:1 name comes from the person. */}
        {!isDirect && (
          <button
            type="button"
            onClick={() => setRenameOpen(true)}
            aria-label="Renombrar grupo"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-secondary hover:text-text"
          >
            <IconPencil size={16} />
          </button>
        )}
        {canLeave && (
          <button
            type="button"
            onClick={() => setLeavingGroup(true)}
            aria-label={isDirect ? 'Salir de la conexión' : 'Salir del grupo'}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-secondary hover:text-text"
          >
            <IconLogout size={16} />
          </button>
        )}
        {g.isOwner && (
          <button
            type="button"
            onClick={() => setDeletingGroup(true)}
            aria-label={isDirect ? 'Eliminar conexión' : 'Eliminar grupo'}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-debt/10 hover:text-debt"
          >
            <IconTrash size={16} />
          </button>
        )}
      </div>

      {/* Summary banner */}
      <div className="px-4">
        <div className="flex items-stretch gap-2 rounded-xl bg-primary-soft/25 px-3.5 py-3">
          <div className="flex-1">
            <p className="text-[9.5px] font-bold uppercase tracking-wide text-primary-deep">
              Total gastado
            </p>
            <p className="mt-0.5 font-mono text-[15px] font-extrabold text-primary-deep">
              {formatMXN(totalGastado)}
            </p>
          </div>
          <div className="w-px bg-primary/15" />
          <div className="flex-1 pl-3">
            <p className="text-[9.5px] font-bold uppercase tracking-wide text-primary-deep">
              Tu balance
            </p>
            <p
              className={clsx(
                'mt-0.5 font-mono text-[15px] font-extrabold',
                myNet > 0 ? 'text-asset-deep' : myNet < 0 ? 'text-debt-deep' : 'text-primary-deep',
              )}
            >
              {myNet > 0 ? '+' : ''}{formatMXN(myNet)}
            </p>
          </div>
        </div>
        {g.activeMembers.length === 2 && Math.abs(myNet) > 0.005 && (
          <button
            type="button"
            onClick={() => setSettleAllOpen(true)}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-asset/10 py-2.5 text-[12.5px] font-bold text-asset-deep transition-colors hover:bg-asset/20"
          >
            <IconCheck size={14} stroke={2.5} /> Saldar todo ({formatMXN(Math.abs(myNet))})
          </button>
        )}
        {unsyncedLoans.length > 0 && (
          <button
            type="button"
            disabled={syncing}
            onClick={() => void handleSyncLoans()}
            className="mt-2 flex w-full flex-col items-center gap-0.5 rounded-xl bg-primary-soft/40 px-3 py-2.5 text-center transition-colors hover:bg-primary-soft/60 disabled:opacity-60"
          >
            <span className="text-[12.5px] font-bold text-primary-deep">
              {syncing
                ? 'Sincronizando…'
                : `Sincronizar ${unsyncedLoans.length} préstamo${unsyncedLoans.length === 1 ? '' : 's'} al grupo`}
            </span>
            <span className="text-[10.5px] leading-snug text-text-secondary">
              Se convierten en gastos compartidos para que ambos vean el mismo saldo.
            </span>
          </button>
        )}
      </div>

      {/* Member balances */}
      <div className="flex flex-col gap-2 px-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
          Balances
        </p>
        <Card className="px-4 py-1">
          <ul className="divide-y divide-border">
            {g.activeMembers.map((m) => {
              const net = g.nets.get(m.id) ?? 0
              const isMe = memberIsMe(m, user?.id)
              const linked = m.member_user_id != null
              const profile = linked ? profiles.get(m.member_user_id!) : undefined
              const name = displayName(m)
              return (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  {profile?.avatar_url ? (
                    <button
                      type="button"
                      onClick={() => setViewer({ src: profile.avatar_url!, alt: name })}
                      aria-label={`Ver foto de ${name}`}
                      className="h-8 w-8 shrink-0 overflow-hidden rounded-xl transition-transform active:scale-95"
                    >
                      <img
                        src={profile.avatar_url}
                        alt={name}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ) : (
                    <div
                      className={clsx(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold',
                        nameColorClass(name),
                      )}
                    >
                      {(name[0] ?? '?').toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">
                      {name}
                      {isMe && <span className="ml-1 text-[10px] font-bold text-text-tertiary">(tú)</span>}
                    </p>
                    {multiUserReady && !isMe && linked && (
                      <p className="text-[10px] font-bold text-asset-deep">Conectado</p>
                    )}
                  </div>
                  <span
                    className={clsx(
                      'font-mono text-[13px] font-bold tabular-nums',
                      net > 0 ? 'text-asset-deep' : net < 0 ? 'text-debt-deep' : 'text-text-tertiary',
                    )}
                  >
                    {net > 0 ? `+${formatMXN(net)}` : net < 0 ? formatMXN(net) : '—'}
                  </span>
                </li>
              )
            })}
          </ul>
          {/* 3+ groups can add people. A 1:1 connection never grows — it only
              invites THAT one person to connect their account. */}
          {!isDirect ? (
            <button
              type="button"
              onClick={() => setAddMemberOpen(true)}
              className="mb-2 mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
            >
              <IconUserPlus size={14} /> Agregar persona
            </button>
          ) : !g.isConnected && inviteLink ? (
            <button
              type="button"
              onClick={() => setAddMemberOpen(true)}
              className="mb-2 mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary-soft/50 py-2.5 text-[12.5px] font-bold text-primary-deep transition-colors hover:bg-primary-soft"
            >
              <IconLink size={14} /> Invitar a {contactName} a conectarse
            </button>
          ) : null}
        </Card>
      </div>

      {/* Suggested transfers (debt simplification) */}
      {g.suggestions.length > 0 && (
        <div className="flex flex-col gap-2 px-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
            {isDirect ? 'Para saldar' : 'Para saldar el grupo'}
          </p>
          <Card className="px-4 py-1">
            <ul className="divide-y divide-border">
              {g.suggestions.map((s, i) => {
                const from = membersById.get(s.fromMemberId)
                const to = membersById.get(s.toMemberId)
                if (!from || !to) return null
                return (
                  <li key={i} className="flex items-center gap-2.5 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lavender-soft text-lavender-deep">
                      <IconArrowsExchange size={16} stroke={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-text">
                        {displayName(from)} <IconChevronRight size={11} className="inline text-text-tertiary" /> {displayName(to)}
                      </p>
                      <p className="font-mono text-[12px] font-bold text-primary-deep">
                        {formatMXN(s.amount)}
                      </p>
                    </div>
                    <Button
                      compact
                      variant="secondary"
                      onClick={() => setSettleEdge({ from, to, amount: s.amount })}
                    >
                      <IconCheck size={13} /> Liquidar
                    </Button>
                  </li>
                )
              })}
            </ul>
          </Card>
        </div>
      )}

      {/* Expenses */}
      <div className="flex flex-col gap-2 px-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
            {isDirect ? 'Movimientos' : 'Movimientos del grupo'}
          </p>
          <button
            type="button"
            onClick={() => setExpenseFormOpen(true)}
            className="text-[11px] font-bold text-primary transition-colors hover:text-primary-deep"
          >
            + Gasto
          </button>
        </div>

        {!hasActivity ? (
          <EmptyState
            icon={IconReceipt}
            title="Sin gastos aún"
            description={`Registra el primer gasto compartido de esta ${noun}.`}
            action={
              <Button compact onClick={() => setExpenseFormOpen(true)}>
                <IconPlus size={14} /> Agregar gasto
              </Button>
            }
          />
        ) : (
          <Card className="px-4 py-1">
            <ul className="divide-y divide-border">
              {g.expenses.map((e) => {
                const payer = membersById.get(e.paid_by_member_id)
                const creator = creatorName(e.user_id)
                return (
                  <li key={e.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary-deep">
                      <IconReceipt size={15} stroke={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-text">{e.description}</p>
                      <p className="truncate text-[11px] text-text-tertiary">
                        Pagó {payer ? displayName(payer) : '—'} · {formatDateGroupMX(e.expense_date)}
                        {creator && ` · Añadió ${creator}`}
                      </p>
                    </div>
                    <span className="font-mono text-[13px] font-bold tabular-nums text-text">
                      {formatMXN(Number(e.amount))}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setEditingExpense(e); setExpenseFormOpen(true) }}
                      aria-label="Editar gasto"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-secondary hover:text-text"
                    >
                      <IconPencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingExpense(e)}
                      aria-label="Eliminar gasto"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-debt/10 hover:text-debt"
                    >
                      <IconTrash size={14} />
                    </button>
                  </li>
                )
              })}
              {g.settlements.map((s) => {
                const from = membersById.get(s.from_member_id)
                const to = membersById.get(s.to_member_id)
                return (
                  <li key={s.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-asset/10 text-asset-deep">
                      <IconCheck size={15} stroke={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-text">
                        {from ? displayName(from) : '—'} pagó a {to ? displayName(to) : '—'}
                      </p>
                      <p className="text-[11px] text-text-tertiary">
                        Liquidación · {formatDateGroupMX(s.created_at)}
                      </p>
                    </div>
                    <span className="font-mono text-[13px] font-bold tabular-nums text-asset-deep">
                      {formatMXN(Number(s.amount))}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDeletingSettlement(s)}
                      aria-label="Eliminar liquidación"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-debt/10 hover:text-debt"
                    >
                      <IconTrash size={14} />
                    </button>
                  </li>
                )
              })}
              {g.legacyLoans.filter((l) => !l.paid_at).map((l) => {
                const remaining = loanRemaining(l, loans.paymentsByLoan[l.id] ?? [])
                return (
                  <li key={l.id} className="py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lavender-soft text-lavender-deep">
                        <IconArrowsExchange size={15} stroke={2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-text">
                          Préstamo · {l.name}
                        </p>
                        <p className="text-[11px] text-text-tertiary">
                          {l.direction === 'owed_to_me' ? 'Te debe' : 'Le debes'} · {formatDateGroupMX(l.created_at)}
                        </p>
                      </div>
                      <Badge variant={l.direction === 'owed_to_me' ? 'info' : 'danger'}>
                        {formatMXN(remaining)}
                      </Badge>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 pl-11">
                      <button
                        type="button"
                        onClick={() => setAbonoLoan(l)}
                        className="rounded-lg bg-primary/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-primary-deep transition-colors hover:bg-primary/20"
                      >
                        + Abono
                      </button>
                      <button
                        type="button"
                        onClick={() => setMarkPaidLoan(l)}
                        className="flex items-center gap-1 rounded-lg bg-asset/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-asset-deep transition-colors hover:bg-asset/20"
                      >
                        <IconCheck size={12} /> Saldado
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
      </div>

      {/* Activity history (multi-user audit feed) */}
      {multiUserReady && g.activity.length > 0 && (
        <div className="flex flex-col gap-2 px-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
            Historial
          </p>
          <Card className="px-4 py-1">
            <ul className="divide-y divide-border">
              {visibleActivity.map((a) => {
                const expenseId = (a.meta as { expense_id?: string }).expense_id
                const myShare =
                  me && expenseId
                    ? Number(
                        g.sharesByExpense
                          .get(expenseId)
                          ?.find((sh) => sh.member_id === me.id)?.amount ?? 0,
                      )
                    : null
                const line = activityLabel(a, me?.id ?? null, myShare, isDirect)
                return (
                  <li key={a.id} className="flex items-start gap-2.5 py-2.5">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-bg-secondary text-text-tertiary">
                      <IconHistory size={13} stroke={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={clsx(
                          'text-[12.5px] font-medium leading-snug text-text',
                          line.struck && 'line-through opacity-60',
                        )}
                      >
                        {line.text}
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-text-tertiary">
                        {line.impact && (
                          <span className={clsx('mr-1.5 font-bold', line.struck ? 'text-text-tertiary line-through' : 'text-debt-deep')}>
                            {line.impact}
                          </span>
                        )}
                        {formatDistanceToNow(parseISO(a.created_at), { locale: es, addSuffix: true })}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
            {g.activity.length > 8 && !showAllActivity && (
              <button
                type="button"
                onClick={() => setShowAllActivity(true)}
                className="w-full py-2.5 text-center text-[12px] font-bold text-primary transition-colors hover:text-primary-deep"
              >
                Ver todo el historial ({g.activity.length})
              </button>
            )}
          </Card>
        </div>
      )}

      {/* ── Modals ── */}
      <ExpenseFormModal
        open={expenseFormOpen}
        onClose={() => { setExpenseFormOpen(false); setEditingExpense(null) }}
        members={formMembers}
        editing={
          editingExpense
            ? { expense: editingExpense, shares: g.sharesByExpense.get(editingExpense.id) ?? [] }
            : null
        }
        onSubmit={async (exp) => {
          if (!groupId) return
          if (editingExpense) {
            await updateExpense(editingExpense.id, groupId, exp)
            toast.success('Gasto actualizado', `${exp.description} · ${formatMXN(exp.amount)}`)
          } else {
            await addExpense(groupId, exp)
            toast.success('Gasto registrado', `${exp.description} · ${formatMXN(exp.amount)}`)
          }
        }}
      />

      {settleEdge && (
        <SettleModal
          open
          from={settleEdge.from}
          to={settleEdge.to}
          suggestedAmount={settleEdge.amount}
          onClose={() => setSettleEdge(null)}
          onSubmit={handleSettle}
        />
      )}

      <AddMemberModal
        open={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        groupName={g.group.name}
        inviteLink={inviteLink}
        recentContacts={addableContacts}
        connectName={isDirect ? contactName : undefined}
        onAdd={async (name, memberUserId) => {
          if (!groupId) return
          await addMember(groupId, name, memberUserId)
          toast.success(
            'Persona agregada',
            memberUserId ? `${name} ya puede ver el grupo` : `${name} quedó como miembro local`,
          )
        }}
      />

      <RenameGroupModal
        open={renameOpen}
        currentName={g.group.name}
        onClose={() => setRenameOpen(false)}
        onRename={async (newName) => {
          if (!groupId) return
          await updateGroup(groupId, { name: newName })
          toast.success('Grupo renombrado', newName)
        }}
      />

      {abonoLoan && (
        <AbonoModal
          open
          loan={abonoLoan}
          payments={loans.paymentsByLoan[abonoLoan.id] ?? []}
          onClose={() => setAbonoLoan(null)}
          onSubmit={async (amount, opts) => {
            await loans.addPayment(abonoLoan.id, amount, opts)
            await loans.refetch()
            toast.success('Abono registrado', `Abono de ${formatMXN(amount)} guardado`)
            setAbonoLoan(null)
          }}
        />
      )}

      {markPaidLoan && (
        <MarkPaidModal
          open
          loan={markPaidLoan}
          payments={loans.paymentsByLoan[markPaidLoan.id] ?? []}
          onClose={() => setMarkPaidLoan(null)}
          onSubmit={async (opts) => {
            await loans.markPaid(markPaidLoan.id, opts)
            await loans.refetch()
            toast.success('Préstamo saldado', `El préstamo de ${markPaidLoan.name} está saldado`)
            setMarkPaidLoan(null)
          }}
        />
      )}

      {settleAllOpen && (
        <SettleAllModal
          open
          contactName={g.members.find((m) => !memberIsMe(m, user?.id))?.name ?? g.group.name}
          net={myNet}
          breakdown={[
            ...g.legacyLoans
              .filter((l) => !l.paid_at)
              .map((l) => ({
                label: `Préstamo · ${l.direction === 'owed_to_me' ? 'te debe' : 'debes'}`,
                amount: loanRemaining(l, loans.paymentsByLoan[l.id] ?? []),
              }))
              .filter((line) => line.amount > 0),
            ...(Math.abs(g.mySplitNet) > 0.005
              ? [{ label: 'Gastos compartidos (neto)', amount: Math.abs(g.mySplitNet) }]
              : []),
          ]}
          onClose={() => setSettleAllOpen(false)}
          onConfirm={async (opts) => {
            if (!groupId) return
            await settleAllWithContact(groupId, opts)
            await loans.refetch()
            toast.success('Todo saldado', `Cuentas en cero · ${formatMXN(Math.abs(myNet))}`)
          }}
        />
      )}

      <ConfirmModal
        open={!!deletingExpense}
        title="Eliminar gasto"
        message={`¿Eliminar "${deletingExpense?.description ?? ''}"? Si lo registraste en una cuenta, el movimiento en la cuenta no se revierte automáticamente.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => void handleDeleteExpense()}
        onClose={() => setDeletingExpense(null)}
      />

      <ConfirmModal
        open={!!deletingSettlement}
        title="Eliminar liquidación"
        message={`Se restaurarán los balances de la ${noun}. Abonos a préstamos y movimientos de cuenta creados junto con esta liquidación NO se revierten automáticamente.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => void handleDeleteSettlement()}
        onClose={() => setDeletingSettlement(null)}
      />

      <ConfirmModal
        open={deletingGroup}
        title={isDirect ? 'Eliminar conexión' : 'Eliminar grupo'}
        message={
          isDirect
            ? 'Se eliminarán los gastos compartidos de esta conexión. Los préstamos que se habían sincronizado vuelven a tu lista de préstamos. Esta acción no se puede deshacer.'
            : 'Se eliminarán los gastos y liquidaciones del grupo para todos los miembros. Los préstamos que se habían sincronizado vuelven a tu lista de préstamos. Esta acción no se puede deshacer.'
        }
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => void handleDeleteGroup()}
        onClose={() => setDeletingGroup(false)}
      />

      <ConfirmModal
        open={leavingGroup}
        title="Salir del grupo"
        message="Dejarás de ver la actividad del grupo. Tu historial de gastos se conserva para los demás miembros."
        confirmLabel="Salir"
        onConfirm={() => void handleLeaveGroup()}
        onClose={() => setLeavingGroup(false)}
      />

      <ImageCropModal
        open={cropSrc != null}
        imageSrc={cropSrc}
        title="Recortar foto del grupo"
        onCancel={() => {
          if (cropSrc) URL.revokeObjectURL(cropSrc)
          setCropSrc(null)
        }}
        onCropped={handleGroupCropped}
      />

      <ImageViewerModal
        open={viewer != null}
        src={viewer?.src ?? null}
        alt={viewer?.alt}
        onChange={viewer?.onChange}
        onClose={() => setViewer(null)}
      />
    </div>
  )
}

/* ── RenameGroupModal — small inline modal, not a screen ── */

function RenameGroupModal({
  open,
  currentName,
  onClose,
  onRename,
}: {
  open: boolean
  currentName: string
  onClose: () => void
  onRename: (name: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(currentName)
      setFormError('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setFormError('Escribe un nombre')
      return
    }
    setSubmitting(true)
    try {
      await onRename(name.trim())
      onClose()
    } catch {
      setFormError('No se pudo renombrar el grupo')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Renombrar grupo">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          label="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        {formError && <p className="text-xs text-debt">• {formError}</p>}
        <Button type="submit" loading={submitting} className="mt-1">
          Guardar
        </Button>
      </form>
    </Modal>
  )
}
