// src/collaboration/sharing/ShareRequestManager.js
/**
 * Share Request Manager
 *
 * Manages instance sharing requests with persistent tracking and auto-cleanup.
 * Solves the problem where users must refresh to see share notifications.
 *
 * Features:
 * - Persistent request tracking (survives dismissal)
 * - Auto-cleanup when requesters disconnect
 * - Status bar integration for pending requests
 * - Real-time presence monitoring
 */

import { yInstances } from "@Collaboration/yjs/yjsSetup.js";
import { getUserId } from "@Collaboration/presence/userManagement.js";

class ShareRequestManager {
  constructor() {
    // Map of instanceId -> { instanceId, userName, userId, datasetId, timestamp }
    this._pendingRequests = new Map();

    // Callbacks for UI updates
    this._listeners = [];

    // Track which instances we've already shown notifications for
    this._notifiedInstances = new Set();

    console.log("📬 ShareRequestManager: Initialized");
  }

  /**
   * Add a share request
   * This is called when a remote instance is detected
   */
  addRequest(instanceId, instanceData) {
    const { userName, userId, datasetId } = instanceData;

    // Don't add if we've already notified about this instance
    if (this._notifiedInstances.has(instanceId)) {
      console.log(`   ℹ️ Already notified about ${instanceId}, skipping`);
      return false;
    }

    // Check if instance still exists in Y.js and owner is still connected
    const yInstance = yInstances.get(instanceId);
    if (!yInstance) {
      console.log(`   ℹ️ Instance ${instanceId} no longer exists in Y.js`);
      return false;
    }

    // Check if owner is still present via Y.js
    const isOwnerPresent = this._checkOwnerPresence(userId);
    if (!isOwnerPresent) {
      console.log(`   ℹ️ Owner ${userName} (${userId}) is no longer connected`);
      return false;
    }

    console.log(`📬 Adding share request from ${userName}`);
    console.log(`   Instance: ${instanceId}`);
    console.log(`   Dataset: ${datasetId || 'none'}`);

    this._pendingRequests.set(instanceId, {
      instanceId,
      userName,
      userId,
      datasetId,
      timestamp: Date.now(),
    });

    this._notifiedInstances.add(instanceId);
    this._notifyListeners();
    return true;
  }

  /**
   * Remove a specific request (when accepted or manually dismissed)
   */
  removeRequest(instanceId) {
    const removed = this._pendingRequests.delete(instanceId);
    if (removed) {
      console.log(`📬 Removed share request: ${instanceId}`);
      this._notifyListeners();
    }
    return removed;
  }

  /**
   * Accept a request (create local instance)
   */
  acceptRequest(instanceId) {
    const request = this._pendingRequests.get(instanceId);
    if (!request) {
      console.warn(`⚠️ Request ${instanceId} not found`);
      return null;
    }

    console.log(`✅ Accepting share request from ${request.userName}`);
    this.removeRequest(instanceId);
    return request;
  }

  /**
   * Get all pending requests
   */
  getPendingRequests() {
    return Array.from(this._pendingRequests.values());
  }

  /**
   * Get count of pending requests
   */
  getPendingCount() {
    return this._pendingRequests.size;
  }

  /**
   * Clean up stale requests
   * Called periodically and when presence changes detected
   */
  cleanupStaleRequests() {
    console.log("🧹 ShareRequestManager: Cleaning up stale requests...");

    let removed = 0;
    const toRemove = [];

    this._pendingRequests.forEach((request, instanceId) => {
      // Check if instance still exists in Y.js
      const yInstance = yInstances.get(instanceId);
      if (!yInstance) {
        console.log(`   🗑️ Instance ${instanceId} no longer exists`);
        toRemove.push(instanceId);
        return;
      }

      // Check if owner is still present
      const isOwnerPresent = this._checkOwnerPresence(request.userId);
      if (!isOwnerPresent) {
        console.log(`   🗑️ Owner ${request.userName} disconnected`);
        toRemove.push(instanceId);
        return;
      }

      // Check for stale requests (>1 hour old)
      const age = Date.now() - request.timestamp;
      if (age > 60 * 60 * 1000) {
        console.log(`   🗑️ Request ${instanceId} is stale (${Math.round(age / 1000 / 60)}min old)`);
        toRemove.push(instanceId);
      }
    });

    toRemove.forEach(instanceId => {
      this._pendingRequests.delete(instanceId);
      removed++;
    });

    if (removed > 0) {
      console.log(`   Removed ${removed} stale request(s)`);
      this._notifyListeners();
    } else {
      console.log(`   No stale requests found`);
    }

    return removed;
  }

  /**
   * Check if a user is still present
   * Uses Y.js awareness or instance presence
   */
  _checkOwnerPresence(userId) {
    // First check: Do they have any active instances in Y.js?
    let hasActiveInstances = false;
    yInstances.forEach((instance) => {
      if (instance.userId === userId) {
        hasActiveInstances = true;
      }
    });

    if (hasActiveInstances) {
      return true;
    }

    // Second check: Are they in awareness (Y.js presence)?
    if (typeof window !== 'undefined' && window.CIA?.awareness) {
      const states = window.CIA.awareness.getStates();
      for (const [clientId, state] of states.entries()) {
        if (state.userId === userId) {
          return true;
        }
      }
    }

    // If neither check passed, user is not present
    return false;
  }

  /**
   * Subscribe to request changes
   * Returns unsubscribe function
   */
  subscribe(callback) {
    this._listeners.push(callback);

    // Immediately notify with current state
    callback({
      requests: this.getPendingRequests(),
      count: this.getPendingCount(),
    });

    return () => {
      this._listeners = this._listeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Notify all listeners of changes
   */
  _notifyListeners() {
    const data = {
      requests: this.getPendingRequests(),
      count: this.getPendingCount(),
    };

    this._listeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('ShareRequestManager: Listener error:', error);
      }
    });
  }

  /**
   * Start automatic cleanup monitoring
   * Checks every 30 seconds for stale requests
   */
  startAutoCleanup() {
    if (this._cleanupInterval) {
      console.warn('⚠️ Auto-cleanup already running');
      return;
    }

    console.log('🧹 Starting auto-cleanup (30s interval)');

    this._cleanupInterval = setInterval(() => {
      this.cleanupStaleRequests();
    }, 30000); // Every 30 seconds

    // Also cleanup when Y.js instances change
    if (typeof window !== 'undefined' && window.CIA?.yInstances) {
      this._yObserver = (event) => {
        // Check if any instances were deleted
        event.changes.keys.forEach((change, instanceId) => {
          if (change.action === 'delete') {
            this.removeRequest(instanceId);
          }
        });
      };

      window.CIA.yInstances.observe(this._yObserver);
    }
  }

  /**
   * Stop automatic cleanup
   */
  stopAutoCleanup() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
      console.log('🛑 Stopped auto-cleanup');
    }

    if (this._yObserver && window.CIA?.yInstances) {
      window.CIA.yInstances.unobserve(this._yObserver);
      this._yObserver = null;
    }
  }

  /**
   * Get debug info
   */
  getDebugInfo() {
    return {
      pendingCount: this._pendingRequests.size,
      notifiedCount: this._notifiedInstances.size,
      requests: this.getPendingRequests(),
      autoCleanupActive: !!this._cleanupInterval,
    };
  }
}

// Export singleton
export const shareRequestManager = new ShareRequestManager();

// Make available globally for debugging
if (typeof window !== 'undefined') {
  window.CIA = window.CIA || {};
  window.CIA.shareRequestManager = shareRequestManager;
}
