'use client'

import { useState, useTransition } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchCurrentAdminUserId } from '@/lib/admin/current-admin'
import { formatGuyana } from '@/lib/guyana-time'
import { NOTE_MAX_LENGTH } from '@/lib/admin/driver-notes'
import type { DriverAdminNoteWithAuthor } from '@/types/database'
import { addDriverNote, updateDriverNote, deleteDriverNote } from './note-actions'

/** Cap the thread so one very chatty profile cannot stall the page. */
const NOTE_LIMIT = 200

async function fetchDriverNotes(driverId: string): Promise<DriverAdminNoteWithAuthor[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('driver_admin_notes')
    .select(`
      *,
      author:admin_id (id, full_name, email)
    `)
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false })
    .limit(NOTE_LIMIT)

  if (error) throw error
  return (data ?? []) as unknown as DriverAdminNoteWithAuthor[]
}

function authorName(note: DriverAdminNoteWithAuthor): string {
  return note.author?.full_name?.trim() || note.author?.email?.trim() || 'Unknown admin'
}

const TEXTAREA_CLASS =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-ring focus:border-ring'

/**
 * Internal admin-to-admin notes on a driver profile. Its own query key rather than part
 * of the driver-detail bundle, so posting a note does not refetch trips and payments.
 */
export function AdminNotesSection({ driverId }: { driverId: string }) {
  const queryClient = useQueryClient()
  const [isPending, startTransition] = useTransition()

  const [noteDraft, setNoteDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const {
    data: notes = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['driver-admin-notes', driverId],
    queryFn: () => fetchDriverNotes(driverId),
    enabled: !!driverId,
  })

  const { data: currentAdminId } = useQuery({
    queryKey: ['current-admin-user-id'],
    queryFn: fetchCurrentAdminUserId,
    staleTime: Infinity,
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['driver-admin-notes', driverId] })
    // Keeps the note-count badge on /admin/drivers honest.
    queryClient.invalidateQueries({ queryKey: ['driver-note-counts'] })
  }

  function handleAdd() {
    setActionError(null)
    startTransition(async () => {
      const result = await addDriverNote(driverId, noteDraft)
      if (!result.success) {
        setActionError(result.error ?? 'Failed to add note.')
        return
      }
      setNoteDraft('')
      refresh()
    })
  }

  function handleSaveEdit(noteId: string) {
    setActionError(null)
    startTransition(async () => {
      const result = await updateDriverNote(noteId, editDraft)
      if (!result.success) {
        setActionError(result.error ?? 'Failed to update note.')
        return
      }
      setEditingId(null)
      setEditDraft('')
      refresh()
    })
  }

  function handleDelete(noteId: string) {
    if (!window.confirm('Delete this note? This cannot be undone.')) return
    setActionError(null)
    startTransition(async () => {
      const result = await deleteDriverNote(noteId)
      if (!result.success) {
        setActionError(result.error ?? 'Failed to delete note.')
        return
      }
      refresh()
    })
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900">Admin Notes</h2>
      <p className="mt-1 text-sm text-gray-500">
        Internal notes for other admins. Drivers never see these.
      </p>

      {/* Add form */}
      <div className="mt-4">
        <label htmlFor="driver-note-draft" className="sr-only">
          Add a note
        </label>
        <textarea
          id="driver-note-draft"
          rows={3}
          maxLength={NOTE_MAX_LENGTH}
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder="Leave a note for other admins…"
          className={TEXTAREA_CLASS}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-400 tabular-nums">
            {noteDraft.trim().length}/{NOTE_MAX_LENGTH}
          </span>
          <button
            type="button"
            onClick={handleAdd}
            disabled={isPending || !noteDraft.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50 disabled:pointer-events-none"
          >
            <MessageSquare className="h-4 w-4" aria-hidden />
            Add note
          </button>
        </div>
        {actionError && <p className="mt-2 text-sm text-red-600">{actionError}</p>}
      </div>

      {/* Thread, newest first */}
      <div className="mt-6">
        {isLoading ? (
          <p className="py-8 text-center text-gray-500">Loading notes…</p>
        ) : error ? (
          <p className="py-8 text-center text-sm text-red-600">
            Could not load notes. {(error as Error).message}
          </p>
        ) : notes.length === 0 ? (
          <p className="py-8 text-center text-gray-500">No admin notes yet</p>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => {
              const isMine = note.admin_id === currentAdminId
              const isEditing = editingId === note.id

              return (
                <div key={note.id} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-gray-900">
                      {authorName(note)}
                    </span>
                    {isMine && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                        You
                      </span>
                    )}
                    <span className="text-sm text-gray-500">
                      {formatGuyana(note.created_at, 'dd MMM yyyy, h:mm a')}
                    </span>
                    {note.edited_at && (
                      <span
                        className="text-xs italic text-gray-400"
                        title={`Edited ${formatGuyana(note.edited_at, 'dd MMM yyyy, h:mm a')}`}
                      >
                        edited
                      </span>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="mt-2">
                      <label htmlFor={`edit-note-${note.id}`} className="sr-only">
                        Edit note
                      </label>
                      <textarea
                        id={`edit-note-${note.id}`}
                        rows={3}
                        maxLength={NOTE_MAX_LENGTH}
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        className={TEXTAREA_CLASS}
                      />
                      <div className="mt-2 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(note.id)}
                          disabled={isPending || !editDraft.trim()}
                          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50 disabled:pointer-events-none"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null)
                            setEditDraft('')
                            setActionError(null)
                          }}
                          className="text-sm font-medium text-gray-600 hover:text-gray-800"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700">
                      {note.note}
                    </p>
                  )}

                  {/* Hiding these is an affordance, not a boundary — the action re-checks. */}
                  {isMine && !isEditing && (
                    <div className="mt-3 flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(note.id)
                          setEditDraft(note.note)
                          setActionError(null)
                        }}
                        className="text-sm font-medium text-primary-strong hover:text-primary-hover"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(note.id)}
                        disabled={isPending}
                        className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )
            })}

            {notes.length === NOTE_LIMIT && (
              <p className="text-center text-xs text-gray-400">
                Showing the {NOTE_LIMIT} most recent notes.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
