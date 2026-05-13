const db = require('../db');
const { sendMail } = require('../mailer');
const { validateMode, validateModeDepartement } = require('../utils/validations');
const { verifierLockReservation } = require('../utils/departementLock');


//  GET /api/reservations/mes
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
            `SELECT r.*, COALESCE(r.email, u.email) as email 
             FROM reservation r
             LEFT JOIN utilisateur u ON u.id = r.utilisateurid
             WHERE r.id = $1 AND r.utilisateurid = $2`,
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
    adresseReservation, telephone, 
    departement: departementParam,
    personnes, mode: modeParam
  } = req.body;
  console.log("👉 Données reçues :", req.body);

  try {
    // 🔧 EXTRACTION DU CODE DÉPARTEMENT
    let codeDepartement = null;
    if (departementParam) {
      // Si c'est un code simple (ex: "46")
      if (/^\d{2,3}$/.test(departementParam)) {
        codeDepartement = departementParam;
      } 
      // Si c'est un JSON stringifié
      else if (typeof departementParam === 'string' && departementParam.startsWith('{')) {
        try {
          const parsed = JSON.parse(departementParam);
          if (parsed.codePostal) {
            codeDepartement = parsed.codePostal.substring(0, 2);
          } else if (parsed.code) {
            codeDepartement = parsed.code;
          }
        } catch (e) {
          // Pas du JSON valide
        }
      }
      // Si c'est un objet direct
      else if (typeof departementParam === 'object') {
        if (departementParam.codePostal) {
          codeDepartement = departementParam.codePostal.substring(0, 2);
        } else if (departementParam.code) {
          codeDepartement = departementParam.code;
        }
      }
      // Si c'est un code postal (ex: "46260")
      else if (/^\d{5}$/.test(departementParam)) {
        codeDepartement = departementParam.substring(0, 2);
      }
    }

    // 🔧 DÉTECTION AUTOMATIQUE DU MODE (si non fourni)
    const dateObj = new Date(jour + 'T12:00:00');
    const jourSemaine = dateObj.getDay() || 7;

    // Vérifier exception
    const exception = await db.query(
      'SELECT * FROM planning_exception WHERE date = $1',
      [jour]
    );

    let planningActif = false;
    let planningMode = null;
    let planningId = null;
    let isException = false;

    if (exception.rows.length > 0) {
      planningActif = exception.rows[0].actif;
      planningMode = exception.rows[0].mode; // Mode détecté depuis planning
      planningId = exception.rows[0].id;
      isException = true;
    } else {
      const hebdo = await db.query(
        'SELECT * FROM planning_hebdo WHERE jour_semaine = $1',
        [jourSemaine]
      );
      if (hebdo.rows.length > 0) {
        planningActif = hebdo.rows[0].actif;
        planningMode = hebdo.rows[0].mode; // Mode détecté depuis planning
        planningId = hebdo.rows[0].id;
      }
    }

    if (!planningActif) {
      return res.status(400).json({ error: "Jour fermé ou indisponible." });
    }

    // Utiliser le mode détecté ou celui fourni par le frontend
    const mode = modeParam || planningMode;

    // VALIDATION MODE
    const validationMode = validateMode(mode);
    if (!validationMode.valid) {
      return res.status(400).json({ error: validationMode.error });
    }

    if (planningMode !== mode) {
      return res.status(400).json({ 
        error: `Ce jour est en mode ${planningMode}, pas ${mode}.` 
      });
    }

    // Vérifier département si DOMICILE
    if (mode === 'DOMICILE') {
      if (!codeDepartement) {
        return res.status(400).json({ error: "Département requis pour mode DOMICILE." });
      }

      const tableDept = isException 
        ? 'planning_exception_departement' 
        : 'planning_hebdo_departement';
      const idColumn = isException 
        ? 'planning_exception_id' 
        : 'planning_hebdo_id';
        
      const deptCheck = await db.query(
        `SELECT * FROM ${tableDept} WHERE ${idColumn} = $1 AND code_postal LIKE $2`,
        [planningId, codeDepartement + '%']
      );
      
      if (deptCheck.rows.length === 0) {
        return res.status(400).json({ 
          error: `Département ${codeDepartement} non couvert ce jour.` 
        });
      }
    }

    // CALCUL DURÉE ET TARIF
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
      if (!prestation) {
        return res.status(400).json({ error: `Prestation ID ${p.prestation_id} introuvable.` });
      }
      const avecSoin = mode === 'SALON' && prestation.soin_disponible && p.avec_soin;
      dureeTotale += prestation.duree_minutes + (avecSoin ? 15 : 0);
      tarifTotal += parseFloat(prestation.prix) + (avecSoin ? 10 : 0);
    }

    // +20 min uniquement pour le mode DOMICILE (déplacement)
    if (mode === 'DOMICILE') {
      dureeTotale += 20;
    }

    const [h, m] = heure_debut.split(':').map(Number);
    const debutMinutes = h * 60 + m;
    const finMinutes = debutMinutes + dureeTotale;

    // VÉRIFICATION CONFLITS
    const existingRes = await db.query(
      'SELECT heure_debut, duree_totale_minutes, mode, departement, nombre_personnes FROM reservation WHERE jour = $1',
      [jour]
    );
    for (const resv of existingRes.rows) {
      const [hr, mr] = resv.heure_debut.split(':').map(Number);
      const resvDebut = hr * 60 + mr;
      const resvFin = resvDebut + resv.duree_totale_minutes;

      // Conflit si les créneaux se chevauchent (mais pas s'ils se touchent juste)
      // Ex: OK si réservation1 finit à 10h30 et réservation2 commence à 10h30
      const overlap = (debutMinutes < resvFin) && (finMinutes > resvDebut);
      if (overlap) {
        return res.status(400).json({ error: "Conflit avec une autre réservation." });
      }
    }

    // VÉRIF RÈGLE DE CLUSTERING DÉPARTEMENTAL (DOMICILE) :
    // empêche un client d'un dept de prendre le créneau "adjacent" à une chaîne d'un autre dept
    if (mode === 'DOMICILE' && codeDepartement) {
      const deptLocke = verifierLockReservation(existingRes.rows, codeDepartement, debutMinutes);
      if (deptLocke) {
        return res.status(400).json({
          error: `Ce créneau est réservé au département ${deptLocke} pour optimiser les déplacements. Merci d'en choisir un autre.`
        });
      }
    }

    tarifTotal = Number(tarifTotal);
    const nombrePersonnes = personnes.length;

    // INSERTION RÉSERVATION (avec mode et nombre_personnes)
    const result = await db.query(`
      INSERT INTO reservation (
        utilisateurid, nom, prenom, jour, creneau, heure_debut, duree_totale_minutes,
        adressereservation, telephone, departement, tarif, mode, nombre_personnes
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id
    `, [
      utilisateur_id, nom, prenom, jour, heure_debut, heure_debut, dureeTotale,
      adresseReservation, telephone, mode === 'DOMICILE' ? codeDepartement : null, 
      tarifTotal, mode, nombrePersonnes
    ]);

    const reservationId = result.rows[0].id;

    for (const p of personnes) {
      await db.query(`
        INSERT INTO reservation_personne (reservation_id, prestation_id, avec_soin, nom, prenom)
        VALUES ($1, $2, $3, $4, $5)
      `, [reservationId, p.prestation_id, p.avec_soin, p.nom, p.prenom]);
    }

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
      const prix = parseFloat(prestation.prix);
      const prixTotalPerso = prix + (p.avec_soin ? 10 : 0);
      return `👤 ${p.nom} ${p.prenom} : ${prestation.nom} ${p.avec_soin ? "(+ soin)" : ""} - ${prixTotalPerso.toFixed(2)} €`;
    }).join('\n');

    const modeTexte = mode === 'SALON' ? '🏠 Au salon' : `📍 À domicile (${codeDepartement || 'département'})`;

    const contenuMail = `
Bonjour ${nom} ${prenom},

Votre réservation a bien été enregistrée ✅

📅 Date : ${dateLocale}
🕒 Heure : ${heure_debut} → ${heureFin}
${modeTexte}
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
${modeTexte}
${resumePersonnes}
💰 Total : ${tarifTotal} €
📍 Adresse : ${adresseReservation}
📞 Tel : ${telephone}
    `;

    // Répond tout de suite (ne bloque pas sur l'email)
    res.json({ message: "Réservation enregistrée avec succès.", reservation_id: reservationId });

    // Envoi des emails en arrière-plan
    setImmediate(async () => {
      try {
        if (emailClient) {
          await sendMail({
            to: emailClient,
            subject: '✔️ Confirmation de votre réservation',
            text: contenuMail
          });
        }
        await sendMail({
          to: process.env.ADMIN_EMAIL,
          subject: '🆕 Nouvelle réservation reçue',
          text: contenuMailAdmin
        });
      } catch (e) {
        console.error('Erreur envoi mail post-réponse:', e);
      }
    });

  } catch (error) {
    console.error("Erreur réservation :", error);
    res.status(500).json({ error: "Erreur lors de la création de la réservation." });
  }
};

//  DELETE /api/reservations/:id
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

    // Récup email client
    const userInfo = await db.query('SELECT email FROM utilisateur WHERE id = $1', [utilisateurId]);
    const emailClient = userInfo.rows[0]?.email || null;

    // Format email
    const dateLocale = new Date(reservation.jour).toLocaleDateString("fr-FR", {
      weekday: "long", day: "2-digit", month: "long", year: "numeric"
    });

    const contenuMailClient = `
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

    // Supprimer la réservation
    await db.query('DELETE FROM reservation WHERE id = $1', [id]);

    // Répondre tout de suite
    res.json({ message: "Réservation annulée et email envoyé." });

    //  Envoi emails après
    setImmediate(async () => {
      try {
        if (emailClient) {
          await sendMail({
            to: emailClient,
            subject: '❌ Réservation annulée',
            text: contenuMailClient
          });
        }
        await sendMail({
          to: process.env.ADMIN_EMAIL,
          subject: '❌ Annulation d’une réservation',
          text: contenuMailAdmin
        });
      } catch (e) {
        console.error('Erreur envoi mail post-réponse (annulation):', e);
      }
    });

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
