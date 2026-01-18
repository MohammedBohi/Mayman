const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middlewares/auth');

const {
  inscrireUtilisateur,
  connecterUtilisateur,
  demanderResetMotDePasse,
  reinitialiserMotDePasse,
  changerMotDePasse
} = require('../controllers/authController');

// 🔐 Auth
router.post('/register', inscrireUtilisateur);
router.post('/login', connecterUtilisateur);
// Route de profil connecté
router.get('/profil', authenticateUser, (req, res) => {
  res.json(req.user);
});

// Mot de passe oublié / reset
router.post('/reset-password', demanderResetMotDePasse);
router.put('/reset-password', reinitialiserMotDePasse);

// Changer mot de passe (utilisateur connecté)
router.put('/changer-motdepasse', authenticateUser, changerMotDePasse);

module.exports = router;