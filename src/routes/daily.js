const express = require('express');
const { v4: uuid } = require('uuid');
const pool = require('../db/pool');
const config = require('../config');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/claim', auth, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            'SELECT last_daily_claim, tokens FROM users WHERE id = $1 FOR UPDATE',
            [req.user.userId]
        );
        const user = rows[0];

        const last = user.last_daily_claim ? new Date(user.last_daily_claim) : null;
        const now = new Date();

        if (last && now.toDateString() === last.toDateString()) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Ya reclamaste hoy' });
        }

        const reward = config.economy.dailyReward;
        await client.query(
            `UPDATE users SET tokens = tokens + $1, last_daily_claim = NOW(), updated_at = NOW()
             WHERE id = $2`,
            [reward, req.user.userId]
        );
        await client.query(
            `INSERT INTO transactions (id, user_id, type, amount, metadata)
             VALUES ($1, $2, 'DAILY_REWARD', $3, $4)`,
            [uuid(), req.user.userId, reward, JSON.stringify({ source: 'daily' })]
        );

        await client.query('COMMIT');
        res.json({ success: true, reward, tokens: user.tokens + reward });
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: e.message });
    } finally {
        client.release();
    }
});

module.exports = router;
