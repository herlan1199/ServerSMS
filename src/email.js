const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
    },
});

// Verificar conexión al arrancar (opcional, útil para debug)
transporter.verify((error) => {
    if (error) {
        console.error('❌ Error configurando email:', error.message);
    } else {
        console.log('✅ Servidor de email listo');
    }
});

module.exports = transporter;
