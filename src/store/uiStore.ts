import { create } from 'zustand'

import type { AddKind } from '@/components/add/AddSheet'

export type { AddKind }

interface UiState {
  /** The "add transaction" bottom-sheet is open. */
  addModalOpen: boolean
  /**
   * Con qué tipo abre la hoja. `null` = el que se usó la última vez. Lo fijan
   * quienes saben qué quieren agregar (el CTA de cobro abre en «Ingreso»).
   */
  addModalKind: AddKind | null
  openAddModal: (kind?: AddKind) => void
  closeAddModal: () => void
  /** Pulse signal: FAB on the loans tab sets this; MisPrestamos opens its form then resets it. */
  loanModalOpen: boolean
  openLoanModal: () => void
  closeLoanModal: () => void
  /** Pulse signal: FAB on a group detail sets this; PrestamoGrupo opens its expense form then resets it. */
  expenseModalOpen: boolean
  openExpenseModal: () => void
  closeExpenseModal: () => void
  /**
   * Pagar una tarjeta o ver su estado de cuenta. Global (vive en Layout) para
   * que el aviso de Inicio, la tarjeta en Cuentas y el calendario abran lo mismo.
   */
  tarjeta: { accountId: string; vista: 'pagar' | 'estado'; monto?: number } | null
  /** `monto`: ya escrito (p. ej. lo que bajaste el saldo a mano). */
  abrirPago: (accountId: string, monto?: number) => void
  abrirEstado: (accountId: string) => void
  cerrarTarjeta: () => void
  /** Guided tour (driver.js). */
  tourOpen: boolean
  openTour: () => void
  closeTour: () => void
}

/**
 * App-wide UI state. Manages the global "add transaction" bottom sheet
 * and a pulse signal for opening the loan form from the FAB.
 */
export const useUiStore = create<UiState>((set) => ({
  addModalOpen: false,
  addModalKind: null,
  openAddModal: (kind) => set({ addModalOpen: true, addModalKind: kind ?? null }),
  closeAddModal: () => set({ addModalOpen: false }),
  loanModalOpen: false,
  openLoanModal: () => set({ loanModalOpen: true }),
  closeLoanModal: () => set({ loanModalOpen: false }),
  expenseModalOpen: false,
  openExpenseModal: () => set({ expenseModalOpen: true }),
  closeExpenseModal: () => set({ expenseModalOpen: false }),
  tarjeta: null,
  abrirPago: (accountId, monto) => set({ tarjeta: { accountId, vista: 'pagar', monto } }),
  abrirEstado: (accountId) => set({ tarjeta: { accountId, vista: 'estado' } }),
  cerrarTarjeta: () => set({ tarjeta: null }),
  tourOpen: false,
  openTour: () => set({ tourOpen: true }),
  closeTour: () => set({ tourOpen: false }),
}))
