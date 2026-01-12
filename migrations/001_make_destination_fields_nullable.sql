-- Migration: Make destination fields nullable in trip_requests table
-- Date: 2024-01-15
-- Description: Allows trip requests to be created without a destination,
--              enabling "pickup only" or "drive around" type trips.

-- Make destination fields nullable
ALTER TABLE public.trip_requests
  ALTER COLUMN destination_latitude DROP NOT NULL,
  ALTER COLUMN destination_longitude DROP NOT NULL,
  ALTER COLUMN destination_address DROP NOT NULL;

-- Add comment to document the change
COMMENT ON COLUMN public.trip_requests.destination_latitude IS 'Latitude of destination location. Optional - if provided, destination_longitude and destination_address must also be provided.';
COMMENT ON COLUMN public.trip_requests.destination_longitude IS 'Longitude of destination location. Optional - if provided, destination_latitude and destination_address must also be provided.';
COMMENT ON COLUMN public.trip_requests.destination_address IS 'Human-readable destination address. Optional - if provided, destination_latitude and destination_longitude must also be provided.';

