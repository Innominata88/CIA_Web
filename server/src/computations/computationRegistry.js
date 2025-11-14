// server/src/computations/computationRegistry.js
// Registry for computation handler plugins

/**
 * ComputationRegistry - Manages computation handler plugins
 *
 * Similar to the client-side instance type registry, this allows
 * contributors to register their computation handlers without
 * modifying core code.
 *
 * Usage:
 * ```javascript
 * const { registerComputation } = require('./computationRegistry');
 * const MyHandler = require('./handlers/MyHandler');
 *
 * registerComputation(new MyHandler());
 * ```
 */
class ComputationRegistry {
  constructor() {
    this._handlers = new Map(); // type -> handler instance

    console.log("🧮 ComputationRegistry: Initializing...");
  }

  /**
   * Register a computation handler
   *
   * @param {ComputationHandler} handler - Handler instance
   */
  register(handler) {
    const type = handler.getType();

    if (this._handlers.has(type)) {
      console.warn(
        `⚠️ ComputationRegistry: Handler for '${type}' already registered, overwriting`
      );
    }

    this._handlers.set(type, handler);
    console.log(
      `✅ ComputationRegistry: Registered '${type}' (${handler.getDisplayName()})`
    );
  }

  /**
   * Get a handler by type
   *
   * @param {string} type - Computation type
   * @returns {ComputationHandler|null} Handler or null if not found
   */
  getHandler(type) {
    return this._handlers.get(type) || null;
  }

  /**
   * Check if a computation type is registered
   *
   * @param {string} type - Computation type
   * @returns {boolean} Is registered?
   */
  hasHandler(type) {
    return this._handlers.has(type);
  }

  /**
   * Get all registered computation types
   *
   * @returns {string[]} Array of type identifiers
   */
  getRegisteredTypes() {
    return Array.from(this._handlers.keys());
  }

  /**
   * Get all handlers
   *
   * @returns {ComputationHandler[]} Array of handler instances
   */
  getAllHandlers() {
    return Array.from(this._handlers.values());
  }

  /**
   * Get handlers that can process a specific dataset type
   *
   * @param {string} datasetType - Dataset file type
   * @returns {ComputationHandler[]} Compatible handlers
   */
  getHandlersForDatasetType(datasetType) {
    return this.getAllHandlers().filter((handler) =>
      handler.canHandleDatasetType(datasetType)
    );
  }

  /**
   * Get computation info for API documentation
   *
   * @returns {Object} Info about all registered computations
   */
  getComputationInfo() {
    const info = {};

    this._handlers.forEach((handler, type) => {
      info[type] = {
        type,
        displayName: handler.getDisplayName(),
        parameterSchema: handler.getParameterSchema(),
        supportedFormats: handler.getSupportedExportFormats(),
        cacheMetadata: handler.getCacheMetadata(),
      };
    });

    return info;
  }

  /**
   * Execute a computation using the registered handler
   *
   * @param {string} type - Computation type
   * @param {Object} dataset - Dataset object
   * @param {Object} parameters - Computation parameters
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Result
   */
  async execute(type, dataset, parameters, onProgress) {
    const handler = this.getHandler(type);

    if (!handler) {
      throw new Error(`No handler registered for computation type: ${type}`);
    }

    // Validate parameters
    const validation = handler.validateParameters(parameters);
    if (!validation.valid) {
      throw new Error(
        `Parameter validation failed: ${validation.errors.join(", ")}`
      );
    }

    // Check dataset compatibility
    if (dataset.fileType && !handler.canHandleDatasetType(dataset.fileType)) {
      throw new Error(
        `Handler '${type}' cannot process dataset type '${dataset.fileType}'`
      );
    }

    // Get resource estimate
    const estimate = handler.estimateResources(dataset.metadata, parameters);
    console.log(
      `📊 Estimated resources: ${estimate.estimatedTimeMs}ms, ${estimate.estimatedMemoryMB}MB`
    );

    // Execute computation
    const startTime = Date.now();
    try {
      const result = await handler.compute(dataset, parameters, onProgress);

      const computationTimeMs = Date.now() - startTime;
      console.log(`✅ Computation complete in ${computationTimeMs}ms`);

      // Add timing to result metadata
      if (!result.metadata) result.metadata = {};
      result.metadata.computationTimeMs = computationTimeMs;

      return result;
    } catch (error) {
      console.error(`❌ Computation failed:`, error);
      throw error;
    } finally {
      // Always cleanup
      try {
        await handler.cleanup({});
      } catch (cleanupError) {
        console.warn(`⚠️ Cleanup warning:`, cleanupError);
      }
    }
  }
}

// Singleton instance
const computationRegistry = new ComputationRegistry();

module.exports = {
  computationRegistry,
  registerComputation: (handler) => computationRegistry.register(handler),
  getComputationHandler: (type) => computationRegistry.getHandler(type),
  executeComputation: (type, dataset, parameters, onProgress) =>
    computationRegistry.execute(type, dataset, parameters, onProgress),
};
