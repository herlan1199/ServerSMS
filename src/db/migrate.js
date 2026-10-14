const pool = require('./pool');

async function migrate() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            tokens INT NOT NULL DEFAULT 0,
            attack INT NOT NULL DEFAULT 10,
            defense INT NOT NULL DEFAULT 10,
            health INT NOT NULL DEFAULT 100,
            wins INT NOT NULL DEFAULT 0,
            losses INT NOT NULL DEFAULT 0,
            pity_count INT NOT NULL DEFAULT 0,
            rating INT NOT NULL DEFAULT 1000,
            last_daily_claim TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS battles (
            id UUID PRIMARY KEY,
            attacker_id UUID NOT NULL REFERENCES users(id),
            defender_id UUID NOT NULL REFERENCES users(id),
            bet INT NOT NULL,
            attacker_won BOOLEAN NOT NULL,
            prize INT NOT NULL,
            commission INT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id),
            type VARCHAR(30) NOT NULL,
            amount INT NOT NULL,
            metadata JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id),
            token TEXT NOT NULL UNIQUE,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS rate_events (
            user_id UUID NOT NULL,
            event_type VARCHAR(30) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_battles_attacker ON battles(attacker_id);
        CREATE INDEX IF NOT EXISTS idx_battles_defender ON battles(defender_id);
        CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
        CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_rate_events_lookup ON rate_events(user_id, event_type, created_at);
    `);

    console.log('✅ Migración completa');
    process.exit(0);
}

migrate().catch(err => {
    console.error('❌ Error en migración:', err);
    process.exit(1);
});
