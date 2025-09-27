// mailer.js
const nodemailer = require('nodemailer');

const PORT = Number(process.env.SMTP_PORT || 465);

const transporter = nodemailer.createTransport({
  // ✅ robuste sur Railway : on explicite host/port
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: PORT,                 // 465 = TLS direct ; 587 = STARTTLS
  secure: PORT === 465,       // true ↔ 465 ; false ↔ 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // mot de passe d'application Gmail
  },

  // ♻️ pool = réutilisation de connexions (perf + stabilité)
  pool: true,
  maxConnections: 1,          // ← réduit pour stabilité
  maxMessages: 50,
  keepAlive: true,            // ← réutiliser la connexion

  // 🧯 anti-ETIMEDOUT (forçage IPv4 + timeouts)
  family: 4,                  // force IPv4 (évite IPv6 capricieux)
  connectionTimeout: 20000,
  greetingTimeout: 10000,
  socketTimeout: 30000,
  dnsTimeout: 10000,
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
  return withRetry(() =>
    withAppTimeout(
      transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to,
        subject,
        text,
        html,
      })
    )
  );
}

module.exports = { sendMail };
