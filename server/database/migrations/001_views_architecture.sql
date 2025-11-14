-- Migration 001: Enhanced Views Architecture
-- This migration transforms the existing view_configurations table and adds new tables
-- to support the full collaborative view system with inactive views, linked instances,
-- view templates, and audit trails.

-- ==============================================================================
-- STEP 1: Add audit and state tracking to view_configurations
-- ==============================================================================

-- Add new columns to existing view_configurations table
ALTER TABLE view_configurations
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS state VARCHAR(20) DEFAULT 'active' CHECK (state IN ('active', 'inactive', 'archived')),
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS last_activated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS instance_id VARCHAR(255);  -- Links to Y.js instance when active

-- Add comment explaining the state field
COMMENT ON COLUMN view_configurations.state IS 'active=currently rendered, inactive=closed but can be reactivated, archived=soft-deleted with audit trail';

-- ==============================================================================
-- STEP 2: Create view_participants table for linked instances
-- ==============================================================================

CREATE TABLE IF NOT EXISTS view_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    view_id UUID REFERENCES view_configurations(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'participant' CHECK (role IN ('owner', 'participant', 'viewer')),
    instance_id VARCHAR(255),  -- The Y.js instance ID for this user's rendering
    is_active BOOLEAN DEFAULT true,  -- Is this user currently viewing?
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP,

    -- Ensure one participation record per user per view
    UNIQUE(view_id, user_id)
);

CREATE INDEX idx_view_participants_view ON view_participants(view_id);
CREATE INDEX idx_view_participants_user ON view_participants(user_id);
CREATE INDEX idx_view_participants_active ON view_participants(is_active) WHERE is_active = true;

COMMENT ON TABLE view_participants IS 'Tracks which users are participating in shared/linked views';

-- ==============================================================================
-- STEP 3: Create saved_view_templates table for generic configurations
-- ==============================================================================

CREATE TABLE IF NOT EXISTS saved_view_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by VARCHAR(255) NOT NULL,
    template_type VARCHAR(50) NOT NULL CHECK (template_type IN ('filter', 'camera', 'widget', 'full')),
    dataset_type VARCHAR(50),  -- e.g., 'vtp', 'vti', 'stl' - which file types this applies to

    -- Template configuration (JSON)
    configuration JSONB NOT NULL,

    -- Metadata
    is_public BOOLEAN DEFAULT false,  -- Can other users see this template?
    usage_count INTEGER DEFAULT 0,  -- Track popularity
    tags VARCHAR(50)[],  -- For searchability

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Soft delete
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(255)
);

CREATE INDEX idx_saved_templates_creator ON saved_view_templates(created_by);
CREATE INDEX idx_saved_templates_type ON saved_view_templates(template_type);
CREATE INDEX idx_saved_templates_public ON saved_view_templates(is_public) WHERE is_public = true;
CREATE INDEX idx_saved_templates_tags ON saved_view_templates USING gin(tags);

COMMENT ON TABLE saved_view_templates IS 'Reusable view configurations (filters, camera positions, widgets) that can be applied across datasets';

-- ==============================================================================
-- STEP 4: Create projects table for dataset organization
-- ==============================================================================

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by VARCHAR(255) NOT NULL,

    -- Settings
    settings JSONB DEFAULT '{}'::jsonb,

    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP,
    archived_by VARCHAR(255)
);

CREATE INDEX idx_projects_creator ON projects(created_by);

-- ==============================================================================
-- STEP 5: Create project_datasets table (many-to-many)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS project_datasets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,

    -- Dataset version within this project
    version INTEGER DEFAULT 1,
    version_notes TEXT,

    -- Permissions (for future implementation)
    permissions JSONB DEFAULT '{}'::jsonb,

    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    added_by VARCHAR(255),

    -- Ensure dataset can only be added once per project at a given version
    UNIQUE(project_id, dataset_id, version)
);

CREATE INDEX idx_project_datasets_project ON project_datasets(project_id);
CREATE INDEX idx_project_datasets_dataset ON project_datasets(dataset_id);

COMMENT ON TABLE project_datasets IS 'Links datasets to projects with versioning support';

-- ==============================================================================
-- STEP 6: Update annotations to support project scoping
-- ==============================================================================

ALTER TABLE annotations
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'project')),
ADD COLUMN IF NOT EXISTS tags VARCHAR(50)[],
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255);

CREATE INDEX idx_annotations_project ON annotations(project_id);
CREATE INDEX idx_annotations_visibility ON annotations(visibility);
CREATE INDEX idx_annotations_tags ON annotations USING gin(tags);

COMMENT ON COLUMN annotations.visibility IS 'public=visible to all, private=only creator, project=scoped to project participants';

-- ==============================================================================
-- STEP 7: Create share_requests table for collaborative invitations
-- ==============================================================================

CREATE TABLE IF NOT EXISTS share_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    view_id UUID REFERENCES view_configurations(id) ON DELETE CASCADE,
    from_user_id VARCHAR(255) NOT NULL,
    to_user_id VARCHAR(255) NOT NULL,

    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'dismissed')),
    message TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP,

    UNIQUE(view_id, to_user_id)
);

CREATE INDEX idx_share_requests_recipient ON share_requests(to_user_id, status);
CREATE INDEX idx_share_requests_view ON share_requests(view_id);

COMMENT ON TABLE share_requests IS 'Pending invitations for users to join shared views';

-- ==============================================================================
-- STEP 8: Add triggers for updated_at on new tables
-- ==============================================================================

CREATE TRIGGER update_saved_templates_updated_at BEFORE UPDATE ON saved_view_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- STEP 9: Create helper views for common queries
-- ==============================================================================

-- View for active views with participant counts
CREATE OR REPLACE VIEW active_views_summary AS
SELECT
    vc.id,
    vc.name,
    vc.session_id,
    vc.dataset_ids,
    vc.created_by,
    vc.state,
    vc.created_at,
    vc.last_activated_at,
    COUNT(vp.id) FILTER (WHERE vp.is_active = true) as active_participants,
    ARRAY_AGG(vp.user_id) FILTER (WHERE vp.is_active = true) as active_users
FROM view_configurations vc
LEFT JOIN view_participants vp ON vc.id = vp.view_id
WHERE vc.deleted_at IS NULL
GROUP BY vc.id;

COMMENT ON VIEW active_views_summary IS 'Summary of views with active participant counts';

-- ==============================================================================
-- STEP 10: Insert sample data for development
-- ==============================================================================

-- Create a default project for the development session
INSERT INTO projects (id, name, description, created_by)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Default Development Project',
    'Default project for local development and testing',
    'system'
)
ON CONFLICT DO NOTHING;

-- Migration complete
