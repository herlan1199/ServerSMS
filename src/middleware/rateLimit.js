const pool = require('../db/pool');

/**
 * Rate limiter por usuario + tipo de evento, usando la BD.
 * Ej: max 1 batalla cada 5 segundos, máx 10 peticiones por minuto.
 */
function userRateLimit(eventType, maxCount, windowSeconds) {
    return async (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'No autorizado' });

        try {
            const { rows } = await pool.query(
                `SELECT COUNT(*)::int AS count FROM rate_events
                 WHERE user_id = $1 AND event_type = $2
                 AND created_at > NOW() - INTERVAL '${windowSeconds} seconds'`,
                [req.user.userId, eventType]
            );

            if (rows[0].count >= maxCount) {
                return res.status(429).json({
                    error: 'Demasiadas peticiones. Espera un momento.',
                });
            }

            await pool.query(
                `INSERT INTO rate_events (user_id, event_type) VALUES ($1, $2)`,
                [req.user.userId, eventType]
            );

            // Limpieza oportunista
            pool.query(
                `DELETE FROM rate_events WHERE created_at < NOW() - INTERVAL '1 hour'`
            ).catch(() => {});

            next();
        } catch (e) {
            console.error('Rate limit error:', e);
            next(); // No bloquees si el rate limiter falla
        }
    };
}

module.exports = { userRateLimit };
