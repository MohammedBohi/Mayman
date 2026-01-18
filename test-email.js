// Script de test pour vérifier l'envoi d'email
require('dotenv').config();
const { sendMail } = require('./mailer');

async function testEmail() {
  console.log('🧪 Test d\'envoi d\'email...\n');
  
  console.log('📋 Variables d\'environnement:');
  console.log('  SMTP_HOST:', process.env.SMTP_HOST);
  console.log('  SMTP_PORT:', process.env.SMTP_PORT);
  console.log('  EMAIL_USER:', process.env.EMAIL_USER);
  console.log('  EMAIL_PASS:', process.env.EMAIL_PASS ? '✓ défini' : '✗ manquant');
  console.log('  EMAIL_FROM:', process.env.EMAIL_FROM);
  console.log('');

  try {
    const result = await sendMail({
      to: 'mayliss.mazet24@gmail.com',
      subject: '🧪 Test SMTP Brevo - May\'Man',
      text: 'Ceci est un email de test pour vérifier la configuration SMTP avec Brevo.',
      html: '<h1>✅ Test réussi !</h1><p>Si vous recevez cet email, la configuration SMTP fonctionne correctement.</p>'
    });

    if (result.error) {
      console.error('❌ Échec:', result.error);
      process.exit(1);
    } else if (result.warning) {
      console.warn('⚠️ Avertissement:', result.warning);
      process.exit(1);
    } else {
      console.log('✅ Email envoyé avec succès !');
      console.log('📬 Vérifiez votre boîte mail (et les spams)');
      process.exit(0);
    }
  } catch (error) {
    console.error('💥 Erreur inattendue:', error);
    process.exit(1);
  }
}

testEmail();
