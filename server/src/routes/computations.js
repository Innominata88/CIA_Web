// server/src/routes/computations.js
// Server-side computation API with smart caching

const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { pool } = require("../index");
const { executeComputation, computationRegistry } = require("../computations/computationRegistry");

/**
 * Generate deterministic cache key
 * Cache key = SHA-256(datasetId + operationType + parameters)
 */
function generateCacheKey(datasetId, operationType, parameters) {
  const data = JSON.stringify({
    datasetId,
    operationType,
    parameters: sortObjectKeys(parameters), // Ensure consistent key order
  });

  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Sort object keys recursively for deterministic hashing
 */
function sortObjectKeys(obj) {
  if (typeof obj !== "object" || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);

  return Object.keys(obj)
    .sort()
    .reduce((sorted, key) => {
      sorted[key] = sortObjectKeys(obj[key]);
      return sorted;
    }, {});
}

/**
 * POST /api/computations/request
 * Request a computation (returns cached result or queues job)
 */
router.post("/request", async (req, res, next) => {
  try {
    const { datasetId, operationType, parameters, priority = 5, requestedBy } =
      req.body;

    // Validation
    if (!datasetId || !operationType || !parameters) {
      return res.status(400).json({
        error: "datasetId, operationType, and parameters are required",
      });
    }

    // Generate cache key
    const cacheKey = generateCacheKey(datasetId, operationType, parameters);

    console.log(
      `📊 Computation request: ${operationType} for dataset ${datasetId}`
    );
    console.log(`   Cache key: ${cacheKey}`);

    // Check if result is already cached
    const cacheResult = await pool.query(
      `SELECT id, result_type, result_data, result_file_path, result_size_bytes,
              computation_time_ms, hit_count
       FROM computation_cache
       WHERE cache_key = $1 AND is_valid = true`,
      [cacheKey]
    );

    if (cacheResult.rows.length > 0) {
      // Cache hit! Return immediately
      const cached = cacheResult.rows[0];

      // Record cache hit
      await pool.query("SELECT record_cache_hit($1)", [cacheKey]);

      console.log(
        `   ✅ Cache hit! (hits: ${cached.hit_count + 1}, saved ${
          cached.computation_time_ms
        }ms)`
      );

      return res.json({
        status: "cached",
        cacheKey,
        result: {
          type: cached.result_type,
          data: cached.result_data,
          filePath: cached.result_file_path,
          sizeBytes: cached.result_size_bytes,
        },
        metadata: {
          cachedAt: cached.created_at,
          computationTimeMs: cached.computation_time_ms,
          hitCount: cached.hit_count + 1,
        },
      });
    }

    // Cache miss - check if computation is already queued
    const queueResult = await pool.query(
      `SELECT id, status, progress_percent, started_at
       FROM computation_queue
       WHERE cache_key = $1 AND status IN ('pending', 'running')
       ORDER BY created_at DESC
       LIMIT 1`,
      [cacheKey]
    );

    if (queueResult.rows.length > 0) {
      // Job already queued or running
      const job = queueResult.rows[0];

      console.log(`   ⏳ Job already queued/running: ${job.id}`);

      return res.json({
        status: job.status,
        jobId: job.id,
        cacheKey,
        progress: job.progress_percent,
        message: `Computation ${job.status}`,
      });
    }

    // Cache miss and not queued - create new job
    const jobResult = await pool.query(
      `INSERT INTO computation_queue
       (cache_key, job_type, dataset_id, parameters, priority, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, status, created_at`,
      [cacheKey, operationType, datasetId, parameters, priority, requestedBy]
    );

    const job = jobResult.rows[0];

    console.log(`   🆕 New job queued: ${job.id}`);

    res.status(202).json({
      status: "queued",
      jobId: job.id,
      cacheKey,
      message: "Computation queued for processing",
      queuedAt: job.created_at,
    });
  } catch (error) {
    console.error("❌ Computation request error:", error);
    next(error);
  }
});

/**
 * GET /api/computations/status/:jobId
 * Get status of a queued computation
 */
router.get("/status/:jobId", async (req, res, next) => {
  try {
    const { jobId } = req.params;

    const result = await pool.query(
      `SELECT
         cq.id,
         cq.cache_key,
         cq.job_type,
         cq.status,
         cq.progress_percent,
         cq.progress_message,
         cq.error_message,
         cq.started_at,
         cq.completed_at,
         cq.created_at,
         cc.result_type,
         cc.result_data,
         cc.result_file_path
       FROM computation_queue cq
       LEFT JOIN computation_cache cc ON cq.cache_key = cc.cache_key
       WHERE cq.id = $1`,
      [jobId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Job not found" });
    }

    const job = result.rows[0];

    // If completed, return the result
    if (job.status === "completed" && job.result_data) {
      return res.json({
        status: "completed",
        jobId: job.id,
        result: {
          type: job.result_type,
          data: job.result_data,
          filePath: job.result_file_path,
        },
        completedAt: job.completed_at,
      });
    }

    // Otherwise return progress
    res.json({
      status: job.status,
      jobId: job.id,
      jobType: job.job_type,
      progress: job.progress_percent,
      message: job.progress_message || `Job ${job.status}`,
      error: job.error_message,
      queuedAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
    });
  } catch (error) {
    console.error("❌ Status check error:", error);
    next(error);
  }
});

/**
 * POST /api/computations/cancel/:jobId
 * Cancel a pending/running computation
 */
router.post("/cancel/:jobId", async (req, res, next) => {
  try {
    const { jobId } = req.params;

    const result = await pool.query(
      `UPDATE computation_queue
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status IN ('pending', 'running')
       RETURNING id, status`,
      [jobId]
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Job not found or cannot be cancelled" });
    }

    console.log(`🚫 Job cancelled: ${jobId}`);

    res.json({
      success: true,
      jobId: result.rows[0].id,
      status: result.rows[0].status,
    });
  } catch (error) {
    console.error("❌ Cancel job error:", error);
    next(error);
  }
});

/**
 * GET /api/computations/cache/:datasetId
 * Get all cached computations for a dataset
 */
router.get("/cache/:datasetId", async (req, res, next) => {
  try {
    const { datasetId } = req.params;

    const result = await pool.query(
      `SELECT
         id,
         cache_key,
         operation_type,
         parameters,
         result_size_bytes,
         computation_time_ms,
         hit_count,
         created_at,
         last_accessed_at,
         is_valid
       FROM computation_cache
       WHERE dataset_id = $1
       ORDER BY last_accessed_at DESC NULLS LAST, created_at DESC`,
      [datasetId]
    );

    res.json({
      datasetId,
      cacheEntries: result.rows,
      totalEntries: result.rows.length,
    });
  } catch (error) {
    console.error("❌ Cache listing error:", error);
    next(error);
  }
});

/**
 * DELETE /api/computations/cache/:cacheKey
 * Invalidate a cached computation
 */
router.delete("/cache/:cacheKey", async (req, res, next) => {
  try {
    const { cacheKey } = req.params;
    const { reason = "Manual invalidation" } = req.body;

    const result = await pool.query(
      `UPDATE computation_cache
       SET is_valid = false,
           invalidated_at = CURRENT_TIMESTAMP,
           invalidated_reason = $2
       WHERE cache_key = $1
       RETURNING id, operation_type`,
      [cacheKey, reason]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Cache entry not found" });
    }

    console.log(`🗑️ Cache invalidated: ${cacheKey} - ${reason}`);

    res.json({
      success: true,
      cacheKey,
      operationType: result.rows[0].operation_type,
      reason,
    });
  } catch (error) {
    console.error("❌ Cache invalidation error:", error);
    next(error);
  }
});

/**
 * POST /api/computations/cache/cleanup
 * Clean up old/unused cache entries
 */
router.post("/cache/cleanup", async (req, res, next) => {
  try {
    const { maxAgeDays = 30, minHitCount = 1 } = req.body;

    const result = await pool.query(
      "SELECT cleanup_computation_cache($1, $2) as deleted_count",
      [maxAgeDays, minHitCount]
    );

    const deletedCount = result.rows[0].deleted_count;

    console.log(`🧹 Cleaned up ${deletedCount} cache entries`);

    res.json({
      success: true,
      deletedCount,
      criteria: {
        maxAgeDays,
        minHitCount,
      },
    });
  } catch (error) {
    console.error("❌ Cache cleanup error:", error);
    next(error);
  }
});

/**
 * GET /api/computations/stats
 * Get cache statistics
 */
router.get("/stats", async (req, res, next) => {
  try {
    const cacheStats = await pool.query(
      "SELECT * FROM computation_cache_stats ORDER BY total_hits DESC"
    );

    const queueHealth = await pool.query(
      "SELECT * FROM computation_queue_health"
    );

    res.json({
      cache: cacheStats.rows,
      queue: queueHealth.rows,
    });
  } catch (error) {
    console.error("❌ Stats error:", error);
    next(error);
  }
});

/**
 * GET /api/computations/handlers
 * Get information about registered computation handlers
 */
router.get("/handlers", async (req, res, next) => {
  try {
    const info = computationRegistry.getComputationInfo();
    const types = computationRegistry.getRegisteredTypes();

    res.json({
      registeredTypes: types,
      handlers: info,
    });
  } catch (error) {
    console.error("❌ Handlers info error:", error);
    next(error);
  }
});

/**
 * POST /api/computations/execute
 * Execute a computation immediately (for testing)
 */
router.post("/execute", async (req, res, next) => {
  try {
    const { datasetId, operationType, parameters } = req.body;

    // Validation
    if (!datasetId || !operationType || !parameters) {
      return res.status(400).json({
        error: "datasetId, operationType, and parameters are required",
      });
    }

    console.log(`🧮 Executing ${operationType} for dataset ${datasetId}...`);

    // Get dataset metadata (mock for now)
    const dataset = {
      id: datasetId,
      fileType: "vtp",
      metadata: {
        pointCount: parameters.mockPointCount || 1000,
      },
    };

    // Execute computation
    const result = await executeComputation(
      operationType,
      dataset,
      parameters,
      (progress) => {
        console.log(`   Progress: ${progress}%`);
      }
    );

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("❌ Execute error:", error);
    res.status(500).json({
      error: error.message,
    });
  }
});

module.exports = router;
