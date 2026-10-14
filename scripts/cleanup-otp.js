const pool = require('../src/db/pool');

async function cleanup() {
    try {
        const { rowCount } = await pool.query(
            `DELETE FROM otp_codes WHERE expires_at < NOW()`
        );
        console.log(`🧹 ${rowCount} códigos OTP expirados eliminados`);

        const { rowCount: rateCount } = await pool.query(
            `DELETE FROM rate_events WHERE created_at < NOW() - INTERVAL '1 hour'`
        );
        console.log(`🧹 ${rateCount} eventos de rate limit antiguos eliminados`);

        process.exit(0);
    } catch (e) {
        console.error('❌ Error en cleanup:', e);
        process.exit(1);
    }
}

cleanup();
