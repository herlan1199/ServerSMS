const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000, // 10 segundos (Clave para el cold start)
    ssl: {
        rejectUnauthorized: false // Solo para desarrollo con Neon
    }
});

pool.on('error', (err) => {
    console.error('Error inesperado en Postgres:', err);
});

module.exports = pool;
