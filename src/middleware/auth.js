const jwt = require('jsonwebtoken');
const config = require('../config');

function auth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No autorizado' });

    try {
        req.user = jwt.verify(token, config.jwt.secret);
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
}

module.exports = auth;
