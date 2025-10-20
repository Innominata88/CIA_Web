# 🎯 Gaze Prediction LSTM Implementation Project Plan

Based on your codebase and the GazePrediction.md guide, here's a comprehensive plan to implement the TensorFlow.js camera-direction predictor (Option B - no webcam required).

---

## 📋 **Project Overview**

**Goal**: Implement ML-powered gaze prediction using camera movement patterns to anticipate user focus and enable predictive data prefetching.

**Approach**: TensorFlow.js LSTM model that learns from camera direction history to predict future focal points.

**Benefits**:
- 10-20% bandwidth reduction through predictive prefetching
- Reduced latency for user interactions
- No webcam/privacy concerns
- Integrates seamlessly with existing adaptive streaming

---

## 🗓️ **Implementation Phases**

### **Phase 1: Foundation Setup** (Day 1)
Set up the basic gaze predictor infrastructure and camera tracking.

#### Tasks:
1. **Create `gazePredictor` object** (replaces the undefined reference)
2. **Initialize LSTM model architecture**
3. **Set up camera movement tracking**
4. **Add logging and monitoring**

#### Code to Add:

```javascript
// ----------------------------------------------------------------------------
// ML-Powered Gaze Prediction System (Camera Direction-Based)
// ----------------------------------------------------------------------------

let gazePredictor = {
  enabled: false,
  model: null,
  history: [],
  maxHistoryLength: 30,        // 30 samples for LSTM input
  preFetchRadius: 600.0,        // Distance to prefetch
  lastPredict: 0,
  predictIntervalMs: 250,       // Predict every 250ms
  isTraining: false,
  predictionAccuracy: 0,
  prefetchQueue: new Set(),
  stats: {
    totalPredictions: 0,
    successfulPrefetches: 0,
    failedPrefetches: 0,
    averageConfidence: 0
  }
};

async function createGazeModel() {
  logProgress('Creating LSTM gaze prediction model...');
  
  const model = tf.sequential({
    name: 'gaze_predictor'
  });
  
  // LSTM layer for temporal pattern learning
  model.add(tf.layers.lstm({
    units: 32,
    inputShape: [gazePredictor.maxHistoryLength, 3],
    returnSequences: false,
    name: 'lstm_layer'
  }));
  
  // Dropout for regularization
  model.add(tf.layers.dropout({
    rate: 0.1,
    name: 'dropout_layer'
  }));
  
  // Output layer predicting next direction (dx, dy, dz)
  model.add(tf.layers.dense({
    units: 3,
    activation: 'tanh',  // Output in [-1, 1] range
    name: 'output_layer'
  }));
  
  // Compile with Adam optimizer
  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'meanSquaredError',
    metrics: ['mae']
  });
  
  logSuccess('LSTM model created successfully');
  logProgress(`Model architecture: LSTM(32) -> Dropout(0.1) -> Dense(3)`);
  
  return model;
}

async function initializeGazePrediction() {
  if (!adaptiveStreaming.enabled) {
    logWarning('Adaptive streaming disabled, skipping gaze prediction');
    return false;
  }
  
  const tfReady = await initializeTensorFlow();
  if (!tfReady) {
    logWarning('TensorFlow.js unavailable; disabling gaze predictor');
    gazePredictor.enabled = false;
    return false;
  }
  
  try {
    gazePredictor.model = await createGazeModel();
    gazePredictor.enabled = true;
    
    logSuccess('Camera-direction gaze predictor initialized');
    logInfo('Gaze prediction features:');
    logProgress('  - LSTM-based direction prediction');
    logProgress('  - Automatic prefetching of predicted focal areas');
    logProgress(`  - History window: ${gazePredictor.maxHistoryLength} samples`);
    logProgress(`  - Prediction interval: ${gazePredictor.predictIntervalMs}ms`);
    
    return true;
  } catch (error) {
    logError(`Gaze prediction initialization failed: ${error.message}`);
    gazePredictor.enabled = false;
    return false;
  }
}
```

**Integration Point**: Add to initialization in `initializeApplication()`:
```javascript
// Add after initializeAdaptiveStreaming()
await initializeGazePrediction();
```

---

