const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const pool = require('./db/pool');

const authRoutes = require('./routes/auth');
const meRoutes = require('./routes/me');
const upgradeRoutes = require('./routes/upgrade');
const battleRoutes = require('./routes/battle');
const dailyRoutes = require('./routes/daily');
const adminRoutes = require('./routes/admin');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '100kb' }));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);
app.use('/api/upgrade', upgradeRoutes);
app.use('/api/battle', battleRoutes);
app.use('/api/daily', dailyRoutes);
app.use('/api/admin', adminRoutes);

// Manejo global de errores
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
});

// Arrancar
async function start() {
    try {
        await pool.query('SELECT 1');
        console.log('✅ Conectado a Postgres');
    } catch (e) {
        console.error('❌ No se pudo conectar a Postgres:', e.message);
        process.exit(1);
    }

    app.listen(config.port, () => {
        console.log(`🚀 Servidor en http://localhost:${config.port}`);
    });
}

start();
