const db = require('../db');
const nodemailer = require('nodemailer');

const getReservationsParJour = async (req, res) => {
    const { jour } = req.query;
    if (!jour) return res.status(400).json({ error: "Paramètre 'jour' requis." });

    try {
     const result = await db.query(`
    SELECT 
        r.*,
        COUNT(rp.id) AS nombre_personnes,
        COALESCE(
            JSON_AGG(
                JSON_BUILD_OBJECT(
                    'nom', rp.nom,
                    'prenom', rp.prenom,
                    'prestation_id', rp.prestation_id,
                    'avec_soin', rp.avec_soin
                )
            ) FILTER (WHERE rp.id IS NOT NULL),
            '[]'
        ) AS personnes
    FROM reservation r
    LEFT JOIN reservation_personne rp ON rp.reservation_id = r.id
    WHERE r.jour = $1
    GROUP BY r.id
    ORDER BY r.heure_debut ASC
`, [jour]);
        res.json(result.rows);
    } catch (error) {
        console.error("Erreur récupération réservations du jour :", error);
        res.status(500).json({ error: "Erreur serveur." });
    }
};

const getReservationDetails = async (req, res) => {
    const id = req.params.id;

    try {
        const reservation = await db.query('SELECT * FROM reservation WHERE id = $1', [id]);
        if (reservation.rows.length === 0) return res.status(404).json({ error: "Réservation introuvable." });

        const personnes = await db.query(`
            SELECT rp.*, p.nom AS nom_prestation, p.duree_minutes, p.prix
            FROM reservation_personne rp
            JOIN prestation p ON p.id = rp.prestation_id
            WHERE rp.reservation_id = $1
        `, [id]);

        res.json({
            ...reservation.rows[0],
            personnes: personnes.rows
        });
    } catch (error) {
        console.error("Erreur détails réservation :", error);
        res.status(500).json({ error: "Erreur serveur." });
    }
};
const creerReservationPourClient = async (req, res) => {
  const {
    utilisateur_id,
    nom, prenom, jour, heure_debut,
    adresseReservation, telephone, departement,
    personnes
  } = req.body;

  try {
    const prestationIds = personnes.map(p => p.prestation_id);
    const prestationsData = await db.query(
      `SELECT * FROM prestation WHERE id = ANY($1)`,
      [prestationIds]
    );
    const prestationsMap = {};
    prestationsData.rows.forEach(p => prestationsMap[p.id] = p);

    let dureeTotale = 0;
    let tarifTotal = 0;

    for (const p of personnes) {
      const prestation = prestationsMap[p.prestation_id];
      if (!prestation) return res.status(400).json({ error: `Prestation ID ${p.prestation_id} introuvable.` });

      const avecSoin = prestation.soin_disponible && p.avec_soin;
      dureeTotale += prestation.duree_minutes + (avecSoin ? 10 : 0);
      tarifTotal += parseFloat(prestation.prix) + (avecSoin ? 7 : 0);
    }

    // +20 min de déplacement/tampon
    dureeTotale += 20;

    const [h, m] = heure_debut.split(':').map(Number);
    const debutMinutes = h * 60 + m;
    const finMinutes = debutMinutes + dureeTotale;

    // Conflits
    const existingRes = await db.query(
      'SELECT heure_debut, duree_totale_minutes FROM reservation WHERE jour = $1',
      [jour]
    );

    for (const resv of existingRes.rows) {
      const [hr, mr] = resv.heure_debut.split(':').map(Number);
      const resvDebut = hr * 60 + mr;
      const resvFin = resvDebut + resv.duree_totale_minutes;
      if (Math.max(debutMinutes, resvDebut) < Math.min(finMinutes, resvFin)) {
        return res.status(400).json({ error: "Conflit avec une autre réservation." });
      }
    }

    tarifTotal = Number(tarifTotal);

    const result = await db.query(`
      INSERT INTO reservation (
        utilisateurid, nom, prenom, jour, creneau, heure_debut, duree_totale_minutes,
        adressereservation, telephone, departement,
        tarif
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id
    `, [
      utilisateur_id, nom, prenom, jour, heure_debut, heure_debut, dureeTotale,
      adresseReservation, telephone, departement, tarifTotal
    ]);

    const reservationId = result.rows[0].id;

    for (const p of personnes) {
      await db.query(`
        INSERT INTO reservation_personne (reservation_id, prestation_id, avec_soin, nom, prenom)
        VALUES ($1, $2, $3, $4, $5)
      `, [reservationId, p.prestation_id, p.avec_soin, p.nom, p.prenom]);
    }

    // Email : récupérer l'email du client lié (si utilisateur_id fourni)
    const userInfo = await db.query('SELECT email FROM utilisateur WHERE id = $1', [utilisateur_id]);
    const emailClient = userInfo.rows[0]?.email || null;

    const finH = String(Math.floor(finMinutes / 60)).padStart(2, '0');
    const finM = String(finMinutes % 60).padStart(2, '0');
    const heureFin = `${finH}:${finM}`;
    const dateLocale = new Date(jour).toLocaleDateString("fr-FR", {
      weekday: "long", day: "2-digit", month: "long", year: "numeric"
    });

    const resumePersonnes = personnes.map((p) => {
      const prestation = prestationsMap[p.prestation_id];
      const prix = Number(prestation.prix);
      const prixTotalPerso = prix + (p.avec_soin ? 7 : 0);
      return `👤 ${p.nom} ${p.prenom} : ${prestation.nom} ${p.avec_soin ? "(+ soin)" : ""} - ${prixTotalPerso.toFixed(2)} €`;
    }).join('\n');

    const contenuMail = `
Bonjour ${nom} ${prenom},

Une réservation a été créée pour vous par l'administrateur.

📅 Date : ${dateLocale}
🕒 Heure : ${heure_debut} → ${heureFin}
${resumePersonnes}
💰 Tarif total : ${tarifTotal} €
📍 Adresse : ${adresseReservation}
📞 Tel : ${telephone}
    `;

    // 👉 Répondre tout de suite (ne pas bloquer sur l'email)
    res.json({ message: "✅ Réservation créée avec succès par l'admin.", reservation_id: reservationId });

    // 👉 Envoyer les emails en arrière-plan
    setImmediate(async () => {
      try {
        if (emailClient) {
          await sendMail({
            to: emailClient,
            subject: '✔️ Réservation créée pour vous',
            text: contenuMail
          });
        }
        await sendMail({
          to: 'mayliss.mazet24@gmail.com',
          subject: '📌 Réservation créée ',
          text: contenuMail
        });
      } catch (e) {
        console.error('Erreur envoi mail post-réponse (admin création):', e);
      }
    });

  } catch (error) {
    console.error("Erreur admin réservation :", error);
    res.status(500).json({ error: "Erreur lors de la création de la réservation par l’admin." });
  }
};

