# Database Migrations

This directory contains database schema migrations for the CIA Web platform.

## Running Migrations

### Option 1: Using psql directly (recommended for development)

```bash
# Connect to the database container
docker exec -it cia-postgres psql -U postgres -d cia_web

# Run the migration
\i /docker-entrypoint-initdb.d/migrations/001_views_architecture.sql

# Verify
\dt  # List tables
\d view_configurations  # Describe updated table
```

### Option 2: Using docker exec

```bash
# Run migration from host machine
docker exec -i cia-postgres psql -U postgres -d cia_web < server/database/migrations/001_views_architecture.sql
```

### Option 3: Using the migration script

```bash
# Run the Node.js migration script
cd server
node database/run-migrations.js
```

## Migration Naming Convention

Migrations are numbered sequentially:
- `001_views_architecture.sql` - First migration
- `002_feature_name.sql` - Second migration
- etc.

Each migration should:
1. Use `IF NOT EXISTS` for table creation to be idempotent
2. Include comments explaining the purpose
3. Add appropriate indexes
4. Include rollback instructions if needed

## Current Migrations

- **001_views_architecture.sql** - Enhances view system with:
  - Active/inactive view states
  - View participants for linked instances
  - Saved view templates
  - Project organization
  - Annotation scoping
  - Share requests
  - Audit trails

## Schema Overview After Migrations

### Core Tables
- `sessions` - Collaborative workspaces
- `datasets` - Raw data metadata (stored once)
- `projects` - Project organization
- `project_datasets` - Dataset versioning per project

### View System
- `view_configurations` - View states (active/inactive)
- `view_participants` - Users in linked instances
- `saved_view_templates` - Reusable configurations
- `share_requests` - Collaboration invitations

### Annotations
- `annotations` - Spatial annotations (project-scoped)

### Analysis
- `analysis_jobs` - Background computation tracking

## Verification Queries

```sql
-- Check all tables
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Check view_configurations schema
\d view_configurations

-- Check active views
SELECT * FROM active_views_summary;

-- Check view participants
SELECT * FROM view_participants;
```
