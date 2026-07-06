import type { SplitActivity } from '@/types'

export interface ActivityLine {
  /** Main feed sentence, e.g. «Ale añadió "Leña"». */
  text: string
  /** Your personal impact, e.g. «Debías $17.50» — null when not applicable. */
  impact: string | null
  /** Render the line struck-through (deleted expenses). */
  struck: boolean
}

interface MetaShare {
  member_id: string
  amount: number
}

function fmt(n: number): string {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Human line for an activity row, from the current user's perspective.
 * `myShare` is the user's live share of the referenced expense (adds/edits);
 * deleted expenses read their share snapshot from `meta.shares`.
 */
export function activityLabel(
  a: SplitActivity,
  myMemberId: string | null,
  myShare?: number | null,
): ActivityLine {
  const subject = a.subject ?? ''
  switch (a.verb) {
    case 'group_created':
      return { text: `${a.actor_name} creó el grupo "${subject}"`, impact: null, struck: false }
    case 'group_renamed':
      return { text: `${a.actor_name} renombró el grupo a "${subject}"`, impact: null, struck: false }
    case 'member_added':
      return { text: `${a.actor_name} agregó a ${subject}`, impact: null, struck: false }
    case 'member_linked':
      return { text: `${a.actor_name} se unió al grupo`, impact: null, struck: false }
    case 'member_left':
      return { text: `${subject} salió del grupo`, impact: null, struck: false }
    case 'invite_sent':
      return { text: `${a.actor_name} invitó a ${subject}`, impact: null, struck: false }
    case 'settlement_added':
      return {
        text: `${a.actor_name} registró un pago: ${subject}`,
        impact: a.amount != null ? fmt(Number(a.amount)) : null,
        struck: false,
      }
    case 'expense_added':
    case 'expense_edited': {
      const verb = a.verb === 'expense_added' ? 'añadió' : 'editó'
      return {
        text: `${a.actor_name} ${verb} "${subject}"`,
        impact: myShare != null && myShare > 0 ? `Debes ${fmt(myShare)}` : null,
        struck: false,
      }
    }
    case 'expense_deleted': {
      const shares = (a.meta?.shares ?? []) as MetaShare[]
      const mine = myMemberId ? shares.find((s) => s.member_id === myMemberId) : undefined
      return {
        text: `${a.actor_name} eliminó "${subject}"`,
        impact: mine && Number(mine.amount) > 0 ? `Debías ${fmt(Number(mine.amount))}` : null,
        struck: true,
      }
    }
    case 'loan_added': {
      const direction = a.meta?.direction
      const verb = direction === 'i_owe' ? 'registró una deuda con' : 'registró un préstamo a'
      return {
        text: `${a.actor_name} ${verb} ${subject}`,
        impact: a.amount != null ? fmt(Number(a.amount)) : null,
        struck: false,
      }
    }
    case 'loan_payment': {
      const removed = a.meta?.removed === true
      return {
        text: removed
          ? `${a.actor_name} eliminó un abono del préstamo de ${subject}`
          : `${a.actor_name} abonó al préstamo de ${subject}`,
        impact: a.amount != null ? fmt(Number(a.amount)) : null,
        struck: removed,
      }
    }
    case 'loan_settled':
      return {
        text: `${a.actor_name} saldó el préstamo de ${subject}`,
        impact: a.amount != null ? fmt(Number(a.amount)) : null,
        struck: false,
      }
    case 'loan_reopened':
      return { text: `${a.actor_name} reabrió el préstamo de ${subject}`, impact: null, struck: false }
    case 'loan_edited':
      return {
        text: `${a.actor_name} editó el préstamo de ${subject}`,
        impact: a.amount != null ? fmt(Number(a.amount)) : null,
        struck: false,
      }
    case 'loan_deleted':
      return {
        text: `${a.actor_name} eliminó el préstamo de ${subject}`,
        impact: a.amount != null ? fmt(Number(a.amount)) : null,
        struck: true,
      }
    default:
      return { text: `${a.actor_name} · ${subject}`, impact: null, struck: false }
  }
}
