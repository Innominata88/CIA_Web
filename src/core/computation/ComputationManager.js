// src/core/computation/ComputationManager.js
// Client-side API for requesting server-side computations with caching

import { EventEmitter } from "events";

/**
 * ComputationManager - Request and track server-side computations
 *
 * Features:
 * - Automatic caching (server-side)
 * - Job status polling
 * - Progress callbacks
 * - Error handling
 *
 * Usage:
 * ```javascript
 * const result = await computationManager.request({
 *   datasetId: 'dataset-123',
 *   operationType: 'pca',
 *   parameters: { components: 3 },
 *   onProgress: (progress) => console.log(`${progress}% complete`)
 * });
 * ```
 */
export class ComputationManager extends EventEmitter {
  constructor(apiBaseUrl) {
    super();
    this.apiBaseUrl = apiBaseUrl;

    // Track active jobs for polling
    this._activeJobs = new Map(); // jobId -> { pollTimer, callbacks }

    console.log("🧮 ComputationManager: Initializing...");
  }

  /**
   * Request a computation
   *
   * Returns immediately if cached, otherwise queues job and polls for completion
   *
   * @param {Object} options
   * @param {string} options.datasetId - Dataset to compute on
   * @param {string} options.operationType - 'pca', 'tsne', 'umap', 'filter', etc.
   * @param {Object} options.parameters - Operation-specific parameters
   * @param {number} options.priority - Job priority 1-10 (default: 5)
   * @param {Function} options.onProgress - Progress callback (percent)
   * @param {number} options.pollInterval - How often to check status (ms, default: 1000)
   * @returns {Promise<Object>} Computation result
   */
  async request({
    datasetId,
    operationType,
    parameters,
    priority = 5,
    onProgress,
    pollInterval = 1000,
  }) {
    console.log(`🧮 Requesting computation: ${operationType} for ${datasetId}`);

    try {
      // Make initial request
      const response = await fetch(`${this.apiBaseUrl}/computations/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datasetId,
          operationType,
          parameters,
          priority,
          requestedBy: this._getCurrentUser(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.statusText}`);
      }

      const data = await response.json();

      // If cached, return immediately
      if (data.status === "cached") {
        console.log(`   ✅ Cache hit! Saved ${data.metadata.computationTimeMs}ms`);
        this._emit("cached", {
          operationType,
          datasetId,
          result: data.result,
        });

        return data.result;
      }

      // Otherwise, poll for completion
      console.log(`   ⏳ Job ${data.status}: ${data.jobId}`);

      return await this._pollForCompletion(
        data.jobId,
        onProgress,
        pollInterval
      );
    } catch (error) {
      console.error("❌ Computation request failed:", error);
      throw error;
    }
  }

  /**
   * Poll for job completion
   *
   * @param {string} jobId - Job ID to poll
   * @param {Function} onProgress - Progress callback
   * @param {number} pollInterval - Poll interval in ms
   * @returns {Promise<Object>} Result when complete
   */
  async _pollForCompletion(jobId, onProgress, pollInterval) {
    return new Promise((resolve, reject) => {
      let lastProgress = -1;

      const poll = async () => {
        try {
          const status = await this.getJobStatus(jobId);

          // Report progress if changed
          if (
            status.progress !== lastProgress &&
            typeof onProgress === "function"
          ) {
            lastProgress = status.progress;
            onProgress(status.progress);
          }

          // Check if complete
          if (status.status === "completed") {
            console.log(`   ✅ Computation complete: ${jobId}`);
            this._stopPolling(jobId);
            resolve(status.result);
          } else if (status.status === "failed") {
            console.error(`   ❌ Computation failed: ${status.error}`);
            this._stopPolling(jobId);
            reject(new Error(status.error || "Computation failed"));
          } else if (status.status === "cancelled") {
            console.warn(`   🚫 Computation cancelled: ${jobId}`);
            this._stopPolling(jobId);
            reject(new Error("Computation cancelled"));
          } else {
            // Still running, schedule next poll
            const timer = setTimeout(poll, pollInterval);
            this._activeJobs.set(jobId, { timer, onProgress });
          }
        } catch (error) {
          console.error(`   ❌ Polling error:`, error);
          this._stopPolling(jobId);
          reject(error);
        }
      };

      // Start polling
      poll();
    });
  }

  /**
   * Stop polling for a job
   */
  _stopPolling(jobId) {
    const job = this._activeJobs.get(jobId);
    if (job && job.timer) {
      clearTimeout(job.timer);
    }
    this._activeJobs.delete(jobId);
  }

  /**
   * Get status of a queued/running job
   *
   * @param {string} jobId - Job ID
   * @returns {Promise<Object>} Job status
   */
  async getJobStatus(jobId) {
    const response = await fetch(
      `${this.apiBaseUrl}/computations/status/${jobId}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!response.ok) {
      throw new Error(`Status check failed: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Cancel a running job
   *
   * @param {string} jobId - Job ID to cancel
   * @returns {Promise<boolean>} Success
   */
  async cancelJob(jobId) {
    console.log(`🚫 Cancelling job: ${jobId}`);

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/computations/cancel/${jobId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok) {
        throw new Error(`Cancel failed: ${response.statusText}`);
      }

      // Stop polling if we were tracking this job
      this._stopPolling(jobId);

      return true;
    } catch (error) {
      console.error("❌ Cancel failed:", error);
      throw error;
    }
  }

  /**
   * Get all cached computations for a dataset
   *
   * @param {string} datasetId - Dataset ID
   * @returns {Promise<Array>} Cached computations
   */
  async getCachedComputations(datasetId) {
    const response = await fetch(
      `${this.apiBaseUrl}/computations/cache/${datasetId}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get cache: ${response.statusText}`);
    }

    const data = await response.json();
    return data.cacheEntries;
  }

  /**
   * Invalidate a cached computation
   *
   * @param {string} cacheKey - Cache key to invalidate
   * @param {string} reason - Reason for invalidation
   * @returns {Promise<boolean>} Success
   */
  async invalidateCache(cacheKey, reason = "Manual invalidation") {
    console.log(`🗑️ Invalidating cache: ${cacheKey}`);

    const response = await fetch(
      `${this.apiBaseUrl}/computations/cache/${cacheKey}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }
    );

    if (!response.ok) {
      throw new Error(`Invalidation failed: ${response.statusText}`);
    }

    return true;
  }

  /**
   * Get cache statistics
   *
   * @returns {Promise<Object>} Cache stats
   */
  async getStats() {
    const response = await fetch(`${this.apiBaseUrl}/computations/stats`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Stats failed: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Cleanup old cache entries
   *
   * @param {number} maxAgeDays - Max age in days
   * @param {number} minHitCount - Min hit count to keep
   * @returns {Promise<number>} Number of entries deleted
   */
  async cleanupCache(maxAgeDays = 30, minHitCount = 1) {
    console.log(
      `🧹 Cleaning up cache (age: ${maxAgeDays}d, hits: ${minHitCount}+)`
    );

    const response = await fetch(
      `${this.apiBaseUrl}/computations/cache/cleanup`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxAgeDays, minHitCount }),
      }
    );

    if (!response.ok) {
      throw new Error(`Cleanup failed: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`   ✅ Deleted ${data.deletedCount} entries`);

    return data.deletedCount;
  }

  // ==================== HELPER METHODS ====================

  _getCurrentUser() {
    // Get current user ID from global state
    return window.CIA?.userId || "anonymous";
  }

  _emit(event, data) {
    this.emit(event, data);
  }

  // ==================== CLEANUP ====================

  cleanup() {
    console.log("🧮 ComputationManager: Cleaning up...");

    // Stop all active polls
    for (const [jobId] of this._activeJobs) {
      this._stopPolling(jobId);
    }

    this._activeJobs.clear();

    console.log("🧮 ComputationManager: Cleanup complete");
  }
}

// Singleton instance
let computationManager = null;

/**
 * Initialize the computation manager
 *
 * @param {string} apiBaseUrl - API base URL
 * @returns {ComputationManager} Singleton instance
 */
export function initializeComputationManager(apiBaseUrl) {
  if (!computationManager) {
    computationManager = new ComputationManager(apiBaseUrl);
  }
  return computationManager;
}

/**
 * Get the computation manager singleton
 *
 * @returns {ComputationManager} Singleton instance
 */
export function getComputationManager() {
  if (!computationManager) {
    throw new Error(
      "ComputationManager not initialized. Call initializeComputationManager() first."
    );
  }
  return computationManager;
}

// Export singleton
export { computationManager };

// Make available for debugging
if (typeof window !== "undefined") {
  window.CIA = window.CIA || {};
  window.CIA.computationManager = computationManager;
}
