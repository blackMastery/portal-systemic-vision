-- Migration: Make destination_address required in trip_requests table
-- Date: 2024-01-15
-- Description: Makes destination_address a required field while keeping
--              destination coordinates optional. This allows trip requests
--              to have a destination description without precise coordinates.

-- Make destination_address required (NOT NULL)
ALTER TABLE public.trip_requests
  ALTER COLUMN destination_address SET NOT NULL;

-- Update comment to reflect that address is required but coordinates are optional
COMMENT ON COLUMN public.trip_requests.destination_address IS 'Human-readable destination address. Required - provides destination description even if coordinates are not available.';
COMMENT ON COLUMN public.trip_requests.destination_latitude IS 'Latitude of destination location. Optional - if provided, destination_longitude must also be provided.';
COMMENT ON COLUMN public.trip_requests.destination_longitude IS 'Longitude of destination location. Optional - if provided, destination_latitude must also be provided.';
