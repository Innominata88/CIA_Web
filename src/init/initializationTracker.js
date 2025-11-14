// src/init/initializationTracker.js
/**
 * Initialization Progress Tracker
 *
 * Tracks the progress of all initialization steps and ensures
 * the UI doesn't show until EVERYTHING is ready, preventing:
 * - Race conditions
 * - Users seeing partial state
 * - Security issues from accessing unauthorized data
 * - "No metadata" errors from datasets not synced yet
 */

class InitializationTracker {
  constructor() {
    this.steps = new Map();
    this.listeners = [];
    this.criticalFailures = [];
  }

  /**
   * Register an initialization step
   *
   * @param {string} id - Unique step identifier
   * @param {string} name - Human-readable step name
   * @param {boolean} critical - If true, failure prevents app from loading
   */
  registerStep(id, name, critical = true) {
    this.steps.set(id, {
      id,
      name,
      status: 'pending',  // pending | running | complete | failed
      critical,
      error: null,
      startTime: null,
      endTime: null,
    });
    this._notifyListeners();
  }

  /**
   * Mark step as started
   */
  startStep(id) {
    const step = this.steps.get(id);
    if (!step) {
      console.warn(`InitializationTracker: Unknown step "${id}"`);
      return;
    }

    step.status = 'running';
    step.startTime = Date.now();
    console.log(`⏳ ${step.name}...`);
    this._notifyListeners();
  }

  /**
   * Mark step as complete
   */
  completeStep(id) {
    const step = this.steps.get(id);
    if (!step) {
      console.warn(`InitializationTracker: Unknown step "${id}"`);
      return;
    }

    step.status = 'complete';
    step.endTime = Date.now();
    const duration = step.endTime - step.startTime;
    console.log(`✅ ${step.name} (${duration}ms)`);
    this._notifyListeners();
  }

  /**
   * Mark step as failed
   */
  failStep(id, error) {
    const step = this.steps.get(id);
    if (!step) {
      console.warn(`InitializationTracker: Unknown step "${id}"`);
      return;
    }

    step.status = 'failed';
    step.error = error;
    step.endTime = Date.now();

    if (step.critical) {
      this.criticalFailures.push({ step: step.name, error });
      console.error(`❌ CRITICAL: ${step.name} failed:`, error);
    } else {
      console.warn(`⚠️ ${step.name} failed (non-critical):`, error);
    }

    this._notifyListeners();
  }

  /**
   * Check if initialization is complete and successful
   */
  isReady() {
    // Check if there are any critical failures
    if (this.criticalFailures.length > 0) {
      return false;
    }

    // Check if all critical steps are complete
    for (const step of this.steps.values()) {
      if (step.critical && step.status !== 'complete') {
        return false;
      }
    }

    return true;
  }

  /**
   * Get overall progress (0-100)
   */
  getProgress() {
    const steps = Array.from(this.steps.values());
    if (steps.length === 0) return 0;

    const completed = steps.filter(s => s.status === 'complete').length;
    return Math.round((completed / steps.length) * 100);
  }

  /**
   * Get current status summary
   */
  getStatus() {
    const steps = Array.from(this.steps.values());

    return {
      total: steps.length,
      pending: steps.filter(s => s.status === 'pending').length,
      running: steps.filter(s => s.status === 'running').length,
      complete: steps.filter(s => s.status === 'complete').length,
      failed: steps.filter(s => s.status === 'failed').length,
      progress: this.getProgress(),
      isReady: this.isReady(),
      criticalFailures: this.criticalFailures,
      steps: steps.map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        critical: s.critical,
        error: s.error?.message,
        duration: s.endTime && s.startTime ? s.endTime - s.startTime : null,
      })),
    };
  }

  /**
   * Subscribe to initialization progress updates
   */
  subscribe(callback) {
    this.listeners.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners of status change
   * @private
   */
  _notifyListeners() {
    const status = this.getStatus();
    this.listeners.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('InitializationTracker: Listener error:', error);
      }
    });
  }

  /**
   * Reset tracker (for testing/retry)
   */
  reset() {
    this.steps.clear();
    this.criticalFailures = [];
    this._notifyListeners();
  }
}

// Export singleton instance
export const initTracker = new InitializationTracker();

// Make it available globally for debugging
if (typeof window !== 'undefined') {
  window.CIA = window.CIA || {};
  window.CIA.initTracker = initTracker;
}
