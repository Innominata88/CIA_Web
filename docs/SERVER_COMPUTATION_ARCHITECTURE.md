# Server-Side Computation Architecture

## Overview

The CIA Web platform implements **server-side computation with intelligent caching** to enable:
- Heavy operations (PCA, t-SNE, UMAP) on powerful server hardware
- Lightweight clients (VR headsets, tablets, low-end devices) working with large datasets
- Shared view collaboration where computations are performed once and served to all participants
- Nondestructive operations that preserve original data

## Architecture Principles

### 1. Original Data is Immutable
- Raw datasets are stored once and never modified
- All filters, reductions, and transformations are computed on-demand
- Users can apply different filters to different views of the same dataset
- Dataset versioning tracks changes without duplicating raw data

### 2. Computation Results are Cached
- Server computes expensive operations once
- Results are cached with deterministic keys
- Identical operations return cached results instantly
- Cache invalidation when datasets are versioned or modified

### 3. Lightweight Client Design
- Clients request computations via API
- Server performs heavy work (dimensionality reduction, filtering, etc.)
- Results are streamed back to client for visualization
- VR headsets and tablets can work with massive datasets

---

## Database Schema

### `computation_cache` - Stores Computation Results

Stores results of expensive operations for instant retrieval.

```sql
CREATE TABLE computation_cache (
    id UUID PRIMARY KEY,
    cache_key VARCHAR(64) UNIQUE,  -- SHA-256 hash of operation
    dataset_id UUID,
    operation_type VARCHAR(50),     -- 'pca', 'tsne', 'umap', 'filter', etc.
    parameters JSONB,               -- Operation parameters
    result_type VARCHAR(20),        -- 'json', 'binary', 'file'
    result_data JSONB,              -- Small results stored inline
    result_file_path TEXT,          -- Large results stored as files
    hit_count INTEGER,              -- Cache hit analytics
    computation_time_ms INTEGER,    -- Time saved per cache hit
    ...
);
```

**Cache Key Generation:**
```javascript
cacheKey = SHA256(datasetId + operationType + sortedParameters)
```

This ensures:
- Identical operations get the same key
- Parameter order doesn't matter (sorted before hashing)
- Different parameter values get different keys

### `computation_queue` - Job Queue for Async Processing

Manages background computation jobs.

```sql
CREATE TABLE computation_queue (
    id UUID PRIMARY KEY,
    cache_key VARCHAR(64),
    job_type VARCHAR(50),
    status VARCHAR(20),              -- 'pending', 'running', 'completed', 'failed'
    priority INTEGER (1-10),         -- Higher = more urgent
    progress_percent INTEGER,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    ...
);
```

### `computation_dependencies` - Cache Invalidation Tracking

Tracks which cached results depend on which datasets.

```sql
CREATE TABLE computation_dependencies (
    cache_id UUID,
    depends_on_dataset UUID,
    depends_on_version INTEGER
);
```

When a dataset is versioned, all dependent cache entries are automatically invalidated.

---

## API Endpoints

### Request Computation

```http
POST /api/computations/request
Content-Type: application/json

{
  "datasetId": "dataset-uuid",
  "operationType": "pca",
  "parameters": {
    "components": 3,
    "method": "full"
  },
  "priority": 5,
  "requestedBy": "user-123"
}
```

**Response (Cached):**
```json
{
  "status": "cached",
  "cacheKey": "abc123...",
  "result": {
    "type": "json",
    "data": { "reducedData": [...], "variance": [...] }
  },
  "metadata": {
    "computationTimeMs": 15000,
    "hitCount": 42
  }
}
```

**Response (Queued):**
```json
{
  "status": "queued",
  "jobId": "job-uuid",
  "cacheKey": "abc123...",
  "message": "Computation queued for processing",
  "queuedAt": "2025-11-14T10:30:00Z"
}
```

### Check Job Status

```http
GET /api/computations/status/:jobId
```

**Response:**
```json
{
  "status": "running",
  "jobId": "job-uuid",
  "progress": 65,
  "message": "Processing iteration 650/1000",
  "startedAt": "2025-11-14T10:30:05Z"
}
```

### Other Endpoints

- `POST /api/computations/cancel/:jobId` - Cancel a running job
- `GET /api/computations/cache/:datasetId` - List cached computations
- `DELETE /api/computations/cache/:cacheKey` - Invalidate cache entry
- `POST /api/computations/cache/cleanup` - Clean up old cache
- `GET /api/computations/stats` - Get cache statistics

---

## Client-Side Usage

### ComputationManager API

```javascript
import { getComputationManager } from '@Core/computation/ComputationManager.js';

const computationManager = getComputationManager();

// Request a computation (returns immediately if cached)
const result = await computationManager.request({
  datasetId: 'dataset-123',
  operationType: 'pca',
  parameters: { components: 3 },
  priority: 8,  // High priority
  onProgress: (percent) => {
    console.log(`Progress: ${percent}%`);
    updateProgressBar(percent);
  }
});

// Use the result
applyPCAReduction(result.data);
```

### Supported Operations

**Dimensionality Reduction:**
- `pca` - Principal Component Analysis
- `tsne` - t-Distributed Stochastic Neighbor Embedding
- `umap` - Uniform Manifold Approximation and Projection

**Filtering:**
- `threshold` - Scalar threshold filtering
- `clip` - Geometric clipping
- `subsample` - Random subsampling

**Analysis:**
- `histogram` - Generate histogram
- `statistics` - Compute statistical measures
- `outliers` - Detect outliers

---

## Use Cases

### 1. Shared View with Heavy Filter