const supprimerReservation = async (req, res) => {
  const id = req.params.id;

  try {
    // 1. Récupérer les infos de la réservation avant suppression
    const check = await db.query('SELECT * FROM reservation WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Réservation introuvable." });
    }
    const reservation = check.rows[0];

    // 2. Récupérer l’e-mail du client (si existant)
    let emailClient = null;
    if (reservation.utilisateurid) {
      const userInfo = await db.query(
        'SELECT email FROM utilisateur WHERE id = $1',
        [reservation.utilisateurid]
      );
      emailClient = userInfo.rows[0]?.email || null;
    }

    // 3. Supprimer la réservation (ON DELETE CASCADE gère reservation_personne)
    await db.query('DELETE FROM reservation WHERE id = $1', [id]);

    const dateLocale = new Date(reservation.jour).toLocaleDateString("fr-FR", {
      weekday: "long", day: "2-digit", month: "long", year: "numeric"
    });

    // 👉 Répondre tout de suite
    res.json({ message: "🗑️ Réservation supprimée et emails envoyés." });

    // 👉 Envoyer les emails après
    setImmediate(async () => {
      try {
        if (emailClient) {
          const contenuClient = `
Bonjour ${reservation.nom} ${reservation.prenom},

Votre réservation du ${dateLocale} à ${reservation.heure_debut} a été annulée par l’administrateur ❌

📍 Adresse : ${reservation.adressereservation}
📞 Tel : ${reservation.telephone}

Si vous avez des questions, n'hésitez pas à nous contacter.
          `;
          await sendMail({
            to: emailClient,
            subject: '❌ Votre réservation a été annulée par l’admin',
            text: contenuClient
          });
        }

        const contenuCoiffeuse = `
Une réservation a été annulée par l’administrateur.

👤 Client : ${reservation.nom} ${reservation.prenom}
📅 Date : ${dateLocale}
🕒 Heure : ${reservation.heure_debut}
📍 Adresse : ${reservation.adressereservation}
📞 Tel : ${reservation.telephone}
        `;
        await sendMail({
          to: 'mayliss.mazet24@gmail.com',
          subject: '❌ Réservation annulée par l’admin',
          text: contenuCoiffeuse
        });
      } catch (e) {
        console.error('Erreur envoi mail post-réponse (admin suppression):', e);
      }
    });

  } catch (error) {
    console.error("Erreur suppression admin :", error);
    res.status(500).json({ error: "Erreur lors de la suppression de la réservation." });
  }
};



module.exports = {
    getReservationsParJour,
    getReservationDetails,
    creerReservationPourClient,
    supprimerReservation
};