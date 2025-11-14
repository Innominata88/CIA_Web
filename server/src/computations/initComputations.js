// server/src/computations/initComputations.js
// Register all computation handlers

const { registerComputation } = require("./computationRegistry");
const PCAHandler = require("./handlers/PCAHandler");

/**
 * Initialize computation system by registering all handlers
 *
 * Contributors add their handlers here:
 * 1. Import your handler class
 * 2. Create an instance
 * 3. Register it
 *
 * Example:
 * const MyHandler = require('./handlers/MyHandler');
 * registerComputation(new MyHandler());
 */
function initializeComputations() {
  console.log("🧮 Initializing computation system...");

  // Register built-in computation handlers
  registerComputation(new PCAHandler());

  // TODO: Add more handlers as they're implemented
  // registerComputation(new TSNEHandler());
  // registerComputation(new UMAPHandler());
  // registerComputation(new ThresholdFilterHandler());
  // registerComputation(new HistogramHandler());

  console.log("✅ Computation system initialized");
}

module.exports = { initializeComputations };
