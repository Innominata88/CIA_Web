// For streamlined VR development install the WebXR emulator extension
// https://github.com/MozillaReality/WebXR-emulator-extension

import '@kitware/vtk.js/favicon';

// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import '@kitware/vtk.js/Rendering/Profiles/Geometry';

import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkCalculator from '@kitware/vtk.js/Filters/General/Calculator';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkWebXRRenderWindowHelper from '@kitware/vtk.js/Rendering/WebXR/RenderWindowHelper';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkXMLPolyDataReader from '@kitware/vtk.js/IO/XML/XMLPolyDataReader';
import vtkPolyDataNormals from '@kitware/vtk.js/Filters/Core/PolyDataNormals';
import vtkRemoteView from '@kitware/vtk.js/Rendering/Misc/RemoteView';
import vtkOrientationMarkerWidget from '@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget';
import vtkAnnotatedCubeActor from '@kitware/vtk.js/Rendering/Core/AnnotatedCubeActor';
import vtkInteractorStyleTrackballCamera from '@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera';

import { AttributeTypes } from '@kitware/vtk.js/Common/DataModel/DataSetAttributes/Constants';
import { FieldDataTypes } from '@kitware/vtk.js/Common/DataModel/DataSet/Constants';
import { XrSessionTypes } from '@kitware/vtk.js/Rendering/WebXR/RenderWindowHelper/Constants';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
// Force DataAccessHelper to have access to various data source
import '@kitware/vtk.js/IO/Core/DataAccessHelper/HtmlDataAccessHelper';
import '@kitware/vtk.js/IO/Core/DataAccessHelper/HttpDataAccessHelper';
import '@kitware/vtk.js/IO/Core/DataAccessHelper/JSZipDataAccessHelper';

import vtkResourceLoader from '@kitware/vtk.js/IO/Core/ResourceLoader';

//Yjs setup
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

// Custom UI controls, including button to start XR session
import controlPanel from './controller.html';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import { colorSpaceToWorking } from 'three/tsl';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import { P } from '@kitware/vtk.js/Common/Core/Math/index';
// TensorFlow.js for PCA operations
import * as tf from '@tensorflow/tfjs';

// Dynamically load WebXR polyfill from CDN for WebVR and Cardboard API backwards compatibility
if (navigator.xr === undefined) {
  vtkResourceLoader
    .loadScript(
      'https://cdn.jsdelivr.net/npm/webxr-polyfill@latest/build/webxr-polyfill.js'
    )
    .then(() => {
      // eslint-disable-next-line no-new, no-undef
      new WebXRPolyfill();
    });
}

// ----------------------------------------------------------------------------
// Logging System
// ----------------------------------------------------------------------------

let logContainer = null;
let logMessages = [];
const MAX_LOG_MESSAGES = 100;

