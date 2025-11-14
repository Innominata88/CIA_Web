// server/src/computations/ComputationHandler.js
// Base class for computation plugins

/**
 * ComputationHandler Interface
 *
 * All server-side computation plugins must implement this interface.
 * This enables contributors to add new computation types (dimensionality
 * reduction, filtering, analysis, etc.) without modifying core code.
 *
 * Philosophy:
 * - The core asks "what" should be computed (operation type, parameters)
 * - The handler decides "how" to compute it for this specific algorithm
 * - Contributors work within their handler without touching core
 *
 * Examples:
 * - PCAHandler - Principal Component Analysis
 * - TSNEHandler - t-SNE dimensionality reduction
 * - UMAPHandler - UMAP reduction
 * - ThresholdFilterHandler - Scalar threshold filtering
 * - HistogramHandler - Generate histograms
 */
class ComputationHandler {
  /**
   * Get the unique identifier for this computation type
   *
   * Examples: 'pca', 'tsne', 'umap', 'threshold', 'histogram'
   *
   * @returns {string} Type identifier
   */
  getType() {
    throw new Error("ComputationHandler.getType() must be implemented");
  }

  /**
   * Get human-readable name for this computation
   *
   * Used in UI and logs
   *
   * @returns {string} Display name
   */
  getDisplayName() {
    throw new Error("ComputationHandler.getDisplayName() must be implemented");
  }

  /**
   * Get parameter schema for this computation
   *
   * Defines what parameters this computation accepts and their types.
   * Used for validation and UI generation.
   *
   * @returns {Object} JSON Schema for parameters
   *
   * Example for PCA:
   * {
   *   type: 'object',
   *   properties: {
   *     components: {
   *       type: 'integer',
   *       minimum: 1,
   *       maximum: 100,
   *       default: 3,
   *       description: 'Number of components to compute'
   *     },
   *     method: {
   *       type: 'string',
   *       enum: ['full', 'randomized'],
   *       default: 'full',
   *       description: 'Computation method'
   *     }
   *   },
   *   required: ['components']
   * }
   */
  getParameterSchema() {
    return {
      type: "object",
      properties: {},
    };
  }

  /**
   * Validate parameters before computation
   *
   * Override this for custom validation beyond schema validation.
   *
   * @param {Object} parameters - Parameters to validate
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  validateParameters(parameters) {
    // Default: assume valid if schema validation passed
    return { valid: true, errors: [] };
  }

  /**
   * Estimate computation time and resources
   *
   * Used for job scheduling and informing users about expected wait time.
   *
   * @param {Object} datasetMetadata - Dataset metadata (size, points, etc.)
   * @param {Object} parameters - Computation parameters
   * @returns {Object} { estimatedTimeMs: number, estimatedMemoryMB: number, gpuRequired: boolean }
   */
  estimateResources(datasetMetadata, parameters) {
    return {
      estimatedTimeMs: 1000,
      estimatedMemoryMB: 100,
      gpuRequired: false,
    };
  }

  /**
   * Check if this handler can process the given dataset type
   *
   * Some computations only work with specific data types.
   *
   * @param {string} datasetType - Dataset file type ('vtp', 'vti', 'json', etc.)
   * @returns {boolean} Can this handler process this type?
   */
  canHandleDatasetType(datasetType) {
    // Default: can handle any type
    return true;
  }

  /**
   * Perform the computation
   *
   * This is the main method where the actual work happens.
   *
   * @param {Object} dataset - Dataset object with metadata and data access
   * @param {Object} parameters - Validated computation parameters
   * @param {Function} onProgress - Progress callback (percent: 0-100)
   * @returns {Promise<Object>} Computation result
   *
   * Example result:
   * {
   *   type: 'json',  // or 'binary', 'file'
   *   data: { ... }, // Result data
   *   metadata: {
   *     computationTimeMs: 15000,
   *     algorithm: 'pca',
   *     parameters: { components: 3 }
   *   }
   * }
   */
  async compute(dataset, parameters, onProgress) {
    throw new Error("ComputationHandler.compute() must be implemented");
  }

  /**
   * Get file types that this computation can export to
   *
   * Some computations can export results in multiple formats.
   *
   * @returns {string[]} Supported export formats
   *
   * Example: ['json', 'csv', 'vtk']
   */
  getSupportedExportFormats() {
    return ["json"];
  }

  /**
   * Export result in specified format
   *
   * @param {Object} result - Computation result
   * @param {string} format - Desired format ('json', 'csv', etc.)
   * @returns {Promise<Buffer|string>} Exported data
   */
  async exportResult(result, format = "json") {
    if (format === "json") {
      return JSON.stringify(result);
    }

    throw new Error(`Export format '${format}' not supported`);
  }

  /**
   * Clean up resources after computation
   *
   * Override this if your computation allocates resources that need cleanup
   * (GPU memory, temporary files, etc.)
   *
   * @param {Object} context - Computation context
   */
  async cleanup(context) {
    // Default: no cleanup needed
  }

  /**
   * Get computation metadata for caching decisions
   *
   * This helps the cache system decide if results should be cached.
   *
   * @returns {Object} Metadata
   *
   * Example:
   * {
   *   cacheable: true,
   *   cacheMaxAge: 86400,  // 1 day in seconds
   *   resultSizeEstimate: 'small' | 'medium' | 'large'
   * }
   */
  getCacheMetadata() {
    return {
      cacheable: true,
      cacheMaxAge: 86400, // 1 day
      resultSizeEstimate: "medium",
    };
  }
}

module.exports = ComputationHandler;

/**
 * Quick reference for implementers:
 *
 * MUST OVERRIDE:
 * - getType() - Your computation identifier
 * - getDisplayName() - Human-readable name
 * - compute() - The actual computation logic
 *
 * SHOULD OVERRIDE if applicable:
 * - getParameterSchema() - Define accepted parameters
 * - estimateResources() - For better scheduling
 * - canHandleDatasetType() - If you're data-type specific
 * - validateParameters() - For custom validation
 * - getSupportedExportFormats() - If you support multiple formats
 * - exportResult() - For format conversion
 *
 * OPTIONAL OVERRIDES:
 * - cleanup() - If you allocate resources
 * - getCacheMetadata() - For cache tuning
 *
 * Example minimal implementation:
 *
 * class MyComputationHandler extends ComputationHandler {
 *   getType() { return 'my-computation'; }
 *   getDisplayName() { return 'My Computation'; }
 *
 *   async compute(dataset, parameters, onProgress) {
 *     // Load data
 *     const data = await dataset.loadData();
 *
 *     // Do computation
 *     const result = performMyAlgorithm(data, parameters);
 *
 *     // Report progress
 *     onProgress(100);
 *
 *     return {
 *       type: 'json',
 *       data: result,
 *       metadata: { algorithm: 'my-computation' }
 *     };
 *   }
 * }
 */