### **Phase 2: Camera Tracking & Data Collection** (Day 1-2)
Implement camera movement tracking and build training data.

#### Tasks:
1. **Track camera direction changes**
2. **Build history buffer**
3. **Add validation and normalization**

#### Code to Add:

```javascript
function addCameraSample() {
  if (!gazePredictor.enabled) return;
  
  const dir = camera.getDirectionOfProjection();
  
  // Normalize direction vector
  const magnitude = Math.sqrt(dir[0]**2 + dir[1]**2 + dir[2]**2);
  const normalizedDir = [
    dir[0] / magnitude,
    dir[1] / magnitude,
    dir[2] / magnitude
  ];
  
  // Add to history
  gazePredictor.history.push(normalizedDir);
  
  // Maintain fixed window size
  if (gazePredictor.history.length > gazePredictor.maxHistoryLength) {
    gazePredictor.history.shift();
  }
  
  // Log periodically
  if (gazePredictor.history.length % 10 === 0) {
    logProgress(`Gaze history: ${gazePredictor.history.length}/${gazePredictor.maxHistoryLength} samples`);
  }
}

function getCameraVelocity() {
  if (gazePredictor.history.length < 2) return 0;
  
  const recent = gazePredictor.history.slice(-2);
  const dx = recent[1][0] - recent[0][0];
  const dy = recent[1][1] - recent[0][1];
  const dz = recent[1][2] - recent[0][2];
  
  return Math.sqrt(dx**2 + dy**2 + dz**2);
}
```

**Integration Point**: Modify camera tracking in existing code:
```javascript
// Add to existing camera.onModified() callback
camera.onModified(() => {
  addCameraSample();              // NEW: Track for gaze prediction
  maybePredictNextFocal();        // NEW: Trigger prediction
  trackCameraMovement();          // Existing
  updateFrustum();                // Existing
  performViewportCulling();       // Existing
  updateLODForAllObjects();       // Existing
});
```

---

### **Phase 3: Prediction Engine** (Day 2-3)
Implement the core LSTM prediction logic.

#### Tasks:
1. **Create prediction function**
2. **Handle edge cases**
3. **Add confidence scoring**

#### Code to Add:

```javascript
async function maybePredictNextFocal() {
  if (!gazePredictor.enabled || !gazePredictor.model) return;
  
  const now = performance.now();
  if (now - gazePredictor.lastPredict < gazePredictor.predictIntervalMs) return;
  if (gazePredictor.history.length < gazePredictor.maxHistoryLength) {
    // Not enough data yet
    return;
  }
  
  gazePredictor.lastPredict = now;
  gazePredictor.stats.totalPredictions++;
  
  try {
    const prediction = await tf.tidy(() => {
      // Create input tensor [1, timesteps, features]
      const input = tf.tensor3d([gazePredictor.history]);
      
      // Predict next direction
      const pred = gazePredictor.model.predict(input);
      
      // Get predicted direction values
      return pred.arraySync();
    });
    
    const predictedDir = prediction[0]; // [dx, dy, dz]
    
    // Calculate confidence based on camera velocity
    const velocity = getCameraVelocity();
    const confidence = Math.max(0, 1 - velocity * 10); // Lower confidence during fast movement
    
    gazePredictor.stats.averageConfidence = 
      (gazePredictor.stats.averageConfidence * 0.9) + (confidence * 0.1);
    
    // Only prefetch if confidence is high enough
    if (confidence > 0.5) {
      const camPos = camera.getPosition();
      const r = gazePredictor.preFetchRadius;
      
      const focalPoint = [
        camPos[0] + predictedDir[0] * r,
        camPos[1] + predictedDir[1] * r,
        camPos[2] + predictedDir[2] * r
      ];
      
      preFetchHighResolutionData(focalPoint, confidence);
      
      // Log occasionally
      if (gazePredictor.stats.totalPredictions % 20 === 0) {
        logProgress(`Gaze prediction: [${predictedDir.map(v => v.toFixed(3)).join(', ')}], confidence: ${(confidence * 100).toFixed(1)}%`);
      }
    }
    
  } catch (error) {
    logWarning(`Gaze prediction failed: ${error.message}`);
  }
}
```

---

