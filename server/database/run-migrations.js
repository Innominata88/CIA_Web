#!/usr/bin/env node

/**
 * Database Migration Runner
 *
 * Runs all pending migrations in the migrations/ directory.
 * Tracks which migrations have been applied using a migrations table.
 */

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

require('dotenv').config();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/cia_web',
  max: 1, // Only need one connection for migrations
});

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Create migrations tracking table if it doesn't exist
 */
async function createMigrationsTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      migration_name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await pool.query(query);
  console.log('✓ Migrations tracking table ready');
}

/**
 * Get list of already-applied migrations
 */
async function getAppliedMigrations() {
  const result = await pool.query(
    'SELECT migration_name FROM schema_migrations ORDER BY migration_name'
  );
  return result.rows.map(row => row.migration_name);
}

/**
 * Get list of migration files
 */
async function getMigrationFiles() {
  const files = await fs.readdir(MIGRATIONS_DIR);

  return files
    .filter(file => file.endsWith('.sql'))
    .sort(); // Alphabetical order = numeric order due to naming convention
}

/**
 * Apply a single migration
 */
async function applyMigration(filename) {
  console.log(`\n▶ Applying migration: ${filename}`);

  const filePath = path.join(MIGRATIONS_DIR, filename);
  const sql = await fs.readFile(filePath, 'utf8');

  const client = await pool.connect();

  try {
    // Run migration in a transaction
    await client.query('BEGIN');
    await client.query(sql);

    // Record that migration was applied
    await client.query(
      'INSERT INTO schema_migrations (migration_name) VALUES ($1)',
      [filename]
    );

    await client.query('COMMIT');
    console.log(`✓ Successfully applied: ${filename}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`✗ Failed to apply ${filename}:`, error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Main migration runner
 */
async function runMigrations() {
  console.log('=====================================');
  console.log('   Database Migration Runner');
  console.log('=====================================\n');

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✓ Connected to database');

    // Setup migrations tracking
    await createMigrationsTable();

    // Get migrations to apply
    const appliedMigrations = await getAppliedMigrations();
    const allMigrations = await getMigrationFiles();

    const pendingMigrations = allMigrations.filter(
      file => !appliedMigrations.includes(file)
    );

    console.log(`\nMigration Status:`);
    console.log(`  Total migrations: ${allMigrations.length}`);
    console.log(`  Applied: ${appliedMigrations.length}`);
    console.log(`  Pending: ${pendingMigrations.length}`);

    if (pendingMigrations.length === 0) {
      console.log('\n✓ Database is up to date!');
      return;
    }

    console.log('\nPending migrations:');
    pendingMigrations.forEach(m => console.log(`  - ${m}`));

    // Apply each pending migration
    for (const migration of pendingMigrations) {
      await applyMigration(migration);
    }

    console.log('\n=====================================');
    console.log('✓ All migrations applied successfully!');
    console.log('=====================================\n');

  } catch (error) {
    console.error('\n✗ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migrations if this script is executed directly
if (require.main === module) {
  runMigrations().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runMigrations };
