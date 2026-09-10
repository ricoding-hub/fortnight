/**
 * Feature gates.
 *
 * Bank linking is built end to end (Syncfy widget, credentials, background
 * sync) but the production infrastructure isn't in place yet. Rather than
 * delete the work or ship a path that fails on the user, the entry points are
 * locked and presented as what they are: something on the way.
 *
 * Flipping this one flag re-enables every surface at once — the widget, the
 * "Vincular banco" option, the connected-banks screen and the background sync.
 */
export const BANK_LINKING_ENABLED = false