function initializeLogging() {
  // Create log container
  logContainer = document.createElement('div');
  logContainer.id = 'log-container';
  logContainer.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    width: 400px;
    max-height: 400px;
    background: rgba(0, 0, 0, 0.9);
    color: #ffffff;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    padding: 10px;
    border-radius: 5px;
    border: 1px solid #333;
    overflow-y: auto;
    z-index: 1000;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
    display: block;
  `;
  
  // Add toggle button
  const toggleButton = document.createElement('button');
  toggleButton.textContent = 'Hide Logs';
  toggleButton.style.cssText = `
    position: fixed;
    top: 10px;
    right: 420px;
    background: #f44336;
    color: white;
    border: none;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    z-index: 1001;
  `;
  
  toggleButton.addEventListener('click', () => {
    const isVisible = logContainer.style.display !== 'none';
    logContainer.style.display = isVisible ? 'none' : 'block';
    toggleButton.textContent = isVisible ? 'Show Logs' : 'Hide Logs';
    toggleButton.style.background = isVisible ? '#4CAF50' : '#f44336';
  });
  
  // Add clear button
  const clearButton = document.createElement('button');
  clearButton.textContent = 'Clear';
  clearButton.style.cssText = `
    position: fixed;
    top: 50px;
    right: 420px;
    background: #ff9800;
    color: white;
    border: none;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    z-index: 1001;
  `;
  
  clearButton.addEventListener('click', () => {
    if (logContainer) {
      logContainer.innerHTML = '';
      logMessages = [];
      logMessage('Logs cleared', 'info');
    }
  });
  
  document.body.appendChild(logContainer);
  document.body.appendChild(toggleButton);
  document.body.appendChild(clearButton);
}

function logMessage(message, type = 'info') {
  // Always log to console
  console.log(message);
  
  if (!logContainer) return;
  
  // Add timestamp
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = `[${timestamp}] ${message}`;
  
  // Color coding based on type
  const colors = {
    info: '#ffffff',
    success: '#4CAF50',
    warning: '#ff9800',
    error: '#f44336',
    progress: '#2196F3'
  };
  
  // Create log element
  const logElement = document.createElement('div');
  logElement.style.cssText = `
    color: ${colors[type] || colors.info};
    margin-bottom: 3px;
    line-height: 1.3;
    word-wrap: break-word;
  `;
  logElement.textContent = logEntry;
  
  // Add to container
  logContainer.appendChild(logElement);
  logMessages.push(logElement);
  
  // Limit number of messages
  if (logMessages.length > MAX_LOG_MESSAGES) {
    const oldMessage = logMessages.shift();
    if (oldMessage && oldMessage.parentNode) {
      oldMessage.parentNode.removeChild(oldMessage);
    }
  }
  
  // Auto-scroll to bottom
  logContainer.scrollTop = logContainer.scrollHeight;
  
  // Auto-show container for important messages
  if (type === 'error' || type === 'warning') {
    logContainer.style.display = 'block';
  }
}

function logInfo(message) {
  logMessage(message, 'info');
}

function logSuccess(message) {
  logMessage(message, 'success');
}

function logWarning(message) {
  logMessage(message, 'warning');
}

function logError(message) {
  logMessage(message, 'error');
}

function logProgress(message) {
  logMessage(message, 'progress');
}

// ----------------------------------------------------------------------------
// TensorFlow.js Configuration and Memory Management
// ----------------------------------------------------------------------------

async function initializeTensorFlow() {
  try {
    logProgress('Initializing TensorFlow.js...');
    
    // Wait for TensorFlow.js to be ready
    await tf.ready();
    
    // Get backend info
    const backend = tf.getBackend();
    logSuccess(`TensorFlow.js ready with backend: ${backend}`);
    
    // Only set flags that actually exist and are valid
    if (backend === 'webgl') {
      try {
        // These are verified working flags for WebGL backend
        tf.env().set('WEBGL_DELETE_TEXTURE_THRESHOLD', 0);
        tf.env().set('WEBGL_FLUSH_THRESHOLD', 1);
        logInfo('WebGL optimizations applied');
      } catch (flagError) {
        logWarning(`Some WebGL flags could not be set: ${flagError.message}`);
      }
    }
    
    return true;
  } catch (error) {
    logError(`TensorFlow.js initialization failed: ${error.message}`);
    return false;
  }
}

function logMemoryUsage(context = '') {
  try {
    const tfMemory = tf.memory();
    const jsMemory = performance.memory;
    
    logProgress(`Memory ${context}:`);
    logProgress(`  TF.js: ${tfMemory.numTensors} tensors, ${(tfMemory.numBytes / 1024 / 1024).toFixed(2)}MB`);
    
    if (jsMemory) {
      const usedMB = Math.round(jsMemory.usedJSHeapSize / 1024 / 1024);
      const totalMB = Math.round(jsMemory.totalJSHeapSize / 1024 / 1024);
      const limitMB = Math.round(jsMemory.jsHeapSizeLimit / 1024 / 1024);
      logProgress(`  JS Heap: ${usedMB}MB used / ${totalMB}MB allocated (limit: ${limitMB}MB)`);
      
      if (usedMB / limitMB > 0.8) {
        logWarning(`High memory usage: ${((usedMB / limitMB) * 100).toFixed(1)}% of limit`);
      }
    }
    
    if (tfMemory.numTensors > 50) {
      logWarning(`High tensor count: ${tfMemory.numTensors} tensors active`);
    }
  } catch (error) {
    logWarning(`Could not get memory info: ${error.message}`);
  }
}

function cleanupTensors() {
  try {
    // Force TensorFlow.js cleanup
    const beforeMemory = tf.memory();
    tf.dispose();
    const afterMemory = tf.memory();
    
    const tensorDiff = beforeMemory.numTensors - afterMemory.numTensors;
    const memoryDiff = (beforeMemory.numBytes - afterMemory.numBytes) / 1024 / 1024;
    
    if (tensorDiff > 0) {
      logSuccess(`Cleanup freed ${tensorDiff} tensors and ${memoryDiff.toFixed(2)}MB`);
    }
    
    // Force garbage collection if available
    if (window.gc) {
      window.gc();
      logProgress('JavaScript garbage collection triggered');
    }
  } catch (error) {
    logWarning(`Cleanup error: ${error.message}`);
  }
}

// ----------------------------------------------------------------------------
// Network Bandwidth Monitoring System
// ----------------------------------------------------------------------------

let networkMonitor = {
  bandwidth: 0,
  connectionType: 'unknown',
  isOnline: true,
  lastUpdate: Date.now(),
  actualSpeed: 0, // Actual measured speed in Mbps
  latency: 0, // Network latency in ms
  rtt: 0, // Round trip time
  packetLoss: 0, // Packet loss percentage
  jitter: 0, // Network jitter
  speedHistory: [], // History of speed measurements
  maxHistoryLength: 10
};

function initializeNetworkMonitoring() {
  logProgress('Initializing network monitoring...');
  
  // Use Navigator Connection API if available
  if ('connection' in navigator) {
    const connection = navigator.connection;
    networkMonitor.connectionType = connection.effectiveType || 'unknown';
    networkMonitor.bandwidth = connection.downlink || 0;
    
    connection.addEventListener('change', updateNetworkStatus);
    logSuccess(`Network monitoring initialized: ${networkMonitor.connectionType}`);
  } else {
    // Fallback: Use performance API for bandwidth estimation
    logWarning('Navigator Connection API not available, using fallback method');
    startBandwidthEstimation();
  }
  
  // Monitor online/offline status
  window.addEventListener('online', () => {
    networkMonitor.isOnline = true;
    logSuccess('Network connection restored');
  });
  
  window.addEventListener('offline', () => {
    networkMonitor.isOnline = false;
    logWarning('Network connection lost');
  });

  // Always kick off active measurements to avoid 0 Mbps from some browsers
  startBandwidthEstimation();
  // Refresh bandwidth/latency periodically
  setInterval(() => {
    if (networkMonitor.isOnline) {
      performComprehensiveSpeedTest();
    }
  }, 30000);
  setInterval(() => {
    if (networkMonitor.isOnline) {
      measureNetworkLatency();
    }
  }, 10000);
}

function updateNetworkStatus() {
  const connection = navigator.connection;
  networkMonitor.connectionType = connection.effectiveType;
  networkMonitor.bandwidth = connection.downlink;
  networkMonitor.lastUpdate = Date.now();
  
  logProgress(`Network status: ${networkMonitor.connectionType}, ${networkMonitor.bandwidth}Mbps`);
  
  // Trigger adaptive streaming adjustment
  adjustStreamingQuality();

  // If downlink is 0/undefined, run active estimation
  if (!networkMonitor.bandwidth || networkMonitor.bandwidth === 0) {
    logWarning('Network Information API reported 0 Mbps; running active speed test');
    startBandwidthEstimation();
  }
}

function startBandwidthEstimation() {
  // Enhanced bandwidth estimation with multiple test sizes
  performComprehensiveSpeedTest();
}

async function performComprehensiveSpeedTest() {
  logProgress('Performing comprehensive network speed test...');
  
  const testSizes = [10, 50, 100, 200]; // KB
  const results = [];
  
  for (const sizeKB of testSizes) {
    try {
      const speed = await measureDownloadSpeed(sizeKB);
      results.push(speed);
      logProgress(`Test ${sizeKB}KB: ${speed.toFixed(2)} Mbps`);
    } catch (error) {
      logWarning(`Speed test failed for ${sizeKB}KB: ${error.message}`);
    }
  }
  
  if (results.length > 0) {
    // Use median speed for more accurate measurement
    results.sort((a, b) => a - b);
    const medianSpeed = results[Math.floor(results.length / 2)];
    const averageSpeed = results.reduce((sum, speed) => sum + speed, 0) / results.length;
    
    networkMonitor.actualSpeed = medianSpeed;
    networkMonitor.bandwidth = averageSpeed;
    networkMonitor.lastUpdate = Date.now();
    
    // Add to history
    networkMonitor.speedHistory.push({
      speed: medianSpeed,
      timestamp: Date.now()
    });
    
    // Keep only recent measurements
    if (networkMonitor.speedHistory.length > networkMonitor.maxHistoryLength) {
      networkMonitor.speedHistory.shift();
    }
    
    // Measure latency
    await measureNetworkLatency();
    
    logSuccess(`Network speed test completed: ${medianSpeed.toFixed(2)} Mbps (avg: ${averageSpeed.toFixed(2)} Mbps)`);
    logProgress(`Latency: ${networkMonitor.latency.toFixed(1)}ms, RTT: ${networkMonitor.rtt.toFixed(1)}ms`);
    
    adjustStreamingQuality();
  } else {
    logWarning('All speed tests failed, using fallback estimation');
    performFallbackSpeedTest();
  }
}

function measureDownloadSpeed(sizeKB) {
  return new Promise((resolve, reject) => {
    const testImage = new Image();
    const startTime = performance.now();
    
    testImage.onload = () => {
      const endTime = performance.now();
      const duration = (endTime - startTime) / 1000; // seconds
      const bandwidth = (sizeKB * 8) / duration; // kbps
      const speedMbps = bandwidth / 1000; // Convert to Mbps
      resolve(speedMbps);
    };
    
    testImage.onerror = () => {
      reject(new Error('Image load failed'));
    };
    
    // Create a larger test image for more accurate measurement
    const canvas = document.createElement('canvas');
    canvas.width = Math.sqrt(sizeKB * 1024 / 3) * 2; // Approximate size
    canvas.height = Math.sqrt(sizeKB * 1024 / 3) * 2;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    testImage.src = canvas.toDataURL('image/jpeg', 0.8);
  });
}

async function measureNetworkLatency() {
  try {
    const startTime = performance.now();
    
    // Simple ping to measure latency
    const response = await fetch(window.location.href, {
      method: 'HEAD',
      cache: 'no-cache'
    });
    
    const endTime = performance.now();
    networkMonitor.latency = endTime - startTime;
    networkMonitor.rtt = networkMonitor.latency * 2; // Approximate RTT
    
    // Estimate jitter (simplified)
    if (networkMonitor.speedHistory.length > 1) {
      const speeds = networkMonitor.speedHistory.map(h => h.speed);
      const avgSpeed = speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
      const variance = speeds.reduce((sum, speed) => sum + Math.pow(speed - avgSpeed, 2), 0) / speeds.length;
      networkMonitor.jitter = Math.sqrt(variance);
    }
    
  } catch (error) {
    logWarning(`Latency measurement failed: ${error.message}`);
    networkMonitor.latency = 100; // Default fallback
    networkMonitor.rtt = 200;
  }
}

function performFallbackSpeedTest() {
  // Fallback to original method
  const testImage = new Image();
  const startTime = performance.now();
  
  testImage.onload = () => {
    const endTime = performance.now();
    const duration = (endTime - startTime) / 1000; // seconds
    const sizeKB = 50; // Approximate test image size
    const bandwidth = (sizeKB * 8) / duration; // kbps
    
    networkMonitor.actualSpeed = bandwidth / 1000; // Convert to Mbps
    networkMonitor.bandwidth = networkMonitor.actualSpeed;
    networkMonitor.lastUpdate = Date.now();
    
    logProgress(`Fallback bandwidth estimation: ${networkMonitor.actualSpeed.toFixed(2)} Mbps`);
    adjustStreamingQuality();
  };
  
  testImage.src = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';
}

function getNetworkQuality() {
  if (!networkMonitor.isOnline) return 'offline';
  if (networkMonitor.actualSpeed > 10) return 'high';
  if (networkMonitor.actualSpeed > 5) return 'medium';
  if (networkMonitor.actualSpeed > 1) return 'low';
  return 'very-low';
}


// ----------------------------------------------------------------------------
// Visual Quality Change Notifications
// ----------------------------------------------------------------------------

// Show visual quality change notification
function showQualityChange(newQuality) {
  // Create floating quality indicator
  const qualityIndicator = document.createElement('div');
  qualityIndicator.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${newQuality === 'high' ? '#4CAF50' : newQuality === 'medium' ? '#FF9800' : '#f44336'};
    color: white;
    padding: 10px 15px;
    border-radius: 5px;
    font-weight: bold;
    font-size: 14px;
    z-index: 1000;
    box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    animation: fadeInOut 3s ease-in-out;
    border: 2px solid ${newQuality === 'high' ? '#2E7D32' : newQuality === 'medium' ? '#F57C00' : '#C62828'};
  `;
  qualityIndicator.textContent = `🎯 Quality: ${newQuality.toUpperCase()}`;
  document.body.appendChild(qualityIndicator);
  
  // Add CSS animation if not already present
  if (!document.getElementById('quality-animation-style')) {
    const style = document.createElement('style');
    style.id = 'quality-animation-style';
    style.textContent = `
      @keyframes fadeInOut {
        0% { opacity: 0; transform: translateY(-20px); }
        20% { opacity: 1; transform: translateY(0); }
        80% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-20px); }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Remove after 3 seconds
  setTimeout(() => {
    if (qualityIndicator.parentNode) {
      qualityIndicator.parentNode.removeChild(qualityIndicator);
    }
  }, 3000);
}


// ----------------------------------------------------------------------------
// Viewport Culling (Frustum Culling) System
// ----------------------------------------------------------------------------

let viewportCuller = {
  enabled: true,
  frustum: null,
  visibleObjects: new Set(),
  cullingStats: {
    totalObjects: 0,
    visibleObjects: 0,
    culledObjects: 0
  }
};

function initializeViewportCulling() {
  logProgress('Initializing viewport culling system...');
  
  // Set up camera change observer
  camera.onModified(() => {
    updateFrustum();
    performViewportCulling();
  });
  
  // Initial frustum setup
  updateFrustum();
  
  logSuccess('Viewport culling system initialized');
}

function updateFrustum() {
  // Get camera frustum planes
  const planes = camera.getFrustumPlanes();
  viewportCuller.frustum = planes;
  
  logProgress('Camera frustum updated');
}

function isObjectInFrustum(objectBounds) {
  if (!viewportCuller.frustum || !viewportCuller.enabled) return true;
  
  const [xMin, xMax, yMin, yMax, zMin, zMax] = objectBounds;
  const planes = viewportCuller.frustum;
  
  // Check against all 6 frustum planes
  for (let i = 0; i < 6; i++) {
    const plane = planes[i];
    const [a, b, c, d] = plane;
    
    // Test all 8 corners of the bounding box
    const corners = [
      [xMin, yMin, zMin], [xMax, yMin, zMin],
      [xMin, yMax, zMin], [xMax, yMax, zMin],
      [xMin, yMin, zMax], [xMax, yMin, zMax],
      [xMin, yMax, zMax], [xMax, yMax, zMax]
    ];
    
    let allCornersOutside = true;
    for (const corner of corners) {
      const distance = a * corner[0] + b * corner[1] + c * corner[2] + d;
      if (distance >= 0) {
        allCornersOutside = false;
        break;
      }
    }
    
    if (allCornersOutside) return false;
  }
  
  return true;
}

function performViewportCulling() {
  if (!viewportCuller.enabled) return;
  
  const actors = renderer.getActors();
  let visibleCount = 0;
  let totalCount = actors.length;
  
  viewportCuller.visibleObjects.clear();
  
  for (let i = 0; i < actors.length; i++) {
    const actor = actors[i];
    const bounds = actor.getBounds();
    
    if (isObjectInFrustum(bounds)) {
      actor.setVisibility(true);
      viewportCuller.visibleObjects.add(actor);
      visibleCount++;
    } else {
      actor.setVisibility(false);
    }
  }
  
  // Update statistics
  viewportCuller.cullingStats = {
    totalObjects: totalCount,
    visibleObjects: visibleCount,
    culledObjects: totalCount - visibleCount
  };
  
  const cullingRatio = ((totalCount - visibleCount) / totalCount * 100).toFixed(1);
  logProgress(`Viewport culling: ${visibleCount}/${totalCount} objects visible (${cullingRatio}% culled)`);
  
  renderWindow.render();
}

function toggleViewportCulling() {
  viewportCuller.enabled = !viewportCuller.enabled;
  logInfo(`Viewport culling ${viewportCuller.enabled ? 'enabled' : 'disabled'}`);
  
  if (viewportCuller.enabled) {
    performViewportCulling();
  } else {
    // Show all objects
    const actors = renderer.getActors();
    actors.forEach(actor => actor.setVisibility(true));
    renderWindow.render();
  }
}

// ----------------------------------------------------------------------------
// Level of Detail (LOD) System
// ----------------------------------------------------------------------------

let lodSystem = {
  enabled: true,
  levels: [
    { distance: 0, resolution: 1.0, name: 'Ultra', color: '#4CAF50' },
    { distance: 50, resolution: 0.6, name: 'High', color: '#8BC34A' },    // More dramatic reduction
    { distance: 100, resolution: 0.3, name: 'Medium', color: '#FF9800' }, // Much lower quality
    { distance: 200, resolution: 0.1, name: 'Low', color: '#FF5722' },    // Very low quality
    { distance: 500, resolution: 0.05, name: 'Very Low', color: '#f44336' } // Extremely low
  ],
  currentLOD: {},
  lodStats: {
    totalObjects: 0,
    ultraCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    veryLowCount: 0
  }
};

function initializeLODSystem() {
  logProgress('Initializing LOD system...');
  
  // Set up camera change observer for LOD updates
  camera.onModified(() => {
    updateLODForAllObjects();
  });
  
  logSuccess('LOD system initialized');
}

function calculateDistanceToCamera(objectPosition) {
  const cameraPos = camera.getPosition();
  const dx = objectPosition[0] - cameraPos[0];
  const dy = objectPosition[1] - cameraPos[1];
  const dz = objectPosition[2] - cameraPos[2];
  
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function getLODLevel(distance) {
  for (let i = lodSystem.levels.length - 1; i >= 0; i--) {
    if (distance >= lodSystem.levels[i].distance) {
      return lodSystem.levels[i];
    }
  }
  return lodSystem.levels[0]; // Default to highest quality
}

function updateLODForAllObjects() {
  if (!lodSystem.enabled) return;
  
  const actors = renderer.getActors();
  const stats = {
    totalObjects: actors.length,
    ultraCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    veryLowCount: 0
  };
  
  for (const actor of actors) {
    const bounds = actor.getBounds();
    const center = [
      (bounds[0] + bounds[1]) / 2,
      (bounds[2] + bounds[3]) / 2,
      (bounds[4] + bounds[5]) / 2
    ];
    
    const distance = calculateDistanceToCamera(center);
    const lodLevel = getLODLevel(distance);
    
    // Apply LOD to actor
    applyLODToActor(actor, lodLevel);
    
    // Update statistics
    switch (lodLevel.name) {
      case 'Ultra': stats.ultraCount++; break;
      case 'High': stats.highCount++; break;
      case 'Medium': stats.mediumCount++; break;
      case 'Low': stats.lowCount++; break;
      case 'Very Low': stats.veryLowCount++; break;
    }
  }
  
  lodSystem.lodStats = stats;
  
  logProgress(`LOD distribution: Ultra(${stats.ultraCount}) High(${stats.highCount}) Medium(${stats.mediumCount}) Low(${stats.lowCount}) VeryLow(${stats.veryLowCount})`);
}

function applyLODToActor(actor, lodLevel) {
  // Adjust actor properties based on LOD level
  const property = actor.getProperty();
  
  // Adjust point size for point clouds
  if (property.getRepresentation() === 0) { // Points
    property.setPointSize(property.getPointSize() * lodLevel.resolution);
  }
  
  // Adjust line width for wireframes
  if (property.getRepresentation() === 1) { // Wireframe
    property.setLineWidth(property.getLineWidth() * lodLevel.resolution);
  }
  
  // For surface rendering, we could adjust tessellation level
  // This would require more complex geometry processing
  
  // Store current LOD level
  lodSystem.currentLOD[actor] = lodLevel;
}

function toggleLODSystem() {
  lodSystem.enabled = !lodSystem.enabled;
  logInfo(`LOD system ${lodSystem.enabled ? 'enabled' : 'disabled'}`);
  
  if (lodSystem.enabled) {
    updateLODForAllObjects();
  } else {
    // Reset all actors to full quality
    const actors = renderer.getActors();
    actors.forEach(actor => {
      const property = actor.getProperty();
      property.setPointSize(property.getPointSize() / lodSystem.currentLOD[actor]?.resolution || 1);
      property.setLineWidth(property.getLineWidth() / lodSystem.currentLOD[actor]?.resolution || 1);
    });
    renderWindow.render();
  }
}

// ----------------------------------------------------------------------------
// Adaptive Streaming Controller
// ----------------------------------------------------------------------------

let adaptiveStreaming = {
  enabled: true,
  qualityLevel: 'auto', // auto, high, medium, low
  targetFPS: 60,
  currentFPS: 0,
  frameCount: 0,
  lastFPSCheck: Date.now(),
  smartMode: true, // Enable smart adaptive streaming
  lastCameraMove: Date.now(),
  streamingStats: {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageLatency: 0,
    bandwidthUtilization: 0
  }
};

// Configurable weighting system
let adaptiveWeights = {
  network: 0.4,
  fps: 0.3,
  memory: 0.3
};

function initializeAdaptiveStreaming() {
  logProgress('Initializing adaptive streaming controller...');
  
  // Set up FPS monitoring
  startFPSMonitoring();
  
  // Set up adaptive quality adjustment
  startAdaptiveQualityAdjustment();
  
  logSuccess('Adaptive streaming controller initialized');
}

function startFPSMonitoring() {
  let lastTime = performance.now();
  
  function measureFPS() {
    const currentTime = performance.now();
    const deltaTime = currentTime - lastTime;
    
    adaptiveStreaming.frameCount++;
    
    if (adaptiveStreaming.frameCount % 60 === 0) { // Check every 60 frames
      const fps = 1000 / (deltaTime / adaptiveStreaming.frameCount);
      adaptiveStreaming.currentFPS = fps;
      
      // Throttle FPS log to every 5s
if (!adaptiveStreaming._lastFPSLog) adaptiveStreaming._lastFPSLog = 0;
const now = performance.now();
if (now - adaptiveStreaming._lastFPSLog >= 50000) {
  logProgress(`Current FPS: ${fps.toFixed(1)} (target: ${adaptiveStreaming.targetFPS})`);
  adaptiveStreaming._lastFPSLog = now;
}


      // Adjust quality based on FPS
      if (fps < adaptiveStreaming.targetFPS * 0.8) {
        decreaseStreamingQuality();
      } else if (fps > adaptiveStreaming.targetFPS * 1.1) {
        increaseStreamingQuality();
      }
      
      adaptiveStreaming.frameCount = 0;
    }
    
    lastTime = currentTime;
    requestAnimationFrame(measureFPS);
  }
  
  requestAnimationFrame(measureFPS);
}

function startAdaptiveQualityAdjustment() {
  setInterval(() => {
    if (!adaptiveStreaming.enabled) return;
    
    adjustStreamingQuality();
  }, 10000); // Check every second
}

// Performance scoring functions for intelligent adaptive streaming
function getNetworkScore(quality) {
  switch (quality) {
    case 'high': return 100;
    case 'medium': return 70;
    case 'low': return 40;
    case 'very-low': return 20;
    default: return 50;
  }
}

function getFPSScore(fpsRatio) {
  if (fpsRatio >= 0.9) return 100;
  if (fpsRatio >= 0.7) return 70;
  if (fpsRatio >= 0.5) return 40;
  return 20;
}

function getMemoryScore(memoryUsage) {
  if (memoryUsage < 0.5) return 100;
  if (memoryUsage < 0.7) return 70;
  if (memoryUsage < 0.85) return 40;
  return 20;
}

// Configurable weighting system functions
function setAdaptiveWeights(weights) {
  // Validate weights sum to 1.0
  const total = weights.network + weights.fps + weights.memory;
  if (Math.abs(total - 1.0) > 0.01) {
    logWarning(`Weights must sum to 1.0, got ${total.toFixed(3)}. Normalizing...`);
    const normalizedWeights = {
      network: weights.network / total,
      fps: weights.fps / total,
      memory: weights.memory / total
    };
    adaptiveWeights = normalizedWeights;
  } else {
    adaptiveWeights = weights;
  }
  
  logInfo(`Updated adaptive weights: Network(${adaptiveWeights.network.toFixed(2)}) FPS(${adaptiveWeights.fps.toFixed(2)}) Memory(${adaptiveWeights.memory.toFixed(2)})`);
  
  // Update dropdown selection if it exists
  updateWeightsDropdownSelection();
}

// Update dropdown selection based on current weights
function updateWeightsDropdownSelection() {
  const weightsSelect = document.getElementById('adaptive-weights-selector');
  if (!weightsSelect) return;
  
  // Find matching optimization type based on current weights
  const currentWeights = adaptiveWeights;
  let selectedValue = 'balanced'; // Default
  
  // Check for exact matches with tolerance
  const tolerance = 0.01;
  
  if (Math.abs(currentWeights.network - 0.6) < tolerance && 
      Math.abs(currentWeights.fps - 0.2) < tolerance && 
      Math.abs(currentWeights.memory - 0.2) < tolerance) {
    selectedValue = 'network';
  } else if (Math.abs(currentWeights.network - 0.3) < tolerance && 
             Math.abs(currentWeights.fps - 0.4) < tolerance && 
             Math.abs(currentWeights.memory - 0.3) < tolerance) {
    selectedValue = 'performance';
  } else if (Math.abs(currentWeights.network - 0.4) < tolerance && 
             Math.abs(currentWeights.fps - 0.3) < tolerance && 
             Math.abs(currentWeights.memory - 0.3) < tolerance) {
    selectedValue = 'mobile';
  }
  
  weightsSelect.value = selectedValue;
}

// Enhanced performance metrics display
function updatePerformanceMetrics() {
  const metrics = {
    quality: adaptiveStreaming.qualityLevel,
    fps: adaptiveStreaming.currentFPS,
    network: getNetworkQuality(),
    memory: getMemoryUsageRatio(),
    weights: adaptiveWeights,
    optimizations: {
      viewportCulling: viewportCuller.enabled,
      lod: lodSystem.enabled,
      gazePrediction: typeof gazePredictor !== 'undefined' && gazePredictor.enabled
    }
  };
  
  // Console logging for debugging
  console.log('📈 Performance Metrics:', metrics);
  
  // Log optimization status
  const activeOptimizations = [];
  if (metrics.optimizations.viewportCulling) activeOptimizations.push('ViewportCulling');
  if (metrics.optimizations.lod) activeOptimizations.push('LOD');
  if (metrics.optimizations.gazePrediction) activeOptimizations.push('GazePrediction');
  
  // Only log when the set of active optimizations changes
  const list = activeOptimizations.join(', ');
  if (list !== adaptiveStreaming._lastActiveOptimizations) {
    if (activeOptimizations.length > 0) {
      logProgress(`🔧 Active optimizations: ${list}`);
    }
    adaptiveStreaming._lastActiveOptimizations = list;
  }
  
  return metrics;
}

// Preset weight configurations for different scenarios
function setNetworkConstrainedWeights() {
  setAdaptiveWeights({
    network: 0.6,    // Higher weight for network
    fps: 0.2,        // Lower weight for FPS
    memory: 0.2      // Lower weight for memory
  });
}

function setHighPerformanceWeights() {
  setAdaptiveWeights({
    network: 0.3,    // Lower weight for network
    fps: 0.4,        // Higher weight for FPS
    memory: 0.3      // Equal weight for memory
  });
}

function setMobileWeights() {
  setAdaptiveWeights({
    network: 0.4,    // Network still important
    fps: 0.3,        // FPS important for battery
    memory: 0.3      // Memory critical on mobile
  });
}

function setBalancedWeights() {
  setAdaptiveWeights({
    network: 0.4,    // Default balanced weights
    fps: 0.3,
    memory: 0.3
  });
}

// Dynamic weight adjustment based on context
function adjustWeightsBasedOnContext() {
  const networkQuality = getNetworkQuality();
  const fpsRatio = adaptiveStreaming.currentFPS / adaptiveStreaming.targetFPS;
  const memoryUsage = getMemoryUsageRatio();
  
  // Auto-adjust weights based on current conditions
  if (networkQuality === 'low' || networkQuality === 'very-low') {
    // Network is the bottleneck, increase its weight
    setAdaptiveWeights({
      network: 0.5,
      fps: 0.25,
      memory: 0.25
    });
    logInfo('Auto-adjusted weights: Network priority due to poor connection');
  } else if (fpsRatio < 0.5) {
    // FPS is the bottleneck, increase its weight
    setAdaptiveWeights({
      network: 0.3,
      fps: 0.5,
      memory: 0.2
    });
    logInfo('Auto-adjusted weights: FPS priority due to poor performance');
  } else if (memoryUsage > 0.8) {
    // Memory is the bottleneck, increase its weight
    setAdaptiveWeights({
      network: 0.3,
      fps: 0.2,
      memory: 0.5
    });
    logInfo('Auto-adjusted weights: Memory priority due to high usage');
  }
}

function adjustStreamingQuality() {
  // Use smart adaptive streaming if enabled
  if (adaptiveStreaming.smartMode) {
    smartAdaptiveStreaming();
    return;
  }
  
  // Fallback to traditional scoring-based approach
  const networkQuality = getNetworkQuality();
  const fpsRatio = adaptiveStreaming.currentFPS / adaptiveStreaming.targetFPS;
  const memoryUsage = getMemoryUsageRatio();
  
  // Calculate weighted performance score (0-100)
  const networkScore = getNetworkScore(networkQuality);
  const fpsScore = getFPSScore(fpsRatio);
  const memoryScore = getMemoryScore(memoryUsage);
  
  // Use configurable weights
  const overallScore = (networkScore * adaptiveWeights.network) + 
                      (fpsScore * adaptiveWeights.fps) + 
                      (memoryScore * adaptiveWeights.memory);
  
  // Determine quality level based on overall score
  let newQuality;
  if (overallScore >= 80) {
    newQuality = 'high';
  } else if (overallScore >= 60) {
    newQuality = 'medium';
  } else {
    newQuality = 'low';
  }
  
  if (newQuality !== adaptiveStreaming.qualityLevel) {
    applyStreamingQuality(newQuality);
    adaptiveStreaming.qualityLevel = newQuality;
    
    logInfo(`Streaming quality adjusted: ${adaptiveStreaming.qualityLevel} (Score: ${overallScore.toFixed(1)})`);
    logProgress(`Performance breakdown: Network(${networkScore}) FPS(${fpsScore}) Memory(${memoryScore})`);
  }
}

function applyStreamingQuality(quality) {
  const networkQuality = getNetworkQuality();
  const fpsRatio = adaptiveStreaming.currentFPS / adaptiveStreaming.targetFPS;
  const memoryUsage = getMemoryUsageRatio();
  
  // Component-specific optimization based on individual metrics
  switch (quality) {
    case 'high':
      // High performance scenario: Enable all features
      viewportCuller.enabled = true;
      lodSystem.enabled = true;
      if (typeof gazePredictor !== 'undefined') {
        gazePredictor.enabled = true;
      }
      adaptiveStreaming.targetFPS = 60;
      break;
      
    case 'medium':
      // Balanced scenario: Selective optimization
      viewportCuller.enabled = true;
      lodSystem.enabled = true;
      if (typeof gazePredictor !== 'undefined') {
        gazePredictor.enabled = (networkQuality === 'high' && fpsRatio > 0.8);
      }
      adaptiveStreaming.targetFPS = 45;
      break;
      
    case 'low':
      // Constrained scenario: Focus on essential optimizations
      viewportCuller.enabled = true;  // Always enable for bandwidth reduction
      lodSystem.enabled = (memoryUsage > 0.7 || fpsRatio < 0.7);
      if (typeof gazePredictor !== 'undefined') {
        gazePredictor.enabled = false;  // Disable ML to save resources
      }
      adaptiveStreaming.targetFPS = 30;
      break;
  }
  
  // Apply quality settings
  if (viewportCuller.enabled) { 
    performViewportCulling();
  }
  
  if (lodSystem.enabled) {
    updateLODForAllObjects();
  }
  
  // Show visual quality change notification
  showQualityChange(quality);
  
  // Log optimization status
  const optimizations = [];
  if (viewportCuller.enabled) optimizations.push('ViewportCulling');
  if (lodSystem.enabled) optimizations.push('LOD');
  if (typeof gazePredictor !== 'undefined' && gazePredictor.enabled) optimizations.push('GazePrediction');
  
  // Enhanced logging with performance impact
  const impact = {
    'high': 'All optimizations enabled',
    'medium': 'Core optimizations enabled', 
    'low': 'Essential optimizations only'
  };
  
  logInfo(`🔄 Quality changed: ${adaptiveStreaming.qualityLevel} → ${quality.toUpperCase()}`);
  logInfo(`📊 Impact: ${impact[quality]}`);
  logProgress(`Active optimizations: ${optimizations.join(', ')} | Target FPS: ${adaptiveStreaming.targetFPS}`);
  
  renderWindow.render();
}

// Smart adaptive streaming with context-aware optimization
function smartAdaptiveStreaming() {
  // Auto-adjust weights based on context
  adjustWeightsBasedOnContext();
  
  const metrics = {
    network: getNetworkQuality(),
    fps: adaptiveStreaming.currentFPS,
    memory: getMemoryUsageRatio(),
    userActivity: getUserActivityLevel()
  };
  
  logProgress(`Smart adaptive analysis: Network(${metrics.network}) FPS(${metrics.fps.toFixed(1)}) Memory(${(metrics.memory * 100).toFixed(1)}%)`);
  
  // Different strategies for different scenarios
  if (metrics.network === 'high' && metrics.fps > 50) {
    // High performance scenario: Enable all features
    enableAllOptimizations();
  } else if (metrics.network === 'low' && metrics.memory > 0.8) {
    // Constrained scenario: Focus on bandwidth reduction
    enableBandwidthOptimization();
  } else if (metrics.fps < 30) {
    // Performance critical: Focus on rendering optimization
    enablePerformanceOptimization();
  } else {
    // Balanced scenario: Selective optimization
    enableBalancedOptimization();
  }
}

function enableAllOptimizations() {
  viewportCuller.enabled = true;
  lodSystem.enabled = true;
  if (typeof gazePredictor !== 'undefined') {
    gazePredictor.enabled = true;
  }
  adaptiveStreaming.targetFPS = 60;
  logInfo('High performance mode: All optimizations enabled');
}

function enableBandwidthOptimization() {
  viewportCuller.enabled = true;    // Reduce data transmission
  lodSystem.enabled = true;         // Reduce quality for distant objects
  if (typeof gazePredictor !== 'undefined') {
    gazePredictor.enabled = false;  // Disable ML to save resources
  }
  adaptiveStreaming.targetFPS = 30; // Lower FPS target
  logInfo('Bandwidth optimization mode: Focus on data reduction');
}

function enablePerformanceOptimization() {
  viewportCuller.enabled = true;    // Reduce rendering load
  lodSystem.enabled = true;        // Reduce geometry complexity
  if (typeof gazePredictor !== 'undefined') {
    gazePredictor.enabled = false; // Disable ML processing
  }
  adaptiveStreaming.targetFPS = 30; // Lower FPS target
  logInfo('Performance optimization mode: Focus on rendering efficiency');
}

function enableBalancedOptimization() {
  viewportCuller.enabled = true;   // Moderate culling
  lodSystem.enabled = true;        // Moderate LOD
  if (typeof gazePredictor !== 'undefined') {
    gazePredictor.enabled = true;   // Enable ML for better UX
  }
  adaptiveStreaming.targetFPS = 45; // Balanced FPS target
  logInfo('Balanced optimization mode: Selective feature activation');
}

// ----------------------------------------------------------------------------
// Gaze Prediction (TF.js camera motion-based)
// ----------------------------------------------------------------------------
let gazePredictor = {
  enabled: false,
  model: null,
  history: [],
  maxHistoryLength: 30,
  preFetchRadius: 200.0,
  lastPredict: 0,
  predictIntervalMs: 250,
  prefetchQueue: new Set(),
  stats: {
    totalPredictions: 0,
    successfulPrefetches: 0,
    averageConfidence: 0
  }
};

async function createGazeModel() {
  const model = tf.sequential();
  model.add(tf.layers.lstm({ units: 32, inputShape: [gazePredictor.maxHistoryLength, 3] }));
  model.add(tf.layers.dropout({ rate: 0.1 }));
  model.add(tf.layers.dense({ units: 3, activation: 'tanh' }));
  model.compile({ optimizer: 'adam', loss: 'meanSquaredError' });
  return model;
}

async function initializeGazePrediction() {
  try {
    const tfReady = await initializeTensorFlow();
    if (!tfReady) {
      logWarning('TensorFlow.js unavailable; disabling gaze predictor');
      gazePredictor.enabled = false;
      return false;
    }
    gazePredictor.model = await createGazeModel();
    gazePredictor.enabled = true;
    logSuccess('Gaze predictor initialized');
    return true;
  } catch (error) {
    logError(`Gaze predictor init failed: ${error.message}`);
    gazePredictor.enabled = false;
    return false;
  }
}

function addCameraSample() {
  if (!gazePredictor.enabled) return;

  const dir = camera.getDirectionOfProjection();
  const m = Math.sqrt(dir[0]*dir[0] + dir[1]*dir[1] + dir[2]*dir[2]) || 1;
  const nd = [dir[0]/m, dir[1]/m, dir[2]/m];

  const pos = camera.getPosition();
  gazePredictor.history.push({ dir: nd, pos: [pos[0], pos[1], pos[2]] });

  if (gazePredictor.history.length > gazePredictor.maxHistoryLength) {
    gazePredictor.history.shift();
  }
}

function getCameraVelocity() {
  const h = gazePredictor.history;
  if (h.length < 2) return 0;

  const a = h[h.length - 2];
  const b = h[h.length - 1];

  // Angular component via direction change
  const dot = Math.max(-1, Math.min(1, a.dir[0]*b.dir[0] + a.dir[1]*b.dir[1] + a.dir[2]*b.dir[2]));
  const angle = Math.acos(dot); // radians
  const angularScaled = angle / Math.PI; // 0..1

  // Positional component via world translation
  const dx = b.pos[0] - a.pos[0];
  const dy = b.pos[1] - a.pos[1];
  const dz = b.pos[2] - a.pos[2];
  const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

  // Heuristic scaling by scene size
  const base = gazePredictor.preFetchRadius || 200;
  const posScaled = Math.min(1, dist / base);

  // Blend
  return 0.6 * angularScaled + 0.4 * posScaled; // ~0..1
}

async function maybePredictNextFocal() {
  if (!gazePredictor.enabled || !gazePredictor.model) return;
  const now = performance.now();
  if (now - gazePredictor.lastPredict < gazePredictor.predictIntervalMs) return;
  if (gazePredictor.history.length < gazePredictor.maxHistoryLength) return;

  gazePredictor.lastPredict = now;
  gazePredictor.stats.totalPredictions++;
  try {
    // Build numeric sequence [T, 3] from history objects
    const seq = gazePredictor.history.map(h => h.dir);
    // Pad if needed (safety) then trim to window
    while (seq.length < gazePredictor.maxHistoryLength) {
      seq.unshift(seq[0] ?? [0, 0, 1]);
    }
    const trimmed = seq.slice(-gazePredictor.maxHistoryLength);

    // Predict next direction
    const prediction = await tf.tidy(() => {
      const input = tf.tensor3d([trimmed]); // [1, T, 3]
      const out = gazePredictor.model.predict(input);
      return out.arraySync();
    });

    const d = prediction[0];
    const velocity = getCameraVelocity();
    const confidence = Math.max(0, 1 - velocity);
    gazePredictor.stats.averageConfidence = (gazePredictor.stats.averageConfidence * 0.9) + (confidence * 0.1);

    // Lower threshold so we actually prefetch during motion
    if (confidence > 0.3) {
      const camPos = camera.getPosition();
      const r = gazePredictor.preFetchRadius;
      const focal = [camPos[0] + d[0] * r, camPos[1] + d[1] * r, camPos[2] + d[2] * r];
      preFetchHighResolutionData(focal, confidence);
      if (gazePredictor.stats.totalPredictions % 20 === 0) {
        logProgress(`Gaze prediction: [${d.map((v) => v.toFixed(3)).join(', ')}], conf: ${(confidence * 100).toFixed(1)}%`);
      }
    }
  } catch (e) {
    logWarning(`Gaze prediction failed: ${e.message}`);
  }
}

function preFetchHighResolutionData(worldPoint, confidence) {
  if (!lodSystem.enabled) return;

  const actors = renderer.getActors();
  if (!actors || actors.length === 0) return;

  // Snap focal to nearest actor center so we always target something
  let nearest = null;
  let bestD2 = Infinity;
  for (const actor of actors) {
    const b = actor.getBounds();
    const c = [(b[0]+b[1])/2, (b[2]+b[3])/2, (b[4]+b[5])/2];
    const dx = c[0]-worldPoint[0], dy = c[1]-worldPoint[1], dz = c[2]-worldPoint[2];
    const d2 = dx*dx + dy*dy + dz*dz;
    if (d2 < bestD2) { bestD2 = d2; nearest = { actor, center: c }; }
  }
  const snappedPoint = nearest ? nearest.center : worldPoint;

  // Deduplicate work with a small queue
  const key = snappedPoint.map(v => Math.round(v/10)*10).join(',');
  if (gazePredictor.prefetchQueue.has(key)) return;
  gazePredictor.prefetchQueue.add(key);
  if (gazePredictor.prefetchQueue.size > 50) {
    const oldest = gazePredictor.prefetchQueue.values().next().value;
    gazePredictor.prefetchQueue.delete(oldest);
  }

  let boosted = 0;
  const baseRadius = gazePredictor.preFetchRadius;
  const prefetchRadius = baseRadius * (0.7 + confidence * 0.6); // a bit wider than before

  for (const actor of actors) {
    const b = actor.getBounds();
    const c = [(b[0]+b[1])/2, (b[2]+b[3])/2, (b[4]+b[5])/2];
    const dx = c[0]-snappedPoint[0], dy = c[1]-snappedPoint[1], dz = c[2]-snappedPoint[2];
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (dist < prefetchRadius) {
      const targetLOD = dist < prefetchRadius * 0.5 ? lodSystem.levels[0] : lodSystem.levels[1];
      applyLODToActor(actor, targetLOD);
      boosted++;
    }
  }

  if (boosted > 0) {
    gazePredictor.stats.successfulPrefetches += boosted;
    logProgress(`Prefetched ${boosted} objects near predicted focus`);
    renderWindow.render();
  }
}

function getUserActivityLevel() {
  // Simple user activity detection based on camera movement
  // This could be enhanced with more sophisticated activity detection
  const cameraPos = camera.getPosition();
  const timeSinceLastMove = Date.now() - (adaptiveStreaming.lastCameraMove || Date.now());
  
  if (timeSinceLastMove < 1000) return 'active';
  if (timeSinceLastMove < 5000) return 'moderate';
  return 'idle';
}

function increaseStreamingQuality() {
  if (adaptiveStreaming.qualityLevel === 'low') {
    applyStreamingQuality('medium');
    adaptiveStreaming.qualityLevel = 'medium';
  } else if (adaptiveStreaming.qualityLevel === 'medium') {
    applyStreamingQuality('high');
    adaptiveStreaming.qualityLevel = 'high';
  }
}

function decreaseStreamingQuality() {
  if (adaptiveStreaming.qualityLevel === 'high') {
    applyStreamingQuality('medium');
    adaptiveStreaming.qualityLevel = 'medium';
  } else if (adaptiveStreaming.qualityLevel === 'medium') {
    applyStreamingQuality('low');
    adaptiveStreaming.qualityLevel = 'low';
  }
}

function getMemoryUsageRatio() {
  if (performance.memory) {
    return performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit;
  }
  return 0.5; // Default assumption
}

function toggleAdaptiveStreaming() {
  adaptiveStreaming.enabled = !adaptiveStreaming.enabled;
  logInfo(`Adaptive streaming ${adaptiveStreaming.enabled ? 'enabled' : 'disabled'}`);
  
  if (adaptiveStreaming.enabled) {
    adjustStreamingQuality();
  }
}

function toggleSmartMode() {
  adaptiveStreaming.smartMode = !adaptiveStreaming.smartMode;
  logInfo(`Smart adaptive streaming ${adaptiveStreaming.smartMode ? 'enabled' : 'disabled'}`);
  
  if (adaptiveStreaming.enabled) {
    adjustStreamingQuality();
  }
}

// Track camera movement for user activity detection
function trackCameraMovement() {
  adaptiveStreaming.lastCameraMove = Date.now();
}

// ----------------------------------------------------------------------------
// PCA Implementation using TensorFlow.js
// ----------------------------------------------------------------------------

async function performPCA(pointsMatrix, numComponents = 3) {
  const numPoints = pointsMatrix.length;
  const numDimensions = pointsMatrix[0].length;
  
  logInfo(`Starting PCA on ${numPoints.toLocaleString()} points`);
  logProgress(`Input: ${numDimensions}D -> ${numComponents}D`);
  logMemoryUsage('before PCA');
  
  try {
    // Use tf.tidy for automatic memory management
    const result = await tf.tidy(() => {
      logProgress('Creating data tensor...');
      
      // Convert to tensor
      const dataTensor = tf.tensor2d(pointsMatrix);
      logProgress(`Data tensor shape: [${dataTensor.shape.join(', ')}]`);
      
      // Center the data
      logProgress('Centering data...');
      const mean = tf.mean(dataTensor, 0);
      const centeredData = tf.sub(dataTensor, mean);
      
      // For large datasets or when we want 3 specific dimensions, use variance-based selection
      if (numPoints > 5000 || numComponents === 3) {
        return performVarianceBasedPCA(centeredData, numComponents);
      } else {
        // For smaller datasets, use SVD-based PCA for better quality
        return performSVDBasedPCA(centeredData, numComponents);
      }
    });
    
    logSuccess('PCA completed successfully');
    logMemoryUsage('after PCA');
    
    return result;
    
  } catch (error) {
    logError(`PCA failed: ${error.message}`);
    logMemoryUsage('after PCA error');
    
    // Clean up and try a fallback method
    cleanupTensors();
    throw error;
  }
}

function performVarianceBasedPCA(centeredData, numComponents) {
  logProgress('Using variance-based PCA approach...');
  
  const [numSamples, numFeatures] = centeredData.shape;
  
  // Compute covariance matrix
  const transposed = tf.transpose(centeredData);
  const covariance = tf.div(
    tf.matMul(transposed, centeredData),
    tf.scalar(numSamples - 1)
  );
  
  // Extract variances (diagonal elements)
  const covarianceArray = covariance.arraySync();
  const variances = [];
  
  for (let i = 0; i < covarianceArray.length; i++) {
    variances.push({ 
      index: i, 
      variance: covarianceArray[i][i] 
    });
  }
  
  // Sort by variance (descending)
  variances.sort((a, b) => b.variance - a.variance);
  
  // Select top components
  const selectedDims = variances.slice(0, Math.min(numComponents, variances.length));
  
  logProgress('Selected dimensions with highest variance:');
  selectedDims.forEach((dim, i) => {
    logProgress(`  ${i + 1}. Dimension ${dim.index}: variance = ${dim.variance.toFixed(6)}`);
  });
  
  // Extract selected dimensions
  const centeredArray = centeredData.arraySync();
  const transformedData = [];
  
  for (let i = 0; i < centeredArray.length; i++) {
    const transformedPoint = [];
    for (const dim of selectedDims) {
      transformedPoint.push(centeredArray[i][dim.index]);
    }
    
    // Pad with zeros if needed for 3D visualization
    while (transformedPoint.length < 3) {
      transformedPoint.push(0);
    }
    
    transformedData.push(transformedPoint);
  }
  
  // Calculate explained variance ratio
  const totalVariance = variances.reduce((sum, v) => sum + v.variance, 0);
  const explainedVariance = selectedDims.reduce((sum, v) => sum + v.variance, 0);
  const explainedRatio = (explainedVariance / totalVariance * 100).toFixed(2);
  
  logProgress(`Explained variance ratio: ${explainedRatio}%`);
  
  return transformedData;
}

function performSVDBasedPCA(centeredData, numComponents) {
  logProgress('Using SVD-based PCA approach...');
  
  try {
    // Perform SVD decomposition
    const svd = tf.linalg.svd(centeredData, false, true);
    const { s, v } = svd;
    
    // Select principal components (first numComponents columns of V)
    const principalComponents = tf.slice(v, [0, 0], [-1, numComponents]);
    
    // Transform data
    const transformed = tf.matMul(centeredData, principalComponents);
    
    // Convert to JavaScript array
    let transformedData = transformed.arraySync();
    
    // Pad with zeros if needed for 3D visualization
    if (numComponents === 2) {
      transformedData = transformedData.map(point => [...point, 0]);
    }
    
    // Calculate explained variance from singular values
    const singularValues = s.arraySync();
    const explainedVariance = singularValues.slice(0, numComponents);
    const totalVariance = singularValues.reduce((sum, val) => sum + val * val, 0);
    const explainedRatio = (explainedVariance.reduce((sum, val) => sum + val * val, 0) / totalVariance * 100).toFixed(2);
    
    logProgress(`SVD PCA explained variance ratio: ${explainedRatio}%`);
    
    return transformedData;
    
  } catch (svdError) {
    logWarning(`SVD failed, falling back to variance-based approach: ${svdError.message}`);
    return performVarianceBasedPCA(centeredData, numComponents);
  }
}

// ----------------------------------------------------------------------------
// t-SNE Implementation (Pure JavaScript)
// ----------------------------------------------------------------------------

// Helper functions for debugging t-SNE
function getDataRange(data) {
  if (!data || data.length === 0) return 'empty';
  
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    for (let j = 0; j < data[i].length; j++) {
      if (data[i][j] < min) min = data[i][j];
      if (data[i][j] > max) max = data[i][j];
    }
  }
  return `[${min.toFixed(4)}, ${max.toFixed(4)}]`;
}

function getDistanceRange(distances) {
  if (!distances || distances.length === 0) return 'empty';
  
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < distances.length; i++) {
    for (let j = 0; j < distances[i].length; j++) {
      if (i !== j) {
        if (distances[i][j] < min) min = distances[i][j];
        if (distances[i][j] > max) max = distances[i][j];
      }
    }
  }
  return `[${min.toFixed(4)}, ${max.toFixed(4)}]`;
}

async function performTSNE(pointsMatrix, numComponents = 2, options = {}) {
  const { 
    perplexity = 10.0, 
    maxIterations = 300,
    learningRate = 100.0 
  } = options;
  
  const numPoints = pointsMatrix.length;
  
  logInfo(`Starting t-SNE on ${numPoints.toLocaleString()} points`);
  logProgress(`Parameters: perplexity=${perplexity}, iterations=${maxIterations}`);
  
  // For very large datasets, subsample
  const MAX_TSNE_POINTS = 1000;
  let processedMatrix = pointsMatrix;
  let needsInterpolation = false;
  
  if (numPoints > MAX_TSNE_POINTS) {
    logWarning(`Large dataset: ${numPoints.toLocaleString()} points`);
    logProgress(`Subsampling to ${MAX_TSNE_POINTS} points for t-SNE computation`);
    
    const step = Math.floor(numPoints / MAX_TSNE_POINTS);
    processedMatrix = [];
    for (let i = 0; i < numPoints; i += step) {
      if (processedMatrix.length < MAX_TSNE_POINTS) {
        processedMatrix.push(pointsMatrix[i]);
      }
    }
    needsInterpolation = true;
    logProgress(`Sampled ${processedMatrix.length} points for analysis`);
  }
  
  try {
    const result = await runTSNE(processedMatrix, numComponents, {
      perplexity: Math.min(perplexity, Math.floor(processedMatrix.length / 6)),
      maxIterations,
      learningRate
    });
    
    if (needsInterpolation) {
      logProgress(`Interpolating results to all ${numPoints.toLocaleString()} points`);
      return interpolateResults(pointsMatrix, processedMatrix, result, numComponents);
    }
    
    logSuccess('t-SNE completed successfully');
    return result;
    
  } catch (error) {
    logError(`t-SNE failed: ${error.message}`);
    logWarning('Falling back to PCA...');
    return await performPCA(pointsMatrix, numComponents);
  }
}

async function runTSNE(points, numComponents, options) {
  const { perplexity, maxIterations, learningRate } = options;
  const n = points.length;
  const numDims = points[0].length;
  
  logProgress(`Running t-SNE on ${n} points with ${numDims} dimensions...`);
  logProgress(`Target output: ${numComponents}D`);
  
  try {
    // Initialize embedding randomly with larger initial values
    let Y = Array.from({ length: n }, () =>
      Array.from({ length: numComponents }, () => (Math.random() - 0.5) * 2.0)
    );
    
    logProgress(`Initial embedding range: ${getDataRange(Y)}`);
    
    // Compute pairwise distances
    logProgress('Computing pairwise distances...');
    const distances = computePairwiseDistances(points);
    logProgress(`Distance matrix computed, range: ${getDistanceRange(distances)}`);
    
    // Compute P matrix (affinities in high-dimensional space)
    logProgress('Computing probability matrix...');
    const P = await computePMatrix(distances, perplexity);
    logProgress(`P matrix computed, checking for valid probabilities...`);
    
    // Validate P matrix
    let pSum = 0;
    let validPs = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (P[i][j] > 0 && !isNaN(P[i][j])) {
          pSum += P[i][j];
          validPs++;
        }
      }
    }
    logProgress(`P matrix validation: ${validPs} valid entries, sum = ${pSum.toFixed(6)}`);
    
    if (validPs === 0) {
      throw new Error('P matrix contains no valid probabilities');
    }
    
    // Optimize embedding using gradient descent
    logProgress('Optimizing embedding...');
    Y = await optimizeEmbedding(Y, P, learningRate, maxIterations);
    
    logProgress(`Final embedding range: ${getDataRange(Y)}`);
    
    // Validate final embedding
    for (let i = 0; i < Y.length; i++) {
      for (let j = 0; j < Y[i].length; j++) {
        if (isNaN(Y[i][j]) || !isFinite(Y[i][j])) {
          logError(`NaN or infinite value detected at position [${i}][${j}]: ${Y[i][j]}`);
          throw new Error('t-SNE produced invalid results');
        }
      }
    }
    
    // Ensure 3D output for visualization
    if (numComponents === 2) {
      for (let i = 0; i < n; i++) {
        Y[i].push(0);
      }
      logProgress('Padded 2D result to 3D with Z=0');
    }
    
    logSuccess(`t-SNE completed successfully with ${Y.length} points in ${Y[0].length}D`);
    return Y;
    
  } catch (error) {
    logError(`t-SNE failed during execution: ${error.message}`);
    throw error;
  }
}

function computePairwiseDistances(points) {
  const n = points.length;
  const numDims = points[0].length;
  const distances = new Array(n);
  
  for (let i = 0; i < n; i++) {
    distances[i] = new Array(n);
    for (let j = 0; j < n; j++) {
      if (i === j) {
        distances[i][j] = 0;
      } else {
        let dist = 0;
        for (let d = 0; d < numDims; d++) {
          const diff = points[i][d] - points[j][d];
          dist += diff * diff;
        }
        distances[i][j] = Math.sqrt(dist);
      }
    }
  }
  
  return distances;
}

async function computePMatrix(distances, perplexity) {
  const n = distances.length;
  const P = new Array(n);
  const targetEntropy = Math.log2(perplexity);
  
  logProgress(`Computing P matrix with target perplexity: ${perplexity}`);
  
  // Compute P matrix with binary search for optimal sigma
  for (let i = 0; i < n; i++) {
    P[i] = new Array(n);
    
    // Binary search for optimal sigma (bandwidth)
    let sigma = 1.0;
    let sigmaMin = 1e-20;
    let sigmaMax = 1e20;
    let bestProbs = null;
    
    // Try to find good initial sigma value
    const sortedDistances = distances[i].filter((d, j) => j !== i).sort((a, b) => a - b);
    const medianDist = sortedDistances[Math.floor(sortedDistances.length / 2)];
    sigma = Math.max(medianDist / 2, 1e-10);
    
    for (let iter = 0; iter < 50; iter++) {
      let sum = 0;
      const probs = new Array(n);
      
      // Compute probabilities with current sigma
      for (let j = 0; j < n; j++) {
        if (i === j) {
          probs[j] = 0;
        } else {
          const exp_val = Math.exp(-distances[i][j] * distances[i][j] / (2 * sigma * sigma));
          probs[j] = exp_val;
          sum += exp_val;
        }
      }
      
      // Normalize probabilities
      if (sum > 1e-50) {
        for (let j = 0; j < n; j++) {
          if (i !== j) {
            probs[j] /= sum;
          }
        }
      } else {
        // If sum is too small, use uniform probabilities
        const uniform_prob = 1.0 / (n - 1);
        for (let j = 0; j < n; j++) {
          probs[j] = (i === j) ? 0 : uniform_prob;
        }
      }
      
      // Compute entropy
      let entropy = 0;
      for (let j = 0; j < n; j++) {
        if (probs[j] > 1e-50) {
          entropy -= probs[j] * Math.log2(probs[j]);
        }
      }
      
      const entropyDiff = entropy - targetEntropy;
      
      // Check convergence
      if (Math.abs(entropyDiff) < 1e-5 || iter === 49) {
        for (let j = 0; j < n; j++) {
          P[i][j] = Math.max(probs[j], 1e-50); // Prevent zeros
        }
        bestProbs = probs;
        break;
      }
      
      // Adjust sigma - if entropy is too high, increase sigma; if too low, decrease sigma
      if (entropyDiff > 0) {
        sigmaMin = sigma;
        if (sigmaMax === 1e20) {
          sigma = sigma * 2;
        } else {
          sigma = (sigma + sigmaMax) / 2;
        }
      } else {
        sigmaMax = sigma;
        sigma = (sigma + sigmaMin) / 2;
      }
      
      // Prevent sigma from getting too small or too large
      sigma = Math.max(Math.min(sigma, 1e10), 1e-10);
    }
    
    // Progress update
    if (i % 25 === 0) {
      const progress = ((i / n) * 100).toFixed(1);
      logProgress(`  P matrix computation: ${progress}%`);
      
      // Yield control periodically
      if (i % 50 === 0 && i > 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }
  }
  
  // Symmetrize P matrix and normalize
  let totalSum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      P[i][j] = (P[i][j] + P[j][i]) / 2;
      if (i !== j) {
        totalSum += P[i][j];
      }
    }
  }
  
  // Normalize by total sum and ensure minimum values
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        P[i][j] = 0;
      } else {
        P[i][j] = Math.max(P[i][j] / totalSum, 1e-12);
      }
    }
  }
  
  logProgress(`P matrix completed, total sum after normalization: ${totalSum.toFixed(6)}`);
  
  return P;
}

async function optimizeEmbedding(Y, P, learningRate, maxIterations) {
  const n = Y.length;
  const numComponents = Y[0].length;
  let momentum = Array.from({ length: n }, () => Array(numComponents).fill(0));
  
  logProgress(`Starting embedding optimization: ${n} points, ${numComponents}D, ${maxIterations} iterations`);
  
  for (let iter = 0; iter < maxIterations; iter++) {
    // Compute Q matrix (affinities in low-dimensional space)
    let sumQ = 0;
    const Q = new Array(n);
    
    for (let i = 0; i < n; i++) {
      Q[i] = new Array(n);
      for (let j = 0; j < n; j++) {
        if (i === j) {
          Q[i][j] = 0;
        } else {
          let dist = 0;
          for (let d = 0; d < numComponents; d++) {
            const diff = Y[i][d] - Y[j][d];
            dist += diff * diff;
          }
          Q[i][j] = 1 / (1 + dist);
          sumQ += Q[i][j];
        }
      }
    }
    
    // Normalize Q matrix
    if (sumQ > 1e-50) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          Q[i][j] /= sumQ;
          Q[i][j] = Math.max(Q[i][j], 1e-12);
        }
      }
    } else {
      logWarning(`Very small sumQ at iteration ${iter}: ${sumQ}`);
    }
    
    // Compute gradient
    const gradient = Array.from({ length: n }, () => Array(numComponents).fill(0));
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          const pij = P[i][j];
          const qij = Q[i][j];
          const factor = 4 * (pij - qij) * qij * sumQ;
          
          for (let d = 0; d < numComponents; d++) {
            gradient[i][d] += factor * (Y[i][d] - Y[j][d]);
          }
        }
      }
    }
    
    // Update embedding with momentum
    const momentumFactor = iter < 20 ? 0.5 : 0.8;
    const currentLR = iter < 100 ? learningRate * 4 : learningRate;
    
    // Check for problematic gradients
    let maxGrad = 0;
    for (let i = 0; i < n; i++) {
      for (let d = 0; d < numComponents; d++) {
        maxGrad = Math.max(maxGrad, Math.abs(gradient[i][d]));
      }
    }
    
    // Clip gradients if they're too large
    const gradClip = 5.0;
    if (maxGrad > gradClip) {
      const clipFactor = gradClip / maxGrad;
      for (let i = 0; i < n; i++) {
        for (let d = 0; d < numComponents; d++) {
          gradient[i][d] *= clipFactor;
        }
      }
      if (iter % 50 === 0) {
        logProgress(`  Clipped gradients at iteration ${iter}, max grad was ${maxGrad.toFixed(4)}`);
      }
    }
    
    // Apply momentum and gradients
    for (let i = 0; i < n; i++) {
      for (let d = 0; d < numComponents; d++) {
        if (isFinite(gradient[i][d])) {
          momentum[i][d] = momentumFactor * momentum[i][d] - currentLR * gradient[i][d];
          Y[i][d] += momentum[i][d];
          
          // Check for NaN or infinite values
          if (!isFinite(Y[i][d])) {
            logError(`NaN/Inf detected at iteration ${iter}, point ${i}, dimension ${d}`);
            Y[i][d] = (Math.random() - 0.5) * 0.1; // Reset to small random value
          }
        }
      }
    }
    
    // Center embedding
    for (let d = 0; d < numComponents; d++) {
      const mean = Y.reduce((sum, point) => sum + point[d], 0) / n;
      for (let i = 0; i < n; i++) {
        Y[i][d] -= mean;
      }
    }
    
    // Progress update with diagnostic info
    if (iter % 25 === 0) {
      const progress = ((iter / maxIterations) * 100).toFixed(1);
      const yRange = getDataRange(Y);
      logProgress(`  t-SNE optimization: ${progress}% (iter ${iter}), Y range: ${yRange}, max grad: ${maxGrad.toFixed(4)}`);
      
      // Yield control periodically
      if (iter % 50 === 0 && iter > 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }
  }
  
  logProgress(`Optimization completed. Final embedding range: ${getDataRange(Y)}`);
  return Y;
}

// ----------------------------------------------------------------------------
// TensorFlow.js UMAP Implementation
// ----------------------------------------------------------------------------

async function performUMAP(pointsMatrix, numComponents = 2, options = {}) {
  const {
    nNeighbors = 8,
    minDist = 0.1,
    nEpochs = 200
  } = options;
  
  const numPoints = pointsMatrix.length;
  
  logInfo(`Starting TensorFlow.js UMAP on ${numPoints.toLocaleString()} points`);
  logProgress(`Parameters: neighbors=${nNeighbors}, min_dist=${minDist}, epochs=${nEpochs}`);
  logMemoryUsage('before UMAP');
  
  // For very large datasets, subsample
  const MAX_UMAP_POINTS = 800;
  let processedMatrix = pointsMatrix;
  let needsInterpolation = false;
  
  if (numPoints > MAX_UMAP_POINTS) {
    logWarning(`Large dataset: ${numPoints.toLocaleString()} points`);
    logProgress(`Subsampling to ${MAX_UMAP_POINTS} points for UMAP computation`);
    
    const step = Math.floor(numPoints / MAX_UMAP_POINTS);
    processedMatrix = [];
    for (let i = 0; i < numPoints; i += step) {
      if (processedMatrix.length < MAX_UMAP_POINTS) {
        processedMatrix.push(pointsMatrix[i]);
      }
    }
    needsInterpolation = true;
    logProgress(`Sampled ${processedMatrix.length} points for analysis`);
  }
  
  try {
    const result = await runTensorFlowUMAP(processedMatrix, numComponents, {
      nNeighbors: Math.min(nNeighbors, Math.floor(processedMatrix.length / 4)),
      minDist,
      nEpochs
    });
    
    if (needsInterpolation) {
      logProgress(`Interpolating results to all ${numPoints.toLocaleString()} points`);
      return interpolateResults(pointsMatrix, processedMatrix, result, numComponents);
    }
    
    logSuccess('TensorFlow.js UMAP completed successfully');
    logMemoryUsage('after UMAP');
    return result;
    
  } catch (error) {
    logError(`TensorFlow.js UMAP failed: ${error.message}`);
    logWarning('Falling back to PCA...');
    cleanupTensors();
    return await performPCA(pointsMatrix, numComponents);
  }
}

async function runTensorFlowUMAP(points, numComponents, options) {
  const { nNeighbors, minDist, nEpochs } = options;
  const n = points.length;
  
  logProgress(`Running TensorFlow.js UMAP on ${n} points...`);
  
  return await tf.tidy(() => {
    try {
      // Convert input to tensor
      const X = tf.tensor2d(points);
      logProgress(`Input tensor shape: [${X.shape.join(', ')}]`);
      
      // Build k-nearest neighbor graph using TensorFlow.js
      logProgress('Building k-NN graph with TensorFlow.js...');
      const knnGraph = buildTensorKNNGraph(X, nNeighbors);
      
      // Build fuzzy topological representation
      logProgress('Building fuzzy graph...');
      const fuzzyEdges = buildTensorFuzzyGraph(knnGraph, n);
      
      // Initialize embedding with larger spread for UMAP
      const embedding = tf.variable(tf.randomNormal([n, numComponents], 0, 10.0));
      logProgress(`Initial embedding tensor shape: [${embedding.shape.join(', ')}]`);
      
      // Optimize embedding using TensorFlow.js
      logProgress('Optimizing embedding with TensorFlow.js...');
      const finalEmbedding = optimizeTensorUMAPEmbedding(embedding, fuzzyEdges, minDist, nEpochs);
      
      // Convert back to JavaScript array
      const resultArray = finalEmbedding.arraySync();
      
      // Ensure 3D output for visualization
      if (numComponents === 2) {
        for (let i = 0; i < resultArray.length; i++) {
          resultArray[i].push(0);
        }
        logProgress('Padded 2D result to 3D with Z=0');
      }
      
      logSuccess(`TensorFlow.js UMAP completed with ${resultArray.length} points in ${resultArray[0].length}D`);
      return resultArray;
      
    } catch (error) {
      logError(`TensorFlow.js UMAP failed during execution: ${error.message}`);
      throw error;
    }
  });
}

function buildTensorKNNGraph(X, k) {
  return tf.tidy(() => {
    const n = X.shape[0];
    logProgress(`Building k-NN graph for ${n} points with k=${k}...`);
    
    // Compute pairwise distances using TensorFlow.js
    const XSquaredNorms = tf.sum(tf.square(X), 1, true);
    const XSquaredNormsT = tf.transpose(XSquaredNorms);
    const XTX = tf.matMul(X, X, false, true);
    
    const distances = tf.sqrt(tf.maximum(
      tf.add(tf.add(XSquaredNorms, XSquaredNormsT), tf.mul(XTX, -2)),
      1e-10
    ));
    
    // Convert to JavaScript for k-nearest neighbor selection (complex indexing)
    const distancesArray = distances.arraySync();
    const knnGraph = new Array(n);
    
    for (let i = 0; i < n; i++) {
      const neighbors = [];
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          neighbors.push({ index: j, distance: distancesArray[i][j] });
        }
      }
      
      // Sort by distance and take k nearest
      neighbors.sort((a, b) => a.distance - b.distance);
      knnGraph[i] = neighbors.slice(0, k);
      
      if (i % 50 === 0) {
        logProgress(`  k-NN graph: ${((i / n) * 100).toFixed(1)}%`);
      }
    }
    
    logProgress(`k-NN graph completed`);
    return knnGraph;
  });
}

function buildTensorFuzzyGraph(knnGraph, n) {
  logProgress('Building fuzzy graph representation...');
  
  const fuzzyEdges = [];
  
  // Compute fuzzy set memberships
  for (let i = 0; i < n; i++) {
    const neighbors = knnGraph[i];
    if (neighbors.length === 0) continue;
    
    // Use median distance as scale parameter
    const distances = neighbors.map(neighbor => neighbor.distance);
    distances.sort((a, b) => a - b);
    const sigma = Math.max(distances[Math.floor(distances.length / 2)], 1e-10);
    
    // Compute memberships using exponential kernel
    for (const neighbor of neighbors) {
      const membership = Math.exp(-neighbor.distance / sigma);
      if (membership > 0.01) {
        fuzzyEdges.push({
          from: i,
          to: neighbor.index,
          weight: membership
        });
      }
    }
  }
  
  // Symmetrize the graph using fuzzy set union
  const edgeMap = new Map();
  for (const edge of fuzzyEdges) {
    const key1 = `${edge.from}-${edge.to}`;
    const key2 = `${edge.to}-${edge.from}`;
    
    if (!edgeMap.has(key1)) edgeMap.set(key1, 0);
    if (!edgeMap.has(key2)) edgeMap.set(key2, 0);
    
    edgeMap.set(key1, edgeMap.get(key1) + edge.weight);
    edgeMap.set(key2, edgeMap.get(key2) + edge.weight);
  }
  
  const symmetrizedEdges = [];
  const processedPairs = new Set();
  
  for (const [key, weight] of edgeMap) {
    const [from, to] = key.split('-').map(Number);
    const pairKey = from < to ? `${from}-${to}` : `${to}-${from}`;
    
    if (!processedPairs.has(pairKey)) {
      processedPairs.add(pairKey);
      const reverseKey = `${to}-${from}`;
      const reverseWeight = edgeMap.get(reverseKey) || 0;
      
      // Fuzzy set union: a + b - a*b
      const combinedWeight = weight + reverseWeight - weight * reverseWeight;
      
      if (combinedWeight > 0.01) {
        symmetrizedEdges.push({
          from: Math.min(from, to),
          to: Math.max(from, to),
          weight: combinedWeight
        });
      }
    }
  }
  
  logProgress(`Fuzzy graph completed with ${symmetrizedEdges.length} edges`);
  return symmetrizedEdges;
}

function optimizeTensorUMAPEmbedding(embedding, fuzzyEdges, minDist, nEpochs) {
  return tf.tidy(() => {
    const n = embedding.shape[0];
    const numComponents = embedding.shape[1];
    const learningRate = 1.0;
    
    // UMAP curve parameters
    const a = tf.scalar(1.0 / minDist);
    const b = tf.scalar(1.0);
    
    logProgress(`Starting TensorFlow.js UMAP optimization: ${n} points, ${numComponents}D, ${nEpochs} epochs`);
    
    for (let epoch = 0; epoch < nEpochs; epoch++) {
      const alpha = tf.scalar(learningRate * (1 - epoch / nEpochs));
      
      // Process attractive forces from fuzzy graph edges
      for (const edge of fuzzyEdges) {
        const { from, to, weight } = edge;
        
        // Get point positions
        const pointFrom = tf.slice(embedding, [from, 0], [1, numComponents]);
        const pointTo = tf.slice(embedding, [to, 0], [1, numComponents]);
        
        // Compute distance
        const diff = tf.sub(pointFrom, pointTo);
        const distSq = tf.sum(tf.square(diff));
        const dist = tf.sqrt(tf.add(distSq, tf.scalar(1e-10)));
        
        // Attractive force using UMAP's curve
        const attractiveForce = tf.mul(
          tf.mul(tf.scalar(weight), alpha),
          tf.div(tf.scalar(1), tf.add(tf.scalar(1), tf.mul(a, distSq)))
        );
        
        // Compute gradients
        const gradDirection = tf.div(diff, dist);
        const grad = tf.mul(attractiveForce, gradDirection);
        
        // Update positions
        const updateFrom = tf.neg(grad);
        const updateTo = grad;
        
        // Apply updates
        const newPointFrom = tf.add(pointFrom, updateFrom);
        const newPointTo = tf.add(pointTo, updateTo);
        
        // Update embedding tensor
        embedding = tf.scatterND([[from]], newPointFrom, embedding.shape);
        embedding = tf.scatterND([[to]], newPointTo, embedding.shape);
      }
      
      // Sample some repulsive forces to maintain global structure
      const nRepulsive = Math.min(fuzzyEdges.length, 100);
      for (let rep = 0; rep < nRepulsive; rep++) {
        const i = Math.floor(Math.random() * n);
        const j = Math.floor(Math.random() * n);
        if (i === j) continue;
        
        const pointI = tf.slice(embedding, [i, 0], [1, numComponents]);
        const pointJ = tf.slice(embedding, [j, 0], [1, numComponents]);
        
        const diff = tf.sub(pointI, pointJ);
        const distSq = tf.sum(tf.square(diff));
        const dist = tf.sqrt(tf.add(distSq, tf.scalar(1e-10)));
        
        // Check if points are too close for repulsion
        const tooClose = tf.less(distSq, tf.scalar(4 * minDist * minDist));
        
        if (tooClose.dataSync()[0]) {
          // Repulsive force
          const repulsiveForce = tf.mul(
            tf.mul(alpha, b),
            tf.div(tf.scalar(1), tf.add(tf.scalar(1), tf.mul(a, distSq)))
          );
          
          const gradDirection = tf.div(diff, dist);
          const grad = tf.mul(repulsiveForce, gradDirection);
          
          // Apply repulsive updates
          const newPointI = tf.add(pointI, grad);
          const newPointJ = tf.sub(pointJ, grad);
          
          embedding = tf.scatterND([[i]], newPointI, embedding.shape);
          embedding = tf.scatterND([[j]], newPointJ, embedding.shape);
        }
      }
      
      // Progress update
      if (epoch % 25 === 0) {
        const progress = ((epoch / nEpochs) * 100).toFixed(1);
        logProgress(`  TensorFlow.js UMAP optimization: ${progress}% (epoch ${epoch})`);
      }
    }
    
    logProgress('TensorFlow.js UMAP optimization completed');
    return embedding;
  });
}

// ----------------------------------------------------------------------------
// Result Interpolation for Large Datasets
// ----------------------------------------------------------------------------

function interpolateResults(allPoints, sampledPoints, sampledResult, numComponents) {
  logProgress(`Interpolating to ${allPoints.length.toLocaleString()} points...`);
  
  const result = [];
  const BATCH_SIZE = 1000;
  
  for (let batchStart = 0; batchStart < allPoints.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, allPoints.length);
    
    for (let i = batchStart; i < batchEnd; i++) {
      const point = allPoints[i];
      
      // Find nearest sample point (simplified search)
      let minDist = Infinity;
      let nearestIdx = 0;
      
      // Check every 10th sample point for efficiency
      const checkStep = Math.max(1, Math.floor(sampledPoints.length / 50));
      
      for (let j = 0; j < sampledPoints.length; j += checkStep) {
        let dist = 0;
        for (let d = 0; d < point.length; d++) {
          const diff = point[d] - sampledPoints[j][d];
          dist += diff * diff;
        }
        
        if (dist < minDist) {
          minDist = dist;
          nearestIdx = j;
        }
      }
      
      // Use nearest sample result with small random offset
      const interpolatedPoint = [...sampledResult[nearestIdx]];
      for (let d = 0; d < interpolatedPoint.length; d++) {
        interpolatedPoint[d] += (Math.random() - 0.5) * 0.02;
      }
      
      // Ensure 3D output
      while (interpolatedPoint.length < 3) {
        interpolatedPoint.push(0);
      }
      
      result.push(interpolatedPoint);
    }
    
    // Progress update
    if (batchStart % (BATCH_SIZE * 5) === 0) {
      const progress = ((batchEnd / allPoints.length) * 100).toFixed(1);
      logProgress(`  Interpolation: ${progress}%`);
    }
  }
  
  return result;
}

// ----------------------------------------------------------------------------
// Standard VTK.js Setup
// ----------------------------------------------------------------------------

const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
  background: [0, 0, 0],
});
const renderer = fullScreenRenderer.getRenderer();
const renderWindow = fullScreenRenderer.getRenderWindow();
const XRHelper = vtkWebXRRenderWindowHelper.newInstance({
  renderWindow: fullScreenRenderer.getApiSpecificRenderWindow(),
  drawControllersRay: true,
});
const interactor = renderWindow.getInteractor();
const camera = renderer.getActiveCamera();

// ----------------------------------------------------------------------------
// Data Variables
// ----------------------------------------------------------------------------

const vtpReader = vtkXMLPolyDataReader.newInstance();
let originalPointsData = null;
let reductionApplied = false;
let reductionMethod = 'pca';
let reductionComponents = 3;

let axes = null
let axesPosition = null;

let currentActor = null;

const source = vtpReader.getOutputData(0);
const mapper = vtkMapper.newInstance();
const actor = vtkActor.newInstance();

actor.setMapper(mapper);

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

// ----------------------------------------------------------------------------
//  Set up Yjs doc + provider
// ----------------------------------------------------------------------------

const ydoc = new Y.Doc();
const provider = new WebsocketProvider('ws://localhost:8080', 'vtk-room', ydoc);
const yActor = ydoc.getMap('actor');
const yFile = ydoc.getMap('fileData');
const yReduction = ydoc.getMap('reduction');

let isLocalFileLoad = false;


// ----------------------------------------------------------------------------
// Yjs Observer: File Data
// ----------------------------------------------------------------------------

yFile.observe(event => {
  if(isLocalFileLoad){
    isLocalFileLoad = false;
    return;
  }

  const b64 = yFile.get('polydata');
  if (b64) {
    const binary = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
    updateScene(binary);
  }
});

// ----------------------------------------------------------------------------
// Yjs Observer: Actor Orientation and Representation
// ----------------------------------------------------------------------------

yActor.observe(event => {
  if (!currentActor) return;

  const orient = yActor.get('orientation');
  if (orient) {
    currentActor.setOrientation(...orient);

    if (axes) {
      axes.setOrientation(...orient);
      axes.setPosition(...axesPosition);
    }
    const cameraPos = yActor.get('cameraPosition');
    if(cameraPos){
      camera.setPosition(...cameraPos);
    }
    const cameraFocal = yActor.get('cameraFocalPoint');
    if(cameraFocal){
      camera.setFocalPoint(...cameraFocal);
    }
    renderer.resetCameraClippingRange();
    renderWindow.render();
  }

  const rep = yActor.get('representation');
  if(rep !== undefined){
    currentActor.getProperty().setRepresentation(rep);
    renderer.resetCameraClippingRange();
    renderWindow.render();
  }
});

// ----------------------------------------------------------------------------
// Tracking/Sending Mouse Interaction
// ----------------------------------------------------------------------------

let isDraggingActor = false;
let mouseStartPos = null;
let actorStartOrient = null;

interactor.onMouseMove((callData) => {
  if (isDraggingActor && currentActor) {
    const mousePos = callData.position;
    const deltaX = mousePos.x - mouseStartPos.x;
    const deltaY = mousePos.y - mouseStartPos.y;

    currentActor.setOrientation(
      actorStartOrient[0] - deltaY * 0.1,
      actorStartOrient[1] + deltaX * 0.1, // flip Y
      actorStartOrient[2]
    );

    if(axes){
      axes.setOrientation(...currentActor.getOrientation());
      axes.setPosition(...axesPosition);
    }

    renderWindow.render();

    sendActorPosition();
  }
});


interactor.onLeftButtonPress((callData) => {
  if (!currentActor)return;
    isDraggingActor = true;
    actorStartOrient = [...currentActor.getOrientation()];
    mouseStartPos = callData.position;  // Store the starting mouse position
});

interactor.onLeftButtonRelease(() => {
  isDraggingActor = false;
  actorStartOrient = null;
  mouseStartPos = null;
});

function sendActorPosition(){
  if (currentActor) {
    const orient = currentActor.getOrientation();
    yActor.set('orientation', orient);
    const cameraPos = camera.getPosition();
    const cameraFocal = camera.getFocalPoint();
    yActor.set('cameraPosition', cameraPos);
    yActor.set('cameraFocalPoint', cameraFocal);
  }
}

// ----------------------------------------------------------------------------
// Point Processing Functions
// ----------------------------------------------------------------------------

async function extractPointsFromPolyData(polyData) {
  const points = polyData.getPoints();
  if (!points) return null;
  
  const pointsArray = points.getData();
  const numPoints = points.getNumberOfPoints();
  
  logProgress(`Extracting ${numPoints.toLocaleString()} points...`);
  
  const pointsMatrix = [];
  for (let i = 0; i < numPoints; i++) {
    const point = [
      pointsArray[i * 3],
      pointsArray[i * 3 + 1],
      pointsArray[i * 3 + 2]
    ];
    pointsMatrix.push(point);
  }
  
  return pointsMatrix;
}

function applyReductionToPolyData(polyData, reducedPoints) {
  logProgress('Applying transformed points to visualization...');
  
  const points = polyData.getPoints();
  const pointsArray = points.getData();
  const numPoints = points.getNumberOfPoints();
  
  // Check if this is a 2D result (all Z coordinates are 0)
  const is2D = reducedPoints.every(point => point.length >= 3 && point[2] === 0);
  
  for (let i = 0; i < numPoints; i++) {
    pointsArray[i * 3] = reducedPoints[i][0];
    pointsArray[i * 3 + 1] = reducedPoints[i][1];
    pointsArray[i * 3 + 2] = reducedPoints[i].length > 2 ? reducedPoints[i][2] : 0;
  }
  
  points.setData(pointsArray);
  points.modified();
  polyData.modified();
  polyData.getBounds();
  
  if (is2D) {
    logSuccess('Applied 2D visualization - all points in XY plane (Z=0)');
    // Set up 2D viewing - position camera to look down at XY plane
    setup2DView();
  } else {
    logSuccess('Applied 3D visualization with transformed points');
  }
}

function setup2DView() {
  // Position camera to look down at the XY plane for 2D visualization
  // const camera = renderer.getActiveCamera();
  
  // Get the bounds of the current data
  const bounds = renderer.computeVisiblePropBounds();
  const centerX = (bounds[0] + bounds[1]) / 2;
  const centerY = (bounds[2] + bounds[3]) / 2;
  const centerZ = 0; // Since all Z coordinates are 0
  
  const rangeX = bounds[1] - bounds[0];
  const rangeY = bounds[3] - bounds[2];
  const maxRange = Math.max(rangeX, rangeY);
  
  // Position camera directly above looking straight down
  camera.setPosition(centerX, centerY, maxRange * 2);
  camera.setFocalPoint(centerX, centerY, centerZ);
  camera.setViewUp(0, 1, 0); // Y axis points up
  
  // Force orthographic (parallel) projection for true 2D
  camera.setParallelProjection(true);
  camera.setParallelScale(maxRange * 0.55);

  // ----------------
  // DO NOT TOUCH INTERACTOR CODE BELOW: it doesn't work
  // ----------------
  
  // Disable 3D interactions to keep it 2D
  // const interactor = renderWindow.getInteractor();
  // const interactorStyle = interactor.getInteractorStyle();
  
  // // Store original interaction state
  // if (!window.original3DInteractionState) {
  //   window.original3DInteractionState = {
  //     leftButtonAction: interactorStyle.getLeftButtonAction(),
  //     middleButtonAction: interactorStyle.getMiddleButtonAction(),
  //     rightButtonAction: interactorStyle.getRightButtonAction()
  //   };
  // }
  
  // // Set 2D interaction style - only allow pan and zoom, no rotation
  // interactorStyle.setLeftButtonAction('Pan');
  // interactorStyle.setMiddleButtonAction('Zoom');
  // interactorStyle.setRightButtonAction('Pan');
  
  // Force render
  renderWindow.render();
  
  logProgress('Locked to 2D viewing mode (no rotation, orthographic projection)');
}

function restore3DView() {
  // const camera = renderer.getActiveCamera();
  // const interactor = renderWindow.getInteractor();
  const interactorStyle = interactor.getInteractorStyle();
  
  // Restore perspective projection
  camera.setParallelProjection(false);

  // ----------------
  // DO NOT TOUCH INTERACTOR CODE BELOW: it doesn't work
  // ----------------
  
  // // Restore 3D interactions
  // if (window.original3DInteractionState) {
  //   interactorStyle.setLeftButtonAction(window.original3DInteractionState.leftButtonAction);
  //   interactorStyle.setMiddleButtonAction(window.original3DInteractionState.middleButtonAction);
  //   interactorStyle.setRightButtonAction(window.original3DInteractionState.rightButtonAction);
  // } else {
  //   // Default 3D interaction
  //   interactorStyle.setLeftButtonAction('Rotate');
  //   interactorStyle.setMiddleButtonAction('Zoom');
  //   interactorStyle.setRightButtonAction('Pan');
  // }
  
  logProgress('Restored 3D viewing mode (rotation enabled, perspective projection)');
}

// ----------------------------------------------------------------------------
// Main Dimensionality Reduction Function
// ----------------------------------------------------------------------------

async function toggleDimensionalityReduction(isRemote = false) {
  if (!originalPointsData) {
    logError('No data loaded for processing');
    alert('Please load a VTP file first!');
    return;
  }
  
  const currentPolyData = vtpReader.getOutputData(0);
  
  if (!reductionApplied) {
    logInfo(`Starting ${reductionMethod.toUpperCase()} transformation...`);
    logProgress(`Target: ${reductionComponents}D reduction`);
    logMemoryUsage('before reduction');
    
    try {
      const pointsMatrix = await extractPointsFromPolyData(currentPolyData);
      if (!pointsMatrix) {
        logError('Failed to extract points from polydata');
        return;
      }
      
      logProgress(`Processing ${pointsMatrix.length.toLocaleString()} points`);
      
      let reducedPoints;
      const startTime = performance.now();
      
      logProgress(`Executing ${reductionMethod.toUpperCase()} with ${reductionComponents}D target...`);
      
      if (reductionMethod === 'pca') {
        reducedPoints = await performPCA(pointsMatrix, reductionComponents);
        logSuccess(`PCA completed - output has ${reducedPoints[0].length} dimensions`);
      } else if (reductionMethod === 'tsne') {
        const tsneOptions = {
          perplexity: Math.min(10.0, Math.floor(pointsMatrix.length / 6)),
          maxIterations: 300,
          learningRate: 100.0
        };
        logProgress(`t-SNE options: perplexity=${tsneOptions.perplexity}, target=${reductionComponents}D`);
        reducedPoints = await performTSNE(pointsMatrix, reductionComponents, tsneOptions);
        logSuccess(`t-SNE completed - output has ${reducedPoints[0].length} dimensions`);
        
        // Verify we got the expected dimensions
        if (reductionComponents === 2 && reducedPoints[0].length === 3) {
          logProgress('t-SNE 2D result padded to 3D for visualization (Z=0)');
        }
      } else if (reductionMethod === 'umap') {
        // Get UMAP parameters from UI if available
        const umapNeighborsInput = document.querySelector('.umap-neighbors-input');
        const umapMinDistInput = document.querySelector('.umap-mindist-input');
        
        const nNeighbors = umapNeighborsInput ? parseInt(umapNeighborsInput.value) : 8;
        const minDist = umapMinDistInput ? parseFloat(umapMinDistInput.value) : 0.1;
        
        const umapOptions = {
          nNeighbors: nNeighbors,
          minDist: minDist,
          nEpochs: 200
        };
        
        logProgress(`UMAP options: neighbors=${nNeighbors}, min_dist=${minDist}, target=${reductionComponents}D`);
        reducedPoints = await performUMAP(pointsMatrix, reductionComponents, umapOptions);
        logSuccess(`UMAP completed - output has ${reducedPoints[0].length} dimensions`);
        
        // Verify we got the expected dimensions
        if (reductionComponents === 2 && reducedPoints[0].length === 3) {
          logProgress('UMAP 2D result padded to 3D for visualization (Z=0)');
        }
      }
      
      const endTime = performance.now();
      const processingTime = ((endTime - startTime) / 1000).toFixed(2);
      
      // Log original and new bounds
      const originalBounds = currentPolyData.getBounds();
      logProgress(`Original bounds: X[${originalBounds[0].toFixed(2)}, ${originalBounds[1].toFixed(2)}] Y[${originalBounds[2].toFixed(2)}, ${originalBounds[3].toFixed(2)}] Z[${originalBounds[4].toFixed(2)}, ${originalBounds[5].toFixed(2)}]`);
      
      applyReductionToPolyData(currentPolyData, reducedPoints);
      reductionApplied = true;

      // Update the reduction state in other tabs
      // sendReductionState();
      
      const newBounds = currentPolyData.getBounds();
      logProgress(`New bounds: X[${newBounds[0].toFixed(2)}, ${newBounds[1].toFixed(2)}] Y[${newBounds[2].toFixed(2)}, ${newBounds[3].toFixed(2)}] Z[${newBounds[4].toFixed(2)}, ${newBounds[5].toFixed(2)}]`);
      
      logSuccess(`${reductionMethod.toUpperCase()} reduction completed in ${processingTime}s`);
      logInfo(`Visualization updated with ${reductionComponents}D data`);
      logMemoryUsage('after reduction complete');
      
      // Clean up tensors if using TensorFlow.js
      if (reductionMethod === 'pca') {
        cleanupTensors();
      }
      
    } catch (error) {
      logError(`${reductionMethod.toUpperCase()} reduction failed: ${error.message}`);
      logWarning('Try reloading the file or using a different method');
      logMemoryUsage('after error');
      
      // Clean up on error
      if (reductionMethod === 'pca') {
        cleanupTensors();
      }
      return;
    }
  } else {
    logInfo('Restoring original data...');
    
    const points = currentPolyData.getPoints();
    points.setData(originalPointsData);
    currentPolyData.modified();
    reductionApplied = false;

    // Sync reset with other tabs
    // sendReductionState();
    
    // Reset to 3D perspective view when restoring original data
    restore3DView();
    
    logSuccess('Original data restored successfully');
    
    // Clean up any remaining tensors
    cleanupTensors();
  }
  
  mapper.setInputData(currentPolyData);
  
  // Always reset camera after data changes
  renderer.resetCamera();
  renderWindow.render();

  // Only broadcast if this toggle came from *local user*, not from Yjs
  if (!isRemote) {
    yReduction.set('state', {
      applied: reductionApplied,
      method: reductionMethod,
      components: reductionComponents,
    });
  }

  
  logInfo('Visualization refreshed');
  logProgress(`Current state: ${reductionApplied ? `${reductionMethod.toUpperCase()} ${reductionComponents}D` : 'Original 3D'}`);
}

// ----------------------------------------------------------------------------
// Yjs Observer: Toggle Reduction
// ----------------------------------------------------------------------------


yReduction.observe(event => {
  // event.transaction.local === true if *this tab* made the change
  if (event.transaction.local) {
    logInfo('this is the host tab!');
    // Don't run toggle here — we already applied it locally
    return;
  }

  const state = yReduction.get('state');

  logInfo("reduction observed from another tab!");

  if(!state) return;


  const applied = state.applied;
  const method = state.method;
  const components = state.components;

  if (applied !== undefined && method && components) {
    logInfo("if (applied !== undefined && method && components)");
    if (applied && !reductionApplied) {
      logInfo("if (applied && !reductionApplied)");
      reductionMethod = method;
      reductionComponents = components;
      toggleDimensionalityReduction(true);
    } else if (!applied && reductionApplied) {
      logInfo("else if (!applied && reductionApplied)")
      toggleDimensionalityReduction(true);
    }
    else{
      logInfo("none of the above");
      logInfo(`applied: ${applied} reductionApplied: ${reductionApplied}`)
    }
  }
});


// ----------------------------------------------------------------------------
// Create an Orientation Marker
// ----------------------------------------------------------------------------

function createOrientationMarker(){
  // create axes
  axes = vtkAnnotatedCubeActor.newInstance();
  axes.setDefaultStyle({
    text: '+X',
    fontStyle: 'bold',
    fontFamily: 'Arial',
    fontColor: 'black',
    fontSizeScale: (res) => res / 2,
    faceColor: '#0000ff',
    faceRotation: 0,
    edgeThickness: 0.1,
    edgeColor: 'black',
    resolution: 400,
  });
  // axes.setXPlusFaceProperty({ text: '+X' });
  axes.setXMinusFaceProperty({
    text: '-X',
    faceColor: '#ffff00',
    faceRotation: 90,
    fontStyle: 'italic',
  });
  axes.setYPlusFaceProperty({
    text: '+Y',
    faceColor: '#00ff00',
    fontSizeScale: (res) => res / 4,
  });
  axes.setYMinusFaceProperty({
    text: '-Y',
    faceColor: '#00ffff',
    fontColor: 'white',
  });
  axes.setZPlusFaceProperty({
    text: '+Z',
    edgeColor: 'yellow',
  });
  axes.setZMinusFaceProperty({ text: '-Z', faceRotation: 45, edgeThickness: 0 });
  axesPosition = axes.getPosition();

  // create orientation widget
  const orientationWidget = vtkOrientationMarkerWidget.newInstance({
    actor: axes,
    interactor: interactor,
  });
  orientationWidget.setEnabled(true);
  orientationWidget.setViewportCorner(
    vtkOrientationMarkerWidget.Corners.BOTTOM_RIGHT
  );
  orientationWidget.setViewportSize(0.10);
  orientationWidget.setMinPixelSize(100);
  orientationWidget.setMaxPixelSize(300);
}

// ----------------------------------------------------------------------------
// File Handling
// ----------------------------------------------------------------------------
function updateScene(fileData){
  try {
    logProgress('Parsing VTP file...');
    vtpReader.parseAsArrayBuffer(fileData);

    const polyData = vtpReader.getOutputData(0);
    
    const points = polyData.getPoints();
    if (points) {
      originalPointsData = new Float32Array(points.getData());
      const numPoints = points.getNumberOfPoints();
      const bounds = polyData.getBounds();
      
      logSuccess('File loaded successfully!');
      logInfo('Dataset information:');
      logProgress(`  Points: ${numPoints.toLocaleString()}`);
      logProgress(`  Bounds: X[${bounds[0].toFixed(2)}, ${bounds[1].toFixed(2)}] Y[${bounds[2].toFixed(2)}, ${bounds[3].toFixed(2)}] Z[${bounds[4].toFixed(2)}, ${bounds[5].toFixed(2)}]`);
      
      const cells = polyData.getPolys();
      if (cells) {
        const numCells = cells.getNumberOfCells();
        logProgress(`  Polygons: ${numCells.toLocaleString()}`);
      }
      
      const pointDataSizeMB = (originalPointsData.length * 4) / (1024 * 1024);
      logProgress(`Memory usage: ~${pointDataSizeMB.toFixed(1)} MB`);
      
      if (numPoints > 10000) {
        logWarning('Large dataset: Memory-optimized algorithms will be used automatically');
      }
      if (numPoints > 50000) {
        logWarning('Very large dataset: Consider using smaller files for better performance');
      }
      
      createOrientationMarker();
    } else {
      logWarning('No point data found in VTP file');
    }
    
    mapper.setInputData(polyData);
    renderer.addActor(actor);
    // Test spheres removed to fix vtkSphereSource error
    renderer.resetCamera();
    renderWindow.render();
    currentActor = actor;
    
    reductionApplied = false;
    
    // Initialize adaptive streaming for new scene
    if (adaptiveStreaming.enabled) {
      performViewportCulling();
      updateLODForAllObjects();
    }
    
    logSuccess('Visualization rendered successfully');
    logInfo('Use "Toggle Reduction" to apply PCA, t-SNE, or UMAP');
    logInfo('Adaptive streaming is active for optimal performance');
    logMemoryUsage('after file loading complete');
    
  } catch (error) {
    logError(`Failed to load VTP file: ${error.message}`);
    logWarning('Make sure the file is a valid VTP (VTK XML PolyData) format');
    logMemoryUsage('after file loading error');
  }
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function handleFile(e) {
  preventDefaults(e);
  const dataTransfer = e.dataTransfer;
  const files = e.target.files || dataTransfer.files;
  
  if (files.length > 0) {
    const file = files[0];
    logInfo(`Loading file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
    logMemoryUsage('before file loading');
    
    const fileReader = new FileReader();
    fileReader.onload = function onLoad(e) {
      const fileData = fileReader.result;
      const b64 = arrayBufferToBase64(fileData);

      isLocalFileLoad = true; //mark as a local change
      //overwite the polydata if it already exists
      yFile.set('polydata', b64);

      updateScene(fileData);
    };
    
    fileReader.onerror = function(error) {
      logError(`File reading failed: ${error.message}`);
    };
    
    fileReader.readAsArrayBuffer(files[0]);
  }
}

