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

// --- Endpoint HTTP para verificar disponibilidad de username en el Login ---
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

    // 1. Manejar el inicio de sesión / registro mediante username desde la app móvil
    socket.on('login_with_username', async (username) => {
        try {
            // Verificar si el usuario ya existe en la base de datos
            let result = await db.query("SELECT id, username FROM users WHERE username = $1", [username]);
            
            let userId;
            if (result.rows.length > 0) {
                userId = result.rows[0].id;
            } else {
                // SOLUCIÓN AL ERROR: Insertamos tanto 'username' como 'full_name' 
                // para evitar violar la restricción NOT NULL de la base de datos.
                const insertQuery = "INSERT INTO users (username, full_name) VALUES ($1, $2) RETURNING id";
                const newResult = await db.query(insertQuery, [username, username]);
                userId = newResult.rows[0].id;
            }

            const userIdStr = userId.toString();
            
            // Registrar en el mapa de usuarios en línea
            onlineUsers.set(userIdStr, socket.id);
            console.log(`👤 Usuario logueado como Online: ${username} (ID ${userIdStr})`);

            // Responder al cliente con su ID real y nombre para continuar la navegación
            socket.emit('login_success', { id: userIdStr, username });
            
            // Notificar a todos los clientes que este usuario pasó a estar online
            io.emit('update_user_status', { userId: userIdStr, isOnline: true });

        } catch (error) {
            console.error("❌ Error en el login con username:", error);
        }
    });

    // Registro alternativo por ID directo (por si se utiliza en otra parte de la app)
    socket.on('register_user', (userId) => {
        const userIdStr = userId.toString();
        onlineUsers.set(userIdStr, socket.id);
        console.log(`👤 Usuario registrado como Online: ID ${userIdStr}`);
        io.emit('update_user_status', { userId: userIdStr, isOnline: true });
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

// Iniciar servidor en el puerto proporcionado por Render o 3000 por defecto
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo exitosamente en el puerto ${PORT}`);
});
