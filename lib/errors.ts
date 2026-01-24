/**
 * Standardized error handling utilities for API routes
 */

export interface ApiErrorResponse {
  error: string
  code?: string
  statusCode: number
}

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public isOperational: boolean = true
  ) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code?: string) {
    super(message, 400, code || 'VALIDATION_ERROR', true)
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Unauthorized', code?: string) {
    super(message, 401, code || 'AUTHENTICATION_ERROR', true)
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Forbidden', code?: string) {
    super(message, 403, code || 'AUTHORIZATION_ERROR', true)
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', code?: string) {
    super(message, 404, code || 'NOT_FOUND', true)
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code?: string) {
    super(message, 409, code || 'CONFLICT', true)
  }
}

/**
 * Sanitizes error messages for production
 * Removes internal details that shouldn't be exposed to clients
 */
export function sanitizeErrorMessage(error: unknown, isDevelopment: boolean = false): string {
  if (error instanceof AppError) {
    return error.message
  }

  if (error instanceof Error) {
    // In development, show full error details
    if (isDevelopment) {
      return error.message
    }
    
    // In production, return generic messages for unknown errors
    // Check for common error patterns
    if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      return 'Network error. Please check your connection.'
    }
    
    if (error.message.includes('timeout')) {
      return 'Request timeout. Please try again.'
    }
    
    // Generic error message for production
    return 'An unexpected error occurred. Please try again later.'
  }

  return 'An unexpected error occurred. Please try again later.'
}

/**
 * Creates a standardized error response
 */
export function createErrorResponse(
  error: unknown,
  isDevelopment: boolean = false
): { response: ApiErrorResponse; statusCode: number } {
  const isDev = isDevelopment || process.env.NODE_ENV === 'development'

  if (error instanceof AppError) {
    return {
      response: {
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      },
      statusCode: error.statusCode,
    }
  }

  // Handle Supabase errors
  if (error && typeof error === 'object' && 'message' in error) {
    const supabaseError = error as { message: string; code?: string }
    
    // Map common Supabase error codes
    if (supabaseError.code === 'PGRST116') {
      return {
        response: {
          error: 'Resource not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
        statusCode: 404,
      }
    }

    if (supabaseError.code === '23505') {
      return {
        response: {
          error: 'A record with this information already exists',
          code: 'DUPLICATE_ENTRY',
          statusCode: 409,
        },
        statusCode: 409,
      }
    }
  }

  // Generic error
  const message = sanitizeErrorMessage(error, isDev)
  return {
    response: {
      error: message,
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    },
    statusCode: 500,
  }
}

/**
 * Handles errors in API routes and returns standardized responses
 */
export function handleApiError(error: unknown): { response: ApiErrorResponse; statusCode: number } {
  const isDevelopment = process.env.NODE_ENV === 'development'
  
  // Log error for debugging (in production, this should go to a logging service)
  if (!isDevelopment) {
    console.error('API Error:', error)
  } else {
    console.error('API Error (dev):', error)
  }

  return createErrorResponse(error, isDevelopment)
}
