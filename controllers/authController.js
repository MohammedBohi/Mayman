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

    // ✅ Par défaut, typeutilisateur = 'Client' si rien n’est fourni
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

    const resetToken = jwt.sign({ id: user.rows[0].id }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

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
      subject: 'Réinitialisation du mot de passe',
      text: `Cliquez ici pour réinitialiser votre mot de passe : ${resetLink}`
    });

    res.json({ message: "Email de réinitialisation envoyé avec succès." });
  } catch (error) {
    console.error("Erreur demande reset :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
};

exports.reinitialiserMotDePasse = async (req, res) => {
  const { token, nouveauMotDePasse } = req.body;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    if (nouveauMotDePasse.length < 8) {
      return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caractères." });
    }

    const hashed = await bcrypt.hash(nouveauMotDePasse, 12);
    await db.query('UPDATE utilisateur SET motdepasse = $1 WHERE id = $2', [hashed, userId]);

    res.json({ message: "Mot de passe réinitialisé avec succès." });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(400).json({ error: "Lien expiré. Veuillez recommencer." });
    }

    console.error("Erreur reset :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
};