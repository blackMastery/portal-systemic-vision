/**
 * Shared between the note server actions and the notes UI. Lives outside the
 * `'use server'` module because those may only export async functions.
 *
 * Matches the `driver_admin_notes_note_len` check constraint in the DB.
 */
export const NOTE_MAX_LENGTH = 4000
