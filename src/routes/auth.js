const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const pool = require('../db/pool');
const config = require('../config');
const transporter = require('../email');
const {
    generateAccessToken,
    generateRefreshToken,
    revokeRefreshToken,
    verifyRefreshToken,
} = require('../utils/tokens');
const auth = require('../middleware/auth');

const router = express.Router();

// Duración del código OTP: 5 minutos
const OTP_TTL_MINUTES = 5;
// Máximo de reenvíos por email en 1 hora
const MAX_SENDS_PER_HOUR = 5;

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashOtp(code) {
    return crypto.createHash('sha256').update(code).digest('hex');
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * PASO 1: Enviar código de verificación al email.
 * Body: { email }
 */
router.post('/send-verification', async (req, res) => {
    const { email } = req.body;

    if (!email || !isValidEmail(email)) {
        return res.status(400).json({ error: 'Email inválido' });
    }

    const client = await pool.connect();
    try {
        // 1. Verificar si el email ya está registrado
        const exists = await client.query(
            'SELECT 1 FROM users WHERE username = $1',
            [email]
        );
        if (exists.rowCount > 0) {
            return res.status(400).json({ error: 'Este email ya está registrado' });
        }

        // 2. Rate limit: máximo 5 envíos por hora a este email
        const recent = await client.query(
            `SELECT COUNT(*)::int AS count FROM otp_codes
             WHERE email = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
            [email]
        );
        if (recent.rows[0].count >= MAX_SENDS_PER_HOUR) {
            return res.status(429).json({
                error: 'Demasiados intentos. Intenta más tarde.',
            });
        }

        // 3. Generar código y hashearlo
        const code = generateOtp();
        const codeHash = hashOtp(code);
        const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

        // 4. Guardar en DB (reemplaza códigos previos del mismo email)
        await client.query(
            `DELETE FROM otp_codes WHERE email = $1`,
            [email]
        );
        await client.query(
            `INSERT INTO otp_codes (id, email, code_hash, expires_at)
             VALUES ($1, $2, $3, $4)`,
            [uuid(), email, codeHash, expiresAt]
        );

        // 5. Enviar email
        await transporter.sendMail({
            from: `"Goblin Warriors" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Tu código de verificación',
            html: `
                <div style="font-family: Arial, sans-serif; background:#1A0B2E; color:#F5F5F5; padding:32px; border-radius:12px;">
                    <h2 style="color:#FFD700; margin-top:0;">Goblin Warriors</h2>
                    <p>Tu código de verificación es:</p>
                    <p style="font-size:36px; font-weight:bold; color:#FFD700; letter-spacing:8px; margin:20px 0;">
                        ${code}
                    </p>
                    <p style="color:#B0B0B0; font-size:14px;">
                        Expira en ${OTP_TTL_MINUTES} minutos. Si no solicitaste esto, ignora este correo.
                    </p>
                </div>
            `,
        });

        res.json({ success: true, message: 'Código enviado' });
    } catch (e) {
        console.error('Error send-verification:', e);
        res.status(500).json({ error: 'Error al enviar el código' });
    } finally {
        client.release();
    }
});

/**
 * PASO 2: Verificar código y crear la cuenta.
 * Body: { email, code, username, password }
 */
router.post('/verify-code', async (req, res) => {
    const { email, code, username, password } = req.body;

    if (!email || !code || !username || !password) {
        return res.status(400).json({ error: 'Faltan datos' });
    }
    if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Email inválido' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Contraseña muy corta' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Buscar el código OTP de ese email
        const { rows: otpRows } = await client.query(
            `SELECT * FROM otp_codes
             WHERE email = $1 AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [email]
        );
        const otp = otpRows[0];
        if (!otp) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Código no encontrado o expirado' });
        }

        // 2. Verificar el hash del código
        const codeHash = hashOtp(code.trim());
        if (codeHash !== otp.code_hash) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Código incorrecto' });
        }

        // 3. Verificar que username no esté tomado
        const userExists = await client.query(
            'SELECT 1 FROM users WHERE username = $1',
            [username]
        );
        if (userExists.rowCount > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Nombre de usuario ya existe' });
        }

        // 4. Crear usuario
        const id = uuid();
        const hash = await bcrypt.hash(password, 10);
        await client.query(
            `INSERT INTO users (id, username, password_hash, tokens, email, email_verified)
             VALUES ($1, $2, $3, $4, $5, TRUE)`,
            [id, username, hash, config.economy.initialTokens, email]
        );
        await client.query(
            `INSERT INTO transactions (id, user_id, type, amount, metadata)
             VALUES ($1, $2, 'REGISTER_BONUS', $3, $4)`,
            [uuid(), id, config.economy.initialTokens, JSON.stringify({ reason: 'email_verified' })]
        );

        // 5. Consumir el OTP
        await client.query(`DELETE FROM otp_codes WHERE email = $1`, [email]);

        await client.query('COMMIT');

        // 6. Emitir tokens de sesión
        const accessToken = generateAccessToken(id);
        const refreshToken = await generateRefreshToken(id);

        res.json({
            token: accessToken,
            refreshToken,
            tokens: config.economy.initialTokens,
            username,
            email,
        });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error verify-code:', e);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
    }
});

/**
 * Login tradicional con username + password.
 */
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Faltan datos' });
    }

    try {
        const { rows } = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );
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
        console.error('Error login:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

/**
 * Renovar el access token usando el refresh token.
 */
router.post('/refresh', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Falta refreshToken' });

    const stored = await verifyRefreshToken(refreshToken);
    if (!stored) return res.status(401).json({ error: 'Refresh token inválido' });

    const accessToken = generateAccessToken(stored.user_id);
    res.json({ token: accessToken });
});

/**
 * Cerrar sesión (revoca el refresh token).
 */
router.post('/logout', auth, async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) await revokeRefreshToken(refreshToken);
    res.json({ success: true });
});

module.exports = router;
