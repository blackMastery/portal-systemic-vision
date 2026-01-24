/**
 * Validation schemas using Zod
 */

import { z } from 'zod'
import { ValidationError } from './errors'

/**
 * Email validation schema
 */
export const emailSchema = z.string().email('Invalid email address')

/**
 * Password validation schema
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be less than 128 characters')

/**
 * Login request schema
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  role: z.enum(['admin', 'rider', 'driver']).optional(),
})

export type LoginRequest = z.infer<typeof loginSchema>

/**
 * Trip type enum
 */
export const tripTypeSchema = z.enum(['airport', 'short_drop', 'market', 'other'])

/**
 * Coordinate validation (latitude)
 */
export const latitudeSchema = z
  .number()
  .min(-90, 'Latitude must be between -90 and 90')
  .max(90, 'Latitude must be between -90 and 90')

/**
 * Coordinate validation (longitude)
 */
export const longitudeSchema = z
  .number()
  .min(-180, 'Longitude must be between -180 and 180')
  .max(180, 'Longitude must be between -180 and 180')

/**
 * Trip request schema
 */
export const tripRequestSchema = z.object({
  pickup_latitude: latitudeSchema,
  pickup_longitude: longitudeSchema,
  pickup_address: z
    .string()
    .min(5, 'Pickup address must be at least 5 characters')
    .max(500, 'Pickup address must be less than 500 characters'),
  destination_latitude: latitudeSchema.optional(),
  destination_longitude: longitudeSchema.optional(),
  destination_address: z
    .string()
    .min(5, 'Destination address must be at least 5 characters')
    .max(500, 'Destination address must be less than 500 characters'),
  trip_type: tripTypeSchema,
  estimated_distance_km: z.number().positive().optional(),
  estimated_duration_minutes: z.number().int().positive().optional(),
  estimated_fare: z.number().nonnegative().optional(),
  notes: z.string().max(1000, 'Notes must be less than 1000 characters').optional(),
  passenger_count: z.number().int().positive().min(1).max(10).optional(),
})

export type TripRequest = z.infer<typeof tripRequestSchema>

/**
 * UUID validation schema
 */
const uuidSchema = z.string().uuid('Invalid UUID format')

/**
 * Notification request schema
 */
export const notificationSchema = z.object({
  user_ids: z
    .array(uuidSchema, {
      required_error: 'user_ids is required',
      invalid_type_error: 'user_ids must be an array',
    })
    .min(1, 'At least one user_id is required'),
  title: z
    .string()
    .min(1, 'Title is required')
    .max(100, 'Title must be less than 100 characters'),
  body: z
    .string()
    .min(1, 'Body is required')
    .max(500, 'Body must be less than 500 characters'),
  data: z.record(z.string()).optional(),
  notification_type: z.string().optional(),
})

export type NotificationRequest = z.infer<typeof notificationSchema>

/**
 * Validates data against a Zod schema and throws ValidationError if invalid
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`)
      throw new ValidationError(messages.join(', '), 'VALIDATION_ERROR')
    }
    throw error
  }
}

/**
 * Safely validates data and returns result object instead of throwing
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: ValidationError } {
  try {
    const parsed = schema.parse(data)
    return { success: true, data: parsed }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`)
      return {
        success: false,
        error: new ValidationError(messages.join(', '), 'VALIDATION_ERROR'),
      }
    }
    throw error
  }
}
