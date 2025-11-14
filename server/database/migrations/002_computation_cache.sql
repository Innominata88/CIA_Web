-- Migration 002: Server-Side Computation Cache
-- This migration adds infrastructure for caching expensive computations on the server

-- ==============================================================================
-- BACKGROUND: Why We Need Server-Side Computation
-- ==============================================================================
--
-- Heavy operations (PCA, t-SNE, UMAP, large filters) are too expensive for client devices,
-- especially VR headsets and tablets. The server performs these computations and caches
-- results so that:
-- 1. Multiple users sharing a view get instant results (computed once, served many times)
-- 2. Lightweight clients can work with large datasets
-- 3. Original data remains pristine (nondestructive operations)
--
-- Cache Key Strategy:
-- Cache key = hash(dataset_id + operation_type + parameters)
-- This ensures identical operations return cached results instantly.
--
-- ==============================================================================

-- ==============================================================================
-- STEP 1: Enhance analysis_jobs table for better tracking
-- ==============================================================================

ALTER TABLE analysis_jobs
ADD COLUMN IF NOT EXISTS cache_key VARCHAR(64),
ADD COLUMN IF NOT EXISTS cached_result_id UUID REFERENCES computation_cache(id),
ADD COLUMN IF NOT EXISTS requested_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
ADD COLUMN IF NOT EXISTS execution_time_ms INTEGER,
ADD COLUMN IF NOT EXISTS memory_used_mb INTEGER;

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_cache_key ON analysis_jobs(cache_key);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_priority ON analysis_jobs(priority DESC, created_at ASC);

COMMENT ON COLUMN analysis_jobs.cache_key IS 'SHA-256 hash of dataset+algorithm+parameters for cache lookup';
COMMENT ON COLUMN analysis_jobs.priority IS 'Job priority 1-10, higher = more urgent';

-- ==============================================================================
-- STEP 2: Create computation_cache table for storing results
-- ==============================================================================

CREATE TABLE IF NOT EXISTS computation_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Cache key (deterministic hash)
    cache_key VARCHAR(64) UNIQUE NOT NULL,

    -- What was computed
    dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
    operation_type VARCHAR(50) NOT NULL,  -- 'pca', 'tsne', 'umap', 'filter', 'subsample', etc.
    parameters JSONB NOT NULL,  -- Operation parameters

    -- Result storage
    result_type VARCHAR(20) NOT NULL CHECK (result_type IN ('json', 'binary', 'file')),
    result_data JSONB,  -- For small JSON results (< 1MB)
    result_file_path TEXT,  -- For large binary results
    result_size_bytes BIGINT,

    -- Metadata
    computed_by VARCHAR(255),  -- User or system that triggered computation
    computation_time_ms INTEGER,
    memory_used_mb INTEGER,

    -- Usage tracking
    hit_count INTEGER DEFAULT 0,  -- How many times this cache was used
    last_accessed_at TIMESTAMP,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,  -- NULL = never expires

    -- Validation
    is_valid BOOLEAN DEFAULT true,  -- Can be invalidated without deleting
    invalidated_at TIMESTAMP,
    invalidated_reason TEXT
);

CREATE INDEX idx_computation_cache_key ON computation_cache(cache_key);
CREATE INDEX idx_computation_cache_dataset ON computation_cache(dataset_id);
CREATE INDEX idx_computation_cache_type ON computation_cache(operation_type);
CREATE INDEX idx_computation_cache_valid ON computation_cache(is_valid) WHERE is_valid = true;
CREATE INDEX idx_computation_cache_accessed ON computation_cache(last_accessed_at DESC);

COMMENT ON TABLE computation_cache IS 'Cached results of expensive server-side computations';
COMMENT ON COLUMN computation_cache.cache_key IS 'SHA-256 hash: uniquely identifies this computation';
COMMENT ON COLUMN computation_cache.hit_count IS 'Cache hit counter for analytics and cleanup decisions';

-- ==============================================================================
-- STEP 3: Create computation_dependencies table for cache invalidation
-- ==============================================================================

-- When dataset changes (versioned, modified, etc.), we need to invalidate
-- cached computations that depend on it. This table tracks those dependencies.

CREATE TABLE IF NOT EXISTS computation_dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cache_id UUID REFERENCES computation_cache(id) ON DELETE CASCADE,
    depends_on_dataset UUID REFERENCES datasets(id) ON DELETE CASCADE,
    depends_on_version INTEGER,  -- Specific dataset version (from project_datasets)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(cache_id, depends_on_dataset)
);

CREATE INDEX idx_computation_deps_cache ON computation_dependencies(cache_id);
CREATE INDEX idx_computation_deps_dataset ON computation_dependencies(depends_on_dataset);

COMMENT ON TABLE computation_dependencies IS 'Tracks which cached computations depend on which datasets for invalidation';

-- ==============================================================================
-- STEP 4: Create computation_queue table for job scheduling
-- ==============================================================================

-- Not all computations can complete instantly. This queue manages background jobs.

CREATE TABLE IF NOT EXISTS computation_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Job identification
    cache_key VARCHAR(64) NOT NULL,
    job_type VARCHAR(50) NOT NULL,

    -- Job data
    dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
    parameters JSONB NOT NULL,

    -- Scheduling
    priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),

    -- Execution tracking
    requested_by VARCHAR(255) NOT NULL,
    assigned_to VARCHAR(255),  -- Worker ID that picked up this job
    started_at TIMESTAMP,
    completed_at TIMESTAMP,

    -- Progress tracking
    progress_percent INTEGER DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
    progress_message TEXT,

    -- Error handling
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP  -- Jobs expire if not claimed within timeout
);