**Scenario:** User A applies PCA reduction to a 10M point dataset in a shared view.

**Flow:**
1. Client requests: `POST /api/computations/request` (PCA, 10M points)
2. Server computes (takes 30 seconds)
3. Result cached with key `abc123...`
4. User B joins the same view
5. Client requests same PCA computation
6. Server returns cached result **instantly** (hit count: 2)

**Benefits:**
- User A waits 30 seconds
- User B waits 0 seconds (cache hit)
- Server saved 30 seconds of compute time
- VR users can collaborate without expensive local computation

### 2. Nondestructive Filter Exploration

**Scenario:** Researcher explores multiple threshold values on the same dataset.

**Flow:**
1. Request threshold: `{ min: 0, max: 50 }` → Computed and cached
2. Request threshold: `{ min: 25, max: 75 }` → Computed and cached (different params)
3. Request threshold: `{ min: 0, max: 50 }` → **Cache hit!** (same params)

**Benefits:**
- Each unique parameter set is cached
- Returning to previous settings is instant
- Original data unchanged
- All intermediate results available

### 3. Dataset Versioning

**Scenario:** Dataset is updated with corrected data.

**Flow:**
1. Dataset v1 has cached PCA, t-SNE computations
2. Dataset is versioned → v2 created
3. Trigger fires: `invalidate_dataset_cache(dataset_id)`
4. All v1 cache entries marked invalid
5. Next computation request uses v2 data
6. New results cached for v2

**Benefits:**
- Old cache doesn't pollute new results
- Audit trail preserved (can see what was computed on v1)
- Automatic invalidation on versioning

---

## Cache Management

### Cache Hit Rate Analytics

```sql
SELECT * FROM computation_cache_stats;
```

```
operation_type | total_entries | total_hits | avg_hits_per_entry
---------------|---------------|------------|--------------------
pca            | 150           | 3,420      | 22.8
tsne           | 85            | 1,260      | 14.8
umap           | 42            | 890        | 21.2
```

### Automatic Cleanup

Old, rarely-used cache entries are automatically cleaned up:

```javascript
// Run daily cleanup job
await computationManager.cleanupCache(
  maxAgeDays: 30,    // Delete entries older than 30 days
  minHitCount: 1     // That have been used less than 1 time
);
```

### Manual Invalidation

```javascript
// Invalidate specific cache entry
await computationManager.invalidateCache(cacheKey, "Dataset corrected");
```

---

## Performance Characteristics

### Cache Hit Scenarios

| Scenario | First Request | Subsequent Requests | Time Saved |
|----------|--------------|---------------------|------------|
| PCA (10M points) | 30s | 50ms | 99.8% |
| t-SNE (1M points) | 120s | 100ms | 99.9% |
| Threshold filter (5M points) | 2s | 20ms | 99% |

### Storage Requirements

- **Small results** (<1MB): Stored inline in `result_data` (JSON)
- **Medium results** (1-100MB): Stored as files, path in `result_file_path`
- **Large results** (>100MB): Streamed directly to client, not cached

### Priority Levels

Jobs are processed in priority order:

- **Priority 10**: Real-time interaction (user waiting for result)
- **Priority 8-9**: Shared view activation (multiple users affected)
- **Priority 5-7**: Background precomputation
- **Priority 1-4**: Low-priority batch jobs

---

## Implementation Notes

### Cache Key Determinism

**Critical:** Cache keys must be deterministic to ensure identical operations get the same key.

**Parameter Sorting:**
```javascript
// BAD: Order matters
params = { b: 2, a: 1 }  → Key: abc123
params = { a: 1, b: 2 }  → Key: xyz789  (DIFFERENT!)

// GOOD: Sorted before hashing
params = { b: 2, a: 1 }  → Sorted: { a: 1, b: 2 } → Key: abc123
params = { a: 1, b: 2 }  → Sorted: { a: 1, b: 2 } → Key: abc123 (SAME!)
```

### Concurrent Request Deduplication

If multiple clients request the same computation simultaneously:

1. First request → Job queued
2. Second request (same params) → **Returns existing job ID**
3. Both clients poll the same job
4. When complete, both get the result

This prevents duplicate computations for the same operation.

---

## Future Enhancements

### 1. Distributed Workers

Add worker nodes for horizontal scaling:
- Job queue picks jobs by priority
- Workers register and claim jobs
- Load balancing across worker pool

### 2. GPU Acceleration

Offload certain operations to GPUs:
- Matrix operations (PCA)
- Neural network inference (clustering)
- Spatial operations (raycasting, collision)

### 3. Streaming Results

For very large results:
- Stream data chunks as computed
- Client displays progressive results
- Final result assembled on client

### 4. Predictive Precomputation

Learn common operation sequences:
- If user applies PCA, predict they'll want t-SNE next
- Precompute likely next steps in background
- Results ready before user requests them

---

## Monitoring

### Health Checks

```javascript
const stats = await computationManager.getStats();

console.log('Cache Stats:', stats.cache);
console.log('Queue Health:', stats.queue);
```

### Alerts

Monitor for:
- Queue depth > 100 jobs
- Average computation time > threshold
- Cache hit rate < 50%
- Failed jobs > 5% of total

---

## Summary

The server-side computation architecture enables:

✅ **Heavy operations** on lightweight clients (VR, tablets)
✅ **Instant results** through intelligent caching
✅ **Collaborative efficiency** - compute once, serve many
✅ **Nondestructive workflows** - original data pristine
✅ **Automatic optimization** - cache invalidation and cleanup

This design is critical for scaling the CIA Web platform to handle large datasets across diverse devices while maintaining real-time collaboration performance.
