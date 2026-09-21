const { Pool } = require('pg');

const pool = new Pool({
    // Añadimos 'uselibpqcompat=true' para silenciar la advertencia y mantener compatibilidad
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_RjZUaWqb0tz4@ep-small-field-b4db0i6v-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&uselibpqcompat=true',
    ssl: {
        rejectUnauthorized: false
    }
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};
