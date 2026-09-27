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

// Estructura de estado global con control de estatus
let state = {
    clientSubmission: null, // { amount, reference, date, status: 'pending'|'approved'|'rejected', reason? }
    adminSubmission: null,  // { amount, reference, date }
    globalStatus: 'waiting' // 'waiting', 'pending_review', 'approved', 'rejected'
};

// Función de validación cruzada automática
function evaluateConciliation() {
    if (!state.clientSubmission || !state.adminSubmission) return;

    const c = state.clientSubmission;
    const a = state.adminSubmission;

    const amountMatch = Math.abs(c.amount - a.amount) < 0.01;
    const refMatch = c.reference.toLowerCase() === a.reference.toLowerCase() && c.reference !== "NO_ENCONTRADA";

    if (amountMatch && refMatch) {
        // Coincidencia exacta: Se aprueba automáticamente o pasa a visto bueno
        state.clientSubmission.status = 'approved';
        state.globalStatus = 'approved';
    } else {
        // Discrepancia: Queda pendiente de revisión manual o se rechaza con causa
        state.clientSubmission.status = 'rejected';
        state.clientSubmission.reason = 'Discrepancia detectada en monto o número de referencia bancaria.';
        state.globalStatus = 'rejected';
    }

    io.emit('status_update', state);
}

// 1. Recibir datos del Cliente (Kotlin) -> Queda en estado PENDIENTE
app.post('/api/client/upload-data', (req, res) => {
    const { amount, reference, date, rawText } = req.body;

    state.clientSubmission = {
        amount: amount || 0,
        reference: reference || 'NO_ENCONTRADA',
        date: date || 'N/A',
        rawText: rawText || '',
        status: 'pending', // <-- Estado inicial: Pendiente de aprobación
        timestamp: new Date()
    };
    state.globalStatus = state.adminSubmission ? 'reviewing' : 'pending_client';

    console.log('[Servidor] Cliente envió pago. Estado: PENDIENTE');
    io.emit('status_update', state);

    // Si el admin ya había subido su reporte, evaluamos automáticamente
    if (state.adminSubmission) {
        evaluateConciliation();
    }

    res.json({ success: true, status: 'pending', message: 'Comprobante recibido y en revisión.' });
});

// 2. Recibir datos del Administrador / Reporte Oficial
app.post('/api/admin/upload-data', (req, res) => {
    const { amount, reference, date } = req.body;

    state.adminSubmission = {
        amount: amount || 0,
        reference: reference || 'NO_ENCONTRADA',
        date: date || 'N/A',
        timestamp: new Date()
    };

    console.log('[Servidor] Admin cargó reporte oficial.');
    
    if (state.clientSubmission) {
        evaluateConciliation();
    } else {
        io.emit('status_update', state);
    }

    res.json({ success: true, message: 'Reporte de admin registrado.' });
});

// 3. Endpoint para que el Admin apruebe o rechace manualmente con causa
app.post('/api/admin/review', (req, res) => {
    const { action, reason } = req.body; // action: 'approve' o 'reject'

    if (!state.clientSubmission) {
        return res.status(400).json({ error: 'No hay transacción pendiente de cliente.' });
    }

    if (action === 'approve') {
        state.clientSubmission.status = 'approved';
        delete state.clientSubmission.reason;
        state.globalStatus = 'approved';
    } else if (action === 'reject') {
        state.clientSubmission.status = 'rejected';
        state.clientSubmission.reason = reason || 'Rechazado por el administrador sin especificar causa.';
        state.globalStatus = 'rejected';
    }

    io.emit('status_update', state);
    res.json({ success: true, state });
});

// 4. Reiniciar sistema
app.post('/api/reset', (req, res) => {
    state = { clientSubmission: null, adminSubmission: null, globalStatus: 'waiting' };
    io.emit('status_update', state);
    res.json({ success: true });
});

io.on('connection', (socket) => {
    socket.emit('status_update', state);
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Servidor de validación activo en http://localhost:${PORT}`);
});
