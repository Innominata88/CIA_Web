// src/core/data/providers/LocalStorageProvider.js

import { DatasetManagerAdapter } from "@Core/data/managers/DatasetManagerAdapter.js";
import { dataCache } from "@Services/storage/dataCache.js";

/**
 * LocalStorageProvider
 *
 * This is a convenience wrapper that creates a DatasetManagerAdapter
 * backed by the local dataCache (IndexedDB).
 *
 * This provides the same interface as ServerStorageProvider but stores
 * everything locally instead of on a server.
 */
export class LocalStorageProvider extends DatasetManagerAdapter {
  constructor() {
    super(dataCache);
    console.log("💾 LocalStorageProvider: Created");
  }

  async initialize() {
    console.log("💾 LocalStorageProvider: Initializing...");

    // Initialize the underlying cache
    if (dataCache && typeof dataCache.initialize === "function") {
      await dataCache.initialize();
    } else if (dataCache && typeof dataCache.initDB === "function") {
      await dataCache.initDB();
    }

    // Initialize the adapter
    await super.initialize();

    console.log("✅ LocalStorageProvider: Ready");
  }

  /**
   * List all datasets in local storage
   * This implements the interface expected by DatasetManager
   */
  async listDatasets() {
    try {
      // Get all datasets from the cache
      const cachedDatasets = await dataCache.listDatasets();

      // Transform to match the server format for consistency
      return cachedDatasets.map(cached => ({
        id: cached.hash, // Use hash as ID for local storage
        filename: cached.name,
        storage_key: cached.hash,
        file_size: cached.sizeBytes,
        uploaded_at: cached.storedAt,
        metadata: {
          hash: cached.hash,
        }
      }));
    } catch (error) {
      console.error("❌ LocalStorageProvider: Failed to list datasets:", error);
      return [];
    }
  }
}
