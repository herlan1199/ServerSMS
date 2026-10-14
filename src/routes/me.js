const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const config = require('../config');

const router = express.Router();

router.get('/', auth, async (req, res) => {
    const { rows } = await pool.query(
        `SELECT id, username, tokens, attack, defense, health, wins, losses, pity_count, rating,
                last_daily_claim
         FROM users WHERE id = $1`,
        [req.user.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });

    const u = rows[0];
    res.json({
        id: u.id,
        username: u.username,
        tokens: u.tokens,
        attack: u.attack,
        defense: u.defense,
        health: u.health,
        wins: u.wins,
        losses: u.losses,
        pityCount: u.pity_count,
        rating: u.rating,
        canClaimDaily: canClaimDaily(u.last_daily_claim),
    });
});

router.get('/rivals', auth, async (req, res) => {
    const { rows: meRows } = await pool.query('SELECT rating FROM users WHERE id = $1', [req.user.userId]);
    const myRating = meRows[0].rating;

    // Matchmaking por rating ±200, excluyendo al propio jugador
    const { rows } = await pool.query(
        `SELECT id, username, tokens, attack, defense, health, wins, losses, rating
         FROM users
         WHERE id != $1 AND rating BETWEEN $2 AND $3
         ORDER BY ABS(rating - $2)
         LIMIT 20`,
        [req.user.userId, myRating - 200, myRating + 200]
    );

    res.json(rows.map(u => ({
        id: u.id,
        username: u.username,
        tokens: u.tokens,
        attack: u.attack,
        defense: u.defense,
        health: u.health,
        wins: u.wins,
        losses: u.losses,
        rating: u.rating,
    })));
});

function canClaimDaily(lastClaim) {
    if (!lastClaim) return true;
    const last = new Date(lastClaim);
    const now = new Date();
    return now.toDateString() !== last.toDateString();
}

module.exports = router;
