require('dotenv').config();
if (!process.env.STRIPE_SECRET_KEY) {
    console.error("❌ STRIPE_SECRET_KEY non définie !");
    process.exit(1); // Arrête le serveur si la clé est absente
}

const express = require('express');
const router = express.Router();
router.use((req, res, next) => {
    next();
});


const nodemailer = require('nodemailer');
const db = require('../db');

const { authenticateUser } = require('../middlewares/auth'); // Importer le middleware
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt'); // Si les mots de passe sont hachés
const { checkRole } = require('../middlewares/role');

router.post('/utilisateurs/inscription', async (req, res) => {
    const { nom, prenom, email, motDePasse } = req.body;

    try {
        // Vérifier si l'email existe déjà
        const existingUser = await db.query('SELECT * FROM utilisateur WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: "Email déjà utilisé." });
        }

        // Hacher le mot de passe
        const hashedPassword = await bcrypt.hash(motDePasse, 10);

        // Insérer l'utilisateur dans la base de données
        const result = await db.query(
            'INSERT INTO utilisateur (nom, prenom, email, motDePasse) VALUES ($1, $2, $3, $4) RETURNING id, nom, prenom, email',
            [nom, prenom, email, hashedPassword]
        );

        res.status(201).json({ message: "Inscription réussie.", utilisateur: result.rows[0] });
    } catch (error) {
        console.error("Erreur lors de l'inscription :", error);
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

// **Route 2: Connexion**
router.post('/utilisateurs/login', async (req, res) => {
    const { email, motDePasse } = req.body;

    try {
        // Vérifier si l'utilisateur existe
        const user = await db.query('SELECT * FROM utilisateur WHERE email = $1', [email]);
        if (user.rows.length === 0) {
            return res.status(400).json({ error: "Email ou mot de passe incorrect." });
        }

        // Vérifier le mot de passe
        const validPassword = await bcrypt.compare(motDePasse, user.rows[0].motdepasse);
        if (!validPassword) {
            return res.status(403).json({ error: "Email ou mot de passe incorrect." });
        }

        // Générer un token JWT
        const token = jwt.sign(
            { id: user.rows[0].id, email: user.rows[0].email, typeUtilisateur: user.rows[0].typeutilisateur },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        // ✅ **ENVOIE DES INFOS UTILISATEUR EN PLUS DU TOKEN**
        const utilisateur = {
            id: user.rows[0].id,
            nom: user.rows[0].nom,
            prenom: user.rows[0].prenom,
            email: user.rows[0].email,
            typeutilisateur: user.rows[0].typeutilisateur
        };

        res.json({ token, utilisateur, message: "Connexion réussie." });

    } catch (error) {
        console.error("Erreur lors du login :", error);
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});


// **Route 3: Demander un lien de réinitialisation par email**
router.post('/utilisateurs/reinitialiser-mot-de-passe', async (req, res) => {
    const { email } = req.body;

    try {
        const user = await db.query('SELECT * FROM utilisateur WHERE email = $1', [email]);
        if (user.rows.length === 0) {
            return res.status(404).json({ error: "Email non trouvé." });
        }

        const resetToken = jwt.sign(
            { id: user.rows[0].id },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Réinitialisation du mot de passe',
            text: `Cliquez sur ce lien pour réinitialiser votre mot de passe : ${resetLink}`
        });

        res.json({ message: "Email de réinitialisation envoyé avec succès." });
    } catch (error) {
        console.error("Erreur lors de la demande de réinitialisation :", error);
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});
router.put('/utilisateurs/reinitialiser-mot-de-passe', async (req, res) => {
    const { token, nouveauMotDePasse } = req.body;

    try {
        // ✅ Vérifier que le token est valide et non expiré
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const utilisateurId = decoded.id;

        // ✅ Vérifier si l'utilisateur existe avant de changer le mot de passe
        const userCheck = await db.query('SELECT * FROM utilisateur WHERE id = $1', [utilisateurId]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: "Utilisateur non trouvé." });
        }

        // ✅ Vérification de la complexité du mot de passe
        if (nouveauMotDePasse.length < 8) {
            return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caractères." });
        }

        // ✅ Hacher le mot de passe de manière sécurisée
        const hashedPassword = await bcrypt.hash(nouveauMotDePasse, 12);

        // ✅ Mettre à jour le mot de passe
        await db.query('UPDATE utilisateur SET motDePasse = $1 WHERE id = $2', [hashedPassword, utilisateurId]);

        res.json({ message: "Mot de passe réinitialisé avec succès." });

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(400).json({ error: "Le lien de réinitialisation a expiré. Veuillez en demander un nouveau." });
        }

        console.error("❌ Erreur lors de la réinitialisation du mot de passe :", error);
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

router.post('/reservations', authenticateUser, async (req, res) => {
    const { nom, prenom, prestation, tarif, jour, creneau, adresseReservation, telephone, departement } = req.body;
    const typePaiement = "Sur place"; // Assurer que c'est bien un paiement sur place

    try {
        const utilisateurId = req.user.id; // ID du client connecté

        // ✅ Vérifier si le créneau est déjà réservé
        const existing = await db.query(
            'SELECT * FROM reservation WHERE jour = $1 AND creneau = $2',
            [jour, creneau]
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: "Ce créneau est déjà réservé." });
        }

        // ✅ Enregistrement de la réservation avec paiement "Sur place"
        const result = await db.query(
            `INSERT INTO reservation (utilisateurId, nom, prenom, prestation, tarif, jour, creneau, adresseReservation, telephone, typePaiement, departement)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [utilisateurId, nom, prenom, prestation, tarif, jour, creneau, adresseReservation, telephone, typePaiement, departement]
        );

        // ✅ Configuration du service de messagerie
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const emailUtilisateur = {
            from: process.env.EMAIL_USER,
            to: req.user.email, 
            subject: '✔️ Confirmation de votre réservation',
            text: `Bonjour ${nom} ${prenom},\n\nVotre réservation a bien été enregistrée ! 🎉\n\n📌 Détails :\n- 🏷 Prestation : ${prestation}\n- 💰 Tarif : ${tarif}€\n- 📅 Date : ${jour}\n- ⏰ Créneau : ${creneau}\n- 📍 Adresse : ${adresseReservation}\n- 💳 Paiement : ${typePaiement} (en espèce) \n\nMerci pour votre confiance !\n⚠️ En cas d'empêchement ou si vous souhaitez modifier votre rendez-vous, veuillez nous en informer le plus tôt possible.\n\n
📞 Numéro de téléphone : +33 7 68 44 16 10\n
📧 Adresse e-mail : mayliss.mazet24@gmail.com\n\n
Merci pour votre confiance !\n
L'équipe May'Man.`
        };

        await transporter.sendMail(emailUtilisateur);

        const emailAdmin = {
            from: process.env.EMAIL_USER,
            to: 'mayliss.mazet24@gmail.com', 
            subject: ' Nouvelle réservation',
            text: `📢 Une nouvelle réservation a été effectuée :\n\n- 👤 Client : ${nom} ${prenom}\n- 🏷 Prestation : ${prestation}\n- 💰 Tarif : ${tarif}€\n- 📅 Date : ${jour}\n- ⏰ Créneau : ${creneau}\n- 📍 Adresse : ${adresseReservation}\n- 📞 Téléphone : ${telephone}\n- 💳 Paiement : ${typePaiement}\n- 📌 Département : ${departement}\n\n📌 Vérifiez votre tableau de bord.`
        };

        await transporter.sendMail(emailAdmin);

        res.json({
            message: "✅ Réservation enregistrée avec succès. Un email a été envoyé.",
            reservation: result.rows[0]
        });

    } catch (error) {
        console.error("❌ Erreur lors de la création de la réservation :", error);
        res.status(500).json({ error: "Erreur lors de la création de la réservation." });
    }
});



// **Route : Récupérer les créneaux disponibles pour un jour**
router.get('/reservations/creneaux/:jour', async (req, res) => {
    const { jour } = req.params;
    const now = new Date();

    // ✅ Générer les créneaux avec un intervalle de 45 minutes

    const generateHoraires = (debut, fin) => {
        const horaires = [];
        let heure = debut;
        let minutes = 0;
    
        while (heure < fin || (heure === fin && minutes === 0)) { 
            const formattedHour = heure.toString().padStart(2, '0');
            const formattedMinutes = minutes.toString().padStart(2, '0');
            horaires.push(`${formattedHour}:${formattedMinutes}`);
    
            minutes += 45;
            if (minutes >= 60) { // ✅ Quand ça dépasse 60 min, on passe à l'heure suivante
                minutes -= 60;
                heure += 1;
            }
    
            // ✅ Stopper à 20:45 MAX (fin = 21h donc dernier créneau = 20:45)
            if (heure === fin && minutes > 0) {
                break;
            }
        }
    
        return horaires;
    };
    

    const horaires = generateHoraires(9, 20.5); // De 09:00 à 20:00


    try {
        // ✅ Récupérer les créneaux déjà réservés pour la date demandée
        const reservations = await db.query('SELECT creneau FROM reservation WHERE jour = $1', [jour]);

        // ✅ Conversion propre des créneaux réservés
        const creneauxReserves = reservations.rows.map(r => {
            const creneau = r.creneau instanceof Date
                ? r.creneau.toTimeString().slice(0, 5) // 🔥 Format HH:MM
                : r.creneau.slice(0, 5); // Si déjà une string

            return creneau.padStart(5, '0'); // 🔥 Uniformisation
        });


        // ✅ Vérifier les créneaux disponibles avec correction du format
        const creneauxDisponibles = horaires.filter(creneau => {
            const formattedCreneau = creneau.padStart(5, '0'); // 🔥 Uniformisation du format
            const selectedDate = new Date(`${jour}T${formattedCreneau}:00`);
            const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
            const isSameDay = now.toISOString().split('T')[0] === jour;

            return (
                !creneauxReserves.includes(formattedCreneau) && // ✅ Correction du filtre
                (isSameDay ? selectedDate > oneHourFromNow : true) // Appliquer le délai d'une heure seulement pour aujourd'hui
            );
        });


        res.json(creneauxDisponibles);
    } catch (error) {
        console.error("❌ Erreur lors de la récupération des créneaux :", error);
        res.status(500).json({ error: "Erreur lors de la récupération des créneaux disponibles." });
    }
});
// récupérer les réservations des jours pour l'admin 
router.get('/admin/reservations/:jour', authenticateUser, checkRole(['Admin']), async (req, res) => {
    const { jour } = req.params;

    try {

        // Récupérer toutes les réservations pour ce jour
        const result = await db.query(`
            SELECT id, nom, prenom, prestation, tarif, creneau, adresseReservation, telephone, typePaiement, departement
            FROM reservation
            WHERE jour = $1
            ORDER BY creneau ASC
        `, [jour]);


        res.json(result.rows); // Retourne la liste des réservations
    } catch (error) {
        console.error("❌ Erreur lors de la récupération des réservations :", error);
        res.status(500).json({ error: "Erreur lors de la récupération des réservations." });
    }
});


// Route pour supprimer une réservation (client)
router.delete('/reservations/:id', authenticateUser, checkRole(['Client']), async (req, res) => {
    const { id } = req.params;
    const utilisateurId = req.user.id; // Récupérer l'ID de l'utilisateur connecté

    try {
        // Récupérer la réservation avec les détails du client
        const reservation = await db.query(
            `SELECT r.*, 
                    u.email AS clientEmail, 
                    u.nom AS clientNom, 
                    u.prenom AS clientPrenom
             FROM reservation r
             INNER JOIN utilisateur u ON r.utilisateurId = u.id
             WHERE r.id = $1 AND r.utilisateurId = $2`,
            [id, utilisateurId]
        );

        if (reservation.rows.length === 0) {
            return res.status(403).json({ error: "Vous n'êtes pas autorisé à annuler cette réservation ou elle n'existe pas." });
        }

        const reservationDetails = reservation.rows[0];

        const clientEmail = reservationDetails.clientemail;
        const clientNom = reservationDetails.clientnom;
        const clientPrenom = reservationDetails.clientprenom;


        if (!clientEmail) {
            console.error("Erreur : L'adresse e-mail du client est introuvable.");
            return res.status(500).json({ error: "Impossible de récupérer l'e-mail du client." });
        }

        // **Formater la date proprement**
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const formattedDate = new Date(reservationDetails.jour).toLocaleDateString('fr-FR', options);

        // Supprimer la réservation
        await db.query('DELETE FROM reservation WHERE id = $1', [id]);

        // Configurer le service d'envoi d'emails
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        // **Email au client**
        const emailClient = {
            from: process.env.EMAIL_USER,
            to: clientEmail,
            subject: 'Annulation de votre réservation',
            text: `Bonjour ${clientPrenom} ${clientNom},

Votre réservation a été annulée avec succès.

📌 Détails de votre réservation annulée :**  
- 🏷 Prestation : ${reservationDetails.prestation}  
- 📅 Date : ${formattedDate}  
- ⏰ Créneau : ${reservationDetails.creneau}  

Merci pour votre compréhension.

L'équipe May'Man.`
        };

        // **Email à l'admin**
        const emailAdmin = {
            from: process.env.EMAIL_USER,
            to: 'mayliss.mazet24@gmail.com',
            subject: 'Annulation d\'une réservation',
            text: `Une réservation a été annulée :

- Client : ${clientPrenom} ${clientNom}
- Prestation : ${reservationDetails.prestation}
- Date : ${formattedDate}
- Créneau : ${reservationDetails.creneau}

Vérifiez votre tableau de bord pour plus d'informations.`
        };

        // Envoyer les emails avec gestion des erreurs
        try {
            await transporter.sendMail(emailClient);
        } catch (err) {
            console.error("❌ Erreur lors de l'envoi de l'email au client :", err);
        }

        try {
            await transporter.sendMail(emailAdmin);
        } catch (err) {
            console.error("❌ Erreur lors de l'envoi de l'email à l'admin :", err);
        }

        res.json({ message: "✅ Réservation annulée avec succès. Un email a été envoyé au client et à l'admin." });
    } catch (error) {
        console.error("❌ Erreur lors de l'annulation de la réservation :", error);
        res.status(500).json({ error: "Erreur lors de l'annulation de la réservation." });
    }
});


// Route pour supprimer une réservation (Admin)
router.delete('/admin/reservations/:id', authenticateUser, checkRole(['Admin']), async (req, res) => {

    const { id } = req.params;

    try {
        // Récupérer la réservation
        const reservation = await db.query(
            `SELECT r.*, 
                    u.email AS clientEmail, 
                    u.nom AS clientNom, 
                    u.prenom AS clientPrenom
             FROM reservation r
             INNER JOIN utilisateur u ON r.utilisateurId = u.id
             WHERE r.id = $1`,
            [id]
        );


        if (reservation.rows.length === 0) {
            console.error("❌ Réservation non trouvée !");
            return res.status(404).json({ error: "Réservation non trouvée." });
        }

        const reservationDetails = reservation.rows[0];

        const clientEmail = reservationDetails.clientemail;
        const clientNom = reservationDetails.clientnom;
        const clientPrenom = reservationDetails.clientprenom;


        if (!clientEmail) {
            console.error("❌ Erreur : L'adresse e-mail du client est introuvable.");
            return res.status(500).json({ error: "Impossible de récupérer l'e-mail du client." });
        }

        // **Formater la date proprement**
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const formattedDate = new Date(reservationDetails.jour).toLocaleDateString('fr-FR', options);

        // Supprimer la réservation
        await db.query('DELETE FROM reservation WHERE id = $1', [id]);

        // Configurer le service d'envoi d'emails
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        // **Email au client**
        const emailClient = {
            from: process.env.EMAIL_USER,
            to: clientEmail,
            subject: 'Annulation de votre réservation',
            text: `Bonjour ${clientPrenom} ${clientNom},

Votre réservation a été annulée par l'administrateur.

📌 Détails de la réservation annulée : 
- 🏷 Prestation : ${reservationDetails.prestation}  
- 📅 Date : ${formattedDate}  
- ⏰ Créneau :${reservationDetails.creneau}  

Merci pour votre compréhension.

L'équipe May'Man.`
        };

        // **Email à l'admin**
        const emailAdmin = {
            from: process.env.EMAIL_USER,
            to: 'mayliss.mazet24@gmail.com',
            subject: 'Annulation d\'une réservation',
            text: `Une réservation a été annulée par vous :

- Client : ${clientPrenom} ${clientNom}
- Prestation : ${reservationDetails.prestation}
- Date : ${formattedDate}
- Créneau : ${reservationDetails.creneau}

Vérifiez votre tableau de bord pour plus d'informations.`
        };

        // Envoyer les emails avec gestion des erreurs
        try {
            await transporter.sendMail(emailClient);
        } catch (err) {
            console.error("❌ Erreur lors de l'envoi de l'email au client :", err);
        }

        try {
            await transporter.sendMail(emailAdmin);
        } catch (err) {
            console.error("❌ Erreur lors de l'envoi de l'email à l'admin :", err);
        }

        res.json({ message: "✅ Réservation annulée avec succès. Un email a été envoyé au client et à l'admin." });
    } catch (error) {
        console.error("❌ Erreur lors de l'annulation de la réservation par l'admin :", error);
        res.status(500).json({ error: "Erreur lors de l'annulation de la réservation." });
    }
});



// **Route : Créer un PaymentIntent**
router.post('/paiement/initier', authenticateUser, async (req, res) => {
    const { nom, prenom, prestation, tarif, jour, creneau, adresseReservation, telephone, departement } = req.body;

    try {

        const utilisateurId = req.user.id;

        // ✅ Vérifier si le créneau est encore dispo
        const existing = await db.query(
            'SELECT * FROM reservation WHERE jour = $1 AND creneau = $2',
            [jour, creneau]
        );
        if (existing.rows.length > 0) {
            console.error("⚠️ Ce créneau est déjà réservé.");
            return res.status(400).json({ error: "Ce créneau est déjà réservé." });
        }

        if (isNaN(tarif) || tarif <= 0) {
            console.error("❌ Tarif invalide !");
            return res.status(400).json({ error: "Tarif invalide." });
        }
        try {
            const testStripe = await stripe.balance.retrieve();
        } catch (error) {
            console.error("❌ Erreur de connexion à Stripe :", error);
            return res.status(500).json({ error: "Problème de connexion avec Stripe." });
        }
       ;
        



        // ✅ Création de la session Stripe Checkout
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            success_url: `http://localhost:8081/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `http://localhost:8081/cancel`,
            customer_email: req.user.email, // Email de l'utilisateur
            line_items: [
                {
                    price_data: {
                        currency: 'eur',
                        product_data: {
                            name: prestation,
                            description: `Prestation : ${prestation}, Date : ${jour}, Créneau : ${creneau}`
                        },
                        unit_amount: tarif * 100, // Converti en centimes
                    },
                    quantity: 1,
                },
            ],
            metadata: {
                utilisateurId, nom, prenom, prestation, tarif, jour, creneau, adresseReservation, telephone, departement
            }
        })
;
     
          
          if (!session || !session.id) {
            console.error("❌ ERREUR : Session Stripe non créée !");
            return res.status(500).json({ error: "Impossible de créer la session Stripe." });
          }
        return res.json({
            message: "💳 Paiement en attente, redirection vers Stripe.",
            url: session.url, // ✅ Retourne l'URL Stripe
            session_id: session.id  // ✅ Correction ici

        });
       
        
        
    } catch (error) {
        console.error("❌ Erreur lors de l'initialisation du paiement :", error);
        res.status(500).json({ error: "Erreur lors de l'initialisation du paiement." });
    }

});

router.get('/paiement/statut/:sessionId', authenticateUser, async (req, res) => {
    const { sessionId } = req.params;

    if (!sessionId || sessionId === "undefined") {  
        console.error("❌ sessionId est invalide !");
        return res.status(400).json({ error: "sessionId invalide ou manquant." });
    }
    
    try {
        // ✅ Récupérer la session Stripe Checkout
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        // Vérifier si le paiement est validé
        if (!session || !["paid", "complete"].includes(session.payment_status)) {
            console.warn("⚠️ Paiement non validé !");
            return res.status(400).json({ error: "⚠️ Paiement non validé ou annulé." });
        }
        

        // Vérifier la présence des métadonnées Stripe
        if (!session.metadata) {
            console.error("❌ ERREUR : Les métadonnées Stripe sont absentes !");
            return res.status(500).json({ error: "Erreur interne : Métadonnées manquantes." });
        }

        // Extraction sécurisée des données
        const utilisateurId = session.metadata.utilisateurId || null;
        const nom = session.metadata.nom || "Inconnu";
        const prenom = session.metadata.prenom || "Inconnu";
        const prestation = session.metadata.prestation || "Inconnue";
        const tarif = session.metadata.tarif || 0;
        const jour = session.metadata.jour || null;
        const creneau = session.metadata.creneau || null;
        const adresseReservation = session.metadata.adresseReservation || "Non spécifiée";
        const telephone = session.metadata.telephone || "Non fourni";
        const departement = session.metadata.departement || "Non spécifié";
        const clientEmail = session.customer_email || null;


        if (!utilisateurId || !jour || !creneau) {
            console.error("❌ ERREUR : Données essentielles manquantes !");
            return res.status(500).json({ error: "Données essentielles manquantes pour créer la réservation." });
        }

        // ✅ Vérifier que la réservation n'existe pas déjà
        if (!session || !["paid", "complete"].includes(session.payment_status)) {
            console.warn("⚠️ Paiement non validé !");
            return res.status(400).json({ error: "⚠️ Paiement non validé ou annulé." });
        }
        
        // ✅ Paiement validé, on crée la réservation !
        

        // ✅ Insertion de la réservation
        const result = await db.query(
            `INSERT INTO reservation (utilisateurId, nom, prenom, prestation, tarif, jour, creneau, adresseReservation, telephone, typePaiement, departement)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'En ligne', $10) RETURNING *`,
            [utilisateurId, nom, prenom, prestation, tarif, jour, creneau, adresseReservation, telephone, departement]
        );

        if (!result.rowCount || result.rowCount === 0) { 
            console.error("❌ ERREUR : L'insertion en base de données a échoué !");
            return res.status(500).json({ error: "Erreur lors de la création de la réservation en base de données." });
        }

        const reservation = result.rows[0];

        // ✅ Configuration du transporteur d'email
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        // ✅ Envoi d'email de confirmation au client
        if (!clientEmail) {
            console.error("❌ ERREUR : L'email du client est introuvable !");
        } else {
            try {
                const emailClient = {
                    from: process.env.EMAIL_USER,
                    to: clientEmail,
                    subject: '✔️ Confirmation de votre réservation',
                    text: `Bonjour ${nom} ${prenom},\n\nVotre réservation a bien été enregistrée après votre paiement en ligne ! 🎉\n\n📌 Détails :\n- 🏷 Prestation : ${prestation}\n- 💰 Tarif : ${tarif}€\n- 📅 Date : ${jour}\n- ⏰ Créneau : ${creneau}\n- 📍 Adresse : ${adresseReservation}\n- 💳 Paiement : En ligne\n\n⚠️ En cas d'empêchement ou si vous souhaitez modifier votre rendez-vous, veuillez nous en informer le plus tôt possible.\n\n
📞 Numéro de téléphone : +33 7 68 44 16 10\n
📧 Adresse e-mail : mayliss.mazet24@gmail.com\n\n
Merci pour votre confiance !\n
L'équipe May'Man.`
                };
                await transporter.sendMail(emailClient);
            } catch (error) {
                console.error("❌ Erreur lors de l'envoi de l'email client :", error);
            }
        }

        // ✅ Envoi d'email à l'admin (coiffeuse)
        try {
            const emailAdmin = {
                from: process.env.EMAIL_USER,
                to: 'mayliss.mazet24@gmail.com', // 🔥 Remplace par l'email de l'admin si besoin
                subject: '⚡ Nouvelle réservation après paiement en ligne',
                text: `📢 Une nouvelle réservation a été validée après paiement :\n\n- 👤 Client : ${nom} ${prenom}\n- 🏷 Prestation : ${prestation}\n- 💰 Tarif : ${tarif}€\n- 📅 Date : ${jour}\n- ⏰ Créneau : ${creneau}\n- 📍 Adresse : ${adresseReservation}\n- 📞 Téléphone : ${telephone}\n- 💳 Paiement : En ligne\n- 📌 Département :${departement}`
            };
            await transporter.sendMail(emailAdmin);
        } catch (error) {
            console.error("❌ Erreur lors de l'envoi de l'email admin :", error);
        }

        res.json({ message: "✅ Réservation confirmée après paiement.", reservation });

    } catch (error) {
        console.error("❌ Erreur lors de la validation du paiement :", error);
        res.status(500).json({ error: "Erreur lors de la validation du paiement." });
    }
});


router.get('/utilisateurs/profil', authenticateUser, async (req, res) => {
    try {
        const utilisateur = await db.query(
            'SELECT id, nom, prenom, email, typeutilisateur FROM utilisateur WHERE id = $1',
            [req.user.id]
        );

        if (utilisateur.rows.length === 0) {
            return res.status(404).json({ error: "Utilisateur non trouvé." });
        }

        res.json(utilisateur.rows[0]); // Renvoie les infos de l'utilisateur connecté
    } catch (error) {
        console.error("Erreur lors de la récupération du profil :", error);
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

// **Exporter les routes**
module.exports = router;
