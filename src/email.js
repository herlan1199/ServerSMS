const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendVerificationEmail(to, code) {
    await resend.emails.send({
        from: 'Goblin Warriors <onboarding@resend.dev>',
        to,
        subject: 'Tu código de verificación',
        html: `
            <div style="font-family: Arial, sans-serif; background:#1A0B2E; color:#F5F5F5; padding:32px; border-radius:12px;">
                <h2 style="color:#FFD700; margin-top:0;">Goblin Warriors</h2>
                <p>Tu código de verificación es:</p>
                <p style="font-size:36px; font-weight:bold; color:#FFD700; letter-spacing:8px; margin:20px 0;">
                    ${code}
                </p>
                <p style="color:#B0B0B0; font-size:14px;">
                    Expira en 5 minutos. Si no solicitaste esto, ignora este correo.
                </p>
            </div>
        `,
    });
}

module.exports = { sendVerificationEmail };
