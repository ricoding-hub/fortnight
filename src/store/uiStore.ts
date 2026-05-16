import { create } from 'zustand'

export type AddDirection = 'spend' | 'receive'

interface UiState {
  /** The "add transaction" bottom-sheet is open. */
  addModalOpen: boolean
  /** Direction the modal opens with — switched by callers (FAB vs payday CTA). */
  addModalDirection: AddDirection
  openAddModal: (direction?: AddDirection) => void
  closeAddModal: () => void
}

/**
 * App-wide UI state. Today this only manages the global "add transaction"
 * bottom sheet so any view can open it (FAB in BottomNav, payday banner CTA,
 * pago próximo Pagar button, etc.) without each view mounting its own modal.
 */
export const useUiStore = create<UiState>((set) => ({
  addModalOpen: false,
  addModalDirection: 'spend',
  openAddModal: (direction = 'spend') =>
    set({ addModalOpen: true, addModalDirection: direction }),
  closeAddModal: () => set({ addModalOpen: false }),
}))