### **Phase 4: Prefetching Logic** (Day 3-4)
Implement the prefetch system that uses predictions.

#### Tasks:
1. **Create prefetch function**
2. **Integrate with LOD system**
3. **Add prefetch queue management**

#### Code to Add:

```javascript
function preFetchHighResolutionData(worldPoint, confidence) {
  if (!lodSystem.enabled) return;
  
  const actors = renderer.getActors();
  let prefetchCount = 0;
  
  // Create a unique key for this prediction
  const pointKey = worldPoint.map(v => Math.round(v / 10) * 10).join(',');
  
  // Skip if already in queue
  if (gazePredictor.prefetchQueue.has(pointKey)) return;
  
  gazePredictor.prefetchQueue.add(pointKey);
  
  // Clean old entries
  if (gazePredictor.prefetchQueue.size > 50) {
    const firstKey = gazePredictor.prefetchQueue.values().next().value;
    gazePredictor.prefetchQueue.delete(firstKey);
  }
  
  for (const actor of actors) {
    const bounds = actor.getBounds();
    const center = [
      (bounds[0] + bounds[1]) / 2,
      (bounds[2] + bounds[3]) / 2,
      (bounds[4] + bounds[5]) / 2
    ];
    
    // Calculate distance to predicted focal point
    const dx = center[0] - worldPoint[0];
    const dy = center[1] - worldPoint[1];
    const dz = center[2] - worldPoint[2];
    const distance = Math.sqrt(dx**2 + dy**2 + dz**2);
    
    // Prefetch radius based on confidence
    const prefetchRadius = gazePredictor.preFetchRadius * (0.5 + confidence * 0.5);
    
    if (distance < prefetchRadius) {
      // Boost LOD for this actor
      const targetLOD = distance < prefetchRadius * 0.5 
        ? lodSystem.levels[0]  // Ultra quality
        : lodSystem.levels[1]; // High quality
      
      applyLODToActor(actor, targetLOD);
      prefetchCount++;
      gazePredictor.stats.successfulPrefetches++;
    }
  }
  
  if (prefetchCount > 0) {
    logProgress(`Prefetched ${prefetchCount} objects near predicted focus (confidence: ${(confidence * 100).toFixed(0)}%)`);
  }
  
  renderWindow.render();
}
```

---

### **Phase 5: UI Integration** (Day 4)
Add controls and monitoring for gaze prediction.

#### Code to Add to `setupDimensionalityReductionControls()`:

```javascript
// Add after adaptive streaming controls

// Gaze Prediction Toggle
const gazeRow = document.createElement('tr');
const gazeCell = document.createElement('td');
const gazeButton = document.createElement('button');
gazeButton.textContent = 'Toggle Gaze Prediction';
gazeButton.style.width = '100%';
gazeButton.style.backgroundColor = '#9C27B0';
gazeButton.style.color = 'white';
gazeButton.addEventListener('click', async () => {
  if (!gazePredictor.model) {
    await initializeGazePrediction();
  } else {
    gazePredictor.enabled = !gazePredictor.enabled;
  }
  
  const status = gazePredictor.enabled ? 'ON' : 'OFF';
  gazeButton.textContent = `Gaze Prediction: ${status}`;
  gazeButton.style.backgroundColor = gazePredictor.enabled ? '#4CAF50' : '#f44336';
  
  logInfo(`Gaze prediction ${status}`);
});
gazeCell.appendChild(gazeButton);
gazeRow.appendChild(gazeCell);
controlTable.appendChild(gazeRow);

// Gaze Stats Display
const gazeStatsRow = document.createElement('tr');
const gazeStatsCell = document.createElement('td');
const gazeStatsDisplay = document.createElement('div');
gazeStatsDisplay.id = 'gaze-stats-display';
gazeStatsDisplay.style.cssText = 'font-size: 10px; text-align: left; padding: 5px; background: #f3e5f5; border-radius: 3px; line-height: 1.4;';
gazeStatsDisplay.innerHTML = 'Gaze Stats:<br>Predictions: 0<br>Confidence: --<br>Prefetches: 0';
gazeStatsCell.appendChild(gazeStatsDisplay);
gazeStatsRow.appendChild(gazeStatsCell);
controlTable.appendChild(gazeStatsRow);

// Update gaze stats display
setInterval(() => {
  const gazeStatsDisplay = document.getElementById('gaze-stats-display');
  if (gazeStatsDisplay && gazePredictor.enabled) {
    const predictions = gazePredictor.stats.totalPredictions;
    const confidence = (gazePredictor.stats.averageConfidence * 100).toFixed(1);
    const prefetches = gazePredictor.stats.successfulPrefetches;
    const historyFill = ((gazePredictor.history.length / gazePredictor.maxHistoryLength) * 100).toFixed(0);
    
    gazeStatsDisplay.innerHTML = `
      Gaze Prediction:<br>
      Total Predictions: ${predictions}<br>
      Avg Confidence: ${confidence}%<br>
      Successful Prefetches: ${prefetches}<br>
      History Buffer: ${historyFill}%
    `;
  }
}, 1000);
```

