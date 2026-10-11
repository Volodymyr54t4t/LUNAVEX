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
  }
}

// Виклик ініціалізації при запуску
initializeDatabase();

module.exports = pool;