CREATE INDEX idx_computation_queue_status ON computation_queue(status);
CREATE INDEX idx_computation_queue_priority ON computation_queue(priority DESC, created_at ASC);
CREATE INDEX idx_computation_queue_cache_key ON computation_queue(cache_key);
CREATE INDEX idx_computation_queue_pending ON computation_queue(status, priority DESC)
    WHERE status = 'pending';

COMMENT ON TABLE computation_queue IS 'Queue of pending/running computation jobs';

-- ==============================================================================
-- STEP 5: Create functions for cache management
-- ==============================================================================

-- Function to record a cache hit
CREATE OR REPLACE FUNCTION record_cache_hit(p_cache_key VARCHAR)
RETURNS VOID AS $$
BEGIN
    UPDATE computation_cache
    SET hit_count = hit_count + 1,
        last_accessed_at = CURRENT_TIMESTAMP
    WHERE cache_key = p_cache_key;
END;
$$ LANGUAGE plpgsql;

-- Function to invalidate cache for a dataset
CREATE OR REPLACE FUNCTION invalidate_dataset_cache(p_dataset_id UUID)
RETURNS INTEGER AS $$
DECLARE
    invalidated_count INTEGER;
BEGIN
    -- Find and invalidate all cached computations for this dataset
    WITH updated AS (
        UPDATE computation_cache
        SET is_valid = false,
            invalidated_at = CURRENT_TIMESTAMP,
            invalidated_reason = 'Dataset modified or versioned'
        WHERE id IN (
            SELECT cd.cache_id
            FROM computation_dependencies cd
            WHERE cd.depends_on_dataset = p_dataset_id
        )
        AND is_valid = true
        RETURNING id
    )
    SELECT COUNT(*) INTO invalidated_count FROM updated;

    RETURN invalidated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old/unused cache entries
CREATE OR REPLACE FUNCTION cleanup_computation_cache(
    p_max_age_days INTEGER DEFAULT 30,
    p_min_hit_count INTEGER DEFAULT 1
)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete cache entries that are:
    -- 1. Older than max_age_days AND
    -- 2. Have fewer than min_hit_count hits (not frequently used)
    WITH deleted AS (
        DELETE FROM computation_cache
        WHERE created_at < (CURRENT_TIMESTAMP - (p_max_age_days || ' days')::INTERVAL)
          AND hit_count < p_min_hit_count
          AND (expires_at IS NULL OR expires_at < CURRENT_TIMESTAMP)
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- STEP 6: Create triggers for automatic cache management
-- ==============================================================================

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_computation_queue_updated_at BEFORE UPDATE ON computation_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to invalidate cache when dataset is versioned
CREATE OR REPLACE FUNCTION trigger_invalidate_on_dataset_version()
RETURNS TRIGGER AS $$
BEGIN
    -- When a new dataset version is added, invalidate related cache
    PERFORM invalidate_dataset_cache(NEW.dataset_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invalidate_cache_on_version
    AFTER INSERT ON project_datasets
    FOR EACH ROW
    WHEN (NEW.version > 1)  -- Only for new versions, not initial adds
    EXECUTE FUNCTION trigger_invalidate_on_dataset_version();

-- ==============================================================================
-- STEP 7: Create views for cache analytics
-- ==============================================================================

-- View for cache hit rates and statistics
CREATE OR REPLACE VIEW computation_cache_stats AS
SELECT
    operation_type,
    COUNT(*) as total_entries,
    SUM(hit_count) as total_hits,
    AVG(hit_count) as avg_hits_per_entry,
    SUM(result_size_bytes) as total_size_bytes,
    AVG(computation_time_ms) as avg_computation_time_ms,
    COUNT(*) FILTER (WHERE is_valid = true) as valid_entries,
    COUNT(*) FILTER (WHERE is_valid = false) as invalid_entries,
    COUNT(*) FILTER (WHERE last_accessed_at > CURRENT_TIMESTAMP - INTERVAL '7 days') as recently_used
FROM computation_cache
GROUP BY operation_type;

COMMENT ON VIEW computation_cache_stats IS 'Statistics about cache usage by operation type';

-- View for queue health monitoring
CREATE OR REPLACE VIEW computation_queue_health AS
SELECT
    status,
    COUNT(*) as job_count,
    AVG(priority) as avg_priority,
    MIN(created_at) as oldest_job,
    MAX(created_at) as newest_job,
    COUNT(*) FILTER (WHERE retry_count > 0) as retried_jobs,
    COUNT(*) FILTER (WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '1 hour' AND status = 'pending') as stale_pending_jobs
FROM computation_queue
GROUP BY status;

COMMENT ON VIEW computation_queue_health IS 'Health monitoring for computation queue';

-- ==============================================================================
-- STEP 8: Sample data for development
-- ==============================================================================

-- Insert example cache entry for development
-- (This would normally be created by actual computation)
INSERT INTO computation_cache (
    cache_key,
    dataset_id,
    operation_type,
    parameters,
    result_type,
    result_data,
    result_size_bytes,
    computed_by,
    computation_time_ms,
    memory_used_mb
) VALUES (
    'example_pca_cache_key_abc123',
    (SELECT id FROM datasets LIMIT 1),
    'pca',
    '{"components": 3, "method": "full"}'::jsonb,
    'json',
    '{"reducedData": [[1.2, 0.5, 0.1], [0.8, 1.1, 0.3]], "variance": [0.85, 0.12, 0.03]}'::jsonb,
    2048,
    'system',
    1250,
    128
) ON CONFLICT (cache_key) DO NOTHING;

-- Migration complete
SELECT 'Migration 002: Computation cache infrastructure created successfully' as status;
