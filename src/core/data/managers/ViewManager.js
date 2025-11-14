// src/core/data/managers/ViewManager.js

import { EventEmitter } from "events";
import { ydoc } from "@Collaboration/yjs/yjsSetup.js";
import { getUserId, getUserName } from "@Collaboration/presence/userManagement.js";

/**
 * ViewManager - Manages view lifecycle, persistence, and synchronization
 *
 * This manager handles:
 * - View creation/activation/deactivation
 * - Linked instances (shared views with bidirectional sync)
 * - View persistence to server database
 * - Real-time view sync via Y.js
 * - View participants (who's viewing what)
 * - Share requests for collaborative viewing
 *
 * Architecture:
 * - Views are stored in database for persistence
 * - Active view state synced via Y.js for real-time collaboration
 * - Inactive views remain in database but aren't rendered
 * - Multiple users can participate in the same view (linked instances)
 */
export class ViewManager extends EventEmitter {
  constructor(apiBaseUrl, sessionId) {
    super();

    this.apiBaseUrl = apiBaseUrl;
    this.sessionId = sessionId;

    // Local view cache
    // Maps viewId -> { id, name, datasetId, state, participants, config, ... }
    this._views = new Map();

    // Track which views are currently active locally
    // Maps viewId -> { instanceId, container }
    this._activeViews = new Map();

    // Track pending share requests
    this._shareRequests = new Map();

    console.log("👁️ ViewManager: Initializing...");
  }

  // ==================== INITIALIZATION ====================

  async initialize() {
    console.log("👁️ ViewManager: Initializing...");

    // Sync views from server
    await this._syncViewsFromServer();

    // Set up Y.js observers for real-time view updates
    this._setupYjsObservers();

    console.log(`👁️ ViewManager: Initialized with ${this._views.size} views`);
  }

