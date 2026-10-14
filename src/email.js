// src/email.js
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendVerificationEmail(to, code) {
  await resend.emails.send({
    from: 'Goblin Warriors <noreply@tudominio.com>',
    to,
    subject: 'Código de verificación',
    html: `<p>Tu código es: <b>${code}</b></p>`
  });
}

module.exports = { sendVerificationEmail };
