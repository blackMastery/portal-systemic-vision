'use client'

import { useEffect, useId, useState } from 'react'
import { ExternalLink, FileText, X } from 'lucide-react'

type Props = {
  open: boolean
  onClose: () => void
  src: string
  title: string
}

/**
 * Full-screen dialog that displays an image at full size.
 * Closes on backdrop click, the close button, or the Escape key.
 */
export function ImageLightbox({ open, onClose, src, title }: Props) {
  const idPrefix = useId()
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    setImgError(false)
  }, [src])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    // Prevent the page behind the dialog from scrolling.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${idPrefix}-title`}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
          <h2
            id={`${idPrefix}-title`}
            className="truncate text-sm font-semibold text-gray-900"
          >
            {title}
          </h2>
          <div className="flex items-center gap-1 shrink-0">
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary-strong hover:bg-primary-soft"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              Open full size
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-auto bg-gray-50 p-4">
          {imgError ? (
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <FileText className="h-5 w-5 text-gray-500 shrink-0" aria-hidden />
              View file
            </a>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={title}
              className="max-h-[80vh] w-auto max-w-full object-contain"
              onError={() => setImgError(true)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
