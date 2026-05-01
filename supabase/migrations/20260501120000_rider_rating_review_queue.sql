-- Rider rating sync trigger + admin rating review queue.
--
-- Adds:
--   1. update_rider_rating_on_trip_rating()  -- mirror of update_driver_rating_on_trip_rating()
--      to keep rider_profiles.rating_average / rating_count in sync with trips.rider_rating.
--   2. rating_review_queue table -- admin moderation queue for low-rated trips and manual flags.
--   3. enqueue_low_rating_review() trigger -- auto-enqueues trips when rider_rating <= 2
--      (transition guard prevents duplicate auto entries on subsequent updates).
--
-- Forward-only: historical low ratings are NOT backfilled. Admins can manually flag
-- specific historical trips from the rider detail page if needed.

------------------------------------------------------------
-- 1. Rider rating sync trigger
------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_rider_rating_on_trip_rating()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_rider_id UUID;
    v_old_rating INTEGER;
    v_new_rating INTEGER;
    v_current_avg DECIMAL(3,2);
    v_current_count INTEGER;
    v_new_avg DECIMAL(3,2);
    v_new_count INTEGER;
BEGIN
    v_rider_id := NEW.rider_id;

    IF v_rider_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_old_rating := COALESCE(OLD.rider_rating, NULL);
    v_new_rating := NEW.rider_rating;

    -- Rating cleared
    IF v_new_rating IS NULL AND v_old_rating IS NOT NULL THEN
        SELECT rating_average, rating_count
        INTO v_current_avg, v_current_count
        FROM rider_profiles
        WHERE id = v_rider_id;

        IF v_current_count <= 1 THEN
            UPDATE rider_profiles
            SET
                rating_average = 5.0,
                rating_count = 0,
                updated_at = NOW()
            WHERE id = v_rider_id;
        ELSE
            v_new_avg := ((v_current_avg * v_current_count) - v_old_rating) / (v_current_count - 1);
            v_new_count := v_current_count - 1;
            v_new_avg := GREATEST(1.0, LEAST(5.0, v_new_avg));

            UPDATE rider_profiles
            SET
                rating_average = v_new_avg,
                rating_count = v_new_count,
                updated_at = NOW()
            WHERE id = v_rider_id;
        END IF;

        RETURN NEW;
    END IF;

    -- Rating set or updated
    IF v_new_rating IS NOT NULL THEN
        IF v_new_rating < 1 OR v_new_rating > 5 THEN
            RAISE EXCEPTION 'Rating must be between 1 and 5';
        END IF;

        SELECT rating_average, rating_count
        INTO v_current_avg, v_current_count
        FROM rider_profiles
        WHERE id = v_rider_id;

        -- First rating
        IF v_current_count IS NULL OR v_current_count = 0 THEN
            UPDATE rider_profiles
            SET
                rating_average = v_new_rating,
                rating_count = 1,
                updated_at = NOW()
            WHERE id = v_rider_id;
        -- Update of an existing rating
        ELSIF v_old_rating IS NOT NULL THEN
            v_new_avg := ((v_current_avg * v_current_count) - v_old_rating + v_new_rating) / v_current_count;
            v_new_avg := GREATEST(1.0, LEAST(5.0, v_new_avg));

            UPDATE rider_profiles
            SET
                rating_average = v_new_avg,
                updated_at = NOW()
            WHERE id = v_rider_id;
        -- New rating added
        ELSE
            v_new_avg := ((v_current_avg * v_current_count) + v_new_rating) / (v_current_count + 1);
            v_new_count := v_current_count + 1;

            UPDATE rider_profiles
            SET
                rating_average = v_new_avg,
                rating_count = v_new_count,
                updated_at = NOW()
            WHERE id = v_rider_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE TRIGGER trigger_update_rider_rating_on_trip_rating
    AFTER INSERT OR UPDATE OF rider_rating ON public.trips
    FOR EACH ROW
    WHEN (new.rider_id IS NOT NULL)
    EXECUTE FUNCTION update_rider_rating_on_trip_rating();

------------------------------------------------------------
-- 2. Rating review queue table
------------------------------------------------------------

CREATE TABLE public.rating_review_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    rider_id uuid NOT NULL REFERENCES public.rider_profiles(id) ON DELETE CASCADE,
    rating integer,
    feedback text,
    flag_source text NOT NULL CHECK (flag_source IN ('auto_low_rating','manual')),
    flagged_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
    resolution_note text,
    resolved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    resolved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- Dedupe: same trip cannot have two auto rows or two manual rows.
    -- Auto + manual on the same trip is allowed and surfaces as two queue items.
    CONSTRAINT rating_review_queue_trip_source_unique UNIQUE (trip_id, flag_source)
);

CREATE INDEX rating_review_queue_status_created_idx
    ON public.rating_review_queue (status, created_at DESC);

CREATE INDEX rating_review_queue_rider_idx
    ON public.rating_review_queue (rider_id);

------------------------------------------------------------
-- 3. Auto-enqueue trigger on trips.rider_rating <= 2
------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enqueue_low_rating_review()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_driver_user_id uuid;
BEGIN
    -- Only fire on transition into the low-rating zone. This prevents a no-op UPDATE
    -- (e.g., touching another column on the row) from re-queuing the same trip.
    IF NEW.rider_rating IS NULL OR NEW.rider_rating > 2 THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.rider_rating IS NOT NULL AND OLD.rider_rating <= 2 THEN
        RETURN NEW;
    END IF;

    -- Resolve the driver's users.id (the user who submitted the rating) for audit.
    IF NEW.driver_id IS NOT NULL THEN
        SELECT user_id INTO v_driver_user_id
        FROM driver_profiles
        WHERE id = NEW.driver_id;
    END IF;

    INSERT INTO rating_review_queue (
        trip_id,
        rider_id,
        rating,
        feedback,
        flag_source,
        flagged_by_user_id
    )
    VALUES (
        NEW.id,
        NEW.rider_id,
        NEW.rider_rating,
        NEW.rider_feedback,
        'auto_low_rating',
        v_driver_user_id
    )
    ON CONFLICT (trip_id, flag_source) DO NOTHING;

    RETURN NEW;
END;
$function$
;

CREATE TRIGGER trigger_enqueue_low_rating_review
    AFTER INSERT OR UPDATE OF rider_rating ON public.trips
    FOR EACH ROW
    WHEN (new.rider_id IS NOT NULL)
    EXECUTE FUNCTION enqueue_low_rating_review();

------------------------------------------------------------
-- 4. RLS — admin-only access. Triggers run as table owner and bypass RLS.
------------------------------------------------------------

ALTER TABLE public.rating_review_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage rating review queue"
    ON public.rating_review_queue
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM users u
            WHERE u.auth_id = auth.uid()
              AND u.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM users u
            WHERE u.auth_id = auth.uid()
              AND u.role = 'admin'
        )
    );
