// server/src/routes/views.js

const express = require("express");
const router = express.Router();
const { pool } = require("../index");

/**
 * POST /api/views
 * Create a new view
 */
router.post("/", async (req, res, next) => {
  try {
    const {
      sessionId,
      name,
      datasetIds,
      config,
      createdBy,
      state = "inactive",
    } = req.body;

    // Validation
    if (!sessionId || !datasetIds || datasetIds.length === 0) {
      return res.status(400).json({
        error: "sessionId and at least one datasetId are required",
      });
    }

    // Insert view
    const result = await pool.query(
      `INSERT INTO view_configurations
       (session_id, name, dataset_ids, camera, widgets, annotation_filters, created_by, state, last_activated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        sessionId,
        name || "Untitled View",
        datasetIds,
        JSON.stringify(config.camera || {}),
        JSON.stringify(config.widgets || []),
        JSON.stringify(config.annotationFilters || {}),
        createdBy || "anonymous",
        state,
        state === "active" ? new Date() : null,
      ]
    );

    const view = result.rows[0];

    // If this is a shared view, create participation record for the owner
    if (createdBy) {
      await pool.query(
        `INSERT INTO view_participants (view_id, user_id, role, is_active)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (view_id, user_id) DO UPDATE
         SET is_active = EXCLUDED.is_active, last_active_at = CURRENT_TIMESTAMP`,
        [view.id, createdBy, "owner", state === "active"]
      );
    }

    console.log("✅ View created:", view.id, name);

    res.status(201).json({ view });
  } catch (error) {
    console.error("❌ Create view error:", error);
    next(error);
  }
});

/**
 * GET /api/views/session/:sessionId
 * Get all views for a session (including inactive)
 */
router.get("/session/:sessionId", async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { includeDeleted = false } = req.query;

    let query = `
      SELECT
        vc.*,
        COUNT(vp.id) FILTER (WHERE vp.is_active = true) as active_participant_count,
        ARRAY_AGG(vp.user_id) FILTER (WHERE vp.is_active = true) as active_participants
      FROM view_configurations vc
      LEFT JOIN view_participants vp ON vc.id = vp.view_id
      WHERE vc.session_id = $1
    `;

    if (!includeDeleted) {
      query += " AND vc.deleted_at IS NULL";
    }

    query += `
      GROUP BY vc.id
      ORDER BY vc.last_activated_at DESC NULLS LAST, vc.created_at DESC
    `;

    const result = await pool.query(query, [sessionId]);

    res.json({ views: result.rows });
  } catch (error) {
    console.error("❌ List views error:", error);
    next(error);
  }
});

/**
 * GET /api/views/:viewId
 * Get a single view with participants
 */
router.get("/:viewId", async (req, res, next) => {
  try {
    const { viewId } = req.params;

    const result = await pool.query(
      `SELECT
         vc.*,
         COALESCE(
           json_agg(
             json_build_object(
               'userId', vp.user_id,
               'role', vp.role,
               'isActive', vp.is_active,
               'joinedAt', vp.joined_at,
               'lastActiveAt', vp.last_active_at
             )
           ) FILTER (WHERE vp.id IS NOT NULL),
           '[]'
         ) as participants
       FROM view_configurations vc
       LEFT JOIN view_participants vp ON vc.id = vp.view_id
       WHERE vc.id = $1 AND vc.deleted_at IS NULL
       GROUP BY vc.id`,
      [viewId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "View not found" });
    }

    res.json({ view: result.rows[0] });
  } catch (error) {
    console.error("❌ Get view error:", error);
    next(error);
  }
});

/**
 * PATCH /api/views/:viewId
 * Update view configuration
 */
router.patch("/:viewId", async (req, res, next) => {
  try {
    const { viewId } = req.params;
    const { config, name, updatedBy } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (config) {
      if (config.camera) {
        updates.push(`camera = $${paramIndex++}`);
        values.push(JSON.stringify(config.camera));
      }
      if (config.widgets) {
        updates.push(`widgets = $${paramIndex++}`);
        values.push(JSON.stringify(config.widgets));
      }
      if (config.annotationFilters) {
        updates.push(`annotation_filters = $${paramIndex++}`);
        values.push(JSON.stringify(config.annotationFilters));
      }
    }

    if (name) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No updates provided" });
    }

    values.push(viewId);

    const result = await pool.query(
      `UPDATE view_configurations
       SET ${updates.join(", ")}
       WHERE id = $${paramIndex} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "View not found" });
    }

    console.log("✅ View updated:", viewId);

    res.json({ view: result.rows[0] });
  } catch (error) {
    console.error("❌ Update view error:", error);
    next(error);
  }
});

