// server/src/routes/datasets.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const { pool } = require("../index");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs").promises;
const path = require("path");
const {
  authenticateUser,
  validateSessionAccess,
  validateFileUpload,
  rateLimitUploads,
  MAX_FILE_SIZE,
} = require("../middleware/auth");

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
});

// Uploads directory path
const UPLOAD_DIR = path.join(__dirname, "../../uploads");

/**
 * POST /api/datasets/upload
 * Upload a new dataset file
 *
 * Security layers applied:
 * 1. authenticateUser - Verifies user identity
 * 2. rateLimitUploads - Prevents abuse
 * 3. upload.single - Multer handles multipart/form-data
 * 4. validateFileUpload - Validates file type, size, extension
 *
 * Required body params:
 * - file: The file to upload (multipart)
 * - sessionId: The session this dataset belongs to
 */
router.post(
  "/upload",
  authenticateUser,
  rateLimitUploads,
  upload.single("file"),
  validateFileUpload,
  async (req, res, next) => {
    try {
      const { originalname, buffer, mimetype, size } = req.file;
      const { sessionId } = req.body;

      // Validate session ID is provided
      if (!sessionId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Session ID is required'
        });
      }

      // Verify session exists and user has access
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

      // TODO: Check if user has permission to upload to this session
      // For now, allow all authenticated users

      // Calculate hash of the uploaded file for deduplication
      const crypto = require("crypto");
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");

      console.log(
        `📁 Processing upload from ${req.user.name}: ${originalname} (hash: ${hash.substring(0, 16)}...)`
      );

      // Check if this file already exists in this session
      const existingDataset = await pool.query(
        `SELECT * FROM datasets
         WHERE session_id = $1 AND metadata->>'hash' = $2`,
        [sessionId, hash]
      );

      if (existingDataset.rows.length > 0) {
        const existing = existingDataset.rows[0];
        console.log(`✓ File already exists: ${existing.id} (deduplicating)`);

        // Return the existing dataset instead of creating a new one
        return res.status(200).json({
          dataset: existing,
          deduplicated: true,
        });
      }

      // File doesn't exist yet, create new dataset
      const datasetId = uuidv4();
      const storageKey = `${datasetId}-${originalname}`;
      const filePath = path.join(UPLOAD_DIR, storageKey);

      // Ensure uploads directory exists
      await fs.mkdir(UPLOAD_DIR, { recursive: true });

      // Save file to disk
      await fs.writeFile(filePath, buffer);

      // Insert database record with hash in metadata
      const result = await pool.query(
        `INSERT INTO datasets
         (id, session_id, filename, file_size, mime_type, storage_key, uploaded_by, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          datasetId,
          sessionId,
          originalname,
          size,
          mimetype,
          storageKey,
          req.user.id,
          JSON.stringify({ hash }), // Store hash for deduplication
        ]
      );

      console.log(`✅ Dataset uploaded by ${req.user.name}: ${datasetId} - ${originalname}`);

      res.status(201).json({ dataset: result.rows[0] });
    } catch (error) {
      console.error("Upload error:", error);
      next(error);
    }
  }
);

/**
 * GET /api/datasets/:datasetId
 * Get dataset metadata
 *
 * Security: Requires authentication
 * TODO: Check if user has permission to access this dataset's session
 */
router.get("/:datasetId", authenticateUser, async (req, res, next) => {
  try {
    const { datasetId } = req.params;

    const result = await pool.query("SELECT * FROM datasets WHERE id = $1", [
      datasetId,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Dataset not found" });
    }

    const dataset = result.rows[0];

    // TODO: Verify user has access to this dataset's session
    // For now, allow all authenticated users

    res.json({ dataset });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/datasets/:datasetId/download
 * Download dataset file
 *
 * Security: Requires authentication
 * For local development, this returns the file directly
 * Later, when you move to S3, this will return a presigned URL
 */
router.get("/:datasetId/download", authenticateUser, async (req, res, next) => {
  try {
    const { datasetId } = req.params;

    // Get file information including session_id
    const result = await pool.query(
      "SELECT filename, storage_key, mime_type, session_id FROM datasets WHERE id = $1",
      [datasetId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Dataset not found" });
    }

    const { filename, storage_key, mime_type, session_id } = result.rows[0];

    // TODO: Verify user has access to this dataset's session
    // For now, allow all authenticated users
    console.log(`📥 ${req.user.name} downloading: ${filename}`);

    const filePath = path.join(UPLOAD_DIR, storage_key);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: "File not found on disk" });
    }

    // For local development, send the file directly
    res.setHeader("Content-Type", mime_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/datasets/session/:sessionId
 * List all datasets for a session
 *
 * Security: Requires authentication and session access validation
 */
router.get("/session/:sessionId", authenticateUser, validateSessionAccess, async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    console.log(`📋 ${req.user.name} listing datasets for session: ${sessionId}`);

    const result = await pool.query(
      `SELECT id, filename, file_size, mime_type, storage_key, metadata, uploaded_at, uploaded_by
       FROM datasets
       WHERE session_id = $1
       ORDER BY uploaded_at DESC`,
      [sessionId]
    );

    res.json({ datasets: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
