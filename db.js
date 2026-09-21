const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_RjZUaWqb0tz4@ep-small-field-b4db0i6v-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require',
    ssl: {
        rejectUnauthorized: false // Requerido para conexiones seguras en la nube (Neon/Render)
    }
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};
