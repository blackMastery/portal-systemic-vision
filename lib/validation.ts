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
 * FCM direct-send notification request (device token + payload)
 */
export const notificationSchema = z.object({
  fcm_token: z.string().min(1, 'fcm_token is required'),
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

export type FcmNotificationRequest = z.infer<typeof notificationSchema>

/**
 * Broadcast push to all users of a role (drivers or riders with FCM tokens)
 */
export const broadcastNotificationSchema = z.object({
  audience: z.enum(['driver', 'rider'], {
    required_error: 'audience is required',
    invalid_type_error: 'audience must be "driver" or "rider"',
  }),
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

export type BroadcastNotificationRequest = z.infer<
  typeof broadcastNotificationSchema
>

/**
 * Targeted push to a specific list of driver user IDs (admin-only).
 */
export const targetedDriverNotificationSchema = z.object({
  user_ids: z
    .array(z.string().uuid('user_ids must contain valid UUIDs'))
    .min(1, 'At least one user_id is required')
    .max(5000, 'user_ids cannot exceed 5000 entries'),
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

export type TargetedDriverNotificationRequest = z.infer<
  typeof targetedDriverNotificationSchema
>

/**
 * Targeted push to a specific list of rider user IDs (admin-only).
 */
export const targetedRiderNotificationSchema = z.object({
  user_ids: z
    .array(z.string().uuid('user_ids must contain valid UUIDs'))
    .min(1, 'At least one user_id is required')
    .max(5000, 'user_ids cannot exceed 5000 entries'),
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

export type TargetedRiderNotificationRequest = z.infer<
  typeof targetedRiderNotificationSchema
>

/**
 * Update trip status schema
 */
export const updateTripStatusSchema = z.object({
  status: z.enum(['picked_up', 'completed', 'cancelled', 'arrived']),
  actual_distance_km: z.number().positive().optional(),
  actual_fare: z.number().nonnegative().optional(),
  cancellation_reason: z.string().max(500).optional(),
})

export type UpdateTripStatusRequest = z.infer<typeof updateTripStatusSchema>

/**
 * Driver-submitted rating of a rider after a completed trip.
 */
export const rateRiderSchema = z.object({
  rating: z
    .number({ required_error: 'rating is required', invalid_type_error: 'rating must be a number' })
    .int('rating must be an integer')
    .min(1, 'rating must be between 1 and 5')
    .max(5, 'rating must be between 1 and 5'),
  feedback: z
    .string()
    .max(1000, 'feedback must be less than 1000 characters')
    .optional(),
})

export type RateRiderRequest = z.infer<typeof rateRiderSchema>

/**
 * Query param for /api/agreements/current and /api/agreements/status
 */
export const agreementAudienceParamSchema = z.enum(['driver', 'rider'], {
  required_error: 'audience is required',
  invalid_type_error: 'audience must be "driver" or "rider"',
})

/**
 * Mobile client records acceptance (checkbox + I Agree on client)
 */
export const agreementAcceptBodySchema = z.object({
  agreement_version_id: z.string().uuid('agreement_version_id must be a valid UUID'),
  acknowledged: z.literal(true),
  device: z
    .object({
      model: z.string().optional(),
      os: z.string().optional(),
      os_version: z.string().optional(),
    })
    .strict()
    .optional(),
})

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
