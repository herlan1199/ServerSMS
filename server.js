const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

const app = express();
app.use(express.json());

const JWT_SECRET = 'cambia-esto-en-produccion';
const users = new Map(); // en producción usa Postgres/Mongo

// Config de mejoras
const UPGRADE_CONFIG = {
    attack:  { baseGain: 5,  max: 100, cost: 100 },
    defense: { baseGain: 5,  max: 100, cost: 100 },
    health:  { baseGain: 20, max: 200, cost: 150 }
};
const PITY_THRESHOLD = 10;

function auth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No autorizado' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({ error: 'Token inválido' });
    }
}

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });
    if ([...users.values()].some(u => u.username === username))
        return res.status(400).json({ error: 'Usuario ya existe' });

    const user = {
        id: uuid(),
        username,
        password: await bcrypt.hash(password, 10),
        tokens: 500,
        wins: 0,
        losses: 0,
        attack: 10,
        defense: 10,
        health: 100,
        pityCount: 0
    };
    users.set(user.id, user);
    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    res.json({ token, tokens: user.tokens, username: user.username });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = [...users.values()].find(u => u.username === username);
    if (!user) return res.status(400).json({ error: 'Credenciales inválidas' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'Credenciales inválidas' });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    res.json({ token, tokens: user.tokens, username: user.username });
});

app.get('/api/me', auth, (req, res) => {
    const u = users.get(req.user.userId);
    res.json({
        id: u.id, username: u.username, tokens: u.tokens,
        wins: u.wins, losses: u.losses,
        attack: u.attack, defense: u.defense, health: u.health,
        pityCount: u.pityCount
    });
});

app.get('/api/rivals', auth, (req, res) => {
    const rivals = [...users.values()]
        .filter(u => u.id !== req.user.userId)
        .slice(0, 20)
        .map(u => ({
            id: u.id, username: u.username, tokens: u.tokens,
            wins: u.wins, losses: u.losses,
            attack: u.attack, defense: u.defense, health: u.health,
            pityCount: 0
        }));
    res.json(rivals);
});

app.post('/api/upgrade', auth, (req, res) => {
    const { upgradeType } = req.body;
    const config = UPGRADE_CONFIG[upgradeType];
    if (!config) return res.status(400).json({ error: 'Tipo inválido' });

    const user = users.get(req.user.userId);
    if (user.tokens < config.cost) return res.status(400).json({ error: 'Tokens insuficientes' });

    let pityCount = user.pityCount || 0;
    const roll = (pityCount >= PITY_THRESHOLD) ? 0.2 : Math.random();
    let bonusMultiplier = 0, isCritical = false, newPity = pityCount + 1;

    if (roll < 0.01) { bonusMultiplier = 2.0; isCritical = true; newPity = 0; }
    else if (roll < 0.10) { bonusMultiplier = 1.0; newPity = 0; }
    else if (roll < 0.30) { bonusMultiplier = 0.5; newPity = 0; }

    const baseGain = config.baseGain;
    const bonusGain = Math.floor(baseGain * bonusMultiplier);
    const totalGain = baseGain + bonusGain;

    const current = user[upgradeType];
    const newValue = Math.min(current + totalGain, config.max);

    user.tokens -= config.cost;
    user[upgradeType] = newValue;
    user.pityCount = newPity;

    res.json({
        success: true, baseGain, bonusGain, isCritical,
        newValue, pityCount: newPity, tokens: user.tokens
    });
});

app.post('/api/battle', auth, (req, res) => {
    const { rivalId, bet } = req.body;
    if (bet < 10 || bet > 500) return res.status(400).json({ error: 'Apuesta inválida' });

    const me = users.get(req.user.userId);
    const rival = users.get(rivalId);
    if (!rival) return res.status(404).json({ error: 'Rival no encontrado' });
    if (me.tokens < bet || rival.tokens < bet)
        return res.status(400).json({ error: 'Tokens insuficientes' });

    const myPower = me.attack * 2 + me.defense + me.health / 10;
    const rivalPower = rival.attack * 2 + rival.defense + rival.health / 10;
    const total = myPower + rivalPower;
    const iWin = Math.random() * total < myPower;

    const pot = bet * 2;
    const commission = Math.floor(pot * 0.05);
    const prize = pot - commission;

    if (iWin) {
        me.tokens += prize - bet;
        rival.tokens -= bet;
        me.wins++; rival.losses++;
    } else {
        me.tokens -= bet;
        rival.tokens += prize - bet;
        me.losses++; rival.wins++;
    }

    res.json({ iWin, prize, commission, myTokens: me.tokens });
});

app.listen(3000, () => console.log('Servidor en http://localhost:3000'));
