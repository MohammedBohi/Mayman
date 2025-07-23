const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middlewares/auth');
const { checkRole } = require('../middlewares/role');
const controller = require('../controllers/plageHoraireController');

// ✅ Récupérer la plage horaire d’un jour spécifique (avec ?date=YYYY-MM-DD)
router.get('/jour', authenticateUser, checkRole(['Admin']), controller.getPlageHoraireDuJour);

// ✅ Créer ou modifier une plage pour un jour
router.post('/', authenticateUser, checkRole(['Admin']), controller.creerOuModifierPlage);

// ✅ Supprimer la plage personnalisée d’un jour
router.delete('/', authenticateUser, checkRole(['Admin']), controller.supprimerPlage);

module.exports = router;