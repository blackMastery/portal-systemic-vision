/**
 * Network error detection and handling utilities
 */

/**
 * Check if the browser is online
 */
export function isOnline(): boolean {
  if (typeof window === 'undefined') return true
  return navigator.onLine
}

/**
 * Check if an error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (!isOnline()) return true
  
  if (error instanceof TypeError) {
    // Network errors typically throw TypeError
    return error.message.includes('fetch') || 
           error.message.includes('network') ||
           error.message.includes('Failed to fetch')
  }
  
  if (error && typeof error === 'object') {
    // Check for common network error indicators
    const errorObj = error as Record<string, unknown>
    if ('code' in errorObj) {
      const code = errorObj.code as string
      return code === 'ECONNREFUSED' || 
             code === 'ENOTFOUND' || 
             code === 'ETIMEDOUT' ||
             code === 'ECONNRESET'
    }
  }
  
  return false
}

/**
 * Get user-friendly error message for network errors
 */
export function getNetworkErrorMessage(error: unknown): string {
  if (!isOnline()) {
    return 'You are currently offline. Please check your internet connection.'
  }
  
  if (isNetworkError(error)) {
    return 'Network error. Please check your connection and try again.'
  }
  
  return 'An error occurred. Please try again.'
}

/**
 * Wait for network to come back online
 */
export function waitForOnline(): Promise<void> {
  return new Promise((resolve) => {
    if (isOnline()) {
      resolve()
      return
    }
    
    const handleOnline = () => {
      window.removeEventListener('online', handleOnline)
      resolve()
    }
    
    window.addEventListener('online', handleOnline)
  })
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number
    initialDelay?: number
    maxDelay?: number
    onRetry?: (attempt: number, error: unknown) => void
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    onRetry,
  } = options

  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Wait for online if offline
      if (!isOnline()) {
        await waitForOnline()
      }
      
      return await fn()
    } catch (error) {
      lastError = error
      
      // Don't retry if it's the last attempt
      if (attempt === maxRetries) {
        break
      }
      
      // Don't retry if it's not a network error
      if (!isNetworkError(error)) {
        break
      }
      
      // Call onRetry callback
      if (onRetry) {
        onRetry(attempt + 1, error)
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}
