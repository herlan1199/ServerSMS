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

// --- OPCIONAL: Endpoint HTTP para verificar disponibilidad de username en el Login ---
app.get('/api/check-username/:username', async (req, res) => {
    const { username } = req.params;
    try {
        const query = "SELECT id FROM users WHERE username = $1";
        const result = await db.query(query, [username]);

        if (result.rows.length > 0) {
            res.json({ available: false }); // Ya existe
        } else {
            res.json({ available: true });  // Libre
        }
    } catch (error) {
        console.error("Error al verificar username:", error);
        res.status(500).json({ error: "Error en el servidor" });
    }
});

// --- GESTIÓN DE WEBSOCKETS ---
io.on('connection', (socket) => {
    console.log(`🔌 Nuevo cliente conectado: ${socket.id}`);

    // 1. Registrar usuario al iniciar sesión o abrir la app
    socket.on('register_user', (userId) => {
        onlineUsers.set(userId, socket.id);
        console.log(`👤 Usuario registrado como Online: ID ${userId}`);
        
        // Notificar a todos los clientes que este usuario ahora está online
        io.emit('update_user_status', { userId, isOnline: true });
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
                    isOnline: onlineUsers.has(userIdStr) // Verifica si está en el mapa de activos
                };
            });

            // Devuelve la lista únicamente al cliente que la solicitó
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
            // Reenvía el mensaje al destinatario si se encuentra conectado
            io.to(recipientSocketId).emit('receive_message', {
                senderId,
                message,
                timestamp: Date.now()
            });
        }
        // Nota: Aquí también puedes agregar código para guardar el mensaje en PostgreSQL si deseas persistencia.
    });

    // 4. Manejar la desconexión del usuario
    socket.on('disconnect', () => {
        for (let [userId, socketId] of onlineUsers.entries()) {
            if (socketId === socket.id) {
                onlineUsers.delete(userId);
                console.log(`❌ Usuario desconectado: ID ${userId}`);
                
                // Notificar a todos que este usuario pasó a estar offline
                io.emit('update_user_status', { userId, isOnline: false });
                break;
            }
        }
    });
});

// Iniciar servidor en el puerto 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo exitosamente en el puerto ${PORT}`);
});
