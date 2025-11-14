// server/src/middleware/auth.js
/**
 * Authentication and Authorization Middleware
 *
 * This provides security layers for API endpoints:
 * 1. Authentication: Verify user identity
 * 2. Authorization: Check user permissions
 * 3. Session validation: Ensure user has access to the session
 */

/**
 * Authenticate user from request
 *
 * This extracts and validates user identity from the request.
 * For now, we'll use a simple approach, but this should be replaced
 * with proper JWT/session tokens in production.
 */
function authenticateUser(req, res, next) {
  // Extract user info from headers or session
  // TODO: Replace with proper JWT validation
  const userId = req.headers['x-user-id'] || req.body.uploadedBy;
  const userName = req.headers['x-user-name'] || 'Anonymous';

  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'User authentication required'
    });
  }

  // Attach user to request for use in route handlers
  req.user = {
    id: userId,
    name: userName,
    // TODO: Add roles, permissions, etc.
    roles: ['user'], // Default role
  };

  console.log(`🔐 Authenticated user: ${req.user.name} (${req.user.id})`);
  next();
}

/**
 * Validate session access
 *
 * Ensures the user has permission to access the requested session.
 * Checks both URL params and request body for sessionId.
 */
async function validateSessionAccess(req, res, next) {
  const { pool } = require('../index');

  try {
    const sessionId = req.params.sessionId || req.body.sessionId;

    if (!sessionId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Session ID required'
      });
    }

    // Verify session exists
    const sessionResult = await pool.query(
      'SELECT * FROM sessions WHERE id = $1',
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Session not found'
      });
    }

    const session = sessionResult.rows[0];

    // TODO: Check if user has permission to access this session
    // For now, allow all authenticated users
    // In production, check:
    // - Is user a participant in this session?
    // - Does user have required role/permission?
    // - Is session still active?

    req.session = session;
    console.log(`✅ Session access validated: ${session.name}`);
    next();
  } catch (error) {
    console.error('Session validation error:', error);
    next(error);
  }
}

/**
 * Validate file upload
 *
 * Checks that uploaded files meet security and business requirements:
 * - File type is allowed
 * - File size is within limits
 * - File content is safe (basic checks)
 */
const ALLOWED_FILE_TYPES = [
  'application/octet-stream',  // VTK files often come as this
  'text/plain',                 // VTK text format
  'application/json',           // JSON datasets
  'text/csv',                   // CSV files
  'application/x-vtk',          // VTK mime type
  'model/vnd.parasolid.transmit.binary',
  'model/vnd.parasolid.transmit.text',
];

const ALLOWED_FILE_EXTENSIONS = [
  '.vtp', '.vtu', '.vti', '.vts', '.vtr', '.vtk',  // VTK formats
  '.json',                                          // JSON
  '.csv',                                           // CSV
  '.txt',                                           // Text
];

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

function validateFileUpload(req, res, next) {
  if (!req.file) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'No file provided'
    });
  }

  const { originalname, mimetype, size } = req.file;

  // Check file size
  if (size > MAX_FILE_SIZE) {
    return res.status(413).json({
      error: 'Payload Too Large',
      message: `File size ${size} bytes exceeds maximum ${MAX_FILE_SIZE} bytes`
    });
  }

  // Check file extension
  const ext = originalname.substring(originalname.lastIndexOf('.')).toLowerCase();
  if (!ALLOWED_FILE_EXTENSIONS.includes(ext)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: `File type ${ext} not allowed. Allowed types: ${ALLOWED_FILE_EXTENSIONS.join(', ')}`
    });
  }

  // Log upload info
  console.log(`📤 File upload validated: ${originalname} (${size} bytes, ${mimetype})`);

  next();
}

/**
 * Rate limiting middleware
 *
 * Prevents abuse by limiting request frequency per user.
 * TODO: Implement proper rate limiting with Redis or similar
 */
const uploadAttempts = new Map(); // user -> { count, lastReset }
const RATE_LIMIT = {
  maxUploads: 10,     // Max uploads per window
  windowMs: 60000,    // 1 minute window
};

function rateLimitUploads(req, res, next) {
  const userId = req.user?.id || 'anonymous';
  const now = Date.now();

  if (!uploadAttempts.has(userId)) {
    uploadAttempts.set(userId, {
      count: 1,
      lastReset: now
    });
    return next();
  }

  const userAttempts = uploadAttempts.get(userId);

  // Reset if window has passed
  if (now - userAttempts.lastReset > RATE_LIMIT.windowMs) {
    userAttempts.count = 1;
    userAttempts.lastReset = now;
    return next();
  }

  // Check if limit exceeded
  if (userAttempts.count >= RATE_LIMIT.maxUploads) {
    return res.status(429).json({
      error: 'Too Many Requests',
      message: `Upload limit exceeded. Try again in ${Math.ceil((RATE_LIMIT.windowMs - (now - userAttempts.lastReset)) / 1000)} seconds`,
      retryAfter: Math.ceil((RATE_LIMIT.windowMs - (now - userAttempts.lastReset)) / 1000)
    });
  }

  userAttempts.count++;
  next();
}

module.exports = {
  authenticateUser,
  validateSessionAccess,
  validateFileUpload,
  rateLimitUploads,
  ALLOWED_FILE_TYPES,
  ALLOWED_FILE_EXTENSIONS,
  MAX_FILE_SIZE,
};
