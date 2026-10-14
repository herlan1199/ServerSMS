const express = require('express');
const { v4: uuid } = require('uuid');
const pool = require('../db/pool');
const config = require('../config');
const auth = require('../middleware/auth');
const { userRateLimit } = require('../middleware/rateLimit');

const router = express.Router();

router.post('/',
    auth,
    userRateLimit('battle', 1, 5),
    async (req, res) => {
        const { rivalId, bet } = req.body;
        if (!rivalId || typeof bet !== 'number' || bet < 10 || bet > 500) {
            return res.status(400).json({ error: 'Apuesta inválida' });
        }
        if (rivalId === req.user.userId) {
            return res.status(400).json({ error: 'No puedes atacarte a ti mismo' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Bloquea ambos usuarios en orden consistente para evitar deadlocks
            const ids = [req.user.userId, rivalId].sort();
            const { rows } = await client.query(
                'SELECT * FROM users WHERE id = ANY($1) FOR UPDATE',
                [ids]
            );
            const me = rows.find(r => r.id === req.user.userId);
            const rival = rows.find(r => r.id === rivalId);

            if (!me || !rival) throw new Error('Jugador no encontrado');
            if (me.tokens < bet) throw new Error('No tienes suficientes tokens');
            if (rival.tokens < bet) throw new Error('El rival no tiene suficientes tokens');

            // Cálculo de batalla
            const myPower = me.attack * 2 + me.defense + me.health / 10;
            const rivalPower = rival.attack * 2 + rival.defense + rival.health / 10;
            const total = myPower + rivalPower;
            const iWin = Math.random() * total < myPower;

            const pot = bet * 2;
            const commission = Math.floor(pot * config.economy.battleCommission);
            const prize = pot - commission;

            // Costo de mantenimiento (sumidero)
            const maintenance = config.economy.maintenanceCostPerBattle;

            let myNewTokens, rivalNewTokens;
            if (iWin) {
                myNewTokens = me.tokens + prize - bet - maintenance;
                rivalNewTokens = rival.tokens - bet;
            } else {
                myNewTokens = me.tokens - bet - maintenance;
                rivalNewTokens = rival.tokens + prize - bet;
            }

            // Actualizar tokens
            await client.query('UPDATE users SET tokens = $1, updated_at = NOW() WHERE id = $2',
                [myNewTokens, me.id]);
            await client.query('UPDATE users SET tokens = $1, updated_at = NOW() WHERE id = $2',
                [rivalNewTokens, rival.id]);

            // Actualizar rating (Elo simple)
            const K = 32;
            const expectedMe = 1 / (1 + Math.pow(10, (rival.rating - me.rating) / 400));
            const scoreMe = iWin ? 1 : 0;
            const newMyRating = Math.round(me.rating + K * (scoreMe - expectedMe));
            const newRivalRating = Math.round(rival.rating + K * ((1 - scoreMe) - (1 - expectedMe)));

            await client.query(
                `UPDATE users SET
                    wins = wins + $1, losses = losses + $2, rating = $3, updated_at = NOW()
                 WHERE id = $4`,
                [iWin ? 1 : 0, iWin ? 0 : 1, newMyRating, me.id]
            );
            await client.query(
                `UPDATE users SET
                    wins = wins + $1, losses = losses + $2, rating = $3, updated_at = NOW()
                 WHERE id = $4`,
                [iWin ? 0 : 1, iWin ? 1 : 0, newRivalRating, rival.id]
            );

            // Registrar batalla
            await client.query(
                `INSERT INTO battles (id, attacker_id, defender_id, bet, attacker_won, prize, commission)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [uuid(), me.id, rival.id, bet, iWin, prize, commission]
            );

            // Registrar transacciones
            await client.query(
                `INSERT INTO transactions (id, user_id, type, amount, metadata)
                 VALUES ($1, $2, 'BATTLE', $3, $4)`,
                [uuid(), me.id, iWin ? (prize - bet - maintenance) : (-bet - maintenance),
                 JSON.stringify({ battleId: null, rivalId, iWin, commission, maintenance })]
            );

            await client.query('COMMIT');

            res.json({
                iWin,
                prize,
                commission,
                maintenance,
                myTokens: myNewTokens,
                newRating: newMyRating,
            });
        } catch (e) {
            await client.query('ROLLBACK');
            res.status(400).json({ error: e.message });
        } finally {
            client.release();
        }
    }
);

module.exports = router;