// ----------------------------------------------------------------------------
// UI Controls Setup
// ----------------------------------------------------------------------------

function setupDimensionalityReductionControls() {
  const controlTable = document.querySelector('table');
  
  // Method selection row
  const methodRow = document.createElement('tr');
  const methodCell = document.createElement('td');
  const methodSelect = document.createElement('select');
  methodSelect.style.width = '100%';
  
  const pcaOption = document.createElement('option');
  pcaOption.value = 'pca';
  pcaOption.textContent = 'PCA (TensorFlow.js)';
  pcaOption.selected = true;
  methodSelect.appendChild(pcaOption);
  
  const tsneOption = document.createElement('option');
  tsneOption.value = 'tsne';
  tsneOption.textContent = 't-SNE (TensorFlow.js)';
  methodSelect.appendChild(tsneOption);
  
  const umapOption = document.createElement('option');
  umapOption.value = 'umap';
  umapOption.textContent = 'UMAP (TensorFlow.js)';
  methodSelect.appendChild(umapOption);
  
  methodSelect.addEventListener('change', (e) => {
    const oldMethod = reductionMethod;
    reductionMethod = e.target.value;
    logInfo(`Reduction method changed: ${oldMethod.toUpperCase()} -> ${reductionMethod.toUpperCase()}`);
    
    updateComponentsSelector();
    updateUMAPParametersVisibility();
    
    // Update reductionComponents to match the new method's default
    if (reductionMethod === 'tsne' || reductionMethod === 'umap') {
      reductionComponents = 2; // Default to 2D for t-SNE and UMAP
      logProgress(`Target dimensions set to ${reductionComponents}D (recommended for ${reductionMethod.toUpperCase()})`);
    } else if (reductionMethod === 'pca') {
      reductionComponents = 3; // Default to 3D for PCA
      logProgress(`Target dimensions set to ${reductionComponents}D for ${reductionMethod.toUpperCase()}`);
    }
    
    if (reductionApplied) {
      logWarning(`Currently using ${oldMethod.toUpperCase()}. Click "Toggle Reduction" twice to apply ${reductionMethod.toUpperCase()}`);
    } else {
      logInfo(`${reductionMethod.toUpperCase()} will be used when next applied`);
    }
  });
  
  methodCell.appendChild(methodSelect);
  methodRow.appendChild(methodCell);
  controlTable.appendChild(methodRow);
  
  // UMAP parameters row (initially hidden)
  const umapParamsRow = document.createElement('tr');
  umapParamsRow.className = 'umap-params-row';
  umapParamsRow.style.display = 'none';
  const umapParamsCell = document.createElement('td');
  
  const paramsContainer = document.createElement('div');
  paramsContainer.style.cssText = 'display: flex; gap: 8px; align-items: center; font-size: 11px;';
  
  const neighborsLabel = document.createElement('label');
  neighborsLabel.textContent = 'Neighbors:';
  neighborsLabel.style.cssText = 'font-weight: bold; min-width: 60px;';
  
  const neighborsInput = document.createElement('input');
  neighborsInput.type = 'number';
  neighborsInput.value = '8';
  neighborsInput.min = '3';
  neighborsInput.max = '20';
  neighborsInput.step = '1';
  neighborsInput.className = 'umap-neighbors-input';
  neighborsInput.style.cssText = 'width: 45px; padding: 2px;';
  
  const minDistLabel = document.createElement('label');
  minDistLabel.textContent = 'Min Dist:';
  minDistLabel.style.cssText = 'font-weight: bold; min-width: 55px; margin-left: 8px;';
  
  const minDistInput = document.createElement('input');
  minDistInput.type = 'number';
  minDistInput.value = '0.1';
  minDistInput.min = '0.001';
  minDistInput.max = '1.0';
  minDistInput.step = '0.01';
  minDistInput.className = 'umap-mindist-input';
  minDistInput.style.cssText = 'width: 55px; padding: 2px;';
  
  neighborsInput.addEventListener('change', (e) => {
    const value = parseInt(e.target.value);
    logInfo(`UMAP neighbors parameter changed to: ${value}`);
    logProgress('More neighbors = more global structure preservation');
  });
  
  minDistInput.addEventListener('change', (e) => {
    const value = parseFloat(e.target.value);
    logInfo(`UMAP min_dist parameter changed to: ${value}`);
    logProgress('Lower min_dist = tighter clusters, higher = looser embedding');
  });
  
  paramsContainer.appendChild(neighborsLabel);
  paramsContainer.appendChild(neighborsInput);
  paramsContainer.appendChild(minDistLabel);
  paramsContainer.appendChild(minDistInput);
  
  umapParamsCell.appendChild(paramsContainer);
  umapParamsRow.appendChild(umapParamsCell);
  controlTable.appendChild(umapParamsRow);
  
  // Components selection row
  const componentsRow = document.createElement('tr');
  const componentsCell = document.createElement('td');
  const componentsSelect = document.createElement('select');
  componentsSelect.style.width = '100%';
  componentsSelect.className = 'components-selector';
  
  function updateComponentsSelector() {
    componentsSelect.innerHTML = '';
    
    if (reductionMethod === 'pca') {
      const option2D = document.createElement('option');
      option2D.value = '2';
      option2D.textContent = 'PCA to 2D';
      componentsSelect.appendChild(option2D);
      
      const option3D = document.createElement('option');
      option3D.value = '3';
      option3D.textContent = 'PCA to 3D (reorder axes)';
      option3D.selected = true;
      componentsSelect.appendChild(option3D);
      
      reductionComponents = 3; // Sync the variable
    } else if (reductionMethod === 'tsne') {
      const option2D = document.createElement('option');
      option2D.value = '2';
      option2D.textContent = 't-SNE to 2D (recommended)';
      option2D.selected = true;
      componentsSelect.appendChild(option2D);
      
      const option3D = document.createElement('option');
      option3D.value = '3';
      option3D.textContent = 't-SNE to 3D';
      componentsSelect.appendChild(option3D);
      
      reductionComponents = 2; // Sync the variable - default to 2D for t-SNE
    } else if (reductionMethod === 'umap') {
      const option2D = document.createElement('option');
      option2D.value = '2';
      option2D.textContent = 'UMAP to 2D (recommended)';
      option2D.selected = true;
      componentsSelect.appendChild(option2D);
      
      const option3D = document.createElement('option');
      option3D.value = '3';
      option3D.textContent = 'UMAP to 3D';
      componentsSelect.appendChild(option3D);
      
      reductionComponents = 2; // Sync the variable - default to 2D for UMAP
    }
    
    logProgress(`Components selector updated: ${reductionComponents}D selected for ${reductionMethod.toUpperCase()}`);
  }
  
  function updateUMAPParametersVisibility() {
    const umapParamsRow = document.querySelector('.umap-params-row');
    if (umapParamsRow) {
      umapParamsRow.style.display = reductionMethod === 'umap' ? 'table-row' : 'none';
    }
  }
  
  updateComponentsSelector();
  
  componentsSelect.addEventListener('change', (e) => {
    const oldComponents = reductionComponents;
    reductionComponents = parseInt(e.target.value);
    logInfo(`Target dimensions changed: ${oldComponents}D -> ${reductionComponents}D`);
    
    if (reductionApplied) {
      logProgress(`Reapplying ${reductionMethod.toUpperCase()} with new target dimensions...`);
      reductionApplied = false;
      toggleDimensionalityReduction();
    } else {
      logProgress(`${reductionMethod.toUpperCase()} will target ${reductionComponents}D when next applied`);
    }
  });
  
  componentsCell.appendChild(componentsSelect);
  componentsRow.appendChild(componentsCell);
  controlTable.appendChild(componentsRow);
  
  // Toggle reduction button row
  const toggleRow = document.createElement('tr');
  const toggleCell = document.createElement('td');
  const toggleButton = document.createElement('button');
  toggleButton.textContent = 'Toggle Reduction';
  toggleButton.style.width = '100%';
  toggleButton.addEventListener('click', () => {
    const currentState = reductionApplied ? `${reductionMethod.toUpperCase()} Active` : 'Original Data';
    logInfo(`Reduction Toggle clicked - Current state: ${currentState}`);
    toggleDimensionalityReduction();
  });
  toggleCell.appendChild(toggleButton);
  toggleRow.appendChild(toggleCell);
  controlTable.appendChild(toggleRow);
  
  // Visual mode switch button row
  const visualRow = document.createElement('tr');
  const visualCell = document.createElement('td');
  const visualButton = document.createElement('button');
  visualButton.textContent = 'Switch to Points View';
  visualButton.style.width = '100%';
  visualButton.addEventListener('click', () => {
    const representationSelector = document.querySelector('.representations');
    if (representationSelector.value === '0') {
      representationSelector.value = '2';
      visualButton.textContent = 'Switch to Points View';
      logInfo('Switched to Surface view');
    } else {
      representationSelector.value = '0';
      visualButton.textContent = 'Switch to Surface View';
      logInfo('Switched to Points view - better for seeing transformations!');
    }
    
    const event = new Event('change');
    representationSelector.dispatchEvent(event);
  });
  visualCell.appendChild(visualButton);
  visualRow.appendChild(visualCell);
  controlTable.appendChild(visualRow);
  
  // Memory status button row
  const memoryRow = document.createElement('tr');
  const memoryCell = document.createElement('td');
  const memoryButton = document.createElement('button');
  memoryButton.textContent = 'Memory Status & Cleanup';
  memoryButton.style.width = '100%';
  memoryButton.addEventListener('click', () => {
    logInfo('Memory Status Check:');
    logMemoryUsage('manual check');
    cleanupTensors();
    logProgress('Memory cleanup completed');
  });
  memoryCell.appendChild(memoryButton);
  memoryRow.appendChild(memoryCell);
  controlTable.appendChild(memoryRow);
  
  // 2D/3D view toggle button
  const viewModeRow = document.createElement('tr');
  const viewModeCell = document.createElement('td');
  const viewModeButton = document.createElement('button');
  viewModeButton.textContent = 'Force 2D View';
  viewModeButton.style.width = '100%';
  viewModeButton.style.backgroundColor = '#2196F3';
  viewModeButton.style.color = 'white';
  
  let is2DMode = false;
  
  viewModeButton.addEventListener('click', () => {
    if (!is2DMode) {
      // Force 2D mode
      setup2DView();
      viewModeButton.textContent = 'Switch to 3D View';
      viewModeButton.style.backgroundColor = '#ff9800';
      is2DMode = true;
      logInfo('Forced 2D viewing mode - locked to top-down orthographic view');
    } else {
      // Switch back to 3D mode
      restore3DView();
      renderer.resetCamera();
      renderWindow.render();
      viewModeButton.textContent = 'Force 2D View';
      viewModeButton.style.backgroundColor = '#2196F3';
      is2DMode = false;
      logInfo('Restored 3D viewing mode - full rotation enabled');
    }
  });
  
  viewModeCell.appendChild(viewModeButton);
  viewModeRow.appendChild(viewModeCell);
  controlTable.appendChild(viewModeRow);

  // Adaptive Streaming Controls Row
  const adaptiveRow = document.createElement('tr');
  const adaptiveCell = document.createElement('td');
  const adaptiveButton = document.createElement('button');
  adaptiveButton.textContent = 'Toggle Adaptive Streaming';
  adaptiveButton.style.width = '100%';
  adaptiveButton.style.backgroundColor = '#4CAF50';
  adaptiveButton.style.color = 'white';
  adaptiveButton.addEventListener('click', () => {
    toggleAdaptiveStreaming();
    const status = adaptiveStreaming.enabled ? 'ON' : 'OFF';
    adaptiveButton.textContent = `Adaptive Streaming: ${status}`;
    adaptiveButton.style.backgroundColor = adaptiveStreaming.enabled ? '#4CAF50' : '#f44336';
  });
  adaptiveCell.appendChild(adaptiveButton);
  adaptiveRow.appendChild(adaptiveCell);
  controlTable.appendChild(adaptiveRow);

  // Network Quality Display Row
  const networkRow = document.createElement('tr');
  const networkCell = document.createElement('td');
  const networkDisplay = document.createElement('div');
  networkDisplay.id = 'network-quality-display';
  networkDisplay.style.cssText = 'font-size: 11px; text-align: center; padding: 5px; background: #f5f5f5; border-radius: 3px;';
  networkDisplay.textContent = 'Network: Checking...';
  networkCell.appendChild(networkDisplay);
  networkRow.appendChild(networkCell);
  controlTable.appendChild(networkRow);

  // Viewport Culling Toggle Row
  const cullingRow = document.createElement('tr');
  const cullingCell = document.createElement('td');
  const cullingButton = document.createElement('button');
  cullingButton.textContent = 'Toggle Viewport Culling';
  cullingButton.style.width = '100%';
  cullingButton.addEventListener('click', () => {
    toggleViewportCulling();
    const status = viewportCuller.enabled ? 'ON' : 'OFF';
    cullingButton.textContent = `Viewport Culling: ${status}`;
    cullingButton.style.backgroundColor = viewportCuller.enabled ? '#4CAF50' : '#f44336';
  });
  cullingCell.appendChild(cullingButton);
  cullingRow.appendChild(cullingCell);
  controlTable.appendChild(cullingRow);

  // LOD System Toggle Row
  const lodRow = document.createElement('tr');
  const lodCell = document.createElement('td');
  const lodButton = document.createElement('button');
  lodButton.textContent = 'Toggle LOD System';
  lodButton.style.width = '100%';
  lodButton.addEventListener('click', () => {
    toggleLODSystem();
    const status = lodSystem.enabled ? 'ON' : 'OFF';
    lodButton.textContent = `LOD System: ${status}`;
    lodButton.style.backgroundColor = lodSystem.enabled ? '#4CAF50' : '#f44336';
  });
  lodCell.appendChild(lodButton);
  lodRow.appendChild(lodCell);
  controlTable.appendChild(lodRow);

  // Performance Stats Row
  const statsRow = document.createElement('tr');
  const statsCell = document.createElement('td');
  const statsDisplay = document.createElement('div');
  statsDisplay.id = 'performance-stats-display';
  statsDisplay.style.cssText = 'font-size: 10px; text-align: left; padding: 5px; background: #e8f5e8; border-radius: 3px; line-height: 1.4;';
  statsDisplay.innerHTML = 'Performance Stats:<br>FPS: --<br>Memory: --<br>Network: --';
  statsCell.appendChild(statsDisplay);
  statsRow.appendChild(statsCell);
  controlTable.appendChild(statsRow);

  // Adaptive Weights Controls Row
  const weightsRow = document.createElement('tr');
  const weightsCell = document.createElement('td');
  
  // Weight Configuration Dropdown
  const weightsSelect = document.createElement('select');
  weightsSelect.id = 'adaptive-weights-selector';
  weightsSelect.style.cssText = 'width: 100%; padding: 5px; font-size: 11px; border-radius: 3px; border: 1px solid #ccc;';
  
  // Add optimization type options
  const weightOptions = [
    { value: 'balanced', text: 'Balanced', weights: { network: 0.4, fps: 0.3, memory: 0.3 } },
    { value: 'network', text: 'Network Focus', weights: { network: 0.6, fps: 0.2, memory: 0.2 } },
    { value: 'performance', text: 'Performance Focus', weights: { network: 0.3, fps: 0.4, memory: 0.3 } },
    { value: 'mobile', text: 'Mobile Optimized', weights: { network: 0.4, fps: 0.3, memory: 0.3 } }
  ];
  
  weightOptions.forEach(option => {
    const optionElement = document.createElement('option');
    optionElement.value = option.value;
    optionElement.textContent = option.text;
    if (option.value === 'balanced') optionElement.selected = true; // Default selection
    weightsSelect.appendChild(optionElement);
  });
  
  // Add event listener for weight changes
  weightsSelect.addEventListener('change', (e) => {
    const selectedOption = weightOptions.find(opt => opt.value === e.target.value);
    if (selectedOption) {
      setAdaptiveWeights(selectedOption.weights);
      logInfo(`Optimization type changed to: ${selectedOption.text}`);
    }
  });
  
  weightsCell.appendChild(weightsSelect);
  weightsRow.appendChild(weightsCell);
  controlTable.appendChild(weightsRow);

  // Current Weights Display Row
  const weightsDisplayRow = document.createElement('tr');
  const weightsDisplayCell = document.createElement('td');
  const weightsDisplay = document.createElement('div');
  weightsDisplay.id = 'adaptive-weights-display';
  weightsDisplay.style.cssText = 'font-size: 11px; text-align: center; padding: 5px; background: #e8f5e8; border-radius: 3px; border: 1px solid #4CAF50; font-weight: bold;';
  weightsDisplay.innerHTML = '🎯 <strong>Current Weights:</strong><br>Network: 40% | FPS: 30% | Memory: 30%';
  weightsDisplayCell.appendChild(weightsDisplay);
  weightsDisplayRow.appendChild(weightsDisplayCell);
  controlTable.appendChild(weightsDisplayRow);

  // Gaze Prediction Toggle Row
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

  // Gaze Stats Display Row
  const gazeStatsRow = document.createElement('tr');
  const gazeStatsCell = document.createElement('td');
  const gazeStatsDisplay = document.createElement('div');
  gazeStatsDisplay.id = 'gaze-stats-display';
  gazeStatsDisplay.style.cssText = 'font-size: 10px; text-align: left; padding: 5px; background: #f3e5f5; border-radius: 3px; line-height: 1.4;';
  gazeStatsDisplay.innerHTML = 'Gaze Stats:<br>Predictions: 0<br>Avg Confidence: --<br>Prefetches: 0';
  gazeStatsCell.appendChild(gazeStatsDisplay);
  gazeStatsRow.appendChild(gazeStatsCell);
  controlTable.appendChild(gazeStatsRow);

  // Update network quality display
  setInterval(() => {
    const networkDisplay = document.getElementById('network-quality-display');
    if (networkDisplay) {
      const quality = getNetworkQuality();
      const actualSpeed = networkMonitor.actualSpeed.toFixed(1);
      const latency = networkMonitor.latency.toFixed(0);
      networkDisplay.textContent = `Network: ${quality.toUpperCase()} (${actualSpeed} Mbps, ${latency}ms)`;
      networkDisplay.style.backgroundColor = quality === 'high' ? '#e8f5e8' : quality === 'medium' ? '#fff3cd' : '#f8d7da';
    }
  }, 2000);

  // Update performance stats display
  setInterval(() => {
    const statsDisplay = document.getElementById('performance-stats-display');
    if (statsDisplay) {
      const fps = adaptiveStreaming.currentFPS.toFixed(1);
      const memory = getMemoryUsageRatio() * 100;
      const network = getNetworkQuality();
      const actualSpeed = networkMonitor.actualSpeed.toFixed(1);
      const latency = networkMonitor.latency.toFixed(0);
      
      statsDisplay.innerHTML = `
        Performance Stats:<br>
        FPS: ${fps}<br>
        Memory: ${memory.toFixed(1)}%<br>
        Network: ${network.toUpperCase()}<br>
        Speed: ${actualSpeed} Mbps<br>
        Latency: ${latency}ms
      `;
    }
  }, 1000);

  // Update weights display
  setInterval(() => {
    const weightsDisplay = document.getElementById('adaptive-weights-display');
    if (weightsDisplay) {
      const networkPercent = (adaptiveWeights.network * 100).toFixed(0);
      const fpsPercent = (adaptiveWeights.fps * 100).toFixed(0);
      const memoryPercent = (adaptiveWeights.memory * 100).toFixed(0);
      
      weightsDisplay.innerHTML = `🎯 <strong>Current Weights:</strong><br>Network: ${networkPercent}% | FPS: ${fpsPercent}% | Memory: ${memoryPercent}%`;
    }
  }, 2000);

  // Update performance metrics every 5 seconds
  setInterval(() => {
    updatePerformanceMetrics();
  }, 5000);

  // Update gaze stats display
  setInterval(() => {
    const el = document.getElementById('gaze-stats-display');
    if (el && gazePredictor) {
      el.innerHTML = `Gaze Stats:<br>` +
        `Total Predictions: ${gazePredictor.stats.totalPredictions}<br>` +
        `Avg Confidence: ${(gazePredictor.stats.averageConfidence * 100).toFixed(1)}%<br>` +
        `Prefetches: ${gazePredictor.stats.successfulPrefetches}`;
    }
  }, 1000);

  
  
  logSuccess('Dimensionality Reduction controls initialized:');
  logProgress('  - PCA: TensorFlow.js with tf.tidy() memory management');
  logProgress('  - t-SNE/UMAP: Pure JavaScript with memory optimization');
  logProgress('  - Advanced logging and performance monitoring');
  logProgress('  - Real-time memory usage visualization');
  logProgress('  - Automatic optimization for large datasets');
}

