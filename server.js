const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// Mapa para rastrear qué usuarios están online: clave = userId, valor = socket.id
const onlineUsers = new Map();

// --- GESTIÓN DE WEBSOCKETS ---
io.on('connection', (socket) => {
    console.log(`🔌 Nuevo cliente conectado: ${socket.id}`);

    // 1. Login o registro automático al ingresar el username
    socket.on('login_with_username', async (username) => {
        try {
            if (!username || username.trim() === '') {
                socket.emit('login_error', { message: 'El username no es válido' });
                return;
            }

            const cleanUsername = username.trim();

            // Buscar si el usuario ya existe en la base de datos
            let query = "SELECT id, username FROM users WHERE username = $1";
            let result = await db.query(query, [cleanUsername]);

            let user;

            if (result.rows.length > 0) {
                // El usuario ya existe, lo recuperamos
                user = result.rows[0];
            } else {
                // El usuario NO existe, lo creamos automáticamente al vuelo
                const insertQuery = "INSERT INTO users (username) VALUES ($1) RETURNING id, username";
                const insertResult = await db.query(insertQuery, [cleanUsername]);
                user = insertResult.rows[0];
                console.log(`✨ Nuevo usuario creado automáticamente: ${user.username} (ID: ${user.id})`);
            }

            const userIdStr = user.id.toString();

            // Guardarlo en el mapa de conectados
            onlineUsers.set(userIdStr, socket.id);
            
            // Asociar el userId al socket actual para usarlo al desconectar
            socket.data.userId = userIdStr;

            console.log(`👤 Usuario logueado como Online: ${user.username} (ID ${userIdStr})`);
            
            // Responder al cliente que el login fue exitoso y pasarle sus datos (incluyendo su ID de BD)
            socket.emit('login_success', { id: userIdStr, username: user.username });

            // Notificar a todos los demás clientes que este usuario ahora está online
            io.emit('update_user_status', { userId: userIdStr, isOnline: true });

        } catch (error) {
            console.error("❌ Error en el login con username:", error);
            socket.emit('login_error', { message: 'Error interno en el servidor' });
        }
    });

    // 2. Enviar la lista completa de usuarios (con su estado actual online/offline)
    socket.on('get_users', async () => {
        try {
            const query = "SELECT id, username FROM users ORDER BY username ASC";
            const result = await db.query(query);

            const usersList = result.rows.map(user => {
                const userIdStr = user.id.toString();
                return {
                    id: userIdStr,
                    username: user.username,
                    isOnline: onlineUsers.has(userIdStr) // Verifica si está activo en el mapa
                };
            });

            socket.emit('receive_users_list', usersList);
        } catch (error) {
            console.error("❌ Error al obtener la lista de usuarios:", error);
        }
    });

    // 3. Manejar el envío de mensajes privados en tiempo real
    socket.on('send_message', (data) => {
        const { recipientId, message, senderId } = data;
        const recipientSocketId = onlineUsers.get(recipientId);

        if (recipientSocketId) {
            io.to(recipientSocketId).emit('receive_message', {
                senderId,
                message,
                timestamp: Date.now()
            });
        }
    });

    // 4. Manejar la desconexión del usuario usando la data del socket
    socket.on('disconnect', () => {
        const userId = socket.data.userId;
        if (userId) {
            onlineUsers.delete(userId);
            console.log(`❌ Usuario desconectado: ID ${userId}`);
            
            // Notificar a todos que este usuario pasó a estar offline
            io.emit('update_user_status', { userId, isOnline: false });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo exitosamente en el puerto ${PORT}`);
});
