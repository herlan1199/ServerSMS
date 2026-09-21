const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    pingInterval: 10000,
    pingTimeout: 5000
});

app.use(cors());
app.use(express.json());

const JWT_SECRET = "tu_clave_secreta_super_segura";

const pool = new Pool({
    connectionString: 'postgresql://neondb_owner:npg_RjZUaWqb0tz4@ep-small-field-b4db0i6v-pooler.c-6.us-east-2.aws.neon.tech/test?sslmode=require&channel_binding=require',
    ssl: { rejectUnauthorized: false }
});

async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS devices (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) NOT NULL,
                device_hash VARCHAR(255) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                sender VARCHAR(100) NOT NULL,
                recipient VARCHAR(100) NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Base de datos y tablas ('devices', 'messages') verificadas correctamente.");
    } catch (err) {
        console.error("Error al inicializar la base de datos:", err);
    }
}

initDB();

app.get('/', (req, res) => {
    res.status(200).send("Servidor SMS Activo 🚀");
});

app.post('/api/register', async (req, res) => {
    const { username, deviceHash } = req.body;

    if (!username || !deviceHash) {
        return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }

    try {
        const query = `
            INSERT INTO devices (username, device_hash)
            VALUES ($1, $2)
            ON CONFLICT (device_hash) 
            DO UPDATE SET username = EXCLUDED.username
            RETURNING *;
        `;
        await pool.query(query, [username, deviceHash]);

        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '30d' });

        res.status(200).json({ 
            message: 'Dispositivo registrado correctamente', 
            token: token,
            username: username
        });
    } catch (err) {
        console.error('Error en registro:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error("Autenticación fallida: Token no proporcionado"));
    }
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error("Autenticación fallida: Token inválido"));
        socket.username = decoded.username;
        next();
    });
});

const onlineUsers = new Map();

io.on('connection', (socket) => {
    const username = socket.username;
    onlineUsers.set(socket.id, username);
    io.emit('update_user_list', Array.from(new Set(onlineUsers.values())));
    console.log(`[Conectado y Autenticado] ${username} (${socket.id})`);

    socket.on('get_chat_history', async ({ recipient }) => {
        try {
            const query = `
                SELECT sender, recipient, message, created_at 
                FROM messages 
                WHERE (sender = $1 AND recipient = $2) OR (sender = $2 AND recipient = $1)
                ORDER BY created_at ASC;
            `;
            const result = await pool.query(query, [username, recipient]);
            socket.emit('chat_history', result.rows);
        } catch (err) {
            console.error("Error al cargar historial:", err);
        }
    });

    socket.on('private_message', async ({ recipientUsername, message }) => {
        try {
            await pool.query(
                `INSERT INTO messages (sender, recipient, message) VALUES ($1, $2, $3)`,
                [username, recipientUsername, message]
            );

            for (let [sId, uName] of onlineUsers.entries()) {
                if (uName === recipientUsername) {
                    io.to(sId).emit('receive_private_message', { senderUsername: username, message });
                    break;
                }
            }
        } catch (err) {
            console.error("Error al guardar mensaje privado:", err);
        }
    });

    socket.on('typing', ({ recipientUsername, isTyping }) => {
        for (let [sId, uName] of onlineUsers.entries()) {
            if (uName === recipientUsername) {
                io.to(sId).emit('user_typing', { senderUsername: username, isTyping });
                break;
            }
        }
    });

    socket.on('disconnect', () => {
        onlineUsers.delete(socket.id);
        io.emit('update_user_list', Array.from(new Set(onlineUsers.values())));
        console.log(`[Desconectado] ${username}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor ejecutándose en el puerto ${PORT}`);
});
