const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const pool = require('../db/pool');
const config = require('../config');
const {
    generateAccessToken,
    generateRefreshToken,
    revokeRefreshToken,
    verifyRefreshToken,
} = require('../utils/tokens');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });
    if (password.length < 6) return res.status(400).json({ error: 'Contraseña muy corta' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const exists = await client.query('SELECT 1 FROM users WHERE username = $1', [username]);
        if (exists.rowCount > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Usuario ya existe' });
        }

        const id = uuid();
        const hash = await bcrypt.hash(password, 10);
        await client.query(
            `INSERT INTO users (id, username, password_hash, tokens) VALUES ($1, $2, $3, $4)`,
            [id, username, hash, config.economy.initialTokens]
        );
        await client.query(
            `INSERT INTO transactions (id, user_id, type, amount, metadata)
             VALUES ($1, $2, 'REGISTER_BONUS', $3, $4)`,
            [uuid(), id, config.economy.initialTokens, JSON.stringify({ reason: 'initial_gift' })]
        );

        await client.query('COMMIT');

        const accessToken = generateAccessToken(id);
        const refreshToken = await generateRefreshToken(id);

        res.json({
            token: accessToken,
            refreshToken,
            tokens: config.economy.initialTokens,
            username,
        });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
    }
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = rows[0];
        if (!user) return res.status(400).json({ error: 'Credenciales inválidas' });

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return res.status(400).json({ error: 'Credenciales inválidas' });

        const accessToken = generateAccessToken(user.id);
        const refreshToken = await generateRefreshToken(user.id);

        res.json({
            token: accessToken,
            refreshToken,
            tokens: user.tokens,
            username: user.username,
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

router.post('/refresh', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Falta refreshToken' });

    const stored = await verifyRefreshToken(refreshToken);
    if (!stored) return res.status(401).json({ error: 'Refresh token inválido' });

    const accessToken = generateAccessToken(stored.user_id);
    res.json({ token: accessToken });
});

router.post('/logout', auth, async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) await revokeRefreshToken(refreshToken);
    res.json({ success: true });
});

module.exports = router;
