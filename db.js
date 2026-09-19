const { Pool } = require('pg');

const pool = new Pool({
    user: 'tu_usuario_postgres',
    host: 'localhost',
    database: 'smswait_db', // Nombre de tu base de datos
    password: 'tu_contraseña',
    port: 5432,
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};
