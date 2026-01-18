// mailer.js - Utilise l'API Brevo au lieu de SMTP
const axios = require('axios');

console.log('📧 Configuration Email (API Brevo):', {
  apiKey: process.env.BREVO_API_KEY ? '✓ configuré' : '✗ manquant',
  from: process.env.EMAIL_FROM || 'non défini'
});

async function sendMail({ to, subject, text, html }) {
  // Si la clé API n'est pas configurée, ne pas bloquer
  if (!process.env.BREVO_API_KEY) {
    console.warn('⚠️ BREVO_API_KEY manquante - Email non envoyé:', { to, subject });
    return { warning: 'Brevo API key not configured' };
  }

  try {
    console.log(`📤 Tentative d'envoi email à: ${to}`);
    
    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: {
          name: "May'Man",
          email: process.env.EMAIL_FROM || '9fb415001@smtp-brevo.com'
        },
        to: [{ email: to }],
        subject: subject,
        textContent: text,
        htmlContent: html || text.replace(/\n/g, '<br>')
      },
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
          'accept': 'application/json'
        },
        timeout: 10000 // 10s timeout pour l'API
      }
    );
    
    console.log(`✅ Email envoyé avec succès à: ${to} (messageId: ${response.data.messageId})`);
    return { messageId: response.data.messageId };
    
  } catch (error) {
    // Logger l'erreur détaillée mais ne pas faire planter l'application
    console.error('❌ Erreur envoi email (non-bloquant):', {
      to,
      subject,
      error: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    return { error: error.message };
  }
}

module.exports = { sendMail };
