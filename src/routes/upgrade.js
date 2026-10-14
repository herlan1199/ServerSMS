const express = require('express');
const { v4: uuid } = require('uuid');
const pool = require('../db/pool');
const config = require('../config');
const auth = require('../middleware/auth');
const { userRateLimit } = require('../middleware/rateLimit');

const router = express.Router();

router.post('/',
    auth,
    userRateLimit('upgrade', 10, 60),
    async (req, res) => {
        const { upgradeType } = req.body;
        const cfg = config.economy.upgrades[upgradeType];
        if (!cfg) return res.status(400).json({ error: 'Tipo inválido' });

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { rows } = await client.query(
                'SELECT * FROM users WHERE id = $1 FOR UPDATE',
                [req.user.userId]
            );
            const user = rows[0];
            if (!user) throw new Error('Usuario no encontrado');
            if (user.tokens < cfg.cost) throw new Error('Tokens insuficientes');

            // Pity system
            let pityCount = user.pity_count || 0;
            const roll = (pityCount >= config.economy.pityThreshold) ? 0.2 : Math.random();

            let bonusMultiplier = 0;
            let isCritical = false;
            let newPity = pityCount + 1;

            if (roll < config.economy.bonusChance.critical) {
                bonusMultiplier = 2.0;
                isCritical = true;
                newPity = 0;
            } else if (roll < config.economy.bonusChance.critical + config.economy.bonusChance.double) {
                bonusMultiplier = 1.0;
                newPity = 0;
            } else if (roll < config.economy.bonusChance.critical + config.economy.bonusChance.double + config.economy.bonusChance.half) {
                bonusMultiplier = 0.5;
                newPity = 0;
            }

            const baseGain = cfg.baseGain;
            const bonusGain = Math.floor(baseGain * bonusMultiplier);
            const totalGain = baseGain + bonusGain;

            const dbField = upgradeType === 'attack' ? 'attack'
                          : upgradeType === 'defense' ? 'defense'
                          : 'health';
            const currentValue = user[dbField];
            const newValue = Math.min(currentValue + totalGain, cfg.max);

            await client.query(
                `UPDATE users SET tokens = tokens - $1, ${dbField} = $2, pity_count = $3, updated_at = NOW()
                 WHERE id = $4`,
                [cfg.cost, newValue, newPity, user.id]
            );

            await client.query(
                `INSERT INTO transactions (id, user_id, type, amount, metadata)
                 VALUES ($1, $2, 'UPGRADE', $3, $4)`,
                [uuid(), user.id, -cfg.cost, JSON.stringify({
                    upgradeType, baseGain, bonusGain, isCritical, newValue,
                })]
            );

            await client.query('COMMIT');

            const { rows: after } = await pool.query('SELECT tokens FROM users WHERE id = $1', [user.id]);

            res.json({
                success: true,
                baseGain,
                bonusGain,
                isCritical,
                newValue,
                pityCount: newPity,
                tokens: after[0].tokens,
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
