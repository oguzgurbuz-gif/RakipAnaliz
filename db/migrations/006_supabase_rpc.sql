-- Migration 006: Supabase compatibility layer
-- Adds RPC functions that replace raw pg library calls used by the scraper.

-- ============================================================================
-- Raw SQL execution function
-- Uses RETURN QUERY EXECUTE to return rows directly.
-- Returns SETOF JSONB — PostgREST aggregates into a JSONB array.
-- Non-SELECT: returns a single {"ok": true} row.
-- ============================================================================
DROP FUNCTION IF EXISTS exec(TEXT, JSONB);

CREATE OR REPLACE FUNCTION exec(sql TEXT, params JSONB DEFAULT NULL)
RETURNS SETOF JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $$
BEGIN
  IF params IS NULL THEN
    RETURN QUERY EXECUTE sql;
  ELSE
    RETURN QUERY EXECUTE sql USING params;
  END IF;
  RETURN;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT jsonb_build_object('error', SQLERRM, 'sql', left(sql, 200))::jsonb;
  RETURN;
END;
$$;

-- ============================================================================
-- Atomic counter helpers
-- ============================================================================
DROP FUNCTION IF EXISTS increment_version_count(UUID);

CREATE OR REPLACE FUNCTION increment_version_count(campaign_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE campaigns
  SET content_version = content_version + 1, updated_at = NOW()
  WHERE id = campaign_id;
END;
$$;

DROP FUNCTION IF EXISTS increment_job_attempts(BIGINT);

CREATE OR REPLACE FUNCTION increment_job_attempts(job_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE jobs
  SET attempts = attempts + 1
  WHERE id = job_id;
END;
$$;

-- ============================================================================
-- Campaign status recalculation
-- ============================================================================
DROP FUNCTION IF EXISTS recalculate_campaign_status(UUID);

CREATE OR REPLACE FUNCTION recalculate_campaign_status(campaign_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_record RECORD;
BEGIN
  SELECT cv.valid_from, cv.valid_to, NOW() AS now_ts
  INTO v_record
  FROM campaign_versions cv
  WHERE cv.campaign_id = recalculate_campaign_status.campaign_id
  ORDER BY cv.version_no DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_record.valid_to IS NOT NULL AND v_record.valid_to < v_record.now_ts THEN
    UPDATE campaigns SET status = 'expired', updated_at = NOW()
    WHERE id = campaign_id;
  ELSIF v_record.valid_from IS NOT NULL AND v_record.valid_from > v_record.now_ts THEN
    UPDATE campaigns SET status = 'pending', updated_at = NOW()
    WHERE id = campaign_id;
  ELSE
    UPDATE campaigns SET status = 'active', updated_at = NOW()
    WHERE id = campaign_id;
  END IF;
END;
$$;