  /**
   * Sync views from server database
   * Called during initialization to populate local state
   */
  async _syncViewsFromServer() {
    console.log("📡 ViewManager: Syncing views from server...");

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/views/session/${this.sessionId}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const views = data.views || [];

      console.log(`   Found ${views.length} view(s) on server`);

      for (const serverView of views) {
        this._views.set(serverView.id, {
          id: serverView.id,
          name: serverView.name,
          datasetIds: serverView.dataset_ids,
          state: serverView.state,
          createdBy: serverView.created_by,
          createdAt: serverView.created_at,
          lastActivatedAt: serverView.last_activated_at,
          config: {
            camera: serverView.camera,
            widgets: serverView.widgets,
            annotationFilters: serverView.annotation_filters,
          },
          participants: [], // Will be populated from server
        });

        this._emit("viewAdded", this._views.get(serverView.id));
      }

      console.log(`   ✅ Synced ${views.length} view(s) from server`);

      // Now sync active views to Y.js
      this._syncViewsToYjs();

    } catch (error) {
      console.error("❌ ViewManager: Server sync failed:", error);
      throw error;
    }
  }

  /**
   * Sync views to Y.js for real-time collaboration
   * Only syncs active views - inactive views stay in database only
   */
  _syncViewsToYjs() {
    if (!ydoc) {
      console.warn("⚠️ ViewManager: Y.js not ready, skipping sync");
      return;
    }

    const yViews = ydoc.getMap("views");
    const currentUserId = getUserId();

    // Sync only active views
    this._views.forEach((view) => {
      if (view.state === "active" && view.createdBy === currentUserId) {
        yViews.set(view.id, {
          id: view.id,
          name: view.name,
          datasetIds: view.datasetIds,
          state: view.state,
          userId: view.createdBy,
          userName: getUserName(),
          config: view.config,
          lastUpdated: Date.now(),
        });

        console.log(`🔄 Synced active view to Y.js: ${view.name}`);
      }
    });
  }

  /**
   * Set up Y.js observers for real-time view synchronization
   */
  _setupYjsObservers() {
    if (!ydoc) {
      console.warn("⚠️ ViewManager: Y.js not ready, cannot set up observers");
      return;
    }

    const yViews = ydoc.getMap("views");

    yViews.observe((event) => {
      event.changes.keys.forEach((change, viewId) => {
        const view = yViews.get(viewId);

        if (!view) return;

        const currentUserId = getUserId();

        // Skip our own views (we already know about them)
        if (view.userId === currentUserId) return;

        if (change.action === "add") {
          console.log(`👁️ Remote view added: ${view.name} (from ${view.userName})`);

          // Store remote view metadata
          if (!this._views.has(viewId)) {
            this._views.set(viewId, {
              ...view,
              isRemote: true,
            });

            this._emit("remoteViewAdded", view);
          }

        } else if (change.action === "update") {
          console.log(`👁️ Remote view updated: ${viewId}`);

          // Update cached view
          if (this._views.has(viewId)) {
            const existing = this._views.get(viewId);
            this._views.set(viewId, {
              ...existing,
              ...view,
            });

            this._emit("remoteViewUpdated", view);
          }

        } else if (change.action === "delete") {
          console.log(`👁️ Remote view deleted: ${viewId}`);

          if (this._views.has(viewId)) {
            this._views.delete(viewId);
            this._emit("remoteViewDeleted", viewId);
          }
        }
      });
    });

    console.log("✅ ViewManager: Y.js observers set up");
  }

  // ==================== VIEW CRUD OPERATIONS ====================

  /**
   * Create a new view
   * This persists to server and optionally activates immediately
   */
  async createView({ name, datasetId, config = {}, activate = true }) {
    console.log(`👁️ ViewManager: Creating view "${name}"`);

    const currentUserId = getUserId();

    try {
      // Create view on server
      const response = await fetch(`${this.apiBaseUrl}/views`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: this.sessionId,
          name,
          datasetIds: [datasetId],
          config: {
            camera: config.camera || {},
            widgets: config.widgets || [],
            annotationFilters: config.annotationFilters || {},
          },
          createdBy: currentUserId,
          state: activate ? "active" : "inactive",
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create view: ${response.statusText}`);
      }

      const { view } = await response.json();

      // Cache locally
      this._views.set(view.id, {
        id: view.id,
        name: view.name,
        datasetIds: view.dataset_ids,
        state: view.state,
        createdBy: view.created_by,
        createdAt: view.created_at,
        config: {
          camera: view.camera,
          widgets: view.widgets,
          annotationFilters: view.annotation_filters,
        },
        participants: [],
      });

      // Emit event
      this._emit("viewCreated", this._views.get(view.id));

      // If activating, sync to Y.js
      if (activate) {
        this._syncViewToYjs(view.id);
      }

      console.log(`✅ ViewManager: View "${name}" created (ID: ${view.id})`);

      return view.id;

    } catch (error) {
      console.error("❌ ViewManager: Failed to create view:", error);
      throw error;
    }
  }

  /**
   * Activate a view (render it)
   * This transitions a view from inactive → active state
   */
  async activateView(viewId, container, instanceId) {
    console.log(`👁️ ViewManager: Activating view ${viewId}`);

    const view = this._views.get(viewId);
    if (!view) {
      throw new Error(`View ${viewId} not found`);
    }

    try {
      // Update state on server
      await this._updateViewState(viewId, "active");

      // Track locally
      this._activeViews.set(viewId, {
        instanceId,
        container,
        activatedAt: Date.now(),
      });

      // Update cached view
      view.state = "active";
      view.lastActivatedAt = Date.now();

      // Sync to Y.js so other users can see it
      this._syncViewToYjs(viewId);

      // Emit event
      this._emit("viewActivated", view);

      // Notify other participants if this is a shared view
      if (view.participants && view.participants.length > 0) {
        this._notifyViewActivated(viewId);
      }

      console.log(`✅ ViewManager: View ${viewId} activated`);

    } catch (error) {
      console.error("❌ ViewManager: Failed to activate view:", error);
      throw error;
    }
  }

  /**
   * Deactivate a view (close the window but keep metadata)
   * This transitions a view from active → inactive state
   */
  async deactivateView(viewId) {
    console.log(`👁️ ViewManager: Deactivating view ${viewId}`);

    const view = this._views.get(viewId);
    if (!view) {
      throw new Error(`View ${viewId} not found`);
    }

    try {
      // Update state on server
      await this._updateViewState(viewId, "inactive");

      // Remove from active views
      this._activeViews.delete(viewId);

      // Update cached view
      view.state = "inactive";

      // Remove from Y.js (inactive views don't need real-time sync)
      if (ydoc) {
        const yViews = ydoc.getMap("views");
        yViews.delete(viewId);
      }

      // Emit event
      this._emit("viewDeactivated", view);

      console.log(`✅ ViewManager: View ${viewId} deactivated`);

    } catch (error) {
      console.error("❌ ViewManager: Failed to deactivate view:", error);
      throw error;
    }
  }

  /**
   * Delete a view (soft delete with audit trail)
   * Only the owner can delete a view
   */
  async deleteView(viewId) {
    console.log(`👁️ ViewManager: Deleting view ${viewId}`);

    const view = this._views.get(viewId);
    if (!view) {
      throw new Error(`View ${viewId} not found`);
    }

    const currentUserId = getUserId();
    if (view.createdBy !== currentUserId) {
      throw new Error(`Only the view owner can delete it`);
    }

    try {
      // Soft delete on server
      const response = await fetch(`${this.apiBaseUrl}/views/${viewId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deletedBy: currentUserId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to delete view: ${response.statusText}`);
      }

      // Remove from local cache
      this._views.delete(viewId);
      this._activeViews.delete(viewId);

      // Remove from Y.js
      if (ydoc) {
        const yViews = ydoc.getMap("views");
        yViews.delete(viewId);
      }

      // Emit event
      this._emit("viewDeleted", viewId);

      console.log(`✅ ViewManager: View ${viewId} deleted`);

    } catch (error) {
      console.error("❌ ViewManager: Failed to delete view:", error);
      throw error;
    }
  }

  // ==================== VIEW STATE SYNC ====================

  /**
   * Update view configuration (camera, widgets, filters)
   * This is called when user interacts with the view
   */
  async updateViewConfig(viewId, configUpdates) {
    const view = this._views.get(viewId);
    if (!view) {
      throw new Error(`View ${viewId} not found`);
    }

    // Update local config
    view.config = {
      ...view.config,
      ...configUpdates,
    };

    // Update Y.js for real-time sync if view is active
    if (view.state === "active") {
      this._syncViewToYjs(viewId);
    }

    // Debounced server update (don't spam the database on every camera move)
    this._scheduleServerUpdate(viewId);
  }

  /**
   * Sync a single view to Y.js
   */
  _syncViewToYjs(viewId) {
    const view = this._views.get(viewId);
    if (!view || !ydoc) return;

    const yViews = ydoc.getMap("views");

    yViews.set(viewId, {
      id: view.id,
      name: view.name,
      datasetIds: view.datasetIds,
      state: view.state,
      userId: view.createdBy,
      userName: getUserName(),
      config: view.config,
      lastUpdated: Date.now(),
    });
  }

  // ==================== HELPER METHODS ====================

  /**
   * Update view state on server
   */
  async _updateViewState(viewId, newState) {
    await fetch(`${this.apiBaseUrl}/views/${viewId}/state`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: newState,
        userId: getUserId(),
      }),
    });
  }

  /**
   * Schedule a debounced server update
   * Prevents spamming the database on every interaction
   */
  _scheduleServerUpdate(viewId) {
    if (this._updateTimers) {
      clearTimeout(this._updateTimers.get(viewId));
    }

    if (!this._updateTimers) {
      this._updateTimers = new Map();
    }

    this._updateTimers.set(
      viewId,
      setTimeout(() => {
        this._flushViewToServer(viewId);
      }, 2000) // 2 second debounce
    );
  }

  /**
   * Flush view config to server
   */
  async _flushViewToServer(viewId) {
    const view = this._views.get(viewId);
    if (!view) return;

    try {
      await fetch(`${this.apiBaseUrl}/views/${viewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: view.config,
          updatedBy: getUserId(),
        }),
      });

      console.log(`✅ ViewManager: View ${viewId} synced to server`);
    } catch (error) {
      console.warn(`⚠️ ViewManager: Failed to sync view to server:`, error);
    }
  }

  /**
   * Notify other participants that a view was activated
   */
  async _notifyViewActivated(viewId) {
    // TODO: Implement notification system
    // This will create share requests for other participants
  }

  // ==================== GETTERS ====================

  getView(viewId) {
    return this._views.get(viewId);
  }

  getAllViews() {
    return Array.from(this._views.values());
  }

  getActiveViews() {
    return this.getAllViews().filter((v) => v.state === "active");
  }

  getInactiveViews() {
    return this.getAllViews().filter((v) => v.state === "inactive");
  }

  getViewsForDataset(datasetId) {
    return this.getAllViews().filter((v) => v.datasetIds.includes(datasetId));
  }

  isViewActive(viewId) {
    return this._activeViews.has(viewId);
  }

  // ==================== EVENT SYSTEM ====================

  _emit(event, data) {
    this.emit(event, data);
  }

  // ==================== CLEANUP ====================

  async cleanup() {
    console.log("👁️ ViewManager: Cleaning up...");

    // Deactivate all active views
    for (const [viewId] of this._activeViews) {
      try {
        await this.deactivateView(viewId);
      } catch (error) {
        console.warn(`⚠️ Failed to deactivate view ${viewId}:`, error);
      }
    }

    this._views.clear();
    this._activeViews.clear();

    console.log("👁️ ViewManager: Cleanup complete");
  }
}