/**
 * PATCH /api/views/:viewId/state
 * Change view state (active/inactive/archived)
 */
router.patch("/:viewId/state", async (req, res, next) => {
  try {
    const { viewId } = req.params;
    const { state, userId } = req.body;

    if (!["active", "inactive", "archived"].includes(state)) {
      return res.status(400).json({ error: "Invalid state" });
    }

    // Update view state
    const result = await pool.query(
      `UPDATE view_configurations
       SET state = $1,
           is_active = $2,
           last_activated_at = CASE WHEN $1 = 'active' THEN CURRENT_TIMESTAMP ELSE last_activated_at END
       WHERE id = $3 AND deleted_at IS NULL
       RETURNING *`,
      [state, state === "active", viewId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "View not found" });
    }

    // Update participant status if userId provided
    if (userId) {
      await pool.query(
        `UPDATE view_participants
         SET is_active = $1, last_active_at = CURRENT_TIMESTAMP
         WHERE view_id = $2 AND user_id = $3`,
        [state === "active", viewId, userId]
      );
    }

    console.log("✅ View state updated:", viewId, "→", state);

    res.json({ view: result.rows[0] });
  } catch (error) {
    console.error("❌ Update view state error:", error);
    next(error);
  }
});

/**
 * DELETE /api/views/:viewId
 * Soft delete a view (audit trail preserved)
 */
router.delete("/:viewId", async (req, res, next) => {
  try {
    const { viewId } = req.params;
    const { deletedBy } = req.body;

    const result = await pool.query(
      `UPDATE view_configurations
       SET deleted_at = CURRENT_TIMESTAMP,
           deleted_by = $1,
           state = 'archived'
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [deletedBy || "unknown", viewId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "View not found or already deleted" });
    }

    // Deactivate all participants
    await pool.query(
      `UPDATE view_participants
       SET is_active = false, left_at = CURRENT_TIMESTAMP
       WHERE view_id = $1`,
      [viewId]
    );

    console.log("✅ View deleted:", viewId, "by", deletedBy);

    res.json({ success: true, view: result.rows[0] });
  } catch (error) {
    console.error("❌ Delete view error:", error);
    next(error);
  }
});

/**
 * POST /api/views/:viewId/participants
 * Add a participant to a view (for linked instances)
 */
router.post("/:viewId/participants", async (req, res, next) => {
  try {
    const { viewId } = req.params;
    const { userId, role = "participant" } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const result = await pool.query(
      `INSERT INTO view_participants (view_id, user_id, role, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (view_id, user_id)
       DO UPDATE SET
         is_active = true,
         last_active_at = CURRENT_TIMESTAMP,
         left_at = NULL
       RETURNING *`,
      [viewId, userId, role]
    );

    console.log("✅ Participant added to view:", userId, "→", viewId);

    res.status(201).json({ participant: result.rows[0] });
  } catch (error) {
    console.error("❌ Add participant error:", error);
    next(error);
  }
});

/**
 * DELETE /api/views/:viewId/participants/:userId
 * Remove a participant from a view
 */
router.delete("/:viewId/participants/:userId", async (req, res, next) => {
  try {
    const { viewId, userId } = req.params;

    const result = await pool.query(
      `UPDATE view_participants
       SET is_active = false, left_at = CURRENT_TIMESTAMP
       WHERE view_id = $1 AND user_id = $2
       RETURNING *`,
      [viewId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Participant not found" });
    }

    console.log("✅ Participant removed from view:", userId, "←", viewId);

    res.json({ success: true });
  } catch (error) {
    console.error("❌ Remove participant error:", error);
    next(error);
  }
});

/**
 * GET /api/views/dataset/:datasetId
 * Get all views for a specific dataset
 */
router.get("/dataset/:datasetId", async (req, res, next) => {
  try {
    const { datasetId } = req.params;

    const result = await pool.query(
      `SELECT vc.*,
              COUNT(vp.id) FILTER (WHERE vp.is_active = true) as active_participant_count
       FROM view_configurations vc
       LEFT JOIN view_participants vp ON vc.id = vp.view_id
       WHERE $1 = ANY(vc.dataset_ids) AND vc.deleted_at IS NULL
       GROUP BY vc.id
       ORDER BY vc.state DESC, vc.last_activated_at DESC NULLS LAST`,
      [datasetId]
    );

    res.json({ views: result.rows });
  } catch (error) {
    console.error("❌ Get views for dataset error:", error);
    next(error);
  }
});

module.exports = router;
