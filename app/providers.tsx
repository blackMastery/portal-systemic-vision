'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

// Check if we're online
function isOnline(): boolean {
  if (typeof window === 'undefined') return true
  return navigator.onLine
}

// Determine if error is retryable
function isRetryableError(error: unknown): boolean {
  if (!isOnline()) return false
  
  // Don't retry on 4xx errors (client errors)
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status
    if (status >= 400 && status < 500) return false
  }
  
  // Retry on network errors and 5xx errors
  return true
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // Don't retry if offline
              if (!isOnline()) {
                return false
              }
              
              // Don't retry if error is not retryable
              if (!isRetryableError(error)) {
                return false
              }
              
              // Retry up to 3 times with exponential backoff
              if (failureCount < 3) {
                return true
              }
              
              return false
            },
            retryDelay: (attemptIndex) => {
              // Exponential backoff: 1s, 2s, 4s
              return Math.min(1000 * 2 ** attemptIndex, 30000)
            },
          },
          mutations: {
            retry: (failureCount, error) => {
              // Don't retry mutations if offline
              if (!isOnline()) {
                return false
              }
              
              // Don't retry on client errors (4xx)
              if (!isRetryableError(error)) {
                return false
              }
              
              // Retry mutations once
              return failureCount < 1
            },
            retryDelay: 1000,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
