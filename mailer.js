// mailer.js
const nodemailer = require('nodemailer');

const PORT = Number(process.env.SMTP_PORT || 587);

console.log('📧 Configuration SMTP:', {
  host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: PORT,
  user: process.env.EMAIL_USER ? '✓ configuré' : '✗ manquant',
  pass: process.env.EMAIL_PASS ? '✓ configuré' : '✗ manquant',
  from: process.env.EMAIL_FROM || 'non défini'
});

const transporter = nodemailer.createTransport({
  // ✅ Configuration optimisée pour Brevo
  host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: PORT,
  secure: false,              // false pour port 587 (STARTTLS)
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },

  // ♻️ Pool de connexions pour stabilité
  pool: true,
  maxConnections: 5,
  maxMessages: 100,

  // 🧯 Timeouts augmentés pour Railway/Brevo
  connectionTimeout: 60000,   // 60s
  greetingTimeout: 30000,     // 30s
  socketTimeout: 60000,       // 60s

  // Forçage IPv4 + options TLS
  family: 4,
  tls: {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2'
  },

  // Logs détaillés (désactiver en prod si besoin)
  logger: process.env.NODE_ENV !== 'production',
  debug: process.env.NODE_ENV !== 'production'
});

// ——— utilitaires robustesse ———
async function withRetry(fn, retries = 3) {
  let delay = 800;
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

function withAppTimeout(promise, ms = 60000) { // ← 60s au lieu de 15s
  let t;
  return Promise.race([
    promise,
    new Promise((_, rej) => (t = setTimeout(() => rej(new Error('mail-app-timeout')), ms)))
  ]).finally(() => clearTimeout(t));
}

async function sendMail({ to, subject, text, html }) {
  // Si les variables d'environnement SMTP ne sont pas configurées, ne pas bloquer
  if (!process.env.SMTP_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠️ Configuration SMTP manquante - Email non envoyé:', { to, subject });
    return { warning: 'SMTP not configured' };
  }

  try {
    console.log(`📤 Tentative d'envoi email à: ${to}`);
    const result = await withRetry(() =>
      withAppTimeout(
        transporter.sendMail({
          from: `"May'Man" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
          to,
          subject,
          text,
          html,
        }),
        60000 // 60s de timeout
      )
    );
    console.log(`✅ Email envoyé avec succès à: ${to}`);
    return result;
  } catch (error) {
    // Logger l'erreur détaillée mais ne pas faire planter l'application
    console.error('❌ Erreur envoi email (non-bloquant):', {
      to,
      subject,
      error: error.message,
      code: error.code,
      command: error.command
    });
    return { error: error.message };
  }
}

module.exports = { sendMail };
