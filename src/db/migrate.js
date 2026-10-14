const pool = require('./pool');

async function migrate() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // ============================================
        // TABLA: users
        // ============================================
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                email VARCHAR(120),
                email_verified BOOLEAN NOT NULL DEFAULT FALSE,
                tokens INT NOT NULL DEFAULT 0,
                attack INT NOT NULL DEFAULT 10,
                defense INT NOT NULL DEFAULT 10,
                health INT NOT NULL DEFAULT 100,
                wins INT NOT NULL DEFAULT 0,
                losses INT NOT NULL DEFAULT 0,
                pity_count INT NOT NULL DEFAULT 0,
                rating INT NOT NULL DEFAULT 1000,
                is_admin BOOLEAN NOT NULL DEFAULT FALSE,
                last_daily_claim TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        // Añadir columnas si la tabla ya existía de una versión anterior
        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(120);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS rating INT NOT NULL DEFAULT 1000;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS pity_count INT NOT NULL DEFAULT 0;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS last_daily_claim TIMESTAMPTZ;
        `);

        // ============================================
        // TABLA: otp_codes (verificación por email)
        // ============================================
        await client.query(`
            CREATE TABLE IF NOT EXISTS otp_codes (
                id UUID PRIMARY KEY,
                email VARCHAR(120) NOT NULL,
                code_hash TEXT NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        // ============================================
        // TABLA: battles (historial de batallas)
        // ============================================
        await client.query(`
            CREATE TABLE IF NOT EXISTS battles (
                id UUID PRIMARY KEY,
                attacker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                defender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                bet INT NOT NULL,
                attacker_won BOOLEAN NOT NULL,
                prize INT NOT NULL,
                commission INT NOT NULL,
                maintenance INT NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        await client.query(`
            ALTER TABLE battles ADD COLUMN IF NOT EXISTS maintenance INT NOT NULL DEFAULT 0;
        `);

        // ============================================
        // TABLA: transactions (auditoría de tokens)
        // ============================================
        await client.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id UUID PRIMARY KEY,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                type VARCHAR(30) NOT NULL,
                amount INT NOT NULL,
                metadata JSONB,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        // ============================================
        // TABLA: refresh_tokens
        // ============================================
        await client.query(`
            CREATE TABLE IF NOT EXISTS refresh_tokens (
                id UUID PRIMARY KEY,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token TEXT NOT NULL UNIQUE,
                expires_at TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        // ============================================
        // TABLA: rate_events (rate limiting por usuario)
        // ============================================
        await client.query(`
            CREATE TABLE IF NOT EXISTS rate_events (
                user_id UUID NOT NULL,
                event_type VARCHAR(30) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        // ============================================
        // ÍNDICES
        // ============================================
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_users_rating ON users(rating);
            CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

            CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes(email);
            CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_codes(expires_at);

            CREATE INDEX IF NOT EXISTS idx_battles_attacker ON battles(attacker_id);
            CREATE INDEX IF NOT EXISTS idx_battles_defender ON battles(defender_id);
            CREATE INDEX IF NOT EXISTS idx_battles_created ON battles(created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
            CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
            CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
            CREATE INDEX IF NOT EXISTS idx_refresh_token ON refresh_tokens(token);

            CREATE INDEX IF NOT EXISTS idx_rate_events_lookup
                ON rate_events(user_id, event_type, created_at DESC);
        `);

        await client.query('COMMIT');
        console.log('✅ Migración completa');
        console.log('   - users');
        console.log('   - otp_codes');
        console.log('   - battles');
        console.log('   - transactions');
        console.log('   - refresh_tokens');
        console.log('   - rate_events');
        console.log('   - 14 índices creados');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Error en migración:', e);
        process.exit(1);
    } finally {
        client.release();
        process.exit(0);
    }
}

migrate();
