const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const pool = require('../db/pool');
const config = require('../config');

function generateAccessToken(userId) {
    return jwt.sign({ userId }, config.jwt.secret, {
        expiresIn: config.jwt.accessExpires,
    });
}

async function generateRefreshToken(userId) {
    const token = uuid();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 días
    await pool.query(
        `INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)`,
        [uuid(), userId, token, expiresAt]
    );
    return token;
}

async function revokeRefreshToken(token) {
    await pool.query(`DELETE FROM refresh_tokens WHERE token = $1`, [token]);
}

async function verifyRefreshToken(token) {
    const { rows } = await pool.query(
        `SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()`,
        [token]
    );
    return rows[0] || null;
}

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    revokeRefreshToken,
    verifyRefreshToken,
};