// ----------------------------------------------------------------------------
// UI Control Handling
// ----------------------------------------------------------------------------

fullScreenRenderer.addController(controlPanel);
const representationSelector = document.querySelector('.representations');
const vrbutton = document.querySelector('.vrbutton');
const fileInput = document.getElementById('fileInput');

fileInput.addEventListener('change', handleFile);

representationSelector.addEventListener('change', (e) => {
  const newRepValue = Number(e.target.value);
  actor.getProperty().setRepresentation(newRepValue);
  yActor.set('representation', newRepValue);
  renderWindow.render();
});

vrbutton.addEventListener('click', (e) => {
  if (vrbutton.textContent === 'Send To VR') {
    XRHelper.startXR(XrSessionTypes.InlineVr);
    vrbutton.textContent = 'Return From VR';
  } else {
    XRHelper.stopXR();
    vrbutton.textContent = 'Send To VR';
  }
});

// ----------------------------------------------------------------------------
// Application Initialization
// ----------------------------------------------------------------------------

async function initializeApplication() {
  logInfo('Starting VTK.js with Adaptive Streaming Application...');
  
  // Initialize logging system
  initializeLogging();
  
  // Initialize TensorFlow.js
  const tfReady = await initializeTensorFlow();
  if (!tfReady) {
    logError('TensorFlow.js failed to initialize, ML features will not work');
  }
  
  // Initialize adaptive streaming components
  initializeNetworkMonitoring();
  initializeViewportCulling();
  initializeLODSystem();
  initializeAdaptiveStreaming();
  await initializeGazePrediction();
  camera.onModified(() => {
    addCameraSample();
    maybePredictNextFocal();
  });
  
  // Setup UI controls
  setupDimensionalityReductionControls();
  
  logSuccess('Application initialized successfully');
  logInfo('Features available:');
  logProgress('  - VTP file loading and visualization');
  logProgress('  - WebXR/VR support');
  logProgress('  - Adaptive streaming with ML prediction');
  logProgress('  - Network-aware quality adjustment');
  logProgress('  - Viewport culling and LOD optimization');
  logProgress('  - Real-time collaboration');
  logProgress('  - PCA with TensorFlow.js (optimized memory management)');
  logProgress('  - t-SNE and UMAP (pure JavaScript implementations)');
  logProgress('  - Advanced logging and performance monitoring');
  logProgress('  - Automatic optimization for datasets from 100 to 1,000,000+ points');
  logInfo('Load a VTP file to get started!');
  logMemoryUsage('on startup');
}

// Set up cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    cleanupTensors();
  });
}

// Start the application
initializeApplication();

// Expose functions for debugging
window.toggleDimensionalityReduction = toggleDimensionalityReduction;
window.performPCA = performPCA;
window.performTSNE = performTSNE;
window.performUMAP = performUMAP;
window.extractPointsFromPolyData = extractPointsFromPolyData;
window.logMemoryUsage = logMemoryUsage;
window.cleanupTensors = cleanupTensors;