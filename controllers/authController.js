require('dotenv').config();
const db = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

exports.inscrireUtilisateur = async (req, res) => {
  const { nom, prenom, email, motdepasse, typeutilisateur } = req.body;

  try {
    const existing = await db.query('SELECT * FROM utilisateur WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Email déjà utilisé." });
    }

    //  Par défaut, typeutilisateur = 'Client' si rien n’est fourni
    const typeFinal = typeutilisateur || 'Client';

    // Sécurité minimale : seuls 'Admin' et 'Client' sont acceptés
    if (!['Admin', 'Client'].includes(typeFinal)) {
      return res.status(400).json({ error: "Type d'utilisateur invalide." });
    }

    const hashed = await bcrypt.hash(motdepasse, 10);

    const result = await db.query(
      `INSERT INTO utilisateur (nom, prenom, email, motdepasse, typeutilisateur)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nom, prenom, email, typeutilisateur`,
      [nom, prenom, email, hashed, typeFinal]
    );

    res.status(201).json({ message: "Inscription réussie.", utilisateur: result.rows[0] });
  } catch (error) {
    console.error("Erreur inscription :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
};


exports.connecterUtilisateur = async (req, res) => {
  const { email, motdepasse } = req.body;

  try {
    const user = await db.query('SELECT * FROM utilisateur WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      return res.status(400).json({ error: "Email ou mot de passe incorrect." });
    }

    const match = await bcrypt.compare(motdepasse, user.rows[0].motdepasse);
 

    if (!match) {
      return res.status(403).json({ error: "Email ou mot de passe incorrect." });
    }

    const token = jwt.sign(
      { id: user.rows[0].id, email: user.rows[0].email, typeutilisateur: user.rows[0].typeutilisateur },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const utilisateur = {
      id: user.rows[0].id,
      nom: user.rows[0].nom,
      prenom: user.rows[0].prenom,
      email: user.rows[0].email,
      typeutilisateur: user.rows[0].typeutilisateur
    };

    res.json({ token, utilisateur, message: "Connexion réussie." });
  } catch (error) {
    console.error("Erreur login :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
};

exports.demanderResetMotDePasse = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await db.query('SELECT * FROM utilisateur WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: "Email non trouvé." });
    }

    // Générer un code de reset 6 chiffres
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const resetExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Stocker le code en base (nouveau champ reset_code et reset_expiry)
    await db.query(
      'UPDATE utilisateur SET reset_code = $1, reset_expiry = $2 WHERE id = $3',
      [resetCode, resetExpiry, user.rows[0].id]
    );

    // Envoyer l'email avec le code
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: '🔐 Code de réinitialisation du mot de passe',
      text: `Bonjour ${user.rows[0].prenom} ${user.rows[0].nom},\n\nVoici votre code de réinitialisation : ${resetCode}\n\nCe code expire dans 15 minutes.\n\nSi vous n'avez pas demandé cette réinitialisation, ignorez cet email.\n\nÀ bientôt 👋`
    });

    res.json({ message: "Code de réinitialisation envoyé par email." });
  } catch (error) {
    console.error("Erreur demande reset :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
};

exports.reinitialiserMotDePasse = async (req, res) => {
  const { email, code, nouveauMotDePasse } = req.body;

  try {
    const user = await db.query('SELECT * FROM utilisateur WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: "Email non trouvé." });
    }

    const userData = user.rows[0];

    // Vérifier le code et son expiration
    if (!userData.reset_code || userData.reset_code !== code) {
      return res.status(400).json({ error: "Code incorrect." });
    }

    if (new Date() > new Date(userData.reset_expiry)) {
      return res.status(400).json({ error: "Code expiré. Demandez une nouvelle réinitialisation." });
    }

    if (!nouveauMotDePasse || nouveauMotDePasse.length < 8) {
      return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caractères." });
    }

    // Hasher le nouveau mot de passe
    const hashed = await bcrypt.hash(nouveauMotDePasse, 12);

    // Mettre à jour et vider le code de reset
    await db.query(
      'UPDATE utilisateur SET motdepasse = $1, reset_code = NULL, reset_expiry = NULL WHERE id = $2',
      [hashed, userData.id]
    );

    res.json({ message: "Mot de passe réinitialisé avec succès." });

    // Envoi email de confirmation après réponse
    setImmediate(async () => {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });

        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: userData.email,
          subject: '✅ Mot de passe réinitialisé',
          text: `Bonjour ${userData.prenom} ${userData.nom},\n\nVotre mot de passe a bien été modifié avec succès ✅\n\nSi vous n'êtes pas à l'origine de cette modification, contactez-nous immédiatement.\n\nÀ bientôt 👋`
        });
      } catch (e) {
        console.error('Erreur envoi email confirmation mot de passe:', e);
      }
    });

  } catch (error) {
    console.error("Erreur reset :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
};

exports.changerMotDePasse = async (req, res) => {
  const { ancienMotDePasse, nouveauMotDePasse } = req.body;
  const userId = req.user.id; // Récupéré du middleware d'authentification

  try {
    // Validation du nouveau mot de passe
    if (!nouveauMotDePasse || nouveauMotDePasse.length < 8) {
      return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caractères." });
    }

    // Récupération de l'utilisateur
    const user = await db.query('SELECT * FROM utilisateur WHERE id = $1', [userId]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    // Vérification de l'ancien mot de passe
    const match = await bcrypt.compare(ancienMotDePasse, user.rows[0].motdepasse);
    if (!match) {
      return res.status(403).json({ error: "Ancien mot de passe incorrect." });
    }

    // Hasher le nouveau mot de passe
    const hashed = await bcrypt.hash(nouveauMotDePasse, 12);

    // Mise à jour en base de données
    await db.query('UPDATE utilisateur SET motdepasse = $1 WHERE id = $2', [hashed, userId]);

    res.json({ message: "Mot de passe modifié avec succès." });

    // Envoi email de confirmation après réponse
    setImmediate(async () => {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });

        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: user.rows[0].email,
          subject: '🔐 Mot de passe modifié',
          text: `Bonjour ${user.rows[0].prenom} ${user.rows[0].nom},\n\nVotre mot de passe a bien été modifié avec succès ✅\n\nSi vous n'êtes pas à l'origine de cette modification, contactez-nous immédiatement.\n\nÀ bientôt 👋`
        });
      } catch (e) {
        console.error('Erreur envoi email confirmation changement mdp:', e);
      }
    });

  } catch (error) {
    console.error("Erreur changement mot de passe :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
};