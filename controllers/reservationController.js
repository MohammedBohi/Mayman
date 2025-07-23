const db = require('../db');
const nodemailer = require('nodemailer');
const sendMail = async ({ to, subject, text }) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to,
        subject,
        text
    });
};

// 🔄 GET /api/reservations/mes
const getMesReservations = async (req, res) => {
    const utilisateurId = req.user.id;
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
    WHERE r.utilisateurid = $1
    GROUP BY r.id
    ORDER BY r.heure_debut ASC
`,
            [utilisateurId]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: "Erreur lors de la récupération des réservations." });
    }
};

// 🔎 GET /api/reservations/:id
const getReservationById = async (req, res) => {
    const id = req.params.id;
    const utilisateurId = req.user.id;
    try {
        const result = await db.query(
            'SELECT * FROM reservation WHERE id = $1 AND utilisateurid = $2',
            [id, utilisateurId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Réservation introuvable." });
        }

        const reservation = result.rows[0];

        const personnes = await db.query(
          `
    SELECT rp.*, p.nom AS nom_prestation, p.duree_minutes, p.prix
    FROM reservation_personne rp
    JOIN prestation p ON p.id = rp.prestation_id
    WHERE rp.reservation_id = $1
`,
            [id]
        );

        reservation.personnes = personnes.rows;
        res.json(reservation);
    } catch (error) {
        res.status(500).json({ error: "Erreur lors de la récupération des détails." });
    }
};

// 🆕 POST /api/reservations
const creerReservation = async (req, res) => {
    const utilisateur_id = req.user.id;
    const {
        nom, prenom, jour, heure_debut,
        adresseReservation, telephone, departement,
        personnes
    } = req.body;
console.log("👉 Données reçues :", req.body);

    try {
        const prestationIds = personnes.map(p => p.prestation_id);
        const prestationsData = await db.query(
            `SELECT * FROM prestation WHERE id = ANY($1)`,
            [prestationIds]
        );
        const prestationsMap = {};
        prestationsData.rows.forEach(p => prestationsMap[p.id] = p);

        let soinTotal = 0;
        let dureeTotale = 0;
        let tarifTotal = 0;

        for (const p of personnes) {
            const prestation = prestationsMap[p.prestation_id];
            if (!prestation) return res.status(400).json({ error: `Prestation ID ${p.prestation_id} introuvable.` });

            const avecSoin = prestation.soin_disponible && p.avec_soin;
            if (avecSoin) soinTotal++;

            dureeTotale += prestation.duree_minutes + (avecSoin ? 10 : 0);
tarifTotal += parseFloat(prestation.prix) + (avecSoin ? 7 : 0);
        }

        dureeTotale += 15;

        const [h, m] = heure_debut.split(':').map(Number);
        const debutMinutes = h * 60 + m;
        const finMinutes = debutMinutes + dureeTotale;

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
            adresseReservation, telephone, departement,
            tarifTotal
        ]);

        const reservationId = result.rows[0].id;

        for (const p of personnes) {
            await db.query(`
                INSERT INTO reservation_personne (reservation_id, prestation_id, avec_soin, nom, prenom)
                VALUES ($1, $2, $3, $4, $5)
            `, [reservationId, p.prestation_id, p.avec_soin, p.nom, p.prenom]);
        }

        const userInfo = await db.query('SELECT email FROM utilisateur WHERE id = $1', [utilisateur_id]);
        const emailClient = userInfo.rows[0]?.email;

        const finH = String(Math.floor(finMinutes / 60)).padStart(2, '0');
        const finM = String(finMinutes % 60).padStart(2, '0');
        const heureFin = `${finH}:${finM}`;
        const dateLocale = new Date(jour).toLocaleDateString("fr-FR", {
            weekday: "long", day: "2-digit", month: "long", year: "numeric"
        });

       const resumePersonnes = personnes.map((p) => {
    const prestation = prestationsMap[p.prestation_id];
const prix = parseFloat(prestation.prix);
const prixTotalPerso = prix + (p.avec_soin ? 7 : 0);
    return `👤 ${p.nom} ${p.prenom} : ${prestation.nom} ${p.avec_soin ? "(+ soin)" : ""} - ${prixTotalPerso.toFixed(2)} €`;
}).join('\n');


        const contenuMail = `
Bonjour ${nom} ${prenom},

Votre réservation a bien été enregistrée ✅

📅 Date : ${dateLocale}
🕒 Heure : ${heure_debut} → ${heureFin}
${resumePersonnes}
💰 Tarif total : ${tarifTotal} €
📍 Adresse : ${adresseReservation}
📞 Tel : ${telephone}
        `;
        const contenuMailAdmin = `
📬 Nouvelle réservation reçue :

👤 Client : ${nom} ${prenom}
📅 Date : ${dateLocale}
🕒 Heure : ${heure_debut} → ${heureFin}
${resumePersonnes}
💰 Total : ${tarifTotal} €
📍 Adresse : ${adresseReservation}
📞 Tel : ${telephone}
`;

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        if (emailClient) {
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: emailClient,
                subject: '✔️ Confirmation de votre réservation',
                text: contenuMail
            });
        }
        await sendMail({
    to: 'mayliss.mazet24@gmail.com',
    subject: '🆕 Nouvelle réservation reçue',
    text: contenuMailAdmin
});

        res.json({ message: "Réservation enregistrée avec succès.", reservation_id: reservationId });

    } catch (error) {
        console.error("Erreur réservation :", error);
        res.status(500).json({ error: "Erreur lors de la création de la réservation." });
    }
};

// ❌ DELETE /api/reservations/:id
const annulerReservation = async (req, res) => {
    const id = req.params.id;
    const utilisateurId = req.user.id;

    try {
        // Vérifie que la réservation appartient à l'utilisateur
        const check = await db.query(
            'SELECT * FROM reservation WHERE id = $1 AND utilisateurid = $2',
            [id, utilisateurId]
        );

        if (check.rows.length === 0) {
            return res.status(404).json({ error: "Réservation introuvable ou non autorisée." });
        }

        const reservation = check.rows[0];

        // Récupération de l'e-mail du client
        const userInfo = await db.query('SELECT email FROM utilisateur WHERE id = $1', [utilisateurId]);
        const emailClient = userInfo.rows[0]?.email;

        // Formatage de l'email
        const dateLocale = new Date(reservation.jour).toLocaleDateString("fr-FR", {
            weekday: "long", day: "2-digit", month: "long", year: "numeric"
        });

        const contenuMail = `
Bonjour ${reservation.nom} ${reservation.prenom},

Votre réservation du ${dateLocale} à ${reservation.heure_debut} a bien été annulée ❌

📍 Adresse : ${reservation.adressereservation}
📞 Tel : ${reservation.telephone}

Merci de nous avoir prévenus.
À bientôt 👋
        `;

        const contenuMailAdmin = `
❌ Annulation de réservation par le client :

👤 ${reservation.nom} ${reservation.prenom}
📅 Date : ${dateLocale}
🕒 Heure : ${reservation.heure_debut}
📍 Adresse : ${reservation.adressereservation}
📞 Tel : ${reservation.telephone}
`;

        // Suppression de la réservation (ON DELETE CASCADE pour reservation_personne)
        await db.query('DELETE FROM reservation WHERE id = $1', [id]);

        // Envoi de l'email
        if (emailClient) {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });

            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: emailClient,
                subject: '❌ Réservation annulée',
                text: contenuMail
            });
        }
        await sendMail({
    to: 'mayliss.mazet24@gmail.com',
    subject: '❌ Annulation d’une réservation',
    text: contenuMailAdmin
});

        res.json({ message: "Réservation annulée et email envoyé." });

    } catch (error) {
        console.error("Erreur annulation réservation :", error);
        res.status(500).json({ error: "Erreur lors de l’annulation." });
    }
};

module.exports = {
    creerReservation,
    getMesReservations,
    getReservationById,
    annulerReservation
};