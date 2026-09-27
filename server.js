const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());

// Estado global del sistema en memoria
let systemState = {
    clientSubmission: null, // { amount, reference, date, beneficiary }
    adminSubmission: null,  // { amount, reference, date }
    status: 'pending',      // 'pending', 'approved', 'rejected'
    reason: ''
};

// 1. Recibe el texto estructurado (JSON) enviado por el cliente móvil
app.post('/api/client/upload-data', (req, res) => {
    const { amount, reference, date, beneficiary } = req.body;
    
    systemState.clientSubmission = {
        amount,
        reference,
        date: date || 'N/A',
        beneficiary: beneficiary || 'N/A',
        status: 'pending'
    };
    systemState.status = 'pending';
    systemState.reason = '';

    // Si ya el admin había cargado su texto antes, comparamos de inmediato
    if (systemState.adminSubmission) {
        evaluateConciliation();
    }

    io.emit('status_update', systemState);
    res.json({ success: true, message: 'Datos de cliente recibidos' });
});

// 2. Recibe el texto estructurado (JSON) extraído por la web del administrador
app.post('/api/admin/upload-data', (req, res) => {
    const { amount, reference, date } = req.body;

    systemState.adminSubmission = {
        amount,
        reference,
        date: date || 'N/A'
    };

    // Ejecutar comparación automática si el cliente ya envió su texto
    if (systemState.clientSubmission) {
        evaluateConciliation();
    } else {
        systemState.status = 'pending';
    }

    io.emit('status_update', systemState);
    res.json({ success: true, message: 'Reporte oficial registrado' });
});

// 3. Función auxiliar para comparar textos y decidir aprobación o rechazo
function evaluateConciliation() {
    const client = systemState.clientSubmission;
    const admin = systemState.adminSubmission;

    if (!client || !admin) return;

    const clientAmt = parseFloat(client.amount);
    const adminAmt = parseFloat(admin.amount);
    const clientRef = String(client.reference).trim().toUpperCase();
    const adminRef = String(admin.reference).trim().toUpperCase();

    // Verificación estricta de Monto y Referencia
    if (clientAmt === adminAmt && clientRef === adminRef && clientRef !== 'NO_ENCONTRADA') {
        systemState.status = 'approved';
        client.status = 'approved';
        systemState.reason = '';
    } else {
        systemState.status = 'rejected';
        client.status = 'rejected';
        systemState.reason = 'Discrepancia en el monto o número de referencia bancaria.';
    }
}

// 4. Revisión manual por parte del admin (forzar aprobar o rechazar)
app.post('/api/admin/review', (req, res) => {
    const { action, reason } = req.body; // 'approve' | 'reject'

    if (action === 'approve') {
        systemState.status = 'approved';
        if (systemState.clientSubmission) systemState.clientSubmission.status = 'approved';
        systemState.reason = '';
    } else if (action === 'reject') {
        systemState.status = 'rejected';
        if (systemState.clientSubmission) systemState.clientSubmission.status = 'rejected';
        systemState.reason = reason || 'Rechazado manualmente.';
    }

    io.emit('status_update', systemState);
    res.json({ success: true, state: systemState });
});

// 5. Reiniciar sistema
app.post('/api/reset', (req, res) => {
    systemState = {
        clientSubmission: null,
        adminSubmission: null,
        status: 'pending',
        reason: ''
    };
    io.emit('status_update', systemState);
    res.json({ success: true, message: 'Sistema reiniciado' });
});

io.on('connection', (socket) => {
    socket.emit('status_update', systemState);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor de comparación corriendo en puerto ${PORT}`);
});
