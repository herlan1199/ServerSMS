const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');

const router = express.Router();

// Solo para admin: métricas de la economía
router.get('/metrics', auth, async (req, res) => {
    const { rows: tokenRows } = await pool.query(
        'SELECT SUM(tokens)::bigint AS total_tokens, COUNT(*)::int AS player_count FROM users'
    );

    const { rows: battleRows } = await pool.query(
        `SELECT COUNT(*)::int AS total_battles,
                SUM(commission)::bigint AS house_earnings
         FROM battles`
    );

    const { rows: last24h } = await pool.query(
        `SELECT COUNT(*)::int AS battles_24h FROM battles
         WHERE created_at > NOW() - INTERVAL '24 hours'`
    );

    res.json({
        totalTokensInCirculation: tokenRows[0].total_tokens,
        playerCount: tokenRows[0].player_count,
        totalBattles: battleRows[0].total_battles,
        houseEarnings: battleRows[0].house_earnings,
        battlesLast24h: last24h[0].battles_24h,
    });
});

module.exports = router;
