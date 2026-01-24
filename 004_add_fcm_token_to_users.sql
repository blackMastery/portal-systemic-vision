-- ============================================
-- MIGRATION: Add FCM Token to Users Table
-- ============================================
-- Description: Adds fcm_token column to users table for Firebase Cloud Messaging
-- Date: 2026-01-24
-- ============================================

-- Add fcm_token column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS fcm_token TEXT;

-- Create index on fcm_token for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_fcm_token 
ON users(fcm_token) 
WHERE fcm_token IS NOT NULL;

-- Add comment to column
COMMENT ON COLUMN users.fcm_token IS 'Firebase Cloud Messaging token for push notifications';