---

### **Phase 6: Testing & Optimization** (Day 5)
Test and fine-tune the system.

#### Testing Checklist:

```javascript
// Add to window object for console testing
window.gazePredictor = gazePredictor;
window.testGazePrediction = async () => {
  logInfo('=== Gaze Prediction Test ===');
  
  // Test 1: Model existence
  logProgress(`Model exists: ${gazePredictor.model !== null}`);
  
  // Test 2: History buffer
  logProgress(`History size: ${gazePredictor.history.length}/${gazePredictor.maxHistoryLength}`);
  
  // Test 3: Prediction capability
  if (gazePredictor.history.length >= gazePredictor.maxHistoryLength) {
    await maybePredictNextFocal();
    logProgress('Prediction triggered successfully');
  } else {
    logWarning('Not enough history for prediction');
  }
  
  // Test 4: Stats
  logProgress(`Total predictions: ${gazePredictor.stats.totalPredictions}`);
  logProgress(`Avg confidence: ${(gazePredictor.stats.averageConfidence * 100).toFixed(1)}%`);
  logProgress(`Prefetches: ${gazePredictor.stats.successfulPrefetches}`);
  
  logSuccess('Gaze prediction test complete');
};
```

#### Performance Tuning:

```javascript
// Add configuration function
function configureGazePrediction(options = {}) {
  const defaults = {
    maxHistoryLength: 30,
    predictIntervalMs: 250,
    preFetchRadius: 200.0,
    minConfidence: 0.5
  };
  
  const config = { ...defaults, ...options };
  
  gazePredictor.maxHistoryLength = config.maxHistoryLength;
  gazePredictor.predictIntervalMs = config.predictIntervalMs;
  gazePredictor.preFetchRadius = config.preFetchRadius;
  gazePredictor.minConfidence = config.minConfidence;
  
  logInfo('Gaze prediction configured:');
  Object.entries(config).forEach(([key, value]) => {
    logProgress(`  ${key}: ${value}`);
  });
}

// Expose for tuning
window.configureGazePrediction = configureGazePrediction;
```

---

## 📊 **Success Metrics**

Track these metrics to validate implementation:

1. **Prediction Accuracy**: >60% of predictions should be useful
2. **Performance Impact**: <5% FPS drop when enabled
3. **Memory Usage**: <20MB additional memory
4. **Bandwidth Reduction**: 10-20% reduction through prefetching
5. **User Experience**: Smoother interactions, reduced loading times

---

## 🧪 **Testing Strategy**

### Day 5 Testing Plan:

1. **Unit Tests**:
   ```javascript
   // Test camera tracking
   // Test history buffer management
   // Test LSTM prediction
   // Test prefetch logic
   ```

2. **Integration Tests**:
   - Load large VTP file
   - Move camera in patterns (circular, linear, random)
   - Verify predictions are generated
   - Check prefetch queue management

3. **Performance Tests**:
   - Monitor FPS with/without gaze prediction
   - Check memory usage over time
   - Measure network bandwidth savings

---

## 🚀 **Deployment Checklist**

- [ ] All code integrated into `index.js`
- [ ] TensorFlow.js memory management verified
- [ ] UI controls working
- [ ] Logging comprehensive
- [ ] Performance acceptable
- [ ] Documentation updated
- [ ] Testing complete

