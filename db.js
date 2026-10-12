require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL не встановлено в .env');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Ініціалізація всіх таблиць
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lunar_accounts (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL DEFAULT '',
        role_title TEXT NOT NULL DEFAULT '',
        bio TEXT NOT NULL DEFAULT '',
        avatar_color TEXT NOT NULL DEFAULT '#73d8e8',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query("ALTER TABLE lunar_accounts ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT ''");
    await pool.query("ALTER TABLE lunar_accounts ADD COLUMN IF NOT EXISTS role_title TEXT NOT NULL DEFAULT ''");
    await pool.query("ALTER TABLE lunar_accounts ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT ''");
    await pool.query("ALTER TABLE lunar_accounts ADD COLUMN IF NOT EXISTS avatar_color TEXT NOT NULL DEFAULT '#73d8e8'");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lunar_sessions (
        token_hash CHAR(64) PRIMARY KEY,
        account_id UUID NOT NULL REFERENCES lunar_accounts(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMPTZ NOT NULL
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS lunar_sessions_expiry_idx ON lunar_sessions (expires_at)');
    console.log('✅ Таблиці акаунтів і сесій готові');

    // Таблиця для енергетичних експериментів (сонячні панелі)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS energy_experiments (
        id SERIAL PRIMARY KEY,
        angle FLOAT NOT NULL,
        sunlight FLOAT NOT NULL,
        temperature FLOAT NOT NULL,
        dust FLOAT NOT NULL,
        efficiency FLOAT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Таблиця energy_experiments готова');

    // Таблиця для радіаційних експериментів
    await pool.query(`
      CREATE TABLE IF NOT EXISTS radiation_experiments (
        id SERIAL PRIMARY KEY,
        material TEXT NOT NULL,
        thickness FLOAT NOT NULL,
        radiation_level FLOAT NOT NULL,
        penetration FLOAT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Таблиця radiation_experiments готова');

    // Таблиця для термо експериментів (теплопередача)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS thermo_experiments (
        id SERIAL PRIMARY KEY,
        material TEXT NOT NULL,
        thickness FLOAT NOT NULL,
        area FLOAT NOT NULL,
        inside_temp FLOAT NOT NULL,
        outside_temp FLOAT NOT NULL,
        coefficient FLOAT NOT NULL,
        heat_loss FLOAT NOT NULL,
        recommendation TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Таблиця thermo_experiments готова');

    // Таблиця для Artemis місій
    await pool.query(`
      CREATE TABLE IF NOT EXISTS artemis_missions (
        id SERIAL PRIMARY KEY,
        mission_name TEXT NOT NULL,
        crew_size INTEGER NOT NULL,
        mission_duration_days FLOAT NOT NULL,
        delta_v_total FLOAT NOT NULL,
        radiation_exposure_msv FLOAT NOT NULL,
        safety_index TEXT NOT NULL,
        mission_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Таблиця artemis_missions готова');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS lunar_site_explorer_workspaces (
        workspace_id UUID PRIMARY KEY,
        payload JSONB NOT NULL DEFAULT '{"sites":[],"compareIds":[]}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Таблиця lunar_site_explorer_workspaces готова');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS illumination_researches (
        id BIGSERIAL PRIMARY KEY,
        workspace_id UUID NOT NULL,
        name TEXT NOT NULL,
        site JSONB NOT NULL,
        parameters JSONB NOT NULL,
        result JSONB NOT NULL,
        model_version TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS illumination_researches_workspace_created_idx ON illumination_researches (workspace_id, created_at DESC)');
    console.log('✅ Таблиця illumination_researches готова');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS earthlink_researches (
        id BIGSERIAL PRIMARY KEY,
        workspace_id UUID NOT NULL,
        name TEXT NOT NULL,
        site JSONB NOT NULL,
        parameters JSONB NOT NULL,
        result JSONB NOT NULL,
        model_version TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS earthlink_researches_workspace_created_idx ON earthlink_researches (workspace_id, created_at DESC)');
    console.log('✅ Таблиця earthlink_researches готова');

    for (const table of ['energy_experiments', 'radiation_experiments', 'thermo_experiments', 'artemis_missions']) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES lunar_accounts(id) ON DELETE CASCADE`);
      await pool.query(`CREATE INDEX IF NOT EXISTS ${table}_account_created_idx ON ${table} (account_id, created_at DESC)`);
    }

    console.log('🌕 Усі таблиці ініціалізовано успішно!');
  } catch (err) {
    console.error('❌ Помилка ініціалізації БД:', err);
    if (err && err.code === 'ECONNREFUSED') {
      console.error('🔧 PostgreSQL відмовив у з’єднанні. Перевірте, чи запущено Postgres і чи правильний DATABASE_URL.');
    }
    try {
      const dbUrl = new URL(process.env.DATABASE_URL);
      console.error(`🔎 DATABASE: ${dbUrl.protocol}//${dbUrl.hostname}:${dbUrl.port}${dbUrl.pathname}`);
    } catch (parseErr) {
      console.error('🔎 Невдача розбору DATABASE_URL:', parseErr.message);
    }
    throw err;
  }
}

pool.ready = initializeDatabase();
pool.ready.catch(() => {});

module.exports = pool;
