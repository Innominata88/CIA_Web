// server/src/computations/handlers/PCAHandler.js
// Example computation handler: Principal Component Analysis

const ComputationHandler = require("../ComputationHandler");

/**
 * PCAHandler - Principal Component Analysis dimensionality reduction
 *
 * This is an example implementation showing how to create a computation handler.
 * Real implementation would use a proper PCA library (like ml-pca or Python backend).
 */
class PCAHandler extends ComputationHandler {
  getType() {
    return "pca";
  }

  getDisplayName() {
    return "Principal Component Analysis";
  }

  getParameterSchema() {
    return {
      type: "object",
      properties: {
        components: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 3,
          description: "Number of principal components to compute",
        },
        method: {
          type: "string",
          enum: ["full", "randomized"],
          default: "full",
          description: "Computation method (full SVD or randomized)",
        },
        whiten: {
          type: "boolean",
          default: false,
          description: "Apply whitening (divide by singular values)",
        },
      },
      required: ["components"],
    };
  }

  validateParameters(parameters) {
    const errors = [];

    if (parameters.components < 1) {
      errors.push("components must be at least 1");
    }

    if (
      parameters.method &&
      !["full", "randomized"].includes(parameters.method)
    ) {
      errors.push("method must be 'full' or 'randomized'");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  estimateResources(datasetMetadata, parameters) {
    const pointCount = datasetMetadata.pointCount || 1000;
    const components = parameters.components || 3;

    // Rough estimate: O(n * d * k) where n=points, d=dimensions, k=components
    const estimatedTimeMs = Math.ceil(
      (pointCount / 10000) * components * 100
    );
    const estimatedMemoryMB = Math.ceil((pointCount * 8 * components) / 1024 / 1024);

    return {
      estimatedTimeMs: Math.max(100, estimatedTimeMs),
      estimatedMemoryMB: Math.max(10, estimatedMemoryMB),
      gpuRequired: false,
    };
  }

  canHandleDatasetType(datasetType) {
    // PCA works with any point-based data
    return ["vtp", "vti", "json", "csv"].includes(datasetType);
  }

  async compute(dataset, parameters, onProgress) {
    console.log(`🧮 Computing PCA with ${parameters.components} components...`);

    const startTime = Date.now();

    try {
      // Report initial progress
      onProgress(0);

      // STEP 1: Load dataset (10% of work)
      console.log("  📂 Loading dataset...");
      const data = await this._loadDataset(dataset);
      onProgress(10);

      // STEP 2: Extract point coordinates (20% of work)
      console.log("  🔢 Extracting coordinates...");
      const coordinates = this._extractCoordinates(data);
      onProgress(30);

      // STEP 3: Center data (10% of work)
      console.log("  📍 Centering data...");
      const { centered, mean } = this._centerData(coordinates);
      onProgress(40);

      // STEP 4: Compute covariance matrix (30% of work)
      console.log("  📊 Computing covariance...");
      const covariance = this._computeCovariance(centered);
      onProgress(70);

      // STEP 5: Compute eigenvectors (30% of work)
      console.log("  🎯 Computing eigenvectors...");
      const { components, variance, varRatio } = await this._computeEigenvectors(
        covariance,
        parameters.components
      );
      onProgress(90);

      // STEP 6: Transform data
      console.log("  🔄 Transforming data...");
      const transformed = this._transform(centered, components);
      onProgress(100);

      const computationTimeMs = Date.now() - startTime;
      console.log(`  ✅ PCA complete in ${computationTimeMs}ms`);

      return {
        type: "json",
        data: {
          reducedData: transformed, // [n x k] matrix of reduced coordinates
          components: components, // [k x d] matrix of principal components
          explainedVariance: variance, // Variance explained by each component
          explainedVarianceRatio: varRatio, // Proportion of variance explained
          mean: mean, // Original data mean
          originalDimensions: coordinates[0].length,
          reducedDimensions: parameters.components,
          numPoints: coordinates.length,
        },
        metadata: {
          algorithm: "pca",
          method: parameters.method,
          components: parameters.components,
          whiten: parameters.whiten,
          computationTimeMs,
        },
      };
    } catch (error) {
      console.error("❌ PCA computation failed:", error);
      throw error;
    }
  }

  getSupportedExportFormats() {
    return ["json", "csv"];
  }

  async exportResult(result, format = "json") {
    if (format === "json") {
      return JSON.stringify(result);
    }

    if (format === "csv") {
      return this._exportCSV(result.data);
    }

    throw new Error(`Export format '${format}' not supported`);
  }

  getCacheMetadata() {
    return {
      cacheable: true,
      cacheMaxAge: 86400 * 7, // 1 week (PCA results stable for longer)
      resultSizeEstimate: "medium",
    };
  }

  // ==================== HELPER METHODS ====================

  async _loadDataset(dataset) {
    // Mock implementation - real version would load actual file
    // This would use the dataset's file path and load the VTP/JSON/etc.

    // For now, generate mock data
    const pointCount = dataset.metadata?.pointCount || 1000;

    return {
      points: this._generateMockPoints(pointCount),
    };
  }

  _generateMockPoints(count) {
    // Generate mock 10D data for testing
    const points = [];
    for (let i = 0; i < count; i++) {
      const point = [];
      for (let d = 0; d < 10; d++) {
        point.push(Math.random() * 100);
      }
      points.push(point);
    }
    return points;
  }

  _extractCoordinates(data) {
    // Extract coordinate matrix from dataset
    return data.points;
  }

  _centerData(coordinates) {
    const n = coordinates.length;
    const d = coordinates[0].length;

    // Compute mean
    const mean = new Array(d).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < d; j++) {
        mean[j] += coordinates[i][j];
      }
    }
    for (let j = 0; j < d; j++) {
      mean[j] /= n;
    }

    // Center data
    const centered = coordinates.map((point) =>
      point.map((val, j) => val - mean[j])
    );

    return { centered, mean };
  }

  _computeCovariance(centered) {
    const n = centered.length;
    const d = centered[0].length;

    // Compute covariance matrix: C = (1/n) * X^T * X
    const cov = Array(d)
      .fill(0)
      .map(() => Array(d).fill(0));

    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) {
        let sum = 0;
        for (let k = 0; k < n; k++) {
          sum += centered[k][i] * centered[k][j];
        }
        cov[i][j] = sum / n;
      }
    }

    return cov;
  }

  async _computeEigenvectors(covariance, numComponents) {
    // Simplified mock implementation
    // Real version would use proper linear algebra library (eigen decomposition)

    const d = covariance.length;

    // Mock: Generate random orthogonal components
    const components = [];
    for (let i = 0; i < Math.min(numComponents, d); i++) {
      const component = new Array(d)
        .fill(0)
        .map(() => Math.random() * 2 - 1);

      // Normalize
      const norm = Math.sqrt(
        component.reduce((sum, val) => sum + val * val, 0)
      );
      const normalized = component.map((val) => val / norm);

      components.push(normalized);
    }

    // Mock variance values
    const variance = components.map((_, i) => 1.0 / (i + 1));
    const totalVar = variance.reduce((sum, v) => sum + v, 0);
    const varRatio = variance.map((v) => v / totalVar);

    return { components, variance, varRatio };
  }

  _transform(centered, components) {
    // Project data onto principal components: Y = X * C^T
    const transformed = [];

    for (let i = 0; i < centered.length; i++) {
      const point = centered[i];
      const reduced = [];

      for (let j = 0; j < components.length; j++) {
        const component = components[j];
        let projection = 0;
        for (let k = 0; k < point.length; k++) {
          projection += point[k] * component[k];
        }
        reduced.push(projection);
      }

      transformed.push(reduced);
    }

    return transformed;
  }

  _exportCSV(data) {
    const lines = [];

    // Header
    const dims = data.reducedDimensions;
    const header = Array.from({ length: dims }, (_, i) => `PC${i + 1}`).join(",");
    lines.push(header);

    // Data rows
    for (const point of data.reducedData) {
      lines.push(point.join(","));
    }

    return lines.join("\n");
  }
}

module.exports = PCAHandler;
