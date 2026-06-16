import { create } from 'zustand'

export type AddDirection = 'spend' | 'receive'

interface UiState {
  /** The "add transaction" bottom-sheet is open. */
  addModalOpen: boolean
  /** Direction the modal opens with — switched by callers (FAB vs payday CTA). */
  addModalDirection: AddDirection
  openAddModal: (direction?: AddDirection) => void
  closeAddModal: () => void
  /** Pulse signal: FAB on the loans tab sets this; MisPrestamos opens its form then resets it. */
  loanModalOpen: boolean
  openLoanModal: () => void
  closeLoanModal: () => void
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
  addModalDirection: 'spend',
  openAddModal: (direction = 'spend') =>
    set({ addModalOpen: true, addModalDirection: direction }),
  closeAddModal: () => set({ addModalOpen: false }),
  loanModalOpen: false,
  openLoanModal: () => set({ loanModalOpen: true }),
  closeLoanModal: () => set({ loanModalOpen: false }),
  tourOpen: false,
  openTour: () => set({ tourOpen: true }),
  closeTour: () => set({ tourOpen: false }),
}))
