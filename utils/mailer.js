// utils/mailer.js

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: 'gmail', // ou autre : 'hotmail', 'smtp.zoho.com', etc.
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * Envoie un e-mail de confirmation de réservation.
 * @param {Object} params
 * @param {string} params.to - Destinataire
 * @param {string} params.nom - Nom du client
 * @param {string} params.prenom - Prénom du client
 * @param {string} params.jour - Date (format YYYY-MM-DD)
 * @param {string} params.heure_debut - Heure de début (ex : 14:30)
 * @param {string} params.heure_fin - Heure de fin (calculée)
 * @param {number} params.dureeTotale - Durée totale en minutes
 * @param {number} params.tarifTotal - Tarif total
 * @param {string} params.adresse - Adresse de réservation
 * @param {string} params.telephone - Numéro de téléphone
 * @param {Array} params.personnes - Liste des personnes avec prestations
 * @param {Object} params.prestationsMap - Dictionnaire des prestations
 */
const sendReservationConfirmation = async ({
  to, nom, prenom, jour, heure_debut, heure_fin,
  dureeTotale, tarifTotal, adresse, telephone, personnes, prestationsMap
}) => {
  const dateLocale = new Date(jour).toLocaleDateString("fr-FR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric"
  });

  const resumePersonnes = personnes.map((p, i) => {
    const prestation = prestationsMap[p.prestation_id];
    return `👤 Personne ${i + 1} : ${prestation?.nom || "???"} ${p.avec_soin ? "(+ soin)" : ""}`;
  }).join('\n');

  const contenuMail = `
Bonjour ${prenom} ${nom},

Votre réservation a bien été enregistrée.

📅 Date : ${dateLocale}
🕒 Heure : ${heure_debut} → ${heure_fin}
${resumePersonnes}
🧾 Durée totale : ${dureeTotale} min
💰 Tarif total : ${tarifTotal} €
📍 Adresse : ${adresse}
📞 Tel : ${telephone}
`;

  await transporter.sendMail({
    from: `"May'Man" <${process.env.EMAIL_USER}>`,
    to,
    subject: '✔️ Confirmation de votre réservation',
    text: contenuMail
  });
};

module.exports = { sendReservationConfirmation };