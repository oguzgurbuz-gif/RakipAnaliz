-- Migration 006: Supabase compatibility layer
-- Adds RPC functions that replace raw pg library calls used by the scraper.

-- ============================================================================
-- Raw SQL execution function (for Supabase which uses PostgREST, not raw TCP)
-- This replaces direct pg Pool.query() calls throughout the app.
-- Usage: SELECT * FROM exec('SELECT ...', '["param1"]'::jsonb);
-- ============================================================================
CREATE OR REPLACE FUNCTION exec(sql TEXT, params JSONB DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  IF params IS NULL THEN
    EXECUTE sql INTO result;
  ELSE
    EXECUTE sql USING params;
  END IF;
  RETURN COALESCE(result, '[]'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'sql', sql);
END;
$$;

-- ============================================================================
-- Atomic counter helpers (replace raw UPDATE ... SET x = x + 1 calls)
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_version_count(campaign_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE campaigns
  SET version_count = version_count + 1, updated_at = NOW()
  WHERE id = campaign_id;
END;
$$;

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
  ORDER BY cv.content_version DESC
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

-- ============================================================================
-- Note: Supabase manages connection pooling automatically.
-- No need for Pool configuration — remove DATABASE_URL approach.
-- Environment variables needed:
--   SUPABASE_URL        = https://your-project.supabase.co
--   SUPABASE_ANON_KEY  = eyJ... (anonymous key, for browser/client)
--   SUPABASE_SERVICE_ROLE_KEY = eyJ... (service role, server-side only)
-- ============================================================================
