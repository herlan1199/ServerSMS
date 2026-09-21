const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

const pool = new Pool({
    connectionString: 'postgresql://neondb_owner:npg_RjZUaWqb0tz4@ep-small-field-b4db0i6v-pooler.c-6.us-east-2.aws.neon.tech/test?sslmode=require&channel_binding=require',
    ssl: { rejectUnauthorized: false }
});

// Mapa para rastrear usuarios online { socketId: username }
const onlineUsers = new Map();

io.on('connection', (socket) => {
    console.log(`Usuario conectado: ${socket.id}`);

    // El usuario se registra al abrir la app o enviar su username
    socket.on('register_user', (username) => {
        onlineUsers.set(socket.id, username);
        // Emitir a todos la lista actualizada de usuarios online
        io.emit('update_user_list', Array.from(onlineUsers.values()));
    });

    // Manejar mensajes privados
    socket.on('private_message', ({ recipientUsername, senderUsername, message }) => {
        // Buscar el socketId del destinatario
        for (let [sId, uName] of onlineUsers.entries()) {
            if (uName === recipientUsername) {
                io.to(sId).emit('receive_private_message', { senderUsername, message });
                break;
            }
        }
    });

    socket.on('disconnect', () => {
        onlineUsers.delete(socket.id);
        io.emit('update_user_list', Array.from(onlineUsers.values()));
        console.log(`Usuario desconectado: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
